# Online Batches 1–4 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four live Google Apps Script batches finish with exactly 103 scenarios, 102 PASS, 0 FAIL, and one intentional Scenario 11 SKIP, while reporting scenarios 10b and 10c explicitly as PASS.

**Architecture:** Keep fixes at their proven boundary: strengthen online assertions where selection is wrong, migrate the persisted E2E fixture before snapshot-based repositories are constructed, carry configuration identity inside resumable checkpoints, and extend GoogleApiWrapper for the one missing generic grid operation. Production duplicate, import-source, and document-rendering semantics remain strict; only the structurally recognized synthetic-principal protection limitation may skip.

**Tech Stack:** TypeScript, Jest, Google Apps Script V8, SheetDBLib, JobRunnerLib, GoogleApiWrapper, WorkspaceTemplateEngine, clasp.

## Global Constraints

- Work from the existing dirty tree. Before every task, inspect `git diff -- <listed files>` and preserve/rebase the user's changes; never reset or overwrite them.
- Use codebase-memory-mcp first for symbol discovery, call tracing, linkage, architecture, dead-code, and native-GAS bypass checks.
- Read the relevant file under `GasLibraryFactory/DOCS_LIBS` before changing infrastructure behavior. Do not inspect additional library source unless the docs and graph are insufficient.
- Never call `Sheets`, `SpreadsheetApp`, `DriveApp`, `DocumentApp`, `MailApp`, or another native GAS global from ALDO. The new physical-column operation belongs in GoogleApiWrapper.
- Never edit `dist/*`. Refresh `vendor/` only from a successfully built GasLibraryFactory bundle.
- Use red-green-refactor for every behavioral change. Each commit must be path-scoped and must not include unrelated dirty files.
- `MATERIE` on a verbale means `LOG_DOCS.MATERIE` / `LOG_FOLD.MATERIE` registration metadata. Do not render `MATE` or a subjects section into the verbale body.
- Do not weaken `CercaDocumentiStrategy`: missing/inaccessible matching files remain errors. Supply a real accessible non-Sheets fixture ID instead.
- Do not change `PER_DOCENTE_MATERIA` duplicate semantics. Correct the test's identity scope.
- Do not classify arbitrary protected-range failures as skipped. The only skip is zero created ranges when every expected editor is a synthetic `@onlinetest.aldo.local` principal and the generated sheet itself is otherwise valid.
- After every source edit, run `git diff --check` before committing.

## Failure-to-task Map

| Observed failures                                       | Planned task   |
| ------------------------------------------------------- | -------------- |
| Batch 1 verbale metadata                                | Task 2         |
| Batch 1 imported-table heading                          | Task 9         |
| Batch 1 document resume                                 | Task 5         |
| Batch 2 three email checks                              | Task 3         |
| Batch 3 ASL timestamp fallback                          | Tasks 6–7      |
| Batch 3 `cercaDocumenti` missing file                   | Task 8         |
| Batch 3 six `INTERPRET.FLAUTO` / storico / CDU failures | Task 7         |
| Batch 3 dotted `SOTTOTIPO` identity                     | Task 2         |
| Batch 3 import resume                                   | Task 5         |
| Batch 3 protected ranges                                | Task 4         |
| Aggregate totals and scenarios 10b/10c                  | Tasks 1 and 10 |

---

### Task 1: Lock the 103-scenario acceptance contract

**Files:**

- Modify: `test/unit/onlinetests/fullOnlineTests.test.ts`
- Modify: `test/unit/onlinetests/e2e-scenario-checks.test.ts`
- Inspect only: `src/onlinetests/index.ts`
- Inspect only: `src/onlinetests/checks/e2eScenarioChecks.ts`

- [ ] **Step 1: Record the existing registration order without changing production code**

  Use `search_graph`/`get_code_snippet` for `executeOnlineTestsBatch1` through `executeOnlineTestsBatch4`, `STANDARD_DOCUMENT_SCENARIO_NAMES`, and `ARTICOLATI_DOCUMENT_SCENARIO_NAMES`. Confirm that the batches register 26, 15, 27, and 35 scenarios respectively.

