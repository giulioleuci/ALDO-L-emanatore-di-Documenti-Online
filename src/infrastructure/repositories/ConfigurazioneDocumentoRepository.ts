import { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { TABLE } from '../../config/schema';

/**
 * CONF_DOC repository on the DomainRepositoryLib Repository base (PK = ID,
 * ref 06 §8). Small, stable config table, cached for the session. Condition
 * evaluation (shouldGenerate via ExpressionEngine) and conditional MODELLI land
 * with the ContextEngine/expression increment.
 */
export class ConfigurazioneDocumentoRepository extends Repository<ConfigurazioneDocumento> {
  private cache: ConfigurazioneDocumento[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CONF_DOC, ConfigurazioneDocumento);
  }

  private all(): ConfigurazioneDocumento[] {
    if (this.cache === null) this.cache = this.findAll();
    return this.cache;
  }

  findAllCached(): ConfigurazioneDocumento[] {
    return this.all().slice();
  }

  /** Configs of a document macro-category (ref 06 §8). */
  findByTipo(tipo: string): ConfigurazioneDocumento[] {
    return this.all().filter((c) => c.tipo === tipo);
  }

  /** Simple-form Drive template id, or null (conditional form lands later, ref 06 §8). */
  getTemplateId(config: ConfigurazioneDocumento): string | null {
    return config.getTemplateIdSemplice();
  }
}
