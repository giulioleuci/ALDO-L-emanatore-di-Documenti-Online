// Jest setup: make the vendored GasLibraryFactory classes (Entity, Repository,
// FieldSpecification, etc.) available as globals for tests, exactly as the
// deployed GAS bundle does at runtime. The vendored bundle is webpack-built with
// library.type:'this' and also Object.assign(global, Lib) in its entry, so
// executing it with `this === global` populates globalThis with every lib class.
// Validated in the R0 harness spike (see docs/superpowers/specs/2026-07-03-repo-breadth-R0-design.md §3).
const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', '..', 'vendor', 'gaslibs.Code.js');
const code = fs.readFileSync(bundlePath, 'utf8');
// Deliberate: execute the self-contained, checksum-verified vendored bundle with
// this===global so its classes register on globalThis (not untrusted input).
new Function(code).call(global);

// The library's LoggerService writes through GAS's native `Logger` global, which
// the real GAS runtime provides but Node does not. Stub it so library code paths
// that log (e.g. Repository.save) run under Jest. Test-harness shim only — real
// logging is exercised in the GAS online smoke tests, never here.
if (typeof global.Logger === 'undefined') {
  global.Logger = {
    log() {},
    clear() {},
    getLog() {
      return '';
    }
  };
}

// The vendored bundle's own entry point snapshots the true native CacheService
// into `global.__nativeCacheService__` *before* `Object.assign(global, Lib)`
// overwrites `global.CacheService` with the library's own `CacheService` wrapper
// class (see the bundle's final lines: `__nativeCacheService__ = ...CacheService`
// then `Object.assign(...)`). That snapshot line only captures something real in
// the actual GAS runtime, where the native `CacheService` global already exists
// before the bundle ever runs. Under Node there is no native `CacheService`, so
// the snapshot captures `undefined`, and the library's `ServiceFactory.getCacheService()
// .getScriptCache()` call chain falls through to `global.CacheService` — which by
// then IS the library's own wrapper class (shadowing), so calling `.getScriptCache()`
// on it re-invokes that same static method on itself forever
// (`RangeError: Maximum call stack size exceeded`). This bug was previously
// latent: every code path that opens a real historical-year `DatabaseService`
// (`MasterStoricoDatabaseProvider.anniStorici()`) is gated behind `includiStorico`
// and deferred inside a `LazyRef` that no existing test ever resolves, so this
// call chain had never executed under Jest before. Populating
// `__nativeCacheService__` directly (the bundle's own designed escape hatch, read
// first by `_getNativeCacheService()`) breaks the shadowing without touching
// `global.CacheService` itself, so any other code relying on the library's
// `CacheService` class staying the library class is unaffected. Test-harness shim
// only — real caching is exercised in the GAS online smoke tests, never here.
global.__nativeCacheService__ = {
  getScriptCache: () => new NullCache(),
  getUserCache: () => new NullCache(),
  getDocumentCache: () => new NullCache()
};

/** No-op native-shaped cache: same surface as GAS's native per-scope cache object. */
class NullCache {
  get() {
    return null;
  }
  getAll() {
    return {};
  }
  put() {}
  putAll() {}
  remove() {}
  removeAll() {}
}
