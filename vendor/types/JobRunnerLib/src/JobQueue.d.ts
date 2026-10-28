import type { JobLogger, JobProperties, JobUtilities, JobLocks, JobTriggers, JobConfiguration, JobProgress, JobParameters, JobHandler, FailureCallback, JobStatus, JobExecutionResult } from './types.js';
import { QueueProgressTracker } from './internal/QueueProgressTracker';
import { JobTriggerManager } from './internal/managers/JobRunnerTriggerManager.js';
import { JobStateManager } from './internal/managers/JobRunnerStateManager.js';
export { JobTriggerManager, JobStateManager };
/**
 * Handles the low-level execution and monitoring of job generators.
 * @private
 * @class
 */
export declare class JobExecutor {
    _logger: JobLogger;
    _stateManager: JobStateManager;
    _triggerManager: JobTriggerManager;
    progressTracker: QueueProgressTracker;
    _calculateExactTotal: QueueProgressTracker['_calculateExactTotal'];
    /**
     * @param {Object} logger Logger instance.
     * @param {JobStateManager} stateManager Persistence and lock manager.
     * @param {JobTriggerManager} triggerManager Resume trigger controller.
     */
    constructor(logger: JobLogger, stateManager: JobStateManager, triggerManager: JobTriggerManager);
    /**
     * Executes job logic with interruption and persistence support.
     * @param {Function} handler Generator-based job function.
     * @param {Object} parameters Job context and resume state.
     * @param {number} startTime Execution start timestamp.
     * @param {number} maxDuration Timeout threshold.
     * @returns {{done: boolean, value?: *, cancelled?: boolean}} Execution outcome.
     * @throws {Error} If handler is not a generator.
     * @throws {TimeoutException} Captured internally to trigger state save and resume.
     */
    execute<Progress extends JobProgress | null | undefined, Output>(handler: (parameters: JobParameters) => Iterator<Progress, Output, unknown>, parameters: JobParameters, startTime: number, maxDuration: number): JobExecutionResult<Output | Progress | null>;
}
/**
 * High-level API for job registration, execution, and lifecycle management.
 * @class
 */
export declare class JobQueue {
    _logger: JobLogger;
    _utils: JobUtilities;
    _propertiesService: JobProperties;
    _triggerService: JobTriggers;
    _lockService: JobLocks;
    _maxExecutionDuration: number;
    _triggerDelayMs: number;
    _maxRetries: number | null;
    _onFailureCallback: FailureCallback | null;
    _jobHandlers: Record<string, JobHandler>;
    _config: JobConfiguration;
    /** @returns {number} 60000ms default delay between timeout and resume. */
    static get DEFAULT_TRIGGER_DELAY_MS(): number;
    /**
     * @param {Object} logger Logger instance (info, debug, error).
     * @param {Object} utils UtilitiesService (sleep).
     * @param {Object} propertiesService PropertiesService for state persistence.
     * @param {Object} triggerService TriggerService for resume scheduling.
     * @param {Object} lockService LockService for concurrency control.
     * @throws {Error} If any dependency is null or lacks required methods.
     */
    constructor(logger: JobLogger, utils: JobUtilities, propertiesService: JobProperties, triggerService: JobTriggers, lockService: JobLocks);
    /**
     * Configures global execution timeout.
     * @param {number} durationMs Max execution time.
     * @returns {JobQueue} Current instance.
     * @throws {Error} If durationMs is not positive.
     */
    setMaxDuration(durationMs: number): this;
    /**
     * Configures base delay for resume triggers.
     * @param {number} delayMs Delay in milliseconds.
     * @returns {JobQueue} Current instance.
     * @throws {Error} If delayMs is not positive.
     */
    setTriggerDelay(delayMs: number): this;
    /**
     * Configures retry limit for failed/timed-out jobs.
     * @param {number|null} maxRetries Integer limit or null for infinite.
     * @returns {JobQueue} Current instance.
     * @throws {Error} If maxRetries is invalid.
     */
    setMaxRetries(maxRetries: number | null): this;
    /**
     * Purges all job ScriptProperties on successful completion (default: keep the COMPLETED
     * tombstone). Persisted in the job config, so it also applies to trigger-driven resumes.
     * After a purge `getStatus(jobName)` reports `not_started`.
     * @param {boolean} purge
     * @returns {JobQueue} Current instance.
     */
    setPurgeOnComplete(purge: boolean): this;
    /**
     * Registers a terminal failure listener.
     * @param {Function|null} callback Function(error, jobState).
     * @returns {JobQueue} Current instance.
     */
    setOnFailure(callback: FailureCallback | null): this;
    /**
     * Restores queue configuration from a persistence object.
     * @param {Object} savedConfig Configuration snapshot.
     * @returns {JobQueue} Current instance.
     */
    applyConfiguration(savedConfig: JobConfiguration | null): this;
    /**
     * Maps a job type to a generator function.
     * @param {string} jobType Unique identifier.
     * @param {Function} handler Generator function: `function*(params)`.
     * @returns {JobQueue} Current instance.
     * @throws {Error} If handler is not a function.
     */
    registerJobHandler(jobType: string, handler: JobHandler): this;
    /**
     * Orchestrates job execution, state loading, and retry/timeout logic.
     *
     * @param {string} jobName Unique instance identifier (used for state key).
     * @param {string} jobType Registered handler type.
     * @param {Object} [parameters={}] Input data and context.
     * @param {boolean} [forceRestart=false] If true, purges existing state/locks before start.
     * @param {boolean} [blockIfSuspended=false] Refuse to start if the job is currently
     *   `'to_resume'` (interrupted by a timeout, awaiting its automatic resume trigger).
     *   Pass `true` for fresh/manual launches; leave `false` for the resume path itself,
     *   which must always be allowed to proceed regardless of this state.
     * @returns {*} Generator return value if complete; null if suspended or failed.
     * @throws {Error} If handler missing, fatal error occurs, or parameters are invalid.
     *
     * @example
     * queue.registerJobHandler('sync', function*(params) {
     *   yield { percentage: 50 };
     *   return { status: 'ok' };
     * });
     * const result = queue.execute('sync-1', 'sync', { id: 123 });
     */
    execute(jobName: string, jobType: string, parameters?: JobParameters, forceRestart?: boolean, blockIfSuspended?: boolean): unknown;
    /**
     * Purges all state and triggers associated with a job instance.
     * @param {string} jobName Unique instance identifier.
     * @returns {boolean} True if successful.
     */
    resetJobState(jobName: string): boolean;
    /**
     * Signals a job for termination. State is checked at next progress pulse.
     * @param {string} jobName Unique instance identifier.
     * @returns {boolean} True if cancellation signal was set.
     */
    cancelJob(jobName: string): boolean;
    /**
     * Retrieves live job telemetry.
     * @param {string} jobName Unique instance identifier.
     * @returns {{name: string, type: string, state: string, completed: boolean, percentage: number}}
     */
    getStatus(jobName: string): JobStatus;
}
