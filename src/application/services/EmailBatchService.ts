import type { EmailNotificationService } from './EmailNotificationService';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import type { IPropertiesFacade } from '../../infrastructure/facades/PropertiesFacade';
import type { ILogJobRepository } from '../../domain/repositories/ILogJobRepository';
import type { IActiveUserFacade } from '../../infrastructure/facades/ActiveUserFacade';
import { StatoJob } from '../../domain/value-objects/enums';
import { emailTargetId } from '../email/saluto';
import { dettagliSaltati, totaleSaltati, type Saltati } from './saltati';

/** Job type under which the batch send handler is registered in JobRunnerLib. */
export const JOB_TYPE_INVIO_EMAIL = 'INVIO_EMAIL_BATCH';

/** Gmail quota guard: at most this many recipients per checkpoint chunk (11 §14). */
const EMAIL_CHUNK_SIZE = 100;

/** Human-readable job type shown in the end-of-job report (see `logJobReport`). */
export const JOB_LABEL_INVIO_EMAIL = 'INVIO EMAIL';

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
interface EmailBatchResumeState {
  /** Batch identity retained by JobRunnerLib for trigger resumes, which drop run() parameters. */
  patternId?: string;
  jobId?: string;
  chunkSize?: number;
  /** Test-only delivery pin retained with the batch identity on a trigger resume. */
  testRecipient?: string;
  /** Contatore di avanzamento (target completati in totale), non un punto di ripresa: vedi `processedIds`. */
  nextIndex: number;
  processed: string[];
  /**
   * Identità logiche (`emailTargetId`) dei target già processati, cumulative su
   * tutti i run del job. Sostituisce `nextIndex` come punto di ripresa: gli
   * indici non sopravvivono a un'enumerazione che cambia fra due run (ritiri,
   * nuove iscrizioni, variazioni di organico) — audit 2026-09-05 §2.
   */
  processedIds?: string[];
  sent: number;
  errors: string[];
  /** Targets whose send genuinely failed (excludes skips) — cumulative across timeout-resumes, for the end-of-job summary. */
  failedTargets: string[];
  /** Number of container executions (1 = no trigger resume yet) this job launch has run across — see `batchSendHandler` doc. */
  runCount?: number;
  /** Cumulative real (busy) execution time in ms across every run of this job launch — see `batchSendHandler` doc. */
  totalDurationMs?: number;
  /** Email of the user who launched the job originally, propagated across every resume (LOG_JOB.ESEGUITO_DA, ref NEW_TABLE_LOG_JOB.md). */
  eseguitoDa?: string;
  /** ISO start timestamp of the execution that yielded this checkpoint — used to backfill a SOSPESO_TEMPO LOG_JOB row on the next resume (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). */
  esecuzioneIniziata?: string;
  /** True only on the checkpoint `suspendForQuota` returns — tells the next `start()` this launch's SOSPESO_QUOTA row was already logged there, so the resume must NOT also backfill a SOSPESO_TEMPO row for the same execution. */
  viaQuotaSuspend?: boolean;
  /** Cumulative skipped targets per reason across every run — counted in `processed`, excluded from LOG_JOB.COMPLETATI_OK. */
  saltati?: Saltati;
}
export interface EmailBatchCheckpoint extends EmailBatchResumeState {
  percentage: number;
}
interface EmailBatchResult {
  success: boolean;
  totale: number;
  processed: string[];
  sent: number;
  errors: string[];
  failedTargets: string[];
}

