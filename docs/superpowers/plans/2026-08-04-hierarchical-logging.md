# Hierarchical Logging Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce hierarchical, aggregated, resumable console logs across GasLibraryFactory and every ALDO execution flow.

**Architecture:** Extend the existing L0 `LoggerService` with a pure structured formatter and immediate line emission. Context, pipeline, and job orchestrators emit explicit semantic events with stateless `TreePosition` metadata; ALDO supplies item-level positions and labels while retaining current business behavior.

**Tech Stack:** Google Apps Script V8, ES modules, JavaScript/JSDoc, TypeScript ambient declarations, Jest, Webpack, Babel, codebase-memory-mcp.

## Global Constraints

- Work spans two repositories: commit library source inside `GasLibraryFactory/`; commit ALDO source and `vendor/` in workspace root.
- Preserve all existing dirty changes. Stage explicit files only; never stage `.codebase-memory/artifact.json` or `.codebase-memory/graph.db.zst`.
- Read only `GasLibraryFactory/DOCS_LIBS` for ordinary library discovery; use graph snippets only for exact implementation boundaries.
- Never edit either repository's generated `dist/` files.
- Keep execution synchronous and compatible with GAS V8/Chrome 80 transpilation.
- Keep `debug`, `info`, `warn`, `error`, `log`, `child`, level filtering, and lazy evaluation backward compatible.
- Keep custom basic loggers working through semantic-method fallbacks.
- Preserve PII redaction before rendering identifiers or error details.
- Logging must not change pipeline, retry, timeout, checkpoint, quota, lock, trigger, return-value, or exception semantics.
- Major and section borders contain exactly 70 characters.

---

### Task 1: Core structured formatter and `LoggerService` API

**Files:**

- Create: `GasLibraryFactory/CoreUtilsLib/src/internal/StructuredLogFormatter.js`
- Create: `GasLibraryFactory/CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/LoggerService.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/__tests__/LoggerService.test.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/src/testing/mocks.js`

**Interfaces:**

- Consumes: existing GAS `Logger.log(string)` transport and `LoggerService._safeStringify(value)`.
- Produces: `TreePosition`, `LogDetails`, and fluent methods `logJobStart`, `logJobResume`, `logJobEnd`, `logJobSuspended`, `logBatchStart`, `logItemStart`, `logStep`, `logPipelineStart`, `logPipelineStep`, `logSummary`.

- [ ] **Step 1: Write failing pure-renderer tests**

Create literal expectations independent of formatter helpers:

```js
expect(formatter.treePrefix({ depth: 2, isLast: false, ancestorHasNext: [true] })).toBe(
  '  │    ├─ '
);
expect(formatter.treePrefix({ depth: 2, isLast: true, ancestorHasNext: [true] })).toBe(
  '  │    └─ '
);
expect(formatter.jobStart('mail_E2E', 'INVIO_EMAIL_BATCH')).toEqual([
  '======================================================================',
  '🚀 [INIT] AVVIO JOB: mail_E2E (Tipo: INVIO_EMAIL_BATCH)',
  '======================================================================'
]);
expect(formatter.batchStart(3)).toEqual([
  '----------------------------------------------------------------------',
  '',
  '📑 [PROCESSING BATCH] (3 Items in queue)'
]);
expect(
  formatter.pipelineStep('ComposeEmail', 'SKIPPED', 'condition not met', {
    depth: 2,
    isLast: true,
    ancestorHasNext: [true]
  })
).toEqual(['  │    └─ ⚠️ [ComposeEmail]: SKIPPED (condition not met)']);
```

Also cover: zero/negative depth normalization, short `ancestorHasNext`, multiline details, circular object details, all item icons, singular/plural batch labels, resume header details, failed job footer, suspended footer, blank-line placement, and exact 70-character borders.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```bash
cd GasLibraryFactory
npx jest CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js --runInBand
```

Expected: FAIL because `StructuredLogFormatter.js` does not exist.

- [ ] **Step 3: Implement pure formatter**

Implement focused helpers and constants:

