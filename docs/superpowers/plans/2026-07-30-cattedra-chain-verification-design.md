# Design: full-chain verification — docs, ACL, CDU, email, tests, mock data

Sub-project 5 of 5. Depends on sub-projects 1-4 all being implemented. This is
not new business logic — it's the verification pass point B ("verify that
VARIAZIONI_CATTEDRA and SUPPLENZE are functioning correctly") and the "entire
APP chain" framing of the original request call for: every consumer of
teaching-assignment resolution gets re-tested against the new chain-walking,
restriction semantics, slot-targeting, and specifica catalog, end to end,
offline and online.

## Consumer surface (found via `search_graph`/`grep` for `ITeachingAssignmentResolver`)

- `src/application/services/RisolutoreRuoliService.ts` — the permission/ACL
  resolution entry point referenced by name in `MAT_NON_STANDARD.md` §2.C
  (`RisolutoreRuoliService.risolvi("DOCENTE_MATERIA", cdu)`). Verify it
  correctly passes through slot (`kind`/`specifica`) targeting from
  sub-project 3, and that ACL application for `INTERPRETAZIONE.CHITARRA`-style
  columns resolves to the right docenti.
- `src/application/services/EmailNotificationService.ts` — routes on the
  effective-teacher chain (comment at line 60: "SUPPLENZE -> VARIAZIONI_CATTEDRA
  -> CLASSI"). Verify multi-hop VARIAZIONI_CATTEDRA chains route mail to the
  final holder, not an intermediate one.
- `src/application/context-engine/TeachingCouncilProjection.ts`,
  `src/application/context-engine/providers/ConsiglioClasseProvider.ts`,
  `src/application/context-engine/providers/AlunnoProvider.ts`,
  `src/application/context-engine/ContextEngineFactory.ts` — CDU assembly.
  Verify `focus.classe.*`/consiglio-di-classe projections reflect chained
  variazioni and restricted supplenze correctly (ref `02_CDU_STRUTTURA.md`).
- `src/application/pipelines/emailSteps.ts` — mail pipeline step(s) consuming
  resolved teachers.
- `src/config/ApplicationComposition.ts`, `src/config/Bootstrap.ts` — wiring;
  no logic change expected, but confirm the new/renamed repository methods
  (`findByTitolare`, etc. from sub-project 2) are wired if referenced here.
- `src/infrastructure/repositories/SupplenzaRepository.ts` — confirm the
  existing overlap-invariant check (`findSupplenzaSpecifica`,
  `01_SCHEMA_DATABASE.md` §SUPPLENZE "Invariante") still holds correctly
  against the new restriction-by-omission scope. Overlap-checking must run
  **post-expansion**, against the concrete resolved (classe, materia) pairs —
  pre-expansion (comparing raw CLASSI/MATERIE text) cannot detect an overlap
  between an empty-CLASSI row and an explicit-CSV row at all, since their raw
  text scopes never intersect even when their expanded pairs do.
- Document generation strategies under `src/application/strategies/` that
  consume teaching assignments for placeholders/permissions (e.g. anything
  touching `elencoMaterieConPermessi`, ref `MAT_NON_STANDARD.md` — the
  `SheetMaterieConPermessiGeneratorStrategy` named there).

## Test tiers

### Offline unit (`test/unit/`)

Already covered per-sub-project in specs 1-4; this sub-project's unit-level
work is closing any gaps found once the pieces are integrated — e.g.
`test/unit/application/cattedra-cross-cutting-agreement.test.ts` re-run against
the full stack rather than a mocked resolver.

### Offline integration (`test/integration/`, `jest.integration.config.cjs`)

Currently no VARIAZIONI_CATTEDRA/SUPPLENZE-specific integration tests exist
(confirmed empty during design research). Add integration coverage for:

- Document generation end-to-end for a class/subject with a 2-hop
  VARIAZIONI_CATTEDRA chain — generated doc's teacher placeholder reflects the
  final holder.
- CDU assembly for a class with a restriction-by-omission SUPPLENZE (empty
  CLASSI, valued MATERIE) — `focus.classe.consiglio` (or equivalent CDU path)
  reflects the substitute only for the restricted (classe, materia) pairs.
- ACL/permission application for an `INTERPRETAZIONE.CHITARRA`-style specifica
  column with a `.SPECIFICA`-targeted VARIAZIONI_CATTEDRA row.
- Email routing for the same 2-hop-chain scenario as the doc-gen case above.

### Online (`src/onlinetests/`, `npm run build:online`)

- `src/onlinetests/SampleDatabaseBuilder.ts` /
  `src/onlinetests/E2eSampleDatabaseBuilder.ts`: beyond the rename from
  sub-project 2, add new scenarios:
  - A 2-hop VARIAZIONI_CATTEDRA chain (new docenti slots, following the file's
    existing round-robin/pool numbering convention).
  - A restriction-by-omission SUPPLENZE (empty CLASSI, valued MATERIE) against
    a docente with a deliberately uneven subject/class spread, mirroring the
    spec's own MAT/FIS/1A/1B/3C example closely enough to be a direct
    regression guard for it.
  - A `.itp`/`.SPECIFICA`-targeted MATERIE entry on a SUPPLENZE row, requiring
    a specifica-bearing subject in the sample DB (coordinate with sub-project
    4's fixture addition rather than duplicating it).
- `src/onlinetests/checks/repositoryChecks.ts`: extend the existing
  "Teaching assignment priority chain" checks (lines ~156-265) with assertions
  for the new scenarios above — same style as the existing "SUPPLENZE wins
  within its date window" / "VARIAZIONI_CATTEDRA wins outside the SUPPLENZE
  window" checks.
- `src/onlinetests/checks/contextEngineChecks.ts`: CDU-shape assertions for the
  new scenarios.
- Any e2e mail-content checks (per session history, `docs/superpowers/plans/2026-07-29-online-e2e-failure-repairs.md`
  and the recent `test: preserve logical targets in e2e mail checks` /
  `fix: validate e2e logical mail targets` commits show this is an active,
  fragile area — re-run those checks specifically after this change, not just
  add new ones).

## Acceptance

- `npm run typecheck && npm run lint && npm test && npm run test:integration`
  green.
- `npm run build:online` (runs the offline suite as a push gate) green, and
  the online checks above pass against real GAS (not just build success) —
  per this repo's standing practice, online-GAS validation is a distinct,
  explicit step from a green offline build (ref project memory: online-GAS
  validation historically catches issues offline tests miss, e.g. Advanced
  Sheets API races).
- `MAT_NON_STANDARD.md` and `01_SCHEMA_DATABASE.md`/`02_CDU_STRUTTURA.md` (if
  CDU shape changed) reflect the final behavior — spec-as-built, not
  spec-as-originally-written.

## Sequencing note

This sub-project's plan should be written last (after 1-4 are implemented, not
just specced) since its integration tests need the actual new code to target,
and "which exact fixtures/scenarios are missing" is easier to determine once
sub-projects 1-4's own tests reveal what they didn't cover.
