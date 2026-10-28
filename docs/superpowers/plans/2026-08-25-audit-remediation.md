# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplication, dead code, and false-confidence assertions the two audits found, and contribute the domain-specification contract to `DomainRepositoryLib`, without deleting a single test.

**Architecture:** Nine tasks across two repos. ALDO-only structural work first, guarded by an up-front hardening pass on the 58 highest-value assertion sites. GasLibraryFactory work next, each library task closing with its own `refresh:vendor` + ALDO offline suite. The bulk assertion sweep runs last, when the code it guards has stopped moving.

**Tech Stack:** TypeScript 5 (strict) → Babel → GAS V8, Jest (4 projects: unit / integration / build + GLF's own), webpack, clasp.

**Spec:** `docs/superpowers/specs/2026-08-25-audit-remediation-design.md`

## Global Constraints

- **No test is deleted or removed from a suite.** Weak tests get hardened. Skipped tests get implemented, moved, or converted into assertions of the limitation — never dropped.
- **No assertion is ever loosened back to `toBeDefined()`, `not.toThrow()`, or `toBeGreaterThan(0)`.** If a hardened assertion is too tight, loosen it to the true contract.
- **Native GAS globals** (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`) may only be touched inside `GoogleApiWrapper`. ESLint `no-restricted-globals` enforces it.
- **Never edit `dist/*`** — generated.
- **GasLibraryFactory-first:** no logic is reimplemented in `src/` that a library provides. Check `GasLibraryFactory/DOCS_LIBS` before writing.
- **A library change is not done until ALDO is green against the rebuilt vendor bundle**: `npm run refresh:vendor && npm run verify:vendor`, then ALDO's full offline suite.
- **ALDO verification command** (referred to below as _the ALDO gate_):
  ```bash
  npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build
  ```
- **Table and column names are UPPERCASE.** `SPECS_ALDO/01_SCHEMA_DATABASE.md` and `SPECS_ALDO/02_CDU_STRUTTURA.md` win over every other document.
- Commit messages: Italian, `type(ally): summary` — matching the existing history.

**Deviation from spec §5, stated deliberately:** the spec asked for one shared `refresh:vendor` cycle across W2/W3/W4. This plan runs three (tasks 5, 6, 7, with task 8 riding task 7's), because tasks 6, 7 and 8 each land ALDO-side code that consumes the new library surface, and a task whose deliverable cannot be verified on its own is not independently reviewable. The saving the spec wanted is still taken where it is free: task 5's GLF hygiene changes nothing in ALDO, so its verification rides on task 6's refresh.

---

### Task 1: Harden the 58 high-value ALDO assertion sites

Runs first so the refactors in tasks 2–4 land against tests that can actually fail.

**Files:**

- Modify: `test/unit/onlinetests/*Checks.test.ts` and `*-checks.test.ts` (32 sites: 17 `not.toThrow` + 15 other loose)
- Modify: `test/unit/application/email-notification-service.test.ts` (10 sites)
- Modify: `test/unit/application/pipelines/email-steps.test.ts` (7 sites)
- Modify: `test/unit/application/sheet-materie-generator.test.ts` (9 sites)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing importable. Later tasks rely on these tests being able to fail.

- [ ] **Step 1: Inventory the exact sites**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "toBeDefined()\|not\.toThrow()\|toBeGreaterThan(0)\|expect\.any(" \
  test/unit/onlinetests/ test/unit/application/email-notification-service.test.ts \
  test/unit/application/pipelines/email-steps.test.ts \
  test/unit/application/sheet-materie-generator.test.ts \
  | tee /tmp/claude-1000/-home-giulio-Desktop-ALDO-implementing/29f7cba6-6353-45f2-9a0c-a4abcd9feb4a/scratchpad/w0-sites.txt | wc -l
```

Expected: ~58 lines. Work the file list top to bottom, one file per commit.

- [ ] **Step 2: Apply rule A — `not.toThrow()` on an assert-helper gets a negative twin**

The 17 `not.toThrow()` sites in `test/unit/onlinetests/` all wrap an `assert*` helper. A bare `not.toThrow()` passes when the helper asserts _nothing_. Every positive case gains a negative case on mutated input, in the same test:

```ts
// before — test/unit/onlinetests/storico-checks.test.ts:80
expect(() => assertAlunnoStorico(storico)).not.toThrow();

// after
assertAlunnoStorico(storico);
expect(() => assertAlunnoStorico({ ...storico, hasBocciature: false })).toThrow(/bocciature/);
```

The positive case is a bare call — if it throws, Jest fails the test with the real error message instead of a useless "expected not to throw".

- [ ] **Step 3: Apply rule B — registration `not.toThrow()` gets the registered names**

```ts
// before
expect(() => registerStoricoChecks(runner, container, sample, scope)).not.toThrow();

// after
const runner = new RecordingRunner();
registerStoricoChecks(runner as never, container, sample, scope);
expect(runner.names).toEqual([
  'storico.alunno.carenze',
  'storico.classe.docenti',
  'storico.documenti'
]);
```

Read the real registered names off a run — do not invent them. If a list is long and data-dependent, assert `toHaveLength(expected)` plus `toContain` on the two or three that matter, never `toBeGreaterThan(0)`.

- [ ] **Step 4: Apply rule C — `toBeDefined()` gets the shape**

```ts
// before
expect(cdu.focus.alunno).toBeDefined();

// after
expect(cdu.focus.alunno).toEqual(
  expect.objectContaining({
    anagrafica: expect.objectContaining({ cognome: 'Rossi' })
  })
);
```

`toBeDefined()` fails only on literal `undefined`: it passes on `null`, `0`, `''`, `false`, `NaN` and on any wrong-shaped object.

- [ ] **Step 5: Apply rule D — `toBeGreaterThan(0)` and `expect.any(...)`**

```ts
// before
expect(righe.length).toBeGreaterThan(0);
// after
expect(righe.map((r) => r.studente)).toEqual(['a1@scuola.edu', 'a2@scuola.edu']);

// before
expect(log.id).toEqual(expect.any(String));
// after — keep expect.any only for real UUIDs/timestamps, and assert format instead
expect(log.id).toEqual(expect.stringMatching(/^LOG-\d{8}-/));
```

Where a count is genuinely data-dependent, assert `toHaveLength(fixtureRows.length)` against the fixture.

- [ ] **Step 6: Run the suite after each file**

Run: `npx jest --config jest.config.cjs <path/to/file.test.ts>`
Expected: PASS, or a failure that names a real defect.

**A new failure is one of two things.** Either the hardened assertion caught a real defect — fix the production code, in the same commit, and say so in the message — or the assertion is tighter than the true contract — loosen it to the contract. Never back to the loose form.

- [ ] **Step 7: Commit, one file at a time**

```bash
git add test/unit/onlinetests/storico-checks.test.ts
git commit -m "test(ally): asserzioni storico-checks con caso negativo"
```

- [ ] **Step 8: Full ALDO gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
Expected: all green.

---

### Task 2: Dead code, over-exports, and the O(n²) `unique`

Pure deletion. Nothing here changes behaviour.

**Files:**

- Modify: `src/onlinetests/data/fixtures.ts`, `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (20 dead constants)
- Modify: ~30 files carrying the ~50 internal-only `export`s and the three `*_LABELS` maps
- Modify: `src/domain/entities/Docente.ts:65-74` (two deprecated aliases)
- Modify: `src/onlinetests/checks/contextEngineChecks.ts:158`

**Interfaces:**

- Consumes: nothing.
- Produces: `Docente.cognomeNome()` and `Docente.nomeConAppellativo()` no longer exist. Callers use `getNomeCompleto()` / `getNomeCompletoConAppellativo()`.

- [ ] **Step 1: Delete the 20 dead fixture constants**

Delete these exports and any now-unused imports they leave behind:
`CLASSI_CLASSICO`, `CLASSI_SCIENTIFICO`, `CLASSI_SCIENZE_UMANE`, `MATERIE_BASE`, `MATERIE_CLASSICO`, `MATERIE_SCIENTIFICO`, `MATERIE_SCIENZE_UMANE`, `ANNO_CORRENTE`, `TEMPLATE_JOBRUNNER_DOC`, `TEMPLATE_TABELLE`, `TEMPLATE_STORICO`, `TEMPLATE_DOTTED`, `TEMPLATE_ASL_CARTELLE`, `TEMPLATE_CERCA_DOCUMENTI`, `TEMPLATE_CHUNKED`, `CLASSE_D`, `CLASSE_D_PARENT`, `CLASSE_D_PARTNER`, `DIPART_E2E`, `CacheIsolationFixture`.

Verify each is genuinely unreferenced **before** deleting:

```bash
for name in CLASSI_CLASSICO MATERIE_BASE ANNO_CORRENTE CLASSE_D_PARENT DIPART_E2E; do
  echo "--- $name: $(grep -rn "\b$name\b" --include=*.ts src/ test/ | wc -l) refs"
done
```

Expected: `1 refs` each (the definition itself). Anything higher: leave it and note why.

- [ ] **Step 2: Drop `export` from the internal-only types**

For each of the ~50 names (`BootstrapDeps`, `EMAIL_CHUNK_SIZE`, `RECIPE_PER_PROCESSO`, `Severita`, `StatisticheClasse`, `StatisticheIstituto`, `CarenzaRow`, `CarenzeReport`, `ReportCarenzeOptions`, `ASLReport`, `PostProcessAction`, `LogRegistrationMetadata`, `PersonMinVM`, `SubjectVmEvoluzione`, `BuildSubjectVmOptions`, `BuildContinuitaInput`, `PersonVmInput`, `PersonGroupDeclension`, `FindOrCreateOptions`, `CartellaResult`, `MateriaSlotGroup`, `ScopeFragment`, the `*ResumeState` / `*Result` / `*Options` set, and `TIPO_PIANO_LABELS` / `RELIGIONE_LABELS` / `TIPO_PROGETTO_LABELS`): confirm the only references are inside the defining file, then remove the `export` keyword. Keep the declaration.

```bash
grep -rn "\bStatisticheClasse\b" --include=*.ts src/ test/ | grep -v "src/application/.../TheDefiningFile.ts"
```

Expected: no output. If a test imports it, keep the export — a test consumer is a real consumer.

- [ ] **Step 3: Delete the two deprecated `Docente` aliases**

```ts
// src/domain/entities/Docente.ts — delete both:
/** @deprecated use getNomeCompleto(); kept for the vertical slice. */
cognomeNome(): string { return this.getNomeCompleto(); }
/** @deprecated use getNomeCompletoConAppellativo(); kept for the vertical slice. */
nomeConAppellativo(): string { return this.getNomeCompletoConAppellativo(); }
```

Then update the single test reference to call `getNomeCompleto()` / `getNomeCompletoConAppellativo()`.

- [ ] **Step 4: Replace the O(n²) `unique`**

```ts
// src/onlinetests/checks/contextEngineChecks.ts:158
// before
function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}
// after
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
```

- [ ] **Step 5: ALDO gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
Expected: all green. A `typecheck` error naming a removed export means it had a consumer — restore that one export.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ally): via costanti morte, export interni e unique O(n^2)"
```

---

### Task 3: Entity `*Data` typing and the `_` column convention

**Files:**

- Modify: all 21 files in `src/domain/entities/` except `AldoEntity.ts`
- Modify: `src/application/import/ImportRecipeMapper.ts:146-155`
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Test: `test/unit/domain/entities-row-typing.test.ts` (create), `test/unit/application/import-recipe-mapper.test.ts` (modify)

**Interfaces:**

- Consumes: nothing.
- Produces: `ClasseData`, `CarenzaData`, `MateriaData` stay open (`Record<string, unknown>`-compatible with documented fixed columns). The other 18 `*Data` become closed `type` aliases. Every entity keeps `static fromData(data: Record<string, unknown>): Entity` as its public signature — callers are unaffected.

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/domain/entities-row-typing.test.ts
import { Docente } from '../../../src/domain/entities/Docente';
import { Classe } from '../../../src/domain/entities/Classe';
import { COL_DOCENTI, COL_CLASSI } from '../../../src/config/schema';

test('fromData accetta una riga grezza del foglio', () => {
  const row: Record<string, unknown> = {
    [COL_DOCENTI.EMAIL]: 'd@scuola.edu',
    [COL_DOCENTI.COGNOME]: 'Rossi',
    _NOTE_MIE: 'appunto personale'
  };
  expect(Docente.fromData(row).id).toBe('d@scuola.edu');
});

test('le tabelle a colonne dinamiche accettano colonne non dichiarate', () => {
  const row: Record<string, unknown> = {
    [COL_CLASSI.ID]: '3A',
    [COL_CLASSI.ANNO]: 3,
    [COL_CLASSI.INDIRIZZO]: 'LC',
    ITA: 'd@scuola.edu'
  };
  expect(Classe.fromData(row).id).toBe('3A');
});
```

- [ ] **Step 2: Run it to see it pass today, then make the typing change**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities-row-typing.test.ts`
Expected: PASS (today's index signature allows everything). This test is the **regression guard** for the change, not a red-first test: its job is to prove the hydration boundary still compiles and works after the signature is removed.

- [ ] **Step 3: Collapse the three dynamic-column entities**

```ts
// src/domain/entities/Classe.ts
/**
 * CLASSI row. Matrice di assegnazione cattedre: oltre alle colonne fisse sotto,
 * la tabella porta una colonna dinamica per ogni materia (`ITA`), per ogni ITP
 * (`INF.itp`) e per ogni specifica (`INTERPRET.CHITARRA`), più le colonne
 * riservate all'utente con prefisso `_`. Tipo volutamente aperto.
 *
 * Colonne fisse (01 §CLASSI): ID, ANNO, TERMINALE, SEZ, INDIRIZZO, COORD,
 * RUOLI, ATTIVA, ARTICOLAZIONE, STORICO.
 */
export type ClasseData = Record<string, unknown>;
```

Same treatment for `CarenzaData` (`src/domain/entities/Carenza.ts`) and `MateriaData` (`src/domain/entities/Materia.ts`). `MateriaData` stays open in anticipation of the MATERIE × INDIRIZZI feature (spec §8) — say so in its comment, and say that today's schema is fixed.

- [ ] **Step 4: Close the other 18**

Convert each from `interface` to a `type` alias and drop the index signature. **The `interface` → `type` change is required, not cosmetic:** TypeScript gives implicit index signatures to type aliases but not to interfaces, so an interface would make `row as DocenteData` fail with "neither type sufficiently overlaps the other".

```ts
// src/domain/entities/Docente.ts
// before
export interface DocenteData {
  [COL_DOCENTI.EMAIL]?: string;
  [COL_DOCENTI.COGNOME]?: string;
  // …
  [key: string]: unknown;
}
// after
export type DocenteData = {
  [COL_DOCENTI.EMAIL]?: string;
  [COL_DOCENTI.COGNOME]?: string;
  // …
};
```

- [ ] **Step 5: Add the one narrowing per entity**

```ts
// src/domain/entities/Docente.ts — public signature unchanged for callers
static fromData(data: Record<string, unknown>): Docente {
  return new Docente(data as DocenteData);
}
```

The constructor keeps `constructor(data: DocenteData = {})`. The compile-time benefit lands where ALDO code builds a literal: `new Docente({ WRONG_COL: 1 })` is now an error.

- [ ] **Step 6: Exclude `_` columns from the ghost-record check**

```ts
// src/application/import/ImportRecipeMapper.ts
export function isGhostRecord(
  row: Record<string, unknown>,
  keyColumns: string[],
  metaColumns: string[]
): boolean {
  const excluded = new Set([...keyColumns, ...metaColumns]);
  return Object.entries(row)
    .filter(([col]) => !excluded.has(col) && !col.startsWith('_'))
    .every(([, value]) => value === null || value === undefined || value === '');
}
```

With its test:

```ts
test('una colonna utente _ non salva una riga fantasma', () => {
  const row = { EMAIL: '', NOME: '', _NOTE_MIE: 'appunto' };
  expect(isGhostRecord(row, ['EMAIL'], [])).toBe(true);
});
```

Run: `npx jest --config jest.config.cjs test/unit/application/import-recipe-mapper.test.ts`
Expected: FAIL before the filter (`false`), PASS after.

- [ ] **Step 7: Document the convention**

Add to `SPECS_ALDO/01_SCHEMA_DATABASE.md`, in the general-rules section before the per-table listings:

```markdown
### Colonne riservate all'utente

Le colonne il cui nome inizia con `_` sono riservate agli appunti e ai calcoli
dell'utente. ALDO le legge insieme al resto della riga, **le preserva a ogni
scrittura** (l'update è un merge sulla riga originale, non una sostituzione) e
non le interpreta mai: non compaiono in nessun tipo di entità, non sono mai
scambiate per colonne dinamiche, e la futura analisi di consistenza le ignora
invece di segnalarle come anomalie.
```

- [ ] **Step 8: ALDO gate + commit**

```bash
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build
git add -A
git commit -m "refactor(ally): entity *Data type-safe salvo tabelle dinamiche + convenzione colonne _"
```

---

### Task 4: `stringId` factory, `ProcessMonitorFacade`, focus guard

**Files:**

- Create: `src/domain/value-objects/stringId.ts`
- Modify: `src/domain/value-objects/ClasseId.ts`, `IndirizzoId.ts`, `DipartimentoId.ts`, `MateriaId.ts`, `MateriaSpecificaId.ts`
- Delete: the `ProcessMonitorFacade` class in `src/infrastructure/facades/ProcessMonitorFacade.ts` (the `IProcessMonitor` interface in the same file **stays**)
- Modify: `src/config/Bootstrap.ts` (inject the library service directly)
- Modify: `src/application/context-engine/techEntities.ts` (+`withFocusAlunno`), 8 provider files in `src/application/context-engine/providers/`
- Modify (conditionally, step 7): `src/application/storico/StoricoDocentiService.ts:30`
- Test: `test/unit/domain/value-objects.test.ts`, `test/unit/application/context-engine/*`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `stringId(name: string, pattern?: RegExp)` → a class with `static of(raw: string)`, `readonly value: string`, `equals(other: { value: string }): boolean`.
  - `withFocusAlunno(cdu: Cdu, fn: (alunno: CduAlunnoFocus) => void): void`.
  - `IProcessMonitor` unchanged; `ProcessMonitorFacade` gone.

- [ ] **Step 1: Settle the `MateriaId` trim question first**

```bash
grep -rn "MateriaId" test/unit/domain/*.ts | grep -n "of("
```

`MateriaId.of` today tests the regex **without trimming**, so `" ITA "` throws while `ClasseId.of(" 3A ")` succeeds. If a test pins the rejection, the factory takes `{ trim: false }`. If nothing pins it, accept the change and record it in the commit message. Decide here, before writing the factory.

- [ ] **Step 2: Write the failing test**

```ts
// test/unit/domain/value-objects.test.ts
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('gli ID stringa trimmano e rifiutano il vuoto', () => {
  expect(ClasseId.of('  3A  ').value).toBe('3A');
  expect(() => ClasseId.of('   ')).toThrow(ValidationError);
  expect(() => ClasseId.of('   ')).toThrow(/ClasseId/);
});

test('MateriaId applica il proprio pattern e nomina se stesso nell errore', () => {
  expect(MateriaId.of('ITA').value).toBe('ITA');
  expect(() => MateriaId.of('ita')).toThrow(/MateriaId/);
});

test('ID di tipi diversi non sono intercambiabili a runtime per valore', () => {
  expect(ClasseId.of('3A').equals(ClasseId.of('3A'))).toBe(true);
  expect(ClasseId.of('3A').equals(ClasseId.of('3B'))).toBe(false);
});
```

Run: `npx jest --config jest.config.cjs test/unit/domain/value-objects.test.ts`
Expected: PASS today — this pins current behaviour before the factory replaces it.

- [ ] **Step 3: Write the factory**

```ts
// src/domain/value-objects/stringId.ts
import { ValidationError } from '../errors/DomainError';

/**
 * Base per gli ID stringa del dominio: trim, rifiuto del vuoto, pattern
 * opzionale, `equals` per valore. Il nome serve al messaggio d'errore, che
 * resta specifico del tipo.
 */
export function stringId(name: string, pattern?: RegExp) {
  return class StringId {
    protected constructor(public readonly value: string) {}
    static of(raw: string): StringId {
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (v.length === 0 || (pattern !== undefined && !pattern.test(v))) {
        throw new ValidationError(`${name} non valido: "${raw}"`);
      }
      return new this(v);
    }
    equals(other: { value: string }): boolean {
      return this.value === other.value;
    }
  };
}
```

Then each ID becomes a named shell — named, never anonymous, so stack traces and `constructor.name` stay useful:

```ts
// src/domain/value-objects/ClasseId.ts
import { stringId } from './stringId';
export class ClasseId extends stringId('ClasseId') {}
```

```ts
// src/domain/value-objects/MateriaId.ts
import { stringId } from './stringId';
export class MateriaId extends stringId('MateriaId', /^[A-Z]{2,10}$/) {}
```

- [ ] **Step 4: Run the value-object tests**

Run: `npx jest --config jest.config.cjs test/unit/domain/value-objects.test.ts`
Expected: PASS. If the `MateriaId` error message assertion fails, it is because the old message read `MateriaId non valido (maiuscolo, 2-10)` — update the test to the new message, or pass the fuller text as the factory's `name`.

- [ ] **Step 5: Delete `ProcessMonitorFacade`, keep `IProcessMonitor`**

The class is nine methods of `return this.monitor.x(...)` with no added logic, and it touches no native GAS global, so it satisfies no ESLint fence. Delete the class; keep the interface — it documents what ALDO needs from the library and is what `FakeProcessMonitor` satisfies. In `src/config/Bootstrap.ts`, register the vendored `ProcessMonitorService` instance where the facade was constructed: it structurally satisfies `IProcessMonitor`.

- [ ] **Step 6: Add the focus guard and apply it**

```ts
// src/application/context-engine/techEntities.ts
/** Esegue `fn` solo quando il CDU ha un alunno in focus. */
export function withFocusAlunno(cdu: Cdu, fn: (alunno: CduAlunnoFocus) => void): void {
  const alunno = cdu.focus.alunno;
  if (alunno !== undefined) fn(alunno);
}
```

Apply at the 20 guard sites across the 8 providers (`DocumentiProvider`, `DocumentiStoricoProvider`, `PianiProvider`, `PianiPersAlunnoProvider`, `PianiPersAlunnoStoricoProvider`, `PianoFocusProvider`, `CarenzeProvider`, `StoricoProvider`):

```ts
// before
const focusAlunno = cdu.focus.alunno;
if (focusAlunno === undefined) return;
/* … body … */

// after
withFocusAlunno(cdu, (focusAlunno) => {
  /* … body … */
});
```

**Only convert guards that early-`return` with no value.** A guard followed by code that must run regardless of focus stays as it is — wrapping it would change control flow. Check each site.

- [ ] **Step 7: Measure the storico N+1 before touching it (C4.3)**

`src/application/storico/StoricoDocentiService.ts:30` calls `getMaterieDelDocente` once per class per historic year, each call re-parsing that class's cattedra CSV — roughly 180 parses at 60 classes × 3 years to answer one teacher's question.

**Measure first.** The file's own comment already flags the shape ("small, stable tables; acceptable at the school scale ALDO targets"), so this is worth doing only if the storico path is user-facing and measurably slow:

```ts
// temporary, in the existing storico test
const t0 = Date.now();
service.perDocente(docenteEmail);
console.log('perDocente ms:', Date.now() - t0);
```

If it is under ~200 ms against the E2E fixture, **skip the optimisation and say so** — delete the temporary timing and move on. If it is slow, build the index once per year inside the `anniStorici` loop:

```ts
// dentro il loop anniStorici, prima del loop classi
const perDocente = new Map<string, Array<{ classe: Classe; materia: string }>>();
for (const classe of classi.findAll()) {
  for (const [email, materie] of classi.getCattedrePerClasse(classe)) {
    const acc = perDocente.get(email) ?? [];
    for (const materia of materie) acc.push({ classe, materia });
    perDocente.set(email, acc);
  }
}
// poi: perDocente.get(docenteEmail) ?? []
```

If `getCattedrePerClasse` does not exist on `ClasseRepository` under that name, use whatever single-pass accessor it does expose — the point is one parse per class per year, not the exact method name.

- [ ] **Step 8: ALDO gate + commit**

```bash
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build
git add -A
git commit -m "refactor(ally): fattoria stringId, via ProcessMonitorFacade, guardia focus alunno"
```

---

### Task 5: GasLibraryFactory hygiene

No ALDO code changes here, so its vendor verification rides on task 6.

**Files (all under `GasLibraryFactory/`):**

- Delete: `RoleResolutionLib/src/internal/DateParsing.js`
- Modify: `GoogleApiWrapper/src/services/UtilitiesService.js:160` (rename)
- Modify: `CoreUtilsLib/src/utils/StringUtils.js:25`, `ComposableContentLib/src/core/ContentBlock.js:80,254` (delete `isEmpty` copies)
- Modify: `CoreUtilsLib/src/interfaces.js`, `SheetDBLib/src/internal/dynamic-columns/ColumnType.js` (dead exports)
- Modify: 5 `testing/mocks.js` files (8 unused mock classes)
- Modify: `SheetDBLib/src/DatabaseService.js:16,88`, `WorkspaceTemplateEngine/src/PlaceholderService.js:12,178` (`My` prefix)
- Rewrite: `CoreUtilsLib/src/utils/SystemQuotaManager.js` → `CoreUtilsLib/src/utils/collections.js`; modify `CoreUtilsLib/src/utils/SystemUtils.js:82-90`

**Interfaces:**

- Consumes: nothing.
- Produces: `SystemUtils`'s 50 public method names **unchanged**. `CoreUtilsLib.DateUtils.parseDate` becomes RoleResolutionLib's only date parser. `UtilitiesService.formatDateNative` replaces `formatDate`. `DatabaseService` / `PlaceholderService` are the primary names, `MyDatabaseService` / `MyPlaceholderService` remain as aliases for one release.

- [ ] **Step 1: One `parseDate`**

Delete `RoleResolutionLib/src/internal/DateParsing.js` and import `parseDate` from `CoreUtilsLib/src/utils/DateUtils.js:63`. RoleResolutionLib (L3) already depends on CoreUtilsLib (L0), so there is no layering obstacle.

**Its test cases stay and re-point at the shared function.** If the two implementations disagree on an edge case — Italian `dd/mm/yyyy` versus ISO — the RoleResolutionLib cases become the specification the merged function must satisfy: fix `DateUtils.parseDate` to pass them, do not weaken the tests.

Run: `cd GasLibraryFactory && npx jest RoleResolutionLib CoreUtilsLib`
Expected: PASS.

- [ ] **Step 2: Rename `formatDate` → `formatDateNative`**

In `GoogleApiWrapper/src/services/UtilitiesService.js:160`. It is a thin `Utilities.formatDate` pass-through and the sanctioned native-global site, so it survives — under a name that stops it colliding conceptually with `DateUtils.formatDate`. Update its callers and its tests.

- [ ] **Step 3: One value `isEmpty`**

Keep `CoreUtilsLib/src/facades/LodashFacade.js:91` (the complete one: handles Map, Set, object). Delete `StringUtils.isEmpty` and **both** `ContentBlock.isEmpty(data)` copies (`:80` and `:254` — two copies in one file), re-pointing callers.

**Leave the four zero-argument domain predicates alone:** `PostProcessorChain.isEmpty()`, `BlockDataContext.isEmpty()`, `DelegationChain.isEmpty()`, `RoutingResult.isEmpty()` are unrelated — they ask "is _this_ empty", not "is this value empty".

- [ ] **Step 4: Delete the dead exports and mocks**

`validateInterfaceShape`, `getColumnTypes`, and the 8 never-instantiated mock classes: `RendererRegistryMock`, `CacheUtilsMock`, `MenuBuilderMock`, `SidebarBuilderMock`, `DialogBuilderMock`, `DocumentBuilderMock`, `MockSchemaValidator` + `createMockSchema`, `AdvancedQueryBuilderMock`. Confirm zero references first:

```bash
cd GasLibraryFactory
for n in validateInterfaceShape getColumnTypes RendererRegistryMock CacheUtilsMock MenuBuilderMock SidebarBuilderMock DialogBuilderMock DocumentBuilderMock MockSchemaValidator createMockSchema AdvancedQueryBuilderMock; do
  echo "$n: $(grep -rn "\b$n\b" --include=*.js . | grep -v node_modules | wc -l)"
done
```

Expected: `1` each (the definition). These are test _doubles_ nobody instantiates, not tests — removing them costs no coverage.

- [ ] **Step 5: Drop the `My` prefix**

```js
// SheetDBLib/src/DatabaseService.js
export class DatabaseService {
  /* … */
}
/** @deprecated nome storico, rimosso alla prossima release. */
export { DatabaseService as MyDatabaseService };
```

Same shape in `WorkspaceTemplateEngine/src/PlaceholderService.js`.

- [ ] **Step 6: Flatten the collection stack**

Create `CoreUtilsLib/src/utils/collections.js`, replacing `SystemQuotaManager.js` (380 lines, 29 methods, 25 of which only re-add an `Array.isArray` guard the layer below already has):

```js
// CoreUtilsLib/src/utils/collections.js
import {
  groupBy,
  keyBy,
  orderBy,
  uniqBy,
  differenceBy,
  maxBy,
  minBy,
  sumBy,
  meanBy
} from 'es-toolkit/compat';

export const unique = (a) => (Array.isArray(a) ? [...new Set(a)] : []);
export const compact = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);
export const flatten = (a, depth = 1) => (Array.isArray(a) ? a.flat(depth) : []);
export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

export { groupBy, keyBy, orderBy, uniqBy, differenceBy, maxBy, minBy, sumBy, meanBy };
```

Then delete the bind loop at `CoreUtilsLib/src/utils/SystemUtils.js:82-90`:

```js
// delete this — 50 closure allocations per `new SystemUtils()`, and it defeats
// webpack tree-shaking, so the GAS bundle keeps all 50 methods whether a
// consumer touches one or none
delegations.forEach(({ manager, methods }) => {
  methods.forEach((method) => {
    if (typeof manager[method] === 'function') this[method] = manager[method].bind(manager);
  });
});
```

and replace it with explicit static re-exports — one line per method, all 50 names preserved. Follow the pattern `TableService.js:80-85` already uses ("Public methods are exposed via explicit delegating methods rather than dynamic bind-loops, so the public surface is statically visible").

**Every one of the 50 names must still resolve.** Prove it:

```bash
cd GasLibraryFactory && npx jest CoreUtilsLib
grep -rn "systemUtils\.\|SystemUtils\." --include=*.js --include=*.ts \
  . "../src" | grep -v node_modules | sed 's/.*SystemUtils\.\([a-zA-Z]*\).*/\1/' | sort -u
```

Expected: every name in that list exists on the new surface.

- [ ] **Step 7: Per-library suites + commit**

Run: `cd GasLibraryFactory && npm test`
Expected: all green.

```bash
cd GasLibraryFactory
git add -A
git commit -m "refactor(glf): un solo parseDate/isEmpty, via export morti e prefisso My, SystemUtils senza bind loop"
```

---

### Task 6: Specification contract — options 1 and 5, plus ALDO's base

**Files:**

- Modify: `GasLibraryFactory/DomainRepositoryLib/src/specifications/Specification.js`
- Modify: `GasLibraryFactory/DomainRepositoryLib/src/specifications/FieldSpecification.js`
- Modify: `GasLibraryFactory/DomainRepositoryLib/src/internal/query/QueryTranslator.js`
- Modify: `types/gaslibs/index.d.ts:1104,1120-1126`
- Modify: `src/domain/specifications/Specification.ts`, the 11 in-memory specs under `src/domain/specifications/`
- Modify: `src/application/context-engine/FiltriSorgente.ts` (drop `PredicateSpecification`)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `Specification.prototype.toQueryObject(): Record<string, unknown> | null` — default `null`.
  - `Specification.prototype.canBeTranslatedToQuery(): boolean` — no throw on the `toQueryObject` path.
  - `QueryTranslator._queryObjectCriteria(spec)` — single call per `find()`.
  - ALDO's `Specification<T>` keeps `extends`; `toQueryObject()` becomes optional to override.

- [ ] **Step 1: Reconcile the ambient/implementation mismatch first**

`FieldSpecification.js` has **no** `toQueryObject`, but `types/gaslibs/index.d.ts:1123` declares one. The ambient file is ahead of the implementation. Decide and record which is right: either implement `toQueryObject` on `FieldSpecification` (it holds a field, an operator and a value, so an `=` operator maps cleanly to `{ [field]: value }` and everything else to `null`), or delete the ambient declaration. **Do this before touching the base class** — the base's behaviour depends on which is true.

- [ ] **Step 2: Write the failing test**

```js
// DomainRepositoryLib/src/__tests__/SpecificationContract.test.js
import { Specification } from '../specifications/Specification.js';

class InMemoryOnly extends Specification {
  isSatisfiedBy(e) {
    return e.x > 3;
  }
}

class Pushdown extends Specification {
  isSatisfiedBy(e) {
    return e.ATTIVA === true;
  }
  toQueryObject() {
    return { ATTIVA: true };
  }
}

test('la base restituisce null di default', () => {
  expect(new InMemoryOnly().toQueryObject()).toBeNull();
});

test('canBeTranslatedToQuery non lancia per le spec in memoria', () => {
  const spec = new InMemoryOnly();
  const throwSpy = jest.spyOn(spec, 'toQuery');
  expect(spec.canBeTranslatedToQuery()).toBe(false);
  expect(throwSpy).not.toHaveBeenCalled();
});

test('una spec con toQueryObject è traducibile senza passare da toQuery', () => {
  expect(new Pushdown().canBeTranslatedToQuery()).toBe(true);
});
```

Run: `cd GasLibraryFactory && npx jest DomainRepositoryLib -t "canBeTranslatedToQuery"`
Expected: FAIL — today `canBeTranslatedToQuery` allocates a mock builder, calls `toQuery` (which always throws on the base), catches, and returns `false`.

- [ ] **Step 3: Implement on the base**

```js
// DomainRepositoryLib/src/specifications/Specification.js
/**
 * Percorso rapido di pushdown per specification domain-pure.
 *
 * Restituisce un oggetto di uguaglianze `{colonna: valore}` quando la regola è
 * interamente esprimibile come uguaglianze, `null` quando serve la valutazione
 * in memoria. Alternativa a `toQuery(queryBuilder)`: permette al layer di
 * dominio di restare libero da qualsiasi import di query builder.
 *
 * INVARIANTE — quando restituisce un oggetto non-null, il filtro deve essere
 * ESATTAMENTE equivalente a isSatisfiedBy(). Repository.find() applica UNO SOLO
 * dei due: se divergono, il risultato è silenziosamente sbagliato, senza errori.
 * Nel dubbio, restituire null.
 *
 * @returns {Record<string, unknown>|null}
 */
toQueryObject() {
  return null;
}

/** @override Risposta statica sul percorso toQueryObject; il fallback per tentativo resta per le spec toQuery-based. */
canBeTranslatedToQuery() {
  if (this.toQueryObject() !== null) return true;
  try {
    const mockBuilder = { where: () => mockBuilder, andWhere: () => mockBuilder /* … resto invariato … */ };
    this.toQuery(mockBuilder);
    return true;
  } catch (_error) {
    return false;
  }
}
```

- [ ] **Step 4: Single call in the translator**

```js
// DomainRepositoryLib/src/internal/query/QueryTranslator.js
// before: _hasQueryObjectCriteria called toQueryObject() twice, and validate() +
// translate() + _applyQueryObject() summed to 5 calls per find()
_queryObjectCriteria(specification) {
  if (typeof specification.toQueryObject !== 'function') return null;
  const criteria = specification.toQueryObject();
  return criteria === null || criteria === undefined ? null : criteria;
}
```

Re-point `validate`, `translate` and `_applyQueryObject` at it.

- [ ] **Step 5: Prove the `toQuery` branch still works**

The existing GLF specs (`FieldSpecification`, `CompositeSpecification`, `ExpressionSpecification`) now inherit `toQueryObject() → null` and must keep reaching the `toQuery` branch. **This is not automatic — test it:**

```js
test('le spec toQuery-based restano sul percorso toQuery', () => {
  const spec = new FieldSpecification('ANNO', '>', 3);
  const calls = [];
  const builder = {
    where: (...a) => {
      calls.push(a);
      return builder;
    }
  };
  spec.toQuery(builder);
  expect(calls).toEqual([['ANNO', '>', 3]]);
  expect(spec.canBeTranslatedToQuery()).toBe(true);
});
```

Run: `cd GasLibraryFactory && npx jest DomainRepositoryLib`
Expected: PASS.

- [ ] **Step 6: Option 5 — take `FunctionSpecification` instead of the local rewrite**

`FunctionSpecification.js` already exists in GLF and is already declared at `types/gaslibs/index.d.ts:1125`, yet `FiltriSorgente.ts` rewrote it locally as `PredicateSpecification`. Check whether it covers the case:

```ts
// src/application/context-engine/FiltriSorgente.ts — delete this
class PredicateSpecification<T> extends Specification<T> {
  constructor(private readonly predicate: (candidate: T) => boolean) {
    super();
  }
  isSatisfiedBy(candidate: T): boolean {
    return this.predicate(candidate);
  }
  toQueryObject(): null {
    return null;
  }
}
```

If `FunctionSpecification` covers it, use it and delete the local class (−12 lines). If it does not — most likely because its ambient signature is `(entity: unknown) => boolean` and ALDO needs `(candidate: T) => boolean` — **stop and ask** whether to widen the library's ambient declaration with a generic. That is CLAUDE.md rule 3; do not silently keep the duplicate.

- [ ] **Step 7: Refresh vendor, then update ALDO's base (C3.7)**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
npm run refresh:vendor && npm run verify:vendor
```

Then `src/domain/specifications/Specification.ts`: `extends Specification` **stays** — the inheritance now earns its place by supplying the `null` default and the throw-free `canBeTranslatedToQuery`. Make `toQueryObject` optional rather than abstract, and cut the 22-line comment down to what remains true: the `TS2506` workaround (why the class is declared `AldoSpecification` and re-exported under an alias) and the bivariance note. Delete the part justifying an unused inheritance.

Then delete the hand-written `toQueryObject(): null { return null; }` from the 11 in-memory specs — they inherit it now. **Keep each spec's explanatory comment**: the reasons for not being pushdown-eligible (numeric coercion on sheet-sourced `ANNO` cells, CSV containment, negation, `Set` membership, non-trivial predicates, non-empty JSON) are the most valuable prose in that folder.

- [ ] **Step 8: Full gate + commit**

```bash
cd GasLibraryFactory && npm test && cd ..
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build
git add -A && git commit -m "feat(glf): toQueryObject sulla base Specification, chiamata singola nel translator"
```

---

### Task 7: `assertSpecificationContract` and `EqualityFieldSpec`

Option 3 before option 2: the invariant guard is what makes migrating 16 specs verifiable instead of a reading exercise.

**Files:**

- Create: `GasLibraryFactory/DomainRepositoryLib/src/testing/specificationContract.js`
- Create: `GasLibraryFactory/DomainRepositoryLib/src/specifications/EqualityFieldSpec.js`
- Modify: `GasLibraryFactory/DomainRepositoryLib/src/index.js` (exports), `types/gaslibs/index.d.ts`
- Create: `test/unit/domain/specification-contract.test.ts`
- Modify: the 16 Family-1 and 5 Family-2 specs under `src/domain/specifications/`
- Modify: `src/infrastructure/repositories/RuoloRepository.ts` (see step 4)

**Interfaces:**

- Consumes: `Specification.toQueryObject()` from task 6.
- Produces:
  - `assertSpecificationContract(spec, rows, hydrate) → { ok: boolean, divergenti: Array<object> }`
  - `EqualityFieldSpec` — `constructor(column: string, read: (e: T) => unknown, expected: unknown)`, with `isSatisfiedBy`, `toQueryObject`, `toString`.

- [ ] **Step 1: Write the guard**

```js
// DomainRepositoryLib/src/testing/specificationContract.js
/**
 * Verifica che le due metà di una specification concordino. Se toQueryObject()
 * è non-null, il filtro di uguaglianza deve selezionare ESATTAMENTE le stesse
 * righe di isSatisfiedBy().
 *
 * @param {Object} spec
 * @param {Array<Object>} rows Righe grezze rappresentative — positive E negative.
 * @param {Function} hydrate (row) => entità
 * @returns {{ok: boolean, divergenti: Array<Object>}}
 */
export function assertSpecificationContract(spec, rows, hydrate) {
  const criteria = spec.toQueryObject();
  if (criteria === null) return { ok: true, divergenti: [] };

  const divergenti = rows.filter((row) => {
    const viaQuery = Object.entries(criteria).every(([col, val]) => row[col] === val);
    const viaMemory = spec.isSatisfiedBy(hydrate(row));
    return viaQuery !== viaMemory;
  });

  return { ok: divergenti.length === 0, divergenti };
}
```

- [ ] **Step 2: Prove the guard catches the known divergence**

```js
// DomainRepositoryLib/src/__tests__/specificationContract.test.js
test('cattura una spec che fa contenimento in memoria e uguaglianza in query', () => {
  const spec = {
    isSatisfiedBy: (e) => e.DOCENTE.split(',').includes('a@x.it'),
    toQueryObject: () => ({ DOCENTE: 'a@x.it' })
  };
  const rows = [{ DOCENTE: 'a@x.it' }, { DOCENTE: 'a@x.it,b@x.it' }];
  const { ok, divergenti } = assertSpecificationContract(spec, rows, (r) => r);
  expect(ok).toBe(false);
  expect(divergenti).toEqual([{ DOCENTE: 'a@x.it,b@x.it' }]);
});
```

Run: `cd GasLibraryFactory && npx jest DomainRepositoryLib -t "contenimento"`
Expected: PASS.

- [ ] **Step 3: Apply it to every ALDO pushdown spec**

```ts
// test/unit/domain/specification-contract.test.ts
const SPEC_PUSHDOWN: Array<
  [
    string,
    Specification<never>,
    Array<Record<string, unknown>>,
    (r: Record<string, unknown>) => unknown
  ]
> = [
  [
    'ClassiAttiveSpec',
    new ClassiAttiveSpec(),
    [
      { ID: '3A', ATTIVA: true }, // positiva
      { ID: '3B', ATTIVA: false }, // NEGATIVA — obbligatoria
      { ID: '3C' } // colonna assente — caso limite
    ],
    (r) => Classe.fromData(r)
  ]
  // … una riga per ogni spec pushdown …
];

it.each(SPEC_PUSHDOWN)('%s: pushdown e in-memory concordano', (_nome, spec, righe, hydrate) => {
  const { divergenti } = assertSpecificationContract(spec, righe, hydrate);
  expect(divergenti).toEqual([]);
});
```

**The guard is worth exactly what its rows are worth.** With positive rows only, both halves agree and the test passes vacuously. Every entry needs at least one row the spec does **not** satisfy, plus the edge cases that bite here: multi-value CSV cells, and sheet cells that come back as strings where the code expects numbers. An entry with `rows: []` is a review failure.

- [ ] **Step 4: Fix what the guard catches**

Two divergences are already known from the audit and must be resolved, not silenced:

- **`RuoliPerDocenteSpec`** — `RUOLI.DOCENTE` is a CSV (`"a@x.it,b@x.it"`), `isSatisfiedBy` does containment, `toQueryObject` produces exact equality, so a `find()` would silently return **fewer rows than it should**. It does not explode today only because `RuoloRepository.findByDocente` hand-bypasses the pushdown with `this.all().filter(...)`. Make it safe by contract: `toQueryObject()` returns `null`, and the comment changes from "narrowing hint" to the real reason. Then `findByDocente` can go back through `find()`.
- **`AlunniAttiviSpec`** — typed `Specification<RowLike>` with an `isSatisfiedBy` that reads a raw row, while `find()` hydrates entities. It works only because `toQueryObject` is non-null so `isSatisfiedBy` is never called. The day `ATTIVO` stops being pushdownable it returns `false` for everything and `getAlunniAttivi` silently returns empty. Re-type it as `Specification<Alunno>` and read through the entity.

- [ ] **Step 5: `EqualityFieldSpec`**

```js
// DomainRepositoryLib/src/specifications/EqualityFieldSpec.js
import { Specification } from './Specification.js';

/**
 * Specification di uguaglianza in cui isSatisfiedBy e toQueryObject sono
 * coerenti per costruzione: il valore letto dall'entità e quello confrontato
 * nella query sono lo stesso.
 *
 * @param {string} column Nome colonna DB per il pushdown.
 * @param {Function} read (entity) => valore in memoria.
 * @param {*} expected Valore atteso.
 */
export class EqualityFieldSpec extends Specification {
  constructor(column, read, expected) {
    super();
    this._column = column;
    this._read = read;
    this._expected = expected;
  }
  isSatisfiedBy(entity) {
    return this._read(entity) === this._expected;
  }
  toQueryObject() {
    return { [this._column]: this._expected };
  }
  toString() {
    return `${this._column} = ${String(this._expected)}`;
  }
}
```

Ambient declaration:

```ts
// types/gaslibs/index.d.ts
abstract class EqualityFieldSpec<T> extends Specification<T> {
  constructor(column: string, read: (e: T) => unknown, expected: unknown);
}
```

- [ ] **Step 6: Migrate the 21 specs, keeping named shells**

```ts
// before — 11 lines
export class ProgettiPerClasseSpec extends Specification<Progetto> {
  constructor(private readonly classeId: ClasseId) {
    super();
  }
  isSatisfiedBy(p: Progetto): boolean {
    return p.classe === this.classeId.value;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_PROGETTI.CLASSE]: this.classeId.value };
  }
}

