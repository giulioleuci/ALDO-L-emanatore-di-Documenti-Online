import { Email } from '../value-objects/Email';
import { AnnoScolastico } from '../value-objects/AnnoScolastico';
import { COL_ASL } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface OreASLData {
  [key: string]: unknown;
}

/**
 * ASL entity — cumulative PCTO hours per student per school year. Composite PK
 * (STUDENTE, ANNO); no single-column id (ref 01/04 §17). Part of the Alunno
 * aggregate.
 */
export class OreASL extends AldoEntity {
  public readonly studente: string;
  public readonly anno: string;
  private ore: number;

  constructor(data: OreASLData = {}) {
    super(data);
    this.studente =
      typeof data[COL_ASL.STUDENTE] === 'string' ? (data[COL_ASL.STUDENTE] as string) : '';
    this.anno = typeof data[COL_ASL.ANNO] === 'string' ? (data[COL_ASL.ANNO] as string) : '';
    this.ore = typeof data[COL_ASL.ORE] === 'number' ? (data[COL_ASL.ORE] as number) : 0;
    // Synthetic composite id for identity-map purposes; not a persisted column.
    this.id = this.studente && this.anno ? `${this.studente}::${this.anno}` : null;
  }

  /** Hours accumulated in the year (ref 04 §17). */
  getOre(): number {
    return this.ore;
  }

  override toData(): EntityData {
    return {
      [COL_ASL.STUDENTE]: this.studente,
      [COL_ASL.ANNO]: this.anno,
      [COL_ASL.ORE]: this.ore
    };
  }

  static fromData(data: OreASLData): OreASL {
    return new OreASL(data);
  }

  /** New record for a student/year with zero hours (feeds getOrCreate, ref 06 §16). */
  static create(studente: Email, anno: AnnoScolastico): OreASL {
    return new OreASL({
      [COL_ASL.STUDENTE]: studente.value,
      [COL_ASL.ANNO]: anno.value,
      [COL_ASL.ORE]: 0
    });
  }
}
