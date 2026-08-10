# ALDO Online-Test and Online-Mock-Data Gap Report

## Purpose and conclusion

This report assesses the live-GAS test suites and their provisioned mock data
against ALDO's main domain features.  It is written as an implementation brief
for an agent that will add tests and fixture data.

**Conclusion:** current coverage is valuable but incomplete.  It exercises
real Sheets, Drive documents, Google Sheets templates, document logs, email
test mode, and one `FILE_SINGOLO` import.  It does **not** cover imported-table
documents, per-class-folder ASL recovery, all implemented import source
strategies, or complete historical recovery.  It also has an execution gap:
the detailed articulated-class suite is exposed as a separate GAS function and
is not called by the normal E2E runner.

Do not treat a green `runE2eScenarios()` result as evidence that all online
tests pass.  `runArticolazioneScenarios()` must also be run, and it currently
depends on a previously provisioned MASTER spreadsheet rather than the fixture
created by the E2E runner.

## Scope inspected

Primary online code:

- `src/onlinetests/index.ts`
- `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- `src/onlinetests/E2eTemplateProvisioner.ts`
- `src/onlinetests/checks/e2eScenarioChecks.ts`
- `src/onlinetests/checks/articolazioneChecks.ts`
- `src/onlinetests/checks/contextEngineChecks.ts`
- `src/onlinetests/checks/repositoryChecks.ts`

Relevant implementation seams:

- `src/application/services/ImportService.ts`
- `src/application/import/ImportRecipeMapper.ts`
- `src/application/import/CustomSourceStrategies.ts`
- `src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts`
- `src/application/storico/*`
- `src/application/context-engine/providers/StoricoProvider.ts`
- `src/application/context-engine/providers/StoricoClasseProvider.ts`

The authoritative data/CDU specifications used are `SPECS_ALDO/01_SCHEMA_DATABASE.md`
and `SPECS_ALDO/02_CDU_STRUTTURA.md`.

## Current suite topology

| Runner | What it provisions/runs | Important limitation |
|---|---|---|
| `runOnlineTests()` | Small sample DB; repository, basic CDU, and pipeline checks | Not the larger end-to-end fixture. |
| `runE2eScenarios()` | Real Drive templates, current DB, one prior-year DB, assignment-matrix checks, consumer checks, E2E scenarios | Does **not** register `registerArticolazioneChecks`. |
| `runArticolazioneScenarios()` | `registerArticolazioneChecks` against MASTER ID already in ScriptProperties | Does not provision its own fixture; can run against stale or incompatible data. |

`executeE2eScenarios()` calls `registerEffectiveAssignmentMatrixChecks`,
`registerEffectiveAssignmentConsumerChecks`, and `registerE2eScenarioChecks`.
It does not call `registerArticolazioneChecks`.  Conversely,
`executeArticolazioneScenarios()` only reads the already configured MASTER and
sets empty values for prior-year fixture IDs.  This split must be removed or
made explicit in a single aggregate runner before relying on online coverage.

## Coverage assessment against requested features

| Requested feature | Current state | Assessment |
|---|---|---|
| Substitute teachers and chair changes | E2E data contains `SUPPLENZE` and `VARIAZIONI_CATTEDRA`; assignment matrix checks exercise recipient/ACL/CDU consumers. Articulation checks test date boundary and a composite subject replacement. | **Partial / fragmented.** Critical date-boundary check is not part of normal E2E run; missing conflict/error cases and real Drive ACL result verification. |
| Complex classes and complete CDU branches | Rich parent/partner 3C fixture; tests cover shared/separate subjects, CdC split, target filtering, documents, sheet column ACL composition. | **Substantial but not reliably run.** `runArticolazioneScenarios()` is separate. Several CDU branches remain unmaterialized, especially historical lazy refs and class/student data interactions. |
| Documents with imported tables | No `CONF_DOC` row uses `DOCUMENTO_CON_TABELLE_IMPORTATE`; no template contains table markers; no assertion inspects inserted tables. | **Missing.** |
| Previous-year, folder-per-class ASL import | Scenario 9 imports a single current sheet via `FILE_SINGOLO`. | **Missing.** No folder discovery, no `_CLASSE` enrichment, no historical folder data, no known-folder-ID flow. |
| ITP and `MAIN.SPECIFICITY` subjects | Data seeds two ITP teachers and four dotted subject IDs. Tests cover selected dotted rows (`LAB.*`, `INTERPRET.CHITARRA`) and some composite batch identity. | **Partial.** ITP behavior is not asserted end-to-end; not all dotted-subject contracts and consumers are checked. |
| All imports | Only active `FILE_SINGOLO` + `OVERWRITE` ASL import is provisioned and run. | **Missing.** `CERCA_CARTELLE_CLASSE`, `CERCA_DOCUMENTI`, mapping, conflict modes, disabled jobs, ghost rows, timestamps, and chunked import lack live tests. |
| Historical recovery | Prior fixture has only `CLASSI`, `ALUNNI`, `LOG_DOCS`; current scenario proves only PEI/PDP_BES document-history subtype isolation in an email. | **Severely incomplete.** Student and class historical CDU providers need tables absent from fixture. |
| Other GAS-specific logic | Documents, real template replacement, Sheets protected ranges, Drive/Gmail test-mode path, logs, and static attachments have useful coverage. | **Still incomplete.** Real file/folder ACLs, Drive discovery sources, resumable jobs, duplicate/idempotency behavior, and multi-spreadsheet historical access need live checks. |

## Existing useful coverage to preserve

Do not replace these checks; extend them.

### Substitutions and chair changes

`seedSupplenzeEVariazioni` supplies a nominal `CLASSI` holder plus
`VARIAZIONI_CATTEDRA` and `SUPPLENZE`, modelling the required priority chain:
`SUPPLENZE` > `VARIAZIONI_CATTEDRA` > `CLASSI`.

The suite already checks:

- effective assignment matrix and routing for role recipients;
- CDU, email-recipient, document-ACL, and sheet-column-ACL consumers of
  effective assignments;
- `ENTRAMBI` behaviour for active substitute and principal teacher;
- `IRC`/`ALT` combined recipients;
- dotted subject `LAB.SEMINARIO_POMERIDIANO` during and after the substitute
  date interval;
- a final variation holder for `ITA`.

The last two belong to `registerArticolazioneChecks`, therefore they are not
covered by `runE2eScenarios()` today.

### Complex class fixture and CDU

The E2E fixture includes parent `3C`, partner classes `3C-S` and `3C-C`, a
shared `MAT` subject, and separately taught subjects.  Existing checks verify:

- parent/partner round trip;
- shared versus separate subject lists;
- parent, first-group and second-group CdC projection;
- partner-scoped CdC visibility;
- `COMPLETA` versus `ARTICOLATA` target selection for documents and email;
- rendered articulated documents and `LOG_DOCS` registration;
- document batch identity for `INTERPRET.CHITARRA`;
- Sheet column protection request composition;
- selected richer CDU fields: coordinator, ASL project, religion status, and
  personal-plan label.

### Existing live document/email work

Current E2E scenarios use real generated Google Docs/Sheets and check:

- verbale, condotta sheet, generic class summary, complex document, articulated
  document, CDC signature summary, personalised plans, and a teacher-subject
  batch;
- unresolved Mustache placeholders in selected documents;
- `LOG_DOCS` and `LOG_FOLD` metadata;
- Sheets protected-range creation;
- test-mode mail, document/folder links in `LOG_MAIL`, static attachments,
  and selected duplicate/history behaviour for personalised plans.

## Required additions

Implement following work in priority order.  Each item must add both fixture
data and live assertions; avoid adding only a unit test for GAS integrations.

### P0 — Make suite execution complete and deterministic

**Problem:** online feature coverage is split across runners.  Articulation
checks can silently be skipped, and their runner can consume a stale MASTER.

**Required change:** create one aggregate runner, for example
`runFullOnlineScenarios()`, or make `executeE2eScenarios()` register
`registerArticolazioneChecks` with its newly built `sample`.  Keep individual
runners for diagnosis if useful, but the CI/manual release command must invoke
the aggregate runner.

**Acceptance criteria:**

1. One fresh E2E provisioning run executes all of:
   assignment matrix, assignment consumers, articulation, document/email E2E,
   import E2E, and historical E2E checks.
2. No test reads `MASTER_SPREADSHEET_ID` from a prior unrelated run.
3. Test report includes suite/group name and fixture URLs/IDs on failure.
4. Each run uses `MASTER.TEST_MODE=true`; email assertions never target real
   recipients.

### P0 — Imported-table document generation

**Problem:** `DocumentoConTabelleImportateGeneratorStrategy.render()` is
uncovered online.  It discovers table markers in a Google Doc, reads source
Google Sheets, inserts each table with a header row, removes the marker, and
then applies normal CDU templating.  There is no corresponding E2E config,
template, or test.

**Fixture data to add:**

- In `E2eTemplateProvisioner`, create two source Google Sheets:
  - one with header plus at least two non-empty rows containing literal text;
  - one header-only/empty source sheet.
- Create a Google Doc template with two distinct table markers, surrounding
  CDU placeholders, and text after each marker.  Markers must be discoverable
  by `findTablePlaceholders`; use exact syntax required by the existing table
  facade/library, not an invented marker format.
- Add `E2eTemplateIds` fields for template and both source sheets.
- Add one `CONF_DOC` row using generator
  `DOCUMENTO_CON_TABELLE_IMPORTATE`, `GDOC`, a class target, a deterministic
  `PATH_OUT`, and `REGISTRA_DOC` metadata.

**Live assertions:**

1. Generated file exists and `LOG_DOCS` has ID, link, class, and type.
2. `drive.getFileText(fileId)` contains source-sheet header and both data rows.
3. Output contains surrounding CDU expansion, proving the normal render phase
   still occurred after table insertion.
4. No marker syntax and no unresolved Mustache placeholder remains.
5. Empty-source marker is removed and does not create a bogus table.
6. Re-run follows configured `DUPLICAZIONE` policy without duplicate logs.

### P0 — Previous-school-year ASL/PCTO import from known folder ID, split by class

**Problem:** current scenario 9 is a current one-sheet import:
`searchStrategy: FILE_SINGOLO`, `TARGET: ASL`, key `STUDENTE`, and `OVERWRITE`.
It does not test the requested folder-per-class historical workflow.

**Interpretation used for implementation:** a known Drive folder ID is an
input to a `CONF_IMP`/test fixture; each class has one or more spreadsheet
files below the relevant registered class folder.  The test must use ALDO's
existing `CERCA_CARTELLE_CLASSE` strategy, because this is the implemented
strategy that resolves class folders from `LOG_FOLD`, discovers non-trashed
Google Sheets, reads them, and injects `_CLASSE`.

If product semantics instead require a *single known parent folder ID* with
subfolders named by class, stop before implementing and decide whether that
requires a general-purpose `GasLibraryFactory` extension.  Do not duplicate
Drive traversal in ALDO.

**Fixture data to add:**

- Current classes: at least two third/fifth-year classes, including the two
  `3C` partners, plus one non-eligible class with a decoy ASL file.
- A registered `LOG_FOLD` row of a unique folder type for every eligible class.
- Real child Sheets in those folders.  Include distinct students/hours for
  each class, one unknown student, one duplicate key, a header-only sheet,
  and a trashed/non-spreadsheet decoy if the facade can provision them safely.
- `CONF_IMP` record using `CERCA_CARTELLE_CLASSE`, `folderTipo`, optional
  `tabName`/`range`, `hasHeaders`, explicit mapping, target `ASL`, and a
  composite key suitable for the schema (`STUDENTE` plus year/class if
  required by intended semantics).
- Seed source year explicitly.  Include one record present already in target
  to test the selected conflict policy.

**Live assertions:**

1. Only files in registered folders for active intended classes are read.
2. Imported records retain correct student, year, hours, and class identity;
   no data from the decoy class/file is imported.
3. `CERCA_CARTELLE_CLASSE`'s injected `_CLASSE` is mapped/retained if target
   schema requires it.
4. Counts distinguish inserted, updated, skipped, and ghost rows.
5. A second run is idempotent under the selected conflict policy.
6. A failure names source class/file enough to diagnose bad historical data
   without exposing personal data beyond test identities.

### P0 — Complete historical-data recovery

**Problem:** prior DB currently creates only `CLASSI`, `ALUNNI`, and
`LOG_DOCS`.  That is enough for the existing personalised-plan email history
test, but it is insufficient for the real historical CDU services:

- `StoricoAlunniService` reads `CARENZE`, `PIANI`, `MOV_ALUNNI`, and
  `MATERIE` in addition to classes/students.
- `StoricoClasseProvider` reads historical `PROGETTI` and `DOCENTI` in
  addition to classes/students.
- `StoricoClassiService` needs historical teacher assignment columns and
  teacher information to resolve previous CdC/ITP entries.

The historical fixture comment currently says those tables are dead weight.
That statement is true only for the narrow document-history scenario, not for
the application functionality.

**Fixture data to add:**

- At least two prior-year databases in MASTER, such as `2025-2026` and
  `2024-2025`, to exercise depth/order and missing paths.
- All historical sheets used by live providers: `CLASSI`, `ALUNNI`, `DOCENTI`,
  `MATERIE`, `CARENZE`, `PIANI`, `MOV_ALUNNI`, `PROGETTI`, and `LOG_DOCS`.
- Current `CLASSI.STORICO` chains for:
  - normal promotion;
  - repeater whose historical class name is unchanged;
  - a missing second-year historical class;
  - an articulated partner whose prior name differs.
- Students covering `PROMOSSO`, `NON_PROMOSSO`, `RITIRATO`, and `SCONOSCIUTO`.
- Prior carenze with a subject renamed through `MATERIE.EVOLUZIONE` (for
  example historical `GST` resolving to current `STO`).
- Prior plans of several types, including a dual-plan student and a student
  with no plan.
- Prior ASL and non-ASL projects with a present and a deleted/missing
  referee; test fallback person display for missing referee.
- Previous teachers including an ITP teacher and a changed ITP assignment.
- Historical document rows sharing `ID_GEN` but differing in `TIPO` and
  `SOTTOTIPO`, including malformed/missing optional link only where expected
  behavior is defined.

**Live assertions:**

1. Build an `ALUNNO_COMPLETO` CDU with `includiStorico=true` and depth two;
   call `.get()` on `focus.alunno.storico` and verify all years, class names,
   outcomes, plans, failures/repetitions, and reconciled carenze.
2. Build a `CLASSE_COMPLETA` CDU with `includiStorico=true`; materialize
   `focus.classe.storico` and verify statistics plus ASL/non-ASL projects and
   referee mapping.
3. Verify no historical key is present when `includiStorico=false`; when true,
   verify LazyRef is materialized before rendering rather than JSON-stringified
   as an implementation object.
4. Verify document history selects correct `ID_GEN`, family, and subtype and
   never cross-links PEI/PDP variants.
5. Verify historical class CdC/ITP data and subject-evolution continuity.
6. Verify depth `0`, missing class-chain names, and absent prior student return
   stable empty/unknown output rather than failure.
7. Add one document/email template that consumes these actual historical
   branches; assert rendered content and no unresolved placeholders.

### P1 — All `CONF_IMP` strategies and policies

`ImportRecipeMapper.buildSource()` supports exactly three source strategies:

| Strategy | Live data source that must be tested |
|---|---|
| `FILE_SINGOLO` | A known Google Sheet ID. Existing ASL test covers only this happy path. |
| `CERCA_CARTELLE_CLASSE` | Active classes, `LOG_FOLD` by folder type, Drive search for non-trashed Sheets, and `_CLASSE` injection. |
| `CERCA_DOCUMENTI` | `LOG_DOCS` filtered by `idGen`, optional `tipo`/`stato`; each matching Google Sheet is read and supplies `_CLASSE`. |

Add a separate named E2E scenario for each strategy.  In addition to source
selection, run these behaviours through real `ImportService`:

- explicit external-to-target column mapping;
- a one-column and a composite conflict key;
- `IGNORE`, `OVERWRITE`, and `TIMESTAMP` conflict resolution;
- timestamp fallback to overwrite when target timestamp column is absent, if
  this remains intended contract;
- `ATTIVO=false` returns the documented skipped result and does not access the
  source;
- ghost-row suppression, including a row that contains only metadata/blank
  key fields;
- source `range`, named tab, `hasHeaders=true`, and `hasHeaders=false` where
  supported;
- source misconfiguration: missing `fileId`, `folderTipo`, or `idGen`, and an
  unsupported strategy.  Assert a configuration error before target mutation;
- chunked import: start once, resume until completion, and assert no duplicate
  target rows or stale resumable-job state.

For `CERCA_DOCUMENTI`, first generate two real Google Sheets with the same
document generator ID but distinct classes.  Generate a third sheet with a
different status/type and one non-sheet log item.  The E2E result must import
only intended rows, preserve their `_CLASSE`, and prove filtering works.

### P1 — ITP and dotted-subject end-to-end contract

Current data sets `DOCENTI.ITP=true` for two teachers and supplies:

- `LAB.GRUPPO_A`
- `LAB.SEMINARIO_POMERIDIANO`
- `INTERPRET.CHITARRA`
- `INTERPRET.FLAUTO`

This is good seed breadth.  However, only selected subject composition is
asserted.  Add checks that verify every contract below through live database
and CDU/consumer paths:

1. `getITPPerMateria` returns only the ITP attached to the exact class and
   exact dotted subject, not an arbitrary teacher of the primary subject.
2. A primary subject and each dotted row have distinct assignment identity,
   document batch `SOTTOTIPO`, roles, and Sheet column ownership.
3. Both forms of subject name are tested: synthesized name when `NOME` is
   blank (`LAB.*`, `INTERPRET.CHITARRA`) and explicitly configured name
   (`INTERPRET.FLAUTO`).
4. CDU subject objects contain correct `sigla`, `principale`, `specificita`,
   display name, ITP flag, and teacher tuple for class, student, and
   articulated-parent contexts.
5. Substitute and chair-change rows target a dotted subject and do not leak
   to its base subject or a sibling specificity.
6. Historical continuity reports separate main teacher and ITP continuity,
   including changed ITP and no-ITP cases.  Fields specified as absent when
   no ITP exists must be absent, not `false`/`null` placeholders.
7. A real document template loops dotted subjects and ITP data; assert all
   names once, correct ownership, and no unresolved placeholders.

### P1 — Substitute/chair boundary and real external side effects

Keep existing matrix tests, then add live assertions for cases not currently
demonstrated:

- start and end dates are inclusive/exclusive exactly as domain rules require;
- overlapping substitutions on unrelated classes/subjects do not affect focus;
- a `VARIAZIONI_CATTEDRA` record before, during, and after a substitution;
- `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, and `ENTRAMBI` across CDU, recipient
  resolution, document ACL, folder ACL, and Sheet column protection;
- principal/substitute de-duplication when same email is encountered through
  two paths;
- not-found/malformed subject/class restrictions fail predictably.

The current assignment-consumer checks fake `IDriveFacade` and
`SpreadsheetService` to inspect requested permissions.  Keep those focused
tests, but add one real GAS test that reads back the resulting file/folder ACL
and the actual Google Sheet protected ranges/editors.  Test identities must
be dedicated safe accounts and the fixture must clean/reuse known folders.

## Other essential online-only tests

Prioritize these because mocks cannot prove GAS service behavior accurately.

1. **Drive document and folder duplicate semantics.** Generate with
   `DUPLICAZIONE=NEGATA` and `PERMESSA`, verify actual Drive file count,
   `LOG_DOCS` identity, normalized file names, and idempotent retry.
2. **Email test-mode safety and logs.** Verify every outbound test-mode send
   resolves to the configured safe recipient, never the intended production
   address; check logical target identity and duplicate suppression across a
   fresh container boot.
3. **Document/Sheet template interoperability.** Exercise real Google Docs
   paragraphs, lists, table rows, conditional blocks, Unicode/Italian text,
   hyperlinks, and real Google Sheets template column layout/protection.
4. **Job continuation.** Run a chunked document batch and a chunked import
   through real ScriptProperties/trigger-compatible persistence, then resume
   in a new container.  Verify completion, progress, cleanup, and no duplicate
   logs.  Do not create a real timed trigger unless test cleanup is reliable;
   call the documented resume entry point if that is the supported safe seam.
5. **Cross-spreadsheet cache isolation.** Build current and historical DBs,
   resolve them in one run, then ensure a second fixture/run cannot reuse
   cached rows from first spreadsheet.
6. **Active-user/permission visibility.** Where Workspace account policy
   permits, verify test-mode files and protected Sheets are accessible only to
   intended test user(s), coordinators, and effective teachers.

## Fixture architecture requirements

- Keep all generated assets under a named, reusable test root such as
  `_ALDO_E2E_ROOT`; do not create unbounded timestamped folders.
- Give each test source/template a stable descriptive name and return its ID
  from `E2eTemplateIds` rather than searching by title in tests.
- Give each scenario its own `CONF_DOC`/`CONF_IMP`/`CONF_MAIL` IDs and unique
  output path.  Never reuse broad records in a way that makes assertions order
  dependent.
- Seed only synthetic `@onlinetest.aldo.local` identities and enforce
  `MASTER.TEST_MODE=true` before any email operation.
- Assert both positive rows and negative boundaries.  A count alone is not
  enough; verify keys, class ownership, subtype, text/table content, and logs.
- Use deterministic dates, years, class names, and source values.  Avoid
  current-clock-dependent expected values.
- Create a shared helper to materialize a historical LazyRef before assertions
  or template rendering.  Direct JSON serialization is not a valid substitute.
- Keep source data deliberately asymmetric: if all classes/students have same
  values, class leakage and wrong specificity selection are invisible.

## Suggested implementation order

1. Unify E2E/articulation runner and prove it executes in a fresh project.
2. Add complete historical spreadsheet fixture, then materialized student and
   class historical CDU scenarios.
3. Add imported-table document fixture and scenario.
4. Add `CERCA_CARTELLE_CLASSE` historical ASL scenario from registered class
   folders.
5. Add `CERCA_DOCUMENTI` and remaining import policies/chunked behavior.
6. Expand ITP/dotted-subject and substitute boundary checks; add read-back ACL
   verification.
7. Add job/cache/safety regression scenarios.

## Definition of done

Online coverage is sufficient for this report when:

- one documented runner provisions fresh data and executes every group;
- all three import strategies and their supported conflict/validation paths
  have real-GAS tests;
- imported-table documents are generated and inspected;
- folder-per-class previous-year ASL import is tested with known folder IDs;
- dotted subject and ITP data is asserted across repository, CDU, document,
  permissions, role, substitution, and historical continuity paths;
- historical student, class, document, project, carenza, plan, mobility, and
  teacher recovery is materialized from two prior spreadsheets;
- live tests verify the external state that only GAS can prove: Drive files,
  Google Docs tables, Google Sheets protected ranges, Drive permissions,
  Gmail test-mode logs, ScriptProperties continuation, and cross-spreadsheet
  isolation;
- every test uses deterministic synthetic data and leaves no unsafe mail,
  permanent trigger, or unbounded Drive artifact behind.
