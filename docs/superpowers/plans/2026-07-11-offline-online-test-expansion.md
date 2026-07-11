# Offline Test Expansion, Online GAS Test Suite & `online` Build Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broaden offline test branch coverage across `src/`, add a self-contained ALDO-only online GAS test suite that builds a sample SGSA database and exercises real ALDO services against it, and add a new `online` build mode that ships an unminified, comment-stripped `Code.js` + a separate unminified, comment-stripped `OnlineTests.js`, plus a line-level `gas-source-map.json`.

**Architecture:** No architectural change to `src/`'s existing layers. Offline-coverage tasks are pure test-file additions (TDD against existing code, using existing fakes in `test/fakes/`). The online suite is a new `src/onlinetests/` tree following the same DI/facade patterns as `src/config/Bootstrap.ts` — it calls real facades, never native GAS globals directly, except inside one new sanctioned `GoogleApiWrapper`-only helper (`SampleDatabaseBuilder`) that must create the throwaway Spreadsheet/Drive folder. The build-mode work extends the existing three-mode `scripts/build-and-prepare.cjs` / `webpack.config.cjs` split-build pipeline (docs/superpowers/specs/2026-07-11-production-split-build-design.md) with a fourth mode and third webpack entry.

**Tech Stack:** TypeScript (Babel→Chrome 80 target), Jest + ts-jest, Webpack 5 + gas-webpack-plugin, Terser (`minimizer-webpack-plugin` for bundling, `terser` package directly for the comments-only pass), Node `source-map` package for the line-map, `@types/google-apps-script`.

## Global Constraints

- Target is GAS V8: synchronous code only, no Node/unsupported browser APIs (per root `CLAUDE.md`).
- Native GAS service globals (`DriveApp`, `SpreadsheetApp`, `MailApp`, `PropertiesService`, `Session`, etc.) may only be touched inside `GoogleApiWrapper` (L2) — everywhere else routes through a wrapper/facade. ESLint's `no-restricted-globals` enforces this; a leak fails `npm run lint`.
- Never edit `dist/*` — it is generated; fix source only.
- No circular deps; keep new code within its layer's allowed dependencies (`src/onlinetests/` depends on `src/config`, `src/application/services`, `src/infrastructure/*` — the same set `src/entrypoints/EntryPoints.ts` and `src/index.ts` are allowed to depend on).
- Online tests cover ALDO code paths only, never GasLibraryFactory internals directly (GLF has its own test suite in its own repo).
- Online-test artifacts (sample database, Drive folder/documents, test emails) are never cleaned up — left in place for manual inspection.
- Existing `production`, `testing`, `testoffline` build modes must keep producing byte-identical-shape output (only `online` is additive).
- All 01_SCHEMA_DATABASE.md table/column names are UPPERCASE and must be referenced via the existing `TABLE`/`COL_*` constants in `src/config/schema.ts` — never hardcoded strings.

---

## Part A — Offline test expansion

Recipe used by every task in this part: run
`npx jest --config jest.config.cjs --coverage --coverageReporters=text -- <path/to/file>.test.ts`
(or the whole suite) before and after to confirm the new test adds coverage
and nothing regresses. Every new test lives in the existing test file for
that module (e.g. `src/foo/Bar.ts` → `test/unit/.../bar.test.ts` — the exact
existing path is given per task). Use the existing fakes in `test/fakes/`
and fixtures in `test/fixtures/tables.ts`; do not invent new fake classes
unless a task says so explicitly.

### Task A1: `StoricoDatabaseProvider.anniStorici` — depth-zero guard

**Files:**
- Modify: `src/application/storico/StoricoDatabaseProvider.ts` (no source change expected — behavior already correct; this is a pure test-coverage task)
- Test: `test/unit/application/storico-services.test.ts`

**Interfaces:**
- Consumes: `MasterStoricoDatabaseProvider` constructor `(master: MasterSheetRepository, logger: LoggerService)`, method `anniStorici(profondita: number): AnnoStorico[]`.

- [ ] **Step 1: Write the failing test** — add to `test/unit/application/storico-services.test.ts`:

```ts
describe('MasterStoricoDatabaseProvider.anniStorici — depth guard', () => {
  it('returns an empty array and never calls the Master Sheet when profondita <= 0', () => {
    const master = { findAnniStorici: jest.fn() } as unknown as MasterSheetRepository;
    const provider = new MasterStoricoDatabaseProvider(master, new LoggerService());

    expect(provider.anniStorici(0)).toEqual([]);
    expect(provider.anniStorici(-3)).toEqual([]);
    expect(master.findAnniStorici).not.toHaveBeenCalled();
  });
});
```

