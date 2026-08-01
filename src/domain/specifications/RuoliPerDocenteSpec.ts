import { Specification } from './Specification';
import type { RuoloSpeciale } from '../entities/RuoloSpeciale';
import type { Email } from '../value-objects/Email';
import { COL_RUOLI } from '../../config/schema';

/**
 * RUOLI held by a given teacher (ref 07 §14). DOCENTE is a CSV, so the match is
 * by containment in memory; toQueryObject is only a SheetDBLib narrowing hint.
 */
export class RuoliPerDocenteSpec extends Specification<RuoloSpeciale> {
  constructor(private readonly email: Email) {
    super();
  }
  isSatisfiedBy(candidate: RuoloSpeciale): boolean {
    return candidate.hasDocente(this.email);
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_RUOLI.DOCENTE]: this.email.value };
  }
}
