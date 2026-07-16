# 08 — Architettura, Dependency Injection e Pattern

Questo documento descrive l'architettura a layer di SGSA, il sistema di Dependency Injection, il Bootstrap, e i pattern architetturali utilizzati nel sistema con le relative motivazioni.

---

## 1. Architettura a Layer

```
┌────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                        │
│  Menu GAS, Dialoghi modali, Sidebar GasProcessMonitorLib   │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│  APPLICATION SERVICES LAYER                                │
│  DocumentGenerationService, EmailNotificationService,      │
│  ImportService, ReportService                              │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│  DOMAIN LAYER                                              │
│  Entità, Value Object, Aggregati                           │
│  Repository (interfacce), Specifications                   │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                      │
│  SheetDBLib, DatabaseService                               │
│  DriveServiceFacade, GmailServiceFacade                    │
│  DocumentServiceFacade                                     │
└────────────────────────────────────────────────────────────┘
```

**Regola fondamentale:** Ogni layer DEVE dipendere ESCLUSIVAMENTE dal layer immediatamente inferiore; un layer NON DEVE MAI dipendere da un layer superiore né saltare un livello. Il Domain Layer DEVE essere completamente agnostico rispetto all'infrastruttura: NON DEVE MAI conoscere Google Sheets, Drive o Gmail direttamente.

---

## 2. Dependency Injection Container

Tutti i servizi e i repository sono registrati in un `ServiceContainer` singleton con inizializzazione lazy.

```
ServiceContainer:
  register(name: string, factory: (container) => any): void
    — Registra un servizio con la sua factory function

  get<T>(name: string): T
    — Risolve il servizio per nome; istanzia al primo accesso (lazy)

  has(name: string): boolean
    — Verifica la presenza di un servizio registrato
```

Il container DEVE essere istanziato **una sola volta per `SPREADSHEET_ID`** e cachato in memoria per la durata della sessione GAS corrente. Ogni esecuzione GAS successiva DEVE ripartire da un container fresco.

---

### 2.1 Pattern di Auto-registrazione

Ogni classe SGSA che deve essere iniettata espone un oggetto di metadati statico con tre campi:

- **`nome`**: la chiave con cui il servizio è registrato nel container
- **`dipendenze`**: array di nomi di altri servizi da iniettare come argomenti al costruttore, nell'ordine esatto in cui il costruttore li riceve
- **`factory`**: funzione che riceve le dipendenze risolte e restituisce l'istanza del servizio

**`Bootstrap.js`** è il punto di inizializzazione del container. La registrazione avviene in due fasi distinte:

**Fase A — Registrazione automatica:** tutti i servizi SGSA che espongono i metadati statici vengono registrati tramite un ciclo di auto-registrazione. Non è necessaria alcuna registrazione manuale per questi servizi: il container risolve automaticamente il grafo delle dipendenze.

**Fase B** — Il DatabaseService viene inizializzato interrogando il MasterSheetRepository. Quest'ultimo identifica l'ID dello spreadsheet attivo filtrando la tabella Master per l'anno scolastico corrente.

---

### 2.2 Regola Anti-dipendenze-circolari

SGSA DEVE usare **esclusivamente constructor injection**. Nessun servizio PUÒ richiedere una dipendenza dopo la costruzione tramite setter, metodi `postInit` o lazy resolution circolare.

Se durante la progettazione emerge una dipendenza circolare tra due servizi A e B, le strategie accettabili sono, in ordine di preferenza:

1. **Estrazione di un terzo servizio C**: la logica condivisa viene isolata in C da cui dipendono sia A che B, eliminando il ciclo.
2. **Callback o oggetto di configurazione**: invece di iniettare un'istanza, si passa una funzione o un oggetto di configurazione che incapsula il comportamento necessario.
3. **Elevazione architetturale**: uno dei due servizi viene spostato a un livello superiore, rompendo la simmetria della dipendenza.

Ogni dipendenza circolare DEVE essere risolta in fase di progettazione. NON sono MAI accettate soluzioni che introducano accoppiamento implicito a runtime.

---

## 3. Pattern Architetturali

### 3.1 Repository Pattern

Un repository per ogni entità, con base class `Repository` fornita da `DomainRepositoryLib` (L3). Nasconde la persistenza su Sheets esponendo un'interfaccia orientata al dominio. Ogni repository dipende solo dalla sua tabella e dai repository delle entità correlate.

Dettagli completi in `06_REPOSITORY.md`.

---

### 3.2 Specification Pattern

