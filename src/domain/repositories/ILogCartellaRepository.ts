import type { LogCartella } from '../entities/LogCartella';
import type { Classe } from '../entities/Classe';

export interface ILogCartellaRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<LogCartella>`. */
  findAll(): LogCartella[];
  findByClasse(classe: Classe): LogCartella[];
}
