import type { ContextBuilder } from '../application/context-engine/ContextBuilder';
import { initAldo, resetAldo } from '../config/Bootstrap';
import type { ServiceContainer } from '../config/ServiceContainer';
import { TABLE, COL_CONF_MAIL, COL_LOG_DOCS, COL_MATERIE } from '../config/schema';
import { ConfigurationError } from '../domain/errors/DomainError';
import { MasterSheetRepository } from '../infrastructure/repositories/MasterSheetRepository';
import { SheetDbAdapter } from '../infrastructure/db/SheetDbAdapter';
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import { DriveServiceFacade } from '../infrastructure/facades/DriveServiceFacade';
import {
  SessionActiveUserFacade,
  type IActiveUserFacade
} from '../infrastructure/facades/ActiveUserFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { ScriptPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { e2eActiveRepresentativesInterceptor } from './E2eActiveRepresentativesInterceptor';
import { GasArtifactFactory } from './GasArtifactFactory';
import { GasSampleSpreadsheetFactory } from './GasSampleSpreadsheetFactory';
import { E2eTemplateProvisioner, type IArtifactFactory } from './E2eTemplateProvisioner';
import { registerArticolazioneChecks } from './checks/articolazioneChecks';
import { registerItpDottedChecks } from './checks/itpDottedChecks';
import { registerSupplenzeRuoliChecks } from './checks/supplenzeRuoliChecks';
import { registerAclRealiChecks } from './checks/aclRealiChecks';
import {
  registerCacheIsolamentoChecks,
  type CacheIsolationDeps
} from './checks/cacheIsolamentoChecks';
import { registerPermessiChecks } from './checks/permessiChecks';
import { registerProcessMonitorChecks } from './checks/processMonitorChecks';
import { registerDocumentiChecks, type DocumentiCheckScope } from './checks/documentiChecks';
import { registerEmailChecks } from './checks/emailChecks';
import {
  registerImportCartelleClasseChecks,
  registerImportCercaDocumentiChecks,
  registerImportChecks,
  registerImportChunkedChecks,
  registerImportFileSingoloChecks,
  registerImportPolicyChecks
} from './checks/importChecks';
import {
  registerJobRunnerChecks,
  registerJobRunnerDocGenChecks,
  registerJobRunnerEmailChecks,
  registerJobRunnerTriggerRealeCheck
} from './checks/jobRunnerChecks';
import {
  registerContextEngineChecks,
  registerEffectiveAssignmentConsumerChecks
} from './checks/contextEngineChecks';
import {
  registerEffectiveAssignmentMatrixChecks,
  registerRepositoryChecks
} from './checks/repositoryChecks';
import { registerStoricoChecks, type StoricoCheckScope } from './checks/storicoChecks';
import { TestRunner, type OnlineTestReport } from './report/OnlineTestReport';
import type { ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';
import {
  SharedTestDatabaseBuilder,
  buildMaterieRows,
  CONF_MAIL_STATIC_ALLEGATO,
  type E2eTemplateIds,
  type SharedTestDatabase
} from './data/SharedTestDatabaseBuilder';
import { CONF_DOC_JOBRUNNER } from './data/fixtures';

/** Test-only fixture pointer; production startup always uses its bound spreadsheet. */
export const PROP_ONLINETEST_MASTER_SPREADSHEET_ID = 'MASTER_SPREADSHEET_ID';
/** Master fixture dedicated to proving Script Cache keys stay spreadsheet-scoped. */
export const PROP_ONLINETEST_CACHE_ISOLATED_MASTER_SPREADSHEET_ID =
  'CACHE_ISOLATED_MASTER_SPREADSHEET_ID';
/** Schema/artifact version of the fixture selected by the E2E master pointer. */
export const PROP_ONLINETEST_FIXTURE_VERSION = 'ALDO_ONLINETEST_FIXTURE_VERSION';
/** Real non-Sheets artifact used by the CERCA_DOCUMENTI fail-soft sentinel. */
export const PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID =
  'ALDO_ONLINETEST_STATIC_ATTACHMENT_FILE_ID';
const REQUIRED_ONLINETEST_FIXTURE_VERSION = 3;

interface FixtureSpreadsheetService {
  getRanges(spreadsheetId: string, range: string): unknown[][];
  deleteColumn(spreadsheetId: string, sheetName: string, columnIndex: number): unknown;
}

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
    masterSpreadsheetId?: string,
    driveNotifyOnShare?: boolean
  ) => ServiceContainer;
  log: (message: string) => void;
  activeUser: IActiveUserFacade;
}

function resolveTestRecipient(activeUser: IActiveUserFacade): string {
  const testRecipient = activeUser.getEmail().trim();
  if (testRecipient === '') {
    throw new ConfigurationError('Destinatario TEST_MODE Workspace non disponibile.');
  }
  return testRecipient;
}

export type FullOnlineTestSample = SharedTestDatabase & { testMode: boolean };

const GOOGLE_SHEETS_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';

