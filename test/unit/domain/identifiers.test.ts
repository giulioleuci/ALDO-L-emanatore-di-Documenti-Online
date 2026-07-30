import { Email } from '../../../src/domain/value-objects/Email';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { MateriaSpecificaId } from '../../../src/domain/value-objects/MateriaSpecificaId';
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

test('MateriaSpecificaId: parses MATERIA.SPECIFICA, exposes materia/specifica/value', () => {
  const id = MateriaSpecificaId.of('INTERPRET.CHITARRA');
  expect(id.value).toBe('INTERPRET.CHITARRA');
  expect(id.materia()).toEqual(MateriaId.of('INTERPRET'));
  expect(id.specifica()).toBe('CHITARRA');
});

test('MateriaSpecificaId: rejects missing dot, invalid materia part, invalid specifica part', () => {
  expect(() => MateriaSpecificaId.of('INTERPRET')).toThrow(ValidationError);
  expect(() => MateriaSpecificaId.of('interpret.chitarra')).toThrow(ValidationError);
  expect(() => MateriaSpecificaId.of('INTERPRETAZIONE.CHITARRA')).toThrow(ValidationError);
  expect(() => MateriaSpecificaId.of('INTERPRET.c')).toThrow(ValidationError);
  expect(() => MateriaSpecificaId.of('INTERPRET.9CHITARRA')).toThrow(ValidationError);
});

test('equality by value', () => {
  expect(ClasseId.of('3B').equals(ClasseId.of('3B'))).toBe(true);
  expect(ClasseId.of('3B').equals(ClasseId.of('3A'))).toBe(false);
});
