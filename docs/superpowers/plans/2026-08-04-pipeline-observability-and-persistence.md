# Pipeline Observability and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit content-first, fully nested, timed document/email pipeline logs while durably committing generated folder/document/email records and eliminating false dynamic-job registry errors.

**Architecture:** Extend GasLibraryFactory at its existing logging, pipeline, transaction, and job-runner seams; ALDO steps then publish explicit bounded result details through the library contract. Keep one shared synchronous logger, propagate a scoped tree position during step execution, return concise typed item results to batch services, and refresh the vendored library bundle instead of implementing library behavior locally.

**Tech Stack:** Google Apps Script V8, JavaScript/JSDoc, TypeScript, CoreUtilsLib, PipelineFramework, SheetDBLib, JobRunnerLib, Jest, Webpack, codebase-memory-mcp.

## Global Constraints

- Use `GasLibraryFactory/DOCS_LIBS` before library source and implement reusable behavior in GasLibraryFactory.
- Keep GAS V8 execution synchronous; do not add Node or browser-only APIs.
- Pipeline output is content-first: useful data follows `[StepName]`; status and duration trail it.
- Log operational email addresses unredacted, but never log credentials, tokens, complete CDU payloads, or full email bodies.
- `SelectTemplate` logs only the resolved template ID; do not add a Drive metadata call.
- `CloneTemplate` logs only the generated file ID; do not log its link at step level.
- `RegisterDocument` and `LogEmail` log only status/timing.
- Do not edit `dist/*`; refresh `vendor/` through the supported build/refresh commands.
- Preserve unrelated root and nested-repository working-tree changes.
- Follow red-green-refactor: every production change needs a focused failing test observed first.

---

### Task 1: GasLibraryFactory observability and correctness foundation

**Files:**
- Modify: `GasLibraryFactory/CoreUtilsLib/src/internal/StructuredLogFormatter.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/LoggerService.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/testing/mocks.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/__tests__/LoggerService.test.js`
- Modify: `GasLibraryFactory/PipelineFramework/src/Step.js`
- Modify: `GasLibraryFactory/PipelineFramework/src/Pipeline.js`
- Modify: `GasLibraryFactory/PipelineFramework/src/__tests__/Step.test.js`
- Modify: `GasLibraryFactory/PipelineFramework/src/__tests__/Pipeline.test.js`
- Modify: `GasLibraryFactory/SheetDBLib/src/internal/database-managers/DatabaseConnectionManager.js`
- Modify: `GasLibraryFactory/SheetDBLib/src/__tests__/DatabaseService.test.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/internal/managers/JobRunnerExecutionController.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/__tests__/JobDefinitionRegistry.test.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/internal/CapturingLogger.js`

**Interfaces:**
- Produces: `LoggerService.withPosition<T>(position, callback: () => T): T`, restoring the prior position in `finally`.
- Produces: `Step._getLogDetails(context): LogDetails | null`; the base implementation returns `null`, where detail records may contain scalar values or short scalar arrays.
- Produces: `StepExecutionResult.logDetails` on successful non-skipped execution.
- Produces: content-first `logPipelineStep(stepName, status, details, position)` and `logSummary(label, durationMs, details, position)` rendering.
- Preserves: legacy string/array/object `LogDetails` inputs and semantic logger fallbacks.
- Corrects: `DatabaseConnectionManager.commit()` drains table queues before the low-level spreadsheet batch flush.
- Corrects: optional job definitions are checked with `jobExists(jobName)` before strict retrieval.
- Produces: job terminal details containing `durationMs` for complete, failed, cancelled, suspended, and thrown-error paths.

- [ ] **Step 1: Write failing formatter and scoped-logger tests**

Add literal expectations that prove content precedes timing and ordinary messages inherit scope:

```js
expect(
  formatter.pipelineStep(
    'GenerateName',
    'EXECUTED',
    { content: 'PDP_DSA_Rossi_Mario_2026', durationMs: 4 },
    { depth: 2, isLast: false, ancestorHasNext: [true] }
  )
).toEqual([
  '  │    ├─ ✅ [GenerateName] PDP_DSA_Rossi_Mario_2026 (EXECUTED in 4ms)'
]);

expect(
  formatter.pipelineStep(
    'AnalyzeContext',
    'EXECUTED',
    { durationMs: 0 },
    { depth: 2, isLast: false, ancestorHasNext: [true] }
  )
).toEqual(['  │    ├─ ✅ [AnalyzeContext] EXECUTED in 0ms']);

const result = logger.withPosition(
  { depth: 2, isLast: false, ancestorHasNext: [true] },
  () => {
    logger.info('nested');
    return 42;
  }
);
expect(result).toBe(42);
expect(Logger.log).toHaveBeenCalledWith('  │    ├─ [INFO] nested');
logger.info('root');
expect(Logger.log).toHaveBeenLastCalledWith('[INFO] root');
```

