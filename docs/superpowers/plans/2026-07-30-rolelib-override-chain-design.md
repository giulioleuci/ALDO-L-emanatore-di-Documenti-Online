# Design: RoleResolutionLib override chain-walking (GasLibraryFactory)

Sub-project 1 of 5 in the VARIAZIONI_CATTEDRA/SUPPLENZE overhaul (see sibling specs
`2026-07-30-variazioni-cattedra-schema-design.md`,
`2026-07-30-cattedra-resolution-wiring-design.md`,
`2026-07-30-materie-specifica-catalog-design.md`,
`2026-07-30-cattedra-chain-verification-design.md`). This one stands alone: it
changes only `GasLibraryFactory/RoleResolutionLib`, has its own tests, and must
land (and be vendored into ALDO via `npm run refresh:vendor`) before any of the
other four.

## Problem

`EffectiveAssignmentResolver._selectOverride` (`src/internal/resolution/EffectiveAssignmentResolver.js`)
already picks the override with the latest `effectiveFrom ≤ asOfDate` among all
overrides whose `.matches(candidate, asOfDate)` is true. But `AssignmentOverride.matches`
(`src/core/AssignmentOverride.js:72-82`) requires `candidate.actorId === this.previousActorId`,
and `candidate.actorId` is always the original base actor from the assignment
source (in ALDO's case, the CLASSI-matrix nominal titolare). That means only a
**single hop** resolves: base actor A can be overridden to B, but a second
override recorded later (B → C) never matches, because no candidate has
`actorId === B`.

Worse: `_validateOverrides` (same file, lines 199-231) throws
`InconsistentAssignmentOverrideError` for any override that doesn't match a base
candidate by actor identity — so a second-hop override doesn't just get ignored,
it makes resolution throw the moment such a row exists.

ALDO's VARIAZIONI_CATTEDRA table (permanent cattedra changes, ref
`01_SCHEMA_DATABASE.md` §VARIAZIONI_CATTEDRA) needs multi-hop resolution: a class
+ subject can change hands more than once in a year (e.g. titolare A → B in
September, B → C in January), each change its own row, and resolution must walk
the chain to the final holder as of the query date — mirroring how
`_resolveDelegations` already walks SUPPLENZE chains (a supplente who is
themself substituted, "catena di supplenza", ref `01_SCHEMA_DATABASE.md`
§SUPPLENZE and `RoleResolutionLib.md`).

## Non-goals

- No change to delegation (SUPPLENZE) chain-walking — already correct.
- No change to the default single-hop behavior or its trace shape when a chain
  has depth 1 — must stay identical to today's output for existing consumers.
- No new public class; this extends `EffectiveAssignmentResolver` and
  `ResolutionPolicy` in place.

## Design

### Chain-walking algorithm

Replace the single-shot `_selectOverride` call in `_resolveCandidate` with a
loop, `_selectOverrideChain(candidate, overrides, asOfDate, trace)`:

