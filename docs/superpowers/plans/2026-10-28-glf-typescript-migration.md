# ALDO / TypeScript GLF migration

Goal: build and test ALDO using the TypeScript library in `GasLibraryFactory/`,
with no runtime or tooling dependency on `GasLibraryFactory_JS/`.

Keep the existing GAS bundle integration: Apps Script still requires compiled
JavaScript. Do not rewrite SGSA business logic or introduce a second library loader.

- [x] Index this workspace and the new library separately with codebase-memory-mcp.
- [x] Build the TypeScript GLF and replace the vendored runtime bundle.
- [x] Build and vendor GLF's declarations and consumer TypeScript aliases.
- [x] Check ALDO's narrowed public member contracts against the generated declarations.
- [x] Remove unused ambient members absent from the new GLF.
- [x] Reject JavaScript-only GLF checkouts during vendor refresh.
- [x] Exclude the archived library from Git, lint, and formatting.
- [x] Verify typecheck, lint, integration tests, vendor checksum, and production build.
- [x] Verify build contracts other than the full online-build smoke test.
- [x] Restore `GasProcessMonitorLib` in TypeScript after the user's continuation
      authorized the recommended port. Preserve the original service, sidebar, mocks,
      storage behavior and all 51 monitoring tests; wire all GLF build/test/doc entry points.
- [x] Re-run all unit tests and full build tests after restoring monitoring.
- [x] Resolve the review finding about missing external declaration dependencies:
      add `es-toolkit`, `fuse.js`, and `zod` as ALDO development dependencies.
- [x] Check generated declarations with `skipLibCheck: false`, including both
      instance and static API members. Fix the serialized-error optional stack type
      and ALDO's missing ambient extraction-method declaration exposed by that check.
- [x] Update GLF's migration fixtures for sixteen libraries and exclude `GLF_OLD/`.

Final runtime verification: ALDO 191/191 unit suites, 2005/2005 tests;
integration 15/15; complete build suite 15/15, including online-mode builds.
GLF source suite: 215/215 suites, 6870/6870 tests. The original eight ALDO
failures disappeared after restoring the monitoring library.

The generated declarations are a dependency snapshot. ALDO retains its existing
narrowed structural service contracts, including domain-specific repository
seams; the new compile-time checks verify public instance/static member availability, while
runtime behavior is checked against the actual vendored bundle.

No Google deployment or live GAS tests have been run. The archived library has
not been deleted, and the new GLF's pre-existing uncommitted migration was preserved.
