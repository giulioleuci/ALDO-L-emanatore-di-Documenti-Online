# Audit remediation — design

Date: 2026-08-25. Base commit: `3632e9c`.

Consolidates the decisions taken over `AUDIT_PONYTAIL_ELABORATE.md` (over-engineering,
duplication, dead code, cost) and `AUDIT_SPECIFICATIONS_GLF.md` (domain specification
contract and what to contribute to `DomainRepositoryLib`).

Both repos are in scope. Correctness bugs and security holes remain out of scope —
they belong to a separate review pass — except where a hardened assertion surfaces one,
in which case the underlying code is fixed rather than the assertion loosened.

---

## 1. Decisions taken

| Item | Decision |
|---|---|
| GasLibraryFactory | In scope, additions and removals both |
| `SystemUtils` public surface | All 50 names stay; the bind loop and the 25 re-guard wrappers go |
| 19 repository interfaces (C3.2) | **Kept** — deliberate Clean-Architecture boundary |
| 21 entity `*Data` interfaces (C3.1) | 3 collapse (dynamic columns), 18 become genuinely type-safe |
| Assertion hardening (C1) | All 1,048 sites, both repos |
| 9 skipped GLF tests (A9) | Differentiated treatment, none left as `it.skip` |
| `appendRows` batching (C4.1) | Yes, plus one real online run to measure |
| Specification contributions | Options 1, 5, 3, 2 — all four, in that order |
| ALDO `Specification` base (C3.7) | **Keeps** `extends`, because option 1 makes the inheritance useful |
| User-owned sheet columns | New `_` prefix convention |

## 2. Out of scope

- `FiltriSorgente.ts` (262 lines) stays in ALDO — `CONF_MAIL.DATI_SORGENTE.filtri` is SGSA vocabulary.
- The 11 in-memory specifications (Family 3) stay in ALDO — school-domain conditions.
- Option 4 of the specification audit (generic `Specification<T>` in GLF) — rejected: GLF is
  JavaScript, the generic exists only for TypeScript consumers, and it would reproduce the
  `TS2506` self-referential-base problem in an ambient declaration.
- C4.3 (`StoricoDocentiService.perDocente` N+1) is included but stays last within its
  workstream and is measured before being optimised.
- The MATERIE × INDIRIZZI feature (see §8) — separate round, separate spec.

---

## 3. Facts established during design

These were verified against code and real data, and correct or extend the two audits:

1. **`FieldSpecification` contract mismatch.** `GasLibraryFactory/DomainRepositoryLib/src/specifications/FieldSpecification.js`
   has no `toQueryObject`, but ALDO's ambient `types/gaslibs/index.d.ts:1123` declares one.
   The ambient file is ahead of the implementation. Must be reconciled inside option 1,
   before touching the base class.

2. **MATERIE has no dynamic columns today.** All three converted workbooks carry the same
   fixed 11-column header; `SharedTestHeaders.ts:42` uses `Object.values(COL_MATERIE)`; the
   spec calls it a stable lookup table. The indirizzo relationship lives in the `ESAME_CFG`
   JSON. `MateriaData` is collapsed anyway, in anticipation of §8 — that is a deliberate
   forward-looking choice, not a description of today's schema.

3. **Extra sheet columns are preserved on write.** `TableService.js:96` sets
   `this.columns = this._loadHeader()` — the real sheet header, never a declared schema list.
   `TableDataModifier.js:130` merges `{ ...originalRow, ...validatedRow }`, and the flush
   writes `physicalColumns` derived from that same header. A column ALDO does not know about
   survives every update. This is what makes §7 safe.

4. **Dynamic-column consumers are catalogue-driven, not header-driven.**
   `ClasseRepository.ts:62-70` and `CarenzaRepository.ts:35` build their materia column maps
   from the MATERIE catalogue. The one `Object.keys(row)` scan (`ClasseRepository.ts:142`) is
   restricted to columns starting with a known materia prefix. Only `isGhostRecord`
   (`ImportRecipeMapper.ts:146-155`) enumerates every key unconditionally.

