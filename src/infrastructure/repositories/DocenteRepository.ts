import { Docente } from '../../domain/entities/Docente';
import { DocentiPerDipartimentoSpec } from '../../domain/specifications/DocenteSpecs';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { DipartimentoId } from '../../domain/value-objects/DipartimentoId';
import { TABLE } from '../../config/schema';

/**
 * DOCENTI repository on the DomainRepositoryLib Repository base (PK = EMAIL,
 * ref 06 §2). Cattedra/supplenza navigation (getClassiInsegnate,
 * getMaterieInsegnate, getSupplenzaAttiva) lands with the ClasseRepository
 * dynamic-column work (R2b) and SupplenzaRepository (R2d).
 */
export class DocenteRepository extends Repository<Docente> implements IDocenteRepository {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.DOCENTI, Docente);
  }

  /** Teachers of a department (ref 06 §2). */
  findByDipartimento(dipartId: DipartimentoId): Docente[] {
    const spec = new DocentiPerDipartimentoSpec(dipartId);
    return this.find(spec);
  }
}
