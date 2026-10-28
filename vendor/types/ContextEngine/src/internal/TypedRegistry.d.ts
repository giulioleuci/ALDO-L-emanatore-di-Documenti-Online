import type { ContextLogger } from './contracts.js';
export declare class TypedRegistry<Entry extends object> {
    _logger: ContextLogger;
    _label: string;
    _requiredMethod: keyof Entry & string;
    _noun: string;
    _article: string;
    _notFoundError: (type: string, types: string[]) => Error;
    _singletons: Map<string, Entry>;
    _factories: Map<string, () => Entry>;
    /**
     * @param {Object} logger Logger service with debug, info, warn, error methods.
     * @param {Object} config
     * @param {string} config.label Class-style label used to prefix error/log messages (e.g. 'ProviderRegistry').
     * @param {string} config.requiredMethod Instance method every registered entry must implement (e.g. 'provide').
     * @param {string} config.noun Singular entity noun used in log messages (e.g. 'provider').
     * @param {string} [config.article='a'] Indefinite article for `noun` in error messages ('a'/'an').
     * @param {(type: string, registeredTypes: string[]) => Error} config.notFoundError Builds the error thrown
     *   by {@link TypedRegistry#get} when `type` isn't registered.
     * @throws {Error} If logger is missing or lacks required interface methods.
     */
    constructor(logger: ContextLogger, { label, requiredMethod, noun, article, notFoundError }: {
        label: string;
        requiredMethod: keyof Entry & string;
        noun: string;
        article?: string;
        notFoundError: (type: string, registeredTypes: string[]) => Error;
    });
    /**
     * Internal logger instance.
     * @type {Object}
     * @readonly
     */
    get logger(): import("../../../PipelineFramework/index.js").PipelineLogger;
    /**
     * Registers a pre-instantiated stateless entry.
     * @param {string} type Unique type identifier.
     * @param {Object} instance Entry instance implementing the required method.
     * @returns {TypedRegistry} Fluent interface for chaining.
     * @throws {Error} If type is empty, instance is null, or the required method is missing.
     */
    registerSingleton(type: string, instance: Entry): this;
    /**
     * Registers a factory function for stateful instantiation.
     * @param {string} type Unique type identifier.
     * @param {Function} factory Function returning a new entry instance on each call.
     * @returns {TypedRegistry} Fluent interface for chaining.
     * @throws {Error} If type is empty or factory is not a function.
     */
    registerFactory(type: string, factory: () => Entry): this;
    /**
     * Resolves an entry instance by type identifier, prioritizing singletons over factories.
     * @param {string} type Type identifier.
     * @returns {Object} Entry instance implementing the required method.
     * @throws {Error} If type is not a string, or a factory returns an invalid object.
     */
    get(type: string): Entry;
    /**
     * Aggregates all registered singleton and factory-instantiated entries.
     * @returns {Object[]} Collection of active entry instances.
     */
    getAll(): Entry[];
    /**
     * Retrieves all registered type identifiers.
     * @returns {string[]} Collection of registered type names.
     */
    getRegisteredTypes(): string[];
}
