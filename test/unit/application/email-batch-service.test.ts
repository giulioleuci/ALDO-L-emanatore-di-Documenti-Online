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

const NOW = new Date('2026-07-01T09:00:00Z');

function wire(
  monitor?: FakeProcessMonitor,
  properties?: IPropertiesFacade,
  logger?: LoggerService
) {
  const db = new FakeDatabase(fixtureTables());
  const gmail = new FakeGmailFacade();
  const notification = composeEmailNotificationService(
    db,
    gmail,
    new FakeTemplateEngine(),
    NOW,
    new FakeDriveFacade(),
    new AldoTeachingAssignmentResolver(db)
  );
  const service = new EmailBatchService(notification, monitor, properties, logger);
  return { gmail, service };
}

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
    'Email sent: Convocazione consiglio -> docente@example.edu (COMPLETED in 230ms)'
  );
});

test('resumed email batch logs persisted item index without resending earlier targets', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const { gmail, service } = wire(undefined, undefined, new LoggerService());

  drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      resumeState: { nextIndex: 1, processed: ['5A'], sent: 1, errors: [] }
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

test('resume restarts from resumeState.nextIndex without resending (JobRunnerLib contract)', () => {
  const { gmail, service } = wire();
  const { result } = drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      resumeState: { nextIndex: 1, processed: ['5A'], sent: 1, errors: [] }
    })
  );
  expect(gmail.sent).toHaveLength(1); // only the second target
  expect(result.processed).toEqual(['5A', '1F']);
  expect(result.sent).toBe(2); // cumulative
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
    resumeState: { nextIndex: 1, processed: ['5A'], sent: 1 }
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
      resumeState: { nextIndex: 1, processed: ['5A'], sent: 1, errors: [] }
    })
  );

  const { runner, calls } = fakeRunner();
  service.start(runner, 'mail_CDC_OTTOBRE', 'CDC_OTTOBRE');
  expect(calls[0]!.params).toEqual({
    patternId: 'CDC_OTTOBRE',
    jobId: 'mail_CDC_OTTOBRE'
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
    jobId: 'mail_CDC_OTTOBRE'
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
      resumeState: { nextIndex: 1, processed: ['5A'], sent: 1, errors: [] }
    })
  );
  expect(monitor.registered).toEqual([]);
  expect(monitor.started).toEqual([]);
  expect(monitor.completed).toHaveLength(1);
});
