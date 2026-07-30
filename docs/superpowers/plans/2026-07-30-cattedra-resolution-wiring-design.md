# Design: cattedra resolution wiring — chronology, restriction semantics, slot targeting

Sub-project 3 of 5. Depends on sub-project 1 (vendored RoleResolutionLib with
override chain-walking) and sub-project 2 (restructured VARIAZIONI_CATTEDRA)
being complete. This is where point B ("always the last one chronologically",
the CLASSI/MATERIE restriction rules) and the slot-targeting half of points C/D
actually get implemented in ALDO.

## 1. Chronology (point B, chain-walking side)

Once sub-project 1 is vendored, `EffectiveAssignmentResolver` walks override
chains automatically — no new call pattern needed in
`AldoTeachingResolutionConfig.create()`. The only change here: verify
`mappedOverrides`'s row mapping (currently `previousActorId: VECCHIO_TITOLARE`,
`nextActorId: NUOVO_TITOLARE`, `effectiveFrom: DATA_DECORRENZA`) is updated to
the renamed columns (`TITOLARE`, `NUOVO_TITOLARE`, `DAL`) from sub-project 2,
and add regression tests proving a 2-hop chain (A→B in Sept, B→C in Jan)
resolves to C as of a date after January, and to B for a date between the two.

No `ResolutionPolicy` change is needed beyond optionally setting
`maxOverrideChainDepth` — left `null` (unbounded) to match SUPPLENZE's existing
"no depth limit" chain philosophy (ref `01_SCHEMA_DATABASE.md` §SUPPLENZE
"Catene di supplenza").

## 2. CLASSI/MATERIE restriction semantics (point B, restriction rules)

Applies identically to SUPPLENZE and VARIAZIONI_CATTEDRA. Anchor teacher:
SUPPLENZE.`TITOLARE`, VARIAZIONI_CATTEDRA.`TITOLARE` (post-rename — the
outgoing holder). Evaluated per-axis, independently, against the anchor's
**nominal** CLASSI-matrix assignments (never the resolver's own effective
output — looking up nominal assignments only avoids a circular dependency
where restriction-expansion would need the very resolution it's feeding).

| CLASSI  | MATERIE | Meaning                                                                             |
| ------- | ------- | ------------------------------------------------------------------------------------ |
| `*`     | `*`     | Unrestricted — every class, every subject (existing wildcard behavior, unchanged). |
| `*`     | CSV     | Every class, only the listed subjects — existing behavior, unchanged.               |
| CSV     | `*`     | Listed classes, every subject — existing behavior, unchanged.                       |
| CSV     | CSV     | Cartesian product of the two lists — existing behavior, unchanged.                  |
| empty   | CSV     | **New.** Only (classe, materia) pairs where materia ∈ MATERIE **and** the anchor teacher nominally teaches that materia in that classe. |
| CSV     | empty   | **New, symmetric with the row above.** Only (classe, materia) pairs where classe ∈ CLASSI **and** the anchor teacher nominally teaches some subject in that classe — restricted to the subjects they actually teach there. |
| empty   | empty   | **New.** All (classe, materia) pairs the anchor teacher nominally teaches, full stop. |
| empty   | `*`     | **New.** All (classe, materia) pairs where the anchor teaches that materia in that classe... but MATERIE=`*` combined with empty CLASSI degenerates to the same result as empty/empty (every materia the teacher touches, everywhere they touch it) — treat as equivalent to the empty/empty row rather than a distinct case. |
| `*`     | empty   | **New, symmetric.** Same degeneration: equivalent to empty/empty. |

"Nominally teaches X in classe Y, across MAIN/ITP/SPECIFICA" is answered by
`ClasseRepository.getTeachingSlots(classe)` (`src/infrastructure/repositories/ClasseRepository.ts:107-139`),
filtered to slots whose `actorEmails` contains the anchor's email — a docente
holding *only* an ITP or SPECIFICA slot for a subject still counts as teaching
it, matching point D's requirement that this work correctly with
`[MATERIA].ITP`/`[MATERIA].[SPECIFICA]`.

**Why this can't reuse the library's `expandDimensions` cartesian product:**
`AldoTeachingResolutionConfig.create()` currently builds `overrideRows`/
`delegationRows` once in the constructor and lets `MappedOverrideSource`/
`MappedDelegationSource`'s `expandDimensions` cartesian-multiply CSV-parsed
`classe`/`materia` scope arrays per row. For a row with **explicit** CLASSI and
MATERIE CSVs that's correct (the row author wrote the exact pairing they
wanted, or genuinely meant every combination). But for empty-axis restriction,
a naive cartesian product of "teacher's classes" × "teacher's subjects" is
wrong — the design brief's own example (CLASSI=null, MATERIE=FIS; teacher
teaches MAT in 1A, MAT+FIS in 1B, FIS in 3C) must **not** produce MAT×3C or
FIS×1A-without-FIS. The restriction must be computed as an explicit list of
valid `(classe, materia)` pairs from the teacher's actual cattedre, not a
cross-product of two independently-empty axes.

