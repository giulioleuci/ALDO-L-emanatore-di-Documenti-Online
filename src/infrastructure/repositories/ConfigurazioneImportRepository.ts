import { ConfigurazioneImport } from '../../domain/entities/ConfigurazioneImport';
import { TABLE } from '../../config/schema';

/**
 * CONF_IMP repository on the DomainRepositoryLib Repository base (PK = ID,
 * ref 06 §10). Small, stable config table, cached for the session.
 */
export class ConfigurazioneImportRepository extends Repository<ConfigurazioneImport> {
  // Named listCache (not `cache`): DomainRepositoryLib's base Repository
  // already owns a `this.cache` field (a CacheService slot used by findById);
  // reusing that name silently breaks findById after this local cache populates.
  private listCache: ConfigurazioneImport[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CONF_IMP, ConfigurazioneImport);
  }

  private all(): ConfigurazioneImport[] {
    if (this.listCache === null) this.listCache = this.findAll();
    return this.listCache;
  }

  /** Enabled import jobs (ref 06 §10). */
  findAttivi(): ConfigurazioneImport[] {
    return this.all().filter((c) => c.isAttivo());
  }

  /** Jobs targeting a given table (ref 06 §10). */
  findByTarget(target: string): ConfigurazioneImport[] {
    return this.all().filter((c) => c.target === target);
  }
}
