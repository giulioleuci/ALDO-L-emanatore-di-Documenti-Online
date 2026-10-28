import { ErrorClassifier } from './handlers/ErrorClassifier.js';
import { ErrorReporter } from './handlers/ErrorReporter.js';
import { RecoveryManager } from './handlers/RecoveryManager.js';
import { CircuitBreaker } from './handlers/CircuitBreaker.js';
import { ResilienceConfiguration } from './Configuration.js';
import type { CircuitBreakerOptions, ErrorClassification, ExecutionOptions, ExecutionResult, ResilienceCache, ResilienceLogger, ResilienceUtilities } from './types.js';
export interface ExceptionDependencies {
    classifier?: Pick<ErrorClassifier, 'classify'>;
    recoveryManager?: Pick<RecoveryManager, 'applyStrategy'>;
    reporter?: Pick<ErrorReporter, 'record' | 'reset' | 'getSummary'>;
    circuitBreaker?: Pick<CircuitBreaker, 'allowRequest' | 'recordSuccess' | 'recordFailure' | 'getStatistics' | 'reset'>;
    circuitBreakerConfig?: CircuitBreakerOptions;
    cache?: ResilienceCache;
    config?: Pick<ResilienceConfiguration, 'getErrorPatterns' | 'getRecoveryStrategies' | 'getLimit'>;
}
/**
 * Primary facade for automated error handling, coordinating classification, intelligent retries with backoff, and circuit breaker protection.
 * @class
 */
