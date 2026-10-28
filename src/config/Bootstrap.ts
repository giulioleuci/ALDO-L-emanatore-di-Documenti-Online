import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { IGmailFacade } from '../infrastructure/facades/GmailServiceFacade';
import type { ITemplateEngine } from '../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../infrastructure/facades/ExpressionEngineFacade';
import type { IPropertiesFacade } from '../infrastructure/facades/PropertiesFacade';
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
import { DocumentoGenericoGeneratorStrategy } from '../application/strategies/DocumentoGenericoGeneratorStrategy';
import { FoglioGenericoGeneratorStrategy } from '../application/strategies/FoglioGenericoGeneratorStrategy';
import { DocPersonalizzatoGeneratorStrategy } from '../application/strategies/DocPersonalizzatoGeneratorStrategy';
import { SheetMaterieGeneratorStrategy } from '../application/strategies/SheetMaterieGeneratorStrategy';
import { SheetMaterieConPermessiGeneratorStrategy } from '../application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { DocumentoConTabelleImportateGeneratorStrategy } from '../application/strategies/DocumentoConTabelleImportateGeneratorStrategy';
import { DocumentStrategyFactory } from '../application/factories/DocumentStrategyFactory';
import { DocumentTableFacade } from '../infrastructure/facades/DocumentTableFacade';
import { MateriaRepository } from '../infrastructure/repositories/MateriaRepository';
import { DocenteRepository } from '../infrastructure/repositories/DocenteRepository';
import { RuoloSpecialeRepository } from '../infrastructure/repositories/RuoloSpecialeRepository';
import { OreASLRepository } from '../infrastructure/repositories/OreASLRepository';
import { MovimentoAlunnoRepository } from '../infrastructure/repositories/MovimentoAlunnoRepository';
import { DipartimentoRepository } from '../infrastructure/repositories/DipartimentoRepository';
import { CarenzaRepository } from '../infrastructure/repositories/CarenzaRepository';
import { ConfigurazioneEmailRepository } from '../infrastructure/repositories/ConfigurazioneEmailRepository';
import { ProgettoRepository } from '../infrastructure/repositories/ProgettoRepository';
import { ContextEngineFactory } from '../application/context-engine/ContextEngineFactory';
import type { ContextBuilder } from '../application/context-engine/ContextBuilder';
import { ConfigurazioneDocumentoRepository } from '../infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ConfigurazioneImportRepository } from '../infrastructure/repositories/ConfigurazioneImportRepository';
import { ClasseRepository } from '../infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../infrastructure/repositories/AlunnoRepository';
import { LogCartellaRepository } from '../infrastructure/repositories/LogCartellaRepository';
import { LogDocumentoRepository } from '../infrastructure/repositories/LogDocumentoRepository';
import { BounceReconciliationService } from '../application/email/BounceReconciliationService';
import { LogEmailRepository } from '../infrastructure/repositories/LogEmailRepository';
import { LogJobRepository } from '../infrastructure/repositories/LogJobRepository';
import { SupplenzaRepository } from '../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../infrastructure/repositories/VariazioneCattedraRepository';
import {
  SessionActiveUserFacade,
  type IActiveUserFacade
} from '../infrastructure/facades/ActiveUserFacade';
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
import { ConfigurationError } from '../domain/errors/DomainError';
import type { ITeachingAssignmentResolver } from '../application/ports/ITeachingAssignmentResolver';
import { AldoTeachingAssignmentResolver } from '../infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import {
  DatabaseValidationService,
  type ValidationReport
} from '../application/services/DatabaseValidationService';
import {
  SpreadsheetReportFacade,
  type ISpreadsheetReportFacade
} from '../infrastructure/facades/SpreadsheetReportFacade';
import {
  LockDocumentsService,
  type LockOutcome
} from '../application/services/LockDocumentsService';
import {
  MasterStoricoDatabaseProvider,
  type StoricoDatabaseProvider
} from '../application/storico/StoricoDatabaseProvider';
import { StoricoDocumentiService } from '../application/storico/StoricoDocumentiService';
import { ActionBatchService } from '../application/services/ActionBatchService';

