import type {
  E2eDocumentTable,
  IArtifactFactory,
  SheetValueUpdate
} from './E2eTemplateProvisioner';
import { DomainError } from '../domain/errors/DomainError';

/**
 * Real `DocumentService.createDocument`/`SpreadsheetService.createSpreadsheet`-backed
 * implementation of {@link IArtifactFactory} (design spec: "no GLF gap, just new
 * ALDO-side usage of an already-documented capability", `GoogleApiWrapper_docs.md`
 * "Creazione di un Google Doc o Google Sheet vuoto"). The only caller of these two
 * create-from-scratch primitives in ALDO — production code only ever copies templates.
 */
export class GasArtifactFactory implements IArtifactFactory {
  constructor(
    private readonly documents: DocumentService,
    private readonly spreadsheets: SpreadsheetService
  ) {}

  createDocument(
    name: string,
    folderId: string,
    paragraphs: string[] = [],
    tables: E2eDocumentTable[] = []
  ): string {
    const { documentId, builder } = this.documents.createDocument(name, {
      destinationFolder: folderId
    });
    for (const paragraph of paragraphs) builder.appendParagraph(paragraph);
    for (const table of tables) builder.createTable(table.data, table.options);

    if (paragraphs.length > 0 || tables.length > 0) {
      const result = builder.execute();
      if (!result.success) {
        throw new DomainError(
          `Creazione contenuto documento E2E fallita: ${String(result.error)}`
        );
      }
    }
    return documentId;
  }

  createSheet(name: string, folderId: string, updates: SheetValueUpdate[] = []): string {
    const spreadsheet = this.spreadsheets.createSpreadsheet(name, { destinationFolder: folderId });
    if (updates.length === 0) return spreadsheet.spreadsheetId;
    // `sheets[0]` is the create call's own auto-generated default tab (real API response —
    // ref types/gaslibs/index.d.ts `createSpreadsheet` doc — not a second, racy schema read).
    const defaultSheetName = spreadsheet.sheets?.[0]?.properties.title ?? 'Sheet1';
    const escapedSheetName = defaultSheetName.replace(/'/g, "''");
    const qualified = updates.map((update) => ({
      range: `'${escapedSheetName}'!${update.range}`,
      values: update.values
    }));
    this.spreadsheets.updateRanges(spreadsheet.spreadsheetId, qualified);
    return spreadsheet.spreadsheetId;
  }
}