/**
 * Mass email sending over JobRunnerLib (11 §14): for volumes beyond the Gmail
 * daily quota window the send is a generator-function job handler — the
 * library checks the clock at every `yield`, suspends persisting the yielded
 * checkpoint, schedules the resume trigger and re-enters with
 * `params.resumeState`. I target vengono ri-enumerati a ogni run e quelli già
 * processati sono esclusi per identità logica (`emailTargetId`, la stessa della
 * deduplica LOG_MAIL): l'enumerazione NON deve essere stabile fra un run e
 * l'altro — ritiri e nuove iscrizioni sono normali (audit 2026-09-05 §2).
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
 * `JobExecutor.execute`'s success path clears the persisted resume state
 * before saving `STATE_COMPLETED`, so the next `run()` call's
 * `loadResumeState()` finds nothing). A naive restart would therefore
 * re-enter at `nextIndex = 0` and
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
 *
 * Normal JobRunnerLib trigger resumes receive only the persisted yielded
 * `resumeState`, not the initial `run()` parameters. Every checkpoint
 * therefore carries the pattern/job identity, chunk configuration, and any
 * test-recipient pin required to reconstruct the same batch in a fresh
 * container. This is part of JobRunnerLib's supported resume-state contract,
 * not a parallel job-parameter store.
 */
export class EmailBatchService {
  constructor(
    private readonly email: EmailNotificationService,
    private readonly monitor?: IProcessMonitor,
    private readonly properties?: IPropertiesFacade,
    private readonly logger?: LoggerService,
    private readonly logJob?: ILogJobRepository,
    private readonly activeUser?: IActiveUserFacade
  ) {}

  /** Container-execution start time for the run currently in progress (see `batchSendHandler` doc). */
  private containerStartedAt = Date.now();
  /** Number of container executions (including this one) this job launch has run across. */
  private runCount = 1;
  /** Cumulative real (busy) execution time in ms from every prior run of this job launch. */
  private priorDurationMs = 0;
  /** LOG_JOB.ESEGUITO_DA for the run currently in progress — set once at generator entry. */
  private eseguitoDa = '';
  /** LOG_JOB.INIZIO for the run currently in progress (ISO) — set once at generator entry. */
  private esecuzioneIniziata = '';
  /** LOG_JOB.NOME_CONFIG for the run currently in progress (CONF_MAIL.OGGETTO) — set once at generator entry. */
  private nomeConfig = '';
  /** Cumulative skipped targets per reason — seeded from the checkpoint at generator entry. */
  private saltati: Saltati = {};

  /** Prior runs' busy time plus elapsed time in the run currently in progress. */
  private elapsedTotalMs(): number {
    return this.priorDurationMs + (Date.now() - this.containerStartedAt);
  }

  /** ScriptProperties key under which quota-suspend resume state is persisted, scoped per CONF_MAIL pattern. */
  private static resumeKey(patternId: string): string {
    return `EMAIL_BATCH_RESUME_${patternId}`;
  }

  /**
   * Test-recipient override survives a JobRunner trigger resume through the
   * same ScriptProperties-backed batch state seam as quota checkpoints.
   * JobRunnerLib intentionally does not round-trip arbitrary `run()` params.
   */
  private static testRecipientKey(patternId: string): string {
    return `EMAIL_BATCH_TEST_RECIPIENT_${patternId}`;
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
    this.properties?.delete(EmailBatchService.resumeKey(patternId));
  }

  private loadPersistedTestRecipient(patternId: string): string | undefined {
    const value = this.properties?.get(EmailBatchService.testRecipientKey(patternId))?.trim();
    return value === undefined || value === '' ? undefined : value;
  }

  private savePersistedTestRecipient(patternId: string, recipient: string): void {
    this.properties?.set(EmailBatchService.testRecipientKey(patternId), recipient);
  }

  private clearPersistedTestRecipient(patternId: string): void {
    this.properties?.delete(EmailBatchService.testRecipientKey(patternId));
  }

