# DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA + ARTICOLAZIONE.md — design

Date: 2026-07-30

## Purpose

Two deliverables:

1. A new online e2e scenario exercising a new `CONF_DOC` type,
   `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`, generated against the articulated
   class 3C (parent `3C`, partners `3C-S`/`3C-C`, already seeded in
   `E2eSampleDatabaseBuilder`). The document contains four bulleted lists:
   - all students, major (indirizzo) attended in brackets
   - teachers common to the whole class, their subject(s) in brackets
   - teachers per major, subjects + major in the form `subject1, subject2
     (Major)`
   - parent representatives, student representatives, and coordinators,
     each with the major (indirizzo) of the group they belong to /
     coordinate, in brackets
2. `ARTICOLAZIONE.md` — a report on how ALDO currently handles articulated
   classes across document generation, email sending, and CDU construction,
   including gaps found while building (1).

## Background / what already exists

- Doc rendering: `GENERATORE` (strategy-registry key) is separate from
  `TIPO` (free descriptive label) on `CONF_DOC` —
  `ConfigurazioneDocumento.ts:26-30`, checked in
  `DocumentGenerationService.ts:96`. The existing `REPORT_COMPLESSO` /
  `DOCUMENTO_GENERICO` pair is the precedent this new doc type follows:
  new `TIPO`, reuse `GENERATORE: DOCUMENTO_GENERICO`
  (`DocumentoGenericoGeneratorStrategy` — pure `templates.processDocument`
  substitution, no new strategy class needed).
- Template syntax (`WorkspaceTemplateEngine`/`DocumentProcessor`, GAS lib,
  proven via existing e2e fixtures in `E2eTemplateProvisioner.ts`):
  `{{#bullet_list:path}}...{{/bullet_list}}`, `{{#number_list:...}}`,
  `{{#tablerow_loop:...}}`, pipes `sortBy`, `uppercase`, `filter`/`where`,
  `map`, `join`. Nested loops and multi-arg pipe chaining
  (`where:'field','value'`, `map:'key' | join:', '`) are **not** documented
  beyond stub signatures in `GasLibraryFactory/DOCS_LIBS` and are not
  proven by any existing fixture — treated as unproven, not relied on here.
- 3C is already seeded as an articulated group in
  `E2eSampleDatabaseBuilder.ts:31-33,454-475` (`CLASSE_C_PARENT='3C'`,
  partners `3C-S`/`3C-C`). No new class-layout seeding needed.
- `studentiDellaClasse` (`src/application/context-engine/studenti.ts`)
  already merges both partners' rosters when the focus class is the
  articulated parent. `StudentiProvider` already builds `listaCompleta`
  and `perIndirizzo` (map keyed by indirizzo sigla) the same way, but does
  **not** attach the major to each flat list item.
- `consiglioDiClasse` (`DocenteCdcVM`, built by
  `TeachingCouncilProjection.councilVmStrategy`) already spans the whole
  articulated group and tags each teacher `tipoArticolazione:
  'COMUNE'|'SEPARATO_PRIMO'|'SEPARATO_SECONDO'|null`, with each teacher's
  full subject list in `materie[]`. It does not carry a joined-subjects
  display string, nor the actual major *name* for SEPARATO_PRIMO/SECONDO
  (only the symbolic tag).
- Coordinators are tracked distinctly per partner class already (commits
  `f01e3e6`/`b771f6d`, "route articulated coordinators by partner",
  "model distinct articulated coordinators") — but that logic lives in
  `EmailNotificationService` (email routing) only.

## Confirmed gaps (bugs, general — not scoped to this one document)

- `RappresentantiProvider.ts:14-28` calls `classi.getStudenti(classe)`
  directly, with no articulated-parent expansion. For the 3C parent this
  returns **empty** student/parent-rep lists today, for *any* document
  targeting the parent class, not just the new one.
- `ClasseProvider.ts:53` builds `coordinatori` the same
  non-group-expanded way — misses each partner's distinct coordinator
  when the focus class is the articulated parent.

