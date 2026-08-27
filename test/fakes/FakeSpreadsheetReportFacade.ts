import type { ISpreadsheetReportFacade } from '../../src/infrastructure/facades/SpreadsheetReportFacade';

export class FakeSpreadsheetReportFacade implements ISpreadsheetReportFacade {
  public readonly reports: Array<{ nome: string; folderId: string; righe: string[][] }> = [];

  creaReport(nome: string, folderId: string, righe: string[][]): string {
    this.reports.push({ nome, folderId, righe });
    return `report_${this.reports.length}`;
  }
}
