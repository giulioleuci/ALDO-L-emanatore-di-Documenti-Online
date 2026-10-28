/**
 * @file CoreUtilsLib/src/utils/IdGenerator.js
 * @description Secure IdGenerator utility module with environment-aware entropy sources.
 * @version 3.1 - Implemented cryptographically secure randomness and rejection sampling.
 */
export declare class IdGenerator {
    /**
     * Generates a standard UUID v4 (randomly-generated) string.
     * Uses native GAS Utilities if available for security.
     * @returns {string} UUID v4 (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).
     */
    generateUuid(): string;
    /**
     * Returns cryptographically secure random bytes (Web-Crypto-style `getRandomValues`),
     * for callers needing raw entropy rather than a formatted ID (tokens, salts, nonces).
     * Uses the same environment-aware chain as {@link IdGenerator._getSecureRandomBytes}:
     * `Utilities.getUuid()` + SHA-256 in GAS, `crypto.getRandomValues` outside it.
     * @param {number} size Number of random bytes to generate.
     * @returns {number[]|Uint8Array} Array of bytes (0-255).
     */
    getRandomValues(size: number): number[] | Uint8Array<ArrayBufferLike>;
    /**
     * Generates a short 8-character alphanumeric random identifier.
     * @returns {string} Random 8-char base-36 string.
     */
    generateShortId(): string;
    /**
     * Generates a compact, collision-resistant random ID with specified length.
     * @param {number} [size=21] Output string length.
     * @returns {string} Random alphanumeric ID string.
     */
    generateCompactId(size?: number): string;
    /**
     * Generates a custom random ID using a secure source if available.
     * Uses rejection sampling to eliminate modulo bias.
     * @param {number} [length=12] Output string length.
     * @param {string} [alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'] Character set.
     * @returns {string} Random ID string.
     */
    generateCustomId(length?: number, alphabet?: string): string;
    /**
     * Static version of custom ID generation for direct access.
     * @param {number} [length=12] Output string length.
     * @param {string} [alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'] Character set.
     * @returns {string} Random ID string.
     */
    static generateCustomId(length?: number, alphabet?: string): string;
    /**
     * Internal secure random byte generator with environment fallbacks.
     * In GAS, it leverages Utilities.getUuid() + SHA-256 for high-entropy seed.
     * @param {number} size Number of bytes to generate.
     * @returns {number[]|Uint8Array} Byte array.
     * @private
     */
    static _getSecureRandomBytes(size: number): number[] | Uint8Array;
}
