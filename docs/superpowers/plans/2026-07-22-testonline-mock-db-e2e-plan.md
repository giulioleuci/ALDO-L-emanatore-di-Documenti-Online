# testonline Mock DB + E2E Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a persistent, real mock SGSA database (3 classi/~60 alunni/20 docenti, one class articolata 8+12) and real Drive templates, and drive 7 end-to-end document-generation + `TEST_MODE`-gated email scenarios against them through ALDO's real pipelines under the existing `online` build mode.

**Architecture:** Add `{{dynamic_rows[...]}}` to GasLibraryFactory's `SheetProcessor` (vertical mirror of the existing `{{dynamic_columns[...]}}`), a new `FOGLIO_GENERICO` generator strategy, an `IDriveFacade.findFileByName` primitive, a new `E2eSampleDatabaseBuilder` + `E2eTemplateProvisioner` (both offline-testable via injected ports, real GAS-backed implementations only touch native APIs inside `src/onlinetests/`), and a new `executeE2eScenarios()`/`runE2eScenarios()` entry point registering 7 checks, sibling to the existing `executeOnlineTests()`.

**Tech Stack:** TypeScript (ALDO), JavaScript ES modules (GasLibraryFactory), Jest/ts-jest, Google Apps Script V8, `GasOnlineTestFramework` (real-GAS check runner).

## Global Constraints