interface PersistedSampleReaderDeps {
  readMasterConfig: typeof readCurrentMasterConfig;
  driveService: Pick<DriveService, 'getFiles'>;
}

function staticAttachmentConfigurationError(reason: string): ConfigurationError {
  return new ConfigurationError(
    `Allegato statico E2E ${reason}; riesegui creaDatiMockDrive(true).`
  );
}

/** Validates the exact strict Drive metadata contract required by CERCA_DOCUMENTI. */
export function validateStaticAttachmentFileId(
  candidate: string,
  driveService: Pick<DriveService, 'getFiles'> = ServiceFactory.getDriveService()
): string {
  const fileId = candidate.trim();
  if (fileId === '') throw staticAttachmentConfigurationError('mancante');

  let file: DriveFileMetadata;
  try {
    file = driveService.getFiles(fileId, { fields: 'id,mimeType', strict: true });
  } catch {
    throw staticAttachmentConfigurationError(`non accessibile (${fileId})`);
  }
  if (file === null || file.id !== fileId || typeof file.mimeType !== 'string') {
    throw staticAttachmentConfigurationError(`non valido (${fileId})`);
  }
  if (file.mimeType === GOOGLE_SHEETS_MIME_TYPE) {
    throw staticAttachmentConfigurationError(`non può essere un foglio Google (${fileId})`);
  }
  return fileId;
}

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

type RegisterCacheIsolationChecks = (
  runner: TestRunner,
  container: ServiceContainer,
  sample: FullOnlineTestSample,
  deps: CacheIsolationDeps
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
  cacheIsolamento: RegisterCacheIsolationChecks;
  permessi: RegisterSharedChecks;
  processMonitor: RegisterSharedChecks;
}

/** Injectable seams beyond reading the persisted dataset, kept separate from the real-GAS defaults. */
export interface FullOnlineTestDeps extends E2eTestDeps {
  readSample: (properties: IPropertiesFacade) => SharedTestDatabase;
  registrations: Partial<FullOnlineTestRegistrations>;
  spreadsheetService: FixtureSpreadsheetService;
  staticAttachmentDriveService: Pick<DriveService, 'getFiles'>;
  /** Injection seam for the pre-batch-1 purge (see `executeOnlineTestsBatch1`). */
  resetHistory: (overrides: Partial<FullOnlineTestDeps>) => ResetE2eHistoryTablesResult;
}

const registerLegacyDocumentiChecks: RegisterSharedChecks = (runner, container, sample) => {
  registerRepositoryChecks(runner, container, sample);
  registerContextEngineChecks(runner, container, sample);
  registerDocumentiChecks(runner, container, sample, 'all');
};

/** Composes the four independent CONF_IMP scenario groups into the aggregate 'import' bucket. */
const registerLegacyImportChecks: RegisterSharedChecks = (runner, container, sample) => {
  registerImportChecks(runner, container, sample);
  registerImportCartelleClasseChecks(runner, container, sample);
  registerImportCercaDocumentiChecks(runner, container, sample);
  registerImportChunkedChecks(runner, container, sample);
};

/**
 * Composes the existing import-policy checks (Task 16 pre-flight decision:
 * conflict-policy coverage lives under `testImportCercaDocumenti`, no
 * separate `testImportPolicy` launcher) with the real CERCA_DOCUMENTI
 * strategy checks (Task 18) for the standalone launcher below.
 */
const registerImportCercaDocumentiLauncherChecks: RegisterSharedChecks = (
  runner,
  container,
  sample
) => {
  registerImportPolicyChecks(runner, container, sample);
  registerImportCercaDocumentiChecks(runner, container, sample);
};

/** Keeps the full effective-assignment matrix/consumer coverage and appends Task 22 cases. */
const registerSupplenzeRuoliScenarioChecks: RegisterSharedChecks = (runner, container, sample) => {
  registerEffectiveAssignmentMatrixChecks(runner, container, sample);
  registerEffectiveAssignmentConsumerChecks(runner, container, sample);
  registerSupplenzeRuoliChecks(runner, container, sample);
};

const futureScenarioRegistrations: FullOnlineTestRegistrations = {
  documenti: registerLegacyDocumentiChecks,
  email: registerEmailChecks,
  jobRunner: registerJobRunnerChecks,
  import: registerLegacyImportChecks,
  storico: registerStoricoChecks,
  articolazione: registerArticolazioneChecks,
  itpDotted: registerItpDottedChecks,
  supplenzeRuoli: registerSupplenzeRuoliScenarioChecks,
  aclReali: registerAclRealiChecks,
  cacheIsolamento: registerCacheIsolamentoChecks,
  permessi: registerPermessiChecks,
  processMonitor: registerProcessMonitorChecks
};

const E2E_ROOT_FOLDER_NAME = '_ALDO_E2E_ROOT';

