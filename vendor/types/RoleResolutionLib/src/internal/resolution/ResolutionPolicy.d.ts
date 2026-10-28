import type { RoutingPolicyValue } from '../routing/RoutingPolicy.js';
import type { ResolutionPolicyOptions } from '../../types.js';
/** Immutable policy options for effective-assignment resolution. */
export declare class ResolutionPolicy {
    readonly tieBehavior: 'THROW' | 'FIRST';
    readonly missingActorBehavior: 'THROW' | 'NULL';
    readonly maxDelegationDepth: number | null;
    readonly maxOverrideChainDepth: number | null;
    readonly routingPolicy: RoutingPolicyValue;
    readonly resultIdentity: readonly string[];
    constructor({ tieBehavior, missingActorBehavior, maxDelegationDepth, maxOverrideChainDepth, routingPolicy, resultIdentity }?: ResolutionPolicyOptions);
    toJSON(): {
        tieBehavior: "FIRST" | "THROW";
        missingActorBehavior: "THROW" | "NULL";
        maxDelegationDepth: number | null;
        maxOverrideChainDepth: number | null;
        routingPolicy: RoutingPolicyValue;
        resultIdentity: string[];
    };
}
