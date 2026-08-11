import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import type {
  IArtifactFactory
} from '../../../src/onlinetests/E2eTemplateProvisioner';
import {
  SharedTestDatabaseBuilder,
  type E2eTemplateIds
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import {
  ALL_CLASSI,
  ANNI_PRECEDENTI,
  CLASS_ADDRESS_BY_CLASS,
  MATERIE_PER_INDIRIZZO,
  STUDENT_TOTALE,
  CONF_DOC_JOBRUNNER
} from '../../../src/onlinetests/data/fixtures';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import {
  COL_ALUNNI,
  COL_CLASSI,
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_LOG_FOLD,
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
  docComplesso: 'tmpl_doc_complesso',
  docArticolata: 'tmpl_doc_articolata',
  cdcRiepilogo: 'tmpl_cdc_riepilogo',
  sheetPermessi: 'tmpl_sheet_permessi',
  pianoLavoro: 'tmpl_piano_lavoro',
  staticAttachment: 'tmpl_attachment',
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
  expect(sample.rows[TABLE.LOG_FOLD].every((row) => String(row[COL_LOG_FOLD.LINK]).includes('/folders/'))).toBe(true);
  expect(sample.rows[TABLE.CONF_DOC]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ [COL_CONF_DOC.ID]: CONF_DOC_JOBRUNNER })
    ])
  );
  expect(sample.rows[TABLE.CONF_IMP]).toHaveLength(4);

  const priorNames = ANNI_PRECEDENTI.map((anno) => `_ALDO_E2E_PRIOR_${anno}`);
  expect(priorNames.every((name) => sheets.has(name))).toBe(true);
  expect(master.rows[TABLE.MASTER].map((row) => row[COL_MASTER.ANNO_SCOLASTICO])).toEqual([
    '2026-2027',
    ...ANNI_PRECEDENTI
  ]);
  expect(result.priorSampleSpreadsheetId).toBe(sheets.get(priorNames[0]!)!.id);
  expect(result.priorSampleSpreadsheetId2).toBe(sheets.get(priorNames[1]!)!.id);
  expect(result.jobRunnerDocConfigId).toBe(CONF_DOC_JOBRUNNER);
  expect(result.logFoldFolderUrl).toBe(result.sampleFolderUrl);

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
});