function readCurrentMasterConfig(masterId: string): {
  idSpreadsheet: string;
  idCartellaRoot: string;
  testMode: boolean;
  historicalSpreadsheetIds: string[];
  historicalSpreadsheetUrls: string[];
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
  const repository = new MasterSheetRepository(masterDb);
  const current = repository.findConfigAnnoCorrente();
  const historical = repository.findAnniStorici(2);
  return {
    ...current,
    historicalSpreadsheetIds: historical.map((config) => config.idSpreadsheet),
    historicalSpreadsheetUrls: historicalSpreadsheetUrls(historical)
  };
}

/** Stable artifact links for persisted historical MASTER rows. */
export function historicalSpreadsheetUrls(configs: Array<{ idSpreadsheet: string }>): string[] {
  return configs.map((config) => `https://docs.google.com/spreadsheets/d/${config.idSpreadsheet}`);
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
  const cacheIsolationMaster = spreadsheetFactory.createSpreadsheet(
    '_ALDO_E2E_CACHE_ISOLATED_MASTER'
  );
  const cacheIsolation = new SharedTestDatabaseBuilder(
    spreadsheetFactory,
    drive,
    artifactFactory
  ).buildCacheIsolationFixture(templateIds, cacheIsolationMaster);

  properties.set(PROP_ONLINETEST_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);
  properties.set(PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID, sample.staticAttachmentFileId);
  properties.set(
    PROP_ONLINETEST_CACHE_ISOLATED_MASTER_SPREADSHEET_ID,
    cacheIsolation.masterSpreadsheetId
  );
  return sample;
}

/**
 * Reads the E2E dataset provisioned by a prior `creaDatiMockDrive` run and registers scenario
 * groups in their stable execution order. Never re-provisions: `creaDatiMockDrive` is a long,
 * expensive step kept as its own launcher precisely so the full suite can be re-run cheaply
 * against the same fixture. Injection keeps the composition testable without touching real GAS
 * services.
 */
export function readPersistedFullOnlineTestSample(
  properties: IPropertiesFacade,
  deps: Partial<PersistedSampleReaderDeps> = {},
  allowMissingStaticAttachment = false
): SharedTestDatabase {
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  if (masterSpreadsheetId === undefined || masterSpreadsheetId === '') {
    throw new ConfigurationError('Dataset online non disponibile: esegui prima creaDatiMockDrive.');
  }
  const master = (deps.readMasterConfig ?? readCurrentMasterConfig)(masterSpreadsheetId);
  if (master.historicalSpreadsheetIds.length < 2) {
    throw new ConfigurationError(
      'Dataset online incompleto: servono due database storici; riesegui creaDatiMockDrive.'
    );
  }
  const configuredStaticAttachmentFileId = properties
    .get(PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID)
    ?.trim();
  const staticAttachmentFileId =
    configuredStaticAttachmentFileId === undefined || configuredStaticAttachmentFileId === ''
      ? ''
      : validateStaticAttachmentFileId(
          configuredStaticAttachmentFileId,
          deps.driveService ?? ServiceFactory.getDriveService()
        );
  if (staticAttachmentFileId === '' && !allowMissingStaticAttachment) {
    throw staticAttachmentConfigurationError('mancante');
  }
  return {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: master.historicalSpreadsheetIds[0]!,
    priorSampleSpreadsheetUrl: master.historicalSpreadsheetUrls[0]!,
    priorSampleSpreadsheetId2: master.historicalSpreadsheetIds[1]!,
    priorSampleSpreadsheetUrl2: master.historicalSpreadsheetUrls[1]!,
    logFoldFolderUrl: '',
    jobRunnerDocConfigId: CONF_DOC_JOBRUNNER,
    masterTestMode: master.testMode,
    staticAttachmentFileId
  };
}

/** Registration order of the aggregate suite; batches below are subsets of this list. */
const ALL_ONLINE_TEST_GROUPS: ReadonlyArray<keyof FullOnlineTestRegistrations> = [
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
  'permessi',
  'processMonitor'
];

interface PersistedE2eFixtureMigrationResult {
  previousVersion: number;
  version: number;
  insertedMaterie: string[];
  deletedAslColumn: boolean;
}

function readFixtureVersion(properties: IPropertiesFacade): number {
  const raw = properties.get(PROP_ONLINETEST_FIXTURE_VERSION)?.trim();
  if (raw === undefined || raw === '') return 0;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 0) {
    throw new ConfigurationError(`Versione fixture E2E non valida: ${raw}.`);
  }
  if (version > REQUIRED_ONLINETEST_FIXTURE_VERSION) {
    throw new ConfigurationError(
      `Versione fixture E2E ${version} più recente di quella supportata (${REQUIRED_ONLINETEST_FIXTURE_VERSION}).`
    );
  }
  return version;
}

function missingCanonicalMaterie(db: SheetDbAdapter): ReturnType<typeof buildMaterieRows> {
  const existingIds = new Set(
    db
      .table(TABLE.MATERIE)
      .findAll()
      .map((row) => String(row[COL_MATERIE.ID]))
  );
  return buildMaterieRows().filter((row) => !existingIds.has(String(row[COL_MATERIE.ID])));
}

