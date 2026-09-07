# AUDIT_NEW_FEAT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three independent fixes consolidated in `AUDIT_NEW_FEAT.md`: empty-row-safe DB validation, a `DOCENTI.ORE_POT` line in the cattedre email box, and trash-aware `LOG_FOLD` folder reconciliation.

**Architecture:** Three disjoint workstreams, each self-contained and independently testable. Task 1 lives entirely in `GasLibraryFactory` (own git repo, own Jest suite) and is pulled into ALDO via `npm run refresh:vendor`. Tasks 2 and 3 live entirely in ALDO's `src/`. No task depends on another; execute in any order.

**Tech Stack:** TypeScript (ALDO, Jest/ts-jest), JavaScript ESM (GasLibraryFactory, Jest), Google Apps Script V8 runtime.

**Spec:** `AUDIT_NEW_FEAT.md` (repo root)

## Global Constraints

- Target runtime is GAS V8: synchronous code only, no Node-specific or browser-only APIs.
- Native GAS globals (`DriveApp`, `SpreadsheetApp`, etc.) may only be touched inside `GoogleApiWrapper` (L2) — enforced by ESLint `no-restricted-globals`.
- GasLibraryFactory-first: reusable logic (empty-row validation guard, ora/ore pluralization) belongs in `GasLibraryFactory`, never reimplemented in ALDO `src/`.
- Never edit `dist/*` (either repo) or hand-edit `vendor/gaslibs.Code.js` — the vendor bundle is only regenerated via `npm run refresh:vendor`.
- Before every commit in ALDO: `npm run typecheck && npm run lint && npm test` must pass. Before every commit in `GasLibraryFactory`: its own `npm test` must pass.
- `SheetDBLib` forbids calling `save()` while a transaction is open (unrelated to these tasks, but do not touch that invariant while editing `TableService.js`/`AlberoCartelle.ts`).

---

### Task 1: DB validation ignores completely empty and whitespace-only rows

**Files:**
- Modify: `GasLibraryFactory/GasSchemaValidatorLib/src/DatasetValidator.js`
- Test: `GasLibraryFactory/GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js`
- Modify: `GasLibraryFactory/SheetDBLib/src/TableService.js:962-966`
- Test: `GasLibraryFactory/SheetDBLib/src/__tests__/TableService.test.js`
- Modify (generated, ALDO repo): `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION` via `npm run refresh:vendor`

**Interfaces:**
- Consumes: nothing from this plan's other tasks — fully independent.
- Produces: `DatasetValidator.validate(datasets, rules)` keeps its existing signature and return shape (`{ violations: [] }`); it now silently drops any row where every cell is empty/whitespace before applying rules. `TableService._processRawData` keeps its existing `{columns, rows}` return shape; it now also treats a row whose every cell is `null`/`undefined`/whitespace-only as empty. No other task calls either function.

- [ ] **Step 1: Write the failing test for `DatasetValidator`**

In `GasLibraryFactory/GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js`, add (the file already imports `DatasetValidator` at the top — do not duplicate the import):

```js
test('validate ignores completely empty and whitespace-only rows before applying rules', () => {
  const localDatasets = {
    ALUNNI: [
      { EMAIL: 'a@x.it', CLASSE: '1A' },
      { EMAIL: '', CLASSE: '' },
      { EMAIL: ' ', CLASSE: '\t' }
    ]
  };
  const violations = new DatasetValidator().validate(localDatasets, [
    { id: 'R1', type: 'required', table: 'ALUNNI', columns: ['EMAIL'] }
  ]).violations;
  expect(violations).toEqual([]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd GasLibraryFactory && npx jest GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js -t "ignores completely empty"`
Expected: FAIL — two violations reported (rows 1 and 2 both currently hit `_required` since neither is filtered), not the expected empty array.

- [ ] **Step 3: Implement the empty-row guard in `DatasetValidator.validate()`**

In `GasLibraryFactory/GasSchemaValidatorLib/src/DatasetValidator.js`, add a helper next to `cellToString`/`splitCsv` (top of file, after `splitCsv`):

```js
function rowIsEmpty(row) {
  const values = Object.values(row);
  if (values.length === 0) return true;
  return values.every((v) => cellToString(v) === '');
}
```

