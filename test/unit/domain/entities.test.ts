import { Docente } from '../../../src/domain/entities/Docente';
import { Classe } from '../../../src/domain/entities/Classe';
import { Genere } from '../../../src/domain/value-objects/enums';

test('Docente appellativo from genere (03/04)', () => {
  const d = new Docente({
    EMAIL: 'rossi@school.it',
    COGNOME: 'ROSSI',
    NOME: 'MARIO',
    GENERE: Genere.M
  });
  expect(d.getNomeCompletoConAppellativo()).toBe('Prof. ROSSI MARIO');
  expect(d.getNomeCompleto()).toBe('ROSSI MARIO');
  expect(d.email.value).toBe('rossi@school.it');
});

test('Classe exposes anagrafica', () => {
  const c = new Classe({ ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO' });
  expect(c.nome).toBe('5A');
  expect(c.anno.value).toBe(5);
  expect(c.indirizzo).toBe('SCIENTIFICO');
});
