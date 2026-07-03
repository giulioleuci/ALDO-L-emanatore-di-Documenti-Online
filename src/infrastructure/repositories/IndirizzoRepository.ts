import { Indirizzo } from '../../domain/entities/Indirizzo';
import { IndirizziPerTipoSpec } from '../../domain/specifications/IndirizziPerTipoSpec';
import type { IndirizzoId } from '../../domain/value-objects/IndirizzoId';
import type { TipoIstituto } from '../../domain/value-objects/enums';
import { TABLE } from '../../config/schema';

/**
 * INDIRIZZI repository on the DomainRepositoryLib Repository base. INDIRIZZI is a
 * small, stable lookup table: it is loaded once and cached in memory for the
 * session (ref 06 §Caching).
 */
export class IndirizzoRepository extends Repository<Indirizzo> {
  private cache: Indirizzo[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.INDIRIZZI, Indirizzo);
  }

  /** All indirizzi, loaded once and cached for the session. */
  private all(): Indirizzo[] {
    if (this.cache === null) this.cache = this.findAll();
    return this.cache;
  }

  findAllCached(): Indirizzo[] {
    return this.all().slice();
  }

  findByIdCached(id: IndirizzoId): Indirizzo | null {
    return this.all().find((i) => i.id === id.value) ?? null;
  }

  findByTipo(tipo: TipoIstituto): Indirizzo[] {
    const spec = new IndirizziPerTipoSpec(tipo);
    return this.all().filter((i) => spec.isSatisfiedBy(i));
  }
}
