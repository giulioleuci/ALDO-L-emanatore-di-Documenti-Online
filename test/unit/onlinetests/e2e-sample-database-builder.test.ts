import {
  E2eSampleDatabaseBuilder,
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARTNER,
  MATERIE_E2E,
  e2eAlunnoEmail,
  e2eDocenteEmail,
  CARENZA_ALUNNO_1,
  CARENZA_ALUNNO_2
} from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { TABLE, COL_CLASSI, COL_ALUNNI, COL_DOCENTI, COL_CARENZE, COL_MASTER, COL_CONF_DOC, COL_CONF_MAIL } from '../../../src/config/schema';

class RecordingSpreadsheet implements ISampleSpreadsheet {
  id: string;
  rows: Record<string, Record<string, unknown>[]> = {};
  constructor(id: string) {
    this.id = id;
  }
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

function factory(): { spreadsheets: ISampleSpreadsheetFactory; sheets: Map<string, RecordingSpreadsheet> } {
  const sheets = new Map<string, RecordingSpreadsheet>();
  return {
    sheets,
    spreadsheets: {
      createSpreadsheet: (name: string) => {
        const s = new RecordingSpreadsheet(`id_${name}`);
        sheets.set(name, s);
        return s;
      }
    }
  };
}

const TEMPLATE_IDS = {
  verbale: 'tmpl_verbale',
  condotta: 'tmpl_condotta',
  piani: {
    PDP_DSA: 'tmpl_pdp_dsa',
    PDP_BES: 'tmpl_pdp_bes',
    PDP_STRANIERI: 'tmpl_pdp_stranieri',
    PEI: 'tmpl_pei',
    PFP: 'tmpl_pfp'
  }
};

test('seeds 4 CLASSI rows (2 plain, 1 articolata pair) and exactly 60 ALUNNI split 20/20/8/12', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const classi = sample.rows[TABLE.CLASSI]!;
  expect(classi.map((c) => c[COL_CLASSI.ID])).toEqual([CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER]);

  const alunni = sample.rows[TABLE.ALUNNI]!;
  expect(alunni).toHaveLength(60);
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id).length;
  expect(byClasse(CLASSE_A)).toBe(20);
  expect(byClasse(CLASSE_B)).toBe(20);
  expect(byClasse(CLASSE_C)).toBe(8);
  expect(byClasse(CLASSE_C_PARTNER)).toBe(12);
  expect(result.sampleSpreadsheetId).toBe(sample.id);
});

test('seeds exactly 20 DOCENTI rows', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  expect(sample.rows[TABLE.DOCENTI]).toHaveLength(20);
  expect(sample.rows[TABLE.DOCENTI]!.map((d) => d[COL_DOCENTI.EMAIL])).toEqual(
    Array.from({ length: 20 }, (_, i) => e2eDocenteEmail(i + 1))
  );
});

test('seeds exactly 2 CARENZE rows, for the two designated students only', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const carenze = sample.rows[TABLE.CARENZE]!;
  expect(carenze).toHaveLength(2);
  expect(carenze.map((c) => c[COL_CARENZE.STUDENTE]).sort()).toEqual(
    [CARENZA_ALUNNO_1, CARENZA_ALUNNO_2].sort()
  );
  expect(CARENZA_ALUNNO_1).toBe(e2eAlunnoEmail(1));
  expect(CARENZA_ALUNNO_2).toBe(e2eAlunnoEmail(21));

  const row1 = carenze.find((c) => c[COL_CARENZE.STUDENTE] === CARENZA_ALUNNO_1)!;
  const row2 = carenze.find((c) => c[COL_CARENZE.STUDENTE] === CARENZA_ALUNNO_2)!;
  expect(row1[COL_CARENZE.CLASSE]).toBe(CLASSE_A);
  expect(row2[COL_CARENZE.CLASSE]).toBe(CLASSE_B);
  expect(row1[MATERIE_E2E[0]]).toBeTruthy();
  expect(row2[MATERIE_E2E[0]]).toBeTruthy();
  expect(typeof row1[MATERIE_E2E[0]]).toBe('number');
  expect(typeof row2[MATERIE_E2E[0]]).toBe('number');
});

test('MASTER row has TEST_MODE = true, matching the returned masterTestMode', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const master = sheets.get('_ALDO_E2E_MASTER')!;
  expect(master.rows[TABLE.MASTER]![0]![COL_MASTER.TEST_MODE]).toBe(true);
  expect(result.masterTestMode).toBe(true);
  expect(result.masterTestMode).toBe(master.rows[TABLE.MASTER]![0]![COL_MASTER.TEST_MODE]);
});

test('seeds 7 CONF_DOC rows (1 verbale + 1 condotta + 5 piani) each pointing at its provisioned template', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confDoc = sample.rows[TABLE.CONF_DOC]!;
  expect(confDoc).toHaveLength(7);
  const verbale = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'VERBALE_CDC')!;
  expect(JSON.parse(verbale[COL_CONF_DOC.MODELLI] as string)).toEqual({ templateId: 'tmpl_verbale' });
  const condotta = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'FOGLIO_GENERICO')!;
  expect(JSON.parse(condotta[COL_CONF_DOC.MODELLI] as string)).toEqual({ templateId: 'tmpl_condotta' });
  const piani = confDoc.filter((c) => c[COL_CONF_DOC.GENERATORE] === 'DOC_PERSONALIZZATO');
  expect(piani).toHaveLength(5);
});

test('seeds 4 CONF_MAIL rows: verbale/coordinatori, condotta/CdC, carenza/genitori, piani reuse', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confMail = sample.rows[TABLE.CONF_MAIL]!;
  expect(confMail).toHaveLength(4);
  expect(confMail.map((c) => c[COL_CONF_MAIL.PROCESSO]).sort()).toEqual(
    ['PER_CARENZA_GENITORI', 'PER_CDC', 'PER_COORDINATORE', 'PER_COORDINATORE'].sort()
  );
});
