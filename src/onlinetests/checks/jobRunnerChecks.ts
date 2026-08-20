import type { EmailDb } from '../../application/services/EmailNotificationService';
import {
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  creaJobRunner,
  riprendiJobSospeso
} from '../../config/Bootstrap';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_LOG_DOCS, COL_LOG_MAIL, TABLE } from '../../config/schema';
import { ValidationError } from '../../domain/errors/DomainError';
import { StatoEmail } from '../../domain/value-objects/enums';
import { ScriptPropertiesFacade } from '../../infrastructure/facades/PropertiesFacade';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import { CONF_DOC_JOBRUNNER, CONF_MAIL_JOBRUNNER } from '../data/fixtures';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

const MS_TINY = 50;
const MS_AMPIO = 25 * 60 * 1000;
const POLL_INTERVAL_MS = 10 * 1000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const JOB_STATE_COMPLETED = 'completed';
const JOB_STATE_NOT_STARTED = 'not_started';

type LogRow = Record<string, unknown>;

interface JobStatus {
  state: string;
  completed?: boolean;
  percentage?: number;
}

interface JobRunnerControl extends JobRunnerService {
  getStatus(jobName: string): JobStatus;
  resetJob(jobName: string): unknown;
  cancelJob(jobName: string): unknown;
}

interface ResumeCheckpoint {
  nextIndex: number;
  processed: string[];
  chunkSize?: number;
  planTargets?: Array<{ studente: string; tipo: string }>;
  patternId?: string;
  jobId?: string;
  testRecipient?: string;
}

interface LoggedMailMetadata {
  testMode?: unknown;
  logicalTargetId?: unknown;
}

export interface JobRunnerTriggerRealeDeps {
  sleep?: (milliseconds: number) => void;
  now?: () => number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export function registerJobRunnerChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean },
  safeEmail: string
): void {
  registerJobRunnerDocGenChecks(runner, container, sample);
  registerJobRunnerEmailChecks(runner, container, sample, safeEmail);
}

/**
 * Optional live-GAS check for the one-time resume trigger. It is deliberately not registered by
 * {@link registerJobRunnerChecks}: polling can take five minutes and must be launched manually.
 */
export function registerJobRunnerTriggerRealeCheck(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean },
  deps: JobRunnerTriggerRealeDeps = {}
): void {
  runner.add(
    groupName('jobrunner.triggerReale', 'resume via contesto trigger'),
    sample.sampleSpreadsheetUrl,
    () => checkTriggerReale(container, sample, deps)
  );
}

export function registerJobRunnerDocGenChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean }
): void {
  const jobName = `gen_${CONF_DOC_JOBRUNNER}`;
  const jobRunner = creaJobRunner() as JobRunnerControl;
  const properties = new ScriptPropertiesFacade();
  const db = container.get<EmailDb>('db');
  const rowsForRun = scopedRows(() =>
    db
      .table(TABLE.LOG_DOCS)
      .findAll()
      .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_JOBRUNNER)
  );
  let triggerId: string | null = null;
  let expectedTargets: string[] = [];

  try {
    runner.add(
      groupName('jobrunner.docGen', 'sospensione to_resume + trigger'),
      sample.sampleSpreadsheetUrl,
      () => {
        // Fixed job name reused across every online-test run: without this,
        // leftover ScriptProperties state from a prior interrupted run (job
        // existed, so JobQueue.execute's first-run guard skips
        // stateManager.saveType) leaves resume() unable to determine the job type.
        jobRunner.resetJob(jobName);
        const result = avviaGenerazioneDataDriven(
          container,
          CONF_DOC_JOBRUNNER,
          jobRunner,
          MS_TINY
        );
        if (result !== null) {
          throw new ValidationError('JobRunner documenti: attesa sospensione con esito null');
        }

        const status = assertSuspended(jobRunner, jobName);
        const checkpoint = readCheckpoint(properties, jobName);
        assertCheckpointProgress(checkpoint, status, 'JobRunner documenti');
        expectedTargets = planTargetIds(checkpoint);
        if (expectedTargets.length <= checkpoint.nextIndex) {
          throw new ValidationError(
            'JobRunner documenti: il checkpoint non lascia target successivi da riprendere'
          );
        }
        triggerId = assertTriggerProperties(properties, jobName);

        const partialRows = rowsForRun();
        assertDocumentRows(partialRows, checkpoint.processed, checkpoint.nextIndex);
      }
    );

    runner.add(
      groupName('jobrunner.docGen', 'resume manuale completa senza duplicati'),
      sample.sampleSpreadsheetUrl,
      () => {
        riprendiJobSospeso(container, jobRunner, jobName, MS_AMPIO);
        assertCompleted(jobRunner, jobName, 'JobRunner documenti');
        if (expectedTargets.length === 0) {
          throw new ValidationError(
            'JobRunner documenti: totale atteso non acquisito in sospensione'
          );
        }
        assertDocumentRows(rowsForRun(), expectedTargets, expectedTargets.length);
      }
    );

    runner.add(
      groupName('jobrunner.docGen', 'resetJob pulisce trigger e stato'),
      sample.sampleSpreadsheetUrl,
      () => {
        resetAndAssertClean(jobRunner, properties, jobName, triggerId);
      }
    );
  } finally {
    cancelIfStillSuspended(jobRunner, jobName);
  }
}

export function registerJobRunnerEmailChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean },
  safeEmail: string
): void {
  if (!sample.testMode) {
    runner.add(
      groupName('jobrunner.email', 'TEST_MODE e destinatario sicuro'),
      sample.sampleSpreadsheetUrl,
      () => {
        throw new ValidationError(
          'JobRunner email rifiutato: MASTER.TEST_MODE deve essere true'
        );
      }
    );
    return;
  }

  const jobName = `mail_${CONF_MAIL_JOBRUNNER}`;
  const jobRunner = creaJobRunner() as JobRunnerControl;
  const properties = new ScriptPropertiesFacade();
  const db = container.get<EmailDb>('db');
  const rowsForRun = scopedRows(() =>
    db
      .table(TABLE.LOG_MAIL)
      .findAll()
      .filter((row) => row[COL_LOG_MAIL.PATTERN] === CONF_MAIL_JOBRUNNER)
  );
  let triggerId: string | null = null;
  let expectedTotal = 0;
  let expectedTargets: string[] = [];

  try {
    runner.add(
      groupName('jobrunner.email', 'sospensione to_resume + trigger'),
      sample.sampleSpreadsheetUrl,
      () => {
        // See registerJobRunnerDocGenChecks: clear stale leftover state before
        // starting, or resume() can't determine the job type.
        jobRunner.resetJob(jobName);
        const result = avviaInvioNotificheDataDriven(
          container,
          CONF_MAIL_JOBRUNNER,
          jobRunner,
          MS_TINY,
          safeEmail,
          1
        );
        if (result !== null) {
          throw new ValidationError('JobRunner email: attesa sospensione con esito null');
        }

        const status = assertSuspended(jobRunner, jobName);
        const checkpoint = readCheckpoint(properties, jobName);
        assertCheckpointProgress(checkpoint, status, 'JobRunner email');
        if (
          checkpoint.patternId !== CONF_MAIL_JOBRUNNER ||
          checkpoint.jobId !== jobName ||
          checkpoint.chunkSize !== 1 ||
          checkpoint.testRecipient !== safeEmail
        ) {
          throw new ValidationError(
            'JobRunner email: checkpoint privo di pattern, job o destinatario test persistito'
          );
        }
        expectedTotal = totalFromProgress(checkpoint.nextIndex, status.percentage);
        if (expectedTotal <= checkpoint.nextIndex) {
          throw new ValidationError(
            'JobRunner email: il checkpoint non lascia target successivi da riprendere'
          );
        }
        expectedTargets = checkpoint.processed.slice();
        triggerId = assertTriggerProperties(properties, jobName);
        assertEmailRows(rowsForRun(), expectedTargets, checkpoint.nextIndex, safeEmail);
      }
    );

    runner.add(
      groupName('jobrunner.email', 'resume manuale completa senza duplicati'),
      sample.sampleSpreadsheetUrl,
      () => {
        riprendiJobSospeso(container, jobRunner, jobName, MS_AMPIO);
        assertCompleted(jobRunner, jobName, 'JobRunner email');
        const completedRows = rowsForRun();
        assertEmailRows(completedRows, [], expectedTotal, safeEmail);
        if (!mailTargetsCorrespond(mailTargetIds(completedRows), expectedTargets)) {
          throw new ValidationError(
            'JobRunner email: uno dei target parziali è assente dopo la ripresa'
          );
        }
      }
    );

    runner.add(
      groupName('jobrunner.email', 'resetJob pulisce trigger e stato'),
      sample.sampleSpreadsheetUrl,
      () => {
        resetAndAssertClean(jobRunner, properties, jobName, triggerId);
      }
    );
  } finally {
    cancelIfStillSuspended(jobRunner, jobName);
  }
}

