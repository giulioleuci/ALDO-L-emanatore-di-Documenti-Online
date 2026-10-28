import type { JobProperties, JobServices, IterationLevel } from '../types.js';
/**
 * @file JobRunnerLib/src/QueueProgressTracker.js
 * @description Tracks job progress and calculates exact total actions from iteration levels.
 * Extracted from JobStateManager and JobExecutor for improved separation of concerns.
 */
export declare class QueueProgressTracker {
    jobName: string;
    _propertiesService: JobProperties;
    constructor(jobName: string, propertiesService: JobProperties);
    _key(suffix: string): string;
    saveProgress(progress: unknown): void;
    reset(): void;
    _calculateExactTotal(levels: IterationLevel[], services: JobServices): number;
}
