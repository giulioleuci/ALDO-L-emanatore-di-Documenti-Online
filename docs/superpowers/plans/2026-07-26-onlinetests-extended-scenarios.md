# Four New Online E2E Case Studies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend ALDO's online e2e suite with 4 new scenarios (ASL/PCTO import, complex Doc placeholders, real sheet-column protection, coordinator email with a real file attachment + a real folder link) and fix the two production gaps discovered while designing scenario D (`LOG_MAIL.ALLEGATI.folders` hardcoded empty; the `cartelle` email box's real-folder data path dead-wired).

**Architecture:** Two independent groups of changes. Group 1 (Tasks 1-5) touches production application code: `LogCartella` gets a `getLink()` accessor, `boxes.ts`'s box renderer gains an opt-in real-`LOG_FOLD`-folder data source via `AggregatoreDati`, `RenderBoxesStep`/`LogEmailStep` thread the resolved folder IDs through to the `LOG_MAIL` audit record, and `Bootstrap.ts` exposes the raw `SpreadsheetService` for the online test suite to call `getProtectedRanges`. Group 2 (Tasks 6-13) is pure test-suite content: new fixture rows/templates in `E2eSampleDatabaseBuilder`/`E2eTemplateProvisioner`, and new `runner.add(...)` checks in `checks/e2eScenarioChecks.ts`, one pair of tasks per scenario (fixture, then check).

