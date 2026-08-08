import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { TipoPiano } from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';
import type { DocumentGenerationService } from './DocumentGenerationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';

/** Job type under which the batch handler is registered in JobRunnerLib. */
export const JOB_TYPE_GENERAZIONE_DOCUMENTI = 'GENERAZIONE_DOCUMENTI_CLASSI';
export const CONF_DOC_PIANI_PERSONALIZZATI = 'PIANI_PERSONALIZZATI';

interface DocumentConfigLookup {
  findById(id: string): ConfigurazioneDocumento | null;
}

export interface PianoBatchTarget {
  studente: string;
  tipo: TipoPiano;
}

export interface DocenteMateriaBatchTarget {
  classe: string;
  docenteEmail: string;
  materiaId: string;
}

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
export interface BatchResumeState {
  nextIndex: number;
  processed: string[];
  errori: string[];
  planTargets?: PianoBatchTarget[];
  docenteMateriaTargets?: DocenteMateriaBatchTarget[];
}
export interface BatchCheckpoint extends BatchResumeState {
  percentage: number;
}
export interface BatchResult {
  success: boolean;
  totale: number;
  processed: string[];
  errori: string[];
}

/**
 * Batch document generation over all active classes, or over every plan owned
 * by an active student for the dedicated PIANI config (ref 10, 12). GAS caps
 * execution at 6/30 minutes, so the batch is a generator-function JobRunnerLib
 * (L3) handler. The library checks the clock at each `yield`, persists the
 * yielded checkpoint to ScriptProperties before suspension, schedules the
 * resume trigger and re-enters the generator with `params.resumeState`.
 * Only business iteration and the stable target snapshot live here.
 *
 * Per-element error isolation (15 §8): a single class or plan failure is
 * recorded in `errori` without aborting the batch or marking the whole job
 * FAILED. Invalid PIANI configuration and malformed PIANI resume state are
 * instead fatal because the batch cannot determine a valid target set.
 */
