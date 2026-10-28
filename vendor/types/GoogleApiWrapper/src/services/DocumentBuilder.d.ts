import type { DocumentOperation, ParagraphOptions, TableOptions, BuilderService, DocumentRequest } from '../internal/services-managers/DocumentContracts.js';
/**
 * @file GoogleApiWrapper/src/services/DocumentBuilder.js
 * @description Builder class for fluent Google Docs document operations with atomic batch execution.
 */
/**
 * @class DocumentBuilder
 * @description Fluent builder for Google Docs. Accumulates mutation operations for atomic execution via batchUpdate.
 *
 * @property {string} documentId Target document identifier.
 * @property {GoogleService} service Reference to the Google Docs service.
 * @property {Array<Object>} operations Queue of pending document mutations.
 */
export declare class DocumentBuilder {
    documentId: string;
    service: BuilderService;
    operations: DocumentOperation[];
    constructor(documentId: string, service: BuilderService);
    /**
     * @description Queues a paragraph append operation.
     * @param {string} text Paragraph content.
     * @param {Object} [options={}] Formatting metadata (heading, alignment).
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    appendParagraph(text: string | null | undefined, options?: ParagraphOptions): this;
    /**
     * @description Queues a native Google Docs list item append operation.
     * @param {string} text List item content.
     * @param {Object} [options={}] List metadata; `listType` is `bullet` or `number`.
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    appendListItem(text: string | null | undefined, options?: ParagraphOptions): this;
    /**
     * @description Queues a full body content override operation.
     * @param {string} text Document text content.
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    setText(text: string | null | undefined): this;
    /**
     * @description Queues a table insertion operation.
     * @param {Array<Array>} data 2D array representing table rows and cells.
     * @param {Object} [options={}] Table configuration (headerRow, widths).
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    createTable(data: unknown[][], options?: TableOptions): this;
    /**
     * @description Queues a header content operation.
     * @param {string} text Header content.
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    addHeader(text: string | null | undefined): this;
    /**
     * @description Queues a footer content operation.
     * @param {string} text Footer content.
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    addFooter(text: string | null | undefined): this;
    /**
     * @description Queues a global text replacement operation.
     * @param {string} searchPattern Text pattern to replace.
     * @param {string} replacement New text content.
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    replaceText(searchPattern: string, replacement: string): this;
    /**
     * @description Queues a PDF generation operation.
     * @param {string} fileName Destination file name.
     * @param {string} [destinationFolderId=null] Target folder ID.
     * @returns {DocumentBuilder} Current instance for chaining.
     */
    exportPDF(fileName: string, destinationFolderId?: string | null): this;
    /**
     * @description Executes all queued operations. Combines Batch Update requests with standard API calls for tables and exports.
     * @returns {Object} Execution summary {success, batchResult, standardResults, tableResults, nonBatchResults}.
     */
    execute(): {
        success: boolean;
        batchResult: GoogleAppsScript.Docs.Schema.BatchUpdateDocumentResponse | null;
        standardResults: {
            operation: string;
            result: {
                success: boolean;
                rows?: number;
                columns?: number;
            } | undefined;
        }[];
        tableResults: {
            operation: string;
            result: {
                success: boolean;
                rows?: number;
                columns?: number;
            } | undefined;
        }[];
        nonBatchResults: {
            operation: string;
            result: GoogleAppsScript.Drive_v3.Drive.V3.Schema.File;
        }[];
        error?: undefined;
    } | {
        success: boolean;
        error: unknown;
        batchResult?: undefined;
        standardResults?: undefined;
        tableResults?: undefined;
        nonBatchResults?: undefined;
    };
    /**
     * @private
     * @description Maps builder operations to Google Docs API Request objects.
     * @param {Object} op Builder operation metadata.
     * @returns {Object[]} Collection of API requests.
     */
    _convertOperationToDocsRequests(op: DocumentOperation, cursor: {
        index: number;
    } | null): DocumentRequest[];
    _createAppendParagraphRequests(op: Extract<DocumentOperation, {
        type: 'appendParagraph' | 'appendListItem';
    }>, cursor: {
        index: number;
    }): DocumentRequest[];
    _createAppendListItemRequests(op: Extract<DocumentOperation, {
        type: 'appendListItem';
    }>, cursor: {
        index: number;
    }): DocumentRequest[];
    /**
     * @private
     * @description Reads the document's current body end index (Docs API), used
     * to anchor `insertText` requests so they land after existing content
     * instead of at a fixed offset.
     * @returns {number} The index immediately after the last body element.
     */
    _getBodyEndIndex(): number;
    _createSetTextRequests(op: Extract<DocumentOperation, {
        type: 'setText';
    }>): DocumentRequest[];
    _createTableRequests(op: Extract<DocumentOperation, {
        type: 'createTable';
    }>): never[];
    _createHeaderRequests(_op: DocumentOperation): DocumentRequest[];
    _createFooterRequests(_op: DocumentOperation): DocumentRequest[];
    _createReplaceTextRequests(op: Extract<DocumentOperation, {
        type: 'replaceText';
    }>): {
        replaceAllText: {
            containsText: {
                text: string;
                matchCase: boolean;
            };
            replaceText: string;
        };
    }[];
}
