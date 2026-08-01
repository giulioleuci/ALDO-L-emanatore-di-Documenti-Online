import { Specification } from './Specification';
import type { Classe } from '../entities/Classe';
import type { IndirizzoId } from '../value-objects/IndirizzoId';
import { COL_CLASSI } from '../../config/schema';

/** Active classes (ref 06 §3). */
export class ClassiAttiveSpec extends Specification<Classe> {
  isSatisfiedBy(c: Classe): boolean {
    return c.getDynamicColumns()[COL_CLASSI.ATTIVA] === true;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_CLASSI.ATTIVA]: true };
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
  toQueryObject(): null {
    return null;
  }
}

/** Classes in a given indirizzo (ref 06 §3). */
export class ClassiPerIndirizzoSpec extends Specification<Classe> {
  constructor(private readonly indirizzoId: IndirizzoId) {
    super();
  }
  isSatisfiedBy(c: Classe): boolean {
    return c.indirizzo === this.indirizzoId.value;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_CLASSI.INDIRIZZO]: this.indirizzoId.value };
  }
}

/** Classes belonging to an articolazione group (non-empty ARTICOLAZIONE JSON). Non-equality predicate: not pushdown-eligible. */
export class ClassiArticolateSpec extends Specification<Classe> {
  isSatisfiedBy(c: Classe): boolean {
    const a = c.getDynamicColumns()[COL_CLASSI.ARTICOLAZIONE];
    return typeof a === 'string' && a.trim().length > 0;
  }
  toQueryObject(): null {
    return null;
  }
}
