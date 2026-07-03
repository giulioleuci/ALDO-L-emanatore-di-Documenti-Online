import type { Specification } from './Specification';
import type { Materia } from '../entities/Materia';
import type { IndirizzoId } from '../value-objects/IndirizzoId';

/** Materie that are the FIRST exam paper for an indirizzo (ref 07 §4). In-memory only. */
export class MaterieEsamePrimaSpec implements Specification<Materia> {
  constructor(private readonly indirizzo: IndirizzoId) {}
  isSatisfiedBy(candidate: Materia): boolean {
    return candidate.esameConfig?.isPrimaProvaPerIndirizzo(this.indirizzo) ?? false;
  }
  toQueryObject(): null {
    return null;
  }
}

/** Materie that are the SECOND exam paper for an indirizzo (ref 07 §4). In-memory only. */
export class MaterieEsameSecondaSpec implements Specification<Materia> {
  constructor(private readonly indirizzo: IndirizzoId) {}
  isSatisfiedBy(candidate: Materia): boolean {
    return candidate.esameConfig?.isSecondaProvaPerIndirizzo(this.indirizzo) ?? false;
  }
  toQueryObject(): null {
    return null;
  }
}
