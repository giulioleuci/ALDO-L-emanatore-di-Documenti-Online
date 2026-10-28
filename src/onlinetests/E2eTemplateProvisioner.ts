import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import { TIPI_PIANO, type E2eTemplateIds, e2eAlunnoEmail } from './data/SharedTestDatabaseBuilder';

/** A single Sheets range write, relative to the artifact's own default tab (sheet-name-agnostic — the
 * factory resolves the actual, possibly locale-dependent, tab name at creation time). */
export interface SheetValueUpdate {
  range: string;
  values: unknown[][];
}

export interface E2eDocumentTable {
  data: string[][];
  options?: DocumentCreateTableOptions;
}

export interface E2eDocumentParagraph {
  text: string;
  listType?: 'bullet' | 'number';
}

export type E2eDocumentParagraphInput = string | E2eDocumentParagraph;

/**
 * Port abstracting Drive-artifact creation, so the provisioner is unit-testable offline.
 * `paragraphs`/`tables`/`updates` are only ever passed on first creation (never on a found-and-reused
 * artifact) — content is authored once, not re-appended on every idempotent re-run.
 */
export interface IArtifactFactory {
  createDocument(
    name: string,
    folderId: string,
    paragraphs?: E2eDocumentParagraphInput[],
    tables?: E2eDocumentTable[]
  ): string;
  createSheet(name: string, folderId: string, updates?: SheetValueUpdate[]): string;
}

const NAME_VERBALE = 'E2E Verbale Template v2';
const NAME_CONDOTTA = 'E2E Condotta Template';
const NAME_RIEPILOGO = 'E2E Riepilogo Template v4';
const NAME_ASL_IMPORT = 'E2E ASL Import Source';
const NAME_ASL_IMPORT_POLICY = 'E2E ASL Import Policy Source';
const NAME_ASL_IMPORT_NOHEADER = 'E2E ASL Import No Header Source';
const NAME_CARENZE_IMPORT_TIMESTAMP = 'E2E Carenze Import Timestamp Source';
// v3 forces provisioning to materialize the table/link interoperability fixture
// instead of silently reusing the v2 document that predates this online assertion.
const NAME_DOC_COMPLESSO = 'E2E Doc Complesso Template v3';
const NAME_DOC_ARTICOLATA = 'E2E Doc Articolata Template';
const NAME_CDC_RIEPILOGO = 'E2E CDC Riepilogo Firme Template';
const NAME_SHEET_PERMESSI = 'E2E Sheet Permessi Template';
const NAME_PIANO_LAVORO = 'E2E Piano Lavoro Template';
const NAME_STATIC_ATTACHMENT = 'E2E Static Attachment Fixture';
const NAME_DOC_TABELLE = 'E2E Doc Tabelle Importate Template v2';
const NAME_TABELLA_SORGENTE_DATI = 'E2E Tabella Sorgente Dati';
const NAME_TABELLA_SORGENTE_VUOTA = 'E2E Tabella Sorgente Vuota';
const NAME_DOC_STORICO = 'E2E Storico Template';
const NAME_DOC_DOTTED = 'E2E Dotted ITP Template';
const NAME_DOC_STORICO_EMAIL = 'E2E Storico Email Template';
function namePiano(tipo: string): string {
  return `E2E Piano ${tipo} Template v2`;
}

/**
 * `{{...}}` flat substitution + `{{#bullet_list:source}}itemTemplate{{/bullet_list}}` array
 * rendering (WorkspaceTemplateEngine `DocumentProcessor` — undocumented in
 * `WorkspaceTemplateEngine_docs.md`, confirmed against `DocumentProcessorTagScanner.js`), all
 * against real CDU paths (`SPECS_ALDO/02_CDU_STRUTTURA.md` §4.1) so scenario 1/4 actually
 * exercise real substitution, not a blank Doc that merely "doesn't crash".
 */
