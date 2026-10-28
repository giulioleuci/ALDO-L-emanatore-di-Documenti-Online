import type { DomainRecord, DomainLogger } from '../contracts.js';
export type ColumnNames = string | Record<string, string>;
export interface DynamicFieldConfig<V = unknown, C extends ColumnNames = Record<string, string>> {
    propertyName: string;
    schemaProvider(): string[];
    columnPattern(key: string): C;
    aggregate(row: DomainRecord, key: string, columns: C): V | null | undefined;
    expand(value: V, key: string, columns: C): DomainRecord;
    logger?: Pick<DomainLogger, 'warn' | 'error'> | null;
}
export interface DynamicMapping {
    propertyName: string;
    hydrate(row: DomainRecord): Map<string, unknown>;
    dehydrate(mapValue: Map<string, unknown> | null | undefined): DomainRecord;
    getColumnNames(): string[];
}
/**
 * Configuration for schema-driven dynamic field mapping, aggregating multiple database columns into entity Map properties.
 * @class
 */
export declare class DynamicFieldMapping<V = unknown, C extends ColumnNames = Record<string, string>> {
    propertyName: string;
    schemaProvider: DynamicFieldConfig<V, C>['schemaProvider'];
    columnPattern: DynamicFieldConfig<V, C>['columnPattern'];
    aggregate: DynamicFieldConfig<V, C>['aggregate'];
    expand: DynamicFieldConfig<V, C>['expand'];
    logger: Pick<DomainLogger, 'warn' | 'error'>;
    /**
     * Initializes mapping configuration with schema providers and transformation logic.
     * @param {Object} config Configuration metadata.
     * @param {string} config.propertyName Entity attribute identifier (target Map).
     * @param {Function} config.schemaProvider Returns array of keys defining the dynamic schema.
     * @param {Function} config.columnPattern Resolves database column names for a given schema key.
     * @param {Function} config.aggregate Consolidates multiple row columns into a single entity value.
     * @param {Function} config.expand Decomposes an aggregated value back into individual column updates.
     * @param {Object} [config.logger] Diagnostic output interface.
     */
    constructor(config: DynamicFieldConfig<V, C>);
    /**
     * Enforces structural integrity of the mapping configuration.
     * @private
     * @throws {Error} If required configuration properties or transform functions are missing.
     */
    _validate(): void;
    /**
     * Transforms raw database row data into an aggregated entity Map property.
     * @param {Object} row Raw persistence data record.
     * @returns {Map<string, *>} Aggregated domain attribute state.
     */
    hydrate(row: DomainRecord): Map<string, V>;
    /**
     * Flattens an entity Map property back into individual database column values.
     * @param {Map<string, *>} mapValue Aggregated domain attribute state.
     * @returns {Object.<string, *>} Flattened persistence data record.
     */
    dehydrate(mapValue: Map<string, V> | null | undefined): DomainRecord;
    /**
     * Identifies every database column consumed or produced by this dynamic mapping.
     * @returns {string[]} Collection of physical column names.
     */
    getColumnNames(): string[];
}
