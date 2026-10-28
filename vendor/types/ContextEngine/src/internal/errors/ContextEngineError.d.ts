/**
 * @file ContextEngine/src/errors/ContextEngineError.js
 * @description Base error class for context engine-related errors.
 * @version 1.0.0
 */
import { BaseError } from '@CoreUtilsLib';
/**
 * Foundation error class for the ContextEngine hierarchy, providing structured metadata and error chaining.
 * Extends the shared {@link BaseError} to inherit standardized stack-trace capture and timestamping.
 * @class
 * @extends BaseError
 */
export declare class ContextEngineError<Context extends object | null = Record<string, unknown>> extends BaseError<Context> {
    /**
     * Initializes the error instance with an enriched context payload.
     * @param {string} message Descriptive error message.
     * @param {Object} [context={}] Metadata payload for diagnostics.
     * @param {string} [context.recipeName] Identifier of the executing recipe.
     * @param {string} [context.currentProvider] Identifier of the active provider.
     * @param {Error} [context.originalError] Upstream error instance for chaining.
     * @param {Object} [context.parameters] Arguments passed to the provider.
     * @param {string} [context.step] Pipeline stage (e.g., 'resolution', 'execution').
     */
    constructor(message: string, context?: Context);
    /**
     * Serializes the error and its associated context into a human-readable diagnostic string.
     * @returns {string} Formatted error name, message, and JSON-serialized context.
     */
    toString(): string;
}