Both are fixed as part of this work because they are general CDU-building
defects that happen to block the new document, not something scoped only
to it.

## CDU / provider changes

All changes are additive (new optional fields / new array), preserving
existing consumers (`VERBALE_PARAGRAPHS`, `RIEPILOGO_PARAGRAPHS`, etc.)
byte-for-byte for non-articulated classes and for every field already in
use.

1. **`AlunnoContestoVM`** (`Cdu.ts`) gains
   `indirizzo?: { sigla: string; nome: string; nomeSintetico: string }`.
   `StudentiProvider.buildVM` takes the owning class's `Indirizzo` and
   populates it — the partner's indirizzo when expanding an articulated
   parent, the focus class's own indirizzo in the plain branch (for
   consistency; harmless for existing consumers, which don't read the
   field).

2. **`RappresentantiProvider`** gets the same parent/partner branching
   `studentiDellaClasse` already uses: when `getArticolazione(classe)`
   is a parent, iterate `getClassiPartner(classe)`, build
   `rappresentanti.studenti`/`.genitori` per partner, and tag each entry
   `indirizzo?: { nome: string }` with that partner's major. Non-parent
   classes keep today's single-class behavior (field left undefined).

3. **`ClasseProvider.coordinatori`** gets the equivalent fix: for an
   articulated parent, merge `getCoordinatori` across
   `getClassiPartner(classe)` (plus the parent row's own `COORD`, kept for
   safety though expected empty in practice), each entry tagged
   `indirizzo?: { nome: string }`. Non-articulated/non-parent classes
   unaffected.

