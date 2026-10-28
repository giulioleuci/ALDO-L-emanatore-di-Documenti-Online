import type { ActorTypeValue } from './ActorType.js';
import type { RoleMetadata } from '../types.js';
/**
 * @class Actor
 * @description Immutable Value Object representing a role-bearing entity (PERSON, SYSTEM, or GROUP).
 */
export declare class Actor {
    readonly id: string;
    readonly type: ActorTypeValue;
    readonly identifier: string;
    readonly displayName: string;
    readonly metadata: RoleMetadata;
    /**
     * @constructor
     * @param {string} id - UUID or unique database identifier.
     * @param {string} type - Enum value from ActorType.
     * @param {string} identifier - Primary handle (e.g., email, service account ID).
     * @param {string} displayName - Human-readable name.
     * @param {Object} [metadata={}] - Domain-specific attributes.
     * @throws {Error} If id/identifier/displayName is missing or type is invalid.
     */
    constructor(id: unknown, type: unknown, identifier: unknown, displayName: unknown, metadata?: RoleMetadata);
    /**
     * @static
     * @description Factory for PERSON type actors.
     * @param {string} id - Unique ID.
     * @param {string} email - Actor email.
     * @param {string} displayName - Full name.
     * @param {Object} [metadata={}] - Attributes.
     * @returns {Actor}
     */
    static person(id: string, email: string, displayName: string, metadata?: RoleMetadata): Actor;
    /**
     * @static
     * @description Factory for SYSTEM type actors.
     * @param {string} id - Unique ID.
     * @param {string} serviceId - Service/Bot handle.
     * @param {string} displayName - Display name.
     * @param {Object} [metadata={}] - Attributes.
     * @returns {Actor}
     */
    static system(id: string, serviceId: string, displayName: string, metadata?: RoleMetadata): Actor;
    /**
     * @static
     * @description Factory for GROUP type actors.
     * @param {string} id - Unique ID.
     * @param {string} groupId - Group identifier/email.
     * @param {string} displayName - Team name.
     * @param {Object} [metadata={}] - Attributes.
     * @returns {Actor}
     */
    static group(id: string, groupId: string, displayName: string, metadata?: RoleMetadata): Actor;
    /**
     * @function isPerson
     * @returns {boolean} True if type is PERSON.
     */
    isPerson(): boolean;
    /**
     * @function isSystem
     * @returns {boolean} True if type is SYSTEM.
     */
    isSystem(): boolean;
    /**
     * @function isGroup
     * @returns {boolean} True if type is GROUP.
     */
    isGroup(): boolean;
    /**
     * @function equals
     * @description Comparison based on unique ID.
     * @param {Actor} other - Target for comparison.
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
     * @function withMetadata
     * @description Creates a new instance with merged metadata (Functional Update).
     * @param {Object} additionalMetadata - Fields to merge.
     * @returns {Actor} New immutable instance.
     */
    withMetadata(additionalMetadata: RoleMetadata): Actor;
    /**
     * @function toJSON
     * @description Serializes to plain object.
     * @returns {Object} {id, type, identifier, displayName, metadata}
     */
    toJSON(): {
        id: string;
        type: ActorTypeValue;
        identifier: string;
        displayName: string;
        metadata: {
            [x: string]: unknown;
        };
    };
    /**
     * @static
     * @description Hydrates an Actor from a plain object.
     * @param {Object} obj - Serialized actor data.
     * @returns {Actor}
     * @throws {Error} If obj is null or invalid.
     */
    static fromJSON(obj: unknown): Actor;
    /**
     * @function toString
     * @returns {string} Debug representation: Actor[TYPE:ID] Name <Identifier>
     */
    toString(): string;
}
