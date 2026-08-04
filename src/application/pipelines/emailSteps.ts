import type { Cdu, CduDestinatario } from '../context-engine/Cdu';
import type { ContextBuilder } from '../context-engine/ContextBuilder';
import type { BuildParams, RecipeOptions } from '../context-engine/Recipe';
import { emailTargetId, type EmailTarget } from '../email/saluto';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type {
  IGmailFacade,
  EmailSendOptions
} from '../../infrastructure/facades/GmailServiceFacade';
import type { IDatabase, Row } from '../../infrastructure/db/Database';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { ILogEmailRepository } from '../../domain/repositories/ILogEmailRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { AggregatoreDati } from '../services/AggregatoreDati';
import { getClasseEntity } from '../context-engine/techEntities';
import { recipe } from '../context-engine/Recipe';
import { salutoPerTarget } from '../email/saluto';
import { createBoxComposer, renderBoxes, escapeHtml, safeColor } from '../email/boxes';
import { executePostProcess, hasJsonValue, type PostProcessDb } from './postProcessActions';
import { COL_CONF_MAIL } from '../../config/schema';
import { ProcessoInvio, StatoEmail } from '../../domain/value-objects/enums';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { Email } from '../../domain/value-objects/Email';
import { routingPolicyByGestioneSupplenti } from '../context-engine/TeachingCouncilProjection';

/**
 * NotificaPipeline steps (ref 11) on the PipelineFramework `Step` base, same
 * pattern as documentSteps. The pipeline runs WITHOUT a DB transaction: a sent
 * email cannot be rolled back, and 11 §9/§10 mandate explicit `save()` calls
 * (SheetDBLib forbids save() inside a transaction).
 *
 * Context keys: seeded `config` (CONF_MAIL Row), `confMail`, `emailTarget`,
 * `now`, optional `testEmail`; produced `cdu`, `shouldSend`, `oggettoRisolto`,
 * `boxHtmlOrdered`, `corpoHtml`, `allegati`, `destinatariFinali`, `sendErrors`,
 * `sentCount`, `sentTo`, `logStato`.
 */

/** One physical send: the TO list of a single message (11 §7/§8). */
export interface Destinazione {
  emails: string[];
  cc?: string[];
}

/** CONF_MAIL.PROCESSO → ContextEngine recipe (11 §3). */
export const RECIPE_PER_PROCESSO: Record<ProcessoInvio, string> = {
  [ProcessoInvio.PER_COORDINATORE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_DOCENTE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_CDC]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_ALUNNO]: 'ALUNNO_COMPLETO',
  [ProcessoInvio.PER_GENITORI_ALUNNO]: 'FAMIGLIA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_ALUNNO]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_COORD]: 'CARENZA_COMPLETO'
};

const HISTORICAL_BOX_TYPES: ReadonlySet<string> = new Set([
  'documenti',
  'cartelle',
  'piani_pers_da_inviare'
]);
/** piani_pers_da_inviare wants historical enrichment by default (11 §11 new); the others only when explicitly configured. */
const DEFAULT_ON_BOX_TYPES: ReadonlySet<string> = new Set(['piani_pers_da_inviare']);

/** Derives includiStorico/profonditaAnniDocumenti from BOX_CFG (fixes the gap where these recipe options were never wired through the email pipeline). */
function storicoOptionsFor(conf: ConfigurazioneEmail): Partial<RecipeOptions> {
  const wants = conf.getBoxes().some((b) => {
    const tipo = typeof b['TIPO_BOX'] === 'string' ? b['TIPO_BOX'] : '';
    if (!HISTORICAL_BOX_TYPES.has(tipo)) return false;
    const explicit = b['arricchisciConStorico'];
    if (typeof explicit === 'boolean') return explicit;
    return DEFAULT_ON_BOX_TYPES.has(tipo);
  });
  return wants ? { includiStorico: true, profonditaAnniDocumenti: 1 } : {};
}

const sendGate = (ctx: PipelineContext): boolean => ctx.get('shouldSend') === true;

