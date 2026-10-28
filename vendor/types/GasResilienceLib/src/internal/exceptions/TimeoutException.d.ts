/**
 * Exception class for execution time violations, categorized as non-recoverable within the current runtime context.
 * @class
 * @extends Error
 */
export declare class TimeoutException extends Error {
    /**
     * Initializes timeout exception with descriptive failure context.
     * @param {string} [message='Timeout exceeded'] explanation of the temporal threshold violation.
     */
    constructor(message?: string);
}
