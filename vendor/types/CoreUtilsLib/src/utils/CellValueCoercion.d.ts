/**
 * @file CoreUtilsLib/src/utils/CellValueCoercion.js
 * @description Centralized Sheets-cell-value coercion (string -> number/boolean)
 * shared by libraries that read raw Sheets API values and need consistent
 * primitive normalization (e.g. SheetDBLib's TableService, GasDataImporter's
 * SourceStrategy). Ported 1:1 from the duplicated `_coerceValue` implementations.
 */
/**
 * Static utilities for normalizing raw Sheets API cell values into JS
 * primitives. Stateless, so all methods are static (matches the
 * `HtmlSanitizer`/`ValidationUtils` convention used elsewhere in this library).
 * @class
 */
export declare class CellValueCoercion {
    /**
     * Normalizes a raw Sheets API cell value into a JS primitive (number,
     * boolean) when possible, otherwise returns the original value unchanged.
     * @param {*} value Raw cell data.
     * @returns {*} Coerced primitive, or the original value if not coercible.
     */
    static coerceValue(value: unknown): unknown;
}