function cfg(ctx: PipelineContext): Row {
  return ctx.get<Row>('config')!;
}
function confMail(ctx: PipelineContext): ConfigurazioneEmail {
  return ctx.get<ConfigurazioneEmail>('confMail')!;
}
function target(ctx: PipelineContext): EmailTarget {
  return ctx.get<EmailTarget>('emailTarget')!;
}
function cdu(ctx: PipelineContext): Cdu {
  return ctx.get<Cdu>('cdu')!;
}
function cduRecord(ctx: PipelineContext): Record<string, unknown> {
  return cdu(ctx) as unknown as Record<string, unknown>;
}
function now(ctx: PipelineContext): Date {
  return ctx.get<Date>('now')!;
}

/** Step 1 (11 §3): recipient CDU via the recipe mapped from PROCESSO + destinatario enrichment. */
export class BuildCDUStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly contextBuilder: ContextBuilder,
    private readonly docenti: IDocenteRepository,
    private readonly alunni: IAlunnoRepository
  ) {
    super('BuildCDU', logger, { requiredKeys: ['config', 'confMail', 'emailTarget', 'now'] });
  }

  protected _executeLogic(ctx: PipelineContext): void {
    const conf = confMail(ctx);
    const t = target(ctx);
    const params: BuildParams = {
      target: t.target,
      tipoTarget: t.tipoTarget,
      now: now(ctx),
      tipoOperazione: 'INVIO_EMAIL'
    };
    if (conf.id !== null) params.idConfigurazione = conf.id;
    if (t.carenzaProgressivo !== undefined) params.carenzaProgressivo = t.carenzaProgressivo;
    if (t.classiCompetenza.length > 0) params.classiCompetenza = t.classiCompetenza;

    const built = this.contextBuilder.build(
      params,
      recipe(RECIPE_PER_PROCESSO[conf.processo], {
        gestioneSupplenti: conf.supplenti,
        ...storicoOptionsFor(conf)
      })
    );
    built.destinatario = this.buildDestinatario(conf, t);
    this.setResult(ctx, 'cdu', built);
  }

  protected override _getLogDetails(ctx: PipelineContext): {
    Target: string;
    TargetType: EmailTarget['tipoTarget'];
    Recipe: string;
    Context: 'Built';
  } {
    const conf = confMail(ctx);
    const t = target(ctx);
    return {
      Target: t.target,
      TargetType: t.tipoTarget,
      Recipe: RECIPE_PER_PROCESSO[conf.processo],
      Context: 'Built'
    };
  }

  private buildDestinatario(conf: ConfigurazioneEmail, t: EmailTarget): CduDestinatario {
    const docente = t.docenteEmail !== undefined ? this.docenti.findById(t.docenteEmail) : null;
    const alunno = t.tipoTarget === 'alunno' ? this.alunni.findById(t.target) : null;
    const anagrafica =
      docente !== null
        ? {
            nome: docente.nome,
            cognome: docente.cognome,
            nomeCompleto: docente.getNomeCompleto(),
            email: docente.id ?? '',
            appellativo: docente.getAppellativo(),
            genere: String(docente.genere)
          }
        : t.tipo === 'alunno' && alunno !== null
          ? {
              nome: '',
              cognome: '',
              nomeCompleto: alunno.cognomeNome,
              email: alunno.id ?? '',
              appellativo: '',
              genere: ''
            }
          : {
              nome: '',
              cognome: '',
              nomeCompleto: '',
              email: t.emails[0] ?? '',
              appellativo: '',
              genere: ''
            };

    return {
      anagrafica,
      ruoliAttivi: [],
      flags: {
        isCoordinatore: conf.processo === ProcessoInvio.PER_COORDINATORE,
        isTutor: false,
        isTutorAsl: false,
        isDocenteSostegno: false,
        isSupplente: false
      },
      contesto: {
        sostituisce: null,
        classiCompetenza:
          t.classiCompetenza.length > 0
            ? t.classiCompetenza
            : t.tipoTarget === 'classe'
              ? [t.target]
              : [],
        materieCompetenza: []
      },
      comunicazione: {
        salutoIniziale: salutoPerTarget(t, docente, alunno),
        oggettoCalcolato: '',
        testoContenutoPuro: ''
      }
    };
  }
}

