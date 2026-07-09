import {
  buildAldoContainer,
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  avviaImportazioneDataDriven,
  riprendiJobSospeso
} from '../../../src/config/Bootstrap';
import { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import { EmailNotificationService } from '../../../src/application/services/EmailNotificationService';
import { EmailRetryService } from '../../../src/application/services/EmailRetryService';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import { JOB_TYPE_INVIO_EMAIL } from '../../../src/application/services/EmailBatchService';
import { JOB_TYPE_GENERAZIONE_DOCUMENTI } from '../../../src/application/services/DocumentBatchService';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';

const NOW = new Date('2026-07-01T09:00:00Z');

function container() {
  return buildAldoContainer({
    db: new FakeDatabase(fixtureTables()),
    drive: new FakeDriveFacade(),
    gmail: new FakeGmailFacade(),
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    now: NOW
  });
}

interface RunnerCall {
  jobName: string;
  jobType?: string;
  params?: Record<string, unknown>;
  registered: string[];
}

/** JobRunnerService double recording run/resume and the handlers registered by the callback. */
function fakeRunner() {
  const calls: RunnerCall[] = [];
  const capture = (cb: (queue: JobQueueLike) => void): string[] => {
    const registered: string[] = [];
    cb({ registerJobHandler: (type: string) => registered.push(type) });
    return registered;
  };
  const runner = {
    run: (jobName: string, jobType: string, params: Record<string, unknown>, cb: (q: JobQueueLike) => void) => {
      calls.push({ jobName, jobType, params, registered: capture(cb) });
      return 'started';
    },
    resume: (jobName: string, cb: (q: JobQueueLike) => void) => {
      calls.push({ jobName, registered: capture(cb) });
      return 'resumed';
    }
  } as unknown as JobRunnerService;
  return { runner, calls };
}

test('container resolves every application service as a lazy singleton (08 §2, 12 §5)', () => {
  const c = container();
  const docs = c.get<DocumentGenerationService>('documentGenerationService');
  expect(docs).toBeInstanceOf(DocumentGenerationService);
  expect(c.get('documentGenerationService')).toBe(docs); // singleton
  expect(c.get('emailNotificationService')).toBeInstanceOf(EmailNotificationService);
  expect(c.get('emailRetryService')).toBeInstanceOf(EmailRetryService);
  expect(c.has('documentBatchService')).toBe(true);
  expect(c.has('emailBatchService')).toBe(true);
});

test('the wired email service actually sends through the container graph (smoke)', () => {
  const gmail = new FakeGmailFacade();
  const c = buildAldoContainer({
    db: new FakeDatabase(fixtureTables()),
    drive: new FakeDriveFacade(),
    gmail,
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    now: NOW
  });
  const result = c.get<EmailNotificationService>('emailNotificationService').sendPattern('CDC_OTTOBRE');
  expect(result.sent).toBe(2);
  expect(gmail.sent).toHaveLength(2);
});

test('avviaGenerazioneDataDriven starts the batch job under its registered type (15 §4/§6)', () => {
  const { runner, calls } = fakeRunner();
  avviaGenerazioneDataDriven(container(), 'CD1', runner);
  expect(calls[0]).toMatchObject({ jobName: 'gen_CD1', jobType: JOB_TYPE_GENERAZIONE_DOCUMENTI, params: { confDocId: 'CD1' } });
  expect(calls[0]!.registered).toEqual([JOB_TYPE_GENERAZIONE_DOCUMENTI]);
});

test('avviaInvioNotificheDataDriven starts the email batch job (15 §4/§6)', () => {
  const { runner, calls } = fakeRunner();
  avviaInvioNotificheDataDriven(container(), 'CDC_OTTOBRE', runner);
  expect(calls[0]).toMatchObject({ jobName: 'mail_CDC_OTTOBRE', jobType: JOB_TYPE_INVIO_EMAIL, params: { patternId: 'CDC_OTTOBRE' } });
});

test('avviaImportazioneDataDriven fails typed when no ImportEngine is configured (12 §3)', () => {
  expect(() => avviaImportazioneDataDriven(container(), 'IMPORT_ALUNNI')).toThrow(ConfigurationError);
});

test('avviaImportazioneDataDriven runs the real ImportService when an ImportEngine is wired (12 §3)', () => {
  const engine = {
    _executeExtract: () => [{ A: 'a1@x.it', B: 'ROSSI' }],
    _executeTransform: (data: Record<string, unknown>[]) => data.map((r) => ({ EMAIL: r['A'], COGNOMENOME: r['B'] })),
    _executeLoad: (data: Record<string, unknown>[]) => ({ success: true, inserted: data.length, updated: 0, skipped: 0, deleted: 0, total: data.length })
  } as unknown as ImportEngine;
  const c = buildAldoContainer({
    db: new FakeDatabase(fixtureTables()),
    drive: new FakeDriveFacade(),
    gmail: new FakeGmailFacade(),
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    importEngine: engine,
    now: NOW
  });
  const result = avviaImportazioneDataDriven(c, 'IMPORT_ALUNNI');
  expect(result).toEqual({ inseriti: 1, aggiornati: 0, saltati: 0, ghost: 0, errori: [] });
});

test('riprendiJobSospeso re-registers BOTH batch registries so the library can pick by job type (15 §5)', () => {
  const { runner, calls } = fakeRunner();
  riprendiJobSospeso(container(), runner);
  expect(calls[0]!.jobName).toBe('');
  expect(calls[0]!.registered.sort()).toEqual([JOB_TYPE_GENERAZIONE_DOCUMENTI, JOB_TYPE_INVIO_EMAIL].sort());
});
