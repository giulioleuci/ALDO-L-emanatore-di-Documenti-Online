import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { GeneratoreAxis, StatoJob } from '../../domain/value-objects/enums';
import { ConfigurationError, EntityNotFoundError } from '../../domain/errors/DomainError';
import type { DocumentGenerationService } from './DocumentGenerationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { ILogJobRepository } from '../../domain/repositories/ILogJobRepository';
import type { IActiveUserFacade } from '../../infrastructure/facades/ActiveUserFacade';
import {
  targetsAlunni,
  targetsClasse,
  targetsClasseDocente,
  targetsClasseDocenteMateria,
  targetsClasseMateria,
  targetsDipartimenti,
  targetsDocenti,
  targetsPiani,
  type AlunnoBatchTarget,
  type ClasseDocenteBatchTarget,
  type ClasseMateriaBatchTarget,
  type DocenteBatchTarget,
  type DocenteClasseMateriaBatchTarget,
  type PianoBatchTarget
} from './axisTargets';
import { dettagliSaltati, totaleSaltati, type Saltati } from './saltati';

export type {
  AlunnoBatchTarget,
  ClasseDocenteBatchTarget,
  ClasseMateriaBatchTarget,
  DocenteBatchTarget,
  DocenteClasseMateriaBatchTarget,
  PianoBatchTarget
};

/** Job type under which the batch handler is registered in JobRunnerLib. */
export const JOB_TYPE_GENERAZIONE_DOCUMENTI = 'GENERAZIONE_DOCUMENTI_CLASSI';

interface DocumentConfigLookup {
  findById(id: string): ConfigurazioneDocumento | null;
}

/** Human-readable job type shown in the end-of-job report (see `logJobReport`). */
export const JOB_LABEL_GENERAZIONE_DOCUMENTI = 'GENERAZIONE DOCUMENTI';

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
interface BatchResumeState {
  confDocId: string;
  jobId: string;
  nextIndex: number;
  processed: string[];
  errori: string[];
  /** Number of container executions (1 = no trigger resume yet) this job launch has run across — see `runCount` doc on `runBatchJob`. */
  runCount?: number;
  /** Cumulative real (busy) execution time in ms across every run of this job launch — see `runBatchJob`. */
  totalDurationMs?: number;
  /** Email of the user who launched the job originally, propagated across every resume (LOG_JOB.ESEGUITO_DA, ref NEW_TABLE_LOG_JOB.md). */
  eseguitoDa?: string;
  /** ISO start timestamp of the execution that yielded this checkpoint — used to backfill a SOSPESO_TEMPO LOG_JOB row on the next resume, since JobRunnerLib's timeout cuts the generator off before it can log anything itself (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). */
  esecuzioneIniziata?: string;
  /** Cumulative SKIPPED targets per reason across every run — counted in `processed`, excluded from LOG_JOB.COMPLETATI_OK. */
  saltati?: Saltati;
  planTargets?: PianoBatchTarget[];
  docenteClasseMateriaTargets?: DocenteClasseMateriaBatchTarget[];
  /** Historical checkpoint key kept only to resume jobs suspended before Task 6. */
  docenteMateriaTargets?: DocenteClasseMateriaBatchTarget[];
  classeMateriaTargets?: ClasseMateriaBatchTarget[];
  classeDocenteTargets?: ClasseDocenteBatchTarget[];
  docenteTargets?: DocenteBatchTarget[];
  alunnoTargets?: AlunnoBatchTarget[];
  /** ID delle classi bersaglio, congelati alla prima run (audit 2026-09-05 §3). */
  classeTargets?: string[];
  /** ID dei dipartimenti bersaglio, congelati alla prima run (audit 2026-09-05 §3). */
  dipartimentoTargets?: string[];
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

/** Minimal contract the shared batch loop needs from each axis's generation call. */
interface GeneratedDocument {
  fileName: string | null;
  status: string;
  durationMs: number;
  skipReason?: string;
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
    private readonly logger?: LoggerService,
    private readonly logJob?: ILogJobRepository,
    private readonly activeUser?: IActiveUserFacade
  ) {}

