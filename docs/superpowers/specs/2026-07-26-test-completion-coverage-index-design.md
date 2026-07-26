# Design: codebase-memory-mcp full-coverage index, doc updates, and ALDO test-completion initiative

Date: 2026-07-26

## 1. New codebase-memory-mcp index

Register a new indexed project, name `aldo-full-coverage`, rooted at the repo root
(`/home/giulio/Desktop/ALDO implementing`), scoped to include:

- `src/**` (application code, including `src/onlinetests/checks/`)
- `test/**` (`test/unit`, `test/integration`, `test/build`, `test/fakes`, `test/fixtures`)
- `GasLibraryFactory/**`

This is additive: the three existing indexed projects
(`home-giulio-Desktop-ALDO-implementing`, `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`,
`aldo-onlinetests-debug`) are left untouched. `aldo-full-coverage` exists specifically to support
cross-cutting coverage and dead-code analysis across app code, every test tier, and the library
in a single graph.

## 2. Documentation updates

Add a fourth bullet to the "Codebase Analysis via codebase-memory-mcp" indexed-project list in
`CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` (all three files carry identical text today — same edit
applied three times):

> - `"aldo-full-coverage"`: Contains ALDO application code, all test tiers (unit, integration,
>   build, online), and GasLibraryFactory in one graph. Use this for cross-cutting coverage and
>   dead-code analysis spanning the whole test surface.

No other changes to these files.

## 3. ALDO test-completion initiative

### 3.1 Baseline (measured 2026-07-26, unit suite, 117 suites / 882 tests, all passing)

| Metric     | Value  |
|------------|--------|
| Statements | 96.01% |
| Branches   | 85.38% |
| Functions  | 95.04% |
| Lines      | 96.93% |

No `coverageThreshold` is configured in any Jest config (`jest.config.cjs`,
`jest.integration.config.cjs`, `jest.build.config.cjs`) or `package.json`. Branch coverage is the
weak dimension overall; the worst-covered files cluster in three of the areas the user called out
explicitly (CDU assembly, cattedra/substitute resolution, articulated classes) plus a few
unrelated infra files.

### 3.2 Target and enforcement

Target: as close to 100% statements/branches/functions/lines as practical for the in-scope code
(see exclusions below), achieved by writing new/extended tests — not by weakening exclusions to
hit a number.

Enforcement: **tracked target, not a hard gate.** No `coverageThreshold` is added to any Jest
config. Coverage is measured and reported per task, but `npm test` will not fail below threshold.
This preserves flexibility for unrelated future small PRs that might dip a single file's coverage
slightly.

### 3.3 Exclusions

The following are excluded from the 100% goal (GAS glue and structurally logic-free files):

- `src/entrypoints/EntryPoints.ts` — GAS ambient-global glue, not independently testable.
- `src/index.ts` globalThis-assignment wiring (the parts of the file that only assign functions
  onto `globalThis`; any real logic in the file remains in scope).
- Barrel `index.ts` files that only re-export.
- Pure interface/type-only files (no runtime logic).

Everything else — `Bootstrap.ts`, `ServiceContainer.ts`, all facades, repositories, strategies,
domain entities/VOs/specifications, context-engine providers/mappers/interceptors — is in scope
for 100%.

### 3.4 Phase A — Offline coverage closing (priority order)

Ordered by the user's stated priority (CDU → cattedra/substitutes → articulated classes) first,
then remaining gaps by severity:

1. **CDU / context-engine providers** (worst branch coverage in the codebase):
   `TutorProvider` (72.3%), `RappresentantiProvider` (78.4%), `ConsiglioClasseProvider` (84.4%,
   branch 50%), `DocumentiProvider` (84.7%, branch 50%), `CarenzeProvider` / `PianiProvider` /
   `PianiPersAlunnoProvider` (~85%, branch 50%), `PianiPersClasseProvider` (90.1%),
   `PianiPersClasseStoricoProvider` (93.2%), `ClasseProvider` (95.5%).
2. **Cattedra / role-resolution / substitutes**: `VariazioneCattedra.ts` entity (87.3%, branch
   73.68%), `PeriodoSupplenza.ts` VO (88.8%), `CdcAssembler.ts` (91.6%, branch 82.05%),
   `RisolutoreRuoliService.ts` (91.8%, branch 87.06%), `Supplenza.ts` entity (93.0%, branch 72%),
   `CattedraResolver.ts` (96.8%, branch 87.05%).
3. **Articulated / structured classes**: audit `Classe` entity, `ClasseRepository`, and the
   partner-routing logic added by the recent cattedra-resolution work (commits `21ba404`,
   `8aa1c10`, `5d0c8f4`) specifically at the branch level — current file-level numbers look high
   (95-100%) but that refactor is recent enough to warrant a dedicated branch audit rather than
   trusting the aggregate.
4. **Domain specifications and remaining entities**: `DocenteSpecs`, `OreASLSpecs`, `AlunnoSpecs`
   (78-82%, mostly branch gaps), `Piano` / `Indirizzo` / `MovimentoAlunno` entities (84-86%),
   `LogCartellaRepository` (84.3%).
5. **Misc infra**: `ProcessMonitorFacade.ts` (37.8%), `src/index.ts` (70.2%, branch 50% — logic
   portions only, per exclusions above).

Each numbered item above becomes one or more tasks in the implementation plan.

### 3.5 Phase B — Online coverage

The online suite (`src/onlinetests/`) runs against a real GAS project via `clasp push` +
live execution, not through Jest/istanbul — so "100% coverage" cannot mean a statement-coverage
percentage today. Decision: **attempt real instrumentation before falling back to a scenario
checklist.**

1. **Spike (first task, timeboxed):** investigate whether istanbul instrumentation can be added
   to the `--mode=online` webpack build such that code executed live in the GAS V8 runtime reports
   real coverage (e.g. via a coverage object serialized to `PropertiesService` or logged and
   collected after the run, similar to how `gas-source-map.json` is produced today). Produce a
   go/no-go finding.
2. **If feasible:** wire coverage collection into the online test run, then extend
   `src/onlinetests/checks/` (currently 4 files: `contextEngineChecks.ts`, `e2eScenarioChecks.ts`,
   `pipelineChecks.ts`, `repositoryChecks.ts`, vs. 30 files in `context-engine` and 18 in
   `services`+`strategies` offline — proportionally thin) until the measured percentage approaches
   the same target as offline.
3. **If infeasible:** fall back to an explicit scenario-coverage checklist as the Phase B
   deliverable instead of a %: every `CONF_DOC` / `CONF_MAIL` type, every role-resolution priority
   path (`SUPPLENZE` → `VARIAZIONI_CATTEDRA` → `CLASSI`), and every articulated-class case gets at
   least one live e2e check exercising it end-to-end against real Sheets/Drive/Gmail.

### 3.6 Methodology

Same cadence as the prior cattedra-resolution initiative: spec (this document) → numbered
implementation plan via `writing-plans` → TDD per task → review per task → final regression pass
(full unit + integration suite, plus online suite where the spike lands feasible).
