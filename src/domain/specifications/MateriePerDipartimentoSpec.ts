import type { Specification } from './Specification';
import type { Materia } from '../entities/Materia';
import type { Dipartimento } from '../entities/Dipartimento';

/**
 * Materie belonging to a department (ref 07 §4). Keyed by the Dipartimento entity
 * (whose MATERIE CSV lists its subjects) to keep the spec in the domain layer —
 * no repository dependency. In-memory only (toQueryObject null).
 */
export class MateriePerDipartimentoSpec implements Specification<Materia> {
  private readonly materieIds: Set<string>;
  constructor(dipartimento: Dipartimento) {
    this.materieIds = new Set(dipartimento.getMaterieIds().map((m) => m.value));
  }
  isSatisfiedBy(candidate: Materia): boolean {
    return candidate.id !== null && this.materieIds.has(candidate.id);
  }
  toQueryObject(): null {
    return null;
  }
}
