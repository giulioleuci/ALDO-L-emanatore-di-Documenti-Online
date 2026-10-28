/**
 * @file CoreUtilsLib/src/TypeGuards.js
 * @description Type guard utilities for consistent type checking across all libraries.
 * Provides both functional and object-based type checking patterns.
 * @version 1.0.0
 */
/**
 * Static type guard utilities for consistent runtime value validation.
 * @class
 */
export declare class TypeGuards {
    /**
     * Checks if value is a string (primitive or String object).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a string
     *
     * @example
     * TypeGuards.isString('hello');  // true
     * TypeGuards.isString(123);      // false
     * TypeGuards.isString(null);     // false
     */
    static isString(value: unknown): value is string;
    /**
     * Checks if value is a non-empty string (not just whitespace).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a non-empty string
     *
     * @example
     * TypeGuards.isNonEmptyString('hello');  // true
     * TypeGuards.isNonEmptyString('  ');     // false
     * TypeGuards.isNonEmptyString('');       // false
     * TypeGuards.isNonEmptyString(null);     // false
     */
    static isNonEmptyString(value: unknown): value is string;
    /**
     * Checks if value is a number (excluding NaN).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a valid number
     *
     * @example
     * TypeGuards.isNumber(123);     // true
     * TypeGuards.isNumber(3.14);    // true
     * TypeGuards.isNumber(NaN);     // false
     * TypeGuards.isNumber('123');   // false
     */
    static isNumber(value: unknown): value is number;
    /**
     * Checks if value is a finite number (not Infinity, -Infinity, or NaN).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a finite number
     *
     * @example
     * TypeGuards.isFiniteNumber(123);        // true
     * TypeGuards.isFiniteNumber(Infinity);   // false
     * TypeGuards.isFiniteNumber(NaN);        // false
     */
    static isFiniteNumber(value: unknown): value is number;
    /**
     * Checks if value is an integer.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is an integer
     *
     * @example
     * TypeGuards.isInteger(123);    // true
     * TypeGuards.isInteger(3.14);   // false
     * TypeGuards.isInteger('123');  // false
     */
    static isInteger(value: unknown): value is number;
    /**
     * Checks if value is a positive integer (> 0).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a positive integer
     *
     * @example
     * TypeGuards.isPositiveInteger(1);     // true
     * TypeGuards.isPositiveInteger(0);     // false
     * TypeGuards.isPositiveInteger(-1);    // false
     */
    static isPositiveInteger(value: unknown): value is number;
    /**
     * Checks if value is a non-negative integer (>= 0).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a non-negative integer
     *
     * @example
     * TypeGuards.isNonNegativeInteger(0);   // true
     * TypeGuards.isNonNegativeInteger(1);   // true
     * TypeGuards.isNonNegativeInteger(-1);  // false
     */
    static isNonNegativeInteger(value: unknown): value is number;
    /**
     * Checks if value is a boolean.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a boolean
     *
     * @example
     * TypeGuards.isBoolean(true);   // true
     * TypeGuards.isBoolean(false);  // true
     * TypeGuards.isBoolean(1);      // false
     * TypeGuards.isBoolean('true'); // false
     */
    static isBoolean(value: unknown): value is boolean;
    /**
     * Checks if value is a plain object (not null, array, Date, etc.).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a plain object
     *
     * @example
     * TypeGuards.isPlainObject({});           // true
     * TypeGuards.isPlainObject({ a: 1 });     // true
     * TypeGuards.isPlainObject(null);         // false
     * TypeGuards.isPlainObject([]);           // false
     * TypeGuards.isPlainObject(new Date());   // false
     */
    static isPlainObject(value: unknown): value is Record<string, unknown>;
    /**
     * Checks if value is an object (not null, can be array or other object types).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is an object
     *
     * @example
     * TypeGuards.isObject({});     // true
     * TypeGuards.isObject([]);     // true
     * TypeGuards.isObject(null);   // false
     */
    static isObject(value: unknown): value is object;
    /**
     * Checks if value is a non-empty plain object.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a non-empty plain object
     *
     * @example
     * TypeGuards.isNonEmptyObject({ a: 1 });  // true
     * TypeGuards.isNonEmptyObject({});        // false
     * TypeGuards.isNonEmptyObject([1]);       // false
     */
    static isNonEmptyObject(value: unknown): value is Record<string, unknown>;
    /**
     * Checks if value is an array.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is an array
     *
     * @example
     * TypeGuards.isArray([]);          // true
     * TypeGuards.isArray([1, 2, 3]);   // true
     * TypeGuards.isArray('array');     // false
     */
    static isArray(value: unknown): value is unknown[];
    /**
     * Checks if value is a non-empty array.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a non-empty array
     *
     * @example
     * TypeGuards.isNonEmptyArray([1, 2]);  // true
     * TypeGuards.isNonEmptyArray([]);      // false
     * TypeGuards.isNonEmptyArray(null);    // false
     */
    static isNonEmptyArray(value: unknown): value is unknown[];
    /**
     * Checks if value is an array of a specific type.
     *
     * @param {*} value - The value to check
     * @param {Function} typeCheck - Type checking function to apply to each element
     * @returns {boolean} True if value is an array and all elements pass typeCheck
     *
     * @example
     * TypeGuards.isArrayOf([1, 2, 3], TypeGuards.isNumber);      // true
     * TypeGuards.isArrayOf(['a', 'b'], TypeGuards.isString);     // true
     * TypeGuards.isArrayOf([1, 'a'], TypeGuards.isNumber);       // false
     * TypeGuards.isArrayOf([], TypeGuards.isNumber);             // true (empty array)
     */
    static isArrayOf<T>(value: unknown, typeCheck: (entry: unknown) => entry is T): value is T[];
    static isArrayOf(value: unknown, typeCheck: (entry: unknown) => boolean): value is unknown[];
    /**
     * Checks if value is a function.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a function
     *
     * @example
     * TypeGuards.isFunction(() => {});     // true
     * TypeGuards.isFunction(function() {}); // true
     * TypeGuards.isFunction(class {});     // true
     * TypeGuards.isFunction(null);         // false
     */
    static isFunction(value: unknown): value is (...args: never[]) => unknown;
    /**
     * Checks if value is null or undefined.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is null or undefined
     *
     * @example
     * TypeGuards.isNil(null);       // true
     * TypeGuards.isNil(undefined);  // true
     * TypeGuards.isNil(0);          // false
     * TypeGuards.isNil('');         // false
     */
    static isNil(value: unknown): value is null | undefined;
    /**
     * Checks if value is null.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is null
     */
    static isNull(value: unknown): value is null;
    /**
     * Checks if value is undefined.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is undefined
     */
    static isUndefined(value: unknown): value is undefined;
    /**
     * Checks if value is defined (not null and not undefined).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is defined
     *
     * @example
     * TypeGuards.isDefined(0);          // true
     * TypeGuards.isDefined('');         // true
     * TypeGuards.isDefined(null);       // false
     * TypeGuards.isDefined(undefined);  // false
     */
    static isDefined<T>(value: T): value is NonNullable<T>;
    /**
     * Checks if value is a Date object and is valid (not Invalid Date).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a valid Date
     *
     * @example
     * TypeGuards.isValidDate(new Date());              // true
     * TypeGuards.isValidDate(new Date('invalid'));     // false
     * TypeGuards.isValidDate('2025-01-15');            // false (string, not Date)
     */
    static isValidDate(value: unknown): value is Date;
    /**
     * Checks if value is a RegExp.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a RegExp
     */
    static isRegExp(value: unknown): value is RegExp;
    /**
     * Checks if value is a Promise (or thenable).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is a Promise or thenable
     *
     * @example
     * TypeGuards.isPromise(Promise.resolve());         // true
     * TypeGuards.isPromise({ then: () => {} });        // true (thenable)
     * TypeGuards.isPromise({});                        // false
     */
    static isPromise(value: unknown): value is {
        then: (...args: never[]) => unknown;
    };
    /**
     * Checks if value is an Error or Error-like object.
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is an Error
     *
     * @example
     * TypeGuards.isError(new Error('test'));           // true
     * TypeGuards.isError(new TypeError('test'));       // true
     * TypeGuards.isError({ message: 'test' });         // false
     */
    static isError(value: unknown): value is Error;
    /**
     * Checks if value is empty (empty string, empty array, empty object, null, undefined).
     *
     * @param {*} value - The value to check
     * @returns {boolean} True if value is empty
     *
     * @example
     * TypeGuards.isEmpty('');        // true
     * TypeGuards.isEmpty([]);        // true
     * TypeGuards.isEmpty({});        // true
     * TypeGuards.isEmpty(null);      // true
     * TypeGuards.isEmpty(0);         // false
     * TypeGuards.isEmpty([1]);       // false
     */
    static isEmpty(value: unknown): boolean;
}
export declare const isString: typeof TypeGuards.isString;
export declare const isNonEmptyString: typeof TypeGuards.isNonEmptyString;
export declare const isNumber: typeof TypeGuards.isNumber;
export declare const isFiniteNumber: typeof TypeGuards.isFiniteNumber;
export declare const isInteger: typeof TypeGuards.isInteger;
export declare const isPositiveInteger: typeof TypeGuards.isPositiveInteger;
export declare const isNonNegativeInteger: typeof TypeGuards.isNonNegativeInteger;
export declare const isBoolean: typeof TypeGuards.isBoolean;
export declare const isPlainObject: typeof TypeGuards.isPlainObject;
export declare const isObject: typeof TypeGuards.isObject;
export declare const isNonEmptyObject: typeof TypeGuards.isNonEmptyObject;
export declare const isArray: typeof TypeGuards.isArray;
export declare const isNonEmptyArray: typeof TypeGuards.isNonEmptyArray;
export declare const isArrayOf: typeof TypeGuards.isArrayOf;
export declare const isFunction: typeof TypeGuards.isFunction;
export declare const isNil: typeof TypeGuards.isNil;
export declare const isNull: typeof TypeGuards.isNull;
export declare const isUndefined: typeof TypeGuards.isUndefined;
export declare const isDefined: typeof TypeGuards.isDefined;
export declare const isValidDate: typeof TypeGuards.isValidDate;
export declare const isRegExp: typeof TypeGuards.isRegExp;
export declare const isPromise: typeof TypeGuards.isPromise;
export declare const isError: typeof TypeGuards.isError;
export declare const isEmpty: typeof TypeGuards.isEmpty;
