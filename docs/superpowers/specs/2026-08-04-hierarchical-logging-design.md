# Hierarchical Logging Framework Design

## Goal

Refactor logging across every GasLibraryFactory library and every ALDO flow into a clean,
hierarchical console layout. Logs must expose job lifecycle, resumptions, batches, items,
pipeline steps, skipped conditions, failures, and aggregate timings without changing business
control flow.

## Scope

- Extend the existing `CoreUtilsLib.LoggerService`; do not create an ALDO-local duplicate.
- Make the new formatting the default for the entire GasLibraryFactory.
- Cover ALDO document, email, import, retry, UI, and online-test logs.
- Extend `ContextEngine`, `PipelineFramework`, and `JobRunnerLib` at their existing orchestration
  boundaries.
- Preserve PII redaction before messages reach the renderer.
- Preserve Google Apps Script V8 compatibility and synchronous execution.

## Chosen Architecture

Use stateless, explicit structured events. Orchestrators provide semantic data and tree-position
metadata to `LoggerService`; the logger renders deterministic lines immediately. No logger scope
stack or end-of-job event buffer is introduced.

This approach remains safe when errors interrupt execution or `JobRunnerLib` resumes in a new GAS
invocation. It also keeps logs live in the Apps Script execution console.

### Core Components

1. `CoreUtilsLib.LoggerService`
   - Owns borders, indentation, branch rendering, icons, status labels, safe detail formatting, and
     output dispatch.
   - Keeps `debug`, `info`, `warn`, `error`, `log`, `child`, log-level filtering, and lazy evaluation
     backward compatible.
   - Applies consistent `[DEBUG]`, `[INFO]`, `[WARN]`, and `[ERROR]` formatting to ordinary logs.

2. `ContextEngine.ContextAssembler`
   - Counts executed, skipped, and failed providers at assembly orchestration level.
   - Removes routine per-provider completion and condition-skip messages.
   - Emits one context-assembly summary containing total duration and counts.
   - Emits provider failures immediately before preserving current exception behavior.

3. `PipelineFramework.Pipeline`
   - Uses existing `PipelineContext` execution history, status, duration, skip reason, and totals.
   - Emits pipeline start, one structured line per step, and one completion summary.
   - Does not add a second timing or step-history mechanism.

4. `JobRunnerLib`
   - Owns the outer job lifecycle blocks: initialization, resumption, suspension, failure, and final
     completion.
   - Prints a fresh resume header for each resumed GAS invocation, including checkpoint/progress.
   - Prints a completion footer only after the entire job finishes.

5. ALDO orchestration
   - Batch services emit batch and item events around existing document, email, import, and retry
     operations.
   - UI and online-test flows use the same logger API for initialization and summaries.
   - Domain and persistence behavior remain unchanged.

## Public API

The exact JavaScript implementation may use JSDoc types; ALDO's ambient TypeScript declaration
must expose equivalent signatures.

```ts
type LogItemKind = 'DOCUMENT' | 'EMAIL' | 'IMPORT' | 'RETRY' | 'GENERIC';
type PipelineStepStatus = 'EXECUTED' | 'SKIPPED' | 'ERROR';

interface TreePosition {
  depth: number;
  isLast: boolean;
  ancestorHasNext?: boolean[];
}

interface JobResumeDetails {
  checkpoint?: string;
  percentage?: number;
}

type LogDetails =
  | string
  | string[]
  | Record<string, string | number | boolean | null | undefined>;

class LoggerService {
  logJobStart(jobName: string, jobType: string): this;
  logJobResume(jobName: string, jobType: string, details?: JobResumeDetails): this;
  logJobEnd(jobName: string, isSuccess: boolean, details?: LogDetails): this;
  logJobSuspended(jobName: string, details?: LogDetails): this;
  logBatchStart(totalItems: number, label?: string): this;
  logItemStart(
    itemIndex: number,
    totalItems: number,
    itemLabel: string,
    identifier: string,
    kind?: LogItemKind
  ): this;
  logStep(message: string, position: TreePosition): this;
  logPipelineStart(
    pipelineName: string,
    totalSteps: number,
    position: TreePosition
  ): this;
  logPipelineStep(
    stepName: string,
    status: PipelineStepStatus,
    details: LogDetails | undefined,
    position: TreePosition
  ): this;
  logSummary(
    label: string,
    durationMs: number,
    itemDetails?: LogDetails,
    position?: TreePosition
  ): this;
}
```

`ancestorHasNext` is required when an ancestor has later siblings. It lets the stateless renderer
choose between continuation segments and blank indentation while still producing exact `│`, `├─`,
and `└─` structure.

## Formatting Contract

