export type RoutingPolicyValue = (typeof RoutingPolicy)[keyof typeof RoutingPolicy];
/**
 * @file RoleResolutionLib/src/routing/RoutingPolicy.js
 * @description Enumeration of routing policies for delegation communications.
 * @version 1.0.0
 */
/**
 * @enum {string}
 * @readonly
 * @description Logic for determining notification targets during active delegations.
 */
export declare const RoutingPolicy: Readonly<{
    /** Delegate only (mute principal). */
    DELEGATE_ONLY: "DELEGATE_ONLY";
    /** Principal only (ignore delegation). */
    PRINCIPAL_ONLY: "PRINCIPAL_ONLY";
    /** Both entities receive identical primary notification. */
    BOTH_EQUAL: "BOTH_EQUAL";
    /** Delegate as primary (TO), principal as informational (CC). */
    DELEGATE_PRIMARY_PRINCIPAL_CC: "DELEGATE_PRIMARY_PRINCIPAL_CC";
    /** Principal as primary (TO), delegate as informational (CC). */
    PRINCIPAL_PRIMARY_DELEGATE_CC: "PRINCIPAL_PRIMARY_DELEGATE_CC";
    /** Broadcast to all actors in transitive chain (A -> B -> C). */
    CHAIN_ALL: "CHAIN_ALL";
    /** Delegate if one is resolved, otherwise the principal (single recipient, no CC). */
    DELEGATE_OR_PRINCIPAL: "DELEGATE_OR_PRINCIPAL";
}>;
/**
 * @function isValidRoutingPolicy
 * @description Validates if a string is a recognized RoutingPolicy.
 * @param {string} value - String to validate.
 * @returns {boolean} True if value exists in RoutingPolicy.
 */
export declare function isValidRoutingPolicy(value: unknown): value is RoutingPolicyValue;
/**
 * @function getRoutingPolicies
 * @description Retrieves all supported policy strings.
 * @returns {string[]} Array of RoutingPolicy values.
 */
export declare function getRoutingPolicies(): ("DELEGATE_ONLY" | "PRINCIPAL_ONLY" | "BOTH_EQUAL" | "DELEGATE_PRIMARY_PRINCIPAL_CC" | "PRINCIPAL_PRIMARY_DELEGATE_CC" | "CHAIN_ALL" | "DELEGATE_OR_PRINCIPAL")[];
/**
 * @function getRoutingPolicyDescription
 * @description Maps enum key to functional human-readable label.
 * @param {string} policy - Enum value.
 * @returns {string} Narrative description.
 */
export declare function getRoutingPolicyDescription(policy: unknown): string;
