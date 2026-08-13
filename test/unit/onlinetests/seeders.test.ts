import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import {
  e2eAlunnoEmail,
  HEADERS,
  type E2eTemplateIds
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import type {
  IArtifactFactory,
  SheetValueUpdate
} from '../../../src/onlinetests/E2eTemplateProvisioner';
import {
  seedAnniPrecedenti,
  seedConfDedicated,
  seedLogFold
} from '../../../src/onlinetests/data/Seeders';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import {
  COL_CONF_DOC,
  COL_CONF_IMP,
  COL_CONF_MAIL,
  COL_ASL,
  COL_LOG_FOLD,
  COL_MASTER,
  TABLE
} from '../../../src/config/schema';
import {
  ANNI_PRECEDENTI,
  CONF_DOC_DUPLICAZIONE_PERMESSA,
  CONF_DOC_JOBRUNNER,
  CONF_DOC_DOTTED,
  CONF_DOC_TABELLE,
  CONF_IMP_ASL_CARTELLE,
  CONF_IMP_CERCA_DOCUMENTI,
  CONF_IMP_CHUNKED,
  CONF_MAIL_JOBRUNNER,
  CONF_MAIL_STORICO,
  CLASS_LAYOUTS
} from '../../../src/onlinetests/data/fixtures';
import { ConfigurazioneImport } from '../../../src/domain/entities/ConfigurazioneImport';
import { toLibraryRecipe } from '../../../src/application/import/ImportRecipeMapper';
import { FoglioGenericoGeneratorStrategy } from '../../../src/application/strategies/FoglioGenericoGeneratorStrategy';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';

class RecordingSpreadsheet implements ISampleSpreadsheet {
  public readonly rows: Record<string, Record<string, unknown>[]> = {};
  public readonly headers: Record<string, string[]> = {};

  constructor(public readonly id: string) {}

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

function spreadsheetFactory(): {
  factory: ISampleSpreadsheetFactory;
  sheets: Map<string, RecordingSpreadsheet>;
} {
  const sheets = new Map<string, RecordingSpreadsheet>();
  return {
    sheets,
    factory: {
      createSpreadsheet(name: string): ISampleSpreadsheet {
        const sheet = new RecordingSpreadsheet(`id_${name}`);
        sheets.set(name, sheet);
        return sheet;
      },
      openExistingSpreadsheet(): ISampleSpreadsheet {
        throw new Error('not used by seeders');
      }
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

function recordingArtifacts(): {
  artifacts: IArtifactFactory;
  sheets: Array<{ name: string; folderId: string; updates: SheetValueUpdate[] }>;
} {
  const sheets: Array<{ name: string; folderId: string; updates: SheetValueUpdate[] }> = [];
  return {
    sheets,
    artifacts: {
      createDocument(): string {
        throw new Error('not used by seeders');
      },
      createSheet(name: string, folderId: string, updates: SheetValueUpdate[] = []): string {
        sheets.push({ name, folderId, updates });
        return `artifact_${sheets.length}`;
      }
    }
  };
}

function currentClassOf(email: string): string | undefined {
  const index = Number(email.match(/e2ealunno(\d+)@/)?.[1]);
  for (const layout of CLASS_LAYOUTS) {
    if (index >= layout.studentStart && index < layout.studentStart + layout.count) {
      return layout.id;
    }
  }
  return undefined;
}

test('seeds two prior databases with every historical-provider table and master registrations', () => {
  const { factory, sheets } = spreadsheetFactory();
  const master = new RecordingSpreadsheet('master');

  seedAnniPrecedenti(master, factory, 'root-folder');

  const historicalTables = [
    TABLE.CLASSI,
    TABLE.ALUNNI,
    TABLE.DOCENTI,
    TABLE.MATERIE,
    TABLE.CARENZE,
    TABLE.PIANI,
    TABLE.MOV_ALUNNI,
    TABLE.PROGETTI,
    TABLE.LOG_DOCS
  ];
  expect(sheets.size).toBe(ANNI_PRECEDENTI.length);
  for (const anno of ANNI_PRECEDENTI) {
    const prior = sheets.get(`_ALDO_E2E_PRIOR_${anno}`)!;
    expect(Object.keys(prior.headers).sort()).toEqual([...historicalTables].sort());
    for (const table of historicalTables) {
      expect(prior.headers[table]).toEqual(HEADERS[table]);
    }
    expect(prior.rows[TABLE.ALUNNI].map((row) => row.EMAIL)).toEqual(
      expect.arrayContaining([e2eAlunnoEmail(138), e2eAlunnoEmail(139)])
    );
    expect(prior.rows[TABLE.ALUNNI].find((row) => row.EMAIL === e2eAlunnoEmail(138))!.CLASSE).toBe(
      anno === '2025-2026' ? '2C' : '1C'
    );
    expect(prior.rows[TABLE.MOV_ALUNNI]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ TIPO: 'OUT', STUDENTE: e2eAlunnoEmail(139) }),
        expect.objectContaining({
          TIPO: 'CAMBIO',
          STUDENTE: e2eAlunnoEmail(138),
          DA: anno === '2025-2026' ? '2C' : '1C',
          A: anno === '2025-2026' ? '3C' : '1C'
        })
      ])
    );
    expect(prior.rows[TABLE.CLASSI][0]).toEqual(
      expect.objectContaining({
        GST: 'e2edocente4@onlinetest.aldo.local',
        INF: 'e2edocente4@onlinetest.aldo.local'
      })
    );
    expect(prior.rows[TABLE.PROGETTI]).toEqual(
      expect.arrayContaining([expect.objectContaining({ REFERENTE: `Esperto Esterno ${anno}` })])
    );
    expect(prior.rows[TABLE.CARENZE]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          STUDENTE: e2eAlunnoEmail(138),
          GST: anno === '2025-2026' ? 4 : 5
        })
      ])
    );
  }
  expect(currentClassOf(e2eAlunnoEmail(138))).toBe('3C');
  expect(master.rows[TABLE.MASTER].map((row) => row[COL_MASTER.ANNO_SCOLASTICO])).toEqual(
    ANNI_PRECEDENTI
  );
  expect(master.rows[TABLE.MASTER].every((row) => row[COL_MASTER.TEST_MODE] === true)).toBe(true);
});

