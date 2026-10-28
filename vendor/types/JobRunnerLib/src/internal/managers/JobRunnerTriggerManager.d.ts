import type { JobLogger, JobProperties, JobTriggers } from '../../types.js';
/**
 * @file JobRunnerLib/src/managers/JobRunnerTriggerManager.js
 * @description Manager for automatic resume triggers and trigger context discovery.
 */
export declare class JobTriggerManager {
    jobName: string;
    _propertiesService: JobProperties;
    _triggerService: JobTriggers;
    _triggerDelayMs: number;
    constructor(jobName: string, propertiesService: JobProperties, triggerService: JobTriggers, triggerDelayMs?: number);
    createResumeTrigger(): void;
    deleteExistingTriggers(): void;
}
export declare class JobRunnerTriggerManager {
    _logger: JobLogger;
    _triggerService: JobTriggers;
    constructor(facade: {
        _logger: JobLogger;
        _triggerService: JobTriggers;
    });
    /**
     * Discovers the unique identifier of the trigger that initiated current execution.
     * @private
     * @returns {string|null} Trigger ID if context is matched; null if direct execution or discovery fails.
     */
    _getCurrentTriggerId(): string | null;
}
