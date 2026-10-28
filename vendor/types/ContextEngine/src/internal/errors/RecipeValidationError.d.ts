/**
 * @file ContextEngine/src/errors/RecipeValidationError.js
 * @description Error thrown when recipe validation fails.
 * @version 1.0.0
 *
 * @overview
 * Thrown by RecipeParser.validate() when a recipe fails structural validation.
 * This error indicates issues with recipe configuration before execution begins.
 *
 * ## When This Error Occurs
 * - **Missing Required Fields**: Recipe missing `providers` array
 * - **Invalid Provider Structure**: Provider missing `name` or `type`
 * - **Invalid Types**: Wrong data types (e.g., string instead of array)
 * - **Duplicate Provider Names**: Multiple providers with same name
 * - **Invalid Post-Processors**: Post-processor type not recognized
 * - **Invalid Conditions**: Malformed conditional expressions
 *
 * ## Common Validation Failures
 * 1. Missing `providers` array in recipe
 * 2. Provider missing required `name` field
 * 3. Provider missing required `type` field
 * 4. Provider `name` not a string
 * 5. Provider `type` not a string
 * 6. Provider `config` not an object
 * 7. Duplicate provider names in recipe
 * 8. Post-processor missing `type` field
 * 9. Post-processor `config` not an object
 *
 * ## Error Handling
 * - **Not Retryable**: Validation errors require recipe correction, not retry
 * - **Fail Fast**: Thrown before any provider execution
 * - **Multiple Errors**: `validationErrors` array contains all issues found
 * - **UI/API Integration**: Use validation errors to show user-friendly messages
 *
 * ## Prevention
 * - Validate recipes before deployment
 * - Use RecipeParser.validate() in tests
 * - Check recipe structure in UI/API before submission
 */
import { ContextEngineError } from './ContextEngineError.js';
/**
 * Error signaling structural or configuration non-compliance in a Context Recipe.
 *
 * @class RecipeValidationError
 * @extends ContextEngineError
 *
 * @description
 * Thrown by RecipeParser.validate() or parse() during pre-execution checks. Aggregates
 * multiple validation failures (missing fields, duplicate names, invalid types) into
 * the validationErrors property to enable comprehensive error reporting.
 *
 * @example
 * throw new RecipeValidationError('Invalid Recipe', { validationErrors: ['providers is required'] });
 */
export declare class RecipeValidationError extends ContextEngineError {
    validationErrors: string[];
    /**
     * Initialize a RecipeValidationError with validation metadata.
     *
     * @param {string} message - High-level summary of the validation failure.
     * @param {Object} [context={}] - Diagnostic context.
     * @param {string[]} [context.validationErrors] - Collection of specific structural violations.
     * @param {Object} [context.recipe] - The raw recipe object that failed validation.
     * @param {string} [context.recipeName] - Identifier of the failing recipe.
     */
    constructor(message: string, context?: Record<string, unknown> & {
        validationErrors?: string[];
    });
}
