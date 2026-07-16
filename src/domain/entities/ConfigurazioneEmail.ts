import { ProcessoInvio, GestioneSupplenti } from '../value-objects/enums';
import { COL_CONF_MAIL } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface ConfigurazioneEmailData {
  [key: string]: unknown;
}

const DEFAULT_HEADER_COLOR = '#007bff';

/**
 * CONF_MAIL entity (PK = ID) — a complete email-notification pattern (ref 04,
 * 06 §9). Aggregate Root correlated to LogEmail.
 */
export class ConfigurazioneEmail extends AldoEntity {
  public readonly oggetto: string;
  public readonly processo: ProcessoInvio;
  public readonly supplenti: GestioneSupplenti;
  private readonly boxCfgRaw: string | null;
  private readonly testoRaw: string;
  private readonly noreply: boolean;
  private readonly coloreHeaderRaw: string;
  private readonly condizioneRaw: string;

  constructor(data: ConfigurazioneEmailData = {}) {
    super(data);
    this.id =
      typeof data[COL_CONF_MAIL.ID] === 'string' ? (data[COL_CONF_MAIL.ID] as string) : null;
    this.oggetto =
      typeof data[COL_CONF_MAIL.OGGETTO] === 'string'
        ? (data[COL_CONF_MAIL.OGGETTO] as string)
        : '';
    this.processo = data[COL_CONF_MAIL.PROCESSO] as ProcessoInvio;
    this.supplenti =
      (data[COL_CONF_MAIL.SUPPLENTI] as GestioneSupplenti) ?? GestioneSupplenti.SOLO_TITOLARI;
    this.boxCfgRaw =
      typeof data[COL_CONF_MAIL.BOX_CFG] === 'string'
        ? (data[COL_CONF_MAIL.BOX_CFG] as string)
        : null;
    this.testoRaw =
      typeof data[COL_CONF_MAIL.TESTO] === 'string' ? (data[COL_CONF_MAIL.TESTO] as string) : '';
    this.noreply = data[COL_CONF_MAIL.NOREPLY] === true;
    this.coloreHeaderRaw =
      typeof data[COL_CONF_MAIL.COLORE_HEADER] === 'string'
        ? (data[COL_CONF_MAIL.COLORE_HEADER] as string)
        : '';
    this.condizioneRaw =
      typeof data[COL_CONF_MAIL.CONDIZIONE] === 'string'
        ? (data[COL_CONF_MAIL.CONDIZIONE] as string)
        : '';
  }

  /** BoxConfig array parsed from BOX_CFG; empty when null (ref 06 §9). */
  getBoxes(): Record<string, unknown>[] {
    if (this.boxCfgRaw === null) return [];
    const parsed = JSON.parse(this.boxCfgRaw) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  }

  getTesto(): string {
    return this.testoRaw;
  }
  isNoreply(): boolean {
    return this.noreply;
  }

  /** Header colour, defaulting to #007bff when unset (ref 01, 11 Step 3). */
  getColoreHeader(): string {
    return this.coloreHeaderRaw.trim() === '' ? DEFAULT_HEADER_COLOR : this.coloreHeaderRaw;
  }

  getCondizione(): string | null {
    return this.condizioneRaw.trim() === '' ? null : this.condizioneRaw;
  }

  override toData(): EntityData {
    return {
      [COL_CONF_MAIL.ID]: this.id,
      [COL_CONF_MAIL.OGGETTO]: this.oggetto,
      [COL_CONF_MAIL.PROCESSO]: this.processo,
      [COL_CONF_MAIL.SUPPLENTI]: this.supplenti,
      [COL_CONF_MAIL.BOX_CFG]: this.boxCfgRaw,
      [COL_CONF_MAIL.TESTO]: this.testoRaw,
      [COL_CONF_MAIL.NOREPLY]: this.noreply,
      [COL_CONF_MAIL.COLORE_HEADER]: this.coloreHeaderRaw,
      [COL_CONF_MAIL.CONDIZIONE]: this.condizioneRaw
    };
  }

  static fromData(data: ConfigurazioneEmailData): ConfigurazioneEmail {
    return new ConfigurazioneEmail(data);
  }
}
