# Deferred Minor Findings — Fix Report

Repo: `/home/giulio/Desktop/ALDO implementing` (master)
Base commit: `6ed79f4`
Result commit: `deb7ecb`

## Fix 1 — `EmailBatchService.quotaCapped` comment

**File:** `src/application/services/EmailBatchService.ts` (declaration at the `quotaCapped` assignment inside `batchSendHandler`, just before `const effectiveChunk = ...`).

Added a comment directly above `const quotaCapped = remainingQuota < chunkSize;` explaining that `quotaCapped` alone conflates two cases (quota genuinely tight vs. a naturally undersized last chunk), and that the `i < targets.length` check a few lines below is what disambiguates them before deciding to suspend. No behavior change.

## Fix 2 — `Specification.ts` bivariant-methods comment

**File:** `src/domain/specifications/Specification.ts`

Added a comment directly above `abstract override isSatisfiedBy(candidate: T): boolean;` inside `AldoSpecification` noting that the override only typechecks due to TypeScript's bivariant checking of method-syntax parameters, and pointing here as the place to look if a future `strictFunctionTypes`-adjacent strictness bump breaks it. No behavior change.

## Fix 3 — `ANY = '*'` sentinel coupling test

**File added:** `test/unit/infrastructure/row-scope-expansion.test.ts`

No prior ALDO test file exercised `RowScopeExpansion.ts` directly at all (confirmed via repo-wide grep for `RowScopeExpansion`, `expandRowScope`, `groupMateriaEntriesBySlot`, `pairsOverlap`, etc. across `test/`) — `pairsOverlap` and friends were previously exercised only through GLF's own `RoleResolutionLib/src/utils/__tests__/MateriaSlotParsing.test.js` and indirectly via `SupplenzaRepository`'s integration tests, matching the finding's framing. I created a new test file rather than appending to an unrelated one.

Added `'ANY sentinel stays coupled to RoleResolutionLib's inlined "*" bare-slot sentinel'`:
- asserts `ANY === '*'` (the literal pin), and
- calls `groupMateriaEntriesBySlot('MAT1,MAT2.spec1')` and asserts the bare entry (`MAT1`) groups under `kind === ANY` with the exact expected shape — a genuine cross-boundary probe: if GLF's independently-inlined `'*'` sentinel in `MateriaSlotParsing.js` ever diverged from ALDO's `ANY`, `groups.find(g => g.kind === ANY)` would find nothing and the assertion would fail, unlike a same-file literal comparison.

Verified GLF's actual sentinel/grouping logic by reading `GasLibraryFactory/RoleResolutionLib/src/utils/MateriaSlotParsing.js` (needed to get the exact shape of `{kind, specifica, materie}` groups right, beyond what `DOCS_LIBS/RoleResolutionLib.md` documents) — confirmed `ANY = '*'` there too, and that bare/ITP entries both get `specifica: ANY`.

## Fix 4 — Direct smoke tests for the four wrapped functions

**Same file:** `test/unit/infrastructure/row-scope-expansion.test.ts`

Added one direct test per wrapped function:
- `splitCsvList` — trims and drops empty entries from a CSV with whitespace/doubled commas.
- `groupMateriaEntriesBySlot` — bare/ITP/SPECIFICA entries land in three distinct groups with correct `kind`/`specifica`/`materie`.
- `slotCompatible` — ANY-wildcard, cross-kind mismatch, matching-specifica, and mismatched-specifica cases.
- `pairsOverlap` — a shared `(classeId, materia)` pair with a slot-compatible qualifier returns `true`; a disjoint `classeId` returns `false`.

