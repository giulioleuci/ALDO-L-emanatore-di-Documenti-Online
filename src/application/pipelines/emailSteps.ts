import type { Cdu, CduDestinatario } from '../context-engine/Cdu';
import type { ContextBuilder } from '../context-engine/ContextBuilder';
import type { BuildParams } from '../context-engine/Recipe';
import type { EmailTarget } from '../email/saluto';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { IGmailFacade, EmailSendOptions } from '../../infrastructure/facades/GmailServiceFacade';
import type { IDatabase, Row } from '../../infrastructure/db/Database';
import type { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import type { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import type { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import type { MasterSheetRepository } from '../../infrastructure/repositories/MasterSheetRepository';
import type { LogEmailRepository } from '../../infrastructure/repositories/LogEmailRepository';
import type { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import { getClasseEntity } from '../context-engine/techEntities';
import { recipe } from '../context-engine/Recipe';
import { salutoPerTarget } from '../email/saluto';
import {
  createBoxComposer,
  renderBoxes,
  escapeHtml,
  safeColor
} from '../email/boxes';
import { executePostProcess, type PostProcessDb } from './postProcessActions';
import { COL_CONF_MAIL } from '../../config/schema';
import { ProcessoInvio, StatoEmail, GestioneSupplenti } from '../../domain/value-objects/enums';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { Email } from '../../domain/value-objects/Email';

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
}

/** CONF_MAIL.PROCESSO → ContextEngine recipe (11 §3). */
export const RECIPE_PER_PROCESSO: Record<ProcessoInvio, string> = {
  [ProcessoInvio.PER_COORDINATORE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_DOCENTE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_CDC]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_ALUNNO]: 'ALUNNO_COMPLETO',
  [ProcessoInvio.PER_GENITORI_ALUNNO]: 'FAMIGLIA_COMPLETO',
  [ProcessoInvio.PER_CARENZA]: 'CARENZA_COMPLETO'
};

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
    private readonly docenti: DocenteRepository,
    private readonly alunni: AlunnoRepository
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

    const built = this.contextBuilder.build(
      params,
      recipe(RECIPE_PER_PROCESSO[conf.processo], { gestioneSupplenti: conf.supplenti })
    );
    built.destinatario = this.buildDestinatario(conf, t);
    this.setResult(ctx, 'cdu', built);
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
}

/** Step 3 (11 §5): BOX_CFG → ContentComposer; populates cdu.render.boxes and resolves OGGETTO. */
export class RenderBoxesStep extends Step {
  private readonly composer: ContentComposer;
  constructor(
    logger: LoggerService,
    private readonly materie: MateriaRepository,
    private readonly templates: ITemplateEngine
  ) {
    super('RenderBoxes', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['cdu', 'confMail']
    });
    this.composer = createBoxComposer(logger, templates);
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const built = cdu(ctx);
    const result = renderBoxes(
      this.composer,
      confMail(ctx),
      cduRecord(ctx),
      this.materie,
      this.templates
    );
    built.render = { boxes: result.boxes, body: { htmlCompleto: '', htmlSoloContenuto: '' } };
    const oggetto = this.templates.processString(confMail(ctx).oggetto, cduRecord(ctx));
    if (built.destinatario !== undefined)
      built.destinatario.comunicazione.oggettoCalcolato = oggetto;
    this.setResult(ctx, 'boxHtmlOrdered', result.ordered);
    this.setResult(ctx, 'oggettoRisolto', oggetto);
  }
}

/** Step 4 (11 §6): msgstart + header + saluto + TESTO + boxes + footer + msgend. */
export class ComposeEmailStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly templates: ITemplateEngine,
    private readonly logDocs: LogDocumentoRepository,
    private readonly drive: IDriveFacade
  ) {
    super('ComposeEmail', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['cdu', 'oggettoRisolto']
    });
  }

  /**
   * Attachment resolution (11 §13): only when a class is in focus. The optional
   * tipo/stato filters come from the first BOX_CFG entry whose
   * `DATI_SORGENTE.metodo` is `documentiPerClasse` (14 §2 vocabulary) — the
   * same box that would otherwise render these documents, reused here so the
   * filter is configured once per pattern, not duplicated.
   */
  private resolveAllegati(
    conf: ConfigurazioneEmail,
    built: Cdu
  ): { ids: string[]; blobs: unknown[] } {
    if (built.focus.classe === undefined) return { ids: [], blobs: [] };
    const boxConfig = conf.getBoxes().find((b) => {
      const sorgente = b['DATI_SORGENTE'] as { metodo?: string } | undefined;
      return sorgente?.metodo === 'documentiPerClasse';
    });
    const filtri =
      (boxConfig?.['DATI_SORGENTE'] as { filtri?: { tipo?: string; stato?: string } } | undefined)
        ?.filtri ?? {};
    const classe = getClasseEntity(built);
    const documenti = this.logDocs
      .findByClasse(classe)
      .filter(
        (d) =>
          (filtri.tipo === undefined || d.tipo === filtri.tipo) &&
          (filtri.stato === undefined || String(d.getStato()) === filtri.stato)
      );
    const ids = documenti.map((d) => d.id ?? '');
    return { ids, blobs: ids.map((id) => this.drive.getFileBlob(id)) };
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const conf = confMail(ctx);
    const built = cdu(ctx);
    const saluto = built.destinatario?.comunicazione.salutoIniziale ?? 'Gentile Utente';
    const testo = this.templates.processString(conf.getTesto(), cduRecord(ctx));
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
  }
}

