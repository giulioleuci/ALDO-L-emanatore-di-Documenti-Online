# Design: per-partner CdC scoping for articulated classes + E2E mock fixes

Date: 2026-08-08
Status: approved (pending user review of this doc)

## Problem

Running the online E2E suite, the generated `RIEPILOGHI_FIRME_CDC` document for
`3C-S` and `3C-C` (the two partners of articulated parent class `3C`) lists
seven identical teachers on both documents, with `ITA`/`STO` (and others)
appearing to repeat across the two classes. The mock DB only assigns four
teachers per partner class (one shared `MAT` + three address-specific
subjects), so seven-per-document is a red flag on its own, and identical
rosters on both partner documents defeats the purpose of generating one CdC
report per partner.

## Root cause (traced via codebase-memory-mcp graph)

`AldoTeachingResolutionConfig.resolutionClasses()`
(`src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts`) does:

```ts
private resolutionClasses(classe: Classe): Classe[] {
  if (!this.classi.isArticolata(classe)) return [classe];
  const partners = this.classi.orderedPartners(classe);
  return partners.length >= 2 ? partners : [classe];
}
```

This treats **any** articulated classe — the aggregating parent (`3C`) or one
specific partner (`3C-S`/`3C-C`) — identically: resolution always walks both
partners' teaching slots. That's correct and necessary when the CDU target
_is_ the parent (needed to compute the `COMUNE`/`SEPARATO_PRIMO`/
`SEPARATO_SECONDO` split at all), but `ConsiglioClasseProvider.provide()`
(`src/application/context-engine/providers/ConsiglioClasseProvider.ts`) then
assigns the **full unfiltered union** to `focus.classe.consiglioDiClasse`
regardless of which classe the CDU build actually targets:

```ts
focusClasse.consiglioDiClasse = prepareCouncilAssignments(assignments) as never;
this.projection.intercept('consiglio', cdu, cdu, options);
attachCouncilProjectionMetadata(cdu, assignments);

if (this.classi.isArticolata(classe)) {
  const consiglio: DocenteCdcVM[] = focusClasse.consiglioDiClasse ?? [];
  focusClasse.consiglioDiClasseComune = consiglio.filter((d) => d.tipoArticolazione === 'COMUNE');
  focusClasse.consiglioDiClasseSeparato = consiglio.filter(
    (d) => d.tipoArticolazione === 'SEPARATO_PRIMO' || d.tipoArticolazione === 'SEPARATO_SECONDO'
  );
}
```

When the CDU target is `3C-S` specifically, `consiglioDiClasse` (and
`consiglioDiClasseSeparato`) still contain **both** partners' separate
teachers — that's the 4+4−1(shared MAT)=7 seen in the generated document.
`RIEPILOGHI_FIRME_CDC`'s template renders `focus.classe.consiglioDiClasse`
directly (`E2eTemplateProvisioner.ts`); `CONF_DOC_ARTICOLATA`'s template
renders `consiglioDiClasseComune`/`consiglioDiClasseSeparato` — same bug
class, since `CONF_DOC_ARTICOLATA` is _also_ generated once per partner
target (`ARTICOLATA_TARGETS` includes both `CLASSE_C` and
`CLASSE_C_PARTNER`).

A second, compounding gap: `TeachingCouncilProjection.gruppoNome()` labels
each `SEPARATO` group with `classi.getIndirizzo(partner).nome` — i.e. it
exists specifically to show e.g. "Liceo Scientifico" vs "Liceo Classico" per
partner group. Both partners currently share `INDIRIZZO_E2E`, so that label
is currently a no-op, masking the real domain shape of an articulated class
(different addresses sharing common subjects).

## Fix 1 — `ConsiglioClasseProvider`: scope council to the target partner

**File:** `src/application/context-engine/providers/ConsiglioClasseProvider.ts`

When the CDU target classe is a specific partner (`getArticolazione(classe)`
is non-null and `!config.isParent()` — i.e. it's a partner referencing a
sibling, not the aggregating parent), narrow both `focusClasse.consiglioDiClasse`
and `focusClasse.consiglioDiClasseSeparato` down to `COMUNE` + that partner's
own branch. Parent-target builds (`classe = 3C`) are unaffected — they keep
the full union, which is what the aggregate report needs.

Own branch is determined the same way `tipoArticolazione()` already does: via
`orderedPartners(classe)` — `partners[0].id === classe.id` means this classe
_is_ `SEPARATO_PRIMO`'s owner, otherwise it's `SEPARATO_SECONDO`'s owner.
`IClasseRepository` (already a `ConsiglioClasseProvider` dependency) exposes
`getArticolazione`/`orderedPartners`, so no new dependency is needed.

```ts
if (this.classi.isArticolata(classe)) {
  const consiglio: DocenteCdcVM[] = focusClasse.consiglioDiClasse ?? [];
  const comune = consiglio.filter((d) => d.tipoArticolazione === 'COMUNE');
  const separato = consiglio.filter(
    (d) => d.tipoArticolazione === 'SEPARATO_PRIMO' || d.tipoArticolazione === 'SEPARATO_SECONDO'
  );

  const config = this.classi.getArticolazione(classe);
  if (config !== null && !config.isParent()) {
    const partners = this.classi.orderedPartners(classe);
    const ownBranch = partners[0]?.id === classe.id ? 'SEPARATO_PRIMO' : 'SEPARATO_SECONDO';
    const ownSeparato = separato.filter((d) => d.tipoArticolazione === ownBranch);
    focusClasse.consiglioDiClasseSeparato = ownSeparato;
    focusClasse.consiglioDiClasse = [...comune, ...ownSeparato] as never;
  } else {
    focusClasse.consiglioDiClasseSeparato = separato;
  }
  focusClasse.consiglioDiClasseComune = comune;
}
```