- [ ] **Step 2: Add failing aggregate assertions**

  Extend `fullOnlineTests.test.ts` to flatten the four captured batch result names and assert:

  ```ts
  expect(allNames).toHaveLength(103);
  expect(new Set(allNames).size).toBe(103);
  expect(allNames).toContain('E2E scenario 10b: genera documento complesso classe articolata (3C)');
  expect(allNames).toContain('E2E scenario 10c: genera riepiloghi firme CDC per classi ARTICOLATA');
  ```

  Add a focused Scenario 10c unit test parallel to the existing Scenario 10b test and assert `{ status: 'pass' }` for both callbacks.

- [ ] **Step 3: Run the tests and capture the baseline**

  Run:

  ```bash
  npx jest --config jest.config.cjs test/unit/onlinetests/fullOnlineTests.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts --runInBand
  ```

  Expected: the new 10c check or exact aggregate count fails if registration/reporting is incomplete. If both already pass, retain them as characterization tests and do not manufacture a production change.

- [ ] **Step 4: Make only the smallest reporting correction if red**

  If a name is registered but omitted from captured results, fix the corresponding set/routing in `e2eScenarioChecks.ts`; if the count differs, reconcile against the four batch registration lists without adding/removing scenarios merely to force 103.

- [ ] **Step 5: Verify and commit**

  Re-run the focused command, then:

  ```bash
  git diff --check
  git add test/unit/onlinetests/fullOnlineTests.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts src/onlinetests/checks/e2eScenarioChecks.ts
  git commit -m "test: lock online batch acceptance contract"
  ```

---

### Task 2: Correct verbale and dotted-document false negatives

**Files:**

- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Modify: `src/onlinetests/checks/itpDottedChecks.ts`
- Modify: `test/unit/onlinetests/e2e-scenario-checks.test.ts`
- Modify: `test/unit/onlinetests/itp-dotted-checks.test.ts`

- [ ] **Step 1: Add a failing verbale row-selection regression**

  Seed an unrelated `LOG_FOLD` row that mentions `3C` before the real verbale folder. Assert that Scenario 1 still passes when the real `CONF_DOC_VERBALE` document/folder rows contain `MATE` in their CSV metadata.

- [ ] **Step 2: Select registration rows by identity and CSV membership**

  Replace the first-class-match lookup with helpers equivalent to:

  ```ts
  const verbaleDocs = rowsForConfig(TABLE.LOG_DOCS, CONF_DOC_VERBALE);
  const verbaleFolders = folders.filter((row) => row[COL_LOG_FOLD.TIPO] === 'VERBALE');
  const hasMate = (value: unknown): boolean => csvContains(value, 'MATE');
  ```

  Match the folder by `TIPO === 'VERBALE'`, CSV class membership, and the parent directory of the selected verbale document's `LOG_DOCS.PATH`; this prevents an unrelated folder mentioning the same class from winning. Check document and folder registrations separately. Do not touch `VERBALE_PARAGRAPHS`.

- [ ] **Step 3: Add the cross-class dotted dedupe regression**

  In `itp-dotted-checks.test.ts`, create a pre-existing `CONF_DOC_DOCENTE_MATERIA` row for the expected `ID_GEN + SOTTOTIPO` whose `CLASSI` is an earlier class, then prove the focal `4A` run skips the duplicate yet the identity assertion passes.

- [ ] **Step 4: Make dotted identity global and metadata checks semantic**

  In `registerItpDottedChecks`, find expected documents globally by:

  ```ts
  row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_DOCENTE_MATERIA &&
    expectedSubtypes.has(stringCell(row[COL_LOG_DOCS.SOTTOTIPO]));
  ```

  Assert class membership only according to configured duplicate semantics; do not require a second physical `4A` row.

