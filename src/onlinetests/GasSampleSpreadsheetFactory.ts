import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';

/**
 * Real `SpreadsheetApp`-backed implementation of {@link ISampleSpreadsheetFactory}.
 *
 * Neither `GasLibraryFactory/DOCS_LIBS/*.md` nor `types/gaslibs/index.d.ts` documents any
 * GLF-wrapped way to mint a brand-new named spreadsheet file — the vendored libraries only
 * operate on spreadsheets that already have an ID (`createSheets` adds tabs, `appendRows`
 * appends data to an existing sheet). SGSA's production `src/` code has no precedent for
 * creating a spreadsheet either, because it always assumes one already exists.
 *
 * This file is therefore a second, deliberate native-global exception, analogous to the
 * `GasOnlineTestFramework/**` entry in `GasLibraryFactory/CLAUDE.md`'s "Sanctioned exceptions
 * (the only ones)" list: that framework "runs inside real GAS by design," and so does this one
 * — `src/onlinetests/**` only ever executes inside a live online-test run against real Google
 * Workspace, never in the production request path. This class plays the exact role
 * `GoogleApiWrapper` plays for production code: it IS the L2 boundary for this test suite, the
 * one place allowed to touch `SpreadsheetApp` directly, so that {@link SampleDatabaseBuilder}
 * itself stays fully unit-testable offline via the `ISampleSpreadsheetFactory` port. It is not a
 * leak of the "native GAS globals only inside `GoogleApiWrapper`" rule; it is the documented
 * exception applied to a second, equally legitimate boundary.
 */
export class GasSampleSpreadsheetFactory implements ISampleSpreadsheetFactory {
  createSpreadsheet(name: string): ISampleSpreadsheet {
    const spreadsheet = SpreadsheetApp.create(name);
    return new GasSampleSpreadsheet(spreadsheet);
  }
}

class GasSampleSpreadsheet implements ISampleSpreadsheet {
  readonly id: string;

  /** Default sheet GAS creates with every new spreadsheet; deleted once a real sheet exists. */
  private defaultSheet: GoogleAppsScript.Spreadsheet.Sheet | null;

  constructor(private readonly spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.id = spreadsheet.getId();
    this.defaultSheet = spreadsheet.getSheets()[0] ?? null;
  }

  addSheet(name: string, headerRow: string[]): void {
    const sheet = this.spreadsheet.insertSheet(name);
    if (headerRow.length > 0) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    }
    // Drop the spreadsheet's auto-created placeholder sheet once a real one exists, so the
    // final spreadsheet contains only the intended `TABLE.*` sheets.
    if (this.defaultSheet !== null) {
      this.spreadsheet.deleteSheet(this.defaultSheet);
      this.defaultSheet = null;
    }
  }

  appendRow(sheetName: string, row: Record<string, unknown>): void {
    const sheet = this.spreadsheet.getSheetByName(sheetName);
    if (sheet === null) {
      throw new Error(`Sheet "${sheetName}" non trovato nello spreadsheet "${this.spreadsheet.getName()}".`);
    }
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] ?? [];
    const values = headerRow.map((header) => row[String(header)] ?? '');
    sheet.appendRow(values);
  }

  getUrl(): string {
    return this.spreadsheet.getUrl();
  }
}
