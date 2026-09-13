import type { Cdu, DestinatarioVM, CattedraVM, MateriaVM, ClasseSintesiVM } from '../context-engine/Cdu';
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
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../ports/ITeachingAssignmentResolver';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { ILogEmailRepository } from '../../domain/repositories/ILogEmailRepository';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { AggregatoreDati } from '../services/AggregatoreDati';
import { getClasseEntity } from '../context-engine/techEntities';
import { recipe } from '../context-engine/Recipe';
import { salutoPerTarget } from '../email/saluto';
import {
  createBoxComposer,
  renderBoxes,
  escapeHtml,
  safeColor,
  type SourceScope
} from '../email/boxes';
import { executePostProcess, hasJsonValue, type PostProcessDb } from './postProcessActions';
import { COL_CONF_MAIL, MATERIA_SOSTEGNO } from '../../config/schema';
import { ProcessoInvio, StatoEmail, DuplicazioneDocumento } from '../../domain/value-objects/enums';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { Email } from '../../domain/value-objects/Email';
import {
  dedupeSubjectsMainOverItp,
  descrizione as descrizioneRuoli,
  resolveEffectiveDocenti,
  materieDocenteInClasse
} from '../context-engine/TeachingCouncilProjection';
import { buildPersonaVm } from '../context-engine/mappers/personVmMapper';

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
const RECIPE_PER_PROCESSO: Record<ProcessoInvio, string> = {
  [ProcessoInvio.PER_COORDINATORE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_DOCENTE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_CDC]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_ALUNNO]: 'ALUNNO_COMPLETO',
  [ProcessoInvio.PER_GENITORI_ALUNNO]: 'FAMIGLIA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_ALUNNO]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_COORD]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CAPO_DIPARTIMENTO]: 'DIPARTIMENTO_COMPLETO',
  [ProcessoInvio.PER_DIPARTIMENTO]: 'DIPARTIMENTO_COMPLETO'
};

const HISTORICAL_BOX_TYPES: ReadonlySet<string> = new Set([
  'documenti',
  'cartelle',
  'piani_pers_da_inviare',
  'piani_pers_inviati'
]);
/** piani_pers_da_inviare always requires historical enrichment; the others opt in through BOX_CFG. */
const ALWAYS_HISTORICAL_BOX_TYPES: ReadonlySet<string> = new Set(['piani_pers_da_inviare']);

