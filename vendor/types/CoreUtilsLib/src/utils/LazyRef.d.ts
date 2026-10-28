/**
 * @fileoverview Generic single-value lazy loader — defers an expensive
 * computation until first access, then caches it for the lifetime of the instance.
 * @author GasLibraryFactory
 */
/**
 * @class LazyRef
 * @template T
 * @description Wraps a zero-argument loader function, invoking it at most once.
 */
declare class LazyRef<T = unknown> {
    _resolved: boolean;
    _value: T | undefined;
    _loader: () => T;
    /**
     * @param {() => T} loader Zero-argument factory invoked at most once, on first get().
     */
    constructor(loader: () => T);
    /**
     * @returns {T} The loader's result, computed on first call and cached thereafter.
     */
    get(): T;
    /**
     * @returns {boolean} True once get() has been called at least once.
     */
    isResolved(): boolean;
}
export { LazyRef };
