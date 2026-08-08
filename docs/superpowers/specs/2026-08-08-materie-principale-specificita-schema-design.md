# Design: MATERIE.PRINCIPALE / MATERIE.SPECIFICITA columns + specific-row-only families

Date: 2026-08-08
Status: approved (pending user review of this doc)
Supersedes: the two "materiaVm() fix scope" options discussed inline in this
session before this redirect — both are obsolete now that the fix moves to
schema level.

## Problem (restated, extended)

For `1A`'s `INTERPRET.CHITARRA` cattedra (docente5, the only teacher on that
specifica, no bare `INTERPRET` assignment at all), the CDU teacher list shows
this docente associated with the generic base subject "INTERPRET" instead of
his actual specific subject "INTERPRET.CHITARRA". Traced to
`TeachingCouncilProjection.materiaVm()` always resolving the **base** MATERIE
row (`assignment.slot.materia`) regardless of `assignment.slot.specifica`.

Root design decision from the user: this isn't just a lookup bug. `MATERIE`
gets two new columns, `PRINCIPALE` and `SPECIFICITA`, and the current
`01_SCHEMA_DATABASE.md` invariant that a composite row's base id "must also
exist as its own MATERIE row" is dropped — for a family that branches into
specifics, **only** the specific-flavored rows are real catalog entries; the
family/base id becomes a grouping key derived from those rows, not a
standalone row itself. Plain single-flavor subjects (`MAT`, `ITA`, `ING`,
`STO`) are unaffected — they have no `PRINCIPALE`/`SPECIFICITA` and behave
exactly as today.

## Schema change

**File:** `SPECS_ALDO/01_SCHEMA_DATABASE.md` §MATERIE (source of truth #1 —
update alongside code, not after)

New columns, added to the existing MATERIE column table:

| Colonna         | Tipo   | PK  | Vincoli | Descrizione                                                                                          |
| ---------------- | ------ | --- | ------- | ----------------------------------------------------------------------------------------------------- |
| `PRINCIPALE`     | String | —   | —       | Nome della materia principale/famiglia (es. `Interpretazione ed esecuzione`); vuoto per righe non specifiche |
| `SPECIFICITA`    | String | —   | —       | Nome descrittivo della specificità (es. `Chitarra`); vuoto per righe non specifiche                    |

`NOME` semantics change: if `NOME` is blank, it is reconstructed at read time
as `"${PRINCIPALE} (${SPECIFICITA})"` when both are present; otherwise stays
empty as today. The raw (possibly blank) `NOME` cell is still what's
persisted on save — the fallback is a display-time computation, not a
write-time mutation (leaving `NOME` blank in the sheet keeps producing the
live-composed name even if `PRINCIPALE`/`SPECIFICITA` are edited later).

**Invariant change:** drop "if a composite `ID` row exists, the bare
`[MATERIA]` part must also exist as its own MATERIE row". Replace with: a
composite row's `PRINCIPALE` MUST be non-empty (families that branch into
specifics are never represented by a bare, family-only row — every real row
in such a family carries its own `PRINCIPALE`+`SPECIFICITA`). Mirror the same
rewrite in `SPECS_ALDO/MAT_NON_STANDARD.md` §3, which currently restates the
old invariant.

`SPECS_ALDO/02_CDU_STRUTTURA.md` `SubjectVM.principale`/`specificita` (lines
603-604): field semantics unchanged ("solo per specificità X.Y"), but the doc
comment should note the source is now `MATERIE.PRINCIPALE`/`SPECIFICITA`
directly, not a computed base-materia lookup.

## Domain: `Materia` entity

**File:** `src/domain/entities/Materia.ts`

- New fields: `principale: string | null`, `specificita: string | null` (from
  `COL_MATERIE.PRINCIPALE`/`COL_MATERIE.SPECIFICITA`, empty string → `null`,
  mirroring how other optional string columns are handled here).
- `nome` getter becomes computed: keep the raw cell value internally (needed
  for round-tripping via `toData()` — the fallback must not be written back
  as if it were the stored value), expose `nome` as
  `rawNome !== '' ? rawNome : (principale !== null && specificita !== null ? `${principale} (${specificita})` : '')`.
- `toData()` serializes the raw `NOME` cell (unchanged), plus the two new
  columns.

## Repository/resolution layer: base row becomes optional

