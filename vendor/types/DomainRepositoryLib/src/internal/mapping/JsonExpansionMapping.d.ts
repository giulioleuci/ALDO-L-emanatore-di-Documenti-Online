import type { DomainRecord, DomainLogger } from '../contracts.js';
export interface JsonExpansionConfig {
    column: string;
    properties: string[];
    logger?: Pick<DomainLogger, 'warn' | 'error'> | null;
}
/**
 * Configuration for JSON-expanded property mapping.
 * Enables expanding a single JSON column into multiple first-class entity properties.
 *
 * @class
 */
export declare class JsonExpansionMapping {
    column: string;
    properties: string[];
    logger: Pick<DomainLogger, 'warn' | 'error'>;
    /**
     * Initializes expansion mapping with target column and constituent property keys.
     * @param {Object} config Configuration metadata.
     * @param {string} config.column physical database column containing JSON.
     * @param {Array<string>} config.properties Collection of keys to extract from or collapse into the JSON string.
     * @param {Object} [config.logger] Diagnostic output interface.
     */
    constructor(config: JsonExpansionConfig);
    /**
     * Enforces structural integrity of the expansion mapping configuration.
     * @private
     * @throws {Error} If column identifier is missing or properties list is invalid.
     */
    _validate(): void;
    /**
     * Parses JSON from the target column and expands constituent keys into individual object properties.
     * @param {Object} row Raw persistence data record.
     * @returns {Object} Extracted properties map.
     */
    hydrate(row: DomainRecord): DomainRecord;
    /**
     * Collapses individual entity properties back into a single JSON-serialized string for the target column.
     * @param {Object} entityData Attributes containing expanded properties.
     * @returns {Object} Object containing the serialized JSON column.
     */
    dehydrate(entityData: DomainRecord): DomainRecord;
    /**
     * Returns the physical database column identifier managed by this mapping.
     * @returns {string} Column name.
     */
    getColumnName(): string;
    /**
     * Retrieves the list of entity attribute keys participating in this expansion strategy.
     * @returns {Array<string>} Collection of property names.
     */
    getProperties(): string[];
    /**
     * Determines if a specific entity property is part of this expansion strategy.
     * @param {string} propertyName Attribute key to verify.
     * @returns {boolean} True if the property is in the constituent list.
     */
    managesProperty(propertyName: string): boolean;
}
