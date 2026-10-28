import type { ImportRow, ImporterLogger, ImporterExpression, ImporterUtils, Normalization, TransformConfig } from '../types.js';
/**
 * Orchestrator for the data transformation phase, managing column mapping, calculated field evaluation, data normalization, and record validation.
 * @class
 */
declare class Transformer {
    _logger: ImporterLogger;
    _expressionEngine: ImporterExpression | null;
    _utils: ImporterUtils;
    /**
     * @param {Object} [logger=console] Diagnostic output interface.
     * @param {Object|null} [expressionEngine=null] GasExpressionEngineLib service for computed fields.
     * @param {Object|null} [utils=null] CoreUtilsLib service for common utilities.
     */
    constructor(logger?: ImporterLogger, expressionEngine?: ImporterExpression | null, utils?: ImporterUtils | null);
    /**
     * Processes a collection of raw data rows according to the specified transformation recipe.
     * @param {Array<Object>} sourceData Collection of raw input rows.
     * @param {Object} transformConfig transformation rules (mapping, calculated, normalization, validation).
     * @returns {Array<Object>} Transformed and filtered row collection.
     * @throws {TransformError} If input is malformed or a fatal transformation failure occurs.
     */
    transform<Row extends object>(sourceData: Row[], transformConfig?: {
        mapping?: undefined;
        calculated?: undefined;
        normalization?: undefined;
        validation?: string | string[];
    } | null): Row[];
    transform(sourceData: object[], transformConfig: TransformConfig): ImportRow[];
    /**
     * Executes the sequential transformation pipeline for a single data record.
     * @private
     * @param {Object} sourceRow raw input attributes.
     * @param {number} rowIndex record position for diagnostic tracking.
     * @param {Object} mapping field renaming rules.
     * @param {Object} calculated computed field expressions.
     * @param {Object} normalization data cleaning rules.
     * @param {Object} validation record-level integrity checks.
     * @returns {Object|null} Transformed record or null if validation fails.
     * @throws {TransformError} On circular dependencies or unrecoverable row failures.
     */
    _transformRow(sourceRow: object, rowIndex: number, mapping: Record<string, string>, calculated: Record<string, string | null | undefined>, normalization: Normalization, validation: string | string[] | null): ImportRow | null;
    /**
     * Transforms row attributes according to the provided mapping schema, renaming source columns to target identifiers.
     * @private
     * @param {Object} sourceRow raw input record.
     * @param {Object} mapping field renaming rules.
     * @returns {Object} mapped record state.
     */
    _applyMapping(sourceRow: object, mapping: Record<string, string>): ImportRow;
    /**
     * Evaluates computed field expressions, managing dependency resolution and topological execution order.
     * @private
     * @param {Object} row current record state.
     * @param {Object} calculated map of field names to logic expressions.
     * @returns {Object} record state updated with computed values.
     * @throws {TransformError} If a circular dependency is detected or evaluation fails.
     */
    _applyCalculated(row: ImportRow, calculated: Record<string, string | null | undefined>): ImportRow;
    /**
     * @private
     */
    _buildDependencyGraph(calculated: Record<string, string | null | undefined>): Map<string, Set<string>>;
    /**
     * @private
     */
    _extractPlaceholders(expression: unknown): string[];
    /**
     * @private
     */
    _topologicalSort(graph: Map<string, Set<string>>): string[];
    /**
     * @private
     */
    _evaluateExpression(expression: string | null | undefined, context: ImportRow): unknown;
    /**
     * @private
     */
    _simpleTemplateSubstitution(template: string, context: ImportRow): string;
    /**
     * Normalizes a raw input value into a formatted date string using CoreUtilsLib parsing and formatting.
     * @private
     * @param {*} value Raw temporal input.
     * @param {string} format target date pattern (e.g., 'YYYY-MM-DD').
     * @returns {string|*} Formatted date string or original value if parsing fails.
     */
    _formatDate(value: unknown, format: string): unknown;
    /**
     * Orchestrates data cleaning tasks including whitespace trimming, case normalization, and date reformatting.
     * @private
     * @param {Object} row raw record state.
     * @param {Object} normalization set of cleaning rules (trim, dateColumns, uppercaseColumns, lowercaseColumns).
     * @returns {Object} normalized record state.
     */
    _applyNormalization(row: ImportRow, normalization: Normalization): {
        [x: string]: unknown;
    };
    /**
     * Evaluates record-level integrity rules against a transformed row, rejecting records that fail any predicate.
     * @private
     * @param {Object} row transformed record attributes.
     * @param {string|Array<string>} validation Logic expression or collection of rules.
     * @param {number} rowIndex record position for diagnostic logging.
     * @returns {boolean} True if all validation predicates are satisfied.
     */
    _applyValidation(row: ImportRow, validation: string | string[] | null, rowIndex: number): boolean;
}
export { Transformer };
