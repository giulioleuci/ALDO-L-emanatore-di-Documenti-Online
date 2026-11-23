import type { OreASL } from '../entities/OreASL';
import type { Email } from '../value-objects/Email';
import { COL_ASL } from '../../config/schema';

/** ASL records of a student (ref 06 §16). */
export class OreASLPerAlunnoSpec extends EqualityFieldSpec<OreASL> {
  constructor(email: Email) {
    super(COL_ASL.STUDENTE, (ore) => ore.studente, email.value);
  }
}
