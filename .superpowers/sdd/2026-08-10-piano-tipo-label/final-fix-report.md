# Final fix report — piano type labels

## Scope and findings addressed

- `src/onlinetests/checks/e2eScenarioChecks.ts`: the rendered `Tipo piano:` assertion now uses the shared `tipoPianoLabel()` mapper.  Model and note assertions retain the technical `TipoPiano` value.
- `src/onlinetests/checks/articolazioneChecks.ts`: the dual-plan rendered-document assertion now uses `tipoPianoLabel()` for the presentation label, while `LOG_DOCS.SOTTOTIPO`, IDs, and note assertions remain technical.
- `src/onlinetests/checks/e2eScenarioChecks.ts`: current PDP (BES) email display labels and current generated-document names now expect `PDP (BES)` / `E2E_Piano_PDP (BES)_...`; prior-year filename fragments remain the technical `E2E_Piano_PDP_BES_2025_2026` so subtype-history correlation remains unchanged.
- `test/unit/onlinetests/e2e-scenario-checks.test.ts` and `test/unit/onlinetests/articolazione-checks.test.ts`: fixtures represent the current rendered label and current generated filename while preserving technical model, note, subtype, and prior-year history values.

## TDD evidence

The regression protected is a stale online check requiring `Tipo piano: PDP_BES` after a document has rendered `Tipo piano: PDP (BES)`.  First, only the focused E2E fixture was changed to the required presentation value.

RED command:

```text
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts
```

RED result: exit 1; 1 suite failed, 7 tests failed, 28 passed.  The primary expected failure was:

```text
Piani: il documento PDP_BES non contiene il testo renderizzato atteso "Tipo piano: PDP_BES"
```

Minimal implementation then imported and used `tipoPianoLabel()` in each rendered-document check and updated current email/current-filename fixture expectations.  The Articolazione persisted-artifact fixture was aligned with the same rendered label.

GREEN command:

```text
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts test/unit/onlinetests/articolazione-checks.test.ts
```

GREEN result: exit 0; 2 suites passed, 54 tests passed.

## Full unit suite

```text
npm test
```

Result: exit 0; 147 suites passed, 1,298 tests passed, 0 snapshots; 9.927 s.

## Exact changed files

- `src/onlinetests/checks/e2eScenarioChecks.ts`
- `src/onlinetests/checks/articolazioneChecks.ts`
- `test/unit/onlinetests/e2e-scenario-checks.test.ts`
- `test/unit/onlinetests/articolazione-checks.test.ts`
- `.superpowers/sdd/2026-08-10-piano-tipo-label/final-fix-report.md`

## Self-review

- `git diff --check` passed.
- No `dist/*` files changed.
- No changes were made to `focus.piano.tipo`, `LOG_DOCS.SOTTOTIPO`, `MODELLI` selection conditions, routing, technical model assertions, or prior-year technical filename fragments.
- The pre-existing untracked `docs/superpowers/plans/2026-08-10-piano-tipo-label.md` is intentionally excluded from this fix commit.
- No setup change was needed solely to reach the assertion; the existing recording and persisted-artifact harnesses exercise the checks directly.

## Post-commit lint remediation

Final verification found a test-fixture-only lint regression at `test/unit/onlinetests/articolazione-checks.test.ts:117`: `fileId.slice('piano-'.length)` inferred `string`, which was then compared to `TipoPiano.PDP_BES` and violated `@typescript-eslint/no-unsafe-enum-comparison`.

RED command:

```text
npm run lint
```

RED result: exit 1 with one error:

```text
117:29  error  The two values in this comparison do not have a shared enum type  @typescript-eslint/no-unsafe-enum-comparison
```

Root cause: the fixture creates its non-CDC file IDs exclusively from `[TipoPiano.PEI, TipoPiano.PDP_BES]`, but slicing the ID loses that static enum provenance.  The minimal fix types the derived local as `TipoPiano`; runtime behavior and production source are unchanged.

Verification commands and results:

```text
npx jest --config jest.config.cjs test/unit/onlinetests/articolazione-checks.test.ts
# exit 0 — 1 suite, 19 tests passed

npm run lint
# exit 0

npm run typecheck
# exit 0

npm test
# exit 0 — 147 suites, 1,298 tests passed
```
