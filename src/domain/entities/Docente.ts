import { Email } from '../value-objects/Email';
import { DipartimentoId } from '../value-objects/DipartimentoId';
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
  public readonly dipart: string;
  private readonly itp: boolean;

  constructor(data: DocenteData = {}) {
    super(data);
    this.id = data[COL_DOCENTI.EMAIL] ?? null;
    this.cognome = data[COL_DOCENTI.COGNOME] ?? '';
    this.nome = data[COL_DOCENTI.NOME] ?? '';
    this.genere = (data[COL_DOCENTI.GENERE] as Genere) ?? Genere.F;
    this.dipart = typeof data[COL_DOCENTI.DIPART] === 'string' ? (data[COL_DOCENTI.DIPART] as string) : '';
    this.itp = data[COL_DOCENTI.ITP] === true;
  }

  get email(): Email {
    return Email.of(this.id ?? '');
  }

  /** DipartimentoId of the teacher's department (ref 04 §2). */
  get dipartimentoId(): DipartimentoId { return DipartimentoId.of(this.dipart); }

  /** "Prof." for M, "Prof.ssa" for F (ref 04 §2). */
  getAppellativo(): string { return appellativo(this.genere); }

  /** "${COGNOME} ${NOME}" (ref 04 §2). */
  getNomeCompleto(): string { return `${this.cognome} ${this.nome}`; }

  /** "${appellativo} ${nomeCompleto}" (ref 04 §2). */
  getNomeCompletoConAppellativo(): string { return `${this.getAppellativo()} ${this.getNomeCompleto()}`; }

  /** True for Insegnante Tecnico Pratico (laboratory) (ref 04 §2). */
  isITP(): boolean { return this.itp; }

  /** @deprecated use getNomeCompleto(); kept for the vertical slice. */
  cognomeNome(): string { return this.getNomeCompleto(); }

  /** @deprecated use getNomeCompletoConAppellativo(); kept for the vertical slice. */
  nomeConAppellativo(): string { return this.getNomeCompletoConAppellativo(); }

  override toData(): EntityData {
    return {
      [COL_DOCENTI.EMAIL]: this.id,
      [COL_DOCENTI.COGNOME]: this.cognome,
      [COL_DOCENTI.NOME]: this.nome,
      [COL_DOCENTI.GENERE]: this.genere,
      [COL_DOCENTI.DIPART]: this.dipart,
      [COL_DOCENTI.ITP]: this.itp
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
