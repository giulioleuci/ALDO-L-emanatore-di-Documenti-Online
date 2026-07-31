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

test('standard class: tutor read from its own RUOLI (regression)', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = JSON.stringify({ TUTOR_ASL: 'rossi@school.it' });
  expect(tutorFor('5A', tables).asl).toEqual([{ nome: 'ROSSI MARIO', email: 'rossi@school.it' }]);
});

test('articulated parent: tutor ASL merged across both partner classes', () => {
  const tables = fixtureTables();
  const lso = tables.CLASSI!.find((r) => r.ID === '1F-LSO')!;
  lso.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
  const lss = tables.CLASSI!.find((r) => r.ID === '1F-LSS')!;
  lss.RUOLI = JSON.stringify({ TUTOR_ASL: 'verdi@school.it' });

  const asl = tutorFor('1F', tables).asl;
  expect(asl.map((t) => t.email).sort()).toEqual(['bianchi@school.it', 'verdi@school.it']);
});
