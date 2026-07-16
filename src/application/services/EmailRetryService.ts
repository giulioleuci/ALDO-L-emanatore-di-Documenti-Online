import type { LogEmailRepository } from '../../infrastructure/repositories/LogEmailRepository';
import type { MasterSheetRepository } from '../../infrastructure/repositories/MasterSheetRepository';
import type { IGmailFacade } from '../../infrastructure/facades/GmailServiceFacade';
import type { LogEmail } from '../../domain/entities/LogEmail';
import type { EmailNotificationService } from './EmailNotificationService';
import { escapeHtml } from '../email/boxes';

export interface EmailRetryOptions {
  /** Give up after this many failed attempts for the same (PATTERN, DESTINATARI) (default 3, 11 §16). */
  maxTentativi?: number;
  logger?: LoggerService;
}

export interface RetryResult {
  retried: number;
  permanent: number;
}

/**
 * Retry of failed sends (11 §16): scans LOG_MAIL for STATO = ERROR, groups by
 * (PATTERN, DESTINATARI) — each ERROR record counts as one past attempt — and
 * re-runs the pattern restricted to those recipients. A successful re-send
 * updates the original records to SUCCESS; once maxTentativi is reached the
 * failure is permanent and the supervisore is notified.
 */
export class EmailRetryService {
  private readonly maxTentativi: number;
  private readonly logger: LoggerService;

  constructor(
    private readonly logMail: LogEmailRepository,
    private readonly emailService: EmailNotificationService,
    private readonly gmail: IGmailFacade,
    private readonly master: MasterSheetRepository,
    options: EmailRetryOptions = {}
  ) {
    this.maxTentativi = options.maxTentativi ?? 3;
    this.logger = options.logger ?? new LoggerService();
  }

  retryFailed(): RetryResult {
    const groups = new Map<string, LogEmail[]>();
    for (const failed of this.logMail.findFailed()) {
      const key = `${failed.pattern}::${failed.destinatariRaw}`;
      const group = groups.get(key) ?? [];
      group.push(failed);
      groups.set(key, group);
    }

    const result: RetryResult = { retried: 0, permanent: 0 };
    for (const group of groups.values()) {
      const first = group[0]!;
      if (group.length >= this.maxTentativi) {
        this.registraPermanente(first, group.length);
        result.permanent += 1;
        continue;
      }
      const run = this.emailService.sendPattern(first.pattern, {
        onlyRecipients: first.getDestinatari()
      });
      if (run.sent > 0 && run.errors.length === 0) {
        for (const record of group) this.logMail.marcaSuccesso(record);
        result.retried += 1;
      } else {
        this.logger.warn(
          PiiRedactor.redact(
            `EmailRetry: nuovo tentativo fallito per ${first.pattern} → ${first.destinatariRaw} (${run.errors.join('; ')})`
          )
        );
      }
    }
    return result;
  }

  /** Permanent failure: log as error and notify the supervisore (11 §16). */
  private registraPermanente(record: LogEmail, tentativi: number): void {
    const msg =
      `Invio email permanentemente fallito dopo ${tentativi} tentativi: ` +
      `pattern ${record.pattern}, destinatari ${record.destinatariRaw} (${record.errore})`;
    this.logger.error(`EmailRetry: ${PiiRedactor.redact(msg)}`);
    const config = this.master.findConfigAnnoCorrente();
    if (!config.hasSupervisore()) {
      this.logger.warn('EmailRetry: SUPERVISORE_EMAIL assente — nessuna notifica admin inviata');
      return;
    }
    this.gmail.sendEmail({
      to: [config.supervisoreEmail],
      subject: `[SGSA] Errore permanente invio email — pattern ${record.pattern}`,
      // msg embeds LOG_MAIL free text (ERRORE) — escaped before HTML interpolation.
      htmlBody: `<p>${escapeHtml(msg)}</p>`
    });
  }
}
