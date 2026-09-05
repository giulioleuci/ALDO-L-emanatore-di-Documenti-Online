import {
  EmailBatchService,
  JOB_TYPE_INVIO_EMAIL
} from '../../../src/application/services/EmailBatchService';
import { composeEmailNotificationService } from '../../../src/config/ApplicationComposition';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeProcessMonitor } from '../../../test/fakes/FakeProcessMonitor';
import { FakePropertiesFacade } from '../../../test/fakes/FakePropertiesFacade';
import type { IPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';
import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import type { EmailNotificationService } from '../../../src/application/services/EmailNotificationService';
import type {
  ILogJobRepository,
  LogJobEntryInput
} from '../../../src/domain/repositories/ILogJobRepository';
import { StatoJob } from '../../../src/domain/value-objects/enums';

const NOW = new Date('2026-07-01T09:00:00Z');

/** Collects every LOG_JOB row appended during a test, in order. */
function fakeLogJob(): { logJob: ILogJobRepository; entries: LogJobEntryInput[] } {
  const entries: LogJobEntryInput[] = [];
  const logJob: ILogJobRepository = {
    append: (entry) => {
      entries.push(entry);
      return entry as unknown as ReturnType<ILogJobRepository['append']>;
    },
    listByType: () => [],
    getById: () => [],
    getFailuresSince: () => []
  };
  return { logJob, entries };
}

function wire(
  monitor?: FakeProcessMonitor,
  properties?: IPropertiesFacade,
  logger?: LoggerService,
  db: FakeDatabase = new FakeDatabase(fixtureTables()),
  logJob?: ILogJobRepository
) {
  const gmail = new FakeGmailFacade();
  const notification = composeEmailNotificationService(
    db,
    gmail,
    new FakeTemplateEngine(),
    NOW,
    new FakeDriveFacade(),
    new AldoTeachingAssignmentResolver(db)
  );
  const service = new EmailBatchService(notification, monitor, properties, logger, logJob);
  return { db, gmail, notification, service };
}

const ONLINE_TEST_SAFE_EMAIL = 'sgsa-onlinetests@onlinetest.aldo.local';

test('emits structured email batch/items', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { service } = wire(undefined, undefined, new LoggerService());

  drain(service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 1, resumeState: null }));

  const output = lines.join('\n');
  expect(output).toContain('📑 [PROCESSING BATCH] (2 Items in queue)');
  expect(output).toContain('✉️ [EMAIL 1/2]');
  expect(output).toContain('✉️ [EMAIL 2/2]');
  expect(output).toContain('bianchi@school.it');
  expect(output).not.toContain('[EMAIL_REDACTED]');
});

test('emits a content-first timed summary using the per-target email result', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const target = {
    tipo: 'docente' as const,
    tipoTarget: 'classe' as const,
    target: '5A',
    emails: ['docente@example.edu'],
    classiCompetenza: []
  };
  const notification = {
    enumerateTargets: () => [target],
    getConfigurazione: () => ({}),
    getGmailFacade: () => ({ getRemainingQuota: () => 1 }),
    sendToTarget: () => ({
      sent: 1,
      errors: [],
      skipped: false,
      recipients: ['docente@example.edu'],
      subject: 'Convocazione consiglio',
      durationMs: 230
    })
  };
  const service = new EmailBatchService(
    notification as unknown as EmailNotificationService,
    undefined,
    undefined,
    new LoggerService()
  );

  drain(service.batchSendHandler({ patternId: 'RESULT', chunkSize: 1, resumeState: null }));

  expect(lines.join('\n')).toContain(
    '✅ Email sent: Convocazione consiglio -> docente@example.edu (COMPLETED in 230ms)'
  );
});

test('prints an end-of-job summary with total/succeeded/failed counts and the failed target list', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const target = {
    tipo: 'docente' as const,
    tipoTarget: 'classe' as const,
    target: '5A',
    emails: ['docente@example.edu'],
    classiCompetenza: []
  };
  const notification = {
    enumerateTargets: () => [target],
    getConfigurazione: () => ({}),
    getGmailFacade: () => ({ getRemainingQuota: () => 1 }),
    sendToTarget: () => ({
      sent: 0,
      errors: ['SMTP rifiutato'],
      skipped: false,
      recipients: ['docente@example.edu'],
      subject: 'Convocazione consiglio',
      durationMs: 10
    })
  };
  const service = new EmailBatchService(
    notification as unknown as EmailNotificationService,
    undefined,
    undefined,
    new LoggerService()
  );

  drain(service.batchSendHandler({ patternId: 'FAILING', jobId: 'job_1', chunkSize: 1 }));

  const output = lines.join('\n');
  expect(output).toContain('📊❌ [RIEPILOGO JOB] INVIO EMAIL');
  expect(output).toContain('  Task totali: 1');
  expect(output).toContain('  Eseguiti con successo: 0');
  expect(output).toContain('  Falliti: 1');
  expect(output).toContain('    - 5A');
});

