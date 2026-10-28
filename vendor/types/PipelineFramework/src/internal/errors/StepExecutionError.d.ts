/**
 * @file PipelineFramework/src/errors/StepExecutionError.js
 * @description Error thrown when a step execution fails.
 * @version 1.0.0
 */
import { PipelineError } from './PipelineError.js';
/**
 * Error signaling a failure within a step's execution logic.
 *
 * @class StepExecutionError
 * @extends PipelineError
 *
 * @example
 * throw new StepExecutionError('StepName', originalError, contextData);
 */
export declare class StepExecutionError extends PipelineError<{
    stepName: string;
    originalError: Error;
    contextState: string[];
}> {
    originalError: Error;
    stepName: string;
    /**
     * @param {string} stepName - Identifier of the step where execution failed.
     * @param {Error} originalError - The root cause exception.
     * @param {Object} context - Raw context data for diagnostic state capture.
     */
    constructor(stepName: string, originalError: Error, context: object | null | undefined);
}