/** Every seam the container wiring needs; tests inject fakes, initAldo() injects the real ones. */
interface BootstrapDeps {
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
  /**
   * ScriptProperties port (15 §7), also handed to `EmailBatchService` so it can
   * persist its own pattern-scoped quota-suspend checkpoint outside
   * JobRunnerLib's own resume state (see `EmailBatchService`'s class
   * docstring) — a generator `return` after a quota suspend makes JobRunnerLib
   * discard `resumeState`, so a naive restart would re-send to every
   * already-processed recipient without this.
   */
  properties?: IPropertiesFacade;
  now: Date;
  logger?: LoggerService;
  /**
   * Report-sheet writer (Feature 2). Optional for the same reason as
   * `spreadsheets`: building the real one needs a live SpreadsheetService.
   */
  report?: ISpreadsheetReportFacade;
  /** Running-user identity (NEW_TABLE_LOG_JOB.md ESEGUITO_DA) — defaults to the real GAS session user. */
  activeUser?: IActiveUserFacade;
}

/**
 * DI wiring (08 §2, 12 §5): registers every application service as a lazy
 * singleton. Pure composition — no business logic, no native access.
 */
export function buildAldoContainer(deps: BootstrapDeps): ServiceContainer {
  const c = new ServiceContainer();
  const logger = deps.logger ?? new LoggerService();
  const activeUser = deps.activeUser ?? new SessionActiveUserFacade();

  c.register('logger', () => logger);
  c.register('activeUser', () => activeUser);
  c.register('db', () => deps.db);
  c.register('drive', () => deps.drive);
  c.register('storicoDb', () => new MasterStoricoDatabaseProvider(deps.master, logger));
  c.register(
    'storicoDocumenti',
    (container) => new StoricoDocumentiService(container.get<StoricoDatabaseProvider>('storicoDb'))
  );
  c.register('classi', () => new ClasseRepository(deps.db));
  c.register('docenti', () => new DocenteRepository(deps.db));
  c.register('alunni', () => new AlunnoRepository(deps.db));
  c.register('materie', () => new MateriaRepository(deps.db));
  c.register('variazioni', () => new VariazioneCattedraRepository(deps.db));
  c.register('supplenze', () => new SupplenzaRepository(deps.db));
  c.register('ruoliSpeciali', () => new RuoloSpecialeRepository(deps.db));
  c.register('dipartimenti', () => new DipartimentoRepository(deps.db));
  c.register('oreAsl', () => new OreASLRepository(deps.db));
  c.register('movimenti', () => new MovimentoAlunnoRepository(deps.db));
  c.register('carenze', () => new CarenzaRepository(deps.db));
  c.register(
    'logDocumenti',
    (container) =>
      new LogDocumentoRepository(
        deps.db,
        new LazyRef(() => container.get<ClasseRepository>('classi'))
      )
  );
  c.register('progetti', () => new ProgettoRepository(deps.db));
  c.register('logEmail', () => new LogEmailRepository(deps.db));
  c.register('logJob', () => new LogJobRepository(deps.db));
  c.register('configurazioniEmail', () => new ConfigurazioneEmailRepository(deps.db));
  c.register('teachingAssignmentResolver', () => new AldoTeachingAssignmentResolver(deps.db));
  c.register(
    'risolutoreRuoli',
    (container) =>
      new RisolutoreRuoliService({
        classi: container.get<ClasseRepository>('classi'),
        docenti: container.get<DocenteRepository>('docenti'),
        alunni: container.get<AlunnoRepository>('alunni'),
        dipartimenti: container.get<DipartimentoRepository>('dipartimenti'),
        materie: container.get<MateriaRepository>('materie'),
        ruoli: container.get<RuoloSpecialeRepository>('ruoliSpeciali'),
        teachingAssignments: container.get<ITeachingAssignmentResolver>(
          'teachingAssignmentResolver'
        )
      })
  );
  c.register('contextBuilder', (container) =>
    ContextEngineFactory.create({
      master: deps.master,
      teachingAssignments: container.get<ITeachingAssignmentResolver>('teachingAssignmentResolver'),
      ruoli: container.get<RuoloSpecialeRepository>('ruoliSpeciali'),
      docenti: container.get<DocenteRepository>('docenti'),
      classi: container.get<ClasseRepository>('classi'),
      alunni: container.get<AlunnoRepository>('alunni'),
      materie: container.get<MateriaRepository>('materie'),
      oreAsl: container.get<OreASLRepository>('oreAsl'),
      movimenti: container.get<MovimentoAlunnoRepository>('movimenti'),
      logDocs: container.get<LogDocumentoRepository>('logDocumenti'),
      progetti: container.get<ProgettoRepository>('progetti'),
      dipartimenti: container.get<DipartimentoRepository>('dipartimenti'),
      variazioni: container.get<VariazioneCattedraRepository>('variazioni'),
      supplenze: container.get<SupplenzaRepository>('supplenze'),
      storicoDb: container.get<StoricoDatabaseProvider>('storicoDb')
    })
  );
  if (deps.spreadsheets !== undefined) {
    c.register('spreadsheets', () => deps.spreadsheets!);
  }
  c.register('strategyFactory', (container) => {
    // Replaces the old GENERATORE-keyed registry (10 §9): the base engine is
    // chosen from FORMATO, not a lookup key. The Sheet/Doc-structural
    // strategies need a live SpreadsheetService/DocumentService
    // (deps.spreadsheets/deps.documents, GAS-only) — left undefined (and thus
    // DocumentStrategyFactory.resolve throws typed) when running off-GAS.
    const docGenerico = new DocumentoGenericoGeneratorStrategy(deps.templates);
    const foglioGenerico = new FoglioGenericoGeneratorStrategy(deps.templates);
    const docPersonalizzato = new DocPersonalizzatoGeneratorStrategy(deps.templates);
    let docTabelle: DocumentoConTabelleImportateGeneratorStrategy | undefined;
    let sheetMaterie: SheetMaterieGeneratorStrategy | undefined;
    let sheetPermessi: SheetMaterieConPermessiGeneratorStrategy | undefined;
    if (deps.spreadsheets !== undefined) {
      const materie = container.get<MateriaRepository>('materie');
      sheetMaterie = new SheetMaterieGeneratorStrategy(deps.spreadsheets, materie, deps.templates);
      sheetPermessi = new SheetMaterieConPermessiGeneratorStrategy(
        deps.spreadsheets,
        materie,
        deps.templates,
        container.get<RisolutoreRuoliService>('risolutoreRuoli')
      );
      if (deps.documents !== undefined) {
        docTabelle = new DocumentoConTabelleImportateGeneratorStrategy(
          deps.templates,
          deps.spreadsheets,
          new DocumentTableFacade(deps.documents),
          logger
        );
      }
    }
    return new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
  });
  c.register(
    'documentGenerationService',
    (container) =>
      new DocumentGenerationService({
        db: deps.db,
        drive: deps.drive,
        contextBuilder: container.get<ContextBuilder>('contextBuilder'),
        strategyFactory: container.get<DocumentStrategyFactory>('strategyFactory'),
        templates: deps.templates,
        expressionEngine: deps.expressionEngine,
        configs: new ConfigurazioneDocumentoRepository(deps.db),
        roleResolver: container.get<RisolutoreRuoliService>('risolutoreRuoli'),
        classi: container.get<ClasseRepository>('classi'),
        storicoDocumenti: container.get<StoricoDocumentiService>('storicoDocumenti'),
        now: deps.now,
        logger
      })
  );
  c.register(
    'documentBatchService',
    (container) =>
      new DocumentBatchService(
        container.get<ClasseRepository>('classi'),
        container.get<AlunnoRepository>('alunni'),
        new ConfigurazioneDocumentoRepository(deps.db),
        container.get<DocumentGenerationService>('documentGenerationService'),
        container.get<ITeachingAssignmentResolver>('teachingAssignmentResolver'),
        deps.now,
        container.get<DipartimentoRepository>('dipartimenti'),
        logger,
        container.get<LogJobRepository>('logJob'),
        activeUser
      )
  );
  c.register(
    'emailNotificationService',
    (container) =>
      new EmailNotificationService({
        db: deps.db,
        gmail: deps.gmail,
        drive: deps.drive,
        templates: deps.templates,
        now: deps.now,
        contextBuilder: container.get<ContextBuilder>('contextBuilder'),
        expressionEngine: deps.expressionEngine,
        docenti: container.get<DocenteRepository>('docenti'),
        alunni: container.get<AlunnoRepository>('alunni'),
        dipartimenti: container.get<DipartimentoRepository>('dipartimenti'),
        classi: container.get<ClasseRepository>('classi'),
        carenze: container.get<CarenzaRepository>('carenze'),
        confMail: container.get<ConfigurazioneEmailRepository>('configurazioniEmail'),
        logMail: container.get<LogEmailRepository>('logEmail'),
        logDocs: container.get<LogDocumentoRepository>('logDocumenti'),
        master: deps.master,
        materie: container.get<MateriaRepository>('materie'),
        aggregatoreDati: container.get<AggregatoreDati>('aggregatoreDati'),
        teachingAssignments: container.get<ITeachingAssignmentResolver>(
          'teachingAssignmentResolver'
        ),
        logger
      })
  );
  c.register(
    'emailBatchService',
    (container) =>
      new EmailBatchService(
        container.get<EmailNotificationService>('emailNotificationService'),
        deps.properties,
        logger,
        container.get<LogJobRepository>('logJob'),
        activeUser
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
        { logger, logJob: container.get<LogJobRepository>('logJob'), activeUser }
      )
  );
  c.register(
    'bounceReconciliationService',
    () =>
      new BounceReconciliationService({
        gmail: deps.gmail,
        logMail: new LogEmailRepository(deps.db),
        master: deps.master,
        activeUser,
        logger,
        now: () => deps.now
      })
  );
  if (deps.importEngine !== undefined) {
    const engine = deps.importEngine;
    c.register(
      'importService',
      (container) =>
        new ImportService(
          engine,
          new ConfigurazioneImportRepository(deps.db),
          logger,
          container.get<LogJobRepository>('logJob'),
          activeUser
        )
    );
  }
  c.register('reportService', () => new ReportService(deps.db));
  if (deps.report !== undefined) {
    const report = deps.report;
    c.register(
      'databaseValidationService',
      () => new DatabaseValidationService({ db: deps.db, master: deps.master, report, logger })
    );
  }
  c.register('aggregatoreDati', () => new AggregatoreDati(deps.db));
  c.register('alberoCartelle', () => new AlberoCartelle(deps.drive, deps.db));
  c.register(
    'lockDocumentsService',
    (container) =>
      new LockDocumentsService({
        logDocs: container.get<LogDocumentoRepository>('logDocumenti'),
        drive: deps.drive,
        logger
      })
  );
  c.register(
    'actionBatchService',
    (container) =>
      new ActionBatchService({
        db: deps.db,
        contextBuilder: container.get<ContextBuilder>('contextBuilder'),
        expressionEngine: deps.expressionEngine,
        templates: deps.templates,
        drive: deps.drive,
        roles: container.get<RisolutoreRuoliService>('risolutoreRuoli'),
        classi: container.get<ClasseRepository>('classi'),
        alunni: container.get<AlunnoRepository>('alunni'),
        dipartimenti: container.get<DipartimentoRepository>('dipartimenti'),
        teachingAssignments: container.get<ITeachingAssignmentResolver>(
          'teachingAssignmentResolver'
        ),
        now: deps.now,
        storico: container.get<StoricoDocumentiService>('storicoDocumenti'),
        bounces: container.get<BounceReconciliationService>('bounceReconciliationService'),
        // VALIDA_DB is unavailable off-GAS for the same reason as the menu
        // validation launcher: no SpreadsheetService, no report sheet.
        ...(c.has('databaseValidationService')
          ? { validator: container.get<DatabaseValidationService>('databaseValidationService') }
          : {}),
        logger,
        logJob: container.get<LogJobRepository>('logJob'),
        activeUser
      })
  );
  return c;
}

