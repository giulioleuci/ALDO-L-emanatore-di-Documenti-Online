# Pipeline Observability and Persistence Design

**Date:** 2026-08-04

## Goal

Make document-generation and email-sending executions operationally complete in the Apps Script log. Every pipeline step must report its useful result data, every nested message must retain its place in the hierarchy, item and job completion must include elapsed time, generated folder/document records must be durably committed, and valid dynamic job names must not produce registry errors.

The logs are intended for authorized ALDO personnel. Operational email addresses may therefore be emitted without redaction. Credentials, tokens, complete CDU payloads, and unrelated sensitive values remain excluded.

## Confirmed Root Causes

1. `SheetDBLib` table mutations are queued by `TableDataModifier.insertRows()`. `DatabaseConnectionManager.commit()` currently calls only the low-level spreadsheet batch flush and never flushes each table's insert/update/delete queues. The transaction can consequently report success without persisting `LOG_FOLD` or `LOG_DOCS` rows.
2. `JobRunnerExecutionController.run()` treats a job definition as optional but calls `JobDefinitionRegistry.getDefinition()` unconditionally. That method logs a missing definition as an error, so valid dynamic names such as `gen_PIANI_PERSONALIZZATI` or `gen_PIANI_CUSTOMIZZATI` produce false errors.
3. ALDO's document-generation service returns only `fileId` and `status`, discarding the generated name, link, and other pipeline result data still present in `PipelineContext`.
4. Pipeline logging currently records only status and duration. It has no contract through which a step can publish a small, structured summary of its output.
5. Ordinary `info`/`warn`/`error` messages emitted by nested libraries have no inherited tree position, so transaction, template, and Google API messages appear at the root level.
6. Job terminal logging does not receive the job's elapsed time.

## Architecture

### Structured step results

`PipelineFramework.Step` will define an optional protected result-details hook that receives the completed `PipelineContext` and returns a flat record of display-safe values. The pipeline calls this hook after successful execution and renders the returned values immediately after the step name. Status and duration are trailing metadata in parentheses; the renderer will not inspect or diff the entire `PipelineContext`.

The formatter is content-first whenever details exist:

- success with details: `[GenerateName]: Name: PDP_DSA_Rossi_Mario_2026 (EXECUTED in 0ms)`;
- success without details: `[AnalyzeContext]: EXECUTED in 0ms`;
- skipped: `[ApplyPermissions]: Condition not met (SKIPPED)`;
- failed: `[CloneTemplate]: Drive copy failed (FAILED in 120ms)`.

This ordering makes the operational result scannable while preserving status and timing for diagnostics. The same content-first rule applies to context, pipeline, item, and job summaries whenever they contain result details.

The contract accepts scalars and short scalar arrays only. Undefined values and empty arrays are omitted. Objects containing arbitrary domain state are rejected or safely summarized, preventing accidental CDU dumps. Steps that produce no useful result retain the existing concise line.

ALDO document and email steps will explicitly select their operational outputs. Expected summaries include:

| Pipeline step | Basic result data |
| --- | --- |
| `AnalyzeContext` / `BuildCDU` | target type and recipe/context outcome summary |
| `CheckDuplicates` | duplicate found/not found and reused document ID when applicable |
| `PrepareInfrastructure` | destination folder name, path, and ID |
| `GenerateName` | generated filename |
| `SelectTemplate` | selected template name or ID |
| `CloneTemplate` | new file ID and Drive link |
| `RenderTemplate` | rendered/replaced element count when the underlying strategy exposes it |
| `ApplyPermissions` | editor and viewer email addresses, plus permission counts |
| `RegisterDocument` | `LOG_DOCS` ID and registration status |
| `PostProcess` | executed action count and action names |
| `ValutaCondizioniInvio` | send/skip decision and reason |
| `RenderBoxes` | number of boxes generated and their identifiers when available |
| `ComposeEmail` | subject and body/attachment summary, not full body contents |
| `ResolveRecipients` | To, CC, and BCC addresses |
| `SendEmail` | delivery result and message/thread identifier when available |
| `LogEmail` | `LOG_MAIL` registration ID and status |
| `PostProcessEmail` | executed action count and action names |

If an underlying library does not currently expose a useful count or identifier, the step reports the closest truthful value already available. It must not fabricate a value or perform a second API call solely for logging.

### Result propagation

Document generation will return a typed result containing at least status, file ID, filename, Drive link, and elapsed time. Batch handlers will log an item-completion summary and use the same result in progress-monitor messages. Email sending will expose an equivalent concise result containing recipients, subject, send/skip status, and elapsed time.

This is result propagation, not a second persistence or Drive lookup. Data originates in the step that creates or resolves it, is stored in `PipelineContext`, and is selected once for both the step log and final item summary.

### Hierarchical context for ordinary logs

`CoreUtilsLib.LoggerService` will gain a synchronous scoped-position API. While a callback executes, ordinary `debug`, `info`, `warn`, `error`, and dynamic `log` calls inherit a default `TreePosition`. Explicit semantic positions continue to take precedence. Scope restoration occurs in `finally`, including when the callback throws.

