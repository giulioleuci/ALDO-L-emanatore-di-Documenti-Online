# GasLibraryFactory — Code Health Review

**Date:** 2026-07-18
**Scope:** all 16 libraries under `/home/giulio/Desktop/ALDO implementing/GasLibraryFactory` (source only, `dist/` excluded).
**Method:** `codebase-memory-mcp` graph `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory` (6,617 nodes / 15,605 edges) for architecture, hotspot, complexity, and SIMILAR_TO duplication analysis; every reported finding re-confirmed against the real source with grep/Read. No source code was modified.

---

## Executive summary (ranked)

| # | Severity | Finding |
|---|----------|---------|
| 1 | **Important** | `_delegate()` — a byte-identical dynamic-delegation helper — is copy-pasted into **7 classes across 6 libraries**. It is core plumbing and belongs in CoreUtilsLib (L0). |
| 2 | **Important** | Three independent `escapeHtml` implementations with **inconsistent null handling**: `CoreUtilsLib.HtmlSanitizer.escapeHtml` throws on `null`, while the two private copies (`MailService`, `JobRunnerLogCapturer`) coerce via `String()`. Same-purpose utilities silently behave differently. |
| 3 | **Important** | The riskiest complex code is exactly the code with **no direct test file**: `SheetDBLib` query-builders (`AdvancedQueryCompiler` 405 lines, cognitive 60, O(n·m) join; `AdvancedQueryParser` 355 lines), `GasExpressionEngineLib/OperatorHandler._evaluateBinaryExpression` (cognitive 78), `WorkspaceTemplateEngine/DocumentProcessorValueResolver._applyFilters` (cognitive 85 — highest in the repo), `GasResilienceLib/ResilienceExecutionHandler` (226 lines). Coverage may be partial via facades, but nothing references these modules by name from any `__tests__` dir. |
| 4 | **Minor** | ~10 confirmed dead private methods (0 references anywhere, incl. string-based delegation): real-logic ones (`Mustache._applyFilter`, `Loader._findByKey`) and a batch of explicitly-labelled "legacy" delegation shims that back-compat cannot justify for `_private` members. |
| 5 | **Minor** | Cross-library logic duplication beyond `_delegate`: `_coerceValue` (SheetDBLib ↔ GasDataImporter, jaccard 1.0), `_columnToLetter` ×2, `_parseDate` ×2, `_getFamily` ×2. Each is a case the "GasLibraryFactory-first" rule says should be centralized. |
| 6 | **Info** | Architecture is **clean**: no circular deps, layering matches the documented L0→L4 graph, cluster cohesion ≥0.96, no native-GAS-global leaks outside sanctioned files, no async/Promise/setTimeout in shipped runtime code, fan-in/fan-out hotspots are all healthy utility hubs. |

---

## 1. Architecture

**Verdict: clean.** Confirmed findings:

- **No circular dependencies between libraries.** The real import matrix (grep of `from '@Lib'` across every `*/src`, test files excluded) is:

  ```
  ComposableContentLib   -> CoreUtilsLib
  ContextEngine          -> CoreUtilsLib, GasExpressionEngineLib, GasResilienceLib
  CoreUtilsLib           -> (none)          # apparent imports were all JSDoc examples in interfaces.js
  DomainRepositoryLib    -> CoreUtilsLib, GasSchemaValidatorLib
  GasDataImporter        -> CoreUtilsLib, GasExpressionEngineLib
  GasExpressionEngineLib -> CoreUtilsLib, WorkspaceTemplateEngine
  GasOnlineTestFramework -> (none)
  GasProcessMonitorLib   -> (none)
  GasResilienceLib       -> CoreUtilsLib
  GasSchemaValidatorLib  -> CoreUtilsLib
  GoogleApiWrapper       -> CoreUtilsLib, GasResilienceLib
  JobRunnerLib           -> CoreUtilsLib, GasResilienceLib, GoogleApiWrapper
  PipelineFramework      -> CoreUtilsLib, GasExpressionEngineLib
  RoleResolutionLib      -> CoreUtilsLib
  SheetDBLib             -> CoreUtilsLib, GasResilienceLib, GasSchemaValidatorLib, GoogleApiWrapper
  WorkspaceTemplateEngine-> CoreUtilsLib, GoogleApiWrapper
  ```

  This is a DAG and matches the dependency overview in `GasLibraryFactory/CLAUDE.md` (including `GasExpressionEngineLib → WorkspaceTemplateEngine`, which is the documented direction). One false alarm worth recording: `CoreUtilsLib/src/interfaces.js` *appears* to import from six higher-layer libraries, but every occurrence (lines 197, 345, 350, 420, 478, 543, 633, 701, 751) is inside `@example` JSDoc blocks, not code.

