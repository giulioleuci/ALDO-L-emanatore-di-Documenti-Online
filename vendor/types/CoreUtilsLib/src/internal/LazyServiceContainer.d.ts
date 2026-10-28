/**
 * @file CoreUtilsLib/src/internal/LazyServiceContainer.js
 * @description Generic lazy-singleton dependency-injection container.
 *
 * Extracted from the register/lazy-resolve/reset idiom `GoogleApiWrapper`'s
 * `ServiceFactory` establishes for native-Google-service singletons, but
 * generalized for any consumer app's own domain/application-service wiring
 * (ref REPORT_GLF.md B8) — `ServiceFactory` itself stays scoped to
 * Drive/Sheets/Docs/Gmail/Logger/Utilities/Cache/Exception; this is the
 * shared, app-agnostic machinery underneath that idiom.
 * @version 1.0.0
 */
import type { RegistryOptions } from './Registry.js';
import { Registry } from './Registry.js';
/**
 * Lazy-singleton service container: register a factory under a name, resolve
 * it (and cache the result) on first `get()`, share the cached instance on
 * every subsequent `get()` until `reset()`.
 *
 * @class LazyServiceContainer
 * @template T
 */
export declare class LazyServiceContainer<Services extends object = Record<string, unknown>> {
    _factories: Registry<keyof Services & string, (container: this) => Services[keyof Services]>;
    _singletons: Registry<keyof Services & string, Services[keyof Services]>;
    /**
     * @param {Object} [options={}] Container configuration.
     * @param {Object|null} [options.logger=null] Optional logger (debug used for registration/resolution traces).
     * @param {string} [options.entityName='service'] Noun used in default log messages.
     */
    constructor({ logger, entityName }?: Pick<RegistryOptions, 'logger' | 'entityName'>);
    /**
     * Registers a factory under `name`. Overwriting a name clears any cached
     * singleton for it, so the next `get()` re-resolves from the new factory.
     * @param {string} name Service identifier.
     * @param {Function} factory `(container) => T` — invoked at most once, lazily, on first `get(name)`.
     */
    register<K extends keyof Services & string>(name: K, factory: (container: this) => Services[K]): void;
    /**
     * @param {string} name Service identifier.
     * @returns {boolean} True if a factory is registered under `name`.
     */
    has(name: keyof Services & string): boolean;
    /**
     * Resolves the service registered under `name`: returns the cached
     * singleton if one exists, otherwise invokes the registered factory once
     * and caches the result.
     * @param {string} name Service identifier.
     * @returns {T} The resolved (and now cached) service instance.
     * @throws {Error} If no factory is registered under `name`.
     */
    get<K extends keyof Services & string>(name: K): Services[K];
    /**
     * Clears cached singletons, without unregistering factories — the next
     * `get()` per name lazily re-resolves. Primarily for test state isolation.
     */
    reset(): void;
    /**
     * Removes every registered factory and cached singleton.
     */
    clear(): void;
}