  /** Container-execution start time for the run currently in progress (see `runBatchJob` doc). */
  private containerStartedAt = Date.now();
  /** Number of container executions (including this one) this job launch has run across. */
  private runCount = 1;
  /** Cumulative real (busy) execution time in ms from every prior run of this job launch. */
  private priorDurationMs = 0;
  /** LOG_JOB.ESEGUITO_DA for the run currently in progress — set once at generator entry, see `batchGenerateHandler`. */
  private eseguitoDa = '';
  /** LOG_JOB.INIZIO for the run currently in progress (ISO) — set once at generator entry. */
  private esecuzioneIniziata = '';
  /** LOG_JOB.NOME_CONFIG for the run currently in progress (CONF_DOC.TIPO) — set once at generator entry. */
  private nomeConfig = '';
  /** Cumulative skipped targets per reason — seeded from the checkpoint at generator entry. */
  private saltati: Saltati = {};

  /** Prior runs' busy time plus elapsed time in the run currently in progress. */
  private elapsedTotalMs(): number {
    return this.priorDurationMs + (Date.now() - this.containerStartedAt);
  }

  /** JobRunnerLib handler: one checkpoint per class or personalized plan. */
  *batchGenerateHandler(
    params: JobHandlerParams & { confDocId?: string; jobId?: string; eseguitoDa?: string }
  ): Generator<BatchCheckpoint, BatchResult, void> {
    const resume = (params.resumeState ?? null) as BatchResumeState | null;
    this.containerStartedAt = Date.now();
    this.runCount = (resume?.runCount ?? 0) + 1;
    this.priorDurationMs = resume?.totalDurationMs ?? 0;
    this.eseguitoDa = String(params.eseguitoDa ?? resume?.eseguitoDa ?? '');
    this.esecuzioneIniziata = new Date(this.containerStartedAt).toISOString();
    this.saltati = { ...(resume?.saltati ?? {}) };
    const confDocId = String(params.confDocId ?? resume?.confDocId ?? '');
    const jobId = String(params.jobId ?? resume?.jobId ?? confDocId);
    if (resume !== null && !resume.confDocId) {
      throw new ConfigurationError('Stato di ripresa documenti privo di confDocId');
    }
    const processed = resume === null ? [] : resume.processed.slice();
    const errori = resume === null ? [] : resume.errori.slice();

    try {
      const config = this.configs.findById(confDocId);

      if (config === null) {
        throw new ConfigurationError(`CONF_DOC ${confDocId} non trovato`);
      }
      this.nomeConfig = config.tipo;
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
          return yield* this.generateClassiMateria(
            config,
            confDocId,
            jobId,
            resume,
            processed,
            errori
          );
        case GeneratoreAxis.CLASSE_DOCENTE:
          return yield* this.generateClasseDocente(
            config,
            confDocId,
            jobId,
            resume,
            processed,
            errori
          );
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_GENERAZIONE_DOCUMENTI,
        idConfig: confDocId,
        nomeConfig: this.nomeConfig,
        stato: StatoJob.FALLITO,
        totaleTask: 0,
        completatiOk: 0,
        falliti: 0,
        listaFallimenti: [reason],
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      throw error;
    }
  }

