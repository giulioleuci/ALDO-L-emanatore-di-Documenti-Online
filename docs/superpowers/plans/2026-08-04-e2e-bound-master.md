# E2E Bound Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy online build to new root-Drive Sheets-bound `_ALDO_E2E_MASTER`, then make bound sheet sole E2E master database.

**Architecture:** Extend `GasOnlineTestFramework` with generic open-reset-wrap spreadsheet-by-ID primitive. ALDO exposes it through `GasSampleSpreadsheetFactory`; `E2eSampleDatabaseBuilder` receives bound master instead of creating second master. E2E runner requires registered master property before artifacts exist.

**Tech Stack:** Google Apps Script V8, TypeScript, JavaScript ESM, Jest, `@google/clasp`, GasLibraryFactory.

## Global Constraints

- GAS V8 only; synchronous code; never edit generated `dist/*`.
- Native GAS globals only in sanctioned `GasOnlineTestFramework`; ALDO uses library API.
- Modify library source, test/build it, run `npm run refresh:vendor`; never hand-edit `vendor/gaslibs.Code.js`.
- Generated sample, historical, template, attachment, and folder artifacts stay current locations; never move or rename them.
- Preserve existing ALDO `onOpen` menu. No E2E menu entry.
- Replacement uses explicit `--replace`. It overwrites local deployment pointers only, never deletes old Drive files or script project.

---

## File Structure

- `GasLibraryFactory/GasOnlineTestFramework/src/TestContext.js`: generic builder from known spreadsheet ID.
- `GasLibraryFactory/GasOnlineTestFramework/__tests__/TestContext.test.js`: library test.
- `GasLibraryFactory/DOCS_LIBS/GasOnlineTestFramework.md`: regenerated API docs.
- `types/gaslibs/index.d.ts`: ALDO declaration for library API.
- `src/onlinetests/SampleDatabaseBuilder.ts`: existing-master factory contract.
- `src/onlinetests/GasSampleSpreadsheetFactory.ts`: known-master open/reset delegation.
- `src/onlinetests/E2eSampleDatabaseBuilder.ts`: consume master, never create it.
- `src/onlinetests/index.ts`: validate property, inject master into builder.
- `test/unit/onlinetests/e2e-sample-database-builder.test.ts`: master reuse behavior.
- `test/unit/onlinetests/index.test.ts`: missing/registered property behavior.
- `scripts/setup-testonline-project.cjs`: new title and safe replacement switch.
- `test/unit/scripts/setup-testonline-project.test.ts`: pure provisioning-state tests.

### Task 1: Add generic existing-spreadsheet library builder

**Files:**
- Modify: `GasLibraryFactory/GasOnlineTestFramework/src/TestContext.js:82-192`
- Modify: `GasLibraryFactory/GasOnlineTestFramework/__tests__/TestContext.test.js`
- Modify: `GasLibraryFactory/DOCS_LIBS/GasOnlineTestFramework.md`

**Interfaces:**
- Produces: `TestContext.buildSampleSpreadsheetById(spreadsheetId): SampleSpreadsheetBuilder`.
- Consumes: existing `resetSpreadsheet(ss)` and `SampleSpreadsheetBuilder`.

- [ ] **Step 1: Write failing library test**

```javascript
it('opens, resets, and wraps spreadsheet by ID', () => {
  const spreadsheet = makeSpreadsheet('bound-master-id', ['MASTER', 'stale']);
  global.SpreadsheetApp.openById = jest.fn(() => spreadsheet);

  const builder = new TestContext().buildSampleSpreadsheetById('bound-master-id');

  expect(global.SpreadsheetApp.openById).toHaveBeenCalledWith('bound-master-id');
  expect(builder.id).toBe('bound-master-id');
  expect(spreadsheet.getSheets()).toHaveLength(1);
  expect(spreadsheet.getSheets()[0].getName()).toBe('Sheet1');
});
```

- [ ] **Step 2: Verify test fails**

Run: `npx jest GasOnlineTestFramework/__tests__/TestContext.test.js -t "opens, resets, and wraps"`

Expected: FAIL, `buildSampleSpreadsheetById` missing.

- [ ] **Step 3: Implement minimal library method**

Add JSDoc and method next to `buildSampleSpreadsheet`:

```javascript
buildSampleSpreadsheetById(spreadsheetId) {
  this._trackApiCall();
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  this.resetSpreadsheet(spreadsheet);
  return new SampleSpreadsheetBuilder(spreadsheet);
}
```

Direct `SpreadsheetApp` remains only library sanctioned online-test boundary. Regenerate API reference from JSDoc.

- [ ] **Step 4: Verify library**

```bash
npx jest GasOnlineTestFramework/__tests__/TestContext.test.js
npm run lint
npm run build:testing -- --online-tests=false
```

Expected: all pass, no manual `dist/` change.

- [ ] **Step 5: Commit library task**

