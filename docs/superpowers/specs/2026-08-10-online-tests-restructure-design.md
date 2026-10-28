# Design: ristrutturazione degli online test (OnlineTests.gs + EntryPointOnlineTests)

Date: 2026-08-10
Status: offline implemented; GAS validation pending user-provided console output.

## Obiettivo

Riscrivere e riorganizzare completamente gli online test di ALDO su GAS reale:

- `OnlineTests.gs` = solo test code (strumentato istanbul, unico file GAS di suite).
- `EntryPointOnlineTests.gs` = file aggiuntivo con funzioni di lancio per singoli
  test o gruppi di test (file leggibile, commenti conservati).
- Dataset mock esteso: ≥10 classi, ≥2 multi-unit (articolate), ≥200 studenti,
  ≥8 materie per classe, ≥3 indirizzi.
- Integrazione JobRunner: test della creazione documenti tramite meccanismo
  sospensione/ripresa dei trigger (seam deterministico + test trigger reale
  opzionale).
- Funzione di creazione dati mock su Drive eseguita prima di tutto (non
  necessariamente a ogni run).
- Separazione chiara degli scenari con funzioni dedicate; scenari distinti per
  generazione documenti e invio email.
- Integrare i gap di `MISSING_TESTS.md` coerenti con la ristrutturazione
  (**intero DoD** approvato dall'utente: P0 + P1 + essential online-only).

## Decisioni chiave (da brainstorming)

| #   | Decisione              | Scelta                                                                                                        |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Identità dataset       | Dataset unico condiviso su Drive; sostituisce `E2eSampleDatabaseBuilder` (5 classi) e `SampleDatabaseBuilder` |
| 2   | Test trigger JobRunner | Sospensione deterministica (maxDurationMs minimo) come default + test trigger reale opzionale separato        |
| 3   | Scenario email         | Batch via JobRunner + `enableTestMode()` (indirizzo sicuro, LOG_MAIL `testMode`)                              |
| 4   | Ambito gap             | Intero DoD di `MISSING_TESTS.md`                                                                              |
| 5   | Struttura file/build   | Approccio A: due entry webpack → `OnlineTests.gs` (strumentato) + `EntryPointOnlineTests.gs` (leggibile)      |
| 6   | Granularità launcher   | Intermedia: ~20 launcher di scenario + provisioning + 2 aggregati (25 totali)                                 |
| 7   | JobRunner              | A (deterministico, nel runner) + B (`testJobRunnerTriggerReale()`, mai nel runner aggregato)                  |
| 8   | Vecchi runner          | `runOnlineTests`, `runE2eScenarios`, `runArticolazioneScenarios` rimossi; `dumpOnlineCoverage` invariato      |

## Sezione 1 — Dataset mock condiviso (`creaDatiMockDrive`)

Sostituisce le fixture esistenti. Un'unica funzione di provisioning, **idempotente
per nome** (riusa i contenitori esistenti, ricrea i mancanti; opzione `force`
per rebuild completo).

**Struttura Drive:**

- Root riusabile **`_ALDO_E2E_ROOT`** (niente cartelle timestampate — requisito
  fixture di MISSING_TESTS).
- **Master** con `MASTER.TEST_MODE=true` + anno corrente + **2 anni precedenti**
  (2025-2026, 2024-2025) con tutte le tabelle usate dai provider storici:
  `CLASSI, ALUNNI, DOCENTI, MATERIE, CARENZE, PIANI, MOV_ALUNNI, PROGETTI, LOG_DOCS`.

**Dati (asimmetrici per indirizzo):**

- **3 indirizzi** con set materie distinti:
  - Liceo Classico → 1A, 2A, 4A (GRECO, LATINO, FILOSOFIA)
  - Scienze Umane → 1B, 2B, 5B (PSICOLOGIA, SCIENZE_UMANE, DIRITTO_ECONOMIA)
  - Scientifico → 3C (parent), 3C-S, 3C-C (articolata), 4D, 5E
- **≥10 classi** (11: 1A, 2A, 4A, 1B, 2B, 5B, 3C, 3C-S, 3C-C, 4D, 5E) con
  **≥2 multi-unit**: `3C`+`3C-S`+`3C-C` (esistente) e `5B`+`5B-S`+`5B-C` (nuova).
- **≥200 studenti** (~18-20/classe) incl. casi storici PROMOSSO/NON_PROMOSSO/
  RITIRATO/SCONOSCIUTO e ripetenti.
- **≥8 materie/classe** di base + dotted (`LAB.GRUPPO_A`,
  `LAB.SEMINARIO_POMERIDIANO`, `INTERPRET.CHITARRA`, `INTERPRET.FLAUTO`) + ITP
  (2 docenti) + `MATERIE.EVOLUZIONE` (GST→STO).
- **SUPPLENZE + VARIAZIONI_CATTEDRA**: catena SUPPLENZE > VARIAZIONI > CLASSI,
  casi boundary date, sovrapposizioni, `SOLO_TITOLARI`/`SOLO_SUPPLENTI`/
  `ENTRAMBI`, variazione su materia dotted.
- **LOG_FOLD** per `CERCA_CARTELLE_CLASSE` + fogli reali figli nelle cartelle di
  classe (dati asimmetrici, studente sconosciuto, chiave duplicata, foglio
  header-only, decoy non-spreadsheet/trashed).
- **CONF_DOC / CONF_IMP / CONF_MAIL**: un ID dedicato e un `PATH_OUT` unico per
  ogni scenario (nessun riuso incrociato).
- **Template**: i 15 esistenti + nuovi: template tabelle importate (2 marker +
  placeholder CDU circostanti) + 2 sheet sorgente (uno con dati, uno header-only);
  template storico CDU; template loop dotted/ITP.

Identità: solo `@onlinetest.aldo.local`.

**Codice:** nuovo `src/onlinetests/data/` con `SharedTestDatabaseBuilder` che
espone seeder riusabili (`seedAnniPrecedenti`, `seedClassi`, `seedSupplenze`,
`seedLogFold`, `seedConfDoc`, ...).

## Sezione 2 — Launcher e organizzazione scenari (~20 launcher)

Anti-ridondanza: ogni scenario è un gruppo autonomo con checks dedicati; i vecchi
registri (`contextEngineChecks`, `pipelineChecks`, `repositoryChecks`,
`e2eScenarioChecks`, `articolazioneChecks`) ricomposti per scenario.

**Launcher GAS (in `EntryPointOnlineTests.gs`, zero-arg, chiamano globals ambient):**

| Funzione GAS                      | Scenario                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `creaDatiMockDrive()`             | Provisioning dataset condiviso (Sez. 1); prima di tutto                                                        |
| `testDocumentiStandard()`         | Doc standard + template Sheets + protected ranges + interop template                                           |
| `testDocumentiArticolati()`       | Articolate, target COMPLETA/ARTICOLATA, CdC split                                                              |
| `testDocumentiTabelleImportate()` | `DOCUMENTO_CON_TABELLE_IMPORTATE` (P0)                                                                         |
| `testDuplicazioneDocumenti()`     | NEGATA/PERMESSA, file reali, retry idempotente, LOG_DOCS                                                       |
| `testInvioEmail()`                | Batch via JobRunner + test mode + allegati                                                                     |
| `testEmailSicurezza()`            | Soppressione duplicati + identità target tra container + destinatario mai produttivo                           |
| `testJobRunnerDocGen()`           | Sospensione/ripresa deterministica doc + stato/trigger/pulizia                                                 |
| `testJobRunnerEmail()`            | Sospensione/ripresa deterministica email + stato/trigger/pulizia                                               |
| `testJobRunnerTriggerReale()`     | Trigger one-time reale: attesa scatto + resume via contesto; fallback `cancelJob`; MAI in `runFullOnlineTests` |
| `testImportFileSingolo()`         | `FILE_SINGOLO` + mapping + `hasHeaders` + `OVERWRITE`                                                          |
| `testImportCartelleClasse()`      | `CERCA_CARTELLE_CLASSE` storico ASL (P0)                                                                       |
| `testImportCercaDocumenti()`      | `CERCA_DOCUMENTI` + `_CLASSE` + policy (IGNORE/TIMESTAMP/fallback/ATTIVO=false/ghost/misconfig)                |
| `testImportChunked()`             | Import chunked resume senza duplicati né stato residuo                                                         |
| `testRecuperoStoricoAlunno()`     | `ALUNNO_COMPLETO` depth 2 + casi limite                                                                        |
| `testRecuperoStoricoClasse()`     | `CLASSE_COMPLETA` + continuità CdC/ITP + `MATERIE.EVOLUZIONE`                                                  |
| `testRecuperoStoricoDocumenti()`  | `ID_GEN`/famiglia/sottotipo, isolamento PEI/PDP                                                                |
| `testArticolazione()`             | Boundary date, sostituzione composita, CdC split                                                               |
| `testITPeMateriePuntate()`        | `getITPPerMateria`, identità primaria/dotted, nomi, CDU, storico                                               |
| `testSupplenzeERuoli()`           | Date inclusive/esclusive, sovrapposizioni, `SOLO_TITOLARI`/`SOLO_SUPPLENTI`/`ENTRAMBI`                         |
| `testACLReali()`                  | Read-back ACL reali file/cartelle + protected ranges                                                           |
| `testCacheIsolamento()`           | Isolamento cache cross-spreadsheet                                                                             |
| `testPermessiAttivi()`            | Visibilità utente attivo (gated da policy)                                                                     |
| `runFullOnlineTests()`            | Runner aggregato: provisioning fresco + tutti i gruppi (A)                                                     |
| `dumpOnlineCoverage()`            | Reporting coverage (invariato)                                                                                 |

**Organizzazione moduli (`src/onlinetests/`):**

```
src/onlinetests/
├── entrypoints/EntryPointOnlineTests.ts   # nuovo entry webpack → EntryPointOnlineTests.gs
├── OnlineTestsEntry.ts                    # entry webpack → OnlineTests.gs (test code)
├── scenarios/                             # un modulo per gruppo: documenti.ts, email.ts,
│                                          #   import.ts, storico.ts, jobrunner.ts,
│                                          #   articolazione.ts, itpDotted.ts,
│                                          #   supplenzeERuoli.ts, aclReali.ts,
│                                          #   cacheIsolamento.ts, permessi.ts
├── data/                                  # SharedTestDatabaseBuilder + seeder
├── fixture/                               # E2eTemplateProvisioner esteso + factory
├── checks/                                # registri ricomposti per scenario
└── report/                                # TestRunner adapter (OnlineTestReport.ts)
```

Naming: launcher GAS in italiano; funzioni interne/checks in inglese
(`registerXxxChecks`).

## Sezione 3 — Integrazione JobRunner

Basata su meccanismi interni verificati (`JobExecutor.execute`,
`JobRunnerTriggerManager`, `JobRunnerExecutionController`).

**A. Sospensione deterministica (default, in `runFullOnlineTests`):**

1. `maxDurationMs` = 50 in `avviaGenerazioneDataDriven(c, configId, runner, 50)`
   / `avviaInvioNotificheDataDriven(c, patternId, runner, 50)`.
2. Il generatore elabora il primo chunk, poi `withTimeout` lancia
   `TimeoutException` → stato `to_resume` + `resumeState` (`nextIndex`) in
   ScriptProperties + trigger one-time `resumeJob` tracciato da
   `trigger_<jobName>` / `job_for_trigger_<id>`.
3. Assert in sospensione:
   - `runner.getStatus(jobName)` → state `to_resume`, completed `false`
   - proprietà `trigger_<jobName>` e `job_for_trigger_<id>` presenti
   - `LOG_DOCS`/`LOG_MAIL` parziali (solo target processati), zero duplicati
   - risultato chiamata `avvia...` = `null`
4. Resume manuale: `riprendiJobSospeso(c, runner, jobName, budgetAmpio)` →
   assert state `COMPLETED`, totale atteso, zero duplicati (ripresa da
   `nextIndex`, non restart).
5. **Pulizia trigger residuo:** il resume manuale non fa scattare il trigger
   one-time → resta pendente → **`runner.resetJob(jobName)` obbligatorio**
   (`JobQueue.resetJobState`: elimina trigger + reset stato). Assert proprietà
   `trigger_<jobName>`/`job_for_trigger_<id>` rimosse. Nessun trigger reale
   lasciato.
   - `creaJobRunner()` espone già `resetJob`/`cancelJob`/`getStatus` →
     **nessuna modifica al codice di produzione ALDO**.

**Config:** doc → CONF_DOC dedicato (`JOBRUNNER_DOC`, target ≥2, `PATH_OUT`
unico, `DUPLICAZIONE=NEGATA`); email → CONF_MAIL dedicato + `enableTestMode`
PRIMA di `start`. Resume ri-usa gli handler registrati da `riprendiJobSospeso`
(`Bootstrap.ts:391-411`).

**B. Test trigger reale (opzionale, `testJobRunnerTriggerReale()`):**

- MAI eseguito da `runFullOnlineTests`; si lancia manualmente.
- Procedura: sospensione come A → **polling** di `getStatus` finché state ≠
  `to_resume` (timeout 5 min, sleep tra i poll) → il trigger one-time `resumeJob`
  scatta (delay minimo GAS 60s) → `resumeJob` globale (`src/index.ts`) →
  `riprendiJobSospeso` risolve jobName da `job_for_trigger_<id>` → completa.
- Assert: `COMPLETED`, totale, zero duplicati, proprietà rimosse (trigger
  one-time consumato eliminato da GAS dopo lo scatto).
- **Fallback determinista:** se timeout senza scatto → `runner.cancelJob(jobName)`
  (imposta `cancelled` + `deleteExistingTriggers`) e fallimento pulito.

**Rischio gestito:** il percorso reale è coperto solo da B (opzionale); A non
crea mai trigger persistenti.

## Sezione 4 — Build (Approccio A)

**`webpack.config.cjs`:**

- Nuovo entry `entrypoints-onlinetests` (stile `makeEntrypointsConfig`:
  `iife:false`, readable, NON strumentato) → `./src/onlinetests/entrypoints/
EntryPointOnlineTests.ts` → `dist/EntryPointOnlineTests.js`. Gated dallo
  stesso flag `online` di `onlinetestsConfig`.

**`scripts/build-and-prepare.cjs`:**

- **online:** dopo `OnlineTests.js`, leggere `EntryPointOnlineTests.js`, emettere
  `dist/EntryPointOnlineTests.gs` leggibile con commenti (stesso trattamento dei
  `productionEntryPoints`), rimuovere il `.js` intermedio.
- **non-online:** cleanup di `EntryPointOnlineTests.js`/`.gs` (come
  `OnlineTests.js`).
- **Patch V8-compat:** applicata anche a `EntryPointOnlineTests.gs` (come a
  `OnlineTests.js`).
- **`gas-source-map.json`:** index anche per `EntryPointOnlineTests.gs`.

**`.clasp.json`:** nessuna modifica — `rootDir=./dist` + `.claspignore`
(esclude mappe/log) → push automatico.

**Strumentazione:** istanbul SOLO su `OnlineTests.js`; il file launcher resta
fuori dai contatori.

**Risultato file GAS (online):** `Code.gs` + `EntryPoints*.gs` +
`OnlineTests.gs` (strumentato) + `EntryPointOnlineTests.gs` (leggibile).

## Sezione 5 — Coordinamento, report, helper, pulizia

1. **`runFullOnlineTests`:** provisioning fresco (`creaDatiMockDrive` con
   `force`) poi tutti i gruppi. Criteri P0: MASTER fresco (nessuna lettura da
   run precedenti), report con nome gruppo + URL/ID fixture su failure,
   `MASTER.TEST_MODE=true` verificato prima di ogni operazione email.
2. **Report:** `TestRunner` adapter esteso — ogni `OnlineTestResult` include
   suite/group name + URL/ID fixture quando fallisce.
3. **Test mode email:** `enableTestMode(emailSicuro)` prima di ogni `start`
   batch; guardia `TEST_MODE=true` in `creaDatiMockDrive` e nei launcher email.
4. **Helper LazyRef:** funzione condivisa `materializeLazyRef` per materializzare
   i LazyRef storici prima di assert/render — mai JSON-stringify di oggetti
   implementativi.
5. **Policy pulizia (DoD):** root riusabile `_ALDO_E2E_ROOT`; nessun trigger
   permanente (`resetJob`/`cancelJob`); nessuna mail reale (solo
   `@onlinetest.aldo.local`, test mode); nessun artefatto Drive illimitato
   (riuso); date deterministiche (data assignment fissa, anni fissi).
6. **Idempotenza tra run:** CONF_* dedicati per scenario, `PATH_OUT` unico,
   assert scoped per run (jobId), coerenti con `DUPLICAZIONE`, nessun assert
   order-dependent.
7. **Vecchi runner rimossi:** `runOnlineTests`, `runE2eScenarios`,
   `runArticolazioneScenarios`. `dumpOnlineCoverage` invariato.
8. **Ordine di esecuzione in `runFullOnlineTests`:** ordine deterministico dei
   gruppi: provisioning → documenti (standard, articolati, tabelle importate,
   duplicazione) → email (testInvioEmail, testEmailSicurezza) → JobRunner
   (doc, email) → import → storico → articolazione/ITP/supplenze → ACL/cache/
   permessi. I gruppi documenti precedono email/import perché questi possono
   consumare i LOG_DOCS generati; gli assert restano comunque scoped per run.
9. **Coverage:** istanbul solo su scenario code; `dumpOnlineCoverage` invariato;
   coverage-index (spec 2026-07-26) aggiornata.

## Definizione di done (da MISSING_TESTS.md, intero DoD)

- un runner documentato (runFullOnlineTests) esegue ogni gruppo su dati freschi;
- tutte e tre le strategie import + path conflict/validation testate su GAS reale;
- documenti con tabelle importate generati e ispezionati;
- import ASL per classi (folder-per-class) testato con folder IDs noti;
- materie dotted e ITP assertate su repository, CDU, documento, permessi, ruolo,
  sostituzione e storico;
- recupero storico studente/classe/documento/progetto/carenza/piano/mobilità/
  docente materializzato da due spreadsheet precedenti;
- test live verificano lo stato esterno solo-GAS: file Drive, tabelle Google
  Docs, protected ranges, permessi, log test-mode Gmail, continuità
  ScriptProperties, isolamento cross-spreadsheet;
- ogni test usa dati sintetici deterministici e non lascia mail pericolose,
  trigger permanenti o artefatti Drive illimitati.

## Riferimenti

- `MISSING_TESTS.md` (gap report, DoD)
- `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `SPECS_ALDO/02_CDU_STRUTTURA.md`
- `GasLibraryFactory/DOCS_LIBS/JobRunnerLib.md`,
  `GasLibraryFactory/DOCS_LIBS/GasOnlineTestFramework.md`
- `docs/superpowers/specs/2026-07-26-test-completion-coverage-index-design.md`
- `docs/superpowers/specs/2026-08-08-articolata-cdc-partner-scoping-design.md`
  (per il fix fixture articolate già applicato)
