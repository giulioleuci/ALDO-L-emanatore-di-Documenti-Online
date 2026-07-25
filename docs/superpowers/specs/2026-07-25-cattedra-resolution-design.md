# Effective-teacher resolution for class councils — design

Source spec: `PROMPT_CATTEDRA.md` (root). This document is the concrete architecture
answering it, plus the two judgment calls confirmed with the user on 2026-07-25.

## Confirmed decisions

1. **Data integrity is fail-loud.** Any inconsistent `VARIAZIONI_CATTEDRA` row
   (`VECCHIO_TITOLARE` mismatch, `NUOVO_TITOLARE` missing from `DOCENTI`, or an
   unresolvable tie between two candidate variations) makes `CattedraResolver`
   throw a typed domain error. No consumer (CDU, roles, email, ACL) may produce a
   silently-wrong holder from bad data.
2. **CDU class-council rows split** when one effective titolare has a different
   supplente state across different subjects they teach (`ENTRAMBI`/`SOLO_SUPPLENTI`).
   One `DocenteCdcVM` row per distinct `(subject-group, supplente-state)` group, not
   one aggregate row with the first-matching subject silently deciding `stato`.

## Current bug, confirmed in the graph

- `CattedraResolver` (`src/application/services/CattedraResolver.ts`) implements the
  correct 3-priority chain, but has **no production callers** — only a test and an
  unrelated online-test registration helper reach it.
- `CdcAssembler.assembleForClasse`, `RisolutoreRuoliService.cdcCompleto` /
  `docenteMateria` / `docentiProva` / `DOCENTI_NO_RELIGIONE`, and
  `EmailNotificationService.cdcEmails` all call `IClasseRepository.getAllDocentiCDC` /
  `getDocentiPerMateria` directly — nominal `CLASSI` only, `VARIAZIONI_CATTEDRA`
  never consulted.
- `RisolutoreRuoliService.applicaSupplenze` and `ResolveRecipientsStep` already do
  `SUPPLENZE` resolution correctly (via `RoleResolutionLib.RoutingResolver` /
  `InMemoryDelegationSource`) — but they're fed the **nominal** titolare, so a
  supplenza registered against the new (post-variation) holder is invisible, and one
  registered against the stale nominal holder wrongly still applies.
- `VariazioneCattedraRepository.findVariazioneAttiva` and
  `CattedraResolver.daVariazione` both pick the **first array match** — row order,
  not "latest `DATA_DECORRENZA` wins".
- `IClasseRepository.getDocentiPerMateria` (main column) is the only Priority-3
  source `CattedraResolver` reads — **`.itp` columns are never resolved** through it.
- IRC/ALT (`CLASSI.IRC` / `CLASSI.ALT`) stay nominal-only by schema necessity:
  `VARIAZIONI_CATTEDRA.MATERIA_ID` and `SUPPLENZE.MATERIE` are FK-constrained to
  `MATERIE.ID` (01_SCHEMA_DATABASE.md §VARIAZIONI_CATTEDRA/§SUPPLENZE), and IRC/ALT
  are not rows in `MATERIE` — they cannot be scoped by a variation or a supply under
  the current schema. This is a documented limitation, not something this change
  fixes (no schema migration in scope). `RisolutoreRuoliService.docentiIrcAlt`
  currently still lets `risolvi()` apply `applicaSupplenze` to it using whatever
  `materiaCorrente` happens to be in context — a latent cross-contamination bug,
  fixed by forcing `SOLO_TITOLARI` (no supply routing at all) for `DOCENTI_IRC_ALT`.
- `StoricoClassiService.perClasse` reads nominal `CLASSI` from a **separate
  historical-year database** — intentionally out of scope: it's an archival
  snapshot of a closed year, not "who teaches this class today".

## New central authority: `CattedraResolver`

