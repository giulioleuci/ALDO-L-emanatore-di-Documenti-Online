import type { DomainLogger, DomainRecord, EntityFactory, MapperProtocol } from '../contracts.js';
/**
 * Orchestrator for transforming persistence data records into domain Entity instances and vice versa.
 * @class
 */
export declare class HydrationService {
    logger: DomainLogger;
    entityMapper: MapperProtocol;
    /**
     * Initializes hydration service with specialized mapper and diagnostic dependencies.
     * @param {Object|null} [entityMapper=null] Transformation engine instance.
     * @param {Object|null} [logger=null] Optional diagnostic logger.
     */
    constructor(entityMapper?: MapperProtocol | null, logger?: DomainLogger | null);
    /**
     * Reconstitutes a single domain Entity from a raw data record.
     * @param {Object} data Raw persistence data record.
     * @param {Function} EntityClass Target domain entity constructor.
     * @returns {Object} Hydrated domain entity instance.
     */
    hydrate<E extends object>(data: object, EntityClass: EntityFactory<E>): E;
    /**
     * Reconstitutes a collection of domain Entities from a list of data records.
     * @param {Array<Object>} dataArray Collection of raw records.
     * @param {Function} EntityClass Target domain entity constructor.
     * @returns {Array<Object>} Collection of hydrated domain entities.
     */
    hydrateMany<E extends object>(dataArray: object[], EntityClass: EntityFactory<E>): E[];
    /**
     * Reduces a domain Entity instance into a plain data record for persistence.
     * @param {Object} entity Domain entity instance.
     * @returns {Object} Persistence-ready data record.
     */
    dehydrate(entity: object): DomainRecord;
    /**
     * Reduces a collection of domain Entities into persistence-ready data records.
     * @param {Array<Object>} entities Collection of domain entities.
     * @returns {Array<Object>} Collection of plain data records.
     */
    dehydrateMany(entities: object[]): DomainRecord[];
    /**
     * Records the baseline state on an entity instance to enable change detection.
     * @param {Object} entity Target domain entity.
     * @param {Object} data Baseline state record.
     */
    storeOriginalData(entity: object | null | undefined, data: object | null | undefined): void;
    /**
     * Resets the modification tracking registry on the specified entity.
     * @param {Object} entity Target domain entity.
     */
    clearDirtyFields(entity: object | null | undefined): void;
    /**
     * Synchronizes an existing entity instance with new data while maintaining object identity.
     * @param {Object} entity Target domain entity instance.
     * @param {Object} data Fresh state data for synchronization.
     */
    refresh(entity: object | null | undefined, data: object | null | undefined): void;
}
