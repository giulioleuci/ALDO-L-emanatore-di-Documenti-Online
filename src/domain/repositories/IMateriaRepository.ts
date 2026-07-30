import type { Materia } from '../entities/Materia';
import type { MateriaId } from '../value-objects/MateriaId';

export interface IMateriaRepository {
  findAllCached(): Materia[];
  findByIdCached(id: MateriaId): Materia | null;
  /** Cached list of MATERIE ids (sigle), non-empty only. */
  findAllSigle(): string[];
  /** MATERIE rows whose ID is `materia.value + '.' + <specifica>` (design 2026-07-30). */
  findSpecifiche(materia: MateriaId): Materia[];
  /** Inherited from GasLibraryFactory's ambient base `Repository<Materia>`. */
  findById(id: string): Materia | null;
}
