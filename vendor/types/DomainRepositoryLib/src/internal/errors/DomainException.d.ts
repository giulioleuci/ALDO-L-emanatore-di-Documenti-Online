import { BaseError } from '@CoreUtilsLib';
/**
 * Foundational exception class for domain-layer errors, providing contextual metadata and serialization support.
 * Extends the shared {@link BaseError} to inherit standardized stack-trace capture and timestamping.
 *
 * Note: this class uses `context` as a short architectural label (a string) rather than the
 * structured-metadata object used by {@link BaseError}; it is reassigned explicitly below to
 * preserve that public contract.
 * @class
 * @extends BaseError
 */
export declare class DomainException extends BaseError<string | Record<string, unknown> | undefined> {
    details: Record<string, unknown>;
    /**
     * Initializes domain exception with contextual diagnostics and stack trace preservation.
     * @param {string} message Descriptive error message.
     * @param {string} [context] Architectural context (e.g., 'Validation', 'Repository').
     * @param {Object} [details={}] Auxiliary diagnostic metadata.
     */
    constructor(message: string, context?: string | Record<string, unknown>, details?: Record<string, unknown>);
    /**
     * Retrieves the auxiliary diagnostic metadata associated with the exception.
     * @returns {Object} Metadata record.
     */
    getDetails(): Record<string, unknown>;
    /**
     * Serializes the exception into a plain object suitable for logging or external transmission.
     * @returns {{name:string, message:string, context:string, details:Object, stack:string}} Serialized error state.
     */
    toObject(): {
        name: string;
        message: string;
        context: string | Record<string, unknown> | undefined;
        details: Record<string, unknown>;
        stack: string | undefined;
    };
}
