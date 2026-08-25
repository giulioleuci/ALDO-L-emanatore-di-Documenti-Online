import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';

/**
 * `GasOnlineTestFramework.testContext.buildSampleSpreadsheet`-backed implementation of
 * {@link ISampleSpreadsheetFactory}. The reuse-by-name persistence and the generic
 * add-sheet/append-row(s)/reset mechanics now live in `GasOnlineTestFramework.SampleSpreadsheetBuilder`
 * (ref analysis_2_bypass_and_reimplementations.md §1b) — this class is a thin ALDO-side adapter to
 * the {@link ISampleSpreadsheetFactory} port, with no direct `SpreadsheetApp`/`Sheet` API calls.
 */
export class GasSampleSpreadsheetFactory implements ISampleSpreadsheetFactory {
  constructor(private readonly rootFolder: unknown = null) {}

  createSpreadsheet(name: string): ISampleSpreadsheet {
    return testContext.buildSampleSpreadsheet(name, this.rootFolder);
  }

  openExistingSpreadsheet(spreadsheetId: string): ISampleSpreadsheet {
    return testContext.buildSampleSpreadsheetById(spreadsheetId);
  }
}