(Add whatever imports — `MasterStoricoDatabaseProvider`, `MasterSheetRepository`, `LoggerService` — the file doesn't already have; check the top of the file first.)

- [ ] **Step 2: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "depth guard"` — Expected: FAIL if the import is missing/wrong, otherwise it may already PASS (the branch exists in source, this is additive coverage) — if it passes immediately, that's correct, proceed to step 4.
- [ ] **Step 3: (only if it failed) fix the test's imports/setup**, not the source — the `profondita <= 0` branch already exists at `StoricoDatabaseProvider.ts:33`.
- [ ] **Step 4: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts` — Expected: PASS, all tests in file green.
- [ ] **Step 5: Commit**

```bash
git add test/unit/application/storico-services.test.ts
git commit -m "test: cover MasterStoricoDatabaseProvider depth<=0 guard"
```

### Task A2: `StoricoDocentiService.perDocente` — no classes taught in a historical year

**Files:**
- Test: `test/unit/application/storico-services.test.ts`

**Interfaces:**
- Consumes: `StoricoDocentiService` constructor `(provider: StoricoDatabaseProvider)`, method `perDocente(docenteEmail: string, profondita = 1): AnnoDocenteStorico[]`. A fake `StoricoDatabaseProvider` returns `{ anno, db }[]` where `db` is a `RepositoryDatabase` usable by `new ClasseRepository(db)`.

- [ ] **Step 1: Write the failing test**

```ts
describe('StoricoDocentiService.perDocente — no matches', () => {
  it('returns one AnnoDocenteStorico per year with an empty classi array when the teacher taught nothing that year', () => {
    const db = buildFakeDatabase({ [TABLE.CLASSI]: [claseRowSenzaDocente] }); // use existing fixture helper/pattern from this file
    const provider: StoricoDatabaseProvider = { anniStorici: () => [{ anno: '2023-2024', db }] };
    const service = new StoricoDocentiService(provider);

    expect(service.perDocente('prof.nessuno@example.com')).toEqual([
      { anno: '2023-2024', classi: [] }
    ]);
  });
});
```

Use whatever fake-database construction helper the existing file already uses for `ClasseRepository` (check the top of `storico-services.test.ts` and `test/fakes/FakeDatabase.ts` — reuse it verbatim rather than inventing a new one). `claseRowSenzaDocente` should be a `CLASSI` row (via `test/fixtures/tables.ts` conventions) with no docente email in any materia column.

- [ ] **Step 2: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "no matches"` — Expected: PASS immediately (additive coverage of line 24's loop-with-zero-hits path) or FAIL only due to fixture wiring — fix fixture wiring, not source.
- [ ] **Step 3: Run full file** — Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts` — Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add test/unit/application/storico-services.test.ts
git commit -m "test: cover StoricoDocentiService.perDocente zero-match year"
```

### Task A3: `ScriptPropertiesFacade` — default-constructor branch

**Files:**
- Test: create `test/unit/infrastructure/properties-facade.test.ts` (no existing dedicated test file — `PropertiesFacade.ts` is currently untested per coverage: 0%)

**Interfaces:**
- Consumes: `ScriptPropertiesFacade` constructor `(props?: LibPropertiesService)`, methods `get(key): string | null`, `set(key, value): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { ScriptPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';

describe('ScriptPropertiesFacade', () => {
  it('delegates get/set to the injected LibPropertiesService', () => {
    const props = { getProperty: jest.fn().mockReturnValue('v'), setProperty: jest.fn() };
    const facade = new ScriptPropertiesFacade(props as never);

    expect(facade.get('K')).toBe('v');
    expect(props.getProperty).toHaveBeenCalledWith('K');

    facade.set('K', 'v2');
    expect(props.setProperty).toHaveBeenCalledWith('K', 'v2');
  });

  it('falls back to ServiceFactory.getPropertiesService() when no props are injected', () => {
    const fake = { getProperty: jest.fn().mockReturnValue(null), setProperty: jest.fn() };
    const spy = jest.spyOn(ServiceFactory, 'getPropertiesService').mockReturnValue(fake as never);

    const facade = new ScriptPropertiesFacade();
    expect(facade.get('X')).toBeNull();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
```

Check how sibling facade tests (e.g. `test/unit/infrastructure/gmail-facade.test.ts`) import/mock `ServiceFactory` (it's a GLF global loaded via `test/setup/load-gaslibs.cjs`) and match that exact pattern instead of guessing.

- [ ] **Step 2: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/properties-facade.test.ts` — Expected: FAIL, file/module not found.
- [ ] **Step 3: No source change needed** — `PropertiesFacade.ts` already implements both branches; only the test file is new.
- [ ] **Step 4: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/properties-facade.test.ts` — Expected: PASS, 100% branch coverage for this file.
- [ ] **Step 5: Commit**

```bash
git add test/unit/infrastructure/properties-facade.test.ts
git commit -m "test: add ScriptPropertiesFacade coverage (was untested)"
```

### Task A4: `GasUiFacade` — default-constructor + delegation branches

**Files:**
- Test: create `test/unit/infrastructure/ui-facade.test.ts` (currently 0% — check `test/fakes/FakeUiFacade.ts` is only a fake *for* `IUiFacade`, not a test of `GasUiFacade` itself)

**Interfaces:**
- Consumes: `GasUiFacade` constructor `(ui?: LibUiService, logger?: LoggerService)`; methods `creaMenu`, `chiediInput`, `mostraMessaggio`, `mostraSidebarMonitoraggio`.

- [ ] **Step 1: Write the failing test**

```ts
import { GasUiFacade } from '../../../src/infrastructure/facades/UiFacade';

function fakeUi() {
  const menu = { addItem: jest.fn(), addToUi: jest.fn() };
  return {
    createMenu: jest.fn().mockReturnValue(menu),
    prompt: jest.fn().mockReturnValue({ getResponseText: () => '  hi  ' }),
    alert: jest.fn(),
    __menu: menu
  };
}

describe('GasUiFacade', () => {
  it('creaMenu adds every voce and calls addToUi', () => {
    const ui = fakeUi();
    new GasUiFacade(ui as never, { info: jest.fn() } as never).creaMenu('Titolo', [
      { etichetta: 'A', funzione: 'fnA' },
      { etichetta: 'B', funzione: 'fnB' }
    ]);
    expect(ui.createMenu).toHaveBeenCalledWith('Titolo');
    expect(ui.__menu.addItem).toHaveBeenNthCalledWith(1, 'A', 'fnA');
    expect(ui.__menu.addItem).toHaveBeenNthCalledWith(2, 'B', 'fnB');
    expect(ui.__menu.addToUi).toHaveBeenCalled();
  });

  it('chiediInput trims the response text', () => {
    const ui = fakeUi();
    const result = new GasUiFacade(ui as never, { info: jest.fn() } as never).chiediInput('T', 'M');
    expect(result).toBe('hi');
  });

  it('mostraMessaggio delegates to ui.alert', () => {
    const ui = fakeUi();
    new GasUiFacade(ui as never, { info: jest.fn() } as never).mostraMessaggio('T', 'M');
    expect(ui.alert).toHaveBeenCalledWith('T', 'M', undefined);
  });

  it('falls back to ServiceFactory.getUiService()/getLogger() when nothing is injected', () => {
    const ui = fakeUi();
    const uiSpy = jest.spyOn(ServiceFactory, 'getUiService').mockReturnValue(ui as never);
    const logSpy = jest.spyOn(ServiceFactory, 'getLogger').mockReturnValue({ info: jest.fn() } as never);

    new GasUiFacade().mostraMessaggio('T', 'M');
    expect(uiSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();

    uiSpy.mockRestore();
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/ui-facade.test.ts` — Expected: FAIL, file not found.
- [ ] **Step 3: No source change needed.**
- [ ] **Step 4: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/ui-facade.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add test/unit/infrastructure/ui-facade.test.ts
git commit -m "test: add GasUiFacade coverage (was untested)"
```

### Task A5: `TemplateEngineFacade` — failure + default-constructor branches

**Files:**
- Test: `test/unit/infrastructure/*.ts` — check first whether a `template-engine-facade.test.ts` already exists (coverage says 10%, so a thin one likely does); extend it if so, else create `test/unit/infrastructure/template-engine-facade.test.ts`.

**Interfaces:**
- Consumes: `TemplateEngineFacade` constructor `(service?: PlaceholderService)`; `processDocument(fileId, context): void` throws when `service.processDocument(...)` returns `false`; `processSheet(sheetId, context, sheetName?)` throws when `result.success` is `false`, else returns `result.layouts.flatMap((l) => l.columns)`.

- [ ] **Step 1: Write the failing test**

```ts
describe('TemplateEngineFacade — failure branches', () => {
  it('processDocument throws when PlaceholderService.processDocument returns false', () => {
    const service = { processDocument: jest.fn().mockReturnValue(false) };
    const facade = new TemplateEngineFacade(service as never);
    expect(() => facade.processDocument('FILE1', {})).toThrow(
      'TemplateEngineFacade.processDocument(FILE1): PlaceholderService.processDocument returned false'
    );
  });

  it('processSheet throws when result.success is false', () => {
    const service = { processSheet: jest.fn().mockReturnValue({ success: false, layouts: [] }) };
    const facade = new TemplateEngineFacade(service as never);
    expect(() => facade.processSheet('SHEET1', {})).toThrow(
      'TemplateEngineFacade.processSheet(SHEET1): PlaceholderService.processSheet returned success:false'
    );
  });

  it('processSheet flattens layouts.columns across every placeholder on success', () => {
    const service = {
      processSheet: jest.fn().mockReturnValue({
        success: true,
        layouts: [{ columns: ['A', 'B'] }, { columns: ['C'] }]
      })
    };
    const facade = new TemplateEngineFacade(service as never);
    expect(facade.processSheet('SHEET1', {}, 'Foglio1')).toEqual(['A', 'B', 'C']);
    expect(service.processSheet).toHaveBeenCalledWith('SHEET1', {}, 'Foglio1');
  });

  it('builds its own PlaceholderService/Mustache/LoggerService when none is injected', () => {
    expect(() => new TemplateEngineFacade()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs -- template-engine-facade` (adjust path to whatever file you're editing/creating) — Expected: FAIL until the file exists with these cases.
- [ ] **Step 3: No source change needed.**
- [ ] **Step 4: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add test/unit/infrastructure/
git commit -m "test: cover TemplateEngineFacade failure and default-construction branches"
```

### Task A6: `DriveServiceFacade` — copy-failure and permission branches

**Files:**
- Test: `test/unit/infrastructure/drive-facade.test.ts` (existing file — extend it)

**Interfaces:**
- Consumes: `copyFile(templateId, name, folderId): string` throws `Copia file ${templateId} fallita: ${failure?.error.message ?? 'errore sconosciuto'}` when `result.successful[0]` is undefined; `setPermission(fileId, email, permesso)` maps `permesso` through `ROLE_MAP` defaulting to `'reader'` for an unknown value; a private path-resolution helper returns `null` when the resolved parent equals `this.rootFolderId`.

- [ ] **Step 1: Read the current top of the file** — `Read test/unit/infrastructure/drive-facade.test.ts` to see the existing fake `IDriveFacade`/`this.drive` mock shape (`copyFiles`, `shareWithUsers`) already used by passing tests, and copy that construction pattern exactly.
- [ ] **Step 2: Write the failing tests**

```ts
describe('DriveServiceFacade — copyFile failure', () => {
  it('throws with the underlying error message when the copy fails', () => {
    const drive = { copyFiles: jest.fn().mockReturnValue({ successful: [], failed: [{ error: { message: 'quota exceeded' } }] }) };
    const facade = new DriveServiceFacade(drive as never, /* rootFolderId */ 'ROOT');
    expect(() => facade.copyFile('TPL', 'name', 'FOLDER')).toThrow('Copia file TPL fallita: quota exceeded');
  });

  it('throws with a fallback message when no failure detail is available', () => {
    const drive = { copyFiles: jest.fn().mockReturnValue({ successful: [], failed: [] }) };
    const facade = new DriveServiceFacade(drive as never, 'ROOT');
    expect(() => facade.copyFile('TPL', 'name', 'FOLDER')).toThrow('Copia file TPL fallita: errore sconosciuto');
  });
});

describe('DriveServiceFacade — setPermission', () => {
  it('defaults to reader for an unrecognized permesso value', () => {
    const drive = { shareWithUsers: jest.fn() };
    const facade = new DriveServiceFacade(undefined as never, 'ROOT');
    (facade as unknown as { permissions: unknown }).permissions = drive; // match however the constructor actually wires `permissions` — check the file's real constructor signature first instead of assuming
    facade.setPermission('FILE1', 'a@b.com', 'RUOLO_INESISTENTE');
    expect(drive.shareWithUsers).toHaveBeenCalledWith(['FILE1'], [{ type: 'user', role: 'reader', email: 'a@b.com' }], {});
  });
});
```

Before finalizing, `Read src/infrastructure/facades/DriveServiceFacade.ts` in full (only 90 lines) to get the exact constructor signature and `ROLE_MAP` keys/`permissions` field name — the sketch above is illustrative of intent, not verified against the real constructor shape; fix field/constructor-arg names to match.

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts` — Expected: FAIL until wiring matches the real class.
- [ ] **Step 4: No source change needed** (unless the real constructor makes one of these branches unreachable through public API — if so, note it and skip that specific case rather than changing source).
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/infrastructure/drive-facade.test.ts
git commit -m "test: cover DriveServiceFacade copy-failure and setPermission default-role branches"
```

### Task A7: `Bootstrap.buildAldoContainer` — optional-dependency registry branches

**Files:**
- Test: `test/unit/config/bootstrap.test.ts` (existing — extend it)

**Interfaces:**
- Consumes: `buildAldoContainer(deps: BootstrapDeps): ServiceContainer`. Registry entries `SHEET_CON_MATERIE`/`SHEET_CON_MATERIE_E_PERMESSI` only get registered when `deps.spreadsheets !== undefined`; `DOCUMENTO_CON_TABELLE_IMPORTATE` additionally requires `deps.documents !== undefined`.

- [ ] **Step 1: Read the existing test file's `BootstrapDeps` builder helper** (`Read test/unit/config/bootstrap.test.ts`) to reuse its existing minimal-deps factory instead of constructing one from scratch.
- [ ] **Step 2: Write the failing tests**

```ts
describe('buildAldoContainer — optional generator strategies', () => {
  it('does not register SHEET_CON_MATERIE/SHEET_CON_MATERIE_E_PERMESSI when deps.spreadsheets is undefined', () => {
    const deps = minimalDeps(); // reuse existing helper; ensure deps.spreadsheets/deps.documents are omitted
    const container = buildAldoContainer(deps);
    const registry = container.get<Map<string, unknown>>('generatorRegistry'); // adjust to the real registry lookup key/accessor used elsewhere in this file
    expect(registry.has('SHEET_CON_MATERIE')).toBe(false);
    expect(registry.has('SHEET_CON_MATERIE_E_PERMESSI')).toBe(false);
    expect(registry.has('DOCUMENTO_CON_TABELLE_IMPORTATE')).toBe(false);
  });

  it('registers SHEET_CON_MATERIE and SHEET_CON_MATERIE_E_PERMESSI when deps.spreadsheets is provided, but not DOCUMENTO_CON_TABELLE_IMPORTATE without deps.documents', () => {
    const deps = { ...minimalDeps(), spreadsheets: fakeSpreadsheetService() }; // reuse or add a minimal fake matching the constructor's expected type
    const container = buildAldoContainer(deps);
    const registry = container.get<Map<string, unknown>>('generatorRegistry');
    expect(registry.has('SHEET_CON_MATERIE')).toBe(true);
    expect(registry.has('SHEET_CON_MATERIE_E_PERMESSI')).toBe(true);
    expect(registry.has('DOCUMENTO_CON_TABELLE_IMPORTATE')).toBe(false);
  });

  it('registers DOCUMENTO_CON_TABELLE_IMPORTATE when both deps.spreadsheets and deps.documents are provided', () => {
    const deps = { ...minimalDeps(), spreadsheets: fakeSpreadsheetService(), documents: fakeDocumentService() };
    const container = buildAldoContainer(deps);
    const registry = container.get<Map<string, unknown>>('generatorRegistry');
    expect(registry.has('DOCUMENTO_CON_TABELLE_IMPORTATE')).toBe(true);
  });
});
```

Check how the existing passing tests in this file retrieve the strategy registry from the built `ServiceContainer` (grep the file for `'generatorRegistry'` or similar) and use that exact key — don't guess.

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts` — Expected: FAIL until registry-lookup key matches.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/config/bootstrap.test.ts
git commit -m "test: cover buildAldoContainer optional spreadsheets/documents registry branches"
```

### Task A8: `initAldo` — singleton reuse + missing-master-id branches

**Files:**
- Test: `test/unit/config/bootstrap.test.ts`

**Interfaces:**
- Consumes: `initAldo(now?: Date, props?: IPropertiesFacade): ServiceContainer`. Second call with an existing module-level `runtime` returns the same instance without rebuilding. Throws `ConfigurationError` (`ScriptProperties.${PROP_MASTER_SPREADSHEET_ID} mancante: impossibile localizzare il Master Sheet`) when `properties.get(PROP_MASTER_SPREADSHEET_ID)` is `null` or blank.

- [ ] **Step 1: Check how the existing file resets the module-level `runtime` singleton between tests** (grep for `jest.resetModules` or an exported reset helper) — reuse that mechanism; do not add a new one.
- [ ] **Step 2: Write the failing tests**

```ts
describe('initAldo — singleton + missing master id', () => {
  it('returns the same ServiceContainer instance on a second call', () => {
    const props = { get: jest.fn().mockReturnValue('SPREADSHEET_ID_1'), set: jest.fn() };
    const first = initAldo(new Date('2026-01-01'), props as never);
    const second = initAldo(new Date('2026-06-01'), props as never);
    expect(second).toBe(first);
  });

  it.each([null, '', '   '])('throws ConfigurationError when the master id property is %p', (value) => {
    // ensure the module-level singleton is reset first per this file's established reset mechanism
    const props = { get: jest.fn().mockReturnValue(value), set: jest.fn() };
    expect(() => initAldo(new Date(), props as never)).toThrow(ConfigurationError);
    expect(() => initAldo(new Date(), props as never)).toThrow(/MASTER_SPREADSHEET_ID mancante/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts -t "singleton"` — Expected: FAIL until the reset mechanism is wired correctly (tests may bleed the singleton across `it` blocks otherwise).
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts` — Expected: PASS, whole file green.
- [ ] **Step 6: Commit**

```bash
git add test/unit/config/bootstrap.test.ts
git commit -m "test: cover initAldo singleton reuse and missing-master-id error"
```

### Task A9: `AggregatoreDati` — DATI_SORGENTE dispatch switch + caching

**Files:**
- Test: `test/unit/application/aggregatore-dati.test.ts` (existing — extend)

**Interfaces:**
- Consumes: the private dispatch method reached indirectly through whatever public method this file's existing tests already call (check the file — it dispatches on a `metodo` string: `'carenzePerAlunno' | 'documentiPerAlunno' | 'documentiPerClasse' | 'cartellePerClasse' | 'emailCoordinatori' | default`), plus `matchesDoc(d, filtri)` (private, reached through a public documents-query method) and the `documentiCache`/`cartelleCache` lazy caches (`allCartelle()` populates `cartelleCache` only once).

- [ ] **Step 1: Read `src/application/services/AggregatoreDati.ts` in full** (only ~130 lines) and the existing test file's setup, to find the exact public entry point that drives the `metodo` switch (likely something like `datiSorgente(box, params)` or similar — do not guess the name, read it).
- [ ] **Step 2: Write the failing tests** covering each switch arm not yet hit (`documentiPerClasse`, `cartellePerClasse`, `emailCoordinatori`, and the `default` unknown-method branch which logs a warning and returns `null`), plus:

```ts
it('logs a warning and returns null for an unknown DATI_SORGENTE metodo', () => {
  const logger = { warn: jest.fn() };
  // construct AggregatoreDati exactly as the rest of this file does, passing `logger`
  const result = /* call the real dispatch entry point with metodo: 'boh' */;
  expect(result).toBeNull();
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('metodo DATI_SORGENTE sconosciuto "boh"'));
});

it('matchesDoc filters out documents whose tipo/stato/sottotipo do not match all provided filtri', () => {
  // via whatever public method exercises matchesDoc in the existing passing tests —
  // add cases: filtri.tipo mismatch → excluded; filtri.stato mismatch → excluded;
  // filtri.sottotipo mismatch → excluded; all match → included
});

it('allCartelle() only calls logFold.findAll() once across repeated calls (cache)', () => {
  const logFold = { findAll: jest.fn().mockReturnValue([]) };
  // construct AggregatoreDati with this logFold, call the public method that
  // triggers allCartelle() (e.g. cartellePerClasse) twice
  // expect(logFold.findAll).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/application/aggregatore-dati.test.ts` — Expected: FAIL until wired to the real method names found in Step 1.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/application/aggregatore-dati.test.ts
git commit -m "test: cover AggregatoreDati DATI_SORGENTE dispatch, matchesDoc filters, and cache reuse"
```

### Task A10: `DocumentGenerationService.generateForClasse` — not-found, unregistered-generator, critical-error, and status branches

**Files:**
- Test: `test/unit/application/generator-strategies.test.ts` or a dedicated `document-generation-service.test.ts` if one already exists — check `test/unit/application/` first and extend whichever file already constructs `DocumentGenerationService`.

**Interfaces:**
- Consumes: `generateForClasse(target: ClasseId, confDocId: string, jobId?: string): { fileId: string | null; status: string }`. Throws `PipelineError('CONF_DOC ${confDocId} non trovato')` when the row is missing; throws `PipelineError('GENERATORE non registrato: ${config.generatore}')` when `strategyRegistry.has(...)` is false; on a critical-step failure the pipeline's `onError` deletes the orphaned `newFileId` via `this.drive.deleteFile` only if `orphan !== null`, sets a `criticalError` flag, and `generateForClasse` re-throws that flag as a `PipelineError`; on success, `status` is read off `LOG_DOCS.STATO` for the new file, or `'SKIPPED'` when `fileId === null`, or `'UNKNOWN'` when the LOG_DOCS row/column lookup misses.

- [ ] **Step 1: Read `src/application/services/DocumentGenerationService.ts` in full** to confirm constructor deps (`db`, `strategyRegistry`, `drive`, `templates`, `roleResolver`, `now`, `monitor`, `logger`) and how the existing test file already constructs one (reuse that exact builder/fixture).
- [ ] **Step 2: Write the failing tests**

```ts
describe('DocumentGenerationService.generateForClasse — error paths', () => {
  it('throws when the CONF_DOC row does not exist', () => {
    const svc = buildService({ confDocRows: [] }); // adapt to this file's existing builder
    expect(() => svc.generateForClasse(classeId, 'MISSING_ID')).toThrow('CONF_DOC MISSING_ID non trovato');
  });

  it('throws when the configured GENERATORE is not registered in the strategy registry', () => {
    const svc = buildService({ confDocRows: [confDocRow({ generatore: 'NON_ESISTE' })], registry: new Map() });
    expect(() => svc.generateForClasse(classeId, 'ID1')).toThrow('GENERATORE non registrato: NON_ESISTE');
  });

  it('deletes the orphaned newFileId and rethrows when a critical step fails after a file was created', () => {
    // arrange a pipeline stage to fail after newFileId is set (via whatever this file's
    // existing harness uses to simulate a failing CRITICAL_STEPS step)
    const drive = { deleteFile: jest.fn() /* ...other required methods */ };
    const svc = buildService({ drive /* wire the critical failure */ });
    expect(() => svc.generateForClasse(classeId, 'ID1')).toThrow();
    expect(drive.deleteFile).toHaveBeenCalled();
  });

  it('does not call drive.deleteFile when no file was created before the critical failure', () => {
    const drive = { deleteFile: jest.fn() };
    const svc = buildService({ drive /* wire a critical failure before newFileId is ever set */ });
    expect(() => svc.generateForClasse(classeId, 'ID1')).toThrow();
    expect(drive.deleteFile).not.toHaveBeenCalled();
  });

  it("returns status 'SKIPPED' when the pipeline completes without producing a newFileId", () => {
    const svc = buildService({ /* wire a no-op pipeline path */ });
    expect(svc.generateForClasse(classeId, 'ID1')).toEqual({ fileId: null, status: 'SKIPPED' });
  });

  it("returns status 'UNKNOWN' when newFileId is set but no matching LOG_DOCS row exists", () => {
    const svc = buildService({ logDocsRows: [] /* newFileId produced but no LOG_DOCS row */ });
    const result = svc.generateForClasse(classeId, 'ID1');
    expect(result.status).toBe('UNKNOWN');
  });
});
```

Adjust every `buildService(...)`/`confDocRow(...)`/`classeId` reference to whatever helpers the existing test file already defines — read it first, do not invent a parallel builder.

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs <the file>` — Expected: FAIL until wiring matches real helpers/constructor.
- [ ] **Step 4: No source change needed**, unless a genuine bug turns up (e.g. `deleteFile` called even when `orphan === null` — if so, fix `src/application/services/DocumentGenerationService.ts` and note the fix in the commit message).
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/application/
git commit -m "test: cover DocumentGenerationService not-found, unregistered-generator, critical-error rollback and status branches"
```

### Task A11: `SheetDbAdapter` — composite-key, single-key, updateRowWhere insert-vs-update branches

**Files:**
- Test: `test/unit/infrastructure/sheetdb-adapter.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `keyOf(row)` (private, reached via public `find`/`updateRowWhere`) branches on `this.composite !== undefined`; `updateRowWhere(match, row)` inserts when no existing row matches (`hit === undefined`), else updates via `updateRowById`, using the virtual `__PK` key when composite, else `keyOf(stripVirtual(hit))`; `isExactKeyMatch(matchKeys)` returns `false` when `declared === undefined` or lengths differ, else checks every declared column is present in `matchKeys`.

- [ ] **Step 1: Read `src/infrastructure/db/SheetDbAdapter.ts` in full** and the existing test file's adapter-construction helper for both a composite-PK table (`CARENZE` or `LOG_MAIL`) and a single-PK table (e.g. `CLASSI`).
- [ ] **Step 2: Write the failing tests**

```ts
describe('SheetDbAdapter.updateRowWhere', () => {
  it('inserts a new row when isExactKeyMatch is true but no row matches the key (getByPK misses)', () => {
    const adapter = buildAdapter(TABLE.CLASSI, []); // reuse existing builder
    adapter.updateRowWhere({ ID: 'X' }, { ID: 'X', NOME: 'Classe X' });
    expect(adapter.findAll()).toContainEqual(expect.objectContaining({ ID: 'X' }));
  });

  it('inserts a new row when the match keys are not an exact PK match and no row satisfies every key', () => {
    const adapter = buildAdapter(TABLE.CLASSI, [{ ID: 'A', NOME: 'Classe A' }]);
    adapter.updateRowWhere({ NOME: 'Classe Z' }, { ID: 'A', NOME: 'Classe Z' });
    // both the original row (unmatched) and the freshly inserted row should exist
    expect(adapter.findAll().some((r) => r.NOME === 'Classe Z')).toBe(true);
  });

  it('updates the existing row (by composite __PK) when the composite table has a matching row', () => {
    const adapter = buildAdapter(TABLE.CARENZE, [carenzaRow]); // reuse fixture row
    adapter.updateRowWhere(
      { [COL_CARENZE.STUDENTE]: carenzaRow[COL_CARENZE.STUDENTE], [COL_CARENZE.PROGRESSIVO]: carenzaRow[COL_CARENZE.PROGRESSIVO] },
      { ...carenzaRow, [COL_CARENZE.VALORE]: 'AGGIORNATO' }
    );
    const updated = adapter.find((r) => r[COL_CARENZE.STUDENTE] === carenzaRow[COL_CARENZE.STUDENTE]);
    expect(updated?.[COL_CARENZE.VALORE]).toBe('AGGIORNATO');
  });

  it('isExactKeyMatch is false (falls to full-scan path) when matchKeys.length differs from the declared PK', () => {
    const adapter = buildAdapter(TABLE.CARENZE, [carenzaRow]);
    // match with only one of the two composite key columns — should still find via full scan, not getByPK
    adapter.updateRowWhere({ [COL_CARENZE.STUDENTE]: carenzaRow[COL_CARENZE.STUDENTE] }, { ...carenzaRow, [COL_CARENZE.VALORE]: 'X' });
    expect(adapter.find((r) => r[COL_CARENZE.STUDENTE] === carenzaRow[COL_CARENZE.STUDENTE])?.[COL_CARENZE.VALORE]).toBe('X');
  });
});
```

Match every helper name (`buildAdapter`, `carenzaRow`, etc.) to what the existing test file actually defines.

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/sheetdb-adapter.test.ts` — Expected: FAIL until wired to real helpers.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/infrastructure/sheetdb-adapter.test.ts
git commit -m "test: cover SheetDbAdapter updateRowWhere insert-vs-update and isExactKeyMatch branches"
```

### Task A12: `readSheetRows`/`CustomSourceStrategies` — optional read-option branches

**Files:**
- Test: `test/unit/application/custom-source-strategies.test.ts` (existing — extend)

**Interfaces:**
- Consumes: the shared `readSheetRows(logger, sheets, sheetId, options)` helper builds a `SheetByIdStrategy` config, only setting `tabName`/`range`/`hasHeaders` when each is `!== undefined` in `options`; the `CERCA_DOCUMENTI` strategy builds `readOptions` the same way from a generic `config` object (`config['tabName']`, `config['range']`, `config['hasHeaders'] !== false`), then filters `logDocs.findAll()` by `idGen` and optionally `tipo`/`stato`, defaulting `_CLASSE` to `''` when `doc.getClassi()[0]` is undefined.

- [ ] **Step 1: Read `src/application/import/CustomSourceStrategies.ts` in full** and the existing test file's fake `SpreadsheetService`/`SheetByIdStrategy` wiring.
- [ ] **Step 2: Write the failing tests**

```ts
describe('readSheetRows — optional options', () => {
  it('omits tabName/range/hasHeaders from the strategy config when not provided in options', () => {
    const extract = jest.fn().mockReturnValue([]);
    // wire SheetByIdStrategy (or whatever this file already mocks) so `extract` records its config arg
    readSheetRows(logger, sheets, 'SHEET1', {});
    expect(extract).toHaveBeenCalledWith({ sheetId: 'SHEET1' });
  });

  it('includes only the options that are provided', () => {
    const extract = jest.fn().mockReturnValue([]);
    readSheetRows(logger, sheets, 'SHEET1', { tabName: 'Foglio2' });
    expect(extract).toHaveBeenCalledWith({ sheetId: 'SHEET1', tabName: 'Foglio2' });
  });
});

describe('CERCA_DOCUMENTI strategy — filtering and _CLASSE default', () => {
  it('filters by tipo and stato when both are provided in config, and skips documents that fail either', () => {
    // arrange logDocs.findAll() to return docs with mixed tipo/stato/idGen and assert
    // only the fully-matching one appears in the strategy's output
  });

  it("defaults _CLASSE to '' when doc.getClassi()[0] is undefined", () => {
    // arrange a matching LOG_DOCS row whose getClassi() returns []
    // assert the emitted row(s) have _CLASSE: ''
  });
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/application/custom-source-strategies.test.ts` — Expected: FAIL until wiring matches real mocks.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/application/custom-source-strategies.test.ts
git commit -m "test: cover readSheetRows optional options and CERCA_DOCUMENTI filter/_CLASSE-default branches"
```

### Task A13: `RisolutoreRuoliService` — every private resolver's empty/none branch

**Files:**
- Test: `test/unit/application/risolutore-ruoli-service.test.ts` (existing — extend)

**Interfaces:**
- Consumes: the various private role-resolver methods (`cdcFiltrato`, `docenteMateria`, `capoDipartimento`, exam-commission resolver, `alunnoEmail`, `famiglia`, rappresentanti resolver, and the supplenza-routing loop around line 246-274), each reached through whatever public `risolvi(...)`/`resolve(...)` entry point the existing test file already calls with different `RUOLI`/role-token fixtures.

- [ ] **Step 1: Read `src/application/services/RisolutoreRuoliService.ts` in full** and the existing test file to find its public entry point and how it selects which private resolver runs (likely a role-token/enum dispatch) and its existing `RoleContext` builder helper.
- [ ] **Step 2: Write the failing tests**, one per still-uncovered empty-result branch — at minimum:

```ts
describe('RisolutoreRuoliService — empty-result branches', () => {
  it('cdcFiltrato returns [] when ctx.cdu.focus.alunno is undefined', () => { /* build ctx without focus.alunno; assert [] via the public entry point for this role */ });
  it('cdcFiltrato skips council members not found in DocenteRepository', () => { /* vms entry whose email has no matching Docente */ });
  it('docenteMateria returns [] when ctx.materiaCorrente is null', () => {});
  it('capoDipartimento returns [] when no dipartimento matches the materia', () => {});
  it('capoDipartimento returns [] when the dipartimento has no capo email', () => {});
  it('capoDipartimento returns [] when the capo email does not match any Docente', () => {});
  it('exam-commission resolver skips materie whose esameConfig is null and whose prima/seconda prova does not match the indirizzo', () => {});
  it('alunnoEmail returns [] when the focus alunno email is undefined or blank', () => {});
  it('famiglia returns [] when the focus alunno email is undefined, and [] when AlunnoRepository has no matching record', () => {});
  it('the supplenza-routing loop skips a docente with a blank id and orders BOTH_EQUAL results with titolare first', () => {});
});
```

Each `it` body must construct the exact `RoleContext`/dependency fakes this file already uses elsewhere (grep the file for `RoleContext` construction and `ctx.cdu.focus` shape) — do not invent a new CDU shape.

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts` — Expected: FAIL until each test is wired to the real dispatch/entry point.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/application/risolutore-ruoli-service.test.ts
git commit -m "test: cover RisolutoreRuoliService empty-result branches across every private resolver"
```

### Task A14: `ImportRecipeMapper` — every CONF_IMP validation-error branch

**Files:**
- Test: `test/unit/application/import-recipe-mapper.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `toLibraryRecipe(conf: ConfigurazioneImport): ImportRecipe` throws `ConfigurationError` for: missing/blank `fileId` (FILE_SINGOLO), missing/blank `folderTipo` (CERCA_CARTELLE_CLASSE), missing/blank `idGen` (CERCA_DOCUMENTI), an unknown `searchStrategy` (default case), missing/blank `key`, missing `conflictResolution`, and (when `conflictResolution === 'TIMESTAMP'`) missing/blank `timestampColumn`.

- [ ] **Step 1: Read the existing test file's `ConfigurazioneImport` fixture builder.**
- [ ] **Step 2: Write the failing tests**, one per branch:

```ts
describe('toLibraryRecipe — validation errors', () => {
  it.each([
    ['FILE_SINGOLO', {}, /CONFIG.fileId obbligatorio/],
    ['CERCA_CARTELLE_CLASSE', {}, /CONFIG.folderTipo obbligatorio/],
    ['CERCA_DOCUMENTI', {}, /CONFIG.idGen obbligatorio/],
    ['STRATEGIA_INESISTENTE', {}, /strategia sorgente "STRATEGIA_INESISTENTE" sconosciuta/]
  ])('throws for searchStrategy=%s with an incomplete config', (searchStrategy, extra, expected) => {
    const conf = buildConf({ searchStrategy, ...extra }); // reuse the file's existing builder
    expect(() => toLibraryRecipe(conf)).toThrow(expected);
  });

  it('throws when CONFIG.key is missing or blank', () => {
    const conf = buildConf({ searchStrategy: 'FILE_SINGOLO', fileId: 'F1', key: '' });
    expect(() => toLibraryRecipe(conf)).toThrow(/CONFIG.key obbligatorio/);
  });

  it('throws when conflictResolution is missing', () => {
    const conf = buildConf({ searchStrategy: 'FILE_SINGOLO', fileId: 'F1', key: 'K' });
    expect(() => toLibraryRecipe(conf)).toThrow(/CONFIG.conflictResolution obbligatorio/);
  });

  it('throws when conflictResolution is TIMESTAMP but timestampColumn is missing or blank', () => {
    const conf = buildConf({ searchStrategy: 'FILE_SINGOLO', fileId: 'F1', key: 'K', conflictResolution: 'TIMESTAMP', timestampColumn: '' });
    expect(() => toLibraryRecipe(conf)).toThrow(/CONFIG.timestampColumn obbligatorio per conflictResolution TIMESTAMP/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/application/import-recipe-mapper.test.ts` — Expected: FAIL until `buildConf` matches the file's real helper.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/application/import-recipe-mapper.test.ts
git commit -m "test: cover every ImportRecipeMapper CONF_IMP validation-error branch"
```

### Task A15: `documentSteps` — regola parsing, dedup-skip, and permission-application branches

**Files:**
- Test: `test/unit/infrastructure/document-steps.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `parseRegola(raw)` maps `'SOLO_SUPPLENTI' | 'ENTRAMBI' | default` to `GestioneSupplenti` values; the dedup step's `_executeLogic` returns early without dedup-checking when `SCHEMA_SOTTOCARTELLE === MULTIPLO_PER_CLASSE`, and separately short-circuits when an existing `LOG_DOCS` row already matches `idGen`+`classe`; the folder-creation step only passes `{ classe }` to `AlberoCartelle.findOrCreate` when `classeNome(ctx) !== ''`; the permission-application step only calls `this.applica(...)` for `file`/`folder` when `ctx.get('newFileId')`/`ctx.get('destFolderId')` are non-null respectively.

- [ ] **Step 1: Read `src/infrastructure/steps/documentSteps.ts` in full** and the existing test file's `PipelineContext`/`cdu`/`cfg` fixture builders.
- [ ] **Step 2: Write the failing tests**

```ts
describe('parseRegola', () => {
  it.each([
    ['SOLO_SUPPLENTI', GestioneSupplenti.SOLO_SUPPLENTI],
    ['ENTRAMBI', GestioneSupplenti.ENTRAMBI],
    [undefined, /* whatever the default branch actually returns — read it first */ GestioneSupplenti.SOLO_SUPPLENTI],
    ['QUALCOSA_DI_IGNOTO', /* same default */ GestioneSupplenti.SOLO_SUPPLENTI]
  ])('maps %p correctly', (raw, expected) => {
    expect(parseRegola(raw)).toBe(expected);
  });
});

describe('dedup step', () => {
  it('skips dedup checking entirely when SCHEMA_SOTTOCARTELLE is MULTIPLO_PER_CLASSE', () => { /* build ctx with that schema; assert no LOG_DOCS query happens / step is a no-op */ });
  it('short-circuits when a LOG_DOCS row already matches idGen and classe', () => { /* build ctx + db with a matching LOG_DOCS row; assert the step\'s early-return behavior */ });
});

describe('folder-creation step', () => {
  it('calls AlberoCartelle.findOrCreate without a classe option when classeNome(ctx) is empty', () => { /* spy on AlberoCartelle or its findOrCreate */ });
  it('passes { classe } when classeNome(ctx) is non-empty', () => {});
});

describe('permission-application step', () => {
  it('does not call applica for file when ctx.get("newFileId") is null', () => {});
  it('does not call applica for folder when ctx.get("destFolderId") is null', () => {});
  it('calls applica for both file and folder when both ids are present, using their respective regolaSupplente', () => {});
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/document-steps.test.ts` — Expected: FAIL until wired to real fixtures/spies.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/infrastructure/document-steps.test.ts
git commit -m "test: cover documentSteps parseRegola defaults, dedup short-circuits, and conditional permission application"
```

### Task A16: `ClasseRepository` — remaining uncovered branches (31 lines: 44,84,131,137,166,168,175,182,199,202,207,224,235,237,246,247,255,257,267,276,284,288,295,307,314,315,337,344,371,372,396)

**Files:**
- Test: `test/unit/infrastructure/classe-repository.test.ts` (existing — extend). This is the single largest coverage gap by branch count (72%, 42 uncovered branches) — budget the most time here.

- [ ] **Step 1: Read `src/infrastructure/repositories/ClasseRepository.ts` in full** (150 lines) alongside `npx jest --config jest.config.cjs --coverage --coverageReporters=html` output (open `coverage/lcov-report/src/infrastructure/repositories/ClasseRepository.ts.html` in a browser, or re-run the per-line Python extraction technique used to generate this plan's line list) to see exactly which branch at each listed line is red.
- [ ] **Step 2: For each uncovered line, write one `it(...)` in the existing test file** exercising the missing branch (e.g. a classe-articolata lookup miss, a `getDocentiPerMateria`/`getMaterieDelDocente` empty-result path, an `IRC`/`ALT` docente-list edge case, a dynamic-column parsing edge case) — use the existing fixture rows in `test/fixtures/tables.ts` for `CLASSI`, adding new fixture rows only if no existing one exercises the needed shape (e.g. a classe with zero materie configured, or an articolata pair).
- [ ] **Step 3: Run test to verify it fails for each new case as you add it** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/classe-repository.test.ts -t "<new test name>"` after each addition.
- [ ] **Step 4: No source change needed unless a real bug turns up** — if one does, fix `ClasseRepository.ts` and call it out explicitly in the commit message rather than silently patching.
- [ ] **Step 5: Run the full file and confirm coverage improved** — Run: `npx jest --config jest.config.cjs --coverage --coverageReporters=text test/unit/infrastructure/classe-repository.test.ts` and check `src/infrastructure/repositories/ClasseRepository.ts`'s branch % rose from 72.00%.
- [ ] **Step 6: Commit**

```bash
git add test/unit/infrastructure/classe-repository.test.ts test/fixtures/tables.ts
git commit -m "test: broaden ClasseRepository branch coverage (articolata, docenti/materie lookup misses)"
```

### Task A17: `EmailNotificationService` — remaining uncovered branches (25 lines: 113,131,148,152,153,164,166,174,175,181,200,222,223,248,255,256,258,277,295,297,306,308,312,326,335)

**Files:**
- Test: `test/unit/application/email-notification-service.test.ts` (existing — extend)

- [ ] **Step 1: Read `src/application/services/EmailNotificationService.ts` in full** and cross-reference the listed line numbers against it directly (`sed -n '105,340p' src/application/services/EmailNotificationService.ts`) to identify each branch (likely: box-rendering optional fields, recipient-list dedup/empty-list guards, BCC/supervisore-email presence check per `01_SCHEMA_DATABASE.md`'s Master Sheet `SUPERVISORE_EMAIL` note, retry/error branches).
- [ ] **Step 2: Write one `it(...)` per uncovered branch**, reusing this file's existing `EmailDb`/box/CDU fixture builders — in particular add an explicit test for the `SUPERVISORE_EMAIL` empty-string case (per `01_SCHEMA_DATABASE.md`: "PUÒ essere vuoto — in tal caso NESSUN BCC è aggiunto") if not already covered, since that's a spec-called-out invariant.
- [ ] **Step 3: Run test to verify it fails for each addition** — Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "<name>"`.
- [ ] **Step 4: No source change needed unless a real bug turns up** (call it out in the commit message if so).
- [ ] **Step 5: Run the full file** — Run: `npx jest --config jest.config.cjs --coverage --coverageReporters=text test/unit/application/email-notification-service.test.ts` — Expected: branch % above 72.56%.
- [ ] **Step 6: Commit**

```bash
git add test/unit/application/email-notification-service.test.ts
git commit -m "test: broaden EmailNotificationService branch coverage including SUPERVISORE_EMAIL empty-BCC case"
```

### Task A18: `emailSteps` — remaining uncovered branches (29 lines: 96,116,120,121,125,129,186,211,220,221,227,229,247,251,252,276,277,281,285,287,294,331,332,334,342,373,375,376,397)

**Files:**
- Test: `test/unit/infrastructure/email-steps.test.ts` (existing — extend)

- [ ] **Step 1: Read `src/infrastructure/steps/emailSteps.ts` in full** — it mirrors `documentSteps.ts`'s pipeline-step structure (per Task A15), so expect analogous branches: optional recipient/BCC fields, dedup/skip conditions, critical-step rollback, post-send LOG_MAIL field defaults.
- [ ] **Step 2: Write one `it(...)` per uncovered branch**, reusing this file's existing `PipelineContext`/CDU/box fixture builders — cross-check each of the 29 listed lines directly in the source (`sed -n '90,400p' src/infrastructure/steps/emailSteps.ts`) before writing its test, same technique as Task A15/A17.
- [ ] **Step 3: Run test to verify it fails for each addition** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/email-steps.test.ts -t "<name>"`.
- [ ] **Step 4: No source change needed unless a real bug turns up** (call it out in the commit message).
- [ ] **Step 5: Run the full file** — Run: `npx jest --config jest.config.cjs --coverage --coverageReporters=text test/unit/infrastructure/email-steps.test.ts` — Expected: branch % above 78.48%.
- [ ] **Step 6: Commit**

```bash
git add test/unit/infrastructure/email-steps.test.ts
git commit -m "test: broaden emailSteps branch coverage"
```

### Task A19: `SupplenzaRepository` — indexed-lookup fallback, overlap-conflict, and delegation-chain branches

**Files:**
- Test: `test/unit/infrastructure/supplenza-repository.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `findByTitolare`/`findBySupplente` fall back to a full `findAll().filter(...)` scan when `indexedLookup` returns `null`; `findSupplenzaSpecifica` returns `null` immediately when `titolare.id` is blank; `creaSupplenza` throws `ValidationError('Supplenza sovrapposta per ...')` when an overlapping supplenza already exists for the same titolare+context; the delegation-chain builder (RoleResolutionLib `Delegation`/chain-walk) resolves the final `byArc` entry keyed by `${principalId}→${delegateId}`, returning `null` when `chain.length === 0`; `requireDocente` throws `EntityNotFoundError` when the email has no matching `Docente`.

- [ ] **Step 1: Read `src/infrastructure/repositories/SupplenzaRepository.ts` in full** and the existing test file's `Docente`/`Supplenza`/fake-`indexedLookup` fixtures.
- [ ] **Step 2: Write the failing tests**

```ts
describe('SupplenzaRepository — indexed-lookup fallback and overlap/chain branches', () => {
  it('findByTitolare falls back to a full scan when indexedLookup returns null', () => { /* fake database.tables[TABLE.SUPPLENZE].indexedLookup returning null; assert full-scan result still matches */ });
  it('findBySupplente falls back to a full scan when indexedLookup returns null', () => {});
  it('findSupplenzaSpecifica returns null immediately when titolare.id is blank', () => {
    const repo = buildRepo(); // reuse existing builder
    expect(repo.findSupplenzaSpecifica(new Docente({ EMAIL: '' } as never), new Date())).toBeNull();
  });
  it('creaSupplenza throws ValidationError when an overlapping supplenza exists for the same titolare+context', () => { /* seed one supplenza, then call creaSupplenza with an overlapping window/classe/materia */ });
  it('the delegation chain resolves to null when chain.length === 0', () => {});
  it('requireDocente throws EntityNotFoundError for an unknown email', () => { /* reached via whichever public method calls requireDocente */ });
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/supplenza-repository.test.ts` — Expected: FAIL until wired to real fixtures.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/infrastructure/supplenza-repository.test.ts
git commit -m "test: cover SupplenzaRepository indexed-lookup fallback, overlap conflict, and delegation-chain null cases"
```

### Task A20: `postProcessActions` — action-type switch and updateMatching column-scan fallback

**Files:**
- Test: `test/unit/infrastructure/post-process-actions.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `findMatchingRows` falls back to `table.getAllRows().filter(...)` when `hits === null` (no indexed column matched); `updateMatching` returns `0` immediately when `db.tables[tab]` is undefined; the action-type `switch` handles `INSERISCI_TIMESTAMP`, `AGGIORNA_CAMPO` (rendering `action.valore` through `templates.processString`), and `AGGIORNA_STATO_DOC` (defaulting `action.tab` to `TABLE.LOG_DOCS` and `action.stato` to `''`).

- [ ] **Step 1: Read `src/infrastructure/steps/postProcessActions.ts` in full** and the existing test file's `cdu`/`templates`/`db` fixtures.
- [ ] **Step 2: Write the failing tests**

```ts
describe('postProcessActions', () => {
  it('updateMatching returns 0 without scanning when the target table does not exist in db.tables', () => {
    expect(updateMatching(fakeDb({}), 'TABELLA_INESISTENTE', {}, {})).toBe(0);
  });
  it('findMatchingRows falls back to a full scan when no indexed column produces a hit', () => { /* table.indexedLookup returns null for every match key */ });
  it("applies AGGIORNA_CAMPO, rendering action.valore as a template against the CDU", () => { /* assert templates.processString called with action.valore and cdu, and the resolved value written */ });
  it("applies AGGIORNA_STATO_DOC, defaulting action.tab to TABLE.LOG_DOCS and action.stato to '' when unset", () => {});
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/infrastructure/post-process-actions.test.ts` — Expected: FAIL until wired to real fixtures.
- [ ] **Step 4: No source change needed.**
- [ ] **Step 5: Run test to verify it passes** — same command — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add test/unit/infrastructure/post-process-actions.test.ts
git commit -m "test: cover postProcessActions missing-table guard, full-scan fallback, and AGGIORNA_CAMPO/AGGIORNA_STATO_DOC defaults"
```

### Task A21: Full-suite regression check for Part A

**Files:** none (verification only)

- [ ] **Step 1: Run the whole offline suite** — Run: `npm test && npm run test:integration` — Expected: all suites PASS, 0 failures.
- [ ] **Step 2: Regenerate the coverage summary** — Run: `npx jest --config jest.config.cjs --coverage --coverageReporters=text-summary` — Expected: branch coverage measurably higher than the 76.88% baseline recorded at the start of this plan (exact target not gated — record the new number in the task's completion note for the next plan's baseline).
- [ ] **Step 3: Run lint and typecheck** — Run: `npm run lint && npm run typecheck` — Expected: both clean (0 errors).
- [ ] **Step 4: Commit** (only if Steps 1-3 required any fixup; otherwise this task is a no-op verification checkpoint — do not create an empty commit)

---

## Part B — Online GAS test suite

### Task B1: `OnlineTestReport` types and the report-accumulation harness

**Files:**
- Create: `src/onlinetests/OnlineTestReport.ts`
- Test: `test/unit/onlinetests/online-test-report.test.ts`

**Interfaces:**
- Produces: `OnlineTestResult { name: string; status: 'pass' | 'fail'; message?: string; artifactUrl?: string }`, `OnlineTestReport { suite: 'aldo-online-tests'; startedAt: string; finishedAt: string; passed: number; failed: number; results: OnlineTestResult[] }`, and a `TestRunner` class: `add(name: string, artifactUrl: string | undefined, fn: () => void): void` (runs `fn` immediately, catches any thrown error, records a `pass`/`fail` result — never throws itself), `report(): OnlineTestReport` (fixes `finishedAt` to call time, sums `passed`/`failed` from recorded results).

- [ ] **Step 1: Write the failing test**

```ts
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';

describe('TestRunner', () => {
  it('records a pass result when fn does not throw', () => {
    const runner = new TestRunner();
    runner.add('check-1', undefined, () => {});
    const report = runner.report();
    expect(report.suite).toBe('aldo-online-tests');
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.results).toEqual([{ name: 'check-1', status: 'pass' }]);
  });

  it('records a fail result with the caught error message and artifactUrl when fn throws', () => {
    const runner = new TestRunner();
    runner.add('check-2', 'https://drive.google.com/x', () => {
      throw new Error('boom');
    });
    const report = runner.report();
    expect(report.passed).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.results).toEqual([{ name: 'check-2', status: 'fail', message: 'boom', artifactUrl: 'https://drive.google.com/x' }]);
  });

  it('never throws out of add() even when fn throws a non-Error value', () => {
    const runner = new TestRunner();
    expect(() => runner.add('check-3', undefined, () => { throw 'stringa'; })).not.toThrow();
    expect(runner.report().results[0]).toEqual({ name: 'check-3', status: 'fail', message: 'stringa' });
  });

  it('sets startedAt at construction and finishedAt at report() time as ISO strings', () => {
    const runner = new TestRunner();
    const report = runner.report();
    expect(() => new Date(report.startedAt).toISOString()).not.toThrow();
    expect(() => new Date(report.finishedAt).toISOString()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/online-test-report.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Write minimal implementation** — `src/onlinetests/OnlineTestReport.ts`:

```ts
export interface OnlineTestResult {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
  artifactUrl?: string;
}

export interface OnlineTestReport {
  suite: 'aldo-online-tests';
  startedAt: string;
  finishedAt: string;
  passed: number;
  failed: number;
  results: OnlineTestResult[];
}

/** Accumulates online-test results, catching every check's own error so one failure never aborts the run. */
export class TestRunner {
  private readonly startedAt = new Date().toISOString();
  private readonly results: OnlineTestResult[] = [];

  add(name: string, artifactUrl: string | undefined, fn: () => void): void {
    try {
      fn();
      this.results.push(artifactUrl !== undefined ? { name, status: 'pass', artifactUrl } : { name, status: 'pass' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.results.push(artifactUrl !== undefined ? { name, status: 'fail', message, artifactUrl } : { name, status: 'fail', message });
    }
  }

  report(): OnlineTestReport {
    const passed = this.results.filter((r) => r.status === 'pass').length;
    return {
      suite: 'aldo-online-tests',
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      passed,
      failed: this.results.length - passed,
      results: this.results
    };
  }
}
```

Note the pass-case test above expects a bare `{ name, status: 'pass' }` (no `artifactUrl` key at all) when none was passed — match that exact shape (don't emit `artifactUrl: undefined`).

- [ ] **Step 4: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/online-test-report.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/onlinetests/OnlineTestReport.ts test/unit/onlinetests/online-test-report.test.ts
git commit -m "feat(onlinetests): add OnlineTestReport types and TestRunner accumulator"
```

### Task B2: `SampleDatabaseBuilder` — schema/table shape (offline-testable part)

**Files:**
- Create: `src/onlinetests/SampleDatabaseBuilder.ts`
- Test: `test/unit/onlinetests/sample-database-builder.test.ts`

**Interfaces:**
- Consumes: `IDriveFacade` (`createFolder`, per `src/infrastructure/facades/DriveServiceFacade.ts`'s existing port — check its exact method signatures before use, do not invent new ones) for the throwaway folder; a raw `SpreadsheetApp`-shaped seam is **not** used directly here — instead this class depends on a small port `ISampleSpreadsheetFactory { createSpreadsheet(name: string): { id: string; addSheet(name: string, headerRow: string[]): void; appendRow(sheetName: string, row: Record<string, unknown>): void; getUrl(): string } }` so the class itself is fully unit-testable offline; the real GAS-backed implementation of this port is written in Task B3, inside `GoogleApiWrapper`-only code.
- Produces: `SampleDatabaseBuilder.build(): SampleDatabase` where `SampleDatabase { masterSpreadsheetId: string; sampleSpreadsheetId: string; sampleSpreadsheetUrl: string; sampleFolderUrl: string }`. Seeds every table from `TABLE` (`src/config/schema.ts`) with a header row from that table's `COL_*` constants, then appends the fixture rows described in the design spec §2 (2 CLASSI incl. one articolata pair, 2 DOCENTI, 4-5 ALUNNI, 1 MATERIE, 1 INDIRIZZI, 1 DIPART, 1 SUPPLENZE + 1 VARIAZIONI_CATTEDRA on overlapping context, 1 CONF_DOC, 1 CONF_MAIL, 1 MASTER row in a separate master spreadsheet pointing at the sample database and folder).

- [ ] **Step 1: Read `src/config/schema.ts` in full** to enumerate every `TABLE.*` key and its paired `COL_*` constant object (some tables may not have a `COL_*` export yet — check; if a table's columns aren't exported as a named `COL_*` constant, add the missing export to `schema.ts` in this task rather than hardcoding column names).
- [ ] **Step 2: Write the failing test**

```ts
import { SampleDatabaseBuilder } from '../../../src/onlinetests/SampleDatabaseBuilder';
import { TABLE, COL_CLASSI, COL_DOCENTI, COL_SUPPLENZE, COL_VARIAZIONI_CATTEDRA, COL_MASTER } from '../../../src/config/schema';

function fakeFactory() {
  const sheets = new Map<string, { headers: string[]; rows: Record<string, unknown>[] }>();
  return {
    createSpreadsheet: jest.fn((name: string) => ({
      id: `SS_${name}`,
      addSheet: (sheetName: string, headerRow: string[]) => sheets.set(sheetName, { headers: headerRow, rows: [] }),
      appendRow: (sheetName: string, row: Record<string, unknown>) => sheets.get(sheetName)!.rows.push(row),
      getUrl: () => `https://docs.google.com/spreadsheets/d/SS_${name}`
    })),
    __sheets: sheets
  };
}

describe('SampleDatabaseBuilder', () => {
  it('creates one sheet per TABLE entry with the correct header row, plus a separate master spreadsheet', () => {
    const factory = fakeFactory();
    const drive = { createFolder: jest.fn().mockReturnValue({ id: 'FOLDER1', getUrl: () => 'https://drive.google.com/drive/folders/FOLDER1' }) };
    const builder = new SampleDatabaseBuilder(factory as never, drive as never, () => new Date('2026-07-11T10:00:00Z'));

    const db = builder.build();

    expect(db.sampleFolderUrl).toBe('https://drive.google.com/drive/folders/FOLDER1');
    expect(db.sampleSpreadsheetUrl).toContain('SS_');
    for (const table of Object.values(TABLE)) {
      if (table === TABLE.MASTER) continue; // MASTER lives in the separate master spreadsheet, not the sample DB
      expect(factory.__sheets.has(table)).toBe(true);
    }
  });

  it('seeds a SUPPLENZE row and a VARIAZIONI_CATTEDRA row on the same class/subject/date window', () => {
    const factory = fakeFactory();
    const drive = { createFolder: jest.fn().mockReturnValue({ id: 'F', getUrl: () => 'url' }) };
    new SampleDatabaseBuilder(factory as never, drive as never, () => new Date('2026-07-11T10:00:00Z')).build();

    const supplenze = factory.__sheets.get(TABLE.SUPPLENZE)!.rows;
    const variazioni = factory.__sheets.get(TABLE.VARIAZIONI_CATTEDRA)!.rows;
    expect(supplenze).toHaveLength(1);
    expect(variazioni).toHaveLength(1);
  });

  it('seeds exactly one articolata partner-class pair in CLASSI, and enrolls one ALUNNI row in the partner class', () => {
    const factory = fakeFactory();
    const drive = { createFolder: jest.fn().mockReturnValue({ id: 'F', getUrl: () => 'url' }) };
    new SampleDatabaseBuilder(factory as never, drive as never, () => new Date('2026-07-11T10:00:00Z')).build();

    const classi = factory.__sheets.get(TABLE.CLASSI)!.rows;
    expect(classi.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/sample-database-builder.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 4: Write the implementation** `src/onlinetests/SampleDatabaseBuilder.ts` — read `src/config/schema.ts`'s full `TABLE`/`COL_*` exports first and write a header-row map keyed by every `TABLE.*` value using its matching `COL_*` object's `Object.values(...)`; seed the specific rows enumerated in the design spec §2 using literal, self-explanatory values (e.g. `EMAIL: 'alunno1@onlinetest.aldo.local'`) so a human reading the sample spreadsheet immediately recognizes it as test data. Name the throwaway artifacts `_ALDO_ONLINETEST_<ISO timestamp from the injected clock>` for both the folder and both spreadsheets.
- [ ] **Step 5: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/sample-database-builder.test.ts` — Expected: PASS.
- [ ] **Step 6: Run lint/typecheck** — Run: `npm run lint && npm run typecheck` — Expected: clean.
- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/SampleDatabaseBuilder.ts test/unit/onlinetests/sample-database-builder.test.ts src/config/schema.ts
git commit -m "feat(onlinetests): add SampleDatabaseBuilder seeding every SGSA table via an injectable spreadsheet-factory port"
```

### Task B3: Real GAS-backed `ISampleSpreadsheetFactory` implementation

**Files:**
- Create: `src/onlinetests/GasSampleSpreadsheetFactory.ts`

**Interfaces:**
- Consumes: `GoogleApiWrapper`'s `ServiceFactory.getSpreadsheetService()` (the same seam `DriveServiceFacade`/other real facades use — check `src/infrastructure/facades/DriveServiceFacade.ts`'s constructor for the exact `ServiceFactory` accessor pattern already in use, and match it) — this is one of the narrow sanctioned direct-GLF-service call sites, exactly like every other `*Facade.ts` in `src/infrastructure/facades/`.
- Produces: a class implementing the `ISampleSpreadsheetFactory` port defined in Task B2, backed by real `SpreadsheetApp` calls via the wrapper.

- [ ] **Step 1: Read `src/infrastructure/facades/DriveServiceFacade.ts` and `src/infrastructure/facades/TemplateEngineFacade.ts` in full** to copy their exact `ServiceFactory.get*Service()` construction pattern (constructor default-injection, no direct native global access).
- [ ] **Step 2: Check GasLibraryFactory's docs for the spreadsheet-creation API** — read `GasLibraryFactory/DOCS_LIBS/*.md` (grep for "createSpreadsheet" or "SpreadsheetService") to find the exact library method for creating a new spreadsheet and adding/appending to sheets — do not guess the API shape.
- [ ] **Step 3: Write `GasSampleSpreadsheetFactory implements ISampleSpreadsheetFactory`**, delegating every method to the library service found in Step 2, following the same constructor-injection-with-`ServiceFactory`-fallback pattern as every existing facade.
- [ ] **Step 4: Typecheck** — Run: `npx tsc --noEmit` — Expected: no errors (this file has no offline unit test — it is exercised only by the online suite itself, exactly like the real `DriveServiceFacade`/`GmailServiceFacade` GAS-backed branches are only exercised online).
- [ ] **Step 5: Lint** — Run: `npm run lint` — Expected: clean, confirming no native GAS global is touched outside the `GoogleApiWrapper`-sanctioned call.
- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/GasSampleSpreadsheetFactory.ts
git commit -m "feat(onlinetests): add real GAS-backed ISampleSpreadsheetFactory implementation"
```

### Task B4: `executeOnlineTests` — repository round-trip and role-resolution checks

**Files:**
- Create: `src/onlinetests/checks/repositoryChecks.ts`
- Test: `test/unit/onlinetests/repository-checks.test.ts`

**Interfaces:**
- Consumes: a `ServiceContainer` (built by `initAldo()` against the sample database, per design spec §2 step 2) and the `SampleDatabase` handle from Task B2; registers checks onto a `TestRunner` (Task B1).
- Produces: `registerRepositoryChecks(runner: TestRunner, container: ServiceContainer, sample: SampleDatabase): void`, adding: a `ClasseRepository` round-trip check (read back a seeded classe, assert its `nome`/materie match what was seeded), an `AlunnoRepository` round-trip check for the articolata-partner-enrolled student, and three `RisolutoreRuoliService`/role-resolution checks — one asserting `SUPPLENZE` wins within its date window, one (a different subject/date outside the `SUPPLENZE` window) asserting `VARIAZIONI_CATTEDRA` wins, one (a subject with neither) asserting the `CLASSI` nominal fallback.

- [ ] **Step 1: Read `src/application/services/RisolutoreRuoliService.ts`'s public entry point** (found during Task A13) and `src/infrastructure/repositories/ClasseRepository.ts`/`AlunnoRepository.ts`'s read methods to know exact method names/signatures to call.
- [ ] **Step 2: Write the failing test**

```ts
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import { registerRepositoryChecks } from '../../../src/onlinetests/checks/repositoryChecks';

describe('registerRepositoryChecks', () => {
  it('registers a passing check when the seeded classe round-trips correctly', () => {
    const runner = new TestRunner();
    const container = buildFakeContainer({ seededClasseNome: 'Classe Test 1' }); // build with the same fakes/patterns used across test/unit/config/bootstrap.test.ts
    registerRepositoryChecks(runner, container as never, sampleFixture());
    const report = runner.report();
    expect(report.results.find((r) => r.name.includes('ClasseRepository'))?.status).toBe('pass');
  });

  it('registers a failing check with a descriptive message when the seeded classe is missing', () => {
    const runner = new TestRunner();
    const container = buildFakeContainer({ seededClasseNome: undefined });
    registerRepositoryChecks(runner, container as never, sampleFixture());
    const report = runner.report();
    const result = report.results.find((r) => r.name.includes('ClasseRepository'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toBeDefined();
  });

  it('registers three role-resolution checks (SUPPLENZE wins, VARIAZIONI_CATTEDRA wins, CLASSI fallback)', () => {
    const runner = new TestRunner();
    const container = buildFakeContainer({});
    registerRepositoryChecks(runner, container as never, sampleFixture());
    const names = runner.report().results.map((r) => r.name);
    expect(names.some((n) => n.includes('SUPPLENZE'))).toBe(true);
    expect(names.some((n) => n.includes('VARIAZIONI_CATTEDRA'))).toBe(true);
    expect(names.some((n) => n.includes('CLASSI') && n.includes('fallback'))).toBe(true);
  });
});
```

Build `buildFakeContainer`/`sampleFixture` reusing patterns from `test/unit/config/bootstrap.test.ts` and Task B2's fixtures rather than inventing new ones.

- [ ] **Step 3: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/repository-checks.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 4: Write the implementation** — each check body wrapped in `runner.add(name, sample.sampleSpreadsheetUrl, () => { /* assert with a thrown Error on mismatch */ })`, using plain `if (actual !== expected) throw new Error(...)` assertions (no Jest `expect` available at runtime in GAS).
- [ ] **Step 5: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/repository-checks.test.ts` — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/checks/repositoryChecks.ts test/unit/onlinetests/repository-checks.test.ts
git commit -m "feat(onlinetests): add repository round-trip and role-resolution priority-chain checks"
```

### Task B5: `executeOnlineTests` — context-engine and document/email pipeline checks

**Files:**
- Create: `src/onlinetests/checks/contextEngineChecks.ts`, `src/onlinetests/checks/pipelineChecks.ts`
- Test: `test/unit/onlinetests/context-engine-checks.test.ts`, `test/unit/onlinetests/pipeline-checks.test.ts`

**Interfaces:**
- Produces: `registerContextEngineChecks(runner, container, sample)` — builds a CDU via `ContextEngineFactory` for the seeded class/student and asserts at least two known `02_CDU_STRUTTURA.md` access paths (e.g. `focus.classe.anagrafica.nome`, `focus.alunno.anagrafica.email`) resolve to the seeded values; `registerPipelineChecks(runner, container, sample)` — calls the real single-item document-generation entry point (`avviaGenerazioneDataDriven` or the underlying `DocumentGenerationService.generateForClasse`, whichever the design spec's "single-item, not full batch/JobRunner loop" note points to — check `src/config/Bootstrap.ts` for the exact exported function) against the seeded `CONF_DOC` row and asserts a file appears in the sample Drive folder, and similarly for `CONF_MAIL` sending to `Session.getActiveUser().getEmail()` with subject prefix `[ALDO ONLINE TEST]` (read the real subject-building code in `src/application/services/EmailNotificationService.ts`/`emailSteps.ts` to know exactly how to inject/assert this prefix — likely via the seeded `CONF_MAIL.OGGETTO` value itself, e.g. seed it as `'[ALDO ONLINE TEST] Assenze'` in Task B2 rather than mutating pipeline code).

- [ ] **Step 1: Re-check Task B2's seeded `CONF_MAIL.OGGETTO` value** — if it isn't already prefixed `[ALDO ONLINE TEST]`, go back and update `SampleDatabaseBuilder.ts`'s seed data (do not add special-casing to the real email pipeline).
- [ ] **Step 2: Read `SPECS_ALDO/02_CDU_STRUTTURA.md`** for the exact access-path spelling of `focus.classe.anagrafica.nome` and `focus.alunno.anagrafica.email` (or whichever two paths are actually documented there) to assert against.
- [ ] **Step 3: Write the failing tests** for both new files, following the exact same `TestRunner`/fake-container pattern as Task B4.
- [ ] **Step 4: Run tests to verify they fail** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/context-engine-checks.test.ts test/unit/onlinetests/pipeline-checks.test.ts` — Expected: FAIL, modules not found.
- [ ] **Step 5: Write the implementations**, reusing `ContextEngineFactory`/`avviaGenerazioneDataDriven`/`avviaInvioNotificheDataDriven` exactly as `src/config/Bootstrap.ts`/`src/entrypoints/EntryPoints.ts` already call them — no new orchestration logic, just wiring + throw-based assertions.
- [ ] **Step 6: Run tests to verify they pass** — same command — Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/checks/contextEngineChecks.ts src/onlinetests/checks/pipelineChecks.ts test/unit/onlinetests/context-engine-checks.test.ts test/unit/onlinetests/pipeline-checks.test.ts
git commit -m "feat(onlinetests): add context-engine CDU assembly and document/email pipeline checks"
```

### Task B6: `runOnlineTests` entry point and GAS global export

**Files:**
- Create: `src/onlinetests/index.ts`
- Test: `test/unit/onlinetests/index.test.ts`

**Interfaces:**
- Produces: `executeOnlineTests(): OnlineTestReport` — builds the sample database (Task B2+B3), temporarily points `PROP_MASTER_SPREADSHEET_ID` at it via the real `ScriptPropertiesFacade` (recording and logging, not restoring, the prior value per the design's "left in place" decision — actually per spec: "only *set*, never destructively overwriting a pre-existing value without recording the prior one first" — so: read the current value first, `Logger.log` it if non-empty as `"Previous MASTER_SPREADSHEET_ID before online-test override: <value>"`, then set the new one), calls `initAldo()`, and runs all of B4/B5's `register*Checks` against one shared `TestRunner`, returning `runner.report()`. `runOnlineTests(): void` calls `executeOnlineTests()` and `Logger.log(JSON.stringify(report))`, then assigns itself to `globalThis` exactly like every other GAS entry point in `src/index.ts`/`src/entrypoints/EntryPoints.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { executeOnlineTests } from '../../../src/onlinetests/index';

describe('executeOnlineTests', () => {
  it('builds a sample database, initializes ALDO against it, and returns a report combining every check group', () => {
    // inject fakes for SampleDatabaseBuilder's deps and a fake ScriptPropertiesFacade;
    // assert the returned report.suite === 'aldo-online-tests' and report.results
    // includes entries from repositoryChecks, contextEngineChecks, and pipelineChecks
    // (assert by name-substring, not exact count, so this test doesn't need to
    // enumerate every individual check)
  });

  it('logs the previous MASTER_SPREADSHEET_ID value when one was already set, and never overwrites it silently', () => {
    const logger = { log: jest.fn() };
    // inject a properties fake whose get(PROP_MASTER_SPREADSHEET_ID) returns 'OLD_ID'
    // assert logger.log (or whatever this file's real logging seam is) was called
    // with a message containing 'OLD_ID'
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/index.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Write the implementation** `src/onlinetests/index.ts`, wiring B1-B5 together plus the `PROP_MASTER_SPREADSHEET_ID` read/log/set sequence via `ScriptPropertiesFacade`/`PROP_MASTER_SPREADSHEET_ID` imported from `src/config/Bootstrap.ts`.
- [ ] **Step 4: Run test to verify it passes** — Run: `npx jest --config jest.config.cjs test/unit/onlinetests/index.test.ts` — Expected: PASS.
- [ ] **Step 5: Add the `runOnlineTests` GAS global export** at the bottom of `src/onlinetests/index.ts`:

```ts
export function runOnlineTests(): void {
  const report = executeOnlineTests();
  Logger.log(JSON.stringify(report));
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).runOnlineTests = runOnlineTests;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
```

- [ ] **Step 6: Run lint/typecheck** — Run: `npm run lint && npx tsc --noEmit` — Expected: clean (the direct `Logger.log` call here is a sanctioned exception — check `GasLibraryFactory/CLAUDE.md`'s documented narrow exceptions list for `Logger`, matching how `src/index.ts`/existing code already handles any similar top-level GAS-global call, if any; if `Logger` isn't already an established exception elsewhere in `src/`, route it through a facade instead of calling it directly here).
- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/index.ts test/unit/onlinetests/index.test.ts
git commit -m "feat(onlinetests): add executeOnlineTests orchestration and runOnlineTests GAS entry point"
```

---

## Part C — `online` build mode

### Task C1: Third webpack entry for `src/onlinetests/index.ts`

**Files:**
- Modify: `webpack.config.cjs`

- [ ] **Step 1: Read `webpack.config.cjs` in full** (already read during planning — reproduced above in the design context) to copy `entrypointsConfig`'s shape exactly.
- [ ] **Step 2: Add a third config object**, `onlinetestsConfig`, after `entrypointsConfig`:

```js
  // Online GAS test suite (docs/superpowers/specs/2026-07-11-offline-online-test-expansion-design.md):
  // always its own output file, never concatenated into Code.js, so it can be
  // pushed or removed from the Apps Script project independently of app code.
  const onlinetestsConfig = {
    name: 'onlinetests',
    mode: 'production',
    entry: './src/onlinetests/index.ts',
    devtool: 'source-map',
    output: {
      filename: 'OnlineTests.js',
      path: path.resolve(__dirname, 'dist'),
      clean: false,
      iife: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [babelRule] },
    optimization: { minimize: false }
  };

  return [coreConfig, entrypointsConfig, onlinetestsConfig];
```

(Replace the existing `return [coreConfig, entrypointsConfig];` line with the version above that also returns `onlinetestsConfig`.)

- [ ] **Step 3: Verify the entry builds standalone** — Run: `npx webpack --env readable` — Expected: `dist/OnlineTests.js` and `dist/OnlineTests.js.map` are produced alongside the existing `aldo-core.js`/`EntryPoints.js`, with no errors.
- [ ] **Step 4: Commit**

```bash
git add webpack.config.cjs
git commit -m "build: add a third webpack entry producing dist/OnlineTests.js"
```

### Task C2: `online` build mode in `build-and-prepare.cjs` — Code.js comment-stripping (no minify)

**Files:**
- Modify: `scripts/build-and-prepare.cjs`

- [ ] **Step 1: Add `'online'` to the valid-modes check**:

```js
if (!['production', 'testing', 'testoffline', 'online'].includes(mode)) {
  console.error(
    `${c.red}Error: Invalid mode "${mode}". Use --mode=production, --mode=testing, --mode=testoffline, or --mode=online${c.reset}`
  );
  process.exit(1);
}
```

- [ ] **Step 2: Extend the webpack-command selection** — `online` uses the same readable path as `testing`/`testoffline` (unminified structure) — the existing line `const webpackCmd = mode === 'production' ? 'npx webpack' : 'npx webpack --env readable';` already covers this (no change needed) — confirm by reading it again after Task C1's changes.
- [ ] **Step 3: Extend `TOTAL_STEPS`** to account for the new mode's extra "strip comments from OnlineTests.js" and "generate gas-source-map.json" work by adding one step: `const TOTAL_STEPS = mode === 'testing' ? 9 : mode === 'online' ? 11 : 10;` (online gets: the existing 8 shared steps + comments-only pass reporting + gas-source-map.json generation + summary — exact accounting finalized once Task C3/C4 land; if the step count doesn't match by the time this task is done, adjust the ternary and every `step(n, TOTAL_STEPS, ...)` call site accordingly rather than leaving a mismatched counter).
- [ ] **Step 4: After the existing "Compose GAS deployment file(s)" step's `else` branch** (the one used by `testing`/`testoffline` today), add an `online`-specific branch that composes `Code.js` the same way (`prelude + core + entrypoints`) but then runs the comments-only Terser pass:

```js
  } else if (mode === 'online') {
    const entrypoints = fs.readFileSync(entryPointsBundle, 'utf8');
    const combined = prelude + '\n;\n' + core + '\n;\n' + entrypoints;
    let stripped;
    try {
      stripped = minify_sync(combined, { compress: false, mangle: false, format: { comments: false, beautify: true } });
    } catch (e) {
      fail(`Failed to strip comments from combined online-mode bundle: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    if (typeof stripped.code !== 'string') {
      fail('Failed to strip comments from combined online-mode bundle: no code produced');
      process.exit(1);
    }
    fs.writeFileSync(codeJsPath, stripped.code, 'utf8');
    ok('Wrote dist/Code.js (vendor + ALDO core + entry points, unminified structure, comments stripped)');
    fs.rmSync(aldoCoreBundle, { force: true });
    fs.rmSync(aldoCoreBundle + '.map', { force: true });
    fs.rmSync(entryPointsBundle, { force: true });
    fs.rmSync(entryPointsBundle + '.map', { force: true });

    const onlineTestsBundle = path.join(distDir, 'OnlineTests.js');
    if (!fs.existsSync(onlineTestsBundle)) {
      fail('dist/OnlineTests.js was not produced by Webpack');
      process.exit(1);
    }
    const onlineTestsSrc = fs.readFileSync(onlineTestsBundle, 'utf8');
    let strippedTests;
    try {
      strippedTests = minify_sync(onlineTestsSrc, { compress: false, mangle: false, format: { comments: false, beautify: true } });
    } catch (e) {
      fail(`Failed to strip comments from OnlineTests.js: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    if (typeof strippedTests.code !== 'string') {
      fail('Failed to strip comments from OnlineTests.js: no code produced');
      process.exit(1);
    }
    fs.writeFileSync(onlineTestsBundle, strippedTests.code, 'utf8');
    ok('Wrote dist/OnlineTests.js (unminified structure, comments stripped, kept separate from Code.js)');
  } else {
```

(This slots in as an `else if` between the existing `if (mode === 'production')` branch and the existing plain `else` branch used by `testing`/`testoffline`.)

- [ ] **Step 5: Run the build** — Run: `npm run build:online` (added in Task C5) or directly `node scripts/build-and-prepare.cjs --mode=online` — Expected: completes without error, `dist/Code.js` and `dist/OnlineTests.js` both exist.
- [ ] **Step 6: Manually inspect both files for comment-stripping and non-minification** — Run: `grep -c '/\*\*' dist/Code.js dist/OnlineTests.js` — Expected: `0` for both; Run: `awk '{ total += length($0); count++ } END { print total/count }' dist/OnlineTests.js` — Expected: average line length well under ~200 (readable, not minified onto few giant lines).
- [ ] **Step 7: Commit**

```bash
git add scripts/build-and-prepare.cjs
git commit -m "build: add online mode producing unminified, comment-stripped Code.js and OnlineTests.js"
```

### Task C3: `gas-source-map.json` generation

**Files:**
- Modify: `scripts/build-and-prepare.cjs`
- Modify: `package.json` (add the `source-map` dependency)

- [ ] **Step 1: Add the `source-map` package** — Run: `npm install --save-dev source-map` — Expected: `package.json`/`package-lock.json` updated, install succeeds.
- [ ] **Step 2: Insert a new build step (only for `mode === 'online'`)**, placed right after the existing "Generating source map index" step (before the "Build summary" step), that reads `dist/aldo-core.js.map`/`dist/EntryPoints.js.map`/`dist/OnlineTests.js.map` (captured into local variables *before* Task C2's `fs.rmSync` calls delete them — adjust Task C2 to skip deleting the `.map` files when `mode === 'online'`, since this step needs them) via the `source-map` package's `SourceMapConsumer`, iterating each map's mappings and emitting one entry per encountered original line boundary:

```js
step(9, TOTAL_STEPS, 'Generating gas-source-map.json (online mode)...');

if (mode === 'online') {
  const { SourceMapConsumer } = require('source-map');
  const gasMapEntries = [];

  async function indexMap(generatedFileLabel, mapPath) {
    if (!fs.existsSync(mapPath)) {
      warn(`No source map found at ${mapPath} — skipping`);
      return;
    }
    const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    await SourceMapConsumer.with(rawMap, null, (consumer) => {
      const seen = new Set();
      consumer.eachMapping((m) => {
        if (m.source === null || m.originalLine === null) return;
        const originalFile = m.source.replace(/^webpack:\/\/aldo-sgsa\//, '').replace(/^\.\//, '');
        if (originalFile.startsWith('node_modules/') || originalFile.startsWith('webpack/')) return;
        const key = `${m.generatedLine}:${originalFile}:${m.originalLine}`;
        if (seen.has(key)) return;
        seen.add(key);
        gasMapEntries.push({
          file: generatedFileLabel,
          generatedLine: m.generatedLine,
          originalFile,
          originalLine: m.originalLine
        });
      });
    });
  }

  // NOTE: build-and-prepare.cjs is otherwise fully synchronous top-to-bottom;
  // this is the one seam that needs awaiting, so it's wrapped and invoked below.
  await indexMap('Code.js', path.join(distDir, 'aldo-core.js.map'));
  await indexMap('Code.js', path.join(distDir, 'EntryPoints.js.map'));
  await indexMap('OnlineTests.js', path.join(distDir, 'OnlineTests.js.map'));

  gasMapEntries.sort((a, b) => a.file.localeCompare(b.file) || a.generatedLine - b.generatedLine);
  fs.writeFileSync(path.join(distDir, 'gas-source-map.json'), JSON.stringify(gasMapEntries, null, 2), 'utf8');
  ok(`Generated gas-source-map.json (${gasMapEntries.length} entries)`);

  // .map files are no longer needed after indexing — remove them same as other modes
  for (const p of [path.join(distDir, 'aldo-core.js.map'), path.join(distDir, 'EntryPoints.js.map'), path.join(distDir, 'OnlineTests.js.map')]) {
    fs.rmSync(p, { force: true });
  }
}
```

- [ ] **Step 3: Make the script's top-level execution `async`-compatible** — since `build-and-prepare.cjs` currently runs as a flat top-to-bottom script (no wrapping function), wrap the whole file body in an `async function main() { ... } main();` (or, more surgically, wrap only from this new step onward) so the `await indexMap(...)` calls above are valid — read the full current file structure first (already read during planning) and choose the minimal-diff wrapping that keeps every existing synchronous step's behavior identical.
- [ ] **Step 4: Adjust Task C2's cleanup** — in the `online`-mode branch, do not `fs.rmSync` the three `.map` files at that point; let this task's Step 2 do it after indexing.
- [ ] **Step 5: Run the build** — Run: `node scripts/build-and-prepare.cjs --mode=online` — Expected: `dist/gas-source-map.json` is produced, valid JSON, non-empty, and no `.map` files remain in `dist/` afterward.
- [ ] **Step 6: Validate content** — Run: `node -e "const m=require('./dist/gas-source-map.json'); console.log(m.length, m[0])"` — Expected: a positive count and a well-formed `{ file, generatedLine, originalFile, originalLine }` object.
- [ ] **Step 7: Commit**

```bash
git add scripts/build-and-prepare.cjs package.json package-lock.json
git commit -m "build: generate gas-source-map.json mapping Code.js/OnlineTests.js lines back to original TS source"
```

### Task C4: Online-mode build summary + offline pre-push test gate

**Files:**
- Modify: `scripts/build-and-prepare.cjs`

- [ ] **Step 1: Extend the info banner at the top** (the `if (mode === 'testoffline') { ... } else if (mode === 'production') { ... } else { ... }` block near the top) with an `online`-specific message:

```js
} else if (mode === 'online') {
  info(`Code.js:      Vendor + ALDO core + ALDO entry points, merged, unminified structure, comments stripped`);
  info(`OnlineTests.js: ALDO online GAS test suite, separate file, unminified structure, comments stripped`);
  info(`gas-source-map.json: Line-level map from both output files back to original src/**/*.ts`);
  info(`Offline tests: Will run after build (unit + integration), as a pre-push sanity gate`);
} else if (mode === 'testoffline') {
```

- [ ] **Step 2: Reuse the existing `testoffline` offline-test-running block for `online` too** — change `if (mode === 'testoffline') {` (the block that runs `npx jest --config jest.config.cjs` and `jest.integration.config.cjs`) to `if (mode === 'testoffline' || mode === 'online') {`.
- [ ] **Step 3: Extend the final summary section** similarly (`if (mode === 'testoffline')` → include `online`) so `online` mode reports `Offline tests: PASSED/FAILED` in its summary the same way `testoffline` does.
- [ ] **Step 4: Run the full build end-to-end** — Run: `npm run build:online` (once Task C5 adds the script) or `node scripts/build-and-prepare.cjs --mode=online` — Expected: builds, runs offline tests, reports PASSED, exits 0.
- [ ] **Step 5: Commit**

```bash
git add scripts/build-and-prepare.cjs
git commit -m "build: run offline tests as a pre-push gate in online mode and extend build summary reporting"
```

### Task C5: npm scripts + `.claspignore` review

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the two new scripts** next to the existing `build:testoffline`/`push:testing`:

```json
    "build:online": "node scripts/build-and-prepare.cjs --mode=online",
    "push:online": "npm run build:online && clasp push",
```

- [ ] **Step 2: Confirm the existing `.claspignore` content** (written by the "Configuring deployment files" step) still makes sense for `online` mode — it already excludes `*.map`, `source-map-index.json`, `test-file-map.json` — add `gas-source-map.json` to that list too so it isn't pushed to Apps Script (it's a local debugging aid, not runtime code): find the `claspignore` template string in `scripts/build-and-prepare.cjs` and add a `gas-source-map.json` line.
- [ ] **Step 3: Run the build once more** — Run: `npm run build:online` — Expected: `dist/.claspignore` includes `gas-source-map.json`; `dist/Code.js`, `dist/OnlineTests.js`, `dist/gas-source-map.json`, `dist/appsscript.json`, `dist/.claspignore` all present.
- [ ] **Step 4: Commit**

```bash
git add package.json scripts/build-and-prepare.cjs
git commit -m "build: add build:online/push:online npm scripts and exclude gas-source-map.json from clasp push"
```

### Task C6: Automated smoke check for the online build mode

**Files:**
- Create: `test/build/online-mode.smoke.test.ts`
- Modify: `jest.integration.config.cjs` (or add a dedicated `jest.build.config.cjs` if mixing a slow shell-invoking test into the integration config is undesirable — check `jest.integration.config.cjs`'s `roots`/`testMatch` first and decide the minimal-diff option)

**Interfaces:**
- Consumes: Node's `child_process.execSync` to run `node scripts/build-and-prepare.cjs --mode=online`, then filesystem assertions on `dist/`.

- [ ] **Step 1: Decide config placement** — Read `jest.integration.config.cjs`; if its `roots: ['<rootDir>/test/integration']` would need broadening, instead create `jest.build.config.cjs` (copy of the integration config with `roots: ['<rootDir>/test/build']`) and a new `"test:build": "jest --config jest.build.config.cjs"` npm script, rather than repurposing the integration config for a much-slower build-invoking test.
- [ ] **Step 2: Write the test**

```ts
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('online build mode', () => {
  it('produces a distinct, unminified, comment-free Code.js and OnlineTests.js plus a valid gas-source-map.json', () => {
    execSync('node scripts/build-and-prepare.cjs --mode=online', { cwd: resolve(__dirname, '../..'), stdio: 'pipe' });

    const distDir = resolve(__dirname, '../../dist');
    const codeJs = readFileSync(resolve(distDir, 'Code.js'), 'utf8');
    const onlineTestsJs = readFileSync(resolve(distDir, 'OnlineTests.js'), 'utf8');

    expect(codeJs).not.toContain('/**');
    expect(onlineTestsJs).not.toContain('/**');
    expect(codeJs).not.toEqual(onlineTestsJs);

    const avgLineLen = (s: string) => s.length / (s.split('\n').length || 1);
    expect(avgLineLen(codeJs)).toBeLessThan(200);
    expect(avgLineLen(onlineTestsJs)).toBeLessThan(200);

    const mapPath = resolve(distDir, 'gas-source-map.json');
    expect(existsSync(mapPath)).toBe(true);
    const map = JSON.parse(readFileSync(mapPath, 'utf8')) as unknown[];
    expect(map.length).toBeGreaterThan(0);
  }, 120_000);
});
```

- [ ] **Step 3: Run it** — Run: `npx jest --config jest.build.config.cjs` (or the config decided in Step 1) — Expected: PASS (this actually invokes the real build, so it's slow — ~10-30s — that's expected and acceptable for a build-verification test, not part of the fast `npm test` loop).
- [ ] **Step 4: Add the new script to `package.json`** if a dedicated config was created in Step 1.
- [ ] **Step 5: Commit**

```bash
git add test/build/online-mode.smoke.test.ts jest.build.config.cjs package.json
git commit -m "test: add an end-to-end smoke test for the online build mode's output shape"
```

---

## Final verification checklist

- [ ] **Step 1:** Run: `npm test && npm run test:integration` — Expected: all green.
- [ ] **Step 2:** Run: `npm run lint && npm run typecheck` — Expected: clean.
- [ ] **Step 3:** Run: `npm run build:production` — Expected: still succeeds, unaffected by this plan's changes (verifies no regression to the existing split-build design).
- [ ] **Step 4:** Run: `npm run build:online` — Expected: succeeds, offline tests reported PASSED, `dist/Code.js`, `dist/OnlineTests.js`, `dist/gas-source-map.json` all present.
- [ ] **Step 5:** Manually push and run online (requires live credentials — hand off to the user): `npm run push:online`, then open the Apps Script editor, run `runOnlineTests` from the Run dropdown, and paste the `Logger.log` JSON output back for review.