Then change `validate()` to filter each rule's rows before applying it:

```js
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
        if (this._logger) {
          this._logger.warn(`DatasetValidator: tabella "${rule.table}" assente`);
        }
        return;
      }
      const nonEmptyRows = rows.filter((r) => !rowIsEmpty(r));
      violations.push(...this._applyRule(rule, nonEmptyRows, datasets, context));
    });
    return { violations };
  }
```

- [ ] **Step 4: Run the full `DatasetValidator` suite to confirm it passes with no regressions**

Run: `cd GasLibraryFactory && npx jest GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js`
Expected: PASS, all tests including the new one and the pre-existing `'required flags empty cells only'` test (unaffected: its EMAIL-empty row still has a non-empty `CLASSE`/`CURRICULUM`, so `rowIsEmpty` returns `false` for it and its `rowIndex: 1` assertion is unchanged).

- [ ] **Step 5: Commit (inside the `GasLibraryFactory` nested repo)**

```bash
cd GasLibraryFactory
git add GasSchemaValidatorLib/src/DatasetValidator.js GasSchemaValidatorLib/src/__tests__/DatasetValidator.test.js
git commit -m "fix(dataset-validator): ignore completely empty/whitespace-only rows before applying rules"
```

- [ ] **Step 6: Write the failing test for `TableService._processRawData`**

In `GasLibraryFactory/SheetDBLib/src/__tests__/TableService.test.js`, inside the existing `describe('Edge Cases and Error Handling', ...)` block, add a test right after `'should skip completely empty rows in data'`:

