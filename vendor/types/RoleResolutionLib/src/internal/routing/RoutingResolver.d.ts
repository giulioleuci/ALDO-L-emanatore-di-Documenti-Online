import type { Actor } from '../../core/Actor.js';
import type { RoleActor, RoutingOptions, RoutingParameters, RoutingChain } from '../../types.js';
import { RoutingResult } from './RoutingResult.js';
/**
 * @class RoutingResolver
 * @description Decision engine for mapping delegation chains and policies to communication buckets (primary, cc, bcc).
 */
export declare class RoutingResolver<A extends RoleActor = Actor> {
    _logger: NonNullable<RoutingOptions['logger']>;
    _defaultPolicy: string;
    /**
     * @constructor
     * @param {Object} [options={}] - Resolver configuration.
     * @param {Object} [options.logger=console] - Telemetry target.
     * @param {string} [options.defaultPolicy=RoutingPolicy.DELEGATE_ONLY] - Fallback strategy if none defined in chain.
     */
    constructor(options?: RoutingOptions);
    /**
     * @function resolve
     * @description Orchestrates actor bucket assignment based on active policy.
     * @param {Object} params - Input dataset.
     * @param {Actor} params.principalActor - Original role holder.
     * @param {Actor} [params.effectiveActor=null] - Resolved authorized entity.
     * @param {DelegationChain} [params.delegationChain=null] - Transitive hop history.
     * @param {string} [params.routingPolicy=null] - Explicit override.
     * @returns {RoutingResult} Mapped actor buckets.
     */
    resolve(params: RoutingParameters<A>): RoutingResult<A>;
    /**
     * @function _determinePolicy
     * @description Extracts policy from the final link in the delegation chain.
     * @param {DelegationChain} delegationChain - Candidate links.
     * @returns {string} RoutingPolicy enum value.
     * @private
     */
    _determinePolicy(delegationChain: RoutingChain | null): string;
    /**
     * @function _resolveByPolicy
     * @description Strategy selector for specific RoutingPolicy implementations.
     * @param {string} policy - Strategy key.
     * @param {Actor} principalActor - Origin.
     * @param {Actor} effectiveActor - Target.
     * @param {DelegationChain} delegationChain - Hops.
     * @returns {RoutingResult}
     * @private
     */
    _resolveByPolicy(policy: string, principalActor: A | null | undefined, effectiveActor: A | null, delegationChain: RoutingChain): RoutingResult<A>;
    /**
     * @function _resolveDelegateOnly
     * @private
     */
    _resolveDelegateOnly(effectiveActor: A | null): RoutingResult<A>;
    /**
     * @function _resolvePrincipalOnly
     * @private
     */
    _resolvePrincipalOnly(principalActor: A | null | undefined): RoutingResult<A>;
    /**
     * @function _resolveBothEqual
     * @private
     */
    _resolveBothEqual(principalActor: A | null | undefined, effectiveActor: A | null): RoutingResult<A>;
    /**
     * @function _resolveDelegatePrimaryPrincipalCC
     * @private
     */
    _resolveDelegatePrimaryPrincipalCC(principalActor: A | null | undefined, effectiveActor: A | null): RoutingResult<A>;
    /**
     * @function _resolvePrincipalPrimaryDelegateCC
     * @private
     */
    _resolvePrincipalPrimaryDelegateCC(principalActor: A | null | undefined, effectiveActor: A | null): RoutingResult<A>;
    /**
     * @function _resolveChainAll
     * @private
     */
    _resolveChainAll(principalActor: A | null | undefined, delegationChain: RoutingChain): RoutingResult<A>;
    /**
     * @function _resolveDelegateOrPrincipal
     * @description Delegate if resolved, otherwise the principal — a single
     * primary recipient, never both (ref REPORT_GLF.md B4: distinct from
     * DELEGATE_ONLY, which yields no recipient at all when no delegate is
     * resolved).
     * @private
     */
    _resolveDelegateOrPrincipal(principalActor: A | null | undefined, effectiveActor: A | null): RoutingResult<A>;
    /**
     * @function resolveChainAllWithActors
     * @description Specialized resolver for CHAIN_ALL that deduplicates and buckets all unique actors in a path.
     * @param {Actor[]} chainActors - Ordered array of all entities in the delegation trace.
     * @returns {RoutingResult}
     */
    resolveChainAllWithActors(chainActors: A[]): RoutingResult<A>;
    /**
     * @function getDefaultPolicy
     * @returns {string}
     */
    getDefaultPolicy(): string;
}
