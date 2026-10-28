/**
 * @file CoreUtilsLib/src/LodashFacade.js
 * @description Centralized facade for utility functions using a Hybrid Approach.
 *
 * This module provides a unified interface to utility functions, employing a
 * Strategic Hybrid Approach for optimal performance in Google Apps Script V8:
 * 1. **Native JS**: Used for trivial utilities (compact, flatten, isString, etc.)
 *    to eliminate overhead and minimize external dependencies.
 * 2. **es-toolkit/compat**: Retained for complex, edge-case utilities
 *    (cloneDeep, merge, get, set, debounce) where external testing adds high value.
 *
 * **Benefits:**
 * - Minimal bundle size via native code for common patterns
 * - Robustness via es-toolkit for complex data transformations
 * - Full API compatibility with existing library usage
 * - Optimized for GAS V8 runtime
 *
 * **Exported Categories:**
 *
 * **Array Utilities:**
 * - chunk, compact (native), difference, differenceBy, flatten (native), flattenDeep
 * - groupBy, intersection, keyBy, orderBy, uniq (native), uniqBy
 *
 * **Object Utilities:**
 * - cloneDeep, get, has, mapKeys, mapValues, merge, omit, pick, set
 *
 * **Collection Utilities:**
 * - every, filter, find, forEach, map, reduce, size, some
 *
 * **String Utilities:**
 * - camelCase, capitalize, kebabCase, snakeCase, startCase, truncate
 * - pascalCase, constantCase, dotCase, pathCase (custom)
 * - stringToArray, humanisePath (custom)
 *
 * **Type Checking:**
 * - isEmpty (native), isEqual, isNil (native), isNumber (native), isString (native)
 *
 * **Math Utilities:**
 * - maxBy, meanBy, minBy, sumBy
 *
 * **Function Utilities:**
 * - debounce, once, noop
 *
 * @module LodashFacade
 * @version 1.1.0
 */
import { chunk, difference, differenceBy, flattenDeep, groupBy, intersection, keyBy, orderBy, uniqBy } from 'es-toolkit/compat';
export declare const compact: {
    <T>(arr: readonly T[]): T[];
    (arr: unknown): unknown[];
};
export declare const flatten: {
    <T>(arr: readonly T[]): FlatArray<T, 1>[];
    (arr: unknown): unknown[];
};
export declare const uniq: {
    <T>(arr: readonly T[]): T[];
    (arr: unknown): unknown[];
};
import { cloneDeep, get, has, mapKeys, mapValues, merge, omit, pick, set } from 'es-toolkit/compat';
import { every, filter, find, forEach, map, reduce, size, some } from 'es-toolkit/compat';
import { camelCase, capitalize as esToolkitCapitalize, kebabCase, snakeCase, startCase } from 'es-toolkit/compat';
import { isEqual } from 'es-toolkit/compat';
export declare const isString: (val: unknown) => val is string;
export declare const isNumber: (val: unknown) => val is number;
export declare const isNil: (val: unknown) => val is null | undefined;
export declare const isEmpty: (val: unknown) => boolean;
import { maxBy, meanBy, minBy, sumBy } from 'es-toolkit/compat';
import { debounce, once, noop } from 'es-toolkit/compat';
/**
 * Decompose any naming convention (camel, snake, kebab) into an array of lowercase words.
 * @param {string} str - Identifier to decompose.
 * @returns {string[]} Ordered collection of lowercase word segments.
 */
export declare function stringToArray(str: unknown): string[];
/**
 * Transform a string into PascalCase (UpperCamelCase) notation.
 * @param {string} str - Input identifier to format.
 * @returns {string} PascalCase representation.
 */
export declare function pascalCase(str: unknown): string;
/**
 * Transform a string into CONSTANT_CASE (SCREAMING_SNAKE_CASE) notation.
 * @param {string} str - Input identifier to format.
 * @returns {string} CONSTANT_CASE representation.
 */
export declare function constantCase(str: unknown): string;
/**
 * Transform a string into dot.case notation.
 * @param {string} str - Input identifier to format.
 * @returns {string} Dot-delimited lowercase string.
 */