function readPhysicalAslHeader(
  spreadsheetService: FixtureSpreadsheetService,
  spreadsheetId: string
): string[] {
  const values = spreadsheetService.getRanges(spreadsheetId, 'ASL!1:1');
  return (values[0] ?? []).map((value) => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
    return '';
  });
}

function matchingHeaderIndices(header: string[], target: string): number[] {
  const indices: number[] = [];
  header.forEach((value, index) => {
    if (value === target) indices.push(index + 1);
  });
  return indices;
}

/**
 * Reconciles the versioned persisted E2E fixture through a temporary ALDO container.
 * The reconciliation is an idempotent repair, not a one-shot upgrade: the ASL imports
 * recreate `ASL.DATA_MODIFICA` on every run (the library passes unmapped source columns
 * through), so gating the repair on a version change left the fixture dirty for the next
 * run. It never purges append-only history; callers must reset ALDO and build their final
 * consumer container after this function returns.
 */
function migrateResolvedPersistedE2eFixture(
  sample: SharedTestDatabase,
  properties: IPropertiesFacade,
  overrides: Partial<FullOnlineTestDeps>
): PersistedE2eFixtureMigrationResult {
  const previousVersion = readFixtureVersion(properties);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());
  const spreadsheetService = overrides.spreadsheetService ?? ServiceFactory.getSpreadsheetService();

  resetAldoFn();
  const migrationContainer = initAldoFn(clock(), properties, sample.masterSpreadsheetId, true);
  const db = migrationContainer.get<SheetDbAdapter>('db');
  const persistedStaticAttachmentFileId = properties
    .get(PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID)
    ?.trim();
  let repairedStaticAttachmentFileId: string | null = null;
  if (persistedStaticAttachmentFileId === undefined || persistedStaticAttachmentFileId === '') {
    const configuredAttachments = db
      .table(TABLE.CONF_MAIL)
      .find((row) => row[COL_CONF_MAIL.ID] === CONF_MAIL_STATIC_ALLEGATO)?.[COL_CONF_MAIL.ALLEGATI_STATICI];
    let configuredStaticAttachmentFileId = '';
    if (typeof configuredAttachments === 'string') {
      try {
        const parsed: unknown = JSON.parse(configuredAttachments);
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
          configuredStaticAttachmentFileId = parsed[0].trim();
        }
      } catch {
        configuredStaticAttachmentFileId = '';
      }
    }
    const recoveredStaticAttachmentFileId = validateStaticAttachmentFileId(
      configuredStaticAttachmentFileId,
      overrides.staticAttachmentDriveService ?? ServiceFactory.getDriveService()
    );
    sample.staticAttachmentFileId = recoveredStaticAttachmentFileId;
    repairedStaticAttachmentFileId = recoveredStaticAttachmentFileId;
  }
  const missingMaterie = missingCanonicalMaterie(db);
  const initialHeader = readPhysicalAslHeader(spreadsheetService, sample.sampleSpreadsheetId);
  const initialMatches = matchingHeaderIndices(initialHeader, 'DATA_MODIFICA');

  if (initialMatches.length > 1) {
    throw new ConfigurationError(
      `Migrazione fixture E2E ASL: DATA_MODIFICA compare ${initialMatches.length} volte; nessuna colonna eliminata.`
    );
  }

  let deletedAslColumn = false;
  if (initialMatches.length === 1) {
    const columnIndex = initialMatches[0]!;
    const revalidatedHeader = readPhysicalAslHeader(spreadsheetService, sample.sampleSpreadsheetId);
    const revalidatedMatches = matchingHeaderIndices(revalidatedHeader, 'DATA_MODIFICA');
    const unchanged =
      revalidatedHeader.length === initialHeader.length &&
      revalidatedHeader.every((value, index) => value === initialHeader[index]);
    if (!unchanged || revalidatedMatches.length !== 1 || revalidatedMatches[0] !== columnIndex) {
      throw new ConfigurationError(
        'Migrazione fixture E2E ASL: intestazione cambiata durante la validazione; nessuna colonna eliminata.'
      );
    }
    spreadsheetService.deleteColumn(sample.sampleSpreadsheetId, TABLE.ASL, columnIndex);
    deletedAslColumn = true;
  }

  const insertedMaterie: string[] = [];
  for (const row of missingMaterie) {
    db.table(TABLE.MATERIE).insert(row);
    insertedMaterie.push(String(row[COL_MATERIE.ID]));
  }
  if (insertedMaterie.length > 0) db.save();

  if (repairedStaticAttachmentFileId !== null) {
    properties.set(PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID, repairedStaticAttachmentFileId);
  }
  // Only touch the version property when something actually changed — the ASL imports
  // recreate DATA_MODIFICA on every run, so this repair runs unconditionally even at the
  // required version, but a no-op run at the required version must stay a true no-op.
  const repaired =
    previousVersion !== REQUIRED_ONLINETEST_FIXTURE_VERSION ||
    insertedMaterie.length > 0 ||
    deletedAslColumn;
  if (repaired) {
    properties.set(PROP_ONLINETEST_FIXTURE_VERSION, String(REQUIRED_ONLINETEST_FIXTURE_VERSION));
  }
  return {
    previousVersion,
    version: REQUIRED_ONLINETEST_FIXTURE_VERSION,
    insertedMaterie,
    deletedAslColumn
  };
}

