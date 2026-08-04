import { buildAldoContainer } from '../../../src/config/Bootstrap';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import {
  registerEffectiveAssignmentMatrixChecks,
  registerRepositoryChecks
} from '../../../src/onlinetests/checks/repositoryChecks';
import { registerEffectiveAssignmentConsumerChecks } from '../../../src/onlinetests/checks/contextEngineChecks';
import type { SampleDatabase } from '../../../src/onlinetests/SampleDatabaseBuilder';
import {
  CLASSE_BASE,
  CLASSE_PARTNER,
  DOCENTE_1,
  DOCENTE_2,
  DOCENTE_3,
  MATERIA_1,
  INDIRIZZO_1,
  DIPART_1,
  alunnoEmail,
  ALUNNO_PARTNER_EMAIL
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { fixtureTables } from '../../fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';
import {
  E2eSampleDatabaseBuilder,
  CLASSE_A,
  CLASSE_C_PARENT,
  CLASSE_C,
  CLASSE_C_PARTNER,
  e2eAlunnoEmail,
  e2eDocenteEmail
} from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import {
  TABLE,
  COL_ALUNNI,
  COL_CLASSI,
  COL_MATERIE,
  COL_SUPPLENZE,
  COL_VARIAZIONI_CATTEDRA
} from '../../../src/config/schema';

const NOW = new Date('2026-07-12T09:00:00Z');

class RecordingSpreadsheet implements ISampleSpreadsheet {
  readonly rows: Record<string, Record<string, unknown>[]> = {};

  constructor(readonly id: string) {}

  addSheet(name: string): void {
    this.rows[name] = [];
  }

  appendRow(sheetName: string, row: Record<string, unknown>): void {
    (this.rows[sheetName] ??= []).push(row);
  }

  getUrl(): string {
    return `https://example.test/${this.id}`;
  }
}

function e2eRecordingFactory(): {
  spreadsheets: ISampleSpreadsheetFactory;
  sheets: Map<string, RecordingSpreadsheet>;
  master: RecordingSpreadsheet;
} {
  const sheets = new Map<string, RecordingSpreadsheet>();
  const master = new RecordingSpreadsheet('bound-master-id');
  return {
    sheets,
    master,
    spreadsheets: {
      createSpreadsheet: (name: string) => {
        const spreadsheet = new RecordingSpreadsheet(`id_${name}`);
        sheets.set(name, spreadsheet);
        return spreadsheet;
      },
      openExistingSpreadsheet: () => master
    }
  };
}

const E2E_TEMPLATE_IDS = {
  verbale: 'tmpl_verbale',
  condotta: 'tmpl_condotta',
  riepilogo: 'tmpl_riepilogo',
  aslImportSheet: 'tmpl_asl_import',
  docComplesso: 'tmpl_doc_complesso',
  sheetPermessi: 'tmpl_sheet_permessi',
  pianoLavoro: 'tmpl_piano_lavoro',
  staticAttachment: 'static_attachment',
  piani: {
    PDP_DSA: 'tmpl_pdp_dsa',
    PDP_BES: 'tmpl_pdp_bes',
    PDP_STRANIERI: 'tmpl_pdp_stranieri',
    PEI: 'tmpl_pei',
    PFP: 'tmpl_pfp'
  }
};

/** Table rows mirroring SampleDatabaseBuilder's real seed (see SampleDatabaseBuilder.ts), keyed by
 * the same exported constants so these checks exercise real ClasseRepository/AlunnoRepository/
 * CattedraResolver behavior against realistic fixture values — not invented ones. */
function sampleSeedTables(options: { includeClasse?: boolean } = {}): Record<string, Row[]> {
  const includeClasse = options.includeClasse ?? true;
  const classi: Row[] = includeClasse
    ? [
        {
          ID: CLASSE_BASE,
          ANNO: 4,
          INDIRIZZO: INDIRIZZO_1,
          ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_PARTNER, partners: null }),
          RUOLI: '',
          ATTIVA: true,
          COORD: DOCENTE_1,
          IRC: '',
          ALT: '',
          SEZ: 'A',
          TERMINALE: false,
          STORICO: false,
          [MATERIA_1]: DOCENTE_1
        },
        {
          ID: CLASSE_PARTNER,
          ANNO: 4,
          INDIRIZZO: INDIRIZZO_1,
          ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_BASE, partners: null }),
          RUOLI: '',
          ATTIVA: true,
          COORD: DOCENTE_2,
          IRC: '',
          ALT: '',
          SEZ: 'A',
          TERMINALE: false,
          STORICO: false
        }
      ]
    : [];
  return {
    ...fixtureTables(),
    CLASSI: classi,
    DOCENTI: [
      {
        EMAIL: DOCENTE_1,
        COGNOME: 'Rossi',
        NOME: 'Mario',
        GENERE: 'M',
        DIPART: DIPART_1,
        ITP: false
      },
      {
        EMAIL: DOCENTE_2,
        COGNOME: 'Bianchi',
        NOME: 'Laura',
        GENERE: 'F',
        DIPART: DIPART_1,
        ITP: false
      },
      {
        EMAIL: DOCENTE_3,
        COGNOME: 'Verdi',
        NOME: 'Paolo',
        GENERE: 'M',
        DIPART: DIPART_1,
        ITP: false
      }
    ],
    MATERIE: [
      {
        ID: MATERIA_1,
        NOME: 'Matematica',
        SINTESI: 'MAT',
        COLORE_1: '#1565C0',
        COLORE_2: '#90CAF9',
        SIMBOLO: 'M',
        ESAME_CFG: null
      }
    ],
    ALUNNI: [
      ...[1, 2, 3, 4].map((i) => ({
        EMAIL: alunnoEmail(i),
        COGNOMENOME: `Alunno${i} Test`,
        CLASSE: CLASSE_BASE,
        RELIGIONE: 'SI',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: '',
        TUTOR_2: '',
        CURRICULUM: null
      })),
      {
        EMAIL: ALUNNO_PARTNER_EMAIL,
        COGNOMENOME: 'Alunno5 Test',
        CLASSE: CLASSE_PARTNER,
        RELIGIONE: 'SI',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: '',
        TUTOR_2: '',
        CURRICULUM: null
      }
    ],
    SUPPLENZE: includeClasse
      ? [
          {
            TITOLARE: DOCENTE_1,
            SUPPLENTE: DOCENTE_2,
            DAL: '2026-07-01',
            AL: '2026-07-10',
            CLASSI: CLASSE_BASE,
            MATERIE: MATERIA_1
          }
        ]
      : [],
    VARIAZIONI_CATTEDRA: includeClasse
      ? [
          {
            TITOLARE: DOCENTE_1,
            NUOVO_TITOLARE: DOCENTE_3,
            DAL: '2026-07-05',
            CLASSI: CLASSE_BASE,
            MATERIE: MATERIA_1
          }
        ]
      : []
  };
}

