import type { Mock, MockedFunction } from 'jest-mock';
import type { RowRecord, RowIndices, TableLogger, QueryCacheService, GoogleRetryExecutor } from '../types.js';
/**
 * @file SheetDBLib/src/testing/mocks.js
 * @description Centralized high-fidelity mocks for SheetDBLib services.
 * @version 1.0.0
 */
import { TableService } from '../TableService.js';
import { AdvancedQueryBuilder } from '../query/AdvancedQueryBuilder.js';
/**
 * @class TableServiceMock
 * @description Mock implementation of TableService for unit testing CRUD logic.
 * Manages an internal array of records and simulates primary key generation and indexing.
 */
export declare class TableServiceMock<Row extends object = RowRecord> {
    name: string;
    _data: Row[];
    fuzzySearchRows: TableService['fuzzySearchRows'];
    insertRow: Mock<(row: Row) => Row>;
    insertRows: Mock<(rows: Row[]) => Row[]>;
    updateRow: Mock<(id: unknown, row: Partial<Row>) => Partial<Row>>;
    updateRowById: TableServiceMock<Row>['updateRow'];
    patchRow: Mock<(id: unknown, partial: Partial<Row>) => Partial<Row>>;
    deleteRow: Mock<(id: unknown) => Row | null>;
    deleteRowById: TableServiceMock<Row>['deleteRow'];
    findById: Mock<(id: unknown) => Row | null>;
    getRowById: TableServiceMock<Row>['findById'];
    _rowsCache: Row[];
    _ensureDataLoaded: () => void;
    getByPK: TableServiceMock<Row>['findById'];
    findAll: Mock<() => Row[]>;
    getAllRows: TableServiceMock<Row>['findAll'];
    getRow: Mock<(index: number) => Row | null>;
    getRows: Mock<(start?: number, limit?: number) => Row[]>;
    getRowsWhere: Mock<(predicate: (row: Row) => boolean) => Row[]>;
    upsertRow: Mock<(row: Row) => Partial<Row>>;
    clear: Mock<() => this>;
    deleteAllRows: Mock<() => boolean>;
    getName: Mock<() => string>;
    getSchema: Mock<() => {
        fields: unknown[];
    }>;
    count: Mock<() => number>;
    _indices: RowIndices;
    /**
     * @param {string} [name='TestTable'] - Logical table name.
     */
    constructor(name?: string);
    /**
     * @description Pre-populates the mock table with a collection of records.
     * @param {Object[]} data - Records to load into memory.
     * @returns {TableServiceMock} Current instance for chaining.
     */
    setData(data: Row[]): this;
}
/**
 * @class DatabaseServiceMock
 * @description High-fidelity mock for DatabaseService.
 * Orchestrates TableServiceMock instances and provides a unified interface for mocking database-wide operations.
 */
export declare class DatabaseServiceMock<Row extends object = RowRecord> {
    _logger: TableLogger | null;
    _utils: object | null;
    _cache: QueryCacheService | null;
    _exceptionService: GoogleRetryExecutor | null;
    _builder: AdvancedQueryBuilder<Row>;
    tables: Record<string, TableServiceMock<Row>>;
    select: Mock<(fields?: string | string[]) => AdvancedQueryBuilder<Row>>;
    getTable: Mock<(name: string) => TableServiceMock<Row>>;
    createTable: Mock<(name: string) => TableServiceMock<Row>>;
    deleteTable: Mock<(...args: unknown[]) => this>;
    listTables: Mock<() => string[]>;
    transaction: MockedFunction<(<T>(fn: () => T) => T)>;
    flush: Mock<() => this>;
    save: Mock<() => this>;
    getSpreadsheetId: Mock<() => string>;
    /**
     * @param {Object} [logger=null] - Mock logger.
     * @param {Object} [utils=null] - Mock CoreUtilsLib.
     * @param {Object} [cache=null] - Mock CacheService.
     * @param {Object} [exceptionService=null] - Mock GasResilienceLib.
     */
    constructor(logger?: TableLogger | null, utils?: object | null, cache?: QueryCacheService | null, exceptionService?: GoogleRetryExecutor | null);
    /**
     * @description Manually registers a TableServiceMock for specific lookup tests.
     * @param {string} name - Logical table identifier.
     * @param {TableServiceMock} [mock] - Custom mock instance or auto-generated if omitted.
     * @returns {TableServiceMock} The registered table mock.
     */
    registerTable(name: string, mock?: TableServiceMock<Row>): TableServiceMock<Row>;
}
