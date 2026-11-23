import { Docente } from './Docente';
import { MateriaId } from '../value-objects/MateriaId';
import { ValidationError } from '../errors/DomainError';

export interface Cattedra {
  materia: MateriaId;
  docente: Docente;
}

export class ConsiglioDiClasse {
  constructor(public readonly cattedre: Cattedra[]) {
    const seen = new Set<string>();
    for (const c of cattedre) {
      const key = `${c.materia.value}::${c.docente.email.value}`;
      if (seen.has(key)) {
        throw new ValidationError(`Cattedra duplicata: ${key}`);
      }
      seen.add(key);
    }
  }
}
