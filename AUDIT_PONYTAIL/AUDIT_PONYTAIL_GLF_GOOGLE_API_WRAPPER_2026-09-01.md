# GoogleApiWrapper Ponytail Audit — 2026-09-01

scope: `GasLibraryFactory/GoogleApiWrapper` source, local/online tests, `index.js`, `README.md`, and `appsscript.json`; generated `dist/` and `node_modules/` excluded.
audited: 24,356 lines — 9,575 source, 13,172 local tests, 1,079 online tests, 530 public files.

- delete: Remove the wrapper-local key registry, prefix invalidation hook, and tests; no production caller enables tracking, and GAS Cache cannot enumerate keys, so this only works within one manually retained wrapper instance. Keep direct-key invalidation. [GasLibraryFactory/GoogleApiWrapper/src/services/CacheService.js:131] [GasLibraryFactory/GoogleApiWrapper/src/internal/core/GoogleService.js:147] [GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/CacheService.test.js:473] [GasLibraryFactory/GoogleApiWrapper/src/internal/core/__tests__/GoogleService.test.js:375] [GasLibraryFactory/GoogleApiWrapper/src/__tests__/integration/ServiceFactoryResilience.test.js:186] (~468 lines)
- shrink: Replace the three inline PropertiesService tutorials with concise API JSDoc; `DOCS_LIBS/GoogleApiWrapper.md` is the canonical generated reference. [GasLibraryFactory/GoogleApiWrapper/src/services/PropertiesService.js:256] [GasLibraryFactory/GoogleApiWrapper/src/services/PropertiesService.js:390] [GasLibraryFactory/GoogleApiWrapper/src/services/PropertiesService.js:516] (~319 lines)
- shrink: Keep `index.js` as exports plus a short module summary; its 166-line embedded manual duplicates `README.md` and the generated API reference. [GasLibraryFactory/GoogleApiWrapper/index.js:7] (~160 lines)
- delete: Drop the zero-caller `shareFilesWithUsers` synonym and its alias-only test block; call `shareWithUsers` directly. [GasLibraryFactory/GoogleApiWrapper/src/services/PermissionService.js:102] [GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/PermissionService.test.js:222] (~41 lines)
- delete: Drop the zero-caller `getScriptPropertyJSON` compatibility alias; call `getObjectProperty` directly. [GasLibraryFactory/GoogleApiWrapper/src/services/PropertiesService.js:633] (~11 lines)
- yagni: At the next major version, remove the deprecated L0 `LoggerService`/`UtilsService` re-export after moving the sole in-tree integration-test import to `@CoreUtilsLib`. [GasLibraryFactory/GoogleApiWrapper/index.js:174] (~6 lines)

net: -1005 lines, -0 deps possible.
