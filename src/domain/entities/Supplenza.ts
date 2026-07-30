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
    this.titolare =
      typeof data[COL_SUPPLENZE.TITOLARE] === 'string'
        ? (data[COL_SUPPLENZE.TITOLARE] as string)
        : '';
    this.supplente =
      typeof data[COL_SUPPLENZE.SUPPLENTE] === 'string'
        ? (data[COL_SUPPLENZE.SUPPLENTE] as string)
        : '';
    this.dalRaw =
      typeof data[COL_SUPPLENZE.DAL] === 'string' ? (data[COL_SUPPLENZE.DAL] as string) : '';
    this.alRaw =
      typeof data[COL_SUPPLENZE.AL] === 'string' ? (data[COL_SUPPLENZE.AL] as string) : '';
    this.classiRaw =
      typeof data[COL_SUPPLENZE.CLASSI] === 'string' ? (data[COL_SUPPLENZE.CLASSI] as string) : '';
    this.materieRaw =
      typeof data[COL_SUPPLENZE.MATERIE] === 'string'
        ? (data[COL_SUPPLENZE.MATERIE] as string)
        : '';
    this.classi = CsvScope.of(this.classiRaw);
    this.materie = CsvScope.of(this.materieRaw);
    this.id =
      this.titolare && this.supplente && this.dalRaw
        ? `${this.titolare}::${this.supplente}::${this.dalRaw}::${this.classiRaw}::${this.materieRaw}`
        : null;
  }

  getPeriodo(): PeriodoSupplenza {
    return PeriodoSupplenza.of(
      new Date(this.dalRaw),
      this.alRaw.trim() === '' ? null : new Date(this.alRaw)
    );
  }

  isAttivaData(data: Date): boolean {
    return this.getPeriodo().contiene(data);
  }

  /** True if CLASSI = "*" or its CSV contains the class (ref 04 §14). */
  applicaAClasse(classe: ClasseId): boolean {
    return this.classi.applica(classe.value);
  }

  /** True if MATERIE = "*" or its CSV contains the subject (ref 04 §14). */
  applicaAMateria(materia: MateriaId): boolean {
    return this.materie.applica(materia.value);
  }

  applicaAContesto(classe: ClasseId, materia: MateriaId): boolean {
    return this.applicaAClasse(classe) && this.applicaAMateria(materia);
  }

  getClassiScope(): CsvScope {
    return this.classi;
  }
  getMaterieScope(): CsvScope {
    return this.materie;
  }
  getClassiRaw(): string {
    return this.classiRaw;
  }
  getMaterieRaw(): string {
    return this.materieRaw;
  }

  /**
   * True when this supplenza's period and (class ∧ subject) context both
   * overlap another's, compared on the raw CLASSI/MATERIE CSV/wildcard text
   * (ref 04 §14). A necessary-but-not-sufficient fast check: it catches
   * ordinary CSV/wildcard collisions but, being pre-expansion, cannot detect
   * an overlap between a restriction-by-omission row (empty CLASSI) and an
   * explicit-CSV row even when their resolved cattedre coincide — callers
   * enforcing the full invariant must also check the post-expansion concrete
   * (classe, materia) pairs (`RowScopeExpansion.expandRowToPairs` +
   * `pairsOverlap`, ref design 2026-07-30-cattedra-chain-verification §5).
   */
  contestoOverlaps(other: Supplenza): boolean {
    return (
      this.getPeriodo().overlaps(other.getPeriodo()) &&
      this.classi.overlaps(other.getClassiScope()) &&
      this.materie.overlaps(other.getMaterieScope())
    );
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
