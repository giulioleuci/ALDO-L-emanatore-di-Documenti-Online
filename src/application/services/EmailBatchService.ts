import type { EmailNotificationService } from './EmailNotificationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';

/** Job type under which the batch send handler is registered in JobRunnerLib. */
export const JOB_TYPE_INVIO_EMAIL = 'INVIO_EMAIL_BATCH';

/** Gmail quota guard: at most this many recipients per checkpoint chunk (11 §14). */
export const EMAIL_CHUNK_SIZE = 100;

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
export interface EmailBatchResumeState {
  nextIndex: number;
  processed: string[];
  sent: number;
  errors: string[];
}
export interface EmailBatchCheckpoint extends EmailBatchResumeState {
  percentage: number;
}
export interface EmailBatchResult {
  success: boolean;
  totale: number;
  processed: string[];
  sent: number;
  errors: string[];
}

/**
 * Mass email sending over JobRunnerLib (11 §14): for volumes beyond the Gmail
 * daily quota window the send is a generator-function job handler — the
 * library checks the clock at every `yield`, suspends persisting the yielded
 * checkpoint, schedules the resume trigger and re-enters with
 * `params.resumeState`. Targets are re-enumerated on resume and consumed from
 * `nextIndex`, so the PROCESSO enumeration must be stable across runs
 * (self-marking patterns like PER_CARENZA_GENITORI* shrink naturally via POST_PROCESSO).
 *
 * Per-target error isolation (15 §8) already lives inside the pipeline itself:
 * `SendEmailStep` never throws, it collects failures as strings — so no
 * try/catch is needed here, unlike `DocumentBatchService`.
 */
export class EmailBatchService {
  constructor(
    private readonly email: EmailNotificationService,
    private readonly monitor?: IProcessMonitor
  ) {}

  /** JobRunnerLib handler: one checkpoint per chunk of targets. */
  *batchSendHandler(
    params: JobHandlerParams & { patternId?: string; chunkSize?: number; jobId?: string }
  ): Generator<EmailBatchCheckpoint, EmailBatchResult, void> {
    const patternId = String(params.patternId ?? '');
    const jobId = String(params.jobId ?? patternId);
    const chunkSize = Number(params.chunkSize ?? EMAIL_CHUNK_SIZE);
    const resume = (params.resumeState ?? null) as EmailBatchResumeState | null;
    const targets = this.email.enumerateTargets(this.email.getConfigurazione(patternId));

    const processed = resume === null ? [] : resume.processed.slice();
    const errors = resume === null ? [] : resume.errors.slice();
    let sent = resume?.sent ?? 0;
    let i = resume?.nextIndex ?? 0;

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }

    while (i < targets.length) {
      const fine = Math.min(i + chunkSize, targets.length);
      for (; i < fine; i++) {
        const target = targets[i]!;
        const esito = this.email.sendToTarget(patternId, target, jobId);
        sent += esito.sent;
        errors.push(...esito.errors);
        processed.push(target.target);
      }
      const percentage = (i / targets.length) * 100;
      this.monitor?.updateProgress(
        jobId,
        percentage,
        `${processed.length}/${targets.length} destinatari elaborati`
      );
      yield {
        percentage,
        nextIndex: i,
        processed: processed.slice(),
        sent,
        errors: errors.slice()
      };
    }

    const success = errors.length === 0;
    this.monitor?.completeJob(jobId, `${sent} email inviate, ${errors.length} errori`);
    return { success, totale: targets.length, processed, sent, errors };
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_INVIO_EMAIL, (params) => this.batchSendHandler(params));
  }

  /** Starts the batch through JobRunnerLib (state + resume triggers managed by the library). */
  start(
    runner: JobRunnerService,
    jobName: string,
    patternId: string,
    forceRestart = false
  ): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_INVIO_EMAIL,
      { patternId, jobId: jobName },
      (queue) => this.registerJobHandlers(queue),
      forceRestart
    );
  }
}
