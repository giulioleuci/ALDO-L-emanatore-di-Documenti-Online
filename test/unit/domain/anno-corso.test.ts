import { AnnoCorso } from '../../../src/domain/value-objects/AnnoCorso';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('range [1,5] enforced (03 invariant)', () => {
  expect(AnnoCorso.of(1).value).toBe(1);
  expect(() => AnnoCorso.of(0)).toThrow(ValidationError);
  expect(() => AnnoCorso.of(6)).toThrow(ValidationError);
});

test('predicates per 03', () => {
  expect(AnnoCorso.of(1).isPrima()).toBe(true);
  expect(AnnoCorso.of(2).isSeconda()).toBe(true);
  expect(AnnoCorso.of(2).isPrimoBiennio()).toBe(true);
  expect(AnnoCorso.of(3).isSecondoBiennio()).toBe(true);
  expect(AnnoCorso.of(5).isTerminale()).toBe(true);
});

test('successivo/precedente per 03', () => {
  expect(AnnoCorso.of(5).getAnnoSuccessivo()).toBeNull();
  expect(AnnoCorso.of(4).getAnnoSuccessivo()?.value).toBe(5);
  expect(AnnoCorso.of(1).getAnnoPrecedente()).toBeNull();
  expect(AnnoCorso.of(2).getAnnoPrecedente()?.value).toBe(1);
});
