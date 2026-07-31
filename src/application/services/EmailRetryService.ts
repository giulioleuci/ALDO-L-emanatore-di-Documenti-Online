import type { ILogEmailRepository } from '../../domain/repositories/ILogEmailRepository';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { IGmailFacade } from '../../infrastructure/facades/GmailServiceFacade';
import type { LogEmail } from '../../domain/entities/LogEmail';
import type { EmailNotificationService } from './EmailNotificationService';
import { escapeHtml } from '../email/boxes';

export interface EmailRetryOptions {
  /** Give up after this many failed attempts for the same pattern/logical target (default 3, 11 §16). */
  maxTentativi?: number;
  logger?: LoggerService;
}

export interface RetryResult {
  retried: number;
  permanent: number;
}

/** Job type under which the retry handler is registered in JobRunnerLib. */
export const JOB_TYPE_RETRY_EMAIL = 'RETRY_EMAIL_BATCH';

/** Checkpoint yielded by `retryHandler` once per failed-group batch. */
export interface RetryCheckpoint extends RetryResult {
  groupIndex: number;
  totalGroups: number;
}

/**
 * Retry of failed sends (11 §16): scans LOG_MAIL for STATO = ERROR, groups by
 * stable logical target when available (with physical recipients as the legacy
 * fallback). Each ERROR record counts as one past attempt. A successful re-send
 * updates the original records to SUCCESS; once maxTentativi is reached the
 * failure is permanent and the supervisore is notified.
 */
export class EmailRetryService {
  private readonly maxTentativi: number;
  private readonly logger: LoggerService;

  constructor(
    private readonly logMail: ILogEmailRepository,
    private readonly emailService: EmailNotificationService,
    private readonly gmail: IGmailFacade,
    private readonly master: IMasterSheetRepository,
    options: EmailRetryOptions = {}
  ) {
    this.maxTentativi = options.maxTentativi ?? 3;
    this.logger = options.logger ?? new LoggerService();
  }

  retryFailed(): RetryResult {
    const groups = this.groupFailed();
    let result: RetryResult = { retried: 0, permanent: 0 };
    for (const group of groups) result = this.mergeResult(result, this.processGroup(group));
    return result;
  }

  /**
   * JobRunnerLib handler (11 §16, 15 §5): one checkpoint per failed-group
   * batch, so a pattern with many failed/grouped emails gets execution-window
   * protection instead of running the whole retry synchronously.
   */
  *retryHandler(
    params: JobHandlerParams & { jobId?: string }
  ): Generator<RetryCheckpoint, RetryResult, void> {
    const jobId = String(params.jobId ?? 'retry_email');
    const resume = (params.resumeState ?? null) as { groupIndex: number } | null;
    const groups = this.groupFailed();
    if (resume === null) this.logger.info(`EmailRetry: avviato job ${jobId}, ${groups.length} gruppi`);

    let result: RetryResult = { retried: 0, permanent: 0 };
    const startIndex = resume?.groupIndex ?? 0;
    for (let i = startIndex; i < groups.length; i++) {
      result = this.mergeResult(result, this.processGroup(groups[i]!));
      yield { ...result, groupIndex: i + 1, totalGroups: groups.length };
    }
    return result;
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_RETRY_EMAIL, (params) => this.retryHandler(params));
  }

  /** Starts the retry through JobRunnerLib (state + resume triggers managed by the library). */
  start(runner: JobRunnerService, jobName: string, forceRestart = false): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_RETRY_EMAIL,
      { jobId: jobName },
      (queue) => this.registerJobHandlers(queue),
      forceRestart
    );
  }

  private groupFailed(): LogEmail[][] {
    const groups = new Map<string, LogEmail[]>();
    for (const failed of this.logMail.findFailed()) {
      const logicalTargetId = this.logicalTargetId(failed);
      const key = `${failed.pattern}::${logicalTargetId ?? failed.destinatariRaw}`;
      const group = groups.get(key) ?? [];
      group.push(failed);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  private mergeResult(a: RetryResult, b: RetryResult): RetryResult {
    return { retried: a.retried + b.retried, permanent: a.permanent + b.permanent };
  }

  private processGroup(group: LogEmail[]): RetryResult {
    const first = group[0]!;
    if (group.length >= this.maxTentativi) {
      this.registraPermanente(first, group.length);
      return { retried: 0, permanent: 1 };
    }
    const logicalTargetId = this.logicalTargetId(first);
    const run = this.emailService.sendPattern(
      first.pattern,
      logicalTargetId === null
        ? { onlyRecipients: first.getDestinatari() }
        : { onlyTargetIds: [logicalTargetId] }
    );
    if (run.sent > 0 && run.errors.length === 0) {
      for (const record of group) this.logMail.marcaSuccesso(record);
      return { retried: 1, permanent: 0 };
    }
    this.logger.warn(
      PiiRedactor.redact(
        `EmailRetry: nuovo tentativo fallito per ${first.pattern} → ${first.destinatariRaw} (${run.errors.join('; ')})`
      )
    );
    return { retried: 0, permanent: 0 };
  }

  private logicalTargetId(record: LogEmail): string | null {
    const value = record.getAllegati()['logicalTargetId'];
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }

  /** Permanent failure: log as error and notify the supervisore (11 §16). */
  private registraPermanente(record: LogEmail, tentativi: number): void {
    const msg =
      `Invio email permanentemente fallito dopo ${tentativi} tentativi: ` +
      `pattern ${record.pattern}, destinatari ${record.destinatariRaw} (${record.errore})`;
    this.logger.error(`EmailRetry: ${PiiRedactor.redact(msg)}`);
    const config = this.master.findConfigAnnoCorrente();
    if (!config.hasSupervisore()) {
      this.logger.warn('EmailRetry: SUPERVISORE_EMAIL assente — nessuna notifica admin inviata');
      return;
    }
    this.gmail.sendEmail({
      to: [config.supervisoreEmail],
      subject: `[SGSA] Errore permanente invio email — pattern ${record.pattern}`,
      // msg embeds LOG_MAIL free text (ERRORE) — escaped before HTML interpolation.
      htmlBody: `<p>${escapeHtml(msg)}</p>`
    });
  }
}
