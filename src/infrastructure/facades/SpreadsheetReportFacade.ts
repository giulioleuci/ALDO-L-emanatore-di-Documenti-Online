/**
 * Report-writing port (Feature 2): creates a standalone spreadsheet in a Drive
 * folder and fills its default tab. Wraps GoogleApiWrapper's SpreadsheetService
 * (createSpreadsheet + updateRanges) behind an ALDO-owned interface — the same
 * pattern the online-test GasArtifactFactory already uses, lifted into
 * production infrastructure.
 */
export interface ISpreadsheetReportFacade {
  /** Creates `nome` inside `folderId`, writes `righe` starting at A1, returns the spreadsheet id. */
  creaReport(nome: string, folderId: string, righe: string[][]): string;
}

export class SpreadsheetReportFacade implements ISpreadsheetReportFacade {
  constructor(private readonly spreadsheets: SpreadsheetService) {}

  creaReport(nome: string, folderId: string, righe: string[][]): string {
    const created = this.spreadsheets.createSpreadsheet(nome, { destinationFolder: folderId });
    if (righe.length === 0) return created.spreadsheetId;
    // `sheets[0].properties.title` comes from the create response itself (its
    // name is locale-dependent: "Foglio1" vs "Sheet1"), so no extra read.
    const sheetName = created.sheets?.[0]?.properties.title ?? 'Sheet1';
    const escaped = sheetName.replace(/'/g, "''");
    this.spreadsheets.updateRanges(created.spreadsheetId, {
      range: `'${escaped}'!A1`,
      values: righe
    });
    return created.spreadsheetId;
  }
}
