import type { DomainRecord, EntityData, EntityId } from './internal/contracts.js';
/**
 * Abstract base class for domain entities providing identity management, lifecycle tracking, and validation.
 * @abstract
 * @class
 */
export declare class Entity {
    _id: EntityId;
    _createdAt: Date;
    _updatedAt: Date;
    _dirtyFields: Set<string>;
    _originalData: DomainRecord;
    _validationErrors: Array<{
        field: string;
        message: string;
    }>;
    _dynamicColumns: DomainRecord;
    /**
     * Initializes entity state including identity, timestamps, and change tracking registries.
     * @param {Object} [data={}] Initial attribute data.
     * @param {string} [data.id] Unique entity identifier.
     * @param {Date|string} [data.createdAt] Original creation timestamp.
     * @param {Date|string} [data.updatedAt] Last modification timestamp.
     * @throws {TypeError} If attempting to instantiate the abstract class directly.
     */
    constructor(data?: EntityData);
    /**
     * Gets the entity ID.
     *
     * @returns {string|null} The entity ID
     */
    get id(): EntityId;
    /**
     * Sets the entity ID.
     *
     * @param {string} value - The entity ID
     */
    set id(value: EntityId);
    /**
     * Gets the creation timestamp.
     *
     * @returns {Date} The creation timestamp
     */
    get createdAt(): Date;
    /**
     * Gets the last update timestamp.
     *
     * @returns {Date} The last update timestamp
     */
    get updatedAt(): Date;
    /**
     * Centralized date parser delegating to CoreUtilsLib for consistent format handling.
     * @private
     * @param {Date|string|number} value Raw date input.
     * @returns {Date|null} Parsed Date object or null if unparseable.
     */
    _parseDate(value: Date | string | number | null | undefined): Date | null;
    /**
     * Registers a field as modified and updates the internal modification timestamp.
     * @param {string} fieldName Name of the modified attribute.
     */
    markDirty(fieldName: string): void;
    /**
     * Checks if a field has been modified since the last state synchronization.
     * @param {string} fieldName Attribute name to verify.
     * @returns {boolean} True if the field is in the dirty registry.
     */
    isDirty(fieldName: string): boolean;
    /**
     * Retrieves all fields that have been modified since the entity was loaded or cleared.
     * @returns {string[]} Collection of dirty field names.
     */
    getDirtyFields(): string[];
    /**
     * Determines if the entity instance contains any pending uncommitted changes.
     * @returns {boolean} True if the dirty fields registry is non-empty.
     */
    hasDirtyFields(): boolean;
    /**
     * Clears all dirty field markers.
     */
    clearDirtyFields(): void;
    /**
     * Gets the changes made to the entity since load.
     *
     * @returns {Object} Object with changed fields and their current values
     */
    getChanges(): DomainRecord;
    /**
     * Stores the original data for comparison.
     *
     * @param {Object} data - The original data
     */
    storeOriginalData(data: object | null | undefined): void;
    /**
     * Gets the original value of a field.
     *
     * @param {string} fieldName - The field name
     * @returns {*} The original value
     */
    getOriginalValue(fieldName: string): unknown;
    /**
     * Captures persistence columns not covered by this entity's own `toData()`
     * schema, so a later `save()` round-trip does not silently drop them. Opt-in:
     * a subclass whose physical schema is only partially known at compile time
     * (e.g. a wide, per-subject matrix table generated at runtime from another
     * table) declares a static `getKnownColumns()` returning its fixed column
     * names; every other raw column present at hydration time is captured
     * verbatim and merged back unmodified by `EntityMapper.toData()` (see
     * `getDynamicColumns`). Entities that don't declare `getKnownColumns()` are
     * unaffected (no-op).
     * @param {Object} data Raw persistence record this entity was hydrated from.
     */
    captureDynamicColumns(data: object): void;
    /**
     * Dynamic (schema-unknown-at-compile-time) columns captured at hydration time
     * (see `captureDynamicColumns`), merged back into the persisted row by
     * `EntityMapper.toData()` for any key not already produced by the entity's
     * own `toData()`.
     * @returns {Object} Shallow copy of the captured dynamic columns.
     */
    getDynamicColumns(): {
        [x: string]: unknown;
    };
    /**
     * Sets (or adds) a single dynamic column value and marks it dirty, without
     * requiring the subclass to model every wide-table column as a typed
     * property. The value participates in the next `save()` via
     * `getDynamicColumns()`.
     * @param {string} column Column name.
     * @param {*} value New value.
     */
    setDynamicColumn(column: string, value: unknown): void;
    /**
     * Validates the entity against its specifications.
     * Subclasses should override this method to implement validation.
     *
     * @returns {boolean} True if valid
     */
    validate(): boolean;
    /**
     * Checks if the entity is valid.
     *
     * @returns {boolean} True if valid
     */
    isValid(): boolean;
    /**
     * Gets validation errors.
     *
     * @returns {Array<Object>} Array of validation error objects
     */
    getValidationErrors(): {
        field: string;
        message: string;
    }[];
    /**
     * Adds a validation error.
     *
     * @protected
     * @param {string} field - The field name
     * @param {string} message - The error message
     */
    addValidationError(field: string, message: string): void;
    /**
     * Throws a ValidationException if the entity is invalid.
     *
     * @throws {ValidationException} If validation fails
     */
    validateOrThrow(): void;
    /**
     * Compares this entity to another for equality.
     * Entities are equal if they have the same ID.
     *
     * @param {Entity} other - The other entity
     * @returns {boolean} True if equal
     */
    equals(other: unknown): boolean;
    /**
     * Converts the entity to a plain object for persistence.
     * Subclasses must implement this method.
     *
     * @abstract
     * @returns {Object} Plain object representation
     */
    toData(): object;
    /**
     * Creates an entity instance from a plain object.
     * Subclasses must implement this static method.
     *
     * @abstract
     * @static
     * @param {Object} data - Plain object data
     * @returns {Entity} Entity instance
     */
    static fromData(_data: object): Entity;
    /**
     * Gets a string representation of the entity.
     *
     * @returns {string} String representation
     */
    toString(): string;
}
