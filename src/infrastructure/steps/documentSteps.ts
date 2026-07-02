import { Step } from '../pipelines/Step';
import type { PipelineContext } from '../pipelines/PipelineContext';
import type { Cdu } from '../../application/context/Cdu';
import type { IDriveFacade } from '../facades/DriveServiceFacade';
import type { IDatabase, Row } from '../db/Database';
import type { GeneratorStrategy } from '../../application/strategies/GeneratorStrategy';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS, COL_LOG_FOLD } from '../../config/schema';
import { StatoDocumento, SchemaSottocartelle } from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';

// Minimal placeholder resolver over CDU dotted paths (production: WorkspaceTemplateEngine).
export function resolvePlaceholders(template: string, cdu: Cdu): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_m, path: string) => {
    const parts = path.trim().split('.');
    let cur: unknown = cdu;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p];
      else return '';
    }
    if (cur == null) return '';
    return typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean' ? String(cur) : '';
  });
}
function cfg(ctx: PipelineContext): Row { return ctx.get<Row>('config')!; }
function cdu(ctx: PipelineContext): Cdu { return ctx.get<Cdu>('cdu')!; }

export class AnalyzeContextStep extends Step {
  readonly name = 'AnalyzeContextStep';
  protected _executeLogic(ctx: PipelineContext): void {
    const cond = cfg(ctx)[COL_CONF_DOC.CONDIZIONE];
    // Slice scope: empty/null condition => generate. Non-empty conditions are evaluated by
    // GasExpressionEngineLib in the breadth plan (10 §3).
    ctx.set('shouldGenerate', cond == null || String(cond).trim() === '');
  }
}

export class CheckDuplicatesStep extends Step {
  readonly name = 'CheckDuplicatesStep';
  constructor(private readonly db: IDatabase) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const schema = String(cfg(ctx)[COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]);
    if (schema === String(SchemaSottocartelle.MULTIPLO_PER_CLASSE)) return; // no dedup (10 §4)
    const idGen = String(cfg(ctx)[COL_CONF_DOC.ID]);
    const classe = cdu(ctx).focus.classe.anagrafica.nome;
    const existing = this.db.table(TABLE.LOG_DOCS).find(
      (r) => r[COL_LOG_DOCS.ID_GEN] === idGen && String(r[COL_LOG_DOCS.CLASSI] ?? '').split(',').includes(classe)
    );
    if (existing) { ctx.set('shouldGenerate', false); ctx.addError(`Duplicato per ${classe}`); }
  }
}

export class PrepareInfrastructureStep extends Step {
  readonly name = 'PrepareInfrastructureStep';
  constructor(
    private readonly drive: IDriveFacade,
    private readonly db: IDatabase
  ) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const path = resolvePlaceholders(String(cfg(ctx)[COL_CONF_DOC.PATH_OUT]), cdu(ctx));
    let folderId = this.drive.findFolderByPath(path);
    if (folderId === null) {
      // Folder did not exist: create it and register it in LOG_FOLD (ref 10 §5 step 4).
      folderId = this.drive.createFolder(path);
      const row: Row = {
        [COL_LOG_FOLD.ID]: folderId,
        [COL_LOG_FOLD.PATH]: path,
        [COL_LOG_FOLD.LINK]: `https://drive.google.com/drive/folders/${folderId}`
      };
      this.db.table(TABLE.LOG_FOLD).insert(row);
      this.db.save();
    }
    ctx.set('destFolderId', folderId);
    ctx.set('destFolderPath', path);
  }
}

export class GenerateNameStep extends Step {
  readonly name = 'GenerateNameStep';
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    ctx.set('nomeFile', resolvePlaceholders(String(cfg(ctx)[COL_CONF_DOC.FILE_NAME]), cdu(ctx)));
  }
}