const VERBALE_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Verbale del Consiglio di Classe',
  'Classe: {{focus.classe.nome}} — Indirizzo: {{focus.classe.indirizzo.nomeSintetico}}',
  'Data: {{meta.oggi.breve}}',
  'Composizione del Consiglio di Classe:',
  {
    text: '{{#bullet_list:focus.classe.consiglio.elenco}}{{appellativoCompleto}}{{/bullet_list}}',
    listType: 'bullet'
  },
  'Coordinatori:',
  {
    text: '{{#bullet_list:focus.classe.coordinatori.elenco}}{{appellativoCompleto}} ({{materia}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Piani personalizzati generati:',
  {
    text: '{{#bullet_list:focus.classe.pianiPersonalizzati.elenco}}{{studente.nomeCompleto}} - {{tipo}}{{/bullet_list}}',
    listType: 'bullet'
  }
];

/** Personalized-plan templates deliberately print both the focused subtype and
 * its parameters so the online scenario proves conditional model selection and
 * focused CDU isolation for students with more than one plan. */
function pianoParagraphs(tipo: string): string[] {
  return [
    `Modello E2E ${tipo}`,
    'Studente: {{focus.alunno.nomeCompleto}}',
    'Classe: {{focus.alunno.classe.nome}}',
    'Data: {{meta.oggi.breve}}',
    'Tipo piano: {{focus.piano.tipoLabel}}',
    'Note: {{focus.piano.parametriGenerazione.note}}',
    // Looped focus.alunno.curriculum (§2.13, array not a map, PROMPT_MODIFY_CDU.md action item
    // 5): curriculumArray() is unconditional (no recipe option gate), so this shows real content
    // for students with a CURRICULUM cell (CARENZA_ALUNNO_1 / e2eAlunnoEmail(1) on PDP_DSA and
    // PDP_STRANIERI) and renders as an empty, residue-free section for everyone else.
    'Curriculum: {{#focus.alunno.curriculum}}{{materiaNome}}: {{#specifiche}}{{nome}}{{/specifiche}}{{/focus.alunno.curriculum}}'
  ];
}

const RIEPILOGO_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Riepilogo Classe {{focus.classe.nome}}',
  'Elenco studenti:',
  'Numero totale studenti: {{focus.classe.studenti.statistiche.totale}}',
  'Rappresentanti degli studenti:',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.studenti.elenco}}{{nomeCompleto}}{{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti dei genitori:',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.genitori.elenco}}{{nomeCompleto}}{{/bullet_list}}',
    listType: 'bullet'
  }
];

const RIEPILOGO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Alunno', 'Religione', 'Email', 'Piani'],
      [
        '{{#tablerow_loop:focus.classe.studenti.elenco}}{{nomeCompleto}}',
        '{{religione}}',
        '{{email}}',
        '{{piani.hasElenco}}'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  }
];

/** Roster rows generous enough for the shared builder's student classes. */
const CONDOTTA_ROSTER_ROWS = 30;

/**
 * `{{dynamic_rows[...]}}` only ever writes the single placeholder column (one array item per
 * row, ref `SheetProcessor._prepareDynamicRowRequests`) — it does not create rows or touch other
 * columns. So the 3 indicator columns + average formula must be pre-authored, one row per
 * possible roster slot, ahead of time (design spec "entirely template-authored").
 */
function condottaUpdates(): SheetValueUpdate[] {
  const updates: SheetValueUpdate[] = [
    {
      range: 'A1:E1',
      values: [['Studente', 'Comportamento', 'Impegno', 'Partecipazione', 'Media']]
    },
    {
      range: 'A2',
      values: [['{{dynamic_rows[source=focus.classe.studenti.elenco,value=nomeCompleto]}}']]
    }
  ];
  for (let i = 0; i < CONDOTTA_ROSTER_ROWS; i++) {
    const row = 2 + i;
    updates.push({ range: `E${row}`, values: [[`=IFERROR(AVERAGE(B${row}:D${row}),"")`]] });
  }
  return updates;
}