`src/application/services/CattedraResolver.ts`, constructed once and wired through
`Bootstrap.ts` / `ServiceContainer` (currently it isn't wired at all). New shape:

```ts
interface CattedraAssignment {
  titolare: Docente;        // effective permanent holder (Priority 2 over 3)
  isItp: boolean;
  supplente: Docente | null; // final active substitute (Priority 1), or null
}

class CattedraResolver {
  /** One assignment per populated slot (main + itp) for (classe, materia, date). */
  resolveCattedra(classe: Classe, materia: MateriaId, date: Date): CattedraAssignment[];

  /** Convenience: final effective teacher(s) — supplente if active, else titolare. Dedup by email. */
  resolveTitolari(classe: Classe, materia: MateriaId, date: Date): Docente[];
  resolveTitolare(classe: Classe, materia: MateriaId, date: Date): Docente | null;

  /** SOLO_TITOLARI-shaped: permanent holder(s) only, ignoring any active supplenza. */
  resolvePermanenti(classe: Classe, materia: MateriaId, date: Date): Docente[];

  /** Class-wide fan-out over every MATERIE column (used by CDU/email enumeration). */
  resolveConsiglio(classe: Classe, date: Date): CattedraAssignment[];
}
```

`resolveTitolari`/`resolveTitolare`/`resolvePermanenti` are thin derivations over
`resolveCattedra` — one code path, so CDU/roles/email/ACL cannot disagree.

### Priority 2 fix (`VARIAZIONI_CATTEDRA`)

For a given `(classe, materia, date, isItp)`:

1. Filter `VariazioneCattedraRepository.findByClasse(classe)` to rows where
   `applicaAMateria(materia)` and `isDecorsaA(date)`.
2. Pick the row with the **max `DATA_DECORRENZA`**. Two rows tied on the max date
   for the same scope → throw `AmbiguousVariazioneCattedraError`.
3. Consistency guard: the winning row's `VECCHIO_TITOLARE` must equal the
   Priority-3 nominal holder for that exact slot (main or itp — this is how main
   vs. itp variations are disambiguated, since the schema has no separate itp flag
   on `VARIAZIONI_CATTEDRA`). Mismatch → throw `VariazioneCattedraInconsistenteError`
   (a variation entered against the wrong/stale holder must not silently apply, and
   must not silently fall through either — it names a real config problem).
   No matching row for either slot at all → no variation, defer to Priority 3
   (the "no overriding variation exists" case — returns `null` internally, not `[]`,
   so `PriorityChainResolver` correctly falls through).
4. `NUOVO_TITOLARE` not found in `DOCENTI` → throw
   `VariazioneCattedraTitolareNonTrovatoError` (never resurrect the nominal holder).

`VariazioneCattedraRepository.findVariazioneAttiva` gets the same max-`DATA_DECORRENZA`
fix (used elsewhere for a simple existence check) or is removed if `CattedraResolver`
turns out to be its only reasonable caller — confirmed during implementation via the
graph.

### Priority 1 (`SUPPLENZE`) — mechanism unchanged, input fixed

`findSupplenzaSpecifica` / `RoleResolutionLib` chain-resolution stays exactly as
implemented (it's already correct). The fix is what's fed into it: every consumer
must resolve the Priority-2/3 holder *first*, then look up its supplenza — never the
raw nominal `CLASSI` docente.

### New domain errors

`src/domain/errors/DomainError.ts`, alongside `EntityNotFoundError`/`ValidationError`:

- `AmbiguousVariazioneCattedraError`
- `VariazioneCattedraInconsistenteError`
- `VariazioneCattedraTitolareNonTrovatoError`

## CDU class-council assembly

`CdcAssembler` stops calling `classi.getAllDocentiCDC` for the full council. New flow
per class at `cdu.meta.date.oggi.iso`:

1. `cattedraResolver.resolveConsiglio(classe, date)` → all `CattedraAssignment`s
   (main + itp, every subject with a populated slot).
2. Group into `DocenteCdcVM` rows by `(rowIdentityEmail, supplenteEmail | null)`,
   where `rowIdentityEmail` is the titolare's email under `SOLO_TITOLARI`/`ENTRAMBI`,
   or the supplente's email under `SOLO_SUPPLENTI` (mirrors today's
   `SwapAndEnrichInterceptor` swap semantics) — this is the confirmed **split-row**
   design: a titolare with mixed supplente state across subjects yields two rows,
   each carrying only its own `materie[]`/`stato`, never a misattributed aggregate.
3. `buildVM` (existing) builds each row from its group; `stato.sostituisce` and
   `anagrafica` follow the existing `SOLO_SUPPLENTI`/`ENTRAMBI` swap rules, just fed
   from the correct (post-variation) titolare.
4. IRC/ALT: unchanged — `classi.getDocentiIRC`/`getDocentiALT`, nominal only, added
   only in `assembleFiltrato` as today (schema limitation above).
5. Articulated classes: same grouping runs per member of `getGruppoArticolazione`,
   merged as today; `tipoArticolazione` keyed by the *effective* email.

`ConsiglioClasseProvider` is unchanged in shape (still just wires `CdcAssembler` into
`cdu.focus.classe.consiglioDiClasse`), but `CdcAssembler`'s constructor gains
`CattedraResolver` and the recipe's `GestioneSupplenti` option (currently threaded
into `SwapAndEnrichInterceptor` via `RecipeOptions` — needs to reach `CdcAssembler`
instead, or `CdcAssembler` runs `SOLO_TITOLARI`-shaped and a *simplified* interceptor
still annotates without changing row count when the policy is `SOLO_TITOLARI`/no
active supplenza; row-count-changing swap only happens inside `CdcAssembler` itself).
Exact seam confirmed during implementation — the split-row requirement is
fundamentally incompatible with a post-hoc per-item interceptor (it can annotate an
item, not add/remove ones), so `SupplentiSubstitutionLookup.ts`'s policy logic moves
into `CdcAssembler`'s grouping step; the interceptor registration is removed once no
longer referenced (confirm no other target path uses it first).

