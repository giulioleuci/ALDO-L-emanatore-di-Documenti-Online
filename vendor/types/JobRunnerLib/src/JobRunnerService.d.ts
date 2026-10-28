import type { JobLogger, JobUtilities, JobTriggers } from './types.js';
import { PropertiesService } from '@GoogleApiWrapper';
import { JobQueue } from './JobQueue.js';
import { JobRunnerTriggerManager } from './internal/managers/JobRunnerTriggerManager.js';
import { JobRunnerStateManager } from './internal/managers/JobRunnerStateManager.js';
import { JobRunnerExecutionController } from './internal/managers/JobRunnerExecutionController.js';
import { JobRunnerLogCapturer } from './internal/managers/JobRunnerLogCapturer.js';
export interface MyJobRunnerService extends Pick<JobRunnerTriggerManager, '_getCurrentTriggerId'>, Pick<JobRunnerStateManager, 'getStatus' | 'resetJob' | 'cancelJob'>, Pick<JobRunnerExecutionController, 'run' | 'resume'>, Pick<JobRunnerLogCapturer, '_validateLoggingConfig' | '_displayLogs' | '_displayLogsInSidebar' | '_displayLogsInDriveFile'> {
}
export declare class MyJobRunnerService {
    _logger: JobLogger;
    _utils: JobUtilities;
    _jobDefinitionRegistry: Pick<import('./JobDefinitionRegistry.js').JobDefinitionRegistry, 'getDefinition' | 'jobExists'>;
    _propertiesService: PropertiesService;
    _triggerService: JobTriggers;
    _triggerManager: JobRunnerTriggerManager;
    _stateManager: JobRunnerStateManager;
    _executionController: JobRunnerExecutionController;
    _logCapturer: JobRunnerLogCapturer;
    constructor(logger: JobLogger, utils: JobUtilities, jobDefinitionRegistry: Pick<import('./JobDefinitionRegistry.js').JobDefinitionRegistry, 'getDefinition' | 'jobExists'>);
    /**
     * Factory for JobQueue instances with injected platform services.
     * @private
     * @returns {JobQueue} Initialized queue with native GAS lock/trigger support.
     */
    _createQueue(): JobQueue;
}
export { MyJobRunnerService as JobRunnerService };