/** School year matching SharedTestDatabaseBuilder's current MASTER registration. */
const ASL_IMPORT_ANNO = '2026-2027';
const ASL_IMPORT_ROWS: Array<[string, number]> = [
  [e2eAlunnoEmail(43), 40],
  [e2eAlunnoEmail(44), 55],
  [e2eAlunnoEmail(51), 60],
  [e2eAlunnoEmail(52), 35]
];

function aslImportUpdates(): SheetValueUpdate[] {
  const updates: SheetValueUpdate[] = [
    { range: 'A1:D1', values: [['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA']] }
  ];
  ASL_IMPORT_ROWS.forEach(([email, ore], i) => {
    updates.push({ range: `A${2 + i}:C${2 + i}`, values: [[email, ASL_IMPORT_ANNO, ore]] });
  });
  updates.push({ range: 'A6:D6', values: [['', '', '', '2026-08-10T09:00:00Z']] });
  return updates;
}

function aslImportPolicyUpdates(): SheetValueUpdate[] {
  return [
    { range: 'A1:D1', values: [['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA']] },
    {
      range: 'A2:D2',
      values: [[e2eAlunnoEmail(43), ASL_IMPORT_ANNO, 999, '2026-08-10T09:00:00Z']]
    }
  ];
}

function aslImportNoHeaderUpdates(): SheetValueUpdate[] {
  return [{ range: 'A1:C1', values: [[e2eAlunnoEmail(52), ASL_IMPORT_ANNO, 77]] }];
}

function carenzeImportTimestampUpdates(): SheetValueUpdate[] {
  return [
    {
      range: 'A1:I3',
      values: [
        [
          'STUDENTE',
          'PROGRESSIVO',
          'CLASSE',
          'DATA',
          'NOTIFICATO',
          'ASSENZE',
          'NOTE',
          'DATA_MODIFICA',
          'MAT'
        ],
        [
          e2eAlunnoEmail(1),
          1,
          '1A',
          '2026-07-01',
          false,
          false,
          'Sorgente timestamp più recente',
          '2026-07-02',
          4
        ],
        [
          e2eAlunnoEmail(21),
          1,
          '2B',
          '2026-07-01',
          false,
          false,
          'Sorgente timestamp più vecchia',
          '2026-06-30',
          4
        ]
      ]
    }
  ];
}

/**
 * Exercises bullet/number lists, tablerow/tablecol loops, and pipe filters (sortBy/filter/
 * uppercase) against real CDU paths (`SPECS_ALDO/02_CDU_STRUTTURA.md` §4.1) already confirmed
 * elsewhere in this file: `focus.classe.coordinatori.elenco` (VERBALE_PARAGRAPHS), `focus.classe.
 * rappresentanti.studenti.elenco` (RIEPILOGO_PARAGRAPHS), `focus.classe.studenti.elenco`
 * (RIEPILOGO_TABLES), and `focus.classe.consiglio.elenco` (VERBALE_PARAGRAPHS, also in
 * production via `SheetMaterieGeneratorStrategy.buildGroups`). `sortBy`/`filter` are piped
 * directly onto each loop directive's own source expression (`{{#loop:path | filter:args}}`);
 * whether that composition actually renders is only provable by a live online run — this test
 * only asserts the authored template string, matching every other test in this file.
 *
 * Also exercises the genuinely-new §9.2 sections (PROMPT_MODIFY_CDU.md action item 5):
 * `esame.materiePrimaProva`, `coordinatori.elenco.0.appellativoCompleto` (dot-index addressing,
 * already proven by `{{materie.0.sigla}}` in DOC_COMPLESSO_TABLES below), `progetti`, and
 * `status.religioneLabel`.
 */
