import type { JobLogger, LogLevel, SemanticMethod } from '../types.js';
/**
 * @file JobRunnerLib/src/CapturingLogger.js
 * @description Proxy logger that captures all log messages while forwarding to a real logger
 * @version 1.0 - Initial implementation
 */
/**
 * Transparent proxy logger that captures and buffers log messages for post-execution analysis.
 *
 * @description
 * Intercepts all log calls (debug, info, warn, error), stores them in a memory buffer with timestamps
 * and levels, and forwards them to an underlying LoggerService. Optimized for background job logging
 * and UI replay.
 *
 * @class
 */
export declare class CapturingLogger {
    _realLogger: JobLogger;
    _maxBufferSize: number;
    _capturedLogs: {
        level: string;
        timestamp: Date;
        message: unknown;
        context: unknown;
    }[];
    /**
     * @param {Object} realLogger Underlying logger instance (must implement debug, info, warn, error).
     * @param {number} [maxBufferSize=1000] Maximum number of entries before oldest are evicted (FIFO).
     * @throws {Error} If realLogger is null or lacks required logging methods.
     * @throws {Error} If maxBufferSize is not a positive number.
     */
    constructor(realLogger: JobLogger, maxBufferSize?: number);
    /**
     * Internal buffer ingestion and eviction logic.
     * @private
     * @param {string} level Log level identifier (DEBUG|INFO|WARN|ERROR).
     * @param {string} message Formatted log message string.
     * @param {Object} [context=null] Metadata object associated with the log entry.
     */
    _capture(level: string, message: unknown, context?: unknown): void;
    /**
     * Proxies and captures a log message at the given level.
     * @private
     * @param {string} level Log level name (debug|info|warn|error).
     * @param {string|Object|Function} message Raw message, object to stringify, or lazy evaluation function.
     * @param {Object|Function} [context] Optional metadata or lazy evaluation context function.
     * @returns {CapturingLogger} Current instance for chaining.
     */
    _proxy(level: LogLevel, message: unknown, context?: unknown): this;
    /**
     * Proxies and captures DEBUG message.
     * @param {string|Object|Function} message Raw message, object to stringify, or lazy evaluation function.
     * @param {Object|Function} [context] Optional metadata or lazy evaluation context function.
     * @returns {CapturingLogger} Current instance for chaining.
     */
    debug(message: unknown, context?: unknown): this;
    /**
     * Proxies and captures INFO message.
     * @param {string|Object|Function} message Raw message, object to stringify, or lazy evaluation function.
     * @param {Object|Function} [context] Optional metadata or lazy evaluation context function.
     * @returns {CapturingLogger} Current instance for chaining.
     */
    info(message: unknown, context?: unknown): this;
    /**
     * Proxies and captures WARN message.
     * @param {string|Object|Function} message Raw message, object to stringify, or lazy evaluation function.
     * @param {Object|Function} [context] Optional metadata or lazy evaluation context function.
     * @returns {CapturingLogger} Current instance for chaining.
     */
    warn(message: unknown, context?: unknown): this;
    /**
     * Proxies and captures ERROR message.
     * @param {string|Object|Function} message Raw message, object to stringify, or lazy evaluation function.
     * @param {Object|Function} [context] Optional metadata or lazy evaluation context function.
     * @returns {CapturingLogger} Current instance for chaining.
     */
    error(message: unknown, context?: unknown): this;
    /**
     * Programmatic log entry capture and proxying.
     * @param {string} level Log level identifier.
     * @param {string|Object|Function} message Log message or evaluator.
     * @returns {CapturingLogger} Current instance for chaining.
     */
    log(level: string, message: unknown): this;
    withPosition<T>(position: Parameters<NonNullable<JobLogger['withPosition']>>[0], callback: () => T): T;
    _semantic(method: SemanticMethod, args: unknown[], level: string, message: unknown, status: string): this;
    _withoutTrailingUndefined(args: unknown[]): unknown[];
    logJobStart(jobName: Parameters<NonNullable<JobLogger['logJobStart']>>[0], jobType: Parameters<NonNullable<JobLogger['logJobStart']>>[1]): this;
    logJobResume(jobName: Parameters<NonNullable<JobLogger['logJobResume']>>[0], jobType: Parameters<NonNullable<JobLogger['logJobResume']>>[1], details?: Parameters<NonNullable<JobLogger['logJobResume']>>[2]): this;
    logJobEnd(jobName: Parameters<NonNullable<JobLogger['logJobEnd']>>[0], isSuccess: Parameters<NonNullable<JobLogger['logJobEnd']>>[1], details?: Parameters<NonNullable<JobLogger['logJobEnd']>>[2]): this;
    logJobSuspended(jobName: Parameters<NonNullable<JobLogger['logJobSuspended']>>[0], details?: Parameters<NonNullable<JobLogger['logJobSuspended']>>[1]): this;
    logBatchStart(totalItems: Parameters<NonNullable<JobLogger['logBatchStart']>>[0], label?: Parameters<NonNullable<JobLogger['logBatchStart']>>[1]): this;
    logItemStart(itemIndex: Parameters<NonNullable<JobLogger['logItemStart']>>[0], totalItems: Parameters<NonNullable<JobLogger['logItemStart']>>[1], itemLabel: Parameters<NonNullable<JobLogger['logItemStart']>>[2], identifier?: Parameters<NonNullable<JobLogger['logItemStart']>>[3], kind?: Parameters<NonNullable<JobLogger['logItemStart']>>[4]): this;
    logStep(message: Parameters<NonNullable<JobLogger['logStep']>>[0], position?: Parameters<NonNullable<JobLogger['logStep']>>[1]): this;
    logPipelineStart(pipelineName: Parameters<NonNullable<JobLogger['logPipelineStart']>>[0], totalSteps: Parameters<NonNullable<JobLogger['logPipelineStart']>>[1], position?: Parameters<NonNullable<JobLogger['logPipelineStart']>>[2]): this;
    logPipelineStep(stepName: Parameters<NonNullable<JobLogger['logPipelineStep']>>[0], status: Parameters<NonNullable<JobLogger['logPipelineStep']>>[1], details?: Parameters<NonNullable<JobLogger['logPipelineStep']>>[2], position?: Parameters<NonNullable<JobLogger['logPipelineStep']>>[3]): this;
    logSummary(label: Parameters<NonNullable<JobLogger['logSummary']>>[0], durationMs: Parameters<NonNullable<JobLogger['logSummary']>>[1], itemDetails?: Parameters<NonNullable<JobLogger['logSummary']>>[2], position?: Parameters<NonNullable<JobLogger['logSummary']>>[3]): this;
    /**
     * Formats captured logs as plain text.
     * @param {string} [separator='\n'] Line delimiter.
     * @returns {string} Formatted string: `[LEVEL] ISO_TIMESTAMP - MESSAGE {JSON_CONTEXT}`.
     */
    getLogsAsText(separator?: string): string;
    /**
     * Formats captured logs as a styled HTML block.
     * @description
     * Returns a <div> containing color-coded log entries (DEBUG:gray, INFO:blue, WARN:orange, ERROR:red).
     * @returns {string} Sanitized HTML string for UI display.
     * @example
     * const html = capturingLogger.getLogsAsHtml();
     * uiService.createSidebar().setTitle('Job Logs').setContent(html).show();
     */
    getLogsAsHtml(): string;
    /**
     * XSS mitigation for HTML log output.
     * @private
     * @param {string} text Raw text to sanitize.
     * @returns {string} HTML-escaped string.
     */
    _escapeHtml(text: string): string;
    /**
     * @returns {number} Current entry count in buffer.
     */
    getLogCount(): number;
    /**
     * Delegates log level configuration to realLogger.
     * @param {string} level Target log level.
     * @returns {CapturingLogger} Current instance for chaining.
     */
    setLevel(level: string): this;
    /**
     * Retrieves current level from realLogger.
     * @returns {string} Active log level or 'UNKNOWN' if realLogger is not configurable.
     */
    getLevel(): string;
}
