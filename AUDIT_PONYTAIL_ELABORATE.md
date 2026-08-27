# Over-engineering audit and change plan — ALDO + GasLibraryFactory

Commit: `3632e9c`. Date: 2026-08-24.

Scope: over-engineering, duplication, dead code, and cost. Correctness bugs and security holes are out of scope and belong in a separate review pass.

Constraints this plan works under:

1. **No test is deleted or removed from the suite.** Weak tests get hardened, not dropped.
2. **Performance counts** — round-trips and algorithmic cost, not micro-benchmarks.
3. **DRY counts** — collapse duplicated logic, not duplicated files.

Surveyed:

| | files | source lines | test lines |
|---|---|---|---|
| ALDO `src/` | 233 | 31,419 | — |
| ALDO `test/` | 188 | — | 39,454 (unit 37,101 · integration 894 · build 401 · fakes 450 · fixtures 608) |
| GasLibraryFactory (16 libs) | 317 | 64,038 | 114,274 (102,212 in-library · 12,062 in `test/` + `__testOnline__/`) |

Runtime dependencies: ALDO **0**; GasLibraryFactory `es-toolkit/compat`, `jsep`, vendored `mustache`. Nothing to cut on the dependency axis in either repo — the 7 ALDO devDeps that show a single reference are peer/CLI/type packages consumed implicitly by webpack, babel, eslint, jest and clasp.

---

## PART A — GasLibraryFactory findings

### A1 — Four-layer delegation stack for collection utilities `yagni`

`SystemUtils` → runtime-binds 50 methods from → `SystemQuotaManager` / `SystemEnvironmentUtils` / `SystemScriptSettings` → each re-wraps → `LodashFacade` → which re-exports → `es-toolkit/compat`.

`SystemQuotaManager` is 380 lines, 29 methods, of which **25 are literally**:

```js
groupBy(array, iteratee) {
  if (!Array.isArray(array)) return {};
  return groupBy(array, iteratee);       // ← es-toolkit, re-exported by LodashFacade
}
```

Every layer re-adds an `Array.isArray` guard the layer below already has.

[CoreUtilsLib/src/utils/SystemQuotaManager.js 380 lines · SystemUtils.js 94 · facades/LodashFacade.js 358]

### A2 — `SystemUtils` binds 50 closures per instantiation `yagni`

```js
delegations.forEach(({ manager, methods }) => {
  methods.forEach((method) => {
    if (typeof manager[method] === 'function') this[method] = manager[method].bind(manager);
  });
});
```

50 closure allocations per `new SystemUtils()`, and — worse on GAS, where bundle size is a real budget — it defeats webpack tree-shaking completely. The bundle keeps all 50 methods whether a consumer touches one or none. A plain prototype-chain class or static re-export costs zero and shakes.

[CoreUtilsLib/src/utils/SystemUtils.js:82-90]

### A3 — `SystemQuotaManager` is misnamed and mostly native `stdlib`

It manages no quota. It is `chunk / unique / flatten / flattenShallow / flattenDeep / compact / difference / differenceBy / groupBy / intersection / keyBy / orderBy / uniq / uniqBy / randomInt / round / clamp / maxBy / minBy / sumBy / meanBy / every / filter / find / forEach / map / reduce / size / some`.

Of these, `unique`, `flatten*`, `compact`, `every/filter/find/forEach/map/reduce/some`, `size`, `round`, `clamp` are native JS one-liners. Only `groupBy`, `keyBy`, `orderBy`, `uniqBy`, `differenceBy`, `maxBy`, `minBy`, `sumBy`, `meanBy` earn an `es-toolkit` call.

[CoreUtilsLib/src/utils/SystemQuotaManager.js]

### A4 — `parseDate` implemented twice `delete`

`RoleResolutionLib/src/internal/DateParsing.js:19` reimplements `CoreUtilsLib/src/utils/DateUtils.js:63`. RoleResolutionLib (L3) already depends on CoreUtilsLib (L0) — no layering obstacle to sharing.

### A5 — `formatDate` implemented twice `delete`

`GoogleApiWrapper/src/services/UtilitiesService.js:160` and `CoreUtilsLib/src/utils/DateUtils.js:181`. GoogleApiWrapper's is a thin `Utilities.formatDate` pass-through and is the sanctioned native-global site — it should survive, but under a name that stops it reading as the same function.

