/**
 * @file CoreUtilsLib/src/utils/SystemScriptSettings.js
 * @description Object and configuration settings utilities.
 */
export declare class SystemScriptSettings {
    /**
     * Creates a full recursive copy of the provided value using deep cloning logic.
     * @param {*} obj Value to clone.
     * @returns {*} Deeply cloned instance.
     */
    deepClone<T>(obj: T): T;
    /**
     * Deeply merges multiple source objects into a new target object.
     * @param {...Object} objects Source objects for merging.
     * @returns {Object} New consolidated object.
     */
    deepMerge(...objects: object[]): object;
    /**
     * Safely retrieves a value from a nested object structure using a path string.
     * @param {Object} obj Target object to query.
     * @param {string} path Dot-notation or array path to property.
     * @param {*} [defaultValue=null] Value to return if path resolution fails.
     * @returns {*} Resolved property value or default.
     */
    getNestedProperty(obj: unknown, path: string | readonly (string | number)[], defaultValue?: unknown): unknown;
    /**
     * Safely assigns a value to a nested object property, creating intermediate objects if necessary.
     * @param {Object} obj Target object to modify.
     * @param {string} path Dot-notation or array path to property.
     * @param {*} value Value to assign.
     * @returns {Object} The modified root object.
     */
    setNestedProperty<T extends object>(obj: T, path: string | readonly (string | number)[], value: unknown): T;
    /**
     * Checks for the existence of a specific property path within an object.
     * @param {Object} obj Object to query.
     * @param {string|Array} path Property path to verify.
     * @returns {boolean} True if the path exists.
     */
    has(obj: unknown, path: string | readonly (string | number)[]): boolean;
    /**
     * Creates a new object containing only the specified property paths from the source.
     * @param {Object} obj Source object.
     * @param {...(string|string[])} paths Property paths to include.
     * @returns {Object} New object with selected properties.
     */
    pick(obj: unknown, paths: string | readonly string[]): object;
    /**
     * Creates a new object by excluding specified property paths from the source.
     * @param {Object} obj Source object.
     * @param {...(string|string[])} paths Property paths to remove.
     * @returns {Object} New object without specified properties.
     */
    omit(obj: unknown, paths: string | readonly string[]): object;
    /**
     * Generates a new object with keys transformed by the provided iteratee function.
     * @param {Object} obj Source object.
     * @param {Function} iteratee Key transformation logic.
     * @returns {Object} Object with mapped keys.
     */
    mapKeys<T>(obj: Record<string, T> | null | undefined, iteratee: (value: T, key: string, object: Record<string, T>) => unknown): Record<string, T>;
    /**
     * Generates a new object with values transformed by the provided iteratee function.
     * @param {Object} obj Source object.
     * @param {Function} iteratee Value transformation logic.
     * @returns {Object} Object with mapped values.
     */
    mapValues<T, U>(obj: Record<string, T> | null | undefined, iteratee: (value: T, key: string, object: Record<string, T>) => U): Record<string, U>;
}
