# ALDO online tests ponytail audit — 2026-09-01

Scope: `src/onlinetests/**` only; live-GAS scenario coverage retained. User-edited `checks/contextEngineChecks.ts` and `checks/storicoChecks.ts` were inspected but not changed.

Audited: 32 TypeScript files / 12,404 lines.

1. `shrink:` Collapse the duplicated persisted historical-fixture bootstraps for articolazione and dotted-ITP into one `executePersistedHistoricalChecks(register, overrides)` with the two existing public launchers as delegates; the container, interceptor, fixture shape, and all registrations stay identical. [src/onlinetests/index.ts:1078] (~36 lines)
2. `yagni:` Let `registerE2eScenarioChecks` accept the selected-name set and gate its own `add` calls; delete `CapturedScenarioCheck`, the fake `TestRunner` cast, capture, and replay machinery while preserving every registered callback and current group boundaries. [src/onlinetests/checks/e2eScenarioChecks.ts:1150] (~23 lines)
3. `shrink:` Replace the single-use `E2eActiveRepresentativesInterceptor` class plus instantiated singleton with the typed interceptor object literal. [src/onlinetests/E2eActiveRepresentativesInterceptor.ts:14] (~3 lines)

net: -62 lines, -0 deps possible.
