import type { GoogleLogger } from '../internal/core/GoogleService.js';
type CacheLogger = Pick<GoogleLogger, 'error' | 'warn' | 'debug'>;
/**
 * @class CacheService
 * @description Facade for Google Apps Script native CacheService. Provides unified access to Script, User, and Document cache scopes with consistent error handling, automatic serialization, and TTL enforcement.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {ExceptionService} _exceptionService Resiliency provider.
 */
export declare class CacheService {
    _logger: CacheLogger;
    _exceptionService: unknown;
    /**
     * @description Initializes CacheService with optional logging and resiliency providers.
     * @param {LoggerService} [logger=console] Diagnostic logger.
     * @param {ExceptionService} [exceptionService=null] Resiliency and retry logic provider.
     */
    constructor(logger?: CacheLogger | null, exceptionService?: unknown);
    /**
     * @description Returns a Cache wrapper for the GAS Script Cache (global scope).
     * @returns {Cache} Script cache wrapper.
     * @throws {Error} If native CacheService is unavailable.
     */
    getScriptCache(): Cache<GoogleAppsScript.Cache.Cache>;
    /**
     * @description Returns a Cache wrapper for the GAS User Cache (per-user scope).
     * @returns {Cache} User cache wrapper.
     * @throws {Error} If native CacheService is unavailable.
     */
    getUserCache(): Cache<GoogleAppsScript.Cache.Cache>;
    /**
     * @description Returns a Cache wrapper for the GAS Document Cache (per-document scope).
     * @returns {Cache} Document cache wrapper.
     * @throws {Error} If native CacheService is unavailable or if called from a standalone script.
     */
    getDocumentCache(): Cache<GoogleAppsScript.Cache.Cache | null>;
    /**
     * @static
     * @description Native GAS Script Cache accessor (backward compatibility).
     * @returns {Object} Native GAS script cache.
     */
    static getScriptCache(): GoogleAppsScript.Cache.Cache;
    /**
     * @static
     * @description Native GAS User Cache accessor.
     * @returns {Object} Native GAS user cache.
     */
    static getUserCache(): GoogleAppsScript.Cache.Cache;
    /**
     * @static
     * @description Native GAS Document Cache accessor.
     * @returns {Object} Native GAS document cache.
     */
    static getDocumentCache(): GoogleAppsScript.Cache.Cache | null;
}
/**
 * @class Cache
 * @description Wrapper for Google Apps Script Cache instances. Extends native functionality with automatic string conversion, TTL enforcement (max 6h), and diagnostic logging.
 *
 * @property {Object} _cache Native GAS Cache instance.
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {string} _type Cache scope identifier ('script', 'user', 'document').
 */
export declare class Cache<Backend extends Partial<GoogleAppsScript.Cache.Cache> | null = GoogleAppsScript.Cache.Cache> {
    _cache: Backend;
    _logger: CacheLogger;
    _type: string;
    /**
     * @description Initializes Cache wrapper for a native GAS cache object.
     * @param {Object} gasCache Native GAS Cache instance.
     * @param {LoggerService} logger Diagnostic logger.
     * @param {string} type Cache scope identifier ('script', 'user', 'document').
     */
    constructor(gasCache: Backend, logger: CacheLogger, type: string);
    /**
     * @description Retrieves value from cache.
     * @param {string} key Cache key.
     * @returns {string|null} Cached value or null on miss/error.
     */
    get(key: string): string | null;
    /**
     * @description Retrieves multiple values in a single batch operation.
     * @param {string[]} keys Array of cache keys.
     * @returns {Object<string, string|null>} Map of keys to cached values (null if missing).
     */
    getAll(keys: string[]): {
        [key: string]: any;
    };
    /**
     * @description Stores value in cache with automatic string conversion and TTL capping.
     * @param {string} key Cache key.
     * @param {*} value Value to cache (auto-converted to string).
     * @param {number} [expirationInSeconds=600] TTL in seconds (max 21,600).
     * @throws {Error} If caching operation fails.
     */
    put(key: string, value: unknown, expirationInSeconds?: number): void;
    /**
     * @description Stores multiple key-value pairs in a single batch operation.
     * @param {Object<string, *>} values Map of keys to values.
     * @param {number} [expirationInSeconds=600] TTL in seconds (max 21,600).
     * @throws {Error} If batch caching operation fails.
     */
    putAll(values: Record<string, unknown>, expirationInSeconds?: number): void;
    /**
     * @description Deletes specific key from cache.
     * @param {string} key Target cache key.
     * @throws {Error} If removal operation fails.
     */
    remove(key: string): void;
    /**
     * @description Deletes multiple keys in a single batch operation.
     * @param {string[]} keys Array of keys to remove.
     * @throws {Error} If batch removal fails.
     */
    removeAll(keys?: string[] | null): void;
    /**
     * @description Returns the underlying native GAS Cache instance. Bypasses wrapper logic (logging, auto-string, TTL capping).
     * @returns {GoogleAppsScript.Cache.Cache} Native GAS cache object.
     */
    unwrap(): Backend;
}
export {};