test('seeds one ASL folder record and real sheets for each eligible class only', () => {
  const drive = new FakeDriveFacade();
  const sample = new RecordingSpreadsheet('sample');
  const { artifacts, sheets } = recordingArtifacts();

  seedLogFold(sample, drive, artifacts);

  const loggedClasses = sample.rows[TABLE.LOG_FOLD].map((row) => row[COL_LOG_FOLD.CLASSI]);
  expect(loggedClasses).toEqual(['3C', '3C-S', '3C-C', '5B', '5B-S', '5B-C']);
  expect(loggedClasses).not.toContain('2B');
  expect(sheets.filter((sheet) => sheet.name.endsWith('_DATI'))).toHaveLength(6);
  expect(sheets.filter((sheet) => sheet.name.endsWith('_HEADER_ONLY'))).toHaveLength(6);
  expect(sheets.find((sheet) => sheet.name === 'ASL_3C_12_ORE_DATI')!.updates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ range: 'A1:C1', values: [['STUDENTE', 'ANNO', 'ORE']] }),
      expect.objectContaining({ range: 'A2:C4' })
    ])
  );
  for (const classe of ['3C', '3C-S', '3C-C', '5B', '5B-S', '5B-C']) {
    const source = sheets.find(
      (sheet) => sheet.name.includes(`ASL_${classe}_`) && sheet.name.endsWith('_DATI')
    )!;
    const rows = source.updates.find((update) => update.range.startsWith('A2:'))!.values;
    const knownStudent = String(rows[0]![0]);
    expect(knownStudent).toMatch(/^e2ealunno\d+@onlinetest\.aldo\.local$/);
    expect(currentClassOf(knownStudent)).toBe(classe);
    expect(rows).toEqual(
      expect.arrayContaining([expect.arrayContaining(['sconosciuto@onlinetest.aldo.local'])])
    );
    expect(rows.filter((row) => row[0] === knownStudent)).toHaveLength(2);
    expect(sample.rows[TABLE.ASL]).toEqual(
      expect.arrayContaining([expect.objectContaining({ [COL_ASL.STUDENTE]: knownStudent })])
    );
  }
  expect(drive.deleted).toHaveLength(7);
});

