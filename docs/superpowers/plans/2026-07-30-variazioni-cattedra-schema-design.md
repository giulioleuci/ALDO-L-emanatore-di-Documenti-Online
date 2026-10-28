# Design: VARIAZIONI_CATTEDRA schema restructure

Sub-project 2 of 5. Depends on sub-project 1 (`2026-07-30-rolelib-override-chain-design.md`)
being vendored first — this restructure feeds the new chain-walking resolver,
and its test fixtures assume multi-hop rows are resolvable. Precedes
sub-project 3 (`2026-07-30-cattedra-resolution-wiring-design.md`), which wires
the restructured table into `AldoTeachingResolutionConfig`.

## Current shape

```
VARIAZIONI_CATTEDRA: CLASSE_ID, MATERIA_ID, VECCHIO_TITOLARE, NUOVO_TITOLARE, DATA_DECORRENZA
PK (parte): CLASSE_ID, MATERIA_ID
```

(`01_SCHEMA_DATABASE.md` §VARIAZIONI_CATTEDRA, `src/config/schema.ts` `COL_VARIAZIONI`,
`src/domain/entities/VariazioneCattedra.ts`.)

## Target shape

Mirrors SUPPLENZE (`01_SCHEMA_DATABASE.md` §SUPPLENZE) with `AL` dropped and
semantic (not literal-SUPPLENZE) column names — confirmed during design
brainstorming:

```
VARIAZIONI_CATTEDRA: TITOLARE, NUOVO_TITOLARE, DAL, CLASSI, MATERIE
PK: TITOLARE, NUOVO_TITOLARE, DAL, CLASSI, MATERIE   (composite, no single ID column — matches SUPPLENZE's PK pattern)
```

- `TITOLARE` (was `VECCHIO_TITOLARE`): docente losing the cattedra. Renamed for
  symmetry with SUPPLENZE's `TITOLARE` (the docente the row is _about_), and
  because it's the anchor used by sub-project 3's restriction-by-omission
  lookup (the teacher whose own CLASSI assignments resolve an empty
  `CLASSI`/`MATERIE`).
- `NUOVO_TITOLARE`: unchanged name, docente acquiring the cattedra. Kept
  distinct from SUPPLENZE's `SUPPLENTE` deliberately — a permanent change is
  not a substitution, and reusing "SUPPLENTE" here would misdescribe the
  domain concept (this was the explicit reason for rejecting the
  literal-mirror naming option during design).
- `DAL` (was `DATA_DECORRENZA`): effective-from date. No `AL` — a variazione is
  permanent until superseded by a later `DAL`-dated row for the same
  TITOLARE/scope (that supersession is exactly what sub-project 1's chain-walk
  and sub-project 1's within-hop "latest `effectiveFrom` wins" already
  implement).
- `CLASSI`/`MATERIE` (was `CLASSE_ID`/`MATERIA_ID`): renamed to match
  SUPPLENZE's plural naming, and — new — gain `*`-wildcard support alongside
  CSV, exactly like SUPPLENZE.CLASSI/MATERIE. Previously these columns were
  CSV-only, no wildcard concept existed for VARIAZIONI_CATTEDRA.

The primary-key textual-CSV caveat already documented for SUPPLENZE and (via a
cross-reference) VARIAZIONI_CATTEDRA in `01_SCHEMA_DATABASE.md` — "two
semantically-equivalent CSVs written in different order are not recognized as
duplicates by key comparison" — carries over unchanged; no new invariant is
introduced by the rename.

## Touch points

### Spec

- `SPECS_ALDO/01_SCHEMA_DATABASE.md` §VARIAZIONI_CATTEDRA: full rewrite of the
  column table, PK note, and the "Priority 2" description in §4 (Gerarchia di
  risoluzione ruoli) to mention `DAL`-based chaining instead of point-in-time
  `DATA_DECORRENZA ≤ T`.
