# Ristrutturazione Online Tests ALDO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ristrutturare gli online test di ALDO: dataset mock condiviso esteso (≥10 classi, ≥2 articolate, ≥200 studenti, ≥8 materie, 3 indirizzi, 2 anni precedenti), scenari separati con launcher dedicati (`OnlineTests.gs` + `EntryPointOnlineTests.gs`), integrazione JobRunner (sospensione deterministica + trigger reale opzionale), copertura dell'intero DoD di `MISSING_TESTS.md`.

**Architecture:** Due entry webpack in `--mode=online`: `OnlineTests.js` (test code, strumentato istanbul) e `EntryPointOnlineTests.gs` (launcher leggibili che chiamano globals ambient). Un `SharedTestDatabaseBuilder` (evoluzione di `E2eSampleDatabaseBuilder`) provvede un dataset unico su Drive sotto `_ALDO_E2E_ROOT`. `runFullOnlineTests()` = provisioning fresco + tutti i gruppi. Ogni launcher verifica uno scenario autonomo senza assert condivisi.

**Tech Stack:** TypeScript → Babel (Chrome 80) → GAS V8; webpack 5; `GasOnlineTestFramework.EnhancedTestRunner` (via adapter `TestRunner`); `JobRunnerLib` (`JobRunnerService`); `GasLibraryFactory` vendor bundle.

## Global Constraints

- Target GAS V8: solo codice sincrono; niente API Node/browser.
- Globals GAS nativi (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `ScriptApp`, `MailApp`, ...) toccabili SOLO in `src/onlinetests/**` e `GasLibraryFactory/GasOnlineTestFramework/**` (eccezione sanctionata). Lint `no-restricted-globals` passa solo per `src/onlinetests/**` — nessuna modifica a `src/config`, `src/application`, `src/infrastructure` per aggirare il divieto.
- **`GasLibraryFactory` first:** nessuna logica ri-implementata in ALDO. Se un caso richiede un'estensione della libreria, FERMARSI e chiedere. I seam usati qui esistono già: `JobRunnerService.run/resume/resetJob/cancelJob/getStatus`, `EmailNotificationService.enableTestMode`, `DocumentBatchService.start`, `ImportService.start`, `CERCA_CARTELLE_CLASSE`/`CERCA_DOCUMENTI`/`FILE_SINGOLO` (già in `ImportRecipeMapper`), `E2eTemplateProvisioner`/`GasArtifactFactory` (già in ALDO onlinetests).
- Mai modificare `dist/*` (generato) e `vendor/*` (rigenerato da `npm run refresh:vendor`).
- Identità test: solo `@onlinetest.aldo.local`; `MASTER.TEST_MODE=true` verificato prima di ogni operazione email.
- Root Drive riusabile `_ALDO_E2E_ROOT` (già usato da `executeE2eScenarios`); niente cartelle timestampate; riuso per nome; nessun trigger permanente; nessuna mail reale.
- Naming: launcher GAS in italiano; funzioni interne/checks in inglese (`registerXxxChecks`).
- Riferimenti spec: `docs/superpowers/specs/2026-08-10-online-tests-restructure-design.md`; gap: `MISSING_TESTS.md`; schema: `SPECS_ALDO/01_SCHEMA_DATABASE.md`, CDU: `SPECS_ALDO/02_CDU_STRUTTURA.md`.
- Comandi verifica: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build:online`, `npm run push:online`.

---

## File Structure (target)

```
src/onlinetests/
├── entrypoints/EntryPointOnlineTests.ts   # NUOVO — entry webpack → EntryPointOnlineTests.gs
├── OnlineTestsEntry.ts                    # MODIFICATO — entry webpack → OnlineTests.gs; espone i global di scenario
├── index.ts                               # MODIFICATO — orchestratori scenario; rimozione vecchi runner
├── report/OnlineTestReport.ts             # SPOSTATO/esteso — TestRunner con group+fixture URLs
├── report/MaterializeHelper.ts            # NUOVO — materializeLazyRef
├── data/SharedTestDatabaseBuilder.ts      # NUOVO (evolve E2eSampleDatabaseBuilder.ts, che viene eliminato)
├── data/Seeders.ts                        # NUOVO — seeder riusabili (anni precedenti, LOG_FOLD, conf, classi)
├── data/fixtures.ts                       # NUOVO — costanti dataset (classi, indirizzi, materie, studenti, conf ids)
├── fixture/E2eTemplateProvisioner.ts      # MODIFICATO — nuovi template + campi E2eTemplateIds
├── fixture/GasArtifactFactory.ts          # invariato
├── fixture/GasSampleSpreadsheetFactory.ts # invariato
├── checks/                                # MODIFICATO — registri ricomposti per scenario
│   ├── documentiChecks.ts                 # NUOVO (da e2eScenarioChecks, parte doc)
│   ├── emailChecks.ts                     # NUOVO
│   ├── jobRunnerChecks.ts                 # NUOVO
│   ├── importChecks.ts                    # NUOVO (estende repositoryChecks: import)
│   ├── storicoChecks.ts                   # NUOVO
│   ├── articolazioneChecks.ts             # esistente
│   ├── itpDottedChecks.ts                 # NUOVO
│   ├── supplenzeRuoliChecks.ts            # NUOVO
│   ├── aclRealiChecks.ts                  # NUOVO
│   ├── cacheIsolamentoChecks.ts           # NUOVO
│   └── permessiChecks.ts                  # NUOVO
├── E2eActiveRepresentativesInterceptor.ts # invariato
├── SampleDatabaseBuilder.ts               # RIMOSSO (sostituito da data/SharedTestDatabaseBuilder)
└── GasSampleSpreadsheetFactory.ts         # invariato
webpack.config.cjs                         # MODIFICATO — entry entrypoints-onlinetests
scripts/build-and-prepare.cjs              # MODIFICATO — EntryPointOnlineTests.gs (online) + cleanup + patch
```

---

## Phase 0 — Build e scheletro dei file

### Task 1: Entry webpack `entrypoints-onlinetests` → `EntryPointOnlineTests.gs`

**Files:**
- Modify: `webpack.config.cjs:93-111`
- Modify: `scripts/build-and-prepare.cjs` (step 1 summary ~:101-124, webpack online gate ~:43, cleanup ~:176-177, online branch ~:316-329, patch pass ~:485-575, gas-source-map ~:950, summary ~:1022)
- Test: `test/build/` (verifica shape di output; vedere `test/build/` esistente)

**Interfaces:**
- Consumes: entry online esistente `./src/onlinetests/OnlineTestsEntry.ts`; pattern `makeEntrypointsConfig`.
- Produces: file `dist/EntryPointOnlineTests.gs` in `--mode=online`; assente negli altri mode.

- [ ] **Step 1: Aggiungi il nuovo entry in `webpack.config.cjs`**

In `module.exports`, dopo `onlinetestsConfig`:

```js
  const onlineEntrypointsConfig = makeEntrypointsConfig(
    'entrypoints-onlinetests',
    './src/onlinetests/entrypoints/EntryPointOnlineTests.ts',
    'EntryPointOnlineTests.js'
  );
```

E nella lista finale, dentro il gate `online`:

```js
  const configs = [coreConfig, ...entrypointsConfigs];
  if (online) {
    configs.push(onlinetestsConfig, onlineEntrypointsConfig);
  }
  return configs;
```

Nota: `makeEntrypointsConfig` usa `babelRule` (NON `instrumentedBabelRule`) — i launcher non sono strumentati.

- [ ] **Step 2: Crea l'entry sorgente (scheletro che passa la build)**

`src/onlinetests/entrypoints/EntryPointOnlineTests.ts` (i launcher reali verranno aggiunti nei task successivi):

```ts
/**
 * EntryPointOnlineTests — launcher GAS leggibili per gli online test (design
 * 2026-08-10). Chiamano SOLO globals ambient esposti da OnlineTests.js; nessun
 * import: webpack manterrebbe duplicati i moduli nei due bundle GAS.
 */
const gasGlobal = globalThis as typeof globalThis & {
  creaDatiMockDrive: () => unknown;
  runFullOnlineTests: () => unknown;
  dumpOnlineCoverage: () => void;
};
export function creaDatiMockDrive(): unknown {
  return gasGlobal.creaDatiMockDrive();
}
export function runFullOnlineTests(): unknown {
  return gasGlobal.runFullOnlineTests();
}
export function dumpOnlineCoverage(): void {
  return gasGlobal.dumpOnlineCoverage();
}
```

- [ ] **Step 3: Aggiorna `scripts/build-and-prepare.cjs` (branch online)**

Nel branch online (~riga 316-329), dopo la scrittura di `OnlineTests.js`, aggiungi:

```js
      const onlineEntrypointsBundle = path.join(distDir, 'EntryPointOnlineTests.js');
      if (!fs.existsSync(onlineEntrypointsBundle)) {
        fail('dist/EntryPointOnlineTests.js was not produced by Webpack');
        process.exit(1);
      }
      // Launcher leggibili con commenti conservati (stesso trattamento dei
      // productionEntryPoints); il .js intermedio viene rimosso.
      fs.copyFileSync(onlineEntrypointsBundle, path.join(distDir, 'EntryPointOnlineTests.gs'));
      fs.rmSync(onlineEntrypointsBundle, { force: true });
      fs.rmSync(onlineEntrypointsBundle + '.map', { force: true });
      ok('Wrote dist/EntryPointOnlineTests.gs (readable launchers, kept separate)');
```

Nel blocco cleanup non-online (~riga 176-177), accanto alla rimozione di `OnlineTests.js`:

```js
    fs.rmSync(path.join(distDir, 'EntryPointOnlineTests.js'), { force: true });
    fs.rmSync(path.join(distDir, 'EntryPointOnlineTests.gs'), { force: true });
