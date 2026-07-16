import type { Specification } from './Specification';
import type { OreASL } from '../entities/OreASL';
import type { Email } from '../value-objects/Email';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';
import { COL_ASL } from '../../config/schema';

/** ASL records of a student (ref 06 §16). */
export class OreASLPerAlunnoSpec implements Specification<OreASL> {
  constructor(private readonly email: Email) {}
  isSatisfiedBy(o: OreASL): boolean {
    return o.studente === this.email.value;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_ASL.STUDENTE]: this.email.value };
  }
}

/** ASL records for a given school year (ref 06 §16). */
export class OreASLPerAnnoSpec implements Specification<OreASL> {
  constructor(private readonly anno: AnnoScolastico) {}
  isSatisfiedBy(o: OreASL): boolean {
    return o.anno === this.anno.value;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_ASL.ANNO]: this.anno.value };
  }
}