- `SPECS_ALDO/00_PANORAMICA.md` line 96 ("VARIAZIONI_CATTEDRA (Priority 2) —
  cambio permanente post-inizio anno") — check for column-name mentions that
  need updating (currently doesn't name columns, likely no change needed;
  verify during implementation).

### Config

- `src/config/schema.ts`: `COL_VARIAZIONI` becomes
  `{ TITOLARE, NUOVO_TITOLARE, DAL, CLASSI, MATERIE }`. `COL_VARIAZIONI_CATTEDRA`
  alias line stays (still "same columns as `COL_VARIAZIONI`").

### Domain

- `src/domain/entities/VariazioneCattedra.ts`: rewritten to mirror
  `src/domain/entities/Supplenza.ts`'s shape — `titolare`, `nuovoTitolare`,
  `dalRaw`, `classiRaw`/`materieRaw` backed by `CsvScope` (not raw CSV-only
  parsing), `applicaAClasse`/`applicaAMateria`/`applicaAContesto` (unchanged
  signatures, now wildcard-aware via `CsvScope`), new `getClassiScope()` /
  `getMaterieScope()` (mirrors `Supplenza`, needed by sub-project 3's
  restriction-by-omission logic and any future overlap-checking), `id` built
  from the new composite PK. Keep `isDecorsaA(data: Date): boolean` (same
  name, now backed by `dalRaw` instead of `dataDecorrenza` — semantics
  unchanged: true when `DAL ≤ data`).
- `src/domain/repositories/IVariazioneCattedraRepository.ts`: `findByClasse`
  stays; add `findByTitolare(email: Email)` (mirrors the pattern of
  `findByNuovoTitolare`, needed by sub-project 3's restriction lookup which
  anchors on `TITOLARE`).
- `src/infrastructure/repositories/VariazioneCattedraRepository.ts`: the hot
  O(1) index currently keyed on `NUOVO_TITOLARE` — add a second index on
  `TITOLARE` (or switch primary index, TBD by actual hot-path usage in
  sub-project 3; both are plain-equality email columns like SUPPLENZE's
  `TITOLARE`/`SUPPLENTE`, neither is CSV).
- `src/domain/specifications/VariazioneCattedraSpecs.ts`:
  `VariazioniPerClasseSpec`/`VariazioniPerMateriaSpec`/`VariazioniPerNuovoTitolareSpec`
  updated for the renamed columns; add `VariazioniPerTitolareSpec`.
- `src/domain/errors/DomainError.ts`: `AmbiguousVariazioneCattedraError`,
  `VariazioneCattedraInconsistenteError`, `VariazioneCattedraTitolareNonTrovatoError`
  already exist but are unused (only referenced by the generic
  domain-error-shape test). Sub-project 3 is expected to actually throw these
  where relevant (e.g. `VariazioneCattedraTitolareNonTrovatoError` when a
  `TITOLARE` doesn't match any known docente) — this sub-project just carries
  them through the rename without wiring their call sites.

### Mock data / fixtures

- `src/onlinetests/SampleDatabaseBuilder.ts` (lines ~90, ~294-316) and
  `src/onlinetests/E2eSampleDatabaseBuilder.ts` (lines ~219-220, ~692-728):
  every `appendRow(TABLE.VARIAZIONI_CATTEDRA, {...})` call updated to the new
  column names/values (`COL_VARIAZIONI_CATTEDRA.CLASSE_ID` →
  `COL_VARIAZIONI_CATTEDRA.CLASSI`, etc.), preserving the documented intent of
  each existing scenario (e.g. the priority-chain comment at
  `SampleDatabaseBuilder.ts:294-303` — "SUPPLENZE wins within its date
  window").
- `test/fixtures/`: any raw fixture rows shaped like the old columns.

### Tests to update (rename-only, behavior unchanged by this sub-project)

- `test/unit/domain/variazione-cattedra-specs.test.ts`
- `test/unit/infrastructure/variazione-cattedra-repository.test.ts`
- `test/unit/application/cattedra-cross-cutting-agreement.test.ts` (check for
  column-name references)
- `test/unit/domain/domain-error.test.ts` (no behavior change, just confirms
  error classes still construct — unaffected by column rename, listed for
  completeness)

## Explicitly out of scope for this sub-project

- Restriction-by-omission semantics (empty CLASSI/MATERIE meaning "teacher's
  own"), slot-level (`.itp`/`.SPECIFICA`) targeting, and actually wiring the
  chain-walking resolver — all sub-project 3.
- Any new validation logic beyond what falls out naturally from reusing
  `CsvScope` — sub-project 3 territory too.

## Testing

- Update existing unit tests for the renamed columns/entity shape (no new
  behavioral assertions here — those belong to sub-project 3/5).
- Add unit coverage for the new `*`-wildcard support on VARIAZIONI_CATTEDRA's
  CLASSI/MATERIE (previously untested since it didn't exist), mirroring the
  existing SUPPLENZE wildcard tests.
- `npm run typecheck && npm run lint && npm test` green before moving to
  sub-project 3.