5. **Hydration boundary cost of C3.1.** Dropping the index signature makes `Row`
   (`Record<string, unknown>`) no longer assignable to the narrowed `*Data` types —
   `unknown` is not assignable to `string | undefined`. Each entity's `fromData` needs one
   explicit narrowing. The audit did not mention this; it is the real cost of the item.

---

## 4. Workstreams

Hardening moves partly to the front. The audit put C1 last; the two high-value ALDO tranches
run first instead, because refactoring 21 entities and 5 value objects against assertions that
pass on any non-crashing output is how a regression goes unnoticed.

### W0 — ALDO assertion hardening, high-value tranches

58 sites:

- `test/unit/onlinetests/*Checks.test.ts` — 17 `not.toThrow` + 15 other loose sites. These
  guard the online harness, whose failures otherwise cost a real GAS run to discover.
- `email-notification-service.test.ts`, `email-steps.test.ts`, `sheet-materie-generator.test.ts`
  — 26 sites on the highest-risk domain paths.

Three rules:

- `toBeDefined()` on a value with known shape → assert the shape. It passes on `null`, `0`,
  `''`, `false`, `NaN` and on any wrong-shaped object.
- `not.toThrow()` → call directly and assert the effect. A bare `not.toThrow()` on a
  registration function passes when the function registers nothing.
- `toBeGreaterThan(0)` on a length → assert exact count and identities, or
  `toHaveLength(fixtureRows.length)` against the fixture when the count is data-dependent.
- `expect.any(...)` → substitute the fixture-determined value; keep it only for real UUIDs and
  timestamps, and then assert format (`expect.stringMatching(/^LOG-\d{8}-/)`).

No test is deleted. No assertion is ever loosened back to `toBeDefined()`.

### W1 — ALDO structural cleanup

Ordered by ascending risk:

1. **C3.6 — dead and over-exported symbols.** Delete the 20 dead fixture constants
   (`src/onlinetests/data/fixtures.ts`, `SharedTestDatabaseBuilder.ts`); drop `export` from the
   ~50 internal-only types and the three `*_LABELS` maps; delete `Docente.cognomeNome()` and
   `nomeConAppellativo()` (`src/domain/entities/Docente.ts:66-74`) after updating the single
   test reference. ~−120 lines.
2. **C4.4 — `unique` → `[...new Set(values)]`** at `src/onlinetests/checks/contextEngineChecks.ts:158`.
3. **C3.1 — entity `*Data`.** `ClasseData`, `CarenzaData` and `MateriaData` collapse to an open
   type whose fixed columns are documented in a comment. The other 18 lose the
   `[key: string]: unknown` index signature and keep their named props typed from the `COL_*`
   constants, so `new Docente({ WRONG_COL: 1 })` becomes a compile error. Each `fromData` gains
   one explicit narrowing at the hydration boundary (§3.5).
4. **C3.3 — `stringId` factory** for the five byte-identical ID value objects. `MateriaId`
   currently does not trim before testing its regex, so `" ITA "` is rejected today and would
   pass under a naive factory. Read the existing `MateriaId` tests first: if they pin the
   no-trim behaviour, the factory takes a flag; otherwise accept the change and state it in the
   commit message. ~−40 lines.
5. **C3.4 — `ProcessMonitorFacade`.** Nine pass-through methods touching no native GAS global,
   so it satisfies no ESLint fence. Delete it, inject the library `ProcessMonitorService`
   directly. `FakeProcessMonitor` keeps working — it structurally satisfies the same shape.
   −52 lines.
6. **C3.5 — `withFocusAlunno` helper** in `techEntities.ts`, replacing the guard repeated
   20 times across 8 context-engine providers. −30 lines.

