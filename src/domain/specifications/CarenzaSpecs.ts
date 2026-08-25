import { Specification } from './Specification';
import type { Carenza } from '../entities/Carenza';
import type { Email } from '../value-objects/Email';
import type { ClasseId } from '../value-objects/ClasseId';
import { COL_CARENZE } from '../../config/schema';

/** CARENZE rows of a student (ref 06 §11). */
export class CarenzePerAlunnoSpec extends Specification<Carenza> {
  constructor(private readonly email: Email) {
    super();
  }
  isSatisfiedBy(c: Carenza): boolean {
    return c.studente === this.email.value;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_CARENZE.STUDENTE]: this.email.value };
  }
}

/** CARENZE rows of a class (ref 06 §11). */
export class CarenzePerClasseSpec extends Specification<Carenza> {
  constructor(private readonly classeId: ClasseId) {
    super();
  }
  isSatisfiedBy(c: Carenza): boolean {
    return c.classe === this.classeId.value;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_CARENZE.CLASSE]: this.classeId.value };
  }
}

/** CARENZE rows not yet notified to families (ref 06 §11). In-memory only. */
export class CarenzeNonNotificateSpec extends Specification<Carenza> {
  isSatisfiedBy(c: Carenza): boolean {
    return !c.isNotificato();
  }
}
