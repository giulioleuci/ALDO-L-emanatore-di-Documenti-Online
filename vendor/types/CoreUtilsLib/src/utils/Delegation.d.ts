/**
 * @file CoreUtilsLib/src/utils/Delegation.js
 * @description Generic dynamic-delegation helper for Facade/Delegation-pattern classes.
 * Centralizes the "bind manager methods onto a facade instance" logic that was
 * previously copy-pasted as a private `_delegate` method across multiple libraries
 * (Code Reuse Initiative).
 * @version 1.0.0
 */
/**
 * Static utility for wiring facade methods onto a target instance by delegating
 * to internal collaborator (manager) objects.
 * @class Delegation
 */
export declare class Delegation {
    /**
     * Binds each named method from each manager onto the target object, so calls
     * to `target[method](...)` are forwarded to `manager[method](...)` with the
     * manager's `this` preserved. Methods that don't exist (or aren't functions)
     * on a given manager are silently skipped, unless `logger` is provided, in
     * which case a warning is emitted for each missing method.
     *
     * @param {Object} target - Object onto which delegated methods are attached (typically a facade instance, e.g. `this` inside a constructor).
     * @param {Array<{manager: Object, methods: string[]}>} delegations - Collection of manager/method-name pairs to wire up.
     * @param {{warn: Function}} [logger] - Optional logger; when given, missing methods are reported via `logger.warn(...)` instead of skipped silently.
     * @returns {Object} The same `target`, for convenience chaining.
     *
     * @example
     * class SpreadsheetService {
     *   constructor() {
     *     this._rangeManager = new SpreadsheetRangeManager(this);
     *     Delegation.delegateMethods(this, [
     *       { manager: this._rangeManager, methods: ['updateRanges', 'getRanges'] }
     *     ]);
     *   }
     * }
     */
    static delegateMethods<T extends object>(target: T, delegations: ReadonlyArray<{
        manager: object;
        methods: readonly string[];
    }>, logger?: {
        warn: (message: string) => unknown;
    } | null): T;
}
