import type { Actor } from '../../core/Actor.js';
import type { Role } from '../../core/Role.js';
import type { Scope } from '../../core/Scope.js';
import type { Assignment } from '../../core/Assignment.js';
import type { RoleRegistry } from '../../registry/RoleRegistry.js';
import type { RoleActor, LegacyAssignmentSource, LegacyDelegationSource, RoleResolverOptions, RoleResolveOptions, ActorResolveOptions } from '../../types.js';
/**
 * @file RoleResolutionLib/src/resolution/RoleResolver.js
 * @description Main role resolution engine.
 * @version 1.0.0
 */
import { ResolutionResult } from '../../core/ResolutionResult.js';
import { DelegationChain } from '../delegation/DelegationChain.js';
import { RoutingResolver } from '../routing/RoutingResolver.js';
/**
 * @class RoleResolver
 * @description Central orchestration engine for mapping roles to actors via assignments, fallbacks, and transitive delegations.
 */
export declare class RoleResolver<A extends RoleActor = Actor> {
    _roleRegistry: Pick<RoleRegistry, 'get' | 'getOrNull' | 'getAllIds'>;
    _assignmentSource: LegacyAssignmentSource<A>;
    _delegationSource: LegacyDelegationSource;
    _logger: NonNullable<RoleResolverOptions['logger']>;
    _defaultRoutingPolicy: string;
    _maxDelegationDepth: number;
    _throwOnNotFound: boolean;
    _routingResolver: RoutingResolver<A>;
    /**
     * @constructor
     * @param {RoleRegistry} roleRegistry - CRUD store for role definitions.
     * @param {AssignmentSource} assignmentSource - Persistence layer for role-actor bindings.
     * @param {DelegationSource} delegationSource - Persistence layer for responsibility transfers.
     * @param {Object} [options={}] - Engine configuration.
     * @param {Object} [options.logger=console] - Telemetry target.
     * @param {string} [options.defaultRoutingPolicy=RoutingPolicy.DELEGATE_ONLY] - Fallback routing strategy.
     * @param {number} [options.maxDelegationDepth=10] - Safety threshold for transitive hops.
     * @param {boolean} [options.throwOnNotFound=false] - If true, failed resolution triggers NoActorFoundError.
     * @throws {Error} If registries/sources are missing.
     */
    constructor(roleRegistry: Pick<RoleRegistry, 'get' | 'getOrNull' | 'getAllIds'> | null | undefined, assignmentSource: LegacyAssignmentSource<A> | null | undefined, delegationSource: LegacyDelegationSource | null | undefined, options?: RoleResolverOptions);
    /**
     * @function resolve
     * @description Orchestrates the 10-step resolution flow: lookup -> validate scope -> find assignments -> apply strategy -> fallbacks -> resolve actors -> resolve delegation -> resolve routing -> return result.
     * @param {string} roleId - Target role key.
     * @param {Scope} scope - Context boundary.
     * @param {Object} [options={}] - Per-request overrides.
     * @param {Date} [options.asOfDate=new Date()] - Temporal validity point.
     * @param {string} [options.routingPolicy=null] - Strategy override.
     * @param {boolean} [options.includeFallbacks=true] - Toggle recursive fallback lookup.
     * @returns {ResolutionResult} Full resolution payload.
     * @throws {RoleNotFoundError} If roleId is unregistered.
     * @throws {NoActorFoundError} If resolution fails and throwOnNotFound is true.
     * @throws {InvalidScopeError} If scope violates role definition.
     */
    resolve(roleId: string, scope: Scope, options?: RoleResolveOptions): ResolutionResult<A>;
    /**
     * @function resolveMultiple
     * @description Batch resolution. Fails safe by returning empty results for specific role errors.
     * @param {string[]} roleIds - Role IDs.
     * @param {Scope} scope - Shared scope.
     * @param {Object} [options={}] - Resolution options.
     * @returns {Map<string, ResolutionResult>}
     */
    resolveMultiple(roleIds: string[], scope: Scope, options?: RoleResolveOptions): Map<string, ResolutionResult<A>>;
    /**
     * @function resolveForActor
     * @description Reverse lookup: identifies all roles (direct and via delegation) held by an actor.
     * @param {string} actorId - ID to inspect.
     * @param {Scope} scope - Context for filtering.
     * @param {Object} [options={}] - Configuration.
     * @returns {Object} {actor, roles, effectiveRoles, assignmentCount}
     */
    resolveForActor(actorId: string, scope: Scope, options?: ActorResolveOptions): {
        actor: A | null | undefined;
        roles: Role[];
        effectiveRoles: Role[];
        assignmentCount: number;
    };
    /**
     * @function getRoutingFor
     * @description Convenience method for simple notification routing without full audit data.
     * @param {string} roleId - Role ID.
     * @param {Scope} scope - Context.
     * @param {Object} [options={}] - Options.
     * @returns {Object} {primary, cc, bcc} arrays of actors.
     */
    getRoutingFor(roleId: string, scope: Scope, options?: RoleResolveOptions): {
        primary: RoleActor[];
        cc: RoleActor[];
        bcc: RoleActor[];
    };
    /**
     * @function _validateScope
     * @description Internal scope constraint enforcement.
     * @param {Role} role - Definition.
     * @param {Scope} scope - Input.
     * @throws {InvalidScopeError} On mismatch.
     * @private
     */
    _validateScope(role: Role, scope: Scope): void;
    /**
     * @function _applyResolutionStrategy
     * @description Internal filtering based on Role strategy.
     * @param {Assignment[]} assignments - Candidates.
     * @param {string} strategy - Algorithm key.
     * @returns {Assignment[]} Filtered/sorted subset.
     * @private
     */
    _applyResolutionStrategy(assignments: Assignment[], strategy: string): Assignment[];
    /**
     * @function _resolveDelegationChain
     * @description Transitive delegate lookup with depth protection.
     * @param {Actor} actor - Principal.
     * @param {string} roleId - Filter.
     * @param {Scope} scope - Filter.
     * @param {Date} asOfDate - Validity.
     * @returns {Object} {effectiveActor, chain}
     * @throws {DelegationDepthExceededError} If limit reached.
     * @private
     */
    _resolveDelegationChain(actor: A, roleId: string, scope: Scope, asOfDate: Date): {
        effectiveActor: A;
        chain: DelegationChain;
    };
    /**
     * @function _getEffectiveRoutingPolicy
     * @description Extracts policy from chain (last segment preferred).
     * @param {DelegationChain} chain - Resolved path.
     * @returns {string}
     * @private
     */
    _getEffectiveRoutingPolicy(chain: DelegationChain): string;
    /**
     * @function _getActorsFromChain
     * @description Deduplicated traversal of chain to retrieve Actor instances.
     * @param {Actor} principalActor - Initial entity.
     * @param {DelegationChain} chain - Resolved path.
     * @returns {Actor[]}
     * @private
     */
    _getActorsFromChain(principalActor: A, chain: DelegationChain): A[];
}
