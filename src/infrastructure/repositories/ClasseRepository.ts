import type { IClasseRepository, RepoRow } from '../../domain/repositories/IClasseRepository';
import { Classe } from '../../domain/entities/Classe';
import { Docente } from '../../domain/entities/Docente';
import { Indirizzo } from '../../domain/entities/Indirizzo';
import { Alunno } from '../../domain/entities/Alunno';
import { ConsiglioDiClasse, type Cattedra } from '../../domain/entities/ConsiglioDiClasse';
import { DocenteRepository } from './DocenteRepository';
import { IndirizzoRepository } from './IndirizzoRepository';
import { AlunnoRepository } from './AlunnoRepository';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { IndirizzoId } from '../../domain/value-objects/IndirizzoId';
import { AlunniAttiviSpec } from '../../domain/specifications/AlunniAttiviSpec';
import { TABLE, COL_DOCENTI, COL_MATERIE, COL_ALUNNI, COL_CLASSI } from '../../config/schema';
import { EntityNotFoundError, MateriaNotFoundError } from '../../domain/errors/DomainError';

/** Dynamic per-subject column names in the CLASSI cattedra matrix (ref 06 §3). */
interface MateriaColumns { main: string; itp: string }

/**
 * CLASSI repository on the DomainRepositoryLib Repository base. Standard CRUD
 * (findById/findAll/find/save…) comes from the base; the SGSA-specific queries
 * below read cross-table rows through the injected database's `tables` seam.
 * The cattedra matrix is a set of dynamic per-subject columns (Priority 3 role
 * resolution); the column map is built once from MATERIE. Articolazione methods
 * (isArticolata/getClassiPartner/…) and write-through setters land in R2c and
 * the persistence-seam increment.
 */
