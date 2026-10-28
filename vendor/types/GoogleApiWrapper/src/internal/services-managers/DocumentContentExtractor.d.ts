import type { DocumentContentFacade, ContentElement, ScannedDocument } from './DocumentContracts.js';
/**
 * @file GoogleApiWrapper/src/services/managers/DocumentContentExtractor.js
 * @description Specialized manager for extracting and parsing Google Documents content.
 * Converts complex document structures into POJOs for decoupling from GAS APIs.
 */
export declare class DocumentContentExtractor {
    facade: DocumentContentFacade;
    _logger: DocumentContentFacade['_logger'];
    _cache: unknown;
    _utils: unknown;
    _exceptionService: unknown;
    /**
     * Creates a new DocumentContentExtractor instance.
     * @param {DocumentService} facade - The DocumentService facade
     */
    constructor(facade: DocumentContentFacade);
    /**
     * @description Retrieves the full document hierarchy as a Plain Old JavaScript Object (POJO). Bypasses internal GAS types.
     * @param {string} documentId Target document identifier.
     * @returns {Object} POJO representation including body content collection.
     */
    getRawDocumentStructure(documentId: string): {
        documentId: string | undefined;
        title: string | undefined;
        body: {
            content: ContentElement[];
        };
    };
    /**
     * @private
     * @description Recursively maps native Docs API content elements to POJOs.
     * @param {Object[]} content Collection of native Docs API elements.
     * @returns {Object[]} Collection of mapped POJOs.
     */
    _convertContentToPOJO(content: GoogleAppsScript.Docs.Schema.StructuralElement[] | null | undefined): ContentElement[];
    /**
     * @private
     * @description Aggregates all text runs within a paragraph element.
     * @param {Object} paragraph Native Docs API paragraph object.
     * @returns {string} Concatenated plain text.
     */
    _extractParagraphText(paragraph: GoogleAppsScript.Docs.Schema.Paragraph | null | undefined): string;
    /**
     * @private
     * @description Extracts per-run text + style spans from a paragraph, with
     * offsets relative to the paragraph's own flattened text (i.e. directly
     * usable as offsets into `_extractParagraphText(paragraph)`'s output).
     * @param {Object} paragraph Native Docs API paragraph object.
     * @returns {Array<{text: string, start: number, end: number, style: Object}>}
     */
    _extractParagraphRuns(paragraph: GoogleAppsScript.Docs.Schema.Paragraph | null | undefined): {
        text: string;
        start: number;
        end: number;
        style: GoogleAppsScript.Docs.Schema.TextStyle;
    }[];
    /**
     * @private
     * @description Maps native Docs API table rows and cells to a POJO collection.
     * @param {Object} table Native Docs API table object.
     * @returns {Object[]} Collection of row and cell POJOs.
     */
    _extractTableData(table: GoogleAppsScript.Docs.Schema.Table | null | undefined): {
        rowIndex: number;
        cells: {
            rowIndex: number;
            columnIndex: number;
            text: string;
            runs: {
                text: string;
                start: number;
                end: number;
                style: GoogleAppsScript.Docs.Schema.TextStyle;
            }[];
            content: ContentElement[];
        }[];
    }[];
    /**
     * @private
     * @description Resolves text content from a table cell by aggregating paragraph segments.
     * @param {Object} cell Native Docs API table cell object.
     * @returns {string} Concatenated plain text.
     */
    _extractCellText(cell: GoogleAppsScript.Docs.Schema.TableCell | null | undefined): string;
    /**
     * @private
     * @description Extracts per-run text + style spans from a table cell,
     * concatenating across the cell's paragraphs with cell-relative offsets
     * (matching `_extractCellText`'s concatenation order exactly).
     * @param {Object} cell Native Docs API table cell object.
     * @returns {Array<{text: string, start: number, end: number, style: Object}>}
     */
    _extractCellRuns(cell: GoogleAppsScript.Docs.Schema.TableCell | null | undefined): {
        text: string;
        start: number;
        end: number;
        style: GoogleAppsScript.Docs.Schema.TextStyle;
    }[];
    /**
     * @description Retrieves the document body metadata with index boundaries.
     * @param {string} documentId Target document identifier.
     * @returns {Object} Body structure {startIndex, endIndex, content}.
     * @throws {Error} If body is missing.
     */
    getDocumentBody(documentId: string): {
        startIndex: number;
        endIndex: number;
        content: GoogleAppsScript.Docs.Schema.StructuralElement[] | undefined;
    };
    /**
     * @description Probes document structure for tables and specific text patterns. Optimized for POJO-based scanning.
     * @param {string} documentId Target document identifier.
     * @param {string[]} [textPatterns=['{{']] Collection of search strings.
     * @returns {Object} Scan results {tables: Object[], textMatches: Object[]}.
     */
    scanDocumentStructure(documentId: string, textPatterns?: string[]): ScannedDocument;
}
