# `{{progressivo}}` valid in FILE_NAME — design

## Problem

`meta.progressivo` (root alias `{{progressivo}}`) is the count of files already
present in the destination Drive folder + 1, computed by
`PrepareInfrastructureStep`. The document-generation pipeline runs:

```
AnalyzeContext -> CheckDuplicates -> PrepareInfrastructure -> GenerateName -> ...
```

`CheckDuplicatesStep` renders `CONF_DOC.FILE_NAME` (to build the identity key
compared against `LOG_DOCS.NOME`) *before* `PrepareInfrastructureStep` sets
`progressivo`. If `FILE_NAME` uses `{{progressivo}}`, the value is unresolved
at that point, so the identity key `CheckDuplicatesStep` computes never
matches the `NOME` actually stored by a prior run (whose `GenerateNameStep`
ran *after* `progressivo` was set).

### Why reordering the pipeline (rejected alternative) doesn't fix it

An earlier version of this design proposed swapping `PrepareInfrastructureStep`
before `CheckDuplicatesStep` so `progressivo` resolves before the identity
render. Traced through concrete numbers, this doesn't work:

`progressivo = countFilesInFolder(folderId) + 1` is a strictly-increasing
counter tied to actual folder contents. Any completed prior run already left
its file in that folder, so by the time a second run checks, the folder
count — and therefore `progressivo` — has already advanced past the number
baked into the previous run's `NOME`. Example: run 1 renders "Verbale_1",
creates the file, folder now has 1 file; run 2 (an accidental retrigger)
computes `progressivo=2`, renders "Verbale_2", and the identity match against
`LOG_DOCS.NOME='Verbale_1'` fails — not recognized as a duplicate, regardless
of step order. Literal `NOME` string comparison is fundamentally incompatible
with an auto-incrementing placeholder inside it.

## Goal

Let `FILE_NAME` use `{{progressivo}}` for cosmetic sequential numbering while
keeping `DUPLICAZIONE=NEGATA` able to recognize a rerun of the same logical
document as a duplicate.

## Approach: drop `NOME` from the duplicate-identity match

`CheckDuplicatesStep`'s identity query currently matches on `TIPO` +
`SOTTOTIPO` + `ID_GEN` + (`UTENTI` when `PIANO_PERS`) + `PATH` + `NOME`. Drop
`NOME` from the predicate. Identity becomes `TIPO` + `SOTTOTIPO` + `ID_GEN` +
(`UTENTI` when `PIANO_PERS`) + `PATH`.

This requires an operational rule, confirmed with the user: **a document type
whose instances must be individually distinguishable (e.g. one set of class-
council minutes per meeting) gets one distinct `CONF_DOC.ID` per instance**,
not one shared row reused across occasions. `ID_GEN` (== `CONF_DOC.ID`) is
already part of the identity tuple, so under this model it alone
differentiates occasions — `NOME`/`{{progressivo}}` no longer needs to.

### Why this is safe for existing identity cases

