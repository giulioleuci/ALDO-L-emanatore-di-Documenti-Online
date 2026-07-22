# testonline MASTER sheet + GAS project setup, and push — design

Spec 3 of 3 (depends on: `2026-07-21-test-mode-email-redirect-design.md` for `MASTER.TEST_MODE`; `2026-07-21-testonline-mock-db-e2e-design.md` for the mock DB/e2e checks this project will actually run once deployed).

## Goal

Two small local scripts:

1. **Setup** — idempotently create (or find, if already created) a real MASTER Google Sheet and a Google Apps Script project bound to it, on whatever Google account clasp is currently authenticated as. Never recreate if it already exists.
2. **Push** — deploy ALDO (with GasLibraryFactory vendored in) in `online`/unminified mode to that project.

## Existing precedent found

- Root repo has **no** `.clasp.json` today — it's gitignored (`.gitignore`: `.clasp.json`) and was never created; this is exactly the "doesn't already exist" case the user described.
- `GasLibraryFactory/.clasp.json` shows the expected shape: `{ "scriptId": "...", "rootDir": "./dist" }` — this is what `push:testing`/`push:online` (bare `clasp push`) already expect to find at ALDO's root once it exists.
- clasp is already authenticated locally (`~/.clasprc.json` present) and has a working precedent (GLF's real deployed script) — confirmed with the user this session is what the setup script should just use as-is, no account-identity verification step.
- `@google/clasp@^2.4.2` is already a devDependency; no new dependency needed. `clasp create --type sheets --title "<name>"` creates a Google Sheet **and** its container-bound Apps Script project in one call — exactly "create MASTER sheet + associate a GAS project if it doesn't already exist."

## Idempotency / persistence

A new gitignored file, `.aldo-testonline.json` (repo root, same tier as `.clasp.json`), stores:

```json
{
  "scriptId": "...",
  "masterSpreadsheetId": "...",
  "createdAt": "2026-07-22T..."
}
```

`scripts/setup-testonline-project.cjs`:

1. If `.aldo-testonline.json` exists and `.clasp.json` exists with a matching `scriptId`, treat as already set up — print the existing ids, do nothing further (idempotent no-op, matches the "persistent, does not need to be recreated" requirement already established for the mock DB/templates in spec 2, applied here to the project itself).
2. Otherwise, run `clasp create --type sheets --title "<fixed name>"` inside a **scratch temp directory** (not the repo root — `clasp create` wants to write its own fresh manifest/`.clasp.json` into an empty directory, and ALDO's root already has its own `appsscript.json` and non-empty tree; running it in `os.tmpdir()`-based scratch avoids any collision).
3. Read the scratch dir's `.clasp.json` (`scriptId`) and the created spreadsheet id (`clasp create`'s stdout reports the new Sheet's URL, containing the spreadsheet id) to get both ids.
4. Write ALDO root's `.clasp.json` = `{ "scriptId": "<scriptId>", "rootDir": "./dist" }` — the same shape `push:testing`/`push:online` already assume.
5. Write `.aldo-testonline.json` with both ids + timestamp.
6. Print next-step instructions (below).
7. Delete the scratch directory.

Fixed sheet title: `"ALDO MASTER (testonline)"` — distinguishes it from any future production MASTER sheet by name, consistent with the mock-DB/template naming convention already chosen in spec 2.

## New GAS entry point: `impostaMasterSpreadsheetId`

`Bootstrap.ts`'s `initAldo()` reads `PROP_MASTER_SPREADSHEET_ID` from `ScriptProperties` and throws `ConfigurationError` if unset (existing code, `src/config/Bootstrap.ts:275-280`) — nothing programmatic (clasp, Apps Script API) can set a `ScriptProperties` value from outside a running script, so this needs one manual one-time step after the first push, done from inside the deployed project itself.

Because the new script project is **container-bound to the MASTER sheet itself**, the bound script's own container id is exactly the value that needs to go into `PROP_MASTER_SPREADSHEET_ID` — no argument needed:

```ts
// src/index.ts (assigned onto globalThis alongside the other GAS entry points)
export function impostaMasterSpreadsheetId(): void {
  const id = SpreadsheetApp.getActiveSpreadsheet().getId();
  PropertiesService.getScriptProperties().setProperty(PROP_MASTER_SPREADSHEET_ID, id);
}
```

Run once, manually, from the Apps Script editor's Run dropdown after the first push — same discoverability convention already established for `runOnlineTests`/`runE2eScenarios` (spec 2) as GAS Run-dropdown entry points. `SpreadsheetApp`/`PropertiesService` access here is inside `src/index.ts`'s top-level entry-point layer, the same sanctioned boundary `EntryPoints.ts`/`index.ts` already occupy (native-global calls at the entry-point seam are the established exception to the `GoogleApiWrapper`-only rule, not a new one).

## Push

No new push script. `npm run push:online` (existing: `build:online && clasp push`) already does exactly what's needed — unminified (`compress:false, mangle:false, beautify:true`), builds the `onlinetests` entry, runs the offline suite as a pre-push gate — **once `.clasp.json` points at the new project**, which `setup-testonline-project.cjs` guarantees. Confirmed with the user: "push ALDO and GLF" means the single merged bundle `push:online` already produces (GasLibraryFactory is vendored into `dist/Code.js`; no separate push of GasLibraryFactory's own standalone script project).

## `package.json`

```json
"setup:testonline": "node scripts/setup-testonline-project.cjs"
```

Full first-time flow: `npm run setup:testonline` → `npm run push:online` → open the new MASTER sheet → Extensions ▸ Apps Script ▸ Run ▸ `impostaMasterSpreadsheetId` once → subsequent `runOnlineTests`/`runE2eScenarios` (spec 2) work.

## Fallback: if `clasp create` fails

Per the user's "if not, provide valid alternatives" instruction. clasp's own precedent in this repo shows the account works today, so this is a documented contingency, not an expected path:

- **Apps Script API not enabled for the account** — `clasp create` fails with a link to `script.google.com/home/usersettings`; the script should surface that exact error text rather than swallowing it, since the fix is a one-click toggle at that URL, then re-run.
- **Fully manual alternative** (e.g. a Workspace admin policy blocks `clasp create` outright): create a Google Sheet by hand, Extensions ▸ Apps Script, Project Settings ▸ copy the Script ID, then manually write `.clasp.json` and `.aldo-testonline.json` with that id and the sheet's id (from its URL) — `setup-testonline-project.cjs` should detect a pre-existing valid `.clasp.json`/`.aldo-testonline.json` pair (case 1 above) and treat manual setup as already-done, so this fallback re-enters the same idempotent path rather than needing separate script support.

## Error handling

- `clasp create` failure: print clasp's stderr verbatim (it already contains the actionable next step, e.g. the Apps Script API enablement link) and exit non-zero — no retry loop, no silent fallback to a stale/wrong id.
- Partial state (e.g. `.clasp.json` written but `.aldo-testonline.json` missing, from an interrupted prior run): detect the mismatch explicitly and re-derive `.aldo-testonline.json` from `.clasp.json`'s `scriptId` rather than blindly re-running `clasp create` (which would mint a second, orphaned Sheet+project) — the script should never create a second MASTER sheet just because one of the two tracking files is missing.

## Testing

- `scripts/setup-testonline-project.cjs` is a thin orchestration script (`fs`/`child_process`, same style as `refresh-vendor.cjs`) — not unit-tested with Jest, consistent with how the other `scripts/*.cjs` build tooling is verified today (`test/build/` covers build **output shape**, not these orchestration scripts themselves).
- `impostaMasterSpreadsheetId`: thin enough (2 native calls) that it's exempt from unit testing the same way other pure entry-point globals in `src/index.ts` are — verified live, by actually running it once as documented above.
- End-to-end proof of this whole spec is: `npm run setup:testonline` (first run creates, second run no-ops) followed by a successful `npm run push:online`.

## Out of scope

- `MASTER.TEST_MODE` and the owner-email redirect mechanism — spec 1.
- The mock database, templates, and the 7 e2e checks that actually run once this project exists — spec 2.
