/**
 * @file CoreUtilsLib/src/utils/HtmlSanitizer.js
 * @description Centralized HTML-context escaping utilities (XSS prevention) for
 * rendering sheet-sourced free text/colours/URLs into generated HTML (e.g. ALDO
 * email boxes). Ported 1:1 from ALDO's `src/application/email/boxes.ts`.
 */
/**
 * Static utilities for escaping/validating sheet-sourced values before HTML
 * interpolation. Stateless, so all methods are static (matches the
 * `ValidationUtils` convention used elsewhere in this library).
 * @class
 */
export declare class HtmlSanitizer {
    /**
     * Escapes `&`, `<`, `>`, `"`, `'` so free text is safe to interpolate into
     * HTML markup (e.g. names, notes, error strings sourced from sheets).
     * Null-safe: `null`/`undefined` are coerced to `''` (not the throw or the
     * literal string `"null"`).
     * @param {*} value Raw text (coerced to string; `null`/`undefined` become `''`).
     * @returns {string} HTML-escaped text.
     */
    static escapeHtml(value: unknown): string;
    /**
     * Validates a sheet-sourced colour value going into a style attribute: only
     * hex codes (`#` + 3-8 hex digits) or bare CSS colour keywords pass.
     * @param {string} value Raw colour value.
     * @param {string} fallback Value returned when `value` fails validation.
     * @returns {string} `value` if safe, otherwise `fallback`.
     */
    static safeColor(value: string, fallback: string): string;
    /**
     * Validates a sheet-sourced link target: only `http(s)` URLs pass (blocks
     * `javascript:`/`data:`/other schemes). Input is trimmed before testing and
     * before being returned.
     * @param {string} value Raw URL value.
     * @returns {string} The trimmed URL if safe, otherwise `'#'`.
     */
    static safeUrl(value: string): string;
    /**
     * Recursively walks a plain object/array (e.g. a CDU context) and HTML-escapes
     * every string leaf via {@link HtmlSanitizer.escapeHtml}, returning a **new**
     * structure — the input is never mutated. Intended for callers who must render
     * an admin-authored Mustache template (`{{var}}`, which does not itself escape)
     * against untrusted data (e.g. student/parent names imported from spreadsheets)
     * into an HTML email body: escape the context once with this method, then pass
     * the result into the existing (non-escaping) `processString`/`render`.
     *
     * Non-string leaves (numbers, booleans, `null`, `undefined`) are returned
     * unchanged — they are not coerced to strings, so template logic that branches
     * on falsiness/type (e.g. `{{#count}}`) keeps working. Only plain objects
     * (object literals, or objects with `null` prototype) and arrays are recursed
     * into; other object types (`Date`, class instances, functions, etc.) are
     * returned as-is, unescaped and unrecursed, since walking their internals
     * could break them (e.g. a `Date`'s methods) or silently discard data.
     * @param {*} value Raw value — typically a context object, but any shape is
     *   accepted (arrays and primitives included) since the function recurses.
     * @returns {*} A deep copy with every string leaf HTML-escaped; non-plain
     *   objects/functions/primitives other than strings pass through unchanged.
     */
    static escapeContextDeep<T>(value: T): T;
    /**
     * Strips HTML markup down to plain text: block-level boundaries (`<br>`,
     * `</p>`, `</div>`, `</li>`, `</tr>`) become line breaks BEFORE remaining
     * tags are stripped (so paragraph/list/row structure survives as line
     * breaks, not word-run-together text), HTML entities are decoded, blank-line
     * runs collapse, and the result is trimmed. Null-safe.
     * @param {*} value Raw HTML (coerced to string; `null`/`undefined` become `''`).
     * @param {{maxLength?: number, truncationMode?: 'marker'|'cut'|'none'}} [options]
     *   `maxLength` (default 2000) is the maximum returned length. `truncationMode`
     *   (default `'marker'`) cuts to `maxLength - 1` chars and appends `'…'` (total
     *   length ≤ `maxLength`); `'cut'` truncates to exactly `maxLength` with no
     *   marker; `'none'` never truncates.
     * @returns {string} Plain text, line-break-preserving, optionally truncated.
     */
    static stripToPlainText(value: unknown, options?: {
        maxLength?: number;
        truncationMode?: 'marker' | 'cut' | 'none';
    }): string;
}
