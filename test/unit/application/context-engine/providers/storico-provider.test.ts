import { StoricoProvider } from '../../../../../src/application/context-engine/providers/StoricoProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { BuildParams, RecipeOptions } from '../../../../../src/application/context-engine/Recipe';
import type {
  StoricoDatabaseProvider,
  AnnoStorico
} from '../../../../../src/application/storico/StoricoDatabaseProvider';
import { LazyRef } from '../../../../../src/application/storico/LazyRef';

function cduWithAlunno(email: string): Cdu {
  return {
    focus: { alunno: { anagrafica: { email }, didattica: {} } }
  } as unknown as Cdu;
}

function fakeDatabases(anni: AnnoStorico[] = []): StoricoDatabaseProvider {
  return { anniStorici: () => anni };
}

const params = {} as BuildParams;

test('includiStorico false: provider is a no-op, no LazyRef inserted', () => {
  const cdu = cduWithAlunno('a1@school.it');
  const provider = new StoricoProvider(fakeDatabases());
  provider.provide(cdu, params, { includiStorico: false } as RecipeOptions);
  expect(cdu.focus.alunno!.didattica.storico).toBeUndefined();
});

test('no student in focus: provider is a no-op even when includiStorico is true', () => {
  const cdu = { focus: {} } as unknown as Cdu;
  const provider = new StoricoProvider(fakeDatabases());
  provider.provide(cdu, params, { includiStorico: true, profonditaAnniStorico: 1 } as RecipeOptions);
  expect(cdu.focus.alunno).toBeUndefined();
});

test('includiStorico true + student in focus: attaches an unresolved LazyRef (query not run yet)', () => {
  const cdu = cduWithAlunno('a1@school.it');
  const provider = new StoricoProvider(fakeDatabases());
  provider.provide(cdu, params, { includiStorico: true, profonditaAnniStorico: 2 } as RecipeOptions);
  const ref = cdu.focus.alunno!.didattica.storico;
  expect(ref).toBeInstanceOf(LazyRef);
  expect(ref!.isResolved()).toBe(false);
});

test('reading the LazyRef resolves it against the empty-history fake databases', () => {
  const cdu = cduWithAlunno('a1@school.it');
  const provider = new StoricoProvider(fakeDatabases([]));
  provider.provide(cdu, params, { includiStorico: true, profonditaAnniStorico: 1 } as RecipeOptions);
  const ref = cdu.focus.alunno!.didattica.storico!;
  expect(ref.get()).toEqual([]);
  expect(ref.isResolved()).toBe(true);
});
