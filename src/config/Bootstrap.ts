import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { IGmailFacade } from '../infrastructure/facades/GmailServiceFacade';
import type { ITemplateEngine } from '../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../infrastructure/facades/ExpressionEngineFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import type { IProcessMonitor } from '../infrastructure/facades/ProcessMonitorFacade';
import type { IMasterSheetRepository } from '../domain/repositories/IMasterSheetRepository';
import type { EmailDb } from '../application/services/EmailNotificationService';
import { ServiceContainer } from './ServiceContainer';
import { DocumentGenerationService } from '../application/services/DocumentGenerationService';
import { DocumentBatchService } from '../application/services/DocumentBatchService';
import { EmailNotificationService } from '../application/services/EmailNotificationService';
import { EmailBatchService } from '../application/services/EmailBatchService';
import { EmailRetryService } from '../application/services/EmailRetryService';
import { ImportService, type ImportResult } from '../application/services/ImportService';
import { RisolutoreRuoliService } from '../application/services/RisolutoreRuoliService';
import { ReportService } from '../application/services/ReportService';
import { AggregatoreDati } from '../application/services/AggregatoreDati';
import { AlberoCartelle } from '../infrastructure/services/AlberoCartelle';
import { VerbaleGeneratorStrategy } from '../application/strategies/VerbaleGeneratorStrategy';
import { DocumentoGenericoGeneratorStrategy } from '../application/strategies/DocumentoGenericoGeneratorStrategy';
import { FoglioGenericoGeneratorStrategy } from '../application/strategies/FoglioGenericoGeneratorStrategy';
import { DocPersonalizzatoGeneratorStrategy } from '../application/strategies/DocPersonalizzatoGeneratorStrategy';
import { SheetMaterieGeneratorStrategy } from '../application/strategies/SheetMaterieGeneratorStrategy';
import { SheetMaterieConPermessiGeneratorStrategy } from '../application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { DocumentoConTabelleImportateGeneratorStrategy } from '../application/strategies/DocumentoConTabelleImportateGeneratorStrategy';
import type { GeneratorStrategy } from '../application/strategies/GeneratorStrategy';
import { DocumentTableFacade } from '../infrastructure/facades/DocumentTableFacade';
import { MateriaRepository } from '../infrastructure/repositories/MateriaRepository';
import { ContextEngineFactory } from '../application/context-engine/ContextEngineFactory';
import type { ContextBuilder } from '../application/context-engine/ContextBuilder';
import { ConfigurazioneDocumentoRepository } from '../infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ConfigurazioneImportRepository } from '../infrastructure/repositories/ConfigurazioneImportRepository';
import { ClasseRepository } from '../infrastructure/repositories/ClasseRepository';
import { LogCartellaRepository } from '../infrastructure/repositories/LogCartellaRepository';
import { LogDocumentoRepository } from '../infrastructure/repositories/LogDocumentoRepository';
import { LogEmailRepository } from '../infrastructure/repositories/LogEmailRepository';
import { MasterSheetRepository } from '../infrastructure/repositories/MasterSheetRepository';
import { TABLE } from './schema';
import {
  createCercaCartelleClasseStrategy,
  createCercaDocumentiStrategy
} from '../application/import/CustomSourceStrategies';
import { SheetDbAdapter } from '../infrastructure/db/SheetDbAdapter';
import { DriveServiceFacade } from '../infrastructure/facades/DriveServiceFacade';
import { GmailServiceFacade } from '../infrastructure/facades/GmailServiceFacade';
import { TemplateEngineFacade } from '../infrastructure/facades/TemplateEngineFacade';
import { ExpressionEngineFacade } from '../infrastructure/facades/ExpressionEngineFacade';
import { ScriptPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { ProcessMonitorFacade } from '../infrastructure/facades/ProcessMonitorFacade';
import { ConfigurationError } from '../domain/errors/DomainError';

/** ScriptProperties key holding the Master Sheet spreadsheet id (15 §7, 06 §0). */
export const PROP_MASTER_SPREADSHEET_ID = 'MASTER_SPREADSHEET_ID';

/** Every seam the container wiring needs; tests inject fakes, initAldo() injects the real ones. */
export interface BootstrapDeps {
  db: EmailDb;
  /**
   * Repository over the Master Sheet itself (06 §0) — a DIFFERENT spreadsheet
   * than `db` (the current school-year DB). Must never be built from `db`:
   * the per-year spreadsheet has no MASTER sheet tab, so a repository over it
   * throws as soon as it's queried (`setPrimaryKey` on an undefined table).
   */
  master: IMasterSheetRepository;
  drive: IDriveFacade;
  gmail: IGmailFacade;
  templates: ITemplateEngine;
  expressionEngine: IExpressionEngine;
  /**
   * GasDataImporter engine (12 §3). Optional: only FILE_SINGOLO imports are
   * implemented so far, and constructing the real engine needs live
   * DriveService/SpreadsheetService — the composition root only builds one
   * when running under GAS.
   */
  importEngine?: ImportEngine;
  /**
   * GoogleApiWrapper SpreadsheetService (10 §9), needed by the two Sheet-writing
   * generator strategies (SHEET_CON_MATERIE/_E_PERMESSI). Optional for the same
   * reason as importEngine: constructing it needs live GAS services.
   */
  spreadsheets?: SpreadsheetService;
  /** GoogleApiWrapper DocumentService (10 §9), needed by DOCUMENTO_CON_TABELLE_IMPORTATE. Optional for the same reason as importEngine/spreadsheets. */
  documents?: DocumentService;
  /** GasProcessMonitorLib port (15 §9) — sidebar progress for the two batch jobs. */
  monitor?: IProcessMonitor;
  now: Date;
  logger?: LoggerService;
}

/**
 * DI wiring (08 §2, 12 §5): registers every application service as a lazy
 * singleton. Pure composition — no business logic, no native access.
 */
export function buildAldoContainer(deps: BootstrapDeps): ServiceContainer {
  const c = new ServiceContainer();
  const logger = deps.logger ?? new LoggerService();

  c.register('logger', () => logger);
  c.register('db', () => deps.db);
  c.register('drive', () => deps.drive);
  c.register('contextBuilder', () => ContextEngineFactory.create(deps.db, deps.master));
  if (deps.spreadsheets !== undefined) {
    c.register('spreadsheets', () => deps.spreadsheets!);
  }
  c.register('strategyRegistry', () => {
    // Data-driven registry (10 §9): one entry per CONF_DOC.GENERATORE value
    // implemented. The Sheet/Doc-structural strategies need a live
    // SpreadsheetService/DocumentService (deps.spreadsheets/deps.documents,
    // GAS-only) — omitted (and thus unregistered — RenderTemplateStep then
    // fails typed with "GENERATORE non registrato") when running off-GAS.
    const registry = new Map<string, GeneratorStrategy>([
      ['VERBALE_CDC', new VerbaleGeneratorStrategy(deps.templates)],
      ['DOCUMENTO_GENERICO', new DocumentoGenericoGeneratorStrategy(deps.templates)],
      ['FOGLIO_GENERICO', new FoglioGenericoGeneratorStrategy(deps.templates)],
      ['DOC_PERSONALIZZATO', new DocPersonalizzatoGeneratorStrategy(deps.templates)]
    ]);
    if (deps.spreadsheets !== undefined) {
      const materie = new MateriaRepository(deps.db);
      registry.set(
        'SHEET_CON_MATERIE',
        new SheetMaterieGeneratorStrategy(deps.spreadsheets, materie, deps.templates)
      );
      registry.set(
        'SHEET_CON_MATERIE_E_PERMESSI',
        new SheetMaterieConPermessiGeneratorStrategy(
          deps.spreadsheets,
          materie,
          deps.templates,
          new RisolutoreRuoliService(deps.db)
        )
      );
      if (deps.documents !== undefined) {
        registry.set(
          'DOCUMENTO_CON_TABELLE_IMPORTATE',
          new DocumentoConTabelleImportateGeneratorStrategy(
            deps.templates,
            deps.spreadsheets,
            new DocumentTableFacade(deps.documents),
            logger
          )
        );
      }
    }
    return registry;
  });
  c.register(
    'documentGenerationService',
    (container) =>
      new DocumentGenerationService({
        db: deps.db,
        drive: deps.drive,
        contextBuilder: container.get<ContextBuilder>('contextBuilder'),
        strategyRegistry: container.get<Map<string, GeneratorStrategy>>('strategyRegistry'),
        templates: deps.templates,
        expressionEngine: deps.expressionEngine,
        configs: new ConfigurazioneDocumentoRepository(deps.db),
        roleResolver: new RisolutoreRuoliService(deps.db),
        now: deps.now,
        monitor: deps.monitor,
        logger
      })
  );
  c.register('risolutoreRuoli', () => new RisolutoreRuoliService(deps.db));
  c.register(
    'documentBatchService',
    (container) =>
      new DocumentBatchService(
        new ClasseRepository(deps.db),
        container.get<DocumentGenerationService>('documentGenerationService'),
        deps.monitor
      )
  );
  c.register('emailNotificationService', () =>
    EmailNotificationService.create(
      deps.db,
      deps.gmail,
      deps.templates,
      deps.now,
      deps.drive,
      logger,
      deps.monitor,
      deps.master
    )
  );
  c.register(
    'emailBatchService',
    (container) =>
      new EmailBatchService(
        container.get<EmailNotificationService>('emailNotificationService'),
        deps.monitor
      )
  );
  c.register(
    'emailRetryService',
    (container) =>
      new EmailRetryService(
        new LogEmailRepository(deps.db),
        container.get<EmailNotificationService>('emailNotificationService'),
        deps.gmail,
        deps.master,
        { logger }
      )
  );
  if (deps.importEngine !== undefined) {
    const engine = deps.importEngine;
    c.register(
      'importService',
      () => new ImportService(engine, new ConfigurazioneImportRepository(deps.db))
    );
  }
  c.register('reportService', () => new ReportService(deps.db));
  c.register('aggregatoreDati', () => new AggregatoreDati(deps.db));
  c.register('alberoCartelle', () => new AlberoCartelle(deps.drive, deps.db));
  return c;
}

/** Data-driven launcher (15 §4): batch document generation for a CONF_DOC id. */
export function avviaGenerazioneDataDriven(
  c: ServiceContainer,
  configId: string,
  runner: JobRunnerService
): unknown {
  return c
    .get<DocumentBatchService>('documentBatchService')
    .start(runner, `gen_${configId}`, configId);
}

/** Data-driven launcher (15 §4): mass email for a CONF_MAIL pattern. */
export function avviaInvioNotificheDataDriven(
  c: ServiceContainer,
  patternId: string,
  runner: JobRunnerService
): unknown {
  return c
    .get<EmailBatchService>('emailBatchService')
    .start(runner, `mail_${patternId}`, patternId);
}

/**
 * Data-driven launcher (15 §4): ETL import (12 §3). Executed synchronously —
 * `eseguiImportazione` is a single execution, not an iteration (15 §6); it is
 * NOT wrapped in JobRunnerLib, unlike the two batch launchers above.
 */
export function avviaImportazioneDataDriven(c: ServiceContainer, configId: string): ImportResult {
  if (!c.has('importService')) {
    throw new ConfigurationError(
      `Importazione ${configId} non disponibile: nessun ImportEngine configurato (12 §3, richiede DriveService/SpreadsheetService live)`
    );
  }
  return c.get<ImportService>('importService').executeImport(configId);
}

/**
 * Resume entry (15 §5): JobRunnerLib's timed trigger invokes the global
 * `resumeJob`; jobName '' lets the library resolve it from the trigger context
 * (`job_for_trigger_<id>` in ScriptProperties). Both batch registries are
 * re-registered — the library picks the handler by the persisted job type.
 */
export function riprendiJobSospeso(
  c: ServiceContainer,
  runner: JobRunnerService,
  jobName = ''
): unknown {
  const documenti = c.get<DocumentBatchService>('documentBatchService');
  const email = c.get<EmailBatchService>('emailBatchService');
  return runner.resume(jobName, (queue) => {
    documenti.registerJobHandlers(queue);
    email.registerJobHandlers(queue);
  });
}

let runtime: ServiceContainer | null = null;

/** Test seam: drops the cached production container. */
export function resetAldo(): void {
  runtime = null;
}

/**
 * Production composition root (12 §5, 15 §4): Master Sheet id from
 * ScriptProperties → current-year database (06 §0) → container with the real
 * GAS-backed facades. Lazy and cached per execution; NEVER called by onOpen
 * (15 §2).
 */
export function initAldo(now: Date = new Date(), props?: IPropertiesFacade): ServiceContainer {
  if (runtime !== null) return runtime;
  const logger = ServiceFactory.getLogger();
  const properties = props ?? new ScriptPropertiesFacade();

  const masterId = properties.get(PROP_MASTER_SPREADSHEET_ID);
  if (masterId === null || masterId.trim() === '') {
    throw new ConfigurationError(
      `ScriptProperties.${PROP_MASTER_SPREADSHEET_ID} mancante: impossibile localizzare il Master Sheet`
    );
  }
  const utils = ServiceFactory.getUtils();
  const cache = ServiceFactory.getCacheService().getScriptCache();
  const masterDb = new SheetDbAdapter(
    new DatabaseService(masterId, logger, utils, cache, null, { verifyTables: [TABLE.MASTER] })
  );
  const masterRepo = new MasterSheetRepository(masterDb);
  const annoCorrente = masterRepo.findConfigAnnoCorrente();
  const db = new SheetDbAdapter(
    new DatabaseService(annoCorrente.idSpreadsheet, logger, utils, cache, null, {
      verifyTables: Object.values(TABLE).filter((t) => t !== TABLE.MASTER)
    })
  );

  const driveService = ServiceFactory.getDriveService();
  const spreadsheetService = ServiceFactory.getSpreadsheetService();
  const documentService = ServiceFactory.getDocumentService();

  // GasDataImporter's Loader writes through the raw SheetDBLib table API
  // (insertRows/updateRowById/deleteRowById), not the ALDO IDatabase port —
  // SheetDbAdapter.getDatabaseService() (ref REPORT_GLF.md B9) shares the same
  // DatabaseService instance `db` already opened over this spreadsheet,
  // instead of opening a second one for the importer.
  const importEngine = new ImportEngine(
    logger,
    driveService,
    spreadsheetService,
    db.getDatabaseService()
  );
  // CERCA_CARTELLE_CLASSE/CERCA_DOCUMENTI (12 §3) are ALDO-specific source
  // strategies, not part of the library's built-in vocabulary — registered
  // here at the composition root so ImportRecipeMapper's recipes resolve.
  importEngine.registerCustomSource(
    'CERCA_CARTELLE_CLASSE',
    createCercaCartelleClasseStrategy(
      new ClasseRepository(db),
      new LogCartellaRepository(db),
      driveService,
      spreadsheetService
    )
  );
  importEngine.registerCustomSource(
    'CERCA_DOCUMENTI',
    createCercaDocumentiStrategy(new LogDocumentoRepository(db), spreadsheetService)
  );

  const driveFacade = new DriveServiceFacade(
    ServiceFactory.getDriveService(),
    ServiceFactory.getPermissionService(),
    annoCorrente.idCartellaRoot,
    documentService
  );

  const container = buildAldoContainer({
    db,
    master: masterRepo,
    drive: driveFacade,
    gmail: new GmailServiceFacade(ServiceFactory.getMailService()),
    templates: new TemplateEngineFacade(),
    expressionEngine: new ExpressionEngineFacade(),
    importEngine,
    spreadsheets: spreadsheetService,
    documents: documentService,
    monitor: new ProcessMonitorFacade(
      new ProcessMonitorService(
        logger,
        ServiceFactory.getCacheService(),
        ServiceFactory.getPropertiesService()
      )
    ),
    now,
    logger
  });

  if (annoCorrente.testMode) {
    let ownerEmail: string | null;
    try {
      ownerEmail = driveFacade.getFileOwnerEmail(masterId);
    } catch (err) {
      throw new ConfigurationError(
        `TEST_MODE attivo ma impossibile risolvere il proprietario del Master Sheet ${masterId}: ${(err as Error).message}`
      );
    }
    if (ownerEmail === null) {
      throw new ConfigurationError(
        `TEST_MODE attivo ma il Master Sheet ${masterId} non ha un proprietario Drive risolvibile`
      );
    }
    container
      .get<EmailNotificationService>('emailNotificationService')
      .enableTestMode(ownerEmail);
  }

  runtime = container;
  return runtime;
}

/** The JobRunnerLib runner bound to the container's registries. */
export function creaJobRunner(): JobRunnerService {
  return new JobRunnerService(
    ServiceFactory.getLogger(),
    ServiceFactory.getUtils(),
    new JobDefinitionRegistry(ServiceFactory.getLogger())
  );
}