test('seeds dedicated document, import, and mail configurations with unique output paths', () => {
  const sample = new RecordingSpreadsheet('sample');

  seedConfDedicated(sample, TEMPLATE_IDS);

  expect(sample.rows[TABLE.CONF_DOC]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        [COL_CONF_DOC.ID]: CONF_DOC_JOBRUNNER,
        [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA'
      }),
      expect.objectContaining({
        [COL_CONF_DOC.ID]: CONF_DOC_DUPLICAZIONE_PERMESSA,
        [COL_CONF_DOC.DUPLICAZIONE]: 'PERMESSA'
      }),
      expect.objectContaining({
        [COL_CONF_DOC.ID]: CONF_DOC_TABELLE,
        [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_CON_TABELLE_IMPORTATE'
      }),
      expect.objectContaining({
        [COL_CONF_DOC.ID]: 'E2E_DOC_STORICO',
        [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: TEMPLATE_IDS.storico })
      }),
      expect.objectContaining({
        [COL_CONF_DOC.ID]: CONF_DOC_DOTTED,
        [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
        [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: TEMPLATE_IDS.dotted })
      })
    ])
  );
  expect(
    sample.rows[TABLE.CONF_DOC].find((row) => row[COL_CONF_DOC.ID] === CONF_DOC_TABELLE)![
      COL_CONF_DOC.FORMATO
    ]
  ).toBe('GDOC');
  expect(
    JSON.parse(
      String(
        sample.rows[TABLE.CONF_DOC].find((row) => row[COL_CONF_DOC.ID] === CONF_DOC_TABELLE)![
          COL_CONF_DOC.MODELLI
        ]
      )
    )
  ).toEqual({ templateId: TEMPLATE_IDS.tabelleImportate });
  expect(
    sample.rows[TABLE.CONF_DOC].find((row) => row[COL_CONF_DOC.TIPO] === 'E2E_IMPORT_SOURCE')![
      COL_CONF_DOC.GENERATORE
    ]
  ).toBe('FOGLIO_GENERICO');
  expect(
    sample.rows[TABLE.CONF_DOC].find((row) => row[COL_CONF_DOC.TIPO] === 'E2E_IMPORT_SOURCE')![
      COL_CONF_DOC.FORMATO
    ]
  ).toBe('GSHEET');
  const templates = new FakeTemplateEngine();
  new FoglioGenericoGeneratorStrategy(templates).render('generated-import-source', {} as Cdu);
  expect(templates.renderedSheets).toEqual([
    expect.objectContaining({ sheetId: 'generated-import-source' })
  ]);
  expect(sample.rows[TABLE.CONF_IMP]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        [COL_CONF_IMP.ID]: CONF_IMP_ASL_CARTELLE,
        [COL_CONF_IMP.ATTIVO]: true
      }),
      expect.objectContaining({
        [COL_CONF_IMP.ID]: CONF_IMP_CERCA_DOCUMENTI,
        [COL_CONF_IMP.ATTIVO]: true
      }),
      expect.objectContaining({ [COL_CONF_IMP.ID]: CONF_IMP_CHUNKED, [COL_CONF_IMP.ATTIVO]: true })
    ])
  );
  const mailRows = sample.rows[TABLE.CONF_MAIL];
  expect(mailRows.map((row) => row[COL_CONF_MAIL.ID])).toEqual([
    CONF_MAIL_JOBRUNNER,
    CONF_MAIL_STORICO
  ]);
  const paths = mailRows.map(
    (row) =>
      (JSON.parse(String(row[COL_CONF_MAIL.BOX_CFG])) as Array<{ PATH_OUT: string }>)[0]!.PATH_OUT
  );
  expect(new Set(paths).size).toBe(paths.length);
});

test('maps every dedicated import configuration through the real recipe mapper', () => {
  const sample = new RecordingSpreadsheet('sample');
  seedConfDedicated(sample, TEMPLATE_IDS);

  const validIds = new Set([
    CONF_IMP_ASL_CARTELLE,
    CONF_IMP_CERCA_DOCUMENTI,
    CONF_IMP_CHUNKED,
    'E2E_IMP_IGNORE',
    'E2E_IMP_TIMESTAMP',
    'E2E_IMP_TIMESTAMP_FALLBACK',
    'E2E_IMP_NOHEADER'
  ]);
  const recipes = sample.rows[TABLE.CONF_IMP]
    .filter((row) => validIds.has(String(row[COL_CONF_IMP.ID])))
    .map((row) => toLibraryRecipe(ConfigurazioneImport.fromData(row)));

  expect(recipes.map((recipe) => recipe.load.conflictKey)).toEqual([
    'STUDENTE',
    'STUDENTE',
    'STUDENTE',
    'STUDENTE',
    'STUDENTE',
    'STUDENTE',
    'STUDENTE'
  ]);
  expect(recipes.map((recipe) => recipe.source.type)).toEqual([
    'CERCA_CARTELLE_CLASSE',
    'SheetById',
    'SheetById',
    'SheetById',
    'SheetById',
    'CERCA_DOCUMENTI',
    'SheetById'
  ]);
});

test('seeds FILE_SINGOLO import policies with the supported single STUDENTE key', () => {
  const sample = new RecordingSpreadsheet('sample');
  seedConfDedicated(sample, TEMPLATE_IDS);

  const configs = new Map(
    sample.rows[TABLE.CONF_IMP].map((row) => [
      String(row[COL_CONF_IMP.ID]),
      JSON.parse(String(row[COL_CONF_IMP.CONFIG])) as Record<string, unknown>
    ])
  );

  expect(configs.get('E2E_IMP_IGNORE')).toMatchObject({
    searchStrategy: 'FILE_SINGOLO',
    key: 'STUDENTE',
    conflictResolution: 'IGNORE'
  });
  expect(configs.get('E2E_IMP_TIMESTAMP')).toMatchObject({
    searchStrategy: 'FILE_SINGOLO',
    key: 'STUDENTE',
    conflictResolution: 'TIMESTAMP',
    timestampColumn: 'DATA_MODIFICA'
  });
  expect(configs.get('E2E_IMP_DISABLED')).toMatchObject({
    searchStrategy: 'FILE_SINGOLO',
    key: 'STUDENTE'
  });
  expect(
    sample.rows[TABLE.CONF_IMP].find((row) => row[COL_CONF_IMP.ID] === 'E2E_IMP_DISABLED')?.[
      COL_CONF_IMP.ATTIVO
    ]
  ).toBe(false);
  expect(configs.get('E2E_IMP_NOHEADER')).toMatchObject({
    searchStrategy: 'FILE_SINGOLO',
    key: 'STUDENTE',
    hasHeaders: false,
    tabName: 'Sheet1',
    range: 'A1:C1',
    map: { Col_0: 'STUDENTE', Col_1: 'ANNO', Col_2: 'ORE' }
  });
});
