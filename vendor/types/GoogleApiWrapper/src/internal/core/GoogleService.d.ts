/**
 * @file GoogleApiWrapper/src/core/MyGoogleService.js
 * @description Abstract base class for all Google service wrappers.
 * Provides common functionality for caching, service verification, and dependency injection.
 * @version 2.0 - Translated from Italian and refactored with ExceptionService support.
 */
/**
 * @class GoogleService
 * @abstract
 * @description Abstract foundation for Google Apps Script service wrappers. Implements standardized dependency injection (DI), multi-level caching strategies, and resilient execution patterns via GasResilienceLib.
 *
 * @property {LoggerService} _logger Diagnostic logging provider.
 * @property {Cache} _cache State persistence provider (get/put/remove).
 * @property {UtilsService} _utils Foundational utility provider.
 * @property {ExceptionService} _exceptionService Resiliency and retry logic provider.
 */
export interface GoogleLogger {
    debug(message: string, ...context: unknown[]): unknown;
    info(message: string, ...context: unknown[]): unknown;
    warn(message: string, ...context: unknown[]): unknown;
    error(message: string, ...context: unknown[]): unknown;
}
export interface GoogleCache {
    get(key: string): unknown;
    put(key: string, value: unknown, expirationSeconds?: number): unknown;
    remove(key: string): unknown;
}
export interface GoogleRetryExecutor {
    executeWithRetry<T>(func: () => T, parameters?: object, maxAttempts?: number): T;
}
export declare class GoogleService<Utils extends object = object> {
    _logger: GoogleLogger;
    _cache: GoogleCache;
    _utils: Utils;
    _exceptionService: GoogleRetryExecutor;
    /**
     * @protected
     * @description Initializes service with validated dependencies. Enforces abstract class restriction.
     *
     * @param {LoggerService} logger Diagnostic logger (required methods: debug, info, warn, error).
     * @param {Cache} cache GAS Cache service (required methods: get, put, remove).
     * @param {UtilsService} utils Foundational utilities.
     * @param {ExceptionService} exceptionService Resiliency provider (required methods: executeWithRetry).
     *
     * @throws {TypeError} If instantiated directly as GoogleService.
     * @throws {Error} If any dependency is null, undefined, or missing required methods.
     */
    constructor(logger: GoogleLogger, cache: GoogleCache, utils: Utils, exceptionService: GoogleRetryExecutor);
    /**
     * @protected
     * @description Verifies availability of advanced Google service.
     * @param {string} serviceName Service object name (e.g., 'Drive').
     * @returns {boolean} True if service exists in globalThis.
     */
    _verifyAdvancedService(serviceName: string): boolean;
    /**
     * @protected
     * @description Generates standardized cache key: `{prefix}_{id}_{method}`.
     * @param {string} prefix Logic domain prefix.
     * @param {string} id Resource identifier.
     * @param {string} method Operation name.
     * @returns {string} Formatted cache key.
     */
    _generateCacheKey(prefix: unknown, id: unknown, method: unknown): string;
    /**
     * @protected
     * @description Implements Get-or-Execute caching pattern.
     * @param {string} key Cache key.
     * @param {Function} func Execution logic for cache misses.
     * @param {number} [expirationSeconds=600] TTL in seconds.
     * @param {boolean} [useCache=true] Enable/disable cache lookups.
     * @returns {*} Cached or computed result.
     */
    _getOrExecute(key: string, func: () => unknown, expirationSeconds?: number, useCache?: boolean): unknown;
    /**
     * @protected
     * @description Purges specific key from cache.
     * @param {string} key Target cache key.
     */
    _invalidateCache(key: string): void;
    /**
     * @protected
     * @description Executes function with resilient retry logic via exceptionService.
     * @param {Function} func Logic to execute.
     * @param {Object} [context={}] Metadata for error classification.
     * @param {number} [maxAttempts=3] Maximum execution attempts.
     * @returns {*} Function execution result.
     * @throws {Error} Propagates classified exceptions from exceptionService.
     */
    _executeWithRetry<T, Context extends object>(func: (context: Context) => T, context: Context, maxAttempts?: number): T;
    _executeWithRetry<T>(func: () => T, context?: object, maxAttempts?: number): T;
}