export declare function dotCase(str: unknown): string;
/**
 * Transform a string into path/case notation.
 * @param {string} str - Input identifier to format.
 * @returns {string} Slash-delimited lowercase string.
 */
export declare function pathCase(str: unknown): string;
/**
 * Convert technical identifiers or paths into Title Case human-readable text.
 * @param {string} path - Technical path or ID to transform.
 * @param {string} [separator=' > '] - Hierarchical delimiter for segments.
 * @returns {string} Title Case representation with segments joined by the separator.
 */
export declare function humanisePath(path: unknown, separator?: string): string;
/**
 * Truncate a string to a specified length, appending a suffix if exceeded.
 * @param {string} str - Input text to truncate.
 * @param {number} maxLength - Maximum character limit before truncation.
 * @param {string} [suffix='...'] - Text appended to truncated results.
 * @returns {string} Truncated string or original if within bounds.
 */
export declare function truncate<T>(str: T, maxLength: number, suffix?: string): string | T;
export { chunk, difference, differenceBy, flattenDeep, groupBy, intersection, keyBy, orderBy, uniqBy };
export { cloneDeep, get, has, mapKeys, mapValues, merge, omit, pick, set };
export { every, filter, find, forEach, map, reduce, size, some };
export { camelCase, esToolkitCapitalize as capitalize, kebabCase, snakeCase, startCase };
export { isEqual };
export { maxBy, meanBy, minBy, sumBy };
export { debounce, once, noop };
/**
 * Full facade object containing all utility functions.
 *
 * Note: Changed from default export to named export to avoid gas-webpack-plugin
 * creating an invalid `function default()` which Terser cannot parse.
 *
 * @example
 * import { LodashFacade } from '@CoreUtilsLib/src/LodashFacade';
 * const result = LodashFacade.chunk([1, 2, 3, 4], 2);
 *
 * // Or import default for backward compatibility
 * import LodashFacade from '@CoreUtilsLib/src/LodashFacade';
 */
export declare const LodashFacade: {
    chunk: typeof chunk;
    compact: {
        <T>(arr: readonly T[]): T[];
        (arr: unknown): unknown[];
    };
    difference: typeof difference;
    differenceBy: typeof differenceBy;
    flatten: {
        <T>(arr: readonly T[]): FlatArray<T, 1>[];
        (arr: unknown): unknown[];
    };
    flattenDeep: typeof flattenDeep;
    groupBy: typeof groupBy;
    intersection: typeof intersection;
    keyBy: typeof keyBy;
    orderBy: typeof orderBy;
    uniq: {
        <T>(arr: readonly T[]): T[];
        (arr: unknown): unknown[];
    };
    uniqBy: typeof uniqBy;
    cloneDeep: typeof cloneDeep;
    get: typeof get;
    has: typeof has;
    mapKeys: typeof mapKeys;
    mapValues: typeof mapValues;
    merge: typeof merge;
    omit: typeof omit;
    pick: typeof pick;
    set: typeof set;
    every: typeof every;
    filter: typeof filter;
    find: typeof find;
    forEach: typeof forEach;
    map: typeof map;
    reduce: typeof reduce;
    size: typeof size;
    some: typeof some;
    camelCase: typeof camelCase;
    capitalize: typeof esToolkitCapitalize;
    kebabCase: typeof kebabCase;
    snakeCase: typeof snakeCase;
    startCase: typeof startCase;
    truncate: typeof truncate;
    pascalCase: typeof pascalCase;
    constantCase: typeof constantCase;
    dotCase: typeof dotCase;
    pathCase: typeof pathCase;
    stringToArray: typeof stringToArray;
    humanisePath: typeof humanisePath;
    isEmpty: (val: unknown) => boolean;
    isEqual: typeof isEqual;
    isNil: (val: unknown) => val is null | undefined;
    isNumber: (val: unknown) => val is number;
    isString: (val: unknown) => val is string;
    maxBy: typeof maxBy;
    meanBy: typeof meanBy;
    minBy: typeof minBy;
    sumBy: typeof sumBy;
    debounce: typeof debounce;
    once: typeof once;
    noop: typeof noop;
};
