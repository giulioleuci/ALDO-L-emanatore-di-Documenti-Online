import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import { TIPI_PIANO, type E2eTemplateIds } from './E2eSampleDatabaseBuilder';

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

/**
 * Port abstracting Drive-artifact creation, so the provisioner is unit-testable offline.
 * `paragraphs`/`tables`/`updates` are only ever passed on first creation (never on a found-and-reused
 * artifact) — content is authored once, not re-appended on every idempotent re-run.
 */
export interface IArtifactFactory {
  createDocument(
    name: string,
    folderId: string,
    paragraphs?: string[],
    tables?: E2eDocumentTable[]
  ): string;
  createSheet(name: string, folderId: string, updates?: SheetValueUpdate[]): string;
}

const NAME_VERBALE = 'E2E Verbale Template';
const NAME_CONDOTTA = 'E2E Condotta Template';
const NAME_RIEPILOGO = 'E2E Riepilogo Template v3';
function namePiano(tipo: string): string {
  return `E2E Piano ${tipo} Template`;
}

/**
 * `{{...}}` flat substitution + `{{#bullet_list:source}}itemTemplate{{/bullet_list}}` array
 * rendering (WorkspaceTemplateEngine `DocumentProcessor` — undocumented in
 * `WorkspaceTemplateEngine_docs.md`, confirmed against `DocumentProcessorTagScanner.js`), all
 * against real CDU paths (`SPECS_ALDO/02_CDU_STRUTTURA.md` §4.1) so scenario 1/4 actually
 * exercise real substitution, not a blank Doc that merely "doesn't crash".
 */
const VERBALE_PARAGRAPHS = [
  'Verbale del Consiglio di Classe',
  'Classe: {{focus.classe.anagrafica.nome}} — Indirizzo: {{focus.classe.anagrafica.indirizzo.nomeSintetico}}',
  'Data: {{meta.date.oggi.breve}}',
  'Composizione del Consiglio di Classe:',
  '{{#bullet_list:focus.classe.consiglioDiClasse}}{{anagrafica.nome}} {{anagrafica.cognome}}{{/bullet_list}}',
  'Coordinatori:',
  '{{#bullet_list:focus.classe.coordinatori}}{{nome}} ({{materia}}){{/bullet_list}}'
];

/** `piano.note` matches `PIANI.PARAMETRI` seeded by `E2eSampleDatabaseBuilder` (`{note: "Piano E2E <tipo>"}`,
 * ref `DocPersonalizzatoGeneratorStrategy`'s `piano.<campo>` context). */
function pianoParagraphs(tipo: string): string[] {
  return [
    `Piano Personalizzato — ${tipo}`,
    'Studente: {{focus.alunno.anagrafica.nomeCompleto}}',
    'Classe: {{focus.alunno.classe.nome}}',
    'Data: {{meta.date.oggi.breve}}',
    'Note: {{piano.note}}'
  ];
}

const RIEPILOGO_PARAGRAPHS = [
  'Riepilogo Classe {{focus.classe.anagrafica.nome}}',
  'Elenco studenti:',
  'Numero totale studenti: {{focus.classe.studenti.statistiche.totale}}',
  'Rappresentanti degli studenti:',
  '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}}{{/bullet_list}}',
  'Rappresentanti dei genitori:',
  '{{#bullet_list:focus.classe.rappresentanti.genitori}}{{nomeCompleto}}{{/bullet_list}}'
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
    { range: 'A1:E1', values: [['Studente', 'Comportamento', 'Impegno', 'Partecipazione', 'Media']] },
    {
      range: 'A2',
      values: [
        ['{{dynamic_rows[source=focus.classe.studenti.listaCompleta,value=anagrafica.nomeCompleto]}}']
      ]
    }
  ];
  for (let i = 0; i < CONDOTTA_ROSTER_ROWS; i++) {
    const row = 2 + i;
    updates.push({ range: `E${row}`, values: [[`=IFERROR(AVERAGE(B${row}:D${row}),"")`]] });
  }
  return updates;
}

/**
 * Idempotently finds-or-creates the 7 real Drive templates the e2e scenarios generate
 * against (design spec `2026-07-21-testonline-mock-db-e2e-design.md`, "Template
 * provisioning"): a fixed name per template, looked up via `IDriveFacade.findFileByName`
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
    const piani = {} as E2eTemplateIds['piani'];
    for (const tipo of TIPI_PIANO) {
      piani[tipo] = this.findOrCreateDoc(folderId, namePiano(tipo), pianoParagraphs(tipo));
    }
    return { verbale, condotta, riepilogo, piani };
  }

  private findOrCreateDoc(
    folderId: string,
    name: string,
    paragraphs: string[],
    tables?: E2eDocumentTable[]
  ): string {
    return (
      this.drive.findFileByName(folderId, name) ??
      this.artifacts.createDocument(name, folderId, paragraphs, tables)
    );
  }

  private findOrCreateSheet(folderId: string, name: string, updates: SheetValueUpdate[]): string {
    return (
      this.drive.findFileByName(folderId, name) ?? this.artifacts.createSheet(name, folderId, updates)
    );
  }
}
