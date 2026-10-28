import type { Actor } from './Actor.js';
import type { RoleActor, ResolutionResultData, RoleMetadata } from '../types.js';
/**
 * @class ResolutionResult
 * @description Immutable Value Object encapsulating role resolution output (actors, delegation chain, routing).
 */
export declare class ResolutionResult<A extends RoleActor = RoleActor> {
    readonly requestedRole: ResolutionResultData<A>['requestedRole'];
    readonly scope: ResolutionResultData<A>['scope'];
    readonly effectiveActor: A | null;
    readonly principalActor: A | null;
    readonly allActors: A[];
    readonly delegationChain: NonNullable<ResolutionResultData<A>['delegationChain']>;
    readonly routing: {
        primary: RoleActor[];
        cc: RoleActor[];
        bcc: RoleActor[];
    };
    readonly metadata: RoleMetadata & {
        resolvedAt: Date;
    };
    readonly fallbackUsed: boolean;
    readonly fallbackRoleId: string | null;
    /**
     * @constructor
     * @param {Object} data - Result payload.
     * @param {Object} data.requestedRole - Queried Role instance/POJO.
     * @param {Object} data.scope - Queried Scope instance/POJO.
     * @param {Object|null} [data.effectiveActor=null] - Resolved actor authorized to act.
     * @param {Object|null} [data.principalActor=null] - Original non-delegated actor.
     * @param {Object[]} [data.allActors=[]] - Complete set of resolved actors (for MULTI strategy).
     * @param {Object[]} [data.delegationChain=[]] - History of delegation objects applied.
     * @param {Object} [data.routing={}] - Notification targets (primary, cc, bcc arrays).
     * @param {Object} [data.metadata={}] - Resolution audit data.
     * @param {boolean} [data.fallbackUsed=false] - True if resolved via fallback.
     * @param {string|null} [data.fallbackRoleId=null] - ID of fallback role used.
     * @throws {Error} If data is missing or non-object.
     */
    constructor(data?: ResolutionResultData<A> | null);
    /**
     * @function isResolved
     * @returns {boolean} True if an effectiveActor was found.
     */
    isResolved(): boolean;
    /**
     * @function isDelegated
     * @returns {boolean} True if delegationChain is non-empty.
     */
    isDelegated(): boolean;
    /**
     * @function getDelegationDepth
     * @returns {number} Count of delegation hops.
     */
    getDelegationDepth(): number;
    /**
     * @function hasEffectiveActorChange
     * @description Checks if delegation resulted in a different actor identity.
     * @returns {boolean}
     */
    hasEffectiveActorChange(): boolean;
    /**
     * @function getAllRoutingRecipients
     * @description Aggregates primary, cc, and bcc actor arrays.
     * @returns {Object[]} Combined list of all notified actors.
     */
    getAllRoutingRecipients(): RoleActor[];
    /**
     * @function getAllActorIds
     * @description Extracts unique actor IDs from all resolution facets.
     * @returns {string[]} Set of involved actor IDs.
     */
    getAllActorIds(): string[];
    /**
     * @static
     * @description Factory for unsuccessful resolution.
     * @param {Object} requestedRole - Requested role context.
     * @param {Object} scope - Queried scope context.
     * @param {Object} [metadata={}] - Audit trails.
     * @returns {ResolutionResult} Unresolved result instance.
     */
    static empty<A extends RoleActor = Actor>(requestedRole: ResolutionResultData<A>['requestedRole'], scope: ResolutionResultData<A>['scope'], metadata?: RoleMetadata): ResolutionResult<A>;
    /**
     * @static
     * @description Factory for single-actor successful resolution without delegation.
     * @param {Object} requestedRole - Requested role context.
     * @param {Object} scope - Queried scope context.
     * @param {Object} actor - Resolved actor instance.
     * @returns {ResolutionResult} Resolved result instance.
     */
    static simple<A extends RoleActor>(requestedRole: ResolutionResultData<A>['requestedRole'], scope: ResolutionResultData<A>['scope'], actor: A): ResolutionResult<A>;
    /**
     * @function toJSON
     * @description Deeply serializes all result facets to POJO.
     * @returns {Object} JSON-compatible structure.
     */
    toJSON(): {
        requestedRole: unknown;
        scope: unknown;
        effectiveActor: unknown;
        principalActor: unknown;
        allActors: unknown[];
        delegationChain: unknown[];
        routing: {
            primary: unknown[];
            cc: unknown[];
            bcc: unknown[];
        };
        metadata: {
            [x: string]: unknown;
            resolvedAt: Date;
        };
        fallbackUsed: boolean;
        fallbackRoleId: string | null;
    };
    /**
     * @function toString
     * @returns {string} Debug string: ResolutionResult[ROLE] -> EFFECTIVE (delegation/fallback).
     */
    toString(): string;
}
