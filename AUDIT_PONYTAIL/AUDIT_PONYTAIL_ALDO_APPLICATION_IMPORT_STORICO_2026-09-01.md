# Ponytail audit — ALDO application import and storico

Scope: `src/application/import/` and `src/application/storico/` only; no source changes. Audited: 9 production TypeScript files, 714 physical lines.

| File | Lines |
| --- | ---: |
| `src/application/import/CustomSourceStrategies.ts` | 137 |
| `src/application/import/ImportRecipeMapper.ts` | 156 |
| `src/application/storico/StoricoAlunniService.ts` | 160 |
| `src/application/storico/StoricoClassiService.ts` | 53 |
| `src/application/storico/StoricoDatabaseProvider.ts` | 70 |
| `src/application/storico/StoricoDocentiService.ts` | 39 |
| `src/application/storico/StoricoDocumentiService.ts` | 61 |
| `src/application/storico/presenza.ts` | 12 |
| `src/application/storico/reconcileSigla.ts` | 26 |

Evidence: scoped architecture, calls, complexity, dead-code, and native-GAS-bypass queries used `aldo-full-coverage`; GLF linkage used `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`; `GasDataImporter`, `JobRunnerLib`, `SheetDBLib`, and `CoreUtilsLib` docs were checked first. Tests and surrounding application source were used only as call-path evidence and are excluded from the line total. No direct native GAS-global call was found in scope.

Lean already. Ship. The apparent wrappers are required domain adapters: custom strategies close over ALDO repositories while delegating sheet parsing to `SheetByIdStrategy`; the historical provider's cache prevents duplicate SheetDB opens; and the small storico services are independent CDU projections with verified consumers.

net: -0 lines, -0 deps possible.
