import type { ContextLogger, Projector, ProjectionOperation, ProjectionInterceptorConfig, AssemblyOptions } from '../internal/contracts.js';
import { ContextInterceptor } from './ContextInterceptor.js';
/** Applies a CollectionProjector to configured collection paths after selected providers. */
export declare class CollectionProjectionInterceptor extends ContextInterceptor {
    _projector: Projector;
    _targetProviders: string[];
    _targetPaths: string[];
    _operations: ProjectionOperation[];
    _optionFlag: string | null;
    constructor(logger: ContextLogger, projector: Projector, config?: Partial<ProjectionInterceptorConfig>);
    _shouldIntercept(name: string, _data: unknown, _context: object, options: AssemblyOptions | null): boolean;
    _performIntercept(name: string, data: unknown, context: object, options: AssemblyOptions | null): unknown;
    _readTarget(data: unknown, path: string): unknown;
    _writeTarget(data: unknown, path: string, value: unknown): void;
}
