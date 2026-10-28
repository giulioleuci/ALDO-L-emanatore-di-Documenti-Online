import type { RoleDefinition, RoleLogger } from '../types.js';
/**
 * @file RoleResolutionLib/src/registry/RoleRegistry.js
 * @description Registry for role definitions.
 * @version 1.0.0
 */
import { Role } from '../core/Role.js';
import { Registry } from '@CoreUtilsLib';
/**
 * @class RoleRegistry
 * @description Centralized CRUD store for Role definitions. Handles validation and indexing.
 */
export declare class RoleRegistry {
    _logger: RoleLogger;
    _roles: Registry<string, Role>;
    /**
     * @constructor
     * @param {Object} [options={}] - Configuration.
     * @param {Object} [options.logger=console] - Telemetry target.
     * @param {Role[]} [options.initialRoles=[]] - Bulk seed roles.
     */
    constructor(options?: {
        logger?: RoleLogger;
        initialRoles?: (Role | RoleDefinition)[];
    });
    /**
     * @function register
     * @description Validates and persists a role. Overwrites existing IDs with a warning.
     * @param {Role|Object} roleOrDefinition - Role instance or raw definition POJO.
     * @returns {Role} The indexed Role instance.
     * @throws {RoleValidationError} If definition violates Role schema.
     */
    register(roleOrDefinition: Role | RoleDefinition | null | undefined): Role;
    /**
     * @function registerAll
     * @param {(Role|Object)[]} roles - Set of definitions.
     * @returns {Role[]} Indexed instances.
     * @throws {Error} If roles is not an array.
     */
    registerAll(roles: (Role | RoleDefinition)[]): Role[];
    /**
     * @function get
     * @param {string} roleId - Unique ID.
     * @returns {Role}
     * @throws {RoleNotFoundError} If ID is missing.
     */
    get(roleId: string): Role;
    /**
     * @function getOrNull
     * @param {string} roleId - Unique ID.
     * @returns {Role|null}
     */
    getOrNull(roleId: string): Role | null;
    /**
     * @function has
     * @param {string} roleId - Unique ID.
     * @returns {boolean}
     */
    has(roleId: string): boolean;
    /**
     * @function unregister
     * @param {string} roleId - ID to purge.
     * @returns {boolean} True if found and deleted.
     */
    unregister(roleId: string): boolean;
    /**
     * @function getAll
     * @returns {Role[]} Complete set.
     */
    getAll(): Role[];
    /**
     * @function getAllIds
     * @returns {string[]} Keys only.
     */
    getAllIds(): string[];
    /**
     * @function size
     * @returns {number}
     */
    size(): number;
    /**
     * @function clear
     * @description Purges all registrations.
     */
    clear(): void;
    /**
     * @function find
     * @param {Function} predicate - Boolean filter.
     * @returns {Role[]}
     */
    find(predicate: (role: Role, index: number, roles: Role[]) => unknown): Role[];
    /**
     * @function findByScopeType
     * @param {string} scopeType - Enum filter.
     * @returns {Role[]}
     */
    findByScopeType(scopeType: string): Role[];
    /**
     * @function findDelegatable
     * @returns {Role[]} Roles with allowsDelegation: true.
     */
    findDelegatable(): Role[];
    /**
     * @function toJSON
     * @description Serializes indexed roles to mapped POJO.
     * @returns {Object} {roles: Object.<string, Object>}
     */
    toJSON(): {
        roles: Record<string, {
            id: string;
            name: string;
            description: string;
            scopeType: import("../core/ScopeType.js").ScopeTypeValue;
            resolutionStrategy: import("../core/ResolutionStrategy.js").ResolutionStrategyValue;
            allowsDelegation: boolean;
            fallbackRoles: string[];
            metadata: {
                [x: string]: unknown;
            };
        }>;
    };
    /**
     * @static
     * @description Factory to hydrate a RoleRegistry from POJO.
     * @param {Object} obj - Serialized data.
     * @param {Object} [options={}] - New registry options.
     * @returns {RoleRegistry}
     * @throws {Error} If obj is invalid.
     */
    static fromJSON(obj: unknown, options?: ConstructorParameters<typeof RoleRegistry>[0]): RoleRegistry;
}
