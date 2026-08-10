import {
  E2eSampleDatabaseBuilder,
  CLASSE_A,
  CLASSE_B,
  CLASSE_C_PARENT,
  CLASSE_C,
  CLASSE_C_PARTNER,
  MATERIE_E2E,
  ASSIGNMENT_MATERIE_E2E,
  TIPI_PIANO,
  PIANO_STUDENTE,
  RIPETENTE_1A,
  RIPETENTE_3C,
  PDP_BES_3C,
  PIANO_DOPPIO_STUDENTE,
  CONF_DOC_PIANI,
  CONF_DOC_CONDOTTA,
  CONF_DOC_RIEPILOGO,
  CONF_DOC_COMPLESSO,
  CONF_DOC_ARTICOLATA,
  CONF_DOC_DOCENTE_MATERIA,
  CONF_DOC_PIANO_LAVORO,
  CONF_MAIL_VERBALE,
  CONF_MAIL_PIANI,
  CONF_MAIL_STATIC_ALLEGATO,
  e2eAlunnoEmail,
  e2eDocenteEmail,
  CARENZA_ALUNNO_1,
  CARENZA_ALUNNO_2
} from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
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
  COL_LOG_FOLD,
  COL_PIANI,
  COL_CONF_IMP,
  COL_MATERIE
} from '../../../src/config/schema';

class RecordingSpreadsheet implements ISampleSpreadsheet {
  id: string;
  rows: Record<string, Record<string, unknown>[]> = {};
  headers: Record<string, string[]> = {};
  constructor(id: string) {
    this.id = id;
  }
  addSheet(name: string, headerRow: string[]): void {
    this.rows[name] = [];
    this.headers[name] = headerRow;
  }
  appendRow(sheetName: string, row: Record<string, unknown>): void {
    (this.rows[sheetName] ??= []).push(row);
  }
  getUrl(): string {
    return `https://example.test/${this.id}`;
  }
}

function factory(): {
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
        const s = new RecordingSpreadsheet(`id_${name}`);
        sheets.set(name, s);
        return s;
      },
      openExistingSpreadsheet: () => master
    }
  };
}

const TEMPLATE_IDS = {
  verbale: 'tmpl_verbale',
  condotta: 'tmpl_condotta',
  riepilogo: 'tmpl_riepilogo',
  aslImportSheet: 'tmpl_asl_import',
  docComplesso: 'tmpl_doc_complesso',
  docArticolata: 'tmpl_doc_articolata',
  cdcRiepilogo: 'tmpl_cdc_riepilogo',
  sheetPermessi: 'tmpl_sheet_permessi',
  pianoLavoro: 'tmpl_piano_lavoro',
  staticAttachment: 'real_static_attachment_id',
  piani: {
    PDP_DSA: 'tmpl_pdp_dsa',
    PDP_BES: 'tmpl_pdp_bes',
    PDP_STRANIERI: 'tmpl_pdp_stranieri',
    PEI: 'tmpl_pei',
    PFP: 'tmpl_pfp'
  }
};

function expectCompleteRows(
  rows: Record<string, unknown>[],
  columns: Record<string, string>
): void {
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(Object.values(columns).sort());
  }
}

function expectRegistrationJson(value: unknown): void {
  const registration = JSON.parse(String(value)) as Record<string, unknown>;
  expect(registration).toEqual(expect.any(Object));
  expect(Array.isArray(registration)).toBe(false);
  for (const [key, expression] of Object.entries(registration)) {
    expect(['classi', 'utenti', 'materie']).toContain(key);
    expect(typeof expression).toBe('string');
  }
}