(Exact shape/ordering to be finalized during implementation — the point is:
`consiglioDiClasseComune` is always the full comune set; `consiglioDiClasse`/
`consiglioDiClasseSeparato` are scoped to the target partner's own branch on
partner-target builds, full split on parent-target builds.)

`PartnerProjectionProvider` is unaffected — it only ever runs on parent-target
builds (`options.includiPartnerDettaglio === true` gate) and independently
re-derives `consiglioPrimo`/`consiglioSecondo` from the parent's own (full,
unfiltered) `consiglioDiClasseComune`/`Separato`.

**Test coverage:** extend
`test/unit/application/context-engine/consiglio-provider.test.ts` with cases
building the CDU for each partner target directly (not via the parent) and
asserting `consiglioDiClasse`/`consiglioDiClasseSeparato` contain only that
partner's own docenti (comune + own branch), while a parent-target build
keeps the full split.

## Fix 2 — mock DB: second address for the 3C-C partner

**File:** `src/onlinetests/E2eSampleDatabaseBuilder.ts`

- Add a second `INDIRIZZI` row: id `IND_E2E_CLASSICO`, nome "Liceo Classico
  (E2E)", nomeSintetico `CLA`, tipo `Liceo` (mirrors the existing
  `seedIndirizzi` shape for `INDIRIZZO_E2E`/"Liceo Scientifico (E2E)"/`SCI`).
- `CLASSE_C` (`3C-S`) keeps `INDIRIZZO_E2E` (Scientifico).
- `CLASSE_C_PARTNER` (`3C-C`) switches its `COL_CLASSI.INDIRIZZO` to the new
  `IND_E2E_CLASSICO` id.
- The parent (`3C`) row's own `INDIRIZZO` column is left as `INDIRIZZO_E2E` —
  unchanged, since the existing "CdC unico, materie e indirizzo" check
  (`articolazioneChecks.ts`) asserts the parent's own `anagrafica.indirizzo`
  is `INDIRIZZO_E2E`/`SCI`, and no spec ties the parent row's own indirizzo
  value to its partners'.
- No change to `MATERIE`/`ESAME_CFG_E2E` — both partners keep sharing
  `MATERIE_E2E`/`ASSIGNMENT_MATERIE_E2E`; only the indirizzo FK differs, which
  is all `gruppoNome()` needs to produce distinct labels.

Existing assertions to re-verify still hold: `articolazioneChecks.ts`'s
"documento CDC" check reads `classe.anagrafica.indirizzo` only for the parent
target — partner-target indirizzo isn't asserted there today, so this is a
pure addition, not a breaking change to existing checks.

## Fix 3 — mock DB: valid, address-specific coordinators

**File:** `src/onlinetests/E2eSampleDatabaseBuilder.ts`, `classLayouts()`

- `CLASSE_C` (`3C-S`) coordinator: unchanged (`coordIndex: 3` → docente3,
  teaches `ING` only in `3C-S` — already address-specific, not the shared
  `MAT` teacher).
- `CLASSE_C_PARTNER` (`3C-C`) coordinator: `coordIndex` changes from `4`
  (docente4, who doesn't teach `3C-C` at all — not even a member of its
  cattedra) to `7` (docente7, who teaches `ING` only in `3C-C` —
  address-specific, mirrors docente3's role on the other partner).

## Fix 4 — new E2E check: parent-level shared vs. address-specific roster

**File:** `src/onlinetests/checks/articolazioneChecks.ts`, appended to
`registerArticolazioneChecks`.

New `runner.add(...)` entries building the CDU for `CLASSE_C_PARENT` and
asserting, from `focus.classe.consiglioDiClasseComune` /
`consiglioDiClasseSeparato` (already populated by Fix 1's parent-branch, which
stays a full split):

- **Shared roster** (`consiglioDiClasseComune`): exactly the `MAT` teacher
  (docente1), tagged `tipoArticolazione: 'COMUNE'`, subject `MAT`.
- **First group** (`consiglioDiClasseSeparato` filtered to
  `SEPARATO_PRIMO`): docenti 2/3/4 teaching `ITA`/`ING`/`STO` in `3C-S`, each
  `gruppoNome` resolving to "Liceo Scientifico (E2E)" (via the new
  `INDIRIZZO_E2E` FK on `3C-S`).
- **Second group** (`SEPARATO_SECONDO`): docenti 6/7/8 teaching
  `ITA`/`ING`/`STO` in `3C-C`, each `gruppoNome` resolving to "Liceo Classico
  (E2E)" (Fix 2's new indirizzo).
- Cross-check against direct partner-target builds (Fix 1): building the CDU
  for `CLASSE_C` directly yields `consiglioDiClasse` = comune ∪ first-group
  only (4 docenti, not 7); building for `CLASSE_C_PARTNER` yields comune ∪
  second-group only (4 docenti, not 7).

This directly exercises the parent/partner scoping contract end-to-end
(mock DB → resolver → provider → CDU), not just at the unit level.

## Out of scope

- No change to `AldoTeachingResolutionConfig.resolutionClasses()` itself — it
  correctly needs the full partner union to compute the COMUNE/SEPARATO tags
  in the first place; the fix belongs at the point where the CDU decides what
  to expose for _this_ target classe.
- No change to `PartnerProjectionProvider` (unaffected, see Fix 1).
- No change to `ESAME_CFG_E2E`/subject curriculum — only the indirizzo FK
  differs between the two partners.
