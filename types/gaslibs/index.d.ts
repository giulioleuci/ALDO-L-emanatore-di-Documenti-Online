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

  class HtmlSanitizer {
    static escapeHtml(value: string): string;
    static safeColor(value: string, fallback: string): string;
    static safeUrl(value: string): string;
  }

  /** Generic lazy-singleton DI container (ref REPORT_GLF.md B8). */
  class LazyServiceContainer {
    constructor(options?: { logger?: unknown; entityName?: string });
    register<T>(name: string, factory: (container: LazyServiceContainer) => T): void;
    has(name: string): boolean;
    get<T>(name: string): T;
    reset(): void;
    clear(): void;
  }

  // --- GasExpressionEngineLib (L2): safe AST expression evaluation (no eval) ---
  // evaluate() resolves {{path}} placeholders from `context` then evaluates the
  // expression (custom operators: in/between/match; functions: len/abs/round…).
  class ExpressionEngineService {
    constructor(options: { logger: LoggerService; utils?: unknown; cache?: unknown });
    evaluate(expression: string, context?: Record<string, unknown>): unknown;
  }

  // --- ContextEngine (L3): registry + interceptor building blocks ---
  // SGSA's ContextBuilder assembles the nested CDU via the library's
  // ContextAssembler.assembleInto() MUTATION mode (added for exactly this use
  // case): every registered provider receives the SAME shared CDU object
  // across the whole recipe run and mutates it in place (matching
  // ContextProvider.provide(cdu, params, options): void), instead of the
  // library's original `assemble()` flat, provider-name-keyed merge — which
  // remains available/unchanged for consumers that want that shape. Reused
  // as-is: ProviderRegistry (Registry Pattern), InterceptorRegistry +
  // ContextInterceptor middleware (SwapAndEnrichInterceptor, generalized with
  // `targetPaths` for per-item nested-array swaps — see below), and the
  // shared ExpressionEngine for conditions.
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
    /**
     * Walks the array resolved at `path` (dot-path, e.g.
     * 'focus.classe.consiglioDiClasse') on `data` and calls
     * `itemFn(item, index, array)` for each element. `itemFn` may mutate the
     * item in place (return undefined/null) or return a 3-way outcome
     * `{ action: 'replace', value } | { action: 'annotate', meta } | { action: 'skip' }`
     * that this helper applies. No-op (with a debug log) if `path` does not
     * resolve to an array.
     */
    protected _forEachAt(
      data: unknown,
      path: string,
      itemFn: (item: unknown, index: number, array: unknown[]) => void | null | {
        action: 'replace' | 'annotate' | 'skip';
        value?: unknown;
        meta?: Record<string, unknown>;
      }
    ): void;
  }
  interface ContextAssemblerRecipe {
    providers: Array<{
      name: string;
      type: string;
      parameters?: Record<string, unknown>;
      condition?: string | null;
      postProcess?: Array<{ type: string; [key: string]: unknown }>;
    }>;
  }
  /**
   * Facade for assembling data contexts from declarative JSON recipes.
   * `assemble()` (flat mode) merges each provider's RETURN VALUE into a fresh
   * `{ providerName: output }` map. `assembleInto()` (mutation mode) instead
   * has every provider MUTATE the same `sharedTarget` object in place across
   * the whole recipe run and IGNORES provider return values — this is the
   * mode SGSA's ContextBuilder uses to assemble the nested CDU.
   */
  class ContextAssembler {
    constructor(
      logger: LoggerService,
      providerRegistry: ProviderRegistry,
      expressionEngine?: unknown | null,
      exceptionService?: unknown | null,
      interceptorRegistry?: InterceptorRegistry | null,
      options?: { maxRetries?: number }
    );
    assemble(recipe: ContextAssemblerRecipe, initialParams?: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
    assembleAsync(recipe: ContextAssemblerRecipe, initialParams?: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
    /** Mutation mode — see class doc. Returns `sharedTarget` (mutated in place) for convenience. */
    assembleInto<T extends object>(
      sharedTarget: T,
      recipe: ContextAssemblerRecipe,
      initialParams?: object,
      options?: object
    ): T;
  }
  /**
   * Entity substitution interceptor. Default (atomic) mode swaps the WHOLE
   * `data` payload via `substitutionLookup(data, context, options) => substitute|null`.
   * `config.targetPaths` mode instead walks one or more nested arrays (via
   * the base class's `_forEachAt`) and calls `substitutionLookup(item,
   * context, options)` once PER ITEM, expecting back `null` (no swap) or a
   * `_forEachAt` 3-way outcome descriptor — this is what SGSA uses to make an
   * independent per-docente decision under the GestioneSupplenti 3-way rule
   * across `focus.classe.consiglioDiClasse`/`focus.alunno.consiglioDiClasseFiltrato`,
   * with the rule itself read from `options` inside the callback (NOT via the
   * library's own boolean `optionFlag`/`_shouldIntercept` gate, which is
   * skipped automatically once `targetPaths` is configured — see the
   * library's JSDoc for why a single global boolean can't express an N-way
   * per-item rule).
   */
  class SwapAndEnrichInterceptor extends ContextInterceptor {
    constructor(
      logger: LoggerService,
      substitutionLookup: (item: unknown, context: unknown, options: unknown) => unknown,
      config?: {
        originalPropertyName?: string;
        metadataFlags?: Record<string, unknown>;
        targetProviders?: string[] | null;
        optionFlag?: string;
        targetPaths?: string[] | null;
      }
    );
  }

  // --- SheetDBLib (L2): ORM entry point (tables, save, ACID-like transactions) ---
  interface SheetTableService {
    getRows(): Record<string, unknown>[];
    getAllRows(): Record<string, unknown>[];
    getByPK(pkValue: string): Record<string, unknown> | null;
    insertRow(data: Record<string, unknown>): Record<string, unknown>;
    updateRowById(id: string, data: Record<string, unknown>): void;
    patchRow(id: string, partialData: Record<string, unknown>): void;
    deleteRowById(id: string): void;
    defineVirtualColumn(columnName: string, compute: (row: Record<string, unknown>) => unknown): unknown;
    setPrimaryKey(columnName: string): unknown;
    // O(1) exact-match lookup seam (ref REPORT_GLF.md A2): createIndex builds a
    // Map-based memory index; _indexedLookup returns matching rows or null when
    // no index has been built for that column (caller falls back to a scan).
    createIndex(columnName: string): unknown;
    _indexedLookup(columnName: string, value: unknown): Record<string, unknown>[] | null;
  }
  class DatabaseService {
    constructor(spreadsheetId: string, logger: LoggerService, utils?: unknown, cache?: unknown);
    readonly tables: Record<string, SheetTableService>;
    save(): void;
    beginTransaction(): void;
    commit(): void;
    rollback(): void;
  }
  /** SheetDBLib table (the concrete class behind DatabaseService.tables). */
  class TableService {
    constructor(
      sheetName: string,
      spreadsheetId: string,
      spreadsheetService: unknown,
      logger: LoggerService,
      utils: unknown,
      preloadedData?: unknown[][] | null,
      schemaValidator?: unknown
    );
    getRows(): Record<string, unknown>[];
    getAllRows(): Record<string, unknown>[];
    getByPK(pkValue: string): Record<string, unknown> | null;
    insertRow(data: Record<string, unknown>): Record<string, unknown>;
    updateRowById(id: string, data: Record<string, unknown>): Record<string, unknown>;
    patchRow(id: string, partialData: Record<string, unknown>): Record<string, unknown>;
    deleteRowById(id: string): void;
    /** Computed column added to reads; excluded from physical writes. */
    defineVirtualColumn(columnName: string, compute: (row: Record<string, unknown>) => unknown): TableService;
    setPrimaryKey(columnName: string): TableService;
    flush(options?: Record<string, unknown>): number;
    createIndex(columnName: string): TableService;
    _indexedLookup(columnName: string, value: unknown): Record<string, unknown>[] | null;
  }

  // --- GoogleApiWrapper (L1/L2): Drive globals (the REAL bound API, verified
  // against the vendored bundle — DriveService composes DriveFileManager/
  // DriveFolderManager/DriveMetadataService and binds their methods onto the
  // instance; there is no findFolderByPath/copyFile/setPermission/trashFile/
  // countFiles on the library itself. DriveServiceFacade composes these into
  // ALDO's higher-level IDriveFacade contract). ---
  interface DriveBatchOutcome<T> {
    successful: Array<{ id: string; status: number; data: T }>;
    failed: Array<{ id: string; status: number; error: Error }>;
  }
  interface DriveFileMetadata {
    id: string;
    name: string;
    mimeType: string;
    parents?: string[];
  }
  class DriveService {
    // DriveFileManager
    deleteFiles(fileIds: string | string[], options?: { permanently?: boolean }): DriveBatchOutcome<null>;
    copyFiles(
      requests: Array<{ fileId: string; name?: string; destinationFolder?: string }>,
      options?: Record<string, unknown>
    ): DriveBatchOutcome<{ id: string; name: string; parents: string[] }>;
    /** Native DriveApp File/Folder object (e.g. for `.getBlob()`). */
    getFileByIdStandard(fileId: string): { getBlob(): unknown };
    // DriveFolderManager
    createFolder(folderName: string, parentFolderId?: string | null, options?: Record<string, unknown>): unknown;
    // DriveMetadataService
    getFiles(fileIds: string | string[], options?: { fields?: string }): DriveFileMetadata | Record<string, DriveFileMetadata | null>;
    searchFiles(query: string, options?: { maxResults?: number; orderBy?: string }): DriveFileMetadata[];
  }
  class PermissionService {
    /** `role` is a Drive API v3 role: 'writer' | 'reader' | 'commenter'. */
    shareWithUsers(
      fileIds: string | string[],
      permissions: Array<{ type?: string; role: string; email: string; sendEmail?: boolean }>,
      options?: { sendNotificationEmail?: boolean }
    ): DriveBatchOutcome<unknown>;
    removeAccess(fileIds: string | string[], emailsOrPermissionIds: string | string[]): DriveBatchOutcome<unknown>;
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
  /** One resolved `{{dynamic_columns[...]}}` column (data column or, from the 2nd
   * group onward, a structural label column — `isLabel: true`, never ACL'd). */
  interface SheetColumnLayout {
    header: unknown;
    /** 1-based spreadsheet column number. */
    column: number;
    isLabel: boolean;
    /** Raw source-array entry this column was resolved from; null for label columns (ref REPORT_GLF.md B5). */
    item: unknown;
  }
  /** One `{{dynamic_columns[...]}}` placeholder's fully-resolved layout. */
  interface SheetGroupLayout {
    sheetName: string;
    headerRow: number;
    startColumn: number;
    columns: SheetColumnLayout[];
  }
  interface SheetProcessResult {
    success: boolean;
    layouts: SheetGroupLayout[];
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
    /** Also expands `{{table[source=<contextPath>, headerRow=<bool>]}}` in place
     * (ref REPORT_GLF.md B7): `source` must resolve to a non-empty 2D array
     * already shaped as table rows/cells. */
    processDocument(documentId: string, context?: Record<string, unknown>): boolean;
    /** Return shape changed from `boolean` to `{success, layouts}`: `layouts` reports,
     * per `{{dynamic_columns[...]}}` placeholder found while scanning, the resolved
     * column positions — needed by callers (e.g. ACL logic) that can't be expressed by
     * the directive's own static `acl=` expression. `success` is `false` (layouts
     * empty) on any processing error, matching the pre-existing swallow-and-log behavior. */
    processSheet(sheetId: string, context?: Record<string, unknown>, sheetName?: string): SheetProcessResult;
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

  // --- RoleResolutionLib: routing (ref REPORT_GLF.md B4) and priority-chain
  // resolution (ref B3), used by RisolutoreRuoliService/CattedraResolver
  // instead of hand-rolled policy switches / source-priority if-chains.
  type RoutingPolicyValue =
    | 'DELEGATE_ONLY'
    | 'PRINCIPAL_ONLY'
    | 'BOTH_EQUAL'
    | 'DELEGATE_PRIMARY_PRINCIPAL_CC'
    | 'PRINCIPAL_PRIMARY_DELEGATE_CC'
    | 'CHAIN_ALL'
    | 'DELEGATE_OR_PRINCIPAL';
  const RoutingPolicy: Record<
    | 'DELEGATE_ONLY'
    | 'PRINCIPAL_ONLY'
    | 'BOTH_EQUAL'
    | 'DELEGATE_PRIMARY_PRINCIPAL_CC'
    | 'PRINCIPAL_PRIMARY_DELEGATE_CC'
    | 'CHAIN_ALL'
    | 'DELEGATE_OR_PRINCIPAL',
    RoutingPolicyValue
  >;
  const ActorType: Record<'PERSON' | 'SYSTEM' | 'GROUP', string>;
  class Actor {
    constructor(id: string, type: string, identifier: string, displayName: string, metadata?: Record<string, unknown>);
    readonly id: string;
    readonly type: string;
    readonly identifier: string;
    readonly displayName: string;
  }
  class RoutingResult {
    readonly primary: Actor[];
    readonly cc: Actor[];
    readonly bcc: Actor[];
    readonly metadata: Record<string, unknown>;
  }
  class RoutingResolver {
    constructor(options?: { logger?: unknown; defaultPolicy?: RoutingPolicyValue });
    resolve(params: {
      principalActor: Actor | null;
      effectiveActor?: Actor | null;
      delegationChain?: { isEmpty(): boolean } | null;
      routingPolicy?: RoutingPolicyValue | null;
    }): RoutingResult;
  }
  /**
   * Tries an ordered list of resolver functions, returning the first
   * non-null/non-undefined result — for priority-ordered lookups over
   * heterogeneous data sources (e.g. SGSA's SUPPLENZE -> VARIAZIONI_CATTEDRA ->
   * CLASSI hierarchy), distinct from RoleResolver's transitive delegation
   * crawl over one homogeneous RoleRegistry.
   */
  class PriorityChainResolver<TArgs extends unknown[], TResult> {
    constructor(resolvers: Array<(...args: TArgs) => TResult | null | undefined>);
    resolve(...args: TArgs): TResult | null;
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
    // Opt-in dynamic-column passthrough (ref REPORT_GLF.md B2): a subclass
    // declaring a static getKnownColumns() has every other hydrated column
    // captured here and merged back unmodified by Repository.save(), unless
    // overridden via setDynamicColumn().
    captureDynamicColumns(data: EntityData): void;
    getDynamicColumns(): EntityData;
    setDynamicColumn(column: string, value: unknown): void;
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
    // O(1) hot-lookup index seam (ref REPORT_GLF.md A2).
    createIndex(columnName: string): void;
    indexedLookup(columnName: string, value: unknown): EntityData[] | null;
  }
  interface RepositoryQueryBuilder {
    where(column: string, operator: string, value: unknown): RepositoryQueryBuilder;
    execute(): EntityData[];
  }
  interface RepositoryDatabase {
    tables: Record<string, RepositoryTable>;
    select(columns: string[]): { from(tableName: string): RepositoryQueryBuilder };
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
    find(specification: QueryableSpecification): T[];
    findOne(specification: QueryableSpecification): T | null;
    findById(id: string): T | null;
    findByIdOrFail(id: string): T;
    findAll(): T[];
    exists(specification: QueryableSpecification): boolean;
    count(specification: QueryableSpecification): number;
    save(entity: T, options?: { dryRun?: boolean }): void;
    saveMany(entities: T[]): void;
    getTableName(): string;
  }

  // The minimal shape Repository.find()/QueryTranslator actually need. GLF's own
  // FieldSpecification/CompositeSpecification (SpecificationLike, with and/or/not
  // and canBeTranslatedToQuery/toQuery) satisfy it, and so do ALDO's domain-pure
  // `Specification<T>` implementations, which only ever provide isSatisfiedBy +
  // toQueryObject (ref REPORT_GLF.md B1/A1) to keep the domain layer free of any
  // GLF/query-builder import.
  interface QueryableSpecification {
    isSatisfiedBy(entity: unknown): boolean;
    toQueryObject?(): Record<string, unknown> | null;
    canBeTranslatedToQuery?(): boolean;
    toQuery?(queryBuilder: RepositoryQueryBuilder): RepositoryQueryBuilder;
  }

  interface SpecificationLike extends QueryableSpecification {
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

  // --- GoogleApiWrapper (L2): MailService (GmailApp abstraction with retry + rate limit) ---
  interface MailSendOptions {
    to: string | string[];
    subject: string;
    body?: string;
    htmlBody?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    name?: string;
    noReply?: boolean;
    attachments?: unknown[];
  }
  interface MailSendResult {
    success: boolean;
    error?: string;
  }
  class MailService {
    constructor(
      logger: unknown,
      utils: { sleep(ms: number): void },
      exceptionService?: unknown,
      options?: { rateLimitMs?: number }
    );
    send(emailOptions: MailSendOptions): MailSendResult;
    sendBatch(emails: MailSendOptions[]): {
      successful: MailSendOptions[];
      failed: Array<{ email: MailSendOptions; error: string }>;
    };
    getQuotaUsage(): number;
  }

  // --- GoogleApiWrapper (L2): ServiceFactory DI container + UI/Properties wrappers ---
  interface LibPropertiesService {
    getProperty(key: string): string | null;
    setProperty(key: string, value: string): unknown;
    deleteProperty(key: string): unknown;
  }
  interface LibMenuBuilder {
    addItem(caption: string, functionName: string): LibMenuBuilder;
    addSeparator(): LibMenuBuilder;
    addToUi(): void;
  }
  interface LibPromptResponse {
    getResponseText(): string;
    getSelectedButton(): unknown;
  }
  interface LibUiService {
    createMenu(caption: string): LibMenuBuilder;
    alert(title: string, message: string, buttonSet?: unknown): unknown;
    prompt(title: string, message: string, buttonSet?: unknown): LibPromptResponse;
    createSidebar(): unknown;
  }
  interface SpreadsheetSheetInfo {
    name: string;
    sheetId: number;
    index: number;
    hidden: boolean;
    /** Row/column counts live here, NOT flat on the sheet-info object — real API shape, ref DriveServiceFacade fix precedent. */
    gridProperties: { rowCount?: number; columnCount?: number };
  }
  interface SpreadsheetRangeUpdate {
    range: string;
    values: unknown[][];
  }
  interface SpreadsheetUpdateResult {
    totalUpdatedCells: number;
    totalUpdatedRows: number;
    totalUpdatedColumns: number;
    totalUpdatedSheets: number;
  }
  interface SpreadsheetFormatRequest {
    range: string;
    format: Record<string, unknown>;
  }
  interface SpreadsheetProtectRequest {
    range: string;
    description?: string;
    warningOnly?: boolean;
    editors?: { users?: string[]; groups?: string[]; domainUsersCanEdit?: boolean };
  }
  interface SpreadsheetProtectResult {
    spreadsheetId: string;
    protectedCount: number;
    protectedRangeIds: number[];
  }
  interface SpreadsheetCreateSheetRequest {
    title: string;
    index?: number;
  }
  class SpreadsheetService {
    getSheetInfo(spreadsheetId: string, options?: { includeHidden?: boolean }): SpreadsheetSheetInfo[];
    /** Single range -> values grid. Array of ranges -> Record<range, values grid> (not used by ALDO yet). */
    getRanges(spreadsheetId: string, ranges: string): unknown[][];
    updateRanges(spreadsheetId: string, updates: SpreadsheetRangeUpdate | SpreadsheetRangeUpdate[], options?: { valueInputOption?: string }): SpreadsheetUpdateResult;
    appendRows(spreadsheetId: string, appends: SpreadsheetRangeUpdate | SpreadsheetRangeUpdate[], options?: Record<string, unknown>): unknown;
    formatRanges(spreadsheetId: string, requests: SpreadsheetFormatRequest | SpreadsheetFormatRequest[], options?: Record<string, unknown>): unknown;
    createSheets(spreadsheetId: string, requests: SpreadsheetCreateSheetRequest | SpreadsheetCreateSheetRequest[], options?: Record<string, unknown>): unknown;
    protectRanges(
      spreadsheetId: string,
      requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[],
      options?: { globalEditors?: { users?: string[]; groups?: string[]; domainUsersCanEdit?: boolean } }
    ): SpreadsheetProtectResult;
  }
  interface DocumentStructureElement {
    index: number;
    startIndex: number;
    endIndex: number;
    type: 'PARAGRAPH' | 'TABLE' | 'SECTION_BREAK' | 'UNKNOWN';
    text?: string;
  }
  interface DocumentTextMatch {
    elementIndex: number;
    text: string;
    type: 'TEXT' | 'TABLE_TEXT';
  }
  interface DocumentScanResult {
    tables: unknown[];
    textMatches: DocumentTextMatch[];
  }
  interface DocumentCreateTableOptions {
    headerRow?: boolean;
    alternatingRows?: boolean;
    columnWidths?: number[];
  }
  interface DocumentBuilderExecuteResult {
    success: boolean;
    error?: unknown;
  }
  class DocumentBuilder {
    replaceText(searchPattern: string, replacement: string): DocumentBuilder;
    createTable(data: string[][], options?: DocumentCreateTableOptions): DocumentBuilder;
    execute(): DocumentBuilderExecuteResult;
  }
  interface DocumentInsertTableAtMarkerResult {
    success: boolean;
    rows: number;
    columns: number;
    foundElementIndex: number;
  }
  class DocumentService {
    /** Returns a fluent op-batching builder; nothing executes until `.execute()` (10 §9 table import). */
    document(documentId: string): DocumentBuilder;
    /** Docs-structure scan filtered to paragraphs/table cells containing any of `textPatterns` (default `['{{']`). */
    scanDocumentStructure(documentId: string, textPatterns?: string[]): DocumentScanResult;
    /**
     * Inserts a table immediately after the paragraph containing the literal `markerText`
     * (found via native `body.findText`), instead of appending at the document's end.
     * Throws if `markerText` is not found. Does NOT remove the marker text itself — the
     * caller is expected to remove it separately (e.g. via a `replaceText`/`removeText` call).
     */
    insertTableAtMarker(documentId: string, markerText: string, data: string[][], options?: DocumentCreateTableOptions): DocumentInsertTableAtMarkerResult;
  }
  class ServiceFactory {
    static configure(config?: Record<string, unknown>): void;
    static reset(resetConfig?: boolean): void;
    static getLogger(): LoggerService;
    static getUtilitiesService(): UtilsService;
    static getDriveService(): DriveService;
    static getDocumentService(): DocumentService;
    static getMailService(options?: Record<string, unknown>): MailService;
    static getPropertiesService(): LibPropertiesService;
    static getUiService(): LibUiService;
    static getSpreadsheetService(): SpreadsheetService;
    static getPermissionService(): PermissionService;
    /** Raw cache FACTORY (exposes getScriptCache()) — NOT the resolved cache getCache() returns. */
    static getCacheService(): { getScriptCache(): unknown };
  }

  // --- GasProcessMonitorLib (L4): job progress tracking + monitoring sidebar ---
  class ProcessMonitorService {
    constructor(logger: LoggerService, cacheService: unknown, propertiesService: unknown);
    registerJob(jobId: string): void;
    startJob(jobId: string): void;
    updateProgress(jobId: string, percentage: number, message?: string): void;
    logStepStart(jobId: string, stepName: string): void;
    logStepComplete(jobId: string, stepName: string, success: boolean): void;
    logStepSkipped(jobId: string, stepName: string): void;
    setError(jobId: string, error: unknown): void;
    completeJob(jobId: string, message?: string): void;
    getJobState(jobId: string): Record<string, unknown> | null;
    hasJob(jobId: string): boolean;
    clearJob(jobId: string): void;
  }
  class DashboardUi {
    constructor(uiService: LibUiService, logger: LoggerService);
    createSidebar(jobId: string, title?: string, options?: Record<string, unknown>): void;
  }

  // --- GasDataImporter (L3): ETL recipe engine ---
  interface ImportSourceConfig {
    /** Built-in 'SheetById' | 'Folder', or any type registered via ImportEngine.registerCustomSource. */
    type: string;
    config: Record<string, unknown>;
  }
  interface ImportTransformConfig {
    mapping?: Record<string, string>;
    calculated?: Record<string, string>;
    normalization?: Record<string, unknown>;
    validation?: string | string[];
  }
  interface ImportLoadConfig {
    targetTable: string;
    conflictResolution: 'INSERT_ONLY' | 'UPDATE_ONLY' | 'UPSERT' | 'OVERWRITE';
    conflictKey?: string;
    updateIfNewer?: { enabled: boolean; timestampColumn?: string };
  }
  interface ImportRecipe {
    name: string;
    source: ImportSourceConfig;
    transform?: ImportTransformConfig;
    load: ImportLoadConfig;
  }
  interface ImportLoadResult {
    success: boolean;
    inserted: number;
    updated: number;
    skipped: number;
    deleted: number;
    total: number;
  }
  interface ImportRunResult {
    success: boolean;
    importName: string;
    durationMs: number;
    extract: { rowsExtracted: number; rowCount: number };
    transform: { rowsTransformed: number; recordsProcessed: number };
    load: ImportLoadResult & { recordsProcessed: number; failed: number };
  }
  /** Wraps a raw recipe with validation; thrown by the constructor on invalid shape. */
  class ImportConfiguration {
    constructor(recipe: ImportRecipe, logger?: unknown);
    getName(): string;
    getSource(): ImportSourceConfig;
    getTransform(): ImportTransformConfig;
    getLoad(): ImportLoadConfig;
    getSummary(): Record<string, unknown>;
    /** Whitelists a custom source.type for recipe validation (idempotent). */
    static registerSourceType(type: string): void;
    static readonly VALID_SOURCE_TYPES: string[];
  }
  class ImportEngine {
    constructor(
      logger: LoggerService,
      driveService: DriveService,
      spreadsheetService: SpreadsheetService,
      databaseService: DatabaseService,
      expressionEngine?: ExpressionEngineService | null,
      exceptionService?: unknown,
      monitor?: unknown
    );
    runImport(
      recipe: ImportRecipe,
      options?: {
        dryRun?: boolean;
        jobId?: string;
        maxRetries?: number;
        /** Hook invoked after Transform and before Load with `(transformedData, config) => filteredData`, letting the caller filter/mutate the batch (e.g. Ghost Record Detection) without reaching into private pipeline-phase methods. */
        postTransform?: (data: Record<string, unknown>[], config: ImportConfiguration) => Record<string, unknown>[];
      }
    ): ImportRunResult;
    /** Registers a custom SourceStrategy subclass under `name` (source.type) and whitelists the type. */
    registerCustomSource(name: string, strategyClass: new (logger: LoggerService, dependencies: Record<string, unknown>) => SourceStrategy): void;
  }
  class ImportError extends Error {
    code: string;
  }
  /** Extraction-phase failure (e.g. inaccessible sheet, missing tab, no sheets at all). */
  class SourceError extends ImportError {}
  /** Base class for custom extraction sources (registered via ImportEngine.registerCustomSource). */
  abstract class SourceStrategy {
    constructor(logger?: LoggerService);
    protected logger: LoggerService;
    /** Public entry point: validates the result is an array and wraps failures as SourceError. */
    extract(config: Record<string, unknown>): Record<string, unknown>[];
    /** Subclasses implement this — must return an array of row objects. */
    protected abstract _extractData(config: Record<string, unknown>): Record<string, unknown>[];
    protected _validateConfig(config: Record<string, unknown>, requiredFields: string[]): void;
    protected _coerceValue(value: unknown): unknown;
  }
  /** Built-in SourceStrategy reading rows from a Google Sheet by ID (resolves tab, full-sheet or explicit range, header split, and value coercion). */
  class SheetByIdStrategy extends SourceStrategy {
    constructor(logger: LoggerService, spreadsheetService: SpreadsheetService);
    /**
     * @param config.sheetId physical spreadsheet identifier (required).
     * @param config.tabName Target tab name (defaults to the first sheet).
     * @param config.range A1 notation range; when omitted, resolves the full sheet from gridProperties (no 26-column cap).
     * @param config.hasHeaders If true (default), treats the first row as property keys.
     */
    extract(config: { sheetId: string; tabName?: string; range?: string; hasHeaders?: boolean }): Record<string, unknown>[];
    /**
     * Same sheet/tab/range resolution as `extract()`, but returns the raw grid
     * (`string[][]`-shaped, header row included) instead of header-mapped row
     * objects — for callers needing a raw table (e.g. inserting into a Google
     * Doc) rather than import-recipe rows (ref REPORT_GLF.md B6).
     */
    extractRaw(config: { sheetId: string; tabName?: string; range?: string }): unknown[][];
  }

  // --- ComposableContentLib (L4): declarative block composition (box rendering) ---
  interface BlockDefinitionInput {
    id: string;
    name: string;
    description?: string;
    supportedFormats?: string[];
    /** 'hide' (default) drops the block when isEmpty; 'show' keeps it. */
    emptyBehavior?: string;
    containerType?: string;
  }
  interface BlockDataContextLike {
    get(path: string, defaultValue?: unknown): unknown;
    has(path: string): boolean;
    getAll(): Record<string, unknown>;
  }
  class BlockDataContext implements BlockDataContextLike {
    constructor(data?: Record<string, unknown>, globalContext?: Record<string, unknown>);
    get(path: string, defaultValue?: unknown): unknown;
    has(path: string): boolean;
    getAll(): Record<string, unknown>;
  }
  /** Template values are either `{{path}}` strings or functions `(data, options) => string`. */
  type BlockTemplate = string | ((data: unknown, options: { config: Record<string, unknown> }) => string);
  class HtmlRenderer {
    constructor(options?: { logger?: unknown; templates?: Record<string, BlockTemplate> });
    getFormat(): string;
  }
  class RendererRegistry {
    constructor(options?: { logger?: unknown; registerDefaults?: boolean });
    register(renderer: HtmlRenderer): void;
    get(format: string): unknown;
  }
  abstract class ContentBlock {
    constructor(definition: unknown, config?: Record<string, unknown>);
    abstract getData(context: BlockDataContextLike): unknown;
    abstract isEmpty(data: unknown): boolean;
    abstract getTemplateId(format: string): string;
  }
  class SimpleContentBlock extends ContentBlock {
    constructor(
      definition: unknown,
      config: {
        dataExtractor: (context: BlockDataContextLike) => unknown;
        emptyChecker?: (data: unknown) => boolean;
        templates: Record<string, string>;
        [key: string]: unknown;
      }
    );
    getData(context: BlockDataContextLike): unknown;
    isEmpty(data: unknown): boolean;
    getTemplateId(format: string): string;
  }
  class BlockRegistry {
    constructor(options?: { logger?: unknown });
    register(registration: {
      definition: BlockDefinitionInput;
      factory: (definition: unknown, config: Record<string, unknown>) => ContentBlock;
    }): unknown;
    has(blockType: string): boolean;
  }
  interface CompositionBlockInput {
    instanceId: string;
    blockType: string;
    /** 'always' | 'never' | boolean expression evaluated against the context. */
    visibility?: string;
    order?: number;
    config?: Record<string, unknown>;
  }
  interface CompositionRecipeInput {
    id: string;
    name: string;
    outputFormat?: string;
    blocks: CompositionBlockInput[];
    separator?: string;
  }
  class CompositionRecipe {
    constructor(definition: CompositionRecipeInput);
    getOrderedBlocks(): CompositionBlockInput[];
  }
  interface BlockResultView {
    instanceId: string;
    blockType: string;
    isEmpty: boolean;
    isVisible: boolean;
    content: string;
    error?: Error;
  }
  interface CompositionResultView {
    content: string;
    blocks: BlockResultView[];
    errors?: Array<{ instanceId: string; error: Error }>;
  }
  class ContentComposer {
    constructor(options: {
      blockRegistry: BlockRegistry;
      rendererRegistry: RendererRegistry;
      logger?: unknown;
      expressionEngine?: unknown;
    });
    compose(
      recipe: CompositionRecipeInput | CompositionRecipe,
      context: Record<string, unknown> | BlockDataContext,
      options?: { format?: string; continueOnError?: boolean }
    ): CompositionResultView;
    composeToString(
      recipe: CompositionRecipeInput | CompositionRecipe,
      context: Record<string, unknown> | BlockDataContext,
      options?: { format?: string; continueOnError?: boolean }
    ): string;
  }
}
