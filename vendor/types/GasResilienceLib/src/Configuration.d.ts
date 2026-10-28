import type { ErrorPattern, RecoveryStrategy, ResilienceOverrides } from './types.js';
/**
 * Immutable configuration container for error handling behavior, managing regex patterns, recovery strategies, and safety limits.
 * @class
 */
export declare class ResilienceConfiguration {
    errorPatterns: Record<string, ErrorPattern>;
    recoveryStrategies: Record<string, RecoveryStrategy>;
    limits: Record<string, number>;
    /**
     * Initializes resilience settings with optional overrides, merging with system defaults.
     * @param {Object} [overrides={}] configuration metadata.
     * @param {Object} [overrides.errorPatterns] regex maps for error classification.
     * @param {Object} [overrides.recoveryStrategies] logic definitions for retries and backoffs.
     * @param {Object} [overrides.limits] safety thresholds for resource consumption.
     * @throws {Error} If overrides is not a valid object.
     */
    constructor(overrides?: ResilienceOverrides | null);
    /**
     * Retrieves the comprehensive registry of regex patterns used for diagnostic classification.
     * @returns {Object} Pattern registry.
     */
    getErrorPatterns(): Record<string, ErrorPattern>;
    /**
     * Retrieves the comprehensive map of automated recovery actions keyed by error category.
     * @returns {Object} strategy registry.
     */
    getRecoveryStrategies(): Record<string, RecoveryStrategy>;
    /**
     * Retrieves the set of architectural safety constraints and timeouts.
     * @returns {Object} System limits.
     */
    getLimits(): Record<string, number>;
    /**
     * Resolves a specific error pattern definition by its unique identifier.
     * @param {string} type Pattern key.
     * @returns {Object|undefined} Resolved pattern or undefined.
     */
    getErrorPattern(type: string): ErrorPattern | undefined;
    /**
     * Resolves the recovery logic for a given category, falling back to the DEFAULT strategy if unmapped.
     * @param {string} category error classification.
     * @returns {Object} execution strategy.
     */
    getRecoveryStrategy(category: string): RecoveryStrategy;
    /**
     * Resolves a specific numeric safety threshold by name.
     * @param {string} limitName constraint identifier.
     * @returns {number|undefined} threshold value or undefined.
     */
    getLimit(limitName: string): number | undefined;
    /**
     * Static factory for instantiating a configuration with baseline system settings.
     * @static
     * @returns {ResilienceConfiguration} Default configuration instance.
     */
    static createDefault(): ResilienceConfiguration;
}
