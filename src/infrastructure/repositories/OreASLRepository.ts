import { OreASL } from '../../domain/entities/OreASL';
import { OreASLPerAlunnoSpec, OreASLPerAnnoSpec } from '../../domain/specifications/OreASLSpecs';
import type { Alunno } from '../../domain/entities/Alunno';
import type { AnnoScolastico } from '../../domain/value-objects/AnnoScolastico';
import { TABLE } from '../../config/schema';

/**
 * ASL repository on the DomainRepositoryLib Repository base. Composite PK
 * (STUDENTE, ANNO) — base single-key findById does not apply (ref 06 §16);
 * queries load rows and filter in memory. Write-through methods (aggiungiOre)
 * land with the persistence-seam increment.
 */
export class OreASLRepository extends Repository<OreASL> {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.ASL, OreASL);
  }

  /** Records of a student, most recent year first (ref 06 §16). */
  findByAlunno(alunno: Alunno): OreASL[] {
    const spec = new OreASLPerAlunnoSpec(alunno.email);
    return this.findAll().filter((o) => spec.isSatisfiedBy(o)).sort((a, b) => b.anno.localeCompare(a.anno));
  }

  /** All students for a given year (ref 06 §16). */
  findByAnno(anno: AnnoScolastico): OreASL[] {
    const spec = new OreASLPerAnnoSpec(anno);
    return this.findAll().filter((o) => spec.isSatisfiedBy(o));
  }

  /** Existing record, or a fresh in-memory record with ORE = 0 (ref 06 §16). */
  getOrCreate(alunno: Alunno, anno: AnnoScolastico): OreASL {
    const found = this.findByAlunno(alunno).find((o) => o.anno === anno.value);
    return found ?? OreASL.create(alunno.email, anno);
  }

  /** Sum of hours across all the student's years (ref 06 §16). */
  getTotaleOre(alunno: Alunno): number {
    return this.findByAlunno(alunno).reduce((tot, o) => tot + o.getOre(), 0);
  }
}
