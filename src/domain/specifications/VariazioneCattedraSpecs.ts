import { Specification } from './Specification';
import type { VariazioneCattedra } from '../entities/VariazioneCattedra';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';
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

/**
 * Variations covering a subject. MATERIE is CSV-containment, not pushdown-eligible
 * (ref ALDO_GLF_AUDIT_RESULTS.md D-4).
 */
export class VariazioniPerMateriaSpec extends Specification<VariazioneCattedra> {
  constructor(private readonly materiaId: MateriaId) {
    super();
  }
  isSatisfiedBy(v: VariazioneCattedra): boolean {
    return v.applicaAMateria(this.materiaId);
  }
}

/** Variations by new titolare — plain equality on NUOVO_TITOLARE, pushdown-eligible. */
export class VariazioniPerNuovoTitolareSpec extends Specification<VariazioneCattedra> {
  constructor(private readonly email: Email) {
    super();
  }
  isSatisfiedBy(v: VariazioneCattedra): boolean {
    return v.nuovoTitolare === this.email.value;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_VARIAZIONI.NUOVO_TITOLARE]: this.email.value };
  }
}

/** Variations by titolare — plain equality on TITOLARE, pushdown-eligible. */
export class VariazioniPerTitolareSpec extends Specification<VariazioneCattedra> {
  constructor(private readonly email: Email) {
    super();
  }
  isSatisfiedBy(v: VariazioneCattedra): boolean {
    return v.titolare === this.email.value;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_VARIAZIONI.TITOLARE]: this.email.value };
  }
}
