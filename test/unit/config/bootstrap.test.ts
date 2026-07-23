import {
  buildAldoContainer,
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  avviaImportazioneDataDriven,
  riprendiJobSospeso,
  initAldo,
  resetAldo,
  creaJobRunner,
  PROP_MASTER_SPREADSHEET_ID
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
import {
  DocumentBatchService,
  JOB_TYPE_GENERAZIONE_DOCUMENTI
} from '../../../src/application/services/DocumentBatchService';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { FakeProcessMonitor } from '../../../test/fakes/FakeProcessMonitor';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { DriveServiceFacade } from '../../../src/infrastructure/facades/DriveServiceFacade';

const NOW = new Date('2026-07-01T09:00:00Z');
const fakeLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function container() {
  const db = new FakeDatabase(fixtureTables());
  return buildAldoContainer({
    db,
    master: new MasterSheetRepository(db),
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
    run: (
      jobName: string,
      jobType: string,
      params: Record<string, unknown>,
      cb: (q: JobQueueLike) => void
    ) => {
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
  const registry = c.get<Map<string, unknown>>('strategyRegistry');
  expect(registry.has('FOGLIO_GENERICO')).toBe(true);
});

test('the wired email service actually sends through the container graph (smoke)', () => {
  const gmail = new FakeGmailFacade();
  const db = new FakeDatabase(fixtureTables());
  const c = buildAldoContainer({
    db,
    master: new MasterSheetRepository(db),
    drive: new FakeDriveFacade(),
    gmail,
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    now: NOW
  });
  const result = c
    .get<EmailNotificationService>('emailNotificationService')
    .sendPattern('CDC_OTTOBRE');
  expect(result.sent).toBe(2);
  expect(gmail.sent).toHaveLength(2);
});

test('avviaGenerazioneDataDriven starts the batch job under its registered type (15 §4/§6)', () => {
  const { runner, calls } = fakeRunner();
  avviaGenerazioneDataDriven(container(), 'CD1', runner);
  expect(calls[0]).toMatchObject({
    jobName: 'gen_CD1',
    jobType: JOB_TYPE_GENERAZIONE_DOCUMENTI,
    params: { confDocId: 'CD1' }
  });
  expect(calls[0]!.registered).toEqual([JOB_TYPE_GENERAZIONE_DOCUMENTI]);
});

test('avviaInvioNotificheDataDriven starts the email batch job (15 §4/§6)', () => {
  const { runner, calls } = fakeRunner();
  avviaInvioNotificheDataDriven(container(), 'CDC_OTTOBRE', runner);
  expect(calls[0]).toMatchObject({
    jobName: 'mail_CDC_OTTOBRE',
    jobType: JOB_TYPE_INVIO_EMAIL,
    params: { patternId: 'CDC_OTTOBRE' }
  });
});

test('avviaImportazioneDataDriven fails typed when no ImportEngine is configured (12 §3)', () => {
  expect(() => avviaImportazioneDataDriven(container(), 'IMPORT_ALUNNI')).toThrow(
    ConfigurationError
  );
});

test('avviaImportazioneDataDriven runs the real ImportService when an ImportEngine is wired (12 §3)', () => {
  const engine = {
    runImport: (
      recipe: ImportRecipe,
      options: {
        postTransform?: (
          data: Record<string, unknown>[],
          config: ImportConfiguration
        ) => Record<string, unknown>[];
      } = {}
    ) => {
      const extracted = [{ A: 'a1@x.it', B: 'ROSSI' }];
      let mapped: Record<string, unknown>[] = extracted.map((r) => ({
        EMAIL: r['A'],
        COGNOMENOME: r['B']
      }));
      const configuration = { getLoad: () => recipe.load } as unknown as ImportConfiguration;
      if (options.postTransform) mapped = options.postTransform(mapped, configuration);
      const loadResult = {
        success: true,
        inserted: mapped.length,
        updated: 0,
        skipped: 0,
        deleted: 0,
        total: mapped.length
      };
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
  const db = new FakeDatabase(fixtureTables());
  const c = buildAldoContainer({
    db,
    master: new MasterSheetRepository(db),
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
  expect(calls[0]!.registered.sort()).toEqual(
    [JOB_TYPE_GENERAZIONE_DOCUMENTI, JOB_TYPE_INVIO_EMAIL].sort()
  );
});

describe('buildAldoContainer — optional generator strategies', () => {
  function baseDeps() {
    const db = new FakeDatabase(fixtureTables());
    return {
      db,
      master: new MasterSheetRepository(db),
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
    const c = buildAldoContainer({
      ...baseDeps(),
      spreadsheets: {} as never,
      documents: {} as never
    });
    const registry = c.get<Map<string, unknown>>('strategyRegistry');
    expect(registry.has('DOCUMENTO_CON_TABELLE_IMPORTATE')).toBe(true);
  });
});

describe('initAldo — singleton reuse + missing master id', () => {
  function fakeTable() {
    return {
      getAllRows: jest.fn().mockReturnValue([]),
      getByPK: jest.fn().mockReturnValue(null),
      insertRow: jest.fn((row: unknown) => row),
      updateRowById: jest.fn(),
      defineVirtualColumn: jest.fn(),
      setPrimaryKey: jest.fn(),
      createIndex: jest.fn(),
      _indexedLookup: jest.fn().mockReturnValue(null)
    };
  }

  function mockDatabaseServiceGlobal() {
    const original = (global as unknown as { DatabaseService: unknown }).DatabaseService;
    const fakeDb = {
      tables: new Proxy({}, { get: () => fakeTable() }),
      save: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn()
    };
    (global as unknown as { DatabaseService: unknown }).DatabaseService = jest
      .fn()
      .mockImplementation(() => fakeDb);
    return () => {
      (global as unknown as { DatabaseService: unknown }).DatabaseService = original;
    };
  }

  function mockServiceFactory() {
    const spies = [
      jest.spyOn(ServiceFactory, 'getLogger').mockReturnValue(fakeLogger as never),
      jest.spyOn(ServiceFactory, 'getDriveService').mockReturnValue({} as never),
      jest.spyOn(ServiceFactory, 'getSpreadsheetService').mockReturnValue({} as never),
      jest.spyOn(ServiceFactory, 'getDocumentService').mockReturnValue({} as never),
      jest.spyOn(ServiceFactory, 'getPermissionService').mockReturnValue({} as never),
      jest.spyOn(ServiceFactory, 'getMailService').mockReturnValue({} as never),
      jest.spyOn(ServiceFactory, 'getCacheService').mockReturnValue({
        getScriptCache: () => ({ get: jest.fn(), put: jest.fn(), remove: jest.fn() })
      } as never),
      jest.spyOn(ServiceFactory, 'getPropertiesService').mockReturnValue({} as never)
    ];
    return () => spies.forEach((s) => s.mockRestore());
  }

  afterEach(() => {
    resetAldo();
  });

  test('returns the same ServiceContainer instance on a second call (singleton)', () => {
    const restoreDb = mockDatabaseServiceGlobal();
    const restoreFactory = mockServiceFactory();
    const fakeMaster = { idSpreadsheet: 'ss1', idCartellaRoot: 'root1' } as never;
    const findConfigSpy = jest
      .spyOn(MasterSheetRepository.prototype, 'findConfigAnnoCorrente')
      .mockReturnValue(fakeMaster);
    try {
      const props = { get: jest.fn().mockReturnValue('SPREADSHEET_ID_1'), set: jest.fn() };
      const first = initAldo(new Date('2026-01-01'), props);
      const second = initAldo(new Date('2026-06-01'), props);
      expect(second).toBe(first);
      // rebuild happened exactly once even though initAldo was called twice
      expect(findConfigSpy).toHaveBeenCalledTimes(1);
    } finally {
      findConfigSpy.mockRestore();
      restoreFactory();
      restoreDb();
    }
  });

  test.each([null, '', '   '])(
    'throws ConfigurationError when the master id property is %p',
    (value) => {
      resetAldo();
      const props = { get: jest.fn().mockReturnValue(value), set: jest.fn() };
      expect(() => initAldo(new Date(), props as never)).toThrow(ConfigurationError);
      expect(() => initAldo(new Date(), props as never)).toThrow(
        new RegExp(`${PROP_MASTER_SPREADSHEET_ID} mancante`)
      );
    }
  );

  test('enables EmailNotificationService test mode with the MASTER file owner email when annoCorrente.testMode is true', () => {
    const restoreDb = mockDatabaseServiceGlobal();
    const restoreFactory = mockServiceFactory();
    const fakeMaster = {
      idSpreadsheet: 'ss1',
      idCartellaRoot: 'root1',
      testMode: true
    } as never;
    const findConfigSpy = jest
      .spyOn(MasterSheetRepository.prototype, 'findConfigAnnoCorrente')
      .mockReturnValue(fakeMaster);
    const ownerSpy = jest
      .spyOn(DriveServiceFacade.prototype, 'getFileOwnerEmail')
      .mockReturnValue('owner@school.it');
    const enableSpy = jest.spyOn(EmailNotificationService.prototype, 'enableTestMode');
    try {
      const props = { get: jest.fn().mockReturnValue('MASTER_ID_1'), set: jest.fn() };
      initAldo(new Date('2026-01-01'), props);
      expect(ownerSpy).toHaveBeenCalledWith('MASTER_ID_1');
      expect(enableSpy).toHaveBeenCalledWith('owner@school.it');
    } finally {
      enableSpy.mockRestore();
      ownerSpy.mockRestore();
      findConfigSpy.mockRestore();
      restoreFactory();
      restoreDb();
    }
  });

  test('does not enable test mode when annoCorrente.testMode is false', () => {
    const restoreDb = mockDatabaseServiceGlobal();
    const restoreFactory = mockServiceFactory();
    const fakeMaster = { idSpreadsheet: 'ss1', idCartellaRoot: 'root1', testMode: false } as never;
    const findConfigSpy = jest
      .spyOn(MasterSheetRepository.prototype, 'findConfigAnnoCorrente')
      .mockReturnValue(fakeMaster);
    const ownerSpy = jest.spyOn(DriveServiceFacade.prototype, 'getFileOwnerEmail');
    const enableSpy = jest.spyOn(EmailNotificationService.prototype, 'enableTestMode');
    try {
      const props = { get: jest.fn().mockReturnValue('MASTER_ID_1'), set: jest.fn() };
      initAldo(new Date('2026-01-01'), props);
      expect(ownerSpy).not.toHaveBeenCalled();
      expect(enableSpy).not.toHaveBeenCalled();
    } finally {
      enableSpy.mockRestore();
      ownerSpy.mockRestore();
      findConfigSpy.mockRestore();
      restoreFactory();
      restoreDb();
    }
  });

  test('throws ConfigurationError (without caching a broken container) when testMode is true and the owner cannot be resolved', () => {
    const restoreDb = mockDatabaseServiceGlobal();
    const restoreFactory = mockServiceFactory();
    const fakeMaster = { idSpreadsheet: 'ss1', idCartellaRoot: 'root1', testMode: true } as never;
    const findConfigSpy = jest
      .spyOn(MasterSheetRepository.prototype, 'findConfigAnnoCorrente')
      .mockReturnValue(fakeMaster);
    const ownerSpy = jest
      .spyOn(DriveServiceFacade.prototype, 'getFileOwnerEmail')
      .mockReturnValue(null);
    try {
      const props = { get: jest.fn().mockReturnValue('MASTER_ID_1'), set: jest.fn() };
      expect(() => initAldo(new Date('2026-01-01'), props)).toThrow(ConfigurationError);
      // Not cached: a retry with a working owner must succeed, not return a stale broken instance.
      ownerSpy.mockReturnValue('owner@school.it');
      const enableSpy = jest.spyOn(EmailNotificationService.prototype, 'enableTestMode');
      const c = initAldo(new Date('2026-01-01'), props);
      expect(enableSpy).toHaveBeenCalledWith('owner@school.it');
      expect(c).toBeDefined();
      enableSpy.mockRestore();
    } finally {
      ownerSpy.mockRestore();
      findConfigSpy.mockRestore();
      restoreFactory();
      restoreDb();
    }
  });
});

test('deps.monitor flows through to both batch services (15 §9)', () => {
  const monitor = new FakeProcessMonitor();
  const db = new FakeDatabase(fixtureTables());
  const c = buildAldoContainer({
    db,
    master: new MasterSheetRepository(db),
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

/**
 * JobRunnerService's constructor eagerly builds a GoogleApiWrapper PropertiesService,
 * which reads `global.__nativePropertiesService__` (falling back to `global.PropertiesService`
 * — the vendored bundle's own class, once `Object.assign(global, Lib)` has run) to reach the
 * real native GAS PropertiesService. In the real GAS runtime that fallback is harmless because
 * the native still exists; under Jest there is no native, so the fallback resolves to the
 * wrapper class itself and `getScriptProperties()` recurses into itself forever. Stubbing
 * `__nativePropertiesService__` for the duration of the call sidesteps that recursion so
 * `creaJobRunner()` can be exercised for real.
 */
function stubNativePropertiesService() {
  const key = '__nativePropertiesService__';
  const globalWithNative = global as unknown as Record<string, unknown>;
  const original = globalWithNative[key];
  const fakeProperties = { getProperty: jest.fn().mockReturnValue(null), setProperty: jest.fn() };
  globalWithNative[key] = {
    getScriptProperties: () => fakeProperties,
    getUserProperties: () => fakeProperties,
    getDocumentProperties: () => fakeProperties
  };
  return () => {
    globalWithNative[key] = original;
  };
}

test('creaJobRunner wires ServiceFactory.getUtils() (not getUtilitiesService()) into JobRunnerService (15 §5)', () => {
  const fakeUtils = { __marker: 'fakeUtilsFromGetUtils' };
  const restoreNativeProperties = stubNativePropertiesService();
  const utilsSpy = jest.spyOn(ServiceFactory, 'getUtils').mockReturnValue(fakeUtils as never);
  const legacySpy = jest.spyOn(ServiceFactory, 'getUtilitiesService');
  try {
    const runner = creaJobRunner();
    expect(utilsSpy).toHaveBeenCalledTimes(1);
    expect(legacySpy).not.toHaveBeenCalled();
    // The library stores the injected utils on `_utils`; assert it's the exact object
    // ServiceFactory.getUtils() returned, not merely that construction succeeded.
    expect((runner as unknown as { _utils: unknown })._utils).toBe(fakeUtils);
  } finally {
    utilsSpy.mockRestore();
    legacySpy.mockRestore();
    restoreNativeProperties();
  }
});
