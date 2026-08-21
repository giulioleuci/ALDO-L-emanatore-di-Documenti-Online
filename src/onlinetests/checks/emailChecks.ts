import type { EmailDb } from '../../application/services/EmailNotificationService';
import { avviaInvioNotificheDataDriven, creaJobRunner } from '../../config/Bootstrap';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_LOG_DOCS, COL_LOG_FOLD, COL_LOG_MAIL, TABLE } from '../../config/schema';
import { ValidationError } from '../../domain/errors/DomainError';
import { StatoEmail } from '../../domain/value-objects/enums';
import {
  CONF_MAIL_PIANI,
  CONF_MAIL_VERBALE,
  CONF_DOC_VERBALE,
  type SharedTestDatabase
} from '../data/SharedTestDatabaseBuilder';
import { CONF_MAIL_STORICO } from '../data/fixtures';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

const EMAIL_CHECK_PATTERNS = [CONF_MAIL_VERBALE, CONF_MAIL_PIANI, CONF_MAIL_STORICO] as const;
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
  const db = container.get<EmailDb>('db');
  const runInTestMode = (patternId: string): void => {
    avviaInvioNotificheDataDriven(
      container,
      patternId,
      creaJobRunner(),
      AMPLE_EMAIL_BATCH_BUDGET_MS,
      safeEmail
    );
  };
  const rowsFor = (patternId: string): LogMailRow[] =>
    db
      .table(TABLE.LOG_MAIL)
      .findAll()
      .filter((row) => row[COL_LOG_MAIL.PATTERN] === patternId);

  runner.add(
    groupName('email.prerequisiti', 'documenti di batch 1 presenti'),
    sample.sampleSpreadsheetUrl,
    () => {
      const verbali = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_VERBALE);
      if (verbali.length === 0) {
        throw new ValidationError(
          'Batch 1 non eseguito su questa fixture: LOG_DOCS non contiene documenti ' +
            `${CONF_DOC_VERBALE}, quindi il box "documenti" di ogni CONF_MAIL resta vuoto e ` +
            'ogni invio viene saltato. Esegui resetE2eHistoryTables PRIMA di batch 1, poi ' +
            'batch 1, poi batch 2.'
        );
      }
    }
  );

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
      assertVerbaleArtifacts(
        verbaleRows,
        db.table(TABLE.LOG_DOCS).findAll(),
        db.table(TABLE.LOG_FOLD).findAll()
      );
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

function assertVerbaleArtifacts(
  rows: LogMailRow[],
  documents: LogMailRow[],
  folders: LogMailRow[]
): void {
  for (const row of rows) {
    const attachments = attachmentsFor(row);
    if (
      !isNonEmptyStringList(attachments.docs) ||
      !isNonEmptyStringList(attachments.folders) ||
      !isEmptyStringList(attachments.attach) ||
      !attachments.docs.every((id) => isPersistedVerbale(id, documents)) ||
      !attachments.folders.every((id) => isPersistedFolder(id, folders))
    ) {
      throw new ValidationError(
        'Invio verbale: gli artefatti LOG_MAIL non corrispondono ai VERBALE/LOG_FOLD persistiti'
      );
    }
  }
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

function isNonEmptyStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim() !== '')
  );
}

function isEmptyStringList(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function isPersistedVerbale(id: string, documents: LogMailRow[]): boolean {
  return documents.some(
    (document) =>
      document[COL_LOG_DOCS.ID] === id &&
      document[COL_LOG_DOCS.ID_GEN] === CONF_DOC_VERBALE &&
      document[COL_LOG_DOCS.TIPO] === 'VERBALE' &&
      stringValue(document[COL_LOG_DOCS.LINK]).trim() !== ''
  );
}

function isPersistedFolder(id: string, folders: LogMailRow[]): boolean {
  return folders.some(
    (folder) =>
      folder[COL_LOG_FOLD.ID] === id && stringValue(folder[COL_LOG_FOLD.LINK]).trim() !== ''
  );
}