function scopedRows(readRows: () => LogRow[]): () => LogRow[] {
  const baselineCount = readRows().length;
  return () => readRows().slice(baselineCount);
}

function checkTriggerReale(
  container: ServiceContainer,
  _sample: SharedTestDatabase & { testMode: boolean },
  deps: JobRunnerTriggerRealeDeps
): void {
  // `avviaGenerazioneDataDriven` owns the job-name convention (`gen_<CONF_DOC>`).
  // Keeping it aligned is essential: the one-time trigger resolves this exact persisted job.
  const jobName = `gen_${CONF_DOC_JOBRUNNER}`;
  const jobRunner = creaJobRunner() as JobRunnerControl;
  const properties = new ScriptPropertiesFacade();
  const db = container.get<EmailDb>('db');
  const rowsForRun = scopedRows(() =>
    db
      .table(TABLE.LOG_DOCS)
      .findAll()
      .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_JOBRUNNER)
  );
  const sleep =
    deps.sleep ?? ((milliseconds: number) => ServiceFactory.getUtilitiesService().sleep(milliseconds));
  const now = deps.now ?? (() => Date.now());
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;
  const pollTimeoutMs = deps.pollTimeoutMs ?? POLL_TIMEOUT_MS;

  try {
    const result = avviaGenerazioneDataDriven(
      container,
      CONF_DOC_JOBRUNNER,
      jobRunner,
      MS_TINY
    );
    if (result !== null) {
      throw new ValidationError('JobRunner trigger reale: attesa sospensione con esito null');
    }

    assertSuspended(jobRunner, jobName);
    const checkpoint = readCheckpoint(properties, jobName);
    const expectedTargets = planTargetIds(checkpoint);
    const triggerId = assertTriggerProperties(properties, jobName);
    const startedAt = now();
    let status = jobRunner.getStatus(jobName);

    while (status.state === 'to_resume' && now() - startedAt < pollTimeoutMs) {
      sleep(pollIntervalMs);
      status = jobRunner.getStatus(jobName);
    }

    if (status.state === 'to_resume') {
      jobRunner.cancelJob(jobName);
      throw new ValidationError('Il trigger one-time non è scattato nel timeout');
    }
    if (status.state !== JOB_STATE_COMPLETED || status.completed !== true) {
      throw new ValidationError(
        `JobRunner trigger reale: stato atteso ${JOB_STATE_COMPLETED}, trovato ${status.state}`
      );
    }

    assertDocumentRows(rowsForRun(), expectedTargets, expectedTargets.length);
    if (properties.get(`job_for_trigger_${triggerId}`) !== null) {
      throw new ValidationError('JobRunner trigger reale: contesto trigger non rimosso al completamento');
    }
  } finally {
    cancelIfStillSuspended(jobRunner, jobName);
  }
}

