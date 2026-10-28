/**
 * @file GasExpressionEngineLib/src/internal/builtins/StringFunctions.js
 * @description Built-in string manipulation functions for expression evaluation.
 *              Extracted from ExpressionEvaluatorService#_builtInFunctions (GEL-HIGH-001).
 * @version 1.0.0
 */
/**
 * Builds the string built-in functions map.
 * @returns {Object<string, Function>} Map of string function name to implementation.
 */
export declare function createStringFunctions(): {
    /**
     * Returns the length of a string.
     *
     * @param {*} str - The string to measure (converted to string if not already)
     * @returns {number} The length of the string, or 0 if null/undefined
     *
     * @example
     * len('hello') // Returns: 5
     * len({{name}}) // Returns length of name value
     * len(null) // Returns: 0
     */
    len: (str: unknown) => number;
    /**
     * Converts a string to uppercase.
     *
     * @param {*} str - The string to convert (converted to string if not already)
     * @returns {string} The uppercase string, or empty string if null/undefined
     *
     * @example
     * upper('hello') // Returns: 'HELLO'
     * upper({{status}}) // Returns uppercase status value
     * upper(null) // Returns: ''
     */
    upper: (str: unknown) => string;
    /**
     * Converts a string to lowercase.
     *
     * @param {*} str - The string to convert (converted to string if not already)
     * @returns {string} The lowercase string, or empty string if null/undefined
     *
     * @example
     * lower('HELLO') // Returns: 'hello'
     * lower({{name}}) // Returns lowercase name value
     * lower(null) // Returns: ''
     */
    lower: (str: unknown) => string;
    /**
     * Trims whitespace from both ends of a string.
     *
     * @param {*} str - The string to trim (converted to string if not already)
     * @returns {string} The trimmed string, or empty string if null/undefined
     *
     * @example
     * trim('  hello  ') // Returns: 'hello'
     * trim({{input}}) // Returns trimmed input value
     * trim(null) // Returns: ''
     */
    trim: (str: unknown) => string;
    /**
     * Extracts a substring from start index to end index (exclusive).
     *
     * @param {*} str - The source string (converted to string if not already)
     * @param {number} start - The starting index (0-based, inclusive)
     * @param {number} [end] - The ending index (0-based, exclusive). If omitted, extracts to end of string.
     * @returns {string} The extracted substring, or empty string if str is null/undefined
     *
     * @example
     * substring('hello', 0, 3) // Returns: 'hel'
     * substring('hello', 2) // Returns: 'llo'
     * substring({{name}}, 0, 5) // Returns first 5 characters of name
     */
    substring: (str: unknown, start: number | undefined, end?: number) => string;
    /**
     * Replaces all occurrences of a substring with another string.
     *
     * Uses global regex replacement to replace all occurrences.
     *
     * @param {*} str - The source string (converted to string if not already)
     * @param {*} search - The substring to search for (converted to string, treated as literal)
     * @param {*} replacement - The replacement string (converted to string)
     * @returns {string} The string with all replacements made, or original string if search is null
     *
     * @example
     * replace('hello world', 'o', '0') // Returns: 'hell0 w0rld'
     * replace({{text}}, 'old', 'new') // Replaces all 'old' with 'new'
     * replace('test', null, 'x') // Returns: 'test' (no replacement)
     */
    replace: (str: unknown, search: unknown, replacement: unknown) => string;
    /**
     * Splits a string by a delimiter into an array.
     *
     * @param {*} str - The source string (converted to string if not already)
     * @param {*} delimiter - The delimiter to split on (converted to string). If empty string, splits into individual characters.
     * @returns {Array<string>} Array of substrings, or empty array if str is null/undefined
     *
     * @example
     * split('a,b,c', ',') // Returns: ['a', 'b', 'c']
     * split('hello', '') // Returns: ['h', 'e', 'l', 'l', 'o']
     * split({{csv}}, ',') // Splits CSV value into array
     */
    split: (str: unknown, delimiter: unknown) => string[];
};
