# Audit dei log — ALDO e GasLibraryFactory

Data: 2026-08-29

## Esito

Non ci sono log di produzione che disegnano manualmente l'albero di
indentazione (`├─`, `└─`, `│`). L'unico uso è nelle aspettative dei test di
`LoggerService`. Non va quindi introdotta un'altra convenzione di spazi.

`CoreUtilsLib.LoggerService` e `JobRunnerLib.CapturingLogger` hanno già la
soluzione condivisa: `withPosition(position, callback)`. Durante una
`Pipeline` ogni `debug/info/warn/error` emesso dallo step eredita la posizione
attiva. I log semantici (`logJob*`, `logBatchStart`, `logItemStart`,
`logPipeline*`, `logStep`, `logSummary`) costruiscono invece la riga ad albero
esplicitamente. Di conseguenza un normale `logger.info(...)` non è un difetto
di indentazione quando gira sotto una posizione; aggiungergli spazi manuali lo
sarebbe.

L'audit ha trovato 112 invocazioni `.info(...)` in codice sorgente di
produzione: 108 nelle librerie e 4 in ALDO. Non esiste una riga di produzione
che contenga letteralmente `[INFO]`: il prefisso è aggiunto centralmente da
`LoggerService._formatMessage`. Le occorrenze letterali sono JSDoc o test e
non sono candidate a modifica.

Decisione: mantenere `INFO` solo per confini operativi, lifecycle e risultati
che l'operatore deve vedere con il livello predefinito; spostare a `DEBUG` la
diagnostica di configurazione, i dettagli per riga/elemento e le informazioni
già riassunte dalla riga di completamento. Nessuna modifica al codice è stata
eseguita.

## Regola di lettura della tabella

Ogni riferimento `file:linea` è una riga trovata, non un intervallo stimato.

| Decisione | Prima | Dopo |
| --- | --- | --- |
| `DEBUG` | `logger.info(messaggio)` | `logger.debug(messaggio)` |
| `INFO` | `logger.info(messaggio)` | invariato |
| `IMPL` | inoltro interno di `LoggerService`/`CapturingLogger` | invariato |

Questa è anche l'esempio before/after per ciascuna riga nella tabella
seguente: l'argomento, il contesto e la valutazione lazy non cambiano; cambia
solo il livello. Le cinque eccezioni con spazi manuali hanno esempi completi
nella sezione successiva.

## Inventario completo delle righe INFO

