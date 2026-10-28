import type { GoogleLogger, GoogleCache, GoogleRetryExecutor } from '../internal/core/GoogleService.js';
import { GoogleService } from '../internal/core/GoogleService.js';
import { DocumentBuilder } from './DocumentBuilder.js';
export { DocumentBuilder };
import { DocumentTableManager } from '../internal/services-managers/DocumentTableManager.js';
import { DocumentContentExtractor } from '../internal/services-managers/DocumentContentExtractor.js';
import { DocumentBatchUpdateHandler } from '../internal/services-managers/DocumentBatchUpdateHandler.js';
/**
 * @class DocumentService
 * @extends GoogleService
 * @description Stateless facade for Google Docs manipulation. Utilizes Advanced Docs API v1 for batch operations and DocumentApp for standard API access. Delegates specialized logic to Table, Content, and Batch managers.
 *
 * @property {DocumentTableManager} _tableManager Logic for table structure and data.
 * @property {DocumentContentExtractor} _contentExtractor Logic for document parsing.
 * @property {DocumentBatchUpdateHandler} _batchUpdateHandler Logic for atomic mutations.
 */
export interface DocumentService extends Pick<DocumentTableManager, 'getDocumentTables' | 'getTableStructure' | 'getTableData' | 'getTableRow' | 'getTableColumn' | 'insertTableRow' | 'appendTableRow' | 'deleteTableRow' | 'updateTableCell' | 'updateTableRow' | 'updateTableColumn' | 'copyTableRow' | 'copyTableColumn' | 'setCellRunStyles' | 'deleteTableColumn' | 'insertTableColumn' | 'appendTableColumn' | 'setColumnWidth' | 'getColumnWidth' | 'setRowBackgroundColor' | 'setRowMinimumHeight' | 'getRowMinimumHeight' | 'clearTableRow' | 'setCellBackgroundColor' | 'getCellBackgroundColor' | 'setCellPadding' | 'getCellPadding' | 'setCellVerticalAlignment' | 'getCellVerticalAlignment' | 'getCellDetails' | 'getTableMetadata' | 'setRowTextAlignment' | 'setRowBold' | '_createTableWithStandardAPI' | 'insertTableAtMarker'>, Pick<DocumentContentExtractor, 'getRawDocumentStructure' | 'getDocumentBody' | 'scanDocumentStructure'>, Pick<DocumentBatchUpdateHandler, 'createDocument' | 'getDocument' | '_executeBatchUpdate' | '_executeExportPDF' | 'batchReplaceText' | 'deleteDocuments' | '_addHeaderWithStandardAPI' | '_addFooterWithStandardAPI' | 'getOrCreateHeader' | 'getOrCreateFooter' | 'setHeaderText'> {
}
export declare class DocumentService extends GoogleService {
    setHeaderText: (documentId: string, text: string) => this;
    _tableManager: DocumentTableManager;
    _contentExtractor: DocumentContentExtractor;
    _batchUpdateHandler: DocumentBatchUpdateHandler;
    /**
     * @description Initializes DocumentService and wires manager delegations.
     * @param {LoggerService} logger Diagnostic logger.
     * @param {Cache} cache Persistence provider.
     * @param {UtilsService} utils Foundational utilities.
     * @param {ExceptionService} [exceptionService=null] Resiliency provider.
     */
    constructor(logger: GoogleLogger, cache: GoogleCache, utils: object, exceptionService?: GoogleRetryExecutor | null);
    /**
     * @description Factory method for DocumentBuilder.
     * @param {string} documentId Target Google Doc ID.
     * @returns {DocumentBuilder} Builder instance for fluent mutations.
     * @throws {Error} If documentId is invalid.
     */
    document(documentId: string): DocumentBuilder;
    /**
     * @description Accesses document via native DocumentApp (standard API).
     * @param {string} documentId Target document identifier.
     * @returns {GoogleAppsScript.Document.Document} Native GAS Document object.
     */
    openStandard(documentId: string): GoogleAppsScript.Document.Document;
    /**
     * @description Returns the global DocumentApp object for enum and static access.
     * @returns {GoogleAppsScript.Document.DocumentApp}
     */
    getStandardApp(): GoogleAppsScript.Document.DocumentApp;
}
export { DocumentService as MyDocumentService };
