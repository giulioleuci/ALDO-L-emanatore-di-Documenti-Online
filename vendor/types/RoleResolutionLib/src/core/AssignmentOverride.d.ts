import type { AssignmentOverrideDefinition, DimensionValue, SlotDimensions } from '../types.js';
import type { AssignmentSlot } from './AssignmentSlot.js';
/** Immutable, dated actor replacement scoped by opaque assignment dimensions. */
export declare class AssignmentOverride {
    readonly id: string;
    readonly previousActorId: string;
    readonly nextActorId: string;
    readonly slotScope: Readonly<SlotDimensions>;
    readonly effectiveFrom: Date;
    readonly source: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    constructor({ id, previousActorId, nextActorId, slotScope, effectiveFrom, source, metadata }?: AssignmentOverrideDefinition);
    appliesAtDate(date: unknown): boolean;
    matchesActor(actorId: string): boolean;
    matchesSlot(slot: AssignmentSlot | null | undefined): boolean;
    matches(candidate: unknown, date?: unknown): boolean;
    toJSON(): {
        id: string;
        previousActorId: string;
        nextActorId: string;
        slotScope: {
            [x: string]: DimensionValue;
        };
        effectiveFrom: string;
        source: string;
        metadata: {
            [x: string]: unknown;
        };
    };
}