- [ ] **Step 5: Verify and commit**

  ```bash
  npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts test/unit/onlinetests/itp-dotted-checks.test.ts --runInBand
  git diff --check
  git add src/onlinetests/checks/e2eScenarioChecks.ts src/onlinetests/checks/itpDottedChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts test/unit/onlinetests/itp-dotted-checks.test.ts
  git commit -m "fix: align online document identity assertions"
  ```

---

### Task 3: Use the authenticated safe recipient consistently in TEST_MODE

**Files:**

- Modify: `src/onlinetests/index.ts`
- Modify: `src/onlinetests/checks/emailChecks.ts`
- Modify: `src/onlinetests/checks/jobRunnerChecks.ts`
- Modify: `test/unit/onlinetests/emailChecks.test.ts`
- Modify: `test/unit/onlinetests/jobRunnerChecks.test.ts`
- Modify: `test/unit/onlinetests/fullOnlineTests.test.ts`
- Reuse: `src/infrastructure/facades/ActiveUserFacade.ts`

- [ ] **Step 1: Add failing tests for a real active operator**

  Use `operator@example.test` as an injected authenticated user and prove that the same address is passed to `avviaInvioNotificheDataDriven` and checked in `LOG_MAIL.DESTINATARI`. Add negative cases for an empty active email, multiple logged recipients, a production recipient different from the resolved operator, non-`SUCCESS`, and empty `logicalTargetId`.

- [ ] **Step 2: Introduce one online-test recipient resolver**

  Add an injectable dependency to the online test runner, defaulting to `new SessionActiveUserFacade()`, and resolve once per batch:

  ```ts
  const testRecipient = activeUser.getEmail().trim();
  if (testRecipient === '') {
    throw new ConfigurationError('Destinatario TEST_MODE Workspace non disponibile.');
  }
  ```

  Pass this exact value to both `registerEmailChecks` and `registerJobRunnerEmailChecks`. Remove the `@onlinetest.aldo.local` suffix requirement from `emailChecks.ts`; safety is equality with the authenticated test operator plus `MASTER.TEST_MODE=true`, not membership in a fake domain.

- [ ] **Step 3: Keep sender and assertion on the same value**

  Retain `EmailBatchService`'s `testRecipient` checkpoint behavior. Do not alter production recipients or `EmailNotificationService.sendToTarget`; the harness supplies the authenticated safe address and `assertSafeSuccessfulRows` checks precisely that address.

- [ ] **Step 4: Verify all three failed Batch 2 scenarios offline**

  ```bash
  npx jest --config jest.config.cjs test/unit/onlinetests/emailChecks.test.ts test/unit/onlinetests/jobRunnerChecks.test.ts test/unit/onlinetests/fullOnlineTests.test.ts test/unit/application/email-batch-service.test.ts --runInBand
  ```

- [ ] **Step 5: Commit**

  ```bash
  git diff --check
  git add src/onlinetests/index.ts src/onlinetests/checks/emailChecks.ts src/onlinetests/checks/jobRunnerChecks.ts test/unit/onlinetests/emailChecks.test.ts test/unit/onlinetests/jobRunnerChecks.test.ts test/unit/onlinetests/fullOnlineTests.test.ts
  git commit -m "fix: resolve online test recipient from active user"
  ```

---

### Task 4: Share one strict synthetic-principal protected-range classifier

**Files:**

- Create: `src/onlinetests/checks/protectedRangeOutcome.ts`
- Create: `test/unit/onlinetests/protected-range-outcome.test.ts`
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Modify: `src/onlinetests/checks/aclRealiChecks.ts`
- Modify: `test/unit/onlinetests/e2e-scenario-checks.test.ts`
- Modify: `test/unit/onlinetests/acl-reali-checks.test.ts`

- [ ] **Step 1: Write the classifier matrix first**

  Cover: all expected editors synthetic + zero ranges => skip; any real editor => fail; any created warning-only range => fail; a partial created range => fail; a range missing an expected editor => fail; non-test mode => fail; mixed/unexplained evidence => fail.

