# ALDO ↔ GasLibraryFactory Linkage Audit — Broken Linkages Report

**Method.** ALDO's `src/` never imports GasLibraryFactory source directly — in GAS, libraries are
injected as globals at runtime via `vendor/gaslibs.Code.js`. The only compile-time contract between
ALDO and the 16 factory libraries is the hand-maintained ambient declaration file
`types/gaslibs/index.d.ts` (1233 lines). This is the actual risk surface: if a declaration in that
file drifts from the real GasLibraryFactory implementation (renamed/removed member, wrong return
type, changed parameter shape), TypeScript compiles ALDO cleanly against the stale declaration and
the mismatch only surfaces at runtime against the real global object.

Verification was done by cross-referencing (via `codebase-memory-mcp`'s knowledge graph and direct
source reads) every ALDO call site that reaches into `types/gaslibs/index.d.ts`-declared symbols
against the real GasLibraryFactory implementation of the same symbol, checking existence, exact
signature, and live call sites that actually depend on the mismatched member.

## Summary

| # | File:line | Symbol | Issue | Severity |
|---|---|---|---|---|
| 1 | `src/config/Bootstrap.ts:347` (declaration: `types/gaslibs/index.d.ts:912`) | `ServiceFactory.getUtilitiesService()` | Declared return type is wrong (`UtilsService` instead of the real `UtilitiesService`); the real `getUtils()` factory method (which actually returns `UtilsService`) is missing from the `.d.ts` entirely. `Bootstrap.ts` calls the wrong factory method for what `JobRunnerService` needs. | **High — confirmed live call site** |

Only one genuine broken linkage was found. Everything else spot-checked (see "Verified in sync"
below) matches the real library.

## Finding 1 — `ServiceFactory.getUtilitiesService()` misdeclared, wrong method wired into `JobRunnerService`

**Declaration** (`types/gaslibs/index.d.ts:908-922`):
```ts
class ServiceFactory {
  static configure(config?: Record<string, unknown>): void;
  static reset(resetConfig?: boolean): void;
  static getLogger(): LoggerService;
  static getUtilitiesService(): UtilsService;   // <-- wrong return type
  static getDriveService(): DriveService;
  static getDocumentService(): DocumentService;
  static getMailService(options?: Record<string, unknown>): MailService;
  static getPropertiesService(): LibPropertiesService;
  static getUiService(): LibUiService;
  static getSpreadsheetService(): SpreadsheetService;
  static getPermissionService(): PermissionService;
  static getCacheService(): { getScriptCache(): unknown };
}
```
No `getUtils()` entry exists in the declaration at all.

**Real implementation** (`GasLibraryFactory/GoogleApiWrapper/src/internal/core/ServiceFactory.js`):
```js
// lines 103-109
static getUtilitiesService() {
  if (!ServiceFactory._utilitiesService) {
    const logger = ServiceFactory.getLogger();
    ServiceFactory._utilitiesService = new UtilitiesService(logger);
  }
  return ServiceFactory._utilitiesService;   // GoogleApiWrapper's UtilitiesService (native GAS API wrapper)
}

// lines 116-123
static getUtils() {
  if (!ServiceFactory._utils) {
    const utilitiesService = ServiceFactory.getUtilitiesService();
    ServiceFactory._utils = new UtilsService((ms) => utilitiesService.sleep(ms));
  }
  return ServiceFactory._utils;   // CoreUtilsLib's UtilsService (foundational utility provider)
}
```

These are two distinct real classes:
- `UtilitiesService` (`GoogleApiWrapper/src/services/UtilitiesService.js`, ctor `(logger=console, exceptionService=null)`) — has `sleep(ms)`, `formatDate(date, timeZone, format)` (3 required args, timezone-based). No `formatISODate`, no `isValidEmail`.
- `MyUtilsService` / `UtilsService` (`CoreUtilsLib/src/UtilsService.js`, ctor `(sleepFn=null)`, binds methods sourced from `IdGenerator`/`DateUtils`/`StringUtils`/`SystemEnvironmentUtils`) — has `formatDate(date, format='YYYY-MM-DD', options={utc})` (token-based, from `DateUtils.formatDate`), `formatISODate(date)` (`DateUtils.formatISODate`), `isValidEmail(email)` (`SystemEnvironmentUtils.isValidEmail`).

The `.d.ts`'s standalone `UtilsService` interface (lines 565-572) is itself an accurate description of `MyUtilsService` — the bug is narrowly that `getUtilitiesService()`'s *return type* is misdeclared as that same `UtilsService`, when the method actually returns `UtilitiesService`.

