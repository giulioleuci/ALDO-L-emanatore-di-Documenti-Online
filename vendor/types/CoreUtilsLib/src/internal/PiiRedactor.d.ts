/**
 * @file CoreUtilsLib/src/PiiRedactor.js
 * @description Utility for redacting Personally Identifiable Information (PII) from strings.
 * Provides comprehensive redaction for common PII patterns in error messages and logs.
 * @version 1.0.0
 */
/**
 * Static utility for detecting and masking Personally Identifiable Information (PII) using regex patterns.
 * @class PiiRedactor
 */
export declare class PiiRedactor {
    /**
     * Default masking labels for recognized PII categories.
     * @static
     * @type {Object<string, string>}
     */
    static get REDACTION_LABELS(): {
        EMAIL: string;
        TOKEN: string;
        API_KEY: string;
        URL_PARAMS: string;
        JWT: string;
        CREDIT_CARD: string;
        PHONE: string;
        SESSION_ID: string;
    };
    /**
     * Collection of regular expressions for PII detection.
     * @static
     * @type {Object<string, RegExp>}
     */
    static get PATTERNS(): {
        EMAIL: RegExp;
        TOKEN: RegExp;
        API_KEY: RegExp;
        URL_PARAMS: RegExp;
        JWT: RegExp;
        CREDIT_CARD: RegExp;
        PHONE: RegExp;
        SESSION_ID: RegExp;
    };
    /**
     * Mask all recognized PII patterns within a text string.
     * @param {string} message - Input text to sanitize.
     * @returns {string} Sanitized string with masked placeholders.
     */
    static redact(message: unknown): string;
}