```js
const MAJOR_BORDER = '='.repeat(70);
const SECTION_BORDER = '-'.repeat(70);
const ITEM_ICONS = {
  DOCUMENT: '📄',
  EMAIL: '✉️',
  IMPORT: '📥',
  RETRY: '🔁',
  GENERIC: '📦'
};

export class StructuredLogFormatter {
  constructor(safeStringify) {
    this._safeStringify = safeStringify;
  }

  treePrefix(position = {}) {
    const depth = Math.max(0, Number.isFinite(position.depth) ? position.depth : 0);
    if (depth === 0) return '';
    const ancestors = Array.isArray(position.ancestorHasNext) ? position.ancestorHasNext : [];
    let prefix = '  ';
    for (let index = 0; index < depth - 1; index++) {
      prefix += ancestors[index] ? '│    ' : '     ';
    }
    return prefix + (position.isLast ? '└─ ' : '├─ ');
  }
}
```

Return arrays of final strings from every public formatter method. Normalize unknown item/status values to generic icons and safe text. Split multiline content and repeat its tree indentation.

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run same Jest command. Expected: PASS.

- [ ] **Step 5: Write failing `LoggerService` emission/API tests**

Add tests proving one `Logger.log` call per rendered line, fluent returns, level filtering, malformed details safety, and semantic proxies on `child()`:

```js
const logger = new LoggerService({ level: 'INFO' });
expect(logger.logJobStart('job-1', 'TYPE')).toBe(logger);
expect(Logger.log.mock.calls.map(([line]) => line)).toEqual([
  '======================================================================',
  '🚀 [INIT] AVVIO JOB: job-1 (Tipo: TYPE)',
  '======================================================================'
]);
```

- [ ] **Step 6: Run `LoggerService` tests and verify RED**

```bash
cd GasLibraryFactory
npx jest CoreUtilsLib/src/__tests__/LoggerService.test.js --runInBand
```

Expected: FAIL with `logger.logJobStart is not a function`.

- [ ] **Step 7: Implement semantic methods and mocks**

Construct `StructuredLogFormatter` with `this._safeStringify.bind(this)`. Centralize emission:

```js
_writeStructured(level, lines) {
  if (!this._isLevelActive(level)) return this;
  for (const line of lines) Logger.log(line);
  return this;
}

logPipelineStep(stepName, status, details, position) {
  const level = status === 'ERROR' ? 'ERROR' : status === 'SKIPPED' ? 'WARN' : 'INFO';
  return this._writeStructured(
    level,
    this._structured.pipelineStep(stepName, status, details, position)
  );
}
```

Add every semantic method to `LoggerServiceMock` as `jest.fn().mockReturnThis()`. Extend `child()` with semantic proxies that preserve semantic layout and prefix labels only where a label exists.

- [ ] **Step 8: Run all CoreUtils logger tests**

```bash
cd GasLibraryFactory
npx jest CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js CoreUtilsLib/src/__tests__/LoggerService.test.js CoreUtilsLib/src/__tests__/LoggerService.lazy-evaluation.test.js --runInBand
```

Expected: PASS with no warnings.

- [ ] **Step 9: Commit Task 1 inside library repository**

```bash
cd GasLibraryFactory
git add CoreUtilsLib/src/internal/StructuredLogFormatter.js CoreUtilsLib/src/__tests__/StructuredLogFormatter.test.js CoreUtilsLib/src/LoggerService.js CoreUtilsLib/src/__tests__/LoggerService.test.js CoreUtilsLib/src/testing/mocks.js
git diff --cached --check
git commit -m "feat(CoreUtilsLib): add hierarchical logging API"
```

---

### Task 2: Aggregate `ContextEngine` provider logs

**Files:**

- Modify: `GasLibraryFactory/ContextEngine/src/internal/ContextStepExecutor.js`
- Modify: `GasLibraryFactory/ContextEngine/src/__tests__/internal/ContextStepExecutor.test.js`

**Interfaces:**

- Consumes: `LoggerService.logSummary(label, durationMs, details, position)` and optional `options.logPosition`.
- Produces: one assembly summary per successful `assemble`/`assembleInto`; one contextual error line per failure.

- [ ] **Step 1: Replace old expectations with failing aggregation tests**

Use fixed `Date.now()` values. Assert real observable log events:

```js
expect(facade._logger.logSummary).toHaveBeenCalledWith(
  '⚙️ Context Assembly completed',
  79,
  '2 providers executed, 1 skipped, 0 failed',
  { depth: 1, isLast: false, ancestorHasNext: [] }
);
expect(facade._logger.info).not.toHaveBeenCalledWith(
  expect.stringContaining('Provider execution completed')
);
expect(facade._logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Skipped'));
```

