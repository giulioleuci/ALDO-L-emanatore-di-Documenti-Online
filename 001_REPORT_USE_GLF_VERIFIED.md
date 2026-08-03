# Verified ALDO → GasLibraryFactory Reuse Audit

Scope: current ALDO application, unit/integration/build/online tests, the ALDO ambient GLF declarations, and the separate GasLibraryFactory graph and `DOCS_LIBS`.

## Executive verdict

The previous report contains 36 individual findings. Eight identify a real or partly real condition; 28 should be discarded as current refactoring findings.

Of the eight retained findings, `docs/superpowers/plans/2026-07-31-glf-reuse-fixes.md` turned six into implemented, tested, committed work (Tasks 1–3, 4/5), plus two related ALDO→GLF extractions from `000_estrazioni_to_glf.md` (Tasks 6–7) and a cosmetic specs-alignment cleanup (Task 8):

- **Done** — Gmail quota-aware email batching (Task 1), `JobRunnerLib`-backed email retry (Task 2), coarse import job monitoring (Task 3), and a genuinely resumable/chunked `GasDataImporter` checkpoint API consumed by ALDO (Tasks 4–5). See "Implemented findings" below for commit references.
- **Done (unrelated extractions, not from this report)** — `LazyRef<T>` moved to `CoreUtilsLib` (Task 6) and the pure `RowScopeExpansion` CSV/slot-parsing helpers moved to `RoleResolutionLib` (Task 7), plus aligning ALDO's local `Specification<T>` interface to `DomainRepositoryLib`'s base class (Task 8).
- **Still open** — supported schema-validation exports (finding A below) was not part of the executed plan; application-level circuit protection and external context recipes remain optional, not implemented, per the original "as-is, only if wanted" verdict.

Verification as of this review: `npm run typecheck`, `npm run lint`, `npm test` (1056 tests), `npm run test:integration` (13 tests), and `npm run test:build` (7 tests) are all green in ALDO; `GasLibraryFactory`'s own `npm test` is green (8350 passed, 9 skipped, 248 suites); `npm run verify:vendor` reports a matching checksum, so ALDO's vendored bundle reflects the GLF-side changes.

No production ALDO call to a native GAS global was found in the combined graph. Current service access routes through GLF/facades. The online-test references are sanctioned test-framework use, not production bypasses.

## Verdict legend

- **KEEP — AS IS**: real condition; existing GLF behavior can implement the useful fix.
- **KEEP — GLF CHANGE**: real condition; a clean or complete fix needs a GLF extension.
- **PARTIAL / OPTIONAL**: observation is true, but it is not a current defect or the proposed solution is too broad.
- **DONE**: implemented and verified against the plan below; see the commit references in each section.

## Real findings implementable with GLF as it exists

### 1. Quota-aware email batching; optional circuit protection — **DONE**

Implemented: `GmailServiceFacade.getRemainingQuota()` delegates to `MailService.getQuotaUsage()`; `EmailBatchService.batchSendHandler` caps each chunk to `min(chunkSize, remainingQuota)` and suspends cleanly (no resume-trigger churn) at zero quota (commit `fd6e642`). Application-level circuit protection (GLF `CircuitBreaker`) was not added — the quota preflight was judged sufficient, per the original "as-is, quota-aware stopping is the primary fix" verdict.

Verified chain:

`src/index.ts` launcher
→ `src/application/services/EmailBatchService.ts`
→ `src/application/services/EmailNotificationService.ts`
→ `src/application/pipelines/emailSteps.ts` (`SendEmailStep`)
→ `src/infrastructure/facades/GmailServiceFacade.ts`
→ `GoogleApiWrapper/src/services/MailService.js`
→ `GoogleApiWrapper` internal service access.

ALDO changes:

- `src/infrastructure/facades/GmailServiceFacade.ts`: add a remaining-quota operation delegating to `MailService.getQuotaUsage()`.
- The interface that owns `IGmailFacade`: add the same operation.
- `src/application/services/EmailBatchService.ts`: inspect quota before each chunk and cap work by recipient count, not message count.
- `src/config/Bootstrap.ts`: inject the quota facade into the batch service if it is not already reachable through the notification service.
- Corresponding fakes and unit tests under `test/fakes/` and `test/unit/`.

Important behavior: when quota is zero, do not create rapid resume-trigger churn. Record a clear suspended/failed state and require a next-day policy or an explicit restart. A GLF `CircuitBreaker` can stop repeated attempts, but quota is a deterministic capacity condition, so quota-aware stopping is the primary fix.

No GLF source change is required. The previous report's method name `getRemainingDailyQuota()` is incorrect.

### 2. Failed-email retry through `JobRunnerLib` — **DONE**

