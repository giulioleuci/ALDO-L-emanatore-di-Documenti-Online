import type { ImmutableValue } from '../types.js';
import type { EffectiveResultData } from '../types.js';
import { Actor } from './Actor.js';
import { AssignmentSlot } from './AssignmentSlot.js';
import { DelegationChain } from '../internal/delegation/DelegationChain.js';
import { ResolutionTrace } from '../internal/resolution/ResolutionTrace.js';
/** Immutable outcome of resolving a base assignment through overrides and delegation. */
export declare class EffectiveAssignmentResult<A extends Actor = Actor> {
    readonly slot: AssignmentSlot;
    readonly baseActor: A | null;
    readonly permanentActor: A | null;
    readonly effectiveActor: A | null;
    readonly delegationChain: DelegationChain;
    readonly routing: ImmutableValue<NonNullable<EffectiveResultData<A>['routing']>> | null;
    readonly trace: ResolutionTrace;
    readonly metadata: Readonly<Record<string, unknown>>;
    constructor({ slot, baseActor, permanentActor, effectiveActor, delegationChain, routing, trace, metadata }?: EffectiveResultData<A>);
    toJSON(): {
        slot: {
            dimensions: {
                [x: string]: import("../types.js").DimensionValue;
            };
        };
        baseActor: unknown;
        permanentActor: unknown;
        effectiveActor: unknown;
        delegationChain: {
            delegations: {
                id: string;
                principalId: string;
                delegateId: string;
                roleIds: string | string[];
                scope: {
                    type: import("./ScopeType.js").ScopeTypeValue;
                    value: unknown;
                    hierarchy: string[];
                } | null;
                scopeRestriction: {
                    type: import("./ScopeType.js").ScopeTypeValue;
                    value: unknown;
                    hierarchy: string[];
                } | null;
                validFrom: string;
                validTo: string | null;
                routingPolicy: import("../../index.js").RoutingPolicyValue;
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
        routing: unknown;
        trace: {
            metadata: {
                [x: string]: unknown;
            };
            stage: "BASE" | "OVERRIDE" | "DELEGATION" | "ROUTING";
            decision: "CONSIDERED" | "REJECTED" | "SELECTED" | "APPLIED";
            candidateId: string | null;
            actorId: string | null;
            reason: string;
        }[];
        metadata: {
            [x: string]: unknown;
        };
    };
}
