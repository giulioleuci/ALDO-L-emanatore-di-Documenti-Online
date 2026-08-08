# `{{progressivo}}` valid in FILE_NAME — design

## Problem

`meta.progressivo` (root alias `{{progressivo}}`) is the count of files already
present in the destination Drive folder + 1, computed by
`PrepareInfrastructureStep`. Today the document-generation pipeline runs:

```
AnalyzeContext -> CheckDuplicates -> PrepareInfrastructure -> GenerateName -> ...
```

`CheckDuplicatesStep` renders `CONF_DOC.FILE_NAME` (to build the identity key
compared against `LOG_DOCS.NOME`) *before* `PrepareInfrastructureStep` sets
`progressivo`. If a `FILE_NAME` template uses `{{progressivo}}`, the value is
unresolved at that point, so the identity key computed by `CheckDuplicatesStep`
never matches the `NOME` actually stored in `LOG_DOCS` by a prior run (which
*did* have `progressivo` resolved, since `GenerateNameStep` runs after
`PrepareInfrastructureStep`). Net effect: `DUPLICAZIONE=NEGATA` never blocks a
rerun once `FILE_NAME` contains `{{progressivo}}` — reruns silently produce new
numbered files instead of being rejected as duplicates.

This blocks a legitimate use case: a document type like class-council minutes
("verbale n.1", "verbale n.2", ...) where the sequential number must be baked
into the file name, but reruns of the *same* generation (retry, crash
recovery) must still be recognized as duplicates and skipped, not produce
"verbale n.3" for a meeting that already has "verbale n.2".

## Goal

Make `{{progressivo}}` resolve correctly wherever `FILE_NAME` is rendered,
including inside `CheckDuplicatesStep`'s identity check, without duplicating
the folder-resolution/counting logic and without changing what "identity"
means (still a straight `NOME` string comparison against `LOG_DOCS`).

Out of scope: `PATH_OUT` remains unable to use `{{progressivo}}` — the count is
derived from the already-resolved destination folder, which `PATH_OUT` is
still constructing (chicken-and-egg, unchanged by this design).

## Approach: reorder the pipeline

Swap the order of `PrepareInfrastructureStep` and `CheckDuplicatesStep`:

```
AnalyzeContext -> PrepareInfrastructure -> CheckDuplicates -> GenerateName -> ...
```

`PrepareInfrastructureStep` resolves/creates the destination folder and sets
`cdu.meta.progressivo` (+ root alias) before `CheckDuplicatesStep` renders
`FILE_NAME`. Both `CheckDuplicatesStep`'s identity render and
`GenerateNameStep`'s render now see the same resolved `progressivo`, so a
rerun against unchanged folder contents produces the same `NOME` both times,
and the existing `LOG_DOCS.NOME` comparison keeps working unmodified.

No new step, no new field, no change to the identity-match logic itself in
`CheckDuplicatesStep._executeLogic` — only the position of the two classes in
`DocumentGenerationService.buildPipeline` changes, plus the numbered-step
comments in `documentSteps.ts` (10 §4/§5 references) and the CDU spec.

### Why this is safe

- `PrepareInfrastructureStep`'s `shouldExecuteCondition` is `generateGate`
  (`shouldGenerate === true`), which is still true at this point (only
  `AnalyzeContextStep` has run) — behavior unchanged for the non-duplicate
  path.
- `PrepareInfrastructureStep` has no `requiredKeys` depending on anything
  `CheckDuplicatesStep` sets. `CheckDuplicatesStep` has no `requiredKeys`
  depending on anything `PrepareInfrastructureStep` sets beyond the CDU
  mutation it needs to read.
- `AlberoCartelle.findOrCreate` is already idempotent against a pre-existing
  folder (covered by the existing "logs a pre-existing folder" test) — running
  it unconditionally (even for a request that turns out to be a duplicate)
  does not corrupt `LOG_FOLD` state.
- `CRITICAL_STEPS` (rollback-on-error set) is a `Set`, unaffected by member
  order; `PrepareInfrastructure` stays in it.

### Trade-off (accepted)

Today, a duplicate is detected by `CheckDuplicatesStep` *before* any Drive
call for folder resolution — a rejected duplicate costs nothing extra. After
the reorder, `PrepareInfrastructureStep` always runs first, so every
generation attempt — including ones later found to be duplicates — resolves
(or creates) the destination folder, writes/touches its `LOG_FOLD` row, and
issues one `countFilesInFolder` Drive call. This is a minor, bounded API-call
cost (folder already exists after the first real generation, so subsequent
`findOrCreate` calls are cheap lookups), not a correctness issue. No other
approach avoids this cost without duplicating folder/count logic into
`CheckDuplicatesStep` (rejected during brainstorming — see conversation).

## Changes

1. **`src/application/services/DocumentGenerationService.ts`** —
   `buildPipeline`: swap `.addStep(new CheckDuplicatesStep(...))` and
   `.addStep(new PrepareInfrastructureStep(...))` order.
2. **`src/application/pipelines/documentSteps.ts`** — update the "Step N (10
   §X)" doc comments on `CheckDuplicatesStep` and `PrepareInfrastructureStep`
   to reflect the new order (PrepareInfrastructure becomes §4-5, CheckDuplicates
   becomes §6, or whatever numbering keeps them monotonic — exact renumbering
   deferred to implementation, must stay consistent with `SPECS_ALDO/`
   references it points to).
3. **`SPECS_ALDO/02_CDU_STRUTTURA.md`** — rewrite the `ATTENZIONE` block under
   `meta.progressivo` (lines 69-81): remove the claim that `{{progressivo}}`
   in `FILE_NAME` defeats `CheckDuplicatesStep`'s identity check (no longer
   true); keep the `PATH_OUT` chicken-and-egg constraint; note the new
   pipeline order (`PrepareInfrastructureStep -> CheckDuplicatesStep ->
   GenerateNameStep`) and the accepted trade-off (folder touched even for
   later-detected duplicates).
4. **`test/unit/application/pipelines/document-steps.test.ts`** — no required
   changes to individual step unit tests (each step is still tested in
   isolation by constructing `ctx` directly), but add a regression test
   proving the end-to-end scenario: a `FILE_NAME` containing `{{progressivo}}`
   is correctly recognized as a duplicate on the second run when
   `DUPLICAZIONE=NEGATA`.
5. **Any `DocumentGenerationService` integration/pipeline-order test** (e.g. a
   test asserting `buildPipeline`'s step sequence, if one exists) — update
   expected order.

## Testing

- New test: build the real pipeline (via `DocumentGenerationService` or by
  directly composing `PrepareInfrastructureStep` → `CheckDuplicatesStep` →
  `GenerateNameStep` against a shared `ctx`/fake Drive/DB) with
  `FILE_NAME: 'Verbale_{{progressivo}}'`, run it twice against the same fake
  folder + `LOG_DOCS`/`LOG_FOLD` state, assert: run 1 generates (`shouldGenerate
  === true`, file created, progressivo baked into stored `NOME`); run 2 against
  the same fixture state (as if replaying with the resulting `LOG_DOCS` row
  present) is recognized as a duplicate (`shouldGenerate === false`).
- Existing test `'sets cdu.meta.progressivo and the root alias from
  countFilesInFolder + 1'` and `'GenerateNameStep resolves FILE_NAME via
  WorkspaceTemplateEngine'` keep passing unmodified (they construct steps
  directly, order-independent).
- Existing test `'critical steps are exactly the rollback points of 10 §8'`
  unaffected (Set membership, not order).
- Run `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run
  lint` after the change.
