# Design: split di `runFullOnlineTests` in batch GAS separati

Date: 2026-08-13
Status: proposto, in attesa di review utente.

## Obiettivo

`runFullOnlineTests` (alias operativo dell'utente: "runAllOnlineTests") supera
il limite di 30 minuti per esecuzione GAS dell'account Workspace in uso: nel
run osservato ha generato ~100 documenti Drive prima del timeout, coprendo gli
11 gruppi di check registrati in `futureScenarioRegistrations`
(`src/onlinetests/index.ts:163-175`).

Obiettivo: eseguire l'intera suite online senza perdita di copertura, dentro
il vincolo dei 30 minuti per singola esecuzione, dividendo il runner
aggregato in più launcher GAS (`runOnlineTestsBatch1`..`4`) da lanciare in
sequenza dal menu Esegui di Apps Script, invece di un singolo
`runFullOnlineTests`.

## Decisioni chiave (da brainstorming)

| # | Decisione | Scelta |
|---|---|---|
| 1 | Riduzione fixture (alunni/classi/docenti) | **Scartata.** Analisi call-site per call-site: `generateForClasse` produce un documento per classe (non per alunno), quindi il conteggio di ~100 documenti deriva dal numero di scenari distinti registrati, non dalla dimensione dell'anagrafica. `ALL_CLASSI_E2E` (3 classi) e `SharedTestDatabaseBuilder` sono già dimensionati al minimo che porta ogni scenario nominato (catena VARIAZIONI_CATTEDRA, ripetenti, catalogo specificità, gruppi articolati). Coerente con [[cattedra-resolution-review-pattern]]: tagli alla fixture condivisa hanno già mascherato regressioni reali in questo progetto. |
| 2 | Riduzione call-site di generazione ridondanti | **Scartata.** Verificato ogni sito `generateFor*`/`avviaGenerazioneDataDriven` nei check: ogni rigenerazione volontaria è già protetta da dedupe (nessuna nuova scrittura Drive), e le apparenti duplicazioni (loop piani in `documenti` vs batch `CONF_DOC_JOBRUNNER`) testano percorsi di codice diversi (chiamata diretta vs generatore JobRunner con checkpoint/resume) sullo stesso target set — non sono ridondanti. |
| 3 | Leva scelta | **Split in batch GAS multipli**, riusando i launcher granulari già esistenti (`test*`, 23 funzioni, `src/onlinetests/index.ts:821-977`) via un nuovo livello di raggruppamento intermedio. Copertura invariata, rischio di regressione nullo. |
| 4 | Numero di batch | **4**, bilanciati per peso reale (scritture Drive) e per la dipendenza dati esistente (`email`/`articolazione` leggono righe `LOG_DOCS` che solo `documenti` produce). |
| 5 | Ordine di esecuzione | Batch 1 → 2 → 3 → 4. Il batch 2 **richiede** che il batch 1 sia già stato eseguito sullo stesso fixture persistito; 3 e 4 sono indipendenti ma restano numerati in coda per semplicità operativa. |

## Causa della violazione dei 30 minuti (analisi)

Ogni `generateFor*` produce **un** file Drive per invocazione (non per
studente in classe). Il conteggio osservato deriva dalla somma di scritture
reali distinte:

- `documenti` (scope `all`: standard + articolati + tabelle-importate +
  duplicazione): 8 blocchi scenario × 3 classi (`ALL_CLASSI_E2E`) + 7 target
  piano (`PIANO_STUDENTE`) + singoli (COMPLESSO, tabelle, duplicazione
  NEGATA/PERMESSA) ≈ **45-55 documenti**, il gruppo più pesante.
- `jobRunner` (doc-gen): batch `DocumentBatchService.generatePiani` itera
  "ogni piano di ogni alunno attivo" (stesso target set di `documenti`, ma
  via generatore JobRunner con `CONF_DOC_JOBRUNNER`, TIPO distinto quindi
  senza dedupe incrociato) ≈ **7 documenti**.
- `itpDotted`, `aclReali`, `import`: un documento ciascuno.
- Tutti gli altri gruppi (`storico`, `articolazione`, `supplenzeRuoli`,
  `cacheIsolamento`, `permessi`) non generano documenti propri: leggono dati
  già seminati o righe `LOG_DOCS` prodotte da `documenti`.

Nessun "padding" rimovibile senza perdere copertura nominata: la soluzione è
distribuire questo lavoro legittimo su più esecuzioni GAS, non ridurlo.

## Architettura

### Helper condiviso

Refactor di `executeFullOnlineTests` (`src/onlinetests/index.ts:314-350`) per
estrarre la logica di setup (reset/init Aldo, registrazione
`e2eActiveRepresentativesInterceptor`, lettura fixture persistita via
`readPersistedFullOnlineTestSample`) in una funzione riusabile:

```ts
function executeOnlineTestsBatch(
  groups: Array<keyof FullOnlineTestRegistrations>,
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  const properties = overrides.properties ?? new ScriptPropertiesFacade();
  const sample = (overrides.readSample ?? readPersistedFullOnlineTestSample)(properties);
  const resetAldoFn = overrides.resetAldo ?? resetAldo;
  const initAldoFn = overrides.initAldo ?? initAldo;
  const clock = overrides.clock ?? ((): Date => new Date());
  const registrations = { ...futureScenarioRegistrations, ...overrides.registrations };

  resetAldoFn();
  const container = initAldoFn(clock(), properties, sample.masterSpreadsheetId);
  container
    .get<ContextBuilder>('contextBuilder')
    .registerInterceptor(e2eActiveRepresentativesInterceptor);

  const runner = new TestRunner();
  const testSample: FullOnlineTestSample = { ...sample, testMode: sample.masterTestMode };
  for (const key of groups) {
    if (key === 'email' || key === 'jobRunner') {
      (registrations[key] as RegisterEmailChecks)(runner, container, testSample, EMAIL_TEST_SAFE);
    } else if (key === 'cacheIsolamento') {
      registrations.cacheIsolamento(runner, container, testSample, cacheIsolationDeps(properties, overrides));
    } else {
      (registrations[key] as RegisterSharedChecks)(runner, container, testSample);
    }
  }
  return runner.report();
}
```

`executeFullOnlineTests` diventa una chiamata a
`executeOnlineTestsBatch(ALL_GROUP_KEYS, overrides)` — comportamento
invariato, zero regressioni per l'uso esistente (nessun consumer del runner
aggregato cambia).