// Il ramo perSpecificita è un array CDU standard: il documento complesso
// prova rendering Mustache a tre livelli su una generazione normale.
const DOC_COMPLESSO_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Report Complesso — {{focus.classe.nome}}',
  'Link di interoperabilità: https://www.example.com/aldo-e2e',
  'Coordinatori, ordinati per nome (elenco puntato, con filtro sortBy sul source del loop):',
  {
    text: "{{#bullet_list:focus.classe.coordinatori.elenco | sortBy:'nome'}}{{nomeCompleto | uppercase}} — {{materia}}{{/bullet_list}}",
    listType: 'bullet'
  },
  'Rappresentanti degli studenti (elenco numerato, con filtro active sul source del loop):',
  {
    text: "{{#number_list:focus.classe.rappresentanti.studenti.elenco | filter:'active',true}}{{nomeCompleto}}{{/number_list}}",
    listType: 'number'
  },
  "Materie di prima prova d'esame:",
  {
    text: '{{#bullet_list:focus.classe.esame.materiePrimaProva}}{{nome}}: {{docentiDescrizione}}{{/bullet_list}}',
    listType: 'bullet'
  },
  'Coordinatore principale: {{focus.classe.coordinatori.elenco.0.appellativoCompleto}}',
  'Progetti extracurricolari:',
  {
    text: '{{#bullet_list:focus.classe.progetti.elenco}}{{tipoLabel}}: {{nome}} ({{referente.appellativoCompleto}}, {{ore}}h){{/bullet_list}}',
    listType: 'bullet'
  },
  'Alunni e situazione religione:',
  {
    text: '{{#bullet_list:focus.classe.studenti.elenco}}{{nomeCompleto}} — {{religioneLabel}}{{/bullet_list}}',
    listType: 'bullet'
  },
  'Specificità per materia (sempre disponibile nel CDU classe; 3 livelli):',
  {
    text: '{{#focus.classe.studenti.perSpecificita}}{{materiaNome}}: {{#specifiche}}{{nome}} ({{#alunni}}{{nomeCompleto}};{{/alunni}}){{/specifiche}}{{/focus.classe.studenti.perSpecificita}}',
    listType: 'bullet'
  }
];

const DOC_COMPLESSO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Alunno', 'Email'],
      [
        "{{#tablerow_loop:focus.classe.studenti.elenco | sortBy:'nomeCompleto'}}{{nomeCompleto}}",
        '{{email}}'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  },
  {
    data: [['{{#tablecol_loop:focus.classe.consiglio.elenco}}{{materie.0.sigla | uppercase}}']],
    options: { headerRow: true }
  }
];

/**
 * DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA (design spec
 * `2026-07-30-classe-articolata-report-design.md`): 4 flat `bullet_list`
 * blocks over already-shaped CDU arrays (Tasks 1-5) — no nested loops, no
 * `where`/`map`/`join` pipes, so nothing here depends on unproven
 * WorkspaceTemplateEngine pipe-chaining behavior.
 */
const DOC_ARTICOLATA_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Documento Complesso Classe Articolata — {{focus.classe.nome}}',
  'Elenco studenti (indirizzo tra parentesi):',
  {
    text: "{{#bullet_list:focus.classe.studenti.elenco | sortBy:'nomeCompleto'}}{{nomeCompleto}} ({{classe.indirizzo.nome}}){{/bullet_list}}",
    listType: 'bullet'
  },
  'Docenti comuni a tutta la classe (materie tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.consiglio.comune}}{{appellativoCompleto}} ({{materieDescrizione}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Docenti per indirizzo (materie e indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.consiglio.separato}}{{materieDescrizione}} ({{gruppoNome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti degli studenti (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.studenti.elenco}}{{nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti dei genitori (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.genitori.elenco}}{{nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  // No `(indirizzo)` parenthetical here (unlike the rappresentanti/studenti loops above):
  // ClasseProvider.buildCoordinatori never attaches an `indirizzo` field to PersonVM items —
  // even when a partner's coordinatori are folded together for a parent articulated class —
  // so there is no CDU-backed value to print.
  'Coordinatori:',
  {
    text: '{{#bullet_list:focus.classe.coordinatori.elenco}}{{appellativoCompleto}}{{/bullet_list}}',
    listType: 'bullet'
  }
];

