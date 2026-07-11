import { Carenza } from '../../domain/entities/Carenza';
import {
  CarenzePerAlunnoSpec, CarenzePerClasseSpec, CarenzeNonNotificateSpec
} from '../../domain/specifications/CarenzaSpecs';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ValoreCarenza } from '../../domain/value-objects/ValoreCarenza';
import type { Alunno } from '../../domain/entities/Alunno';
import type { Classe } from '../../domain/entities/Classe';
import type { AnnoScolastico } from '../../domain/value-objects/AnnoScolastico';
import { MateriaNotFoundError } from '../../domain/errors/DomainError';
import { TABLE, COL_MATERIE, COL_CARENZE } from '../../config/schema';

/** Dynamic per-subject column names in the CARENZE matrix (ref 06 §Colonne dinamiche). */
interface MateriaColumns { main: string; itp: string }

/**
 * CARENZE repository on the DomainRepositoryLib Repository base. Composite PK
 * (STUDENTE, PROGRESSIVO) — base single-key findById does not apply (ref 06 §11).
 * The table is a matrix with one dynamic column per subject; the column map is
 * built at construction from MATERIE. Write-through methods (setCarenzaMateria)
 * land with the persistence-seam increment.
 */
export class CarenzaRepository extends Repository<Carenza> {
  private readonly materieColumns: Map<string, MateriaColumns>;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CARENZE, Carenza);
    this.materieColumns = new Map<string, MateriaColumns>();
    for (const row of database.tables[TABLE.MATERIE]!.getAllRows()) {
      const id = row[COL_MATERIE.ID];
      if (typeof id === 'string' && id.length > 0) {
        this.materieColumns.set(id, { main: id, itp: `${id}.itp` });
      }
    }
    // O(1) hot-lookup index for findByAlunno (ref REPORT_GLF.md A2).
    database.tables[TABLE.CARENZE]!.createIndex(COL_CARENZE.STUDENTE);
  }

  /** Shortfalls of a student, most recent first, optionally filtered by school year (ref 06 §11). */
  findByAlunno(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[] {
    const spec = new CarenzePerAlunnoSpec(alunno.email);
    let rows = this.find(spec);
    if (options?.annoScolastico !== undefined) {
      rows = rows.filter((c) => this.inAnnoScolastico(c, options.annoScolastico!));
    }
    return rows.sort((a, b) => b.data.localeCompare(a.data));
  }

  /** Shortfalls of a class; with an exact date filter when supplied (ref 06 §11). */
  findByClasse(classe: Classe, data?: Date): Carenza[] {
    const spec = new CarenzePerClasseSpec(classe.classeId);
    let rows = this.find(spec);
    if (data !== undefined) {
      const iso = data.toISOString().slice(0, 10);
      rows = rows.filter((c) => c.data.slice(0, 10) === iso);
    }
    return rows;
  }

  /** Shortfalls with NOTIFICATO null or empty (ref 06 §11). */
  findNonNotificate(): Carenza[] {
    const spec = new CarenzeNonNotificateSpec();
    return this.find(spec);
  }

  /**
   * Per-subject values for one row: iterates the dynamic column map and builds a
   * ValoreCarenza (numeric → VOTO, text → NOTA) for each non-empty cell (ref 06 §11).
   */
  getCarenzePerMateria(carenza: Carenza): Map<MateriaId, ValoreCarenza> {
    const result = new Map<MateriaId, ValoreCarenza>();
    for (const [id, cols] of this.materieColumns) {
      const valore = ValoreCarenza.fromCella(carenza.getCella(cols.main));
      if (valore !== null) result.set(MateriaId.of(id), valore);
    }
    return result;
  }

  /**
   * Sets (or clears, with null) the shortfall value for one subject of a CARENZE
   * row and persists it (ref 06 §11). Unlike CLASSI (ref ClasseRepository ref
   * REPORT_GLF.md B2), Carenza.toData() already round-trips its full raw row
   * (see Carenza entity), so no column is dropped here; this stays on
   * `updateRowWhere` rather than `Repository.save()` because CARENZE's
   * composite PK (STUDENTE, PROGRESSIVO) is resolved by business columns, not
   * a single `entity.id` — the write path both the real SheetDbAdapter and the
   * FakeDatabase test double agree on.
   */
  setCarenzaMateria(carenza: Carenza, materia: MateriaId, valore: ValoreCarenza | null): void {
    const cols = this.materieColumns.get(materia.value);
    if (cols === undefined) throw new MateriaNotFoundError(`Materia ${materia.value} non nella matrice cattedre`);
    const row = { ...carenza.toData(), [cols.main]: valore === null ? '' : valore.toString() };
    this.database.tables[TABLE.CARENZE]!.updateRowWhere(
      { [COL_CARENZE.STUDENTE]: carenza.studente, [COL_CARENZE.PROGRESSIVO]: carenza.progressivo },
      row
    );
    this.database.save();
  }

  private inAnnoScolastico(c: Carenza, anno: AnnoScolastico): boolean {
    const d = new Date(c.data);
    if (Number.isNaN(d.getTime())) return false;
    const inizio = anno.getAnnoInizio();
    const start = new Date(Date.UTC(inizio, 8, 1));       // 1 Sep <inizio>
    const end = new Date(Date.UTC(inizio + 1, 7, 31));    // 31 Aug <inizio+1>
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  }
}