```

- [ ] **Step 4: Applica il pass di patch V8-compat anche a `EntryPointOnlineTests.gs`**

Nel pass patch (attorno a riga 485-575), estendi la lista dei file patchati: replica la logica di `OnlineTests.js` (`ok(\`Wrote patched ${file} (...)\`)`) per `EntryPointOnlineTests.gs`. Se il pass è implementato come funzione riusabile, chiamarla per entrambi; altrimenti duplicare il blocco (nel file c'è già un pattern per Code.js + OnlineTests.js).

- [ ] **Step 5: Index `EntryPointOnlineTests.gs` in `gas-source-map.json`**

Nel generatore (attorno a riga 950, blocco `gasMapEntries.push`), aggiungi una voce per `dist/EntryPointOnlineTests.js.map` con lo stesso pattern delle altre voci. Se la source-map del file viene rimossa nello step 3, generare la voce PRIMA della rimozione (riordinare gli step: index prima di `rmSync` del `.map`, o leggere la map prima di cancellarla).

- [ ] **Step 6: Verifica build in entrambe le modalità**

Run: `npm run build:online`
Expected: `dist/EntryPointOnlineTests.gs` presente e leggibile; `dist/EntryPointOnlineTests.js` assente; `OnlineTests.js` presente.

Run: `npm run build:production`
Expected: né `EntryPointOnlineTests.js` né `.gs` in `dist`; build OK.

- [ ] **Step 7: Test build di shape**

In `test/build/`, aggiungi un test che, dopo un build online (o verificando lo script), asserisce la presenza di `EntryPointOnlineTests.gs` e l'assenza del `.js`. Segui il pattern dei test build esistenti (es. verifiche su `OnlineTests.js`). Se `test/build` usa un hook su `build-and-prepare.cjs`, estendilo; altrimenti aggiungi un caso che chiama lo script con `--mode=online` in un dir temporaneo.

Run: `npm run test:build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add webpack.config.cjs scripts/build-and-prepare.cjs src/onlinetests/entrypoints/EntryPointOnlineTests.ts test/build
git commit -m "build: entry EntryPointOnlineTests.gs per gli online test (launcher leggibili)"
```

### Task 2: Scheletro `OnlineTestsEntry.ts` — tutti i global di scenario esposti

**Files:**
- Modify: `src/onlinetests/OnlineTestsEntry.ts`
- Create: `src/onlinetests/index.ts` (ristrutturato nei task successivi — qui solo gli export che servono alla build)

**Interfaces:**
- Consumes: `index.ts` (funzioni orchestratore per gruppo).
- Produces: globalThis con TUTTE le funzioni scenario: `creaDatiMockDrive`, `testDocumentiStandard`, `testDocumentiArticolati`, `testDocumentiTabelleImportate`, `testDuplicazioneDocumenti`, `testInvioEmail`, `testEmailSicurezza`, `testJobRunnerDocGen`, `testJobRunnerEmail`, `testJobRunnerTriggerReale`, `testImportFileSingolo`, `testImportCartelleClasse`, `testImportCercaDocumenti`, `testImportChunked`, `testRecuperoStoricoAlunno`, `testRecuperoStoricoClasse`, `testRecuperoStoricoDocumenti`, `testArticolazione`, `testITPeMateriePuntate`, `testSupplenzeERuoli`, `testACLReali`, `testCacheIsolamento`, `testPermessiAttivi`, `runFullOnlineTests`, `dumpOnlineCoverage`.

- [ ] **Step 1: Riscrivi `OnlineTestsEntry.ts` con la mappa completa**

```ts
import {
  dumpOnlineCoverage,
  runFullOnlineTests,
  testACLReali,
  testArticolazione,
  testCacheIsolamento,
  testDocumentiArticolati,
  testDocumentiStandard,
  testDocumentiTabelleImportate,
  testDuplicazioneDocumenti,
  testEmailSicurezza,
  testImportCartelleClasse,
  testImportCercaDocumenti,
  testImportChunked,
  testImportFileSingolo,
  testInvioEmail,
  testITPeMateriePuntate,
  testJobRunnerDocGen,
  testJobRunnerEmail,
  testJobRunnerTriggerReale,
  testPermessiAttivi,
  testRecuperoStoricoAlunno,
  testRecuperoStoricoClasse,
  testRecuperoStoricoDocumenti,
  testSupplenzeERuoli
} from './index';

/** Espone solo launcher zero-arg GAS. Vedi design 2026-08-10 Sez. 2. */
const gasGlobal = globalThis as typeof globalThis & {
  creaDatiMockDrive: () => unknown;
  testDocumentiStandard: typeof testDocumentiStandard;
  testDocumentiArticolati: typeof testDocumentiArticolati;
  testDocumentiTabelleImportate: typeof testDocumentiTabelleImportate;
  testDuplicazioneDocumenti: typeof testDuplicazioneDocumenti;
  testInvioEmail: typeof testInvioEmail;
  testEmailSicurezza: typeof testEmailSicurezza;
  testJobRunnerDocGen: typeof testJobRunnerDocGen;
  testJobRunnerEmail: typeof testJobRunnerEmail;
  testJobRunnerTriggerReale: typeof testJobRunnerTriggerReale;
  testImportFileSingolo: typeof testImportFileSingolo;
  testImportCartelleClasse: typeof testImportCartelleClasse;
  testImportCercaDocumenti: typeof testImportCercaDocumenti;
  testImportChunked: typeof testImportChunked;
  testRecuperoStoricoAlunno: typeof testRecuperoStoricoAlunno;
  testRecuperoStoricoClasse: typeof testRecuperoStoricoClasse;
  testRecuperoStoricoDocumenti: typeof testRecuperoStoricoDocumenti;
  testArticolazione: typeof testArticolazione;
  testITPeMateriePuntate: typeof testITPeMateriePuntate;
  testSupplenzeERuoli: typeof testSupplenzeERuoli;
  testACLReali: typeof testACLReali;
  testCacheIsolamento: typeof testCacheIsolamento;
  testPermessiAttivi: typeof testPermessiAttivi;
  runFullOnlineTests: typeof runFullOnlineTests;
  dumpOnlineCoverage: typeof dumpOnlineCoverage;
};

gasGlobal.creaDatiMockDrive = () => creaDatiMockDrive();
// ... tutte le assegnazioni gasGlobal.testXxx = testXxx; ...
gasGlobal.runFullOnlineTests = runFullOnlineTests;
gasGlobal.dumpOnlineCoverage = dumpOnlineCoverage;
```

Dove `creaDatiMockDrive` è importata come funzione da `./index`. (Aggiungere le 24 assegnazioni mancanti esplicitamente; nessun loop.)

- [ ] **Step 2: `index.ts` — definisci stub che compilano**

In `index.ts`, aggiungi gli orchestratori scenario come stub che lanciano `new Error('non implementato')` (verranno implementati nei task delle fasi successive), esportati con le firme esatte usate da `OnlineTestsEntry.ts`: ogni `testXxx` ha segnatura `(): OnlineTestReport`; `runFullOnlineTests(): OnlineTestReport`; `creaDatiMockDrive(): unknown`; `dumpOnlineCoverage(): void` (già esistente). Rimuovi `executeOnlineTests`, `executeE2eScenarios`, `executeArticolazioneScenarios`, `runOnlineTests`, `runE2eScenarios`, `runArticolazioneScenarios` SOLO quando i loro call-site (task successivi) sono migrati — per ora lasciali.

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build:online`
Expected: typecheck e lint puliti; build online produce `OnlineTests.js` + `EntryPointOnlineTests.gs` che contiene `testDocumentiStandard` ecc.

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests/OnlineTestsEntry.ts src/onlinetests/index.ts src/onlinetests/entrypoints
git commit -m "feat(onlinetests): scheletro global di scenario (launcher zero-arg)"
```

---

## Phase 1 — Dataset condiviso (`creaDatiMockDrive`)

### Task 3: `data/fixtures.ts` — costanti del nuovo dataset

**Files:**
- Create: `src/onlinetests/data/fixtures.ts`

**Interfaces:**
- Produces: costanti riusabili dai seeder e dai checks: `ALL_CLASSI`, `INDIRIZZI`, `MATERIE_PER_INDIRIZZO`, `CLASS_LAYOUTS`, `STUDENT_TOTALE`, `ANNI_PRECEDENTI`, `CONF_DOC_*`, `CONF_IMP_*`, `CONF_MAIL_*` nuovi, `JOBRUNNER_DOC`, `TEMPLATE_*`.

- [ ] **Step 1: Scrivi `data/fixtures.ts`**

```ts
/** Dataset condiviso online test (design 2026-08-10 Sez. 1). */
export const INDIRIZZO_CLASSICO = 'IND_CLASSICO';
export const INDIRIZZO_SCIENTIFICO = 'IND_SCIENTIFICO';
export const INDIRIZZO_SCIENTIFICO_APPLICATE = 'IND_SCIENTIFICO_APPLICATE';

export const ALL_CLASSI = [
  '1A', '2A', '4A',                    // classico
  '1B', '2B', '5B', '5B-S', '5B-C',    // scienze umane (+ articolata 5B)
  '3C', '3C-S', '3C-C', '4D', '5E'     // scientifico (+ articolata 3C)
] as const; // 13 classi

export const MATERIE_BASE = ['MAT', 'ITA', 'ING', 'STO', 'IRC', 'ALT'];
export const MATERIE_CLASSICO = [...MATERIE_BASE, 'GRECO', 'LATINO', 'FILOSOFIA'];
export const MATERIE_SCIENZE_UMANE = [...MATERIE_BASE, 'PSICOLOGIA', 'SCIENZE_UMANE', 'DIRITTO_ECONOMIA'];
export const MATERIE_SCIENTIFICO = [...MATERIE_BASE, 'SCIENZE', 'FISICA', 'INFORMATICA'];
export const MATERIE_PUNTATE = ['LAB.GRUPPO_A', 'LAB.SEMINARIO_POMERIDIANO', 'INTERPRET.CHITARRA', 'INTERPRET.FLAUTO'];

export const CLASSI_CLASSICO = ['1A', '2A', '4A'];
export const CLASSI_SCIENZE_UMANE = ['1B', '2B', '5B', '5B-S', '5B-C'];
export const CLASSI_SCIENTIFICO = ['3C', '3C-S', '3C-C', '4D', '5E'];

export const STUDENT_TOTALE = 220;

export const ANNO_CORRENTE = '2026-2027';
export const ANNI_PRECEDENTI = ['2025-2026', '2024-2025'] as const;

export const CONF_DOC_JOBRUNNER = 'JOBRUNNER_DOC';
export const CONF_DOC_TABELLE = 'E2E_DOC_TABELLE';
export const CONF_DOC_STORICO = 'E2E_DOC_STORICO';
export const CONF_DOC_DOTTED = 'E2E_DOC_DOTTED';
export const CONF_IMP_ASL_CARTELLE = 'E2E_IMP_ASL_CARTELLE';
export const CONF_IMP_CERCA_DOCUMENTI = 'E2E_IMP_CERCA_DOCUMENTI';
export const CONF_IMP_CHUNKED = 'E2E_IMP_CHUNKED';
export const CONF_MAIL_JOBRUNNER = 'E2E_MAIL_JOBRUNNER';
export const CONF_MAIL_STORICO = 'E2E_MAIL_STORICO';

export const EMAIL_TEST_SAFE = 'sgsa-onlinetests@onlinetest.aldo.local';

/** date deterministiche (MISSING_TESTS: niente valori dipendenti da clock) */
export const ASSIGNMENT_DATE = new Date('2026-07-15T09:00:00Z');
export const SUPPLENZA_INIZIO = new Date('2026-09-01T00:00:00Z');
export const SUPPLENZA_FINE = new Date('2026-10-15T23:59:59Z');
```

(La lista materie è il minimo garantito; ogni classe riceve ≥8 materie = MATERIE_BASE + specifiche indirizzo.)

- [ ] **Step 2: Typecheck + unit test della purezza (nessun stato GAS)**

Run: `npm run typecheck && npm test`
Expected: PASS. Aggiungere `test/unit/onlinetests/fixtures.test.ts` che asserisce `ALL_CLASSI.length >= 10`, ≥2 classi articolate, `STUDENT_TOTALE >= 200`, ≥8 materie per indirizzo.

- [ ] **Step 3: Commit**

```bash
git add src/onlinetests/data/fixtures.ts test/unit/onlinetests/fixtures.test.ts
git commit -m "feat(onlinetests): costanti dataset condiviso (13 classi, 3 indirizzi, 220 studenti)"
```

### Task 4: `data/Seeders.ts` — seeder per anni precedenti, LOG_FOLD, conf dedicate

**Files:**
- Create: `src/onlinetests/data/Seeders.ts`

**Interfaces:**
- Consumes: `fixtures.ts`, `ISampleSpreadsheet`, `IDriveFacade`, `E2eTemplateIds`.
- Produces: `seedAnniPrecedenti(sample, master)`, `seedLogFold(sample, drive, templateIds)`, `seedConfDedicated(sample, templateIds)`, `seedStorico(sample)`.

- [ ] **Step 1: Implementa i seeder (base)**

```ts
import type { ISampleSpreadsheet } from '../SampleDatabaseBuilder';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { E2eTemplateIds } from '../E2eSampleDatabaseBuilder';
import { ANNI_PRECEDENTI } from './fixtures';
import { TABLE } from '../../config/schema';

/**
 * Anni precedenti (2025-2026, 2024-2025) con TUTTE le tabelle lette dai provider
 * storici (MISSING_TESTS P0 storico): CLASSI, ALUNNI, DOCENTI, MATERIE, CARENZE,
 * PIANI, MOV_ALUNNI, PROGETTI, LOG_DOCS. La doc comment del vecchio builder che
 * definiva queste tabelle "dead weight" è falsa per i provider storici.
 */
export function seedAnniPrecedenti(
  master: ISampleSpreadsheet,
  sample: ISampleSpreadsheet
): void {
  for (const anno of ANNI_PRECEDENTI) {
    const prior = sample.createSpreadsheet(`_ALDO_E2E_PRIOR_${anno}`);
    const tables = [TABLE.CLASSI, TABLE.ALUNNI, TABLE.DOCENTI, TABLE.MATERIE,
      TABLE.CARENZE, TABLE.PIANI, TABLE.MOV_ALUNNI, TABLE.PROGETTI, TABLE.LOG_DOCS];
    for (const t of tables) prior.addSheet(t, /* header per tabella come in HEADERS */ []);
    // righe: vedi step 2/3 (promozioni, RITIRATO, GST→STO, progetti con/referee)
    master.addRow(TABLE.MASTER, { /* ANNO, ID_SPREADSHEET, TEST_MODE=true, ... */ });
  }
}
```

(Le firme esatte di `ISampleSpreadsheet`/`createSpreadsheet`/`addSheet`/`addRow` vanno prese da `SampleDatabaseBuilder.ts`; il builder attuale le usa già — copiarne la convenzione. `HEADERS` esistente in `E2eSampleDatabaseBuilder.ts` è la fonte degli header per tabella.)

- [ ] **Step 2: Implementa `seedLogFold` e `seedConfDedicated`**

`seedLogFold`: per ogni classe eleggibile ASL (`3C`, `3C-S`, `3C-C`, `5B`, `5B-S`, `5B-C`) crea cartella figlia sotto la root fixture, un foglio reale per classe con dati asimmetrici (ore/studenti diversi), un foglio header-only, un decoy trashed (se la facade lo consente), e registra righe `LOG_FOLD` con il tipo di cartella unico. Include: studente sconosciuto, chiave duplicata, una classe non eleggibile con decoy (`2B`).

`seedConfDedicated`: righe `CONF_DOC` per `JOBRUNNER_DOC` (generator `PIANI_PERSONALIZZATI` o dedicato, target ≥2 classi, `PATH_OUT` unico, `DUPLICAZIONE=NEGATA`), `E2E_DOC_TABELLE` (generator `DOCUMENTO_CON_TABELLE_IMPORTATE`, `GDOC`, template tabelle, `REGISTRA_DOC`); righe `CONF_IMP` per `E2E_IMP_ASL_CARTELLE` (`CERCA_CARTELLE_CLASSE`, `folderTipo`, `hasHeaders`, mapping `STUDENTE`+anno, target `ASL`, conflict `OVERWRITE`), `E2E_IMP_CERCA_DOCUMENTI` (`CERCA_DOCUMENTI`, `idGen`, `tipo`), `E2E_IMP_CHUNKED` (qualsiasi strategia `FILE_SINGOLO`, `ATTIVO=true`); righe `CONF_MAIL` per `E2E_MAIL_JOBRUNNER` e `E2E_MAIL_STORICO` (ognuna con `PATH_OUT`/identificativi unici, destinatari `@onlinetest.aldo.local`). Le colonne esatte sono `COL_CONF_DOC`/`COL_CONF_IMP`/`COL_CONF_MAIL` (già in `config/schema`).

- [ ] **Step 3: Test di unità dei seeder (offline, con ISampleSpreadsheet fake)**

`test/unit/onlinetests/seeders.test.ts`: con un fake di `ISampleSpreadsheet`/`IDriveFacade` (pattern dei test unit esistenti di `E2eSampleDatabaseBuilder`), asserisci che `seedAnniPrecedenti` crea 2 DB precedenti con tutte e 9 le tabelle, `seedLogFold` crea una cartella+foglio per classe eleggibile e NESSUNA per `2B`, `seedConfDedicated` crea le righe dedicate con `PATH_OUT` unici.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests/data/Seeders.ts test/unit/onlinetests/seeders.test.ts
git commit -m "feat(onlinetests): seeder anni precedenti, LOG_FOLD, CONF dedicati"
```

### Task 5: `data/SharedTestDatabaseBuilder` — builder unico (evolve `E2eSampleDatabaseBuilder`)

**Files:**
- Create: `src/onlinetests/data/SharedTestDatabaseBuilder.ts`
- Delete: `src/onlinetests/E2eSampleDatabaseBuilder.ts` (dopo la migrazione dei call-site: `index.ts`, `E2eTemplateProvisioner.ts`, `checks/*`)
- Modify: `src/onlinetests/index.ts` (usa il nuovo builder)

**Interfaces:**
- Consumes: `fixtures.ts`, `Seeders.ts`, `E2eTemplateIds`, `ISampleSpreadsheetFactory`, `IDriveFacade`.
- Produces: `class SharedTestDatabaseBuilder { constructor(spreadsheets, drive); build(templateIds, master, opts?: {force?: boolean}): SharedTestDatabase }`; `SharedTestDatabase` estende la vecchia `E2eSampleDatabase` aggiungendo `priorSampleSpreadsheetId2`, `logFoldFolderUrl`, `jobRunnerDocConfigId`, ecc. Espone TUTTI gli export del vecchio builder che i checks importano (`CLASSE_A`, `e2eDocenteEmail`, `CARENZA_ALUNNO_1`, `CONF_DOC_PIANI`, `E2eTemplateIds`, ...) — ri-esportati da `fixtures.ts` o da un `data/index.ts` per non rompere gli import.

- [ ] **Step 1: Migra `E2eSampleDatabaseBuilder` in `data/SharedTestDatabaseBuilder.ts`**

Copia il file, rinomina la classe, aggiorna `build()`:
- usa `ALL_CLASSI`/`CLASS_LAYOUTS` da `fixtures.ts` (13 classi, layouts con `coordIndex`, `articolazione`, conteggi alunni che sommano a `STUDENT_TOTALE`);
- seeda 3 indirizzi con materie specifiche (assegnazioni cattedra per classe/materia coerentemente con le materie dell'indirizzo);
- `seedSupplenzeEVariazioni` esteso: casi boundary (`SUPPLENZA_INIZIO`/`SUPPLENZA_FINE`), sovrapposizione su classe diversa, `SOLO_TITOLARI`/`SOLO_SUPPLENTI`/`ENTRAMBI`, variazione su `LAB.SEMINARIO_POMERIDIANO`, ITP su `INTERPRET.CHITARRA`;
- chiama `seedLogFold`, `seedConfDedicated`, `seedAnniPrecedenti` (in questo ordine, dopo `seedConfImp`);
- `E2eSampleDatabase` → `SharedTestDatabase` con i campi aggiuntivi.

Aggiorna il file di `HEADERS` per includere ogni nuova tabella usata dagli anni precedenti (stessa struttura di `HEADERS` attuale).

- [ ] **Step 2: Migra i call-site**

`src/onlinetests/index.ts`: sostituisci `new E2eSampleDatabaseBuilder(...)` con `new SharedTestDatabaseBuilder(...)`; il sample tipizzato diventa `SharedTestDatabase`. `E2eTemplateProvisioner.ts`: import di `TIPI_PIANO`/`E2eTemplateIds`/`e2eAlunnoEmail` dal nuovo percorso. `checks/*`: aggiorna gli import di costanti dal vecchio builder al nuovo. Poi elimina `E2eSampleDatabaseBuilder.ts`.

- [ ] **Step 3: Aggiorna i test unit offline esistenti**

`test/unit/onlinetests/` che referenziano `E2eSampleDatabaseBuilder`/`E2eSampleDatabase`: aggiornare gli import e adattare le asserzioni ai nuovi dati (es. conteggio classi). Aggiungi assert: ≥10 classi, ≥2 articolate, `STUDENT_TOTALE` studenti, ≥8 materie/classe, 2 DB precedenti.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests/data src/onlinetests/index.ts src/onlinetests/checks test/unit/onlinetests
git commit -m "feat(onlinetests): SharedTestDatabaseBuilder — dataset condiviso esteso"
```

### Task 6: `E2eTemplateProvisioner` esteso — template tabelle importate, storico, dotted

**Files:**
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/data/SharedTestDatabaseBuilder.ts` (tipi `E2eTemplateIds`)

**Interfaces:**
- Consumes: `IArtifactFactory` (invariato), `E2eDocumentTable`, `E2eDocumentParagraphInput`.
- Produces: `E2eTemplateIds` con campi nuovi: `tabelleImportate: string`, `tabellaSorgenteDati: string`, `tabellaSorgenteVuota: string`, `storico: string`, `dotted: string`, `storicoEmail: string`.

- [ ] **Step 1: Estendi `E2eTemplateIds`**

In `E2eSampleDatabaseBuilder.ts` (poi `data/SharedTestDatabaseBuilder.ts`) aggiungi i 6 campi sopra all'interfaccia `E2eTemplateIds`.

- [ ] **Step 2: Aggiungi i template nel provisioner**

Template **tabelle importate** (`NAME_DOC_TABELLE = 'E2E Doc Tabelle Importate Template'`): paragrafi con placeholder CDU attorno a 2 marker di tabella (marker esatti richiesti da `findTablePlaceholders`/`DocumentoConTabelleImportateGeneratorStrategy` — usare la sintassi esatta del codice esistente, vedi `src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts`), testo dopo ogni marker. Usare `E2eDocumentTable` per le tabelle incorporate (header + ≥2 righe) e una tabella vuota (header-only) per il secondo marker.

**Sheet sorgente**: `createSheet('E2E Tabella Sorgente Dati')` con header + 2 righe letterali; `createSheet('E2E Tabella Sorgente Vuota')` con solo header (via `SheetValueUpdate`).

Template **storico** (`NAME_DOC_STORICO`): paragrafi che consumano `focus.alunno.storico`/`focus.classe.storico` (path esatti da `SPECS_ALDO/02_CDU_STRUTTURA.md` — verificare i campi con i provider `StoricoAlunniService`/`StoricoClasseProvider`).

Template **dotted/ITP** (`NAME_DOC_DOTTED`): loop `{{#bullet_list:focus.classe.didattica.assegnazioni}}...{{/bullet_list}}` su materie dotted con ITP (`focus.classe.didattica.assegnazioni` path da confermare con `02_CDU_STRUTTURA.md`).

Template **storico email** (`NAME_DOC_STORICO_EMAIL`): paragrafi per il documento allegato all'email `E2E_MAIL_STORICO`.

Aggiungi i nomi in `provision()` e nei relativi `E2eTemplateIds`. I contenuti vanno autorati UNA volta (mai ri-appesi su riuso — vincolo `IArtifactFactory`).

- [ ] **Step 3: Test unit offline del provisioner**

`test/unit/onlinetests/templateProvisioner.test.ts`: con `IArtifactFactory` fake, verifica che `provision` restituisca i nuovi id, che il template tabelle contenga i 2 marker e i placeholder CDU, che gli sheet sorgente abbiano righe/header attesi.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/data test/unit/onlinetests
git commit -m "feat(onlinetests): template tabelle importate, storico, dotted/ITP"
```

### Task 7: `creaDatiMockDrive` — provisioning idempotente

**Files:**
- Modify: `src/onlinetests/index.ts` (nuova orchestratrice `executeCreaDatiMockDrive` + `creaDatiMockDrive` launcher)

**Interfaces:**
- Consumes: `SharedTestDatabaseBuilder`, `E2eTemplateProvisioner`, `mintE2eRootFolder` (esistente), `PROP_ONLINETEST_MASTER_SPREADSHEET_ID`.
- Produces: `creaDatiMockDrive(): unknown` — provvede l'intero dataset e ritorna un riepilogo; idempotente per nome; opzione `force` via `ScriptProperties.get('ALDO_E2E_FORCE_REBUILD') === 'true'` (i launcher GAS sono zero-arg).

- [ ] **Step 1: Implementa `executeCreaDatiMockDrive`**

```ts
export function executeCreaDatiMockDrive(overrides: Partial<E2eTestDeps> = {}): SharedTestDatabase {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const force = properties.get('ALDO_E2E_FORCE_REBUILD') === 'true';
  const clock = overrides.clock ?? ((): Date => new Date());
  const rootFolder = overrides.drive === undefined ? mintE2eRootFolder() : null;
  const drive = overrides.drive ?? new DriveServiceFacade(
    ServiceFactory.getDriveService(),
    ServiceFactory.getPermissionService(),
    (rootFolder as NonNullable<typeof rootFolder>).getId()
  );
  const spreadsheetFactory = overrides.spreadsheetFactory ?? new GasSampleSpreadsheetFactory(rootFolder);
  const artifactFactory = overrides.artifactFactory ?? new GasArtifactFactory(
    ServiceFactory.getDocumentService(),
    ServiceFactory.getSpreadsheetService()
  );

  const configuredMaster = properties.get(PROP_ONLINETEST_MASTER_SPREADSHEET_ID)?.trim();
  const masterSpreadsheetId = configuredMaster === undefined || configuredMaster === '' || force
    ? ServiceFactory.getSpreadsheetService().getActiveStandard().getId()
    : configuredMaster;
  const master = spreadsheetFactory.openExistingSpreadsheet(masterSpreadsheetId);

  // riuso per nome: template e cartelle sono idempotenti (reuse-by-fixed-name)
  const templateFolderId = drive.createFolder('_ALDO_E2E_TEMPLATES');
  const templateIds: E2eTemplateIds = new E2eTemplateProvisioner(artifactFactory, drive).provision(templateFolderId);
  const sample = new SharedTestDatabaseBuilder(spreadsheetFactory, drive).build(templateIds, master, { force });

  properties.set(PROP_ONLINETEST_MASTER_SPREADSHEET_ID, sample.masterSpreadsheetId);
  return sample;
}

export function creaDatiMockDrive(): unknown {
  return executeCreaDatiMockDrive();
}
```

Nota: `openExistingSpreadsheet` è già in `GasSampleSpreadsheetFactory` (usato da `executeE2eScenarios`). Il test force-rebuild va eseguito solo quando esplicitamente richiesto (via proprietà), come da design.

- [ ] **Step 2: Test unit offline**

`test/unit/onlinetests/creaDatiMockDrive.test.ts`: con deps fake (fake `ISampleSpreadsheetFactory`, fake `IDriveFacade`, fake `initAldo`), verifica che: al primo run crea master+dati e salva la proprietà; al secondo run SENZA force riusa lo stesso master (`openExistingSpreadsheet` chiamato con lo stesso id, nessun nuovo builder di dati); con force ricrea. Segui il pattern dei test di `executeOnlineTests` esistenti (fake `SpreadsheetApp` via deps override).

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Verifica online (manuale)**

Run: `npm run build:online && npm run push:online`
Expected: in GAS, eseguire `creaDatiMockDrive` → log riepilogo (master id, 13 classi, 220 studenti, 2 DB precedenti, template id). Rieseguire → nessun nuovo asset, riuso per nome.

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests/index.ts test/unit/onlinetests/creaDatiMockDrive.test.ts
git commit -m "feat(onlinetests): creaDatiMockDrive — provisioning idempotente del dataset condiviso"
```

---

## Phase 2 — Report, helper, runner aggregato

### Task 8: `TestRunner` con group + fixture URLs; helper `materializeLazyRef`

**Files:**
- Create: `src/onlinetests/report/OnlineTestReport.ts` (spostato da `src/onlinetests/OnlineTestReport.ts`; aggiorna gli import)
- Create: `src/onlinetests/report/MaterializeHelper.ts`

**Interfaces:**
- Consumes: `EnhancedTestRunner` (GasOnlineTestFramework).
- Produces: `TestRunner.add(name, artifactUrl?, fn)` invariato + `group` nel `name` (prefisso `group::`); `OnlineTestResult` invariato; `materializeLazyRef(ref): unknown` che chiama `.get()` se presente e ritorna il valore materializzato.

- [ ] **Step 1: Sposta `OnlineTestReport.ts` in `report/` e estendi il naming**

Copia il file in `src/onlinetests/report/OnlineTestReport.ts`, aggiorna il path e aggiungi al costruttore del `TestRunner` una utility statica:

```ts
/** Convenzione: ogni check registra nome come "<gruppo>::<descrizione>" per il report aggregato. */
export function groupName(group: string, description: string): string {
  return `${group}::${description}`;
}
```

Aggiorna gli import in `index.ts` e nei checks (`import { TestRunner } from './OnlineTestReport'` → `'./report/OnlineTestReport'`).

- [ ] **Step 2: `MaterializeHelper.ts`**

```ts
/**
 * Materializza un LazyRef prima di assert/render (MISSING_TESTS: "Direct JSON
 * serialization is not a valid substitute"). Se l'oggetto espone .get(), lo
 * invoca; altrimenti ritorna l'oggetto stesso.
 */
export function materializeLazyRef(ref: unknown): unknown {
  if (ref !== null && typeof ref === 'object' && typeof (ref as { get?: () => unknown }).get === 'function') {
    return (ref as { get: () => unknown }).get();
  }
  return ref;
}
```

- [ ] **Step 3: Test unit**

`test/unit/onlinetests/materializeHelper.test.ts`: LazyRef con `.get()` → valore; oggetto senza `.get()` → invariato; `null` → `null`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests/report test/unit/onlinetests
git commit -m "feat(onlinetests): TestRunner con nomi di gruppo + helper materializeLazyRef"
```

### Task 9: `runFullOnlineTests` — runner aggregato documentato; rimozione vecchi runner

**Files:**
- Modify: `src/onlinetests/index.ts`
- Modify: `src/onlinetests/OnlineTestsEntry.ts`

**Interfaces:**
- Consumes: `executeCreaDatiMockDrive`, tutti i `register*Checks` delle fasi successive, `runReportedSuite`.
- Produces: `runFullOnlineTests(): OnlineTestReport` — ordine deterministico: `creaDatiMockDrive(force)` → documenti → email → jobrunner → import → storico → articolazione/ITP/supplenze → ACL/cache/permessi. `runOnlineTests`/`runE2eScenarios`/`runArticolazioneScenarios` RIMOSSI.

- [ ] **Step 1: Implementa l'aggregate**

```ts
export function executeFullOnlineTests(): OnlineTestReport {
  executeCreaDatiMockDrive(); // provisioning fresco
  const container = initAldo(new Date(), new ScriptPropertiesFacade());
  container.get<ContextBuilder>('contextBuilder').registerInterceptor(e2eActiveRepresentativesInterceptor);
  const runner = new TestRunner();
  const sample = /* SharedTestDatabase ricostruito da executeCreaDatiMockDrive (vedi step 2) */;
  // Ordine: documenti → email → jobrunner → import → storico → articolazione/ITP/supplenze → ACL/cache/permessi
  registerDocumentiChecks(runner, container, sample);
  registerEmailChecks(runner, container, sample, EMAIL_TEST_SAFE);
  registerJobRunnerChecks(runner, container, sample);
  registerImportChecks(runner, container, sample);
  registerStoricoChecks(runner, container, sample);
  registerArticolazioneChecks(runner, container, sample);
  registerItpDottedChecks(runner, container, sample);
  registerSupplenzeRuoliChecks(runner, container, sample);
  registerAclRealiChecks(runner, container, sample);
  registerCacheIsolamentoChecks(runner, container, sample);
  registerPermessiChecks(runner, container, sample);
  return runner.report();
}

export function runFullOnlineTests(
  execute: () => OnlineTestReport = executeFullOnlineTests,
  logger: LoggerService = ServiceFactory.getLogger()
): OnlineTestReport {
  return runReportedSuite('online_tests_full', 'ONLINE_TEST_SUITE', execute, logger);
}
```

- [ ] **Step 2: Rendere `executeFullOnlineTests` unit-testabile offline**

Refactor: `executeCreaDatiMockDrive` deve ritornare il `SharedTestDatabase` (già così dal Task 7) e accettare deps; `executeFullOnlineTests` accetta `Partial<E2eTestDeps>` e usa il sample ritornato per costruire i checks. Con deps fake, `test/unit/onlinetests/fullOnlineTests.test.ts` verifica che tutti i `register*Checks` vengano chiamati (spy) nell'ordine giusto e che il report venga prodotto.

- [ ] **Step 3: Rimuovi i vecchi runner**

Elimina `executeOnlineTests`, `executeE2eScenarios`, `executeArticolazioneScenarios`, `runOnlineTests`, `runE2eScenarios`, `runArticolazioneScenarios` e `PROP_ONLINETEST_MASTER_SPREADSHEET_ID` se non più usati (spostare l'uso di `readCurrentMasterConfig` nelle nuove orchestratrici se serve). Rimuovi le assegnazioni global in `OnlineTestsEntry.ts`. Verifica che nessun test unit referenzi le funzioni rimosse; aggiorna i test che le usavano.

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests test/unit/onlinetests
git commit -m "feat(onlinetests): runFullOnlineTests aggregato; rimossi vecchi runner"
```

---

## Phase 3 — Scenari Documenti

### Task 10: `checks/documentiChecks.ts` — testDocumentiStandard, testDocumentiArticolati

**Files:**
- Create: `src/onlinetests/checks/documentiChecks.ts`
- Modify: `src/onlinetests/index.ts` (orchestratori + launcher)
- Modify: `src/onlinetests/OnlineTestsEntry.ts` (se necessario)

**Interfaces:**
- Consumes: `TestRunner`, `SharedTestDatabase`, `ServiceContainer`, `initAldo`.
- Produces: `registerDocumentiChecks(runner, container, sample)` con checks per doc standard (verbale, condotta, riepilogo, CDC, PDP/PEI, template Sheets, protected ranges, interop: paragrafi/liste/tabelle/condizionali/unicode/link) e articolati (COMPLETA/ARTICOLATA, CdC split). Riusa le asserzioni esistenti di `e2eScenarioChecks.ts` (non sostituirle — estenderle): importare e ri-registrare i check già verdi e aggiungere i nuovi.

- [ ] **Step 1: Estrai/ricompatta i check doc esistenti**

In `checks/documentiChecks.ts`, importa da `checks/e2eScenarioChecks.ts` i registri doc già esistenti (es. verbale/condotta/riepilogo/CDC/piani) e aggiungi `registerDocumentiChecks` che li registra tutti più i nuovi check:

```ts
export function registerDocumentiChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase
): void {
  // doc standard esistenti (da e2eScenarioChecks)
  // + nuovi: interop template (unicode, liste, link, tabelle), protected ranges read-back
  runner.add(groupName('documenti.standard', 'template interop unicode'), sample.sampleSpreadsheetUrl, () => {
    // genera doc dal template RIEPILOGO e verifica testo unicode/liste/link presenti
  });
}
```

I check nuovi devono generare un documento reale via il solito percorso (`CONF_DOC` → `documentBatchService`/`avviaGenerazioneDataDriven` con budget ampio, oppure la generazione diretta già usata dai check esistenti) e ispezionare `drive.getFileText`.

- [ ] **Step 2: Orchestratore + launcher**

In `index.ts`:

```ts
export function executeDocumentiStandard(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport { /* setup sample+container come executeE2eScenarios, registra solo i check standard */ }
export function testDocumentiStandard(): OnlineTestReport { return runReportedSuite('documenti_standard', 'DOC_SCENARIO', executeDocumentiStandard); }
export function executeDocumentiArticolati(overrides: Partial<E2eTestDeps> = {}): OnlineTestReport { /* solo check articolati */ }
export function testDocumentiArticolati(): OnlineTestReport { return runReportedSuite('documenti_articolati', 'DOC_SCENARIO', executeDocumentiArticolati); }
```

`testDocumentiStandard`/`testDocumentiArticolati` assumono il dataset già provveduto da `creaDatiMockDrive` (riusano `PROP_ONLINETEST_MASTER_SPREADSHEET_ID`; se assente, lanciano errore chiaro "esegui prima creaDatiMockDrive").

- [ ] **Step 3: Test unit offline (laddove possibile) + typecheck**

I check online non sono eseguibili in locale; i test unit coprono la pura composizione (`registerDocumentiChecks` con fake runner registra N check). Aggiungi `test/unit/onlinetests/documentiChecks.test.ts` con un `TestRunner` fake che cattura i nomi registrati e verifica la presenza dei check chiave.

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Verifica online**

Run: `npm run build:online && npm run push:online`; in GAS: `creaDatiMockDrive()` poi `testDocumentiStandard()` e `testDocumentiArticolati()` → report verde; nessun placeholder irrisolto.

- [ ] **Step 5: Commit**

```bash
git add src/onlinetests/checks/documentiChecks.ts src/onlinetests/index.ts test/unit/onlinetests
git commit -m "feat(onlinetests): scenario documenti standard e articolati"
```

### Task 11: `testDocumentiTabelleImportate` (P0)

**Files:**
- Modify: `src/onlinetests/checks/documentiChecks.ts` (sezione tabelle importate)
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `CONF_DOC_TABELLE` (`E2E_DOC_TABELLE`), template `tabelleImportate`, `tabellaSorgenteDati`, `tabellaSorgenteVuota`.
- Produces: check che generano il doc via `DocumentoConTabelleImportateGeneratorStrategy` (config `CONF_DOC_TABELLE`), poi asserzioni di cui al passo 1.

- [ ] **Step 1: Scrivi i check**

```ts
function checkTabelleImportate(runner: TestRunner, container: ServiceContainer, sample: SharedTestDatabase, ids: E2eTemplateIds): void {
  runner.add(groupName('documenti.tabelleImportate', 'generazione e contenuto'), sample.sampleSpreadsheetUrl, () => {
    const c = container;
    // 1. genera via avviaGenerazioneDataDriven(c, CONF_DOC_TABELLE, creaJobRunner(), budgetAmpio)
    // 2. file esiste; LOG_DOCS ha ID/link/classe/tipo
    // 3. drive.getFileText(fileId) contiene header + 2 righe della sorgente Dati
    // 4. contiene i placeholder CDU espansi circostanti (render normale dopo inserimento tabelle)
    // 5. nessun marker di tabella residuo; nessun Mustache irrisolto
    // 6. marker vuoto rimosso, nessuna tabella bogus
    // 7. seconda esecuzione: DUPLICAZIONE=NEGATA → nessun log duplicato (assert scoped per run)
  });
}
```

La firma esatta del marker va ricavata da `DocumentoConTabelleImportateGeneratorStrategy.ts` (usare `findTablePlaceholders` con la sintassi che lo strategy usa realmente — verificare nel sorgente, non inventare).

- [ ] **Step 2: Orchestratore + launcher `testDocumentiTabelleImportate`**

Come Task 10 step 2, con `executeDocumentiTabelleImportate`.

- [ ] **Step 3: Verifica online + commit**

Stesso ciclo del Task 10 (build:online, push:online, run launcher, report verde). Commit:

```bash
git add src/onlinetests/checks/documentiChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): scenario tabelle importate (P0 MISSING_TESTS)"
```

### Task 12: `testDuplicazioneDocumenti` (essential #1)

**Files:**
- Modify: `src/onlinetests/checks/documentiChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: config `CONF_DOC_PIANI` (già `DUPLICAZIONE=NEGATA` nell'attuale builder) + una config `DUPLICAZIONE=PERMESSA` nuova (aggiungere in `seedConfDedicated` o estendere `CONF_DOC_PIANI`).
- Produces: check che misurano il conteggio file Drive REALE.

- [ ] **Step 1: Scrivi i check**

```ts
runner.add(groupName('documenti.duplicazione', 'NEGATA non duplica su Drive'), url, () => {
  const before = conteggioFileDrive(prefix);
  genera(configNegata);
  genera(configNegata); // retry idempotente
  const after = conteggioFileDrive(prefix);
  if (after !== before + 1) throw new Error(`Attesi ${before + 1} file, trovati ${after}`);
});
runner.add(groupName('documenti.duplicazione', 'PERMESSA crea copie distinte'), url, () => {
  genera(configPermessa); genera(configPermessa);
  // 2 file distinti, LOG_DOCS con 2 righe e ID_GEN distinti, nomi normalizzati
});
```

Usa `drive` (IDriveFacade) per elencare i file nella cartella di destinazione con nome prefissato (pattern già usato altrove nei check per contare file reali — seguire `e2eScenarioChecks.ts`).

- [ ] **Step 2: Orchestratore + launcher `testDuplicazioneDocumenti`** (come sopra).

- [ ] **Step 3: Verifica online + commit**

```bash
git add src/onlinetests/checks/documentiChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): scenario duplicazione documenti (Drive reale)"
```

---

## Phase 4 — Scenari Email

### Task 13: `checks/emailChecks.ts` — testInvioEmail, testEmailSicurezza

**Files:**
- Create: `src/onlinetests/checks/emailChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `EmailNotificationService.enableTestMode`, `EMAIL_TEST_SAFE`, `avviaInvioNotificheDataDriven`, config `CONF_MAIL_VERBALE`/`CONF_MAIL_PIANI`/`CONF_MAIL_STORICO`, `LOG_MAIL`.
- Produces: `registerEmailChecks(runner, container, sample, safeEmail)`.

- [ ] **Step 1: Scrivi i check**

```ts
export function registerEmailChecks(runner, container, sample, safeEmail) {
  const email = container.get<EmailNotificationService>('emailNotificationService');
  // ogni check attiva test mode PRIMA di qualsiasi invio
  runner.add(groupName('email.invio', 'batch test mode + allegati LOG_MAIL'), sample.sampleSpreadsheetUrl, () => {
    email.enableTestMode(safeEmail);
    try { avviaInvioNotificheDataDriven(container, CONF_MAIL_VERBALE, creaJobRunner(), budgetAmpio); }
    finally { email.disableTestMode(); }
    // LOG_MAIL: righe testMode, destinatario === safeEmail, allegato presente, zero duplicati
  });
  runner.add(groupName('email.sicurezza', 'mai destinatario produttivo'), url, () => {
    // per ogni riga LOG_MAIL del pattern: destinatario == safeEmail (mai e2eDocenteEmail/alunno reali)
  });
  runner.add(groupName('email.duplicati', 'identità target tra container freschi'), url, () => {
    // resetAldo() → initAldo() nuovo container → enableTestMode → seconda run: nessun reinvio a target già SUCCESS (testMode escluso dal duplicato check, coerente con loadSuccessfulLogicalTargetIds)
  });
}
```

Nota chiave (documentata in `EmailBatchService`): con `testEmail` attivo `rememberSuccessfulDelivery` NON aggiunge al set dei duplicati; il controllo duplicati su run ripetute va fatto sugli invii NON-test-mode o sulla logica `logicalTargetId` — verificare il comportamento previsto e assertarlo di conseguenza.

- [ ] **Step 2: Orchestratori + launcher `testInvioEmail`, `testEmailSicurezza`** (come Task 10, con la segnatura `registerEmailChecks`).

- [ ] **Step 3: Test unit + typecheck + lint**

`test/unit/onlinetests/emailChecks.test.ts`: con fake container (pattern dei test di `executeOnlineTests`), verifica che `enableTestMode` venga chiamato prima di ogni `avviaInvioNotificheDataDriven` (spy).

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Verifica online + commit**

```bash
git add src/onlinetests/checks/emailChecks.ts src/onlinetests/index.ts test/unit/onlinetests
git commit -m "feat(onlinetests): scenario email (batch test mode, sicurezza, duplicati)"
```

---

## Phase 5 — Scenari JobRunner

### Task 14: `checks/jobRunnerChecks.ts` — testJobRunnerDocGen, testJobRunnerEmail

**Files:**
- Create: `src/onlinetests/checks/jobRunnerChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `avviaGenerazioneDataDriven`, `avviaInvioNotificheDataDriven`, `riprendiJobSospeso`, `creaJobRunner`, `CONF_DOC_JOBRUNNER`, `CONF_MAIL_JOBRUNNER`, `EMAIL_TEST_SAFE`, `JobRunnerService.getStatus/resetJob`, `ScriptPropertiesFacade`.
- Produces: `registerJobRunnerChecks(runner, container, sample, safeEmail)` con il seam deterministico del design Sez. 3-A (doc ed email).

- [ ] **Step 1: Scrivi il check doc (sospensione deterministica)**

```ts
const MS_TINY = 50;
const MS_AMPO = 25 * 60 * 1000;

function checkJobRunnerDocGen(runner, container, sample) {
  const runner_ = creaJobRunner();
  const jobName = `gen_${CONF_DOC_JOBRUNNER}`;
  runner.add(groupName('jobrunner.docGen', 'sospensione to_resume + trigger'), sample.sampleSpreadsheetUrl, () => {
    const esito = avviaGenerazioneDataDriven(container, CONF_DOC_JOBRUNNER, runner_, MS_TINY);
    if (esito !== null) throw new Error('Attesa sospensione (esito null), ottenuto completamento');
    const status = runner_.getStatus(jobName);
    if (status.state !== 'to_resume') throw new Error(`Stato atteso to_resume, trovato ${status.state}`);
    const props = new ScriptPropertiesFacade();
    if (props.get(`trigger_${jobName}`) === null) throw new Error('trigger_<jobName> mancante');
    if (props.get(`job_for_trigger_${props.get(`trigger_${jobName}`)}`) !== jobName) throw new Error('job_for_trigger_<id> non allineato');
    // LOG_DOCS parziale: almeno 1 target processato, nessun duplicato, nessun target successivo
  });
  runner.add(groupName('jobrunner.docGen', 'resume manuale completa senza duplicati'), url, () => {
    riprendiJobSospeso(container, runner_, jobName, MS_AMPO);
    const status = runner_.getStatus(jobName);
    if (status.state !== 'completed' && status.state !== 'COMPLETED') throw new Error(`Atteso COMPLETED, trovato ${status.state}`);
    // LOG_DOCS totale atteso, zero duplicati (chiave: config+classe+idGen+jobId)
  });
  runner.add(groupName('jobrunner.docGen', 'resetJob pulisce trigger e stato'), url, () => {
    runner_.resetJob(jobName);
    const props = new ScriptPropertiesFacade();
    if (props.get(`trigger_${jobName}`) !== null) throw new Error('trigger_<jobName> non rimosso');
    // getStatus → not_started o stato azzerato
  });
}
```

Nota: lo stato di `getStatus` è una stringa (vedi `JobQueue.getStatus` → `stateManager.getState() || 'not_started'`); gli stati `STATE_*` sono costanti (`JobStateManager.STATE_COMPLETED`). Usare il valore esatto restituito dal vendor (verificare `STATE_COMPLETED` sia `'completed'` o `'COMPLETED'` leggendo `JobRunnerStateManager.js` e usarne la costante).

- [ ] **Step 2: Scrivi il check email (stessa struttura)**

`checkJobRunnerEmail`: `avviaInvioNotificheDataDriven(container, CONF_MAIL_JOBRUNNER, runner_, MS_TINY)` con `email.enableTestMode(EMAIL_TEST_SAFE)` prima; assert LOG_MAIL parziale `testMode`, resume, completo, `resetJob`. Il jobName è `mail_${CONF_MAIL_JOBRUNNER}`.

- [ ] **Step 3: Orchestratori + launcher `testJobRunnerDocGen`, `testJobRunnerEmail`**

Come Task 10; ogni launcher esegue i 3 check del proprio scenario in sequenza (sospensione → resume → pulizia) su jobName dedicato. Se il primo check fallisce, i successivi vanno comunque tentati ma il report deve riflettere il fallimento senza lasciare trigger (in `finally`, se lo stato è ancora `to_resume`, `runner_.cancelJob(jobName)`).

- [ ] **Step 4: Verifica online + commit**

Run: `npm run build:online && npm run push:online`; in GAS: `creaDatiMockDrive()` → `testJobRunnerDocGen()` → `testJobRunnerEmail()` → report verde; verificare che `ScriptApp.getProjectTriggers()` non contenga trigger `resumeJob` residui dopo i test (via `testPermessiAttivi`/check apposito o ispezione manuale).

```bash
git add src/onlinetests/checks/jobRunnerChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): jobrunner doc/email — sospensione deterministica, resume, resetJob"
```

### Task 15: `testJobRunnerTriggerReale` (opzionale, B)

**Files:**
- Modify: `src/onlinetests/checks/jobRunnerChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: seam del Task 14; `Utilities.sleep`; polling.
- Produces: `executeJobRunnerTriggerReale(): OnlineTestReport` — MAI chiamato da `executeFullOnlineTests`; `testJobRunnerTriggerReale(): OnlineTestReport`.

- [ ] **Step 1: Scrivi il check trigger reale**

```ts
const POLL_INTERVAL_MS = 10 * 1000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function checkTriggerReale(container, sample) {
  const runner_ = creaJobRunner();
  const jobName = `gen_${CONF_DOC_JOBRUNNER}_REALE`;
  runner.add(groupName('jobrunner.triggerReale', 'resume via contesto trigger'), sample.sampleSpreadsheetUrl, () => {
    avviaGenerazioneDataDriven(container, CONF_DOC_JOBRUNNER, runner_, MS_TINY);
    const start = Date.now();
    let stato = runner_.getStatus(jobName).state;
    while (stato === 'to_resume' && Date.now() - start < POLL_TIMEOUT_MS) {
      Utilities.sleep(POLL_INTERVAL_MS);
      stato = runner_.getStatus(jobName).state;
    }
    if (stato === 'to_resume') {
      runner_.cancelJob(jobName); // fallback determinista: nessun trigger orfano
      throw new Error('Il trigger one-time non è scattato nel timeout');
    }
    if (stato !== 'completed') throw new Error(`Stato atteso completed, trovato ${stato}`);
    // LOG_DOCS completo, zero duplicati, proprietà job_for_trigger_* rimosse
  });
}
```

Nota: `Utilities` è un global GAS consentito in `src/onlinetests/**`. Il trigger creato punta a `resumeJob` (global esposto da `src/index.ts`) che completa il job; il resume avviene via contesto trigger (`job_for_trigger_<id>`).

- [ ] **Step 2: Orchestratore + launcher** — `executeJobRunnerTriggerReale` registra SOLO questo check; `testJobRunnerTriggerReale` lo esegue. Assicurarsi che `executeFullOnlineTests` NON lo chiami.

- [ ] **Step 3: Verifica online manuale + commit**

Run launcher in GAS (esecuzione manuale, ~1-5 min). Report verde o fallimento pulito.

```bash
git add src/onlinetests/checks/jobRunnerChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): jobrunner trigger reale opzionale (polling + fallback cancelJob)"
```

---

## Phase 6 — Scenari Import

### Task 16: `checks/importChecks.ts` — testImportFileSingolo, testImportPolicy

**Files:**
- Create: `src/onlinetests/checks/importChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `ImportService.executeImport`/`avviaImportazioneDataDriven`, `CONF_IMP` esistenti (`E2E_IMPORT_ASL`) + nuove config policy (da aggiungere in `seedConfDedicated`): `IGNORE`, `OVERWRITE`, `TIMESTAMP`, `ATTIVO=false`, composite key, `hasHeaders=true/false`, `range`/`tabName`, misconfig (fileId/folderTipo/idGen mancanti, strategia sconosciuta).
- Produces: `registerImportChecks(runner, container, sample)`.

- [ ] **Step 1: Config aggiuntive in `seedConfDedicated`**

Aggiungi righe `CONF_IMP`:
- `E2E_IMP_IGNORE` (conflict `IGNORE`, chiave composta STUDENTE+anno, una riga già presente nel target)
- `E2E_IMP_TIMESTAMP` (conflict `TIMESTAMP`; sorgente con colonna timestamp; più un caso senza colonna timestamp target per il fallback OVERWRITE)
- `E2E_IMP_DISABLED` (`ATTIVO=false`, sorgente con righe che NON devono essere lette)
- `E2E_IMP_NOHEADER` (`hasHeaders=false`, `range`/`tabName` espliciti)
- `E2E_IMP_MISCONFIG` (id `fileId` mancante; id `folderTipo` mancante; id `idGen` mancante; id `BAD_STRATEGY` con strategia sconosciuta)
- ghost row: una sorgente con riga composta da soli metadati/chiavi vuote

**Assert (ogni policy = un check):** conflitto risolto secondo policy; `ATTIVO=false` → risultato skipped documentato e sorgente NON acceduta; ghost row soppressa; misconfig → `ConfigurationError` PRIMA di ogni mutazione target; timestamp fallback a OVERWRITE se colonna target assente.

- [ ] **Step 2: Orchestratori + launcher `testImportFileSingolo`, `testImportPolicy`**

`executeImportFileSingolo`: check FILE_SINGOLO + mapping esplicito + `OVERWRITE` + `hasHeaders` (su `E2E_IMPORT_ASL` e varianti). `executeImportPolicy`: tutti i check policy del passo 1. Entrambi usano `avviaImportazioneDataDriven` (sincrono).

- [ ] **Step 3: Verifica online + commit**

```bash
git add src/onlinetests/checks/importChecks.ts src/onlinetests/index.ts src/onlinetests/data
git commit -m "feat(onlinetests): import FILE_SINGOLO + policy (P1)"
```

### Task 17: `testImportCartelleClasse` (P0 CERCA_CARTELLE_CLASSE)

**Files:**
- Modify: `src/onlinetests/checks/importChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `E2E_IMP_ASL_CARTELLE`, `seedLogFold`, `LOG_FOLD`.
- Produces: check che eseguono `avviaImportazioneDataDriven(container, E2E_IMP_ASL_CARTELLE)` e verificano il flusso folder-per-classe.

- [ ] **Step 1: Scrivi i check**

```ts
runner.add(groupName('import.cartelleClasse', 'solo cartelle classi eleggibili'), url, () => {
  avviaImportazioneDataDriven(container, CONF_IMP_ASL_CARTELLE);
  // 1. solo file nelle LOG_FOLD delle classi eleggibili letti (3C/3C-S/3C-C/5B/5B-S/5B-C)
  // 2. nessun dato dal decoy 2B né dal decoy trashed
  // 3. _CLASSE corretta per ogni record; ore/studenti distinti per classe
  // 4. contatori: inseriti/aggiornati/skippati/ghost distinti
  // 5. seconda run idempotente sotto OVERWRITE
});
```

- [ ] **Step 2: Orchestratore + launcher `testImportCartelleClasse`** (come sopra).

- [ ] **Step 3: Verifica online + commit**

```bash
git add src/onlinetests/checks/importChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): import CERCA_CARTELLE_CLASSE storico ASL (P0)"
```

### Task 18: `testImportCercaDocumenti` + `testImportChunked` (P1 + essential #4)

**Files:**
- Modify: `src/onlinetests/checks/importChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `E2E_IMP_CERCA_DOCUMENTI` (idGen con 2 fogli generati da stesso generator, classi diverse; un foglio con tipo/stato diverso; un log non-sheet), `E2E_IMP_CHUNKED` (`avviaImportazioneChunkedDataDriven`).
- Produces: check `CERCA_DOCUMENTI` + check chunked resume.

- [ ] **Step 1: Check CERCA_DOCUMENTI**

```ts
runner.add(groupName('import.cercaDocumenti', 'filtro per idGen/tipo/stato e _CLASSE'), url, () => {
  avviaImportazioneDataDriven(container, CONF_IMP_CERCA_DOCUMENTI);
  // solo i 2 fogli con idGen+tipo attesi importati; _CLASSE preservata; il terzo foglio (tipo diverso) escluso; log non-sheet escluso
});
```

- [ ] **Step 2: Check chunked resume (essential #4)**

```ts
runner.add(groupName('import.chunked', 'resume senza duplicati e stato pulito'), url, () => {
  const runner_ = creaJobRunner();
  const jobName = `imp_chunked_${CONF_IMP_CHUNKED}`;
  avviaImportazioneChunkedDataDriven(container, CONF_IMP_CHUNKED, runner_, MS_TINY);
  if (runner_.getStatus(jobName).state !== 'to_resume') throw new Error('attesa sospensione');
  riprendiJobSospeso(container, runner_, jobName, MS_AMPO);
  // target completo, zero righe duplicate, stato JobRunner azzerato via resetJob, EMAIL_BATCH/import checkpoint puliti
  runner_.resetJob(jobName);
});
```

- [ ] **Step 3: Orchestratori + launcher `testImportCercaDocumenti`, `testImportChunked`** (come sopra).

- [ ] **Step 4: Verifica online + commit**

```bash
git add src/onlinetests/checks/importChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): import CERCA_DOCUMENTI + chunked resume"
```

---

## Phase 7 — Scenari Storico

### Task 19: `checks/storicoChecks.ts` — recupero storico alunno, classe, documenti

**Files:**
- Create: `src/onlinetests/checks/storicoChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `ContextBuilder` (`contextBuilder`), `seedAnniPrecedenti`, `materializeLazyRef`, `CONF_DOC_STORICO`, `CONF_MAIL_STORICO`.
- Produces: `registerStoricoChecks(runner, container, sample)`.

- [ ] **Step 1: Scrivi i check storico**

```ts
function buildAlunnoCompleto(container, emailAlunno) {
  const builder = container.get<ContextBuilder>('contextBuilder');
  return builder.build('ALUNNO_COMPLETO', { email: emailAlunno, includiStorico: true, profondita: 2 });
}

runner.add(groupName('storico.alunno', 'depth 2 materializzato'), url, () => {
  const cdu = buildAlunnoCompleto(container, CARENZA_ALUNNO_1);
  const storico = materializeLazyRef(cdu.get('focus.alunno.storico'));
  // anni [2026-2027, 2025-2026, 2024-2025], nomi classe, esiti, piani, carenze riconciliate (GST→STO), ripetenza
});
runner.add(groupName('storico.alunno', 'casi limite depth 0 / mancanti / sconosciuto'), url, () => {
  // depth 0 → storico assente; catena mancante → empty stabile; RITIRATO/SCONOSCIUTO → esiti attesi, nessun throw
});
runner.add(groupName('storico.classe', 'statistiche + progetti + referee'), url, () => {
  const cdu = builder.build('CLASSE_COMPLETA', { classeId: CLASSE_C_PARENT, includiStorico: true, profondita: 2 });
  const storico = materializeLazyRef(cdu.get('focus.classe.storico'));
  // statistiche, ASL/non-ASL progetti, referee present/missing (fallback persona display)
});
runner.add(groupName('storico.classe', 'continuità CdC/ITP + evoluzione materie'), url, () => {
  // storico classe: docenti precedenti incl. ITP cambiato/assente (campi ASSENTI, non null/false)
});
runner.add(groupName('storico.documenti', 'ID_GEN/famiglia/sottotipo e isolamento PEI/PDP'), url, () => {
  // documenti storici con ID_GEN condiviso ma TIPO/SOTTOTIPO diversi; mai cross-link PEI/PDP
});
runner.add(groupName('storico.render', 'template storico senza placeholder'), url, () => {
  // genera doc da CONF_DOC_STORICO e mail da CONF_MAIL_STORICO; contenuto con branch storici reali, nessun Mustache irrisolto
});
```

I path CDU esatti (`focus.alunno.storico`, `focus.classe.storico`, ecc.) vanno verificati contro `SPECS_ALDO/02_CDU_STRUTTURA.md` e i provider `StoricoAlunniService`/`StoricoClasseProvider`/`StoricoDocumentiService` prima di scrivere i check.

- [ ] **Step 2: Orchestratori + launcher `testRecuperoStoricoAlunno`, `testRecuperoStoricoClasse`, `testRecuperoStoricoDocumenti`**

Ogni launcher registra il sottoinsieme dei check sopra (alunno, classe, documenti). Il check `storico.render` appartiene a `testRecuperoStoricoDocumenti`.

- [ ] **Step 3: Verifica online + commit**

```bash
git add src/onlinetests/checks/storicoChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): recupero storico alunno/classe/documenti (P0)"
```

---

## Phase 8 — Articolazione, ITP, Supplenze, ACL, Cache, Permessi

### Task 20: `testArticolazione` sul dataset condiviso

**Files:**
- Modify: `src/onlinetests/checks/articolazioneChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `registerArticolazioneChecks` esistente (firma attuale: `(runner, container, sample)` con `sample` che oggi ha `priorSampleSpreadsheetId: ''` — adattare alla `SharedTestDatabase` con prior reali).
- Produces: `testArticolazione(): OnlineTestReport`.

- [ ] **Step 1: Adatta `registerArticolazioneChecks` alla `SharedTestDatabase`**

Aggiorna la firma per accettare `SharedTestDatabase` (usa `priorSampleSpreadsheetId` reale invece di `''`). Mantieni i check esistenti (boundary date, sostituzione composita `LAB.SEMINARIO_POMERIDIANO`, variazione finale ITA). Estendi con: sovrapposizione su classe diversa, `SOLO_TITOLARI`/`SOLO_SUPPLENTI`/`ENTRAMBI` (già richiesti) se non presenti.

- [ ] **Step 2: Orchestratore + launcher `testArticolazione`** (come Task 10).

- [ ] **Step 3: Verifica online + commit**

```bash
git add src/onlinetests/checks/articolazioneChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): articolazione sul dataset condiviso (chiude gap runner)"
```

### Task 21: `checks/itpDottedChecks.ts` — testITPeMateriePuntate

**Files:**
- Create: `src/onlinetests/checks/itpDottedChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `getITPPerMateria` (repo/role-resolution), CDU, `CONF_DOC_DOTTED`.
- Produces: `registerItpDottedChecks(runner, container, sample)`.

- [ ] **Step 1: Scrivi i check**

```ts
// 1. getITPPerMateria(classe, 'INTERPRET.CHITARRA') → solo il docente ITP di QUEL dotted, non un arbitrario docente della materia principale
// 2. materia principale e dotted: identità di assegnazione distinte, SOTTOTIPO batch doc distinto, ruoli distinti, ownership colonne distinta
// 3. nomi sintetizzati (NOME vuoto → LAB.*/INTERPRET.CHITARRA) vs esplicito (INTERPRET.FLAUTO)
// 4. CDU materia: sigla, principale, specificita, nome, flag ITP, tuple docenti (classe, studente, parent articolato)
// 5. sostituzione/variazione su dotted non trasloca a materia base né a specificita sorella
// 6. storico: continuità principale vs ITP separata; ITP cambiato; campi assenti (non false/null) quando nessun ITP
// 7. template CONF_DOC_DOTTED: tutti i nomi una volta, ownership corretta, nessun placeholder
```

- [ ] **Step 2: Orchestratore + launcher `testITPeMateriePuntate`** (come Task 10).

- [ ] **Step 3: Verifica online + commit**

```bash
git add src/onlinetests/checks/itpDottedChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): ITP e materie puntate end-to-end (P1)"
```

### Task 22: `checks/supplenzeRuoliChecks.ts` + `checks/aclRealiChecks.ts`

**Files:**
- Create: `src/onlinetests/checks/supplenzeRuoliChecks.ts`
- Create: `src/onlinetests/checks/aclRealiChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: CDU/recipients/ACL composition (esistenti nei consumer check), `IDriveFacade` + `SpreadsheetService` reali per read-back ACL.
- Produces: `registerSupplenzeRuoliChecks`, `registerAclRealiChecks`.

