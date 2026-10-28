/**
 * @file CoreUtilsLib/src/utils/SystemEnvironmentUtils.js
 * @description System environment and runtime control utilities.
 */
import { debounce } from '../facades/LodashFacade.js';
export declare class SystemEnvironmentUtils {
    _sleepFn: ((milliseconds: number) => void) | null;
    constructor(sleepFn?: ((milliseconds: number) => void) | null);
    /**
     * Pauses execution for specified duration. Requires sleep function injection.
     * @param {number} milliseconds Duration to pause.
     * @throws {Error} If sleep function is not provided to constructor.
     */
    sleep(milliseconds: number): void;
    /**
     * Executes provided function after a specified millisecond delay.
     * @param {Function} fn Function to execute.
     * @param {number} milliseconds Delay duration.
     * @returns {*} Return value of the executed function.
     */
    delay<T>(fn: () => T, milliseconds: number): T;
    /**
     * Validates if a string matches basic email format (user@domain.tld).
     * @param {string} email String to validate.
     * @returns {boolean} True if format is valid.
     */
    isValidEmail(email: unknown): boolean;
    /**
     * Validates if a string matches basic URL format with protocol.
     * @param {string} url String to validate.
     * @returns {boolean} True if format is valid.
     */
    isValidUrl(url: unknown): boolean;
    /**
     * Performs deep comparison between two values to determine equality.
     * @param {*} value First value.
     * @param {*} other Second value.
     * @returns {boolean} True if values are deeply equivalent.
     */
    isEqual(value: unknown, other: unknown): boolean;
    /**
     * Checks if value is strictly null or undefined.
     * @param {*} value Value to check.
     * @returns {boolean} True if null/undefined.
     */
    isNil(value: unknown): value is null | undefined;
    /**
     * Checks if value is a Number primitive or object.
     * @param {*} value Value to check.
     * @returns {boolean} True if value is a number.
     */
    isNumber(value: unknown): value is number;
    /**
     * Checks if value is a String primitive or object.
     * @param {*} value Value to check.
     * @returns {boolean} True if value is a string.
     */
    isString(value: unknown): value is string;
    /**
     * Checks if value is an empty object, collection, map, or set.
     * @param {*} value Value to check.
     * @returns {boolean} True if empty.
     */
    isEmptyValue(value: unknown): boolean;
    /**
     * Creates a debounced function that delays invocation until after wait milliseconds.
     * @param {Function} func Function to debounce.
     * @param {number} wait Milliseconds to delay.
     * @param {Object} [options] Debounce options.
     * @returns {Function} Debounced function.
     */
    debounce<T extends (...args: never[]) => unknown>(func: T, wait: number, options?: Parameters<typeof debounce>[2]): import("es-toolkit/compat").DebouncedFunc<T>;
    /**
     * Restricts function invocation to a single execution.
     * @param {Function} func Function to restrict.
     * @returns {Function} Restricted function.
     */
    once<T extends (...args: never[]) => unknown>(func: T): T;
    /**
     * Performs no operation and returns undefined.
     */
    noop(): void;
}
