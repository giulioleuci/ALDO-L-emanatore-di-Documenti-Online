import type { ContextLogger, Processor, ProcessorConfig } from './internal/contracts.js';
/**
 * Registry and execution engine for sequential provider data transformation pipelines.
 * @class
 */
export declare class PostProcessor {
    _logger: ContextLogger;
    _processors: Map<string, Processor>;
    /**
     * Initializes the processor with required logger and auto-registers built-in transformations.
     * Built-ins: filterFields, mapValues, renameFields, defaultValues.
     * @param {Object} logger Logger service with debug, info, warn, error methods.
     * @throws {Error} If logger is missing or lacks required interface methods.
     */
    constructor(logger: ContextLogger);
    /**
     * Internal logger instance.
     * @type {Object}
     * @readonly
     */
    get logger(): import("../../PipelineFramework/index.js").PipelineLogger;
    /**
     * Instantiates and registers the default transformation library.
     * @private
     */
    _registerBuiltInProcessors(): void;
    /**
     * Adds a custom transformation function to the registry.
     * @param {string} type Transformation identifier (referenced in recipes).
     * @param {Function} processorFunc Signature: (data, config) => transformedData.
     * @returns {PostProcessor} Fluent interface for chaining.
     * @throws {Error} If type is empty or processorFunc is not a function.
     */
    register<Data = unknown, Result = unknown>(type: string, processorFunc: (data: Data, config: ProcessorConfig) => Result): this;
    /**
     * Validates presence of a transformation identifier in the registry.
     * @param {string} type Transformation identifier.
     * @returns {boolean} True if registered.
     */
    has(type: string): boolean;
    /**
     * Executes a pipeline of transformations sequentially on a data payload.
     * @param {Object[]} processorConfigs Collection of transformation configurations ({type, ...}).
     * @param {*} data Input payload (object, array, or literal).
     * @param {string} [providerName=''] Contextual provider name for diagnostic logging.
     * @returns {*} Transformed payload.
     * @throws {Error} If processor type is unregistered or a transformation logic fails.
     * @example
     * const result = processor.process([
     *   { type: 'filterFields', fields: ['id', 'email'] },
     *   { type: 'renameFields', mapping: { email: 'user_email' } }
     * ], rawData);
     */
    process(processorConfigs: ProcessorConfig[], data: unknown, providerName?: string): unknown;
    /**
     * Retrieves all registered transformation identifiers.
     * @returns {string[]} Collection of registered type names.
     */
    getRegisteredTypes(): string[];
}