Also test nested scopes, callback throws/restores, explicit semantic positions overriding the inherited position, empty details, short arrays, skipped reasons, failed reasons, and content-first summaries.

Use this literal summary expectation:

```js
expect(
  formatter.summary(
    'Document generated',
    8572,
    'PDP_DSA_Rossi_Mario_2026',
    { depth: 1, isLast: true, ancestorHasNext: [] }
  )
).toEqual([
  '  └─ Document generated: PDP_DSA_Rossi_Mario_2026 (COMPLETED in 8572ms)'
]);
```

- [ ] **Step 2: Run the CoreUtils tests and verify RED**

Run:

```bash
cd GasLibraryFactory
npx jest CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js CoreUtilsLib/src/__tests__/LoggerService.test.js --runInBand
```

Expected: FAIL because content-first step detail objects and `withPosition()` are not implemented.

- [ ] **Step 3: Implement content-first formatting and synchronous position scope**

Add a reserved pipeline detail envelope while retaining legacy detail support:

```js
// PipelineFramework passes this shape to logPipelineStep.
{
  content: 'PDP_DSA_Rossi_Mario_2026', // optional LogDetails
  durationMs: 4,                       // optional finite non-negative number
  reason: undefined                    // optional failure/skip content
}
```

Render these exact forms:

```text
[Step] content (EXECUTED in Nms)
[Step] EXECUTED in Nms
[Step] reason (SKIPPED)
[Step] reason (FAILED in Nms)
```

Store scoped positions as a stack on the shared logger. Route `debug`, `info`, `warn`, `error`, and dynamic `log` through one private emission helper that prefixes every multiline output line using `StructuredLogFormatter.step()` when a scope exists. Add a `withPosition` proxy to `child()` and `LoggerServiceMock`.

- [ ] **Step 4: Write and run failing Step/Pipeline contract tests**

Create a real test step:

```js
class DetailedStep extends Step {
  _executeLogic(context) {
    context.set('generatedName', 'PDP_DSA_Rossi_Mario_2026');
    this.logger.info('nested service detail');
  }

  _getLogDetails(context) {
    return context.get('generatedName');
  }
}
```

Assert that `Step.execute()` returns `logDetails`, that skipped/failed steps do not call the success hook, that hook failures cannot mask successful step logic (log a warning and omit details), and that `Pipeline.execute()` passes:

```js
{
  content: 'PDP_DSA_Rossi_Mario_2026',
  durationMs: expect.any(Number)
}
```

to `logPipelineStep`. Assert the nested ordinary message has a deeper tree prefix than the pipeline step and no nested line starts at column zero.

Run:

```bash
cd GasLibraryFactory
npx jest PipelineFramework/src/__tests__/Step.test.js PipelineFramework/src/__tests__/Pipeline.test.js --runInBand
```

Expected: FAIL because `Step` has no details hook and `Pipeline` does not establish logger scope.

- [ ] **Step 5: Implement the Step/Pipeline details and nesting contract**

Add the base hook and include its value in successful results:

```js
_getLogDetails(_context) {
  return null;
}

// after _executeLogic(context)
const logDetails = this._getLogDetails(context);
return { success: true, skipped: false, durationMs, logDetails };
```

In `Pipeline.execute()`, invoke `_executeStep()` through `logger.withPosition()` when available, using a child position one level below `_stepLogPosition(stepIndex)`. Pass `result.logDetails` as `content` and duration separately. Preserve the old logger fallback for injected minimal test loggers.

- [ ] **Step 6: Write and run the failing SheetDB transaction test**

In `DatabaseService.test.js`, arrange two registered table doubles with pending mutations and record call order:

```js
expect(callOrder).toEqual([
  'LOG_FOLD.flush',
  'LOG_DOCS.flush',
  'spreadsheet.flushBatch'
]);
expect(database.inTransaction()).toBe(false);
```

