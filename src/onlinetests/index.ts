import type { ServiceContainer } from '../config/ServiceContainer';
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { DriveServiceFacade } from '../infrastructure/facades/DriveServiceFacade';
import { ScriptPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { SessionActiveUserFacade } from '../infrastructure/facades/ActiveUserFacade';
import { initAldo, resetAldo } from '../config/Bootstrap';
import { TABLE } from '../config/schema';
import { ConfigurationError } from '../domain/errors/DomainError';
import type { MasterConfig } from '../domain/entities/MasterConfig';
import { SheetDbAdapter } from '../infrastructure/db/SheetDbAdapter';
import { MasterSheetRepository } from '../infrastructure/repositories/MasterSheetRepository';
import { TestRunner, type OnlineTestReport } from './OnlineTestReport';
import { SampleDatabaseBuilder, type ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';
import { GasSampleSpreadsheetFactory } from './GasSampleSpreadsheetFactory';
import {
  registerEffectiveAssignmentMatrixChecks,
  registerRepositoryChecks
} from './checks/repositoryChecks';
import {
  registerContextEngineChecks,
  registerEffectiveAssignmentConsumerChecks
} from './checks/contextEngineChecks';
import { registerPipelineChecks } from './checks/pipelineChecks';
import {
  SharedTestDatabaseBuilder,
  type E2eTemplateIds
} from './data/SharedTestDatabaseBuilder';
import { E2eTemplateProvisioner, type IArtifactFactory } from './E2eTemplateProvisioner';
import { GasArtifactFactory } from './GasArtifactFactory';
import { registerE2eScenarioChecks } from './checks/e2eScenarioChecks';
import { registerArticolazioneChecks } from './checks/articolazioneChecks';
import { e2eActiveRepresentativesInterceptor } from './E2eActiveRepresentativesInterceptor';
import type { ContextBuilder } from '../application/context-engine/ContextBuilder';

/** Test-only fixture pointer; production startup always uses its bound spreadsheet. */
export const PROP_ONLINETEST_MASTER_SPREADSHEET_ID = 'MASTER_SPREADSHEET_ID';

/**
 * Every seam {@link executeOnlineTests} needs that ultimately touches something outside plain
 * TypeScript (GAS services, the clock, ScriptProperties). Each field defaults to a real
 * implementation (see the `??` fallbacks in {@link executeOnlineTests}) so `runOnlineTests()` can
 * call it with no arguments; unit tests override every field with a fake/fixture-backed
 * implementation so the function runs fully offline (design spec §2 "Testing").
 */
export interface OnlineTestDeps {
  spreadsheetFactory: ISampleSpreadsheetFactory;
  drive: IDriveFacade;
  clock: () => Date;
  properties: IPropertiesFacade;
  /** Same signature as `Bootstrap.ts`'s real `initAldo` — swapped for a canned-container fake in tests. */
  initAldo: (now?: Date, props?: IPropertiesFacade) => ServiceContainer;
  activeUserEmail: () => string;
  /** Logging seam for scenario diagnostics; top-level reports use the semantic LoggerService API. */
  log: (message: string) => void;
}

export interface ArticolazioneTestDeps {
  clock: () => Date;
  properties: IPropertiesFacade;
  initAldo: (now?: Date, props?: IPropertiesFacade) => ServiceContainer;
  readMasterConfig: (masterId: string) => Pick<
    MasterConfig,
    'idSpreadsheet' | 'idCartellaRoot' | 'testMode'
  >;
  log: (message: string) => void;
}

function readCurrentMasterConfig(
  masterId: string
): Pick<MasterConfig, 'idSpreadsheet' | 'idCartellaRoot' | 'testMode'> {
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

export function executeArticolazioneScenarios(
  overrides: Partial<ArticolazioneTestDeps> = {}
): OnlineTestReport {
  const clock = overrides.clock ?? ((): Date => new Date());
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const initAldoFn = overrides.initAldo ?? initAldo;
  const readMasterConfig = overrides.readMasterConfig ?? readCurrentMasterConfig;
  const log =
    overrides.log ?? ((message: string): void => ServiceFactory.getLogger().info(message));
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID);

  if (masterSpreadsheetId === null || masterSpreadsheetId.trim() === '') {
    throw new ConfigurationError(
      `ScriptProperties.${PROP_ONLINETEST_MASTER_SPREADSHEET_ID} mancante: gli scenari articolazione richiedono un MASTER E2E esistente`
    );
  }

  const master = readMasterConfig(masterSpreadsheetId);
  if (!master.testMode) {
    throw new ConfigurationError(
      'Gli scenari articolazione rifiutano un MASTER con TEST_MODE diverso da true.'
    );
  }

  const container = initAldoFn(clock(), properties);
  const sampleSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`;
  const sample = {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: '',
    priorSampleSpreadsheetUrl: '',
    priorSampleSpreadsheetId2: '',
    priorSampleSpreadsheetUrl2: '',
    logFoldFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    jobRunnerDocConfigId: '',
    masterTestMode: master.testMode,
    staticAttachmentFileId: '',
    testMode: master.testMode
  };

  const runner = new TestRunner();
  registerArticolazioneChecks(runner, container, sample);
  const report = runner.report();
  log(JSON.stringify(report));
  return report;
}

/**
 * Orchestration entry point (design spec §2): builds a throwaway sample SGSA database (B2/B3),
 * records the generated fixture ID in the test-only property (never silently discarding whatever value
 * was already there), boots a real ALDO container over it via `initAldo()`, and runs every
 * registered check group (B4 repositories, B5 context engine + document/email pipeline) against
 * one shared {@link TestRunner}.
 *
 * Deliberately touches no native GAS global directly: every native-adjacent operation goes through
 * an {@link OnlineTestDeps} field, each defaulting to the real `GoogleApiWrapper`-backed
 * implementation (`GasSampleSpreadsheetFactory`, `DriveServiceFacade`, `ScriptPropertiesFacade`,
 * the real `initAldo`, `SessionActiveUserFacade`) only when the caller does not override it.
 */
export function executeOnlineTests(overrides: Partial<OnlineTestDeps> = {}): OnlineTestReport {
  const clock = overrides.clock ?? ((): Date => new Date());
  // `DriveServiceFacade`'s `rootFolderId` anchors every relative path (see its class doc comment)
  // and is documented as normally being an already-existing `MasterConfig.idCartellaRoot` — there
  // is no such root yet at this bootstrap step, since this is what resolves the persistent root
  // folder for the whole online-test run. Fixed name + `testContext.getOrCreateNamedFolder` (ref
  // ALDO_GLF_AUDIT_RESULTS.md K-1) reuses the SAME folder across runs instead of minting a fresh,
  // never-deleted one every time (the previous per-run-timestamped-name behaviour).
  const rootFolder = overrides.spreadsheetFactory === undefined ? mintRootFolder() : null;
  const spreadsheetFactory =
    overrides.spreadsheetFactory ?? new GasSampleSpreadsheetFactory(rootFolder);
  const drive =
    overrides.drive ??
    new DriveServiceFacade(
      ServiceFactory.getDriveService(),
      ServiceFactory.getPermissionService(),
      (rootFolder as NonNullable<typeof rootFolder>).getId()
    );
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const initAldoFn = overrides.initAldo ?? initAldo;
  const activeUserEmail =
    overrides.activeUserEmail ?? ((): string => new SessionActiveUserFacade().getEmail());
  const log =
    overrides.log ?? ((message: string): void => ServiceFactory.getLogger().info(message));

  const sample = new SampleDatabaseBuilder(spreadsheetFactory, drive).build();

  const previousMasterId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID);
  if (previousMasterId !== null && previousMasterId.trim() !== '') {
    log(`Previous MASTER_SPREADSHEET_ID before online-test override: ${previousMasterId}`);
  }
  properties.set(PROP_ONLINETEST_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);

  const container = initAldoFn(clock(), properties);

  const runner = new TestRunner();
  registerRepositoryChecks(runner, container, sample);
  registerContextEngineChecks(runner, container, sample);
  registerPipelineChecks(runner, container, sample, activeUserEmail());

  return runner.report();
}

const ONLINETEST_ROOT_FOLDER_NAME = '_ALDO_ONLINETEST_ROOT';

/**
 * Resolves the persistent root Drive folder for online-test runs via
 * `GasOnlineTestFramework.testContext.getOrCreateNamedFolder` (ref ALDO_GLF_AUDIT_RESULTS.md K-1):
 * a fixed name reused across runs, instead of the previous per-run-timestamped `DriveService
 * .createFolder` call that minted (and never cleaned up) a brand-new folder every time. Legitimate
 * per the `GasOnlineTestFramework/**` "runs inside real GAS by design" sanctioned exception in
 * `GasLibraryFactory/CLAUDE.md` — `src/onlinetests/**` only ever executes inside a live online-test
 * run, never the production request path — so this needs no eslint scoping exception, same as
 * {@link GasSampleSpreadsheetFactory}.
 */
function mintRootFolder(): GoogleAppsScript.Drive.Folder {
  return testContext.getOrCreateNamedFolder(
    ONLINETEST_ROOT_FOLDER_NAME
  ) as GoogleAppsScript.Drive.Folder;
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

/** GAS Run-dropdown entry point (design spec §2): defaults run with no setup. */
export function runOnlineTests(
  execute: () => OnlineTestReport = executeOnlineTests,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('online_tests', 'ONLINE_TEST_SUITE', execute, logger);
}

/**
 * GAS Run-dropdown entry point for the online-coverage spike (docs/superpowers/specs/
 * 2026-07-26-test-completion-coverage-index-design.md §3.5): logs whatever istanbul coverage map
 * `babel-plugin-istanbul` attached to `globalThis.__coverage__` while this bundle ran. Empty
 * object when the bundle wasn't built with instrumentation enabled (i.e. any mode other than
 * `--mode=online` after the webpack.config.cjs instrumentation change).
 */
export function dumpOnlineCoverage(): void {
  const coverage = (globalThis as { __coverage__?: unknown }).__coverage__ ?? {};
  ServiceFactory.getLogger().info(JSON.stringify(coverage));
}

export interface E2eTestDeps {
  spreadsheetFactory: ISampleSpreadsheetFactory;
  artifactFactory: IArtifactFactory;
  drive: IDriveFacade;
  clock: () => Date;
  properties: IPropertiesFacade;
  resetAldo: () => void;
  initAldo: (now?: Date, props?: IPropertiesFacade) => ServiceContainer;
  log: (message: string) => void;
}

const E2E_ROOT_FOLDER_NAME = '_ALDO_E2E_ROOT';

function mintE2eRootFolder(): GoogleAppsScript.Drive.Folder {
  return testContext.getOrCreateNamedFolder(E2E_ROOT_FOLDER_NAME) as GoogleAppsScript.Drive.Folder;
}

/**
 * Orchestration entry point for the e2e scenarios (design spec
 * `2026-07-21-testonline-mock-db-e2e-design.md`): provisions the real Drive artifacts,
 * builds the larger persistent mock database against them, points
 * the test-only fixture property at its MASTER sheet (previous value logged, never discarded),
 * boots a real ALDO container (which — via `initAldo`'s TEST_MODE wiring — auto-enables
 * `EmailNotificationService` test mode from the mock MASTER's `TEST_MODE=true`), and runs
 * `registerE2eScenarioChecks`. Deliberately a SEPARATE top-level entry point from
 * `executeOnlineTests` — different master pointer, unrelated failure semantics, either can
 * run alone (design spec "New checks").
 */
export function executeE2eScenarios(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const configuredMasterSpreadsheetId = properties
    .get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)
    ?.trim();
  const masterSpreadsheetId =
    configuredMasterSpreadsheetId === undefined || configuredMasterSpreadsheetId === ''
      ? ServiceFactory.getSpreadsheetService().getActiveStandard().getId()
      : configuredMasterSpreadsheetId;

  const clock = overrides.clock ?? ((): Date => new Date());
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
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const log =
    overrides.log ?? ((message: string): void => ServiceFactory.getLogger().info(message));

  const master = spreadsheetFactory.openExistingSpreadsheet(masterSpreadsheetId);
  const templateFolderId = drive.createFolder('_ALDO_E2E_TEMPLATES');
  const templateIds: E2eTemplateIds = new E2eTemplateProvisioner(artifactFactory, drive).provision(
    templateFolderId
  );
  const sample = new SharedTestDatabaseBuilder(
    spreadsheetFactory,
    drive,
    artifactFactory
  ).build(templateIds, master);

  log(`Previous MASTER_SPREADSHEET_ID before e2e-scenario override: ${masterSpreadsheetId}`);
  properties.set(PROP_ONLINETEST_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);

  resetAldoFn();
  const container = initAldoFn(clock(), properties);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);

  const runner = new TestRunner();
  registerEffectiveAssignmentMatrixChecks(runner, container, sample);
  registerEffectiveAssignmentConsumerChecks(runner, container, sample);
  registerE2eScenarioChecks(runner, container, { ...sample, testMode: sample.masterTestMode });

  return runner.report();
}

/** GAS Run-dropdown entry point: defaults run with no setup. */
export function runE2eScenarios(
  execute: () => OnlineTestReport = executeE2eScenarios,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('e2e_scenarios', 'E2E_SCENARIO_SUITE', execute, logger);
}

/** GAS Run-dropdown entry point for the already-provisioned articulation fixture. */
export function runArticolazioneScenarios(): void {
  executeArticolazioneScenarios();
}

function nonImplementato(): never {
  throw new ConfigurationError('non implementato');
}

export function creaDatiMockDrive(): unknown {
  return nonImplementato();
}

export function testDocumentiStandard(): OnlineTestReport {
  return nonImplementato();
}

export function testDocumentiArticolati(): OnlineTestReport {
  return nonImplementato();
}

export function testDocumentiTabelleImportate(): OnlineTestReport {
  return nonImplementato();
}

export function testDuplicazioneDocumenti(): OnlineTestReport {
  return nonImplementato();
}

export function testInvioEmail(): OnlineTestReport {
  return nonImplementato();
}

export function testEmailSicurezza(): OnlineTestReport {
  return nonImplementato();
}

export function testJobRunnerDocGen(): OnlineTestReport {
  return nonImplementato();
}

export function testJobRunnerEmail(): OnlineTestReport {
  return nonImplementato();
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

export function runFullOnlineTests(): OnlineTestReport {
  return nonImplementato();
}
