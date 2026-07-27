# Online E2E Rendering and Import Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make online E2E scenarios 8–11 render filtered native Docs lists, import ASL rows, and protect subject columns without rollback.

**Architecture:** Add the missing reusable list capabilities to `GasLibraryFactory`, then consume them from ALDO's E2E artifact provisioner. Correct the two ALDO-local defects at their sources: the invalid import mapping and the CDU variant that drops non-enumerable technical state.

**Tech Stack:** Google Apps Script V8, JavaScript/Jest in `GasLibraryFactory`, TypeScript/Jest in ALDO, Google Docs API batch requests, WorkspaceTemplateEngine, GasDataImporter, codebase-memory-mcp.

## Global Constraints

- Check and update `GasLibraryFactory/DOCS_LIBS` alongside reusable library behavior.
- Do not implement filters, list glyphs, or Google API calls in ALDO.
- Native GAS globals and Advanced API calls remain confined to `GoogleApiWrapper`.
- Keep `Cdu.tech` non-enumerable and absent from serialization/template contexts.
- Preserve all unrelated dirty-worktree changes; stage only explicit files.
- Do not edit generated `dist/*` files.
- Use test-first red-green-refactor for every production change.
- Target GAS V8 and synchronous APIs only.

---

## File Map

### GasLibraryFactory repository

- Modify `WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorTagScanner.js`: parse and apply filters for list-loop source expressions.
- Modify `WorkspaceTemplateEngine/src/processors/__tests__/DocumentProcessor.advanced-coverage.test.js`: list-loop filter and iteration-limit regressions.
- Modify `DOCS_LIBS/WorkspaceTemplateEngine_docs.md`: document filtered list-loop source syntax.
- Modify `GoogleApiWrapper/src/services/DocumentBuilder.js`: queue and translate native list-item operations.
- Modify `GoogleApiWrapper/src/services/__tests__/DocumentService.test.js`: builder validation and Docs request regressions.
- Modify `DOCS_LIBS/GoogleApiWrapper_docs.md`: document `appendListItem`.

### ALDO repository

- Modify `types/gaslibs/index.d.ts`: expose the new `DocumentBuilder.appendListItem` contract.
- Modify `src/onlinetests/E2eTemplateProvisioner.ts`: paragraph descriptors, native list markers, and template version bumps.
- Modify `src/onlinetests/GasArtifactFactory.ts`: delegate list descriptors to the library builder.
- Modify `test/unit/onlinetests/e2e-template-provisioner.test.ts`: verify list descriptors and new artifact names.
- Modify `test/unit/onlinetests/gas-artifact-factory.test.ts`: verify builder delegation.
- Modify `src/onlinetests/E2eSampleDatabaseBuilder.ts`: remove the invalid positional ASL mapping.
- Modify `test/unit/onlinetests/e2e-sample-database-builder.test.ts`: assert canonical header behavior.
- Modify `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`: preserve non-enumerable `Cdu.tech` in subject variants.
- Modify `test/unit/application/sheet-materie-generator.test.ts`: reproduce and guard the real non-enumerable CDU shape.
- Regenerate `vendor/gaslibs.Code.js` and `vendor/CHECKSUM` through `npm run refresh:vendor`.

---

### Task 1: Filter parity for WorkspaceTemplateEngine list loops

**Files:**

- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorTagScanner.js`
- Test: `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/__tests__/DocumentProcessor.advanced-coverage.test.js`
- Modify: `GasLibraryFactory/DOCS_LIBS/WorkspaceTemplateEngine_docs.md`

**Interfaces:**

- Consumes: existing `facade._parseExpression(expression)`, `facade._applyFilters(value, filters)`, `mustache._lookupValue(token, context)`, and `_MustacheContext`.
- Produces: list-loop operations whose `dataArray` is the filtered array.

- [ ] **Step 1: Write failing filtered-list tests**

Add focused tests around `_analyzeListLoops`:

```js
it.each([
  ['bullet', "{{#bullet_list:items | sortBy:'name'}}{{name}}{{/bullet_list}}"],
  ['number', "{{#number_list:items | where:'active'}}{{name}}{{/number_list}}"]
])('applies source filters to a %s list loop', (listType, template) => {
  const source = [
    { name: 'Beta', active: false },
    { name: 'Alpha', active: true }
  ];
  mockMustache._lookupValue.mockReturnValue(source);
  processor._parseExpression = jest.fn(() => ({
    path: 'items',
    filters:
      listType === 'bullet'
        ? [{ name: 'sortBy', args: ['name'] }]
        : [{ name: 'where', args: ['active'] }]
  }));
  processor._applyFilters = jest.fn((_items, filters) =>
    filters[0].name === 'sortBy' ? [source[1], source[0]] : [source[1]]
  );

  const operations = processor._analyzeListLoops(
    [{ elementIndex: 10, text: template, runs: [] }],
    { items: source }
  );

  expect(mockMustache._lookupValue).toHaveBeenCalledWith(
    ['name', 'items'],
    expect.anything()
  );
  expect(processor._applyFilters).toHaveBeenCalled();
  expect(operations[0].dataArray).toEqual(
    listType === 'bullet' ? [source[1], source[0]] : [source[1]]
  );
});
```

Add a limit regression:

```js
it('rejects a filtered list expansion above MAX_ITERATIONS', () => {
  mockMustache._lookupValue.mockReturnValue([{ name: 'x' }]);
  processor._parseExpression = jest.fn(() => ({ path: 'items', filters: [] }));
  processor._applyFilters = jest.fn(() =>
    Array.from({ length: processor.MAX_ITERATIONS + 1 }, () => ({ name: 'x' }))
  );

  expect(() =>
    processor._analyzeListLoops(
      [{
        elementIndex: 10,
        text: '{{#bullet_list:items}}{{name}}{{/bullet_list}}',
        runs: []
      }],
      { items: [{ name: 'x' }] }
    )
  ).toThrow(/exceeds maximum allowed/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd GasLibraryFactory
npx jest WorkspaceTemplateEngine/src/processors/__tests__/DocumentProcessor.advanced-coverage.test.js --runInBand
```

Expected: the filter tests fail because `_analyzeListLoops` calls `getValue` with the unparsed full expression; the limit test fails because list loops do not enforce `MAX_ITERATIONS`.

- [ ] **Step 3: Implement the minimal scanner change**

Replace direct list-source resolution with the established table-loop pattern:

```js
const fullExpression = dataSource.trim();
const { path, filters } = this.facade._parseExpression(fullExpression);
const dummyToken = ['name', path];
let dataArray = this.facade.mustache._lookupValue(
  dummyToken,
  new _MustacheContext(context)
);

if (Array.isArray(dataArray)) {
  dataArray = this.facade._applyFilters(dataArray, filters);
  if (dataArray.length > this.facade.MAX_ITERATIONS) {
    throw new Error(
      `List expansion count (${dataArray.length}) exceeds maximum allowed (${this.facade.MAX_ITERATIONS})`
    );
  }
  // Existing source-run rebasing and operations.push follow unchanged.
}
```

Do not add a new parser or filter registry.

- [ ] **Step 4: Document filtered list-loop sources**

Add examples to `WorkspaceTemplateEngine_docs.md`:

```text
{{#bullet_list:people | sortBy:'name'}}{{name}}{{/bullet_list}}
{{#number_list:people | where:'active'}}{{name}}{{/number_list}}
```

State that list sources use the same registered filter pipeline and iteration limit as table loops.

- [ ] **Step 5: Run focused and neighboring WorkspaceTemplateEngine tests**

Run:

```bash
cd GasLibraryFactory
npx jest WorkspaceTemplateEngine/src/processors/__tests__/DocumentProcessor.advanced-coverage.test.js WorkspaceTemplateEngine/src/__tests__/integration/PlaceholderServiceFilters.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1 in the library repository**

```bash
cd GasLibraryFactory
git add WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorTagScanner.js WorkspaceTemplateEngine/src/processors/__tests__/DocumentProcessor.advanced-coverage.test.js DOCS_LIBS/WorkspaceTemplateEngine_docs.md
git diff --cached --check
git commit -m "fix(WorkspaceTemplateEngine): filter document list sources"
```

---

### Task 2: Native list-item authoring in GoogleApiWrapper

**Files:**

- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/DocumentBuilder.js`
- Test: `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/DocumentService.test.js`
- Modify: `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper_docs.md`

**Interfaces:**

- Produces: `DocumentBuilder.appendListItem(text, { listType: 'bullet' | 'number' }): DocumentBuilder`.
- Google request mapping:
  - `bullet` -> `BULLET_DISC_CIRCLE_SQUARE`
  - `number` -> `NUMBERED_DECIMAL_ALPHA_ROMAN`

- [ ] **Step 1: Write failing builder and request tests**

Add tests under the existing DocumentBuilder suites:

```js
it.each(['bullet', 'number'])('queues a native %s list item', (listType) => {
  const result = builder.appendListItem('Marker', { listType });

  expect(result).toBe(builder);
  expect(builder.operations[0]).toEqual({
    type: 'appendListItem',
    text: 'Marker',
    options: { listType }
  });
});

it('rejects an unsupported list type before execution', () => {
  expect(() => builder.appendListItem('Marker', { listType: 'roman-only' })).toThrow(
    /Unsupported list type/
  );
});

it.each([
  ['bullet', 'BULLET_DISC_CIRCLE_SQUARE'],
  ['number', 'NUMBERED_DECIMAL_ALPHA_ROMAN']
])('emits a native %s paragraph-bullets request', (listType, bulletPreset) => {
  builder.appendListItem('Marker', { listType }).execute();

  const requests = service._executeBatchUpdate.mock.calls[0][1];
  const insert = requests.find((request) => request.insertText).insertText;
  const bullets = requests.find(
    (request) => request.createParagraphBullets
  ).createParagraphBullets;
  expect(insert.text).toBe('Marker\n');
  expect(bullets).toEqual({
    range: {
      startIndex: insert.location.index,
      endIndex: insert.location.index + insert.text.length
    },
    bulletPreset
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd GasLibraryFactory
npx jest GoogleApiWrapper/src/services/__tests__/DocumentService.test.js --runInBand
```

Expected: FAIL because `appendListItem` does not exist.

- [ ] **Step 3: Implement `appendListItem` and request conversion**

Add the public queueing method:

```js
appendListItem(text, options = {}) {
  const listType = options.listType || 'bullet';
  if (listType !== 'bullet' && listType !== 'number') {
    throw new Error(`Unsupported list type: ${listType}`);
  }
  this.operations.push({
    type: 'appendListItem',
    text,
    options: { ...options, listType }
  });
  return this;
}
```

Add an operation case:

```js
case 'appendListItem':
  return this._createAppendListItemRequests(op, cursor);
```

Add the minimal request helper, reusing paragraph insertion:

```js
_createAppendListItemRequests(op, cursor) {
  const startIndex = cursor.index;
  const requests = this._createAppendParagraphRequests(op, cursor);
  const bulletPreset =
    op.options.listType === 'number'
      ? 'NUMBERED_DECIMAL_ALPHA_ROMAN'
      : 'BULLET_DISC_CIRCLE_SQUARE';

  requests.push({
    createParagraphBullets: {
      range: { startIndex, endIndex: cursor.index },
      bulletPreset
    }
  });
  return requests;
}
```

- [ ] **Step 4: Document the builder API**

Add to `GoogleApiWrapper_docs.md`:

```js
builder
  .appendListItem('First bullet', { listType: 'bullet' })
  .appendListItem('First numbered item', { listType: 'number' })
  .execute();
```

Document accepted values, defaults, and native Docs list semantics.

- [ ] **Step 5: Run focused tests, lint, and readable build**

Run:

```bash
cd GasLibraryFactory
npx jest GoogleApiWrapper/src/services/__tests__/DocumentService.test.js --runInBand
npm run lint
npm run build:testing
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit Task 2 in the library repository**

```bash
cd GasLibraryFactory
git add GoogleApiWrapper/src/services/DocumentBuilder.js GoogleApiWrapper/src/services/__tests__/DocumentService.test.js DOCS_LIBS/GoogleApiWrapper_docs.md
git diff --cached --check
git commit -m "feat(GoogleApiWrapper): author native document lists"
```

---

### Task 3: Consume native list items in E2E template provisioning

**Files:**

- Modify: `types/gaslibs/index.d.ts`
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/GasArtifactFactory.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Test: `test/unit/onlinetests/gas-artifact-factory.test.ts`

**Interfaces:**

- Produces:

```ts
export interface E2eDocumentParagraph {
  text: string;
  listType?: 'bullet' | 'number';
}
export type E2eDocumentParagraphInput = string | E2eDocumentParagraph;
```

- Consumes: `DocumentBuilder.appendListItem`.

- [ ] **Step 1: Write failing provisioner descriptor assertions**

Change the fake artifact recorder to retain `Array<string | { text: string; listType?: string }>` and assert:

```ts
expect(created).toContain('doc:E2E Riepilogo Template v4');
expect(created).toContain('doc:E2E Doc Complesso Template v2');

expect(docContent[ids.riepilogo]).toEqual(
  expect.arrayContaining([
    {
      text: '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}}{{/bullet_list}}',
      listType: 'bullet'
    },
    {
      text: '{{#bullet_list:focus.classe.rappresentanti.genitori}}{{nomeCompleto}}{{/bullet_list}}',
      listType: 'bullet'
    }
  ])
);

expect(docContent[ids.docComplesso]).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ listType: 'bullet' }),
    expect.objectContaining({ listType: 'number' })
  ])
);
```

- [ ] **Step 2: Write a failing GasArtifactFactory delegation test**

Use `as never[]` until the production type is introduced:

```ts
factory.createDocument(
  'Lists',
  'FOLDER',
  [
    { text: '{{#bullet_list:items}}{{name}}{{/bullet_list}}', listType: 'bullet' },
    { text: '{{#number_list:items}}{{name}}{{/number_list}}', listType: 'number' }
  ] as never[]
);

expect(calls).toEqual([
  ['appendListItem', '{{#bullet_list:items}}{{name}}{{/bullet_list}}', { listType: 'bullet' }],
  ['appendListItem', '{{#number_list:items}}{{name}}{{/number_list}}', { listType: 'number' }],
  ['execute']
]);
```

Extend the test fake builder with `appendListItem` so the failure is incorrect production delegation, not a missing fake method.

- [ ] **Step 3: Run both tests and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/gas-artifact-factory.test.ts
```

Expected: FAIL because templates still store strings, use v3/unversioned names, and `GasArtifactFactory` delegates every entry to `appendParagraph`.

- [ ] **Step 4: Add the library type declaration**

Add:

```ts
interface DocumentListItemOptions {
  listType?: 'bullet' | 'number';
}

class DocumentBuilder {
  appendListItem(text: string, options?: DocumentListItemOptions): DocumentBuilder;
}
```

Keep all existing declarations.

- [ ] **Step 5: Implement paragraph descriptors and delegation**

In `E2eTemplateProvisioner.ts`, add the descriptor interface/union and change `createDocument` to accept the union array.

Represent only actual list markers as descriptors:

```ts
{
  text: '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}}{{/bullet_list}}',
  listType: 'bullet'
}
```

Use `listType: 'number'` for the filtered numbered marker.

Rename:

```ts
const NAME_RIEPILOGO = 'E2E Riepilogo Template v4';
const NAME_DOC_COMPLESSO = 'E2E Doc Complesso Template v2';
```

In `GasArtifactFactory.createDocument`:

```ts
for (const paragraph of paragraphs) {
  if (typeof paragraph === 'string') {
    builder.appendParagraph(paragraph);
  } else if (paragraph.listType !== undefined) {
    builder.appendListItem(paragraph.text, { listType: paragraph.listType });
  } else {
    builder.appendParagraph(paragraph.text);
  }
}
```

- [ ] **Step 6: Run the focused tests and typecheck**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/gas-artifact-factory.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3 in ALDO**

```bash
git add types/gaslibs/index.d.ts src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/GasArtifactFactory.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/gas-artifact-factory.test.ts
git diff --cached --check
git commit -m "fix(onlinetests): provision native document lists"
```

---

### Task 4: Correct the ASL import recipe

**Files:**

- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**

- Consumes: GasDataImporter header-based records.
- Produces: `CONF_IMP.CONFIG` with canonical fields passed through unchanged.

- [ ] **Step 1: Change the fixture test first**

Replace the positional-map assertion with:

```ts
expect(config).toMatchObject({
  searchStrategy: 'FILE_SINGOLO',
  fileId: TEMPLATE_IDS.aslImportSheet,
  key: 'STUDENTE',
  conflictResolution: 'OVERWRITE'
});
expect(config).not.toHaveProperty('map');
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "CONF_IMP"
```

Expected: FAIL because `map` is still present.

- [ ] **Step 3: Remove only the invalid mapping**

Delete:

```ts
map: { A: 'STUDENTE', B: 'ANNO', C: 'ORE' },
```

Keep `OVERWRITE`, `STUDENTE`, and the source file unchanged.

- [ ] **Step 4: Run importer and fixture regressions**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/application/import-recipe-mapper.test.ts test/unit/application/import-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git diff --cached --check
git commit -m "fix(onlinetests): use ASL source headers"
```

---

### Task 5: Preserve non-enumerable CDU technical state

**Files:**

- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Test: `test/unit/application/sheet-materie-generator.test.ts`

**Interfaces:**

- Produces: a per-subject `Cdu` variant with updated `materiaCorrente` and the original non-enumerable `tech` value.

- [ ] **Step 1: Make the fixture reproduce the real CDU descriptor**

Refactor `buildCdu` so it first creates the enumerable base without `tech`, then attaches:

```ts
Object.defineProperty(cdu, 'tech', {
  value: {
    entita: { classe },
    servizi: [],
    pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] }
  },
  enumerable: false,
  writable: true,
  configurable: true
});
```

Add:

```ts
expect(Object.keys(cdu)).not.toContain('tech');
expect(() =>
  strategy.render('file_1', cdu, confDoc('SHEET_CON_MATERIE_E_PERMESSI'))
).not.toThrow();
```

Keep existing editor and protected-column assertions.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/sheet-materie-generator.test.ts -t "protects each subject column"
```

Expected: FAIL with `Cannot read properties of undefined (reading 'entita')`.

- [ ] **Step 3: Implement a technical-state-preserving variant**

Create a private helper or implement directly:

```ts
const variant = {
  ...cdu,
  meta: {
    ...cdu.meta,
    parametriInput: { ...cdu.meta.parametriInput, materiaCorrente: sigla }
  }
} as Cdu;

Object.defineProperty(variant, 'tech', {
  value: cdu.tech,
  enumerable: false,
  writable: true,
  configurable: true
});
```

Do not mutate `cdu.meta.parametriInput` in place.

- [ ] **Step 4: Add descriptor and metadata assertions**

Capture the CDU variants passed to a recording role resolver and assert:

```ts
expect(Object.getOwnPropertyDescriptor(variant, 'tech')).toMatchObject({
  enumerable: false,
  writable: true,
  configurable: true,
  value: cdu.tech
});
expect(variant.meta.parametriInput.materiaCorrente).toBe(expectedSigla);
expect(cdu.meta.parametriInput.materiaCorrente).toBeNull();
```

- [ ] **Step 5: Run strategy and role-resolution regressions**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/sheet-materie-generator.test.ts test/unit/application/risolutore-ruoli-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts test/unit/application/sheet-materie-generator.test.ts
git diff --cached --check
git commit -m "fix(documents): retain CDU tech for subject ACLs"
```

---

### Task 6: Refresh vendor, verify both repositories, and audit the graph

**Files:**

- Regenerate: `vendor/gaslibs.Code.js`
- Regenerate: `vendor/CHECKSUM`
- Modify only if required by a genuine regression: files already named in Tasks 1–5.

**Interfaces:**

- ALDO consumes the exact library bundle built from the two committed `GasLibraryFactory` changes.

- [ ] **Step 1: Run the full GasLibraryFactory verification**

Run:

```bash
cd GasLibraryFactory
npm test
npm run test:integration
npm run lint
npm run format:check
npm run build:testing
```

Expected: all commands exit 0.

- [ ] **Step 2: Refresh and verify ALDO's vendored library**

Run from the ALDO root:

```bash
npm run refresh:vendor
npm run verify:vendor
```

Expected: checksum verification succeeds.

- [ ] **Step 3: Run focused ALDO tests**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/gas-artifact-factory.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/application/import-recipe-mapper.test.ts test/unit/application/import-service.test.ts test/unit/application/sheet-materie-generator.test.ts test/unit/application/risolutore-ruoli-service.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run full ALDO static and test verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
npm run build:online
git diff --check
```

Expected: all commands exit 0 with zero test failures.

- [ ] **Step 5: Reindex both knowledge graphs**

Use codebase-memory-mcp:

```text
index_repository(
  repo_path="/home/giulio/Desktop/ALDO implementing/GasLibraryFactory",
  name="home-giulio-Desktop-ALDO-implementing-GasLibraryFactory",
  mode="full"
)

index_repository(
  repo_path="/home/giulio/Desktop/ALDO implementing",
  name="home-giulio-Desktop-ALDO-implementing",
  mode="full"
)
```

- [ ] **Step 6: Verify linkage and signatures**

Use `search_graph` to resolve the exact qualified names, then `trace_path` outbound/inbound for:

```text
DocumentBuilder.appendListItem
DocumentProcessorTagScanner._analyzeListLoops
GasArtifactFactory.createDocument
SheetMaterieConPermessiGeneratorStrategy.resolveDocentiMateria
```

Confirm ALDO's `appendListItem(text, { listType })` call matches the exported library method and the built bundle/type declaration.

- [ ] **Step 7: Run mandatory bypass, dead-code, and architecture queries**

First call `get_graph_schema`, then use `query_graph` on `home-giulio-Desktop-ALDO-implementing` to:

1. find ALDO `src/` functions containing prohibited native globals (`SpreadsheetApp`, `DriveApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`) and confirm zero unsanctioned results;
2. find ALDO functions/methods with zero incoming `CALLS` edges, excluding GAS triggers and deliberate entrypoints, and confirm the changed methods are reachable;
3. inspect cross-module dependency cycles.

Use `get_architecture` with `boundaries`, `layers`, `dependencies`, `hotspots`, and `clusters`. Investigate any new cycle or bypass before completion.

- [ ] **Step 8: Stage and commit only the vendor refresh**

```bash
git add vendor/gaslibs.Code.js vendor/CHECKSUM
git diff --cached --check
git commit -m "chore: refresh vendor for document list fixes"
```

- [ ] **Step 9: Perform final clean verification**

After all commits, rerun:

```bash
npm run verify:vendor
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
npm run build:online
git status --short
```

Expected: verification commands exit 0. `git status --short` may still list the user's pre-existing unrelated changes; no task file should remain uncommitted.

- [ ] **Step 10: Live GAS acceptance**

Push only when separately authorized, then run `runE2eScenarios` in the online Apps Script project. Acceptance requires:

- scenario 8 documents show native representative-list glyphs;
- scenario 9 inserts/updates all four expected ASL rows;
- scenario 10 contains no unresolved `{{...}}` markers and shows native bullet/number formatting;
- scenario 11 completes protection read-back for every generated sheet without transaction rollback.

Record the GAS execution summary and any document/sheet links needed for manual glyph inspection.
