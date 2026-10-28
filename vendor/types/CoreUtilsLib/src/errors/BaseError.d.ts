/**
 * @file CoreUtilsLib/src/BaseError.js
 * @description Base error class providing standardized error handling across all libraries.
 * Eliminates duplicate stack trace capture and serialization code.
 * @version 1.0.0
 */
/**
 * Base standardized error class for all GasLibraryFactory custom exceptions.
 * @class BaseError
 * @extends Error
 */
export type ErrorContext = Record<string, unknown>;
export interface SerializedError<Context = ErrorContext | null> {
    name: string;
    message: string;
    context: Context;
    timestamp: string;
    originalError?: {
        name: string;
        message: string;
        stack?: string;
    } | null;
    stack?: string | undefined;
}
export declare class BaseError<Context = ErrorContext | null> extends Error {
    context: Context;
    timestamp: string;
    originalError: Error | null;
    /**
     * Initialize BaseError with message, metadata context, and optional cause chaining.
     * @param {string} message - Error description.
     * @param {Object} [context={}] - Metadata for diagnostic tracking.
     * @param {Error} [originalError=null] - Upstream exception being wrapped.
     */
    constructor(message: string, context?: Context, originalError?: Error | null);
    /**
     * Gets the original error message if one exists.
     *
     * @returns {string|null} The original error message or null
     */
    get originalMessage(): string | null;
    /**
     * Checks if this error wraps another error.
     *
     * @returns {boolean} True if an original error exists
     */
    get hasOriginalError(): boolean;
    /**
     * Serialize error state to a plain object for logging or transport.
     * @returns {Object} JSON-compatible representation including name, message, context, and stack.
     */
    toJSON(): SerializedError<Context>;
    /**
     * Generate a formatted string including error type, message, and serialized context.
     * @returns {string} Human-readable error summary.
     */
    toString(): string;
    /**
     * Create a shallow clone of the error with additional merged metadata.
     * @param {Object} additionalContext - New metadata to append to existing context.
     * @returns {BaseError} New instance with updated context and preserved stack trace.
     */
    withContext(additionalContext: ErrorContext): BaseError;
    /**
     * Static factory method to wrap any error as a BaseError.
     *
     * If the error is already a BaseError, returns it unchanged.
     * Otherwise, wraps it in a new BaseError with the original as the cause.
     *
     * @param {Error|*} error - The error to wrap
     * @param {Object} [context={}] - Additional context to add
     * @returns {BaseError} A BaseError instance
     *
     * @example
     * try {
     *   riskyOperation();
     * } catch (error) {
     *   const wrapped = BaseError.wrap(error, { operation: 'riskyOperation' });
     *   logger.error(wrapped.toJSON());
     * }
     */
    static wrap<Context>(error: BaseError<Context>): BaseError<Context>;
    static wrap<Context>(error: BaseError<Context>, context: ErrorContext): BaseError<Context | ErrorContext | null>;
    static wrap(error: unknown, context?: ErrorContext): BaseError;
}
/**
 * Exception for parameter or schema validation failures.
 * @class ValidationError
 * @extends BaseError
 */
export declare class ValidationError extends BaseError {
    field: string | null;
    value: unknown;
    /**
     * Initialize ValidationError with specific field and value identifiers.
     * @param {string} message - Validation failure reason.
     * @param {string} [field=null] - Identifier of the invalid property.
     * @param {*} [value=undefined] - The value that failed validation.
     * @param {Object} [context={}] - Additional diagnostic metadata.
     */
    constructor(message: string, field?: string | null, value?: unknown, context?: ErrorContext);
}
/**
 * Exception for missing or malformed library/service configuration.
 * @class ConfigurationError
 * @extends BaseError
 */
export declare class ConfigurationError extends BaseError {
    configKey: string | null;
    /**
     * Initialize ConfigurationError with the problematic configuration key.
     * @param {string} message - Configuration failure reason.
     * @param {string} [configKey=null] - Identifier of the missing/invalid setting.
     * @param {Object} [context={}] - Additional diagnostic metadata.
     */
    constructor(message: string, configKey?: string | null, context?: ErrorContext);
}
/**
 * Exception for failed functional operations with recovery indicators.
 * @class OperationError
 * @extends BaseError
 */
export declare class OperationError extends BaseError {
    operation: string | null;
    recoverable: boolean;
    /**
     * Initialize OperationError with operation type and recoverability flag.
     * @param {string} message - Operational failure reason.
     * @param {string} [operation=null] - Name of the failing functional process.
     * @param {boolean} [recoverable=true] - Flag indicating if retry or fallback is viable.
     * @param {Object} [context={}] - Additional diagnostic metadata.
     * @param {Error} [originalError=null] - Upstream exception being wrapped.
     */
    constructor(message: string, operation?: string | null, recoverable?: boolean, context?: ErrorContext, originalError?: Error | null);
}
