import { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { ProcessoInvio } from '../../domain/value-objects/enums';
import { TABLE } from '../../config/schema';

/**
 * CONF_MAIL repository on the DomainRepositoryLib Repository base (PK = ID,
 * ref 06 §9). Small, stable config table, cached for the session.
 */
export class ConfigurazioneEmailRepository extends Repository<ConfigurazioneEmail> {
  private cache: ConfigurazioneEmail[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CONF_MAIL, ConfigurazioneEmail);
  }

  private all(): ConfigurazioneEmail[] {
    if (this.cache === null) this.cache = this.findAll();
    return this.cache;
  }

  findAllCached(): ConfigurazioneEmail[] {
    return this.all().slice();
  }

  /** Patterns of a given recipient-iteration process (ref 06 §9). */
  findByProcesso(processo: ProcessoInvio): ConfigurazioneEmail[] {
    return this.all().filter((c) => c.processo === processo);
  }

  /** BoxConfig array parsed from BOX_CFG (ref 06 §9). */
  getBoxes(config: ConfigurazioneEmail): Record<string, unknown>[] {
    return config.getBoxes();
  }
}
