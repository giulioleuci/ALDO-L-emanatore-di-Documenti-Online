import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import {
  executeFullOnlineTests,
  executeOnlineTestsBatch1,
  executeOnlineTestsBatch2,
  executeOnlineTestsBatch3,
  executeOnlineTestsBatch4,
  runOnlineTestsBatch1,
  runOnlineTestsBatch2,
  runOnlineTestsBatch3,
  runOnlineTestsBatch4,
  PROP_ONLINETEST_CACHE_ISOLATED_MASTER_SPREADSHEET_ID,
  testCacheIsolamento,
  testJobRunnerTriggerReale,
  testPermessiAttivi,
  type FullOnlineTestDeps,
  type FullOnlineTestRegistrations,
  type FullOnlineTestSample
} from '../../../src/onlinetests';
import type { TestRunner } from '../../../src/onlinetests/report/OnlineTestReport';
import type { OnlineTestReport } from '../../../src/onlinetests/report/OnlineTestReport';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import type { IPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';
import { EMAIL_TEST_SAFE } from '../../../src/onlinetests/data/fixtures';
import {
  registerEffectiveAssignmentMatrixChecks,
  registerRepositoryChecks
} from '../../../src/onlinetests/checks/repositoryChecks';
import {
  registerContextEngineChecks,
  registerEffectiveAssignmentConsumerChecks
} from '../../../src/onlinetests/checks/contextEngineChecks';
import { registerEmailChecks } from '../../../src/onlinetests/checks/emailChecks';
import { registerDocumentiChecks } from '../../../src/onlinetests/checks/documentiChecks';
import {
  registerImportCartelleClasseChecks,
  registerImportCercaDocumentiChecks,
  registerImportChecks,
  registerImportChunkedChecks
} from '../../../src/onlinetests/checks/importChecks';
import { registerArticolazioneChecks } from '../../../src/onlinetests/checks/articolazioneChecks';
import { registerJobRunnerChecks } from '../../../src/onlinetests/checks/jobRunnerChecks';
import { registerSupplenzeRuoliChecks } from '../../../src/onlinetests/checks/supplenzeRuoliChecks';
import { registerAclRealiChecks } from '../../../src/onlinetests/checks/aclRealiChecks';
import { registerCacheIsolamentoChecks } from '../../../src/onlinetests/checks/cacheIsolamentoChecks';
import { registerPermessiChecks } from '../../../src/onlinetests/checks/permessiChecks';

jest.mock('../../../src/onlinetests/checks/repositoryChecks', () => ({
  registerRepositoryChecks: jest.fn(),
  registerEffectiveAssignmentMatrixChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/contextEngineChecks', () => ({
  registerContextEngineChecks: jest.fn(),
  registerEffectiveAssignmentConsumerChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/emailChecks', () => ({
  registerEmailChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/documentiChecks', () => ({
  registerDocumentiChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/importChecks', () => ({
  registerImportChecks: jest.fn(),
  registerImportCartelleClasseChecks: jest.fn(),
  registerImportCercaDocumentiChecks: jest.fn(),
  registerImportChunkedChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/articolazioneChecks', () => ({
  registerArticolazioneChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/jobRunnerChecks', () => ({
  registerJobRunnerChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/supplenzeRuoliChecks', () => ({
  registerSupplenzeRuoliChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/aclRealiChecks', () => ({
  registerAclRealiChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/cacheIsolamentoChecks', () => ({
  registerCacheIsolamentoChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/permessiChecks', () => ({
  registerPermessiChecks: jest.fn()
}));

const sample: SharedTestDatabase = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-1',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-1',
  priorSampleSpreadsheetId2: 'prior-2',
  priorSampleSpreadsheetUrl2: 'https://example.test/prior-2',
  logFoldFolderUrl: 'https://example.test/log',
  jobRunnerDocConfigId: 'job-runner-doc',
  masterTestMode: true,
  staticAttachmentFileId: 'attachment'
};

function properties(): IPropertiesFacade {
  return {
    get: (key: string) =>
      key === PROP_ONLINETEST_CACHE_ISOLATED_MASTER_SPREADSHEET_ID ? 'cache-master' : null,
    set: () => undefined
  };
}