test('resumed email batch carries forward failed targets from a prior timeout-resume into the final summary', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { service } = wire(undefined, undefined, new LoggerService());

  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      jobId: 'job_1',
      chunkSize: 1,
      resumeState: {
        nextIndex: 1,
        processed: ['5A'],
        sent: 0,
        errors: [],
        failedTargets: ['5A']
      }
    })
  );

  // '5A' failed in a prior run (before this resumed generator instance even
  // started); the second target ('1F') succeeds in this run. The summary must
  // still report the total across BOTH, not just this instance's own work.
  const output = lines.join('\n');
  expect(output).toContain('📊❌ [RIEPILOGO JOB] INVIO EMAIL');
  expect(output).toContain('  Task totali: 2');
  expect(output).toContain('  Eseguiti con successo: 1');
  expect(output).toContain('  Falliti: 1');
  expect(output).toContain('    - 5A');
});

test('resumed email batch logs persisted item index without resending earlier targets', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { gmail, service } = wire(undefined, undefined, new LoggerService());

  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      resumeState: { nextIndex: 1, processedIds: ['cdc:5A'], processed: ['5A'], sent: 1, errors: [] }
    })
  );

  expect(gmail.sent).toHaveLength(1);
  expect(lines.join('\n')).toContain('✉️ [EMAIL 2/2]');
});

test('quota suspension before processing logs the batch but no email item', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { gmail, service } = wire(undefined, undefined, new LoggerService());
  gmail.remainingQuota = 0;

  drain(service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 2, resumeState: null }));

  const output = lines.join('\n');
  expect(output).toContain('📑 [PROCESSING BATCH] (2 Items in queue)');
  expect(output).not.toContain('[EMAIL 1/2]');
});

interface RunnerCall {
  jobName: string;
  jobType?: string;
  params?: Record<string, unknown>;
}

/** Minimal JobRunnerService double recording the params EmailBatchService.start() passes to run(). */
function fakeRunner() {
  const calls: RunnerCall[] = [];
  const runner = {
    run: (jobName: string, jobType: string, params: Record<string, unknown>) => {
      calls.push({ jobName, jobType, params });
      return 'started';
    }
  } as unknown as JobRunnerService;
  return { runner, calls };
}

function drain<T, R>(gen: Generator<T, R, void>): { checkpoints: T[]; result: R } {
  const checkpoints: T[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }
  return { checkpoints, result: step.value };
}

test('yields one checkpoint per chunk with progress percentage (11 §14)', () => {
  const { gmail, service } = wire();
  // CDC_OTTOBRE enumerates 2 targets (5A + 1F); chunkSize 1 → 2 chunks.
  const { checkpoints, result } = drain(
    service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 1, resumeState: null })
  );
  expect(checkpoints.map((c) => c.percentage)).toEqual([50, 100]);
  expect(checkpoints[0]!.nextIndex).toBe(1);
  expect(result.success).toBe(true);
  expect(result.totale).toBe(2);
  expect(gmail.sent).toHaveLength(2);
});

test('resume restarts from the processed logical ids without resending (JobRunnerLib contract)', () => {
  const { gmail, service } = wire();
  const { result } = drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      resumeState: { nextIndex: 1, processedIds: ['cdc:5A'], processed: ['5A'], sent: 1, errors: [] }
    })
  );
  expect(gmail.sent).toHaveLength(1); // only the second target
  expect(result.processed).toEqual(['5A', '1F']);
  expect(result.sent).toBe(2); // cumulative
});

test('resume skips targets already processed even when enumeration shifts (audit §2)', () => {
  const { gmail, service } = wire();
  // Il primo run ha già inviato al target '5A'; alla ripresa l'enumerazione
  // restituisce solo '1F' in prima posizione (5A ritirata dal giro): riprendere
  // per indice invierebbe a nessuno o al target sbagliato.
  const { result } = drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      resumeState: {
        nextIndex: 1,
        processedIds: ['cdc:5A'],
        processed: ['5A'],
        sent: 1,
        errors: [],
        failedTargets: []
      }
    })
  );

  expect(gmail.sent).toHaveLength(1);
  expect(result.processed).toEqual(['5A', '1F']);
  expect(result.sent).toBe(2);
});