test('seeds an articulated parent with two populated partners and exactly 60 partner-enrolled students', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const classi = sample.rows[TABLE.CLASSI]!;
  const headers = sample.headers[TABLE.CLASSI]!;
  expect(headers.filter((header) => header === COL_CLASSI.IRC)).toHaveLength(1);
  expect(headers.filter((header) => header === COL_CLASSI.ALT)).toHaveLength(1);
  expect(classi.map((c) => c[COL_CLASSI.ID])).toEqual([
    CLASSE_A,
    CLASSE_B,
    CLASSE_C_PARENT,
    CLASSE_C,
    CLASSE_C_PARTNER
  ]);
  const parent = classi.find((row) => row[COL_CLASSI.ID] === CLASSE_C_PARENT)!;
  const partnerScientifico = classi.find((row) => row[COL_CLASSI.ID] === CLASSE_C)!;
  const partnerClassico = classi.find((row) => row[COL_CLASSI.ID] === CLASSE_C_PARTNER)!;
  expect(parent[COL_CLASSI.ID]).toBe('3C');
  expect(parent[COL_CLASSI.COORD]).toBe('');
  expect(partnerScientifico[COL_CLASSI.ID]).toBe('3C-S');
  expect(partnerClassico[COL_CLASSI.ID]).toBe('3C-C');
  expect(
    JSON.parse(
      String(
        classi.find((row) => row[COL_CLASSI.ID] === CLASSE_C_PARENT)![
          COL_CLASSI.ARTICOLAZIONE
        ]
      )
    )
  ).toEqual({
    parent: null,
    partner: null,
    partners: `${CLASSE_C},${CLASSE_C_PARTNER}`
  });

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
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  expect(sample.rows[TABLE.DOCENTI]).toHaveLength(20);
  expect(sample.rows[TABLE.DOCENTI]!.map((d) => d[COL_DOCENTI.EMAIL])).toEqual(
    Array.from({ length: 20 }, (_, i) => e2eDocenteEmail(i + 1))
  );
});

test('seeds specifica-only LAB and INTERPRET catalog rows with PRINCIPALE/SPECIFICITA display data', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const materie = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.MATERIE]!;
  expect(materie.map((row) => row[COL_MATERIE.ID])).toEqual(
    expect.arrayContaining([...ASSIGNMENT_MATERIE_E2E])
  );
  expect(materie.some((row) => row[COL_MATERIE.ID] === 'LAB')).toBe(false);
  expect(materie.some((row) => row[COL_MATERIE.ID] === 'INTERPRET')).toBe(false);

  expect(materie.find((row) => row[COL_MATERIE.ID] === 'LAB.GRUPPO_A')).toEqual(
    expect.objectContaining({
      [COL_MATERIE.NOME]: '',
      [COL_MATERIE.PRINCIPALE]: 'Laboratorio',
      [COL_MATERIE.SPECIFICITA]: 'Gruppo A'
    })
  );
  expect(materie.find((row) => row[COL_MATERIE.ID] === 'INTERPRET.CHITARRA')).toEqual(
    expect.objectContaining({
      [COL_MATERIE.NOME]: '',
      [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
      [COL_MATERIE.SPECIFICITA]: 'Chitarra'
    })
  );
  expect(materie.find((row) => row[COL_MATERIE.ID] === 'INTERPRET.FLAUTO')).toEqual(
    expect.objectContaining({
      [COL_MATERIE.NOME]: 'Interpretazione ed esecuzione — indirizzo flauto',
      [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
      [COL_MATERIE.SPECIFICITA]: 'Flauto'
    })
  );
});

test('seeds exactly 2 CARENZE rows, for the two designated students only', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
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
  const { spreadsheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  expect(master.rows[TABLE.MASTER]![0]![COL_MASTER.ANNO_SCOLASTICO]).toBe('2026-2027');
});

test('MASTER row has TEST_MODE = true, matching the returned masterTestMode', () => {
  const { spreadsheets, master } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  expect(master.rows[TABLE.MASTER]![0]![COL_MASTER.TEST_MODE]).toBe(true);
  expect(result.masterTestMode).toBe(true);
  expect(result.masterTestMode).toBe(master.rows[TABLE.MASTER]![0]![COL_MASTER.TEST_MODE]);
});

