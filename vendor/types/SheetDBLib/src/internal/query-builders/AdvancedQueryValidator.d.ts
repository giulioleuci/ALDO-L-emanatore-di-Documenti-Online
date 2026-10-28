/**
 * @file SheetDBLib/src/query/managers/AdvancedQueryValidator.js
 * @description Validation logic for query building operations.
 */
/**
 * @class AdvancedQueryValidator
 * @description Static structural validation for Query Builder operations.
 * Verifies table existence, relational integrity for JOINs, and type correctness for query operands.
 */
export declare class AdvancedQueryValidator {
    /**
     * @description Verifies that the target table identifier is registered in the database service.
     * @param {DatabaseService} dbService - Active database service.
     * @param {string} tableName - Target table identifier.
     * @throws {Error} If the table name is not found in the service registry.
     */
    validateTable(dbService: {
        tables?: Record<string, object>;
    }, tableName: string): void;
    /**
     * @description Validates relational integrity for JOIN operations.
     * @param {DatabaseService} dbService - Active database service.
     * @param {string} table - Target foreign table identifier.
     * @param {string} [type='JOIN'] - Join operation type for error context.
     * @throws {Error} If the foreign table is not registered.
     */
    validateJoin(dbService: {
        tables?: Record<string, object>;
    }, table: string, type?: string): void;
    /**
     * @description Ensures the operand for an 'IN' condition is a valid collection.
     * @param {string} field - Target column identifier.
     * @param {*} values - Operand to verify.
     * @throws {Error} If values is not an Array.
     */
    validateWhereIn(field: string, values: unknown): void;
    /**
     * Validates the opt-in fuzzy predicate API before Fuse receives configuration.
     * Only threshold is exposed deliberately so query callers cannot override
     * compiler-owned options such as keys, includeScore, or sorting.
     *
     * @param {*} field Target field identifier.
     * @param {*} query Fuzzy search text.
     * @param {*} options Fuzzy configuration.
     * @throws {Error} If the predicate cannot be evaluated safely.
     */
    validateFuzzyCondition(field: unknown, query: unknown, options?: unknown): void;
    /**
     * @description Verifies sort direction identifiers.
     * @param {string} direction - The sort direction string.
     * @throws {Error} If direction is neither 'ASC' nor 'DESC' (case-insensitive).
     */
    validateOrderDirection(direction: string): void;
}
