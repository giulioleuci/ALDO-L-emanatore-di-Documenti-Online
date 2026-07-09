import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { IGmailFacade } from '../infrastructure/facades/GmailServiceFacade';
import type { ITemplateEngine } from '../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../infrastructure/facades/ExpressionEngineFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
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
import { DocPersonalizzatoGeneratorStrategy } from '../application/strategies/DocPersonalizzatoGeneratorStrategy';
import type { GeneratorStrategy } from '../application/strategies/GeneratorStrategy';
import { ContextEngineFactory } from '../application/context-engine/ContextEngineFactory';
import type { ContextBuilder } from '../application/context-engine/ContextBuilder';
import { ConfigurazioneDocumentoRepository } from '../infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ConfigurazioneImportRepository } from '../infrastructure/repositories/ConfigurazioneImportRepository';
import { ClasseRepository } from '../infrastructure/repositories/ClasseRepository';
import { LogEmailRepository } from '../infrastructure/repositories/LogEmailRepository';
import { MasterSheetRepository } from '../infrastructure/repositories/MasterSheetRepository';
import { SheetDbAdapter } from '../infrastructure/db/SheetDbAdapter';
import { DriveServiceFacade } from '../infrastructure/facades/DriveServiceFacade';
import { GmailServiceFacade } from '../infrastructure/facades/GmailServiceFacade';
import { TemplateEngineFacade } from '../infrastructure/facades/TemplateEngineFacade';
import { ExpressionEngineFacade } from '../infrastructure/facades/ExpressionEngineFacade';
import { ScriptPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
import { ConfigurationError } from '../domain/errors/DomainError';

/** ScriptProperties key holding the Master Sheet spreadsheet id (15 §7, 06 §0). */
export const PROP_MASTER_SPREADSHEET_ID = 'MASTER_SPREADSHEET_ID';

/** Every seam the container wiring needs; tests inject fakes, initAldo() injects the real ones. */
export interface BootstrapDeps {
  db: EmailDb;
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
  c.register('contextBuilder', () => ContextEngineFactory.create(deps.db));
  c.register('strategyRegistry', () => {
    // Data-driven registry (10 §9): one entry per CONF_DOC.GENERATORE value implemented.
    // SHEET_CON_MATERIE / SHEET_CON_MATERIE_E_PERMESSI / DOCUMENTO_CON_TABELLE_IMPORTATE
    // need Sheet-structural facade capabilities (column insertion, range
    // protection, table import) not yet built; a CONF_DOC using them fails
    // typed at RenderTemplateStep ("GENERATORE non registrato").
    return new Map<string, GeneratorStrategy>([
      ['VERBALE_CDC', new VerbaleGeneratorStrategy(deps.templates)],
      ['DOCUMENTO_GENERICO', new DocumentoGenericoGeneratorStrategy(deps.templates)],
      ['DOC_PERSONALIZZATO', new DocPersonalizzatoGeneratorStrategy(deps.templates)]
    ]);
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
        logger
      })
  );
  c.register('risolutoreRuoli', () => new RisolutoreRuoliService(deps.db));
  c.register(
    'documentBatchService',
    (container) => new DocumentBatchService(new ClasseRepository(deps.db), container.get<DocumentGenerationService>('documentGenerationService'))
  );
  c.register('emailNotificationService', () =>
    EmailNotificationService.create(deps.db, deps.gmail, deps.templates, deps.now, deps.drive, logger)
  );
  c.register('emailBatchService', (container) => new EmailBatchService(container.get<EmailNotificationService>('emailNotificationService')));
  c.register(
    'emailRetryService',
    (container) =>
      new EmailRetryService(
        new LogEmailRepository(deps.db),
        container.get<EmailNotificationService>('emailNotificationService'),
        deps.gmail,
        new MasterSheetRepository(deps.db),
        { logger }
      )
  );
  if (deps.importEngine !== undefined) {
    const engine = deps.importEngine;
    c.register('importService', () => new ImportService(engine, new ConfigurazioneImportRepository(deps.db)));
  }
  c.register('reportService', () => new ReportService(deps.db));
  c.register('aggregatoreDati', () => new AggregatoreDati(deps.db));
  c.register('alberoCartelle', () => new AlberoCartelle(deps.drive, deps.db));
  return c;
}

/** Data-driven launcher (15 §4): batch document generation for a CONF_DOC id. */
export function avviaGenerazioneDataDriven(c: ServiceContainer, configId: string, runner: JobRunnerService): unknown {
  return c.get<DocumentBatchService>('documentBatchService').start(runner, `gen_${configId}`, configId);
}

/** Data-driven launcher (15 §4): mass email for a CONF_MAIL pattern. */
export function avviaInvioNotificheDataDriven(c: ServiceContainer, patternId: string, runner: JobRunnerService): unknown {
  return c.get<EmailBatchService>('emailBatchService').start(runner, `mail_${patternId}`, patternId);
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
export function riprendiJobSospeso(c: ServiceContainer, runner: JobRunnerService, jobName = ''): unknown {
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
    throw new ConfigurationError(`ScriptProperties.${PROP_MASTER_SPREADSHEET_ID} mancante: impossibile localizzare il Master Sheet`);
  }
  const masterDb = new SheetDbAdapter(new DatabaseService(masterId, logger));
  const annoCorrente = new MasterSheetRepository(masterDb).findConfigAnnoCorrente();
  const db = new SheetDbAdapter(new DatabaseService(annoCorrente.idSpreadsheet, logger));

  runtime = buildAldoContainer({
    db,
    drive: new DriveServiceFacade(ServiceFactory.getDriveService(), ServiceFactory.getPermissionService(), annoCorrente.idCartellaRoot),
    gmail: new GmailServiceFacade(ServiceFactory.getMailService()),
    templates: new TemplateEngineFacade(),
    expressionEngine: new ExpressionEngineFacade(),
    // GasDataImporter's Loader writes through the raw SheetDBLib table API
    // (insertRows/updateRowById), not the ALDO IDatabase port — a second
    // DatabaseService instance over the same spreadsheet, scoped to this one
    // execution (menu launches run one operation at a time, ref 15 §8).
    importEngine: new ImportEngine(
      logger,
      ServiceFactory.getDriveService(),
      ServiceFactory.getSpreadsheetService(),
      new DatabaseService(annoCorrente.idSpreadsheet, logger)
    ),
    now,
    logger
  });
  return runtime;
}

/** The JobRunnerLib runner bound to the container's registries. */
export function creaJobRunner(): JobRunnerService {
  return new JobRunnerService(ServiceFactory.getLogger(), ServiceFactory.getUtilitiesService(), new JobDefinitionRegistry(ServiceFactory.getLogger()));
}