Add a failure case where a table flush throws and assert `flushBatch` is not called, the commit-success log is absent, and rollback/error behavior is retained.

Run:

```bash
cd GasLibraryFactory
npx jest SheetDBLib/src/__tests__/DatabaseService.test.js --runInBand
```

Expected: FAIL because current `commit()` calls only `spreadsheetService.flushBatch()`.

- [ ] **Step 7: Fix transaction commit ordering**

Inside `commit()`, before the low-level flush, iterate `Object.keys(this.facade.tables)` and call `table.flush()` for each table. Only clear `_transaction`/`_inTransaction` and log success after every table flush and `flushBatch()` succeed. Do not call `save()` from inside a transaction.

- [ ] **Step 8: Write and run failing JobRunner optional-definition and timing tests**

Assert that a dynamic job runs with `jobExists()` false without calling strict `getDefinition()` and without an error log. Mock `Date.now()` as `1000` then `1275`, and assert the terminal semantic call contains `durationMs: 275` and renders `Job 'dynamic-name' completed successfully (COMPLETED in 275ms)`. Cover suspension (`SUSPENDED after 275ms`), cancellation/failure status, and thrown error.

Run:

```bash
cd GasLibraryFactory
npx jest JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js JobRunnerLib/src/__tests__/JobDefinitionRegistry.test.js --runInBand
```

Expected: FAIL because lookup is unconditional and terminal events omit invocation timing.

- [ ] **Step 9: Implement optional lookup and terminal duration**

Capture `startedAt = Date.now()` before job-start logging. Use:

```js
const jobDefinition = this._jobDefinitionRegistry.jobExists(jobName)
  ? this._jobDefinitionRegistry.getDefinition(jobName)
  : null;
```

Pass a content-first detail object containing `durationMs: Date.now() - startedAt` through `_logTerminal()` and thrown-error handling. Update `CapturingLogger` only as needed to proxy the unchanged semantic method surface.

- [ ] **Step 10: Verify and commit the library task**

Run:

```bash
cd GasLibraryFactory
npx jest CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js CoreUtilsLib/src/__tests__/LoggerService.test.js PipelineFramework/src/__tests__/Step.test.js PipelineFramework/src/__tests__/Pipeline.test.js SheetDBLib/src/__tests__/DatabaseService.test.js JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js JobRunnerLib/src/__tests__/JobDefinitionRegistry.test.js --runInBand
npm run build:testing -- --online-tests=false
npm test -- --runInBand
git diff --check
```

Expected: all focused tests, library build, and full library tests PASS. Stage only task files and commit:

```bash
git add CoreUtilsLib/src/internal/StructuredLogFormatter.js CoreUtilsLib/src/LoggerService.js CoreUtilsLib/src/testing/mocks.js CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js CoreUtilsLib/src/__tests__/LoggerService.test.js PipelineFramework/src/Step.js PipelineFramework/src/Pipeline.js PipelineFramework/src/__tests__/Step.test.js PipelineFramework/src/__tests__/Pipeline.test.js SheetDBLib/src/internal/database-managers/DatabaseConnectionManager.js SheetDBLib/src/__tests__/DatabaseService.test.js JobRunnerLib/src/internal/managers/JobRunnerExecutionController.js JobRunnerLib/src/internal/CapturingLogger.js JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js JobRunnerLib/src/__tests__/JobDefinitionRegistry.test.js
git commit -m "feat: add content-first pipeline observability"
```

---

### Task 2: ALDO document and email operational details

**Files:**
- Modify: `src/application/pipelines/documentSteps.ts`
- Modify: `src/application/pipelines/emailSteps.ts`
- Modify: `src/application/services/DocumentGenerationService.ts`
- Modify: `src/application/services/DocumentBatchService.ts`
- Modify: `src/application/services/EmailNotificationService.ts`
- Modify: `src/application/services/EmailBatchService.ts`
- Modify: `test/unit/application/pipelines/document-steps.test.ts`
- Modify: `test/unit/application/pipelines/email-steps.test.ts`
- Modify: `test/unit/application/document-generation-service.test.ts`
- Modify: `test/unit/application/document-batch-service.test.ts`
- Modify: `test/unit/application/email-notification-service.test.ts`
- Modify: `test/unit/application/email-batch-service.test.ts`

