# TEST_MODE email redirect — design

Spec 1 of 3 (see also: testonline build mode + mock DB + e2e scenarios; MASTER-sheet/GAS-project setup scripts).

## Goal

ALDO needs a system-wide "test mode" so that a full end-to-end run (document generation + email sends) can be exercised against real Google Workspace APIs without ever emailing a real teacher, coordinator, or family. When active, every outgoing email — regardless of which recipient field (To/CC/BCC) it would otherwise use — must instead go to a single address: the Drive owner of the MASTER spreadsheet.

Toggle is a new `MASTER.TEST_MODE` boolean column, read once per script execution.

## Schema changes

- `SPECS_ALDO/01_SCHEMA_DATABASE.md` — add `TEST_MODE` (boolean, default `false`/blank) to the MASTER table definition, alongside `ANNO_SCOLASTICO`, `ID_SPREADSHEET`, `ID_CARTELLA_GOOGLE`, `DIRIGENTE_SCOLASTICO`, `SUPERVISORE_EMAIL`.
- `src/config/schema.ts` — add `TEST_MODE: 'TEST_MODE'` to `COL_MASTER`.
- `src/domain/entities/MasterConfig.ts` — add `testMode: boolean` field:
  - parsed from `data[COL_MASTER.TEST_MODE]`, coerced from the sheet's boolean/string representation (mirror however the sheet layer already types booleans elsewhere in this entity's siblings — no new parsing convention).
  - included in `toData()`.
  - blank/missing column on existing MASTER rows must parse to `false` (backward compatible, no migration required).

## GasLibraryFactory extension

No existing library service can resolve "Drive file owner email" (checked `GasLibraryFactory/DOCS_LIBS`, zero hits; `IDriveFacade` has no such method). Per this repo's GasLibraryFactory-first constraint, and the user's explicit choice, this is added to the library, not ALDO-local:

- `GoogleApiWrapper`'s `DriveService` gains a generic method, e.g. `getFileOwnerEmail(fileId: string): string`, implemented via the Drive API (`Drive.Files.get(fileId, { fields: 'owners' })` or equivalent batched call per the library's existing Bridge Pattern for Drive v2→v3).
- Documented in `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper_docs.md` under the existing Drive section.
- Unit-tested in GasLibraryFactory's own test suite against its fake Drive backend.
- Pulled into ALDO via the normal `npm run refresh:vendor` / `npm run verify:vendor` flow (`vendor/gaslibs.Code.js`, `vendor/CHECKSUM`).

## ALDO facade change

- `src/infrastructure/facades/DriveServiceFacade.ts` — `IDriveFacade` gains:
  ```ts
  getFileOwnerEmail(fileId: string): string;
  ```
  implemented as a thin wrap over the new vendored `DriveService.getFileOwnerEmail`, same pattern as the facade's other methods (composes the library call behind ALDO's own interface; no business logic).

## Wiring (composition root)

`src/config/Bootstrap.ts`, inside `initAldo()`:

- `annoCorrente: MasterConfig` (current-year MASTER row) and `masterId` (the MASTER spreadsheet's own Drive file id, from `PROP_MASTER_SPREADSHEET_ID`) are already both in scope before `buildAldoContainer(...)` is called (existing lines ~275–282).
- After the container is built (`runtime = buildAldoContainer({...})`), if `annoCorrente.testMode === true`:
  1. Resolve the owner email: `const ownerEmail = deps.drive.getFileOwnerEmail(masterId);` (using the `DriveServiceFacade` instance already constructed for the container, or a call made before container construction if ordering requires it).
  2. `runtime.get<EmailNotificationService>('emailNotificationService').enableTestMode(ownerEmail);`
- If `annoCorrente.testMode` is `false` (or missing), do nothing — `EmailNotificationService` defaults to `testEmail = null`, i.e. real sends, unchanged.
- This check runs once per script execution (`initAldo()` is memoized via the module-level `runtime` cache), not per email send — consistent with the existing execution model.

No changes to `SendEmailStep`, `emailSteps.ts`, or any pipeline step: `EmailNotificationService.enableTestMode(email)` / `disableTestMode()` already exist and already implement the exact required semantics (confirmed with the user):

- `To` is replaced with `[email]`.
- `CC` and `BCC` (including the `SUPERVISORE_EMAIL` BCC) are suppressed entirely.

This is presently only reachable from the manual test-send preview flow (commit `2068905`); TEST_MODE reuses the identical mechanism, just auto-triggered from `MASTER.TEST_MODE` instead of a manual UI action. Manual preview and MASTER-driven TEST_MODE are not mutually exclusive — both ultimately call the same setter, so if both are somehow triggered, the effect is idempotent (still a single redirect target, whichever was set).

## Error handling

If `getFileOwnerEmail` fails (permissions edge case, API error), it must fail loudly at boot, not silently fall through to real sends. Mirror the existing pattern immediately above in `initAldo()` (missing `PROP_MASTER_SPREADSHEET_ID` throws `ConfigurationError`, lines ~276–280): let the facade error propagate, or explicitly wrap and rethrow as `ConfigurationError` with a message identifying the MASTER file id and that TEST_MODE could not be honored. Under no circumstance should a failure to resolve the owner email result in ALDO proceeding with real-recipient sends while `TEST_MODE` is `true`.

## Testing

- `MasterConfig` unit test: `TEST_MODE` column parses to `true`/`false`/default-`false` for blank/missing.
- `Bootstrap` wiring unit test (fake `IDriveFacade`, fake `EmailNotificationService` or spy): asserts `enableTestMode(ownerEmail)` is called iff `annoCorrente.testMode === true`, and is never called when `false`/blank. Assert `getFileOwnerEmail` is called with the MASTER spreadsheet id, not the per-year database id.
- Bootstrap wiring test: boot fails with `ConfigurationError` (not a silent fallback) when `testMode === true` and `getFileOwnerEmail` throws.
- GasLibraryFactory: unit test for `DriveService.getFileOwnerEmail` against the library's existing fake Drive backend (owner present, owner absent/shared-drive edge case if the library's fake supports it).

## Documentation

- `SPECS_ALDO/01_SCHEMA_DATABASE.md` — add `TEST_MODE` to the MASTER table.
- `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper_docs.md` — document `getFileOwnerEmail`.
- Inline docstrings on `MasterConfig.testMode`, `DriveServiceFacade.getFileOwnerEmail`, and the new block in `Bootstrap.ts`, following this codebase's existing spec-reference-comment convention.
- **Not** creating `SPECS_ALDO/11_PIPELINE_EMAIL.md` or any other numbered doc in the `04–15` range: those files are referenced by existing code comments (`ref 11 §15`, `ref 06 §0`, etc.) but do not exist anywhere in the repo today — only `00_PANORAMICA.md`, `01_SCHEMA_DATABASE.md`, `02_CDU_STRUTTURA.md`, `03_VALORI_OGGETTO_ED_ENUM.md`, and `MAT_NON_STANDARD.md` are present. This design does not attempt to reconstruct the missing numbered specs; flagged for the user separately.

## Out of scope (covered by the other two specs)

- The `online`/`testonline` build mode extension, the mock database (3 classes incl. one large/60 students, 20 teachers) and document templates, and the 7 e2e scenarios that exercise this TEST_MODE flag end-to-end.
- The setup script that creates the MASTER sheet + associates a GAS project, and the push script for `testonline` mode.