```js
    it('should skip whitespace-only rows in data', () => {
      const dataWithWhitespaceRows = [
        ['ID', 'name'],
        ['1', 'Alice'],
        [' ', '\t'], // whitespace-only row
        ['2', 'Bob']
      ];
      table = new TableService(
        'Users',
        'SPREADSHEET_ID_123',
        mocks.spreadsheetService,
        mocks.logger,
        mocks.utils,
        dataWithWhitespaceRows
      );

      const rows = table.getRows();

      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Alice');
      expect(rows[1].name).toBe('Bob');
    });
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `cd GasLibraryFactory && npx jest SheetDBLib/src/__tests__/TableService.test.js -t "whitespace-only"`
Expected: FAIL — `rows` has length 3 (the whitespace-only row is not skipped by the current `=== ''` check).

- [ ] **Step 8: Harden the empty-row check in `_processRawData`**

In `GasLibraryFactory/SheetDBLib/src/TableService.js:962-966`, replace:

```js
    for (let i = 1; i < data.length; i++) {
      // Skip completely empty rows
      if (!data[i] || data[i].every((cell) => cell === '' || cell === null || cell === undefined)) {
        continue;
      }
```

with:

```js
    for (let i = 1; i < data.length; i++) {
      // Skip completely empty rows (including whitespace-only cells)
      if (
        !data[i] ||
        data[i].every((cell) => cell === null || cell === undefined || String(cell).trim() === '')
      ) {
        continue;
      }
```

- [ ] **Step 9: Run the full `TableService` suite to confirm it passes with no regressions**

Run: `cd GasLibraryFactory && npx jest SheetDBLib/src/__tests__/TableService.test.js`
Expected: PASS, all tests including the new one and the pre-existing `'should skip completely empty rows in data'` test.

- [ ] **Step 10: Commit (inside the `GasLibraryFactory` nested repo)**

```bash
cd GasLibraryFactory
git add SheetDBLib/src/TableService.js SheetDBLib/src/__tests__/TableService.test.js
git commit -m "fix(table-service): treat whitespace-only cells as empty when skipping blank rows"
```

- [ ] **Step 11: Refresh ALDO's vendored library bundle and verify ALDO is unaffected**

From the ALDO repo root:

```bash
npm run refresh:vendor
npm run verify:vendor
npm test
```

Expected: `refresh:vendor` rebuilds `GasLibraryFactory` and copies its `dist/Code.js` to `vendor/gaslibs.Code.js` (updating `vendor/CHECKSUM`/`vendor/VERSION`); `verify:vendor` passes; `npm test` still passes (no ALDO source touched by this task, and no ALDO test asserts on empty-row validation behavior today).

- [ ] **Step 12: Commit the vendor refresh (ALDO repo)**

```bash
git add vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION
git commit -m "chore(vendor): pull in empty-row-safe DatasetValidator/TableService fix"
```

---

### Task 2: `DOCENTI.ORE_POT` column surfaced in the cattedre email box

**Files:**
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (DOCENTI table)
- Modify: `src/config/schema.ts` (`COL_DOCENTI`)
- Modify: `src/domain/entities/Docente.ts`
- Test: `test/unit/domain/entities/docente.test.ts` (new file)
- Modify: `src/application/context-engine/Cdu.ts` (`DestinatarioVM.cattedre`)
- Modify: `src/application/pipelines/emailSteps.ts` (`BuildCDUStep.buildDestinatario`)
- Test: `test/unit/application/pipelines/email-steps.test.ts`
- Modify: `types/gaslibs/index.d.ts` (ambient `PluralizeFilter` declaration)
- Modify: `src/application/email/boxes.ts` (`createBoxComposer`, `renderCattedreBox`)
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**
- Consumes: nothing from this plan's other tasks — fully independent.
- Produces: `Docente.getOrePot(): number` (0 when `ORE_POT` is absent/non-numeric); `DestinatarioVM.cattedre.orePot: number`; ambient global `class PluralizeFilter { execute(count: number, singular: string, plural: string): string; }`. No other task consumes these.

- [ ] **Step 1: Add `ORE_POT` to the DB schema spec**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, in the `### DOCENTI` table, add a row after `ITP`:

```
| `ORE_POT` | Integer | —   | —         | Intero >= 0, default 0     | Ore settimanali di potenziamento/rinforzo |
```

- [ ] **Step 2: Add the column constant**

In `src/config/schema.ts`, change:

```ts
export const COL_DOCENTI = {
  EMAIL: 'EMAIL',
  COGNOME: 'COGNOME',
  NOME: 'NOME',
  GENERE: 'GENERE',
  DIPART: 'DIPART',
  ITP: 'ITP'
} as const;
```

to:

```ts
export const COL_DOCENTI = {
  EMAIL: 'EMAIL',
  COGNOME: 'COGNOME',
  NOME: 'NOME',
  GENERE: 'GENERE',
  DIPART: 'DIPART',
  ITP: 'ITP',
  ORE_POT: 'ORE_POT'
} as const;
```

- [ ] **Step 3: Write the failing test for `Docente.getOrePot`**

Create `test/unit/domain/entities/docente.test.ts`:

```ts
import { Docente } from '../../../../src/domain/entities/Docente';
import { COL_DOCENTI } from '../../../../src/config/schema';

test('Docente.getOrePot defaults to 0 when ORE_POT is absent', () => {
  const docente = new Docente({ [COL_DOCENTI.EMAIL]: 'p@school.it' });
  expect(docente.getOrePot()).toBe(0);
});

test('Docente.getOrePot reads a positive ORE_POT value', () => {
  const docente = new Docente({ [COL_DOCENTI.EMAIL]: 'p@school.it', [COL_DOCENTI.ORE_POT]: 3 });
  expect(docente.getOrePot()).toBe(3);
});

test('Docente.toData round-trips ORE_POT', () => {
  const docente = new Docente({ [COL_DOCENTI.EMAIL]: 'p@school.it', [COL_DOCENTI.ORE_POT]: 2 });
  expect(docente.toData()[COL_DOCENTI.ORE_POT]).toBe(2);
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities/docente.test.ts`
Expected: FAIL with `docente.getOrePot is not a function`.

- [ ] **Step 5: Implement `orePot` on `Docente`**

In `src/domain/entities/Docente.ts`, add `[COL_DOCENTI.ORE_POT]?: number;` to `DocenteData`, add a field, hydrate it in the constructor, expose a getter, and include it in `toData()`:

```ts
export type DocenteData = {
  [COL_DOCENTI.EMAIL]?: string;
  [COL_DOCENTI.COGNOME]?: string;
  [COL_DOCENTI.NOME]?: string;
  [COL_DOCENTI.GENERE]?: string;
  [COL_DOCENTI.DIPART]?: string;
  [COL_DOCENTI.ITP]?: boolean;
  [COL_DOCENTI.ORE_POT]?: number;
};

export class Docente extends AldoEntity {
  public cognome: string;
  public nome: string;
  public genere: Genere;
  public readonly dipart: string;
  private readonly itp: boolean;
  private readonly orePot: number;

  constructor(data: DocenteData = {}) {
    super(data);
    this.id = data[COL_DOCENTI.EMAIL] ?? null;
    this.cognome = data[COL_DOCENTI.COGNOME] ?? '';
    this.nome = data[COL_DOCENTI.NOME] ?? '';
    this.genere = (data[COL_DOCENTI.GENERE] as Genere) ?? Genere.F;
    this.dipart =
      typeof data[COL_DOCENTI.DIPART] === 'string' ? (data[COL_DOCENTI.DIPART] as string) : '';
    this.itp = data[COL_DOCENTI.ITP] === true;
    this.orePot = Number(data[COL_DOCENTI.ORE_POT]) || 0;
  }
```

Add the getter next to `isITP()`:

```ts
  /** Weekly tutoring/strengthening hours (0 when absent). */
  getOrePot(): number {
    return this.orePot;
  }
```

And extend `toData()`:

```ts
  override toData(): EntityData {
    return {
      [COL_DOCENTI.EMAIL]: this.id,
      [COL_DOCENTI.COGNOME]: this.cognome,
      [COL_DOCENTI.NOME]: this.nome,
      [COL_DOCENTI.GENERE]: this.genere,
      [COL_DOCENTI.DIPART]: this.dipart,
      [COL_DOCENTI.ITP]: this.itp,
      [COL_DOCENTI.ORE_POT]: this.orePot
    };
  }
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities/docente.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md src/config/schema.ts src/domain/entities/Docente.ts test/unit/domain/entities/docente.test.ts
git commit -m "feat(docenti): add ORE_POT column and Docente.getOrePot()"
```

- [ ] **Step 8: Write the failing test for the CDU wiring**

In `test/unit/application/pipelines/email-steps.test.ts`, add two tests near the other `BuildCDUStep` cattedre tests (after the block ending `expect(destinatario.materie.elenco.map((m) => m.sigla)).toEqual(['MATE']);` around line 751):

```ts
test('BuildCDUStep exposes DOCENTI.ORE_POT on destinatario.cattedre.orePot', () => {
  const tables = fixtureTables();
  (tables['DOCENTI'] as Row[]).find((r) => r.EMAIL === 'rossi@school.it')!.ORE_POT = 3;
  const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget(), tables);
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.destinatario!.cattedre.orePot).toBe(3);
});

test('BuildCDUStep defaults destinatario.cattedre.orePot to 0 when DOCENTI.ORE_POT is absent', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.destinatario!.cattedre.orePot).toBe(0);
});
```

- [ ] **Step 9: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "ORE_POT"`
Expected: FAIL with a TypeScript error / `undefined` mismatch — `cattedre` has no `orePot` property yet.

- [ ] **Step 10: Add `orePot` to the `DestinatarioVM.cattedre` type**

In `src/application/context-engine/Cdu.ts`, change:

```ts
  cattedre: ElencoVM<CattedraVM> & { elencoDescrizione: string };
```

to:

```ts
  cattedre: ElencoVM<CattedraVM> & { elencoDescrizione: string; orePot: number };
```

- [ ] **Step 11: Wire `orePot` into `buildDestinatario`**

In `src/application/pipelines/emailSteps.ts`, in `buildDestinatario` (around line 260), change:

```ts
      cattedre: { elenco: cattedre, hasElenco: cattedre.length > 0, numero: cattedre.length, elencoDescrizione: cattedre.map((cattedra) => cattedra.sezioneEstesa).join(', ') },
```

to:

```ts
      cattedre: { elenco: cattedre, hasElenco: cattedre.length > 0, numero: cattedre.length, elencoDescrizione: cattedre.map((cattedra) => cattedra.sezioneEstesa).join(', '), orePot: docente?.getOrePot() ?? 0 },
```

- [ ] **Step 12: Run the test to confirm it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "ORE_POT"`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/pipelines/emailSteps.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "feat(email): propagate DOCENTI.ORE_POT into destinatario.cattedre.orePot"
```

- [ ] **Step 14: Write the failing tests for the box rendering**

In `test/unit/application/email-boxes.test.ts`, add three tests right after the existing `'cattedre box HTML-escapes a hostile materia nome (design 2026-08-22)'` test (ends around line 357):

```ts
test('cattedre box appends "Ore di potenziamento" as the last item when orePot > 1 (plural)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  cdu['destinatario'] = {
      cattedre: { elenco: [
        {
          classe: { nome: '5A', anno: 5, sezione: 'A' }, sezioneEstesa: 'A',
          materie: [cattedraVm({ nome: 'Matematica' })], hasMaterie: true, numeroMaterie: 1, materieDescrizione: 'Matematica', materieSigle: 'MATE'
        }
      ], hasElenco: true, numero: 1, elencoDescrizione: '5A', orePot: 3 }
  };
  const out = renderBoxes(composer, confMail([{ TIPO_BOX: 'cattedre' }]), cdu, materie(), templates);
  expect(out.boxes.perId['cattedre_0']!.html).toContain('Ore di potenziamento: 3 ore');
});

