/**
 * @file CoreUtilsLib/src/utils/StringUtils.js
 * @description Extracted StringUtils utility module.
 */
export declare class StringUtils {
    /**
     * Truncates string to maximum length, appending a suffix if content exceeds limit.
     * @param {string} str Input string.
     * @param {number} maxLength Total allowed length including suffix.
     * @param {string} [suffix='...'] Truncation indicator.
     * @returns {string} Truncated result.
     */
    truncate(str: string | null | undefined, maxLength: number, suffix?: string): string | null | undefined;
    /**
     * Converts the first character of the string to uppercase.
     * @param {string} str Input string.
     * @returns {string} String with capitalized first character.
     */
    capitalize(str: string | null | undefined): string | null | undefined;
    /**
     * Native implementation to convert hyphenated, underscored, or spaced strings to camelCase.
     * @param {string} str Input string.
     * @returns {string} Lower camelCase string.
     */
    toCamelCase(str: string | null | undefined): string | null | undefined;
    /**
     * Native implementation to convert camelCase or PascalCase strings to snake_case.
     * @param {string} str Input string.
     * @returns {string} Underscored lowercase string.
     */
    toSnakeCase(str: string | null | undefined): string | null | undefined;
    /**
     * Lodash-based conversion of string to lower camelCase.
     * @param {string} str Input string.
     * @returns {string} camelCase string.
     */
    camelCase(str: unknown): string;
    /**
     * Lodash-based conversion of string to hyphenated kebab-case.
     * @param {string} str Input string.
     * @returns {string} kebab-case string.
     */
    kebabCase(str: unknown): string;
    /**
     * Lodash-based conversion of string to underscored snake_case.
     * @param {string} str Input string.
     * @returns {string} snake_case string.
     */
    snakeCase(str: unknown): string;
    /**
     * Lodash-based conversion of string to Start Case (space-separated, first letter of words capitalized).
     * @param {string} str Input string.
     * @returns {string} Start Case string.
     */
    startCase(str: unknown): string;
    /**
     * Lodash-based conversion of string to PascalCase (UpperCamelCase).
     * @param {string} str Input string.
     * @returns {string} PascalCase string.
     */
    pascalCase(str: unknown): string;
    /**
     * Lodash-based conversion of string to CONSTANT_CASE (SCREAMING_SNAKE_CASE).
     * @param {string} str Input string.
     * @returns {string} CONSTANT_CASE string.
     */
    constantCase(str: unknown): string;
    /**
     * Lodash-based conversion of string to dot.case notation.
     * @param {string} str Input string.
     * @returns {string} dot.case string.
     */
    dotCase(str: unknown): string;
    /**
     * Lodash-based conversion of string to path/case notation.
     * @param {string} str Input string.
     * @returns {string} path/case string.
     */
    pathCase(str: unknown): string;
    /**
     * Decomposes any format string (camel, Pascal, snake, etc.) into an array of lowercase words.
     * @param {string} str Input string to decompose.
     * @returns {string[]} Ordered array of lowercase word components.
     */
    stringToArray(str: unknown): string[];
    /**
     * Transforms technical paths or identifiers into human-readable text using specified separators.
     * @param {string} path Technical identifier or file path.
     * @param {string} [separator=' > '] Segment separator for output.
     * @returns {string} Human-readable path representation.
     */
    humanisePath(path: unknown, separator?: string): string;
}
