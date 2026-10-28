# Design: MATERIE composite [MATERIA].[SPECIFICA] catalog rows

Sub-project 4 of 5. Independent of sub-project 3's implementation but their
specs are cross-referenced (slot-targeting in sub-project 3 depends on
specifiche being addressable MATERIE rows here). Can be built in parallel with
sub-project 3 once sub-project 2 (schema restructure) is done, since neither
depends on the other's code, only on the shared MATERIE/schema layer.

## Problem

`MateriaId` (`src/domain/value-objects/MateriaId.ts`) validates against
`^[A-Z]{2,10}$` — it cannot represent `INTERPRETAZIONE.CHITARRA`. Today,
`[MATERIA].[SPECIFICA]` only exists implicitly as a dynamic CLASSI column
suffix (`ClasseRepository.getTeachingSlots`, `src/infrastructure/repositories/ClasseRepository.ts:107-139`,
derives `specifica` from the column name tail, e.g. column
`INTERPRETAZIONE.CHITARRA` → `materia=INTERPRETAZIONE`, `specifica=CHITARRA`) —
the specifica string itself has no catalog entry: no `NOME`, `SINTESI`,
`COLORE_1`/`COLORE_2`, `SIMBOLO` of its own. Point C requires it to always
exist as its own MATERIE row.

## Design

### Identifier shape

New value object `MateriaSpecificaId` (rather than relaxing `MateriaId`'s
regex) — keeps the two concepts distinct at the type level, since a bare
`MateriaId` and a dotted `MATERIA.SPECIFICA` id are used in different contexts
(e.g. `DIPART.MATERIE`, `CARENZE`'s dynamic columns, and anywhere else
`MateriaId` is required) and conflating them risks a bare-materia-only call
site silently accepting a dotted id it can't handle.

```
MateriaSpecificaId.of("INTERPRETAZIONE.CHITARRA")
  .materia(): MateriaId        // "INTERPRETAZIONE" — must exist as its own MATERIE.ID row too
  .specifica(): string          // "CHITARRA"
  .value: string                 // "INTERPRETAZIONE.CHITARRA" — the full composite id, this row's MATERIE.ID
```

Validation: `<MATERIA>.<SPECIFICA>` where `<MATERIA>` matches the existing
`MateriaId` regex (`^[A-Z]{2,10}$`) and `<SPECIFICA>` matches
`^[A-Z][A-Z0-9_]{1,19}$` (uppercase start, alnum/underscore, 2-20 chars —
loosely mirrors `MateriaId`'s own length bounds while staying permissive per
`MAT_NON_STANDARD.md` §2.C: "Il valore `<specifica>` è arbitrario e non
appartiene a un catalogo tecnico chiuso", so this is a shape constraint, not a
closed enum).

**Invariant:** a `MATERIE` row with a dotted `ID` (a specifica row) requires
the corresponding bare `MATERIA` id to _also_ exist as its own `MATERIE` row
(the base subject, e.g. `INTERPRETAZIONE`, must be a catalog entry
independently of any of its specifiche) — mirrors how `MateriaSpecificaId`'s
`.materia()` always needs somewhere to resolve to.

### Schema

`SPECS_ALDO/01_SCHEMA_DATABASE.md` §MATERIE: no new columns — a specifica row
uses the exact same columns as a base materia row (`ID` is now documented as
"either a bare sigla or a `MATERIA.SPECIFICA` composite", the rest — `NOME`,
`SINTESI`, `COLORE_1`/`COLORE_2`, `SIMBOLO`, `IS_RELIGIONE_ALT` — unchanged in
meaning). `IS_RELIGIONE_ALT` is meaningless for a specifica row (IRC/ALT don't
have specifiche) — document as always `false`/absent for dotted-ID rows, not
enforced at the DB level (consistent with how other MATERIE flags aren't
cross-validated today).

### Domain / infrastructure

- `src/domain/entities/Materia.ts`: no structural change — it already just
  wraps a MATERIE row. Confirm its `id`/`ID` handling doesn't assume the
  bare-`MateriaId` regex anywhere (currently likely stores `ID` as a raw string,
  not a `MateriaId` instance — verify during implementation).
- `src/infrastructure/repositories/MateriaRepository.ts`: add
  `findSpecifiche(materia: MateriaId): Materia[]` (all MATERIE rows whose ID is
  `materia.value + '.' + anything`), used wherever a UI/document needs to
  enumerate a subject's specifiche (e.g. resolving display NOME/colore for a
  slot).
- `ClasseRepository.getTeachingSlots` (`ClasseRepository.ts:107-139`): today
  builds `specifica` from the raw column-name suffix with no MATERIE lookup at
  all — add validation that a `SPECIFICA` slot's `materia.value + '.' +
specifica` actually exists as a MATERIE row, since point C's requirement is
  that it "must always exist". Hard throw (`MateriaNotFoundError`, already
  exists and is thrown elsewhere in this file for the bare-materia case) — no
  graceful fallback, since silently tolerating an unregistered specifica would
  undermine the whole point of cataloging them.

### Spec rewrite

`SPECS_ALDO/MAT_NON_STANDARD.md` §3 "Granularità degli override" currently
states VARIAZIONI_CATTEDRA/SUPPLENZE have "no discriminator finer than
classe+materia+attore" and that inventing a specificity filter is not
permitted. Rewrite to describe the sub-project-3 slot-targeting capability:
MATERIE CSV entries may target a bare materia (all slots) or a
`MATERIA.itp`/`MATERIA.SPECIFICA` slot specifically, and specifica values used
this way must correspond to a real MATERIE row (this sub-project's invariant).

## Testing

- Unit: `MateriaSpecificaId` construction/validation (valid/invalid composite
  ids, `.materia()`/`.specifica()` accessors).
- `MateriaRepository.findSpecifiche` — returns correct subset, empty for a
  materia with no specifiche.
- `ClasseRepository.getTeachingSlots` — SPECIFICA slot whose specifica has no
  matching MATERIE row throws `MateriaNotFoundError`; matching row resolves
  cleanly.
- Fixture/mock data: add at least one specifica-bearing subject (matching the
  spec's own `INTERPRETAZIONE.CHITARRA`/`INTERPRETAZIONE.PIANOFORTE` example)
  to shared test fixtures and `SampleDatabaseBuilder`/`E2eSampleDatabaseBuilder`.
- `npm run typecheck && npm run lint && npm test` green.
