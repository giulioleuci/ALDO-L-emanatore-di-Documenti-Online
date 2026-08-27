# Four Features (Email Materie Box, DB Validation, Document Lock, MATERIE per-Address Columns) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four independent SGSA features: a `cattedre` email pattern (box already implemented; only the CONF_MAIL seed remains), a menu-launched database validator that writes a violation report sheet, a menu-launched bulk downgrade of write permissions on all logged documents, and per-address curriculum columns on MATERIE.

**Architecture:** Two of the four features are grown in `GasLibraryFactory` first (a generic `DatasetValidator` in `GasSchemaValidatorLib`, a permission-id-level role change in `GoogleApiWrapper.PermissionService`), then consumed from ALDO through ALDO-owned facades and application services wired in `Bootstrap.ts`. The email box (`cattedre`) is already implemented; only the CONF_MAIL seed record remains. The MATERIE change is pure data/schema: dynamic columns resolved at runtime, consumed only by the new validator.

**Tech Stack:** TypeScript (ALDO `src/`), JavaScript ESM (GasLibraryFactory), Jest (`jest.config.cjs` unit, `jest.build.config.cjs` build, GasLibraryFactory's own `jest.config.cjs`), webpack + Babel (Chrome 80) → GAS V8, `clasp`.

**Spec:** `docs/superpowers/specs/2026-08-19-four-features-design.md`

---

## Global Constraints

- **Target is GAS V8, not Node.** Synchronous code only. No `async`/`await`, no Node APIs, no unsupported browser APIs.
- **Native GAS globals** (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`) may only appear inside `GoogleApiWrapper` (and, in ALDO, nowhere at all). ESLint `no-restricted-globals` fails the build otherwise.
- **Never edit `dist/*` or `vendor/gaslibs.Code.js` by hand.** Library changes go in `GasLibraryFactory/<Lib>/src/**`, then reach ALDO via `npm run refresh:vendor` (which runs GasLibraryFactory's `build:testing` and rewrites `vendor/gaslibs.Code.js` + `vendor/CHECKSUM` + `vendor/VERSION`).
- **GasLibraryFactory-first.** No ALDO-local reimplementation of anything a library provides. Both library extensions in this plan were approved by the user for exactly this reason.
- **All table and column names are UPPERCASE** (`SPECS_ALDO/01_SCHEMA_DATABASE.md`). Use the constants in `src/config/schema.ts`, never string literals.
- **New services/facades are wired in `src/config/Bootstrap.ts`** and resolved via `ServiceContainer` — never constructed ad hoc in application code.
- **User-facing strings are Italian.** Log/monitor text too.
- **Verification commands** (ALDO, run from repo root): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:build`. GasLibraryFactory: `npm test` from `GasLibraryFactory/`.
- Run a single ALDO test: `npx jest --config jest.config.cjs <path> -t "<name>"`.

## Decisions that deviate from the spec (already agreed)

1. **`{{focus.destinatario...}}` is wrong.** `BuildCDUStep` assigns `built.destinatario` at the CDU **root** (`emailSteps.ts:197`, `Cdu.ts:464`). The `OGGETTO` must use `{{destinatario.anagrafica.nome}}` / `{{destinatario.anagrafica.cognome}}`.
2. **Box data comes from the CDU, not from raw CLASSI columns.** `DOCENTE_COMPLETO` already runs the `consiglio` + `materie` providers (`Recipe.ts:163`), so `focus.classe.consiglioDiClasse[].materie[]` holds resolved `SubjectVM`s (with `nome` and `isITP`) for the target teacher. Re-parsing CLASSI dynamic columns inside a box renderer would duplicate `AldoTeachingAssignmentResolver` and ignore `CONF_MAIL.SUPPLENTI`.
3. **Feature 2 validation engine lives in `GasSchemaValidatorLib`** as a generic `DatasetValidator` (user decision). ALDO supplies only the SGSA rule table and the Italian message formatting.
4. **Feature 3 uses a new `PermissionService.changeRolesByPermissionId`** (user decision), so link-wide (`type: 'anyone'`/`'domain'`) writer grants — which have no `emailAddress` and are therefore invisible to the existing `changeRoles(fileIds, [{email, newRole}])` — get downgraded too.
5. **Feature 4 is data-only, plus one validation rule** (user decision): no `SheetMaterieGeneratorStrategy` change. The new columns are consumed by a Feature 2 rule asserting that every subject the curriculum mandates for a class's address+year has a corresponding CLASSI column. The reverse direction (extra columns not in the curriculum) is deliberately NOT checked.

## File Structure

**GasLibraryFactory (library growth):**
- `GasSchemaValidatorLib/src/DatasetValidator.js` — new. Generic cross-table dataset validation engine; no ALDO/SGSA knowledge.
- `GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js` — new.
- `GasSchemaValidatorLib/index.js` — modify: export `DatasetValidator`.
- `GoogleApiWrapper/src/services/PermissionService.js` — modify: add `changeRolesByPermissionId`.
- `GoogleApiWrapper/src/services/__tests__/PermissionService.test.js` — modify.

**ALDO:**
- `src/application/email/boxes.ts` — modify: templated `TITOLO` (line 832). The `cattedre` box already exists; no new box type needed.
- `src/config/validationRules.ts` — new. The SGSA rule table (FK map, JSON columns, required columns, ENUM sets, dynamic-column and predicate rules) + Italian message formatter.
- `src/application/services/DatabaseValidationService.ts` — new. Reads every table, runs `DatasetValidator`, formats rows, writes the report sheet.
- `src/application/services/LockDocumentsService.ts` — new. LOG_DOCS → permission downgrade, with per-file failure isolation.
- `src/infrastructure/facades/SpreadsheetReportFacade.ts` — new. `ISpreadsheetReportFacade` + GAS implementation over `SpreadsheetService.createSpreadsheet`/`updateRanges`.
- `src/infrastructure/facades/DriveServiceFacade.ts` — modify: `listPermissions` / `changePermissionRoles`.
- `src/presentation/Menu.ts` — modify: `avvioConConferma` helper, two new `vociMenu()` entries, two wrappers.
- `src/config/Bootstrap.ts` — modify: wire both services + the report facade, add two launchers.
- `src/index.ts`, `src/entrypoints/EntryPoints_Menu.ts` — modify: expose the two new menu functions as GAS globals.
- `src/onlinetests/data/fixtures.ts`, `SharedTestHeaders.ts`, `SharedTestDatabaseBuilder.ts` — modify: per-address MATERIE columns + the `ELENCO_MATERIE` CONF_MAIL row.
- `test/fakes/FakeDriveFacade.ts`, `test/fakes/FakeSpreadsheetReportFacade.ts` — modify/new.
- `types/gaslibs/index.d.ts` — modify: declare `DatasetValidator`, `PermissionService.getPermissions`, `PermissionService.changeRolesByPermissionId`.

---

# Phase 1 — Feature 1: `cattedre` email pattern

> **The `cattedre` TIPO_BOX already exists** (`boxes.ts:314-328` renderer,
> `409-414` block registration, `446` HtmlRenderer, `464` DEFAULT_TITLES).
> Data comes from `destinatario.contesto.cattedre` (built by
> `BuildCDUStep.buildCattedre` at `emailSteps.ts:288-343`). Each
> `CattedraVM` has `classeNome`, `anno`, `sezione`, and `materie: SubjectVM[]`
> (with `nome` and `isITP`). The original `materie_classe` proposal is
> **superseded** — the `cattedre` box already covers the use case and more.
>
> **TITOLO interpolation** (`boxes.ts:832`) is NOT yet implemented:
> `cfg['TITOLO']` is used as a literal string. This must be fixed so the
> `ELENCO_MATERIE` pattern can use `{{focus.classe.anagrafica.nome}}` as
> the box title.

### Task 1: Templated box `TITOLO`

The spec wants the box title to be the class name ("3C"). `renderBoxes` currently
uses `BOX_CFG.TITOLO` as a literal (`boxes.ts:832`), so
`{{focus.classe.anagrafica.nome}}` would be shown verbatim. Interpolate it against
the CDU. Use `processString` (not `processStringEscaped`): `wrapBox` already
HTML-escapes the title, so escaping twice would turn `&` into `&amp;amp;`.

**Files:**
- Modify: `src/application/email/boxes.ts` (line 832)
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BOX_CFG.TITOLO` is a Mustache template rendered against the CDU. Task 2's CONF_MAIL row depends on this.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/application/email-boxes.test.ts`:

```typescript
test('BOX_CFG.TITOLO is interpolated against the CDU (11 §5)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const conf = new ConfigurazioneEmail({
    [COL_CONF_MAIL.ID]: 'T1',
    [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
    [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
      { TIPO_BOX: 'note', TITOLO: 'Note per {{focus.classe.anagrafica.nome}}' }
    ])
  });
  const cdu = cduRecord();
  (cdu['focus'] as Record<string, unknown>)['carenza'] = { note: 'Testo libero' };

  const { boxes } = renderBoxes(composer, conf, cdu, materie(), templates);

  expect(boxes['note']!.titolo).toBe('Note per 5A');
  expect(boxes['note']!.html).toContain('Note per 5A');
});
```

`COL_CONF_MAIL` must be imported at the top of the test file if not already:

```typescript
import { COL_CONF_MAIL } from '../../../src/config/schema';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "TITOLO is interpolated"`
Expected: FAIL — received `"Note per {{focus.classe.anagrafica.nome}}"`.

- [ ] **Step 3: Write minimal implementation**

In `boxes.ts`, inside the `for (const { cfg, index, tipo, sourceItems } of orderedCfg)` loop (line 812), replace line 832:

```typescript
    const titolo = str(cfg['TITOLO']) !== '' ? str(cfg['TITOLO']) : DEFAULT_TITLES[tipo]!;
```

with:

```typescript
    // TITOLO is a Mustache template over the CDU (11 §5) — e.g. the
    // cattedre box titles itself with the class name. `wrapBox` escapes
    // the result, so interpolate UNescaped here to avoid double-escaping.
    const titoloCfg = str(cfg['TITOLO']);
    const titolo =
      titoloCfg !== '' ? templates.processString(titoloCfg, cdu) : DEFAULT_TITLES[tipo]!;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: PASS, whole file green (no existing test sets a `TITOLO` containing `{{`).

- [ ] **Step 5: Commit**

```bash
git add src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "feat(email): interpolate BOX_CFG.TITOLO against the CDU"
```

---

### Task 2: `ELENCO_MATERIE` CONF_MAIL seed

Seed the pattern in the online-test database so the E2E suite can exercise it end to end. Uses the **existing** `cattedre` TIPO_BOX (not a new `materie_classe` type).

**Files:**
- Modify: `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (`seedConfMail` at line 1319), `src/onlinetests/data/fixtures.ts` (id constant)
- Test: `test/unit/onlinetests/shared-test-database-builder-migration.test.ts`

**Interfaces:**
- Consumes: existing `cattedre` TIPO_BOX, templated `TITOLO` (Task 1).
- Produces: exported `CONF_MAIL_ELENCO_MATERIE = 'ELENCO_MATERIE'` in `src/onlinetests/data/fixtures.ts`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/onlinetests/shared-test-database-builder-migration.test.ts` (adapt the existing helper used in that file to obtain the seeded CONF_MAIL rows; if it builds against a fake sample spreadsheet, reuse that helper verbatim):

```typescript
test('seedConfMail seeds the ELENCO_MATERIE pattern (Feature 1)', () => {
  const rows = seededRows('CONF_MAIL'); // existing helper in this file
  const elenco = rows.find((r) => r['ID'] === 'ELENCO_MATERIE');
  expect(elenco).toBeDefined();
  expect(elenco!['PROCESSO']).toBe('PER_DOCENTE');
  expect(elenco!['SUPPLENTI']).toBe('SOLO_TITOLARI');
  expect(elenco!['GESTIONE_ARTICOLAZIONE']).toBe('COMPLETA');
  expect(elenco!['DUPLICAZIONE']).toBe('PERMESSA');
  expect(elenco!['NOREPLY']).toBe(true);
  expect(elenco!['TESTO']).toBe('');
  expect(JSON.parse(String(elenco!['BOX_CFG']))).toEqual([
    { TIPO_BOX: 'cattedre', TITOLO: '{{focus.classe.anagrafica.nome}}' }
  ]);
  expect(String(elenco!['OGGETTO'])).toContain('{{destinatario.anagrafica.cognome}}');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/shared-test-database-builder-migration.test.ts -t "ELENCO_MATERIE"`
Expected: FAIL — `expect(elenco).toBeDefined()` receives `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/onlinetests/data/fixtures.ts`, next to the other CONF_MAIL id constants:

```typescript
export const CONF_MAIL_ELENCO_MATERIE = 'ELENCO_MATERIE';
```

Import it in `SharedTestDatabaseBuilder.ts` alongside the other CONF_MAIL constants, then append inside `seedConfMail` (line 1319):

```typescript
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_ELENCO_MATERIE,
      // Root-level `destinatario` (BuildCDUStep.buildDestinatario), NOT
      // focus.destinatario — the design doc's path was wrong.
      [COL_CONF_MAIL.OGGETTO]:
        "[E2E] Ipotesi assegnazione cattedre per l'anno scolastico appena iniziato " +
        '(prof/prof.ssa {{destinatario.anagrafica.nome}} {{destinatario.anagrafica.cognome}})',
      [COL_CONF_MAIL.PROCESSO]: 'PER_DOCENTE',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        { TIPO_BOX: 'cattedre', TITOLO: '{{focus.classe.anagrafica.nome}}' }
      ]),
      [COL_CONF_MAIL.TESTO]: '',
      [COL_CONF_MAIL.SUPPLENTI]: 'SOLO_TITOLARI',
      [COL_CONF_MAIL.NOREPLY]: true,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'PERMESSA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests && npm run typecheck && npm run lint`
Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/onlinetests/data/fixtures.ts src/onlinetests/data/SharedTestDatabaseBuilder.ts test/unit/onlinetests/shared-test-database-builder-migration.test.ts
git commit -m "test(onlinetests): seed ELENCO_MATERIE CONF_MAIL pattern (cattedre box)"
```

---

# Phase 2 — Feature 4: per-address MATERIE columns

### Task 3: `MATERIE.<INDIRIZZO_ID>` curriculum columns

One column per `INDIRIZZI.ID` on MATERIE, holding a CSV of course years (1–5) in which the subject is mandatory for that address. Empty means "not applicable". No production code reads these yet — Task 6's curriculum rule is the first consumer.

**Files:**
- Modify: `src/onlinetests/data/fixtures.ts`, `src/onlinetests/data/SharedTestHeaders.ts`, `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (`buildMaterieRows` at line 106)
- Test: `test/unit/onlinetests/shared-test-database-builder-migration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const MATERIE_ANNI_PER_INDIRIZZO: Record<string, Record<string, number[]>>` in `fixtures.ts` — keyed `[indirizzoId][materiaId] -> anni`.
  - `HEADERS[TABLE.MATERIE]` gains one column per entry of `INDIRIZZI`.
  - Every row produced by `buildMaterieRows()` carries one cell per address (CSV string, `''` when not applicable).

- [ ] **Step 1: Write the failing test**

Append to `test/unit/onlinetests/shared-test-database-builder-migration.test.ts`:

```typescript
import { buildMaterieRows } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { HEADERS } from '../../../src/onlinetests/data/SharedTestHeaders';
import { INDIRIZZI, MATERIE_ANNI_PER_INDIRIZZO } from '../../../src/onlinetests/data/fixtures';

test('MATERIE headers carry one curriculum column per indirizzo (Feature 4)', () => {
  for (const indirizzo of INDIRIZZI) {
    expect(HEADERS['MATERIE']).toContain(indirizzo);
  }
});

test('buildMaterieRows fills the per-indirizzo curriculum columns', () => {
  const rows = buildMaterieRows();
  for (const row of rows) {
    for (const indirizzo of INDIRIZZI) {
      expect(row).toHaveProperty(indirizzo);
      const value = String(row[indirizzo] ?? '');
      if (value !== '') expect(value).toMatch(/^[1-5](,[1-5])*$/);
    }
  }
  const mat = rows.find((r) => r['ID'] === 'MAT');
  const atteso = MATERIE_ANNI_PER_INDIRIZZO[INDIRIZZI[0]!]?.['MAT'] ?? [];
  expect(String(mat![INDIRIZZI[0]!] ?? '')).toBe(atteso.join(','));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/shared-test-database-builder-migration.test.ts -t "curriculum"`
Expected: FAIL — `MATERIE_ANNI_PER_INDIRIZZO` is not exported / headers lack the columns.

- [ ] **Step 3: Write minimal implementation**

In `src/onlinetests/data/fixtures.ts`, after `MATERIE_PER_INDIRIZZO`:

```typescript
/**
 * Feature 4: MATERIE.<INDIRIZZO_ID> — the years of course (1-5) in which a
 * subject is mandatory for that address. Absent entry = empty cell = "not
 * applicable for this address". Derived from MATERIE_PER_INDIRIZZO so the
 * fixture cannot drift from the class layouts.
 */
export const MATERIE_ANNI_PER_INDIRIZZO: Record<string, Record<string, number[]>> =
  Object.fromEntries(
    Object.entries(MATERIE_PER_INDIRIZZO).map(([indirizzo, materie]) => [
      indirizzo,
      Object.fromEntries(materie.map((sigla) => [sigla, [1, 2, 3, 4, 5]]))
    ])
  );
```

In `src/onlinetests/data/SharedTestHeaders.ts`, add `INDIRIZZI` to the existing `fixtures` import and change the MATERIE header line:

```typescript
  [TABLE.MATERIE]: [...Object.values(COL_MATERIE), ...INDIRIZZI],
```

In `SharedTestDatabaseBuilder.ts`, import `INDIRIZZI` and `MATERIE_ANNI_PER_INDIRIZZO`, then add a helper above `buildMaterieRows`:

```typescript
/** Feature 4: `{ [INDIRIZZI.ID]: '1,2,3' }` cells for one MATERIE row. */
function curriculumCells(materiaId: string): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const indirizzo of INDIRIZZI) {
    const anni = MATERIE_ANNI_PER_INDIRIZZO[indirizzo]?.[materiaId] ?? [];
    cells[indirizzo] = anni.join(',');
  }
  return cells;
}
```

Spread it into both row builders inside `buildMaterieRows()` — the base-subject rows (line ~122) and the dotted-specifica rows (line ~166):

```typescript
    ...curriculumCells(sigla),
