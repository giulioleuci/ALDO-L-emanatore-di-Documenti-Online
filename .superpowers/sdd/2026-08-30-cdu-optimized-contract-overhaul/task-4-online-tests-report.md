# Task 4 online-check checkpoint

## Scope

Aligned the recovered online-check slice and its unit mirrors with the canonical CDU
contract. Historical documents and unrelated untracked artifacts were left untouched.

## Root-cause groups

- `contextEngineChecks.ts:802`: the owner assertion had already been removed for the
  canonical `materieColonne.gruppi[].colonne[]` shape, but its error message still
  interpolated the deleted `actualOwner` local. Removed only that stale diagnostic field.
- Template/config mirrors: expectations still used retired paths such as
  `focus.classe.anagrafica.nome`, `articolazione.partners`, legacy history collections,
  and `materieColonne.group1/2/3`. Updated online unit mirrors to the canonical paths
  emitted by the provisioners/builders.
- Canonical collection fixtures: articulated council, history, and representative unit
  fixtures still supplied bare arrays/legacy nested records. Updated only those fixtures
  to `consiglio.elenco`, `storico.anni`, nested class references, history `anniPrecedenti`,
  and representative `.elenco` containers.
- `E2eTemplateProvisioner`: representative loops were still authored against the bare
  container; migrated them to `.elenco` so generated templates match the public CDU shape.

## Evidence

```text
npm run typecheck
  PASS (tsc --noEmit; test/types/tsconfig.json --noEmit)

npx jest --config jest.config.cjs test/unit/onlinetests --runInBand
  PASS
  Test Suites: 31 passed, 31 total
  Tests:       350 passed, 350 total

git diff --check
  PASS
```

The initial online-unit run had 7 failing suites / 21 failing tests: 5 stale
sample-builder expectations, 1 articulated-council fixture, 11 stale template
expectations, 1 sample-builder expectation, 2 history fixtures, and 1 representative
fixture. After canonical mirror/fixture updates, all 31 suites and 350 tests pass.
