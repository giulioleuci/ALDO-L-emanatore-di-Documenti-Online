import type { Delegation } from '../internal/delegation/Delegation.js';
import type { Scope } from '../core/Scope.js';
/**
 * @file RoleResolutionLib/src/registry/DelegationSource.js
 * @description Interface definition for delegation data sources.
 * @version 1.0.0
 */
/**
 * @interface DelegationSource
 * @description Contract for persistence layers providing active responsibility transfers.
 */
export declare class DelegationSource {
    /**
     * @function getActiveDelegationsForPrincipal
     * @description Retrieves delegations issued by an actor that are valid at a specific time.
     * @param {string} principalId - Issuing actor ID.
     * @param {Date} [asOfDate=new Date()] - Temporal validity point.
     * @returns {Delegation[]}
     * @abstract
     */
    getActiveDelegationsForPrincipal(principalId: string, asOfDate?: Date): Delegation[];
    /**
     * @function getActiveDelegationsForDelegate
     * @description Retrieves delegations received by an actor.
     * @param {string} delegateId - Receiving actor ID.
     * @param {Date} [asOfDate=new Date()] - Temporal validity point.
     * @returns {Delegation[]}
     * @abstract
     */
    getActiveDelegationsForDelegate(delegateId: string, asOfDate?: Date): Delegation[];
    /**
     * @function getDelegationChain
     * @description Resolves transitive delegation paths (A -> B -> C) for a role/scope context.
     * @param {string} actorId - Starting principal ID.
     * @param {string} roleId - Role context for filtering.
     * @param {Scope} scope - Scope context for filtering.
     * @param {Date} [asOfDate=new Date()] - Temporal validity point.
     * @returns {Delegation[]} Ordered array from nearest to farthest delegate.
     * @abstract
     */
    getDelegationChain(actorId: string, roleId: string, scope: Scope, asOfDate?: Date): Delegation[];
}
/**
 * @class InMemoryDelegationSource
 * @extends DelegationSource
 * @description Non-persistent implementation using arrays for delegation storage.
 */
export declare class InMemoryDelegationSource extends DelegationSource {
    _delegations: Delegation[];
    /**
     * @constructor
     * @param {Object} [data={}] - Initial state.
     * @param {Delegation[]} [data.delegations=[]] - Seed delegations.
     */
    constructor(data?: {
        delegations?: Delegation[];
    });
    /**
     * @function addDelegation
     * @param {Delegation} delegation - Record to append.
     */
    addDelegation(delegation: Delegation): void;
    /**
     * @function getActiveDelegationsForPrincipal
     * @param {string} principalId - Issuer ID.
     * @param {Date} [asOfDate=new Date()] - Reference time.
     * @returns {Delegation[]}
     */
    getActiveDelegationsForPrincipal(principalId: string, asOfDate?: Date): Delegation[];
    /**
     * @function getActiveDelegationsForDelegate
     * @param {string} delegateId - Receiver ID.
     * @param {Date} [asOfDate=new Date()] - Reference time.
     * @returns {Delegation[]}
     */
    getActiveDelegationsForDelegate(delegateId: string, asOfDate?: Date): Delegation[];
    /**
     * @function getDelegationChain
     * @description Synchronously crawls the delegation graph to build a linear chain for a specific context.
     * @param {string} actorId - Start ID.
     * @param {string} roleId - Role filter.
     * @param {Scope} scope - Scope filter.
     * @param {Date} [asOfDate=new Date()] - Reference time.
     * @returns {Delegation[]} Ordered transitive chain.
     */
    getDelegationChain(actorId: string, roleId: string, scope: Scope, asOfDate?: Date): Delegation[];
    /**
     * @function getAllDelegations
     * @returns {Delegation[]} Complete set.
     */
    getAllDelegations(): Delegation[];
    /**
     * @function clear
     * @description Purges all internal delegations.
     */
    clear(): void;
}
