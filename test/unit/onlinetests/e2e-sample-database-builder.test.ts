import {
  E2eSampleDatabaseBuilder,
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARTNER,
  MATERIE_E2E,
  TIPI_PIANO,
  PIANO_STUDENTE,
  RIPETENTE_1A,
  RIPETENTE_3C,
  PDP_BES_3C,
  e2eAlunnoEmail,
  e2eDocenteEmail,
  confDocPiano,
  CARENZA_ALUNNO_1,
  CARENZA_ALUNNO_2
} from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import {
  TABLE,
  COL_CLASSI,
  COL_ALUNNI,
  COL_DOCENTI,
  COL_CARENZE,
  COL_MASTER,
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_LOG_DOCS,
  COL_PIANI
} from '../../../src/config/schema';

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

test('MASTER row ANNO_SCOLASTICO uses the canonical YYYY-YYYY dash format (01 §schema), not a slash', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const master = sheets.get('_ALDO_E2E_MASTER')!;
  expect(master.rows[TABLE.MASTER]![0]![COL_MASTER.ANNO_SCOLASTICO]).toBe('2026-2027');
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

test('1A and 2B share the same coordinatore, so coordinatore-aggregated emails cover both classes (not one email per class)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const classi = sample.rows[TABLE.CLASSI]!;
  const coordOf = (id: string): unknown =>
    classi.find((c) => c[COL_CLASSI.ID] === id)![COL_CLASSI.COORD];
  expect(coordOf(CLASSE_A)).toBe(e2eDocenteEmail(1));
  expect(coordOf(CLASSE_B)).toBe(e2eDocenteEmail(1));
  expect(coordOf(CLASSE_C)).not.toBe(e2eDocenteEmail(1));
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

test('VERBALE and CONDOTTA emails configure documenti/cartelle boxes (so generated documents actually show up as links)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confMail = sample.rows[TABLE.CONF_MAIL]!;
  for (const id of ['E2E_MAIL_VERBALE', 'E2E_MAIL_CONDOTTA']) {
    const row = confMail.find((c) => c[COL_CONF_MAIL.ID] === id)!;
    const boxes = JSON.parse(row[COL_CONF_MAIL.BOX_CFG] as string) as Array<{ TIPO_BOX: string }>;
    expect(boxes.map((b) => b.TIPO_BOX).sort()).toEqual(['cartelle', 'documenti']);
  }
});

test('PIANI_PERS POST_PROCESSO criterion matches on the full classiCompetenza list (join filter), not just the target class', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const piani = sample.rows[TABLE.CONF_MAIL]!.find((c) => c[COL_CONF_MAIL.ID] === 'E2E_MAIL_PIANI')!;
  const postProcesso = JSON.parse(piani[COL_CONF_MAIL.POST_PROCESSO] as string) as Array<{
    criteri: Record<string, string>;
  }>;
  expect(postProcesso[0]!.criteri[COL_LOG_DOCS.CLASSI]).toBe(
    '{{destinatario.contesto.classiCompetenza | join}}'
  );
});

test('exactly RIPETENTE_1A and RIPETENTE_3C are flagged RIPETENTE this year', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const alunni = sample.rows[TABLE.ALUNNI]!;
  const ripetenti = alunni.filter((a) => a[COL_ALUNNI.RIPETENTE] === true).map((a) => a[COL_ALUNNI.EMAIL]);
  expect(ripetenti.sort()).toEqual([RIPETENTE_1A, RIPETENTE_3C].sort());
});

test('RELIGIONE is always a valid ReligioneScelta value (SI/NO/ALT), never a boolean (item 3)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  for (const a of alunni) {
    expect(['SI', 'NO', 'ALT']).toContain(a[COL_ALUNNI.RELIGIONE]);
  }
});

test('each class gets a distinct 0/1/2 spread of student and parent representatives (item 3)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id);
  const studentReps = (id: string) =>
    byClasse(id).filter((a) => a[COL_ALUNNI.RAPPR_STUD] === true).length;
  const parentReps = (id: string) =>
    byClasse(id).filter(
      (a) => ((a[COL_ALUNNI.RAPPR_GEN] as string | undefined) ?? '').trim() !== ''
    ).length;

  expect(studentReps(CLASSE_A)).toBe(0);
  expect(parentReps(CLASSE_A)).toBe(0);
  expect(studentReps(CLASSE_B)).toBe(1);
  expect(parentReps(CLASSE_B)).toBe(1);
  expect(studentReps(CLASSE_C)).toBe(2);
  expect(parentReps(CLASSE_C)).toBe(1);
  expect(studentReps(CLASSE_C_PARTNER)).toBe(1);
  expect(parentReps(CLASSE_C_PARTNER)).toBe(2);

  // 0/1/2 is covered somewhere across the 4 classes for each dimension.
  const studentCounts = new Set([CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map(studentReps));
  const parentCounts = new Set([CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map(parentReps));
  expect(studentCounts).toEqual(new Set([0, 1, 2]));
  expect(parentCounts).toEqual(new Set([0, 1, 2]));
});

test('each class has at least one NO and/or ALT religion exception alongside the SI majority (item 3)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id);
  for (const id of [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER]) {
    const rows = byClasse(id);
    const exceptions = rows.filter((a) => a[COL_ALUNNI.RELIGIONE] !== 'SI');
    expect(exceptions.length).toBeGreaterThan(0);
    expect(rows.filter((a) => a[COL_ALUNNI.RELIGIONE] === 'SI').length).toBe(
      rows.length - exceptions.length
    );
  }
  const all = alunni.map((a) => a[COL_ALUNNI.RELIGIONE]);
  expect(all).toContain('NO');
  expect(all).toContain('ALT');
});

