import type { PipelineLogger, LogPosition } from '@PipelineFramework';
export type ContextRecord = Record<string, unknown>;
export type ContextLogger = PipelineLogger;
export interface ExpressionEvaluator {
    evaluate(expression: string, context: object): unknown;
}
export interface ContextRetryService {
    executeWithRetry<T>(callback: () => T, context: ContextRecord, retries: number): T;
}
export interface Provider<Parameters extends object = ContextRecord, Result = unknown> {
    provide(name: string, parameters: Parameters): Result;
}
export interface MutatingProvider {
    provide(target: object, parameters: object | null, options: AssemblyOptions): unknown;
}
export interface ProviderLookup {
    get(type: string): Provider<object> | MutatingProvider;
    getRegisteredTypes(): string[];
}
export interface Interceptor {
    intercept(name: string, data: unknown, context: object, options: AssemblyOptions | null): unknown;
}
export interface InterceptorLookup {
    getAll(): Interceptor[];
    getRegisteredTypes(): string[];
}
export interface AssemblyOptions extends ContextRecord {
    logPosition?: Partial<LogPosition>;
}
export interface ProcessorConfig extends ContextRecord {
    type: string;
    fields?: string[];
    mapping?: ContextRecord;
    defaults?: ContextRecord;
}
export type Processor = (data: unknown, config: ProcessorConfig) => unknown;
export interface ProviderConfig {
    name: string;
    type: string;
    parameters?: object;
    condition?: string | null;
    postProcess?: ProcessorConfig[];
}
export interface Recipe {
    providers: ProviderConfig[];
}
export interface NormalizedProvider extends ProviderConfig {
    parameters: object;
    condition: string | null;
    postProcess: ProcessorConfig[];
}
export interface NormalizedRecipe {
    providers: NormalizedProvider[];
}
export interface DependencyAnalysis {
    paramDependencies: string[];
    providerDependencies: string[];
    totalDependencies: number;
}
export interface ProviderAnalysis {
    type: string;
    hasCondition: boolean;
    condition: string | null;
    dependencies: DependencyAnalysis;
}
export type ItemOutcome<Item> = void | null | {
    action: 'replace';
    value: Item;
} | {
    action: 'annotate';
    meta: object;
} | {
    action: 'skip';
};
export interface ProjectionRuntime extends AssemblyOptions {
    targetPath?: string | null;
}
export interface FieldProjection {
    from?: string;
    value?: unknown;
}
export interface AggregateConfig {
    type: string;
    path?: string;
}
export interface SortKey {
    path: string;
    direction: 'ASC' | 'DESC';
}
export type ProjectionOperation = {
    type: 'filter';
    expression: string;
} | {
    type: 'map';
    fields: Record<string, FieldProjection>;
} | {
    type: 'flatMap';
    path?: string;
    strategy?: string;
    mergeParent?: boolean;
} | {
    type: 'groupBy';
    keys: string[];
    aggregates: Record<string, AggregateConfig>;
} | {
    type: 'distinctBy';
    keys: string[];
} | {
    type: 'sortBy';
    keys: SortKey[];
} | {
    type: 'prepend' | 'append';
    value: unknown;
    when?: string;
} | {
    type: 'strategy';
    name: string;
};
export type ProjectionStrategy = (value: unknown, operation: ProjectionOperation, runtime: ProjectionRuntime) => unknown;
export interface ProjectionStrategyLookup {
    get(name: string): ProjectionStrategy | null;
}
export interface ProjectionResult {
    value: unknown[];
    trace: {
        index: number;
        type: string;
        inputCount: number;
        outputCount: number;
    }[];
}
export interface Projector {
    project(input: unknown, operations: ProjectionOperation[], runtime: ProjectionRuntime): ProjectionResult;
}
export interface ProjectionInterceptorConfig {
    targetProviders: string[];
    targetPaths: string[];
    operations: ProjectionOperation[];
    optionFlag?: string | null;
}