`ElencoMaterieConPermessi.ts` needs no change — it derives its subject list purely
from the already-assembled `consiglioDiClasse`, so it inherits the fix for free.

## Role resolution (`RisolutoreRuoliService`)

- `cdcCompleto`, `docenteMateria`, `docentiProva`, `DOCENTI_NO_RELIGIONE`: switch
  from `classi.getAllDocentiCDC`/`getDocentiPerMateria` to
  `cattedraResolver.resolvePermanenti(...)` (permanent-holder enumeration —
  `applicaSupplenze` still applies the `GestioneSupplenti` routing afterward, as
  today, just now against the correct starting holder).
- `capoDipartimento`: unaffected (resolves a department head from `DIPARTIMENTI`,
  not a class/subject cattedra).
- `docentiIrcAlt` / `DOCENTI_IRC_ALT`: stays nominal (schema limitation); `risolvi()`
  forces `regolaSupplente = SOLO_TITOLARI` for this role regardless of the caller's
  option, closing the latent `materiaCorrente` cross-contamination gap.
- `applicaSupplenze` internals (the `RoutingResolver`/`RoutingPolicy` mapping):
  unchanged — it was already correct, it just needs the right input.

## Email (`EmailNotificationService`)

- `cdcEmails`: switches from `getAllDocentiCDC`/`getAllDocentiCDCArticolata` to
  `cattedraResolver.resolveConsiglio(classe, this.deps.now)` → permanent-holder
  emails, articulated-aware via `resolveConsiglio` looping the class's
  `getGruppoArticolazione` the same way `getAllDocentiCDCArticolata` did. Confirmed
  correct target semantics from `ResolveRecipientsStep`: the `PER_CDC` branch sends
  to `cdcEmails()`'s output verbatim (comment: "not subject to SUPPLENTI" — i.e.
  always the permanent holder), and the `PER_DOCENTE` branch re-resolves supplenza
  per class downstream from `t.docenteEmail` — so `cdcEmails` seeding permanent
  (post-variation) holders, rather than nominal ones, is exactly the fix both
  branches need; no change required inside `ResolveRecipientsStep` itself.
- `EmailNotificationDeps`/`EmailNotificationService.create` gain a `CattedraResolver`
  (or the repositories it needs) dependency.

## Document ACL / permissions

Audit target during implementation: confirm whether subject-specific permission
application reads `ClasseRepository` directly anywhere outside
`ElencoMaterieConPermessi` (which is clean, see above) and `RisolutoreRuoliService`
(`DOCENTE_MATERIA`, fixed above). If a separate ACL-application step re-derives a
cattedra holder itself rather than consuming `RisolutoreRuoliService`/CDU output, it
gets the same `CattedraResolver`-based fix.

## Wiring

`Bootstrap.ts`/`ServiceContainer`: register `CattedraResolver` as a singleton over
the app's `RepositoryDatabase`, inject it into `CdcAssembler`, `RisolutoreRuoliService`,
`EmailNotificationService` (replacing their internal `new ClasseRepository(...)` /
`new SupplenzaRepository(...)` construction for teacher-resolution purposes — they
may still legitimately construct repositories for unrelated lookups, e.g.
`AlunnoRepository`).

## Testing

Unit tests, following the 18-point matrix in `PROMPT_CATTEDRA.md`:

- `CattedraResolver`/`VariazioneCattedraRepository`: the full priority-chain matrix
  (nominal / variation / supply / chain-end / `*` scope / CSV scope / multi-link
  supply / cycle / tie / mismatch / missing-`NUOVO_TITOLARE` / main+itp both
  populated).
- `CdcAssembler`/`ConsiglioClasseProvider`: split-row behavior, IRC/ALT unaffected,
  articulated classes, deterministic ordering.
- `RisolutoreRuoliService`: each affected role × each `GestioneSupplenti` policy,
  against a fixture carrying all three layers so results can be asserted to agree
  with CDU output for the same `(classe, materia, date)`.
- `EmailNotificationService`/`ResolveRecipientsStep`: `PER_CDC`/`PER_DOCENTE` targets
  reflect the post-variation holder.
- One cross-cutting test: CDU, roles, email, and ACL agree for a shared fixture
  spanning all three priority layers (matrix item 17).

## Explicitly out of scope

- `StoricoClassiService` (historical-year snapshot, separate DB, nominal by design).
- Any schema change to `VARIAZIONI_CATTEDRA`/`SUPPLENZE` to add IRC/ALT scoping —
  documented as a current limitation instead.
