export interface DocumentRequest extends GoogleAppsScript.Docs.Schema.Request {
    createHeader?: {
        type: string;
    };
    createFooter?: {
        type: string;
    };
}
import type { GoogleLogger, GoogleService, GoogleRetryExecutor } from '../core/GoogleService.js';
import type { DocumentBuilder } from '../../services/DocumentBuilder.js';
export interface ParagraphOptions {
    heading?: number | string;
    alignment?: string;
    listType?: string;
}
export interface TableOptions {
    headerRow?: boolean;
    alternatingRows?: boolean;
    columnWidths?: number[];
}
export type DocumentOperation = {
    type: 'appendParagraph';
    text: string | null | undefined;
    options: ParagraphOptions;
} | {
    type: 'appendListItem';
    text: string | null | undefined;
    options: ParagraphOptions;
} | {
    type: 'setText';
    text: string | null | undefined;
} | {
    type: 'addHeader';
    text: string | null | undefined;
} | {
    type: 'addFooter';
    text: string | null | undefined;
} | {
    type: 'createTable';
    data: unknown[][];
    options: TableOptions;
} | {
    type: 'replaceText';
    searchPattern: string;
    replacement: string;
} | {
    type: 'exportPDF';
    fileName: string;
    destinationFolderId: string | null;
};
export interface BuilderService {
    _logger: Pick<GoogleLogger, 'warn' | 'error'>;
    _executeBatchUpdate(documentId: string, requests: DocumentRequest[]): GoogleAppsScript.Docs.Schema.BatchUpdateDocumentResponse;
    _executeExportPDF(documentId: string, op: Extract<DocumentOperation, {
        type: 'exportPDF';
    }>): GoogleAppsScript.Drive_v3.Drive.V3.Schema.File;
    _createTableWithStandardAPI(documentId: string, op: Extract<DocumentOperation, {
        type: 'createTable';
    }>): {
        success: boolean;
        rows: number;
        columns: number;
    };
    _addHeaderWithStandardAPI(documentId: string, op: {
        text: string | null | undefined;
    }): {
        success: boolean;
    };
    _addFooterWithStandardAPI(documentId: string, op: {
        text: string | null | undefined;
    }): {
        success: boolean;
    };
    openStandard(documentId: string): {
        saveAndClose?: () => unknown;
        getId?: () => string;
        getName?: () => string;
    };
}
interface ManagerState {
    _logger: GoogleLogger;
    _cache?: unknown;
    _utils?: unknown;
    _exceptionService?: unknown;
}
export interface TableSummary {
    startIndex?: number;
    endIndex?: number;
    tableIndex: number;
    rows: number;
    columns: number;
}
export interface DocumentTableFacade extends ManagerState {
    openStandard(documentId: string): GoogleAppsScript.Document.Document;
    _executeWithRetry<T>(callback: () => T, context?: object, maxAttempts?: number): T;
    getDocumentTables: (documentId: string) => TableSummary[];
}
export interface DocumentBatchFacade extends ManagerState {
    _exceptionService?: GoogleRetryExecutor | null;
    openStandard(documentId: string): GoogleAppsScript.Document.Document;
    document(documentId: string): DocumentBuilder;
    _generateCacheKey: GoogleService['_generateCacheKey'];
    _getOrExecute: GoogleService['_getOrExecute'];
    _invalidateCache: GoogleService['_invalidateCache'];
    _executeWithRetry: GoogleService['_executeWithRetry'];
    _executeBatchUpdate: BuilderService['_executeBatchUpdate'];
}
export interface TextRun {
    text: string;
    start: number;
    end: number;
    style: GoogleAppsScript.Docs.Schema.TextStyle;
}
export interface ContentTableRow {
    rowIndex: number;
    cells: {
        rowIndex: number;
        columnIndex: number;
        text: string;
        runs: TextRun[];
        content: ContentElement[];
    }[];
}
export interface ContentElement {
    index: number;
    startIndex?: number;
    endIndex?: number;
    type: string;
    text?: string;
    runs?: TextRun[];
    style?: GoogleAppsScript.Docs.Schema.ParagraphStyle;
    rows?: number;
    columns?: number;
    tableRows?: ContentTableRow[];
}
export interface RawDocument {
    documentId?: string;
    title?: string;
    body: {
        content: ContentElement[];
    };
}
export interface ScannedDocument {
    tables: {
        index: number;
        startIndex?: number;
        rows: {
            index: number;
            cells: {
                index: number;
                text: string;
                runs: TextRun[];
            }[];
        }[];
    }[];
    textMatches: {
        elementIndex?: number;
        text: string;
        type: string;
        tableIndex?: number;
        runs: TextRun[];
    }[];
}
export interface DocumentContentFacade extends ManagerState {
    _executeWithRetry: GoogleService['_executeWithRetry'];
    getRawDocumentStructure(documentId: string): RawDocument;
}
export {};
