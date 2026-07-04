import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { TutorProvider } from '../../../../src/application/context-engine/providers/TutorProvider';
import { RappresentantiProvider } from '../../../../src/application/context-engine/providers/RappresentantiProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

function build(target: string) {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('tutor', new TutorProvider(classi));
  b.registerProvider('rappresentanti', new RappresentantiProvider(classi));
  const params: BuildParams = { target, tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = { providers: ['class', 'tutor', 'rappresentanti'], options: makeOptions() };
  return b.build(params, recipe);
}

test('ClasseProvider: anagrafica + flags for a standard terminal class (02 §4.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.anagrafica).toEqual({
    nome: '5A', anno: 5, sezione: 'A',
    indirizzo: { nome: 'Liceo scientifico', nomeSintetico: 'Scientifico', sigla: 'SCIENTIFICO', tipo: 'LICEO' }
  });
  expect(c.flags).toEqual({ isClassePrima: false, isTriennio: true, isPrimoBiennio: false, isTerminale: true, isArticolata: false });
  expect(c.articolazione).toBeUndefined();
});

test('ClasseProvider: coordinatori with resolved subject + appellativo', () => {
  const c = build('5A').focus.classe!;
  expect(c.coordinatori).toEqual([{ nome: 'ROSSI MARIO', email: 'rossi@school.it', materia: 'MATE', appellativo: 'Prof.' }]);
});

test('TutorProvider: focus.classe.tutor from CLASSI.RUOLI (02 §4.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.tutor).toEqual({
    asl: [{ nome: 'ROSSI MARIO', email: 'rossi@school.it' }, { nome: 'BIANCHI LUCIA', email: 'bianchi@school.it' }],
    orientamento: []
  });
});

test('RappresentantiProvider: student reps with email, no parent reps in fixtures (02 §4.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.rappresentanti).toEqual({
    studenti: [{ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }],
    genitori: []
  });
});

test('ClasseProvider: articulated parent flags + materie split (02 §4.1, 09 §9)', () => {
  const c = build('1F').focus.classe!;
  expect(c.anagrafica.anno).toBe(1);
  expect(c.flags.isArticolata).toBe(true);
  expect(c.flags.isClassePrima).toBe(true);
  expect(c.articolazione).toEqual({
    partner: null,
    partners: ['1F-LSO', '1F-LSS'],
    parent: null,
    materieCondivise: ['MATE'],
    materieSeparatePrimoGruppo: ['FISI'],
    materieSeparateSecondoGruppo: ['FISI']
  });
});

test('ClasseProvider: articulated partner points to parent + counterpart', () => {
  const c = build('1F-LSO').focus.classe!;
  expect(c.articolazione?.parent).toBe('1F');
  expect(c.articolazione?.partner).toBe('1F-LSS');
  expect(c.articolazione?.partners).toBeNull();
});