/** Derives includiStorico/profonditaAnniDocumenti from BOX_CFG (fixes the gap where these recipe options were never wired through the email pipeline). */
function storicoOptionsFor(conf: ConfigurazioneEmail): Partial<RecipeOptions> {
  const wants = conf.getBoxes().some((b) => {
    const tipo = typeof b['TIPO_BOX'] === 'string' ? b['TIPO_BOX'] : '';
    if (!HISTORICAL_BOX_TYPES.has(tipo)) return false;
    if (ALWAYS_HISTORICAL_BOX_TYPES.has(tipo)) return true;
    const explicit = b['ARRICCHISCI_CON_STORICO'];
    return explicit === true;
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

function sourceScopeFor(built: Cdu, emailTarget: EmailTarget): SourceScope {
  const focusClasseId =
    built.focus.classe !== undefined ? (getClasseEntity(built).id ?? undefined) : undefined;
  const classeIds =
    emailTarget.classiCompetenza.length > 0
      ? emailTarget.classiCompetenza
      : focusClasseId === undefined
        ? undefined
        : [focusClasseId];
  // `built.focus.docente` is never populated by DOCENTE_COMPLETO (or any
  // recipe reachable from a *PerUtente box), so `emailTarget.docenteEmail`
  // — already carried by every single-actor docente-shaped target — is the
  // fallback that actually reaches this scope (final review fix, audit §5).
  const utenteEmail =
    built.focus.alunno?.email ?? built.focus.docente?.email ?? emailTarget.docenteEmail;
  const isDocente = emailTarget.tipo === 'docente' || emailTarget.tipo === 'capo_dipartimento';
  return {
    ...(classeIds === undefined ? {} : { classiCompetenza: classeIds }),
    ...(focusClasseId === undefined ? {} : { classeId: focusClasseId }),
    ...(utenteEmail === undefined || utenteEmail === null ? {} : { utenteEmail }),
    ...(isDocente ? { isDocente: true } : {}),
    ...(built.focus.dipartimento === undefined
      ? {}
      : { dipartimentoId: built.focus.dipartimento.id })
  };
}

/** Step 1 (11 §3): recipient CDU via the recipe mapped from PROCESSO + destinatario enrichment. */
export class BuildCDUStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly contextBuilder: ContextBuilder,
    private readonly docenti: IDocenteRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly classi: IClasseRepository,
    private readonly materie: IMateriaRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {
    super('BuildCDU', logger, { requiredKeys: ['config', 'confMail', 'emailTarget', 'now'] });
  }

  /**
   * `resolveConsiglio(classe, when)` result cache, scoped to this Step instance
   * (11 §3 review fix — memoize per-class resolver calls): `EmailNotificationService`
   * reuses ONE `BuildCDUStep` across every email of a batch run (`getPipeline`,
   * rebuilt only when `jobId` changes), so a class with N docente-target emails
   * would otherwise call `resolveConsiglio` on the same (classe, when) pair N
   * times. Keyed by `classeId|when.getTime()` — safe within one batch, never
   * reused across batches since the whole step (and this map) is rebuilt fresh.
   */
  private readonly consiglioCache = new Map<string, TeachingAssignment[]>();

  protected _executeLogic(ctx: PipelineContext): void {
    const conf = confMail(ctx);
    const t = target(ctx);
    const params: BuildParams = {
      target: t.target,
      tipoTarget: t.tipoTarget,
      now: now(ctx),
      tipoOperazione: 'INVIO_NOTIFICA',
      configurazioneId: conf.id ?? '',
      esecuzioneId: ''
    };
    if (t.carenzaProgressivo !== undefined) params.carenzaProgressivo = t.carenzaProgressivo;
    if (t.classiCompetenza.length > 0) params.classiCompetenza = t.classiCompetenza;

    const built = this.contextBuilder.build(
      params,
      recipe(RECIPE_PER_PROCESSO[conf.processo], {
        gestioneSupplenti: conf.supplenti,
        ...storicoOptionsFor(conf)
      })
    );
    built.destinatario = this.buildDestinatario(t, now(ctx));
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

  private buildDestinatario(t: EmailTarget, when: Date): DestinatarioVM {
    const docente = t.docenteEmail !== undefined ? this.docenti.findById(t.docenteEmail) : null;
    const titolare = t.titolareEmail !== undefined ? this.docenti.findById(t.titolareEmail) : null;
    const alunno = t.tipoTarget === 'alunno' ? this.alunni.findById(t.target) : null;
    const persona =
      docente !== null
        ? buildPersonaVm({
            nome: docente.nome,
            cognome: docente.cognome,
            email: docente.id ?? '',
            genere: docente.genere
          })
        : t.tipo === 'alunno' && alunno !== null
          ? buildPersonaVm({ nome: alunno.cognomeNome, cognome: null, email: alunno.id ?? '', genere: null })
          : buildPersonaVm({ nome: '', cognome: null, email: t.emails[0] ?? '', genere: null });

    const classiCompetenza =
      t.classiCompetenza.length > 0
        ? t.classiCompetenza
        : t.tipoTarget === 'classe'
          ? [t.target]
          : [];
    const { cattedre, materieCompetenza } = this.buildCattedre(t, classiCompetenza, when);
    const ruoli = this.ruoliDestinatario(docente, classiCompetenza);
    const isDocenteSostegno = materieCompetenza.some(
      (materia) =>
        materia.sigla === MATERIA_SOSTEGNO || materia.sigla.startsWith(`${MATERIA_SOSTEGNO}.`)
    );

    const classi = classiCompetenza.map((nome): ClasseSintesiVM => ({ nome, anno: 0, sezione: '' }));
    return {
      ...persona,
      ruoliAttivi: ruoli.elenco,
      hasRuoliAttivi: ruoli.elenco.length > 0,
      isCoordinatore: ruoli.isCoordinatore,
      isTutor: ruoli.isTutorAsl || ruoli.isTutorOrientamento,
      isTutorAsl: ruoli.isTutorAsl,
      isDocenteSostegno,
      isSupplente: titolare !== null,
      sostituisce: titolare === null ? null : buildPersonaVm({ nome: titolare.nome, cognome: titolare.cognome, email: titolare.id, genere: titolare.genere }),
      hasSostituisce: titolare !== null,
      classi: { elenco: classi, hasElenco: classi.length > 0, numero: classi.length, elencoDescrizione: classi.map((classe) => classe.nome).join(', ') },
      materie: { elenco: materieCompetenza, hasElenco: materieCompetenza.length > 0, numero: materieCompetenza.length, elencoDescrizione: materieCompetenza.map((materia) => materia.nome).join(', '), sigle: materieCompetenza.map((materia) => materia.sigla).join(', ') },
      cattedre: { elenco: cattedre, hasElenco: cattedre.length > 0, numero: cattedre.length, elencoDescrizione: cattedre.map((cattedra) => cattedra.sezioneEstesa).join(', '), orePot: docente?.getOrePot() ?? 0 },
      comunicazione: {
        salutoIniziale: salutoPerTarget(t, docente, alunno),
        oggetto: '',
        testoContenutoPuro: ''
      }
    };
  }

  /** Role flags resolved live from CLASSI.COORD / CLASSI.RUOLI for the recipient's classes. */
  private ruoliDestinatario(
    docente: Docente | null,
    classiCompetenza: string[]
  ): {
    elenco: string[];
    isCoordinatore: boolean;
    isTutorAsl: boolean;
    isTutorOrientamento: boolean;
  } {
    const email = docente?.id ?? '';
    if (email === '') {
      return { elenco: [], isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false };
    }
    const classi = classiCompetenza
      .map((id) => this.classi.findById(ClasseId.of(id)))
      .filter((classe): classe is Classe => classe !== null);
    const contiene = (docenti: Docente[]): boolean => docenti.some((d) => d.id === email);
    const isCoordinatore = classi.some((classe) => contiene(this.classi.getCoordinatori(classe)));
    const isTutorAsl = classi.some((classe) =>
      contiene(this.classi.getDocentiRuoloArticolato(classe, 'TUTOR_ASL'))
    );
    const isTutorOrientamento = classi.some((classe) =>
      contiene(this.classi.getDocentiRuoloArticolato(classe, 'TUTOR_ORIENT'))
    );
    return {
      elenco: descrizioneRuoli(isCoordinatore, isTutorAsl, isTutorOrientamento),
      isCoordinatore,
      isTutorAsl,
      isTutorOrientamento
    };
  }

  /**
   * Per-classe cattedra composition for a docente target (design
   * 2026-08-22): materie effettive alla data di invio, stesso resolver dei
   * target (SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI), IRC/ALT incluse (2026-08-29:
   * un docente IRC/ALT-only altrimenti risultava senza cattedre). Classi senza
   * materie effettive del destinatario sono escluse.
   *
   * Classi articolate (design 2026-08-22 follow-up): le classi che
   * appartengono allo stesso gruppo di articolazione (una classe parent e le
   * sue partner, es. '1F' + '1F-LSO' + '1F-LSS') collassano in UNA sola riga
   * `CattedraVM`, indicizzata dall'identità della classe parent
   * (`getClasseParent(classe) ?? classe`). Le materie di tutte le classi del
   * gruppo vengono unite e dedupate (MAIN over ITP) sotto quella riga, cosi
   * un docente che insegna una materia COMUNE sull'intero gruppo articolato
   * vede una sola cattedra invece di una per ogni classe sorella.
   */
  private buildCattedre(
    t: EmailTarget,
    classiCompetenza: string[],
    when: Date
  ): { cattedre: CattedraVM[]; materieCompetenza: MateriaVM[] } {
    if (t.tipo !== 'docente' || t.docenteEmail === undefined) {
      return { cattedre: [], materieCompetenza: [] };
    }
    const docenteEmail = t.docenteEmail;
    const gruppi = new Map<string, { classe: Classe; materie: MateriaVM[] }>();
    let flat: MateriaVM[] = [];
    for (const classeId of classiCompetenza) {
      const classe = this.classi.findById(ClasseId.of(classeId));
      if (classe === null) continue;
      let materie: MateriaVM[];
      try {
        const assignments = this.resolveConsiglioCached(classe, when);
        materie = materieDocenteInClasse(this.materie, classe, assignments, docenteEmail).materieVm;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `BuildCDU.buildCattedre: risoluzione cattedra fallita per docente=${docenteEmail}, classe=${classeId} — classe esclusa (${msg})`
        );
        continue;
      }
      if (materie.length === 0) continue;
      const gruppoClasse = this.classi.getClasseParent(classe) ?? classe;
      const key = gruppoClasse.id ?? classeId;
      const gruppo = gruppi.get(key);
      if (gruppo === undefined) {
        gruppi.set(key, { classe: gruppoClasse, materie: [...materie] });
      } else {
        gruppo.materie.push(...materie);
      }
      flat = flat.concat(materie);
    }
    const cattedre: CattedraVM[] = [...gruppi.values()].map(({ classe, materie }) => {
      const elenco = dedupeSubjectsMainOverItp(materie);
      return {
        classe: { nome: classe.nome, anno: classe.anno.value, sezione: classe.sezione },
        sezioneEstesa: `${classe.anno.value}${classe.sezione}`,
        materie: elenco,
        hasMaterie: elenco.length > 0,
        numeroMaterie: elenco.length,
        materieDescrizione: elenco.map((materia) => materia.nome).join(', '),
        materieSigle: elenco.map((materia) => materia.sigla).join(', ')
      };
    });
    return { cattedre, materieCompetenza: dedupeSubjectsMainOverItp(flat) };
  }

  /** Memoized per (classeId, when) — see `consiglioCache`. Only successful results are cached; a thrown error is never memoized, so a later call for the same key still retries. */
  private resolveConsiglioCached(classe: Classe, when: Date): TeachingAssignment[] {
    const key = `${classe.id ?? ''}|${when.getTime()}`;
    const cached = this.consiglioCache.get(key);
    if (cached !== undefined) return cached;
    const result = this.teachingAssignments.resolveConsiglio(classe, when, {
      includeReligioneAlt: true
    });
    this.consiglioCache.set(key, result);
    return result;
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

/** Step 3 (11 §4): in-memory guard against re-sending a SUCCESS-logged logical target. */
export class CheckAlreadySentStep extends Step {
  constructor(logger: LoggerService) {
    super('CheckAlreadySent', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['config', 'emailTarget', 'successfulLogicalTargetIds']
    });
  }

  protected _executeLogic(ctx: PipelineContext): void {
    const duplicazione = String(
      cfg(ctx)[COL_CONF_MAIL.DUPLICAZIONE] ?? DuplicazioneDocumento.NEGATA
    );
    if (duplicazione === 'PERMESSA') return;

    const patternId = String(cfg(ctx)[COL_CONF_MAIL.ID]);
    const logicalTargetId = emailTargetId(target(ctx));
    const successfulLogicalTargetIds = ctx.get<Set<string>>('successfulLogicalTargetIds')!;
    if (successfulLogicalTargetIds.has(logicalTargetId)) {
      this.setResult(ctx, 'shouldSend', false);
      this.setResult(
        ctx,
        'skipReason',
        `Già inviato: PATTERN=${patternId}, TARGET=${logicalTargetId}`
      );
    }
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return ctx.get('shouldSend') === false
      ? String(ctx.get('skipReason') ?? '')
      : String(cfg(ctx)[COL_CONF_MAIL.DUPLICAZIONE] ?? DuplicazioneDocumento.NEGATA) === 'PERMESSA'
        ? 'Duplicates allowed'
        : 'Not already sent';
  }
}

/** Step 4 (11 §5): BOX_CFG → ContentComposer; populates cdu.render.boxes and resolves OGGETTO. */
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
    const sourceScope = sourceScopeFor(built, target(ctx));
    const result = renderBoxes(
      this.composer,
      confMail(ctx),
      cduRecord(ctx),
      this.materie,
      this.templates,
      this.aggregatoreDati,
      sourceScope,
      this.logger
    );
    built.render = { boxes: result.boxes, body: { htmlCompleto: '', htmlSoloContenuto: '' } };
    const oggetto = this.templates.processString(confMail(ctx).oggetto, cduRecord(ctx));
    if (built.destinatario !== undefined) built.destinatario.comunicazione.oggetto = oggetto;
    this.setResult(ctx, 'boxHtmlOrdered', result.ordered);
    this.setResult(ctx, 'documentIds', result.documentIds);
    this.setResult(ctx, 'cartelleFolderIds', result.folderIds);
    this.setResult(ctx, 'dynamicAttachments', result.dynamicAttachments);
    this.setResult(
      ctx,
      'shouldSend',
      ctx.get('shouldSend') === true &&
        (result.hasTriggeringContent || confMail(ctx).getAllegati().length > 0)
    );
    this.setResult(ctx, 'oggettoRisolto', oggetto);
  }

  protected override _getLogDetails(ctx: PipelineContext): {
    Boxes: number;
    PianiCdu: number;
    PianiDaNotificare: number;
    PianiNotificati: number;
  } {
    const built = cdu(ctx);
    const piani = built.focus.classe?.pianiPersonalizzati?.elenco ?? [];
    return {
      Boxes: (ctx.get<string[]>('boxHtmlOrdered') ?? []).length,
      PianiCdu: piani.length,
      PianiDaNotificare: piani.filter((piano) => piano.hasId && !piano.isNotificato).length,
      PianiNotificati: piani.filter((piano) => piano.isNotificato).length
    };
  }
}

/** Step 5 (11 §6): msgstart + header + saluto + TESTO_START + boxes + TESTO_END + footer + msgend. */
export class ComposeEmailStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly templates: ITemplateEngine,
    private readonly drive: IDriveFacade
  ) {
    super('ComposeEmail', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['cdu', 'oggettoRisolto']
    });
  }

  /**
   * Static CONF_MAIL.ALLEGATI_STATICI files are always resolved first. Dynamic documents
   * come from RenderBoxesStep's validated, visible per-instance source result,
   * so attachment eligibility cannot diverge from rendered box content.
   */
  private resolveAllegati(
    conf: ConfigurazioneEmail,
    dynamicAttachments: Array<{ id: string; link: string }>
  ): { ids: string[]; links: string[]; blobs: unknown[] } {
    const attachments = conf.getAllegati().map((id) => ({
      id,
      link: `https://drive.google.com/open?id=${encodeURIComponent(id)}`
    }));
    attachments.push(...dynamicAttachments);

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
    const testo = this.templates.processStringEscaped(conf.getTestoStart(), cduRecord(ctx));
    const testoEnd = this.templates.processStringEscaped(conf.getTestoEnd(), cduRecord(ctx));
    const boxes = ctx.get<string[]>('boxHtmlOrdered') ?? [];
    const footer =
      '<div style="margin-top:30px; font-size:12px; color:#888;">' +
      '<p>‼️ Non rispondere a questo indirizzo email: è utilizzato solo per l\'invio di questa comunicazione e, non essendo monitorato, non riceveresti risposta.</p>' +
      '</div>';

    // Saluto/oggetto embed sheet-sourced names; the header colour lands in a
    // style attribute — all pass the same escaping/whitelisting as the boxes.
    const htmlSoloContenuto = `<p>${escapeHtml(saluto)},</p>${testo}${boxes.join('')}${testoEnd}`;
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
    const allegati = this.resolveAllegati(
      conf,
      ctx.get<Array<{ id: string; link: string }>>('dynamicAttachments') ?? []
    );
    this.setResult(ctx, 'corpoHtml', htmlCompleto);
    this.setResult(ctx, 'allegati', allegati.blobs);
    this.setResult(ctx, 'allegatiIds', allegati.ids);
    this.setResult(ctx, 'allegatiLinks', allegati.links);

    const rispondiARaw = conf.getRispondiA();
    if (rispondiARaw.trim() !== '') {
      const resolved = this.templates.processString(rispondiARaw, cduRecord(ctx)).trim();
      try {
        const address = Email.of(resolved).value;
        this.setResult(ctx, 'replyTo', address);
      } catch {
        const safeResolved = PiiRedactor.redact(resolved).slice(0, 200);
        this.logger.warn(
          `ComposeEmail: RISPONDI_A "${rispondiARaw}" risolto a un indirizzo non valido ("${safeResolved}") — invio senza intestazione Reply-To`
        );
      }
    }
  }

  protected override _getLogDetails(ctx: PipelineContext): { Subject: string; Attachments: number } {
    return {
      Subject: ctx.get<string>('oggettoRisolto') ?? '',
      Attachments: (ctx.get<string[]>('allegatiIds') ?? []).length
    };
  }
}