Add equivalent mutate-mode case and failure case proving `ContextEngineError` is rethrown while only one provider error is emitted.

- [ ] **Step 2: Run ContextStepExecutor tests and verify RED**

```bash
cd GasLibraryFactory
npx jest ContextEngine/src/__tests__/internal/ContextStepExecutor.test.js --runInBand
```

Expected: FAIL because routine provider logs still exist and `logSummary` is not called.

- [ ] **Step 3: Implement counters and compatibility fallback**

Remove routine success lines from `_executeProvider` and `_executeMutatingProvider`. Remove per-provider condition-skip info lines. Track `executedProviders`, `skippedProviders`, `failedProviders` in each assembly path.

Use semantic API when present and preserve custom basic logger support:

```js
const details =
  `${executedProviders} providers executed, ` +
  `${skippedProviders} skipped, ${failedProviders} failed`;
if (typeof this.facade._logger.logSummary === 'function') {
  this.facade._logger.logSummary(
    '⚙️ Context Assembly completed',
    durationMs,
    details,
    options.logPosition
  );
} else {
  this.facade._logger.info(`Context assembly completed in ${durationMs}ms (${details})`);
}
```

When a provider fails, increment failure count and emit one message containing duration and all counts. In the outer catch, do not log the same `ContextEngineError` again; only log parser/validation/unknown assembly errors there.

- [ ] **Step 4: Run ContextEngine tests and verify GREEN**

```bash
cd GasLibraryFactory
npx jest ContextEngine/src/__tests__/internal/ContextStepExecutor.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2 inside library repository**

```bash
cd GasLibraryFactory
git add ContextEngine/src/internal/ContextStepExecutor.js ContextEngine/src/__tests__/internal/ContextStepExecutor.test.js
git diff --cached --check
git commit -m "refactor(ContextEngine): aggregate provider logs"
```

---

### Task 3: Trace pipeline steps without duplicate noise

**Files:**

- Modify: `GasLibraryFactory/PipelineFramework/src/Step.js`
- Modify: `GasLibraryFactory/PipelineFramework/src/Pipeline.js`
- Modify: `GasLibraryFactory/PipelineFramework/src/__tests__/Step.test.js`
- Modify: `GasLibraryFactory/PipelineFramework/src/__tests__/Pipeline.test.js`

**Interfaces:**

- Consumes: `PipelineContext.recordStepExecution`, `getSummary`, `getTotalDuration`; logger pipeline APIs; constructor option `logPosition`.
- Produces: `StepExecutionResult.skipReason`; ordered pipeline start, step, and summary events.

- [ ] **Step 1: Write failing `Step` result tests**

Assert skipped results carry a stable reason and no routine logger line:

```js
expect(result).toMatchObject({
  success: true,
  skipped: true,
  skipReason: 'condition not met'
});
expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Skipped'));
```

Assert errors remain in returned/thrown results without a duplicate `Step` error message; `Pipeline` becomes the structured logging boundary.

- [ ] **Step 2: Run Step tests and verify RED**

```bash
cd GasLibraryFactory
npx jest PipelineFramework/src/__tests__/Step.test.js --runInBand
```

Expected: FAIL because `skipReason` is absent and routine lines remain.

- [ ] **Step 3: Implement minimal `Step` result change**

Return `skipReason: 'condition not met'` for skipped steps. Remove routine skipped/executing/completed/error/continue lines from `Step.execute`; preserve result values, wrapping, `continueOnError`, and duration behavior.

- [ ] **Step 4: Run Step tests and verify GREEN**

Run same command. Expected: PASS.

- [ ] **Step 5: Write failing pipeline layout tests**

Configure `logPosition: { depth: 1, isLast: false, ancestorHasNext: [] }`. Assert:

```js
expect(logger.logPipelineStart).toHaveBeenCalledWith('NotificaPipeline', 3, {
  depth: 1,
  isLast: false,
  ancestorHasNext: []
});
expect(logger.logPipelineStep).toHaveBeenNthCalledWith(
  2,
  'ComposeEmail',
  'SKIPPED',
  'condition not met',
  { depth: 2, isLast: false, ancestorHasNext: [true] }
);
expect(logger.logSummary).toHaveBeenCalledWith(
  '⏹️ Pipeline completed',
  expect.any(Number),
  '2 executed, 1 skipped, 0 failed',
  { depth: 1, isLast: true, ancestorHasNext: [] }
);
```

Cover thrown failure, `continueOnError`, stop request, dry run, zero steps, and fallback basic logger.

- [ ] **Step 6: Run Pipeline tests and verify RED**

```bash
cd GasLibraryFactory
npx jest PipelineFramework/src/__tests__/Pipeline.test.js --runInBand
```

Expected: FAIL because pipeline uses flat `info` calls.

- [ ] **Step 7: Implement pipeline semantic events**

Store normalized base position from `options.logPosition`. Before loop call `logPipelineStart`. After each result/catch, record history first, then map status:

```js
const semanticStatus =
  status === 'completed' ? 'EXECUTED' : status === 'skipped' ? 'SKIPPED' : 'ERROR';
