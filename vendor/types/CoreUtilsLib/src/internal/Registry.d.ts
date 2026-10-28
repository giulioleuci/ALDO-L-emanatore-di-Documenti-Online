/**
 * @file CoreUtilsLib/src/internal/Registry.js
 * @description Generic Map-backed registry primitive shared across libraries.
 *
 * Centralizes the `register/get/has/unregister/clear/keys/size` storage plumbing
 * that was previously re-implemented in every per-library registry (F-1.5).
 * Libraries with bespoke validation, error types, or dual-store (singleton +
 * factory) semantics compose an instance of this class for storage while keeping
 * their own public API, messages, and behavior.
 * @version 1.0.0
 */
/**
 * Generic key/value registry backed by a Map.
 *
 * @class Registry
 * @template T
 */
export interface RegistryOptions<K extends string = string, V = unknown> {
    logger?: {
        debug?: (message: string) => unknown;
    } | null;
    entityName?: string;
    validateValue?: ((value: V, key: K) => void) | null;
}
export declare class Registry<K extends string = string, V = unknown> {
    _store: Map<K, V>;
    _logger: RegistryOptions<K, V>['logger'];
    _entityName: string;
    _validateValue: RegistryOptions<K, V>['validateValue'];
    /**
     * @param {Object} [options={}] Registry configuration.
     * @param {Object|null} [options.logger=null] Optional logger (debug used for registration traces).
     * @param {string} [options.entityName='entry'] Noun used in default error/log messages.
     * @param {Function|null} [options.validateValue=null] Optional `(value, key) => void` hook that
     *   throws when a value is invalid.
     */
    constructor({ logger, entityName, validateValue }?: RegistryOptions<K, V>);
    /**
     * Registers a value under a key, running the optional value validator.
     * @param {string} key Non-empty string key.
     * @param {T} value Value to store.
     * @param {Object} [options={}] Registration options.
     * @param {boolean} [options.overwrite=true] When false, throws if the key already exists.
     * @returns {boolean} True if an existing entry was overwritten.
     * @throws {Error} If key is not a non-empty string, value is invalid, or a
     *   non-overwriting collision occurs.
     */
    register(key: K, value: V, { overwrite }?: {
        overwrite?: boolean | undefined;
    }): boolean;
    /**
     * Stores a value without validation or logging (low-level storage primitive).
     * @param {string} key Key.
     * @param {T} value Value.
     * @returns {boolean} True if an existing entry was overwritten.
     */
    set(key: K, value: V): boolean;
    /**
     * @param {string} key Key.
     * @returns {T|undefined} Stored value, or undefined if absent.
     */
    get(key: K): V | undefined;
    /**
     * @param {string} key Key.
     * @returns {boolean} True if a value is registered for the key.
     */
    has(key: K): boolean;
    /**
     * Removes the value for a key.
     * @param {string} key Key.
     * @returns {boolean} True if an entry existed and was removed.
     */
    unregister(key: K): boolean;
    /**
     * Removes all entries.
     * @returns {void}
     */
    clear(): void;
    /**
     * @returns {string[]} Snapshot array of all registered keys.
     */
    keys(): K[];
    /**
     * @returns {T[]} Snapshot array of all registered values.
     */
    values(): V[];
    /**
     * @returns {Array<[string, T]>} Snapshot array of [key, value] entries.
     */
    entries(): [K, V][];
    /**
     * @returns {number} Number of registered entries.
     */
    get size(): number;
}
