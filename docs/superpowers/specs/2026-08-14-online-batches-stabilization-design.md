# Online Batches Stabilization Design

Date: 2026-08-14
Status: approved in conversation; implementation plan pending.

## Goal

Eliminate every unexpected failure observed in `runOnlineTestsBatch1` through
`runOnlineTestsBatch4` while preserving Scenario 11 as the single intentional
skip when Google rejects the synthetic `@onlinetest.aldo.local` principals.

The acceptance result is exactly:

- 103 total scenarios;
- 102 passed;
- 0 failed;
- 1 skipped (`E2E scenario 11` only);
- scenarios 10b and 10c explicitly reported as passed.

Warnings caused solely by Google rejecting known synthetic protected-range
principals are permitted inside the two protected-range scenarios. Every other
unexpected warning or error family remains a failure requiring investigation.

## Scope and baseline

This is one stabilization initiative and will produce one implementation plan.
Its tasks remain independently testable and reviewable, but they share the same
final online acceptance run.

The working tree already contains uncommitted online-test stabilization work,
including fixture top-up/reset logic and related tests. Those changes are user
work and form part of the implementation baseline. Execution must inspect,
test, and preserve them; it must not overwrite, reset, or silently duplicate
them.

The design covers these observed failure families:

1. verbale registration metadata assertion;
2. imported-table document heading;
3. document and import JobRunner resume;
4. three TEST_MODE email assertions;
5. stray `ASL.DATA_MODIFICA` fixture column;
6. invalid `cercaDocumenti` static attachment ID;
7. six `INTERPRET.FLAUTO` history/CDU failures;
8. dotted document `SOTTOTIPO` identity assertion;
9. real-Sheets protected-range assertion.

## Governing constraints

- Follow red-green-refactor for every behavior change.
- Use codebase-memory-mcp before raw source search for code discovery and call
  tracing.
- Check `GasLibraryFactory/DOCS_LIBS` before designing infrastructure logic.
- Reuse GasLibraryFactory directly when it fully covers a need.
- If the imported-table or physical-column work requires a partial
  GasLibraryFactory extension, stop and obtain user approval before editing the
  library.
- Never call native GAS globals outside GoogleApiWrapper.
- Keep domain code independent of GAS and preserve the existing composition
  root in `src/config/Bootstrap.ts`.
- Never edit generated `dist/*` output.
- Migrations may mutate only the persisted fixture selected by the E2E
  properties and artifacts owned by that fixture.

## Chosen approach

Use targeted root-cause stabilization. Correct confirmed product defects,
repair persisted fixture state through idempotent migrations, correct false
negative assertions, and investigate the one ambiguous rendering failure before
changing behavior.

The alternatives were rejected:

- Full fixture reprovisioning alone is destructive and would hide migration or
  cache defects that matter for long-lived installations.
- Test-harness-only relaxation would leave the JobRunner resume defects and
  possible rendering/cache defects unresolved.

## Architecture and sequencing

### Stage 1: Evidence and acceptance contract

Codify the expected aggregate result and create focused offline reproductions
for each failure family. Capture the current dirty-worktree behavior before
editing it. A failure may move to a later stage only when its input, failing
boundary, and expected output are explicit.

### Stage 2: False-negative assertions

Correct assertions whose current selection or environmental assumptions do not
match production semantics:

- select verbale registration rows by configuration/document identity and
  class, then check CSV membership;
- compare TEST_MODE mail logs with the recipient actually resolved by the safe
  delivery path;
- classify only the known invalid synthetic-principal protected-range outcome
  as skipped;
- verify dotted document identity independently from class-local placement when
  duplicate suppression intentionally reuses a document across classes.

### Stage 3: Persisted fixture migration

Treat the online fixture as versioned state. Before constructing repositories
that snapshot table contents, reconcile canonical MATERIE rows, remove known
out-of-schema columns safely, and ensure Drive/template artifacts match the
current fixture version. If reconciliation must occur after a container has
already been constructed, reset and rebuild the container before running any
checks.

### Stage 4: Production behavior

Make document and import JobRunner checkpoints self-contained by persisting
their configuration identity. Reproduce the imported-table heading failure
against a freshly provisioned template; fix only the boundary demonstrated by
that reproduction.

### Stage 5: Progressive verification

Run focused tests after each repair, then the entire offline matrix, the online
build, fixture migration, and Batches 1-4 in order.

## Failure-family design

### Verbale registration metadata

`MATERIE` is registration metadata, not visible verbale content. The fixture
intentionally configures `REGISTRA_DOC.materie` and
`REGISTRA_FOLD.materie` as `MATE`; no text is added to the Google Doc.

The assertion must locate the rows belonging to `CONF_DOC_VERBALE` rather than
the first folder mentioning class `3C`. It must validate `MATE` as a member of
the CSV metadata value. It must separately check document registration and
folder registration because they have different class scopes for articulated
classes.

### Imported tables

The recorded result proves that the imported table headers and data rows were
present; only `Tabelle importate per la classe 1A` was missing. The repair must
first provision the current template afresh and capture the final document text.

- If the fresh artifact renders the heading, increment the fixture artifact
  version and cover stale-template replacement.
- If it still fails, instrument the exact sequence `find table markers -> insert
tables -> remove marker text -> generic CDU render`. Add a focused regression
  proving that `{{focus.classe.anagrafica.nome}}` survives the table operations
  and becomes `1A`.
- If evidence locates the defect inside a partially matching GasLibraryFactory
  API, pause execution and request approval for the library extension. Do not
  recreate the library operation locally.

### JobRunner document/import resume

