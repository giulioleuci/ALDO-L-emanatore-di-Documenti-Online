import { ConfigurazioneImport } from '../../domain/entities/ConfigurazioneImport';
import { TABLE } from '../../config/schema';

/**
 * CONF_IMP repository on the DomainRepositoryLib Repository base (PK = ID,
 * ref 06 §10). Small, stable config table, cached for the session.
 */
export class ConfigurazioneImportRepository extends Repository<ConfigurazioneImport> {
  private cache: ConfigurazioneImport[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CONF_IMP, ConfigurazioneImport);
  }

  private all(): ConfigurazioneImport[] {
    if (this.cache === null) this.cache = this.findAll();
    return this.cache;
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
