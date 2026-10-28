import type { DomainQuery } from '../internal/contracts.js';
import { Specification } from './Specification.js';
/**
 * Logic-based specification container combining multiple child specifications using AND, OR, or NOT operators.
 * @class
 * @extends Specification
 */
export declare class CompositeSpecification<E = unknown> extends Specification<E> {
    operator: string;
    specifications: Specification<E>[];
    /**
     * Initializes composite structure with logical operator and constituent specifications.
     * @param {string} operator Logic gate ('AND'|'OR'|'NOT').
     * @param {Array<Object>} specifications Collection of specifications to evaluate.
     * @throws {SpecificationException} If operator is invalid or specifications collection is empty/malformed.
     */
    constructor(operator: string, specifications: Specification<E>[]);
    /**
     * Enforces usage of supported logical operators.
     * @private
     * @throws {SpecificationException} If operator is not AND, OR, or NOT.
     */
    _validateOperator(): void;
    /**
     * Verifies that the constituent collection contains valid Specification instances.
     * @private
     * @throws {SpecificationException} If the collection is empty or contains non-Specification types.
     */
    _validateSpecifications(): void;
    /**
     * Evaluates the combined logical state against a target entity instance.
     * @param {Object} entity Domain entity to test.
     * @returns {boolean} True if the entity satisfies the composite logic.
     * @throws {SpecificationException} If NOT operator is used with multiple children.
     */
    isSatisfiedBy(entity: E): boolean;
    /**
     * Translates the composite logic into SheetDBLib query builder instructions.
     * @param {Object} queryBuilder Database query constructor.
     * @returns {Object} The configured query builder.
     * @throws {SpecificationException} If using NOT operator (unsupported) or if children are non-translatable.
     */
    toQuery<Q extends DomainQuery>(queryBuilder: Q): Q;
    /**
     * Determines if the entire composite tree possesses a supported database mapping.
     * @returns {boolean} True if all branches are translatable and no unsupported operators are present.
     */
    canBeTranslatedToQuery(): boolean;
    /**
     * Returns a recursive string representation of the logical tree.
     * @returns {string} Logical expression string.
     */
    toString(): string;
}