export class DocumentBatchService {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly configs: DocumentConfigLookup,
    private readonly documenti: DocumentGenerationService,
    /** Role-resolved (SUPPLENZE/VARIAZIONI_CATTEDRA/CLASSI) council, used only
     * by generateDocentiMateria — a raw IClasseRepository.getConsiglioDiClasse
     * read would enumerate the stale nominal teacher on an active
     * substitution/cattedra variation, silently skipping the actually-current
     * one (fix round 1). */
    private readonly teachingAssignments: ITeachingAssignmentResolver,
    /** Injected clock for the same role-resolution call — must be deterministic, never the system clock. */
    private readonly now: Date,
    /** Enumerates DIPART rows for the DIPARTIMENTO batch axis (generateDipartimenti). */
    private readonly dipartimenti: IDipartimentoRepository,
    private readonly monitor?: IProcessMonitor,
    private readonly logger?: LoggerService
  ) {}

  /** JobRunnerLib handler: one checkpoint per class or personalized plan. */
  *batchGenerateHandler(
    params: JobHandlerParams & { confDocId?: string; jobId?: string }
  ): Generator<BatchCheckpoint, BatchResult, void> {
    const confDocId = String(params.confDocId ?? '');
    const jobId = String(params.jobId ?? confDocId);
    const resume = (params.resumeState ?? null) as BatchResumeState | null;
    const processed = resume === null ? [] : resume.processed.slice();
    const errori = resume === null ? [] : resume.errori.slice();
    const config = this.configs.findById(confDocId);

    if (config === null) {
      throw new ConfigurationError(`CONF_DOC ${confDocId} non trovato`);
    }
    if (confDocId === CONF_DOC_PIANI_PERSONALIZZATI && config.tipo !== 'PIANO_PERS') {
      throw new ConfigurationError(`CONF_DOC ${confDocId} deve avere TIPO PIANO_PERS`);
    }
    if (config.tipo === 'PIANO_PERS') {
      return yield* this.generatePiani(config, confDocId, jobId, resume, processed, errori);
    }
    if (config.tipo === 'DOCUMENTO_DOCENTE_MATERIA') {
      return yield* this.generateDocentiMateria(config, confDocId, jobId, resume, processed, errori);
    }
    if (config.tipo === 'DIPARTIMENTO') {
      return yield* this.generateDipartimenti(confDocId, jobId, resume, processed, errori);
    }

    return yield* this.generateClassi(config, confDocId, jobId, resume, processed, errori);
  }

  private *generatePiani(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    if (config.tipo !== 'PIANO_PERS') {
      throw new ConfigurationError(`CONF_DOC ${confDocId} deve avere TIPO PIANO_PERS`);
    }

    let targets: PianoBatchTarget[];
    if (resume === null) {
      targets = [];
      for (const alunno of this.alunni.findAttivi()) {
        for (const piano of this.alunni.getPiani(alunno)) {
          targets.push({ studente: alunno.email.value, tipo: piano.tipo });
        }
      }
    } else {
      if (resume.planTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target piano persistiti`
        );
      }
      targets = resume.planTargets.map((target) => ({ ...target }));
    }

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(targets.length);

    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const target = targets[i]!;
      const targetId = `${target.studente}:${target.tipo}`;
      this.logger?.logItemStart(
        i + 1,
        targets.length,
        'Target',
        targetId,
        'DOCUMENT'
      );
      let message: string;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForPiano(
          target.studente,
          target.tipo,
          confDocId,
          jobId
        );
        const name = result.fileName ?? targetId;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${targetId}: ${reason}`);
        this.logger?.logSummary(
          'Document failed',
          Math.max(0, Date.now() - itemStartedAt),
          `${targetId}: ${reason}`,
          {
            depth: 1,
            isLast: true,
            ancestorHasNext: [i + 1 < targets.length]
          }
        );
        message = `Errore piano ${i + 1}/${targets.length} ${targetId}: ${reason}`;
      }
      processed.push(targetId);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        planTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(
      jobId,
      `${processed.length} piani elaborati, ${errori.length} errori`
    );
    return { success, totale: targets.length, processed, errori };
  }

  /** One document per (docente, materia) cattedra of every active class's council (batch mirror of DocumentGenerationService.generateForClasseDocenteMateria). */
  private *generateDocentiMateria(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let targets: DocenteMateriaBatchTarget[];
    if (resume === null) {
      targets = [];
      // DocenteMateriaBatchTarget is (classe, docenteEmail, materiaId), where
      // materiaId is specifica-qualified (BASE.SPECIFICA) when the slot has a
      // specifica — mirroring SheetMaterieGeneratorStrategy.catalogId(). A
      // docente teaching two specifics of the same family (e.g. INTERPRET.CHITARRA
      // and INTERPRET.FLAUTO) now gets two separate targets, one per composite id.
      // Slots differing only by *kind* (STANDARD vs ITP on the same materiaId)
      // still collapse to one target here by design — extending the batch axis
      // to carry kind is out of scope; dedup keeps the first match, mirroring
      // DocenteMateriaFocusProvider's own first-match `materie.find` semantics.
      const seen = new Set<string>();
      const attive = this.classi.filterPerGestioneArticolazione(
        this.classi.findAttive(),
        config.gestioneArticolazione
      );
      for (const classe of attive) {
        // Role-resolved (SUPPLENZE/VARIAZIONI_CATTEDRA/CLASSI), not the raw
        // IClasseRepository.getConsiglioDiClasse nominal cattedre — an active
        // substitution/variation must enumerate the current teacher, same
        // council data DocenteMateriaFocusProvider matches against downstream
        // (fix round 1: the two previously diverged). includeReligioneAlt:
        // true mirrors resolveCouncilForProjection's call
        // (TeachingCouncilProjection.ts) — without it, AldoTeachingAssignmentResolver
        // silently skips IS_RELIGIONE_ALT materie (IRC/attività alternativa)
        // entirely, so a docente teaching only one of those would never be
        // enumerated as a batch target at all (fix round 2). routingPolicy is
        // intentionally NOT passed: it only affects TeachingAssignment.routing
        // .{primary,cc,bcc} (communication-channel categorization of the SAME
        // delegation chain — RoleResolutionLib's RoutingResolver/RoutingPolicy,
        // see GasLibraryFactory/DOCS_LIBS/RoleResolutionLib.md), never
        // `docenteEffettivo`/`slot`, the only two fields this enumeration
        // reads — so it has no bearing on which (docente, materia) targets
        // get generated here.
        const assignments = this.teachingAssignments.resolveConsiglio(classe, this.now, {
          includeReligioneAlt: true
        });
        for (const assignment of assignments) {
          const classeId = classe.id ?? '';
          const docenteEmail = assignment.docenteEffettivo.email.value;
          const materiaId =
            assignment.slot.specifica === null
              ? assignment.slot.materia.value
              : `${assignment.slot.materia.value}.${assignment.slot.specifica}`;
          const key = `${classeId}:${materiaId}:${docenteEmail}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          targets.push({ classe: classeId, docenteEmail, materiaId });
        }
      }
    } else {
      if (resume.docenteMateriaTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target docente/materia persistiti`
        );
      }
      targets = resume.docenteMateriaTargets.map((t) => ({ ...t }));
    }

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(targets.length);

    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const target = targets[i]!;
      const targetId = `${target.classe}:${target.materiaId}:${target.docenteEmail}`;
      this.logger?.logItemStart(i + 1, targets.length, 'Target', targetId, 'DOCUMENT');
      let message: string;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForClasseDocenteMateria(
          ClasseId.of(target.classe),
          target.docenteEmail,
          target.materiaId,
          confDocId,
          jobId
        );
        const name = result.fileName ?? targetId;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${targetId}: ${reason}`);
        this.logger?.logSummary(
          'Document failed',
          Math.max(0, Date.now() - itemStartedAt),
          `${targetId}: ${reason}`,
          {
            depth: 1,
            isLast: true,
            ancestorHasNext: [i + 1 < targets.length]
          }
        );
        message = `Errore ${i + 1}/${targets.length} ${targetId}: ${reason}`;
      }
      processed.push(targetId);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        docenteMateriaTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(
      jobId,
      `${processed.length} documenti docente/materia elaborati, ${errori.length} errori`
    );
    return { success, totale: targets.length, processed, errori };
  }

  /** One document per department (e.g. "verbale di dipartimento") — no gestioneArticolazione, a department has no class dimension. */
  private *generateDipartimenti(
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    const tutti = this.dipartimenti.findAll();
    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(tutti.length);

    for (let i = resume?.nextIndex ?? 0; i < tutti.length; i++) {
      const dipartimento = tutti[i]!;
      const id = dipartimento.id ?? '?';
      this.logger?.logItemStart(i + 1, tutti.length, 'Target', id, 'DOCUMENT');
      let message = `Generazione documento dipartimento ${id}`;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForDipartimento(id, confDocId, jobId);
        const name = result.fileName ?? id;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < tutti.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${id}: ${reason}`);
        this.logger?.logSummary('Document failed', Math.max(0, Date.now() - itemStartedAt), `${id}: ${reason}`, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < tutti.length]
        });
        message = `Errore: ${reason} (dipartimento ${id})`;
      }
      processed.push(id);
      const percentage = ((i + 1) / tutti.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield { percentage, nextIndex: i + 1, processed: processed.slice(), errori: errori.slice() };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(jobId, `${processed.length} dipartimenti elaborati, ${errori.length} errori`);
    return { success, totale: tutti.length, processed, errori };
  }

  private *generateClassi(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    const attive = this.classi.filterPerGestioneArticolazione(
      this.classi.findAttive(),
      config.gestioneArticolazione
    );
    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(attive.length);

    for (let i = resume?.nextIndex ?? 0; i < attive.length; i++) {
      const classe = attive[i]!;
      this.logger?.logItemStart(
        i + 1,
        attive.length,
        'Target',
        classe.id ?? '?',
        'DOCUMENT'
      );
      let message = `Generazione documento classe ${classe.id ?? '?'}`;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForClasse(classe.classeId, confDocId, jobId);
        const name = result.fileName ?? classe.id ?? '?';
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < attive.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${classe.id ?? '?'}: ${reason}`);
        this.logger?.logSummary(
          'Document failed',
          Math.max(0, Date.now() - itemStartedAt),
          `${classe.id ?? '?'}: ${reason}`,
          {
            depth: 1,
            isLast: true,
            ancestorHasNext: [i + 1 < attive.length]
          }
        );
        message = `Errore: ${reason} (classe ${classe.id ?? '?'})`;
      }
      processed.push(classe.id ?? '');
      const percentage = ((i + 1) / attive.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield { percentage, nextIndex: i + 1, processed: processed.slice(), errori: errori.slice() };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(
      jobId,
      `${processed.length} classi elaborate, ${errori.length} errori`
    );
    return { success, totale: attive.length, processed, errori };
  }

  private static documentOutcome(status: string): string {
    return status === 'GENERATO'
      ? 'Document generated'
      : status === 'SKIPPED'
        ? 'Document skipped'
        : 'Document failed';
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_GENERAZIONE_DOCUMENTI, (params) =>
      this.batchGenerateHandler(params)
    );
  }

  /** Starts the batch through JobRunnerLib (state + resume triggers managed by the library). */
  start(
    runner: JobRunnerService,
    jobName: string,
    confDocId: string,
    forceRestart = false,
    maxDurationMs?: number
  ): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_GENERAZIONE_DOCUMENTI,
      { confDocId, jobId: jobName },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }
}
