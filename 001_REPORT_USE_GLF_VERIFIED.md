# Verified ALDO → GasLibraryFactory Reuse Audit

Date: 2026-07-29
Reviewed source: `000_REPORT_USE_GLF.md`
Scope: current ALDO application, unit/integration/build/online tests, the ALDO ambient GLF declarations, and the separate GasLibraryFactory graph and `DOCS_LIBS`.

## Executive verdict

The previous report contains 36 individual findings. Eight identify a real or partly real condition; 28 should be discarded as current refactoring findings.

Of the eight retained findings:

- Five have a useful GLF-as-is path: Gmail quota inspection, application-level circuit protection if still wanted, `JobRunnerLib` for email retries, coarse import monitoring, and optional external context recipes.
- Three need a GLF change for a clean or complete solution: supported schema-validation exports, genuinely resumable imports, and granular importer progress. Granular progress and resumability should be one GLF project, not two independent changes.
- Several discarded findings still suggest optional future features. They are listed separately so they are not confused with current defects.

The highest-value implementation order is:

1. Add quota-aware email batching with the existing `GoogleApiWrapper.MailService`.
2. Either expose email retry through `JobRunnerLib`, or remove the currently unreachable retry service.
3. Add coarse import monitoring immediately with the existing monitor facade.
4. Extend `GasDataImporter` only if one import recipe can exceed a GAS execution window.
5. Publish a supported `GasSchemaValidatorLib` API before adding configuration/CDU schemas.

No production ALDO call to a native GAS global was found in the combined graph. Current service access routes through GLF/facades. The online-test references are sanctioned test-framework use, not production bypasses.

## Verdict legend

- **KEEP — AS IS**: real condition; existing GLF behavior can implement the useful fix.
- **KEEP — GLF CHANGE**: real condition; a clean or complete fix needs a GLF extension.
- **PARTIAL / OPTIONAL**: observation is true, but it is not a current defect or the proposed solution is too broad.
- **DISCARD**: false positive, already implemented, wrong layer, unused capability, or no current execution path.

## Complete finding-by-finding classification

