import type { Cdu } from '../../application/context-engine/Cdu';
import type { IDriveFacade } from '../facades/DriveServiceFacade';
import type { ITemplateEngine } from '../facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../facades/ExpressionEngineFacade';
import type { IDatabase, Row } from '../db/Database';
import type { GeneratorStrategy } from '../../application/strategies/GeneratorStrategy';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { ConfigurazioneDocumentoRepository } from '../repositories/ConfigurazioneDocumentoRepository';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS, COL_LOG_FOLD } from '../../config/schema';
import { StatoDocumento, SchemaSottocartelle } from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';
import { executePostProcess, type PostProcessDb } from './postProcessActions';

/**
 * Pipeline steps of the document-generation process (ref 10), built on the
 * PipelineFramework (L3) `Step` base class: lifecycle, context validation
 * (requiredKeys), conditional execution (shouldExecuteCondition) and error
 * wrapping all come from the library. Only the business logic of each step
 * lives here (`_executeLogic`).
 *
 * Conditions (CONF_DOC.CONDIZIONE, conditional MODELLI) are evaluated by
 * GasExpressionEngineLib via ConfigurazioneDocumentoRepository; placeholder
 * strings (FILE_NAME, PATH_OUT) are rendered by WorkspaceTemplateEngine via
 * ITemplateEngine. Nothing is parsed or substituted in-house.
 */

/** Steps whose failure aborts the pipeline and rolls back the cloned file (10 §8). */
export const CRITICAL_STEPS: ReadonlySet<string> = new Set([
  'SelectTemplate',
  'CloneTemplate',
  'RenderTemplate',
  'RegisterDocument'
]);

/** Gate shared by every step after AnalyzeContext (10 §1). */
const generateGate = (ctx: PipelineContext): boolean => ctx.get('shouldGenerate') === true;

function cfg(ctx: PipelineContext): Row {
  return ctx.get<Row>('config')!;
}
function confDoc(ctx: PipelineContext): ConfigurazioneDocumento {
  return ctx.get<ConfigurazioneDocumento>('confDoc')!;
}
function cdu(ctx: PipelineContext): Cdu {
  return ctx.get<Cdu>('cdu')!;
}
function cduRecord(ctx: PipelineContext): Record<string, unknown> {
  return cdu(ctx) as unknown as Record<string, unknown>;
}
function classeNome(ctx: PipelineContext): string {
  return cdu(ctx).focus.classe?.anagrafica.nome ?? '';
}

/** Step 1 (10 §1): CONDIZIONE evaluated by GasExpressionEngineLib over the CDU. */
export class AnalyzeContextStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly configs: ConfigurazioneDocumentoRepository,
    private readonly engine: IExpressionEngine
  ) {
    super('AnalyzeContext', logger, { requiredKeys: ['config', 'confDoc', 'cdu'] });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    this.setResult(ctx, 'shouldGenerate', this.configs.shouldGenerate(confDoc(ctx), cduRecord(ctx), this.engine));
  }
}

/** Step 2 (10 §4): dedup on LOG_DOCS unless SCHEMA_SOTTOCARTELLE is MULTIPLO_PER_CLASSE. */
export class CheckDuplicatesStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly db: IDatabase
  ) {
    super('CheckDuplicates', logger, { shouldExecuteCondition: generateGate });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const schema = String(cfg(ctx)[COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]);
    if (schema === String(SchemaSottocartelle.MULTIPLO_PER_CLASSE)) return; // no dedup (10 §4)
    const idGen = String(cfg(ctx)[COL_CONF_DOC.ID]);
    const classe = classeNome(ctx);
    const existing = this.db.table(TABLE.LOG_DOCS).find(
      (r) => r[COL_LOG_DOCS.ID_GEN] === idGen && String(r[COL_LOG_DOCS.CLASSI] ?? '').split(',').includes(classe)
    );
    if (existing) {
      this.setResult(ctx, 'shouldGenerate', false);
      this.setResult(ctx, 'skipReason', `Duplicato per ${classe}`);
    }
  }
}

/** Step 3-4 (10 §5): PATH_OUT rendered by WorkspaceTemplateEngine; folder created + logged in LOG_FOLD. */
export class PrepareInfrastructureStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly drive: IDriveFacade,
    private readonly db: IDatabase,
    private readonly templates: ITemplateEngine
  ) {
    super('PrepareInfrastructure', logger, { shouldExecuteCondition: generateGate });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const path = this.templates.processString(String(cfg(ctx)[COL_CONF_DOC.PATH_OUT]), cduRecord(ctx));
    let folderId = this.drive.findFolderByPath(path);
    if (folderId === null) {
      // Folder did not exist: create it and register it in LOG_FOLD (ref 10 §5 step 4).
      folderId = this.drive.createFolder(path);
      const row: Row = {
        [COL_LOG_FOLD.ID]: folderId,
        [COL_LOG_FOLD.PATH]: path,
        [COL_LOG_FOLD.LINK]: `https://drive.google.com/drive/folders/${folderId}`
      };
      // Persisted by the service's transaction commit (SheetDBLib forbids
      // save() inside an open transaction).
      this.db.table(TABLE.LOG_FOLD).insert(row);
    }
    this.setResult(ctx, 'destFolderId', folderId);
    this.setResult(ctx, 'destFolderPath', path);
  }
}