// after — 5 lines
/** Progetti assegnati a una classe (ref 06 §13). */
export class ProgettiPerClasseSpec extends EqualityFieldSpec<Progetto> {
  constructor(classeId: ClasseId) {
    super(COL_PROGETTI.CLASSE, (p) => p.classe, classeId.value);
  }
}
```

Family 2 works identically: `super(COL_DOCENTI.ITP, (d) => d.isITP(), true)`.

**Named shells, never anonymous factory products** — `QueryTranslator` logs specifications by constructor name (`Translating specification via toQueryObject(): ProgettiPerClasseSpec`), and an anonymous class makes that log useless.

Migrate one spec file at a time, re-running the task-3 contract test after each: it is what makes this verifiable rather than a reading exercise.

- [ ] **Step 7: Full gate + commit**

```bash
cd GasLibraryFactory && npm test && cd ..
npm run refresh:vendor && npm run verify:vendor
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build
git add -A && git commit -m "feat(glf): assertSpecificationContract + EqualityFieldSpec, 21 spec ALDO migrate"
```

---

### Task 8: Batched online-test seeding

The one item whose payoff cannot be proven offline.

**Files:**

- Modify: `GasLibraryFactory/GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js` (add `appendRows`)
- Modify: `src/onlinetests/SampleDatabaseBuilder.ts:29` (`ISampleSpreadsheet`), and its 17 call sites
- Modify: `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (49 call sites), `src/onlinetests/data/Seeders.ts` (38 call sites)
- Modify: the four `RecordingSpreadsheet` fakes in `test/unit/onlinetests/`

