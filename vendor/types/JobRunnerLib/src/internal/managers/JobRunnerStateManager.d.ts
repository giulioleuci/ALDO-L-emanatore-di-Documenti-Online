import type { JobProperties, JobUtilities, JobLocks, StateDriveService } from '../../types.js';
/**
 * @file JobRunnerLib/src/managers/JobRunnerStateManager.js
 * @description Manager for job state persistence and status tracking.
 */
import { QueueStateManager } from '../../QueueStateManager';
import { QueuePersistenceHandler } from '../QueuePersistenceHandler';
import { QueueProgressTracker } from '../QueueProgressTracker';
export interface JobStateManager extends Pick<QueueStateManager, '_key' | 'getStateVersion' | '_incrementVersion' | 'setState' | 'getState' | 'isCancelled' | 'getStateWithVersion' | 'tryAcquireRunning' | 'releaseLock' | 'getRetryCount' | 'incrementRetryCount' | 'resetRetryCount' | 'saveFailureInfo' | 'getFailureInfo'>, Pick<QueuePersistenceHandler, 'batchSave' | 'saveResumeState' | 'loadResumeState' | 'clearResumeState' | '_saveLargeStateToDrive' | '_loadLargeStateFromDrive' | '_getOrCreateJobStateFolder' | 'saveConfiguration' | 'loadConfiguration' | 'saveType' | 'loadType'>, Pick<QueueProgressTracker, 'saveProgress'> {
}
export declare class JobStateManager {
    jobName: string;
    _propertiesService: JobProperties;
    _utils: JobUtilities;
    _lockService: JobLocks;
    _driveService: StateDriveService | null;
    stateManager: QueueStateManager;
    persistenceHandler: QueuePersistenceHandler;
    progressTracker: QueueProgressTracker;
    static get STATE_RUNNING(): string;
    static get STATE_COMPLETED(): string;
    static get STATE_CANCELLED(): string;
    static get STATE_FAILED(): string;
    static get STATE_PENDING(): string;
    static get LARGE_STATE_THRESHOLD(): number;
    constructor(jobName: string, propertiesService: JobProperties, utils: JobUtilities, lockService: JobLocks, driveService?: StateDriveService | null);
    reset(): void;
}
export declare class JobRunnerStateManager {
    facade: Pick<import('../../JobRunnerService.js').MyJobRunnerService, '_createQueue' | '_logger'>;
    constructor(facade: Pick<import('../../JobRunnerService.js').MyJobRunnerService, '_createQueue' | '_logger'>);
    getStatus(jobName: string): import("../../types.js").JobStatus;
    resetJob(jobName: string): boolean;
    cancelJob(jobName: string): boolean;
}
