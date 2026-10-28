/**
 * @file SheetDBLib/src/query/managers/AdvancedQueryParser.js
 * @description Internal classes and functions for parsing and representing query structures.
 */
/**
 * @description Verifies if a value is strictly null or undefined.
 * @param {*} value - The value to verify.
 * @returns {boolean} True if the value is null-ish.
 * @private
 */
declare function _isNullOrUndefined(value: unknown): value is null | undefined;
/**
 * @description Coerces a value to float, providing a fallback for NaN results.
 * @param {*} value - The input value to parse.
 * @param {number} [defaultValue=0] - Fallback if parsing fails.
 * @returns {number} The parsed float or default value.
 * @private
 */
declare function _safeParseFloat(value: unknown, defaultValue?: number): number;
/**
 * @description Executes relational comparison between two operands based on a string operator.
 * Supports standard equality, inequality, range checks, LIKE (regex-based), IN (collection), and CONTAINS.
 * @param {*} leftValue - Primary operand.
 * @param {string} operator - Relational operator (e.g., '=', '>=', 'LIKE', 'IN').
 * @param {*} rightValue - Secondary operand or collection.
 * @returns {boolean} Evaluation result.
 * @private
 */
declare function _compareValues(leftValue: unknown, operator: string | undefined, rightValue: unknown): boolean;
import type { RowRecord } from '../../types.js';
/**
 * @class QueryAggregation
 * @description Operational model for computing scalar aggregations over record collections.
 * Supports COUNT, SUM, AVG, MIN, and MAX operations with automatic float coercion.
 */
export declare class QueryAggregation {
    function: string;
    field: string;
    alias: string;
    /**
     * @param {string} functionName - Aggregation type (e.g., 'SUM', 'AVG').
     * @param {string} field - Target field path for computation.
     * @param {string} [alias=null] - Output field name for the aggregated value.
     */
    constructor(functionName: string, field: string, alias?: string | null);
    /**
     * @description Internal field resolution supporting path-prefix handling.
     * @param {Object} row - Data record.
     * @param {string} field - Target identifier.
     * @returns {*} Resolved value or undefined.
     * @private
     */
    _getFieldValue(row: RowRecord, field: string): unknown;
    /**
     * @description Computes the configured aggregation over a collection of records.
     * @param {Object[]} rows - Data set to process.
     * @returns {number|null} Scalar result or null if input is empty/invalid.
     */
    calculate(rows: RowRecord[] | null | undefined): number | null;
}
export declare const AdvancedQueryParser: {
    _isNullOrUndefined: typeof _isNullOrUndefined;
    _safeParseFloat: typeof _safeParseFloat;
    _compareValues: typeof _compareValues;
};
export {};
