# CARENZE Campaign Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send parents only the selected CARENZE campaign, with each email containing one student's selected assessment, and never resend an assessment already marked as notified.

**Architecture:** Keep the physical key `(STUDENTE, PROGRESSIVO)` and add the business campaign identifier `ID_RILEVAZIONE`. Expose it as `focus.carenza.idRilevazione`; select campaigns through the existing `CONF_MAIL.CONDIZIONE` expression engine and scope the existing boxes through the CDU. Reuse GasDataImporter for import deduplication, including a proposed reusable composite-conflict-key extension rather than an ALDO-local loader.

**Tech Stack:** TypeScript, synchronous GAS V8, GasLibraryFactory (GasDataImporter, SheetDBLib, GasExpressionEngineLib, JobRunnerLib), Jest.

**Spec:** The requirements below record the user's November 11, 2026 request. Read alongside `SPECS_ALDO/01_SCHEMA_DATABASE.md` (physical schema), `SPECS_ALDO/02_CDU_STRUTTURA.md` (CDU), and `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md` (email processes).

## Requirements and scope

- A campaign spans multiple council dates: e.g. `2026_27_NOVEMBRE` includes November 16 and November 19. `DATA` remains the actual assessment date.
- One assessment per `(STUDENTE, ID_RILEVAZIONE)` in an annual database. Keep `(STUDENTE, PROGRESSIVO)` as the physical key; never renumber historical rows.
- Any nonempty `NOTIFICATO` excludes that assessment, regardless of email pattern or `DUPLICAZIONE`. November notification does not block February notification.
- Each email's subjects, grades, notes and absence warning must come from its selected assessment only.
- Reimporting the same campaign must not recreate assessments or clear notification timestamps. The smallest supported import policy is insert-only: existing campaign rows are skipped, including unnotified rows. Updating previously imported grades is outside this plan; edit the existing row explicitly.
- Existing source workflows must supply valid `PROGRESSIVO` values for new rows, following the current per-student `MAX + 1` rule; this plan does not introduce a new numbering engine.
- Legacy rows without a campaign identifier remain readable. Campaign-specific sends exclude them; backfill identifiers before enabling the campaign workflow.
- No new CONF_MAIL column, per-box campaign filter, campaign registry, or new entrypoint is required.

## Global Constraints

- **Target is GAS V8**, not Node. ONLY synchronous code.
- **Never edit `dist/*`** — it is generated.
- Check `GasLibraryFactory/DOCS_LIBS` before implementation; all native GAS access remains behind GoogleApiWrapper.
- Use codebase-memory-mcp first for discovery and linkage checks; read files before editing.
- Wire changed dependencies through the composition root; preserve unscoped CDU behavior outside focused assessment operations.
- **Library approval gate:** Task 1 proposes extending GasDataImporter because its documentation currently exposes only `conflictKey: string`. Obtain explicit approval for that library extension before editing library source, as required by AGENTS.md. Do not silently substitute a custom ALDO import loop. Read `GasLibraryFactory/CLAUDE.md` first; inspect only the narrowly necessary library source after approval.

## Review Focus

1. Same student, November and February: February HTML must not contain November grades or warnings (Task 3).
2. Campaign dates differ between classes: both belong to the campaign, and unrelated assessments stay untouched (Task 3).
3. Import replay or chunk replay after notification: no duplicate row, changed progressivo, or cleared timestamp (Task 1).
4. A queued target becomes notified before resume: skip it even under another pattern or `DUPLICAZIONE=PERMESSA` (Task 3).
5. Missing campaign identifiers, missing focused rows, or duplicate business keys: never fall back to another assessment or guess a campaign (Tasks 1–3).

## Task 1: Make campaign imports stable and non-destructive

**Files:**
- Modify: `src/config/schema.ts`, `src/domain/entities/Carenza.ts`, `src/config/validationRules.ts`.
- Modify: `src/application/import/ImportRecipeMapper.ts`.
- Modify after approval: `GasLibraryFactory/GasDataImporter/src/types.ts`, `GasLibraryFactory/GasDataImporter/src/ImportConfiguration.ts`, `GasLibraryFactory/GasDataImporter/src/internal/load/Loader.ts`.
- Test: `GasLibraryFactory/GasDataImporter/src/__tests__/ImportConfiguration.test.ts`, `GasLibraryFactory/GasDataImporter/src/internal/load/__tests__/Loader.test.ts`, `test/unit/application/import-recipe-mapper.test.ts`, `test/unit/application/import-service.test.ts`.
- Create: `test/integration/carenze-campaign-import.test.ts`.
- Update: `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `GasLibraryFactory/DOCS_LIBS/GasDataImporter.md` (using its documentation generator), `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (CARENZE headers and rows), `test/fixtures/tables.ts`.

**Interfaces:**
- Produce `COL_CARENZE.ID_RILEVAZIONE` and `Carenza.idRilevazione: string` (trimmed, empty for missing legacy values; round-trip through existing raw data).
- Extend `ImportLoadConfig.conflictKey` and `AldoImportConfig.key` to `string | string[]`, retaining all existing string-key behavior. Arrays match the complete tuple, not any single component.
- Campaign import configuration: `key: ["STUDENTE", "ID_RILEVAZIONE"]`, `conflictResolution: "IGNORE"`; map the campaign field from the source explicitly.