const CDC_RIEPILOGO_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Riepilogo firme del Consiglio di Classe {{focus.classe.nome}}',
  'Indirizzo: {{focus.classe.indirizzo.nomeSintetico}}',
  'Data: {{meta.oggi.breve}}',
  'Docenti presenti:'
];

/** The existing verbale template already renders `consiglio.elenco` for every generated
 * class, while the riepilogo template proves the row-loop table contract. Reusing their
 * common CDU shape keeps this signature table valid for both plain classes and articulated
 * partners selected by ARTICOLATA. */
const CDC_RIEPILOGO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Docente', 'Materie', 'Firma'],
      [
        '{{#tablerow_loop:focus.classe.consiglio.elenco}}{{appellativoCompleto}}',
        '{{materieDescrizione}}',
        '________________'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  }
];

/**
 * Single header cell carrying the whole multi-group `{{dynamic_columns[...]}}` placeholder
 * (`WorkspaceTemplateEngine_docs.md` "Sintassi multi-gruppo"): 3 sequential column groups,
 * groups 2/3 each preceded by a structural label column (`label2`/`label3`), resolved against
 * `focus.classe.sheet.materieColonne.gruppi[].colonne[]` (+ `gruppi[].label`) — Task 22
 * attached the multi-group projection under `focus.classe.sheet`, not a bare `materieColonne`
 * root (02 §2.17/§9.3) — the SHEET_CON_MATERIE_E_PERMESSI generator's per-subject column layout
 * for scenario C.
 */
function sheetPermessiUpdates(): SheetValueUpdate[] {
  return [
    {
      range: 'A1',
      values: [
        [
          '{{dynamic_columns[' +
            'source=focus.classe.sheet.materieColonne.gruppi.0.colonne,value=header,' +
            'source2=focus.classe.sheet.materieColonne.gruppi.1.colonne,value2=header,' +
            'label2=focus.classe.sheet.materieColonne.gruppi.1.label,' +
            'source3=focus.classe.sheet.materieColonne.gruppi.2.colonne,value3=header,' +
            'label3=focus.classe.sheet.materieColonne.gruppi.2.label' +
            ']}}'
        ]
      ]
    }
  ];
}

/** Scenario D (coordinatore's work-plan doc): a minimal per-class template, same CDU paths
 * already confirmed elsewhere in this file (VERBALE_PARAGRAPHS `focus.classe.*`). */
const PIANO_LAVORO_PARAGRAPHS = [
  'Piano di Lavoro Annuale — {{focus.classe.nome}}',
  'Indirizzo: {{focus.classe.indirizzo.nomeSintetico}}',
  'Anno scolastico: {{meta.oggi.breve}}'
];

const STATIC_ATTACHMENT_PARAGRAPHS = [
  'ALDO E2E static email attachment',
  'Questo documento è allegato tramite CONF_MAIL.ALLEGATI_STATICI senza essere rappresentato da un box.'
];

const TABELLE_IMPORTATE_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Colonna', 'Valore'],
      ['A', 'Uno'],
      ['B', 'Due']
    ],
    options: { headerRow: true }
  },
  { data: [['Colonna', 'Valore']], options: { headerRow: true } }
];

function tabelleImportateParagraphs(
  tabellaSorgenteDati: string,
  tabellaSorgenteVuota: string
): E2eDocumentParagraphInput[] {
  return [
    'Tabelle importate per la classe {{focus.classe.nome}}',
    `{{TABELLA:${tabellaSorgenteDati}}}`,
    'Testo dopo la tabella con dati',
    `{{TABELLA:${tabellaSorgenteVuota}}}`,
    'Testo dopo la tabella vuota'
  ];
}

