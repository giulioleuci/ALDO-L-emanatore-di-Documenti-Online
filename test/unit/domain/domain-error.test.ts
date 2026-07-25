import {
  DomainError,
  AmbiguousVariazioneCattedraError,
  VariazioneCattedraInconsistenteError,
  VariazioneCattedraTitolareNonTrovatoError
} from '../../../src/domain/errors/DomainError';

test.each([
  ['AmbiguousVariazioneCattedraError', AmbiguousVariazioneCattedraError],
  ['VariazioneCattedraInconsistenteError', VariazioneCattedraInconsistenteError],
  ['VariazioneCattedraTitolareNonTrovatoError', VariazioneCattedraTitolareNonTrovatoError]
])('%s is a named DomainError', (name, Ctor) => {
  const err = new Ctor('boom');
  expect(err).toBeInstanceOf(DomainError);
  expect(err.name).toBe(name);
  expect(err.message).toBe('boom');
});
