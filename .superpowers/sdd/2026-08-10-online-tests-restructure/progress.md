# SDD ledger — plan: docs/superpowers/plans/2026-08-10-online-tests-restructure.md

## Pre-flight decisions

- User explicitly authorized implementation on `master` despite unrelated deleted extension documents.
- `runFullOnlineTests` will call provisioning with `force: true` to satisfy the fresh-data requirement.
- Import conflict-policy coverage belongs in `testImportCercaDocumenti`; no `testImportPolicy` launcher will be added.
- User chose to revise import fixtures/tests to the current single-key (`STUDENTE`) import contract; no GasLibraryFactory composite-key extension is in scope.

- User decision (Task 18): `createCercaDocumentiStrategy` (`src/application/import/CustomSourceStrategies.ts`) currently aborts the entire per-idGen batch if any one matched LOG_DOCS document is unreadable (no per-document isolation, confirmed via trace of `SourceStrategy.extract()`'s single outer try/catch). Per CLAUDE.md's GasLibraryFactory-first rule, user authorized extending `CustomSourceStrategies.ts` with per-document try/catch + log-and-skip (mirroring `createCercaCartelleClasseStrategy`'s "no matching folder contributes nothing" precedent) rather than dropping the non-sheet-document exclusion sub-case from Task 18.

## Completed tasks

- Task 1: complete — commits `c0d3f4f`, `924fc9e`; independent review and scoped re-review passed.
- Task 2: complete — commits `e6490f9`, `376be3a`; independent review found and the scoped re-review confirmed the GAS global-namespace bridge fix.
- Task 3: complete — commits `c18f9c0`, `4f00af7`; independent review found and the scoped re-review confirmed the seeder-compatible layout fixtures.
- Task 4: complete — commits `de28430`, `fca324f`, `78673bd`; independent reviews resolved real import/Drive fixture contracts. The import scenario deliberately uses its supported single `STUDENTE` conflict key per user decision.
- Task 5: complete — commits `6698397`, `f7d76d8`, `2c5ae71`; independent reviews confirmed the shared-builder migration preserves legacy focal seams while adding the expanded dataset.
- Task 6: complete — commits `24175c4`, `7028af3`; independent review confirmed template markers, canonical CDU paths, nested historical projects, and typed fixture contracts.
- Task 7: complete — commit `1c43585`; independent review confirmed zero-arg provisioning with persisted master and real ordinary/force reuse semantics.
- Task 8: complete — commit `6b256e3`; independent review confirmed report migration, group naming, and LazyRef materialization behavior.
- Task 9: complete — commits `623022a`, `29eb3d7`; independent review confirmed forced aggregate provisioning and real transitional check registrations.
- Task 10: complete — commits `f8c5003`, `6b84f5d`; independent review confirmed document scenario split preserves persisted fixtures and full legacy E2E coverage.
- Task 11: complete — commit `725a142`; independent review confirmed imported-table scenario behavior and dedicated launcher scope.
- Task 12: complete — commits `5e92ebc`, `9c12c55`; independent review confirmed real duplicate-policy checks are rerunnable and run-scoped.
- Task 13: complete — commits `22afe81`, `0423277`, `fc122a5`, `d18868b`; independent review confirmed resumable email jobs recover only their persisted safe recipient and pattern state.
- Task 14: complete — GLF `25b0b35`, ALDO `0b969b4`; independent review confirmed deterministic checkpoint/resume semantics, clean vendor refresh, and default-compatible email chunking.
- Task 15: complete — commits `ba938f4`, `90bbfe0`; independent review confirmed isolated real-trigger polling and typed timeout cleanup.
- Task 16: fix round 1/5 (3 addressed, 0 open — launcher policy moved under `testImportCercaDocumenti`; ghost row now readable; TIMESTAMP conflict case added; commits `ed99fe7`..`6bbb9b9`).
- Task 16: complete (commits `ed99fe7`..`6bbb9b9`, review clean) — independent review then scoped re-review confirmed policy checks live under the approved `testImportCercaDocumenti` launcher, the ghost row is genuinely readable, and TIMESTAMP now exercises real newer/older conflicts alongside the fallback.
- Task 17: complete (commit `8e8bea5`, review clean) — testImportCartelleClasse implemented; reviewer independently traced `_CLASSE` persistence through GasDataImporter/SheetDBLib and confirmed OVERWRITE full-table-wipe semantics; `registerLegacyImportChecks` composition idiom (mirrors existing `registerLegacyDocumentiChecks`) verified as real and clean, not scope creep.
- Task 18: fix round 2/5 (review finding addressed — strict Drive metadata refreshes incomplete cache entries before MIME classification; stale online-test comment corrected; GLF `f3ebfdc`..`8ff7a07`, ALDO `f2c4bed`..`40a9429`).
- Task 18: complete (GLF `f3ebfdc`..`8ff7a07`, ALDO `f2c4bed`..`40a9429`, scoped review clean) — `CERCA_DOCUMENTI` skips only confirmed non-spreadsheet files; metadata lookup, quota/auth/network, and spreadsheet-read errors propagate.
- Task 19: fix round 1/5 (3 addressed, 0 open — storico carenze GST→STO exposed in canonical CDU; depth 0 omits storico path; persistent launchers have historical artifact URLs; commits `b15e95d`..`5ce6283`).
- Task 19: complete (commits `b15e95d`..`5ce6283`, review clean) — independent review and scoped re-review confirmed exact CDU historical paths, reconciliation, depth semantics, scoped launchers, real render, and persisted diagnostics.
- Task 20: complete (commit `dcd11d7`, report correction `49c78c1`, review clean) — SharedTestDatabase articulation checks preserve existing boundaries/composite/final variation and add overlap/three visibility modes. Runtime launcher supplies both historical IDs/URLs; live-GAS validation remains deferred.
- Task 21: minor (deferred): real-GAS verification unavailable by user instruction; `clasp` must not be used. Offline evidence will be supplied by build/tests; user will provide GAS console output separately.
- Task 21: fix round 1/5 (review finding addressed — dotted MAIN/ITP assignments now survive historical repository paths, with two-year real continuity assertion; commit `f5d951e`).
- Task 21: complete (commits `32a1d22`, `f5d951e`, scoped re-review clean; live-GAS deferred) — authorized dotted ITP foundation, fixture/config, seven checks, launcher and offline test gates complete.
- Task 22: fix round 1/5 (3 addressed, 0 open — exact ACL preserves domain/anyone/type/role; aggregate retains legacy assignment coverage; Drive ACL default stays SOLO_TITOLARI; commit `195e489`).
- Task 22: fix round 2/5 (review finding addressed — protected ranges use approved `CONF_DOC.PERMESSI.regolaSupplente.file`, no `PARAMETRI` split; commit `3bcd2ce`).
- Task 22: complete (GLF `ad8da3b`, ALDO `afc3a15`..`195e489`, `3bcd2ce`, scoped re-review clean; live-GAS deferred) — Supplenze/ruoli and real-service ACL callbacks implemented, vendor refreshed from clean GLF clone, offline gates complete.
- Task 23: fix round 1/5 (3 addressed, 0 open — aggregate runs real cache isolation; active-user ACL is exact; Drive operational errors report FAILED; commit `7f90214`).
- Task 23: complete (commits `3540262`..`7f90214`, review clean; live-GAS deferred) — second master fixture, cache isolation, gated active permissions and offline test/build gates complete.
- Task 24: complete (commit `de0a951`, review clean; live-GAS/coverage deferred by user) — fresh offline build passed; design doc accurately records offline completion and explicit GAS validation handoff.
