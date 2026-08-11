import type { ContextBuilder } from '../application/context-engine/ContextBuilder';
import { initAldo, resetAldo } from '../config/Bootstrap';
import type { ServiceContainer } from '../config/ServiceContainer';
import { TABLE } from '../config/schema';
import { ConfigurationError } from '../domain/errors/DomainError';
import { MasterSheetRepository } from '../infrastructure/repositories/MasterSheetRepository';
import { SheetDbAdapter } from '../infrastructure/db/SheetDbAdapter';
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import { DriveServiceFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { ScriptPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { e2eActiveRepresentativesInterceptor } from './E2eActiveRepresentativesInterceptor';
import { GasArtifactFactory } from './GasArtifactFactory';
import { GasSampleSpreadsheetFactory } from './GasSampleSpreadsheetFactory';
import { E2eTemplateProvisioner, type IArtifactFactory } from './E2eTemplateProvisioner';
import { registerArticolazioneChecks } from './checks/articolazioneChecks';
import { registerDocumentiChecks, type DocumentiCheckScope } from './checks/documentiChecks';
import { registerE2eLegacyScenarioChecks } from './checks/e2eScenarioChecks';
import { registerEmailChecks } from './checks/emailChecks';
import {
  registerJobRunnerChecks,
  registerJobRunnerDocGenChecks,
  registerJobRunnerEmailChecks
} from './checks/jobRunnerChecks';
import {
  registerContextEngineChecks,
  registerEffectiveAssignmentConsumerChecks
} from './checks/contextEngineChecks';
import {
  registerEffectiveAssignmentMatrixChecks,
  registerRepositoryChecks
} from './checks/repositoryChecks';
import { TestRunner, type OnlineTestReport } from './report/OnlineTestReport';
import type { ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';
import {
  SharedTestDatabaseBuilder,
  type E2eTemplateIds,
  type SharedTestDatabase
} from './data/SharedTestDatabaseBuilder';
import { CONF_DOC_JOBRUNNER, EMAIL_TEST_SAFE } from './data/fixtures';

/** Test-only fixture pointer; production startup always uses its bound spreadsheet. */
export const PROP_ONLINETEST_MASTER_SPREADSHEET_ID = 'MASTER_SPREADSHEET_ID';

export interface E2eTestDeps {
  spreadsheetFactory: ISampleSpreadsheetFactory;
  artifactFactory: IArtifactFactory;
  drive: IDriveFacade;
  activeMasterSpreadsheetId: () => string;
  clock: () => Date;
  properties: IPropertiesFacade;
  resetAldo: () => void;
  initAldo: (
    now?: Date,
    props?: IPropertiesFacade,
    masterSpreadsheetId?: string
  ) => ServiceContainer;
  log: (message: string) => void;
}

export type FullOnlineTestSample = SharedTestDatabase & { testMode: boolean };

type RegisterSharedChecks = (
  runner: TestRunner,
  container: ServiceContainer,
  sample: FullOnlineTestSample
) => void;

type RegisterEmailChecks = (
  runner: TestRunner,
  container: ServiceContainer,
  sample: FullOnlineTestSample,
  safeEmail: string
) => void;

/**
 * Registration seams for the aggregate runner. They deliberately remain no-op defaults until
 * their corresponding scenario task supplies the real `register*Checks` implementation.
 */
export interface FullOnlineTestRegistrations {
  documenti: RegisterSharedChecks;
  email: RegisterEmailChecks;
  jobRunner: RegisterEmailChecks;
  import: RegisterSharedChecks;
  storico: RegisterSharedChecks;
  articolazione: RegisterSharedChecks;
  itpDotted: RegisterSharedChecks;
  supplenzeRuoli: RegisterSharedChecks;
  aclReali: RegisterSharedChecks;
  cacheIsolamento: RegisterSharedChecks;
  permessi: RegisterSharedChecks;
}

/** Injectable seams beyond provisioning, kept separate from the real-GAS defaults. */
export interface FullOnlineTestDeps extends E2eTestDeps {
  provision: (overrides: Partial<E2eTestDeps>, force: boolean) => SharedTestDatabase;
  registrations: Partial<FullOnlineTestRegistrations>;
}

const registerLegacyDocumentiChecks: RegisterSharedChecks = (runner, container, sample) => {
  registerRepositoryChecks(runner, container, sample);
  registerContextEngineChecks(runner, container, sample);
  registerDocumentiChecks(runner, container, sample, 'all');
};

const registerLegacyImportChecks: RegisterSharedChecks = (runner, container, sample) => {
  registerE2eLegacyScenarioChecks(runner, container, sample, 'import');
};

const registerLegacySupplenzeRuoliChecks: RegisterSharedChecks = (runner, container, sample) => {
  registerEffectiveAssignmentMatrixChecks(runner, container, sample);
  registerEffectiveAssignmentConsumerChecks(runner, container, sample);
};

function registerPendingChecks(group: string): RegisterSharedChecks {
  return (runner, _container, sample) => {
    runner.add(
      `Aggregate scenario pending migration: ${group}`,
      sample.sampleSpreadsheetUrl,
      () => {
        throw new ConfigurationError(
          `Aggregate online-test group "${group}" has not been migrated yet.`
        );
      }
    );
  };
}

const futureScenarioRegistrations: FullOnlineTestRegistrations = {
  documenti: registerLegacyDocumentiChecks,
  email: registerEmailChecks,
  jobRunner: registerJobRunnerChecks,
  import: registerLegacyImportChecks,
  storico: registerPendingChecks('storico'),
  articolazione: registerArticolazioneChecks,
  itpDotted: registerPendingChecks('itp-dotted'),
  supplenzeRuoli: registerLegacySupplenzeRuoliChecks,
  aclReali: registerPendingChecks('acl-reali'),
  cacheIsolamento: registerPendingChecks('cache-isolamento'),
  permessi: registerPendingChecks('permessi')
};

const E2E_ROOT_FOLDER_NAME = '_ALDO_E2E_ROOT';

function readCurrentMasterConfig(masterId: string): {
  idSpreadsheet: string;
  idCartellaRoot: string;
  testMode: boolean;
} {
  const logger = ServiceFactory.getLogger();
  const masterDb = new SheetDbAdapter(
    new DatabaseService(
      masterId,
      logger,
      ServiceFactory.getUtils(),
      ServiceFactory.getCacheService().getScriptCache(),
      null,
      { verifyTables: [TABLE.MASTER] }
    )
  );
  return new MasterSheetRepository(masterDb).findConfigAnnoCorrente();
}

function mintE2eRootFolder(): GoogleAppsScript.Drive.Folder {
  return testContext.getOrCreateNamedFolder(E2E_ROOT_FOLDER_NAME) as GoogleAppsScript.Drive.Folder;
}

/**
 * Provisions the persistent shared E2E fixture without running checks. `forceRebuild` is an
 * explicit caller override; the standalone launcher keeps honoring its property switch.
 */
export function executeCreaDatiMockDrive(
  overrides: Partial<E2eTestDeps> = {},
  forceRebuild = false
): SharedTestDatabase {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const force = forceRebuild || properties.get('ALDO_E2E_FORCE_REBUILD') === 'true';
  const activeMasterSpreadsheetId =
    overrides.activeMasterSpreadsheetId ??
    (() => ServiceFactory.getSpreadsheetService().getActiveStandard().getId());
  const configuredMasterSpreadsheetId = properties
    .get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)
    ?.trim();
  const masterSpreadsheetId =
    force || configuredMasterSpreadsheetId === undefined || configuredMasterSpreadsheetId === ''
      ? activeMasterSpreadsheetId()
      : configuredMasterSpreadsheetId;
  const rootFolder = overrides.drive === undefined ? mintE2eRootFolder() : null;
  const drive =
    overrides.drive ??
    new DriveServiceFacade(
      ServiceFactory.getDriveService(),
      ServiceFactory.getPermissionService(),
      (rootFolder as NonNullable<typeof rootFolder>).getId()
    );
  const spreadsheetFactory =
    overrides.spreadsheetFactory ?? new GasSampleSpreadsheetFactory(rootFolder);
  const artifactFactory =
    overrides.artifactFactory ??
    new GasArtifactFactory(
      ServiceFactory.getDocumentService(),
      ServiceFactory.getSpreadsheetService()
    );

  const master = spreadsheetFactory.openExistingSpreadsheet(masterSpreadsheetId);
  const templateFolderId = drive.createFolder('_ALDO_E2E_TEMPLATES');
  const templateIds: E2eTemplateIds = new E2eTemplateProvisioner(artifactFactory, drive).provision(
    templateFolderId
  );
  const sample = new SharedTestDatabaseBuilder(spreadsheetFactory, drive, artifactFactory).build(
    templateIds,
    master,
    { force }
  );

  properties.set(PROP_ONLINETEST_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);
  return sample;
}

/**
 * Builds one freshly-provisioned E2E dataset and registers scenario groups in their stable
 * execution order. Injection keeps the composition testable without touching real GAS services.
 */
export function executeFullOnlineTests(
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const provision = overrides.provision ?? executeCreaDatiMockDrive;
  // A full suite must never inherit an old dataset: it is both a freshness and isolation boundary.
  const sample = provision(overrides, true);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());
  const registrations = { ...futureScenarioRegistrations, ...overrides.registrations };

  resetAldoFn();
  const container = initAldoFn(clock(), properties);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);

  const runner = new TestRunner();
  const testSample: FullOnlineTestSample = { ...sample, testMode: sample.masterTestMode };
  registrations.documenti(runner, container, testSample);
  registrations.email(runner, container, testSample, EMAIL_TEST_SAFE);
  registrations.jobRunner(runner, container, testSample, EMAIL_TEST_SAFE);
  registrations.import(runner, container, testSample);
  registrations.storico(runner, container, testSample);
  registrations.articolazione(runner, container, testSample);
  registrations.itpDotted(runner, container, testSample);
  registrations.supplenzeRuoli(runner, container, testSample);
  registrations.aclReali(runner, container, testSample);
  registrations.cacheIsolamento(runner, container, testSample);
  registrations.permessi(runner, container, testSample);
  return runner.report();
}