test('bound master is reused for canonical current and historical registrations', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();

  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);

  expect(result.masterSpreadsheetId).toBe('bound-master-id');
  expect(sheets.get('_ALDO_E2E_MASTER')).toBeUndefined();
  expect(master.headers[TABLE.MASTER]).toEqual(Object.values(COL_MASTER));
  expect(master.rows[TABLE.MASTER]).toHaveLength(2);
  expect(master.rows[TABLE.MASTER]!.map((row) => row[COL_MASTER.ANNO_SCOLASTICO])).toEqual([
    '2026-2027',
    '2025-2026'
  ]);
  expect(master.rows[TABLE.MASTER]![0]![COL_MASTER.ID_SPREADSHEET]).toBe(
    result.sampleSpreadsheetId
  );
  expect(master.rows[TABLE.MASTER]![1]![COL_MASTER.ID_SPREADSHEET]).toBe(
    result.priorSampleSpreadsheetId
  );
});

test('seeds one PIANI_PERSONALIZZATI CONF_DOC with five conditional models and student registration', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confDoc = sample.rows[TABLE.CONF_DOC]!;
  expect(confDoc).toHaveLength(10);
  const verbale = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'VERBALE_CDC')!;
  expect(JSON.parse(verbale[COL_CONF_DOC.MODELLI] as string)).toEqual({
    templateId: 'tmpl_verbale'
  });
  expect(JSON.parse(String(verbale[COL_CONF_DOC.REGISTRA_DOC]))).toEqual({
    classi: '{{focus.classe.anagrafica.nome}}',
    utenti: '',
    materie: 'MATE'
  });
  expect(JSON.parse(String(verbale[COL_CONF_DOC.REGISTRA_FOLD]))).toEqual({
    classi: '{{focus.classe.anagrafica.nome}},{{focus.classe.articolazione.partners | join}}',
    utenti: '',
    materie: 'MATE'
  });
  const condotta = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'FOGLIO_GENERICO')!;
  expect(JSON.parse(condotta[COL_CONF_DOC.MODELLI] as string)).toEqual({
    templateId: 'tmpl_condotta'
  });
  for (const id of [CONF_DOC_CONDOTTA, CONF_DOC_RIEPILOGO, CONF_DOC_COMPLESSO, CONF_DOC_ARTICOLATA]) {
    const row = confDoc.find((candidate) => candidate[COL_CONF_DOC.ID] === id)!;
    expect(JSON.parse(String(row[COL_CONF_DOC.REGISTRA_DOC]))).toEqual({
      classi: '{{focus.classe.anagrafica.nome}}',
      utenti: '',
      materie: ''
    });
  }
  const riepilogo = confDoc.find((c) => c[COL_CONF_DOC.ID] === 'E2E_RIEPILOGO')!;
  expect(riepilogo[COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');
  expect(riepilogo[COL_CONF_DOC.TIPO]).toBe('RIEPILOGO_CLASSE');
  expect(JSON.parse(riepilogo[COL_CONF_DOC.MODELLI] as string)).toEqual({
    templateId: 'tmpl_riepilogo'
  });
  const complesso = confDoc.find((c) => c[COL_CONF_DOC.ID] === 'E2E_DOC_COMPLESSO')!;
  expect(complesso[COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');
  expect(JSON.parse(complesso[COL_CONF_DOC.MODELLI] as string)).toEqual({
    templateId: 'tmpl_doc_complesso'
  });
  const sheetPermessi = confDoc.find((c) => c[COL_CONF_DOC.ID] === 'E2E_SHEET_PERMESSI')!;
  expect(sheetPermessi[COL_CONF_DOC.GENERATORE]).toBe('SHEET_CON_MATERIE_E_PERMESSI');
  expect(JSON.parse(sheetPermessi[COL_CONF_DOC.MODELLI] as string)).toEqual({
    templateId: 'tmpl_sheet_permessi'
  });
  const docenteMateria = confDoc.find((c) => c[COL_CONF_DOC.ID] === CONF_DOC_DOCENTE_MATERIA)!;
  expect(docenteMateria[COL_CONF_DOC.TIPO]).toBe('DOCUMENTO_DOCENTE_MATERIA');
  expect(JSON.parse(String(docenteMateria[COL_CONF_DOC.REGISTRA_DOC]))).toEqual({
    classi: '{{focus.classe.anagrafica.nome}}',
    utenti: '{{focus.docente.email}}',
    materie: '{{focus.materia.sigla}}'
  });
  const piani = confDoc.filter((c) => c[COL_CONF_DOC.TIPO] === 'PIANO_PERS');
  expect(piani).toHaveLength(1);
  const piano = piani[0]!;
  expect(piano[COL_CONF_DOC.ID]).toBe(CONF_DOC_PIANI);
  expect(piano[COL_CONF_DOC.GENERATORE]).toBe('DOC_PERSONALIZZATO');
  expect(piano[COL_CONF_DOC.PARAMETRI]).toBe('');
  expect(String(piano[COL_CONF_DOC.FILE_NAME])).toContain('{{focus.piano.tipoLabel}}');
  expect(String(piano[COL_CONF_DOC.FILE_NAME])).not.toContain('{{focus.piano.tipo}}');
  expect(JSON.parse(String(piano[COL_CONF_DOC.MODELLI]))).toEqual([
    { condizione: '{{focus.piano.tipo}} == "PDP_DSA"', templateId: 'tmpl_pdp_dsa' },
    { condizione: '{{focus.piano.tipo}} == "PDP_BES"', templateId: 'tmpl_pdp_bes' },
    {
      condizione: '{{focus.piano.tipo}} == "PDP_STRANIERI"',
      templateId: 'tmpl_pdp_stranieri'
    },
    { condizione: '{{focus.piano.tipo}} == "PEI"', templateId: 'tmpl_pei' },
    { condizione: '{{focus.piano.tipo}} == "PFP"', templateId: 'tmpl_pfp' }
  ]);
  expect(JSON.parse(String(piano[COL_CONF_DOC.REGISTRA_DOC]))).toEqual({
    classi: '{{focus.classe.anagrafica.nome}}',
    utenti: '{{focus.alunno.anagrafica.email}}',
    materie: ''
  });
  expectCompleteRows(confDoc, COL_CONF_DOC);
  for (const row of confDoc) {
    expectRegistrationJson(row[COL_CONF_DOC.REGISTRA_DOC]);
    expectRegistrationJson(row[COL_CONF_DOC.REGISTRA_FOLD]);
  }
  expect(COL_LOG_DOCS.MATERIE).toBe('MATERIE');
  expect(COL_LOG_FOLD.MATERIE).toBe('MATERIE');
  expect(COL_LOG_DOCS).not.toHaveProperty('MATERIA');
  expect(COL_LOG_FOLD).not.toHaveProperty('MATERIA');
});

test('1A and 2B share the same coordinatore, so coordinatore-aggregated emails cover both classes (not one email per class)', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const classi = sample.rows[TABLE.CLASSI]!;
  const coordOf = (id: string): unknown =>
    classi.find((c) => c[COL_CLASSI.ID] === id)![COL_CLASSI.COORD];
  expect(coordOf(CLASSE_A)).toBe(e2eDocenteEmail(1));
  expect(coordOf(CLASSE_B)).toBe(e2eDocenteEmail(1));
  expect(coordOf(CLASSE_C)).not.toBe(e2eDocenteEmail(1));
});

test('seeds 6 CONF_MAIL rows: five normal patterns with explicit empty ALLEGATI plus one static attachment fixture', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confMail = sample.rows[TABLE.CONF_MAIL]!;
  expect(confMail).toHaveLength(6);
  expect(confMail.map((c) => c[COL_CONF_MAIL.PROCESSO]).sort()).toEqual(
    [
      'PER_CARENZA_GENITORI',
      'PER_CDC',
      'PER_CDC',
      'PER_COORDINATORE',
      'PER_COORDINATORE',
      'PER_COORDINATORE'
    ].sort()
  );
  expectCompleteRows(confMail, COL_CONF_MAIL);
  const staticAttachment = confMail.find(
    (c) => c[COL_CONF_MAIL.ID] === CONF_MAIL_STATIC_ALLEGATO
  )!;
  expect(staticAttachment[COL_CONF_MAIL.ALLEGATI]).toBe(
    JSON.stringify(['real_static_attachment_id'])
  );
  expect(result.staticAttachmentFileId).toBe('real_static_attachment_id');
  for (const row of confMail.filter((c) => c !== staticAttachment)) {
    expect(row[COL_CONF_MAIL.ALLEGATI]).toBe('[]');
  }
});

