import { Supplenza } from '../../domain/entities/Supplenza';
import { DocenteRepository } from './DocenteRepository';
import { EntityNotFoundError, ValidationError } from '../../domain/errors/DomainError';
import type { Docente } from '../../domain/entities/Docente';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import { TABLE, COL_SUPPLENZE } from '../../config/schema';

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

/**
 * SUPPLENZE repository on the DomainRepositoryLib Repository base. Composite PK
 * (TITOLARE, SUPPLENTE, DAL, CLASSI, MATERIE) — base findById does not apply
 * (ref 06 §14); queries load rows and filter in memory. Priority 1 in role
 * resolution. creaSupplenza (write + overlap invariant) lands with the
 * persistence-seam increment.
 */
export class SupplenzaRepository extends Repository<Supplenza> {
  private readonly docenti: DocenteRepository;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.SUPPLENZE, Supplenza);
    this.docenti = new DocenteRepository(database);
  }

  findByTitolare(docente: Docente): Supplenza[] {
    return this.findAll().filter((s) => s.titolare === docente.id);
  }

  findBySupplente(docente: Docente): Supplenza[] {
    return this.findAll().filter((s) => s.supplente === docente.id);
  }

  findAttive(data: Date): Supplenza[] {
    return this.findAll().filter((s) => s.isAttivaData(data));
  }

  /**
   * The effective supply teacher for a titolare/date/context, following the
   * replacement chain to the end (supply-of-supply), cycle-guarded (ref 06 §14).
   */
  findSupplenzaSpecifica(titolare: Docente, data: Date, classe?: ClasseId, materia?: MateriaId): Supplenza | null {
    return this.resolveChain(titolare.id ?? '', data, classe, materia, new Set<string>());
  }

  /**
   * Creates and appends a supplenza, enforcing the invariant that a teacher has
   * no two supplenze with overlapping periods for the same class+subject context
   * (ref 04 §14, 06 §14). Appends through the library table seam; throws (without
   * creating) on violation.
   */
  creaSupplenza(titolare: Docente, supplente: Docente, dal: Date, al: Date | null, classi: string, materie: string): Supplenza {
    const nuova = Supplenza.fromData({
      [COL_SUPPLENZE.TITOLARE]: titolare.id ?? '',
      [COL_SUPPLENZE.SUPPLENTE]: supplente.id ?? '',
      [COL_SUPPLENZE.DAL]: isoDate(dal),
      [COL_SUPPLENZE.AL]: al === null ? '' : isoDate(al),
      [COL_SUPPLENZE.CLASSI]: classi,
      [COL_SUPPLENZE.MATERIE]: materie
    });
    const conflitto = this.findByTitolare(titolare).find((s) => nuova.contestoOverlaps(s));
    if (conflitto !== undefined) {
      throw new ValidationError(`Supplenza sovrapposta per ${titolare.id ?? '?'} nello stesso contesto classe+materia`);
    }
    this.database.tables[TABLE.SUPPLENZE]!.insertRow(nuova.toData());
    this.database.save();
    return nuova;
  }

  getTitolare(supplenza: Supplenza): Docente {
    return this.requireDocente(supplenza.titolare);
  }

  getSupplente(supplenza: Supplenza): Docente {
    return this.requireDocente(supplenza.supplente);
  }

  private matchFor(titolareEmail: string, data: Date, classe?: ClasseId, materia?: MateriaId): Supplenza | null {
    return this.findAll().find((s) =>
      s.titolare === titolareEmail &&
      s.isAttivaData(data) &&
      (classe === undefined || s.applicaAClasse(classe)) &&
      (materia === undefined || s.applicaAMateria(materia))
    ) ?? null;
  }

  private resolveChain(titolareEmail: string, data: Date, classe: ClasseId | undefined, materia: MateriaId | undefined, visited: Set<string>): Supplenza | null {
    if (titolareEmail === '' || visited.has(titolareEmail)) return null;
    visited.add(titolareEmail);
    const match = this.matchFor(titolareEmail, data, classe, materia);
    if (match === null) return null;
    const deeper = this.resolveChain(match.supplente, data, classe, materia, visited);
    return deeper ?? match;
  }

  private requireDocente(email: string): Docente {
    const d = this.docenti.findById(email);
    if (d === null) throw new EntityNotFoundError(`Docente ${email} non trovato (SUPPLENZE)`);
    return d;
  }
}
