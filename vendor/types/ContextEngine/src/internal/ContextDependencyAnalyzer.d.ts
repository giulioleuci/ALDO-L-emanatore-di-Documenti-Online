import type { ContextAssembler } from '../ContextAssembler.js';
import type { Recipe, ProviderAnalysis } from './contracts.js';
export declare class ContextDependencyAnalyzer {
    facade: ContextAssembler;
    constructor(facade: ContextAssembler);
    validateRecipe(recipe: unknown): {
        isValid: boolean;
        errors: string[];
    };
    analyzeRecipeDependencies(recipe: Recipe): Record<string, ProviderAnalysis>;
    getConfigSummary(): {
        hasExpressionEngine: boolean;
        hasExceptionService: boolean;
        hasInterceptorRegistry: boolean;
        maxRetries: number;
        registeredProviders: string[];
        registeredPostProcessors: string[];
        registeredInterceptors: string[];
    };
}
