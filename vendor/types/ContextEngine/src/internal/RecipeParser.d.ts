import type { ContextLogger, Recipe, ProviderConfig, NormalizedRecipe } from './contracts.js';
/**
 * Engine for structural validation, type checking, and normalization of JSON recipes.
 * @class
 * @example
 * const recipe = {
 *   providers: [
 *     {
 *       name: 'user',
 *       type: 'UserDataProvider',
 *       parameters: { id: '@userId' },
 *       condition: 'is_admin == true',
 *       postProcess: [{ type: 'filter', fields: ['id'] }]
 *     }
 *   ]
 * };
 */
export declare class RecipeParser {
    _logger: ContextLogger;
    /**
     * Initializes the parser with a required logger service.
     * @param {Object} logger Logger service with debug, info, warn, error methods.
     * @throws {Error} If logger is missing or lacks required interface methods.
     */
    constructor(logger: ContextLogger);
    /**
     * Internal logger instance.
     * @type {Object}
     * @readonly
     */
    get logger(): import("../../../PipelineFramework/index.js").PipelineLogger;
    /**
     * Evaluates a provider configuration against structural and type constraints.
     * @param {Object} provider Provider configuration object.
     * @param {number} index Array index for error context.
     * @returns {string[]} Collection of validation error messages.
     * @private
     */
    _validateProvider(provider: ProviderConfig, index: number): string[];
    /**
     * Executes full recipe validation and normalization. Collects structural, type, and uniqueness errors.
     * @param {Object} recipe Raw JSON recipe.
     * @param {Object[]} recipe.providers Collection of provider configurations.
     * @returns {Object} Normalized recipe with default values for optional fields.
     * @throws {RecipeValidationError} If any validation constraints are violated.
     */
    parse(recipe: Recipe): NormalizedRecipe;
    /**
     * Non-throwing wrapper for parse(). Returns a validation status object.
     * @param {Object} recipe Raw JSON recipe.
     * @returns {{isValid: boolean, errors: string[]}} Validation metadata.
     */
    validate(recipe: unknown): {
        isValid: boolean;
        errors: string[];
    };
}
