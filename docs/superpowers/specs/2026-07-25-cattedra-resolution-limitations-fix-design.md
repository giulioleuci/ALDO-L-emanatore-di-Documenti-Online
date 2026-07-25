# Fixing the two known limitations from the cattedra-resolution plan — design

Source: two limitations discovered and deliberately left unfixed (out of scope)
during the `2026-07-25-cattedra-resolution.md` plan's Task 12 and final
whole-branch review. Both are now documented inline in committed code
(`RisolutoreRuoliService.ts`, `SheetMaterieConPermessiGeneratorStrategy.ts`).
This spec addresses both, structured as two independent phases inside one plan
(confirmed with the user: single design doc + single implementation plan, not
two separate cycles — the fixes are technically independent but were
discovered together and are small enough not to warrant separate
brainstorm→plan→implement overhead).

**Not yet in production** — no live GAS deployment exists yet (per project
memory), so neither phase requires a data-migration step. Schema/seed changes
apply directly to the fixture and to whatever Master Sheet gets provisioned at
first deploy.

---

## Phase A — IRC/ALT can now carry VARIAZIONI_CATTEDRA / SUPPLENZE

### Problem

`IRC`/`ALT` are `CLASSI` columns (CSV of `DOCENTI.EMAIL`), not `MATERIE` rows.
`VARIAZIONI_CATTEDRA.MATERIA_ID` and `SUPPLENZE.MATERIE` are both FK-constrained
to `MATERIE.ID` — with no way to reference IRC/ALT, neither table can express a
permanent chair change or a temporary substitution for the religion/alt-activity
teacher. `RisolutoreRuoliService.risolvi()` currently forces `DOCENTI_IRC_ALT` to
`SOLO_TITOLARI` unconditionally as a workaround, and `CdcAssembler.assembleFiltrato`
appends IRC/ALT teachers from nominal `CLASSI` columns only.

`SPECS_ALDO/01_SCHEMA_DATABASE.md:116` currently states IRC/ALT "NON DEVONO
corrispondere" to any `MATERIE.ID` — this is the authoritative source of truth
per `CLAUDE.md` and this decision **reverses that constraint**, so the schema
doc itself is part of this change, not just application code.

### Confirmed decision

**Revise the schema**: IRC and ALT become real rows in `MATERIE` (`ID='IRC'`,
`ID='ALT'`), so `VARIAZIONI_CATTEDRA`/`SUPPLENZE` can reference them like any
other subject. A new `MATERIE.IS_RELIGIONE_ALT` boolean flag lets consumers
exclude them from the generic per-class fan-out by default, preserving today's
role semantics (`CDC` includes IRC/ALT, `DOCENTI_NO_RELIGIONE` excludes them) —
without this flag, every `resolveConsiglio` caller would suddenly see IRC/ALT
mixed into results that never included them before, collapsing that
distinction.

### Schema changes (`SPECS_ALDO/01_SCHEMA_DATABASE.md`)

- `MATERIE` table gains `IS_RELIGIONE_ALT: Boolean` (default/omitted = `false`).
  New seed rows: `ID='IRC'` and `ID='ALT'`, `IS_RELIGIONE_ALT=true`,
  `ESAME_CONFIG` left empty/null (never part of exam-commission resolution —
  `RisolutoreRuoliService.docentiProva` already skips any materia whose
  `esameConfig` is `null`, so this is a natural, no-extra-code exclusion).
- `CLASSI.IRC`/`CLASSI.ALT` columns: **unchanged**. They already follow the
  same CSV-of-`DOCENTI.EMAIL` shape `ClasseRepository.getDocentiPerMateria`
  reads for any ordinary subject's main column — no physical schema change
  needed there, `MateriaId.of('IRC')`/`'ALT'` naturally resolve against them
  once the `MATERIE` rows exist.
- Update the `01_SCHEMA_DATABASE.md:116` note: replace the "must never
  correspond to MATERIE.ID" constraint with a note that they are now ordinary
  (flagged) `MATERIE` rows, and explain why the flag exists (role-semantics
  preservation, see above).

### `CattedraResolver` changes

- `resolveConsiglio(classe, date, options?: { includeReligioneAlt?: boolean })`
  — new optional parameter, default `false`. When `false` (today's implicit
  behavior for every existing caller), materie flagged `IS_RELIGIONE_ALT` are
  skipped in the per-materia fan-out. When `true`, they're included like any
  other materia — meaning they go through the full `risolviSlot` priority
  chain (SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI), gaining genuine permanent/
  temporary reassignment support for the first time.
