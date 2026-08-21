import { DocumentoGenericoGeneratorStrategy } from './DocumentoGenericoGeneratorStrategy';
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
 * unfindable for positional insertion. Its DocumentApp model is then flushed
 * before marker removal and generic rendering issue Docs-API writes.
 */
export class DocumentoConTabelleImportateGeneratorStrategy extends DocumentoGenericoGeneratorStrategy {
  private readonly sheetReader: SheetByIdStrategy;

  constructor(
    templates: ITemplateEngine,
    sheets: SpreadsheetService,
    private readonly tables: IDocumentTableFacade,
    logger: LoggerService = new LoggerService()
  ) {
    super(templates);
    this.sheetReader = new SheetByIdStrategy(logger, sheets);
  }

  override render(fileId: string, cdu: Cdu): void {
    const placeholders = this.tables.findTablePlaceholders(fileId);
    const inserted: string[] = [];
    for (const placeholder of placeholders) {
      const data = this.readSheetAsStrings(placeholder.sheetFileId);
      if (data.length > 1) {
        this.tables.insertTableAtMarker(fileId, placeholder.marker, data, { headerRow: true });
        inserted.push(placeholder.marker);
      }
    }
    // insertTableAtMarker writes through DocumentApp and never saves; removeText and
    // the generic pass below write through the Docs API. Flush here or the DocumentApp
    // model auto-saves last and reverts both of them (2026-08-21 batch 1 failure).
    if (inserted.length > 0) this.tables.flush(fileId);
    for (const placeholder of placeholders) {
      this.tables.removeText(fileId, placeholder.marker);
    }
    super.render(fileId, cdu);
  }

  /**
   * Every non-blank row of the sheet's first tab, cells coerced to strings
   * (Docs tables are text-only). Range resolution (tab, full-sheet extent from
   * gridProperties) is shared with `CustomSourceStrategies.ts` via
   * `SheetByIdStrategy.extractRaw()` (ref REPORT_GLF.md A4/B6) instead of being
   * re-derived here. A referenced sheet with no accessible tabs is not an
   * error for this marker — the placeholder is simply removed with no table
   * inserted (mirrors the pre-extractRaw behavior of `getSheetInfo()[0] === undefined`).
   */
  private readSheetAsStrings(sheetFileId: string): string[][] {
    let values: unknown[][];
    try {
      values = this.sheetReader.extractRaw({ sheetId: sheetFileId });
    } catch (error) {
      if (error instanceof SourceError && error.code === 'NO_SHEETS_FOUND') return [];
      throw error;
    }
    return values
      .map((row) => row.map(cellToString))
      .filter((row) => row.some((cell) => cell.trim() !== ''));
  }
}