/**
 * Reconciles the versioned persisted E2E fixture through a temporary ALDO container. It never
 * purges append-only history; callers must reset ALDO and build their final consumer container
 * after this function returns.
 */
export function migratePersistedE2eFixture(
  overrides: Partial<FullOnlineTestDeps> = {}
): PersistedE2eFixtureMigrationResult {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const readSample =
    overrides.readSample ?? ((props: IPropertiesFacade) => readPersistedFullOnlineTestSample(props, {}, true));
  return migrateResolvedPersistedE2eFixture(readSample(properties), properties, overrides);
}

/**
 * Shared body of the aggregate runner and of every batch launcher: reads the persisted fixture,
 * migrates it before consumer snapshots, re-initialises Aldo and registers exactly the requested
 * scenario groups. It deliberately does not purge history because later batches consume earlier
 * batches' artifacts.
 * `cacheIsolationDeps` is resolved lazily so batches without `cacheIsolamento` never require the
 * second master fixture.
 */
function executeOnlineTestsBatch(
  groups: ReadonlyArray<keyof FullOnlineTestRegistrations>,
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const readSample =
    overrides.readSample ?? ((props: IPropertiesFacade) => readPersistedFullOnlineTestSample(props, {}, true));
  const sample = readSample(properties);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());
  const registrations = { ...futureScenarioRegistrations, ...overrides.registrations };
  const requiresTestRecipient = groups.some((key) => key === 'email' || key === 'jobRunner');
  const testRecipient = requiresTestRecipient
    ? resolveTestRecipient(overrides.activeUser ?? new SessionActiveUserFacade())
    : '';

  migrateResolvedPersistedE2eFixture(sample, properties, overrides);
  resetAldoFn();
  const container = initAldoFn(clock(), properties, sample.masterSpreadsheetId, true);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);

  const runner = new TestRunner();
  const testSample: FullOnlineTestSample = { ...sample, testMode: sample.masterTestMode };
  for (const key of groups) {
    if (key === 'email' || key === 'jobRunner') {
      registrations[key](runner, container, testSample, testRecipient);
    } else if (key === 'cacheIsolamento') {
      registrations.cacheIsolamento(
        runner,
        container,
        testSample,
        cacheIsolationDeps(properties, overrides)
      );
    } else {
      registrations[key](runner, container, testSample);
    }
  }
  return runner.report();
}