**Live call site** — `src/config/Bootstrap.ts:344-350`:
```ts
export function creaJobRunner(): JobRunnerService {
  return new JobRunnerService(
    ServiceFactory.getLogger(),
    ServiceFactory.getUtilitiesService(),   // runtime value: GoogleApiWrapper.UtilitiesService instance
    new JobDefinitionRegistry(ServiceFactory.getLogger())
  );
}
```
`JobRunnerService`'s real constructor (`GasLibraryFactory/JobRunnerLib/src/JobRunnerService.js`) takes
`(logger, utils, jobDefinitionRegistry)` and expects `utils` to be a `UtilsService` (CoreUtilsLib)
instance. TypeScript accepts this call site because `getUtilitiesService()` is *declared* to return
`UtilsService` — but at runtime it actually returns `UtilitiesService`, a different class from a
different library.

**Why it hasn't hard-crashed yet:** the immediate constructor path only duck-checks the shape and
forwards `utils` into a `TriggerService(logger, utils)`, and `UtilitiesService` does implement
`sleep(ms)`, covering the shallowest usage. Any deeper `JobRunnerLib` code path that calls a
CoreUtilsLib-only method against this object (`formatDate` — different argument meaning between the
two classes — or `isValidEmail`) will either silently produce wrong output (`formatDate` "succeeds"
with the wrong semantics) or throw `TypeError: utils.isValidEmail is not a function` at runtime.

**Fix:**
1. `src/config/Bootstrap.ts:347` — change `ServiceFactory.getUtilitiesService()` to `ServiceFactory.getUtils()`.
2. `types/gaslibs/index.d.ts:912` — correct to `static getUtilitiesService(): UtilitiesService;` and add the missing `static getUtils(): UtilsService;` (both real, currently-undeclared factory methods).

## Ruled out during investigation (false positives from graph-based call resolution, not real issues)

The knowledge graph's low-confidence CALLS resolution surfaced several apparent ALDO→GasLibraryFactory
calls that, on inspection of the actual source, are correct or are false matches on a common method
name (not real linkages to the flagged library symbol):

- `AldoEntity` (`src/domain/entities/AldoEntity.ts`) deliberately `extends Entity` from
  `DomainRepositoryLib` — `this.markDirty(fieldName)` calls in `Carenza.ts`/`LogDocumento.ts` are
  legitimate and the signature matches exactly (`Entity.markDirty(fieldName)`,
  `GasLibraryFactory/DomainRepositoryLib/src/Entity.js:84-87`).
- `this._validateConfig(config, ['folderTipo'])` in `CustomSourceStrategies.ts` correctly resolves
  to `SourceStrategy._validateConfig(config, requiredFields)`
  (`GasLibraryFactory/GasDataImporter/src/internal/extract-strategies/SourceStrategy.js`) — signature matches.
- `this.setResult(ctx, key, value)` in `src/infrastructure/steps/documentSteps.ts` and `emailSteps.ts`
  correctly matches `Step.setResult(context, key, value)`
  (`GasLibraryFactory/PipelineFramework/src/Step.js:165-173`) — ALDO's Step subclasses legitimately
  extend PipelineFramework's `Step`.
- The `add(...)` calls inside `CdcAssembler.assembleFiltrato` and `ClasseRepository`'s
  `getGruppoArticolazione`/`getAllDocentiCDCArticolata` are **local closures** named `add`, not calls
  to `PostProcessorChain.add` — the graph mis-resolved these on name alone (confidence 0.28).

## Verified in sync (spot-checked against the real library, no drift found)

- `ServiceFactory`'s other static factory methods (`getLogger`, `getDriveService`,
  `getDocumentService`, `getMailService`, `getPropertiesService`, `getUiService`,
  `getSpreadsheetService`, `getPermissionService`, `getCacheService`).
- `DomainRepositoryLib.Repository` — constructor and public methods.
- `SheetDBLib.TableService` — constructor and public methods.
- `WorkspaceTemplateEngine.PlaceholderService` — `processString`, `processDocument`, `processSheet`
  (including its `{success, layouts}` result shape), `resolve`.

## Conclusion

One genuine broken linkage found (Finding 1), with a confirmed live, exploitable call site in
`src/config/Bootstrap.ts`. Outside of that, `types/gaslibs/index.d.ts` is closely in sync with the
real GasLibraryFactory implementations across the members checked.
