# testonline mock DB + e2e document/email scenarios — design

Spec 2 of 3 (see also: `2026-07-21-test-mode-email-redirect-design.md` for `MASTER.TEST_MODE`, which this spec depends on; MASTER-sheet/GAS-project setup+push scripts is spec 3).

## Goal

Stand up a persistent, realistically-sized mock SGSA database (3 classes ~20 students each — one articolata, split 8+12 — 20 docenti) plus real Drive document templates, and drive 7 end-to-end scenarios against them through ALDO's real document-generation and email pipelines, running as real GAS API calls (not Jest mocks). Reuses and extends the existing `src/onlinetests/` live-GAS test harness and the existing `online` build mode — no new build mode, per your earlier decision.

## Scenarios (7)

1. Generate class council meeting minutes (verbale).
2. Generate a Google Sheet per class for conduct evaluation (comportamento/impegno/partecipazione columns + student roster).
3. Generate customized plans for all 5 `TipoPiano` values (confirmed: all 5, not a literal 4).
4. Email the generated verbale to class coordinators.
5. Email the generated conduct sheet to every teacher of the class (unconditional, not deficiency-gated).
6. Email family-deficiency notices — exactly 2 students in the mock DB carry `CARENZA` records (confirmed: this is where the "only two students" detail belongs, not scenario 5).
7. Email both newly-generated and previously-sent customized plans to teachers — reuses the existing `piani_pers_da_inviare`/`piani_pers_inviati` box logic (`src/application/email/boxes.ts:201-447`) and `PianiPersClasseProvider`/`PianiPersAlunnoProvider` unchanged; only new mock data is needed here, no new code.

All email scenarios run with `MASTER.TEST_MODE = true` on the mock master row (spec 1) — every send in this suite is redirected to the MASTER sheet's Drive owner, never a real address.

## Gaps found and resolved with the user

Three genuine capability gaps surfaced during research; each was raised individually and resolved:

1. **Conduct-evaluation semantics** — no ALDO domain concept for comportamento/impegno/partecipazione exists, and per the user this is intentional: it's purely a spreadsheet-template concern (3 blank columns + a computed average via a plain spreadsheet formula), never touching ALDO's CDU or domain model. Confirmed: model the roster with a plain generic sheet render, not `MATERIE`/`SheetMaterieGeneratorStrategy` (that strategy is subject-column-specific and would be a semantic mismatch).
2. **Vertical roster expansion in Sheets** — `WorkspaceTemplateEngine`'s documented `{{dynamic_columns[...]}}` placeholder only expands horizontally; there is no documented row-per-array-item placeholder for Sheets. User chose to **extend GasLibraryFactory** with a new `{{dynamic_rows[...]}}` placeholder (mirroring `dynamic_columns`, vertical instead of horizontal) rather than push the roster-write into ALDO-side `SpreadsheetService` calls — keeps the roster template-driven and reusable.
3. **Excel output** — no XLSX format exists anywhere in ALDO/GasLibraryFactory. Confirmed GSHEET (Google Sheets) is what "Excel spreadsheet" means here; no new `FormatoOutput` value.

## GasLibraryFactory extension: `{{dynamic_rows[...]}}`

New Sheet placeholder in `WorkspaceTemplateEngine`, `SheetProcessor`, mirroring the existing `{{dynamic_columns[...]}}` contract (`GasLibraryFactory/DOCS_LIBS/WorkspaceTemplateEngine_docs.md`) but expanding **vertically** from the placeholder cell:

```
{{dynamic_rows[source=focus.classe.alunni,value=cognomeNome]}}
```

