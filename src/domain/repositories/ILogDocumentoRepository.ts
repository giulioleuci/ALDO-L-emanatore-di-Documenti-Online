import type { LogDocumento } from '../entities/LogDocumento';
import type { Classe } from '../entities/Classe';
import type { Email } from '../value-objects/Email';

export interface ILogDocumentoRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<LogDocumento>`. */
  findAll(): LogDocumento[];
  findByClasse(classe: Classe): LogDocumento[];
  findByUtente(email: Email): LogDocumento[];
}