  /**
   * Printed once at the true end of a job launch (either genuine completion or
   * the quota-suspend early return — both make JobRunnerLib write STATE_COMPLETED,
   * see class docstring) — never on a plain timeout-resume checkpoint, since the
   * job isn't actually over yet at that point. `total`/`failedTargets` are the
   * cumulative counts carried across every timeout-resume of this one launch.
   */
  private logJobSummary(total: number, failedTargets: string[]): void {
    this.logger?.logJobReport({
      jobType: JOB_LABEL_INVIO_EMAIL,
      runCount: this.runCount,
      totalDurationMs: this.elapsedTotalMs(),
      totale: total,
      falliti: failedTargets.length,
      dettagliFalliti: failedTargets,
      saltati: totaleSaltati(this.saltati),
      dettagliSaltati: dettagliSaltati(this.saltati)
    });
  }

  /** Backfills the SOSPESO_TEMPO row for the execution JobRunnerLib just cut off — the app generator never gets a chance to log at the actual timeout (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). Skipped when the previous execution already logged its own row via `suspendForQuota`. */
  private backfillSospesoTempo(
    patternId: string,
    jobId: string,
    totale: number,
    resume: EmailBatchResumeState
  ): void {
    if (resume.viaQuotaSuspend === true || resume.esecuzioneIniziata === undefined) return;
    const fine = new Date().toISOString();
    const durataSec = Math.max(
      0,
      (Date.parse(fine) - Date.parse(resume.esecuzioneIniziata)) / 1000
    );
    this.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 2,
      tipo: JOB_TYPE_INVIO_EMAIL,
      idConfig: patternId,
      nomeConfig: this.nomeConfig,
      stato: StatoJob.SOSPESO_TEMPO,
      totaleTask: totale,
      completatiOk: Math.max(
        0,
        resume.processed.length - resume.errors.length - totaleSaltati(resume.saltati)
      ),
      falliti: resume.errors.length,
      listaFallimenti: resume.errors,
      durataSec,
      inizio: resume.esecuzioneIniziata,
      fine,
      eseguitoDa: resume.eseguitoDa ?? ''
    });
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
    chunkSize: number,
    testRecipient: string | undefined,
    nextIndex: number,
    total: number,
    processed: string[],
    processedIds: string[],
    sent: number,
    errors: string[],
    failedTargets: string[]
  ): EmailBatchCheckpoint {
    errors.push(
      'quota Gmail esaurita — sospeso: il riavvio (stesso pattern) riprende automaticamente da dove interrotto, senza reinviare ai destinatari già processati'
    );
    const resumeStateWithFlag: EmailBatchResumeState = {
      patternId,
      jobId,
      chunkSize,
      ...(testRecipient === undefined ? {} : { testRecipient }),
      nextIndex,
      processed: processed.slice(),
      processedIds: processedIds.slice(),
      sent,
      errors: errors.slice(),
      failedTargets: failedTargets.slice(),
      runCount: this.runCount,
      totalDurationMs: this.elapsedTotalMs(),
      eseguitoDa: this.eseguitoDa,
      esecuzioneIniziata: this.esecuzioneIniziata,
      viaQuotaSuspend: true,
      saltati: { ...this.saltati }
    };
    this.savePersistedResume(patternId, resumeStateWithFlag);
    this.monitor?.completeJob(jobId, `${sent} email inviate, sospeso per quota esaurita`);
    // Quota exhaustion makes JobRunnerLib treat this as the job's terminal return
    // (see class docstring) — the batch isn't logically finished, but this launch is.
    this.logJobSummary(total, failedTargets);
    this.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 1,
      tipo: JOB_TYPE_INVIO_EMAIL,
      idConfig: patternId,
      nomeConfig: this.nomeConfig,
      stato: StatoJob.SOSPESO_QUOTA,
      totaleTask: total,
      completatiOk: Math.max(
        0,
        processed.length - failedTargets.length - totaleSaltati(this.saltati)
      ),
      falliti: failedTargets.length,
      listaFallimenti: failedTargets,
      durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
      inizio: this.esecuzioneIniziata,
      fine: new Date().toISOString(),
      eseguitoDa: this.eseguitoDa
    });
    return { percentage: total === 0 ? 0 : (nextIndex / total) * 100, ...resumeStateWithFlag };
  }

  /** JobRunnerLib handler: one checkpoint per chunk of targets. */
  *batchSendHandler(
    params: JobHandlerParams & {
      patternId?: string;
      chunkSize?: number;
      jobId?: string;
      eseguitoDa?: string;
    }
  ): Generator<EmailBatchCheckpoint, EmailBatchResult, void> {
    const resume = (params.resumeState ?? null) as EmailBatchResumeState | null;
    this.containerStartedAt = Date.now();
    this.runCount = (resume?.runCount ?? 0) + 1;
    this.priorDurationMs = resume?.totalDurationMs ?? 0;
    this.eseguitoDa = String(params.eseguitoDa ?? resume?.eseguitoDa ?? '');
    this.esecuzioneIniziata = new Date(this.containerStartedAt).toISOString();
    this.saltati = { ...(resume?.saltati ?? {}) };
    const patternId = String(params.patternId ?? resume?.patternId ?? '');
    const jobId = String(params.jobId ?? resume?.jobId ?? patternId);

    try {
      const chunkSize = Number(params.chunkSize ?? resume?.chunkSize ?? EMAIL_CHUNK_SIZE);
      const testRecipient = resume?.testRecipient ?? this.loadPersistedTestRecipient(patternId);
      const config = this.email.getConfigurazione(patternId);
      this.nomeConfig = config.oggetto;
      const doneIds = new Set(resume?.processedIds ?? []);
      const successfulIds = this.email.loadSuccessfulLogicalTargetIds(
        patternId,
        jobId,
        testRecipient
      );
      const enumerati = this.email.enumerateTargets(config);
      const targets = enumerati.filter((target) => {
        const id = emailTargetId(target);
        return !doneIds.has(id) && !successfulIds.has(id);
      });
      const totale = doneIds.size + targets.length;

      const processed = resume === null ? [] : resume.processed.slice();
      const processedIds = resume?.processedIds?.slice() ?? [];
      const errors = resume === null ? [] : resume.errors.slice();
      const failedTargets = resume?.failedTargets?.slice() ?? [];
      let sent = resume?.sent ?? 0;
      let i = 0;
      this.logger?.logBatchStart(targets.length);

      if (resume === null) {
        this.monitor?.registerJob(jobId);
        this.monitor?.startJob(jobId);
      } else if (this.runCount >= 2) {
        this.backfillSospesoTempo(patternId, jobId, totale, resume);
      }

      while (i < targets.length) {
        const remainingQuota = this.email.getGmailFacade().getRemainingQuota();
        if (remainingQuota <= 0) {
          const checkpoint = this.suspendForQuota(
            patternId,
            jobId,
            chunkSize,
            testRecipient,
            doneIds.size + i,
            totale,
            processed,
            processedIds,
            sent,
            errors,
            failedTargets
          );
          yield checkpoint;
          return { success: false, totale, processed, sent, errors, failedTargets };
        }
        // `quotaCapped` alone only means "quota was tight enough to shrink this chunk below
        // chunkSize" — it's also true when a naturally undersized last chunk happens to finish
        // off `targets`. It's the `i < targets.length` check below (after the chunk is consumed)
        // that turns this into a real signal: only when targets remain does a capped chunk mean
        // "quota genuinely ran out mid-batch, suspend"; otherwise the loop just ends normally.
        const quotaCapped = remainingQuota < chunkSize;
        const effectiveChunk = Math.min(chunkSize, remainingQuota);
        const fine = Math.min(i + effectiveChunk, targets.length);
        let progressDetail = '';
        for (; i < fine; i++) {
          const target = targets[i]!;
          const targetHeader = target.emails.join(',') || target.target;
          this.logger?.logItemStart(doneIds.size + i + 1, totale, 'Target', targetHeader, 'EMAIL');
          const esito = this.email.sendToTarget(patternId, target, jobId, testRecipient);
          sent += esito.sent;
          errors.push(...esito.errors);
          const recipients = esito.recipients.length > 0 ? esito.recipients : target.emails;
          const subject = esito.subject === '' ? patternId : esito.subject;
          const outcome =
            esito.sent > 0
              ? '✅ Email sent'
              : esito.skipped
                ? '✔️ Email skipped'
                : '❌ Email failed';
          if (esito.sent === 0 && !esito.skipped) failedTargets.push(target.target);
          if (esito.skipReason !== undefined) {
            this.saltati[esito.skipReason] = (this.saltati[esito.skipReason] ?? 0) + 1;
          }
          const detail =
            `${subject} -> ${recipients.join(',')}` +
            (esito.skipReason === undefined ? '' : ` — ${esito.skipReason}`);
          progressDetail = detail;
          this.logger?.logSummary(outcome, esito.durationMs, detail, {
            depth: 1,
            isLast: true,
            ancestorHasNext: [i + 1 < targets.length]
          });
          processed.push(target.target);
          processedIds.push(emailTargetId(target));
        }
        const percentage = ((doneIds.size + i) / totale) * 100;

        if (quotaCapped && i < targets.length) {
          const checkpoint = this.suspendForQuota(
            patternId,
            jobId,
            chunkSize,
            testRecipient,
            doneIds.size + i,
            totale,
            processed,
            processedIds,
            sent,
            errors,
            failedTargets
          );
          yield checkpoint;
          return { success: false, totale, processed, sent, errors, failedTargets };
        }

        this.monitor?.updateProgress(
          jobId,
          percentage,
          `${processed.length}/${totale} destinatari elaborati: ${progressDetail}`
        );
        yield {
          patternId,
          jobId,
          chunkSize,
          ...(testRecipient === undefined ? {} : { testRecipient }),
          percentage,
          nextIndex: doneIds.size + i,
          processed: processed.slice(),
          processedIds: processedIds.slice(),
          sent,
          errors: errors.slice(),
          failedTargets: failedTargets.slice(),
          runCount: this.runCount,
          totalDurationMs: this.elapsedTotalMs(),
          eseguitoDa: this.eseguitoDa,
          esecuzioneIniziata: this.esecuzioneIniziata,
          saltati: { ...this.saltati }
        };
      }

      const success = errors.length === 0;
      this.monitor?.completeJob(jobId, `${sent} email inviate, ${errors.length} errori`);
      this.clearPersistedResume(patternId);
      this.clearPersistedTestRecipient(patternId);
      this.logJobSummary(totale, failedTargets);
      this.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_INVIO_EMAIL,
        idConfig: patternId,
        nomeConfig: this.nomeConfig,
        stato: success ? StatoJob.COMPLETATO : StatoJob.COMPLETATO_CON_ERRORI,
        totaleTask: totale,
        completatiOk: Math.max(
          0,
          processed.length - failedTargets.length - totaleSaltati(this.saltati)
        ),
        falliti: failedTargets.length,
        listaFallimenti: failedTargets,
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      return { success, totale, processed, sent, errors, failedTargets };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_INVIO_EMAIL,
        idConfig: patternId,
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

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.setPurgeOnComplete?.(true);
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
    maxDurationMs?: number,
    testRecipient?: string,
    chunkSize?: number
  ): unknown {
    if (forceRestart) {
      this.clearPersistedResume(patternId);
      this.clearPersistedTestRecipient(patternId);
    }
    if (testRecipient === undefined) this.clearPersistedTestRecipient(patternId);
    else this.savePersistedTestRecipient(patternId, testRecipient);
    const resumeState = forceRestart ? null : this.loadPersistedResume(patternId);
    return runner.run(
      jobName,
      JOB_TYPE_INVIO_EMAIL,
      {
        patternId,
        jobId: jobName,
        eseguitoDa: this.activeUser?.getEmail() ?? '',
        ...(chunkSize === undefined ? {} : { chunkSize }),
        ...(resumeState === null ? {} : { resumeState })
      },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }
}