- [ ] **Step 2: Implement a pure classifier**

  Export a function returning `OnlineTestSkippedOutcome | undefined` only when:

  ```ts
  testMode === true &&
    ranges.length === 0 &&
    expectedEditors.length > 0 &&
    expectedEditors.every((email) => email.toLowerCase().endsWith('@onlinetest.aldo.local'));
  ```

  Its reason must name `addProtectedRange`, `Utente non valido`, and the synthetic domain. All other states flow into the existing strict range assertions.

- [ ] **Step 3: Use it in Scenario 11 and `acl.reali`**

  In Scenario 11, return the shared skip only after headers are non-empty and placeholder-free. In `acl.reali`, compute all expected principals, read persisted ranges, return the shared skip when eligible, otherwise call `assertProtectedRangePrincipals` for `MAT`.

- [ ] **Step 4: Ensure TestRunner records the callback outcome**

  Return the skip object from each `runner.add` callback; do not call `runner.skip` before generating/reading the artifact. This preserves one intentional runtime SKIP and makes unexpected API outcomes FAIL.

- [ ] **Step 5: Verify and commit**

  ```bash
  npx jest --config jest.config.cjs test/unit/onlinetests/protected-range-outcome.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts test/unit/onlinetests/acl-reali-checks.test.ts --runInBand
  git diff --check
  git add src/onlinetests/checks/protectedRangeOutcome.ts src/onlinetests/checks/e2eScenarioChecks.ts src/onlinetests/checks/aclRealiChecks.ts test/unit/onlinetests/protected-range-outcome.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts test/unit/onlinetests/acl-reali-checks.test.ts
  git commit -m "fix: classify synthetic protected range limitation"
  ```

---

### Task 5: Make document and import JobRunner checkpoints self-contained

**Files:**

- Modify: `src/application/services/DocumentBatchService.ts`
- Modify: `src/application/services/ImportService.ts`
- Modify: `test/unit/application/document-batch-service.test.ts`
- Modify: `test/unit/application/import-service.test.ts`
- Modify: `test/unit/onlinetests/jobRunnerChecks.test.ts`

- [ ] **Step 1: Add failing raw-resume tests**

  Start each generator, capture the first yielded checkpoint, then invoke its registered JobRunner handler with `{ resumeState: checkpoint }` and no top-level ID. Assert completion, no empty `CONF_DOC`/`CONF_IMP` lookup, no duplicate generation/load, and no restart from index zero.

- [ ] **Step 2: Extend document checkpoint identity**

  Change the state contract to:

  ```ts
  export interface BatchResumeState {
    confDocId: string;
    jobId: string;
    nextIndex: number;
    processed: string[];
    errori: string[];
    planTargets?: PianoBatchTarget[];
    docenteMateriaTargets?: DocenteMateriaBatchTarget[];
  }
  ```

  Resolve `confDocId` and `jobId` from top-level params first, then `resumeState`. Include both fields in every yielded checkpoint from all four batch axes. Reject a legacy checkpoint without `confDocId` before processing any target, with a specific `ConfigurationError`.

- [ ] **Step 3: Wrap the library import checkpoint**

  Do not modify `ImportCheckpoint`. Add an ALDO-owned state:

  ```ts
  export interface ImportJobCheckpoint {
    configId: string;
    importCheckpoint: ImportCheckpoint;
  }
  ```

  Make the JobRunner-facing generator yield `ImportJobCheckpoint`; on resume resolve `configId` from top-level params or the wrapper, then pass only `importCheckpoint` into `ImportEngine.runImportChunk`. A malformed wrapper throws `PipelineError('Stato di ripresa import privo di configId')` before any engine call.

- [ ] **Step 4: Keep direct chunked service behavior available**

  If existing callers/tests use `executeImportChunked(configId, ImportCheckpoint)`, keep that method as the engine-level generator and add a small `importJobHandler(params)` wrapper for JobRunner registration. Do not encode ALDO metadata inside the library checkpoint object.

