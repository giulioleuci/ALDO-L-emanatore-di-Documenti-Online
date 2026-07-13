import type { Specification } from './Specification';
import type { VariazioneCattedra } from '../entities/VariazioneCattedra';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';
import type { Email } from '../value-objects/Email';
import { COL_VARIAZIONI } from '../../config/schema';

/**
 * Variations covering a class. CLASSE_ID is CSV-containment (wildcard/multi-value),
 * not a plain equality column, so this is not pushdown-eligible (ref ALDO_GLF_AUDIT_RESULTS.md D-4).
 */
export class VariazioniPerClasseSpec implements Specification<VariazioneCattedra> {
  constructor(private readonly classeId: ClasseId) {}
  isSatisfiedBy(v: VariazioneCattedra): boolean { return v.applicaAClasse(this.classeId); }
  toQueryObject(): null { return null; }
}

/**
 * Variations covering a subject. MATERIA_ID is CSV-containment, not pushdown-eligible
 * (ref ALDO_GLF_AUDIT_RESULTS.md D-4).
 */
export class VariazioniPerMateriaSpec implements Specification<VariazioneCattedra> {
  constructor(private readonly materiaId: MateriaId) {}
  isSatisfiedBy(v: VariazioneCattedra): boolean { return v.applicaAMateria(this.materiaId); }
  toQueryObject(): null { return null; }
}

/** Variations by new titolare — plain equality on NUOVO_TITOLARE, pushdown-eligible. */
export class VariazioniPerNuovoTitolareSpec implements Specification<VariazioneCattedra> {
  constructor(private readonly email: Email) {}
  isSatisfiedBy(v: VariazioneCattedra): boolean { return v.nuovoTitolare === this.email.value; }
  toQueryObject(): Record<string, unknown> { return { [COL_VARIAZIONI.NUOVO_TITOLARE]: this.email.value }; }
}
