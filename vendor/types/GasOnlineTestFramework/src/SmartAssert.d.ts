/**
 * Verbose assertion engine providing machine-readable diagnostic logs for every verification, optimized for LLM-driven test analysis.
 * @class
 */
export declare class SmartAssert {
    /**
     * Routes assertion outcomes to system logs and enforces test failure by throwing exceptions on mismatch.
     * @private
     * @param {boolean} passed Validation outcome.
     * @param {*} expected benchmark value.
     * @param {*} actual observed runtime value.
     * @param {string} message Contextual description of the assertion.
     * @throws {Error} If the assertion fails (passed is false).
     */
    static _safeStringify(value: unknown): string;
    static _log(passed: boolean, expected: unknown, actual: unknown, message: string): void;
    /**
     * Performs a strict equality check (===) between two values.
     * @param {*} actual observed value.
     * @param {*} expected baseline value.
     * @param {string} [message='Values should be equal'] diagnostic context.
     */
    static equals(actual: unknown, expected: unknown, message?: string): void;
    /**
     * Verifies that the observed value is strictly greater than the threshold.
     * @param {number|Date} actual observed value.
     * @param {number|Date} expected threshold baseline.
     * @param {string} [message='Actual should be greater than expected'] diagnostic context.
     */
    static greaterThan(actual: number | Date, expected: number | Date, message?: string): void;
    /**
     * Verifies that the observed value is strictly less than the threshold.
     * @param {number|Date} actual observed value.
     * @param {number|Date} expected threshold baseline.
     * @param {string} [message='Actual should be less than expected'] diagnostic context.
     */
    static lessThan(actual: number | Date, expected: number | Date, message?: string): void;
    /**
     * Performs a strict inequality check (!==) between two values.
     * @param {*} actual observed value.
     * @param {*} expected baseline value.
     * @param {string} [message='Values should not be equal'] diagnostic context.
     */
    static notEquals(actual: unknown, expected: unknown, message?: string): void;
    /**
     * Asserts that the provided value evaluates to a truthy state.
     * @param {*} actual candidate value.
     * @param {string} [message='Value should be true'] diagnostic context.
     */
    static isTrue(actual: unknown, message?: string): void;
    /**
     * Asserts that the provided value evaluates to a falsy state.
     * @param {*} actual candidate value.
     * @param {string} [message='Value should be false'] diagnostic context.
     */
    static isFalse(actual: unknown, message?: string): void;
    /**
     * Verifies that the value is strictly null or undefined.
     * @param {*} actual candidate value.
     * @param {string} [message='Value should be null or undefined'] diagnostic context.
     */
    static isNull(actual: unknown, message?: string): void;
    /**
     * Verifies that the value is neither null nor undefined.
     * @param {*} actual candidate value.
     * @param {string} [message='Value should not be null or undefined'] diagnostic context.
     */
    static notNull(actual: unknown, message?: string): void;
    /**
     * Evaluates structural equality of complex objects or arrays using JSON-based comparison.
     * @param {*} actual observed structure.
     * @param {*} expected baseline structure.
     * @param {string} [message='Objects should be deeply equal'] diagnostic context.
     */
    static deepEquals(actual: unknown, expected: unknown, message?: string): void;
    /**
     * Verifies that the candidate value matches the specified JavaScript primitive or object type.
     * @param {*} actual candidate value.
     * @param {string} expectedType target classification (string|number|boolean|object|function).
     * @param {string} [message] diagnostic context.
     */
    static isType(actual: unknown, expectedType: string, message?: string): void;
    /**
     * Verifies that the candidate value is a finite number (typeof === 'number' and not NaN).
     * @param {*} actual candidate value.
     * @param {string} [message='Value should be a number'] diagnostic context.
     */
    static isNumber(actual: unknown, message?: string): void;
    /**
     * Verifies that the candidate value is a string (typeof === 'string').
     * @param {*} actual candidate value.
     * @param {string} [message='Value should be a string'] diagnostic context.
     */
    static isString(actual: unknown, message?: string): void;
    /**
     * Asserts that the provided collection contains the target element.
     * @param {Array} array Search target collection.
     * @param {*} value Element to locate.
     * @param {string} [message='Array should contain value'] diagnostic context.
     */
    static contains(array: unknown, value: unknown, message?: string): void;
    /**
     * Unconditionally triggers an assertion failure.
     * @param {string} [message='Intentional failure'] failure explanation.
     */
    static fail(message?: string): void;
    /**
     * Asserts that the provided logic block results in an exception.
     * @param {Function} fn Implementation logic to test.
     * @param {string} [message='Function should throw an error'] diagnostic context.
     */
    static throws(fn: (...args: never[]) => unknown, message?: string): void;
}
