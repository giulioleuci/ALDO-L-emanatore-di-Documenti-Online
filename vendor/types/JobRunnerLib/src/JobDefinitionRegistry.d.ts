import type { JobLogger, JobDefinition } from './types.js';
/**
 * @file JobRunnerLib/src/JobDefinitionRegistry.js
 * @description Service for dynamic management of job definition registry.
 * @version 2.0
 */
import { Registry } from '@CoreUtilsLib';
/**
 * Centralized registry for dynamic job definition management.
 * Uses the shared {@link Registry} primitive (CoreUtilsLib) for Map-backed storage;
 * all job-specific validation, logging, and messages remain here.
 *
 * @class
 */
export declare class JobDefinitionRegistry {
    logger: Pick<JobLogger, 'debug' | 'warn' | 'error'>;
    definitions: Registry<string, JobDefinition>;
    /**
     * @param {Object} logger Logger instance (must implement debug, warn, error).
     * @throws {Error} If logger is null or missing required methods.
     */
    constructor(logger: Pick<JobLogger, 'debug' | 'warn' | 'error'>);
    /**
     * Registers a job definition.
     */
    register(jobNameOrDefinition: string, jobDefinition: JobDefinition): void;
    /**
     * Retrieves a registered definition.
     */
    getDefinition(jobName: string): JobDefinition | null;
    /**
     * Lists all registered job identifiers.
     */
    listRegisteredJobs(): string[];
    /**
     * Verifies job existence.
     */
    jobExists(jobName: string): boolean;
    /**
     * @private
     */
    _validateJobDefinition(jobName: string, jobDefinition: JobDefinition): void;
}
