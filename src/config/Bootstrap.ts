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
import { VerbaleGeneratorStrategy } from '../application/strategies/VerbaleGeneratorStrategy';
import type { GeneratorStrategy } from '../application/strategies/GeneratorStrategy';
import { ContextEngineFactory } from '../application/context-engine/ContextEngineFactory';
import type { ContextBuilder } from '../application/context-engine/ContextBuilder';
import { ConfigurazioneDocumentoRepository } from '../infrastructure/repositories/ConfigurazioneDocumentoRepository';
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
    return new Map<string, GeneratorStrategy>([['VERBALE_CDC', new VerbaleGeneratorStrategy(deps.templates)]]);
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
        now: deps.now,
        logger
      })
  );
  c.register(
    'documentBatchService',
    (container) => new DocumentBatchService(new ClasseRepository(deps.db), container.get<DocumentGenerationService>('documentGenerationService'))
  );
  c.register('emailNotificationService', () =>
    EmailNotificationService.create(deps.db, deps.gmail, deps.templates, deps.now, logger)
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

/** Data-driven launcher (15 §4): ETL import — pending ImportService (12 §3). */
export function avviaImportazioneDataDriven(_c: ServiceContainer, configId: string): never {
  throw new ConfigurationError(`Importazione ${configId} non disponibile: ImportService non ancora implementato (12 §3)`);
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
    drive: new DriveServiceFacade(ServiceFactory.getDriveService()),
    gmail: new GmailServiceFacade(ServiceFactory.getMailService()),
    templates: new TemplateEngineFacade(),
    expressionEngine: new ExpressionEngineFacade(),
    now,
    logger
  });
  return runtime;
}

/** The JobRunnerLib runner bound to the container's registries. */
export function creaJobRunner(): JobRunnerService {
  return new JobRunnerService(ServiceFactory.getLogger(), ServiceFactory.getUtilitiesService(), new JobDefinitionRegistry(ServiceFactory.getLogger()));
}
