import { LogEmail } from '../../domain/entities/LogEmail';
import { StatoEmail } from '../../domain/value-objects/enums';
import type { ILogEmailRepository } from '../../domain/repositories/ILogEmailRepository';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE, COL_LOG_MAIL } from '../../config/schema';

/**
 * LOG_MAIL repository on the DomainRepositoryLib Repository base. Composite PK
 * (PATTERN, DESTINATARI, DATA) — direct PK lookup does not apply (ref 06 §19);
 * queries load rows and filter in memory. Append-only audit trail.
 */
export class LogEmailRepository extends Repository<LogEmail> implements ILogEmailRepository {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.LOG_MAIL, LogEmail);
    // O(1) hot-lookup index for findByPattern (ref REPORT_GLF.md A2). LOG_MAIL
    // has no Specification here (direct entity-field predicate), so this
    // bypasses Repository.find() and calls the indexed lookup seam directly.
    database.tables[TABLE.LOG_MAIL]!.createIndex(COL_LOG_MAIL.PATTERN);
  }

  findByPattern(patternId: string): LogEmail[] {
    const hits = this.database.tables[TABLE.LOG_MAIL]!.indexedLookup(
      COL_LOG_MAIL.PATTERN,
      patternId
    );
    if (hits !== null) return hits.map((row) => LogEmail.fromData(row));
    return this.findAll().filter((l) => l.pattern === patternId);
  }

  findByStato(stato: StatoEmail): LogEmail[] {
    return this.findAll().filter((l) => l.stato === stato);
  }

  findFailed(): LogEmail[] {
    return this.findByStato(StatoEmail.ERROR);
  }

  /** Flips an existing record to SUCCESS via the composite-key write seam (ref 11 §16). */
  marcaSuccesso(log: LogEmail): void {
    this.database.tables[TABLE.LOG_MAIL]!.updateRowWhere(
      {
        [COL_LOG_MAIL.PATTERN]: log.pattern,
        [COL_LOG_MAIL.DESTINATARI]: log.destinatariRaw,
        [COL_LOG_MAIL.DATA]: log.data
      },
      { ...log.toData(), [COL_LOG_MAIL.STATO]: StatoEmail.SUCCESS }
    );
    this.database.save();
  }

  marcaRimbalzo(log: LogEmail, diagnostica: string, meta: Record<string, unknown>): void {
    this.database.tables[TABLE.LOG_MAIL]!.updateRowWhere(
      {
        [COL_LOG_MAIL.PATTERN]: log.pattern,
        [COL_LOG_MAIL.DESTINATARI]: log.destinatariRaw,
        [COL_LOG_MAIL.DATA]: log.data
      },
      {
        ...log.toData(),
        [COL_LOG_MAIL.STATO]: StatoEmail.BOUNCED,
        [COL_LOG_MAIL.ERRORE]: `Bounce: ${diagnostica}`,
        [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ ...log.getAllegati(), ...meta })
      }
    );
    this.database.save();
  }

  /** Appends a send record with DESTINATARI as CSV and DATA = now (ref 06 §19). TESTO is
   * HtmlSanitizer.stripToPlainText(corpoHtml) — plain text, ≤2000 chars, single-cell-safe (item 5). */
  registraInvio(
    patternId: string,
    destinatari: Email[],
    stato: StatoEmail,
    corpoHtml: string,
    allegati?: Record<string, unknown>,
    errore?: string
  ): LogEmail {
    const log = LogEmail.fromData({
      [COL_LOG_MAIL.PATTERN]: patternId,
      [COL_LOG_MAIL.DESTINATARI]: destinatari.map((e) => e.value).join(','),
      [COL_LOG_MAIL.DATA]: new Date().toISOString(),
      [COL_LOG_MAIL.STATO]: stato,
      [COL_LOG_MAIL.ALLEGATI]: allegati === undefined ? null : JSON.stringify(allegati),
      [COL_LOG_MAIL.ERRORE]: errore ?? '',
      [COL_LOG_MAIL.TESTO]: HtmlSanitizer.stripToPlainText(corpoHtml)
    });
    this.database.tables[TABLE.LOG_MAIL]!.insertRow(log.toData());
    this.database.save();
    return log;
  }
}