- [ ] **Step 1: Write failing tests.** Add `composite INSERT_ONLY preserves notified campaign on replay`: load two students in November on different dates, mark one notified, replay the source and the same chunk, then import February. Assert one row per student/campaign, unchanged November PK/timestamp, and a new February row. Include duplicate input rows across chunk boundaries, absent/blank key components, and legacy single-key tests. Add mapper tests for array-key validation and CARENZE rejection of destructive `OVERWRITE` or timestamp upserts in the campaign workflow. Existing duplicate business keys must be reported during validation, never silently resolved.
- [ ] **Step 2: Verify failure.** Run `npx jest --runInBand GasDataImporter/src/__tests__/ImportConfiguration.test.ts GasDataImporter/src/internal/load/__tests__/Loader.test.ts` from `GasLibraryFactory/`, and the two ALDO unit files with `npx jest --config jest.config.cjs --runInBand <files>`. New assertions must fail for the missing behavior.
- [ ] **Step 3: Implement the interfaces above after library approval.** Reuse the library loader's existing strategies. Encode tuples collision-safely; reject empty arrays and blank/missing composite values before writes. Keep string-key callers compatible. Register ID_RILEVAZIONE among known CARENZE columns so it cannot be mistaken for a subject. Adjust ghost-key handling to consume an array of key columns. Require a mapped campaign identifier for campaign imports, preserve legacy read compatibility, and document insert-only semantics and valid source PROGRESSIVO values. Do not add automatic updates or an import-specific synthetic DB column.
- [ ] **Step 4: Verify success.** Run the tests above, rebuild the library with `npm run build:production`, then run ALDO `npm run refresh:vendor` and `npm run verify:vendor`. Run `npx jest --config jest.integration.config.cjs --runInBand test/integration/carenze-campaign-import.test.ts`; assert the real library-backed import path works both synchronously and through `executeImportChunked`. Correct the existing single-key ghost handling without expanding this task into the unrelated chunked ghost-filter gap.
- [ ] **Step 5: Commit the library change and the ALDO import/schema change separately**, using explicit file paths. Include generated vendor artifacts through the repository's existing refresh workflow, never by hand.

## Task 2: Scope the CDU to the selected assessment

**Files:**
- Modify: `src/application/context-engine/Cdu.ts`, `src/application/context-engine/providers/CarenzaFocusProvider.ts`, `src/application/context-engine/providers/CarenzeProvider.ts`.
- Test: `test/unit/application/context-engine/documenti-carenzafocus.test.ts`, `test/unit/application/context-engine/mappers/carenze-mapper.test.ts`.
- Create: `test/unit/application/context-engine/carenze-provider.test.ts`.
- Update: `SPECS_ALDO/02_CDU_STRUTTURA.md`, `SPECS_ALDO/PLACEHOLDER_DA_CDU_DOMINIO_SCUOLA.md`.

**Interfaces:**
- Consume `Carenza.idRilevazione` from Task 1 and existing `BuildParams.carenzaProgressivo?: number`.
- Produce `CarenzaFocusVM.idRilevazione: string`.
- Change `CarenzeProvider.provide(cdu: Cdu, params: BuildParams): void`: when a progressivo is supplied, pass only that student's matching row to the existing `buildElencoCarenzeVm`; otherwise preserve existing aggregation behavior.

- [ ] **Step 1: Write failing tests.** `focused assessment contains only its own subjects` uses one student's November and February rows with different grades. Assert the exact February elenco, campaign ID, notes and absence flag. `missing requested progressivo never falls back to latest` must yield no unrelated data and prevent notification in Task 3. `unscoped CDU remains compatible` retains the existing complete aggregation. Missing legacy campaign values render as an empty string.
- [ ] **Step 2: Verify failure.** Run `npx jest --config jest.config.cjs --runInBand test/unit/application/context-engine/documenti-carenzafocus.test.ts test/unit/application/context-engine/carenze-provider.test.ts`.
- [ ] **Step 3: Implement the interfaces above.** Keep note/absence sourcing in CarenzaFocusProvider; keep subject formatting in the existing mapper. No new box renderer, no campaign metadata copied into every subject item, and no provider-order dependency on `focus.carenza`.
- [ ] **Step 4: Verify success.** Run the same tests plus `test/unit/application/context-engine/mappers/carenze-mapper.test.ts`; update the canonical CDU and placeholder examples.
- [ ] **Step 5: Commit** as `fix: scope carenza CDU to the selected assessment`.

## Task 3: Enforce campaign selection and no repeat notification through the email pipeline

