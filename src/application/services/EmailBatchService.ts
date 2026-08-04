import type { EmailNotificationService } from './EmailNotificationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import type { IPropertiesFacade } from '../../infrastructure/facades/PropertiesFacade';

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
 *
 * **Quota-capping is a second, distinct control-flow branch from timeout
 * suspension.** JobRunnerLib's own resume mechanism only fires on a *timeout*
 * (it interrupts the generator mid-`yield` and persists whatever was last
 * yielded as `resumeState`). When Gmail's daily quota is exhausted,
 * `batchSendHandler` instead `yield`s a final checkpoint and then `return`s —
 * and a generator `return` makes JobRunnerLib write `STATE_COMPLETED` and
 * **discard** `resumeState` (confirmed against `vendor/gaslibs.Code.js`:
 * `JobExecutor.execute`'s success path calls
 * `batchSave({ state: STATE_COMPLETED, progress: {...} })` with no
 * `resumeState` key, so the next `run()` call's `loadResumeState()` finds
 * nothing). A naive restart would therefore re-enter at `nextIndex = 0` and
 * re-send to every already-processed recipient. To make "restart after a
 * quota suspend" actually safe, `suspendForQuota` persists
 * `{ nextIndex, processed, sent, errors }` to a pattern-scoped
 * `IPropertiesFacade` key of its own (independent of JobRunnerLib's own
 * resume state), and `start()` seeds `resumeState` from it whenever no
 * JobRunnerLib-native resume is in flight — so calling `start()` again for
 * the same pattern after a quota suspend resumes from where it left off
 * instead of restarting the whole batch. The persisted checkpoint is cleared
 * once a run for that pattern completes the target list (successfully or
 * with errors) so a later, unrelated invocation never seeds stale state.
 */
export class EmailBatchService {
  constructor(
    private readonly email: EmailNotificationService,
    private readonly monitor?: IProcessMonitor,
    private readonly properties?: IPropertiesFacade,
    private readonly logger?: LoggerService
  ) {}

  /** ScriptProperties key under which quota-suspend resume state is persisted, scoped per CONF_MAIL pattern. */
  private static resumeKey(patternId: string): string {
    return `EMAIL_BATCH_RESUME_${patternId}`;
  }

  /** Reads the pattern-scoped quota-suspend checkpoint, if any (see class docstring). */
  private loadPersistedResume(patternId: string): EmailBatchResumeState | null {
    const raw = this.properties?.get(EmailBatchService.resumeKey(patternId));
    if (raw === undefined || raw === null || raw === '') return null;
    try {
      return JSON.parse(raw) as EmailBatchResumeState;
    } catch {
      return null;
    }
  }

  /** Persists the pattern-scoped quota-suspend checkpoint (see class docstring). */
  private savePersistedResume(patternId: string, state: EmailBatchResumeState): void {
    this.properties?.set(EmailBatchService.resumeKey(patternId), JSON.stringify(state));
  }

  /** Clears the pattern-scoped quota-suspend checkpoint once a run reaches the end of the target list. */
  private clearPersistedResume(patternId: string): void {
    this.properties?.set(EmailBatchService.resumeKey(patternId), '');
  }

  /**
   * Shared tail for both quota-suspend branches below: records the
   * user-facing error, persists the resumable checkpoint so a subsequent
   * `start()` for this pattern picks up where this run stopped (see class
   * docstring), and reports completion to the monitor. Returns the
   * checkpoint the caller must `yield` before `return`ing.
   */
  private suspendForQuota(
    patternId: string,
    jobId: string,
    nextIndex: number,
    total: number,
    processed: string[],
    sent: number,
    errors: string[]
  ): EmailBatchCheckpoint {
    errors.push(
      'quota Gmail esaurita — sospeso: il riavvio (stesso pattern) riprende automaticamente da dove interrotto, senza reinviare ai destinatari già processati'
    );
    const resumeState: EmailBatchResumeState = {
      nextIndex,
      processed: processed.slice(),
      sent,
      errors: errors.slice()
    };
    this.savePersistedResume(patternId, resumeState);
    this.monitor?.completeJob(jobId, `${sent} email inviate, sospeso per quota esaurita`);
    return { percentage: total === 0 ? 0 : (nextIndex / total) * 100, ...resumeState };
  }

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
    this.logger?.logBatchStart(targets.length);

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }

    while (i < targets.length) {
      const remainingQuota = this.email.getGmailFacade().getRemainingQuota();
      if (remainingQuota <= 0) {
        const checkpoint = this.suspendForQuota(
          patternId,
          jobId,
          i,
          targets.length,
          processed,
          sent,
          errors
        );
        yield checkpoint;
        return { success: false, totale: targets.length, processed, sent, errors };
      }
      // `quotaCapped` alone only means "quota was tight enough to shrink this chunk below
      // chunkSize" — it's also true when a naturally undersized last chunk happens to finish
      // off `targets`. It's the `i < targets.length` check below (after the chunk is consumed)
      // that turns this into a real signal: only when targets remain does a capped chunk mean
      // "quota genuinely ran out mid-batch, suspend"; otherwise the loop just ends normally.
      const quotaCapped = remainingQuota < chunkSize;
      const effectiveChunk = Math.min(chunkSize, remainingQuota);
      const fine = Math.min(i + effectiveChunk, targets.length);
      for (; i < fine; i++) {
        const target = targets[i]!;
        this.logger?.logItemStart(
          i + 1,
          targets.length,
          'Target',
          PiiRedactor.redact(target.target),
          'EMAIL'
        );
        const esito = this.email.sendToTarget(patternId, target, jobId);
        sent += esito.sent;
        errors.push(...esito.errors);
        processed.push(target.target);
      }
      const percentage = (i / targets.length) * 100;

      if (quotaCapped && i < targets.length) {
        const checkpoint = this.suspendForQuota(
          patternId,
          jobId,
          i,
          targets.length,
          processed,
          sent,
          errors
        );
        yield checkpoint;
        return { success: false, totale: targets.length, processed, sent, errors };
      }

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
    this.clearPersistedResume(patternId);
    return { success, totale: targets.length, processed, sent, errors };
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_INVIO_EMAIL, (params) => this.batchSendHandler(params));
  }

  /**
   * Starts the batch through JobRunnerLib (state + resume triggers managed by
   * the library). On a plain restart (`forceRestart` false) after a
   * quota-suspend, JobRunnerLib's own resume state was discarded (see class
   * docstring) — so this seeds `resumeState` from EmailBatchService's own
   * pattern-scoped persisted checkpoint when one exists, letting the run
   * continue from `nextIndex` instead of re-sending from the start.
   * `forceRestart` explicitly discards that checkpoint too, since it means
   * the caller wants a genuine restart from zero.
   */
  start(
    runner: JobRunnerService,
    jobName: string,
    patternId: string,
    forceRestart = false,
    maxDurationMs?: number
  ): unknown {
    if (forceRestart) {
      this.clearPersistedResume(patternId);
    }
    const resumeState = forceRestart ? null : this.loadPersistedResume(patternId);
    return runner.run(
      jobName,
      JOB_TYPE_INVIO_EMAIL,
      { patternId, jobId: jobName, ...(resumeState === null ? {} : { resumeState }) },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }
}
