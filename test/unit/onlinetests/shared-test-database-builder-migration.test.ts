import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import type { IArtifactFactory } from '../../../src/onlinetests/E2eTemplateProvisioner';
import {
  SharedTestDatabaseBuilder,
  CARENZA_ALUNNO_2,
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARTNER,
  CONF_DOC_PIANI,
  PDP_BES_3C,
  PIANO_DOPPIO_STUDENTE,
  RIPETENTE_1A,
  RIPETENTE_3C,
  e2eAlunnoEmail,
  e2eDocenteEmail,
  type E2eTemplateIds
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import {
  ALL_CLASSI,
  ANNI_PRECEDENTI,
  CLASS_ADDRESS_BY_CLASS,
  CLASS_LAYOUTS,
  MATERIE_PER_INDIRIZZO,
  STUDENT_TOTALE,
  CONF_DOC_JOBRUNNER,
  CONF_DOC_DOTTED
} from '../../../src/onlinetests/data/fixtures';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import {
  COL_ALUNNI,
  COL_CLASSI,
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_LOG_FOLD,
  COL_LOG_DOCS,
  COL_MASTER,
  COL_SUPPLENZE,
  TABLE
} from '../../../src/config/schema';

class RecordingSpreadsheet implements ISampleSpreadsheet {
  readonly rows: Record<string, Record<string, unknown>[]> = {};
  readonly headers: Record<string, string[]> = {};

  constructor(readonly id: string) {}

  addSheet(name: string, headerRow: string[]): void {
    this.headers[name] = headerRow;
    this.rows[name] = [];
  }

  appendRow(sheetName: string, row: Record<string, unknown>): void {
    (this.rows[sheetName] ??= []).push(row);
  }

  getUrl(): string {
    return `https://example.test/${this.id}`;
  }
}

function recordingFactory(): {
  spreadsheets: ISampleSpreadsheetFactory;
  sheets: Map<string, RecordingSpreadsheet>;
} {
  const sheets = new Map<string, RecordingSpreadsheet>();
  return {
    sheets,
    spreadsheets: {
      createSpreadsheet(name: string): ISampleSpreadsheet {
        const sheet = new RecordingSpreadsheet(`id_${name}`);
        sheets.set(name, sheet);
        return sheet;
      },
      openExistingSpreadsheet(): ISampleSpreadsheet {
        throw new Error('not used by builder migration test');
      }
    }
  };
}

function recordingArtifacts(): IArtifactFactory {
  let sequence = 0;
  return {
    createDocument(): string {
      throw new Error('not used by builder migration test');
    },
    createSheet(): string {
      sequence += 1;
      return `artifact_${sequence}`;
    }
  };
}

const TEMPLATE_IDS: E2eTemplateIds = {
  verbale: 'tmpl_verbale',
  condotta: 'tmpl_condotta',
  riepilogo: 'tmpl_riepilogo',
  aslImportSheet: 'tmpl_asl_import',
  aslImportPolicySheet: 'tmpl_asl_import_policy',
  aslImportNoHeaderSheet: 'tmpl_asl_import_noheader',
  carenzeImportTimestampSheet: 'tmpl_carenze_import_timestamp',
  docComplesso: 'tmpl_doc_complesso',
  docArticolata: 'tmpl_doc_articolata',
  cdcRiepilogo: 'tmpl_cdc_riepilogo',
  sheetPermessi: 'tmpl_sheet_permessi',
  pianoLavoro: 'tmpl_piano_lavoro',
  staticAttachment: 'tmpl_attachment',
  tabelleImportate: 'tmpl_tabelle_importate',
  tabellaSorgenteDati: 'tmpl_tabella_sorgente_dati',
  tabellaSorgenteVuota: 'tmpl_tabella_sorgente_vuota',
  storico: 'tmpl_storico',
  dotted: 'tmpl_dotted',
  storicoEmail: 'tmpl_storico_email',
  piani: {
    PDP_DSA: 'tmpl_pdp_dsa',
    PDP_BES: 'tmpl_pdp_bes',
    PDP_STRANIERI: 'tmpl_pdp_stranieri',
    PEI: 'tmpl_pei',
    PFP: 'tmpl_pfp'
  }
};

test('builds the shared extended dataset through every migrated seeder', () => {
  const { spreadsheets, sheets } = recordingFactory();
  const master = new RecordingSpreadsheet('bound-master');
  const result = new SharedTestDatabaseBuilder(
    spreadsheets,
    new FakeDriveFacade(),
    recordingArtifacts()
  ).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  expect(sample.rows[TABLE.CLASSI].map((row) => row[COL_CLASSI.ID])).toEqual(ALL_CLASSI);
  expect(sample.rows[TABLE.ALUNNI]).toHaveLength(STUDENT_TOTALE);

  for (const row of sample.rows[TABLE.CLASSI]) {
    const classe = String(row[COL_CLASSI.ID]);
    const indirizzo = CLASS_ADDRESS_BY_CLASS[classe]!;
    const materie = MATERIE_PER_INDIRIZZO[indirizzo as keyof typeof MATERIE_PER_INDIRIZZO];
    expect(materie.length).toBeGreaterThanOrEqual(8);
    expect(materie.every((materia) => typeof row[materia] === 'string')).toBe(true);
  }

  expect(sample.rows[TABLE.LOG_FOLD]).toHaveLength(6);
  expect(
    sample.rows[TABLE.LOG_FOLD].every((row) => String(row[COL_LOG_FOLD.LINK]).includes('/folders/'))
  ).toBe(true);
  expect(sample.rows[TABLE.CONF_DOC]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ [COL_CONF_DOC.ID]: CONF_DOC_JOBRUNNER }),
      expect.objectContaining({
        [COL_CONF_DOC.ID]: CONF_DOC_DOTTED,
        [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: TEMPLATE_IDS.dotted })
      })
    ])
  );
  expect(sample.rows[TABLE.CONF_IMP]).toHaveLength(13);

  const priorNames = ANNI_PRECEDENTI.map((anno) => `_ALDO_E2E_PRIOR_${anno}`);
  expect(priorNames.every((name) => sheets.has(name))).toBe(true);
  expect(master.rows[TABLE.MASTER].map((row) => row[COL_MASTER.ANNO_SCOLASTICO])).toEqual([
    '2026-2027',
    ...ANNI_PRECEDENTI
  ]);
  expect(result.priorSampleSpreadsheetId).toBe(sheets.get(priorNames[0]!)!.id);
  expect(result.priorSampleSpreadsheetId2).toBe(sheets.get(priorNames[1]!)!.id);
  expect(result.jobRunnerDocConfigId).toBe(CONF_DOC_JOBRUNNER);
  expect(result.logFoldFolderUrl).not.toBe(result.sampleFolderUrl);
  expect(sample.rows[TABLE.LOG_FOLD].map((row) => row[COL_LOG_FOLD.LINK])).toContain(
    result.logFoldFolderUrl
  );

  const boundarySubstitutions = sample.rows[TABLE.SUPPLENZE].filter(
    (row) => row[COL_SUPPLENZE.DAL] === '2026-09-01'
  );
  expect(boundarySubstitutions).toHaveLength(2);
  expect(new Set(boundarySubstitutions.map((row) => row[COL_SUPPLENZE.TITOLARE])).size).toBe(1);
  expect(boundarySubstitutions.map((row) => row[COL_SUPPLENZE.CLASSI]).sort()).toEqual([
    '2B',
    '4A'
  ]);

  const routingModes = sample.rows[TABLE.CONF_MAIL].map((row) => row[COL_CONF_MAIL.SUPPLENTI]);
  expect(routingModes).toEqual(
    expect.arrayContaining(['SOLO_TITOLARI', 'SOLO_SUPPLENTI', 'ENTRAMBI'])
  );

  const currentStudents = sample.rows[TABLE.ALUNNI].map((row) => row[COL_ALUNNI.EMAIL]);
  expect(new Set(currentStudents).size).toBe(STUDENT_TOTALE);

  const classe4A = sample.rows[TABLE.CLASSI].find((row) => row[COL_CLASSI.ID] === '4A')!;
  expect(sample.headers[TABLE.CLASSI]).toContain('INTERPRET.CHITARRA.itp');
  expect(classe4A['LAB.GRUPPO_A']).toBe(e2eDocenteEmail(3));
  expect(classe4A['LAB.SEMINARIO_POMERIDIANO']).toBe(e2eDocenteEmail(4));
  expect(classe4A['INTERPRET.CHITARRA']).toBe(e2eDocenteEmail(5));
  expect(classe4A['INTERPRET.CHITARRA.itp']).toBe(e2eDocenteEmail(11));
  expect(classe4A['INTERPRET.FLAUTO']).toBe(e2eDocenteEmail(6));
  expect(classe4A[COL_CLASSI.STORICO]).toBe('3A,2A');

  const dottedHistory = [
    {
      sheet: sheets.get(priorNames[0]!)!,
      classe: '3A',
      main: e2eDocenteEmail(5),
      itp: e2eDocenteEmail(11)
    },
    {
      sheet: sheets.get(priorNames[1]!)!,
      classe: '2A',
      main: e2eDocenteEmail(12),
      itp: e2eDocenteEmail(13)
    }
  ];
  for (const expected of dottedHistory) {
    expect(
      expected.sheet.rows[TABLE.CLASSI].find((row) => row[COL_CLASSI.ID] === expected.classe)
    ).toEqual(
      expect.objectContaining({
        'INTERPRET.CHITARRA': expected.main,
        'INTERPRET.CHITARRA.itp': expected.itp
      })
    );
  }
});

