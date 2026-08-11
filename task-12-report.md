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

- `npm test` — 154 suites / 1,333 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `git diff --check` — passed.
