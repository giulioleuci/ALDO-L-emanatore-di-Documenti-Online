import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { GeneratoreAxis, type TipoPiano } from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';
import type { DocumentGenerationService } from './DocumentGenerationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';

/** Job type under which the batch handler is registered in JobRunnerLib. */
export const JOB_TYPE_GENERAZIONE_DOCUMENTI = 'GENERAZIONE_DOCUMENTI_CLASSI';

interface DocumentConfigLookup {
  findById(id: string): ConfigurazioneDocumento | null;
}

export interface PianoBatchTarget {
  studente: string;
  tipo: TipoPiano;
}

export interface DocenteClasseMateriaBatchTarget {
  classe: string;
  docenteEmail: string;
  materiaId: string;
}

export interface ClasseMateriaBatchTarget {
  classe: string;
  materiaId: string;
}

export interface ClasseDocenteBatchTarget {
  classe: string;
  docenteEmail: string;
}

export interface DocenteBatchTarget {
  docenteEmail: string;
  classiCompetenza: string[];
}

export interface AlunnoBatchTarget {
  email: string;
}

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
interface BatchResumeState {
  confDocId: string;
  jobId: string;
  nextIndex: number;
  processed: string[];
  errori: string[];
  planTargets?: PianoBatchTarget[];
  docenteClasseMateriaTargets?: DocenteClasseMateriaBatchTarget[];
  /** Historical checkpoint key kept only to resume jobs suspended before Task 6. */
  docenteMateriaTargets?: DocenteClasseMateriaBatchTarget[];
  classeMateriaTargets?: ClasseMateriaBatchTarget[];
  classeDocenteTargets?: ClasseDocenteBatchTarget[];
  docenteTargets?: DocenteBatchTarget[];
  alunnoTargets?: AlunnoBatchTarget[];
}
export interface BatchCheckpoint extends BatchResumeState {
  percentage: number;
}
interface BatchResult {
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
     * by generateDocentiClasseMateria, generateClassiMateria, generateClasseDocente,
     * and generateDocenti — a raw IClasseRepository.getConsiglioDiClasse
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
    const resume = (params.resumeState ?? null) as BatchResumeState | null;
    const confDocId = String(params.confDocId ?? resume?.confDocId ?? '');
    const jobId = String(params.jobId ?? resume?.jobId ?? confDocId);
    if (resume !== null && !resume.confDocId) {
      throw new ConfigurationError('Stato di ripresa documenti privo di confDocId');
    }
    const processed = resume === null ? [] : resume.processed.slice();
    const errori = resume === null ? [] : resume.errori.slice();
    const config = this.configs.findById(confDocId);

    if (config === null) {
      throw new ConfigurationError(`CONF_DOC ${confDocId} non trovato`);
    }
    if (
      config.tipo === 'PIANO_PERS' &&
      config.generatore !== GeneratoreAxis.PIANO_PERSONALIZZATO
    ) {
      throw new ConfigurationError(
        `CONF_DOC ${confDocId} ha TIPO PIANO_PERS ma GENERATORE ${config.generatore} (atteso PIANO_PERSONALIZZATO)`
      );
    }
    if (config.generatore === GeneratoreAxis.PIANO_PERSONALIZZATO) {
      if (config.tipo !== 'PIANO_PERS') {
        throw new ConfigurationError(`CONF_DOC ${confDocId} deve avere TIPO PIANO_PERS`);
      }
      return yield* this.generatePiani(config, confDocId, jobId, resume, processed, errori);
    }
    switch (config.generatore) {
      case GeneratoreAxis.CLASSE_DOCENTE_MATERIA:
        return yield* this.generateDocentiClasseMateria(
          config,
          confDocId,
          jobId,
          resume,
          processed,
          errori
        );
      case GeneratoreAxis.CLASSE_MATERIA:
        return yield* this.generateClassiMateria(config, confDocId, jobId, resume, processed, errori);
      case GeneratoreAxis.CLASSE_DOCENTE:
        return yield* this.generateClasseDocente(config, confDocId, jobId, resume, processed, errori);
      case GeneratoreAxis.DOCENTE:
        return yield* this.generateDocenti(config, confDocId, jobId, resume, processed, errori);
      case GeneratoreAxis.DIPARTIMENTO:
        return yield* this.generateDipartimenti(confDocId, jobId, resume, processed, errori);
      case GeneratoreAxis.ALUNNO:
        return yield* this.generateAlunni(confDocId, jobId, resume, processed, errori);
      case GeneratoreAxis.CLASSE:
      default:
        return yield* this.generateClassi(config, confDocId, jobId, resume, processed, errori);
    }
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
        confDocId,
        jobId,
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

