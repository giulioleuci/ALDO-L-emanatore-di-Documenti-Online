/**
 * @file GoogleApiWrapper/src/internal/services-managers/TextStyleMapper.js
 * @description Converts an Advanced Docs API TextStyle POJO (as captured by
 * DocumentContentExtractor at scan time) into the native DocumentApp.Attribute
 * object shape required by Text.setAttributes(). Native-only boundary (L2).
 */
export declare class TextStyleMapper {
    /**
     * @param {Object} textStyle Advanced-API TextStyle POJO, any subset of fields.
     * @returns {Object} Native DocumentApp.Attribute-keyed object; only fields present in `textStyle` are included.
     */
    static toNativeAttributes(textStyle: GoogleAppsScript.Docs.Schema.TextStyle | null | undefined): Record<string, string | number | boolean>;
    /**
     * @param {Object} rgbColor {red?, green?, blue?} floats in [0,1]; missing channels default to 0.
     * @returns {string} '#rrggbb' hex color.
     * @private
     */
    static _rgbColorToHex(rgbColor: GoogleAppsScript.Docs.Schema.RgbColor): string;
}
