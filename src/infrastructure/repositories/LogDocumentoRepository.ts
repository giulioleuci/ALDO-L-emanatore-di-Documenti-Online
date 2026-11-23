import { LogDocumento } from '../../domain/entities/LogDocumento';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE, COL_LOG_DOCS } from '../../config/schema';

/**
 * LOG_DOCS repository on the DomainRepositoryLib Repository base (PK = Drive File
 * ID, ref 06 §17). Append-only audit trail: registraDocumento appends via the
 * table insert seam. CLASSI/UTENTI queries are CONTAINS (ref 01). cambiaStato
 * persistence (an update) and getClasse/getUtente navigation land with the
 * persistence-seam increment.
 */
export class LogDocumentoRepository
  extends Repository<LogDocumento>
  implements ILogDocumentoRepository
{
  constructor(
    database: RepositoryDatabase,
    private readonly classi: LazyRef<IClasseRepository>
  ) {
    super(database, TABLE.LOG_DOCS, LogDocumento);
    // O-1) hot-lookup index for findByStato (ref ALDO_GLF_AUDIT_RESULTS.md D-2). LOG_DOCS
    // has no Specification here (direct entity-field predicate), so this bypasses
    // Repository.find() and calls the indexed lookup seam directly, matching
    // LogEmailRepository.findByPattern's pattern.
    database.tables[TABLE.LOG_DOCS]!.createIndex(COL_LOG_DOCS.STATO);
  }

  findByClasse(classe: Classe): LogDocumento[] {
    const classIds = new Set([classe.id ?? '']);
    const parentId = this.classi.get().getClasseParent(classe)?.id;
    if (parentId !== null && parentId !== undefined) classIds.add(parentId);
    return this.findAll().filter((documento) =>
      [...classIds].some((classId) => documento.containsClasse(classId))
    );
  }

  findByUtente(email: Email): LogDocumento[] {
    return this.findAll().filter((l) => l.containsUtente(email.value));
  }
}
