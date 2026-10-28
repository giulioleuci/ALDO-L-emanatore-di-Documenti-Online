import type { AssignmentSlotDefinition, DimensionValue, SlotDimensions } from '../types.js';
/** Immutable, opaque set of dimensions identifying an assignment slot. */
export declare class AssignmentSlot {
    readonly dimensions: Readonly<SlotDimensions>;
    readonly key: string;
    constructor({ dimensions }?: AssignmentSlotDefinition);
    get(name: string): DimensionValue;
    matches(scopeDimensions?: Record<string, unknown>): boolean;
    toJSON(): {
        dimensions: {
            [x: string]: DimensionValue;
        };
    };
}
