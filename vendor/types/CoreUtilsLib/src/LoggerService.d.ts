/**
 * @file CoreUtilsLib/src/LoggerService.js
 * @description Advanced logging service with configurable log levels.
 * Provides structured logging with level-based filtering.
 * @version 2.0 - Moved to CoreUtilsLib (foundation layer).
 */
/**
 * Hierarchical logging service with structured output and lazy evaluation.
 * @class LoggerService
 */
import { StructuredLogFormatter } from './internal/StructuredLogFormatter.js';
import type { JobReport, TreePosition } from './internal/StructuredLogFormatter.js';
export interface LoggerOptions {
    level?: string;
}
export type ChildLogger = Pick<LoggerService, 'debug' | 'info' | 'warn' | 'error' | 'log' | 'logJobStart' | 'logJobResume' | 'logJobEnd' | 'logJobSuspended' | 'logBatchStart' | 'logItemStart' | 'logStep' | 'logPipelineStart' | 'logPipelineStep' | 'logSummary' | 'logJobReport' | 'withPosition'>;
export declare class LoggerService {
    _level: string;
    _logLevels: Record<string, number>;
    _structured: StructuredLogFormatter;
    _positionStack: TreePosition[];
    /**
     * Initialize LoggerService with configurable verbosity.
     * @param {Object} [options={}] - Configuration payload.
     * @param {string} [options.level='INFO'] - Filter threshold: OFF, ERROR, WARN, INFO, DEBUG.
     */
    constructor(options?: LoggerOptions);
    /**
     * Update the active logging threshold.
     * @param {string} level - New filter threshold identifier.
     * @returns {LoggerService} Fluent instance for chaining.
     */
    setLevel(level: string): this;
    /**
     * Retrieve the current logging threshold.
     * @returns {string} Threshold identifier.
     */
    getLevel(): string;
    /**
     * Validate if a specific threshold is eligible for logging.
     * @private
     * @param {string} level - Level to test.
     * @returns {boolean} True if the level meets the active threshold.
     */
    _isLevelActive(level: string): boolean;
    /**
     * Safely serialize an object with circular reference and depth protection.
     * @private
     * @param {*} obj - Payload to stringify.
     * @param {number} [maxDepth=5] - Recursion limit.
     * @param {number} [maxLength=5000] - Output character limit.
     * @returns {string} JSON-formatted string with truncation markers.
     */
    _safeStringify(obj: unknown, maxDepth?: number, maxLength?: number): string;
    /**
     * Resolve a message or execute a lazy-evaluation callback.
     * @private
     * @param {string|Object|Function} messageOrCallback - Static payload or generator.
     * @returns {string|Object} Evaluated content.
     */
    _evaluateMessage(messageOrCallback: unknown): unknown;
    /**
     * Compose a formatted log entry string.
     * @private
     * @param {string} level - Threshold identifier.
     * @param {string|Object} message - Evaluated content.
     * @param {Object} [context=null] - Optional diagnostic metadata.
     * @returns {string} Standardized log line.
     */
    _formatMessage(level: string, message: unknown, context?: unknown): string;
    _currentPosition(): TreePosition | undefined;
    _resolvePosition(position?: TreePosition): TreePosition | undefined;
    _emit(level: string, message: unknown, context?: unknown): this;
    withPosition<T>(position: TreePosition, callback: () => T): T;
    /**
     * Log a DEBUG message with optional context and lazy evaluation.
     * @param {string|Object|Function} message - Content or callback.
     * @param {Object|Function} [context=null] - Metadata or callback.
     * @returns {LoggerService} Fluent instance for chaining.
     */
    debug(message: unknown, context?: unknown): this;
    /**
     * Log an INFO message with optional context and lazy evaluation.
     * @param {string|Object|Function} message - Content or callback.
     * @param {Object|Function} [context=null] - Metadata or callback.
     * @returns {LoggerService} Fluent instance for chaining.
     */
    info(message: unknown, context?: unknown): this;
    /**
     * Log a WARN message with optional context and lazy evaluation.
     * @param {string|Object|Function} message - Content or callback.
     * @param {Object|Function} [context=null] - Metadata or callback.
     * @returns {LoggerService} Fluent instance for chaining.
     */
    warn(message: unknown, context?: unknown): this;
    /**
     * Log an ERROR message with optional context and lazy evaluation.
     * @param {string|Object|Function} message - Content or callback.
     * @param {Object|Function} [context=null] - Metadata or callback.
     * @returns {LoggerService} Fluent instance for chaining.
     */
    error(message: unknown, context?: unknown): this;
    /**
     * Extract all buffered messages from the global GAS Logger.
     * @returns {string[]} Ordered collection of log entries.
     */
    get(): string[];
    /**
     * Purge all buffered messages from the global GAS Logger.
     * @returns {LoggerService} Fluent instance for chaining.
     */
    clear(): this;
    /**
     * Log a message at a dynamic threshold level.
     * @param {string} level - Priority threshold for this entry.
     * @param {string|Object|Function} message - Content or callback.
     * @returns {LoggerService} Fluent instance for chaining.
     */
    log(level: string, message: unknown): this;
    /** @private */
    _writeStructured(level: string, lines: string[]): this;
    /** Start a job invocation. @returns {LoggerService} */
    logJobStart(jobName: unknown, jobType: unknown): this;
    /** Resume a persisted job invocation. @returns {LoggerService} */
    logJobResume(jobName: unknown, jobType: unknown, details?: unknown): this;
    /** Finish a job invocation. @returns {LoggerService} */
    logJobEnd(jobName: unknown, isSuccess: boolean, details?: unknown): this;
    /** Suspend a resumable job invocation. @returns {LoggerService} */
    logJobSuspended(jobName: unknown, details?: unknown): this;
    /** Start a batch. @returns {LoggerService} */
    logBatchStart(totalItems: unknown, label?: unknown): this;
    /** Start a batch item. @returns {LoggerService} */
    logItemStart(itemIndex: unknown, totalItems: unknown, itemLabel: unknown, identifier: unknown, kind?: string): this;
    /** Emit a generic tree step. @returns {LoggerService} */
    logStep(message: unknown, position?: TreePosition): this;
    /** Start a pipeline trace. @returns {LoggerService} */
    logPipelineStart(pipelineName: unknown, totalSteps: unknown, position?: TreePosition): this;
    /** Emit a pipeline step result. @returns {LoggerService} */
    logPipelineStep(stepName: unknown, status: string, details?: unknown, position?: TreePosition): this;
    /** Emit a duration summary. @returns {LoggerService} */
    logSummary(label: unknown, durationMs: unknown, itemDetails?: unknown, position?: TreePosition): this;
    /**
     * Emit a multi-line end-of-job report (job type, run count, cumulative real
     * duration across every timeout-resume, task totals, skip and failure detail).
     * `saltati` (skipped tasks) is excluded from "Eseguiti con successo"; its line
     * is printed only when the caller passes it.
     * @param {{jobType: string, runCount?: number, totalDurationMs?: number, totale?: number, falliti?: number, dettagliFalliti?: string[], saltati?: number, dettagliSaltati?: string[]}} details
     * @returns {LoggerService} Fluent instance for chaining.
     */
    logJobReport(details: JobReport): this;
    /**
     * Spawn a namespaced logger with a message prefix.
     * @param {string} prefix - Namespace identifier.
     * @returns {Object} Proxy object with level-specific logging methods.
     */
    child(prefix: string): ChildLogger;
}
