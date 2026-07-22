import type { IArtifactFactory } from './E2eTemplateProvisioner';

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

  createDocument(name: string, folderId: string): string {
    return this.documents.createDocument(name, { destinationFolder: folderId }).documentId;
  }

  createSheet(name: string, folderId: string): string {
    return this.spreadsheets.createSpreadsheet(name, { destinationFolder: folderId }).spreadsheetId;
  }
}
