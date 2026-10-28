import type { ResolutionStrategyValue } from './ResolutionStrategy.js';
import type { ScopeTypeValue } from './ScopeType.js';
import type { RoleDefinition, RoleMetadata } from '../types.js';
/**
 * @class Role
 * @description Immutable Value Object defining a responsibility, its scope requirements, and resolution logic.
 */
export declare class Role {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly scopeType: ScopeTypeValue;
    readonly resolutionStrategy: ResolutionStrategyValue;
    readonly allowsDelegation: boolean;
    readonly fallbackRoles: string[];
    readonly metadata: RoleMetadata;
    /**
     * @constructor
     * @param {Object} definition - Role specification.
     * @param {string} definition.id - Unique role identifier.
     * @param {string} definition.name - Human-readable label.
     * @param {string} [definition.description=''] - Functional purpose details.
     * @param {string} [definition.scopeType=ScopeType.GLOBAL] - Level from ScopeType enum.
     * @param {string} [definition.resolutionStrategy=ResolutionStrategy.FIRST] - Algorithm from ResolutionStrategy enum.
     * @param {boolean} [definition.allowsDelegation=true] - Toggle for delegation chain support.
     * @param {string[]} [definition.fallbackRoles=[]] - Ordered list of role IDs to query if primary search fails.
     * @param {Object} [definition.metadata={}] - Custom domain attributes.
     * @throws {Error} If id/name is missing, scopeType/strategy is invalid, or fallbackRoles is non-array.
     */
    constructor(definition?: RoleDefinition | null);
    /**
     * @function isGlobal
     * @returns {boolean} True if scopeType is GLOBAL.
     */
    isGlobal(): boolean;
    /**
     * @function resolvesToAll
     * @returns {boolean} True if strategy is ALL.
     */
    resolvesToAll(): boolean;
    /**
     * @function usesPriority
     * @returns {boolean} True if strategy is PRIORITY.
     */
    usesPriority(): boolean;
    /**
     * @function hasFallbacks
     * @returns {boolean} True if fallbackRoles array is non-empty.
     */
    hasFallbacks(): boolean;
    /**
     * @function getMetadata
     * @description Safe access to metadata object.
     * @param {string} key - Property name.
     * @param {*} [defaultValue=null] - Fallback value.
     * @returns {*} Value or defaultValue.
     */
    getMetadata(key: string, defaultValue?: unknown): unknown;
    /**
     * @function equals
     * @description Comparison based on unique role ID.
     * @param {Role} other - Target for comparison.
     * @returns {boolean}
     */
    equals(other: unknown): boolean;
    /**
     * @function toJSON
     * @description Deeply serializes role definition to POJO.
     * @returns {Object} JSON-compatible structure.
     */
    toJSON(): {
        id: string;
        name: string;
        description: string;
        scopeType: ScopeTypeValue;
        resolutionStrategy: ResolutionStrategyValue;
        allowsDelegation: boolean;
        fallbackRoles: string[];
        metadata: {
            [x: string]: unknown;
        };
    };
    /**
     * @static
     * @description Factory to hydrate a Role from POJO.
     * @param {Object} obj - Serialized data.
     * @returns {Role}
     * @throws {Error} If obj is invalid.
     */
    static fromJSON(obj: unknown): Role;
    /**
     * @function toString
     * @returns {string} Debug string: Role[ID] Name (Scope, Strategy).
     */
    toString(): string;
}