- `resolveCattedra`/`resolvePermanenti` for a specific `materia` are unaffected
  — they already work for any `MateriaId`, IRC/ALT included, once the `MATERIE`
  rows exist. The flag only matters for the *fan-out* methods that enumerate
  "all materie."

### `RisolutoreRuoliService` changes

- `docentiPermanenti`/`cdcCompleto` (backing the `CDC` role): call
  `resolveConsiglio(classe, data, { includeReligioneAlt: true })` — replaces
  today's `[...docentiPermanenti(...), ...getDocentiIRC(classe), ...getDocentiALT(classe)]`
  concatenation with a single resolver call.
- `DOCENTI_NO_RELIGIONE` role: calls `resolveConsiglio(classe, data)` (flag
  omitted/`false`) — identical to today's `docentiPermanenti` alone.
- Delete the private `docentiIrcAlt` method (superseded).
- **Remove** the unconditional `SOLO_TITOLARI` override for `DOCENTI_IRC_ALT`
  in `risolvi()` — supplenza/variazione routing now applies correctly like any
  other role, since the underlying resolution is now real instead of a
  known-limited nominal read.

### `CdcAssembler.assembleFiltrato` changes

- Replace the `getDocentiIRC(classe)`/`getDocentiALT(classe)` nominal-only
  extras with a filtered read off `resolveConsiglio(classe, date, gestioneSupplenti, { includeReligioneAlt: true })`
  restricted to `materia.value ∈ {'IRC', 'ALT'}` — the filtered CDU now
  reflects effective (not just nominal) IRC/ALT holders, split-row grouped the
  same way ordinary subjects are (Task 6's confirmed design).

### Test impact (existing suites to re-verify, not just extend)

- `test/unit/application/risolutore-ruoli-service.test.ts` — `DOCENTI_IRC_ALT`
  tests (including Task 10's forced-`SOLO_TITOLARI`-under-active-supplenza
  regression test) get rewritten: the forcing is gone, so the same fixture
  scenario should now show the supplenza actually applying.
- `test/unit/application/context-engine/cdc-filtrato.test.ts` — IRC/ALT
  extras' shape changes from "always titolare, no split" to "effective,
  split-row capable like any subject."
- `test/fixtures/tables.ts` — add `IRC`/`ALT` rows to `MATERIE`.

---

## Phase B — centralize articulated partner-routing inside `CattedraResolver`

### Problem

`RisolutoreRuoliService.docenteMateria` (backing `DOCENTE_MATERIA`, and
transitively `SheetMaterieConPermessiGeneratorStrategy.resolveDocentiMateria`
via `risolvi('DOCENTE_MATERIA', ...)`) and `docentiProva` (backing
`DOCENTE_PRIMA_PROVA`/`DOCENTE_SECONDA_PROVA`) both call
`cattedraResolver.resolvePermanenti(ctx.classe, ...)` directly. For an
articulated **parent** class, this resolves against the parent entity, which
legitimately has no nominal value for a subject that's split per-partner —
returning an empty holder list and silently under-protecting ACLs / producing
no exam-commission holder, instead of erroring or resolving correctly.
`CdcAssembler.assignmentsArticolata` already solves the identical problem
correctly for the CDU path by resolving against `orderedPartners(classe)`
(never the parent) and merging by key — but that logic is local to
`CdcAssembler`, not reusable by `RisolutoreRuoliService`.

### Confirmed decision

**Move partner-routing into `CattedraResolver` itself**, so every consumer —
present and future — gets correct articulated-class resolution for free,
instead of each consumer reimplementing (or forgetting to reimplement) the
same routing. This is a larger, riskier change than a local fix (it touches
already-shipped, tested code in `CdcAssembler` and `EmailNotificationService`)
but converges the codebase onto a single source of truth for "how do we
resolve an articulated class's cattedra," matching the cattedra-resolution
plan's original intent.

### `CattedraResolver` changes

- `resolveCattedra(classe, materia, date)` becomes articulation-aware
  internally: if `this.classi.isArticolata(classe)` and
  `this.classi.orderedPartners(classe).length >= 2`, resolve against **both
  partners** (never the parent — same precedent already established and
  re-verified across Tasks 7/9/11's review chain) and merge the two
  `CattedraAssignment[]` results by key `(titolare.id, supplente?.id, isItp)`
  — the same dedup-by-key logic `CdcAssembler.assignmentsArticolata` already
  performs, relocated here and scoped per-materia instead of across all
  materie at once.
- `resolvePermanenti`/`resolveConsiglio` inherit the fix automatically (they
  already call `resolveCattedra` internally) — no signature changes needed on
  either.
- Non-articulated classes, or an articulated class resolved with fewer than 2
  partners (defensive fallback, matches existing `assignmentsArticolata`
  guard): behavior is byte-identical to today.

### Cascading simplification (confirm behaviorally identical, don't just delete)

- `RisolutoreRuoliService.docenteMateria`/`docentiProva`: **no code change** —
  the bug disappears because the underlying resolver now handles it. Remove
  the two `KNOWN LIMITATION` doc comments (they're no longer true).
- `SheetMaterieConPermessiGeneratorStrategy.resolveDocentiMateria`: **no code
  change** — delegates to `RisolutoreRuoliService.risolvi('DOCENTE_MATERIA', ...)`,
  fix propagates automatically. Remove its `KNOWN LIMITATION` doc comment too.
- `CdcAssembler.assignmentsArticolata` becomes redundant: `assembleForClasse`/
  `assembleFiltrato`'s articulated branch can call
  `cattedraResolver.resolveConsiglio(classe, date)` — the same call already
  used for non-articulated classes — since `CattedraResolver` now partner-
  routes internally. `assignmentsArticolata` can be deleted once the
  articulated-class tests in `cdc-assembler.test.ts` are confirmed to produce
  identical output through the simplified path. `tipoArticolazioneDi`
  (COMUNE/SEPARATO_PRIMO/SEPARATO_SECONDO tagging) is **unrelated and
  unchanged** — it's a nominal-column labeling concern, not a resolution
  concern.
- `EmailNotificationService.cdcEmails`'s `gruppoResolutivo` helper (the
  `orderedPartners`-based fan-out added in Task 11) becomes redundant for the
  same reason — a single `resolveConsiglio(classe, date)` call per entry-point
  class suffices, whether articulated or not. Confirm `cdcEmails`'s existing
  cognome-sort (Task 11's fix) still produces the same final ordering through
  the simplified path before deleting `gruppoResolutivo`.

### Test impact (re-verify, not just extend)

- `test/unit/application/cattedra-resolver.test.ts` — new tests for
  `resolveCattedra`'s per-materia partner-routing (mirroring the existing
  `resolveConsiglio` articulated test's assertions, but scoped to one materia
  resolved via `resolvePermanenti` directly).
- `test/unit/application/context-engine/cdc-assembler.test.ts` — the existing
  articulated tests (COMUNE/SEPARATO tagging, `1F` group) must produce
  identical VMs through the simplified `assembleForClasse` path before
  `assignmentsArticolata` is deleted.
- `test/unit/application/email-notification-service.test.ts` — the `1F` group
  PER_CDC/PER_DOCENTE tests must produce identical recipient sets/order
  through the simplified `cdcEmails` before `gruppoResolutivo` is deleted.
- `test/unit/application/risolutore-ruoli-service.test.ts` — add a new
  articulated-class regression test for `DOCENTE_MATERIA`/`DOCENTE_PRIMA_PROVA`
  proving the fix (previously would have silently returned `[]` for a split
  subject on the `1F` parent; now resolves the correct partner-specific
  teacher).

---

## Global constraints (unchanged from the original cattedra-resolution plan)

- Native GAS globals only inside `GoogleApiWrapper`.
- No circular dependencies across `src/domain` → `src/application` →
  `src/infrastructure`.
- `npm run typecheck`, `npm run lint`, and the affected Jest projects must
  pass before any task is considered done.
- Do not weaken tests, lint rules, or architecture checks to make something
  pass.
- Per `CLAUDE.md`'s GasLibraryFactory-first mandate: neither phase touches
  library code or reimplements anything `GasLibraryFactory` already provides
  — both are ALDO-domain-specific (CDU shape, schema interpretation).

## Open risk, flagged not resolved

`CdcAssembler`'s `tipoArticolazioneDi` (Task 7) already carries a documented,
unfixed edge case: it checks a row's *effective* email against each partner's
*nominal* `CLASSI` columns, which could misclassify COMUNE/SEPARATO tagging if
a `VARIAZIONI_CATTEDRA` row were ever scoped directly to a partner class (not
just the parent). Phase B does not touch or fix this — it's a labeling
concern, not a resolution concern, and remains a separate, still-latent edge
case for a future task if it's ever hit in practice.