**Tech Stack:** TypeScript, Jest (`ts-jest`), GAS V8 runtime via `GasLibraryFactory` (`WorkspaceTemplateEngine`, `GasDataImporter`, `GoogleApiWrapper`'s `SpreadsheetService`), existing ALDO Clean Architecture layering.

## Global Constraints

- Every production change routes native GAS/Sheets/Drive/Gmail access through existing `GasLibraryFactory`-backed facades/services — no new direct native-global usage (ESLint `no-restricted-globals` enforces this).
- No changes inside `GasLibraryFactory/` — every capability used already exists there (confirmed in the design spec).
- TDD: every production-code task writes a failing unit test first, using the existing `FakeDatabase`/`fixtureTables()`/`FakeTemplateEngine` test doubles already used by `test/unit/application/email-boxes.test.ts` and `test/unit/application/pipelines/email-steps.test.ts`.
- Fixture/scenario tasks (Group 2) are exercised by the existing offline unit tests (`test/unit/onlinetests/*.test.ts`), which fake `IArtifactFactory`/`ISampleSpreadsheetFactory`/`ServiceContainer` — the real online run (`npm run build:online` → `runE2eScenarios`) is not executed by this plan's own steps (it requires a live GAS/clasp session), but every fixture/check must typecheck and pass its offline unit test.
- Run `npm run typecheck && npm test` after every task; both must be clean before moving on.
- Design spec: `docs/superpowers/specs/2026-07-26-onlinetests-extended-scenarios-design.md`.

---

## Task 1: `LogCartella.getLink()`

**Files:**
- Modify: `src/domain/entities/LogCartella.ts`
- Test: `test/unit/domain/entities/log-cartella.test.ts` (create if it doesn't already exist — check first)

**Interfaces:**
- Produces: `LogCartella.getLink(): string` — reads `COL_LOG_FOLD.LINK` off the entity's raw data, empty string when absent. Consumed by Task 2.

- [ ] **Step 1: Check for an existing test file**

Run: `ls test/unit/domain/entities/log-cartella.test.ts 2>/dev/null || echo "does not exist"`

- [ ] **Step 2: Write the failing test** (create the file if Step 1 said "does not exist"; otherwise append to it)

```typescript
import { LogCartella } from '../../../../src/domain/entities/LogCartella';
import { COL_LOG_FOLD } from '../../../../src/config/schema';

test('getLink returns COL_LOG_FOLD.LINK', () => {
  const f = LogCartella.fromData({
    [COL_LOG_FOLD.ID]: 'folder1',
    [COL_LOG_FOLD.LINK]: 'https://drive.google.com/drive/folders/folder1'
  });
  expect(f.getLink()).toBe('https://drive.google.com/drive/folders/folder1');
});

test('getLink returns empty string when LINK is absent', () => {
  const f = LogCartella.fromData({ [COL_LOG_FOLD.ID]: 'folder1' });
  expect(f.getLink()).toBe('');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities/log-cartella.test.ts`
Expected: FAIL — `getLink is not a function`

- [ ] **Step 4: Implement `getLink()`**

In `src/domain/entities/LogCartella.ts`, add the method to the class (after `containsClasse`):

```typescript
  getLink(): string {
    return typeof this.raw[COL_LOG_FOLD.LINK] === 'string'
      ? (this.raw[COL_LOG_FOLD.LINK] as string)
      : '';
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities/log-cartella.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/entities/LogCartella.ts test/unit/domain/entities/log-cartella.test.ts
git commit -m "feat(domain): add LogCartella.getLink()"
```

---

## Task 2: real `LOG_FOLD` folders for the `cartelle` email box

**Files:**
- Modify: `src/application/email/boxes.ts`
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**
- Consumes: `LogCartella.getLink()` (Task 1); `AggregatoreDati.perMetodo(metodo: string, params: {classeId?: string}): unknown[] | null` (existing, `src/application/services/AggregatoreDati.ts`).
- Produces: `renderBoxes(composer, confMail, cdu, materie, templates, aggregatoreDati?, classeId?): { ordered: string[]; boxes: Record<string, RenderedBox>; folderIds: string[] }` — the two new trailing params are optional, `folderIds` is a new field on the return type (empty array unless the `cartelle` box opts in with real folders). Consumed by Task 3.

- [ ] **Step 1: Write the failing test** — add to `test/unit/application/email-boxes.test.ts`, after the last existing `test(...)` block

```typescript
import { AggregatoreDati } from '../../../src/application/services/AggregatoreDati';

test('cartelle box with DATI_SORGENTE.metodo=cartellePerClasse renders real LOG_FOLD folders, not CDU-embedded items', () => {
  const tables = fixtureTables();
  (tables['LOG_FOLD'] as Record<string, unknown>[]) = [
    {
      ID: 'folder1',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 5A',
      PATH: '_ALDO_E2E_OUTPUT/5A',
      LINK: 'https://drive.google.com/drive/folders/folder1',
      CLASSI: '5A',
      UTENTI: '',
      MATERIA: ''
    }
  ];
  const db = new FakeDatabase(tables);
  const aggregatoreDati = new AggregatoreDati(db);
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);

  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse' } }]),
    cduRecord(),
    materie(),
    templates,
    aggregatoreDati,
    '5A'
  );

  expect(out.boxes['cartelle']!.html).toContain('https://drive.google.com/drive/folders/folder1');
  expect(out.boxes['cartelle']!.html).toContain('Verbali 5A');
  expect(out.folderIds).toEqual(['folder1']);
});

test('cartelle box without DATI_SORGENTE falls back to CDU-embedded items and reports empty folderIds', () => {
  const out = render([{ TIPO_BOX: 'cartelle' }]);
  expect(out.folderIds).toEqual([]);
});
```

`cduRecord()`'s `focus.classe` already exists in the shared fixture (used by other tests in the file) — no fixture change needed there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "cartellePerClasse"`
Expected: FAIL — `out.folderIds` is `undefined`, and the real-folder test's `html` doesn't contain the LOG_FOLD link (still sourced from the empty CDU-embedded `items`).

- [ ] **Step 3: Implement the wiring** in `src/application/email/boxes.ts`

Add the import (top of file, alongside the other type imports):

```typescript
import type { AggregatoreDati } from '../services/AggregatoreDati';
import type { LogCartella } from '../../domain/entities/LogCartella';
```

Change `aggregaDati`'s signature and its `cartelle` field (the function starts at the line with `function aggregaDati(`):

```typescript
function aggregaDati(
  cdu: Record<string, unknown>,
  materie: IMateriaRepository,
  documentiFiltro: { tipo?: string; stato?: string } = {},
  realCartelle: LogCartella[] | null = null
): Record<string, unknown> {
```

Inside the function, replace the existing `cartelle: { items: items.filter((i) => i.tipo === 'CARTELLA'), storicoRef: undefined },` line with:

```typescript
    cartelle: {
      items:
        realCartelle !== null
          ? realCartelle.map((f) => ({
              nome: f.nome,
              link: f.getLink(),
              tipo: 'CARTELLA',
              idGen: '',
              stato: '',
              dataCreazione: ''
            }))
          : items.filter((i) => i.tipo === 'CARTELLA'),
      storicoRef: undefined
    },
```

Change `renderBoxes`'s signature (the function starts at `export function renderBoxes(`):

```typescript
export function renderBoxes(
  composer: ContentComposer,
  confMail: ConfigurazioneEmail,
  cdu: Record<string, unknown>,
  materie: IMateriaRepository,
  templates: ITemplateEngine,
  aggregatoreDati?: AggregatoreDati,
  classeId?: string
): { ordered: string[]; boxes: Record<string, RenderedBox>; folderIds: string[] } {
```

Inside `renderBoxes`, right after the existing `documentiCfg`/`documentiFiltro` block (which ends with `if (filtroStato !== '') documentiFiltro.stato = filtroStato;`), add:

```typescript
  const cartelleCfg = known.find((c) => str(c['TIPO_BOX']) === 'cartelle');
  const cartelleMetodo = str(
    (cartelleCfg?.['DATI_SORGENTE'] as { metodo?: string } | undefined)?.metodo
  );
  const realCartelle: LogCartella[] | null =
    cartelleMetodo === 'cartellePerClasse' && aggregatoreDati !== undefined && classeId !== undefined
      ? ((aggregatoreDati.perMetodo('cartellePerClasse', { classeId }) as LogCartella[] | null) ?? [])
      : null;
  const folderIds = (realCartelle ?? [])
    .map((f) => f.id)
    .filter((id): id is string => id !== null);
```

Change the `context` build to pass `realCartelle` through:

```typescript
  const context: Record<string, unknown> = {
    ...cdu,
    boxdata: aggregaDati(cdu, materie, documentiFiltro, realCartelle)
  };
```

And change the function's final `return` statement to include `folderIds`:

```typescript
  return { ordered, boxes, folderIds };
```

(The early-return for `known.length === 0` also needs the new field: change `return { ordered: [], boxes: {} };` to `return { ordered: [], boxes: {}, folderIds: [] };`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: PASS (all tests in the file, including every pre-existing one — the two new params are optional and appended last, so no existing 5-arg call site breaks)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (existing 5-arg `renderBoxes(...)` call sites in `test/unit/application/email-boxes.test.ts` still satisfy the signature since the new params are optional)

- [ ] **Step 6: Commit**

```bash
git add src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "feat(email): wire cartelle box to real LOG_FOLD folders via AggregatoreDati opt-in"
```

---

## Task 3: `RenderBoxesStep` threads `AggregatoreDati` and `classeId`, emits `cartelleFolderIds`

**Files:**
- Modify: `src/application/pipelines/emailSteps.ts`
- Modify: `src/application/services/EmailNotificationService.ts`
- Modify: `src/config/Bootstrap.ts` (no change needed here — `aggregatoreDati` is already registered; `EmailNotificationService.create()` builds its own default, matching how it already builds `cattedraResolver`/`materie` internally rather than taking them from the container)
- Test: `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**
- Consumes: `renderBoxes(...)`'s new `folderIds` return field (Task 2); `getClasseEntity(cdu: Cdu): Classe` (existing, `../context-engine/techEntities`, already imported in `emailSteps.ts`); `Classe.id: string | null` (existing, `AldoEntity` base).
- Produces: pipeline context key `cartelleFolderIds: string[]`, set by `RenderBoxesStep`, read by `LogEmailStep` (Task 4).

- [ ] **Step 1: Write the failing test** — add to `test/unit/application/pipelines/email-steps.test.ts`, in the "Steps 3-4: RenderBoxesStep + ComposeEmailStep" section

```typescript
test('RenderBoxesStep resolves real LOG_FOLD folders and sets cartelleFolderIds when BOX_CFG opts in (docente/classe target)', () => {
  const tables = fixtureTables();
  (tables['LOG_FOLD'] as Row[]) = [
    {
      ID: 'folder1',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 5A',
      PATH: '_ALDO_E2E_OUTPUT/5A',
      LINK: 'https://drive.google.com/drive/folders/folder1',
      CLASSI: '5A',
      UTENTI: '',
      MATERIA: ''
    }
  ];
  const w = wire(
    { BOX_CFG: '[{"TIPO_BOX":"cartelle","DATI_SORGENTE":{"metodo":"cartellePerClasse"}}]' },
    docenteTarget(),
    tables
  );
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(
    logger,
    new MateriaRepository(w.db),
    w.templates,
    new AggregatoreDati(w.db)
  ).execute(w.ctx);

  expect(w.ctx.get<string[]>('cartelleFolderIds')).toEqual(['folder1']);
});

test('RenderBoxesStep sets cartelleFolderIds to [] when no cartellePerClasse opt-in is configured', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);

  expect(w.ctx.get<string[]>('cartelleFolderIds')).toEqual([]);
});
```

Add the import at the top of the file: `import { AggregatoreDati } from '../../../../src/application/services/AggregatoreDati';`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "cartelleFolderIds"`
Expected: FAIL — `RenderBoxesStep` constructor doesn't accept a 4th argument (TS error) and `cartelleFolderIds` is never set.

- [ ] **Step 3: Implement in `src/application/pipelines/emailSteps.ts`**

Add the import: `import type { AggregatoreDati } from '../services/AggregatoreDati';`

Change the `RenderBoxesStep` class:

```typescript
export class RenderBoxesStep extends Step {
  private readonly composer: ContentComposer;
  constructor(
    logger: LoggerService,
    private readonly materie: IMateriaRepository,
    private readonly templates: ITemplateEngine,
    private readonly aggregatoreDati?: AggregatoreDati
  ) {
    super('RenderBoxes', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['cdu', 'confMail']
    });
    this.composer = createBoxComposer(logger, templates);
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const built = cdu(ctx);
    const classeId =
      built.focus.classe !== undefined ? (getClasseEntity(built).id ?? undefined) : undefined;
    const result = renderBoxes(
      this.composer,
      confMail(ctx),
      cduRecord(ctx),
      this.materie,
      this.templates,
      this.aggregatoreDati,
      classeId
    );
    built.render = { boxes: result.boxes, body: { htmlCompleto: '', htmlSoloContenuto: '' } };
    const oggetto = this.templates.processString(confMail(ctx).oggetto, cduRecord(ctx));
    if (built.destinatario !== undefined)
      built.destinatario.comunicazione.oggettoCalcolato = oggetto;
    this.setResult(ctx, 'boxHtmlOrdered', result.ordered);
    this.setResult(ctx, 'cartelleFolderIds', result.folderIds);
    this.setResult(ctx, 'shouldSend', ctx.get('shouldSend') === true && result.ordered.length > 0);
    this.setResult(ctx, 'oggettoRisolto', oggetto);
  }
}
```

- [ ] **Step 4: Thread `aggregatoreDati` through `EmailNotificationService`**

In `src/application/services/EmailNotificationService.ts`:
- Add the import: `import { AggregatoreDati } from './AggregatoreDati';`
- Add `aggregatoreDati: AggregatoreDati;` to the `EmailNotificationDeps` interface, right after `materie: IMateriaRepository;`
- In `EmailNotificationService.create()`'s `base` object, add `aggregatoreDati: new AggregatoreDati(db),` right after `materie: new MateriaRepository(db),`
- In `buildPipeline()`, change the `RenderBoxesStep` line to: `.addStep(new RenderBoxesStep(this.logger, d.materie, d.templates, d.aggregatoreDati))`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (all tests, including every pre-existing 3-arg `RenderBoxesStep(...)` call — the 4th param is optional)

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add src/application/pipelines/emailSteps.ts src/application/services/EmailNotificationService.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "feat(email): thread AggregatoreDati through RenderBoxesStep, emit cartelleFolderIds"
```

---

## Task 4: `LogEmailStep` populates `LOG_MAIL.ALLEGATI.folders`

**Files:**
- Modify: `src/application/pipelines/emailSteps.ts`
- Test: `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**
- Consumes: pipeline context key `cartelleFolderIds: string[]` (Task 3).
- Produces: `LOG_MAIL.ALLEGATI` now `{ docs: string[]; folders: string[] }` with real data in both fields (was `folders: []` unconditionally).

- [ ] **Step 1: Write the failing test** — add to the "Steps 7-8: LogEmailStep + PostProcessEmailStep" section of `test/unit/application/pipelines/email-steps.test.ts`

```typescript
test('LogEmailStep records cartelleFolderIds in LOG_MAIL.ALLEGATI.folders (11 §9)', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  w.ctx.set('sentTo', ['genitore1@x.it']);
  w.ctx.set('sendErrors', []);
  w.ctx.set('corpoHtml', '<p>x</p>');
  w.ctx.set('cartelleFolderIds', ['folder1', 'folder2']);
  const logMail = new LogEmailRepository(w.db);
  new LogEmailStep(logger, logMail).execute(w.ctx);

  const row = w.db.table('LOG_MAIL').findAll()[0]!;
  const allegati = JSON.parse(String(row['ALLEGATI']));
  expect(allegati.folders).toEqual(['folder1', 'folder2']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "cartelleFolderIds in LOG_MAIL"`
Expected: FAIL — `allegati.folders` is `[]`

- [ ] **Step 3: Implement** — in `src/application/pipelines/emailSteps.ts`, `LogEmailStep._executeLogic`, change:

```typescript
    const allegatiInfo = { docs: ctx.get<string[]>('allegatiIds') ?? [], folders: [] };
```

to:

```typescript
    const allegatiInfo = {
      docs: ctx.get<string[]>('allegatiIds') ?? [],
      folders: ctx.get<string[]>('cartelleFolderIds') ?? []
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (all tests — the pre-existing `'LogEmailStep defaults errors/allegatiIds to [] when they were never set'` test still passes since `cartelleFolderIds` also defaults to `[]` via the same `?? []`)

- [ ] **Step 5: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/application/pipelines/emailSteps.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "fix(email): populate LOG_MAIL.ALLEGATI.folders instead of hardcoding []"
```

---

## Task 5: expose `SpreadsheetService` via the DI container as `'spreadsheets'`

**Files:**
- Modify: `src/config/Bootstrap.ts`
- Test: `test/unit/config/bootstrap.test.ts` (check exact filename first — it may be `test/unit/config/*.test.ts` under a different name)

**Interfaces:**
- Produces: `container.get<SpreadsheetService>('spreadsheets')` — available whenever `buildAldoContainer` was called with `deps.spreadsheets` defined (always true for the real GAS composition root; conditionally true in tests). Consumed by Task 11 (Scenario C's `getProtectedRanges` check).

- [ ] **Step 1: Find the existing Bootstrap test file and its pattern for asserting a conditionally-registered service**

Run: `grep -rln "SHEET_CON_MATERIE" test/unit/config/`

- [ ] **Step 2: Write the failing test** — add to whichever file Step 1 found (it already builds a container with `spreadsheets` set, to test the `SHEET_CON_MATERIE` strategy registration)

```typescript
test("registers 'spreadsheets' in the container when deps.spreadsheets is provided", () => {
  const container = buildAldoContainer({ ...baseDeps(), spreadsheets: fakeSpreadsheetService() });
  expect(container.get('spreadsheets')).toBeDefined();
});
```

(Use whatever the file's existing helper functions for `baseDeps()`/a fake `SpreadsheetService` are named — match the file's existing style exactly rather than inventing new helpers.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/config/<filename>.test.ts -t "registers 'spreadsheets'"`
Expected: FAIL — `container.get('spreadsheets')` throws "service not registered"

- [ ] **Step 4: Implement** — in `src/config/Bootstrap.ts`, inside the existing `if (deps.spreadsheets !== undefined) { ... }` block in `buildAldoContainer` (the block that registers `SHEET_CON_MATERIE`/`SHEET_CON_MATERIE_E_PERMESSI`), add as its first line:

```typescript
      c.register('spreadsheets', () => deps.spreadsheets!);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/config/<filename>.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add src/config/Bootstrap.ts test/unit/config/<filename>.test.ts
git commit -m "feat(config): expose SpreadsheetService via the container as 'spreadsheets'"
```

---

## Task 6: Scenario A fixture — ASL/PCTO import source sheet + `CONF_IMP` row

**Files:**
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**
- Produces: `E2eTemplateIds.aslImportSheet: string` (new field); `E2eSampleDatabaseBuilder`, exported constant `CONF_IMP_ASL = 'E2E_IMPORT_ASL'`; a `CONF_IMP` row targeting `TABLE.ASL`. Consumed by Task 7.

- [ ] **Step 1: Write the failing test for the provisioner** — add to `test/unit/onlinetests/e2e-template-provisioner.test.ts`

```typescript
test('provisions the ASL import source sheet with 3 mapped columns and only 3rd-year students', () => {
  const { artifacts, sheetContent, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.aslImportSheet).toMatch(/^sheet_/);
  expect(created).toContain('sheet:E2E ASL Import Source');
  const updates = sheetContent[ids.aslImportSheet] ?? [];
  const text = JSON.stringify(updates);
  expect(text).toContain('STUDENTE');
  expect(text).toContain('ANNO');
  expect(text).toContain('ORE');
  expect(text).toContain('e2ealunno43@onlinetest.aldo.local');
  expect(text).toContain('2026-2027');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts -t "ASL import source"`
Expected: FAIL — `ids.aslImportSheet` is `undefined`

- [ ] **Step 3: Implement the provisioning method** in `src/onlinetests/E2eTemplateProvisioner.ts`

Add near the top, alongside the other name constants:

```typescript
const NAME_ASL_IMPORT = 'E2E ASL Import Source';
```

Add a data function alongside `condottaUpdates()`. This uses 4 real 3rd-year students (2 from `CLASSE_C`/`3C`, 2 from `CLASSE_C_PARTNER`/`3C-LC`) — `e2eAlunnoEmail(43)`/`(44)` are 3C students (positions 3-4 of that class's 8; `(41)`/`(42)` are already reserved by `RIPETENTE_3C`/`PDP_BES_3C`), `e2eAlunnoEmail(51)`/`(52)` are 3C-LC students (positions 3-4 of that class's 12, which starts at counter 49):

```typescript
/** School year matching E2eSampleDatabaseBuilder's seedMaster ANNO_SCOLASTICO (3rd-year students only, design spec "fixture-only scoping"). */
const ASL_IMPORT_ANNO = '2026-2027';
const ASL_IMPORT_ROWS: Array<[string, number]> = [
  [e2eAlunnoEmail(43), 40],
  [e2eAlunnoEmail(44), 55],
  [e2eAlunnoEmail(51), 60],
  [e2eAlunnoEmail(52), 35]
];

function aslImportUpdates(): SheetValueUpdate[] {
  const updates: SheetValueUpdate[] = [
    { range: 'A1:C1', values: [['STUDENTE', 'ANNO', 'ORE']] }
  ];
  ASL_IMPORT_ROWS.forEach(([email, ore], i) => {
    updates.push({ range: `A${2 + i}:C${2 + i}`, values: [[email, ASL_IMPORT_ANNO, ore]] });
  });
  return updates;
}
```

Add the import: `import { e2eAlunnoEmail } from './E2eSampleDatabaseBuilder';`

In the `E2eTemplateProvisioner.provision()` method, add the new artifact and return it:

```typescript
  provision(folderId: string): E2eTemplateIds {
    const verbale = this.findOrCreateDoc(folderId, NAME_VERBALE, VERBALE_PARAGRAPHS);
    const condotta = this.findOrCreateSheet(folderId, NAME_CONDOTTA, condottaUpdates());
    const riepilogo = this.findOrCreateDoc(
      folderId,
      NAME_RIEPILOGO,
      RIEPILOGO_PARAGRAPHS,
      RIEPILOGO_TABLES
    );
    const aslImportSheet = this.findOrCreateSheet(folderId, NAME_ASL_IMPORT, aslImportUpdates());
    const piani = {} as E2eTemplateIds['piani'];
    for (const tipo of TIPI_PIANO) {
      piani[tipo] = this.findOrCreateDoc(folderId, namePiano(tipo), pianoParagraphs(tipo));
    }
    return { verbale, condotta, riepilogo, aslImportSheet, piani };
  }
```

- [ ] **Step 4: Add the new field to `E2eTemplateIds`** in `src/onlinetests/E2eSampleDatabaseBuilder.ts`

```typescript
export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  riepilogo: string;
  aslImportSheet: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}
```

- [ ] **Step 5: Run the provisioner test to verify it passes; expect the builder test to now fail typecheck**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`
Expected: PASS (new test); other tests in the file still PASS (created-count assertions like `toHaveLength(8)` need updating too — see Step 6)

Run: `npm run typecheck`
Expected: FAIL — `test/unit/onlinetests/e2e-sample-database-builder.test.ts`'s `TEMPLATE_IDS` const object literal is missing `aslImportSheet`, and `e2e-template-provisioner.test.ts`'s "creates all 8 templates" / "reuses" counts are now stale (9 templates, not 8)

- [ ] **Step 6: Fix the stale counts in `test/unit/onlinetests/e2e-template-provisioner.test.ts`**

Change `expect(created).toHaveLength(8);` to `expect(created).toHaveLength(9);` in the "creates all 8 templates..." test (rename the test to "creates all 9 templates (1 doc verbale + 1 sheet condotta + 1 doc riepilogo + 1 sheet asl import + 5 doc piani)..." and add `expect(created.filter((c) => c.startsWith('sheet:'))).toHaveLength(2);`/keep doc count at 7). In the "reuses an existing template..." test, change `expect(created).toHaveLength(7);` to `expect(created).toHaveLength(8);` (comment: `// condotta + riepilogo + asl import + 5 piani still created`).

- [ ] **Step 7: Fix `TEMPLATE_IDS` in `test/unit/onlinetests/e2e-sample-database-builder.test.ts`**

Add `aslImportSheet: 'tmpl_asl_import',` to the `TEMPLATE_IDS` object literal.

- [ ] **Step 8: Write the failing test for the `CONF_IMP` row** — add to `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

```typescript
import { COL_CONF_IMP } from '../../../src/config/schema';

test('seeds a CONF_IMP row importing the ASL sheet into TABLE.ASL, keyed on STUDENTE', () => {
  const { spreadsheets, sheets } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const rows = sample.rows[TABLE.CONF_IMP]!;
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row[COL_CONF_IMP.TARGET]).toBe(TABLE.ASL);
  expect(row[COL_CONF_IMP.ATTIVO]).toBe(true);
  const config = JSON.parse(String(row[COL_CONF_IMP.CONFIG]));
  expect(config).toMatchObject({
    searchStrategy: 'FILE_SINGOLO',
    fileId: TEMPLATE_IDS.aslImportSheet,
    map: { A: 'STUDENTE', B: 'ANNO', C: 'ORE' },
    key: 'STUDENTE',
    conflictResolution: 'OVERWRITE'
  });
});
```

- [ ] **Step 9: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "CONF_IMP row"`
Expected: FAIL — `rows` is `undefined` (no `TABLE.CONF_IMP` rows seeded yet)

- [ ] **Step 10: Implement the seed method** in `src/onlinetests/E2eSampleDatabaseBuilder.ts`

Add the exported constant near the other `CONF_*` constants:

```typescript
export const CONF_IMP_ASL = 'E2E_IMPORT_ASL';
```

Add a new private method, called from `build()` right after `this.seedConfMail(sample);`:

```typescript
    this.seedConfImp(sample, templateIds);
```

```typescript
  private seedConfImp(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
    sample.appendRow(TABLE.CONF_IMP, {
      [COL_CONF_IMP.ID]: CONF_IMP_ASL,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: templateIds.aslImportSheet,
        map: { A: 'STUDENTE', B: 'ANNO', C: 'ORE' },
        key: 'STUDENTE',
        conflictResolution: 'OVERWRITE'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    });
  }
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 12: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 13: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "feat(onlinetests): provision ASL/PCTO import source sheet + CONF_IMP row"
```

---

## Task 7: Scenario A check — ASL/PCTO import

**Files:**
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**
- Consumes: `CONF_IMP_ASL`, `ASL_IMPORT_ROWS`-equivalent expected data (Task 6); `container.get<ImportService>('importService')` (existing, `src/application/services/ImportService.ts`, `executeImport(configId: string): ImportResult`).
- Produces: registers `runner.add('E2E scenario 9: importa ore ASL/PCTO da sheet (3rd-year only)', ...)`.

- [ ] **Step 1: Write the failing test** — add to `test/unit/onlinetests/e2e-scenario-checks.test.ts`

The existing `recordingHarness()` doesn't fake `importService` or `db.table(...).findAll()` with real filtering — extend the harness minimally:

```typescript
import { CONF_IMP_ASL } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type { ImportService, ImportResult } from '../../../src/application/services/ImportService';
```

Add a new harness variant (don't touch the existing `recordingHarness` — copy its shape into a new function so existing tests stay untouched):

```typescript
function harnessWithImport(
  importResult: ImportResult,
  aslRows: Array<Record<string, unknown>>
): { container: ServiceContainer } {
  const base = recordingHarness();
  const importService = {
    executeImport(configId: string) {
      expect(configId).toBe(CONF_IMP_ASL);
      return importResult;
    }
  } as ImportService;
  const db = {
    table: (name: string) =>
      name === 'ASL' ? { findAll: () => aslRows } : { findAll: () => [] }
  } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'importService') return importService as T;
      if (key === 'db') return db as T;
      return base.container.get<T>(key);
    }
  } as ServiceContainer;
  return { container };
}

test('scenario 9: imports ASL rows and verifies them in the ASL table', () => {
  const { container } = harnessWithImport(
    { inseriti: 4, aggiornati: 0, saltati: 0, ghost: 0, errori: [] },
    [
      { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
      { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
      { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 },
      { STUDENTE: 'e2ealunno52@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 35 }
    ]
  );
  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario9 = runner.report().results.find((r) => r.name.includes('scenario 9'));
  expect(scenario9).toMatchObject({ status: 'pass' });
});

test('scenario 9: fails when an expected ASL row is missing', () => {
  const { container } = harnessWithImport(
    { inseriti: 3, aggiornati: 0, saltati: 0, ghost: 1, errori: [] },
    [
      { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
      { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
      { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 }
    ]
  );
  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario9 = runner.report().results.find((r) => r.name.includes('scenario 9'));
  expect(scenario9?.status).toBe('fail');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts -t "scenario 9"`
Expected: FAIL — no result named "scenario 9" exists yet

- [ ] **Step 3: Implement** — in `src/onlinetests/checks/e2eScenarioChecks.ts`

Add the import: `import { CONF_IMP_ASL } from '../E2eSampleDatabaseBuilder';` and `import type { ImportService } from '../../application/services/ImportService';` and `import { COL_ASL } from '../../config/schema';`

Add, after the existing scenario 8 block (before scenario 4's `runner.add(...)`):

```typescript
  runner.add('E2E scenario 9: importa ore ASL/PCTO da sheet (3rd-year only)', sample.sampleSpreadsheetUrl, () => {
    const importService = container.get<ImportService>('importService');
    const result = importService.executeImport(CONF_IMP_ASL);
    if (result.errori.length > 0) {
      throw new ValidationError(`Import ASL fallito: ${result.errori.join('; ')}`);
    }
    if (result.inseriti + result.aggiornati === 0) {
      throw new ValidationError('Import ASL: nessuna riga inserita o aggiornata');
    }
    const expected: Record<string, number> = {
      'e2ealunno43@onlinetest.aldo.local': 40,
      'e2ealunno44@onlinetest.aldo.local': 55,
      'e2ealunno51@onlinetest.aldo.local': 60,
      'e2ealunno52@onlinetest.aldo.local': 35
    };
    const rows = db.table(TABLE.ASL).findAll();
    for (const [studente, ore] of Object.entries(expected)) {
      const row = rows.find((r) => r[COL_ASL.STUDENTE] === studente);
      if (row === undefined) {
        throw new ValidationError(`Import ASL: riga mancante per ${studente}`);
      }
      if (Number(row[COL_ASL.ORE]) !== ore) {
        throw new ValidationError(
          `Import ASL: ${studente} atteso ORE=${ore}, ricevuto ${String(row[COL_ASL.ORE])}`
        );
      }
    }
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: PASS (all tests, including the two "TEST_MODE guard" / "resolves the email service..." pre-existing tests — the new scenario runs before scenario 4, so add a corresponding entry check there too if those tests assert an exact `emailPatterns` sequence unaffected by scenario 9, which it is, since scenario 9 doesn't touch `emailNotificationService`)

- [ ] **Step 5: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "feat(onlinetests): add e2e scenario 9 (ASL/PCTO import)"
```

---

## Task 8: Scenario B fixture — complex Doc placeholder template

**Files:**
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**
- Produces: `E2eTemplateIds.docComplesso: string`; `E2eSampleDatabaseBuilder`, exported constant `CONF_DOC_COMPLESSO = 'E2E_DOC_COMPLESSO'`. Consumed by Task 9.

- [ ] **Step 1: Write the failing test** — add to `test/unit/onlinetests/e2e-template-provisioner.test.ts`

```typescript
test('authors the complex-placeholder template with bullet/number lists, tablerow/tablecol loops, and pipe filters', () => {
  const { artifacts, docContent, docTables } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const text = (docContent[ids.docComplesso] ?? []).join('\n');
  expect(text).toContain("{{#bullet_list:focus.classe.coordinatori | sortBy:'nome'}}");
  expect(text).toContain("{{#number_list:focus.classe.rappresentanti.studenti | where:'nomeCompleto'}}");
  expect(text).toContain('| uppercase');
  const tables = docTables[ids.docComplesso] ?? [];
  const tableText = JSON.stringify(tables);
  expect(tableText).toContain("tablerow_loop:focus.classe.studenti.listaCompleta | sortBy:'anagrafica.nomeCompleto'");
  expect(tableText).toContain('tablecol_loop:focus.classe.consiglioDiClasse');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts -t "complex-placeholder"`
Expected: FAIL — `ids.docComplesso` is `undefined`

- [ ] **Step 3: Implement** in `src/onlinetests/E2eTemplateProvisioner.ts`

Add near the other name constants: `const NAME_DOC_COMPLESSO = 'E2E Doc Complesso Template';`

Add the paragraph/table content, against real CDU paths (`02_CDU_STRUTTURA.md` §4.1, matching the same real-path convention `VERBALE_PARAGRAPHS`/`RIEPILOGO_PARAGRAPHS` already use):

```typescript
const DOC_COMPLESSO_PARAGRAPHS = [
  'Report Complesso — {{focus.classe.anagrafica.nome}}',
  'Coordinatori, ordinati per nome (elenco puntato, con filtro sortBy sul source del loop):',
  '{{#bullet_list:focus.classe.coordinatori | sortBy:\'nome\'}}{{nome | uppercase}} — {{materia}}{{/bullet_list}}',
  'Rappresentanti degli studenti (elenco numerato, con filtro where sul source del loop):',
  '{{#number_list:focus.classe.rappresentanti.studenti | where:\'nomeCompleto\'}}{{nomeCompleto}}{{/number_list}}'
];

const DOC_COMPLESSO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Alunno', 'Email'],
      [
        '{{#tablerow_loop:focus.classe.studenti.listaCompleta | sortBy:\'anagrafica.nomeCompleto\'}}{{anagrafica.nomeCompleto}}',
        '{{anagrafica.email}}'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  },
  {
    data: [
      [
        '{{#tablecol_loop:focus.classe.consiglioDiClasse}}{{materie.0.sigla | uppercase}}'
      ]
    ],
    options: { headerRow: true }
  }
];
```

`focus.classe.coordinatori` (`{nome, materia}`), `focus.classe.rappresentanti.studenti` (`{nomeCompleto}`), `focus.classe.studenti.listaCompleta` (`{anagrafica: {nomeCompleto, email}}`), and `focus.classe.consiglioDiClasse` (`{anagrafica: {...}, materie: [{sigla, ...}]}`) are all real, already-confirmed CDU paths — every one is already rendered elsewhere in this same file's `VERBALE_PARAGRAPHS`/`RIEPILOGO_PARAGRAPHS`/`RIEPILOGO_TABLES`, or (for `consiglioDiClasse`) in production by `SheetMaterieGeneratorStrategy.buildGroups` (`src/application/strategies/SheetMaterieGeneratorStrategy.ts`). `sortBy`/`where` are piped directly onto each loop directive's own `source` expression (`{{#bullet_list:path | filter:args}}`) — this composition is NOT verifiable by this task's offline unit test, which only asserts the authored template STRING contains the right text (matching every existing test in this file, e.g. the pre-existing `'authors real CDU-path placeholder content...'` test), never executes `WorkspaceTemplateEngine` against a real Google Doc (`DocumentApp` isn't available under Jest even though the vendored library classes are loaded, per `test/setup/load-gaslibs.cjs`). Whether the composition actually renders correctly can only be proven by a live online run (`npm run push:online` + `runE2eScenarios`), which is explicitly outside this plan's own verification steps (see Global Constraints) — if a future online run shows the composition fails, the fix is to move `sortBy`/`where` to each loop's per-item body instead (e.g. pre-sort via a `sortBy`'d intermediate CDU field, or drop the filter demonstration to the plain-paragraph pipe position `{{expr | filter:args}}` used by `uppercase` above), not to abandon the scenario.

Add `aslImportSheet` sibling field to `provision()`'s return (from Task 6) plus the new one:

```typescript
    const docComplesso = this.findOrCreateDoc(
      folderId,
      NAME_DOC_COMPLESSO,
      DOC_COMPLESSO_PARAGRAPHS,
      DOC_COMPLESSO_TABLES
    );
```

and add `docComplesso,` to the returned object.

- [ ] **Step 4: Add the field to `E2eTemplateIds`** in `src/onlinetests/E2eSampleDatabaseBuilder.ts`

```typescript
export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  riepilogo: string;
  aslImportSheet: string;
  docComplesso: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}
```

- [ ] **Step 5: Run the provisioner test to verify it passes; fix stale created-counts**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`

Update the "creates all N templates" test's counts again (now 10 total: 8 docs + 2 sheets) and add `aslImportSheet`/`docComplesso` to `test/unit/onlinetests/e2e-sample-database-builder.test.ts`'s `TEMPLATE_IDS` (`aslImportSheet: 'tmpl_asl_import', docComplesso: 'tmpl_doc_complesso',`).

Expected after fixes: PASS

- [ ] **Step 6: Write the failing test for the `CONF_DOC` row** — add to `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

```typescript
test('seeds a CONF_DOC row for the complex-placeholder template (DOCUMENTO_GENERICO generator)', () => {
  const { spreadsheets, sheets } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const row = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === 'E2E_DOC_COMPLESSO');
  expect(row).toBeDefined();
  expect(row![COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');
  expect(JSON.parse(String(row![COL_CONF_DOC.MODELLI]))).toEqual({
    templateId: TEMPLATE_IDS.docComplesso
  });
});
```

- [ ] **Step 7: Run to verify it fails, then implement**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "complex-placeholder template"`
Expected: FAIL

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, add the exported constant near the other `CONF_DOC_*` constants:

```typescript
export const CONF_DOC_COMPLESSO = 'E2E_DOC_COMPLESSO';
```

In `seedConfDoc(sample, templateIds)`, add a new row (same shape as `CONF_DOC_RIEPILOGO`'s, `DOCUMENTO_GENERICO` generator) right after the `CONF_DOC_RIEPILOGO` block:

```typescript
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_COMPLESSO,
      [COL_CONF_DOC.TIPO]: 'REPORT_COMPLESSO',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.docComplesso }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Complesso_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_UTENTI]: 'COORDINATORI'
    });
```

- [ ] **Step 8: Run all onlinetests unit tests to verify green**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/`
Expected: PASS

- [ ] **Step 9: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 10: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "feat(onlinetests): add complex-placeholder Doc template + CONF_DOC row"
```

---

## Task 9: Scenario B check — complex template generation + no-leftover-placeholders

**Files:**
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**
- Consumes: `CONF_DOC_COMPLESSO` (Task 8); `container.get<IDriveFacade>('drive')` (existing — check the exact registered key name first, see Step 0) for reading the generated Doc's text back.
- Produces: registers `runner.add('E2E scenario 10: genera documento complesso (placeholder loops/filtri, tutte le classi)', ...)`.

- [ ] **Step 0: Confirm the DI key for the drive facade**

Run: `grep -n "c.register('drive'" src/config/Bootstrap.ts`

- [ ] **Step 1: Write the failing test** — add to `test/unit/onlinetests/e2e-scenario-checks.test.ts`

```typescript
import { CONF_DOC_COMPLESSO } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type { IDriveFacade } from '../../../src/infrastructure/facades/DriveServiceFacade';

test('scenario 10: generates the complex doc for every class and checks for leftover placeholders', () => {
  const harness = recordingHarness();
  const driveTexts: Record<string, string> = {};
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        return {
          getFileText: (fileId: string) => driveTexts[fileId] ?? 'Report Complesso — 1A, no placeholders left'
        } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((r) => r.name.includes('scenario 10'));
  expect(scenario10).toMatchObject({ status: 'pass' });
});

test('scenario 10: fails when the generated doc still has an unresolved {{...}} placeholder', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        return { getFileText: () => 'Report Complesso — {{focus.classe.anagrafica.nome}}' } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((r) => r.name.includes('scenario 10'));
  expect(scenario10?.status).toBe('fail');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts -t "scenario 10"`
Expected: FAIL — no such scenario, and `IDriveFacade` may not have a `getFileText` method yet (check first — see Step 3)

- [ ] **Step 3: Confirm or add a text-readback method on `IDriveFacade`**

Run: `grep -n "getFileText\|getBlob\|interface IDriveFacade" src/infrastructure/facades/DriveServiceFacade.ts`

If `getFileText(fileId: string): string` already exists, skip to Step 4. If it doesn't, this task needs a small facade addition first — add it to `IDriveFacade` and its `DriveServiceFacade` implementation, backed by the underlying `GoogleApiWrapper` `DocumentService`'s text-extraction method (check `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper_docs.md` for the exact method name before writing this; do not guess a method name against the real library).

- [ ] **Step 4: Implement the scenario check** in `src/onlinetests/checks/e2eScenarioChecks.ts`

Add the import: `import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';`

Add, after the scenario 9 block:

```typescript
  runner.add('E2E scenario 10: genera documento complesso (placeholder loops/filtri, tutte le classi)', sample.sampleSpreadsheetUrl, () => {
    const drive = container.get<IDriveFacade>('drive');
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_COMPLESSO);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione documento complesso per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
      const text = drive.getFileText(fileId);
      if (/\{\{[^}]*\}\}/.test(text)) {
        throw new ValidationError(
          `Documento complesso per ${classe}: placeholder non risolto trovato nel testo generato`
        );
      }
    }
    assertPersistedLinks(CONF_DOC_COMPLESSO, 'Documento complesso');
  });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts src/infrastructure/facades/DriveServiceFacade.ts
git commit -m "feat(onlinetests): add e2e scenario 10 (complex Doc placeholders, no-leftover-token check)"
```

---

## Task 10: Scenario C fixture — sheet-with-subject-permissions template

**Files:**
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**
- Produces: `E2eTemplateIds.sheetPermessi: string`; exported constant `CONF_DOC_SHEET_PERMESSI = 'E2E_SHEET_PERMESSI'`. Consumed by Task 11.

- [ ] **Step 1: Write the failing test** — add to `test/unit/onlinetests/e2e-template-provisioner.test.ts`

```typescript
test('authors the sheet-with-permessi template with the multi-group dynamic_columns placeholder', () => {
  const { artifacts, sheetContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const text = JSON.stringify(sheetContent[ids.sheetPermessi] ?? []);
  expect(text).toContain('dynamic_columns[');
  expect(text).toContain('source=materieColonne.group1,value=header');
  expect(text).toContain('source2=materieColonne.group2,value2=header,label2=materieColonne.group2Label');
  expect(text).toContain('source3=materieColonne.group3,value3=header,label3=materieColonne.group3Label');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts -t "sheet-with-permessi"`
Expected: FAIL — `ids.sheetPermessi` is `undefined`

- [ ] **Step 3: Implement** in `src/onlinetests/E2eTemplateProvisioner.ts`

Add near the other name constants: `const NAME_SHEET_PERMESSI = 'E2E Sheet Permessi Template';`

Add the update data (single header cell carrying the whole multi-group placeholder, per `WorkspaceTemplateEngine_docs.md`'s "Sintassi multi-gruppo"):

```typescript
function sheetPermessiUpdates(): SheetValueUpdate[] {
  return [
    {
      range: 'A1',
      values: [
        [
          '{{dynamic_columns[' +
            'source=materieColonne.group1,value=header,' +
            'source2=materieColonne.group2,value2=header,label2=materieColonne.group2Label,' +
            'source3=materieColonne.group3,value3=header,label3=materieColonne.group3Label' +
            ']}}'
        ]
      ]
    }
  ];
}
```

In `provision()`, add:

```typescript
    const sheetPermessi = this.findOrCreateSheet(folderId, NAME_SHEET_PERMESSI, sheetPermessiUpdates());
```

and add `sheetPermessi,` to the returned object.

- [ ] **Step 4: Add the field to `E2eTemplateIds`** in `src/onlinetests/E2eSampleDatabaseBuilder.ts`

```typescript
export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  riepilogo: string;
  aslImportSheet: string;
  docComplesso: string;
  sheetPermessi: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}
```

- [ ] **Step 5: Fix stale counts and `TEMPLATE_IDS`, run to verify green**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`

Update the "creates all N templates" count (now 11 total: 8 docs + 3 sheets); add `sheetPermessi: 'tmpl_sheet_permessi',` to `TEMPLATE_IDS` in `test/unit/onlinetests/e2e-sample-database-builder.test.ts`.

Expected after fixes: PASS

- [ ] **Step 6: Write the failing test for the `CONF_DOC` row** — add to `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

```typescript
test('seeds a CONF_DOC row using the SHEET_CON_MATERIE_E_PERMESSI generator', () => {
  const { spreadsheets, sheets } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const row = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === 'E2E_SHEET_PERMESSI');
  expect(row).toBeDefined();
  expect(row![COL_CONF_DOC.GENERATORE]).toBe('SHEET_CON_MATERIE_E_PERMESSI');
  expect(row![COL_CONF_DOC.FORMATO]).toBe('GSHEET');
});
```

- [ ] **Step 7: Run to verify it fails, then implement**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "SHEET_CON_MATERIE_E_PERMESSI"`
Expected: FAIL

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, add the exported constant:

```typescript
export const CONF_DOC_SHEET_PERMESSI = 'E2E_SHEET_PERMESSI';
```

In `seedConfDoc`, add:

```typescript
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_SHEET_PERMESSI,
      [COL_CONF_DOC.TIPO]: 'SHEET_PERMESSI',
      [COL_CONF_DOC.GENERATORE]: 'SHEET_CON_MATERIE_E_PERMESSI',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.sheetPermessi }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Permessi_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.REGISTRA_UTENTI]: 'COORDINATORI'
    });