```

and

```typescript
      ...curriculumCells(id),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests && npm run typecheck && npm run lint`
Expected: PASS / exit 0. If any existing test asserts an exact MATERIE header list or row-key set, update that assertion — the new columns are intentional.

- [ ] **Step 5: Document the migration for existing databases**

Append to `docs/superpowers/specs/2026-08-19-four-features-design.md` under Feature 4's "Migration" heading (this is the operator-facing record; keep it short):

```markdown
**Applied 2026-08-20:** columns are appended to the MATERIE sheet by hand (one
per INDIRIZZI.ID, header = the address id) and left empty. Empty = the subject
is not part of that address's curriculum. `SheetDbAdapter` resolves them at
runtime; no schema.ts change is needed.
```

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/data test/unit/onlinetests docs/superpowers/specs/2026-08-19-four-features-design.md
git commit -m "feat(schema): add per-indirizzo curriculum columns to MATERIE"
```

---

# Phase 3 — Feature 2: database validation

### Task 4: `DatasetValidator` in GasSchemaValidatorLib

A generic, ALDO-agnostic engine: given `datasets` (`{ TABLE: rows[] }`) and `rules`, return violations. It owns iteration, target-value indexing, CSV splitting, wildcard/empty handling and the violation shape. Callers own vocabulary and messages.

**Files:**
- Create: `GasLibraryFactory/GasSchemaValidatorLib/src/DatasetValidator.js`
- Create: `GasLibraryFactory/GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js`
- Modify: `GasLibraryFactory/GasSchemaValidatorLib/index.js`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 6–8):

```js
new DatasetValidator({ logger }).validate(datasets, rules) // -> { violations: Violation[] }
```

  - `Violation`: `{ ruleId: string, type: string, table: string, rowIndex: number, column: string, value: string, details: object }` — `rowIndex` is 0-based within the dataset array.
  - Rule types:
    - `{ id, type: 'required', table, columns: string[] }`
    - `{ id, type: 'enum', table, column, values: string[], allowEmpty?: boolean }` (default `allowEmpty: true`)
    - `{ id, type: 'json', table, column }` (empty cells skipped)
    - `{ id, type: 'foreignKey', table, column, targetTable, targetColumn, csv?: boolean, allowWildcard?: boolean, allowEmpty?: boolean }` (defaults: `csv:false`, `allowWildcard:false`, `allowEmpty:true`; wildcard token is `'*'`)
    - `{ id, type: 'columnName', table, targetTable, targetColumn, ignore?: string[], normalize?: (columnName) => string }` — every column of `table` not in `ignore` and not in `knownColumns` must normalize to a value present in the target set. Requires `knownColumns: string[]` on the rule (the static schema columns).
    - `{ id, type: 'rowPredicate', table, check: (row, ctx) => null | { column, value, details? } }` — `ctx` is `{ datasets, index(table, column) -> Set<string> }`.

- [ ] **Step 1: Write the failing test**

Create `GasLibraryFactory/GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js`:

```javascript
import { DatasetValidator } from '../DatasetValidator.js';

const datasets = {
  ALUNNI: [
    { EMAIL: 'a@x.it', CLASSE: '1A', CURRICULUM: '{"a":1}' },
    { EMAIL: '', CLASSE: '99X', CURRICULUM: '{broken' }
  ],
  CLASSI: [{ ID: '1A', MAT: 'p@x.it', ALT: 'q@x.it' }],
  DOCENTI: [{ EMAIL: 'p@x.it' }],
  MATERIE: [{ ID: 'MAT' }]
};

function run(rules) {
  return new DatasetValidator().validate(datasets, rules).violations;
}

test('required flags empty cells only', () => {
  const v = run([{ id: 'R1', type: 'required', table: 'ALUNNI', columns: ['EMAIL'] }]);
  expect(v).toEqual([
    { ruleId: 'R1', type: 'required', table: 'ALUNNI', rowIndex: 1, column: 'EMAIL', value: '', details: {} }
  ]);
});

test('foreignKey resolves against the target column set', () => {
  const v = run([
    { id: 'FK1', type: 'foreignKey', table: 'ALUNNI', column: 'CLASSE', targetTable: 'CLASSI', targetColumn: 'ID' }
  ]);
  expect(v).toHaveLength(1);
  expect(v[0].rowIndex).toBe(1);
  expect(v[0].value).toBe('99X');
  expect(v[0].details).toEqual({ targetTable: 'CLASSI', targetColumn: 'ID' });
});

test('foreignKey csv checks every token and reports the offending one', () => {
  const withCsv = { ...datasets, CLASSI: [{ ID: '1A', COORD: 'p@x.it, ghost@x.it' }] };
  const v = new DatasetValidator().validate(withCsv, [
    { id: 'FK2', type: 'foreignKey', table: 'CLASSI', column: 'COORD', targetTable: 'DOCENTI', targetColumn: 'EMAIL', csv: true }
  ]).violations;
  expect(v).toHaveLength(1);
  expect(v[0].value).toBe('ghost@x.it');
});

test('foreignKey allowWildcard accepts *', () => {
  const withStar = { ...datasets, SUPPLENZE: [{ CLASSI: '*' }] };
  const v = new DatasetValidator().validate(withStar, [
    { id: 'FK3', type: 'foreignKey', table: 'SUPPLENZE', column: 'CLASSI', targetTable: 'CLASSI', targetColumn: 'ID', csv: true, allowWildcard: true }
  ]).violations;
  expect(v).toEqual([]);
});

test('json reports unparsable non-empty cells', () => {
  const v = run([{ id: 'J1', type: 'json', table: 'ALUNNI', column: 'CURRICULUM' }]);
  expect(v).toHaveLength(1);
  expect(v[0].rowIndex).toBe(1);
});

test('enum reports values outside the set, empty allowed by default', () => {
  const v = new DatasetValidator().validate(
    { T: [{ S: 'OK' }, { S: 'NOPE' }, { S: '' }] },
    [{ id: 'E1', type: 'enum', table: 'T', column: 'S', values: ['OK'] }]
  ).violations;
  expect(v).toHaveLength(1);
  expect(v[0].value).toBe('NOPE');
  expect(v[0].details.values).toEqual(['OK']);
});

test('columnName validates dynamic columns against a target set', () => {
  const v = run([
    {
      id: 'C1',
      type: 'columnName',
      table: 'CLASSI',
      knownColumns: ['ID'],
      ignore: ['ALT'],
      targetTable: 'MATERIE',
      targetColumn: 'ID',
      normalize: (name) => name.split('.')[0]
    }
  ]);
  expect(v).toEqual([]);
});

test('columnName reports an unknown dynamic column once, not once per row', () => {
  const withGhost = { ...datasets, CLASSI: [{ ID: '1A', GHOST: 'x' }, { ID: '2A', GHOST: 'y' }] };
  const v = new DatasetValidator().validate(withGhost, [
    { id: 'C2', type: 'columnName', table: 'CLASSI', knownColumns: ['ID'], targetTable: 'MATERIE', targetColumn: 'ID' }
  ]).violations;
  expect(v).toHaveLength(1);
  expect(v[0].column).toBe('GHOST');
  expect(v[0].rowIndex).toBe(0);
});

test('rowPredicate receives datasets and an index helper', () => {
  const v = run([
    {
      id: 'P1',
      type: 'rowPredicate',
      table: 'CLASSI',
      check: (row, ctx) =>
        ctx.index('DOCENTI', 'EMAIL').has(String(row.ALT)) ? null : { column: 'ALT', value: String(row.ALT) }
    }
  ]);
  expect(v).toHaveLength(1);
  expect(v[0].value).toBe('q@x.it');
});

test('missing table yields no violations and does not throw', () => {
  expect(run([{ id: 'X', type: 'required', table: 'ASSENTE', columns: ['A'] }])).toEqual([]);
});

test('an unknown rule type throws (caller typo, not data error)', () => {
  expect(() => run([{ id: 'Z', type: 'nope', table: 'ALUNNI' }])).toThrow(/nope/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `GasLibraryFactory/`): `npx jest GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js`
Expected: FAIL — `Cannot find module '../DatasetValidator.js'`.

- [ ] **Step 3: Write the implementation**

Create `GasLibraryFactory/GasSchemaValidatorLib/src/DatasetValidator.js`:

```javascript
/**
 * @file GasSchemaValidatorLib/src/DatasetValidator.js
 * @description Declarative cross-table dataset validation. Complements
 * SchemaValidator (single-entity Zod shape validation) with the checks a
 * sheet-backed relational store needs and Zod cannot express: referential
 * integrity across tables, CSV foreign keys, dynamic column names, and
 * caller-supplied row predicates.
 *
 * Domain-agnostic by construction: rule ids, vocabulary and user-facing
 * messages belong to the caller; this engine only reports machine-readable
 * violations.
 */