/** Step 2 (11 §4): CONDIZIONE evaluated by GasExpressionEngineLib over the recipient CDU. */
export class ValutaCondizioniInvioStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly engine: IExpressionEngine
  ) {
    super('ValutaCondizioniInvio', logger, { requiredKeys: ['cdu', 'confMail'] });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const condizione = confMail(ctx).getCondizione();
    this.setResult(
      ctx,
      'shouldSend',
      condizione === null ? true : this.engine.evaluateBoolean(condizione, cduRecord(ctx))
    );
  }

  protected override _getLogDetails(ctx: PipelineContext): { Send: boolean; Reason: string } {
    const shouldSend = ctx.get('shouldSend') === true;
    return {
      Send: shouldSend,
      Reason:
        confMail(ctx).getCondizione() === null
          ? 'No condition configured'
          : shouldSend
            ? 'Condition met'
            : 'Condition not met'
    };
  }
}

/** Step 3 (11 §5): BOX_CFG → ContentComposer; populates cdu.render.boxes and resolves OGGETTO. */
export class RenderBoxesStep extends Step {
  private readonly composer: ContentComposer;
  constructor(
    logger: LoggerService,
    private readonly materie: IMateriaRepository,
    private readonly templates: ITemplateEngine,
    private readonly aggregatoreDati?: AggregatoreDati
  ) {
    super('RenderBoxes', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['cdu', 'confMail']
    });
    this.composer = createBoxComposer(logger, templates);
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const built = cdu(ctx);
    const focusClasseId =
      built.focus.classe !== undefined ? (getClasseEntity(built).id ?? undefined) : undefined;
    const classeIds =
      target(ctx).classiCompetenza.length > 0
        ? target(ctx).classiCompetenza
        : focusClasseId === undefined
          ? undefined
          : [focusClasseId];
    const result = renderBoxes(
      this.composer,
      confMail(ctx),
      cduRecord(ctx),
      this.materie,
      this.templates,
      this.aggregatoreDati,
      classeIds
    );
    built.render = { boxes: result.boxes, body: { htmlCompleto: '', htmlSoloContenuto: '' } };
    const oggetto = this.templates.processString(confMail(ctx).oggetto, cduRecord(ctx));
    if (built.destinatario !== undefined)
      built.destinatario.comunicazione.oggettoCalcolato = oggetto;
    this.setResult(ctx, 'boxHtmlOrdered', result.ordered);
    this.setResult(ctx, 'documentIds', result.documentIds);
    this.setResult(ctx, 'cartelleFolderIds', result.folderIds);
    this.setResult(
      ctx,
      'shouldSend',
      ctx.get('shouldSend') === true &&
        (result.ordered.length > 0 || confMail(ctx).getAllegati().length > 0)
    );
    this.setResult(ctx, 'oggettoRisolto', oggetto);
  }

  protected override _getLogDetails(ctx: PipelineContext): { Boxes: number } {
    return { Boxes: (ctx.get<string[]>('boxHtmlOrdered') ?? []).length };
  }
}

