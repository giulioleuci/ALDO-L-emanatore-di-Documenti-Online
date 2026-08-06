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

test('standard class: tutor read from its own RUOLI as PersonVM, single male ASL tutor declines prof./il (regression)', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = JSON.stringify({ TUTOR_ASL: 'rossi@school.it' });
  const tutor = tutorFor('5A', tables);
  expect(tutor).toEqual({
    appellativo: 'prof.',
    articolo: 'il',
    tutor: 'tutor',
    asl: [expect.objectContaining({ email: 'rossi@school.it', nomeCompleto: 'MARIO ROSSI' })],
    orientamento: []
  });
});

test('articulated parent: tutor ASL merged across both partner classes, mixed group declines prof./i', () => {
  const tables = fixtureTables();
  const lso = tables.CLASSI!.find((r) => r.ID === '1F-LSO')!;
  lso.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
  const lss = tables.CLASSI!.find((r) => r.ID === '1F-LSS')!;
  lss.RUOLI = JSON.stringify({ TUTOR_ASL: 'verdi@school.it' });

  const tutor = tutorFor('1F', tables);
  expect(tutor.appellativo).toBe('prof.');
  expect(tutor.articolo).toBe('i');
  expect(tutor.asl.map((t) => t.email).sort()).toEqual(['bianchi@school.it', 'verdi@school.it']);
});

test('single female ASL tutor declines prof.ssa/la', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
  const tutor = tutorFor('5A', tables);
  expect(tutor.appellativo).toBe('prof.ssa');
  expect(tutor.articolo).toBe('la');
  expect(tutor.tutor).toBe('tutor');
});

test('omits appellativo/articolo/tutor when both asl and orientamento are empty', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = null;
  const tutor = tutorFor('5A', tables);
  expect(tutor).toEqual({ asl: [], orientamento: [] });
});
