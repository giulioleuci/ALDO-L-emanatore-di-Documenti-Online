# AUDIT_NEW_FEAT — Consolidated Feature Audit for an Implementation Plan

This document consolidates three independent audits into a single source of
truth for a superpowers **writing-plans** session. Each audit is self-contained;
each ends with a recommended implementation approach. The resulting plan should
treat the three features as separate workstreams (they touch disjoint code
paths), potentially implemented in any order.

---

## Part 1 — DB validation must ignore completely empty rows

### 1.1 Problem

The database validation functions must ignore completely empty rows (rows that
contain no record), because they do not need to be validated. This describes
**where** the problem lives, **why** it can manifest, and **how** to fix it.

> This audit proposes analysis only — it modifies no code.

### 1.2 Functions involved (ALDO `src/`)

| Function | File | Role |
|----------|------|------|
| `DatabaseValidationService.esegui()` | `src/application/services/DatabaseValidationService.ts:48` | Orchestrates validation: reads datasets, invokes the rule engine, generates the report |
| `DatabaseValidationService.leggiTabelle()` | `src/application/services/DatabaseValidationService.ts:78` | Reads each table's rows via `db.table(t).findAll()` |
| `regoleValidazione()` | `src/config/validationRules.ts:87` | Defines the validation rules |
| `SheetTableAdapter.findAll()` | `src/infrastructure/db/SheetDbAdapter.ts:89` | Bridge to the library (`getAllRows`) |

### 1.3 Functions involved (GasLibraryFactory)

| Function | File | Role |
|----------|------|------|
| `TableService.getAllRows()` / `getRows()` | `SheetDBLib/src/TableService.js:897 / 640` | Returns rows read from the sheet |
| `TableService._processRawData()` | `SheetDBLib/src/TableService.js:953` | Converts the sheet 2D matrix into row objects, **skipping empty rows** |
| `DatasetValidator.validate()` | `GasSchemaValidatorLib/src/DatasetValidator.js:44` | Declarative rules engine; **never checks whether a row is entirely empty** |
| `DatasetValidator._required/_enum/_json/_foreignKey/_rowPredicate` | `DatasetValidator.js:112-224` | The individual rules; each iterates **all** rows without filtering the empty ones |

### 1.4 The problem in detail

**1. The empty-row filter exists ONLY in read, and is fragile.**

The only place completely empty rows are discarded is `_processRawData` in
`TableService.js:962-966`:

```js
// Skip completely empty rows
if (!data[i] || data[i].every((cell) => cell === '' || cell === null || cell === undefined)) {
  continue;
}
```

The check requires **every cell** to be exactly `''`, `null`, or `undefined`. It
has two limits:

- **Whitespace-only:** a cell of only spaces (`' '`) is NOT `=== ''`, so a row of
  `' '` cells is **not skipped** and reaches the validator.
- **Non-`''` empty cells:** any "empty" representation different from the exact
  empty string (e.g. `' '`, `'\t'`, API values in a different format) breaks the
  filter.

**2. The `DatasetValidator` engine has no safeguard of its own.**

No `DatasetValidator` method (`_required`, `_enum`, `_json`, `_foreignKey`,
`_rowPredicate`, `_columnName`) checks whether the current row is entirely empty.
Consequence: **if an empty row reaches the validator, every rule flags it**,
producing garbage violations:

- `_required` → `Campo obbligatorio vuoto: EMAIL` on a row that does not exist.
- `_foreignKey` / `FK_CLASSI_CATTEDRE` / `ITP_CLASSI` / `CURRICULUM_COVERAGE`
  (all `rowPredicate`) → iterate the empty row and produce false hits.

The filter currently "saves" the engine, but it is a **fragile filter in the
wrong place** (upstream, at read) rather than a guarantee at the validation
boundary.

**3. Mismatched dual responsibility ("GasLibraryFactory-first").**

Per project rules, reusable logic belongs in `GasLibraryFactory`, not ALDO. The
decision on where to add the guard must pass through an explicit evaluation:

- Robustness "a fully empty row must not be validated" is **generic** (any
  sheet-based dataset) → belongs in `DatasetValidator` in GLF.
- The whitespace-only case can be seen as an extension of `SheetDBLib`'s read
  filter **or** as a guard inside `DatasetValidator`.

### 1.5 Recommended fix — guard in `DatasetValidator` (GLF, gaslibs-first)

Add, at the top of `validate()` (or as a helper reused by every `_rule`), an
empty-row check based on `cellToString`, more robust than the raw `=== ''`
check:

```js
// helper
function rowIsEmpty(row) {
  const values = Object.values(row);
  if (values.length === 0) return true;
  return values.every((v) => cellToString(v) === '');
}
```

Then, in `validate()`, filter empty rows **before** iterating:

