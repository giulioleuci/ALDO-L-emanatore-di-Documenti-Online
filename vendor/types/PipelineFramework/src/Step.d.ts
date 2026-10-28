/**
 * @file PipelineFramework/src/Step.js
 * @description Abstract base class for pipeline steps.
 * @version 1.0.0
 */
/**
 * Abstract foundation for all pipeline steps.
 * Manages context validation, conditional execution, error handling, and performance tracking.
 *
 * @class Step
 * @abstract
 * @typedef {Object} StepOptions
 * @property {string[]} [requiredKeys=[]] - Mandatory context keys for pre-execution validation.
 * @property {boolean} [continueOnError=false] - Whether to proceed with the pipeline if this step fails.
 * @property {Function} [shouldExecuteCondition=null] - Predicate function (context => boolean) for conditional logic.
 *
 * @typedef {Object} StepExecutionResult
 * @property {boolean} success - True if step completed or continueOnError was active.
 * @property {boolean} skipped - True if shouldExecute() returned false.
 * @property {string} [skipReason] - Stable reason when skipped is true.
 * @property {number} durationMs - Total execution time in milliseconds.
 * @property {*} [logDetails] - Optional success details for pipeline observability.
 * @property {Error} [error] - Captured error if continueOnError is true.
 *
 * @example
 * class DataFetchStep extends Step {
 *   _executeLogic(context) {
 *     const data = fetch(context.get('id'));
 *     this.setResult(context, 'result', data);
 *   }
 * }
 */
import type { PipelineContext } from './PipelineContext.js';
import type { PipelineLogger, StepOptions, StepExecutionResult } from './internal/contracts.js';
export declare class Step<Data extends object = Record<string, unknown>> {
    _name: string;
    _logger: PipelineLogger;
    _requiredKeys: string[];
    _continueOnError: boolean;
    _shouldExecuteCondition: StepOptions<Data>['shouldExecuteCondition'];
    /**
     * @param {string} name - Unique step identifier.
     * @param {LoggerService} logger - Foundation logging service.
     * @param {StepOptions} [options={}] - Step configuration.
     * @throws {Error} If name is not a non-empty string or logger lacks required methods.
     */
    constructor(name: string, logger: PipelineLogger, options?: StepOptions<Data>);
    /**
     * @returns {string} Unique step identifier.
     */
    getName(): string;
    /**
     * @returns {LoggerService} Active logging instance.
     */
    get logger(): PipelineLogger;
    /**
     * Evaluates if the step should execute based on current context.
     * Prioritizes 'shouldExecuteCondition' from options if present.
     *
     * @param {PipelineContext} context - Active pipeline execution context.
     * @returns {boolean} True if step execution should proceed.
     */
    shouldExecute(context: PipelineContext<Data>): unknown;
    /**
     * Asserts presence of required keys in the context.
     *
     * @param {PipelineContext} context - Active pipeline execution context.
     * @param {string[]} [requiredKeys] - Keys to validate (overrides instance defaults).
     * @throws {ContextValidationError} If any required keys are missing from context.
     * @protected
     */
    verifyContext(context: PipelineContext<Data>, requiredKeys?: string[]): void;
    /**
     * Writes a value to the pipeline context.
     *
     * @param {PipelineContext} context - Active pipeline execution context.
     * @param {string} key - Target context key.
     * @param {*} value - Data to persist.
     * @returns {Step} Current instance for chaining.
     * @throws {Error} If key is not a string.
     * @protected
     */
    setResult<K extends string>(context: PipelineContext<Data>, key: K, value: K extends keyof Data ? Data[K] : unknown): this;
    /**
     * Retrieves a value from the context with an optional fallback.
     *
     * @param {PipelineContext} context - Active pipeline execution context.
     * @param {string} key - Context key to read.
     * @param {*} [defaultValue=null] - Fallback if key is absent.
     * @returns {*} Context value or defaultValue.
     * @protected
     */
    getContextValue<K extends string, Fallback = null>(context: PipelineContext<Data>, key: K, defaultValue?: Fallback): Exclude<Fallback, undefined> | (K extends keyof Data ? Data[K] | undefined : unknown) | (undefined extends Fallback ? null : never);
    /**
     * Core business logic implementation. Must be implemented by subclasses.
     *
     * @param {PipelineContext} context - Active pipeline execution context.
     * @returns {void}
     * @throws {Error} If not implemented by subclass.
     * @protected
     * @abstract
     */
    _executeLogic(_context: PipelineContext<Data>): void;
    /**
     * Returns optional success details for pipeline observability.
     * @param {PipelineContext} _context - Completed execution context.
     * @returns {*|null} Scalar, short scalar array, or null when no detail is available.
     * @protected
     */
    _getLogDetails(_context: PipelineContext<Data>): unknown;
    /**
     * Orchestrates the step lifecycle: condition check, validation, logic execution, and error handling.
     *
     * @param {PipelineContext} context - Active pipeline execution context.
     * @returns {StepExecutionResult} Performance data and execution status.
     * @throws {StepExecutionError} If logic fails and continueOnError is false.
     */
    execute(context: PipelineContext<Data>): StepExecutionResult;
}