**Interfaces:**
- Consumes: `Step._getLogDetails(context)` and scoped/content-first rendering from Task 1.
- Produces: `DocumentGenerationResult = { fileId: string | null, fileName: string | null, fileLink: string | null, status: string, durationMs: number }`.
- Produces: `EmailTargetResult = { sent: number, errors: string[], skipped: boolean, recipients: string[], subject: string, durationMs: number }`.
- Produces: unredacted operational addresses in permission, recipient, send, and item-summary logs.
- Preserves: existing generator checkpoint shapes and progress percentages.

- [ ] **Step 1: Write failing document-step detail tests**

Execute each real step against a `PipelineContext` and assert exact hook output:

```ts
expect(new GenerateNameStep(logger, templates).execute(ctx).logDetails).toBe(
  'PDP_DSA_Rossi_Mario_2026'
);
expect(selectTemplate.execute(ctx).logDetails).toBe('1TemplateId');
expect(cloneTemplate.execute(ctx).logDetails).toBe('1GeneratedFileId');
expect(applyPermissions.execute(ctx).logDetails).toEqual({
  Editors: ['docente@example.edu'],
  Viewers: ['famiglia@example.edu']
});
expect(registerDocument.execute(ctx).logDetails).toBeNull();
```

Cover the full table from the spec: generation decision, duplicate/no-duplicate reason, folder name/path/ID, filename, template ID, cloned ID, generator/result count when already exposed, collected permission emails/counts, registration status only, and post-process count/action names.

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts --runInBand
```

Expected: FAIL because ALDO steps do not publish log details and permissions are not accumulated.

- [ ] **Step 2: Implement document-step details without extra API calls**

Override protected `_getLogDetails(ctx)` in each step using values already written to `PipelineContext`. During `ApplyPermissionsStep.applica()`, accumulate unique addresses by permission into context keys such as `permissionEditors` and `permissionViewers`; continue calling `drive.setPermission()` exactly once per resolved assignment. `SelectTemplate` returns `templateId`; `CloneTemplate` returns `newFileId`; `RegisterDocument` returns `null`.

For `RenderTemplate`, report the configured generator name unless its existing strategy result already supplies a rendered/replaced count. Do not scan the generated document to manufacture a count.

- [ ] **Step 3: Write failing email-step detail tests**

Assert:

```ts
expect(renderBoxes.execute(ctx).logDetails).toEqual({ Boxes: 3 });
expect(composeEmail.execute(ctx).logDetails).toEqual({
  Subject: 'Convocazione consiglio',
  Attachments: 2
});
expect(resolveRecipients.execute(ctx).logDetails).toEqual({
  To: ['docente@example.edu'],
  Cc: ['segreteria@example.edu']
});
expect(sendEmail.execute(ctx).logDetails).toEqual({
  Sent: 1,
  Recipients: ['docente@example.edu']
});
expect(logEmail.execute(ctx).logDetails).toBeNull();
```

Also cover build-CDU outcome, send-condition decision/reason, zero boxes, BCC supervisor/test-mode routing, send errors, and post-process action counts. Assert full HTML bodies never appear in details.

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts --runInBand
```

Expected: FAIL because email steps do not publish details.

- [ ] **Step 4: Implement email-step details and remove operational redaction**

Use existing context values: `boxHtmlOrdered.length`, `oggettoRisolto`, `allegatiIds.length`, `destinatariFinali`, `sentCount`, `sentTo`, and `sendErrors`. Store resolved CC/BCC arrays when sending so the detail hook can distinguish To/CC/BCC. Keep body content and blobs out of the returned detail record.

Remove `PiiRedactor.redact()` from document/email target and send-failure operational logs covered by this spec. Do not remove redaction from unrelated import/error paths.

- [ ] **Step 5: Write failing service and batch result tests**

Freeze `Date.now()` and assert exact result propagation:

```ts
expect(service.generateForPiano('user@example.edu', 'PDP_DSA', 'PIANI', 'job')).toEqual({
  fileId: '1GeneratedFileId',
  fileName: 'PDP_DSA_Rossi_Mario_2026',
  fileLink: 'https://docs.google.com/document/d/1GeneratedFileId/edit',
  status: 'GENERATO',
  durationMs: 8572
});

expect(email.sendToTarget('CONF_MAIL_1', target, 'job')).toEqual({
  sent: 1,
  errors: [],
  skipped: false,
  recipients: ['docente@example.edu'],
  subject: 'Convocazione consiglio',
  durationMs: 230
});
```

