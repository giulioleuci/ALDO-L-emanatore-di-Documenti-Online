import { Supplenza } from '../../domain/entities/Supplenza';
import { DocenteRepository } from './DocenteRepository';
import { EntityNotFoundError, ValidationError } from '../../domain/errors/DomainError';
import type { Docente } from '../../domain/entities/Docente';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import { TABLE, COL_SUPPLENZE } from '../../config/schema';

const utils = new UtilsService();
/** ISO day via CoreUtilsLib (UTC — deterministic across host timezones). */
function isoDate(d: Date): string { return utils.formatDate(d, 'YYYY-MM-DD', { utc: true }) ?? ''; }

/** Role token used when crawling the supply-delegation graph (RoleResolutionLib). */
const RUOLO_TITOLARE_CATTEDRA = 'TITOLARE_CATTEDRA';

/**
 * SUPPLENZE repository on the DomainRepositoryLib Repository base. Composite PK
 * (TITOLARE, SUPPLENTE, DAL, CLASSI, MATERIE) — base findById does not apply
 * (ref 06 §14); queries load rows and filter in memory. Priority 1 in role
 * resolution: the transitive supply-of-supply crawl (cycle-guarded) is
 * delegated to RoleResolutionLib's delegation-chain engine; only the domain
 * applicability filter (period + class/subject context) lives here.
 */
export class SupplenzaRepository extends Repository<Supplenza> {
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
    const hits = this.database.tables[TABLE.SUPPLENZE]!.indexedLookup(COL_SUPPLENZE.TITOLARE, docente.id);
    if (hits !== null) return hits.map((row) => Supplenza.fromData(row));
    return this.findAll().filter((s) => s.titolare === docente.id);
  }

  findBySupplente(docente: Docente): Supplenza[] {
    const hits = this.database.tables[TABLE.SUPPLENZE]!.indexedLookup(COL_SUPPLENZE.SUPPLENTE, docente.id);
    if (hits !== null) return hits.map((row) => Supplenza.fromData(row));
    return this.findAll().filter((s) => s.supplente === docente.id);
  }

  findAttive(data: Date): Supplenza[] {
    return this.findAll().filter((s) => s.isAttivaData(data));
  }

  /**
   * The effective supply teacher for a titolare/date/context, following the
   * replacement chain to the end (supply-of-supply) (ref 06 §14).
   *
   * The domain filter (active period, class/subject applicability) is SGSA
   * business logic; the transitive graph crawl with cycle detection is
   * RoleResolutionLib's job: applicable SUPPLENZE become library `Delegation`
   * value objects and `InMemoryDelegationSource.getDelegationChain` walks
   * titolare → supplente → supplente-del-supplente to the end of the chain.
   */
  findSupplenzaSpecifica(titolare: Docente, data: Date, classe?: ClasseId, materia?: MateriaId): Supplenza | null {
    const email = titolare.id ?? '';
    if (email === '') return null;

    const applicabili = this.findAll().filter((s) =>
      s.isAttivaData(data) &&
      (classe === undefined || s.applicaAClasse(classe)) &&
      (materia === undefined || s.applicaAMateria(materia)) &&
      // A self-substitution row is domain-invalid (and rejected by the library);
      // skipping it leaves the titolare in charge, as resolution semantics require.
      s.titolare !== s.supplente
    );
    if (applicabili.length === 0) return null;

    const source = new InMemoryDelegationSource();
    const byArc = new Map<string, Supplenza>();
    applicabili.forEach((s, i) => {
      const periodo = s.getPeriodo();
      source.addDelegation(new Delegation({
        id: `${s.id ?? 'SUPPLENZA'}#${i}`,
        principalId: s.titolare,
        delegateId: s.supplente,
        roleIds: '*',
        validFrom: periodo.dal,
        validTo: periodo.al
      }));
      const arc = `${s.titolare}→${s.supplente}`;
      if (!byArc.has(arc)) byArc.set(arc, s);
    });

    const chain = source.getDelegationChain(email, RUOLO_TITOLARE_CATTEDRA, Scope.global(), data);
    if (chain.length === 0) return null;
    const last = chain[chain.length - 1]!;
    return byArc.get(`${last.principalId}→${last.delegateId}`) ?? null;
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

  private requireDocente(email: string): Docente {
    const d = this.docenti.findById(email);
    if (d === null) throw new EntityNotFoundError(`Docente ${email} non trovato (SUPPLENZE)`);
    return d;
  }
}