Predicati riusabili e componibili per il filtraggio delle entità. Ogni Specification implementa `isSatisfiedBy()` e `toQueryObject()`. Le Specification con `toQueryObject()` non null vengono tradotte in query `SheetDBLib` efficienti; le restanti filtrano in memoria.

Dettagli completi in `07_SPECIFICATIONS.md`.

---

### 3.3 Strategy Pattern

**Generazione documenti:** il `DocumentGenerationService` mantiene un `strategyRegistry: Map<string, DocumentGeneratorStrategy>`. Il valore del campo `CONF_DOC.GENERATORE` seleziona la Strategy concreta a runtime. Aggiungere un nuovo tipo di documento richiede solo la creazione di una nuova Strategy e la registrazione nel registry — zero modifiche al codice core.

```
DocumentGeneratorStrategy (interfaccia):
  render(fileId: string, cdu: CDU, config: ConfigurazioneDocumento): void
    — Popola il documento clonato con i dati del CDU.
    — Nessun valore di ritorno: le modifiche sono applicate via API.
```

**Risoluzione ruoli:** il `RisolutoreRuoliService` mantiene un `RegistroRisolutoriRuoli: Map<string, RisolutoreStrategy>`. Ogni ruolo astratto (es. `COORDINATORI`, `CDC`, `REF_BES`) ha una Strategy che lo traduce in email reali. Nuovi ruoli si aggiungono inserendo un record in `RUOLI` — la `ReferenteStrategy` è una strategy jolly che gestisce automaticamente qualsiasi ID presente in quella tabella.

---

### 3.4 Facade Pattern

Tutte le Google API DEVONO essere incapsulate in Facade dedicate che centralizzano logging, error handling e mocking; nessun altro componente DEVE invocare direttamente `DriveApp`, `GmailApp` o `DocumentApp`:

| Facade                  | Operazioni principali                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `DriveServiceFacade`    | `createFolder()`, `copyFile()`, `setPermissions()`, `deleteFile()`, `countFilesInFolder()` |
| `GmailServiceFacade`    | `sendEmail()`, `createDraft()`                                                             |
| `DocumentServiceFacade` | `replaceText()`, `appendTable()`, `protectRange()`                                         |

Le Facade usano `GoogleApiWrapper` (L1) e `GasResilienceLib` (L0) internamente per il retry con exponential backoff sui rate limit delle API.

---

### 3.5 Pipeline Pattern

Operazioni multi-step con contesto condiviso e gestione granulare degli errori. Ogni step DEVE essere isolato in un blocco try/catch. Un errore in uno step non-critico DEVE produrre un warning nel log senza interrompere la pipeline; un errore in uno step critico (es. `CloneTemplateStep`) DEVE attivare la logica di rollback.

```
Pipeline (abstract):
  _steps: Step[]
  addStep(step: Step): Pipeline
  execute(initialContext: PipelineContext): PipelineContext

Step (abstract):
  name: string
  shouldExecute(context: PipelineContext): boolean  ← default: true; usato per skip condizionale
  _executeLogic(context: PipelineContext): void
```

`PipelineContext` è un dizionario chiave-valore con metodi `get()`, `set()`, `addError()`, `addSuccess()`. Accumula anche un log di esecuzione (`logEsecuzione[]`) accessibile nel CDU alla chiave `tech.pipeline.logEsecuzione` per analisi post-mortem.

Dettagli delle pipeline in `10_PIPELINE_DOCUMENTI.md` e `11_PIPELINE_EMAIL.md`.

---

### 3.6 Interceptor Pattern

Usato nel Context Engine per la gestione supplenze. Dopo ogni provider che produce dati docente, lo `SwapAndEnrichInterceptor` verifica se quel docente ha una supplenza attiva nel contesto corrente. Se sì, sostituisce trasparentemente i dati del titolare con quelli del supplente (o li affianca), in base alla regola `GestioneSupplenti` configurata.

Dettagli in `09_CONTEXT_ENGINE.md`.

---

### 3.7 Generator Function / Job Runner Pattern

Per superare il limite di esecuzione di GAS per singola invocazione (6 minuti sugli account gratuiti, 30 minuti su Google Workspace — vedi `15_UI_E_JOB_RUNNER.md`), le operazioni batch sono implementate come generator function ES6. Ogni `yield` è un checkpoint. `JobRunnerLib` (L3) gestisce autonomamente: la serializzazione dello stato in `ScriptProperties`, la creazione del trigger temporizzato, la ripresa dell'esecuzione al trigger successivo.

Dettagli in `15_UI_E_JOB_RUNNER.md`.

---

## 4. Struttura del Codice Sorgente

