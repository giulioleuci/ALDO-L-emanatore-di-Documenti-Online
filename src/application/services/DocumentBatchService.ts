import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { TipoPiano } from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';
import type { DocumentGenerationService } from './DocumentGenerationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';

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

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
export interface BatchResumeState {
  nextIndex: number;
  processed: string[];
  errori: string[];
  planTargets?: PianoBatchTarget[];
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
      try {
        const result = this.documenti.generateForPiano(
          target.studente,
          target.tipo,
          confDocId,
          jobId
        );
        const name = result.fileName ?? targetId;
        this.logger?.logSummary('Document generated', result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `Document generated: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${targetId}: ${reason}`);
        this.logger?.logSummary('Document failed', 0, `${targetId}: ${reason}`, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
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
      try {
        const result = this.documenti.generateForClasse(classe.classeId, confDocId, jobId);
        const name = result.fileName ?? classe.id ?? '?';
        this.logger?.logSummary('Document generated', result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < attive.length]
        });
        message = `Document generated: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${classe.id ?? '?'}: ${reason}`);
        this.logger?.logSummary('Document failed', 0, `${classe.id ?? '?'}: ${reason}`, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < attive.length]
        });
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
