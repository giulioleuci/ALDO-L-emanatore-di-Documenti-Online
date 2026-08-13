import { StoricoProvider } from '../../../../../src/application/context-engine/providers/StoricoProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type {
  BuildParams,
  RecipeOptions
} from '../../../../../src/application/context-engine/Recipe';
import type {
  StoricoDatabaseProvider,
  AnnoStorico
} from '../../../../../src/application/storico/StoricoDatabaseProvider';

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
  expect(cdu.focus.alunno!.storico).toBeUndefined();
});

test('depth zero: provider leaves focus.alunno.storico absent', () => {
  const cdu = cduWithAlunno('a1@school.it');
  const provider = new StoricoProvider(fakeDatabases());

  provider.provide(cdu, params, {
    includiStorico: true,
    profonditaAnniStorico: 0
  } as RecipeOptions);

  expect(cdu.focus.alunno!.storico).toBeUndefined();
});

test('no student in focus: provider is a no-op even when includiStorico is true', () => {
  const cdu = { focus: {} } as unknown as Cdu;
  const provider = new StoricoProvider(fakeDatabases());
  provider.provide(cdu, params, {
    includiStorico: true,
    profonditaAnniStorico: 1
  } as RecipeOptions);
  expect(cdu.focus.alunno).toBeUndefined();
});

test('includiStorico true + student in focus: attaches an unresolved LazyRef (query not run yet)', () => {
  const cdu = cduWithAlunno('a1@school.it');
  const provider = new StoricoProvider(fakeDatabases());
  provider.provide(cdu, params, {
    includiStorico: true,
    profonditaAnniStorico: 2
  } as RecipeOptions);
  const ref = cdu.focus.alunno!.storico;
  expect(ref).toBeInstanceOf(LazyRef);
  expect(ref!.isResolved()).toBe(false);
});

test('reading the LazyRef resolves it against the empty-history fake databases into a StudentStoricoVM', () => {
  const cdu = cduWithAlunno('a1@school.it');
  const provider = new StoricoProvider(fakeDatabases([]));
  provider.provide(cdu, params, {
    includiStorico: true,
    profonditaAnniStorico: 1
  } as RecipeOptions);
  const ref = cdu.focus.alunno!.storico!;
  expect(ref.get()).toEqual({
    anni: [],
    pianiPrimoAnnoPrecedente: [],
    pianiSecondoAnnoPrecedente: [],
    bocciature: [],
    hasBocciature: false
  });
  expect(ref.isResolved()).toBe(true);
});
