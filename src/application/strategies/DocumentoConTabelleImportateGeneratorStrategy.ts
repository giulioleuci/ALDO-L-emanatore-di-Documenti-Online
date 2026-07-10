import { DocumentoGenericoGeneratorStrategy } from './DocumentoGenericoGeneratorStrategy';
import { columnIndexToLetters } from './SheetMaterieGeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IDocumentTableFacade } from '../../infrastructure/facades/DocumentTableFacade';

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  return '';
}

/**
 * DOCUMENTO_CON_TABELLE_IMPORTATE generator (10 §9): extends
 * DocumentoGenericoGeneratorStrategy. Before the generic `{{...}}`
 * substitution runs, finds every `{{TABELLA:<sheetFileId>}}` marker, reads
 * the referenced Sheet's first tab in full, and inserts it as a table
 * exactly where that marker sat (`insertTableAtMarker`), then strips the
 * marker text so it isn't mistaken for a CDU path by the generic pass (a
 * stripped marker resolves to nothing rather than an empty-string
 * artifact). Insertion happens BEFORE marker removal: `insertTableAtMarker`
 * locates the marker via `findText`, so removing it first would make it
 * unfindable for positional insertion.
 */
export class DocumentoConTabelleImportateGeneratorStrategy extends DocumentoGenericoGeneratorStrategy {
  constructor(
    templates: ITemplateEngine,
    private readonly sheets: SpreadsheetService,
    private readonly tables: IDocumentTableFacade
  ) {
    super(templates);
  }

  override render(fileId: string, cdu: Cdu): void {
    for (const placeholder of this.tables.findTablePlaceholders(fileId)) {
      const data = this.readSheetAsStrings(placeholder.sheetFileId);
      if (data.length > 0) {
        this.tables.insertTableAtMarker(fileId, placeholder.marker, data, { headerRow: true });
      }
      this.tables.removeText(fileId, placeholder.marker);
    }
    super.render(fileId, cdu);
  }

  /** Every non-blank row of the sheet's first tab, cells coerced to strings (Docs tables are text-only). */
  private readSheetAsStrings(sheetFileId: string): string[][] {
    const info = this.sheets.getSheetInfo(sheetFileId)[0];
    if (info === undefined) return [];
    const rowCount = info.gridProperties.rowCount ?? 1000;
    const colCount = info.gridProperties.columnCount ?? 26;
    const values = this.sheets.getRanges(sheetFileId, `${info.name}!A1:${columnIndexToLetters(colCount - 1)}${rowCount}`);
    return values.filter((row) => row.some((cell) => cellToString(cell).trim() !== '')).map((row) => row.map(cellToString));
  }
}
