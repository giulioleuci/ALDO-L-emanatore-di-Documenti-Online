import { Supplenza } from '../../domain/entities/Supplenza';
import { DocenteRepository } from './DocenteRepository';
import { EntityNotFoundError, ValidationError } from '../../domain/errors/DomainError';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
import type { Docente } from '../../domain/entities/Docente';
import { TABLE, COL_SUPPLENZE } from '../../config/schema';

const utils = new UtilsService();
/** ISO day via CoreUtilsLib (UTC — deterministic across host timezones). */
function isoDate(d: Date): string {
  return utils.formatDate(d, 'YYYY-MM-DD', { utc: true }) ?? '';
}

/**
 * SUPPLENZE repository on the DomainRepositoryLib Repository base. Composite PK
 * (TITOLARE, SUPPLENTE, DAL, CLASSI, MATERIE) — base findById does not apply
 * (ref 06 §14). This repository owns persistence, indexed lookups, hydration,
 * and overlap validation; effective-assignment resolution is delegated to the
 * shared GLF-backed `ITeachingAssignmentResolver`.
 */
export class SupplenzaRepository extends Repository<Supplenza> implements ISupplenzaRepository {
  private readonly docenti: DocenteRepository;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.SUPPLENZE, Supplenza);
    this.docenti = new DocenteRepository(database);
    // O(1) hot-lookup indices for findByTitolare/findBySupplente (ref
    // REPORT_GLF.md A2). SUPPLENZE has no Specification here (the filter is a
    // direct entity-field predicate, not a domain spec), so this bypasses
    // Repository.find() and calls the indexed lookup seam directly.
    database.tables[TABLE.SUPPLENZE]!.createIndex(COL_SUPPLENZE.TITOLARE);
    database.tables[TABLE.SUPPLENZE]!.createIndex(COL_SUPPLENZE.SUPPLENTE);
  }

  findByTitolare(docente: Docente): Supplenza[] {
    const hits = this.database.tables[TABLE.SUPPLENZE]!.indexedLookup(
      COL_SUPPLENZE.TITOLARE,
      docente.id
    );
    if (hits !== null) return hits.map((row) => Supplenza.fromData(row));
    return this.findAll().filter((s) => s.titolare === docente.id);
  }

  findBySupplente(docente: Docente): Supplenza[] {
    const hits = this.database.tables[TABLE.SUPPLENZE]!.indexedLookup(
      COL_SUPPLENZE.SUPPLENTE,
      docente.id
    );
    if (hits !== null) return hits.map((row) => Supplenza.fromData(row));
    return this.findAll().filter((s) => s.supplente === docente.id);
  }

  findAttive(data: Date): Supplenza[] {
    return this.findAll().filter((s) => s.isAttivaData(data));
  }

  /**
   * Creates and appends a supplenza, enforcing the invariant that a teacher has
   * no two supplenze with overlapping periods for the same class+subject context
   * (ref 04 §14, 06 §14). Appends through the library table seam; throws (without
   * creating) on violation.
   */
  creaSupplenza(
    titolare: Docente,
    supplente: Docente,
    dal: Date,
    al: Date | null,
    classi: string,
    materie: string
  ): Supplenza {
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
      throw new ValidationError(
        `Supplenza sovrapposta per ${titolare.id ?? '?'} nello stesso contesto classe+materia`
      );
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

  private requireDocente(email: string): Docente {
    const d = this.docenti.findById(email);
    if (d === null) throw new EntityNotFoundError(`Docente ${email} non trovato (SUPPLENZE)`);
    return d;
  }
}
