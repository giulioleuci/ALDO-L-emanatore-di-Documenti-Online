import type { Actor } from './core/Actor.js';
import type { Scope } from './core/Scope.js';
import type { ScopeTypeValue as ScopeType } from './core/ScopeType.js';
import type { ResolutionStrategyValue as ResolutionStrategy } from './core/ResolutionStrategy.js';
import type { Assignment } from './core/Assignment.js';
import type { AssignmentSlot } from './core/AssignmentSlot.js';
import type { AssignmentCandidate } from './core/AssignmentCandidate.js';
import type { AssignmentOverride } from './core/AssignmentOverride.js';
import type { Delegation } from './internal/delegation/Delegation.js';
import type { DelegationChain } from './internal/delegation/DelegationChain.js';
import type { RoutingPolicyValue as RoutingPolicy } from './internal/routing/RoutingPolicy.js';
import type { RoutingResolver } from './internal/routing/RoutingResolver.js';
import type { RoutingResult } from './internal/routing/RoutingResult.js';
import type { ResolutionPolicy } from './internal/resolution/ResolutionPolicy.js';
import type { ResolutionTrace } from './internal/resolution/ResolutionTrace.js';
export type RoleMetadata = Record<string, unknown>;
export type RoleContext = Record<string, unknown>;
export type DimensionValue = string | number | boolean | null;
export type SlotDimensions = Record<string, DimensionValue>;
export interface ScopeDefinition {
    type?: ScopeType;
    value?: unknown;
    hierarchy?: string[];
}
export interface RoleDefinition {
    id?: string;
    name?: string;
    description?: string;
    scopeType?: ScopeType;
    resolutionStrategy?: ResolutionStrategy;
    allowsDelegation?: boolean;
    fallbackRoles?: string[];
    metadata?: RoleMetadata;
}
export interface AssignmentDefinition {
    id?: string;
    roleId?: string;
    actorId?: string;
    scope?: Scope | ScopeDefinition;
    priority?: number;
    validFrom?: unknown;
    validTo?: unknown;
    isActive?: boolean;
    metadata?: RoleMetadata;
}
export interface AssignmentSlotDefinition {
    dimensions?: Record<string, unknown>;
}
export interface AssignmentCandidateDefinition {
    id?: unknown;
    actorId?: unknown;
    slot?: AssignmentSlot | AssignmentSlotDefinition;
    validFrom?: unknown;
    validTo?: unknown;
    source?: unknown;
    priority?: number;
    metadata?: RoleMetadata;
}
export interface AssignmentOverrideDefinition {
    id?: unknown;
    previousActorId?: unknown;
    nextActorId?: unknown;
    slotScope?: Record<string, unknown>;
    effectiveFrom?: unknown;
    source?: unknown;
    metadata?: RoleMetadata;
}
export interface DelegationDefinition {
    id?: unknown;
    principalId?: unknown;
    delegateId?: unknown;
    roleIds?: string[] | '*';
    scope?: Scope | ScopeDefinition | null;
    scopeRestriction?: Scope | ScopeDefinition | null;
    validFrom?: unknown;
    validTo?: unknown;
    routingPolicy?: RoutingPolicy;
    isActive?: boolean;
    reason?: unknown;
    metadata?: RoleMetadata;
}
export interface RoleLogger {
    debug?(message: string, ...context: unknown[]): unknown;
    warn(message: string, ...context: unknown[]): unknown;
}
export interface RoleActor {
    id: string;
    identifier?: string;
    displayName?: string;
    toJSON?(): unknown;
}
export type Serialized<T> = T extends {
    toJSON(): infer Result;
} ? Result : T;
export type ImmutableValue<T> = T extends Date ? string : T extends (...args: never[]) => unknown ? T : T extends object ? {
    readonly [K in keyof T]: ImmutableValue<T[K]>;
} : T;
export interface RoutingBuckets<A extends RoleActor = Actor> {
    primary: A[];
    cc: A[];
    bcc: A[];
}
export interface RoutingResultData<A extends RoleActor = Actor> extends Partial<RoutingBuckets<A>> {
    metadata?: RoleMetadata;
}
export interface RoutingOptions {
    logger?: Pick<RoleLogger, 'warn'>;
    defaultPolicy?: string;
}
export type RoutingChain = Pick<DelegationChain, 'isEmpty' | 'getLast' | 'getAllActorIds'>;
export interface RoutingParameters<A extends RoleActor = Actor> {
    principalActor?: A | null;
    effectiveActor?: A | null;
    delegationChain?: RoutingChain | null;
    routingPolicy?: string | null;
}
export interface ResolutionResultData<A extends RoleActor = Actor> {
    requestedRole?: {
        id?: string;
        name?: string;
        toJSON?(): unknown;
    };
    scope?: object & {
        toJSON?(): unknown;
    };
    effectiveActor?: A | null;
    principalActor?: A | null;
    allActors?: A[];
    delegationChain?: unknown[];
    routing?: Partial<RoutingBuckets<RoleActor>>;
    metadata?: RoleMetadata;
    fallbackUsed?: boolean;
    fallbackRoleId?: string | null;
}
export interface LegacyAssignmentSource<A extends RoleActor = Actor> {
    getAssignmentsForRole(roleId: string, scope: Scope, asOfDate?: Date): Assignment[];
    getAssignmentsForActor(actorId: string, asOfDate?: Date): Assignment[];
    getActorById(actorId: string): A | null | undefined;
}
export interface LegacyDelegationSource {
    getDelegationChain(actorId: string, roleId: string, scope: Scope, asOfDate?: Date): Delegation[];
    getActiveDelegationsForDelegate(actorId: string, asOfDate?: Date): Delegation[];
}
export interface RoleResolverOptions {
    logger?: RoleLogger;
    defaultRoutingPolicy?: string;
    maxDelegationDepth?: number;
    throwOnNotFound?: boolean;
}
export interface RoleResolveOptions {
    asOfDate?: Date;
    routingPolicy?: string | null;
    includeFallbacks?: boolean;
}
export interface ActorResolveOptions {
    asOfDate?: Date;
    includeReceivedDelegations?: boolean;
}
export interface DelegationValidationContext {
    actorExists?(actorId: string): boolean;
    roleExists?(roleId: string): boolean;
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
export interface ResolutionPolicyOptions {
    tieBehavior?: 'THROW' | 'FIRST';
    missingActorBehavior?: 'THROW' | 'NULL';
    maxDelegationDepth?: number | null;
    maxOverrideChainDepth?: number | null;
    routingPolicy?: RoutingPolicy;
    resultIdentity?: string[];
}
export interface TraceEntry {
    stage: 'BASE' | 'OVERRIDE' | 'DELEGATION' | 'ROUTING';
    decision: 'CONSIDERED' | 'REJECTED' | 'SELECTED' | 'APPLIED';
    candidateId?: string | null;
    actorId?: string | null;
    reason: string;
    metadata?: RoleMetadata;
}
export interface EffectiveActorSource<A extends Actor = Actor> {
    getActor(actorId: string): A | null | undefined;
}
export interface AssignmentCandidateRecord {
    id: string;
    actorId: string;
    slot: {
        key: string;
    };
    metadata?: RoleMetadata;
}
export interface EffectiveAssignments<C extends object = RoleContext, T extends AssignmentCandidateRecord = AssignmentCandidate> {
    getAssignments(context: C, asOfDate: Date): T[];
}
export interface EffectiveOverrides<C extends object = RoleContext> {
    getOverrides(context: C, asOfDate: Date): AssignmentOverride[];
}
export type EffectiveDelegations<C extends object = RoleContext> = {
    getDelegations(context: C, asOfDate: Date): Delegation[];
    getActiveDelegationsForPrincipal?(actorId: string, asOfDate: Date): Delegation[];
} | {
    getDelegations?: never;
    getActiveDelegationsForPrincipal(actorId: string, asOfDate: Date): Delegation[];
};
export interface EffectiveResolverOptions<C extends object = RoleContext, A extends Actor = Actor> {
    actorSource?: EffectiveActorSource<A>;
    assignmentSource?: EffectiveAssignments<C, AssignmentCandidateRecord>;
    overrideSource?: EffectiveOverrides<C>;
    delegationSource?: EffectiveDelegations<C>;
    policy?: ResolutionPolicy;
    routingResolver?: Pick<RoutingResolver<A>, 'resolve'>;
}
export interface EffectiveResolveOptions<C extends object = RoleContext> {
    context?: C;
    asOfDate?: Date;
    routingPolicy?: string | null;
}
export interface EffectiveResultData<A extends Actor = Actor> {
    slot?: AssignmentSlot;
    baseActor?: A | null;
    permanentActor?: A | null;
    effectiveActor?: A | null;
    delegationChain?: DelegationChain;
    routing?: RoutingResult<A> | RoutingResultData<A> | null;
    trace?: ResolutionTrace;
    metadata?: RoleMetadata;
}
export type RowProvider<Row extends object, C extends object> = Row[] | ((context: C) => Row[]) | undefined;
export type DimensionMapping = Record<string, unknown>;
export interface WideRowColumn {
    name: string;
    contextDimensions?: DimensionMapping;
    slotDimensions?: DimensionMapping;
}
export interface WideRowSourceOptions<Row extends object, C extends object> {
    rows?: RowProvider<Row, C>;
    rowIdentityPath?: string;
    actorSource?: EffectiveActorSource;
    columns?: WideRowColumn[];
    csv?: boolean;
}
export interface MappedSourceOptions<Row extends object, C extends object> {
    rows?: RowProvider<Row, C>;
    mapping?: Record<string, unknown> & {
        scope?: DimensionMapping;
    };
}
export interface CompositeSourceOptions<C extends object, T extends AssignmentCandidateRecord = AssignmentCandidate> {
    sources?: EffectiveAssignments<C, T>[];
    identity?: string[];
    mergeMetadata?(left: RoleMetadata, right: RoleMetadata): RoleMetadata;
}