**Implementation shape:** in `AldoTeachingResolutionConfig`, before building
`overrideRows`/`delegationRows`, add a per-row expansion step: for any
SUPPLENZE/VARIAZIONI_CATTEDRA row with an empty CLASSI and/or empty MATERIE,
resolve the anchor teacher's `getTeachingSlots` across all their classes
(new: needs a "classes where teacher X holds any slot" query — likely a new
`ClasseRepository` method, e.g. `findByDocenteAssegnato(email): Classe[]`, since
today's `getTeachingSlots` takes a single already-known `Classe`), compute the
restricted pair-list per the table above, and materialize **one row per
resulting pair** (each with concrete, non-empty CLASSI/MATERIE) before feeding
the existing `MappedOverrideSource`/`MappedDelegationSource` mapping — so the
library-side cartesian expansion never has to reason about restriction, only
about literal CSV lists it's always handled.

## 3. Slot-level targeting (points C+D)

Once sub-project 4 makes `[MATERIA].[SPECIFICA]` (e.g.
`INTERPRETAZIONE.CHITARRA`) a real MATERIE row, VARIAZIONI_CATTEDRA/SUPPLENZE's
MATERIE CSV may contain either a base materia id (all slots — MAIN + ITP +
every SPECIFICA, today's only behavior) or a slot-qualified id
(`MATERIA.itp` or `MATERIA.SPECIFICA`, that slot only). This supersedes the
invariant currently documented in `SPECS_ALDO/MAT_NON_STANDARD.md` §3
("Granularità degli override... non è lecito inventare un filtro di
specificità assente dal DB") — which sub-project 4 rewrites, since the filter
is no longer absent from the DB once specifiche are real MATERIE rows.

**Matching:** `TeachingSlotDescriptor` (`src/domain/repositories/IClasseRepository.ts`)
already carries `kind` (`MAIN`/`ITP`/`SPECIFICA`) and `specifica`
(`string | null`). `AldoTeachingResolutionConfig.create()`'s
`slotDimensions`/`contextDimensions` (currently `classe`, `materia`, `kind`,
`specifica` are already threaded into the base `WideRowAssignmentSource`
columns — see the existing `columns.push({ slotDimensions: { classe, materia:
descriptor.materia.value, kind: descriptor.kind, specifica: descriptor.specifica
}, ... } )` at `AldoTeachingResolutionConfig.ts:169-181`). The gap is on the
**override/delegation mapping side**: `mappedOverrides`/`mappedDelegations`'s
`scope` mapping only sets `classe`/`materia` (lines 131-134, 145-147) — never
`kind`/`specifica` — so today an override/delegation can never discriminate by
slot even though the base candidates already carry that dimension.

Fix: when parsing a row's MATERIE CSV entry, split each entry on `.` — a bare
`MATERIA` means "match any `kind`/`specifica`" (an override/delegation row with
no slot dimension in its scope; `AssignmentSlot.matches`/`matchesContextDimensions`
already treat an absent scope dimension as "don't filter on it" — verify this
during implementation, since it's the exact mechanism that makes today's
whole-materia fan-out work and must keep working for the non-slot-qualified
case), `MATERIA.itp` means `kind: 'ITP'`, `MATERIA.<anything else>` means
`kind: 'SPECIFICA', specifica: '<anything else>'`. This parsing has to happen
per-CSV-entry (not per-row) since a single MATERIE CSV can legitimately mix a
bare materia with a slot-qualified one from a different materia.

## 4. Validation

Wire the previously-unused domain errors from `src/domain/errors/DomainError.ts`:

- `VariazioneCattedraTitolareNonTrovatoError`: thrown when a VARIAZIONI_CATTEDRA
  row's `TITOLARE` doesn't correspond to any known docente at import/read time.
- `VariazioneCattedraInconsistenteError`: thrown for structurally invalid rows
  (e.g. `TITOLARE === NUOVO_TITOLARE`, mirroring the library's
  `InconsistentAssignmentOverrideError` guard for `previousActorId === nextActorId`
  — but checked at the ALDO/repository layer since GAS-side data entry should
  fail fast before ever reaching the resolver).
- `AmbiguousVariazioneCattedraError`: reserved for a same-`DAL` same-scope tie
  that the library's `AmbiguousAssignmentOverrideError` would otherwise
  surface as a raw library error. Catch-and-rewrap at the
  `AldoTeachingResolutionConfig`/`AldoTeachingAssignmentResolver` boundary,
  consistent with the project's existing facade convention (infra facades wrap
  library calls behind ALDO-owned interfaces, ref project `CLAUDE.md`
  "`src/infrastructure/`" section) — application code should never see a raw
  `RoleResolutionLib` error class.

## Testing

- Unit: `AldoTeachingResolutionConfig`/`AldoTeachingAssignmentResolver` — chain
  resolution (2/3-hop), every row of the restriction-semantics table above
  (including the worked MAT/FIS/1A/1B/3C example verbatim, and the two
  "degenerate to empty/empty" cases), slot-targeting (`.itp` and `.SPECIFICA`
  MATERIE entries), mixed bare+qualified CSV entries in one row.
- Existing tests: `test/unit/application/cattedra-cross-cutting-agreement.test.ts`,
  `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts` — extend,
  don't just preserve, since the restriction/targeting logic is new surface
  they should cover.
- `npm run typecheck && npm run lint && npm test` green.
