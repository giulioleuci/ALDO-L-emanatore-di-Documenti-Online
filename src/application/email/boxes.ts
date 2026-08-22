import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { DocumentoStoricoConTipo } from '../storico/StoricoDocumentiService';
import type { AggregatoreDati } from '../services/AggregatoreDati';
import type { LogCartella } from '../../domain/entities/LogCartella';

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

interface DocumentoItem {
  id?: string | undefined;
  nome: string;
  link: string;
  tipo: string;
  idGen: string;
  stato: string;
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
  '<li>{{corrente.tipoLabel}}{{#corrente.studente.nomeCompleto}} — {{corrente.studente.nomeCompleto}}{{/corrente.studente.nomeCompleto}}: ' +
  '<a href="{{corrente.link}}" target="_blank">{{corrente.nome}}</a>' +
  '{{#storico}} — Si invia anche il link al piano dell\'anno precedente: ' +
  '<a href="{{link}}" target="_blank">{{nome}}</a> ({{anno}}){{/storico}}</li>';

/** One rendered box as exposed at `cdu.render.boxes[TIPO_BOX]` (02, 11 §5). */
export interface RenderedBox {
  id: string;
  titolo: string;
  html: string;
  isEmpty: boolean;
  visibile: boolean;
}

const DEFAULT_BORDER = '#ddd';
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
  const arricchisci = options.config['arricchisciConStorico'] === true;
  const configArricchimento = options.config['configArricchimento'] as
    | Record<string, unknown>
    | undefined;
  const templateRiga = arricchisci ? str(configArricchimento?.['templateRiga']) : '';

