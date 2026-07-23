# Drive Links, Deficiency Box, Mock-Data Variety, RIEPILOGO_CLASSE, LOG_MAIL.TESTO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix generated-document Drive links to be type-aware, fix the deficiency email box's styling/subject-name bug, add representative/religion variety to the e2e mock DB, ship a new RIEPILOGO_CLASSE document type, and add a plain-text audit column to LOG_MAIL.

**Architecture:** Five independent changes against the existing Clean Architecture layering (`src/domain` → `src/application` → `src/infrastructure`), plus one GasLibraryFactory (CoreUtilsLib) extension consumed back into ALDO via the vendor bundle. No new CDU providers or recipes are needed — `RECIPES.CLASSE_COMPLETA` (`src/application/context-engine/Recipe.ts`) already carries every field the new document needs.

**Tech Stack:** TypeScript (ALDO, Babel→Chrome80/GAS V8 target), Jest (`ts-jest`), the vendored GasLibraryFactory bundle (`vendor/gaslibs.Code.js`, ambient ) plus its own source monorepo at `GasLibraryFactory/` (plain JS, its own Jest suite).

## Global Constraints

- GAS V8 target: synchronous code only, no Node-specific/unsupported-browser APIs (CLAUDE.md).
- Native GAS service globals only inside `GoogleApiWrapper` (L2) — none of this plan's ALDO code touches them directly.
- Never edit `dist/*` or `vendor/gaslibs.Code.js` by hand — the latter is regenerated only via `npm run refresh:vendor`.
- New services/strategies are wired in `src/config/Bootstrap.ts` via `ServiceContainer`, never constructed ad hoc in application code.
- GasLibraryFactory-first: do not reimplement library-owned logic in `src/`.
- Run `npm test` (ALDO) after every task; run `npm test` inside `GasLibraryFactory/` after Task 4 specifically, before refreshing the vendor bundle.
- Only create commits when instructed; each task below ends with a commit step per repo convention (small, single-purpose commits), matching this session's established practice — stop and let the user review if a step's tests don't pass before moving to the next task.

---

## Task 1: Type-aware Drive links for generated documents

**Files:**
- Modify: `src/application/pipelines/documentSteps.ts` (imports near top; `CloneTemplateStep._executeLogic` at line ~207-216)
- Test: `test/unit/application/pipelines/document-steps.test.ts` (new tests near the existing `CloneTemplateStep` test at line 123)

**Interfaces:**
- Consumes: `ConfigurazioneDocumento.formato: FormatoOutput` (`src/domain/entities/ConfigurazioneDocumento.ts`, already implemented — no change needed there), `FormatoOutput` enum (`src/domain/value-objects/enums.ts`: `GDOC | GSHEET | PDF | TEXT`).
- Produces: `buildFileLink(fileId: string, formato: FormatoOutput): string`, a new non-exported pure function in `documentSteps.ts`, called only from `CloneTemplateStep._executeLogic`.

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/application/pipelines/document-steps.test.ts`, directly after the existing `test('CloneTemplateStep copies via Drive facade and sets newFileId', ...)` block (around line 133):

```ts
test('CloneTemplateStep sets newFileLink to a Docs edit URL for FORMATO=GDOC (item 1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db); // fixture CONF_DOC[0] (CD1) has FORMATO: 'GDOC'
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('templateId', 'tmpl_verbale');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(logger, drive).execute(ctx);
  const fileId = ctx.get<string>('newFileId')!;
  expect(ctx.get('newFileLink')).toBe(`https://docs.google.com/document/d/${fileId}/edit`);
});

test('CloneTemplateStep sets newFileLink to a Sheets edit URL for FORMATO=GSHEET (item 1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set(
    'confDoc',
    ConfigurazioneDocumento.fromData({ ...fixtureTables().CONF_DOC[0]!, FORMATO: 'GSHEET' })
  );
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'Condotta_5A');
  ctx.set('templateId', 'tmpl_condotta');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(logger, drive).execute(ctx);
  const fileId = ctx.get<string>('newFileId')!;
  expect(ctx.get('newFileLink')).toBe(
    `https://docs.google.com/spreadsheets/d/${fileId}/edit?gid=0#gid=0`
  );
});