```

- [ ] **Step 8: Run all onlinetests unit tests to verify green**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/`
Expected: PASS

- [ ] **Step 9: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 10: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "feat(onlinetests): add sheet-with-permessi template + CONF_DOC row"
```

---

## Task 11: Scenario C check — real protection read-back via `getProtectedRanges`

**Files:**
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**
- Consumes: `CONF_DOC_SHEET_PERMESSI` (Task 10); `container.get<SpreadsheetService>('spreadsheets')` (Task 5), `.getProtectedRanges(fileId: string): Array<{ id: string; range: unknown; description: string; editors: { users?: string[] }; sheetId: number; sheetName: string; warningOnly: boolean }>`.
- Produces: registers `runner.add('E2E scenario 11: verifica protezione colonne materie (SHEET_CON_MATERIE_E_PERMESSI)', ...)`.

- [ ] **Step 1: Write the failing test** — add to `test/unit/onlinetests/e2e-scenario-checks.test.ts`

```typescript
import { CONF_DOC_SHEET_PERMESSI } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

test('scenario 11: passes when every generated sheet has protected ranges with non-empty editors', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'spreadsheets') {
        return {
          getProtectedRanges: () => [
            { id: 'p1', range: {}, description: '', editors: { users: ['e2edocente1@onlinetest.aldo.local'] }, sheetId: 0, sheetName: 'Sheet1', warningOnly: false }
          ]
        } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario11 = runner.report().results.find((r) => r.name.includes('scenario 11'));
  expect(scenario11).toMatchObject({ status: 'pass' });
});

