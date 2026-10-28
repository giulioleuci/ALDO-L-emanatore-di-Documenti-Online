/**
 * @file ComposableContentLib/src/errors/ComposableContentError.js
 * @description Error classes for ComposableContentLib.
 * @version 1.0.0
 */
import { BaseError } from '@CoreUtilsLib';
/**
 * @description Base class for domain-specific exceptions within the composition engine.
 * Extends the shared {@link BaseError} to inherit standardized stack-trace capture and timestamping.
 * @class
 * @extends BaseError
 */
export declare class ComposableContentError extends BaseError {
    details: Record<string, unknown>;
    /**
     * @description Initializes a generic composition error with structured metadata.
     * @param {string} message Primary error description.
     * @param {Object} [details={}] Diagnostic payload.
     */
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * @description Exception thrown when a requested block type is not registered.
 * @class
 * @extends ComposableContentError
 */
export declare class BlockNotFoundError extends ComposableContentError {
    blockType: string;
    /**
     * @description Initializes a block resolution error.
     * @param {string} blockType Unresolved block identifier.
     */
    constructor(blockType: string);
}
/**
 * @description Exception thrown when template rendering fails during block execution.
 * @class
 * @extends ComposableContentError
 */
export declare class RenderingError extends ComposableContentError {
    blockType: string;
    format: string;
    cause: Error | null;
    /**
     * @description Initializes a rendering error with format context.
     * @param {string} message Specific failure reason.
     * @param {string} blockType Target block identifier.
     * @param {string} format Attempted output format.
     * @param {Error} [cause] Original caught exception.
     */
    constructor(message: string, blockType: string, format: string, cause?: Error | null);
}
/**
 * @description Exception thrown when a Recipe definition manifest fails structural validation.
 * @class
 * @extends ComposableContentError
 */
export declare class RecipeValidationError extends ComposableContentError {
    recipeId: string;
    validationErrors: string[];
    /**
     * @description Initializes a recipe validation error.
     * @param {string} message Summary of validation failures.
     * @param {string} recipeId Target recipe identifier.
     * @param {string[]} [validationErrors=[]] Collection of specific violation messages.
     */
    constructor(message: string, recipeId: string, validationErrors?: string[]);
}
/**
 * @description Exception thrown when no renderer is registered for a requested output format.
 * @class
 * @extends ComposableContentError
 */
export declare class RendererNotFoundError extends ComposableContentError {
    format: string;
    /**
     * @description Initializes a renderer resolution error.
     * @param {string} format Unresolved format string.
     */
    constructor(format: string);
}
/**
 * @description Exception thrown when a block's required template ID cannot be resolved.
 * @class
 * @extends ComposableContentError
 */
export declare class TemplateNotFoundError extends ComposableContentError {
    templateId: string;
    /**
     * @description Initializes a template resolution error.
     * @param {string} templateId Unresolved template identifier.
     */
    constructor(templateId: string);
}
/**
 * @description Exception thrown when a block's defined context data dependencies are unfulfilled.
 * @class
 * @extends ComposableContentError
 */
export declare class DataRequirementError extends ComposableContentError {
    blockType: string;
    missingKeys: string[];
    /**
     * @description Initializes a data dependency error.
     * @param {string} blockType Target block identifier.
     * @param {string[]} missingKeys Collection of missing required keys.
     */
    constructor(blockType: string, missingKeys: string[]);
}
