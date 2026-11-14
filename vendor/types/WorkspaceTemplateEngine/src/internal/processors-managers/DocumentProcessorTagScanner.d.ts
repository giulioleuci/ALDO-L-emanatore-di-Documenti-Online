import type { DocumentProcessor } from '../../processors/DocumentProcessor.js';
import type { ScannedTable, TextMatch, ColumnLoop, RowLoop, DeleteRow, ListLoop, ListLoopChild, ListLoopSurround, TextRun, ConditionalDelete, TextSubstitution, TableInsert, ConditionalNode, ParsedFilter, ParsedArgument } from '../../types.js';
/**
 * @file WorkspaceTemplateEngine/src/processors/managers/DocumentProcessorTagScanner.js
 * @description Manager for scanning and analyzing document structure for template tags.
 */
import { MustacheContext as _MustacheContext } from '../../facades/Mustache.js';
interface ListBlockNode {
    tagName: string;
    listType: string;
    expr: string;
    start: number;
    bodyStart: number;
    bodyEnd: number;
    end: number;
    children: ListBlockNode[];
}
export declare class DocumentProcessorTagScanner {
    facade: Pick<DocumentProcessor, 'logger' | 'mustache' | 'MAX_ITERATIONS' | 'MAX_TEMPLATE_MATCH_SIZE' | '_parseExpression' | '_applyFilters' | '_parseFilterArgs' | '_parseArgValue'>;
    constructor(facade: DocumentProcessorTagScanner['facade']);
    _analyzeColumnLoops(table: ScannedTable, context: object | null): ColumnLoop[];
    _analyzeRowLoops(table: ScannedTable, context: object | null): (RowLoop | DeleteRow)[];
    _analyzeListLoops(textMatches: TextMatch[], context: object | null): ListLoop[];
    /**
     * @description Parses the `{{#bullet_list:expr}}...{{/bullet_list}}` /
     * `{{#number_list:expr}}...{{/number_list}}` block opening at `start`,
     * matching each closing tag to its own opener (depth-aware, so a list of the
     * same type can nest).
     * @param {string} text Raw paragraph text.
     * @param {number} start Offset of the outermost opening tag.
     * @returns {Object|null} Block tree, or null when the block is never closed.
     * @private
     */
    _parseListBlock(text: string, start: number): ListBlockNode | null;
    /**
     * @description Resolves a list data source against `context` (applying pipe
     * filters) and enforces MAX_ITERATIONS.
     * @returns {Array|null} The array, or null when the path is not an array.
     * @private
     */
    _resolveListData(expr: string, context: _MustacheContext): unknown[] | null;
    /**
     * @description Item template of one list block: its body with any nested list
     * blocks cut out, trimmed. `runs` (captured relative to the RAW paragraph text)
     * are rebased onto the template's own offsets so downstream style lookups
     * (_buildStyledSegments/_styleAt) compare like-for-like.
     * @private
     */
    _listItemTemplate(text: string, node: ListBlockNode, runs: TextRun[]): {
        itemTemplate: string;
        sourceRuns: TextRun[];
    };
    /**
     * @description For every item of `dataArray`, resolves the lists nested inside
     * `node` against that item (falling back to the outer contexts). A nested list
     * whose data is missing or not an array yields no entry — that item simply
     * has no sub-list.
     * @returns {Array<Array<Object>>} One array of sub-lists per item, aligned with `dataArray`.
     * @private
     */
    _buildListChildren(node: ListBlockNode, dataArray: unknown[], text: string, runs: TextRun[], context: _MustacheContext): ListLoopChild[][];
    /**
     * @description Renders a paragraph that holds text besides its
     * `{{#bullet_list:...}}...{{/bullet_list}}` block. The block is swapped for a
     * same-length run of U+E000 (so captured run offsets stay valid) and the whole
     * paragraph is rendered once: that evaluates any enclosing inline
     * `{{#x}}...{{/x}}` / `{{^x}}...{{/x}}` section, then the rendered text is
     * split at the surviving run into the part before and after the list. If no
     * run survives, an enclosing section discarded the list (`hasList: false`) and
     * `before` is the whole rendered paragraph.
     * @param {string} fullText Raw paragraph text.
     * @param {number} start Offset of the list block in `fullText`.
     * @param {number} length Length of the list block.
     * @param {Object|null} context Data context.
     * @param {Array<Object>} runs Captured paragraph runs (raw-text offsets).
     * @returns {{before: Array<Object>, after: Array<Object>, hasList: boolean}}
     * @private
     */
    _renderListSurround(fullText: string, start: number, length: number, context: object | null, runs: TextRun[]): ListLoopSurround;
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
export {};
