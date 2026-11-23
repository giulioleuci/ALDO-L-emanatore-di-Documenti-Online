import { IndirizzoRepository } from '../../../src/infrastructure/repositories/IndirizzoRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';

function repo(): IndirizzoRepository {
  return new IndirizzoRepository(new FakeDatabase(fixtureTables()));
}

test('findById (base) returns a hydrated Indirizzo', () => {
  expect(repo().findById('LSSA')?.tipo).toBe('LICEO');
  expect(repo().findById('NOPE')).toBeNull();
});

test('findByIdCached resolves via the session cache', () => {
  expect(repo().findByIdCached(IndirizzoId.of('ITI'))?.tipo).toBe('TECNICO');
});