test('does not emit the obsolete REGISTRA_UTENTI column in CONF_DOC rows', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const confDoc = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.CONF_DOC]!;

  expect(COL_CONF_DOC).not.toHaveProperty('REGISTRA_UTENTI');
  for (const row of confDoc) {
    expect(row).not.toHaveProperty('REGISTRA_UTENTI');
  }
});

test('VERBALE and CONDOTTA emails configure documenti/cartelle boxes (so generated documents actually show up as links)', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confMail = sample.rows[TABLE.CONF_MAIL]!;
  for (const id of ['E2E_MAIL_VERBALE', 'E2E_MAIL_CONDOTTA']) {
    const row = confMail.find((c) => c[COL_CONF_MAIL.ID] === id)!;
    const boxes = JSON.parse(row[COL_CONF_MAIL.BOX_CFG] as string) as Array<{ TIPO_BOX: string }>;
    expect(boxes.map((b) => b.TIPO_BOX).sort()).toEqual(['cartelle', 'documenti']);
  }
});

test('PIANI_PERS POST_PROCESSO criterion matches on the full classiCompetenza list (join filter), not just the target class', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const piani = sample.rows[TABLE.CONF_MAIL]!.find(
    (c) => c[COL_CONF_MAIL.ID] === 'E2E_MAIL_PIANI'
  )!;
  const postProcesso = JSON.parse(piani[COL_CONF_MAIL.POST_PROCESSO] as string) as Array<{
    criteri: Record<string, string>;
  }>;
  expect(postProcesso[0]!.criteri[COL_LOG_DOCS.CLASSI]).toBe(
    '{{destinatario.contesto.classiCompetenza | join}}'
  );
});

