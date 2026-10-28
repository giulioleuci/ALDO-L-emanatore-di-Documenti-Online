import type { ImportRow, ImporterLogger, SourceOptions, SourceCursor, ExtractedChunk } from '../../types.js';
/**
 * Abstract base class defining the contract for data extraction strategies, providing common lifecycle hooks and data normalization utilities.
 * @abstract
 * @class
 */
declare class SourceStrategy<Row extends object = ImportRow> {
    logger: ImporterLogger;
    /**
     * Initializes abstract strategy with diagnostic logging capabilities.
     * @param {Object} [logger=console] Diagnostic output interface.
     * @throws {TypeError} If attempting to instantiate this abstract class directly.
     */
    constructor(logger?: ImporterLogger);
    /**
     * Public interface method orchestrating the extraction lifecycle, including logging, subclass execution, and result validation.
     * @param {Object} config Source-specific parameters.
     * @returns {Array<Object>} Extracted and normalized data rows.
     * @throws {SourceError} If extraction fails or result is not an array.
     */
    extract(config: SourceOptions): Row[];
    /**
     * Abstract hook for implementing source-specific data retrieval logic.
     * @abstract
     * @protected
     * @param {Object} config Source-specific parameters.
     * @returns {Array<Object>} Collection of raw data rows.
     * @throws {Error} If subclass fails to implement.
     * @throws {SourceError} If retrieval fails.
     */
    _extractData(_config: SourceOptions): unknown;
    /**
     * Indicates whether this strategy can extract data incrementally via
     * `extractChunk` instead of loading the entire source in one `extract()`
     * call. Strategies that don't override this fall back to the
     * "compatibility path" in `ImportPipelineExecutor.runImportChunk`: the
     * first (and only) extraction chunk pulls everything at once.
     * @returns {boolean} True if `extractChunk` is implemented.
     */
    supportsCursor(): boolean;
    /**
     * Extracts a single bounded chunk of rows starting from `cursor`, for
     * strategies that support incremental extraction (see `supportsCursor`).
     * @param {Object} _config Source-specific parameters.
     * @param {*} _cursor Opaque cursor produced by a previous `extractChunk` call.
     * @param {number} _maxRows Maximum number of rows to extract in this chunk.
     * @returns {{rows: Array<Object>, nextCursor: *, exhausted: boolean}} Chunk result.
     * @throws {Error} Always, unless overridden by a cursor-aware subclass.
     */
    extractChunk(_config: SourceOptions, _cursor: SourceCursor | null, _maxRows: number): ExtractedChunk<Row>;
    /**
     * Normalizes 2D grid data into an array of objects, optionally using the first row as property keys.
     * @protected
     * @param {Array<Array>} data 2D data grid.
     * @param {boolean} [hasHeaders=true] If true, uses first row for attribute keys.
     * @returns {Array<Object>} Collection of row objects.
     */
    _arrayToObjects(data: unknown[][] | null | undefined, hasHeaders?: boolean): ImportRow[];
    /**
     * Casts raw string values into their appropriate JavaScript types (Number, Boolean) for domain consistency.
     * Delegates to CoreUtilsLib's shared CellValueCoercion (dedupe of the
     * duplicate previously kept in sync manually with SheetDBLib).
     * @protected
     * @param {*} value Raw cell value.
     * @returns {*} Coerced primitive value.
     */
    _coerceValue(value: unknown): unknown;
    /**
     * Converts a 1-based column index into its A1-notation letter (1 -> 'A', 27 -> 'AA').
     * Shared by strategies that build explicit A1 ranges (FolderStrategy, SheetByIdStrategy).
     * @protected
     * @param {number} column 1-based column index.
     * @returns {string} A1-notation column letter(s).
     */
    _columnToLetter(column: number): string;
    /**
     * Enforces existence of mandatory configuration parameters.
     * @protected
     * @param {Object} config extraction parameters.
     * @param {string[]} requiredFields Collection of mandatory attribute keys.
     * @throws {SourceError} If any mandatory fields are missing.
     */
    _validateConfig(config: Record<string, unknown>, requiredFields: string[]): void;
}
export { SourceStrategy };
