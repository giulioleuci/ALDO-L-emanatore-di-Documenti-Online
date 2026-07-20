import type { Materia } from '../entities/Materia';
import type { MateriaId } from '../value-objects/MateriaId';

export interface IMateriaRepository {
  findAllCached(): Materia[];
  findByIdCached(id: MateriaId): Materia | null;
  /** Cached list of MATERIE ids (sigle), non-empty only. */
  findAllSigle(): string[];
  /** Inherited from GasLibraryFactory's ambient base `Repository<Materia>`. */
  findById(id: string): Materia | null;
}
