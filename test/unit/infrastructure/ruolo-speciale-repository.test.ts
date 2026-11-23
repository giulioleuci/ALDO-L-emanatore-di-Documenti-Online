import { RuoloSpecialeRepository } from '../../../src/infrastructure/repositories/RuoloSpecialeRepository';
import { RuoloSpeciale } from '../../../src/domain/entities/RuoloSpeciale';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';

test('empty DOCENTE yields no emails', () => {
  expect(RuoloSpeciale.fromData({ ID: 'X', DOCENTE: '' }).getEmails()).toEqual([]);
});

test('findById (base) returns a hydrated role; lookup is cached', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new RuoloSpecialeRepository(db);
  expect(r.findById('AN_DIG')?.nome).toBe('Animatore digitale');
  expect(r.findAllCached()).toHaveLength(2);
  db.table('RUOLI').insert({ ID: 'NEW', NOME: 'x', DOCENTE: 'rossi@school.it' });
  expect(r.findAllCached()).toHaveLength(2); // cache held
});