function assertSuspended(jobRunner: JobRunnerControl, jobName: string): JobStatus {
  const status = jobRunner.getStatus(jobName);
  if (status.state !== 'to_resume' || status.completed !== false) {
    throw new ValidationError(
      `${jobName}: atteso stato to_resume/completed=false, trovato ${status.state}/${String(status.completed)}`
    );
  }
  return status;
}

function assertCompleted(jobRunner: JobRunnerControl, jobName: string, label: string): void {
  const status = jobRunner.getStatus(jobName);
  if (status.state !== JOB_STATE_COMPLETED || status.completed !== true) {
    throw new ValidationError(
      `${label}: atteso ${JOB_STATE_COMPLETED}/completed=true, trovato ${status.state}/${String(status.completed)}`
    );
  }
}

function readCheckpoint(properties: ScriptPropertiesFacade, jobName: string): ResumeCheckpoint {
  const raw = properties.get(`state_${jobName}`);
  if (raw === null || raw.startsWith('__DRIVE__:')) {
    throw new ValidationError(
      `${jobName}: resume state ScriptProperties mancante o non ispezionabile`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(`${jobName}: resume state ScriptProperties non valido`);
  }
  if (!isResumeCheckpoint(parsed)) {
    throw new ValidationError(`${jobName}: resume state ScriptProperties non valido`);
  }
  return parsed;
}

function isResumeCheckpoint(value: unknown): value is ResumeCheckpoint {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ResumeCheckpoint>;
  return (
    Number.isInteger(candidate.nextIndex) &&
    (candidate.nextIndex ?? 0) > 0 &&
    Array.isArray(candidate.processed) &&
    candidate.processed.every((item) => typeof item === 'string' && item.trim() !== '')
  );
}

function assertCheckpointProgress(
  checkpoint: ResumeCheckpoint,
  status: JobStatus,
  label: string
): void {
  if (
    checkpoint.processed.length !== checkpoint.nextIndex ||
    typeof status.percentage !== 'number' ||
    status.percentage <= 0 ||
    status.percentage >= 100
  ) {
    throw new ValidationError(`${label}: checkpoint parziale non allineato a stato/progresso`);
  }
}

function planTargetIds(checkpoint: ResumeCheckpoint): string[] {
  const targets = checkpoint.planTargets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new ValidationError('JobRunner documenti: planTargets non persistiti nel checkpoint');
  }
  const ids = targets.map((target) => `${target.studente}:${target.tipo}`);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('JobRunner documenti: target piano duplicati nel checkpoint');
  }
  return ids;
}

function assertTriggerProperties(properties: ScriptPropertiesFacade, jobName: string): string {
  const triggerId = properties.get(`trigger_${jobName}`);
  if (triggerId === null || triggerId.trim() === '') {
    throw new ValidationError(`${jobName}: proprietà trigger_<jobName> mancante`);
  }
  if (properties.get(`job_for_trigger_${triggerId}`) !== jobName) {
    throw new ValidationError(`${jobName}: proprietà job_for_trigger_<id> non allineata`);
  }
  return triggerId;
}

