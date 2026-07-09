export interface TablePlaceholder {
  /** The literal `{{TABELLA:<sheetFileId>}}` text, so it can be located and removed. */
  marker: string;
  sheetFileId: string;
}

export interface IDocumentTableFacade {
  /** Scans the doc for `{{TABELLA:<sheetFileId>}}` markers (10 §9). */
  findTablePlaceholders(fileId: string): TablePlaceholder[];
  /** Strips the literal marker text before generic `{{...}}` substitution runs, so it isn't mistaken for a CDU path. */
  removeText(fileId: string, marker: string): void;
  /**
   * Appends a table at the END of the document body. The vendored
   * DocumentTableManager only exposes `body.appendTable()` (no positional
   * insertion at a specific index/placeholder location) — see
   * `_createTableWithStandardAPI` in GoogleApiWrapper. Tables therefore land
   * after all body content, in placeholder-scan order, not literally where
   * the `{{TABELLA:...}}` marker sat.
   */
  appendTable(fileId: string, data: string[][], options?: { headerRow?: boolean }): void;
}

const TABELLA_PATTERN = /\{\{TABELLA:([^}]+)\}\}/g;

/** Real DocumentService-backed facade (10 §9, 08 §3.4) — see IDocumentTableFacade for the capability limits this composes around. */
export class DocumentTableFacade implements IDocumentTableFacade {
  constructor(private readonly documents: DocumentService) {}

  findTablePlaceholders(fileId: string): TablePlaceholder[] {
    const scan = this.documents.scanDocumentStructure(fileId, ['{{TABELLA:']);
    const out: TablePlaceholder[] = [];
    for (const match of scan.textMatches) {
      TABELLA_PATTERN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TABELLA_PATTERN.exec(match.text)) !== null) {
        out.push({ marker: m[0], sheetFileId: m[1]! });
      }
    }
    return out;
  }

  removeText(fileId: string, marker: string): void {
    const result = this.documents.document(fileId).replaceText(marker, '').execute();
    if (!result.success) throw new Error(`DocumentTableFacade.removeText(${fileId}): ${String(result.error)}`);
  }

  appendTable(fileId: string, data: string[][], options: { headerRow?: boolean } = {}): void {
    if (data.length === 0) return;
    const result = this.documents.document(fileId).createTable(data, options).execute();
    if (!result.success) throw new Error(`DocumentTableFacade.appendTable(${fileId}): ${String(result.error)}`);
  }
}
