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