/** Step 5 (10 §6): FILE_NAME rendered by WorkspaceTemplateEngine over the CDU. */
export class GenerateNameStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly templates: ITemplateEngine
  ) {
    super('GenerateName', logger, { shouldExecuteCondition: generateGate });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    this.setResult(ctx, 'nomeFile', this.templates.processString(String(cfg(ctx)[COL_CONF_DOC.FILE_NAME]), cduRecord(ctx)));
  }
}

/** Step 6 (10 §7): MODELLI resolution — conditional entries evaluated by GasExpressionEngineLib. */
export class SelectTemplateStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly configs: ConfigurazioneDocumentoRepository,
    private readonly engine: IExpressionEngine
  ) {
    super('SelectTemplate', logger, { shouldExecuteCondition: generateGate });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    this.setResult(ctx, 'templateId', this.configs.resolveTemplateId(confDoc(ctx), cduRecord(ctx), this.engine));
  }
}

/** Step 7 (10 §8): clone of the Drive template — point of no return. */
export class CloneTemplateStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly drive: IDriveFacade
  ) {
    super('CloneTemplate', logger, {
      shouldExecuteCondition: generateGate,
      requiredKeys: ['templateId', 'nomeFile', 'destFolderId']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const fileId = this.drive.copyFile(ctx.get<string>('templateId')!, ctx.get<string>('nomeFile')!, ctx.get<string>('destFolderId')!);
    this.setResult(ctx, 'newFileId', fileId);
    this.setResult(ctx, 'newFileLink', `https://drive.google.com/file/d/${fileId}/view`);
  }
}

/** Step 8 (10 §9): rendering delegated to the GENERATORE strategy (→ WorkspaceTemplateEngine). */
export class RenderTemplateStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly registry: Map<string, GeneratorStrategy>
  ) {
    super('RenderTemplate', logger, { shouldExecuteCondition: generateGate, requiredKeys: ['newFileId'] });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const generatore = String(cfg(ctx)[COL_CONF_DOC.GENERATORE]);
    const strategy = this.registry.get(generatore);
    if (!strategy) throw new PipelineError(`GENERATORE non registrato: ${generatore}`); // 10 §9
    strategy.render(ctx.get<string>('newFileId')!, cdu(ctx));
  }
}

/** Step 9 (10 §10): ACL application — full role-resolution ACLs land in the breadth plan (14). */
export class ApplyPermissionsStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly drive: IDriveFacade
  ) {
    super('ApplyPermissions', logger, {
      shouldExecuteCondition: (ctx) => generateGate(ctx) && cfg(ctx)[COL_CONF_DOC.PERMESSI] != null
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    // Slice scope: PERMESSI is null in the fixture, so this step is skipped.
    // Full role-resolution ACL application lands in the breadth plan (10 §10, 14).
    const perms = JSON.parse(String(cfg(ctx)[COL_CONF_DOC.PERMESSI])) as { file?: Array<{ ruolo: string; permesso: string }> };
    for (const p of perms.file ?? []) this.logger.info(`ACL ${p.ruolo}:${p.permesso}`);
    void this.drive;
  }
}

/** Step 10 (10 §11): audit row in LOG_DOCS. */
export class RegisterDocumentStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly db: IDatabase
  ) {
    super('RegisterDocument', logger, {
      shouldExecuteCondition: generateGate,
      requiredKeys: ['newFileId', 'nomeFile']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const row: Row = {
      [COL_LOG_DOCS.ID]: ctx.get<string>('newFileId')!,
      [COL_LOG_DOCS.ID_GEN]: String(cfg(ctx)[COL_CONF_DOC.ID]),
      [COL_LOG_DOCS.TIPO]: String(cfg(ctx)[COL_CONF_DOC.TIPO]),
      [COL_LOG_DOCS.NOME]: ctx.get<string>('nomeFile')!,
      [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
      [COL_LOG_DOCS.PATH]: ctx.get<string>('destFolderPath') ?? '',
      [COL_LOG_DOCS.LINK]: ctx.get<string>('newFileLink') ?? '',
      [COL_LOG_DOCS.CLASSI]: classeNome(ctx),
      [COL_LOG_DOCS.DATA_CREAZ]: cdu(ctx).meta.date.oggi.breve
    };
    // Persisted by the service's transaction commit (10 §11).
    this.db.table(TABLE.LOG_DOCS).insert(row);
  }
}

/** Step 11 (10 §12): POST_PROCESSO actions via the shared executor; persistence is the service transaction's. */
export class PostProcessStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly db: IDatabase & PostProcessDb,
    private readonly templates: ITemplateEngine,
    private readonly now: Date
  ) {
    super('PostProcess', logger, {
      shouldExecuteCondition: (ctx) => generateGate(ctx) && cfg(ctx)[COL_CONF_DOC.POST_PROCESSO] != null
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const updated = executePostProcess(
      String(cfg(ctx)[COL_CONF_DOC.POST_PROCESSO]),
      cduRecord(ctx),
      this.db,
      this.templates,
      this.now,
      this.logger
    );
    this.setResult(ctx, 'postProcessUpdated', updated);
  }
}