Implemented: `EmailRetryService.retryHandler()` is a generator registered under `JOB_TYPE_RETRY_EMAIL`, launched via `menu_avvioRetryEmail()`/`avviaRetryEmailDataDriven()` (commit `d41f624`). A follow-up review found and fixed a real resume bug: the initial implementation anchored resume on a positional `groupIndex`, but `groupFailed()` is recomputed fresh from `LOG_MAIL` on every invocation and successful groups drop out of it, so an index-based resume could silently skip never-retried groups. Fixed by anchoring resume on `RetryResumeState.processedKeys` (stable per-group identity) instead (commit `0e99818`, reproduced with a two-generator-instance suspend/resume test).

Verified chain:

currently registered `EmailRetryService`
→ `retryFailed()`
→ grouped failed `LOG_MAIL` records
→ `EmailNotificationService.sendToTarget()`
→ email pipeline
→ `GmailServiceFacade`
→ GLF `MailService`.

There is no active inbound launcher for `retryFailed()`. Two valid choices exist:

- **Keep feature:** convert retry grouping into a generator/checkpointed handler, register a retry job type in `src/config/Bootstrap.ts`, expose launch/resume functions in `src/index.ts` and `src/entrypoints/EntryPoints.ts`, and add a menu entry only if operators need it.
- **Remove feature:** delete the unreachable service and container registration. This is preferable if retry is not in current requirements.

Impacted ALDO files if kept:

- `src/application/services/EmailRetryService.ts`
- `src/config/Bootstrap.ts`
- `src/index.ts`
- `src/entrypoints/EntryPoints.ts`
- optionally `src/presentation/Menu.ts`
- related service, bootstrap, entrypoint, and build tests.

No GLF change is required.

### 3. Coarse import monitoring — **DONE**

Implemented: `ImportService.executeImport` now passes a stable `jobId: 'imp_' + configId` to `runImport`, and `Bootstrap.ts` constructs `ImportEngine` with the shared `deps.monitor` (commit `b568b68`). This surfaces GLF's own already-existing `registerJob/startJob/logStepStart/logStepComplete/updateProgress/completeJob/setError` lifecycle calls on the `GasProcessMonitorLib` dashboard, matching what `Menu.ts`'s `imp_*` sidebar already expected — no GLF change was needed for this step, as originally verified.

Verified chain:

menu import action
→ monitor sidebar for `imp_<configuration id>`
→ `src/application/services/ImportService.ts`
→ `GasDataImporter.ImportEngine.runImport()`
→ extractor / transformer / loader.

The UI expects a monitor job, but `ImportService` does not create or update one.

ALDO changes:

- Inject the existing monitor abstraction into `src/application/services/ImportService.ts`.
- Start the `imp_*` job before `runImport()`.
- Record complete/failure after the call.
- Wire the dependency in `src/config/Bootstrap.ts`.
- Update ImportService and bootstrap tests.

This gives honest lifecycle status, not row-level progress. No GLF change is required.

## Real findings needing GLF modification

### A. Publish a supported schema-validation surface — **still open**

Not part of the executed plan (`docs/superpowers/plans/2026-07-31-glf-reuse-fixes.md` scoped Tasks 1–8 to the items below and two unrelated extractions; schema validation was left out). The condition described below has not been re-verified since the original audit and may need a fresh check before scheduling.

Current state (as last verified):

- GLF contains `GasSchemaValidatorLib/src/SchemaValidator.js`.
- The runtime bundle exports schema-validation facilities.
- `DOCS_LIBS/GasSchemaValidatorLib.md` does not document a usable stable API.
- ALDO's ambient GLF declarations do not expose `SchemaValidator` or schema builders.

Required GLF change:

1. Define the supported public exports in `GasSchemaValidatorLib/index.js`.
2. Export either a stable schema builder surface or GLF-owned schema factories.
3. Add a helper such as `validateJsonString(schema, text, entityType)` so parse errors and schema errors have one typed result.
4. Add generated API documentation, TypeScript declarations, unit tests, and GAS V8 bundle tests.
5. Specify error shape, path reporting, unknown-key policy, and coercion policy.

Pervasiveness: **low inside GLF**; mainly library public surface, docs, declarations, and tests.
Feasibility: **high**. Runtime capability already exists.
Risk: **low**, provided existing exports remain backward-compatible.

Then validate ALDO configuration at the repository/infrastructure boundary, not by importing GLF into domain entities.

Impacted ALDO JSON paths:

- `src/domain/entities/ConfigurazioneDocumento.ts`
- `src/domain/entities/ConfigurazioneEmail.ts`
- `src/domain/entities/ConfigurazioneImport.ts`
- `src/application/pipelines/postProcessActions.ts`
- `src/application/pipelines/documentSteps.ts`
- `src/application/pipelines/logRegistration.ts`
- their repositories, `src/config/Bootstrap.ts`, ambient declarations, fakes, fixtures, and tests.

Preferred ALDO design:

repository raw row
→ new infrastructure configuration validator using GLF
→ validated domain configuration
→ application services.

For CDU validation, add an ALDO-owned schema because CDU semantics are SGSA-specific:

