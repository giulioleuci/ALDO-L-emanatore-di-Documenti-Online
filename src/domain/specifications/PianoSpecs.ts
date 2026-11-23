import type { Piano } from '../entities/Piano';
import type { Email } from '../value-objects/Email';
import { COL_PIANI } from '../../config/schema';

/** PIANI of a student (ref 07 §8). */
export class PianiPerAlunnoSpec extends EqualityFieldSpec<Piano> {
  constructor(email: Email) {
    super(COL_PIANI.STUDENTE, (piano) => piano.studente, email.value);
  }
}
