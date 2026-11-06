# PIANI.GENERATO: skip already-generated personalized plans without the CDU

Status: draft for approval. Date: 2026-11-05.

## Problem

The personalized-plan batch (`DocumentBatchService.generatePiani`, axis `GENERATORE=PIANO_PERSONALIZZATO`) targets every `(STUDENTE, TIPO)` row of `PIANI` of every active student (`targetsPiani`). For each target `DocumentGenerationService.generateForPiano` first builds the full CDU (`contextBuilder.build`), and only then `CheckDuplicatesStep` scans `LOG_DOCS` (match on `TIPO` + `SOTTOTIPO` + `ID_GEN` + `UTENTI` + `PATH` + normalized `NOME`) to discover the plan already has a document and mark the run `SKIPPED`.

So re-running the batch pays the CDU assembly plus a `LOG_DOCS` scan for every plan that is already done. We want already-generated plans to be skipped before any of that happens.

## Goal

Add a boolean column `PIANI.GENERATO`. It becomes `TRUE` when the generator produces that plan's document and registers it in `LOG_DOCS`. The plan batch drops plans with `GENERATO=TRUE` from its target list up front: no CDU build, no `LOG_DOCS` read.

Feasible with small changes. The write fits in the existing generation transaction (`runTransactionalPipeline` already wraps the pipeline in `beginTransaction`/`commit`, and `RegisterDocumentStep` inserts the `LOG_DOCS` row inside it), so flag and audit row commit or roll back together. The read fits in `targetsPiani`, which already iterates the `Piano` entities.

## Non-goals

- Replacing `CheckDuplicatesStep`. It stays as the authority for every other generator axis and as the safety net for single-target generation.
- Detecting that a generated document was deleted, renamed, or is stale because `PIANI.PARAMETRI` changed. The flag records "a document was generated once", nothing more.
- Setting the flag for plans skipped by `CONDIZIONE` or by the duplicate check. Only an actual generation sets it.
- Flags for other tables or other generator axes.

## Anti-goals

- The flag must never be `TRUE` without a matching `LOG_DOCS` row written in the same transaction.
- A plan whose generation failed or was rolled back must stay `GENERATO=FALSE`.
- No second source of truth that quietly disagrees with `LOG_DOCS` and has no repair path.

## Design

### Schema (`SPECS_ALDO/01_SCHEMA_DATABASE.md` §PIANI, wins over other docs)

New column `GENERATO`, Boolean, not part of the PK, default `FALSE`: "Set to `TRUE` when the personalized-plan generator has produced and registered the document for this plan in `LOG_DOCS`. The plan batch skips plans with `GENERATO=TRUE`. Reset to `FALSE` by hand to force regeneration." Update the PK paragraph note so it is clear the key is still `(STUDENTE, TIPO)`.

### Code

- `config/schema.ts`: add `GENERATO: 'GENERATO'` to `COL_PIANI`.
- `domain/entities/Piano.ts`: add `[COL_PIANI.GENERATO]?: boolean` to `PianoData`, a `generato` boolean read as `data[...] === true` (same convention as `Alunno.attivo`), written back in `toData()`.
- `IPianoRepository` / `PianoRepository`: one method to mark a plan generated, e.g. `markGenerato(studente, tipo)`, finding the row by the composite key (the base `findById` does not apply, queries filter in memory as `findByAlunno` does) and persisting through the repository, so it joins the active transaction. No update-by-hand of raw rows from application code.
- `application/services/axisTargets.ts` `targetsPiani`: skip plans with `piano.generato`. This is the "no CDU, no LOG_DOCS scan" path for the batch. It must work on resume too: `generatePiani` already persists `planTargets` in the checkpoint, so a resumed job keeps its original list and is unaffected.
- `application/pipelines/documentSteps.ts`: after `RegisterDocumentStep` inserts the `LOG_DOCS` row, when `isPianoPersonalizzato(ctx)`, set the flag for `(focus.alunno.email, focus.piano.tipo)`. Either inside `RegisterDocumentStep` or as a tiny dedicated step right after it, builder's choice. It runs under `generateGate`, so skipped runs never set it. The pipeline needs the piano repository, wired in `config/Bootstrap.ts` through `ServiceContainer` like the other repositories.
- `DUPLICAZIONE=PERMESSA` on the CONF_DOC: the target filter must not apply (regeneration is explicitly allowed), so `targetsPiani` should only filter when the config is `NEGATA`. The flag is still set after each generation.
- Existing `CheckDuplicatesStep` logic is untouched, so single-student generation (`generateForPiano` called outside the batch, from menus or standalone actions) still dedups through `LOG_DOCS` even if the flag is `FALSE`.

### Data migration

Existing sheets have no `GENERATO` column and existing generated plans have `LOG_DOCS` rows. A one-off backfill sets `GENERATO=TRUE` for each `PIANI` row that has a `LOG_DOCS` row with `TIPO=PIANO_PERS`, `SOTTOTIPO=PIANI.TIPO` and `UTENTI` containing `PIANI.STUDENTE`. Without it the first run after the change regenerates nothing wrong (the duplicate check still catches them) but gains no speed-up for old plans. Deliver it as an existing-style `CONF_AZIONI` action or a one-shot script, builder's choice, after checking what the project already uses for schema upgrades. Missing column on old sheets must read as `FALSE`, not throw.

### Reset

No new UI. Setting the cell back to `FALSE` in the sheet forces the batch to pick the plan up again; `CheckDuplicatesStep` will still skip it if the document truly exists and `DUPLICAZIONE=NEGATA`, so a manual reset is only effective together with deleting the old `LOG_DOCS` row or using `PERMESSA`. Document this in the schema note.

### Tests

- Unit: `Piano` round-trip with `GENERATO` true/false/absent; `targetsPiani` excludes generated plans and keeps the rest; `PERMESSA` keeps them.
- Unit: a successful `generateForPiano` leaves `PIANI.GENERATO=TRUE`; a `SKIPPED` run (condition false, duplicate) and a rolled-back critical failure leave it `FALSE`.
- Unit: second batch run produces zero targets and never calls the CDU builder (assert on the builder fake).
- Update fixtures and seeders that build `PIANI` rows (`test/fixtures`, `onlinetests/data/Seeders.ts`, `SharedTestDatabaseBuilder.seedPiani`) so tables have the new column. Online checks that assert regeneration or `SKIPPED` counts for plans need review.

## Open points and my calls

1. **Two CONF_DOC for the same plans.** The schema allows `PIANI_PERSONALIZZATI` plus `PIANI_PERSONALIZZATI_NO_PEI` (the latter excluding `PEI` by `CONDIZIONE`). `GENERATO` is per plan, not per CONF_DOC. My call: the flag means "some personalized-plan document was generated for this plan", and `targetsPiani` ignores which CONF_DOC runs. Consequence: running the second CONF_DOC after the first will skip plans the first already generated, where today `LOG_DOCS` would let both produce a document (different `ID_GEN`). If both families must keep producing independent documents for the same plan, the flag is the wrong shape and needs per-CONF_DOC tracking. Needs your confirmation.
2. **Stale flag.** If someone deletes the generated file and its `LOG_DOCS` row, the plan stays `GENERATO=TRUE` and is never regenerated until the cell is reset. Accepted as the cost of not reading `LOG_DOCS`; no repair job in scope.
3. **Changed `FILE_NAME`/`PATH_OUT`.** Today a template change that alters the name or path lets a plan be regenerated. With the flag it will not. This follows from the requested behavior.
4. **Backfill vehicle** left to the builder (see Data migration).