function tabellaSorgenteDatiUpdates(): SheetValueUpdate[] {
  return [
    {
      range: 'A1:B3',
      values: [
        ['Nome', 'Valore'],
        ['Prima riga', '1'],
        ['Seconda riga', '2']
      ]
    }
  ];
}

function tabellaSorgenteVuotaUpdates(): SheetValueUpdate[] {
  return [{ range: 'A1:B1', values: [['Nome', 'Valore']] }];
}

const STORICO_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Storico dell’alunno {{focus.alunno.nomeCompleto}}',
  '{{#focus.alunno.storico.anni}}{{annoScolastico}} — {{classe.nome}}: {{esito}}{{/focus.alunno.storico.anni}}',
  '{{#focus.alunno.storico.bocciature.elenco}}Bocciatura {{annoScolastico}} — {{classe.nome}}{{/focus.alunno.storico.bocciature.elenco}}',
  'Storico della classe {{focus.classe.nome}}',
  '{{#focus.classe.storico.anni}}{{annoScolastico}} — {{classe.nome}}: {{statistiche.totale}} alunni{{/focus.classe.storico.anni}}',
  '{{#focus.classe.storico.anni}}{{annoScolastico}} — {{classe.nome}}: {{#progetti}}{{nome}}{{/progetti}}{{/focus.classe.storico.anni}}'
];

/** `focus.classe.materie` is the canonical SubjectVM catalog (02 §4.1/§8.2), including
 * dotted `specificita`, `isItp`, and the preformatted assigned-teacher description. */
const DOTTED_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Materie dotted e ITP della classe {{focus.classe.nome}}',
  {
    text: '{{#bullet_list:focus.classe.materie.elenco}}{{sigla}} — {{nome}} ({{specificita}}); {{#isItp}}ITP presente; {{/isItp}}{{docentiDescrizione}}{{/bullet_list}}',
    listType: 'bullet'
  }
];

const STORICO_EMAIL_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Allegato storico per la classe {{focus.classe.nome}}',
  '{{#focus.classe.storico.anni}}{{annoScolastico}} — {{classe.nome}}: {{statistiche.totale}} alunni{{/focus.classe.storico.anni}}',
  '{{#focus.classe.storico.anni}}{{annoScolastico}} — {{classe.nome}}: {{#progetti}}{{nome}}{{/progetti}}{{/focus.classe.storico.anni}}'
];

/**
 * Idempotently finds-or-creates the real Drive templates and static attachment used by the
 * e2e scenarios (design spec `2026-07-21-testonline-mock-db-e2e-design.md`, "Template
 * provisioning"): a fixed name per artifact, looked up via `IDriveFacade.findFileByName`
 * before creating — repeated runs reuse the same Drive artifacts, matching the
 * `SampleDatabaseBuilder`/`GasSampleSpreadsheetFactory` reuse-by-fixed-name convention.
 */
export class E2eTemplateProvisioner {
  constructor(
    private readonly artifacts: IArtifactFactory,
    private readonly drive: IDriveFacade
  ) {}

