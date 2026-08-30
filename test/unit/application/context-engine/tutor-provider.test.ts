import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { TutorProvider } from '../../../../src/application/context-engine/providers/TutorProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

function tutorFor(target: string, tables = fixtureTables()) {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('tutor', new TutorProvider(classi));
  const params: BuildParams = { target, tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = { providers: ['class', 'tutor'], options: makeOptions({}) };
  return b.build(params, recipe).focus.classe!.tutor!;
}

test('standard class: tutor read from its own RUOLI as PersonaVM, single male ASL tutor declines Prof./Il (regression)', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = JSON.stringify({ TUTOR_ASL: 'rossi@school.it' });
  const tutor = tutorFor('5A', tables);
  expect(tutor.asl).toEqual([expect.objectContaining({ email: 'rossi@school.it', nomeCompleto: 'ROSSI MARIO' })]);
  expect(tutor.orientamento).toEqual([]);
  expect(tutor.collettivo).toEqual({ appellativo: 'Prof.', articolo: 'Il', sostantivo: 'Tutor', numero: 1 });
});

test('articulated parent: tutor ASL merged across both partner classes, mixed group declines Prof./I', () => {
  const tables = fixtureTables();
  const lso = tables.CLASSI!.find((r) => r.ID === '1F-LSO')!;
  lso.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
  const lss = tables.CLASSI!.find((r) => r.ID === '1F-LSS')!;
  lss.RUOLI = JSON.stringify({ TUTOR_ASL: 'verdi@school.it' });

  const tutor = tutorFor('1F', tables);
  expect(tutor.collettivo.appellativo).toBe('Prof.');
  expect(tutor.collettivo.articolo).toBe('I');
  expect(tutor.asl.map((t) => t.email).sort()).toEqual(['bianchi@school.it', 'verdi@school.it']);
});

test('single female ASL tutor declines Prof.ssa/La', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
  const tutor = tutorFor('5A', tables);
  expect(tutor.collettivo.appellativo).toBe('Prof.ssa');
  expect(tutor.collettivo.articolo).toBe('La');
  expect(tutor.collettivo.sostantivo).toBe('Tutor');
});

test('hasAsl/hasOrientamento/hasElenco are false and elenco is empty when RUOLI has no tutor roles', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = null;
  const tutor = tutorFor('5A', tables);
  expect(tutor.asl).toEqual([]);
  expect(tutor.orientamento).toEqual([]);
  expect(tutor.elenco).toEqual([]);
  expect(tutor.hasAsl).toBe(false);
  expect(tutor.hasOrientamento).toBe(false);
  expect(tutor.hasElenco).toBe(false);
  expect(tutor.collettivo).toEqual({ appellativo: '', articolo: '', sostantivo: 'Tutor', numero: 0 });
});
