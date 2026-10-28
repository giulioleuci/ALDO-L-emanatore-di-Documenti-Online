/**
 * @file RoleResolutionLib/src/delegation/DelegationChain.js
 * @description DelegationChain representing a chain of delegations.
 * @version 1.0.0
 */
import { Delegation } from './Delegation.js';
/**
 * @class DelegationChain
 * @description Immutable Collection representing a transitive series of Delegations (A -> B -> C).
 */
export declare class DelegationChain {
    readonly delegations: Delegation[];
    /**
     * @constructor
     * @param {Delegation[]} [delegations=[]] - Linked array of Delegation instances.
     * @throws {Error} If any element is not a Delegation, if linkage is broken, or if cycles exist.
     */
    constructor(delegations?: Delegation[]);
    /**
     * @static
     * @description Factory for empty chain.
     * @returns {DelegationChain}
     */
    static empty(): DelegationChain;
    /**
     * @static
     * @description Factory for single-hop chain.
     * @param {Delegation} delegation - Primary delegation.
     * @returns {DelegationChain}
     */
    static single(delegation: Delegation): DelegationChain;
    /**
     * @function isEmpty
     * @returns {boolean} True if delegations array is empty.
     */
    isEmpty(): boolean;
    /**
     * @function getDepth
     * @returns {number} Count of delegation segments.
     */
    getDepth(): number;
    /**
     * @function getOriginalPrincipalId
     * @description Retrieves ID of the first actor in the chain.
     * @returns {string|null}
     */
    getOriginalPrincipalId(): string | null;
    /**
     * @function getFinalDelegateId
     * @description Retrieves ID of the last actor in the chain.
     * @returns {string|null}
     */
    getFinalDelegateId(): string | null;
    /**
     * @function getAllActorIds
     * @description Ordered list of all actors involved (Principal + all Delegates).
     * @returns {string[]}
     */
    getAllActorIds(): string[];
    /**
     * @function getFirst
     * @returns {Delegation|null} First delegation segment.
     */
    getFirst(): Delegation | null;
    /**
     * @function getLast
     * @returns {Delegation|null} Final delegation segment.
     */
    getLast(): Delegation | null;
    /**
     * @function getAt
     * @param {number} index - 0-based position.
     * @returns {Delegation|null} Segment at index or null.
     */
    getAt(index: number): Delegation | null;
    /**
     * @function containsActor
     * @param {string} actorId - ID to check.
     * @returns {boolean}
     */
    containsActor(actorId: string): boolean;
    /**
     * @function wouldCreateCycle
     * @description Cycle detection logic before extending chain.
     * @param {Delegation} delegation - Potential next segment.
     * @returns {boolean} True if delegateId already exists in chain.
     */
    wouldCreateCycle(delegation: Delegation): boolean;
    /**
     * @function extend
     * @description Functional append. Returns new instance with added delegation.
     * @param {Delegation} delegation - Next segment.
     * @returns {DelegationChain}
     * @throws {Error} If linkage fails or cycle is detected.
     */
    extend(delegation: Delegation): DelegationChain;
    /**
     * @function forEach
     * @param {Function} callback - (delegation, index).
     */
    forEach(callback: (delegation: Delegation, index: number, delegations: Delegation[]) => void): void;
    /**
     * @function map
     * @param {Function} mapper - (delegation, index).
     * @returns {Array}
     */
    map<T>(mapper: (delegation: Delegation, index: number, delegations: Delegation[]) => T): T[];
    /**
     * @function isValidAt
     * @description Validates every segment in the chain against timestamp.
     * @param {Date} [asOfDate=new Date()] - Query time.
     * @returns {boolean}
     */
    isValidAt(asOfDate?: Date): boolean;
    /**
     * @function toJSON
     * @description Deeply serializes chain to POJO.
     * @returns {Object} {delegations, depth, originalPrincipalId, finalDelegateId}
     */
    toJSON(): {
        delegations: {
            id: string;
            principalId: string;
            delegateId: string;
            roleIds: string | string[];
            scope: {
                type: import("../../core/ScopeType.js").ScopeTypeValue;
                value: unknown;
                hierarchy: string[];
            } | null;
            scopeRestriction: {
                type: import("../../core/ScopeType.js").ScopeTypeValue;
                value: unknown;
                hierarchy: string[];
            } | null;
            validFrom: string;
            validTo: string | null;
            routingPolicy: import("../routing/RoutingPolicy.js").RoutingPolicyValue;
            isActive: boolean;
            reason: string;
            metadata: {
                [x: string]: unknown;
            };
        }[];
        depth: number;
        originalPrincipalId: string | null;
        finalDelegateId: string | null;
    };
    /**
     * @static
     * @description Hydrates a DelegationChain from POJO.
     * @param {Object} obj - Serialized data.
     * @returns {DelegationChain}
     * @throws {Error} If obj is invalid.
     */
    static fromJSON(obj: unknown): DelegationChain;
    /**
     * @function toString
     * @returns {string} Debug string: DelegationChain[ID1 -> ID2 -> ID3].
     */
    toString(): string;
}
