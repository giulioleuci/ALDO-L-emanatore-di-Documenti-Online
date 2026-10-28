import type { MyJobRunnerService } from '../../JobRunnerService.js';
import type { JobLogger, JobUtilities, RunnerServices, JobParameters, JobStatus, LoggingConfig, LogLevel, SemanticMethod } from '../../types.js';
export declare class JobRunnerExecutionController {
    facade: MyJobRunnerService;
    _logger: JobLogger;
    _utils: JobUtilities;
    _jobDefinitionRegistry: MyJobRunnerService['_jobDefinitionRegistry'];
    _propertiesService: MyJobRunnerService['_propertiesService'];
    _triggerService: MyJobRunnerService['_triggerService'];
    constructor(facade: MyJobRunnerService);
    _semantic(logger: JobLogger, method: SemanticMethod, args: unknown[], level: LogLevel, fallbackMessage: string): void;
    _logJobStart(logger: JobLogger, jobName: string, jobType: string): void;
    _logJobResume(logger: JobLogger, jobName: string, jobType: string, details?: unknown): void;
    _logTerminal(logger: JobLogger, jobName: string, result: unknown, status: Pick<JobStatus, 'state' | 'percentage'> | null, durationMs: number): void;
    _status(queue: Pick<import('../../JobQueue.js').JobQueue, 'getStatus'>, jobName: string, result: unknown): Pick<JobStatus, 'state' | 'percentage'>;
    run(jobName: string, jobType: string, parameters: JobParameters, jobHandlerRegistryCallback: (queue: import('../../JobQueue.js').JobQueue, services: RunnerServices) => unknown, forceRestart?: boolean, maxDurationMs?: number, loggingConfig?: LoggingConfig | null): unknown;
    resume(jobName: string | null | undefined, jobHandlerRegistryCallback: (queue: import('../../JobQueue.js').JobQueue, services: RunnerServices) => unknown, maxDurationMs?: number): unknown;
}
