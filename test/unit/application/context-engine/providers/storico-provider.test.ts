import { StoricoProvider } from '../../../../../src/application/context-engine/providers/StoricoProvider';
import { setAlunnoEntity } from '../../../../../src/application/context-engine/techEntities';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { Alunno } from '../../../../../src/domain/entities/Alunno';
import type {
  BuildParams,
  RecipeOptions
} from '../../../../../src/application/context-engine/Recipe';
import type {
  StoricoDatabaseProvider,
  AnnoStorico
} from '../../../../../src/application/storico/StoricoDatabaseProvider';

// Stashes a minimal alunno entity in `tech.entita.alunno`, mirroring what
// AlunnoProvider does in a real recipe run before StoricoProvider executes.
// StoricoProvider now unconditionally calls getAlunnoEntity(cdu), so the
// fixture must satisfy that invariant even though none of these tests
// exercise the resolved Alunno's fields (fakeDatabases() always returns an
// empty history, so perAlunno never reaches the branch that reads it).
function cduWithAlunno(email: string): Cdu {
  const cdu = {
    focus: { alunno: { email } },
    tech: { entita: {} }
  } as unknown as Cdu;
  setAlunnoEntity(cdu, {} as Alunno);
  return cdu;
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
    hasAnni: false,
    numeroAnni: 0,
    bocciature: { elenco: [], hasElenco: false, numero: 0, elencoDescrizione: '' }
  });
  expect(ref.isResolved()).toBe(true);
});
