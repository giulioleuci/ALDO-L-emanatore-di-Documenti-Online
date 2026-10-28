import type { ILogEmailRepository } from '../../domain/repositories/ILogEmailRepository';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { IGmailFacade } from '../../infrastructure/facades/GmailServiceFacade';
import type { LogEmail } from '../../domain/entities/LogEmail';
import type { EmailNotificationService } from './EmailNotificationService';
import { JOB_LABEL_INVIO_EMAIL } from './EmailBatchService';
import type { ILogJobRepository } from '../../domain/repositories/ILogJobRepository';
import type { IActiveUserFacade } from '../../infrastructure/facades/ActiveUserFacade';
import { StatoJob } from '../../domain/value-objects/enums';

interface EmailRetryOptions {
  /** Give up after this many failed attempts for the same pattern/logical target (default 3, 11 §16). */
  maxTentativi?: number;
  logger?: LoggerService;
  logJob?: ILogJobRepository;
  activeUser?: IActiveUserFacade;
}

interface RetryResult {
  retried: number;
  permanent: number;
}

/** Job type under which the retry handler is registered in JobRunnerLib. */
export const JOB_TYPE_RETRY_EMAIL = 'RETRY_EMAIL_BATCH';

/**
 * Resume anchor persisted by JobRunnerLib to ScriptProperties at suspension.
 * `processedKeys` identifies already-attempted groups by the same stable key
 * `groupFailed()` uses (`pattern::logicalTargetId|destinatariRaw`) — NOT a
 * positional index. A raw index into `groupFailed()`'s output is unsafe: a
 * successful `processGroup()` call flips its rows out of STATO=ERROR via
 * `marcaSuccesso()`, so the failed-group array recomputed on the next
 * `retryHandler` invocation can be shorter/reordered relative to the one the
 * previous invocation yielded checkpoints against, and an index-based resume
 * can silently skip groups that were never actually retried.
 */
interface RetryResumeState extends RetryResult {
  processedKeys: string[];
  /** Groups that did not succeed this run (permanent or still failing) — cumulative across timeout-resumes, for the end-of-job summary. */
  failedKeys: string[];
  /** Number of container executions (1 = no trigger resume yet) this job launch has run across — see `retryHandler` doc. */
  runCount?: number;
  /** Cumulative real (busy) execution time in ms across every run of this job launch — see `retryHandler` doc. */
  totalDurationMs?: number;
  jobId?: string;
  /** Email of the user who launched the job originally, propagated across every resume (LOG_JOB.ESEGUITO_DA, ref NEW_TABLE_LOG_JOB.md). */
  eseguitoDa?: string;
  /** ISO start timestamp of the execution that yielded this checkpoint — used to backfill a SOSPESO_TEMPO LOG_JOB row on the next resume (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). */
  esecuzioneIniziata?: string;
}

/** Checkpoint yielded by `retryHandler` once per failed-group batch. */
export interface RetryCheckpoint extends RetryResumeState {
  /** Informational only (progress display) — NOT used to resume. */
  groupIndex: number;
  /** Informational only (progress display) — recomputed each invocation, may shrink as groups succeed. */
  totalGroups: number;
  /**
   * `processedKeys.length / totalGroups * 100`, saved by JobRunnerLib's
   * progress state (unlike `EmailBatchCheckpoint`, this was previously
   * missing here, so the retry job reported 0% for its whole duration).
   */
  percentage: number;
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
  private readonly logJob: ILogJobRepository | undefined;
  private readonly activeUser: IActiveUserFacade | undefined;

  constructor(
    private readonly logMail: ILogEmailRepository,
    private readonly emailService: EmailNotificationService,
    private readonly gmail: IGmailFacade,
    private readonly master: IMasterSheetRepository,
    options: EmailRetryOptions = {}
  ) {
    this.maxTentativi = options.maxTentativi ?? 3;
    this.logger = options.logger ?? new LoggerService();
    this.logJob = options.logJob;
    this.activeUser = options.activeUser;
  }

  /** Container-execution start time for the run currently in progress (see `retryHandler` doc). */
  private containerStartedAt = Date.now();
  /** Number of container executions (including this one) this job launch has run across. */
  private runCount = 1;
  /** Cumulative real (busy) execution time in ms from every prior run of this job launch. */
  private priorDurationMs = 0;
  /** LOG_JOB.ESEGUITO_DA for the run currently in progress — set once at generator entry. */
  private eseguitoDa = '';
  /** LOG_JOB.INIZIO for the run currently in progress (ISO) — set once at generator entry. */
  private esecuzioneIniziata = '';