function assertDocumentRows(
  rows: LogRow[],
  expectedTargets: string[],
  expectedCount: number
): void {
  const targetIds = rows.map(
    (row) => `${stringValue(row[COL_LOG_DOCS.UTENTI])}:${stringValue(row[COL_LOG_DOCS.SOTTOTIPO])}`
  );
  const logicalKeys = rows.map((row) =>
    [
      row[COL_LOG_DOCS.ID_GEN],
      row[COL_LOG_DOCS.TIPO],
      row[COL_LOG_DOCS.SOTTOTIPO],
      row[COL_LOG_DOCS.CLASSI],
      row[COL_LOG_DOCS.UTENTI],
      row[COL_LOG_DOCS.MATERIE]
    ].join('|')
  );
  const fileIds = rows.map((row) => stringValue(row[COL_LOG_DOCS.ID]));
  if (
    rows.length !== expectedCount ||
    expectedTargets.length !== expectedCount ||
    new Set(logicalKeys).size !== rows.length ||
    new Set(fileIds).size !== rows.length ||
    fileIds.some((id) => id === '') ||
    !sameStringSet(targetIds, expectedTargets)
  ) {
    throw new ValidationError(
      `JobRunner documenti: LOG_DOCS atteso=${expectedCount}, trovato=${rows.length}, target o duplicati non allineati`
    );
  }
}

function assertEmailRows(
  rows: LogRow[],
  expectedTargets: string[],
  expectedCount: number,
  safeEmail: string
): void {
  const targetIds = mailTargetIds(rows);
  const allSafe = rows.every((row) => {
    const metadata = mailMetadata(row);
    return (
      row[COL_LOG_MAIL.STATO] === StatoEmail.SUCCESS &&
      stringValue(row[COL_LOG_MAIL.DESTINATARI]) === safeEmail &&
      metadata.testMode === true &&
      typeof metadata.logicalTargetId === 'string' &&
      metadata.logicalTargetId.trim() !== ''
    );
  });
  if (
    rows.length !== expectedCount ||
    new Set(targetIds).size !== rows.length ||
    !allSafe ||
    (expectedTargets.length > 0 && !mailTargetsCorrespond(targetIds, expectedTargets))
  ) {
    throw new ValidationError(
      `JobRunner email: LOG_MAIL testMode atteso=${expectedCount}, trovato=${rows.length}, target o duplicati non allineati`
    );
  }
}

function mailTargetIds(rows: LogRow[]): string[] {
  return rows.map((row) => {
    const target = mailMetadata(row).logicalTargetId;
    return typeof target === 'string' ? target : '';
  });
}

function mailTargetsCorrespond(logicalTargetIds: string[], checkpointTargets: string[]): boolean {
  return checkpointTargets.every((target) =>
    logicalTargetIds.some(
      (logicalTargetId) => logicalTargetId === target || logicalTargetId.endsWith(`:${target}`)
    )
  );
}

function mailMetadata(row: LogRow): LoggedMailMetadata {
  const raw = row[COL_LOG_MAIL.ALLEGATI];
  if (typeof raw !== 'string') return {};
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
}

function totalFromProgress(nextIndex: number, percentage: number | undefined): number {
  if (typeof percentage !== 'number' || percentage <= 0 || percentage >= 100) return 0;
  const total = (nextIndex * 100) / percentage;
  const rounded = Math.round(total);
  return Math.abs(total - rounded) <= Number.EPSILON * Math.max(1, Math.abs(total)) * 8
    ? rounded
    : 0;
}

function resetAndAssertClean(
  jobRunner: JobRunnerControl,
  properties: ScriptPropertiesFacade,
  jobName: string,
  triggerId: string | null
): void {
  jobRunner.resetJob(jobName);
  const status = jobRunner.getStatus(jobName);
  if (
    properties.get(`trigger_${jobName}`) !== null ||
    (triggerId !== null && properties.get(`job_for_trigger_${triggerId}`) !== null) ||
    properties.get(`state_${jobName}`) !== null ||
    status.state !== JOB_STATE_NOT_STARTED
  ) {
    throw new ValidationError(`${jobName}: resetJob non ha pulito trigger, checkpoint o stato`);
  }
}

function cancelIfStillSuspended(jobRunner: JobRunnerControl, jobName: string): void {
  if (jobRunner.getStatus(jobName).state === 'to_resume') jobRunner.cancelJob(jobName);
}

function sameStringSet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