  /**
   * Shared batch-job telemetry: register/start the job (only on a fresh, non-resumed
   * run), log the batch header, delegate to `body` for the per-target loop (which
   * yields the resumable checkpoints), then complete the job and return the
   * aggregate result. `body` runs with `this` bound to the service so it can still
   * call `this.documenti`/`this.logger`/`this.monitor` as before extraction.
   */
  /** Backfills the SOSPESO_TEMPO row for the execution JobRunnerLib just cut off — the app generator never gets a chance to log at the actual timeout, so this runs once, at the start of the resume that picks the job back up (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). */
  private backfillSospesoTempo(
    jobId: string,
    confDocId: string,
    totale: number,
    resume: BatchResumeState
  ): void {
    if (resume.esecuzioneIniziata === undefined) return;
    const fine = new Date().toISOString();
    const durataSec = Math.max(
      0,
      (Date.parse(fine) - Date.parse(resume.esecuzioneIniziata)) / 1000
    );
    this.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 2,
      tipo: JOB_TYPE_GENERAZIONE_DOCUMENTI,
      idConfig: confDocId,
      nomeConfig: this.nomeConfig,
      stato: StatoJob.SOSPESO_TEMPO,
      totaleTask: totale,
      completatiOk: Math.max(
        0,
        resume.processed.length - resume.errori.length - totaleSaltati(resume.saltati)
      ),
      falliti: resume.errori.length,
      listaFallimenti: resume.errori,
      durataSec,
      inizio: resume.esecuzioneIniziata,
      fine,
      eseguitoDa: resume.eseguitoDa ?? ''
    });
  }

  private *runBatchJob(
    jobId: string,
    confDocId: string,
    resume: BatchResumeState | null,
    totale: number,
    processed: string[],
    errori: string[],
    entityLabel: string,
    body: (this: DocumentBatchService) => Generator<BatchCheckpoint, void, void>
  ): Generator<BatchCheckpoint, BatchResult, void> {
    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    } else if (this.runCount >= 2) {
      this.backfillSospesoTempo(jobId, confDocId, totale, resume);
    }
    this.logger?.logBatchStart(totale);

    yield* body.call(this);

    const success = errori.length === 0;
    this.monitor?.completeJob(jobId, `${processed.length} ${entityLabel}, ${errori.length} errori`);
    this.logger?.logJobReport({
      jobType: JOB_LABEL_GENERAZIONE_DOCUMENTI,
      runCount: this.runCount,
      totalDurationMs: this.elapsedTotalMs(),
      totale,
      falliti: errori.length,
      dettagliFalliti: errori,
      saltati: totaleSaltati(this.saltati),
      dettagliSaltati: dettagliSaltati(this.saltati)
    });
    this.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 1,
      tipo: JOB_TYPE_GENERAZIONE_DOCUMENTI,
      idConfig: confDocId,
      nomeConfig: this.nomeConfig,
      stato: success ? StatoJob.COMPLETATO : StatoJob.COMPLETATO_CON_ERRORI,
      totaleTask: totale,
      completatiOk: processed.length - errori.length - totaleSaltati(this.saltati),
      falliti: errori.length,
      listaFallimenti: errori,
      durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
      inizio: this.esecuzioneIniziata,
      fine: new Date().toISOString(),
      eseguitoDa: this.eseguitoDa
    });
    return { success, totale, processed, errori };
  }

  /**
   * Shared per-target loop for every document-batch axis: item logging, the
   * generate try/catch with per-element error isolation (15 §8), progress
   * update and the resumable checkpoint. Axis-specific parts are injected —
   * the target snapshot (`targets`), its persistent checkpoint field (`extra`),
   * the target id, the generation call and the progress error message.
   */
  private *iterateTargets<T>(
    jobId: string,
    confDocId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[],
    targets: readonly T[],
    targetId: (target: T) => string,
    generate: (target: T, confDocId: string, jobId: string) => GeneratedDocument,
    onError: (targetId: string, reason: string, index: number, total: number) => string,
    extra: Partial<BatchResumeState>
  ): Generator<BatchCheckpoint, void, void> {
    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const target = targets[i]!;
      const id = targetId(target);
      this.logger?.logItemStart(i + 1, targets.length, 'Target', id, 'DOCUMENT');
      let message: string;
      const itemStartedAt = Date.now();
      try {
        const result = generate(target, confDocId, jobId);
        const name = result.fileName ?? id;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        if (result.skipReason !== undefined) {
          this.saltati[result.skipReason] = (this.saltati[result.skipReason] ?? 0) + 1;
        }
        const detail = result.skipReason === undefined ? name : `${name} — ${result.skipReason}`;
        this.logger?.logSummary(outcome, result.durationMs, detail, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `${outcome}: ${detail} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${id}: ${reason}`);
        this.logger?.logSummary(
          '❌ Document failed',
          Math.max(0, Date.now() - itemStartedAt),
          `${id}: ${reason}`,
          { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
        );
        message = onError(id, reason, i, targets.length);
      }
      processed.push(id);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        confDocId,
        jobId,
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        runCount: this.runCount,
        totalDurationMs: this.elapsedTotalMs(),
        eseguitoDa: this.eseguitoDa,
        esecuzioneIniziata: this.esecuzioneIniziata,
        saltati: { ...this.saltati },
        ...extra
      };
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
      targets = targetsPiani(this.alunni);
    } else {
      if (resume.planTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target piano persistiti`
        );
      }
      targets = resume.planTargets.map((target) => ({ ...target }));
    }

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      targets.length,
      processed,
      errori,
      'piani elaborati',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          targets,
          (target) => `${target.studente}:${target.tipo}`,
          (target) =>
            this.documenti.generateForPiano(target.studente, target.tipo, confDocId, jobId),
          (targetId, reason, index, total) =>
            `Errore piano ${index + 1}/${total} ${targetId}: ${reason}`,
          { planTargets: targets }
        )
    );
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
      targets = targetsClasseDocenteMateria(
        this.classi,
        this.teachingAssignments,
        this.now,
        config.gestioneArticolazione
      );
    } else {
      const persistedTargets = resume.docenteClasseMateriaTargets ?? resume.docenteMateriaTargets;
      if (persistedTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target docente/materia persistiti`
        );
      }
      targets = persistedTargets.map((t) => ({ ...t }));
    }

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      targets.length,
      processed,
      errori,
      'documenti docente/materia elaborati',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          targets,
          (target) => `${target.classe}:${target.materiaId}:${target.docenteEmail}`,
          (target) =>
            this.documenti.generateForDocenteClasseMateria(
              ClasseId.of(target.classe),
              target.docenteEmail,
              target.materiaId,
              confDocId,
              jobId
            ),
          (targetId, reason, index, total) =>
            `Errore ${index + 1}/${total} ${targetId}: ${reason}`,
          { docenteClasseMateriaTargets: targets }
        )
    );
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
      targets = targetsClasseMateria(
        this.classi,
        this.teachingAssignments,
        this.now,
        config.gestioneArticolazione
      );
    } else {
      if (resume.classeMateriaTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target classe/materia persistiti`
        );
      }
      targets = resume.classeMateriaTargets.map((target) => ({ ...target }));
    }

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      targets.length,
      processed,
      errori,
      'documenti classe/materia elaborati',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          targets,
          (target) => `${target.classe}:${target.materiaId}`,
          (target) =>
            this.documenti.generateForClasseMateria(
              ClasseId.of(target.classe),
              target.materiaId,
              confDocId,
              jobId
            ),
          (targetId, reason, index, total) =>
            `Errore ${index + 1}/${total} ${targetId}: ${reason}`,
          { classeMateriaTargets: targets }
        )
    );
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
      targets = targetsClasseDocente(
        this.classi,
        this.teachingAssignments,
        this.now,
        config.gestioneArticolazione
      );
    } else {
      if (resume.classeDocenteTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target classe/docente persistiti`
        );
      }
      targets = resume.classeDocenteTargets.map((target) => ({ ...target }));
    }

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      targets.length,
      processed,
      errori,
      'documenti classe/docente elaborati',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          targets,
          (target) => `${target.classe}:${target.docenteEmail}`,
          (target) =>
            this.documenti.generateForClasseDocente(
              ClasseId.of(target.classe),
              target.docenteEmail,
              confDocId,
              jobId
            ),
          (targetId, reason, index, total) =>
            `Errore ${index + 1}/${total} ${targetId}: ${reason}`,
          { classeDocenteTargets: targets }
        )
    );
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
      targets = targetsDocenti(this.classi, this.teachingAssignments, this.now, config.gestioneArticolazione);
    } else {
      if (resume.docenteTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target docente persistiti`
        );
      }
      targets = resume.docenteTargets.map((target) => ({
        docenteEmail: target.docenteEmail,
        classiCompetenza: [...target.classiCompetenza]
      }));
    }

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      targets.length,
      processed,
      errori,
      'docenti elaborati',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          targets,
          (target) => target.docenteEmail,
          (target) =>
            this.documenti.generateForDocente(
              target.docenteEmail,
              target.classiCompetenza,
              confDocId,
              jobId
            ),
          (targetId, reason, index, total) =>
            `Errore ${index + 1}/${total} ${targetId}: ${reason}`,
          { docenteTargets: targets }
        )
    );
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
      targets = targetsAlunni(this.alunni);
    } else {
      if (resume.alunnoTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target alunno persistiti`
        );
      }
      targets = resume.alunnoTargets.map((target) => ({ ...target }));
    }

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      targets.length,
      processed,
      errori,
      'alunni elaborati',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          targets,
          (target) => target.email,
          (target) =>
            this.documenti.generateForAlunno(target.email, confDocId, jobId),
          (targetId, reason) => `Errore: ${reason} (alunno ${targetId})`,
          { alunnoTargets: targets }
        )
    );
  }

  /** One document per department (e.g. "verbale di dipartimento") — no gestioneArticolazione, a department has no class dimension. */
  private *generateDipartimenti(
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let tutti: string[];
    if (resume === null) {
      tutti = targetsDipartimenti(this.dipartimenti);
    } else {
      if (resume.dipartimentoTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target dipartimento persistiti`
        );
      }
      tutti = resume.dipartimentoTargets.slice();
    }

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      tutti.length,
      processed,
      errori,
      'dipartimenti elaborati',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          tutti,
          (id) => id,
          (id) => this.documenti.generateForDipartimento(id, confDocId, jobId),
          (targetId, reason) => `Errore: ${reason} (dipartimento ${targetId})`,
          { dipartimentoTargets: tutti }
        )
    );
  }

  private *generateClassi(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let attive: Array<Classe | null>;
    let classeTargets: string[];
    if (resume === null) {
      const classi = targetsClasse(this.classi, config.gestioneArticolazione);
      attive = classi;
      classeTargets = classi.map((classe) => classe.id ?? '');
    } else {
      if (resume.classeTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target classe persistiti`
        );
      }
      classeTargets = resume.classeTargets.slice();
      attive = classeTargets.map((id) => this.classi.findById(ClasseId.of(id)));
    }
    const classeById = new Map<string, Classe | null>(classeTargets.map((id, i) => [id, attive[i]!]));

    return yield* this.runBatchJob(
      jobId,
      confDocId,
      resume,
      classeTargets.length,
      processed,
      errori,
      'classi elaborate',
      () =>
        this.iterateTargets(
          jobId,
          confDocId,
          resume,
          processed,
          errori,
          classeTargets,
          (id) => id,
          (id) => {
            const classe = classeById.get(id) ?? null;
            if (classe === null) {
              throw new EntityNotFoundError('classe non più presente in CLASSI — saltata');
            }
            return this.documenti.generateForClasse(classe.classeId, confDocId, jobId);
          },
          (targetId, reason) => `Errore: ${reason} (classe ${targetId})`,
          { classeTargets }
        )
    );
  }

  private static documentOutcome(status: string): string {
    return status === 'GENERATO'
      ? '✅ Document generated'
      : status === 'SKIPPED'
        ? '✔️ Document skipped'
        : '❌ Document failed';
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
      { confDocId, jobId: jobName, eseguitoDa: this.activeUser?.getEmail() ?? '' },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }
}
