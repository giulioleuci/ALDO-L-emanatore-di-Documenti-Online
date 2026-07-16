import { Docente } from '../../domain/entities/Docente';
import { DipartimentoRepository } from './DipartimentoRepository';
import {
  DocentiPerDipartimentoSpec,
  DocentiITPSpec
} from '../../domain/specifications/DocenteSpecs';
import { EntityNotFoundError } from '../../domain/errors/DomainError';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { Dipartimento } from '../../domain/entities/Dipartimento';
import type { DipartimentoId } from '../../domain/value-objects/DipartimentoId';
import { TABLE, COL_CLASSI } from '../../config/schema';

/**
 * DOCENTI repository on the DomainRepositoryLib Repository base (PK = EMAIL,
 * ref 06 §2). Cattedra/supplenza navigation (getClassiInsegnate,
 * getMaterieInsegnate, getSupplenzaAttiva) lands with the ClasseRepository
 * dynamic-column work (R2b) and SupplenzaRepository (R2d).
 */
export class DocenteRepository extends Repository<Docente> implements IDocenteRepository {
  private readonly dipartimenti: DipartimentoRepository;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.DOCENTI, Docente);
    this.dipartimenti = new DipartimentoRepository(database);
  }

  /** Teachers of a department (ref 06 §2). */
  findByDipartimento(dipartId: DipartimentoId): Docente[] {
    const spec = new DocentiPerDipartimentoSpec(dipartId);
    return this.find(spec);
  }

  /** ITP (laboratory) teachers (ref 06 §2). */
  findITP(): Docente[] {
    const spec = new DocentiITPSpec();
    return this.find(spec);
  }

  /**
   * Class coordinators: reads the CLASSI.COORD CSV of every row, dedupes the
   * emails and loads the matching Docente entities (ref 06 §2).
   */
  findCoordinatori(): Docente[] {
    const emails = new Set<string>();
    for (const row of this.database.tables[TABLE.CLASSI]!.getAllRows()) {
      const coord = row[COL_CLASSI.COORD];
      if (typeof coord !== 'string') continue;
      for (const e of coord
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)) {
        emails.add(e);
      }
    }
    const result: Docente[] = [];
    for (const email of emails) {
      const d = this.findById(email);
      if (d !== null) result.push(d);
    }
    return result;
  }

  /** Department the teacher belongs to (ref 06 §2). */
  getDipartimento(docente: Docente): Dipartimento {
    const dip = this.dipartimenti.findByIdCached(docente.dipartimentoId);
    if (dip === null) {
      throw new EntityNotFoundError(
        `Dipartimento non trovato per docente ${docente.id ?? '?'}: "${docente.dipart}"`
      );
    }
    return dip;
  }
}