test('scenario 11: fails when a generated sheet has no protected ranges', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'spreadsheets') {
        return { getProtectedRanges: () => [] } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario11 = runner.report().results.find((r) => r.name.includes('scenario 11'));
  expect(scenario11?.status).toBe('fail');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts -t "scenario 11"`
Expected: FAIL

- [ ] **Step 3: Implement** in `src/onlinetests/checks/e2eScenarioChecks.ts`

Add the import (type-only, matching how `SpreadsheetService` is referenced elsewhere — check `Bootstrap.ts`'s import path for `SpreadsheetService` and mirror it): `import type { SpreadsheetService } from '@GoogleApiWrapper';` (use the exact import specifier `Bootstrap.ts` uses — run `grep -n "import.*SpreadsheetService" src/config/Bootstrap.ts` first and copy it verbatim).

Add, after the scenario 10 block:

```typescript
  runner.add('E2E scenario 11: verifica protezione colonne materie (SHEET_CON_MATERIE_E_PERMESSI)', sample.sampleSpreadsheetUrl, () => {
    const spreadsheets = container.get<SpreadsheetService>('spreadsheets');
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_SHEET_PERMESSI);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione sheet permessi per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
      const protections = spreadsheets.getProtectedRanges(fileId);
      if (protections.length === 0) {
        throw new ValidationError(`Sheet permessi per ${classe}: nessun range protetto trovato`);
      }
      for (const p of protections) {
        if ((p.editors.users ?? []).length === 0) {
          throw new ValidationError(
            `Sheet permessi per ${classe}: range protetto "${p.description}" senza editors`
          );
        }
      }
    }
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "feat(onlinetests): add e2e scenario 11 (real Sheets protection read-back)"
```

---

## Task 12: Scenario D fixture — work-plan doc + meeting-minutes folder + coordinator email pattern

**Files:**
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**
- Produces: `E2eTemplateIds.pianoLavoro: string`; exported constants `CONF_DOC_PIANO_LAVORO = 'E2E_PIANO_LAVORO'`, `CONF_MAIL_LAVORO = 'E2E_MAIL_LAVORO'`. Modifies `CONF_DOC_VERBALE`'s `PATH_OUT` to be per-class. Consumed by Task 13.

- [ ] **Step 1: Write the failing test for the template** — add to `test/unit/onlinetests/e2e-template-provisioner.test.ts`

```typescript
test('authors the work-plan (piano di lavoro) template', () => {
  const { artifacts, docContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const text = (docContent[ids.pianoLavoro] ?? []).join('\n');
  expect(text).toContain('{{focus.classe.anagrafica.nome}}');
  expect(text.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts -t "piano di lavoro"`
Expected: FAIL

- [ ] **Step 3: Implement** in `src/onlinetests/E2eTemplateProvisioner.ts`

```typescript
const NAME_PIANO_LAVORO = 'E2E Piano Lavoro Template';
const PIANO_LAVORO_PARAGRAPHS = [
  'Piano di Lavoro Annuale — {{focus.classe.anagrafica.nome}}',
  'Indirizzo: {{focus.classe.anagrafica.indirizzo.nomeSintetico}}',
  'Anno scolastico: {{meta.date.oggi.breve}}'
];
```

In `provision()`, add:

```typescript
    const pianoLavoro = this.findOrCreateDoc(folderId, NAME_PIANO_LAVORO, PIANO_LAVORO_PARAGRAPHS);
```

and `pianoLavoro,` to the returned object.

- [ ] **Step 4: Add the field to `E2eTemplateIds`** in `src/onlinetests/E2eSampleDatabaseBuilder.ts`

```typescript
export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  riepilogo: string;
  aslImportSheet: string;
  docComplesso: string;
  sheetPermessi: string;
  pianoLavoro: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}
```

- [ ] **Step 5: Fix stale counts and `TEMPLATE_IDS`, run to verify green**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`

Update "creates all N templates" count (now 12: 9 docs + 3 sheets); add `pianoLavoro: 'tmpl_piano_lavoro',` to `TEMPLATE_IDS`.

Expected after fixes: PASS

- [ ] **Step 6: Write the failing test for `CONF_DOC_VERBALE`'s per-class `PATH_OUT` and the two new rows** — add to `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

```typescript
test('CONF_DOC_VERBALE PATH_OUT is per-class, so each class gets its own LOG_FOLD-tracked destination folder', () => {
  const { spreadsheets, sheets } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const verbale = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === 'E2E_VERBALE')!;
  expect(String(verbale[COL_CONF_DOC.PATH_OUT])).toContain('{{focus.classe.anagrafica.nome}}');
});

test('seeds E2E_PIANO_LAVORO CONF_DOC and E2E_MAIL_LAVORO CONF_MAIL (documenti + cartelle real-folder boxes)', () => {
  const { spreadsheets, sheets } = factory();
  new E2eSampleDatabaseBuilder(spreadsheets, new FakeDriveFacade()).build(TEMPLATE_IDS);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const doc = sample.rows[TABLE.CONF_DOC]!.find((r) => r[COL_CONF_DOC.ID] === 'E2E_PIANO_LAVORO');
  expect(doc).toBeDefined();
  expect(doc![COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');

  const mail = sample.rows[TABLE.CONF_MAIL]!.find((r) => r[COL_CONF_MAIL.ID] === 'E2E_MAIL_LAVORO');
  expect(mail).toBeDefined();
  expect(mail![COL_CONF_MAIL.PROCESSO]).toBe('PER_COORDINATORE');
  const boxes = JSON.parse(String(mail![COL_CONF_MAIL.BOX_CFG]));
  expect(boxes).toEqual([
    {
      TIPO_BOX: 'documenti',
      FILTRO_TIPO: 'E2E_PIANO_LAVORO',
      DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { tipo: 'E2E_PIANO_LAVORO' } }
    },
    { TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse' } }
  ]);
});
```

- [ ] **Step 7: Run to verify it fails, then implement**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "E2E_MAIL_LAVORO"`
Expected: FAIL

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`:

Change `CONF_DOC_VERBALE`'s seed row (in `seedConfDoc`) — `[COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',` becomes:

```typescript
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/{{focus.classe.anagrafica.nome}}',
```

Add the exported constants near the other `CONF_*` constants:

```typescript
export const CONF_DOC_PIANO_LAVORO = 'E2E_PIANO_LAVORO';
export const CONF_MAIL_LAVORO = 'E2E_MAIL_LAVORO';
```

In `seedConfDoc`, add (after the `CONF_DOC_SHEET_PERMESSI` row from Task 10):

```typescript
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_PIANO_LAVORO,
      [COL_CONF_DOC.TIPO]: 'PIANO_LAVORO',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.pianoLavoro }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_PianoLavoro_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_UTENTI]: 'COORDINATORI'
    });
