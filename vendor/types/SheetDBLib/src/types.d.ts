import type { SchemaValidator, z } from '@GasSchemaValidatorLib';
import type { GoogleLogger, GoogleCache, GoogleRetryExecutor } from '../../GoogleApiWrapper/src/internal/core/GoogleService.js';
import type { FuseOptionKey, IFuseOptions, FuseResult } from 'fuse.js';
export type RowRecord = Record<string, unknown>;
export interface RowReadOptions {
    preserveEmptyRows?: boolean;
}
export interface WriteOptions {
    dryRun?: boolean;
}
export interface TableUtilities {
    generateUuid(): string;
}
export interface DatabaseUtilities extends TableUtilities {
    sleep(milliseconds: number): void;
}
export type TableLogger = Pick<GoogleLogger, 'debug' | 'warn' | 'error'>;
export type TableSchema = z.ZodType & {
    partial?: () => z.ZodType;
};
export type RowValidator = Pick<SchemaValidator, 'safeValidate'>;
export interface SheetStorage {
    getRanges(spreadsheetId: string, ranges: string, options?: Record<string, unknown>): unknown[][];
    getRanges(spreadsheetId: string, ranges: string[], options?: Record<string, unknown>): Record<string, unknown[][]>;
    updateRanges(spreadsheetId: string, updates: {
        range: string;
        values: unknown[][];
    }[]): unknown;
    appendRows(spreadsheetId: string, data: {
        range: string;
        values: unknown[][];
    }): unknown;
    deleteRows(spreadsheetId: string, sheetName: string, indices: number[]): unknown;
}
export type RowIndices = Record<string, Map<unknown, number[]>>;
export interface FuzzyOptions {
    threshold?: number;
}
export type Condition = {
    field: string;
    type: 'AND' | 'OR';
} & ({
    kind?: undefined;
    operator: string;
    value: unknown;
    query?: never;
    options?: never;
} | {
    kind: 'FUZZY';
    query: string;
    options: Readonly<FuzzyOptions>;
    operator?: never;
    value?: never;
});
export interface JoinConfiguration {
    type: string;
    table: string;
    localField: string;
    operator: string;
    foreignField: string;
}
export interface QueryTable {
    name?: string;
    columns?: string[];
    getRows(): object[];
    _indices: RowIndices;
    _keyField?: string;
    _rowsCache?: object[] | null;
    _ensureDataLoaded(): void;
    getRowById(id: unknown): object | null;
    fuzzySearchRows<T>(rows: T[], query: string, fields: Array<string | FuseOptionKey<T>>, threshold?: number, options?: IFuseOptions<T>): FuseResult<T>[];
}
export interface QueryCacheService extends Pick<GoogleCache, 'get' | 'put'> {
    removeAll?(): unknown;
}
export interface QueryDatabase {
    _logger?: TableLogger | null;
    _utils?: object | null;
    tables?: Record<string, QueryTable>;
    _spreadsheetId?: string;
    _cache?: QueryCacheService | null;
}
export interface DatabaseOptions extends WriteOptions {
    schemaValidator?: RowValidator | null;
    verifyTables?: string[] | null;
}
export type { GoogleLogger, GoogleCache, GoogleRetryExecutor };