```bash
git -C GasLibraryFactory add GasOnlineTestFramework/src/TestContext.js GasOnlineTestFramework/__tests__/TestContext.test.js DOCS_LIBS/GasOnlineTestFramework.md
git -C GasLibraryFactory commit -m "feat(testing): build sample spreadsheet by id"
```

### Task 2: Vendor API and E2E builder reuse

**Files:**
- Modify: `types/gaslibs/index.d.ts:1670-1686`
- Modify: `src/onlinetests/SampleDatabaseBuilder.ts:29-43`
- Modify: `src/onlinetests/GasSampleSpreadsheetFactory.ts:10-16`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts:271-323`
- Modify: `test/unit/onlinetests/e2e-sample-database-builder.test.ts:49-122`
- Generated: `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`

**Interfaces:**
- Consumes: Task 1 `TestContext.buildSampleSpreadsheetById`.
- Produces: `ISampleSpreadsheetFactory.openExistingSpreadsheet(spreadsheetId: string): ISampleSpreadsheet`.
- Produces: `E2eSampleDatabaseBuilder.build(templateIds: E2eTemplateIds, master: ISampleSpreadsheet): E2eSampleDatabase`.

- [ ] **Step 1: Write failing bound-master builder test**

Extend `RecordingSpreadsheet` fixture and factory with pre-existing `bound-master-id`:

```typescript
const master = new RecordingSpreadsheet('bound-master-id');
const result = new E2eSampleDatabaseBuilder(spreadsheets, drive).build(TEMPLATE_IDS, master);

expect(result.masterSpreadsheetId).toBe('bound-master-id');
expect(sheets.get('_ALDO_E2E_MASTER')).toBeUndefined();
expect(master.rows.get(TABLE.MASTER)).toHaveLength(2);
```

Also assert canonical `MASTER` header and current then historical registrations.

- [ ] **Step 2: Verify test fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "bound master"`

Expected: FAIL, builder accepts only templates and creates `_ALDO_E2E_MASTER`.

- [ ] **Step 3: Refresh vendor and type API**

```bash
npm run refresh:vendor
npm run verify:vendor
```

Add declaration:

```typescript
buildSampleSpreadsheetById(spreadsheetId: string): SampleSpreadsheetBuilder;
```

- [ ] **Step 4: Implement factory and builder boundary**

```typescript
openExistingSpreadsheet(spreadsheetId: string): ISampleSpreadsheet;

openExistingSpreadsheet(spreadsheetId: string): ISampleSpreadsheet {
  return testContext.buildSampleSpreadsheetById(spreadsheetId);
}
```

Change builder initialization:

```typescript
build(templateIds: E2eTemplateIds, master: ISampleSpreadsheet): E2eSampleDatabase {
  const baseName = '_ALDO_E2E';
  const folderId = this.drive.createFolder(baseName);
  const sample = this.spreadsheets.createSpreadsheet(`${baseName}_SAMPLE`);
  master.addSheet(TABLE.MASTER, Object.values(COL_MASTER));
  // existing sample/prior setup and seedMaster(master, ...) stay unchanged
}
```

Remove only `this.spreadsheets.createSpreadsheet(`${baseName}_MASTER`)`. Preserve sample/prior artifact names, folders, return shape, and `seedMaster` order.

- [ ] **Step 5: Verify ALDO builder**

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts
npm run typecheck
npm run lint
npm run verify:vendor
```

Expected: pass, no ALDO native GAS global call.

- [ ] **Step 6: Commit ALDO builder task**

```bash
git add types/gaslibs/index.d.ts vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION src/onlinetests/SampleDatabaseBuilder.ts src/onlinetests/GasSampleSpreadsheetFactory.ts src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "feat(onlinetests): reuse bound E2E master"
```

### Task 3: Require master registration before E2E artifacts

**Files:**
- Modify: `src/onlinetests/index.ts:252-298`
- Modify: `test/unit/onlinetests/index.test.ts:234-359`

**Interfaces:**
- Consumes: Task 2 factory and builder interfaces.
- Consumes: `PROP_MASTER_SPREADSHEET_ID` set by `impostaMasterSpreadsheetId` in bound master.
- Produces: `executeE2eScenarios()` always bootstraps ALDO against bound master.

- [ ] **Step 1: Write failing runner tests**

```typescript
expect(() => executeE2eScenarios({ properties: fakeProperties({}) })).toThrow(
  'MASTER_SPREADSHEET_ID missing. Run impostaMasterSpreadsheetId from _ALDO_E2E_MASTER first.'
);

const properties = fakeProperties({ [PROP_MASTER_SPREADSHEET_ID]: 'bound-master-id' });
executeE2eScenarios({ properties, spreadsheetFactory, /* existing fakes */ });
expect(spreadsheetFactory.openExistingSpreadsheet).toHaveBeenCalledWith('bound-master-id');
expect(properties.set).toHaveBeenCalledWith(PROP_MASTER_SPREADSHEET_ID, 'bound-master-id');
```

Assert `createSpreadsheet` receives sample/prior names only.

- [ ] **Step 2: Verify test fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/index.test.ts -t "bound master"`