export class ClasseRepository extends Repository<Classe> implements IClasseRepository {
  private readonly docenti: DocenteRepository;
  private readonly indirizzi: IndirizzoRepository;
  private readonly alunni: AlunnoRepository;
  private readonly materieColumns: Map<string, MateriaColumns>;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CLASSI, Classe);
    this.docenti = new DocenteRepository(database);
    this.indirizzi = new IndirizzoRepository(database);
    this.alunni = new AlunnoRepository(database);
    this.materieColumns = new Map<string, MateriaColumns>();
    for (const row of database.tables[TABLE.MATERIE]!.getAllRows()) {
      const id = row[COL_MATERIE.ID];
      if (typeof id === 'string' && id.length > 0) {
        this.materieColumns.set(id, { main: id, itp: `${id}.itp` });
      }
    }
  }

  // Base findById takes a string PK; accept a ClasseId too for domain callers.
  // Hydration runs Classe.fromData → the constructor fails loud on malformed rows.
  override findById(id: string | ClasseId): Classe | null {
    return super.findById(typeof id === 'string' ? id : id.value);
  }

  // --- Domain-specific finders (ref 06 §3) ---

  findAttive(): Classe[] {
    return this.rows().filter((r) => r[COL_CLASSI.ATTIVA] === true).map((r) => Classe.fromData(r));
  }

  findByAnno(anno: number): Classe[] {
    return this.rows().filter((r) => Number(r[COL_CLASSI.ANNO]) === anno).map((r) => Classe.fromData(r));
  }

  findByIndirizzo(indirizzoId: IndirizzoId): Classe[] {
    return this.rows().filter((r) => r[COL_CLASSI.INDIRIZZO] === indirizzoId.value).map((r) => Classe.fromData(r));
  }

  findArticolate(): Classe[] {
    return this.rows().filter((r) => this.hasArticolazione(r)).map((r) => Classe.fromData(r));
  }

  // --- Cattedra matrix (dynamic columns, ref 06 §3) ---

  getDocentiPerMateria(classe: Classe, materia: MateriaId): Docente[] {
    const cols = this.materieColumns.get(materia.value);
    if (cols === undefined) throw new MateriaNotFoundError(`Materia ${materia.value} non nella matrice cattedre`);
    return this.loadDocenti(this.rowOf(classe)[cols.main]);
  }

  getITPPerMateria(classe: Classe, materia: MateriaId): Docente[] {
    const cols = this.materieColumns.get(materia.value);
    if (cols === undefined) throw new MateriaNotFoundError(`Materia ${materia.value} non nella matrice cattedre`);
    return this.loadDocenti(this.rowOf(classe)[cols.itp]);
  }

  /** All teachers of the class council: every main + itp column, deduped, sorted by surname. */
  getAllDocentiCDC(classe: Classe): Docente[] {
    const row = this.rowOf(classe);
    const emails = new Set<string>();
    for (const cols of this.materieColumns.values()) {
      for (const e of this.csvEmails(row[cols.main])) emails.add(e);
      for (const e of this.csvEmails(row[cols.itp])) emails.add(e);
    }
    return this.loadDocentiFromEmails(emails).sort((a, b) => a.cognome.localeCompare(b.cognome));
  }

  getDocentiIRC(classe: Classe): Docente[] {
    return this.loadDocenti(this.rowOf(classe)[COL_CLASSI.IRC]);
  }

  getDocentiALT(classe: Classe): Docente[] {
    return this.loadDocenti(this.rowOf(classe)[COL_CLASSI.ALT]);
  }

  // --- Coordinators and special roles (ref 06 §3) ---

  getCoordinatori(classe: Classe): Docente[] {
    return this.loadDocenti(this.rowOf(classe)[COL_CLASSI.COORD]);
  }

  /** Main entry for every role: parses CLASSI.RUOLI JSON, the value as an email CSV. */
  getDocentiRuolo(classe: Classe, nomeRuolo: string): Docente[] {
    const raw = this.rowOf(classe)[COL_CLASSI.RUOLI];
    if (typeof raw !== 'string' || raw.trim() === '') return [];
    const ruoli = JSON.parse(raw) as Record<string, unknown>;
    const value = ruoli[nomeRuolo];
    return typeof value === 'string' ? this.loadDocenti(value) : [];
  }

  /** Shortcut for single-holder roles (e.g. SEGRETARIO); use getDocentiRuolo otherwise. */
  getRuolo(classe: Classe, nomeRuolo: string): Docente | null {
    return this.getDocentiRuolo(classe, nomeRuolo)[0] ?? null;
  }

  // --- Storico / indirizzo / studenti (ref 06 §3) ---

  getStorico(classe: Classe): ClasseId[] {
    const raw = this.rowOf(classe)[COL_CLASSI.STORICO];
    if (typeof raw !== 'string') return [];
    return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0).map((s) => ClasseId.of(s));
  }

  getIndirizzo(classe: Classe): Indirizzo {
    const ind = this.indirizzi.findByIdCached(IndirizzoId.of(classe.indirizzo));
    if (ind === null) throw new EntityNotFoundError(`Indirizzo ${classe.indirizzo} non trovato (classe ${classe.id ?? '?'})`);
    return ind;
  }

  getStudenti(classe: Classe, soloAttivi = false): Alunno[] {
    const studenti = this.alunni.findByClasse(classe.classeId);
    return soloAttivi ? studenti.filter((a) => a.isAttivo()) : studenti;
  }

  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse {
    const classe = this.database.tables[TABLE.CLASSI]!.getByPK(id.value);
    if (!classe) throw new EntityNotFoundError(`Classe ${id.value} non trovata`);
    const materie = this.database.tables[TABLE.MATERIE]!.getAllRows();
    const docentiByEmail = this.indexDocenti();
    const cattedre: Cattedra[] = [];
    for (const m of materie) {
      const materiaId = String(m[COL_MATERIE.ID]);
      const cellEmail = classe[materiaId];
      if (typeof cellEmail !== 'string' || cellEmail.trim() === '') continue;
      const docente = docentiByEmail.get(cellEmail.trim());
      if (!docente) throw new EntityNotFoundError(`Docente ${cellEmail} (materia ${materiaId}) non in DOCENTI`);
      cattedre.push({ materia: MateriaId.of(materiaId), docente });
    }
    return new ConsiglioDiClasse(cattedre);
  }

  getAlunniAttivi(id: ClasseId): RepoRow[] {
    const spec = new AlunniAttiviSpec();
    const rows = this.database.tables[TABLE.ALUNNI]!.getAllRows() as unknown as RepoRow[];
    return rows.filter((r) => r[COL_ALUNNI.CLASSE] === id.value && spec.isSatisfiedBy(r));
  }

  private indexDocenti(): Map<string, Docente> {
    const map = new Map<string, Docente>();
    for (const d of this.database.tables[TABLE.DOCENTI]!.getAllRows()) {
      map.set(String(d[COL_DOCENTI.EMAIL]), Docente.fromData(d));
    }
    return map;
  }

  private rows(): Record<string, unknown>[] {
    return this.database.tables[TABLE.CLASSI]!.getAllRows();
  }

  private rowOf(classe: Classe): Record<string, unknown> {
    const row = this.database.tables[TABLE.CLASSI]!.getByPK(classe.id ?? '');
    if (row === null) throw new EntityNotFoundError(`Classe ${classe.id ?? '?'} non trovata`);
    return row;
  }

  private hasArticolazione(row: Record<string, unknown>): boolean {
    const a = row[COL_CLASSI.ARTICOLAZIONE];
    return typeof a === 'string' && a.trim().length > 0;
  }

  /** Emails from a CSV cell, trimmed and non-empty. */
  private csvEmails(cell: unknown): string[] {
    if (typeof cell !== 'string') return [];
    return cell.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }

  /** Loads Docente entities from a CSV cell, skipping emails absent from DOCENTI. */
  private loadDocenti(cell: unknown): Docente[] {
    return this.loadDocentiFromEmails(new Set(this.csvEmails(cell)));
  }

  private loadDocentiFromEmails(emails: Set<string>): Docente[] {
    const result: Docente[] = [];
    for (const email of emails) {
      const d = this.docenti.findById(email);
      if (d !== null) result.push(d);
    }
    return result;
  }
}