`PipelineFramework` will execute each step inside the appropriate scoped position. Consequently, messages emitted by `SheetDBLib`, `WorkspaceTemplateEngine`, and `GoogleApiWrapper` during that step are visibly nested rather than printed at the job root. The mechanism is synchronous and stack-based, matching GAS V8 and ALDO's no-async constraint.

### Durable SheetDB transactions

`SheetDBLib.DatabaseConnectionManager.commit()` will flush every registered table's pending mutation queues before the low-level spreadsheet batch is finalized. A successful commit therefore means the queued `LOG_FOLD`, `LOG_DOCS`, `LOG_MAIL`, and other table mutations were submitted to the backing spreadsheet.

On failure, commit retains the existing error and rollback path. Tests will verify the ordering: table queues flush first, spreadsheet batch flush second, transaction state clears only after both succeed. This library-level correction applies to ALDO without introducing an application-side persistence workaround.

### Optional job definitions

`JobRunnerExecutionController` will test registry membership before retrieving an optional definition. Missing definitions for dynamically named jobs will be silent and execution will continue. `JobDefinitionRegistry.getDefinition()` will keep its strict diagnostic behavior for callers that explicitly request a missing definition.

This removes the false error for all dynamic ALDO job names rather than special-casing `gen_PIANI_CUSTOMIZZATI` or `gen_PIANI_PERSONALIZZATI`.

### Timing

The execution controller will capture invocation start time and include total elapsed milliseconds in completed, failed, cancelled, and suspended terminal events. ALDO batch services will separately time each document or email item. Existing pipeline-step and transaction durations remain intact.

Logs therefore expose three useful levels of timing:

- individual step duration;
- complete document/email item duration;
- complete job invocation duration.

## Example Output Shape

```text
📄 [DOCUMENT 1/7] Target: user@example.edu:PDP_DSA
  ├─ ⚙️ Context Assembly: 8 providers executed, 0 skipped, 0 failed (COMPLETED in 59ms)
  ├─ 🛠️ [DocumentoPipeline] Processing (10 steps)
  │    ├─ ✅ [GenerateName]: Name: PDP_DSA_Rossi_Mario_2026 (EXECUTED in 0ms)
  │    ├─ ✅ [CloneTemplate]: File ID: ...; Link: ... (EXECUTED in 2756ms)
  │    ├─ ✅ [ApplyPermissions]: Editors: docente@example.edu; Viewers: famiglia@example.edu (EXECUTED in 420ms)
  │    └─ ✅ [RegisterDocument]: LOG_DOCS: ... (EXECUTED in 1ms)
  └─ ✅ Document generated: PDP_DSA_Rossi_Mario_2026 (COMPLETED in 8572ms)
```

Exact separators between multiple detail fields remain the responsibility of the common formatter. The behavioral requirements are content-first ordering, trailing parenthesized status/timing, stable indentation, truthful values, and bounded single-line summaries.

## Error Handling

- A failed step logs the duration and safe error reason at the same hierarchical position.
- Result-detail formatting must never replace or mask the original pipeline error.
- A persistence flush failure makes the transaction fail; it must never emit a successful commit line.
- A missing optional job definition produces no warning or error. Invalid registry input and explicitly requested missing definitions retain their diagnostics.
- Logging failures caused by malformed optional details degrade to a safe textual representation and do not fail document generation or email sending.

## Testing Strategy

Changes follow test-driven development across both repositories.

GasLibraryFactory tests will prove:

- step details render before trailing status/timing, with arrays, omission of empty values, and multiline-safe indentation;
- scoped positions indent ordinary nested messages, restore after success/failure, and do not override explicit positions;
- pipeline execution supplies the correct position scope to nested services;
- transaction commit drains table queues before final spreadsheet flush and preserves failure semantics;
- dynamic jobs run without a registry error when no optional definition exists;
- terminal events include elapsed time for all terminal states.

ALDO tests will prove:

- each document and email step publishes its expected basic data;
- generated document results retain name, ID, link, status, and elapsed time;
- permission and recipient addresses appear unredacted;
- batch item summaries contain the principal result and duration;
- `LOG_FOLD`, `LOG_DOCS`, and `LOG_MAIL` mutations reach the real adapter flush seam;
- document and email output contains no unindented nested library lines.

Regression verification includes focused tests first, then library build/tests, ALDO vendor refresh, typecheck, lint, unit/integration/build tests, and all supported build modes. Final graph audits cover native GAS bypasses, dead code, library signature linkage, and circular dependencies.

## Scope Boundaries

- No full CDU, email body, or credential logging.
- No ALDO-local replacement for SheetDB transactions or structured formatting.
- No hard-coded registry entry per generated job name.
- No new asynchronous mechanism.
- No retroactive migration of rows lost by earlier executions; affected jobs must be rerun after deployment if their logs are required.