```js
const nonEmptyRows = Array.isArray(rows)
  ? rows.filter((r) => !rowIsEmpty(r))
  : rows;
```

This:

- covers whitespace-only (thanks to `cellToString`, which does `.trim()`),
- makes validation immune to any empty row that escapes reading,
- is **drop-in inside the engine**: no signature change for callers.

### 1.6 Complementary fix — harden the read filter in `SheetDBLib`

To also close the upstream hole in `_processRawData` (`TableService.js:964`),
normalize the comparison:

```js
// before:
if (!data[i] || data[i].every((c) => c === '' || c === null || c === undefined)) continue;
// after:
if (!data[i] || data[i].every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
```

This prevents whitespace-only rows from ever being materialized, benefiting
**all** `getRows()` consumers, not just validation.

### 1.7 What NOT to do

- Do not add per-row smoke tests to every single rule (repetition).
- Do not rewrite validation in ALDO: the guard belongs in GLF
  (`DatasetValidator`), per the GasLibraryFactory-first principle.

### 1.8 Impact

- **Empty rows = no spurious violations.** The `Validazione DB` report will only
  report real problems.
- **No signature changes** to public functions (`validate`, `getRows`,
  `findAll`) → no impact on existing consumers.
- The `v.rowIndex + 2` line in `DatabaseValidationService.ts:59` stays correct:
  if empty rows are excluded before numbering, the physical index stays aligned
  with the sheet (header = row 1).

### 1.9 Summary

| Problem | Where | Fix |
|----------|------|-----|
| The only empty-row filter is at read and is fragile (does not handle whitespace) | `SheetDBLib/src/TableService.js:964` | Normalize the comparison with `.trim()` |
| The validation engine does not ignore empty rows that reach it | `GasSchemaValidatorLib/src/DatasetValidator.js:44-62` | Filter empty rows in `validate()` with `cellToString` |
| No change needed in ALDO | `DatabaseValidationService.ts` | — |

**Proposal:** apply **both** options (guard in `DatasetValidator` + robustness in
`_processRawData`), so validation is correct even if a blank row gets past the
read filter.

---

## Part 2 — `DOCENTI.ORE_POT` column in the "cattedre" email box

### 2.1 Objective

Add to the `DOCENTI` table the **`ORE_POT`** (Integer) column, holding the
teacher's weekly tutoring/strengthening hours. The value must appear in the
"cattedre" email box as the **last item of the bulleted list**, in the form:

> `Ore di potenziamento: [N] ora` (when `N = 1`)

> `Ore di potenziamento: [N] ore` (when `N ≠ 1`)

**Visibility rule:** the item is inserted **only if `ORE_POT > 0`**; if the value
is 0 or absent the item does **not** appear (the list stays unchanged).

### 2.2 Current state (reconnaissance)

- `DOCENTI` today has 6 columns: `EMAIL, COGNOME, NOME, GENERE, DIPART, ITP`
  (`SPECS_ALDO/01_SCHEMA_DATABASE.md` rows 92–99; `src/config/schema.ts`
  `COL_DOCENTI` rows 149–156).
- The concept of "tutoring/strengthening hours" **does not exist** anywhere in
  the workspace (neither ALDO nor `GasLibraryFactory`): grep for "potenziamento"
  → 0 matches.
- The "cattedre" box is rendered by `renderCattedreBox` in
  `src/application/email/boxes.ts` (rows 325–339): a `<ul>` with one `<li>` per
  class-chair (`<strong>{classe}</strong> — {materie}`).
- The box is registered in `createBoxComposer` (boxes.ts rows 420–425): it reads
  `destinatario.cattedre.elenco` (`CattedraVM[]`, empty ⇒ box hidden).
- Data construction happens in `BuildCDUStep.buildCattedre`
  (`src/application/pipelines/emailSteps.ts` rows 318–367) and the result is
  mounted on `destinatario.cattedre` in `buildDestinatario` (rows 217–267).
- `CattedraVM` (`src/application/context-engine/Cdu.ts` rows 420–428) has no
  "hours" field.
- The teacher (`Docente`, `src/domain/entities/Docente.ts`) is already hydrated
  in `buildDestinatario` (`docente` at row 218 of emailSteps.ts).

### 2.3 Feasibility

**YES, it is possible**, with contained impact. The value is an attribute of the
**teacher** (not of a single chair), but the required output is an extra item at
the end of the box's bulleted list: it must be propagated from `DOCENTI` down to
`renderCattedreBox`.

Architectural constraint (AGENTS.md): for **ora/ore** pluralization do NOT write
custom logic: the **`PluralizeFilter`** of `WorkspaceTemplateEngine`
(`GasLibraryFactory/DOCS_LIBS/WorkspaceTemplateEngine.md` rows 1092–1119),
method `execute(number, singular, plural)` — use that one, or verify with the
user whether the email box must go through the template engine (see §2.5
approach B).

