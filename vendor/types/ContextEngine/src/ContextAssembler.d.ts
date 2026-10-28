import type { ContextLogger, ProviderLookup, ExpressionEvaluator, ContextRetryService, InterceptorLookup } from './internal/contracts.js';
/**
 * @file ContextEngine/src/ContextAssembler.js
 * @description Main facade for assembling data contexts from recipes.
 * @version 1.0.0
 */
import { DependencyResolver } from './internal/DependencyResolver.js';
import { RecipeParser } from './internal/RecipeParser.js';
import { PostProcessor } from './PostProcessor.js';
import { ContextStepExecutor } from './internal/ContextStepExecutor.js';
import { ContextDependencyAnalyzer } from './internal/ContextDependencyAnalyzer.js';
/**
 * Orchestrator facade for assembling complex data contexts from declarative JSON recipes.
 * Coordinates validation, dependency resolution, conditional execution, provider invocation, and post-processing.
 * @class
 * @example
 * const recipe = {
 *   providers: [
 *     {
 *       name: 'user',
 *       type: 'UserDataProvider',
 *       condition: '{{userId}} != null',
 *       parameters: { userId: '@userId' }
 *     },
 *     {
 *       name: 'analytics',
 *       type: 'AnalyticsProvider',
 *       condition: 'len($user.orders) > 0',
 *       parameters: { orders: '$user.orders' },
 *       postProcess: [{ type: 'round', decimals: 2 }]
 *     }
 *   ]
 * };
 * const context = assembler.assemble(recipe, { userId: 123 });
 * @example
 * // Mutation mode: every provider mutates the SAME shared target object in
 * // place instead of producing a value merged into a flat, provider-keyed
 * // map. Useful for consumers whose "context" is one deeply nested object
 * // multiple providers read from and write into at the same paths (e.g. a
 * // recipe where a later provider must overwrite a field an earlier
 * // provider already set). Provider return values are ignored in this mode.
 * const sharedTarget = { meta: {}, focus: {} };
 * assembler.assembleInto(sharedTarget, recipe, { userId: 123 });
 * // sharedTarget now holds everything every provider wrote, in recipe order.
 */
export declare class ContextAssembler {
    _logger: ContextLogger;
    _providerRegistry: ProviderLookup;
    _expressionEngine: ExpressionEvaluator | null;
    _exceptionService: ContextRetryService | null;
    _interceptorRegistry: InterceptorLookup | null;
    _maxRetries: number;
    _dependencyResolver: DependencyResolver;
    _recipeParser: RecipeParser;
    _postProcessor: Pick<PostProcessor, 'process' | 'getRegisteredTypes'>;
    _stepExecutor: ContextStepExecutor;
    _dependencyAnalyzer: ContextDependencyAnalyzer;
    _evaluateCondition: ContextStepExecutor['_evaluateCondition'];
    _executeProvider: ContextStepExecutor['_executeProvider'];
    _executeMutatingProvider: ContextStepExecutor['_executeMutatingProvider'];
    assemble: ContextStepExecutor['assemble'];
    assembleInto: ContextStepExecutor['assembleInto'];
    validateRecipe: ContextDependencyAnalyzer['validateRecipe'];
    analyzeRecipeDependencies: ContextDependencyAnalyzer['analyzeRecipeDependencies'];
    getConfigSummary: ContextDependencyAnalyzer['getConfigSummary'];
    /**
     * Initializes the assembler with required orchestrators and optional engines.
     * @param {Object} logger Logger service with debug, info, warn, error methods.
     * @param {Object} providerRegistry Registry for provider lookup by type.
     * @param {Object} [expressionEngine=null] Optional engine for evaluating 'condition' strings.
     * @param {Object} [exceptionService=null] Optional service for transient error retries.
     * @param {Object} [interceptorRegistry=null] Optional registry for data interception.
     * @param {Object} [options={}] Configuration options.
     * @param {number} [options.maxRetries=3] Maximum retry attempts per provider.
     * @throws {Error} If logger or providerRegistry are missing or lack required interface methods.
     * @throws {Error} If any engine parameter is provided but is not an object.
     */
    constructor(logger: ContextLogger, providerRegistry: ProviderLookup, expressionEngine?: ExpressionEvaluator | null, exceptionService?: ContextRetryService | null, interceptorRegistry?: InterceptorLookup | null, options?: {
        maxRetries?: number;
    });
    /**
     * Internal logger instance.
     * @type {Object}
     * @readonly
     */
    get logger(): import("../../PipelineFramework/index.js").PipelineLogger;
    /**
     * Provider registry for type lookup.
     * @type {Object}
     * @readonly
     */
    get providerRegistry(): ProviderLookup;
}
