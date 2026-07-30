import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import { TIPI_PIANO, type E2eTemplateIds, e2eAlunnoEmail } from './E2eSampleDatabaseBuilder';

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
const NAME_DOC_COMPLESSO = 'E2E Doc Complesso Template v2';
const NAME_DOC_ARTICOLATA = 'E2E Doc Articolata Template';
const NAME_SHEET_PERMESSI = 'E2E Sheet Permessi Template';
const NAME_PIANO_LAVORO = 'E2E Piano Lavoro Template';
const NAME_STATIC_ATTACHMENT = 'E2E Static Attachment Fixture';
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
  'Classe: {{focus.classe.anagrafica.nome}} — Indirizzo: {{focus.classe.anagrafica.indirizzo.nomeSintetico}}',
  'Data: {{meta.date.oggi.breve}}',
  'Composizione del Consiglio di Classe:',
  {
    text: '{{#bullet_list:focus.classe.consiglioDiClasse}}{{anagrafica.nome}} {{anagrafica.cognome}}{{/bullet_list}}',
    listType: 'bullet'
  },
  'Coordinatori:',
  {
    text: '{{#bullet_list:focus.classe.coordinatori}}{{nome}} ({{materia}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Piani personalizzati generati:',
  {
    text: '{{#bullet_list:focus.classe.didattica.pianiPersonalizzati.items}}{{studente.nomeCompleto}} - {{sottotipo}}{{/bullet_list}}',
    listType: 'bullet'
  }
];

/** Personalized-plan templates deliberately print both the focused subtype and
 * its parameters so the online scenario proves conditional model selection and
 * focused CDU isolation for students with more than one plan. */
function pianoParagraphs(tipo: string): string[] {
  return [
    `Modello E2E ${tipo}`,
    'Studente: {{focus.alunno.anagrafica.nomeCompleto}}',
    'Classe: {{focus.alunno.classe.nome}}',
    'Data: {{meta.date.oggi.breve}}',
    'Tipo piano: {{focus.piano.tipo}}',
    'Note: {{focus.piano.parametriGenerazione.note}}'
  ];
}

const RIEPILOGO_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Riepilogo Classe {{focus.classe.anagrafica.nome}}',
  'Elenco studenti:',
  'Numero totale studenti: {{focus.classe.studenti.statistiche.totale}}',
  'Rappresentanti degli studenti:',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}}{{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti dei genitori:',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.genitori}}{{nomeCompleto}}{{/bullet_list}}',
    listType: 'bullet'
  }
];

const RIEPILOGO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Alunno', 'Religione', 'Email', 'Piani'],
      [
        '{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}',
        '{{status.religione}}',
        '{{anagrafica.email}}',
        '{{didattica.piani.hasPiani}}'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  }
];

/** Roster rows generous enough for the ~20-student classes `E2eSampleDatabaseBuilder` seeds. */
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
      values: [
        [
          '{{dynamic_rows[source=focus.classe.studenti.listaCompleta,value=anagrafica.nomeCompleto]}}'
        ]
      ]
    }
  ];
  for (let i = 0; i < CONDOTTA_ROSTER_ROWS; i++) {
    const row = 2 + i;
    updates.push({ range: `E${row}`, values: [[`=IFERROR(AVERAGE(B${row}:D${row}),"")`]] });
  }
  return updates;
}

/** School year matching E2eSampleDatabaseBuilder's seedMaster ANNO_SCOLASTICO (3rd-year students only, design spec "fixture-only scoping"). */
const ASL_IMPORT_ANNO = '2026-2027';
const ASL_IMPORT_ROWS: Array<[string, number]> = [
  [e2eAlunnoEmail(43), 40],
  [e2eAlunnoEmail(44), 55],
  [e2eAlunnoEmail(51), 60],
  [e2eAlunnoEmail(52), 35]
];

function aslImportUpdates(): SheetValueUpdate[] {
  const updates: SheetValueUpdate[] = [{ range: 'A1:C1', values: [['STUDENTE', 'ANNO', 'ORE']] }];
  ASL_IMPORT_ROWS.forEach(([email, ore], i) => {
    updates.push({ range: `A${2 + i}:C${2 + i}`, values: [[email, ASL_IMPORT_ANNO, ore]] });
  });
  return updates;
}

