import type { DocumentProcessor } from '../../processors/DocumentProcessor.js';
import type { ParsedFilter } from '../../types.js';
export declare class DocumentProcessorValueResolver {
    facade: Pick<DocumentProcessor, 'strictFilters'> & {
        logger: Pick<DocumentProcessor['logger'], 'warn'>;
        mustache: {
            getValue(path: string, obj: unknown): unknown;
        };
        _getNestedProperty: DocumentProcessor['_getNestedProperty'];
    };
    constructor(facade: DocumentProcessorValueResolver['facade']);
    _applyFilters<T>(array: T[], filters: ParsedFilter[] | null | undefined): T[];
    _applyFilters<T>(array: T, filters: ParsedFilter[] | null | undefined): T;
    _sortByProperty<T>(array: T[], propName: string): T[];
    _getNestedProperty(obj: unknown, path: string): unknown;
}
