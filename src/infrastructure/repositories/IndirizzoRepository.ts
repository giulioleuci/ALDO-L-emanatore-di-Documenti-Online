import { Indirizzo } from '../../domain/entities/Indirizzo';
import { IndirizziPerTipoSpec } from '../../domain/specifications/IndirizziPerTipoSpec';
import type { IndirizzoId } from '../../domain/value-objects/IndirizzoId';
import { TABLE } from '../../config/schema';

/**
 * INDIRIZZI repository on the DomainRepositoryLib Repository base. INDIRIZZI is a
 * small, stable lookup table: it is loaded once and cached in memory for the
 * session (ref 06 §Caching).
 */
export class IndirizzoRepository extends Repository<Indirizzo> {
  // Named listCache (not `cache`): DomainRepositoryLib's base Repository
  // already owns a `this.cache` field (a CacheService slot used by findById);
  // reusing that name silently breaks findById after this local cache populates.
  private listCache: Indirizzo[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.INDIRIZZI, Indirizzo);
  }

  /** All indirizzi, loaded once and cached for the session. */
  private all(): Indirizzo[] {
    if (this.listCache === null) this.listCache = this.findAll();
    return this.listCache;
  }

  findAllCached(): Indirizzo[] {
    return this.all().slice();
  }

  findByIdCached(id: IndirizzoId): Indirizzo | null {
    return this.all().find((i) => i.id === id.value) ?? null;
  }

  findByTipo(tipo: string): Indirizzo[] {
    const spec = new IndirizziPerTipoSpec(tipo);
    return this.all().filter((i) => spec.isSatisfiedBy(i));
  }
}
