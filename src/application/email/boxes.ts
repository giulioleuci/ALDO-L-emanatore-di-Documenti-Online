import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { DocumentoStoricoConTipo } from '../storico/StoricoDocumentiService';
import type { AggregatoreDati } from '../services/AggregatoreDati';
import type { LogCartella } from '../../domain/entities/LogCartella';
import type { LogDocumento } from '../../domain/entities/LogDocumento';
import type { CattedraVM } from '../context-engine/Cdu';
import { parseFiltriSorgente, type EntitaSorgente } from '../../domain/specifications/FiltriSorgente';

/**
 * Box Rendering System (11 §5/§11) on ComposableContentLib (L4): every
 * `TIPO_BOX` is a library `SimpleContentBlock` whose HTML template is an ALDO
 * *function* template registered on an `HtmlRenderer`; `CONF_MAIL.BOX_CFG` is
 * mapped 1:1 onto a library `CompositionRecipe` and executed by
 * `ContentComposer` (ordering, visibility, empty-hiding, error isolation all
 * come from the library). ALDO owns only the HTML of each box and the
 * data aggregation from the serialized CDU.
 */

/** CarenzeMapper "formato B" row (11 §11): CDU carenza enriched with MATERIE styling. */
export interface CarenzaFormatoB {
  sigla: string;
  nome: string;
  colore: string;
  colore2: string;
  simbolo: string;
  nomeSintesi: string;
  descrizione: string;
}

export interface DocumentoItem {
  id?: string | undefined;
  nome: string;
  link: string;
  tipo: string;
  idGen: string;
  sottotipo: string;
  stato: string;
  notificato: boolean;
  dataCreazione: string;
}

interface PianoPersonalizzatoRow {
  id?: string | undefined;
  nome: string;
  link: string;
  sottotipo: string;
  tipoLabel: string;
  idGen: string;
  notificato: boolean;
  studente?: { nomeCompleto: string; email: string };
}

const DEFAULT_PIANI_PERS_TEMPLATE =
  '<li><a href="{{corrente.link}}" target="_blank">{{corrente.studente.nomeCompleto}} - {{corrente.tipoLabel}}</a>' +
  '{{#storico}} — Si invia anche il link al piano dell\'anno precedente: ' +
  '<a href="{{link}}" target="_blank">{{nome}}</a> ({{anno}}){{/storico}}</li>';

/**
 * One rendered box exposed at `cdu.render.boxes[TIPO_BOX]` and, for every
 * instance, at `cdu.render.boxes[`${TIPO_BOX}_${index}`]` (02, 11 §5).
 */
export interface RenderedBox {
  id: string;
  titolo: string;
  html: string;
  isEmpty: boolean;
  visibile: boolean;
}

/** Scope resolved by RenderBoxesStep before invoking a DATI_SORGENTE accessor. */
export interface SourceScope {
  /** Explicit recipient competence classes take precedence over the CDU focus class. */
  classiCompetenza?: string[];
  classeId?: string;
  utenteEmail?: string;
  dipartimentoId?: string;
}

const DEFAULT_BORDER = '#ddd';
const PIANI_PERS_DA_INVIARE_BORDER = '#C62828';
const INSTANCE_SOURCE_DATA_PATH = '__ALDO_SOURCE_DATA_PATH';
const folderProjector = new CollectionProjector({ logger: new LoggerService() });

/**
 * HTML-context escaping (XSS prevention) delegated to CoreUtilsLib's
 * `HtmlSanitizer` (Task C2 of the delegation audit) — thin re-exports so
 * existing import sites (`emailSteps.ts`, this module's own renderers) keep
 * working unchanged.
 */
export function escapeHtml(raw: string): string {
  return HtmlSanitizer.escapeHtml(raw);
}

export function safeColor(raw: string, fallback: string): string {
  return HtmlSanitizer.safeColor(raw, fallback);
}

export function safeUrl(raw: string): string {
  return HtmlSanitizer.safeUrl(raw);
}

/** FormattatoreDatiEmail standard container (11 §11). */
export function wrapBox(titolo: string, coloreBordo: string, contenutoInterno: string): string {
  return (
    `<div style="margin:20px 0; padding:15px; border-left:4px solid ${safeColor(coloreBordo, DEFAULT_BORDER)}; background-color:#f9f9f9;">` +
    `<h3 style="margin:0 0 10px 0; color:#333; font-size:16px;">${escapeHtml(titolo)}</h3>` +
    `${contenutoInterno}</div>`
  );
}

