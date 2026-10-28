import type { LoggerService, UtilsService } from '@CoreUtilsLib';
import type { GoogleRetryExecutor } from '@GoogleApiWrapper/src/internal/core/GoogleService.js';
import type { SourceStrategy } from './internal/extract-strategies/SourceStrategy.js';
export type ImportRow = Record<string, unknown>;
export type ImporterLogger = {
    [Method in 'debug' | 'info' | 'warn' | 'error']: (...args: Parameters<LoggerService[Method]>) => unknown;
};
export type ConflictStrategy = 'INSERT_ONLY' | 'UPDATE_ONLY' | 'UPSERT' | 'OVERWRITE';
export interface UpdateIfNewer<Row extends object = ImportRow> {
    enabled?: boolean;
    timestampColumn?: keyof Row & string;
}
export type LoadConfig<Row extends object = ImportRow> = {
    targetTable: string;
    updateIfNewer?: UpdateIfNewer<Row>;
} & ({
    conflictResolution: 'INSERT_ONLY';
    conflictKey?: keyof Row & string;
} | {
    conflictResolution: 'UPDATE_ONLY' | 'UPSERT' | 'OVERWRITE';
    conflictKey: keyof Row & string;
});
export interface SourceOptions extends ImportRow {
    sheetId?: string;
    folderId?: string;
    hasHeaders?: boolean;
    tabName?: string;
    range?: string;
    mergeData?: boolean;
    includeSourceFile?: boolean;
    fileNamePattern?: string;
}
export interface SourceConfiguration {
    type: string;
    config: SourceOptions;
}
export interface Normalization {
    trim?: boolean;
    dateColumns?: string[];
    dateFormat?: string;
    uppercaseColumns?: string[];
    lowercaseColumns?: string[];
}
export interface TransformConfig {
    mapping?: Record<string, string> | null;
    calculated?: Record<string, string | null | undefined> | null;
    normalization?: Normalization | null;
    validation?: string | string[] | null;
}
export interface ImportRecipe<Row extends object = ImportRow> {
    name: string;
    source: SourceConfiguration;
    transform?: TransformConfig;
    load: LoadConfig<Row>;
}
export interface SourceCursor {
    rowOffset: number;
    headers: unknown[] | null;
}
export interface ImportCounters {
    extracted: number;
    transformed: number;
    inserted: number;
    updated: number;
    skipped: number;
    deleted: number;
}
export interface CheckpointData<Row extends object = ImportRow> {
    recipeName: string;
    stage: 'EXTRACT' | 'LOAD' | 'DONE';
    sourceCursor: SourceCursor | null;
    rowOffset: number;
    loadOffset: number;
    counters: ImportCounters;
    buffer: Row[] | null;
    done: boolean;
}
export interface ExtractedChunk<Row extends object = ImportRow> {
    rows: Row[];
    nextCursor: SourceCursor;
    exhausted: boolean;
}
export interface ImportSheetInfo {
    name?: string;
    gridProperties?: GoogleAppsScript.Sheets.Schema.GridProperties;
    rowCount?: number;
    columnCount?: number;
}
export interface ImporterSheets {
    getSheetInfo(spreadsheetId: string): ImportSheetInfo[] | null | undefined;
    getRanges(spreadsheetId: string, range: string): unknown[][] | null | undefined;
}
export interface ImporterDrive {
    searchFiles(query: string, options?: {
        maxResults?: number;
    }): Pick<GoogleAppsScript.Drive_v3.Drive.V3.Schema.File, 'id' | 'name'>[] | null | undefined;
}
export interface ImportTable<Row extends object = ImportRow> {
    _keyField?: string;
    getAllRows(): Row[];
    insertRows(rows: Row[]): unknown;
    updateRowById(id: unknown, row: Partial<Row>): unknown;
    deleteRowById(id: unknown): unknown;
}
export interface ImportDatabase<Row extends object = ImportRow> {
    tables: Record<string, ImportTable<Row> | undefined>;
    save(): unknown;
}
export interface LoadResult {
    success: boolean;
    inserted: number;
    updated: number;
    skipped: number;
    deleted: number;
    total: number;
    dryRun?: boolean;
}
export interface ImporterExpression {
    evaluate(expression: string, context: ImportRow): unknown;
}
export type ImporterUtils = Pick<UtilsService, 'parseDate' | 'formatDate'>;
export type SourceConstructor = (new (...args: never[]) => object) | ((...args: never[]) => object);
export interface ImportMonitor {
    registerJob(jobId: string): unknown;
    startJob(jobId: string): unknown;
    logStepStart(jobId: string | null, step: string): unknown;
    updateProgress(jobId: string | null, progress: number, message: string): unknown;
    logStepComplete(jobId: string | null, step: string, success: boolean): unknown;
    completeJob(jobId: string | null, message: string): unknown;
    setError(jobId: string | null, error: unknown): unknown;
}
export interface ImportOptions {
    dryRun?: boolean;
    maxRetries?: number;
    jobId?: string;
    postTransform?: ((rows: ImportRow[], config: import('./ImportConfiguration.js').ImportConfiguration) => ImportRow[]) | null;
}
export interface ImportBudget {
    maxRows?: number;
}
export type RetryExecutor = GoogleRetryExecutor;
export type CustomSourceConstructor = new (logger: ImporterLogger, dependencies: object) => SourceStrategy;
export type FolderData = {
    fileName: string;
    fileId: string;
    data: ImportRow[];
};
export interface SourceAdapter {
    extract(config: SourceOptions): ImportRow[];
    supportsCursor(): boolean;
    extractChunk?(config: SourceOptions, cursor: SourceCursor, maxRows: number): ExtractedChunk;
}
export interface SourceFactoryAdapter {
    createStrategy(type: string, dependencies?: object): SourceAdapter;
    registerStrategy(name: string, constructor: SourceConstructor): unknown;
    getAvailableStrategies(): string[];
}
export interface ImportTransformer {
    transform(data: ImportRow[], config: TransformConfig): ImportRow[];
    _expressionEngine?: ImporterExpression | null;
}
