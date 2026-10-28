import type { ProjectionStrategy, ProjectionOperation, ProjectionRuntime } from '../internal/contracts.js';
/**
 * Registry for application-supplied, synchronous collection projection strategies.
 */
export declare class ProjectionRegistry {
    _strategies: Map<string, ProjectionStrategy>;
    constructor();
    register<Value = unknown>(name: string, strategy: (value: Value, operation: ProjectionOperation, runtime: ProjectionRuntime) => unknown): this;
    get(name: string): ProjectionStrategy | null;
    has(name: string): boolean;
}
