# ALDO ↔ GLF Delegation Audit — Results (2026-07-13 re-audit)

Context: an earlier audit (`REPORT_GLF.md`, 2026-07-11/12) found gaps and was reportedly fully implemented (14 commits, 2026-07-12). This document is a **fresh, independent re-audit** of the current `src/` tree (146 files) against `GasLibraryFactory/DOCS_LIBS`, tracked file-by-file in `ALDO_FILES_TO_ANALYZE.md`. Only genuine, currently-present issues go here — do not assume prior findings still apply without re-verifying against current code.

Findings are grouped by file group (A–K). Each entry: file, issue, suggested GLF-based fix.

## Overall summary

146/146 files analyzed. **No native GAS global leaks found anywhere outside `GoogleApiWrapper`/sanctioned exceptions.** The codebase is in materially better GLF-delegation shape than the 2026-07-11/12 audit found — several previously-flagged issues are confirmed fixed (Specification/QueryTranslator pushdown now works end-to-end; most repositories use `find(spec)`/indexing; `emailSteps.ts` hardcoding resolved; Docs-table insertion via `WorkspaceTemplateEngine`/`DocumentService` resolved).

Remaining findings, by category:

- **Category A (unused-but-available GLF capability) — action now, no user decision needed:**
  - D-1: `ClasseRepository.ts` — 4 finders + `getAlunniAttivi` bypass `find(spec)`/`AlunnoRepository`.
  - D-2: `LogDocumentoRepository.ts` — no index on STATO.
  - D-3: `LogCartellaRepository.ts` — no index on TIPO.
  - D-4: `VariazioneCattedraRepository.ts` — no index on `findByNuovoTitolare`'s column (minor).

- **Category B (partial-match — needs a user decision before extending GLF or writing custom code), per CLAUDE.md's mandatory "stop and ask" rule:**
  - B-1: `Email.ts` hand-rolled format regex — candidate for a `CoreUtilsLib` email validator.
  - B-2: `PeriodoSupplenza.ts` hand-rolled date-range logic — candidate for a `CoreUtilsLib` date-range VO.
  - I-1 / I-2: `CattedraResolver.ts` / `RisolutoreRuoliService.ts` — pre-existing, already-scoped `RoleResolutionLib` extension requests (REPORT_GLF.md B3/B4); no new action, already surfaced.
  - K-1 / K-2: `GasOnlineTestFramework` (vendored, untyped, unused) duplicates what `GasSampleSpreadsheetFactory.ts`/`SampleDatabaseBuilder.ts`/`OnlineTestReport.ts` hand-roll, including missing test-artifact cleanup in Drive.

- **Documentation gap (not a code issue):** `GasLibraryFactory/DOCS_LIBS` doesn't document `DocumentService.insertTableAtMarker`/`createTable`/`scanDocumentStructure`, even though ALDO correctly uses them via `DocumentTableFacade`. Worth fixing in DOCS_LIBS so future doc-only audits don't misdiagnose this as a gap.

No issues at all in groups A, C, E, F, G, H, J (7 of 11 groups fully clean).

---

## Group A — domain/entities + errors (21 files)

**No issues found.** All 21 entity/error files are domain-pure: zero native GAS global leaks, zero GLF imports. `AldoEntity extends Entity` resolves to an ambient global type (GAS shared-namespace convention), not a layering violation. Trivial inline `new Date(isoString)` calls and CSV `split/trim/filter` one-liners are self-contained, not reimplementations of a CoreUtilsLib capability, and domain code is required to stay library-free per CLAUDE.md anyway.

## Group B — domain/value-objects (14 files)

12/14 clean. Two low-severity, ask-before-deciding items:

