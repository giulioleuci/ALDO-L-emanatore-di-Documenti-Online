import { EmailRetryService } from '../../../src/application/services/EmailRetryService';
import { EmailNotificationService } from '../../../src/application/services/EmailNotificationService';
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import type { Row } from '../../../src/infrastructure/db/Database';
import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';

const NOW = new Date('2026-07-01T09:00:00Z');

function failedRow(data: string, destinatari = 'genitore1@x.it'): Row {
  return {
    PATTERN: 'CARENZE_NOTIFICA',
    DESTINATARI: destinatari,
    DATA: data,
    STATO: 'ERROR',
    ALLEGATI: null,
    ERRORE: 'quota'
  };
}

function wire(logMailRows: Row[], logger?: LoggerService) {
  const tables = fixtureTables();
  tables['LOG_MAIL'] = logMailRows;
  const db = new FakeDatabase(tables);
  const gmail = new FakeGmailFacade();
  const emailService = EmailNotificationService.create(
    db,
    gmail,
    new FakeTemplateEngine(),
    NOW,
    new FakeDriveFacade(),
    new AldoTeachingAssignmentResolver(db)
  );
  const retry = new EmailRetryService(
    new LogEmailRepository(db),
    emailService,
    gmail,
    new MasterSheetRepository(db),
    logger ? { logger } : {}
  );
  return { db, gmail, retry };
}

test('retries a failed send below maxTentativi and marks the original record SUCCESS (11 §16)', () => {
  const { db, gmail, retry } = wire([failedRow('2026-06-30T10:00:00.000Z')]);
  const result = retry.retryFailed();
  expect(result.retried).toBe(1);
  expect(result.permanent).toBe(0);
  // The resend went to the family of the carenza matching genitore1.
  expect(gmail.sent.some((s) => s.to.includes('genitore1@x.it'))).toBe(true);
  // Original ERROR record updated to SUCCESS.
  const original = db.tables['LOG_MAIL']!.getAllRows().find(
    (r) => r['DATA'] === '2026-06-30T10:00:00.000Z'
  )!;
  expect(original['STATO']).toBe('SUCCESS');
});

test('after maxTentativi failures the error is permanent and the admin is notified (11 §16)', () => {
  const rows = [
    failedRow('2026-06-28T10:00:00.000Z'),
    failedRow('2026-06-29T10:00:00.000Z'),
    failedRow('2026-06-30T10:00:00.000Z')
  ];
  const { db, gmail, retry } = wire(rows);
  const result = retry.retryFailed();
  expect(result.retried).toBe(0);
  expect(result.permanent).toBe(1);
  // Admin notification to the supervisore, no resend to the recipient.
  expect(gmail.sent).toHaveLength(1);
  expect(gmail.sent[0]!.to).toEqual(['super@school.it']);
  expect(gmail.sent[0]!.subject).toContain('permanente');
  // Original records untouched (still ERROR).
  expect(db.tables['LOG_MAIL']!.getAllRows().filter((r) => r['STATO'] === 'ERROR')).toHaveLength(3);
});

test('successful records are ignored', () => {
  const { gmail, retry } = wire([
    {
      PATTERN: 'CARENZE_NOTIFICA',
      DESTINATARI: 'x@x.it',
      DATA: '2026-06-30T10:00:00.000Z',
      STATO: 'SUCCESS',
      ALLEGATI: null,
      ERRORE: ''
    }
  ]);
  const result = retry.retryFailed();
  expect(result).toEqual({ retried: 0, permanent: 0 });
  expect(gmail.sent).toHaveLength(0);
});

test('retryFailed redacts the recipient email in the warn log on a failed re-send', () => {
  const warnMock = jest.fn();
  const logger = { warn: warnMock, error: jest.fn() } as unknown as LoggerService;
  const { gmail, retry } = wire([failedRow('2026-06-30T10:00:00.000Z')], logger);
  // Force the resend itself to fail so the retry falls into the warn branch.
  gmail.failFor.add('genitore1@x.it');
  retry.retryFailed();
  expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('[EMAIL_REDACTED]'));
  const warnCalls = warnMock.mock.calls.map((args: unknown[]) => args[0] as string);
  expect(warnCalls.some((msg) => msg.includes('@'))).toBe(false);
});

test('registraPermanente redacts the recipient email in the error log on permanent failure', () => {
  const errorMock = jest.fn();
  const logger = { warn: jest.fn(), error: errorMock } as unknown as LoggerService;
  const rows = [
    failedRow('2026-06-28T10:00:00.000Z'),
    failedRow('2026-06-29T10:00:00.000Z'),
    failedRow('2026-06-30T10:00:00.000Z')
  ];
  const { retry } = wire(rows, logger);
  retry.retryFailed();
  expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('[EMAIL_REDACTED]'));
  const errorCalls = errorMock.mock.calls.map((args: unknown[]) => args[0] as string);
  expect(errorCalls.some((msg) => msg.includes('@'))).toBe(false);
});

test('retry uses the logged logical PER_DOCENTE target when a substitute also owns a chair', () => {
  const tables = fixtureTables();
  for (const classe of tables.CLASSI!) {
    classe.ATTIVA = classe.ID === '5A';
  }
  const cinqueA = tables.CLASSI!.find((row) => row.ID === '5A')!;
  cinqueA.ITA = 'verdi@school.it';
  tables.SUPPLENZE!.push({
    TITOLARE: 'bianchi@school.it',
    SUPPLENTE: 'verdi@school.it',
    DAL: '2026-06-01',
    AL: '2026-08-31',
    CLASSI: '5A',
    MATERIE: '*'
  });
  tables.CONF_MAIL!.push({
    ID: 'DOC_RETRY',
    OGGETTO: 'Promemoria docente',
    PROCESSO: 'PER_DOCENTE',
    BOX_CFG: '[{"TIPO_BOX":"testo_dinamico","CONTENUTO":"<p>Promemoria.</p>"}]',
    TESTO: '',
    SUPPLENTI: 'SOLO_SUPPLENTI',
    NOREPLY: false,
    COLORE_HEADER: '',
    CONDIZIONE: null,
    POST_PROCESSO: null,
    ALLEGATI: '[]'
  });
  tables.LOG_MAIL = [
    {
      PATTERN: 'DOC_RETRY',
      DESTINATARI: 'verdi@school.it',
      DATA: '2026-06-30T10:00:00.000Z',
      STATO: 'ERROR',
      ALLEGATI: JSON.stringify({
        logicalTargetId: 'docente:bianchi@school.it'
      }),
      ERRORE: 'quota'
    }
  ];
  const db = new FakeDatabase(tables);
  const gmail = new FakeGmailFacade();
  const emailService = EmailNotificationService.create(
    db,
    gmail,
    new FakeTemplateEngine(),
    NOW,
    new FakeDriveFacade(),
    new AldoTeachingAssignmentResolver(db)
  );
  const retry = new EmailRetryService(
    new LogEmailRepository(db),
    emailService,
    gmail,
    new MasterSheetRepository(db)
  );

  const result = retry.retryFailed();

  expect(result).toEqual({ retried: 1, permanent: 0 });
  expect(gmail.sent).toHaveLength(1);
  expect(gmail.sent[0]!.to).toEqual(['verdi@school.it']);
  expect(gmail.sent[0]!.htmlBody).toContain('BIANCHI LUCIA');
  expect(gmail.sent[0]!.htmlBody).not.toContain('VERDI GIO');
});
