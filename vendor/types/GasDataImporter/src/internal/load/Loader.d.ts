import type { ImportRow, ImporterLogger, LoadConfig, UpdateIfNewer, ImportDatabase, ImportTable, LoadResult } from '../../types.js';
/**
 * Persistence engine for the ETL pipeline, managing data insertion and updates with configurable conflict resolution strategies and performance optimizations.
 * @class
 */
declare class Loader<Row extends object = ImportRow> {
    logger: ImporterLogger;
    _db: ImportDatabase<Row>;
    /**
     * Valid conflict resolution strategies
     *
     * @static
     * @type {string[]}
     */
    static STRATEGIES: string[];
    /**
     * Initializes the loader with persistence and diagnostic dependencies.
     * @param {Object} logger Diagnostic output interface.
     * @param {Object} databaseService SheetDBLib persistence facade.
     */
    constructor(logger: ImporterLogger, databaseService: ImportDatabase<Row>);
    /**
     * Executes the persistence phase, applying conflict resolution and timestamp-based update rules to the provided data collection.
     * @param {Array<Object>} data Transformed row collection.
     * @param {Object} loadConfig persistence parameters.
     * @param {string} loadConfig.targetTable Destination table identifier.
     * @param {string} loadConfig.conflictResolution resolution strategy (INSERT_ONLY|UPDATE_ONLY|UPSERT|OVERWRITE).
     * @param {string} [loadConfig.conflictKey] Attribute used for collision detection.
     * @param {Object} [loadConfig.updateIfNewer] Optional timestamp comparison rules.
     * @returns {Object} Operational statistics.
     * @throws {LoadError} If database is inaccessible or strategy execution fails.
     */
    load(data: Row[], loadConfig: LoadConfig<Row>): LoadResult;
    /**
     * Executes a single load chunk for a resumable/checkpointed import run.
     * Reuses the exact same conflict-resolution strategies as {@link Loader#load}
     * (INSERT_ONLY/UPDATE_ONLY/UPSERT are naturally idempotent if the same chunk
     * is re-applied after a resume), except OVERWRITE, whose destructive purge
     * only runs on `isFirstChunk` — subsequent chunks within the same run append
     * **unconditionally** (no conflict-key dedupe), matching {@link
     * Loader#_overwrite}'s single-shot semantics exactly: `load()` with
     * OVERWRITE inserts every row unconditionally in one call, so a chunked
     * OVERWRITE run must insert every row across all its chunks unconditionally
     * too, not silently drop rows that share (or omit) a conflict-key value
     * with a row from an earlier chunk. Always commits via `this._db.save()`
     * at the end, which is the durable checkpoint boundary a resumed run picks
     * up from.
     * @param {Array<Object>} data Transformed row collection for this chunk only.
     * @param {Object} loadConfig persistence parameters (see {@link Loader#load}).
     * @param {Object} state Chunk-position metadata.
     * @param {boolean} state.isFirstChunk True for the first LOAD chunk of a run.
     * @returns {Object} Operational statistics for this chunk.
     * @throws {LoadError} If database is inaccessible or strategy execution fails.
     */
    loadChunk(data: Row[], loadConfig: LoadConfig<Row>, { isFirstChunk }: {
        isFirstChunk: boolean;
    }): LoadResult;
    /**
     * Dispatches the conflict-resolution strategy, returning zeroed statistics
     * for empty data. Shared by {@link Loader#load} and {@link Loader#loadChunk}.
     * @private
     * @param {Object} table Target persistence table.
     * @param {Array<Object>} data Records to process (may be empty).
     * @param {string} strategy Resolution strategy (INSERT_ONLY|UPDATE_ONLY|UPSERT|OVERWRITE).
     * @param {string} conflictKey Attribute used for collision detection.
     * @param {Object} updateIfNewer Optional timestamp comparison rules.
     * @param {Function} overwriteHandler OVERWRITE implementation: `_overwrite`
     *   for a single-shot load or the first chunk of a chunked run, `_appendAll`
     *   for later chunks (see {@link Loader#_appendAll}).
     * @returns {Object} Operational statistics.
     * @throws {LoadError} If the strategy is unknown.
     */
    _executeStrategy(table: ImportTable<Row>, data: Row[], strategy: string, conflictKey: string | undefined, updateIfNewer: UpdateIfNewer<Row>, overwriteHandler: (table: ImportTable<Row>, data: Row[], conflictKey?: string) => LoadResult): LoadResult;
    /**
     * Strategy to exclusively add new records while ignoring existing collisions.
     * @private
     * @param {Object} table target persistence table.
     * @param {Array<Object>} data Records to evaluate.
     * @param {string} conflictKey Attribute for collision detection.
     * @returns {Object} statistics.
     */
    _insertOnly(table: ImportTable<Row>, data: Row[], conflictKey: string | undefined): {
        success: boolean;
        inserted: number;
        updated: number;
        skipped: number;
        deleted: number;
        total: number;
    };
    /**
     * Strategy to refresh existing records while ignoring new entries.
     * @private
     * @param {Object} table target persistence table.
     * @param {Array<Object>} data Records to evaluate.
     * @param {string} conflictKey Attribute for record matching.
     * @param {Object} updateIfNewer Timestamp comparison configuration.
     * @returns {Object} statistics.
     */
    _updateOnly(table: ImportTable<Row>, data: Row[], conflictKey: string | undefined, updateIfNewer: UpdateIfNewer<Row>): {
        success: boolean;
        inserted: number;
        updated: number;
        skipped: number;
        deleted: number;
        total: number;
    };
    /**
     * Strategy to synchronize data by updating existing matches and inserting new entries.
     * @private
     * @param {Object} table target persistence table.
     * @param {Array<Object>} data Records to evaluate.
     * @param {string} conflictKey Attribute for matching and detection.
     * @param {Object} updateIfNewer Timestamp comparison configuration.
     * @returns {Object} statistics.
     */
    _upsert(table: ImportTable<Row>, data: Row[], conflictKey: string | undefined, updateIfNewer: UpdateIfNewer<Row>): {
        success: boolean;
        inserted: number;
        updated: number;
        skipped: number;
        deleted: number;
        total: number;
    };
    /**
     * Destructive strategy that purges existing table content before performing bulk insertion.
     * @private
     * @param {Object} table target persistence table.
     * @param {Array<Object>} data Records to insert.
     * @param {string} conflictKey Attribute for row identification.
     * @returns {Object} statistics.
     */
    _overwrite(table: ImportTable<Row>, data: Row[], conflictKey: string | undefined): {
        success: boolean;
        inserted: number;
        updated: number;
        skipped: number;
        deleted: number;
        total: number;
    };
    /**
     * Unconditional bulk-insert with no conflict-key dedupe and no purge —
     * used exclusively for chunks 2+ of a chunked OVERWRITE run (see
     * {@link Loader#loadChunk}). Chunk 1 already purged the table via
     * {@link Loader#_overwrite}; later chunks must simply append every row
     * they carry, the same way `_overwrite` itself inserts everything
     * unconditionally in a single-shot `load()` call. Unlike
     * {@link Loader#_insertOnly}, this never skips a row because its
     * conflict-key value collides with (or is blank/missing like) another
     * row already in the table — that dedupe behavior is correct for
     * INSERT_ONLY's own semantics but wrong here, since it would silently
     * drop legitimate OVERWRITE rows that a single-shot `load()` call would
     * have inserted without question.
     * @private
     * @param {Object} table target persistence table.
     * @param {Array<Object>} data Records to insert unconditionally.
     * @returns {Object} statistics.
     */
    _appendAll(table: ImportTable<Row>, data: Row[]): {
        success: boolean;
        inserted: number;
        updated: number;
        skipped: number;
        deleted: number;
        total: number;
    };
    /**
     * Evaluates if an incoming record possesses a more recent timestamp than the existing persistence state.
     * @private
     * @param {Object} existing current database record.
     * @param {Object} incoming candidate update record.
     * @param {string} timestampColumn Name of the attribute containing temporal metadata.
     * @returns {boolean} True if the update should proceed.
     */
    _shouldUpdate(existing: Row, incoming: Row, timestampColumn: string | undefined): boolean;
    /**
     * Enforces structural requirements for the load configuration block.
     * @private
     * @param {Object} config target configuration segment.
     * @throws {LoadError} If mandatory fields (table, strategy, conflict key) are missing.
     */
    _validateLoadConfig(config: LoadConfig<Row>): void;
}
export { Loader };