- [ ] **Step 5: Verify and commit**

  ```bash
  npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts test/unit/application/import-service.test.ts test/unit/onlinetests/jobRunnerChecks.test.ts --runInBand
  git diff --check
  git add src/application/services/DocumentBatchService.ts src/application/services/ImportService.ts test/unit/application/document-batch-service.test.ts test/unit/application/import-service.test.ts test/unit/onlinetests/jobRunnerChecks.test.ts
  git commit -m "fix: persist job configuration in resume checkpoints"
  ```

---

### Task 6: Extend GoogleApiWrapper with safe one-column deletion

**Files:**

- Modify: `GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/SpreadsheetGridManager.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/SpreadsheetService.js`
- Modify carefully: `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/SpreadsheetService.test.js`
- Regenerate: `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper.md`
- Modify: `types/gaslibs/index.d.ts`
- Refresh generated dependency: `vendor/gaslibs.Code.js`
- Refresh generated dependency: `vendor/CHECKSUM`

- [ ] **Step 1: Preserve nested-repository user changes**

  The GLF worktree is already dirty, including `SpreadsheetService.test.js`. Inspect its diff and add tests without replacing unrelated edits. Read `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper.md` sections for `SpreadsheetGridManager.deleteRow/deleteRows` before editing source.

- [ ] **Step 2: Add failing GoogleApiWrapper tests**

  Assert 1-based column index `4` generates:

  ```js
  {
    deleteDimension: {
      range: {
        sheetId: 123,
        dimension: 'COLUMNS',
        startIndex: 3,
        endIndex: 4
      }
    }
  }
  ```

  Also assert missing sheet fails before `batchUpdate`, index `< 1` fails before mutation, retry wrapper is used, and metadata cache is cleared after success.

- [ ] **Step 3: Implement and delegate `deleteColumn`**

  Add `SpreadsheetGridManager.deleteColumn(spreadsheetId, sheetName, columnIndex)` parallel to `deleteRow`, with explicit positive-integer validation, `dimension: 'COLUMNS'`, `_executeWithRetry(..., 3)`, and cache clearing. Add `'deleteColumn'` to `SpreadsheetService`'s grid delegation list.

- [ ] **Step 4: Verify GLF, regenerate docs, and build**

  ```bash
  cd GasLibraryFactory
  npm test -- --runTestsByPath GoogleApiWrapper/src/services/__tests__/SpreadsheetService.test.js
  npm run lint
  npm run docs
  npm run build
  cd ..
  ```

  Expected: tests PASS and generated docs contain `SpreadsheetGridManager.deleteColumn`.

- [ ] **Step 5: Expose the type and refresh ALDO's vendor bundle**

  Add to `SpreadsheetService` in `types/gaslibs/index.d.ts`:

  ```ts
  deleteColumn(spreadsheetId: string, sheetName: string, columnIndex: number): unknown;
  ```

  Then run:

  ```bash
  npm run refresh:vendor
  npm run verify:vendor
  npm run typecheck
  ```

- [ ] **Step 6: Commit only the extension files**

  Commit in the nested GLF repository first, staging only the listed GLF files and generated docs. Then commit ALDO's type/vendor refresh separately. Never include the other pre-existing GLF dirty files.

---

### Task 7: Version and migrate the persisted E2E fixture before repository snapshots

**Files:**

- Modify: `src/onlinetests/index.ts`
- Modify carefully: `src/onlinetests/data/SharedTestDatabaseBuilder.ts`
- Modify: `src/onlinetests/entrypoints/EntryPointOnlineTests.ts`
- Modify: `src/onlinetests/OnlineTestsEntry.ts`
- Modify: `test/unit/onlinetests/reset-e2e-history-tables.test.ts`
- Modify: `test/unit/onlinetests/shared-test-database-builder-migration.test.ts`
- Modify: `test/unit/onlinetests/fullOnlineTests.test.ts`

