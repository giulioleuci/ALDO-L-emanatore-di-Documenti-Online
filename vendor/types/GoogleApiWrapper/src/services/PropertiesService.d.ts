import type { GoogleLogger } from '../internal/core/GoogleService.js';
/**
 * @class PropertiesService
 * @description Facade for Google Apps Script native PropertiesService. Implements type-safe key-value storage with automatic JSON serialization, ISO date revival, and batch I/O optimization. Supports Script, User, and Document scopes.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {Object} _properties Native GAS Properties instance.
 */
export declare class PropertiesService {
    _logger: GoogleLogger;
    _properties: GoogleAppsScript.Properties.Properties;
    _userProperties: GoogleAppsScript.Properties.Properties;
    _documentProperties: GoogleAppsScript.Properties.Properties | null;
    /**
     * @description Initializes PropertiesService with targeted storage scope.
     * @param {LoggerService} logger Diagnostic logger.
     */
    constructor(logger: GoogleLogger, legacyUtils?: object, legacyExceptionService?: object);
    /**
     * @description Accesses per-user persistent storage.
     * @param {string} key Property identifier.
     * @param {string|number|boolean} [value] Data to store.
     * @returns {string|null} Retrieved value (for get).
     * @throws {Error} On storage failure.
     */
    setUserProperty(key: string, value?: string | number | boolean): void;
    getUserProperty(key: string): string | null;
    deleteUserProperty(key: string): void;
    /**
     * @description Accesses document-bound persistent storage.
     * @param {string} key Property identifier.
     * @param {string|number|boolean} [value] Data to store.
     * @returns {string|null} Retrieved value (for get).
     * @throws {Error} On storage failure or if script is not container-bound.
     */
    setDocumentProperty(key: string, value?: string | number | boolean): void;
    getDocumentProperty(key: string): string | null;
    deleteDocumentProperty(key: string): void;
    /**
     * @description Accesses global script persistent storage. Auto-converts input to string.
     * @param {string} key Property identifier.
     * @param {string|number|boolean} [value] Data to store.
     * @returns {string|null} Retrieved value (for get).
     * @throws {Error} On storage failure or size limit violation (9KB).
     */
    setProperty(key: string, value?: string | number | boolean): void;
    getProperty(key: string): string | null;
    /**
     * @description Writes multiple properties in a single GAS API call. Optimized for performance (3-5x faster than sequential set).
     * @param {Object<string, string|number|boolean>} properties Map of key-value pairs.
     * @throws {Error} If total size or individual property limits are exceeded.
     */
    setProperties(properties: Record<string, unknown>): void;
    /**
     * @description Deletes a single script property. Idempotent.
     * @param {string} key Property identifier.
     * @throws {Error} On storage failure.
     */
    deleteProperty(key: string): void;
    /**
     * @description Deletes all script properties in current scope. Irreversible.
     * @returns {number} Count of deleted properties.
     */
    deleteAllProperties(): number;
    /**
     * @description Returns all property keys in current scope.
     * @returns {string[]}
     */
    getKeys(): string[];
    /**
     * @description Returns all key-value pairs in current scope.
     * @returns {Object<string, string>}
     */
    getProperties(): {
        [key: string]: string;
    };
    /**
     * @description Managed JSON storage with automatic ISO date revival.
     * @param {string} key Property identifier.
     * @param {Object} object Entity to serialize.
     * @throws {TypeError} On circular references.
     */
    setObjectProperty(key: string, object: unknown): void;
    /**
     * @description Retrieves deserialized entity with automatic ISO date revival.
     * @param {string} key Property identifier.
     * @returns {Object|null} Deserialized entity with revived Date objects.
     */
    getObjectProperty(key: string): unknown;
    /**
     * @private
     * @description JSON reviver for ISO 8601 string-to-Date conversion.
     * @param {string} key Current property key.
     * @param {*} value Current property value.
     * @returns {Date|*} Revived Date or original value.
     */
    _dateReviver(key: string, value: unknown): unknown;
    /**
     * @description Checks if a property exists in the current scope.
     * @param {string} key Property identifier.
     * @returns {boolean}
     */
    hasProperty(key: string): boolean;
    /**
     * @description Retrieves property value with a fallback if missing.
     * @param {string} key Property identifier.
     * @param {string} defaultValue Fallback value.
     * @returns {string}
     */
    getPropertyOrDefault(key: string, defaultValue: string): string;
    /**
     * @description Updates a property only if it exists.
     * @param {string} key Property identifier.
     * @param {string|number|boolean} value New data.
     * @returns {boolean} True if updated.
     */
    updatePropertyIfExists(key: string, value: string | number | boolean): boolean;
    /**
     * @description Creates a property only if it does not exist.
     * @param {string} key Property identifier.
     * @param {string|number|boolean} value Data to store.
     * @returns {boolean} True if created.
     */
    setPropertyIfNotExists(key: string, value: string | number | boolean): boolean;
    /**
     * @description Retrieves property value as a number.
     * @param {string} key Property identifier.
     * @param {number} [defaultValue=0] Fallback if missing or NaN.
     * @returns {number}
     */
    getNumericProperty(key: string, defaultValue?: number): number;
    /**
     * @description Retrieves property value as a boolean. Maps 'true', '1', 'yes' to true.
     * @param {string} key Property identifier.
     * @param {boolean} [defaultValue=false] Fallback if missing.
     * @returns {boolean}
     */
    getBooleanProperty(key: string, defaultValue?: boolean): boolean;
    /**
     * Static method providing direct access to native GAS script properties.
     * Preserves backward compatibility with code that calls
     * PropertiesService.getScriptProperties() expecting the native GAS API pattern.
     * @returns {Object} Native GAS script properties
     */
    static getScriptProperties(): GoogleAppsScript.Properties.Properties;
    /**
     * Static method providing direct access to native GAS user properties.
     * @returns {Object} Native GAS user properties
     */
    static getUserProperties(): GoogleAppsScript.Properties.Properties;
    /**
     * Static method providing direct access to native GAS document properties.
     * @returns {Object} Native GAS document properties
     */
    static getDocumentProperties(): GoogleAppsScript.Properties.Properties;
}
