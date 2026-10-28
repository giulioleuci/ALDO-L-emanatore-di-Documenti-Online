import { ContextEngineError } from './ContextEngineError.js';
/**
 * Signals invalid declarative collection-projection configuration or execution.
 */
export declare class CollectionProjectionError extends ContextEngineError {
    constructor(message: string, context?: Record<string, unknown> & {
        operationIndex?: number | null;
        targetPath?: string | null;
    });
}
