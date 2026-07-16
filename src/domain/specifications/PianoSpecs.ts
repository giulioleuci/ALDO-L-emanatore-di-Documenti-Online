import type { Specification } from './Specification';
import type { Piano } from '../entities/Piano';
import type { Alunno } from '../entities/Alunno';
import type { Email } from '../value-objects/Email';
import type { TipoPiano } from '../value-objects/enums';
import { COL_PIANI } from '../../config/schema';

/** PIANI of a student (ref 07 §8). */
export class PianiPerAlunnoSpec implements Specification<Piano> {
  constructor(private readonly email: Email) {}
  isSatisfiedBy(p: Piano): boolean {
    return p.studente === this.email.value;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_PIANI.STUDENTE]: this.email.value };
  }
}

/** PIANI of a given type (ref 07 §8). */
export class PianiPerTipoSpec implements Specification<Piano> {
  constructor(private readonly tipo: TipoPiano) {}
  isSatisfiedBy(p: Piano): boolean {
    return p.tipo === this.tipo;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_PIANI.TIPO]: this.tipo };
  }
}

/**
 * Students with at least one BES plan (ref 07 §1). Domain-pure: keyed by the set
 * of BES student emails (resolved by PianoRepository by the caller), so the spec
 * does not depend on infrastructure. In-memory only.
 */
export class AlunniBESSpec implements Specification<Alunno> {
  constructor(private readonly besStudentEmails: Set<string>) {}
  isSatisfiedBy(a: Alunno): boolean {
    return this.besStudentEmails.has(a.email.value);
  }
  toQueryObject(): null {
    return null;
  }
  static fromPiani(besStudentEmails: Iterable<string>): AlunniBESSpec {
    return new AlunniBESSpec(new Set(besStudentEmails));
  }
}
