/**
 * @file PipelineFramework/src/Pipeline.js
 * @description Main pipeline orchestrator for sequential step execution.
 * @version 1.0.0
 */
import { PipelineContext } from './PipelineContext.js';
/**
 * Orchestrator for sequential step execution with shared context and lifecycle hooks.
 *
 * @class
 */
import type { PipelineLogger, PipelineOptions, RetryService, PipelineStep, StepResult, PipelineHooks, LogPosition } from './internal/contracts.js';
export declare class Pipeline<Data extends object = Record<string, unknown>> {
    _logger: PipelineLogger;
    _exceptionService: RetryService | null;
    _name: string;
    _stopOnError: boolean;
    _maxRetries: number;
    _logPosition: LogPosition;
    _collapseSkippedSteps: boolean;
    _steps: PipelineStep<Data>[];
    _hooks: PipelineHooks<Data>;
    /**
     * @param {Object} logger Logger instance (info, debug, warn, error).
     * @param {Object} [exceptionService=null] Resilience provider for step-level retries.
     * @param {Object} [options={}] Pipeline configuration.
     * @param {boolean} [options.collapseSkippedSteps=false] Log consecutive skipped steps with the same reason as one line.
     * @throws {Error} If logger is invalid or dependencies are unmet.
     */
    constructor(logger: PipelineLogger, exceptionService?: RetryService | null, options?: PipelineOptions);
    _normalizeLogPosition(position?: Partial<LogPosition> | null): {
        depth: number;
        isLast: boolean;
        ancestorHasNext: boolean[];
    };
    _stepLogPosition(index: number): {
        depth: number;
        isLast: boolean;
        ancestorHasNext: boolean[];
    };
    _summaryLogPosition(): {
        isLast: boolean;
        depth: number;
        ancestorHasNext: boolean[];
    };
    _executionLogPosition(index: number): {
        depth: number;
        isLast: boolean;
        ancestorHasNext: boolean[];
    };
    _logPipelineStart(): void;
    _logPipelineStep(stepName: string, status: string, details: unknown, position: LogPosition): void;
    _fallbackDetailText(details: unknown): string;
    _logPipelineSummary(context: PipelineContext<Data>, prefix?: string): void;
    /** @returns {string} */
    getName(): string;
    /** @returns {Object} Logger instance. */
    get logger(): PipelineLogger;
    /** @returns {Step[]} Active sequence. */
    getSteps(): PipelineStep<Data>[];
    /**
     * appends a step to the active sequence.
     * @param {Step} step Valid Step instance.
     * @returns {Pipeline} Current instance for chaining.
     */
    addStep(step: PipelineStep<Data>): this;
    /**
     * Registers a pre-step callback.
     * @param {Function} callback
     * @returns {Pipeline}
     */
    beforeStep(callback: PipelineHooks<Data>['beforeStep'][number]): this;
    /**
     * Registers a post-step callback.
     * @param {Function} callback
     * @returns {Pipeline}
     */
    afterStep(callback: PipelineHooks<Data>['afterStep'][number]): this;
    /**
     * Registers a step-level failure listener.
     * @param {Function} callback
     * @returns {Pipeline}
     */
    onError(callback: PipelineHooks<Data>['onError'][number]): this;
    /**
     * Registers a pipeline completion listener.
     * @param {Function} callback
     * @returns {Pipeline}
     */
    onComplete(callback: PipelineHooks<Data>['onComplete'][number]): this;
    /**
     * Safely invoke a list of hook callbacks, swallowing and logging errors.
     * @private
     */
    _invokeHooks<Args extends unknown[]>(hookList: ((...args: Args) => unknown)[], ...args: Args): void;
    /**
     * Internal step execution wrapper with hook and retry orchestration.
     * @private
     * @param {Step} step
     * @param {PipelineContext} context
     * @returns {{success: boolean, skipped: boolean, durationMs: number, error?: Error}}
     */
    _executeStep(step: PipelineStep<Data>, context: PipelineContext<Data>): StepResult;
    /**
     * Sequentially executes all steps.
     * @param {Object} [initialData={}]
     * @returns {PipelineContext}
     */
    execute(initialData?: Partial<Data> | null): PipelineContext<Data>;
    /**
     * @returns {Pipeline}
     */
    clearSteps(): this;
}
