import { StatoDocumento, Genere, appellativo, SchemaSottocartelle } from '../../../src/domain/value-objects/enums';

test('StatoDocumento values match 03', () => {
  expect(StatoDocumento.GENERATO).toBe('GENERATO');
  expect(StatoDocumento.VERBALIZZATO).toBe('VERBALIZZATO');
});

test('appellativo maps Genere per 03', () => {
  expect(appellativo(Genere.M)).toBe('Prof.');
  expect(appellativo(Genere.F)).toBe('Prof.ssa');
});

test('SchemaSottocartelle includes UNO PER CLASSE', () => {
  expect(SchemaSottocartelle.UNO_PER_CLASSE).toBe('UNO PER CLASSE');
});