function runReportedSuite(
  jobName: string,
  jobType: string,
  execute: () => OnlineTestReport,
  logger: LoggerService
): OnlineTestReport {
  logger.logJobStart(jobName, jobType);
  try {
    const report = execute();
    const startedAt = new Date(report.startedAt).getTime();
    const finishedAt = new Date(report.finishedAt).getTime();
    const durationMs =
      Number.isFinite(startedAt) && Number.isFinite(finishedAt)
        ? Math.max(0, finishedAt - startedAt)
        : 0;
    logger.logSummary('🧪 Online test report', durationMs, {
      passed: report.passed,
      failed: report.failed
    });
    logger.logJobEnd(
      jobName,
      report.failed === 0,
      `${report.passed} passed, ${report.failed} failed`
    );
    return report;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.logJobEnd(jobName, false, PiiRedactor.redact(reason));
    throw error;
  }
}

/** GAS Run-dropdown entry point for the complete, freshly-provisioned online suite. */
export function runFullOnlineTests(
  execute: () => OnlineTestReport = executeFullOnlineTests,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('online_tests_full', 'ONLINE_TEST_SUITE', execute, logger);
}

/**
 * GAS Run-dropdown entry point for the online-coverage spike. Empty when the bundle was not
 * built in online mode with Istanbul instrumentation.
 */
