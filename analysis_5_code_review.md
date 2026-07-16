# ALDO — Structural Code Review (analysis_5_code_review.md)

**Scope:** `home-giulio-Desktop-ALDO-implementing` knowledge graph (9,772 nodes / 25,744 edges), covering `src/` (ALDO application, 156 modules) layered on `GasLibraryFactory/` (16 libraries). Analysis performed via `codebase-memory-mcp` (`get_architecture`, `search_graph`, `query_graph`, `search_code`) plus targeted source reads. HEAD: `a0803d5` on `master`.

**Method note:** graph-level `IMPORTS` edges did not resolve cleanly for TS `import type`/ambient-global patterns in this index (queries against `Module-[:IMPORTS]->dep.name` returned empty), so cross-layer coupling was verified via `CALLS` edges plus direct source reads. This is noted wherever it affects confidence.

---

## 1. Executive summary

ALDO's layering is **substantially clean** and matches the Clean Architecture description in `CLAUDE.md`: the domain layer has zero outbound calls, native GAS globals are almost fully confined behind `GoogleApiWrapper`, the Presentation layer (`Menu.ts`) contains no business logic, and the JobRunnerLib Recursive Trigger Pattern is implemented correctly and idiomatically. The one structural finding worth acting on is a **directional layering violation**: two files under `src/infrastructure/steps/` (`documentSteps.ts`, `emailSteps.ts`) import and call directly into `src/application/*` — the wrong direction for an "infrastructure" package in this architecture. Everything else below is minor cleanup or confirmation of already-good practice.

| Area | Verdict |
|---|---|
| GAS native-global containment | ✅ Clean (1 sanctioned exception, documented) |
| Recursive Trigger Pattern (JobRunnerLib) | ✅ Correct |
| Presentation/Domain isolation | ✅ Clean |
| Domain layer purity (no GAS/library deps) | ✅ Clean |
| Infra → Application dependency direction | ⚠️ Violated in 2 files |
| GasLibraryFactory coupling depth | ✅ Facade-only, no `internal/` reaching |
| Dead/unreferenced code | ✅ Negligible — all zero-fan-in hits are GAS-called-by-name entry points or box/strategy registries |

---

## 2. Architecture at a glance

- 915 files (516 JS — mostly `GasLibraryFactory` — 257 TS — ALDO `src/` + tests). 156 `src/` modules.
- `get_architecture` layer inference (fan-in/fan-out over `CALLS`):
  - `domain`: fan-in 94, **fan-out 0** — confirms the domain is a pure leaf, as mandated.
  - `infrastructure`: fan-in 152, fan-out 62 — the expected shape for an infra layer (called by application, calls out to domain + gaslibs).
  - `application`: fan-in 82, fan-out 124.
  - `config` (composition root) and `test`/`unit`: outbound-only, as expected of an entry/harness layer.
- Leiden community detection (`clusters`) shows ALDO's domain/repository code (`ClasseId.of`, `Email.of`, `MateriaId.of`, `SheetTableAdapter.findAll/find`) as the highest fan-in hotspots in the whole graph — i.e., the busiest, most depended-upon code is exactly the domain value-objects and the DB adapter, not incidental glue. That's a healthy signal.
- `PipelineFramework.Step.setResult` (fan-in 39) is the single busiest cross-cutting hotspot — every pipeline step in ALDO (`documentSteps.ts`, `emailSteps.ts`) funnels state through it. Centralizing on the library's own primitive here is correct reuse, not a smell.

## 3. GasLibraryFactory integration & coupling