const details =
  status === 'skipped'
    ? result.skipReason || 'condition not met'
    : status === 'failed'
      ? result.error?.message || 'step failed'
      : `completed in ${result.durationMs || 0}ms`;
```

Step positions use `depth + 1`, last-step detection, and `ancestorHasNext: [...baseAncestors, true]`. Completion uses base depth with `isLast: true`. Add private semantic fallbacks that call existing `info/warn/error` methods when custom loggers lack new APIs.

- [ ] **Step 8: Run PipelineFramework tests**

```bash
cd GasLibraryFactory
npx jest PipelineFramework/src/__tests__/Step.test.js PipelineFramework/src/__tests__/Pipeline.test.js PipelineFramework/src/__tests__/PipelineContext.test.js PipelineFramework/src/__tests__/integration/ProducerConsumerPipeline.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3 inside library repository**

```bash
cd GasLibraryFactory
git add PipelineFramework/src/Step.js PipelineFramework/src/Pipeline.js PipelineFramework/src/__tests__/Step.test.js PipelineFramework/src/__tests__/Pipeline.test.js
git diff --cached --check
git commit -m "refactor(PipelineFramework): render structured step traces"
```

---

### Task 4: Render JobRunner lifecycle and preserve captured logs

**Files:**

- Modify: `GasLibraryFactory/JobRunnerLib/src/internal/CapturingLogger.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/internal/managers/JobRunnerExecutionController.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/JobQueue.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/__tests__/CapturingLogger.test.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/__tests__/JobRunnerService.test.js`
- Modify: `GasLibraryFactory/JobRunnerLib/src/__tests__/JobQueue.test.js`

**Interfaces:**

- Consumes: logger job APIs, `JobQueue.getStatus(jobName)`, persisted progress/resume state.
- Produces: correct `INIT`, `RESUME`, `SUSPENDED`, `FAILED`, cancelled, and `COMPLETED` terminal blocks.

- [ ] **Step 1: Write failing capture-forwarding tests**

For every semantic method, assert the call reaches the real logger, returns the capturing logger, and produces one capture record with method/status metadata. Example:

```js
expect(capturing.logJobStart('job-1', 'TYPE')).toBe(capturing);
expect(realLogger.logJobStart).toHaveBeenCalledWith('job-1', 'TYPE');
expect(capturing.getCapturedLogs()).toContainEqual(
  expect.objectContaining({ level: 'INFO', message: expect.stringContaining('job-1') })
);
```

- [ ] **Step 2: Run CapturingLogger tests and verify RED**

```bash
cd GasLibraryFactory
npx jest JobRunnerLib/src/__tests__/CapturingLogger.test.js --runInBand
```

Expected: FAIL because semantic methods are missing.

- [ ] **Step 3: Add semantic forwarding with basic-logger fallback**

Each method records a concise logical entry and delegates when supported. If wrapped logger lacks semantic method, forward an equivalent ordinary-level message. Keep buffer limits, HTML/text replay, and existing level behavior unchanged.

- [ ] **Step 4: Run capture tests and verify GREEN**

Run same command. Expected: PASS.

- [ ] **Step 5: Write failing lifecycle tests**

Add cases proving:

```js
expect(logger.logJobStart).toHaveBeenCalledWith('job-1', 'TYPE');
expect(logger.logJobResume).toHaveBeenCalledWith(
  'job-1',
  'TYPE',
  expect.objectContaining({ percentage: 40 })
);
expect(logger.logJobSuspended).toHaveBeenCalled();
expect(logger.logJobEnd).not.toHaveBeenCalledWith('job-1', true, expect.anything());
```

