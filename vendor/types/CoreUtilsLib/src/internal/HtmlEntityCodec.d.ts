/**
 * Escapes text for an HTML text node while preserving the legacy five-character
 * output used by HtmlSanitizer.
 * @param {*} value Raw value; nullish values become an empty string.
 * @returns {string} HTML-escaped text.
 */
export declare function escapeHtmlText(value: unknown): string;
/**
 * Decodes HTML entities in a null-safe input value.
 * @param {*} value Entity-encoded text; nullish values become an empty string.
 * @returns {string} Decoded text.
 */
export declare function decodeHtmlEntities(value: unknown): string;