/** Step 6 (11 §7): teaching-assignment routing for PER_DOCENTE; every other process is declared passthrough. */
export class ResolveRecipientsStep extends Step {
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
    const actorEmail = t.docenteEmail;
    if (actorEmail === undefined || this.docenti.findById(actorEmail) === null) {
      this.setResult(ctx, 'destinatariFinali', [{ emails: t.emails }] satisfies Destinazione[]);
      return;
    }
    // Non-split targets match/route by their own actor as the nominal
    // titolare (unchanged pre-fix contract); split targets (titolareEmail
    // set, `emailTargetId` §11.7) carry the real titolare separately so this
    // freshness recheck stays scoped to the actor `BuildCDUStep` already
    // built content for (11 §7 fix — see CORRECT_EMAIL_SUBSTITUTION.md).
    const nominalTitolareEmail = t.titolareEmail ?? actorEmail;
    const classeIds = t.classiCompetenza.length > 0 ? t.classiCompetenza : [t.target];
    const classeEntities = classeIds.flatMap((classeId) => {
      const classe = this.classi.findById(ClasseId.of(classeId));
      return classe === null ? [] : [classe];
    });
    const actors = resolveEffectiveDocenti(
      this.teachingAssignments,
      classeEntities,
      nominalTitolareEmail,
      now(ctx),
      confMail(ctx).supplenti
    );
    let finali: string[];
    if (actors.includes(actorEmail)) {
      finali = [actorEmail];
    } else if (actors.length === 0 && t.titolareEmail === undefined) {
      // The cattedra no longer resolves at all (e.g. reassigned since
      // enumeration) — best-effort fall back to this target's own actor
      // rather than silently dropping it.
      finali = [actorEmail];
    } else {
      // This actor is no longer among the currently-routed actors for its
      // titolare (substitution ended/changed since enumeration, or — for a
      // split sibling — a fellow actor now covers it instead): skip rather
      // than send content built for someone who is no longer the recipient.
      finali = [];
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

/** Step 7 (11 §8): physical send; supervisore BCC hardcoded (11 §6); failures collected, never thrown. */
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
    const replyTo = ctx.get<string>('replyTo');
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
      // Unlike cc/bcc above, replyTo is not suppressed in test-send mode: it's a header
      // annotation, not a delivery target, so no mail reaches the real coordinator and
      // keeping it lets a test send actually exercise the RISPONDI_A feature.
      if (replyTo !== null) opts.replyTo = replyTo;
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

/** Step 8 (11 §9): LOG_MAIL audit record (composite PK PATTERN+DESTINATARI+DATA; repo saves). */
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
    // A test-mode preview redirects delivery to the tester (SendEmailStep) but
    // retains the real target identity for audit traceability. History loading
    // ignores records marked testMode, so previews never suppress a real send.
    const testEmail = ctx.get<string>('testEmail');
    const isTestSend = testEmail !== null && testEmail !== undefined;
    const allegatiInfo = {
      docs: ctx.get<string[]>('documentIds') ?? [],
      folders: ctx.get<string[]>('cartelleFolderIds') ?? [],
      attach: ctx.get<string[]>('allegatiLinks') ?? [],
      logicalTargetId: emailTargetId(target(ctx)),
      ...(isTestSend ? { testMode: true } : {})
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

/** Step 9 (11 §10): POST_PROCESSO actions, only when at least one send succeeded; explicit save(). */
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
