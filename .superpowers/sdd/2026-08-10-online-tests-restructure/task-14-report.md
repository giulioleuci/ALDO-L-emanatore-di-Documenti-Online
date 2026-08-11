# Task 14 — JobRunner document/email suspend-resume scenarios

## Delivered

- Added `registerJobRunnerChecks`, plus the scoped document and safe-email registrations.
- Each scenario records three independent checks: deterministic suspension, manual resume without duplicate logical targets, and `resetJob` cleanup.
- Suspension verifies the exact lowercase `to_resume` contract, `completed: false`, a partial persisted `state_<jobName>` checkpoint, `trigger_<jobName>`, and the reverse `job_for_trigger_<id>` mapping.
- Resume verifies the exact lowercase `completed` state, `completed: true`, the expected final log cardinality, and zero duplicate document IDs/logical targets.
- Reset verifies `not_started` and removal of the checkpoint plus both trigger mappings. A final guard cancels a still-suspended job if an earlier check fails.
- Email checks require `MASTER.TEST_MODE`, the allow-listed `@onlinetest.aldo.local` recipient, successful test-mode log rows, and the persisted safe-recipient identity.
- Implemented `testJobRunnerDocGen` and `testJobRunnerEmail` persisted-dataset launchers and replaced the aggregate suite's pending JobRunner registration.

## Deterministic checkpoint contract

- JobRunnerLib now exposes each yielded checkpoint to `JobExecutor` before evaluating an expired deadline. This guarantees that a unit of work which crosses the deadline persists its newly produced `nextIndex` instead of `null`.
- The reusable library change is committed independently as `25b0b35fb7c22df169bd98ed43248685e05ef3b2` (`fix(JobRunnerLib): persist checkpoint before timeout`).
- `EmailBatchService.start` and `avviaInvioNotificheDataDriven` accept an optional `chunkSize`. Omitting it preserves the production default of 100; only the deterministic online scenario supplies `1`.
- The online email check verifies `chunkSize: 1`, `nextIndex`, processed-target alignment, and a partial percentage before resume. Near-integer totals reconstructed from progress tolerate only IEEE-754 rounding error.

## TDD evidence

- Red: the new JobRunnerLib regression received a `null` resume state after the first unit crossed its 50 ms budget.
- Green: JobRunnerLib `JobQueue.test.js` passes 133/133 after the checkpoint-before-deadline change.
- Red: ALDO start/bootstrap tests showed no explicit `chunkSize`, and the online scenario mock received no deterministic override.
- Green: the five focused ALDO suites pass 56/56, including default compatibility and explicit chunk-size forwarding.
- Red/green: a three-target email progress value (`(1 / 3) * 100`) initially failed total reconstruction, then passed with bounded floating-point rounding.

## Vendor refresh

- Ran `npm run refresh:vendor`.
- Because the primary GasLibraryFactory checkout also contained unrelated uncommitted source changes, the committed `25b0b35` tree was rebuilt in an isolated worktree and its `dist/Code.js` was used for ALDO's vendor artifact.
- `vendor/gaslibs.Code.js` and `vendor/CHECKSUM` now represent the clean committed library tree; `npm run verify:vendor` passes.

## Verification

- ALDO focused tests — 5 suites, 56 tests passed.
- `npm test -- --runInBand` — 156 suites, 1351 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build:online` — passed; its gate also passed 1351 unit and 14 integration tests.
- `npm run verify:vendor` — passed.
- `git diff --check` — passed.
- MCP native-service bypass query — zero ALDO `src/` callers of restricted GAS globals.
- GasLibraryFactory monorepo-wide lint remains baseline-red with 1214 errors outside this change; the touched JobRunner files are Prettier-clean and diff-clean.

Live `clasp push` and GAS execution were not performed because this implementation turn did not authorize an external deployment. The local online bundle is ready for that explicit deployment step.

## Commit plan

- GasLibraryFactory (completed): `fix(JobRunnerLib): persist checkpoint before timeout`
- ALDO: `feat(onlinetests): verify deterministic JobRunner resume`
