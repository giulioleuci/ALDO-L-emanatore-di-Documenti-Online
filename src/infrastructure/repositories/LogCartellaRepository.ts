import { LogCartella } from '../../domain/entities/LogCartella';
import type { ILogCartellaRepository } from '../../domain/repositories/ILogCartellaRepository';
import type { Classe } from '../../domain/entities/Classe';
import { TABLE, COL_LOG_FOLD } from '../../config/schema';

/**
 * LOG_FOLD repository on the DomainRepositoryLib Repository base (PK = Drive
 * Folder ID, ref 06 §18). Append-only audit trail; CLASSI query is CONTAINS.
 */
export class LogCartellaRepository
  extends Repository<LogCartella>
  implements ILogCartellaRepository
{
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.LOG_FOLD, LogCartella);
    // O(1) hot-lookup index for findByTipo (ref ALDO_GLF_AUDIT_RESULTS.md D-3), matching
    // LogEmailRepository.findByPattern's pattern.
    database.tables[TABLE.LOG_FOLD]!.createIndex(COL_LOG_FOLD.ID_GEN);
  }

  findByClasse(classe: Classe): LogCartella[] {
    return this.findAll().filter((l) => l.containsClasse(classe.id ?? ''));
  }
}