- **`PIANO_PERS`**: identity already includes `UTENTI` (the student's email),
  which alone uniquely pins the document to one student for a given
  `SOTTOTIPO` (`PIANI.TIPO`). `NOME` (the student's display name) was always
  redundant here.
- **`DOCUMENTO_DOCENTE_CLASSE_MATERIA`**: identity already includes `SOTTOTIPO`
  (`materiaId::docenteEmail`), which uniquely pins the subject/teacher pair.
  `PATH` additionally varies per class where applicable. `NOME` was redundant.
- **`VERBALE`-style types (the motivating case)**: today `PATH_OUT`
  (`Verbali/{{anno}}`) and `TIPO`/`SOTTOTIPO`/`ID_GEN` are identical across
  every meeting for the same class when one `CONF_DOC` row is reused —
  `NOME` (via `{{meta.date.oggi.breve}}`) was the *only* thing distinguishing
  meetings. Under the one-`CONF_DOC`-row-per-meeting model, `ID_GEN` takes
  over that role, so dropping `NOME` from the compare stays correct instead
  of causing every subsequent meeting to be wrongly flagged as a duplicate of
  the first.

### Behavior change (explicit, confirmed with user)

This changes dedup semantics **project-wide**, not just for one document
type: any two `LOG_DOCS` rows sharing `TIPO`/`SOTTOTIPO`/`ID_GEN`/`PATH`
(/`UTENTI` for `PIANO_PERS`) now count as the same document regardless of
their rendered file name. `NOME` becomes purely a display/audit field, never
part of identity. Document types that need distinguishable instances beyond
what `SOTTOTIPO`/`UTENTI`/`PATH` already capture must use one `CONF_DOC` row
per instance.

### What does NOT change

- Pipeline step order (`AnalyzeContext -> CheckDuplicates ->
  PrepareInfrastructure -> GenerateName -> ...`) stays as-is. No reorder
  needed — `{{progressivo}}` in the actual generated `FILE_NAME` already
  resolves correctly today, since `GenerateNameStep` already runs after
  `PrepareInfrastructureStep`. The only broken piece was the identity check,
  now fixed by removing its dependency on `NOME` entirely.
- No new DB columns, no new CONF_DOC fields.
- `PATH_OUT` still cannot use `{{progressivo}}` (folder must be resolved
  before its contents can be counted) — unchanged, unrelated constraint.

## Changes

1. **`src/application/pipelines/documentSteps.ts`** —
   `CheckDuplicatesStep._executeLogic`: remove the `FILE_NAME` render and the
   `nome` local; drop `String(r[COL_LOG_DOCS.NOME] ?? '') === nome` from the
   `existing` predicate. Update the `skipReason` message (currently
   interpolates the freshly-rendered `nome`) to use the matched row's stored
   `NOME` (`existing[COL_LOG_DOCS.NOME]`) instead, for informative logging
   only — not part of the match.
2. **`SPECS_ALDO/01_SCHEMA_DATABASE.md`** — `CONF_DOC.DUPLICAZIONE` row
   (line 325): clarify exactly which fields make up "l'identità già
   generata" (`TIPO`+`SOTTOTIPO`+`ID_GEN`+`PATH`, `+UTENTI` for
   `PIANO_PERS`) and state explicitly that `NOME`/`FILE_NAME` is NOT part of
   the identity match. Add the operational rule: distinguishable instances of
   a document type need distinct `CONF_DOC.ID` rows.
3. **`SPECS_ALDO/02_CDU_STRUTTURA.md`** — rewrite the `ATTENZIONE` block under
   `meta.progressivo` (lines 69-81): remove the now-false claim that
   `{{progressivo}}` in `FILE_NAME` defeats `CheckDuplicatesStep`'s identity
   check (identity no longer depends on `NOME` at all). Keep the `PATH_OUT`
   chicken-and-egg constraint (still true, unrelated). State that
   `{{progressivo}}` is valid in `FILE_NAME` and in the document body/
   `REGISTRA_DOC` fields, same as before.
4. **`test/unit/application/pipelines/document-steps.test.ts`** —
   - `'NEGATA allows a document when only its generated name differs'`:
     invert the expectation to `shouldGenerate === false` (this is exactly
     the behavior change), rename the test to describe the new rule.
   - `'publishes the duplicate identity when generation is stopped'`: verify
     the `skipReason` message still reads sensibly without `NOME=` from the
     freshly-rendered candidate (using the stored row's `NOME` instead —
     coincidentally unchanged text for this fixture, since the fixture's
     stored `NOME` already equals what the candidate render would have
     produced).
   - Add a regression test: `FILE_NAME` containing `{{progressivo}}`,
     `DUPLICAZIONE=NEGATA`, a `LOG_DOCS` row matching on
     `TIPO`/`SOTTOTIPO`/`ID_GEN`/`PATH` but with a `NOME` reflecting a
     *different* `progressivo` value than what today's render would produce
     — assert `shouldGenerate === false` (correctly recognized as a
     duplicate despite the numeric mismatch in `NOME`).

## Testing

- New regression test as above (the actual motivating scenario).
- Existing `CheckDuplicatesStep` PIANO_PERS and DOCUMENTO_DOCENTE_CLASSE_MATERIA
  identity tests keep passing unmodified (their fixtures already match on
  `UTENTI`/`SOTTOTIPO`, `NOME` was never load-bearing there).
- Run `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run
  lint` after the change.