  /** Prior runs' busy time plus elapsed time in the run currently in progress. */
  private elapsedTotalMs(): number {
    return this.priorDurationMs + (Date.now() - this.containerStartedAt);
  }

  private semantic(
    method: string,
    args: unknown[],
    fallback: string,
    level: 'info' | 'warn' | 'error' = 'info'
  ): void {
    const candidate = (this.logger as unknown as Record<string, unknown>)[method];
    if (typeof candidate === 'function') {
      candidate.apply(this.logger, args);
      return;
    }
    const basic = [level, 'info', 'warn', 'error']
      .map((name) => (this.logger as unknown as Record<string, unknown>)[name])
      .find((value) => typeof value === 'function');
    if (typeof basic === 'function') basic.call(this.logger, fallback);
  }

  retryFailed(): RetryResult {
    const groups = this.groupFailed();
    this.semantic(
      'logJobStart',
      ['retry_email', 'EMAIL_RETRY'],
      'EmailRetry: starting retry_email (EMAIL_RETRY)'
    );
    this.semantic('logBatchStart', [groups.length], `EmailRetry: ${groups.length} groups`);
    let result: RetryResult = { retried: 0, permanent: 0 };
    try {
      for (let index = 0; index < groups.length; index++) {
        const [key, group] = groups[index]!;
        const safeKey = PiiRedactor.redact(key);
        this.semantic(
          'logItemStart',
          [index + 1, groups.length, 'Gruppo', safeKey, 'RETRY'],
          `EmailRetry: group ${index + 1}/${groups.length} ${safeKey}`
        );
        result = this.mergeResult(result, this.processGroup(group));
      }
      const details = `${result.retried} retried, ${result.permanent} permanent`;
      this.semantic(
        'logJobEnd',
        ['retry_email', result.permanent === 0, details],
        `EmailRetry: completed retry_email (${details})`,
        result.permanent === 0 ? 'info' : 'error'
      );
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const safeReason = PiiRedactor.redact(reason);
      this.semantic(
        'logJobEnd',
        ['retry_email', false, safeReason],
        `EmailRetry: retry_email failed (${safeReason})`,
        'error'
      );
      throw error;
    }
  }

