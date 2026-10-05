import type { LogEmail } from '../entities/LogEmail';
import type { Email } from '../value-objects/Email';
import type { StatoEmail } from '../value-objects/enums';

export interface ILogEmailRepository {
  findFailed(): LogEmail[];
  findByStato(stato: StatoEmail): LogEmail[];
  /** Every LOG_MAIL row for a pattern, across all destinatari/dates (composite-PK table, ref 06 §19). */
  findByPattern(patternId: string): LogEmail[];
  /** Flips an existing record to SUCCESS via the composite-key write seam (ref 11 §16). */
  marcaSuccesso(log: LogEmail): void;
  /** SUCCESS → BOUNCED after an NDR; ERRORE = "Bounce: <diagnostica>", meta merged into ALLEGATI. */
  marcaRimbalzo(log: LogEmail, diagnostica: string, meta: Record<string, unknown>): void;
  /** Appends a send record with DESTINATARI as CSV and DATA = now (ref 06 §19). */
  registraInvio(
    patternId: string,
    destinatari: Email[],
    stato: StatoEmail,
    corpoHtml: string,
    allegati?: Record<string, unknown>,
    errore?: string
  ): LogEmail;
}
