import type { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { DocumentGenerationService } from './DocumentGenerationService';

/** Job type under which the batch handler is registered in JobRunnerLib. */
export const JOB_TYPE_GENERAZIONE_DOCUMENTI = 'GENERAZIONE_DOCUMENTI_CLASSI';

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
export interface BatchResumeState {
  nextIndex: number;
  processed: string[];
}
export interface BatchCheckpoint extends BatchResumeState {
  percentage: number;
}
export interface BatchResult {
  success: boolean;
  totale: number;
  processed: string[];
}

/**
 * Batch document generation over all active classes (ref 10, 12). GAS caps
 * execution at 6/30 minutes, so the batch is NOT run synchronously: it is a
 * generator-function job handler for JobRunnerLib (L3). The library executes
 * the generator, checks the clock at every `yield`, suspends before the
 * timeout persisting the yielded checkpoint to ScriptProperties, schedules the
 * resume trigger and re-enters the generator with `params.resumeState`.
 * Only the business iteration (which classes, which document) lives here.
 */
export class DocumentBatchService {
  constructor(
    private readonly classi: ClasseRepository,
    private readonly documenti: DocumentGenerationService
  ) {}

  /** JobRunnerLib handler: one checkpoint per class (natural suspension point). */
  *batchGenerateHandler(params: JobHandlerParams & { confDocId?: string }): Generator<BatchCheckpoint, BatchResult, void> {
    const confDocId = String(params.confDocId ?? '');
    const resume = (params.resumeState ?? null) as BatchResumeState | null;
    const attive = this.classi.findAttive();
    const processed = resume === null ? [] : resume.processed.slice();

    for (let i = resume?.nextIndex ?? 0; i < attive.length; i++) {
      const classe = attive[i]!;
      this.documenti.generateForClasse(classe.classeId, confDocId);
      processed.push(classe.id ?? '');
      yield {
        percentage: ((i + 1) / attive.length) * 100,
        nextIndex: i + 1,
        processed: processed.slice()
      };
    }
    return { success: true, totale: attive.length, processed };
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
      { confDocId },
      (queue) => this.registerJobHandlers(queue),
      forceRestart
    );
  }

  /** Resumes a suspended batch (invoked by the JobRunnerLib trigger handler). */
  resume(runner: JobRunnerService, jobName: string): unknown {
    return runner.resume(jobName, (queue) => this.registerJobHandlers(queue));
  }
}
