import type { DomainQuery } from '../internal/contracts.js';
import { Specification } from './Specification.js';
import './CompositeSpecification.js';
/**
 * Specification implementation using arbitrary JavaScript predicates for in-memory entity evaluation.
 * @class
 * @extends Specification
 */
export declare class FunctionSpecification<E = unknown> extends Specification<E> {
    predicateFunction: (entity: E) => unknown;
    description: string | null;
    /**
     * Initializes specification with a custom predicate logic and optional metadata.
     * @param {Function} predicateFunction Boolean transformation taking a domain entity.
     * @param {string|null} [description=null] Semantic description of the logic.
     * @throws {SpecificationException} If predicateFunction is not a function.
     */
    constructor(predicateFunction: (entity: E) => unknown, description?: string | null);
    /**
     * Evaluates the custom predicate against a target entity instance.
     * @param {Object} entity Domain entity to test.
     * @returns {boolean} Outcome of the predicate function.
     * @throws {SpecificationException} If the predicate function execution fails.
     */
    isSatisfiedBy(entity: E): boolean;
    /**
     * Prevents translation to database queries as arbitrary functions lack persistence mapping.
     * @throws {SpecificationException} Always, as translation is unsupported.
     */
    toQuery<Q extends DomainQuery>(_queryBuilder: Q): Q;
    /**
     * Indicates that function specifications are restricted to in-memory evaluation.
     * @returns {false} Always false.
     */
    canBeTranslatedToQuery(): boolean;
    /**
     * Returns a semantic summary of the function-based specification.
     * @returns {string} Function description or generic label.
     */
    toString(): string;
}
