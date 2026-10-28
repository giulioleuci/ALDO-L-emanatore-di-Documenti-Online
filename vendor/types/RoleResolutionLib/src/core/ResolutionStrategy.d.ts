export type ResolutionStrategyValue = (typeof ResolutionStrategy)[keyof typeof ResolutionStrategy];
/**
 * @file RoleResolutionLib/src/core/ResolutionStrategy.js
 * @description Enumeration of resolution strategies for role resolution.
 * @version 1.0.0
 */
/**
 * @enum {string}
 * @readonly
 * @description Logic for selecting actors when multiple matches exist for a role/scope.
 */
export declare const ResolutionStrategy: Readonly<{
    /** Returns the first encountered match. */
    FIRST: "FIRST";
    /** Returns all matches as an array. */
    ALL: "ALL";
    /** Returns matches sorted by priority weight. */
    PRIORITY: "PRIORITY";
}>;
/**
 * @function isValidResolutionStrategy
 * @description Validates if a string is a recognized ResolutionStrategy.
 * @param {string} value - String to validate.
 * @returns {boolean} True if value exists in ResolutionStrategy.
 */
export declare function isValidResolutionStrategy(value: unknown): value is ResolutionStrategyValue;
/**
 * @function getResolutionStrategies
 * @description Retrieves all supported strategy strings.
 * @returns {string[]} Array of ResolutionStrategy values.
 */
export declare function getResolutionStrategies(): ("FIRST" | "ALL" | "PRIORITY")[];