- **Depends on Plan 1** (`2026-07-22-test-mode-email-redirect-plan.md`): `COL_MASTER.TEST_MODE` and `MasterConfig.testMode` must exist before Task 6 of this plan. If Plan 1 isn't done yet, do it first.
- Native GAS globals only inside `GoogleApiWrapper` (L2) or `src/onlinetests/**` (sanctioned exception, same as `GasSampleSpreadsheetFactory.ts` today — but even there, prefer composing existing vendored/port methods over raw API calls, matching that file's existing "no direct SpreadsheetApp/Sheet API calls" discipline).
- Never hand-edit `dist/*` or `vendor/gaslibs.Code.js`.
- All 7 scenarios must go through `MASTER.TEST_MODE = true` — the email-sending checks (scenarios 4-7) must refuse to run if the mock master's `testMode` isn't `true` (never risk a real send).
- `Object.values(COL_X)` is this codebase's convention for a table's header row (see `SampleDatabaseBuilder.ts:73-97`) — the new builder follows it.
- Boolean columns parse as `data[COL] === true` (existing convention, Plan 1's Global Constraints) — fixture rows must write literal `true`/`false`, not strings.

---

## Task 1: GasLibraryFactory — `{{dynamic_rows[...]}}` placeholder

**Files:**
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/SheetProcessor.js`
- Create: `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/__tests__/SheetProcessor.dynamicRows.test.js`
- Modify: `GasLibraryFactory/DOCS_LIBS/WorkspaceTemplateEngine_docs.md`

**Interfaces:**
- Produces: `SheetProcessor.prototype._prepareDynamicRowRequests(sheetName, startRow, startColumn, placeholder, context): { valueRequests: Object[] }` and a new dispatch branch in `process()` for `{{dynamic_rows[...]}}` cells.

- [ ] **Step 1: Write the failing test**

Create `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/__tests__/SheetProcessor.dynamicRows.test.js`:

```js
/**
 * @fileoverview Tests for SheetProcessor dynamic_rows expansion (vertical mirror of dynamic_columns)
 */

import { SheetProcessor } from '../SheetProcessor.js';

describe('SheetProcessor - Dynamic Rows Tests', () => {
  let processor;
  let mockPlaceholderService;
  let mockSpreadsheetService;
  let mockMustache;
  let mockLogger;

  beforeEach(() => {
    mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    mockMustache = {
      render: jest.fn((template, context) => {
        return template.replace(/{{(\w+)}}/g, (match, key) => context[key] || match);
      }),
      getValue: jest.fn((path, context) => {
        if (!context) return undefined;
        return context[path];
      })
    };
    mockSpreadsheetService = {
      getSheetInfo: jest.fn(),
      getRanges: jest.fn(),
      updateRanges: jest.fn(),
      expandSheetGrid: jest.fn(),
      getProtectedRanges: jest.fn(),
      deleteProtectedRanges: jest.fn(),
      protectRanges: jest.fn()
    };
    mockPlaceholderService = { mustache: mockMustache, logger: mockLogger };
    processor = new SheetProcessor(mockPlaceholderService);
    processor.spreadsheetService = mockSpreadsheetService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('_prepareDynamicRowRequests()', () => {
    it('expands one row per array item, downward from the placeholder cell', () => {
      const context = {
        studenti: [{ nome: 'Alice' }, { nome: 'Bob' }, { nome: 'Carla' }]
      };
      const placeholder = '{{dynamic_rows[source=studenti, value=nome]}}';
      mockMustache.getValue.mockImplementation((path, ctx) => (ctx ? ctx[path] : undefined));

      const { valueRequests } = processor._prepareDynamicRowRequests(
        'Sheet1',
        5,
        2,
        placeholder,
        context // starts at row 5, column 2 (B5)
      );

      expect(valueRequests).toHaveLength(4); // clear + 3 students
      expect(valueRequests[0]).toEqual({ range: "'Sheet1'!B5", values: [['']] }); // clear placeholder
      expect(valueRequests[1]).toEqual({ range: "'Sheet1'!B5", values: [['Alice']] });
      expect(valueRequests[2]).toEqual({ range: "'Sheet1'!B6", values: [['Bob']] });
      expect(valueRequests[3]).toEqual({ range: "'Sheet1'!B7", values: [['Carla']] });
    });

    it('handles a non-array data source: no requests, a warning, no clear-cell request', () => {
      const context = { studenti: 'not an array' };
      const placeholder = '{{dynamic_rows[source=studenti, value=nome]}}';

      const { valueRequests } = processor._prepareDynamicRowRequests(
        'Sheet1',
        5,
        2,
        placeholder,
        context
      );

      expect(valueRequests).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Data source 'studenti' for dynamic_rows is not an array."
      );
    });

    it('handles an empty array: clear the placeholder, no data rows', () => {
      const context = { studenti: [] };
      const placeholder = '{{dynamic_rows[source=studenti, value=nome]}}';
      mockMustache.getValue.mockImplementation((path, ctx) => (ctx ? ctx[path] : undefined));

      const { valueRequests } = processor._prepareDynamicRowRequests(
        'Sheet1',
        5,
        2,
        placeholder,
        context
      );

      expect(valueRequests).toEqual([{ range: "'Sheet1'!B5", values: [['']] }]);
    });

    it('handles an invalid placeholder string: no requests, a warning', () => {
      const { valueRequests } = processor._prepareDynamicRowRequests(
        'Sheet1',
        1,
        1,
        '{{dynamic_rows[not valid}}',
        {}
      );
      expect(valueRequests).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid dynamic_rows placeholder: {{dynamic_rows[not valid}}'
      );
    });

    it('writes an ERROR cell instead of throwing when getValue throws', () => {
      mockMustache.getValue.mockImplementation(() => {
        throw new Error('boom');
      });
      const placeholder = '{{dynamic_rows[source=studenti, value=nome]}}';

      const { valueRequests } = processor._prepareDynamicRowRequests(
        'Sheet1',
        1,
        1,
        placeholder,
        { studenti: [] }
      );

      expect(valueRequests).toEqual([{ range: "'Sheet1'!A1", values: [['ERROR: boom']] }]);
    });
  });

  describe('process() Integration', () => {
    it('dispatches a {{dynamic_rows[...]}} cell to _prepareDynamicRowRequests and applies it in the batch update', () => {
      mockSpreadsheetService.getSheetInfo.mockReturnValue([{ name: 'Sheet1', id: 1 }]);
      mockSpreadsheetService.getRanges.mockReturnValue([
        ['{{dynamic_rows[source=s, value=v]}}']
      ]);

      const context = { s: [{ v: 'Row1' }, { v: 'Row2' }] };
      mockMustache.getValue.mockImplementation((path, ctx) => (ctx ? ctx[path] : undefined));

      processor.process('sheetId123', context, null);

      expect(mockSpreadsheetService.updateRanges).toHaveBeenCalledWith(
        'sheetId123',
        expect.arrayContaining([
          { range: "'Sheet1'!A1", values: [['Row1']] },
          { range: "'Sheet1'!A2", values: [['Row2']] }
        ])
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `GasLibraryFactory/`): `npx jest WorkspaceTemplateEngine/src/processors/__tests__/SheetProcessor.dynamicRows.test.js`
Expected: FAIL — `processor._prepareDynamicRowRequests is not a function`

- [ ] **Step 3: Implement `_prepareDynamicRowRequests`**

In `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/SheetProcessor.js`, add this method immediately after `_prepareDynamicColumnRequests` (after line 343, before `_applyProtections`):

```js
  /**
   * @description Generates batch update requests for vertical (row-wise) array expansion.
   * Parses `{{dynamic_rows[source=...,value=...]}}` syntax — the vertical mirror of
   * `{{dynamic_columns[...]}}`: one row per source-array item, downward from the placeholder
   * cell. Single-group only (no multi-group, no acl/scope) — deliberately smaller than
   * dynamic_columns since no caller needs per-row protection or multiple sequential groups.
   * @param {string} sheetName Target sheet name.
   * @param {number} startRow Starting row index (1-based).
   * @param {number} startColumn Starting column index (1-based).
   * @param {string} placeholder Raw placeholder string.
   * @param {Object} context Data context.
   * @returns {{valueRequests: Object[]}} Batch value-update requests.
   * @private
   */
  _prepareDynamicRowRequests(sheetName, startRow, startColumn, placeholder, context) {
    try {
      const match = placeholder.match(/{{dynamic_rows\[(.*?)\]}}/);
      if (!match) {
        this.logger.warn(`Invalid dynamic_rows placeholder: ${placeholder}`);
        return { valueRequests: [] };
      }

      const params = this._parseDynamicColumnParams(match[1]);
      if (!params.source) {
        this.logger.warn(`Missing 'source' parameter in dynamic_rows: ${placeholder}`);
        return { valueRequests: [] };
      }

      const sourceData = this.mustache.getValue(params.source, context);
      if (!Array.isArray(sourceData)) {
        this.logger.warn(`Data source '${params.source}' for dynamic_rows is not an array.`);
        return { valueRequests: [] };
      }

      const valueRequests = [];
      const quotedSheetName = `'${sheetName}'`;
      const colLetter = this._columnToLetter(startColumn);

      // Clear placeholder cell
      const rangePlaceholder = this._rangeToA1(startRow, startColumn, startRow, startColumn);
      valueRequests.push({ range: `${quotedSheetName}!${rangePlaceholder}`, values: [['']] });

      sourceData.forEach((item, index) => {
        const row = startRow + index;
        const cellValue = params.value ? this.mustache.getValue(params.value, item) : '';
        const resolvedValue = cellValue ?? '';
        valueRequests.push({
          range: `${quotedSheetName}!${colLetter}${row}`,
          values: [[resolvedValue]]
        });
      });

      this.logger.debug(`Prepared ${valueRequests.length} value updates for dynamic rows.`);
      return { valueRequests };
    } catch (e) {
      this.logger.error(`Error preparing dynamic rows: ${e.message}`);
      const errorCellA1 = this._rangeToA1(startRow, startColumn, startRow, startColumn);
      return {
        valueRequests: [
          { range: `'${sheetName}'!${errorCellA1}`, values: [[`ERROR: ${e.message}`]] }
        ]
      };
    }
  }
```

- [ ] **Step 4: Dispatch to it from `process()`**

In `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/SheetProcessor.js`, add a new `else if` branch to the dispatch chain inside `process()` (lines 88-113), immediately after the `{{dynamic_columns` branch (after line 106, before the final `else`):

```js
          } else if (originalValue.includes('{{dynamic_rows')) {
            this.logger.debug(`Found dynamic rows in ${cellA1}: ${originalValue}`);
            const { valueRequests } = this._prepareDynamicRowRequests(
              sheet.name,
              row,
              column,
              originalValue,
              context
            );
            batchRequests.push(...valueRequests);
          } else if (originalValue.includes('{{dynamic_columns')) {
```

(This reorders the existing `{{dynamic_columns` check to come after the new branch — the two prefixes don't overlap as substrings, so order between them doesn't matter functionally, but keep the diff minimal: insert the new `else if` block **before** the existing `} else if (originalValue.includes('{{dynamic_columns'))` line, i.e. the existing dynamic_columns branch's opening `} else if (originalValue.includes('{{dynamic_columns')) {` line becomes the *second* condition in the chain, unchanged internally — only a new branch is spliced in above it.)

- [ ] **Step 5: Run test to verify it passes**

Run (from `GasLibraryFactory/`): `npx jest WorkspaceTemplateEngine/src/processors/__tests__/SheetProcessor.dynamicRows.test.js`
Expected: PASS

- [ ] **Step 6: Run the existing dynamic_columns suite to confirm no regression**

Run: `npx jest WorkspaceTemplateEngine/src/processors/__tests__/SheetProcessor.dynamicColumns.test.js`
Expected: PASS (unchanged)

- [ ] **Step 7: Document it**

In `GasLibraryFactory/DOCS_LIBS/WorkspaceTemplateEngine_docs.md`, add a new section after the existing `## 📐 Placeholder {{dynamic_columns[...]}} (Google Sheets)` section (after line 93, before the closing `---`/`_Parte dello stack GasLibraryFactory_`):

```markdown
## 📐 Placeholder `{{dynamic_rows[...]}}` (Google Sheets)

Espande verticalmente, a partire dalla cella del placeholder, una riga per ciascun
elemento di un array del context — il mirror verticale di `{{dynamic_columns[...]}}`.
Gestito da `SheetProcessor._prepareDynamicRowRequests`. Solo sintassi a gruppo
singolo: nessun multi-gruppo, nessun `acl`/`scope` (nessun caso d'uso li richiede
oggi — YAGNI rispetto a `dynamic_columns`).

```
{{dynamic_rows[source=alunni,value=cognomeNome]}}
```

- `source` — percorso (risolto via `mustache.getValue`) di un array nel context.
- `value` — espressione per-item (risolta contro il singolo elemento) usata come
  testo della cella in quella riga.

Se `source` non risolve a un array, il placeholder non produce alcuna richiesta
(stesso comportamento "warn, nessuna pulizia della cella" di `dynamic_columns`).
Un array vuoto pulisce solo la cella del placeholder.
```

- [ ] **Step 8: Commit**

```bash
cd "GasLibraryFactory" && git add WorkspaceTemplateEngine/src/processors/SheetProcessor.js WorkspaceTemplateEngine/src/processors/__tests__/SheetProcessor.dynamicRows.test.js DOCS_LIBS/WorkspaceTemplateEngine_docs.md && git commit -m "feat: add {{dynamic_rows[...]}} Sheet placeholder (vertical mirror of dynamic_columns)"
```

---

## Task 2: Vendor refresh + ambient types for `createDocument`/`createSpreadsheet`

**Files:**
- Modify: `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`
- Modify: `types/gaslibs/index.d.ts`

**Interfaces:**
- Produces: ambient `DocumentService.createDocument(name: string, options?: { destinationFolder?: string }): { documentId: string }` and `SpreadsheetService.createSpreadsheet(title: string, options?: { destinationFolder?: string }): { spreadsheetId: string, spreadsheetUrl?: string }`. Both already exist in the real vendored bundle today (pre-existing GasLibraryFactory feature, confirmed in `GoogleApiWrapper/src/internal/services-managers/DocumentBatchUpdateHandler.js:64` and `SpreadsheetHybridManager.js:19`) — the ambient `.d.ts` just never declared them because no ALDO code called them before this plan.

- [ ] **Step 1: Refresh the vendored bundle** (picks up Task 1's `dynamic_rows`)

Run (from ALDO root): `npm run refresh:vendor && npm run verify:vendor`
Expected: `vendor: refreshed gaslibs.Code.js (v..., sha256 ...)` then `vendor: checksum OK`

- [ ] **Step 2: Confirm both primitives are present in the bundle**

Run: `grep -c "createDocument" vendor/gaslibs.Code.js && grep -c "createSpreadsheet" vendor/gaslibs.Code.js && grep -c "dynamic_rows" vendor/gaslibs.Code.js`
Expected: three numbers, each `>= 1`

- [ ] **Step 3: Write the failing test**

In `test/unit/harness/gaslibs.test.ts`, add a new test after the existing `'vendored SpreadsheetService exposes...'` test (after line 170, before the `DocumentService` test at line 172):

```ts
test('vendored DocumentService/SpreadsheetService expose createDocument/createSpreadsheet (blank-artifact creation, no template to clone)', () => {
  const logger = new LoggerService();
  const fakeCache = { get: () => null, put: () => undefined, remove: () => undefined };
  const fakeExceptionService = { executeWithRetry: (fn: () => unknown) => fn() };
  const documents = new DocumentService(logger, fakeCache, new UtilsService(), fakeExceptionService);
  const sheets = new SpreadsheetService(
    logger,
    fakeCache,
    new UtilsService(),
    fakeExceptionService
  );
  expect(typeof documents.createDocument).toBe('function');
  expect(typeof sheets.createSpreadsheet).toBe('function');
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts`
Expected: FAIL — TypeScript compile error, `Property 'createDocument' does not exist on type 'DocumentService'` (and same for `createSpreadsheet`)

- [ ] **Step 5: Add the ambient types**

In `types/gaslibs/index.d.ts`, inside `class SpreadsheetService { ... }` (around line 832), add after `getSheetInfo` (after line 836):

```ts
    /** Creates a brand-new, empty spreadsheet (no template to clone) via the Advanced Sheets API. */
    createSpreadsheet(
      title: string,
      options?: { destinationFolder?: string; locale?: string; timeZone?: string }
    ): { spreadsheetId: string; spreadsheetUrl?: string };
```

Inside `class DocumentService { ... }` (around line 903), add after the `document(documentId)` method (after line 905):

```ts
    /** Creates a brand-new, empty document (no template to clone) via the Advanced Docs API. */
    createDocument(
      name: string,
      options?: { destinationFolder?: string }
    ): { documentId: string; builder: DocumentBuilder };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION types/gaslibs/index.d.ts test/unit/harness/gaslibs.test.ts
git commit -m "chore: vendor dynamic_rows and add ambient types for createDocument/createSpreadsheet"
```

---

## Task 3: `IDriveFacade.findFileByName`

**Files:**
- Modify: `src/infrastructure/facades/DriveServiceFacade.ts`
- Modify: `test/fakes/FakeDriveFacade.ts`
- Modify: `test/unit/infrastructure/drive-facade.test.ts`

**Interfaces:**
- Produces: `IDriveFacade.findFileByName(folderId: string, name: string): string | null` — composes the already-vendored `DriveService.searchFiles` (no GasLibraryFactory change needed; `searchFiles` already exists and is already used by `findFolderByPath`, `DriveServiceFacade.ts:41`).

- [ ] **Step 1: Write the failing test**

In `test/unit/infrastructure/drive-facade.test.ts`, add a new test after `'findFolderByPath walks segments...'` (after line 121, before `'copyFile delegates to copyFiles...'`):

```ts
test('findFileByName searches by name+parent, excluding folders and trashed files', () => {
  const { drive, perms } = fakeDrive();
  drive.searchFiles.mockImplementation((query: string) => {
    if (query.includes("'FOLDER_1' in parents") && query.includes("name = 'Verbale template'")) {
      return [{ id: 'tmpl_file_1', name: 'Verbale template', mimeType: 'application/vnd.google-apps.document' }];
    }
    return [];
  });
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(facade.findFileByName('FOLDER_1', 'Verbale template')).toBe('tmpl_file_1');
  expect(facade.findFileByName('FOLDER_1', 'Does not exist')).toBeNull();
  expect(drive.searchFiles).toHaveBeenCalledWith(
    "'FOLDER_1' in parents and name = 'Verbale template' and trashed=false",
    { maxResults: 1 }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts`
Expected: FAIL — `facade.findFileByName is not a function`

- [ ] **Step 3: Add `findFileByName` to `IDriveFacade` and implement it**

In `src/infrastructure/facades/DriveServiceFacade.ts`, add to the `IDriveFacade` interface (after the `getFileOwnerEmail` line added by Plan 1's Task 3):

```ts
  /** Finds a non-trashed file by exact name directly under `folderId`, or null if none matches. */
  findFileByName(folderId: string, name: string): string | null;
```

Add the implementation to `DriveServiceFacade`, after `findFolderByPath` (after line 46, before `createFolder`):

```ts
  findFileByName(folderId: string, name: string): string | null {
    const query = `'${folderId}' in parents and name = '${escapeQuery(name)}' and trashed=false`;
    const found = this.drive.searchFiles(query, { maxResults: 1 })[0];
    return found === undefined ? null : found.id;
  }
```

- [ ] **Step 4: Implement it on `FakeDriveFacade` too**

In `test/fakes/FakeDriveFacade.ts`, add a public field (after `public folders = new Map<string, string>();`):

```ts
  public files = new Map<string, string>(); // "folderId::name" -> fileId
```

Add the method after `findFolderByPath` (after `createFolder`, i.e. right before `copyFile`):

```ts
  findFileByName(folderId: string, name: string): string | null {
    return this.files.get(`${folderId}::${name}`) ?? null;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/facades/DriveServiceFacade.ts test/fakes/FakeDriveFacade.ts test/unit/infrastructure/drive-facade.test.ts
git commit -m "feat: add IDriveFacade.findFileByName"
```

---

## Task 4: `FoglioGenericoGeneratorStrategy`

**Files:**
- Create: `src/application/strategies/FoglioGenericoGeneratorStrategy.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `test/unit/application/generator-strategies.test.ts`

**Interfaces:**
- Consumes: `ITemplateEngine.processSheet(sheetId, context, sheetName?): SheetColumnLayout[]` (`src/infrastructure/facades/TemplateEngineFacade.ts:29-33`).
- Produces: `FoglioGenericoGeneratorStrategy implements GeneratorStrategy`, registered under `'FOGLIO_GENERICO'` in `strategyRegistry`.

- [ ] **Step 1: Write the failing test**

In `test/unit/application/generator-strategies.test.ts`, add the import (after line 1):

```ts
import { FoglioGenericoGeneratorStrategy } from '../../../src/application/strategies/FoglioGenericoGeneratorStrategy';
```

Add a new test after `'DocumentoGenericoGeneratorStrategy renders the whole CDU...'` (after line 60, before `describe('DocPersonalizzatoGeneratorStrategy (10 §9)', ...)`):

```ts
test('FoglioGenericoGeneratorStrategy renders the whole CDU into a Sheet with no extra structure', () => {
  const templates = new FakeTemplateEngine();
  const cdu = cduConPiani([]);
  new FoglioGenericoGeneratorStrategy(templates).render('sheet_1', cdu);
  expect(templates.sheetContextFor('sheet_1')).toEqual(cdu);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/generator-strategies.test.ts`
Expected: FAIL — cannot find module `'../../../src/application/strategies/FoglioGenericoGeneratorStrategy'`

- [ ] **Step 3: Create the strategy**

Create `src/application/strategies/FoglioGenericoGeneratorStrategy.ts`:

```ts
import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';

/**
 * FOGLIO_GENERICO generator (10 §9): plain `{{...}}` placeholder substitution over the CDU
 * via WorkspaceTemplateEngine's `processSheet`, with no additional structural logic — the
 * Sheet-output mirror of DOCUMENTO_GENERICO. Every structural need (e.g. a `{{dynamic_rows
 * [...]}}` student roster) is authored entirely in the Drive template itself; this strategy
 * never inspects `CONF_DOC.PARAMETRI` or the CDU beyond passing it through unchanged.
 */
export class FoglioGenericoGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly templates: ITemplateEngine) {}
  render(fileId: string, cdu: Cdu): void {
    this.templates.processSheet(fileId, cdu as unknown as Record<string, unknown>);
  }
}
```

- [ ] **Step 4: Register it in `Bootstrap.ts`**

In `src/config/Bootstrap.ts`, add the import after `import { DocumentoGenericoGeneratorStrategy } ...` (after line 20):

```ts
import { FoglioGenericoGeneratorStrategy } from '../application/strategies/FoglioGenericoGeneratorStrategy';
```

In the `strategyRegistry` construction (inside `c.register('strategyRegistry', () => { ... })`, the `registry` `Map` literal), add a new entry after `['DOCUMENTO_GENERICO', new DocumentoGenericoGeneratorStrategy(deps.templates)]`:

```ts
      ['DOCUMENTO_GENERICO', new DocumentoGenericoGeneratorStrategy(deps.templates)],
      ['FOGLIO_GENERICO', new FoglioGenericoGeneratorStrategy(deps.templates)],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/generator-strategies.test.ts`
Expected: PASS

- [ ] **Step 6: Add a Bootstrap registration test**

In `test/unit/config/bootstrap.test.ts`, add a new assertion inside the existing `test('container resolves every application service as a lazy singleton (08 §2, 12 §5)', ...)` — after line 93 (`expect(c.get('alberoCartelle')).toBeInstanceOf(AlberoCartelle);`), add:

```ts
  const registry = c.get<Map<string, unknown>>('strategyRegistry');
  expect(registry.has('FOGLIO_GENERICO')).toBe(true);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/application/strategies/FoglioGenericoGeneratorStrategy.ts src/config/Bootstrap.ts test/unit/application/generator-strategies.test.ts test/unit/config/bootstrap.test.ts
git commit -m "feat: add FOGLIO_GENERICO generator strategy"
```

---

## Task 5: `E2eSampleDatabaseBuilder`

**Files:**
- Create: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Create: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**
- Consumes: `ISampleSpreadsheetFactory`/`ISampleSpreadsheet` (`src/onlinetests/SampleDatabaseBuilder.ts:28-42`, reused unchanged), `IDriveFacade` (`createFolder`).
- Produces: `E2eSampleDatabaseBuilder.build(templateIds: E2eTemplateIds): E2eSampleDatabase`, plus exported constants (`CLASSE_A`, `CLASSE_B`, `CLASSE_C`, `CLASSE_C_PARTNER`, `e2eAlunnoEmail`, `e2eDocenteEmail`, `CARENZA_ALUNNO_1`, `CARENZA_ALUNNO_2`, `CONF_DOC_VERBALE`, `CONF_DOC_CONDOTTA`, `confDocPiano`, `CONF_MAIL_VERBALE`, `CONF_MAIL_CONDOTTA`, `CONF_MAIL_CARENZA`, `CONF_MAIL_PIANI`) that Task 7's checks import to know what was seeded.

- [ ] **Step 1: Write the failing test**

Create `test/unit/onlinetests/e2e-sample-database-builder.test.ts`:

```ts
import {
  E2eSampleDatabaseBuilder,
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARTNER,
  e2eAlunnoEmail,
  e2eDocenteEmail,
  CARENZA_ALUNNO_1,
  CARENZA_ALUNNO_2
} from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { TABLE, COL_CLASSI, COL_ALUNNI, COL_DOCENTI, COL_CARENZE, COL_MASTER, COL_CONF_DOC, COL_CONF_MAIL } from '../../../src/config/schema';

class RecordingSpreadsheet implements ISampleSpreadsheet {
  id: string;
  rows: Record<string, Record<string, unknown>[]> = {};
  constructor(id: string) {
    this.id = id;
  }
  addSheet(name: string): void {
    this.rows[name] = [];
  }
  appendRow(sheetName: string, row: Record<string, unknown>): void {
    (this.rows[sheetName] ??= []).push(row);
  }
  getUrl(): string {
    return `https://example.test/${this.id}`;
  }
}

function factory(): { spreadsheets: ISampleSpreadsheetFactory; sheets: Map<string, RecordingSpreadsheet> } {
  const sheets = new Map<string, RecordingSpreadsheet>();
  return {
    sheets,
    spreadsheets: {
      createSpreadsheet: (name: string) => {
        const s = new RecordingSpreadsheet(`id_${name}`);
        sheets.set(name, s);
        return s;
      }
    }
  };
}

const TEMPLATE_IDS = {
  verbale: 'tmpl_verbale',
  condotta: 'tmpl_condotta',
  piani: {
    PDP_DSA: 'tmpl_pdp_dsa',
    PDP_BES: 'tmpl_pdp_bes',
    PDP_STRANIERI: 'tmpl_pdp_stranieri',
    PEI: 'tmpl_pei',
    PFP: 'tmpl_pfp'
  }
};

test('seeds 4 CLASSI rows (2 plain, 1 articolata pair) and exactly 60 ALUNNI split 20/20/8/12', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const classi = sample.rows[TABLE.CLASSI]!;
  expect(classi.map((c) => c[COL_CLASSI.ID])).toEqual([CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER]);

  const alunni = sample.rows[TABLE.ALUNNI]!;
  expect(alunni).toHaveLength(60);
  const byClasse = (id: string) => alunni.filter((a) => a[COL_ALUNNI.CLASSE] === id).length;
  expect(byClasse(CLASSE_A)).toBe(20);
  expect(byClasse(CLASSE_B)).toBe(20);
  expect(byClasse(CLASSE_C)).toBe(8);
  expect(byClasse(CLASSE_C_PARTNER)).toBe(12);
  expect(result.sampleSpreadsheetId).toBe(sample.id);
});

test('seeds exactly 20 DOCENTI rows', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  expect(sample.rows[TABLE.DOCENTI]).toHaveLength(20);
  expect(sample.rows[TABLE.DOCENTI]!.map((d) => d[COL_DOCENTI.EMAIL])).toEqual(
    Array.from({ length: 20 }, (_, i) => e2eDocenteEmail(i + 1))
  );
});

test('seeds exactly 2 CARENZE rows, for the two designated students only', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const carenze = sample.rows[TABLE.CARENZE]!;
  expect(carenze).toHaveLength(2);
  expect(carenze.map((c) => c[COL_CARENZE.STUDENTE]).sort()).toEqual(
    [CARENZA_ALUNNO_1, CARENZA_ALUNNO_2].sort()
  );
  expect(CARENZA_ALUNNO_1).toBe(e2eAlunnoEmail(1));
  expect(CARENZA_ALUNNO_2).toBe(e2eAlunnoEmail(21));
});

test('MASTER row has TEST_MODE = true', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const master = sheets.get('_ALDO_E2E_MASTER')!;
  expect(master.rows[TABLE.MASTER]![0]![COL_MASTER.TEST_MODE]).toBe(true);
});

test('seeds 7 CONF_DOC rows (1 verbale + 1 condotta + 5 piani) each pointing at its provisioned template', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confDoc = sample.rows[TABLE.CONF_DOC]!;
  expect(confDoc).toHaveLength(7);
  const verbale = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'VERBALE_CDC')!;
  expect(JSON.parse(verbale[COL_CONF_DOC.MODELLI] as string)).toEqual({ templateId: 'tmpl_verbale' });
  const condotta = confDoc.find((c) => c[COL_CONF_DOC.GENERATORE] === 'FOGLIO_GENERICO')!;
  expect(JSON.parse(condotta[COL_CONF_DOC.MODELLI] as string)).toEqual({ templateId: 'tmpl_condotta' });
  const piani = confDoc.filter((c) => c[COL_CONF_DOC.GENERATORE] === 'DOC_PERSONALIZZATO');
  expect(piani).toHaveLength(5);
});

test('seeds 4 CONF_MAIL rows: verbale/coordinatori, condotta/CdC, carenza/genitori, piani reuse', () => {
  const { spreadsheets, sheets } = factory();
  const drive = new FakeDriveFacade();
  new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS);
  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const confMail = sample.rows[TABLE.CONF_MAIL]!;
  expect(confMail).toHaveLength(4);
  expect(confMail.map((c) => c[COL_CONF_MAIL.PROCESSO]).sort()).toEqual(
    ['PER_CARENZA_GENITORI', 'PER_CDC', 'PER_COORDINATORE', 'PER_COORDINATORE'].sort()
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: FAIL — cannot find module `'../../../src/onlinetests/E2eSampleDatabaseBuilder'`

- [ ] **Step 3: Implement `E2eSampleDatabaseBuilder`**

Create `src/onlinetests/E2eSampleDatabaseBuilder.ts`:

```ts
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';
import {
  TABLE,
  COL_ALUNNI,
  COL_DOCENTI,
  COL_CLASSI,
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
  COL_LOG_MAIL,
  COL_MASTER
} from '../config/schema';

export const CLASSE_A = '1A';
export const CLASSE_B = '2B';
export const CLASSE_C = '3C';
export const CLASSE_C_PARTNER = '3C-LC';
export const MATERIE_E2E = ['MAT', 'ITA', 'ING', 'STO'];
export const INDIRIZZO_E2E = 'IND_E2E';
export const DIPART_E2E = 'DIPART_E2E';
export const DOCENTE_COUNT = 20;

export const TIPI_PIANO = ['PDP_DSA', 'PDP_BES', 'PDP_STRANIERI', 'PEI', 'PFP'] as const;

export const CONF_DOC_VERBALE = 'E2E_VERBALE';
export const CONF_DOC_CONDOTTA = 'E2E_CONDOTTA';
export function confDocPiano(tipo: string): string {
  return `E2E_PIANO_${tipo}`;
}
export const CONF_MAIL_VERBALE = 'E2E_MAIL_VERBALE';
export const CONF_MAIL_CONDOTTA = 'E2E_MAIL_CONDOTTA';
export const CONF_MAIL_CARENZA = 'E2E_MAIL_CARENZA';
export const CONF_MAIL_PIANI = 'E2E_MAIL_PIANI';

export function e2eDocenteEmail(i: number): string {
  return `e2edocente${i}@onlinetest.aldo.local`;
}
export function e2eAlunnoEmail(i: number): string {
  return `e2ealunno${i}@onlinetest.aldo.local`;
}
export const CARENZA_ALUNNO_1 = e2eAlunnoEmail(1);
export const CARENZA_ALUNNO_2 = e2eAlunnoEmail(21);

export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}

export interface E2eSampleDatabase {
  masterSpreadsheetId: string;
  sampleSpreadsheetId: string;
  sampleSpreadsheetUrl: string;
  sampleFolderUrl: string;
}

const HEADERS: Record<string, string[]> = {
  [TABLE.ALUNNI]: Object.values(COL_ALUNNI),
  [TABLE.DOCENTI]: Object.values(COL_DOCENTI),
  [TABLE.CLASSI]: [...Object.values(COL_CLASSI), ...MATERIE_E2E],
  [TABLE.MATERIE]: Object.values(COL_MATERIE),
  [TABLE.INDIRIZZI]: Object.values(COL_INDIRIZZI),
  [TABLE.DIPART]: Object.values(COL_DIPART),
  [TABLE.RUOLI]: Object.values(COL_RUOLI),
  [TABLE.PIANI]: Object.values(COL_PIANI),
  [TABLE.CARENZE]: Object.values(COL_CARENZE),
  [TABLE.PROGETTI]: Object.values(COL_PROGETTI),
  [TABLE.MOV_ALUNNI]: Object.values(COL_MOV_ALUNNI),
  [TABLE.ASL]: Object.values(COL_ASL),
  [TABLE.SUPPLENZE]: Object.values(COL_SUPPLENZE),
  [TABLE.VARIAZIONI_CATTEDRA]: Object.values(COL_VARIAZIONI_CATTEDRA),
  [TABLE.CONF_DOC]: Object.values(COL_CONF_DOC),
  [TABLE.CONF_MAIL]: Object.values(COL_CONF_MAIL),
  [TABLE.CONF_IMP]: Object.values(COL_CONF_IMP),
  [TABLE.LOG_DOCS]: Object.values(COL_LOG_DOCS),
  [TABLE.LOG_FOLD]: Object.values(COL_LOG_FOLD),
  [TABLE.LOG_MAIL]: Object.values(COL_LOG_MAIL)
};

/** Class layout: id, alunni count, coordinatore index (1-based into e2eDocenteEmail), articolazione JSON. */
interface ClasseLayout {
  id: string;
  count: number;
  coordIndex: number;
  articolazione: string;
}

/**
 * Builds a persistent, larger sample SGSA database for the 7 e2e scenarios (design spec
 * `2026-07-21-testonline-mock-db-e2e-design.md`): 3 classi (~20 alunni each, one articolata
 * split 8+12), 20 docenti, exactly 2 CARENZE rows, MASTER.TEST_MODE=true, and CONF_DOC/CONF_MAIL
 * rows for all 7 scenarios. Deliberately separate from `SampleDatabaseBuilder` (which stays
 * small, for the existing smoke-test checks) — different fixed Drive artifact names so both
 * coexist without collision, same reuse-by-fixed-name idempotency.
 */
export class E2eSampleDatabaseBuilder {
  constructor(
    private readonly spreadsheets: ISampleSpreadsheetFactory,
    private readonly drive: IDriveFacade
  ) {}

  build(templateIds: E2eTemplateIds): E2eSampleDatabase {
    const baseName = '_ALDO_E2E';
    const folderId = this.drive.createFolder(baseName);
    const sampleFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    const sample = this.spreadsheets.createSpreadsheet(`${baseName}_SAMPLE`);
    const master = this.spreadsheets.createSpreadsheet(`${baseName}_MASTER`);

    for (const [table, headerRow] of Object.entries(HEADERS)) {
      sample.addSheet(table, headerRow);
    }
    master.addSheet(TABLE.MASTER, Object.values(COL_MASTER));

    this.seedIndirizzi(sample);
    this.seedDipart(sample);
    this.seedMaterie(sample);
    this.seedDocenti(sample);
    const layouts = this.classLayouts();
    this.seedClassi(sample, layouts);
    this.seedAlunni(sample, layouts);
    this.seedCarenze(sample);
    this.seedSupplenzeEVariazioni(sample);
    this.seedPiani(sample);
    this.seedConfDoc(sample, templateIds);
    this.seedConfMail(sample);
    this.seedMaster(master, sample.id, folderId);

    return {
      masterSpreadsheetId: master.id,
      sampleSpreadsheetId: sample.id,
      sampleSpreadsheetUrl: sample.getUrl(),
      sampleFolderUrl
    };
  }

  private classLayouts(): ClasseLayout[] {
    return [
      { id: CLASSE_A, count: 20, coordIndex: 1, articolazione: '' },
      { id: CLASSE_B, count: 20, coordIndex: 2, articolazione: '' },
      {
        id: CLASSE_C,
        count: 8,
        coordIndex: 3,
        articolazione: JSON.stringify({ parent: null, partner: CLASSE_C_PARTNER, partners: null })
      },
      {
        id: CLASSE_C_PARTNER,
        count: 12,
        coordIndex: 4,
        articolazione: JSON.stringify({ parent: null, partner: CLASSE_C, partners: null })
      }
    ];
  }

  private seedIndirizzi(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.INDIRIZZI, {
      [COL_INDIRIZZI.ID]: INDIRIZZO_E2E,
      [COL_INDIRIZZI.NOME]: 'Liceo Scientifico (E2E)',
      [COL_INDIRIZZI.NOME_SINTETICO]: 'SCI',
      [COL_INDIRIZZI.TIPO]: 'Liceo'
    });
  }

  private seedDipart(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.DIPART, {
      [COL_DIPART.ID]: DIPART_E2E,
      [COL_DIPART.NOME]: 'Dipartimento E2E',
      [COL_DIPART.CAPO]: e2eDocenteEmail(1),
      [COL_DIPART.MATERIE]: MATERIE_E2E.join(',')
    });
  }

  private seedMaterie(sample: ISampleSpreadsheet): void {
    const nomi: Record<string, string> = {
      MAT: 'Matematica',
      ITA: 'Italiano',
      ING: 'Inglese',
      STO: 'Storia'
    };
    MATERIE_E2E.forEach((sigla, i) => {
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: sigla,
        [COL_MATERIE.NOME]: nomi[sigla],
        [COL_MATERIE.SINTESI]: sigla,
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: sigla.charAt(0),
        [COL_MATERIE.ESAME_CFG]: '',
        [COL_MATERIE.EVOLUZIONE]: ''
      });
      void i;
    });
  }

  /** 20 DOCENTI rows, alternating GENERE, all in the single E2E dipartimento. */
  private seedDocenti(sample: ISampleSpreadsheet): void {
    for (let i = 1; i <= DOCENTE_COUNT; i++) {
      sample.appendRow(TABLE.DOCENTI, {
        [COL_DOCENTI.EMAIL]: e2eDocenteEmail(i),
        [COL_DOCENTI.COGNOME]: `Docente${i}`,
        [COL_DOCENTI.NOME]: 'Test',
        [COL_DOCENTI.GENERE]: i % 2 === 0 ? 'F' : 'M',
        [COL_DOCENTI.DIPART]: DIPART_E2E,
        [COL_DOCENTI.ITP]: false
      });
    }
  }

  /**
   * 4 CLASSI rows (2 plain + 1 articolata pair). Cattedra assignment for each of the 4
   * MATERIE_E2E columns is a deterministic round-robin over the first 8 docenti
   * (`(classIndex * MATERIE_E2E.length + materiaIndex) % 8`, 1-based) — 4 classi x 4 materie
   * = 16 cattedra slots into 8 teachers guarantees realistic overlap (each of those 8 teaches
   * in >=1 other class besides their own), while docenti 9-20 exist in DOCENTI without a
   * CLASSI-priority cattedra (available for SUPPLENZE/VARIAZIONI_CATTEDRA and coordinatore
   * roles instead, see `seedSupplenzeEVariazioni`).
   */
  private seedClassi(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    layouts.forEach((layout, classIndex) => {
      const row: Record<string, unknown> = {
        [COL_CLASSI.ID]: layout.id,
        [COL_CLASSI.ANNO]: 3,
        [COL_CLASSI.INDIRIZZO]: INDIRIZZO_E2E,
        [COL_CLASSI.ARTICOLAZIONE]: layout.articolazione,
        [COL_CLASSI.RUOLI]: '',
        [COL_CLASSI.ATTIVA]: true,
        [COL_CLASSI.COORD]: e2eDocenteEmail(layout.coordIndex),
        [COL_CLASSI.IRC]: '',
        [COL_CLASSI.ALT]: '',
        [COL_CLASSI.SEZ]: layout.id.replace(/[0-9-]/g, '') || 'A',
        [COL_CLASSI.TERMINALE]: false,
        [COL_CLASSI.STORICO]: false
      };
      MATERIE_E2E.forEach((sigla, materiaIndex) => {
        const docenteIndex = ((classIndex * MATERIE_E2E.length + materiaIndex) % 8) + 1;
        row[sigla] = e2eDocenteEmail(docenteIndex);
      });
      sample.appendRow(TABLE.CLASSI, row);
    });
  }

  private seedAlunni(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    let counter = 1;
    for (const layout of layouts) {
      for (let n = 0; n < layout.count; n++) {
        sample.appendRow(TABLE.ALUNNI, {
          [COL_ALUNNI.EMAIL]: e2eAlunnoEmail(counter),
          [COL_ALUNNI.COGNOMENOME]: `Alunno${counter} E2E`,
          [COL_ALUNNI.CLASSE]: layout.id,
          [COL_ALUNNI.RELIGIONE]: true,
          [COL_ALUNNI.CURRICULUM]: '',
          [COL_ALUNNI.ATTIVO]: true,
          [COL_ALUNNI.RIPETENTE]: false,
          [COL_ALUNNI.RAPPR_STUD]: false,
          [COL_ALUNNI.RAPPR_GEN]: false,
          [COL_ALUNNI.TUTOR_1]: `tutor${counter}@onlinetest.aldo.local`,
          [COL_ALUNNI.TUTOR_2]: '',
          [COL_ALUNNI.NOTE]: ''
        });
        counter += 1;
      }
    }
  }

  /** Exactly 2 CARENZE rows (scenario 6, design spec confirmed this count with the user). */
  private seedCarenze(sample: ISampleSpreadsheet): void {
    for (const studente of [CARENZA_ALUNNO_1, CARENZA_ALUNNO_2]) {
      sample.appendRow(TABLE.CARENZE, {
        [COL_CARENZE.STUDENTE]: studente,
        [COL_CARENZE.PROGRESSIVO]: 1,
        [COL_CARENZE.CLASSE]: MATERIE_E2E[0],
        [COL_CARENZE.DATA]: '2026-07-01',
        [COL_CARENZE.NOTIFICATO]: false,
        [COL_CARENZE.ASSENZE]: false,
        [COL_CARENZE.NOTE]: 'Carenza E2E di prova',
        [COL_CARENZE.DATA_MODIFICA]: '2026-07-01'
      });
    }
  }

  /** Same SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI priority-chain case as SampleDatabaseBuilder, using docenti 9/10 (outside the cattedra round-robin pool). */
  private seedSupplenzeEVariazioni(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(1),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(9),
      [COL_SUPPLENZE.DAL]: '2026-07-01',
      [COL_SUPPLENZE.AL]: '2026-07-10',
      [COL_SUPPLENZE.CLASSI]: CLASSE_A,
      [COL_SUPPLENZE.MATERIE]: MATERIE_E2E[0]
    });
    sample.appendRow(TABLE.VARIAZIONI_CATTEDRA, {
      [COL_VARIAZIONI_CATTEDRA.CLASSE_ID]: CLASSE_A,
      [COL_VARIAZIONI_CATTEDRA.MATERIA_ID]: MATERIE_E2E[0],
      [COL_VARIAZIONI_CATTEDRA.VECCHIO_TITOLARE]: e2eDocenteEmail(1),
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(10),
      [COL_VARIAZIONI_CATTEDRA.DATA_DECORRENZA]: '2026-07-05'
    });
  }

  /** One PIANI row per TipoPiano (scenario 3), all for CARENZA_ALUNNO_1 (already BES-flagged by having a carenza, keeps the fixture small). */
  private seedPiani(sample: ISampleSpreadsheet): void {
    for (const tipo of TIPI_PIANO) {
      sample.appendRow(TABLE.PIANI, {
        [COL_PIANI.STUDENTE]: CARENZA_ALUNNO_1,
        [COL_PIANI.TIPO]: tipo,
        [COL_PIANI.PARAMETRI]: JSON.stringify({ note: `Piano E2E ${tipo}` })
      });
    }
  }

  private seedConfDoc(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_VERBALE,
      [COL_CONF_DOC.TIPO]: 'VERBALE',
      [COL_CONF_DOC.GENERATORE]: 'VERBALE_CDC',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.verbale }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Verbale_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_CONDOTTA,
      [COL_CONF_DOC.TIPO]: 'CONDOTTA',
      [COL_CONF_DOC.GENERATORE]: 'FOGLIO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.condotta }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Condotta_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GSHEET'
    });
    for (const tipo of TIPI_PIANO) {
      sample.appendRow(TABLE.CONF_DOC, {
        [COL_CONF_DOC.ID]: confDocPiano(tipo),
        [COL_CONF_DOC.TIPO]: 'PIANO',
        [COL_CONF_DOC.GENERATORE]: 'DOC_PERSONALIZZATO',
        [COL_CONF_DOC.CONDIZIONE]: '',
        [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.piani[tipo] }),
        [COL_CONF_DOC.FILE_NAME]: `E2E_Piano_${tipo}_{{focus.alunno.anagrafica.nomeCompleto}}`,
        [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
        [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
        [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
        [COL_CONF_DOC.PERMESSI]: '',
        [COL_CONF_DOC.POST_PROCESSO]: null,
        [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tipoPiano: tipo }),
        [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
        [COL_CONF_DOC.FORMATO]: 'GDOC'
      });
    }
  }

  private seedConfMail(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_VERBALE,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Verbale {{focus.classe.anagrafica.nome}}',
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>In allegato il verbale del consiglio di classe.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_CONDOTTA,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Scheda condotta {{focus.classe.anagrafica.nome}}',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>In allegato la scheda di valutazione condotta.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_CARENZA,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Comunicazione carenza',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CARENZA_GENITORI',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>Comunichiamo una carenza rilevata per il/la vostro/a figlio/a.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#C62828',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_PIANI,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Piani personalizzati {{focus.classe.anagrafica.nome}}',
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        { TIPO_BOX: 'piani_pers_da_inviare' },
        { TIPO_BOX: 'piani_pers_inviati' }
      ]),
      [COL_CONF_MAIL.TESTO]: '<p>Piani personalizzati nuovi e già notificati.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
  }

  private seedMaster(master: ISampleSpreadsheet, sampleSpreadsheetId: string, folderId: string): void {
    master.appendRow(TABLE.MASTER, {
      [COL_MASTER.ANNO_SCOLASTICO]: '2026/2027',
      [COL_MASTER.ID_SPREADSHEET]: sampleSpreadsheetId,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: folderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente E2E',
      [COL_MASTER.SUPERVISORE_EMAIL]: 'supervisore@onlinetest.aldo.local',
      [COL_MASTER.TEST_MODE]: true
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "feat: add E2eSampleDatabaseBuilder (60-student, 20-teacher mock DB)"
```

---

## Task 6: `E2eTemplateProvisioner`

**Files:**
- Create: `src/onlinetests/E2eTemplateProvisioner.ts`
- Create: `src/onlinetests/GasArtifactFactory.ts`
- Create: `test/unit/onlinetests/e2e-template-provisioner.test.ts`

**Interfaces:**
- Produces: `IArtifactFactory { createDocument(name, folderId): string; createSheet(name, folderId): string }`; `E2eTemplateProvisioner.provision(folderId: string): E2eTemplateIds` (same `E2eTemplateIds` shape Task 5 consumes).
- Consumes: `IDriveFacade.findFileByName` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `test/unit/onlinetests/e2e-template-provisioner.test.ts`:

```ts
import { E2eTemplateProvisioner, type IArtifactFactory } from '../../../src/onlinetests/E2eTemplateProvisioner';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { TIPI_PIANO } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

function fakeArtifacts(): { artifacts: IArtifactFactory; created: string[] } {
  const created: string[] = [];
  let seq = 0;
  return {
    created,
    artifacts: {
      createDocument: (name: string) => {
        created.push(`doc:${name}`);
        return `doc_${++seq}`;
      },
      createSheet: (name: string) => {
        created.push(`sheet:${name}`);
        return `sheet_${++seq}`;
      }
    }
  };
}

test('creates all 7 templates (1 doc verbale + 1 sheet condotta + 5 doc piani) when none exist yet', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(created).toHaveLength(7);
  expect(created.filter((c) => c.startsWith('sheet:'))).toHaveLength(1);
  expect(created.filter((c) => c.startsWith('doc:'))).toHaveLength(6);
  expect(ids.verbale).toMatch(/^doc_/);
  expect(ids.condotta).toMatch(/^sheet_/);
  for (const tipo of TIPI_PIANO) {
    expect(ids.piani[tipo]).toMatch(/^doc_/);
  }
});

test('reuses an existing template by name instead of recreating it', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  drive.files.set('FOLDER_1::E2E Verbale Template', 'existing_verbale_id');

  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.verbale).toBe('existing_verbale_id');
  expect(created.some((c) => c.includes('Verbale'))).toBe(false);
  expect(created).toHaveLength(6); // condotta + 5 piani still created
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`
Expected: FAIL — cannot find module `'../../../src/onlinetests/E2eTemplateProvisioner'`

- [ ] **Step 3: Implement `E2eTemplateProvisioner`**

Create `src/onlinetests/E2eTemplateProvisioner.ts`:

```ts
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import { TIPI_PIANO, type E2eTemplateIds } from './E2eSampleDatabaseBuilder';

/** Port abstracting blank-Drive-artifact creation, so the provisioner is unit-testable offline. */
export interface IArtifactFactory {
  createDocument(name: string, folderId: string): string;
  createSheet(name: string, folderId: string): string;
}

const NAME_VERBALE = 'E2E Verbale Template';
const NAME_CONDOTTA = 'E2E Condotta Template';
function namePiano(tipo: string): string {
  return `E2E Piano ${tipo} Template`;
}

/**
 * Idempotently finds-or-creates the 7 real Drive templates the e2e scenarios generate
 * against (design spec `2026-07-21-testonline-mock-db-e2e-design.md`, "Template
 * provisioning"): a fixed name per template, looked up via `IDriveFacade.findFileByName`
 * before creating — repeated runs reuse the same Drive artifacts, matching the
 * `SampleDatabaseBuilder`/`GasSampleSpreadsheetFactory` reuse-by-fixed-name convention.
 */
export class E2eTemplateProvisioner {
  constructor(
    private readonly artifacts: IArtifactFactory,
    private readonly drive: IDriveFacade
  ) {}

  provision(folderId: string): E2eTemplateIds {
    const verbale = this.findOrCreateDoc(folderId, NAME_VERBALE);
    const condotta = this.findOrCreateSheet(folderId, NAME_CONDOTTA);
    const piani = {} as E2eTemplateIds['piani'];
    for (const tipo of TIPI_PIANO) {
      piani[tipo] = this.findOrCreateDoc(folderId, namePiano(tipo));
    }
    return { verbale, condotta, piani };
  }

  private findOrCreateDoc(folderId: string, name: string): string {
    return this.drive.findFileByName(folderId, name) ?? this.artifacts.createDocument(name, folderId);
  }

  private findOrCreateSheet(folderId: string, name: string): string {
    return this.drive.findFileByName(folderId, name) ?? this.artifacts.createSheet(name, folderId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`
Expected: PASS

- [ ] **Step 5: Implement the real GAS-backed `IArtifactFactory`**

Create `src/onlinetests/GasArtifactFactory.ts`:

```ts
import type { IArtifactFactory } from './E2eTemplateProvisioner';

/**
 * Real `DocumentService.createDocument`/`SpreadsheetService.createSpreadsheet`-backed
 * implementation of {@link IArtifactFactory} (design spec: "no GLF gap, just new
 * ALDO-side usage of an already-documented capability", `GoogleApiWrapper_docs.md`
 * "Creazione di un Google Doc o Google Sheet vuoto"). The only caller of these two
 * create-from-scratch primitives in ALDO — production code only ever copies templates.
 */
export class GasArtifactFactory implements IArtifactFactory {
  constructor(
    private readonly documents: DocumentService,
    private readonly spreadsheets: SpreadsheetService
  ) {}

  createDocument(name: string, folderId: string): string {
    return this.documents.createDocument(name, { destinationFolder: folderId }).documentId;
  }

  createSheet(name: string, folderId: string): string {
    return this.spreadsheets.createSpreadsheet(name, { destinationFolder: folderId }).spreadsheetId;
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/GasArtifactFactory.ts test/unit/onlinetests/e2e-template-provisioner.test.ts
git commit -m "feat: add E2eTemplateProvisioner (idempotent Drive template find-or-create)"
```

---

## Task 7: `DocumentGenerationService.generateForAlunno`

Discovered while writing Task 8: `DocumentGenerationService`'s only generation entry point is `generateForClasse(target: ClasseId, confDocId, jobId?)` (`src/application/services/DocumentGenerationService.ts:87-140`), which always builds the CDU with `tipoTarget: 'classe'`. `DocPersonalizzatoGeneratorStrategy` (`src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts:22`) reads `cdu.focus.alunno?.didattica.piani.items` — with no alunno-targeted entry point, that's always `undefined`/`[]`, so scenario 3 (generate all 5 piani personalizzati for a student) cannot work through any existing code path. `ContextBuilder`/`ClasseProvider` already support `tipoTarget: 'alunno'` generically (`src/application/context-engine/providers/ClasseProvider.ts:66`, `recipe('ALUNNO_COMPLETO')` already used by `contextEngineChecks.ts:47-48`) — only `DocumentGenerationService` itself never exposed an alunno-targeted method. This is real production code (not test/tooling) — flag it to the user before running this task if they want to weigh in first; the addition is a narrow mirror of the existing `generateForClasse`, not a redesign.

**Files:**
- Modify: `src/application/services/DocumentGenerationService.ts`
- Modify: `test/unit/application/document-generation-service.test.ts`

**Interfaces:**
- Produces: `DocumentGenerationService.generateForAlunno(target: string, confDocId: string, jobId?: string): { fileId: string | null; status: string }` — same return shape and pipeline as `generateForClasse`, `target` is a plain string (alunno id/email — no `AlunnoId` value object exists anywhere in this codebase; `EmailNotificationService.ts:257-263` already treats alunno targets as plain strings, so this matches existing convention rather than introducing a new VO for one caller).

- [ ] **Step 1: Write the failing test**

In `test/unit/application/document-generation-service.test.ts`, add a new `describe` block after the closing `});` of `describe('DocumentGenerationService.generateForClasse — error paths', ...)` (after line 119):

```ts
describe('DocumentGenerationService.generateForAlunno', () => {
  test('builds the CDU with tipoTarget alunno and renders the matching piano', () => {
    const tables = fixtureTables();
    tables.CONF_DOC!.push({
      ID: 'CD_PIANO',
      TIPO: 'PIANO',
      GENERATORE: 'DOC_PERSONALIZZATO',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_piano"}',
      FILE_NAME: 'Piano_{{focus.alunno.anagrafica.nomeCompleto}}',
      PATH_OUT: 'Piani',
      PATH_OUT_SOTTOCARTELLE: null,
      SCHEMA_SOTTOCARTELLE: 'UNO PER PIANO PERSONALIZZATO',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: '{"tipoPiano":"PEI"}',
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC'
    });
    const templates = new FakeTemplateEngine();
    const { service } = wire(tables, {
      registry: new Map([['DOC_PERSONALIZZATO', new DocPersonalizzatoGeneratorStrategy(templates)]])
    });

    const result = service.generateForAlunno('a1@school.it', 'CD_PIANO');

    expect(result.fileId).not.toBeNull();
    expect(result.status).not.toBe('SKIPPED');
    const ctx = templates.contextFor(result.fileId!) as { piano: Record<string, unknown> };
    expect(ctx.piano).toEqual({ gravita: 'media' }); // a1@school.it's fixtured PEI piano (tables.ts:249)
  });

  test('throws when the CONF_DOC row does not exist, same as generateForClasse', () => {
    const { service } = wire();
    expect(() => service.generateForAlunno('a1@school.it', 'MISSING_ID')).toThrow(PipelineError);
  });
});
```

Add the import (after line 3, `import { VerbaleGeneratorStrategy } ...`):

```ts
import { DocPersonalizzatoGeneratorStrategy } from '../../../src/application/strategies/DocPersonalizzatoGeneratorStrategy';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts`
Expected: FAIL — `service.generateForAlunno is not a function`

- [ ] **Step 3: Implement `generateForAlunno`**

In `src/application/services/DocumentGenerationService.ts`, add this method immediately after `generateForClasse` (after line 140, before the `buildPipeline` private method) — it is `generateForClasse` with `target: ClasseId` replaced by `target: string`, `target.value` replaced by `target`, `tipoTarget: 'classe'` replaced by `'alunno'`, and `recipe('CLASSE_COMPLETA')` replaced by `recipe('ALUNNO_COMPLETO')`; everything else (transaction handling, pipeline, status resolution) is identical:

```ts
  /** Alunno-targeted mirror of {@link generateForClasse} (e.g. DOC_PERSONALIZZATO, one file per student). */
  generateForAlunno(
    target: string,
    confDocId: string,
    jobId?: string
  ): { fileId: string | null; status: string } {
    const row = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
    if (!row) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
    const config = ConfigurazioneDocumento.fromData(row);
    if (!this.strategyRegistry.has(config.generatore)) {
      throw new PipelineError(`GENERATORE non registrato: ${config.generatore}`);
    }

    const cdu = this.contextBuilder.build(
      {
        target,
        tipoTarget: 'alunno',
        now: this.now,
        idConfigurazione: confDocId,
        tipoOperazione: 'GENERAZIONE_DOCUMENTO'
      },
      recipe('ALUNNO_COMPLETO')
    );

    this.db.beginTransaction();
    let ctx: PipelineContext;
    try {
      ctx = this.buildPipeline(jobId).execute({ config: row, confDoc: config, cdu });
    } catch (e) {
      this.db.rollback();
      throw e;
    }

    const critical = ctx.getFlag<string>('criticalError');
    if (critical !== null) {
      this.db.rollback();
      throw new PipelineError(critical);
    }
    this.db.commit();

    const fileId = ctx.get<string>('newFileId');
    const status =
      fileId !== null
        ? String(
            this.db.table(TABLE.LOG_DOCS).find((r) => r[COL_LOG_DOCS.ID] === fileId)?.[
              COL_LOG_DOCS.STATO
            ] ?? 'UNKNOWN'
          )
        : 'SKIPPED';
    return { fileId, status };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/application/services/DocumentGenerationService.ts test/unit/application/document-generation-service.test.ts
git commit -m "feat: add DocumentGenerationService.generateForAlunno for alunno-targeted generation (e.g. DOC_PERSONALIZZATO)"
```

---

## Task 8: `e2eScenarioChecks.ts` + `executeE2eScenarios()`/`runE2eScenarios()`

**Files:**
- Create: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Modify: `src/onlinetests/index.ts`
- Create: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**
- Consumes: `TestRunner.add(name, artifactUrl, fn)` (`src/onlinetests/OnlineTestReport.ts:32`), `ServiceContainer.get<T>(key)`, `EmailNotificationService.sendPattern` (`src/application/services/EmailNotificationService.ts:152-181`), `DocumentGenerationService.generateForClasse`/`generateForAlunno` (already wired under `'documentGenerationService'` per `Bootstrap.ts`; `generateForAlunno` added by Task 7), all `E2eSampleDatabaseBuilder`/`E2eTemplateProvisioner` exports.
- Produces: `registerE2eScenarioChecks(runner, container, sample): void`; `executeE2eScenarios(overrides?): OnlineTestReport`; `runE2eScenarios(): void` (new GAS Run-dropdown global).

- [ ] **Step 1: Write the failing test (offline, checks-registration shape only)**

Create `test/unit/onlinetests/e2e-scenario-checks.test.ts` — this test only proves `registerE2eScenarioChecks` refuses to run when `TEST_MODE` isn't on the sample, since the 7 real-generation checks need a live container/Drive and are proven by the actual `push:online` run (per the design doc's Testing section), not by an offline Jest test:

```ts
import { registerE2eScenarioChecks } from '../../../src/onlinetests/checks/e2eScenarioChecks';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { E2eSampleDatabase } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

test('refuses to register any check and reports a single failure when the sample is not TEST_MODE', () => {
  const runner = new TestRunner();
  const container = {} as ServiceContainer;
  const sample: E2eSampleDatabase & { testMode: boolean } = {
    masterSpreadsheetId: 'm',
    sampleSpreadsheetId: 's',
    sampleSpreadsheetUrl: 'https://example.test/s',
    sampleFolderUrl: 'https://example.test/f',
    testMode: false
  };

  registerE2eScenarioChecks(runner, container, sample);

  const report = runner.report();
  expect(report.failed).toBe(1);
  expect(report.results[0]!.message).toMatch(/TEST_MODE/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: FAIL — cannot find module `'../../../src/onlinetests/checks/e2eScenarioChecks'`

- [ ] **Step 3: Implement `e2eScenarioChecks.ts`**

Create `src/onlinetests/checks/e2eScenarioChecks.ts`:

```ts
import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../OnlineTestReport';
import { ValidationError } from '../../domain/errors/DomainError';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { EmailNotificationService } from '../../application/services/EmailNotificationService';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import {
  CLASSE_A,
  CLASSE_B,
  TIPI_PIANO,
  CONF_DOC_VERBALE,
  CONF_DOC_CONDOTTA,
  confDocPiano,
  CONF_MAIL_VERBALE,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_CARENZA,
  CONF_MAIL_PIANI,
  CARENZA_ALUNNO_1,
  type E2eSampleDatabase
} from '../E2eSampleDatabaseBuilder';

/**
 * Registers the 7 e2e scenario checks (design spec `2026-07-21-testonline-mock-db-e2e-design.md`).
 * Refuses to register any real check — and reports a single explicit failure instead — if the
 * sample's MASTER row isn't TEST_MODE, so a misconfigured fixture can never risk a real send
 * (design spec "Error handling").
 */
export function registerE2eScenarioChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: E2eSampleDatabase & { testMode: boolean }
): void {
  if (!sample.testMode) {
    runner.add('E2E scenarios: MASTER.TEST_MODE guard', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        'E2E scenario checks refuse to run: sample MASTER.TEST_MODE is not true (would risk sending real emails).'
      );
    });
    return;
  }

  const documents = container.get<DocumentGenerationService>('documentGenerationService');
  const email = container.get<EmailNotificationService>('emailNotificationService');

  runner.add('E2E scenario 1: genera verbale consiglio di classe', sample.sampleSpreadsheetUrl, () => {
    const { fileId, status } = documents.generateForClasse(ClasseId.of(CLASSE_A), CONF_DOC_VERBALE);
    if (fileId === null) {
      throw new ValidationError(`Generazione verbale non ha prodotto un fileId (status=${status})`);
    }
  });

  runner.add('E2E scenario 2: genera foglio valutazione condotta', sample.sampleSpreadsheetUrl, () => {
    const { fileId, status } = documents.generateForClasse(ClasseId.of(CLASSE_B), CONF_DOC_CONDOTTA);
    if (fileId === null) {
      throw new ValidationError(`Generazione foglio condotta non ha prodotto un fileId (status=${status})`);
    }
  });

  runner.add('E2E scenario 3: genera i 5 piani personalizzati', sample.sampleSpreadsheetUrl, () => {
    for (const tipo of TIPI_PIANO) {
      const { fileId, status } = documents.generateForAlunno(CARENZA_ALUNNO_1, confDocPiano(tipo));
      if (fileId === null) {
        throw new ValidationError(`Generazione piano ${tipo} non ha prodotto un fileId (status=${status})`);
      }
    }
  });

  runner.add('E2E scenario 4: invia verbale ai coordinatori (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_VERBALE);
    if (result.sent === 0) {
      throw new ValidationError(`Invio verbale: 0 email inviate (targets=${result.targets})`);
    }
    if (result.errors.length > 0) {
      throw new ValidationError(`Invio verbale: errori ${result.errors.join('; ')}`);
    }
  });

  runner.add('E2E scenario 5: invia scheda condotta a tutto il CdC (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_CONDOTTA);
    if (result.sent === 0) {
      throw new ValidationError(`Invio condotta: 0 email inviate (targets=${result.targets})`);
    }
  });

  runner.add('E2E scenario 6: invia comunicazione carenza alle famiglie (TEST_MODE, 2 studenti)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_CARENZA);
    if (result.targets !== 2) {
      throw new ValidationError(`Invio carenza: attesi 2 target, ricevuti ${result.targets}`);
    }
    if (result.sent === 0) {
      throw new ValidationError('Invio carenza: 0 email inviate');
    }
  });

  runner.add('E2E scenario 7: invia piani personalizzati nuovi e già notificati (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_PIANI);
    if (result.sent === 0) {
      throw new ValidationError(`Invio piani: 0 email inviate (targets=${result.targets})`);
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: PASS

- [ ] **Step 5: Add `executeE2eScenarios()`/`runE2eScenarios()` to `src/onlinetests/index.ts`**

In `src/onlinetests/index.ts`, add the imports (alongside the existing ones at the top of the file):

```ts
import { E2eSampleDatabaseBuilder, type E2eTemplateIds } from './E2eSampleDatabaseBuilder';
import { E2eTemplateProvisioner, type IArtifactFactory } from './E2eTemplateProvisioner';
import { GasArtifactFactory } from './GasArtifactFactory';
import { registerE2eScenarioChecks } from './checks/e2eScenarioChecks';
```

Add a second `OnlineTestDeps`-shaped interface and `executeE2eScenarios`/`runE2eScenarios`, mirroring `executeOnlineTests`/`runOnlineTests` exactly, appended at the end of the file (after the existing `(globalThis as any).runOnlineTests = runOnlineTests;` block):

```ts
export interface E2eTestDeps {
  spreadsheetFactory: ISampleSpreadsheetFactory;
  artifactFactory: IArtifactFactory;
  drive: IDriveFacade;
  clock: () => Date;
  properties: IPropertiesFacade;
  initAldo: (now?: Date, props?: IPropertiesFacade) => ServiceContainer;
  log: (message: string) => void;
}

const E2E_ROOT_FOLDER_NAME = '_ALDO_E2E_ROOT';

function mintE2eRootFolder(): GoogleAppsScript.Drive.Folder {
  return testContext.getOrCreateNamedFolder(E2E_ROOT_FOLDER_NAME) as GoogleAppsScript.Drive.Folder;
}

/**
 * Orchestration entry point for the 7 e2e scenarios (design spec
 * `2026-07-21-testonline-mock-db-e2e-design.md`): provisions the 7 real Drive templates,
 * builds the larger persistent mock database against them, points
 * `PROP_MASTER_SPREADSHEET_ID` at its MASTER sheet (previous value logged, never discarded),
 * boots a real ALDO container (which — via `initAldo`'s TEST_MODE wiring — auto-enables
 * `EmailNotificationService` test mode from the mock MASTER's `TEST_MODE=true`), and runs
 * `registerE2eScenarioChecks`. Deliberately a SEPARATE top-level entry point from
 * `executeOnlineTests` — different master pointer, unrelated failure semantics, either can
 * run alone (design spec "New checks").
 */
export function executeE2eScenarios(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport {
  const clock = overrides.clock ?? ((): Date => new Date());
  const rootFolder = overrides.drive === undefined ? mintE2eRootFolder() : null;
  const drive =
    overrides.drive ??
    new DriveServiceFacade(
      ServiceFactory.getDriveService(),
      ServiceFactory.getPermissionService(),
      (rootFolder as NonNullable<typeof rootFolder>).getId()
    );
  const spreadsheetFactory = overrides.spreadsheetFactory ?? new GasSampleSpreadsheetFactory(rootFolder);
  const artifactFactory =
    overrides.artifactFactory ??
    new GasArtifactFactory(ServiceFactory.getDocumentService(), ServiceFactory.getSpreadsheetService());
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const initAldoFn = overrides.initAldo ?? initAldo;
  const log = overrides.log ?? ((message: string): void => ServiceFactory.getLogger().info(message));

  const templateFolderId = drive.createFolder('_ALDO_E2E_TEMPLATES');
  const templateIds: E2eTemplateIds = new E2eTemplateProvisioner(artifactFactory, drive).provision(
    templateFolderId
  );
  const sample = new E2eSampleDatabaseBuilder(spreadsheetFactory, drive).build(templateIds);

  const previousMasterId = properties.get(PROP_MASTER_SPREADSHEET_ID);
  if (previousMasterId !== null && previousMasterId.trim() !== '') {
    log(`Previous MASTER_SPREADSHEET_ID before e2e-scenario override: ${previousMasterId}`);
  }
  properties.set(PROP_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);

  const container = initAldoFn(clock(), properties);

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, { ...sample, testMode: true });

  return runner.report();
}

/** GAS Run-dropdown entry point: no arguments, so it runs with no setup. */
export function runE2eScenarios(): void {
  const report = executeE2eScenarios();
  Logger.log(JSON.stringify(report));
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).runE2eScenarios = runE2eScenarios;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
```

Note: `sample.testMode` is hardcoded `true` at the call site above because `executeE2eScenarios` only ever calls `E2eSampleDatabaseBuilder`, which — per Task 5 — always seeds `MASTER.TEST_MODE=true`. The guard inside `registerE2eScenarioChecks` (Step 3) exists for defense-in-depth / the offline unit test in Step 1, not because this call site can pass `false` today.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts src/onlinetests/index.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "feat: add the 7 e2e scenario checks and runE2eScenarios entry point"
```

- [ ] **Step 9: Live verification (not a Jest step — requires Plan 3's project to push to)**

Once Plan 3's `testonline` MASTER-bound Apps Script project exists: `npm run push:online`, then run `runE2eScenarios` from the Apps Script editor's Run dropdown. This is the actual proof the 7 scenarios work end-to-end — record the returned `OnlineTestReport` (7/7 `passed`) as the completion evidence for this plan, per the design doc's Testing section ("this is the point of the whole spec, not a substitute for it").

---

## Self-Review Notes

- **Spec coverage:** GLF `dynamic_rows` (Task 1), vendor + ambient types incl. `createDocument`/`createSpreadsheet` (Task 2), `findFileByName` (Task 3), `FOGLIO_GENERICO` strategy (Task 4), the mock DB with all fixture requirements confirmed with the user — 3 classi/60 alunni/20 docenti/2 carenze/TEST_MODE (Task 5), template provisioning with idempotent reuse (Task 6), all 7 scenario checks + the separate `executeE2eScenarios` entry point + the TEST_MODE guard (Task 8) — every section of `2026-07-21-testonline-mock-db-e2e-design.md` maps to a task.
- **Placeholder scan:** none remaining. Task 8 originally hedged on `DocumentGenerationService`'s exact call shape; verifying it directly against source surfaced a real gap — `generateForClasse` only supports `tipoTarget: 'classe'`, with no alunno-targeted equivalent — which is now Task 7 (`generateForAlunno`), a narrow, concrete addition mirroring existing code exactly, not a guess. This is real production code discovered mid-plan rather than anticipated by the design doc — flagged to the user for awareness before this task runs.
- **Type consistency:** `E2eTemplateIds` (Task 5) is the exact type `E2eTemplateProvisioner.provision` (Task 6) returns and `E2eSampleDatabaseBuilder.build` (Task 5) consumes. `IArtifactFactory` (Task 6) is implemented identically by the test fake and `GasArtifactFactory`. `CLASSE_A`/`CLASSE_B`/`TIPI_PIANO`/`confDocPiano`/`CONF_MAIL_*`/`CARENZA_ALUNNO_1` (Task 5) are the exact names Task 8's checks import. `generateForAlunno(target: string, confDocId: string, jobId?: string)` (Task 7) matches exactly how Task 8's scenario-3 check calls it.
