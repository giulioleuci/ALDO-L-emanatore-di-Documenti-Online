# ALDO — Architecture & Call-Trace Structural Analysis

## Methodology

This analysis was produced with `codebase-memory-mcp` against the indexed project
`home-giulio-Desktop-ALDO-implementing` (9,735 nodes / 25,709 edges), cross-checked
against `GasLibraryFactory/CLAUDE.md` (L0→L4 layering rules) and this repo's
`CLAUDE.md` (Clean Architecture layering: Presentation → Application → Domain ←
Infrastructure; the GasLibraryFactory-first mandate; GAS V8 constraints).

Two caveats about the tooling, noted so results aren't mistaken for silent gaps:

- The graph query engine's multi-hop `MATCH` chaining is unreliable for cycle
  detection — queries meant to find real multi-node `CALLS`/`IMPORTS` cycles
  instead collapsed to single self-looped nodes (`a = b = c`), which are not real
  cycles. All cycle/circular-dependency claims below were instead verified with
  single-hop queries and direct source reads (`grep`/`Read`), not multi-hop Cypher.
- The graph's `recursive` / `self_recursive` / `unguarded_recursion` properties on
  Function/Method nodes produce false positives. Two were checked directly against
  source and dismissed: `StringUtils.camelCase` (calls an imported lodash function
  of the same name — not recursion) and `ClasseRepository.getConsiglioDiClasse`
  (a plain for-loop, no recursive call). Any recursion-related finding below was
  independently confirmed by reading the actual implementation.

