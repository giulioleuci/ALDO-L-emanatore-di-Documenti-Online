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

  // --- ContextEngine (L3): registry + interceptor building blocks ---
  // SGSA's ContextBuilder assembles the nested CDU itself (spec 09 §2, which the
  // library's flat-keyed ContextAssembler does not do), but reuses these public
  // components: the ProviderRegistry (Registry Pattern), the InterceptorRegistry
  // + ContextInterceptor middleware (SwapAndEnrichInterceptor), and the shared
  // ExpressionEngine for conditions.
  interface LibContextProvider { provide(...args: unknown[]): unknown }
  interface LibContextInterceptor {
    intercept(name: string, data: unknown, context: unknown, options?: unknown): unknown;
  }
  class ProviderRegistry {
    constructor(logger: LoggerService);
    registerSingleton(type: string, instance: LibContextProvider): this;
    registerFactory(type: string, factory: () => LibContextProvider): this;
    get(type: string): LibContextProvider;
    has(type: string): boolean;
    unregister(type: string): boolean;
    clear(): this;
    getRegisteredTypes(): string[];
  }
  class InterceptorRegistry {
    constructor(logger: LoggerService);
    registerSingleton(type: string, instance: LibContextInterceptor): this;
    getAll(): LibContextInterceptor[];
    getRegisteredTypes(): string[];
  }
  abstract class ContextInterceptor {
    constructor(logger: LoggerService);
    intercept(name: string, data: unknown, context: unknown, options?: unknown): unknown;
    // Template-method hooks overridden by subclasses (public `intercept` wraps them
    // with validation, timing and logging).
    protected _shouldIntercept(name: string, data: unknown, context: unknown, options?: unknown): boolean;
    protected _performIntercept(name: string, data: unknown, context: unknown, options?: unknown): unknown;
  }

  // --- SheetDBLib (L2): ORM entry point (tables, save, ACID-like transactions) ---
  interface SheetTableService {
    getRows(): Record<string, unknown>[];
    insertRow(data: Record<string, unknown>): Record<string, unknown>;
    updateRowById(id: string, data: Record<string, unknown>): void;
    patchRow(id: string, partialData: Record<string, unknown>): void;
    deleteRowById(id: string): void;
  }
  class DatabaseService {
    constructor(spreadsheetId: string, logger: LoggerService, utils?: unknown, cache?: unknown);
    readonly tables: Record<string, SheetTableService>;
    save(): void;
    beginTransaction(): void;
    commit(): void;
    rollback(): void;
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

  // --- WorkspaceTemplateEngine (L2): Mustache engine + PlaceholderService facade ---
  // processString renders `{{path.to.value | filter}}` templates against a nested
  // context (the CDU); processDocument/processSheet perform in-place structural
  // rendering of Drive files (reverse-order strategy, batch updates).
  class Mustache {
    constructor(options: { logger: LoggerService });
    render(template: string, context?: Record<string, unknown> | null): string;
    registerFilter(filter: unknown): void;
  }
  class PlaceholderService {
    constructor(options: {
      logger: LoggerService;
      mustache: Mustache;
      utils?: unknown;
      cache?: unknown;
      strictFilters?: boolean;
    });
    processString(template: string, context?: Record<string, unknown> | null): string;
    resolve(template: string, context?: Record<string, unknown> | null): string;
    processDocument(documentId: string, context?: Record<string, unknown>): boolean;
    processSheet(sheetId: string, context?: Record<string, unknown>, sheetName?: string): boolean;
  }

  // --- PipelineFramework (L3): Pipeline / Step / PipelineContext ---
  interface StepExecutionResult {
    success: boolean;
    skipped: boolean;
    durationMs: number;
    error?: Error;
  }
  interface StepOptions {
    requiredKeys?: string[];
    continueOnError?: boolean;
    shouldExecuteCondition?: ((context: PipelineContext) => boolean) | null;
  }
  interface StepExecutionRecord {
    stepName: string;
    status: 'completed' | 'skipped' | 'failed';
    durationMs: number;
    details: Record<string, unknown>;
    timestamp: number;
  }
  class PipelineContext {
    constructor(initialData?: Record<string, unknown> | null);
    getData(): Record<string, unknown>;
    get<T = unknown>(key: string, defaultValue?: T | null): T | null;
    set(key: string, value: unknown): this;
    has(key: string): boolean;
    requestStop(reason?: string): this;
    shouldStop(): boolean;
    getStopReason(): string | null;
    getExecutionHistory(): StepExecutionRecord[];
    setFlag(name: string, value: unknown): this;
    getFlag<T = unknown>(name: string, defaultValue?: T | null): T | null;
    getTotalDuration(): number;
    getSummary(): {
      startTime: number;
      endTime: number | null;
      totalDuration: number;
      totalSteps: number;
      completedSteps: number;
      skippedSteps: number;
      failedSteps: number;
      stopRequested: boolean;
      stopReason: string | null;
      history: StepExecutionRecord[];
    };
  }
  abstract class Step {
    constructor(name: string, logger: LoggerService, options?: StepOptions);
    getName(): string;
    readonly logger: LoggerService;
    shouldExecute(context: PipelineContext): boolean;
    protected verifyContext(context: PipelineContext, requiredKeys?: string[]): void;
    protected setResult(context: PipelineContext, key: string, value: unknown): this;
    protected getContextValue<T = unknown>(context: PipelineContext, key: string, defaultValue?: T | null): T | null;
    protected abstract _executeLogic(context: PipelineContext): void;
    execute(context: PipelineContext): StepExecutionResult;
  }
  class Pipeline {
    constructor(
      logger: LoggerService,
      exceptionService?: unknown | null,
      options?: {
        name?: string;
        stopOnError?: boolean;
        maxRetries?: number;
        monitor?: unknown;
        jobId?: string | null;
        dryRun?: boolean;
      }
    );
    getName(): string;
    getSteps(): Step[];
    addStep(step: Step): this;
    beforeStep(callback: (step: Step, context: PipelineContext) => void): this;
    afterStep(callback: (step: Step, context: PipelineContext, result: StepExecutionResult) => void): this;
    onError(callback: (step: Step, context: PipelineContext, error: Error) => void): this;
    onComplete(callback: (context: PipelineContext, success: boolean) => void): this;
    execute(initialData?: Record<string, unknown> | null, options?: { dryRun?: boolean }): PipelineContext;
    clearSteps(): this;
  }
  class StepExecutionError extends Error {}

  // --- RoleResolutionLib (L4): delegation-chain building blocks ---
  // SGSA maps SUPPLENZE rows to Delegation value objects and delegates the
  // transitive supply-of-supply crawl (cycle-guarded) to the library.
  interface DelegationDefinition {
    id: string;
    principalId: string;
    delegateId: string;
    roleIds?: string[] | '*';
    scope?: unknown;
    scopeRestriction?: unknown;
    validFrom?: Date | string;
    validTo?: Date | string | null;
    routingPolicy?: string;
    isActive?: boolean;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
  class Delegation {
    constructor(definition: DelegationDefinition);
    readonly id: string;
    readonly principalId: string;
    readonly delegateId: string;
    readonly roleIds: string[] | '*';
    isValidAt(date?: Date): boolean;
    appliesToRole(roleId: string): boolean;
    getMetadata(): Record<string, unknown>;
  }
  class Scope {
    static global(): Scope;
    static orgUnit(value: string): Scope;
    static project(value: string): Scope;
    static resource(resourceType: string, value: string): Scope;
    static custom(type: string, value: string): Scope;
    readonly type: string;
    readonly value: string | null;
  }
  class InMemoryDelegationSource {
    constructor(data?: { delegations?: Delegation[] });
    addDelegation(delegation: Delegation): void;
    getActiveDelegationsForPrincipal(principalId: string, asOfDate?: Date): Delegation[];
    getActiveDelegationsForDelegate(delegateId: string, asOfDate?: Date): Delegation[];
    getDelegationChain(actorId: string, roleId: string, scope: unknown, asOfDate?: Date): Delegation[];
    getAllDelegations(): Delegation[];
    clear(): void;
  }

  // --- JobRunnerLib (L3): long-running jobs via generator functions ---
  type JobHandlerParams = Record<string, unknown> & { resumeState?: unknown };
  type JobHandler = (params: JobHandlerParams) => Generator<unknown, unknown, unknown>;
  interface JobQueueLike {
    registerJobHandler(jobType: string, handler: JobHandler): void;
  }
  class UtilsService {
    constructor(sleeperOrLogger?: unknown);
    /** Token-based date formatting (YYYY, MM, DD, HH, mm, ss, SSS); `utc:true` derives tokens from UTC components. */
    formatDate(date: Date, format?: string, options?: { utc?: boolean }): string | null;
    formatISODate(date: Date): string | null;
  }
  class JobDefinitionRegistry {
    constructor(logger: LoggerService);
    register(name: string, definition: Record<string, unknown>): void;
    getDefinition(name: string): Record<string, unknown> | null;
  }
  class JobRunnerService {
    constructor(logger: LoggerService, utils: UtilsService, registry: JobDefinitionRegistry);
    run(
      jobName: string,
      jobType: string,
      params: Record<string, unknown>,
      registryCallback: (queue: JobQueueLike, services?: unknown) => void,
      forceRestart?: boolean
    ): unknown;
    resume(jobName: string, registryCallback: (queue: JobQueueLike, services?: unknown) => void): unknown;
    getStatus(jobName: string): { state: string; percentage?: number };
    cancelJob(jobName: string): void;
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