test('cattedre box uses the singular "ora" when orePot === 1', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  cdu['destinatario'] = {
      cattedre: { elenco: [
        {
          classe: { nome: '5A', anno: 5, sezione: 'A' }, sezioneEstesa: 'A',
          materie: [cattedraVm({ nome: 'Matematica' })], hasMaterie: true, numeroMaterie: 1, materieDescrizione: 'Matematica', materieSigle: 'MATE'
        }
      ], hasElenco: true, numero: 1, elencoDescrizione: '5A', orePot: 1 }
  };
  const out = renderBoxes(composer, confMail([{ TIPO_BOX: 'cattedre' }]), cdu, materie(), templates);
  expect(out.boxes.perId['cattedre_0']!.html).toContain('Ore di potenziamento: 1 ora');
});

test('cattedre box omits "Ore di potenziamento" when orePot is 0 or absent', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  cdu['destinatario'] = {
      cattedre: { elenco: [
        {
          classe: { nome: '5A', anno: 5, sezione: 'A' }, sezioneEstesa: 'A',
          materie: [cattedraVm({ nome: 'Matematica' })], hasMaterie: true, numeroMaterie: 1, materieDescrizione: 'Matematica', materieSigle: 'MATE'
        }
      ], hasElenco: true, numero: 1, elencoDescrizione: '5A', orePot: 0 }
  };
  const out = renderBoxes(composer, confMail([{ TIPO_BOX: 'cattedre' }]), cdu, materie(), templates);
  expect(out.boxes.perId['cattedre_0']!.html).not.toContain('Ore di potenziamento');
});
```

- [ ] **Step 15: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "Ore di potenziamento"`
Expected: FAIL — the rendered HTML contains no "Ore di potenziamento" text yet (the box only ever renders the classe/materie list).