/** Step 5 (11 §7): SUPPLENTI routing per docente/classe; multi-TO passthrough for cdc/genitori/alunno. */
export class ResolveRecipientsStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly docenti: DocenteRepository,
    private readonly supplenze: SupplenzaRepository
  ) {
    super('ResolveRecipients', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['emailTarget', 'confMail']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const t = target(ctx);
    if (t.tipo !== 'docente') {
      // PER_CDC / genitori / alunno: one multi-TO message, not subject to SUPPLENTI (11 §7/§12).
      this.setResult(ctx, 'destinatariFinali', [{ emails: t.emails }] satisfies Destinazione[]);
      return;
    }
    const titolare = t.docenteEmail !== undefined ? this.docenti.findById(t.docenteEmail) : null;
    if (titolare === null) {
      this.setResult(ctx, 'destinatariFinali', [{ emails: t.emails }] satisfies Destinazione[]);
      return;
    }
    const classi = t.classiCompetenza.length > 0 ? t.classiCompetenza : [t.target];
    // Per-class substitute resolution — a multi-class coordinatore can have
    // different supplenti on different classes (11 §12).
    const perClasse = classi.map(
      (c) =>
        this.supplenze.findSupplenzaSpecifica(titolare, now(ctx), ClasseId.of(c))?.supplente ?? null
    );
    const titolareEmail = titolare.id ?? '';
    const supplenti = [...new Set(perClasse.filter((s): s is string => s !== null))];

    let finali: string[];
    switch (confMail(ctx).supplenti) {
      case GestioneSupplenti.SOLO_SUPPLENTI:
        // Classes without an active supplenza stay with the titolare.
        finali = [...new Set(perClasse.map((s) => s ?? titolareEmail))];
        break;
      case GestioneSupplenti.ENTRAMBI:
        finali = [titolareEmail, ...supplenti];
        break;
      default: // SOLO_TITOLARI
        finali = [titolareEmail];
    }
    this.setResult(
      ctx,
      'destinatariFinali',
      finali.map((email) => ({ emails: [email] })) satisfies Destinazione[]
    );
  }
}

/** Step 6 (11 §8): physical send; supervisore BCC hardcoded (11 §6); failures collected, never thrown. */
export class SendEmailStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly gmail: IGmailFacade,
    private readonly master: MasterSheetRepository
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
      if (supervisore !== null) opts.bcc = [supervisore];
      const result = this.gmail.sendEmail(opts);
      if (result.success) {
        sent += 1;
      } else {
        // MUST log, collect and continue (11 §8).
        const msg = result.error ?? 'errore di invio sconosciuto';
        this.logger.error(PiiRedactor.redact(`SendEmail: invio fallito a ${to.join(',')}: ${msg}`));
        errors.push(msg);
      }
    }

    this.setResult(ctx, 'sendErrors', errors);
    this.setResult(ctx, 'sentCount', sent);
    this.setResult(ctx, 'sentTo', attempted);
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
    private readonly logMail: LogEmailRepository
  ) {
    super('LogEmail', logger, { shouldExecuteCondition: sendGate, requiredKeys: ['sentTo'] });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const errors = ctx.get<string[]>('sendErrors') ?? [];
    const stato = errors.length > 0 ? StatoEmail.ERROR : StatoEmail.SUCCESS;
    const destinatari = (ctx.get<string[]>('sentTo') ?? []).map((e) => Email.of(e));
    const allegatiInfo = { docs: ctx.get<string[]>('allegatiIds') ?? [], folders: [] };
    this.logMail.registraInvio(
      String(cfg(ctx)[COL_CONF_MAIL.ID]),
      destinatari,
      stato,
      allegatiInfo,
      errors.length > 0 ? errors.join('; ') : undefined
    );
    this.setResult(ctx, 'logStato', stato);
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
        cfg(ctx)[COL_CONF_MAIL.POST_PROCESSO] != null
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
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
  }
}
