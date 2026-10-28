/**
 * @file ContextEngine/src/errors/ProviderNotFoundError.js
 * @description Error thrown when a provider is not found in the registry.
 * @version 1.0.0
 *
 * @overview
 * Thrown by ProviderRegistry.get() when attempting to retrieve a provider that
 * has not been registered. This error indicates a configuration issue where a
 * recipe references a provider type that doesn't exist in the registry.
 *
 * ## When This Error Occurs
 * - **Provider Not Registered**: Recipe references provider type not registered
 * - **Typo in Type Name**: Provider type misspelled in recipe
 * - **Registration Missing**: Forgot to register provider before assembling recipe
 * - **Case Sensitivity**: Provider type case doesn't match registration
 * - **Wrong Environment**: Provider registered in different context/instance
 *
 * ## Common Causes
 * 1. **Missing Registration**: Forgot `registry.registerSingleton('Type', instance)`
 * 2. **Typo**: Recipe uses "UserProvider" but registered as "UserDataProvider"
 * 3. **Case Mismatch**: Recipe uses "userProvider" but registered as "UserProvider"
 * 4. **Order Issue**: Recipe executed before provider registration
 * 5. **Wrong Registry**: Multiple ContextAssembler instances with separate registries
 * 6. **Built-in Provider**: Assuming built-in provider exists without registration
 *
 * ## Troubleshooting
 * - Check error context for `registeredProviders` array
 * - Verify provider type spelling matches registration exactly
 * - Ensure provider is registered before recipe execution
 * - Use `getConfigSummary()` to list all registered providers
 * - Check for case sensitivity issues in provider type names
 *
 * ## Prevention
 * - Register all providers at application startup
 * - Use constants for provider type names
 * - Document required providers in recipe documentation
 * - Validate provider availability before recipe execution
 * - Use centralized registration module
 */
import { ContextEngineError } from './ContextEngineError.js';
/**
 * Error signaling a missing registration for a requested DataProvider type.
 *
 * @class ProviderNotFoundError
 * @extends ContextEngineError
 *
 * @description
 * Thrown during ContextAssembler.assemble() or ProviderRegistry.get() when a recipe
 * references an unregistered provider. Includes technical context for typo detection
 * (registeredProviders) and dependency mapping (recipeName, currentProvider).
 *
 * @example
 * throw new ProviderNotFoundError('UserDataProvider', { registeredProviders: ['Auth', 'Config'] });
 */
export declare class ProviderNotFoundError extends ContextEngineError {
    providerType: string;
    /**
     * Initialize a ProviderNotFoundError with registry context.
     *
     * @param {string} providerType - Unregistered identifier requested by the recipe.
     * @param {Object} [context={}] - Diagnostic metadata.
     * @param {string[]} [context.registeredProviders] - List of currently available provider types.
     * @param {string} [context.recipeName] - Identifier of the active assembly recipe.
     * @param {string} [context.currentProvider] - Contextual provider undergoing configuration.
     */
    constructor(providerType: string, context?: Record<string, unknown>);
}
