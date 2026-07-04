// Ambient declarations for GasLibraryFactory globals (vendored bundle).
// Authored from GasLibraryFactory/DOCS_LIBS/*_docs.md. Extend as needed.
export {};

declare global {
  // --- CoreUtilsLib (L0) ---
  class LoggerService {
    trace(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  }

  // --- GasExpressionEngineLib (L2): safe AST expression evaluation (no eval) ---
  // evaluate() resolves {{path}} placeholders from `context` then evaluates the
  // expression (custom operators: in/between/match; functions: len/abs/round…).
  class ExpressionEngineService {
    constructor(options: { logger: LoggerService; utils?: unknown; cache?: unknown });
    evaluate(expression: string, context?: Record<string, unknown>): unknown;
  }

  // --- SheetDBLib (L2): minimal read/write surface used by the slice ---
  type SheetRow = Record<string, string | number | boolean | null>;
  interface SheetTable {
    findAll(): SheetRow[];
    find(predicate: (row: SheetRow) => boolean): SheetRow | null;
    insert(row: SheetRow): void;
  }
  class SheetDatabase {
    table(name: string): SheetTable;
    save(): void;
  }

  // --- GoogleApiWrapper (L2): Drive/Document facade globals ---
  class DriveService {
    findFolderByPath(path: string): string | null;
    createFolderPath(path: string): string;
    copyFile(templateId: string, name: string, folderId: string): string;
    setPermission(fileId: string, email: string, permesso: string): void;
    trashFile(fileId: string): void;
    countFiles(folderId: string): number;
  }
  class WorkspaceTemplateEngine {
    renderDoc(fileId: string, replacements: Record<string, string>): void;
  }

  // --- DomainRepositoryLib (L3): DDD base classes (from its public API) ---
  type EntityData = Record<string, unknown>;

  abstract class Entity {
    constructor(data?: EntityData);
    id: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    markDirty(fieldName: string): void;
    isDirty(fieldName: string): boolean;
    getDirtyFields(): string[];
    hasDirtyFields(): boolean;
    storeOriginalData(data: EntityData): void;
    equals(other: Entity): boolean;
    toData(): EntityData;
  }

  // Minimal seam Repository requires of its injected database (satisfied by
  // SheetDBLib's DatabaseService at runtime, or FakeDatabaseService in tests).
  // The write seam DomainRepositoryLib's Repository.save() drives: insertRow on
  // create (returns the stored row so the entity id can be read back),
  // updateRowById on update. Satisfied by SheetDBLib's table at runtime, or
  // FakeDatabase's FakeTable in tests.
  interface RepositoryTable {
    getByPK(id: string): EntityData | null;
    getAllRows(): EntityData[];
    insertRow(row: EntityData): EntityData;
    updateRowById(id: string, row: EntityData): void;
    // Composite-key write: replace the single row matching ALL `match` columns
    // (append if none). Composite-PK tables have no single physical key, so their
    // repositories resolve the target row by business columns; a real adapter
    // implements this via getAllRows + a physical-key/row-index write.
    updateRowWhere(match: EntityData, row: EntityData): void;
  }
  interface RepositoryDatabase {
    tables: Record<string, RepositoryTable>;
    save(): void;
  }

  abstract class Repository<T extends Entity = Entity> {
    constructor(
      database: RepositoryDatabase,
      tableName: string,
      EntityClass: new (data?: EntityData) => T,
      logger?: unknown,
      cache?: unknown,
      exceptionService?: unknown,
      options?: { dryRun?: boolean }
    );
    readonly database: RepositoryDatabase;
    readonly tableName: string;
    find(specification: SpecificationLike): T[];
    findOne(specification: SpecificationLike): T | null;
    findById(id: string): T | null;
    findByIdOrFail(id: string): T;
    findAll(): T[];
    exists(specification: SpecificationLike): boolean;
    count(specification: SpecificationLike): number;
    save(entity: T, options?: { dryRun?: boolean }): void;
    saveMany(entities: T[]): void;
    getTableName(): string;
  }

  interface SpecificationLike {
    isSatisfiedBy(entity: unknown): boolean;
    toQueryObject?(): Record<string, unknown> | null;
    and(other: SpecificationLike): SpecificationLike;
    or(other: SpecificationLike): SpecificationLike;
    not(): SpecificationLike;
  }
  abstract class Specification implements SpecificationLike {
    abstract isSatisfiedBy(entity: unknown): boolean;
    and(other: SpecificationLike): SpecificationLike;
    or(other: SpecificationLike): SpecificationLike;
    not(): SpecificationLike;
  }
  class FieldSpecification extends Specification {
    constructor(field: string, operator: string, value: unknown);
    isSatisfiedBy(entity: unknown): boolean;
    toQueryObject(): Record<string, unknown> | null;
  }
  class FunctionSpecification extends Specification {
    constructor(predicate: (entity: unknown) => boolean);
    isSatisfiedBy(entity: unknown): boolean;
  }
  class CompositeSpecification extends Specification {
    isSatisfiedBy(entity: unknown): boolean;
  }
  class EntityNotFoundException extends Error {}
}