- **Cohesion:** Leiden clusters from `get_architecture` all score 0.96–1.00 cohesion and align with library boundaries (WorkspaceTemplateEngine, RoleResolutionLib, SheetDBLib, DomainRepositoryLib each form their own tight clusters). No module fragments across seams.

- **God modules (size, not coupling)** — see §7: `DocumentTableManager.js` (1,334 lines), `Mustache.js` (1,118), `PermissionService.js` (901) are the only files above 900 lines; their graph coupling is nonetheless local, so this is a maintainability note, not an architecture defect.

---

## 2. Native-global leaks

**Verdict: clean — zero genuine violations.**

Checked (regex over every `*/src/**/*.js`): `SpreadsheetApp, DriveApp, DocumentApp, MailApp, GmailApp, PropertiesService, CacheService, UrlFetchApp, ScriptApp, LockService, Utilities, Session`. Every hit falls into a sanctioned bucket:

- `GoogleApiWrapper/**` (the L2 abstraction itself) — 43 files.
- `GasOnlineTestFramework/**` (runs inside real GAS by design).
- `**/__tests__/**`, `**/testing/**` mocks (e.g. `SheetDBLib/src/testing/mocks.js`).
- `CoreUtilsLib/src/interfaces.js` — **doc comments only** (e.g. lines 253, 260 reference `Utilities.sleep` inside JSDoc).
- `CoreUtilsLib/src/internal/HashUtils.js`, `CoreUtilsLib/src/utils/IdGenerator.js` — the documented guarded L0 boundary.

The enforcement claim was verified: `eslint.config.js:205` bans all 11 globals for `**/src/**/*.js` with `no-restricted-globals: 'error'`, and the exemption block (`:248`, `'off'`) lists exactly the sanctioned paths above. Enforcement and documentation agree.

---

## 3. Dead code

Method: all private-method definitions (`_name(`) in non-test source were cross-referenced against every call site in the repo, **including string-based references** (this codebase attaches methods dynamically via `_delegate([...{methods: ['name']}])`, so a pure CALLS-edge query over-reports; e.g. `_applyConditions`, `_verifyAdvancedSheets`, `_parseStackTrace` looked dead in the graph but are alive via strings at `SheetDBLib/src/query/AdvancedQueryBuilder.js:53`, `GoogleApiWrapper/src/services/SpreadsheetService.js:85`, `GasResilienceLib/src/handlers/ErrorReporter.js:64`).

### Confirmed dead (0 references of any kind, incl. strings and tests)

| Severity | Location | Notes |
|---|---|---|
| Minor | `WorkspaceTemplateEngine/src/facades/Mustache.js:631` — `_applyFilter` | Real logic (filter registry lookup), never called. Filter application happens elsewhere. Remove or wire in. |
| Minor | `GasDataImporter/src/internal/load/Loader.js:380` — `_findByKey` | Real logic (linear row search), never called. Remove. |
| Minor | `GoogleApiWrapper/src/services/DriveService.js:137` and `PermissionService.js:896` — `_verifyAdvancedDrive` | Dead **and** duplicated in both classes (unlike `_verifyAdvancedSheets`, no string delegation references it). Remove both. |
| Minor | `SheetDBLib/src/TableService.js:183` — `_invalidateIndex`; `:604` — `_getNextEmptyRow` | Definition-only; `_invalidateIndex` is a `searchEngine` delegation shim. |
| Minor | `GasExpressionEngineLib/src/ExpressionParserService.js:105` — `_preprocess` | One-line shim to `_tokenScanner.preprocess`, unused. |
| Minor | `CoreUtilsLib/src/builders/ConfigurationBuilder.js:161–177` — `_coerceType`, `_validateField`, `_checkType` | Explicitly commented "LEGACY PRIVATE METHODS (Delegated for backward compatibility)". Private methods need no back-compat; remove. |
| Minor | `PipelineFramework/src/postprocessor/PostProcessorChain.js:168, 180` — `_shouldExecute`, `_evaluateCustomCondition` | Same pattern: post-refactor delegation shims to `ChainExecutor`, unused. |