export function executeFullOnlineTests(
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  return executeOnlineTestsBatch(ALL_ONLINE_TEST_GROUPS, overrides);
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
 * Batch launchers: same coverage as `runFullOnlineTests`, split to stay inside the 30-minute GAS
 * execution limit. Run them in order 1 → 2 → 3 → 4 against the same `creaDatiMockDrive` fixture:
 * batches 2–4 assert on LOG_DOCS/LOG_FOLD/LOG_MAIL rows that batch 1 produces. Batch 1 owns the
 * history purge, so there is no separate reset step to sequence by hand.
 */
export function executeOnlineTestsBatch1(
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  // ORDER MATTERS. Running `resetE2eHistoryTables` between batch 1 and batch 2 purges the
  // LOG_DOCS rows every CONF_MAIL `documenti` box and the articolazione assertions read —
  // six batch-2 failures in the 2026-08-21 run. Owning the purge here makes that unforgeable.
  (overrides.resetHistory ?? resetE2eHistoryTables)(overrides);
  return executeOnlineTestsBatch(['documenti', 'jobRunner'], overrides);
}

/** GAS Run-dropdown entry point: documenti + jobRunner (heaviest batch, provisions batch 2 data). */
export function runOnlineTestsBatch1(
  execute: () => OnlineTestReport = executeOnlineTestsBatch1,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('online_tests_batch1', 'ONLINE_TEST_SUITE_BATCH', execute, logger);
}

export function executeOnlineTestsBatch2(
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  return executeOnlineTestsBatch(['email', 'articolazione'], overrides);
}

/** GAS Run-dropdown entry point: email + articolazione. Requires batch 1 on the same fixture. */
export function runOnlineTestsBatch2(
  execute: () => OnlineTestReport = executeOnlineTestsBatch2,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('online_tests_batch2', 'ONLINE_TEST_SUITE_BATCH', execute, logger);
}

export function executeOnlineTestsBatch3(
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  return executeOnlineTestsBatch(['import', 'storico', 'itpDotted', 'aclReali'], overrides);
}

/** GAS Run-dropdown entry point: import + storico + ITP puntate + ACL reali. */
export function runOnlineTestsBatch3(
  execute: () => OnlineTestReport = executeOnlineTestsBatch3,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('online_tests_batch3', 'ONLINE_TEST_SUITE_BATCH', execute, logger);
}

export function executeOnlineTestsBatch4(
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  return executeOnlineTestsBatch(
    ['supplenzeRuoli', 'cacheIsolamento', 'permessi', 'processMonitor'],
    overrides
  );
}

/** GAS Run-dropdown entry point: supplenze/ruoli + isolamento cache + permessi attivi + telemetria monitor. */
export function runOnlineTestsBatch4(
  execute: () => OnlineTestReport = executeOnlineTestsBatch4,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('online_tests_batch4', 'ONLINE_TEST_SUITE_BATCH', execute, logger);
}

interface ResetE2eHistoryTablesResult {
  purgedLogMail: number;
  purgedLogDocs: number;
  insertedMaterie: string[];
  deletedAslColumn: boolean;
  warnings: string[];
}

/**
 * Explicit pre-Batch-1 launcher: migrates the persisted fixture, rebuilds the final container,
 * then deletes every append-only row from `LOG_MAIL`/`LOG_DOCS`. No other table is purged.
 *
 * This is now the *manual* form of what `executeOnlineTestsBatch1` does automatically via its
 * `resetHistory` seam — batch 1 calls this same function before registering its groups, so there
 * is no separate step an operator needs to remember to run first. Keep using this standalone
 * launcher only for manual, ad hoc resets.
 *
 * ORDER MATTERS. Run it BEFORE batch 1 and NEVER between batches: batches 2–4 consume the
 * LOG_DOCS/LOG_FOLD artifacts batch 1 produces (the `documenti`/`cartelle` boxes of every
 * CONF_MAIL read them). Running it after batch 1 makes every email skip with zero boxes.
 */
export function resetE2eHistoryTables(
  overrides: Partial<FullOnlineTestDeps> = {}
): ResetE2eHistoryTablesResult {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const readSample =
    overrides.readSample ?? ((props: IPropertiesFacade) => readPersistedFullOnlineTestSample(props, {}, true));
  const sample = readSample(properties);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());
  const logger = ServiceFactory.getLogger();

  const migration = migrateResolvedPersistedE2eFixture(sample, properties, overrides);
  resetAldoFn();
  const container = initAldoFn(clock(), properties, sample.masterSpreadsheetId, true);
  const db = container.get<SheetDbAdapter>('db');

  const purgedLogMail = purgeTable(db, TABLE.LOG_MAIL, '__PK');
  const purgedLogDocs = purgeTable(db, TABLE.LOG_DOCS, COL_LOG_DOCS.ID);
  if (purgedLogMail + purgedLogDocs > 0) db.save();

  const result: ResetE2eHistoryTablesResult = {
    purgedLogMail,
    purgedLogDocs,
    insertedMaterie: migration.insertedMaterie,
    deletedAslColumn: migration.deletedAslColumn,
    warnings: []
  };
  logger.logSummary('🧹 Reset tabelle storiche E2E', 0, {
    purgedLogMail,
    purgedLogDocs,
    insertedMaterie: migration.insertedMaterie.length,
    deletedAslColumn: migration.deletedAslColumn
  });
  return result;
}

/** Deletes every row of `table`, keyed on `pkColumn` (`'__PK'` for LOG_MAIL's composite key, set up by `db.table()` below). */
function purgeTable(db: SheetDbAdapter, table: string, pkColumn: string): number {
  db.table(table); // triggers SheetTableAdapter's defineVirtualColumn/setPrimaryKey for this table
  const raw = db.getDatabaseService().tables[table];
  if (raw === undefined) return 0;
  const ids = raw.getAllRows().map((row) => String(row[pkColumn]));
  ids.forEach((id) => raw.deleteRowById(id));
  return ids.length;
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
  const container = initAldoFn(clock(), properties, masterSpreadsheetId, true);
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
  const activeUser = overrides.activeUser ?? new SessionActiveUserFacade();

  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId, true);
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
  registerEmailChecks(runner, container, sample, resolveTestRecipient(activeUser));
  return runner.report();
}

export function executePersistedImportChecks(
  register: RegisterSharedChecks,
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const readSample =
    overrides.readSample ?? ((props: IPropertiesFacade) => readPersistedFullOnlineTestSample(props, {}, true));
  const sample = readSample(properties);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());

  migrateResolvedPersistedE2eFixture(sample, properties, overrides);
  resetAldoFn();
  const container = initAldoFn(clock(), properties, sample.masterSpreadsheetId, true);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);
  const runner = new TestRunner();
  register(runner, container, { ...sample, testMode: sample.masterTestMode });
  return runner.report();
}

export function executeImportFileSingolo(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedImportChecks(registerImportFileSingoloChecks, overrides);
}

export function executeImportCartelleClasse(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  return executePersistedImportChecks(registerImportCartelleClasseChecks, overrides);
}

export function executeImportChunked(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedImportChecks(registerImportChunkedChecks, overrides);
}

export function executeSupplenzeERuoli(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedImportChecks(registerSupplenzeRuoliChecks, overrides);
}

