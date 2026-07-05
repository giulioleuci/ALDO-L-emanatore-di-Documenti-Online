import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { IDatabase } from '../../infrastructure/db/Database';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { ConfigurazioneDocumentoRepository } from '../../infrastructure/repositories/ConfigurazioneDocumentoRepository';
import type { ContextBuilder } from '../context-engine/ContextBuilder';
import type { GeneratorStrategy } from '../strategies/GeneratorStrategy';
import { recipe } from '../context-engine/Recipe';
import {
  AnalyzeContextStep, CheckDuplicatesStep, PrepareInfrastructureStep, GenerateNameStep,
  SelectTemplateStep, CloneTemplateStep, RenderTemplateStep, ApplyPermissionsStep,
  RegisterDocumentStep, PostProcessStep, CRITICAL_STEPS
} from '../../infrastructure/steps/documentSteps';
import type { PostProcessDb } from '../../infrastructure/steps/postProcessActions';
import { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS } from '../../config/schema';
import { PipelineError } from '../../domain/errors/DomainError';

export interface DocumentGenerationDeps {
  /** Persistence port + the RepositoryDatabase seam (POST_PROCESSO row updates). */
  db: IDatabase & PostProcessDb;
  drive: IDriveFacade;
  /** Modular CDU assembler (context-engine, spec 09) wired via ContextEngineFactory. */
  contextBuilder: ContextBuilder;
  strategyRegistry: Map<string, GeneratorStrategy>;
  /** WorkspaceTemplateEngine port (FILE_NAME/PATH_OUT strings + document rendering). */
  templates: ITemplateEngine;
  /** GasExpressionEngineLib port (CONDIZIONE + conditional MODELLI). */
  expressionEngine: IExpressionEngine;
  configs: ConfigurazioneDocumentoRepository;
  /** Injected clock — the CDU dates must be deterministic (09 §2). */
  now: Date;
  logger?: LoggerService;
}

/**
 * Document-generation application service (ref 10). Orchestration is delegated
 * to the PipelineFramework (L3) `Pipeline`: sequential execution, per-step
 * telemetry/history, conditional skipping and error routing all come from the
 * library. SGSA adds only its business policy: which steps compose the
 * document pipeline, which are critical (rollback of the cloned file + stop,
 * 10 §8), and the CDU assembly recipe.
 */
export class DocumentGenerationService {
  private readonly db: IDatabase & PostProcessDb;
  private readonly drive: IDriveFacade;
  private readonly contextBuilder: ContextBuilder;
  private readonly strategyRegistry: Map<string, GeneratorStrategy>;
  private readonly templates: ITemplateEngine;
  private readonly expressionEngine: IExpressionEngine;
  private readonly configs: ConfigurazioneDocumentoRepository;
  private readonly now: Date;
  private readonly logger: LoggerService;

  constructor(deps: DocumentGenerationDeps) {
    this.db = deps.db;
    this.drive = deps.drive;
    this.contextBuilder = deps.contextBuilder;
    this.strategyRegistry = deps.strategyRegistry;
    this.templates = deps.templates;
    this.expressionEngine = deps.expressionEngine;
    this.configs = deps.configs;
    this.now = deps.now;
    this.logger = deps.logger ?? new LoggerService();
  }

  generateForClasse(target: ClasseId, confDocId: string): { fileId: string | null; status: string } {
    const row = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
    if (!row) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
    const config = ConfigurazioneDocumento.fromData(row);
    if (!this.strategyRegistry.has(config.generatore)) {
      throw new PipelineError(`GENERATORE non registrato: ${config.generatore}`);
    }

    const cdu = this.contextBuilder.build(
      {
        target: target.value,
        tipoTarget: 'classe',
        now: this.now,
        idConfigurazione: confDocId,
        tipoOperazione: 'GENERAZIONE_DOCUMENTO'
      },
      recipe('CLASSE_COMPLETA')
    );

    // SheetDBLib transaction boundary (10 §11): every sheet mutation performed
    // by the steps (LOG_FOLD, LOG_DOCS) is committed only when the pipeline ran
    // to completion; a critical failure reverts the DB alongside the Drive
    // rollback performed in the onError hook.
    this.db.beginTransaction();
    let ctx: PipelineContext;
    try {
      ctx = this.buildPipeline().execute({ config: row, confDoc: config, cdu });
    } catch (e) {
      this.db.rollback();
      throw e;
    }

    const critical = ctx.getFlag<string>('criticalError');
    if (critical !== null) {
      this.db.rollback();
      throw new PipelineError(critical);
    }
    this.db.commit();

    const fileId = ctx.get<string>('newFileId');
    const status = fileId !== null
      ? String(this.db.table(TABLE.LOG_DOCS).find((r) => r[COL_LOG_DOCS.ID] === fileId)?.[COL_LOG_DOCS.STATO] ?? 'UNKNOWN')
      : 'SKIPPED';
    return { fileId, status };
  }

  /**
   * The document pipeline (10 §1-§12) on the library orchestrator. stopOnError
   * is false so non-critical failures are recorded in the execution history and
   * the pipeline continues (old `critical` flag semantics); a critical failure
   * rolls back the orphan clone and requests a graceful stop.
   */
  private buildPipeline(): Pipeline {
    const pipeline = new Pipeline(this.logger, null, { name: 'DocumentoPipeline', stopOnError: false });
    pipeline
      .addStep(new AnalyzeContextStep(this.logger, this.configs, this.expressionEngine))
      .addStep(new CheckDuplicatesStep(this.logger, this.db))
      .addStep(new PrepareInfrastructureStep(this.logger, this.drive, this.db, this.templates))
      .addStep(new GenerateNameStep(this.logger, this.templates))
      .addStep(new SelectTemplateStep(this.logger, this.configs, this.expressionEngine))
      .addStep(new CloneTemplateStep(this.logger, this.drive))
      .addStep(new RenderTemplateStep(this.logger, this.strategyRegistry))
      .addStep(new ApplyPermissionsStep(this.logger, this.drive))
      .addStep(new RegisterDocumentStep(this.logger, this.db))
      .addStep(new PostProcessStep(this.logger, this.db, this.templates, this.now));

    pipeline.onError((step, ctx, error) => {
      if (!CRITICAL_STEPS.has(step.getName())) return;
      const orphan = ctx.get<string>('newFileId');
      if (orphan !== null) this.drive.deleteFile(orphan); // rollback of the clone (10 §8)
      ctx.setFlag('criticalError', `${step.getName()}: ${error.message}`);
      ctx.requestStop(`critical step failed: ${step.getName()}`);
    });

    return pipeline;
  }
}
