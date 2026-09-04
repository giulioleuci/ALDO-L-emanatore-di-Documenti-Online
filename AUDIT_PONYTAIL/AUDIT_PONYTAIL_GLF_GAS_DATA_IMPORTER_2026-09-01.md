scope: GasLibraryFactory/GasDataImporter source, tests, entry index, README, and manifest; generated/dist/node_modules excluded; audited lines: 12251.

delete: Remove the duplicated module manual; the README already carries the public overview, setup, recipe shape, and quick-start. Keep a one-line module header with the exports. [GasLibraryFactory/GasDataImporter/index.js:1] (~473 lines).
delete: Remove the unreferenced hand-run `Tests.gs` suite and placeholder integration test; its seven checks duplicate 446 Jest checks, while `__testOnline__/GasDataImporterTests.gs` is the master-runner live suite. [GasLibraryFactory/GasDataImporter/Tests.gs:1] (~433 lines).
yagni: Fold the four one-caller transformer managers into `Transformer`; their facade back-calls and `Delegation` wiring add indirection but no replaceable implementation. [GasLibraryFactory/GasDataImporter/src/pipeline/Transformer.js:17] (~60 lines).
yagni: Inline `ImportRecipeValidator` and `ImportStrategyRegistry`'s four facade-only methods in `ImportEngine`; neither is exported and both exist solely to bind methods back onto that same engine. [GasLibraryFactory/GasDataImporter/src/ImportEngine.js:55] (~40 lines).

net: -1006 lines, -0 deps possible.
