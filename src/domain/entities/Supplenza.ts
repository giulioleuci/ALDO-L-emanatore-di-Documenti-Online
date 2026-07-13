import { Email } from '../value-objects/Email';
import { PeriodoSupplenza } from '../value-objects/PeriodoSupplenza';
import { CsvScope } from '../value-objects/CsvScope';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';
import { COL_SUPPLENZE } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface SupplenzaData {
  [key: string]: unknown;
}

/**
 * SUPPLENZE entity — temporary teacher replacement, Priority 1 in role
 * resolution (ref 04 §14). Composite PK (TITOLARE, SUPPLENTE, DAL, CLASSI,
 * MATERIE); no single-column id. Aggregate Root, correlated to Docente.
 */
export class Supplenza extends AldoEntity {
  public readonly titolare: string;
  public readonly supplente: string;
  private readonly dalRaw: string;
  private readonly alRaw: string;
  private readonly classiRaw: string;
  private readonly materieRaw: string;
  private readonly classi: CsvScope;
  private readonly materie: CsvScope;

  constructor(data: SupplenzaData = {}) {
    super(data);
    this.titolare = typeof data[COL_SUPPLENZE.TITOLARE] === 'string' ? (data[COL_SUPPLENZE.TITOLARE] as string) : '';
    this.supplente = typeof data[COL_SUPPLENZE.SUPPLENTE] === 'string' ? (data[COL_SUPPLENZE.SUPPLENTE] as string) : '';
    this.dalRaw = typeof data[COL_SUPPLENZE.DAL] === 'string' ? (data[COL_SUPPLENZE.DAL] as string) : '';
    this.alRaw = typeof data[COL_SUPPLENZE.AL] === 'string' ? (data[COL_SUPPLENZE.AL] as string) : '';
    this.classiRaw = typeof data[COL_SUPPLENZE.CLASSI] === 'string' ? (data[COL_SUPPLENZE.CLASSI] as string) : '';
    this.materieRaw = typeof data[COL_SUPPLENZE.MATERIE] === 'string' ? (data[COL_SUPPLENZE.MATERIE] as string) : '';
    this.classi = CsvScope.of(this.classiRaw);
    this.materie = CsvScope.of(this.materieRaw);
    this.id = this.titolare && this.supplente && this.dalRaw
      ? `${this.titolare}::${this.supplente}::${this.dalRaw}::${this.classiRaw}::${this.materieRaw}`
      : null;
  }

  get titolareEmail(): Email { return Email.of(this.titolare); }
  get supplenteEmail(): Email { return Email.of(this.supplente); }

  getPeriodo(): PeriodoSupplenza {
    return PeriodoSupplenza.of(new Date(this.dalRaw), this.alRaw.trim() === '' ? null : new Date(this.alRaw));
  }

  isAttivaOggi(): boolean { return this.isAttivaData(new Date()); }
  isAttivaData(data: Date): boolean { return this.getPeriodo().contiene(data); }

  /** True if CLASSI = "*" or its CSV contains the class (ref 04 §14). */
  applicaAClasse(classe: ClasseId): boolean { return this.classi.applica(classe.value); }

  /** True if MATERIE = "*" or its CSV contains the subject (ref 04 §14). */
  applicaAMateria(materia: MateriaId): boolean { return this.materie.applica(materia.value); }

  applicaAContesto(classe: ClasseId, materia: MateriaId): boolean {
    return this.applicaAClasse(classe) && this.applicaAMateria(materia);
  }

  getClassiScope(): CsvScope { return this.classi; }
  getMaterieScope(): CsvScope { return this.materie; }

  /**
   * True when this supplenza's period and (class ∧ subject) context both overlap
   * another's — the condition the creation invariant forbids (ref 04 §14).
   */
  contestoOverlaps(other: Supplenza): boolean {
    return this.getPeriodo().overlaps(other.getPeriodo())
      && this.classi.overlaps(other.getClassiScope())
      && this.materie.overlaps(other.getMaterieScope());
  }

  override toData(): EntityData {
    return {
      [COL_SUPPLENZE.TITOLARE]: this.titolare,
      [COL_SUPPLENZE.SUPPLENTE]: this.supplente,
      [COL_SUPPLENZE.DAL]: this.dalRaw,
      [COL_SUPPLENZE.AL]: this.alRaw,
      [COL_SUPPLENZE.CLASSI]: this.classiRaw,
      [COL_SUPPLENZE.MATERIE]: this.materieRaw
    };
  }

  static fromData(data: SupplenzaData): Supplenza {
    return new Supplenza(data);
  }
}
