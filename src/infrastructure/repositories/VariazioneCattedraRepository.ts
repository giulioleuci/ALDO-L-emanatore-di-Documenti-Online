import { VariazioneCattedra } from '../../domain/entities/VariazioneCattedra';
import type { IVariazioneCattedraRepository } from '../../domain/repositories/IVariazioneCattedraRepository';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { Email } from '../../domain/value-objects/Email';
import {
  VariazioniPerClasseSpec,
  VariazioniPerMateriaSpec,
  VariazioniPerNuovoTitolareSpec
} from '../../domain/specifications/VariazioneCattedraSpecs';
import { TABLE, COL_VARIAZIONI } from '../../config/schema';

/**
 * VARIAZIONI_CATTEDRA repository on the DomainRepositoryLib Repository base.
 * Composite PK (CLASSE_ID, MATERIA_ID) — both CSV, matched by containment in
 * memory, never a direct PK lookup (ref 06 §20). Priority 2 in role resolution.
 */
export class VariazioneCattedraRepository
  extends Repository<VariazioneCattedra>
  implements IVariazioneCattedraRepository
{
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.VARIAZIONI_CATTEDRA, VariazioneCattedra);
    // O(1) hot-lookup index for findByNuovoTitolare (ref ALDO_GLF_AUDIT_RESULTS.md D-4):
    // this table sits on the hot SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI role-resolution
    // path. NUOVO_TITOLARE is a plain-equality email column, unlike CLASSE_ID/MATERIA_ID
    // (CSV-containment, not index-eligible).
    database.tables[TABLE.VARIAZIONI_CATTEDRA]!.createIndex(COL_VARIAZIONI.NUOVO_TITOLARE);
  }

  findByClasse(classeId: ClasseId): VariazioneCattedra[] {
    return this.find(new VariazioniPerClasseSpec(classeId));
  }

  findByMateria(materiaId: MateriaId): VariazioneCattedra[] {
    return this.find(new VariazioniPerMateriaSpec(materiaId));
  }

  /** First variation covering the (class, subject) pair; null if none (ref 06 §20). */
  findVariazioneAttiva(classeId: ClasseId, materiaId: MateriaId): VariazioneCattedra | null {
    return this.findAll().find((v) => v.applicaAContesto(classeId, materiaId)) ?? null;
  }

  findByNuovoTitolare(email: Email): VariazioneCattedra[] {
    return this.find(new VariazioniPerNuovoTitolareSpec(email));
  }
}
