import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';

/**
 * `GasOnlineTestFramework.testContext`-backed implementation of {@link ISampleSpreadsheetFactory}
 * (ref ALDO_GLF_AUDIT_RESULTS.md K-1). `testContext.getOrCreateNamedSpreadsheet` reuses an
 * existing named spreadsheet across online-test runs instead of always minting a new one via bare
 * `SpreadsheetApp.create` — that reuse-by-name capability is exactly what GLF's dedicated online
 * test-harness library provides and ALDO previously hand-rolled without it (leaving a fresh,
 * never-deleted spreadsheet in Drive after every run). `resetSpreadsheet` then strips any
 * leftover sheets from a prior run back to the single default sheet a brand-new spreadsheet would
 * have, so {@link SampleDatabaseBuilder}'s `addSheet` calls always start from the same clean slate.
 *
 * This class plays the same L2-boundary role for `SpreadsheetApp`-adjacent calls that
 * `GoogleApiWrapper` plays for production code — legitimate per the `GasOnlineTestFramework/**`
 * "runs inside real GAS by design" sanctioned exception in `GasLibraryFactory/CLAUDE.md`, mirrored
 * here since `src/onlinetests/**` only ever executes inside a live online-test run, never the
 * production request path — so {@link SampleDatabaseBuilder} itself stays fully unit-testable
 * offline via the `ISampleSpreadsheetFactory` port.
 */
export class GasSampleSpreadsheetFactory implements ISampleSpreadsheetFactory {
  constructor(private readonly rootFolder: unknown = null) {}

  createSpreadsheet(name: string): ISampleSpreadsheet {
    const spreadsheet = testContext.getOrCreateNamedSpreadsheet(name, this.rootFolder) as GoogleAppsScript.Spreadsheet.Spreadsheet;
    testContext.resetSpreadsheet(spreadsheet);
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