  /** One document per (docente, materia) cattedra of every active class's council (batch mirror of DocumentGenerationService.generateForDocenteClasseMateria). */
  private *generateDocentiClasseMateria(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let targets: DocenteClasseMateriaBatchTarget[];
    if (resume === null) {
      targets = [];
      // DocenteClasseMateriaBatchTarget is (classe, docenteEmail, materiaId), where
      // materiaId is specifica-qualified (BASE.SPECIFICA) when the slot has a
      // specifica — mirroring SheetMaterieGeneratorStrategy.catalogId(). A
      // docente teaching two specifics of the same family (e.g. INTERPRET.CHITARRA
      // and INTERPRET.FLAUTO) now gets two separate targets, one per composite id.
      // Slots differing only by *kind* (STANDARD vs ITP on the same materiaId)
      // still collapse to one target here by design — extending the batch axis
      // to carry kind is out of scope; dedup keeps the first match, mirroring
      // DocenteClasseMateriaFocusProvider's own first-match `materie.find` semantics.
      const seen = new Set<string>();
      const attive = this.classi.filterPerGestioneArticolazione(
        this.classi.findAttive(),
        config.gestioneArticolazione
      );
      for (const classe of attive) {
        // Role-resolved (SUPPLENZE/VARIAZIONI_CATTEDRA/CLASSI), not the raw
        // IClasseRepository.getConsiglioDiClasse nominal cattedre — an active
        // substitution/variation must enumerate the current teacher, same
        // council data DocenteClasseMateriaFocusProvider matches against downstream
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
      const persistedTargets =
        resume.docenteClasseMateriaTargets ?? resume.docenteMateriaTargets;
      if (persistedTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target docente/materia persistiti`
        );
      }
      targets = persistedTargets.map((t) => ({ ...t }));
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
        const result = this.documenti.generateForDocenteClasseMateria(
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
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        docenteClasseMateriaTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(
      jobId,
      `${processed.length} documenti docente/materia elaborati, ${errori.length} errori`
    );
    return { success, totale: targets.length, processed, errori };
  }

  /** One document per (classe, materia), regardless of how many teachers hold that slot. */
  private *generateClassiMateria(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let targets: ClasseMateriaBatchTarget[];
    if (resume === null) {
      targets = [];
      const seen = new Set<string>();
      const attive = this.classi.filterPerGestioneArticolazione(
        this.classi.findAttive(),
        config.gestioneArticolazione
      );
      for (const classe of attive) {
        const assignments = this.teachingAssignments.resolveConsiglio(classe, this.now, {
          includeReligioneAlt: true
        });
        for (const assignment of assignments) {
          const classeId = classe.id ?? '';
          const materiaId =
            assignment.slot.specifica === null
              ? assignment.slot.materia.value
              : `${assignment.slot.materia.value}.${assignment.slot.specifica}`;
          const key = `${classeId}:${materiaId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({ classe: classeId, materiaId });
        }
      }
    } else {
      if (resume.classeMateriaTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target classe/materia persistiti`
        );
      }
      targets = resume.classeMateriaTargets.map((target) => ({ ...target }));
    }

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(targets.length);

    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const target = targets[i]!;
      const targetId = `${target.classe}:${target.materiaId}`;
      this.logger?.logItemStart(i + 1, targets.length, 'Target', targetId, 'DOCUMENT');
      let message: string;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForClasseMateria(
          ClasseId.of(target.classe),
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
          { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
        );
        message = `Errore ${i + 1}/${targets.length} ${targetId}: ${reason}`;
      }
      processed.push(targetId);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        classeMateriaTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(
      jobId,
      `${processed.length} documenti classe/materia elaborati, ${errori.length} errori`
    );
    return { success, totale: targets.length, processed, errori };
  }

  private *generateClasseDocente(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let targets: ClasseDocenteBatchTarget[];
    if (resume === null) {
      targets = [];
      const seen = new Set<string>();
      const attive = this.classi.filterPerGestioneArticolazione(
        this.classi.findAttive(),
        config.gestioneArticolazione
      );
      for (const classe of attive) {
        for (const assignment of this.teachingAssignments.resolveConsiglio(classe, this.now, {
          includeReligioneAlt: true
        })) {
          const classeId = classe.id ?? '';
          const docenteEmail = assignment.docenteEffettivo.email.value;
          const key = `${classeId}:${docenteEmail}`;
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({ classe: classeId, docenteEmail });
        }
      }
    } else {
      if (resume.classeDocenteTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target classe/docente persistiti`
        );
      }
      targets = resume.classeDocenteTargets.map((target) => ({ ...target }));
    }

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(targets.length);

    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const target = targets[i]!;
      const targetId = `${target.classe}:${target.docenteEmail}`;
      this.logger?.logItemStart(i + 1, targets.length, 'Target', targetId, 'DOCUMENT');
      let message: string;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForClasseDocente(
          ClasseId.of(target.classe),
          target.docenteEmail,
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
          { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
        );
        message = `Errore ${i + 1}/${targets.length} ${targetId}: ${reason}`;
      }
      processed.push(targetId);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        classeDocenteTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(
      jobId,
      `${processed.length} documenti classe/docente elaborati, ${errori.length} errori`
    );
    return { success, totale: targets.length, processed, errori };
  }