test('a quota checkpoint carries the logical ids of every processed target', () => {
  const { service, gmail } = wire();
  gmail.remainingQuota = 1;
  const { checkpoints } = drain(
    service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 1, resumeState: null })
  );

  expect(checkpoints[0]!.processedIds).toEqual(['cdc:5A']);
});

test('a JobRunner resume state recovers pattern and safe recipient in a fresh container without handler injections', () => {
  // This models initAldo() having already enabled MASTER.TEST_MODE to the
  // Master owner before the online scenario pins this particular JobRunner job.
  const properties = new FakePropertiesFacade();
  const first = wire(undefined, properties);
  first.notification.enableTestMode('master-owner@onlinetest.aldo.local');
  first.gmail.remainingQuota = 1;
  const initialRun = fakeRunner();
  first.service.start(
    initialRun.runner,
    'mail_CDC_OTTOBRE',
    'CDC_OTTOBRE',
    false,
    undefined,
    ONLINE_TEST_SAFE_EMAIL
  );
  const firstRun = drain(
    first.service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'mail_CDC_OTTOBRE',
      resumeState: null
    })
  );
  expect(first.gmail.sent.map((sent) => sent.to)).toEqual([[ONLINE_TEST_SAFE_EMAIL]]);
  expect(firstRun.checkpoints).toHaveLength(1);
  // The resumed handler must take the override from JobRunnerLib's saved
  // checkpoint, rather than depending on an auxiliary property lookup.
  properties.set('EMAIL_BATCH_TEST_RECIPIENT_CDC_OTTOBRE', '');

  // A trigger calls initAldo() again, producing a fresh service whose normal
  // TEST_MODE recipient is the Master owner. JobRunnerLib invokes its handler
  // with only the persisted resumeState: no original pattern/job params and no
  // recipient override survive its trigger-resume boundary.
  const resumed = wire(undefined, properties);
  resumed.notification.enableTestMode('master-owner@onlinetest.aldo.local');
  drain(
    resumed.service.batchSendHandler({
      resumeState: firstRun.checkpoints[0]
    })
  );
  expect(resumed.gmail.sent.map((sent) => sent.to)).toEqual([[ONLINE_TEST_SAFE_EMAIL]]);

  // The per-job override must not clear or replace the container's preexisting
  // MASTER.TEST_MODE setting after the batch returns.
  resumed.notification.sendPattern('CDC_OTTOBRE');
  expect(
    resumed.gmail.sent.slice(1).every((sent) => sent.to[0] === 'master-owner@onlinetest.aldo.local')
  ).toBe(true);
});

test('start stores the safe recipient in EmailBatchService persisted state, not arbitrary JobRunner params', () => {
  const properties = new FakePropertiesFacade();
  const { service } = wire(undefined, properties);
  const { runner, calls } = fakeRunner();

  service.start(
    runner,
    'mail_CDC_OTTOBRE',
    'CDC_OTTOBRE',
    false,
    undefined,
    ONLINE_TEST_SAFE_EMAIL
  );

  expect(calls[0]?.params).toMatchObject({
    patternId: 'CDC_OTTOBRE'
  });
  expect(calls[0]?.params).not.toHaveProperty('testRecipient');
  expect(properties.get('EMAIL_BATCH_TEST_RECIPIENT_CDC_OTTOBRE')).toBe(ONLINE_TEST_SAFE_EMAIL);
});

test('start keeps the production chunk default implicit when no override is supplied', () => {
  const { service } = wire();
  const { runner, calls } = fakeRunner();

  service.start(runner, 'mail_CDC_OTTOBRE', 'CDC_OTTOBRE');

  expect(calls[0]?.params).not.toHaveProperty('chunkSize');
});

test('start forwards an explicit chunk size through JobRunner params for deterministic checkpoints', () => {
  const { service } = wire();
  const { runner, calls } = fakeRunner();

  service.start(
    runner,
    'mail_CDC_OTTOBRE',
    'CDC_OTTOBRE',
    false,
    undefined,
    ONLINE_TEST_SAFE_EMAIL,
    1
  );

  expect(calls[0]?.params).toMatchObject({
    patternId: 'CDC_OTTOBRE',
    jobId: 'mail_CDC_OTTOBRE',
    chunkSize: 1
  });
});

test('a completed non-test batch is rerunnable without resending durable SUCCESS logical targets', () => {
  const first = wire();

  const firstRun = drain(
    first.service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 2, resumeState: null })
  );
  const fresh = wire(undefined, undefined, undefined, first.db);
  const secondRun = drain(
    fresh.service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 2, resumeState: null })
  );

  expect(firstRun.result.sent).toBe(2);
  expect(secondRun.result.sent).toBe(0);
  expect(first.gmail.sent).toHaveLength(2);
  expect(fresh.gmail.sent).toHaveLength(0);
});

