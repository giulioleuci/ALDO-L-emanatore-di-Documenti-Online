# Task 2 reconciliation report — independent articulation online entry point

Date: 2026-08-03

## Scope and requirements audited

Task 2 requires an injected-dependency-compatible, read-only articulation
online-test entry point in `src/onlinetests/index.ts`.  It must reject an
absent/blank MASTER pointer and a MASTER whose `TEST_MODE` is not true before
ALDO initialization or E2E provisioning; then it must read the selected
MASTER, initialize ALDO, create a `TestRunner`, register only articulation
checks, log the report, and expose `runArticolazioneScenarios`.

The user override is binding: `runArticolazioneScenarios` is exported from
`src/onlinetests/index.ts` only.  It is not imported by `src/index.ts` and is
not assigned to `globalThis`.

## Graph and linkage audit

The codebase graph was queried before review.  It reports:

- `executeArticolazioneScenarios(overrides: Partial<ArticolazioneTestDeps> = {})`
  calls `readMasterConfig`, `initAldo`, `TestRunner`, and
  `registerArticolazioneChecks` in its verified flow.
- `registerArticolazioneChecks(runner, container, sample)` accepts an
  `E2eSampleDatabase & { testMode: boolean }`; the Task 2 sample object
  supplies every required `E2eSampleDatabase` field plus `testMode`.
- `initAldo(now?: Date, props?: IPropertiesFacade)` matches the injected call
  `initAldoFn(clock(), properties)`.
- `MasterSheetRepository.findConfigAnnoCorrente()` returns `MasterConfig`,
  consistent with the narrower injected `readMasterConfig` shape.

No Task 3 repository filtering or Task 4 articulation-check implementation was
changed during reconciliation.

## Pre-existing commit audit

Audited range: `f0bcd87e52906a101b80478af0909d81b4dfe5a8..7d7149f9551dafc0eb842a1412c4ee7cadc3fd96`.

- `f0bcd87` added `ArticolazioneTestDeps`, the current-MASTER reader,
  `executeArticolazioneScenarios`, `runArticolazioneScenarios`, and two unit
  tests.  The guards reject null/blank `MASTER_SPREADSHEET_ID` and
  `TEST_MODE !== true` before `initAldo`; both tests spy on
  `E2eSampleDatabaseBuilder.prototype.build` and assert that it is not called.
  The implementation has no E2E-builder call and registers only
  `registerArticolazioneChecks` after the guard.
- `7d7149f` removed a redundant `globalThis` assignment from
  `src/onlinetests/index.ts`.
- The range is limited to `src/onlinetests/index.ts` and
  `test/unit/onlinetests/index.test.ts`; `git diff --check` for the range is
  clean.

## Reconciliation fix

An earlier, out-of-range commit (`f940875`) still imported
`runArticolazioneScenarios` into `src/index.ts` and assigned it to
`globalThis`, contradicting the user override.  The scoped fix removes that
import/assignment and replaces its unit test with a regression test that
asserts the GAS global is absent.  The function remains exported solely from
`src/onlinetests/index.ts`.

The new regression test was first run against the old assignment and failed
with `Received: [Function runArticolazioneScenarios]`, then passed after the
assignment was removed.

## Verification evidence

Executed successfully after the fix:

```text
npx jest --config jest.config.cjs test/unit/index.test.ts test/unit/onlinetests/index.test.ts
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total

npm run typecheck
tsc --noEmit (exit 0)

npm run lint
eslint . (exit 0)

git diff --check
(exit 0)
```

`rg -n "runArticolazioneScenarios" src test --glob '!dist/**'` now finds the
definition only in `src/onlinetests/index.ts`; no `src/index.ts`, `globalThis`,
or entrypoint exposure remains.