test('CloneTemplateStep falls back to the generic Drive file link for FORMATO=PDF/TEXT (item 1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set(
    'confDoc',
    ConfigurazioneDocumento.fromData({ ...fixtureTables().CONF_DOC[0]!, FORMATO: 'PDF' })
  );
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'X');
  ctx.set('templateId', 'tmpl_verbale');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(logger, drive).execute(ctx);
  const fileId = ctx.get<string>('newFileId')!;
  expect(ctx.get('newFileLink')).toBe(`https://drive.google.com/file/d/${fileId}/edit`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "newFileLink"`
Expected: all 3 FAIL — current code always produces `https://drive.google.com/file/d/{id}/edit` regardless of FORMATO, so the GDOC/GSHEET-specific assertions fail (the PDF/TEXT test passes even before the fix, since the fallback URL is unchanged — verify it still fails to compile if `ConfigurazioneDocumento` isn't imported, otherwise it may already pass; that's fine, Step 4 must not break it).

- [ ] **Step 3: Implement `buildFileLink` and wire it into `CloneTemplateStep`**

In `src/application/pipelines/documentSteps.ts`, change the enums import (currently `import { StatoDocumento, SchemaSottocartelle, GestioneSupplenti } from '../../domain/value-objects/enums';`) to also import `FormatoOutput`:

```ts
import {
  StatoDocumento,
  SchemaSottocartelle,
  GestioneSupplenti,
  FormatoOutput
} from '../../domain/value-objects/enums';
```

Add this function near the other small helpers at the top of the file (after `classeNome`, before `AnalyzeContextStep`):

```ts
/**
 * Type-aware Drive edit link per CONF_DOC.FORMATO (10 §8, item 1): the cloned
 * artifact is still a live Drive file at this point in the pipeline regardless
 * of its eventual export format, so PDF/TEXT (or any future FORMATO value)
 * keeps the generic Drive file link.
 */
function buildFileLink(fileId: string, formato: FormatoOutput): string {
  switch (formato) {
    case FormatoOutput.GSHEET:
      return `https://docs.google.com/spreadsheets/d/${fileId}/edit?gid=0#gid=0`;
    case FormatoOutput.GDOC:
      return `https://docs.google.com/document/d/${fileId}/edit`;
    default:
      return `https://drive.google.com/file/d/${fileId}/edit`;
  }
}
```

Replace the body of `CloneTemplateStep._executeLogic`:

```ts
  protected _executeLogic(ctx: PipelineContext): void {
    const fileId = this.drive.copyFile(
      ctx.get<string>('templateId')!,
      ctx.get<string>('nomeFile')!,
      ctx.get<string>('destFolderId')!
    );
    this.setResult(ctx, 'newFileId', fileId);
    // /edit (not /view): generated files must open ready to edit, not in preview (10 §8).
    this.setResult(ctx, 'newFileLink', buildFileLink(fileId, confDoc(ctx).formato));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts`
Expected: PASS, full file (no regressions in the other `CloneTemplateStep`/`RegisterDocumentStep` tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/application/pipelines/documentSteps.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "$(cat <<'EOF'
fix: generate type-aware Drive edit links (Docs/Sheets) instead of a generic file link

CloneTemplateStep hardcoded https://drive.google.com/file/d/{id}/edit for
every generated document; CONF_DOC.FORMATO already declares GDOC/GSHEET/PDF/
TEXT per document type, so use it to pick the right editor URL shape.
EOF
)"
```

---

## Task 2: Deficiency-box styling — drop background fill, use full subject name

**Files:**
- Modify: `src/application/email/boxes.ts` (`renderCarenzeBox`, lines 109-123)
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**
- Consumes: `CarenzaFormatoB` (unchanged: `{ sigla, nome, colore, colore2, simbolo, nomeSintesi, descrizione }`, still produced by `mapCarenzeFormatoB` exactly as today — `colore2`/`nomeSintesi` stay on the type, just unused by this one renderer).
- Produces: no new exports; `renderCarenzeBox`'s rendered HTML changes shape only (no `background-color`, title uses `nome` not `nomeSintesi`).

- [ ] **Step 1: Write the failing test**

Add to `test/unit/application/email-boxes.test.ts`, directly after the existing `test('carenze box renders one coloured sub-box per materia (11 §11)', ...)` block (around line 107):

```ts
function materieConNomeDistintoDaSintesi(): MateriaRepository {
  const tables = {
    ...fixtureTables(),
    MATERIE: [
      {
        ID: 'MATE',
        NOME: 'Matematica e Informatica',
        SINTESI: 'MAT',
        COLORE_1: '#c0392b',
        COLORE_2: '#fdecea',
        SIMBOLO: '📐',
        ESAME_CFG: null
      }
    ]
  };
  return new MateriaRepository(new FakeDatabase(tables));
}

test('carenze box title uses MATERIE.NOME (full name), not SINTESI, and has no background fill (item 2)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'carenze', TITOLO: 'Carenze rilevate' }]),
    cduRecord(),
    materieConNomeDistintoDaSintesi(),
    templates
  );
  const box = out.boxes['carenze']!;
  expect(box.html).toContain('📐 Matematica e Informatica');
  expect(box.html).not.toContain('📐 MAT<'); // not the short SINTESI form
  expect(box.html).not.toContain('background-color:#fdecea');
  expect(box.html).toContain('border-left:4px solid #c0392b');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "no background fill"`
Expected: FAIL — current output contains `📐 MAT` (from `nomeSintesi`) and `background-color:#fdecea`.

- [ ] **Step 3: Fix `renderCarenzeBox`**

In `src/application/email/boxes.ts`, replace the function body (lines 109-123):

```ts
function renderCarenzeBox(data: unknown): string {
  const rows = data as CarenzaFormatoB[];
  return rows
    .map((r) => {
      const titolo = r.simbolo !== '' ? `${r.simbolo} ${r.nome}` : r.nome;
      return (
        `<div style="border-left:4px solid ${safeColor(r.colore, DEFAULT_BORDER)}; padding:12px 12px 12px 16px; margin-bottom:10px;">` +
        `<h3 style="margin:0 0 8px 0; font-size:16px; color:#333;">${escapeHtml(titolo)}</h3>` +
        `<div style="font-size:14px; color:#555; line-height:1.5;">${escapeHtml(r.descrizione)}</div></div>`
      );
    })
    .join('');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: PASS, full file (the pre-existing test at line 98 still passes — the shared fixture's `MATE.NOME === MATE.SINTESI === 'Matematica'`, so it can't tell the two fields apart, which is exactly why the new fixture-overriding test above is needed).

- [ ] **Step 5: Commit**

```bash
git add src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "$(cat <<'EOF'
fix: deficiency email box uses full subject name, drops background tint

renderCarenzeBox titled each per-subject box with MATERIE.SINTESI (short
form) and filled its background with MATERIE.COLORE_2; only the left
border should carry color, and the title should be the full MATERIE.NOME.
EOF
)"
```

---

## Task 3: Mock-data variety — RELIGIONE enum fix + class rep / religion spread

**Files:**
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts` (`ClasseLayout` interface, `classLayouts()`, `seedAlunni`, `seedAlunniAnnoPrecedente`)
- Modify: `src/onlinetests/SampleDatabaseBuilder.ts` (`seedAlunni`)
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**
- Consumes: `ReligioneScelta` enum (`src/domain/value-objects/enums.ts`: `SI | NO | ALT`).
- Produces: `ClasseLayout` gains `studentRepCount: number`, `parentRepCount: number`, `religionExceptions: Array<{ index: number; scelta: ReligioneScelta }>` — internal to `E2eSampleDatabaseBuilder`, not exported, so no other file's types change.

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/onlinetests/e2e-sample-database-builder.test.ts`, after the existing `test('exactly RIPETENTE_1A and RIPETENTE_3C are flagged RIPETENTE this year', ...)` block (around line 224):

```ts
test('RELIGIONE is always a valid ReligioneScelta value (SI/NO/ALT), never a boolean (item 3)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  for (const a of alunni) {
    expect(['SI', 'NO', 'ALT']).toContain(a[COL_ALUNNI.RELIGIONE]);
  }
});