test('registerJobHandlers registers under INVIO_EMAIL_BATCH', () => {
  const { service } = wire();
  const registered: string[] = [];
  const queue = {
    registerJobHandler: (type: string) => {
      registered.push(type);
    }
  } as unknown as JobQueueLike;
  service.registerJobHandlers(queue);
  expect(registered).toEqual([JOB_TYPE_INVIO_EMAIL]);
});

test('GasProcessMonitorLib progress calls (15 §9): register/start once, progress per chunk, complete at the end', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire(monitor);
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      jobId: 'job_mail_1',
      resumeState: null
    })
  );
  expect(monitor.registered).toEqual(['job_mail_1']);
  expect(monitor.started).toEqual(['job_mail_1']);
  expect(monitor.progress).toHaveLength(2);
  expect(monitor.completed).toHaveLength(1);
});

test('caps a chunk to remaining Gmail quota, not just chunkSize (11 §14)', () => {
  const { gmail, service } = wire();
  gmail.remainingQuota = 1;
  // CDC_OTTOBRE enumerates 2 targets; chunkSize 2 but quota only allows 1.
  const { checkpoints, result } = drain(
    service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 2, resumeState: null })
  );
  expect(gmail.sent).toHaveLength(1);
  expect(checkpoints[0]!.nextIndex).toBe(1);
  expect(result.success).toBe(false); // stopped short of full quota
});

test('zero remaining quota suspends cleanly without sending (no resume-trigger churn)', () => {
  const { gmail, service } = wire();
  gmail.remainingQuota = 0;
  const { checkpoints, result } = drain(
    service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 2, resumeState: null })
  );
  expect(gmail.sent).toHaveLength(0);
  expect(checkpoints).toHaveLength(1);
  // Message updated by Finding 1's fix: restarting the same pattern now
  // genuinely resumes (via the persisted checkpoint asserted below), so the
  // message no longer implies a "riavvio esplicito" is a safe no-op resend.
  expect(checkpoints[0]!.errors[0]).toContain('quota Gmail esaurita');
  expect(checkpoints[0]!.errors[0]).toContain('riprende automaticamente');
  expect(result.errors[0]).toContain('quota Gmail esaurita');
});

test('LOG_JOB (NEW_TABLE_LOG_JOB.md): quota suspension appends a SOSPESO_QUOTA row directly (not backfilled)', () => {
  const { logJob, entries } = fakeLogJob();
  const { gmail, service } = wire(undefined, undefined, undefined, undefined, logJob);
  gmail.remainingQuota = 1;
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'job_1',
      resumeState: null
    })
  );

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    idJob: 'job_1',
    esecuzione: 0,
    tipo: JOB_TYPE_INVIO_EMAIL,
    idConfig: 'CDC_OTTOBRE',
    stato: StatoJob.SOSPESO_QUOTA,
    totaleTask: 2,
    completatiOk: 1,
    falliti: 0
  });
});

test('LOG_JOB: resuming a quota-suspended checkpoint completes without re-logging or backfilling SOSPESO_TEMPO', () => {
  const { logJob, entries } = fakeLogJob();
  const { gmail, service } = wire(undefined, undefined, undefined, undefined, logJob);
  gmail.remainingQuota = 1;
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'job_1',
      resumeState: null
    })
  );
  expect(entries).toHaveLength(1); // the SOSPESO_QUOTA row from the first run above

  gmail.remainingQuota = 10;
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'job_1',
      resumeState: {
        viaQuotaSuspend: true,
        nextIndex: 1,
        processedIds: ['cdc:5A'],
        processed: ['5A'],
        sent: 1,
        errors: [],
        failedTargets: [],
        runCount: 1,
        esecuzioneIniziata: entries[0]!.inizio
      }
    })
  );

  expect(entries).toHaveLength(2); // no SOSPESO_TEMPO backfill inserted between them
  expect(entries[1]).toMatchObject({ esecuzione: 1, stato: StatoJob.COMPLETATO });
});