export declare class ExceptionService {
    _logger: Required<Pick<ResilienceLogger, 'error' | 'warn' | 'debug'>>;
    _utils: ResilienceUtilities;
    _cache: ResilienceCache | null;
    _config: NonNullable<ExceptionDependencies['config']>;
    _classifier: NonNullable<ExceptionDependencies['classifier']>;
    _recoveryManager: NonNullable<ExceptionDependencies['recoveryManager']>;
    _reporter: NonNullable<ExceptionDependencies['reporter']>;
    _circuitBreaker: NonNullable<ExceptionDependencies['circuitBreaker']> | null;
    static get ABSOLUTE_MAX_ATTEMPTS(): number;
    static get MAX_JITTER_MS(): number;
    static get MAX_WAIT_TIME_MS(): number;
    /**
     * Initializes the resilience service with required logger and utility facades.
     * @param {Object} logger Diagnostic output interface.
     * @param {Object} utils CoreUtilsLib service for sleep and operations.
     * @param {Object} [dependencies={}] Optional overrides for internal components.
     * @param {Object} [dependencies.classifier] Custom classification logic (ErrorClassifier).
     * @param {Object} [dependencies.recoveryManager] Custom retry orchestrator (RecoveryManager).
     * @param {Object} [dependencies.reporter] Custom analytics engine (ErrorReporter).
     * @param {Object} [dependencies.circuitBreaker] Custom fail-fast logic (CircuitBreaker).
     * @param {Object} [dependencies.config] Central behavior settings (ResilienceConfiguration).
     * @throws {Error} If logger or utils are invalid, or if native Google Utilities are passed directly.
     */
    constructor(logger: ResilienceLogger, utils: ResilienceUtilities, dependencies?: ExceptionDependencies);
    /**
     * Generates a collision-resistant correlation id for tracing a single execution attempt chain.
     * @returns {string} 21-character compact random id.
     */
    _generateCorrelationId(): string;
    /**
     * Executes a function with classification, retry/backoff, and optional circuit-breaker protection,
     * returning a detailed result object rather than throwing.
     * @param {Function} func Operation to execute; receives `parameters`.
     * @param {Object} [parameters={}] Arguments passed to `func`.
     * @param {Object} [options={}] Execution behavior overrides.
     * @param {string} [options.operationName] Label used in logs/circuit-breaker keys.
     * @param {string} [options.mode] STRICT|LENIENT|RECOVERY.
     * @param {number} [options.maxAttempts] Override for the strategy's max attempts.
     * @param {string} [options.correlationId] Caller-supplied trace id.
     * @param {boolean} [options.useCircuitBreaker] Defaults to true.
     * @returns {Object} Detailed execution result (success, result, attempts, correlationId, error).
     * @throws {Error} If func/parameters/options are invalid.
     */
    executeWithAdvancedHandling<T, P extends object | null = Record<string, never>>(func: (parameters: P) => T, parameters?: P, options?: ExecutionOptions): ExecutionResult<T>;
    /**
     * Executes a function with automatic retry, throwing the underlying error on final failure.
     * @param {Function} func Operation to execute; receives `parameters`.
     * @param {Object} [parameters={}] Arguments passed to `func`.
     * @param {number} [maxAttempts=3] Maximum retry attempts.
     * @returns {*} The operation's return value on success.
     * @throws {Error} If func/parameters/maxAttempts are invalid, or on final failure.
     */
    executeWithRetry<T, P extends object | null = Record<string, never>>(func: (parameters: P) => T, parameters?: P, maxAttempts?: number): T;
    /**
     * Executes a function leniently, returning a fallback value instead of throwing on failure.
     * @param {Function} func Operation to execute; receives `parameters`.
     * @param {Object} [parameters={}] Arguments passed to `func`.
     * @param {*} [defaultValue=null] Value returned when the operation fails.
     * @returns {*} The operation's return value on success, otherwise `defaultValue`.
     * @throws {Error} If func/parameters are invalid.
     */
    executeWithBypass<T, P extends object | null = Record<string, never>>(func: (parameters: P) => T, parameters?: P): T | null;
    executeWithBypass<T, P extends object | null, F>(func: (parameters: P) => T, parameters: P | undefined, defaultValue: F): T | F;
    /**
     * Classifies an error without executing retry logic.
     * @param {Error|*} error target failure (non-Error throws are wrapped).
     * @returns {Object} error classification state (type, category, recoverable, originalMessage).
     * @throws {Error} If error is null or undefined.
     */
    classifyError(error: unknown): ErrorClassification;
    /**
     * Resets accumulated error statistics.
     */
    resetStatistics(): void;
    /**
     * Gets the current error summary (counters and recovery rate).
     * @returns {Object} Error summary.
     */
    getErrorSummary(): {
        counters: import("./types.js").ErrorCounters;
        recoveryRate: number;
    };
    /**
     * Logs a human-readable error analysis report.
     */
    printErrorAnalysis(): void;
    /**
     * Gets aggregate execution statistics.
     * @returns {Object} totalAttempts, recoveryRate, and counters.
     */
    getStatistics(): {
        totalAttempts: number;
        recoveryRate: number;
        counters: import("./types.js").ErrorCounters;
    };
    /**
     * Gets the circuit breaker instance if configured.
     * @returns {Object|null} Circuit breaker instance, or null if not configured.
     */
    getCircuitBreaker(): Pick<CircuitBreaker, "reset" | "allowRequest" | "recordSuccess" | "recordFailure" | "getStatistics"> | null;
    /**
     * Gets circuit breaker statistics.
     * @returns {Object} Statistics, or an empty object if no circuit breaker is configured.
     */
    getCircuitBreakerStatistics(): {};
    /**
     * Resets the circuit breaker state for a given operation.
     * @param {string} operationName Operation key to reset.
     * @returns {boolean} True if reset was applied, false if no circuit breaker is configured.
     * @throws {Error} If operationName is missing or not a string.
     */
    resetCircuit(operationName: string): boolean;
    /**
     * Gets the logger instance used by this service.
     *
     * @returns {Object} Logger instance with error, warn, debug, and info methods
     */
    get logger(): Required<Pick<ResilienceLogger, "debug" | "warn" | "error">>;
    /**
     * Gets the utils instance used by this service.
     *
     * @returns {Object} Utils instance with sleep and other utility methods
     */
    get utils(): ResilienceUtilities;
    /**
     * Gets the error classifier instance.
     *
     * @returns {Object} Error classifier instance for manual error classification
     */
    get errorClassifier(): Pick<ErrorClassifier, "classify">;
    /**
     * Gets the error reporter instance.
     *
     * @returns {Object} Error reporter instance for statistics and reporting
     */
    get errorReporter(): Pick<ErrorReporter, "record" | "reset" | "getSummary">;
    /**
     * Gets the recovery manager instance.
     *
     * @returns {Object} Recovery manager instance for retry strategies
     */
    get recoveryManager(): Pick<RecoveryManager, "applyStrategy">;
    /**
     * Gets the circuit breaker instance if configured.
     *
     * @returns {Object|null} Circuit breaker instance, or null if not configured
     */
    get circuitBreaker(): Pick<CircuitBreaker, "reset" | "allowRequest" | "recordSuccess" | "recordFailure" | "getStatistics"> | null;
}