### Candidates — verify before removing

| Location | Why uncertain |
|---|---|
| `DomainRepositoryLib/src/ValueObject.js:120` — `_ensureImmutable` | Documented `@protected` hook; ALDO (or future) `ValueObject` subclasses could legitimately call it. Check the consumer graph (`home-giulio-Desktop-ALDO-implementing`) before deleting. |
| Public exported API with no internal callers (e.g. `LodashFacade` entry points, `EmptyBehavior.isValid*`) | **Not dead** — this is a library monorepo; exported surface is consumed by ALDO. Explicitly excluded from the dead list. |

---

## 4. High fan-in / fan-out hotspots

**Verdict: healthy.** Graph evidence:

- Top fan-in (from `get_architecture` hotspots): `PipelineFramework.Step.setResult` (22), `GoogleApiWrapper.GoogleService._generateCacheKey` (16), `ServiceFactory.getLogger` (13), `JobRunnerLib.QueueStateManager._key` (12), `SheetDBLib.DynamicColumnAccessor._getFamily` (12). All are small, stable utility/infrastructure methods — exactly what *should* have high fan-in. No refactor needed.
- Top fan-out (Cypher: outgoing CALLS per method): maximum is **10** (`RoleResolutionLib.RoleResolver.resolve`, `WorkspaceTemplateEngine.DocumentProcessor.process`). No god functions by coupling; the orchestrators with fan-out 6–10 are legitimate coordinators.

---

## 5. Bug hunting

### 5.1 Error swallowing — mostly deliberate, two notes

- **Minor** — `PipelineFramework/src/Pipeline.js:229, 243, 272`: three `catch (_e) {}` blocks. Context (read in full): they guard *optional monitor logging* (`this._monitor.logStepStart/Complete/Skipped`) so a broken monitor can never break the pipeline — a defensible design. Recommended fix: downgrade rather than swallow, e.g. `this._logger.debug('monitor hook failed: ' + _e.message)`, so a permanently broken monitor is at least visible.
- **Info** — `SheetDBLib/src/internal/query-builders/AdvancedQueryCompiler.js:60` (QueryCache.get): `JSON.parse` failure → `return null` = cache miss. Correct semantics for a cache; fine.
- **Info** — `SheetDBLib/src/internal/dynamic-columns/ColumnType.js:86`: JSON coercion failure → `null` silently. Acceptable for cell coercion, but note it is indistinguishable from a genuinely empty cell; a debug log would help data-import triage.
- No other empty/`return`-default catches found in non-test source (swept all `*/src` with multiline-aware grep).

### 5.2 Async / Promise / timers (forbidden in GAS V8 runtime output)

**Clean.** Every `async|await|new Promise|setTimeout|setInterval` hit in non-test source is a false positive, confirmed by reading:
- `GasResilienceLib/src/handlers/CircuitBreaker.js` — matches are the `resetTimeout` *config field* (lines 29, 41, 237, 246), not `setTimeout`.
- `GasProcessMonitorLib/src/DashboardUi.js:376` — generates **client-side** HTML/JS strings for `google.script.run` polling; that code runs in the browser, not GAS server-side. Sanctioned context.

### 5.3 Duplicate near-identical functions (graph SIMILAR_TO, jaccard = 1.0, all re-confirmed in source)

- **Important — `_delegate` copied 7×, 6 libraries.** Byte-identical dynamic method-attachment helper in:
  `GoogleApiWrapper/src/services/SpreadsheetService.js`, `JobRunnerLib/src/JobRunnerService.js`, `SheetDBLib/src/DatabaseService.js`, `SheetDBLib/src/query/AdvancedQueryBuilder.js`, `WorkspaceTemplateEngine/src/processors/DocumentProcessor.js`, `GasResilienceLib/src/handlers/ErrorReporter.js` (def at `:69`), `GasDataImporter/src/pipeline/Transformer.js`.
  This is *the* facade-composition mechanism of the monorepo and is unowned. **Fix:** extract to CoreUtilsLib (L0 — all 6 libraries already depend on it), e.g. `CoreUtilsLib/src/utils/Delegation.js` `delegateMethods(target, delegations)`, and replace the copies.
