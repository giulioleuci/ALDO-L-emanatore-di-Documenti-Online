import { SampleDatabaseBuilder } from '../../../src/onlinetests/SampleDatabaseBuilder';
import { TABLE } from '../../../src/config/schema';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';

function fakeFactory() {
  const sheets = new Map<string, { headers: string[]; rows: Record<string, unknown>[] }>();
  return {
    createSpreadsheet: jest.fn((name: string) => ({
      id: `SS_${name}`,
      addSheet: (sheetName: string, headerRow: string[]) => sheets.set(sheetName, { headers: headerRow, rows: [] }),
      appendRow: (sheetName: string, row: Record<string, unknown>) => sheets.get(sheetName)!.rows.push(row),
      getUrl: () => `https://docs.google.com/spreadsheets/d/SS_${name}`
    })),
    __sheets: sheets
  };
}

describe('SampleDatabaseBuilder', () => {
  it('creates one sheet per TABLE entry with the correct header row, plus a separate master spreadsheet', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    const builder = new SampleDatabaseBuilder(factory, drive, () => new Date('2026-07-11T10:00:00Z'));

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
    const builder = new SampleDatabaseBuilder(factory, drive, () => new Date('2026-07-11T10:00:00Z'));

    const db = builder.build();

    const master = factory.__sheets.get(TABLE.MASTER)!;
    expect(master.rows).toHaveLength(1);
    expect(master.rows[0].ID_SPREADSHEET).toBe(db.sampleSpreadsheetId);
    expect(master.rows[0].ID_CARTELLA_GOOGLE).toBeDefined();
  });

  it('seeds a SUPPLENZE row and a VARIAZIONI_CATTEDRA row on the same class/subject/date window', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive, () => new Date('2026-07-11T10:00:00Z')).build();

    const supplenze = factory.__sheets.get(TABLE.SUPPLENZE)!.rows;
    const variazioni = factory.__sheets.get(TABLE.VARIAZIONI_CATTEDRA)!.rows;
    expect(supplenze).toHaveLength(1);
    expect(variazioni).toHaveLength(1);
    expect(supplenze[0].CLASSI).toBe(variazioni[0].CLASSE_ID);
    expect(supplenze[0].MATERIE).toBe(variazioni[0].MATERIA_ID);
  });

  it('seeds exactly one articolata partner-class pair in CLASSI, and enrolls one ALUNNI row in the partner class', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive, () => new Date('2026-07-11T10:00:00Z')).build();

    const classi = factory.__sheets.get(TABLE.CLASSI)!.rows;
    expect(classi.length).toBeGreaterThanOrEqual(2);
    const partner = classi.find((c) => typeof c.ARTICOLAZIONE === 'string' && c.ARTICOLAZIONE.length > 0);
    expect(partner).toBeDefined();

    const alunni = factory.__sheets.get(TABLE.ALUNNI)!.rows;
    expect(alunni.length).toBeGreaterThanOrEqual(4);
    expect(alunni.some((a) => a.CLASSE === partner!.ID)).toBe(true);
  });

  it('seeds a CONF_DOC row and a CONF_MAIL row', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    new SampleDatabaseBuilder(factory, drive, () => new Date('2026-07-11T10:00:00Z')).build();

    expect(factory.__sheets.get(TABLE.CONF_DOC)!.rows).toHaveLength(1);
    expect(factory.__sheets.get(TABLE.CONF_MAIL)!.rows).toHaveLength(1);
  });

  it('names throwaway artifacts using the injected clock timestamp', () => {
    const factory = fakeFactory();
    const drive = new FakeDriveFacade();
    const clockIso = '2026-07-11T10:00:00.000Z';
    new SampleDatabaseBuilder(factory, drive, () => new Date(clockIso)).build();

    const names = factory.createSpreadsheet.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(names.every((n: string) => n.startsWith(`_ALDO_ONLINETEST_${clockIso}`))).toBe(true);
  });
});
