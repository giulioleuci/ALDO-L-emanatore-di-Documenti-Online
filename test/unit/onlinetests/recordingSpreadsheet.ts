import type { ISampleSpreadsheet } from '../../../src/onlinetests/SampleDatabaseBuilder';

/**
 * Shared in-memory `ISampleSpreadsheet` fake for onlinetests-fixture unit tests. Records
 * headers, rows, and the sheet names touched by batched `appendRows` calls (`batches`) so
 * consumers that only care about a subset of that recording can ignore the rest.
 */
export class RecordingSpreadsheet implements ISampleSpreadsheet {
  readonly rows: Record<string, Record<string, unknown>[]> = {};
  readonly headers: Record<string, string[]> = {};
  readonly batches: string[] = [];

  constructor(readonly id: string) {}

  addSheet(name: string, headerRow: string[]): void {
    this.headers[name] = headerRow;
    this.rows[name] = [];
  }

  appendRow(sheetName: string, row: Record<string, unknown>): void {
    (this.rows[sheetName] ??= []).push(row);
  }

  appendRows(sheetName: string, rows: Array<Record<string, unknown>>): void {
    this.batches.push(sheetName);
    (this.rows[sheetName] ??= []).push(...rows);
  }

  getUrl(): string {
    return `https://example.test/${this.id}`;
  }
}
