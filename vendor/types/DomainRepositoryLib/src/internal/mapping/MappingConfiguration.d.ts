import type { DomainLogger } from '../contracts.js';
import type { DynamicMapping, DynamicFieldConfig, ColumnNames } from './DynamicFieldMapping.js';
import type { JsonExpansionConfig } from './JsonExpansionMapping.js';
import { DynamicFieldMapping } from './DynamicFieldMapping.js';
import { JsonExpansionMapping } from './JsonExpansionMapping.js';
/**
 * Registry for entity mapping strategies, coordinating dynamic field aggregations and JSON property expansions.
 * @class
 */
export declare class MappingConfiguration {
    logger: DomainLogger;
    _dynamicFieldMappings: Map<string, DynamicMapping>;
    _jsonExpansionMappings: Map<string, JsonExpansionMapping>;
    /**
     * Initializes configuration container with isolated registries for different mapping types.
     * @param {Object|null} [logger] Optional diagnostic logger.
     */
    constructor(logger?: DomainLogger | null);
    /**
     * Registers a new dynamic field aggregation strategy.
     * @param {Object|DynamicFieldMapping} config mapping configuration or instance.
     * @returns {this} Chainable configuration instance.
     */
    addDynamicFieldMapping<V, C extends ColumnNames>(config: DynamicFieldConfig<V, C> | DynamicFieldMapping<V, C>): this;
    /**
     * Registers a new JSON property expansion strategy.
     * @param {Object|JsonExpansionMapping} config mapping configuration or instance.
     * @returns {this} Chainable configuration instance.
     */
    addJsonExpansionMapping(config: JsonExpansionConfig | JsonExpansionMapping): this;
    /**
     * Retrieves an aggregation strategy by its target entity property identifier.
     * @param {string} propertyName Entity attribute key.
     * @returns {Object|null} Registered mapping or null.
     */
    getDynamicFieldMapping(propertyName: string): DynamicMapping | null;
    /**
     * Retrieves an expansion strategy by its source database column identifier.
     * @param {string} columnName physical database column.
     * @returns {Object|null} Registered mapping or null.
     */
    getJsonExpansionMapping(columnName: string): JsonExpansionMapping | null;
    /**
     * Returns a collection of all active dynamic field aggregation strategies.
     * @returns {Array<Object>} Collection of registered mappings.
     */
    getAllDynamicFieldMappings(): DynamicMapping[];
    /**
     * Returns a collection of all active JSON expansion strategies.
     * @returns {Array<Object>} Collection of registered mappings.
     */
    getAllJsonExpansionMappings(): JsonExpansionMapping[];
    /**
     * Verifies if any dynamic field strategies are currently registered.
     * @returns {boolean} True if aggregation registry is non-empty.
     */
    hasDynamicFieldMappings(): boolean;
    /**
     * Verifies if any JSON expansion strategies are currently registered.
     * @returns {boolean} True if expansion registry is non-empty.
     */
    hasJsonExpansionMappings(): boolean;
    /**
     * Purges all mapping strategies from the configuration container.
     */
    clear(): void;
    /**
     * Locates the JSON expansion strategy that manages a specific entity property.
     * @param {string} propertyName Entity attribute key.
     * @returns {Object|null} Participating mapping or null.
     */
    findJsonExpansionMappingForProperty(propertyName: string): JsonExpansionMapping | null;
}