Two call sites currently derive "the list of resolvable base subjects" by
filtering MATERIE rows to non-dotted ids only. Both need to instead derive
the set of **distinct base ids** from every row (dotted rows contribute their
prefix; plain rows contribute themselves), since a family like `INTERPRET`
may now have zero bare rows:

- **`AldoTeachingResolutionConfig.getMaterie()`**
  (`src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts:265-281`):
  today returns one entry per non-dotted `MATERIE.ID`, used by
  `resolveConsiglio()`'s per-materia resolution loop.
  New: build the distinct-base-id set from all rows (dotted → prefix, plain →
  itself); `isReligioneAlt` comes from the bare row's own flag when a bare row
  exists for that base id, else `false` (IRC/ALT never have specifics, so this
  only affects synthetic families that never had a bare row to begin with).
- **`ClasseRepository` constructor** (`materieColumns` build,
  `src/infrastructure/repositories/ClasseRepository.ts:62-72`): same
  distinct-base-id derivation, so `materieColumns` still gets an `INTERPRET`
  entry (`main: 'INTERPRET'`, `itp: 'INTERPRET.itp'`) purely as the anchor
  `getTeachingSlots()` needs to prefix-scan a row's columns for
  `INTERPRET.CHITARRA`/`INTERPRET.itp` — even though the bare `INTERPRET`
  column itself is never populated in practice for such families (no
  descriptor gets emitted for an empty cell, same as today).

No change needed to `ClasseRepository.getTeachingSlots()`'s composite-row
existence check (`materieIds.has(column)`) — `materieIds` is already built
from *all* rows unconditionally, dotted or not.

## `TeachingCouncilProjection.materiaVm()`

**File:** `src/application/context-engine/TeachingCouncilProjection.ts:215-227`

Resolve the specific row directly when a specifica is present — no base-row
fallback (none is guaranteed to exist anymore):

```ts
function materiaVm(
  materie: IMateriaRepository,
  classe: Classe,
  assignment: FlattenedProjectionAssignment
): SubjectVM | null {
  const baseId = MateriaId.of(assignment.slot.materia);
  const specifica = assignment.slot.specifica;
  const materia =
    specifica === null
      ? materie.findByIdCached(baseId)
      : (materie.findSpecifiche(baseId).find((m) => m.id === `${baseId.value}.${specifica}`) ?? null);
  if (materia === null) return null;
  return buildSubjectVm(materia, {
    indirizzo: IndirizzoId.of(classe.indirizzo),
    isITP: assignment.slot.kind === 'ITP',
    principale: materia.principale,
    specificita: materia.specificita
  });
}
```

