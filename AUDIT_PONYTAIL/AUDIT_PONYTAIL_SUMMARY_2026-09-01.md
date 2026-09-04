# Ponytail audit summary — 2026-09-01

## Coverage and verification

Exactly 29 component reports were found: 13 ALDO and 16 GasLibraryFactory (GLF). Their declared component scopes are mutually exclusive. All cited finding files exist in the current tree; the SheetDB finding intentionally targets an existing but stale generated API document, and the ALDO tooling finding explicitly describes generated map files that are absent. Every stated report net equals the sum of its non-overlapping estimates.

Graph-first validation used `aldo-full-coverage`, `home-giulio-Desktop-ALDO-implementing`, and `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`; current tracked files then supplied physical-line counts and resolved stale graph/file discrepancies. Existing dirty files were read only.

| Report | Scope | Stated net | Excluded | Verified net | Deps |
| --- | --- | ---: | ---: | ---: | ---: |
| ALDO application context engine | `src/application/context-engine` | -10 | 0 | -10 | 0 |
| ALDO application import/storico | `src/application/{import,storico}` | 0 | 0 | 0 | 0 |
| ALDO application services | `src/application/services` | -315 | 0 | -315 | 0 |
| ALDO strategies/email/pipelines | assigned application subtrees | -2 | 0 | -2 | 0 |
| ALDO config/entrypoints/presentation | assigned config and entry files | -372 | 0 | -372 | 0 |
| ALDO domain entities/value objects | assigned domain subtrees | -96 | 0 | -96 | 0 |
| ALDO domain repositories/specifications | assigned domain subtrees | 0 | 0 | 0 | 0 |
| ALDO infrastructure DB/repositories | assigned infrastructure subtrees | -24 | 0 | -24 | 0 |
| ALDO infrastructure facades | `src/infrastructure/facades` | -16 | 0 | -16 | 0 |
| ALDO infrastructure role/services | assigned infrastructure subtrees | -35 | 0 | -35 | 0 |
| ALDO online tests | `src/onlinetests` | -62 | 0 | -62 | 0 |
| ALDO tests | `test` | -246 | 0 | -246 | 0 |
| ALDO tooling/config | `scripts`, `types`, tracked root config | -104 | 0 | -104 | 0 |
| **ALDO subtotal** | 13 reports | **-1,282** | **0** | **-1,282** | **0** |
| GLF ComposableContentLib | library surface | -165 | 0 | -165 | 0 |
| GLF ContextEngine | library surface | -2,040 | -1,100 | -940 | 0 |
| GLF CoreUtilsLib | library surface | -275 | 0 | -275 | 0 |
| GLF DomainRepositoryLib | library surface | -1,123 | 0 | -1,123 | 0 |
| GLF GasDataImporter | library surface | -1,006 | 0 | -1,006 | 0 |
| GLF GasExpressionEngineLib | library surface | -910 | 0 | -910 | 0 |
| GLF GasOnlineTestFramework | library surface | -806 | 0 | -806 | 0 |
| GLF GasProcessMonitorLib | library surface | -545 | 0 | -545 | 0 |
| GLF GasResilienceLib | library surface | -376 | 0 | -376 | 0 |
| GLF GasSchemaValidatorLib | library surface | -44 | 0 | -44 | 0 |
| GLF GoogleApiWrapper | library surface | -1,005 | 0 | -1,005 | 0 |
| GLF JobRunnerLib | library surface | -594 | 0 | -594 | 0 |
| GLF PipelineFramework | library surface + shared manifest once | -768 | 0 | -768 | 0 |
| GLF RoleResolutionLib | library surface | -407 | 0 | -407 | 0 |
| GLF SheetDBLib | library surface + stale API doc | -4,541 | 0 | -4,541 | 0 |
| GLF WorkspaceTemplateEngine | library surface | -329 | 0 | -329 | 0 |
| **GLF subtotal** | 16 reports | **-14,934** | **-1,100** | **-13,834** | **0** |
| **Combined** | **29 reports** | **-16,216** | **-1,100** | **-15,116** | **0** |

## Normalized unique-file denominator

Physical lines were counted once from the current worktree, using tracked files only:

| Surface | Files | Physical lines |
| --- | ---: | ---: |
| ALDO `src/**` | 242 | 34,301 |
| ALDO `test/**` | 209 | 42,715 |
| ALDO `scripts/**` | 8 | 1,516 |
| ALDO `types/**` | 2 | 1,891 |
| ALDO relevant tracked root build/config | 16 | 12,131 |
| **ALDO denominator** | **477** | **92,554** |
| GLF ComposableContentLib + API doc | 24 | 7,178 |
| GLF ContextEngine + API doc | 45 | 13,518 |
| GLF CoreUtilsLib + API doc | 50 | 17,992 |
| GLF DomainRepositoryLib + API doc | 50 | 16,148 |
| GLF GasDataImporter + API doc | 40 | 13,488 |
| GLF GasExpressionEngineLib + API doc | 27 | 6,802 |
| GLF GasOnlineTestFramework + API doc | 12 | 2,783 |
| GLF GasProcessMonitorLib + API doc | 10 | 2,881 |
| GLF GasResilienceLib + API doc | 27 | 9,190 |
| GLF GasSchemaValidatorLib + API doc | 12 | 1,234 |
| GLF GoogleApiWrapper + API doc | 62 | 32,415 |
| GLF JobRunnerLib + API doc | 26 | 11,338 |
| GLF PipelineFramework + API doc + shared `appsscript.json` once | 16 | 5,884 |
| GLF RoleResolutionLib + API doc | 62 | 13,240 |
| GLF SheetDBLib + API doc | 35 | 15,662 |
| GLF WorkspaceTemplateEngine + API doc | 33 | 17,202 |
| **GLF denominator** | **531** | **186,955** |
| **Normalized denominator** | **1,008** | **279,509** |

The 16 ALDO root files are the tracked Prettier, clasp/test-online backup, TypeScript, Babel, Jest, gitignore, skills-lock, Apps Script, package/lock, ESLint, and webpack configuration files audited by the tooling report. GLF rows include each library directory (including its library-local online tests), its corresponding `DOCS_LIBS/*.md`, and PipelineFramework's audited shared root manifest once. Excluded: `SPECS_ALDO`, `FAKEDB`, general/project documentation, shared top-level GLF test harnesses, `dist`, `vendor`, `node_modules`, generated outputs, `.git`, logs/assets, and all audit reports.

## Verified result and caveats

Verified removable estimate: **15,116 lines** = **1,282 ALDO** + **13,834 GLF**, or **5.41%** of the **279,509-line** normalized denominator; **0 dependencies**.

- Excluded GLF ContextEngine finding 1 (`-1,100`): the combined graph and current source show production inbound use of `CollectionProjector`, `ProjectionRegistry`, and `CollectionProjectionInterceptor` from ALDO email, role-resolution, context-engine, and document-strategy paths. It is not an uncalled subsystem.
- The ALDO repository report incorrectly says `getDocentiIRC`/`getDocentiALT` are absent from `IClasseRepository`; they are declared there. Their zero-production-caller deletion remains supported, with the interface declarations removed alongside the implementation, so the report's `-6` remains conservative.
- The infrastructure role/services audited-line header is one line above the current tracked scope (713 stated vs 712 current). The normalized denominator uses the current 712-line scope and does not reuse report headers.
- All line savings are report estimates, not applied diffs; percentages therefore describe removable potential, not already-realized reduction.
