# Best-Effort Sheet Protections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reusable best-effort protected-range creation so invalid editor emails do not delete otherwise-rendered ALDO Sheets.

**Architecture:** Keep `SpreadsheetGridManager.protectRanges` strict by default. Add opt-in per-request continuation in GLF, expose its structured failures through existing service delegation/types, then have ALDO's Sheet strategy opt in and log warnings after rendering.

**Tech Stack:** Google Apps Script V8 JavaScript, Jest in `GasLibraryFactory`, TypeScript/Jest in ALDO, generated vendor bundle.

## Global Constraints

- Never edit generated `dist/*`; modify GLF source and regenerate vendor output.
- Native Sheets API access remains inside `GoogleApiWrapper`.
- Existing strict `protectRanges` callers must retain current batch and throw behavior.
- ALDO code must use the GLF facade; no native GAS globals.
- Tests must fail before production code changes.

---

### Task 1: Lock GLF result and failure contracts with tests

**Files:**

- Modify: `GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/__tests__/SpreadsheetGridManager.test.js` (existing manager test file; use repository's exact test location if indexed file differs)
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/SpreadsheetService.test.js` only if delegation coverage needs a new assertion

**Interfaces:**

- Consume existing `SpreadsheetGridManager.protectRanges(spreadsheetId, requests, options)`.
- Define best-effort result shape: existing result fields plus `failures: Array<{ request, message }>`.

- [ ] **Step 1: Write failing strict-mode regression test.**

Assert request array still reaches one `Sheets.Spreadsheets.batchUpdate` call and API rejection is thrown when `options` omitted.

- [ ] **Step 2: Write failing best-effort test.**

Stub advanced API so first request rejects with `Utente non valido`, second returns protected-range reply. Call:

```js
manager.protectRanges('sheet-1', [firstRequest, secondRequest], { onError: 'continue' });
```

Assert two independent attempts, `protectedCount === 1`, one ID, one failure containing original first request plus error message.

- [ ] **Step 3: Run only GLF manager tests and verify RED.**

Run: `npm test -- --runInBand GoogleApiWrapper/src/internal/services-managers/__tests__/SpreadsheetGridManager.test.js` from `GasLibraryFactory` (adapt path to existing test layout).

Expected: best-effort test fails because current implementation performs one batch call and throws.

- [ ] **Step 4: Commit tests only.**

```bash
git -C GasLibraryFactory add GoogleApiWrapper/src/internal/services-managers/__tests__ GoogleApiWrapper/src/services/__tests__
git -C GasLibraryFactory commit -m "test: specify best-effort Sheet protection failures"
```

### Task 2: Implement GLF best-effort protection

**Files:**

- Modify: `GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/SpreadsheetGridManager.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/SpreadsheetService.js` only if delegation signature/type documentation needs updating
- Modify: corresponding GLF TypeScript declarations or generated API documentation if present in library build workflow

**Interfaces:**

- Preserve `protectRanges(spreadsheetId, protectionRequests, options = {})`.
- Add `options.onError === 'continue'` branch.
- Return `{ spreadsheetId, protectedCount, protectedRangeIds, replies, failures }` in continuation mode; strict mode keeps current return shape.

- [ ] **Step 1: Implement request normalization once.**

Reuse current metadata/range/editor normalization. Keep metadata and malformed-request errors outside continuation handling.

- [ ] **Step 2: Implement continuation branch.**

For each normalized `addProtectedRange` request, call existing retry/API boundary independently. On success collect reply and ID. On failure collect `{ request: originalRequest, message: error.message || String(error) }`; do not rethrow.

- [ ] **Step 3: Preserve strict branch exactly.**

Current array batch request remains default path, including retry count, logger messages, reply extraction, and thrown API errors.

- [ ] **Step 4: Run GLF RED tests until GREEN.**

Run focused manager and service tests. Expected: strict regression passes; continuation returns successes and failures.

- [ ] **Step 5: Run GLF lint/build checks.**

Run `npm test`, `npm run lint`, and library build command documented by `GasLibraryFactory/CLAUDE.md`.

- [ ] **Step 6: Commit GLF implementation.**

```bash
git -C GasLibraryFactory add GoogleApiWrapper
git -C GasLibraryFactory commit -m "feat(GoogleApiWrapper): support best-effort protected ranges"
```

### Task 3: Refresh ALDO library contract

**Files:**

- Modify: `types/gaslibs/index.d.ts` if `SpreadsheetService.protectRanges` options/result declarations are local and need new fields
- Modify: `src/infrastructure/facades/SpreadsheetServiceFacade.ts` or actual facade file only if it narrows options/result
- Modify: `vendor/gaslibs.Code.js` only through `npm run refresh:vendor`; never hand-edit

**Interfaces:**

- ALDO calls existing `SpreadsheetService.protectRanges` with `{ onError: 'continue' }`.
- Failure records remain typed as original request plus message.

- [ ] **Step 1: Add failing TypeScript/contract assertion.**

Compile a call using `{ onError: 'continue' }` and read `failures`; verify current declarations reject or omit contract.

- [ ] **Step 2: Update declarations/facade minimally.**

Expose option and result fields without introducing a second ALDO-specific protection API.

- [ ] **Step 3: Refresh and verify vendor.**

Run `npm run refresh:vendor` then `npm run verify:vendor`.

- [ ] **Step 4: Run `npm run typecheck`.**

- [ ] **Step 5: Commit ALDO contract/vendor update.**

```bash
git add types/gaslibs/index.d.ts src/infrastructure vendor
git commit -m "build: expose best-effort Sheet protections"
```

### Task 4: Make ALDO Sheet rendering tolerant of ACL failures

**Files:**

- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Test: `test/unit/application/sheet-materie-generator.test.ts`

**Interfaces:**

- `render(fileId, cdu, config): void` still renders first.
- `protectColumns` calls `this.sheets.protectRanges(fileId, requests, { onError: 'continue' })` and logs each returned failure.

- [ ] **Step 1: Add failing test.**

Configure fake `protectRanges` to return one failure. Call strategy `render`; assert `processSheet` completed, no exception escaped, protection request attempted with `{ onError: 'continue' }`.

- [ ] **Step 2: Run focused test and verify RED.**

Run `npx jest --config jest.config.cjs test/unit/application/sheet-materie-generator.test.ts -t "continues rendering when protection fails"`.

- [ ] **Step 3: Implement minimal consumer change.**

Pass continuation option after `renderColumns` returns. Log range/message through existing logger service. Do not catch template-processing errors; only returned protection failures are warnings.

- [ ] **Step 4: Run focused test GREEN, then full unit suite.**

Run focused command, then `npm test`.

- [ ] **Step 5: Commit ALDO strategy change.**

```bash
git add src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts test/unit/application/sheet-materie-generator.test.ts
git commit -m "fix: keep Sheet generation after invalid protection editors"
```

### Task 5: Correct online E2E assertions

**Files:**

- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Modify: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**

- `verifyProtectedRangeScenario` requires non-null `fileId` and verifies rendered headers/placeholders even when `testMode` uses fake addresses.
- Invalid-editor errors are not swallowed as generation exceptions.

- [ ] **Step 1: Add failing assertion.**

Make fake protection harness return structured failures while `generateForClasse` returns a file ID. Assert scenario checks file existence/content and records no generation failure.

- [ ] **Step 2: Run focused test and verify RED.**

Run `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts -t "protected range"`.

- [ ] **Step 3: Remove obsolete mock-rejection bypass.**

Keep permission verification for real valid editors. In test mode, assert `fileId` and rendered content; allow returned `failures` as expected diagnostics.

- [ ] **Step 4: Run focused and full offline suites.**

Run focused command, `npm test`, `npm run typecheck`, and `npm run lint`.

- [ ] **Step 5: Commit E2E assertions.**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "test: require rendered Sheet despite invalid mock editors"
```

### Task 6: Build and verify online artifact

**Files:**

- Generated only by build: `dist/*`, `vendor/*` as applicable; do not hand-edit.

- [ ] **Step 1: Run build validation.**

Run `npm run test:build` and `npm run build:testing`.

- [ ] **Step 2: Run online build gate.**

Run `npm run build:online`.

- [ ] **Step 3: Inspect diff and verify no native GAS bypass.**

Use `git diff --check` and codebase graph bypass query for native Sheets calls outside GLF.

- [ ] **Step 4: Report final evidence.**

Include GLF test result, ALDO test result, build result, and expected online behavior: Sheet exists, placeholders replaced, invalid fake editors listed as protection failures.
