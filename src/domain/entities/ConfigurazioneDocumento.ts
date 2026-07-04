import { FormatoOutput } from '../value-objects/enums';
import { COL_CONF_DOC } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface ConfigurazioneDocumentoData {
  [key: string]: unknown;
}

/**
 * CONF_DOC entity (PK = ID) — declarative definition of a generable document
 * type (ref 04, 06 §8). Aggregate Root correlated to LogDocumento/LogCartella.
 * Condition evaluation (shouldGenerate via ExpressionEngine) and conditional
 * MODELLI selection land with the ContextEngine/expression increment; here the
 * simple-form template id and the static config accessors are provided.
 */
export class ConfigurazioneDocumento extends AldoEntity {
  public readonly tipo: string;
  public readonly generatore: string;
  public readonly formato: FormatoOutput;
  private readonly modelliRaw: string | null;
  private readonly condizioneRaw: string;
  private readonly parametriRaw: string | null;

  constructor(data: ConfigurazioneDocumentoData = {}) {
    super(data);
    this.id = typeof data[COL_CONF_DOC.ID] === 'string' ? (data[COL_CONF_DOC.ID] as string) : null;
    this.tipo = typeof data[COL_CONF_DOC.TIPO] === 'string' ? (data[COL_CONF_DOC.TIPO] as string) : '';
    this.generatore = typeof data[COL_CONF_DOC.GENERATORE] === 'string' ? (data[COL_CONF_DOC.GENERATORE] as string) : '';
    this.formato = (data[COL_CONF_DOC.FORMATO] as FormatoOutput) ?? FormatoOutput.GDOC;
    this.modelliRaw = typeof data[COL_CONF_DOC.MODELLI] === 'string' ? (data[COL_CONF_DOC.MODELLI] as string) : null;
    this.condizioneRaw = typeof data[COL_CONF_DOC.CONDIZIONE] === 'string' ? (data[COL_CONF_DOC.CONDIZIONE] as string) : '';
    this.parametriRaw = typeof data[COL_CONF_DOC.PARAMETRI] === 'string' ? (data[COL_CONF_DOC.PARAMETRI] as string) : null;
  }

  getCondizione(): string | null { return this.condizioneRaw.trim() === '' ? null : this.condizioneRaw; }

  /** True when no condition is set — the unconditional case (ref 06 §8). */
  hasNoCondizione(): boolean { return this.getCondizione() === null; }

  getParametri(): Record<string, unknown> {
    return this.parametriRaw === null ? {} : (JSON.parse(this.parametriRaw) as Record<string, unknown>);
  }

  /** Reserved PARAMETRI.overwrite flag — skips the duplicate check (ref 01, 10 Step 2). */
  isOverwrite(): boolean { return this.getParametri().overwrite === true; }

  getModelli(): Record<string, unknown> {
    return this.modelliRaw === null ? {} : (JSON.parse(this.modelliRaw) as Record<string, unknown>);
  }

  /** Raw parsed MODELLI: the simple object form `{templateId}` or the conditional array. */
  getModelliJson(): unknown {
    return this.modelliRaw === null ? null : JSON.parse(this.modelliRaw);
  }

  /** Template id in the simple MODELLI form {"templateId": "..."}; null otherwise (ref 06 §8). */
  getTemplateIdSemplice(): string | null {
    const t = this.getModelli().templateId;
    return typeof t === 'string' && t.length > 0 ? t : null;
  }

  override toData(): EntityData {
    return {
      [COL_CONF_DOC.ID]: this.id,
      [COL_CONF_DOC.TIPO]: this.tipo,
      [COL_CONF_DOC.GENERATORE]: this.generatore,
      [COL_CONF_DOC.FORMATO]: this.formato,
      [COL_CONF_DOC.MODELLI]: this.modelliRaw,
      [COL_CONF_DOC.CONDIZIONE]: this.condizioneRaw,
      [COL_CONF_DOC.PARAMETRI]: this.parametriRaw
    };
  }

  static fromData(data: ConfigurazioneDocumentoData): ConfigurazioneDocumento {
    return new ConfigurazioneDocumento(data);
  }
}