export function executeACLReali(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedImportChecks(registerAclRealiChecks, overrides);
}

function cacheIsolationDeps(
  properties: IPropertiesFacade,
  overrides: Partial<E2eTestDeps>
): CacheIsolationDeps {
  const secondMasterSpreadsheetId = properties
    .get(PROP_ONLINETEST_CACHE_ISOLATED_MASTER_SPREADSHEET_ID)
    ?.trim();
  if (secondMasterSpreadsheetId === undefined || secondMasterSpreadsheetId === '') {
    throw new ConfigurationError(
      'Fixture cache isolata non disponibile: riesegui creaDatiMockDrive per configurarla.'
    );
  }
  return {
    initAldo: overrides.initAldo ?? initAldo,
    resetAldo: overrides.resetAldo ?? resetAldo,
    properties,
    clock: overrides.clock ?? (() => new Date()),
    secondMasterSpreadsheetId
  };
}

/** Runs two persisted masters through one Script Cache and rejects cross-fixture row reuse. */
export function executeCacheIsolamento(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  if (masterSpreadsheetId === undefined || masterSpreadsheetId === '') {
    throw new ConfigurationError('Dataset online non disponibile: esegui prima creaDatiMockDrive.');
  }
  const master = readCurrentMasterConfig(masterSpreadsheetId);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? (() => new Date());
  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId, true);
  const runner = new TestRunner();
  registerCacheIsolamentoChecks(
    runner,
    container,
    {
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
      staticAttachmentFileId: ''
    },
    cacheIsolationDeps(properties, overrides)
  );
  return runner.report();
}

/** Active-user ACL evidence. Unavailable Workspace identity/read-back is reported as SKIPPED. */
export function executePermessiAttivi(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedImportChecks(registerPermessiChecks, overrides);
}

function executePersistedStoricoChecks(
  scope: StoricoCheckScope,
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
  const container = initAldoFn(clock(), properties, masterSpreadsheetId, true);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);
  const sample: FullOnlineTestSample = {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: master.historicalSpreadsheetIds[0] ?? '',
    priorSampleSpreadsheetUrl: master.historicalSpreadsheetUrls[0] ?? '',
    priorSampleSpreadsheetId2: master.historicalSpreadsheetIds[1] ?? '',
    priorSampleSpreadsheetUrl2: master.historicalSpreadsheetUrls[1] ?? '',
    logFoldFolderUrl: '',
    jobRunnerDocConfigId: '',
    masterTestMode: master.testMode,
    staticAttachmentFileId: '',
    testMode: master.testMode
  };
  const runner = new TestRunner();
  registerStoricoChecks(runner, container, sample, scope);
  return runner.report();
}

function executePersistedArticolazioneChecks(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  if (masterSpreadsheetId === undefined || masterSpreadsheetId === '') {
    throw new ConfigurationError('Dataset online non disponibile: esegui prima creaDatiMockDrive.');
  }
  const master = readCurrentMasterConfig(masterSpreadsheetId);
  if (master.historicalSpreadsheetIds.length < 2) {
    throw new ConfigurationError(
      'Dataset online incompleto: servono due database storici; riesegui creaDatiMockDrive.'
    );
  }
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());

  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId, true);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);
  const sample: SharedTestDatabase = {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: master.historicalSpreadsheetIds[0]!,
    priorSampleSpreadsheetUrl: master.historicalSpreadsheetUrls[0]!,
    priorSampleSpreadsheetId2: master.historicalSpreadsheetIds[1]!,
    priorSampleSpreadsheetUrl2: master.historicalSpreadsheetUrls[1]!,
    logFoldFolderUrl: '',
    jobRunnerDocConfigId: '',
    masterTestMode: master.testMode,
    staticAttachmentFileId: ''
  };
  const runner = new TestRunner();
  registerArticolazioneChecks(runner, container, sample);
  return runner.report();
}

/** Runs the dotted-materia/ITP scenario against the persisted shared fixture. */
export function executeITPeMateriePuntate(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const masterSpreadsheetId = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  if (masterSpreadsheetId === undefined || masterSpreadsheetId === '') {
    throw new ConfigurationError('Dataset online non disponibile: esegui prima creaDatiMockDrive.');
  }
  const master = readCurrentMasterConfig(masterSpreadsheetId);
  if (master.historicalSpreadsheetIds.length < 2) {
    throw new ConfigurationError(
      'Dataset online incompleto: servono due database storici; riesegui creaDatiMockDrive.'
    );
  }
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());

  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId, true);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);
  const sample: SharedTestDatabase = {
    masterSpreadsheetId,
    sampleSpreadsheetId: master.idSpreadsheet,
    sampleSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${master.idSpreadsheet}`,
    sampleFolderUrl: `https://drive.google.com/drive/folders/${master.idCartellaRoot}`,
    priorSampleSpreadsheetId: master.historicalSpreadsheetIds[0]!,
    priorSampleSpreadsheetUrl: master.historicalSpreadsheetUrls[0]!,
    priorSampleSpreadsheetId2: master.historicalSpreadsheetIds[1]!,
    priorSampleSpreadsheetUrl2: master.historicalSpreadsheetUrls[1]!,
    logFoldFolderUrl: '',
    jobRunnerDocConfigId: '',
    masterTestMode: master.testMode,
    staticAttachmentFileId: ''
  };
  const runner = new TestRunner();
  registerItpDottedChecks(runner, container, sample);
  return runner.report();
}

