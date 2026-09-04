# Ponytail Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply every verified dead-code/simplification finding from the 29 `AUDIT_PONYTAIL/*.md` reports (2026-09-01) across both the ALDO repo and the separate `GasLibraryFactory` (GLF) repo, without changing observable behavior.

**Architecture:** No architecture change. This is pure deletion/consolidation of already-dead or duplicated code, verified against the *current* working tree (not the audit's 2026-09-01 snapshot — several ALDO context-engine files had uncommitted edits in progress when this plan was written). Each task = one audit report = one independently reviewable, independently testable, independently committable unit.

**Tech Stack:** TypeScript/Jest/ts-jest (ALDO), JavaScript/Jest/Webpack/Babel (GasLibraryFactory).

**Spec:** `AUDIT_PONYTAIL/*.md` (29 files) + `AUDIT_PONYTAIL/AUDIT_PONYTAIL_SUMMARY_2026-09-01.md` (cross-report verification and the one known-invalid finding). This plan supersedes the audit's line numbers where drift was found during verification — always use the line numbers given in this plan's tasks, not the audit files.

## Verification note

Every finding below was independently re-verified against the current tree (grep + `codebase-memory-mcp` graph queries on `aldo-full-coverage` / `home-giulio-Desktop-ALDO-implementing` / `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`) before being turned into a task. Two audit reports had **zero** findings (`ALDO_APPLICATION_IMPORT_STORICO`, `ALDO_DOMAIN_REPOSITORIES_SPECIFICATIONS` — net 0 lines each) and are **not** included as tasks; there is nothing to implement in them. One finding (GLF ContextEngine #1, `CollectionProjector`/`ProjectionRegistry`/`CollectionProjectionInterceptor`, claimed −1,100 lines) is **excluded from every task** — production code in ALDO's email, role-resolution, context-engine, and document-strategy paths calls it; it is not dead. One finding (GLF PipelineFramework #2, `testing/mocks.js`) is **excluded** — `GasLibraryFactory/test/fakes/MockFactory.js` is built on top of it; deleting it breaks the monorepo's shared test fakes.

A handful of findings needed a correction to their *stated* scope (an extra interface declaration to remove, an extra call site to update, an ordering dependency between two findings in the same report, a follow-up test-contract entry). Those corrections are folded directly into the affected task below — follow this plan's steps, not the audit file's prose, when the two disagree.

## Global Constraints

- **Never edit `dist/*`** in either repo — always fix source.
- **GasLibraryFactory is a separate git repo** (`./GasLibraryFactory`, own history, own `package.json`). Tasks 12–27 commit *inside* that repo. ALDO tasks (1–11) commit at the ALDO repo root.
- **Vendor sync:** any GLF source change (Tasks 12–27) invalidates ALDO's `vendor/gaslibs.Code.js`. Every GLF task's closeout rebuilds and re-syncs it, then proves ALDO still typechecks/tests against the refreshed bundle, then commits the resulting `vendor/` change in the ALDO repo as its own commit.
- **GLF closeout** (run at the end of every GLF task, from `GasLibraryFactory/`): `npm test && npm run lint`, then from the ALDO repo root: `npm run refresh:vendor && npm run verify:vendor && npm run typecheck && npm test`.
- **ALDO closeout** (run at the end of every ALDO task, from the ALDO repo root): `npm run typecheck && npm run lint && npm test`.
- **GAS V8 target:** GLF and ALDO source must stay synchronous, no Node-only APIs. These tasks only delete/consolidate existing code, so this should never come up — flag it if a step seems to require otherwise.
- **Aside, out of scope for this plan:** `package.json:24` (`build:testing`) currently runs `--mode=online`, contradicting `CLAUDE.md`'s description of it as the `--mode=testing` default. Found during verification of Task 11; not part of any audit finding, not touched here.

---

## Task 1: ALDO Application Context Engine

**Source:** `AUDIT_PONYTAIL_ALDO_APPLICATION_CONTEXT_ENGINE_2026-09-01.md`

**Files:**
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts`
- Modify: `src/application/context-engine/providers/PartnerProjectionProvider.ts:78`
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts:91-99`
- Test: `test/unit/application/context-engine/providers/partner-projection-provider.test.ts`, `test/unit/application/context-engine/providers/consiglio-classe-provider.test.ts`

**Interfaces:** None — self-contained, no other task depends on this.

- [ ] **Step 1: Read both duplicated filters**

Read `PartnerProjectionProvider.ts` around line 74-80 (`titolariScope`) and `ConsiglioClasseProvider.ts` around line 91-99 (`partizioni`'s `scope` closure). Confirm both filter on `docente.tipoArticolazione === 'COMUNE' || docente.tipoArticolazione === <target>`, and that `ConsiglioClasseProvider`'s version additionally short-circuits to "no filter" when the target articulation is `null` (PartnerProjectionProvider's target is never null).

- [ ] **Step 2: Add the shared helper to `TeachingCouncilProjection.ts`**

Add an exported function next to the existing `buildConsiglioClasseVm` export:

```ts
export function scopeByArticolazione<T extends { tipoArticolazione: string | null }>(
  docenti: T[],
  tipo: string | null,
): T[] {
  if (tipo === null) return docenti;
  return docenti.filter((d) => d.tipoArticolazione === 'COMUNE' || d.tipoArticolazione === tipo);
}
```

Adjust the generic/parameter types to match the actual `DocenteCdcVM['tipoArticolazione']` type used in both call sites (read it off the existing local filters before finalizing the signature).

- [ ] **Step 3: Replace both local filters with calls to the helper**

In `PartnerProjectionProvider.ts:78`, replace the inline filter with `scopeByArticolazione(docenti, tipo)` (import `scopeByArticolazione` from `../TeachingCouncilProjection`).

In `ConsiglioClasseProvider.ts:91-99`, replace the inline `scope` closure with a call to `scopeByArticolazione(docenti, own)` (import likewise).

- [ ] **Step 4: Closeout**

Run the ALDO closeout (`npm run typecheck && npm run lint && npm test`). Expect PASS with no behavior change in either provider's existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/application/context-engine/TeachingCouncilProjection.ts src/application/context-engine/providers/PartnerProjectionProvider.ts src/application/context-engine/providers/ConsiglioClasseProvider.ts
git commit -m "refactor(context-engine): extract shared articulation-scope filter"
```

---

## Task 2: ALDO Application Services

**Source:** `AUDIT_PONYTAIL_ALDO_APPLICATION_SERVICES_2026-09-01.md`

**Files:**
- Modify: `src/application/services/DocumentBatchService.ts:167,197-259,340-397,447-499,544-596,644-695,717-763,777-822,839-894`
- Modify: `src/application/services/DocumentGenerationService.ts:156-209,218-257,264-306,334-380`
- Test: `test/unit/application/services/document-batch-service.test.ts`, `test/unit/application/services/document-generation-service.test.ts`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Extract the batch-job telemetry runner in `DocumentBatchService.ts`**

Read all 8 `generate*` methods (lines 197-259, 340-397, 447-499, 544-596, 644-695, 717-763, 777-822, 839-894) to confirm the identical 4-line open (`monitor?.registerJob` / `startJob` / `logBatchStart`) and matching close (`completeJob`) wrapping each method's distinct body. Add one private method that takes the per-call body as a callback and performs the shared open/close:

```ts
private async runBatchJob<T>(
  jobName: string,
  body: (jobId: string) => Promise<T>,
): Promise<T> {
  const jobId = this.monitor?.registerJob(jobName) ?? this.monitor?.startJob(jobName);
  this.monitor?.logBatchStart(jobName, jobId);
  try {
    return await body(jobId);
  } finally {
    this.monitor?.completeJob(jobId);
  }
}
```

Match the exact method names/signatures already used in this file (`registerJob`/`startJob`/`logBatchStart`/`completeJob`) rather than the illustrative ones above — read the current boilerplate block first and mirror it exactly, including argument order and any return value the close step reads off the job.

Replace each of the 8 methods' boilerplate with a call to `runBatchJob(name, async (jobId) => { ...existing distinct body... })`.

- [ ] **Step 2: Extract the transactional pipeline runner in `DocumentGenerationService.ts`**

Read `generateForClasseWithRecipe` (156-209), `generateForDipartimento` (218-257), `generateForDocente` (264-306), `generateForAlunnoWithRecipe` (334-380) to confirm the identical 18-line `beginTransaction → try/execute/catch{rollback;throw} → critical-flag check{rollback;throw} → commit → resultFromContext` block, differing only in the `contextBuilder.build(...)` call. Add one private method:

```ts
private async runTransactionalPipeline(
  row: /* match existing row type used across the 4 call sites */,
  config: /* match existing config type */,
  cdu: /* match existing CDU type */,
  jobId: string,
  startedAt: number,
): Promise<GenerationResult> {
  // body = the existing 18-line beginTransaction/execute/rollback/commit block,
  // moved here verbatim
}
```

Read the actual parameter/return types off the 4 existing call sites before finalizing the signature — don't invent new types. Replace each of the 4 methods' shared block with `return this.runTransactionalPipeline(row, config, cdu, jobId, startedAt);`, keeping each method's distinct `contextBuilder.build(...)` call before the shared call.

- [ ] **Step 3: Closeout**

Run the ALDO closeout. Expect PASS — both services' existing tests exercise the extracted paths already, no new test needed.

- [ ] **Step 4: Commit**

```bash
git add src/application/services/DocumentBatchService.ts src/application/services/DocumentGenerationService.ts
git commit -m "refactor(services): extract batch-job and transactional-pipeline boilerplate"
```

---

## Task 3: ALDO Strategies/Email/Pipelines

**Source:** `AUDIT_PONYTAIL_ALDO_APPLICATION_STRATEGIES_EMAIL_PIPELINES_2026-09-01.md`

**Files:**
- Modify: `src/application/pipelines/emailSteps.ts:23,469`
- Modify: `src/application/services/EmailNotificationService.ts:317`
- Test: `test/unit/application/pipelines/email-steps.test.ts:192,215,382,1196,1250,1277,1320,2503,2522,2591,2607`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Drop the dead `_logDocs` parameter**

In `src/application/pipelines/emailSteps.ts`, remove the `import` of `ILogDocumentoRepository` at line 23 if it becomes unused after this change (check for other uses in the file first), and remove the `_logDocs: ILogDocumentoRepository` constructor parameter of `ComposeEmailStep` at line 469. It is never assigned to `this` and never referenced elsewhere in the file.

- [ ] **Step 2: Update the production call site**

In `src/application/services/EmailNotificationService.ts:317`, change `new ComposeEmailStep(this.logger, d.templates, d.logDocs, d.drive)` to `new ComposeEmailStep(this.logger, d.templates, d.drive)`.

- [ ] **Step 3: Update all 9 test call sites**

In `test/unit/application/pipelines/email-steps.test.ts`, at lines 192, 215, 382, 1196, 1250, 1277, 1320, 2503, 2522, 2591, 2607, drop the (now removed) `logDocs`-equivalent argument from each `new ComposeEmailStep(...)` call so each matches the new 3-arg constructor.

- [ ] **Step 4: Closeout**

Run the ALDO closeout. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/pipelines/emailSteps.ts src/application/services/EmailNotificationService.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "refactor(email): drop unused ComposeEmailStep logDocs parameter"
```

---

## Task 4: ALDO Domain Entities & Value Objects

**Source:** `AUDIT_PONYTAIL_ALDO_DOMAIN_ENTITIES_VALUE_OBJECTS_2026-09-01.md`

**Files:**
- Delete: `src/domain/value-objects/DriveFileId.ts`, `test/unit/domain/drive-ids.test.ts`
- Modify: `src/domain/entities/AldoEntity.ts:1-14`
- Modify: `src/domain/value-objects/AnnoCorso.ts:14,26,29` + `test/unit/domain/anno-corso.test.ts`
- Modify: `src/domain/value-objects/PeriodoSupplenza.ts:42` + `test/unit/domain/supplenza-vos.test.ts`
- Modify: `src/domain/entities/Docente.ts:82` + its 3 test callers
- Modify: `src/domain/value-objects/AnnoScolastico.ts:32,37` + `test/unit/domain/anno-scolastico.test.ts`
- Modify: `src/domain/entities/Classe.ts:79` + its 7 test callers
- Modify: `src/domain/entities/ConfigurazioneDocumento.ts:107,130` + `test/unit/infrastructure/config-repositories.test.ts`
- Modify: `src/domain/value-objects/ValoreCarenza.ts:46` + its 2 test callers

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete `DriveFileId`**

`git rm src/domain/value-objects/DriveFileId.ts test/unit/domain/drive-ids.test.ts` — `DriveFileId`/`DriveFolderId` are imported from nowhere else. (If `DriveFolderId` lives in the same file and is still used elsewhere, keep the file and only remove the unused export + its dedicated test cases instead — re-check with `grep -rn "DriveFolderId" src/ test/` before deleting the whole file.)

- [ ] **Step 2: Shrink `AldoEntity.ts`'s docstring**

Replace the 14-line class docstring at lines 1-14 with a single-line comment stating the class's purpose. Do not touch the `validate() { return true; }` override below it.

- [ ] **Step 3: Delete dead `AnnoCorso` methods**

Remove `isSeconda` (line 14), `getAnnoSuccessivo` (line 26), `getAnnoPrecedente` (line 29) from `AnnoCorso.ts`. In `test/unit/domain/anno-corso.test.ts`, rewrite the tests that called these methods to instead construct expected values via `AnnoCorso.of(...)` directly, or delete those test cases if they added no coverage beyond what `AnnoCorso.of` already exercises.

- [ ] **Step 4: Delete dead `PeriodoSupplenza` methods**

Remove `durata`, `isAttiva`, `isTerminata` (from line 42) from `PeriodoSupplenza.ts`. Update `test/unit/domain/supplenza-vos.test.ts` the same way as Step 3.

- [ ] **Step 5: Delete `Docente.create`**

Remove the `create` static factory at `Docente.ts:82`. Update its 3 test callers to use the public constructor directly (`new Docente(...)`) — find them with `grep -rln "Docente.create" test/`.

- [ ] **Step 6: Delete dead `AnnoScolastico` methods**

Remove `getAnnoSuccessivo` (line 32), `getAnnoPrecedente` (line 37) from `AnnoScolastico.ts`. Update `test/unit/domain/anno-scolastico.test.ts` the same way as Step 3.

- [ ] **Step 7: Delete `Classe.create`**

Remove the `create` static factory at `Classe.ts:79`. Update its 7 test callers to use the public constructor directly — find them with `grep -rln "Classe.create" test/`.

- [ ] **Step 8: Delete dead `ConfigurazioneDocumento` predicates**

Remove `hasNoCondizione` (line 107) and `isOverwrite` (line 130) from `ConfigurazioneDocumento.ts`. Update `test/unit/infrastructure/config-repositories.test.ts`'s calls to these to inline the equivalent condition/field check instead.

- [ ] **Step 9: Delete dead `ValoreCarenza.isVoto`**

Remove `isVoto` (line 46) from `ValoreCarenza.ts`. Update its 2 test callers — find them with `grep -rln "\.isVoto(" test/`.

- [ ] **Step 10: Closeout**

Run the ALDO closeout. Expect PASS.

- [ ] **Step 11: Commit**

```bash
git add -A src/domain test/unit/domain test/unit/infrastructure/config-repositories.test.ts
git commit -m "refactor(domain): delete test-only entity/value-object methods"
```

---

## Task 5: ALDO Infrastructure DB Repositories

**Source:** `AUDIT_PONYTAIL_ALDO_INFRASTRUCTURE_DB_REPOSITORIES_2026-09-01.md`

**Files:**
- Modify: `src/infrastructure/repositories/ConfigurazioneEmailRepository.ts:34`
- Modify: `src/infrastructure/repositories/ClasseRepository.ts:181,185,322`
- Modify: `src/domain/repositories/IClasseRepository.ts:37-38`
- Test: `test/unit/infrastructure/classe-cattedre.test.ts`, `test/unit/infrastructure/classe-repository.test.ts`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete the test-only `getBoxes` delegate**

Remove the `getBoxes` method at `ConfigurazioneEmailRepository.ts:34`. Confirm first (already verified) it is not declared on `IConfigurazioneEmailRepository`.

- [ ] **Step 2: Delete `getDocentiIRC`/`getDocentiALT` — implementation AND interface**

The audit report claims these are absent from `IClasseRepository`; they are not — they're declared at `IClasseRepository.ts:37-38`. Remove both:
- The `getDocentiIRC`/`getDocentiALT` implementations at `ClasseRepository.ts:181,185`.
- Their declarations at `IClasseRepository.ts:37-38`.

Both have zero production callers (only `classe-cattedre.test.ts` and `classe-repository.test.ts`); delete the corresponding test cases too.

- [ ] **Step 3: Delete `getDocentiPerMateriaArticolata`**

Remove it from `ClasseRepository.ts:322`. Confirmed not declared on `IClasseRepository`; zero production callers (2 test files only) — delete the corresponding test cases.

- [ ] **Step 4: Closeout**

Run the ALDO closeout. Expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/repositories/ConfigurazioneEmailRepository.ts src/infrastructure/repositories/ClasseRepository.ts src/domain/repositories/IClasseRepository.ts test/unit/infrastructure/classe-cattedre.test.ts test/unit/infrastructure/classe-repository.test.ts
git commit -m "refactor(repositories): delete test-only ClasseRepository/ConfigurazioneEmailRepository methods"
```

---

## Task 6: ALDO Infrastructure Facades

**Source:** `AUDIT_PONYTAIL_ALDO_INFRASTRUCTURE_FACADES_2026-09-01.md`

**Files:**
- Modify: `src/infrastructure/facades/DocumentTableFacade.ts:12,63`
- Modify: `src/infrastructure/facades/IDriveFacade.ts` (interface) and `src/infrastructure/facades/DriveServiceFacade.ts:21`
- Modify: `src/onlinetests/checks/contextEngineChecks.ts:482,714`
- Test: `test/unit/infrastructure/document-table-facade.test.ts`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete `appendTable`**

Remove the `appendTable` interface member (`DocumentTableFacade.ts:12`) and implementation (`:63`). It's called only from its own unit test and one fake stub in `document-table-facade.test.ts`; `insertTableAtMarker` is the retained production path. Delete the corresponding test cases and the unused fake-stub property.

- [ ] **Step 2: Delete `setPermission`**

Remove `setPermission` from the `IDriveFacade` interface and from `DriveServiceFacade.ts:21`. It has zero real production callers. The only other hit is an inline fake `IDriveFacade` object literal in `src/onlinetests/checks/contextEngineChecks.ts:482,714` (`as unknown as IDriveFacade`) — drop the stray `setPermission` stub property from both fake object literals there too, since it will no longer type-check against the trimmed interface.

- [ ] **Step 3: Closeout**

Run the ALDO closeout. Expect PASS.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/facades/DocumentTableFacade.ts src/infrastructure/facades/IDriveFacade.ts src/infrastructure/facades/DriveServiceFacade.ts src/onlinetests/checks/contextEngineChecks.ts test/unit/infrastructure/document-table-facade.test.ts
git commit -m "refactor(facades): delete unused appendTable/setPermission"
```

---

## Task 7: ALDO Infrastructure Role/Services

**Source:** `AUDIT_PONYTAIL_ALDO_INFRASTRUCTURE_ROLE_SERVICES_2026-09-01.md`

**Files:**
- Modify: `src/infrastructure/role-resolution/RowScopeExpansion.ts:30-54,190-192`
- Modify: `src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts:16-18,71`
- Modify: `src/infrastructure/services/AlberoCartelle.ts:5-19`
- Test: `test/unit/infrastructure/albero-cartelle.test.ts`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Trim stale comments in `RowScopeExpansion.ts`**

Delete the ~25-line incident-history comment at lines 30-54 and the ~3-line duplicate wrapper-rationale comment at lines 190-192. Comment-only change — no code, wrapper functions, or GLF calls touched.

- [ ] **Step 2: Collapse `ResolutionConfiguration` to its one implementer**

`ResolutionConfiguration` (interface, `AldoTeachingResolutionConfig.ts:16-18`) has exactly one implementer, `ArticulatedResolutionConfiguration`. Delete the interface and change `create()`'s return type at line 71 to return `ArticulatedResolutionConfiguration` directly.

- [ ] **Step 3: Inline `CartellaResult` in `AlberoCartelle.ts`**

`CartellaResult` (lines 16-19, shape `{folderId, created}`) is structurally identical to `findOrCreate`'s two return statements. Delete the type and let TypeScript infer `findOrCreate`'s return type from its two `return {folderId, created}`-shaped statements (add an explicit inline return-type annotation only if inference produces a wider type than intended).

- [ ] **Step 4: Drop the singular `classe`/`utente` parameter forms**

`AlberoCartelle.ts:5-14`'s sole production caller (`src/application/pipelines/documentSteps.ts:295-301`) only ever supplies the canonical plural `classi`/`utenti` forms. Delete the singular `classe`/`utente` parameter overloads/branches. Update `test/unit/infrastructure/albero-cartelle.test.ts` to only exercise the plural forms, deleting test cases for the singular forms.

- [ ] **Step 5: Closeout**

Run the ALDO closeout. Expect PASS.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/role-resolution/RowScopeExpansion.ts src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts src/infrastructure/services/AlberoCartelle.ts test/unit/infrastructure/albero-cartelle.test.ts
git commit -m "refactor(infrastructure): trim stale comments, collapse single-implementer interface, drop unused AlberoCartelle overloads"
```

---

## Task 8: ALDO Config/Entrypoints/Presentation

**Source:** `AUDIT_PONYTAIL_ALDO_CONFIG_ENTRYPOINTS_PRESENTATION_2026-09-01.md`

**Files:**
- Modify: `src/entrypoints/EntryPoints_User.ts:22-393`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Confirm the 35 shortcut functions are redundant**

Read `EntryPoints_User.ts:22-393` (35 `function genera*/invia*/importa*Chunked` definitions) and `src/presentation/Menu.ts:57,67,77` plus `EntryPoints_Menu.ts`'s `menu_avvioGenerazioneDocumenti`/`menu_avvioComunicazioniEmail`/`menu_avvioImportazioni`. Confirm the menu functions already prompt for arbitrary `CONF_DOC`/`CONF_MAIL`/`CONF_IMP` IDs and call the same underlying `avviaGenerazioneDataDriven`/`avviaInvioNotificheDataDriven` that the 35 shortcuts call — i.e. the shortcuts are provably redundant, not a distinct code path.

- [ ] **Step 2: Delete the shortcut function bodies, keep the file as a stub**

Delete lines 22-393. Keep lines 1-20 (the file header + `declare function` lines) so the file still exists as the documented "add your own school-specific triggers here" extension point that `CLAUDE.md` describes (`src/entrypoints/EntryPoints.ts` calls into user-editable files as ambient globals). This is a judgment call, not a pure staleness fix — the file's own header calls these "user-editable examples"; deleting the example bodies while keeping the extension point intact preserves that documented capability without keeping ~372 lines of unused example code.

- [ ] **Step 3: Closeout**

Run the ALDO closeout, paying attention to any GAS-ambient-global lint/typecheck rule that might flag the now-mostly-empty file — if so, keep a one-line comment explaining the file's purpose to satisfy it.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/EntryPoints_User.ts
git commit -m "refactor(entrypoints): remove redundant EntryPoints_User shortcut functions"
```

---

## Task 9: ALDO Online Tests

**Source:** `AUDIT_PONYTAIL_ALDO_ONLINE_TESTS_2026-09-01.md`

**Files:**
- Modify: `src/onlinetests/index.ts:1078-1157,1361`
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts:354,1150-1235`
- Modify: `src/onlinetests/E2eActiveRepresentativesInterceptor.ts:14-27` and its import in `src/onlinetests/index.ts:16`

**Interfaces:** None — self-contained (online-tests-only webpack entry, not part of the main bundle).

- [ ] **Step 1: Dedupe the historical-check bootstrap in `index.ts`**

Read `executePersistedArticolazioneChecks` (1078-1117) and `executeITPeMateriePuntate` (1120-1157) — confirm the ~40-line `SharedTestDatabase` sample construction + interceptor registration is identical between them, differing only in the final `registerArticolazioneChecks`/`registerItpDottedChecks` call. Extract:

```ts
function executePersistedHistoricalChecks(
  register: (runner: TestRunner, container: ServiceContainer, sample: SharedTestDatabase) => void,
  overrides?: /* match whatever override param type the two originals already accept */,
) {
  // the shared ~40-line bootstrap, moved here verbatim
  register(runner, container, sample);
}
```

Match the real parameter types used by the two existing functions (read them first) rather than the placeholders above. Rewrite `executePersistedArticolazioneChecks` and `executeITPeMateriePuntate` to each call `executePersistedHistoricalChecks(registerArticolazioneChecks, ...)` / `executePersistedHistoricalChecks(registerItpDottedChecks, ...)`. Keep the exported launcher at line 1361 pointing at `executePersistedArticolazioneChecks` unchanged.

- [ ] **Step 2: Delete the capture/replay machinery in `e2eScenarioChecks.ts`**

Read `CapturedScenarioCheck` (1150), `captureExistingScenarioChecks` (1183), `replayNamedChecks` (1201), and the fake-`TestRunner` capture/replay plumbing (1150-1235), plus `registerE2eScenarioChecks(runner, container, sample)` (354). Give `registerE2eScenarioChecks` a 4th parameter, a `Set<string>` of selected check names, that gates its own `runner.add(...)` calls (only add a check if its name is in the set, or if the set is empty/undefined, add all — match whatever "run everything by default" behavior the capture/replay approach currently produces). Delete the capture/replay code (1150-1235) entirely; every check callback and group boundary it wrapped stays, just called directly through the gated `runner.add`.

- [ ] **Step 3: Replace `E2eActiveRepresentativesInterceptor` class with an object literal**

`E2eActiveRepresentativesInterceptor.ts:14-27`'s only external reference is the production import in `index.ts:16`. Replace the class + singleton export with:

```ts
export const e2eActiveRepresentativesInterceptor: LibContextInterceptor = {
  intercept(/* match the existing intercept(...) signature exactly */) {
    // existing intercept method body, moved here verbatim
  },
};
```

Update the import/usage at `index.ts:16` to use the new const name.

- [ ] **Step 4: Closeout**

Online-tests are a separate webpack entry built only with `--mode=online` and are not covered by `npm test`. Run `npm run typecheck` and `npm run lint` (both cover `src/onlinetests`), and `npm run build:online` to confirm the online-tests entry still compiles. Do not attempt to execute the online tests themselves (they require a live GAS deployment) — compilation success is this task's regression gate.

- [ ] **Step 5: Commit**

```bash
git add src/onlinetests/index.ts src/onlinetests/checks/e2eScenarioChecks.ts src/onlinetests/E2eActiveRepresentativesInterceptor.ts
git commit -m "refactor(onlinetests): dedupe historical-check bootstrap, drop scenario-check capture/replay, simplify interceptor"
```

---

## Task 10: ALDO Tests

**Source:** `AUDIT_PONYTAIL_ALDO_TESTS_2026-09-01.md`

**Files:**
- Create: `test/unit/onlinetests/recordingSpreadsheet.ts` (or similarly named shared helper)
- Modify: `test/unit/application/database-validation-service-full-db.test.ts:22,79-105`
- Modify: `test/unit/onlinetests/repository-checks.test.ts`, `test/unit/onlinetests/seeders.test.ts:97-126`, `test/unit/onlinetests/shared-test-database-builder-migration.test.ts:93,106-132`, `test/unit/onlinetests/e2e-sample-database-builder.test.ts`
- Modify (import from existing helper): `test/unit/onlinetests/testArtifactFactory.ts`

**Interfaces:** None — self-contained (test-only files).

- [ ] **Step 1: Extract the shared `RecordingSpreadsheet` fake**

Read all 5 local `class RecordingSpreadsheet implements ISampleSpreadsheet` declarations: `database-validation-service-full-db.test.ts:22`, `repository-checks.test.ts`, `seeders.test.ts`, `shared-test-database-builder-migration.test.ts`, `e2e-sample-database-builder.test.ts`. Move one shared implementation (recording rows/headers/batches, with the optional bound-master parameter some of the 5 use) into a new file, `test/unit/onlinetests/recordingSpreadsheet.ts`, exporting `class RecordingSpreadsheet implements ISampleSpreadsheet`. Import it in all 5 test files, deleting each file's local copy.

- [ ] **Step 2: Extract `recordingArtifacts` for the 2 exact clones (not `seeders.test.ts`)**

`database-validation-service-full-db.test.ts:66` and `shared-test-database-builder-migration.test.ts:93` have byte-identical `recordingArtifacts(): IArtifactFactory` two-method fakes. `test/unit/onlinetests/testArtifactFactory.ts` already exists as the place for shared artifact factories. Move the shared implementation there (export `recordingArtifacts` or a differently-named export if `testArtifactFactory.ts` already has a `recordingArtifacts` — check first), import it in both files, delete their local copies.

Leave `seeders.test.ts:126`'s `recordingArtifacts` alone — despite the shared name, it returns a different shape (`{artifacts, sheets}` for update tracking, not a bare `IArtifactFactory`) and is not a clone of the other two.

- [ ] **Step 3: Extract the shared `TEMPLATE_IDS` fixture**

`database-validation-service-full-db.test.ts:79-105`, `shared-test-database-builder-migration.test.ts:106-132`, and `seeders.test.ts:97-123` all declare a byte-identical `const TEMPLATE_IDS: E2eTemplateIds = {...}`. Move it into `test/unit/onlinetests/testArtifactFactory.ts` (or a new `test/unit/onlinetests/e2eTemplateIds.ts` if `testArtifactFactory.ts` isn't a natural fit — your call, keep it a one-file addition either way) as an exported `TEMPLATE_IDS` constant. Import it in all 3 files, deleting each local declaration. (Note: unlike Step 2, all 3 — including `seeders.test.ts` — get this fixture; the literals are identical here, not a partial/full split.)

- [ ] **Step 4: Closeout**

Run the ALDO closeout. Expect PASS with identical test behavior across all 5+3+3 touched test files.

- [ ] **Step 5: Commit**

```bash
git add test/unit/onlinetests test/unit/application/database-validation-service-full-db.test.ts
git commit -m "test: extract shared RecordingSpreadsheet, recordingArtifacts, TEMPLATE_IDS fixtures"
```

---

## Task 11: ALDO Tooling/Config

**Source:** `AUDIT_PONYTAIL_ALDO_TOOLING_CONFIG_2026-09-01.md`

**Files:**
- Modify: `scripts/build-and-prepare.cjs:677-683,689-756,788-795`
- Delete: `babel.config.cjs`
- Delete: `.clasp.json.bak-20260808-091355`, `.aldo-testonline.json.bak-20260808-091355`
- Modify: `package.json:24-27` (or current line numbers — re-check before editing)

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete the unused `source-map-index.json`/`test-file-map.json` generation step**

In `scripts/build-and-prepare.cjs`, delete step 8's body (lines 689-756, `step(8, TOTAL_STEPS, 'Generating source map index...')` and everything it does) — it builds `source-map-index.json` referencing a `Code.js.map` that the prelude-concat step never produces, and `test-file-map.json`; nothing in the tracked tree consumes either output file. Also delete the `source-map-index.json`/`test-file-map.json` lines from the `.claspignore` template written around lines 677-683. Do **not** touch step 10 (`gas-source-map.json`, line 904+) — that one is real and stays. Renumber subsequent `step(N, TOTAL_STEPS, ...)` calls and update `TOTAL_STEPS` if steps are numbered sequentially.

- [ ] **Step 2: Delete the always-vacuous `namesForbiddenInCodeJs` check**

Delete the comment block, the hardcoded-empty `const namesForbiddenInCodeJs = []` declaration, and the always-true `leakedIntoCodeJs` filter/if/else it feeds, at lines 782-795 (current numbering — re-read the file first since Step 1's edit shifts line numbers).

- [ ] **Step 3: Delete `babel.config.cjs`**

`git rm babel.config.cjs`. `webpack.config.cjs`'s `makeBabelRule` (lines 10-28) inlines the same Babel options directly into `babel-loader`'s options — it doesn't load this file. Jest uses `ts-jest` exclusively (no `babel-jest`/`babel-eslint` anywhere in the 4 jest configs). Confirmed zero consumers.

- [ ] **Step 4: Delete the tracked `.bak` files**

```bash
git rm .clasp.json.bak-20260808-091355 .aldo-testonline.json.bak-20260808-091355
```

- [ ] **Step 5: Delete the duplicate `build:online`/`push:online` npm scripts**

In `package.json`, delete the `build:online` and `push:online` script entries — re-read the file first to get current line numbers, since this plan's earlier line refs (24/27) may have shifted. Confirm before deleting that they are still byte-identical to `build:testing`/`push:testing` respectively (they were at verification time); if a legitimate difference has since been introduced, stop and flag it instead of deleting. **Do not** "fix" the separately-noted `build:testing` = `--mode=online` inconsistency mentioned in Global Constraints — that's out of scope for this audit-derived task.

- [ ] **Step 6: Closeout**

Run the ALDO closeout, plus `npm run build:testing` and `npm run build:online` (if not deleted — see Step 5's caution) to confirm the build script still runs end-to-end after the step-8 and dead-check deletions.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-and-prepare.cjs package.json
git rm babel.config.cjs .clasp.json.bak-20260808-091355 .aldo-testonline.json.bak-20260808-091355
git commit -m "chore: remove dead build-script steps, unused babel config, stale backup files, duplicate npm scripts"
```

---

## Task 12: GLF ComposableContentLib

**Source:** `AUDIT_PONYTAIL_GLF_COMPOSABLE_CONTENT_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/ComposableContentLib/src/BlockDefinition.js:55-56`
- Modify: `GasLibraryFactory/ComposableContentLib/src/ComposableContentError.js:77`
- Modify: `GasLibraryFactory/ComposableContentLib/src/CompositionResult.js:18,152-153`
- Test: corresponding `__tests__`/`.test.js` files for each of the above

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete unused `BlockDefinition` fields**

Remove `dataRequirements`/`metadata`/`predicates` (line 55) and `defaultVisibility`/`defaultOrder` (line 56) from `BlockDefinition.js` — confirmed self-referential only, no external consumer. Delete their dedicated test assertions.

- [ ] **Step 2: Delete `CompositionError`**

Remove the `CompositionError` class from `ComposableContentError.js:77` — confirmed exported but never thrown anywhere. Delete its dedicated test.

- [ ] **Step 3: Delete dead `CompositionResult` aliases**

Remove `blockResults` field, `getBlockResult` (152-153, a wrapper around `getBlockById`), and `format` (an alias of `outputFormat`) from `CompositionResult.js:18`. Delete their dedicated tests; keep `getBlockById`/`outputFormat`.

- [ ] **Step 4: GLF closeout**

Run the GLF closeout (see Global Constraints).

- [ ] **Step 5: Commit**

```bash
cd GasLibraryFactory
git add ComposableContentLib
git commit -m "refactor(ComposableContentLib): delete unused fields/aliases"
cd ..
git add vendor
git commit -m "chore: refresh vendor after ComposableContentLib cleanup"
```

---

## Task 13: GLF ContextEngine

**Source:** `AUDIT_PONYTAIL_GLF_CONTEXT_ENGINE_2026-09-01.md` — run in `GasLibraryFactory/`.

**Excluded finding:** #1 (`CollectionProjector.js`, claimed −1,100 lines) — production inbound use confirmed from ALDO email/role-resolution/context-engine/document-strategy paths. **Do not delete.**

**Files:**
- Modify: `GasLibraryFactory/ContextEngine/index.js:1` (604 lines)
- Modify: `GasLibraryFactory/ContextEngine/src/ProviderRegistry.test.js`
- Modify: `GasLibraryFactory/ContextEngine/src/ContextStepExecutor.js:192`
- Modify: `GasLibraryFactory/ContextEngine/src/ContextAssembler.js:226` and its test `ContextAssembler.test.js:189,193,197`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Shrink `index.js`'s duplicate tutorial prose**

Delete the tutorial-prose portion of `index.js` (~570 of its 604 lines) that duplicates the README, keeping the 19-export barrel intact.

- [ ] **Step 2: Delete duplicated `ProviderRegistry.test.js` cases**

Remove the ~300 lines of test cases in `ProviderRegistry.test.js` that duplicate coverage already present elsewhere in the suite (read the file to identify which specific `it()`/`describe()` blocks are the duplicates before deleting — the audit doesn't name them individually, so confirm duplication by diffing assertions against the rest of the ContextEngine test suite first).

- [ ] **Step 3: Delete `ContextStepExecutor.assembleAsync`**

Remove `assembleAsync` at `ContextStepExecutor.js:192` — confirmed zero external callers (only a self-reference and a string binding in `ContextAssembler.js:199`, which is not a call). Remove the `ContextAssembler.js:199` string binding too if it becomes dead as a result.

- [ ] **Step 4: Delete the dead public getters on `ContextAssembler`**

Remove the `dependencyResolver`/`recipeParser`/`postProcessor` getters at `ContextAssembler.js:226` — their only callers are `ContextAssembler.test.js:189,193,197`. **Keep the underlying private underscore fields** (`_recipeParser` etc.) — internal collaborators (`ContextStepExecutor`, `ContextDependencyAnalyzer`) access those directly, not through the getters. Update `ContextAssembler.test.js:189,193,197` to assert against the private fields directly (or delete those specific assertions if the private fields aren't meant to be test-visible — match whatever convention the rest of that test file uses for asserting on internal state).

- [ ] **Step 5: GLF closeout**

Run the GLF closeout.

- [ ] **Step 6: Commit**

```bash
cd GasLibraryFactory
git add ContextEngine
git commit -m "refactor(ContextEngine): shrink index.js, dedupe ProviderRegistry tests, delete dead assembleAsync and getters"
cd ..
git add vendor
git commit -m "chore: refresh vendor after ContextEngine cleanup"
```

---

## Task 14: GLF CoreUtilsLib

**Source:** `AUDIT_PONYTAIL_GLF_CORE_UTILS_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/CoreUtilsLib/src/SystemUtils.js:35`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/TypeGuards.js:199,444` and `GasLibraryFactory/CoreUtilsLib/index.js:175-176`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/UtilsService.js:14`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete unexported `SystemUtils`**

Remove the `SystemUtils` class (`SystemUtils.js:35`) — confirmed not exported from `CoreUtilsLib/index.js` at all. Delete the file if `SystemUtils` was its only export; otherwise delete just the class and its dedicated tests.

- [ ] **Step 2: Delete dead `TypeGuards` predicates**

Remove `isTruthy`/`isFalsy` (`TypeGuards.js:444`) and their exports at `index.js:175-176` — zero real importers. Remove `isValidObject` (`TypeGuards.js:199`) — zero callers outside its own file; `isObject` (line 184/469) is the identical predicate, keep that one. Delete their dedicated tests.

- [ ] **Step 3: Delete dead `MILLIS_PER_*` statics**

Remove the `MILLIS_PER_*` static constants (`UtilsService.js:14`) — zero callers; `TimeConstants` (`index.js:330`) is the documented public replacement. Delete their dedicated tests.

- [ ] **Step 4: GLF closeout**

Run the GLF closeout.

- [ ] **Step 5: Commit**

```bash
cd GasLibraryFactory
git add CoreUtilsLib
git commit -m "refactor(CoreUtilsLib): delete unexported/dead utility surfaces"
cd ..
git add vendor
git commit -m "chore: refresh vendor after CoreUtilsLib cleanup"
```

---

## Task 15: GLF DomainRepositoryLib

**Source:** `AUDIT_PONYTAIL_GLF_DOMAIN_REPOSITORY_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/DomainRepositoryLib/src/SpecificationBuilder.js:7`
- Modify: `GasLibraryFactory/DomainRepositoryLib/src/ExpressionSpecification.js:10`
- Delete: `GasLibraryFactory/DomainRepositoryLib/Tests.gs`
- Modify: `GasLibraryFactory/DomainRepositoryLib/README.md:148`
- Modify: `GasLibraryFactory/DomainRepositoryLib/src/Entity.js:211,220,227` and `README.md:45,89`
- Modify: `GasLibraryFactory/DomainRepositoryLib/src/EntityMapper.js:55`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete unused `SpecificationBuilder`**

Remove the class/module at `SpecificationBuilder.js:7` — zero callers in GLF or ALDO. Delete the file and its dedicated tests if it has no other exports; otherwise delete just this export.

- [ ] **Step 2: Delete unused `ExpressionSpecification`**

Remove it from `ExpressionSpecification.js:10` — zero callers in GLF or ALDO. Same file/export judgment as Step 1.

- [ ] **Step 3: Delete stale `Tests.gs`**

`git rm GasLibraryFactory/DomainRepositoryLib/Tests.gs` — confirmed stale placeholder pointing at a reorganized Jest suite.

- [ ] **Step 4: Trim stale `README.md` content**

Edit `README.md:148` per the audit's description of the stale section (re-read both the audit finding and the current README before editing, since this wasn't independently re-diffed during verification — confirm the section still exists and is still stale before deleting).

- [ ] **Step 5: Delete the dead `_domainEvents` buffer**

Remove the `_domainEvents` buffer and its `push`/`get`/`clear` methods (`Entity.js` lines 211/220/227) — confirmed zero dispatcher/flush consumer. Delete the corresponding example in `README.md:45,89`.

- [ ] **Step 6: Delete unused `getMappingConfiguration`**

Remove it from `EntityMapper.js:55` (line drifted from the audit's cited 51 — use 55) — zero callers found.

- [ ] **Step 7: GLF closeout**

Run the GLF closeout.

- [ ] **Step 8: Commit**

```bash
cd GasLibraryFactory
git add DomainRepositoryLib
git rm DomainRepositoryLib/Tests.gs
git commit -m "refactor(DomainRepositoryLib): delete unused specification/entity-event surfaces and stale docs"
cd ..
git add vendor
git commit -m "chore: refresh vendor after DomainRepositoryLib cleanup"
```

---

## Task 16: GLF GasDataImporter

**Source:** `AUDIT_PONYTAIL_GLF_GAS_DATA_IMPORTER_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/GasDataImporter/index.js:1`
- Delete: `GasLibraryFactory/GasDataImporter/Tests.gs`
- Modify: `GasLibraryFactory/GasDataImporter/src/pipeline/Transformer.js:17`
- Modify: `GasLibraryFactory/GasDataImporter/src/ImportEngine.js:55`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Shrink `index.js`**

Delete the ~473 lines of duplicate manual prose from the 503-line `index.js`, keeping only the exports.

- [ ] **Step 2: Delete `Tests.gs`**

`git rm GasLibraryFactory/GasDataImporter/Tests.gs` — confirmed 433 lines, zero references anywhere (`__testOnline__/GasDataImporterTests.gs` is a distinct, real file — leave that one alone).

- [ ] **Step 3: Fold `Transformer.js`'s single-owner collaborators**

`Transformer.js:17`'s constructor instantiates 4 manager collaborators wired via `Delegation.delegateMethods`. Fold them into private methods on `Transformer` directly, keep the public API, delete the delegation-map plumbing.

- [ ] **Step 4: Fold `ImportEngine.js`'s facade-only collaborators**

`ImportStrategyRegistry`/`ImportRecipeValidator` at `ImportEngine.js:55` are facade-only, wired via delegation arrays. Fold into `ImportEngine` directly, keep the public API, delete the delegation plumbing.

- [ ] **Step 5: GLF closeout**

Run the GLF closeout.

- [ ] **Step 6: Commit**

```bash
cd GasLibraryFactory
git add GasDataImporter
git rm GasDataImporter/Tests.gs
git commit -m "refactor(GasDataImporter): shrink index.js, delete stale Tests.gs, fold single-owner collaborators"
cd ..
git add vendor
git commit -m "chore: refresh vendor after GasDataImporter cleanup"
```

---

## Task 17: GLF GasExpressionEngineLib

**Source:** `AUDIT_PONYTAIL_GLF_GAS_EXPRESSION_ENGINE_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/GasExpressionEngineLib/src/ExpressionEvaluatorService.js:62`
- Modify: `GasLibraryFactory/GasExpressionEngineLib/src/handlers/ErrorHelper.js:1` and `GasLibraryFactory/GasExpressionEngineLib/index.js`
- Modify: `GasLibraryFactory/test/offline/exports-validation.test.js:170`
- Modify: `GasLibraryFactory/GasExpressionEngineLib/src/ExpressionParserService.js:9`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Fold `ExpressionEvaluatorService`'s single-owner collaborators**

`AstNodeEvaluator`, `EvaluationContextHandler`, `OperatorHandler` (`ExpressionEvaluatorService.js:62`) are private, delegated via pass-through methods. Fold into `ExpressionEvaluatorService` directly, keep the public API, delete the pass-through methods.

- [ ] **Step 2: Delete `ErrorHelper` — and its export-contract test entry**

Remove `ErrorHelper` (`handlers/ErrorHelper.js:1`) and its re-export in `index.js` — confirmed zero production callers (only self, own test, and the re-export). **Also** remove the `'ErrorHelper'` entry from the expected-exports array at `GasLibraryFactory/test/offline/exports-validation.test.js:170`, or that offline export-contract test will fail after the export is gone.

- [ ] **Step 3: Fold `ExpressionParserService`'s single-owner collaborators**

`TokenScanner`/`AstBuilder` (`ExpressionParserService.js:9`) are imported and used as one-caller wrappers. Fold into `ExpressionParserService` directly, delete the wrapper indirection.

- [ ] **Step 4: GLF closeout**

Run the GLF closeout — this task's closeout must include the offline export-validation suite: `npm test` already runs it if it's under the default Jest config; if it's a separate config, also run `npx jest --config <its config> test/offline/exports-validation.test.js`.

- [ ] **Step 5: Commit**

```bash
cd GasLibraryFactory
git add GasExpressionEngineLib test/offline/exports-validation.test.js
git commit -m "refactor(GasExpressionEngineLib): fold single-owner collaborators, delete unused ErrorHelper"
cd ..
git add vendor
git commit -m "chore: refresh vendor after GasExpressionEngineLib cleanup"
```

---

## Task 18: GLF GasOnlineTestFramework

**Source:** `AUDIT_PONYTAIL_GLF_GAS_ONLINE_TEST_FRAMEWORK_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/GasOnlineTestFramework/README.md:8`
- Modify: `GasLibraryFactory/GasOnlineTestFramework/src/EnhancedTestRunner.js:13,23,47`
- Modify: `GasLibraryFactory/GasOnlineTestFramework/src/TestContext.js:17`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Shrink `README.md`**

Delete the duplicate/stale portion of the 783-line `README.md` per the audit's description (re-read the finding and file together to identify the exact stale section before deleting).

- [ ] **Step 2: Delete unused `addHook`**

Remove `addHook` (defined at `EnhancedTestRunner.js:47`, referenced at line 13) — confirmed zero callers repo-wide (GLF or ALDO) beyond its own definition.

- [ ] **Step 3: Verify, then delete, `TestContext.apiCallCount`/`_trackApiCall`**

This finding (`TestContext.js:17`) was **not independently re-verified** during the audit-verification pass — before deleting, run `grep -rn "apiCallCount\|_trackApiCall" GasLibraryFactory/ "src/"` (from the ALDO root, to also catch ALDO callers) to confirm it's genuinely instrumentation-only with a single test caller as claimed. If confirmed, delete both. If a real caller turns up, stop and treat this as a STALE finding — do not delete, and note it in the commit message as skipped.

- [ ] **Step 4: Verify, then delete, `EnhancedTestRunner`'s inert `timeout` option**

Also not independently re-verified. Before deleting, grep `timeout` in `EnhancedTestRunner.js` and `TestContext.js` (`EnhancedTestRunner.js:23`) to confirm the value is stored but never read (no actual timeout enforcement uses it). If confirmed, delete the option and its storage. If it turns out to be read somewhere, stop and treat this as STALE — do not delete, note it as skipped.

- [ ] **Step 5: GLF closeout**

Run the GLF closeout.

- [ ] **Step 6: Commit**

```bash
cd GasLibraryFactory
git add GasOnlineTestFramework
git commit -m "refactor(GasOnlineTestFramework): shrink README, delete unused addHook and (if confirmed) dead instrumentation/timeout option"
cd ..
git add vendor
git commit -m "chore: refresh vendor after GasOnlineTestFramework cleanup"
```

---

## Task 19: GLF GasProcessMonitorLib

**Source:** `AUDIT_PONYTAIL_GLF_GAS_PROCESS_MONITOR_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Ordering constraint:** findings #1 and #4 must be applied together in the same commit — `loose-coupling.test.js` (deleted by #1) also calls `getConfigSummary()` (deleted by #4); applying #4 alone first breaks a test that's about to be deleted anyway, but applying them out of order within this task risks a broken intermediate state if interrupted. Do both in Step 1/Step 2 below before the closeout.

**Files:**
- Delete: `GasLibraryFactory/GasProcessMonitorLib/loose-coupling.test.js`
- Modify: `GasLibraryFactory/GasProcessMonitorLib/src/ProcessMonitorService.js:534`
- Modify: `GasLibraryFactory/GasProcessMonitorLib/src/DashboardUi.js:537`
- Modify: `GasLibraryFactory/GasProcessMonitorLib/index.js:7`
- Modify: `GasLibraryFactory/GasProcessMonitorLib/src/DashboardUi.test.js:95`
- Modify: `GasLibraryFactory/GasProcessMonitorLib/testing/mocks.js:11-14`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete `loose-coupling.test.js`**

`git rm GasLibraryFactory/GasProcessMonitorLib/loose-coupling.test.js` — 298 lines, confirmed to test `PipelineFramework`/optional-chaining behavior, not a `GasProcessMonitorLib` contract.

- [ ] **Step 2: Delete `getConfigSummary()`**

Remove `getConfigSummary()` from `ProcessMonitorService.js:534` and `DashboardUi.js:537` — confirmed zero non-test callers once `loose-coupling.test.js` (Step 1) is gone.

- [ ] **Step 3: Shrink `index.js`**

Delete the ~104 lines of duplicate API-guide content from the 117-line `index.js`, keeping the 3 export lines (115-117).

- [ ] **Step 4: Delete duplicated `DashboardUi.test.js` cases**

In the `'generated HTML content'` describe block starting at line 95, delete the 11 substring-only tests (DOCTYPE, status container, progress bar, steps list, error container, timing container, CSS styles, polling JS, XSS prevention, duration formatting, stop-polling) — confirmed these only assert substring presence, adding no behavioral coverage beyond what other tests in the file already cover. Re-read the file first to confirm this is still an accurate description of what's being deleted.

- [ ] **Step 5: Delete `ProcessMonitorServiceMock`'s extra surface**

`testing/mocks.js:11-14`'s `ProcessMonitorServiceMock` exposes 8 methods (`logJobStart`/`logJobComplete`/`logJobError`/`logStepStart`/`logStepComplete`/`logJobStatus`/`logStepError`/`logStepSkipped`) with no matching public method on the real `ProcessMonitorService`. Delete the ones that don't correspond to a real public method (re-check against the real class after Steps 2-3's deletions, since `getConfigSummary` is now also gone from the real class if the mock exposed it too).

- [ ] **Step 6: GLF closeout**

Run the GLF closeout.

- [ ] **Step 7: Commit**

```bash
cd GasLibraryFactory
git add GasProcessMonitorLib
git rm GasProcessMonitorLib/loose-coupling.test.js
git commit -m "refactor(GasProcessMonitorLib): delete misplaced test, dead getConfigSummary, duplicate index/test content, and mock-only surface"
cd ..
git add vendor
git commit -m "chore: refresh vendor after GasProcessMonitorLib cleanup"
```

---

## Task 20: GLF GasResilienceLib

**Source:** `AUDIT_PONYTAIL_GLF_GAS_RESILIENCE_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/GasResilienceLib/index.js:1`
- Modify: `GasLibraryFactory/GasResilienceLib/src/handlers/ErrorClassifier.js:30`
- Modify: `GasLibraryFactory/GasResilienceLib/src/handlers/ErrorReporter.js:7-9,47-48`
- Modify: `GasLibraryFactory/GasResilienceLib/src/ExceptionService.js:9-11,112-113`
- Modify: `GasLibraryFactory/GasResilienceLib/src/handlers/__tests__/RecoveryManager.test.js:505`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Shrink `index.js`**

Delete the embedded manual content from the 170-line `index.js` that duplicates the README, keeping the exports.

- [ ] **Step 2: Delete the hardcoded fallback branch in `ErrorClassifier.js`**

`ErrorClassifier.js:30` has a `config.getErrorPatterns()` branch plus a hardcoded-literal fallback branch. `ResilienceConfiguration.getErrorPatterns()` (`Configuration.js:126`) is the single source of truth — delete the hardcoded fallback branch, keep only the `config.getErrorPatterns()` path (adjust callers/tests that relied on the fallback triggering without a config to now always pass one, if any exist).

- [ ] **Step 3: Fold `ErrorReporter`'s single-owner collaborators**

`ErrorReporterRecorder`/`ErrorReporterStatistics` (imported `ErrorReporter.js:7-9`, instantiated `:47-48`) have zero other consumers. Fold into `ErrorReporter` directly.

- [ ] **Step 4: Fold `ExceptionService`'s single-owner collaborators**

`ResilienceExecutionHandler`/`ResilienceStatsTracker` (imported `ExceptionService.js:10-11`, instantiated `:112-113`) have zero other consumers. Fold into `ExceptionService` directly.

- [ ] **Step 5: Trim repetitive invalid-input test cases**

In `RecoveryManager.test.js:505`, delete the repetitive invalid-input `it()` blocks, keeping representative coverage (one or two cases per invalid-input category rather than the full enumerated matrix).

- [ ] **Step 6: Delete the dead `UtilsService` import in `ExceptionService.js`**

Remove the `UtilsService` import at `ExceptionService.js:9` — confirmed never referenced as `UtilsService.` anywhere in the file (the constructor's own `utils` parameter is unrelated).

- [ ] **Step 7: GLF closeout**

Run the GLF closeout.

- [ ] **Step 8: Commit**

```bash
cd GasLibraryFactory
git add GasResilienceLib
git commit -m "refactor(GasResilienceLib): shrink index.js, delete hardcoded fallback, fold single-owner collaborators, trim repetitive tests, drop dead import"
cd ..
git add vendor
git commit -m "chore: refresh vendor after GasResilienceLib cleanup"
```

---

## Task 21: GLF GasSchemaValidatorLib

**Source:** `AUDIT_PONYTAIL_GLF_GAS_SCHEMA_VALIDATOR_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/GasSchemaValidatorLib/src/SchemaValidator.js:6`
- Modify: `GasLibraryFactory/GasSchemaValidatorLib/index.js:6`
- Delete: `GasLibraryFactory/GasSchemaValidatorLib/src/testing/mocks.js` (already empty)
- Modify: `GasLibraryFactory/GasSchemaValidatorLib/__testOnline__/SchemaValidatorTests.gs:26`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Confirm the `WeakMap` cache has no control/metrics API to worry about**

Read `SchemaValidator.js:6` — this finding is about the *lack* of a cache-control/metrics API (nothing to add), not a deletion. Skip if the audit's actual action item is "no change needed" — re-read the original finding text in `AUDIT_PONYTAIL_GLF_GAS_SCHEMA_VALIDATOR_LIB_2026-09-01.md` to confirm what concrete edit (if any) it calls for before touching this file.

- [ ] **Step 2: Delete the empty `testing/mocks.js`**

`git rm GasLibraryFactory/GasSchemaValidatorLib/src/testing/mocks.js` — confirmed empty (contains only a comment noting unused doubles were already removed) and its `index.js:6` export/import reference, zero consumers repo-wide.

- [ ] **Step 3: Delete the meaningless cache-benchmark online test**

Remove the "WeakMap cache benchmark" test in `__testOnline__/SchemaValidatorTests.gs:26` — confirmed it only asserts `elapsed < 5000` with no behavioral check.

- [ ] **Step 4: GLF closeout**

Run the GLF closeout.

- [ ] **Step 5: Commit**

```bash
cd GasLibraryFactory
git add GasSchemaValidatorLib
git rm GasSchemaValidatorLib/src/testing/mocks.js
git commit -m "refactor(GasSchemaValidatorLib): delete empty mocks module and meaningless benchmark test"
cd ..
git add vendor
git commit -m "chore: refresh vendor after GasSchemaValidatorLib cleanup"
```

---

## Task 22: GLF GoogleApiWrapper

**Source:** `AUDIT_PONYTAIL_GLF_GOOGLE_API_WRAPPER_2026-09-01.md` — run in `GasLibraryFactory/`.

**Deferred, not a task here:** the audit's finding about `index.js:174`'s deprecated re-export says to remove it "at the next major version" — that half is explicitly future work, not implemented now. Only the actionable half (Step 4 below) is in scope.

**Files:**
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/CacheService.js:131`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/GoogleService.js:147`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/PropertiesService.js:256,390,516,633`
- Modify: `GasLibraryFactory/GoogleApiWrapper/index.js:7`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/PermissionService.js:102`
- Modify: `GasLibraryFactory/test/__tests__/integration/FullStack_DomainToAPI.test.js:14`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete the unused cache key-tracking machinery**

Remove `_trackedKeys`, `enableKeyTracking()`, `trackKey()`, `removeByPrefix()` (`CacheService.js:131`) and `GoogleService._invalidateCacheByPrefix()` (`GoogleService.js:147`) — confirmed zero production callers repo-wide (GLF + ALDO); only referenced in `__tests__` and a mock's stub in `CoreUtilsLib/src/testing/mocks.js` (not a caller). Keep direct-key `remove()`/`_invalidateCache()`. Delete the dedicated tests; if `CoreUtilsLib/src/testing/mocks.js`'s `removeByPrefix` stub becomes unreferenced by any real consumer as a result, leave it — that's out of this task's scope (it's a different library's file).

- [ ] **Step 2: Shrink `PropertiesService.js`'s inline tutorial docs**

Delete the inline "## Behavior" tutorial-style JSDoc blocks at lines 256, 390, 516 — `DOCS_LIBS/GoogleApiWrapper.md` is the canonical doc. Keep concise per-method JSDoc (params/returns), just drop the prose tutorial sections.

- [ ] **Step 3: Shrink `index.js`'s header**

`index.js:7`'s header carries a long module description duplicating the README/docs. Shrink to exports + a short one-paragraph summary.

- [ ] **Step 4: Delete `shareFilesWithUsers` and `getScriptPropertyJSON`**

Remove `shareFilesWithUsers` (`PermissionService.js:102`) and `getScriptPropertyJSON` (`PropertiesService.js:633`) — both are confirmed alias-only with zero source callers (grepped across GLF + outer ALDO src; only hits were in the *built* `vendor/gaslibs.Code.js` bundle, which will regenerate on the next `refresh:vendor`).

- [ ] **Step 5: Fix the one real consumer of the deprecated re-export, without removing the re-export itself**

`GasLibraryFactory/test/__tests__/integration/FullStack_DomainToAPI.test.js:14` is the sole in-tree import (`import { SpreadsheetService, LoggerService, UtilsService } from '@GoogleApiWrapper'`) still relying on the `index.js:174` deprecated re-export for `LoggerService`/`UtilsService`. Split that import: keep `SpreadsheetService` from `@GoogleApiWrapper`, import `LoggerService, UtilsService` from `@CoreUtilsLib` instead. **Leave the deprecated re-export in `index.js:174` in place** — its removal is deferred to an actual major-version bump, not part of this task.

- [ ] **Step 6: GLF closeout**

Run the GLF closeout.

- [ ] **Step 7: Commit**

```bash
cd GasLibraryFactory
git add GoogleApiWrapper test/__tests__/integration/FullStack_DomainToAPI.test.js
git commit -m "refactor(GoogleApiWrapper): delete dead key-tracking/alias methods, shrink docs, fix last deprecated-reexport consumer"
cd ..
git add vendor
git commit -m "chore: refresh vendor after GoogleApiWrapper cleanup"
```

---

## Task 23: GLF JobRunnerLib

**Source:** `AUDIT_PONYTAIL_GLF_JOB_RUNNER_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/JobRunnerLib/index.js:1`
- Modify: `GasLibraryFactory/JobRunnerLib/src/__tests__/JobRunnerService.phase5.test.js:86`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Shrink `index.js`**

Delete the header manual-duplicate content from the 415-line `index.js`, keeping the 4 `export {...}` lines (412-415).

- [ ] **Step 2: Trim the repetitive constructor-validation tests**

In `JobRunnerService.phase5.test.js:86`, delete the near-identical constructor-validation `it()` blocks, keeping representative coverage of the validation behavior (one case per distinct invalid-input category rather than the full enumeration).

- [ ] **Step 3: GLF closeout**

Run the GLF closeout.

- [ ] **Step 4: Commit**

```bash
cd GasLibraryFactory
git add JobRunnerLib
git commit -m "refactor(JobRunnerLib): shrink index.js, trim repetitive constructor tests"
cd ..
git add vendor
git commit -m "chore: refresh vendor after JobRunnerLib cleanup"
```

---

## Task 24: GLF PipelineFramework

**Source:** `AUDIT_PONYTAIL_GLF_PIPELINE_FRAMEWORK_2026-09-01.md` — run in `GasLibraryFactory/`.

**Excluded finding:** #2 (`testing/mocks.js`) — `GasLibraryFactory/test/fakes/MockFactory.js` imports and wraps `PipelineTesting.StepMock`/`PipelineContextMock` from this module (`MockFactory.js:12,158,171`). The audit's own claim that "no in-repo consumer" exists has it backwards — `MockFactory` is *built on* this module. **Do not delete.**

**Files:**
- Delete or trim: `GasLibraryFactory/PipelineFramework/src/Errors.test.js` (VALID as an exhaustive matrix — audit doesn't actually want it deleted; see Step 1)
- Modify: `GasLibraryFactory/PipelineFramework/src/Pipeline.js:48-49,66,461`
- Modify: `GasLibraryFactory/PipelineFramework/src/PipelineContext.js:137,152`
- Modify: `GasLibraryFactory/PipelineFramework/src/PipelineError.js:37`
- Modify (cross-repo): `src/application/services/DocumentGenerationService.ts:202,249,298,372,430` (in the ALDO repo)

**Interfaces:** None — self-contained within this task, but Step 3 crosses into the ALDO repo (documented there and closed out via this task's own GLF closeout, which already runs ALDO's `typecheck`/`test`).

- [ ] **Step 1: Re-check finding #1 before touching `Errors.test.js`**

Finding #1 was verified as an accurate description (`Errors.test.js` is 555 lines, an exhaustive constructor/property matrix) but re-read the finding's actual recommended action in the audit file — confirm whether it proposes deleting/trimming the matrix or leaving it as intentional exhaustive coverage before making any change here. If the finding doesn't actually call for a deletion (i.e. it's descriptive, not prescriptive), skip this step and note it as no-op in the commit message.

- [ ] **Step 2: Delete dead dry-run flag**

Remove `_isDryRun`/`options.dryRun` from `Pipeline.js:66` — zero external callers in GLF or ALDO, only internal use + its own tests.

- [ ] **Step 3: Delete dead `_monitor`/`_jobId`, and update `PipelineContext.setFlag`/`getFlag` call sites**

Remove `_monitor`/`_jobId` from `Pipeline.js:48-49` — never set by any caller; ALDO already wires telemetry via `beforeStep`/`afterStep` instead (confirmed in `DocumentGenerationService.ts:409` and `EmailNotificationService.ts:306`, which only pass `{name, stopOnError, logPosition}`).

Remove `setFlag`/`getFlag` from `PipelineContext.js:137,152` — **this one has real cross-repo callers**, unlike what "−0 deps" in the audit implies. In the ALDO repo, update `src/application/services/DocumentGenerationService.ts`:
- Lines 202, 249, 298, 372: change `ctx.getFlag<string>('criticalError')` to `ctx.get('criticalError')` (or the correctly-typed equivalent — check `PipelineContext`'s existing `get`/`set` signatures for the right generic/cast).
- Line 430: change `ctx.setFlag('criticalError', ...)` to `ctx.set('criticalError', ...)`.

Do this DocumentGenerationService.ts edit as part of this same task/commit, not a separate one — `setFlag`/`getFlag` and their 5 ALDO call sites must move together to keep both repos buildable at every commit boundary.

- [ ] **Step 4: Delete dead `getConfigSummary()`**

Remove it from `Pipeline.js:461` — zero callers outside `Pipeline.test.js`.

- [ ] **Step 5: Delete redundant `PipelineError.toString()`**

Remove the override at `PipelineError.js:37` — duplicates `BaseError.toString()` (`CoreUtilsLib`'s `BaseError.js:96`); `PipelineError`'s constructor never forwards `originalError` to `super()`, so `BaseError.toString()`'s extra "Caused by:" branch is always false for `PipelineError` anyway — removing the override changes nothing observable.

- [ ] **Step 6: GLF closeout**

Run the GLF closeout — its ALDO-side `npm run typecheck && npm test` step is what proves Step 3's `DocumentGenerationService.ts` edit is correct.

- [ ] **Step 7: Commit**

```bash
cd GasLibraryFactory
git add PipelineFramework
git commit -m "refactor(PipelineFramework): delete dead dry-run/monitor fields, setFlag/getFlag, getConfigSummary, redundant toString"
cd ..
git add src/application/services/DocumentGenerationService.ts vendor
git commit -m "refactor(services): migrate off PipelineContext.setFlag/getFlag after upstream removal"
```

---

## Task 25: GLF RoleResolutionLib

**Source:** `AUDIT_PONYTAIL_GLF_ROLE_RESOLUTION_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/RoleResolutionLib/src/AssignmentSource.js:102`
- Modify: `GasLibraryFactory/RoleResolutionLib/src/DelegationSource.js:85`
- Modify: `GasLibraryFactory/RoleResolutionLib/src/RoutingResult.js:68`
- Modify: `GasLibraryFactory/RoleResolutionLib/src/RoleResolver.js:11,72`
- Modify: `GasLibraryFactory/RoleResolutionLib/src/RoutingResolver.js:233`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Delete the dead loose-POJO fallback in `AssignmentSource.js`**

`AssignmentSource.js:102` has a fallback path for when the wrapped object lacks `isValidAt` — `Assignment.js:103` always implements it, so the fallback is dead. Delete the fallback branch.

- [ ] **Step 2: Delete the same dead fallback in `DelegationSource.js`**

Same pattern at `DelegationSource.js:85` — `Delegation.js` always implements `isValidAt`. Delete the fallback branch.

- [ ] **Step 3: Delete unused `RoutingResult` helpers**

Remove `allPrimary`/`merge`/`with*` methods from `RoutingResult.js:68` — zero external references anywhere in GLF or ALDO.

- [ ] **Step 4: Delete the write-once, never-read `_delegationValidator`**

Remove `_delegationValidator` from `RoleResolver.js` (assigned once at line 72, declared at line 11, never read again). If the assignment has an observable side effect (e.g. validation logic running as a side effect of assignment), preserve that side effect inline instead of just deleting the field — read the assignment code first to check.

- [ ] **Step 5: Delete the empty `forEach` loop**

Remove the empty `delegationChain.forEach` (only comments in its body) and the unused `actorIds` local at `RoutingResolver.js:233`.

- [ ] **Step 6: GLF closeout**

Run the GLF closeout — RoleResolutionLib is heavily used by ALDO's role-resolution hierarchy, so the ALDO-side `typecheck`/`test` portion of this closeout matters more than usual here.

- [ ] **Step 7: Commit**

```bash
cd GasLibraryFactory
git add RoleResolutionLib
git commit -m "refactor(RoleResolutionLib): delete dead fallback branches, unused RoutingResult helpers, write-only field, empty loop"
cd ..
git add vendor
git commit -m "chore: refresh vendor after RoleResolutionLib cleanup"
```

---

## Task 26: GLF SheetDBLib

**Source:** `AUDIT_PONYTAIL_GLF_SHEET_DB_LIB_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/DOCS_LIBS/SheetDBLib.md`
- Modify: `GasLibraryFactory/SheetDBLib/src/internal/query-builders/AdvancedQueryParser.js:92`
- Modify: `GasLibraryFactory/SheetDBLib/src/query/AdvancedQueryBuilder.js:21,38`
- Modify: `GasLibraryFactory/SheetDBLib/index.js:1`
- Modify: `GasLibraryFactory/SheetDBLib/src/TableService.js:81`
- Modify: `GasLibraryFactory/SheetDBLib/src/DatabaseService.js:43`
- Modify: `GasLibraryFactory/SheetDBLib/src/internal/query-builders/FuzzyCondition.js:1`
- Modify: `GasLibraryFactory/SheetDBLib/src/internal/query-builders/AdvancedQueryCompiler.js:95,99`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Replace the stale generated API dump**

Replace the entire content of `DOCS_LIBS/SheetDBLib.md` (a stale dump documenting removed `multi/`/`dynamic-columns/` modules) with a one-line link to the maintained `GasLibraryFactory/SheetDBLib/README.md`.

- [ ] **Step 2: Delete `QueryCondition`/`QueryGroup` — and their re-export**

Remove `QueryCondition`/`QueryGroup` (`AdvancedQueryParser.js:92`) — production uses flat condition records and `AdvancedQueryCompiler._applyGroupBy` instead; neither is exported from `index.js`. **Also** remove the re-export of them at `AdvancedQueryBuilder.js:21` — confirmed this is the only other place they're referenced (as a re-export, not a re-implementation). Delete their direct test blocks.

- [ ] **Step 3: Turn `index.js` into an export barrel**

Replace the 352-line prose duplicate in `index.js` with a short barrel — confirmed only 4 export lines (355,356,359,362) need to remain.

- [ ] **Step 4: Fold `TableService`'s single-owner collaborators**

`TableDataModifier`/`TableSchemaValidator`/`TableSearchEngine` (`TableService.js:81`) are single-owner. Fold into `TableService` directly, keep the public methods, delete the facade/delegate plumbing. (`TableSearchEngine` is also referenced from `testing/mocks.js` — check that reference still resolves correctly after the fold, e.g. by re-pointing it at `TableService`'s new method if it was importing the collaborator class directly.)

- [ ] **Step 5: Fold `DatabaseService`'s single-owner collaborators**

`DatabaseConnectionManager`/`SchemaExplorer`/`TableRegistry`/`MetaDataHandler` (`DatabaseService.js:43`) are all single-owner via `Delegation.delegateMethods`. Fold into `DatabaseService` directly, delete the runtime delegation registry.

- [ ] **Step 6: Fold `AdvancedQueryBuilder`'s single-owner collaborators**

Its compiler/pagination collaborators (`AdvancedQueryBuilder.js:38`) follow the same `Delegation.delegateMethods` pattern. Fold into `AdvancedQueryBuilder` directly, delete the dynamic delegation map. (Do this after Step 2's edit to the same file, to avoid conflicting edits.)

- [ ] **Step 7: Inline the two-call fuzzy-condition factory**

`createFuzzyCondition` (`FuzzyCondition.js`) is called from exactly 2 sites (Validator + Builder). Inline it into the builder, keep one behavior test with the builder, delete the separate module and its direct test.

- [ ] **Step 8: Delete unused `QueryCache.clear`**

Remove `QueryCache.clear()` (`AdvancedQueryCompiler.js:95`, dead alias defined at line 99 for `invalidateTable`) — confirmed no current caller.

- [ ] **Step 9: GLF closeout**

Run the GLF closeout.

- [ ] **Step 10: Commit**

```bash
cd GasLibraryFactory
git add DOCS_LIBS/SheetDBLib.md SheetDBLib
git commit -m "refactor(SheetDBLib): replace stale API dump, delete unused query-builder trees, fold single-owner collaborators"
cd ..
git add vendor
git commit -m "chore: refresh vendor after SheetDBLib cleanup"
```

---

## Task 27: GLF WorkspaceTemplateEngine

**Source:** `AUDIT_PONYTAIL_GLF_WORKSPACE_TEMPLATE_ENGINE_2026-09-01.md` — run in `GasLibraryFactory/`.

**Files:**
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/index.js:1`
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/FilterStrategy.js:30`
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/Mustache.js:425`
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/PlaceholderService.js:32,41-42`
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/DocumentProcessor.js:29`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Shrink `index.js`**

Delete the ~207-line duplicate tutorial content from the 215-line `index.js`, keeping the 5 export statements at the tail.

- [ ] **Step 2: Delete unused `FilterStrategy.getDescription()`**

Remove it from `FilterStrategy.js:30` — confirmed zero real production callers (the only other `getDescription` hit, `Mustache.js:221`, is an unrelated same-named method on the `Mustache` class itself, not a filter-contract caller). Leave the 26 concrete filter implementations (`BuiltInFilters.js`/`AdvancedFilters.js`) that implement the rest of the `FilterStrategy` contract untouched — only the dead `getDescription()` method goes.

- [ ] **Step 3: Delete unused `Mustache` cache/partial methods**

Remove `clearCache`/`addPartial`/`addPartials`/`compile` from `Mustache.js:425` — confirmed no external callers in GLF or ALDO.

- [ ] **Step 4: Delete `PlaceholderService`'s dead fields**

Remove `this.utils`/`this.cache` (assigned lines 41-42, declared/used at line 32) from `PlaceholderService.js` — confirmed never read after assignment anywhere in the file.

- [ ] **Step 5: Delete `DocumentProcessor`'s dead constants**

Remove `MAX_TEMPLATE_SIZE`/`MAX_NESTING_DEPTH`/`_currentDepth` from `DocumentProcessor.js:29` — confirmed assigned but never read elsewhere in the file.

- [ ] **Step 6: GLF closeout**

Run the GLF closeout.

- [ ] **Step 7: Commit**

```bash
cd GasLibraryFactory
git add WorkspaceTemplateEngine
git commit -m "refactor(WorkspaceTemplateEngine): shrink index.js, delete dead filter/mustache/placeholder/processor surfaces"
cd ..
git add vendor
git commit -m "chore: refresh vendor after WorkspaceTemplateEngine cleanup"
```

---

## Suggested execution order

Tasks 1-11 (ALDO) have no dependency on Tasks 12-27 (GLF) or on each other, and vice versa — any order works within each group. Two GLF tasks touch ALDO source directly (Task 24 edits `DocumentGenerationService.ts`; run it after Task 2, which also touches that file, to avoid a rebase). Otherwise, run GLF tasks in numeric order for convenience only — there is no real ordering requirement between them except the internal one documented in Task 19.
