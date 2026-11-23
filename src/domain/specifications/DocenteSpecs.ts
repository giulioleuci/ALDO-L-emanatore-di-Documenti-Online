import { Specification } from './Specification';
import type { Docente } from '../entities/Docente';
import { DipartimentoId } from '../value-objects/DipartimentoId';

/**
 * Teachers of a department (ref 06 §2). In-memory only: DipartimentoId.of()
 * normalizes surrounding whitespace, while equality pushdown compares raw cells.
 */
export class DocentiPerDipartimentoSpec extends Specification<Docente> {
  constructor(private readonly dipartId: DipartimentoId) {
    super();
  }
  isSatisfiedBy(d: Docente): boolean {
    return DipartimentoId.of(d.dipart).equals(this.dipartId);
  }
}
