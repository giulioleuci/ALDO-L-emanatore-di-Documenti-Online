import type { TemplateLogger } from './types.js';
/**
 * @file WorkspaceTemplateEngine/src/FilterStrategy.js
 * @description Base class and registry for template filters using Strategy pattern.
 *              WTE-HIGH-001: Refactored from inline filter implementations for better
 *              extensibility, testability, and maintainability.
 * @version 2.0.0
 */
/**
 * @description Abstract base for Mustache template filters using the Strategy pattern.
 * Enables value transformations via pipe syntax: `{{value | filterName:args}}`.
 * @abstract
 * @class
 * @example
 * class UppercaseFilter extends FilterStrategy {
 *   getName() { return 'uppercase'; }
 *   execute(v) { return String(v).toUpperCase(); }
 * }
 */
export declare class FilterStrategy<Input = unknown, Output = unknown, Args extends unknown[] = unknown[]> {
    /**
     * @description Returns the unique identifier for the filter used in template expressions.
     * @returns {string} Unique filter name (e.g., 'uppercase').
     * @abstract
     */
    getName(): string;
    /**
     * @description Performs the core value transformation.
     * @param {*} value Input value to be transformed.
     * @param {...*} args Optional arguments passed from the template expression.
     * @returns {*} The transformed value.
     * @abstract
     */
    execute(_value: Input, ..._args: Args): Output;
    /**
     * @description Validates filter arguments before execution.
     * @param {*} value The input value.
     * @param {Array<*>} args Array of arguments passed to the filter.
     * @throws {Error} If argument validation fails.
     */
    validate(_value: Input, _args?: Args): void;
}
/**
 * @description Centralized registry for managing and resolving FilterStrategy instances.
 * @class
 */
export declare class FilterRegistry {
    _logger: Pick<TemplateLogger, 'debug' | 'warn' | 'error'>;
    _filters: Map<string, FilterStrategy>;
    /**
     * @description Initializes the registry with an optional diagnostic logger.
     * @param {Object} [logger=console] Logger instance for internal tracking.
     */
    constructor(logger?: Pick<TemplateLogger, 'debug' | 'warn' | 'error'> | null);
    /**
     * @description Registers a new filter strategy.
     * @param {FilterStrategy} filterStrategy Instance of a FilterStrategy subclass.
     * @throws {Error} If filterStrategy is invalid or name collisions occur.
     */
    register(filterStrategy: FilterStrategy): void;
    /**
     * @description Batch registers multiple filter strategies.
     * @param {FilterStrategy[]} filterStrategies Array of filter instances.
     * @throws {Error} If input is not an array.
     */
    registerAll(filterStrategies: FilterStrategy[]): void;
    /**
     * @description Resolves a filter strategy by its unique name.
     * @param {string} name Unique identifier of the filter.
     * @returns {FilterStrategy|null} Filter instance or null if not registered.
     */
    get(name: string): FilterStrategy<unknown, unknown, unknown[]> | null;
}