- **Important — `escapeHtml` ×3 with inconsistent null handling.**
  - `CoreUtilsLib/src/utils/HtmlSanitizer.js:21` `escapeHtml(value)` — calls `value.replace(...)`: **throws on null/undefined**.
  - `GoogleApiWrapper/src/services/MailService.js:187` and `JobRunnerLib/src/internal/managers/JobRunnerLogCapturer.js:119` `_escapeHtml(text)` — identical private copies using `String(text)`: **null-safe** (renders `"null"`).
  The centralized utility exists but two libraries pre-date or bypass it, and swapping to it as-is would change null behavior. **Fix:** make `HtmlSanitizer.escapeHtml` null-safe (`String(value ?? '')`), then delete both private copies and route through `@CoreUtilsLib`.
- **Minor — `_coerceValue`** identical in `SheetDBLib/src/TableService.js` and `GasDataImporter/src/internal/extract-strategies/SourceStrategy.js` (string→number/boolean cell coercion). Two libraries independently define "how a Sheets cell becomes a JS primitive" — a divergence bug waiting to happen. Extract to CoreUtilsLib or have GasDataImporter reuse SheetDBLib's (it already sits beside it under GoogleApiWrapper).
- **Minor — within-library duplicates:** `_columnToLetter` (`GasDataImporter/src/internal/extract-strategies/FolderStrategy.js` ↔ `SheetByIdStrategy.js`), `_getFamily` (`SheetDBLib/src/internal/dynamic-columns/DynamicColumnAccessor.js` ↔ `FamilyAggregator.js`), `_parseDate` (`RoleResolutionLib/src/core/Assignment.js` ↔ `internal/delegation/DelegationState.js`), `_addHeaderWithStandardAPI`/`_addFooterWithStandardAPI` (`GoogleApiWrapper/.../DocumentBatchUpdateHandler.js`, same file). Hoist each into its library's shared internal helper.
- Info: same-file jaccard-1.0 groups in `UtilitiesService.js`, `DateUtils.js`, `DomainEvent.js` are thin intentional wrapper families — fine as is.

### 5.4 Inconsistent null handling in shared utilities

Beyond `escapeHtml` (above), no other same-purpose utility pair with divergent null semantics was found in the sampled hot paths.

---

## 6. Testing

Repo baseline is strong (per-library test dirs; 4,306 Jest tests per CLAUDE.md; `WorkspaceTemplateEngine` even has more test files than source files, `DomainRepositoryLib` has zero untested files). Method: a source file counts "directly untested" if its basename appears in **no** `__tests__` file in its library or the top-level `test/` integration suite. Indirect coverage through a facade's tests is possible — treat these as risk-ranking, not proof of zero coverage.

### Riskiest untested code (high complexity × no direct test — Important)

| File | Lines | Evidence of risk |
|---|---|---|
| `SheetDBLib/src/internal/query-builders/AdvancedQueryCompiler.js` | 405 | `_performJoin` (line 156): cognitive 60, `linear_scan_in_loop=3` (nested-scan join, O(n·m)); plus the QueryCache. Zero direct tests for the whole query-builders folder (`AdvancedQueryParser.js` 355 lines, `AdvancedQueryValidator.js`, `AdvancedQueryPagination.js` likewise). |
| `GasExpressionEngineLib/src/internal/OperatorHandler.js` | 247 | `_evaluateBinaryExpression` (line 30): cognitive 78, 113 lines — the expression engine's core semantics. Whole `internal/` + `handlers/` untested by name (`AstNodeEvaluator`, `TokenScanner`, `AstBuilder`, `EvaluationContextHandler`). |
| `WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorValueResolver.js` | 94 | `_applyFilters` (line 11): cognitive **85 — highest in the repo** in 76 lines. No test references the file. |
| `GasResilienceLib/src/handlers/ResilienceExecutionHandler.js` | 226 | `executeWithAdvancedHandling` (line 14): 159 lines, cognitive 29 — the retry/fallback core of the resilience library. None of the 5 `handlers/internal` files is referenced by tests. |
| `SheetDBLib/src/TableDataModifier.js` + `internal/multi-coordination/PartitionCoordinator.js` | 367 + 240 | Write-path and cross-partition coordination logic with no direct tests. |
| `JobRunnerLib/src/QueueStateManager.js` + `internal/QueuePersistenceHandler.js` | 168 + 209 | ScriptProperties state serialization — the exact mechanism ALDO's long-job checkpointing relies on; corruption here is silent data loss. No direct tests (`JobQueue.execute`, 173 lines, *is* covered via `JobQueue.test.js`). |

