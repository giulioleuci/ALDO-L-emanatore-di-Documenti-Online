import type { Cdu } from '../context-engine/Cdu';
import type { IDriveFacade, PermissionGrant } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { IDatabase, Row } from '../../infrastructure/db/Database';
import type { GeneratorStrategy } from '../strategies/GeneratorStrategy';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { IConfigurazioneDocumentoRepository } from '../../domain/repositories/IConfigurazioneDocumentoRepository';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS } from '../../config/schema';
import {
  StatoDocumento,
  DuplicazioneDocumento,
  GestioneSupplenti,
  FormatoOutput
} from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';
import { executePostProcess, hasJsonValue, type PostProcessDb } from './postProcessActions';
import { AlberoCartelle } from '../../infrastructure/services/AlberoCartelle';
import { resolveLogRegistration } from './logRegistration';

/**
 * Role-resolution port consumed by ApplyPermissionsStep (10 §10). Satisfied
 * structurally by the application-layer RisolutoreRuoliService (14 §1), injected
 * from the composition root so this infrastructure step stays decoupled from it.
 */
export interface IRoleResolver {
  risolvi(ruolo: string, cdu: Cdu, options?: { regolaSupplente?: GestioneSupplenti }): Email[];
}

/** One CONF_DOC.PERMESSI ACL entry (10 §10). */
interface AclEntry {
  ruolo: string;
  permesso: string;
}
interface PermessiConfig {
  file?: AclEntry[];
  folder?: AclEntry[];
  regolaSupplente?: { file?: string; folder?: string };
}

function parseRegola(raw: string | undefined): GestioneSupplenti {
  switch (raw) {
    case 'SOLO_SUPPLENTI':
      return GestioneSupplenti.SOLO_SUPPLENTI;
    case 'ENTRAMBI':
      return GestioneSupplenti.ENTRAMBI;
    default:
      return GestioneSupplenti.SOLO_TITOLARI;
  }
}

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
  'PrepareInfrastructure',
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
function isPianoPersonalizzato(ctx: PipelineContext): boolean {
  return confDoc(ctx).tipo === 'PIANO_PERS';
}
/**
 * The SOTTOTIPO discriminator used by CheckDuplicatesStep's identity match and
 * RegisterDocumentStep's LOG_DOCS row (10 §4/§11): the focused plan subtype
 * for PIANO_PERS, the `materia::docente` cattedra pair for
 * DOCUMENTO_DOCENTE_MATERIA (one document per teacher/subject on the class
 * council), empty otherwise.
 */
function sottotipo(ctx: PipelineContext): string {
  if (isPianoPersonalizzato(ctx)) return cdu(ctx).focus.piano?.tipo ?? '';
  if (String(cfg(ctx)[COL_CONF_DOC.TIPO] ?? '') === 'DOCUMENTO_DOCENTE_MATERIA') {
    const materiaId = cdu(ctx).focus.materia?.sigla ?? '';
    const docenteEmail = cdu(ctx).focus.docente?.email ?? '';
    return `${materiaId}::${docenteEmail}`;
  }
  return '';
}
function nomeCartella(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '');
  return segments[segments.length - 1] ?? '';
}

/**
 * Type-aware Drive edit link per CONF_DOC.FORMATO (10 §8, item 1): the cloned
 * artifact is still a live Drive file at this point in the pipeline regardless
 * of its eventual export format, so PDF/TEXT (or any future FORMATO value)
 * keeps the generic Drive file link.
 */
function buildFileLink(fileId: string, formato: FormatoOutput): string {
  switch (formato) {
    case FormatoOutput.GSHEET:
      return `https://docs.google.com/spreadsheets/d/${fileId}/edit?gid=0#gid=0`;
    case FormatoOutput.GDOC:
      return `https://docs.google.com/document/d/${fileId}/edit`;
    default:
      return `https://drive.google.com/file/d/${fileId}/edit`;
  }
}

