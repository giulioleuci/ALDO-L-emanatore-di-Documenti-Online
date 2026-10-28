import type { RoleLogger, DelegationValidationContext, ValidationResult } from '../../types.js';
/**
 * @file RoleResolutionLib/src/delegation/DelegationValidator.js
 * @description Validator for delegations and delegation chains.
 * @version 1.0.0
 */
import { Delegation } from './Delegation.js';
import { DelegationChain } from './DelegationChain.js';
/**
 * @class DelegationValidator
 * @description Logic engine for enforcing constraints (cycles, depth, temporal, scope) on delegations and chains.
 */
export declare class DelegationValidator {
    _maxDelegationDepth: number;
    _logger: RoleLogger;
    /**
     * @constructor
     * @param {Object} [options={}] - Validator configuration.
     * @param {number} [options.maxDelegationDepth=10] - Threshold for transitive delegation chain length.
     * @param {Object} [options.logger=console] - Output channel for validation telemetry.
     */
    constructor(options?: {
        maxDelegationDepth?: number;
        logger?: RoleLogger;
    });
    /**
     * @function validate
     * @description Validates structural integrity, temporal constraints, and actor/role existence.
     * @param {Delegation} delegation - Target for validation.
     * @param {Object} [context={}] - External registry checks (actorExists, roleExists).
     * @returns {Object} {isValid: boolean, errors: string[], warnings: string[]}
     */
    validate(delegation: unknown, context?: DelegationValidationContext): ValidationResult;
    /**
     * @function validateChain
     * @description Comprehensive chain check including depth limits, cycles, linkage, and scope coherence.
     * @param {DelegationChain} chain - Target for validation.
     * @param {Object} [context={}] - External registry checks.
     * @returns {Object} {isValid: boolean, errors: string[], warnings: string[]}
     */
    validateChain(chain: unknown, context?: DelegationValidationContext): ValidationResult;
    /**
     * @function _detectCycle
     * @description Scans actor IDs for duplicates indicating a loop.
     * @param {DelegationChain} chain - Target for inspection.
     * @returns {Object} {hasCycle: boolean, cycleDescription: string|null}
     * @private
     */
    _detectCycle(chain: DelegationChain): {
        hasCycle: boolean;
        cycleDescription: string;
    } | {
        hasCycle: boolean;
        cycleDescription: null;
    };
    /**
     * @function _checkScopeCoherence
     * @description Warns if scope restrictions are not progressively narrower or equal.
     * @param {DelegationChain} chain - Target for inspection.
     * @returns {string[]} Warning messages.
     * @private
     */
    _checkScopeCoherence(chain: DelegationChain): string[];
    /**
     * @function validateExtension
     * @description Speculative validation before extending a chain with a new segment.
     * @param {DelegationChain} chain - Base chain.
     * @param {Delegation} delegation - Proposed new segment.
     * @param {Object} [context={}] - External registry checks.
     * @returns {Object} {isValid: boolean, errors: string[], warnings: string[]}
     */
    validateExtension(chain: DelegationChain, delegation: Delegation, context?: DelegationValidationContext): ValidationResult;
    /**
     * @function getMaxDelegationDepth
     * @returns {number}
     */
    getMaxDelegationDepth(): number;
}
