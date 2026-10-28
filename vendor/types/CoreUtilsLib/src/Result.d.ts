/**
 * @file CoreUtilsLib/src/Result.js
 * @description Shared immutable-friendly outcome wrapper base class.
 *
 * Provides the common success/error value-object shape reused by domain result
 * types across libraries (e.g. ComposableContentLib BlockResult, PipelineFramework
 * PostProcessorResult), eliminating the duplicated `error`/predicate/serialization
 * boilerplate (F-1.4). Subclasses keep their own domain fields and factory names
 * and decide whether to `Object.freeze(this)` after construction.
 * @version 1.0.0
 */
/**
 * Base outcome wrapper. An outcome is considered successful when it carries no
 * error. Subclasses may layer additional semantics (explicit success flags,
 * frozen immutability, richer payloads) on top of this contract.
 *
 * @class Result
 */
export interface SerializedResult<T = unknown> {
    success?: boolean;
    value?: T | null;
    error: string | null;
}
export declare class Result<T = unknown> {
    value: T | null;
    error: Error | null;
    /**
     * @param {Object} [options={}] Initialization payload.
     * @param {*} [options.value=null] Success payload, when applicable.
     * @param {Error|null} [options.error=null] Failure cause, when applicable.
     */
    constructor({ value, error }?: {
        value?: T | null;
        error?: Error | null;
    });
    /**
     * @returns {boolean} True when no error is attached.
     */
    isSuccess(): boolean;
    /**
     * @returns {boolean} True when an error is attached.
     */
    isError(): boolean;
    /**
     * @returns {Object} JSON-safe representation (errors reduced to their message).
     */
    toJSON(): SerializedResult<T>;
    /**
     * @returns {string} Brief diagnostic status string.
     */
    toString(): string;
    /**
     * @param {*} [value=null] Success payload.
     * @returns {Result} Success-state result.
     * @static
     */
    static ok<T = null>(value?: T | null): Result<T>;
    /**
     * @param {Error} error Failure cause.
     * @returns {Result} Failure-state result.
     * @static
     */
    static fail(error: Error): Result<null>;
    /**
     * @returns {Result} Empty success-state result.
     * @static
     */
    static empty(): Result<null>;
}
