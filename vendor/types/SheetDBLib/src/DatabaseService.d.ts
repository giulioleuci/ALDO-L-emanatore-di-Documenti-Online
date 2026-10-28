import type { DatabaseOptions, WriteOptions, RowRecord, DatabaseUtilities, GoogleLogger, GoogleCache, GoogleRetryExecutor, RowValidator } from './types.js';
import { SpreadsheetService } from '@GoogleApiWrapper';
import { TableService } from './TableService.js';
import { AdvancedQueryBuilder } from './query/AdvancedQueryBuilder.js';
export declare class DatabaseService {
    _spreadsheetId: string;
    _logger: GoogleLogger;
    _utils: DatabaseUtilities;
    _cache: GoogleCache;
    _exceptionService: GoogleRetryExecutor | null;
    _spreadsheetService: SpreadsheetService & {
        _batchUpdates?: unknown[];
    };
    tables: Record<string, TableService>;
    _loaded: boolean;
    _transaction: {
        startTime: number;
        savedStates: Record<string, object[] | null> | null;
        operations: unknown[];
    } | null;
    _inTransaction: boolean;
    _dryRun: boolean;
    _schemaValidator: RowValidator | null;
    _verifyTables: string[] | null;
    constructor(spreadsheetId: string, logger: GoogleLogger, utils: DatabaseUtilities, cache: GoogleCache, exceptionService?: GoogleRetryExecutor | null, options?: DatabaseOptions);
    save(options?: WriteOptions): this | {
        success: boolean;
        pendingChanges: {
            table: string;
            updates: number;
            inserts: number;
            deletes: number;
        }[];
        dryRun: boolean;
    };
    beginTransaction(): this;
    commit(): this;
    rollback(): this;
    _performRollback(): void;
    inTransaction(): boolean;
    /**
     * Reads sheet metadata via the Advanced Sheets API, retrying (bounded, with a short
     * pause between attempts) when `this._verifyTables` names aren't all present yet.
     * `SpreadsheetApp.flush()` only guarantees `SpreadsheetApp`-view consistency — the
     * Advanced Sheets API (`Sheets.Spreadsheets.get`, what `getSheetInfo` calls) is a
     * separate REST-backed read path that can briefly lag a structural write (new/renamed
     * sheet) even after flush(). Costs nothing extra when the caller doesn't opt in, or
     * when the first read already satisfies it.
     */
    _readVerifiedSheetInfo(): {
        name: string | undefined;
        sheetId: number | undefined;
        index: number | undefined;
        hidden: boolean;
        gridProperties: GoogleAppsScript.Sheets.Schema.GridProperties;
    }[];
    _allTablesVisible(sheets: {
        name?: string;
    }[], expectedNames: string[]): boolean;
    _initialize(): void;
    getTable<Row extends object = RowRecord>(tableName: string): TableService<Row> | null;
    hasTable(tableName: string): boolean;
    listTables(): string[];
    _isDryRun(options?: WriteOptions): boolean;
    getMetadata(): {
        spreadsheetId: string;
        loaded: boolean;
        inTransaction: boolean;
        dryRun: boolean;
        tableCount: number;
    };
    select<Result extends object = RowRecord>(fields?: string | string[]): AdvancedQueryBuilder<Result>;
}
/** @deprecated nome storico, rimosso alla prossima release. */
export { DatabaseService as MyDatabaseService };
