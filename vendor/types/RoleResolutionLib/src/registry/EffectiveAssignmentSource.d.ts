import type { RoleContext, AssignmentCandidateRecord } from '../types.js';
import type { Actor } from '../core/Actor.js';
import type { AssignmentCandidate } from '../core/AssignmentCandidate.js';
import type { AssignmentOverride } from '../core/AssignmentOverride.js';
/** Generic persistence contracts for effective-assignment resolution. */
export declare class EffectiveAssignmentSource<C extends object = RoleContext, T extends AssignmentCandidateRecord = AssignmentCandidate> {
    getAssignments(_context: C, _asOfDate: Date): T[];
}
export declare class OverrideSource<C extends object = RoleContext> {
    getOverrides(_context: C, _asOfDate: Date): AssignmentOverride[];
}
export declare class ActorSource<A extends Actor = Actor> {
    getActor(_actorId: string): A | null | undefined;
}
export declare function splitCsv(value: unknown): string[];
/** Matches opaque dimensions against literal, CSV, and wildcard values. */
export declare function matchesContextDimensions<C extends object>(context: C, dimensions?: Record<string, unknown>): boolean;