/** Enriches the CDU carenze dettaglio with MATERIE colours/symbol (formato B, 11 §11). */
export function mapCarenzeFormatoB(
  dettaglio: Array<{ materia: string; voto: string }>,
  materie: IMateriaRepository
): CarenzaFormatoB[] {
  return dettaglio.map((d) => {
    const materia = materie.findById(d.materia);
    return {
      sigla: d.materia,
      nome: materia?.nome ?? d.materia,
      colore: materia?.colore1 ?? DEFAULT_BORDER,
      colore2: materia?.colore2 ?? '',
      simbolo: materia?.simbolo ?? '',
      nomeSintesi: materia !== null && materia.sintesi !== '' ? materia.sintesi : d.materia,
      descrizione: `Voto ${d.voto}`
    };
  });
}

function renderCarenzeBox(data: unknown): string {
  const rows = data as CarenzaFormatoB[];
  return rows
    .map((r) => {
      const titolo = r.simbolo !== '' ? `${r.simbolo} ${r.nome}` : r.nome;
      return (
        `<div style="border-left:4px solid ${safeColor(r.colore, DEFAULT_BORDER)}; padding:12px 12px 12px 16px; margin-bottom:10px;">` +
        `<h3 style="margin:0 0 8px 0; font-size:16px; color:#333;">${escapeHtml(titolo)}</h3>` +
        `<div style="font-size:14px; color:#555; line-height:1.5;">${escapeHtml(r.descrizione)}</div></div>`
      );
    })
    .join('');
}

function wrapUl(righe: string): string {
  return `<ul style="margin:0; padding-left:20px; font-size:14px; color:#555;">${righe}</ul>`;
}

function renderRigaStandard(items: DocumentoItem[], displayMode: string): string {
  const righe = items
    .map((d) => {
      const href = escapeHtml(safeUrl(d.link));
      switch (displayMode) {
        case 'link':
          return `<li><a href="${href}" target="_blank">${href}</a></li>`;
        case 'nome+link':
          return `<li>${escapeHtml(d.nome)} — <a href="${href}" target="_blank">${href}</a></li>`;
        case 'sololink':
          return `<li><a href="${href}" target="_blank">Apri</a></li>`;
        default:
          return `<li><a href="${href}" target="_blank">${escapeHtml(d.nome)}</a></li>`;
      }
    })
    .join('');
  return wrapUl(righe);
}

/**
 * WorkspaceTemplateEngine's `{{var}}` deliberately does NOT HTML-escape
 * (`_escapedValue` in the vendored `Mustache.js` is a plain `String(value)` —
 * its own `_escapeHtml` helper is dead code, unused, because the same engine
 * also renders Docs/Sheets output where HTML entities must NOT appear as
 * literal text). So `templateRiga` interpolation gets no escaping for free.
 * Only `nome`/`link` are treated as untrusted free text here (the same fields
 * `renderRigaStandard` escapes) — `tipo`/`stato`/`dataCreazione`/`idGen`/`anno`
 * are generator-assigned codes and dates, not user-authored text, so they are
 * passed through unescaped, same as `renderRigaStandard` does for its own
 * non-nome/link fields.
 */
function escapeNomeLink<T extends { nome: string; link: string }>(d: T): T {
  return { ...d, nome: escapeHtml(d.nome), link: escapeHtml(safeUrl(d.link)) };
}

function renderDocumentiBox(
  data: unknown,
  options: { config: Record<string, unknown> },
  templates: ITemplateEngine
): string {
  const { items, storicoRef } = data as {
    items: DocumentoItem[];
    storicoRef?: LazyRef<DocumentoStoricoConTipo[]>;
  };
  const arricchisci = options.config['ARRICCHISCI_CON_STORICO'] === true;
  const configArricchimento = options.config['CONFIG_ARRICCHIMENTO'] as
    | Record<string, unknown>
    | undefined;
  const templateRiga = arricchisci ? str(configArricchimento?.['TEMPLATE_RIGA']) : '';

  if (templateRiga === '' || storicoRef === undefined)
    return renderRigaStandard(items, str(options.config['DISPLAY_MODE']));

  // arricchisciConStorico (11 §11, 13 §4): storico entries are matched to the
  // current item by ID_GEN, not the display TIPO — the historical DTO keeps
  // the generator id in its dedicated `idGen` field.
  const storico = storicoRef.get();
  const righe = items
    .map((corrente) => {
      const storicoCorrente = storico
        .filter((s) => s.idGen === corrente.idGen)
        .map(escapeNomeLink);
      return templates.processString(templateRiga, {
        corrente: escapeNomeLink(corrente),
        storico: storicoCorrente
      });
    })
    .join('');
  return wrapUl(righe);
}

