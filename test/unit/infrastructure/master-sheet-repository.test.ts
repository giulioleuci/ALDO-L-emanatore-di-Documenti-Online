import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { EntityNotFoundError } from '../../../src/domain/errors/DomainError';

test('findConfigAnnoCorrente throws on an empty Master Sheet', () => {
  const empty = new MasterSheetRepository(new FakeDatabase({ MASTER: [] }));
  expect(() => empty.findConfigAnnoCorrente()).toThrow(EntityNotFoundError);
});
