import { EmailBatchService, JOB_TYPE_INVIO_EMAIL } from '../../../src/application/services/EmailBatchService';
import { EmailNotificationService } from '../../../src/application/services/EmailNotificationService';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';

const NOW = new Date('2026-07-01T09:00:00Z');

function wire() {
  const db = new FakeDatabase(fixtureTables());
  const gmail = new FakeGmailFacade();
  const service = new EmailBatchService(EmailNotificationService.create(db, gmail, new FakeTemplateEngine(), NOW));
  return { gmail, service };
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
      patternId: 'CDC_OTTOBRE', chunkSize: 1,
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
  const queue = { registerJobHandler: (type: string) => { registered.push(type); } } as unknown as JobQueueLike;
  service.registerJobHandlers(queue);
  expect(registered).toEqual([JOB_TYPE_INVIO_EMAIL]);
});