**Interfaces:**

- Consumes: nothing.
- Produces: `appendRows(sheetName: string, rows: Array<Record<string, unknown>>): void` on both `SampleSpreadsheetBuilder` and `ISampleSpreadsheet`. `appendRow` **stays** — the fakes implement it and their tests stay.

- [ ] **Step 1: Write the failing test**

```js
// GasOnlineTestFramework/src/__tests__/SampleSpreadsheetBuilder.test.js
test('appendRows scrive un solo blocco e fa un solo flush', () => {
  const setValues = jest.fn();
  const sheet = { getLastRow: () => 1, getRange: jest.fn(() => ({ setValues })) };
  const builder = makeBuilder({ getSheetByName: () => sheet }, { T: ['A', 'B'] });

  builder.appendRows('T', [{ A: 1, B: 2 }, { A: 3 }]);

  expect(sheet.getRange).toHaveBeenCalledTimes(1);
  expect(sheet.getRange).toHaveBeenCalledWith(2, 1, 2, 2);
  expect(setValues).toHaveBeenCalledWith([
    [1, 2],
    [3, '']
  ]);
  expect(SpreadsheetApp.flush).toHaveBeenCalledTimes(1);
});

test('appendRows su elenco vuoto non tocca il foglio', () => {
  const getSheetByName = jest.fn();
  makeBuilder({ getSheetByName }, { T: ['A'] }).appendRows('T', []);
  expect(getSheetByName).not.toHaveBeenCalled();
});
```

