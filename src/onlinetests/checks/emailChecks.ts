import type { EmailDb, EmailNotificationService } from '../../application/services/EmailNotificationService';
import { avviaInvioNotificheDataDriven, creaJobRunner } from '../../config/Bootstrap';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_LOG_MAIL, TABLE } from '../../config/schema';
import { ValidationError } from '../../domain/errors/DomainError';
import { StatoEmail } from '../../domain/value-objects/enums';
import {
  CONF_MAIL_PIANI,
  CONF_MAIL_VERBALE,
  type SharedTestDatabase
} from '../data/SharedTestDatabaseBuilder';
import { CONF_MAIL_STORICO } from '../data/fixtures';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

const EMAIL_CHECK_PATTERNS = [CONF_MAIL_VERBALE, CONF_MAIL_PIANI, CONF_MAIL_STORICO] as const;
const SAFE_EMAIL_DOMAIN = '@onlinetest.aldo.local';
const AMPLE_EMAIL_BATCH_BUDGET_MS = 5 * 60 * 1000;

type LogMailRow = Record<string, unknown>;

interface LoggedAttachments {
  testMode?: unknown;
  logicalTargetId?: unknown;
  docs?: unknown;
  folders?: unknown;
  attach?: unknown;
}

/**
 * Exercises the real JobRunner email launcher while redirecting every actual
 * delivery to the dedicated test mailbox. Test-mode deliveries deliberately do
 * not become durable duplicate blockers, so the retry check asserts a second
 * preview is sent instead of incorrectly expecting it to be skipped.
 */
export function registerEmailChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean },
  safeEmail: string
): void {
  if (!sample.testMode) {
    runner.add(groupName('email', 'MASTER.TEST_MODE guard'), sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        'Email checks refuse to run: sample MASTER.TEST_MODE is not true (would risk sending real emails).'
      );
    });
    return;
  }
  if (!isSafeEmail(safeEmail)) {
    runner.add(groupName('email', 'safe recipient guard'), sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        `Email checks refuse recipient outside ${SAFE_EMAIL_DOMAIN}: ${safeEmail}`
      );
    });
    return;
  }

  const email = container.get<EmailNotificationService>('emailNotificationService');
  const db = container.get<EmailDb>('db');
  const runInTestMode = (patternId: string): void => {
    email.enableTestMode(safeEmail);
    try {
      avviaInvioNotificheDataDriven(
        container,
        patternId,
        creaJobRunner(),
        AMPLE_EMAIL_BATCH_BUDGET_MS
      );
    } finally {
      email.disableTestMode();
    }
  };
  const rowsFor = (patternId: string): LogMailRow[] =>
    db
      .table(TABLE.LOG_MAIL)
      .findAll()
      .filter((row) => row[COL_LOG_MAIL.PATTERN] === patternId);

  runner.add(
    groupName('email.invio', 'batch test mode + allegati LOG_MAIL'),
    sample.sampleSpreadsheetUrl,
    () => {
      for (const patternId of EMAIL_CHECK_PATTERNS) runInTestMode(patternId);

      for (const patternId of EMAIL_CHECK_PATTERNS) {
        const testRows = rowsFor(patternId).filter((row) => isTestModeRow(row));
        if (testRows.length === 0) {
          throw new ValidationError(`${patternId}: nessuna riga LOG_MAIL testMode registrata`);
        }
        assertSafeSuccessfulRows(patternId, testRows, safeEmail);
      }

      const verbaleRows = rowsFor(CONF_MAIL_VERBALE).filter((row) => isTestModeRow(row));
      if (!verbaleRows.some((row) => hasRegisteredAttachment(row))) {
        throw new ValidationError(
          'Invio verbale: LOG_MAIL.ALLEGATI non contiene docs, folders o allegati registrati'
        );
      }
    }
  );

  runner.add(
    groupName('email.sicurezza', 'mai destinatario produttivo'),
    sample.sampleSpreadsheetUrl,
    () => {
      for (const patternId of EMAIL_CHECK_PATTERNS) {
        const rows = rowsFor(patternId).filter((row) => isTestModeRow(row));
        if (rows.length === 0) {
          throw new ValidationError(`${patternId}: nessuna prova testMode da verificare`);
        }
        assertSafeSuccessfulRows(patternId, rows, safeEmail);
      }
    }
  );

  runner.add(
    groupName('email.duplicati', 'test mode non blocca il retry logico'),
    sample.sampleSpreadsheetUrl,
    () => {
      const before = testRows(rowsFor(CONF_MAIL_PIANI));
      runInTestMode(CONF_MAIL_PIANI);
      const afterFirstPreview = testRows(rowsFor(CONF_MAIL_PIANI));
      runInTestMode(CONF_MAIL_PIANI);
      const afterSecondPreview = testRows(rowsFor(CONF_MAIL_PIANI));

      if (
        afterFirstPreview.length <= before.length ||
        afterSecondPreview.length <= afterFirstPreview.length
      ) {
        throw new ValidationError(
          `Retry testMode ${CONF_MAIL_PIANI}: attese nuove preview a ogni run (${before.length} -> ${afterFirstPreview.length} -> ${afterSecondPreview.length})`
        );
      }
      assertSafeSuccessfulRows(CONF_MAIL_PIANI, afterSecondPreview, safeEmail);
    }
  );
}

function isSafeEmail(value: string): boolean {
  return value.trim().toLowerCase().endsWith(SAFE_EMAIL_DOMAIN);
}

function testRows(rows: LogMailRow[]): LogMailRow[] {
  return rows.filter((row) => isTestModeRow(row));
}

function isTestModeRow(row: LogMailRow): boolean {
  return attachmentsFor(row).testMode === true;
}

function assertSafeSuccessfulRows(patternId: string, rows: LogMailRow[], safeEmail: string): void {
  for (const row of rows) {
    const recipients = stringValue(row[COL_LOG_MAIL.DESTINATARI])
      .split(',')
      .map((recipient) => recipient.trim())
      .filter((recipient) => recipient !== '');
    const logicalTargetId = attachmentsFor(row).logicalTargetId;
    if (
      row[COL_LOG_MAIL.STATO] !== StatoEmail.SUCCESS ||
      recipients.length !== 1 ||
      recipients[0] !== safeEmail ||
      typeof logicalTargetId !== 'string' ||
      logicalTargetId.trim() === ''
    ) {
      throw new ValidationError(
        `${patternId}: LOG_MAIL testMode non sicuro o incompleto (destinatari=${recipients.join(',')})`
      );
    }
  }
}

function hasRegisteredAttachment(row: LogMailRow): boolean {
  const attachments = attachmentsFor(row);
  return [attachments.docs, attachments.folders, attachments.attach].some(
    (value) => Array.isArray(value) && value.length > 0
  );
}

function attachmentsFor(row: LogMailRow): LoggedAttachments {
  const raw = row[COL_LOG_MAIL.ALLEGATI];
  if (typeof raw !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isLoggedAttachments(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isLoggedAttachments(value: unknown): value is LoggedAttachments {
  return typeof value === 'object' && value !== null;
}
