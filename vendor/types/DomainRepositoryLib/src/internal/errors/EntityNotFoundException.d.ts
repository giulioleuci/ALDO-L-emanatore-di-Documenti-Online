import { DomainException } from './DomainException.js';
/**
 * Exception class for failed entity resolution by identifier or search specification.
 * @class
 * @extends DomainException
 */
export declare class EntityNotFoundException extends DomainException {
    entityType: string;
    criteria: unknown;
    entityId: string | undefined;
    /**
     * Initializes exception with target entity classification and failed resolution criteria.
     * @param {string} entityType Domain entity classification.
     * @param {string|Object} criteria Identifier or specification used for the failed search.
     * @param {Object} [details={}] Auxiliary diagnostic metadata.
     */
    constructor(entityType: string, criteria: unknown, details?: Record<string, unknown>);
    /**
     * Returns the domain classification of the entity that failed resolution.
     * @returns {string} Entity type name.
     */
    getEntityType(): string;
    /**
     * Retrieves the failed resolution parameters (ID or search object).
     * @returns {string|Object} Resolution criteria.
     */
    getCriteria(): unknown;
}