const WILDCARD = '*';

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function splitCsv(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export class DatasetValidator {
  /**
   * @param {{logger?: object}} [deps]
   */
  constructor(deps = {}) {
    this._logger = deps.logger || null;
    this._indexes = new Map();
  }

  /**
   * @param {Record<string, Array<Record<string, unknown>>>} datasets
   * @param {Array<object>} rules
   * @returns {{violations: Array<object>}}
   */
  validate(datasets, rules) {
    this._indexes = new Map();
    const context = {
      datasets,
      index: (table, column) => this._index(datasets, table, column)
    };
    const violations = [];
    (rules || []).forEach((rule) => {
      const rows = datasets[rule.table];
      if (!Array.isArray(rows)) {
        if (this._logger) this._logger.warn(`DatasetValidator: tabella "${rule.table}" assente`);
        return;
      }
      violations.push(...this._applyRule(rule, rows, datasets, context));
    });
    return { violations };
  }

  _applyRule(rule, rows, datasets, context) {
    switch (rule.type) {
      case 'required':
        return this._required(rule, rows);
      case 'enum':
        return this._enum(rule, rows);
      case 'json':
        return this._json(rule, rows);
      case 'foreignKey':
        return this._foreignKey(rule, rows, datasets);
      case 'columnName':
        return this._columnName(rule, rows, datasets);
      case 'rowPredicate':
        return this._rowPredicate(rule, rows, context);
      default:
        throw new Error(`DatasetValidator: tipo di regola non supportato "${rule.type}"`);
    }
  }

  _violation(rule, rowIndex, column, value, details) {
    return {
      ruleId: rule.id,
      type: rule.type,
      table: rule.table,
      rowIndex,
      column,
      value,
      details: details || {}
    };
  }

  _index(datasets, table, column) {
    const key = `${table}::${column}`;
    let set = this._indexes.get(key);
    if (set) return set;
    set = new Set();
    (datasets[table] || []).forEach((row) => {
      const value = cellToString(row[column]);
      if (value !== '') set.add(value);
    });
    this._indexes.set(key, set);
    return set;
  }

  _required(rule, rows) {
    const out = [];
    rows.forEach((row, rowIndex) => {
      rule.columns.forEach((column) => {
        if (cellToString(row[column]) === '') out.push(this._violation(rule, rowIndex, column, ''));
      });
    });
    return out;
  }

  _enum(rule, rows) {
    const allowEmpty = rule.allowEmpty !== false;
    const allowed = new Set(rule.values);
    const out = [];
    rows.forEach((row, rowIndex) => {
      const value = cellToString(row[rule.column]);
      if (value === '' && allowEmpty) return;
      if (allowed.has(value)) return;
      out.push(this._violation(rule, rowIndex, rule.column, value, { values: rule.values }));
    });
    return out;
  }

  _json(rule, rows) {
    const out = [];
    rows.forEach((row, rowIndex) => {
      const raw = row[rule.column];
      if (raw === null || raw === undefined) return;
      if (typeof raw === 'object') return;
      const value = cellToString(raw);
      if (value === '') return;
      try {
        JSON.parse(value);
      } catch (error) {
        out.push(this._violation(rule, rowIndex, rule.column, value, { reason: error.message }));
      }
    });
    return out;
  }

  _foreignKey(rule, rows, datasets) {
    const target = this._index(datasets, rule.targetTable, rule.targetColumn);
    const allowEmpty = rule.allowEmpty !== false;
    const details = { targetTable: rule.targetTable, targetColumn: rule.targetColumn };
    const out = [];
    rows.forEach((row, rowIndex) => {
      const raw = cellToString(row[rule.column]);
      if (raw === '') {
        if (!allowEmpty) out.push(this._violation(rule, rowIndex, rule.column, '', details));
        return;
      }
      const tokens = rule.csv ? splitCsv(raw) : [raw];
      tokens.forEach((token) => {
        if (rule.allowWildcard && token === WILDCARD) return;
        if (target.has(token)) return;
        out.push(this._violation(rule, rowIndex, rule.column, token, details));
      });
    });
    return out;
  }

  _columnName(rule, rows, datasets) {
    const target = this._index(datasets, rule.targetTable, rule.targetColumn);
    const known = new Set(rule.knownColumns || []);
    const ignore = new Set(rule.ignore || []);
    const normalize = rule.normalize || ((name) => name);
    const details = { targetTable: rule.targetTable, targetColumn: rule.targetColumn };
    const seen = new Set();
    const out = [];
    rows.forEach((row) => {
      Object.keys(row).forEach((column) => {
        if (known.has(column) || ignore.has(column) || seen.has(column)) return;
        seen.add(column);
        if (target.has(normalize(column))) return;
        out.push(this._violation(rule, 0, column, column, details));
      });
    });
    return out;
  }

  _rowPredicate(rule, rows, context) {
    const out = [];
    rows.forEach((row, rowIndex) => {
      const hit = rule.check(row, context);
      if (!hit) return;
      out.push(this._violation(rule, rowIndex, hit.column, cellToString(hit.value), hit.details));
    });
    return out;
  }
}
```

Export it from `GasLibraryFactory/GasSchemaValidatorLib/index.js`:

```javascript
export { DatasetValidator } from './src/DatasetValidator.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `GasLibraryFactory/`): `npx jest GasSchemaValidatorLib && npm run lint`
Expected: PASS / exit 0.

- [ ] **Step 5: Confirm the class is exposed on the bundle global**

`src/index.js` flattens each library's public exports onto `global`. Verify the barrel is re-exported there:

Run (from `GasLibraryFactory/`): `grep -n "GasSchemaValidatorLib" src/index.js`
Expected: a re-export line already covers the whole barrel. If exports are enumerated explicitly, add `DatasetValidator` to that list.

- [ ] **Step 6: Regenerate library docs**

Run (from `GasLibraryFactory/`): `npm run docs`
Expected: `DOCS_LIBS/GasSchemaValidatorLib.md` gains a `CLASS: DatasetValidator` section.

- [ ] **Step 7: Commit**

```bash
cd GasLibraryFactory
git add GasSchemaValidatorLib DOCS_LIBS/GasSchemaValidatorLib.md src/index.js
git commit -m "feat(GasSchemaValidatorLib): add DatasetValidator for cross-table integrity"
cd ..
```

---

### Task 5: Vendor the new library build into ALDO

**Files:**
- Modify (generated): `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`
- Modify: `types/gaslibs/index.d.ts`
- Test: `test/unit/harness/gaslibs.test.ts`

**Interfaces:**
- Consumes: Task 4's `DatasetValidator`.
- Produces: ambient `DatasetValidator` class declaration usable from ALDO TypeScript:

```typescript
class DatasetValidator {
  constructor(deps?: { logger?: LoggerService });
  validate(
    datasets: Record<string, Array<Record<string, unknown>>>,
    rules: DatasetValidationRule[]
  ): { violations: DatasetViolation[] };
}
```

- [ ] **Step 1: Write the failing test**

Append to `test/unit/harness/gaslibs.test.ts`:

```typescript
test('vendored bundle exposes DatasetValidator (Feature 2)', () => {
  const validator = new DatasetValidator();
  const { violations } = validator.validate(
    { T: [{ A: '' }] },
    [{ id: 'R', type: 'required', table: 'T', columns: ['A'] }]
  );
  expect(violations).toHaveLength(1);
  expect(violations[0]!.ruleId).toBe('R');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts`
Expected: FAIL — `DatasetValidator is not defined` (and `tsc` would not know the name either).

- [ ] **Step 3: Refresh vendor + add the type declarations**

Run: `npm run refresh:vendor && npm run verify:vendor`

Then add to `types/gaslibs/index.d.ts`, in the GasSchemaValidatorLib area (create the section if absent — search for `GasResilienceLib` to find the L1 block):

```typescript
  // --- GasSchemaValidatorLib (L1): declarative dataset validation ---
  interface DatasetViolation {
    ruleId: string;
    type: string;
    table: string;
    /** 0-based index into the dataset array (sheet row = index + 2). */
    rowIndex: number;
    column: string;
    value: string;
    details: Record<string, unknown>;
  }

  interface DatasetRuleContext {
    datasets: Record<string, Array<Record<string, unknown>>>;
    index(table: string, column: string): Set<string>;
  }

  type DatasetValidationRule =
    | { id: string; type: 'required'; table: string; columns: string[] }
    | { id: string; type: 'enum'; table: string; column: string; values: string[]; allowEmpty?: boolean }
    | { id: string; type: 'json'; table: string; column: string }
    | {
        id: string;
        type: 'foreignKey';
        table: string;
        column: string;
        targetTable: string;
        targetColumn: string;
        csv?: boolean;
        allowWildcard?: boolean;
        allowEmpty?: boolean;
      }
    | {
        id: string;
        type: 'columnName';
        table: string;
        knownColumns: string[];
        targetTable: string;
        targetColumn: string;
        ignore?: string[];
        normalize?: (columnName: string) => string;
      }
    | {
        id: string;
        type: 'rowPredicate';
        table: string;
        check: (
          row: Record<string, unknown>,
          ctx: DatasetRuleContext
        ) => null | { column: string; value: unknown; details?: Record<string, unknown> };
      };

  class DatasetValidator {
    constructor(deps?: { logger?: LoggerService });
    validate(
      datasets: Record<string, Array<Record<string, unknown>>>,
      rules: DatasetValidationRule[]
    ): { violations: DatasetViolation[] };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts && npm run typecheck && npm test`
Expected: PASS / exit 0. A vendor refresh changes the whole bundle, so run the full unit suite here, not just the harness file.

- [ ] **Step 5: Commit**

```bash
git add vendor types/gaslibs/index.d.ts test/unit/harness/gaslibs.test.ts
git commit -m "chore(vendor): refresh gaslibs bundle with DatasetValidator"
```

---

### Task 6: The SGSA validation rule table

All rules from the spec, as data, plus the Italian message formatter. Pure module: no I/O, no GAS, trivially testable.

**Files:**
- Create: `src/config/validationRules.ts`
- Test: `test/unit/config/validation-rules.test.ts`

**Interfaces:**
- Consumes: Task 5's ambient `DatasetValidationRule` / `DatasetViolation` types; `src/config/schema.ts` constants; `src/domain/value-objects/enums.ts`.
- Produces:

```typescript
export const VALIDATION_TABLES: string[];               // every table the validator must read
export function regoleValidazione(): DatasetValidationRule[];
export function messaggioErrore(v: DatasetViolation): string;   // Italian ERRORE text
```

- [ ] **Step 1: Write the failing test**

Create `test/unit/config/validation-rules.test.ts`:

```typescript
import { regoleValidazione, messaggioErrore, VALIDATION_TABLES } from '../../../src/config/validationRules';
import { TABLE } from '../../../src/config/schema';

test('every rule targets a table the service will load', () => {
  for (const rule of regoleValidazione()) {
    expect(VALIDATION_TABLES).toContain(rule.table);
  }
});

test('rule ids are unique', () => {
  const ids = regoleValidazione().map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('the spec FK map is covered', () => {
  const fks = regoleValidazione().filter((r) => r.type === 'foreignKey');
  const pairs = fks.map((r) => `${r.table}.${r.column}->${r.targetTable}.${r.targetColumn}`);
  expect(pairs).toContain('ALUNNI.CLASSE->CLASSI.ID');
  expect(pairs).toContain('CLASSI.INDIRIZZO->INDIRIZZI.ID');
  expect(pairs).toContain('DIPART.MATERIE->MATERIE.ID');
  expect(pairs).toContain('SUPPLENZE.SUPPLENTE->DOCENTI.EMAIL');
  expect(pairs).toContain('LOG_MAIL.PATTERN->CONF_MAIL.ID');
  expect(pairs).toContain('LOG_FOLD.TIPO->CONF_DOC.ID');
  expect(fks.length).toBeGreaterThanOrEqual(28);
});

test('SUPPLENZE/VARIAZIONI class and subject lists accept the * wildcard', () => {
  const wildcarded = regoleValidazione().filter(
    (r) => r.type === 'foreignKey' && r.allowWildcard === true
  );
  expect(wildcarded.map((r) => `${r.table}.${r.column}`)).toEqual(
    expect.arrayContaining([
      'SUPPLENZE.CLASSI',
      'SUPPLENZE.MATERIE',
      'VARIAZIONI_CATTEDRA.CLASSI',
      'VARIAZIONI_CATTEDRA.MATERIE'
    ])
  );
});

test('ENUM rules use the domain enums', () => {
  const genere = regoleValidazione().find((r) => r.id === 'ENUM_DOCENTI_GENERE');
  expect(genere).toMatchObject({ type: 'enum', table: TABLE.DOCENTI, column: 'GENERE', values: ['M', 'F'] });
});

test('messaggioErrore renders Italian text per violation type', () => {
  expect(
    messaggioErrore({
      ruleId: 'FK', type: 'foreignKey', table: 'ALUNNI', rowIndex: 3, column: 'CLASSE', value: '99X',
      details: { targetTable: 'CLASSI', targetColumn: 'ID' }
    })
  ).toBe('FK violata: CLASSE "99X" non esiste in CLASSI.ID');

  expect(
    messaggioErrore({ ruleId: 'J', type: 'json', table: 'CONF_DOC', rowIndex: 0, column: 'MODELLI', value: '{', details: {} })
  ).toBe('JSON non valido nel campo MODELLI');

  expect(
    messaggioErrore({ ruleId: 'R', type: 'required', table: 'DOCENTI', rowIndex: 0, column: 'NOME', value: '', details: {} })
  ).toBe('Campo obbligatorio vuoto: NOME');

  expect(
    messaggioErrore({ ruleId: 'E', type: 'enum', table: 'DOCENTI', rowIndex: 0, column: 'GENERE', value: 'X', details: { values: ['M', 'F'] } })
  ).toBe('Valore non ammesso per GENERE: "X" (ammessi: M, F)');

  expect(
    messaggioErrore({ ruleId: 'ITP_CLASSI', type: 'rowPredicate', table: 'CLASSI', rowIndex: 0, column: 'INF.itp', value: 'x@y.it', details: {} })
  ).toBe('Colonna ITP INF.itp: il docente "x@y.it" non ha DOCENTI.ITP = true');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/config/validation-rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/config/validationRules.ts`:

```typescript
import {
  TABLE,
  COL_ALUNNI,
  COL_CLASSI,
  COL_DOCENTI,
  COL_MATERIE,
  COL_INDIRIZZI,
  COL_DIPART,
  COL_RUOLI,
  COL_PIANI,
  COL_CARENZE,
  COL_PROGETTI,
  COL_MOV_ALUNNI,
  COL_ASL,
  COL_SUPPLENZE,
  COL_VARIAZIONI_CATTEDRA,
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_CONF_IMP,
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  COL_LOG_MAIL
} from './schema';
import {
  ReligioneScelta,
  Genere,
  StatoDocumento,
  DuplicazioneDocumento,
  FormatoOutput,
  GestioneArticolazione,
  GestioneSupplenti,
  ProcessoInvio,
  StatoEmail,
  TipoIstituto,
  TipoPiano,
  TipoProgetto,
  TipoMovimento
} from '../domain/value-objects/enums';

/** Tables the validator reads (every table except MASTER, which lives in another spreadsheet). */
export const VALIDATION_TABLES: string[] = Object.values(TABLE).filter((t) => t !== TABLE.MASTER);

/** Religione columns of CLASSI hold docente emails, not materia ids (01). */
const CLASSI_NON_MATERIA_COLUMNS = [COL_CLASSI.IRC, COL_CLASSI.ALT];

function cell(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  return value === null || value === undefined ? '' : String(value).trim();
}

/** `INF.itp` / `LAB.GRUPPO_A` -> `INF` / `LAB`: the base MATERIE.ID of a dynamic column. */
function baseMateria(columnName: string): string {
  return columnName.split('.')[0] ?? columnName;
}

function fk(
  id: string,
  table: string,
  column: string,
  targetTable: string,
  targetColumn: string,
  options: { csv?: boolean; allowWildcard?: boolean } = {}
): DatasetValidationRule {
  return { id, type: 'foreignKey', table, column, targetTable, targetColumn, ...options };
}

function json(table: string, column: string): DatasetValidationRule {
  return { id: `JSON_${table}_${column}`, type: 'json', table, column };
}

function required(table: string, columns: string[]): DatasetValidationRule {
  return { id: `REQ_${table}`, type: 'required', table, columns };
}

function enumRule(
  id: string,
  table: string,
  column: string,
  values: string[]
): DatasetValidationRule {
  return { id, type: 'enum', table, column, values };
}

/** The complete SGSA rule table (design doc Feature 2 §Checks). */
export function regoleValidazione(): DatasetValidationRule[] {
  return [
    // --- 1. Foreign keys ---
    fk('FK_ALUNNI_CLASSE', TABLE.ALUNNI, COL_ALUNNI.CLASSE, TABLE.CLASSI, COL_CLASSI.ID),
    fk('FK_CLASSI_INDIRIZZO', TABLE.CLASSI, COL_CLASSI.INDIRIZZO, TABLE.INDIRIZZI, COL_INDIRIZZI.ID),
    fk('FK_CLASSI_COORD', TABLE.CLASSI, COL_CLASSI.COORD, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_CLASSI_IRC', TABLE.CLASSI, COL_CLASSI.IRC, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_CLASSI_ALT', TABLE.CLASSI, COL_CLASSI.ALT, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_DOCENTI_DIPART', TABLE.DOCENTI, COL_DOCENTI.DIPART, TABLE.DIPART, COL_DIPART.ID),
    fk('FK_DIPART_CAPO', TABLE.DIPART, COL_DIPART.CAPO, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_DIPART_MATERIE', TABLE.DIPART, COL_DIPART.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true }),
    fk('FK_RUOLI_DOCENTE', TABLE.RUOLI, COL_RUOLI.DOCENTE, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_SUPPLENZE_TITOLARE', TABLE.SUPPLENZE, COL_SUPPLENZE.TITOLARE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_SUPPLENZE_SUPPLENTE', TABLE.SUPPLENZE, COL_SUPPLENZE.SUPPLENTE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_SUPPLENZE_CLASSI', TABLE.SUPPLENZE, COL_SUPPLENZE.CLASSI, TABLE.CLASSI, COL_CLASSI.ID, { csv: true, allowWildcard: true }),
    fk('FK_SUPPLENZE_MATERIE', TABLE.SUPPLENZE, COL_SUPPLENZE.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true, allowWildcard: true }),
    fk('FK_VARIAZIONI_TITOLARE', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.TITOLARE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_VARIAZIONI_NUOVO_TITOLARE', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_VARIAZIONI_CLASSI', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.CLASSI, TABLE.CLASSI, COL_CLASSI.ID, { csv: true, allowWildcard: true }),
    fk('FK_VARIAZIONI_MATERIE', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true, allowWildcard: true }),
    fk('FK_CARENZE_STUDENTE', TABLE.CARENZE, COL_CARENZE.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_CARENZE_CLASSE', TABLE.CARENZE, COL_CARENZE.CLASSE, TABLE.CLASSI, COL_CLASSI.ID),
    fk('FK_PIANI_STUDENTE', TABLE.PIANI, COL_PIANI.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_PROGETTI_CLASSE', TABLE.PROGETTI, COL_PROGETTI.CLASSE, TABLE.CLASSI, COL_CLASSI.ID),
    fk('FK_MOV_ALUNNI_STUDENTE', TABLE.MOV_ALUNNI, COL_MOV_ALUNNI.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_ASL_STUDENTE', TABLE.ASL, COL_ASL.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_LOG_DOCS_ID_GEN', TABLE.LOG_DOCS, COL_LOG_DOCS.ID_GEN, TABLE.CONF_DOC, COL_CONF_DOC.ID),
    fk('FK_LOG_DOCS_CLASSI', TABLE.LOG_DOCS, COL_LOG_DOCS.CLASSI, TABLE.CLASSI, COL_CLASSI.ID, { csv: true }),
    fk('FK_LOG_DOCS_MATERIE', TABLE.LOG_DOCS, COL_LOG_DOCS.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true }),
    fk('FK_LOG_FOLD_TIPO', TABLE.LOG_FOLD, COL_LOG_FOLD.TIPO, TABLE.CONF_DOC, COL_CONF_DOC.ID),
    fk('FK_LOG_MAIL_PATTERN', TABLE.LOG_MAIL, COL_LOG_MAIL.PATTERN, TABLE.CONF_MAIL, COL_CONF_MAIL.ID),

    // --- 2. JSON fields ---
    json(TABLE.ALUNNI, COL_ALUNNI.CURRICULUM),
    json(TABLE.CLASSI, COL_CLASSI.RUOLI),
    json(TABLE.CLASSI, COL_CLASSI.ARTICOLAZIONE),
    json(TABLE.MATERIE, COL_MATERIE.ESAME_CFG),
    json(TABLE.MATERIE, COL_MATERIE.EVOLUZIONE),
    json(TABLE.CONF_DOC, COL_CONF_DOC.MODELLI),
    json(TABLE.CONF_DOC, COL_CONF_DOC.PERMESSI),
    json(TABLE.CONF_DOC, COL_CONF_DOC.PARAMETRI),
    json(TABLE.CONF_DOC, COL_CONF_DOC.POST_PROCESSO),
    json(TABLE.CONF_DOC, COL_CONF_DOC.REGISTRA_DOC),
    json(TABLE.CONF_DOC, COL_CONF_DOC.REGISTRA_FOLD),
    json(TABLE.CONF_MAIL, COL_CONF_MAIL.BOX_CFG),
    json(TABLE.CONF_MAIL, COL_CONF_MAIL.POST_PROCESSO),
    json(TABLE.CONF_MAIL, COL_CONF_MAIL.ALLEGATI),
    json(TABLE.CONF_IMP, COL_CONF_IMP.CONFIG),
    json(TABLE.LOG_MAIL, COL_LOG_MAIL.ALLEGATI),

    // --- 3. Required fields ---
    required(TABLE.ALUNNI, [COL_ALUNNI.EMAIL]),
    required(TABLE.DOCENTI, [COL_DOCENTI.EMAIL, COL_DOCENTI.COGNOME, COL_DOCENTI.NOME]),
    required(TABLE.CLASSI, [COL_CLASSI.ID]),
    required(TABLE.MATERIE, [COL_MATERIE.ID, COL_MATERIE.NOME]),
    required(TABLE.INDIRIZZI, [COL_INDIRIZZI.ID, COL_INDIRIZZI.NOME]),
    required(TABLE.DIPART, [COL_DIPART.ID, COL_DIPART.NOME]),
    required(TABLE.RUOLI, [COL_RUOLI.ID, COL_RUOLI.NOME]),
    required(TABLE.CONF_DOC, [COL_CONF_DOC.ID, COL_CONF_DOC.GENERATORE]),
    required(TABLE.CONF_MAIL, [COL_CONF_MAIL.ID, COL_CONF_MAIL.PROCESSO]),
    required(TABLE.CONF_IMP, [COL_CONF_IMP.ID, COL_CONF_IMP.TARGET]),
    required(TABLE.LOG_DOCS, [COL_LOG_DOCS.ID]),

    // --- 4. ENUM values ---
    enumRule('ENUM_ALUNNI_RELIGIONE', TABLE.ALUNNI, COL_ALUNNI.RELIGIONE, Object.values(ReligioneScelta)),
    enumRule('ENUM_DOCENTI_GENERE', TABLE.DOCENTI, COL_DOCENTI.GENERE, Object.values(Genere)),
    enumRule('ENUM_LOG_DOCS_STATO', TABLE.LOG_DOCS, COL_LOG_DOCS.STATO, Object.values(StatoDocumento)),
    enumRule('ENUM_CONF_DOC_DUPLICAZIONE', TABLE.CONF_DOC, COL_CONF_DOC.DUPLICAZIONE, Object.values(DuplicazioneDocumento)),
    enumRule('ENUM_CONF_DOC_FORMATO', TABLE.CONF_DOC, COL_CONF_DOC.FORMATO, Object.values(FormatoOutput)),
    enumRule('ENUM_CONF_DOC_ARTICOLAZIONE', TABLE.CONF_DOC, COL_CONF_DOC.GESTIONE_ARTICOLAZIONE, Object.values(GestioneArticolazione)),
    enumRule('ENUM_CONF_MAIL_ARTICOLAZIONE', TABLE.CONF_MAIL, COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE, Object.values(GestioneArticolazione)),
    enumRule('ENUM_CONF_MAIL_DUPLICAZIONE', TABLE.CONF_MAIL, COL_CONF_MAIL.DUPLICAZIONE, Object.values(DuplicazioneDocumento)),
    enumRule('ENUM_CONF_MAIL_SUPPLENTI', TABLE.CONF_MAIL, COL_CONF_MAIL.SUPPLENTI, Object.values(GestioneSupplenti)),
    enumRule('ENUM_CONF_MAIL_PROCESSO', TABLE.CONF_MAIL, COL_CONF_MAIL.PROCESSO, Object.values(ProcessoInvio)),
    enumRule('ENUM_LOG_MAIL_STATO', TABLE.LOG_MAIL, COL_LOG_MAIL.STATO, Object.values(StatoEmail)),
    enumRule('ENUM_INDIRIZZI_TIPO', TABLE.INDIRIZZI, COL_INDIRIZZI.TIPO, Object.values(TipoIstituto)),
    enumRule('ENUM_PIANI_TIPO', TABLE.PIANI, COL_PIANI.TIPO, Object.values(TipoPiano)),
    enumRule('ENUM_PROGETTI_TIPO', TABLE.PROGETTI, COL_PROGETTI.TIPO, Object.values(TipoProgetto)),
    enumRule('ENUM_MOV_ALUNNI_TIPO', TABLE.MOV_ALUNNI, COL_MOV_ALUNNI.TIPO, Object.values(TipoMovimento)),

    // --- 5. Dynamic column integrity ---
    {
      id: 'DYN_CLASSI',
      type: 'columnName',
      table: TABLE.CLASSI,
      knownColumns: Object.values(COL_CLASSI),
      ignore: CLASSI_NON_MATERIA_COLUMNS,
      targetTable: TABLE.MATERIE,
      targetColumn: COL_MATERIE.ID,
      normalize: baseMateria
    },
    {
      id: 'DYN_CARENZE',
      type: 'columnName',
      table: TABLE.CARENZE,
      knownColumns: Object.values(COL_CARENZE),
      ignore: CLASSI_NON_MATERIA_COLUMNS,
      targetTable: TABLE.MATERIE,
      targetColumn: COL_MATERIE.ID,
      normalize: baseMateria
    },

    // --- 6. ITP invariant ---
    {
      id: 'ITP_CLASSI',
      type: 'rowPredicate',
      table: TABLE.CLASSI,
      check: (row, ctx) => {
        const itpEmails = new Set<string>();
        for (const [column, value] of Object.entries(row)) {
          if (!column.endsWith('.itp')) continue;
          const raw = value === null || value === undefined ? '' : String(value);
          for (const email of raw.split(',').map((s) => s.trim()).filter((s) => s !== '')) {
            itpEmails.add(`${column}|${email}`);
          }
        }
        for (const entry of itpEmails) {
          const [column, email] = entry.split('|') as [string, string];
          const docente = (ctx.datasets[TABLE.DOCENTI] ?? []).find(
            (d) => cell(d, COL_DOCENTI.EMAIL) === email
          );
          const isItp = docente?.[COL_DOCENTI.ITP];
          if (isItp === true || String(isItp).toUpperCase() === 'TRUE') continue;
          return { column, value: email };
        }
        return null;
      }
    },

    // --- 7. MATERIE composite rows ---
    {
      id: 'MATERIE_COMPOSITE_PRINCIPALE',
      type: 'rowPredicate',
      table: TABLE.MATERIE,
      check: (row) => {
        const id = cell(row, COL_MATERIE.ID);
        if (!id.includes('.')) return null;
        if (cell(row, COL_MATERIE.PRINCIPALE) !== '') return null;
        return { column: COL_MATERIE.PRINCIPALE, value: id };
      }
    },

    // --- 8. Curriculum coverage (Feature 4) ---
    // Every subject the class's INDIRIZZO marks mandatory for the class's ANNO
    // must have a corresponding column in CLASSI. The reverse direction is
    // deliberately NOT checked (extra columns are legitimate).
    {
      id: 'CURRICULUM_COVERAGE',
      type: 'rowPredicate',
      table: TABLE.CLASSI,
      check: (row, ctx) => {
        const indirizzo = cell(row, COL_CLASSI.INDIRIZZO);
        const anno = cell(row, COL_CLASSI.ANNO);
        if (indirizzo === '' || anno === '') return null;
        const colonne = new Set(Object.keys(row).map(baseMateria));
        for (const materia of ctx.datasets[TABLE.MATERIE] ?? []) {
          const anniRaw = materia[indirizzo];
          if (anniRaw === undefined) continue; // address has no curriculum column yet
          const anni = String(anniRaw ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== '');
          if (!anni.includes(anno)) continue;
          const materiaId = cell(materia, COL_MATERIE.ID);
          if (colonne.has(baseMateria(materiaId))) continue;
          return { column: materiaId, value: materiaId, details: { indirizzo, anno } };
        }
        return null;
      }
    }
  ];
}

/** Italian ERRORE text for the report sheet (design doc Feature 2 §Output Format). */
export function messaggioErrore(v: DatasetViolation): string {
  switch (v.type) {
    case 'foreignKey':
      return `FK violata: ${v.column} "${v.value}" non esiste in ${String(v.details['targetTable'])}.${String(v.details['targetColumn'])}`;
    case 'json':
      return `JSON non valido nel campo ${v.column}`;
    case 'required':
      return `Campo obbligatorio vuoto: ${v.column}`;
    case 'enum':
      return `Valore non ammesso per ${v.column}: "${v.value}" (ammessi: ${(v.details['values'] as string[]).join(', ')})`;
    case 'columnName':
      return `Colonna dinamica ${v.column} non corrisponde a nessun ${String(v.details['targetTable'])}.${String(v.details['targetColumn'])}`;
    default:
      break;
  }
  switch (v.ruleId) {
    case 'ITP_CLASSI':
      return `Colonna ITP ${v.column}: il docente "${v.value}" non ha DOCENTI.ITP = true`;
    case 'MATERIE_COMPOSITE_PRINCIPALE':
      return `Materia composita "${v.value}": PRINCIPALE è obbligatorio`;
    case 'CURRICULUM_COVERAGE':
      return `Materia "${v.value}" obbligatoria per l'indirizzo ${String(v.details['indirizzo'])} anno ${String(v.details['anno'])}: colonna assente in CLASSI`;
    default:
      return `Violazione ${v.ruleId} sul campo ${v.column}`;
  }
}
```

Note on `CONF_DOC.GENERATORE`: the spec lists it in the FK table with target "(strategy registry)". It is validated as a required field here; the registry is built at runtime in `Bootstrap.ts` and is not a DB table, so a data-only rule cannot check it. `RenderTemplateStep` already fails typed with "GENERATORE non registrato" at generation time.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/config/validation-rules.test.ts && npm run typecheck && npm run lint`
Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/config/validationRules.ts test/unit/config/validation-rules.test.ts
git commit -m "feat(validation): declare the SGSA database validation rule table"
```

---

### Task 7: `DatabaseValidationService` + report facade

**Files:**
- Create: `src/infrastructure/facades/SpreadsheetReportFacade.ts`
- Create: `test/fakes/FakeSpreadsheetReportFacade.ts`
- Create: `src/application/services/DatabaseValidationService.ts`
- Test: `test/unit/application/database-validation-service.test.ts`

**Interfaces:**
- Consumes: Task 5's `DatasetValidator`; Task 6's `regoleValidazione` / `messaggioErrore` / `VALIDATION_TABLES`; `IDatabase` (`src/infrastructure/db/Database.ts`); `IMasterSheetRepository`.
- Produces:

```typescript
export interface ISpreadsheetReportFacade {
  /** Creates a spreadsheet named `nome` in `folderId` and writes `righe` (row 1 = header). Returns its id. */
  creaReport(nome: string, folderId: string, righe: string[][]): string;
}

