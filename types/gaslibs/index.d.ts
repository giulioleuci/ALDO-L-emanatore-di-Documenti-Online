// Ambient declarations for GasLibraryFactory globals (vendored bundle).
// ALDO's narrowed service contracts; public members are checked against the
// TypeScript GLF declarations in vendor/types by test/types/glf-api.contract.ts.
export {};

declare global {
  // --- CoreUtilsLib (L0) ---
  type LogItemKind = 'DOCUMENT' | 'EMAIL' | 'IMPORT' | 'RETRY' | 'GENERIC';
  type PipelineStepStatus = 'EXECUTED' | 'SKIPPED' | 'ERROR';

  interface TreePosition {
    depth: number;
    isLast: boolean;
    ancestorHasNext?: boolean[];
  }

  interface JobResumeDetails {
    checkpoint?: string;
    percentage?: number;
  }

  type LogDetailScalar = string | number | boolean | null | undefined;
  type LogDetails =
    string | LogDetailScalar[] | Record<string, LogDetailScalar | LogDetailScalar[]>;

  interface PipelineStepDetails {
    content?: LogDetails;
    durationMs?: number;
    reason?: string;
  }

  /** End-of-job multi-line report (job type, run count, cumulative real duration, task totals, failure detail). */
  interface JobReportDetails {
    jobType: string;
    runCount?: number;
    totalDurationMs?: number;
    totale?: number;
    falliti?: number;
    dettagliFalliti?: string[];
    /** Skipped tasks, excluded from "Eseguiti con successo"; line printed only when passed. */
    saltati?: number;
    dettagliSaltati?: string[];
  }

  class LoggerService {
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    logJobStart(jobName: string, jobType: string): this;
    logJobResume(jobName: string, jobType: string, details?: JobResumeDetails): this;
    logJobEnd(jobName: string, isSuccess: boolean, details?: LogDetails): this;
    logJobSuspended(jobName: string, details?: LogDetails): this;
    logBatchStart(totalItems: number, label?: string): this;
    logItemStart(
      itemIndex: number,
      totalItems: number,
      itemLabel: string,
      identifier: string,
      kind?: LogItemKind
    ): this;
    logStep(message: string, position: TreePosition): this;
    logPipelineStart(pipelineName: string, totalSteps: number, position: TreePosition): this;
    logPipelineStep(
      stepName: string,
      status: PipelineStepStatus,
      details: PipelineStepDetails | LogDetails | undefined,
      position?: TreePosition
    ): this;
    logSummary(
      label: string,
      durationMs: number,
      itemDetails?: LogDetails,
      position?: TreePosition
    ): this;
    logJobReport(details: JobReportDetails): this;
    withPosition<T>(position: TreePosition, callback: () => T): T;
  }

  class HtmlSanitizer {
    static escapeHtml(value: string): string;
    static safeColor(value: string, fallback: string): string;
    static safeUrl(value: string): string;
    /**
     * Recursively HTML-escapes every string leaf of an object/array (numbers/
     * booleans/null/undefined pass through; non-plain objects, e.g. Date,
     * pass through unrecursed). Returns a new structure — no mutation.
     */
    static escapeContextDeep<T>(value: T): T;
    /**
     * Strips HTML markup to plain text (block boundaries become line breaks,
     * entities decoded, blank lines collapsed, trimmed); optionally truncated.
     */
    static stripToPlainText(
      value: string,
      options?: { maxLength?: number; truncationMode?: 'marker' | 'cut' | 'none' }
    ): string;
  }

  /** CoreUtilsLib PII-safe logging helper (ref CoreUtilsLib/src/internal/PiiRedactor.js). */
  class PiiRedactor {
    static redact(message: string): string;
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

  /**
   * Generic single-value lazy loader — defers a loader function until first
   * get(), then caches the result (ref CoreUtilsLib/src/utils/LazyRef.js).
   */
  class LazyRef<T> {
    constructor(loader: () => T);
    get(): T;
    isResolved(): boolean;
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
  // as-is: ProviderRegistry, InterceptorRegistry, ContextInterceptor middleware,
  // and the shared ExpressionEngine for conditions.
  interface LibContextProvider {
    provide(...args: unknown[]): unknown;
  }
  interface LibContextInterceptor {
    intercept(name: string, data: unknown, context: unknown, options?: unknown): unknown;
  }
  class ProviderRegistry {
    constructor(logger: LoggerService);
    registerSingleton(type: string, instance: LibContextProvider): this;
    registerFactory(type: string, factory: () => LibContextProvider): this;
    get(type: string): LibContextProvider;
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
    protected _shouldIntercept(
      name: string,
      data: unknown,
      context: unknown,
      options?: unknown
    ): boolean;
    protected _performIntercept(
      name: string,
      data: unknown,
      context: unknown,
      options?: unknown
    ): unknown;
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
      itemFn: (
        item: unknown,
        index: number,
        array: unknown[]
      ) => void | null | {
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
    assemble(
      recipe: ContextAssemblerRecipe,
      initialParams?: Record<string, unknown>,
      options?: Record<string, unknown> & { logPosition?: TreePosition }
    ): Record<string, unknown>;
    /** Mutation mode — see class doc. Returns `sharedTarget` (mutated in place) for convenience. */
    assembleInto<T extends object>(
      sharedTarget: T,
      recipe: ContextAssemblerRecipe,
      initialParams?: object,
      options?: Record<string, unknown> & { logPosition?: TreePosition }
    ): T;
  }
  type ProjectionOperation =
    | { type: 'filter'; expression: string }
    | { type: 'map'; fields: Record<string, { from?: string; value?: unknown }> }
    | { type: 'flatMap'; path?: string; strategy?: string; mergeParent?: boolean }
    | {
        type: 'groupBy';
        keys: string[];
        aggregates: Record<
          string,
          {
            type: 'count' | 'collect' | 'collectDistinct' | 'first' | 'last' | 'sum';
            path?: string;
          }
        >;
      }
    | { type: 'distinctBy'; keys: string[] }
    | { type: 'sortBy'; keys: Array<{ path: string; direction: 'ASC' | 'DESC' }> }
    | { type: 'prepend' | 'append'; value: unknown; when?: string }
    | { type: 'strategy'; name: string; config?: Record<string, unknown> };
  interface ProjectionTraceEntry {
    index: number;
    type: ProjectionOperation['type'];
    inputCount: number;
    outputCount: number;
  }
  type ProjectionStrategy = (
    value: unknown,
    operation: ProjectionOperation,
    runtime: Record<string, unknown>
  ) => unknown[];
  class ProjectionRegistry {
    constructor();
    register(name: string, strategy: ProjectionStrategy): this;
    get(name: string): ProjectionStrategy | null;
    has(name: string): boolean;
  }
  class CollectionProjector {
    constructor(options?: {
      registry?: ProjectionRegistry;
      expressionEngine?: {
        evaluate(expression: string, context?: Record<string, unknown>): unknown;
      } | null;
      logger?: LoggerService | null;
    });
    project(
      inputArray: unknown[],
      operations: ProjectionOperation[],
      runtimeContext?: Record<string, unknown>
    ): { value: unknown[]; trace: ProjectionTraceEntry[] };
  }
  class CollectionProjectionInterceptor extends ContextInterceptor {
    constructor(
      logger: LoggerService,
      projector: CollectionProjector,
      config: {
        targetProviders: string[];
        targetPaths: string[];
        operations: ProjectionOperation[];
        optionFlag?: string | null;
      }
    );
  }
  class CollectionProjectionError extends Error {
    constructor(
      message: string,
      context?: { operationIndex?: number | null; targetPath?: string | null } & Record<
        string,
        unknown
      >
    );
  }

  // --- SheetDBLib (L2): ORM entry point (tables, save, ACID-like transactions) ---
  interface SheetTableService {
    /** Opt-in: fresh persisted rows, blanks retained; excludes virtual columns and pending writes. */
    getRows(options?: { preserveEmptyRows?: boolean }): Record<string, unknown>[];
    getAllRows(options?: { preserveEmptyRows?: boolean }): Record<string, unknown>[];
    getByPK(pkValue: string): Record<string, unknown> | null;
    insertRow(data: Record<string, unknown>): Record<string, unknown>;
    updateRowById(id: string, data: Record<string, unknown>): void;
    patchRow(id: string, partialData: Record<string, unknown>): void;
    deleteRowById(id: string): void;
    defineVirtualColumn(
      columnName: string,
      compute: (row: Record<string, unknown>) => unknown
    ): unknown;
    setPrimaryKey(columnName: string): unknown;
    // O(1) exact-match lookup seam (ref REPORT_GLF.md A2): createIndex builds a
    // Map-based memory index; _indexedLookup returns matching rows or null when
    // no index has been built for that column (caller falls back to a scan).
    createIndex(columnName: string): unknown;
    _indexedLookup(columnName: string, value: unknown): Record<string, unknown>[] | null;
  }
  class DatabaseService {
    constructor(
      spreadsheetId: string,
      logger: LoggerService,
      utils: unknown,
      cache: unknown,
      exceptionService?: unknown,
      options?: { dryRun?: boolean; schemaValidator?: unknown; verifyTables?: string[] }
    );
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
    /** Opt-in: fresh persisted rows, blanks retained; excludes virtual columns and pending writes. */
    getRows(options?: { preserveEmptyRows?: boolean }): Record<string, unknown>[];
    getAllRows(options?: { preserveEmptyRows?: boolean }): Record<string, unknown>[];
    getByPK(pkValue: string): Record<string, unknown> | null;
    insertRow(data: Record<string, unknown>): Record<string, unknown>;
    updateRowById(id: string, data: Record<string, unknown>): Record<string, unknown>;
    patchRow(id: string, partialData: Record<string, unknown>): Record<string, unknown>;
    deleteRowById(id: string): void;
    /** Computed column added to reads; excluded from physical writes. */
    defineVirtualColumn(
      columnName: string,
      compute: (row: Record<string, unknown>) => unknown
    ): TableService;
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
  interface DrivePermissionEvidence {
    id?: string;
    type?: string;
    role?: string;
    emailAddress?: string;
    domain?: string;
    deleted?: boolean;
    displayName?: string;
    permissionDetails?: unknown[];
  }
  class DriveService {
    // DriveFileManager
    deleteFiles(
      fileIds: string | string[],
      options?: { permanently?: boolean }
    ): DriveBatchOutcome<null>;
    copyFiles(
      requests: Array<{ fileId: string; name?: string; destinationFolder?: string }>,
      options?: Record<string, unknown>
    ): DriveBatchOutcome<{ id: string; name: string; parents: string[] }>;
    /** Native DriveApp File/Folder object (e.g. for `.getBlob()`). */
    getFileByIdStandard(fileId: string): { getBlob(): unknown };
    // DriveFolderManager
    createFolder(
      folderName: string,
      parentFolderId?: string | null,
      options?: Record<string, unknown>
    ): unknown;
    // DriveMetadataService
    getFiles(fileIds: string, options?: { fields?: string; strict?: boolean }): DriveFileMetadata;
    getFiles(
      fileIds: string[],
      options?: { fields?: string; strict?: boolean }
    ): Record<string, DriveFileMetadata | null>;
    /** Uncached, paginated Drive permission evidence. Failures propagate after wrapper retries. */
    getPermissions(fileIds: string): DrivePermissionEvidence[];
    getPermissions(fileIds: string[]): Record<string, DrivePermissionEvidence[]>;
    searchFiles(
      query: string,
      options?: { maxResults?: number; orderBy?: string }
    ): DriveFileMetadata[];
    /** Owner email of the Drive file, or null when none is present (e.g. a Shared Drive file). */
    getFileOwnerEmail(fileId: string): string | null;
  }
  class PermissionService {
    /**
     * `role` is a Drive API v3 role: 'writer' | 'reader' | 'commenter'. A Drive
     * rejection does NOT throw: it is returned in `failed` (actual shape
     * `{fileId,error,statusCode}`, not `DriveBatchOutcome`'s `{id,status,error}`).
     */
    shareWithUsers(
      fileIds: string | string[],
      permissions: Array<{ type?: string; role: string; email: string; sendEmail?: boolean }>,
      options?: { sendNotificationEmail?: boolean }
    ): {
      successful: Array<{ fileId: string; permission: unknown; statusCode: number }>;
      failed: Array<{ fileId: string; error: Error; statusCode: number }>;
    };
    /**
     * Revokes access by email or permission id (auto-resolves emails via
     * getPermissions()). `DriveBatchOutcome`'s `{id,status,data}` shape doesn't
     * match this method's actual `{fileId,permissionId,...}` results (same
     * mismatch as changeRolesByPermissionId below), so declared inline.
     */
    removeAccess(
      fileIds: string | string[],
      emailsOrPermissionIds: string | string[]
    ): {
      successful: Array<{ fileId: string; permissionId: string; statusCode: number }>;
      failed: Array<{ fileId: string; permissionId: string; error: Error; statusCode: number }>;
    };
    /** Uncached-by-ALDO (5-minute library-side cache) Drive permission evidence for one file. */
    getPermissions(
      fileId: string
    ): Array<{ id: string; emailAddress?: string; role: string; type: string; domain?: string }>;
    /**
     * Applies role changes by permission id (not email) — reaches link-wide grants
     * (`type: 'anyone'`/`'domain'`) that `changeRoles` cannot resolve.
     * `DriveBatchOutcome`'s `{id,status,data}`/`{id,status,error}` shape doesn't match
     * this method's actual `{fileId,permissionId,...}` results, so the return type is
     * declared inline rather than via that generic.
     */
    changeRolesByPermissionId(
      fileIds: string | string[],
      roleChanges:
        { permissionId: string; newRole: string } | Array<{ permissionId: string; newRole: string }>
    ): {
      successful: Array<{ fileId: string; permissionId: string; newRole: string }>;
      failed: Array<{ fileId: string; permissionId: string; error: Error }>;
    };
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
  /** Conditional string selector: returns the singular or plural form based on a numeric count. */
  class PluralizeFilter {
    execute(count: number, singular: string, plural: string): string;
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
    processSheet(
      sheetId: string,
      context?: Record<string, unknown>,
      sheetName?: string
    ): SheetProcessResult;
  }

  // --- PipelineFramework (L3): Pipeline / Step / PipelineContext ---
  interface StepExecutionResult {
    success: boolean;
    skipped: boolean;
    durationMs: number;
    logDetails: LogDetails | null;
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
    protected getContextValue<T = unknown>(
      context: PipelineContext,
      key: string,
      defaultValue?: T | null
    ): T | null;
    protected abstract _executeLogic(context: PipelineContext): void;
    protected _getLogDetails(context: PipelineContext): LogDetails | null;
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
        logPosition?: TreePosition;
        /** Log consecutive skipped steps with the same reason as one line. */
        collapseSkippedSteps?: boolean;
      }
    );
    getName(): string;
    getSteps(): Step[];
    addStep(step: Step): this;
    beforeStep(callback: (step: Step, context: PipelineContext) => void): this;
    afterStep(
      callback: (step: Step, context: PipelineContext, result: StepExecutionResult) => void
    ): this;
    onError(callback: (step: Step, context: PipelineContext, error: Error) => void): this;
    onComplete(callback: (context: PipelineContext, success: boolean) => void): this;
    execute(initialData?: Record<string, unknown> | null): PipelineContext;
    clearSteps(): this;
  }
  class StepExecutionError extends Error {}

  // --- RoleResolutionLib (L4): materia-slot CSV parsing helpers (ref
  // DOCS_LIBS/RoleResolutionLib.md "Materia slot CSV parsing"). Reusable
  // parsing for MATERIA.itp/MATERIA.specifica-style CSV cattedra columns;
  // ALDO's RowScopeExpansion.ts re-exports these under the same names. ---
  /** Base materia ids sharing one (kind, specifica) slot qualifier within a row. */
  interface LibMateriaSlotGroup {
    /** 'ITP' | 'SPECIFICA' | '*' (bare, any slot). */
    kind: string;
    /** Literal specifica id, or '*' when not SPECIFICA-qualified. */
    specifica: string;
    materie: string[];
  }
  /** One concrete (classe, materia, kind, specifica) teaching-slot tuple. */
  interface LibConcretePair {
    classeId: string;
    materia: string;
    kind: string;
    specifica: string;
  }
  /** Splits a comma-separated string into trimmed, non-empty entries. */
  function splitCsvList(raw: string): string[];
  /** Groups a materia CSV's entries by slot qualifier (see doc comment in RowScopeExpansion.ts). */
  function groupMateriaEntriesBySlot(materieRaw: string): LibMateriaSlotGroup[];
  /** Whether two slot qualifiers can refer to the same physical teaching post ('*' matches any kind/specifica). */
  function slotCompatible(
    a: { kind: string; specifica: string },
    b: { kind: string; specifica: string }
  ): boolean;
  /** True if any pair in `a` shares a (classe, materia) with a slot-compatible pair in `b`. */
  function pairsOverlap(a: readonly LibConcretePair[], b: readonly LibConcretePair[]): boolean;

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
  class DelegationChain {
    constructor(delegations?: Delegation[]);
    readonly delegations: readonly Delegation[];
    static empty(): DelegationChain;
    static single(delegation: Delegation): DelegationChain;
    static fromJSON(obj: Record<string, unknown>): DelegationChain;
    isEmpty(): boolean;
    getDepth(): number;
    getOriginalPrincipalId(): string | null;
    getFinalDelegateId(): string | null;
    getAllActorIds(): string[];
    getFirst(): Delegation | null;
    getLast(): Delegation | null;
    getAt(index: number): Delegation | null;
    containsActor(actorId: string): boolean;
    wouldCreateCycle(delegation: Delegation): boolean;
    extend(delegation: Delegation): DelegationChain;
    forEach(callback: (delegation: Delegation, index: number) => void): void;
    map<T>(mapper: (delegation: Delegation, index: number) => T): T[];
    isValidAt(asOfDate?: Date): boolean;
    toJSON(): Record<string, unknown>;
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
    getDelegationChain(
      actorId: string,
      roleId: string,
      scope: unknown,
      asOfDate?: Date
    ): Delegation[];
    getAllDelegations(): Delegation[];
    clear(): void;
  }

  // --- RoleResolutionLib: routing and effective-assignment resolution.
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
    constructor(
      id: string,
      type: string,
      identifier: string,
      displayName: string,
      metadata?: Record<string, unknown>
    );
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
  type AssignmentDimension = string | number | boolean | null;
  type AssignmentDimensions = Record<string, AssignmentDimension>;
  interface ResolutionTraceEntry {
    stage: 'BASE' | 'OVERRIDE' | 'DELEGATION' | 'ROUTING';
    decision: 'CONSIDERED' | 'REJECTED' | 'SELECTED' | 'APPLIED';
    candidateId: string | null;
    actorId: string | null;
    reason: string;
    metadata: Record<string, unknown>;
  }
  class AssignmentSlot {
    constructor(options: { dimensions: AssignmentDimensions });
    readonly dimensions: Readonly<AssignmentDimensions>;
    readonly key: string;
    get(name: string): AssignmentDimension;
    matches(scopeDimensions?: Record<string, AssignmentDimension | '*'>): boolean;
    toJSON(): { dimensions: AssignmentDimensions };
  }
  class AssignmentCandidate {
    constructor(options: {
      id: string;
      actorId: string;
      slot: AssignmentSlot | { dimensions: AssignmentDimensions };
      validFrom?: Date | string | number | null;
      validTo?: Date | string | number | null;
      source?: string;
      priority?: number;
      metadata?: Record<string, unknown>;
    });
    readonly id: string;
    readonly actorId: string;
    readonly slot: AssignmentSlot;
    readonly validFrom: Date | null;
    readonly validTo: Date | null;
    readonly source: string;
    readonly priority: number;
    readonly metadata: Readonly<Record<string, unknown>>;
    isValidAt(date?: Date | string | number): boolean;
    toJSON(): Record<string, unknown>;
  }
  class AssignmentOverride {
    constructor(options: {
      id: string;
      previousActorId: string;
      nextActorId: string;
      slotScope: AssignmentDimensions;
      effectiveFrom: Date | string | number;
      source?: string;
      metadata?: Record<string, unknown>;
    });
    readonly id: string;
    readonly previousActorId: string;
    readonly nextActorId: string;
    readonly slotScope: Readonly<AssignmentDimensions>;
    readonly effectiveFrom: Date;
    matches(candidate: AssignmentCandidate, date?: Date | string | number): boolean;
    toJSON(): Record<string, unknown>;
  }
  class ResolutionPolicy {
    constructor(options?: {
      tieBehavior?: 'THROW' | 'FIRST';
      missingActorBehavior?: 'THROW' | 'NULL';
      maxDelegationDepth?: number | null;
      routingPolicy?: RoutingPolicyValue;
      resultIdentity?: string[];
    });
    readonly tieBehavior: 'THROW' | 'FIRST';
    readonly missingActorBehavior: 'THROW' | 'NULL';
    readonly maxDelegationDepth: number | null;
    readonly routingPolicy: RoutingPolicyValue;
    readonly resultIdentity: readonly string[];
    toJSON(): {
      tieBehavior: 'THROW' | 'FIRST';
      missingActorBehavior: 'THROW' | 'NULL';
      maxDelegationDepth: number | null;
      routingPolicy: RoutingPolicyValue;
      resultIdentity: string[];
    };
  }
  class ResolutionTrace {
    constructor(entries?: ResolutionTraceEntry[]);
    readonly entries: readonly ResolutionTraceEntry[];
    append(entry: ResolutionTraceEntry): ResolutionTrace;
    toJSON(): ResolutionTraceEntry[];
  }
  class EffectiveAssignmentResult {
    constructor(options: {
      slot: AssignmentSlot;
      baseActor?: Actor | null;
      permanentActor?: Actor | null;
      effectiveActor?: Actor | null;
      delegationChain?: DelegationChain;
      routing?: RoutingResult | null;
      trace?: ResolutionTrace;
      metadata?: Record<string, unknown>;
    });
    readonly slot: AssignmentSlot;
    readonly baseActor: Actor | null;
    readonly permanentActor: Actor | null;
    readonly effectiveActor: Actor | null;
    readonly delegationChain: DelegationChain;
    readonly routing: RoutingResult | null;
    readonly trace: ResolutionTrace;
    readonly metadata: Readonly<Record<string, unknown>>;
    toJSON(): Record<string, unknown>;
  }
  abstract class AssignmentSource {
    getAssignmentsForRole(roleId: string, scope: Scope, asOfDate?: Date): unknown[];
    getAssignmentsForActor(actorId: string, asOfDate?: Date): unknown[];
    getActorById(actorId: string): Actor | null;
  }
  class InMemoryAssignmentSource extends AssignmentSource {
    constructor(data?: { assignments?: unknown[]; actors?: Actor[] });
    addAssignment(assignment: unknown): void;
    addActor(actor: Actor): void;
  }
  abstract class EffectiveAssignmentSource {
    getAssignments(context: Record<string, unknown>, asOfDate: Date): AssignmentCandidate[];
  }
  abstract class OverrideSource {
    getOverrides(context: Record<string, unknown>, asOfDate: Date): AssignmentOverride[];
  }
  abstract class ActorSource {
    getActor(actorId: string): Actor | null;
  }
  type SourceRows =
    | ReadonlyArray<Record<string, unknown>>
    | ((context: Record<string, unknown>) => ReadonlyArray<Record<string, unknown>>);
  type ValueMapping = unknown | { from: string; parse?: 'csv' };
  class WideRowAssignmentSource extends EffectiveAssignmentSource {
    constructor(options?: {
      rows?: SourceRows;
      rowIdentityPath?: string;
      actorSource?: ActorSource;
      columns?: Array<{
        name: string;
        slotDimensions?: Record<string, ValueMapping>;
        contextDimensions?: Record<string, ValueMapping>;
      }>;
      csv?: boolean;
    });
    getAssignments(context: Record<string, unknown>, asOfDate: Date): AssignmentCandidate[];
  }
  class MappedOverrideSource extends OverrideSource {
    constructor(options?: {
      rows?: SourceRows;
      mapping?: Record<string, ValueMapping | Record<string, ValueMapping>>;
    });
    getOverrides(context: Record<string, unknown>, asOfDate: Date): AssignmentOverride[];
  }
  class MappedDelegationSource {
    constructor(options?: {
      rows?: SourceRows;
      mapping?: Record<string, ValueMapping | Record<string, ValueMapping>>;
    });
    getDelegations(context: Record<string, unknown>, asOfDate: Date): Delegation[];
  }
  class CompositeAssignmentSource extends EffectiveAssignmentSource {
    constructor(options?: {
      sources?: EffectiveAssignmentSource[];
      identity?: string[];
      mergeMetadata?: (
        left: Record<string, unknown>,
        right: Record<string, unknown>
      ) => Record<string, unknown>;
    });
    getAssignments(context: Record<string, unknown>, asOfDate: Date): AssignmentCandidate[];
  }
  class EffectiveAssignmentResolver {
    constructor(options: {
      actorSource: ActorSource;
      assignmentSource: EffectiveAssignmentSource;
      overrideSource: OverrideSource;
      delegationSource:
        | MappedDelegationSource
        | { getDelegations(context: Record<string, unknown>, asOfDate: Date): Delegation[] }
        | InMemoryDelegationSource;
      policy?: ResolutionPolicy;
      routingResolver?: RoutingResolver;
    });
    resolve(options: {
      context?: Record<string, unknown>;
      asOfDate: Date;
      routingPolicy?: RoutingPolicyValue | null;
    }): EffectiveAssignmentResult[];
  }
  class RoleResolutionError extends Error {
    constructor(message: string, context?: Record<string, unknown>, originalError?: Error | null);
  }
  class MalformedAssignmentSlotError extends RoleResolutionError {
    constructor(message: string, context?: Record<string, unknown>);
  }
  class DuplicateAssignmentSlotError extends RoleResolutionError {
    constructor(slotKey: string, context?: Record<string, unknown>);
  }
  class InconsistentAssignmentOverrideError extends RoleResolutionError {
    constructor(message: string, context?: Record<string, unknown>);
  }
  class AmbiguousAssignmentOverrideError extends RoleResolutionError {
    constructor(candidateId: string, overrideIds?: string[], context?: Record<string, unknown>);
  }
  class AssignmentActorNotFoundError extends RoleResolutionError {
    constructor(actorId: string, context?: Record<string, unknown>);
  }
  class OverlappingDelegationError extends RoleResolutionError {
    constructor(actorId: string, context?: Record<string, unknown>);
  }

  // --- JobRunnerLib (L3): long-running jobs via generator functions ---
  type JobHandlerParams = Record<string, unknown> & { resumeState?: unknown };
  type JobHandler = (params: JobHandlerParams) => Generator<unknown, unknown, unknown>;
  interface JobQueueLike {
    registerJobHandler(jobType: string, handler: JobHandler): void;
    /** Delete every ScriptProperties key of the job on successful completion (persisted in the job config, so trigger resumes honor it). */
    setPurgeOnComplete?(purge: boolean): unknown;
  }
  class UtilsService {
    constructor(sleeperOrLogger?: unknown);
    /** Token-based date formatting (YYYY, MM, DD, HH, mm, ss, SSS); `utc:true` derives tokens from UTC components. */
    formatDate(date: Date, format?: string, options?: { utc?: boolean }): string | null;
    formatISODate(date: Date): string | null;
    /** Date | ISO | GG/MM/AA | GG/MM/AAAA | Sheets serial -> Date (UTC midnight for day-first strings), null if invalid. */
    parseDate(input: Date | string | number | null | undefined): Date | null;
    /** Basic `user@domain.tld` format validation (not a deliverability check). */
    isValidEmail(email: string): boolean;
    /** Custom-alphabet random ID (ref CoreUtilsLib/src/utils/IdGenerator.js); GAS-aware entropy, rejection sampling, no modulo bias. */
    generateCustomId(length?: number, alphabet?: string): string;
    /** Dedupes `array` by the value `iteratee` returns for each item, keeping the first occurrence (ref CoreUtilsLib/src/utils/SystemUtils.js). */
    uniqBy<T>(array: readonly T[], iteratee: (item: T) => unknown): T[];
  }
  /**
   * Generic date-range VO: containment/duration/overlap + an open-ended sentinel,
   * so callers stop hand-rolling `Date.getTime()` arithmetic and magic-number
   * "infinity" sentinels for open-ended periods (ref ALDO_GLF_AUDIT_RESULTS.md B-2).
   */
  class DateRange {
    constructor(start: Date, end?: Date | null);
    readonly start: Date;
    readonly end: Date;
    /** True if `end` is the open-ended sentinel (no upper bound was supplied). */
    isOpenEnded(): boolean;
    /** True if `date` falls within `[start, end]` inclusive. */
    contains(date: Date): boolean;
    /** Whole-day span, truncated. */
    durationInDays(): number;
    /** True if this range and `other` share at least one instant. */
    overlaps(other: DateRange): boolean;
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
      forceRestart?: boolean,
      maxDurationMs?: number,
      loggingConfig?: unknown
    ): unknown;
    resume(
      jobName: string,
      registryCallback: (queue: JobQueueLike, services?: unknown) => void,
      maxDurationMs?: number
    ): unknown;
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
  // FieldSpecification/CompositeSpecification (SpecificationLike, with and/or/not)
  // satisfy it, as do domain-pure subclasses that only override isSatisfiedBy and,
  // when exact equality pushdown is available, toQueryObject.
  interface QueryableSpecification<T = unknown> {
    isSatisfiedBy(entity: T): boolean;
    toQueryObject?(): Record<string, unknown> | null;
    canBeTranslatedToQuery?(): boolean;
    toQuery?(queryBuilder: RepositoryQueryBuilder): RepositoryQueryBuilder;
  }

  interface SpecificationLike<T = unknown> extends QueryableSpecification<T> {
    and(other: SpecificationLike<T>): SpecificationLike<T>;
    or(other: SpecificationLike<T>): SpecificationLike<T>;
    not(): SpecificationLike<T>;
  }
  abstract class Specification<T = unknown> implements SpecificationLike<T> {
    abstract isSatisfiedBy(entity: T): boolean;
    and(other: SpecificationLike<T>): SpecificationLike<T>;
    or(other: SpecificationLike<T>): SpecificationLike<T>;
    not(): SpecificationLike<T>;
    toQueryObject(): Record<string, unknown> | null;
    canBeTranslatedToQuery(): boolean;
    toQuery(queryBuilder: RepositoryQueryBuilder): RepositoryQueryBuilder;
  }
  abstract class EqualityFieldSpec<T = unknown> extends Specification<T> {
    constructor(column: string, read: (entity: T) => unknown, expected: unknown);
    isSatisfiedBy(entity: T): boolean;
    toQueryObject(): Record<string, unknown>;
    toString(): string;
  }
  function assertSpecificationContract<T, R extends Record<string, unknown>>(
    specification: QueryableSpecification<T> & {
      toQueryObject(): Record<string, unknown> | null;
    },
    rows: R[],
    hydrate: (row: R) => T
  ): { ok: boolean; divergenti: R[] };
  class FieldSpecification<T = unknown> extends Specification<T> {
    constructor(field: string, operator: string, value: unknown);
    isSatisfiedBy(entity: T): boolean;
    toQueryObject(): Record<string, unknown> | null;
  }
  class FunctionSpecification<T = unknown> extends Specification<T> {
    constructor(predicate: (entity: T) => boolean, description?: string | null);
    isSatisfiedBy(entity: T): boolean;
  }
  class CompositeSpecification<T = unknown> extends Specification<T> {
    isSatisfiedBy(entity: T): boolean;
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
    searchMessages(
      query: string,
      maxResults?: number
    ): Array<{
      id: string;
      threadId: string;
      subject: string;
      from: string;
      date: Date;
      plainBody: string;
    }>;
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
    replies: unknown[];
  }
  interface SpreadsheetProtectFailure {
    request: SpreadsheetProtectRequest;
    message: string;
  }
  interface SpreadsheetProtectBestEffortResult extends SpreadsheetProtectResult {
    failures: SpreadsheetProtectFailure[];
  }
  interface SpreadsheetProtectOptions {
    globalEditors?: { users?: string[]; groups?: string[]; domainUsersCanEdit?: boolean };
    onError?: 'continue';
  }
  interface SpreadsheetProtectedRange {
    id: number;
    range: unknown;
    description: string;
    editors: { users?: string[]; groups?: string[]; domainUsersCanEdit?: boolean };
    sheetId: number;
    sheetName: string;
    warningOnly: boolean;
  }
  interface SpreadsheetCreateSheetRequest {
    title: string;
    index?: number;
  }
  class SpreadsheetService {
    getSheetInfo(
      spreadsheetId: string,
      options?: { includeHidden?: boolean }
    ): SpreadsheetSheetInfo[];
    /**
     * Creates a brand-new, empty spreadsheet (no template to clone) via the Advanced Sheets API.
     * Returns the raw `Sheets.Spreadsheets.create` response (delegated straight through by
     * `SpreadsheetHybridManager` — no field trimming), so `sheets[0].properties.title` (the
     * locale-dependent default-tab name, e.g. "Foglio1" vs "Sheet1") is available immediately
     * from THIS response — no follow-up `getSheetInfo` read needed (and none of that read's
     * Advanced-Sheets-API propagation lag, ref `DatabaseSchemaExplorer`'s `verifyTables`).
     */
    createSpreadsheet(
      title: string,
      options?: { destinationFolder?: string; locale?: string; timeZone?: string }
    ): {
      spreadsheetId: string;
      spreadsheetUrl?: string;
      sheets?: Array<{ properties: { sheetId: number; title: string; index: number } }>;
    };
    /** The spreadsheet this script is bound to (only meaningful for a container-bound script, e.g. run from the Apps Script editor's Run dropdown on the MASTER sheet). */
    getActiveStandard(): { getId(): string };
    /** Single range -> values grid. Array of ranges -> Record<range, values grid> (not used by ALDO yet). */
    getRanges(spreadsheetId: string, ranges: string): unknown[][];
    updateRanges(
      spreadsheetId: string,
      updates: SpreadsheetRangeUpdate | SpreadsheetRangeUpdate[],
      options?: { valueInputOption?: string }
    ): SpreadsheetUpdateResult;
    appendRows(
      spreadsheetId: string,
      appends: SpreadsheetRangeUpdate | SpreadsheetRangeUpdate[],
      options?: Record<string, unknown>
    ): unknown;
    formatRanges(
      spreadsheetId: string,
      requests: SpreadsheetFormatRequest | SpreadsheetFormatRequest[],
      options?: Record<string, unknown>
    ): unknown;
    createSheets(
      spreadsheetId: string,
      requests: SpreadsheetCreateSheetRequest | SpreadsheetCreateSheetRequest[],
      options?: Record<string, unknown>
    ): unknown;
    deleteColumn(spreadsheetId: string, sheetName: string, columnIndex: number): unknown;
    protectRanges(
      spreadsheetId: string,
      requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[],
      options: SpreadsheetProtectOptions & { onError: 'continue' }
    ): SpreadsheetProtectBestEffortResult;
    protectRanges(
      spreadsheetId: string,
      requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[],
      options?: SpreadsheetProtectOptions
    ): SpreadsheetProtectResult;
    /** Real read-back of protected ranges (Advanced Sheets API `spreadsheets.get`, fields-scoped). Optional `sheetName` filters to a single tab. */
    getProtectedRanges(
      spreadsheetId: string,
      sheetName?: string | null
    ): SpreadsheetProtectedRange[];
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
  interface DocumentParagraphOptions {
    heading?: 1 | 2 | 3 | 4 | 5 | 6;
    alignment?: 'center' | 'right' | 'justify' | 'left';
  }
  interface DocumentListItemOptions {
    listType?: 'bullet' | 'number';
  }
  class DocumentBuilder {
    replaceText(searchPattern: string, replacement: string): DocumentBuilder;
    createTable(data: string[][], options?: DocumentCreateTableOptions): DocumentBuilder;
    /** Queues a paragraph append (real op type verified against GoogleApiWrapper/src/services/DocumentBuilder.js). */
    appendParagraph(text: string, options?: DocumentParagraphOptions): DocumentBuilder;
    appendListItem(text: string, options?: DocumentListItemOptions): DocumentBuilder;
    /** Queues a full body content override (deletes existing body text first). */
    setText(text: string): DocumentBuilder;
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
    /** Creates a brand-new, empty document (no template to clone) via the Advanced Docs API. */
    createDocument(
      name: string,
      options?: { destinationFolder?: string }
    ): { documentId: string; builder: DocumentBuilder };
    /** Docs-structure scan filtered to paragraphs/table cells containing any of `textPatterns` (default `['{{']`). */
    scanDocumentStructure(documentId: string, textPatterns?: string[]): DocumentScanResult;
    /**
     * Inserts a table immediately after the paragraph containing the literal `markerText`
     * (found via native `body.findText`), instead of appending at the document's end.
     * Throws if `markerText` is not found. Does NOT remove the marker text itself — the
     * caller is expected to remove it separately (e.g. via a `replaceText`/`removeText` call).
     */
    insertTableAtMarker(
      documentId: string,
      markerText: string,
      data: string[][],
      options?: DocumentCreateTableOptions
    ): DocumentInsertTableAtMarkerResult;
    /** Native DocumentApp Document object (e.g. for `.getBody().getText()`, DriveServiceFacade.getFileText). */
    openStandard(documentId: string): { getBody(): { getText(): string } };
  }
  /** GoogleApiWrapper's native Utilities API wrapper (ref GoogleApiWrapper/src/services/UtilitiesService.js). */
  class UtilitiesService {
    constructor(logger?: LoggerService, exceptionService?: unknown);
    sleep(milliseconds: number): void;
    getUuid(): string;
  }
  /** GoogleApiWrapper facade over the native Session global (ref GoogleApiWrapper/src/services/UserService.js). */
  class UserService {
    constructor(logger?: LoggerService);
    getActiveUserEmail(): string;
  }
  class ServiceFactory {
    static configure(config?: Record<string, unknown>): void;
    static reset(resetConfig?: boolean): void;
    static getLogger(): LoggerService;
    /** GoogleApiWrapper's native API wrapper (sleep, getUuid). */
    static getUtilitiesService(): UtilitiesService;
    /** CoreUtilsLib's foundational UtilsService (formatDate w/ tokens, formatISODate, isValidEmail, ...). */
    static getUtils(): UtilsService;
    /** Shared GasResilienceLib retry service. */
    static getExceptionService(): unknown;
    static getDriveService(): DriveService;
    static getDocumentService(): DocumentService;
    static getMailService(options?: Record<string, unknown>): MailService;
    static getPropertiesService(): LibPropertiesService;
    static getUiService(): LibUiService;
    static getSpreadsheetService(): SpreadsheetService;
    static getPermissionService(): PermissionService;
    static getUserService(): UserService;
    /** Raw cache FACTORY (exposes getScriptCache()) — NOT the resolved cache getCache() returns. */
    static getCacheService(): { getScriptCache(): unknown };
  }

  // --- GasSchemaValidatorLib (L1): declarative dataset validation ---
  interface DatasetViolation {
    ruleId: string;
    type: string;
    table: string;
    /** 0-based index into the dataset array (sheet row = index + 2). */
    rowIndex: number;
    column: string;
    value: string;
    details: Record<string, unknown>;
  }

  interface DatasetRuleContext {
    datasets: Record<string, Array<Record<string, unknown>>>;
    index(table: string, column: string): Set<string>;
  }

  type DatasetValidationRule =
    | { id: string; type: 'required'; table: string; columns: string[] }
    | {
        id: string;
        type: 'enum';
        table: string;
        column: string;
        values: string[];
        allowEmpty?: boolean;
      }
    | { id: string; type: 'json'; table: string; column: string }
    | {
        id: string;
        type: 'foreignKey';
        table: string;
        column: string;
        targetTable: string;
        targetColumn: string;
        csv?: boolean;
        allowWildcard?: boolean;
        allowEmpty?: boolean;
      }
    | {
        id: string;
        type: 'columnName';
        table: string;
        knownColumns: string[];
        targetTable: string;
        targetColumn: string;
        ignore?: string[];
        normalize?: (columnName: string) => string;
      }
    | {
        id: string;
        type: 'rowPredicate';
        table: string;
        check: (
          row: Record<string, unknown>,
          ctx: DatasetRuleContext
        ) => null | { column: string; value: unknown; details?: Record<string, unknown> };
      };

  class DatasetValidator {
    constructor(deps?: { logger?: LoggerService });
    validate(
      datasets: Record<string, Array<Record<string, unknown>>>,
      rules: DatasetValidationRule[]
    ): { violations: DatasetViolation[] };
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
  /**
   * Resumable-import checkpoint (GasDataImporter.md "Resumable/chunked
   * imports"): plain, JSON-serializable — safe to round-trip through
   * `PropertiesService`/`JobRunnerLib` via `JSON.stringify`/`JSON.parse` +
   * `ImportCheckpoint.fromJSON`. `stage` transitions EXTRACT -> LOAD ->
   * (EXTRACT again, or DONE); `TRANSFORM` is kept only so a checkpoint
   * persisted by an older library version still resumes — current runs never
   * transition into it themselves (transform now happens inline during
   * EXTRACT, on the bounded chunk).
   */
  interface ImportCheckpoint {
    recipeName: string;
    stage: 'EXTRACT' | 'TRANSFORM' | 'LOAD' | 'DONE';
    /** Opaque, owned by the extract strategy. */
    sourceCursor: unknown;
    /** 0/1 flag: 1 once EXTRACT reports the source exhausted. */
    rowOffset: number;
    /** Count of non-empty LOAD chunks already committed (see OVERWRITE first-chunk gating). */
    loadOffset: number;
    counters: {
      extracted: number;
      transformed: number;
      inserted: number;
      updated: number;
      skipped: number;
      deleted: number;
    };
    /** Rows in flight between stages. */
    buffer: Record<string, unknown>[] | null;
    done: boolean;
  }
  const ImportCheckpoint: {
    /** Builds a fresh checkpoint at EXTRACT with zeroed counters. */
    initial(recipeName: string): ImportCheckpoint;
    /** Rehydrates a checkpoint after a PropertiesService round-trip. */
    fromJSON(obj: Record<string, unknown>): ImportCheckpoint;
    /** Throws if `checkpoint.recipeName !== recipeName`. */
    assertMatches(checkpoint: ImportCheckpoint, recipeName: string): void;
  };
  interface ImportChunkBudget {
    maxRows?: number;
  }
  interface ImportChunkResult {
    checkpoint: ImportCheckpoint;
    done: boolean;
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
        postTransform?: (
          data: Record<string, unknown>[],
          config: ImportConfiguration
        ) => Record<string, unknown>[];
      }
    ): ImportRunResult;
    /**
     * Validates `recipe` (same validation as `runImport`) and returns a fresh
     * `ImportCheckpoint` at the `EXTRACT` stage. Does not extract, transform,
     * or load anything yet.
     */
    startImport(recipe: ImportRecipe, options?: Record<string, unknown>): ImportCheckpoint;
    /**
     * Advances `checkpoint` by one bounded unit of work. `recipe` must be
     * re-passed on every call (intentionally not part of the serializable
     * checkpoint); throws if `recipe.name !== checkpoint.recipeName`. Caller
     * loops until `done` is `true`, persisting `checkpoint` between calls
     * (e.g. via `JobRunnerLib`'s generator-yield checkpointing).
     */
    runImportChunk(
      recipe: ImportRecipe,
      checkpoint: ImportCheckpoint,
      budget?: ImportChunkBudget
    ): ImportChunkResult;
    /** Registers a custom SourceStrategy subclass under `name` (source.type) and whitelists the type. */
    registerCustomSource(
      name: string,
      strategyClass: new (
        logger: LoggerService,
        dependencies: Record<string, unknown>
      ) => SourceStrategy
    ): void;
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
    protected override _extractData(config: Record<string, unknown>): Record<string, unknown>[];
    constructor(logger: LoggerService, spreadsheetService: SpreadsheetService);
    /**
     * @param config.sheetId physical spreadsheet identifier (required).
     * @param config.tabName Target tab name (defaults to the first sheet).
     * @param config.range A1 notation range; when omitted, resolves the full sheet from gridProperties (no 26-column cap).
     * @param config.hasHeaders If true (default), treats the first row as property keys.
     */
    extract(config: {
      sheetId: string;
      tabName?: string;
      range?: string;
      hasHeaders?: boolean;
    }): Record<string, unknown>[];
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
  type BlockTemplate =
    string | ((data: unknown, options: { config: Record<string, unknown> }) => string);
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

  // --- GasOnlineTestFramework (independent): test harness running inside real GAS
  // (ref ALDO_GLF_AUDIT_RESULTS.md K-1/K-2) — only ever used from src/onlinetests/**. ---
  interface OnlineTestRunResult {
    passed: number;
    failed: number;
    skipped: number;
    errors: Array<{ path: string; message: string; stack?: string }>;
  }
  class EnhancedTestRunner {
    register(path: string, fn: () => void, options?: { skip?: boolean; timeout?: number }): this;
    run(filter?: string | RegExp | null): OnlineTestRunResult;
  }
  const runner: EnhancedTestRunner;
  class SmartAssert {
    static equals(actual: unknown, expected: unknown, message?: string): void;
    static notEquals(actual: unknown, expected: unknown, message?: string): void;
    static greaterThan(actual: number | Date, expected: number | Date, message?: string): void;
    static lessThan(actual: number | Date, expected: number | Date, message?: string): void;
    static isTrue(actual: unknown, message?: string): void;
    static isFalse(actual: unknown, message?: string): void;
    static isNull(actual: unknown, message?: string): void;
    static notNull(actual: unknown, message?: string): void;
    static deepEquals(actual: unknown, expected: unknown, message?: string): void;
    static isType(actual: unknown, expectedType: string, message?: string): void;
    static isNumber(actual: unknown, message?: string): void;
    static isString(actual: unknown, message?: string): void;
    static contains(array: unknown[], value: unknown, message?: string): void;
    static fail(message?: string): void;
    static throws(fn: () => void, message?: string): void;
  }
  /**
   * Persistent-artifact resource manager for online tests (ref K-1): reuses named Drive
   * folders/spreadsheets across runs instead of minting throwaway ones that are never cleaned
   * up. `getOrCreateNamedFolder`/`getOrCreateNamedSpreadsheet` generalize the class's own
   * hardcoded `getRootFolder`/`getSpreadsheet` to an arbitrary caller-supplied name.
   */
  class TestContext {
    readonly TEST_ROOT_NAME: string;
    readonly TEST_SS_NAME: string;
    readonly TEST_DOC_NAME: string;
    getRootFolder(): unknown;
    getOrCreateNamedFolder(name: string, parentFolder?: unknown | null): unknown;
    getSpreadsheet(): unknown;
    getOrCreateNamedSpreadsheet(name: string, parentFolder?: unknown | null): unknown;
    getDocument(): unknown;
    /** Strips protections/named ranges/extra sheets back to one blank "Sheet1"; defaults to `getSpreadsheet()`. */
    resetSpreadsheet(ss?: unknown): void;
    resetDocument(): void;
    resetAll(): void;
    /** Gets-or-creates + resets a named spreadsheet, wrapped for add-sheet/append-row sample-data construction. */
    buildSampleSpreadsheet(name: string, parentFolder?: unknown | null): SampleSpreadsheetBuilder;
    /** Opens + resets an existing spreadsheet by ID, wrapped for sample-data construction. */
    buildSampleSpreadsheetById(spreadsheetId: string): SampleSpreadsheetBuilder;
  }
  const testContext: TestContext;
  /** Generic sample-spreadsheet construction helper (ref GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js). */
  class SampleSpreadsheetBuilder {
    readonly id: string;
    addSheet(name: string, headerRow: string[]): void;
    appendRow(sheetName: string, row: Record<string, unknown>): void;
    appendRows(sheetName: string, rows: Array<Record<string, unknown>>): void;
    getUrl(): string;
  }
}
