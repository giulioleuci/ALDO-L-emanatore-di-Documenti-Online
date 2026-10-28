import type { ContextLogger, Interceptor } from '../internal/contracts.js';
/**
 * @file ContextEngine/src/InterceptorRegistry.js
 * @description Manages registration and retrieval of context interceptors.
 * @version 1.0.0
 */
import { TypedRegistry } from '../internal/TypedRegistry.js';
/**
 * Registry for managing context interceptor lifecycles, supporting both Singleton (stateless) and Factory (stateful) instantiation strategies.
 * @class
 * @extends TypedRegistry
 */
export declare class InterceptorRegistry<Entry extends Interceptor = Interceptor> extends TypedRegistry<Entry> {
    /**
     * Initializes the registry with a required logger service.
     * @param {Object} logger Logger service with debug, info, warn, error methods.
     * @throws {Error} If logger is missing or lacks required interface methods.
     */
    constructor(logger: ContextLogger);
}
