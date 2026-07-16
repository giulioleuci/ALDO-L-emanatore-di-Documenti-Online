import { LogDocumento } from '../../domain/entities/LogDocumento';
import { StatoDocumento } from '../../domain/value-objects/enums';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Email } from '../../domain/value-objects/Email';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import { TABLE, COL_LOG_DOCS } from '../../config/schema';

interface RegistraOptions {
  classe?: ClasseId;
  utente?: Email;
  materia?: MateriaId;
  sottotipo?: string;
}

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
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.LOG_DOCS, LogDocumento);
    // O-1) hot-lookup index for findByStato (ref ALDO_GLF_AUDIT_RESULTS.md D-2). LOG_DOCS
    // has no Specification here (direct entity-field predicate), so this bypasses
    // Repository.find() and calls the indexed lookup seam directly, matching
    // LogEmailRepository.findByPattern's pattern.
    database.tables[TABLE.LOG_DOCS]!.createIndex(COL_LOG_DOCS.STATO);
  }

  findByClasse(classe: Classe): LogDocumento[] {
    return this.findAll().filter((l) => l.containsClasse(classe.id ?? ''));
  }

  findByUtente(email: Email): LogDocumento[] {
    return this.findAll().filter((l) => l.containsUtente(email.value));
  }

  findByStato(stato: StatoDocumento): LogDocumento[] {
    const hits = this.database.tables[TABLE.LOG_DOCS]!.indexedLookup(COL_LOG_DOCS.STATO, stato);
    if (hits !== null) return hits.map((row) => LogDocumento.fromData(row));
    return this.findAll().filter((l) => l.getStato() === stato);
  }

  findNonNotificati(): LogDocumento[] {
    return this.findAll().filter((l) => !l.isNotificato());
  }

  /** Appends a GENERATO record with DATA_CREAZ = now (ref 06 §17). */
  registraDocumento(
    driveFileId: string,
    configId: string,
    nome: string,
    path: string,
    link: string,
    options: RegistraOptions = {}
  ): LogDocumento {
    const log = LogDocumento.fromData({
      [COL_LOG_DOCS.ID]: driveFileId,
      [COL_LOG_DOCS.ID_GEN]: configId,
      [COL_LOG_DOCS.NOME]: nome,
      [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
      [COL_LOG_DOCS.PATH]: path,
      [COL_LOG_DOCS.LINK]: link,
      [COL_LOG_DOCS.CLASSI]: options.classe?.value ?? '',
      [COL_LOG_DOCS.UTENTI]: options.utente?.value ?? '',
      [COL_LOG_DOCS.MATERIA]: options.materia?.value ?? '',
      [COL_LOG_DOCS.SOTTOTIPO]: options.sottotipo ?? '',
      [COL_LOG_DOCS.DATA_CREAZ]: new Date().toISOString()
    });
    this.database.tables[TABLE.LOG_DOCS]!.insertRow(log.toData());
    this.database.save();
    return log;
  }

  /**
   * Changes STATO and persists via the DomainRepositoryLib Repository.save()
   * update path (ref 06 §17). LOG_DOCS has a single Drive-File-ID PK and the
   * entity carries the full row, so the library's save() applies directly.
   */
  cambiaStato(logDoc: LogDocumento, nuovoStato: StatoDocumento): void {
    logDoc.cambiaStato(nuovoStato);
    this.save(logDoc);
  }

  /** Stamps NOTIFICATO and persists via Repository.save() (ref 06 §17). */
  registraNotifica(logDoc: LogDocumento): void {
    logDoc.notifica();
    this.save(logDoc);
  }
}