describe('executeFullOnlineTests', () => {
  it('forces a fresh provision before registering every scenario group in the documented order', () => {
    const calls: string[] = [];
    const registerInterceptor = jest.fn();
    const container = {
      get: jest.fn(() => ({ registerInterceptor }))
    } as unknown as ServiceContainer;
    const register =
      (name: string) =>
      (runner: Pick<TestRunner, 'add'>): void => {
        calls.push(name);
        runner.add(name, sample.sampleSpreadsheetUrl, () => undefined);
      };
    const registrations = {
      documenti: register('documenti'),
      email: register('email'),
      jobRunner: register('jobrunner'),
      import: register('import'),
      storico: register('storico'),
      articolazione: register('articolazione'),
      itpDotted: register('itp'),
      supplenzeRuoli: register('supplenze'),
      aclReali: register('acl'),
      cacheIsolamento: register('cache'),
      permessi: register('permessi')
    };
    const deps: Partial<FullOnlineTestDeps> = {
      properties: properties(),
      clock: () => new Date('2026-08-11T09:00:00Z'),
      resetAldo: () => calls.push('reset'),
      initAldo: () => {
        calls.push('init');
        return container;
      },
      readSample: () => {
        calls.push('readSample');
        return sample;
      },
      registrations
    };

    const report = executeFullOnlineTests(deps);

    expect(calls).toEqual([
      'readSample',
      'reset',
      'init',
      'documenti',
      'email',
      'jobrunner',
      'import',
      'storico',
      'articolazione',
      'itp',
      'supplenze',
      'acl',
      'cache',
      'permessi'
    ]);
    expect(registerInterceptor).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ passed: 11, failed: 0 });
  });

  it('uses the default transitional adapters to run existing checks instead of reporting 0/0', () => {
    const calls: string[] = [];
    const registerInterceptor = jest.fn(() => calls.push('interceptor'));
    const container = {
      get: jest.fn(() => ({ registerInterceptor }))
    } as unknown as ServiceContainer;
    const registerExisting = (name: string) =>
      jest.fn(
        (
          runner: Pick<TestRunner, 'add'>,
          _container: ServiceContainer,
          fixture: FullOnlineTestSample
        ) => {
          calls.push(name);
          runner.add(name, fixture.sampleSpreadsheetUrl, () => undefined);
        }
      );
    const repository = registerExisting('repository');
    const context = registerExisting('context');
    const documenti = registerExisting('documenti');
    const email = registerExisting('email');
    const jobRunner = registerExisting('jobrunner');
    const importChecks = registerExisting('import');
    const importCartelleClasseChecks = registerExisting('import.cartelleClasse');
    const importCercaDocumentiChecks = registerExisting('import.cercaDocumenti');
    const importChunkedChecks = registerExisting('import.chunked');
    const articolazione = registerExisting('articolazione');
    const supplenze = registerExisting('supplenze');
    const acl = registerExisting('acl');
    const assignmentMatrix = registerExisting('supplenze.matrix');
    const assignmentConsumer = registerExisting('supplenze.consumer');
    const cache = registerExisting('cache');
    const permessi = registerExisting('permessi');
    jest.mocked(registerRepositoryChecks).mockImplementation(repository);
    jest.mocked(registerContextEngineChecks).mockImplementation(context);
    jest.mocked(registerDocumentiChecks).mockImplementation(documenti);
    jest.mocked(registerEmailChecks).mockImplementation(email);
    jest.mocked(registerJobRunnerChecks).mockImplementation(jobRunner);
    jest.mocked(registerImportChecks).mockImplementationOnce(importChecks);
    jest
      .mocked(registerImportCartelleClasseChecks)
      .mockImplementationOnce(importCartelleClasseChecks);
    jest
      .mocked(registerImportCercaDocumentiChecks)
      .mockImplementationOnce(importCercaDocumentiChecks);
    jest.mocked(registerImportChunkedChecks).mockImplementationOnce(importChunkedChecks);
    jest.mocked(registerArticolazioneChecks).mockImplementation(articolazione);
    jest.mocked(registerSupplenzeRuoliChecks).mockImplementation(supplenze);
    jest.mocked(registerAclRealiChecks).mockImplementation(acl);
    jest.mocked(registerEffectiveAssignmentMatrixChecks).mockImplementation(assignmentMatrix);
    jest.mocked(registerEffectiveAssignmentConsumerChecks).mockImplementation(assignmentConsumer);
    jest.mocked(registerCacheIsolamentoChecks).mockImplementation(cache as never);
    jest.mocked(registerPermessiChecks).mockImplementation(permessi as never);

    const report = executeFullOnlineTests({
      properties: properties(),
      clock: () => new Date('2026-08-11T09:00:00Z'),
      resetAldo: () => calls.push('reset'),
      initAldo: () => {
        calls.push('init');
        return container;
      },
      readSample: () => {
        calls.push('readSample');
        return sample;
      }
    });

    expect(calls).toEqual([
      'readSample',
      'reset',
      'init',
      'interceptor',
      'repository',
      'context',
      'documenti',
      'email',
      'jobrunner',
      'import',
      'import.cartelleClasse',
      'import.cercaDocumenti',
      'import.chunked',
      'articolazione',
      'supplenze.matrix',
      'supplenze.consumer',
      'supplenze',
      'acl',
      'cache',
      'permessi'
    ]);
    expect(registerEmailChecks).toHaveBeenCalledWith(
      expect.anything(),
      container,
      expect.objectContaining({ testMode: true }),
      EMAIL_TEST_SAFE
    );
    expect(registerJobRunnerChecks).toHaveBeenCalledWith(
      expect.anything(),
      container,
      expect.objectContaining({ testMode: true }),
      EMAIL_TEST_SAFE
    );
    const cacheCall = jest.mocked(registerCacheIsolamentoChecks).mock.calls[0];
    expect(cacheCall?.[1]).toBe(container);
    expect(cacheCall?.[2]).toMatchObject({ testMode: true });
    expect(cacheCall?.[3].secondMasterSpreadsheetId).toBe('cache-master');
    expect(report.passed).toBeGreaterThan(0);
    expect(report.failed).toBeGreaterThan(0);
    expect(report.results.map((result) => result.name)).toEqual([
      'repository',
      'context',
      'documenti',
      'email',
      'jobrunner',
      'import',
      'import.cartelleClasse',
      'import.cercaDocumenti',
      'import.chunked',
      'storico.alunno::depth 2 materializzato',
      'storico.alunno::casi limite depth 0, mancanti e sconosciuto',
      'storico.classe::statistiche, progetti e referente',
      'storico.classe::continuità CdC, ITP ed evoluzione materie',
      'storico.documenti::ID_GEN, famiglia, sottotipo e isolamento PEI/PDP',
      'storico.render::template documento e mail senza placeholder',
      'articolazione',
      'itpDotted::getITPPerMateria specifica',
      'itpDotted::identita assegnazioni, ruoli e ownership',
      'itpDotted::nomi sintetizzati ed espliciti',
      'itpDotted::CDU materia e tuple docenti',
      'itpDotted::isolamento sostituzione e variazione',
      'itpDotted::continuita titolare/ITP e campi assenti',
      'itpDotted::CONF_DOC_DOTTED renderizzato',
      'supplenze.matrix',
      'supplenze.consumer',
      'supplenze',
      'acl',
      'cache',
      'permessi'
    ]);
    expect(report.results.some((result) => result.name.includes('trigger reale'))).toBe(false);
  });

  it('launches the optional real-trigger suite separately from the aggregate suite', () => {
    const report = {
      suite: 'aldo-online-tests' as const,
      startedAt: '2026-08-11T09:00:00.000Z',
      finishedAt: '2026-08-11T09:00:01.000Z',
      passed: 1,
      failed: 0,
      results: []
    };
    const execute = jest.fn(() => report);
    const logJobStart = jest.fn();
    const logger = {
      logJobStart,
      logSummary: jest.fn(),
      logJobEnd: jest.fn()
    } as unknown as LoggerService;

    expect(testJobRunnerTriggerReale(execute, logger)).toBe(report);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logJobStart).toHaveBeenCalledWith(
      'jobrunner_trigger_reale',
      'JOBRUNNER_REAL_TRIGGER_SCENARIO'
    );
  });

  function expectReportedLauncher(
    launcher: (execute: () => OnlineTestReport, logger: LoggerService) => OnlineTestReport,
    jobName: string,
    jobType: string
  ): void {
    const report = {
      suite: 'aldo-online-tests' as const,
      startedAt: '2026-08-11T09:00:00.000Z',
      finishedAt: '2026-08-11T09:00:01.000Z',
      passed: 1,
      failed: 0,
      skipped: 0,
      results: []
    };
    const execute = jest.fn(() => report);
    const logJobStart = jest.fn();
    const logger = {
      logJobStart,
      logSummary: jest.fn(),
      logJobEnd: jest.fn()
    } as unknown as LoggerService;

    expect(launcher(execute, logger)).toBe(report);
    expect(logJobStart).toHaveBeenCalledWith(jobName, jobType);
  }

  it('runs cache-isolation launcher through job reporting', () => {
    expectReportedLauncher(
      (execute, logger) => testCacheIsolamento(execute, logger),
      'cache_isolamento',
      'CACHE_ISOLAMENTO_SCENARIO'
    );
  });

  it('runs active-permissions launcher through job reporting', () => {
    expectReportedLauncher(
      (execute, logger) => testPermessiAttivi(execute, logger),
      'permessi_attivi',
      'PERMESSI_ATTIVI_SCENARIO'
    );
  });
});

