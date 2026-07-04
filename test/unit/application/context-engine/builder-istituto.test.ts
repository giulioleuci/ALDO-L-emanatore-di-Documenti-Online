import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { SchoolProvider } from '../../../../src/application/context-engine/providers/SchoolProvider';
import { StatisticheProvider } from '../../../../src/application/context-engine/providers/StatisticheProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { RuoloSpecialeRepository } from '../../../../src/infrastructure/repositories/RuoloSpecialeRepository';
import { DocenteRepository } from '../../../../src/infrastructure/repositories/DocenteRepository';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

function builder(): ContextBuilder {
  const db = new FakeDatabase(fixtureTables());
  const b = new ContextBuilder();
  b.registerProvider('school', new SchoolProvider(new MasterSheetRepository(db), new RuoloSpecialeRepository(db), new DocenteRepository(db)));
  b.registerProvider('statistiche', new StatisticheProvider(new ClasseRepository(db), new DocenteRepository(db), new AlunnoRepository(db)));
  return b;
}

const params: BuildParams = { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') };
const recipe: Recipe = { providers: ['school', 'statistiche'], options: makeOptions({ includiStorico: true }) };

test('meta: dates (UTC) and input params (02 §2)', () => {
  const cdu = builder().build(params, recipe);
  expect(cdu.meta.date.oggi).toEqual({
    breve: '01/07/2026', estesa: '01 luglio 2026', iso: '2026-07-01',
    giorno: '01', mese: '07', anno: '2026', ora: '09:00'
  });
  expect(cdu.meta.timestamp).toBe('2026-07-01T09:00:00.000Z');
  expect(cdu.meta.parametriInput.target).toBe('5A');
  expect(cdu.meta.parametriInput.tipoTarget).toBe('classe');
  expect(cdu.meta.parametriInput.materiaCorrente).toBeNull();
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(true);
});

test('istituto: SchoolProvider organisation + staff from Master/RUOLI (02 §3, 09 §4)', () => {
  const cdu = builder().build(params, recipe);
  expect(cdu.istituto?.organizzazione).toEqual({ annoScolastico: '2025-2026', dirigente: 'prof.ssa MARIA BIANCHI' });
  expect(cdu.istituto?.staff).toEqual({ referenteBes: 'ROSSI MARIO', animatoreDigitale: 'BIANCHI LUCIA' });
});

test('istituto.statistiche: aggregate counts (09 §11)', () => {
  const cdu = builder().build(params, recipe);
  // ATTIVA classes: 5A,1F,1F-LSO,1F-LSS (3B inactive). Docenti: 3. ATTIVO alunni: a1.
  expect(cdu.istituto?.statistiche).toEqual({ totaleClassi: 4, totaleDocenti: 3, totaleAlunni: 1 });
});

test('tech is attached but NON-enumerable — never serialized (02 §7)', () => {
  const cdu = builder().build(params, recipe);
  expect(cdu.tech.pipeline.statoCorrente).toBe('IN_CORSO');
  expect(JSON.stringify(cdu)).not.toContain('tech');
  expect(Object.keys(cdu)).not.toContain('tech');
});

test('unknown recipe token throws (09 §4)', () => {
  expect(() => builder().build(params, { providers: ['nope'], options: makeOptions() })).toThrow();
});