### A6 — `isEmpty` implemented four times with four different semantics `stdlib`

- `CoreUtilsLib/src/utils/StringUtils.js:25` — string-only
- `CoreUtilsLib/src/facades/LodashFacade.js:91` — lodash-compatible, handles Map/Set/object
- `ComposableContentLib/src/core/ContentBlock.js:80` **and** `:254` — two copies in one file

Separately, `PostProcessorChain.isEmpty()`, `BlockDataContext.isEmpty()`, `DelegationChain.isEmpty()` and `RoutingResult.isEmpty()` are zero-argument domain predicates — legitimate, unrelated, leave alone.

### A7 — Dead exports `delete`

Zero references anywhere in the monorepo, tests included:

- `validateInterfaceShape` [CoreUtilsLib/src/interfaces.js]
- `getColumnTypes` [SheetDBLib/src/internal/dynamic-columns/ColumnType.js]
- 8 unused mock classes — `RendererRegistryMock` [ComposableContentLib/src/testing/mocks.js], `CacheUtilsMock` [CoreUtilsLib/src/testing/mocks.js], `MenuBuilderMock` / `SidebarBuilderMock` / `DialogBuilderMock` / `DocumentBuilderMock` [GoogleApiWrapper/src/testing/mocks.js], `MockSchemaValidator` + `createMockSchema` [GasSchemaValidatorLib/src/testing/mocks.js], `AdvancedQueryBuilderMock` [SheetDBLib/src/testing/mocks.js]

These are test *doubles* nobody instantiates, not tests. Removing them costs no coverage.

### A8 — Double-naming via `My` prefix `shrink`

```js
export class MyDatabaseService { … }
export { MyDatabaseService as DatabaseService };
```

Two names for one class, permanently. Same pattern in `WorkspaceTemplateEngine/src/PlaceholderService.js:12,178`.

[SheetDBLib/src/DatabaseService.js:16,88]

### A9 — Test-quality signal

| Loose pattern | Count |
|---|---|
| `expect(x).toBeDefined()` | 617 |
| `expect(() => …).not.toThrow()` | 167 |
| `expect(x.length).toBeGreaterThan(0)` | 101 |
| `expect.any(…)` | 56 |

**941 assertions that pass on almost any non-crashing output.**

Nine tests are silently skipped:

- `GasExpressionEngineLib/src/__tests__/ExpressionEngineService.test.js:202` — "array indices in placeholders (JSEP limitation)"
- `GoogleApiWrapper/src/__tests__/integration/BatchRateLimiterIntegration.test.js:272, 276, 280, 284, 292, 296, 302` — seven tests, all "requires actual API integration"
- `WorkspaceTemplateEngine/src/__tests__/integration/DocumentProcessorIntegration.test.js:192` — "create new document from template (feature not implemented)"

### A10 — Checked and cleared

- **Sheets batching is sound.** Zero `getRange` / `setValues` / `appendRow` calls inside loops across all 16 libraries' data paths. The single hit is in the test framework (see C4.1).
- **No `JSON.parse(JSON.stringify())` deep-clone** in production code (one in a jest mock, which is fine).
- **Layering holds.** No L-level violations; the ESLint `no-restricted-globals` fence around `GoogleApiWrapper` is real and enforced.
- `Entity`, `Specification`, `ValueObject`, `Step`, `ConsumerStep` abstract bases each have ≥3 concrete subclasses — genuine polymorphism.

---

## PART B — ALDO findings

### B1 — 19 domain repository interfaces, one implementation each `yagni`

`src/domain/repositories/I*.ts`, 302 lines. Every one has exactly one implementation, and **no test fake implements any of them** — fakes go through `FakeDatabase` / `FakeTable` instead. So they buy no test seam. `ISupplenzaRepository` and `IVariazioneCattedraRepository` have exactly one reference each in the entire tree. 156 type-annotation sites across `src/` reference the set.

### B2 — 21 entity `*Data` interfaces that enforce nothing `delete`

```ts
export interface DocenteData {
  [COL_DOCENTI.EMAIL]?: string;
  [COL_DOCENTI.COGNOME]?: string;
  // …
  [key: string]: unknown;      // ← makes every line above decoration
}
```

