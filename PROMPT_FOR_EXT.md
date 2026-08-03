# Task: extend the E2E online-test mock database and add a chair-change / CDU / articolazione verification suite

## 0. What this document is

This is an implementation brief for an autonomous coding agent working inside the `ALDO implementing` repository. It expands a
short manual request into a complete, self-contained spec: the exact files
involved, the conventions already in force, the concrete data already seeded,
and the acceptance criteria. Read it fully before writing any code. Where a
design decision was implicit in the original request, this document makes it
explicit and states the reasoning — follow it unless you find a concrete
blocker, in which case stop and ask rather than silently deviating.

The rules that matter most
for this task:

- **GasLibraryFactory-first.** Before writing any new logic, check
  `GasLibraryFactory/DOCS_LIBS` for something that already does it. This task
  is expected to be almost entirely **data-driven** (new `CONF_DOC`/`CONF_MAIL`
  rows, new template paragraphs/tables, new check registrations using the
  existing `TestRunner`/`GasOnlineTestFramework.EnhancedTestRunner` plumbing) —
  if at any point you find yourself wanting to write a new application-layer
  strategy class or a new GLF-shaped utility, stop and ask the user whether
  `GasLibraryFactory` should be extended instead of adding ALDO-local code.
- **Never touch `dist/*`.** Only edit source under `src/` and `test/`.
- **GAS V8 target.** Synchronous only; no Node-only APIs.
- Use the `codebase-memory-mcp` graph tools (`search_graph`, `trace_path`,
  `get_code_snippet`, `query_graph`) to navigate rather than re-grepping from
  scratch — the indexed projects are `home-giulio-Desktop-ALDO-implementing`
  (ALDO + GasLibraryFactory) and `aldo-full-coverage` (ALDO + all test tiers).
- Native GAS globals (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, etc.) may
  only appear inside `GoogleApiWrapper`/`GasOnlineTestFramework`-sanctioned
  code. `src/onlinetests/**` is itself a sanctioned exception (it runs inside
  real GAS by design), but new code added under it should still route through
  the existing `IDriveFacade`/`ISampleSpreadsheetFactory`/`IArtifactFactory`
  ports already used by its siblings, not raw globals.

## 1. System under test — what already exists

### 1.1 The two online-test entry points

`src/onlinetests/index.ts` exposes two independent GAS "Run" dropdown
functions, each building its own throwaway sample database and pointing
`PROP_MASTER_SPREADSHEET_ID` at it before booting a real `initAldo()`
container:

- `runOnlineTests()` → `executeOnlineTests()` — the small smoke-test database
  built by `SampleDatabaseBuilder`. Not the focus of this task.
- `runE2eScenarios()` → `executeE2eScenarios()` — the larger, persistent E2E
  database built by `E2eSampleDatabaseBuilder` (`src/onlinetests/
  E2eSampleDatabaseBuilder.ts`, ~1200 lines) plus real Drive template
  artifacts provisioned by `E2eTemplateProvisioner`
  (`src/onlinetests/E2eTemplateProvisioner.ts`). This is the one you extend.

Both are deliberately kept as **separate top-level entry points** (see the
doc comments on `executeE2eScenarios` in `index.ts`) — different master
pointer, unrelated failure semantics, either can be run alone from the Apps
Script editor's Run dropdown. **Your new test function must follow the same
pattern**: a third, independent GAS entry point, not a change bolted onto
`runE2eScenarios` itself.

### 1.2 How results are produced and reported

`TestRunner` (`src/onlinetests/OnlineTestReport.ts`) is ALDO's thin adapter
over **`GasOnlineTestFramework.EnhancedTestRunner`** — this *is* "the testing
library provided by GasLibraryFactory" referenced in the original request,
already in use. Usage pattern, identical everywhere in `src/onlinetests/
checks/*.ts`:

```ts
runner.add('Descriptive check name', optionalArtifactUrl, () => {
  // ...compute actual values from the built CDU / repositories / DB rows...
  if (actual !== expected) {
    throw new ValidationError(`Human-readable diagnostic: expected X, got ${actual}`);
  }
});
```

