/**
 * @file CoreUtilsLib/src/RegexUtils.js
 * @description Regular expression utilities for safe regex handling and escaping.
 * Provides ReDoS (Regular Expression Denial of Service) protection and regex escaping.
 * @version 1.0
 */
/**
 * Static security utility for safe regular expression handling and ReDoS prevention.
 * @class RegexUtils
 */
export declare class RegexUtils {
    /**
     * Escape special characters in a string for literal matching within a regular expression.
     * @param {string} str - Text to escape.
     * @returns {string} Sanitized string safe for literal RegExp inclusion.
     */
    static escape(str: string): string;
    /**
     * Validate a regex pattern for potential catastrophic backtracking or ReDoS vulnerabilities.
     * @param {string} pattern - Regex structure to test.
     * @param {Object} [logger=null] - Optional diagnostic reporter.
     * @throws {Error} If the pattern violates complexity or safety constraints.
     */
    static validateSafety(pattern: string, logger?: {
        warn?: (message: string) => void;
    } | null): void;
    /**
     * Initialize a validated RegExp instance, enforcing ReDoS protection.
     * @param {string} pattern - Regex structure to test and instantiate.
     * @param {string} [flags=''] - Standard RegExp control flags.
     * @param {Object} [logger=null] - Optional diagnostic reporter.
     * @returns {RegExp} Validated regular expression object.
     * @throws {Error} If the pattern is unsafe or syntactically invalid.
     */
    static createSafeRegex(pattern: string, flags?: string, logger?: {
        warn?: (message: string) => void;
    } | null): RegExp;
}