/**
 * Shared renderer for `piani_pers_da_inviare`/`piani_pers_inviati` (11 §11
 * new): filters the shared pianiPersonalizzati item list by `notificato`,
 * then renders each row via a Mustache template — a built-in default for
 * `piani_pers_da_inviare` (so the historical "sent last year too" line works
 * with zero BOX_CFG configuration), falling back to plain rows otherwise,
 * both overridable via the existing CONFIG_ARRICCHIMENTO.TEMPLATE_RIGA key.
 */
function renderPianiPersBox(
  data: unknown,
  options: { config: Record<string, unknown> },
  templates: ITemplateEngine,
  logger: LoggerService,
  forceBuiltInTemplate = false
): string {
  const { items, storicoRef, defaultTemplate } = data as {
    items: PianoPersonalizzatoRow[];
    storicoRef?: LazyRef<DocumentoStoricoConTipo[]>;
    defaultTemplate: string;
  };
  const arricchisci = options.config['ARRICCHISCI_CON_STORICO'];
  const configArricchimento = options.config['CONFIG_ARRICCHIMENTO'] as
    | Record<string, unknown>
    | undefined;
  const explicitTemplate = str(configArricchimento?.['TEMPLATE_RIGA']);
  const wantsHistorical = typeof arricchisci === 'boolean' ? arricchisci : defaultTemplate !== '';
  const templateRiga = forceBuiltInTemplate
    ? DEFAULT_PIANI_PERS_TEMPLATE
    : wantsHistorical
      ? (explicitTemplate !== '' ? explicitTemplate : defaultTemplate)
      : '';

  if (templateRiga === '') {
    const righe = items
      .map((d) => {
        const href = escapeHtml(safeUrl(d.link));
        const alunno = d.studente !== undefined ? escapeHtml(d.studente.nomeCompleto) : '';
        const testo = `${alunno} - ${escapeHtml(d.tipoLabel)}`;
        return `<li><a href="${href}" target="_blank">${testo}</a></li>`;
      })
      .join('');
    return wrapUl(righe);
  }

  let storico: DocumentoStoricoConTipo[] = [];
  try {
    storico = storicoRef?.get() ?? [];
  } catch (err) {
    // A missing/unavailable prior-year database must not suppress current plans.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Piani personalizzati: storico non disponibile (${message})`);
    storico = [];
  }
  const righe = items
    .map((corrente) => {
      const storicoCorrente = storico
        .filter(
          (s) =>
            s.sottotipo === corrente.sottotipo &&
            (corrente.studente === undefined || s.studenteEmail === corrente.studente.email)
        )
        .map(escapeNomeLink);
      return templates.processString(templateRiga, {
        corrente: {
          ...corrente,
          nome: escapeHtml(corrente.nome),
          link: escapeHtml(safeUrl(corrente.link)),
          sottotipo: escapeHtml(corrente.sottotipo),
          tipoLabel: escapeHtml(corrente.tipoLabel),
          ...(corrente.studente !== undefined
            ? {
                studente: {
                  ...corrente.studente,
                  nomeCompleto: escapeHtml(corrente.studente.nomeCompleto),
                  email: escapeHtml(corrente.studente.email)
                }
              }
            : {})
        },
        storico: storicoCorrente
      });
    })
    .join('');
  return wrapUl(righe);
}

function renderNoteBox(data: unknown): string {
  // CARENZE.NOTE is free text (11 §11) — escaped before interpolation.
  return `<div style="font-size:14px; color:#555; line-height:1.5;">${escapeHtml(String(data))}</div>`;
}

function renderAssenzeBox(): string {
  return (
    '<div style="font-size:14px; color:#b30000;">' +
    '<strong>⚠️ Si segnala un numero elevato di assenze.</strong></div>'
  );
}

