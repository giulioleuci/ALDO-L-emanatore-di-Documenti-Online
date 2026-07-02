import { ConsiglioDiClasse } from '../../../src/domain/entities/ConsiglioDiClasse';
import { Docente } from '../../../src/domain/entities/Docente';
import { Email } from '../../../src/domain/value-objects/Email';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { Genere } from '../../../src/domain/value-objects/enums';
import { ValidationError } from '../../../src/domain/errors/DomainError';

const rossi = new Docente(Email.of('rossi@school.it'), 'ROSSI', 'MARIO', Genere.M);
const bianchi = new Docente(Email.of('bianchi@school.it'), 'BIANCHI', 'LUCIA', Genere.F);

test('exposes materie and unique docenti', () => {
  const cdc = new ConsiglioDiClasse([
    { materia: MateriaId.of('MATE'), docente: rossi },
    { materia: MateriaId.of('FISI'), docente: bianchi }
  ]);
  expect(cdc.materie().map((m) => m.value)).toEqual(['MATE', 'FISI']);
  expect(cdc.docentiUnici().length).toBe(2);
});

test('rejects duplicate (materia, docente) pair (invariant 05)', () => {
  expect(() => new ConsiglioDiClasse([
    { materia: MateriaId.of('MATE'), docente: rossi },
    { materia: MateriaId.of('MATE'), docente: rossi }
  ])).toThrow(ValidationError);
});
