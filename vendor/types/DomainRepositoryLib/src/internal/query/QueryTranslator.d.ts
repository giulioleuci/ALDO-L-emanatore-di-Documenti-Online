import type { DomainLogger, DomainQuery, DomainRecord, QueryAnalysis, QuerySpecification } from '../contracts.js';
/**
 * Bridge for converting domain Specifications into SheetDBLib AdvancedQueryBuilder instructions.
 * @class
 */
export declare class QueryTranslator {
    logger: DomainLogger;
    /**
     * Initializes translator with optional diagnostic logging.
     * @param {Object|null} [logger=null] Optional diagnostic logger.
     */
    constructor(logger?: DomainLogger | null);
    /**
     * Applies domain specification filters to a database query builder.
     * @param {Object} specification domain filter criteria.
     * @param {Object} queryBuilder database query constructor.
     * @param {{valid:boolean, reason:string|null, queryObjectCriteria:Record<string, unknown>|null}|null} [validation=null] Optional analysis already produced for this operation.
     * @returns {Object} The configured query builder.
     * @throws {SpecificationException} If specification is null, queryBuilder is missing, or translation is unsupported.
     */
    translate<Q extends DomainQuery>(specification: QuerySpecification | null | undefined, queryBuilder: Q, validation?: QueryAnalysis | null): Q;
    /**
     * Reads the equality-criteria fast path once for the current operation.
     * @private
     * @param {Object} specification Candidate specification.
     * @returns {Record<string, unknown>|null} Equality criteria or null.
     */
    _queryObjectCriteria(specification: QuerySpecification): DomainRecord | null;
    /**
     * Applies a plain equality-criteria object (`{column: value}`) to a query builder.
     * @private
     * @param {Record<string, unknown>} criteria Equality criteria.
     * @param {Object} queryBuilder database query constructor.
     * @returns {Object} The configured query builder.
     */
    _applyQueryObject<Q extends DomainQuery>(criteria: DomainRecord, queryBuilder: Q): Q;
    /**
     * Evaluates if a given specification possesses a supported mapping to database query structures.
     * @param {Object} specification Criteria to validate.
     * @returns {{valid:boolean, reason:string|null, queryObjectCriteria:Record<string, unknown>|null}} Validation outcome and the criterion evaluation for this operation.
     */
    validate(specification: QuerySpecification | null | undefined): Required<QueryAnalysis>;
    /**
     * Safely attempts specification translation, encapsulating potential failures in a result object.
     * @param {Object} specification domain filter criteria.
     * @param {Object} queryBuilder database query constructor.
     * @returns {{success:boolean, queryBuilder:Object|null, error:string|null}} Operation result metadata.
     */
    tryTranslate<Q extends DomainQuery>(specification: QuerySpecification | null | undefined, queryBuilder: Q): {
        success: boolean;
        queryBuilder: Q;
        error: null;
    } | {
        success: boolean;
        queryBuilder: null;
        error: string;
    };
}