Run: `cd GasLibraryFactory && npx jest GasOnlineTestFramework -t "appendRows"`
Expected: FAIL, "builder.appendRows is not a function".

- [ ] **Step 2: Implement**

```js
/**
 * @description Appends many rows in one setValues call, with a single flush at
 * the end. Mirrors {@link appendRow}'s header-order matching, without paying a
 * getSheetByName + appendRow + flush round-trip per row.
 * @param {string} sheetName
 * @param {Array<Object<string,*>>} rows Values keyed by header name.
 * @throws {Error} If the named sheet does not exist.
 */
appendRows(sheetName, rows) {
  if (rows.length === 0) return;
  const sheet = this.spreadsheet.getSheetByName(sheetName);
  if (sheet === null) {
    throw new Error(
      `Sheet "${sheetName}" not found in spreadsheet "${this.spreadsheet.getName()}".`
    );
  }
  const headerRow = this._headersBySheet.get(sheetName) || [];
  const values = rows.map((row) =>
    headerRow.map((header) => (row[String(header)] !== undefined ? row[String(header)] : ''))
  );
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headerRow.length).setValues(values);
  SpreadsheetApp.flush();
}
```

Run: `cd GasLibraryFactory && npx jest GasOnlineTestFramework`
Expected: PASS.

- [ ] **Step 3: Widen the ALDO port and the fakes**

