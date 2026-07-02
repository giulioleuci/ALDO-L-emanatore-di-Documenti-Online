import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { IDatabase } from '../../infrastructure/db/Database';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ContextBuilder } from '../context/ContextBuilder';
import type { GeneratorStrategy } from '../strategies/GeneratorStrategy';
import { DocumentoPipeline } from '../../infrastructure/pipelines/DocumentoPipeline';
import { PipelineContext } from '../../infrastructure/pipelines/PipelineContext';
import {
  AnalyzeContextStep, CheckDuplicatesStep, PrepareInfrastructureStep, GenerateNameStep,
  SelectTemplateStep, CloneTemplateStep, RenderTemplateStep, ApplyPermissionsStep,
  RegisterDocumentStep, PostProcessStep
} from '../../infrastructure/steps/documentSteps';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS } from '../../config/schema';
import { PipelineError } from '../../domain/errors/DomainError';

export class DocumentGenerationService {
  constructor(
    private readonly db: IDatabase,
    private readonly drive: IDriveFacade,
    private readonly contextBuilder: ContextBuilder,
    private readonly strategyRegistry: Map<string, GeneratorStrategy>
  ) {}

  generateForClasse(target: ClasseId, confDocId: string): { fileId: string | null; status: string } {
    const config = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
    if (!config) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
    const generatore = String(config[COL_CONF_DOC.GENERATORE]);
    if (!this.strategyRegistry.has(generatore)) throw new PipelineError(`GENERATORE non registrato: ${generatore}`);

    const cdu = this.contextBuilder.build(target);
    const ctx = new PipelineContext();
    ctx.set('config', config);
    ctx.set('cdu', cdu);

    new DocumentoPipeline((fileId) => this.drive.deleteFile(fileId))
      .addStep(new AnalyzeContextStep())
      .addStep(new CheckDuplicatesStep(this.db))
      .addStep(new PrepareInfrastructureStep(this.drive))
      .addStep(new GenerateNameStep())
      .addStep(new SelectTemplateStep())
      .addStep(new CloneTemplateStep(this.drive))
      .addStep(new RenderTemplateStep(this.strategyRegistry))
      .addStep(new ApplyPermissionsStep(this.drive))
      .addStep(new RegisterDocumentStep(this.db))
      .addStep(new PostProcessStep(this.db))
      .execute(ctx);

    const fileId = ctx.get<string>('newFileId') ?? null;
    const status = fileId
      ? String(this.db.table(TABLE.LOG_DOCS).find((r) => r[COL_LOG_DOCS.ID] === fileId)?.[COL_LOG_DOCS.STATO] ?? 'UNKNOWN')
      : 'SKIPPED';
    return { fileId, status };
  }
}
