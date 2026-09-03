import { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { IConfigurazioneEmailRepository } from '../../domain/repositories/IConfigurazioneEmailRepository';
import type { ProcessoInvio } from '../../domain/value-objects/enums';
import { TABLE } from '../../config/schema';

/**
 * CONF_MAIL repository on the DomainRepositoryLib Repository base (PK = ID,
 * ref 06 §9). Small, stable config table, cached for the session.
 */
export class ConfigurazioneEmailRepository
  extends Repository<ConfigurazioneEmail>
  implements IConfigurazioneEmailRepository
{
  // Named listCache (not `cache`): DomainRepositoryLib's base Repository
  // already owns a `this.cache` field (a CacheService slot used by findById);
  // reusing that name silently breaks findById after this local cache populates.
  private listCache: ConfigurazioneEmail[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CONF_MAIL, ConfigurazioneEmail);
  }

  private all(): ConfigurazioneEmail[] {
    if (this.listCache === null) this.listCache = this.findAll();
    return this.listCache;
  }

  /** Patterns of a given recipient-iteration process (ref 06 §9). */
  findByProcesso(processo: ProcessoInvio): ConfigurazioneEmail[] {
    return this.all().filter((c) => c.processo === processo);
  }
}
