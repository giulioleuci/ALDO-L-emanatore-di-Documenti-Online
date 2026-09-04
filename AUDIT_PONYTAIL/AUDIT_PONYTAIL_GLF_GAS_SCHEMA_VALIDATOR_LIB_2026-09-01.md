# Ponytail audit — GasSchemaValidatorLib

Scope: `GasLibraryFactory/GasSchemaValidatorLib` source, Jest and GAS-online tests, index, README, and manifest; generated `dist/` and `node_modules/` excluded.

Audited: 11 in-scope files, 940 lines. The graph confirms the library is a compact L1 component with no circular dependencies; public exports and documented APIs were retained unless a finding below identifies a safe cut.

1. `yagni:` Remove the per-instance `WeakMap`/bound-`safeParse` micro-cache, its unit tests, and its README claim; call `schema.safeParse(data)` directly—there is no cache control, metric, or demonstrated work beyond binding a method. [GasLibraryFactory/GasSchemaValidatorLib/src/SchemaValidator.js:6] (~28 lines)
2. `delete:` Remove the empty exported `testing` namespace and its one-line empty module; it deliberately exposes no doubles and has no in-repo consumer. Replacement: nothing. [GasLibraryFactory/GasSchemaValidatorLib/index.js:6] (~2 lines)
3. `delete:` Remove the GAS “WeakMap cache benchmark”; it only checks an arbitrary elapsed-time ceiling, not library behavior already covered by the unit suite. Replacement: nothing. [GasLibraryFactory/GasSchemaValidatorLib/__testOnline__/SchemaValidatorTests.gs:26] (~14 lines)

net: -44 lines, -0 deps possible.
