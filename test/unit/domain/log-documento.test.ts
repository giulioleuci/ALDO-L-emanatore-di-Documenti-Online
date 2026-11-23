import { LogDocumento } from '../../../src/domain/entities/LogDocumento';

test('LogDocumento.getUtenti parses the UTENTI CSV column', () => {
  const doc = LogDocumento.fromData({ ID: 'd1', UTENTI: 'a1@school.it, a2@school.it' });
  expect(doc.getUtenti()).toEqual(['a1@school.it', 'a2@school.it']);
});

test('LogDocumento.getUtenti returns an empty array when UTENTI is unset', () => {
  const doc = LogDocumento.fromData({ ID: 'd1' });
  expect(doc.getUtenti()).toEqual([]);
});

test('LogDocumento.containsMateria matches a sigla within the MATERIE CSV column', () => {
  const doc = LogDocumento.fromData({ ID: 'd1', MATERIE: 'ITA, STO' });
  expect(doc.containsMateria('ITA')).toBe(true);
  expect(doc.containsMateria('STO')).toBe(true);
  expect(doc.containsMateria('MAT')).toBe(false);
});

test('LogDocumento.containsMateria returns false when MATERIE is unset', () => {
  const doc = LogDocumento.fromData({ ID: 'd1' });
  expect(doc.containsMateria('ITA')).toBe(false);
});
