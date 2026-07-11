# Offline test expansion, online GAS test suite, and `online` build mode

## Problem

1. Offline coverage (`npm test` + `npm run test:integration`, 436 tests) is
   green with no failures, but branch coverage is uneven: 76.9% overall, with
   `src/infrastructure/facades` at 43.5% branches / 53% functions — far
   below every other layer.
2. There is no way to validate ALDO's behavior inside a real Google Apps
   Script runtime. The specs (`SPECS_ALDO/`) describe real `DriveApp`/
   `SpreadsheetApp`/`MailApp` behavior, quota semantics, and Sheets-as-DB
   mechanics that fakes cannot fully reproduce. Nothing currently runs
   ALDO's own services (repositories, role resolution, context engine,
   document/email pipelines) against a live spreadsheet.
3. `build-and-prepare.cjs` has three modes (`production`, `testing`,
   `testoffline`) but none is shaped for "push to Apps Script, run online
   tests, read results back." There is also no line-level map from GAS
   output back to original TypeScript source/line for LLM-assisted
   debugging of a pasted `Logger.log` stack trace.

## Goals

1. Raise branch/edge-case coverage broadly across `src/`, concentrated on
   `src/infrastructure/facades` and the next-lowest layers, without lowering
   the bar on the (already-green) rest of the suite. No formal % gate; the
   target is "every module's major branches — validation failures, empty/
   null inputs, error paths — are exercised."
2. Add a self-contained ALDO-only online test suite (`src/onlinetests/`)
   that, when run manually from the Apps Script editor, builds a throwaway
   *sample SGSA database* and exercises ALDO's own services against it,
   emitting one `Logger.log(JSON.stringify(report))` line an LLM can read
   directly from a pasted Stackdriver/Logger transcript.
3. Add a new `online` build mode producing `dist/Code.js` (ALDO app code,
   unminified, comments stripped) and a separate `dist/OnlineTests.js`
   (the online test suite, same shape), plus `dist/gas-source-map.json`
   mapping generated lines in both files back to original `src/**/*.ts`
   file/line.

## Non-goals

- Online tests do not exercise GasLibraryFactory internals directly (GLF has
  its own test suite in its own repo) — only ALDO code paths, even though
  those paths necessarily call into vendored GLF services underneath.
- No cleanup of online-test artifacts: the sample database, generated Drive
  folders/documents, and any test emails are left in place for manual
  inspection after a run.
- No CI wiring for the online suite — it is pushed and run manually by a
  human with live Google Workspace credentials, exactly like the existing
  `push:testing` flow.

---

## 1. Offline test expansion

Work file-by-file, from lowest branch coverage up, using
`npx jest --config jest.config.cjs --coverage --coverageReporters=text` as
the guide. Priority order (current branch %):

1. `src/infrastructure/facades` (43.5%) — every facade's error/edge paths
   reachable through its existing fake (`test/fakes/Fake*Facade.ts`):
   malformed input, empty results, thrown-error passthrough, boundary sizes
   (e.g. batch limits). Where a branch is *only* reachable via real GAS
   service behavior (not expressible through the fake), leave it and note
   it — that is exactly what the online suite covers instead.
2. `src/config` (42.3%) — `schema.ts` validation branches, `Bootstrap.ts`
   wiring branches (optional deps present/absent), `ServiceContainer.ts`
   unregistered-lookup error path.
3. `src/infrastructure/db` (64.4%) — `SheetDbAdapter` composite-PK vs
   single-PK branches, `__PK` synthetic-column paths, transaction rollback.
4. `src/application/import` (67.0%) — importer branches per recipe/target.
5. `src/infrastructure/steps`, `src/domain/entities`,
   `src/application/services`, remaining modules — same treatment.

No new test infrastructure needed; this reuses existing fakes/fixtures
(`test/fakes/*`, `test/fixtures/tables.ts`) and existing `test/unit/**`
directory layout. Any real bug surfaced along the way gets a regression
test plus a fix in `src/`.

---

## 2. Online GAS test suite

### Location and entry point