test('PDP_BES targets 2 students (5 CONF_DOC piano rows stay one per tipo; PIANI gets one row per (tipo, studente))', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const piani = sample.rows[TABLE.CONF_DOC]!.filter(
    (c) => c[COL_CONF_DOC.GENERATORE] === 'DOC_PERSONALIZZATO'
  );
  expect(piani).toHaveLength(5);
  const pianiRows = sample.rows[TABLE.PIANI]!;
  const totalStudenti = TIPI_PIANO.reduce((n, tipo) => n + PIANO_STUDENTE[tipo].length, 0);
  expect(pianiRows).toHaveLength(totalStudenti);
  expect(pianiRows.filter((r) => r[COL_PIANI.TIPO] === 'PDP_BES').map((r) => r[COL_PIANI.STUDENTE]).sort()).toEqual(
    [e2eAlunnoEmail(5), PDP_BES_3C].sort()
  );
});

test('creates a second (prior-year) sample spreadsheet and a second, later MASTER row for 2025-2026', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const prior = sheets.get('_ALDO_E2E_SAMPLE_PRIOR')!;
  expect(result.priorSampleSpreadsheetId).toBe(prior.id);
  expect(result.priorSampleSpreadsheetUrl).toBe(prior.getUrl());

  const master = sheets.get('_ALDO_E2E_MASTER')!;
  const rows = master.rows[TABLE.MASTER]!;
  expect(rows).toHaveLength(2);
  // MasterSheetRepository requires descending order: current year first.
  expect(rows[0]![COL_MASTER.ANNO_SCOLASTICO]).toBe('2026-2027');
  expect(rows[1]![COL_MASTER.ANNO_SCOLASTICO]).toBe('2025-2026');
  expect(rows[1]![COL_MASTER.ID_SPREADSHEET]).toBe(prior.id);
});

test('prior-year (2025-2026) roster: 1A/3C hold only their repeater, 2B/3C promote to 1B/2C(-LC)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const prior = sheets.get('_ALDO_E2E_SAMPLE_PRIOR')!;

  const classi = prior.rows[TABLE.CLASSI]!.map((c) => c[COL_CLASSI.ID]);
  expect(classi.sort()).toEqual(['1A', '1B', '2C', '2C-LC', '3C'].sort());

  const alunni = prior.rows[TABLE.ALUNNI]!;
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id);
  expect(byClasse('1A').map((a) => a[COL_ALUNNI.EMAIL])).toEqual([RIPETENTE_1A]);
  expect(byClasse('3C').map((a) => a[COL_ALUNNI.EMAIL])).toEqual([RIPETENTE_3C]);
  expect(byClasse('1B')).toHaveLength(20);
  expect(byClasse('2C')).toHaveLength(7); // 8 CLASSE_C students minus the repeater
  expect(byClasse('2C-LC')).toHaveLength(12);
  expect(alunni).toHaveLength(1 + 1 + 20 + 7 + 12);
});

test('prior-year LOG_DOCS carries the PEI and new-3C-PDP_BES plans, ID_GEN matching the exact current-year confDocPiano id', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const prior = sheets.get('_ALDO_E2E_SAMPLE_PRIOR')!;
  const logDocs = prior.rows[TABLE.LOG_DOCS]!;
  expect(logDocs).toHaveLength(2);

  const pei = logDocs.find((r) => r[COL_LOG_DOCS.UTENTI] === PIANO_STUDENTE.PEI[0])!;
  expect(pei[COL_LOG_DOCS.ID_GEN]).toBe(confDocPiano('PEI'));
  expect(pei[COL_LOG_DOCS.TIPO]).toBe('PIANO_PERS');
  expect(pei[COL_LOG_DOCS.SOTTOTIPO]).toBe('PEI');
  expect(pei[COL_LOG_DOCS.CLASSI]).toBe('1B');

  const bes = logDocs.find((r) => r[COL_LOG_DOCS.UTENTI] === PDP_BES_3C)!;
  expect(bes[COL_LOG_DOCS.ID_GEN]).toBe(confDocPiano('PDP_BES'));
  expect(bes[COL_LOG_DOCS.SOTTOTIPO]).toBe('PDP_BES');
  expect(bes[COL_LOG_DOCS.CLASSI]).toBe('2C');
});