**No bypass of `GoogleApiWrapper`.** A repo-wide search for direct native-global calls (`SpreadsheetApp.`, `DriveApp.`, `MailApp.`, `DocumentApp.`, `PropertiesService.`, `CacheService.`, `UrlFetchApp.`, `ScriptApp.`, `LockService.`, `GmailApp.`) inside `src/` returned exactly one hit: `src/onlinetests/GasSampleSpreadsheetFactory.ts`. That file is explicitly documented as a sanctioned L2-boundary exception (mirrors `GasOnlineTestFramework/**`'s "runs inside real GAS by design" carve-out from `GasLibraryFactory/CLAUDE.md`), scoped to `src/onlinetests/**` which never executes on the production request path. This is the correct and only acceptable exception shape.

**No reaching into library internals.** A search for imports/references under any `GasLibraryFactory/**/internal/**` path from `src/` returned zero results. All consumption goes through the library's public surface (facades in `src/infrastructure/facades/*`, or ambient globals for GAS-shared-namespace classes like `ContextAssembler`, `ProviderRegistry`, `ContentComposer`, `Step`, `PipelineContext`).

**Facade layer is intentionally thin and 1:1 with library capabilities**, not a duplicate abstraction: `DriveServiceFacade`, `GmailServiceFacade`, `TemplateEngineFacade`, `ExpressionEngineFacade`, `PropertiesFacade`, `UiFacade`, `ActiveUserFacade`, `DocumentTableFacade`, `ProcessMonitorFacade` — each wraps exactly one library/service surface behind an ALDO-owned interface (`IDriveFacade`, `IGmailFacade`, etc.), which is what `CLAUDE.md` §"Critical constraints" asks for (native globals confined to `GoogleApiWrapper`, everything else routed through a wrapper). No evidence of ALDO re-deriving logic the library already owns — e.g. `ContextBuilder.ts` explicitly delegates provider ordering, retry, and interceptor execution to the library's `ContextAssembler.assembleInto()` rather than hand-rolling an assembly loop, and its own doc comment records *why* (`assembleInto`'s mutation-mode semantics were added to the library specifically to support ALDO's shared-CDU-mutation shape).

**Ambient-global integration is documented, not accidental.** `types/gaslibs/index.d.ts` (1,233 lines, 117 declared interfaces/classes) provides TypeScript types for every library global consumed this way, so `Step`, `PipelineContext`, `ContextAssembler`, `LoggerService`, `JobRunnerService`, etc. get compile-time checking in `src/` despite being GAS-shared-namespace globals rather than ES imports. This is a well-executed accommodation of the GAS single-namespace constraint, not type-safety debt.

**Verdict:** ALDO is not tightly coupled to `GasLibraryFactory` *internals*. It is (correctly, by design) coupled to the library's *public* surface at real depth — which is the intended relationship per `CLAUDE.md`'s "GasLibraryFactory-first" constraint, not an accident to fix.

## 4. Recursive Trigger Pattern (JobRunnerLib) — long-running jobs

Verified end-to-end for the document-generation batch (`DocumentBatchService`) and confirmed the same shape exists for `EmailBatchService`:

- **Generator-based checkpointing**: `batchGenerateHandler` is a `Generator<BatchCheckpoint, BatchResult, void>` that `yield`s a serializable `{percentage, nextIndex, processed, errori}` checkpoint after each unit of work (one class). This is exactly the shape JobRunnerLib expects to persist to `ScriptProperties` at a 6/30-minute suspension boundary and hand back via `params.resumeState` on resume — ALDO's handler correctly reads `resume.nextIndex` to pick up where it left off rather than restarting.
- **No manual trigger management in ALDO.** `start()`/`resume()` call `runner.run(...)`/`runner.resume(...)` (`JobRunnerService`, a library service) and hand it a `registerJobHandlers` callback — trigger creation/deletion (`ScriptApp.newTrigger` equivalents) lives entirely inside `GoogleApiWrapper.TriggerService` / `JobRunnerLib.JobRunnerTriggerManager`, never touched from `src/`.
- **`resumeJob()` as the single trigger target** (`src/index.ts:41-43`): a minimal global function (`riprendiJobSospeso(initAldo(), creaJobRunner())`) that the library's timed trigger invokes by name; the library resolves *which* suspended job to resume from the trigger's own id, so ALDO doesn't need per-job trigger dispatch logic.
- **Per-element error isolation is correctly scoped**: a single class's generation failure is caught, recorded in `errori`, and does *not* abort the batch or call `monitor.setError` (reserved for whole-batch-fatal errors) — this is the right failure-containment boundary for a batch job and is called out explicitly in the class's doc comment.

No deviations from the pattern found. This is a correct implementation of the constraint.

## 5. Presentation/UI isolation from Domain

`src/presentation/Menu.ts` was read in full: it contains **no repository, database, or domain-entity references at all** — only `IUiFacade` (input/message dialogs) and plain closures (`avvia: (configId: string) => void`) that the *caller* (built in `index.ts` over `Bootstrap`) supplies. `costruisciMenu` (the `onOpen` body) does nothing but build a menu — it explicitly does not call `initAldo()` eagerly, so opening the spreadsheet never triggers DI/DB wiring. The four-step wrapper scheme (input → validate non-empty → open monitoring sidebar → delegate) is uniform across all three menu launchers (`GENERAZIONE DOCUMENTI`, `COMUNICAZIONI EMAIL`, `IMPORTAZIONI`). `trace_path`/`CALLS` graph search confirms zero edges from `src/presentation/*` into `src/domain/*` or `src/infrastructure/*` — the file only calls into the `IUiFacade` interface and caller-supplied closures. This isolation is clean and matches the layer diagram in `CLAUDE.md`.

## 6. Finding: Infrastructure → Application dependency inversion

**`src/infrastructure/steps/documentSteps.ts` and `src/infrastructure/steps/emailSteps.ts`** (the `PipelineFramework`-based `Step` classes driving document generation and email send) import directly from `src/application/*`:

```
src/infrastructure/steps/emailSteps.ts
  → application/context-engine/Cdu, ContextBuilder, Recipe, techEntities
  → application/email/saluto, application/email/boxes
```

Concretely (via `CALLS` graph): `BuildCDUStep._executeLogic` calls `application/context-engine/Recipe.recipe`; `RenderBoxesStep._executeLogic` calls `application/email/boxes.renderBoxes`; `ComposeEmailStep` calls `boxes.escapeHtml`/`boxes.safeColor` and `context-engine/techEntities.getClasseEntity`; `BuildCDUStep.buildDestinatario` calls `application/email/saluto.salutoPerTarget`.

**Why this matters:** per `CLAUDE.md`'s stated layering (`Presentation → Application Services → Domain → Infrastructure`), infrastructure exists to *implement interfaces the domain/application define* (repositories, facades) and should be depended-*on* by the application layer — not the reverse. Here, files physically located in `infrastructure/` are orchestrating application-level use-case logic (CDU assembly, recipe selection, email box rendering) directly, which:
- Makes `infrastructure/` depend on `application/`, inverting the intended arrow and creating a layer that is neither pure infra nor pure application.
- Means anyone auditing "does infrastructure ever call up into application" (a `CLAUDE.md`-mandated check) currently gets a `yes`, which the boundary-detection query in the graph now confirms structurally, not just by convention.
- Is *not* a domain-purity violation (domain remains untouched) and *not* a `GasLibraryFactory` bypass (these steps use only sanctioned facades/library globals) — so functionally this is safe, but it is a real architectural boundary crack, and it's isolated to exactly 2 files, which makes it cheap to fix now before more `Step` classes are added on this same template.

**Recommendation:** relocate `documentSteps.ts`/`emailSteps.ts` (and `postProcessActions.ts`, which they both depend on) to an application-layer home, e.g. `src/application/pipelines/documentSteps.ts` / `emailSteps.ts`. They already depend on `infrastructure/facades/*` and `infrastructure/repositories/*` via constructor injection (that direction — application depending on infra interfaces — is correct and unaffected by the move), so relocating them only fixes the arrow direction; no logic changes needed. If there's a reason they were placed under `infrastructure/` (e.g. historical grouping by "uses `PipelineFramework`"), it's worth confirming that reason still holds before more steps accumulate there — flagging rather than assuming, since I did not find an ADR or comment explaining the placement.

## 7. Dead/unreferenced code

Queried `src/` functions with zero inbound `CALLS` edges, excluding known GAS-called-by-name entry points (`onOpen`, `doGet`, `doPost`, `resumeJob`, `aldoPing`). 16 hits, all accounted for:
- `EntryPoints.ts` functions (`menu_avvioGenerazioneDocumenti`, `menu_avvioComunicazioniEmail`, `generaPagelle`, `inviaNotificaAssenze`) — these are GAS entry points called by name from the Sheets UI/triggers, consistent with the documented "separate, human-readable GAS script file" design; zero in-graph fan-in is expected and correct for this file.
- `application/email/boxes.ts` (`dataExtractor`, `emptyChecker`, `carenze`, `documenti`, `cartelle`, `note`, `assenze`, `testo_dinamico`) — registered into a lookup table by string key (data-driven `BOX_CFG` dispatch per `CLAUDE.md`'s "data-driven, not hard-coded" principle), so they're referenced by string, not by direct call edge; expected false-positive for this kind of registry pattern.
- `CustomSourceStrategies.requireRegistered`, `DocumentoConTabelleImportateGeneratorStrategy.cellToString` — internal helpers with a single low-visibility call site the graph didn't attribute as a `CALLS` edge (likely called via `.map()`/array-callback, which some indexers under-attribute); low-risk, worth a quick manual `grep` before deleting but not indicative of genuine dead code.
- `src/infrastructure/db/Database.ts.from`, `src/index.ts.menu_avvioImportazioni` — both exported/registered entry surfaces.

No genuine dead code found in `src/`. (Full historical dead-code sweep already exists from `2026-07-16`'s audit — this pass corroborates rather than duplicates it.)

## 8. Actionable recommendations (priority order)

1. **Fix the infra→application layering inversion (§6).** Move `src/infrastructure/steps/{documentSteps,emailSteps,postProcessActions}.ts` to `src/application/pipelines/` (or similar). Pure relocation — no behavior change. Do this before adding any further `Step` subclasses so the pattern doesn't calcify.
2. **Document the `Step`-class placement decision** once resolved (§6) — either in `CLAUDE.md`'s repository-layout section or as an ADR via `manage_adr`, so future contributors don't reintroduce infra-classed files that reach into application.
3. **No action needed** on GasLibraryFactory coupling depth, Recursive Trigger Pattern, or Presentation isolation — all three are implemented correctly and should be treated as the reference pattern for new work in their respective areas.
4. **Optional / low priority:** manually verify the two "single uncounted call site" hits in §7 (`requireRegistered`, `cellToString`) aren't genuinely orphaned before any future cleanup pass — 2-minute check, not urgent.
