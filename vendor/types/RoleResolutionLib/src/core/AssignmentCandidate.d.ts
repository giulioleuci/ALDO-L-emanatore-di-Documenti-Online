import type { AssignmentCandidateDefinition } from '../types.js';
import { AssignmentSlot } from './AssignmentSlot.js';
/** Immutable candidate assignment that can become effective at a point in time. */
export declare class AssignmentCandidate {
    readonly id: string;
    readonly actorId: string;
    readonly slot: AssignmentSlot;
    readonly validFrom: Date | null;
    readonly validTo: Date | null;
    readonly source: string;
    readonly priority: number;
    readonly metadata: Readonly<Record<string, unknown>>;
    constructor({ id, actorId, slot, validFrom, validTo, source, priority, metadata }?: AssignmentCandidateDefinition);
    isValidAt(date?: unknown): boolean;
    toJSON(): {
        id: string;
        actorId: string;
        slot: {
            dimensions: {
                [x: string]: import("../types.js").DimensionValue;
            };
        };
        validFrom: string | null;
        validTo: string | null;
        source: string;
        priority: number;
        metadata: {
            [x: string]: unknown;
        };
    };
}
