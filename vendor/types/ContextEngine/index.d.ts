/**
 * ContextEngine - Declarative Data Assembly from Recipes
 *
 * @module ContextEngine
 *
 * @description
 * Generic, declarative system for assembling complex data contexts (Unified Data
 * Contexts) from disparate sources based on JSON recipes, with automatic dependency
 * resolution, conditional execution, and transformation of provider data.
 *
 * See the package README for architecture, recipe format, usage examples, and
 * design notes.
 *
 * @version 1.0.0
 * @author GasLibraryFactory
 * @license MIT
 */
export { ContextAssembler } from './src/ContextAssembler.js';
export { ProviderRegistry } from './src/ProviderRegistry.js';
export { DependencyResolver } from './src/internal/DependencyResolver.js';
export { RecipeParser } from './src/internal/RecipeParser.js';
export { DataProvider } from './src/DataProvider.js';
export { ContextInterceptor } from './src/interceptors/ContextInterceptor.js';
export { InterceptorRegistry } from './src/interceptors/InterceptorRegistry.js';
export { CollectionProjectionInterceptor } from './src/interceptors/CollectionProjectionInterceptor.js';
export { CollectionProjector } from './src/projection/CollectionProjector.js';
export { ProjectionRegistry } from './src/projection/ProjectionRegistry.js';
export { PostProcessor as ContextPostProcessor } from './src/PostProcessor.js';
export { ContextEngineError } from './src/internal/errors/ContextEngineError.js';
export { RecipeValidationError } from './src/internal/errors/RecipeValidationError.js';
export { DependencyResolutionError } from './src/internal/errors/DependencyResolutionError.js';
export { ProviderNotFoundError } from './src/internal/errors/ProviderNotFoundError.js';
export { ProviderExecutionError } from './src/internal/errors/ProviderExecutionError.js';
export { CollectionProjectionError } from './src/internal/errors/CollectionProjectionError.js';
export * as testing from './src/testing/mocks.js';
export type { ContextLogger, ContextRecord, ContextRetryService, ExpressionEvaluator, Provider, MutatingProvider, ProviderLookup, Interceptor, InterceptorLookup, AssemblyOptions, Recipe, ProviderConfig, NormalizedProvider, NormalizedRecipe, ProcessorConfig, Processor, ProjectionRuntime, ProjectionOperation, ProjectionResult, ProjectionStrategy, ProjectionInterceptorConfig, ItemOutcome } from './src/internal/contracts.js';
