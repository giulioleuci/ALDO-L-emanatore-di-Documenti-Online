/**
 * Exception class for rate limit violations, signaling that an operation must be suspended and rescheduled due to excessive wait times.
 * @class
 * @extends Error
 */
export declare class RateLimitExceededException extends Error {
    operationName: string;
    requiredWaitMs: number;
    /**
     * Initializes rate limit exception with operation context and required recovery duration.
     * @param {string} operationName identifier of the throttled task.
     * @param {number} requiredWaitMs Milliseconds to wait before retry is permitted.
     * @param {string} [message] Optional descriptive error message.
     */
    constructor(operationName: string, requiredWaitMs: number, message?: string);
}