**Files:**
- Modify as required: `src/application/pipelines/emailSteps.ts`, `src/application/services/EmailNotificationService.ts`, `src/config/ApplicationComposition.ts` and `src/config/Bootstrap.ts` only if dependency wiring changes.
- Test: `test/unit/application/email-notification-service.test.ts`, `test/unit/application/pipelines/email-steps.test.ts`, `test/unit/application/email-boxes.test.ts`, `test/integration/notifica-email.test.ts`.
- Update: `test/fixtures/tables.ts`, `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (email recipes).
- Create: `docs/carenze-campaign-setup.md` (Italian operator instructions).

**Interfaces:**
- Keep public send APIs and the existing `EmailTarget.carenzaProgressivo` unchanged.
- Use existing `CONF_MAIL.CONDIZIONE`: `{{focus.carenza.idRilevazione}} == "2026_27_NOVEMBRE"` (February uses `2026_27_FEBBRAIO`). Combine with existing conditions rather than replacing them.
- Keep `findNonNotificate()` for initial enumeration. Before sending queued/resumed targets, re-read the selected assessment from the current execution's database and set the existing `shouldSend=false` gate if missing or already notified; this guard is independent of `DUPLICAZIONE` and pattern ID. Do not use an entity snapshot serialized into the queue as notification truth.
- Retain the existing post-process action engine: require a valid CARENZE timestamp action matching both `STUDENTE={{focus.carenza.studente.email}}` and `PROGRESSIVO={{focus.carenza.progressivo}}` for these processes, validated before sending. Never broaden its predicate to the student alone; do not add a second stamp mechanism.

- [ ] **Step 1: Write failing tests.** Extend integration fixtures with active students assessed on November 16/19 and February 8, including one already-notified November row. Assert the November pattern sends only eligible November rows; HTML contains no February grade/note/absence warning; only sent rows receive timestamps; rerunning with a fresh service sends nothing. Repeat for all three PER_CARENZA_GENITORI variants. Add a stale/resumed target test with another pattern and `DUPLICAZIONE=PERMESSA`; it still skips a notified assessment. Failed sends and failed conditions leave NOTIFICATO unchanged. Missing or student-wide post-process actions fail configuration before Gmail is called. Test mode does not stamp production rows. Duplicate student/campaign rows fail closed before sending that student's assessment.
- [ ] **Step 2: Verify failure.** Run `npx jest --config jest.config.cjs --runInBand test/unit/application/email-notification-service.test.ts test/unit/application/pipelines/email-steps.test.ts` and `npx jest --config jest.integration.config.cjs --runInBand test/integration/notifica-email.test.ts`.
- [ ] **Step 3: Implement the guard and configuration validation using existing pipeline gates and domain repositories.** The existing boxes consume the corrected CDU from Task 2 unchanged. Document the campaign condition, exact row-specific POST_PROCESSO JSON, insert-only import setup, and the manual migration below. Keep successful-log deduplication as a secondary safeguard; a populated NOTIFICATO is always authoritative.
- [ ] **Step 4: Verify completion.** Run `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `npm run test:integration -- --runInBand`, `npm run build:readable`, and `npm run test:build -- --runInBand`. Run the mandated native-global bypass search via MCP on `aldo-glf`, scoped to `^src/`. In a disposable GAS test DB, import two campaign batches, send with controlled test recipients, and confirm HTML isolation, timestamps, and a fresh-run rerun with zero sends before production rollout. No production send or deployment is part of writing this plan.
- [ ] **Step 5: Commit** as `feat: send only pending assessments from the selected campaign`.

## Manual Sheet migration and rollout

1. Back up CARENZE. Append the text column `ID_RILEVAZIONE` to the right of existing columns; do not move subject columns or change existing keys.
2. Backfill each historical row using the actual campaign, not just a month extracted blindly from DATA. Use the same `2026_27_NOVEMBRE` value across all November council dates and `2026_27_FEBBRAIO` across February dates. Confirm no duplicate `(STUDENTE, ID_RILEVAZIONE)` pairs before enabling sends.
3. Preserve DATA, PROGRESSIVO and existing NOTIFICATO timestamps. Pending rows use a truly empty NOTIFICATO cell, not FALSE, zero or a checkbox.
4. Add ID_RILEVAZIONE to import sources and mappings. After deployment, use the Task 1 composite-key IGNORE configuration. Existing imported rows are skipped; grade corrections are deliberate edits to the existing row.
5. After deployment, update the existing November/February CONF_MAIL rows with the campaign conditions and the exact row-specific timestamp post-process action. BOX_CFG needs no new filter.
6. The new header alone does not make the current application campaign-safe. Do not run production campaign sends until implementation and controlled verification are complete.

## Delivery boundary

This guarantees that persisted notified rows are excluded from later application sends, including ordinary job resumes. Gmail delivery and a Sheets timestamp cannot be committed atomically: a crash after delivery but before both the success log and timestamp persist can still cause a duplicate. Document this residual window explicitly; do not claim exactly-once delivery or build a new outbox system in this change. Concurrent notification jobs and simultaneous imports/sends are outside this rollout; run one at a time.

## Self-review

Three tasks cover import identity, focused CDU data and notification lifecycle. Each Review Focus item has a named test obligation above. No implementation or library source was changed while preparing this plan. The reusable library extension is explicitly proposed for approval, not silently authorized by this document.
