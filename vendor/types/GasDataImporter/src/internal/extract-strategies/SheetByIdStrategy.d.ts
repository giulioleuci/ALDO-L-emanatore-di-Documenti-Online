import type { ImportRow, ImporterLogger, SourceOptions, SourceCursor, ImporterSheets } from '../../types.js';
/**
 * @fileoverview Source strategy for extracting data from a Google Sheet by ID
 * @author GasLibraryFactory
 */
import { SourceStrategy } from './SourceStrategy.js';
/**
 * Extraction strategy for retrieving data from a specific Google Sheets document using its ID, supporting targeted tab and range selection.
 * @class
 * @extends SourceStrategy
 */
declare class SheetByIdStrategy extends SourceStrategy {
    _spreadsheetService: ImporterSheets;
    /**
     * Initializes sheet extraction strategy with Spreadsheet service facade.
     * @param {Object} logger Diagnostic output interface.
     * @param {Object} spreadsheetService GoogleApiWrapper SpreadsheetService for data access.
     */
    constructor(logger: ImporterLogger, spreadsheetService: ImporterSheets);
    /**
     * Implements single-document extraction logic, resolving metadata and fetching cell values via SpreadsheetService.
     * @protected
     * @param {Object} config Extraction parameters.
     * @param {string} config.sheetId physical spreadsheet identifier.
     * @param {string} [config.tabName] Target tab identifier (defaults to first).
     * @param {string} [config.range=''] A1 notation or empty for full sheet.
     * @param {boolean} [config.hasHeaders=true] If true, treats first row as property keys.
     * @returns {Array<Object>} Hydrated row objects from the sheet.
     * @throws {SourceError} If document is inaccessible, has no sheets, or target tab is missing.
     */
    _extractData(config: SourceOptions): ImportRow[];
    /**
     * Extracts the raw grid (no header-object mapping) for callers that need
     * `string[][]`-shaped data rather than import-recipe row objects — e.g.
     * inserting a data-driven table into a Google Doc (ref REPORT_GLF.md B6).
     * Shares the same sheet/tab/range resolution as `extract()`, so both use
     * cases stay in sync with a single implementation.
     * @param {Object} config Extraction parameters (see `_extractData`).
     * @returns {Array<Array<*>>} Raw grid values, header row included if present.
     * @throws {SourceError} If document is inaccessible, has no sheets, or target tab is missing.
     */
    extractRaw(config: SourceOptions): unknown[][];
    /**
     * Indicates that this strategy can paginate extraction via `extractChunk`.
     * @returns {boolean} Always true for `SheetByIdStrategy`.
     */
    supportsCursor(): boolean;
    /**
     * Extracts a single bounded window of rows from the sheet, starting at
     * `cursor.rowOffset` data rows past the header (if any), for incremental
     * import runs that must checkpoint mid-recipe. Shares tab/header
     * resolution semantics with `_resolveValues`/`_extractData`, but issues a
     * narrower `getRanges` call per chunk instead of reading the whole sheet.
     * @param {Object} config Extraction parameters (see `_extractData`).
     * @param {Object} cursor Opaque cursor from a previous `extractChunk` call,
     *   or `{ rowOffset: 0, headers: null }` to start from the beginning.
     * @param {number} cursor.rowOffset Number of data rows already consumed.
     * @param {Array<string>|null} cursor.headers Header row, cached after the
     *   first chunk so subsequent chunks don't re-fetch it.
     * @param {number} maxRows Maximum number of data rows to extract in this chunk.
     * @returns {{rows: Array<Object>, nextCursor: Object, exhausted: boolean}} Chunk result.
     * @throws {SourceError} If document is inaccessible, has no sheets, or target tab is missing.
     */
    extractChunk(config: SourceOptions, cursor: SourceCursor, maxRows: number): {
        rows: never[];
        nextCursor: {
            rowOffset: number;
            headers: unknown[] | null;
        };
        exhausted: boolean;
    } | {
        rows: ImportRow[];
        nextCursor: {
            rowOffset: number;
            headers: unknown[];
        };
        exhausted: boolean;
    };
    /**
     * Parses an explicit A1-notation range's row/column bounds so
     * `extractChunk` can clamp its pagination window to the same rectangle
     * `_resolveValues` would fetch for the same `config.range`, instead of
     * always paginating the whole sheet grid.
     * @private
     * @param {string} range A1 notation, with or without a leading `Sheet!` prefix.
     * @returns {{startCol: number, startRow: number, endCol: number, endRow: number}|null}
     *   Parsed 1-based bounds, or `null` if the range isn't a full `A1:B2`-style
     *   rectangle (falls back to full-grid pagination in that case).
     */
    _parseRangeBounds(range: string): {
        startCol: number;
        startRow: number;
        endCol: number;
        endRow: number;
    } | null;
    /**
     * Converts an A1-notation column letter (or letters) into its 1-based
     * column index ('A' -> 1, 'AA' -> 27). Inverse of `_columnToLetter`.
     * @private
     * @param {string} letters Column letter(s).
     * @returns {number} 1-based column index.
     */
    _letterToColumn(letters: string): number;
    /**
     * Resolves the target tab/range and fetches the raw grid via
     * SpreadsheetService, shared by `_extractData` (import recipes) and
     * `extractRaw` (raw grid consumers).
     * @private
     * @param {Object} config Extraction parameters (see `_extractData`).
     * @returns {Array<Array<*>>} Raw grid values (possibly empty).
     * @throws {SourceError} If document is inaccessible, has no sheets, or target tab is missing.
     */
    _resolveValues(config: SourceOptions): unknown[][];
}
export { SheetByIdStrategy };
