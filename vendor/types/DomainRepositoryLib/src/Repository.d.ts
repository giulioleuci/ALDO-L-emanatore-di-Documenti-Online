import type { Entity } from './Entity.js';
import type { DomainLogger, EntityId, EntityFactory, PersistenceRow, RepositoryDatabase, RepositoryTable, RepositoryCache, RepositoryRetry, RepositoryOptions, QuerySpecification, MapperProtocol, QueryTranslatorProtocol, DryRunEntity } from './internal/contracts.js';
import { HydrationService } from './internal/mapping/HydrationService.js';
/**
 * Abstract base class for domain repositories, coordinating CRUD operations, specification-based querying, and entity mapping.
 * @abstract
 * @class
 */
export declare class Repository<E extends Entity = Entity> {
    database: RepositoryDatabase;
    tableName: string;
    EntityClass: EntityFactory<E>;
    logger: DomainLogger;
    cache: RepositoryCache | null;
    exceptionService: RepositoryRetry | null;
    _dryRun: boolean;
    entityMapper: MapperProtocol;
    hydrationService: HydrationService;
    queryTranslator: QueryTranslatorProtocol;
    _table: RepositoryTable;
    /**
     * Initializes repository with database dependencies and service facades.
     * @param {Object} database SheetDBLib database instance.
     * @param {string} tableName target table identifier.
     * @param {Function} EntityClass Constructor for domain entities.
     * @param {Object|null} [logger] Optional diagnostic logger.
     * @param {Object|null} [cache] Optional hydration cache.
     * @param {Object|null} [exceptionService] Optional resilience engine.
     * @param {Object} [options={}] Configuration overrides.
     * @param {boolean} [options.dryRun=false] Enable simulation mode.
     * @throws {TypeError} If attempting to instantiate the abstract class directly.
     */
    constructor(database: RepositoryDatabase, tableName: string, EntityClass: EntityFactory<E>, logger?: DomainLogger | null, cache?: RepositoryCache | null, exceptionService?: RepositoryRetry | null, options?: RepositoryOptions);
    /**
     * Evaluates if operations should be simulated based on instance state or method overrides.
     * @private
     * @param {Object} [options={}] Call-specific options.
     * @returns {boolean} True if simulation mode is active.
     */
    _isDryRun(options?: RepositoryOptions): boolean;
    /**
     * Resolves the primary table service from the database container.
     * @private
     * @returns {Object} Table interface for persistence operations.
     * @throws {DomainException} If database is invalid or table does not exist.
     */
    _getTable(): RepositoryTable;
    /**
     * Wraps an operation in transient error handling logic if ExceptionService is available.
     * @private
     * @param {Function} operation Logical block to execute.
     * @param {number} [maxRetries=3] Maximum attempt limit.
     * @returns {*} Result of the logical block execution.
     */
    _executeWithRetry<T>(operation: () => T, maxRetries?: number): T;
    /**
     * Drops rows whose primary-key cell is blank (e.g. a checkbox column pre-filled below the
     * data makes SheetDBLib return a row that has no identity). Such rows are never entities.
     * @private
     * @param {Array<Object>} rows Raw table rows.
     * @returns {Array<Object>} Rows with a non-blank primary key.
     */
    _withKey(rows: PersistenceRow[]): PersistenceRow[];
    /**
     * Retrieves all entities satisfying the provided domain specification.
     * @param {Object} specification Criteria for filtering entities.
     * @returns {Array<Object>} Collection of hydrated domain entities.
     * @throws {DomainException} If specification is invalid.
     */
    find(specification: QuerySpecification<E>): E[];
    /**
     * Retrieves the first entity satisfying the domain specification.
     * @param {Object} specification Criteria for filtering.
     * @returns {Object|null} First matching entity instance or null.
     */
    findOne(specification: QuerySpecification<E>): E | null;
    /**
     * Retrieves a single entity by its primary unique identifier with cache-first lookup.
     * @param {string} id Unique entity identifier.
     * @returns {Object|null} Hydrated entity or null if not found.
     */
    findById(id: EntityId): E | null;
    /**
     * Retrieves entity by ID or throws if non-existent.
     * @param {string} id Unique entity identifier.
     * @returns {Object} Hydrated entity instance.
     * @throws {EntityNotFoundException} If no record matches the identifier.
     */
    findByIdOrFail(id: EntityId): E;
    /**
     * Retrieves every record from the target table as hydrated entities.
     * @returns {Array<Object>} Collection of all entities in the repository.
     */
    findAll(): E[];
    /**
     * Verifies if at least one entity satisfies the specified criteria.
     * @param {Object} specification Criteria to test.
     * @returns {boolean} True if any matches are found.
     */
    exists(specification: QuerySpecification<E>): boolean;
    /**
     * Returns the total number of entities satisfying the specification.
     * @param {Object} specification Criteria for counting.
     * @returns {number} Count of matching records.
     */
    count(specification: QuerySpecification<E>): number;
    /**
     * Persists entity state via insertion or update, managing timestamps and dirty tracking.
     * @param {Object} entity Domain entity to persist.
     * @param {Object} [options={}] Operation configuration.
     * @returns {Object} The persisted entity with updated metadata.
     * @throws {ValidationException} If entity fails domain rules.
     */
    save(entity: E, options?: RepositoryOptions): E | DryRunEntity;
    /**
     * Executes batch persistence for multiple entities with bulk-insert optimization for new records.
     * @param {Array<Object>} entities Collection of entities to save.
     * @returns {Array<Object>} Collection of successfully persisted entities.
     */
    saveMany(entities: E[] | null | undefined): E[];
    /**
     * Performs a partial update on specific entity fields, minimizing I/O and API calls.
     * @param {Object} entity Target entity instance (must have ID).
     * @param {Object} changes Set of attributes to modify.
     * @returns {Object} The patched and re-validated entity.
     * @throws {DomainException} If entity lacks a valid identifier.
     */
    patch(entity: E, changes: Partial<E>): E;
    /**
     * Performs partial update on a record identified by its unique ID.
     * @param {string} id Unique entity identifier.
     * @param {Object} changes Set of attributes to modify.
     * @returns {Object} The updated domain entity.
     */
    patchById(id: EntityId, changes: Partial<E>): E;
    /**
     * Removes an entity instance from the persistent store.
     * @param {Object} entity Target entity to remove.
     * @throws {DomainException} If entity lacks a valid identifier.
     */
    delete(entity: E): void;
    /**
     * Removes a record from the persistent store using its unique identifier.
     * @param {string} id Unique entity identifier.
     */
    deleteById(id: EntityId): void;
    /**
     * Removes multiple entities from the persistent store in a batch operation.
     * @param {Array<Object>} entities Collection of entities to remove.
     */
    deleteMany(entities: E[] | null | undefined): void;
    /**
     * Synchronizes entity state with the current data in the persistent store.
     * @param {Object} entity Entity instance to refresh.
     * @returns {Object} The synchronized entity instance.
     * @throws {EntityNotFoundException} If the record no longer exists in the store.
     */
    refresh(entity: E): E;
    /**
     * Clears the cache for this repository.
     * @private
     */
    _clearCache(entityId: EntityId): void;
    /**
     * Returns the low-level TableService instance managed by the repository.
     * @returns {Object} Active table service.
     */
    getTable(): RepositoryTable;
    /**
     * Returns the entity constructor used by this repository.
     * @returns {Function} Entity class constructor.
     */
    getEntityClass(): EntityFactory<E>;
    /**
     * Returns the name of the target table in the database.
     * @returns {string} Table identifier.
     */
    getTableName(): string;
}