/** Step 4 (11 §6): msgstart + header + saluto + TESTO + boxes + footer + msgend. */
export class ComposeEmailStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly templates: ITemplateEngine,
    private readonly logDocs: ILogDocumentoRepository,
    private readonly drive: IDriveFacade
  ) {
    super('ComposeEmail', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['cdu', 'oggettoRisolto']
    });
  }

  /**
   * Static CONF_MAIL.ALLEGATI files are always resolved first. Class documents
   * are appended only when a documentiPerClasse box explicitly opts in with
   * ALLEGA=true; their optional tipo/stato filters are preserved.
   */
  private resolveAllegati(
    conf: ConfigurazioneEmail,
    built: Cdu
  ): { ids: string[]; links: string[]; blobs: unknown[] } {
    const attachments = conf.getAllegati().map((id) => ({
      id,
      link: `https://drive.google.com/open?id=${encodeURIComponent(id)}`
    }));
    const boxConfig = conf.getBoxes().find((b) => {
      const sorgente = b['DATI_SORGENTE'] as { metodo?: string } | undefined;
      return b['ALLEGA'] === true && sorgente?.metodo === 'documentiPerClasse';
    });
    if (boxConfig !== undefined && built.focus.classe !== undefined) {
      const filtri =
        (
          boxConfig['DATI_SORGENTE'] as
            | { filtri?: { tipo?: string; stato?: string } }
            | undefined
        )?.filtri ?? {};
      const classe = getClasseEntity(built);
      const documenti = this.logDocs
        .findByClasse(classe)
        .filter(
          (d) =>
            (filtri.tipo === undefined || d.tipo === filtri.tipo) &&
            (filtri.stato === undefined || String(d.getStato()) === filtri.stato)
        );
      attachments.push(
        ...documenti
          .map((d) => ({ id: d.id ?? '', link: d.getLink() }))
          .filter((attachment) => attachment.id !== '')
      );
    }

    const uniqueAttachments: Array<{ id: string; link: string }> = [];
    const seenIds = new Set<string>();
    for (const attachment of attachments) {
      if (!seenIds.has(attachment.id)) {
        seenIds.add(attachment.id);
        uniqueAttachments.push(attachment);
      }
    }

    return {
      ids: uniqueAttachments.map((attachment) => attachment.id),
      links: uniqueAttachments.map((attachment) => attachment.link),
      blobs: uniqueAttachments.map((attachment) => this.drive.getFileBlob(attachment.id))
    };
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const conf = confMail(ctx);
    const built = cdu(ctx);
    const saluto = built.destinatario?.comunicazione.salutoIniziale ?? 'Gentile Utente';
    const testo = this.templates.processStringEscaped(conf.getTesto(), cduRecord(ctx));
    const boxes = ctx.get<string[]>('boxHtmlOrdered') ?? [];
    const noReplyBlock = conf.isNoreply()
      ? '<p><strong>⚠️ La risposta a questa email non sarà monitorata.</strong></p>'
      : '';
    const footer =
      '<div style="margin-top:30px; font-size:12px; color:#888;">' +
      '<p>Questa è una comunicazione automatica.</p>' +
      noReplyBlock +
      '</div>';

    // Saluto/oggetto embed sheet-sourced names; the header colour lands in a
    // style attribute — all pass the same escaping/whitelisting as the boxes.
    const htmlSoloContenuto = `<p>${escapeHtml(saluto)},</p>${testo}${boxes.join('')}`;
    const htmlCompleto =
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
      '<body style="margin:0; padding:0; background-color:#f4f4f4;">' +
      '<div style="max-width:600px; margin:0 auto; background-color:#ffffff; box-shadow:0 0 10px rgba(0,0,0,0.1);">' +
      `<div style="background-color:${safeColor(conf.getColoreHeader(), '#007bff')}; color:#ffffff; padding:20px; font-size:20px; font-weight:bold;">` +
      `${escapeHtml(ctx.get<string>('oggettoRisolto') ?? '')}</div>` +
      `<div style="padding:20px;">${htmlSoloContenuto}${footer}</div>` +
      '</div></body></html>';

    if (built.render !== undefined) built.render.body = { htmlCompleto, htmlSoloContenuto };
    if (built.destinatario !== undefined)
      built.destinatario.comunicazione.testoContenutoPuro = htmlSoloContenuto;
    const allegati = this.resolveAllegati(conf, built);
    this.setResult(ctx, 'corpoHtml', htmlCompleto);
    this.setResult(ctx, 'allegati', allegati.blobs);
    this.setResult(ctx, 'allegatiIds', allegati.ids);
    this.setResult(ctx, 'allegatiLinks', allegati.links);
  }

  protected override _getLogDetails(ctx: PipelineContext): { Subject: string; Attachments: number } {
    return {
      Subject: ctx.get<string>('oggettoRisolto') ?? '',
      Attachments: (ctx.get<string[]>('allegatiIds') ?? []).length
    };
  }
}

/** Step 5 (11 §7): teaching-assignment routing for PER_DOCENTE; every other process is declared passthrough. */
export class ResolveRecipientsStep extends Step {
  private readonly projector = new CollectionProjector({ logger: new LoggerService() });