- [ ] **Step 1: Supplenze/Ruoli**

Check: date inclusive/esclusive (prima, durante, dopo `SUPPLENZA_INIZIO`/`SUPPLENZA_FINE`); sovrapposizioni su classe diversa non influiscono sul focus; `VARIAZIONI_CATTEDRA` prima/durante/dopo la sostituzione; `SOLO_TITOLARI`/`SOLO_SUPPLENTI`/`ENTRAMBI` su CDU + recipients + ACL doc/cartella + protezione colonne; de-duplicazione principale/supplente con stessa email.

- [ ] **Step 2: ACL reali (essential #6)**

```ts
runner.add(groupName('acl.reali', 'lettura ACL file/cartella'), url, () => {
  // genera un doc da CONF_DOC con ACL attese → legge DrivePermission reale (DriveService.getPermissions / PermissionService)
  // verifica che i soggetti attesi (coordinatori, docenti effettivi) siano presenti; nessun soggetto inatteso
});
runner.add(groupName('acl.reali', 'protected ranges Sheets reali'), url, () => {
  // genera sheet da CONF_DOC_SHEET_PERMESSI → legge le protected ranges reali e gli editor (SpreadsheetService)
});
```

I check consumano gli stessi finti `IDriveFacade`/`SpreadsheetService`? NO — qui si usano i REALI (`ServiceFactory.getDriveService()/getSpreadsheetService()`) perché lo scopo è verificare lo stato esterno reale (MISSING_TESTS: "add one real GAS test that reads back"). Identità dedicate sicure; cartelle note riusate.

- [ ] **Step 3: Orchestratori + launcher `testSupplenzeERuoli`, `testACLReali`** (come Task 10).

- [ ] **Step 4: Verifica online + commit**

```bash
git add src/onlinetests/checks/supplenzeRuoliChecks.ts src/onlinetests/checks/aclRealiChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): supplenze/ruoli boundary + ACL reali (P1, essential #6)"
```

### Task 23: `checks/cacheIsolamentoChecks.ts` + `checks/permessiChecks.ts`

**Files:**
- Create: `src/onlinetests/checks/cacheIsolamentoChecks.ts`
- Create: `src/onlinetests/checks/permessiChecks.ts`
- Modify: `src/onlinetests/index.ts`

**Interfaces:**
- Consumes: `initAldo`/`resetAldo`, cache GAS, `SessionActiveUserFacade`.
- Produces: `registerCacheIsolamentoChecks`, `registerPermessiChecks`.

- [ ] **Step 1: Cache isolation (essential #5)**

```ts
runner.add(groupName('cache.isolamento', 'secondo fixture non riusa righe cached'), url, () => {
  const props = new ScriptPropertiesFacade();
  // run 1: initAldo su master fixture → legge riga X
  // resetAldo() + initAldo su master DIFFERENTE (nuovo fixture creato ad hoc o master esistente diverso)
  // la riga X non deve risultare cached/leggibile dal secondo container
});
```

- [ ] **Step 2: Permessi attivi (essential #6, gated)**

```ts
runner.add(groupName('permessi.attivi', 'visibilità utente attivo (gated)'), url, () => {
  const email = new SessionActiveUserFacade().getEmail();
  if (/* policy workspace non permette read-back */ true) return; // skip documentato se non applicabile
  // verifica accessibilità dei file test-mode solo agli utenti attesi
});
```

Se la policy non consente il test, il check deve risultare **skippato documentato**, non fail.

- [ ] **Step 3: Orchestratori + launcher `testCacheIsolamento`, `testPermessiAttivi`** (come Task 10).

- [ ] **Step 4: Verifica online + commit**

```bash
git add src/onlinetests/checks/cacheIsolamentoChecks.ts src/onlinetests/checks/permessiChecks.ts src/onlinetests/index.ts
git commit -m "feat(onlinetests): cache isolation e permessi attivi (essential #5/#6)"
```

---

## Phase 9 — Chiusura

### Task 24: Verifica finale del DoD + doc aggiornata

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-online-tests-restructure-design.md` (status → implemented)
- Modify: `MISSING_TESTS.md` (aggiornare lo stato dei gap implementati) — SOLO se richiesto dall'utente

- [ ] **Step 1: Suite completa**

Run: `npm run build:online && npm run push:online`
In GAS: `runFullOnlineTests()` → report verde su tutti i gruppi.

- [ ] **Step 2: Verifica assenza di artefatti residui**

Ispezionare: nessun trigger `resumeJob` in `ScriptApp.getProjectTriggers()`; nessuna mail fuori `@onlinetest.aldo.local`; nessuna cartella timestampata sotto `_ALDO_E2E_ROOT`.

- [ ] **Step 3: Coverage**

Run `dumpOnlineCoverage()` in GAS e aggiorna la coverage-index (spec 2026-07-26) con le nuove percentuali.

- [ ] **Step 4: Aggiorna il design doc + commit finale**

```bash
git add docs/superpowers/specs/2026-08-10-online-tests-restructure-design.md
git commit -m "docs: online-tests restructure implementato (DoD MISSING_TESTS)"
```

---

## Self-Review del piano (controlli già eseguiti)

1. **Copertura spec:** ogni sezione del design 2026-08-10 e ogni requisito del DoD MISSING_TESTS è mappato a un task: P0 (Task 9 aggregato, Task 11 tabelle, Task 17 cartelle-classe, Task 19 storico), P1 (Task 16/18 import, Task 21 ITP, Task 22 supplenze/ACL), essential 1-6 (Task 12, 13, 10, 14/15/18, 23, 22/23). Build A → Task 1-2; dataset → Task 3-7; report/helper → Task 8.
2. **Placeholder:** nessun passo "implementare più tardi"; i codici chiave sono forniti; per i check che estendono registri esistenti il piano indica esattamente cosa aggiungere e dove verificare le firme (marker, path CDU, costanti stato).
3. **Consistenza tipi:** `SharedTestDatabase`, `E2eTemplateIds` (6 nuovi campi), `register*Checks(runner, container, sample)` coerenti tra task; `creaDatiMockDrive(): unknown`, `testXxx(): OnlineTestReport`, `runFullOnlineTests(): OnlineTestReport` coerenti con `OnlineTestsEntry.ts` (Task 2). `EMAIL_TEST_SAFE` definito in Task 3, usato in Task 13/14.