### B-1. `src/domain/value-objects/Email.ts` — hand-rolled email format regex
- Problem: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` hand-rolled validation. Email is a cross-cutting PK/FK type per CLAUDE.md ("emails are primary/foreign keys").
- GLF capability: `CoreUtilsLib` docs mention generic validation/sanitization utilities but don't explicitly document an email-format validator — genuinely ambiguous from docs alone.
- Category: B (partial-match-needs-extension, unconfirmed)
- Suggested action: **ask the user** whether `CoreUtilsLib` should gain a canonical `isValidEmail` utility before this keeps getting hand-rolled — it's foundational/cross-domain, not SGSA-specific.

### B-2. `src/domain/value-objects/PeriodoSupplenza.ts` — hand-rolled date-range containment/duration/overlap logic
- Problem: manual `Date.getTime()` arithmetic, a manual `MS_PER_DAY` constant, and a magic-number "infinity" date (`8640000000000000`) to represent an open-ended period.
- GLF capability: `CoreUtilsLib` docs don't explicitly document a range/interval/overlap helper.
- Category: B (partial-match-needs-extension, unconfirmed)
- Suggested action: **ask the user** whether `CoreUtilsLib` should gain a generic date-range VO (containment, duration-in-days, open-ended sentinel) since "period with optional open end" is reusable beyond SGSA. If declined, current code is acceptable as domain-local — it directly backs the SUPPLENZE/role-resolution hierarchy which is legitimately SGSA business logic.

## Group C — domain/specifications + repositories interface (14 files)

**No issues found.** Verified with fresh eyes: the previously-flagged `Specification<T>` / `QueryTranslator` duck-type incompatibility (from the 2026-07-11/12 audit) **is confirmed fixed**. `Specification.ts` now exposes `toQueryObject(): Record<string, unknown> | null`, consumed end-to-end by `Database.ts`'s `EqualityQueryBuilder`/`createSelect` to push equality criteria down to an indexed lookup, falling back to `null` (in-memory filtering) only for genuinely non-equality/cross-entity predicates. Every concrete Spec file does this correctly — no spec reimplements GLF's composition logic, and no pushdown-eligible spec was left un-pushed.

## Group D — infrastructure/repositories (21 files)

The prior "every repository bypasses `find(spec)`" finding is **no longer true** — 14/21 correctly use `find(spec)` and/or `createIndex`/`indexedLookup`. Remaining real gaps:

### D-1. `src/infrastructure/repositories/ClasseRepository.ts` — manual scans instead of Specifications; bypasses `AlunnoRepository`
- Problem: `findAttive`, `findByAnno`, `findByIndirizzo`, `findArticolate` hand-roll `this.rows().filter(...)` instead of `this.find(spec)`. `getAlunniAttivi` reaches into `database.tables[TABLE.ALUNNI].getAllRows()` directly and applies `AlunniAttiviSpec.isSatisfiedBy` manually — a duplicate/parallel path to `AlunnoRepository.findAttivi`, bypassing that repository entirely.
- GLF capability: DomainRepositoryLib Specification pattern + `find(spec)` pushdown, already used correctly elsewhere in the same file.
- Category: A (unused-but-available)
- Fix: introduce `ClassiAttiveSpec`, `ClassiPerAnnoSpec`, `ClassiPerIndirizzoSpec`, `ClassiArticolateSpec`; route the four finders through `this.find(spec)`; have `getAlunniAttivi` delegate to `AlunnoRepository.find(new AlunniAttiviSpec())` filtered by classe instead of touching `TABLE.ALUNNI` directly.

### D-2. `src/infrastructure/repositories/LogDocumentoRepository.ts` — no index on hot STATO column
- Problem: `findByClasse`, `findByUtente`, `findByStato`, `findNonNotificati` are all full `findAll().filter()` scans on an append-only audit table; STATO is a natural equality-lookup hot column repeatedly queried and has no index, unlike sibling `LogEmailRepository`.
- GLF capability: SheetDBLib `createIndex`/`indexedLookup`.
- Category: A (unused-but-available)
- Fix: `createIndex(COL_LOG_DOCS.STATO)` in the constructor; route `findByStato` through `indexedLookup` with a `findAll().filter()` fallback, matching `LogEmailRepository.findByPattern`'s pattern.

### D-3. `src/infrastructure/repositories/LogCartellaRepository.ts` — no index on TIPO
- Problem: `findByClasse`/`findByTipo` full-scan an unboundedly-growing audit table; no Specification class, no index — unlike `LOG_MAIL`/`SUPPLENZE` siblings.
- GLF capability: SheetDBLib `createIndex`/`indexedLookup` (TIPO is equality; CLASSI is CSV-containment, doesn't apply there).
- Category: A (unused-but-available)
- Fix: `createIndex(COL_LOG_FOLD.TIPO)`; route `findByTipo` through `indexedLookup`.

### D-4. `src/infrastructure/repositories/VariazioneCattedraRepository.ts` — no index despite being priority-2 in role resolution (minor)
- Problem: no `createIndex` at all; all four finders full-scan with inline predicates instead of Specification classes, despite this table sitting in the hot SUPPLENZE→VARIAZIONI_CATTEDRA→CLASSI role-resolution path.
- GLF capability: SheetDBLib `createIndex`, clearest fit for `findByNuovoTitolare` (exact-match email column); CLASSE_ID/MATERIA_ID are CSV-containment so may genuinely not fit an equality index.
- Category: A/B mixed (A for `findByNuovoTitolare`, uncertain fit for the rest)
- Fix: at minimum index the new-titolare column for `findByNuovoTitolare`; add `VariazioniPerClasseSpec`/`VariazioniPerMateriaSpec` for consistency with the rest of the codebase.

All other 17 repository files are clean (correct `find(spec)`/`createIndex` usage, or legitimately small cached-config tables where indexing doesn't matter). No native GAS global leaks anywhere in this group.

## Group E — infrastructure/facades + db + services (12 files)

**No issues found.** All facades correctly delegate to GLF (`GoogleApiWrapper`, `MailService`, `PlaceholderService`, `DocumentService`, `DriveService`, `ExpressionEngineService`, `ProcessMonitorService`, `ServiceFactory`). Two prior-audit concerns were re-checked and are resolved in current code:
- `ActiveUserFacade.ts`'s direct `Session.getActiveUser()` call is a legitimate narrow L2 exception — GLF has no wrapped session accessor (verified against `GoogleApiWrapper_docs.md`/`types/gaslibs/index.d.ts`).
- The previously-flagged "WorkspaceTemplateEngine only supports data-driven tables for Sheets, not Docs" gap is resolved: `DocumentTableFacade.ts` now uses real `DocumentService.scanDocumentStructure`/`createTable`/`insertTableAtMarker` methods (`types/gaslibs/index.d.ts:767-795`), not a hand-rolled workaround.

`Database.ts`'s `EqualityQueryBuilder` is not a reimplementation — it fulfills a documented injection-seam contract (`RepositoryQueryBuilder`/`RepositoryDatabase`) that DomainRepositoryLib's `Repository.find()` requires the host app to supply.

## Group F — infrastructure/steps + config + entrypoints + presentation (9 files)

**No issues found.** `documentSteps.ts`/`emailSteps.ts`/`postProcessActions.ts` are built on `PipelineFramework`'s `Step` base class with no hand-rolled batching/retry/checkpointing. The prior-audit "emailSteps hardcoding" bug is resolved: `ComposeEmailStep` pulls all copy (TESTO, OGGETTO, COLORE_HEADER, NOREPLY, supervisore email) from `ConfigurazioneEmail`/`MASTER` config, not literals. `Bootstrap.ts` is a genuine composition root using `JobRunnerService`/`JobDefinitionRegistry` for batch jobs. `ServiceContainer.ts` is a thin, faithful wrapper over `CoreUtilsLib.LazyServiceContainer`.

## Group G — application/context-engine top-level (10 files)

**No issues found.** `ContextBuilder.ts` delegates orchestration to GLF `ContextEngine`'s `ProviderRegistry`/`InterceptorRegistry`/`ContextAssembler`. `dates.ts` delegates formatting to `CoreUtilsLib`'s `UtilsService.formatDate`. `Recipe.ts` contains a well-sourced justification (verified against `ContextEngine/src/internal/DependencyResolver.js`) for why GLF's `DependencyResolver` does NOT cover whole-recipe dependency ordering, so the local recipe-ordering logic is not a missed delegation. Remaining files are legitimately CDU-shape-specific per CLAUDE.md's carve-out.

## Group H — application/context-engine providers + interceptors + mappers (14 files)

**No issues found.** `SupplentiSubstitutionLookup.ts` (highest-risk file in this group) does not reimplement the SUPPLENZE→VARIAZIONI_CATTEDRA→CLASSI cascade — Priority 1 is delegated to `SupplenzaRepository`, which wraps rows as `Delegation` objects and calls GLF's `InMemoryDelegationSource.getDelegationChain` (RoleResolutionLib); Priorities 2/3 are resolved upstream by `ConsiglioClasseProvider`/`CdcAssembler`. This file only implements the SGSA-domain `GestioneSupplenti` annotation policy, which the generic library interceptor deliberately delegates to a caller-supplied function. All providers are CDU-shape-specific projections with no reimplemented generic filtering/sorting/statistics logic.

## Group I — application/services + email + import (14 files)

12/14 clean. Two pre-existing, already-documented partial-match gaps (unchanged from `REPORT_GLF.md` items B3/B4 — not new regressions, and already scoped for a future GLF extension, not action needed right now):

### I-1. `src/application/services/CattedraResolver.ts` — local priority-chain resolver over heterogeneous sources
- Problem: implements the SUPPLENZE→VARIAZIONI_CATTEDRA→CLASSI 3-tier resolution via a local `PriorityChainResolver`, because `RoleResolutionLib` has no primitive for "ordered list of heterogeneous data sources, first non-null wins." Priority-1 substitute redirection is delegated cleanly via `SupplenzaRepository`/`RoleResolutionLib.getDelegationChain`.
- Category: B (partial-match-needs-extension) — matches REPORT_GLF.md B3.
- Suggested fix: none needed now; extension already scoped (add `PriorityChainResolver`/ordered `RoleRegistry` construction to GLF), not yet implemented.

### I-2. `src/application/services/RisolutoreRuoliService.ts` — local wiring of dynamic delegate resolution onto `RoutingPolicy`
- Problem: `applicaSupplenze` hand-rolls mapping `GestioneSupplenti` onto `RoleResolutionLib.RoutingPolicy` because the library's `RoutingPolicy`/`RoutingResolver` expects a statically pre-registered `RoleRegistry`, not one resolved dynamically per (titolare, materia, classe, date). The routing decision itself is correctly delegated to `RoutingResolver.resolve`.
- Category: B (partial-match-needs-extension) — matches REPORT_GLF.md B4.
- Suggested fix: none needed now; extension already scoped (let `RoutingPolicy` accept a delegate-resolver callback), not yet implemented.

All other 12 files (AggregatoreDati, DocumentBatchService, DocumentGenerationService, EmailBatchService, EmailNotificationService, EmailRetryService, ImportService, ReportService, boxes.ts, saluto.ts, CustomSourceStrategies.ts, ImportRecipeMapper.ts) are clean — correct `JobRunnerLib`/`PipelineFramework`/`ComposableContentLib`/`GasDataImporter` delegation, no hand-rolled batching, retry, templating, or import-phase logic.

## Group K — onlinetests (7 files)

**New finding — `GasOnlineTestFramework` is vendored but unused.** `vendor/gaslibs.Code.js` already exports a GLF library purpose-built for exactly this "test harness running inside real GAS" scenario (`EnhancedTestRunner`, `SmartAssert`, `TestContext`, per `GasOnlineTestFramework_docs.md`: Command-Pattern test queue, fluent assertions, and — critically — **automatic creation/cleanup of files and sheets created during tests "to not pollute the user's Drive"**). It has no TypeScript typings in `types/gaslibs/index.d.ts` and is never imported anywhere in `src/onlinetests/`.

### K-1. `src/onlinetests/GasSampleSpreadsheetFactory.ts` / `SampleDatabaseBuilder.ts` — hand-rolled spreadsheet creation with no cleanup
- Problem: creates sample spreadsheets/sheets via raw `SpreadsheetApp.create`/`insertSheet`/`deleteSheet`; neither this factory nor its caller (`index.ts`) ever deletes the throwaway spreadsheet/folder after a test run — sample artifacts accumulate permanently in Drive. The in-file comment claiming "no GLF-wrapped way to mint a spreadsheet" only checked `SheetDBLib`/typings, not `GasOnlineTestFramework`.
- GLF capability: `GasOnlineTestFramework`'s resource-cleanup facility (vendored, untyped, unused).
- Category: B (partial-match-needs-extension, blocked on missing typings)
- Suggested action: **ask the user** whether to add `.d.ts` typings for `GasOnlineTestFramework` and route sample-spreadsheet creation/teardown through it, given it appears purpose-built for this exact case.

### K-2. `src/onlinetests/OnlineTestReport.ts` — hand-rolled test-runner re-derives `GasOnlineTestFramework`
- Problem: `TestRunner`/`OnlineTestResult` reimplements a pass/fail-accumulating command-pattern test queue with try/catch, closely mirroring `EnhancedTestRunner`'s documented design.
- GLF capability: `GasOnlineTestFramework`'s `EnhancedTestRunner`/`SmartAssert`/`TestContext` (vendored, untyped, unused).
- Category: B (partial-match-needs-extension, blocked on missing typings)
- Suggested action: **ask the user** whether to type and adopt `EnhancedTestRunner`, or get explicit sign-off to keep the current thin custom wrapper if its result shape doesn't cleanly map to `OnlineTestReport`'s contract.

All other files (`index.ts`, `checks/contextEngineChecks.ts`, `checks/pipelineChecks.ts`, `checks/repositoryChecks.ts`) are architecturally clean — they correctly exercise ALDO's own production container-resolved services/repositories rather than bypassing them, with only well-commented, justified native-global exceptions (`ServiceFactory.getDriveService()` for root-folder minting). `index.ts` inherits the K-1 missing-cleanup gap (never deletes the minted root folder) and should be fixed alongside it.

## Group J — application/storico + strategies (13 files)

**No code issues found.** All 13 files are clean: no native GAS global leaks, no hand-rolled diffing/reconciliation/fuzzy-matching logic, and generator strategies correctly delegate rendering to `ITemplateEngine`/`WorkspaceTemplateEngine`, only adding legitimate SGSA-domain orchestration (ACL/role-resolution-driven protected ranges, subject grouping) on top.

**Meta-finding (documentation gap, not a code issue):** The prior audit's "WorkspaceTemplateEngine only supports data-driven tables for Sheets, not Docs" concern is resolved in code (confirmed independently by both this group and Group E) — `DocumentService` (GoogleApiWrapper) exposes real `insertTableAtMarker`/`createTable`/`scanDocumentStructure` methods, used correctly via `DocumentTableFacade`. However, **these methods are not documented in `GasLibraryFactory/DOCS_LIBS`**, only discoverable by reading `vendor/gaslibs.Code.js`/`types/gaslibs/index.d.ts` directly. Per project convention (consult GLF via docs only), this is worth flagging to whoever maintains `DOCS_LIBS` so future doc-only audits don't re-flag this as a gap.

---
