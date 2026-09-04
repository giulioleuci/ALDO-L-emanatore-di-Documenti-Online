# Ponytail audit — ALDO Context Engine

Scope: `src/application/context-engine/**/*.ts` only; no source changes. Audited: 50 production TypeScript files, 4,892 lines. Tests were inspected only as call-path evidence and are excluded from the line total.

Evidence checked: `aldo-full-coverage` scoped architecture/calls/dead-code/complexity queries; `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory` linkage queries; `ContextEngine`, `CoreUtilsLib`, `RoleResolutionLib`, and `ComposableContentLib` docs. The module delegates assembly, registries, projection, and effective-role resolution to GasLibraryFactory; no direct GAS-global call was found in scope.

1. shrink: Extract the identical `COMUNE || selected articulation half` filter used by `PartnerProjectionProvider.titolariScope` and `ConsiglioClasseProvider.partizioni` into the existing `TeachingCouncilProjection` domain module; replace both local copies with it. [src/application/context-engine/providers/PartnerProjectionProvider.ts:73] (~10 lines)

net: -10 lines, -0 deps possible.
