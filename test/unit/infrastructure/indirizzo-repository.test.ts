import { IndirizzoRepository } from '../../../src/infrastructure/repositories/IndirizzoRepository';
import { Indirizzo } from '../../../src/domain/entities/Indirizzo';
import { IndirizziPerTipoSpec } from '../../../src/domain/specifications/IndirizziPerTipoSpec';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';

function repo(): IndirizzoRepository {
  return new IndirizzoRepository(new FakeDatabase(fixtureTables()));
}

test('Indirizzo hydrates from a flat row', () => {
  const i = Indirizzo.fromData({
    ID: 'SCIENTIFICO',
    NOME: 'Liceo scientifico',
    NOME_SINTETICO: 'Scientifico',
    TIPO: 'LICEO'
  });
  expect(i.id).toBe('SCIENTIFICO');
  expect(i.nomeSintetico).toBe('Scientifico');
  expect(i.tipo).toBe('LICEO');
  expect(i.indirizzoId.value).toBe('SCIENTIFICO');
});

test('findById (base) returns a hydrated Indirizzo', () => {
  expect(repo().findById('LSSA')?.tipo).toBe('LICEO');
  expect(repo().findById('NOPE')).toBeNull();
});

test('findByIdCached resolves via the session cache', () => {
  expect(repo().findByIdCached(IndirizzoId.of('ITI'))?.tipo).toBe('TECNICO');
});

test('findByTipo filters via IndirizziPerTipoSpec', () => {
  expect(
    repo()
      .findByTipo('LICEO')
      .map((i) => i.id)
      .sort()
  ).toEqual(['LSSA', 'SCIENTIFICO']);
  expect(
    repo()
      .findByTipo('TECNICO')
      .map((i) => i.id)
  ).toEqual(['ITI']);
});

test('IndirizziPerTipoSpec preserves TIPO defaults in memory (07 §5)', () => {
  const spec = new IndirizziPerTipoSpec('TECNICO');
  expect(spec.toQueryObject()).toBeNull();
  expect(spec.isSatisfiedBy(Indirizzo.fromData({ ID: 'ITI', TIPO: 'TECNICO' }))).toBe(true);
  expect(spec.isSatisfiedBy(Indirizzo.fromData({ ID: 'LSSA', TIPO: 'LICEO' }))).toBe(false);
  expect(new IndirizziPerTipoSpec('').isSatisfiedBy(Indirizzo.fromData({}))).toBe(true);
});

test('lookup table is cached for the session (06 §Caching)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new IndirizzoRepository(db);
  expect(r.findAllCached()).toHaveLength(3);
  db.table('INDIRIZZI').insert({ ID: 'NEW', NOME: 'x', NOME_SINTETICO: 'x', TIPO: 'LICEO' });
  expect(r.findAllCached()).toHaveLength(3); // cache held — insert after first access not reflected
});
