import { Specification } from './Specification';
import type { Materia } from '../entities/Materia';
import type { IndirizzoId } from '../value-objects/IndirizzoId';

/** Materie that are the FIRST exam paper for an indirizzo (ref 07 §4). In-memory only. */
export class MaterieEsamePrimaSpec extends Specification<Materia> {
  constructor(private readonly indirizzo: IndirizzoId) {
    super();
  }
  isSatisfiedBy(candidate: Materia): boolean {
    return candidate.esameConfig?.isPrimaProvaPerIndirizzo(this.indirizzo) ?? false;
  }
  toQueryObject(): null {
    return null;
  }
}

/** Materie that are the SECOND exam paper for an indirizzo (ref 07 §4). In-memory only. */
export class MaterieEsameSecondaSpec extends Specification<Materia> {
  constructor(private readonly indirizzo: IndirizzoId) {
    super();
  }
  isSatisfiedBy(candidate: Materia): boolean {
    return candidate.esameConfig?.isSecondaProvaPerIndirizzo(this.indirizzo) ?? false;
  }
  toQueryObject(): null {
    return null;
  }
}