test('each class gets a distinct 0/1/2 spread of student and parent representatives (item 3)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id);
  const studentReps = (id: string) =>
    byClasse(id).filter((a) => a[COL_ALUNNI.RAPPR_STUD] === true).length;
  const parentReps = (id: string) =>
    byClasse(id).filter((a) => String(a[COL_ALUNNI.RAPPR_GEN] ?? '').trim() !== '').length;

  expect(studentReps(CLASSE_A)).toBe(0);
  expect(parentReps(CLASSE_A)).toBe(0);
  expect(studentReps(CLASSE_B)).toBe(1);
  expect(parentReps(CLASSE_B)).toBe(1);
  expect(studentReps(CLASSE_C)).toBe(2);
  expect(parentReps(CLASSE_C)).toBe(1);
  expect(studentReps(CLASSE_C_PARTNER)).toBe(1);
  expect(parentReps(CLASSE_C_PARTNER)).toBe(2);

  // 0/1/2 is covered somewhere across the 4 classes for each dimension.
  const studentCounts = new Set([CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map(studentReps));
  const parentCounts = new Set([CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map(parentReps));
  expect(studentCounts).toEqual(new Set([0, 1, 2]));
  expect(parentCounts).toEqual(new Set([0, 1, 2]));
});

test('each class has at least one NO and/or ALT religion exception alongside the SI majority (item 3)', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const alunni = sheets.get('_ALDO_E2E_SAMPLE')!.rows[TABLE.ALUNNI]!;
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id);
  for (const id of [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER]) {
    const rows = byClasse(id);
    const exceptions = rows.filter((a) => a[COL_ALUNNI.RELIGIONE] !== 'SI');
    expect(exceptions.length).toBeGreaterThan(0);
    expect(rows.filter((a) => a[COL_ALUNNI.RELIGIONE] === 'SI').length).toBe(
      rows.length - exceptions.length
    );
  }
  const all = alunni.map((a) => a[COL_ALUNNI.RELIGIONE]);
  expect(all).toContain('NO');
  expect(all).toContain('ALT');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "item 3"`
Expected: all 3 FAIL — current `RELIGIONE` is boolean `true` (not `'SI'`), and `RAPPR_STUD`/`RAPPR_GEN` are always `false` for every student.

- [ ] **Step 3: Implement the layout/religion/rep changes**

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, add `ReligioneScelta` to the enums import (currently `import { StatoDocumento } from '../domain/value-objects/enums';`):

```ts
import { StatoDocumento, ReligioneScelta } from '../domain/value-objects/enums';
```

Extend the `ClasseLayout` interface (currently at line 163-168):

```ts
interface ClasseLayout {
  id: string;
  count: number;
  coordIndex: number;
  articolazione: string;
  /** First N students (0-indexed within the class) get RAPPR_STUD=true (item 3). */
  studentRepCount: number;
  /** Last N students (0-indexed within the class) get a free-text RAPPR_GEN name (item 3). */
  parentRepCount: number;
  /** 0-indexed-within-class overrides of the ReligioneScelta.SI default (item 3). */
  religionExceptions: Array<{ index: number; scelta: ReligioneScelta }>;
}
```

Replace `classLayouts()` (currently lines 236-253):

```ts
  private classLayouts(): ClasseLayout[] {
    return [
      {
        id: CLASSE_A,
        count: 20,
        coordIndex: 1,
        articolazione: '',
        studentRepCount: 0,
        parentRepCount: 0,
        religionExceptions: [
          { index: 0, scelta: ReligioneScelta.NO },
          { index: 3, scelta: ReligioneScelta.ALT }
        ]
      },
      {
        id: CLASSE_B,
        count: 20,
        coordIndex: 1,
        articolazione: '',
        studentRepCount: 1,
        parentRepCount: 1,
        religionExceptions: [{ index: 0, scelta: ReligioneScelta.NO }]
      },
      {
        id: CLASSE_C,
        count: 8,
        coordIndex: 3,
        articolazione: JSON.stringify({ parent: null, partner: CLASSE_C_PARTNER, partners: null }),
        studentRepCount: 2,
        parentRepCount: 1,
        religionExceptions: [{ index: 2, scelta: ReligioneScelta.ALT }]
      },
      {
        id: CLASSE_C_PARTNER,
        count: 12,
        coordIndex: 4,
        articolazione: JSON.stringify({ parent: null, partner: CLASSE_C, partners: null }),
        studentRepCount: 1,
        parentRepCount: 2,
        religionExceptions: [
          { index: 0, scelta: ReligioneScelta.NO },
          { index: 1, scelta: ReligioneScelta.ALT }
        ]
      }
    ];
  }
```

Add a module-level helper near `ALUNNO_COGNOMI`/`ALUNNO_NOMI` (after their declarations, around line 55):

```ts
/** Parent-rep free-text name (item 3): offset from the pools used for the student's own
 * name (+3/+4) so a parent's name never echoes the row's own student name. */
function parentRepName(counter: number): string {
  const cognome = ALUNNO_COGNOMI[(counter - 1 + 3) % ALUNNO_COGNOMI.length]!;
  const nome = ALUNNO_NOMI[(counter - 1 + 4) % ALUNNO_NOMI.length]!;
  return `${cognome} ${nome}`;
}
```

Replace `seedAlunni` (currently lines 345-371):

```ts
  /** Realistic Italian full names (item 5), deterministic per counter — cognome/nome pool sizes are coprime (17/13) so none of the 60 students repeat. */
  private seedAlunni(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    let counter = 1;
    for (const layout of layouts) {
      for (let n = 0; n < layout.count; n++) {
        const email = e2eAlunnoEmail(counter);
        const cognome = ALUNNO_COGNOMI[(counter - 1) % ALUNNO_COGNOMI.length]!;
        const nome = ALUNNO_NOMI[(counter - 1) % ALUNNO_NOMI.length]!;
        const eccezione = layout.religionExceptions.find((e) => e.index === n);
        const isRapprStud = n < layout.studentRepCount;
        const isRapprGen = n >= layout.count - layout.parentRepCount;
        sample.appendRow(TABLE.ALUNNI, {
          [COL_ALUNNI.EMAIL]: email,
          [COL_ALUNNI.COGNOMENOME]: `${cognome} ${nome}`,
          [COL_ALUNNI.CLASSE]: layout.id,
          [COL_ALUNNI.RELIGIONE]: eccezione?.scelta ?? ReligioneScelta.SI,
          [COL_ALUNNI.CURRICULUM]: '',
          [COL_ALUNNI.ATTIVO]: true,
          // Repeaters (item "repeaters"): redoing this same class, see
          // `seedClassiAnnoPrecedente`/`seedAlunniAnnoPrecedente`.
          [COL_ALUNNI.RIPETENTE]: email === RIPETENTE_1A || email === RIPETENTE_3C,
          [COL_ALUNNI.RAPPR_STUD]: isRapprStud,
          [COL_ALUNNI.RAPPR_GEN]: isRapprGen ? parentRepName(counter) : '',
          [COL_ALUNNI.TUTOR_1]: `tutor${counter}@onlinetest.aldo.local`,
          [COL_ALUNNI.TUTOR_2]: '',
          [COL_ALUNNI.NOTE]: ''
        });
        counter += 1;
      }
    }
  }
```

In `seedAlunniAnnoPrecedente` (currently lines 423-453), fix the two mis-typed fields — replace:

```ts
          [COL_ALUNNI.RELIGIONE]: true,
```
with
```ts
          [COL_ALUNNI.RELIGIONE]: ReligioneScelta.SI,
```
and replace:
```ts
          [COL_ALUNNI.RAPPR_GEN]: false,
```
with
```ts
          [COL_ALUNNI.RAPPR_GEN]: '',
```
(both inside the same `prior.appendRow(TABLE.ALUNNI, {...})` call — no rep/religion variety needed for the prior-year roster, only valid-enum/valid-type values).

In `src/onlinetests/SampleDatabaseBuilder.ts`, add the import (after the existing `import { TABLE, COL_ALUNNI, ... } from '../config/schema';` block):

```ts
import { ReligioneScelta } from '../domain/value-objects/enums';
```

In `seedAlunni` (lines 259-290), replace both occurrences of `[COL_ALUNNI.RELIGIONE]: true,` with `[COL_ALUNNI.RELIGIONE]: ReligioneScelta.SI,`, and both occurrences of `[COL_ALUNNI.RAPPR_GEN]: false,` with `[COL_ALUNNI.RAPPR_GEN]: '',`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: PASS, full file (including the pre-existing `seeds 4 CLASSI rows...` count test, unaffected by these field-value-only changes).

Run: `npx jest --config jest.config.cjs`
Expected: PASS, full suite (confirms `SampleDatabaseBuilder.ts`'s change doesn't break anything using it, e.g. `test/unit/onlinetests/index.test.ts`).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/onlinetests/E2eSampleDatabaseBuilder.ts src/onlinetests/SampleDatabaseBuilder.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "$(cat <<'EOF'
fix: mock-data RELIGIONE was a boolean, not a valid ReligioneScelta; add rep/religion variety

Both sample-DB builders seeded RELIGIONE: true (a boolean) against a field
typed SI|NO|ALT. Fixed in both, and gave each of the 4 e2e classes a
distinct 0/1/2 spread of student/parent representatives plus at least one
NO and one ALT religion exception, so class-level rosters exercise every
case instead of only the all-SI/no-reps default.
EOF
)"
```

---

## Task 4: GasLibraryFactory — `HtmlSanitizer.stripToPlainText`

**Files:**
- Modify: `GasLibraryFactory/CoreUtilsLib/src/utils/HtmlSanitizer.js`
- Test: `GasLibraryFactory/CoreUtilsLib/src/__tests__/HtmlSanitizer.test.js`

**Interfaces:**
- Consumes: `decodeHtmlEntities` (`GasLibraryFactory/CoreUtilsLib/src/internal/HtmlEntityCodec.js`, already implemented — decodes named/numeric HTML entities via the vendored `he` package).
- Produces: `HtmlSanitizer.stripToPlainText(html: string, options?: { maxLength?: number; truncationMode?: 'marker' | 'cut' | 'none' }): string`, a new static method, consumed by ALDO in Task 6 as an ambient global (Task 5 adds the ambient TS declaration).

- [ ] **Step 1: Write the failing tests**

Add to `GasLibraryFactory/CoreUtilsLib/src/__tests__/HtmlSanitizer.test.js`, as a new `describe` block after `HtmlSanitizer.escapeContextDeep` (before `describe('HtmlSanitizer.safeUrl', ...)`):

```js
describe('HtmlSanitizer.stripToPlainText', () => {
  test('strips tags, leaving plain text', () => {
    expect(HtmlSanitizer.stripToPlainText('<p>Ciao <b>Mario</b>!</p>')).toBe('Ciao Mario!');
  });

  test('converts block boundaries (br/p/div/li/tr) to line breaks before stripping tags', () => {
    const html = '<p>Prima riga</p><p>Seconda riga</p><br>Terza riga';
    expect(HtmlSanitizer.stripToPlainText(html)).toBe('Prima riga\nSeconda riga\nTerza riga');
  });

  test('converts list items to one line each', () => {
    const html = '<ul><li>Uno</li><li>Due</li></ul>';
    expect(HtmlSanitizer.stripToPlainText(html)).toBe('Uno\nDue');
  });

  test('decodes HTML entities produced by escapeHtml', () => {
    expect(HtmlSanitizer.stripToPlainText('A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;')).toBe(
      'A & B <C> "D" \'E\''
    );
  });

  test('collapses runs of blank lines and trims', () => {
    const html = '<p>Uno</p>\n\n\n<p></p><p>Due</p>   ';
    expect(HtmlSanitizer.stripToPlainText(html)).toBe('Uno\nDue');
  });

  test('null-safe: null/undefined become empty string', () => {
    expect(HtmlSanitizer.stripToPlainText(null)).toBe('');
    expect(HtmlSanitizer.stripToPlainText(undefined)).toBe('');
  });

  test('default maxLength is 2000, truncationMode "marker" cuts and appends an ellipsis', () => {
    const long = '<p>' + 'x'.repeat(2100) + '</p>';
    const result = HtmlSanitizer.stripToPlainText(long);
    expect(result.length).toBe(2000);
    expect(result.endsWith('…')).toBe(true);
    expect(result.slice(0, 1999)).toBe('x'.repeat(1999));
  });

  test('truncationMode "cut" truncates to maxLength with no marker', () => {
    const long = 'x'.repeat(50);
    const result = HtmlSanitizer.stripToPlainText(long, { maxLength: 10, truncationMode: 'cut' });
    expect(result).toBe('x'.repeat(10));
  });

  test('truncationMode "none" never truncates regardless of maxLength', () => {
    const long = 'x'.repeat(50);
    const result = HtmlSanitizer.stripToPlainText(long, { maxLength: 10, truncationMode: 'none' });
    expect(result).toBe('x'.repeat(50));
  });

  test('text shorter than maxLength is returned unchanged, no marker appended', () => {
    expect(HtmlSanitizer.stripToPlainText('<p>short</p>')).toBe('short');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `GasLibraryFactory/`): `npx jest CoreUtilsLib/src/__tests__/HtmlSanitizer.test.js -t "stripToPlainText"`
Expected: all FAIL with `TypeError: HtmlSanitizer.stripToPlainText is not a function`.

- [ ] **Step 3: Implement `stripToPlainText`**

In `GasLibraryFactory/CoreUtilsLib/src/utils/HtmlSanitizer.js`, add the import:

```js
import { escapeHtmlText, decodeHtmlEntities } from '../internal/HtmlEntityCodec.js';
```

Add the method to the `HtmlSanitizer` class, after `escapeContextDeep`:

```js
  /**
   * Strips HTML markup down to plain text: block-level boundaries (`<br>`,
   * `</p>`, `</div>`, `</li>`, `</tr>`) become line breaks BEFORE remaining
   * tags are stripped (so paragraph/list/row structure survives as line
   * breaks, not word-run-together text), HTML entities are decoded, blank-line
   * runs collapse, and the result is trimmed. Null-safe.
   * @param {*} value Raw HTML (coerced to string; `null`/`undefined` become `''`).
   * @param {{maxLength?: number, truncationMode?: 'marker'|'cut'|'none'}} [options]
   *   `maxLength` (default 2000) is the maximum returned length. `truncationMode`
   *   (default `'marker'`) cuts to `maxLength - 1` chars and appends `'…'` (total
   *   length ≤ `maxLength`); `'cut'` truncates to exactly `maxLength` with no
   *   marker; `'none'` never truncates.
   * @returns {string} Plain text, line-break-preserving, optionally truncated.
   */
  static stripToPlainText(value, options = {}) {
    const { maxLength = 2000, truncationMode = 'marker' } = options;
    const html = String(value ?? '');
    const withBreaks = html.replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, '\n');
    const stripped = withBreaks.replace(/<[^>]*>/g, '');
    const decoded = decodeHtmlEntities(stripped);
    const collapsed = decoded
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')
      .trim();

    if (truncationMode === 'none' || collapsed.length <= maxLength) {
      return collapsed;
    }
    if (truncationMode === 'cut') {
      return collapsed.slice(0, maxLength);
    }
    return collapsed.slice(0, Math.max(0, maxLength - 1)) + '…';
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `GasLibraryFactory/`): `npx jest CoreUtilsLib/src/__tests__/HtmlSanitizer.test.js`
Expected: PASS, full file.

