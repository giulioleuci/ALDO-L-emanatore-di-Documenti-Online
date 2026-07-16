import { MasterConfig } from '../../domain/entities/MasterConfig';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import { EntityNotFoundError } from '../../domain/errors/DomainError';
import { TABLE } from '../../config/schema';

/**
 * Master Sheet repository (PK = ANNO_SCOLASTICO, ref 06 §0). The only component
 * that knows the Master Sheet: it maps school years to their physical year
 * databases and is the entry point for DatabaseService init. Fully cached. The
 * sheet is ALWAYS kept in descending ANNO_SCOLASTICO order, so the first row is
 * always the current year — no computation, no global "current year" flag.
 */
export class MasterSheetRepository
  extends Repository<MasterConfig>
  implements IMasterSheetRepository
{
  // Named listCache (not `cache`): DomainRepositoryLib's base Repository
  // already owns a `this.cache` field (a CacheService slot used by findById);
  // reusing that name silently breaks findById after this local cache populates.
  private listCache: MasterConfig[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.MASTER, MasterConfig);
  }

  private all(): MasterConfig[] {
    if (this.listCache === null) this.listCache = this.findAll();
    return this.listCache;
  }

  /** Config for a specific school year (YYYY-YYYY), or null (ref 06 §0). */
  findConfigPerAnno(anno: string): MasterConfig | null {
    return this.all().find((m) => m.annoScolasticoRaw === anno) ?? null;
  }

  /** Current-year config: the first (top) row of the descending-ordered sheet (ref 06 §0). */
  findConfigAnnoCorrente(): MasterConfig {
    const first = this.all()[0];
    if (first === undefined)
      throw new EntityNotFoundError('Master Sheet vuoto: nessun anno configurato');
    return first;
  }

  /** Up to `limit` historical years — the rows after the first (ref 06 §0). */
  findAnniStorici(limit: number): MasterConfig[] {
    return this.all().slice(1, 1 + Math.max(0, limit));
  }

  getSpreadsheetId(config: MasterConfig): string {
    return config.idSpreadsheet;
  }
  getCartellaRoot(config: MasterConfig): string {
    return config.idCartellaRoot;
  }
  getDirigente(config: MasterConfig): string {
    return config.dirigente;
  }
}