4. **`DocenteCdcVM`** (`councilVmStrategy` in `TeachingCouncilProjection.ts`)
   gains:
   - `materieDescrizione: string` — `materie[].nome` comma-joined, computed
     once here (not deferred to an unproven template pipe chain).
   - `gruppoNome: string | null` — the resolved major name for
     `SEPARATO_PRIMO`/`SEPARATO_SECONDO` (via `orderedPartners(classe)`
     `[0]`/`[1]`'s indirizzo), `null` for `COMUNE` and for non-articulated
     classes.

5. **`ConsiglioClasseProvider`** additionally emits two ready-filtered
   arrays on `CduClasse`: `consiglioDiClasseComune` (only
   `tipoArticolazione === 'COMUNE'`) and `consiglioDiClasseSeparato` (only
   `SEPARATO_PRIMO`/`SEPARATO_SECONDO`, each with its `gruppoNome`
   populated). Filtering is a plain array `.filter()` server-side — the
   template performs no filtering pipe at all, eliminating the "is
   `where` chaining actually supported" risk entirely. Both arrays are
   `undefined`/absent for non-articulated classes (same shape convention
   as the existing optional `articolazione` field on `CduClasse`).

## New CONF_DOC + template

- `TIPO: 'DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA'`, `GENERATORE:
  'DOCUMENTO_GENERICO'`. Seeded in `E2eSampleDatabaseBuilder.seedConfDoc`
  targeting the 3C parent (`ClasseId('3C')`), recipe `CLASSE_COMPLETA`.
- New Drive template registered in `E2eTemplateProvisioner.ts` (new
  `NAME_...` constant + paragraph list, following the existing
  `DOC_COMPLESSO_PARAGRAPHS` pattern), four flat `bullet_list` blocks, no
  nesting, no filter/where/map/join pipes:
  1. Students — `{{#bullet_list:focus.classe.studenti.listaCompleta |
     sortBy:'anagrafica.nomeCompleto'}}{{anagrafica.nomeCompleto}}
     ({{indirizzo.nome}}){{/bullet_list}}`
  2. Common teachers — over `focus.classe.consiglioDiClasseComune`:
     `{{anagrafica.nome}} {{anagrafica.cognome}} ({{materieDescrizione}})`
  3. Per-major teachers — over `focus.classe.consiglioDiClasseSeparato`:
     `{{materieDescrizione}} ({{gruppoNome}})`
  4. Representatives + coordinators — three consecutive `bullet_list`
     blocks under one heading, over `focus.classe.rappresentanti.studenti`,
     `.genitori`, and `focus.classe.coordinatori` respectively, each
     `... ({{indirizzo.nome}})` (coordinators use `{{nome}}`, reps use
     `{{nomeCompleto}}` — existing field names, unchanged).
- New scenario check registered in `e2eScenarioChecks.ts` (following
  `registerE2eScenarioChecks` conventions), asserting the rendered
  document's text contains all four lists, non-empty, with both 3C
  partners' majors represented and correctly attributed per person.

## Testing

- Unit (TDD, per project convention): `StudentiProvider` (indirizzo
  field populated for parent-expansion and plain branches),
  `RappresentantiProvider` (parent-articolata expansion + `indirizzo`
  tagging, existing non-articulated behavior unchanged),
  `ClasseProvider` (coordinatori expansion + tagging, same non-regression
  requirement), `TeachingCouncilProjection`/`ConsiglioClasseProvider`
  (`materieDescrizione`, `gruppoNome`, `consiglioDiClasseComune`/
  `Separato` split, absence of the two new arrays for non-articulated
  classes).
- Online e2e: the new scenario is the end-to-end proof that the template
  constructs actually render as expected in real Google Docs — this is
  the first real-environment validation of `bullet_list` combined with
  the new CDU fields; any surprises here (e.g. an engine quirk not
  visible in unit tests) get fixed by adjusting the CDU shape/template,
  not by reaching for unproven pipe syntax.
- Full suite (`npm run typecheck`, `npm run lint`, `npm test`,
  `npm run test:integration`, `npm run build:online`) must stay green
  before considering the branch done.

## ARTICOLAZIONE.md scope

New markdown report at repo root (`ARTICOLAZIONE.md`), alongside other
top-level project docs. Sections:

1. **Document generators** — `TIPO` vs `GENERATORE`, how a `CONF_DOC` row
   targets a parent vs. a partner class, `GESTIONE_ARTICOLAZIONE`
   (`COL_CONF_DOC`) as a **dead, unwired config column** (seeded in
   fixtures, read nowhere in `src/application`) — flagged as a real gap:
   there is currently no first-class notion of "generate one document
   spanning the articulated group" at the pipeline level; it only works
   because `focus.classe` can be pointed at the parent and providers
   (after this fix) expand internally.
2. **CDU construction** — the group-expansion pattern
   (`studentiDellaClasse`, and the two provider fixes from this work as
   a before/after case study), `tipoArticolazione` tagging via GLF's
   `CattedraResolver` partner-routing, `ClasseRepository
   .getMaterieArticolazione` condivise/separate split logic.
3. **Email sending** — `RisolutoreRuoliService.genitoriClasse`,
   `EmailNotificationService.targetsPerCoordinatore`/`classiCompetenza`
   partner-routing (the "route articulated coordinators by partner" fix),
   contrasted with the CDU-side gap that existed until this work (email
   routing was already partner-aware; document CDU building was not).
4. **Gaps** — consolidates: `GESTIONE_ARTICOLAZIONE` dead column, the two
   fixed provider bugs (documented as historical/fixed, not open), and a
   quick check (done while writing the report, not blocking code) of
   whether `ApplyPermissionsStep`/ACL resolution and `LOG_DOCS`
   registration are articulation-group-aware or only single-class-aware.

The report is written last, after the code lands, so it reflects the
actual fixed behavior rather than describing bugs as still-open.

## Non-goals

- No GasLibraryFactory changes — all logic here is SGSA/CDU-shape-specific
  domain logic (articulated-class semantics, CONF_DOC interpretation),
  which CLAUDE.md scopes to ALDO, not the library.
- No new `GeneratorStrategy` class — `DOCUMENTO_GENERICO` is reused as-is.
- No change to `GESTIONE_ARTICOLAZIONE` wiring — noted as a gap in the
  report, not fixed (out of scope; a genuinely separate piece of work).
