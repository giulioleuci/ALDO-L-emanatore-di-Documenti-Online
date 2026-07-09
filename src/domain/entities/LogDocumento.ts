import { StatoDocumento } from '../value-objects/enums';
import { COL_LOG_DOCS } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface LogDocumentoData {
  [key: string]: unknown;
}

function csv(cell: unknown): string[] {
  return typeof cell === 'string' ? cell.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : [];
}

/**
 * LOG_DOCS entity (PK = Drive File ID, ref 04 §18) — append-only audit record of
 * a generated document. Aggregate Root. CLASSI/UTENTI are CSV, matched by
 * containment (ref 01). cambiaStato/notifica mutate in memory + mark dirty; the
 * repository persists via save() (persistence-seam increment).
 */
export class LogDocumento extends AldoEntity {
  public readonly idGen: string;
  public readonly tipo: string;
  public readonly nome: string;
  private stato: StatoDocumento;
  private notificato: string;
  private readonly raw: Record<string, unknown>;

  constructor(data: LogDocumentoData = {}) {
    super(data);
    this.raw = { ...data };
    this.id = typeof data[COL_LOG_DOCS.ID] === 'string' ? (data[COL_LOG_DOCS.ID] as string) : null;
    this.idGen = typeof data[COL_LOG_DOCS.ID_GEN] === 'string' ? (data[COL_LOG_DOCS.ID_GEN] as string) : '';
    this.tipo = typeof data[COL_LOG_DOCS.TIPO] === 'string' ? (data[COL_LOG_DOCS.TIPO] as string) : '';
    this.nome = typeof data[COL_LOG_DOCS.NOME] === 'string' ? (data[COL_LOG_DOCS.NOME] as string) : '';
    this.stato = (data[COL_LOG_DOCS.STATO] as StatoDocumento) ?? StatoDocumento.GENERATO;
    this.notificato = typeof data[COL_LOG_DOCS.NOTIFICATO] === 'string' ? (data[COL_LOG_DOCS.NOTIFICATO] as string) : '';
  }

  getStato(): StatoDocumento { return this.stato; }
  getLink(): string { return typeof this.raw[COL_LOG_DOCS.LINK] === 'string' ? (this.raw[COL_LOG_DOCS.LINK] as string) : ''; }
  getDataCreazione(): string { return typeof this.raw[COL_LOG_DOCS.DATA_CREAZ] === 'string' ? (this.raw[COL_LOG_DOCS.DATA_CREAZ] as string) : ''; }
  getSottotipo(): string { return typeof this.raw[COL_LOG_DOCS.SOTTOTIPO] === 'string' ? (this.raw[COL_LOG_DOCS.SOTTOTIPO] as string) : ''; }
  isNotificato(): boolean { return this.notificato.trim().length > 0; }

  containsClasse(classeId: string): boolean { return csv(this.raw[COL_LOG_DOCS.CLASSI]).includes(classeId); }
  containsUtente(email: string): boolean { return csv(this.raw[COL_LOG_DOCS.UTENTI]).includes(email); }
  getClassi(): string[] { return csv(this.raw[COL_LOG_DOCS.CLASSI]); }

  /** Updates STATO (transition validation is the service's job, ref 04 §18). Marks dirty. */
  cambiaStato(nuovoStato: StatoDocumento): void {
    this.stato = nuovoStato;
    this.raw[COL_LOG_DOCS.STATO] = nuovoStato;
    this.markDirty(COL_LOG_DOCS.STATO);
  }

  /** Stamps NOTIFICATO with the current timestamp (ref 04 §18). Marks dirty. */
  notifica(): void {
    this.notificato = new Date().toISOString();
    this.raw[COL_LOG_DOCS.NOTIFICATO] = this.notificato;
    this.markDirty(COL_LOG_DOCS.NOTIFICATO);
  }

  override toData(): EntityData {
    return { ...this.raw, [COL_LOG_DOCS.STATO]: this.stato, [COL_LOG_DOCS.NOTIFICATO]: this.notificato };
  }

  static fromData(data: LogDocumentoData): LogDocumento {
    return new LogDocumento(data);
  }
}
