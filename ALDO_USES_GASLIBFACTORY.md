# ALDO uses GasLibraryFactory — Refactoring Log

Data: 2026-07-05.
Obiettivo: garantire che ALDO (SGSA) contenga **solo logica di business**, delegando tutto il resto agli strumenti di `GasLibraryFactory`, senza mai reimplementarli. Punto di partenza: l'analisi in `REPORT_USING_GASLIB_BY_ALDO.md`.

Esito sintetico: **tutte le reimplementazioni individuate dal report (sezione A) sono state eliminate**; per la sezione B (lacune della libreria) è risultata necessaria **una sola estensione minimale** di GasLibraryFactory (opzione UTC in `DateUtils.formatDate`), corredata di test offline e online. Tutti i gate sono verdi: ALDO `typecheck` ✓, `lint` ✓, 207 test unit ✓, 5 test integration ✓; GasLibraryFactory 7.617 test ✓.

---

## 1. Reimplementazioni eliminate (report §A)

### A.1 — Pipeline custom → `PipelineFramework` (L3)

**Rimosso:** `src/infrastructure/pipelines/DocumentoPipeline.ts`, `Step.ts`, `PipelineContext.ts` (orchestratore, classe base step e contesto scritti in casa).

**Ora:** i 10 step del processo documentale (`src/infrastructure/steps/documentSteps.ts`) estendono la classe globale `Step` della libreria (`super(name, logger, options)`); `DocumentGenerationService` compone la `Pipeline` della libreria. In cambio ALDO ottiene gratis:

- **gating condizionale** via `options.shouldExecuteCondition` (il gate `shouldGenerate` di 10 §1);
- **validazione del contesto** via `options.requiredKeys` (es. `CloneTemplate` richiede `templateId`, `nomeFile`, `destFolderId`);
- **telemetria**: `PipelineContext.getExecutionHistory()` / `getSummary()` sostituiscono i log manuali `errors[]`/`logEsecuzione[]`;
- **hook di ciclo vita**: la semantica "step critico" di ALDO (rollback del file clonato + arresto, 10 §8) è ora *configurazione* della libreria, non codice: pipeline con `stopOnError:false` (i fallimenti non critici vengono registrati e si prosegue) + hook `onError` che, per gli step in `CRITICAL_STEPS`, cancella il file orfano, marca `criticalError` e chiama `context.requestStop()`. Il servizio rilancia `PipelineError` dopo l'esecuzione.

La mappatura semantica dal vecchio flag `critical`:

| Vecchio comportamento ALDO | Meccanismo della libreria |
| :--- | :--- |
| step non critico fallisce → log e prosegue | `Pipeline({stopOnError:false})` registra `failed` nella history e continua |
| step critico fallisce → rollback file + throw | hook `onError` + `ctx.requestStop()` + flag; rilancio nel servizio |
| `shouldExecute()` override | `options.shouldExecuteCondition` |
| `ctx.addError/addSuccess` | `recordStepExecution` automatico + `getSummary()` |

### A.2 — `resolvePlaceholders` regex → `WorkspaceTemplateEngine` (L2)

**Rimosso:** la funzione `resolvePlaceholders` (regex `/\{\{...\}\}/` + traversal manuale dei path) in `documentSteps.ts`, e la facade fantasma `DocumentServiceFacade` che invocava una classe **inesistente** (`WorkspaceTemplateEngine.renderDoc` — drift dei tipi ambient, report §B.5).

**Ora:** nuovo port `ITemplateEngine` (`src/infrastructure/facades/TemplateEngineFacade.ts`) su `PlaceholderService` + `Mustache` reali:

- `FILE_NAME` e `PATH_OUT` sono resi con `placeholderService.processString(template, cdu)` — con supporto nativo ai filtri pipe (`| date`, `| uppercase`, …) richiesti da `14_SERVIZI_UTILITY.md` §6, protezione da prototype pollution e path puntati robusti;
- `VerbaleGeneratorStrategy` non costruisce più la mappa `{placeholder → valore}` a mano: chiama `processDocument(fileId, cdu)`, cioè il template Drive contiene i tag `{{focus...}}` e il CDU è il contesto di rendering (rendering strutturale reverse-order, batch update).

### A.3 — `resolveChain` ricorsivo → `RoleResolutionLib` (L4)