`ValidationError` comes from the domain error module already imported in
`e2eScenarioChecks.ts`. Every check is a **pure console-comparable
assertion**: it reads data back out of the `db` (`EmailDb`/`SheetDBLog`-style
table accessor, `db.table(TABLE.X).findAll()`), the built CDU
(`ContextBuilder`/`container.get<...>()`), or repository/service return
values, and throws with a precise diagnostic message if it disagrees with a
hand-computed expected value. **No check should require a human to open a
generated Drive file and eyeball it** — that is exactly the property the
original request's item 3 asks you to preserve ("things that can be
automatically verified via console comparisons without having to manually
check the files"). `runOnlineTests`/`runE2eScenarios`/your new function all
end by `Logger.log(JSON.stringify(report))`, so results are LLM-and-human
readable JSON: `{ suite, startedAt, finishedAt, passed, failed, results: [{
name, status, message?, artifactUrl? }] }`.

`OnlineTestDeps`/`E2eTestDeps` show the seam pattern used throughout: every
field defaults to a real GAS-backed implementation but can be overridden —
this is what makes `test/unit/onlinetests/e2e-sample-database-builder.test.ts`
and `test/unit/application/pipelines/log-registration.test.ts` able to
exercise the same builder/registration logic **fully offline** in Jest.
**Your new fixture data and new check-registration function must both get an
offline unit-test mirror**, exactly like every existing piece of
`E2eSampleDatabaseBuilder`/`e2eScenarioChecks.ts` does — this is not optional
polish, it's how regressions in this fixture get caught before a slow, quota-
consuming live GAS run.

### 1.3 The existing E2E class layout (do not restructure, extend)

`E2eSampleDatabaseBuilder.classLayouts()` seeds exactly this class structure
— know it before adding anything:

- `CLASSE_A = '1A'` — 20 studenti, plain (non-articulated), coordIndex 1.
- `CLASSE_B = '2B'` — 20 studenti, plain, coordIndex 1 (shares coordinatore
  with 1A on purpose, to exercise multi-class coordinatore aggregation).
- `CLASSE_C_PARENT = '3C'` / `CLASSE_C = '3C-S'` / `CLASSE_C_PARTNER =
  '3C-C'` — the one **articulated** group: a virtual parent `3C`
  (`ARTICOLAZIONE: { parent: null, partner: null, partners: '3C-S,3C-C' }`)
  aggregating two real partner classes `3C-S` (8 studenti, coordIndex 3) and
  `3C-C` (12 studenti, coordIndex 4), each pointing back at the parent and at
  each other via `ARTICOLAZIONE.parent`/`.partner`.
- `ALL_CLASSI_E2E = [CLASSE_A, CLASSE_B, CLASSE_C_PARENT]` — the list every
  existing per-class check iterates over (entry-point classes only: partner
  rows are intentionally excluded because
  `EmailNotificationService.classiEntryPoint`/`ClasseRepository
  .filterPerGestioneArticolazione` filter them out under `GESTIONE_ARTICOLAZIONE
  = COMPLETA`).
- `3C-C`'s `MAT` column is deliberately pinned to the same docente that holds
  `MAT` on `3C-S` (`e2eDocenteEmail(1)`) — this is the **one genuinely shared
  ("COMUNE") cattedra** in the fixture; every other subject on the two
  partners is held by disjoint docenti, giving `tipoArticolazione` real
  `'COMUNE'` vs `'SEPARATO_PRIMO'`/`'SEPARATO_SECONDO'` variety to assert on.
  Read the inline comment above that assignment in `seedClassi` — it explains
  exactly why, and do not remove or "clean up" that pin.
- `seedSupplenzeEVariazioni` already seeds a rich set of chair-change/
  substitution cases scoped to `CLASSE_A` around `ASSIGNMENT_MATRIX_DATE_E2E =
  new Date('2026-07-15T09:00:00Z')`: a plain `SUPPLENZE` override, a
  `SUPPLENZE` overridden-in-turn by a `VARIAZIONI_CATTEDRA` row (priority
  chain), a 2-hop `VARIAZIONI_CATTEDRA` chain on `ITA` (docente2 → docente15 →
  docente16, must resolve to the *final* holder), a "restriction-by-omission"
  `SUPPLENZE` row (empty `CLASSI`, valued `MATERIE=STO`) that must resolve
  only against docente8's *actual* STO-holding slots (both `2B` and `3C-C`),
  and a `.SPECIFICA`-targeted `SUPPLENZE` row on `LAB.SEMINARIO_POMERIDIANO`.
  `EXPECTED_ASSIGNMENT_MATRIX` in `src/onlinetests/checks/
  repositoryChecks.ts` already encodes the expected resolution for all of
  these at `ASSIGNMENT_MATRIX_DATE_E2E`, and `registerEffectiveAssignment
  MatrixChecks`/`registerEffectiveAssignmentConsumerChecks`
  (`repositoryChecks.ts`/`contextEngineChecks.ts`) already assert them at the
  raw-assignment and CDU-consumer level. **Do not duplicate these** — your new
  suite's chair-change/substitute-teacher checks (§3.1 below) should exercise
  a *different* angle (e.g. how substitution interacts with `consiglioDiClasse`
  membership/`stato.isSupplente`/`stato.sostituisce` on the CDU, or with
  `GESTIONE_ARTICOLAZIONE` filtering), not re-assert the same matrix.

