import { Specification } from './Specification';
import type { VariazioneCattedra } from '../entities/VariazioneCattedra';
import type { ClasseId } from '../value-objects/ClasseId';
import type { Email } from '../value-objects/Email';
import { COL_VARIAZIONI } from '../../config/schema';

/**
 * Variations covering a class. CLASSI is CSV-containment (wildcard/multi-value),
 * not a plain equality column, so this is not pushdown-eligible (ref ALDO_GLF_AUDIT_RESULTS.md D-4).
 */
export class VariazioniPerClasseSpec extends Specification<VariazioneCattedra> {
  constructor(private readonly classeId: ClasseId) {
    super();
  }
  isSatisfiedBy(v: VariazioneCattedra): boolean {
    return v.applicaAClasse(this.classeId);
  }
}

/** Variations by titolare — plain equality on TITOLARE, pushdown-eligible. */
export class VariazioniPerTitolareSpec extends EqualityFieldSpec<VariazioneCattedra> {
  constructor(email: Email) {
    super(COL_VARIAZIONI.TITOLARE, (variazione) => variazione.titolare, email.value);
  }
}