export interface ValidationRow { tabella: string; riga: number; campo: string; valore: string; errore: string }
export interface ValidationReport { violazioni: ValidationRow[]; spreadsheetId: string; nome: string }

export class DatabaseValidationService {
  constructor(deps: {
    db: IDatabase;
    master: IMasterSheetRepository;
    report: ISpreadsheetReportFacade;
    logger?: LoggerService;
  });
  esegui(): ValidationReport;
}
```

- [ ] **Step 1: Write the failing test**

Create `test/fakes/FakeSpreadsheetReportFacade.ts`:

```typescript
import type { ISpreadsheetReportFacade } from '../../src/infrastructure/facades/SpreadsheetReportFacade';

export class FakeSpreadsheetReportFacade implements ISpreadsheetReportFacade {
  public readonly reports: Array<{ nome: string; folderId: string; righe: string[][] }> = [];

  creaReport(nome: string, folderId: string, righe: string[][]): string {
    this.reports.push({ nome, folderId, righe });
    return `report_${this.reports.length}`;
  }
}
```

Create `test/unit/application/database-validation-service.test.ts`:

```typescript
import { DatabaseValidationService } from '../../../src/application/services/DatabaseValidationService';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeSpreadsheetReportFacade } from '../../fakes/FakeSpreadsheetReportFacade';
import { MasterConfig } from '../../../src/domain/entities/MasterConfig';
import type { IMasterSheetRepository } from '../../../src/domain/repositories/IMasterSheetRepository';

