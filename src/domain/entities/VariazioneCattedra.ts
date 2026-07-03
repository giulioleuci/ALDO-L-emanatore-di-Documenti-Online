import { Email } from '../value-objects/Email';
import { CsvScope } from '../value-objects/CsvScope';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';
import { COL_VARIAZIONI } from '../../config/schema';

export interface VariazioneCattedraData {
  [key: string]: unknown;
}

/**
 * VARIAZIONI_CATTEDRA entity — permanent change of cattedra ownership after the
 * school year has begun, Priority 2 in role resolution (ref 04 §15). Composite
 * PK (CLASSE_ID, MATERIA_ID), both CSV matched by containment. Aggregate Root.
 */
export class VariazioneCattedra extends Entity {
  private readonly classeIdRaw: string;
  private readonly materiaIdRaw: string;
  public readonly vecchioTitolare: string;
  public readonly nuovoTitolare: string;
  public readonly dataDecorrenza: string;
  private readonly classi: CsvScope;
  private readonly materie: CsvScope;

  constructor(data: VariazioneCattedraData = {}) {
    super(data);
    this.classeIdRaw = typeof data[COL_VARIAZIONI.CLASSE_ID] === 'string' ? (data[COL_VARIAZIONI.CLASSE_ID] as string) : '';
    this.materiaIdRaw = typeof data[COL_VARIAZIONI.MATERIA_ID] === 'string' ? (data[COL_VARIAZIONI.MATERIA_ID] as string) : '';
    this.vecchioTitolare = typeof data[COL_VARIAZIONI.VECCHIO_TITOLARE] === 'string' ? (data[COL_VARIAZIONI.VECCHIO_TITOLARE] as string) : '';
    this.nuovoTitolare = typeof data[COL_VARIAZIONI.NUOVO_TITOLARE] === 'string' ? (data[COL_VARIAZIONI.NUOVO_TITOLARE] as string) : '';
    this.dataDecorrenza = typeof data[COL_VARIAZIONI.DATA_DECORRENZA] === 'string' ? (data[COL_VARIAZIONI.DATA_DECORRENZA] as string) : '';
    this.classi = CsvScope.of(this.classeIdRaw);
    this.materie = CsvScope.of(this.materiaIdRaw);
    this.id = this.classeIdRaw && this.materiaIdRaw ? `${this.classeIdRaw}::${this.materiaIdRaw}` : null;
  }

  get nuovoTitolareEmail(): Email { return Email.of(this.nuovoTitolare); }
  get vecchioTitolareEmail(): Email { return Email.of(this.vecchioTitolare); }

  /** CLASSE_ID CSV contains the class (ref 06 §20, containment). */
  applicaAClasse(classe: ClasseId): boolean { return this.classi.applica(classe.value); }

  /** MATERIA_ID CSV contains the subject (ref 06 §20, containment). */
  applicaAMateria(materia: MateriaId): boolean { return this.materie.applica(materia.value); }

  applicaAContesto(classe: ClasseId, materia: MateriaId): boolean {
    return this.applicaAClasse(classe) && this.applicaAMateria(materia);
  }

  /** True if the change has taken effect by the given date (DATA_DECORRENZA ≤ data, ref 01 §4). */
  isDecorsaA(data: Date): boolean {
    const dec = new Date(this.dataDecorrenza);
    return !Number.isNaN(dec.getTime()) && dec.getTime() <= data.getTime();
  }

  override toData(): EntityData {
    return {
      [COL_VARIAZIONI.CLASSE_ID]: this.classeIdRaw,
      [COL_VARIAZIONI.MATERIA_ID]: this.materiaIdRaw,
      [COL_VARIAZIONI.VECCHIO_TITOLARE]: this.vecchioTitolare,
      [COL_VARIAZIONI.NUOVO_TITOLARE]: this.nuovoTitolare,
      [COL_VARIAZIONI.DATA_DECORRENZA]: this.dataDecorrenza
    };
  }

  static fromData(data: VariazioneCattedraData): VariazioneCattedra {
    return new VariazioneCattedra(data);
  }
}