function renderCattedreBox(data: unknown): string {
  const cattedre = data as CattedraVM[];
  const righe = cattedre
    .map((c) => {
      const materie = c.materie
        .map(
          (m) =>
            `${escapeHtml(m.nome)}${m.isITP ? ' <span style="font-size:11px;color:#888;">(ITP)</span>' : ''}`
        )
        .join(', ');
      return `<li><strong>${escapeHtml(c.classeNome)}</strong> — ${materie}</li>`;
    })
    .join('');
  return wrapUl(righe);
}

/**
 * Composer wired with the registered TIPO_BOX blocks (11 §11). Blocks read
 * their data from the serialized composition context (`boxdata.*` aggregated by
 * `renderBoxes`, full CDU for `testo_dinamico`).
 */
export function createBoxComposer(
  logger: LoggerService,
  templates: ITemplateEngine
): ContentComposer {
  const blocks = new BlockRegistry({ logger });
  const simple = (
    id: string,
    name: string,
    dataExtractor: (ctx: BlockDataContextLike) => unknown,
    emptyChecker: (data: unknown) => boolean
  ): void => {
    blocks.register({
      definition: { id, name, supportedFormats: ['html'], emptyBehavior: 'HIDE' },
      factory: (definition, config) => {
        const sourceDataPath = str(config[INSTANCE_SOURCE_DATA_PATH]);
        return new SimpleContentBlock(definition, {
          ...config,
          dataExtractor:
            sourceDataPath === '' ? dataExtractor : (ctx) => ctx.get(sourceDataPath, undefined),
          emptyChecker,
          templates: { html: id }
        });
      }
    });
  };

  simple(
    'carenze',
    'Carenze',
    (ctx) => ctx.get('boxdata.carenze', []),
    (d) => (d as unknown[]).length === 0
  );
  simple(
    'documenti',
    'Documenti',
    (ctx) => ctx.get('boxdata.documenti', { items: [], storicoRef: undefined }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
  simple(
    'documenti_dipartimento',
    'Documenti di Dipartimento',
    (ctx) => ctx.get('boxdata.documentiDipartimento', { items: [] }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
  simple(
    'cartelle',
    'Cartelle',
    (ctx) => ctx.get('boxdata.cartelle', { items: [], storicoRef: undefined }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
  simple(
    'piani_pers_da_inviare',
    'Piani personalizzati da notificare',
    (ctx) => ctx.get('boxdata.pianiPersDaInviare', { items: [], storicoRef: undefined, defaultTemplate: '' }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
  simple(
    'piani_pers_inviati',
    'Piani personalizzati notificati',
    (ctx) => ctx.get('boxdata.pianiPersInviati', { items: [], storicoRef: undefined, defaultTemplate: '' }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
  simple(
    'note',
    'Note',
    (ctx) => str(ctx.get('focus.carenza.note', '')),
    (d) => String(d).trim() === ''
  );
  simple(
    'assenze',
    'Assenze',
    (ctx) => ctx.get('focus.carenza.hasAssenze', false) === true,
    (d) => d !== true
  );
  simple(
    'cattedre',
    'Cattedre',
    (ctx) => ctx.get('destinatario.contesto.cattedre', []),
    (d) => (d as unknown[]).length === 0
  );
  // testo_dinamico: sempre visibile (MOSTRA_SE_VUOTO implicito, 11 §11); data = whole CDU.
  blocks.register({
    definition: {
      id: 'testo_dinamico',
      name: 'Testo dinamico',
      supportedFormats: ['html'],
      emptyBehavior: 'SHOW_EMPTY'
    },
    factory: (definition, config) =>
      new SimpleContentBlock(definition, {
        ...config,
        dataExtractor: (ctx) => ctx.getAll(),
        emptyChecker: () => false,
        templates: { html: 'testo_dinamico' }
      })
  });

  const renderers = new RendererRegistry({ logger, registerDefaults: false });
  renderers.register(
    new HtmlRenderer({
      logger,
      templates: {
        carenze: (data) => renderCarenzeBox(data),
        documenti: (data, options) => renderDocumentiBox(data, options, templates),
        documenti_dipartimento: (data, options) => renderDocumentiBox(data, options, templates),
        cartelle: (data, options) => renderDocumentiBox(data, options, templates),
        piani_pers_da_inviare: (data, options) =>
          renderPianiPersBox(data, options, templates, logger, true),
        piani_pers_inviati: (data, options) => renderPianiPersBox(data, options, templates, logger),
        note: (data) => renderNoteBox(data),
        assenze: () => renderAssenzeBox(),
        cattedre: (data) => renderCattedreBox(data),
        testo_dinamico: (data, options) =>
          templates.processStringEscaped(str(options.config['CONTENUTO']), data as Record<string, unknown>)
      }
    })
  );

  return new ContentComposer({ blockRegistry: blocks, rendererRegistry: renderers, logger });
}

/** Titles shown in the standard container when BOX_CFG has no TITOLO. */
const DEFAULT_TITLES: Record<string, string> = {
  carenze: 'Carenze rilevate',
  documenti: 'Documenti',
  documenti_dipartimento: 'Documenti di Dipartimento',
  cartelle: 'Cartelle',
  note: 'Note',
  assenze: 'Assenze',
  cattedre: 'Le tue cattedre',
  testo_dinamico: '',
  piani_pers_da_inviare: 'Piani personalizzati da notificare',
  piani_pers_inviati: 'Piani personalizzati notificati'
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Aggregates per-box data from the CDU (the spec's `aggregatoreDati`, 11 §11):
 * enrichment happens here, where repositories are reachable, so the block
 * templates stay pure functions over serializable data.
 */
function aggregaDati(
  cdu: Record<string, unknown>,
  materie: IMateriaRepository,
  documentiSorgente?: DocumentoItem[],
  cartelleSorgente?: DocumentoItem[]
): Record<string, unknown> {
  const focus = cdu['focus'] as
    | {
        alunno?: {
          didattica?: {
            carenze?: { dettaglio?: Array<{ materia: string; voto: string }> };
            documenti?: {
              items?: DocumentoItem[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
            pianiPersonalizzati?: {
              items?: PianoPersonalizzatoRow[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
          };
        };
        classe?: {
          didattica?: {
            documenti?: {
              items?: DocumentoItem[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
            pianiPersonalizzati?: {
              items?: PianoPersonalizzatoRow[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
          };
        };
        dipartimento?: {
          didattica?: {
            documenti?: {
              items?: DocumentoItem[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
          };
        };
      }
    | undefined;
  const dettaglio = focus?.alunno?.didattica?.carenze?.dettaglio ?? [];
  const documenti =
    focus?.classe?.didattica?.documenti ??
    focus?.alunno?.didattica?.documenti ??
    focus?.dipartimento?.didattica?.documenti;
  const items = documenti?.items ?? [];
  const storicoRef = documenti?.storico;
  const pianiPers = focus?.classe?.didattica?.pianiPersonalizzati ?? focus?.alunno?.didattica?.pianiPersonalizzati;
  const pianiItems = pianiPers?.items ?? [];
  const pianiStoricoRef = pianiPers?.storico;
  return {
    carenze: mapCarenzeFormatoB(dettaglio, materie),
    documenti: { items: documentiSorgente ?? items.filter((i) => i.tipo !== 'CARTELLA'), storicoRef },
    documentiDipartimento: { items: focus?.dipartimento?.didattica?.documenti?.items ?? [] },
    cartelle: {
      items: cartelleSorgente ?? items.filter((i) => i.tipo === 'CARTELLA'),
      storicoRef: undefined
    },
    pianiPersDaInviare: {
      items: pianiItems.filter((i) => !i.notificato),
      storicoRef: pianiStoricoRef,
      defaultTemplate: DEFAULT_PIANI_PERS_TEMPLATE
    },
    pianiPersInviati: {
      items: pianiItems.filter((i) => i.notificato),
      storicoRef: pianiStoricoRef,
      defaultTemplate: ''
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueById<T extends { id?: string | null | undefined }>(items: T[]): T[] {
  const distinct = folderProjector.project(
    items.flatMap((item, index) => (item.id === null || item.id === undefined ? [] : [{ id: item.id, index }])),
    [{ type: 'distinctBy', keys: ['id'] }]
  ).value as Array<{ index: number }>;
  return distinct.map(({ index }) => items[index]!);
}

function documentoItem(documento: LogDocumento): DocumentoItem {
  return {
    id: documento.id ?? undefined,
    nome: documento.nome,
    link: documento.getLink(),
    tipo: documento.tipo,
    idGen: documento.idGen,
    sottotipo: documento.getSottotipo(),
    stato: documento.getStato(),
    notificato: documento.isNotificato(),
    dataCreazione: documento.getDataCreazione()
  };
}

/**
 * `LogCartella` (LOG_FOLD) has no SOTTOTIPO/NOTIFICATO columns — a Drive
 * folder record has no document-lifecycle state to notify on. `sottotipo`/
 * `notificato` default to `''`/`false` to keep `DocumentoItem` a single
 * shape shared by both documents and folders.
 */
function cartellaItem(cartella: LogCartella): DocumentoItem {
  return {
    id: cartella.id ?? undefined,
    nome: cartella.nome,
    link: cartella.getLink(),
    tipo: 'CARTELLA',
    idGen: cartella.idGen,
    sottotipo: '',
    stato: '',
    notificato: false,
    dataCreazione: ''
  };
}

function isLegacyFilter(cfg: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(cfg, 'FILTRO_TIPO') ||
    Object.prototype.hasOwnProperty.call(cfg, 'FILTRO_STATO');
}

function sourceMethodsFor(entita: EntitaSorgente): ReadonlySet<string> {
  return entita === 'documenti'
    ? new Set(['documentiPerClasse', 'documentiPerUtente', 'documentiPerDipartimento'])
    : new Set(['cartellePerClasse', 'cartellePerUtente', 'cartellePerDipartimento']);
}

function resolveSourceItems(
  cfg: Record<string, unknown>,
  entita: EntitaSorgente,
  aggregatoreDati: AggregatoreDati | undefined,
  scope: SourceScope | undefined,
  logger: LoggerService,
  confMailId: string
): DocumentoItem[] | undefined | null {
  const source = cfg['DATI_SORGENTE'];
  if (source === undefined) return undefined;
  if (!isRecord(source)) {
    logger.warn(`CONF_MAIL ${confMailId}: DATI_SORGENTE non risolvibile — box saltato`);
    return null;
  }

  const { filtri, errori } = parseFiltriSorgente(source['filtri'], entita);
  if (errori.length > 0) {
    logger.error(`CONF_MAIL ${confMailId}: filtri ${entita} non validi: ${errori.join('; ')}`);
    return null;
  }

  const metodo = str(source['metodo']);
  if (metodo === '' || !sourceMethodsFor(entita).has(metodo) || aggregatoreDati === undefined) {
    logger.warn(`CONF_MAIL ${confMailId}: DATI_SORGENTE.metodo non risolvibile — box saltato`);
    return null;
  }

  const calls: Array<unknown[] | null> = metodo.endsWith('PerClasse')
    ? (() => {
        const classi = scope?.classiCompetenza?.length
          ? scope.classiCompetenza
          : scope?.classeId === undefined
            ? []
            : [scope.classeId];
        if (classi.length === 0) return [aggregatoreDati.perMetodo(metodo, { filtri }, logger)];
        return classi.map((classeId) =>
          aggregatoreDati.perMetodo(metodo, { classeId, filtri }, logger) ?? null
        );
      })()
    : [
        aggregatoreDati.perMetodo(metodo, {
          ...(scope?.utenteEmail === undefined ? {} : { utenteEmail: scope.utenteEmail }),
          ...(scope?.dipartimentoId === undefined
            ? {}
            : { dipartimentoId: scope.dipartimentoId }),
          ...(filtri === undefined ? {} : { filtri })
        }, logger)
      ];
  if (calls.length === 0 || calls.some((items) => items === null)) return null;

  const entities = calls.flat();
  return entita === 'documenti'
    ? uniqueById(entities as LogDocumento[]).map(documentoItem)
    : uniqueById(entities as LogCartella[]).map(cartellaItem);
}

interface ResolvedBoxConfiguration {
  cfg: Record<string, unknown>;
  index: number;
  tipo: string;
  sourceItems?: DocumentoItem[] | undefined;
}

/**
 * Single validation and source-resolution boundary for renderer instances and
 * dynamic attachments. Entity comes exclusively from a known TIPO_BOX; a
 * DATI_SORGENTE method can never reclassify an unrelated or unknown box.
 */
function resolveBoxConfigurations(
  confMail: ConfigurazioneEmail,
  aggregatoreDati: AggregatoreDati | undefined,
  sourceScope: SourceScope | undefined,
  logger: LoggerService
): ResolvedBoxConfiguration[] {
  return confMail.getBoxes().flatMap((cfg, index) => {
    const tipo = str(cfg['TIPO_BOX']);
    if (tipo === '' || !(tipo in DEFAULT_TITLES)) return [];
    if ((tipo === 'documenti' || tipo === 'cartelle') && isLegacyFilter(cfg)) {
      const legacy = ['FILTRO_TIPO', 'FILTRO_STATO'].filter((key) =>
        Object.prototype.hasOwnProperty.call(cfg, key)
      );
      logger.error(
        `CONF_MAIL ${confMail.id ?? ''}: chiavi legacy ${legacy.join(', ')} non ammesse; usa DATI_SORGENTE.filtri`
      );
      return [];
    }
    if (tipo !== 'documenti' && tipo !== 'cartelle') return [{ cfg, index, tipo }];
    if (tipo === 'cartelle' && cfg['ALLEGA'] === true) {
      logger.warn(
        `CONF_MAIL ${confMail.id ?? ''}: sorgente cartelle non allegabile; allegati statici invariati`
      );
    }
    if (Object.prototype.hasOwnProperty.call(cfg, 'filtri')) {
      logger.error(
        `CONF_MAIL ${confMail.id ?? ''}: filtri deve comparire in DATI_SORGENTE.filtri`
      );
      return [];
    }
    const sourceItems = resolveSourceItems(
      cfg,
      tipo,
      aggregatoreDati,
      sourceScope,
      logger,
      confMail.id ?? ''
    );
    return sourceItems === null ? [] : [{ cfg, index, tipo, sourceItems }];
  });
}

/**
 * Runs the Box Rendering System for one CONF_MAIL pattern (11 §5): BOX_CFG →
 * CompositionRecipe → ContentComposer; applies the FormattatoreDatiEmail
 * container and the MOSTRA_SE_VUOTO/TESTO_VUOTO fallback; returns both the
 * ordered HTML fragments for ComposeEmailStep and the `cdu.render.boxes` map.
 */
export function renderBoxes(
  composer: ContentComposer,
  confMail: ConfigurazioneEmail,
  cdu: Record<string, unknown>,
  materie: IMateriaRepository,
  templates: ITemplateEngine,
  aggregatoreDati?: AggregatoreDati,
  sourceScope?: SourceScope,
  logger?: LoggerService
): {
  ordered: string[];
  hasTriggeringContent: boolean;
  boxes: Record<string, RenderedBox>;
  documentIds: string[];
  folderIds: string[];
  dynamicAttachments: Array<{ id: string; link: string }>;
} {
  const activeLogger = logger ?? new LoggerService();
  const renderable = resolveBoxConfigurations(
    confMail,
    aggregatoreDati,
    sourceScope,
    activeLogger
  );
  if (renderable.length === 0)
    return {
      ordered: [],
      hasTriggeringContent: false,
      boxes: {},
      documentIds: [],
      folderIds: [],
      dynamicAttachments: []
    };

  const recipe: CompositionRecipeInput = {
    id: confMail.id ?? 'boxes',
    name: `Boxes ${confMail.id ?? ''}`,
    outputFormat: 'html',
    blocks: renderable.map(({ cfg, index, tipo, sourceItems }) => {
      const prerequisiti = str(cfg['PREREQUISITI']);
      const instanceId = `${tipo}_${index}`;
      return {
        instanceId,
        blockType: tipo,
        visibility: prerequisiti === '' ? 'always' : prerequisiti,
        order: typeof cfg['ORDINE'] === 'number' ? cfg['ORDINE'] : index,
        config:
          sourceItems === undefined
            ? cfg
            : { ...cfg, [INSTANCE_SOURCE_DATA_PATH]: `boxSourceData.${instanceId}` }
      };
    })
  };

  const boxdata = aggregaDati(cdu, materie) as {
    documenti: { items: DocumentoItem[]; storicoRef?: LazyRef<DocumentoStoricoConTipo[]> };
    cartelle: { items: DocumentoItem[]; storicoRef?: LazyRef<DocumentoStoricoConTipo[]> };
    pianiPersDaInviare: { items: PianoPersonalizzatoRow[] };
    pianiPersInviati: { items: PianoPersonalizzatoRow[] };
  };
  const boxSourceData: Record<string, unknown> = {};
  for (const { index, tipo, sourceItems } of renderable) {
    if (sourceItems === undefined || (tipo !== 'documenti' && tipo !== 'cartelle')) continue;
    boxSourceData[`${tipo}_${index}`] = {
      ...boxdata[tipo],
      items: sourceItems
    };
  }
  const context: Record<string, unknown> = {
    ...cdu,
    boxdata,
    boxSourceData
  };
  const result = composer.compose(recipe, context);

  const byInstance = new Map(result.blocks.map((b) => [b.instanceId, b]));
  const ordered: string[] = [];
  let hasTriggeringContent = false;
  const boxes: Record<string, RenderedBox> = {};
  const sourceContentTypes = new Set<string>();
  const renderedDocumentItems: DocumentoItem[] = [];
  const renderedFolderItems: DocumentoItem[] = [];
  const dynamicAttachmentItems: DocumentoItem[] = [];
  const orderedCfg = [...renderable].sort((a, b) => {
    const oa = typeof a.cfg['ORDINE'] === 'number' ? a.cfg['ORDINE'] : a.index;
    const ob = typeof b.cfg['ORDINE'] === 'number' ? b.cfg['ORDINE'] : b.index;
    return oa - ob;
  });

  for (const { cfg, index, tipo, sourceItems } of orderedCfg) {
    const instanceId = `${tipo}_${index}`;
    const block = byInstance.get(instanceId);
    if (block === undefined) continue;
    if (block.isVisible && block.content !== '') {
      sourceContentTypes.add(tipo);
      if (tipo === 'documenti') {
        const items = sourceItems ?? boxdata.documenti.items;
        renderedDocumentItems.push(...items);
        if (cfg['ALLEGA'] === true && sourceItems !== undefined)
          dynamicAttachmentItems.push(...sourceItems);
      } else if (tipo === 'cartelle') {
        renderedFolderItems.push(...(sourceItems ?? boxdata.cartelle.items));
      }
    }
    const isEmpty = block.isEmpty || !block.isVisible || block.content === '';
    let inner = block.isVisible ? block.content : '';
    if (inner === '' && cfg['MOSTRA_SE_VUOTO'] === true) {
      inner = templates.processStringEscaped(str(cfg['TESTO_VUOTO']), cdu); // fallback (11 §5)
    }
    // TITOLO is a Mustache template over the CDU (11 §5) — e.g. the
    // cattedre box titles itself with the class name. `wrapBox` escapes
    // the result, so interpolate UNescaped here to avoid double-escaping.
    const titoloCfg = str(cfg['TITOLO']);
    const titolo =
      titoloCfg !== '' ? templates.processString(titoloCfg, cdu) : DEFAULT_TITLES[tipo]!;
    const coloreBordo =
      tipo === 'piani_pers_da_inviare'
        ? PIANI_PERS_DA_INVIARE_BORDER
        : str(cfg['COLORE']) !== ''
          ? str(cfg['COLORE'])
          : DEFAULT_BORDER;
    const html = inner === '' ? '' : titolo === '' ? inner : wrapBox(titolo, coloreBordo, inner);
    const renderedBox = { id: instanceId, titolo, html, isEmpty, visibile: html !== '' };
    boxes[instanceId] = renderedBox;
    boxes[tipo] = renderedBox;
    if (html !== '') {
      ordered.push(html);
      // piani_pers_inviati is context only (previously notified plans); it must
      // never be the sole reason an email goes out (correction to 11 §11 new).
      if (tipo !== 'piani_pers_inviati') hasTriggeringContent = true;
    }
  }
  const ids = (items: Array<{ id?: string | undefined }>): string[] =>
    Array.from(new Set(items.map((item) => item.id).filter((id): id is string => id !== undefined && id !== '')));
  const hasRenderedSourceContent = (tipo: string): boolean => sourceContentTypes.has(tipo);
  const documentIds = [
    ...renderedDocumentItems,
    ...(hasRenderedSourceContent('piani_pers_da_inviare') ? boxdata.pianiPersDaInviare.items : []),
    ...(hasRenderedSourceContent('piani_pers_inviati') ? boxdata.pianiPersInviati.items : [])
  ];
  const dynamicAttachments = uniqueById(dynamicAttachmentItems)
    .map((item) => ({ id: item.id ?? '', link: item.link }))
    .filter((item) => item.id !== '');
  return {
    ordered,
    hasTriggeringContent,
    boxes,
    documentIds: ids(documentIds),
    folderIds: ids(renderedFolderItems),
    dynamicAttachments
  };
}