Cover final success, thrown error, timeout suspension, repeated suspension, pre-start cancellation, mid-run cancellation, and captured-logger mode.

- [ ] **Step 6: Run JobRunner tests and verify RED**

```bash
cd GasLibraryFactory
npx jest JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js JobRunnerLib/src/__tests__/JobRunnerService.test.js JobRunnerLib/src/__tests__/JobQueue.test.js --runInBand
```

Expected: FAIL because flat duplicate lifecycle messages remain.

- [ ] **Step 7: Implement outer lifecycle ownership**

In `run`, construct the effective/capturing logger first, then call `logJobStart`. In `resume`, load job type and persisted status/progress before `logJobResume`. Use available `resumeState.nextIndex`, `position`, or progress percentage as optional checkpoint details.

After `queue.execute`:

```js
const status = queue.getStatus(jobName);
if (status === 'cancelled') {
  effectiveLogger.logJobEnd(jobName, false, 'cancelled');
} else if (result === null) {
  effectiveLogger.logJobSuspended(jobName, 'state saved; automatic resume scheduled');
} else {
  effectiveLogger.logJobEnd(jobName, true);
}
```

Catch blocks call failed `logJobEnd` once, then rethrow exactly as before. Remove duplicate completion/timeout/cancellation lifecycle lines from `JobExecutor`; retain diagnostic calculations and unexpected internal warnings at basic levels.

- [ ] **Step 8: Run JobRunner regression tests**

```bash
cd GasLibraryFactory
npx jest JobRunnerLib/src/__tests__/CapturingLogger.test.js JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js JobRunnerLib/src/__tests__/JobRunnerService.test.js JobRunnerLib/src/__tests__/JobQueue.test.js JobRunnerLib/src/__tests__/integration/JobRunnerStateSerialization.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4 inside library repository**

```bash
cd GasLibraryFactory
git add JobRunnerLib/src/internal/CapturingLogger.js JobRunnerLib/src/internal/managers/JobRunnerExecutionController.js JobRunnerLib/src/JobQueue.js JobRunnerLib/src/__tests__/CapturingLogger.test.js JobRunnerLib/src/__tests__/JobRunnerService.logging.test.js JobRunnerLib/src/__tests__/JobRunnerService.test.js JobRunnerLib/src/__tests__/JobQueue.test.js
git diff --cached --check
git commit -m "refactor(JobRunnerLib): structure job lifecycle logs"
```

---

### Task 5: Regenerate library docs and verify GasLibraryFactory

**Files:**

- Modify generated docs under: `GasLibraryFactory/DOCS_LIBS/`

**Interfaces:**

- Consumes: source JSDoc from Tasks 1–4.
- Produces: authoritative documented semantic logger API and updated orchestrator docs.

- [ ] **Step 1: Generate docs**

```bash
cd GasLibraryFactory
npm run docs
```

Expected: `DOCS_LIBS/CoreUtilsLib.md`, `ContextEngine.md`, `PipelineFramework.md`, and `JobRunnerLib.md` describe new methods/options.

- [ ] **Step 2: Run library verification**

```bash
cd GasLibraryFactory
npm test
npm run lint
npm run build:testing -- --online-tests=false
```

Expected: all tests pass, lint exits 0, GAS-compatible bundle builds.

- [ ] **Step 3: Inspect generated scope and commit**

```bash
cd GasLibraryFactory
git status --short
git diff --check
git add DOCS_LIBS/CoreUtilsLib.md DOCS_LIBS/ContextEngine.md DOCS_LIBS/PipelineFramework.md DOCS_LIBS/JobRunnerLib.md
git diff --cached --check
git commit -m "docs: publish hierarchical logging API"
```

Do not stage `.codebase-memory/artifact.json`, `.codebase-memory/graph.db.zst`, or `dist/`.

---

### Task 6: Refresh ALDO vendor and ambient API

**Files:**

- Modify: `test/build/gaslibs-api.test.ts`
- Modify: `types/gaslibs/index.d.ts`
- Modify generated vendor files: `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`

**Interfaces:**

- Consumes: built GasLibraryFactory API.
- Produces: ALDO-visible `LoggerService` methods, `TreePosition`, status/item types, `ContextAssembler` log option, `Pipeline` log position option.

- [ ] **Step 1: Write failing vendored API test**

Add a runtime contract:

```ts
expect(typeof logger.logJobStart).toBe('function');
expect(typeof logger.logJobResume).toBe('function');
expect(typeof logger.logPipelineStep).toBe('function');
expect(typeof logger.logSummary).toBe('function');
```

- [ ] **Step 2: Run build API test and verify RED**

```bash
npx jest --config jest.build.config.cjs test/build/gaslibs-api.test.ts --runInBand
```

Expected: FAIL because current vendor lacks new methods.

- [ ] **Step 3: Refresh vendor**

```bash
npm run refresh:vendor
npm run verify:vendor
```

Expected: build succeeds and checksum verifies.

- [ ] **Step 4: Update ambient declarations**

Merge into current dirty `types/gaslibs/index.d.ts`; preserve unrelated user edits. Add exact design types and fluent signatures. Extend `Pipeline` options with `logPosition?: TreePosition`; type `ContextAssembler` call options as `Record<string, unknown> & { logPosition?: TreePosition }`.

- [ ] **Step 5: Run API/type verification**

```bash
npx jest --config jest.build.config.cjs test/build/gaslibs-api.test.ts --runInBand
npm run typecheck
npm run verify:vendor
```

Expected: PASS.

- [ ] **Step 6: Commit explicit ALDO files**

```bash
git add test/build/gaslibs-api.test.ts types/gaslibs/index.d.ts vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION
git diff --cached --check
git commit -m "chore: vendor hierarchical logging framework"
```

---

### Task 7: Add hierarchical document and email batch logs

**Files:**

- Modify: `src/application/services/DocumentBatchService.ts`
- Modify: `src/application/services/EmailBatchService.ts`
- Modify: `src/application/services/DocumentGenerationService.ts`
- Modify: `src/application/services/EmailNotificationService.ts`
- Modify: `src/application/context-engine/ContextBuilder.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `test/unit/application/document-batch-service.test.ts`
- Modify: `test/unit/application/email-batch-service.test.ts`
- Modify: `test/unit/application/document-generation-service.test.ts`
- Modify: `test/unit/application/email-notification-service.test.ts`
- Modify: `test/unit/config/bootstrap.test.ts`

