import { VariazioneCattedra } from '../../domain/entities/VariazioneCattedra';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE } from '../../config/schema';

/**
 * VARIAZIONI_CATTEDRA repository on the DomainRepositoryLib Repository base.
 * Composite PK (CLASSE_ID, MATERIA_ID) — both CSV, matched by containment in
 * memory, never a direct PK lookup (ref 06 §20). Priority 2 in role resolution.
 */
export class VariazioneCattedraRepository extends Repository<VariazioneCattedra> {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.VARIAZIONI_CATTEDRA, VariazioneCattedra);
  }

  findByClasse(classeId: ClasseId): VariazioneCattedra[] {
    return this.findAll().filter((v) => v.applicaAClasse(classeId));
  }

  findByMateria(materiaId: MateriaId): VariazioneCattedra[] {
    return this.findAll().filter((v) => v.applicaAMateria(materiaId));
  }

  /** First variation covering the (class, subject) pair; null if none (ref 06 §20). */
  findVariazioneAttiva(classeId: ClasseId, materiaId: MateriaId): VariazioneCattedra | null {
    return this.findAll().find((v) => v.applicaAContesto(classeId, materiaId)) ?? null;
  }

  findByNuovoTitolare(email: Email): VariazioneCattedra[] {
    return this.findAll().filter((v) => v.nuovoTitolare === email.value);
  }
}
