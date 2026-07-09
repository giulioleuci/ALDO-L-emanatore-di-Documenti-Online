import { DocumentBatchService, JOB_TYPE_GENERAZIONE_DOCUMENTI } from '../../../src/application/services/DocumentBatchService';
import type { BatchCheckpoint } from '../../../src/application/services/DocumentBatchService';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import type { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import type { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { FakeProcessMonitor } from '../../fakes/FakeProcessMonitor';

// The generator contract is what JobRunnerLib executes: it yields a resumable
// checkpoint per class and fast-forwards from params.resumeState after a
// suspension. The trigger/state machinery itself is the library's (tested in
// the GasLibraryFactory monorepo and online).

function wire(options: { failFor?: string; monitor?: FakeProcessMonitor } = {}) {
  const db = new FakeDatabase(fixtureTables());
  const generated: string[] = [];
  const documenti = {
    generateForClasse: (target: ClasseId, confDocId: string) => {
      if (target.value === options.failFor) throw new Error('template non trovato');
      generated.push(`${target.value}:${confDocId}`);
      return { fileId: `file_${target.value}`, status: 'GENERATO' };
    }
  } as unknown as DocumentGenerationService;
  const service = new DocumentBatchService(new ClasseRepository(db), documenti, options.monitor);
  return { service, generated };
}

test('handler yields one resumable checkpoint per active class and returns the total', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({ confDocId: 'CD1' });
  const checkpoints: BatchCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }
  const result = step.value;
  // Fixture has 4 active classes (5A, 1F, 1F-LSO, 1F-LSS); 3B is inactive.
  expect(generated).toEqual(['5A:CD1', '1F:CD1', '1F-LSO:CD1', '1F-LSS:CD1']);
  expect(checkpoints).toHaveLength(4);
  expect(checkpoints[0]!.nextIndex).toBe(1);
  expect(checkpoints[3]!.percentage).toBe(100);
  expect(result).toEqual({ success: true, totale: 4, processed: ['5A', '1F', '1F-LSO', '1F-LSS'], errori: [] });
});

test('handler resumes from params.resumeState without reprocessing completed classes (JobRunnerLib resume cycle)', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    resumeState: { nextIndex: 2, processed: ['5A', '1F'], errori: [] }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['1F-LSO:CD1', '1F-LSS:CD1']); // 5A and 1F skipped
  expect(result.processed).toEqual(['5A', '1F', '1F-LSO', '1F-LSS']);
});

test('a single class failure is isolated: logged in errori, the batch continues (15 §8)', () => {
  const { service, generated } = wire({ failFor: '1F' });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['5A:CD1', '1F-LSO:CD1', '1F-LSS:CD1']); // 1F skipped, rest still ran
  expect(result.processed).toEqual(['5A', '1F', '1F-LSO', '1F-LSS']); // still marked processed (attempted)
  expect(result.errori).toEqual(['1F: template non trovato']);
  expect(result.success).toBe(false);
});

test('GasProcessMonitorLib progress calls (15 §9): register/start once, progress per class, complete at the end', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ monitor });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual(['job_1']);
  expect(monitor.started).toEqual(['job_1']);
  expect(monitor.progress).toHaveLength(4);
  expect(monitor.progress[0]!.message).toContain('5A');
  expect(monitor.progress[3]!.percentage).toBe(100);
  expect(monitor.completed).toHaveLength(1);
  expect(monitor.errors).toHaveLength(0); // non-critical per-element errors never call setError
});

test('a failing class surfaces an "Errore: ..." progress message but setError is never called (15 §8/§9)', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ failFor: '1F', monitor });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const failedMessage = monitor.progress.find((p) => p.message?.includes('Errore'));
  expect(failedMessage?.message).toContain('template non trovato');
  expect(monitor.errors).toHaveLength(0);
});

test('resume does not re-register/re-start the job (only the initial invocation does)', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ monitor });
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1', jobId: 'job_1',
    resumeState: { nextIndex: 2, processed: ['5A', '1F'], errori: [] }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual([]);
  expect(monitor.started).toEqual([]);
  expect(monitor.completed).toHaveLength(1);
});

test('registerJobHandlers registers the generator under the job type (JobRunnerLib registry callback)', () => {
  const { service } = wire();
  const registered = new Map<string, unknown>();
  service.registerJobHandlers({
    registerJobHandler: (type, handler) => {
      registered.set(type, handler);
    }
  });
  expect(registered.has(JOB_TYPE_GENERAZIONE_DOCUMENTI)).toBe(true);
  const handler = registered.get(JOB_TYPE_GENERAZIONE_DOCUMENTI) as (p: { confDocId: string }) => Generator<unknown>;
  expect(typeof handler({ confDocId: 'CD1' }).next).toBe('function'); // returns a live generator
});