  provision(folderId: string): E2eTemplateIds {
    const verbale = this.findOrCreateDoc(folderId, NAME_VERBALE, VERBALE_PARAGRAPHS);
    const condotta = this.findOrCreateSheet(folderId, NAME_CONDOTTA, condottaUpdates());
    const riepilogo = this.findOrCreateDoc(
      folderId,
      NAME_RIEPILOGO,
      RIEPILOGO_PARAGRAPHS,
      RIEPILOGO_TABLES
    );
    const aslImportSheet = this.findOrCreateSheet(folderId, NAME_ASL_IMPORT, aslImportUpdates());
    const aslImportPolicySheet = this.findOrCreateSheet(
      folderId,
      NAME_ASL_IMPORT_POLICY,
      aslImportPolicyUpdates()
    );
    const aslImportNoHeaderSheet = this.findOrCreateSheet(
      folderId,
      NAME_ASL_IMPORT_NOHEADER,
      aslImportNoHeaderUpdates()
    );
    const carenzeImportTimestampSheet = this.findOrCreateSheet(
      folderId,
      NAME_CARENZE_IMPORT_TIMESTAMP,
      carenzeImportTimestampUpdates()
    );
    const docComplesso = this.findOrCreateDoc(
      folderId,
      NAME_DOC_COMPLESSO,
      DOC_COMPLESSO_PARAGRAPHS,
      DOC_COMPLESSO_TABLES
    );
    const docArticolata = this.findOrCreateDoc(
      folderId,
      NAME_DOC_ARTICOLATA,
      DOC_ARTICOLATA_PARAGRAPHS
    );
    const cdcRiepilogo = this.findOrCreateDoc(
      folderId,
      NAME_CDC_RIEPILOGO,
      CDC_RIEPILOGO_PARAGRAPHS,
      CDC_RIEPILOGO_TABLES
    );
    const sheetPermessi = this.findOrCreateSheet(
      folderId,
      NAME_SHEET_PERMESSI,
      sheetPermessiUpdates()
    );
    const pianoLavoro = this.findOrCreateDoc(folderId, NAME_PIANO_LAVORO, PIANO_LAVORO_PARAGRAPHS);
    const staticAttachment = this.findOrCreateDoc(
      folderId,
      NAME_STATIC_ATTACHMENT,
      STATIC_ATTACHMENT_PARAGRAPHS
    );
    const tabellaSorgenteDati = this.findOrCreateSheet(
      folderId,
      NAME_TABELLA_SORGENTE_DATI,
      tabellaSorgenteDatiUpdates()
    );
    const tabellaSorgenteVuota = this.findOrCreateSheet(
      folderId,
      NAME_TABELLA_SORGENTE_VUOTA,
      tabellaSorgenteVuotaUpdates()
    );
    const tabelleImportate = this.findOrCreateDoc(
      folderId,
      NAME_DOC_TABELLE,
      tabelleImportateParagraphs(tabellaSorgenteDati, tabellaSorgenteVuota),
      TABELLE_IMPORTATE_TABLES
    );
    const storico = this.findOrCreateDoc(folderId, NAME_DOC_STORICO, STORICO_PARAGRAPHS);
    const dotted = this.findOrCreateDoc(folderId, NAME_DOC_DOTTED, DOTTED_PARAGRAPHS);
    const storicoEmail = this.findOrCreateDoc(
      folderId,
      NAME_DOC_STORICO_EMAIL,
      STORICO_EMAIL_PARAGRAPHS
    );
    const piani = {} as E2eTemplateIds['piani'];
    for (const tipo of TIPI_PIANO) {
      piani[tipo] = this.findOrCreateDoc(folderId, namePiano(tipo), pianoParagraphs(tipo));
    }
    return {
      verbale,
      condotta,
      riepilogo,
      aslImportSheet,
      aslImportPolicySheet,
      aslImportNoHeaderSheet,
      carenzeImportTimestampSheet,
      docComplesso,
      docArticolata,
      cdcRiepilogo,
      sheetPermessi,
      pianoLavoro,
      staticAttachment,
      tabelleImportate,
      tabellaSorgenteDati,
      tabellaSorgenteVuota,
      storico,
      dotted,
      storicoEmail,
      piani
    };
  }

  private findOrCreateDoc(
    folderId: string,
    name: string,
    paragraphs: E2eDocumentParagraphInput[],
    tables?: E2eDocumentTable[]
  ): string {
    return (
      this.drive.findFileByName(folderId, name) ??
      this.artifacts.createDocument(name, folderId, paragraphs, tables)
    );
  }

  private findOrCreateSheet(folderId: string, name: string, updates: SheetValueUpdate[]): string {
    return (
      this.drive.findFileByName(folderId, name) ??
      this.artifacts.createSheet(name, folderId, updates)
    );
  }
}