  private *generateDocenti(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let targets: DocenteBatchTarget[];
    if (resume === null) {
      const classiPerDocente = new Map<string, Set<string>>();
      const attive = this.classi.filterPerGestioneArticolazione(
        this.classi.findAttive(),
        config.gestioneArticolazione
      );
      for (const classe of attive) {
        const classeId = classe.id ?? '';
        for (const assignment of this.teachingAssignments.resolveConsiglio(classe, this.now, {
          includeReligioneAlt: true
        })) {
          const docenteEmail = assignment.docenteEffettivo.email.value;
          const classi = classiPerDocente.get(docenteEmail) ?? new Set<string>();
          classi.add(classeId);
          classiPerDocente.set(docenteEmail, classi);
        }
      }
      targets = [...classiPerDocente.entries()].map(([docenteEmail, classi]) => ({
        docenteEmail,
        classiCompetenza: [...classi]
      }));
    } else {
      if (resume.docenteTargets === undefined) {
        throw new ConfigurationError(`Stato di ripresa ${confDocId} privo dei target docente persistiti`);
      }
      targets = resume.docenteTargets.map((target) => ({
        docenteEmail: target.docenteEmail,
        classiCompetenza: [...target.classiCompetenza]
      }));
    }

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(targets.length);

    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const target = targets[i]!;
      this.logger?.logItemStart(i + 1, targets.length, 'Target', target.docenteEmail, 'DOCUMENT');
      let message: string;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForDocente(
          target.docenteEmail,
          target.classiCompetenza,
          confDocId,
          jobId
        );
        const name = result.fileName ?? target.docenteEmail;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${target.docenteEmail}: ${reason}`);
        this.logger?.logSummary(
          'Document failed',
          Math.max(0, Date.now() - itemStartedAt),
          `${target.docenteEmail}: ${reason}`,
          { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
        );
        message = `Errore ${i + 1}/${targets.length} ${target.docenteEmail}: ${reason}`;
      }
      processed.push(target.docenteEmail);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        docenteTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(jobId, `${processed.length} docenti elaborati, ${errori.length} errori`);
    return { success, totale: targets.length, processed, errori };
  }

  private *generateAlunni(
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let targets: AlunnoBatchTarget[];
    if (resume === null) {
      targets = this.alunni.findAttivi().map((alunno) => ({ email: alunno.email.value }));
    } else {
      if (resume.alunnoTargets === undefined) {
        throw new ConfigurationError(`Stato di ripresa ${confDocId} privo dei target alunno persistiti`);
      }
      targets = resume.alunnoTargets.map((target) => ({ ...target }));
    }

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(targets.length);

    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const email = targets[i]!.email;
      this.logger?.logItemStart(i + 1, targets.length, 'Target', email, 'DOCUMENT');
      let message = `Generazione documento alunno ${email}`;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForAlunno(email, confDocId, jobId);
        const name = result.fileName ?? email;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${email}: ${reason}`);
        this.logger?.logSummary(
          'Document failed',
          Math.max(0, Date.now() - itemStartedAt),
          `${email}: ${reason}`,
          { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
        );
        message = `Errore: ${reason} (alunno ${email})`;
      }
      processed.push(email);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        alunnoTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(jobId, `${processed.length} alunni elaborati, ${errori.length} errori`);
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
      yield {
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice()
      };
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
      yield {
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice()
      };
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