const ONLINE_TEST_GROUP_NAMES: Array<keyof FullOnlineTestRegistrations> = [
  'documenti',
  'email',
  'jobRunner',
  'import',
  'storico',
  'articolazione',
  'itpDotted',
  'supplenzeRuoli',
  'aclReali',
  'cacheIsolamento',
  'permessi'
];

/** Properties fixture without the cache-isolated master: batches 1-3 must not need it. */
function propertiesWithoutCacheFixture(): IPropertiesFacade {
  return {
    get: () => null,
    set: () => undefined
  };
}

function recordBatchGroups(
  execute: (overrides: Partial<FullOnlineTestDeps>) => OnlineTestReport,
  props: IPropertiesFacade
): string[] {
  const calls: string[] = [];
  const registerInterceptor = jest.fn();
  const container = {
    get: jest.fn(() => ({ registerInterceptor }))
  } as unknown as ServiceContainer;
  const registrations: Record<string, unknown> = {};
  for (const name of ONLINE_TEST_GROUP_NAMES) {
    registrations[name] = (runner: Pick<TestRunner, 'add'>): void => {
      calls.push(name);
      runner.add(name, sample.sampleSpreadsheetUrl, () => undefined);
    };
  }

  execute({
    properties: props,
    clock: () => new Date('2026-08-11T09:00:00Z'),
    resetAldo: () => undefined,
    initAldo: () => container,
    readSample: () => sample,
    registrations: registrations
  });
  return calls;
}