function master(): IMasterSheetRepository {
  const config = new MasterConfig({
    ANNO_SCOLASTICO: '2026-2027',
    ID_SPREADSHEET: 'ss1',
    ID_CARTELLA_GOOGLE: 'root1'
  });
  return {
    findConfigAnnoCorrente: () => config,
    findByAnno: () => config
  } as unknown as IMasterSheetRepository;
}

function tabelleValide(): Record<string, Array<Record<string, unknown>>> {
  return {
    INDIRIZZI: [{ ID: 'LS', NOME: 'Scientifico', NOME_SINTETICO: 'LS', TIPO: 'LICEO' }],
    MATERIE: [{ ID: 'MAT', NOME: 'Matematica', LS: '1' }],
    DOCENTI: [{ EMAIL: 'p@x.it', COGNOME: 'Rossi', NOME: 'Mario', ITP: false }],
    CLASSI: [{ ID: '1A', ANNO: '1', INDIRIZZO: 'LS', MAT: 'p@x.it' }],
    ALUNNI: [{ EMAIL: 'a@x.it', CLASSE: '1A' }]
  };
}

function servizio(tabelle: Record<string, Array<Record<string, unknown>>>): {
  service: DatabaseValidationService;
  report: FakeSpreadsheetReportFacade;
} {
  const report = new FakeSpreadsheetReportFacade();
  const service = new DatabaseValidationService({
    db: new FakeDatabase(tabelle as never),
    master: master(),
    report
  });
  return { service, report };
}

test('a clean database produces no violations and a TUTTO OK report', () => {
  const { service, report } = servizio(tabelleValide());
  const esito = service.esegui();
  expect(esito.violazioni).toEqual([]);
  expect(esito.nome).toBe('Validazione DB - 2026-2027');
  expect(report.reports[0]!.folderId).toBe('root1');
  expect(report.reports[0]!.righe).toEqual([
    ['TABELLA', 'RIGA', 'CAMPO', 'VALORE', 'ERRORE'],
    ['TUTTO OK - Nessun errore rilevato', '', '', '', '']
  ]);
});

test('a broken FK is reported with the sheet row number (index + 2)', () => {
  const tabelle = tabelleValide();
  tabelle['ALUNNI'] = [{ EMAIL: 'a@x.it', CLASSE: '1A' }, { EMAIL: 'b@x.it', CLASSE: '99X' }];
  const { service, report } = servizio(tabelle);
  const esito = service.esegui();
  const violazione = esito.violazioni.find((v) => v.tabella === 'ALUNNI' && v.campo === 'CLASSE');
  expect(violazione).toEqual({
    tabella: 'ALUNNI',
    riga: 3,
    campo: 'CLASSE',
    valore: '99X',
    errore: 'FK violata: CLASSE "99X" non esiste in CLASSI.ID'
  });
  expect(report.reports[0]!.righe[0]).toEqual(['TABELLA', 'RIGA', 'CAMPO', 'VALORE', 'ERRORE']);
  expect(report.reports[0]!.righe).toContainEqual([
    'ALUNNI', '3', 'CLASSE', '99X', 'FK violata: CLASSE "99X" non esiste in CLASSI.ID'
  ]);
});

test('an ITP column assigned to a non-ITP docente is reported', () => {
  const tabelle = tabelleValide();
  tabelle['MATERIE'] = [{ ID: 'MAT', NOME: 'Matematica', LS: '1' }, { ID: 'INF', NOME: 'Informatica' }];
  tabelle['CLASSI'] = [{ ID: '1A', ANNO: '1', INDIRIZZO: 'LS', MAT: 'p@x.it', 'INF.itp': 'p@x.it' }];
  const { service } = servizio(tabelle);
  expect(service.esegui().violazioni.map((v) => v.errore)).toContain(
    'Colonna ITP INF.itp: il docente "p@x.it" non ha DOCENTI.ITP = true'
  );
});

test('a curriculum subject with no CLASSI column is reported (Feature 4)', () => {
  const tabelle = tabelleValide();
  tabelle['MATERIE'] = [
    { ID: 'MAT', NOME: 'Matematica', LS: '1' },
    { ID: 'ITA', NOME: 'Italiano', LS: '1,2' }
  ];
  const { service } = servizio(tabelle);
  expect(service.esegui().violazioni.map((v) => v.errore)).toContain(
    "Materia \"ITA\" obbligatoria per l'indirizzo LS anno 1: colonna assente in CLASSI"
  );
});

