import { RuoloSpeciale } from '../../domain/entities/RuoloSpeciale';
import type { IRuoloSpecialeRepository } from '../../domain/repositories/IRuoloSpecialeRepository';
import { RuoliPerDocenteSpec } from '../../domain/specifications/RuoliPerDocenteSpec';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE } from '../../config/schema';

/**
 * RUOLI repository on the DomainRepositoryLib Repository base. Small, stable
 * lookup table: loaded once and cached for the session (ref 06 §7/§Caching).
 */
export class RuoloSpecialeRepository
  extends Repository<RuoloSpeciale>
  implements IRuoloSpecialeRepository
{
  // Named listCache (not `cache`): DomainRepositoryLib's base Repository
  // already owns a `this.cache` field (a CacheService slot used by findById);
  // reusing that name silently breaks findById after this local cache populates.
  private listCache: RuoloSpeciale[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.RUOLI, RuoloSpeciale);
  }

  private all(): RuoloSpeciale[] {
    if (this.listCache === null) this.listCache = this.findAll();
    return this.listCache;
  }

  findAllCached(): RuoloSpeciale[] {
    return this.all().slice();
  }

  /** Roles held by a teacher — CONTAINS search over the CSV DOCENTE column. */
  findByDocente(email: Email): RuoloSpeciale[] {
    const spec = new RuoliPerDocenteSpec(email);
    return this.all().filter((r) => spec.isSatisfiedBy(r));
  }
}
