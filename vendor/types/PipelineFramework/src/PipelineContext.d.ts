/**
 * @file PipelineFramework/src/PipelineContext.js
 * @description Wrapper for shared context state with metadata tracking.
 * @version 1.0.0
 */
/**
 * Shared state container and telemetry tracker for pipeline executions.
 *
 * @description
 * Wraps a mutable data payload and maintains execution metadata, including step history,
 * timing, and graceful termination signals.
 *
 * @class
 */
import type { ContextMetadata } from './internal/contracts.js';
export declare class PipelineContext<Data extends object = Record<string, unknown>> {
    _data: Partial<Data>;
    _metadata: ContextMetadata;
    /**
     * @param {Object} [initialData={}] Starting context payload.
     * @throws {Error} If initialData is not an object or null.
     */
    constructor(initialData?: Partial<Data> | null);
    /** @returns {Object} Raw underlying data reference. */
    getData(): Partial<Data>;
    /**
     * Retrieves a value from context.
     * @param {string} key Target key.
     * @param {*} [defaultValue=null] Value returned if key is missing.
     * @returns {*}
     * @throws {Error} If key is not a string.
     */
    get<K extends string, Fallback = null>(key: K, defaultValue?: Fallback): (K extends keyof Data ? Data[K] | undefined : unknown) | Exclude<Fallback, undefined> | (undefined extends Fallback ? null : never);
    /**
     * persists a value in context.
     * @param {string} key Target key.
     * @param {*} value Data to store.
     * @returns {PipelineContext} Current instance for chaining.
     * @throws {Error} If key is not a string.
     */
    set<K extends string>(key: K, value: K extends keyof Data ? Data[K] : unknown): this;
    /**
     * Verifies key existence.
     * @param {string} key Target key.
     * @returns {boolean}
     * @throws {Error} If key is not a string.
     */
    has(key: string): boolean;
    /**
     * Triggers graceful pipeline termination.
     * @param {string} [reason=''] Diagnostic explanation for the stop.
     * @returns {PipelineContext} Current instance.
     */
    requestStop(reason?: string): this;
    /** @returns {boolean} True if requestStop() was invoked. */
    shouldStop(): boolean;
    /** @returns {string|null} */
    getStopReason(): string | null;
    /**
     * Records step telemetry.
     * @private
     * @param {string} stepName Source step.
     * @param {string} status (completed|skipped|failed).
     * @param {number} durationMs Execution time.
     * @param {Object} [details={}] Supplemental metadata.
     * @returns {PipelineContext} Current instance.
     */
    recordStepExecution(stepName: string, status: string, durationMs: number, details?: Record<string, unknown>): this;
    /** @returns {Array<Object>} Chronological step execution logs. */
    getExecutionHistory(): import("./internal/contracts.js").StepHistory[];
    /** @returns {Object} Raw metadata snapshot (startTime, stopRequested, etc.). */
    getMetadata(): ContextMetadata;
    /**
     * Finalizes execution timer.
     * @private
     * @returns {PipelineContext} Current instance.
     */
    markCompleted(): this;
    /** @returns {number} Wall-clock duration in milliseconds. */
    getTotalDuration(): number;
    /**
     * Aggregates execution statistics and history.
     * @returns {{startTime: number, endTime: number, totalDuration: number, totalSteps: number, completedSteps: number, skippedSteps: number, failedSteps: number, stopRequested: boolean, stopReason: string|null, history: Array}}
     */
    getSummary(): {
        startTime: number;
        endTime: number | null;
        totalDuration: number;
        totalSteps: number;
        completedSteps: number;
        skippedSteps: number;
        failedSteps: number;
        stopRequested: boolean;
        stopReason: string | null;
        history: import("./internal/contracts.js").StepHistory[];
    };
}