```

In `seedConfMail`, add (after the `CONF_MAIL_PIANI` block):

```typescript
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_LAVORO,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Piano di lavoro e verbali riunioni',
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        {
          TIPO_BOX: 'documenti',
          FILTRO_TIPO: CONF_DOC_PIANO_LAVORO,
          DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { tipo: CONF_DOC_PIANO_LAVORO } }
        },
        { TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse' } }
      ]),
      [COL_CONF_MAIL.TESTO]: '<p>In allegato il piano di lavoro; la cartella dei verbali delle riunioni è collegata di seguito.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
```

- [ ] **Step 8: Run all onlinetests unit tests to verify green**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/`
Expected: PASS — check whether any pre-existing test asserted the old literal `PATH_OUT: '_ALDO_E2E_OUTPUT'` for `E2E_VERBALE` specifically (`grep -n "PATH_OUT" test/unit/onlinetests/e2e-sample-database-builder.test.ts`); if one exists, update it to expect the new per-class value.

- [ ] **Step 9: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 10: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "feat(onlinetests): add work-plan template + CONF_DOC/CONF_MAIL rows; make VERBALE's PATH_OUT per-class"
```

---

## Task 13: Scenario D check — coordinator email with real file attachment + real folder

**Files:**
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**
- Consumes: `CONF_DOC_PIANO_LAVORO`, `CONF_MAIL_LAVORO` (Task 12); `db.table(TABLE.LOG_MAIL).findAll()` (existing).
- Produces: registers `runner.add('E2E scenario 12: invia piano di lavoro (file) + cartella verbali (folder) ai coordinatori (TEST_MODE)', ...)`.

- [ ] **Step 1: Write the failing test** — add to `test/unit/onlinetests/e2e-scenario-checks.test.ts`

```typescript
import { CONF_DOC_PIANO_LAVORO, CONF_MAIL_LAVORO } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import { COL_LOG_MAIL } from '../../../src/config/schema';

