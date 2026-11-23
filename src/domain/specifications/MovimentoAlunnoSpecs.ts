import type { MovimentoAlunno } from '../entities/MovimentoAlunno';
import type { Email } from '../value-objects/Email';
import { COL_MOV_ALUNNI } from '../../config/schema';

/** Mobility records of a student (ref 06 §15). */
export class MovimentiPerAlunnoSpec extends EqualityFieldSpec<MovimentoAlunno> {
  constructor(email: Email) {
    super(COL_MOV_ALUNNI.STUDENTE, (movimento) => movimento.studente, email.value);
  }
}
