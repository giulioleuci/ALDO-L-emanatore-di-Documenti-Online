export interface TablePlaceholder {
  /** The literal `{{TABELLA:<sheetFileId>}}` text, so it can be located and removed. */
  marker: string;
  sheetFileId: string;
}

export interface DocTablePlaceholder {
  /** The literal `{{TABELLA_DOC:<indice|etichetta>}}` text. */
  marker: string;
  /** Zero-based table index (digits) or the label of the paragraph introducing the table. */
  ref: string;
}

export interface IDocumentTableFacade {
  /** Scans the doc for `{{TABELLA_DOC:<indice|etichetta>}}` markers (tables copied from another Doc). */
  findDocTablePlaceholders(fileId: string): DocTablePlaceholder[];
  /** Reads one table of `sourceDocId`: by zero-based index when `ref` is all digits, else by label. */
  readDocTable(sourceDocId: string, ref: string): string[][];
  /** Scans the doc for `{{TABELLA:<sheetFileId>}}` markers (10 §9). */
  findTablePlaceholders(fileId: string): TablePlaceholder[];
  /** Strips the literal marker text before generic `{{...}}` substitution runs, so it isn't mistaken for a CDU path. */
  removeText(fileId: string, marker: string): void;
  /**
   * Inserts a table immediately after the paragraph containing `marker`, so it lands exactly
   * where the `{{TABELLA:...}}` tag sat rather than at the document's end. Does not remove the
   * marker text itself — call `removeText` afterward.
   */
  insertTableAtMarker(
    fileId: string,
    marker: string,
    data: string[][],
    options?: { headerRow?: boolean }
  ): void;
  /**
   * Saves and closes the DocumentApp model left open by `insertTableAtMarker`
   * (the library never flushes it). Mandatory before any Docs-API write on the
   * same file: otherwise GAS auto-saves the stale model at the end of the
   * execution and silently reverts every batchUpdate edit.
   */
  flush(fileId: string): void;
}

const TABELLA_PATTERN = /\{\{TABELLA:([^}]+)\}\}/g;
const TABELLA_DOC_PATTERN = /\{\{TABELLA_DOC:([^}]+)\}\}/g;

/**
 * Real DocumentService-backed facade (10 §9, 08 §3.4). Positional insertion
 * opens a DocumentApp model, which must be flushed before the following Docs-API
 * marker removals and generic template render pass.
 */
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

  findDocTablePlaceholders(fileId: string): DocTablePlaceholder[] {
    const scan = this.documents.scanDocumentStructure(fileId, ['{{TABELLA_DOC:']);
    const out: DocTablePlaceholder[] = [];
    for (const match of scan.textMatches) {
      for (const m of match.text.matchAll(TABELLA_DOC_PATTERN)) {
        out.push({ marker: m[0], ref: m[1]!.trim() });
      }
    }
    return out;
  }

  readDocTable(sourceDocId: string, ref: string): string[][] {
    const result = /^\d+$/.test(ref)
      ? this.documents.getTableData(sourceDocId, Number(ref))
      : this.documents.getTableDataByLabel(sourceDocId, ref);
    return result.data.map((row) => row.map((cell) => String((cell ?? '') as string | number)));
  }

  removeText(fileId: string, marker: string): void {
    const result = this.documents.document(fileId).replaceText(marker, '').execute();
    if (!result.success)
      throw new Error(`DocumentTableFacade.removeText(${fileId}): ${String(result.error)}`);
  }

  insertTableAtMarker(
    fileId: string,
    marker: string,
    data: string[][],
    options: { headerRow?: boolean } = {}
  ): void {
    if (data.length === 0) return;
    this.documents.insertTableAtMarker(fileId, marker, data, options);
  }

  flush(fileId: string): void {
    const doc = this.documents.openStandard(fileId) as { saveAndClose?: () => void };
    if (typeof doc?.saveAndClose === 'function') doc.saveAndClose();
  }
}