test('violations are ordered by table then row', () => {
  const tabelle = tabelleValide();
  tabelle['ALUNNI'] = [{ EMAIL: '', CLASSE: '99X' }];
  const { service } = servizio(tabelle);
  const righe = service.esegui().violazioni.filter((v) => v.tabella === 'ALUNNI');
  expect(righe.map((v) => v.riga)).toEqual([2, 2]);
  expect(righe.map((v) => v.campo).sort()).toEqual(['CLASSE', 'EMAIL']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/database-validation-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the facade**

Create `src/infrastructure/facades/SpreadsheetReportFacade.ts`:

```typescript
/**
 * Report-writing port (Feature 2): creates a standalone spreadsheet in a Drive
 * folder and fills its default tab. Wraps GoogleApiWrapper's SpreadsheetService
 * (createSpreadsheet + updateRanges) behind an ALDO-owned interface — the same
 * pattern the online-test GasArtifactFactory already uses, lifted into
 * production infrastructure.
 */
export interface ISpreadsheetReportFacade {
  /** Creates `nome` inside `folderId`, writes `righe` starting at A1, returns the spreadsheet id. */
  creaReport(nome: string, folderId: string, righe: string[][]): string;
}

export class SpreadsheetReportFacade implements ISpreadsheetReportFacade {
  constructor(private readonly spreadsheets: SpreadsheetService) {}

  creaReport(nome: string, folderId: string, righe: string[][]): string {
    const created = this.spreadsheets.createSpreadsheet(nome, { destinationFolder: folderId });
    if (righe.length === 0) return created.spreadsheetId;
    // `sheets[0].properties.title` comes from the create response itself (its
    // name is locale-dependent: "Foglio1" vs "Sheet1"), so no extra read.
    const sheetName = created.sheets?.[0]?.properties.title ?? 'Sheet1';
    const escaped = sheetName.replace(/'/g, "''");
    this.spreadsheets.updateRanges(created.spreadsheetId, {
      range: `'${escaped}'!A1`,
      values: righe
    });
    return created.spreadsheetId;
  }
}
```

- [ ] **Step 4: Write the service**

Create `src/application/services/DatabaseValidationService.ts`:

```typescript
import type { IDatabase } from '../../infrastructure/db/Database';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { ISpreadsheetReportFacade } from '../../infrastructure/facades/SpreadsheetReportFacade';
import { VALIDATION_TABLES, regoleValidazione, messaggioErrore } from '../../config/validationRules';

/** One row of the report sheet (design doc Feature 2 §Output Format). */
export interface ValidationRow {
  tabella: string;
  riga: number;
  campo: string;
  valore: string;
  errore: string;
}

export interface ValidationReport {
  violazioni: ValidationRow[];
  spreadsheetId: string;
  nome: string;
}

const HEADER = ['TABELLA', 'RIGA', 'CAMPO', 'VALORE', 'ERRORE'];
const NESSUN_ERRORE = 'TUTTO OK - Nessun errore rilevato';

export interface DatabaseValidationDeps {
  db: IDatabase;
  master: IMasterSheetRepository;
  report: ISpreadsheetReportFacade;
  logger?: LoggerService;
}

/**
 * Feature 2: validates the current year's database (FK integrity, JSON
 * validity, required fields, ENUM values, dynamic-column integrity, the ITP
 * invariant, MATERIE composite rows and curriculum coverage) and writes the
 * result as a spreadsheet in the year's Drive root.
 *
 * The rule ENGINE is GasSchemaValidatorLib's `DatasetValidator`; this service
 * owns only the SGSA rule table (src/config/validationRules.ts), the sheet-row
 * numbering and the Italian report layout. Read-only: it never mutates the DB.
 */
export class DatabaseValidationService {
  private readonly logger: LoggerService;

  constructor(private readonly deps: DatabaseValidationDeps) {
    this.logger = deps.logger ?? new LoggerService();
  }

  esegui(): ValidationReport {
    const datasets = this.leggiTabelle();
    const { violations } = new DatasetValidator({ logger: this.logger }).validate(
      datasets,
      regoleValidazione()
    );
    const violazioni = violations
      .map((v) => ({
        tabella: v.table,
        // DatasetValidator row indexes are 0-based within the data array; the
        // sheet has a header row, so the physical row is index + 2.
        riga: v.rowIndex + 2,
        campo: v.column,
        valore: v.value,
        errore: messaggioErrore(v)
      }))
      .sort((a, b) => a.tabella.localeCompare(b.tabella) || a.riga - b.riga);

    const anno = this.deps.master.findConfigAnnoCorrente();
    const nome = `Validazione DB - ${anno.annoScolasticoRaw}`;
    const righe =
      violazioni.length === 0
        ? [HEADER, [NESSUN_ERRORE, '', '', '', '']]
        : [HEADER, ...violazioni.map((v) => [v.tabella, String(v.riga), v.campo, v.valore, v.errore])];

    const spreadsheetId = this.deps.report.creaReport(nome, anno.idCartellaRoot, righe);
    this.logger.info(`Validazione DB: ${violazioni.length} violazioni, report ${spreadsheetId}`);
    return { violazioni, spreadsheetId, nome };
  }

  private leggiTabelle(): Record<string, Array<Record<string, unknown>>> {
    const datasets: Record<string, Array<Record<string, unknown>>> = {};
    for (const table of VALIDATION_TABLES) {
      datasets[table] = this.deps.db.table(table).findAll();
    }
    return datasets;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/database-validation-service.test.ts && npm run typecheck && npm run lint`
Expected: PASS / exit 0.

Note on `columnName` rules: `DatasetValidator` derives the column list from the row objects, so a table with zero rows contributes no dynamic-column violations. That is intended — an empty sheet has no data to contradict.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/facades/SpreadsheetReportFacade.ts src/application/services/DatabaseValidationService.ts test/fakes/FakeSpreadsheetReportFacade.ts test/unit/application/database-validation-service.test.ts
git commit -m "feat(validation): add DatabaseValidationService and report facade"
```

---

### Task 8: Menu entry + wiring for validation

Adds the confirmation-based wrapper scheme (`avvioConConferma`) that Feature 3 reuses in Task 13.

**Files:**
- Modify: `src/presentation/Menu.ts`, `src/config/Bootstrap.ts`, `src/index.ts`, `src/entrypoints/EntryPoints_Menu.ts`
- Test: `test/unit/presentation/menu.test.ts`, `test/unit/config/bootstrap.test.ts`, `test/unit/index.test.ts`

**Interfaces:**
- Consumes: Task 7's `DatabaseValidationService`.
- Produces:

```typescript
// Menu.ts
export function avvioConConferma(
  ui: IUiFacade,
  titolo: string,
  domanda: string,
  esegui: () => string
): void;
export function menuValidazioneDatabase(ui: IUiFacade, esegui: () => string): void;
// Bootstrap.ts
export function avviaValidazioneDatabase(c: ServiceContainer): ValidationReport;
```

  Confirmation is a typed word: the user must type `CONFERMA` (`IUiFacade` has no yes/no dialog, and adding one would need the native `SpreadsheetApp.getUi().ButtonSet` enum, which ALDO may not touch). `esegui` returns the Italian summary shown to the user afterwards.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/presentation/menu.test.ts`:

```typescript
import { avvioConConferma, menuValidazioneDatabase, vociMenu } from '../../../src/presentation/Menu';

test('vociMenu exposes the five launchers', () => {
  expect(vociMenu().map((v) => v.funzione)).toEqual([
    'menu_avvioGenerazioneDocumenti',
    'menu_avvioComunicazioniEmail',
    'menu_avvioImportazioni',
    'menu_validazioneDatabase',
    'menu_bloccaDocumenti'
  ]);
});

test('avvioConConferma runs only when the user types CONFERMA', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  let eseguito = 0;
  avvioConConferma(ui, 'TITOLO', 'Domanda?', () => {
    eseguito += 1;
    return 'Fatto: 3 elementi';
  });
  expect(eseguito).toBe(1);
  expect(ui.messaggi.at(-1)!.messaggio).toBe('Fatto: 3 elementi');
});

test('avvioConConferma aborts on anything else', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('no');
  let eseguito = 0;
  avvioConConferma(ui, 'TITOLO', 'Domanda?', () => {
    eseguito += 1;
    return '';
  });
  expect(eseguito).toBe(0);
  expect(ui.messaggi[0]!.messaggio).toContain('annullata');
});

test('avvioConConferma surfaces errors as a message instead of throwing', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  expect(() =>
    avvioConConferma(ui, 'TITOLO', 'Domanda?', () => {
      throw new Error('boom');
    })
  ).not.toThrow();
  expect(ui.messaggi.at(-1)!.messaggio).toBe('Errore: boom');
});

test('menuValidazioneDatabase confirms then delegates', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  let chiamate = 0;
  menuValidazioneDatabase(ui, () => {
    chiamate += 1;
    return 'Report creato';
  });
  expect(chiamate).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/presentation/menu.test.ts`
Expected: FAIL — `avvioConConferma` is not exported; `vociMenu` returns three entries.

- [ ] **Step 3: Write the Menu implementation**

In `src/presentation/Menu.ts`, extend `vociMenu()`:

```typescript
export function vociMenu(): MenuVoce[] {
  return [
    { etichetta: 'GENERAZIONE DOCUMENTI', funzione: 'menu_avvioGenerazioneDocumenti' },
    { etichetta: 'COMUNICAZIONI EMAIL', funzione: 'menu_avvioComunicazioniEmail' },
    { etichetta: 'IMPORTAZIONI', funzione: 'menu_avvioImportazioni' },
    { etichetta: 'VALIDAZIONE DATABASE', funzione: 'menu_validazioneDatabase' },
    { etichetta: 'BLOCCA DOCUMENTI', funzione: 'menu_bloccaDocumenti' }
  ];
}
```

Update its doc comment ("The three data-driven launchers (15 §3)") to say five, and add:

```typescript
export const PAROLA_CONFERMA = 'CONFERMA';

/**
 * Wrapper scheme for launchers that take no configuration id but DO need an
 * explicit go-ahead (15 §4 variant): typed confirmation → delegation → outcome
 * message. Typed rather than a yes/no dialog because `IUiFacade` exposes no
 * button-set prompt and the native `SpreadsheetApp.getUi().ButtonSet` enum is
 * off-limits to ALDO code.
 */
export function avvioConConferma(
  ui: IUiFacade,
  titolo: string,
  domanda: string,
  esegui: () => string
): void {
  const risposta = ui.chiediInput(titolo, `${domanda}\n\nScrivi ${PAROLA_CONFERMA} per procedere.`);
  if (risposta.toUpperCase() !== PAROLA_CONFERMA) {
    ui.mostraMessaggio(titolo, 'Operazione annullata.');
    return;
  }
  try {
    ui.mostraMessaggio(titolo, esegui());
  } catch (e) {
    ui.mostraMessaggio(titolo, `Errore: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function menuValidazioneDatabase(ui: IUiFacade, esegui: () => string): void {
  avvioConConferma(
    ui,
    'VALIDAZIONE DATABASE',
    "Verificare l'integrità del database dell'anno corrente?",
    esegui
  );
}
```

- [ ] **Step 4: Run the Menu tests**

Run: `npx jest --config jest.config.cjs test/unit/presentation/menu.test.ts`
Expected: PASS except `menu_bloccaDocumenti`'s wrapper, which arrives in Task 13 — the `vociMenu` test only asserts the entry name, so it passes now.

- [ ] **Step 5: Wire the service and the launcher in Bootstrap**

In `src/config/Bootstrap.ts`:

Add imports:

```typescript
import { DatabaseValidationService, type ValidationReport } from '../application/services/DatabaseValidationService';
import { SpreadsheetReportFacade, type ISpreadsheetReportFacade } from '../infrastructure/facades/SpreadsheetReportFacade';
```

Add to `BootstrapDeps`:

```typescript
  /**
   * Report-sheet writer (Feature 2). Optional for the same reason as
   * `spreadsheets`: building the real one needs a live SpreadsheetService.
   */
  report?: ISpreadsheetReportFacade;
```

Register in `buildAldoContainer`, next to `reportService`:

```typescript
  if (deps.report !== undefined) {
    const report = deps.report;
    c.register(
      'databaseValidationService',
      () =>
        new DatabaseValidationService({ db: deps.db, master: deps.master, report, logger })
    );
  }
```

Add the launcher near the other launchers:

```typescript
/** Data-driven launcher (15 §4): synchronous DB validation (Feature 2). Not a JobRunner job — one pass over the sheets. */
export function avviaValidazioneDatabase(c: ServiceContainer): ValidationReport {
  if (!c.has('databaseValidationService')) {
    throw new ConfigurationError(
      'Validazione database non disponibile: nessun SpreadsheetService configurato (richiede esecuzione su GAS)'
    );
  }
  return c.get<DatabaseValidationService>('databaseValidationService').esegui();
}
```

In `initAldo`, pass the facade into `buildAldoContainer({...})`:

```typescript
    report: new SpreadsheetReportFacade(spreadsheetService),
```

- [ ] **Step 6: Expose the GAS globals**

In `src/index.ts`, extend the imports and assignments:

```typescript
import { costruisciMenu, menuGenerazioneDocumenti, menuComunicazioniEmail, menuImportazioni, menuValidazioneDatabase } from './presentation/Menu';
```

```typescript
(globalThis as any).avviaValidazioneDatabase = avviaValidazioneDatabase;
(globalThis as any).menuValidazioneDatabase = menuValidazioneDatabase;
```

(add `avviaValidazioneDatabase` to the `./config/Bootstrap` import list too).

In `src/entrypoints/EntryPoints_Menu.ts`, add the ambient declarations and the entry point:

```typescript
declare function menuValidazioneDatabase(ui: unknown, esegui: () => string): void;
declare function avviaValidazioneDatabase(container: unknown): {
  violazioni: unknown[];
  spreadsheetId: string;
  nome: string;
};
```

```typescript
/** Validates the current year's database and writes the report sheet (Feature 2). */
function menu_validazioneDatabase(): void {
  menuValidazioneDatabase(new GasUiFacade(), () => {
    const esito = avviaValidazioneDatabase(initAldo());
    return esito.violazioni.length === 0
      ? `Nessun errore rilevato. Report: ${esito.nome}`
      : `${esito.violazioni.length} violazioni. Report: ${esito.nome}`;
  });
}
```

```typescript
(globalThis as any).menu_validazioneDatabase = menu_validazioneDatabase;
```

- [ ] **Step 7: Extend the wiring tests**

Append to `test/unit/config/bootstrap.test.ts` (reuse the file's existing deps helper; it currently omits `report`, so the guard path is already covered):

```typescript
test('databaseValidationService is registered only when a report facade is wired', () => {
  const senza = buildAldoContainer(deps());
  expect(senza.has('databaseValidationService')).toBe(false);
  expect(() => avviaValidazioneDatabase(senza)).toThrow(/Validazione database non disponibile/);

  const con = buildAldoContainer({ ...deps(), report: new FakeSpreadsheetReportFacade() });
  expect(con.has('databaseValidationService')).toBe(true);
});
```

Append to `test/unit/index.test.ts` (matching how that file asserts the other globals):

```typescript
test('menu_validazioneDatabase and its launcher are exposed as globals', () => {
  expect(typeof (globalThis as Record<string, unknown>)['menuValidazioneDatabase']).toBe('function');
  expect(typeof (globalThis as Record<string, unknown>)['avviaValidazioneDatabase']).toBe('function');
});
```

- [ ] **Step 8: Run the full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:build`
Expected: all green. `test:build` validates the shape of the built bundle — if it asserts an exact list of exposed globals, add the new names there.

- [ ] **Step 9: Commit**

```bash
git add src/presentation/Menu.ts src/config/Bootstrap.ts src/index.ts src/entrypoints/EntryPoints_Menu.ts test/unit
git commit -m "feat(menu): add VALIDAZIONE DATABASE launcher"
```

---

# Phase 4 — Feature 3: lock documents

### Task 9: `changeRolesByPermissionId` in PermissionService

`changeRoles` resolves permissions by `emailAddress`, so `type: 'anyone'` / `'domain'` grants (no email) can never be targeted. Add a permission-id-level sibling.

**Files:**
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/PermissionService.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/PermissionService.test.js`

**Interfaces:**
- Consumes: existing `getPermissions(fileId)` → `Array<{ id, emailAddress, role, type, domain }>`.
- Produces:

```js
permissionService.changeRolesByPermissionId(fileIds, [{ permissionId, newRole }])
// -> { successful: [{fileId, permissionId, newRole, statusCode}], failed: [{fileId, permissionId, error, statusCode}] }
```

  Must invalidate the same `getPermissions` cache key `changeRoles` clears.

- [ ] **Step 1: Write the failing test**

Append to `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/PermissionService.test.js`, following the file's existing mock setup for `Drive.Permissions` and the service constructor:

```javascript
describe('changeRolesByPermissionId', () => {
  test('updates each permission id and reports success', () => {
    const service = buildService(); // existing helper in this file
    global.Drive.Permissions.update = jest.fn(() => ({}));

    const result = service.changeRolesByPermissionId('file1', [
      { permissionId: 'p1', newRole: 'reader' },
      { permissionId: 'p2', newRole: 'reader' }
    ]);

    expect(global.Drive.Permissions.update).toHaveBeenCalledTimes(2);
    expect(global.Drive.Permissions.update).toHaveBeenCalledWith({ role: 'reader' }, 'file1', 'p1');
    expect(result.successful).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  test('isolates a failing permission and keeps going', () => {
    const service = buildService();
    global.Drive.Permissions.update = jest.fn((_res, _fileId, permissionId) => {
      if (permissionId === 'p1') throw new Error('nope');
      return {};
    });

    const result = service.changeRolesByPermissionId(['file1'], [
      { permissionId: 'p1', newRole: 'reader' },
      { permissionId: 'p2', newRole: 'reader' }
    ]);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].permissionId).toBe('p1');
    expect(result.successful).toHaveLength(1);
  });

  test('accepts a single change object and invalidates the permissions cache', () => {
    const service = buildService();
    global.Drive.Permissions.update = jest.fn(() => ({}));
    const removeSpy = jest.spyOn(service._cache, 'remove');

    service.changeRolesByPermissionId('file1', { permissionId: 'p1', newRole: 'reader' });

    expect(removeSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `GasLibraryFactory/`): `npx jest GoogleApiWrapper/src/services/__tests__/PermissionService.test.js -t changeRolesByPermissionId`
Expected: FAIL — `service.changeRolesByPermissionId is not a function`.

- [ ] **Step 3: Write the implementation**

In `GasLibraryFactory/GoogleApiWrapper/src/services/PermissionService.js`, add after `changeRoles`:

```javascript
  /**
   * Changes roles addressed by PERMISSION ID rather than by email.
   *
   * `changeRoles` resolves each change through `emailAddress`, so grants that
   * have no email — `type: 'anyone'` (link sharing) and `type: 'domain'` —
   * are unreachable through it. Callers that enumerate permissions themselves
   * (e.g. "downgrade every writer on this file") use this method.
   *
   * @param {string|string[]} fileIds
   * @param {{permissionId: string, newRole: string}|Array<{permissionId: string, newRole: string}>} roleChanges
   * @param {Object} [_options]
   * @returns {{successful: Array<Object>, failed: Array<Object>}}
   */
  changeRolesByPermissionId(fileIds, roleChanges, _options = {}) {
    const fileIdsArray = Array.isArray(fileIds) ? fileIds : [fileIds];
    const changesArray = Array.isArray(roleChanges) ? roleChanges : [roleChanges];
    const results = { successful: [], failed: [] };

    fileIdsArray.forEach(fileId => {
      changesArray.forEach(change => {
        try {
          this._exceptionService.executeWithRetry(() => Drive.Permissions.update({
            role: change.newRole
          }, fileId, change.permissionId), {}, 3);
          results.successful.push({
            fileId,
            permissionId: change.permissionId,
            newRole: change.newRole,
            statusCode: 200
          });
        } catch (error) {
          results.failed.push({
            fileId,
            permissionId: change.permissionId,
            error: error,
            statusCode: error.code || 500
          });
          this._logger.warn(`Failed to update permission ${change.permissionId} on ${fileId}: ${error.message}`);
        }
      });

      const cacheKey = this._generateCacheKey(this._cachePrefix, fileId, 'getPermissions');
      this._cache.remove(cacheKey);
    });

    return results;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `GasLibraryFactory/`): `npx jest GoogleApiWrapper/src/services/__tests__/PermissionService.test.js && npm run lint`
Expected: PASS / exit 0.

- [ ] **Step 5: Regenerate docs and commit**

```bash
cd GasLibraryFactory
npm run docs
git add GoogleApiWrapper DOCS_LIBS/GoogleApiWrapper.md
git commit -m "feat(GoogleApiWrapper): add changeRolesByPermissionId to PermissionService"
cd ..
```

---

### Task 10: Vendor refresh + Drive facade permission methods

**Files:**
- Modify (generated): `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`
- Modify: `types/gaslibs/index.d.ts`, `src/infrastructure/facades/DriveServiceFacade.ts`, `test/fakes/FakeDriveFacade.ts`
- Test: `test/unit/infrastructure/drive-facade.test.ts`

**Interfaces:**
- Consumes: Task 9's `changeRolesByPermissionId`, existing `getPermissions`.
- Produces, on `IDriveFacade`:

```typescript
export interface DrivePermission {
  id: string;
  email: string | null;
  /** Drive API v3 role: 'owner' | 'writer' | 'commenter' | 'reader' | 'organizer' | ... */
  role: string;
  /** 'user' | 'group' | 'domain' | 'anyone' */
  tipo: string;
}

listPermissions(fileId: string): DrivePermission[];
/** Applies the role changes; returns one entry per FAILED change ([] when all succeeded). */
changePermissionRoles(
  fileId: string,
  changes: Array<{ permissionId: string; role: string }>
): Array<{ permissionId: string; errore: string }>;
```

- [ ] **Step 1: Write the failing test**

Append to `test/unit/infrastructure/drive-facade.test.ts` (reuse the file's existing fake `DriveService`/`PermissionService` construction helper):

```typescript
test('listPermissions maps the library shape onto DrivePermission', () => {
  const permissions = {
    getPermissions: jest.fn(() => [
      { id: 'p1', emailAddress: 'a@x.it', role: 'writer', type: 'user' },
      { id: 'p2', role: 'writer', type: 'anyone' }
    ]),
    changeRolesByPermissionId: jest.fn(() => ({ successful: [], failed: [] }))
  };
  const facade = buildFacade({ permissions }); // existing helper

  expect(facade.listPermissions('f1')).toEqual([
    { id: 'p1', email: 'a@x.it', role: 'writer', tipo: 'user' },
    { id: 'p2', email: null, role: 'writer', tipo: 'anyone' }
  ]);
  expect(permissions.getPermissions).toHaveBeenCalledWith('f1');
});

test('changePermissionRoles returns only the failures', () => {
  const permissions = {
    getPermissions: jest.fn(() => []),
    changeRolesByPermissionId: jest.fn(() => ({
      successful: [{ fileId: 'f1', permissionId: 'p1' }],
      failed: [{ fileId: 'f1', permissionId: 'p2', error: new Error('nope') }]
    }))
  };
  const facade = buildFacade({ permissions });

  const failures = facade.changePermissionRoles('f1', [
    { permissionId: 'p1', role: 'reader' },
    { permissionId: 'p2', role: 'reader' }
  ]);

  expect(permissions.changeRolesByPermissionId).toHaveBeenCalledWith('f1', [
    { permissionId: 'p1', newRole: 'reader' },
    { permissionId: 'p2', newRole: 'reader' }
  ]);
  expect(failures).toEqual([{ permissionId: 'p2', errore: 'nope' }]);
});

test('changePermissionRoles with no changes performs no API call', () => {
  const permissions = {
    getPermissions: jest.fn(() => []),
    changeRolesByPermissionId: jest.fn()
  };
  const facade = buildFacade({ permissions });
  expect(facade.changePermissionRoles('f1', [])).toEqual([]);
  expect(permissions.changeRolesByPermissionId).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts -t "Permission"`
Expected: FAIL — `facade.listPermissions is not a function`.

- [ ] **Step 3: Refresh vendor + declare the library types**

Run: `npm run refresh:vendor && npm run verify:vendor`

In `types/gaslibs/index.d.ts`, extend `class PermissionService` (line ~435):

```typescript
    getPermissions(
      fileId: string
    ): Array<{ id: string; emailAddress?: string; role: string; type: string; domain?: string }>;
    changeRolesByPermissionId(
      fileIds: string | string[],
      roleChanges:
        | { permissionId: string; newRole: string }
        | Array<{ permissionId: string; newRole: string }>
    ): DriveBatchOutcome<unknown> & {
      successful: Array<{ fileId: string; permissionId: string; newRole: string }>;
      failed: Array<{ fileId: string; permissionId: string; error: Error }>;
    };
```

If `DriveBatchOutcome` does not already carry `successful`/`failed` in a compatible shape, declare the return type inline as the object literal above without the intersection.

- [ ] **Step 4: Implement the facade methods**

In `src/infrastructure/facades/DriveServiceFacade.ts`, add to the `IDriveFacade` interface and the exported types:

```typescript
/** One Drive permission as ALDO sees it (subset of the Drive v3 resource). */
export interface DrivePermission {
  id: string;
  /** null for link-wide grants (`tipo` 'anyone'/'domain'), which carry no address. */
  email: string | null;
  role: string;
  tipo: string;
}
```

```typescript
  /** Every permission on the file (Feature 3 — includes link-wide grants). */
  listPermissions(fileId: string): DrivePermission[];
  /** Applies role changes by permission id; returns one entry per FAILED change. */
  changePermissionRoles(
    fileId: string,
    changes: Array<{ permissionId: string; role: string }>
  ): Array<{ permissionId: string; errore: string }>;
```

And on `DriveServiceFacade`:

```typescript
  listPermissions(fileId: string): DrivePermission[] {
    return this.permissions.getPermissions(fileId).map((p) => ({
      id: p.id,
      email: p.emailAddress ?? null,
      role: p.role,
      tipo: p.type
    }));
  }

  changePermissionRoles(
    fileId: string,
    changes: Array<{ permissionId: string; role: string }>
  ): Array<{ permissionId: string; errore: string }> {
    if (changes.length === 0) return [];
    const result = this.permissions.changeRolesByPermissionId(
      fileId,
      changes.map((c) => ({ permissionId: c.permissionId, newRole: c.role }))
    );
    return result.failed.map((f) => ({
      permissionId: f.permissionId,
      errore: f.error instanceof Error ? f.error.message : String(f.error)
    }));
  }
```

In `test/fakes/FakeDriveFacade.ts`, implement both against in-memory state:

```typescript
  /** fileId -> permissions, seeded by tests. */
  public permissionsPerFile = new Map<string, DrivePermission[]>();
  public roleChanges: Array<{ fileId: string; permissionId: string; role: string }> = [];
  /** permissionIds that must fail on change (error message as value). */
  public permissionFailures = new Map<string, string>();

  listPermissions(fileId: string): DrivePermission[] {
    return this.permissionsPerFile.get(fileId) ?? [];
  }

  changePermissionRoles(
    fileId: string,
    changes: Array<{ permissionId: string; role: string }>
  ): Array<{ permissionId: string; errore: string }> {
    const failures: Array<{ permissionId: string; errore: string }> = [];
    for (const change of changes) {
      const errore = this.permissionFailures.get(change.permissionId);
      if (errore !== undefined) {
        failures.push({ permissionId: change.permissionId, errore });
        continue;
      }
      this.roleChanges.push({ fileId, permissionId: change.permissionId, role: change.role });
      const perms = this.permissionsPerFile.get(fileId) ?? [];
      const hit = perms.find((p) => p.id === change.permissionId);
      if (hit !== undefined) hit.role = change.role;
    }
    return failures;
  }
```

Import `DrivePermission` in the fake.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts && npm run typecheck && npm test`
Expected: PASS / exit 0 (full unit suite — vendor changed).

- [ ] **Step 6: Commit**

```bash
git add vendor types/gaslibs/index.d.ts src/infrastructure/facades/DriveServiceFacade.ts test/fakes/FakeDriveFacade.ts test/unit/infrastructure/drive-facade.test.ts
git commit -m "feat(drive): expose permission listing and role downgrade on the Drive facade"
```

---

### Task 11: `LockDocumentsService`

**Files:**
- Create: `src/application/services/LockDocumentsService.ts`
- Test: `test/unit/application/lock-documents-service.test.ts`

**Interfaces:**
- Consumes: `ILogDocumentoRepository.findAll()`; Task 10's `listPermissions` / `changePermissionRoles`.
- Produces:

```typescript
export interface LockOutcome {
  totaleDocumenti: number;
  documentiModificati: number;
  permessiDeclassati: number;
  falliti: Array<{ fileId: string; permissionId: string | null; errore: string }>;
}
export class LockDocumentsService {
  constructor(deps: { logDocs: ILogDocumentoRepository; drive: IDriveFacade; logger?: LoggerService });
  bloccaTutti(): LockOutcome;
}
```

Rules: downgrade every permission with `role === 'writer'` to `'reader'`; never touch `owner` (Drive forbids it) nor `organizer`; a file whose `listPermissions` throws is recorded in `falliti` and does not stop the run; every change is logged for the audit trail.

- [ ] **Step 1: Write the failing test**

Create `test/unit/application/lock-documents-service.test.ts`:

```typescript
import { LockDocumentsService } from '../../../src/application/services/LockDocumentsService';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { LogDocumento } from '../../../src/domain/entities/LogDocumento';
import type { ILogDocumentoRepository } from '../../../src/domain/repositories/ILogDocumentoRepository';

function logDocs(ids: string[]): ILogDocumentoRepository {
  const docs = ids.map((id) => new LogDocumento({ ID: id, ID_GEN: 'G', TIPO: 'T', NOME: id }));
  return { findAll: () => docs, findByClasse: () => [], findByUtente: () => [] };
}

function drive(): FakeDriveFacade {
  const facade = new FakeDriveFacade();
  facade.permissionsPerFile.set('f1', [
    { id: 'p1', email: 'a@x.it', role: 'writer', tipo: 'user' },
    { id: 'p2', email: 'b@x.it', role: 'reader', tipo: 'user' },
    { id: 'p3', email: 'owner@x.it', role: 'owner', tipo: 'user' },
    { id: 'p4', email: null, role: 'writer', tipo: 'anyone' }
  ]);
  facade.permissionsPerFile.set('f2', [{ id: 'q1', email: 'c@x.it', role: 'reader', tipo: 'user' }]);
  return facade;
}

test('downgrades every writer, including link-wide grants, and leaves owners alone', () => {
  const facade = drive();
  const esito = new LockDocumentsService({ logDocs: logDocs(['f1', 'f2']), drive: facade }).bloccaTutti();

  expect(facade.roleChanges).toEqual([
    { fileId: 'f1', permissionId: 'p1', role: 'reader' },
    { fileId: 'f1', permissionId: 'p4', role: 'reader' }
  ]);
  expect(esito).toEqual({
    totaleDocumenti: 2,
    documentiModificati: 1,
    permessiDeclassati: 2,
    falliti: []
  });
});

test('a per-permission failure is reported without aborting the run', () => {
  const facade = drive();
  facade.permissionFailures.set('p1', 'quota');
  const esito = new LockDocumentsService({ logDocs: logDocs(['f1', 'f2']), drive: facade }).bloccaTutti();

  expect(esito.permessiDeclassati).toBe(1);
  expect(esito.falliti).toEqual([{ fileId: 'f1', permissionId: 'p1', errore: 'quota' }]);
});

test('a file whose permissions cannot be read is reported and the run continues', () => {
  const facade = drive();
  facade.listPermissions = (fileId: string) => {
    if (fileId === 'f1') throw new Error('File not found');
    return [];
  };
  const esito = new LockDocumentsService({ logDocs: logDocs(['f1', 'f2']), drive: facade }).bloccaTutti();

  expect(esito.totaleDocumenti).toBe(2);
  expect(esito.falliti).toEqual([{ fileId: 'f1', permissionId: null, errore: 'File not found' }]);
});

test('rows without a Drive file id are skipped', () => {
  const facade = drive();
  const docs = { findAll: () => [new LogDocumento({ NOME: 'senza id' })], findByClasse: () => [], findByUtente: () => [] };
  const esito = new LockDocumentsService({ logDocs: docs as never, drive: facade }).bloccaTutti();
  expect(esito).toEqual({ totaleDocumenti: 1, documentiModificati: 0, permessiDeclassati: 0, falliti: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/lock-documents-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/application/services/LockDocumentsService.ts`:

```typescript
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';

// Only 'writer' is downgraded. 'owner'/'organizer' are deliberately left alone:
// Drive rejects downgrading them and they keep full access regardless.
const RUOLO_SCRITTURA = 'writer';
const RUOLO_LETTURA = 'reader';

export interface LockOutcome {
  totaleDocumenti: number;
  documentiModificati: number;
  permessiDeclassati: number;
  falliti: Array<{ fileId: string; permissionId: string | null; errore: string }>;
}

export interface LockDocumentsDeps {
  logDocs: ILogDocumentoRepository;
  drive: IDriveFacade;
  logger?: LoggerService;
}

/**
 * Feature 3: downgrades every write permission to read on every document
 * registered in LOG_DOCS for the current school year.
 *
 * Irreversible from inside the system — permissions can only be restored
 * manually by the Drive owner — so the menu wrapper demands a typed
 * confirmation, and every change is logged for the audit trail. Failure
 * isolation is per file AND per permission: one unreadable file never stops
 * the run.
 */
export class LockDocumentsService {
  private readonly logger: LoggerService;

  constructor(private readonly deps: LockDocumentsDeps) {
    this.logger = deps.logger ?? new LoggerService();
  }

  bloccaTutti(): LockOutcome {
    const documenti = this.deps.logDocs.findAll();
    const esito: LockOutcome = {
      totaleDocumenti: documenti.length,
      documentiModificati: 0,
      permessiDeclassati: 0,
      falliti: []
    };

    for (const documento of documenti) {
      const fileId = documento.id;
      if (fileId === null || fileId === '') continue;
      try {
        const permessi = this.deps.drive.listPermissions(fileId);
        const daDeclassare = permessi.filter((p) => p.role === RUOLO_SCRITTURA);
        if (daDeclassare.length === 0) continue;

        const falliti = this.deps.drive.changePermissionRoles(
          fileId,
          daDeclassare.map((p) => ({ permissionId: p.id, role: RUOLO_LETTURA }))
        );
        const riusciti = daDeclassare.length - falliti.length;
        if (riusciti > 0) {
          esito.documentiModificati += 1;
          esito.permessiDeclassati += riusciti;
          this.logger.info(
            `Blocco documenti: ${fileId} — ${riusciti} permessi da scrittura a lettura`
          );
        }
        for (const fallito of falliti) {
          esito.falliti.push({ fileId, permissionId: fallito.permissionId, errore: fallito.errore });
          this.logger.warn(
            `Blocco documenti: ${fileId}/${fallito.permissionId} non declassato — ${fallito.errore}`
          );
        }
      } catch (error) {
        const messaggio = error instanceof Error ? error.message : String(error);
        esito.falliti.push({ fileId, permissionId: null, errore: messaggio });
        this.logger.warn(`Blocco documenti: ${fileId} non elaborato — ${messaggio}`);
      }
    }
    return esito;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/lock-documents-service.test.ts && npm run typecheck && npm run lint`
Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/LockDocumentsService.ts test/unit/application/lock-documents-service.test.ts
git commit -m "feat(drive): add LockDocumentsService"
```

---

### Task 12: Menu entry + wiring for document lock

**Files:**
- Modify: `src/presentation/Menu.ts`, `src/config/Bootstrap.ts`, `src/index.ts`, `src/entrypoints/EntryPoints_Menu.ts`
- Test: `test/unit/presentation/menu.test.ts`, `test/unit/config/bootstrap.test.ts`, `test/unit/index.test.ts`

**Interfaces:**
- Consumes: Task 8's `avvioConConferma`; Task 11's `LockDocumentsService`.
- Produces:

```typescript
export function menuBloccaDocumenti(ui: IUiFacade, esegui: () => string): void;   // Menu.ts
export function avviaBloccoDocumenti(c: ServiceContainer): LockOutcome;           // Bootstrap.ts
```

- [ ] **Step 1: Write the failing test**

Append to `test/unit/presentation/menu.test.ts`:

```typescript
import { menuBloccaDocumenti } from '../../../src/presentation/Menu';

test('menuBloccaDocumenti warns about irreversibility and requires CONFERMA', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  let chiamate = 0;
  menuBloccaDocumenti(ui, () => {
    chiamate += 1;
    return 'Bloccati 10 documenti';
  });
  expect(chiamate).toBe(1);
  expect(ui.messaggi.at(-1)!.messaggio).toBe('Bloccati 10 documenti');
});

test('menuBloccaDocumenti does nothing without confirmation', () => {
  const ui = new FakeUiFacade();
  let chiamate = 0;
  menuBloccaDocumenti(ui, () => {
    chiamate += 1;
    return '';
  });
  expect(chiamate).toBe(0);
});
```

Append to `test/unit/config/bootstrap.test.ts`:

```typescript
test('lockDocumentsService is always registered and its launcher returns the outcome', () => {
  const container = buildAldoContainer(deps());
  expect(container.has('lockDocumentsService')).toBe(true);
  expect(avviaBloccoDocumenti(container)).toMatchObject({ totaleDocumenti: expect.any(Number) });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/presentation/menu.test.ts test/unit/config/bootstrap.test.ts`
Expected: FAIL — `menuBloccaDocumenti` / `avviaBloccoDocumenti` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/presentation/Menu.ts`:

```typescript
export function menuBloccaDocumenti(ui: IUiFacade, esegui: () => string): void {
  avvioConConferma(
    ui,
    'BLOCCA DOCUMENTI',
    "Tutti i permessi di scrittura sui documenti dell'anno corrente saranno declassati a sola lettura. L'operazione NON è reversibile dal sistema.",
    esegui
  );
}
```

In `src/config/Bootstrap.ts`, add the import:

```typescript
import { LockDocumentsService, type LockOutcome } from '../application/services/LockDocumentsService';
```

Register in `buildAldoContainer` next to `alberoCartelle` (no optional dependency — `deps.drive` is always present):

```typescript
  c.register(
    'lockDocumentsService',
    (container) =>
      new LockDocumentsService({
        logDocs: container.get<LogDocumentoRepository>('logDocumenti'),
        drive: deps.drive,
        logger
      })
  );
```

Add the launcher:

```typescript
/** Data-driven launcher (15 §4): downgrades write access on every LOG_DOCS document (Feature 3). Synchronous — no JobRunner. */
export function avviaBloccoDocumenti(c: ServiceContainer): LockOutcome {
  return c.get<LockDocumentsService>('lockDocumentsService').bloccaTutti();
}
```

In `src/index.ts`, import and expose `avviaBloccoDocumenti` and `menuBloccaDocumenti` exactly as Task 8 did for the validation pair.

In `src/entrypoints/EntryPoints_Menu.ts`:

```typescript
declare function menuBloccaDocumenti(ui: unknown, esegui: () => string): void;
declare function avviaBloccoDocumenti(container: unknown): {
  totaleDocumenti: number;
  documentiModificati: number;
  permessiDeclassati: number;
  falliti: unknown[];
};
```

```typescript
/** Downgrades every write permission on this year's documents to read (Feature 3). */
function menu_bloccaDocumenti(): void {
  menuBloccaDocumenti(new GasUiFacade(), () => {
    const esito = avviaBloccoDocumenti(initAldo());
    return (
      `Documenti elaborati: ${esito.totaleDocumenti}. ` +
      `Permessi declassati: ${esito.permessiDeclassati}. ` +
      `Errori: ${esito.falliti.length}.`
    );
  });
}
```

```typescript
(globalThis as any).menu_bloccaDocumenti = menu_bloccaDocumenti;
```

- [ ] **Step 4: Run the full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:build`
Expected: all green.

- [ ] **Step 5: Build the online bundle as a final gate**

Run: `npm run build:online`
Expected: exit 0 — it also runs the offline suite as the push gate. Do NOT push; pushing is the user's call.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/Menu.ts src/config/Bootstrap.ts src/index.ts src/entrypoints/EntryPoints_Menu.ts test/unit
git commit -m "feat(menu): add BLOCCA DOCUMENTI launcher"
```

---

## Post-implementation checklist

- [ ] `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build` all green from the ALDO root.
- [ ] `npm test` green from `GasLibraryFactory/`.
- [ ] `npm run verify:vendor` green (vendor checksum matches the committed bundle).
- [ ] The operator has been told what the deployment needs beyond code:
  - the `ELENCO_MATERIE` row inserted into the production `CONF_MAIL` sheet (Task 2's seed only covers the E2E database),
  - one `MATERIE.<INDIRIZZO_ID>` column per address added to the production MATERIE sheet (Task 3's migration note),
  - `clasp push` performed by whoever owns the deployment.
