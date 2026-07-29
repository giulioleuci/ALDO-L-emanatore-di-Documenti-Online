# 📊 Report sull'Utilizzo di GasLibraryFactory in ALDO (SGSA)

> **Documento di Analisi**: Analisi della copertura e dell'utilizzo delle 16 librerie dello stack `GasLibraryFactory` all'interno della codebase di **ALDO** (Sistema di Gestione Scolastica Automatizzata).
> **Obiettivo**: Identificare le aree in cui le funzionalità native fornite dalle librerie `GasLibraryFactory` non vengono sfruttate, sono sotto-utilizzate, oppure dove la logica applicativa ha reimplementato custom-code laddove la libreria offre astrazioni già pronte.

---

## Executive Summary

L'architettura di ALDO è stata progettata con un vincolo primario: **GasLibraryFactory-first**. L'applicazione deve appoggiarsi prioritariamente ai 16 moduli dello stack `GasLibraryFactory` (L0 → L4) anziché riscrivere logiche di infrastruttura o di dominio generale.

Dall'analisi sistematica dell'intera codebase (`src/`), condotta tramite l'utilizzo del **Codebase Knowledge Graph (`codebase-memory-mcp`)** e il confronto con le specifiche in `GasLibraryFactory/DOCS_LIBS/`, emerge che:
- **Tutte le 16 librerie sono presenti** nell'infrastruttura dell'ecosistema o collegate nel composition root (`Bootstrap.ts`).
- **Nessuna libreria è completamente inutilizzata**, ma **molte librerie sono utilizzate solo parzialmente o al 20-40% del loro potenziale complessivo**.
- Sussistono diverse aree critiche in cui ALDO ha implementato logiche custom in TypeScript (es. composizione HTML delle email, gestione dei timeout per l'importazione dati, cicli annidati per le JOIN tra tabelle, formatters per liste nei documenti) ignorando le capabilities avanzate di `GasLibraryFactory`.

---

## 📈 Matrice di Copertura delle 16 Librerie

| Livello | Libreria | Stato in ALDO | Capabilities Sfruttate | Capabilities Mancanti / Sotto-utilizzate in ALDO |
| :--- | :--- | :--- | :--- | :--- |
| **L0** | `CoreUtilsLib` | Parziale | `isValidEmail`, `DateRange` | `PiiRedactor`, `RegexUtils`, `hashDeterministic`, `getRandomValues` |
| **L0** | `GasResilienceLib` | Parziale | Invocata internamente da `GoogleApiWrapper` | `CircuitBreaker` a livello applicativo per Gmail/Drive, `executeWithBypass` |
| **L0** | `GasOnlineTestFramework` | Parziale | Usata nei test online (`OnlineTests.js`) | Registrazione automatica `ResourceCleaner` per file/cartelle Drive temporanei nei test |
| **L1** | `GoogleApiWrapper` | Ampio | `DriveService`, `GmailService`, `DocumentService` (tabelle) | `DriveService.deleteFiles` (batch delete), `appendListItem` (liste native Docs), `getRemainingDailyQuota` pre-check |
| **L1** | `GasSchemaValidatorLib` | Parziale | Usata internamente da `SheetDBLib` | Validazione schema Zod sui JSON delle tabelle `CONF_*` e sul contratto del CDU |
| **L2** | `SheetDBLib` | Ampio | `DatabaseService`, `TableService`, `SheetDbAdapter` | **Hash Joins** O(n+m) (sostituiti da cicli custom O(n*m)), Transazioni ACID (`beginTransaction`), Unit of Work `.save()` batching |
| **L2** | `GasExpressionEngineLib` | Ampio | `ExpressionEngineFacade`, filtri pipeline | Operatori custom (`in`, `between`, `match`), pre-compilazione AST nei batch |
| **L2** | `WorkspaceTemplateEngine` | Ampio | `PlaceholderService`, `Mustache`, Reverse-Order Docs | Filtri Pipe-Filter (`sortBy`, `filter`), placeholder `dynamic_rows` su Sheets, `dynamic_columns` multi-gruppo |
| **L3** | `JobRunnerLib` | Parziale | `DocumentBatchService`, `EmailBatchService` | **`ImportService` (ETL) e `EmailRetryService` non sono integrati in `JobRunnerLib`** (rischio timeout 6 min) |
| **L3** | `PipelineFramework` | Ampio | `DocumentGenerationService`, `EmailNotificationService` | Disaccoppiazione Producer-Consumer (dry-run), Hook globali di telemetria (`onStepStart`/`onStepEnd`) |
| **L3** | `ContextEngine` | Ampio | `ContextEngineFactory`, `ContextBuilder`, DataProviders | Ricette JSON dichiarative per i contesti, middleware `ContextInterceptor` per la sostituzione ruoli |
| **L3** | `DomainRepositoryLib` | Parziale | Entità di dominio, `Specification` pattern | **`IdentityMap`**, **`DirtyChecking`** (riscrittura completa colonne), **`DataMapper`** automatico riga-entità |
| **L3** | `GasDataImporter` | Parziale | `ImportEngine`, custom source strategies | Trasformazioni espressioni nelle ricette, gestione conflitti `UPSERT` nativa |
| **L4** | `RoleResolutionLib` | Parziale | `RisolutoreRuoliService`, `CattedraResolver` | **Delega Transitiva multi-livello (A->B->C)**, strategie `RoutingPolicy` per email (TO/CC) |
| **L4** | `ComposableContentLib` | **Sotto-utilizzata** | Nessuna diretta nel rendering mail | **Composizione HTML mail da ricette JSON (`boxes.ts`, `saluto.ts` usano concatenazione di stringhe)**, Renderer multi-formato (HTML vs Plain Text) |
| **L4** | `GasProcessMonitorLib` | Ampio | `ProcessMonitorFacade` su batch documenti/email | Tracciamento dettagliato per sub-step nelle pipeline, barra di avanzamento per l'importazione ETL |

---

## 🔍 Analisi Dettagliata per Libreria

---

### 1. `CoreUtilsLib` (Livello L0 - Fondamenta)

#### 🛠️ Capabilities della Libreria
- `UtilsService`: Utility pure per la manipolazione sicura di oggetti, stringhe e date.
- `PiiRedactor`: Offuscamento e sanitizzazione di dati personali (email, nomi, token) per i log in conformità GDPR.
- `RegexUtils`: Validazione e sanitizzazione di espressioni regolari contro attacchi ReDoS (Regular Expression Denial of Service).
- `UtilsService.hashDeterministic()`: Generazione di hash deterministici prescindendo dall'ordine delle chiavi negli oggetti JSON.
- `DateRange`: Astrazione per intervalli di date con supporto a sentinelle di infinito (`null`), sovrapposizioni (`overlaps`), durata in giorni (`durationInDays`) e verifica di inclusione (`contains`).
- `UtilsService.isValidEmail()` e `generateUuid()` / `getRandomValues()`: Entropia sicura e validazione di rete/formati.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/domain/value-objects/Email.ts`: Invocazione diretta di `utils.isValidEmail(raw)`.
  - `src/domain/value-objects/PeriodoSupplenza.ts`: Incapsulamento completo di `DateRange` per la gestione del periodo di supplenza `[dal, al]`.
  - `src/config/Bootstrap.ts`: Inizializzazione di `ServiceFactory.getUtils()`.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Sicurezza Regex (`RegexUtils`)**:
   - *File interessati*: `src/application/context-engine/Recipe.ts`, `src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts`.
   - *Problema*: Il parsing dei percorsi di contesto e dei token nei template utilizza regular expression native TypeScript senza passare per `RegexUtils`, esponendo il runtime a blocchi ReDoS in presenza di template o dati malformati.
2. **Hashing Deterministico per la Cache (`hashDeterministic`)**:
   - *File interessati*: `src/application/services/AggregatoreDati.ts`, `src/application/storico/StoricoDatabaseProvider.ts`.
   - *Problema*: La creazione delle chiavi di cache o dei fingerprint del contesto viene eseguita tramite concatenazione manuale di stringhe (es. `${idClass}_${anno}`). Questo approccio è soggetto a errori di spaziatura o discrepanze nell'ordine dei dati.
3. **Generazione ID Sicuri (`getRandomValues`)**:
   - *File interessati*: `src/onlinetests/SampleDatabaseBuilder.ts`, `src/test/fakes/`.
   - *Problema*: La generazione di identificativi temporanei per il testing fa uso di `Math.random().toString()` anziché avvalersi della catena `UtilsService.generateUuid()` / `getRandomValues()`.

---

### 2. `GasResilienceLib` (Livello L0 - Fondamenta)

#### 🛠️ Capabilities della Libreria
- Classificazione degli errori di rete e di quota (`QuotaExceededException`, `TransientException`, `FatalException`).
- `RecoveryManager`: Gestione di retry con Exponential Backoff e Jitter per prevenire congestioni su API Google.
- `CircuitBreaker`: Macchina a stati (CLOSED, OPEN, HALF-OPEN) per interrompere immediatamente chiamate massive quando un servizio remoto è in outage o ha superato le quote.
- `executeWithBypass`: Meccanismo di degrado controllato che restituisce un valore di fallback predefinito in caso di fallimento totale.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - Utilizzata internamente in modo trasparente dal layer `GoogleApiWrapper` per avvolgere le chiamate HTTP di basso livello a Drive, Sheets e Gmail.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Resilienza e Circuit Breaker a Livello Applicativo per Gmail/Drive**:
   - *File interessati*: `src/application/services/EmailNotificationService.ts`, `src/application/services/EmailRetryService.ts`.
   - *Problema*: Durante l'invio massivo di centinaia di email, se la quota giornaliera di Gmail o Google Drive viene superata (`429 Quota Exceeded`), ALDO intercetta l'errore registrandolo nel log DB `LOG_EMAIL`, ma **continua ad iterare ed eseguire tentativi per tutti i successivi elementi della lista**. L'applicazione non sfrutta un `CircuitBreaker` a livello di servizio applicativo che, dopo $N$ errori di quota consecutivi, apra il circuito ed esca immediatamente dal ciclo, restituendo la gestione al `JobRunnerLib` per il rinvio al trigger successivo.
2. **Degrado Controllato (`executeWithBypass`)**:
   - *File interessati*: `src/application/storico/StoricoDatabaseProvider.ts`, `src/application/context-engine/providers/StatisticheProvider.ts`.
   - *Problema*: La risoluzione dei dati storici o l'aggregazione di blocchi statistici opzionali lancia eccezioni non gestite che interrompono l'intera generazione del documento, anziché utilizzare `executeWithBypass` per fornire un sotto-contesto vuoto o degradato in modo sicuro.

---

### 3. `GasOnlineTestFramework` (Livello L0 - Fondamenta)

#### 🛠️ Capabilities della Libreria
- Framework di test per l'ambiente runtime Google Apps Script online.
- Asserzioni fluenti tramite la classe static `Assert` (`Assert.equals`, `Assert.throws`, `Assert.deepEquals`, `Assert.contains`).
- `ResourceCleaner`: Tracciamento e cancellazione automatica dei file e cartelle temporanei creati durante l'esecuzione dei test online.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - Inclusa nella build di test online (`src/onlinetests/`, `npm run build:online`, bundle `OnlineTests.js`).

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Registrazione Automatica e Teardown delle Risorse in Drive (`ResourceCleaner`)**:
   - *File interessati*: `src/onlinetests/E2eSampleDatabaseBuilder.ts`, `src/onlinetests/GasSampleSpreadsheetFactory.ts`, `src/onlinetests/E2eTemplateProvisioner.ts`.
   - *Problema*: Durante l'esecuzione dei test online di integrazione, ALDO crea fogli Google Sheets e strutture di cartelle di test su Google Drive. La creazione è gestita imperativamente senza registrare gli ID dei file creati nell'infrastruttura di pulizia automatica `ResourceCleaner` messa a disposizione da `GasOnlineTestFramework`. Se un test fallisce prima di raggiungere la fase finale di teardown, sul Google Drive dell'utente rimangono file e cartelle orfane.
2. **Utilizzo Incompleto delle Asserzioni `Assert`**:
   - *File interessati*: `src/onlinetests/checks/contextEngineChecks.ts`, `src/onlinetests/checks/pipelineChecks.ts`.
   - *Problema*: Diversi file di verifica eseguono asserzioni tramite costrutti imperativi `if (!condition) throw new Error(...)` o messaggi in console anziché adoperare il catalogo completo di asserzioni offert da `Assert`.

---

### 4. `GoogleApiWrapper` (Livello L1 - Infrastruttura)

#### 🛠️ Capabilities della Libreria
- Abbellimento e astrazione **Batch-First** per le Google Advanced REST API (Drive, Sheets, Docs, Gmail).
- `DriveService`: Operazioni batch come `deleteFiles([ids])` per eliminare file multipli con un'unica HTTP payload, risoluzione email proprietario via `getFileOwnerEmail`.
- `DocumentService`: Astrazione tabelle fluente, aggiunta elementi di lista nativi con `appendListItem({ listType: 'bullet' | 'number' })`, inserimento tabelle con marker `insertTableAtMarker`, scansione struttura documento `scanDocumentStructure`.
- `PermissionService`: Condivisione di file silenziosa (senza invio mail di notifica).
- `MailService`: Tracciamento quote invio con `getRemainingDailyQuota()`.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/infrastructure/facades/DriveServiceFacade.ts`: Incapsula `DriveService` e `PermissionService`.
  - `src/infrastructure/facades/GmailServiceFacade.ts`: Incapsula `MailService`.
  - `src/infrastructure/facades/DocumentTableFacade.ts`: Utilizza `scanDocumentStructure` e `insertTableAtMarker`.
  - `src/application/strategies/SheetMaterieGeneratorStrategy.ts`: Utilizza `SpreadsheetService`.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Cancellazioni e Spostamenti Massivi in Batch su Drive**:
   - *File interessati*: `src/infrastructure/services/AlberoCartelle.ts`, `src/application/pipelines/postProcessActions.ts`.
   - *Problema*: Quando l'applicazione deve ripulire file temporanei o riorganizzare file generati nelle cartelle di destinazione, esegue chiamate singole file per file, ignorando la capability batch `DriveService.deleteFiles(fileIds)` che raggruppa le richieste in un singolo multipart HTTP payload.
2. **Elementi di Lista Nativi in Google Docs (`appendListItem`)**:
   - *File interessati*: `src/infrastructure/facades/DocumentTableFacade.ts`, `src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts`.
   - *Problema*: Per formattare elenchi puntati o numerati all'interno di documenti Google Docs, la logica applicativa inserisce stringhe con prefissi manuali (es. `"• "` o `"1. "`) anziché invocare `DocumentService.appendListItem({ listType: 'bullet' | 'number' })`. Quest'ultima fa uso delle API Advanced Docs per applicare gli stili nativi di Google Docs (`BULLET_DISC_CIRCLE_SQUARE` e `NUMBERED_DECIMAL_ALPHA_ROMAN`).
3. **Verifica Preventiva della Quota Gmail (`getRemainingDailyQuota`)**:
   - *File interessati*: `src/application/services/EmailBatchService.ts`.
   - *Problema*: `EmailBatchService` avvia l'elaborazione dei lotti di invio senza consultare `MailService.getRemainingDailyQuota()`. Se il lotto richiede 100 invii e la quota residua è di 20, l'elaborazione fallisce con un'eccezione non intercettata a metà batch.

---

### 5. `GasSchemaValidatorLib` (Livello L1 - Infrastruttura)

#### 🛠️ Capabilities della Libreria
- Motore di validazione a runtime basato su **Zod** ottimizzato per l'ambiente GAS.
- `SchemaValidator`: Proxy verso Zod con caching dei parser tramite `WeakMap`.
- Validazione stringente dei tipi, coercizione pulita e messaggi di errore strutturati.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - Utilizzata internamente da `SheetDBLib` per validare le righe delle tabelle prima delle mutazioni.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Validazione dei Campi JSON nelle Tabelle di Configurazione (`CONF_DOC`, `CONF_MAIL`, `CONF_IMPORT`)**:
   - *File interessati*: `src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts`, `src/infrastructure/repositories/ConfigurazioneEmailRepository.ts`, `src/infrastructure/repositories/ConfigurazioneImportRepository.ts`.
   - *Problema*: I campi contenenti configurazioni JSON salvati come testo nel DB su foglio (es. `PARAMETRI_GENERAZIONE`, `POST_PROCESSO`, `VARIAZIONI_OGGETTO`, `RICETTA_JSON`) vengono decodificati usando la funzione nativa `JSON.parse()`. Non viene applicata alcuna validazione di schema tramite `GasSchemaValidatorLib`. Qualora un utente inserisca una sintassi JSON incompleta o con chiavi invalide nel foglio di configurazione, l'errore emerge solo a metà esecuzione delle pipeline.
2. **Validazione del Contratto di Struttura del CDU**:
   - *File interessati*: `src/application/context-engine/ContextEngineFactory.ts`.
   - *Problema*: Dopo l'assemblaggio dell'oggetto CDU da parte del `ContextEngine`, non viene eseguita alcuna validazione di schema Zod per verificare la presenza delle chiavi obbligatorie definite in `SPECS_ALDO/02_CDU_STRUTTURA.md` (es. `focus.alunno.anagrafica`) prima di passare il contesto al motore di templating.

---

### 6. `SheetDBLib` (Livello L2 - Persistenza)

#### 🛠️ Capabilities della Libreria
- ORM-lite per trasformare Google Sheets in un database relazionale.
- **Hash Join Engine**: Algoritmo di JOIN in memoria con complessità $O(n+m)$ per collegare tabelle diverse in frazioni di secondo.
- Transazioni ACID: `beginTransaction()`, `commit()`, `rollback()` per garantire la consistenza multi-tabella.
- Unit of Work (`DatabaseService`): Accumulo di modifiche (`insert`, `update`, `delete`) e scrittura batch atomica tramite `.save()`.
- `AdvancedQueryBuilder`: Costruzione fluente di query (`select().where().orderBy()`).

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/infrastructure/db/SheetDbAdapter.ts`: Adatta `DatabaseService` all'interfaccia applicativa `IDatabase`.
  - Tutti i repository applicativi (`AlunnoRepository`, `ClasseRepository`, `MateriaRepository`, ecc.) eseguono query di lettura e scrittura passando per `SheetDbAdapter`.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Utilizzo di Hash Joins $O(n+m)$ vs Cicli Custom $O(n \times m)$**:
   - *File interessati*: `src/infrastructure/repositories/CarenzaRepository.ts`, `src/infrastructure/repositories/AlunnoRepository.ts`, `src/application/services/CattedraResolver.ts`, `src/application/services/AggregatoreDati.ts`.
   - *Problema*: Nelle operazioni che incrociano dati tra più tabelle (es. abbinamento alunni-carenze, incrocio classi-docenti o storico variazioni), ALDO scarica l'intero contenuto delle tabelle in memoria ed esegue cicli `filter()` e `find()` annidati in codice TypeScript. Questo approccio ha una complessità temporale $O(n \times m)$ ed evita di utilizzare l'algoritmo di **Hash Join** $O(n+m)$ nativo fornito da `SheetDBLib` tramite `AdvancedQueryBuilder`.
2. **Transazioni ACID Multi-Tabella (`beginTransaction` / `commit`)**:
   - *File interessati*: `src/application/services/ImportService.ts`, `src/infrastructure/services/AlberoCartelle.ts`.
   - *Problema*: Le scritture che modificano più tabelle contemporaneamente (es. aggiornamento accoppiato di `LOG_CARTELLE` e `LOG_DOCUMENTI` o l'ingestione massiva di dati da CSV) vengono eseguite come mutazioni singole sequenziali senza avvolgerle in `beginTransaction()` e `commit()`. In caso di eccezione a metà processo, il DB su Google Sheets viene lasciato in uno stato parziale e inconsistente.
3. **Scritture Batch tramite Unit of Work (`.save()`)**:
   - *File interessati*: `src/application/services/EmailNotificationService.ts`, `src/infrastructure/repositories/LogEmailRepository.ts`.
   - *Problema*: L'aggiornamento dello stato delle email all'interno di un ciclo avviane chiamando `updateRowById` singolarmente per ogni iterazione, anziché accumulare i cambiamenti nella Unit of Work di `DatabaseService` per persisterli in un unico salvataggio `.save()`.

---

### 7. `GasExpressionEngineLib` (Livello L2 - Logica di Dominio)

#### 🛠️ Capabilities della Libreria
- Valutatore di espressioni dinamiche basato su AST (jsep) in totale assenza di `eval()`.
- Caching automatico degli alberi sintattici (AST caching) per valutazioni ripetute.
- Operatori personalizzati ad alto livello: `in` (appartenenza ad un array), `between` (range numerici/date), `match` (confronti regex).
- Funzioni matematiche e su stringhe incorporate (`len`, `abs`, `round`, `trim`).

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/infrastructure/facades/ExpressionEngineFacade.ts`: Incapsula `ExpressionEngineService`.
  - Impiegata in `DocumentGenerationService`, `EmailNotificationService` e nella valutazione della condizione `SHOULD_EXECUTE` negli step di pipeline (`documentSteps.ts`).

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Mancato Uso degli Operatori Custom (`in`, `between`, `match`)**:
   - *File interessati*: `src/application/pipelines/emailSteps.ts`, `src/application/email/boxes.ts`.
   - *Problema*: I controlli di visibilità dei box e le condizioni sulle variazioni di oggetto (`VARIAZIONI_OGGETTO`) ricorrono a verifiche di stringhe e regex scritte direttamente in codice TypeScript, anziché esporle nelle espressioni di configurazione mediante gli operatori nativi `in`, `between` e `match`.
2. **Pre-compilazione degli AST nei Batch Job**:
   - *File interessati*: `src/application/services/DocumentBatchService.ts`, `src/application/services/EmailBatchService.ts`.
   - *Problema*: Durante i cicli di generazione batch per 100+ studenti, l'espressione di condizione viene analizzata e valutata ad ogni iterazione. Benché la libreria gestisca la cache degli AST, il passaggio delle espressioni potrebbe essere pre-compilato una sola volta all'avvio del batch.

---

### 8. `WorkspaceTemplateEngine` (Livello L2 - Logica di Dominio)

#### 🛠️ Capabilities della Libreria
- Motore di templating avanzato per Google Docs e Google Sheets.
- **Reverse-Order Strategy** per Google Docs: esegue le sostituzioni dall'ultima riga alla prima per prevenire l'invalidazione degli indici dei cursori.
- Sintassi **Pipe-Filter**: `{{campo | filter}}`, supporta filtri nativi come `date`, `uppercase`, `sortBy`, `filter`, `limit`.
- Liste dinamiche per Google Docs (`bullet_list`, `number_list`) con filtri incorporati.
- **`dynamic_columns`** per Google Sheets: espansione orizzontale di colonne a gruppo singolo o multi-gruppo con etichette strutturali e protezione ACL.
- **`dynamic_rows`** per Google Sheets: espansione verticale di righe da array di contesto.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/infrastructure/facades/TemplateEngineFacade.ts`: Incapsula `PlaceholderService` e `Mustache`.
  - Utilizzata per il rendering dei template Google Docs e Sheets nelle varie strategie (`DocumentoGenericoGeneratorStrategy`, `DocPersonalizzatoGeneratorStrategy`, ecc.).

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Filtri Pipe-Filter nei Template (`sortBy`, `filter`, `limit`)**:
   - *File interessati*: `src/application/context-engine/providers/PianiPersAlunnoProvider.ts`, `src/application/context-engine/providers/StudentiProvider.ts`.
   - *Problema*: I provider di dati eseguono l'ordinamento e il filtraggio degli array in codice TypeScript prima di inserire i dati nel contesto. ALDO non sfrutta i filtri di pipe nativi messi a disposizione dal motore nei template (`{{alunni | sortBy:'cognome'}}` o `{{#bullet_list:alunni | filter:'attivo',true}}`), trasferendo inutilmente logica di formattazione nei provider dati.
2. **Placeholder `dynamic_rows` per Google Sheets**:
   - *File interessati*: `src/application/strategies/SheetMaterieGeneratorStrategy.ts`, `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`.
   - *Problema*: La popolazione delle griglie di dati (es. elenco materie/alunni) sui fogli di calcolo viene effettuata tramite scrittura imperativa riga per riga tramite `SpreadsheetService`. ALDO non impiega il placeholder dichiarativo `{{dynamic_rows[...]}}` di `WorkspaceTemplateEngine`, che gestisce l'espansione automatica verticale delle righe a partire dagli array nel CDU.
3. **Placeholder Multi-gruppo `dynamic_columns` con colonne etichetta**:
   - *File interessati*: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`.
   - *Problema*: La generazione di colonne dinamiche con etichette di raggruppamento viene gestita con codice custom anziché avvalersi della sintassi avanzata multi-gruppo (`source2=`, `label2=`) integrata nella libreria.

---

### 9. `JobRunnerLib` (Livello L3 - Orchestrazione)

#### 🛠️ Capabilities della Libreria
- Superamento dei limiti di esecuzione di GAS (6/30 minuti) tramite il **Recursive Trigger Pattern**.
- Gestione dello stato tramite funzioni generatore (`function*` / `yield`).
- Serializzazione atomica del cursore di avanzamento su `ScriptProperties`.
- Atomic locking via `LockService` per impedire esecuzioni sovrapposte.
- Entry-point centralizzato di ripresa (`riprendiJobSospeso`).

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/application/services/DocumentBatchService.ts` e `EmailBatchService.ts`: Implementano le funzioni generatore con i punti di `yield` per la generazione batch.
  - `src/config/Bootstrap.ts` (`riprendiJobSospeso`) e `src/entrypoints/EntryPoints.ts`: Gestiscono la ripresa automatica dai trigger a tempo.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Importazione Dati ETL (`avviaImportazioneDataDriven`) NON Integrata in `JobRunnerLib`**:
   - *File interessati*: `src/config/Bootstrap.ts` (riga 244), `src/application/services/ImportService.ts`.
   - *Problema*: Come esplicitato nel codice di `Bootstrap.ts`, l'importazione dei dati (`eseguiImportazione`) è un'esecuzione sincrona singola e **non è avvolta da `JobRunnerLib`**. In presenza di file CSV con centinaia di righe o cartelle con decine di file da importare, l'operazione rischia di interrompersi per il timeout di 6 minuti di GAS, senza alcuna possibilità di ripresa dallo stato salvato.
2. **Procedura di Re-invio Email (`EmailRetryService`) NON Integrata in `JobRunnerLib`**:
   - *File interessati*: `src/application/services/EmailRetryService.ts`.
   - *Problema*: La funzione di retry delle email fallite esegue l'invio in un ciclo `for` sincrono. Se l'elenco delle mail da rinviare è numeroso, il processo andrà in timeout poiché non utilizza i punti di sospensione `yield` forniti da `JobRunnerLib`.

---

### 10. `PipelineFramework` (Livello L3 - Orchestrazione)

#### 🛠️ Capabilities della Libreria
- Workflow trasversali basati sul pattern **Chain of Responsibility**.
- Classe astratta `Step`, gestione del contesto condiviso (`PipelineContext`).
- **Disaccoppiamento Producer-Consumer**: Separazione tra gli step che calcolano le decisioni (Producer) e quelli che eseguono le mutazioni I/O (Consumer).
- Hooks di ciclo di vita della pipeline (`onStepStart`, `onStepEnd`, `onStepError`) per il logging e il tracciamento globale.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/application/services/DocumentGenerationService.ts` e `EmailNotificationService.ts`: Utilizzano `PipelineFramework` per definire i singoli step di elaborazione (`documentSteps.ts`, `emailSteps.ts`).

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Mancato Disaccoppiamento Producer-Consumer per il Dry-Run**:
   - *File interessati*: `src/application/pipelines/documentSteps.ts`, `src/application/pipelines/emailSteps.ts`.
   - *Problema*: Le pipeline di ALDO eseguono gli step in una catena sequenziale sincrona in cui ogni step effettua sia il calcolo sia la chiamata I/O diretta verso i servizi Google (`CloneTemplate`, `RenderTemplate`, `ApplyPermissions`). L'applicazione non adotta la variante Producer-Consumer prevista dal framework, che permetterebbe di testare le pipeline in modalità `dryRun: true` offline senza invocare i facade I/O.
2. **Hooks di Ciclo di Vita Globali della Pipeline per la Telemetria**:
   - *File interessati*: `src/application/services/DocumentGenerationService.ts`, `src/application/services/EmailNotificationService.ts`.
   - *Problema*: L'aggiornamento dei monitor di avanzamento avviene manualmente all'interno del codice dei singoli step, anziché registrare gli hook trasversali `onStepStart` e `onStepEnd` forniti dalla libreria per centralizzare la telemetria.

---

### 11. `ContextEngine` (Livello L3 - Orchestrazione)

#### 🛠️ Capabilities della Libreria
- Assemblaggio dinamico di contesti dati tramite ricette JSON (Declarative Recipes).
- Risoluzione automatica del grafo diretto acyclico (DAG) per gestire le dipendenze tra i provider dati.
- Registry dei provider dati (`DataProvider`) con riutilizzo delle istanze (Flyweight Pattern).
- **`ContextInterceptor` (Middleware)**: Intercettatori per modificare, arricchire o scambiare i dati nel contesto (es. sostituzione di un utente con il suo delegato) in modo trasparente.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/application/context-engine/ContextEngineFactory.ts`, `ContextBuilder.ts` e i relativi data provider sotto `src/application/context-engine/providers/` definiscono la costruzione del CDU di ALDO.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Ricette JSON Dichiarative per la Definizione del Contesto**:
   - *File interessati*: `src/application/context-engine/ContextEngineFactory.ts`, `src/application/context-engine/Recipe.ts`.
   - *Problema*: Nonostante `ContextEngine` consenta di definire i grafi di recupero dati tramite ricette JSON esterne, ALDO codifica la struttura dei provider direttamente in codice TypeScript (`ContextEngineFactory.ts`). I documenti o i modelli di email non possono modificare le regole di caricamento del contesto tramite file di configurazione senza un intervento sul codice sorgente.
2. **Middleware `ContextInterceptor` per la Sostituzione dei Ruoli/Docenti**:
   - *File interessati*: `src/application/services/RisolutoreRuoliService.ts`, `src/application/services/CattedraResolver.ts`.
   - *Problema*: La risoluzione delle supplenze e delle variazioni di cattedra viene effettuata imperativamente all'esterno dell'assemblatore di contesto, anziché registrare un `ContextInterceptor` che scambi trasparentemente il titolare con il docente attivo durante la fase di assemblaggio del CDU.

---

### 12. `DomainRepositoryLib` (Livello L3 - Orchestrazione)

#### 🛠️ Capabilities della Libreria
- Pattern DDD per la persistenza su Google Sheets.
- Classi base per `Repository`, `Entity`, `AggregateRoot`.
- **Identity Map**: Garantisce l'unicità dell'istanza in memoria per la stessa riga del DB durante la sessione.
- **Dirty Checking**: Tracciamento dei campi modificati per eseguire aggiornamenti mirati solo sulle colonne variate.
- **DataMapper**: Mappatura automatica tra le colonne DB (`snake_case`) e le proprietà dell'entità (`camelCase`).

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - Le entità di dominio (`Alunno`, `Classe`, `Docente`, ecc.) e le specifiche (sotto `src/domain/specifications/`) seguono la modellazione DDD.
  - I repository in `src/infrastructure/repositories/` implementano le interfacce di persistenza.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Assenza di `IdentityMap` e `DirtyChecking` nei Repository**:
   - *File interessati*: `src/infrastructure/repositories/AlunnoRepository.ts`, `src/infrastructure/repositories/ClasseRepository.ts`, `src/infrastructure/repositories/DocenteRepository.ts`.
   - *Problema*: I repository applicativi di ALDO non ereditano dalla classe base `DomainRepositoryLib.Repository`, ma eseguono la conversione da riga a oggetto mediante metodi statici `fromRow()` ed invocano direttamente `SheetDbAdapter`. Non vengono utilizzati né l'**Identity Map** né il **Dirty Checking**. Quando un'entità viene salvata, ALDO sovrascrive tutte le colonne del foglio di calcolo, aumentando inutilmente l'I/O verso Google Sheets.
2. **Mancato Uso del `DataMapper` Automatico**:
   - *File interessati*: Tutti i repository sotto `src/infrastructure/repositories/`.
   - *Problema*: La trasformazione tra i nomi delle colonne nel DB e le proprietà delle classi viene riscritta manualmente con funzioni `fromRow()` e `toRow()` in ciascuno dei 15+ repository, anziché configurare i mapping tramite la classe `DataMapper` della libreria.

---

### 13. `GasDataImporter` (Livello L3 - Orchestrazione)

#### 🛠️ Capabilities della Libreria
- Motore ETL di ingestion dati configurabile tramite ricette JSON.
- `SourceStrategyFactory`: Strategie di estrazione da fogli singoli, cartelle Drive o sorgenti personalizzate.
- Integrazione con `GasExpressionEngineLib` per la trasformazione e il calcolo dei campi in fase di importazione.
- Strategie di caricamento e risoluzione conflitti (`UPSERT`, `INSERT_ONLY`, `OVERWRITE`).

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/application/services/ImportService.ts`: Avvolge `ImportEngine`.
  - `src/config/Bootstrap.ts`: Registra le strategie di sorgente custom `CERCA_CARTELLE_CLASSE` e `CERCA_DOCUMENTI`.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Trasformazioni tramite Espressioni nelle Ricette dell'Importer**:
   - *File interessati*: `src/application/import/ImportRecipeMapper.ts`, `src/application/import/CustomSourceStrategies.ts`.
   - *Problema*: I mapping di importazione in `ImportRecipeMapper.ts` eseguono la corrispondenza diretta colonna-colonna. Eventuali trasformazioni o valori calcolati durante l'importazione (es. concatenazione di stringhe, pulizia date) sono codificati in helper TypeScript anziché utilizzare le espressioni di `GasExpressionEngineLib` configurabili direttamente nelle ricette JSON.
2. **Strategie di Gestione Conflitti NATIVE (`UPSERT`)**:
   - *File interessati*: `src/application/services/ImportService.ts`.
   - *Problema*: Alcuni processi di importazione (es. caricamento dell'anagrafica alunni o delle carenze) effettuano il controllo dei duplicati tramite query preliminari nei repository o svuotando le tabelle, anziché sfruttare le strategie native di `UPSERT` basate su chiavi primarie messe a disposizione da `GasDataImporter`.

---

### 14. `RoleResolutionLib` (Livello L4 - Logica di Dominio)

#### 🛠️ Capabilities della Libreria
- Risoluzione avanzata di ruoli e gerarchie organizzative.
- **Transitive Delegation**: Risoluzione automatica di catene di deleghe multi-livello ($A \rightarrow B \rightarrow C$).
- **Routing Policies**: Strategie per determinare i destinatari di una comunicazione in presenza di delegati (`PrimaryOnly`, `Both`, `DelegatorCc`).
- Ambito delle assegnazioni (Scoped Assignments): ruoli validi a livello di Dipartimento o di singolo Documento.
- `RoleRegistry` per definire regole di fallback.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - I concetti di risoluzione dei ruoli sono implementati all'interno di `RisolutoreRuoliService.ts` e `CattedraResolver.ts`.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Delega Transitiva Multi-livello ($A \rightarrow B \rightarrow C$)**:
   - *File interessati*: `src/application/services/RisolutoreRuoliService.ts`, `src/application/services/CattedraResolver.ts`.
   - *Problema*: Nel calcolo del docente attivo per una classe o materia, ALDO interroga le tabelle `SUPPLENZE` e `VARIAZIONI_CATTEDRA` ricercando una corrispondenza diretta a 1 livello. Qualora il docente $A$ sia sostituito da $B$, e il docente $B$ sia a sua volta sostituito dal docente $C$, l'algoritmo di ALDO non risale la catena fino a $C$. `RoleResolutionLib` gestisce nativamente la delega transitiva rilevando anche eventuali loop infiniti.
2. **Politiche di Routing delle Email (`RoutingPolicy`)**:
   - *File interessati*: `src/application/services/EmailNotificationService.ts`.
   - *Problema*: L'assegnazione dei campi `TO` e `CC` nelle email dirette ai docenti in presenza di supplenti viene gestita mediante blocchi `if/else` custom, anziché delegare il calcolo alla strategia `RoutingPolicy` fornita dalla libreria.

---

### 15. `ComposableContentLib` (Livello L4 - Logica di Dominio)

#### 🛠️ Capabilities della Libreria
- Framework per la composizione dinamica di contenuti tramite blocchi riutilizzabili (Header, Tabella, Footer).
- Ricette JSON per la composizione del layout.
- Regole di visibilità sui singoli blocchi basate su espressioni condizionali.
- **Multi-Format Rendering**: Rendering simultaneo in formato HTML (per invio email) o Plain Text (per registri e log di audit).
- `BlockRegistry` per l'estensione di tipi di blocco custom.

#### 📍 Stato Attuale in ALDO
- **Stato**: **Sotto-utilizzata / Assente nel rendering applicativo**.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Composizione Dinamica del Corpo Email e dei Box (`boxes.ts`, `saluto.ts`)**:
   - *File interessati*: `src/application/email/boxes.ts`, `src/application/email/saluto.ts`.
   - *Problema*: L'assemblaggio del corpo delle email HTML viene effettuato tramite **concatenazione imperativa di stringhe HTML** all'interno di funzioni TypeScript (`salutoDocente()`, `boxCarenze()`, `boxVerbale()`). Questo approccio viola il principio del software data-driven e duplica la logica di presentazione. `ComposableContentLib` è stata realizzata appositamente per comporre email HTML a partire da ricette JSON a blocchi con regole di visibilità.
2. **Rendering Multi-Formato (HTML Email vs Log di Audit)**:
   - *File interessati*: `src/infrastructure/repositories/LogEmailRepository.ts`, `src/application/services/EmailNotificationService.ts`.
   - *Problema*: Durante l'invio delle email, ALDO genera manualmente una sintesi in formato testo semplice per la tabella `LOG_EMAIL`, anziché impiegare i vari `Renderer` di `ComposableContentLib` che generano automaticamente dall'unico albero di blocchi sia l'output HTML sia la versione testo formattata per i log.

---

### 16. `GasProcessMonitorLib` (Livello L4 - Monitoraggio)

#### 🛠️ Capabilities della Libreria
- Telemetria e visualizzazione in tempo reale per processi di lunga durata in GAS.
- Tracciamento dello stato di avanzamento a livello di **Job** e di **Step** (Stati: *Success*, *Error*, *Running*).
- Dashboard Sidebar HTML (`DashboardUi`) con aggiornamento automatico via polling.
- Persistenza a livelli (CacheService per l'avanzamento frequente, ScriptProperties per il risultato finale) per non consumare le quote di scrittura su Google.

#### 📍 Stato Attuale in ALDO
- **Utilizzo Effettivo**:
  - `src/infrastructure/facades/ProcessMonitorFacade.ts`: Adatta `ProcessMonitorService`.
  - Iniettata in `DocumentBatchService.ts`, `EmailBatchService.ts`, `DocumentGenerationService.ts` e `EmailNotificationService.ts`.

#### ⚠️ Capabilities NON Sfruttate in ALDO
1. **Tracciamento Granulare a Livello di Singolo Step di Pipeline**:
   - *File interessati*: `src/application/pipelines/documentSteps.ts`, `src/application/pipelines/emailSteps.ts`.
   - *Problema*: Nonostante `ProcessMonitorFacade` sia collegata ai batch per conteggiare gli elementi del ciclo esterno (es. documento 5/50), i singoli step di esecuzione delle pipeline (`SelectTemplate`, `RenderTemplate`, `ApplyPermissions`) non aggiornano il monitor sui sotto-step. In caso di blocco durante la fase di rendering di un singolo documento, l'interfaccia utente mostra soltanto l'indice globale senza evidenziare lo step interno fallito.
2. **Barra di Avanzamento per l'Importazione Dati (ETL)**:
   - *File interessati*: `src/application/services/ImportService.ts`.
   - *Problema*: `ImportService.ts` non riceve l'istanza del monitor `IProcessMonitor`. Quando un utente avvia l'importazione di una cartella o di un file CSV dal menu di Google Sheets, non viene aperta la sidebar HTML di progresso dell'importazione.

---

## 🎯 Raccomandazioni e Priorità di Refactoring

Per allineare completamente ALDO ai requisiti architetturali e massimizzare il valore dello stack `GasLibraryFactory`, si raccomandano i seguenti interventi suddivisi per priorità:

### Priorità Alta (P1 - Timeout & Stabilità Operativa)
1. **Integrazione di `JobRunnerLib` in `ImportService` e `EmailRetryService`**:
   - Trasformare l'importazione ETL e il re-invio delle mail fallite in generatori `function*` per prevenire il superamento del limite dei 6/30 minuti di GAS.
2. **Abilitazione di `CircuitBreaker` su Gmail/Drive Service**:
   - Introdurre il `CircuitBreaker` a livello di `EmailNotificationService` per interrompere i cicli di invio al primo superamento delle quote API (`429 Quota Exceeded`).
3. **Validazione Zod (`GasSchemaValidatorLib`) sui JSON di Configurazione**:
   - Applicare la validazione Zod prima di decodificare i campi `PARAMETRI_GENERAZIONE`, `POST_PROCESSO` e `RICETTA_JSON` salvati su foglio.

### Priorità Media (P2 - Eliminazione di Codice Custom & Performance)
4. **Refactoring di `boxes.ts` tramite `ComposableContentLib`**:
   - Sostituire la concatenazione di stringhe HTML nelle email con le ricette a blocchi dichiarative di `ComposableContentLib`.
5. **Adozione degli Hash Joins $O(n+m)$ di `SheetDBLib`**:
   - Sostituire i cicli annidati $O(n \times m)$ nei repository con le join native di `AdvancedQueryBuilder`.
6. **Mappatura con `IdentityMap` e `DirtyChecking` (`DomainRepositoryLib`)**:
   - Far ereditare i repository da `DomainRepositoryLib.Repository` per evitare la sovrascrittura di tutte le colonne ad ogni salvataggio.
7. **Refactoring `dynamic_rows/cols` nei Template Sheets**:
   - Sostituire la scrittura imperativa riga per riga in `SheetMaterieGeneratorStrategy` con i placeholder `{{dynamic_rows[...]}}`.

### Priorità Bassa (P3 - Rifinitura & Telemetria)
8. **Registrazione Automatica Risorse nei Test (`ResourceCleaner`)**:
   - Registrare le cartelle e i fogli temporanei creati nei test online nell'infrastruttura di `GasOnlineTestFramework`.
9. **Telemetria Dettagliata per l'Importazione Dati**:
    - Collegare `ProcessMonitorFacade` a `ImportService` per mostrare la sidebar HTML di progresso durante l'ingestione dei dati.

---
*Report generato in data 2026-07-28 per la verifica della conformità architetturale SGSA/ALDO.*