- Major borders contain exactly 70 `=` characters.
- Section borders contain exactly 70 `-` characters.
- Job initialization uses `🚀 [INIT]`.
- Job resumption uses `🔄 [RESUME]`.
- Successful completion uses `🏁 [COMPLETED]`.
- Failed completion uses `❌ [FAILED]`.
- Timeout or intentional continuation uses `⏸️ [SUSPENDED]`.
- Batch items use `📄` for documents, `✉️` for email, `📥` for imports, `🔁` for retries, and `📦`
  for generic work.
- Context assembly uses `⚙️`; pipelines use `🛠️`; executed steps use `✅`; skipped steps and warnings
  use `⚠️`; errors use `❌`; pipeline completion uses `⏹️`.
- Each tree depth adds two spaces plus the required ancestor continuation segments.
- Every rendered line is sent immediately as one physical console call.
- Multiline details repeat the correct indentation and never break the visible tree.
- Malformed optional details degrade to safe text; formatting must never throw.

Representative output:

```text
======================================================================
🚀 [INIT] AVVIO JOB: mail_E2E_MAIL_PIANI (Tipo: INVIO_EMAIL_BATCH)
======================================================================
[INFO] [ImportEngine] Initialized successfully
----------------------------------------------------------------------

📑 [PROCESSING BATCH] (3 Items in queue)

✉️ [EMAIL 1/3] Target: Class Context Assembly
  ├─ ⚙️ Context Assembly completed in 79ms (6 providers executed, 0 skipped)
  ├─ 🛠️ [NotificaPipeline] Processing (8 steps)
  │    ├─ ⚠️ [ComposeEmail]: SKIPPED (condition not met)
  │    └─ ✅ [ResolveRecipients]: EXECUTED in 12ms
  └─ ⏹️ Pipeline completed in 2599ms (No email sent)

======================================================================
🏁 [COMPLETED] Job 'mail_E2E_MAIL_PIANI' completed successfully
======================================================================
```

## Aggregation Rules

- Routine provider success and condition-skip entries are counted, not individually printed.
- Context assembly prints duration plus executed, skipped, and failed provider counts.
- A provider error remains visible immediately; its message is not repeated by every parent layer.
- Each pipeline step remains visible because step-level decisions are operationally meaningful.
- A pipeline footer reports duration and outcome such as sent, generated, skipped, stopped, or failed.
- Parent layers summarize child failure counts instead of duplicating full error messages or stacks.

## Resume and Completion Semantics

- A first invocation prints one `INIT` block.
- Every trigger-driven continuation prints a new `RESUME` block with available checkpoint and
  percentage.
- Timeout persistence prints `SUSPENDED`, not `COMPLETED`.
- Cancellation and permanent errors use explicit terminal status blocks.
- Only a fully exhausted generator prints `COMPLETED`.
- Existing checkpoint persistence, locks, triggers, retry rules, quota suspension, and return values
  remain unchanged.

## Error Handling

Logging is observational. It must not alter retry, skip, timeout, checkpoint, return, or exception
semantics. Errors are logged at the nearest meaningful boundary, then existing wrapping or rethrowing
continues. Safe rendering prevents logging failures from masking business failures.

## Testing Strategy

Use strict red-green-refactor cycles for each behavior.

1. Core renderer tests assert exact output for borders, icons, indentation, ancestor continuation,
   last-child branches, multiline details, malformed details, lazy evaluation, and log filtering.
2. ContextEngine tests prove provider success/skip logs are aggregated, counts are correct in both
   normal and mutate modes, failures remain visible, and exception behavior is unchanged.
3. PipelineFramework tests prove executed/skipped/error status mapping, skip reasons, durations,
   branch placement, stop behavior, and summary totals.
4. JobRunnerLib tests prove init, resume, suspension, cancellation, failure, and completion blocks,
   including the rule that resumed/suspended jobs do not print false completion.
5. ALDO unit and integration tests cover document, email, import, retry, UI, and online-test flows.
6. Verification includes GasLibraryFactory tests/build, vendor refresh and verification, ALDO unit,
   integration, and build tests, typecheck, lint, all GAS build modes, and knowledge-graph checks for
   native GAS bypasses, dead code, linkage, and architecture regressions.

## Compatibility and Migration

- Existing logger construction and basic methods remain valid.
- New methods return `this`, matching the current fluent API.
- Library mocks gain the same semantic methods and retain recorded-log inspection helpers.
- ALDO's `types/gaslibs/index.d.ts` changes with the exported library API.
- ALDO consumes a refreshed built vendor bundle; generated `dist/` files are never edited directly.
- Existing user changes in the working tree must be preserved and reconciled file by file during
  implementation.

## Out of Scope

- Remote log shipping, dashboards, JSON telemetry, or asynchronous transports.
- Persisting a complete visual tree across GAS invocations.
- Changing domain behavior, job checkpoint schemas, email/document results, or PII policy.
