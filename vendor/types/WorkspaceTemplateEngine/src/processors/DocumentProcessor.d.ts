import type { TemplateLogger, ProcessorHost, ProcessorDocumentService, ProcessorDocumentWrites, ScannedTable, TextMatch } from '../types.js';
import { DocumentProcessorTagScanner } from '../internal/processors-managers/DocumentProcessorTagScanner.js';
import { DocumentProcessorValueResolver } from '../internal/processors-managers/DocumentProcessorValueResolver.js';
import { DocumentProcessorInjector } from '../internal/processors-managers/DocumentProcessorInjector.js';
declare class _DocumentProcessor {
    mustache: ProcessorHost['mustache'];
    logger: TemplateLogger;
    documentService: ProcessorDocumentService & ProcessorDocumentWrites;
    MAX_ITERATIONS: number;
    MAX_TEMPLATE_MATCH_SIZE: number;
    strictFilters: boolean;
    _tagScanner: DocumentProcessorTagScanner;
    _valueResolver: DocumentProcessorValueResolver;
    _injector: DocumentProcessorInjector;
    _analyzeColumnLoops: DocumentProcessorTagScanner['_analyzeColumnLoops'];
    _analyzeRowLoops: DocumentProcessorTagScanner['_analyzeRowLoops'];
    _analyzeListLoops: DocumentProcessorTagScanner['_analyzeListLoops'];
    _analyzeTextSubstitutions: DocumentProcessorTagScanner['_analyzeTextSubstitutions'];
    _analyzeTableInsertions: DocumentProcessorTagScanner['_analyzeTableInsertions'];
    _analyzeConditionalSections: DocumentProcessorTagScanner['_analyzeConditionalSections'];
    _parseTableParams: DocumentProcessorTagScanner['_parseTableParams'];
    _parseExpression: DocumentProcessorTagScanner['_parseExpression'];
    _parseFilterArgs: DocumentProcessorTagScanner['_parseFilterArgs'];
    _parseArgValue: DocumentProcessorTagScanner['_parseArgValue'];
    _applyFilters: DocumentProcessorValueResolver['_applyFilters'];
    _sortByProperty: DocumentProcessorValueResolver['_sortByProperty'];
    _getNestedProperty: DocumentProcessorValueResolver['_getNestedProperty'];
    _executeRowLoopOperation: DocumentProcessorInjector['_executeRowLoopOperation'];
    _executeColumnLoopOperation: DocumentProcessorInjector['_executeColumnLoopOperation'];
    _executeListLoopOperation: DocumentProcessorInjector['_executeListLoopOperation'];
    _retextParagraph: DocumentProcessorInjector['_retextParagraph'];
    _convertOperationToRequests: DocumentProcessorInjector['_convertOperationToRequests'];
    _createTextSubstitutionRequests: DocumentProcessorInjector['_createTextSubstitutionRequests'];
    _createDeleteRowRequests: DocumentProcessorInjector['_createDeleteRowRequests'];
    _createDeleteRangeRequests: DocumentProcessorInjector['_createDeleteRangeRequests'];
    _executeTableInsertOperation: DocumentProcessorInjector['_executeTableInsertOperation'];
    _flushDocumentChanges: DocumentProcessorInjector['_flushDocumentChanges'];
    constructor(placeholderService: ProcessorHost, options?: {
        strictFilters?: boolean;
    });
    /**
     * @description Computes the `[index, index+length)` ranges of every
     * `{{#expr}}`/`{{^expr}}` conditional section that will be discarded
     * WHOLESALE (`kind: 'section'` ops only — never `kind: 'marker'`, which
     * only removes the two marker paragraphs and keeps its content live). Any
     * of the other 4 structural directives (`tablerow_loop`/`tablecol_loop`/
     * `bullet_list`/`number_list`/`{{table[...]}}`) whose marker falls inside
     * one of these ranges must never be analyzed or natively executed — the
     * whole span, including that directive's own data resolution, is about to
     * be deleted anyway, so running it first would be wasted work at best (a
     * spurious "not a valid array" warning at worst) for a data source the
     * template author expects to be legitimately absent while the guard is
     * false. Deliberately recomputed against whatever `structure` is CURRENT
     * at each call site (mirroring the existing deleteRow
     * "recompute against latest structure" pattern below) since an earlier
     * native mutation elsewhere in the document shifts character offsets that
     * a stale computation would get wrong.
     * @param {Object} currentStructure `{tables, textMatches}` snapshot to scan.
     * @param {Object} context Data context.
     * @returns {Array<[number, number]>} Half-open `[start, end)` ranges.
     * @private
     */
    _computeFalsyConditionalRanges(currentStructure: {
        tables: ScannedTable[];
        textMatches: TextMatch[];
    }, context: object | null): number[][];
    /**
     * @description True if `index` falls inside any of `ranges`.
     * @param {Array<[number, number]>} ranges Half-open `[start, end)` ranges.
     * @param {number} index Character offset to test.
     * @returns {boolean}
     * @private
     */
    _isInsideAnyRange(ranges: number[][], index: number | undefined): boolean;
    process(documentId: string, context: object | null): void;
}
export { _DocumentProcessor as DocumentProcessor };