function recordBatchScenarioNames(
  execute: (overrides: Partial<FullOnlineTestDeps>) => OnlineTestReport,
  props: IPropertiesFacade,
  scenarioNames: Partial<Record<keyof FullOnlineTestRegistrations, string[]>>
): string[] {
  const container = {
    get: jest.fn(() => ({ registerInterceptor: jest.fn() }))
  } as unknown as ServiceContainer;
  const registrations: Record<string, unknown> = {};
  for (const name of ONLINE_TEST_GROUP_NAMES) {
    registrations[name] = (runner: Pick<TestRunner, 'add'>): void => {
      for (const scenario of scenarioNames[name] ?? []) {
        runner.add(scenario, sample.sampleSpreadsheetUrl, () => undefined);
      }
    };
  }

  return execute({
    properties: props,
    clock: () => new Date('2026-08-11T09:00:00Z'),
    resetAldo: () => undefined,
    initAldo: () => container,
    readSample: () => sample,
    registrations
  }).results.map((result) => result.name);
}

describe('online test batches', () => {
  it('registers only documenti and jobRunner in batch 1, without the cache fixture', () => {
    expect(recordBatchGroups(executeOnlineTestsBatch1, propertiesWithoutCacheFixture())).toEqual([
      'documenti',
      'jobRunner'
    ]);
  });

  it('reports batch 1 through the shared job logger', () => {
    const report = {
      suite: 'aldo-online-tests' as const,
      startedAt: '2026-08-11T09:00:00.000Z',
      finishedAt: '2026-08-11T09:00:01.000Z',
      passed: 1,
      failed: 0,
      results: []
    };
    const execute = jest.fn(() => report);
    const logJobStart = jest.fn();
    const logger = {
      logJobStart,
      logSummary: jest.fn(),
      logJobEnd: jest.fn()
    } as unknown as LoggerService;

    expect(runOnlineTestsBatch1(execute, logger)).toBe(report);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logJobStart).toHaveBeenCalledWith('online_tests_batch1', 'ONLINE_TEST_SUITE_BATCH');
  });

  it('registers only email and articolazione in batch 2, without the cache fixture', () => {
    expect(recordBatchGroups(executeOnlineTestsBatch2, propertiesWithoutCacheFixture())).toEqual([
      'email',
      'articolazione'
    ]);
  });

  it('registers only import, storico, itpDotted and aclReali in batch 3', () => {
    expect(recordBatchGroups(executeOnlineTestsBatch3, propertiesWithoutCacheFixture())).toEqual([
      'import',
      'storico',
      'itpDotted',
      'aclReali'
    ]);
  });

  it('registers only supplenzeRuoli, cacheIsolamento and permessi in batch 4', () => {
    expect(recordBatchGroups(executeOnlineTestsBatch4, properties())).toEqual([
      'supplenzeRuoli',
      'cacheIsolamento',
      'permessi'
    ]);
  });

  it('covers every aggregate group exactly once across the four batches', () => {
    const covered = [
      ...recordBatchGroups(executeOnlineTestsBatch1, propertiesWithoutCacheFixture()),
      ...recordBatchGroups(executeOnlineTestsBatch2, propertiesWithoutCacheFixture()),
      ...recordBatchGroups(executeOnlineTestsBatch3, propertiesWithoutCacheFixture()),
      ...recordBatchGroups(executeOnlineTestsBatch4, properties())
    ];
    expect(covered.slice().sort()).toEqual(ONLINE_TEST_GROUP_NAMES.slice().sort());
  });

  it('locks the 103-scenario acceptance contract across all four batches', () => {
    const batch1 = recordBatchScenarioNames(
      executeOnlineTestsBatch1,
      propertiesWithoutCacheFixture(),
      {
        documenti: Array.from({ length: 25 }, (_, i) => `E2E batch 1 scenario ${i + 1}`),
        jobRunner: ['E2E batch 1 scenario 26']
      }
    );
    const batch2 = recordBatchScenarioNames(
      executeOnlineTestsBatch2,
      propertiesWithoutCacheFixture(),
      {
        email: Array.from({ length: 13 }, (_, i) => `E2E batch 2 scenario ${i + 1}`),
        articolazione: [
          'E2E scenario 10b: genera documento complesso classe articolata (3C)',
          'E2E scenario 10c: genera riepiloghi firme CDC per classi ARTICOLATA'
        ]
      }
    );
    const batch3 = recordBatchScenarioNames(
      executeOnlineTestsBatch3,
      propertiesWithoutCacheFixture(),
      {
        import: Array.from({ length: 27 }, (_, i) => `E2E batch 3 scenario ${i + 1}`)
      }
    );
    const batch4 = recordBatchScenarioNames(
      executeOnlineTestsBatch4,
      properties(),
      {
        supplenzeRuoli: Array.from({ length: 35 }, (_, i) => `E2E batch 4 scenario ${i + 1}`)
      }
    );
    const allNames = [...batch1, ...batch2, ...batch3, ...batch4];
    expect(allNames).toHaveLength(103);
    expect(new Set(allNames).size).toBe(103);
    expect(allNames).toContain('E2E scenario 10b: genera documento complesso classe articolata (3C)');
    expect(allNames).toContain('E2E scenario 10c: genera riepiloghi firme CDC per classi ARTICOLATA');
  });

  it.each([
    ['batch 2', runOnlineTestsBatch2, 'online_tests_batch2'],
    ['batch 3', runOnlineTestsBatch3, 'online_tests_batch3'],
    ['batch 4', runOnlineTestsBatch4, 'online_tests_batch4']
  ])('reports %s through the shared job logger', (_label, launcher, jobName) => {
    const report = {
      suite: 'aldo-online-tests' as const,
      startedAt: '2026-08-11T09:00:00.000Z',
      finishedAt: '2026-08-11T09:00:01.000Z',
      passed: 1,
      failed: 0,
      results: []
    };
    const execute = jest.fn(() => report);
    const logJobStart = jest.fn();
    const logger = {
      logJobStart,
      logSummary: jest.fn(),
      logJobEnd: jest.fn()
    } as unknown as LoggerService;

    expect(launcher(execute, logger)).toBe(report);
    expect(logJobStart).toHaveBeenCalledWith(jobName, 'ONLINE_TEST_SUITE_BATCH');
  });
});
