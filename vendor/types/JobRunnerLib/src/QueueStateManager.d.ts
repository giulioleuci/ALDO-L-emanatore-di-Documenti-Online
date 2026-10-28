import type { JobProperties, JobUtilities, JobLocks } from './types.js';
/**
 * @file JobRunnerLib/src/QueueStateManager.js
 * @description Manages atomic lock acquisition, versioning, state tracking, and retries.
 * Extracted from JobStateManager for improved separation of concerns.
 */
export declare class QueueStateManager {
    jobName: string;
    _propertiesService: JobProperties;
    _utils: JobUtilities;
    _lockService: JobLocks;
    static get STATE_RUNNING(): string;
    static get STATE_COMPLETED(): string;
    static get STATE_CANCELLED(): string;
    static get STATE_FAILED(): string;
    static get STATE_PENDING(): string;
    constructor(jobName: string, propertiesService: JobProperties, utils: JobUtilities, lockService: JobLocks);
    _key(suffix: string): string;
    getStateVersion(): number;
    _incrementVersion(): number;
    setState(state: string, expectedVersion?: number | null): boolean;
    getState(): string | null | undefined;
    isCancelled(): boolean;
    getStateWithVersion(): {
        state: string | null | undefined;
        version: number;
    };
    /**
     * @param {boolean} [blockIfSuspended=false] Refuse acquisition when the job is
     *   currently `'to_resume'` (interrupted by a timeout, awaiting its automatic
     *   resume trigger). Only a fresh/manual launch should pass `true` — the resume
     *   path itself (the trigger firing) must always be allowed through regardless
     *   of this state, since resuming a suspended job is exactly what it's for.
     *   Without this guard a fresh launch of the same jobName silently resumes the
     *   stale checkpoint instead of being refused, and can race the real trigger
     *   into a second concurrent execution.
     */
    tryAcquireRunning(blockIfSuspended?: boolean): boolean;
    releaseLock(): void;
    getRetryCount(): number;
    incrementRetryCount(): number;
    resetRetryCount(): void;
    saveFailureInfo(failureInfo: unknown): void;
    getFailureInfo(): unknown;
    reset(): void;
}
