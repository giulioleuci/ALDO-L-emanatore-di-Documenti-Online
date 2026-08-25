import { Specification } from './Specification';
import type { Classe } from '../entities/Classe';
import type { IndirizzoId } from '../value-objects/IndirizzoId';
import { COL_CLASSI } from '../../config/schema';

/** Active classes (ref 06 §3). */
export class ClassiAttiveSpec extends EqualityFieldSpec<Classe> {
  constructor() {
    super(COL_CLASSI.ATTIVA, (classe) => classe.getDynamicColumns()[COL_CLASSI.ATTIVA], true);
  }
}

/**
 * Classes for a given school year. Not pushdown-eligible: sheet-sourced ANNO
 * cells may come back as strings, so this needs the numeric coercion the
 * equality-only pushdown builder doesn't perform (ref infrastructure/db/Database.ts).
 */
export class ClassiPerAnnoSpec extends Specification<Classe> {
  constructor(private readonly anno: number) {
    super();
  }
  isSatisfiedBy(c: Classe): boolean {
    return c.anno.value === this.anno;
  }
}

/** Classes in a given indirizzo (ref 06 §3). */
export class ClassiPerIndirizzoSpec extends EqualityFieldSpec<Classe> {
  constructor(indirizzoId: IndirizzoId) {
    super(COL_CLASSI.INDIRIZZO, (classe) => classe.indirizzo, indirizzoId.value);
  }
}

/** Classes belonging to an articolazione group (non-empty ARTICOLAZIONE JSON). Non-equality predicate: not pushdown-eligible. */
export class ClassiArticolateSpec extends Specification<Classe> {
  isSatisfiedBy(c: Classe): boolean {
    const a = c.getDynamicColumns()[COL_CLASSI.ARTICOLAZIONE];
    return typeof a === 'string' && a.trim().length > 0;
  }
}
