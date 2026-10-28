import type { CapturingLogger } from '../CapturingLogger.js';
import type { JobLogger, LoggingConfig, LogDriveService } from '../../types.js';
export declare class JobRunnerLogCapturer {
    facade: Pick<import('../../JobRunnerService.js').MyJobRunnerService, '_logger'>;
    _logger: JobLogger;
    constructor(facade: Pick<import('../../JobRunnerService.js').MyJobRunnerService, '_logger'>);
    _validateLoggingConfig(loggingConfig: LoggingConfig): void;
    _displayLogs(capturingLogger: CapturingLogger, loggingConfig: LoggingConfig, jobName: string, error: unknown): void;
    _displayLogsInSidebar(capturingLogger: CapturingLogger, uiService: NonNullable<LoggingConfig['uiService']>, jobName: string, error: unknown): void;
    _displayLogsInDriveFile(capturingLogger: CapturingLogger, driveService: LogDriveService, folderId: string | null | undefined, jobName: string, error: unknown): void;
}
