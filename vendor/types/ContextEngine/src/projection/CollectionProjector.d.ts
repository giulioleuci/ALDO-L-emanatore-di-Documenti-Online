import type { ContextLogger, ContextRecord, ExpressionEvaluator, ProjectionRuntime, ProjectionOperation, ProjectionStrategyLookup, ProjectionResult, AggregateConfig } from '../internal/contracts.js';
import { CollectionProjectionError } from '../internal/errors/CollectionProjectionError.js';
/**
 * Runs declarative, synchronous projections without mutating the source collection.
 */
export declare class CollectionProjector {
    _registry: ProjectionStrategyLookup;
    _expressionEngine: ExpressionEvaluator | null;
    _logger: ContextLogger | null;
    constructor({ registry, expressionEngine, logger }?: {
        registry?: ProjectionStrategyLookup;
        expressionEngine?: ExpressionEvaluator | null;
        logger?: ContextLogger | null;
    });
    project(inputArray: unknown, operations: ProjectionOperation[], runtimeContext?: ProjectionRuntime | null): ProjectionResult;
    _apply(value: unknown[], operation: ProjectionOperation, runtime: ProjectionRuntime, index: number, targetPath: string | null): unknown[];
    _filter(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'filter';
    }>, runtime: ProjectionRuntime, index: number, targetPath: string | null): unknown[];
    _map(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'map';
    }>, index: number, targetPath: string | null): ContextRecord[];
    _flatMap(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'flatMap';
    }>, runtime: ProjectionRuntime, index: number, targetPath: string | null): unknown[];
    _groupBy(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'groupBy';
    }>, index: number, targetPath: string | null): ContextRecord[];
    _aggregate(items: unknown[], config: AggregateConfig, index: number, targetPath: string | null): unknown;
    _distinctBy(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'distinctBy';
    }>, index: number, targetPath: string | null): unknown[];
    _sortBy(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'sortBy';
    }>, index: number, targetPath: string | null): unknown[];
    _insert(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'prepend' | 'append';
    }>, runtime: ProjectionRuntime, index: number, targetPath: string | null): unknown[];
    _strategy(value: unknown[], operation: Extract<ProjectionOperation, {
        type: 'strategy';
    }>, runtime: ProjectionRuntime, index: number, targetPath: string | null): any[];
    _runStrategy(name: string | undefined, value: unknown, operation: ProjectionOperation, runtime: ProjectionRuntime, index: number, targetPath: string | null): unknown;
    _evaluate(expression: string, context: object, index: number, targetPath: string | null): boolean;
    _itemRuntime(runtime: ProjectionRuntime, item: unknown, index: number): {
        item: unknown;
        value: unknown;
        index: number;
        targetPath?: string | null;
        logPosition?: Partial<import("../../../PipelineFramework/index.js").LogPosition>;
    };
    _keys(keys: unknown, label: string, index: number, targetPath: string | null): string[];
    _read(value: unknown, path: string, index: number, targetPath: string | null): unknown;
    _error(message: string, operationIndex: number, targetPath: string | null, originalError?: unknown): CollectionProjectionError;
}