| File e righe | Decisione | Motivo |
| --- | --- | --- |
| `ContextEngine/src/internal/ContextStepExecutor.js:269` | INFO | Fallback della singola sintesi di assemblaggio quando il logger non offre `logSummary`. |
| `GasDataImporter/src/ImportEngine.js:54`; `ImportStrategyRegistry.js:9`; `internal/extract-strategies/SheetByIdStrategy.js:40`; `SourceStrategy.js:35,48`; `FolderStrategy.js:50,84,88,119`; `SourceStrategyFactory.js:64`; `pipeline/Transformer.js:89,105` | DEBUG | Inizializzazione, registrazione, configurazione e dettagli di estrazione/trasformazione; l'esecutore emette già l'avvio e la sintesi dell'import. |
| `GasDataImporter/src/pipeline/ImportPipelineExecutor.js:23,231,338,344,349,354,359,364,369` | DEBUG | Checkpoint, configurazione e fasi/dati intermedi. Sono ripetuti dal monitor di fase e dal completamento dell'import. |
| `GasDataImporter/src/pipeline/ImportPipelineExecutor.js:223,248` | INFO | Avvio e completamento dell'import: i due confini operativi utili. |
| `GasDataImporter/src/internal/load/Loader.js:66,110,162,219,222,271,402,412,454,462,505` | DEBUG | Strategia, salvataggi e contatori parziali; `Load complete` o il completamento dell'import contiene già il risultato utile. |
| `GasDataImporter/src/internal/load/Loader.js:113` | INFO | Sintesi del caricamento quando `Loader` è usato direttamente. |
| `GasProcessMonitorLib/src/ProcessMonitorService.js:262,279,304,522` | INFO | Lifecycle del job e pulizia dello stato: eventi operativi, non dettagli di una singola fase. |
| `GasResilienceLib/src/handlers/CircuitBreaker.js:319` | INFO | La transizione/condizione del circuit breaker è un evento di affidabilità operativo. |
| `DomainRepositoryLib/src/Repository.js:55,261,275,280,341,359,408,453,482` | DEBUG | Dry-run e mutazioni di singole entità. In batch generano rumore e il chiamante conosce già l'operazione richiesta. |
| `GoogleApiWrapper/src/services/DriveService.js:59`; `SpreadsheetService.js:93`; `GoogleApiWrapper/src/services/drive/DriveMetadataService.js:36`; `DriveFileManager.js:159,229,335`; `SheetDBLib/src/DatabaseService.js:77`; `SheetDBLib/src/internal/database-managers/DatabaseConnectionManager.js:42,47` | DEBUG | Inizializzazione/dettaglio dry-run o dettaglio per elemento; non è un esito operativo autonomo. |
| `GoogleApiWrapper/src/services/MailService.js:82`; `TriggerService.js:277`; `PropertiesService.js:217`; `GoogleApiWrapper/src/services/drive/DriveMetadataService.js:33`; `DriveShortcutHandler.js:31`; `DriveFolderManager.js:48`; `DriveFileManager.js:37,99,157,227,333` | INFO | E-mail inviata, cancellazioni globali o riepilogo di una richiesta dry-run: un operatore deve poterli vedere. |
| `GoogleApiWrapper/src/internal/services-managers/SpreadsheetRangeManager.js:32,191`; `SpreadsheetGridManager.js:18,72,100,227,271,347,365`; `DocumentBatchUpdateHandler.js:68,172` | INFO | Effetti Drive/Sheet/Document significativi (creazione, esportazione, protezione o modifica batch). |
| `GoogleApiWrapper/src/internal/services-managers/SpreadsheetGridManager.js:258` | DEBUG | Il solo conteggio delle protection trovate è diagnostico e precede l'azione già loggata. |
| `PipelineFramework/src/Pipeline.js:104,144,184,328,346` | INFO | Sono esclusivamente fallback quando il logger iniettato non supporta le API semantiche. Con `LoggerService` sono già sostituiti da righe strutturate e indentate. |
| `PipelineFramework/src/ConsumerStep.js:103,111,115`; `ProducerStep.js:148` | DEBUG | Duplicano l'esito della step che `Pipeline.logPipelineStep` stampa già; restano comunque indentati automaticamente sotto `withPosition`. |
| `JobRunnerLib/src/JobQueue.js:119,592,644`; `internal/managers/JobRunnerLogCapturer.js:74,114`; `internal/managers/JobRunnerStateManager.js:119` | INFO | Dimensione del job, cancellazione/reset espliciti e URL del log persistito sono eventi amministrativi utili. |
| `JobRunnerLib/src/internal/managers/JobRunnerExecutionController.js:26` | INFO | Fallback per logger non semantico, come in `Pipeline`. |
| `JobRunnerLib/src/internal/CapturingLogger.js:136`; `CoreUtilsLib/src/LoggerService.js:383,385` | IMPL | Inoltri dell'API del logger, non nuovi eventi. Cambiarli cambierebbe il contratto del livello richiesto dal chiamante. |
| `SheetDBLib/src/internal/database-managers/DatabaseConnectionManager.js:40,126` | INFO | Riepilogo dry-run e rollback della transazione sono i soli esiti utili per l'operatore. |
| `WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorInjector.js:82,151,400,518`; `processors/DocumentProcessor.js:283` | DEBUG | Dettagli dell'implementazione di loop/inserimenti e caso "nessuna operazione"; non aggiungono un esito rispetto alla pipeline chiamante. |
| `src/application/services/DatabaseValidationService.ts:74`; `LockDocumentsService.ts:59` | INFO | Il link del report e l'avanzamento periodico sono l'unico feedback dell'operazione root. Non c'è una posizione padre da inventare. |
| `src/application/services/LockDocumentsService.ts:76`; `src/onlinetests/index.ts:827` | DEBUG | Il dettaglio per file è ripetitivo; il JSON completo di coverage è diagnostico e la suite possiede già il proprio riepilogo strutturato. |

