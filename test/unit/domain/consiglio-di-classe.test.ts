import { ConsiglioDiClasse } from '../../../src/domain/entities/ConsiglioDiClasse';
import { Docente } from '../../../src/domain/entities/Docente';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { Genere } from '../../../src/domain/value-objects/enums';
import { ValidationError } from '../../../src/domain/errors/DomainError';

const rossi = new Docente({
  EMAIL: 'rossi@school.it',
  COGNOME: 'ROSSI',
  NOME: 'MARIO',
  GENERE: Genere.M
});

test('rejects duplicate (materia, docente) pair (invariant 05)', () => {
  expect(
    () =>
      new ConsiglioDiClasse([
        { materia: MateriaId.of('MATE'), docente: rossi },
        { materia: MateriaId.of('MATE'), docente: rossi }
      ])
  ).toThrow(ValidationError);
});