```
/src
  /domain
    /entities          Alunno.js, Docente.js, Classe.js, ...
    /value-objects     Email.js, ClasseId.js, AnnoCorso.js, ...
    /repositories      AlunnoRepository.js, ClasseRepository.js, ...
    /specifications    AlunniAttiviSpec.js, ...

  /application
    /services          DocumentGenerationService.js, EmailNotificationService.js, ...
    /providers         ClasseProvider.js, StudentiProvider.js, ...
    /interceptors      SwapAndEnrichInterceptor.js

  /infrastructure
    /facades           DriveServiceFacade.js, GmailServiceFacade.js, ...
    /pipelines         DocumentoPipeline.js, NotificaPipeline.js
    /steps             (step documenti), (step email)

  /config
    ServiceContainer.js
    Bootstrap.js

  /ui
    Menu.js
    Dialogs.js

/test
  (unit e integration test)

/appsscript.json
```

---

## 5. Strategie di Performance

| Ambito           | Strategia                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| Letture DB       | Batch: carica intere tabelle, poi filtra in memoria                           |
| Scritture DB     | Accumula dirty, poi `database.save()` unico batch                             |
| Lookup table     | Cache completa in memoria (MATERIE, INDIRIZZI, DIPART, RUOLI) per la sessione |
| Supplenze attive | Cache 1 ora, invalidata a ogni modifica                                       |
| Template Drive   | Cache in memoria per la sessione corrente                                     |
| Permessi Drive   | Applicati in batch via `GoogleApiWrapper`                                     |
| Batch lunghi     | Job Runner con generator + PropertiesService (vedi `15_UI_E_JOB_RUNNER.md`)   |

---

## 6. Sicurezza e Privacy

**ACL granulari:** ogni documento generato riceve permessi configurati in `CONF_DOC.PERMESSI`. I ruoli astratti (`COORDINATORI`, `CDC`, ecc.) vengono risolti in email reali dal `RisolutoreRuoliService` con applicazione automatica delle supplenze attive.

**Dati sensibili:** `ALUNNI.NOTE` e `PIANI.PARAMETRI` contengono informazioni mediche o personali. L'accesso è limitato tramite permessi Drive granulari.

**GDPR:** audit trail completo tramite `LOG_DOCS`, `LOG_MAIL`, `LOG_FOLD`. Tutte le operazioni producono timestamp tracciabili. La disattivazione logica dei record è già prevista dallo schema fisico tramite i flag `ALUNNI.ATTIVO` e `CLASSI.ATTIVA` (vedi `01_SCHEMA_DATABASE.md`); le tabelle di audit (`LOG_DOCS`, `LOG_MAIL`, `LOG_FOLD`) DEVONO invece essere append-only e NON DEVONO MAI prevedere cancellazione né disattivazione dei record.

**Nessun rollback automatico tra Drive e Sheet:** se una scrittura su Drive (es. file o cartella creati) avviene correttamente ma il successivo `database.save()` su Sheet fallisce (es. record `LOG_DOCS`/`LOG_FOLD` non scritto), il sistema NON esegue — e NON DEVE eseguire — alcun rollback automatico della parte già scritta. L'eventuale incoerenza tra Drive e database DEVE essere riconciliata manualmente dall'amministratore. Fa eccezione il solo file Drive orfano generato da `CloneTemplateStep`, per cui esiste una pulizia automatica dedicata (vedi `10_PIPELINE_DOCUMENTI.md`).

---

## 7. Logging

Il `LoggerService` espone livelli: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`. Il livello attivo è configurabile tramite `PropertiesService` (`LOG_LEVEL = "INFO"`). In development si usa `"DEBUG"`.

In production, i log vengono scritti sia su `Logger.log()` GAS (visibile nel log delle esecuzioni) sia su un foglio `LOG` dedicato nel database per storicizzazione.

---

## 8. Principi SOLID applicati

| Principio                     | Applicazione                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **S** — Single Responsibility | Ogni repository gestisce una sola tabella; ogni step della pipeline ha una sola responsabilità                              |
| **O** — Open/Closed           | Nuovi tipi di documento = nuova Strategy, zero modifiche al core; nuovi ruoli = record in `RUOLI`, zero modifiche al codice |
| **L** — Liskov Substitution   | Le Strategy implementano la stessa interfaccia `DocumentGeneratorStrategy`; sono intercambiabili                            |
| **I** — Interface Segregation | I repository espongono solo i metodi pertinenti alla loro entità                                                            |
| **D** — Dependency Inversion  | Il Domain Layer dipende da astrazioni (interfacce repository); l'Infrastructure Layer fornisce le implementazioni concrete  |