- [ ] **Step 16: Declare the ambient `PluralizeFilter` type**

In `types/gaslibs/index.d.ts`, inside the `declare global { ... }` block, in the `// --- WorkspaceTemplateEngine ---` section (after the `Mustache` class declaration), add:

```ts
  /** Conditional string selector: returns the singular or plural form based on a numeric count. */
  class PluralizeFilter {
    execute(count: number, singular: string, plural: string): string;
  }
```

- [ ] **Step 17: Update `createBoxComposer`'s cattedre extractor and `renderCattedreBox`**

In `src/application/email/boxes.ts`, change the `cattedre` registration in `createBoxComposer` from:

```ts
  simple(
    'cattedre',
    'Cattedre',
    (ctx) => ctx.get('destinatario.cattedre.elenco', []),
    (d) => (d as unknown[]).length === 0
  );
```

to:

```ts
  simple(
    'cattedre',
    'Cattedre',
    (ctx) => ctx.get('destinatario.cattedre', { elenco: [], orePot: 0 }),
    (d) => (d as { elenco: unknown[] }).elenco.length === 0
  );
```

and change `renderCattedreBox` from:

```ts
function renderCattedreBox(data: unknown): string {
  const cattedre = data as CattedraVM[];
  const righe = cattedre
    .map((c) => {
      const materie = c.materie
        .map(
          (m) =>
            `${escapeHtml(m.nome)}${m.isItp ? ' <span style="font-size:11px;color:#888;">(ITP)</span>' : ''}`
        )
        .join(', ');
      return `<li><strong>${escapeHtml(c.classe.nome)}</strong> — ${materie}</li>`;
    })
    .join('');
  return wrapUl(righe);
}
```