**Interfaces:**

- Consumes: injected singleton `LoggerService`; batch/item APIs; pipeline/context `logPosition`.
- Produces: batch header, one item header per document/email, nested context/pipeline traces, redacted failures.

- [ ] **Step 1: Write failing document/email batch output tests**

Inject a real `LoggerService`, clear GAS logger before each case, run one-item generators to completion, then assert exact observable output fragments:

```ts
expect(Logger.getLog()).toContain('📑 [PROCESSING BATCH] (1 Item in queue)');
expect(Logger.getLog()).toContain('📄 [DOCUMENT 1/1]');
expect(Logger.getLog()).toContain('✉️ [EMAIL 1/1]');
expect(Logger.getLog()).not.toContain(rawStudentEmail);
```

Cover success, skipped outcome, caught item error, quota suspension, and resumed `nextIndex` without changing processed targets.

- [ ] **Step 2: Run batch tests and verify RED**

```bash
npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts test/unit/application/email-batch-service.test.ts --runInBand
```

Expected: FAIL because batch services do not emit structured items.

- [ ] **Step 3: Inject logger and emit batch/item events**

Merge carefully with existing dirty quota/resume/max-duration changes. Add logger as the final optional constructor dependency to preserve current positional callers; production `Bootstrap` always supplies the singleton.

At first/resumed handler entry, after target resolution:

```ts
this.logger?.logBatchStart(targets.length);
```

Before each item call:

```ts
this.logger?.logItemStart(i + 1, targets.length, 'Target', safeIdentifier, 'EMAIL');
```

Use `PiiRedactor.redact` for student/recipient identifiers and reasons. Document IDs/class labels may remain operational identifiers.

- [ ] **Step 4: Pass explicit nested positions**

Set context summary position in `ContextBuilder` calls to `{ depth: 1, isLast: false, ancestorHasNext: [] }`. Construct document/email pipelines with the same start position so steps render at depth 2 and completion renders as the item's last branch.

- [ ] **Step 5: Run batch and pipeline service tests**

