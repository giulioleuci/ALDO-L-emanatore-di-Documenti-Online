import type { Docente } from '../entities/Docente';

export interface IDocenteRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<Docente>`. */
  findById(id: string): Docente | null;
  /** Inherited from GasLibraryFactory's ambient base `Repository<Docente>`. */
  findAll(): Docente[];
}
