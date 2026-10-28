import type { DocumentProcessor } from '../../processors/DocumentProcessor.js';
import type { ScannedTable, TextMatch, ColumnLoop, RowLoop, DeleteRow, ListLoop, ConditionalDelete, TextSubstitution, TableInsert, ConditionalNode, ParsedFilter, ParsedArgument } from '../../types.js';
export declare class DocumentProcessorTagScanner {
    facade: Pick<DocumentProcessor, 'logger' | 'mustache' | 'MAX_ITERATIONS' | 'MAX_TEMPLATE_MATCH_SIZE' | '_parseExpression' | '_applyFilters' | '_parseFilterArgs' | '_parseArgValue'>;
    constructor(facade: DocumentProcessorTagScanner['facade']);
    _analyzeColumnLoops(table: ScannedTable, context: object | null): ColumnLoop[];
    _analyzeRowLoops(table: ScannedTable, context: object | null): (RowLoop | DeleteRow)[];
    _analyzeListLoops(textMatches: TextMatch[], context: object | null): ListLoop[];
    /**
     * @description Scans paragraph-level text matches for the generic
     * `{{#expr}}...{{/expr}}` / `{{^expr}}...{{/expr}}` conditional-section
     * directive and builds a nesting-aware tree of matched open/close marker
     * pairs (a paragraph whose entire, whitespace-trimmed text is exactly an
     * opening marker is paired with the next matching `{{/expr}}` closing
     * marker at the SAME nesting depth; any pair fully between them becomes a
     * child of that pair, not a sibling). Reserved directive names
     * (`tablerow_loop:`/`tablecol_loop:`/`bullet_list:`/`number_list:`) are
     * left untouched here — they are handled by their own dedicated
     * `_analyze*` methods.
     * @param {Array<Object>} textMatches Scanned text runs (`scanDocumentStructure().textMatches`).
     * @param {Object} context Data context.
     * @returns {Array<{type: 'conditionalDelete', index: number, length: number, kind: 'section'|'marker'}>}
     *   One `deleteContentRange`-shaped op per removed span, in document order,
     *   produced by resolving the tree top-down via `_resolveConditionalSectionNode`
     *   (see there for the false-vs-true/overlap-avoidance rules).
     */
    _analyzeConditionalSections(textMatches: TextMatch[], context: object | null): ConditionalDelete[];
    /**
     * @description Resolves one matched `{{#expr}}`/`{{^expr}}` node (and,
     * recursively, its nested children) against `context` with standard
     * Mustache truthiness (falsy/`null`/empty array => section false), exactly
     * like `_renderSection`/`_renderInverted` in the Mustache facade.
     *
     * The false/discarded branch NEVER recurses into `node.children`: the one
     * `kind: 'section'` op it emits already spans
     * `[node.openIndex, node.closeIndex! + node.closeLength!)`, which fully
     * contains any nested conditional's own range — recursing would emit a
     * second, overlapping `deleteContentRange` request for a sub-span already
     * covered by this one, breaking the "Reverse-Order Strategy"'s
     * non-overlapping-ranges invariant (deleting the inner, higher-index range
     * first would shift/invalidate the outer op's stale `endIndex`). The
     * true/kept branch only removes its own two marker paragraphs
     * (`kind: 'marker'`, each a single disjoint paragraph span that can never
     * overlap a nested op), so it's safe — and necessary, since the reserved-4
     * directives gate in `DocumentProcessor.process()` only skip content inside
     * a `kind: 'section'` range — to resolve nested children independently.
     * @param {{symbol: '#'|'^', expr: string, openIndex: number, openLength: number, closeIndex: number, closeLength: number, children: Array<Object>}} node
     * @param {Object} context Data context.
     * @returns {Array<{type: 'conditionalDelete', index: number, length: number, kind: 'section'|'marker'}>}
     * @private
     */
    _resolveConditionalSectionNode(node: ConditionalNode, context: object | null): ConditionalDelete[];
    _analyzeTextSubstitutions(textMatches: TextMatch[], context: object | null): TextSubstitution[];
    /**
     * @description Scans text runs for `{{table[source=<contextPath>, headerRow=<bool>]}}`
     * directives (ref REPORT_GLF.md B7) — the Docs-side analogue of the Sheets
     * `{{dynamic_columns[...]}}` directive: expands a data-driven table in place
     * at the marker's position. `source` must resolve to a non-empty 2D array
     * (`Array<Array<*>>`) already shaped as table rows/cells — unlike
     * `dynamic_columns`, which resolves a flat array item-by-item, a Docs table
     * has no per-cell Mustache expression of its own; the caller pre-shapes the
     * grid (e.g. via a Sheet read) before placing it on the context.
     * @param {Array<Object>} textMatches Scanned text runs (`scanDocumentStructure().textMatches`).
     * @param {Object} context Data context.
     * @returns {Array<{type: 'tableInsert', placeholder: string, data: Array<Array<*>>, options: Object}>} Resolved table-insert operations, in encounter order.
     */
    _analyzeTableInsertions(textMatches: TextMatch[], context: object | null): TableInsert[];
    /**
     * @description Parses the flat `key=value,key=value` param body of a
     * `{{table[...]}}` directive into a plain object.
     * @param {string} paramsStr Raw content between the placeholder's brackets.
     * @returns {Object<string,string>} Parsed key/value map (values are trimmed strings).
     * @private
     */
    _parseTableParams(paramsStr: string): Record<string, string>;
    _parseExpression(expression: string | null | undefined): {
        path: string;
        filters: ParsedFilter[];
    };
    _parseFilterArgs(argsString: string): ParsedArgument[];
    _parseArgValue(value: string): ParsedArgument;
}
