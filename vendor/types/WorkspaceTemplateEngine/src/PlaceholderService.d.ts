import type { TemplateLogger, TemplateOptions, ProcessorHost } from './types.js';
/**
 * @description Facade for multi-format template processing (String, Google Docs, Google Sheets).
 * Orchestrates Mustache rendering, structural document expansion, and batch spreadsheet updates.
 * @class
 * @example
 * const service = new PlaceholderService({ logger, mustache });
 * service.processDocument(docId, { items: [{ name: 'A' }] });
 */
import { DocumentProcessor } from './processors/DocumentProcessor.js';
import { SheetProcessor } from './processors/SheetProcessor.js';
export declare class PlaceholderService {
    logger: TemplateLogger;
    mustache: ProcessorHost['mustache'];
    documentProcessor: Pick<DocumentProcessor, 'process'>;
    sheetProcessor: Pick<SheetProcessor, 'process'>;
    /**
     * @description Dependency injection manifest for PlaceholderService.
     * @returns {Object} DI configuration object.
     * @static
     */
    static get di(): {
        name: string;
        dependencies: string[];
        isSingleton: boolean;
        factory: (logger: TemplateLogger, mustache: ProcessorHost["mustache"]) => PlaceholderService;
    };
    /**
     * @description Initializes the service with required rendering and logging dependencies.
     * @param {Object} options Configuration options.
     * @param {LoggerService} options.logger Diagnostic logger instance.
     * @param {Mustache} options.mustache Initialized Mustache engine.
     * @param {boolean} [options.strictFilters=false] If true, filter errors throw exceptions.
     * @throws {Error} If required mustache dependency is missing.
     */
    constructor(options?: TemplateOptions);
    /**
     * @description Processes a string template using Mustache placeholders and filter pipes.
     * Supports standard Mustache syntax plus `{{value | filter:args}}` extensions.
     * @param {string} template Raw template string.
     * @param {Object} [context={}] Data context for resolution.
     * @returns {string} Processed string or original template on failure.
     * @throws {TypeError} If inputs are invalid types.
     */
    processString(template: string, context?: object | null): string;
    /**
     * @description Alias for processString() to maintain compatibility with GasExpressionEngineLib.
     * @param {string} template Raw template string.
     * @param {Object} [context={}] Data context.
     * @returns {string} Substituted string.
     */
    resolve(template: string, context?: object | null): string;
    /**
     * @description Performs in-place processing of a Google Document with structural expansion.
     * Executes reverse-order operations for tables, lists, and placeholders to maintain index integrity.
     * @param {string} documentId Unique Google Document identifier.
     * @param {Object} [context={}] Data context containing arrays for structural loops.
     * @returns {boolean} True if processing completed without errors.
     * @throws {TypeError} If parameters are invalid.
     */
    processDocument(documentId: string, context?: object | null): boolean;
    /**
     * @description Executes batch updates on a Google Spreadsheet with matrix expansion and placeholder substitution.
     *
     * Return shape changed (additively, in intent): callers that previously treated
     * the return value as a plain boolean must now read `.success` — the resolved
     * `dynamic_columns` column layouts (see `SheetProcessor._prepareDynamicColumnRequests`)
     * are surfaced via `.layouts` so a caller can know which spreadsheet column each
     * templated item landed in (e.g. to apply ACLs the directive's own static `acl=`
     * expression can't express).
     *
     * @param {string} sheetId Unique Google Spreadsheet identifier.
     * @param {Object} [context={}] Data context for substitutions and matrix generation.
     * @param {string|null} [sheetName=null] Target sheet name or null to process all sheets.
     * @returns {{success: boolean, layouts: Array<{sheetName: string, headerRow: number, startColumn: number, columns: Array<{header: *, column: number, isLabel: boolean}>}>}} `success` is false (and `layouts` empty) on any processing error, matching the pre-existing swallow-and-log behavior.
     * @throws {TypeError} If parameters are invalid.
     */
    processSheet(sheetId: string, context?: object | null, sheetName?: string | null): {
        success: boolean;
        layouts: import("./types.js").SheetLayout[];
    };
}
/** @deprecated nome storico, rimosso alla prossima release. */
export { PlaceholderService as MyPlaceholderService };
