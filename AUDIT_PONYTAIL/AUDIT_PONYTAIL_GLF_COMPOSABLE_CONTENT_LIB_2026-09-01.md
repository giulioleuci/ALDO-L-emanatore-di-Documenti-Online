scope: GasLibraryFactory/ComposableContentLib source, tests, index.js, appsscript.json, and README.md (excluding dist/node_modules/generated artifacts); audited lines: 4758.
yagni: Cut the inactive data-requirements contract: metadata, validation, predicates, serialization, DataRequirementError, and its test. Let ContentBlock.getData own its data needs. [GasLibraryFactory/ComposableContentLib/src/core/BlockDefinition.js:55] (~65 lines).
yagni: Cut the unthrown CompositionError class, its barrel export, and standalone tests. Let composition propagate the BlockResult errors it already produces. [GasLibraryFactory/ComposableContentLib/src/errors/ComposableContentError.js:77] (~45 lines).
yagni: Cut definition-level defaultVisibility and defaultOrder, which composition never reads. Use the recipe's existing visibility and order fields. [GasLibraryFactory/ComposableContentLib/src/core/BlockDefinition.js:56] (~30 lines).
shrink: Cut CompositionResult's duplicate format, blockResults, and getBlockResult aliases. Keep outputFormat, blocks, and getBlockById. [GasLibraryFactory/ComposableContentLib/src/core/CompositionResult.js:18] (~25 lines).
net: -165 lines, -0 deps possible.
