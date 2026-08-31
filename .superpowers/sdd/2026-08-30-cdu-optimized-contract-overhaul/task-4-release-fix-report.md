# Task 4 release-fix report

## Root causes

- `cattedra-cross-cutting-agreement.test.ts` still read removed flat CDU fields (`consiglioDiClasse`, `consiglioDiClasseTitolare`, and `consiglioDiClasseFiltrato`) and nested `anagrafica.email` values.
- `expression-engine.test.ts` constructed the removed `focus.classe.anagrafica.anno` shape instead of the fixture's canonical `focus.classe.isTerminale` condition.
- The online imported-table diagnostic fixture and production check still used the removed `focus.classe.anagrafica.nome` placeholder.

## Changes

- Updated assertions to `focus.classe.consiglio.elenco`, `.titolari`, and `focus.alunno.consiglio.elenco`, using canonical `PersonaVM.email`.
- Updated expression contexts and assertions to `focus.classe.isTerminale`.
- Updated the online diagnostic placeholder and its unit fixture to `{{focus.classe.nome}}`.
- No compatibility aliases or weakened assertions added.

## Verification

| Command | Result |
| --- | --- |
| `npx jest --config jest.config.cjs --runInBand test/unit/application/cattedra-cross-cutting-agreement.test.ts test/unit/infrastructure/expression-engine.test.ts` | PASS: 2 suites, 8 tests |
| `npm test -- --runInBand` | PASS: 182 suites, 1795 tests |
| `npm run test:build -- --runInBand` | PASS: 5 suites, 12 tests |
| `git diff --check` | PASS |
