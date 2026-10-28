import type { DomainQuery } from '../internal/contracts.js';
import { Specification } from './Specification.js';
import './CompositeSpecification.js';
/**
 * Atomic specification for comparing entity field values against specific criteria using common relational operators.
 * @class
 * @extends Specification
 */
export declare class FieldSpecification<E = unknown> extends Specification<E> {
    _field: string;
    _operator: string;
    _value: unknown;
    _secondValue: unknown;
    /**
     * Initializes comparison criteria with target field, operator, and comparison values.
     * @param {string} field Dot-notation property path within the entity.
     * @param {string} operator Relational operator (equals|notEquals|greaterThan|lessThan|greaterThanOrEqual|lessThanOrEqual|in|notIn|between|like|notLike).
     * @param {*} value Primary comparison value or [min, max] array for 'between'.
     * @param {*} [secondValue=null] Boundary value for 'between' if not provided in array.
     * @throws {SpecificationException} If the operator is unsupported.
     */
    constructor(field: string, operator: string, value: unknown, secondValue?: unknown);
    /**
     * Enforces usage of supported relational comparison operators.
     * @private
     * @throws {SpecificationException} If operator classification is unknown.
     */
    _validateOperator(): void;
    /**
     * Safely resolves the value of the target field from an entity instance, supporting nested path navigation.
     * @private
     * @param {Object} entity Target domain entity.
     * @returns {*} Resolved field value or undefined if path resolution fails.
     */
    _getFieldValue(entity: E): unknown;
    /**
     * Evaluates the relational criteria against a target entity's resolved field value.
     * @param {Object} entity Domain entity to test.
     * @returns {boolean} True if the entity field satisfies the comparison.
     * @throws {SpecificationException} If entity is null/undefined or if operator-specific value constraints are violated.
     */
    isSatisfiedBy(entity: E): boolean;
    /**
     * Exposes an exact equality criterion for query-object pushdown.
     * @returns {Record<string, unknown>|null} Equality criterion or null for other operators.
     */
    toQueryObject(): {
        [x: string]: unknown;
    } | null;
    /**
     * Maps the relational criteria to SheetDBLib query builder instructions.
     * @param {Object} queryBuilder Database query constructor.
     * @returns {Object} The configured query builder.
     * @throws {SpecificationException} If the operator lacks a direct persistence mapping (e.g., notIn, notLike).
     */
    toQuery<Q extends DomainQuery>(queryBuilder: Q): Q;
    /**
     * Returns a human-readable string representation of the comparison criteria.
     * @returns {string} Relational expression string.
     */
    toString(): string;
}