### 2.4 Necessary changes (approach A — recommended, minimal)

Complete chain, from DB to rendering:

1. **Spec** — `SPECS_ALDO/01_SCHEMA_DATABASE.md` (DOCENTI, rows 92–99): add a
   column row `ORE_POT` | Integer | — | — | integer `>= 0`, default 0 |
   "Weekly tutoring hours".

2. **Code schema** — `src/config/schema.ts` (`COL_DOCENTI`): add
   `ORE_POT: 'ORE_POT'`. The physical table header is then generated from
   `Object.values(COL_DOCENTI)` in the E2E/online builders
   (`SharedTestHeaders.ts`, `SampleDatabaseBuilder.ts`), so it updates itself.

3. **Domain entity** — `src/domain/entities/Docente.ts`:
   - `DocenteData`: add `[COL_DOCENTI.ORE_POT]?: number;`
   - constructor: `this.orePot = Number(data[COL_DOCENTI.ORE_POT]) || 0;`
   - public getter `getOrePot(): number` (or public field).
   - `toData()`: include `[COL_DOCENTI.ORE_POT]: this.orePot`.
   Hydration already happens via `Docente.fromData` everywhere
   (`DocenteRepository`, `ClasseRepository.indexDocenti` row 487), so this is all
   automatic.

4. **CDU data** — `src/application/pipelines/emailSteps.ts` `buildDestinatario`
   (rows 217–267): add `orePot` to the `cattedre` object at row 260:
   `orePot: docente?.getOrePot() ?? 0`. (The box reads
   `destinatario.cattedre.elenco`; now extract the whole `destinatario.cattedre`
   object, see point 5.)

5. **Box extraction** — `boxes.ts` `createBoxComposer` rows 420–425: change the
   dataExtractor from `destinatario.cattedre.elenco` to `destinatario.cattedre`
   (complete object) and the `emptyBehavior` to stay hidden if
   `elenco.length === 0`.

6. **Rendering** — `boxes.ts` `renderCattedreBox` (rows 325–339): read
   `data.elenco` + `data.orePot`; append **at the end of the list** a final item
   **only if `orePot > 0`**:
   `Ore di potenziamento: {orePot} ora|ore`
   using the library's `PluralizeFilter` (`execute(orePot, 'ora', 'ore')`).
   If `ORE_POT` is 0 or absent → **no item added** (list unchanged).