/** Step 1 (10 §1): CONDIZIONE evaluated by GasExpressionEngineLib over the CDU. */
export class AnalyzeContextStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly configs: IConfigurazioneDocumentoRepository,
    private readonly engine: IExpressionEngine
  ) {
    super('AnalyzeContext', logger, { requiredKeys: ['config', 'confDoc', 'cdu'] });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    this.setResult(
      ctx,
      'shouldGenerate',
      this.configs.shouldGenerate(confDoc(ctx), cduRecord(ctx), this.engine)
    );
  }

  protected override _getLogDetails(ctx: PipelineContext): { Generate: boolean } {
    return { Generate: ctx.get('shouldGenerate') === true };
  }
}

/** Step 2 (10 §4): deduplication is controlled by CONF_DOC.DUPLICAZIONE. */
export class CheckDuplicatesStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly db: IDatabase,
    private readonly templates: ITemplateEngine
  ) {
    super('CheckDuplicates', logger, { shouldExecuteCondition: generateGate });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const duplicazione = String(
      cfg(ctx)[COL_CONF_DOC.DUPLICAZIONE] ?? DuplicazioneDocumento.NEGATA
    );
    if (duplicazione === 'PERMESSA') return;

    const idGen = String(cfg(ctx)[COL_CONF_DOC.ID]);
    const tipo = String(cfg(ctx)[COL_CONF_DOC.TIPO] ?? '');
    const pianoPersonalizzato = isPianoPersonalizzato(ctx);
    const sottotipoValue = sottotipo(ctx);
    const utenti = pianoPersonalizzato
      ? resolveLogRegistration(
          cfg(ctx)[COL_CONF_DOC.REGISTRA_DOC],
          this.templates,
          cduRecord(ctx),
          'REGISTRA_DOC'
        ).utenti
      : '';
    const path = this.templates.processString(
      String(cfg(ctx)[COL_CONF_DOC.PATH_OUT] ?? ''),
      cduRecord(ctx)
    );
    // NOME is intentionally excluded from the identity match: it can embed
    // {{progressivo}}, a folder-file-count that mechanically advances between
    // runs, so a rendered-name comparison can never recognize a rerun of the
    // same document as a duplicate (SPECS_ALDO/01_SCHEMA_DATABASE.md,
    // CONF_DOC.DUPLICAZIONE). Distinguishable instances of a document type
    // (e.g. one verbale per meeting) get their own CONF_DOC.ID instead.
    const existing = this.db.table(TABLE.LOG_DOCS).find(
      (r) =>
        String(r[COL_LOG_DOCS.TIPO] ?? '') === tipo &&
        String(r[COL_LOG_DOCS.SOTTOTIPO] ?? '') === sottotipoValue &&
        String(r[COL_LOG_DOCS.ID_GEN] ?? '') === idGen &&
        (!pianoPersonalizzato || String(r[COL_LOG_DOCS.UTENTI] ?? '') === utenti) &&
        String(r[COL_LOG_DOCS.PATH] ?? '') === path
    );
    if (existing) {
      this.setResult(ctx, 'shouldGenerate', false);
      this.setResult(
        ctx,
        'skipReason',
        `Duplicato: TIPO=${tipo}, SOTTOTIPO=${sottotipoValue}, ID_GEN=${idGen}, PATH=${path}, NOME=${String(existing[COL_LOG_DOCS.NOME] ?? '')}`
      );
    }
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return ctx.get('shouldGenerate') === false
      ? String(ctx.get('skipReason') ?? '')
      : String(cfg(ctx)[COL_CONF_DOC.DUPLICAZIONE]) === 'PERMESSA'
        ? 'Duplicates allowed'
        : 'No duplicate found';
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
    const path = this.templates.processString(
      String(cfg(ctx)[COL_CONF_DOC.PATH_OUT]),
      cduRecord(ctx)
    );
    // findOrCreate over LOG_FOLD + Drive (14 §4); the LOG_FOLD insert is committed
    // by the service transaction (SheetDBLib forbids save() while one is open).
    const metadata = resolveLogRegistration(
      cfg(ctx)[COL_CONF_DOC.REGISTRA_FOLD],
      this.templates,
      cduRecord(ctx),
      'REGISTRA_FOLD'
    );
    const options = {
      classi: metadata.classi,
      utenti: metadata.utenti,
      materie: metadata.materie,
      tipo: String(cfg(ctx)[COL_CONF_DOC.ID] ?? ''),
      nome: nomeCartella(path)
    };
    const { folderId } = new AlberoCartelle(this.drive, this.db).findOrCreate(path, options);
    this.setResult(ctx, 'destFolderId', folderId);
    this.setResult(ctx, 'destFolderPath', path);
    const progressivo = this.drive.countFilesInFolder(folderId) + 1;
    const cduObj = cdu(ctx);
    cduObj.meta.progressivo = progressivo;
    cduObj.progressivo = progressivo;
  }

  protected override _getLogDetails(ctx: PipelineContext): { Folder: string; Path: string; Id: string } {
    const path = ctx.get<string>('destFolderPath') ?? '';
    return {
      Folder: nomeCartella(path),
      Path: path,
      Id: ctx.get<string>('destFolderId') ?? ''
    };
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
    this.setResult(
      ctx,
      'nomeFile',
      this.templates.processString(String(cfg(ctx)[COL_CONF_DOC.FILE_NAME]), cduRecord(ctx))
    );
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return ctx.get<string>('nomeFile') ?? '';
  }
}

