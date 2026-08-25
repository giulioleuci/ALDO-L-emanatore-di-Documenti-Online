import { Specification } from './Specification';
import type { RuoloSpeciale } from '../entities/RuoloSpeciale';
import type { Email } from '../value-objects/Email';

/**
 * RUOLI held by a given teacher (ref 07 §14). DOCENTE is a CSV, so the match is
 * by containment in memory. Scalar equality pushdown is unsafe for multi-value cells.
 */
export class RuoliPerDocenteSpec extends Specification<RuoloSpeciale> {
  constructor(private readonly email: Email) {
    super();
  }
  isSatisfiedBy(candidate: RuoloSpeciale): boolean {
    return candidate.hasDocente(this.email);
  }
}
