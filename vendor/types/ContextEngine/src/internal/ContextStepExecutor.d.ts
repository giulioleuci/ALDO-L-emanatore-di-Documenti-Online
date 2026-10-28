import type { DependencyResolver } from './DependencyResolver.js';
import type { PostProcessor } from '../PostProcessor.js';
import type { ContextLogger, ProviderLookup, ExpressionEvaluator, ContextRetryService, InterceptorLookup } from './contracts.js';
import type { ContextRecord, Recipe, ProviderConfig, AssemblyOptions } from './contracts.js';
export interface ContextExecutionServices {
    _logger: ContextLogger;
    _providerRegistry: Pick<ProviderLookup, 'get'>;
    _expressionEngine?: ExpressionEvaluator | null;
    _exceptionService?: ContextRetryService | null;
    _interceptorRegistry?: Pick<InterceptorLookup, 'getAll'> | null;
    _maxRetries: number;
    _dependencyResolver: Pick<DependencyResolver, 'resolveAll'>;
    _recipeParser: {
        parse(recipe: Recipe): Recipe;
    };
    _postProcessor?: Pick<PostProcessor, 'process'>;
}
export declare class ContextStepExecutor {
    facade: ContextExecutionServices;
    constructor(facade: ContextExecutionServices);
    _evaluateCondition(condition: string | null | undefined, initialParams: object | null, providerResults: object): unknown;
    _executeProvider(providerConfig: ProviderConfig, initialParams: object | null, providerResults: object, options?: AssemblyOptions): unknown;
    assemble(recipe: Recipe, initialParams?: object | null, options?: AssemblyOptions): ContextRecord;
    /**
     * Invokes a single provider in "mutate" mode: the provider receives the
     * shared target object directly (instead of resolved `@`/`$` parameters)
     * and is expected to mutate it in place. This is a real behavioral fork
     * from `_executeProvider`/flat mode, not an overload of it:
     *  - No `DependencyResolver.resolveAll` parameter resolution — mutation-mode
     *    providers read/write the shared target directly, they don't declare
     *    `parameters` maps of `@param`/`$provider` references.
     *  - No `postProcessor` pass — there is no return value to post-process.
     *  - No return-value merge — the provider's return value is IGNORED.
     *  - Registered interceptors ARE still invoked after the provider step
     *    (mirrors flat mode), but they receive `(name, sharedTarget,
     *    sharedTarget, options)` since there is no separate "this provider's
     *    slice of data" — the whole shared target is the only payload.
     * Provider lookup (`ProviderRegistry`) and retry (`exceptionService`) are
     * reused unchanged from flat mode.
     * @param {Object} providerConfig Normalized provider config (name, type).
     * @param {Object} sharedTarget The shared object every provider mutates.
     * @param {Object} initialParams Initial parameters passed to `assembleInto`.
     * @param {Object} [options={}] Runtime options forwarded to providers/interceptors.
     * @private
     */
    _executeMutatingProvider(providerConfig: Pick<ProviderConfig, 'name' | 'type'>, sharedTarget: object, initialParams: object | null, options?: AssemblyOptions): void;
    _logAssemblySummary(durationMs: number, executedProviders: number, skippedProviders: number, failedProviders: number, logPosition: AssemblyOptions['logPosition']): void;
    /**
     * Mutation-mode counterpart to `assemble()`. Instead of collecting each
     * provider's return value into a fresh flat `{ providerName: output }` map,
     * every provider in the recipe receives the SAME `sharedTarget` object
     * across the whole run and is expected to mutate it in place (matching
     * ALDO's `ContextProvider.provide(cdu, params, options): void` contract).
     *
     * What is reused unchanged from flat mode: recipe parsing/normalization
     * (`RecipeParser.parse`), per-provider condition evaluation
     * (`_evaluateCondition`), provider lookup (`ProviderRegistry`), and retry
     * semantics (`exceptionService`). What is NOT reused: `_executeProvider`
     * itself — it pushes a provider's return value through
     * `DependencyResolver.resolveAll`/`postProcessor`, both of which assume a
     * return-value pipeline that doesn't apply to a void mutator, so this mode
     * has its own leaner step, `_executeMutatingProvider`.
     *
     * Return value handling is the precise behavioral fork versus `assemble()`:
     * a mutation-mode provider's return value is ALWAYS ignored — the contract
     * is "mutate `sharedTarget`; return nothing meaningful". Interceptors are
     * still invoked by the assembler after each provider step (this method owns
     * that loop directly, mirroring `_executeProvider`'s existing interceptor
     * loop, rather than pushing interceptor invocation onto the caller) — this
     * keeps the "assembler owns declared order + conditions + retries +
     * interceptor invocation" contract identical in both modes; only what
     * happens to a provider's output differs.
     *
     * @param {Object} sharedTarget The object every provider in the recipe mutates in place.
     * @param {Object} recipe Recipe (validated the same way as `assemble()`'s recipe).
     * @param {Object} [initialParams={}] Initial parameters forwarded to every provider.
     * @param {Object} [options={}] Runtime options forwarded to providers/interceptors.
     * @returns {Object} `sharedTarget`, for convenience (it was mutated in place).
     * @throws {Error} If `sharedTarget`/`recipe`/`initialParams`/`options` are invalid.
     * @throws {ContextEngineError} If recipe validation or a provider step fails.
     */
    assembleInto<Target extends object>(sharedTarget: Target, recipe: Recipe, initialParams?: object | null, options?: AssemblyOptions): Target;
}
