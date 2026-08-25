import { Specification } from './Specification';
import type { Piano } from '../entities/Piano';
import type { Alunno } from '../entities/Alunno';
import type { Email } from '../value-objects/Email';
import type { TipoPiano } from '../value-objects/enums';
import { COL_PIANI } from '../../config/schema';

/** PIANI of a student (ref 07 §8). */
export class PianiPerAlunnoSpec extends EqualityFieldSpec<Piano> {
  constructor(email: Email) {
    super(COL_PIANI.STUDENTE, (piano) => piano.studente, email.value);
  }
}

/** PIANI of a given type (ref 07 §8). */
export class PianiPerTipoSpec extends EqualityFieldSpec<Piano> {
  constructor(tipo: TipoPiano) {
    super(COL_PIANI.TIPO, (piano) => piano.tipo, tipo);
  }
}

/**
 * Students with at least one BES plan (ref 07 §1). Domain-pure: keyed by the set
 * of BES student emails (resolved by PianoRepository by the caller), so the spec
 * does not depend on infrastructure. In-memory only.
 */
export class AlunniBESSpec extends Specification<Alunno> {
  constructor(private readonly besStudentEmails: Set<string>) {
    super();
  }
  isSatisfiedBy(a: Alunno): boolean {
    return this.besStudentEmails.has(a.email.value);
  }
  static fromPiani(besStudentEmails: Iterable<string>): AlunniBESSpec {
    return new AlunniBESSpec(new Set(besStudentEmails));
  }
}
