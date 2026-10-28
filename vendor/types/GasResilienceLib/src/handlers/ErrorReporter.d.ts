/**
 * @file GasResilienceLib/src/handlers/ErrorReporter.js
 * @description Internal handler that tracks error statistics and provides analytics for error resilience.
 * @version 2.0 - Refactored using Facade/Delegation pattern.
 */
import type { ErrorCounters, ErrorEvent, ResilienceLogger } from '../types.js';
export declare class ErrorReporter {
    _logger: ResilienceLogger;
    _sessionErrors: (ErrorEvent & {
        timestamp: Date;
    })[];
    _counters: ErrorCounters;
    /**
     * Maximum number of error entries to keep in session log.
     */
    static MAX_SESSION_ERRORS: number;
    /**
     * Sanitizes error messages to remove potential PII.
     */
    static _sanitizeMessage(message: unknown): string;
    constructor(logger: ResilienceLogger);
    /**
     * Resets accumulated error statistics and session history.
     */
    reset(): void;
    /**
     * Records a FAILURE or RECOVERED event, updating counters and session history.
     * @param {Object} details Event details.
     * @param {string} details.type 'FAILURE' or 'RECOVERED'.
     * @param {string} details.operation Operation label.
     * @param {Object} [details.classification] Required for FAILURE type.
     * @param {number} [details.attempt] Required for RECOVERED type (>= 1).
     * @throws {Error} If details are missing/invalid for the given type.
     */
    record(details: ErrorEvent): void;
    /**
     * Gets the current error summary (counters and recovery rate).
     * @returns {Object} counters and recoveryRate.
     */
    getSummary(): {
        counters: ErrorCounters;
        recoveryRate: number;
    };
}
