interface DelegationRuleState {
    id?: string;
    isActive?: boolean;
    validFrom?: Date;
    validTo?: Date | null;
    roleIds?: string[] | '*';
    scopeRestriction?: Pick<Scope, 'contains' | 'matches'> | null;
}
import type { Scope } from '../../core/Scope.js';
/**
 * @file RoleResolutionLib/src/delegation/DelegationRules.js
 * @description Business rules and applicability logic for a Delegation.
 */
export declare class DelegationRules {
    state: DelegationRuleState;
    constructor(state: DelegationRuleState);
    isValidAt(asOfDate?: Date): boolean;
    appliesToRole(roleId: string): boolean;
    appliesToScope(targetScope: unknown): boolean;
    appliesTo(roleId: string, scope: unknown, asOfDate?: Date): boolean;
    isFullDelegation(): boolean;
    isIndefinite(): boolean;
    getRemainingDays(asOfDate?: Date): number | null;
}
export {};