export function dumpOnlineCoverage(): void {
  const coverage = (globalThis as { __coverage__?: unknown }).__coverage__ ?? {};
  ServiceFactory.getLogger().info(JSON.stringify(coverage));
}

export function creaDatiMockDrive(): SharedTestDatabase {
  return executeCreaDatiMockDrive();
}

function executePersistedDocumentiChecks(
  scope: DocumentiCheckScope,
  overrides: Partial<E2eTestDeps>
): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  if (masterSpreadsheetId === undefined || masterSpreadsheetId === '') {
    throw new ConfigurationError('Dataset online non disponibile: esegui prima creaDatiMockDrive.');
  }
  const master = readCurrentMasterConfig(masterSpreadsheetId);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());

  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);

  const sample: FullOnlineTestSample = {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: '',
    priorSampleSpreadsheetUrl: '',
    priorSampleSpreadsheetId2: '',
    priorSampleSpreadsheetUrl2: '',
    logFoldFolderUrl: '',
    jobRunnerDocConfigId: '',
    masterTestMode: master.testMode,
    staticAttachmentFileId: '',
    testMode: master.testMode
  };
  const runner = new TestRunner();
  registerDocumentiChecks(runner, container, sample, scope);
  return runner.report();
}

export function executeDocumentiStandard(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedDocumentiChecks('standard', overrides);
}

export function executeDocumentiArticolati(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedDocumentiChecks('articolati', overrides);
}

export function executeDocumentiTabelleImportate(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  return executePersistedDocumentiChecks('tabelle-importate', overrides);
}

export function executeDuplicazioneDocumenti(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  return executePersistedDocumentiChecks('duplicazione', overrides);
}

function executePersistedEmailChecks(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  if (masterSpreadsheetId === undefined || masterSpreadsheetId === '') {
    throw new ConfigurationError('Dataset online non disponibile: esegui prima creaDatiMockDrive.');
  }
  const master = readCurrentMasterConfig(masterSpreadsheetId);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());

  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);

  const sample: FullOnlineTestSample = {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: '',
    priorSampleSpreadsheetUrl: '',
    priorSampleSpreadsheetId2: '',
    priorSampleSpreadsheetUrl2: '',
    logFoldFolderUrl: '',
    jobRunnerDocConfigId: '',
    masterTestMode: master.testMode,
    staticAttachmentFileId: '',
    testMode: master.testMode
  };
  const runner = new TestRunner();
  registerEmailChecks(runner, container, sample, EMAIL_TEST_SAFE);
  return runner.report();
}

