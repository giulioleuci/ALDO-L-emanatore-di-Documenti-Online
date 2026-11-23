import { Materia } from '../../domain/entities/Materia';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import { TABLE } from '../../config/schema';

/**
 * MATERIE repository on the DomainRepositoryLib Repository base. Small, stable
 * lookup table: loaded once and cached for the session (ref 06 §4/§Caching).
 */
export class MateriaRepository extends Repository<Materia> implements IMateriaRepository {
  // Named listCache (not `cache`): DomainRepositoryLib's base Repository
  // already owns a `this.cache` field (a CacheService slot used by findById);
  // reusing that name silently breaks findById after this local cache populates.
  private listCache: Materia[] | null = null;
  private sigleCache: string[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.MATERIE, Materia);
  }

  private all(): Materia[] {
    if (this.listCache === null) this.listCache = this.findAll();
    return this.listCache;
  }

  findAllCached(): Materia[] {
    return this.all().slice();
  }

  /** Cached list of MATERIE ids (sigle), non-empty only (ref 06 §4/§Caching). */
  findAllSigle(): string[] {
    if (this.sigleCache === null) {
      this.sigleCache = this.all()
        .map((m) => m.id ?? '')
        .filter((s) => s !== '');
    }
    return this.sigleCache;
  }

  findByIdCached(id: MateriaId): Materia | null {
    return this.all().find((m) => m.id === id.value) ?? null;
  }

  findSpecifiche(materia: MateriaId): Materia[] {
    const prefix = `${materia.value}.`;
    return this.all().filter((m) => typeof m.id === 'string' && m.id.startsWith(prefix));
  }
}
