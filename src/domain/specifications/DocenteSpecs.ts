import { Specification } from './Specification';
import type { Docente } from '../entities/Docente';
import { DipartimentoId } from '../value-objects/DipartimentoId';
import { COL_DOCENTI } from '../../config/schema';

/** Teachers of a department (ref 06 §2). */
export class DocentiPerDipartimentoSpec extends Specification<Docente> {
  constructor(private readonly dipartId: DipartimentoId) {
    super();
  }
  isSatisfiedBy(d: Docente): boolean {
    return DipartimentoId.of(d.dipart).equals(this.dipartId);
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_DOCENTI.DIPART]: this.dipartId.value };
  }
}

/** ITP (laboratory) teachers (ref 06 §2). */
export class DocentiITPSpec extends Specification<Docente> {
  isSatisfiedBy(d: Docente): boolean {
    return d.isITP();
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_DOCENTI.ITP]: true };
  }
}
