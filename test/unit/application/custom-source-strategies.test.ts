import {
  createCercaCartelleClasseStrategy,
  createCercaDocumentiStrategy
} from '../../../src/application/import/CustomSourceStrategies';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { LogCartellaRepository } from '../../../src/infrastructure/repositories/LogCartellaRepository';
import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

const logger = new LoggerService();

/** A SpreadsheetService double returning fixed rows per sheetId, matching the real getSheetInfo/getRanges contract. */
function fakeSpreadsheets(
  bySheetId: Record<string, unknown[][]>,
  columnCount = 5
): SpreadsheetService {
  return {
    getSheetInfo: (sheetId: string) =>
      bySheetId[sheetId] !== undefined
        ? [
            {
              name: 'Sheet1',
              sheetId: 0,
              index: 0,
              hidden: false,
              gridProperties: { rowCount: 10, columnCount }
            }
          ]
        : [],
    getRanges: (sheetId: string) => bySheetId[sheetId] ?? []
  };
}

/** A DriveService double whose searchFiles returns fixed spreadsheet metadata per folder query. */
function fakeDrive(byFolderId: Record<string, Array<{ id: string; name: string }>>): DriveService {
  return {
    searchFiles: (query: string) => {
      const match = /'([^']*)' in parents/.exec(query);
      const folderId = match?.[1] ?? '';
      return (byFolderId[folderId] ?? []).map((f) => ({
        ...f,
        mimeType: 'application/vnd.google-apps.spreadsheet'
      }));
    }
  } as unknown as DriveService;
}

function tablesWithFolders(): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.LOG_FOLD = [
    {
      ID: 'fold_5a',
      TIPO: 'GRIGLIE_VOTI',
      PATH: 'Griglie/5A',
      LINK: '',
      CLASSI: '5A',
      UTENTI: '',
      MATERIE: ''
    },
    {
      ID: 'fold_3b',
      TIPO: 'GRIGLIE_VOTI',
      PATH: 'Griglie/3B',
      LINK: '',
      CLASSI: '3B',
      UTENTI: '',
      MATERIE: ''
    },
    { ID: 'fold_other', TIPO: 'ALTRO', PATH: 'X', LINK: '', CLASSI: '5A', UTENTI: '', MATERIE: '' }
  ];
  return tables;
}

describe('CERCA_CARTELLE_CLASSE custom SourceStrategy (12 §3)', () => {
  test('scans each active class LOG_FOLD folder matching the configured tipo and combines rows tagged with the class', () => {
    const db = new FakeDatabase(tablesWithFolders());
    const drive = fakeDrive({
      fold_5a: [{ id: 'sheet_5a', name: 'Griglia 5A' }],
      fold_3b: [{ id: 'sheet_3b', name: 'Griglia 3B' }]
    });
    const spreadsheets = fakeSpreadsheets({
      sheet_5a: [
        ['NOME', 'VOTO'],
        ['Rossi', '8']
      ],
      sheet_3b: [
        ['NOME', 'VOTO'],
        ['Bianchi', '7']
      ]
    });
    const Strategy = createCercaCartelleClasseStrategy(
      new ClasseRepository(db),
      new LogCartellaRepository(db),
      drive,
      spreadsheets
    );
    const strategy = new Strategy(logger);
    const rows = strategy.extract({ folderTipo: 'GRIGLIE_VOTI' });
    // 3B is ATTIVA: false in the fixture, so findAttive() excludes it — only 5A contributes.
    expect(rows).toEqual([{ NOME: 'Rossi', VOTO: 8, _CLASSE: '5A' }]);
  });

  test('an active class with no matching folder contributes no rows (not an error)', () => {
    const tables = tablesWithFolders();
    tables.LOG_FOLD = [
      {
        ID: 'fold_5a',
        TIPO: 'GRIGLIE_VOTI',
        PATH: 'Griglie/5A',
        LINK: '',
        CLASSI: '5A',
        UTENTI: '',
        MATERIE: ''
      }
    ];
    const db = new FakeDatabase(tables);
    const drive = fakeDrive({ fold_5a: [{ id: 'sheet_5a', name: 'Griglia 5A' }] });
    const spreadsheets = fakeSpreadsheets({ sheet_5a: [['NOME'], ['Rossi']] });
    const Strategy = createCercaCartelleClasseStrategy(
      new ClasseRepository(db),
      new LogCartellaRepository(db),
      drive,
      spreadsheets
    );
    const rows = new Strategy(logger).extract({ folderTipo: 'GRIGLIE_VOTI' });
    expect(rows).toEqual([{ NOME: 'Rossi', _CLASSE: '5A' }]); // only 5A contributed; 1F/1F-LSO/1F-LSS have none
  });

  test('missing folderTipo throws (config validation)', () => {
    const db = new FakeDatabase(tablesWithFolders());
    const Strategy = createCercaCartelleClasseStrategy(
      new ClasseRepository(db),
      new LogCartellaRepository(db),
      fakeDrive({}),
      fakeSpreadsheets({})
    );
    expect(() => new Strategy(logger).extract({})).toThrow();
  });

  test('with no explicit range, resolves the full-sheet range from gridProperties.columnCount (not hardcoded to column Z) — delegated SheetByIdStrategy behavior', () => {
    const db = new FakeDatabase(tablesWithFolders());
    const drive = fakeDrive({ fold_5a: [{ id: 'sheet_5a', name: 'Griglia 5A' }] });
    // 30 columns -> last column letter is 'AD', beyond the old hardcoded 'Z' cap.
    const spreadsheets = fakeSpreadsheets({ sheet_5a: [['NOME'], ['Rossi']] }, 30);
    const getRangesSpy = jest.spyOn(spreadsheets, 'getRanges');
    const Strategy = createCercaCartelleClasseStrategy(
      new ClasseRepository(db),
      new LogCartellaRepository(db),
      drive,
      spreadsheets
    );
    new Strategy(logger).extract({ folderTipo: 'GRIGLIE_VOTI' });
    expect(getRangesSpy).toHaveBeenCalledWith('sheet_5a', 'Sheet1!A1:AD10');
  });
});