function executePersistedJobRunnerChecks(
  scope: 'documenti' | 'email',
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  if (masterSpreadsheetId === undefined || masterSpreadsheetId === '') {
    throw new ConfigurationError('Dataset online non disponibile: esegui prima creaDatiMockDrive.');
  }
  const master = readCurrentMasterConfig(masterSpreadsheetId);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());

  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);

  const sample: FullOnlineTestSample = {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: '',
    priorSampleSpreadsheetUrl: '',
    priorSampleSpreadsheetId2: '',
    priorSampleSpreadsheetUrl2: '',
    logFoldFolderUrl: '',
    jobRunnerDocConfigId: CONF_DOC_JOBRUNNER,
    masterTestMode: master.testMode,
    staticAttachmentFileId: '',
    testMode: master.testMode
  };
  const runner = new TestRunner();
  if (scope === 'documenti') registerJobRunnerDocGenChecks(runner, container, sample);
  else registerJobRunnerEmailChecks(runner, container, sample, EMAIL_TEST_SAFE);
  return runner.report();
}

export function executeJobRunnerDocGen(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedJobRunnerChecks('documenti', overrides);
}

export function executeJobRunnerEmail(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedJobRunnerChecks('email', overrides);
}

function nonImplementato(): never {
  throw new ConfigurationError('non implementato');
}

// Dedicated launchers are implemented by the subsequent scenario tasks.
export function testDocumentiStandard(): OnlineTestReport {
  return runReportedSuite(
    'documenti_standard',
    'DOC_SCENARIO',
    executeDocumentiStandard,
    ServiceFactory.getLogger()
  );
}
export function testDocumentiArticolati(): OnlineTestReport {
  return runReportedSuite(
    'documenti_articolati',
    'DOC_SCENARIO',
    executeDocumentiArticolati,
    ServiceFactory.getLogger()
  );
}
export function testDocumentiTabelleImportate(): OnlineTestReport {
  return runReportedSuite(
    'documenti_tabelle_importate',
    'DOC_SCENARIO',
    executeDocumentiTabelleImportate,
    ServiceFactory.getLogger()
  );
}
export function testDuplicazioneDocumenti(): OnlineTestReport {
  return runReportedSuite(
    'documenti_duplicazione',
    'DOC_SCENARIO',
    executeDuplicazioneDocumenti,
    ServiceFactory.getLogger()
  );
}
export function testInvioEmail(): OnlineTestReport {
  return runReportedSuite(
    'email_invio',
    'EMAIL_SCENARIO',
    executePersistedEmailChecks,
    ServiceFactory.getLogger()
  );
}
export function testEmailSicurezza(): OnlineTestReport {
  return runReportedSuite(
    'email_sicurezza',
    'EMAIL_SCENARIO',
    executePersistedEmailChecks,
    ServiceFactory.getLogger()
  );
}
export function testJobRunnerDocGen(
  execute: () => OnlineTestReport = executeJobRunnerDocGen,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('jobrunner_documenti', 'JOBRUNNER_DOC_SCENARIO', execute, logger);
}
export function testJobRunnerEmail(
  execute: () => OnlineTestReport = executeJobRunnerEmail,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('jobrunner_email', 'JOBRUNNER_EMAIL_SCENARIO', execute, logger);
}
export function testJobRunnerTriggerReale(): OnlineTestReport {
  return nonImplementato();
}
export function testImportFileSingolo(): OnlineTestReport {
  return nonImplementato();
}
export function testImportCartelleClasse(): OnlineTestReport {
  return nonImplementato();
}
export function testImportCercaDocumenti(): OnlineTestReport {
  return nonImplementato();
}
export function testImportChunked(): OnlineTestReport {
  return nonImplementato();
}
export function testRecuperoStoricoAlunno(): OnlineTestReport {
  return nonImplementato();
}
export function testRecuperoStoricoClasse(): OnlineTestReport {
  return nonImplementato();
}
export function testRecuperoStoricoDocumenti(): OnlineTestReport {
  return nonImplementato();
}
export function testArticolazione(): OnlineTestReport {
  return nonImplementato();
}
export function testITPeMateriePuntate(): OnlineTestReport {
  return nonImplementato();
}
export function testSupplenzeERuoli(): OnlineTestReport {
  return nonImplementato();
}
export function testACLReali(): OnlineTestReport {
  return nonImplementato();
}
export function testCacheIsolamento(): OnlineTestReport {
  return nonImplementato();
}
export function testPermessiAttivi(): OnlineTestReport {
  return nonImplementato();
}
