import { GasArtifactFactory } from '../../../src/onlinetests/GasArtifactFactory';

function fakeDocumentService(): {
  documents: DocumentService;
  appended: string[];
  executed: boolean;
} {
  const appended: string[] = [];
  let executed = false;
  const builder = {
    appendParagraph: (text: string) => {
      appended.push(text);
      return builder;
    },
    execute: () => {
      executed = true;
      return { success: true };
    }
  };
  return {
    appended,
    get executed() {
      return executed;
    },
    documents: {
      createDocument: () => ({ documentId: 'DOC_1', builder })
    } as unknown as DocumentService
  };
}

function fakeSpreadsheetService(sheetTitle: string): {
  spreadsheets: SpreadsheetService;
  updateRangesCalls: Array<{ spreadsheetId: string; updates: unknown }>;
} {
  const updateRangesCalls: Array<{ spreadsheetId: string; updates: unknown }> = [];
  return {
    updateRangesCalls,
    spreadsheets: {
      createSpreadsheet: () => ({
        spreadsheetId: 'SHEET_1',
        sheets: [{ properties: { sheetId: 0, title: sheetTitle, index: 0 } }]
      }),
      updateRanges: (spreadsheetId: string, updates: unknown) => {
        updateRangesCalls.push({ spreadsheetId, updates });
        return { totalUpdatedCells: 0, totalUpdatedRows: 0, totalUpdatedColumns: 0, totalUpdatedSheets: 0 };
      }
    } as unknown as SpreadsheetService
  };
}

test('createDocument with no paragraphs creates a blank doc (unchanged behavior)', () => {
  const { documents, appended, executed } = fakeDocumentService();
  const { spreadsheets } = fakeSpreadsheetService('Foglio1');
  const factory = new GasArtifactFactory(documents, spreadsheets);

  const id = factory.createDocument('Name', 'FOLDER');

  expect(id).toBe('DOC_1');
  expect(appended).toEqual([]);
  expect(executed).toBe(false);
});

test('createDocument with paragraphs appends each one and executes the builder', () => {
  const { documents, appended } = fakeDocumentService();
  const { spreadsheets } = fakeSpreadsheetService('Foglio1');
  const factory = new GasArtifactFactory(documents, spreadsheets);

  const id = factory.createDocument('Name', 'FOLDER', ['line 1', 'line 2']);

  expect(id).toBe('DOC_1');
  expect(appended).toEqual(['line 1', 'line 2']);
});

test('createDocument throws when the builder execution fails', () => {
  const documents = {
    createDocument: () => ({
      documentId: 'DOC_1',
      builder: {
        appendParagraph: function (this: unknown) {
          return this;
        },
        execute: () => ({ success: false, error: 'boom' })
      }
    })
  } as unknown as DocumentService;
  const { spreadsheets } = fakeSpreadsheetService('Foglio1');
  const factory = new GasArtifactFactory(documents, spreadsheets);

  expect(() => factory.createDocument('Name', 'FOLDER', ['x'])).toThrow('boom');
});

test('createSheet with no updates creates a blank spreadsheet (unchanged behavior)', () => {
  const { documents } = fakeDocumentService();
  const { spreadsheets, updateRangesCalls } = fakeSpreadsheetService('Foglio1');
  const factory = new GasArtifactFactory(documents, spreadsheets);

  const id = factory.createSheet('Name', 'FOLDER');

  expect(id).toBe('SHEET_1');
  expect(updateRangesCalls).toHaveLength(0);
});

test('createSheet with updates qualifies ranges with the real (possibly locale-named) default tab', () => {
  const { documents } = fakeDocumentService();
  const { spreadsheets, updateRangesCalls } = fakeSpreadsheetService('Foglio1');
  const factory = new GasArtifactFactory(documents, spreadsheets);

  const id = factory.createSheet('Name', 'FOLDER', [{ range: 'A1:B1', values: [['x', 'y']] }]);

  expect(id).toBe('SHEET_1');
  expect(updateRangesCalls).toHaveLength(1);
  expect(updateRangesCalls[0]?.spreadsheetId).toBe('SHEET_1');
  expect(updateRangesCalls[0]?.updates).toEqual([{ range: "'Foglio1'!A1:B1", values: [['x', 'y']] }]);
});

test("createSheet escapes single quotes in the default tab's name", () => {
  const { documents } = fakeDocumentService();
  const { spreadsheets, updateRangesCalls } = fakeSpreadsheetService("John's Sheet");
  const factory = new GasArtifactFactory(documents, spreadsheets);

  factory.createSheet('Name', 'FOLDER', [{ range: 'A1', values: [['x']] }]);

  expect(updateRangesCalls[0]?.updates).toEqual([{ range: "'John''s Sheet'!A1", values: [['x']] }]);
});
