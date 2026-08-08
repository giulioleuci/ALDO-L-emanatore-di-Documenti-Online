import type { Docente } from '../entities/Docente';
import type { DipartimentoId } from '../value-objects/DipartimentoId';

export interface IDocenteRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<Docente>`. */
  findById(id: string): Docente | null;
  /** Inherited from GasLibraryFactory's ambient base `Repository<Docente>`. */
  findAll(): Docente[];
  /** Teachers of a department (ref 06 §2). */
  findByDipartimento(dipartId: DipartimentoId): Docente[];
}