- [ ] **Step 5: Run the full GasLibraryFactory suite and commit**

Run (from `GasLibraryFactory/`): `npm test`
Expected: PASS, full suite (this is the pre-push gate the CLAUDE.md workflow expects before any vendor refresh).

```bash
cd GasLibraryFactory
git add CoreUtilsLib/src/utils/HtmlSanitizer.js CoreUtilsLib/src/__tests__/HtmlSanitizer.test.js
git commit -m "$(cat <<'EOF'
feat: add HtmlSanitizer.stripToPlainText for HTML-to-audit-plain-text conversion

Generic HTML-stripping utility with no prior home in HtmlSanitizer (which
only escaped/validated so far) — same class of HTML-text-safety concern as
escapeHtml/safeColor/safeUrl, useful beyond the ALDO LOG_MAIL.TESTO caller
that motivated it. Configurable maxLength/truncationMode, defaults 2000/marker.
EOF
)"
cd ..
```

---

## Task 5: Refresh vendor bundle + ambient TypeScript declaration

**Files:**
- Modify: `types/gaslibs/index.d.ts` (`HtmlSanitizer` ambient class, lines 15-25)
- Modify (generated, not hand-edited): `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`

**Interfaces:**
- Produces: ambient `HtmlSanitizer.stripToPlainText` type visible to all ALDO TypeScript code (no import needed, same as `escapeHtml`/`safeColor`/`safeUrl` today).

- [ ] **Step 1: Add the ambient type declaration**

In `types/gaslibs/index.d.ts`, inside the `HtmlSanitizer` class declaration (currently lines 15-25), add after `escapeContextDeep`:

```ts
    /**
     * Strips HTML markup to plain text (block boundaries become line breaks,
     * entities decoded, blank lines collapsed, trimmed); optionally truncated.
     */
    static stripToPlainText(
      value: string,
      options?: { maxLength?: number; truncationMode?: 'marker' | 'cut' | 'none' }
    ): string;
```

- [ ] **Step 2: Refresh the vendor bundle**

Run: `npm run refresh:vendor`
Expected: builds `GasLibraryFactory` in testing mode and copies `dist/Code.js` to `vendor/gaslibs.Code.js`, printing `vendor: refreshed gaslibs.Code.js (v..., sha256 ...)`.

Run: `npm run verify:vendor`
Expected: passes (checksum matches what was just written).

- [ ] **Step 3: Typecheck and run the full ALDO suite**

Run: `npm run typecheck`
Expected: no errors (confirms the ambient declaration matches the real signature well enough for callers written in Task 6).