test('the observable coordinator verbale email targets articulated partners instead of their parent', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const row = sheets
    .get('_ALDO_E2E_SAMPLE')!
    .rows[TABLE.CONF_MAIL]!.find((candidate) => candidate[COL_CONF_MAIL.ID] === CONF_MAIL_VERBALE);

  expect(row?.[COL_CONF_MAIL.PROCESSO]).toBe('PER_COORDINATORE');
  expect(row?.[COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]).toBe('ARTICOLATA');
});

test('exactly RIPETENTE_1A and RIPETENTE_3C are flagged RIPETENTE this year', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const alunni = sample.rows[TABLE.ALUNNI]!;
  const ripetenti = alunni
    .filter((a) => a[COL_ALUNNI.RIPETENTE] === true)
    .map((a) => a[COL_ALUNNI.EMAIL]);
  expect(ripetenti.sort()).toEqual([RIPETENTE_1A, RIPETENTE_3C].sort());
});

test('RELIGIONE is always a valid ReligioneScelta value (IRC/NO/ALT), never a boolean (item 3)', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  for (const a of alunni) {
    expect(['IRC', 'NO', 'ALT']).toContain(a[COL_ALUNNI.RELIGIONE]);
  }
});

test('each class gets a distinct 0/1/2 spread of student and parent representatives (item 3)', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
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

test('each class has at least one NO and/or ALT religion exception alongside the IRC majority (item 3)', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id);
  for (const id of [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER]) {
    const rows = byClasse(id);
    const exceptions = rows.filter((a) => a[COL_ALUNNI.RELIGIONE] !== 'IRC');
    expect(exceptions.length).toBeGreaterThan(0);
    expect(rows.filter((a) => a[COL_ALUNNI.RELIGIONE] === 'IRC').length).toBe(
      rows.length - exceptions.length
    );
  }
  const all = alunni.map((a) => a[COL_ALUNNI.RELIGIONE]);
  expect(all).toContain('NO');
  expect(all).toContain('ALT');
});

