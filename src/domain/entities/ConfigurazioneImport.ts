import { COL_CONF_IMP } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export type ConfigurazioneImportData = {
  [COL_CONF_IMP.ID]?: string;
  [COL_CONF_IMP.TARGET]?: string;
  [COL_CONF_IMP.CONFIG]?: string | null;
  [COL_CONF_IMP.ATTIVO]?: boolean;
};

/**
 * CONF_IMP entity (PK = ID) — an ETL import job config (ref 01, 06 §10).
 */
export class ConfigurazioneImport extends AldoEntity {
  public readonly target: string;
  private readonly attivo: boolean;
  private readonly configRaw: string | null;

  constructor(data: ConfigurazioneImportData = {}) {
    super(data);
    this.id = typeof data[COL_CONF_IMP.ID] === 'string' ? (data[COL_CONF_IMP.ID] as string) : null;
    this.target =
      typeof data[COL_CONF_IMP.TARGET] === 'string' ? (data[COL_CONF_IMP.TARGET] as string) : '';
    this.attivo = data[COL_CONF_IMP.ATTIVO] === true;
    this.configRaw =
      typeof data[COL_CONF_IMP.CONFIG] === 'string' ? (data[COL_CONF_IMP.CONFIG] as string) : null;
  }

  isAttivo(): boolean {
    return this.attivo;
  }

  getConfig(): Record<string, unknown> {
    return this.configRaw === null ? {} : (JSON.parse(this.configRaw) as Record<string, unknown>);
  }

  override toData(): EntityData {
    return {
      [COL_CONF_IMP.ID]: this.id,
      [COL_CONF_IMP.TARGET]: this.target,
      [COL_CONF_IMP.ATTIVO]: this.attivo,
      [COL_CONF_IMP.CONFIG]: this.configRaw
    };
  }

  static fromData(data: Record<string, unknown>): ConfigurazioneImport {
    return new ConfigurazioneImport(data);
  }
}