- [ ] **Step 1: Characterize the existing dirty migration work**

  Run the current reset/migration tests before editing. Retain `buildMaterieRows()` as the single canonical source. Add failing cases for a second idempotent run, a missing `INTERPRET.FLAUTO`, a stray ASL `DATA_MODIFICA` header, an ambiguous duplicate header, and a migration followed by a consumer snapshot.

- [ ] **Step 2: Separate schema migration from history purge**

  Introduce an idempotent `migratePersistedE2eFixture(...)` that performs schema/artifact reconciliation but never clears `LOG_MAIL` or `LOG_DOCS`. Keep `resetE2eHistoryTables()` as the explicit pre-Batch-1 launcher that calls migration and then purges only those two history tables.

- [ ] **Step 3: Persist a fixture version**

  Add a property such as:

  ```ts
  export const PROP_ONLINETEST_FIXTURE_VERSION = 'ALDO_ONLINETEST_FIXTURE_VERSION';
  const REQUIRED_ONLINETEST_FIXTURE_VERSION = 2;
  ```

  Persist it only after every migration step succeeds. A rerun at the required version must verify invariants and perform no mutations.

- [ ] **Step 4: Reconcile MATERIE before the final container exists**

  Use a temporary container only to access the fixture DB, insert missing canonical rows from `buildMaterieRows()`, then call `resetAldoFn()` and construct the final test container. Do not run context/history/dotted checks with the temporary container. Preserve unrelated MATERIE rows.

- [ ] **Step 5: Remove the ASL column by exact physical header**

  Read the real ASL header row through `ServiceFactory.getSpreadsheetService().getRanges(sample.sampleSpreadsheetId, 'ASL!1:1')`; require exactly one trimmed `DATA_MODIFICA`; derive its 1-based index; re-read/validate the target immediately before mutation; call the new `deleteColumn(sample.sampleSpreadsheetId, 'ASL', index)`. Zero matches is already migrated; multiple matches or a changed header fails without mutation.

- [ ] **Step 6: Run migration before every batch's final initialization**

  `executeOnlineTestsBatch` must run the idempotent migration before creating the container used by registrations. It must not purge history, because later batches depend on artifacts/logs produced earlier. Update injected dependencies so offline tests can supply header reads/deletion without native GAS globals.

- [ ] **Step 7: Verify and commit**

  ```bash
  npx jest --config jest.config.cjs test/unit/onlinetests/reset-e2e-history-tables.test.ts test/unit/onlinetests/shared-test-database-builder-migration.test.ts test/unit/onlinetests/fullOnlineTests.test.ts --runInBand
  git diff --check
  git add src/onlinetests/index.ts src/onlinetests/data/SharedTestDatabaseBuilder.ts src/onlinetests/entrypoints/EntryPointOnlineTests.ts src/onlinetests/OnlineTestsEntry.ts test/unit/onlinetests/reset-e2e-history-tables.test.ts test/unit/onlinetests/shared-test-database-builder-migration.test.ts test/unit/onlinetests/fullOnlineTests.test.ts
  git commit -m "fix: migrate persisted online fixture before tests"
  ```

---

### Task 8: Recover and validate the real non-Sheets attachment ID

**Files:**

- Modify: `src/onlinetests/index.ts`
- Modify: `src/onlinetests/checks/importChecks.ts`
- Modify: `test/unit/onlinetests/index.test.ts`
- Modify: `test/unit/onlinetests/import-checks.test.ts`
- Modify: `test/unit/onlinetests/creaDatiMockDrive.test.ts`
- Inspect: `src/onlinetests/data/SharedTestDatabaseBuilder.ts`
- Inspect: `src/onlinetests/E2eTemplateProvisioner.ts`

- [ ] **Step 1: Add failing persisted-sample tests**

  Prove `executeCreaDatiMockDrive` persists the provisioned `templateIds.staticAttachment`, and `readPersistedFullOnlineTestSample` returns that exact non-empty ID. Add failure cases for missing ID and Drive metadata reporting a Google Sheets MIME type.