```bash
npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts test/unit/application/email-batch-service.test.ts test/unit/application/document-generation-service.test.ts test/unit/application/email-notification-service.test.ts test/unit/config/bootstrap.test.ts --runInBand
```

Expected: PASS with existing result/checkpoint assertions unchanged.

- [ ] **Step 6: Commit explicit ALDO files**

```bash
git add src/application/services/DocumentBatchService.ts src/application/services/EmailBatchService.ts src/application/services/DocumentGenerationService.ts src/application/services/EmailNotificationService.ts src/application/context-engine/ContextBuilder.ts src/config/Bootstrap.ts test/unit/application/document-batch-service.test.ts test/unit/application/email-batch-service.test.ts test/unit/application/document-generation-service.test.ts test/unit/application/email-notification-service.test.ts test/unit/config/bootstrap.test.ts
git diff --cached --check
git commit -m "feat: structure document and email batch logs"
```

---

### Task 8: Cover imports, retries, UI, and online tests

**Files:**

- Modify: `src/application/services/ImportService.ts`
- Modify: `src/application/services/EmailRetryService.ts`
- Modify: `src/infrastructure/facades/UiFacade.ts`
- Modify: `src/onlinetests/index.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `test/unit/application/import-service.test.ts`
- Modify: `test/unit/application/email-retry-service.test.ts`
- Modify: `test/unit/infrastructure/ui-facade.test.ts`
- Modify: `test/unit/onlinetests/index.test.ts`
- Modify: `test/unit/config/bootstrap.test.ts`

**Interfaces:**

- Consumes: injected logger and existing import/retry/report results.
- Produces: lifecycle blocks for synchronous flows, batch/item lines for long retry flows, structured online-test summaries, level-formatted UI diagnostics.

- [ ] **Step 1: Write failing import and retry log tests**

Assert synchronous `executeAllActiveImports` emits `INIT`, import batch/items, and success/failure footer. Assert `retryFailed` does the same for retry groups. Assert JobRunner-backed `retryHandler` emits only batch/items because JobRunner owns outer lifecycle.

Use literal strings and retain all existing result assertions:

```ts
expect(Logger.getLog()).toContain('🚀 [INIT] AVVIO JOB: import_all (Tipo: IMPORT_BATCH)');
expect(Logger.getLog()).toContain('📥 [IMPORT 1/2]');
expect(Logger.getLog()).toContain('🔁 [RETRY 1/1]');
```

- [ ] **Step 2: Run import/retry tests and verify RED**

```bash
npx jest --config jest.config.cjs test/unit/application/import-service.test.ts test/unit/application/email-retry-service.test.ts --runInBand
```

Expected: FAIL because flat/no lifecycle logs remain.

- [ ] **Step 3: Implement import/retry boundaries**

Inject production logger through `Bootstrap`. Split import's public lifecycle wrapper from one private item execution path so `executeAllActiveImports` does not nest job headers. Preserve existing `ImportResult` and exception behavior.

Keep `EmailRetryOptions.logger` backward compatible; Bootstrap supplies the singleton. Replace `EmailRetry: avviato job...` with batch/item events and redact logical group identifiers.

- [ ] **Step 4: Run import/retry tests and verify GREEN**

Run same command. Expected: PASS.

- [ ] **Step 5: Write failing UI and online-test output tests**

Prove UI warnings/errors use default `[WARN]`/`[ERROR]` formatting. Prove `runOnlineTests` and `runE2eScenarios` no longer call native `Logger.log(JSON.stringify(report))`; their observable output contains start, report summary, and correct success/failure footer through `ServiceFactory.getLogger()`.

- [ ] **Step 6: Run UI/online tests and verify RED**

```bash
npx jest --config jest.config.cjs test/unit/infrastructure/ui-facade.test.ts test/unit/onlinetests/index.test.ts --runInBand
```

Expected: FAIL because report entry points still use direct flat output.

- [ ] **Step 7: Implement UI/online structured output**

Retain injected `log(message)` callbacks for scenario diagnostics. Replace direct final `Logger.log` calls with `LoggerService.logSummary` and `logJobEnd`. Derive `isSuccess` from report failure counts; never suppress returned reports or thrown setup failures.

- [ ] **Step 8: Run Task 8 regression tests**

```bash
npx jest --config jest.config.cjs test/unit/application/import-service.test.ts test/unit/application/email-retry-service.test.ts test/unit/infrastructure/ui-facade.test.ts test/unit/onlinetests/index.test.ts test/unit/config/bootstrap.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Audit remaining ALDO log sites**

