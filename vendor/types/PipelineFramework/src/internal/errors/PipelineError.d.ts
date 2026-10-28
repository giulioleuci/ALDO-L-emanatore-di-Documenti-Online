/**
 * @file PipelineFramework/src/errors/PipelineError.js
 * @description Base error class for pipeline-related errors.
 * @version 1.0.0
 */
import { BaseError } from '@CoreUtilsLib';
/**
 * Base class for all errors in the PipelineFramework.
 * Extends the shared {@link BaseError} to inherit standardized stack-trace capture and timestamping.
 *
 * @class PipelineError
 * @extends BaseError
 *
 * @example
 * throw new PipelineError('Failure message', { step: 'StepName' });
 */
export declare class PipelineError<Context extends object | null = Record<string, unknown>> extends BaseError<Context> {
    /**
     * @param {string} message - Descriptive error text.
     * @param {Object} [context={}] - Diagnostic metadata.
     * @param {string} [context.pipelineName] - Identifier of the active pipeline.
     * @param {string} [context.currentStep] - Identifier of the failed step.
     * @param {number} [context.stepIndex] - 0-based index of the failed step.
     * @param {Error} [context.originalError] - Root cause exception.
     */
    constructor(message: string, context?: Context);
}