C3.7 (the ALDO `Specification` base) is **not** here: it depends on option 1 and lands in W3.

### W2 — GasLibraryFactory hygiene

- **A4 — one `parseDate`.** Delete `RoleResolutionLib/src/internal/DateParsing.js:19`;
  RoleResolutionLib (L3) already depends on CoreUtilsLib (L0). Its test cases stay and
  re-point at `CoreUtilsLib/src/utils/DateUtils.js:63`. If the two differ on edge behaviour
  (Italian `dd/mm/yyyy` vs ISO), the RoleResolutionLib cases become the specification the
  merged function must satisfy.
- **A5 — rename `UtilitiesService.formatDate` → `formatDateNative`**
  (`GoogleApiWrapper/src/services/UtilitiesService.js:160`). It is the sanctioned native-global
  site and survives, but under a name that stops it reading as `DateUtils.formatDate`.
- **A6 — one value `isEmpty`.** Keep `LodashFacade`'s (the complete one, handles Map/Set/object).
  Delete `StringUtils.isEmpty` and both `ContentBlock.isEmpty(data)` copies (`:80` and `:254`,
  two copies in one file). The four zero-argument domain predicates
  (`PostProcessorChain`, `BlockDataContext`, `DelegationChain`, `RoutingResult`) are unrelated
  and stay.
- **A7 — dead exports.** `validateInterfaceShape`, `getColumnTypes`, and the 8 never-instantiated
  mock classes. These are test doubles, not tests: removing them costs no coverage.
- **A8 — drop the `My` prefix** on `MyDatabaseService` and `MyPlaceholderService`; keep the
  alias export for one release.
- **C2.1 — flatten `SystemUtils`.** Delete the 50-method runtime bind loop
  (`SystemUtils.js:82-90`) and the 25 `SystemQuotaManager` methods that only re-add an
  `Array.isArray` guard around an `es-toolkit` call the layer below already guards.
  `SystemQuotaManager` (misnamed: it manages no quota) becomes a plain module of named exports.
  **All 50 public names stay available** as a static re-export surface: same surface for
  consumers, zero construction cost, tree-shaking recovered — which matters because bundle size
  is a real budget on GAS.

### W3 — Specification contributions to DomainRepositoryLib

Order: 1 → 5 → 3 → 2. Option 3 before option 2 because the invariant guard is the safety net
that makes migrating 16 specs to a shared base verifiable rather than a reading exercise.

**Option 1 — declare `toQueryObject` on the base.** The contract already lives in
`QueryTranslator.js` (its JSDoc even names ALDO) but not in `Specification.js`. Add it with a
`null` default and the invariant written down: *when it returns a non-null object, the filter
must be exactly equivalent to `isSatisfiedBy()`, because `Repository.find()` applies only one
of the two.* Make `canBeTranslatedToQuery` answer statically instead of by attempt, and have
`QueryTranslator` call `toQueryObject()` once instead of five times per `find()`.

Fixes trap 2 (5 calls per find) and trap 3 (the 11 in-memory specs each throw and catch an
exception on every call, purely to discover a statically-known fact — costing stack capture and
deoptimisation of the calling function on V8, and flooding any debugger set to break on all
exceptions).

Must verify, not assume: existing GLF specs (`FieldSpecification`, `CompositeSpecification`,
`ExpressionSpecification`) inherit the `null` default and must keep reaching the `toQuery`
branch. Reconcile the ambient/implementation mismatch of §3.1 first.

**Option 5 — take, do not give.** `FunctionSpecification.js` already exists in GLF and is
already declared in ALDO's ambient `types/gaslibs/index.d.ts:1125`, yet `FiltriSorgente.ts`
rewrote it locally as `PredicateSpecification`. If it covers the case, delete the local copy
(−12 lines). If it does not — most likely because of the generic typing — that is CLAUDE.md
rule 3: ask before keeping a local duplicate.

