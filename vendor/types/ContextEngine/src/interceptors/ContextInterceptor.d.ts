import type { ContextLogger, AssemblyOptions, ItemOutcome } from '../internal/contracts.js';
/**
 * Abstract base class for context middleware/interceptor patterns.
 * Enables transparent transformation, enrichment, or substitution of provider results before UDC integration.
 * @class
 * @abstract
 */
export declare class ContextInterceptor<Data = unknown, Result = Data> {
    _logger: ContextLogger;
    /**
     * Initializes the interceptor with a required logger service.
     * @param {Object} logger Logger service with debug, info, warn, error methods.
     * @throws {Error} If logger is missing or lacks required interface methods.
     */
    constructor(logger: ContextLogger);
    /**
     * Internal logger instance.
     * @type {Object}
     * @readonly
     */
    get logger(): import("../../../PipelineFramework/index.js").PipelineLogger;
    /**
     * Evaluates if interception should occur based on runtime state and provider metadata.
     * @param {string} name Provider name from recipe.
     * @param {*} data Provider result payload (after post-processing).
     * @param {Object} context Current partially assembled context.
     * @param {Object} options Runtime options passed to ContextAssembler.assemble().
     * @returns {boolean} True to activate interception, false to skip.
     * @protected
     */
    _shouldIntercept(_name: string, _data: Data, _context: object, _options: AssemblyOptions | null): unknown;
    /**
     * Executes core interception logic. Must be implemented by subclasses.
     * @param {string} name Provider name from recipe.
     * @param {*} data Provider result payload.
     * @param {Object} context Current partially assembled context.
     * @param {Object} options Runtime options.
     * @returns {*} Modified data payload (type must match input data).
     * @throws {Error} If not implemented by subclass or logic fails.
     * @protected
     * @abstract
     * @example
     * // Swap Pattern: return { ...substitute, titular: data }
     * // Enrich Pattern: return { ...data, timestamp: Date.now() }
     */
    _performIntercept(_name: string, _data: Data, _context: object, _options: AssemblyOptions | null): Result;
    /**
     * Primary entry point for provider result interception. Orchestrates conditional checks and error wrapping.
     * @param {string} name Provider name from recipe.
     * @param {*} data Provider result payload.
     * @param {Object} context Current assembled context.
     * @param {Object} [options={}] Runtime options.
     * @returns {*} Modified data if intercepted, original data if skipped.
     * @throws {Error} If inputs are invalid or _performIntercept fails.
     */
    intercept(name: string, data: Data, context: object, options?: AssemblyOptions | null): Data | Result;
    /**
     * Walks an array nested inside `data` at `path` (a dot-path string resolved
     * via CoreUtilsLib's `get`, lodash-compatible) and applies a per-item
     * decision to each element. This generalizes the "one atomic swap" model
     * (a single `_performIntercept` deciding for the whole `data` payload) to
     * "independent per-item decisions inside a nested array" — needed by
     * consumers whose `data` is one shared, deeply nested object (e.g. a CDU)
     * containing arrays that must be walked and decided on item-by-item.
     *
     * `itemFn(item, index, array)` may either:
     *  - mutate `item` in place and return `undefined`/`null` (no further
     *    action taken by this helper — the mutation already happened); or
     *  - return a 3-way outcome descriptor the helper applies itself:
     *    - `{ action: 'replace', value }` → `array[index] = value`
     *    - `{ action: 'annotate', meta }` → `Object.assign(array[index], meta)`
     *    - `{ action: 'skip' }` → no-op (equivalent to returning `null`)
     *
     * No-op (with a debug log) if `path` does not resolve to an array on `data`.
     *
     * @param {Object} data The object to resolve `path` against.
     * @param {string} path Dot-path string (e.g. `'focus.classe.consiglioDiClasse'`).
     * @param {Function} itemFn `(item, index, array) => undefined|null|{action, value?, meta?}`.
     * @protected
     */
    _forEachAt<Item>(data: object, path: string, itemFn: (item: Item, index: number, array: Item[]) => ItemOutcome<Item>): void;
}
