import { Email } from '../value-objects/Email';
import { COL_RUOLI } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface RuoloSpecialeData {
  [COL_RUOLI.ID]?: string;
  [COL_RUOLI.NOME]?: string;
  [COL_RUOLI.DOCENTE]?: string;
  [key: string]: unknown;
}

/**
 * RUOLI entity (PK = ID) — a special institute role held by one or more teachers
 * (DOCENTE is a CSV of emails, ref 01/04). A role may have multiple holders.
 */
export class RuoloSpeciale extends AldoEntity {
  public readonly nome: string;
  private readonly docenteRaw: string;

  constructor(data: RuoloSpecialeData = {}) {
    super(data);
    this.id = data[COL_RUOLI.ID] ?? null;
    this.nome = data[COL_RUOLI.NOME] ?? '';
    const d = data[COL_RUOLI.DOCENTE];
    this.docenteRaw = typeof d === 'string' ? d : '';
  }

  /** Emails of all teachers holding the role (CSV parsed). */
  getEmails(): Email[] {
    return this.docenteRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Email.of(s));
  }

  hasDocente(email: Email): boolean {
    return this.getEmails().some((e) => e.equals(email));
  }

  override toData(): EntityData {
    return {
      [COL_RUOLI.ID]: this.id,
      [COL_RUOLI.NOME]: this.nome,
      [COL_RUOLI.DOCENTE]: this.docenteRaw
    };
  }

  static fromData(data: RuoloSpecialeData): RuoloSpeciale {
    return new RuoloSpeciale(data);
  }
}
