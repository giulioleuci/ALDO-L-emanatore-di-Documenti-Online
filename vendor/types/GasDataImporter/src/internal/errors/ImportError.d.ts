/**
 * @fileoverview Base error class for GasDataImporter library
 * @author GasLibraryFactory
 */
import { BaseError } from '@CoreUtilsLib';
/**
 * Foundational error class for the ETL pipeline, providing structured diagnostic state including classification codes, contextual metadata, and occurrence timestamps.
 * Extends the shared {@link BaseError} to inherit standardized stack-trace capture and timestamping.
 * @class
 * @extends BaseError
 */
declare class ImportError extends BaseError {
    code: string;
    /**
     * Initializes import error with diagnostic classification and contextual metadata.
     * @param {string} message Descriptive error explanation.
     * @param {string} [code='IMPORT_ERROR'] Unique classification identifier.
     * @param {Object} [context={}] Metadata detailing the failure environment.
     */
    constructor(message: string, code?: string, context?: Record<string, unknown> | null);
    /**
     * Serializes the structured error state into a plain object for logging or diagnostic transmission.
     * @returns {Object} Serialized error state.
     */
    toJSON(): {
        name: string;
        message: string;
        code: string;
        context: import("@CoreUtilsLib").ErrorContext | null;
        timestamp: string;
        stack: string | undefined;
    };
    /**
     * Generates a readable summary of the error including classification and description.
     * @returns {string} Formatted error string ([name] CODE: message).
     */
    toString(): string;
}
export { ImportError };
