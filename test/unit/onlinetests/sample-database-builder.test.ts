import {
  SampleDatabaseBuilder,
  MATERIA_1,
  CLASSE_BASE,
  CLASSE_PARTNER
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import {
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  COL_MATERIE,
  TABLE
} from '../../../src/config/schema';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';

function fakeFactory() {
  const sheets = new Map<string, { headers: string[]; rows: Record<string, unknown>[] }>();
  return {
    createSpreadsheet: jest.fn((name: string) => ({
      id: `SS_${name}`,
      addSheet: (sheetName: string, headerRow: string[]) =>
        sheets.set(sheetName, { headers: headerRow, rows: [] }),
      appendRow: (sheetName: string, row: Record<string, unknown>) =>
        sheets.get(sheetName)!.rows.push(row),
      appendRows: (sheetName: string, rows: Array<Record<string, unknown>>) =>
        sheets.get(sheetName)!.rows.push(...rows),
      getUrl: () => `https://docs.google.com/spreadsheets/d/SS_${name}`
    })),
    __sheets: sheets
  };
}

describe('SampleDatabaseBuilder', () => {
  it('creates one sheet per TABLE entry with the correct header row, plus a separate master spreadsheet', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    const builder = new SampleDatabaseBuilder(factory, drive);

    const db = builder.build();

    expect(db.sampleFolderUrl).toContain('drive.google.com');
    expect(db.sampleSpreadsheetUrl).toContain('SS_');
    expect(db.sampleSpreadsheetId).toContain('SS_');
    expect(db.masterSpreadsheetId).toContain('SS_');
    for (const table of Object.values(TABLE)) {
      if (table === TABLE.MASTER) continue; // MASTER lives in the separate master spreadsheet, not the sample DB
      expect(factory.__sheets.has(table)).toBe(true);
    }
  });

  it('creates the MASTER sheet only in the separate master spreadsheet, with one row pointing at the sample DB and folder', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    const builder = new SampleDatabaseBuilder(factory, drive);

    const db = builder.build();

    const master = factory.__sheets.get(TABLE.MASTER)!;
    expect(master.rows).toHaveLength(1);
    expect(master.rows[0].ID_SPREADSHEET).toBe(db.sampleSpreadsheetId);
    expect(master.rows[0].ID_CARTELLA_GOOGLE).toMatch(/^folder_\d+$/);
  });

  it('seeds a MATERIA.SPECIFICA catalog row alongside the base MATERIA_1 row (design 2026-07-30)', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive).build();

    const materie = factory.__sheets.get(TABLE.MATERIE)!.rows;
    expect(materie.some((row) => row[COL_MATERIE.ID] === MATERIA_1)).toBe(true);
    expect(materie.some((row) => row[COL_MATERIE.ID] === `${MATERIA_1}.SPECIALE`)).toBe(true);
  });

  it('seeds a SUPPLENZE row and a VARIAZIONI_CATTEDRA row on the same class/subject/date window, targeting different teachers', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive).build();

    const supplenze = factory.__sheets.get(TABLE.SUPPLENZE)!.rows;
    const variazioni = factory.__sheets.get(TABLE.VARIAZIONI_CATTEDRA)!.rows;
    expect(supplenze).toHaveLength(1);
    expect(variazioni).toHaveLength(1);
    expect(supplenze[0].CLASSI).toBe(variazioni[0].CLASSI);
    expect(supplenze[0].MATERIE).toBe(variazioni[0].MATERIE);

    // The two sources must disagree on the resolved teacher, otherwise a role-resolution test
    // asserting "SUPPLENZE wins" would pass even if priority-resolution logic picked
    // VARIAZIONI_CATTEDRA instead (see SampleDatabaseBuilder.seedSupplenzeEVariazioni).
    expect(supplenze[0].SUPPLENTE).not.toBe(variazioni[0].NUOVO_TITOLARE);
  });

  it('seeds exactly one articolata partner-class pair in CLASSI, and enrolls one ALUNNI row in the partner class', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive).build();

    const classi = factory.__sheets.get(TABLE.CLASSI)!.rows;
    expect(classi.length).toBeGreaterThanOrEqual(2);
    const partner = classi.find((c) => c.ID === CLASSE_PARTNER);
    expect(partner?.ID).toBe(CLASSE_PARTNER);
    expect(String(partner?.ARTICOLAZIONE)).toContain(CLASSE_BASE);

    const alunni = factory.__sheets.get(TABLE.ALUNNI)!.rows;
    expect(alunni.length).toBeGreaterThanOrEqual(4);
    const alunniInPartner = alunni.filter((a) => a.CLASSE === partner!.ID);
    expect(alunniInPartner).toHaveLength(1);
  });

  it('seeds a schema-complete CONF_DOC row with configured registration metadata', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive).build();

    const confDoc = factory.__sheets.get(TABLE.CONF_DOC)!.rows;
    expect(confDoc).toHaveLength(1);
    expect(factory.__sheets.get(TABLE.CONF_MAIL)!.rows).toHaveLength(1);
    expect(COL_CONF_DOC.REGISTRA_DOC).toBe('REGISTRA_DOC');
    expect(COL_CONF_DOC.REGISTRA_FOLD).toBe('REGISTRA_FOLD');
    expect(COL_LOG_DOCS.MATERIE).toBe('MATERIE');
    expect(COL_LOG_FOLD.MATERIE).toBe('MATERIE');
    expect(COL_LOG_DOCS).not.toHaveProperty('MATERIA');
    expect(COL_LOG_FOLD).not.toHaveProperty('MATERIA');

    expect(JSON.parse(String(confDoc[0]![COL_CONF_DOC.REGISTRA_DOC]))).toEqual({
      classi: '{{focus.classe.nome}}',
      utenti: '',
      materie: ''
    });
    expect(JSON.parse(String(confDoc[0]![COL_CONF_DOC.REGISTRA_FOLD]))).toEqual({});
  });

  it('seeds its CONF_MAIL row with an explicit empty ALLEGATI JSON array', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive).build();

    const row = factory.__sheets.get(TABLE.CONF_MAIL)!.rows[0]!;
    expect(Object.keys(row).sort()).toEqual(Object.values(COL_CONF_MAIL).sort());
    expect(row[COL_CONF_MAIL.ALLEGATI_STATICI]).toBe('[]');
  });

  it('names artifacts with a fixed (non-timestamped) base name, so repeated runs resolve the same Drive resources (ref ALDO_GLF_AUDIT_RESULTS.md K-1)', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive).build();
    new SampleDatabaseBuilder(factory, drive).build();

    const names = factory.createSpreadsheet.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(names).toEqual([
      '_ALDO_ONLINETEST_SAMPLE',
      '_ALDO_ONLINETEST_MASTER',
      '_ALDO_ONLINETEST_SAMPLE',
      '_ALDO_ONLINETEST_MASTER'
    ]);
  });
});
