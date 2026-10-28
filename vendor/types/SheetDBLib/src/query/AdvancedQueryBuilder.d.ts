import type { RowRecord, QueryDatabase, QueryTable, QueryCacheService, Condition, FuzzyOptions, JoinConfiguration } from '../types.js';
import { QueryAggregation } from '../internal/query-builders/AdvancedQueryParser.js';
import { AdvancedQueryValidator } from '../internal/query-builders/AdvancedQueryValidator.js';
export { QueryAggregation };
export interface CachedQuery {
    dbService?: {
        _spreadsheetId?: string;
    } | null;
    selectedColumns?: unknown;
    tableName?: unknown;
    conditions?: unknown;
    groupByFields?: unknown[];
    orderByFields?: unknown[];
    _limit?: unknown;
    _offset?: unknown;
    joins?: unknown[];
    aggregations?: unknown[];
}
/**
 * @class QueryCache
 * @description Internal TTL-based cache manager for advanced query results.
 * Uses deterministic hashing of query configuration (filters, joins, aggregations) to manage result persistence.
 */
export declare class QueryCache {
    service: QueryCacheService | null;
    prefix: string;
    expiration: number;
    /**
     * @param {Object} service - Cache service implementation (e.g., Apps Script CacheService).
     */
    constructor(service: QueryCacheService | null);
    /**
     * @description Generates a deterministic hash key for a query configuration.
     * @param {Object} query - AdvancedQueryBuilder instance.
     * @returns {string} Hashed cache key.
     * @private
     */
    _generateKey(query: CachedQuery): string;
    /**
     * @description Retrieves cached results for a specific query.
     * @param {Object} query - AdvancedQueryBuilder instance.
     * @returns {Object[]|null} Cached records or null on miss/error.
     */
    get(query: CachedQuery): RowRecord[] | null;
    /**
     * @description Persists query results to the cache with configured TTL.
     * @param {Object} query - AdvancedQueryBuilder instance.
     * @param {Object[]} result - Collection of records to cache.
     * @returns {boolean} True if successfully stored.
     */
    store(query: CachedQuery, result: RowRecord[]): unknown;
    /**
     * @description Invalidates all cached entries (full flush).
     * @returns {boolean} True if flush was successful.
     */
    invalidateTable(tableName?: string): boolean;
}
export declare class AdvancedQueryBuilder<Result extends object = RowRecord> {
    dbService: QueryDatabase;
    selectedColumns: string[];
    tableName: string | null;
    conditions: Condition[];
    groupByFields: string[];
    orderByFields: {
        field: string;
        direction: string;
    }[];
    _limit: number | null;
    _offset: number;
    useCache: boolean;
    aggregations: Array<Pick<QueryAggregation, 'alias'> & {
        calculate(rows: RowRecord[]): number | null;
        function?: string;
        field?: string;
    }>;
    _optimizedField: string | null;
    joins: JoinConfiguration[];
    _validator: AdvancedQueryValidator;
    _cache: QueryCache | null;
    constructor(dbService: QueryDatabase, columns?: string | string[]);
    select(columns?: string | string[]): this;
    from(tableName: string): this;
    join(table: string, localField: string, operator: string, foreignField?: string): this;
    leftJoin(table: string, localField: string, operator: string, foreignField?: string): this;
    rightJoin(table: string, localField: string, operator: string, foreignField?: string): this;
    fullOuterJoin(table: string, localField: string, operator: string, foreignField?: string): this;
    where(field: RowRecord): this;
    where(field: string, operator: string, value: unknown): this;
    orWhere(field: string, operator: string, value: unknown): this;
    or(field: string, operator: string, value: unknown): this;
    andWhere(field: string, operator: string, value: unknown): this;
    and(field: string, operator: string, value: unknown): this;
    whereLike(field: string, pattern: unknown): this;
    whereFuzzy(field: string, query: string, options?: FuzzyOptions): this;
    orWhereFuzzy(field: string, query: string, options?: FuzzyOptions): this;
    whereIn(field: string, values: unknown[]): this;
    groupBy(fields: string | string[]): this;
    sum(field: string, alias?: string | null): this;
    avg(field: string, alias?: string | null): this;
    count(field: string, alias?: string | null): this;
    min(field: string, alias?: string | null): this;
    max(field: string, alias?: string | null): this;
    orderBy(fields: string | string[], direction?: string): this;
    orderByDesc(fields: string | string[]): this;
    limit(limitValue: string | number): this;
    offset(offsetValue: string | number): this;
    paginate(page: string | number, pageSize: string | number): this;
    /**
     * @description Resolves a field value from a row, supporting dotted-path prefixes (e.g., 'Table.Field').
     * @param {Object} row - Data record.
     * @param {string} fieldSpec - Target field identifier or path.
     * @returns {*} Value from the row or undefined.
     * @private
     */
    _extractFieldValue(row: RowRecord, fieldSpec: string): unknown;
    /**
     * @description Internal JOIN dispatcher. Supports LEFT, RIGHT, INNER, and FULL joins.
     * Uses hash-join optimization for equality operators.
     * @param {Object[]} leftRows - Pre-filtered records from the primary table.
     * @param {Object} joinConfig - Join specification (table, type, keys, operator).
     * @returns {Object[]} Merged result set with prefixed keys.
     * @throws {Error} If the target join table is not registered in the DatabaseService.
     * @private
     */
    _performJoin(leftRows: RowRecord[], joinConfig: JoinConfiguration): RowRecord[];
    /**
     * @description Attempts to bypass full table scans by probing Primary Keys or secondary indices.
     * Selects the index with the lowest cardinality for optimized filtering.
     * @param {Object} table - TableService instance to probe.
     * @returns {Object[]|null} Filtered records from index or null if no optimization is viable.
     * @private
     */
    _tryIndexOptimization(table: QueryTable, conditions?: Condition[]): RowRecord[] | null;
    /**
     * @description Returns the subset of query conditions that were not satisfied by index optimization.
     * @returns {Object[]} Collection of pending conditions for full-scan filtering.
     * @private
     */
    _getRemainingConditions(conditions?: Condition[]): Condition[];
    /**
     * @description Low-level field resolution supporting direct keys, table-prefixed keys, and cross-join suffixes.
     * @param {Object} row - Target record.
     * @param {string} field - Field identifier.
     * @returns {*} Resolved value or undefined.
     * @private
     */
    _getFieldValue(row: RowRecord, field: string): unknown;
    /**
     * @description Applies a collection of conditions to a result set using AND/OR logic.
     * @param {Object[]} rows - Collection of records to filter.
     * @param {Object[]} conditions - The conditions to evaluate.
     * @returns {Object[]} Filtered result set.
     * @private
     */
    _applyConditionsFiltered(rows: RowRecord[], conditions: Condition[]): RowRecord[];
    /**
     * Builds one Fuse index per fuzzy condition for the current materialized row set.
     * Results are consumed as membership sets, so filtering retains the source-row
     * ordering already established by the query pipeline (including equal scores).
     *
     * @param {Object[]} rows Materialized candidate rows.
     * @param {Object[]} conditions Conditions to inspect.
     * @returns {Map<number, Set<Object>>} Matches indexed by condition position.
     * @private
     */
    _compileFuzzyMatches(rows: RowRecord[], conditions: Condition[]): Map<number, Set<RowRecord>>;
    /**
     * @description Applies all query conditions to the provided dataset.
     * @param {Object[]} rows - Raw or partially filtered records.
     * @returns {Object[]} Fully filtered result set.
     * @private
     */
    _applyConditions(rows: RowRecord[]): RowRecord[];
    /**
     * @description Partitions the result set into groups and computes configured aggregations.
     * @param {Object[]} rows - Filtered records to be grouped.
     * @returns {Object[]} Aggregated result set (one record per group).
     * @private
     */
    _applyGroupBy(rows: RowRecord[] | null | undefined): RowRecord[];
    _partialSort(rows: RowRecord[], k: number): RowRecord[];
    _createComparator(): (a: RowRecord, b: RowRecord) => number;
    _quickSelect(arr: RowRecord[], left: number, right: number, k: number, comparator: (a: RowRecord, b: RowRecord) => number): void;
    _medianOfThree(arr: RowRecord[], left: number, right: number, comparator: (a: RowRecord, b: RowRecord) => number): number;
    _partition(arr: RowRecord[], left: number, right: number, pivotIndex: number, comparator: (a: RowRecord, b: RowRecord) => number): number;
    execute(): Result[];
    get(): Result[];
    first(): Result | null;
    exists(): boolean;
}