`SubjectVM.sigla`/`nome`/`nomeSintetico` now come from the **composite** row
(`materia.id` = `"INTERPRET.CHITARRA"`, `materia.nome` = the fallback-aware
getter above) for specifica assignments — this is what makes docente5 show up
correctly in `consiglioDiClasse`, `materieDescrizione`, `materieSigle`, and
`focus.classe.materie` (`MaterieClasseProvider.buildCatalog`, which is
downstream of `materiaVm()`'s output and needs no changes itself).

`buildSubjectVm`'s `principale`/`specificita` options now come straight off
the resolved `Materia` row (persisted data) instead of the raw
`assignment.slot.specifica` token — the technical slot-addressing token
(`CHITARRA`, used for `VARIAZIONI_CATTEDRA`/`SUPPLENZE` scoping,
`RisolutoreRuoliService`, `SheetMaterieGeneratorStrategy`'s column addressing)
is untouched and stays a separate concern from this CDU-display field.

## `DocumentBatchService.generateDocentiMateria`

**File:** `src/application/services/DocumentBatchService.ts:211-337`

`materiaId` (the DOCUMENTO_DOCENTE_MATERIA batch target key, matched
downstream by `DocenteMateriaFocusProvider`'s `materie.find(sigla === ...)`)
must switch from `assignment.slot.materia.value` (base) to the composite id
when a specifica is present — mirroring the `catalogId` pattern already used
in `SheetMaterieGeneratorStrategy.catalogId()`:

```ts
const materiaId =
  assignment.slot.specifica === null
    ? assignment.slot.materia.value
    : `${assignment.slot.materia.value}.${assignment.slot.specifica}`;
```

**Behavioral consequence, flagged explicitly:** the existing dedup comment
("slots differing only by kind/specifica collapse to a single target here by
design... not a bug") currently means a docente teaching both
`INTERPRET.CHITARRA` and `INTERPRET.FLAUTO` in the same class gets **one**
merged DOCUMENTO_DOCENTE_MATERIA document today. After this change, since
`materiaId` is now specifica-qualified, they become **two separate**
composite targets — one document per specific flavor. This follows directly
from "specifics predominate, there's no single main subject" and is treated
as an intended consequence of this design, not a regression to guard against.

## `materiePerPrincipaleMapper.buildMateriePerPrincipale`

**File:** `src/application/context-engine/mappers/materiePerPrincipaleMapper.ts:22-40`

Current fallback for the group's display `nome` looks up the **bare base
row** (`materiaRepo.findByIdCached(MateriaId.of(idFittizio))?.nome`) — this
breaks once base rows are optional (returns `null`, falling back to the raw
id string `"INTERPRET"`). Fix: read `nome` from any group member's
`.principale` field instead (every row in the family carries the same
`PRINCIPALE` value by construction):

```ts
const nome = isComposite ? (group[0]!.principale ?? idFittizio) : group[0]!.nome;
```

No other change needed — `baseSigla()`/`isComposite` already assume (per
their own doc comment) that a specificità row's `sigla` is the composite id,
which is now actually true end-to-end for the first time.

## Mock DB (`E2eSampleDatabaseBuilder.seedMaterie`)

- Remove the bare `INTERPRET`/`LAB` rows from `ASSIGNMENT_MATERIE_E2E`'s
  plain-row seeding (they're no longer valid catalog entries on their own).
- `SPECIFICA_MATERIE_E2E` rows (`LAB.GRUPPO_A`, `LAB.SEMINARIO_POMERIDIANO`,
  `INTERPRET.CHITARRA`, `INTERPRET.FLAUTO`) get real `PRINCIPALE`/
  `SPECIFICITA` values instead of `NOME: id`/`SINTESI: id` placeholders —
  e.g. `INTERPRET.CHITARRA`: `PRINCIPALE: 'Interpretazione ed esecuzione'`,
  `SPECIFICITA: 'Chitarra'`. At least one row left with a blank `NOME` cell
  (exercising the fallback reconstruction) and at least one with an explicit
  `NOME` override (exercising the non-fallback path) — exact row-by-row
  assignment to be finalized during planning.
- `MAT`/`ITA`/`ING`/`STO`/`IRC`/`ALT` rows unaffected.

## Testing

- Unit: `Materia.nome` fallback (blank NOME reconstructs
  `PRINCIPALE (SPECIFICITA)`; non-blank NOME wins; plain row unaffected).
- Unit: `AldoTeachingResolutionConfig.getMaterie()` / `ClasseRepository`
  constructor — a family with zero bare rows still gets resolved/enumerated
  correctly (extend `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts`
  and the `ClasseRepository` unit tests).
- Unit: `materiaVm()` — specifica assignment resolves the composite row,
  `sigla`/`nome`/`principale`/`specificita` all populated; no matching
  catalog row → `null` (existing contract).
- Unit: `materiePerPrincipaleMapper` — composite group's `nome` now reads
  `principale`, not a dead base-row lookup.
- Unit: `DocumentBatchService.generateDocentiMateria` — composite
  `materiaId` target generated for a specifica cattedra; two separate targets
  for a docente holding two specifics of the same family.
- E2E: extend the articolazione/consiglio checks (or a new check) asserting
  1A's `INTERPRET.CHITARRA` docente shows composite sigla/principale/
  specificita in `focus.classe.consiglioDiClasse`, and that the
  DOCUMENTO_DOCENTE_MATERIA batch produces a document keyed to the composite
  id for that cattedra.
- `npm run typecheck && npm run lint && npm test` green; online suite
  (`npm run build:online` pre-push gate) covers the batch-generation/E2E path.

## Out of scope

- `MateriaColumn.sigla`/`RisolutoreRuoliService`/CLASSI-column addressing
  (`SheetMaterieGeneratorStrategy.columnForId`) — these already correctly
  resolve composite catalog rows via `findSpecifiche()` for display purposes
  and use base+specifica as separate role-resolution-scoping dimensions;
  neither needs a change under this design.
- `ElencoMaterieConPermessi`'s `distinctBy: ['sigla', 'specificita']` — keeps
  working unchanged (dedup semantics don't depend on whether `sigla` is base
  or composite).
- `CLAUDE.md` GasLibraryFactory-first check: this is SGSA-domain-specific
  catalog modeling (MATERIE shape, CDU display semantics) with no
  general-purpose GAS library analog — no library extension considered.
