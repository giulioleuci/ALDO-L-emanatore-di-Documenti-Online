/**
 * @file ComposableContentLib/src/data/BlockDataContext.js
 * @description BlockDataContext for providing data to content blocks.
 * @version 1.0.0
 */
/**
 * @description Encapsulated state container for rendering context.
 * Supports dot-notation resolution, merging global vs. block-local data, and immutable scoping.
 * @class
 * @example
 * const context = new BlockDataContext({ user: { name: 'John' } });
 * const name = context.get('user.name'); // 'John'
 */
export declare class BlockDataContext<Data extends object = Record<string, unknown>> {
    _data: Partial<Data>;
    _globalContext: object;
    _merged: Partial<Data> & Record<string, unknown>;
    /**
     * @description Initializes context state with optional block-specific and global payloads.
     * @param {Object} [data={}] Block-specific runtime data.
     * @param {Object} [globalContext={}] Shared orchestration state across all blocks.
     */
    constructor(data?: Partial<Data>, globalContext?: object);
    /**
     * @description Safely resolves a nested property using dot notation from the unified state.
     * @param {string} path Target property path.
     * @param {*} [defaultValue=null] Fallback if path is unresolvable.
     * @returns {*} Resolved value or default.
     */
    get<Path extends string, Default = null>(path: Path, defaultValue?: Default): Path extends keyof Data ? Exclude<Data[Path], undefined> | Default : unknown;
    /**
     * @description Validates the existence of a nested property path.
     * @param {string} path Target property path.
     * @returns {boolean} True if the path resolves to a defined value.
     */
    has(path: string): boolean;
    /**
     * @description Returns a deep clone of the fully unified context state (local + global).
     * @returns {Object} Unified data clone.
     */
    getAll(): Partial<Data> & Record<string, unknown>;
    /**
     * @description Mutates the local block data payload and recalculates unified state.
     * @param {string} path Target dot-notation path.
     * @param {*} value Value to apply.
     */
    set<Path extends string>(path: Path, value: Path extends keyof Data ? Data[Path] : unknown): void;
    /**
     * @description Deeply merges an external object into the local block data and recalculates state.
     * @param {Object} additionalData Payload to overlay.
     */
    merge(additionalData: object): void;
    /**
     * @description Evaluates if the unified context state contains zero enumerable keys.
     * @returns {boolean} True if entirely empty.
     */
    isEmpty(): boolean;
    /**
     * @description Extracts all top-level keys from the unified context state.
     * @returns {string[]} Collection of root keys.
     */
    keys(): string[];
    /**
     * @description Serializes both data and globalContext into a clean object representation.
     * @returns {Object} JSON-safe snapshot.
     */
    toJSON(): {
        data: Partial<Data>;
        globalContext: object;
    };
    /**
     * @description Reconstitutes a BlockDataContext instance from a serialized snapshot.
     * @param {Object} obj Target JSON payload.
     * @returns {BlockDataContext} Restored instance.
     * @static
     */
    static fromJSON(obj: {
        data?: object;
        globalContext?: object;
    } | null): BlockDataContext<Record<string, unknown>>;
    /**
     * @description Returns a diagnostic summary of the unified state footprint.
     * @returns {string} Summary string.
     */
    toString(): string;
}
