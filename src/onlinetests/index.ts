import type { ServiceContainer } from '../config/ServiceContainer';
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { DriveServiceFacade } from '../infrastructure/facades/DriveServiceFacade';
import { ScriptPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { SessionActiveUserFacade } from '../infrastructure/facades/ActiveUserFacade';
import { initAldo, PROP_MASTER_SPREADSHEET_ID } from '../config/Bootstrap';
import { TestRunner, type OnlineTestReport } from './OnlineTestReport';
import { SampleDatabaseBuilder, type ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';
import { GasSampleSpreadsheetFactory } from './GasSampleSpreadsheetFactory';
import { registerRepositoryChecks } from './checks/repositoryChecks';
import { registerContextEngineChecks } from './checks/contextEngineChecks';
import { registerPipelineChecks } from './checks/pipelineChecks';

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
