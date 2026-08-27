import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('gli ID stringa trimmano e rifiutano il vuoto', () => {
  expect(ClasseId.of('  3A  ').value).toBe('3A');
  expect(() => ClasseId.of('   ')).toThrow(ValidationError);
  expect(() => ClasseId.of('   ')).toThrow(/ClasseId/);
});

test('MateriaId applica il proprio pattern e nomina se stesso nell errore', () => {
  expect(MateriaId.of('ITA').value).toBe('ITA');
  expect(() => MateriaId.of('ita')).toThrow(/MateriaId/);
});

test('MateriaId trimma gli spazi come ClasseId (comportamento deciso in Task 4)', () => {
  expect(MateriaId.of('  ITA  ').value).toBe('ITA');
});

test('ID di tipi diversi non sono intercambiabili a runtime per valore', () => {
  expect(ClasseId.of('3A').equals(ClasseId.of('3A'))).toBe(true);
  expect(ClasseId.of('3A').equals(ClasseId.of('3B'))).toBe(false);
});