### 1.4 `GESTIONE_ARTICOLAZIONE` — current state (this is item 1 of the request)

`CONF_DOC.GESTIONE_ARTICOLAZIONE` / `CONF_MAIL.GESTIONE_ARTICOLAZIONE` are an
enum (`GestioneArticolazione` in `src/domain/value-objects/enums.ts`):
`COMPLETA` (default — excludes partner classes from the generation/notify
batch, keeps parent+plain classes) or `ARTICOLATA` (excludes the parent,
keeps partner+plain classes). Semantics are documented in
`SPECS_ALDO/01_SCHEMA_DATABASE.md` lines ~317 and ~368 — re-read them, they
are the source of truth if anything here seems ambiguous. Implementation:
`ClasseRepository.filterPerGestioneArticolazione` (`src/infrastructure/
repositories/ClasseRepository.ts`), consumed by `DocumentBatchService`
(`src/application/services/DocumentBatchService.ts`, `generateClassi`) and by
`EmailNotificationService.classiEntryPoint`/`targetsPerCoordinatore`/
`targetsPerDocente` (`src/application/services/EmailNotificationService.ts`).
Unit coverage for the `ARTICOLATA` branch already exists for
`ClasseRepository`, `ConfigurazioneEmail`, `ConfigurazioneDocumento`,
`DocumentBatchService.generateClassi`, and `EmailNotificationService` (see the
recent commits `ba1860a`/`1baa811`/`f9ddd4b`/`bc90342`/`2e93c0a`/`37af716` —
`git log --oneline` those hashes if you want the detail) — **that
service/repository logic is already implemented and tested**. What is
currently missing is purely fixture-level: **every** `CONF_DOC`/`CONF_MAIL`
row in `E2eSampleDatabaseBuilder` currently sets `GESTIONE_ARTICOLAZIONE` to
either `''` (empty → defaults to `COMPLETA`) or explicitly `'COMPLETA'`.
`grep -n "GESTIONE_ARTICOLAZIONE" src/onlinetests/E2eSampleDatabaseBuilder.ts`
to confirm this yourself before editing — the file changes fast, verify
current state rather than trusting this document's line numbers.

## 2. Part 1 — seed at least one `ARTICOLATA` document and one `ARTICOLATA` email pattern

**Goal:** exercise both `GestioneArticolazione` branches in the live E2E run,
not just `COMPLETA`.

- In `seedConfDoc`, change exactly one existing `CONF_DOC` row's
  `GESTIONE_ARTICOLAZIONE` to `'ARTICOLATA'` (or add a new row if none of the
  existing ones is a good semantic fit — see §3 below, which needs a *new*
  `CONF_DOC` row anyway and is the natural place to set `ARTICOLATA`).
  `CONF_DOC_ARTICOLATA` (`E2E_DOC_ARTICOLATA`, type
  `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`) is the obvious candidate since it
  is already articulation-aware in its template — but note it currently runs
  under the *entry-point* class list (`ALL_CLASSI_E2E`, i.e. parent + plain),
  so flipping it to `ARTICOLATA` changes which classes it's expected to
  generate for (partners + plain, not parent) — update whichever check(s) in
  `e2eScenarioChecks.ts` currently assert against `ALL_CLASSI_E2E` for this
  `CONF_DOC.ID` accordingly, or use the new CDC-summary `CONF_DOC` from §3 for
  this instead and leave `CONF_DOC_ARTICOLATA` alone. Decide based on which
  produces a cleaner, non-overlapping assertion — document the choice in a
  code comment the way every other non-obvious fixture decision in this file
  already is.