- [ ] **Step 2: Persist the artifact identity**

  Add `PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID`. Set it only from `SharedTestDatabaseBuilder.build(...).staticAttachmentFileId`; never invent UUIDs. Include it in the persisted sample descriptor read by all batch launchers.

- [ ] **Step 3: Validate accessibility and MIME before registering import checks**

  Through `ServiceFactory.getDriveService().getFiles(id, { fields: 'id,mimeType', strict: true })`, require a matching accessible file whose MIME is not Google Sheets. Missing/inaccessible remains a configuration/source failure; do not make `CercaDocumentiStrategy` ignore it.

- [ ] **Step 4: Make migration repair old descriptors**

  During the version migration, if the property is absent, resolve the configured `CONF_MAIL_STATIC_ALLEGATO.ALLEGATI` ID from the persisted fixture and validate it; persist it only when valid. If neither source is valid, fail with an instruction to rerun `creaDatiMockDrive(true)` rather than appending a bogus `LOG_DOCS` row.

- [ ] **Step 5: Guard the import check itself**

  Before inserting the non-sheet sentinel row, reject an empty ID. Keep the existing two generated Sheets and `_CLASSE` assertions unchanged.

- [ ] **Step 6: Verify and commit**

  ```bash
  npx jest --config jest.config.cjs test/unit/onlinetests/index.test.ts test/unit/onlinetests/import-checks.test.ts test/unit/onlinetests/creaDatiMockDrive.test.ts --runInBand
  git diff --check
  git add src/onlinetests/index.ts src/onlinetests/checks/importChecks.ts test/unit/onlinetests/index.test.ts test/unit/onlinetests/import-checks.test.ts test/unit/onlinetests/creaDatiMockDrive.test.ts
  git commit -m "fix: persist real online attachment identity"
  ```

---

### Task 9: Reproduce and fix the imported-table heading at the proven boundary

**Files:**

- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Modify conditionally: `src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts`
- Modify conditionally: `test/unit/application/documento-con-tabelle-generator.test.ts`
- Modify: `src/onlinetests/checks/documentiChecks.ts`
- Modify: `test/unit/onlinetests/documentiChecks.test.ts`

- [ ] **Step 1: Force a fresh imported-table template**

  Change only `NAME_DOC_TABELLE` to `E2E Doc Tabelle Importate Template v2` and add a provisioner test proving the v1 artifact is not reused. Keep the paragraph exactly:

  ```ts
  'Tabelle importate per la classe {{focus.classe.anagrafica.nome}}';
  ```

- [ ] **Step 2: Add boundary diagnostics to the online assertion**

  On failure, report the generated file ID, whether the expected heading is present, whether `{{focus.classe.anagrafica.nome}}` remains, and the count of residual `{{...}}` placeholders. Do not log CDU personal data or full document text.

- [ ] **Step 3: Reproduce with the focused strategy test**

  Build a fake document containing the heading plus both `{{TABELLA:*}}` markers. Assert the sequence inserts the non-empty table, removes both markers (including the empty source), preserves the heading placeholder until generic rendering, and produces `Tabelle importate per la classe 1A` afterward.

- [ ] **Step 4: Apply a production fix only if the fresh-template test remains red**

  If table mutation removes/corrupts the heading placeholder, change the smallest ordering/boundary in `DocumentoConTabelleImportateGeneratorStrategy.render`: table discovery/insertion and marker removal must complete without deleting unrelated paragraphs, then `super.render(fileId, cdu)` performs generic CDU substitution. If the failure is inside a partially matching WorkspaceTemplateEngine/GoogleApiWrapper operation, stop and request a separate explicit GLF-extension decision before coding around it locally.

- [ ] **Step 5: Verify and commit**

  ```bash
  npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/application/documento-con-tabelle-generator.test.ts test/unit/onlinetests/documentiChecks.test.ts --runInBand
  git diff --check
  git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/checks/documentiChecks.ts test/unit/onlinetests/e2e-template-provisioner.test.ts test/unit/onlinetests/documentiChecks.test.ts
  ```

  If production strategy files changed, stage those two too. Commit as `fix: preserve CDU heading around imported tables` when behavior changed, or `fix: version imported-table online template` when only stale provisioning was proven.

