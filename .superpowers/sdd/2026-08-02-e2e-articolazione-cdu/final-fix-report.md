# Final review fix — read-only articulation artifact verification

Date: 2026-08-03

## Findings verified

The review findings reproduced against the current implementation:

- `Articolazione CDU: piano duale renderizzato` called `generateForPiano` for PEI and PDP_BES even though E2E scenario 3 had already persisted both artifacts. With `DUPLICAZIONE=NEGATA`, a later verification run could receive skipped duplicate results instead of proving the persisted artifacts.
- `Articolazione CDU: documento CDC include partner ed esclude parent` called `generateForClasse` and appended `LOG_DOCS` rows from the supposedly read-only suite. The E2E phase did not create the CDC signature summaries first.

The root cause was ownership drift: artifact creation had leaked from `registerE2eScenarioChecks` into `registerArticolazioneChecks`, contrary to the written plan's shared-database/read-only boundary.

## Fix

- Added E2E scenario 10c to generate `E2E_RIEPILOGO_FIRME_CDC` exactly once for `1A`, `2B`, `3C-S`, and `3C-C`, excluding parent `3C`. It validates rendered council content and complete `LOG_DOCS` metadata in the mutating E2E phase.
- Removed all `DocumentGenerationService` access and all `generateForClasse` / `generateForPiano` calls from `articolazioneChecks.ts`.
- The CDC articulation check now derives every file ID from persisted `LOG_DOCS`, validates exact ARTICOLATA targets and parent exclusion, validates metadata, and reads rendered content through `IDriveFacade`.
- The dual-plan check now derives the PEI/PDP_BES file IDs from persisted `LOG_DOCS`, verifies distinct IDs and subtype-specific rendered content, and performs no writes.
- Preserved the user decision: no import or `globalThis` exposure was added in `src/index.ts`.

## Regression coverage

The new regression first failed because the articulation callbacks tried to resolve `documentGenerationService`; after the fix it runs both artifact checks twice against the same persisted fixture and proves the rows are unchanged. The test container rejects any document-generation-service resolution.

A second regression first failed with no CDC generation targets in the E2E phase; it now proves the E2E runner generates all four ARTICOLATA targets and never the parent.

Existing mutation-oriented tests were rewritten around persisted rows so they continue to prove malformed file IDs, missing rendered content, and shared PEI/PDP_BES file IDs are rejected without generating data.

## Graph and boundary audit

- `search_graph` confirms `registerArticolazioneChecks` is reached by `executeArticolazioneScenarios` and its focused tests.
- `get_code_snippet` confirms the current callback bodies read `db`, `classi`, and `drive` only for artifact verification; no document-generation dependency remains.
- A `query_graph` bypass query over both changed online-check modules returned zero calls to native GAS globals.
- `GasLibraryFactory/DOCS_LIBS` contains no document-generation/`LOG_DOCS` contract to extend; this change is SGSA-specific online fixture orchestration and verification.

## Verification evidence

```text
npx jest --config jest.config.cjs \
  test/unit/onlinetests/articolazione-checks.test.ts \
  test/unit/onlinetests/e2e-scenario-checks.test.ts \
  test/unit/onlinetests/index.test.ts --runInBand
Test Suites: 3 passed, 3 total
Tests:       47 passed, 47 total

npm test -- --runInBand
Test Suites: 128 passed, 128 total
Tests:       1101 passed, 1101 total

npm run typecheck
tsc --noEmit (exit 0)

npm run lint
eslint . (exit 0)
```

`git diff --check` also completed with exit 0.
