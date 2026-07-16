import { LogCartella } from '../../domain/entities/LogCartella';
import type { ILogCartellaRepository } from '../../domain/repositories/ILogCartellaRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE, COL_LOG_FOLD } from '../../config/schema';

interface RegistraOptions {
  classe?: ClasseId;
  utente?: Email;
  materia?: MateriaId;
}

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
    database.tables[TABLE.LOG_FOLD]!.createIndex(COL_LOG_FOLD.TIPO);
  }

  findByClasse(classe: Classe): LogCartella[] {
    return this.findAll().filter((l) => l.containsClasse(classe.id ?? ''));
  }

  findByTipo(tipo: string): LogCartella[] {
    const hits = this.database.tables[TABLE.LOG_FOLD]!.indexedLookup(COL_LOG_FOLD.TIPO, tipo);
    if (hits !== null) return hits.map((row) => LogCartella.fromData(row));
    return this.findAll().filter((l) => l.tipo === tipo);
  }

  /** Appends a folder audit record (ref 06 §18). */
  registraCartella(
    driveFolderId: string,
    tipo: string,
    nome: string,
    path: string,
    link: string,
    options: RegistraOptions = {}
  ): LogCartella {
    const log = LogCartella.fromData({
      [COL_LOG_FOLD.ID]: driveFolderId,
      [COL_LOG_FOLD.TIPO]: tipo,
      [COL_LOG_FOLD.NOME]: nome,
      [COL_LOG_FOLD.PATH]: path,
      [COL_LOG_FOLD.LINK]: link,
      [COL_LOG_FOLD.CLASSI]: options.classe?.value ?? '',
      [COL_LOG_FOLD.UTENTI]: options.utente?.value ?? '',
      [COL_LOG_FOLD.MATERIA]: options.materia?.value ?? ''
    });
    this.database.tables[TABLE.LOG_FOLD]!.insertRow(log.toData());
    this.database.save();
    return log;
  }
}