Drain the document/email generators and assert item summaries are content-first and timed:

```text
Document generated: PDP_DSA_Rossi_Mario_2026 (COMPLETED in 8572ms)
Email sent: Convocazione consiglio -> docente@example.edu (COMPLETED in 230ms)
```

Assert target headers show the real address, not `[EMAIL_REDACTED]`.

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts test/unit/application/document-batch-service.test.ts test/unit/application/email-notification-service.test.ts test/unit/application/email-batch-service.test.ts --runInBand
```

Expected: FAIL because service return types omit operational data/timing and batches emit no item-end summary.

- [ ] **Step 6: Implement typed item results and batch summaries**

Define the two interfaces beside their owning services and construct results directly from the completed `PipelineContext`; do not re-query Drive or Sheets. Time each service call with `Date.now()`. For skipped operations, return null/empty generated values truthfully and retain the measured duration.

In batch handlers, call `logger.logSummary()` after each item with content-first details and a final item tree position. Progress-monitor messages should reuse the same result name/subject/recipient data. Preserve checkpoint state and exception collection.

- [ ] **Step 7: Verify and commit the ALDO task**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts test/unit/application/pipelines/email-steps.test.ts test/unit/application/document-generation-service.test.ts test/unit/application/document-batch-service.test.ts test/unit/application/email-notification-service.test.ts test/unit/application/email-batch-service.test.ts --runInBand
npm run typecheck
npm run lint
git diff --check
```

Expected: focused tests, typecheck, lint, and whitespace checks PASS. Stage only task files and commit:

```bash
git add src/application/pipelines/documentSteps.ts src/application/pipelines/emailSteps.ts src/application/services/DocumentGenerationService.ts src/application/services/DocumentBatchService.ts src/application/services/EmailNotificationService.ts src/application/services/EmailBatchService.ts test/unit/application/pipelines/document-steps.test.ts test/unit/application/pipelines/email-steps.test.ts test/unit/application/document-generation-service.test.ts test/unit/application/document-batch-service.test.ts test/unit/application/email-notification-service.test.ts test/unit/application/email-batch-service.test.ts
git commit -m "feat: expose document and email pipeline results"
```

---

### Task 3: Contracts, vendor refresh, regression verification, and graph audit

**Files:**
- Modify: `GasLibraryFactory/DOCS_LIBS/CoreUtilsLib.md`
- Modify: `GasLibraryFactory/DOCS_LIBS/PipelineFramework.md`
- Modify: `GasLibraryFactory/DOCS_LIBS/SheetDBLib.md`
- Modify: `GasLibraryFactory/DOCS_LIBS/JobRunnerLib.md`
- Modify: `types/gaslibs/index.d.ts`
- Modify generated vendor files: `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`
- Modify: `test/unit/harness/gaslibs.test.ts`
- Create: `test/integration/pipeline-observability-persistence.test.ts`

**Interfaces:**
- Consumes: all Task 1 library APIs and Task 2 ALDO result types.
- Produces: vendored runtime/type parity for `withPosition`, `_getLogDetails`/step results, and content-first semantic formatting.
- Verifies: persistent `LOG_FOLD`, `LOG_DOCS`, and `LOG_MAIL` writes through the real SheetDbAdapter/SheetDBLib flush seam.

- [ ] **Step 1: Update library docs and generated API contracts**

Run the repository's supported documentation generation command:

```bash
cd GasLibraryFactory
npm run docs
```

Then verify the four affected `DOCS_LIBS` files describe:

```ts
withPosition<T>(position: TreePosition, callback: () => T): T;

type PipelineStepDetails = {
  content?: LogDetails;
  durationMs?: number;
  reason?: string;
};

type LogDetailScalar = string | number | boolean | null | undefined;
type LogDetails =
  | string
  | LogDetailScalar[]
  | Record<string, LogDetailScalar | LogDetailScalar[]>;
```

Ensure transaction documentation states that successful `commit()` drains table queues, and JobRunner documentation states definitions are optional for dynamic jobs. Commit only relevant generated documentation:

