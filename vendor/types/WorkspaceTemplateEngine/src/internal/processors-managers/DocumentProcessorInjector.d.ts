import type { DocumentProcessor } from '../../processors/DocumentProcessor.js';
import type { TextRun, StyledSegment, RowLoop, ColumnLoop, BatchOperation, StructuralOperation, DocumentRequest, TextSubstitution, ConditionalDelete, DeleteRow, ListLoop, TableInsert, ProcessorElement } from '../../types.js';
export declare class DocumentProcessorInjector {
    facade: Pick<DocumentProcessor, 'logger' | 'mustache' | 'documentService' | '_createTextSubstitutionRequests' | '_createDeleteRowRequests' | '_createDeleteRangeRequests'>;
    constructor(facade: DocumentProcessorInjector['facade']);
    /**
     * @description Renders a cell/paragraph template into styled segments, using
     * MyMustache.renderSegments() to map each rendered span back to the original
     * template offset, then looking up which captured source run (if any)
     * overlapped that offset to carry its style forward. Shared by row-loop,
     * column-loop, and list-loop retext paths (Tasks 5/6/8); text substitution
     * (Task 7) uses the same _styleAt lookup directly against Advanced-API
     * updateTextStyle requests instead of native setAttributes.
     * @param {string} template Cell/paragraph template string (may contain no `{{`).
     * @param {Object} data Data item to render against.
     * @param {Array<{start:number, end:number, style:Object}>} [sourceRuns=[]] Captured source runs, template-relative offsets.
     * @returns {Array<{rendered: string, style: Object}>}
     * @private
     */
    _buildStyledSegments(template: string, data: unknown, sourceRuns?: TextRun[]): StyledSegment[];
    /**
     * @description Finds the captured source run whose [start,end) span contains
     * `offset` and returns its style, or {} if none overlaps.
     * @param {number} offset Template-relative character offset.
     * @param {Array<{start:number, end:number, style:Object}>} sourceRuns Captured source runs.
     * @returns {Object} Advanced-API TextStyle POJO (possibly empty).
     * @private
     */
    _styleAt(offset: number, sourceRuns: TextRun[]): GoogleAppsScript.Docs.Schema.TextStyle;
    /**
     * @description Rebases a set of captured source runs onto a new coordinate
     * origin, dropping/truncating any run that falls entirely before the shift
     * point. Used to correct `sourceRuns` (captured relative to a raw,
     * marker-included cell/paragraph text) so they line up with a
     * marker-stripped (and possibly further trimmed) template string before
     * being handed to `_buildStyledSegments`/`_styleAt` — otherwise offsets
     * captured against the raw text would be compared against the shorter
     * stripped template and misattribute styles. Same technique as the
     * list-loop `sourceRuns` rebase (filter overlap, subtract shift, clamp).
     * @param {Array<{start:number, end:number, style:Object}>} runs Source runs, relative to the pre-shift text.
     * @param {number} shift Number of leading characters removed between the pre-shift text and the target template.
     * @returns {Array<{start:number, end:number, style:Object}>} Runs re-based to the target template's own offsets.
     * @private
     */
    _rebaseSourceRuns(runs: TextRun[] | undefined, shift: number): TextRun[];
    _executeRowLoopOperation(documentId: string, op: Pick<RowLoop, 'tableIndex' | 'rowIndex' | 'dataArray' | 'markerCell' | 'sourceRuns'>): void;
    _executeColumnLoopOperation(documentId: string, op: Omit<ColumnLoop, 'index' | 'type'>): void;
    _convertOperationToRequests(op: BatchOperation | StructuralOperation | {
        type: string;
    }): DocumentRequest[];
    _createTextSubstitutionRequests(op: TextSubstitution): DocumentRequest[];
    /**
     * @description Builds a single `deleteContentRange` request spanning
     * `[op.index, op.index + op.length)`, deleting that span in full — including
     * any paragraph-terminating `\n` characters inside it, which is what
     * physically removes paragraph structure rather than just clearing text.
     * Shared paragraph-splice primitive for the generic `{{#expr}}`/`{{^expr}}`
     * conditional-section directive (see `_analyzeConditionalSections`):
     * `op.length` is either the marker paragraph's own raw length (marker-only
     * removal, content kept) or the full open-marker-to-close-marker span
     * (whole-block removal, content discarded).
     * @param {{index: number, length: number}} op Conditional-delete operation.
     * @returns {Array<Object>} Single-element `deleteContentRange` request array.
     */
    _createDeleteRangeRequests(op: ConditionalDelete): {
        deleteContentRange: {
            range: {
                startIndex: number;
                endIndex: number;
            };
        };
    }[];
    _createDeleteRowRequests(op: Pick<DeleteRow, 'type' | 'tableIndex' | 'rowIndex'>): {
        deleteTableRow: {
            tableCellLocation: {
                tableStartLocation: {
                    index: number;
                };
                rowIndex: number;
                columnIndex: number;
            };
        };
    }[];
    /**
     * @description Executes a bullet_list/number_list expansion natively: locates
     * the template paragraph via body.findText() (same traversal technique
     * DocumentTableManager.insertTableAtMarker already uses), copies it once per
     * data item via native Paragraph.copy() — which preserves the original's
     * bullet/number-list membership and nesting level with no preset-guessing —
     * retexts each copy with the rendered item (preserving captured run styles),
     * then removes the template paragraph. Reverse iteration at the same fixed
     * insertion position mirrors the row-loop/column-loop "Reverse-Order
     * Strategy" already established for this pipeline.
     * @param {string} documentId Target document identifier.
     * @param {Object} op {paragraphIndex, listType, dataArray, itemTemplate, fullMatch, sourceRuns}.
     */
    _executeListLoopOperation(documentId: string, op: Omit<ListLoop, 'index' | 'type'>): void;
    /**
     * @description Escapes JS regex metacharacters in `text` so it is safe to pass
     * to Google Docs' `Body.findText()`, which treats its argument as a regular
     * expression. `op.fullMatch` (the caller of this helper) is the entire raw
     * `{{#bullet_list:...}}...{{/bullet_list}}` block INCLUDING arbitrary
     * end-user-authored prose between the markers (and the markers' own `{`/`}`
     * are themselves regex metacharacters) — real template content can plausibly
     * contain parentheses, brackets, or `+`/`*`/`?` that would otherwise throw a
     * regex SyntaxError from findText and crash processing of an
     * otherwise-valid template.
     * @param {string} text Literal text to search for.
     * @returns {string} Regex-escaped text, safe to pass to `findText()`.
     * @private
     */
    _escapeForFindText(text: string): string;
    /**
     * @description Clears a paragraph's content and appends a sequence of styled
     * segments, re-applying each segment's captured style natively. Shared retext
     * primitive for the list-loop path (table cells use
     * DocumentService.setCellRunStyles instead, since they're a different native
     * element type).
     * @param {Paragraph} paragraph Native DocumentApp Paragraph element.
     * @param {Array<{rendered: string, style: Object}>} segments Ordered text+style segments.
     * @private
     */
    _retextParagraph(paragraph: ProcessorElement, segments: StyledSegment[]): void;
    /**
     * @description Executes a `{{table[source=...]}}` directive (ref REPORT_GLF.md
     * B7): inserts the resolved 2D array as a table immediately after the
     * marker's containing element (native DocumentApp API, via
     * `DocumentTableManager.insertTableAtMarker`), then removes the marker text
     * itself via the Advanced Docs API (`batchReplaceText`) — mirroring the
     * find-placeholder/remove-text split ALDO's own `DocumentTableFacade`
     * workaround used, now inside the library.
     * @param {string} documentId Target document identifier.
     * @param {{placeholder: string, data: Array<Array<*>>, options: Object}} op Table-insert operation.
     */
    _executeTableInsertOperation(documentId: string, op: Omit<TableInsert, 'type'>): void;
    _flushDocumentChanges(documentId: string): boolean;
}