  /**
   * JobRunnerLib handler (11 §16, 15 §5): one checkpoint per failed-group
   * batch, so a pattern with many failed/grouped emails gets execution-window
   * protection instead of running the whole retry synchronously.
   *
   * Resume anchor is `resumeState.processedKeys` (group identity), not a
   * positional index — see `RetryResumeState` doc comment for why an index
   * is unsafe here (successful groups shrink `groupFailed()`'s output
   * between invocations since `marcaSuccesso()` flips their rows out of
   * STATO=ERROR).
   */
  *retryHandler(
    params: JobHandlerParams & { jobId?: string; eseguitoDa?: string }
  ): Generator<RetryCheckpoint, RetryResult, void> {
    const resume = (params.resumeState ?? null) as RetryResumeState | null;
    this.containerStartedAt = Date.now();
    this.runCount = (resume?.runCount ?? 0) + 1;
    this.priorDurationMs = resume?.totalDurationMs ?? 0;
    this.eseguitoDa = String(params.eseguitoDa ?? resume?.eseguitoDa ?? '');
    this.esecuzioneIniziata = new Date(this.containerStartedAt).toISOString();
    const jobId = String(params.jobId ?? resume?.jobId ?? 'retry_email');
    const groups = this.groupFailed();
    this.semantic('logBatchStart', [groups.length], `EmailRetry: ${groups.length} groups`);

    if (resume !== null && this.runCount >= 2) {
      this.backfillSospesoTempo(jobId, groups.length, resume);
    }

    const processedKeys = resume ? resume.processedKeys.slice() : [];
    const failedKeys = resume?.failedKeys?.slice() ?? [];
    const alreadyProcessed = new Set(processedKeys);
    const pending = groups.filter(([key]) => !alreadyProcessed.has(key));

    let result: RetryResult = {
      retried: resume?.retried ?? 0,
      permanent: resume?.permanent ?? 0
    };
    try {
      for (const [key, group] of pending) {
        const safeKey = PiiRedactor.redact(key);
        this.semantic(
          'logItemStart',
          [processedKeys.length + 1, groups.length, 'Gruppo', safeKey, 'RETRY'],
          `EmailRetry: group ${processedKeys.length + 1}/${groups.length} ${safeKey}`
        );
        const retriedBefore = result.retried;
        result = this.mergeResult(result, this.processGroup(group));
        if (result.retried === retriedBefore) failedKeys.push(safeKey);
        processedKeys.push(key);
        yield {
          ...result,
          processedKeys: processedKeys.slice(),
          failedKeys: failedKeys.slice(),
          groupIndex: processedKeys.length,
          totalGroups: groups.length,
          percentage: groups.length === 0 ? 0 : (processedKeys.length / groups.length) * 100,
          runCount: this.runCount,
          totalDurationMs: this.elapsedTotalMs(),
          jobId,
          eseguitoDa: this.eseguitoDa,
          esecuzioneIniziata: this.esecuzioneIniziata
        };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_RETRY_EMAIL,
        idConfig: '',
        nomeConfig: '',
        stato: StatoJob.FALLITO,
        totaleTask: groups.length,
        completatiOk: Math.max(0, processedKeys.length - failedKeys.length),
        falliti: failedKeys.length,
        listaFallimenti: [...failedKeys, reason],
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      throw error;
    }
    // Terminal return (generator done): print the summary for this job launch,
    // cumulative across every timeout-resume — total is groups actually attempted,
    // not `groups.length`, since that count can shrink between separate launches
    // as groups succeed (see RetryResumeState doc comment).
    const total = processedKeys.length;
    this.logger.logJobReport({
      jobType: JOB_LABEL_INVIO_EMAIL,
      runCount: this.runCount,
      totalDurationMs: this.elapsedTotalMs(),
      totale: total,
      falliti: failedKeys.length,
      dettagliFalliti: failedKeys
    });
    this.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 1,
      tipo: JOB_TYPE_RETRY_EMAIL,
      idConfig: '',
      nomeConfig: '',
      stato: failedKeys.length === 0 ? StatoJob.COMPLETATO : StatoJob.COMPLETATO_CON_ERRORI,
      totaleTask: total,
      completatiOk: Math.max(0, total - failedKeys.length),
      falliti: failedKeys.length,
      listaFallimenti: failedKeys,
      durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
      inizio: this.esecuzioneIniziata,
      fine: new Date().toISOString(),
      eseguitoDa: this.eseguitoDa
    });
    return result;
  }

  /** Backfills the SOSPESO_TEMPO row for the execution JobRunnerLib just cut off — the app generator never gets a chance to log at the actual timeout (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). */
  private backfillSospesoTempo(jobId: string, totale: number, resume: RetryResumeState): void {
    if (resume.esecuzioneIniziata === undefined) return;
    const fine = new Date().toISOString();
    const durataSec = Math.max(
      0,
      (Date.parse(fine) - Date.parse(resume.esecuzioneIniziata)) / 1000
    );
    this.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 2,
      tipo: JOB_TYPE_RETRY_EMAIL,
      idConfig: '',
      nomeConfig: '',
      stato: StatoJob.SOSPESO_TEMPO,
      totaleTask: totale,
      completatiOk: Math.max(0, resume.processedKeys.length - resume.failedKeys.length),
      falliti: resume.failedKeys.length,
      listaFallimenti: resume.failedKeys,
      durataSec,
      inizio: resume.esecuzioneIniziata,
      fine,
      eseguitoDa: resume.eseguitoDa ?? ''
    });
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.setPurgeOnComplete?.(true);
    queue.registerJobHandler(JOB_TYPE_RETRY_EMAIL, (params) => this.retryHandler(params));
  }

  /** Starts the retry through JobRunnerLib (state + resume triggers managed by the library). */
  start(
    runner: JobRunnerService,
    jobName: string,
    forceRestart = false,
    maxDurationMs?: number
  ): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_RETRY_EMAIL,
      { jobId: jobName, eseguitoDa: this.activeUser?.getEmail() ?? '' },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }

  /**
   * Returns `[key, group]` pairs, not bare groups — the key (kept alongside
   * the group, not discarded via `Map.values()`) is what `retryHandler` uses
   * as its stable resume identity in `RetryResumeState.processedKeys`.
   */
  private groupFailed(): Array<[string, LogEmail[]]> {
    const groups = new Map<string, LogEmail[]>();
    for (const failed of this.logMail.findFailed()) {
      const logicalTargetId = this.logicalTargetId(failed);
      const key = `${failed.pattern}::${logicalTargetId ?? failed.destinatariRaw}`;
      const group = groups.get(key) ?? [];
      group.push(failed);
      groups.set(key, group);
    }
    return [...groups.entries()];
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
      htmlBody: `<p>${HtmlSanitizer.escapeHtml(msg)}</p>`
    });
  }
}
