import { COL_LOG_FOLD } from '../../config/schema';
import { AldoEntity } from './AldoEntity';
import { splitCsvValues } from '../value-objects/CsvScope';

export type LogCartellaData = {
  [COL_LOG_FOLD.ID]?: string;
  [COL_LOG_FOLD.ID_GEN]?: string;
  [COL_LOG_FOLD.TIPO]?: string;
  [COL_LOG_FOLD.NOME]?: string;
  [COL_LOG_FOLD.PATH]?: string;
  [COL_LOG_FOLD.LINK]?: string;
  [COL_LOG_FOLD.CLASSI]?: string;
  [COL_LOG_FOLD.UTENTI]?: string;
  [COL_LOG_FOLD.MATERIE]?: string;
};

function csv(cell: unknown): string[] {
  return typeof cell === 'string' ? splitCsvValues(cell) : [];
}

/**
 * LOG_FOLD entity (PK = Drive Folder ID, ref 04 §19) — append-only audit record
 * of a created Drive folder. CLASSI/UTENTI/MATERIE are CSV, matched by containment (ref 01).
 * `idGen` is the FK to the exact CONF_DOC.ID that generated the folder; `tipo`
 * mirrors that row's CONF_DOC.TIPO (same idGen/tipo split as LOG_DOCS).
 */
export class LogCartella extends AldoEntity {
  public readonly idGen: string;
  public readonly tipo: string;
  public readonly nome: string;
  private readonly raw: Record<string, unknown>;

  constructor(data: LogCartellaData = {}) {
    super(data);
    this.raw = { ...data };
    this.id = typeof data[COL_LOG_FOLD.ID] === 'string' ? (data[COL_LOG_FOLD.ID] as string) : null;
    this.idGen =
      typeof data[COL_LOG_FOLD.ID_GEN] === 'string' ? (data[COL_LOG_FOLD.ID_GEN] as string) : '';
    this.tipo =
      typeof data[COL_LOG_FOLD.TIPO] === 'string' ? (data[COL_LOG_FOLD.TIPO] as string) : '';
    this.nome =
      typeof data[COL_LOG_FOLD.NOME] === 'string' ? (data[COL_LOG_FOLD.NOME] as string) : '';
  }

  containsClasse(classeId: string): boolean {
    return csv(this.raw[COL_LOG_FOLD.CLASSI]).includes(classeId);
  }

  getPath(): string {
    return typeof this.raw[COL_LOG_FOLD.PATH] === 'string'
      ? (this.raw[COL_LOG_FOLD.PATH] as string)
      : '';
  }

  containsUtente(email: string): boolean {
    return csv(this.raw[COL_LOG_FOLD.UTENTI]).includes(email);
  }

  containsMateria(materiaId: string): boolean {
    return csv(this.raw[COL_LOG_FOLD.MATERIE]).includes(materiaId);
  }

  getClassi(): string[] {
    return csv(this.raw[COL_LOG_FOLD.CLASSI]);
  }

  getUtenti(): string[] {
    return csv(this.raw[COL_LOG_FOLD.UTENTI]);
  }

  getMaterie(): string[] {
    return csv(this.raw[COL_LOG_FOLD.MATERIE]);
  }

  getLink(): string {
    return typeof this.raw[COL_LOG_FOLD.LINK] === 'string'
      ? (this.raw[COL_LOG_FOLD.LINK] as string)
      : '';
  }

  override toData(): EntityData {
    return { ...this.raw };
  }

  static fromData(data: Record<string, unknown>): LogCartella {
    return new LogCartella(data);
  }
}