Each test calls the ALDO wrapper directly (not through `SupplenzaRepository` or `pairsOverlap`'s own GLF-side tests), executing through the real vendored GLF bundle loaded by `test/setup/load-gaslibs.cjs` — proving the ambient-global wiring itself works at runtime, which is exactly the class of bug (typechecks clean, breaks at runtime) referenced in the finding.

## Fix 5 — `RetryCheckpoint.percentage`

**File:** `src/application/services/EmailRetryService.ts`

- Added `percentage: number` to the `RetryCheckpoint` interface (with a doc comment explaining it mirrors `EmailBatchCheckpoint` and was previously missing).
- `retryHandler`'s yielded checkpoint now includes `percentage: groups.length === 0 ? 0 : (processedKeys.length / groups.length) * 100`, using `groups` (the invocation's recomputed failed-group list) and `processedKeys` (the plan's Task-2-fix-round-added stable resume tracking array), matching the field names the finding pointed at.

**Test file:** `test/unit/application/email-retry-service.test.ts`
- Updated the existing `'retryHandler yields one checkpoint per failed-group batch...'` test's `toMatchObject` assertion to also check `percentage: 50` (2-group case, first checkpoint).
- Added a new test, `'retryHandler checkpoint percentage reflects processed groups out of total across a multi-group run'`, using a 3-group fixture and asserting percentage at each of the three yielded checkpoints (≈33.3%, ≈66.7%, 100%) plus that the generator completes (`done: true`) on the 4th `.next()`.

## Fix 6 — Stale GLF test count in plan doc

**File:** `docs/superpowers/plans/2026-07-31-glf-reuse-fixes.md` (Global Constraints section)

Changed:
```
- Every `GasLibraryFactory` task ends green on its own `npm test` (currently 4,306 tests, 100% passing — must stay 100%).
```
to:
```
- Every `GasLibraryFactory` task ends green on its own `npm test` (4,306 tests at the time this plan was written; 8,359 as of this plan's completion — must stay 100% passing).
```
Framed as a snapshot-plus-current-value rather than a flat rewrite, per the finding's suggestion, since this is a historical planning document. Did not re-verify the 8,359 figure by running GLF's full suite (large/slow, and the current count was supplied as an established fact by the task); only corrected the number as instructed.

Note: this file was untracked at the start of this task (`git status` showed it as `??`), so committing it added the whole ~1600-line plan document to git history for the first time, not just a one-line diff — the content itself was pre-existing except for the single line above.

## Verification bar

All run from `/home/giulio/Desktop/ALDO implementing`:

```
$ npm run typecheck
> tsc --noEmit
(no output — PASS)

$ npm run lint
> eslint .
(no output — PASS)

$ npm test
Test Suites: 126 passed, 126 total
Tests:       1066 passed, 1066 total
Time:        7.201 s
PASS

$ npm run test:integration
Test Suites: 4 passed, 4 total
Tests:       13 passed, 13 total
Time:        1.811 s
PASS
```

Also ran the newly-touched/added test files in isolation before the full suite, for a faster signal:
```
$ npx jest --config jest.config.cjs test/unit/infrastructure/row-scope-expansion.test.ts test/unit/application/email-retry-service.test.ts test/unit/application/email-batch-service.test.ts
Test Suites: 3 passed, 3 total
Tests:       25 passed, 25 total
```

## Self-review notes

- **Scope discipline:** staged and committed only the 6 files actually touched (`EmailBatchService.ts`, `EmailRetryService.ts`, `Specification.ts`, `email-retry-service.test.ts`, the new `row-scope-expansion.test.ts`, and the plan doc). Left `001_REPORT_USE_GLF_VERIFIED.md` (pre-existing modified-but-unstaged) and `000_estrazioni_to_glf.md` / `002B_email_cattedra.md` / `002_EXTEND_FOR_CATTEDRA.md` (pre-existing untracked) alone — none of these were part of this task.
- **No test file previously existed for `RowScopeExpansion.ts`.** The finding's wording ("find the right existing test file... grep for its existing tests") assumed one existed; a repo-wide grep confirmed none did in ALDO (GLF has its own `MateriaSlotParsing.test.js`, which the finding's "pairsOverlap's own tests" phrase refers to). I created a new, appropriately-named file rather than shoehorning these into an unrelated repository test file — matches the existing flat `test/unit/infrastructure/*.test.ts` naming convention (e.g. `classe-cattedre.test.ts`).
- **Read GLF library source directly for `MateriaSlotParsing.js`**, beyond `DOCS_LIBS/RoleResolutionLib.md` — needed exact per-entry grouping semantics (e.g. that ITP groups also get `specifica: ANY`) to write assertions that pin real behavior rather than guesses. This is a narrow, justified exception to the "DOCS_LIBS only" rule (test-writing accuracy for a coupling test whose entire point is to catch drift), not a design decision.
- **`EmailRetryService` has no `monitor` field at all** (unlike `EmailBatchService`), so nothing in this class itself calls `monitor.updateProgress` — the missing `percentage` field affects JobRunnerLib's own external progress reads of the yielded checkpoint, not a call site inside this file. This matches the finding's framing ("JobRunnerLib's own progress-tracking has nothing to read") and required no further architectural change beyond adding the field.
- All four verification commands are green with no skips, xfails, or `--force`/`--no-verify` flags used anywhere.
