import type { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { DocumentGenerationService } from './DocumentGenerationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';

/** Job type under which the batch handler is registered in JobRunnerLib. */
export const JOB_TYPE_GENERAZIONE_DOCUMENTI = 'GENERAZIONE_DOCUMENTI_CLASSI';

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
export interface BatchResumeState {
  nextIndex: number;
  processed: string[];
  errori: string[];
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
 * Batch document generation over all active classes (ref 10, 12). GAS caps
 * execution at 6/30 minutes, so the batch is NOT run synchronously: it is a
 * generator-function job handler for JobRunnerLib (L3). The library executes
 * the generator, checks the clock at every `yield`, suspends before the
 * timeout persisting the yielded checkpoint to ScriptProperties, schedules the
 * resume trigger and re-enters the generator with `params.resumeState`.
 * Only the business iteration (which classes, which document) lives here.
 *
 * Per-element error isolation (15 §8): a single class's generation failure is
 * logged and recorded in `errori` — it does NOT abort the batch, and it does
 * NOT call `monitor.setError` (which marks the whole job FAILED); that call
 * is reserved for errors that make the entire batch impossible to continue,
 * which this handler does not currently raise on its own.
 */
export class DocumentBatchService {
  constructor(
    private readonly classi: ClasseRepository,
    private readonly documenti: DocumentGenerationService,
    private readonly monitor?: IProcessMonitor
  ) {}

  /** JobRunnerLib handler: one checkpoint per class (natural suspension point). */
  *batchGenerateHandler(
    params: JobHandlerParams & { confDocId?: string; jobId?: string }
  ): Generator<BatchCheckpoint, BatchResult, void> {
    const confDocId = String(params.confDocId ?? '');
    const jobId = String(params.jobId ?? confDocId);
    const resume = (params.resumeState ?? null) as BatchResumeState | null;
    const attive = this.classi.findAttive();
    const processed = resume === null ? [] : resume.processed.slice();
    const errori = resume === null ? [] : resume.errori.slice();

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }

    for (let i = resume?.nextIndex ?? 0; i < attive.length; i++) {
      const classe = attive[i]!;
      let message = `Generazione documento classe ${classe.id ?? '?'}`;
      try {
        this.documenti.generateForClasse(classe.classeId, confDocId);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${classe.id ?? '?'}: ${reason}`);
        message = `Errore: ${reason} (classe ${classe.id ?? '?'})`;
      }
      processed.push(classe.id ?? '');
      const percentage = ((i + 1) / attive.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield { percentage, nextIndex: i + 1, processed: processed.slice(), errori: errori.slice() };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(jobId, `${processed.length} classi elaborate, ${errori.length} errori`);
    return { success, totale: attive.length, processed, errori };
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_GENERAZIONE_DOCUMENTI, (params) => this.batchGenerateHandler(params));
  }

  /** Starts the batch through JobRunnerLib (state + resume triggers managed by the library). */
  start(runner: JobRunnerService, jobName: string, confDocId: string, forceRestart = false): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_GENERAZIONE_DOCUMENTI,
      { confDocId, jobId: jobName },
      (queue) => this.registerJobHandlers(queue),
      forceRestart
    );
  }

  /** Resumes a suspended batch (invoked by the JobRunnerLib trigger handler). */
  resume(runner: JobRunnerService, jobName: string): unknown {
    return runner.resume(jobName, (queue) => this.registerJobHandlers(queue));
  }
}
