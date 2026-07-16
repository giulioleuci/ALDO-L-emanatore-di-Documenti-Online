import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import { Materia } from '../../../src/domain/entities/Materia';
import {
  MaterieEsamePrimaSpec,
  MaterieEsameSecondaSpec
} from '../../../src/domain/specifications/MaterieEsameSpec';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
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

test('Materia with null ESAME_CFG has no esameConfig', () => {
  expect(Materia.fromData({ ID: 'FISI', ESAME_CFG: null }).esameConfig).toBeNull();
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

test('findByIdCached + caching (06 §Caching)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new MateriaRepository(db);
  expect(r.findByIdCached(MateriaId.of('MATE'))?.sintesi).toBe('Matematica');
  expect(r.findAllCached()).toHaveLength(2);
  db.table('MATERIE').insert({ ID: 'STOR', NOME: 'Storia', SINTESI: 'Storia', ESAME_CFG: null });
  expect(r.findAllCached()).toHaveLength(2); // cache held
});
