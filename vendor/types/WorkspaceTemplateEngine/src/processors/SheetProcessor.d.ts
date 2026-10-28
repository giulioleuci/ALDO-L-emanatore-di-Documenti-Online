import type { TemplateLogger, ProcessorHost, ProcessorSpreadsheetService, SheetValueRequest, ProtectionRequest, SheetLayout, SheetInfo } from '../types.js';
/**
 * @description Specialized engine for Google Sheets template expansion using batch-first strategy.
 * Implements cell-level substitutions and structural expansions (matrices, dynamic columns) in atomic updates.
 * @class
 * @private
 */
declare class _SheetProcessor {
    mustache: Pick<ProcessorHost['mustache'], 'render' | 'getValue'>;
    logger: TemplateLogger;
    spreadsheetService: ProcessorSpreadsheetService;
    /**
     * @description Initializes the processor with stubs for SpreadsheetService dependencies.
     * @param {PlaceholderService} placeholderService Facade providing rendering and logging.
     */
    constructor(placeholderService: {
        logger: TemplateLogger;
        mustache: _SheetProcessor['mustache'];
    });
    /**
     * @description Orchestrates the scan-and-batch processing workflow for a spreadsheet.
     * Scans sheets for `{{...}}` tokens, resolves operations (matrix vs. substitution), and executes a single batch update.
     * @param {string} sheetId Target spreadsheet identifier.
     * @param {Object} context Data context for substitution.
     * @param {string|null} sheetName Specific sheet name or null for all.
     * @returns {{layouts: Array<{sheetName: string, headerRow: number, startColumn: number, columns: Array<{header: *, column: number, isLabel: boolean, item: *}>}>}} The resolved `dynamic_columns` layouts found while scanning, in encounter order.
     */
    process(sheetId: string, context: object | null, sheetName?: string | null): {
        layouts: SheetLayout[];
    };
    /**
     * @description Parses the flat `key=value,key=value` param body of a
     * `{{dynamic_columns[...]}}` placeholder into a plain object.
     * @param {string} paramsStr Raw content between the placeholder's brackets.
     * @returns {Object<string,string>} Parsed key/value map (values are trimmed strings).
     * @private
     */
    _parseDynamicColumnParams(paramsStr: string): Record<string, string>;
    /**
     * @description Buckets a flat dynamic_columns param map into an ordered list of
     * column groups. Group 1 (the original single-group syntax) uses unsuffixed keys
     * (`source`, `value`, `acl`, `scope`). Each subsequent group N (N >= 2) uses the
     * numbered-suffix keys `sourceN`, `valueN`, `aclN`, `scopeN`, and optionally `labelN`
     * — a context-path resolved ONCE per group (not per item) and rendered as a single
     * non-data, no-ACL separator column immediately before that group's items. This is
     * additive/backward-compatible: when no numbered keys are present, the result is a
     * single-element array equivalent to the pre-existing flat parse, so the rendering
     * loop degenerates to exactly today's single-group behavior.
     * @param {Object<string,string>} params Flat parsed params (see `_parseDynamicColumnParams`).
     * @returns {Array<{source: string|undefined, value: string|undefined, acl: string|undefined, scope: string, label: string|undefined}>} Ordered groups; empty array if no `source` key exists at all.
     * @private
     */
    _bucketDynamicColumnGroups(params: Record<string, string>): {
        source: string;
        value: string;
        acl: string;
        scope: string;
        label: string;
    }[];
    /**
     * @description Generates batch update and protection requests for dynamic column expansion.
     * Parses `{{dynamic_columns[...]}}` syntax to expand array data horizontally with ACL protections.
     *
     * Supports N sequential column groups from a single placeholder cell, placed as
     * contiguous blocks in declared order starting at the placeholder's own position.
     * Group 1 uses the original flat keys (`source=`, `value=`, `acl=`, `scope=`).
     * Group 2+ use numbered-suffix keys (`source2=`, `value2=`, `acl2=`, `scope2=`,
     * `label2=`, `source3=`, ... ). If a group (from the 2nd onward) declares a `labelN=`
     * param, one non-data, non-ACL separator column is inserted immediately before that
     * group's items, with its text resolved ONCE against the whole context (not per item).
     * Single-group placeholders (no numbered keys) render byte-identically to the
     * pre-multi-group implementation, plus the additive `layout` field below.
     *
     * @param {string} sheetName Target sheet name.
     * @param {number} startRow Starting row index (1-based).
     * @param {number} startColumn Starting column index (1-based).
     * @param {string} placeholder Raw placeholder string.
     * @param {Object} context Data context.
     * @returns {{valueRequests: Object[], protectionRequests: Object[], layout: ({sheetName: string, headerRow: number, startColumn: number, columns: Array<{header: *, column: number, isLabel: boolean, item: *}>}|null)}} Batch requests plus the resolved column layout (null when nothing was rendered).
     * @private
     */
    _prepareDynamicColumnRequests(sheetName: string, startRow: number, startColumn: number, placeholder: string, context: object | null): {
        valueRequests: SheetValueRequest[];
        protectionRequests: ProtectionRequest[];
        layout: SheetLayout | null;
    };
    /**
     * @description Generates batch update requests for vertical (row-wise) array expansion.
     * Parses `{{dynamic_rows[source=...,value=...]}}` syntax — the vertical mirror of
     * `{{dynamic_columns[...]}}`: one row per source-array item, downward from the placeholder
     * cell. Single-group only (no multi-group, no acl/scope) — deliberately smaller than
     * dynamic_columns since no caller needs per-row protection or multiple sequential groups.
     * @param {string} sheetName Target sheet name.
     * @param {number} startRow Starting row index (1-based).
     * @param {number} startColumn Starting column index (1-based).
     * @param {string} placeholder Raw placeholder string.
     * @param {Object} context Data context.
     * @returns {{valueRequests: Object[]}} Batch value-update requests.
     * @private
     */
    _prepareDynamicRowRequests(sheetName: string, startRow: number, startColumn: number, placeholder: string, context: object | null): {
        valueRequests: SheetValueRequest[];
    };
    /**
     * @description Batch applies range protections after clearing existing ones with matching descriptions.
     * Ensures idempotency by deleting prior dynamic protections before applying the new set.
     * @param {string} spreadsheetId target spreadsheet.
     * @param {Object[]} protectionRequests Array of protection configurations.
     * @private
     */
    _applyProtections(spreadsheetId: string, protectionRequests: ProtectionRequest[]): void;
    /**
     * @description Generates batch requests for expanding an array of objects into a table grid.
     * Parses `{{matrice_dati[...]}}` syntax to render headers and data rows.
     * @param {string} sheetName Target sheet name.
     * @param {number} startRow Top-left row index.
     * @param {number} startColumn Top-left column index.
     * @param {string} placeholder Raw placeholder.
     * @param {Object} context Data context.
     * @returns {Object[]} Collection of update requests.
     * @private
     */
    _prepareMatrixRequests(sheetName: string, startRow: number, startColumn: number, placeholder: string, context: object | null): SheetValueRequest[];
    /**
     * @description Proactively expands sheet dimensions if batch requests exceed current grid limits.
     * Analyzes A1 ranges in requests to calculate the required row/column count and triggers expansion via API.
     * @param {string} spreadsheetId target spreadsheet.
     * @param {Object[]} sheets Array of sheet metadata.
     * @param {Object[]} batchRequests Collection of planned updates.
     * @private
     */
    _expandGridIfNeeded(spreadsheetId: string, sheets: SheetInfo[], batchRequests: SheetValueRequest[]): void;
    /**
     * @description Converts a 1-based column number to its alphabetical A1 notation (e.g., 27 -> "AA").
     * @param {number} column Column index.
     * @returns {string} Alphabetical column label.
     * @private
     */
    _columnToLetter(column: number): string;
    /**
     * @description Formats row/column coordinates into standard A1 or range notation.
     * @param {number} startRow Starting row.
     * @param {number} startColumn Starting column.
     * @param {number} endRow Ending row.
     * @param {number} endColumn Ending column.
     * @returns {string} Range string (e.g., "A1" or "A1:B10").
     * @private
     */
    _rangeToA1(startRow: number, startColumn: number, endRow: number, endColumn: number): string;
}
export { _SheetProcessor as SheetProcessor };
