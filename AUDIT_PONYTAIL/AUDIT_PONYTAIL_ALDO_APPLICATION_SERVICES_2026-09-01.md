# Ponytail audit — ALDO application services

Scope: `src/application/services/` only; 11 TypeScript files, 3,930 physical lines audited.

| File | Lines |
| --- | ---: |
| `AggregatoreDati.ts` | 311 |
| `DatabaseValidationService.ts` | 85 |
| `DocumentBatchService.ts` | 933 |
| `DocumentGenerationService.ts` | 447 |
| `EmailBatchService.ts` | 329 |
| `EmailNotificationService.ts` | 648 |
| `EmailRetryService.ts` | 268 |
| `ImportService.ts` | 283 |
| `LockDocumentsService.ts` | 94 |
| `ReportService.ts` | 184 |
| `RisolutoreRuoliService.ts` | 348 |

Method and call analysis used the `aldo-full-coverage` graph; library capability and linkage checks used the `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory` graph and `DOCS_LIBS`.  No zero-inbound service method was found, no direct native GAS-global call was found, and the existing JobRunner generator/checkpoint and SheetDB transaction contracts are library-owned, so they remain.

1. `shrink:` Collapse the eight axis-specific document checkpoint loops into one private typed runner; each axis should supply only target enumeration, ID, persisted-target field, and `DocumentGenerationService` call. The repeated monitor/log/try-catch/progress/yield/complete block occupies the bulk of `generatePiani`, `generateDocentiClasseMateria`, `generateClassiMateria`, `generateClasseDocente`, `generateDocenti`, `generateAlunni`, `generateDipartimenti`, and `generateClassi`. [src/application/services/DocumentBatchService.ts:167] Estimated `-260` lines.
2. `shrink:` Extract the identical transaction → pipeline → critical-error → commit → result sequence shared by class, department, teacher, and student generation; keep each public method responsible only for its CDU build and recipe. [src/application/services/DocumentGenerationService.ts:156] Estimated `-55` lines.

net: -315 lines, -0 deps possible.
