import type { ContextLogger } from './internal/contracts.js';
/**
 * Abstract base class for data providers, providing standardized interfaces for fetching, caching, and performance tracking.
 * @class
 * @abstract
 */
export declare class DataProvider<Parameters extends object = Record<string, unknown>, Result = unknown> {
    _logger: ContextLogger;
    _cacheable: boolean;
    _cacheDurationMs: number;
    _cache: Map<string, {
        data: Result;
        timestamp: number;
    }>;
    /**
     * Initializes the provider with required logger and optional caching configuration.
     * @param {Object} logger Logger service with debug, info, warn, error methods.
     * @param {Object} [options={}] Provider configuration.
     * @param {boolean} [options.cacheable=false] Enables in-memory result caching.
     * @param {number} [options.cacheDurationMs=300000] Cache TTL in milliseconds (default: 5 minutes).
     * @throws {Error} If logger is missing or lacks required interface methods.
     * @throws {Error} If options is provided but is not an object.
     */
    constructor(logger: ContextLogger, options?: {
        cacheable?: boolean;
        cacheDurationMs?: number;
    });
    /**
     * Internal logger instance.
     * @type {Object}
     * @readonly
     */
    get logger(): import("../../PipelineFramework/index.js").PipelineLogger;
    /**
     * Core data fetching logic. Must be implemented by subclasses.
     * @param {Object} parameters Validated parameters for the fetch operation.
     * @returns {*} Fetched data payload.
     * @throws {Error} If not implemented by subclass or fetch fails.
     * @protected
     * @abstract
     */
    _fetchData(_parameters: Parameters): Result;
    /**
     * Generates a unique, stable cache key from input parameters.
     * @param {Object} parameters Input parameters.
     * @returns {string} Pipe-delimited key string.
     * @private
     */
    _generateCacheKey(parameters: Parameters): string;
    /**
     * Retrieves non-expired data from the internal cache.
     * @param {string} cacheKey Target cache key.
     * @returns {*|null} Cached data or null if missing/expired.
     * @private
     */
    _getFromCache(cacheKey: string): Result | null;
    /**
     * Stores data in the internal cache with current timestamp.
     * @param {string} cacheKey Target cache key.
     * @param {*} data Data payload to cache.
     * @private
     */
    _storeInCache(cacheKey: string, data: Result): void;
    /**
     * Purges all entries from the internal in-memory cache.
     * @returns {DataProvider} Fluent interface for chaining.
     */
    clearCache(): this;
    /**
     * Orchestrates the data providing process including validation, caching, performance tracking, and error wrapping.
     * @param {string} providerName Identifier for the provider (used in logging/errors).
     * @param {Object} parameters Parameters for the data fetch.
     * @returns {*} Fetched or cached data payload.
     * @throws {Error} If providerName or parameters are invalid.
     * @throws {ProviderExecutionError} If underlying fetch or validation fails.
     */
    provide(providerName: string, parameters: Parameters): Result;
    /**
     * Hooks for subclass-specific parameter validation. Executed before _fetchData().
     * @param {Object} parameters Parameters to validate.
     * @throws {Error} If validation constraints are violated.
     * @protected
     */
    _validateParameters(_parameters: Parameters): void;
}
