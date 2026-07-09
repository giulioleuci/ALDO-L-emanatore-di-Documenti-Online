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
 * substitution runs, finds every `{{TABELLA:<sheetFileId>}}` marker, strips
 * it (so it isn't mistaken for a CDU path by the generic pass — a stripped
 * marker resolves to nothing rather than an empty-string artifact), reads
 * the referenced Sheet's first tab in full, and appends it as a table.
 *
 * See `IDocumentTableFacade` for why this *appends* rather than inserting at
 * the marker's exact position: the vendored GoogleApiWrapper
 * `DocumentTableManager` only exposes `body.appendTable()` (no
 * positional/index-based insertion), so with several markers, tables land at
 * the end of the document in placeholder-scan order, not literally where
 * each marker sat.
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
      this.tables.removeText(fileId, placeholder.marker);
      const data = this.readSheetAsStrings(placeholder.sheetFileId);
      this.tables.appendTable(fileId, data, { headerRow: true });
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