7. **Data fixtures** — populate `ORE_POT` in the `DOCENTI` rows of test/online:
   `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (rows 499–512),
   `src/onlinetests/data/Seeders.ts`, `SampleDatabaseBuilder.ts`. Missing fields
   are tolerated by the constructor (default 0), so this step is optional for
   compilation but necessary to test output ≠ "0 ore".

### 2.5 Alternative approach (B — rejected)

Instead of hardcoding the item in `renderCattedreBox`, expose `orePot` in the CDU
(e.g. `destinatario.cattedre.orePot`) and let the **email template (CONF_MAIL)**
append the item via Mustache `{{pluralize}}`, making the item **data-driven**
without touching the renderer. Higher cost, aligned with the principle "adding a
document type = inserting a record".

**User decision: proceed with approach A (hardcoded in the box).**

### 2.6 Verification

- `npm run typecheck`
- `npm run lint` (GAS/no-restricted-globals constraint unchanged: no GAS global
  involved)
- `npm test`, `npm run test:integration`, `npm run test:build`
- Update/add a unit test on `renderCattedreBox` (pluralization 1 → "ora", >1 →
  "ore", **and the `orePot = 0`/absent case → item absent**) and on
  `Docente.getOrePot`/`toData` round-trip.

### 2.7 Notes / risks

- Pluralization MUST reuse `PluralizeFilter` from `WorkspaceTemplateEngine`
  (GasLibraryFactory-first constraint, AGENTS.md): do not implement a custom
  `orePot === 1 ? 'ora' : 'ore'` in ALDO.
- The tutoring-hours concept is new: no existing code is affected except the
  cattedre box.
- If in the future the value is also needed in `GENERATORE=DOCENTE` documents,
  also propagate it in `DocenteAggregatoFocusProvider`
  (`src/application/context-engine/providers/DocenteAggregatoFocusProvider.ts`),
  which currently reuses `materieDocenteInClasse`.

---

## Part 3 — Trash-aware `LOG_FOLD` reconciliation

### 3.1 Status

- **Type:** Design audit + feasibility analysis
- **Scope:** ALDO only (`src/`) — no `GasLibraryFactory` changes required
- **Decision:** Feasible; preferred write strategy is **update-in-place of the
  Drive folder ID**

### 3.2 Problem

When a Drive folder registered in `LOG_FOLD` is moved to the trash (or permanently
deleted), ALDO keeps returning the dead folder's ID as if it were healthy.
Generated documents are written into an invisible folder and the system gives no
signal that anything is wrong.

### 3.3 Root cause

`AlberoCartelle.findOrCreate` (`src/infrastructure/services/AlberoCartelle.ts:28`)
is the single choke point where folders are found / created / logged. It decides
in three steps:

1. `AlberoCartelle.ts:30` — looks up `LOG_FOLD` by `PATH`.
2. `AlberoCartelle.ts:36` — if absent from `LOG_FOLD`, asks Drive
   (`findFolderByPath`).
3. `AlberoCartelle.ts:47` — if Drive does not know it either, creates the folder
   and logs it.

**The gap is step 1.** When a `LOG_FOLD` row exists, `findOrCreate` returns the
logged `folderId` (lines 31-35) **without ever asking Drive whether that folder
still exists and is not trashed**. A trashed folder keeps its `LOG_FOLD` row, so
ALDO keeps treating it as live.

### 3.4 What the library already gives us (no extension needed)

The hard part — trash detection — is already handled by the library and by the
ALDO facade built on it:

- `DriveServiceFacade.findFolderByPath` already filters `trashed=false`
  (`src/infrastructure/facades/DriveServiceFacade.ts:87`).
- Recreating does **not** resurrect the trashed folder:
  `DriveFolderManager.createFolder` with `returnExistingIfFound` filters
  `trashed=false`
  (`GasLibraryFactory/GoogleApiWrapper/src/services/drive/DriveFolderManager.js:36`),
  so it generates a brand-new folder ID.
- Verifying a specific logged ID is possible with `getFiles` (metadata including
  `trashed`), already exposed by `DriveService` / `DriveMetadataService.getFiles`
  and already exercised by ALDO via `getFileOwnerEmail`.

### 3.5 Proposed fix (ALDO only)

Inside `findOrCreate`, when a `LOG_FOLD` row matches `PATH`:

1. **Validate the logged folder on Drive** — check that the logged `folderId`
   still exists and is not `trashed` (e.g. `getFiles([id], {fields:'id,trashed'})`
   or a small `IDriveFacade` helper like `isFolderTrashed`).
2. **If it is gone or trashed**, fall through to the "create" branch. Because
   creation is trash-aware (`trashed=false` search), Drive returns a **fresh
   folder ID**.
3. **Update the existing `LOG_FOLD` row** so the `PATH` keeps a single row
   pointing at the new ID — do not insert a second row.

### 3.6 Chosen write strategy: update-in-place of the ID

Between the two admissible strategies — update the `ID` in place, or
delete-then-insert — **update-in-place is the more convenient**:

- `SheetTableAdapter` already exposes `updateRowWhere`, which `upsertLog` already
  uses for existing rows (`AlberoCartelle.ts:80`). Passing the row with the new
  `ID` through this path requires **zero additions** to the adapter.
- **Delete+insert** would need a delete primitive that `SheetTableAdapter` does
  not expose (no `deleteRowById` on the adapter; the only escape hatch is the raw
  `DatabaseService` via `SheetDbAdapter.getDatabaseService()`), and it would move
  the row to the bottom of the sheet.
- Update-in-place has no correctness blockers: the new ID is written into the
  same physical cell, and subsequent reads (`findAll` / `getByPK`) and indices
  rebuild from the library cache (`invalidateIndex` is called on update).

### 3.7 Non-concerns (verified during analysis)

- **`LOG_DOCS`** — contains no folder IDs; there is nothing to reference-check.
- **`LOG_MAIL`** — is an append-only historical audit; it is **correct** that it
  keeps the folder IDs of deleted/trashed folders. Left untouched.

### 3.8 File footprint

| File | Change |
| --- | --- |
| `src/infrastructure/services/AlberoCartelle.ts` | Validate logged folder on Drive; on trash/miss, create fresh folder and update the existing LOG_FOLD row via `updateRowWhere`. |
| `src/infrastructure/facades/DriveServiceFacade.ts` | Optional: small `IDriveFacade` helper (e.g. `isFolderTrashed(id)`) wrapping `getFiles` metadata, if the inline check is deemed too raw. |

No changes to `GasLibraryFactory`.

### 3.9 Verification

- Add/extend unit tests for `AlberoCartelle.findOrCreate`: a logged folder that
  is trashed → new folder created, same `PATH`, single `LOG_FOLD` row with the
  new ID, `created: true`.
- `LOG_MAIL` rows referencing the old folder ID must retain it unchanged.
- An online test (seed a folder, trash it via the Drive facade, re-run
  `findOrCreate`) would be the end-to-end proof.
