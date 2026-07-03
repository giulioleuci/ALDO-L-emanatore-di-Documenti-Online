import { Materia } from '../../domain/entities/Materia';
import { MaterieEsamePrimaSpec, MaterieEsameSecondaSpec } from '../../domain/specifications/MaterieEsameSpec';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { IndirizzoId } from '../../domain/value-objects/IndirizzoId';
import { TABLE } from '../../config/schema';

/**
 * MATERIE repository on the DomainRepositoryLib Repository base. Small, stable
 * lookup table: loaded once and cached for the session (ref 06 §4/§Caching).
 */
export class MateriaRepository extends Repository<Materia> {
  private cache: Materia[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.MATERIE, Materia);
  }

  private all(): Materia[] {
    if (this.cache === null) this.cache = this.findAll();
    return this.cache;
  }

  findAllCached(): Materia[] {
    return this.all().slice();
  }

  findByIdCached(id: MateriaId): Materia | null {
    return this.all().find((m) => m.id === id.value) ?? null;
  }

  findEsamePrima(indirizzo: IndirizzoId): Materia[] {
    const spec = new MaterieEsamePrimaSpec(indirizzo);
    return this.all().filter((m) => spec.isSatisfiedBy(m));
  }

  findEsameSeconda(indirizzo: IndirizzoId): Materia[] {
    const spec = new MaterieEsameSecondaSpec(indirizzo);
    return this.all().filter((m) => spec.isSatisfiedBy(m));
  }
}
