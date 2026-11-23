import { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { IConfigurazioneEmailRepository } from '../../domain/repositories/IConfigurazioneEmailRepository';
import { TABLE } from '../../config/schema';

/**
 * CONF_MAIL repository on the DomainRepositoryLib Repository base (PK = ID,
 * ref 06 §9).
 */
export class ConfigurazioneEmailRepository
  extends Repository<ConfigurazioneEmail>
  implements IConfigurazioneEmailRepository
{
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CONF_MAIL, ConfigurazioneEmail);
  }
}
