import { Docente } from '../../../../src/domain/entities/Docente';
import { COL_DOCENTI } from '../../../../src/config/schema';

test('Docente.getOrePot defaults to 0 when ORE_POT is absent', () => {
  const docente = new Docente({ [COL_DOCENTI.EMAIL]: 'p@school.it' });
  expect(docente.getOrePot()).toBe(0);
});

test('Docente.getOrePot reads a positive ORE_POT value', () => {
  const docente = new Docente({ [COL_DOCENTI.EMAIL]: 'p@school.it', [COL_DOCENTI.ORE_POT]: 3 });
  expect(docente.getOrePot()).toBe(3);
});

test('Docente.toData round-trips ORE_POT', () => {
  const docente = new Docente({ [COL_DOCENTI.EMAIL]: 'p@school.it', [COL_DOCENTI.ORE_POT]: 2 });
  expect(docente.toData()[COL_DOCENTI.ORE_POT]).toBe(2);
});
