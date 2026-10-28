import type { GoogleLogger } from '../internal/core/GoogleService.js';
type UtilitiesLogger = Pick<GoogleLogger, 'error' | 'debug'>;
/**
 * @file GoogleApiWrapper/src/services/UtilitiesService.js
 * @description Facade for Google Apps Script's Utilities API.
 * Provides a consistent interface for utility functions with error handling and logging.
 */
/**
 * @class UtilitiesService
 * @description Lightweight facade for Google Apps Script native Utilities. Provides stateless infrastructure for encoding, timing, formatting, compression, and cryptography with consistent error handling.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {ExceptionService} _exceptionService Resiliency provider.
 */
export declare class UtilitiesService {
    _logger: UtilitiesLogger;
    _exceptionService: unknown;
    /**
     * @description Initializes UtilitiesService with optional diagnostic and resiliency providers.
     * @param {LoggerService} [logger=console] Diagnostic logger.
     * @param {ExceptionService} [exceptionService=null] Resiliency provider.
     */
    constructor(logger?: UtilitiesLogger | null, exceptionService?: unknown);
    /**
     * @description Blocks execution for a specified duration.
     * @param {number} milliseconds Pause duration.
     */
    sleep(milliseconds: number): void;
    /**
     * @description Generates a RFC 4122 compliant version 4 UUID.
     * @returns {string}
     */
    getUuid(): string;
    /**
     * @description Encodes data to Base64. Supports strings and Blobs.
     * @param {string|Blob} data Input data.
     * @param {string} [charset] Character set for string input.
     * @returns {string}
     */
    base64Encode(data: string | GoogleAppsScript.Byte[], charset?: GoogleAppsScript.Utilities.Charset | string): string;
    /**
     * @description Decodes Base64 encoded strings.
     * @param {string} encoded Base64 input.
     * @returns {Blob} Decoded data.
     */
    base64Decode(encoded: string): number[];
    /**
     * @description Encodes data to web-safe Base64 (RFC 4648).
     * @param {string|Blob} data Input data.
     * @param {string} [charset] Character set for string input.
     * @returns {string}
     */
    base64EncodeWebSafe(data: string | GoogleAppsScript.Byte[], charset?: GoogleAppsScript.Utilities.Charset | string): string;
    /**
     * @description Decodes web-safe Base64 encoded strings.
     * @param {string} encoded Web-safe Base64 input.
     * @returns {Blob} Decoded data.
     */
    base64DecodeWebSafe(encoded: string): number[];
    /**
     * @description Formats a template string using sprintf-style placeholders (%s, %d).
     * @param {string} template Format pattern.
     * @param {...*} args Substitution values.
     * @returns {string}
     */
    formatString(template: string, ...args: unknown[]): string;
    /**
     * @description Generates a formatted date string for a specific timezone.
     * @param {Date} date Source date.
     * @param {string} timeZone IANA timezone (e.g., 'GMT').
     * @param {string} format Java simple date format pattern.
     * @returns {string}
     */
    formatDateNative(date: Date, timeZone: string, format: string): string;
    /**
     * @description Parses RFC 4180 compliant CSV strings into 2D arrays.
     * @param {string} csv Raw CSV content.
     * @param {string} [delimiter=','] Field separator.
     * @returns {string[][]}
     */
    parseCsv(csv: string, delimiter?: string): string[][];
    /**
     * @description Initializes a new GAS Blob resource.
     * @param {string|number[]} data Raw content.
     * @param {string} [contentType='text/plain'] MIME type.
     * @param {string} [name='blob'] Resource identifier.
     * @returns {Blob}
     */
    newBlob(data: string | GoogleAppsScript.Byte[], contentType?: string, name?: string): GoogleAppsScript.Base.Blob;
    /**
     * @description Compresses a Blob via GZIP.
     * @param {Blob} blob Source resource.
     * @returns {Blob} GZIP compressed resource.
     */
    gzip(blob: GoogleAppsScript.Base.BlobSource): GoogleAppsScript.Base.Blob;
    /**
     * @description Decompresses a GZIP-encoded Blob.
     * @param {Blob} blob Compressed resource.
     * @returns {Blob}
     */
    ungzip(blob: GoogleAppsScript.Base.BlobSource): GoogleAppsScript.Base.Blob;
    /**
     * @description Packages multiple Blobs into a ZIP archive.
     * @param {Blob[]} blobs Collection of resources to archive.
     * @param {string} [name='archive.zip'] Archive filename.
     * @returns {Blob} ZIP compressed resource.
     */
    zip(blobs: GoogleAppsScript.Base.BlobSource[], name?: string): GoogleAppsScript.Base.Blob;
    /**
     * @description Extracts components from a ZIP-encoded Blob.
     * @param {Blob} blob ZIP archive resource.
     * @returns {Blob[]} Collection of extracted resources.
     */
    unzip(blob: GoogleAppsScript.Base.BlobSource): GoogleAppsScript.Base.Blob[];
    /**
     * @description Generates a cryptographic hash digest.
     * @param {string} algorithm Target algorithm (MD5, SHA_1, SHA_256, SHA_384, SHA_512).
     * @param {string|Blob} value Input content.
     * @param {string} [charset='UTF_8'] Encoding for string input.
     * @returns {number[]} Byte array digest.
     */
    computeDigest(algorithm: string, value: string, charset?: string): number[];
    /**
     * @description Generates a Hash-based Message Authentication Code (HMAC).
     * @param {string} algorithm Target algorithm (HMAC_MD5, HMAC_SHA_1, HMAC_SHA_256, HMAC_SHA_384, HMAC_SHA_512).
     * @param {string|Blob} value Message to sign.
     * @param {string|Blob} key Secret key.
     * @param {string} [charset='UTF_8'] Encoding for string input.
     * @returns {number[]} Byte array signature.
     */
    computeHmacSignature(algorithm: string, value: string, key: string, charset?: string): number[];
    /**
     * @description Serializes an entity to a JSON string via native Utilities.
     * @param {*} obj Target entity.
     * @param {boolean} [prettyPrint=false] Enable 2-space indentation.
     * @returns {string}
     */
    jsonStringify(obj: unknown, prettyPrint?: boolean): string;
    /**
     * @description Deserializes a JSON string via native Utilities.
     * @param {string} json Raw JSON content.
     * @returns {*}
     */
    jsonParse(json: string): any;
}
export {};
