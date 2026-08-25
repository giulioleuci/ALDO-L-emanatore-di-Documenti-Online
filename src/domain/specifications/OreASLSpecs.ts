import { Specification } from './Specification';
import type { OreASL } from '../entities/OreASL';
import type { Email } from '../value-objects/Email';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';
import { COL_ASL } from '../../config/schema';

/** ASL records of a student (ref 06 §16). */
export class OreASLPerAlunnoSpec extends Specification<OreASL> {
  constructor(private readonly email: Email) {
    super();
  }
  isSatisfiedBy(o: OreASL): boolean {
    return o.studente === this.email.value;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_ASL.STUDENTE]: this.email.value };
  }
}

/** ASL records for a given school year (ref 06 §16). */
export class OreASLPerAnnoSpec extends Specification<OreASL> {
  constructor(private readonly anno: AnnoScolastico) {
    super();
  }
  isSatisfiedBy(o: OreASL): boolean {
    return o.anno === this.anno.value;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_ASL.ANNO]: this.anno.value };
  }
}