Lower-risk untested clusters (Minor): `GasDataImporter/src/internal/transform-managers/*` (4 files), `PipelineFramework/src/internal/postprocessor-chain/ChainExecutor.js` + `builtin/BaseUpdatePostProcessor.js` (323 lines), `CoreUtilsLib` system utils (`SystemQuotaManager.js` 380, `DateUtils.js` 498, `ConfigValidator.js` 216), `ComposableContentLib/src/internal/BlockRenderer.js` (295) and `core/CompositionResult.js`, `RoleResolutionLib/src/internal/routing/RoutingResult.js` (250), `WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorInjector.js`/`TagScanner.js`, and most of `GoogleApiWrapper/src/services/drive/*` + `internal/services-managers/*` (the latter genuinely need live GAS; they are what `__testOnline__` exists for).

**Recommended order:** (1) query-builders in SheetDBLib, (2) OperatorHandler, (3) ResilienceExecutionHandler, (4) JobRunnerLib persistence — each is pure sync JS and unit-testable offline today.

---

## 7. Maintainability

- **Important — `GasExpressionEngineLib/src/ExpressionEvaluatorService.js:178` `_builtInFunctions` is a 463-line method** (complexity 30) defining every built-in function inline. Fix: split into a registry (one module per function family — string/date/math/logic), mirroring how `WorkspaceTemplateEngine` already does filter registries (`createBuiltInFilters`).
- **Minor — oversized files** (all confirmed via `wc -l`): `GoogleApiWrapper/src/internal/services-managers/DocumentTableManager.js` (1,334), `WorkspaceTemplateEngine/src/facades/Mustache.js` (1,118 — a maintained in-house Mustache fork; `_parseTemplate` at :1007 is 108 lines/cognitive 52, `_lookupValue` at :646 is 77 lines/cognitive 56), `GoogleApiWrapper/src/services/PermissionService.js` (901), `JobRunnerLib/src/JobQueue.js` (683 — contains both `JobExecutor.execute` 139 lines and `JobQueue.execute` 173 lines). Each already has internal section structure; split along it when next touched. Not urgent — cluster cohesion shows they don't leak coupling.
- **Minor — long/complex methods worth a targeted refactor** (graph complexity metrics, top of repo): `DocumentProcessorValueResolver._applyFilters` (cog 85), `OperatorHandler._evaluateBinaryExpression` (cog 78), `DocumentContentExtractor.scanDocumentStructure` (cog 73, `GoogleApiWrapper/.../DocumentContentExtractor.js:193`), `Pipeline.execute` (cog 61, 99 lines), `AdvancedQueryCompiler._performJoin` (cog 60), `TableService.flush` (146 lines, `SheetDBLib/src/TableService.js:229`), `SheetProcessor.process` (`transitive_loop_depth=5`, `linear_scan_in_loop=3` — deepest interprocedural nesting in the repo). The overlap between this list and §6's untested list is the repo's principal risk concentration.
- **Info — unclear ownership resolved in duplication findings:** HTML escaping (should be CoreUtilsLib only, §5.3), cell-value coercion (SheetDBLib vs GasDataImporter, §5.3), delegation plumbing (`_delegate`, §5.3). No layer-placement violations found otherwise.

---

## Appendix — what was checked and found clean

- Circular deps between libraries: none (full import matrix, §1).
- Native-global leaks: none outside sanctioned files; ESLint guard verified at `eslint.config.js:195–250` (§2).
- `async`/`await`/`Promise`/`setTimeout` in shipped runtime code: none (§5.2).
- Fan-out god functions: none — max fan-out 10 (§4).
- Public exported API without internal callers: expected for a library monorepo; excluded from dead-code findings (§3).
- `GasSchemaValidatorLib`: tiny (103 source lines) with a proportionate 248-line test — fine despite the 3-src/1-test file ratio.