### Raggruppamento batch

| Batch | Gruppi (`FullOnlineTestRegistrations` keys) | Peso reale | Vincolo |
|---|---|---|---|
| 1 | `documenti`, `jobRunner` | ~55-60 documenti Drive, il più pesante | Nessuno — provisiona i dati che il batch 2 legge |
| 2 | `email`, `articolazione` | Leggero, ma legge righe `LOG_DOCS`/`LOG_MAIL` già generate | **Richiede batch 1 già eseguito** (email invia allegati VERBALE/PIANI/PIANO_LAVORO generati in batch 1; articolazione legge `RIEPILOGO_FIRME_CDC` e i piani duali generati in batch 1) |
| 3 | `import`, `storico`, `itpDotted`, `aclReali` | Leggero, ~5 documenti totali | Indipendente |
| 4 | `supplenzeRuoli`, `cacheIsolamento`, `permessi` | Quasi nullo, solo lettura/assert | Indipendente |

### Nuovi launcher GAS

Mirror del pattern esistente per `runFullOnlineTests`
(`runReportedSuite('online_tests_batchN', 'ONLINE_TEST_SUITE_BATCH', ...)`):

```ts
export function executeOnlineTestsBatch1(overrides: Partial<FullOnlineTestDeps> = {}): OnlineTestReport {
  return executeOnlineTestsBatch(['documenti', 'jobRunner'], overrides);
}
export function runOnlineTestsBatch1(...): OnlineTestReport {
  return runReportedSuite('online_tests_batch1', 'ONLINE_TEST_SUITE_BATCH', executeOnlineTestsBatch1, logger);
}
```

...analogo per batch 2-4 con le rispettive liste di gruppi.

### Wiring GAS (bridge a due file, pattern esistente)

Come ogni altro launcher (`creaDatiMockDrive`, `testDocumentiStandard`, ...):

- `src/onlinetests/OnlineTestsEntry.ts`: aggiungere `runOnlineTestsBatch1..4`
  all'interfaccia `AldoOnlineTestsLaunchers` + wrapper zero-arg che
  inoltrano al bridge.
- `src/onlinetests/entrypoints/EntryPointOnlineTests.ts`: importare le 4
  funzioni da `./index`, aggiungerle all'oggetto `aldoOnlineTestsLaunchers` e
  alle assegnazioni `gasGlobal.*`.

Nessuna modifica a `Menu.ts`/UI: questi launcher restano, come tutti gli
altri test online, invocabili solo dal menu Esegui di Apps Script (uso
sviluppatore), non esposti nella UI Sheets.

## Gestione errori

Nessun guard esplicito di precondizione tra batch: se il batch 2 viene
lanciato prima del batch 1, i check `email`/`articolazione` falliscono già
con `ValidationError` descrittivi (es. "LOG_DOCS privo di fileId" /
"Documento CDC per {classe} privo di fileId LOG_DOCS") che indicano
chiaramente la riga/documento mancante — sufficiente per un uso da
sviluppatore che segue l'ordine 1→4 documentato qui e nel commento del
codice. Aggiungere una guardia dedicata sarebbe validazione per uno scenario
già coperto da errori chiari esistenti (YAGNI).

## Testing

Estensione di `test/unit/onlinetests/fullOnlineTests.test.ts` (già mocka ogni
`register*Checks` e verifica quali vengono chiamati da
`executeFullOnlineTests`): 4 nuovi case, uno per batch, che asseriscono che
`executeOnlineTestsBatchN` chiami **esclusivamente** i mock dei gruppi
assegnati a quel batch e nessun altro. Verifica economica e offline della
composizione corretta, senza toccare GAS reale.

`executeFullOnlineTests` esistente resta coperto dai test attuali (nessuna
modifica al suo comportamento osservabile).

## Fuori scope

- Riduzione dell'anagrafica di `SharedTestDatabaseBuilder` (alunni/classi/
  docenti) — decisione 1.
- Rimozione di call-site di generazione ritenuti ridondanti — decisione 2.
- `runFullOnlineTests` resta invariato e disponibile per ambienti senza
  vincolo di 30 minuti (non deprecato).
- Fix del layout cartelle Drive "fractal" di `creaDatiMockDrive` — gestito
  separatamente, già implementato (rinominati i path `_ALDO_E2E_ROOT/OUTPUT/*`
  → `_ALDO_E2E_OUTPUT/*`, ASL → `_ALDO_E2E_ASL/*`, in
  `src/onlinetests/data/Seeders.ts` e `src/onlinetests/checks/documentiChecks.ts`),
  non fa parte di questo spec.

## Riferimenti

- `docs/superpowers/specs/2026-08-10-online-tests-restructure-design.md`
  (design originale dei 23 launcher granulari e di `runFullOnlineTests`)
- `src/onlinetests/index.ts:107-175` (`FullOnlineTestRegistrations`,
  `futureScenarioRegistrations`)
- `test/unit/onlinetests/fullOnlineTests.test.ts` (pattern di test da
  estendere)
