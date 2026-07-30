import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import { Materia } from '../../../src/domain/entities/Materia';
import {
  MaterieEsamePrimaSpec,
  MaterieEsameSecondaSpec
} from '../../../src/domain/specifications/MaterieEsameSpec';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables, teachingSlotFixtureTables } from '../../../test/fixtures/tables';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';

function repo(): MateriaRepository {
  return new MateriaRepository(new FakeDatabase(fixtureTables()));
}

test('Materia hydrates and parses ESAME_CFG lazily', () => {
  const m = Materia.fromData({
    ID: 'MATE',
    NOME: 'Matematica',
    SINTESI: 'Matematica',
    ESAME_CFG: '{"prima_prova":["SCIENTIFICO"],"seconda_prova":["LSSA"]}'
  });
  expect(m.materiaId.value).toBe('MATE');
  expect(m.sintesi).toBe('Matematica');
  expect(m.esameConfig?.isPrimaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))).toBe(true);
  expect(m.esameConfig?.isSecondaProvaPerIndirizzo(IndirizzoId.of('LSSA'))).toBe(true);
  expect(m.esameConfig?.isPrimaProvaPerIndirizzo(IndirizzoId.of('LSSA'))).toBe(false);
});

test('EsameConfig treats a malformed raw entry as a non-match instead of throwing (defensive parse)', () => {
  const m = Materia.fromData({
    ID: 'FISI2',
    NOME: 'Fisica',
    SINTESI: 'Fisica',
    ESAME_CFG: '{"prima_prova":["","SCIENTIFICO"],"seconda_prova":[""]}'
  });
  // Malformed entry ('' is rejected by IndirizzoId.of) doesn't throw...
  expect(() =>
    m.esameConfig?.isPrimaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))
  ).not.toThrow();
  // ...a genuinely matching valid entry alongside it still matches...
  expect(m.esameConfig?.isPrimaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))).toBe(true);
  // ...and an indirizzo that only the malformed entry could have matched correctly reports false.
  expect(m.esameConfig?.isSecondaProvaPerIndirizzo(IndirizzoId.of('SCIENTIFICO'))).toBe(false);
});

test('Materia with null ESAME_CFG has no esameConfig', () => {
  expect(Materia.fromData({ ID: 'FISI', ESAME_CFG: null }).esameConfig).toBeNull();
});

test('Materia parses IS_RELIGIONE_ALT, defaulting to false when absent', () => {
  expect(Materia.fromData({ ID: 'MATE' }).isReligioneAlt).toBe(false);
  expect(Materia.fromData({ ID: 'IRC', IS_RELIGIONE_ALT: true }).isReligioneAlt).toBe(true);
});

test('findEsamePrima / findEsameSeconda filter via specs', () => {
  expect(
    repo()
      .findEsamePrima(IndirizzoId.of('SCIENTIFICO'))
      .map((m) => m.id)
  ).toEqual(['MATE']);
  expect(
    repo()
      .findEsameSeconda(IndirizzoId.of('LSSA'))
      .map((m) => m.id)
  ).toEqual(['MATE']);
  expect(repo().findEsamePrima(IndirizzoId.of('LSSA'))).toEqual([]);
});

test('exam specs report toQueryObject null (in-memory only, 07 §4)', () => {
  expect(new MaterieEsamePrimaSpec(IndirizzoId.of('SCIENTIFICO')).toQueryObject()).toBeNull();
  expect(new MaterieEsameSecondaSpec(IndirizzoId.of('LSSA')).toQueryObject()).toBeNull();
});

test('findSpecifiche returns MATERIE rows whose ID is MATERIA.<anything>', () => {
  const r = new MateriaRepository(new FakeDatabase(teachingSlotFixtureTables()));
  expect(r.findSpecifiche(MateriaId.of('INTERPRET')).map((m) => m.id)).toEqual([
    'INTERPRET.CHITARRA',
    'INTERPRET.PIANOFORTE'
  ]);
});

test('findSpecifiche returns empty array for a materia with no specifiche', () => {
  const r = new MateriaRepository(new FakeDatabase(teachingSlotFixtureTables()));
  expect(r.findSpecifiche(MateriaId.of('MAT'))).toEqual([]);
});

test('findByIdCached + caching (06 §Caching)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new MateriaRepository(db);
  expect(r.findByIdCached(MateriaId.of('MATE'))?.sintesi).toBe('Matematica');
  expect(r.findAllCached()).toHaveLength(4); // MATE, FISI, IRC, ALT
  db.table('MATERIE').insert({ ID: 'STOR', NOME: 'Storia', SINTESI: 'Storia', ESAME_CFG: null });
  expect(r.findAllCached()).toHaveLength(4); // cache held
});
