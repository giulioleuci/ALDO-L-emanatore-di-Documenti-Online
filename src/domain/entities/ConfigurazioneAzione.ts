import { COL_CONF_AZIONI } from '../../config/schema';
import { ASSI_AZIONE } from '../value-objects/enums';
import { AldoEntity } from './AldoEntity';
import { ConfigurationError } from '../errors/DomainError';

/**
 * CONF_AZIONI entity (PK = ID) — one standalone action orchestration: the
 * iteration axis, the whole-action condition gate and the JSON array of
 * elementary actions (shared grammar, see standaloneActions.ts). PERIODICITA is
 * carried but ignored in v1 (scheduling is future work).
 */
export class ConfigurazioneAzione extends AldoEntity {
  public readonly tipo: string;
  public readonly asse: string;
  public readonly condizione: string;
  public readonly periodicita: string;
  private readonly attivo: boolean;
  private readonly azioniRaw: string | null;

  constructor(data: Record<string, unknown> = {}) {
    super(data);
    this.id = typeof data[COL_CONF_AZIONI.ID] === 'string' ? (data[COL_CONF_AZIONI.ID] as string) : null;
    this.tipo = text(data[COL_CONF_AZIONI.TIPO]);
    const asse = text(data[COL_CONF_AZIONI.ASSE]);
    if (!ASSI_AZIONE.includes(asse)) {
      throw new ConfigurationError(`CONF_AZIONI ${this.id ?? '?'}: ASSE non valido: ${asse}`);
    }
    this.asse = asse;
    this.condizione = text(data[COL_CONF_AZIONI.CONDIZIONE]);
    this.periodicita = text(data[COL_CONF_AZIONI.PERIODICITA]);
    // Default true: a blank ATTIVO cell (or the '' a live Sheets round-trip
    // returns for it) means "enabled", mirroring CONF_IMP.ATTIVO semantics but
    // opt-out rather than opt-in, per the CONF_AZIONI design doc.
    const attivo = data[COL_CONF_AZIONI.ATTIVO];
    this.attivo = !(attivo === false || String(attivo).trim().toUpperCase() === 'FALSE');
    const azioni = data[COL_CONF_AZIONI.AZIONI];
    this.azioniRaw = typeof azioni === 'string' && azioni.trim() !== '' ? azioni : null;
  }

  isAttivo(): boolean {
    return this.attivo;
  }

  /** Raw AZIONI JSON, or null when the cell is unset — nothing to execute. */
  getAzioniRaw(): string | null {
    return this.azioniRaw;
  }

  override toData(): EntityData {
    return {
      [COL_CONF_AZIONI.ID]: this.id,
      [COL_CONF_AZIONI.TIPO]: this.tipo,
      [COL_CONF_AZIONI.ASSE]: this.asse,
      [COL_CONF_AZIONI.CONDIZIONE]: this.condizione,
      [COL_CONF_AZIONI.ATTIVO]: this.attivo,
      [COL_CONF_AZIONI.AZIONI]: this.azioniRaw,
      [COL_CONF_AZIONI.PERIODICITA]: this.periodicita
    };
  }

  static fromData(data: Record<string, unknown>): ConfigurazioneAzione {
    return new ConfigurazioneAzione(data);
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
