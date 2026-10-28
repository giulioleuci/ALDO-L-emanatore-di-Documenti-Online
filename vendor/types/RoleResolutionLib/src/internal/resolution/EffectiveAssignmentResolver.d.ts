import type { Actor } from '../../core/Actor.js';
import type { AssignmentOverride } from '../../core/AssignmentOverride.js';
import type { Delegation } from '../delegation/Delegation.js';
import type { EffectiveResolverOptions, EffectiveResolveOptions, RoleContext, TraceEntry } from '../../types.js';
import { AssignmentCandidate } from '../../core/AssignmentCandidate.js';
import { DelegationChain } from '../delegation/DelegationChain.js';
import { EffectiveAssignmentResult } from '../../core/EffectiveAssignmentResult.js';
import { ResolutionPolicy } from './ResolutionPolicy.js';
import { ResolutionTrace } from './ResolutionTrace.js';
/** Resolves generic candidates through temporal overrides, delegation, and routing. */
export declare class EffectiveAssignmentResolver<C extends object = RoleContext, A extends Actor = Actor> {
    _actorSource: NonNullable<EffectiveResolverOptions<C, A>['actorSource']>;
    _assignmentSource: NonNullable<EffectiveResolverOptions<C, A>['assignmentSource']>;
    _overrideSource: NonNullable<EffectiveResolverOptions<C, A>['overrideSource']>;
    _delegationSource: NonNullable<EffectiveResolverOptions<C, A>['delegationSource']>;
    _policy: ResolutionPolicy;
    _routingResolver: NonNullable<EffectiveResolverOptions<C, A>['routingResolver']>;
    constructor({ actorSource, assignmentSource, overrideSource, delegationSource, policy, routingResolver }?: EffectiveResolverOptions<C, A>);
    resolve({ context, asOfDate, routingPolicy }?: EffectiveResolveOptions<C>): EffectiveAssignmentResult<A>[];
    _resolveCandidate(candidate: AssignmentCandidate, context: C, asOfDate: Date, overrides: AssignmentOverride[], routingPolicy: string | null): EffectiveAssignmentResult<A>;
    _validateOverrides(candidates: AssignmentCandidate[], overrides: AssignmentOverride[], asOfDate: Date): void;
    _selectOverrideChain(candidate: AssignmentCandidate, overrides: AssignmentOverride[], asOfDate: Date, trace: ResolutionTrace): {
        chain: AssignmentOverride[];
        finalActorId: string;
        trace: ResolutionTrace;
    };
    _selectOverrideForActor(candidate: AssignmentCandidate, actorId: string, overrides: AssignmentOverride[], asOfDate: Date, trace: ResolutionTrace): {
        override: null;
        trace: ResolutionTrace;
    } | {
        override: AssignmentOverride;
        trace: ResolutionTrace;
    };
    _resolveDelegations(permanentActor: A | null, candidate: AssignmentCandidate, context: C, asOfDate: Date, trace: ResolutionTrace): {
        chain: DelegationChain;
        effectiveActor: A;
        trace: ResolutionTrace;
    } | {
        chain: DelegationChain;
        effectiveActor: null;
        trace: ResolutionTrace;
    };
    _getOutgoingDelegations(actorId: string, context: C, asOfDate: Date): Delegation[];
    _getActor(actorId: string, candidateId: string, trace: ResolutionTrace, stage: TraceEntry['stage']): A | null;
}
