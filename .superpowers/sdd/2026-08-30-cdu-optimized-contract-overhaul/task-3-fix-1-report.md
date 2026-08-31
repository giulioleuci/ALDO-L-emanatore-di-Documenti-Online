# Task 3 fix round 1

Status: complete

## Reproduction

`npx jest --config jest.config.cjs test/unit/fixtures/tables.test.ts --runInBand` initially failed: expected `{{focus.alunno.anagrafica.email}}`, received `{{focus.alunno.email}}`.

## Changes

- `FAKEDB/CONF_DOC.csv`: migrated class `anagrafica.id`, `nome`, `terminale`, and `anno` to `classe.id`, `classe.nome`, `classe.isTerminale`, and `classe.anno`; student `anagrafica.nomeCompleto`, `cognomeNome`, and `email` to `alunno.nomeCompleto` and `alunno.email`; teacher `anagrafica.cognome` to `docente.cognome`.
- `FAKEDB/CONF_MAIL.csv`: migrated class IDs and student names to the same canonical paths.
- Updated the unit and build expectations for `{{focus.alunno.email}}`.

Graph `search_code` confirmed no retired `focus.*.anagrafica` paths remain in the changed fixture/test scopes.

## Verification

- `npx jest --config jest.config.cjs test/unit/fixtures/tables.test.ts --runInBand`: 1 suite, 1 test passed.
- `npx jest --config jest.build.config.cjs test/build/fakedb-log-schema.test.ts --runInBand`: 1 suite, 3 tests passed.
- Task 3 focused suite (10 suites): 430 tests passed.

## Commit

Commit: `8943a29` (`fix(cdu): migrate configured fixture templates`)
