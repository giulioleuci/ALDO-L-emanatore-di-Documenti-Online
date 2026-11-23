import { ValoreCarenza } from '../../../src/domain/value-objects/ValoreCarenza';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('fromCella returns null for empty/null cells', () => {
  expect(ValoreCarenza.fromCella('')).toBeNull();
  expect(ValoreCarenza.fromCella('   ')).toBeNull();
  expect(ValoreCarenza.fromCella(null)).toBeNull();
  expect(ValoreCarenza.fromCella(undefined)).toBeNull();
});

test('factory invariants', () => {
  expect(() => ValoreCarenza.nota('')).toThrow(ValidationError);
  expect(() => ValoreCarenza.voto(Number.NaN)).toThrow(ValidationError);
});