test('PIANI gets one row per (tipo, studente) while CONF_DOC keeps one plan recipe', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const piani = sample.rows[TABLE.CONF_DOC]!.filter(
    (c) => c[COL_CONF_DOC.GENERATORE] === 'DOC_PERSONALIZZATO'
  );
  expect(piani).toHaveLength(1);
  const pianiRows = sample.rows[TABLE.PIANI]!;
  const totalStudenti = TIPI_PIANO.reduce((n, tipo) => n + PIANO_STUDENTE[tipo].length, 0);
  expect(pianiRows).toHaveLength(totalStudenti);
  expect(
    pianiRows
      .filter((r) => r[COL_PIANI.TIPO] === 'PDP_BES')
      .map((r) => r[COL_PIANI.STUDENTE])
      .sort()
  ).toEqual([e2eAlunnoEmail(5), PDP_BES_3C, PIANO_DOPPIO_STUDENTE].sort());
});

test('creates a second (prior-year) sample spreadsheet and a second, later MASTER row for 2025-2026', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const prior = sheets.get('_ALDO_E2E_SAMPLE_PRIOR')!;
  expect(result.priorSampleSpreadsheetId).toBe(prior.id);
  expect(result.priorSampleSpreadsheetUrl).toBe(prior.getUrl());

  const rows = master.rows[TABLE.MASTER]!;
  expect(rows).toHaveLength(2);
  // MasterSheetRepository requires descending order: current year first.
  expect(rows[0]![COL_MASTER.ANNO_SCOLASTICO]).toBe('2026-2027');
  expect(rows[1]![COL_MASTER.ANNO_SCOLASTICO]).toBe('2025-2026');
  expect(rows[1]![COL_MASTER.ID_SPREADSHEET]).toBe(prior.id);
});

test('prior-year (2025-2026) roster: 1A/3C-S hold only their repeater, 2B/3C partners promote to 1B/2C partners', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const prior = sheets.get('_ALDO_E2E_SAMPLE_PRIOR')!;

  const classi = prior.rows[TABLE.CLASSI]!.map((c) => c[COL_CLASSI.ID]);
  expect(classi.sort()).toEqual(['1A', '1B', '2C-S', '2C-C', '3C-S'].sort());

  const alunni = prior.rows[TABLE.ALUNNI]!;
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id);
  expect(byClasse('1A').map((a) => a[COL_ALUNNI.EMAIL])).toEqual([RIPETENTE_1A]);
  expect(byClasse('3C-S').map((a) => a[COL_ALUNNI.EMAIL])).toEqual([RIPETENTE_3C]);
  expect(byClasse('1B')).toHaveLength(20);
  expect(byClasse('2C-S')).toHaveLength(7); // 8 CLASSE_C students minus the repeater
  expect(byClasse('2C-C')).toHaveLength(12);
  expect(alunni).toHaveLength(1 + 1 + 20 + 7 + 12);
});

test('seeds one student with both PEI and PDP_BES plans', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const rows = sample.rows[TABLE.PIANI]!.filter(
    (row) => row[COL_PIANI.STUDENTE] === PIANO_DOPPIO_STUDENTE
  );

  expect(rows.map((row) => row[COL_PIANI.TIPO]).sort()).toEqual(['PDP_BES', 'PEI']);
  expect(
    rows.map(
      (row) =>
        JSON.parse(String(row[COL_PIANI.PARAMETRI])) as Record<string, unknown>
    )
  ).toEqual(expect.arrayContaining([{ note: 'Piano E2E PEI' }, { note: 'Piano E2E PDP_BES' }]));
});

