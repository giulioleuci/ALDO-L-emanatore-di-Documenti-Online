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
import { ArticolazioneConfig } from '../../domain/value-objects/ArticolazioneConfig';
import { AlunniAttiviSpec } from '../../domain/specifications/AlunniAttiviSpec';
import {
  ClassiAttiveSpec,
  ClassiPerAnnoSpec,
  ClassiPerIndirizzoSpec,
  ClassiArticolateSpec
} from '../../domain/specifications/ClasseSpecs';
import { TABLE, COL_DOCENTI, COL_MATERIE, COL_CLASSI } from '../../config/schema';
import {
  EntityNotFoundError,
  MateriaNotFoundError,
  ValidationError
} from '../../domain/errors/DomainError';

/** Dynamic per-subject column names in the CLASSI cattedra matrix (ref 06 §3). */
interface MateriaColumns {
  main: string;
  itp: string;
}

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
    return this.find(new ClassiAttiveSpec());
  }

  findByAnno(anno: number): Classe[] {
    return this.find(new ClassiPerAnnoSpec(anno));
  }

  findByIndirizzo(indirizzoId: IndirizzoId): Classe[] {
    return this.find(new ClassiPerIndirizzoSpec(indirizzoId));
  }

  findArticolate(): Classe[] {
    return this.find(new ClassiArticolateSpec());
  }

  // --- Cattedra matrix (dynamic columns, ref 06 §3) ---

  getDocentiPerMateria(classe: Classe, materia: MateriaId): Docente[] {
    const cols = this.materieColumns.get(materia.value);
    if (cols === undefined)
      throw new MateriaNotFoundError(`Materia ${materia.value} non nella matrice cattedre`);
    return this.loadDocenti(this.rowOf(classe)[cols.main]);
  }

  getITPPerMateria(classe: Classe, materia: MateriaId): Docente[] {
    const cols = this.materieColumns.get(materia.value);
    if (cols === undefined)
      throw new MateriaNotFoundError(`Materia ${materia.value} non nella matrice cattedre`);
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
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => ClasseId.of(s));
  }

  getIndirizzo(classe: Classe): Indirizzo {
    const ind = this.indirizzi.findByIdCached(IndirizzoId.of(classe.indirizzo));
    if (ind === null)
      throw new EntityNotFoundError(
        `Indirizzo ${classe.indirizzo} non trovato (classe ${classe.id ?? '?'})`
      );
    return ind;
  }

  getStudenti(classe: Classe, soloAttivi = false): Alunno[] {
    const studenti = this.alunni.findByClasse(classe.classeId);
    return soloAttivi ? studenti.filter((a) => a.isAttivo()) : studenti;
  }

  // --- Articolazione (ref 05, 06 §3) ---

  getArticolazione(classe: Classe): ArticolazioneConfig | null {
    return ArticolazioneConfig.fromJson(this.rowOf(classe)[COL_CLASSI.ARTICOLAZIONE]);
  }

  isArticolata(classe: Classe): boolean {
    return this.getArticolazione(classe) !== null;
  }

  /** Partner of a partner class; null for a parent (use getClassiPartner) or a standard class. */
  getClassePartner(classe: Classe): Classe | null {
    const config = this.getArticolazione(classe);
    if (config === null || config.partner === null) return null;
    return this.requireClasse(config.partner);
  }

  /** The two partners of a parent class. Throws if called on a partner; [] for a standard class. */
  getClassiPartner(classe: Classe): Classe[] {
    const config = this.getArticolazione(classe);
    if (config === null) return [];
    if (config.isPartner()) {
      throw new ValidationError(
        `getClassiPartner va chiamato solo sulla classe parent; ${classe.id ?? '?'} è una partner`
      );
    }
    return config.partners.map((id) => this.requireClasse(id));
  }

  getClasseParent(classe: Classe): Classe | null {
    const config = this.getArticolazione(classe);
    if (config === null || config.parent === null) return null;
    return this.requireClasse(config.parent);
  }

  /** The class itself plus all related classes (parent + partners), deduped by id. */
  getGruppoArticolazione(classe: Classe): Classe[] {
    const byId = new Map<string, Classe>();
    const add = (c: Classe | null): void => {
      if (c?.id != null) byId.set(c.id, c);
    };
    add(classe);
    const config = this.getArticolazione(classe);
    if (config !== null) {
      if (config.isParent()) {
        for (const p of this.getClassiPartner(classe)) add(p);
      } else {
        add(this.getClasseParent(classe));
        add(this.getClassePartner(classe));
      }
    }
    return [...byId.values()];
  }

  /** CDC of the articulated group: this class merged with parent's partners / partner's counterpart. */
  getAllDocentiCDCArticolata(classe: Classe): Docente[] {
    const byEmail = new Map<string, Docente>();
    const add = (docenti: Docente[]): void => {
      for (const d of docenti) if (d.id != null) byEmail.set(d.id, d);
    };
    add(this.getAllDocentiCDC(classe));
    const config = this.getArticolazione(classe);
    if (config !== null) {
      if (config.isParent()) {
        for (const p of this.getClassiPartner(classe)) add(this.getAllDocentiCDC(p));
      } else {
        const partner = this.getClassePartner(classe);
        if (partner !== null) add(this.getAllDocentiCDC(partner));
      }
    }
    return [...byEmail.values()].sort((a, b) => a.cognome.localeCompare(b.cognome));
  }

  /**
   * Cattedra teacher resolved across an articulation: with no articolazione it
   * is the plain getDocentiPerMateria; otherwise, when a student indirizzo is
   * given, the group class of that indirizzo is used (ref 05 §3, 06 §3).
   */
  getDocentiPerMateriaArticolata(
    classe: Classe,
    materia: MateriaId,
    indirizzoStudente?: IndirizzoId
  ): Docente[] {
    const config = this.getArticolazione(classe);
    if (config === null || indirizzoStudente === undefined) {
      return this.getDocentiPerMateria(classe, materia);
    }
    const target = this.getGruppoArticolazione(classe).find(
      (c) => c.indirizzo === indirizzoStudente.value
    );
    return target === undefined ? [] : this.getDocentiPerMateria(target, materia);
  }

  /**
   * Splits the articulated group's subjects into shared vs per-group separate,
   * comparing the two partner classes' teacher columns (ref 05 §3, 09 §9). A
   * subject taught by the same teacher(s) in both partners is shared; otherwise
   * it is separate, listed under each group that teaches it. Ordered by the
   * parent's `partners` [primo, secondo]. Returns null for a non-articulated class.
   */
  getMaterieArticolazione(
    classe: Classe
  ): {
    condivise: string[];
    separatePrimoGruppo: string[];
    separateSecondoGruppo: string[];
  } | null {
    if (this.getArticolazione(classe) === null) return null;
    const [primo, secondo] = this.orderedPartners(classe);
    if (primo === undefined || secondo === undefined) return null;
    const condivise: string[] = [];
    const separatePrimoGruppo: string[] = [];
    const separateSecondoGruppo: string[] = [];
    for (const sigla of this.materieColumns.keys()) {
      const materia = MateriaId.of(sigla);
      const e1 = this.emailSet(this.getDocentiPerMateria(primo, materia));
      const e2 = this.emailSet(this.getDocentiPerMateria(secondo, materia));
      if (e1.size > 0 && e2.size > 0 && this.sameSet(e1, e2)) {
        condivise.push(sigla);
        continue;
      }
      if (e1.size > 0) separatePrimoGruppo.push(sigla);
      if (e2.size > 0) separateSecondoGruppo.push(sigla);
    }
    return { condivise, separatePrimoGruppo, separateSecondoGruppo };
  }

  /** The parent's two partners in canonical [primo, secondo] order, from any class in the group. */
  private orderedPartners(classe: Classe): Classe[] {
    const config = this.getArticolazione(classe);
    if (config === null) return [];
    const parent = config.isParent() ? classe : this.getClasseParent(classe);
    if (parent === null) return [];
    return this.getClassiPartner(parent);
  }

  /** Every subject the teacher holds in this class, tagged main vs itp column (09 §4). */
  getMaterieDelDocente(
    classe: Classe,
    docenteEmail: string
  ): Array<{ sigla: string; isItp: boolean }> {
    const row = this.rowOf(classe);
    const out: Array<{ sigla: string; isItp: boolean }> = [];
    for (const [sigla, cols] of this.materieColumns) {
      if (this.csvEmails(row[cols.main]).includes(docenteEmail)) out.push({ sigla, isItp: false });
      else if (this.csvEmails(row[cols.itp]).includes(docenteEmail))
        out.push({ sigla, isItp: true });
    }
    return out;
  }

  /** First subject (sigla) the teacher holds in this class (main or itp column), or null. */
  getMateriaDocente(classe: Classe, docenteEmail: string): string | null {
    const row = this.rowOf(classe);
    for (const [sigla, cols] of this.materieColumns) {
      if (
        this.csvEmails(row[cols.main]).includes(docenteEmail) ||
        this.csvEmails(row[cols.itp]).includes(docenteEmail)
      ) {
        return sigla;
      }
    }
    return null;
  }

  private emailSet(docenti: Docente[]): Set<string> {
    return new Set(docenti.map((d) => d.id ?? '').filter((e) => e !== ''));
  }

  private sameSet(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  private requireClasse(id: ClasseId): Classe {
    const classe = this.findById(id);
    if (classe === null)
      throw new EntityNotFoundError(`Classe partner/parent ${id.value} non trovata`);
    return classe;
  }

  // --- Write-back of coordinators / roles (ref 06 §3) ---
  // CLASSI is a wide dynamic-column table (per-subject cattedra matrix generated
  // at runtime from MATERIE); Classe.getKnownColumns() opts it into
  // DomainRepositoryLib's dynamic-column passthrough (ref REPORT_GLF.md B2), so
  // these column-level edits persist through Repository.save(entity): the
  // library merges every other captured column back in unmodified.

  setCoordinatori(classe: Classe, coordinatori: Docente[]): void {
    this.writeColumn(
      classe,
      COL_CLASSI.COORD,
      coordinatori
        .map((d) => d.id ?? '')
        .filter((e) => e !== '')
        .join(',')
    );
  }

  /** Sets RUOLI[nomeRuolo] to the CSV of the given teachers, or removes the key when empty. */
  setDocentiRuolo(classe: Classe, nomeRuolo: string, docenti: Docente[]): void {
    const row = this.rowOf(classe);
    const raw = row[COL_CLASSI.RUOLI];
    const ruoli =
      typeof raw === 'string' && raw.trim() !== ''
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
    const emails = docenti.map((d) => d.id ?? '').filter((e) => e !== '');
    if (emails.length === 0) delete ruoli[nomeRuolo];
    else ruoli[nomeRuolo] = emails.join(',');
    this.writeColumn(classe, COL_CLASSI.RUOLI, JSON.stringify(ruoli));
  }

  /** Shortcut for single-holder roles (ref 06 §3). */
  setRuolo(classe: Classe, nomeRuolo: string, docente: Docente): void {
    this.setDocentiRuolo(classe, nomeRuolo, [docente]);
  }

  private writeColumn(classe: Classe, colonna: string, valore: string): void {
    // Refresh the passthrough snapshot from the current row first, so columns
    // this `classe` instance never hydrated through (or that changed since) are
    // not lost when save() merges captured dynamic columns back in.
    classe.captureDynamicColumns(this.rowOf(classe));
    classe.setDynamicColumn(colonna, valore);
    this.save(classe);
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
      if (!docente)
        throw new EntityNotFoundError(`Docente ${cellEmail} (materia ${materiaId}) non in DOCENTI`);
      cattedre.push({ materia: MateriaId.of(materiaId), docente });
    }
    return new ConsiglioDiClasse(cattedre);
  }

  /** Delegates to AlunnoRepository instead of reaching into TABLE.ALUNNI directly (ref ALDO_GLF_AUDIT_RESULTS.md D-1). */
  getAlunniAttivi(id: ClasseId): RepoRow[] {
    return this.alunni
      .find(new AlunniAttiviSpec())
      .filter((a) => a.classe === id.value)
      .map((a) => a.toData() as unknown as RepoRow);
  }

  private indexDocenti(): Map<string, Docente> {
    const map = new Map<string, Docente>();
    for (const d of this.database.tables[TABLE.DOCENTI]!.getAllRows()) {
      map.set(String(d[COL_DOCENTI.EMAIL]), Docente.fromData(d));
    }
    return map;
  }

  private rowOf(classe: Classe): Record<string, unknown> {
    const row = this.database.tables[TABLE.CLASSI]!.getByPK(classe.id ?? '');
    if (row === null) throw new EntityNotFoundError(`Classe ${classe.id ?? '?'} non trovata`);
    return row;
  }

  /** Emails from a CSV cell, trimmed and non-empty. */
  private csvEmails(cell: unknown): string[] {
    if (typeof cell !== 'string') return [];
    return cell
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
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