**Option 3 — `assertSpecificationContract`** in `DomainRepositoryLib/src/testing/`. Given a
spec, representative raw rows and a hydrate function, it asserts that the equality filter selects
exactly the rows `isSatisfiedBy` accepts. It is the only item that addresses trap 1 in general:
today nothing checks that the two halves agree, and `RuoliPerDocenteSpec` already diverges —
`DOCENTE` is a CSV, `isSatisfiedBy` does containment, `toQueryObject` produces exact equality,
so a row `"a@x.it,b@x.it"` would not match `"a@x.it"`. It does not explode only because
`findByDocente` hand-bypasses the pushdown; the next caller writing `this.find(spec)` steps on it.

**The guard is worth only what its rows are worth.** With positive rows only, both halves agree
and the test passes vacuously. Commitment: every pushdown spec gets at least one row it does
*not* satisfy, plus the edge cases that matter — multi-value CSV cells, string-vs-number cells.
`rows: []` is a review failure.

`AlunniAttiviSpec` is the twin case to fix under this guard: it is typed `Specification<RowLike>`
and its `isSatisfiedBy` reads a raw row, but `find()` hydrates entities. It works today only
because `toQueryObject` is non-null, so `isSatisfiedBy` is never called. The day `ATTIVO` stops
being pushdownable, it returns `false` for everything and `getAlunniAttivi` silently returns empty.

**Option 2 — `EqualityFieldSpec` base** for the 16 Family-1 specs (and the 5 Family-2 specs,
which work the same: `super(COL_DOCENTI.ITP, (d) => d.isITP(), true)`). One `expected` used by
both halves, so divergence becomes structurally impossible. ALDO −100 lines, GLF +35.

Two constraints: the generic signature must be maintained in ALDO's ambient `.d.ts` (a second
source of truth, a known but real cost), and the ALDO classes stay **named shells**, never
anonymous factory products — `QueryTranslator` logs specifications by constructor name.

**C3.7 — ALDO's `Specification` base**, the ALDO-side companion to option 1, done right after it.
With the GLF base supplying a `toQueryObject()` default of `null` and a throw-free
`canBeTranslatedToQuery`, `extends` earns its place and stays. The 22-line comment in
`src/domain/specifications/Specification.ts` shrinks to what stays true — the `TS2506` workaround
and the bivariance note — since it no longer has to justify an unused inheritance. The 11
in-memory ALDO specs stop writing `toQueryObject(): null { return null; }` by hand.

### W4 — `appendRows` batching

`GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js:59-72` costs, per row:
`getSheetByName` (round-trip) + `appendRow` (round-trip) + `SpreadsheetApp.flush()` (forced
commit). ALDO calls it from 104 static sites — `SampleDatabaseBuilder.ts` 17,
`SharedTestDatabaseBuilder.ts` 49, `Seeders.ts` 38 — several inside loops, so a real run is
hundreds of rows each paying three round-trips.

Add `appendRows(sheetName, rows)` to the library: one `setValues` for the whole block, one
`flush` at the end. Widen `ISampleSpreadsheet` (`src/onlinetests/SampleDatabaseBuilder.ts:29`),
then convert the call sites to accumulate per table and flush once. `appendRow` stays — the four
`RecordingSpreadsheet` fakes implement it and their tests stay; they gain an `appendRows` recorder.

Against the 6-minute GAS cap this is the difference between an online run that finishes and one
that does not — which is why it is the one item whose payoff cannot be demonstrated offline.

### W5 — remaining assertion hardening

The other 49 ALDO sites, then the 941 GLF sites in order of blast radius: `GoogleApiWrapper` and
`SheetDBLib` first, the remaining 14 libraries after.

Plus the 9 skipped tests, differentiated:

- The 7 `BatchRateLimiterIntegration` skips run offline against the existing GAS mocks — the rate
  limiter is logic, not API.
