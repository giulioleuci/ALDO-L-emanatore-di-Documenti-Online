import type { RoutingPolicyValue } from '../routing/RoutingPolicy.js';
import type { DelegationDefinition, RoleMetadata } from '../../types.js';
/**
 * @file RoleResolutionLib/src/delegation/DelegationState.js
 * @description State object for a Delegation, handling data validation and storage.
 */
import { Scope } from '../../core/Scope.js';
export declare class DelegationState {
    id: string;
    principalId: string;
    delegateId: string;
    roleIds: string[] | '*';
    scope: Scope | null;
    scopeRestriction: Scope | null;
    validFrom: Date;
    validTo: Date | null;
    routingPolicy: RoutingPolicyValue;
    isActive: boolean;
    reason: string;
    metadata: RoleMetadata;
    constructor(definition?: DelegationDefinition | null);
    _parseDate(value: unknown): Date | null;
    getMetadata(key: string, defaultValue?: unknown): unknown;
    toJSON(): {
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
        routingPolicy: RoutingPolicyValue;
        isActive: boolean;
        reason: string;
        metadata: {
            [x: string]: unknown;
        };
    };
}
