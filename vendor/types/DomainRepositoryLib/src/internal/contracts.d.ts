export type DomainRecord = Record<string, unknown>;
export type EntityId = string | number | null | undefined;
export interface EntityData {
    id?: EntityId;
    createdAt?: Date | string | number | null;
    updatedAt?: Date | string | number | null;
}
export interface DomainLogger {
    debug(message: string, ...context: unknown[]): unknown;
    warn(message: string, ...context: unknown[]): unknown;
    error(message: string, ...context: unknown[]): unknown;
    info?(message: string, ...context: unknown[]): unknown;
}
export interface MappingEntity {
    toData?(): object;
    getDynamicColumns?(): DomainRecord;
    captureDynamicColumns?(data: DomainRecord): void;
}
export type EntityFactory<E extends object> = {
    fromData(data: DomainRecord): E;
    name: string;
} | {
    new (data: DomainRecord): E;
    fromData?: (data: DomainRecord) => E;
    name: string;
};
export interface DomainQuery {
    where(field: string, operator: string, value: unknown): this;
    andWhere?(field: string, operator: string, value: unknown): this;
    orWhere?(field: string, operator: string, value: unknown): this;
    whereLike?(field: string, pattern: unknown): this;
    whereIn?(field: string, values: unknown): this;
}
export interface QuerySpecification<E = unknown> {
    isSatisfiedBy?(entity: E): boolean;
    toQuery?<Q extends DomainQuery>(queryBuilder: Q): Q;
    toQueryObject?(): DomainRecord | null | undefined;
    canBeTranslatedToQuery?(criteria?: DomainRecord | null): boolean;
    toString(): string;
}
export interface QueryAnalysis {
    valid: boolean;
    reason?: string | null;
    queryObjectCriteria?: DomainRecord | null;
}
export type PersistenceRow = DomainRecord & {
    id?: EntityId;
};
export interface RepositoryTable {
    getKeyField?(): string;
    getAllRows(): PersistenceRow[];
    getByPK(id: EntityId): PersistenceRow | null | undefined;
    insertRow(data: DomainRecord): PersistenceRow | null;
    insertRows(data: DomainRecord[]): PersistenceRow[];
    updateRowById(id: EntityId, data: DomainRecord): unknown;
    patchRow(id: EntityId, changes: object): PersistenceRow | null | undefined;
    deleteRowById(id: EntityId): unknown;
}
export interface RepositoryQuery extends DomainQuery {
    from(tableName: string): this;
    execute(): PersistenceRow[];
}
export interface RepositoryDatabase {
    tables: Record<string, RepositoryTable | undefined>;
    select(fields: string[]): {
        from(tableName: string): RepositoryQuery;
    };
    save(): unknown;
}
export interface RepositoryCache {
    get(key: string): unknown;
    put(key: string, value: string, expirationSeconds?: number): unknown;
    remove?(key: string): unknown;
}
export interface RepositoryRetry {
    executeWithRetry<T>(operation: () => T, parameters: object, attempts: number): T;
}
export interface RepositoryOptions {
    dryRun?: boolean;
}
export type DryRunEntity = DomainRecord & {
    id: string | number;
    dryRun: true;
};
export interface MapperProtocol {
    fromData<E extends object>(data: object, EntityClass: EntityFactory<E>): E;
    fromDataArray<E extends object>(data: object[], EntityClass: EntityFactory<E>): E[];
    toData(entity: object): DomainRecord;
    toDataArray(entities: object[]): DomainRecord[];
}
export interface QueryTranslatorProtocol {
    logger?: DomainLogger;
    validate(specification: QuerySpecification | null | undefined): QueryAnalysis;
    translate<Q extends DomainQuery>(specification: QuerySpecification, queryBuilder: Q, validation?: QueryAnalysis | null): Q;
}