test('prior-year personalized-plan rows share one generator ID and remain distinguished by SOTTOTIPO', () => {
  const { spreadsheets, sheets, master } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);
  const prior = sheets.get('_ALDO_E2E_SAMPLE_PRIOR')!;
  const logDocs = prior.rows[TABLE.LOG_DOCS]!;
  expect(logDocs).toHaveLength(2);

  const rowsForDualStudent = logDocs.filter(
    (row) => row[COL_LOG_DOCS.UTENTI] === PIANO_DOPPIO_STUDENTE
  );
  expect(rowsForDualStudent).toHaveLength(2);
  expect(rowsForDualStudent.map((row) => row[COL_LOG_DOCS.SOTTOTIPO]).sort()).toEqual([
    'PDP_BES',
    'PEI'
  ]);
  expect(new Set(logDocs.map((row) => row[COL_LOG_DOCS.ID_GEN]))).toEqual(
    new Set([CONF_DOC_PIANI])
  );

  const pei = rowsForDualStudent.find((r) => r[COL_LOG_DOCS.SOTTOTIPO] === 'PEI')!;
  expect(pei[COL_LOG_DOCS.ID_GEN]).toBe(CONF_DOC_PIANI);
  expect(pei[COL_LOG_DOCS.TIPO]).toBe('PIANO_PERS');
  expect(pei[COL_LOG_DOCS.SOTTOTIPO]).toBe('PEI');
  expect(pei[COL_LOG_DOCS.CLASSI]).toBe('1B');

  const bes = rowsForDualStudent.find((r) => r[COL_LOG_DOCS.SOTTOTIPO] === 'PDP_BES')!;
  expect(bes[COL_LOG_DOCS.ID_GEN]).toBe(CONF_DOC_PIANI);
  expect(bes[COL_LOG_DOCS.SOTTOTIPO]).toBe('PDP_BES');
  expect(bes[COL_LOG_DOCS.CLASSI]).toBe('1B');
});

test('seeds a CONF_DOC row for the complex-placeholder template (DOCUMENTO_GENERICO generator)', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const row = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === 'E2E_DOC_COMPLESSO');
  expect(row).toBeDefined();
  expect(row![COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');
  expect(JSON.parse(String(row![COL_CONF_DOC.MODELLI]))).toEqual({
    templateId: TEMPLATE_IDS.docComplesso
  });
});

test('seeds the CONF_DOC row for the articulated-class complex document', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const row = sample.rows[TABLE.CONF_DOC]!.find(
    (r) => r[COL_CONF_DOC.ID] === CONF_DOC_ARTICOLATA
  )!;
  expect(row[COL_CONF_DOC.TIPO]).toBe('DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA');
  expect(row[COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');
  expect(JSON.parse(row[COL_CONF_DOC.MODELLI] as string)).toEqual({
    templateId: 'tmpl_doc_articolata'
  });
  expect(row[COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]).toBe('ARTICOLATA');
});

test('seeds an articulated generic CDC signature-summary document with registration metadata', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const rows = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.CONF_DOC]!;
  const row = rows.find((candidate) => candidate[COL_CONF_DOC.ID] === 'E2E_RIEPILOGO_FIRME_CDC');

  expect(row).toEqual(expect.objectContaining({
    [COL_CONF_DOC.TIPO]: 'RIEPILOGO_FIRME_CDC',
    [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
    [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA',
    [COL_CONF_DOC.FORMATO]: 'GDOC'
  }));
  expect(JSON.parse(String(row?.[COL_CONF_DOC.MODELLI]))).toEqual({
    templateId: 'tmpl_cdc_riepilogo'
  });
  expect(JSON.parse(String(row?.[COL_CONF_DOC.REGISTRA_DOC]))).toEqual({
    classi: '{{focus.classe.anagrafica.nome}}',
    utenti: '',
    materie: ''
  });
});

test('seeds a CONF_DOC row using the SHEET_CON_MATERIE_E_PERMESSI generator', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const row = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === 'E2E_SHEET_PERMESSI');
  expect(row).toBeDefined();
  expect(row![COL_CONF_DOC.GENERATORE]).toBe('SHEET_CON_MATERIE_E_PERMESSI');
  expect(row![COL_CONF_DOC.FORMATO]).toBe('GSHEET');
});

test('CONF_DOC_VERBALE PATH_OUT is per-class, so each class gets its own LOG_FOLD-tracked destination folder', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const verbale = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === 'E2E_VERBALE')!;
  expect(String(verbale[COL_CONF_DOC.PATH_OUT])).toContain('{{focus.classe.anagrafica.nome}}');
});

