# JobRunnerLib ponytail audit — 2026-09-01

Scope: `GasLibraryFactory/JobRunnerLib` only — production source, Jest and online tests, `index.js`, `README.md`, and `appsscript.json`; generated output and dependencies excluded.

Audited lines: 9,260 total — 2,432 production-source, 6,169 Jest-test, 67 online-test, and 592 index/README/manifest lines.

1. `delete:` Remove the 410-line API/tutorial duplicate from the package entry; `README.md` already owns the same user documentation, leaving four exports in `index.js`. [GasLibraryFactory/JobRunnerLib/index.js:1] (~410 lines)
2. `shrink:` Replace the 24 near-identical invalid-argument cases with one table-driven boundary test, then remove the four duplicate invalid-callback cases in the coverage-gap suite; keep one case per validation rule. [GasLibraryFactory/JobRunnerLib/src/__tests__/JobRunnerService.phase5.test.js:86] (~184 lines)

net: -594 lines, -0 deps possible.