Add `appendRows(sheetName: string, rows: Array<Record<string, unknown>>): void` to `ISampleSpreadsheet` (`src/onlinetests/SampleDatabaseBuilder.ts:29`), and give each of the four `RecordingSpreadsheet` fakes an `appendRows` recorder alongside its existing `appendRow`.

- [ ] **Step 4: Convert the 104 call sites**

Accumulate per table, flush once:

```ts
// before
for (const alunno of alunni) {
  sample.appendRow(TABLE.ALUNNI, alunno);
}
// after
sample.appendRows(TABLE.ALUNNI, alunni);
```

Where rows are built across several loops, collect into an array first and make one `appendRows` call per table at the end. Effect: hundreds of round-trips collapse to roughly one per table, and one `flush()` per table instead of per row.

- [ ] **Step 5: Offline gate**

```bash
cd GasLibraryFactory && npm test && cd ..
npm run refresh:vendor && npm run verify:vendor
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build
```

- [ ] **Step 6: Measure on a real online run**

```bash
npm run push:online
```

Then run the online suite from the Apps Script editor and record wall-clock before and after. **Round-trip count is the entire point of this task**, so a green offline suite does not close it. Against the 6-minute GAS cap this is the difference between a run that finishes and one that does not. Record both numbers in the commit message.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "perf(ally): seeding online in batch via appendRows (prima Xs, dopo Ys)"
```

---

### Task 9: The remaining assertion sweep

**Files:**

- Modify: the remaining 49 loose sites across `test/unit/` in ALDO
- Modify: ~941 sites across `GasLibraryFactory/*/src/__tests__/`
- Modify: `GasExpressionEngineLib/src/__tests__/ExpressionEngineService.test.js:202`
- Modify: `GoogleApiWrapper/src/__tests__/integration/BatchRateLimiterIntegration.test.js:272,276,280,284,292,296,302`
- Modify: `WorkspaceTemplateEngine/src/__tests__/integration/DocumentProcessorIntegration.test.js:192`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing importable.

- [ ] **Step 1: Finish ALDO (49 sites)**

Same four rules as task 1. Order does not matter; one file per commit still does.

- [ ] **Step 2: GLF, widest blast radius first**

`GoogleApiWrapper` and `SheetDBLib` hold the most loose assertions and the widest blast radius. Then the remaining 14 libraries. Counts to work down: 617 `toBeDefined()`, 167 `not.toThrow()`, 101 `toBeGreaterThan(0)`, 56 `expect.any(...)` — 941 assertions that pass on almost any non-crashing output.

- [ ] **Step 3: The 7 `BatchRateLimiterIntegration` skips → run offline**

The rate limiter is logic, not API: quota accounting, backoff intervals, batch sizing. Un-skip each and drive it through the existing GAS mocks. If one genuinely needs a live API, move that one to step 4's treatment instead of re-skipping it.

- [ ] **Step 4: The `DocumentProcessor` skip → `__testOnline__/`**

"create new document from template (feature not implemented)" belongs where a real API exists. Move it under `__testOnline__/`. If the feature really is unimplemented, the test moves _and_ is marked as the pending specification of that feature — it does not stay an `it.skip` in an offline suite, which is the only option that buys nothing.

- [ ] **Step 5: The JSEP skip → pin the limitation**

```js
// before: it.skip('array indices in placeholders (JSEP limitation)', …)
// after
it('gli indici array nei placeholder falliscono in modo riconoscibile', () => {
  expect(() => engine.evaluate('{{items[0].nome}}', ctx)).toThrow(/JSEP|indice|index/i);
});
```

A pinned limitation is documentation that fails when the limitation lifts. A skipped test is neither.

- [ ] **Step 6: Gate after every library**

```bash
cd GasLibraryFactory && npx jest <LibraryName>
```

and, for any library whose production code you had to fix:

```bash
cd ".." && npm run refresh:vendor && npm run verify:vendor && npm test
```

- [ ] **Step 7: Final full gate**

```bash
cd GasLibraryFactory && npm test && cd ..
npm run refresh:vendor && npm run verify:vendor
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build
```

Expected: all green, zero `it.skip` in either repo's offline suites.

---

## Notes for whoever executes this

**Expect red during tasks 1 and 9.** That is the point. Every new failure is one of exactly two things: a hardened assertion catching a real defect — fix the production code and say so in the commit message — or an assertion tighter than the true contract — loosen it to the contract. There is no third option, and "loosen it back to `toBeDefined()`" is not one of them.

**Task 4 step 1, task 5 step 1, and task 6 step 1 each settle a question before writing code.** They are not optional preamble: the `MateriaId` trim behaviour, the `parseDate` edge-case disagreement, and the `FieldSpecification` ambient mismatch each change what the correct implementation is.

**Task 6 step 6 may need to stop and ask.** If `FunctionSpecification`'s ambient signature does not cover ALDO's generic need, widening the library is a decision for the user, not a default — CLAUDE.md rule 3.