---

### Task 10: Run architecture, offline, build, and live acceptance gates

**Files:**

- Verify: all changed source/test files
- Generated by build only: `dist/*` (never hand-edit or commit unless repository policy already tracks it)
- Record results outside source: `ONLINE_RESULTS/`

- [ ] **Step 1: Re-index and run mandatory graph checks**

  Refresh `aldo-full-coverage`, `home-giulio-Desktop-ALDO-implementing`, and the GLF graph after source changes. Use graph queries to verify:

  - no ALDO module added direct native GAS global calls;
  - every new `SpreadsheetService.deleteColumn` call resolves to the GLF method with the exact three-argument signature;
  - no new circular dependency crosses the existing layers;
  - new non-trigger functions have expected inbound calls (no accidental dead code).

- [ ] **Step 2: Run the complete offline matrix**

  ```bash
  npm run typecheck
  npm run lint
  npm test -- --runInBand
  npm run test:integration -- --runInBand
  npm run test:build -- --runInBand
  npm run build:online
  npm run verify:vendor
  git diff --check
  ```

  Expected: every command exits 0. Investigate any warning/error; do not waive unrelated regressions introduced by these changes.

- [ ] **Step 3: Push the verified online build**

  ```bash
  npm run push:online
  ```

  Expected: the offline push gate passes and clasp uploads the online bundle.

- [ ] **Step 4: Run the fixture reset/migration once**

  In the Apps Script real environment run `resetE2eHistoryTables`. Confirm:

  - `LOG_MAIL` and `LOG_DOCS` were purged;
  - missing canonical MATERIE rows, including `INTERPRET.FLAUTO`, were reconciled;
  - ASL has no `DATA_MODIFICA` header;
  - the static attachment ID resolves and is not a Sheet;
  - migration reports no warnings.

- [ ] **Step 5: Run Batches 1–4 in order**

  Run `runOnlineTestsBatch1`, `runOnlineTestsBatch2`, `runOnlineTestsBatch3`, and `runOnlineTestsBatch4`, waiting for each to finish before starting the next. Save the four reports under `ONLINE_RESULTS/` without modifying source files.

- [ ] **Step 6: Reconcile exact totals**

  Required final table:

  | Batch       |   Total |    PASS |  FAIL |  SKIP |
  | ----------- | ------: | ------: | ----: | ----: |
  | 1           |      26 |      25 |     0 |     1 |
  | 2           |      15 |      15 |     0 |     0 |
  | 3           |      27 |      27 |     0 |     0 |
  | 4           |      35 |      35 |     0 |     0 |
  | **Overall** | **103** | **102** | **0** | **1** |

  Confirm Scenario 11 is the sole SKIP and its reason is the synthetic invalid-principal limitation. Confirm Scenario 10b and Scenario 10c each have an explicit `[TEST:END] ... PASS`. Invalid-user warnings may appear only inside the two protected-range scenarios; any other warning/error family blocks completion.

- [ ] **Step 7: Final review and handoff**

  Use `superpowers:verification-before-completion`, include the command outputs and live totals in the handoff, and list any remaining user-owned dirty files separately. Do not claim completion from Batch 4 alone or from absence in a FAIL list.

## Completion Criteria

- All focused and full offline commands pass.
- GoogleApiWrapper owns and documents physical column deletion; ALDO has no native Sheets bypass.
- Document/import resume completes from yielded state without duplicate work.
- The persisted fixture migrates idempotently before snapshot consumers.
- Verbale `MATERIE` is verified as registration metadata and is not rendered into the document.
- The live result is exactly 103 total / 102 PASS / 0 FAIL / 1 intentional SKIP.
- Scenarios 10b and 10c are explicitly PASS.
