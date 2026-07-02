import { Email } from '../../../src/domain/value-objects/Email';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('Email accepts valid, rejects invalid (03: RFC 5321 local@domain)', () => {
  expect(Email.of('mario.rossi@school.it').value).toBe('mario.rossi@school.it');
  expect(() => Email.of('not-an-email')).toThrow(ValidationError);
  expect(() => Email.of('')).toThrow(ValidationError);
});

test('ClasseId: non-empty string, no pattern (03)', () => {
  expect(ClasseId.of('5ALC').value).toBe('5ALC');
  expect(() => ClasseId.of('   ')).toThrow(ValidationError);
});

test('MateriaId: uppercase only, length 2-10 (03)', () => {
  expect(MateriaId.of('MATE').value).toBe('MATE');
  expect(() => MateriaId.of('Mate')).toThrow(ValidationError);
  expect(() => MateriaId.of('X')).toThrow(ValidationError);
  expect(() => MateriaId.of('ABCDEFGHIJK')).toThrow(ValidationError);
});

test('equality by value', () => {
  expect(ClasseId.of('3B').equals(ClasseId.of('3B'))).toBe(true);
  expect(ClasseId.of('3B').equals(ClasseId.of('3A'))).toBe(false);
});
