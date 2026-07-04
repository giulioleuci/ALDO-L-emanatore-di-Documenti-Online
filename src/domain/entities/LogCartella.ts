import { COL_LOG_FOLD } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface LogCartellaData {
  [key: string]: unknown;
}

function csv(cell: unknown): string[] {
  return typeof cell === 'string' ? cell.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : [];
}

/**
 * LOG_FOLD entity (PK = Drive Folder ID, ref 04 §19) — append-only audit record
 * of a created Drive folder. CLASSI is CSV, matched by containment (ref 01).
 */
export class LogCartella extends AldoEntity {
  public readonly tipo: string;
  public readonly nome: string;
  private readonly raw: Record<string, unknown>;

  constructor(data: LogCartellaData = {}) {
    super(data);
    this.raw = { ...data };
    this.id = typeof data[COL_LOG_FOLD.ID] === 'string' ? (data[COL_LOG_FOLD.ID] as string) : null;
    this.tipo = typeof data[COL_LOG_FOLD.TIPO] === 'string' ? (data[COL_LOG_FOLD.TIPO] as string) : '';
    this.nome = typeof data[COL_LOG_FOLD.NOME] === 'string' ? (data[COL_LOG_FOLD.NOME] as string) : '';
  }

  getLink(): string { return typeof this.raw[COL_LOG_FOLD.LINK] === 'string' ? (this.raw[COL_LOG_FOLD.LINK] as string) : ''; }
  containsClasse(classeId: string): boolean { return csv(this.raw[COL_LOG_FOLD.CLASSI]).includes(classeId); }

  override toData(): EntityData {
    return { ...this.raw };
  }

  static fromData(data: LogCartellaData): LogCartella {
    return new LogCartella(data);
  }
}