  constructor(
    logger: LoggerService,
    private readonly docenti: IDocenteRepository,
    private readonly classi: IClasseRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {
    super('ResolveRecipients', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['emailTarget', 'confMail']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const t = target(ctx);
    if (
      confMail(ctx).processo !== ProcessoInvio.PER_DOCENTE ||
      t.tipo !== 'docente' ||
      t.teachingAssignmentTarget !== true
    ) {
      // Coordinator, PER_CDC, family and student targets are declared recipients.
      const dest: Destinazione = t.cc !== undefined ? { emails: t.emails, cc: t.cc } : { emails: t.emails };
      this.setResult(ctx, 'destinatariFinali', [dest] satisfies Destinazione[]);
      return;
    }
    const titolare = t.docenteEmail !== undefined ? this.docenti.findById(t.docenteEmail) : null;
    if (titolare === null) {
      this.setResult(ctx, 'destinatariFinali', [{ emails: t.emails }] satisfies Destinazione[]);
      return;
    }
    const titolareEmail = titolare.id ?? '';
    const classeIds = t.classiCompetenza.length > 0 ? t.classiCompetenza : [t.target];
    const assignments = classeIds.flatMap((classeId) => {
      const classe = this.classi.findById(ClasseId.of(classeId));
      if (classe === null) return [];
      return this.teachingAssignments
        .resolveConsiglio(classe, now(ctx), {
          includeReligioneAlt: true,
          routingPolicy: routingPolicyByGestioneSupplenti[confMail(ctx).supplenti]
        })
        .filter((assignment) => assignment.titolare.id === titolareEmail);
    });
    const routingRows = assignments.map((assignment) => ({
      routing: {
        primary: assignment.routing.primary.flatMap((docente) =>
          docente.id === null ? [] : [{ id: docente.id }]
        )
      }
    }));
    const routed = this.projector.project(routingRows, [
      { type: 'flatMap', path: 'routing.primary' },
      { type: 'distinctBy', keys: ['id'] }
    ]).value as Array<{ id: string }>;
    const finali = routed.map((actor) => actor.id);
    if (finali.length === 0 && titolareEmail !== '') {
      finali.push(titolareEmail);
    }
    this.setResult(
      ctx,
      'destinatariFinali',
      finali.map((email) => ({ emails: [email] })) satisfies Destinazione[]
    );
  }

  protected override _getLogDetails(ctx: PipelineContext): { To: string[]; Cc: string[] } {
    const destinations = ctx.get<Destinazione[]>('destinatariFinali') ?? [];
    return {
      To: destinations.flatMap((destination) => destination.emails),
      Cc: destinations.flatMap((destination) => destination.cc ?? [])
    };
  }
}

/** Step 6 (11 §8): physical send; supervisore BCC hardcoded (11 §6); failures collected, never thrown. */
export class SendEmailStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly gmail: IGmailFacade,
    private readonly master: IMasterSheetRepository
  ) {
    super('SendEmail', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['corpoHtml', 'oggettoRisolto', 'destinatariFinali']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const supervisore = this.findSupervisore();
    const testEmail = ctx.get<string>('testEmail');
    const destinazioni = ctx.get<Destinazione[]>('destinatariFinali')!;
    const errors: string[] = [];
    const attempted: string[] = [];
    const resolvedCc: string[] = [];
    const resolvedBcc: string[] = [];
    let sent = 0;

    for (const dest of destinazioni) {
      const to = testEmail !== null ? [testEmail] : dest.emails;
      for (const e of to) if (!attempted.includes(e)) attempted.push(e);
      const opts: EmailSendOptions = {
        to,
        subject: ctx.get<string>('oggettoRisolto') ?? '',
        htmlBody: ctx.get<string>('corpoHtml') ?? '',
        noReply: confMail(ctx).isNoreply(),
        attachments: ctx.get<unknown[]>('allegati') ?? []
      };
      // Test-send mode redirects `to` to the tester; real cc/bcc recipients must not leak alongside it (11 §15).
      if (supervisore !== null && testEmail === null) opts.bcc = [supervisore];
      if (dest.cc !== undefined && testEmail === null) opts.cc = dest.cc;
      for (const email of opts.cc ?? []) if (!resolvedCc.includes(email)) resolvedCc.push(email);
      for (const email of opts.bcc ?? []) if (!resolvedBcc.includes(email)) resolvedBcc.push(email);
      const result = this.gmail.sendEmail(opts);
      if (result.success) {
        sent += 1;
      } else {
        // MUST log, collect and continue (11 §8).
        const msg = result.error ?? 'errore di invio sconosciuto';
        this.logger.error(`SendEmail: invio fallito a ${to.join(',')}: ${msg}`);
        errors.push(msg);
      }
    }

    this.setResult(ctx, 'sendErrors', errors);
    this.setResult(ctx, 'sentCount', sent);
    this.setResult(ctx, 'sentTo', attempted);
    this.setResult(ctx, 'sentCc', resolvedCc);
    this.setResult(ctx, 'sentBcc', resolvedBcc);
  }

  protected override _getLogDetails(ctx: PipelineContext): Record<string, string | number | string[]> {
    const errors = ctx.get<string[]>('sendErrors') ?? [];
    const cc = ctx.get<string[]>('sentCc') ?? [];
    const bcc = ctx.get<string[]>('sentBcc') ?? [];
    const details: Record<string, string | number | string[]> = {
      Sent: ctx.get<number>('sentCount') ?? 0,
      Recipients: ctx.get<string[]>('sentTo') ?? []
    };
    if (errors.length > 0) details.Errors = errors;
    if (errors.length > 0 || cc.length > 0) details.Cc = cc;
    if (errors.length > 0 || bcc.length > 0) details.Bcc = bcc;
    return details;
  }

  /** Current-year MASTER.SUPERVISORE_EMAIL; empty ⇒ WARN and no BCC (11 §6 nota). */
  private findSupervisore(): string | null {
    const config = this.master.findConfigAnnoCorrente();
    if (!config.hasSupervisore()) {
      this.logger.warn(
        "SendEmail: SUPERVISORE_EMAIL assente per l'anno corrente — invio senza BCC supervisore"
      );
      return null;
    }
    return config.supervisoreEmail;
  }
}

/** Step 7 (11 §9): LOG_MAIL audit record (composite PK PATTERN+DESTINATARI+DATA; repo saves). */
export class LogEmailStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly logMail: ILogEmailRepository
  ) {
    super('LogEmail', logger, { shouldExecuteCondition: sendGate, requiredKeys: ['sentTo'] });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const errors = ctx.get<string[]>('sendErrors') ?? [];
    const stato = errors.length > 0 ? StatoEmail.ERROR : StatoEmail.SUCCESS;
    const destinatari = (ctx.get<string[]>('sentTo') ?? []).map((e) => Email.of(e));
    const allegatiInfo = {
      docs: ctx.get<string[]>('documentIds') ?? [],
      folders: ctx.get<string[]>('cartelleFolderIds') ?? [],
      attach: ctx.get<string[]>('allegatiLinks') ?? [],
      logicalTargetId: emailTargetId(target(ctx))
    };
    this.logMail.registraInvio(
      String(cfg(ctx)[COL_CONF_MAIL.ID]),
      destinatari,
      stato,
      ctx.get<string>('corpoHtml') ?? '',
      allegatiInfo,
      errors.length > 0 ? errors.join('; ') : undefined
    );
    this.setResult(ctx, 'logStato', stato);
  }

  protected override _getLogDetails(): null {
    return null;
  }
}

/** Step 8 (11 §10): POST_PROCESSO actions, only when at least one send succeeded; explicit save(). */
export class PostProcessEmailStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly db: IDatabase & PostProcessDb,
    private readonly templates: ITemplateEngine
  ) {
    super('PostProcessEmail', logger, {
      shouldExecuteCondition: (ctx) =>
        sendGate(ctx) &&
        (ctx.get<number>('sentCount') ?? 0) > 0 &&
        hasJsonValue(cfg(ctx)[COL_CONF_MAIL.POST_PROCESSO])
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const actions = JSON.parse(String(cfg(ctx)[COL_CONF_MAIL.POST_PROCESSO])) as Array<{
      tipo?: unknown;
    }>;
    const updated = executePostProcess(
      String(cfg(ctx)[COL_CONF_MAIL.POST_PROCESSO]),
      cduRecord(ctx),
      this.db,
      this.templates,
      now(ctx),
      this.logger
    );
    // These mutations land after LogEmailStep's save — persist explicitly (11 §10).
    this.db.save();
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