- `source` — array path resolved via `mustache.getValue` against the context, same as `dynamic_columns`.
- `value` — per-item expression used as the cell's text for that row (student display name).
- Duplicates rows downward from the placeholder's row, one per array element — the mirror image of `dynamic_columns`' column duplication. Same "no array → warning, no rendering" failure mode as `dynamic_columns` for consistency.
- `acl`/`scope` support deferred unless a concrete need arises (the conduct sheet doesn't require per-row protection) — YAGNI; add only if a real caller needs it.
- Multi-group syntax (`source2=`, etc.) is **not** needed for this use case (single roster column) — implement single-group only, matching what `dynamic_columns` supported before multi-group was added, unless the implementer finds trivial reuse of the same parsing code makes multi-group free.
- Documented in `GasLibraryFactory/DOCS_LIBS/WorkspaceTemplateEngine_docs.md` alongside `dynamic_columns`.
- Unit-tested in GasLibraryFactory's own suite (single item, multiple items, empty array, non-array source).
- Pulled into ALDO via `npm run refresh:vendor`.

## ALDO: new `FOGLIO_GENERICO` generator strategy

A new `GeneratorStrategy`, `FoglioGenericoGeneratorStrategy.ts`, mirroring `DocumentoGenericoGeneratorStrategy` (`src/application/strategies/DocumentoGenericoGeneratorStrategy.ts`) but for Sheets — a thin wrapper with zero business logic:

```ts
export class FoglioGenericoGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly templates: ITemplateEngine) {}
  render(fileId: string, cdu: Cdu): void {
    this.templates.processSheet(fileId, cdu as unknown as Record<string, unknown>);
  }
}
```

Registered in `Bootstrap.ts`'s `strategyRegistry` map as `FOGLIO_GENERICO`, alongside the existing `VERBALE_CDC`/`DOCUMENTO_GENERICO`/`DOC_PERSONALIZZATO` entries. The conduct-evaluation Drive template supplies its own `{{dynamic_rows[...]}}` roster placeholder plus 3 blank indicator columns and an average formula — entirely template-authored, no `CONF_DOC.PARAMETRI` needed beyond what `DOCUMENTO_GENERICO` already uses.

This is ALDO-domain wiring (mapping a new `CONF_DOC` generator id onto an already-generic library capability), not reusable library logic — correctly placed in `src/`, not GasLibraryFactory, per the project's "genuinely SGSA-domain-specific" carve-out.

## Mock database: new `E2eSampleDatabaseBuilder`

A new, separate builder (`src/onlinetests/E2eSampleDatabaseBuilder.ts`) alongside the existing small `SampleDatabaseBuilder` — confirmed with the user: the existing builder stays untouched (still backs today's `contextEngineChecks`/`pipelineChecks`/`repositoryChecks`, no regression risk), the new one is purpose-built for this larger e2e suite. Implements the same `ISampleSpreadsheetFactory`/`IDriveFacade`-port pattern as the existing builder (testable offline, real GAS-backed via `GasSampleSpreadsheetFactory` in the online run).

Fixture shape (confirmed with the user):

- **3 classi**, ~20 students each (~60 total). One class is **articolata**, split 8+12 across two `articolazione` partners — reuses the existing articolata modeling already proven in `SampleDatabaseBuilder` (the `4A`/`4A-LC` pair), just a different split size.
- **20 docenti**, distributed across the 3 classi's consigli di classe / cattedre (realistic overlap — several teachers sit on more than one CdC, matching real school structure and exercising `RoleResolutionLib`'s SUPPLENZE→VARIAZIONI_CATTEDRA→CLASSI priority chain the same way the existing builder does, just at larger scale).
- **Exactly 2 alunni** with `CARENZA` rows (scenario 6). No other students carry deficiencies.
- **1 MASTER row** with `TEST_MODE = true` (depends on spec 1 shipping first) and `SUPERVISORE_EMAIL` set, so BCC-suppression-under-test-mode is also implicitly exercised.
- **`CONF_DOC` rows**: one each for `VERBALE_CDC`, `FOGLIO_GENERICO` (conduct sheet), and `DOC_PERSONALIZZATO` × 5 (one per `TipoPiano`: `PDP_DSA`, `PDP_BES`, `PDP_STRANIERI`, `PEI`, `PFP`), each pointing at its real provisioned template (below).
- **`CONF_MAIL` rows**: one each for the verbale→coordinatori send (`PROCESSO=PER_COORDINATORE`), conduct-sheet→all-teachers send (`PROCESSO=PER_CDC`), family-deficiency send (`PROCESSO=PER_CARENZA_GENITORI`), and reuse of the already-existing piani-personalizzati sent/unsent `CONF_MAIL` pattern.
- Persistence: same fixed-name, reuse-by-lookup pattern as the existing builder/`index.ts` (`testContext.getOrCreateNamedFolder`/`buildSampleSpreadsheet` reuse-by-name, ref `mintRootFolder`/`GasSampleSpreadsheetFactory` in `src/onlinetests/index.ts`) — a distinct fixed folder/sheet name from the existing small fixture's, so both coexist without collision. Re-running the e2e suite must not create duplicate Drive artifacts.

## Template provisioning: new `E2eTemplateProvisioner`

A new component, `src/onlinetests/E2eTemplateProvisioner.ts`, responsible for finding-or-creating, under a dedicated fixed-name Drive folder (same `getOrCreateNamedFolder` idempotency pattern as the root-folder resolution in `index.ts`), the real templates the scenarios generate against:

- 1 verbale template (Google Doc, CDC placeholders).
- 1 conduct-evaluation template (Google Sheet, `{{dynamic_rows[...]}}` roster placeholder + 3 blank indicator columns + a spreadsheet-native average formula column — entirely template content, no ALDO code involvement beyond the generic `FOGLIO_GENERICO` strategy).
- 5 piano-personalizzato templates (Google Docs, one per `TipoPiano`).

No new GasLibraryFactory or `IDriveFacade` surface is needed for the reuse-by-name lookup: `DriveServiceFacade.findFolderByPath` already composes the vendored `DriveService.searchFiles` internally (`src/infrastructure/facades/DriveServiceFacade.ts:41`) for exactly this "does a named thing already exist under this parent" check. `IDriveFacade` gains one more method built the same way:

```ts
findFileByName(folderId: string, name: string): string | null;
```

a thin wrap composing `DriveService.searchFiles` scoped to `folderId`, mirroring `findFolderByPath`'s existing pattern (query by name+parent+not-trashed, take the first match). `E2eTemplateProvisioner` uses `findFileByName` to look up each of the 7 templates by fixed name under the provisioning folder, creating (via the existing `DocumentService`/`SpreadsheetService` already wired into `Bootstrap.ts`) only the ones not found — same idempotent shape as every other persistent artifact in this spec.

## New checks: `e2eScenarioChecks.ts`

New `src/onlinetests/checks/e2eScenarioChecks.ts`, following the existing `registerXChecks(runner, container, sample, ...)` pattern (`runner.add(name, artifactUrl, fn)`, `fn` throws `ValidationError` on mismatch — same shape as `contextEngineChecks.ts`). One check per scenario (7).

Run via a **second, separate top-level entry point**, `executeE2eScenarios()` (own `OnlineTestReport`), rather than folding into `executeOnlineTests()`: the two suites swap `PROP_MASTER_SPREADSHEET_ID` to different masters (small fixture vs. e2e mock DB) and have unrelated failure semantics — keeping them as independent functions means a failure in one is never masked or entangled with the other's master-pointer state, and either can be run alone. `executeE2eScenarios()` mirrors `executeOnlineTests()`'s shape exactly (same `OnlineTestDeps`-style seams, same previous-value-logged-not-discarded `PROP_MASTER_SPREADSHEET_ID` swap, same `initAldo()` re-boot), but builds via `E2eSampleDatabaseBuilder` + `E2eTemplateProvisioner` and registers only `registerE2eScenarioChecks`. Exposed as its own GAS Run-dropdown global (`runE2eScenarios`), alongside the existing `runOnlineTests`. `push:online`'s pre-push gate runs both.

## Build mode

No new build mode. Confirmed with the user: ALDO's existing `online` mode (`scripts/build-and-prepare.cjs --mode=online`) already satisfies "code must not be minified" (Terser runs with `compress:false, mangle:false, beautify:true` — comment-stripping only) and already builds/runs `src/onlinetests/**` as a push gate (`push:online`). The new builder, provisioner, and checks are just more files under `src/onlinetests/`, picked up by the existing webpack `onlinetests` entry with no build-script changes.

## Error handling

- Template provisioning failures (can't create/find a template) fail the check loudly via `ValidationError`, same as every other check — no silent skip.
- If `MASTER.TEST_MODE` is somehow `false` on the e2e master row, the email-sending checks (4, 5, 6, 7) should refuse to run rather than risk a real send — an explicit guard at the top of `e2eScenarioChecks.ts`'s registration (check `sample.masterConfig.testMode === true`, throw/skip-with-error otherwise) rather than trusting the fixture data was built correctly.

## Testing

- `E2eSampleDatabaseBuilder`: offline unit test (fake `ISampleSpreadsheetFactory`/`IDriveFacade`) asserting row counts (3 classi, ~60 alunni, 20 docenti, exactly 2 `CARENZA` rows, `TEST_MODE=true` on the MASTER row, 7 `CONF_DOC`/`CONF_MAIL` rows of the right shapes).
- GasLibraryFactory: `dynamic_rows` unit tests (single item, N items, empty array, non-array source — mirroring `dynamic_columns`' existing test coverage shape).
- `FoglioGenericoGeneratorStrategy`: unit test, asserts `processSheet` called with the CDU context, nothing else (it's intentionally a pure delegation, so the test is thin by design).
- Live: the 7 `e2eScenarioChecks` running for real inside `npm run push:online`'s pre-push gate is the actual proof this works end-to-end — this is the point of the whole spec, not a substitute for it.

## Out of scope (covered by the other two specs)

- `MASTER.TEST_MODE` itself, the `getFileOwnerEmail` GasLibraryFactory addition, and the Bootstrap wiring that auto-enables test mode — spec 1, a hard dependency of this spec's scenarios 4-7.
- The setup script (create MASTER sheet + associate/create the GAS project) and the push script targeting it — spec 3.