Run: `npm test`
Expected: PASS, full suite (the vendor refresh must not change behavior of any currently-passing test — `HtmlSanitizer.stripToPlainText` isn't called by ALDO code yet, only newly available).

- [ ] **Step 4: Commit**

```bash
git add types/gaslibs/index.d.ts vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION
git commit -m "$(cat <<'EOF'
chore: refresh vendored GasLibraryFactory bundle for HtmlSanitizer.stripToPlainText

Pulls in the new CoreUtilsLib method and adds its ambient TS declaration so
ALDO code can call it without an import, matching the existing HtmlSanitizer
convention.
EOF
)"
```

---

## Task 6: `LOG_MAIL.TESTO` — wire the plain-text audit column through ALDO

**Files:**
- Modify: `src/config/schema.ts` (`COL_LOG_MAIL`)
- Modify: `src/domain/entities/LogEmail.ts`
- Modify: `src/domain/repositories/ILogEmailRepository.ts`
- Modify: `src/infrastructure/repositories/LogEmailRepository.ts`
- Modify: `src/application/pipelines/emailSteps.ts` (`LogEmailStep._executeLogic`, line ~458-471)
- Test: `test/unit/infrastructure/log-repositories.test.ts`
- Test: `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**
- Consumes: `HtmlSanitizer.stripToPlainText` (ambient, from Task 4/5); `ctx.get<string>('corpoHtml')` (already set by `ComposeEmailStep`, `src/application/pipelines/emailSteps.ts:327`).
- Produces: `LogEmail.testo: string`; `ILogEmailRepository.registraInvio(patternId, destinatari, stato, corpoHtml, allegati?, errore?): LogEmail` (new required 4th parameter `corpoHtml: string`, inserted before the existing optional `allegati`/`errore`).

- [ ] **Step 1: Write the failing tests**

In `test/unit/infrastructure/log-repositories.test.ts`, replace the `registraInvio` call inside `test('LOG_MAIL: composite id, findByPattern / findFailed + registraInvio (06 §19)', ...)` (currently lines 112-114):

```ts
  const sent = r.registraInvio(
    'CDC_OTTOBRE',
    [Email.of('x@y.it')],
    StatoEmail.SUCCESS,
    '<p>Ciao <b>Mario</b>!</p>',
    { docs: ['a'] }
  );
```

and add, right after the existing `expect(sent.getAllegati()).toEqual({ docs: ['a'] });` line:

```ts
  expect(sent.testo).toBe('Ciao Mario!');
```

In `test/unit/application/pipelines/email-steps.test.ts`, add a new test directly after `test('LogEmailStep records SUCCESS in LOG_MAIL (11 §9)', ...)` (around line 565):

```ts
test('LogEmailStep records LOG_MAIL.TESTO as HTML-stripped plain text of the composed body (item 5)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  send(w, new FakeGmailFacade());
  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  const testo = String(row['TESTO']);
  expect(testo).toContain('Si comunica quanto segue per la classe');
  expect(testo).not.toContain('<');
  expect(testo).not.toContain('>');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/log-repositories.test.ts test/unit/application/pipelines/email-steps.test.ts -t "TESTO|testo"`
Expected: FAIL — `registraInvio` doesn't accept a `corpoHtml` parameter yet, `LogEmail` has no `testo` property, and `LOG_MAIL.TESTO` is never written.

- [ ] **Step 3: Implement the wiring**

In `src/config/schema.ts`, add `TESTO` to `COL_LOG_MAIL`:

```ts
export const COL_LOG_MAIL = {
  PATTERN: 'PATTERN',
  DESTINATARI: 'DESTINATARI',
  DATA: 'DATA',
  STATO: 'STATO',
  ALLEGATI: 'ALLEGATI',
  ERRORE: 'ERRORE',
  TESTO: 'TESTO'
} as const;
```

In `src/domain/entities/LogEmail.ts`, add the field. Constructor (after the `this.errore = ...` assignment, before `this.id = ...`):

```ts
    this.testo =
      typeof data[COL_LOG_MAIL.TESTO] === 'string' ? (data[COL_LOG_MAIL.TESTO] as string) : '';
```

Add the class property declaration alongside the others:

```ts
  public readonly testo: string;
```

Add to `toData()`:

```ts
      [COL_LOG_MAIL.TESTO]: this.testo,
```

(inserted into the existing returned object, e.g. right after `[COL_LOG_MAIL.ERRORE]: this.errore`).

In `src/domain/repositories/ILogEmailRepository.ts`, update the signature:

```ts
  registraInvio(
    patternId: string,
    destinatari: Email[],
    stato: StatoEmail,
    corpoHtml: string,
    allegati?: Record<string, unknown>,
    errore?: string
  ): LogEmail;
```

In `src/infrastructure/repositories/LogEmailRepository.ts`, update `registraInvio`:

```ts
  /** Appends a send record with DESTINATARI as CSV and DATA = now (ref 06 §19). TESTO is
   * HtmlSanitizer.stripToPlainText(corpoHtml) — plain text, ≤2000 chars, single-cell-safe (item 5). */
  registraInvio(
    patternId: string,
    destinatari: Email[],
    stato: StatoEmail,
    corpoHtml: string,
    allegati?: Record<string, unknown>,
    errore?: string
  ): LogEmail {
    const log = LogEmail.fromData({
      [COL_LOG_MAIL.PATTERN]: patternId,
      [COL_LOG_MAIL.DESTINATARI]: destinatari.map((e) => e.value).join(','),
      [COL_LOG_MAIL.DATA]: new Date().toISOString(),
      [COL_LOG_MAIL.STATO]: stato,
      [COL_LOG_MAIL.ALLEGATI]: allegati === undefined ? null : JSON.stringify(allegati),
      [COL_LOG_MAIL.ERRORE]: errore ?? '',
      [COL_LOG_MAIL.TESTO]: HtmlSanitizer.stripToPlainText(corpoHtml)
    });
    this.database.tables[TABLE.LOG_MAIL]!.insertRow(log.toData());
    this.database.save();
    return log;
  }
```

In `src/application/pipelines/emailSteps.ts`, update the `LogEmailStep._executeLogic` call site (currently lines 463-469):

```ts
    this.logMail.registraInvio(
      String(cfg(ctx)[COL_CONF_MAIL.ID]),
      destinatari,
      stato,
      ctx.get<string>('corpoHtml') ?? '',
      allegatiInfo,
      errors.length > 0 ? errors.join('; ') : undefined
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/log-repositories.test.ts test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS, both full files.

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS, full suite (confirms no other `registraInvio` call site was missed).

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts src/domain/entities/LogEmail.ts src/domain/repositories/ILogEmailRepository.ts src/infrastructure/repositories/LogEmailRepository.ts src/application/pipelines/emailSteps.ts test/unit/infrastructure/log-repositories.test.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "$(cat <<'EOF'
feat: add LOG_MAIL.TESTO audit column (plain-text, HTML-stripped email body)

registraInvio now takes the composed corpoHtml and stores
HtmlSanitizer.stripToPlainText(corpoHtml) (≤2000 chars, line breaks
preserved, single-Sheets-cell-safe) alongside the existing audit fields.
EOF
)"
```

---

## Task 7: `RiepilogoClasseGeneratorStrategy`

**Files:**
- Create: `src/application/strategies/RiepilogoClasseGeneratorStrategy.ts`
- Test: `test/unit/application/riepilogo-classe-generator.test.ts`

**Interfaces:**
- Consumes: `GeneratorStrategy` (`src/application/strategies/GeneratorStrategy.ts`), `ITemplateEngine.processDocument` (`src/infrastructure/facades/TemplateEngineFacade.ts:20`), `IDocumentTableFacade.insertTableAtMarker`/`.removeText` (`src/infrastructure/facades/DocumentTableFacade.ts`), `Cdu`/`DocenteCdcVM`/`AlunnoContestoVM` types (`src/application/context-engine/Cdu.ts`), `ReligioneScelta` enum.
- Produces: `RiepilogoClasseGeneratorStrategy` class, constructor `(templates: ITemplateEngine, tables: IDocumentTableFacade)`, registered under GENERATORE key `'RIEPILOGO_CLASSE'` in Task 8.

- [ ] **Step 1: Write the failing test**

Create `test/unit/application/riepilogo-classe-generator.test.ts`:

```ts
import { RiepilogoClasseGeneratorStrategy } from '../../../src/application/strategies/RiepilogoClasseGeneratorStrategy';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import type {
  IDocumentTableFacade,
  TablePlaceholder
} from '../../../src/infrastructure/facades/DocumentTableFacade';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

class FakeDocumentTableFacade implements IDocumentTableFacade {
  insertedAtMarker: Array<{
    fileId: string;
    marker: string;
    data: string[][];
    options?: { headerRow?: boolean };
  }> = [];
  removed: Array<{ fileId: string; marker: string }> = [];
  callOrder: string[] = [];
  findTablePlaceholders(): TablePlaceholder[] {
    return [];
  }
  removeText(fileId: string, marker: string): void {
    this.removed.push({ fileId, marker });
    this.callOrder.push(`remove:${marker}`);
  }
  appendTable(): void {
    throw new Error('not used');
  }
  insertTableAtMarker(
    fileId: string,
    marker: string,
    data: string[][],
    options?: { headerRow?: boolean }
  ): void {
    this.insertedAtMarker.push({ fileId, marker, data, options });
    this.callOrder.push(`insert:${marker}`);
  }
}

function fakeCdu(): Cdu {
  return {
    meta: {
      date: { oggi: { breve: '09/07/2026' } },
      parametriInput: { target: '5A', tipoTarget: 'classe', opzioni: {} }
    },
    focus: {
      classe: {
        anagrafica: { nome: '5A', anno: 5, sezione: 'A', indirizzo: { nome: '', nomeSintetico: '', sigla: '', tipo: '' } },
        flags: { isClassePrima: false, isTriennio: true, isPrimoBiennio: false, isTerminale: true, isArticolata: false },
        consiglioDiClasse: [
          {
            anagrafica: { nome: 'Mario', cognome: 'Rossi', email: 'rossi@x.it', genere: 'M', appellativo: 'Prof.' },
            materie: [{ sigla: 'MAT', nome: 'Matematica', colore: '#c0392b', specificita: null }],
            ruoli: { isCoordinatore: true, isTutorAsl: true, isTutorOrientamento: false, descrizione: [] },
            stato: { isSupplente: false, sostituisce: null },
            tipoArticolazione: null,
            isITP: false,
            flags: { isNotLast: true }
          },
          {
            anagrafica: { nome: 'Anna', cognome: 'Bianchi', email: 'bianchi@x.it', genere: 'F', appellativo: 'Prof.ssa' },
            materie: [
              { sigla: 'ITA', nome: 'Italiano', colore: '#2980b9', specificita: null },
              { sigla: 'STO', nome: 'Storia', colore: '#2980b9', specificita: null }
            ],
            ruoli: { isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false, descrizione: [] },
            stato: { isSupplente: false, sostituisce: null },
            tipoArticolazione: null,
            isITP: false,
            flags: { isNotLast: false }
          }
        ],
        rappresentanti: {
          studenti: [{ nomeCompleto: 'Verdi Anna', email: 'a1@x.it' }],
          genitori: [{ nomeCompleto: 'Verdi Paolo' }]
        },
        studenti: {
          listaCompleta: [
            {
              anagrafica: { nomeCompleto: 'Verdi Anna', email: 'a1@x.it' },
              status: { isBes: false, isRipetente: false, isRappresentante: true, religione: 'SI' },
              curriculum: {},
              didattica: {
                carenze: { hasCarenze: false, numero: 0, dettaglio: [] },
                piani: { hasPiani: false, hasBes: false, items: [] },
                pcto: { oreCumulate: 0 }
              }
            },
            {
              anagrafica: { nomeCompleto: 'Neri Luca', email: 'a2@x.it' },
              status: { isBes: false, isRipetente: false, isRappresentante: false, religione: 'ALT' },
              curriculum: {},
              didattica: {
                carenze: { hasCarenze: false, numero: 0, dettaglio: [] },
                piani: { hasPiani: true, hasBes: false, items: [{ tipo: 'PDP_DSA', isBes: false }] },
                pcto: { oreCumulate: 0 }
              }
            }
          ],
          statistiche: { totale: 2, conPianiDidattici: 1, conBes: 0, conDsa: 1, ripetenti: 0, rappresentanti: 1 }
        }
      }
    },
    tech: {
      entita: {},
      servizi: [],
      pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] }
    }
  } as unknown as Cdu;
}

