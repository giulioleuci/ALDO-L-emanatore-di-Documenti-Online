/**
 * @file CoreUtilsLib/src/HashUtils.js
 * @description Hash utility functions for generating consistent string hashes.
 * Provides cryptographic SHA-256 hashing using Google Apps Script's native Utilities.
 * @version 3.0 - Upgraded to SHA-256 for better security and collision resistance
 */
/**
 * Cryptographic utility for deterministic SHA-256 hashing of strings and objects.
 * @class HashUtils
 */
export declare class HashUtils {
    /**
     * Generate a 64-character hexadecimal SHA-256 hash for a UTF-8 string.
     * @param {string} str - Input payload to digest.
     * @returns {string} Lowercase 256-bit hash identifier.
     */
    static generateHash(str: string): string;
    /**
     * Generate a SHA-256 hash for a JSON-serializable object via stringification.
     * @param {Object} obj - Complex payload to digest.
     * @returns {string} Lowercase 256-bit hash identifier.
     * @throws {TypeError} If the object contains circular references.
     */
    static hashObject(obj: unknown): string;
    /**
     * Validate if a string consists exclusively of hexadecimal characters.
     * @param {*} str - Potential hash identifier to test.
     * @returns {boolean} True if the input is a non-empty hexadecimal string.
     */
    static isValidHash(str: unknown): boolean;
}