Use `search_code` on `aldo-full-coverage` for `Starting job`, `completed successfully`, `Starting pipeline`, `Provider execution completed`, and direct `Logger.log` under `src/`. Classify each result: semantic lifecycle messages must use the new APIs; ordinary diagnostics remain on `debug/info/warn/error`. The only remaining direct native logging may be a documented online-test exception that cannot route through `ServiceFactory`; this task expects none in the modified online entry points.

- [ ] **Step 10: Commit explicit ALDO files**

```bash
git add src/application/services/ImportService.ts src/application/services/EmailRetryService.ts src/infrastructure/facades/UiFacade.ts src/onlinetests/index.ts src/config/Bootstrap.ts test/unit/application/import-service.test.ts test/unit/application/email-retry-service.test.ts test/unit/infrastructure/ui-facade.test.ts test/unit/onlinetests/index.test.ts test/unit/config/bootstrap.test.ts
git diff --cached --check
git commit -m "feat: structure remaining ALDO logs"
```

---

### Task 9: Full verification and knowledge-graph audit

**Files:**

- Modify only if a verification failure proves a defect in files already in scope.

**Interfaces:**

- Consumes: completed library and ALDO changes.
- Produces: verified GAS bundles and graph evidence for bypass, dead code, linkage, and architecture.

- [ ] **Step 1: Verify GasLibraryFactory from clean source state**

```bash
cd GasLibraryFactory
git status --short
npm test
npm run lint
npm run build:testing -- --online-tests=false
npm run build:production -- --online-tests=false
```

Expected: only pre-existing `.codebase-memory` modifications remain; all commands pass.

- [ ] **Step 2: Verify ALDO tests and all build modes**

```bash
npm run verify:vendor
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
npm run build:testing
npm run build:testoffline
npm run build:production
npm run build:online
```

Expected: every command exits 0; no generated `dist/` file is staged.

- [ ] **Step 3: Refresh graph indexes**

Use `index_repository` in `full` mode for:

```text
/home/giulio/Desktop/ALDO implementing/GasLibraryFactory
/home/giulio/Desktop/ALDO implementing
```

Do not stage generated graph artifacts.

- [ ] **Step 4: Run native GAS bypass query**

Run against `home-giulio-Desktop-ALDO-implementing`:

```cypher
MATCH (caller)-[:CALLS]->(callee)
WHERE caller.file_path STARTS WITH 'src/'
  AND callee.name IN [
    'DriveApp','SpreadsheetApp','DocumentApp','PropertiesService','CacheService',
    'UrlFetchApp','Utilities','Session','ScriptApp','LockService','MailApp'
  ]
RETURN caller.qualified_name, caller.file_path, callee.name
ORDER BY caller.file_path
```

Expected: no unsanctioned ALDO application calls.

- [ ] **Step 5: Run dead-code query and classify results**

Run against `aldo-full-coverage`:

```cypher
MATCH (f)
WHERE (f:Function OR f:Method)
  AND f.file_path STARTS WITH 'src/'
  AND NOT f.name IN ['doGet','onOpen','resumeJob','runOnlineTests','runE2eScenarios']
  AND NOT (()-[:CALLS]->(f))
RETURN f.qualified_name, f.file_path, f.is_exported
ORDER BY f.file_path, f.qualified_name
```

Review exported GAS callbacks separately. New unreferenced logger integration helpers are defects.

- [ ] **Step 6: Verify linkage and architecture**

Use `search_graph` for every new `LoggerService.log*` method in both indexes, `trace_path` inbound from ALDO batch/import/retry/online entry points, and `get_architecture` with `dependencies`, `boundaries`, `layers`, `clusters`, and `hotspots`.

Expected: ALDO calls resolve to exact vendored signatures; no new cycles or native-service boundary leaks.

- [ ] **Step 7: Inspect both repositories and final diffs**

```bash
git -C GasLibraryFactory status --short
git status --short
git diff --check
git log -5 --oneline
git -C GasLibraryFactory log -5 --oneline
```

Expected: user-owned unrelated changes remain intact; task commits contain only planned files.