export function executeRecuperoStoricoAlunno(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  return executePersistedStoricoChecks('alunno', overrides);
}

export function executeRecuperoStoricoClasse(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  return executePersistedStoricoChecks('classe', overrides);
}

export function executeRecuperoStoricoDocumenti(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  return executePersistedStoricoChecks('documenti', overrides);
}

function executePersistedJobRunnerChecks(
  scope: 'documenti' | 'email' | 'trigger-reale',
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
  const activeUser = overrides.activeUser ?? new SessionActiveUserFacade();

  resetAldoFn();
  const container = initAldoFn(clock(), properties, masterSpreadsheetId, true);
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
  else if (scope === 'email')
    registerJobRunnerEmailChecks(runner, container, sample, resolveTestRecipient(activeUser));
  else registerJobRunnerTriggerRealeCheck(runner, container, sample);
  return runner.report();
}

export function executeJobRunnerDocGen(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedJobRunnerChecks('documenti', overrides);
}

export function executeJobRunnerEmail(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  return executePersistedJobRunnerChecks('email', overrides);
}

/** Optional live-GAS launcher. It is intentionally excluded from executeFullOnlineTests. */
export function executeJobRunnerTriggerReale(
  overrides: Partial<E2eTestDeps> = {}
): OnlineTestReport {
  return executePersistedJobRunnerChecks('trigger-reale', overrides);
}

// Dedicated launchers.
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
export function testJobRunnerTriggerReale(
  execute: () => OnlineTestReport = executeJobRunnerTriggerReale,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite(
    'jobrunner_trigger_reale',
    'JOBRUNNER_REAL_TRIGGER_SCENARIO',
    execute,
    logger
  );
}
export function testImportFileSingolo(): OnlineTestReport {
  return runReportedSuite(
    'import_file_singolo',
    'IMPORT_SCENARIO',
    executeImportFileSingolo,
    ServiceFactory.getLogger()
  );
}
export function testImportCartelleClasse(): OnlineTestReport {
  return runReportedSuite(
    'import_cartelle_classe',
    'IMPORT_SCENARIO',
    executeImportCartelleClasse,
    ServiceFactory.getLogger()
  );
}
export function testImportCercaDocumenti(): OnlineTestReport {
  return runReportedSuite(
    'import_cerca_documenti',
    'IMPORT_SCENARIO',
    () => executePersistedImportChecks(registerImportCercaDocumentiLauncherChecks),
    ServiceFactory.getLogger()
  );
}
export function testImportChunked(): OnlineTestReport {
  return runReportedSuite(
    'import_chunked',
    'IMPORT_SCENARIO',
    executeImportChunked,
    ServiceFactory.getLogger()
  );
}
export function testRecuperoStoricoAlunno(
  execute: () => OnlineTestReport = executeRecuperoStoricoAlunno,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('storico_alunno', 'STORICO_ALUNNO_SCENARIO', execute, logger);
}
export function testRecuperoStoricoClasse(
  execute: () => OnlineTestReport = executeRecuperoStoricoClasse,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('storico_classe', 'STORICO_CLASSE_SCENARIO', execute, logger);
}
export function testRecuperoStoricoDocumenti(
  execute: () => OnlineTestReport = executeRecuperoStoricoDocumenti,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('storico_documenti', 'STORICO_DOCUMENTI_SCENARIO', execute, logger);
}
export function testArticolazione(
  execute: () => OnlineTestReport = executePersistedArticolazioneChecks,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('articolazione', 'ARTICOLAZIONE_SCENARIO', execute, logger);
}
export function testITPeMateriePuntate(
  execute: () => OnlineTestReport = executeITPeMateriePuntate,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('itp_dotted', 'ITP_DOTTED_SCENARIO', execute, logger);
}
export function testSupplenzeERuoli(
  execute: () => OnlineTestReport = executeSupplenzeERuoli,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('supplenze_ruoli', 'SUPPLENZE_RUOLI_SCENARIO', execute, logger);
}
export function testACLReali(
  execute: () => OnlineTestReport = executeACLReali,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('acl_reali', 'ACL_REALI_SCENARIO', execute, logger);
}
export function testCacheIsolamento(
  execute: () => OnlineTestReport = executeCacheIsolamento,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('cache_isolamento', 'CACHE_ISOLAMENTO_SCENARIO', execute, logger);
}
export function testPermessiAttivi(
  execute: () => OnlineTestReport = executePermessiAttivi,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('permessi_attivi', 'PERMESSI_ATTIVI_SCENARIO', execute, logger);
}
