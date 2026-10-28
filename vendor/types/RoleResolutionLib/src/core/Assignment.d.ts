import type { AssignmentDefinition, RoleMetadata } from '../types.js';
/**
 * @file RoleResolutionLib/src/core/Assignment.js
 * @description Assignment value object representing a role-actor-scope association.
 * @version 1.0.0
 */
import { Scope } from './Scope.js';
/**
 * @class Assignment
 * @description Immutable Value Object binding an Actor to a Role within a Scope (with temporal validity).
 */
export declare class Assignment {
    readonly roleId: string;
    readonly actorId: string;
    readonly scope: Scope;
    readonly priority: number;
    readonly validFrom: Date | null;
    readonly validTo: Date | null;
    readonly isActive: boolean;
    readonly metadata: RoleMetadata;
    /**
     * @constructor
     * @param {Object} definition - Initialization object.
     * @param {string} definition.roleId - Unique role identifier.
     * @param {string} definition.actorId - Unique actor identifier.
     * @param {Scope|Object} definition.scope - Visibility/control boundary.
     * @param {number} [definition.priority=0] - Resolution weight (descending).
     * @param {Date|string|null} [definition.validFrom=null] - Start of eligibility.
     * @param {Date|string|null} [definition.validTo=null] - End of eligibility.
     * @param {boolean} [definition.isActive=true] - Soft-enable flag.
     * @param {Object} [definition.metadata={}] - Custom domain attributes.
     * @throws {Error} If roleId, actorId, or scope is missing.
     */
    constructor(definition?: AssignmentDefinition | null);
    /**
     * @function _parseDate
     * @description Normalizes Date objects or ISO strings. Delegates to the
     * shared CoreUtilsLib date parser.
     * @param {Date|string|null} value - Raw input.
     * @returns {Date|null} Valid Date or null if unparseable.
     * @private
     */
    _parseDate(value: unknown): Date | null;
    /**
     * @function isValidAt
     * @description Checks isActive status and temporal boundaries.
     * @param {Date} [asOfDate=new Date()] - Reference point.
     * @returns {boolean} True if within [validFrom, validTo].
     */
    isValidAt(asOfDate?: Date): boolean;
    /**
     * @function matches
     * @description Validates roleId, temporal eligibility, and scope containment.
     * @param {string} roleId - Query role.
     * @param {Scope} scope - Query scope.
     * @param {Date} [asOfDate=new Date()] - Query time.
     * @returns {boolean} True if assignment satisfies query parameters.
     */
    matches(roleId: string, scope: Scope, asOfDate?: Date): boolean;
    /**
     * @function equals
     * @description Structural equality check (role, actor, scope).
     * @param {Assignment} other - Target for comparison.
     * @returns {boolean}
     */
    equals(other: unknown): boolean;
    /**
     * @function getMetadata
     * @description Safe access to metadata object.
     * @param {string} key - Property name.
     * @param {*} [defaultValue=null] - Fallback value.
     * @returns {*} Value or defaultValue.
     */
    getMetadata(key: string, defaultValue?: unknown): unknown;
    /**
     * @function toJSON
     * @description Serializes to plain object for persistence.
     * @returns {Object} JSON-compatible representation.
     */
    toJSON(): {
        roleId: string;
        actorId: string;
        scope: {
            type: import("./ScopeType.js").ScopeTypeValue;
            value: unknown;
            hierarchy: string[];
        };
        priority: number;
        validFrom: string | null;
        validTo: string | null;
        isActive: boolean;
        metadata: {
            [x: string]: unknown;
        };
    };
    /**
     * @static
     * @description Factory to hydrate an Assignment from POJO.
     * @param {Object} obj - Serialized data.
     * @returns {Assignment}
     * @throws {Error} If obj is invalid.
     */
    static fromJSON(obj: unknown): Assignment;
    /**
     * @function toString
     * @returns {string} Debug string: Assignment[ROLE -> ACTOR] Scope [Validity]
     */
    toString(): string;
}
