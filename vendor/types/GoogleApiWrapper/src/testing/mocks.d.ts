import type { Mock } from 'jest-mock';
type Stub<R = unknown, A extends unknown[] = unknown[]> = Mock<(...args: A) => R>;
type FluentStub<T> = Stub<T>;
type DocumentStructure = Pick<GoogleAppsScript.Docs.Schema.Document, 'documentId' | 'title' | 'body'>;
type SectionStub = {
    clear: Stub;
    appendParagraph: Stub;
};
interface StandardDocumentStub {
    getId(): string;
    getName(): string;
    getBody(): {
        getText(): string;
        replaceText: Stub;
        appendParagraph: Stub;
        appendTable: Stub;
    };
    getHeader: Stub<null, []>;
    addHeader: Stub<SectionStub, []>;
    getFooter: Stub<null, []>;
    addFooter: Stub<SectionStub, []>;
}
interface TriggerRecord {
    id: string;
    functionName: string;
    type: string;
    createdAt: Date;
    scheduledFor?: Date;
    delayMinutes?: number;
    delayMs?: number;
    frequency?: string;
    interval?: number;
}
/**
 * @file GoogleApiWrapper/src/testing/mocks.js
 * @description Centralized high-fidelity mocks for GoogleApiWrapper services.
 * @version 1.0.0
 */
import { DocumentBuilder } from '../services/DocumentBuilder.js';
/**
 * @class SpreadsheetServiceMock
 * @description High-fidelity mock for SpreadsheetService. Implements structural sheet analysis and Jest tracking.
 */
export declare class SpreadsheetServiceMock {
    openById: Stub<Pick<GoogleAppsScript.Spreadsheet.Spreadsheet, 'getId' | 'getName'> & {
        getSheets(): never[];
        getSheetByName: Stub<null, []>;
    }, [
        id: string
    ]>;
    createSpreadsheet: Stub<Pick<GoogleAppsScript.Spreadsheet.Spreadsheet, 'getId' | 'getName' | 'getUrl'>, [
        name: string
    ]>;
    getSheetData: Stub<unknown[][]>;
    setSheetData: FluentStub<this>;
    appendRow: FluentStub<this>;
    deleteRows: FluentStub<this>;
    getValues: Stub;
    getSheetInfo: Stub;
    getRanges: Stub;
    updateRanges: Stub;
    flushBatch: Stub;
    constructor();
}
/**
 * @class PropertiesServiceMock
 * @description High-fidelity mock for PropertiesService. Implements in-memory Map-based persistence and automatic JSON serialization.
 */
export declare class PropertiesServiceMock {
    _store: Map<string, string>;
    getProperty: Stub<string | null, [key: string]>;
    setProperty: Stub<this, [key: string, value: unknown]>;
    getProperties: Stub<Record<string, string>, []>;
    setProperties: Stub<this, [props: Record<string, unknown>, deleteAll?: boolean]>;
    deleteProperty: Stub<this, [key: string]>;
    deleteAllProperties: Stub<this, []>;
    getObjectProperty: Stub<unknown, [key: string]>;
    setObjectProperty: Stub<this, [key: string, value: unknown]>;
    getScriptProperty: PropertiesServiceMock['getProperty'];
    setScriptProperty: PropertiesServiceMock['setProperty'];
    getScriptProperties: PropertiesServiceMock['getProperties'];
    setScriptProperties: PropertiesServiceMock['setProperties'];
    deleteScriptProperty: PropertiesServiceMock['deleteProperty'];
    deleteAllScriptProperties: PropertiesServiceMock['deleteAllProperties'];
    getUserProperty: PropertiesServiceMock['getProperty'];
    setUserProperty: PropertiesServiceMock['setProperty'];
    getUserProperties: PropertiesServiceMock['getProperties'];
    setUserProperties: PropertiesServiceMock['setProperties'];
    deleteUserProperty: PropertiesServiceMock['deleteProperty'];
    deleteAllUserProperties: PropertiesServiceMock['deleteAllProperties'];
    getDocumentProperty: PropertiesServiceMock['getProperty'];
    setDocumentProperty: PropertiesServiceMock['setProperty'];
    getDocumentProperties: PropertiesServiceMock['getProperties'];
    setDocumentProperties: PropertiesServiceMock['setProperties'];
    deleteDocumentProperty: PropertiesServiceMock['deleteProperty'];
    deleteAllDocumentProperties: PropertiesServiceMock['deleteAllProperties'];
    getScriptPropertyJSON: PropertiesServiceMock['getObjectProperty'];
    setScriptPropertyJSON: PropertiesServiceMock['setObjectProperty'];
    clearAll: PropertiesServiceMock['deleteAllProperties'];
    constructor();
}
/**
 * @class DocumentServiceMock
 * @description High-fidelity mock for DocumentService. Supports builder pattern and structural document analysis.
 */
