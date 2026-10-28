import type { DomainRecord, DomainLogger, EntityFactory } from '../contracts.js';
import type { DynamicFieldConfig, ColumnNames } from './DynamicFieldMapping.js';
import type { JsonExpansionConfig } from './JsonExpansionMapping.js';
import { MappingConfiguration } from './MappingConfiguration.js';
/**
 * Bidirectional transformer between domain Entity instances and persistent data structures, managing complex mapping strategies.
 * @class
 */
export declare class EntityMapper {
    logger: DomainLogger;
    _customTransformers: Map<string, {
        toData(value: unknown): unknown;
        fromData(value: unknown): unknown;
    }>;
    _mappingConfig: MappingConfiguration;
    /**
     * Initializes mapper with internal transformation registries and configuration containers.
     * @param {Object|null} [logger=null] Optional diagnostic logger.
     */
    constructor(logger?: DomainLogger | null);
    /**
     * Defines custom conversion logic for a specific entity attribute.
     * @param {string} fieldName target domain attribute identifier.
     * @param {Function} toData Transformation logic for persistence (entity -> data).
     * @param {Function} fromData Transformation logic for hydration (data -> entity).
     */
    registerTransformer<D, P>(fieldName: string, toData: (value: D) => P, fromData: (value: P) => D): void;
    /**
     * Registers a schema-driven strategy for aggregating multiple database columns into an entity Map property.
     * @param {Object} config Dynamic mapping configuration.
     * @returns {this} Chainable mapper instance.
     */
    configureDynamicField<V, C extends ColumnNames>(config: DynamicFieldConfig<V, C>): this;
    /**
     * Registers a strategy for expanding or collapsing individual database properties into a JSON-serialized column.
     * @param {Object} config JSON expansion configuration.
     * @returns {this} Chainable mapper instance.
     */
    configureJsonExpansion(config: JsonExpansionConfig): this;
    /**
     * Converts a domain Entity into a plain data record suitable for persistence, applying all registered transformers and expansions.
     * @param {Object} entity Domain entity to dehydrate.
     * @returns {Object|null} Persistence data record or null if entity is missing.
     */
    toData(entity: object): DomainRecord;
    toData(entity: null | undefined): null;
    toData(entity: object | null | undefined): DomainRecord | null;
    /**
     * Serializes an entity with no `toData()` method by copying its own
     * non-underscore-prefixed properties.
     * @private
     * @param {Object} entity Domain entity to serialize.
     * @returns {Object} Plain data record.
     */
    _serializeEntityFields(entity: object): DomainRecord;
    /**
     * Fills in any column captured by `Entity.captureDynamicColumns` that is not
     * already present in `data`, so wide/dynamic-column tables round-trip through
     * `Repository.save()` without the caller hand-building the merged row.
     * @private
     * @param {Object} data target data record (mutated in place).
     * @param {Object} entity source domain entity.
     */
    _applyDynamicColumnPassthrough(data: DomainRecord, entity: object): void;
    /**
     * Recursively reduces complex domain values (ValueObjects, Dates, nested Entities) into serializable primitives.
     * @private
     * @param {*} value domain-layer value to serialize.
     * @returns {*} Persistence-ready value.
     */
    _serializeValue(value: unknown): unknown;
    /**
     * Reconstitutes a domain Entity from a persistent data record using specified class and registered mappings.
     * @param {Object} data Raw persistence data record.
     * @param {Function} EntityClass Target domain entity constructor.
     * @returns {Object|null} Hydrated domain entity or null if data is missing.
     * @throws {DomainException} If EntityClass is not provided.
     */
    fromData<E extends object>(data: object, EntityClass: EntityFactory<E>): E;
    fromData<E extends object>(data: null | undefined, EntityClass: EntityFactory<E>): null;
    fromData<E extends object>(data: object | null | undefined, EntityClass: EntityFactory<E>): E | null;
    /**
     * Batch transforms multiple persistence records into hydrated domain entities.
     * @param {Object[]} dataArray Collection of raw records.
     * @param {Function} EntityClass Target domain entity constructor.
     * @returns {Object[]} Collection of hydrated domain entities.
     */
    fromDataArray<E extends object>(dataArray: object[], EntityClass: EntityFactory<E>): E[];
    /**
     * Batch transforms multiple domain entities into persistence records.
     * @param {Object[]} entities Collection of domain entities.
     * @returns {Object[]} Collection of raw persistence records.
     */
    toDataArray(entities: object[]): DomainRecord[];
    /**
     * Creates a deep structural copy of a persistence data object.
     * @param {Object} data Record to clone.
     * @returns {Object} cloned data record.
     */
    cloneData<T>(data: T): T;
    /**
     * Executes JSON-to-property expansion mappings on the provided data record.
     * @private
     * @param {Object} data target data record (mutated in place).
     */
    _applyJsonExpansionHydration(data: DomainRecord): void;
    /**
     * Executes property-to-JSON collapse mappings on the provided data record.
     * @private
     * @param {Object} data target data record (mutated in place).
     */
    _applyJsonExpansionDehydration(data: DomainRecord): void;
    /**
     * Executes multi-column-to-Map aggregation mappings on the provided data record.
     * @private
     * @param {Object} data target data record (mutated in place).
     */
    _applyDynamicFieldHydration(data: DomainRecord): void;
    /**
     * Executes Map-to-multi-column decomposition mappings on the provided data record.
     * @private
     * @param {Object} data target data record (mutated in place).
     * @param {Object} entity source domain entity for Map extraction.
     */
    _applyDynamicFieldDehydration(data: DomainRecord, entity: object): void;
}
