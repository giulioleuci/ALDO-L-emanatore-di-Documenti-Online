import { Email } from '../value-objects/Email';
import { Genere, appellativo } from '../value-objects/enums';
import { COL_DOCENTI } from '../../config/schema';

export interface DocenteData {
  [COL_DOCENTI.EMAIL]?: string;
  [COL_DOCENTI.COGNOME]?: string;
  [COL_DOCENTI.NOME]?: string;
  [COL_DOCENTI.GENERE]?: string;
  [key: string]: unknown;
}

/**
 * DOCENTI entity (PK = EMAIL). Hydrated from a flat row via {@link Docente.fromData};
 * the Email VO is reconstructed on access. DOCENTI has separate COGNOME/NOME (ref 01).
 */
export class Docente extends Entity {
  public cognome: string;
  public nome: string;
  public genere: Genere;

  constructor(data: DocenteData = {}) {
    super(data);
    this.id = data[COL_DOCENTI.EMAIL] ?? null;
    this.cognome = data[COL_DOCENTI.COGNOME] ?? '';
    this.nome = data[COL_DOCENTI.NOME] ?? '';
    this.genere = (data[COL_DOCENTI.GENERE] as Genere) ?? Genere.F;
  }

  get email(): Email {
    return Email.of(this.id ?? '');
  }

  cognomeNome(): string {
    return `${this.cognome} ${this.nome}`;
  }

  nomeConAppellativo(): string {
    return `${appellativo(this.genere)} ${this.cognomeNome()}`;
  }

  override toData(): EntityData {
    return {
      [COL_DOCENTI.EMAIL]: this.id,
      [COL_DOCENTI.COGNOME]: this.cognome,
      [COL_DOCENTI.NOME]: this.nome,
      [COL_DOCENTI.GENERE]: this.genere
    };
  }

  static fromData(data: DocenteData): Docente {
    return new Docente(data);
  }

  /** Ergonomic constructor from domain values (tests, in-memory building). */
  static create(email: Email, cognome: string, nome: string, genere: Genere): Docente {
    return new Docente({
      [COL_DOCENTI.EMAIL]: email.value,
      [COL_DOCENTI.COGNOME]: cognome,
      [COL_DOCENTI.NOME]: nome,
      [COL_DOCENTI.GENERE]: genere
    });
  }
}