Expected: FAIL, current code replaces property with a new master ID.

- [ ] **Step 3: Implement validation and injection**

```typescript
const masterSpreadsheetId = properties.get(PROP_MASTER_SPREADSHEET_ID)?.trim();
if (!masterSpreadsheetId) {
  throw new Error(
    'MASTER_SPREADSHEET_ID missing. Run impostaMasterSpreadsheetId from _ALDO_E2E_MASTER first.'
  );
}
const master = spreadsheetFactory.openExistingSpreadsheet(masterSpreadsheetId);
```

Pass master to builder. Keep property set after build; `sample.masterSpreadsheetId` is bound ID. Retain existing nonempty-ID log. Do not change `runE2eScenarios`, `onOpen`, or menu.

- [ ] **Step 4: Verify runner and ALDO suite**

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/index.test.ts
npm test -- --runInBand
npm run typecheck
npm run lint
```

Expected: pass; missing property fails before artifact creation.

- [ ] **Step 5: Commit runner task**

```bash
git add src/onlinetests/index.ts test/unit/onlinetests/index.test.ts
git commit -m "fix(onlinetests): require bound master registration"
```

### Task 4: Safely provision replacement project

**Files:**
- Modify: `scripts/setup-testonline-project.cjs:1-114`
- Create: `test/unit/scripts/setup-testonline-project.test.ts`

**Interfaces:**
- Produces: `npm run setup:testonline -- --replace`, new root-Drive `_ALDO_E2E_MASTER` with local tracking updated.
- Preserves: default invocation idempotent and cannot repoint current deployment.

- [ ] **Step 1: Write failing pure setup-state tests**

```typescript
expect(resolveSetupAction(existing, { claspExists: true, trackingExists: true }, false)).toBe('existing');
expect(resolveSetupAction(existing, { claspExists: true, trackingExists: true }, true)).toBe('create');
expect(resolveSetupAction(null, { claspExists: true, trackingExists: false }, false)).toBe('partial-error');
```

- [ ] **Step 2: Verify test fails**

Run: `npx jest --config jest.config.cjs test/unit/scripts/setup-testonline-project.test.ts`

Expected: FAIL, no exported resolver.

- [ ] **Step 3: Implement explicit replacement behavior**

```javascript
function resolveSetupAction(existing, partial, replace) {
  if (existing !== null && !replace) return 'existing';
  if (partial.claspExists && !partial.trackingExists && !replace) return 'partial-error';
  return 'create';
}
```

Set `SHEET_TITLE = '_ALDO_E2E_MASTER'`. Parse `--replace`; guard `main()` with `if (require.main === module)`; export resolver. With replacement, write `.clasp.json` and ignored `.aldo-testonline.json` only after successful `clasp create` and ID extraction. Preserve scratch cleanup/default partial-state error. Final instructions: deploy, then run `impostaMasterSpreadsheetId` once.

- [ ] **Step 4: Verify provisioning script**

```bash
npx jest --config jest.config.cjs test/unit/scripts/setup-testonline-project.test.ts
npm test -- --runInBand
npm run lint
```

Expected: pass; no flag cannot replace target.

- [ ] **Step 5: Commit provisioning task**

```bash
git add scripts/setup-testonline-project.cjs test/unit/scripts/setup-testonline-project.test.ts
git commit -m "feat(onlinetests): provision bound E2E master"
```

### Task 5: Create and deploy GAS project

**Files:**
- Generated, ignored: `.clasp.json`, `.aldo-testonline.json`, `dist/*`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: root-Drive `_ALDO_E2E_MASTER`, bound online build, existing ALDO menu.

- [ ] **Step 1: Verify deployment scope**

```bash
git status --short
git diff --check
npm run verify:vendor
```

Expected: intended work plus pre-existing user-owned untracked file only; do not stage unrelated file.

- [ ] **Step 2: Create replacement project**

Run: `npm run setup:testonline -- --replace`

Expected: new `scriptId`, `masterSpreadsheetId`, exact title `_ALDO_E2E_MASTER`; old project/files unchanged.

- [ ] **Step 3: Build and push online build**

Run: `npm run push:online`

Expected: offline gate, online build, and `clasp push` pass against new script ID.

- [ ] **Step 4: Register and inspect master**

In `_ALDO_E2E_MASTER`, run `impostaMasterSpreadsheetId` once from Apps Script editor. Reopen sheet; ALDO menu appears and no E2E menu item appears.

- [ ] **Step 5: Live E2E smoke test**

Run `runE2eScenarios` in Apps Script editor. Confirm `MASTER` has current then historical row, IDs point to generated databases, no second `_ALDO_E2E_MASTER` exists in E2E folders, and logs pass.

- [ ] **Step 6: Final verification**

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:integration
npm run test:build
```

Expected: all pass before completion.
