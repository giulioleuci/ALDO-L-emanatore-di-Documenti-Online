import type { ContextLogger, ContextRecord } from './contracts.js';
/**
 * Dependency resolution engine for @param (initial) and $provider (runtime) references in recipes.
 * Supports dot-notation for nested properties and bracket-notation for array indices.
 * @class
 */
export declare class DependencyResolver {
    _logger: ContextLogger;
    /**
     * Pattern for @param references (e.g., '@userId').
     * @type {RegExp}
     * @static
     * @private
     */
    static get PARAM_PATTERN(): RegExp;
    /**
     * Pattern for $provider references (e.g., '$user.profile.name', '$items[0].id').
     * @type {RegExp}
     * @static
     * @private
     */
    static get PROVIDER_PATTERN(): RegExp;
    /**
     * Initializes the resolver with a required logger service.
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
     * Validates if a string value matches @param or $provider syntax.
     * @param {*} value Target value to inspect.
     * @returns {boolean} True if string matches dependency patterns.
     */
    isDependency(value: unknown): value is string;
    /**
     * Traverses a nested object/array structure based on dot-separated path.
     * @param {Object|Array} obj Source container.
     * @param {string} path Property path (e.g., 'items[0].id').
     * @returns {*} Resolved value or undefined if path is unreachable.
     * @private
     */
    _getNestedProperty(obj: unknown, path: string): unknown;
    /**
     * Resolves a single dependency reference against initial parameters and runtime provider results.
     * @param {string} dependency Dependency reference string.
     * @param {Object} initialParams Map of @param identifiers to values.
     * @param {Object} providerResults Map of $provider identifiers to output payloads.
     * @param {string} [providerName=''] Contextual name of the dependent provider for error reporting.
     * @returns {*} Resolved payload.
     * @throws {Error} If inputs are invalid.
     * @throws {DependencyResolutionError} If reference cannot be satisfied or path is invalid.
     */
    resolve(dependency: string, initialParams: object | null, providerResults: object, providerName?: string): unknown;
    /**
     * Recursively resolves all dependency references within a complex object or array.
     * @param {Object|Array} parameters Source structure containing potential references.
     * @param {Object} initialParams Map of @param identifiers.
     * @param {Object} providerResults Map of $provider identifiers.
     * @param {string} [providerName=''] Contextual name for error reporting.
     * @returns {Object|Array} Cloned structure with all satisfied dependencies.
     * @throws {Error} If inputs are invalid.
     * @throws {DependencyResolutionError} If any reference resolution fails.
     */
    resolveAll(parameters: object, initialParams: object | null, providerResults: object, providerName?: string): ContextRecord;
    /**
     * Analyzes a parameters structure to extract unique dependency identifiers.
     * @param {Object|Array} parameters Structure to analyze.
     * @returns {Object} Metadata including paramDependencies (names), providerDependencies (names), and total count.
     */
    analyzeDependencies(parameters: object): {
        paramDependencies: string[];
        providerDependencies: string[];
        totalDependencies: number;
    };
}
