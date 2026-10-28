/**
 * @file ContextEngine/src/errors/DependencyResolutionError.js
 * @description Error thrown when dependency resolution fails.
 * @version 1.0.0
 */
import { ContextEngineError } from './ContextEngineError.js';
/**
 * Error indicating failure to resolve @param or $provider references due to missing data, incorrect paths, or invalid execution order.
 * @class
 * @extends ContextEngineError
 */
export declare class DependencyResolutionError extends ContextEngineError {
    dependency: string | undefined;
    providerName: string | undefined;
    /**
     * Initializes the error with dependency-specific diagnostic metadata.
     * @param {string} message Descriptive failure message.
     * @param {Object} context Diagnostic payload.
     * @param {string} [context.dependency] Raw reference string (e.g., '@userId', '$user.id').
     * @param {string} [context.providerName] ID of the provider being configured.
     * @param {string[]} [context.availableParams] Collection of provided @param keys.
     * @param {string[]} [context.availableProviders] Collection of executed $provider keys.
     * @param {string} [context.propertyPath] Targeted sub-property path within a provider result.
     * @param {Object} [context.actualStructure] Actual data structure returned by the provider (for path debugging).
     */
    constructor(message: string, context?: Record<string, unknown> & {
        dependency?: string;
        providerName?: string;
    });
}
