import type { LoggerService } from '@CoreUtilsLib';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type SemanticMethod = 'logJobStart' | 'logJobResume' | 'logJobEnd' | 'logJobSuspended' | 'logBatchStart' | 'logItemStart' | 'logStep' | 'logPipelineStart' | 'logPipelineStep' | 'logSummary';
export type JobLogger = {
    [Level in LogLevel | 'log']: (...args: Parameters<LoggerService[Level]>) => unknown;
} & Partial<{
    [Method in SemanticMethod | 'setLevel']: (...args: Parameters<LoggerService[Method]>) => unknown;
}> & Partial<Pick<LoggerService, 'withPosition' | 'getLevel'>>;
export interface JobProperties {
    getProperty(key: string): string | null | undefined;
    setProperty(key: string, value: unknown): unknown;
    setProperties(properties: Record<string, string>): unknown;
    deleteProperty(key: string): unknown;
    setObjectProperty(key: string, value: unknown): unknown;
    getObjectProperty(key: string): unknown;
}
export interface JobUtilities {
    sleep(milliseconds: number): unknown;
}
export interface JobLocks {
    getScriptLock(): {
        tryLock(timeout: number): boolean;
        releaseLock(): unknown;
    };
}
export interface JobTriggers {
    createTimedTrigger(handler: string, delay: number): string;
    deleteTriggerById(id: string): unknown;
    getAllTriggers(): {
        id?: string;
        handler?: unknown;
    }[];
}
export interface StateFile {
    getId(): string;
    setContent(content: string): unknown;
    getBlob(): {
        getDataAsString(): string;
    };
    setTrashed(trashed: boolean): unknown;
}
export interface StateFolder {
    createFile(name: string, content: string, mimeType: string): StateFile;
}
export interface StateDriveApp {
    getFileById(id: string): StateFile;
    getFoldersByName(name: string): {
        hasNext(): boolean;
        next(): StateFolder;
    };
    createFolder(name: string): StateFolder;
}
export interface StateDriveService {
    getStandardApp(): StateDriveApp | undefined;
}
export interface LogDriveService {
    getStandardApp(): {
        getFolderById(id: string): {
            createFile(name: string, content: string, mimeType: string): Pick<StateFile, 'getId'>;
        };
        createFile(name: string, content: string, mimeType: string): Pick<StateFile, 'getId'>;
    };
}
export interface LogSidebar {
    setTitle(title: string): this;
    setContent(content: string): this;
    setWidth(width: number): this;
    show(): unknown;
}
export interface LoggingConfig {
    target: 'sidebar' | 'driveFile';
    uiService?: {
        createSidebar(): LogSidebar;
    };
    driveService?: LogDriveService;
    driveFolderId?: string;
}
export interface JobProgress extends Record<string, unknown> {
    percentage?: number;
    message?: string;
    total?: number;
}
export interface JobServices extends Record<string, unknown> {
    logger?: JobLogger;
    utils?: JobUtilities;
    properties?: JobProperties;
    triggers?: JobTriggers;
    monitor?: {
        updateProgress(name: string, percentage: number, message: string): unknown;
    };
}
export type RunnerServices = Required<Pick<JobServices, 'logger' | 'utils' | 'properties' | 'triggers'>> & JobServices;
export interface IterationLevel<Services extends object = JobServices> {
    name: string;
    elementsGenerator?: (context: Record<string, unknown>, services: Services) => unknown[];
    countGenerator?: (context: Record<string, unknown>, services: Services) => number;
    filter?: ((element: unknown, services: Services) => boolean) | null;
}
export interface JobDefinition {
    name: string;
    action: (...args: never[]) => unknown;
    description?: string | null;
    requiredParameters?: string[];
    iterationLevels?: IterationLevel[];
    finalAction?: (...args: never[]) => unknown;
}
export interface JobParameters extends Record<string, unknown> {
    jobDefinition?: Partial<JobDefinition> | null;
    services?: JobServices;
    resumeState?: unknown;
}
export type JobHandler<Output = unknown> = (parameters: JobParameters) => Iterator<JobProgress | null | undefined, Output, unknown>;
export type JobExecutionResult<T> = {
    done: false;
    value?: never;
    cancelled?: never;
} | {
    done: true;
    value?: T;
    cancelled?: boolean;
};
export interface JobConfiguration extends Record<string, unknown> {
    purgeOnComplete?: boolean;
    maxExecutionDuration?: number;
    triggerDelayMs?: number;
    maxRetries?: number | null;
}
export interface BatchState {
    resumeState?: unknown;
    progress?: unknown;
    config?: JobConfiguration;
    type?: string;
    state?: string;
}
export interface JobStatus extends Record<string, unknown> {
    name: string;
    type: string;
    state: string;
    percentage?: number;
}
export type FailureCallback = (error: unknown, state: {
    name: string;
    type: string;
    retryCount: number;
    state: string | null | undefined;
}) => unknown;
