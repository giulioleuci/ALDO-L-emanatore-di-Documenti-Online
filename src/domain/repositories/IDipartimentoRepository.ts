import type { Dipartimento } from '../entities/Dipartimento';
import type { MateriaId } from '../value-objects/MateriaId';

export interface IDipartimentoRepository {
  /** The department whose MATERIE list contains `materiaId`, or null. */
  findByMateria(materiaId: MateriaId): Dipartimento | null;
  /** Inherited from GasLibraryFactory's ambient base `Repository<Dipartimento>`. */
  findAll(): Dipartimento[];
}