The trailing index signature means any key passes and every value is `unknown`. 21 files, 273 lines, zero type safety delivered. [src/domain/entities/*.ts]

### B3 — `ProcessMonitorFacade` is 100% pass-through `yagni`

Nine methods, all `return this.monitor.x(...)`, zero added logic. It touches no native GAS global — the vendored `ProcessMonitorService` owns that — so it satisfies no ESLint fence either. 52 lines of pure indirection. [src/infrastructure/facades/ProcessMonitorFacade.ts]

### B4 — Three byte-identical ID value objects `shrink`

`ClasseId`, `IndirizzoId`, `DipartimentoId` are character-for-character the same class modulo the error string: private constructor, `static of()` that trims and rejects empty, `equals()`. `MateriaId` and `MateriaSpecificaId` differ only by a regex. ~60 lines across 5 files. [src/domain/value-objects/]

### B5 — `Specification` base inherits composition machinery nobody uses `yagni`

The base extends the ambient `DomainRepositoryLib.Specification` purely to inherit `.and()` / `.or()` / `.not()`. **Zero uses of all three anywhere in `src/` or `test/`.** The file is 32 lines, 22 of them a comment explaining why the inheritance is awkward (a `TS2506` self-referential-base workaround requiring the class be declared as `AldoSpecification` and re-exported under an alias). [src/domain/specifications/Specification.ts]

### B6 — Two facade interfaces with one implementation and no fake `yagni`

- `IExpressionEngine` — one impl, no fake [src/infrastructure/facades/ExpressionEngineFacade.ts]
- `IActiveUserFacade` — one impl, no fake; `SessionActiveUserFacade` is a 3-line method behind a 3-line interface [src/infrastructure/facades/ActiveUserFacade.ts]

(The other facade interfaces — `IDriveFacade`, `IGmailFacade`, `ITemplateEngine`, `IUiFacade`, `IPropertiesFacade`, `IDatabase`, `IReadableTable`, `IDocumentTableFacade` — all have real fakes in `test/fakes/`. They stay.)

### B7 — Dead exported fixture constants `delete`

Zero references anywhere: `CLASSI_CLASSICO`, `CLASSI_SCIENTIFICO`, `CLASSI_SCIENZE_UMANE`, `MATERIE_BASE`, `MATERIE_CLASSICO`, `MATERIE_SCIENTIFICO`, `MATERIE_SCIENZE_UMANE`, `ANNO_CORRENTE`, `TEMPLATE_JOBRUNNER_DOC`, `TEMPLATE_TABELLE`, `TEMPLATE_STORICO`, `TEMPLATE_DOTTED`, `TEMPLATE_ASL_CARTELLE`, `TEMPLATE_CERCA_DOCUMENTI`, `TEMPLATE_CHUNKED`, `CLASSE_D`, `CLASSE_D_PARENT`, `CLASSE_D_PARTNER`, `DIPART_E2E`, `CacheIsolationFixture`. [src/onlinetests/data/fixtures.ts, SharedTestDatabaseBuilder.ts]

### B8 — ~50 over-exported types `delete`

Exported but referenced only inside their own file: `BootstrapDeps`, `EMAIL_CHUNK_SIZE`, `RECIPE_PER_PROCESSO`, `Severita`, `StatisticheClasse`, `StatisticheIstituto`, `CarenzaRow`, `CarenzeReport`, `ReportCarenzeOptions`, `ASLReport`, `PostProcessAction`, `LogRegistrationMetadata`, `PersonMinVM`, `SubjectVmEvoluzione`, `BuildSubjectVmOptions`, `BuildContinuitaInput`, `PersonVmInput`, `PersonGroupDeclension`, `FindOrCreateOptions`, `CartellaResult`, `MateriaSlotGroup`, `ScopeFragment`, plus the full `*ResumeState` / `*Result` / `*Options` / `*Data` set. Also `TIPO_PIANO_LABELS`, `RELIGIONE_LABELS`, `TIPO_PROGETTO_LABELS` — exported but read only by their own one-line wrapper function in the same file.

### B9 — Deprecated aliases still shipping `delete`

```ts
/** @deprecated use getNomeCompleto(); kept for the vertical slice. */
cognomeNome(): string { return this.getNomeCompleto(); }
/** @deprecated use getNomeCompletoConAppellativo(); kept for the vertical slice. */
nomeConAppellativo(): string { return this.getNomeCompletoConAppellativo(); }
```

`nomeConAppellativo` has one `src/` reference: its own definition. [src/domain/entities/Docente.ts:66-74]

### B10 — Repeated CDU focus guard `shrink`

```ts
const focusAlunno = cdu.focus.alunno;
if (focusAlunno === undefined) return;
```

20 occurrences across 8 context-engine providers. [src/application/context-engine/providers/]

### B11 — O(n²) `unique` `stdlib`

```ts
return values.filter((value, index) => values.indexOf(value) === index);
```

[src/onlinetests/checks/contextEngineChecks.ts:158]

### B12 — Test-quality signal

| Loose pattern | Count |
|---|---|
| `expect(() => …).not.toThrow()` | 38 |
| `expect(x).toBeDefined()` | 28 |
| `expect(x.length).toBeGreaterThan(0)` | 21 |
| `expect.any(…)` | 16 |
| `expect(x).toBeTruthy()` | 4 |
| skipped tests | **0** |

**107 loose assertions, zero skips** — materially healthier than the library suite. Every test file contains at least one `expect`. Densest files: `test/unit/application/email-notification-service.test.ts` (10), `test/unit/onlinetests/e2e-sample-database-builder.test.ts` (8), `test/unit/onlinetests/e2e-template-provisioner.test.ts` (6), `test/unit/application/sheet-materie-generator.test.ts` (6 + 3 `not.toThrow`), `test/unit/application/pipelines/email-steps.test.ts` (5 + 2), `test/unit/onlinetests/storico-checks.test.ts` (4 `not.toThrow`).

### B13 — Checked and cleared

- `DocumentTableFacade` — real marker-scan / positional-insert / flush logic, not delegation. Keep.
- Five `GeneratorStrategy` implementations — genuine polymorphism driven by `CONF_DOC` rows. Keep.
- `ApplicationComposition` — 30+ call sites across integration and unit tests. Keep.
- Unused enum members (`ARCHIVIATO`, `ITS`, `IEFP`, `PROFESSIONALE`, `TECNICO`) — DB-domain values in a data-driven system, not dead flexibility. Keep.

---

## PART C — the change plan

Ordered by value per unit of diff.

### C1 — Harden loose assertions (1,048 sites across both repos)

Not a mechanical sweep. Three rules cover most sites; the remainder need a judgement call each.

**Rule 1 — `toBeDefined()` on a value with known shape → assert the shape.**

```ts
// before
expect(cdu.focus.alunno).toBeDefined();
// after
expect(cdu.focus.alunno).toEqual(
  expect.objectContaining({ anagrafica: expect.objectContaining({ cognome: 'Rossi' }) })
);
```

`toBeDefined()` fails only on literal `undefined`. It passes on `null`, `0`, `''`, `false`, `NaN`, and on any wrong-shaped object. Highest false-confidence ratio of the four patterns, and the most common (645 sites across both repos).

**Rule 2 — `not.toThrow()` → assert the effect the call was made for.**

```ts
// before
expect(() => registerStoricoChecks(suite, deps)).not.toThrow();
// after
registerStoricoChecks(suite, deps);
expect(suite.registered.map((c) => c.name)).toEqual([
  'storico.alunno.carenze', 'storico.classe.docenti', 'storico.documenti'
]);
```

A bare `not.toThrow()` on a registration function passes when the function registers **nothing**. All 38 ALDO sites and 167 GasLibraryFactory sites deserve this; ALDO's `test/unit/onlinetests/*Checks.test.ts` files hold 17 of the 38.

**Rule 3 — `toBeGreaterThan(0)` on a length → assert exact count and identities.**

```ts
// before
expect(righe.length).toBeGreaterThan(0);
// after
expect(righe.map((r) => r.studente)).toEqual(['a1@…', 'a2@…']);
```

Where the count is genuinely data-dependent, assert `toHaveLength(fixtureRows.length)` against the fixture rather than `> 0`.

**`expect.any(String)`** — substitute the actual value wherever the fixture determines it. Keep it only for real UUIDs and timestamps, and then assert format (`expect.stringMatching(/^LOG-\d{8}-/)`) rather than type.

Suggested order, highest leverage first:

1. ALDO `test/unit/onlinetests/*Checks.test.ts` — 17 `not.toThrow` + 15 other loose sites. These guard the online harness, whose failures otherwise cost a real GAS run to discover.
2. ALDO `email-notification-service.test.ts`, `email-steps.test.ts`, `sheet-materie-generator.test.ts` — 26 sites on the highest-risk domain paths.
3. GasLibraryFactory `GoogleApiWrapper` + `SheetDBLib` — most loose assertions, widest blast radius.
4. GasLibraryFactory remainder.

**The 9 skipped library tests are not hardenable — they need a decision.** The 7 `BatchRateLimiterIntegration` skips and the `DocumentProcessor` skip must either (a) run offline against the existing GAS mocks, (b) move under `__testOnline__/` where a real API exists, or (c) be deleted with an explicit note. Leaving them as `it.skip` in an offline suite is the only option that buys nothing. The `ExpressionEngineService` JSEP skip should become an assertion that array-index placeholders throw a recognisable error — pinning the limitation instead of hiding it.

**Risk:** low per site, meaningful in aggregate. A hardened assertion can expose a real latent bug and turn a green suite red. Commit one file at a time so every new failure is attributable.

---

### C2 — DRY: collapse the GasLibraryFactory utility stack

Largest DRY win in either repo (A1–A6).

**C2.1 — Flatten `SystemUtils`.** Delete the 50-method runtime binding loop. Replace `SystemQuotaManager` with a plain module of named exports; drop the 25 methods that only re-guard `es-toolkit`; keep the ~9 that earn it.

```js
// CoreUtilsLib/src/utils/collections.js  (replaces SystemQuotaManager.js, 380 → ~70 lines)
import { groupBy, keyBy, orderBy, uniqBy, differenceBy, maxBy, minBy, sumBy, meanBy }
  from 'es-toolkit/compat';

export const unique  = (a) => (Array.isArray(a) ? [...new Set(a)] : []);
export const compact = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);
export const flatten = (a, depth = 1) => (Array.isArray(a) ? a.flat(depth) : []);
export const clamp   = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

export { groupBy, keyBy, orderBy, uniqBy, differenceBy, maxBy, minBy, sumBy, meanBy };
```

`SystemUtils` becomes a static re-export surface: tree-shakeable, zero constructor cost. Fixes A1, A2 and A3 together.

**Compatibility:** `SystemUtils` is public API. Every removed method must first be confirmed unreferenced across ALDO and all 16 libraries, or stay as a re-export.

**C2.2 — One `parseDate`.** RoleResolutionLib imports CoreUtilsLib's; delete `RoleResolutionLib/src/internal/DateParsing.js`. Its test cases **stay** — they re-point at the shared function. If the two implementations differ on edge behaviour (Italian `dd/mm/yyyy` vs ISO), the RoleResolutionLib cases become the specification the merged function must satisfy. That is a hardening win, not a loss.

**C2.3 — One value-`isEmpty`.** Keep `LodashFacade`'s (the complete one). Delete `StringUtils.isEmpty` and both `ContentBlock.isEmpty(data)` copies. Leave the four zero-argument domain predicates alone.

**C2.4 — Rename `UtilitiesService.formatDate` → `formatDateNative`** so it stops colliding conceptually with `DateUtils.formatDate`.

**C2.5 — Drop the `My` prefix** on `MyDatabaseService` and `MyPlaceholderService`; keep an alias export for one release if any consumer imports the prefixed name.

---

### C3 — DRY: ALDO structural collapse

**C3.1 — 21 entity `*Data` interfaces → one type** (B2).

```ts
// src/domain/entities/RowData.ts
/** Flat sheet row as read by SheetDbAdapter. Column names are UPPERCASE per 01_SCHEMA_DATABASE.md. */
export type RowData = Record<string, unknown>;
```

Then `constructor(data: RowData = {})` and `static fromData(data: RowData)`. −273 lines, zero type safety lost.

*Alternative that gains safety instead of only deleting lines:* drop the index signature and keep the named props typed from the `COL_*` constants, making `new Docente({ WRONG_COL: 1 })` a compile error. Bigger diff, real benefit — and the schema is already centralised in `src/config/schema.ts`, so the inputs exist. My recommendation is this variant.

**C3.2 — 19 repository interfaces → concrete types** (B1). Replace `IAlunnoRepository` with `AlunnoRepository` at the 156 annotation sites, delete `src/domain/repositories/`. −302 lines.

*Caveat worth stating plainly:* this trades a Clean-Architecture boundary for 302 lines. The Domain layer would then name an Infrastructure type in provider and service constructors. If the boundary is kept on principle, skip this item — it is the one finding where the audit and the `SPECS_ALDO/` architecture decision genuinely disagree, and that decision was deliberate, not accidental. **Your call.**

**C3.3 — One string-ID value object** (B4).

```ts
// src/domain/value-objects/stringId.ts
export function stringId<N extends string>(name: N, pattern?: RegExp) {
  return class {
    private constructor(public readonly value: string) {}
    static of(raw: string) {
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (v.length === 0 || (pattern && !pattern.test(v)))
        throw new ValidationError(`${name} non valido: "${raw}"`);
      return new this(v);
    }
    equals(other: { value: string }) { return this.value === other.value; }
  };
}
export class ClasseId extends stringId('ClasseId') {}
export class IndirizzoId extends stringId('IndirizzoId') {}
export class DipartimentoId extends stringId('DipartimentoId') {}
export class MateriaId extends stringId('MateriaId', /^[A-Z]{2,10}$/) {}
```

Note a behaviour change: `MateriaId` currently does **not** trim before testing its regex, so `" ITA "` is rejected today and would pass under the factory. Either keep a no-trim flag or accept the change deliberately — the existing `MateriaId` tests will say which. −40 lines.

**C3.4 — `ProcessMonitorFacade` → type alias** (B3). All nine methods are pass-through and the library service already owns native-global contact. Replace the class with `export type IProcessMonitor = ProcessMonitorService` and inject the library service directly. `FakeProcessMonitor` keeps working — it structurally satisfies the same shape. −52 lines.

**C3.5 — Shared CDU focus guard** (B10). Add to `techEntities.ts`:

```ts
export function withFocusAlunno(cdu: Cdu, fn: (a: CduAlunnoFocus) => void): void {
  if (cdu.focus.alunno !== undefined) fn(cdu.focus.alunno);
}
```

−30 lines, and it removes an easy-to-forget guard from every future provider.

**C3.6 — Dead and over-exported symbols** (B7, B8, B9). Delete the 20 dead fixture constants; drop `export` from the ~50 internal-only types and the three `*_LABELS` maps; delete `Docente.cognomeNome()` and `nomeConAppellativo()` after updating the single test reference. Mechanical, ~−120 lines.

**C3.7 — `Specification` base** (B5). Drop `extends Specification` and the 22-line comment explaining the `TS2506` workaround; keep a plain abstract class with `isSatisfiedBy` + `toQueryObject`. The alias-on-export dance disappears with it. −25 lines.

---

### C4 — Performance

**C4.1 — Batch the online-test seeding. Biggest measurable win in the workspace.**

`GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js:59-72` — `appendRow` costs, **per row**:

```js
const sheet = this.spreadsheet.getSheetByName(sheetName);  // round-trip
sheet.appendRow(values);                                    // round-trip
SpreadsheetApp.flush();                                     // forced commit
```

ALDO calls it from **104 static sites** — `src/onlinetests/SampleDatabaseBuilder.ts` 17, `src/onlinetests/data/SharedTestDatabaseBuilder.ts` 49, `src/onlinetests/data/Seeders.ts` 38 — several inside loops, so the real per-run row count is in the hundreds, each paying three round-trips plus a flush.

Add a batched sibling to the library:

```js
/**
 * Appends many rows in one setValues call, with a single flush at the end.
 * @param {string} sheetName
 * @param {Array<Object<string,*>>} rows Values keyed by header name.
 */
appendRows(sheetName, rows) {
  if (rows.length === 0) return;
  const sheet = this.spreadsheet.getSheetByName(sheetName);
  if (sheet === null) throw new Error(`Sheet "${sheetName}" not found …`);
  const headerRow = this._headersBySheet.get(sheetName) || [];
  const values = rows.map((row) =>
    headerRow.map((h) => (row[String(h)] !== undefined ? row[String(h)] : ''))
  );
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headerRow.length).setValues(values);
  SpreadsheetApp.flush();
}
```

Then widen `ISampleSpreadsheet` [src/onlinetests/SampleDatabaseBuilder.ts:29] with `appendRows`, and convert the 104 call sites to accumulate per table and flush once. Effect: hundreds of round-trips collapse to roughly one per table, and one `flush()` per table instead of per row. Against the 6-minute GAS execution cap this is the difference between an online run that finishes and one that does not.

`appendRow` stays — the four `RecordingSpreadsheet` fakes in `test/unit/onlinetests/` implement it and those tests stay. They gain an `appendRows` recorder.

**C4.2 — `SystemUtils` constructor cost** (A2). 50 `.bind()` closures per instantiation plus a non-shakeable 50-method surface in every bundle that imports it. Fixed for free by C2.1.

**C4.3 — `StoricoDocentiService.perDocente` N+1.** [src/application/storico/StoricoDocentiService.ts:30]

```ts
for (const classe of classi.findAll()) {
  for (const m of classi.getMaterieDelDocente(classe, docenteEmail)) { … }
}
```

Runs `getMaterieDelDocente` once per class per historic year, each call re-parsing that class's cattedra CSV — roughly 180 parses at 60 classes × 3 years to answer one teacher's question. Build a `docente → [{classe, materia}]` index once per year inside the `anniStorici` loop, then look up. The file's own comment already flags the shape ("small, stable tables; acceptable at the school scale ALDO targets"), so this is **optional** — worth doing only if the storico path is user-facing and measurably slow. Measure first.

**C4.4 — O(n²) `unique`** (B11). `[...new Set(values)]`. One line, and it disappears entirely once C2.1 exposes a shared `unique`.

**C4.5 — Verified clean.** No per-row `getRange` / `setValues` anywhere in the 16 libraries' data paths. The Sheets batching discipline is sound; C4.1 is a gap in the *test* framework only.

---

## Execution order

Each step independently shippable and verifiable.

| # | Work | Repo | Δ lines | Risk |
|---|---|---|---|---|
| 1 | C3.6 dead + over-exported symbols | ALDO | −120 | none |
| 2 | C4.4 `unique` → `Set` | ALDO | −1 | none |
| 3 | C3.1 `*Data` → `RowData` | ALDO | −273 | low |
| 4 | C3.3 `stringId` factory | ALDO | −40 | low (trim change on `MateriaId`) |
| 5 | C3.7 `Specification` base | ALDO | −25 | low |
| 6 | C3.4 `ProcessMonitorFacade` | ALDO | −52 | low |
| 7 | C3.5 focus-guard helper | ALDO | −30 | none |
| 8 | A7 + A8 dead exports, mocks, `My` prefix | GLF | −250 | none |
| 9 | **C4.1 `appendRows` batching** | GLF + ALDO | +40 / −60 | medium — needs an online run to prove |
| 10 | C2.1–C2.5 utility-stack collapse | GLF | −550 | medium — public API surface |
| 11 | C1 harden assertions, tranche by tranche | both | ~+1,100 rewritten | medium — will surface real bugs |
| 12 | C3.2 repository interfaces | ALDO | −302 | **decision required** (architecture) |

Net: **−1,400 lines deleted, ~1,100 lines rewritten**, 0 dependencies removed (none are removable).

Steps 1–8 and 11 can start immediately. Steps 9, 10 and 12 are gated on the questions below.

## Verification per step

- After each ALDO step: `npm run typecheck && npm run lint && npm test` (1,641 unit) `&& npm run test:integration && npm run test:build`.
- After each GasLibraryFactory step: that library's jest projects, then `npm run refresh:vendor && npm run verify:vendor` in ALDO, then ALDO's full offline suite. A library change is not done until ALDO is green against the rebuilt vendor bundle.
- Step 9 additionally needs one real `npm run push:online` cycle with before/after wall-clock, since round-trip count is the entire point.
- Step 11: expect red. Every new failure is either a hardened assertion catching a real defect — fix the code — or an over-tight assertion — loosen to the true contract, never back to `toBeDefined()`.

## Open questions

1. **C2.1** — may `CoreUtilsLib.SystemUtils`' public surface change? Removing unused methods is breaking for any consumer outside this workspace.
2. **C4.1** — extend `GasOnlineTestFramework.SampleSpreadsheetBuilder` with `appendRows`? The alternative reimplements library behaviour inside `src/`, which the GasLibraryFactory-first rule forbids.
3. **C3.1** — delete the `*Data` interfaces, or take the bigger diff and make them genuinely type-safe by dropping the index signature?
4. **C3.2** — keep the 19 repository interfaces as a deliberate Clean-Architecture boundary, or cut them?
5. **A9 / C1** — the 7 `BatchRateLimiterIntegration` and 1 `DocumentProcessor` skips: implement offline, move to `__testOnline__/`, or delete with a note?