function buildFakeContainer(options: { includeClasse?: boolean } = {}) {
  const db = new FakeDatabase(sampleSeedTables(options));
  return buildAldoContainer({
    db,
    master: new MasterSheetRepository(db),
    drive: new FakeDriveFacade(),
    gmail: new FakeGmailFacade(),
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    now: NOW
  });
}

function sampleFixture(): SampleDatabase {
  return {
    masterSpreadsheetId: 'MASTER_ID',
    sampleSpreadsheetId: 'SAMPLE_ID',
    sampleSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SAMPLE_ID',
    sampleFolderUrl: 'https://drive.google.com/drive/folders/FOLDER_ID'
  };
}

describe('registerRepositoryChecks', () => {
  it('registers passing online matrix checks across the resolver and all assignment consumers', () => {
    const { spreadsheets, sheets, master } = e2eRecordingFactory();
    const sample = new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(
      E2E_TEMPLATE_IDS,
      master
    );
    const db = new FakeDatabase({
      ...(sheets.get('_ALDO_E2E_SAMPLE')!.rows as Record<string, Row[]>),
      MASTER: master.rows.MASTER as Row[]
    });
    const container = buildAldoContainer({
      db,
      master: new MasterSheetRepository(db),
      drive: new FakeDriveFacade(),
      gmail: new FakeGmailFacade(),
      templates: new FakeTemplateEngine(),
      expressionEngine: new ExpressionEngineFacade(),
      now: new Date('2026-07-15T09:00:00Z')
    });
    const runner = new TestRunner();

    registerEffectiveAssignmentMatrixChecks(runner, container, sample);
    registerEffectiveAssignmentConsumerChecks(runner, container, sample);

    const report = runner.report();
    expect(report.results.length).toBeGreaterThanOrEqual(10);
    expect(report.results.map((result) => result.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MAIN'),
        expect.stringContaining('ITP'),
        expect.stringContaining('SPECIFICA'),
        expect.stringContaining('IRC'),
        expect.stringContaining('ALT'),
        expect.stringContaining('CDU'),
        expect.stringContaining('email'),
        expect.stringContaining('document ACL'),
        expect.stringContaining('spreadsheet column ACL'),
        expect.stringContaining('REL/ALT'),
        expect.stringContaining('articulated parent')
      ])
    );
    expect(report.results.map((result) => result.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`full CDU council ${CLASSE_C}`),
        expect.stringContaining(`full CDU council ${CLASSE_C_PARTNER}`),
        expect.stringContaining('rendered sheet header REL/ALT'),
        expect.stringContaining('rendered sheet header REL without ALT')
      ])
    );
    expect(report.results.filter((result) => result.status === 'fail')).toEqual([]);
  });

  it('seeds the online effective-assignment matrix including arbitrary specificities, religion routing, and articulated partners', () => {
    const { spreadsheets, sheets, master } = e2eRecordingFactory();
    new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(
      E2E_TEMPLATE_IDS,
      master
    );
    const rows = sheets.get('_ALDO_E2E_SAMPLE')!.rows;
    const classi = rows[TABLE.CLASSI]!;
    const matrixClass = classi.find((row) => row[COL_CLASSI.ID] === CLASSE_A)!;

    expect(matrixClass).toMatchObject({
      MAT: e2eDocenteEmail(1),
      'INF.itp': e2eDocenteEmail(2),
      'LAB.GRUPPO_A': e2eDocenteEmail(3),
      'LAB.SEMINARIO_POMERIDIANO': e2eDocenteEmail(4),
      'INTERPRET.CHITARRA': e2eDocenteEmail(5),
      IRC: e2eDocenteEmail(6),
      ALT: e2eDocenteEmail(7)
    });

    const religionRows = rows[TABLE.MATERIE]!.filter((row) =>
      ['IRC', 'ALT'].includes(String(row[COL_MATERIE.ID]))
    );
    expect(religionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          [COL_MATERIE.ID]: 'IRC',
          [COL_MATERIE.IS_RELIGIONE_ALT]: true
        }),
        expect.objectContaining({
          [COL_MATERIE.ID]: 'ALT',
          [COL_MATERIE.IS_RELIGIONE_ALT]: true
        })
      ])
    );

    expect(rows[TABLE.VARIAZIONI_CATTEDRA]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          [COL_VARIAZIONI_CATTEDRA.CLASSI]: CLASSE_A,
          [COL_VARIAZIONI_CATTEDRA.MATERIE]: 'MAT',
          [COL_VARIAZIONI_CATTEDRA.TITOLARE]: e2eDocenteEmail(1),
          [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(10)
        }),
        expect.objectContaining({
          [COL_VARIAZIONI_CATTEDRA.CLASSI]: CLASSE_A,
          [COL_VARIAZIONI_CATTEDRA.MATERIE]: 'IRC',
          [COL_VARIAZIONI_CATTEDRA.TITOLARE]: e2eDocenteEmail(6),
          [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(12)
        })
      ])
    );
    expect(rows[TABLE.SUPPLENZE]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(2),
          [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(11),
          [COL_SUPPLENZE.CLASSI]: CLASSE_A,
          [COL_SUPPLENZE.MATERIE]: 'INF'
        }),
        expect.objectContaining({
          [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(7),
          [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(13),
          [COL_SUPPLENZE.MATERIE]: 'ALT'
        }),
        expect.objectContaining({
          [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(13),
          [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(14),
          [COL_SUPPLENZE.MATERIE]: 'ALT'
        })
      ])
    );

    const parent = classi.find((row) => row[COL_CLASSI.ID] === CLASSE_C_PARENT)!;
    const partnerA = classi.find((row) => row[COL_CLASSI.ID] === CLASSE_C)!;
    const partnerB = classi.find((row) => row[COL_CLASSI.ID] === CLASSE_C_PARTNER)!;
    expect(JSON.parse(String(parent[COL_CLASSI.ARTICOLAZIONE]))).toEqual({
      parent: null,
      partner: null,
      partners: `${CLASSE_C},${CLASSE_C_PARTNER}`
    });
    expect(
      (JSON.parse(String(partnerA[COL_CLASSI.ARTICOLAZIONE])) as { parent: string }).parent
    ).toBe(CLASSE_C_PARENT);
    expect(
      (JSON.parse(String(partnerB[COL_CLASSI.ARTICOLAZIONE])) as { parent: string }).parent
    ).toBe(CLASSE_C_PARENT);
    expect(partnerA.MAT).toBeTruthy();
    expect(partnerB.MAT).toBeTruthy();

    const matrixStudents = rows[TABLE.ALUNNI]!.filter((row) => row[COL_ALUNNI.CLASSE] === CLASSE_A);
    expect(matrixStudents.map((row) => row[COL_ALUNNI.RELIGIONE])).toEqual(
      expect.arrayContaining(['SI', 'ALT', 'NO'])
    );
    expect(matrixStudents.map((row) => row[COL_ALUNNI.CURRICULUM])).toEqual(
      expect.arrayContaining([
        JSON.stringify({ LAB: ['GRUPPO_A'] }),
        JSON.stringify({ LAB: ['SEMINARIO_POMERIDIANO'] })
      ])
    );
  });

  it('reports slot diagnostics when a student-filtered council diverges from the hand-derived matrix', () => {
    const { spreadsheets, sheets, master } = e2eRecordingFactory();
    const sample = new E2eSampleDatabaseBuilder(
      spreadsheets,
      new FakeDriveFacade()
    ).build(E2E_TEMPLATE_IDS, master);
    const rows = sheets.get('_ALDO_E2E_SAMPLE')!.rows;
    const student = rows[TABLE.ALUNNI]!.find(
      (row) => row[COL_ALUNNI.EMAIL] === e2eAlunnoEmail(2)
    )!;
    student[COL_ALUNNI.RELIGIONE] = 'NO';
    const db = new FakeDatabase({
      ...(rows as Record<string, Row[]>),
      MASTER: master.rows.MASTER as Row[]
    });
    const container = buildAldoContainer({
      db,
      master: new MasterSheetRepository(db),
      drive: new FakeDriveFacade(),
      gmail: new FakeGmailFacade(),
      templates: new FakeTemplateEngine(),
      expressionEngine: new ExpressionEngineFacade(),
      now: new Date('2026-07-15T09:00:00Z')
    });
    const runner = new TestRunner();

    registerEffectiveAssignmentConsumerChecks(runner, container, sample);

    const result = runner
      .report()
      .results.find((candidate) => candidate.name.includes(e2eAlunnoEmail(2)));
    expect(result?.status).toBe('fail');
    expect(result?.message).toContain(`class=${CLASSE_A}`);
    expect(result?.message).toContain('subject=IRC');
    expect(result?.message).toContain('slotKind=MAIN');
    expect(result?.message).toContain('specificity=null');
    expect(result?.message).toContain(`expectedActor=${e2eDocenteEmail(12)}`);
    expect(result?.message).toContain('actualActor=missing');
    expect(result?.message).toContain('glfTrace=');
  });

  it('registers a passing ClasseRepository check when the seeded classe round-trips correctly', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer(), sampleFixture());
    const report = runner.report();
    const result = report.results.find((r) => r.name.includes('ClasseRepository'));
    expect(result?.status).toBe('pass');
  });

  it('registers a failing ClasseRepository check with a descriptive message when the seeded classe is missing', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer({ includeClasse: false }), sampleFixture());
    const report = runner.report();
    const result = report.results.find((r) => r.name.includes('ClasseRepository'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toBeDefined();
    expect(result?.message).toContain(CLASSE_BASE);
  });

  it('registers a passing AlunnoRepository check for the articolata-partner-enrolled student', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer(), sampleFixture());
    const report = runner.report();
    const result = report.results.find((r) => r.name.includes('AlunnoRepository'));
    expect(result?.status).toBe('pass');
  });

  it('registers three role-resolution checks (SUPPLENZE wins, VARIAZIONI_CATTEDRA wins, CLASSI fallback), all passing on the real seed', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer(), sampleFixture());
    const results = runner.report().results;
    const names = results.map((r) => r.name);
    expect(names.some((n) => n.includes('SUPPLENZE'))).toBe(true);
    expect(names.some((n) => n.includes('VARIAZIONI_CATTEDRA'))).toBe(true);
    expect(names.some((n) => n.includes('CLASSI') && n.includes('fallback'))).toBe(true);
    for (const r of results) expect(r.status).toBe('pass');
  });

  it('every check carries the sample spreadsheet URL as its artifactUrl', () => {
    const runner = new TestRunner();
    const sample = sampleFixture();
    registerRepositoryChecks(runner, buildFakeContainer(), sample);
    for (const r of runner.report().results)
      expect(r.artifactUrl).toBe(sample.sampleSpreadsheetUrl);
  });
});
