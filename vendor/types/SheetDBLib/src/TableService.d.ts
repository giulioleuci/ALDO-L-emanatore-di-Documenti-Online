import type { IFuseOptions, FuseOptionKey } from 'fuse.js';
import type { RowRecord, RowReadOptions, WriteOptions, TableUtilities, TableLogger, TableSchema, RowValidator, SheetStorage, RowIndices } from './types.js';
/**
 * @class TableService
 * @description ORM-lite facade for a single Google Sheet. Orchestrates CRUD, validation, computed virtual columns, and write-through caching.
 */
export declare class TableService<Row extends object = RowRecord> {
    sheetName: string;
    spreadsheetId: string;
    spreadsheetService: SheetStorage;
    _logger: TableLogger;
    utils: TableUtilities;
    _manualPrimaryKey: string | null;
    _virtualColumns: Record<string, (row: RowRecord) => unknown>;
    _rowsCache: RowRecord[] | null;
    _dataLoaded: boolean;
    _indices: RowIndices;
    _schema: TableSchema | null;
    _schemaValidationEnabled: boolean;
    _schemaValidator: RowValidator | null;
    _processedRowsCache: RowRecord[] | null;
    _virtualColumnVersion: number;
    _originalRowData: Map<unknown, RowRecord>;
    _insertQueue: RowRecord[];
    _updateQueue: Map<unknown, RowRecord>;
    _deleteQueue: Set<unknown>;
    columns: string[];
    _keyField: string;
    static get ALPHABET_SIZE(): number;
    static get ASCII_CODE_A(): number;
    /**
     * @constructor
     * @param {string} sheetName - Target tab name.
     * @param {string} spreadsheetId - Parent file UUID.
     * @param {SpreadsheetService} spreadsheetService - Injected API wrapper.
     * @param {LoggerService} logger - Injected logging.
     * @param {UtilsService} utils - Provides UUID generation.
     * @param {Array<Array<*>>} [preloadedData=null] - Raw 2D array for Eager Loading.
     * @param {SchemaValidator} [schemaValidator=null] - Pre-instantiated GasSchemaValidatorLib validator.
     */
    constructor(sheetName: string, spreadsheetId: string, spreadsheetService: SheetStorage, logger: TableLogger, utils: TableUtilities, preloadedData?: unknown[][] | null, schemaValidator?: RowValidator | null);
    /**
     * @function insertRow
     * @description Single row insertion with schema validation.
     * @param {Object} rowObj - Data to insert.
     * @returns {Object|null} The inserted row with generated ID and virtual columns.
     * @throws {Error} On schema violation.
     */
    insertRow(rowObj: Row): Row | null;
    insertRow(rowObj: Partial<Row>): Partial<Row> | null;
    /**
     * @function insertRows
     * @description Batch insertion with UUID generation and write-through cache update.
     * @param {Object[]} rowsArray - Multiple data objects.
     * @returns {Object[]} Processed rows added to the queue.
     * @throws {Error} If validation fails for any row.
     */
    insertRows(rowsArray: Row[]): Row[];
    insertRows(rowsArray: Partial<Row>[]): Partial<Row>[];
    /**
     * @function updateRowById
     * @description Performs full row update with dirty checking. Skips if data is identical.
     * @param {string|number} id - PK of target row.
     * @param {Object} rowObj - New data state.
     * @returns {Object} The updated row.
     * @throws {OperationError} If ID not found.
     * @throws {Error} On schema violation.
     */
    updateRowById(id: unknown, rowObj: Partial<Row>): Row;
    /**
     * @function patchRow
     * @description Partial update focusing only on changed physical columns.
     * @param {string|number} id - PK of target row.
     * @param {Object} partialObj - Subset of row data.
     * @returns {Object} The merged updated row.
     * @throws {OperationError} If ID not found.
     */
    patchRow(id: unknown, partialObj: Partial<Row>): Row;
    /**
     * @function deleteRowById
     * @description Queues row for deletion and purges it from local caches.
     * @param {string|number} id - PK of row to remove.
     * @returns {Object|null} The deleted row object or null if not found.
     * @throws {Error} If queueing fails.
     */
    deleteRowById(id: unknown): Row | null;
    /**
     * @function updateRowsByIds
     * @description Batch patch operation.
     * @param {Object.<string, Object>} updatesObj - ID-to-partial map.
     * @returns {Object[]} Successful updates.
     */
    updateRowsByIds(updatesObj: Record<string, Partial<Row>> | null | undefined): Row[];
    /**
     * @function deleteRowsByIds
     * @description Batch deletion.
     * @param {(string|number)[]} ids - Array of PKs.
     * @returns {Object[]} Successful deletions.
     */
    deleteRowsByIds(ids: unknown[] | null | undefined): Row[];
    setSchema(zodSchema: TableSchema): this;
    disableSchemaValidation(): this;
    enableSchemaValidation(): this;
    /** @private @description Validates a row against the schema. */
    _validateRow(rowObj: object, isUpdate?: boolean): RowRecord;
    /**
     * @function fuzzySearch
     * @description Executes fuzzy match using Fuse.js across specified fields.
     * @param {string} query - Search term.
     * @param {string[]} fields - Columns to inspect.
     * @param {number} [threshold=0.3] - Fuse.js sensitivity (0.0 to 1.0).
     * @param {Object} [options={}] - Fuse.js configuration overrides.
     * @returns {Object[]} Fuse.js result objects (item, refIndex, score).
     * @throws {Error} If query is non-string or fields array is empty.
     */
    fuzzySearch(query: string, fields: Array<string | FuseOptionKey<Row>>, threshold?: number, options?: IFuseOptions<Row>): import("fuse.js").FuseResult<Row>[];
    /**
     * @description Executes fuzzy matching against an already materialized row set.
     * This keeps all Fuse configuration within the table search boundary for callers
     * such as AdvancedQueryBuilder that have already narrowed their candidates.
     * @param {Object[]} rows - Candidate records to search.
     * @param {string} query - Search term.
     * @param {string[]} fields - Candidate fields to inspect.
     * @param {number} [threshold=0.3] - Fuse.js sensitivity (0.0 to 1.0).
     * @param {Object} [options={}] - Fuse.js configuration overrides.
     * @returns {Object[]} Fuse.js result objects (item, refIndex, score).
     */
    fuzzySearchRows<T>(rows: T[], query: string, fields: Array<string | FuseOptionKey<T>>, threshold?: number, options?: IFuseOptions<T>): import("fuse.js").FuseResult<T>[];
    /**
     * @function createIndex
     * @description Builds a Map-based memory index for O(1) lookups on a specific column.
     * @param {string} columnName - Target physical column.
     * @returns {TableService} The instance for chaining.
     * @throws {Error} If columnName is missing from table schema.
     */
    createIndex(columnName: string): this;
    /** @private @description Performs an indexed lookup. */
    _indexedLookup(columnName: string, value: unknown): Row[] | null;
    /**
     * @function invalidateIndex
     * @description Purges memory indices.
     * @param {string|null} [columnName=null] - Specific column ID or null for global purge.
     */
    invalidateIndex(columnName?: string | null): void;
    /**
     * @function getRows
     * @description Retrieves all records as plain objects. Lazy-loads data on first call. Virtual columns are recomputed only if version mismatches.
     * @param {Object} [options={}] Read options.
     * @param {boolean} [options.preserveEmptyRows=false] Read a fresh persisted-sheet snapshot,
     * retaining blank rows as empty objects so array index + 2 is the physical sheet row.
     * This mode excludes virtual columns and pending writes, and does not alter CRUD caches/queues.
     * @returns {Object[]} Cloned array of row objects.
     */
    getRows(options: RowReadOptions & {
        preserveEmptyRows: true;
    }): Partial<Row>[];
    getRows(options?: RowReadOptions & {
        preserveEmptyRows?: false;
    }): Row[];
    getRows(options: RowReadOptions): Partial<Row>[];
    /**
     * Deletes a row from the spreadsheet identified by its primary key.
     *
     * @param {string|number} id - The value of the primary key of the row to delete
     * @returns {boolean} `true` if deletion was successful, `false` otherwise
     *
     * @example
     * const deleted = table.deleteRowById('USER_123');
     * if (deleted) {
     *   console.log('User deleted successfully');
     * }
     */
    /**
     * @function flush
     * @description Synchronizes queued changes (deletes, updates, inserts) to Google Sheets via batch API calls.
     * @param {Object} [options={}] - Options.
     * @param {boolean} [options.dryRun=false] - If true, skips API execution.
     * @returns {number} Count of batch operations performed.
     */
    flush(options?: WriteOptions): number;
    /**
     * @function setPrimaryKey
     * @description Overrides auto-detection of PK column. Re-triggers PK mapping.
     * @param {string} columnName - Target physical column name.
     * @returns {TableService} For chaining.
     */
    setPrimaryKey(columnName: string): this;
    /**
     * @function getKeyField
     * @description Effective primary-key column name (manual override or auto-detected).
     * @returns {string}
     */
    getKeyField(): string;
    /**
     * @function getRowById
     * @description O(1) lookup (if indexed) or O(N) scan for a specific record.
     * @param {string|number} id - PK value.
     * @returns {Object|null} Hydrated row object or null.
     */
    getRowById(id: unknown): Row | null;
    /**
     * @function defineVirtualColumn
     * @description Registers a computed property. Invalidates internal processed cache.
     * @param {string} columnName - Virtual property key.
     * @param {Function} computeFunction - Logic: (row) => any.
     * @returns {TableService} For chaining.
     * @throws {Error} If computeFunction is not a function.
     */
    defineVirtualColumn(columnName: string, computeFunction: (row: Row) => unknown): this;
    /**
     * @function getByPK
     * @alias getRowById
     * @param {*} pkValue - PK value.
     * @returns {Object|null}
     */
    getByPK(pkValue: unknown): Row | null;
    /**
     * @function getAllRows
     * @alias getRows
     * @param {Object} [options={}] Same read options as getRows, including preserveEmptyRows.
     * @returns {Object[]}
     */
    getAllRows(options: RowReadOptions & {
        preserveEmptyRows: true;
    }): Partial<Row>[];
    getAllRows(options?: RowReadOptions & {
        preserveEmptyRows?: false;
    }): Row[];
    getAllRows(options: RowReadOptions): Partial<Row>[];
    /**
     * @function _invalidateInternalCache
     * @description Selectively purges local data, indices, or original state.
     * @param {Object} [options={data: true, indices: true}] - Purge targets.
     * @private
     */
    _invalidateInternalCache(options?: {
        data?: boolean;
        indices?: boolean;
    }): void;
    /**
     * @function _ensureDataLoaded
     * @description Lazy-load trigger. Fetches all rows from range A:ZZ and populates original data cache.
     * @private
     */
    _ensureDataLoaded(): void;
    /**
     * @function _processRawData
     * @description Transformer: 2D API array -> physical columns + row objects with type coercion.
     * @param {any[][]} data - Matrix from Sheets API.
     * @param {Object} [options={}] Read options; preserveEmptyRows retains blank-row positions.
     * @returns {Object} {columns: string[], rows: Object[]}
     * @private
     */
    _processRawData(data: unknown[][] | null | undefined, options?: RowReadOptions): {
        columns: string[];
        rows: {}[];
    };
    /**
     * @function _coerceValue
     * @description Normalizes Sheets API strings into JS primitives (number, boolean).
     * Delegates to CoreUtilsLib's shared CellValueCoercion (dedupe of the
     * duplicate previously kept in sync manually with GasDataImporter).
     * @param {*} value - Raw cell data.
     * @returns {*} Primitive or original string.
     * @private
     */
    _coerceValue(value: unknown): unknown;
    /**
     * @function _storeOriginalRowData
     * @description Dirty checking snapshot. Excludes virtual columns to ensure physical integrity.
     * @param {Object} row - Object to clone into Map.
     * @private
     */
    _storeOriginalRowData(row: RowRecord): void;
    /**
     * @function _findRowIndexById
     * @description Memory-safe search for row index by PK. Uses Map index if available.
     * @param {string|number} id - Target PK.
     * @returns {number} 0-based index or -1.
     * @private
     */
    _findRowIndexById(id: unknown): number;
    /**
     * @function _loadHeader
     * @description On-demand fetch of range A1:ZZ1.
     * @returns {string[]} Sanitized header keys.
     * @throws {Error} If sheet is empty.
     * @private
     */
    _loadHeader(): string[];
    /**
     * @function _determinePrimaryKey
     * @description PK Discovery: manual -> 'ID' -> '*_ID' -> first column.
     * @returns {string} Effective key field name.
     * @private
     */
    _determinePrimaryKey(): string;
    /**
     * @function _applyVirtualColumns
     * @description Enriches a row object with registered computed properties.
     * @param {Object} row - Object to mutate.
     * @returns {Object} Mutated object.
     * @private
     */
    _applyVirtualColumns(row: RowRecord): RowRecord;
    /**
     * @function _convertIndexToColumn
     * @description Utility: 1-based index -> A1 Notation (e.g., 27 -> 'AA').
     * @param {number} index - 1-based column position.
     * @returns {string} Letter code.
     * @private
     */
    _convertIndexToColumn(index: number): string;
    /**
     * @function _getPkColumnLetter
     * @description Resolves A1 letter for the mapped primary key.
     * @returns {string}
     * @throws {Error} If keyField is missing from columns.
     * @private
     */
    _getPkColumnLetter(): string;
}
