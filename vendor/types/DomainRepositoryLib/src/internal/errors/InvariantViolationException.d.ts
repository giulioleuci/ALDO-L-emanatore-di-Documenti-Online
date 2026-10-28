import { DomainException } from './DomainException.js';
/**
 * Exception class for business rule violations that compromise aggregate integrity.
 * @class
 * @extends DomainException
 */
export declare class InvariantViolationException extends DomainException {
    aggregateType: string;
    violations: string[];
    /**
     * Initializes exception with target aggregate type and a collection of violation descriptions.
     * @param {string} aggregateType Domain aggregate classification.
     * @param {string[]} [violations=[]] Detailed list of unsatisfied business rules.
     */
    constructor(aggregateType: string, violations?: string[]);
    /**
     * Returns the domain classification of the aggregate that failed invariant validation.
     * @returns {string} Aggregate type name.
     */
    getAggregateType(): string;
    /**
     * Retrieves the comprehensive list of business rule violations detected.
     * @returns {string[]} Collection of violation descriptions.
     */
    getViolations(): string[];
    /**
     * Verifies if the exception contains specific violation details.
     * @returns {boolean} True if the violations list is non-empty.
     */
    hasViolations(): boolean;
}
