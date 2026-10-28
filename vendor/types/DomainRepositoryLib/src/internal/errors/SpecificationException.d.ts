import { DomainException } from './DomainException.js';
/**
 * Exception class for failures during specification evaluation or translation to persistent queries.
 * @class
 * @extends DomainException
 */
export declare class SpecificationException extends DomainException {
    specificationType: string | undefined;
    /**
     * Initializes exception with failure details and the target specification classification.
     * @param {string} message Descriptive error message.
     * @param {string} [specificationType] Classification of the failed specification.
     * @param {Object} [details={}] Auxiliary diagnostic metadata.
     */
    constructor(message: string, specificationType?: string, details?: Record<string, unknown>);
    /**
     * Returns the classification of the specification that caused the evaluation failure.
     * @returns {string|undefined} Specification type identifier.
     */
    getSpecificationType(): string | undefined;
}
