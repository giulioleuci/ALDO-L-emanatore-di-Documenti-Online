/**
 * @file PipelineFramework/src/errors/ContextValidationError.js
 * @description Error thrown when context validation fails.
 * @version 1.0.0
 */
import { PipelineError } from './PipelineError.js';
/**
 * Error signaling a failure in context key validation before step execution.
 *
 * @class ContextValidationError
 * @extends PipelineError
 *
 * @example
 * throw new ContextValidationError('StepName', ['requiredKey'], contextData);
 */
export declare class ContextValidationError extends PipelineError {
    stepName: string;
    missingKeys: string[];
    /**
     * @param {string} stepName - Identifier of the step where validation failed.
     * @param {string[]} missingKeys - Array of required keys absent from context.
     * @param {Object} context - Raw context data for diagnostic inclusion.
     */
    constructor(stepName: string, missingKeys: string[], context: object | null | undefined);
}