- New tree `src/onlinetests/`, bundled as its own webpack entry (see §3).
- Single exported GAS global: `runOnlineTests(): void`, calling an internal
  `executeOnlineTests(): OnlineTestReport` and `Logger.log`-ing the
  JSON-stringified report. `runOnlineTests` takes no arguments so it can be
  run directly from the Apps Script editor's Run dropdown with no setup.
- Uses the real `GoogleApiWrapper`-backed facades directly (`DriveServiceFacade`,
  `GmailServiceFacade`, `ScriptPropertiesFacade`, etc. — the same classes
  `Bootstrap.ts` wires in `initAldo()`), not GLF internals, and not the test
  fakes.

### `OnlineTestReport` shape

```ts
interface OnlineTestResult {
  name: string;
  status: 'pass' | 'fail';
  message?: string;   // present on fail: assertion detail or caught error
  artifactUrl?: string; // Drive/Sheet URL relevant to this check, if any
}
interface OnlineTestReport {
  suite: 'aldo-online-tests';
  startedAt: string; // ISO
  finishedAt: string;
  passed: number;
  failed: number;
  results: OnlineTestResult[];
}
```

Every check is wrapped so one failure never aborts the run: each
`OnlineTestResult` is produced by a `try { ... } catch (e) { status: 'fail',
message: String(e) }` wrapper, matching the existing defensive style already
used in `src/infrastructure/steps`.

### Step 1 — `SampleDatabaseBuilder`

`src/onlinetests/SampleDatabaseBuilder.ts` creates one throwaway Spreadsheet
named `_ALDO_ONLINETEST_<ISO timestamp>` via `SpreadsheetApp` (through
`GoogleApiWrapper`, per the CLAUDE.md constraint — this is one of the narrow
sanctioned direct-`SpreadsheetApp` call sites, alongside a throwaway Drive
folder created the same way), containing:

- One sheet per `TABLE.*` in `src/config/schema.ts` (all 19 tables +
  `MASTER`), with header rows matching each table's columns per
  `01_SCHEMA_DATABASE.md` / `COL_*` constants in `schema.ts`.
- A small, coherent seed, enough to exercise real branches:
  - 2 `CLASSI` rows (one plain, one half of an articolata pair, e.g. `4A`
    and its partner `4A-LC`), 2 `DOCENTI`, 4–5 `ALUNNI` (including one
    enrolled in the articolata partner class per the `ALUNNI.CLASSE`
    invariant in `01_SCHEMA_DATABASE.md`), 1 `MATERIE`, 1 `INDIRIZZI`, 1
    `DIPART`.
  - 1 `SUPPLENZE` row and 1 `VARIAZIONI_CATTEDRA` row on the same
    class/subject/date window as a `CLASSI` nominal assignment, so the
    priority-chain resolution (SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI) has
    a real 3-way case to resolve.
  - 1 `CONF_DOC` row and 1 `CONF_MAIL` row pointing at a minimal Drive
    template/target created in the same throwaway folder.
  - One `MASTER` row (in a separate, also-throwaway Master Sheet spreadsheet)
    pointing `ID_SPREADSHEET` at the sample database and `ID_CARTELLA_GOOGLE`
    at the throwaway Drive folder.
- Returns `{ masterSpreadsheetId, sampleSpreadsheetUrl, sampleFolderUrl, ... }`
  so every subsequent check can report `artifactUrl`.

### Step 2 — exercise ALDO through the sample database

Using the real `PROP_MASTER_SPREADSHEET_ID` Script Property temporarily
pointed at the throwaway Master Sheet (restored/left as-is per the
no-cleanup decision — but only *set*, never destructively overwriting a
pre-existing value without recording the prior one first, so a human
re-running `initAldo()` for their real data afterward is not silently
broken), call `initAldo()` and run real ALDO services against it:

1. **Repositories** — `ClasseRepository`, `AlunnoRepository` (or the actual
   registered repository set in `Bootstrap.ts`), read the seeded rows back
   and assert field values round-trip.
2. **Role resolution** — `RisolutoreRuoliService` resolved against the class/
   subject/date covered by both the `SUPPLENZE` and `VARIAZIONI_CATTEDRA`
   seed rows; assert `SUPPLENZE` wins (priority 1), then a second check on a
   date outside the `SUPPLENZE` window asserting `VARIAZIONI_CATTEDRA` wins,
   then a third on a subject with neither, asserting the `CLASSI` nominal
   fallback.