- `src/application/context-engine/ContextBuilder.ts` or a new boundary validator
- `src/application/context-engine/Cdu.ts`
- context factory/bootstrap wiring
- fixture, provider, integration, and online tests.

Run the complete CDU schema in tests/debug modes first. In production, validate recipe-required invariants unless profiling proves full validation is affordable.

### B. Add resumable, chunked execution to `GasDataImporter` — **DONE**

Implemented in `GasLibraryFactory` (commits `43dc488`, `683f071`, `b7d8ec8`) and consumed from ALDO (commits `567c934`, `8e1ee9e`). Scope was deliberately narrower than fully general, per the plan's own contained-change guidance: cursor-aware chunking (`ImportCheckpoint`, `SourceStrategy.extractChunk`/`supportsCursor`, `Loader.loadChunk`, `ImportEngine.startImport`/`runImportChunk`) is implemented for `SheetByIdStrategy` sources — the type ALDO's `FILE_SINGOLO` recipes use. Any other extract strategy (`FolderStrategy`, custom-registered strategies) runs through a compatibility path where the first chunk extracts everything at once (`exhausted: true` immediately), so `startImport`/`runImportChunk` work for every recipe, but only `SheetById` sources actually spread extraction across multiple chunks. `OVERWRITE`'s table purge is correctly gated to the first chunk only; `INSERT_ONLY`/`UPDATE_ONLY`/`UPSERT` are naturally idempotent across re-applied chunks. ALDO's chunked import launcher additionally enforces an `ATTIVO` gate on resume (commit `8e1ee9e`).

This also now drives granular `GasProcessMonitorLib` progress via the same monitor wiring as finding 3, rather than a separate ALDO-side row counter guessing importer state.

Current chain:

`src/application/services/ImportService.ts`
→ ALDO recipe mapper/custom source strategies
→ `GasDataImporter/src/ImportEngine.js`
→ `GasDataImporter/src/pipeline/ImportPipelineExecutor.js`
→ extract strategy
→ transformer
→ loader
→ SheetDB persistence.

`JobRunnerLib` cannot checkpoint inside the current monolithic `runImport()`. An outer generator only protects a batch containing multiple recipes; it cannot resume one large recipe.

Required GLF change:

1. Add an incremental API, for example `startImport()` plus `runImportChunk(checkpoint, budget)`.
2. Define a serializable checkpoint containing stage, source cursor/file cursor, row offset, load offset, counters, and recipe/version identity.
3. Make source strategies cursor-aware; preserve a compatibility adapter for existing all-at-once strategies.
4. Make transform/load chunks deterministic and idempotent.
5. Define commit boundaries and restart behavior for UPSERT, overwrite, and insert-only policies.
6. Emit progress callbacks/events from extraction, transformation, and loading.
7. Add cancellation, stale-checkpoint detection, docs, declarations, unit tests, integration tests, and GAS execution-resume tests.

Primary GLF impact:

- `GasDataImporter/src/ImportEngine.js`
- `GasDataImporter/src/pipeline/ImportPipelineExecutor.js`
- extractor/source-strategy contracts
- transformer and loader implementations
- public exports, docs, declarations, and tests
- optional adapter to `JobRunnerLib` and `GasProcessMonitorLib`.

Pervasiveness: **high inside GasDataImporter**, but should not require changes in unrelated GLF libraries.
Feasibility: **medium**. The design is straightforward; correctness across resume, conflict policies, and non-idempotent sources is the hard part.
Risk: **medium-high**. A bad checkpoint contract can duplicate or lose rows.

ALDO impact after GLF support:

- `src/application/services/ImportService.ts`
- `src/application/import/ImportRecipeMapper.ts`
- `src/application/import/CustomSourceStrategies.ts`
- `src/config/Bootstrap.ts`
- `src/index.ts`
- `src/entrypoints/EntryPoints.ts`
- possibly `src/presentation/Menu.ts`
- importer types, fakes, unit/integration/online tests.

This same extension should drive granular `GasProcessMonitorLib` progress. Do not build a separate ALDO row counter that guesses GLF importer state.

## Additional options

### Typed mail failure classification

If quota preflight is insufficient, extend `GoogleApiWrapper.MailService` to return or throw stable categories such as quota exhausted, transient service failure, invalid recipient, and permanent policy rejection. An optional `retryAfter`/next-safe-run field would let JobRunner schedule correctly.

Pervasiveness: **low-medium** in GoogleApiWrapper plus docs/declarations/tests. Feasibility: **medium-high**.
ALDO impact: `GmailServiceFacade`, email pipeline result types, `EmailBatchService`, `EmailRetryService`, and tests.

This is more precise than treating every send failure as a circuit-breaker failure.

### Import expression transformations

If future `CONF_IMP` records need calculated or normalization expressions, extend ALDO's import configuration type and `ImportRecipeMapper` to forward the fields already supported by GLF. No GLF change is needed. This is product scope, not current technical debt.
