/**
 * @file GasResilienceLib/src/handlers/CircuitBreaker.js
 * @description Circuit breaker implementation for preventing cascading failures
 * @version 1.0 - GRL-H007
 */
import type { CircuitBreakerOptions, CircuitState, ResilienceCache, ResilienceLogger } from '../types.js';
/**
 * Implementation of the Circuit Breaker pattern, preventing cascading failures by monitoring failure rates and gating requests through CLOSED, OPEN, and HALF_OPEN states.
 * @class
 * @private
 */
export declare class CircuitBreaker {
    _failureThreshold: number;
    _successThreshold: number;
    _resetTimeout: number;
    _monitoringPeriod: number;
    _logger: Pick<ResilienceLogger, 'info'> | null;
    _cache: ResilienceCache | null;
    _memoryStates: Map<string, CircuitState>;
    _cacheTTL: number;
    /**
     * Initializes the circuit breaker with configurable thresholds and optional cache-based state persistence.
     * @param {Object} [config={}] logic parameters (failureThreshold, successThreshold, resetTimeout, monitoringPeriod).
     * @param {Object|null} [logger] Optional diagnostic logger.
     * @param {Object|null} [cache] Optional Google CacheService facade for cross-execution state.
     * @throws {Error} If configuration values are invalid or out of range.
     */
    constructor(config?: CircuitBreakerOptions, logger?: Pick<ResilienceLogger, 'info'> | null, cache?: ResilienceCache | null);
    /**
     * Generates a unique persistence identifier for an operation's state.
     * @private
     * @param {string} operationName target identifier.
     * @returns {string} Fully qualified cache key.
     */
    _getCacheKey(operationName: string): string;
    /**
     * Retrieves the current circuit metadata from cache or synthesizes a baseline state.
     * @private
     * @param {string} operationName target identifier.
     * @returns {Object} circuit state metadata.
     */
    _loadState(operationName: string): CircuitState;
    /**
     * Commits the current circuit state to the cache tier if available.
     * @private
     * @param {string} operationName target identifier.
     * @param {Object} state Serialized circuit metadata.
     */
    _saveState(operationName: string, state: CircuitState): void;
    /**
     * Removes old failures outside the monitoring period.
     * @private
     * @param {Object} circuit - Circuit state object
     */
    _cleanOldFailures(circuit: Pick<CircuitState, 'failures'>): void;
    /**
     * Checks if a request should be allowed through the circuit breaker.
     *
     * @param {string} operationName - Name of the operation to check
     * @returns {boolean} True if request is allowed, false if circuit is open
     */
    allowRequest(operationName: string): boolean;
    /**
     * Records a successful operation execution.
     *
     * @param {string} operationName - Name of the operation
     */
    recordSuccess(operationName: string): void;
    /**
     * Records a failed operation execution.
     *
     * @param {string} operationName - Name of the operation
     */
    recordFailure(operationName: string): void;
    /**
     * Gets the current state of a circuit.
     *
     * @param {string} operationName - Name of the operation
     * @returns {Object} Object containing state, failureCount, and other metrics
     */
    getState(operationName: string): {
        state: string;
        failureCount: number;
        consecutiveSuccesses: number;
        lastFailureTime: number | null;
        nextAttemptTime: number | null;
    };
    /**
     * Manually resets a circuit to CLOSED state.
     *
     * @param {string} operationName - Name of the operation
     */
    reset(operationName: string): void;
    /**
     * Gets statistics for all circuits.
     * @returns {Object} Statistics object with circuit states.
     */
    getStatistics(): {};
    /**
     * Logs a message if logger is available.
     * @private
     * @param {string} message - Message to log
     */
    _log(message: string): void;
    static get STATE(): {
        CLOSED: string;
        OPEN: string;
        HALF_OPEN: string;
    };
}