1. `visited = [candidate.actorId]`, `applied = []`, `current = candidate.actorId`.
2. Loop:
   a. Filter `overrides` to those where `previousActorId === current`,
      `asOf >= effectiveFrom`, and the override's `slotScope` matches
      `candidate.slot` (reuse the existing scope/validity checks from
      `AssignmentOverride.matches`, decoupled from the `candidate.actorId`
      equality check so it can be evaluated against `current` instead of the
      original candidate's actor).
   b. If no matches: stop: the chain ends at `current`.
   c. Among matches, select the one with max `effectiveFrom` (existing logic in
      today's `_selectOverride`, reused verbatim per hop, including the
      `tieBehavior` THROW/FIRST handling on exact-timestamp ties within a hop).
   d. If `selected.nextActorId` is already in `visited` → throw
      `CircularAssignmentOverrideError` (new error, mirrors
      `CircularDelegationError`), including the visited chain in its context.
   e. If `policy.maxOverrideChainDepth !== null` and `applied.length + 1 >
      policy.maxOverrideChainDepth` → throw `OverrideChainDepthExceededError`
      (new error, mirrors `DelegationDepthExceededError`).
   f. Push `selected` onto `applied`, push `selected.nextActorId` onto
      `visited`, set `current = selected.nextActorId`, continue the loop (so a
      third hop is picked up if one exists).
3. Return `{ chain: applied, finalActorId: current }`.

`_resolveCandidate` uses `finalActorId` (or `candidate.actorId` if the chain is
empty) to look up `permanentActor`, exactly as today. Delegation resolution
(`_resolveDelegations`) is unaffected — it already starts from whatever
`permanentActor` it's given.

### `AssignmentOverride.matches` refactor

Split the existing `matches(candidate, date)` into two pieces so the chain loop
can reuse the scope/date logic without a `candidate.actorId` coupling:

- `appliesAtDate(date)`: `asOf >= this.effectiveFrom`.
- `matchesActor(actorId)`: `actorId === this.previousActorId`.
- `matchesSlot(slot)`: `slot.matches(this.slotScope)`.
- `matches(candidate, date)` (kept, public, used by `_validateOverrides` and any
  external caller) composes all three plus `candidate.isValidAt(asOf)`, so its
  contract and signature are unchanged for existing consumers.

The chain loop calls `appliesAtDate` + `matchesActor(current)` + `matchesSlot`
+ `candidate.isValidAt(asOf)` directly, per hop.

### `_validateOverrides` relaxation

Currently: every override with `effectiveFrom ≤ asOfDate` must match *some* base
candidate by `override.matches(candidate, asOfDate)` (actor identity included).
Change: validate by **slot only** — every such override's `slotScope` must match
at least one candidate's `slot`. This still catches a genuinely orphaned
override (wrong classe/materia, matching nothing in the base assignment source)
but no longer rejects a legitimate second-hop override whose `previousActorId`
is an intermediate actor rather than the base one.

Business-level consistency (e.g. "this override's `previousActorId` must equal
the actual holder at that point in the chain, not some arbitrary actor") is
**not** this library's job — arbitrary same-slot overrides with an unrelated
`previousActorId` simply never get selected by the chain walk (nothing ever
matches them), so they're inert rather than erroring. ALDO-side data-integrity
validation (already-scaffolded-but-unused `VariazioneCattedraInconsistenteError`
etc. in `src/domain/errors/DomainError.ts`) is sub-project 3's concern, not
this library's.

### `ResolutionPolicy` addition

Add `maxOverrideChainDepth` (default `null` = unbounded, symmetric with the
existing `maxDelegationDepth`), validated the same way (`null` or positive
integer). No change to `tieBehavior`/`missingActorBehavior`/`resultIdentity`;
the existing `TIE_BEHAVIORS = ['THROW', 'FIRST']` already covers per-hop ties
correctly (this was the point clarified during design: no new tie-behavior
value is needed — the earlier framing of "add a LATEST tieBehavior" was based on
a documentation read, not the source, and turned out to be unnecessary since
per-hop latest-wins selection already existed for a single hop).

### New errors (`src/internal/errors/RoleResolutionError.js`)

- `CircularAssignmentOverrideError(actorId, chain, context)` — mirrors
  `CircularDelegationError`.
- `OverrideChainDepthExceededError(actualDepth, maxDepth, context)` — mirrors
  `DelegationDepthExceededError`.

Both exported from the library's public surface alongside the existing
`AmbiguousAssignmentOverrideError` / `InconsistentAssignmentOverrideError`.

### Trace

Today, `_resolveCandidate` appends one `OVERRIDE APPLIED` (or `REJECTED`) trace
entry. With chain-walking, append one `OVERRIDE APPLIED` entry per hop (each
carrying its own `overrideId`), plus the existing `REJECTED` entries for
superseded-at-a-given-hop overrides (reused per hop from today's logic). A
single-hop chain produces exactly the same trace shape as today — verified by
existing tests continuing to pass unchanged.

## Testing

- `src/__tests__/resolution/EffectiveAssignmentResolver.test.js`: add cases for
  2-hop and 3-hop chains, a chain that terminates with no further override, a
  cycle (A→B→A) asserting `CircularAssignmentOverrideError`, a depth-limited
  chain asserting `OverrideChainDepthExceededError`, and confirm every existing
  single-hop test still passes unmodified (regression guard for the
  backward-compatibility requirement).
- `src/__tests__/core/EffectiveAssignment.test.js` (or a new
  `AssignmentOverride.test.js` if the split methods warrant direct unit
  coverage): unit-test `appliesAtDate`/`matchesActor`/`matchesSlot` in
  isolation plus the composed `matches`.
- Run `npm test` in `GasLibraryFactory` (4,306+ tests, currently 100% passing)
  to confirm no regression elsewhere in the monorepo.

## Rollout

1. Implement + test in `GasLibraryFactory/RoleResolutionLib`.
2. `npm run refresh:vendor` + `npm run verify:vendor` from the ALDO workspace to
   pull the new bundle into `vendor/gaslibs.Code.js`.
3. Only then does sub-project 3 (resolution wiring) become implementable.
