import {
  StatoDocumento,
  Genere,
  appellativo,
  DuplicazioneDocumento
} from '../../../src/domain/value-objects/enums';

test('StatoDocumento values match 03', () => {
  expect(StatoDocumento.GENERATO).toBe('GENERATO');
  expect(StatoDocumento.VERBALIZZATO).toBe('VERBALIZZATO');
});

test('appellativo maps Genere per 03', () => {
  expect(appellativo(Genere.M)).toBe('Prof.');
  expect(appellativo(Genere.F)).toBe('Prof.ssa');
});

test('DuplicazioneDocumento exposes only the explicit allow/deny policy', () => {
  expect(Object.values(DuplicazioneDocumento).sort()).toEqual(['NEGATA', 'PERMESSA']);
  expect(DuplicazioneDocumento.NEGATA).toBe('NEGATA');
});
