Scope: `GasLibraryFactory/GasOnlineTestFramework/{README.md,index.js,src/**,__tests__/**}`.
Audited: 11 files / 2,119 lines; generated output, `vendor/`, and `node_modules/` excluded.

1. <delete:> Replace the 783-line legacy README: it documents the removed `TestFramework`/`Assert` API, nonexistent methods, a fake resource manager, and output the runner never emits. Keep a short current example and link the canonical generated API reference. [GasLibraryFactory/GasOnlineTestFramework/README.md:8] (~730 lines).
2. <yagni:> Delete the lifecycle-hook subsystem: no `.addHook()` caller exists in the repository or ALDO, while it stores four hook arrays and dispatches them around every run. Inline setup/cleanup in the registered test until a caller proves suite lifecycle hooks are needed. [GasLibraryFactory/GasOnlineTestFramework/src/EnhancedTestRunner.js:13] (~40 lines).
3. <delete:> Remove `apiCallCount` and `_trackApiCall()`: the counter changes no behavior, has no consumer beyond one unit assertion, and is only logged then reset. Remove the field, 18 instrumentation calls, reset log/reset, and that assertion. [GasLibraryFactory/GasOnlineTestFramework/src/TestContext.js:17] (~27 lines).
4. <yagni:> Drop the inert per-test `timeout` option. It is recorded but never read or enforced; retaining a no-op configuration path makes the public surface larger and the old README's timeout examples misleading. [GasLibraryFactory/GasOnlineTestFramework/src/EnhancedTestRunner.js:23] (~9 lines).

net: -806 lines, -0 deps possible.