```bash
cd GasLibraryFactory
git add DOCS_LIBS/CoreUtilsLib.md DOCS_LIBS/PipelineFramework.md DOCS_LIBS/SheetDBLib.md DOCS_LIBS/JobRunnerLib.md
git commit -m "docs: publish pipeline observability contracts"
```

- [ ] **Step 2: Write the failing vendored runtime/type contract test**

Extend `test/unit/harness/gaslibs.test.ts` to instantiate the vendored logger, assert `withPosition` exists and returns its callback value, and exercise a content-first `logPipelineStep`. Update `types/gaslibs/index.d.ts` with exact `TreePosition`, `PipelineStepDetails`, `LoggerService.withPosition`, and step-result declarations used by ALDO.

Run:

```bash
npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts --runInBand
npm run typecheck
```

Expected before vendor refresh: runtime test FAILS because `vendor/gaslibs.Code.js` lacks the new method; after declaration edits, typecheck must describe the intended API without `any`.

- [ ] **Step 3: Build and refresh the vendor bundle**

Run:

```bash
cd GasLibraryFactory
npm run build:testing -- --online-tests=false
cd ..
npm run refresh:vendor
npm run verify:vendor
npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts --runInBand
npm run typecheck
```

Expected: vendor verification, runtime contract test, and typecheck PASS. Commit the root contract/vendor files:

```bash
git add types/gaslibs/index.d.ts vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION test/unit/harness/gaslibs.test.ts GasLibraryFactory
git commit -m "chore: vendor pipeline observability fixes"
```

- [ ] **Step 4: Add a persistence-and-output integration regression**

Use `SheetDbAdapter` with the existing SheetDB test seam to execute one document and one email pipeline. Assert pending inserts are flushed on commit and the output contains:

```text
[GenerateName] PDP_DSA_Rossi_Mario_2026 (EXECUTED in
[SelectTemplate] 1TemplateId (EXECUTED in
[CloneTemplate] 1GeneratedFileId (EXECUTED in
[ApplyPermissions] Editors: docente@example.edu
[RenderBoxes] Boxes:
[ResolveRecipients] To: docente@example.edu
```

Also assert `LOG_FOLD`, `LOG_DOCS`, and `LOG_MAIL` received their rows; `gen_PIANI_CUSTOMIZZATI` emits no `JobDefinitionRegistry.getDefinition` error; job completion contains total duration; and nested `Transaction`, template-engine, and batch-update lines begin with a tree prefix.

Run the exact new integration file with:

```bash
npx jest --config jest.integration.config.cjs test/integration/pipeline-observability-persistence.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run complete sequential verification**

Run builds and tests sequentially because builds clean shared `dist/` output:

```bash
npm run verify:vendor
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:integration -- --runInBand
npm run test:build -- --runInBand
npm run build:testing
npm run build:testoffline
npm run build:production
npm run build:online
git diff --check
```

In `GasLibraryFactory`, run:

```bash
npm run build:testing -- --online-tests=false
npm test -- --runInBand
git diff --check
```

Expected: all commands PASS. If the known library production build still lacks `terser-webpack-plugin`, report that pre-existing dependency gap without adding a dependency outside this plan.

- [ ] **Step 6: Refresh indexes and perform mandatory graph audits**

Run `index_repository(mode="full")` for the ALDO root and GasLibraryFactory repositories. Then use `query_graph`, `search_graph`, `trace_path`, and `get_architecture` to verify:

1. no ALDO source module directly calls native GAS globals;
2. no non-trigger ALDO function/method has zero inbound `CALLS` edges without an intentional external-entry justification;
3. ALDO calls resolve to the exact new logger/pipeline signatures;
4. `DocumentBatchService` and `EmailBatchService` reach their detail-producing steps and commit paths;
5. no new two-node or three-node import cycle exists;
6. dependencies, boundaries, layers, clusters, and hotspots show no new architectural violation.

Expected: zero native-service bypasses, zero unexplained dead nodes, valid linkage, and zero new cycles.

- [ ] **Step 7: Inspect final diffs and commit remaining regression coverage**

Run:

```bash
git status --short
git diff --check
git diff --cached --check
git -C GasLibraryFactory status --short
```

Confirm unrelated user changes remain unstaged. Stage only the integration test or final task-owned corrections not already committed:

```bash
git add test/integration/pipeline-observability-persistence.test.ts
git commit -m "test: cover pipeline output and persistence end to end"
```

Record the root and nested repository commit hashes in the completion report.
