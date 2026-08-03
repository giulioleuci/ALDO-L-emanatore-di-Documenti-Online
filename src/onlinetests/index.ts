import type { ServiceContainer } from '../config/ServiceContainer';
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { DriveServiceFacade } from '../infrastructure/facades/DriveServiceFacade';
import { ScriptPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { SessionActiveUserFacade } from '../infrastructure/facades/ActiveUserFacade';
import { initAldo, PROP_MASTER_SPREADSHEET_ID } from '../config/Bootstrap';
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
import { E2eSampleDatabaseBuilder, type E2eTemplateIds } from './E2eSampleDatabaseBuilder';
import { E2eTemplateProvisioner, type IArtifactFactory } from './E2eTemplateProvisioner';
import { GasArtifactFactory } from './GasArtifactFactory';
import { registerE2eScenarioChecks } from './checks/e2eScenarioChecks';
import { registerArticolazioneChecks } from './checks/articolazioneChecks';
import { e2eActiveRepresentativesInterceptor } from './E2eActiveRepresentativesInterceptor';
import type { ContextBuilder } from '../application/context-engine/ContextBuilder';

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
  /** Logging seam for the "previous MASTER_SPREADSHEET_ID" notice — NOT `Logger.log` itself (that
   * native call is reserved for {@link runOnlineTests}'s own top-level report dump, per design). */
  log: (message: string) => void;
}

/**
 * Orchestration entry point (design spec §2): builds a throwaway sample SGSA database (B2/B3),
 * points `PROP_MASTER_SPREADSHEET_ID` at it (recording, never silently discarding, whatever value
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

  const previousMasterId = properties.get(PROP_MASTER_SPREADSHEET_ID);
  if (previousMasterId !== null && previousMasterId.trim() !== '') {
    log(`Previous MASTER_SPREADSHEET_ID before online-test override: ${previousMasterId}`);
  }
  properties.set(PROP_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);

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

/** GAS Run-dropdown entry point (design spec §2): no arguments, so it runs with no setup. */
export function runOnlineTests(): void {
  const report = executeOnlineTests();
  Logger.log(JSON.stringify(report));
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).runOnlineTests = runOnlineTests;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

/**
 * GAS Run-dropdown entry point for the online-coverage spike (docs/superpowers/specs/
 * 2026-07-26-test-completion-coverage-index-design.md §3.5): logs whatever istanbul coverage map
 * `babel-plugin-istanbul` attached to `globalThis.__coverage__` while this bundle ran. Empty
 * object when the bundle wasn't built with instrumentation enabled (i.e. any mode other than
 * `--mode=online` after the webpack.config.cjs instrumentation change).
 */
export function dumpOnlineCoverage(): void {
  const coverage = (globalThis as { __coverage__?: unknown }).__coverage__ ?? {};
  Logger.log(JSON.stringify(coverage));
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).dumpOnlineCoverage = dumpOnlineCoverage;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

export interface E2eTestDeps {
  spreadsheetFactory: ISampleSpreadsheetFactory;
  artifactFactory: IArtifactFactory;
  drive: IDriveFacade;
  clock: () => Date;
  properties: IPropertiesFacade;
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
 * `PROP_MASTER_SPREADSHEET_ID` at its MASTER sheet (previous value logged, never discarded),
 * boots a real ALDO container (which — via `initAldo`'s TEST_MODE wiring — auto-enables
 * `EmailNotificationService` test mode from the mock MASTER's `TEST_MODE=true`), and runs
 * `registerE2eScenarioChecks`. Deliberately a SEPARATE top-level entry point from
 * `executeOnlineTests` — different master pointer, unrelated failure semantics, either can
 * run alone (design spec "New checks").
 */
export function executeE2eScenarios(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
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
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const initAldoFn = overrides.initAldo ?? initAldo;
  const log =
    overrides.log ?? ((message: string): void => ServiceFactory.getLogger().info(message));

  const templateFolderId = drive.createFolder('_ALDO_E2E_TEMPLATES');
  const templateIds: E2eTemplateIds = new E2eTemplateProvisioner(artifactFactory, drive).provision(
    templateFolderId
  );
  const sample = new E2eSampleDatabaseBuilder(spreadsheetFactory, drive).build(templateIds);

  const previousMasterId = properties.get(PROP_MASTER_SPREADSHEET_ID);
  if (previousMasterId !== null && previousMasterId.trim() !== '') {
    log(`Previous MASTER_SPREADSHEET_ID before e2e-scenario override: ${previousMasterId}`);
  }
  properties.set(PROP_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);

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

/** GAS Run-dropdown entry point: no arguments, so it runs with no setup. */
export function runE2eScenarios(): void {
  const report = executeE2eScenarios();
  Logger.log(JSON.stringify(report));
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).runE2eScenarios = runE2eScenarios;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

/**
 * Seams for the read-only articulation suite. Unlike {@link E2eTestDeps}, this
 * entry point deliberately has no factories for spreadsheets, Drive artifacts,
 * or the E2E fixture: it is intended to run against the MASTER already selected
 * in ScriptProperties.
 */
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

/** Reads the currently selected MASTER through the same repository and SheetDB adapter as Bootstrap. */
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

/**
 * Read-only verification entry point for the persisted articulated E2E fixture.
 * It refuses an absent or non-test MASTER before bootstrapping ALDO, and never
 * provisions or mutates an E2E database.
 */
export function executeArticolazioneScenarios(
  overrides: Partial<ArticolazioneTestDeps> = {}
): OnlineTestReport {
  const clock = overrides.clock ?? ((): Date => new Date());
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const initAldoFn = overrides.initAldo ?? initAldo;
  const readMasterConfig = overrides.readMasterConfig ?? readCurrentMasterConfig;
  const log =
    overrides.log ?? ((message: string): void => ServiceFactory.getLogger().info(message));
  const masterSpreadsheetId = properties.get(PROP_MASTER_SPREADSHEET_ID);

  if (masterSpreadsheetId === null || masterSpreadsheetId.trim() === '') {
    throw new ConfigurationError(
      `ScriptProperties.${PROP_MASTER_SPREADSHEET_ID} mancante: gli scenari articolazione richiedono un MASTER E2E esistente`
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

/** GAS Run-dropdown entry point for the already-provisioned articulation fixture. */
export function runArticolazioneScenarios(): void {
  executeArticolazioneScenarios();
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).runArticolazioneScenarios = runArticolazioneScenarios;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
