import { CsvScope } from '../value-objects/CsvScope';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';
import { COL_VARIAZIONI } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface VariazioneCattedraData {
  [key: string]: unknown;
}

/**
 * VARIAZIONI_CATTEDRA entity — permanent change of cattedra ownership after the
 * school year has begun, Priority 2 in role resolution (ref 01 §4). Composite
 * PK (TITOLARE, NUOVO_TITOLARE, DAL, CLASSI, MATERIE); no single-column id.
 * Aggregate Root.
 */
export class VariazioneCattedra extends AldoEntity {
  public readonly titolare: string;
  public readonly nuovoTitolare: string;
  private readonly dalRaw: string;
  private readonly classiRaw: string;
  private readonly materieRaw: string;
  private readonly classi: CsvScope;
  private readonly materie: CsvScope;

  constructor(data: VariazioneCattedraData = {}) {
    super(data);
    this.titolare =
      typeof data[COL_VARIAZIONI.TITOLARE] === 'string'
        ? (data[COL_VARIAZIONI.TITOLARE] as string)
        : '';
    this.nuovoTitolare =
      typeof data[COL_VARIAZIONI.NUOVO_TITOLARE] === 'string'
        ? (data[COL_VARIAZIONI.NUOVO_TITOLARE] as string)
        : '';
    this.dalRaw =
      typeof data[COL_VARIAZIONI.DAL] === 'string' ? (data[COL_VARIAZIONI.DAL] as string) : '';
    this.classiRaw =
      typeof data[COL_VARIAZIONI.CLASSI] === 'string' ? (data[COL_VARIAZIONI.CLASSI] as string) : '';
    this.materieRaw =
      typeof data[COL_VARIAZIONI.MATERIE] === 'string'
        ? (data[COL_VARIAZIONI.MATERIE] as string)
        : '';
    this.classi = CsvScope.of(this.classiRaw);
    this.materie = CsvScope.of(this.materieRaw);
    this.id =
      this.titolare && this.nuovoTitolare && this.dalRaw
        ? `${this.titolare}::${this.nuovoTitolare}::${this.dalRaw}::${this.classiRaw}::${this.materieRaw}`
        : null;
  }

  /** True if CLASSI = "*" or its CSV contains the class (ref 01 §4). */
  applicaAClasse(classe: ClasseId): boolean {
    return this.classi.applica(classe.value);
  }

  /** True if MATERIE = "*" or its CSV contains the subject (ref 01 §4). */
  applicaAMateria(materia: MateriaId): boolean {
    return this.materie.applica(materia.value);
  }

  applicaAContesto(classe: ClasseId, materia: MateriaId): boolean {
    return this.applicaAClasse(classe) && this.applicaAMateria(materia);
  }

  /** True if the change has taken effect by the given date (DAL ≤ data, ref 01 §4). */
  isDecorsaA(data: Date): boolean {
    const dal = new Date(this.dalRaw);
    return !Number.isNaN(dal.getTime()) && dal.getTime() <= data.getTime();
  }

  getClassiScope(): CsvScope {
    return this.classi;
  }
  getMaterieScope(): CsvScope {
    return this.materie;
  }

  override toData(): EntityData {
    return {
      [COL_VARIAZIONI.TITOLARE]: this.titolare,
      [COL_VARIAZIONI.NUOVO_TITOLARE]: this.nuovoTitolare,
      [COL_VARIAZIONI.DAL]: this.dalRaw,
      [COL_VARIAZIONI.CLASSI]: this.classiRaw,
      [COL_VARIAZIONI.MATERIE]: this.materieRaw
    };
  }

  static fromData(data: VariazioneCattedraData): VariazioneCattedra {
    return new VariazioneCattedra(data);
  }
}