| ID | Previous finding | Verdict | Verified result |
|---|---|---|---|
| CU-1 | Replace custom regex with CoreUtils regex helpers | **DISCARD** | The named ALDO files do not contain the alleged runtime regex logic. |
| CU-2 | Replace manual deterministic hashes/cache keys | **DISCARD** | No manual hash/fingerprint implementation exists in the named paths. |
| CU-3 | Replace `Math.random()` IDs | **DISCARD** | No `Math.random()` use was found in ALDO source, tests, or online tests. |
| GR-1 | Add an application circuit breaker to email sending | **PARTIAL / AS IS** | The operational symptom is real: the batch can continue after repeated failures. A generic breaker is overbroad; quota preflight and error classification are preferable. GLF already has `CircuitBreaker`. |
| GR-2 | Wrap history/statistics providers with `executeWithBypass` | **DISCARD** | Blanket fallback would hide data/configuration failures. Use bypass only after a provider is explicitly declared optional and given an observability policy. |
| OT-1 | Add `ResourceCleaner` to stop online-test artifact leaks | **DISCARD** | Current online tests reuse named roots and idempotent artifact factories. No demonstrated leak exists. GLF has no current `ResourceCleaner`. |
| OT-2 | Replace online assertions with GLF `Assert` | **DISCARD** | GLF exposes `SmartAssert`, not the claimed `Assert`. Current test callbacks and `ValidationError` throws are valid; this is style-only. |
| GW-1 | Batch Drive deletions/moves | **DISCARD** | `DriveServiceFacade.deleteFile()` already delegates to GLF `deleteFiles([id], ...)`. The named production flows do not contain the alleged delete/move loops. |
| GW-2 | Replace manual list bullets with `appendListItem` | **DISCARD** | Production documents use template `bullet_list` processing. Online artifact creation already calls `DocumentBuilder.appendListItem`. |
| GW-3 | Check Gmail daily quota | **KEEP — AS IS** | Real. `EmailBatchService` uses a fixed chunk of 100 and does not inspect quota. GLF already exposes `MailService.getQuotaUsage()`; despite its name, the documented/implemented value is remaining daily quota. |
| SV-1 | Validate JSON configuration with `GasSchemaValidatorLib` | **KEEP — GLF CHANGE** | Real need, but the report named the wrong parsing locations. Runtime classes exist, while stable docs and ALDO ambient declarations do not. Publish the API before broad adoption. |
| SV-2 | Validate the complete CDU | **PARTIAL / GLF CHANGE** | Structural validation is useful in tests/debug boundaries. Full validation on every assembly is expensive and complex because CDU branches are conditional. It shares the SV-1 GLF publication change. |
| DB-1 | Replace nested-loop joins with SheetDB joins/indexes | **DISCARD** | The named repositories use maps/indexes and `SheetDbAdapter.indexedLookup/createIndex`. Graph complexity data did not show the alleged nested scans. |
| DB-2 | Add transactions to multi-step document/import flows | **DISCARD** | `SheetDbAdapter` delegates begin/commit/rollback to GLF; document generation already uses them. A single import recipe targets one table and is already delegated to `GasDataImporter`. |
| DB-3 | Add Unit of Work / deferred saves | **DISCARD** | ALDO repositories already inherit GLF `Repository`; document transactions and explicit email-log saves match the different failure semantics. Deferring email audit saves would increase data-loss risk. |
| EE-1 | Register custom expression operators for object variations/boxes | **DISCARD** | No current `VARIAZIONI_OGGETTO` flow or duplicated box-expression engine exists. Unused GLF extensibility is not a defect. |
| EE-2 | Precompile/cache expression ASTs in ALDO | **DISCARD** | GLF `ExpressionEngineService` already caches parsed expressions internally. |
| TE-1 | Move student/plan filtering into template filters | **DISCARD** | Those filters define domain/CDU semantics in providers. Moving them into presentation templates would be the wrong layer. |
| TE-2 | Adopt `dynamic_rows` | **DISCARD** | It is already used by the production generic sheet-template path and exercised by the conduct-sheet online scenario. |
| TE-3 | Adopt `dynamic_columns` | **DISCARD** | `SheetMaterieGeneratorStrategy` already builds column sources and delegates rendering/layout to GLF; online scenarios cover multiple groups. |
| JR-1 | Run imports with `JobRunnerLib` | **KEEP — GLF CHANGE** | Real timeout risk for a large single import. Wrapping only the outer call with JobRunner yields between recipes, not inside `ImportEngine.runImport`; true resumability needs importer checkpoints. |
| JR-2 | Run failed-email retries with `JobRunnerLib` | **KEEP — AS IS, LATENT** | `EmailRetryService.retryFailed()` is synchronous and has no active caller. If exposed, use JobRunner as is. If not part of the product, remove the dead service and registration. |
| PF-1 | Convert steps to Producer/Consumer for useful dry-run | **DISCARD** | Current GLF dry-run skips all steps; reclassification alone would not evaluate producer decisions. This needs a new selective dry-run contract, not an ALDO-only refactor. |
| PF-2 | Add pipeline telemetry hooks | **DISCARD** | Document and email pipelines already register `beforeStep`, `afterStep`, and error hooks. GLF also supports direct monitor/job options. |
| CE-1 | Externalize context recipes to JSON/configuration | **PARTIAL / AS IS** | Recipes are currently code-defined, so the observation is true. GLF can parse external recipes, but externalization is an optional product/configuration decision, not a defect. |
| CE-2 | Move role resolution into a context interceptor | **DISCARD** | Role resolution is already performed at the domain assembly boundary before view-model creation. A late interceptor would duplicate or mutate correct data. |
| DR-1 | Adopt GLF identity map / dirty tracking | **DISCARD** | ALDO entities extend GLF `Entity`, and all mapped repositories inherit GLF `Repository`. |
| DR-2 | Replace repository mapping with GLF `DataMapper` | **DISCARD** | GLF mapping/repository infrastructure is already the base. ALDO mapping code is schema/domain-specific configuration, not a parallel mapper framework. |
| DI-1 | Use expression transformations in import recipes | **DISCARD** | The named ALDO code does not implement a competing transform engine. Forwarding optional calculated/normalization fields is a future feature that GLF can already support. |
| DI-2 | Use importer UPSERT | **DISCARD** | ALDO already maps conflict policy to GLF UPSERT/overwrite/insert-only modes. |
| RR-1 | Use transitive delegation | **DISCARD** | `SupplenzaRepository` builds GLF delegations and calls `getDelegationChain`; the final delegate is already resolved transitively. |
| RR-2 | Use routing rules for recipient resolution | **DISCARD** | `RisolutoreRuoliService` already constructs GLF `Actor`/`RoutingResolver` policies; email recipient resolution follows the repository/service chain. |
| CC-1 | Replace manual email boxes with composable blocks | **DISCARD** | `createBoxComposer()` already registers block types/renderers and uses GLF `ContentComposer`. Local renderer functions are the expected extension point. |
| CC-2 | Add plain-text rendering for stored email logs | **DISCARD** | `LogEmailRepository` already uses GLF `HtmlSanitizer.stripToPlainText()` before saving `LOG_MAIL.TESTO`. |
| PM-1 | Add document/email step telemetry | **DISCARD** | Both pipelines already emit monitor start/complete/error events. |
| PM-2 | Add import progress monitoring | **KEEP — AS IS + GLF CHANGE** | Real mismatch: the menu opens monitor UI for `imp_*`, but `ImportService` never starts/updates that job. Coarse lifecycle monitoring works now; row-level resumable progress needs the JR-1 importer extension. |

## Real findings implementable with GLF as it exists

### 1. Quota-aware email batching; optional circuit protection

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

### 2. Failed-email retry through `JobRunnerLib`

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

### 3. Coarse import monitoring

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

### 4. External context recipes, only if product-configurability is wanted

Verified chain:

