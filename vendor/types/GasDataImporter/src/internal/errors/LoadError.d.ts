/**
 * @fileoverview Error class for data loading/persistence errors (Load phase)
 * @author GasLibraryFactory
 */
import { ImportError } from './ImportError.js';
/**
 * Exception class for failures during the persistence phase, capturing table access errors, conflict resolution violations, and database-level exceptions.
 * @class
 * @extends ImportError
 */
declare class LoadError extends ImportError {
    /**
     * Initializes load exception with diagnostic code and persistence context.
     * @param {string} message Descriptive error explanation.
     * @param {string} [code='LOAD_ERROR'] Unique classification code.
     * @param {Object} [context={}] Metadata detailing the persistence failure (e.g., targetTable, rowCount).
     */
    constructor(message: string, code?: string, context?: Record<string, unknown> | null);
}
export { LoadError };
