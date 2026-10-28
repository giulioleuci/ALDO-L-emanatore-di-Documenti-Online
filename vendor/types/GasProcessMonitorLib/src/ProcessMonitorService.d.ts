import type { MonitorLogger, MonitorCache, MonitorCacheService, MonitorProperties, MonitorJobState } from './types.js';
/**
 * @file GasProcessMonitorLib/src/ProcessMonitorService.ts
 * @description Service for managing process state with Cache and Properties persistence
 * @version 1.0.0
 */
/**
 * Enum for process/job states
 * @enum {string}
 */
export declare const ProcessState: {
    readonly PENDING: "pending";
    readonly RUNNING: "running";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
};
/**
 * Enum for step states
 * @enum {string}
 */
export declare const StepState: {
    readonly PENDING: "pending";
    readonly RUNNING: "running";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly SKIPPED: "skipped";
};
/**
 * Orchestrator for tracking long-running process lifecycles, managing job states, progress metrics, and task-level auditing via tiered Cache and Properties storage.
 * @class
 */
export declare class ProcessMonitorService {
    private readonly _logger;
    private readonly _cacheService;
    private readonly _propertiesService;
    private _cache;
    /**
     * Cache key prefix for process state
     * @static
     * @type {string}
     */
    static get CACHE_PREFIX(): string;
    /**
     * Properties key prefix for process state
     * @static
     * @type {string}
     */
    static get PROPS_PREFIX(): string;
    /**
     * Default cache expiration (6 hours in seconds)
     * @static
     * @type {number}
     */
    static get CACHE_EXPIRATION(): number;
    /**
     * Initializes the monitor with diagnostic logging and multi-layer persistence services.
     * @param {Object} logger Diagnostic output interface.
     * @param {Object} cacheService GoogleApiWrapper CacheService for high-frequency updates.
     * @param {Object} propertiesService GoogleApiWrapper PropertiesService for lifecycle persistence.
     * @throws {Error} If mandatory dependencies are missing or malformed.
     */
    constructor(logger: MonitorLogger, cacheService: MonitorCacheService, propertiesService: MonitorProperties);
    /**
     * Resolves the active script-level cache instance.
     * @private
     * @returns {Object} Active cache wrapper.
     */
    _getCache(): MonitorCache;
    /**
     * Generates a prefixed unique identifier for cache-based job state.
     * @private
     * @param {string} jobId Unique process identifier.
     * @returns {string} Fully qualified cache key.
     */
    _getCacheKey(jobId: string): string;
    /**
     * Generates a prefixed unique identifier for persistent property-based job state.
     * @private
     * @param {string} jobId Unique process identifier.
     * @returns {string} Fully qualified properties key.
     */
    _getPropsKey(jobId: string): string;
    /**
     * Synchronizes process state to tiered storage, enforcing Properties persistence only for lifecycle transitions.
     * @private
     * @param {string} jobId target process identifier.
     * @param {Object} state Serialized process metadata.
     * @param {boolean} [persistToProps=false] If true, commits state to long-term storage.
     */
    _writeState(jobId: string, state: MonitorJobState, persistToProps?: boolean): void;
    /**
     * Retrieves process state using a cache-first strategy with automated Properties fallback.
     * @private
     * @param {string} jobId Unique process identifier.
     * @returns {Object|null} current process state or null if not found.
     */
    _readState(jobId: string): MonitorJobState | null;
    /**
     * Synthesizes a baseline state structure for a new monitoring context.
     * @private
     * @param {string} jobId Unique process identifier.
     * @returns {Object} Default state record.
     */
    _createInitialState(jobId: string): MonitorJobState;
    /**
     * Initializes monitoring for a new process, setting status to PENDING and committing to all storage tiers.
     * @param {string} jobId Unique process identifier.
     * @returns {this} Chainable monitor instance.
     * @throws {Error} If jobId is invalid.
     */
    registerJob(jobId: string): this;
    /**
     * Transitions a process status to RUNNING and records the start timestamp.
     * @param {string} jobId Unique process identifier.
     * @returns {this} Chainable monitor instance.
     */
    startJob(jobId: string): this;
    /**
     * Finalizes a successful process, setting status to COMPLETED and recording the end timestamp.
     * The final state is kept in cache only; the persisted `PM_<jobId>` property is deleted.
     * @param {string} jobId Unique process identifier.
     * @param {string} [message='Completed successfully'] final outcome summary.
     * @returns {this} Chainable monitor instance.
     */
    completeJob(jobId: string, message?: string): this;
    /**
     * Updates completion metrics and status message via high-frequency cache writes.
     * @param {string} jobId Unique process identifier.
     * @param {number} percentage progress value (0-100).
     * @param {string} [message=''] Contextual progress update.
     * @returns {this} Chainable monitor instance.
     * @throws {Error} If percentage is out of range.
     */
    updateProgress(jobId: string, percentage: number, message?: string): this;
    /**
     * Appends or updates a named sub-task within the job lifecycle and marks it as RUNNING.
     * @param {string} jobId Unique process identifier.
     * @param {string} stepName Semantic sub-task identifier.
     * @returns {this} Chainable monitor instance.
     * @throws {Error} If stepName is invalid.
     */
    logStepStart(jobId: string, stepName: string): this;
    /**
     * Marks a sub-task as COMPLETED or FAILED and records its duration.
     * @param {string} jobId Unique process identifier.
     * @param {string} stepName Semantic sub-task identifier.
     * @param {boolean} success Outcome of the sub-task.
     * @returns {this} Chainable monitor instance.
     */
    logStepComplete(jobId: string, stepName: string, success: boolean): this;
    /**
     * Registers a sub-task as SKIPPED within the job metadata.
     * @param {string} jobId Unique process identifier.
     * @param {string} stepName Semantic sub-task identifier.
     * @returns {this} Chainable monitor instance.
     */
    logStepSkipped(jobId: string, stepName: string): this;
    /**
     * Terminates process tracking with FAILED status and records diagnostic error metadata.
     * @param {string} jobId Unique process identifier.
     * @param {Error|string} error Descriptive failure details.
     * @returns {this} Chainable monitor instance.
     */
    setError(jobId: string, error: unknown): this;
    /**
     * Retrieves the comprehensive state record for a process from tiered storage.
     * @param {string} jobId Unique process identifier.
     * @returns {Object|null} Process state or null if unregistered.
     */
    getJobState(jobId: string): MonitorJobState | null;
    /**
     * Verifies the existence of a monitoring record for the specified process.
     * @param {string} jobId Unique process identifier.
     * @returns {boolean} True if a record is found.
     */
    hasJob(jobId: string): boolean;
    /**
     * Purges all state records for a process from both Cache and Properties tiers.
     * @param {string} jobId Unique process identifier.
     * @returns {this} Chainable monitor instance.
     */
    clearJob(jobId: string): this;
}