describe('RiepilogoClasseGeneratorStrategy (item 4)', () => {
  test('inserts the student roster table at the marker, then removes the marker, then runs the generic pass', () => {
    const tables = new FakeDocumentTableFacade();
    const templates = new FakeTemplateEngine();
    const strategy = new RiepilogoClasseGeneratorStrategy(templates, tables);

    strategy.render('doc1', fakeCdu());

    expect(tables.insertedAtMarker).toEqual([
      {
        fileId: 'doc1',
        marker: '{{TABELLA_ALUNNI}}',
        data: [
          ['Nome', 'Religione', 'Email', 'Piani'],
          ['Verdi Anna', 'Sì', 'a1@x.it', '—'],
          ['Neri Luca', 'Alternativa', 'a2@x.it', 'PDP_DSA']
        ],
        options: { headerRow: true }
      }
    ]);
    expect(tables.removed).toEqual([{ fileId: 'doc1', marker: '{{TABELLA_ALUNNI}}' }]);
    expect(tables.callOrder).toEqual(['insert:{{TABELLA_ALUNNI}}', 'remove:{{TABELLA_ALUNNI}}']);
  });

  test('passes a flattened (docente, materia) bullet source and the no-ASL-tutoring list to the generic pass', () => {
    const tables = new FakeDocumentTableFacade();
    const templates = new FakeTemplateEngine();
    const strategy = new RiepilogoClasseGeneratorStrategy(templates, tables);

    strategy.render('doc1', fakeCdu());

    const context = templates.contextFor('doc1') as {
      riepilogoMaterieDocenti: Array<{ nomeMateria: string; nomeDocente: string }>;
      riepilogoDocentiSenzaTutoraggio: Array<{ nomeDocente: string }>;
      focus: unknown;
    };
    expect(context.riepilogoMaterieDocenti).toEqual([
      { nomeMateria: 'Matematica', nomeDocente: 'Mario Rossi' },
      { nomeMateria: 'Italiano', nomeDocente: 'Anna Bianchi' },
      { nomeMateria: 'Storia', nomeDocente: 'Anna Bianchi' }
    ]);
    expect(context.riepilogoDocentiSenzaTutoraggio).toEqual([{ nomeDocente: 'Anna Bianchi' }]);
    expect(context.focus).toBeDefined(); // the rest of the CDU still passes through
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/riepilogo-classe-generator.test.ts`
Expected: FAIL — module `../../../src/application/strategies/RiepilogoClasseGeneratorStrategy` doesn't exist yet.

- [ ] **Step 3: Implement the strategy**

Create `src/application/strategies/RiepilogoClasseGeneratorStrategy.ts`:

```ts
import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu, DocenteCdcVM, AlunnoContestoVM } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IDocumentTableFacade } from '../../infrastructure/facades/DocumentTableFacade';
import { ReligioneScelta } from '../../domain/value-objects/enums';

const MARKER_TABELLA_ALUNNI = '{{TABELLA_ALUNNI}}';

function religioneLabel(scelta: string): string {
  switch (scelta) {
    case ReligioneScelta.NO:
      return 'No';
    case ReligioneScelta.ALT:
      return 'Alternativa';
    default:
      return 'Sì';
  }
}

function buildRosterRows(studenti: AlunnoContestoVM[]): string[][] {
  const header = ['Nome', 'Religione', 'Email', 'Piani'];
  const rows = studenti.map((s) => [
    s.anagrafica.nomeCompleto,
    religioneLabel(s.status.religione),
    s.anagrafica.email,
    s.didattica.piani.items.map((p) => p.tipo).join(', ') || '—'
  ]);
  return [header, ...rows];
}

function buildMaterieDocenti(
  consiglio: DocenteCdcVM[]
): Array<{ nomeMateria: string; nomeDocente: string }> {
  return consiglio.flatMap((docente) =>
    docente.materie.map((materia) => ({
      nomeMateria: materia.nome,
      nomeDocente: `${docente.anagrafica.nome} ${docente.anagrafica.cognome}`
    }))
  );
}

function buildDocentiSenzaTutoraggio(consiglio: DocenteCdcVM[]): Array<{ nomeDocente: string }> {
  return consiglio
    .filter((docente) => !docente.ruoli.isTutorAsl)
    .map((docente) => ({ nomeDocente: `${docente.anagrafica.nome} ${docente.anagrafica.cognome}` }));
}

/**
 * RIEPILOGO_CLASSE generator (item 4): every field this document needs already
 * exists in the CLASSE_COMPLETA CDU (SPECS_ALDO/02_CDU_STRUTTURA.md §4.1) —
 * subjects+teacher, student roster, totals, no-ASL-tutoring teachers, and
 * both representative lists. Only the student table (needs a 2D array) and
 * the (docente, materia) bullet source (consiglioDiClasse groups per docente,
 * not per materia) aren't directly renderable by the generic `{{path}}`/
 * `{{#bullet_list:...}}` tags, so this strategy projects them onto a
 * document-scoped context object (never written back onto the shared `Cdu`)
 * before delegating to the same `templates.processDocument` call
 * `DocumentoGenericoGeneratorStrategy` makes for everything else.
 */
export class RiepilogoClasseGeneratorStrategy implements GeneratorStrategy {
  constructor(
    private readonly templates: ITemplateEngine,
    private readonly tables: IDocumentTableFacade
  ) {}

  render(fileId: string, cdu: Cdu): void {
    const studenti = cdu.focus.classe?.studenti?.listaCompleta ?? [];
    const consiglio = cdu.focus.classe?.consiglioDiClasse ?? [];

    this.tables.insertTableAtMarker(fileId, MARKER_TABELLA_ALUNNI, buildRosterRows(studenti), {
      headerRow: true
    });
    this.tables.removeText(fileId, MARKER_TABELLA_ALUNNI);

    const context = {
      ...(cdu as unknown as Record<string, unknown>),
      riepilogoMaterieDocenti: buildMaterieDocenti(consiglio),
      riepilogoDocentiSenzaTutoraggio: buildDocentiSenzaTutoraggio(consiglio)
    };
    this.templates.processDocument(fileId, context);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/riepilogo-classe-generator.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/application/strategies/RiepilogoClasseGeneratorStrategy.ts test/unit/application/riepilogo-classe-generator.test.ts
git commit -m "$(cat <<'EOF'
feat: add RiepilogoClasseGeneratorStrategy for the new RIEPILOGO_CLASSE document

Builds the student roster table and the flattened (docente, materia)
bullet source from the CDU (already fully populated by CLASSE_COMPLETA —
no new provider/recipe needed), then delegates to the generic
{{...}}/{{#bullet_list:...}} substitution for everything else.
EOF
)"
```

---

## Task 8: Bootstrap wiring for `RIEPILOGO_CLASSE`

**Files:**
- Modify: `src/config/Bootstrap.ts`
- Test: `test/unit/config/bootstrap.test.ts`

**Interfaces:**
- Consumes: `RiepilogoClasseGeneratorStrategy` (Task 7), `DocumentTableFacade` (already imported in `Bootstrap.ts` for `DOCUMENTO_CON_TABELLE_IMPORTATE`).
- Produces: registry key `'RIEPILOGO_CLASSE'` in the `strategyRegistry`, gated only on `deps.documents !== undefined` (unlike `DOCUMENTO_CON_TABELLE_IMPORTATE`, this strategy never reads a Sheet, so it doesn't need `deps.spreadsheets`).

- [ ] **Step 1: Write the failing tests**

In `test/unit/config/bootstrap.test.ts`, add after the existing `test('registers DOCUMENTO_CON_TABELLE_IMPORTATE when both deps.spreadsheets and deps.documents are provided', ...)` block (around line 245):

```ts
  test('does not register RIEPILOGO_CLASSE when deps.documents is undefined, even with deps.spreadsheets', () => {
    const c = buildAldoContainer({ ...baseDeps(), spreadsheets: {} as never });
    const registry = c.get<Map<string, unknown>>('strategyRegistry');
    expect(registry.has('RIEPILOGO_CLASSE')).toBe(false);
  });

  test('registers RIEPILOGO_CLASSE when deps.documents is provided, even without deps.spreadsheets', () => {
    const c = buildAldoContainer({ ...baseDeps(), documents: {} as never });
    const registry = c.get<Map<string, unknown>>('strategyRegistry');
    expect(registry.has('RIEPILOGO_CLASSE')).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts -t "RIEPILOGO_CLASSE"`
Expected: FAIL — `RIEPILOGO_CLASSE` is never registered yet, so both `.has(...)` calls return `false` (first test fails because it expects `false` and gets `false`... actually passes trivially; the meaningful failure is the second test expecting `true`).

- [ ] **Step 3: Wire the registry**

In `src/config/Bootstrap.ts`, add the import next to the other strategy imports:

```ts
import { RiepilogoClasseGeneratorStrategy } from '../application/strategies/RiepilogoClasseGeneratorStrategy';
```

In the `strategyRegistry` factory, add a new top-level `if` block (independent of the `deps.spreadsheets !== undefined` block, since this strategy needs only `deps.documents`) — insert right after the closing `}` of the existing `if (deps.spreadsheets !== undefined) { ... }` block and before `return registry;`:

```ts
    if (deps.documents !== undefined) {
      registry.set(
        'RIEPILOGO_CLASSE',
        new RiepilogoClasseGeneratorStrategy(deps.templates, new DocumentTableFacade(deps.documents))
      );
    }
    return registry;
```

(remove the old standalone `return registry;` that this replaces).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts`
Expected: PASS, full file.

Run: `npm run typecheck && npm test`
Expected: no errors, full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/Bootstrap.ts test/unit/config/bootstrap.test.ts
git commit -m "$(cat <<'EOF'
feat: register RIEPILOGO_CLASSE generator strategy in Bootstrap

Gated on deps.documents alone (unlike DOCUMENTO_CON_TABELLE_IMPORTATE,
this strategy never reads a Sheet, so it doesn't also need deps.spreadsheets).
EOF
)"
```

---

## Task 9: E2E CONF_DOC + Drive template + scenario 8

**Files:**
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts` (new export, `seedConfDoc`)
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**
- Consumes: `RiepilogoClasseGeneratorStrategy`'s registry key `'RIEPILOGO_CLASSE'` (Task 8, referenced only as the string `GENERATORE` value — no direct import needed here).
- Produces: `CONF_DOC_RIEPILOGO` exported const (`src/onlinetests/E2eSampleDatabaseBuilder.ts`); `E2eTemplateIds.riepilogo: string` (new required field — every constructor of this type, i.e. only `E2eTemplateProvisioner.provision`, must set it).

- [ ] **Step 1: Write the failing tests**

In `test/unit/onlinetests/e2e-template-provisioner.test.ts`, update the counts in `test('creates all 7 templates ...', ...)`:

```ts
test('creates all 8 templates (1 doc verbale + 1 sheet condotta + 1 doc riepilogo + 5 doc piani) when none exist yet', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(created).toHaveLength(8);
  expect(created.filter((c) => c.startsWith('sheet:'))).toHaveLength(1);
  expect(created.filter((c) => c.startsWith('doc:'))).toHaveLength(7);
  expect(ids.verbale).toMatch(/^doc_/);
  expect(ids.condotta).toMatch(/^sheet_/);
  expect(ids.riepilogo).toMatch(/^doc_/);
  for (const tipo of TIPI_PIANO) {
    expect(ids.piani[tipo]).toMatch(/^doc_/);
  }
});
```

Update `test('reuses an existing template by name instead of recreating it', ...)`'s trailing count:

```ts
  expect(created).toHaveLength(7); // condotta + riepilogo + 5 piani still created
```

Add a new block inside `test('authors real CDU-path placeholder content into newly-created templates, not blank artifacts', ...)`, after the `condottaUpdates` assertions and before the `for (const tipo of TIPI_PIANO)` loop:

```ts
  const riepilogoParagraphs = docContent[ids.riepilogo] ?? [];
  expect(riepilogoParagraphs.length).toBeGreaterThan(0);
  const riepilogoText = riepilogoParagraphs.join('\n');
  expect(riepilogoText).toContain('{{TABELLA_ALUNNI}}');
  expect(riepilogoText).toContain('{{#bullet_list:riepilogoMaterieDocenti}}');
  expect(riepilogoText).toContain('{{#bullet_list:riepilogoDocentiSenzaTutoraggio}}');
  expect(riepilogoText).toContain('{{#bullet_list:focus.classe.rappresentanti.studenti}}');
  expect(riepilogoText).toContain('{{#bullet_list:focus.classe.rappresentanti.genitori}}');
  expect(riepilogoText).toContain('{{focus.classe.studenti.statistiche.totale}}');
```

In `test/unit/onlinetests/e2e-sample-database-builder.test.ts`, replace the whole `test('seeds 7 CONF_DOC rows ...', ...)` block (currently lines 148-161) with:

```ts
test('seeds 8 CONF_DOC rows (1 verbale + 1 condotta + 1 riepilogo + 5 piani) each pointing at its provisioned template', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confDoc = sample.rows[TABLE.CONF_DOC]!;
  expect(confDoc).toHaveLength(8);
  const verbale = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'VERBALE_CDC')!;
  expect(JSON.parse(verbale[COL_CONF_DOC.MODELLI] as string)).toEqual({ templateId: 'tmpl_verbale' });
  const condotta = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'FOGLIO_GENERICO')!;
  expect(JSON.parse(condotta[COL_CONF_DOC.MODELLI] as string)).toEqual({ templateId: 'tmpl_condotta' });
  const riepilogo = confDoc.find((c) => c[COL_CONF_DOC.ID] === 'E2E_RIEPILOGO')!;
  expect(riepilogo[COL_CONF_DOC.GENERATORE]).toBe('RIEPILOGO_CLASSE');
  expect(JSON.parse(riepilogo[COL_CONF_DOC.MODELLI] as string)).toEqual({ templateId: 'tmpl_riepilogo' });
  const piani = confDoc.filter((c) => c[COL_CONF_DOC.GENERATORE] === 'DOC_PERSONALIZZATO');
  expect(piani).toHaveLength(5);
});
```

Add `riepilogo: 'tmpl_riepilogo'` to the shared `TEMPLATE_IDS` fixture object at the top of the file (next to `condotta: 'tmpl_condotta'`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: FAIL — `TEMPLATE_IDS.riepilogo` doesn't satisfy `E2eTemplateIds` yet (TS error) and no `RIEPILOGO` doc/CONF_DOC row exists.

- [ ] **Step 3: Implement**

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, add to `E2eTemplateIds` (currently lines 110-114):

```ts
export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  riepilogo: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}
```

Add a new exported const near `CONF_DOC_CONDOTTA`:

```ts
export const CONF_DOC_RIEPILOGO = 'E2E_RIEPILOGO';
```

In `seedConfDoc` (lines 548-601), add a new `sample.appendRow(TABLE.CONF_DOC, {...})` call between the `CONF_DOC_CONDOTTA` block and the `for (const tipo of TIPI_PIANO)` loop:

```ts
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_RIEPILOGO,
      [COL_CONF_DOC.TIPO]: 'RIEPILOGO_CLASSE',
      [COL_CONF_DOC.GENERATORE]: 'RIEPILOGO_CLASSE',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.riepilogo }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Riepilogo_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC'
    });
```

In `src/onlinetests/E2eTemplateProvisioner.ts`, add a new name constant next to `NAME_CONDOTTA`:

```ts
const NAME_RIEPILOGO = 'E2E Riepilogo Template';
```

Add a new paragraph constant next to `VERBALE_PARAGRAPHS`:

```ts
const RIEPILOGO_PARAGRAPHS = [
  'Riepilogo Classe {{focus.classe.anagrafica.nome}}',
  'Materie e docenti:',
  '{{#bullet_list:riepilogoMaterieDocenti}}{{nomeMateria}} — {{nomeDocente}}{{/bullet_list}}',
  'Elenco studenti:',
  '{{TABELLA_ALUNNI}}',
  'Numero totale studenti: {{focus.classe.studenti.statistiche.totale}}',
  'Docenti senza tutoraggio ASL:',
  '{{#bullet_list:riepilogoDocentiSenzaTutoraggio}}{{nomeDocente}}{{/bullet_list}}',
  'Rappresentanti degli studenti:',
  '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}}{{/bullet_list}}',
  'Rappresentanti dei genitori:',
  '{{#bullet_list:focus.classe.rappresentanti.genitori}}{{nomeCompleto}}{{/bullet_list}}'
];
```

Update `provision`:

```ts
  provision(folderId: string): E2eTemplateIds {
    const verbale = this.findOrCreateDoc(folderId, NAME_VERBALE, VERBALE_PARAGRAPHS);
    const condotta = this.findOrCreateSheet(folderId, NAME_CONDOTTA, condottaUpdates());
    const riepilogo = this.findOrCreateDoc(folderId, NAME_RIEPILOGO, RIEPILOGO_PARAGRAPHS);
    const piani = {} as E2eTemplateIds['piani'];
    for (const tipo of TIPI_PIANO) {
      piani[tipo] = this.findOrCreateDoc(folderId, namePiano(tipo), pianoParagraphs(tipo));
    }
    return { verbale, condotta, riepilogo, piani };
  }
```

In `src/onlinetests/checks/e2eScenarioChecks.ts`, add `CONF_DOC_RIEPILOGO` to the import (alongside `CONF_DOC_VERBALE, CONF_DOC_CONDOTTA`):

```ts
import {
  ALL_CLASSI_E2E,
  TIPI_PIANO,
  CONF_DOC_VERBALE,
  CONF_DOC_CONDOTTA,
  CONF_DOC_RIEPILOGO,
  confDocPiano,
  CONF_MAIL_VERBALE,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_CARENZA,
  CONF_MAIL_PIANI,
  PIANO_STUDENTE,
  type E2eSampleDatabase
} from '../E2eSampleDatabaseBuilder';
```

Add a new scenario after `E2E scenario 2` and before `E2E scenario 3` (renumbering is not required — scenario numbers are just human-readable labels, not an ordered contract — so add it as its own step without shifting the existing 7):

```ts
  runner.add('E2E scenario 8: genera riepilogo classe (tutte le classi)', sample.sampleSpreadsheetUrl, () => {
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_RIEPILOGO);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione riepilogo per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
    }
  });
```

(insert this block right after the `E2E scenario 2` block, before `E2E scenario 3`, keeping every class-level document-generation scenario grouped together ahead of the email-sending scenarios).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: PASS, all three files.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS, full suite.

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/E2eSampleDatabaseBuilder.ts src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "$(cat <<'EOF'
feat: provision RIEPILOGO_CLASSE e2e template/CONF_DOC and add scenario 8

Wires the new document type into the e2e mock DB the same way as the
existing VERBALE/CONDOTTA pair: a real Drive template authored with the
Mustache-style bullet/table markers the new GeneratorStrategy expects, a
CONF_DOC row pointing at it, and a scenario 8 check generating it for
every ALL_CLASSI_E2E class.
EOF
)"
```

---

## Verification checklist (spec coverage)

- Item 1 (Drive links): Task 1.
- Item 2 (deficiency box styling): Task 2.
- Item 3 (mock-data reps/religion): Task 3.
- Item 4 (RIEPILOGO_CLASSE): Tasks 7, 8, 9 (strategy, wiring, e2e data/scenario).
- Item 5 (LOG_MAIL.TESTO): Tasks 4, 5, 6 (library method, vendor refresh, ALDO wiring).

After Task 9, run `npm run lint` once across the whole tree (not per-task, since lint config applies repo-wide) to catch any stray issue the individual `npm test`/`typecheck` runs didn't:

```bash
npm run lint
```

Expected: no errors. Fix inline and re-run if it reports anything, then stop and hand off — no further tasks remain.
