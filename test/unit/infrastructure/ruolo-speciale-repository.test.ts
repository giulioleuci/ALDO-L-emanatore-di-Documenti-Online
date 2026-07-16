import { RuoloSpecialeRepository } from '../../../src/infrastructure/repositories/RuoloSpecialeRepository';
import { RuoloSpeciale } from '../../../src/domain/entities/RuoloSpeciale';
import { RuoliPerDocenteSpec } from '../../../src/domain/specifications/RuoliPerDocenteSpec';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { Email } from '../../../src/domain/value-objects/Email';

function repo(): RuoloSpecialeRepository {
  return new RuoloSpecialeRepository(new FakeDatabase(fixtureTables()));
}

test('RuoloSpeciale parses the CSV DOCENTE column into emails', () => {
  const r = RuoloSpeciale.fromData({
    ID: 'REF_BES',
    NOME: 'Referente BES',
    DOCENTE: 'rossi@school.it, bianchi@school.it'
  });
  expect(r.getEmails().map((e) => e.value)).toEqual(['rossi@school.it', 'bianchi@school.it']);
  expect(r.hasDocente(Email.of('bianchi@school.it'))).toBe(true);
  expect(r.hasDocente(Email.of('nobody@school.it'))).toBe(false);
});

test('empty DOCENTE yields no emails', () => {
  expect(RuoloSpeciale.fromData({ ID: 'X', DOCENTE: '' }).getEmails()).toEqual([]);
});

test('findByDocente matches by CSV containment (07 §14)', () => {
  expect(
    repo()
      .findByDocente(Email.of('rossi@school.it'))
      .map((r) => r.id)
  ).toEqual(['REF_BES']);
  expect(
    repo()
      .findByDocente(Email.of('bianchi@school.it'))
      .map((r) => r.id)
  ).toEqual(['REF_BES', 'AN_DIG']);
  expect(repo().findByDocente(Email.of('nobody@school.it'))).toEqual([]);
});

test('RuoliPerDocenteSpec toQueryObject is a DOCENTE hint', () => {
  expect(new RuoliPerDocenteSpec(Email.of('rossi@school.it')).toQueryObject()).toEqual({
    DOCENTE: 'rossi@school.it'
  });
});

test('findById (base) returns a hydrated role; lookup is cached', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new RuoloSpecialeRepository(db);
  expect(r.findById('AN_DIG')?.nome).toBe('Animatore digitale');
  expect(r.findAllCached()).toHaveLength(2);
  db.table('RUOLI').insert({ ID: 'NEW', NOME: 'x', DOCENTE: 'rossi@school.it' });
  expect(r.findAllCached()).toHaveLength(2); // cache held
});