export class SelectTemplateStep extends Step {
  readonly name = 'SelectTemplateStep';
  protected override critical = true;
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const raw = cfg(ctx)[COL_CONF_DOC.MODELLI];
    if (raw == null) throw new PipelineError('CONF_DOC.MODELLI obbligatorio'); // 10 §7
    const parsed = JSON.parse(String(raw)) as { templateId?: string } | Array<{ condizione: string; templateId: string }>;
    if (Array.isArray(parsed)) {
      // Slice scope: pick first with condizione 'true'; full evaluation in breadth plan.
      const match = parsed.find((m) => m.condizione.trim() === 'true');
      if (!match) throw new PipelineError('Nessun template applicabile');
      ctx.set('templateId', match.templateId);
    } else {
      if (!parsed.templateId) throw new PipelineError('templateId mancante');
      ctx.set('templateId', parsed.templateId);
    }
  }
}

export class CloneTemplateStep extends Step {
  readonly name = 'CloneTemplateStep';
  protected override critical = true; // point of no return (10 §8)
  constructor(private readonly drive: IDriveFacade) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const fileId = this.drive.copyFile(
      ctx.get<string>('templateId')!, ctx.get<string>('nomeFile')!, ctx.get<string>('destFolderId')!
    );
    ctx.set('newFileId', fileId);
    ctx.set('newFileLink', `https://drive.google.com/file/d/${fileId}/view`);
  }
}

export class RenderTemplateStep extends Step {
  readonly name = 'RenderTemplateStep';
  protected override critical = true;
  constructor(private readonly registry: Map<string, GeneratorStrategy>) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const generatore = String(cfg(ctx)[COL_CONF_DOC.GENERATORE]);
    const strategy = this.registry.get(generatore);
    if (!strategy) throw new PipelineError(`GENERATORE non registrato: ${generatore}`); // 10 §9
    strategy.render(ctx.get<string>('newFileId')!, cdu(ctx));
  }
}

export class ApplyPermissionsStep extends Step {
  readonly name = 'ApplyPermissionsStep';
  constructor(private readonly drive: IDriveFacade) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean {
    return ctx.get('shouldGenerate') === true && cfg(ctx)[COL_CONF_DOC.PERMESSI] != null;
  }
  protected _executeLogic(ctx: PipelineContext): void {
    // Slice scope: PERMESSI is null in the fixture, so this step is skipped.
    // Full role-resolution ACL application lands in the breadth plan (10 §10, 14).
    const perms = JSON.parse(String(cfg(ctx)[COL_CONF_DOC.PERMESSI])) as { file?: Array<{ ruolo: string; permesso: string }> };
    for (const p of perms.file ?? []) ctx.addSuccess(`ACL ${p.ruolo}:${p.permesso}`);
    void this.drive;
  }
}

export class RegisterDocumentStep extends Step {
  readonly name = 'RegisterDocumentStep';
  protected override critical = true;
  constructor(private readonly db: IDatabase) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const row: Row = {
      [COL_LOG_DOCS.ID]: ctx.get<string>('newFileId')!,
      [COL_LOG_DOCS.ID_GEN]: String(cfg(ctx)[COL_CONF_DOC.ID]),
      [COL_LOG_DOCS.TIPO]: String(cfg(ctx)[COL_CONF_DOC.TIPO]),
      [COL_LOG_DOCS.NOME]: ctx.get<string>('nomeFile')!,
      [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
      [COL_LOG_DOCS.PATH]: ctx.get<string>('destFolderPath') ?? '',
      [COL_LOG_DOCS.LINK]: ctx.get<string>('newFileLink') ?? '',
      [COL_LOG_DOCS.CLASSI]: cdu(ctx).focus.classe.anagrafica.nome,
      [COL_LOG_DOCS.DATA_CREAZ]: cdu(ctx).meta.date.oggi.breve
    };
    this.db.table(TABLE.LOG_DOCS).insert(row);
    this.db.save();
  }
}

export class PostProcessStep extends Step {
  readonly name = 'PostProcessStep';
  constructor(private readonly db: IDatabase) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean {
    return ctx.get('shouldGenerate') === true && cfg(ctx)[COL_CONF_DOC.POST_PROCESSO] != null;
  }
  protected _executeLogic(ctx: PipelineContext): void {
    // Slice scope: POST_PROCESSO is null in the fixture (skipped). Actions AGGIORNA_STATO_DOC etc.
    // land in the breadth plan (10 §12).
    void ctx; this.db.save();
  }
}
