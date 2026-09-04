scope: GasLibraryFactory/ContextEngine source, tests, index, and README; generated/dist/node_modules excluded; audited lines: 12317.

delete: Cut the uncalled collection-projection subsystem (projector, registry, interceptor, projection error, `_forEachAt`, its exports, docs, and local tests). Keep projections application-local until a production caller exists. [GasLibraryFactory/ContextEngine/src/projection/CollectionProjector.js:1] (~1100 lines).
shrink: Cut the package-long duplicate API tutorial from the import index. Keep the 19 exports and the README as the single guide. [GasLibraryFactory/ContextEngine/index.js:1] (~570 lines).
shrink: Cut the two near-identical concrete-registry test suites that re-test `TypedRegistry`. Test `TypedRegistry` once with a small table of provider/interceptor configurations. [GasLibraryFactory/ContextEngine/src/__tests__/ProviderRegistry.test.js:1] (~300 lines).
yagni: Cut the synchronous `assembleAsync` alias, its binding, and alias-only tests. Use `assemble`; GAS V8 is synchronous. [GasLibraryFactory/ContextEngine/src/internal/ContextStepExecutor.js:192] (~35 lines).
yagni: Cut the three internal-engine getters whose only callers are assertions of the getters themselves. Keep `_dependencyResolver`, `_recipeParser`, and `_postProcessor` private. [GasLibraryFactory/ContextEngine/src/ContextAssembler.js:226] (~35 lines).

net: -2040 lines, -0 deps possible.