test('scenario 12: sends, and asserts both docs and folders landed in LOG_MAIL.ALLEGATI', () => {
  const rows: Array<Record<string, unknown>> = [];
  const documents = {
    generateForClasse(classe: ClasseId, configId: string) {
      return { fileId: `${configId}-${classe.value}`, status: 'CREATED' };
    },
    generateForAlunno() {
      return { fileId: 'x', status: 'CREATED' };
    }
  } as unknown as DocumentGenerationService;
  const email = {
    sendPattern(patternId: string): SendPatternResult {
      if (patternId === CONF_MAIL_LAVORO) {
        rows.push({
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ docs: ['E2E_PIANO_LAVORO-1A'], folders: ['folder1'] })
        });
      }
      return { targets: 1, sent: 1, skipped: 0, errors: [] };
    }
  } as EmailNotificationService;
  const db = { table: () => ({ findAll: () => rows }) } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return db as T;
      if (key === 'emailNotificationService') return email as T;
      throw new Error(`Unexpected service: ${key}`);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario12 = runner.report().results.find((r) => r.name.includes('scenario 12'));
  expect(scenario12).toMatchObject({ status: 'pass' });
});

test('scenario 12: fails when LOG_MAIL.ALLEGATI.folders is empty', () => {
  const rows: Array<Record<string, unknown>> = [];
  const documents = {
    generateForClasse(classe: ClasseId, configId: string) {
      return { fileId: `${configId}-${classe.value}`, status: 'CREATED' };
    },
    generateForAlunno() {
      return { fileId: 'x', status: 'CREATED' };
    }
  } as unknown as DocumentGenerationService;
  const email = {
    sendPattern(patternId: string): SendPatternResult {
      if (patternId === CONF_MAIL_LAVORO) {
        rows.push({
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ docs: ['E2E_PIANO_LAVORO-1A'], folders: [] })
        });
      }
      return { targets: 1, sent: 1, skipped: 0, errors: [] };
    }
  } as EmailNotificationService;
  const db = { table: () => ({ findAll: () => rows }) } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return db as T;
      if (key === 'emailNotificationService') return email as T;
      throw new Error(`Unexpected service: ${key}`);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario12 = runner.report().results.find((r) => r.name.includes('scenario 12'));
  expect(scenario12?.status).toBe('fail');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts -t "scenario 12"`
Expected: FAIL

- [ ] **Step 3: Implement** in `src/onlinetests/checks/e2eScenarioChecks.ts`

Add the import: `import { COL_LOG_MAIL } from '../../config/schema';` (alongside the existing `COL_LOG_DOCS` import, extend that same import line rather than adding a new one) and `import { CONF_DOC_PIANO_LAVORO, CONF_MAIL_LAVORO } from '../E2eSampleDatabaseBuilder';` (extend the existing import block from that module).

Add, after the scenario 11 block:

```typescript
  runner.add('E2E scenario 12: invia piano di lavoro (file) + cartella verbali (folder) ai coordinatori (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_PIANO_LAVORO);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione piano di lavoro per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
    }
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_VERBALE);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione verbale (per la cartella verbali) per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
    }
    const result = getEmailService().sendPattern(CONF_MAIL_LAVORO);
    if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
      throw new ValidationError(`Invio piano di lavoro fallito: ${emailDiagnostics(result)}`);
    }
    const logRows = db.table(TABLE.LOG_MAIL).findAll();
    if (logRows.length === 0) {
      throw new ValidationError('Invio piano di lavoro: nessuna riga LOG_MAIL registrata');
    }
    for (const row of logRows) {
      const allegati = JSON.parse(String(row[COL_LOG_MAIL.ALLEGATI] ?? '{}')) as {
        docs?: string[];
        folders?: string[];
      };
      if ((allegati.docs ?? []).length === 0) {
        throw new ValidationError('LOG_MAIL.ALLEGATI.docs è vuoto: il piano di lavoro non è stato allegato');
      }
      if ((allegati.folders ?? []).length === 0) {
        throw new ValidationError('LOG_MAIL.ALLEGATI.folders è vuoto: la cartella verbali non è stata registrata');
      }
    }
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: PASS (all tests in the file — verify the pre-existing "resolves the email service once..." test's `emailPatterns` sequence assertion doesn't need updating; it only asserts scenarios 4-7's pattern IDs in order, and scenario 12 runs after those, so it's unaffected)

- [ ] **Step 5: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "feat(onlinetests): add e2e scenario 12 (coordinator email with real file attachment + real folder)"
```

---

## Final check

- [ ] Run the full suite one more time end to end: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
- [ ] Run `npm run build:online` to confirm the bundle (including `OnlineTests.js`) still builds clean with all 13 tasks' changes in place. This does not execute the online scenarios (that needs a live `clasp push` + GAS run, outside this plan's scope) but does prove the online-mode webpack entry compiles.