test('LOG_JOB: resuming a raw JobRunnerLib timeout checkpoint (no viaQuotaSuspend) backfills SOSPESO_TEMPO for the cut-off execution', () => {
  const { logJob, entries } = fakeLogJob();
  const { service } = wire(undefined, undefined, undefined, undefined, logJob);
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'job_1',
      resumeState: {
        patternId: 'CDC_OTTOBRE',
        jobId: 'job_1',
        chunkSize: 2,
        nextIndex: 1,
        processedIds: ['cdc:5A'],
        processed: ['5A'],
        sent: 1,
        errors: [],
        failedTargets: [],
        runCount: 1,
        totalDurationMs: 4000,
        eseguitoDa: 'prof@school.it',
        esecuzioneIniziata: '2026-01-01T00:00:00.000Z'
      }
    })
  );

  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({
    esecuzione: 0,
    stato: StatoJob.SOSPESO_TEMPO,
    inizio: '2026-01-01T00:00:00.000Z',
    eseguitoDa: 'prof@school.it'
  });
  expect(entries[1]).toMatchObject({ esecuzione: 1, stato: StatoJob.COMPLETATO });
});

test('Finding 1: quota suspend persists a resume checkpoint that start() seeds on the next call, so restart does not resend', () => {
  const properties = new FakePropertiesFacade();
  const { gmail, service } = wire(undefined, properties);
  gmail.remainingQuota = 1;

  // CDC_OTTOBRE enumerates 2 targets; chunkSize 2 but quota only allows 1, so
  // this run sends to the first target then suspends for quota.
  const { result } = drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'mail_CDC_OTTOBRE',
      resumeState: null
    })
  );
  expect(gmail.sent).toHaveLength(1);
  expect(result.success).toBe(false);

  // Per JobRunnerLib's actual behavior (vendor/gaslibs.Code.js
  // JobExecutor.execute): a generator `return` after `yield` writes
  // STATE_COMPLETED and never persists `resumeState` — only a *timeout*
  // suspension does. So a plain start() with no resumeState of its own would
  // normally re-enter at nextIndex 0. EmailBatchService.start() must instead
  // seed resumeState from its own pattern-scoped persisted checkpoint.
  const { runner, calls } = fakeRunner();
  service.start(runner, 'mail_CDC_OTTOBRE', 'CDC_OTTOBRE');
  expect(calls[0]!.params).toMatchObject({
    patternId: 'CDC_OTTOBRE',
    resumeState: { nextIndex: 1, processedIds: ['cdc:5A'], processed: ['5A'], sent: 1 }
  });
});

test('Finding 1: a run that reaches the end of the target list clears the persisted checkpoint (no stale seed on a later run)', () => {
  const properties = new FakePropertiesFacade();
  const { gmail, service } = wire(undefined, properties);

  // First: suspend for quota, persisting a checkpoint (mirrors the previous test).
  gmail.remainingQuota = 1;
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'mail_CDC_OTTOBRE',
      resumeState: null
    })
  );

  // Second: resume with the persisted state and unlimited quota — the run
  // now reaches the end of the target list, so the checkpoint should clear.
  gmail.remainingQuota = 1000;
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'mail_CDC_OTTOBRE',
      resumeState: { nextIndex: 1, processedIds: ['cdc:5A'], processed: ['5A'], sent: 1, errors: [] }
    })
  );

  const { runner, calls } = fakeRunner();
  service.start(runner, 'mail_CDC_OTTOBRE', 'CDC_OTTOBRE');
  expect(calls[0]!.params).toEqual({
    patternId: 'CDC_OTTOBRE',
    jobId: 'mail_CDC_OTTOBRE',
    eseguitoDa: ''
  });
  expect(calls[0]!.params).not.toHaveProperty('resumeState');
});

test('Finding 1: forceRestart discards the persisted checkpoint instead of seeding it', () => {
  const properties = new FakePropertiesFacade();
  const { gmail, service } = wire(undefined, properties);
  gmail.remainingQuota = 1;
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 2,
      jobId: 'mail_CDC_OTTOBRE',
      resumeState: null
    })
  );

  const { runner, calls } = fakeRunner();
  service.start(runner, 'mail_CDC_OTTOBRE', 'CDC_OTTOBRE', true);
  expect(calls[0]!.params).toEqual({
    patternId: 'CDC_OTTOBRE',
    jobId: 'mail_CDC_OTTOBRE',
    eseguitoDa: ''
  });
  expect(calls[0]!.params).not.toHaveProperty('resumeState');
});

test('resume does not re-register/re-start the job', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire(monitor);
  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      jobId: 'job_mail_1',
      resumeState: { nextIndex: 1, processedIds: ['cdc:5A'], processed: ['5A'], sent: 1, errors: [] }
    })
  );
  expect(monitor.registered).toEqual([]);
  expect(monitor.started).toEqual([]);
  expect(monitor.completed).toHaveLength(1);
});
