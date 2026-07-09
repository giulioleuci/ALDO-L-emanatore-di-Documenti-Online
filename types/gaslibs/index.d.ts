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
    getAllRows(): Record<string, unknown>[];
    getByPK(pkValue: string): Record<string, unknown> | null;
    insertRow(data: Record<string, unknown>): Record<string, unknown>;
    updateRowById(id: string, data: Record<string, unknown>): void;
    patchRow(id: string, partialData: Record<string, unknown>): void;
    deleteRowById(id: string): void;
    defineVirtualColumn(columnName: string, compute: (row: Record<string, unknown>) => unknown): unknown;
    setPrimaryKey(columnName: string): unknown;
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
  class SpreadsheetService {
    getSheetInfo(spreadsheetId: string): Array<{ name: string; rowCount?: number; columnCount?: number }>;
    getRanges(spreadsheetId: string, range: string): unknown[][];
  }
  class ServiceFactory {
    static configure(config?: Record<string, unknown>): void;
    static reset(resetConfig?: boolean): void;
    static getLogger(): LoggerService;
    static getUtilitiesService(): UtilsService;
    static getDriveService(): DriveService;
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
    runImport(recipe: ImportRecipe, options?: { dryRun?: boolean; jobId?: string }): Record<string, unknown>;
    /** Bound pipeline phases (library exposes these on the instance despite the leading underscore). */
    _executeExtract(config: ImportConfiguration): Record<string, unknown>[];
    _executeTransform(data: Record<string, unknown>[], config: ImportConfiguration): Record<string, unknown>[];
    _executeLoad(data: Record<string, unknown>[], config: ImportConfiguration): ImportLoadResult;
    /** Registers a custom SourceStrategy subclass under `name` (source.type) and whitelists the type. */
    registerCustomSource(name: string, strategyClass: new (logger: LoggerService, dependencies: Record<string, unknown>) => SourceStrategy): void;
  }
  class ImportError extends Error {
    code: string;
  }
  /** Base class for custom extraction sources (registered via ImportEngine.registerCustomSource). */
  abstract class SourceStrategy {
    constructor(logger?: LoggerService);
    /** Public entry point: validates the result is an array and wraps failures as SourceError. */
    extract(config: Record<string, unknown>): Record<string, unknown>[];
    /** Subclasses implement this — must return an array of row objects. */
    protected abstract _extractData(config: Record<string, unknown>): Record<string, unknown>[];
    protected _validateConfig(config: Record<string, unknown>, requiredFields: string[]): void;
    protected _coerceValue(value: unknown): unknown;
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
