import { VariazioneCattedra } from '../../domain/entities/VariazioneCattedra';
import type { IVariazioneCattedraRepository } from '../../domain/repositories/IVariazioneCattedraRepository';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { Email } from '../../domain/value-objects/Email';
import type { DocenteRepository } from './DocenteRepository';
import {
  VariazioniPerClasseSpec,
  VariazioniPerMateriaSpec,
  VariazioniPerNuovoTitolareSpec,
  VariazioniPerTitolareSpec
} from '../../domain/specifications/VariazioneCattedraSpecs';
import { TABLE, COL_VARIAZIONI } from '../../config/schema';
import {
  VariazioneCattedraTitolareNonTrovatoError,
  VariazioneCattedraInconsistenteError
} from '../../domain/errors/DomainError';

/**
 * VARIAZIONI_CATTEDRA repository on the DomainRepositoryLib Repository base.
 * Composite PK (TITOLARE, NUOVO_TITOLARE, DAL, CLASSI, MATERIE) — CLASSI/MATERIE
 * are CSV, matched by containment in memory, never a direct PK lookup (ref 06
 * §20). Priority 2 in role resolution.
 */
export class VariazioneCattedraRepository
  extends Repository<VariazioneCattedra>
  implements IVariazioneCattedraRepository
{
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.VARIAZIONI_CATTEDRA, VariazioneCattedra);
    // O(1) hot-lookup indices for findByNuovoTitolare/findByTitolare (ref
    // ALDO_GLF_AUDIT_RESULTS.md D-4): this table sits on the hot SUPPLENZE ->
    // VARIAZIONI_CATTEDRA -> CLASSI role-resolution path. TITOLARE/NUOVO_TITOLARE
    // are plain-equality email columns, unlike CLASSI/MATERIE (CSV-containment,
    // not index-eligible).
    database.tables[TABLE.VARIAZIONI_CATTEDRA]!.createIndex(COL_VARIAZIONI.NUOVO_TITOLARE);
    database.tables[TABLE.VARIAZIONI_CATTEDRA]!.createIndex(COL_VARIAZIONI.TITOLARE);
  }

  findByClasse(classeId: ClasseId): VariazioneCattedra[] {
    return this.find(new VariazioniPerClasseSpec(classeId));
  }

  findByMateria(materiaId: MateriaId): VariazioneCattedra[] {
    return this.find(new VariazioniPerMateriaSpec(materiaId));
  }

  findByNuovoTitolare(email: Email): VariazioneCattedra[] {
    return this.find(new VariazioniPerNuovoTitolareSpec(email));
  }

  findByTitolare(email: Email): VariazioneCattedra[] {
    return this.find(new VariazioniPerTitolareSpec(email));
  }

  /**
   * Data-entry validation, meant for import/read-time checks — NOT called from
   * role resolution, which must stay tolerant of a TITOLARE that's a real
   * docente simply not currently holding that cattedra (business-valid, inert;
   * ref AldoTeachingAssignmentResolver tests). Throws on the first row whose
   * TITOLARE isn't a known docente at all, or whose TITOLARE/NUOVO_TITOLARE
   * coincide (ref sub-project-3 design §4).
   */
  validate(docenti: DocenteRepository): void {
    for (const variazione of this.findAll()) {
      if (docenti.findById(variazione.titolare) === null) {
        throw new VariazioneCattedraTitolareNonTrovatoError(
          `VARIAZIONI_CATTEDRA: TITOLARE ${variazione.titolare} non corrisponde a nessun docente noto`
        );
      }
      if (variazione.titolare === variazione.nuovoTitolare) {
        throw new VariazioneCattedraInconsistenteError(
          `VARIAZIONI_CATTEDRA: TITOLARE e NUOVO_TITOLARE coincidono (${variazione.titolare})`
        );
      }
    }
  }
}
