import type { Actor } from '../core/Actor.js';
import type { Assignment } from '../core/Assignment.js';
import type { Scope } from '../core/Scope.js';
import type { RoleActor } from '../types.js';
/**
 * @file RoleResolutionLib/src/registry/AssignmentSource.js
 * @description Interface definition for assignment data sources.
 * @version 1.0.0
 */
/**
 * @interface AssignmentSource
 * @description Contract for persistence layers providing role assignments and actor metadata.
 */
export declare class AssignmentSource<A extends RoleActor = Actor> {
    /**
     * @function getAssignmentsForRole
     * @description Fetches active assignments for a role within a scope at a given time.
     * @param {string} roleId - Role to query.
     * @param {Scope} scope - Context boundary.
     * @param {Date} [asOfDate=new Date()] - Temporal validity point.
     * @returns {Assignment[]}
     * @abstract
     */
    getAssignmentsForRole(roleId: string, scope: Scope, asOfDate?: Date): Assignment[];
    /**
     * @function getAssignmentsForActor
     * @description Retrieves all roles currently held by a specific actor.
     * @param {string} actorId - Target actor ID.
     * @param {Date} [asOfDate=new Date()] - Temporal validity point.
     * @returns {Assignment[]}
     * @abstract
     */
    getAssignmentsForActor(actorId: string, asOfDate?: Date): Assignment[];
    /**
     * @function getActorById
     * @description Resolves actor metadata (type, identifier, displayName) by unique ID.
     * @param {string} actorId - ID to resolve.
     * @returns {Actor|null}
     * @abstract
     */
    getActorById(actorId: string): A | null;
}
/**
 * @class InMemoryAssignmentSource
 * @extends AssignmentSource
 * @description Non-persistent implementation using arrays/maps for assignment storage.
 */
export declare class InMemoryAssignmentSource<A extends RoleActor = Actor> extends AssignmentSource<A> {
    _assignments: Assignment[];
    _actors: Map<string, A>;
    /**
     * @constructor
     * @param {Object} [data={}] - Initial state.
     * @param {Assignment[]} [data.assignments=[]] - Seed assignments.
     * @param {Actor[]} [data.actors=[]] - Seed actors.
     */
    constructor(data?: {
        assignments?: Assignment[];
        actors?: A[];
    });
    /**
     * @function addAssignment
     * @param {Assignment} assignment - Record to append.
     */
    addAssignment(assignment: Assignment): void;
    /**
     * @function addActor
     * @param {Actor} actor - Entity to register.
     */
    addActor(actor: A): void;
    /**
     * @function getAssignmentsForRole
     * @description Performs filter-based lookup on internal array.
     * @param {string} roleId - Role to match.
     * @param {Scope} scope - Scope to match or contain.
     * @param {Date} [asOfDate=new Date()] - Validity check.
     * @returns {Assignment[]}
     */
    getAssignmentsForRole(roleId: string, scope: Scope, asOfDate?: Date): Assignment[];
    /**
     * @function getAssignmentsForActor
     * @description Performs ID-based filtering on internal assignments.
     * @param {string} actorId - Actor to match.
     * @param {Date} [asOfDate=new Date()] - Validity check.
     * @returns {Assignment[]}
     */
    getAssignmentsForActor(actorId: string, asOfDate?: Date): Assignment[];
    /**
     * @function getActorById
     * @param {string} actorId - Entity ID.
     * @returns {Actor|null}
     */
    getActorById(actorId: string): A | null;
    /**
     * @function getAllAssignments
     * @returns {Assignment[]} Complete set.
     */
    getAllAssignments(): Assignment[];
    /**
     * @function getAllActors
     * @returns {Actor[]} Complete set.
     */
    getAllActors(): A[];
    /**
     * @function clear
     * @description Purges all internal state.
     */
    clear(): void;
}
