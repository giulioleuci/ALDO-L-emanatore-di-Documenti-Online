import { DocumentBatchService, JOB_TYPE_GENERAZIONE_DOCUMENTI } from '../../../src/application/services/DocumentBatchService';
import type { BatchCheckpoint } from '../../../src/application/services/DocumentBatchService';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import type { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import type { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';

// The generator contract is what JobRunnerLib executes: it yields a resumable
// checkpoint per class and fast-forwards from params.resumeState after a
// suspension. The trigger/state machinery itself is the library's (tested in
// the GasLibraryFactory monorepo and online).

function wire() {
  const db = new FakeDatabase(fixtureTables());
  const generated: string[] = [];
  const documenti = {
    generateForClasse: (target: ClasseId, confDocId: string) => {
      generated.push(`${target.value}:${confDocId}`);
      return { fileId: `file_${target.value}`, status: 'GENERATO' };
    }
  } as unknown as DocumentGenerationService;
  const service = new DocumentBatchService(new ClasseRepository(db), documenti);
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
  expect(result).toEqual({ success: true, totale: 4, processed: ['5A', '1F', '1F-LSO', '1F-LSS'] });
});

test('handler resumes from params.resumeState without reprocessing completed classes (JobRunnerLib resume cycle)', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    resumeState: { nextIndex: 2, processed: ['5A', '1F'] }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['1F-LSO:CD1', '1F-LSS:CD1']); // 5A and 1F skipped
  expect(result.processed).toEqual(['5A', '1F', '1F-LSO', '1F-LSS']);
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