## Le cinque righe con spazi manuali

Queste sono le sole righe di produzione che simulano gerarchia con spazi.
Non hanno un `LogPosition`, quindi usare `logStep` sarebbe una falsa
gerarchia. Sono dettagli per elemento di un dry-run: vanno a `DEBUG` e gli
spazi vengono eliminati. Se la chiamata avviene dentro una `Pipeline`,
`withPosition` fornirà comunque il prefisso corretto.

| Posizione | Prima | Dopo proposto |
| --- | --- | --- |
| `GoogleApiWrapper/src/services/drive/DriveMetadataService.js:36` | `info("[DRY-RUN]   - Update <id> metadata: <fields>")` | `debug("[DRY-RUN] - Update <id> metadata: <fields>")` |
| `GoogleApiWrapper/src/services/drive/DriveFileManager.js:159` | `info("[DRY-RUN]   - Copy <id> as ...")` | `debug("[DRY-RUN] - Copy <id> as ...")` |
| `GoogleApiWrapper/src/services/drive/DriveFileManager.js:229` | `info("[DRY-RUN]   - Move <id> to ...")` | `debug("[DRY-RUN] - Move <id> to ...")` |
| `GoogleApiWrapper/src/services/drive/DriveFileManager.js:335` | `info("[DRY-RUN]   - Rename <id> to ...")` | `debug("[DRY-RUN] - Rename <id> to ...")` |
| `SheetDBLib/src/internal/database-managers/DatabaseConnectionManager.js:42` | `info("[DRY-RUN]   - <table>: ...")` | `debug("[DRY-RUN] - <table>: ...")` |

## Log senza infrastruttura di indentazione

| Posizione | Decisione | Perché |
| --- | --- | --- |
| `CoreUtilsLib/src/LoggerService.js:200,292` | invariato | Sono il punto unico che scrive nel logger GAS; qui viene applicata la posizione strutturata quando presente. |
| `GasOnlineTestFramework/src/TestContext.js:261,263`; `SmartAssert.js:46,48`; `EnhancedTestRunner.js:150,152` | invariato | Output diagnostico standalone del framework di test. Non appartiene a un job/pipeline e non deve fingere indentazione. |
| `GasProcessMonitorLib/src/DashboardUi.js:500` | invariato | `console.error` nel JavaScript della sidebar, non nel flusso GAS del logger. |
| `CoreUtilsLib/src/utils/IdGenerator.js:143` | invariato | Fallback `console.warn` senza logger iniettato; non esiste un contesto strutturale affidabile. |
| `src/entrypoints/EntryPoints_Base.ts:38` | invariato | Errore prima/durante la ripresa dell'entrypoint, quando il container/logger può non essere disponibile. |

I `console.*` rimanenti rilevati sono JSDoc o test mock e non producono log di
runtime. Non sono inclusi nelle decisioni.

## Implementazione consigliata

1. Applicare esclusivamente i cambi `INFO → DEBUG` indicati sopra, senza
   introdurre spazi davanti ai messaggi.
2. Rimuovere i tre spazi manuali nelle cinque righe dry-run.
3. Non sostituire i fallback di `Pipeline`/`JobRunner`: servono a preservare
   la compatibilità con logger minimi. Non aggiungere `withPosition` alle
   librerie di basso livello: quando ricevono `LoggerService`, l'indentazione
   si propaga già dal chiamante; quando non lo ricevono, non esiste un albero
   corretto da rappresentare.
