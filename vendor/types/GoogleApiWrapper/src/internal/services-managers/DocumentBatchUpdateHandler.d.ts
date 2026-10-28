import type { DocumentBatchFacade, DocumentOperation } from './DocumentContracts.js';
/**
 * @file GoogleApiWrapper/src/services/managers/DocumentBatchUpdateHandler.js
 * @description Specialized manager for Google Documents batch operations and core mutations.
 * Handles Docs API batchUpdate, PDF export, and bulk document operations.
 */
export declare class DocumentBatchUpdateHandler {
    facade: DocumentBatchFacade;
    _logger: DocumentBatchFacade['_logger'];
    _cache: unknown;
    _utils: unknown;
    _exceptionService: DocumentBatchFacade['_exceptionService'];
    /**
     * Creates a new DocumentBatchUpdateHandler instance.
     * @param {DocumentService} facade - The DocumentService facade
     */
    constructor(facade: DocumentBatchFacade);
    /**
     * @description Retrieves the document header. Provisions a new header if missing.
     * @param {string} documentId Target document identifier.
     * @returns {GoogleAppsScript.Document.HeaderSection}
     */
    getOrCreateHeader(documentId: string): GoogleAppsScript.Document.HeaderSection;
    /**
     * @description Retrieves the document footer. Provisions a new footer if missing.
     * @param {string} documentId Target document identifier.
     * @returns {GoogleAppsScript.Document.FooterSection}
     */
    getOrCreateFooter(documentId: string): GoogleAppsScript.Document.FooterSection;
    /**
     * @description Replaces header content with specified text.
     * @param {string} documentId Target document identifier.
     * @param {string} text New header content.
     * @returns {DocumentService} Facade instance for chaining.
     */
    setHeaderText(documentId: string, text: string): DocumentBatchFacade;
    /**
     * @description Initializes a new blank document via Advanced Docs API (no template copy required).
     * @param {string} name Document title.
     * @param {Object} [options={}] Creation options.
     * @param {string} [options.destinationFolder] Target folder ID; moved there via Advanced Drive API after creation (Docs API always creates in Drive root).
     * @returns {Object} Result {documentId, builder}.
     */
    createDocument(name: string, options?: {
        destinationFolder?: string;
    }): {
        documentId: string;
        builder: import("../../services/DocumentBuilder.js").DocumentBuilder;
    };
    /**
     * @description Retrieves document metadata with intelligent caching.
     * @param {string|string[]} documentIds Target resource ID(s).
     * @returns {Object|Object[]|null} Metadata object (single) or collection (batch).
     */
    getDocument(documentIds: string): GoogleAppsScript.Docs.Schema.Document | null;
    getDocument(documentIds: string[]): (GoogleAppsScript.Docs.Schema.Document | null)[];
    /**
     * @private
     * @description Executes atomic mutations via Docs API batchUpdate. Invalidates metadata cache on success.
     * @param {string} documentId Target document identifier.
     * @param {Object[]} requests Collection of API request objects.
     * @returns {Object} API response.
     */
    _executeBatchUpdate(documentId: string, requests: GoogleAppsScript.Docs.Schema.Request[] | null | undefined): GoogleAppsScript.Docs.Schema.BatchUpdateDocumentResponse;
    /**
     * @private
     * @description Triggers server-side PDF conversion and saves to Drive.
     * @param {string} documentId Source document identifier.
     * @param {Object} op Export parameters {fileName, destinationFolderId}.
     * @returns {Object} Created Drive file metadata.
     */
    _executeExportPDF(documentId: string, op: Pick<Extract<DocumentOperation, {
        type: 'exportPDF';
    }>, 'fileName' | 'destinationFolderId'>): GoogleAppsScript.Drive_v3.Drive.V3.Schema.File;
    /**
     * @description Executes case-sensitive global text replacement in batch across multiple documents.
     * @param {string|string[]} documentIds Target resource ID(s).
     * @param {string} searchPattern Text to find.
     * @param {string} replacement New text content.
     * @returns {Object} Result summary {successful, failed}.
     */
    batchReplaceText(documentIds: string | string[], searchPattern: string, replacement: string | null | undefined): {
        successful: {
            documentId: string;
            result: unknown;
        }[];
        failed: {
            documentId: string;
            error: string;
        }[];
    };
    /**
     * @description Trashes multiple documents in batch. Invalidates associated metadata caches.
     * @param {string|string[]} documentIds Target resource ID(s).
     * @returns {Object} Result summary {successful, failed}.
     */
    deleteDocuments(documentIds: string | string[]): {
        successful: {
            documentId: string;
            result: unknown;
        }[];
        failed: {
            documentId: string;
            error: string;
        }[];
    };
    /**
     * @private
     * @description Bridges DocumentBuilder to native DocumentApp for header mutations.
     * @param {string} documentId Target document identifier.
     * @param {Object} op Mutation parameters {text}.
     * @returns {Object} {success}.
     */
    _addHeaderWithStandardAPI(documentId: string, op: {
        text: string | null | undefined;
    }): {
        success: boolean;
    };
    /**
     * @private
     * @description Bridges DocumentBuilder to native DocumentApp for footer mutations.
     * @param {string} documentId Target document identifier.
     * @param {Object} op Mutation parameters {text}.
     * @returns {Object} {success}.
     */
    _addFooterWithStandardAPI(documentId: string, op: {
        text: string | null | undefined;
    }): {
        success: boolean;
    };
}
