/**
 * @file CoreUtilsLib/src/ValidationUtils.js
 * @description Centralized validation utilities for dependency and parameter validation.
 * Eliminates duplicate validation code across all GasLibraryFactory libraries.
 */
/**
 * Centralized utilities for static dependency and parameter validation across libraries.
 * @class
 */
export declare class ValidationUtils {
    /**
     * Required methods for a valid logger interface.
     * @static
     * @type {string[]}
     */
    static get LOGGER_METHODS(): string[];
    /**
     * Validates that a logger object has all required logging methods.
     *
     * A valid logger must be a non-null object with debug, info, warn, and error
     * methods that are all functions.
     *
     * @param {Object} logger - The logger object to validate
     * @param {string} [context='ValidationUtils'] - Context for error messages (class/function name)
     * @returns {boolean} True if validation passes
     * @throws {Error} If logger is missing or invalid
     *
     * @example
     * // In a constructor
     * constructor(logger) {
     *   ValidationUtils.validateLogger(logger, 'MyService');
     *   this._logger = logger;
     * }
     *
     * @example
     * // Throws descriptive error
     * ValidationUtils.validateLogger(null, 'MyService');
     * // Error: 'MyService: logger is required and must be an object'
     *
     * ValidationUtils.validateLogger({ debug: 'not a function' }, 'MyService');
     * // Error: 'MyService: logger.debug must be a function'
     */
    static validateLogger(logger: unknown, context?: string): boolean;
    /**
     * Validates a dependency object, optionally checking for required methods.
     *
     * Validates that a dependency is a non-null object and optionally verifies
     * that it has specific methods that are functions.
     *
     * @param {Object} dependency - The dependency object to validate
     * @param {string} name - The name of the dependency (for error messages)
     * @param {string} [context='ValidationUtils'] - Context for error messages
     * @param {string[]} [requiredMethods=[]] - Array of method names that must exist
     * @param {boolean} [required=true] - If false, allows null/undefined (optional dependency)
     * @returns {boolean} True if validation passes
     * @throws {Error} If validation fails for a required dependency
     *
     * @example
     * // Required dependency with method validation
     * ValidationUtils.validateDependency(utils, 'utils', 'MyService', ['sleep', 'delay']);
     *
     * @example
     * // Optional dependency (won't throw if null)
     * ValidationUtils.validateDependency(cache, 'cache', 'MyService', ['get', 'put'], false);
     *
     * @example
     * // Simple object validation without method checking
     * ValidationUtils.validateDependency(config, 'config', 'MyService');
     */
    static validateDependency(dependency: unknown, name: string, context?: string, requiredMethods?: string[], required?: boolean): boolean;
}
