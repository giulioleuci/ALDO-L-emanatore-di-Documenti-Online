import type { TraceEntry } from '../../types.js';
/** Immutable sequence of explainable effective-assignment decisions. */
export declare class ResolutionTrace {
    readonly entries: ReadonlyArray<Required<TraceEntry>>;
    constructor(entries?: Partial<TraceEntry>[]);
    append(entry: TraceEntry): ResolutionTrace;
    toJSON(): {
        metadata: {
            [x: string]: unknown;
        };
        stage: "BASE" | "OVERRIDE" | "DELEGATION" | "ROUTING";
        decision: "CONSIDERED" | "REJECTED" | "SELECTED" | "APPLIED";
        candidateId: string | null;
        actorId: string | null;
        reason: string;
    }[];
}
