import { ValoreCarenza } from '../../../src/domain/value-objects/ValoreCarenza';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('fromCella classifies numeric cells as VOTO, text as NOTA', () => {
  const voto = ValoreCarenza.fromCella('4.5');
  expect(voto?.isVoto()).toBe(true);
  expect(voto?.valore).toBe(4.5);

  const nota = ValoreCarenza.fromCella('Studio scarso');
  expect(nota?.isNota()).toBe(true);
  expect(nota?.toString()).toBe('Studio scarso');

  expect(ValoreCarenza.fromCella(5)).toEqual(ValoreCarenza.voto(5));
});

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