test('builds dedicated cache-isolation fixture with a current master whose database lacks 1A', () => {
  const { spreadsheets, sheets } = recordingFactory();
  const master = new RecordingSpreadsheet('cache-isolation-master');
  const result = new SharedTestDatabaseBuilder(
    spreadsheets,
    new FakeDriveFacade(),
    recordingArtifacts()
  ).buildCacheIsolationFixture(TEMPLATE_IDS, master);

  const isolated = sheets.get('_ALDO_E2E_CACHE_ISOLATED_SAMPLE')!;
  expect(master.rows[TABLE.MASTER]).toEqual([
    expect.objectContaining({ [COL_MASTER.ID_SPREADSHEET]: result.sampleSpreadsheetId })
  ]);
  expect(isolated.rows[TABLE.CLASSI].map((row) => row[COL_CLASSI.ID])).not.toContain(CLASSE_A);
  expect(isolated.rows[TABLE.CLASSI].map((row) => row[COL_CLASSI.ID])).toContain(CLASSE_B);
  expect(Object.keys(isolated.headers)).toEqual(
    expect.arrayContaining(Object.values(TABLE).filter((table) => table !== TABLE.MASTER))
  );
});

test('preserves the legacy focal identities, coordinators, representatives, and import roster', () => {
  const { spreadsheets, sheets } = recordingFactory();
  const master = new RecordingSpreadsheet('bound-master');
  new SharedTestDatabaseBuilder(spreadsheets, new FakeDriveFacade(), recordingArtifacts()).build(
    TEMPLATE_IDS,
    master
  );

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const classOf = (email: string): unknown =>
    sample.rows[TABLE.ALUNNI].find((row) => row[COL_ALUNNI.EMAIL] === email)?.[COL_ALUNNI.CLASSE];
  expect(classOf(e2eAlunnoEmail(1))).toBe(CLASSE_A);
  expect(classOf(e2eAlunnoEmail(21))).toBe(CLASSE_B);
  expect(classOf(e2eAlunnoEmail(41))).toBe(CLASSE_C);
  expect(classOf(e2eAlunnoEmail(42))).toBe(CLASSE_C);
  expect(classOf(e2eAlunnoEmail(43))).toBe(CLASSE_C);
  expect(classOf(e2eAlunnoEmail(44))).toBe(CLASSE_C);
  expect(classOf(e2eAlunnoEmail(51))).toBe(CLASSE_C_PARTNER);
  expect(classOf(e2eAlunnoEmail(52))).toBe(CLASSE_C_PARTNER);
  expect(classOf(e2eAlunnoEmail(138))).toBe('3C');
  expect(CARENZA_ALUNNO_2).toBe(e2eAlunnoEmail(21));
  expect(PDP_BES_3C).toBe(e2eAlunnoEmail(42));
  expect(RIPETENTE_1A).toBe(e2eAlunnoEmail(2));
  expect(RIPETENTE_3C).toBe(e2eAlunnoEmail(41));
  expect(PDP_BES_3C).not.toBe(RIPETENTE_3C);

  const classRow = (id: string) =>
    sample.rows[TABLE.CLASSI].find((row) => row[COL_CLASSI.ID] === id)!;
  expect(classRow(CLASSE_A)[COL_CLASSI.COORD]).toBe(e2eDocenteEmail(1));
  expect(classRow(CLASSE_B)[COL_CLASSI.COORD]).toBe(e2eDocenteEmail(1));
  expect(classRow(CLASSE_C)[COL_CLASSI.COORD]).toBe(e2eDocenteEmail(3));
  expect(classRow(CLASSE_C_PARTNER)[COL_CLASSI.COORD]).toBe(e2eDocenteEmail(7));

  const representativeCounts = (id: string): [number, number] => {
    const rows = sample.rows[TABLE.ALUNNI].filter((row) => row[COL_ALUNNI.CLASSE] === id);
    return [
      rows.filter((row) => row[COL_ALUNNI.RAPPR_STUD] === true).length,
      rows.filter((row) => {
        const representative = row[COL_ALUNNI.RAPPR_GEN];
        return typeof representative === 'string' && representative.trim() !== '';
      }).length
    ];
  };
  expect(representativeCounts(CLASSE_A)).toEqual([0, 0]);
  expect(representativeCounts(CLASSE_B)).toEqual([1, 1]);
  expect(representativeCounts(CLASSE_C)).toEqual([2, 1]);
  expect(representativeCounts(CLASSE_C_PARTNER)).toEqual([1, 2]);
  expect(CLASS_LAYOUTS.reduce((total, layout) => total + layout.count, 0)).toBe(STUDENT_TOTALE);
});

