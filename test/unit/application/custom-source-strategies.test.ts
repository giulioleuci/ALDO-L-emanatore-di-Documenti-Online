import { createCercaCartelleClasseStrategy, createCercaDocumentiStrategy } from '../../../src/application/import/CustomSourceStrategies';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { LogCartellaRepository } from '../../../src/infrastructure/repositories/LogCartellaRepository';
import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

const logger = new LoggerService();

/** A SpreadsheetService double returning fixed rows per sheetId, matching the real getSheetInfo/getRanges contract. */
function fakeSpreadsheets(bySheetId: Record<string, unknown[][]>): SpreadsheetService {
  return {
    getSheetInfo: (sheetId: string) => (bySheetId[sheetId] !== undefined ? [{ name: 'Sheet1', rowCount: 10, columnCount: 5 }] : []),
    getRanges: (sheetId: string) => bySheetId[sheetId] ?? []
  };
}

/** A DriveService double whose searchFiles returns fixed spreadsheet metadata per folder query. */
function fakeDrive(byFolderId: Record<string, Array<{ id: string; name: string }>>): DriveService {
  return {
    searchFiles: (query: string) => {
      const match = /'([^']*)' in parents/.exec(query);
      const folderId = match?.[1] ?? '';
      return (byFolderId[folderId] ?? []).map((f) => ({ ...f, mimeType: 'application/vnd.google-apps.spreadsheet' }));
    }
  } as unknown as DriveService;
}

function tablesWithFolders(): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.LOG_FOLD = [
    { ID: 'fold_5a', TIPO: 'GRIGLIE_VOTI', PATH: 'Griglie/5A', LINK: '', CLASSI: '5A', UTENTI: '', MATERIA: '' },
    { ID: 'fold_3b', TIPO: 'GRIGLIE_VOTI', PATH: 'Griglie/3B', LINK: '', CLASSI: '3B', UTENTI: '', MATERIA: '' },
    { ID: 'fold_other', TIPO: 'ALTRO', PATH: 'X', LINK: '', CLASSI: '5A', UTENTI: '', MATERIA: '' }
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
      sheet_5a: [['NOME', 'VOTO'], ['Rossi', '8']],
      sheet_3b: [['NOME', 'VOTO'], ['Bianchi', '7']]
    });
    const Strategy = createCercaCartelleClasseStrategy(new ClasseRepository(db), new LogCartellaRepository(db), drive, spreadsheets);
    const strategy = new Strategy(logger);
    const rows = strategy.extract({ folderTipo: 'GRIGLIE_VOTI' });
    // 3B is ATTIVA: false in the fixture, so findAttive() excludes it — only 5A contributes.
    expect(rows).toEqual([{ NOME: 'Rossi', VOTO: 8, _CLASSE: '5A' }]);
  });

  test('an active class with no matching folder contributes no rows (not an error)', () => {
    const tables = tablesWithFolders();
    tables.LOG_FOLD = [{ ID: 'fold_5a', TIPO: 'GRIGLIE_VOTI', PATH: 'Griglie/5A', LINK: '', CLASSI: '5A', UTENTI: '', MATERIA: '' }];
    const db = new FakeDatabase(tables);
    const drive = fakeDrive({ fold_5a: [{ id: 'sheet_5a', name: 'Griglia 5A' }] });
    const spreadsheets = fakeSpreadsheets({ sheet_5a: [['NOME'], ['Rossi']] });
    const Strategy = createCercaCartelleClasseStrategy(new ClasseRepository(db), new LogCartellaRepository(db), drive, spreadsheets);
    const rows = new Strategy(logger).extract({ folderTipo: 'GRIGLIE_VOTI' });
    expect(rows).toEqual([{ NOME: 'Rossi', _CLASSE: '5A' }]); // only 5A contributed; 1F/1F-LSO/1F-LSS have none
  });

  test('missing folderTipo throws (config validation)', () => {
    const db = new FakeDatabase(tablesWithFolders());
    const Strategy = createCercaCartelleClasseStrategy(new ClasseRepository(db), new LogCartellaRepository(db), fakeDrive({}), fakeSpreadsheets({}));
    expect(() => new Strategy(logger).extract({})).toThrow();
  });
});

describe('CERCA_DOCUMENTI custom SourceStrategy (12 §3)', () => {
  function tablesWithDocs(): Record<string, Row[]> {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      { ID: 'sheet_doc1', ID_GEN: 'CD_GRIGLIE', TIPO: 'GRIGLIA', STATO: 'GENERATO', CLASSI: '5A', UTENTI: '' },
      { ID: 'sheet_doc2', ID_GEN: 'CD_GRIGLIE', TIPO: 'GRIGLIA', STATO: 'ARCHIVIATO', CLASSI: '3B', UTENTI: '' },
      { ID: 'other_doc', ID_GEN: 'CD1', TIPO: 'VERBALE', STATO: 'GENERATO', CLASSI: '5A', UTENTI: '' }
    ];
    return tables;
  }

  test('searches LOG_DOCS by idGen and combines rows from each matching document, tagged with its class', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const spreadsheets = fakeSpreadsheets({
      sheet_doc1: [['NOME'], ['Verdi']],
      sheet_doc2: [['NOME'], ['Neri']]
    });
    const Strategy = createCercaDocumentiStrategy(new LogDocumentoRepository(db), spreadsheets);
    const rows = new Strategy(logger).extract({ idGen: 'CD_GRIGLIE' });
    expect(rows).toEqual([
      { NOME: 'Verdi', _CLASSE: '5A' },
      { NOME: 'Neri', _CLASSE: '3B' }
    ]);
  });

  test('optional stato filter narrows the search', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const spreadsheets = fakeSpreadsheets({ sheet_doc1: [['NOME'], ['Verdi']] });
    const Strategy = createCercaDocumentiStrategy(new LogDocumentoRepository(db), spreadsheets);
    const rows = new Strategy(logger).extract({ idGen: 'CD_GRIGLIE', stato: 'GENERATO' });
    expect(rows).toEqual([{ NOME: 'Verdi', _CLASSE: '5A' }]);
  });

  test('missing idGen throws (config validation)', () => {
    const db = new FakeDatabase(tablesWithDocs());
    const Strategy = createCercaDocumentiStrategy(new LogDocumentoRepository(db), fakeSpreadsheets({}));
    expect(() => new Strategy(logger).extract({})).toThrow();
  });
});
