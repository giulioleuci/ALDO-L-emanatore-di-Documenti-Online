# Task 20 report — articolazione sul dataset condiviso

## Stato

Completato e committed: `dcd11d7 feat(onlinetests): articolazione sul dataset condiviso`.

## Discovery e vincoli

- Discovery iniziale via `codebase-memory-mcp`: `search_graph`, `search_code`, `trace_path` su `registerArticolazioneChecks`, `SharedTestDatabase`, `testArticolazione` e launcher persistiti.
- Consultati `GasLibraryFactory/DOCS_LIBS/RoleResolutionLib.md` e `GasOnlineTestFramework.md`. Riutilizzati `ContextBuilder`, `recipe`, `GestioneSupplenti` e `TestRunner`; nessuna nuova utility locale o chiamata GAS nativa.
- `OnlineTestsEntry.ts` gia importa ed espone `testArticolazione` su `globalThis`: nessuna modifica richiesta.

## TDD

RED iniziale verificato:

- test launcher: `ConfigurationError: non implementato`;
- composizione check: mancavano registrazioni overlap e visibilita dei tre modi.

GREEN:

- `registerArticolazioneChecks` accetta ora esattamente `SharedTestDatabase` e legge il guard da `masterTestMode`;
- conservati boundary 2026-08-05/11, sostituzione composita `LAB.SEMINARIO_POMERIDIANO` e variazione ITA finale;
- aggiunto check reale overlap al boundary 2026-09-01: `4A/MAT` espone solo docente20 e `2B/ING` solo docente18, senza leak tra classi;
- aggiunto check reale `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, `ENTRAMBI` sullo slot LAB durante la supplenza;
- launcher persistito ricostruisce `SharedTestDatabase` con entrambi gli ID/URL storici reali da MASTER, installa interceptor CDU e registra solo articolazione;
- `testArticolazione` usa `runReportedSuite('articolazione', 'ARTICOLAZIONE_SCENARIO', ...)`.

## Verifiche

- `npx jest --config jest.config.cjs test/unit/onlinetests/articolazione-checks.test.ts test/unit/onlinetests/index.test.ts --runInBand` — PASS, 2 suite / 31 test.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npx jest --config jest.config.cjs test/unit/onlinetests --runInBand` — PASS, 23 suite / 214 test.
- `npm run test:build -- --runInBand` — PASS.
- `git diff --check` e cached check — PASS prima commit.

## File intenzionali

- `src/onlinetests/checks/articolazioneChecks.ts`
- `src/onlinetests/index.ts`
- `test/unit/onlinetests/articolazione-checks.test.ts`
- `test/unit/onlinetests/index.test.ts`

Le quattro eliminazioni preesistenti sotto `ESTENSIONI_ALDO/` non sono state incluse.

## Concern

Verifica live GAS richiede dataset provisionato e deployment online; non eseguita in questa sessione. Il launcher e build gate offline sono verdi.
