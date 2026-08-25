import type { OreASL } from '../entities/OreASL';
import type { Email } from '../value-objects/Email';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';
import { COL_ASL } from '../../config/schema';

/** ASL records of a student (ref 06 §16). */
export class OreASLPerAlunnoSpec extends EqualityFieldSpec<OreASL> {
  constructor(email: Email) {
    super(COL_ASL.STUDENTE, (ore) => ore.studente, email.value);
  }
}

/** ASL records for a given school year (ref 06 §16). */
export class OreASLPerAnnoSpec extends EqualityFieldSpec<OreASL> {
  constructor(anno: AnnoScolastico) {
    super(COL_ASL.ANNO, (ore) => ore.anno, anno.value);
  }
}
