# Task 15 — Optional real JobRunner trigger check

## Implemented

- Added `registerJobRunnerTriggerRealeCheck`, isolated from aggregate JobRunner checks.
- Added `executeJobRunnerTriggerReale` and its `testJobRunnerTriggerReale` launcher.
- Polls a suspended document-generation JobRunner for up to five minutes at ten-second intervals.
- On timeout, calls `cancelJob` before reporting failure; `finally` also cancels any still-suspended job.
- Verifies completed status, full duplicate-free `LOG_DOCS`, and removal of the `job_for_trigger_<id>` context property.
- Uses the typed `GoogleApiWrapper` utilities facade through `ServiceFactory.getUtilitiesService().sleep`; deterministic tests cover both injected and default sleep paths.

## Verification

- `npx jest --config jest.config.cjs test/unit/onlinetests/jobRunnerChecks.test.ts test/unit/onlinetests/fullOnlineTests.test.ts` — 10 passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Graph bypass query found no direct native GAS-global calls from `src/`.

The follow-up review regression test verifies the default polling dependency invokes `getUtilitiesService().sleep`, rather than relying on a cast of the unrelated `getUtils()` service.

## Manual live-GAS verification

Not run in this local environment. Run `testJobRunnerTriggerReale` from the GAS Run dropdown against the provisioned online dataset; it should complete in roughly 1–5 minutes, or cancel cleanly on the five-minute timeout.

## Note on job name

The task brief illustrates a `_REALE` suffix, but `avviaGenerazioneDataDriven` persistently names its job `gen_<CONF_DOC>` (verified through the application graph/source). The check uses that actual name so the trigger context resolves and the live test can complete.
