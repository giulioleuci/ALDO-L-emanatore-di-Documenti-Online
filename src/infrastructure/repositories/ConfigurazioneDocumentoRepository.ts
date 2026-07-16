import { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { IExpressionEngine } from '../facades/ExpressionEngineFacade';
import { PipelineError } from '../../domain/errors/DomainError';
import { TABLE } from '../../config/schema';

interface ModelloCondizionale {
  condizione?: string;
  templateId?: string;
}

/**
 * CONF_DOC repository on the DomainRepositoryLib Repository base (PK = ID,
 * ref 06 §8). Small, stable config table, cached for the session. Conditional
 * generation and conditional template selection are evaluated through
 * GasExpressionEngineLib (via IExpressionEngine), never in-house.
 */
export class ConfigurazioneDocumentoRepository extends Repository<ConfigurazioneDocumento> {
  // Named listCache (not `cache`): DomainRepositoryLib's base Repository
  // already owns a `this.cache` field (a CacheService slot used by findById);
  // reusing that name silently breaks findById after this local cache populates.
  private listCache: ConfigurazioneDocumento[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CONF_DOC, ConfigurazioneDocumento);
  }

  private all(): ConfigurazioneDocumento[] {
    if (this.listCache === null) this.listCache = this.findAll();
    return this.listCache;
  }

  findAllCached(): ConfigurazioneDocumento[] {
    return this.all().slice();
  }

  /** Configs of a document macro-category (ref 06 §8). */
  findByTipo(tipo: string): ConfigurazioneDocumento[] {
    return this.all().filter((c) => c.tipo === tipo);
  }

  /** Simple-form Drive template id, or null (ref 06 §8). */
  getTemplateId(config: ConfigurazioneDocumento): string | null {
    return config.getTemplateIdSemplice();
  }

  /**
   * Whether the document must be generated for the given CDU context (ref 06 §8,
   * 10 Step 1): no CONDIZIONE → true; otherwise the expression is evaluated by
   * GasExpressionEngineLib with the CDU as the `{{...}}` context.
   */
  shouldGenerate(
    config: ConfigurazioneDocumento,
    context: Record<string, unknown>,
    engine: IExpressionEngine
  ): boolean {
    const condizione = config.getCondizione();
    return condizione === null || engine.evaluateBoolean(condizione, context);
  }

  /**
   * Resolves the Drive template id, supporting both MODELLI forms (ref 10 Step 6):
   * the simple object `{templateId}`, or a conditional array whose first entry
   * with a satisfied `condizione` (evaluated by GasExpressionEngineLib) wins.
   * Throws when no template applies.
   */
  resolveTemplateId(
    config: ConfigurazioneDocumento,
    context: Record<string, unknown>,
    engine: IExpressionEngine
  ): string {
    const json = config.getModelliJson();
    if (Array.isArray(json)) {
      for (const modello of json as ModelloCondizionale[]) {
        const cond = modello.condizione;
        if (
          typeof modello.templateId === 'string' &&
          (cond === undefined || cond === 'true' || engine.evaluateBoolean(cond, context))
        ) {
          return modello.templateId;
        }
      }
      throw new PipelineError(
        `CONF_DOC ${config.id ?? '?'}: nessun template applicabile per il contesto`
      );
    }
    const semplice = config.getTemplateIdSemplice();
    if (semplice === null)
      throw new PipelineError(`CONF_DOC ${config.id ?? '?'}: MODELLI privo di templateId`);
    return semplice;
  }
}
