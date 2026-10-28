/**
 * @file RoleResolutionLib/index.js
 * @description Role Resolution Library - Layer 2 service for resolving abstract roles to concrete actors.
 * @version 1.0.0
 *
 * **RoleResolutionLib** is a domain-agnostic library for resolving abstract roles
 * to concrete actors, with full support for delegation chains and communication routing.
 *
 * ## Key Features
 *
 * **Role Resolution:**
 * - Resolve abstract roles (e.g., "MANAGER", "APPROVER") to concrete actors
 * - Support for multiple resolution strategies (FIRST, ALL, PRIORITY)
 * - Fallback role chains when primary role has no assignments
 * - Scope-aware resolution (GLOBAL, ORG_UNIT, PROJECT, RESOURCE, CUSTOM)
 *
 * **Delegation Management:**
 * - Full and partial role delegation
 * - Temporal delegation validity (validFrom, validTo)
 * - Scope restriction for delegations
 * - Transitive delegation chains (A → B → C)
 * - Cycle detection and depth limiting
 *
 * **Communication Routing:**
 * - Six routing policies for delegation scenarios
 * - DELEGATE_ONLY: Only the delegate receives notifications
 * - PRINCIPAL_ONLY: Only the principal receives notifications
 * - BOTH_EQUAL: Both receive notifications equally
 * - DELEGATE_PRIMARY_PRINCIPAL_CC: Delegate in TO, principal in CC
 * - PRINCIPAL_PRIMARY_DELEGATE_CC: Principal in TO, delegate in CC
 * - CHAIN_ALL: All actors in delegation chain receive notifications
 *
 * ## Architecture
 *
 * **Layer 2** library depending only on CoreUtilsLib.
 *
 * **Components:**
 * - Core: Role, Actor, Scope, Assignment, ResolutionResult
 * - Delegation: Delegation, DelegationChain, DelegationValidator
 * - Routing: RoutingPolicy, RoutingResolver, RoutingResult
 * - Resolution: RoleResolver (main engine)
 * - Registry: RoleRegistry, legacy/effective assignment sources, DelegationSource
 * - Errors: Specialized error classes
 *
 * **Data Source Abstraction:**
 * - AssignmentSource supports RoleResolver; EffectiveAssignmentSource supports
 *   EffectiveAssignmentResolver; DelegationSource is shared
 * - Implement with SheetDBLib or other persistence for production
 *
 * ## Dependencies
 *
 * - **CoreUtilsLib**: BaseError, cloneDeep, isEqual
 *
 * @module RoleResolutionLib
 * @version 1.0.0
 *
 * @example
 * // Basic role resolution
 * import {
 *   RoleResolver,
 *   RoleRegistry,
 *   Role,
 *   Actor,
 *   Scope,
 *   Assignment,
 *   ScopeType,
 *   InMemoryAssignmentSource,
 *   InMemoryDelegationSource
 * } from '@RoleResolutionLib';
 *
 * // Setup registry and sources
 * const registry = new RoleRegistry();
 * registry.register(new Role({
 *   id: 'DEPT_MANAGER',
 *   name: 'Department Manager',
 *   scopeType: ScopeType.ORG_UNIT,
 *   allowsDelegation: true
 * }));
 *
 * const manager = Actor.person('user-123', 'manager@example.test', 'Department Manager');
 * const assignmentSource = new InMemoryAssignmentSource({
 *   actors: [manager],
 *   assignments: [new Assignment({
 *     roleId: 'DEPT_MANAGER',
 *     actorId: manager.id,
 *     scope: Scope.orgUnit('Sales')
 *   })]
 * });
 *
 * const delegationSource = new InMemoryDelegationSource();
 *
 * // Create resolver and resolve
 * const resolver = new RoleResolver(registry, assignmentSource, delegationSource);
 * const result = resolver.resolve('DEPT_MANAGER', Scope.orgUnit('Sales'));
 *
 * if (result.isResolved()) {
 *   console.log('Manager:', result.effectiveActor.displayName);
 *   console.log('Notify:', result.routing.primary.map(a => a.identifier));
 * }
 *
 * @example
 * // Resolution with delegation
 * import { Delegation, RoutingPolicy } from '@RoleResolutionLib';
 *
 * // Add delegation
 * delegationSource.addDelegation(new Delegation({
 *   id: 'del-001',
 *   principalId: 'user-123',
 *   delegateId: 'user-456',
 *   roleIds: '*',
 *   validFrom: new Date('2025-01-01'),
 *   validTo: new Date('2025-01-31'),
 *   routingPolicy: RoutingPolicy.DELEGATE_PRIMARY_PRINCIPAL_CC,
 *   reason: 'Vacation'
 * }));
 *
 * // Resolve - will find delegate
 * const result = resolver.resolve('DEPT_MANAGER', Scope.orgUnit('Sales'));
 * console.log('Principal:', result.principalActor.displayName); // John Doe
 * console.log('Effective:', result.effectiveActor.displayName); // Delegate's name
 * console.log('Delegated:', result.isDelegated()); // true
 *
 * @see RoleResolver For the main resolution engine
 * @see RoleRegistry For role definition management
 * @see Delegation For delegation model
 * @see RoutingPolicy For routing options
 */
