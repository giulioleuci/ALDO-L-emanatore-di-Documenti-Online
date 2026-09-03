import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import { e2eAlunnoEmail, HEADERS } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import type {
  IArtifactFactory,
  SheetValueUpdate
} from '../../../src/onlinetests/E2eTemplateProvisioner';
import {
  seedAnniPrecedenti,
  seedConfDedicated,
  seedLogFold,
  seedStorico
} from '../../../src/onlinetests/data/Seeders';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import {
  COL_CONF_DOC,
  COL_CONF_IMP,
  COL_CONF_MAIL,
  COL_ASL,
  COL_LOG_FOLD,
  COL_MASTER,
  COL_MATERIE,
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
  CLASS_LAYOUTS,
  MATERIE_PUNTATE
} from '../../../src/onlinetests/data/fixtures';
import { ConfigurazioneImport } from '../../../src/domain/entities/ConfigurazioneImport';
import { toLibraryRecipe } from '../../../src/application/import/ImportRecipeMapper';
import { FoglioGenericoGeneratorStrategy } from '../../../src/application/strategies/FoglioGenericoGeneratorStrategy';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { RecordingSpreadsheet } from './recordingSpreadsheet';
import { TEMPLATE_IDS } from './testArtifactFactory';

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
      expect(prior.headers[table]).toEqual(
        table === TABLE.CLASSI ? [...HEADERS[table]!, 'GST'] : HEADERS[table]
      );
    }
    expect(prior.rows[TABLE.ALUNNI].map((row) => row.EMAIL)).toEqual(
      expect.arrayContaining([e2eAlunnoEmail(138), e2eAlunnoEmail(139)])
    );
    expect(prior.rows[TABLE.ALUNNI].find((row) => row.EMAIL === e2eAlunnoEmail(138))!.CLASSE).toBe(
      anno === '2025-2026' ? '2C' : '1C'
    );
    // RIPETENTE is true only on the more recent prior year (2025-2026): that's
    // what StoricoAlunniService reads to derive 2024-2025's NON_PROMOSSO esito
    // (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §2) — see storicoChecks.ts's
    // assertAlunnoStorico for the resulting esito-per-anno signature.
    expect(
      prior.rows[TABLE.ALUNNI].find((row) => row.EMAIL === e2eAlunnoEmail(138))!.RIPETENTE
    ).toBe(anno === '2025-2026');
    expect(prior.rows[TABLE.MOV_ALUNNI]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ TIPO: 'RITIRATO', STUDENTE: e2eAlunnoEmail(139) }),
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

test('seedStorico registra ogni materia puntata usata dalle intestazioni CLASSI', () => {
  const prior = new RecordingSpreadsheet('prior');
  seedStorico(prior, '2025-2026');

  const ids = prior.rows[TABLE.MATERIE]!.map((row) => row[COL_MATERIE.ID]);
  expect(ids).toEqual(expect.arrayContaining(MATERIE_PUNTATE));
});

test('seedStorico raggruppa ogni tabella in un solo batch', () => {
  const prior = new RecordingSpreadsheet('prior');
  seedStorico(prior, '2025-2026');

  expect(prior.batches).toHaveLength(new Set(prior.batches).size);
  expect(prior.batches).toEqual(expect.arrayContaining([TABLE.CLASSI, TABLE.MATERIE]));
});

test('seedStorico seeds every current-year subject so prior cattedra columns resolve', () => {
  const prior = new RecordingSpreadsheet('prior');
  seedStorico(prior, ANNI_PRECEDENTI[0]);

  const ids = prior.rows[TABLE.MATERIE]!.map((row) => String(row[COL_MATERIE.ID]));
  for (const expected of ['INF', 'MAT', 'STO', 'GST', 'INTERPRET.CHITARRA']) {
    expect(ids).toContain(expected);
  }
  expect(ids.filter((id) => id === 'STO')).toHaveLength(1);
});

test('prior-year CLASSI sheets declare a GST cattedra column', () => {
  const { factory, sheets } = spreadsheetFactory();
  const masterSheet = new RecordingSpreadsheet('master');
  seedAnniPrecedenti(masterSheet, factory, 'folder_e2e');

  const priors = [...sheets.entries()].filter(([name]) => name.startsWith('_ALDO_E2E_PRIOR_'));
  expect(priors.length).toBe(ANNI_PRECEDENTI.length);
  for (const [, prior] of priors) {
    expect(prior.headers[TABLE.CLASSI]).toContain('GST');
  }
});

test('seeds one ASL folder record and real sheets for each eligible class only', () => {
  const drive = new FakeDriveFacade();
  const sample = new RecordingSpreadsheet('sample');
  const { artifacts, sheets } = recordingArtifacts();

  seedLogFold(sample, drive, artifacts);

  const loggedClasses = sample.rows[TABLE.LOG_FOLD].map((row) => row[COL_LOG_FOLD.CLASSI]);
  expect(loggedClasses).toEqual(['3C', '3C-S', '3C-C', '5B', '5B-S', '5B-C', '1A']);
  expect(loggedClasses).not.toContain('2B');
  expect(sample.rows[TABLE.LOG_FOLD]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        [COL_LOG_FOLD.ID_GEN]: 'E2E_FILTER_DECOY',
        [COL_LOG_FOLD.CLASSI]: '1A'
      })
    ])
  );
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
        [COL_CONF_DOC.GENERATORE]: 'CLASSE',
        [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true })
      }),
      expect.objectContaining({
        [COL_CONF_DOC.ID]: 'E2E_DOC_STORICO',
        [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: TEMPLATE_IDS.storico })
      }),
      expect.objectContaining({
        [COL_CONF_DOC.ID]: CONF_DOC_DOTTED,
        [COL_CONF_DOC.GENERATORE]: 'CLASSE',
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
  ).toBe('CLASSE');
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
