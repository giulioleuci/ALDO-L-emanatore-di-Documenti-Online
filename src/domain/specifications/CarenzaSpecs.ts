import { Specification } from './Specification';
import type { Carenza } from '../entities/Carenza';
import type { Email } from '../value-objects/Email';
import type { ClasseId } from '../value-objects/ClasseId';
import { COL_CARENZE } from '../../config/schema';

/** CARENZE rows of a student (ref 06 §11). */
export class CarenzePerAlunnoSpec extends EqualityFieldSpec<Carenza> {
  constructor(email: Email) {
    super(COL_CARENZE.STUDENTE, (carenza) => carenza.studente, email.value);
  }
}

/** CARENZE rows of a class (ref 06 §11). */
export class CarenzePerClasseSpec extends EqualityFieldSpec<Carenza> {
  constructor(classeId: ClasseId) {
    super(COL_CARENZE.CLASSE, (carenza) => carenza.classe, classeId.value);
  }
}

/** CARENZE rows not yet notified to families (ref 06 §11). In-memory only. */
export class CarenzeNonNotificateSpec extends Specification<Carenza> {
  isSatisfiedBy(c: Carenza): boolean {
    return !c.isNotificato();
  }
}
