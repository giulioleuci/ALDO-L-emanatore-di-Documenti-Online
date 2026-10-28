import type { RoleMetadata } from '../../types.js';
/**
 * @file RoleResolutionLib/src/errors/RoleResolutionError.js
 * @description Base error class and specialized errors for role resolution.
 * @version 1.0.0
 */
import { BaseError } from '@CoreUtilsLib';
/**
 * @class RoleResolutionError
 * @extends BaseError
 * @description Base exception for all role-related lookup and assignment failures.
 */
export declare class RoleResolutionError extends BaseError {
    resolutionTrace?: import('../resolution/ResolutionTrace.js').ResolutionTrace;
    /**
     * @constructor
     * @param {string} message - Error details.
     * @param {Object} [context={}] - Metadata (roleId, scope, etc.).
     * @param {Error} [originalError=null] - Wrapped exception.
     */
    constructor(message: string, context?: RoleMetadata, originalError?: Error | null);
}
/**
 * @class RoleNotFoundError
 * @extends RoleResolutionError
 * @description Thrown when a role ID is missing from the registry.
 */
export declare class RoleNotFoundError extends RoleResolutionError {
    roleId: string;
    /**
     * @constructor
     * @param {string} roleId - The unknown role identifier.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(roleId: string, context?: RoleMetadata);
}
/**
 * @class NoActorFoundError
 * @extends RoleResolutionError
 * @description Thrown when resolution logic yields an empty set for a role/scope.
 */
export declare class NoActorFoundError extends RoleResolutionError {
    roleId: string;
    scope: object | null;
    /**
     * @constructor
     * @param {string} roleId - Queried role.
     * @param {Object} [scope=null] - Searched scope instance.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(roleId: string, scope?: object | null, context?: RoleMetadata);
}
/**
 * @class CircularDelegationError
 * @extends RoleResolutionError
 * @description Thrown when a loop is detected in the delegation graph.
 */
export declare class CircularDelegationError extends RoleResolutionError {
    actorId: string;
    chain: string[];
    /**
     * @constructor
     * @param {string} actorId - Actor causing the cycle.
     * @param {string[]} [chain=[]] - Trace of IDs forming the cycle.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(actorId: string, chain?: string[], context?: RoleMetadata);
}
/**
 * @class InvalidScopeError
 * @extends RoleResolutionError
 * @description Thrown when a provided scope type is incompatible with role requirements.
 */
export declare class InvalidScopeError extends RoleResolutionError {
    roleId: string;
    providedScopeType: string | undefined;
    expectedScopeType: string;
    /**
     * @constructor
     * @param {string} roleId - Role under query.
     * @param {string} providedScopeType - Actual scope level.
     * @param {string} expectedScopeType - Required scope level.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(roleId: string, providedScopeType: string | undefined, expectedScopeType: string, context?: RoleMetadata);
}
/**
 * @class DelegationDepthExceededError
 * @extends RoleResolutionError
 * @description Thrown when a chain exceeds safety limits (default 10).
 */
export declare class DelegationDepthExceededError extends RoleResolutionError {
    actualDepth: number;
    maxDepth: number;
    /**
     * @constructor
     * @param {number} actualDepth - Chain length detected.
     * @param {number} maxDepth - Allowed threshold.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(actualDepth: number, maxDepth: number, context?: RoleMetadata);
}
/**
 * @class RoleValidationError
 * @extends RoleResolutionError
 * @description Thrown when role or actor definition schemas are violated.
 */
export declare class RoleValidationError extends RoleResolutionError {
    validationErrors: string[];
    /**
     * @constructor
     * @param {string} message - High-level failure reason.
     * @param {string[]} [errors=[]] - Detailed list of violations.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(message: string, errors?: string[], context?: RoleMetadata);
}
/** @class MalformedAssignmentSlotError @extends RoleResolutionError */
export declare class MalformedAssignmentSlotError extends RoleResolutionError {
    constructor(message: string, context?: RoleMetadata);
}
/** @class DuplicateAssignmentSlotError @extends RoleResolutionError */
export declare class DuplicateAssignmentSlotError extends RoleResolutionError {
    slotKey: string;
    constructor(slotKey: string, context?: RoleMetadata);
}
/** @class InconsistentAssignmentOverrideError @extends RoleResolutionError */
export declare class InconsistentAssignmentOverrideError extends RoleResolutionError {
    constructor(message: string, context?: RoleMetadata);
}
/** @class AmbiguousAssignmentOverrideError @extends RoleResolutionError */
export declare class AmbiguousAssignmentOverrideError extends RoleResolutionError {
    candidateId: string;
    overrideIds: readonly string[];
    constructor(candidateId: string, overrideIds?: string[], context?: RoleMetadata);
}
/** @class AssignmentActorNotFoundError @extends RoleResolutionError */
export declare class AssignmentActorNotFoundError extends RoleResolutionError {
    actorId: string;
    constructor(actorId: string, context?: RoleMetadata);
}
/** @class OverlappingDelegationError @extends RoleResolutionError */
export declare class OverlappingDelegationError extends RoleResolutionError {
    actorId: string;
    constructor(actorId: string, context?: RoleMetadata);
}
/**
 * @class CircularAssignmentOverrideError
 * @extends RoleResolutionError
 * @description Thrown when a loop is detected while walking an override chain.
 */
export declare class CircularAssignmentOverrideError extends RoleResolutionError {
    actorId: string;
    chain: string[];
    /**
     * @constructor
     * @param {string} actorId - Actor causing the cycle.
     * @param {string[]} [chain=[]] - Visited actor ids forming the cycle.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(actorId: string, chain?: string[], context?: RoleMetadata);
}
/**
 * @class OverrideChainDepthExceededError
 * @extends RoleResolutionError
 * @description Thrown when an override chain exceeds the configured maximum depth.
 */
export declare class OverrideChainDepthExceededError extends RoleResolutionError {
    actualDepth: number;
    maxDepth: number;
    /**
     * @constructor
     * @param {number} actualDepth - Chain length detected.
     * @param {number} maxDepth - Allowed threshold.
     * @param {Object} [context={}] - Additional metadata.
     */
    constructor(actualDepth: number, maxDepth: number, context?: RoleMetadata);
}