- The `DocumentProcessorIntegration` skip moves under `__testOnline__/` where a real API exists.
- The `ExpressionEngineService` JSEP skip becomes an assertion that array-index placeholders throw
  a recognisable error, pinning the limitation instead of hiding it.

---

## 5. Execution order and vendor cycles

```
W0 (ALDO)  →  W1 (ALDO)  →  ┌ W2 (GLF)  ┐
                            │ W3 (GLF)  ├→ one refresh:vendor → ALDO offline suite → online run (W4)
                            └ W4 (GLF)  ┘
                                                              →  W5 (both)
```

A library change is not done until ALDO is green against the rebuilt vendor bundle. W2, W3 and
W4 all touch GasLibraryFactory, so they share **one** `refresh:vendor && verify:vendor` cycle
instead of paying it three times. C3.7 is the only ALDO item with a cross-repo dependency — it
needs option 1 in the vendor bundle first, so it lives at the end of W3, not in W1.

## 6. Verification

- After each ALDO step: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`.
- After each GasLibraryFactory step: that library's jest projects. Then, once per GLF block:
  `npm run refresh:vendor && npm run verify:vendor` in ALDO, then ALDO's full offline suite.
- W4 additionally needs one real `npm run push:online` cycle with before/after wall-clock, since
  round-trip count is the entire point.
- W0 and W5: expect red. Every new failure is either a hardened assertion catching a real defect
  — fix the code — or an over-tight assertion — loosen to the true contract, never back to
  `toBeDefined()`. One file per commit, so every new failure is attributable.

## 7. User-owned sheet columns: the `_` prefix

Columns whose name starts with `_` are reserved for the user's own notes and calculations. ALDO
reads them, preserves them on write (§3.3), and never interprets them.

The namespace is free: no column in any of the three converted workbooks starts with `_`. ALDO's
own synthetic virtual column is `__PK` (`SheetDbAdapter.ts:11`), which is created in memory and
removed by `stripVirtual` — it never exists on the sheet, so a rule of "ignore anything starting
with `_`" covers it harmlessly.

Two changes in this round:

1. `SPECS_ALDO/01_SCHEMA_DATABASE.md` gains a paragraph stating the convention.
2. `isGhostRecord` (`ImportRecipeMapper.ts:146-155`) excludes `_`-prefixed columns. It is the only
   place enumerating every key unconditionally: without the filter, a note in `_NOTE` on an
   otherwise-empty row would stop that row being discarded as a ghost during import.

The convention does not affect C3.1 — no ALDO code names a `_` column, so no type needs to model it.

## 8. Deferred: MATERIE × INDIRIZZI consistency analysis

A later round, with its own spec. MATERIE gains dynamic columns named by INDIRIZZI ID, holding a
CSV of the course years in which that subject is compulsory for that indirizzo (e.g.
`ITA | LC = "1,2,3,4,5"`). A dedicated function then checks the database for consistency against
the CLASSI assignment matrix.

Carried forward from this design:

- `MateriaData` is already collapsed to an open type by C3.1, so no entity change will be needed.
- The consistency function must skip `_`-prefixed columns rather than reporting them as anomalies.
- `01_SCHEMA_DATABASE.md:124` currently describes MATERIE as a stable lookup table; it will need
  updating when the feature lands, not before.

## 9. Expected size

| Workstream | Δ ALDO | Δ GLF | Risk |
|---|---|---|---|
| W0 | 58 sites rewritten | — | medium: will surface real defects |
| W1 | ~−520 | — | low; `MateriaId` trim is the one behaviour change |
| W2 | — | ~−450 | medium: public surface, mitigated by keeping all names |
| W3 | −132 | +100 | low for options 1/5, medium for option 2 (ambient types) |
| W4 | −60 | +40 | medium: only provable by a real online run |
| W5 | 49 sites + 9 skips | 941 sites | medium: expect red, one file per commit |