/**
 * Exercises bullet/number lists, tablerow/tablecol loops, and pipe filters (sortBy/filter/
 * uppercase) against real CDU paths (`SPECS_ALDO/02_CDU_STRUTTURA.md` §4.1) already confirmed
 * elsewhere in this file: `focus.classe.coordinatori` (VERBALE_PARAGRAPHS), `focus.classe.
 * rappresentanti.studenti` (RIEPILOGO_PARAGRAPHS), `focus.classe.studenti.listaCompleta`
 * (RIEPILOGO_TABLES), and `focus.classe.consiglioDiClasse` (VERBALE_PARAGRAPHS, also in
 * production via `SheetMaterieGeneratorStrategy.buildGroups`). `sortBy`/`filter` are piped
 * directly onto each loop directive's own source expression (`{{#loop:path | filter:args}}`);
 * whether that composition actually renders is only provable by a live online run — this test
 * only asserts the authored template string, matching every other test in this file.
 */
const DOC_COMPLESSO_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Report Complesso — {{focus.classe.anagrafica.nome}}',
  'Coordinatori, ordinati per nome (elenco puntato, con filtro sortBy sul source del loop):',
  {
    text: "{{#bullet_list:focus.classe.coordinatori | sortBy:'nome'}}{{nome | uppercase}} — {{materia}}{{/bullet_list}}",
    listType: 'bullet'
  },
  'Rappresentanti degli studenti (elenco numerato, con filtro active sul source del loop):',
  {
    text: "{{#number_list:focus.classe.rappresentanti.studenti | filter:'active',true}}{{nomeCompleto}}{{/number_list}}",
    listType: 'number'
  }
];

const DOC_COMPLESSO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Alunno', 'Email'],
      [
        "{{#tablerow_loop:focus.classe.studenti.listaCompleta | sortBy:'anagrafica.nomeCompleto'}}{{anagrafica.nomeCompleto}}",
        '{{anagrafica.email}}'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  },
  {
    data: [['{{#tablecol_loop:focus.classe.consiglioDiClasse}}{{materie.0.sigla | uppercase}}']],
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
  'Documento Complesso Classe Articolata — {{focus.classe.anagrafica.nome}}',
  'Elenco studenti (indirizzo tra parentesi):',
  {
    text: "{{#bullet_list:focus.classe.studenti.listaCompleta | sortBy:'anagrafica.nomeCompleto'}}{{anagrafica.nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}",
    listType: 'bullet'
  },
  'Docenti comuni a tutta la classe (materie tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.consiglioDiClasseComune}}{{anagrafica.nome}} {{anagrafica.cognome}} ({{materieDescrizione}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Docenti per indirizzo (materie e indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.consiglioDiClasseSeparato}}{{materieDescrizione}} ({{gruppoNome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti degli studenti (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti dei genitori (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.genitori}}{{nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Coordinatori (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.coordinatori}}{{nome}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  }
];

/**
 * Single header cell carrying the whole multi-group `{{dynamic_columns[...]}}` placeholder
 * (`WorkspaceTemplateEngine_docs.md` "Sintassi multi-gruppo"): 3 sequential column groups,
 * groups 2/3 each preceded by a structural label column (`label2`/`label3`), resolved against
 * a `materieColonne.group1/2/3` (+ `group2Label`/`group3Label`) context shape — the
 * SHEET_CON_MATERIE_E_PERMESSI generator's per-subject column layout for scenario C.
 */
function sheetPermessiUpdates(): SheetValueUpdate[] {
  return [
    {
      range: 'A1',
      values: [
        [
          '{{dynamic_columns[' +
            'source=materieColonne.group1,value=header,' +
            'source2=materieColonne.group2,value2=header,label2=materieColonne.group2Label,' +
            'source3=materieColonne.group3,value3=header,label3=materieColonne.group3Label' +
            ']}}'
        ]
      ]
    }
  ];
}

/** Scenario D (coordinatore's work-plan doc): a minimal per-class template, same CDU paths
 * already confirmed elsewhere in this file (VERBALE_PARAGRAPHS `focus.classe.anagrafica.*`). */
const PIANO_LAVORO_PARAGRAPHS = [
  'Piano di Lavoro Annuale — {{focus.classe.anagrafica.nome}}',
  'Indirizzo: {{focus.classe.anagrafica.indirizzo.nomeSintetico}}',
  'Anno scolastico: {{meta.date.oggi.breve}}'
];

const STATIC_ATTACHMENT_PARAGRAPHS = [
  'ALDO E2E static email attachment',
  'Questo documento è allegato tramite CONF_MAIL.ALLEGATI senza essere rappresentato da un box.'
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
    const piani = {} as E2eTemplateIds['piani'];
    for (const tipo of TIPI_PIANO) {
      piani[tipo] = this.findOrCreateDoc(folderId, namePiano(tipo), pianoParagraphs(tipo));
    }
    return {
      verbale,
      condotta,
      riepilogo,
      aslImportSheet,
      docComplesso,
      docArticolata,
      sheetPermessi,
      pianoLavoro,
      staticAttachment,
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