export { splitCsvList, groupMateriaEntriesBySlot, slotCompatible, pairsOverlap } from './src/utils/MateriaSlotParsing.js';
export { ScopeType, isValidScopeType, getScopeTypes } from './src/core/ScopeType.js';
export { ActorType, isValidActorType, getActorTypes } from './src/core/ActorType.js';
export { ResolutionStrategy, isValidResolutionStrategy, getResolutionStrategies } from './src/core/ResolutionStrategy.js';
export { Scope } from './src/core/Scope.js';
export { Actor } from './src/core/Actor.js';
export { Role } from './src/core/Role.js';
export { Assignment } from './src/core/Assignment.js';
export { ResolutionResult } from './src/core/ResolutionResult.js';
export { AssignmentSlot } from './src/core/AssignmentSlot.js';
export { AssignmentCandidate } from './src/core/AssignmentCandidate.js';
export { AssignmentOverride } from './src/core/AssignmentOverride.js';
export { EffectiveAssignmentResult } from './src/core/EffectiveAssignmentResult.js';
export { Delegation } from './src/internal/delegation/Delegation.js';
export { DelegationChain } from './src/internal/delegation/DelegationChain.js';
export { DelegationValidator } from './src/internal/delegation/DelegationValidator.js';
export { RoutingPolicy, isValidRoutingPolicy, getRoutingPolicies, getRoutingPolicyDescription } from './src/internal/routing/RoutingPolicy.js';
export { RoutingResult } from './src/internal/routing/RoutingResult.js';
export { RoutingResolver } from './src/internal/routing/RoutingResolver.js';
export { RoleRegistry } from './src/registry/RoleRegistry.js';
export { DelegationSource, InMemoryDelegationSource } from './src/registry/DelegationSource.js';
export { AssignmentSource, InMemoryAssignmentSource } from './src/registry/AssignmentSource.js';
export { EffectiveAssignmentSource, ActorSource, OverrideSource } from './src/registry/EffectiveAssignmentSource.js';
export { WideRowAssignmentSource, MappedOverrideSource, MappedDelegationSource, CompositeAssignmentSource } from './src/registry/MappedAssignmentSources.js';
export { RoleResolver } from './src/internal/resolution/RoleResolver.js';
export { ResolutionPolicy } from './src/internal/resolution/ResolutionPolicy.js';
export { ResolutionTrace } from './src/internal/resolution/ResolutionTrace.js';
export { EffectiveAssignmentResolver } from './src/internal/resolution/EffectiveAssignmentResolver.js';
export { RoleResolutionError, RoleNotFoundError, NoActorFoundError, CircularDelegationError, InvalidScopeError, DelegationDepthExceededError, RoleValidationError, MalformedAssignmentSlotError, DuplicateAssignmentSlotError, InconsistentAssignmentOverrideError, AmbiguousAssignmentOverrideError, AssignmentActorNotFoundError, OverlappingDelegationError, CircularAssignmentOverrideError, OverrideChainDepthExceededError } from './src/internal/errors/RoleResolutionError.js';
export type * from './src/types.js';
export type { ActorTypeValue } from './src/core/ActorType.js';
export type { ScopeTypeValue } from './src/core/ScopeType.js';
export type { ResolutionStrategyValue } from './src/core/ResolutionStrategy.js';
export type { RoutingPolicyValue } from './src/internal/routing/RoutingPolicy.js';
