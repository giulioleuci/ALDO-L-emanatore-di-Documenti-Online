# Task 23 report — cache isolation and active permissions

## Implemented

- Added `cacheIsolamentoChecks.ts`: warms `1A` through normal `initAldo` on shared fixture, calls `resetAldo()`, opens a second persisted MASTER/current-year fixture with `1A` absent, and requires its repository lookup to return `null`. It resets and restores shared container in `finally`.
- Provisioning now creates `_ALDO_E2E_CACHE_ISOLATED_MASTER` plus `_ALDO_E2E_CACHE_ISOLATED_SAMPLE`; all required DB tables exist, but `CLASSI` deliberately omits `1A`. Its master ID persists under `CACHE_ISOLATED_MASTER_SPREADSHEET_ID`.
- Added dedicated `executeCacheIsolamento` / `testCacheIsolamento`. Aggregate run documents this dedicated two-master requirement as `SKIPPED` rather than pretending one-fixture coverage proves isolation.
- Added `permessiChecks.ts` and `executePermessiAttivi` / `testPermessiAttivi`. It reads identity via `SessionActiveUserFacade` and real Drive permission read-back.
- Extended report shape with `status: 'skipped'` and `skipped` count. Empty Workspace identity or only group/domain ACL evidence produces documented `SKIPPED`; quota/auth/network/read-back errors propagate and cannot become skips.

## Offline evidence

- RED observed: missing check modules/report `skip()`/fixture builder method.
- Focused GREEN: 6 suites, 24 tests.
- Full unit suite: 163 suites, 1420 tests passed.
- `npm run lint`, `npm run typecheck`, `git diff --check`, Prettier check: passed.
- `npm run build:online`: passed, including 163 unit suites and 5 integration suites / 14 tests. No `clasp`, push, or live GAS execution, per user instruction.

## Live behavior pending user console output

1. Run `creaDatiMockDrive` to provision/update both fixture properties.
2. Run `testCacheIsolamento`: must pass only if no cached shared `1A` leaks into isolated fixture.
3. Run `testPermessiAttivi`: passes with direct active-user ACL; reports `SKIPPED` with reason when Workspace policy hides identity or only group/domain attribution is available; operational Drive errors fail visibly.

## Review fix round 1

- Aggregate `runFullOnlineTests` now invokes real `registerCacheIsolamentoChecks` with the persisted isolated master ID. The callback still restores the shared container in `finally`; no aggregate fake skip remains.
- Active-user ACL is exact: empty evidence, another direct user, `anyone`, or any extra direct principal fails. `SKIPPED` is reserved for an ACL consisting exclusively of group/domain evidence, where Workspace cannot attribute membership to the active user.
- Strict Drive permission read-back now occurs inside the registered runner callback. Quota, auth, and network errors therefore become a normal failed `OnlineTestReport` result rather than escaping registration and discarding accumulated results.
- Added callback outcome support to `TestRunner` so policy gating determined by real read-back records a documented skipped result.
- RED/GREEN: focused 6 suites / 28 tests; full 163 suites / 1424 tests; lint, typecheck, diff check, and `build:online` (5 integration suites / 14 tests) pass. No clasp, push, or live GAS run.