test('composes Task 4 history with the legacy promoted/repeater roster and dual plan documents', () => {
  const { spreadsheets, sheets } = recordingFactory();
  const master = new RecordingSpreadsheet('bound-master');
  new SharedTestDatabaseBuilder(spreadsheets, new FakeDriveFacade(), recordingArtifacts()).build(
    TEMPLATE_IDS,
    master
  );

  const prior = sheets.get('_ALDO_E2E_PRIOR_2025-2026')!;
  const priorClassOf = (email: string): unknown =>
    prior.rows[TABLE.ALUNNI].find((row) => row[COL_ALUNNI.EMAIL] === email)?.[COL_ALUNNI.CLASSE];
  expect(priorClassOf(RIPETENTE_1A)).toBe(CLASSE_A);
  expect(priorClassOf(e2eAlunnoEmail(21))).toBe('1B');
  expect(priorClassOf(RIPETENTE_3C)).toBe(CLASSE_C);
  expect(priorClassOf(e2eAlunnoEmail(42))).toBe('2C-S');
  expect(priorClassOf(e2eAlunnoEmail(49))).toBe('2C-C');

  const dualHistory = prior.rows[TABLE.LOG_DOCS].filter(
    (row) =>
      row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_PIANI &&
      row[COL_LOG_DOCS.UTENTI] === PIANO_DOPPIO_STUDENTE
  );
  expect(dualHistory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        [COL_LOG_DOCS.SOTTOTIPO]: 'PEI',
        [COL_LOG_DOCS.NOME]: 'E2E_Piano_PEI_2025_2026'
      }),
      expect.objectContaining({
        [COL_LOG_DOCS.SOTTOTIPO]: 'PDP_BES',
        [COL_LOG_DOCS.NOME]: 'E2E_Piano_PDP_BES_2025_2026'
      })
    ])
  );
});