**Confirmed clean (not findings, recorded so they aren't re-investigated):**

- `npx eslint src --quiet` exits 0 — no native GAS globals (`SpreadsheetApp`,
  `DriveApp`, `MailApp`, etc.) leak outside `GoogleApiWrapper` (L2). The
  `no-restricted-globals` boundary holds.
- GasLibraryFactory's L0→L4 import graph has no backward/violating imports. One
  apparent `CoreUtilsLib` violation turned out to be JSDoc comment text mentioning
  a higher-layer name, not a real import — ruled out by reading the file.
- `onOpen()` in `src/index.ts` never eagerly calls `initAldo()`, per the documented
  constraint.

---

## 1. Dependency Inversion violation: Application layer imports concrete Infrastructure classes

**Files:** `src/application/context-engine/ContextEngineFactory.ts`,
`src/application/services/ReportService.ts`,
`src/application/services/RisolutoreRuoliService.ts`,
`src/application/services/EmailNotificationService.ts`,
`src/application/context-engine/providers/AggregatoreDati.ts` (and related
providers), `src/application/services/CattedraResolver.ts`, five
`src/application/storico/Storico*Service.ts` files, and
`src/infrastructure/.../StoricoDatabaseProvider.ts` consumers — **14 files total**.

**Description:** These files import ~14 concrete repository classes (e.g.
`ClasseRepository`, `SupplenzaRepository`, `CarenzaRepository`, ...) by value
directly from `src/infrastructure/repositories/`, rather than depending on domain
repository interfaces. Only one interface exists to depend on instead —
`src/domain/repositories/IClasseRepository.ts` — so for the other 13 concrete
repositories there is currently no interface to switch to. Notably, the same
files _do_ correctly depend on facade interfaces via `import type` (`IDriveFacade`,
`IGmailFacade`, `ITemplateEngine`, etc.) — the inversion discipline exists and is
followed for facades but not for repositories.

**Why it matters:** This repo's Clean Architecture split (`CLAUDE.md`) requires
Application to depend on Domain abstractions, not Infrastructure concretions —
Infrastructure implements Domain interfaces, not the other way around. As written,
Application is compile-time coupled to Infrastructure's concrete repository
implementations, which:

- Makes swapping the persistence layer (e.g. a future non-Sheets-backed repo) a
  ripple across 14 application files instead of a wiring change in
  `Bootstrap.ts`/`ServiceContainer`.
- Weakens testability — tests must mock/stub concrete classes with all their
  internals rather than a narrow interface contract (test doubles in
  `test/fakes/` already do most of this work manually, which is itself evidence
  the interface boundary is missing).

**Refactoring suggestion:** Extract `I<X>Repository` interfaces into
`src/domain/repositories/` for the 13 repositories that lack one, mirroring the
existing `IClasseRepository.ts` shape. Switch the 14 application-layer imports to
`import type { I<X>Repository } from '...'` and resolve concrete instances only
through `ServiceContainer`/`Bootstrap.ts`, consistent with how facades are already
handled.

---

## 2. `resumeJob` has no error boundary around `initAldo()` / job resumption

**File:** `src/index.ts:41-43`

**Description:** `resumeJob` — the GAS-trigger-invoked entrypoint that resumes a
suspended `JobRunnerLib` job — calls `initAldo()` (which can throw
`ConfigurationError` during composition-root wiring) followed by
`riprendiJobSospeso`, with no `try/catch`. Compare this to the interactive path:
`Menu.ts`'s `avvioPersonalizzato` wraps the equivalent `initAldo()` call and
surfaces a user-facing error dialog on failure.

**Why it matters:** `resumeJob` runs unattended as a timed GAS trigger — there is
no UI, no operator watching it fire. If `initAldo()` throws (e.g. a
misconfigured `CONF_DOC`/`CONF_MAIL` row, a missing script property), the
exception propagates out of the trigger with no logging and no operator-visible
signal, while the underlying `JobRunnerLib` job is left permanently suspended in
`ScriptProperties` with no automatic retry or alert. This is exactly the class of
long-job failure `JobRunnerLib`'s checkpoint/resume design is meant to survive
gracefully, but the wiring failure path around it isn't covered.

**Refactoring suggestion:** Wrap the `initAldo()` + `riprendiJobSospeso` call in
`resumeJob` with a `try/catch`, log the failure via `LoggerService`, and — if
`JobRunnerLib` exposes a way to mark a job failed rather than leaving it silently
stuck — call it, so the failure is observable instead of vanishing into the
trigger's execution log.

---

## 3. `MyMustache` recursive template renderer has no depth guard or partial-cycle guard

**File:** `GasLibraryFactory/WorkspaceTemplateEngine/src/facades/Mustache.js`
(`_renderTokens` / `_renderSection` / `_renderInverted` / `_renderPartial` —
mutually recursive by design, which is correct and expected for a recursive-descent
template renderer; the mutual recursion itself is not the problem).

**Description:** `_renderPartial` (lines ~867-877) has no visited-set tracking
which partial names are already being expanded on the current call stack, and
`_renderSection` has no maximum-nesting counter. A partial that references itself
(directly or through a cycle of partials) or a pathologically deep `{{#section}}`
nesting will recurse until the call stack overflows.

**Why it matters:** Per `CLAUDE.md`, document/email templates are **data-driven**
— they live in `CONF_DOC`/`CONF_MAIL` Sheets rows and Drive template files that
end users (school staff) can edit directly, not just developers. A malformed or
accidentally self-referencing partial configured by a non-technical user currently
fails as an opaque low-level `RangeError` deep inside vendored template code,
rather than a clear, catchable validation error at the point templates are loaded.
Notably, `DocumentContentExtractor` elsewhere in the same monorepo already uses a
`MAX_ITERATIONS` guard for an analogous unbounded-traversal risk — there's an
established pattern in-repo, it's just not applied here.

**Refactoring suggestion:** Thread a depth counter and a visited-partial-name set
through `_renderTokens`/`_renderSection`/`_renderInverted`/`_renderPartial`, and
throw a dedicated `MustacheRenderError` (with the offending partial/section name)
once a sane cap is exceeded. This is a `GasLibraryFactory`-owned fix, consistent
with the project's library-first mandate — it should not be worked around in
ALDO application code.

---

## 4. `DocumentContentExtractor.scanDocumentStructure` — inconsistent runaway-loop protection

**File:**
`GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/DocumentContentExtractor.js:189-284`
(cognitive complexity 70 — the highest in the entire indexed codebase;
`transitive_loop_depth=4`, `linear_scan_in_loop=2`).

**Description:** The method has two structurally similar traversal phases. Phase
2 (text scan) is guarded by a `MAX_ITERATIONS = 10000` cap. Phase 1 (table
extraction, nested-loop depth 4) has no equivalent cap in the same function. The
overall `try/catch` boundary around the method is solid — this is specifically
about the missing iteration cap on one of the two phases, not an unhandled-error
gap.

**Why it matters:** GAS execution is capped at 6 minutes (regular) / 30 minutes
(with special quota), and document structures (deeply nested tables, e.g. from
imported/legacy Word→Docs conversions) are attacker- or user-uncontrolled input
sizes. Phase 2's cap shows the risk was already recognized and mitigated once in
this function — Phase 1 was left out, likely an oversight rather than a deliberate
omission, given the identical hazard shape.

**Refactoring suggestion:** Apply the same `MAX_ITERATIONS` (or a depth-appropriate
equivalent) guard to Phase 1's table-extraction loop, mirroring Phase 2's pattern,
and throw the same class of bounded-traversal error on exceeding it.

---

## Non-findings (checked and dismissed)

- **`PipelineFramework.Step.setResult` fan-in = 39** — highest fan-in in the
  codebase, but this is the expected shape for a base-class template method called
  by every concrete pipeline step; not a coupling smell.
- **`PipelineFramework.Step.execute()`** has a well-structured error boundary and
  is a good model to mirror for the `resumeJob` fix in finding #2.
- **`postProcessActions.executePostProcess`** (6 parameters) is a plain, bounded
  switch dispatcher — not a real complexity or error-handling risk despite the
  parameter count.
- **Per-job-item error handling inside `JobRunnerLib`'s internal queues** is that
  library's own concern and out of scope for this ALDO-focused pass.
