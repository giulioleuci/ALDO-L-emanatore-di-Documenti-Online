import { EmailRetryService, JOB_TYPE_RETRY_EMAIL } from '../../../src/application/services/EmailRetryService';
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import type { Row } from '../../../src/infrastructure/db/Database';
import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { composeEmailNotificationService } from '../../../src/config/ApplicationComposition';

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
  const emailService = composeEmailNotificationService(
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
  const emailService = composeEmailNotificationService(
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

test('retryHandler yields one checkpoint per failed-group batch and resumes from checkpoint', () => {
  // Two distinct destinatari -> two distinct groups (grouped by pattern::logicalTargetId/destinatariRaw),
  // so the generator must yield twice, once per group, before completing.
  const { retry } = wire([
    failedRow('2026-06-30T10:00:00.000Z', 'genitore1@x.it'),
    failedRow('2026-06-29T10:00:00.000Z', 'genitore2@x.it')
  ]);
  const gen = retry.retryHandler({ resumeState: null, jobId: 'job_retry_1' });
  const first = gen.next();
  expect(first.done).toBe(false);
  expect(first.value).toMatchObject({ groupIndex: 1, totalGroups: 2, percentage: 50 });
  let step = first;
  while (!step.done) step = gen.next();
  // Both single-email groups succeed against the fake Gmail facade (no failFor entries),
  // so exactly 2 retried and 0 permanent — not just "some work happened".
  expect(step.value.retried).toBe(2);
  expect(step.value.permanent).toBe(0);
  expect(step.value.retried + step.value.permanent).toBe(2);
});

/**
 * Reproduces the resume bug found in review: `groupFailed()` is recomputed
 * fresh from LOG_MAIL's STATO=ERROR rows on every `retryHandler` invocation.
 * When a group succeeds, `processGroup()` flips its rows out of ERROR via
 * `marcaSuccesso()` — so the failed-group array on a real second invocation
 * (a JobRunnerLib resume, a brand-new generator instance seeded only from the
 * persisted checkpoint) is shorter than the one the first invocation yielded
 * checkpoints against. A resume anchored on a raw positional index
 * (`groupIndex`) would then skip whatever shifted into that index — the job
 * could report "done" without ever having retried every failed group. The
 * fix anchors resume on `processedKeys` (stable per-group identity) instead.
 */
test('retryHandler resume is correct across two separate generator instances (does not skip unretried groups)', () => {
  const { db, retry } = wire([
    failedRow('2026-06-30T10:00:00.000Z', 'genitore1@x.it'),
    failedRow('2026-06-29T10:00:00.000Z', 'genitore2@x.it')
  ]);

  // First execution: simulate a mid-run suspend by draining only the first yield,
  // never letting this generator instance run to completion.
  const gen1 = retry.retryHandler({ resumeState: null, jobId: 'job_retry_1' });
  const first = gen1.next();
  expect(first.done).toBe(false);
  const resumeState = first.value;
  expect(resumeState.processedKeys).toHaveLength(1);

  // The processed group's LOG_MAIL rows flipped out of ERROR — this is exactly what
  // shrinks groupFailed()'s output on the next invocation and is what an index-based
  // resume anchor gets wrong.
  const remainingErrorsAfterFirstYield = db.tables['LOG_MAIL']!.getAllRows().filter(
    (r) => r['STATO'] === 'ERROR'
  );
  expect(remainingErrorsAfterFirstYield).toHaveLength(1);

  // Second execution: a real JobRunnerLib resume — a brand-new generator instance,
  // seeded only with the checkpoint state (as JobRunnerLib replays it from ScriptProperties),
  // with no memory of the first generator's local variables.
  const gen2 = retry.retryHandler({ resumeState, jobId: 'job_retry_1' });
  let step = gen2.next();
  while (!step.done) step = gen2.next();

  // Both originally-failed groups must be accounted for across the two invocations
  // combined — exactly 2, not merely "> 0" — proving the second (still-pending) group
  // was not skipped by the resume.
  expect(step.value.retried).toBe(2);
  expect(step.value.permanent).toBe(0);
  expect(step.value.retried + step.value.permanent).toBe(2);
  expect(db.tables['LOG_MAIL']!.getAllRows().filter((r) => r['STATO'] === 'ERROR')).toHaveLength(0);
});

/**
 * Deferred finding fix: `RetryCheckpoint` previously had no `percentage` field,
 * so JobRunnerLib's `monitor.updateProgress` had nothing to read and the retry
 * job reported 0% for its entire duration (unlike `EmailBatchCheckpoint`, which
 * always had one). Pins the percentage at each of three checkpoints across a
 * multi-group run, not just the last one.
 */
test('retryHandler checkpoint percentage reflects processed groups out of total across a multi-group run', () => {
  const { retry } = wire([
    failedRow('2026-06-28T10:00:00.000Z', 'genitore1@x.it'),
    failedRow('2026-06-29T10:00:00.000Z', 'genitore2@x.it'),
    failedRow('2026-06-30T10:00:00.000Z', 'genitore3@x.it')
  ]);
  const gen = retry.retryHandler({ resumeState: null, jobId: 'job_retry_pct' });

  const first = gen.next();
  expect(first.done).toBe(false);
  expect(first.value.percentage).toBeCloseTo((1 / 3) * 100);

  const second = gen.next();
  expect(second.done).toBe(false);
  expect(second.value.percentage).toBeCloseTo((2 / 3) * 100);

  const third = gen.next();
  expect(third.done).toBe(false);
  expect(third.value.percentage).toBeCloseTo(100);

  const fourth = gen.next();
  expect(fourth.done).toBe(true);
});

test('registerJobHandlers registers under JOB_TYPE_RETRY_EMAIL', () => {
  // wire()'s first param (LOG_MAIL rows) is required by the existing helper —
  // pass an empty array since registration doesn't touch groupFailed()/LOG_MAIL at all;
  // assert that explicitly rather than relying on a comment.
  const { db, retry } = wire([]);
  const registered: string[] = [];
  const queue = {
    registerJobHandler: (type: string) => registered.push(type)
  } as unknown as JobQueueLike;
  retry.registerJobHandlers(queue);
  expect(registered).toEqual([JOB_TYPE_RETRY_EMAIL]);
  // registerJobHandlers only wires the callback into the queue — it must not itself
  // touch LOG_MAIL, so an empty fixture is provably safe, not just "probably fine".
  expect(db.tables['LOG_MAIL']!.getAllRows()).toHaveLength(0);
});
