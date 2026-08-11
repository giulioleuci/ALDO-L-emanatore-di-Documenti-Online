# Task 12 report — document-duplication online scenario

## Delivered

- Added `E2E_DOC_DUPLICAZIONE_PERMESSA`, a dedicated `CONF_DOC` recipe with
  `DUPLICAZIONE=PERMESSA` and an isolated output folder.
- Added the `duplicazione` document-check scope. It executes before the other
  document checks in the aggregate suite, so the `NEGATA` assertion starts
  from a known Drive state.
- The `NEGATA` check generates the same personalized plan twice and requires
  exactly one additional Drive file and one matching `LOG_DOCS` row.
- The `PERMESSA` check generates twice and requires two additional Drive
  artifacts, two distinct `LOG_DOCS.ID` values, and resolved/trimmed file
  names.
- Wired `testDuplicazioneDocumenti` through the persisted document runner;
  `runFullOnlineTests` includes the checks through the aggregate `all` scope.

## Red/green evidence

- Before implementation, the duplicate-scenario registration test failed
  because neither check existed; the dedicated-fixture test failed because the
  permitted recipe was absent.
- Focused checks now run the callbacks against Drive-count and `LOG_DOCS`
  doubles: 11 tests across `documentiChecks.test.ts` and `seeders.test.ts`
  pass.

## Verification

- `npm test` — 154 suites / 1,334 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `git diff --check` — passed.

## Review follow-up

- The persisted launcher is rerunnable: each check snapshots matching
  `LOG_DOCS.ID` values and destination-folder file counts before the run. The
  `NEGATA` branch verifies its first attempt's delta separately from its
  `SKIPPED` retry; on later launcher runs both attempts can correctly produce
  zero deltas. The `PERMESSA` branch requires exactly two new file IDs and two
  new log rows for that invocation, regardless of older rows.
- Filename validation now inspects raw `LOG_DOCS.NOME` values before any local
  trimming. A regression check proves leading/trailing whitespace is rejected.
- Regression verification: `documentiChecks.test.ts` now covers both a second
  execution of the same callbacks and a whitespace-padded persisted filename.