to:

```ts
function renderCattedreBox(data: unknown): string {
  const { elenco, orePot } = data as { elenco: CattedraVM[]; orePot: number };
  const righe = elenco
    .map((c) => {
      const materie = c.materie
        .map(
          (m) =>
            `${escapeHtml(m.nome)}${m.isItp ? ' <span style="font-size:11px;color:#888;">(ITP)</span>' : ''}`
        )
        .join(', ');
      return `<li><strong>${escapeHtml(c.classe.nome)}</strong> — ${materie}</li>`;
    })
    .join('');
  if (orePot <= 0) {
    return wrapUl(righe);
  }
  const unita = new PluralizeFilter().execute(orePot, 'ora', 'ore');
  return wrapUl(`${righe}<li>Ore di potenziamento: ${orePot} ${unita}</li>`);
}
```

- [ ] **Step 18: Run the tests to confirm they pass, including the two pre-existing cattedre tests**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "cattedre"`
Expected: PASS — all six cattedre tests (three pre-existing, three new).

- [ ] **Step 19: Full verification and commit**

```bash
npm run typecheck
npm run lint
npm test
git add types/gaslibs/index.d.ts src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "feat(email): render Ore di potenziamento in the cattedre box via PluralizeFilter"
```

---

### Task 3: Trash-aware `LOG_FOLD` reconciliation

**Files:**
- Modify: `src/infrastructure/facades/DriveServiceFacade.ts` (`IDriveFacade`, `DriveServiceFacade`)
- Modify: `test/fakes/FakeDriveFacade.ts`
- Modify: `src/infrastructure/services/AlberoCartelle.ts`
- Test: `test/unit/infrastructure/albero-cartelle.test.ts`

**Interfaces:**
- Consumes: nothing from this plan's other tasks — fully independent.
- Produces: `IDriveFacade.isFolderTrashed(folderId: string): boolean`. No other task consumes it.

- [ ] **Step 1: Write the failing test for `AlberoCartelle.findOrCreate`**

In `test/unit/infrastructure/albero-cartelle.test.ts`, add after the last test (`'a LOG_FOLD row for the same path is reused and receives the additional class metadata'`):

```ts
test('a trashed logged folder is replaced by a fresh one, updating the same LOG_FOLD row (14 §4 trash-aware reconciliation)', () => {
  const { drive, db, albero } = wire();
  const staleId = drive.createFolder('Verbali/5');
  db.table('LOG_FOLD').insert({
    ID: staleId,
    PATH: 'Verbali/5',
    LINK: `https://drive.google.com/drive/folders/${staleId}`,
    CLASSI: '5A',
    UTENTI: ''
  });
  drive.trashedIds.add(staleId);

  const res = albero.findOrCreate('Verbali/5', { classi: '5A', tipo: 'CONF_VERBALE' });

  expect(res.created).toBe(true);
  expect(res.folderId).not.toBe(staleId);
  const rows = db.table('LOG_FOLD').findAll();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    ID: res.folderId,
    PATH: 'Verbali/5',
    TIPO: 'CONF_VERBALE',
    CLASSI: '5A'
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/albero-cartelle.test.ts -t "trash-aware"`
Expected: FAIL — `drive.trashedIds` does not exist on `FakeDriveFacade` yet (TypeScript error) / `findOrCreate` never checks trash state, so `res.folderId` equals `staleId` and `res.created` is `false`.

- [ ] **Step 3: Add `isFolderTrashed` to `IDriveFacade` and `FakeDriveFacade`**

In `src/infrastructure/facades/DriveServiceFacade.ts`, add to the `IDriveFacade` interface (after `getFileOwnerEmail`):

```ts
  /** True if the folder is gone or in the trash (Drive `trashed` metadata), so its logged id must not be reused. */
  isFolderTrashed(folderId: string): boolean;
```

and implement it on `DriveServiceFacade` (after `getFileOwnerEmail`):

```ts
  isFolderTrashed(folderId: string): boolean {
    const metadata = this.drive.getFiles(folderId, { fields: 'id,trashed' }) as {
      trashed?: boolean;
    } | null;
    return metadata === null || metadata.trashed === true;
  }
```

In `test/fakes/FakeDriveFacade.ts`, add a tracking set and the method:

```ts
  /** Folder ids a test has marked as trashed/deleted on Drive. */
  public trashedIds = new Set<string>();
```

```ts
  isFolderTrashed(folderId: string): boolean {
    return this.trashedIds.has(folderId);
  }
```

- [ ] **Step 4: Make `findOrCreate` trash-aware and fix the update-match key**

In `src/infrastructure/services/AlberoCartelle.ts`, change `findOrCreate`:

```ts
  findOrCreate(path: string, options: FindOrCreateOptions = {}) {
    const table = this.db.table(TABLE.LOG_FOLD);
    const logged = table.find((r) => String(r[COL_LOG_FOLD.PATH]) === path);
    if (logged !== null) {
      const folderId = String(logged[COL_LOG_FOLD.ID]);
      this.upsertLog(table, folderId, path, options, logged);
      return { folderId, created: false };
    }
```

to:

```ts
  findOrCreate(path: string, options: FindOrCreateOptions = {}) {
    const table = this.db.table(TABLE.LOG_FOLD);
    const logged = table.find((r) => String(r[COL_LOG_FOLD.PATH]) === path);
    if (logged !== null) {
      const loggedId = String(logged[COL_LOG_FOLD.ID]);
      if (this.drive.isFolderTrashed(loggedId)) {
        const folderId = this.drive.createFolder(path);
        this.upsertLog(table, folderId, path, options, logged);
        return { folderId, created: true };
      }
      this.upsertLog(table, loggedId, path, options, logged);
      return { folderId: loggedId, created: false };
    }
```

Then fix `upsertLog`'s match key so it targets the row it was actually given (`current`) instead of the new `folderId` — required because in the trash branch above, `folderId` (fresh) now differs from `current`'s stored `ID` (stale):

```ts
    if (current === null) table.insert(row);
    else table.updateRowWhere({ [COL_LOG_FOLD.ID]: folderId }, row);
```

to:

```ts
    if (current === null) table.insert(row);
    else table.updateRowWhere({ [COL_LOG_FOLD.ID]: String(current[COL_LOG_FOLD.ID]) }, row);
```

- [ ] **Step 5: Run the full `AlberoCartelle` suite to confirm it passes with no regressions**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/albero-cartelle.test.ts`
Expected: PASS — the new trash test and all five pre-existing tests (the match-key change is a no-op for them: in every pre-existing case `current[COL_LOG_FOLD.ID]` already equals the `folderId` passed in).

- [ ] **Step 6: Full verification and commit**

```bash
npm run typecheck
npm run lint
npm test
git add src/infrastructure/facades/DriveServiceFacade.ts test/fakes/FakeDriveFacade.ts src/infrastructure/services/AlberoCartelle.ts test/unit/infrastructure/albero-cartelle.test.ts
git commit -m "fix(albero-cartelle): recreate and re-log a folder whose LOG_FOLD id was trashed"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (§1.5 guard + §1.6 read hardening) → Task 1. Part 2 (§2.4 items 1-6) → Task 2, steps 1-19; approach B (§2.5) was explicitly rejected by the user and is correctly not built. Part 3 (§3.5/§3.6 update-in-place) → Task 3.
- **Deliberately out of scope** (per the audit's own "what NOT to do" / "notes" sections, not silently dropped): per-row smoke tests on every validation rule (§1.7); populating `ORE_POT` into the online-test/E2E database seeders (§2.4 point 7 — optional, only needed the day an E2E scenario asserts a non-zero value); propagating `orePot` into `DocenteAggregatoFocusProvider` for `GENERATORE=DOCENTE` documents (§2.7 — explicitly "if in the future").
- **Type consistency:** `Docente.getOrePot()` (Task 2 step 5) is the single name used everywhere it's referenced (step 11's `docente?.getOrePot() ?? 0`). `IDriveFacade.isFolderTrashed` (Task 3 step 3) is the single name used in `AlberoCartelle.findOrCreate` (step 4) and `FakeDriveFacade` (step 3).
