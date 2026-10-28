/**
 * @fileoverview Error class for import configuration validation errors
 * @author GasLibraryFactory
 */
import { ImportError } from './ImportError.js';
/**
 * Exception class for ETL recipe validation failures, capturing structural violations, missing mandatory fields, or invalid strategy identifiers.
 * @class
 * @extends ImportError
 */
declare class ConfigurationError extends ImportError {
    /**
     * Initializes configuration exception with diagnostic code and structural context.
     * @param {string} message Descriptive error explanation.
     * @param {string} [code='CONFIGURATION_ERROR'] Unique classification code.
     * @param {Object} [context={}] Metadata detailing the violation (e.g., field, section, expectedType).
     */
    constructor(message: string, code?: string, context?: Record<string, unknown> | null);
}
export { ConfigurationError };