Initial calls supply `confDocId` or `configId`, but JobRunner persists the
generator's yielded checkpoint for resume. The document and import checkpoints
therefore carry their own configuration identity, following the working email
checkpoint pattern.

On first execution, handlers accept the top-level configuration ID. On resume,
they recover it from `resumeState`. A checkpoint lacking that identity raises a
specific validation/configuration error; it must never silently restart or look
up an empty ID. Resume tests must prove completion without duplicate output.

### TEST_MODE email recipient

The safe sender path and its assertions use the same resolved TEST_MODE
recipient. Successful rows must still have exactly one recipient, `SUCCESS`
state, and a non-empty logical target ID. This change does not permit production
recipient delivery during tests; it removes the hard-coded expectation that the
recipient must be the synthetic fixture address when the real environment
redirects to the active test operator.

### ASL timestamp fixture

The timestamp-fallback scenario continues to require that ASL has no physical
`DATA_MODIFICA` column. Fixture migration resolves the column by exact header,
verifies its resolved index and table identity, and removes it using an existing
GasLibraryFactory capability. It must never delete a column using an unresolved
index or a position inferred from stale schema metadata.

If GasLibraryFactory has no complete safe column-removal capability, execution
stops for an explicit library-extension decision.

### `cercaDocumenti` non-Sheets artifact

Provision a genuine, accessible non-Google-Sheets Drive file and persist its
real ID in the fixture descriptor. The import scenario must prove that this file
is skipped by MIME type while the two generated Sheets are imported.

A missing or inaccessible file remains a strict source error. This initiative
does not broaden production behavior to ignore stale `LOG_DOCS` references.

### MATERIE snapshot consistency

The persisted fixture can contain the correct `INTERPRET.FLAUTO` row while a
consumer constructed earlier retains a stale `materieIds` snapshot. Canonical
MATERIE reconciliation therefore completes before repository construction, or
the container is rebuilt immediately after reconciliation. The design does not
weaken the invariant that every dotted assignment column must have a catalog
row.

The migration is idempotent: it inserts missing canonical rows, reconciles
fixture-owned stale canonical rows when their version requires it, preserves
unrelated rows, and yields the same result on a second run.

### Dotted `SOTTOTIPO` identity

`PER_DOCENTE_MATERIA` duplicate identity is not necessarily class-local. A
teacher/subject document generated for an earlier class can suppress generation
for `4A`. The test therefore verifies the expected `ID_GEN + SOTTOTIPO`
globally, then checks class metadata according to the configured duplicate
semantics. It must not require a second physical row for `4A`.

### Protected ranges

When every add-protected-range request fails solely because Google rejects a
known `@onlinetest.aldo.local` principal, the scenario returns the same explicit
skipped outcome as Scenario 11. The condition must be structural: expected
operation, expected invalid-principal error family, expected synthetic domain,
and zero successfully created ranges.

Any unexpected API error, real-account rejection, malformed partial result,
warning-only range, missing expected principal on a created range, or mixture of
accepted and unexplained failed requests remains a failure.

## Fixture state and migration flow

The fixture descriptor stores a schema/artifact version. The batch preflight
compares it with the code's required version and runs migrations exactly once
per version:

1. resolve the persisted fixture from ScriptProperties;
2. validate that its spreadsheet and artifact IDs belong to the E2E fixture;
3. reconcile MATERIE and the ASL physical schema;
4. provision or replace versioned template/static artifacts;
5. persist the upgraded descriptor/version;
6. reset ALDO and build a fresh container;
7. purge append-only `LOG_MAIL` and `LOG_DOCS` history for the new full run;
8. start Batch 1.

Migration failure prevents test registration. Its error identifies the
migration step and affected fixture artifact without logging personal data.

## Error handling

- Unexpected Google API failures retain their operation and artifact ID and
  fail the scenario.
- Only the fully recognized synthetic-principal protected-range condition is
  skipped.
- Missing JobRunner configuration identity fails before any target is processed.
- Existing suspended state is reset only for the exact E2E job name.
- Imported-table diagnostics include generated file ID, resolved heading value,
  and residual placeholder count, with personal data redacted.
- Fixture migration validates exact targets before structural mutations.

## Testing strategy

Every behavioral repair uses this cycle:

1. add the smallest automated reproduction;
2. run it and observe the expected failure;
3. implement one root-cause correction;
4. run the focused test and its nearest regression suite;
5. commit the independently reviewable repair.

Required offline coverage includes:

- verbale row selection and CSV metadata membership;
- resolved TEST_MODE recipient safety;
- protected-range synthetic-principal skip versus genuine failure cases;
- dotted identity under cross-class duplicate suppression;
- fixture migration idempotence, MATERIE refresh, safe ASL column targeting,
  artifact versioning, and real attachment IDs;
- document/import suspend-resume with configuration identity preserved;
- ordinary CDU rendering before and after imported-table insertion;
- explicit regression coverage for scenarios 10b and 10c.

The final offline verification sequence is:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
npm run build:online
```

After pushing the online build, run the versioned fixture migration/reset and
then `runOnlineTestsBatch1`, `runOnlineTestsBatch2`, `runOnlineTestsBatch3`, and
`runOnlineTestsBatch4` in order. Acceptance requires exactly 102 passed, zero
failed, and one intentional skip, with explicit PASS results for 10b and 10c.

## Out of scope

- Rendering `MATERIE` metadata in the verbale body.
- Changing production duplicate semantics for `PER_DOCENTE_MATERIA`.
- Making `cercaDocumenti` ignore missing/inaccessible logged files.
- Accepting arbitrary protected-range failures as skips.
- Rebuilding the entire E2E environment when an idempotent migration suffices.
- Unrelated refactoring of the online-test runner or production services.