export declare class DocumentServiceMock {
    _logger: {
        debug: Stub;
        warn: Stub;
        error: Stub;
    };
    document: Stub<DocumentBuilder, [id: string]>;
    createDocument: Stub<{
        documentId: string;
        getId(): string;
        builder: DocumentBuilder;
    }, [
        name: string
    ]>;
    getDocument: Stub<DocumentStructure | DocumentStructure[], [ids: string | string[]]>;
    openStandard: Stub<StandardDocumentStub, [id: string]>;
    getRawDocumentStructure: Stub<DocumentStructure, [id: string]>;
    scanDocumentStructure: Stub<{
        tables: never[];
        textMatches: never[];
    }, [
        id: string,
        textPatterns?: unknown
    ]>;
    getDocumentTables: Stub<never[]>;
    getTableStructure: Stub<{
        startIndex: number;
        endIndex: number;
        rows: never[];
    }>;
    getDocumentBody: Stub<{
        startIndex: number;
        endIndex: number;
        content: never[];
    }>;
    getOrCreateHeader: Stub<SectionStub>;
    getOrCreateFooter: Stub<SectionStub>;
    setHeaderText: FluentStub<this>;
    updateDocument: FluentStub<this>;
    replaceAllText: FluentStub<this>;
    _executeBatchUpdate: Stub<GoogleAppsScript.Docs.Schema.BatchUpdateDocumentResponse>;
    _executeExportPDF: Stub<{
        id: string;
    }>;
    _createTableWithStandardAPI: Stub<{
        success: boolean;
        rows: number;
        columns: number;
    }, [
        documentId: string,
        op: {
            data: unknown[][];
        }
    ]>;
    _addHeaderWithStandardAPI: Stub<{
        success: boolean;
    }>;
    _addFooterWithStandardAPI: Stub<{
        success: boolean;
    }>;
    constructor();
}
/**
 * @class TriggerServiceMock
 * @description High-fidelity mock for TriggerService. Implements in-memory trigger registry and lifecycle tracking.
 */
export declare class TriggerServiceMock {
    _logger: unknown;
    _triggers: TriggerRecord[];
    _triggerIdCounter: number;
    createTimeTrigger: Stub<TriggerRecord, [functionName: string, delayMinutes: number]>;
    createTimedTrigger: Stub<string, [functionName: string, delayMs: number]>;
    createAtTimeTrigger: Stub<TriggerRecord, [functionName: string, time: Date]>;
    createRecurringTrigger: Stub<TriggerRecord, [
        functionName: string,
        frequency: string,
        interval?: number
    ]>;
    deleteTrigger: Stub<boolean, [triggerId: string]>;
    deleteTriggersByFunction: Stub<number, [functionName: string]>;
    getTriggers: Stub<TriggerRecord[], []>;
    getTriggersByFunction: Stub<TriggerRecord[], [functionName: string]>;
    getTriggerById: Stub<TriggerRecord | null, [triggerId: string]>;
    deleteAllTriggers: Stub<void, []>;
    getTriggerCount: Stub<number, []>;
    hasTriggerForFunction: Stub<boolean, [functionName: string]>;
    deleteTriggerById: TriggerServiceMock['deleteTrigger'];
    getAllTriggers: TriggerServiceMock['getTriggers'];
    clear: TriggerServiceMock['deleteAllTriggers'];
    constructor(logger?: unknown);
}
/**
 * @class MailServiceMock
 * @description High-fidelity mock for MailService.
 */
export declare class MailServiceMock {
    send: Stub<{
        success: boolean;
        messageId: string;
    }>;
    sendBatch: Stub<{
        successful: never[];
        failed: never[];
        sent: number;
    }>;
    sendBulk: Stub<{
        sent: number;
        failed: number;
        details: {
            successful: never[];
            failed: never[];
        };
    }>;
    createDraft: Stub<{
        success: boolean;
        id: string;
    }>;
    createDraftsBatch: Stub<{
        successful: never[];
        failed: never[];
    }>;
    sendNotification: Stub<{
        success: boolean;
    }>;
    getQuotaUsage: Stub<number>;
    constructor();
}
/**
 * @class LockServiceMock
 * @description High-fidelity mock for LockService.
 */
export declare class LockServiceMock {
    _lock: {
        hasLock: Stub<boolean, []>;
        releaseLock: Stub;
        tryLock: Stub<boolean, []>;
        waitLock: Stub;
    };
    getScriptLock: Stub<LockServiceMock['_lock'], []>;
    getUserLock: Stub<LockServiceMock['_lock'], []>;
    getDocumentLock: Stub<LockServiceMock['_lock'], []>;
    constructor();
}
/**
 * @class DriveServiceMock
 * @description High-fidelity mock for DriveService.
 */
export declare class DriveServiceMock {
    getFile: Stub<Pick<GoogleAppsScript.Drive.File, 'getId' | 'getName'> & {
        getBlob(): {
            getAs: Stub<object, []>;
        };
    }, [
        id: string
    ]>;
    createFile: Stub<Pick<GoogleAppsScript.Drive.File, 'getId' | 'getName'>, [
        name: string,
        content: unknown
    ]>;
    copyFile: Stub<Pick<GoogleAppsScript.Drive.File, 'getId' | 'getName'>, [
        id: string,
        name: string
    ]>;
    moveFile: Stub;
    deleteFile: Stub;
    listFiles: Stub<never[]>;
    getStandardApp: Stub<GoogleAppsScript.Drive.DriveApp | undefined, []>;
    constructor();
}
export {};
