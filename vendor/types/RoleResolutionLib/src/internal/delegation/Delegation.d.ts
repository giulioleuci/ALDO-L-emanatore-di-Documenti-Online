import type { DelegationDefinition } from '../../types.js';
/**
 * @file RoleResolutionLib/src/delegation/Delegation.js
 * @description Delegation value object representing a responsibility transfer.
 * @version 1.0.0
 */
import { DelegationState } from './DelegationState.js';
import { DelegationRules } from './DelegationRules.js';
/**
 * @class Delegation
 * @description Immutable Value Object representing the transfer of role responsibilities from a Principal to a Delegate.
 */
export declare class Delegation {
    _state: DelegationState;
    _rules: DelegationRules;
    id: DelegationState['id'];
    principalId: DelegationState['principalId'];
    delegateId: DelegationState['delegateId'];
    roleIds: DelegationState['roleIds'];
    scope: DelegationState['scope'];
    scopeRestriction: DelegationState['scopeRestriction'];
    validFrom: DelegationState['validFrom'];
    validTo: DelegationState['validTo'];
    routingPolicy: DelegationState['routingPolicy'];
    isActive: DelegationState['isActive'];
    reason: DelegationState['reason'];
    metadata: DelegationState['metadata'];
    isValidAt: DelegationRules['isValidAt'];
    appliesToRole: DelegationRules['appliesToRole'];
    appliesToScope: DelegationRules['appliesToScope'];
    appliesTo: DelegationRules['appliesTo'];
    isFullDelegation: DelegationRules['isFullDelegation'];
    isIndefinite: DelegationRules['isIndefinite'];
    getRemainingDays: DelegationRules['getRemainingDays'];
    getMetadata: DelegationState['getMetadata'];
    toJSON: DelegationState['toJSON'];
    /**
     * @constructor
     * @param {Object} definition - Delegation specification.
     * @param {string} definition.id - Unique delegation identifier.
     * @param {string} definition.principalId - ID of actor surrendering responsibilities.
     * @param {string} definition.delegateId - ID of actor assuming responsibilities.
     * @param {string[]|'*'} [definition.roleIds='*'] - Specific role IDs or wildcard for all.
     * @param {Scope|Object|null} [definition.scope=null] - Target scope.
     * @param {Scope|Object|null} [definition.scopeRestriction=null] - Optional narrowing of principal scope.
     * @param {Date|string} [definition.validFrom=now] - Start of delegation period.
     * @param {Date|string|null} [definition.validTo=null] - End of delegation period.
     * @param {string} [definition.routingPolicy=RoutingPolicy.DELEGATE_ONLY] - Routing strategy.
     * @param {boolean} [definition.isActive=true] - Soft-enable flag.
     * @param {string} [definition.reason=''] - Audit trail justification.
     * @param {Object} [definition.metadata={}] - Domain attributes.
     * @throws {Error} Via DelegationState if definition is invalid.
     */
    constructor(definition?: DelegationDefinition | null);
    /**
     * @function equals
     * @description Comparison based on unique delegation ID.
     * @param {Delegation} other - Target for comparison.
     * @returns {boolean}
     */
    equals(other: unknown): boolean;
    /**
     * @static
     * @description Factory to hydrate a Delegation from POJO.
     * @param {Object} obj - Serialized data.
     * @returns {Delegation}
     * @throws {Error} If obj is invalid.
     */
    static fromJSON(obj: unknown): Delegation;
    /**
     * @function toString
     * @returns {string} Debug string: Delegation[ID] PRINCIPAL -> DELEGATE [Roles] [Period] (Reason).
     */
    toString(): string;
}