**Rimosso:** in `SupplenzaRepository`, la ricorsione manuale `resolveChain` con `Set` dei visitati e il matcher `matchFor` (reimplementazione della delega transitiva con guardia sui cicli).

**Ora:** `findSupplenzaSpecifica` mantiene in ALDO **solo il filtro di dominio** (supplenza attiva alla data + applicabilità classe/materia, metodi dell'entity `Supplenza`) e delega il **crawl transitivo titolare → supplente → supplente-del-supplente** alla libreria: le supplenze applicabili diventano value object `Delegation` (`principalId`/`delegateId`/`validFrom`/`validTo`) dentro una `InMemoryDelegationSource`, e `getDelegationChain(...)` esegue la camminata cycle-guarded restituendo la catena ordinata; l'ultima arcata identifica la `Supplenza` effettiva. Nota di dominio: una riga di auto-supplenza (titolare = supplente) è invalida (la libreria la rifiuta) e viene scartata a monte — il titolare resta in carica, semanticamente identico a prima. `CattedraResolver` resta invariato: la gerarchia SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI è logica di business da spec (01 §4) e ora poggia sulla catena risolta dalla libreria.

### A.4 — `ContextBuilder` legacy eliminato

**Rimosso:** l'intera directory `src/application/context/` (il `ContextBuilder` semplificato + il `Cdu` minimale che `DocumentGenerationService` ancora usava) e il relativo test.

**Ora:** il servizio usa il `ContextBuilder` modulare di `src/application/context-engine/` — costruito sui componenti pubblici di `ContextEngine` (L3): `ProviderRegistry`, `InterceptorRegistry`, `ContextInterceptor` — cablato da `ContextEngineFactory.create(database)` e pilotato da `recipe('CLASSE_COMPLETA')` (09 §3). L'unico tipo `Cdu` rimasto è quello conforme a `02_CDU_STRUTTURA.md`; `GeneratorStrategy` e gli step ora tipizzano su di esso.

### A.5 — Condizioni valutate da `GasExpressionEngineLib` (L2)

**Rimosso:** in `AnalyzeContextStep` il check manuale "condizione vuota ⇒ genera" e in `SelectTemplateStep` il parsing JSON con il confronto letterale `condizione === 'true'`.

**Ora:** gli step ricevono `ConfigurazioneDocumentoRepository` + `IExpressionEngine` e chiamano i metodi già progettati allo scopo: `shouldGenerate(config, cdu, engine)` e `resolveTemplateId(config, cdu, engine)`, che delegano la valutazione a `ExpressionEngineService` (AST sicura, niente eval) col CDU come contesto `{{...}}`. Le espressioni reali funzionano: la fixture `CD_ESAME` (`{{focus.classe.anagrafica.anno}} == 5`, MODELLI condizionali) è coperta da test unit e end-to-end e seleziona `tmpl_esame` per valutazione effettiva, non per fallback.

### A.6 — Batch generation su `JobRunnerLib` (L3)

**Aggiunto:** `src/application/services/DocumentBatchService.ts`. La generazione per tutte le classi attive è una **generator function** (`batchGenerateHandler`) registrata sotto il job type `GENERAZIONE_DOCUMENTI_CLASSI`:

- `yield` di un checkpoint `{percentage, nextIndex, processed}` dopo ogni classe — il punto di sospensione naturale in cui la libreria controlla il tempo, serializza lo stato su `ScriptProperties` e programma il trigger di ripresa;
- alla ripresa il generatore riparte da `params.resumeState.nextIndex` senza rielaborare le classi già fatte;
- `start()`/`resume()` incapsulano `JobRunnerService.run/resume` con la registry callback (`registerJobHandlers`).

Il contratto del generatore (checkpoint, ripresa, registrazione) è coperto da test offline; la macchina trigger/stato è della libreria (già testata nel monorepo e nei suoi test online). L'entry point GAS (funzioni globali di avvio/resume) atterrerà con la composition root di produzione.

### A.7 — Transazioni `SheetDBLib` (L2)

**Scoperta chiave** (dalla semantica reale della libreria): `SheetDBLib` **vieta `save()` a transazione aperta** ("Cannot call save() during a transaction. Use commit() to apply changes."). Quindi l'integrazione corretta non è "avvolgere i save", ma spostare il confine di persistenza sul servizio:

- il port `IDatabase` (`src/infrastructure/db/Database.ts`) espone ora `beginTransaction()/commit()/rollback()` con la stessa semantica della `DatabaseService` della libreria;
- gli step **non chiamano più `db.save()`**: mutano soltanto (`LOG_FOLD`, `LOG_DOCS`);
- `DocumentGenerationService.generateForClasse` fa `beginTransaction()` → pipeline → `commit()` a successo, `rollback()` su errore critico (in coppia col rollback Drive dell'hook `onError`) — esattamente il piano del report ("Only call commit() when the pipeline successfully runs to completion");
- `FakeDatabase` replica la semantica (snapshot dei row cache al begin, `save()` che lancia in transazione, restore al rollback), con test dedicati.

Copertura end-to-end: il test "critical failure rolls back Drive clone and DB transaction" verifica che su fallimento del rendering il file clonato venga cestinato **e** le righe `LOG_FOLD`/`LOG_DOCS` spariscano.

---

## 2. Lacune della libreria (report §B): valutazione ed esito

Mandato: estendere GasLibraryFactory **solo se assolutamente necessario**. Esito: **una** estensione.

### B — ESTESA: opzione UTC in `CoreUtilsLib DateUtils.formatDate`

- **Lacuna reale:** `formatDate` derivava i token solo dai componenti *locali* della data; il CDU richiede date deterministiche e indipendenti dal fuso host (02 §2), per cui ALDO aveva reimplementato zero-padding e formattazione (`formatOggi`/`due()` in `dates.ts`, `isoDate()` in `SupplenzaRepository`) — la duplicazione L0 segnalata dal report.
- **Estensione (minima, retrocompatibile):** terzo parametro `options` con `utc: true` in `DateUtils.formatDate` (`GasLibraryFactory/CoreUtilsLib/src/utils/DateUtils.js`); affiora automaticamente su `UtilsService.formatDate` (facade a delega dinamica). README di CoreUtilsLib aggiornato.
- **Test offline:** nuovo blocco `describe('options.utc')` in `CoreUtilsLib/src/__tests__/UtilsService.test.js` (derivazione UTC di tutti i token, retrocompatibilità del default locale, options null/false, boundary di giorno). Suite completa monorepo: 7.617 ✓.
- **Test online:** `Integration/Utils/UtilsService_FormatDate_Utc` in `GasLibraryFactory/__testOnline__/integration/IntegrationTests_Utils.gs` (runner `runner.register` + `SmartAssert`, eseguito su GAS reale via CLASP col bundle compilato).
- **Uso in ALDO:** `dates.ts` ora delega ogni token a `utils.formatDate(d, pattern, {utc:true})` (resta domestica solo la dicitura italiana del mese esteso, che è conoscenza di dominio da spec); `SupplenzaRepository.isoDate` usa `formatDate(d, 'YYYY-MM-DD', {utc:true})`.
- **Vendoring:** bundle rigenerato con `npm run refresh:vendor` (build testing del monorepo → `vendor/gaslibs.Code.js`, v3.0.0, checksum aggiornato e verificato con `npm run verify:vendor`).

### B — NON estese (motivazione)

| Lacuna dal report | Decisione |
| :--- | :--- |
| **B.1 CDU gerarchico vs `ContextAssembler` piatto** | Non necessaria. Il loop di merge annidato di `ContextBuilder` è la *struttura di business* del CDU (02, 09 §2) e già riusa i componenti pubblici della libreria (`ProviderRegistry`, `InterceptorRegistry`, `ContextInterceptor`). Un `HierarchicalContextAssembler` generico resta un'evoluzione possibile della libreria, non un prerequisito. |
| **B.2 chunking/generator in `WorkspaceTemplateEngine`** | Non necessaria ora: il checkpoint di `JobRunnerLib` è per-classe/per-documento (A.6) e il rendering di un documento è una singola chiamata batch. Da rivalutare se compariranno documenti con centinaia di pagine per singolo render. |
| **B.3 `RoleResolutionLib` domain-agnostic** | Risolta senza estendere: il pattern corretto è l'adapter (SUPPLENZE → `Delegation`), che la libreria già prevede (Data Source Interface / Dependency Inversion). |
| **B.4 streaming in `GasDataImporter`** | Non pertinente ora: l'ImportService di ALDO non è ancora implementato; nessun codice da correggere. |
| **B.5 assenza di `.d.ts` ufficiali** | Mitigata lato ALDO: `types/gaslibs/index.d.ts` riscritto contro le classi *reali* del bundle (eliminata la classe fittizia `WorkspaceTemplateEngine.renderDoc` e il tipo morto `SheetDatabase`; aggiunti `Pipeline`/`Step`/`PipelineContext`, `PlaceholderService`/`Mustache`, `Delegation`/`InMemoryDelegationSource`/`Scope`, `JobRunnerService`/`JobDefinitionRegistry`/`UtilsService.formatDate`, `DatabaseService` con transazioni). La migrazione della libreria a TS/JSDoc-emit resta consigliata ma non è "assolutamente necessaria". |

---

## 3. File toccati

**ALDO — eliminati** (reimplementazioni):
`src/infrastructure/pipelines/{DocumentoPipeline,Step,PipelineContext}.ts`, `src/application/context/{ContextBuilder,Cdu}.ts`, `src/infrastructure/facades/DocumentServiceFacade.ts`, `test/unit/application/context-builder.test.ts`, `test/fakes/FakeDocumentFacade.ts`.

**ALDO — nuovi:**
`src/infrastructure/facades/TemplateEngineFacade.ts` (port su PlaceholderService), `src/application/services/DocumentBatchService.ts` (JobRunnerLib), `test/fakes/FakeTemplateEngine.ts`, `test/unit/application/document-batch-service.test.ts`.

**ALDO — riscritti/aggiornati:**
`src/infrastructure/steps/documentSteps.ts` (step su library `Step`; ExpressionEngine + PlaceholderService), `src/application/services/DocumentGenerationService.ts` (library `Pipeline`, ContextBuilder modulare, transazioni), `src/application/strategies/{GeneratorStrategy,VerbaleGeneratorStrategy}.ts`, `src/infrastructure/repositories/SupplenzaRepository.ts` (RoleResolutionLib + isoDate via CoreUtilsLib), `src/application/context-engine/dates.ts` (formatDate UTC), `src/infrastructure/db/Database.ts` (transazioni), `types/gaslibs/index.d.ts`, `test/fakes/FakeDatabase.ts`, e i test: `pipeline-framework.test.ts` (ora harness della libreria vendorizzata), `document-steps.test.ts`, `verbale-cdc.test.ts` (integration, + casi condizionali e rollback), `fake-database.test.ts`, `fake-facades.test.ts`, `harness/gaslibs.test.ts` (asserzioni sui nuovi global).

**GasLibraryFactory:**
`CoreUtilsLib/src/utils/DateUtils.js` (opzione `utc`), `CoreUtilsLib/src/__tests__/UtilsService.test.js` (test offline), `__testOnline__/integration/IntegrationTests_Utils.gs` (test online), `CoreUtilsLib/README.md` (doc). Bundle rivendorizzato in `vendor/` (v3.0.0, checksum verificato).

---

## 4. Verifica

| Gate | Esito |
| :--- | :--- |
| ALDO `npm run typecheck` | ✓ |
| ALDO `npm run lint` | ✓ (0 errori) |
| ALDO `npm test` (unit) | ✓ 207/207, 52 suite |
| ALDO `npm run test:integration` | ✓ 5/5 |
| GasLibraryFactory `npm test` | ✓ 7.617 passed (9 skipped preesistenti), 209 suite |
| GasLibraryFactory lint sui file toccati | ✓ (il lint globale del monorepo ha ~2.9k errori **preesistenti**, invariati) |
| `npm run verify:vendor` | ✓ checksum OK |
| Test online GAS | scritti (`Integration/Utils/UtilsService_FormatDate_Utc`); l'esecuzione richiede `clasp push` su un progetto GAS reale e va lanciata dal `MasterTestRunner` come da `BUILD_AND_DEPLOY.md` |

## 5. Cosa resta volutamente in ALDO (business logic)

- La **struttura del CDU** e i provider/interceptor che lo popolano (02, 09) — costruiti *sui* registri di ContextEngine.
- La **gerarchia a tre priorità** SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI in `CattedraResolver` (01 §4) — la camminata sulle catene è della libreria.
- La **composizione della pipeline documentale** (quali step, quali critici, quale ricetta CDU) — l'esecuzione è della libreria.
- I **nomi dei mesi italiani** per la data estesa del CDU (02 §2).
- Le **entity/repository di dominio** (che già estendono `DomainRepositoryLib`).
