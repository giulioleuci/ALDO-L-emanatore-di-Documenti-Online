import { Docente } from '../../../src/domain/entities/Docente';
import { Classe } from '../../../src/domain/entities/Classe';
import { Email } from '../../../src/domain/value-objects/Email';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { AnnoCorso } from '../../../src/domain/value-objects/AnnoCorso';
import { Genere } from '../../../src/domain/value-objects/enums';

test('Docente appellativo from genere (03/04)', () => {
  const d = new Docente(Email.of('rossi@school.it'), 'ROSSI', 'MARIO', Genere.M);
  expect(d.nomeConAppellativo()).toBe('Prof. ROSSI MARIO');
  expect(d.cognomeNome()).toBe('ROSSI MARIO');
});

test('Classe exposes anagrafica', () => {
  const c = new Classe(ClasseId.of('5A'), '5A', AnnoCorso.of(5), 'SCIENTIFICO');
  expect(c.nome).toBe('5A');
  expect(c.anno.value).toBe(5);
});