3. **Context engine** — `ContextEngineFactory`-built `ContextBuilder`
   assembling a CDU for the seeded class/student; assert a couple of known
   `02_CDU_STRUTTURA.md` access paths resolve to the expected seeded values.
4. **Document/email pipeline** — one real `avviaGenerazioneDataDriven` (or
   equivalent single-item call, not the full batch/JobRunner loop, to avoid
   multi-minute execution) against the seeded `CONF_DOC` row, asserting a
   document appears in the throwaway Drive folder; same for
   `avviaInvioNotificheDataDriven` against `CONF_MAIL`, sending to the
   running user's own email only (`Session.getActiveUser().getEmail()`),
   clearly subject-prefixed `[ALDO ONLINE TEST]`.

Each of the four areas above is one or more `OnlineTestResult` entries.

---

## 3. `online` build mode

### `build-and-prepare.cjs`

- Add `online` to the valid `--mode=` values.
- `dist/Code.js`: same composition as today's `testing`/`testoffline` (vendor
  prelude + `aldo-core.js` + `EntryPoints.js`, concatenated) built with
  Webpack's readable (`--env readable`) path, then run through a
  **comments-only** Terser pass (`compress: false, mangle: false,
  format: { comments: false }`) so output stays unminified (original
  structure/names intact) but comment-free.
- `dist/OnlineTests.js`: a **third** webpack entry
  (`entry: './src/onlinetests/index.ts'`, own `onlinetestsConfig` alongside
  `coreConfig`/`entrypointsConfig` in `webpack.config.cjs`), same
  unminified + comments-stripped treatment, written as its own file — never
  concatenated into `Code.js` — so it can be pushed or removed independently
  (e.g. deleted from the Apps Script project once online validation is done,
  without touching `Code.js`).
- `dist/gas-source-map.json`: built from the webpack-emitted `.map` files for
  all three bundles (vendor prelude excluded — it already has its own
  source-map handling upstream in GasLibraryFactory) *before* they are
  deleted by the existing compose step. Format: a flat array easy for an LLM
  to grep/scan:
  ```json
  [
    { "file": "Code.js", "generatedLine": 1234, "originalFile": "src/application/services/RisolutoreRuoliService.ts", "originalLine": 88 },
    ...
  ]
  ```
  built with the `source-map` package's consumer API, iterating generated
  line starts (one entry per original-source line boundary is enough
  granularity for translating a `Logger.log`/stack-trace line number back to
  source — not full column-level fidelity).
- After `online` mode's compose step, run the existing offline test suite
  (same as `testoffline`) as a pre-push sanity gate, then report file sizes
  same as other modes.
- New npm scripts: `"build:online": "node scripts/build-and-prepare.cjs --mode=online"`,
  `"push:online": "npm run build:online && clasp push"`.

### Existing modes unaffected

`production`, `testing`, `testoffline` keep their current behavior exactly.
`online` is additive.

---

## Testing

- Offline: the expanded `test/unit/**` suite covers itself (task 1).
- The `src/onlinetests/**` source is plain TypeScript and gets its own
  offline unit tests in `test/unit/onlinetests/` using the existing fakes
  (`FakeDriveFacade`, `FakeGmailFacade`, `FakeDatabase`, etc.) to verify
  `SampleDatabaseBuilder`'s seeded-row shapes and `executeOnlineTests`'s
  report-assembly/error-wrapping logic *without* touching real GAS
  services — the actual live-GAS behavior can only be verified by a human
  running `runOnlineTests()` in Apps Script and pasting back the
  `Logger.log` JSON.
- `build-and-prepare.cjs` changes get a smoke check: `npm run build:online`
  succeeds, `dist/OnlineTests.js` exists and is distinct from `dist/Code.js`,
  neither contains `/**` comment blocks, both retain multi-line/readable
  formatting (average line length check, same technique already used for
  the `production`-mode `EntryPoints.js` verification), and
  `dist/gas-source-map.json` is valid JSON with at least one entry per
  original source file.