  if (templateRiga === '' || storicoRef === undefined)
    return renderRigaStandard(items, str(options.config['displayMode']));

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
 * both overridable via the existing configArricchimento.templateRiga key.
 */
function renderPianiPersBox(
  data: unknown,
  options: { config: Record<string, unknown> },
  templates: ITemplateEngine,
  logger: LoggerService
): string {
  const { items, storicoRef, defaultTemplate } = data as {
    items: PianoPersonalizzatoRow[];
    storicoRef?: LazyRef<DocumentoStoricoConTipo[]>;
    defaultTemplate: string;
  };
  const arricchisci = options.config['arricchisciConStorico'];
  const configArricchimento = options.config['configArricchimento'] as
    | Record<string, unknown>
    | undefined;
  const explicitTemplate = str(configArricchimento?.['templateRiga']);
  const wantsHistorical = typeof arricchisci === 'boolean' ? arricchisci : defaultTemplate !== '';
  const templateRiga = wantsHistorical ? (explicitTemplate !== '' ? explicitTemplate : defaultTemplate) : '';

  if (templateRiga === '') {
    const righe = items
      .map((d) => {
        const nome = escapeHtml(d.nome);
        const href = escapeHtml(safeUrl(d.link));
        const chi = d.studente !== undefined ? ` — ${escapeHtml(d.studente.nomeCompleto)}` : '';
        return `<li>${escapeHtml(d.tipoLabel)}${chi}: <a href="${href}" target="_blank">${nome}</a></li>`;
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

interface CattedraBoxRow {
  classeId: string;
  classeNome: string;
  materie: Array<{ nome: string; isITP: boolean }>;
}

function renderCattedreBox(data: unknown): string {
  const cattedre = data as CattedraBoxRow[];
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
 * Composer wired with the six registered TIPO_BOX blocks (11 §11). Blocks read
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
      factory: (definition, config) =>
        new SimpleContentBlock(definition, {
          ...config,
          dataExtractor,
          emptyChecker,
          templates: { html: id }
        })
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
          renderPianiPersBox(data, options, templates, logger),
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
  documentiFiltro: { tipo?: string; stato?: string } = {},
  realCartelle: LogCartella[] | null = null
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
  const destinatario = cdu['destinatario'] as
    | {
        contesto?: {
          cattedre?: CattedraBoxRow[];
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
  // FILTRO_TIPO/FILTRO_STATO (11 §11): the 'documenti' TIPO_BOX config scopes the
  // rendered link list to this CONF_MAIL's own document type — e.g. the VERBALE
  // pattern's box must not also list the class's CONDOTTA/PIANO_PERS documents.
  // Independent of attachment resolution (ComposeEmailStep.resolveAllegati's
  // DATI_SORGENTE opt-in) so scoping the visible links never implies attaching them.
  const nonCartelle = items.filter((i) => i.tipo !== 'CARTELLA');
  const documentiFiltrati = nonCartelle.filter(
    (i) =>
      (documentiFiltro.tipo === undefined || i.tipo === documentiFiltro.tipo) &&
      (documentiFiltro.stato === undefined || i.stato === documentiFiltro.stato)
  );
  const pianiPers = focus?.classe?.didattica?.pianiPersonalizzati ?? focus?.alunno?.didattica?.pianiPersonalizzati;
  const pianiItems = pianiPers?.items ?? [];
  const pianiStoricoRef = pianiPers?.storico;
  return {
    carenze: mapCarenzeFormatoB(dettaglio, materie),
    documenti: { items: documentiFiltrati, storicoRef },
    documentiDipartimento: { items: focus?.dipartimento?.didattica?.documenti?.items ?? [] },
    cartelle: {
      items:
        realCartelle !== null
          ? realCartelle.map((f) => ({
              nome: f.nome,
              link: f.getLink(),
              tipo: 'CARTELLA',
              idGen: '',
              stato: '',
              dataCreazione: ''
            }))
          : items.filter((i) => i.tipo === 'CARTELLA'),
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
    },
    cattedre: destinatario?.contesto?.cattedre ?? []
  };
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
  classeIds?: string[]
): {
  ordered: string[];
  boxes: Record<string, RenderedBox>;
  documentIds: string[];
  folderIds: string[];
} {
  const cfgs = confMail.getBoxes();
  const known = cfgs.filter((c) => {
    const tipo = str(c['TIPO_BOX']);
    return tipo !== '' && tipo in DEFAULT_TITLES;
  });
  if (known.length === 0) return { ordered: [], boxes: {}, documentIds: [], folderIds: [] };

  const documentiCfg = known.find((c) => str(c['TIPO_BOX']) === 'documenti');
  const documentiFiltro: { tipo?: string; stato?: string } = {};
  const filtroTipo = str(documentiCfg?.['FILTRO_TIPO']);
  const filtroStato = str(documentiCfg?.['FILTRO_STATO']);
  if (filtroTipo !== '') documentiFiltro.tipo = filtroTipo;
  if (filtroStato !== '') documentiFiltro.stato = filtroStato;

  const cartelleCfg = known.find((c) => str(c['TIPO_BOX']) === 'cartelle');
  const cartelleMetodo = str(
    (cartelleCfg?.['DATI_SORGENTE'] as { metodo?: string } | undefined)?.metodo
  );
  const realCartelle: LogCartella[] | null =
    cartelleMetodo === 'cartellePerClasse' && aggregatoreDati !== undefined && classeIds !== undefined
      ? (() => {
          const cartelle = classeIds.flatMap(
            (classeId) =>
              (aggregatoreDati.perMetodo('cartellePerClasse', { classeId }) as LogCartella[] | null) ?? []
          );
          const distinct = folderProjector.project(
            cartelle.flatMap((folder, index) =>
              folder.id === null ? [] : [{ id: folder.id, index }]
            ),
            [{ type: 'distinctBy', keys: ['id'] }]
          ).value as Array<{ index: number }>;
          return distinct.map(({ index }) => cartelle[index]!);
        })()
      : null;
  const folderIds = (realCartelle ?? [])
    .map((f) => f.id)
    .filter((id): id is string => id !== null);

  const recipe: CompositionRecipeInput = {
    id: confMail.id ?? 'boxes',
    name: `Boxes ${confMail.id ?? ''}`,
    outputFormat: 'html',
    blocks: known.map((c, i) => {
      const tipo = str(c['TIPO_BOX']);
      const prerequisiti = str(c['PREREQUISITI']);
      return {
        instanceId: `${tipo}_${i}`,
        blockType: tipo,
        visibility: prerequisiti === '' ? 'always' : prerequisiti,
        order: typeof c['ORDINE'] === 'number' ? c['ORDINE'] : i,
        config: c
      };
    })
  };

  const context: Record<string, unknown> = {
    ...cdu,
    boxdata: aggregaDati(cdu, materie, documentiFiltro, realCartelle)
  };
  const boxdata = context['boxdata'] as {
    documenti: { items: DocumentoItem[] };
    cartelle: { items: DocumentoItem[] };
    pianiPersDaInviare: { items: PianoPersonalizzatoRow[] };
    pianiPersInviati: { items: PianoPersonalizzatoRow[] };
  };
  const documentIds = Array.from(
    new Set(
      known
        .flatMap((cfg): Array<{ id?: string | undefined }> => {
          switch (str(cfg['TIPO_BOX'])) {
            case 'documenti':
              return boxdata.documenti.items;
            case 'piani_pers_da_inviare':
              return boxdata.pianiPersDaInviare.items;
            case 'piani_pers_inviati':
              return boxdata.pianiPersInviati.items;
            default:
              return [];
          }
        })
        .map((item) => item.id)
        .filter((id): id is string => id !== undefined && id !== '')
    )
  );
  const renderedFolderIds =
    realCartelle === null
      ? boxdata.cartelle.items
          .map((item) => item.id)
          .filter((id): id is string => id !== undefined && id !== '')
      : folderIds;
  const result = composer.compose(recipe, context);

  const byInstance = new Map(result.blocks.map((b) => [b.instanceId, b]));
  const ordered: string[] = [];
  const boxes: Record<string, RenderedBox> = {};
  const orderedCfg = [...known.entries()].sort((a, b) => {
    const oa = typeof a[1]['ORDINE'] === 'number' ? a[1]['ORDINE'] : a[0];
    const ob = typeof b[1]['ORDINE'] === 'number' ? b[1]['ORDINE'] : b[0];
    return oa - ob;
  });

  for (const [i, cfg] of orderedCfg) {
    const tipo = str(cfg['TIPO_BOX']);
    const block = byInstance.get(`${tipo}_${i}`);
    if (block === undefined) continue;
    const isEmpty = block.isEmpty || !block.isVisible || block.content === '';
    let inner = block.isVisible ? block.content : '';
    if (inner === '' && cfg['MOSTRA_SE_VUOTO'] === true) {
      inner = templates.processStringEscaped(str(cfg['TESTO_VUOTO']), cdu); // fallback (11 §5)
    }
    const titolo = str(cfg['TITOLO']) !== '' ? str(cfg['TITOLO']) : DEFAULT_TITLES[tipo]!;
    const coloreBordo = str(cfg['COLORE']) !== '' ? str(cfg['COLORE']) : DEFAULT_BORDER;
    const html = inner === '' ? '' : titolo === '' ? inner : wrapBox(titolo, coloreBordo, inner);
    boxes[tipo] = { id: `${tipo}_${i}`, titolo, html, isEmpty, visibile: html !== '' };
    if (html !== '') ordered.push(html);
  }
  return { ordered, boxes, documentIds, folderIds: renderedFolderIds };
}