/** Data-driven launcher (15 §4): batch document generation for a CONF_DOC id. */
export function avviaGenerazioneDataDriven(
  c: ServiceContainer,
  configId: string,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown {
  return c
    .get<DocumentBatchService>('documentBatchService')
    .start(runner, `gen_${configId}`, configId, false, maxDurationMs);
}

/** Data-driven launcher (15 §4): mass email for a CONF_MAIL pattern. */
export function avviaInvioNotificheDataDriven(
  c: ServiceContainer,
  patternId: string,
  runner: JobRunnerService,
  maxDurationMs?: number,
  testRecipient?: string,
  chunkSize?: number
): unknown {
  return c
    .get<EmailBatchService>('emailBatchService')
    .start(runner, `mail_${patternId}`, patternId, false, maxDurationMs, testRecipient, chunkSize);
}

/** Data-driven launcher (15 §4): scheduled retry of failed LOG_MAIL sends (11 §16). */
export function avviaRetryEmailDataDriven(
  c: ServiceContainer,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown {
  return c
    .get<EmailRetryService>('emailRetryService')
    .start(runner, 'retry_email', false, maxDurationMs);
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
 * Data-driven launcher (15 §4): chunked/resumable ETL import
 * (GasDataImporter.md "Resumable/chunked imports"). Alternative path for
 * CONF_IMP recipes whose source can exceed a single GAS execution window —
 * `avviaImportazioneDataDriven` (synchronous) remains the default/primary
 * launcher; this one is wired in addition, not instead. See
 * `ImportService`'s class docstring for the Ghost Record Detection gap this
 * path does not yet cover.
 */
export function avviaImportazioneChunkedDataDriven(
  c: ServiceContainer,
  configId: string,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown {
  if (!c.has('importService')) {
    throw new ConfigurationError(
      `Importazione ${configId} non disponibile: nessun ImportEngine configurato (12 §3, richiede DriveService/SpreadsheetService live)`
    );
  }
  return c
    .get<ImportService>('importService')
    .start(runner, `imp_chunked_${configId}`, configId, false, maxDurationMs);
}

/** Data-driven launcher (15 §4): synchronous DB validation (Feature 2). Not a JobRunner job — one pass over the sheets. */
export function avviaValidazioneDatabase(c: ServiceContainer): ValidationReport {
  if (!c.has('databaseValidationService')) {
    throw new ConfigurationError(
      'Validazione database non disponibile: nessun SpreadsheetService configurato (richiede esecuzione su GAS)'
    );
  }
  return c.get<DatabaseValidationService>('databaseValidationService').esegui();
}

/** Data-driven launcher (15 §4): downgrades write access on every LOG_DOCS document (Feature 3). Synchronous — no JobRunner. */
export function avviaBloccoDocumenti(c: ServiceContainer): LockOutcome {
  return c.get<LockDocumentsService>('lockDocumentsService').bloccaTutti();
}

/** Data-driven launcher (15 §4): standalone azioni for one or more CONF_AZIONI ids. */
export function avviaAzioniDataDriven(
  c: ServiceContainer,
  azioneIds: string[],
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown {
  const service = c.get<ActionBatchService>('actionBatchService');
  for (const id of azioneIds) {
    const azione = service.findAzione(id);
    if (azione === null) throw new ConfigurationError(`CONF_AZIONI ${id} non trovata`);
    if (!azione.isAttivo()) throw new ConfigurationError(`CONF_AZIONI ${id} non è attiva`);
  }
  const jobName = azioneIds.length === 1 ? `azioni_${azioneIds[0]!}` : 'azioni_TUTTE';
  return service.start(runner, jobName, azioneIds, false, maxDurationMs);
}

/** The enabled CONF_AZIONI rows, for the menu dialog and the user entrypoints. */
export function elencoAzioniAttive(c: ServiceContainer): Array<{ id: string; tipo: string }> {
  return c.get<ActionBatchService>('actionBatchService').elencoAttive();
}

/**
 * Resume entry (15 §5): JobRunnerLib's timed trigger invokes the global
 * `resumeJob`; jobName '' lets the library resolve it from the trigger context
 * (`job_for_trigger_<id>` in ScriptProperties). All batch registries are
 * re-registered — the library picks the handler by the persisted job type.
 * `importService` is only registered when a live `ImportEngine` was wired
 * (12 §3, requires live DriveService/SpreadsheetService) — same guard as
 * `avviaImportazioneDataDriven`/`avviaImportazioneChunkedDataDriven` above.
 */
export function riprendiJobSospeso(
  c: ServiceContainer,
  runner: JobRunnerService,
  jobName = '',
  maxDurationMs?: number
): unknown {
  const documenti = c.get<DocumentBatchService>('documentBatchService');
  const email = c.get<EmailBatchService>('emailBatchService');
  const retry = c.get<EmailRetryService>('emailRetryService');
  const importazione = c.has('importService') ? c.get<ImportService>('importService') : null;
  const azioni = c.get<ActionBatchService>('actionBatchService');
  return runner.resume(
    jobName,
    (queue) => {
      documenti.registerJobHandlers(queue);
      email.registerJobHandlers(queue);
      retry.registerJobHandlers(queue);
      importazione?.registerJobHandlers(queue);
      azioni.registerJobHandlers(queue);
    },
    maxDurationMs
  );
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
export function initAldo(
  now: Date = new Date(),
  props?: IPropertiesFacade,
  masterSpreadsheetId?: string,
  /** Online-test containers pass true — see DriveServiceFacade's notifyOnShare doc. */
  driveNotifyOnShare = false
): ServiceContainer {
  if (runtime !== null) return runtime;
  const logger = ServiceFactory.getLogger();
  const properties = props ?? new ScriptPropertiesFacade();
  const spreadsheetService = ServiceFactory.getSpreadsheetService();
  const masterId = masterSpreadsheetId ?? spreadsheetService.getActiveStandard().getId();
  const utils = ServiceFactory.getUtils();
  const cache = ServiceFactory.getCacheService().getScriptCache();
  const exceptionService = ServiceFactory.getExceptionService();
  const masterDb = new SheetDbAdapter(
    new DatabaseService(masterId, logger, utils, cache, exceptionService, {
      verifyTables: [TABLE.MASTER]
    })
  );
  const masterRepo = new MasterSheetRepository(masterDb);
  const annoCorrente = masterRepo.findConfigAnnoCorrente();
  const db = new SheetDbAdapter(
    new DatabaseService(annoCorrente.idSpreadsheet, logger, utils, cache, exceptionService, {
      verifyTables: Object.values(TABLE).filter((t) => t !== TABLE.MASTER)
    })
  );

  const driveService = ServiceFactory.getDriveService();
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
    db.getDatabaseService(),
    null, // expressionEngine — GasDataImporter's calculated-field feature, unused by ALDO's current CONF_IMP recipes
    null // exceptionService — ALDO doesn't inject GasResilienceLib retry here today; out of scope for this task
  );
  const driveFacade = new DriveServiceFacade(
    ServiceFactory.getDriveService(),
    ServiceFactory.getPermissionService(),
    annoCorrente.idCartellaRoot,
    documentService,
    driveNotifyOnShare
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
    properties,
    now,
    logger,
    report: new SpreadsheetReportFacade(spreadsheetService)
  });

  // CERCA_CARTELLE_CLASSE/CERCA_DOCUMENTI (12 §3) are ALDO-specific source
  // strategies, not part of the library's built-in vocabulary — registered
  // here at the composition root so ImportRecipeMapper's recipes resolve.
  // Reuses the container's shared repositories rather than opening private
  // ones, so import-source registration doesn't pay for its own MATERIE scan.
  importEngine.registerCustomSource(
    'CERCA_CARTELLE_CLASSE',
    createCercaCartelleClasseStrategy(
      container.get<ClasseRepository>('classi'),
      new LogCartellaRepository(db),
      driveService,
      spreadsheetService
    )
  );
  importEngine.registerCustomSource(
    'CERCA_DOCUMENTI',
    createCercaDocumentiStrategy(
      container.get<LogDocumentoRepository>('logDocumenti'),
      spreadsheetService,
      driveService
    )
  );

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
    container.get<EmailNotificationService>('emailNotificationService').enableTestMode(ownerEmail);
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
