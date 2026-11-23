import { AnnoCorso } from '../../../src/domain/value-objects/AnnoCorso';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('range [1,5] enforced (03 invariant)', () => {
  expect(AnnoCorso.of(1).value).toBe(1);
  expect(() => AnnoCorso.of(0)).toThrow(ValidationError);
  expect(() => AnnoCorso.of(6)).toThrow(ValidationError);
});