`src/application/context-engine/Recipe.ts` token lists
→ `src/application/context-engine/ContextBuilder.ts` mapping
→ GLF `ProviderRegistry` / `InterceptorRegistry`
→ GLF `ContextAssembler.assembleInto()` and `RecipeParser`.

GLF can consume declarative recipes now. ALDO would still need a source of truth, validation, versioning, and migration rules.

Likely ALDO impact:

- `src/application/context-engine/Recipe.ts`
- `src/application/context-engine/ContextBuilder.ts`
- the relevant `CONF_DOC` / `CONF_MAIL` entities and repositories, or a new schema-backed recipe table
- `src/config/Bootstrap.ts`
- context, configuration, repository, and online tests.

Recommendation: keep code-defined recipes unless non-developers must change provider composition. External JSON increases configuration failure surface without improving current execution.

## Real findings needing GLF modification

### A. Publish a supported schema-validation surface

Current state:

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

### B. Add resumable, chunked execution to `GasDataImporter`

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

### Selective pipeline dry-run

Only pursue this if operators need a decision preview. Extend GLF so producers may execute while consumers are simulated, with explicit side-effect classification and simulated outputs.

GLF impact: `PipelineFramework/src/Pipeline.js`, producer/consumer contracts, result/context model, docs, declarations, and tests.
Pervasiveness: **medium**. Feasibility: **medium**.
ALDO impact: most classes under `src/application/pipelines/`, both pipeline-building services, fakes, and tests.

This is not a fix for PF-1 as written; it is a new feature.

### Online-test resource ownership

If future tests create isolated disposable runs, GLF could gain a resource tracker with register/teardown semantics and ownership tags.

Pervasiveness: **medium in `GasOnlineTestFramework`**. Feasibility: **high**.
Current value: **low**, because ALDO's named-root factories are idempotent and no leak was demonstrated.

### Typed mail failure classification

If quota preflight is insufficient, extend `GoogleApiWrapper.MailService` to return or throw stable categories such as quota exhausted, transient service failure, invalid recipient, and permanent policy rejection. An optional `retryAfter`/next-safe-run field would let JobRunner schedule correctly.

Pervasiveness: **low-medium** in GoogleApiWrapper plus docs/declarations/tests. Feasibility: **medium-high**.
ALDO impact: `GmailServiceFacade`, email pipeline result types, `EmailBatchService`, `EmailRetryService`, and tests.

This is more precise than treating every send failure as a circuit-breaker failure.

### Import expression transformations

If future `CONF_IMP` records need calculated or normalization expressions, extend ALDO's import configuration type and `ImportRecipeMapper` to forward the fields already supported by GLF. No GLF change is needed. This is product scope, not current technical debt.

## Verified existing ALDO → GLF chains that invalidate major false positives

### Persistence and transactions

ALDO repository
→ GLF `DomainRepositoryLib.Repository` / entity mapping
→ `src/infrastructure/db/SheetDbAdapter.ts`
→ GLF SheetDB database/table services.

`DocumentGenerationService` already brackets multi-step document logging with begin/commit/rollback. Email logs save explicitly because an external email cannot be rolled back.

### Role resolution

CDU/cattedra resolution
→ `RisolutoreRuoliService` and repository queries
→ `SupplenzaRepository`
→ GLF `Delegation` / `InMemoryDelegationSource.getDelegationChain()`
→ final active delegate.

Recipient routing separately uses GLF `Actor` and `RoutingResolver`. Both alleged missing features are present.

### Templates and dynamic structures

document strategy
→ ALDO template facade
→ GLF WorkspaceTemplateEngine
→ `dynamic_rows` or `dynamic_columns` processor
→ returned layout metadata.

The subject-column strategy already consumes the GLF layout result. Online tests cover dynamic row and multiple dynamic column sources.

### Composable email content and plain logs

email pipeline
→ ALDO `createBoxComposer()`
→ GLF block/renderer registries and `ContentComposer`
→ HTML body
→ `LogEmailRepository`
→ GLF `HtmlSanitizer.stripToPlainText()`
→ `LOG_MAIL.TESTO`.

### Pipeline monitoring

document/email service
→ GLF `Pipeline`
→ ALDO before/after/error hooks
→ `ProcessMonitorFacade`
→ GLF `GasProcessMonitorLib`.

Import is the exception: the sidebar is launched, but the import service does not currently emit lifecycle or stage progress.

## Final recommendation

Do not execute the previous report as a refactoring backlog. Most entries would duplicate existing GLF use, move domain logic into the wrong layer, or add unused capability.

Open only these implementation tracks:

1. **ALDO-only, immediate:** quota-aware email batching.
2. **ALDO-only decision:** expose JobRunner-backed email retry or remove the dead retry service.
3. **ALDO-only, immediate:** coarse import monitor lifecycle.
4. **GLF extension, conditional:** resumable importer plus granular progress, only after measuring/confirming single-recipe timeout risk.
5. **GLF extension, recommended before validation work:** stable schema-validator exports/docs/declarations.
6. **Product decision:** external context recipes.

Everything else in the previous report should be closed as discarded or retained only as an explicitly optional future feature.