test('CONF_DOC_VERBALE verbalizes the focus class and articulated-partner plans through AGGIORNA_STATO_DOC', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const verbale = sample.rows[TABLE.CONF_DOC]!.find(
    (row) => row[COL_CONF_DOC.ID] === 'E2E_VERBALE'
  )!;
  const postProcesso = JSON.parse(String(verbale[COL_CONF_DOC.POST_PROCESSO])) as Array<{
    tipo: string;
    stato: string;
    criteri: Record<string, string>;
  }>;

  expect(postProcesso).toHaveLength(2);
  expect(postProcesso).toContainEqual(
    {
      tipo: 'AGGIORNA_STATO_DOC',
      stato: 'VERBALIZZATO',
      criteri: {
        [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
        [COL_LOG_DOCS.CLASSI]: '{{focus.classe.anagrafica.nome}}'
      }
    }
  );
  expect(postProcesso).toContainEqual({
    tipo: 'AGGIORNA_STATO_DOC',
    stato: 'VERBALIZZATO',
    criteri: {
      [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
      [COL_LOG_DOCS.CLASSI]: '{{focus.classe.articolazione.partners | join}}'
    }
  });
});

test('seeds E2E_PIANO_LAVORO CONF_DOC and E2E_MAIL_LAVORO CONF_MAIL (documenti + cartelle real-folder boxes)', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const doc = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === CONF_DOC_PIANO_LAVORO);
  expect(doc).toBeDefined();
  expect(doc![COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');
  expect(JSON.parse(String(doc![COL_CONF_DOC.REGISTRA_DOC]))).toEqual({
    classi: '{{focus.classe.anagrafica.nome}},{{focus.classe.articolazione.partners | join}}',
    utenti: '{{#focus.classe.coordinatori.elenco}}{{email}},{{/focus.classe.coordinatori.elenco}}',
    materie: ''
  });

  const mail = sample.rows[TABLE.CONF_MAIL]!.find((r) => r[COL_CONF_MAIL.ID] === 'E2E_MAIL_LAVORO');
  expect(mail).toBeDefined();
  expect(mail![COL_CONF_MAIL.PROCESSO]).toBe('PER_COORDINATORE');
  const boxes: unknown = JSON.parse(String(mail![COL_CONF_MAIL.BOX_CFG]));
  expect(boxes).toEqual([
    {
      TIPO_BOX: 'documenti',
      FILTRO_TIPO: 'PIANO_LAVORO'
    },
    { TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse' } }
  ]);
  expect(String(mail![COL_CONF_MAIL.TESTO])).not.toMatch(/in allegato/i);
});

test('E2E personalized-plan email template uses the readable label for every current plan', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const mail = sample.rows[TABLE.CONF_MAIL]!.find((r) => r[COL_CONF_MAIL.ID] === CONF_MAIL_PIANI)!;
  const boxes = JSON.parse(String(mail[COL_CONF_MAIL.BOX_CFG])) as Array<{
    TIPO_BOX: string;
    configArricchimento?: { templateRiga?: string };
  }>;
  const template = boxes.find((box) => box.TIPO_BOX === 'piani_pers_da_inviare')!
    .configArricchimento?.templateRiga;
  expect(template).toContain('<strong>{{corrente.tipoLabel}}</strong>');
  expect(template).not.toContain('{{corrente.sottotipo}}');
  expect(template).toContain('{{corrente.studente.nomeCompleto}}');
  expect(template).toContain('<a href="{{corrente.link}}"');
  expect(template).not.toContain('E2E_CURRENT=');
  expect(template).not.toContain('E2E_LINK=');
});

test('seeds a CONF_IMP row importing the ASL sheet into TABLE.ASL, keyed on STUDENTE', () => {
  const { spreadsheets, sheets, master } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS, master);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const rows = sample.rows[TABLE.CONF_IMP]!;
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row[COL_CONF_IMP.TARGET]).toBe(TABLE.ASL);
  expect(row[COL_CONF_IMP.ATTIVO]).toBe(true);
  const config = JSON.parse(String(row[COL_CONF_IMP.CONFIG])) as Record<string, unknown>;
  expect(config).toMatchObject({
    searchStrategy: 'FILE_SINGOLO',
    fileId: TEMPLATE_IDS.aslImportSheet,
    key: 'STUDENTE',
    conflictResolution: 'OVERWRITE'
  });
  expect(config).not.toHaveProperty('map');
});