describe('CERCA_DOCUMENTI custom SourceStrategy (12 §3)', () => {
  function tablesWithDocs(): Record<string, Row[]> {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'sheet_doc1',
        ID_GEN: 'CD_GRIGLIE',
        TIPO: 'GRIGLIA',
        STATO: 'GENERATO',
        CLASSI: '5A',
        UTENTI: ''
      },
      {
        ID: 'sheet_doc2',
        ID_GEN: 'CD_GRIGLIE',
        TIPO: 'GRIGLIA',
        STATO: 'ARCHIVIATO',
        CLASSI: '3B',
        UTENTI: ''
      },
      {
        ID: 'other_doc',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        STATO: 'GENERATO',
        CLASSI: '5A',
        UTENTI: ''
      }
    ];
    return tables;
  }

  test('searches LOG_DOCS by idGen and combines rows from each matching document, tagged with its class', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const spreadsheets = fakeSpreadsheets({
      sheet_doc1: [['NOME'], ['Verdi']],
      sheet_doc2: [['NOME'], ['Neri']]
    });
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    const rows = new Strategy(logger).extract({ idGen: 'CD_GRIGLIE' });
    expect(rows).toEqual([
      { NOME: 'Verdi', _CLASSE: '5A' },
      { NOME: 'Neri', _CLASSE: '3B' }
    ]);
  });

  test('optional stato filter narrows the search', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const spreadsheets = fakeSpreadsheets({ sheet_doc1: [['NOME'], ['Verdi']] });
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    const rows = new Strategy(logger).extract({ idGen: 'CD_GRIGLIE', stato: 'GENERATO' });
    expect(rows).toEqual([{ NOME: 'Verdi', _CLASSE: '5A' }]);
  });

  test('missing idGen throws (config validation)', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      fakeSpreadsheets({})
    );
    expect(() => new Strategy(logger).extract({})).toThrow();
  });

  test('optional tipo filter narrows the search, skipping documents whose tipo does not match', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const spreadsheets = fakeSpreadsheets({ other_doc: [['NOME'], ['Gialli']] });
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    // other_doc has idGen CD1/tipo VERBALE — only it matches this tipo filter.
    const rows = new Strategy(logger).extract({ idGen: 'CD1', tipo: 'VERBALE' });
    expect(rows).toEqual([{ NOME: 'Gialli', _CLASSE: '5A' }]);
  });

  test('a document failing either the tipo or stato filter is excluded even when idGen matches', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const spreadsheets = fakeSpreadsheets({ sheet_doc1: [['NOME'], ['Verdi']] });
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    // sheet_doc2 shares idGen/tipo with sheet_doc1 but has STATO ARCHIVIATO, not GENERATO.
    const rows = new Strategy(logger).extract({
      idGen: 'CD_GRIGLIE',
      tipo: 'GRIGLIA',
      stato: 'GENERATO'
    });
    expect(rows).toEqual([{ NOME: 'Verdi', _CLASSE: '5A' }]);
  });

  test("defaults _CLASSE to '' when the matching LOG_DOCS row's CLASSI is blank (getClassi()[0] is undefined)", () => {
    const tables = tablesWithDocs();
    tables.LOG_DOCS = [
      {
        ID: 'sheet_doc3',
        ID_GEN: 'CD_NOCLASSE',
        TIPO: 'GRIGLIA',
        STATO: 'GENERATO',
        CLASSI: '',
        UTENTI: ''
      }
    ];
    const db = new FakeDatabase(tables);
    const spreadsheets = fakeSpreadsheets({ sheet_doc3: [['NOME'], ['Blu']] });
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    const rows = new Strategy(logger).extract({ idGen: 'CD_NOCLASSE' });
    expect(rows).toEqual([{ NOME: 'Blu', _CLASSE: '' }]);
  });

  test('readSheetRows options: with no tabName/range/hasHeaders in config, resolves against the default tab (Sheet1) and full range', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const spreadsheets = fakeSpreadsheets({ sheet_doc1: [['NOME'], ['Verdi']] });
    const getRangesSpy = jest.spyOn(spreadsheets, 'getRanges');
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    new Strategy(logger).extract({ idGen: 'CD_GRIGLIE', tipo: 'GRIGLIA', stato: 'GENERATO' });
    // No explicit tabName/range supplied -> SheetByIdStrategy falls back to sheet1's own name/range.
    expect(getRangesSpy).toHaveBeenCalledWith('sheet_doc1', 'Sheet1!A1:E10');
  });

  test('readSheetRows options: an explicit tabName/range in config is passed through to the read', () => {
    const tables = tablesWithDocs();
    tables.LOG_DOCS = [
      {
        ID: 'sheet_doc4',
        ID_GEN: 'CD_RANGE',
        TIPO: 'GRIGLIA',
        STATO: 'GENERATO',
        CLASSI: '5A',
        UTENTI: ''
      }
    ];
    const db = new FakeDatabase(tables);
    const spreadsheets = fakeSpreadsheets({ sheet_doc4: [['NOME'], ['Rosa']] });
    const getRangesSpy = jest.spyOn(spreadsheets, 'getRanges');
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    // fakeSpreadsheets' single fixed tab is always named 'Sheet1'; passing it explicitly
    // together with an explicit range still proves both options are threaded through
    // (as opposed to the default-range test above, which supplies neither).
    new Strategy(logger).extract({ idGen: 'CD_RANGE', tabName: 'Sheet1', range: 'A1:B2' });
    expect(getRangesSpy).toHaveBeenCalledWith('sheet_doc4', 'Sheet1!A1:B2');
  });

  test('a document that fails to read as a sheet is skipped, not fatal — the rest of the batch still comes through', () => {
    const db = new FakeDatabase(tablesWithDocs());
    // sheet_doc2 intentionally absent from the map: fakeSpreadsheets' getSheetInfo returns []
    // for an unknown sheetId, which SheetByIdStrategy turns into a NO_SHEETS_FOUND SourceError —
    // simulating a LOG_DOCS entry pointing at a non-spreadsheet/inaccessible Drive file.
    const spreadsheets = fakeSpreadsheets({ sheet_doc1: [['NOME'], ['Verdi']] });
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const Strategy = createCercaDocumentiStrategy(
      new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db))),
      spreadsheets
    );
    // Both sheet_doc1 (5A) and sheet_doc2 (3B) match idGen CD_GRIGLIE.
    const rows = new Strategy(logger).extract({ idGen: 'CD_GRIGLIE' });
    expect(rows).toEqual([{ NOME: 'Verdi', _CLASSE: '5A' }]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sheet_doc2'));
    warnSpy.mockRestore();
  });
});