- In `seedConfMail`, change exactly one existing `CONF_MAIL` row's
  `GESTIONE_ARTICOLAZIONE` to `'ARTICOLATA'`. Every current row is
  `'COMPLETA'`, so any one works; pick the one whose `PROCESSO` makes the
  entry-point-filtering difference observable and assertable (`PER_COORDINATORE`
  or `PER_DOCENTE` — **not** `PER_CDC`, since `PER_CDC` always targets exactly
  one already-fixed class and never iterates entry-point classes at all, per
  the inline comment already on `CONF_MAIL_CONDOTTA`). `CONF_MAIL_LAVORO`
  (`PER_COORDINATORE`) is a reasonable candidate — check its current
  assertions in `e2eScenarioChecks.ts` and update them for the new entry-point
  set (partners `3C-S`/`3C-C`'s own coordinatori — docIndex 3/4 — instead of
  `3C` parent's).
- Add or extend a `runner.add(...)` check (in `e2eScenarioChecks.ts`, or in
  your new suite from §3 if it's a better semantic fit) that asserts the
  `ARTICOLATA` document/email pattern actually ran against the **partner**
  classes and explicitly did **not** run against the parent class — this is
  the one behavior this fixture change exists to prove, so it must be
  asserted, not just "generation didn't crash".
- Mirror every change in `test/unit/onlinetests/e2e-sample-database-builder
  .test.ts` (assert the new/changed `GESTIONE_ARTICOLAZIONE` cell values) and
  in whichever offline test currently covers `seedConfDoc`/`seedConfMail`
  shape.

## 3. Part 2 — CDC class-summary / signature document, new `CONF_DOC`

**Goal (item 2 of the original request):** a document meant to be physically
signed at the class-council (consiglio di classe) meeting: one row per
teacher, their subjects, and a blank signature cell — with articulated
classes showing, per teacher, whether they teach the *whole* group ("comune")
or only one partner half (with that half's subject list). This is a
**different artifact** from the existing `CONF_DOC_ARTICOLATA` narrative
report (which is prose/bullet-lists describing the whole class, not a
sign-in sheet) — do not conflate the two, add a new `CONF_DOC` row.

### 3.1 Why this is pure data/template work, not new application code

`DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA` (and in fact every `CONF_DOC` in this
fixture except `VERBALE`/`SHEET_PERMESSI`/`PIANO_PERS`, which have their own
named generator) uses `GENERATORE: 'DOCUMENTO_GENERICO'` — there is no
per-`TIPO` strategy class to write. The Mustache-like template syntax
(`WorkspaceTemplateEngine`) already gives you everything needed, already
proven working in `E2eTemplateProvisioner.ts`:

- `{{#bullet_list:source.path}}...{{/bullet_list}}` / `{{#number_list:...}}`
  for prose lists (see `DOC_ARTICOLATA_PARAGRAPHS`).
- `{{#tablerow_loop:source.path}}col1template{{/tablerow_loop}}` — **this is
  the one you need**: each subsequent array entry in the same `data` row is
  a sibling column template evaluated against the same loop, see
  `RIEPILOGO_TABLES`/`DOC_COMPLESSO_TABLES` for the exact shape (`data: [
  [headerCells...], [rowTemplateCells...] ]`, `options: { headerRow: true,
  alternatingRows: true }`).
- The relevant CDU shape is `DocenteCdcVM` (`src/application/context-engine/
  Cdu.ts`): `anagrafica.nome`/`anagrafica.cognome`, `materieDescrizione`
  (subjects already comma-joined — no `join` pipe needed),
  `tipoArticolazione: 'COMUNE' | 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO' |
  null`, `gruppoNome` (resolved partner-class display name for
  `SEPARATO_*`, `null` for `COMUNE`/non-articulated).
  `focus.classe.consiglioDiClasse` is the full list;
  `focus.classe.consiglioDiClasseComune`/`consiglioDiClasseSeparato` are the
  pre-split arrays `ConsiglioClasseProvider` (`src/application/context-engine/
  providers/ConsiglioClasseProvider.ts`) already builds for exactly this kind
  of distinction — **use them**, don't re-derive the COMUNE/SEPARATO split in
  the template or in a check.

### 3.2 Concrete template shape to add in `E2eTemplateProvisioner.ts`

Add a new `NAME_...` constant, a new paragraphs/tables pair, and wire it into
`provision()` exactly like the six existing artifacts are. Suggested table
shape (adjust naming to taste, but keep the "comune"/subjects-in-brackets
distinction the request asks for):

```ts
const CDC_RIEPILOGO_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Foglio Firme Consiglio di Classe — {{focus.classe.anagrafica.nome}}',
  'Data: {{meta.date.oggi.breve}}'
];

const CDC_RIEPILOGO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Docente', 'Materie insegnate', 'Firma'],
      [
        '{{#tablerow_loop:focus.classe.consiglioDiClasseComune}}{{anagrafica.nome}} {{anagrafica.cognome}} (comune)',
        '{{materieDescrizione}}',
        ''
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  },
  {
    data: [
      [
        '{{#tablerow_loop:focus.classe.consiglioDiClasseSeparato}}{{anagrafica.nome}} {{anagrafica.cognome}} ({{gruppoNome}})',
        '{{materieDescrizione}}',
        ''
      ]
    ]
  }
];
```

For a **non-articulated** class, `consiglioDiClasseComune`/
`consiglioDiClasseSeparato` are `undefined` (per `ConsiglioClasseProvider`,
only set when `this.classi.isArticolata(classe)` is true) — decide and
document (in the template's own paragraph text or in a code comment) what the
plain-class rendering should be: either point plain classes at
`focus.classe.consiglioDiClasse` directly with a single un-split table (no
"(comune)" annotation needed when there's no split to disambiguate), or give
this `CONF_DOC` a `CONDIZIONE` that only activates it for articulated/entry-
point classes. **Verify which behavior `WorkspaceTemplateEngine`'s
`tablerow_loop` actually has against an `undefined` source before shipping**
(empty table vs. render error) — check `GasLibraryFactory/DOCS_LIBS/
WorkspaceTemplateEngine_docs.md` first; if the docs don't say, this is exactly
the kind of partial-match gap the CLAUDE.md GLF-first rule tells you to
surface to the user rather than guess past.

### 3.3 New `CONF_DOC` row in `seedConfDoc`

New `TIPO` (suggest `RIEPILOGO_FIRME_CDC` or similar — pick something that
doesn't collide with the existing `TIPO` vocabulary you can see in
`seedConfDoc`), `GENERATORE: 'DOCUMENTO_GENERICO'`, `FORMATO: 'GDOC'`,
`GESTIONE_ARTICOLAZIONE: 'ARTICOLATA'` (this row is the natural home for the
Part 1 `ARTICOLATA` `CONF_DOC` requirement — see §2 — since it's the one
document in this fixture whose whole reason to exist is to look different
per-partner). Follow the exact field-by-field shape of every neighboring
`sample.appendRow(TABLE.CONF_DOC, {...})` call (all `COL_CONF_DOC.*` keys
must be present — `HEADERS[TABLE.CONF_DOC]` requires every column). Give it a
`REGISTRA_DOC`/`REGISTRA_FOLD` shape consistent with the other per-class
docs (`classRegistration` local var pattern already used by
`CONF_DOC_CONDOTTA`/`CONF_DOC_RIEPILOGO`/`CONF_DOC_COMPLESSO`).

### 3.4 Checks

Add `runner.add(...)` checks (in `e2eScenarioChecks.ts` or your new §4
suite — whichever is the better fit given how you resolved §3.2's plain-class
question) that generate this document for `3C-S` and `3C-C` and assert,
purely from the persisted `LOG_DOCS` row plus — if the template engine's
render output is inspectable from the check without opening the Doc UI (e.g.
via the Docs API body text, already how existing checks that need real
content, if any, would do it; if no existing check reads rendered Doc body
text, do not invent a new read path for this alone — keep the assertion at
the `LOG_DOCS`/`LOG_FOLD` metadata level like the majority of existing
checks do) — that generation succeeded for the expected classes and was
correctly excluded for the parent `3C` under `GESTIONE_ARTICOLAZIONE=
ARTICOLATA`.

## 4. Part 3 — new verification suite, launched after `runE2eScenarios`

### 4.1 Entry-point design (resolve this explicitly, don't improvise differently)

The request says the new test function should run "on the same data...(to be
launched after `runE2eScenarios`)". Read literally alongside §1.1's existing
"two independent entry points, one master pointer each" pattern, the correct
design is:

- A **third** exported GAS entry point, e.g. `executeArticolazioneScenarios`/
  `runArticolazioneScenarios` in `src/onlinetests/index.ts`, registered onto
  `globalThis` exactly like `runOnlineTests`/`runE2eScenarios`.
- It does **not** call `E2eSampleDatabaseBuilder.build()` again (that would
  mint a *third* spreadsheet and silently diverge from whatever
  `runE2eScenarios` just produced — defeating "on the same data"). Instead it
  reads the **current** `PROP_MASTER_SPREADSHEET_ID` (via the same
  `IPropertiesFacade` seam) — which `executeE2eScenarios` already left
  pointed at its sample — boots a fresh `initAldo()` container over it (same
  as every other entry point), and runs only the new checks. If
  `PROP_MASTER_SPREADSHEET_ID` isn't set or doesn't point at a
  `TEST_MODE=true` master, fail loudly with one explicit `ValidationError`
  check (mirroring the existing "MASTER.TEST_MODE guard" pattern at the top
  of `registerE2eScenarioChecks`) instead of silently doing nothing or, worse,
  building a new database.
- Any **new fixture rows** this suite's scenarios need (additional
  chair-change edge cases, additional multi-level/articulated cases) belong
  in `E2eSampleDatabaseBuilder` itself, not hand-rolled inside the new check
  file — that keeps "the same data" true in the strong sense: one shared
  builder, one `runE2eScenarios` invocation populates a database that already
  satisfies both suites, and the new suite is purely a second, independent
  read-and-assert pass over it. This also means: if you add new fixture data
  for this suite, do it as part of Part 1/2's edits to
  `E2eSampleDatabaseBuilder`, then this suite only ever reads.
- Put the new checks in a new file, `src/onlinetests/checks/
  articolazioneChecks.ts` (mirroring `e2eScenarioChecks.ts`'s/
  `repositoryChecks.ts`'s shape: `export function
  registerArticolazioneScenarioChecks(runner, container, sample)`), wired
  into the new entry point the same way `registerE2eScenarioChecks` is wired
  into `executeE2eScenarios`.

### 4.2 What to test (item 3 of the original request)

All four bullets, restated precisely against what already exists so you
extend rather than duplicate:

1. **Chair-change / substitute-teacher logic** — not the raw assignment
   matrix (`EXPECTED_ASSIGNMENT_MATRIX` already covers that, §1.3). Test the
   *consumer* side: for a class/date/subject under an active `SUPPLENZE`
   override (e.g. `1A`/`MAT` at a date inside `2026-07-01`..`2026-07-10`),
   assert `focus.classe.consiglioDiClasse` contains the supplente (docente9)
   with `stato.isSupplente === true` and `stato.sostituisce` pointing at the
   titolare (docente1), and does **not** list the titolare as an active
   member for that slot. Do the same for the `VARIAZIONI_CATTEDRA`-overridden
   case (docente10 from `2026-07-05`) and for the 2-hop chain
   (docente2→15→16 on `ITA`) — assert the CDU-level council reflects the
   *final* resolved holder only, at a date past both hops. Also assert the
   date-boundary behavior: querying just *before* a `VARIAZIONI_CATTEDRA
   .DAL` date must still show the *previous* holder (proves the resolver is
   date-scoped, not just "last row wins").
2. **CDU construction correctness** — assert structural invariants of the
   built `Cdu` object beyond what `contextEngineChecks.ts` already checks:
   e.g. that `focus.classe.consiglioDiClasse` has no duplicate `anagrafica
   .email` entries, that every entry's `materieDescrizione` is a non-empty
   comma-joined list consistent with `materie` array length, that
   `tech`-namespaced live entities are genuinely non-enumerable on the
   serialized CDU (`Object.keys(cdu.tech ?? {})` vs `JSON.stringify(cdu)` not
   containing `"tech"` — per `Cdu.ts`'s doc comment "attached non-enumerable,
   never serialized"), and that `focus.classe.anagrafica.indirizzo` resolves
   to the seeded `INDIRIZZO_E2E` row correctly for all three entry-point
   classes.
3. **Multi-level (articulated) class structure** — using the `3C`/`3C-S`/
   `3C-C` group: assert `IClasseRepository.isArticolata` is true for all
   three and that `ARTICOLAZIONE` round-trips correctly (`3C.partners ===
   ['3C-S','3C-C']`, `3C-S.parent === '3C'`, `3C-S.partner === '3C-C'` and
   vice versa); assert `consiglioDiClasseComune` contains exactly the one
   deliberately-shared docente1/`MAT` entry with `tipoArticolazione ===
   'COMUNE'` and `gruppoNome === null`; assert
   `consiglioDiClasseSeparato` partitions the remaining docenti correctly
   between `SEPARATO_PRIMO`/`SEPARATO_SECONDO` with the right `gruppoNome`
   per partner; assert `GESTIONE_ARTICOLAZIONE=COMPLETA` vs `=ARTICOLATA`
   batch entry points resolve to the documented disjoint class sets
   (parent-only vs partners-only) for both a `CONF_DOC` and a `CONF_MAIL` row
   (tie this into your Part 1/§2 additions rather than re-seeding new rows
   here).
4. **Other automatically-verifiable behaviors** — candidates already visible
   in this fixture that are worth covering if not already exercised
   elsewhere: `RIPETENTE` handling for `RIPETENTE_1A`/`RIPETENTE_3C` (repeater
   students correctly present in both current-year and same-name prior-year
   `CLASSI`/`ALUNNI`, per `seedClassiAnnoPrecedente`/`seedAlunniAnnoPrecedente`);
   `PIANO_DOPPIO_STUDENTE`'s dual-plan identity (`PEI` + `PDP_BES`,
   `SOTTOTIPO` isolating them per `seedPianiPersStorico`'s comment); the
   `.SPECIFICA`-scoped `SUPPLENZE` row on `LAB.SEMINARIO_POMERIDIANO`
   resolving only against the specifica-holding slot, not the whole `LAB`
   subject. Pick a small, high-value subset — do not try to re-test
   everything the fixture happens to contain; each check should earn its
   place by testing something no existing check already covers.

Every check must follow the same `runner.add(name, artifactUrl?, () => {
throw new ValidationError(...) on mismatch })` idiom, must read its expected
values from named constants/comments the way `EXPECTED_ASSIGNMENT_MATRIX`
does (no magic numbers), and must never require opening a generated file by
hand.

## 5. Deliverables checklist

- `src/onlinetests/E2eSampleDatabaseBuilder.ts` — Part 1 `GESTIONE_
  ARTICOLAZIONE` flips, Part 2 new `CONF_DOC` row (and any new fixture rows
  Part 3's scenarios need).
- `src/onlinetests/E2eTemplateProvisioner.ts` — new CDC signature-sheet
  template (paragraphs + table).
- `src/onlinetests/checks/e2eScenarioChecks.ts` — updated assertions for any
  existing check whose expected class-list changed because of a
  `GESTIONE_ARTICOLAZIONE` flip; new checks for the Part 2 document if you
  decide it belongs here rather than in the new suite.
- `src/onlinetests/checks/articolazioneChecks.ts` — new file, Part 3's suite.
- `src/onlinetests/index.ts` — new `executeArticolazioneScenarios`/
  `runArticolazioneScenarios` entry point.
- Offline mirrors for every fixture/behavioral change: `test/unit/onlinetests/
  e2e-sample-database-builder.test.ts`, and a new
  `test/unit/onlinetests/articolazione-checks.test.ts` (or wherever the
  existing `e2eScenarioChecks` offline tests live — locate via
  `codebase-memory-mcp`/`grep -rl registerE2eScenarioChecks test/`) covering
  the new registration function with faked `container`/`db`.

## 6. Verification before calling this done

Run, in order, and fix forward on any failure — do not skip a step because an
earlier one passed:

```bash
npm run typecheck
npm run lint
npm test                    # unit — must stay 100% green
npm run test:integration
npm run build:online        # runs the full offline suite again as a push gate
```

Do **not** run `npm run push:online`/actually push to the live GAS project
unless the user explicitly asks — building in `--mode=online` is sufficient
to prove the bundle compiles and the compat patches apply; pushing and
running `runE2eScenarios`/your new function against real Drive/Sheets quota
is a separate, explicit step the user should trigger themselves once the
code is reviewed.

## 7. Explicitly out of scope / do not do

- Do not restructure the existing `1A`/`2B`/`3C` class layout or touch the
  deliberate docente1/`MAT` shared-cattedra pin — extend around it.
- Do not duplicate `EXPECTED_ASSIGNMENT_MATRIX`-level assertions.
- Do not write a new `GENERATORE` strategy class for the CDC signature sheet
  — it is achievable with `DOCUMENTO_GENERICO` + template tables, per §3.1;
  if you find during implementation that it genuinely isn't, stop and ask
  before adding application-layer code, per the CLAUDE.md GLF-first rule.
- Do not have the new suite rebuild the sample database — it must read the
  state `runE2eScenarios` already produced, per §4.1.
