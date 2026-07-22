# testonline MASTER Sheet + GAS Project Setup/Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An idempotent local setup script that creates (or reuses) a real MASTER Google Sheet with a bound Apps Script project, plus a one-time GAS entry point to bootstrap that project's own `PROP_MASTER_SPREADSHEET_ID`, so `npm run push:online` (already existing, unchanged) has somewhere real to deploy to.

**Architecture:** `scripts/setup-testonline-project.cjs` (Node, same style as `scripts/refresh-vendor.cjs`) drives `clasp create --type sheets` inside a scratch directory to mint a Sheet+bound-script pair, then writes ALDO root's `.clasp.json` and a new tracking file `.aldo-testonline.json`, both gitignored. A new `impostaMasterSpreadsheetId()` GAS entry point (run once, manually, from the Apps Script editor after the first push) reads its own bound container's spreadsheet id via the already-vendored `SpreadsheetService.getActiveStandard()` (an existing GasLibraryFactory "escape hatch" method, not previously exposed in ALDO's ambient types) and writes it to `ScriptProperties` via the existing `ScriptPropertiesFacade` — zero native-global touches, fully within the `GoogleApiWrapper`-only rule.

**Tech Stack:** Node.js (`fs`, `path`, `child_process`, `os`), `@google/clasp` CLI, TypeScript (the one small GAS entry point).

## Global Constraints

- No new npm dependencies — `@google/clasp@^2.4.2` is already a devDependency; no `googleapis` package.
- Native GAS globals only inside `GoogleApiWrapper` (L2) — the entry point in this plan reaches the bound spreadsheet via the already-vendored `SpreadsheetService.getActiveStandard()` and script properties via the existing `ScriptPropertiesFacade`, never `SpreadsheetApp`/`PropertiesService` directly.
- `.clasp.json` and the new `.aldo-testonline.json` are both gitignored (local/per-environment state) — never commit either.
- No new push script — `npm run push:online` (existing, unchanged) is reused once `.clasp.json` points at the right project.

---

## Task 1: `impostaMasterSpreadsheetId` GAS entry point

**Files:**
- Modify: `types/gaslibs/index.d.ts`
- Modify: `src/index.ts`
- Modify: `test/unit/index.test.ts`

**Interfaces:**
- Consumes: ambient `SpreadsheetService.getActiveStandard(): { getId(): string }` (already-vendored `SpreadsheetHybridManager.getActiveStandard`, `GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/SpreadsheetHybridManager.js:44-46`, delegated onto every `SpreadsheetService` instance, confirmed present in the current `vendor/gaslibs.Code.js` — no vendor refresh needed, only the ambient type was missing); `PROP_MASTER_SPREADSHEET_ID` (`src/config/Bootstrap.ts:51`); `ScriptPropertiesFacade` (`src/infrastructure/facades/PropertiesFacade.ts:11-25`).
- Produces: `impostaMasterSpreadsheetId(): void`, exposed on `globalThis` as a GAS Run-dropdown entry point.

- [ ] **Step 1: Write the failing test**

In `test/unit/index.test.ts`, add `PROP_MASTER_SPREADSHEET_ID` to the existing `jest.mock('../../src/config/Bootstrap', ...)` factory (line 1-8), since `src/index.ts` will need to import it from there:

```ts
jest.mock('../../src/config/Bootstrap', () => ({
  initAldo: jest.fn(),
  creaJobRunner: jest.fn(() => ({})),
  avviaGenerazioneDataDriven: jest.fn(),
  avviaInvioNotificheDataDriven: jest.fn(),
  avviaImportazioneDataDriven: jest.fn(),
  riprendiJobSospeso: jest.fn(),
  PROP_MASTER_SPREADSHEET_ID: 'MASTER_SPREADSHEET_ID'
}));
```

Add the import (after line 18, `import { initAldo, riprendiJobSospeso } ...`):

```ts
import { impostaMasterSpreadsheetId } from '../../src/index';
```

Add a new test after the `resumeJob` describe block (after line 41):

```ts
describe('impostaMasterSpreadsheetId', () => {
  test('reads the bound spreadsheet id via SpreadsheetService.getActiveStandard and writes it to ScriptProperties', () => {
    const getActiveStandard = jest.fn().mockReturnValue({ getId: () => 'BOUND_SHEET_ID' });
    const spreadsheetServiceSpy = jest
      .spyOn(ServiceFactory, 'getSpreadsheetService')
      .mockReturnValue({ getActiveStandard } as never);
    const setPropertySpy = jest.spyOn(ScriptPropertiesFacade.prototype, 'set');

    impostaMasterSpreadsheetId();

    expect(getActiveStandard).toHaveBeenCalled();
    expect(setPropertySpy).toHaveBeenCalledWith('MASTER_SPREADSHEET_ID', 'BOUND_SHEET_ID');

    spreadsheetServiceSpy.mockRestore();
    setPropertySpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/index.test.ts`
Expected: FAIL — `impostaMasterSpreadsheetId is not a function` (or a TypeScript compile error if `ScriptPropertiesFacade` isn't yet imported into the test — add `import { ScriptPropertiesFacade } from '../../src/infrastructure/facades/PropertiesFacade';` alongside the other imports at the top of the test file)

- [ ] **Step 3: Add the ambient type**

In `types/gaslibs/index.d.ts`, inside `class SpreadsheetService { ... }` (the same class Plan 2 Task 2 may have already extended with `createSpreadsheet` — add this one regardless, order doesn't matter), add:

```ts
    /** The spreadsheet this script is bound to (only meaningful for a container-bound script, e.g. run from the Apps Script editor's Run dropdown on the MASTER sheet). */
    getActiveStandard(): { getId(): string };
```

- [ ] **Step 4: Implement `impostaMasterSpreadsheetId`**

In `src/index.ts`, add the import (after line 17, the closing of the `Bootstrap` import block) — extend the existing import instead of adding a new one:

```ts
import {
  initAldo,
  creaJobRunner,
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  avviaImportazioneDataDriven,
  riprendiJobSospeso,
  PROP_MASTER_SPREADSHEET_ID
} from './config/Bootstrap';
```

Add a new import for `ScriptPropertiesFacade` (after the `GasUiFacade` import at line 24):

```ts
import { ScriptPropertiesFacade } from './infrastructure/facades/PropertiesFacade';
```

Add the function after `aldoPing` (after line 28, before `onOpen`):

```ts
/**
 * One-time manual bootstrap (setup script, spec 3): run once from the Apps Script editor's
 * Run dropdown after the first push to a MASTER-bound project. Reads this script's own bound
 * container id via the vendored SpreadsheetService escape hatch (never SpreadsheetApp
 * directly) and writes it to ScriptProperties — the value initAldo() requires on every
 * subsequent execution (Bootstrap.ts:275-280).
 */
export function impostaMasterSpreadsheetId(): void {
  const id = ServiceFactory.getSpreadsheetService().getActiveStandard().getId();
  new ScriptPropertiesFacade().set(PROP_MASTER_SPREADSHEET_ID, id);
}
```

Add it to the `globalThis` assignments (inside the existing `eslint-disable`/`eslint-enable` block, after line 57's `(globalThis as any).aldoPing = aldoPing;`):

```ts
(globalThis as any).impostaMasterSpreadsheetId = impostaMasterSpreadsheetId;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/index.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors (lint specifically confirms no `no-restricted-globals` violation — `SpreadsheetApp`/`PropertiesService` are never referenced directly)

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add types/gaslibs/index.d.ts src/index.ts test/unit/index.test.ts
git commit -m "feat: add impostaMasterSpreadsheetId one-time GAS bootstrap entry point"
```

---

## Task 2: `scripts/setup-testonline-project.cjs`

**Files:**
- Create: `scripts/setup-testonline-project.cjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run setup:testonline` — idempotent; first run creates `.clasp.json` + `.aldo-testonline.json`, subsequent runs no-op and print the existing ids.

This script is Node tooling (`fs`/`child_process`/`os`), not application code — per the design doc's Testing section, it follows this repo's existing convention of NOT being Jest-unit-tested (same as `refresh-vendor.cjs`/`verify-vendor.cjs`), verified instead by actually running it. Steps below are manual-verification, not TDD.

- [ ] **Step 1: Add the tracking file to `.gitignore`**

In `.gitignore`, add `.aldo-testonline.json` after the existing `.clasp.json` line:

```
node_modules/
dist/
coverage/
*.log
.clasp.json
.aldo-testonline.json
.remember/

.superpowers/

scripts/email-examples/

GasLibraryFactory/
.antigravitycli/
```

- [ ] **Step 2: Write `scripts/setup-testonline-project.cjs`**

Create `scripts/setup-testonline-project.cjs`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const claspJsonPath = path.join(repoRoot, '.clasp.json');
const trackingPath = path.join(repoRoot, '.aldo-testonline.json');
const SHEET_TITLE = 'ALDO MASTER (testonline)';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function alreadySetUp() {
  const clasp = readJson(claspJsonPath);
  const tracking = readJson(trackingPath);
  if (clasp === null || tracking === null) return null;
  if (typeof clasp.scriptId !== 'string' || clasp.scriptId !== tracking.scriptId) return null;
  return tracking;
}

function partialState() {
  const clasp = readJson(claspJsonPath);
  const tracking = readJson(trackingPath);
  return { claspExists: clasp !== null, trackingExists: tracking !== null };
}

function createProject() {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aldo-testonline-'));
  console.log(`Creating MASTER sheet + bound Apps Script project ("${SHEET_TITLE}")...`);
  let output;
  try {
    output = execSync(`npx clasp create --type sheets --title "${SHEET_TITLE}"`, {
      cwd: scratchDir,
      encoding: 'utf8'
    });
  } catch (err) {
    console.error('clasp create failed:');
    console.error(err.stdout || err.message);
    console.error(
      '\nIf this mentions the Apps Script API not being enabled, visit https://script.google.com/home/usersettings, enable it, and re-run this script.' +
        '\nIf clasp create is blocked entirely (e.g. by a Workspace admin policy), see the manual fallback in docs/superpowers/specs/2026-07-22-testonline-project-setup-push-design.md ("Fallback: if clasp create fails").'
    );
    process.exit(1);
  }
  console.log(output);

  const scratchClasp = readJson(path.join(scratchDir, '.clasp.json'));
  if (scratchClasp === null || typeof scratchClasp.scriptId !== 'string') {
    console.error('clasp create succeeded but no .clasp.json with a scriptId was produced.');
    process.exit(1);
  }

  const urlMatch = output.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch === null) {
    console.error(
      'clasp create succeeded but its output did not contain a recognizable spreadsheet URL. ' +
        'Open the script (clasp open) and copy the spreadsheet id manually into .aldo-testonline.json.'
    );
    process.exit(1);
  }
  const masterSpreadsheetId = urlMatch[1];

  fs.writeFileSync(claspJsonPath, JSON.stringify({ scriptId: scratchClasp.scriptId, rootDir: './dist' }, null, 2) + '\n');
  fs.writeFileSync(
    trackingPath,
    JSON.stringify(
      { scriptId: scratchClasp.scriptId, masterSpreadsheetId, createdAt: new Date().toISOString() },
      null,
      2
    ) + '\n'
  );

  fs.rmSync(scratchDir, { recursive: true, force: true });

  console.log(`Created. scriptId=${scratchClasp.scriptId} masterSpreadsheetId=${masterSpreadsheetId}`);
  console.log(
    'Next steps: npm run push:online, then open the MASTER sheet -> Extensions -> Apps Script -> ' +
      'Run -> impostaMasterSpreadsheetId (once).'
  );
}

function main() {
  const existing = alreadySetUp();
  if (existing !== null) {
    console.log(
      `Already set up: scriptId=${existing.scriptId} masterSpreadsheetId=${existing.masterSpreadsheetId} (created ${existing.createdAt}). Nothing to do.`
    );
    return;
  }

  const { claspExists, trackingExists } = partialState();
  if (claspExists && !trackingExists) {
    console.error(
      '.clasp.json exists but .aldo-testonline.json does not (or scriptId does not match) — ' +
        'refusing to run clasp create again, which would mint a SECOND MASTER sheet.\n' +
        'Either restore .aldo-testonline.json manually (scriptId from .clasp.json + the MASTER ' +
        "sheet's spreadsheet id from its URL), or delete .clasp.json to start fresh.\n" +
        'See docs/superpowers/specs/2026-07-22-testonline-project-setup-push-design.md, ' +
        '"Fallback: if clasp create fails" for the manual recovery steps.'
    );
    process.exit(1);
  }

  createProject();
}

main();
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add a new script after `"verify:vendor": "node scripts/verify-vendor.cjs",` (before `"build:testing"`):

```json
    "setup:testonline": "node scripts/setup-testonline-project.cjs",
```

- [ ] **Step 4: Manual verification — first run creates**

Run: `npm run setup:testonline`
Expected: prints `Creating MASTER sheet...`, then `Created. scriptId=... masterSpreadsheetId=...`, then the next-steps message. Confirm `.clasp.json` and `.aldo-testonline.json` now exist at the repo root with matching `scriptId` values: `cat .clasp.json .aldo-testonline.json`

- [ ] **Step 5: Manual verification — second run is a no-op**

Run: `npm run setup:testonline` again
Expected: prints `Already set up: scriptId=... masterSpreadsheetId=... (created ...). Nothing to do.` — confirm neither file's content or mtime changed: `ls -la .clasp.json .aldo-testonline.json`

- [ ] **Step 6: Manual verification — partial-state guard**

Run: `mv .aldo-testonline.json /tmp/aldo-testonline-backup.json && npm run setup:testonline`
Expected: prints the "refusing to run clasp create again" error and exits non-zero (check with `echo $?`)
Then restore: `mv /tmp/aldo-testonline-backup.json .aldo-testonline.json`

- [ ] **Step 7: Push to the new project**

Run: `npm run push:online`
Expected: builds in `online` mode (unminified) and pushes successfully to the scriptId just created

- [ ] **Step 8: Bootstrap the deployed project's ScriptProperties**

Open the MASTER sheet (from Step 4's printed URL, or `npx clasp open`) → Extensions → Apps Script → select `impostaMasterSpreadsheetId` in the function dropdown → Run. Confirm success in the execution log (no errors).

- [ ] **Step 9: Commit**

```bash
git add scripts/setup-testonline-project.cjs package.json .gitignore
git commit -m "feat: add idempotent testonline MASTER sheet + GAS project setup script"
```

Note: `.clasp.json` and `.aldo-testonline.json` themselves are gitignored (Step 1) and must NOT be added — only the script, `package.json`, and `.gitignore` changes are committed.

---

## Self-Review Notes

- **Spec coverage:** the idempotent create-or-reuse setup script with its tracking file (Task 2), the one-time GAS bootstrap entry point (Task 1), reuse of the existing `push:online` with no new push script, and the documented `clasp create`-failure fallback (referenced from the script's own error message, pointing at the design doc) — every section of `2026-07-22-testonline-project-setup-push-design.md` maps to a task.
- **Placeholder scan:** none — `setup-testonline-project.cjs` is complete, runnable code with no unused imports or speculative scaffolding (unlike `refresh-vendor.cjs`, this script needs no checksum, so it doesn't require `crypto`); `impostaMasterSpreadsheetId` is complete.
- **Type consistency:** `impostaMasterSpreadsheetId` (Task 1) reads `PROP_MASTER_SPREADSHEET_ID` from the exact same `Bootstrap.ts` export `initAldo()` reads (Plan 1 Task 5 / existing `Bootstrap.ts:275`) — the two are guaranteed to agree because they import the same constant, not a hand-copied string literal.
