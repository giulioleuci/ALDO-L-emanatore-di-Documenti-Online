import type { ScopeTypeValue } from './ScopeType.js';
/**
 * @class Scope
 * @description Immutable Value Object defining the context (GLOBAL, ORG_UNIT, PROJECT, etc.) for role assignments.
 */
export declare class Scope {
    readonly type: ScopeTypeValue;
    readonly value: unknown;
    readonly hierarchy: string[];
    /**
     * @constructor
     * @param {string} type - Enum value from ScopeType.
     * @param {string|Object|null} [value=null] - Unique identifier for the scope instance.
     * @param {string[]} [hierarchy=[]] - Ordered list of parent identifiers for containment logic.
     * @throws {Error} If type is invalid.
     */
    constructor(type: unknown, value?: unknown, hierarchy?: string[]);
    /**
     * @static
     * @description Factory for GLOBAL scope.
     * @returns {Scope}
     */
    static global(): Scope;
    /**
     * @static
     * @description Factory for organizational unit scope.
     * @param {string} value - Org ID.
     * @param {string[]} [hierarchy=[]] - Parent path.
     * @returns {Scope}
     */
    static orgUnit(value: unknown, hierarchy?: string[]): Scope;
    /**
     * @static
     * @description Factory for project-level scope.
     * @param {string|Object} value - Project ID.
     * @returns {Scope}
     */
    static project(value: unknown): Scope;
    /**
     * @static
     * @description Factory for specific resource scope.
     * @param {string|Object} value - Resource ID.
     * @returns {Scope}
     */
    static resource(value: unknown): Scope;
    /**
     * @static
     * @description Factory for non-standard scope types.
     * @param {string|Object} value - Custom identifier.
     * @param {string[]} [hierarchy=[]] - Optional path.
     * @returns {Scope}
     */
    static custom(value: unknown, hierarchy?: string[]): Scope;
    /**
     * @function isGlobal
     * @returns {boolean} True if type is GLOBAL.
     */
    isGlobal(): boolean;
    /**
     * @function contains
     * @description Logical containment check. Returns true if this scope equals other OR is a parent in the hierarchy.
     * @param {Scope} other - Query scope.
     * @returns {boolean}
     */
    contains(other: unknown): boolean;
    /**
     * @function matches
     * @description Structural equality check (type, value, hierarchy).
     * @param {Scope} other - Target for comparison.
     * @returns {boolean}
     */
    matches(other: unknown): boolean;
    /**
     * @function getValueString
     * @description Stringifies the scope value.
     * @returns {string}
     */
    getValueString(): string;
    /**
     * @function toJSON
     * @description Serializes to POJO.
     * @returns {Object} {type, value, hierarchy}
     */
    toJSON(): {
        type: ScopeTypeValue;
        value: unknown;
        hierarchy: string[];
    };
    /**
     * @static
     * @description Hydrates a Scope from POJO.
     * @param {Object} obj - Serialized data.
     * @returns {Scope}
     * @throws {Error} If obj is invalid.
     */
    static fromJSON(obj: unknown): Scope;
    /**
     * @function toString
     * @returns {string} Debug string: Scope[TYPE:VALUE] (Path)
     */
    toString(): string;
    /**
     * @function _valuesEqual
     * @private
     * @description Checks if the value of this scope equals another scope's value.
     * @param {Scope} other - The other scope.
     * @returns {boolean}
     */
    _valuesEqual(other: Scope): boolean;
    /**
     * @function _hierarchiesEqual
     * @private
     * @description Checks if the hierarchy of this scope equals another scope's hierarchy.
     * @param {Scope} other - The other scope.
     * @returns {boolean}
     */
    _hierarchiesEqual(other: Scope): boolean;
}