/** Step 6 (10 §7): MODELLI resolution — conditional entries evaluated by GasExpressionEngineLib. */
export class SelectTemplateStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly configs: IConfigurazioneDocumentoRepository,
    private readonly engine: IExpressionEngine
  ) {
    super('SelectTemplate', logger, { shouldExecuteCondition: generateGate });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    this.setResult(
      ctx,
      'templateId',
      this.configs.resolveTemplateId(confDoc(ctx), cduRecord(ctx), this.engine)
    );
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return ctx.get<string>('templateId') ?? '';
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
    const fileId = this.drive.copyFile(
      ctx.get<string>('templateId')!,
      ctx.get<string>('nomeFile')!,
      ctx.get<string>('destFolderId')!
    );
    this.setResult(ctx, 'newFileId', fileId);
    // /edit (not /view): generated files must open ready to edit, not in preview (10 §8).
    this.setResult(ctx, 'newFileLink', buildFileLink(fileId, confDoc(ctx).formato));
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return ctx.get<string>('newFileId') ?? '';
  }
}

/** Step 8 (10 §9): rendering delegated to the GENERATORE strategy (→ WorkspaceTemplateEngine). */
export class RenderTemplateStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly registry: Map<string, GeneratorStrategy>
  ) {
    super('RenderTemplate', logger, {
      shouldExecuteCondition: generateGate,
      requiredKeys: ['newFileId']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const generatore = String(cfg(ctx)[COL_CONF_DOC.GENERATORE]);
    const strategy = this.registry.get(generatore);
    if (!strategy) throw new PipelineError(`GENERATORE non registrato: ${generatore}`); // 10 §9
    strategy.render(ctx.get<string>('newFileId')!, cdu(ctx), confDoc(ctx));
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return String(cfg(ctx)[COL_CONF_DOC.GENERATORE]);
  }
}

/** Step 9 (10 §10): ACL — abstract roles resolved to emails and applied to file & folder. */
export class ApplyPermissionsStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly drive: IDriveFacade,
    private readonly roles: IRoleResolver
  ) {
    super('ApplyPermissions', logger, {
      shouldExecuteCondition: (ctx) =>
        generateGate(ctx) && hasJsonValue(cfg(ctx)[COL_CONF_DOC.PERMESSI])
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const perms = JSON.parse(String(cfg(ctx)[COL_CONF_DOC.PERMESSI])) as PermessiConfig;
    const cduObj = cdu(ctx);
    const grants: PermissionGrant[] = [];
    // Supplenza routing is applied separately for file and folder (14 §1.2).
    const fileId = ctx.get<string>('newFileId');
    if (fileId !== null) {
      this.applica(
        ctx,
        perms.file ?? [],
        fileId,
        cduObj,
        parseRegola(perms.regolaSupplente?.file),
        grants
      );
    }
    const folderId = ctx.get<string>('destFolderId');
    if (folderId !== null) {
      this.applica(
        ctx,
        perms.folder ?? [],
        folderId,
        cduObj,
        parseRegola(perms.regolaSupplente?.folder),
        grants
      );
    }
    // One shareWithUsers call per Drive role (10 §10 doc-generation perf) instead
    // of one per targetId/email pair.
    this.drive.setPermissions(grants);
  }

  private applica(
    ctx: PipelineContext,
    acl: AclEntry[],
    targetId: string,
    cduObj: Cdu,
    regola: GestioneSupplenti,
    grants: PermissionGrant[]
  ): void {
    for (const { ruolo, permesso } of acl) {
      for (const email of this.roles.risolvi(ruolo, cduObj, { regolaSupplente: regola })) {
        grants.push({ targetId, email: email.value, permesso });
        const key = permesso === 'SCRITTURA' ? 'permissionEditors' : 'permissionViewers';
        const collected = ctx.get<string[]>(key) ?? [];
        if (!collected.includes(email.value)) {
          this.setResult(ctx, key, [...collected, email.value]);
        }
      }
    }
  }

  protected override _getLogDetails(ctx: PipelineContext): { Editors: string[]; Viewers: string[] } {
    return {
      Editors: ctx.get<string[]>('permissionEditors') ?? [],
      Viewers: ctx.get<string[]>('permissionViewers') ?? []
    };
  }
}

/** Step 10 (10 §11): audit row in LOG_DOCS. */
export class RegisterDocumentStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly db: IDatabase,
    private readonly templates: ITemplateEngine
  ) {
    super('RegisterDocument', logger, {
      shouldExecuteCondition: generateGate,
      requiredKeys: ['newFileId', 'nomeFile']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const metadata = resolveLogRegistration(
      cfg(ctx)[COL_CONF_DOC.REGISTRA_DOC],
      this.templates,
      cduRecord(ctx),
      'REGISTRA_DOC'
    );
    const row: Row = {
      [COL_LOG_DOCS.ID]: ctx.get<string>('newFileId')!,
      [COL_LOG_DOCS.ID_GEN]: String(cfg(ctx)[COL_CONF_DOC.ID]),
      [COL_LOG_DOCS.TIPO]: String(cfg(ctx)[COL_CONF_DOC.TIPO]),
      [COL_LOG_DOCS.SOTTOTIPO]: sottotipo(ctx),
      [COL_LOG_DOCS.NOME]: ctx.get<string>('nomeFile')!,
      [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
      [COL_LOG_DOCS.PATH]: ctx.get<string>('destFolderPath') ?? '',
      [COL_LOG_DOCS.LINK]: ctx.get<string>('newFileLink') ?? '',
      [COL_LOG_DOCS.CLASSI]: metadata.classi,
      [COL_LOG_DOCS.UTENTI]: metadata.utenti,
      [COL_LOG_DOCS.MATERIE]: metadata.materie,
      [COL_LOG_DOCS.DATA_CREAZ]: cdu(ctx).meta.date.oggi.breve
    };
    // Persisted by the service's transaction commit (10 §11).
    this.db.table(TABLE.LOG_DOCS).insert(row);
    this.setResult(ctx, 'documentStatus', StatoDocumento.GENERATO);
  }

  protected override _getLogDetails(): null {
    return null;
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
      shouldExecuteCondition: (ctx) =>
        generateGate(ctx) && hasJsonValue(cfg(ctx)[COL_CONF_DOC.POST_PROCESSO])
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const actions = JSON.parse(String(cfg(ctx)[COL_CONF_DOC.POST_PROCESSO])) as Array<{
      tipo?: unknown;
    }>;
    const updated = executePostProcess(
      String(cfg(ctx)[COL_CONF_DOC.POST_PROCESSO]),
      cduRecord(ctx),
      this.db,
      this.templates,
      this.now,
      this.logger
    );
    this.setResult(ctx, 'postProcessUpdated', updated);
    this.setResult(
      ctx,
      'postProcessActions',
      actions.flatMap((action) => (typeof action.tipo === 'string' ? [action.tipo] : []))
    );
  }

  protected override _getLogDetails(ctx: PipelineContext): { Actions: string[]; Updated: number } {
    return {
      Actions: ctx.get<string[]>('postProcessActions') ?? [],
      Updated: ctx.get<number>('postProcessUpdated') ?? 0
    };
  }
}
