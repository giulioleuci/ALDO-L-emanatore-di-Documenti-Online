import { StatoEmail } from '../value-objects/enums';
import { COL_LOG_MAIL } from '../../config/schema';

export interface LogEmailData {
  [key: string]: unknown;
}

/**
 * LOG_MAIL entity — append-only audit record of a sent email (ref 04, 06 §19).
 * Composite PK (PATTERN, DESTINATARI, DATA); no single-column id.
 */
export class LogEmail extends Entity {
  public readonly pattern: string;
  public readonly destinatariRaw: string;
  public readonly data: string;
  public readonly stato: StatoEmail;
  private readonly allegatiRaw: string | null;
  public readonly errore: string;

  constructor(data: LogEmailData = {}) {
    super(data);
    this.pattern = typeof data[COL_LOG_MAIL.PATTERN] === 'string' ? (data[COL_LOG_MAIL.PATTERN] as string) : '';
    this.destinatariRaw = typeof data[COL_LOG_MAIL.DESTINATARI] === 'string' ? (data[COL_LOG_MAIL.DESTINATARI] as string) : '';
    this.data = typeof data[COL_LOG_MAIL.DATA] === 'string' ? (data[COL_LOG_MAIL.DATA] as string) : '';
    this.stato = (data[COL_LOG_MAIL.STATO] as StatoEmail) ?? StatoEmail.PENDING;
    this.allegatiRaw = typeof data[COL_LOG_MAIL.ALLEGATI] === 'string' ? (data[COL_LOG_MAIL.ALLEGATI] as string) : null;
    this.errore = typeof data[COL_LOG_MAIL.ERRORE] === 'string' ? (data[COL_LOG_MAIL.ERRORE] as string) : '';
    this.id = this.pattern && this.destinatariRaw && this.data ? `${this.pattern}::${this.destinatariRaw}::${this.data}` : null;
  }

  getDestinatari(): string[] {
    return this.destinatariRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }

  isFailed(): boolean { return this.stato === StatoEmail.ERROR; }

  getAllegati(): Record<string, unknown> {
    return this.allegatiRaw === null ? {} : (JSON.parse(this.allegatiRaw) as Record<string, unknown>);
  }

  override toData(): EntityData {
    return {
      [COL_LOG_MAIL.PATTERN]: this.pattern,
      [COL_LOG_MAIL.DESTINATARI]: this.destinatariRaw,
      [COL_LOG_MAIL.DATA]: this.data,
      [COL_LOG_MAIL.STATO]: this.stato,
      [COL_LOG_MAIL.ALLEGATI]: this.allegatiRaw,
      [COL_LOG_MAIL.ERRORE]: this.errore
    };
  }

  static fromData(data: LogEmailData): LogEmail {
    return new LogEmail(data);
  }
}
