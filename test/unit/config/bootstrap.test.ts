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
import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { ReportService } from '../../../src/application/services/ReportService';
import { AggregatoreDati } from '../../../src/application/services/AggregatoreDati';
import { AlberoCartelle } from '../../../src/infrastructure/services/AlberoCartelle';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import { JOB_TYPE_INVIO_EMAIL } from '../../../src/application/services/EmailBatchService';
import { DocumentBatchService, JOB_TYPE_GENERAZIONE_DOCUMENTI } from '../../../src/application/services/DocumentBatchService';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { FakeProcessMonitor } from '../../../test/fakes/FakeProcessMonitor';

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
  expect(c.get('risolutoreRuoli')).toBeInstanceOf(RisolutoreRuoliService);
  expect(c.get('reportService')).toBeInstanceOf(ReportService);
  expect(c.get('aggregatoreDati')).toBeInstanceOf(AggregatoreDati);
  expect(c.get('alberoCartelle')).toBeInstanceOf(AlberoCartelle);
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
    runImport: (
      recipe: ImportRecipe,
      options: { postTransform?: (data: Record<string, unknown>[], config: ImportConfiguration) => Record<string, unknown>[] } = {}
    ) => {
      const extracted = [{ A: 'a1@x.it', B: 'ROSSI' }];
      let mapped: Record<string, unknown>[] = extracted.map((r) => ({ EMAIL: r['A'], COGNOMENOME: r['B'] }));
      const configuration = { getLoad: () => recipe.load } as unknown as ImportConfiguration;
      if (options.postTransform) mapped = options.postTransform(mapped, configuration);
      const loadResult = { success: true, inserted: mapped.length, updated: 0, skipped: 0, deleted: 0, total: mapped.length };
      return {
        success: true,
        importName: recipe.name,
        durationMs: 0,
        extract: { rowsExtracted: extracted.length, rowCount: extracted.length },
        transform: { rowsTransformed: mapped.length, recordsProcessed: mapped.length },
        load: { ...loadResult, recordsProcessed: loadResult.total, failed: 0 }
      };
    }
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

describe('buildAldoContainer — optional generator strategies', () => {
  function baseDeps() {
    return {
      db: new FakeDatabase(fixtureTables()),
      drive: new FakeDriveFacade(),
      gmail: new FakeGmailFacade(),
      templates: new FakeTemplateEngine(),
      expressionEngine: new ExpressionEngineFacade(),
      now: NOW
    };
  }

  test('does not register SHEET_CON_MATERIE/SHEET_CON_MATERIE_E_PERMESSI/DOCUMENTO_CON_TABELLE_IMPORTATE when deps.spreadsheets is undefined', () => {
    const c = buildAldoContainer(baseDeps());
    const registry = c.get<Map<string, unknown>>('strategyRegistry');
    expect(registry.has('SHEET_CON_MATERIE')).toBe(false);
    expect(registry.has('SHEET_CON_MATERIE_E_PERMESSI')).toBe(false);
    expect(registry.has('DOCUMENTO_CON_TABELLE_IMPORTATE')).toBe(false);
  });

  test('registers SHEET_CON_MATERIE and SHEET_CON_MATERIE_E_PERMESSI when deps.spreadsheets is provided, but not DOCUMENTO_CON_TABELLE_IMPORTATE without deps.documents', () => {
    const c = buildAldoContainer({ ...baseDeps(), spreadsheets: {} as never });
    const registry = c.get<Map<string, unknown>>('strategyRegistry');
    expect(registry.has('SHEET_CON_MATERIE')).toBe(true);
    expect(registry.has('SHEET_CON_MATERIE_E_PERMESSI')).toBe(true);
    expect(registry.has('DOCUMENTO_CON_TABELLE_IMPORTATE')).toBe(false);
  });

  test('registers DOCUMENTO_CON_TABELLE_IMPORTATE when both deps.spreadsheets and deps.documents are provided', () => {
    const c = buildAldoContainer({ ...baseDeps(), spreadsheets: {} as never, documents: {} as never });
    const registry = c.get<Map<string, unknown>>('strategyRegistry');
    expect(registry.has('DOCUMENTO_CON_TABELLE_IMPORTATE')).toBe(true);
  });
});

test('deps.monitor flows through to both batch services (15 §9)', () => {
  const monitor = new FakeProcessMonitor();
  const c = buildAldoContainer({
    db: new FakeDatabase(fixtureTables()),
    drive: new FakeDriveFacade(),
    gmail: new FakeGmailFacade(),
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    monitor,
    now: NOW
  });
  const docBatch = c.get<DocumentBatchService>('documentBatchService');
  const gen = docBatch.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_gen_CD1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual(['job_gen_CD1']);
});
