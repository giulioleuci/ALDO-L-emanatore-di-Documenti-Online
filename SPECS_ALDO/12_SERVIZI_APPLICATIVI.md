# 12 — Servizi Applicativi

I servizi applicativi sono il punto di ingresso per le operazioni di business di SGSA. Ricevono input dall'esterno (ID di configurazione, parametri), orchestrano il Context Engine, le pipeline e i repository, e restituiscono risultati strutturati.

Ogni servizio applicativo:

- NON DEVE contenere logica di dominio (delegata alle entità e ai repository)
- NON DEVE accedere direttamente a Google Sheets o Drive (delegato alle Facade e ai repository)
- NON DEVE costruire il CDU da solo (delegato al `ContextBuilder`)
- DEVE essere registrato nel `ServiceContainer` e ricevere le dipendenze via constructor injection

---

## 1. DocumentGenerationService

**Responsabilità:** orchestrare la generazione di documenti Google Drive (Docs o Sheets) basandosi sulla configurazione in `CONF_DOC`.

### Metodi principali

#### `generateDocument(configId: string, entryPoint: any, options?: GenerationOptions): DriveFileId`

Genera un singolo documento per il punto di ingresso specificato.

Flusso:

1. Carica `ConfigurazioneDocumento` da `ConfigurazioneDocumentoRepository`
2. Determina la recipe in base al tipo di configurazione
3. Costruisce il CDU tramite `ContextBuilder`
4. Valuta la condizione di generazione (`CONF_DOC.CONDIZIONE`) — se `false`, skip silenzioso
5. Esegue la `DocumentoPipeline` (10 step, dettagliati in `10_PIPELINE_DOCUMENTI.md`)
6. Restituisce il `DriveFileId` del file generato

#### `generateBatch(configId: string, entryPoints: any[], options?: BatchOptions): GenerationResult[]`

Genera documenti per ogni entry point nell'array. Per ogni elemento: try/catch individuale, log dell'errore senza interrompere il batch. Se il batch supera il limite di tempo GAS, delega al Job Runner.

#### `generateForAllClasses(configId: string): GenerationResult[]`

Carica tutte le classi attive (`ClassiAttiveSpec`), poi chiama `generateBatch`.

**Gestione articolazione:** prima di passare l'array a `generateBatch`, il metodo DEVE verificare `CONF_DOC.GESTIONE_ARTICOLAZIONE` (se null, DEVE applicare il default `COMPLETA` previsto dall'enum `GestioneArticolazione`, vedi `03_VALUE_OBJECTS_ED_ENUM.md`):

- `COMPLETA` (o non specificato) → le classi partner vengono saltate; la classe parent è processata come unico entry point aggregato
- `ARTICOLATA` → le classi parent vengono saltate; le classi partner sono processate individualmente

La distinzione parent/partner si determina leggendo `CLASSI.ARTICOLAZIONE`: le classi con `parent != null` sono classi partner; le classi con `partners != null` sono classi parent.

### Registro Strategy

Il servizio mantiene il `strategyRegistry` (descrizione completa in `10_PIPELINE_DOCUMENTI.md`). Se `CONF_DOC.GENERATORE` non è registrato, lancia un'eccezione prima di costruire il CDU.

---

## 2. EmailNotificationService

**Responsabilità:** orchestrare la preparazione e l'invio di email HTML personalizzate basandosi sui pattern in `CONF_MAIL`.

### Metodi principali

#### `sendEmail(patternId: string, entryPoint: any, destinatario: Email): void`

Invia una singola email. Carica il pattern e delega l'intero flusso alla `NotificaPipeline` (8 step, dettagliati in `11_PIPELINE_EMAIL.md`), che costruisce il CDU specifico per il destinatario internamente tramite `BuildCDUStep` (Step 1). Il servizio non costruisce un proprio CDU preliminare.

#### `sendByProcess(patternId: string, entryPoint: any): EmailResult[]`

Risolve i destinatari in base a `CONF_MAIL.PROCESSO`:

| Valore PROCESSO       | Logica di risoluzione                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| `PER_COORDINATORE`    | Coordinatori di ogni classe attiva                                          |
| `PER_DOCENTE`         | Docenti con almeno una classe attiva assegnata                              |
| `PER_CDC`             | Una email per classe, TO multiplo a tutti i docenti                         |
| `PER_ALUNNO`          | Tutti gli alunni attivi                                                     |
| `PER_GENITORI_ALUNNO` | `TUTOR_1` e `TUTOR_2` di ogni alunno, deduplicati per famiglie multi-figlio |
| `PER_CARENZA`         | Record `CARENZE` con `NOTIFICATO` null (via `CarenzeNonNotificateSpec`)     |

Applica le regole supplenti configurate in `CONF_MAIL.SUPPLENTI`. Chiama `sendBatch` internamente.

#### `sendBatch(patternId, entryPoint, destinatari): EmailResult[]`

Invia a lista di destinatari. Se supera la soglia di tempo GAS, usa `JobRunnerLib`. Per volumi > 500: chunking da 100, `yield` dopo ogni chunk, pausa configurabile.

#### `enableTestMode(email: Email): void`

Abilita la modalità test: tutte le email vengono indirizzate all'email di test specificata invece dei destinatari reali.

---

## 3. ImportService

**Responsabilità:** orchestrare l'importazione di dati da file esterni (Excel/CSV su Drive) nel database interno, seguendo le ricette configurate in `CONF_IMP`.

**Libreria di riferimento:** `GasDataImporter` (L3).

### Metodi principali

#### `executeImport(configId: string): ImportResult`

Esegue un job di importazione completo.

Flusso:

1. Carica `ConfigurazioneImport` da `ConfigurazioneImportRepository`
2. Se `!attivo` → skip immediato
3. Trova il file sorgente in base alla strategia configurata:
   - `FILE_SINGOLO`: usa `CONFIG.fileId` direttamente
   - `CERCA_CARTELLE_CLASSE`: scansiona le cartelle generate per ogni classe
   - `CERCA_DOCUMENTI`: cerca tra i documenti registrati in `LOG_DOCS`
4. Legge i dati raw dal file (delegato a `GasDataImporter`)
5. Mappa le colonne (`CONFIG.map`)
6. Per ogni riga:
   - Calcola la chiave composita (`CONFIG.key`)
   - Gestisce il conflitto:
     - `IGNORE`: salta se il record esiste
     - `OVERWRITE`: sovrascrive sempre
     - `TIMESTAMP`: sovrascrive solo se il dato importato ha timestamp più recente
   - Inserisce o aggiorna nella tabella target
7. `database.save()` (batch unico)
8. Restituisce `{ inseriti, aggiornati, saltati, ghost, errori }`

Il servizio include anche la **Ghost Record Detection**: un record mappato DEVE essere considerato "ghost" (e DEVE essere ignorato, senza inserimento né aggiornamento) SE E SOLO SE, dopo l'applicazione di `CONFIG.map`, tutti i campi non appartenenti alla chiave (`CONFIG.key`) e non di timestamp/metadato (es. `DATA_MODIFICA`) risultano null o stringa vuota. La verifica DEVE avvenire dopo il mapping delle colonne e prima della gestione del conflitto (step 6), per ogni riga della sorgente. Un record ghost NON DEVE incrementare né `inseriti` né `aggiornati`, ma DEVE essere conteggiato separatamente come `ghost` nel risultato `ImportResult`.

**Rischio timeout parsing iniziale:** per file sorgente molto grandi, la fase di lettura/parsing (prima del primo `yield`) avviene interamente prima che `JobRunnerLib` possa intervenire, e potrebbe quindi superare il timeout di esecuzione GAS per singola invocazione (6 minuti sugli account gratuiti, 30 su Google Workspace). Le specifiche non garantiscono che `GasDataImporter` (L3) supporti il parsing a chunk/streaming compatibile con i generator; questo va verificato caso per caso per le fonti di importazione di grandi dimensioni.

#### `executeAllActiveImports(): ImportResult[]`

Carica tutte le `ConfigurazioneImport` con `ATTIVO = true` e le esegue in sequenza.

---

## 4. ReportService

**Responsabilità:** calcolare e restituire aggregati statistici per l'istituto, le classi e i singoli studenti. Non modifica dati.

### Metodi principali

#### `getStatisticheClasse(classeId: ClasseId): StatisticheClasse`

Restituisce:

- Numero alunni totali, attivi, con BES, con DSA, ripetenti
- Distribuzione carenze per severità (GRAVE/MEDIA/LIEVE)
- Ore ASL maturate dalla classe
- Numero documenti generati per tipo

#### `getStatisticheIstituto(): StatisticheIstituto`

Restituisce aggregati a livello istituto: totali alunni, docenti, classi attive, distribuzione per anno di corso e indirizzo.

#### `getReportCarenze(options: ReportOptions): CarenzeReport`

Genera un report delle carenze filtrato per classe, periodo, materia o stato di notifica.

#### `getReportASL(classeId: ClasseId): ASLReport`

Genera un report delle ore ASL/PCTO per la classe specificata: totali per studente, storico degli anni precedenti.

---

## 5. Dipendenze tra servizi applicativi

```
DocumentGenerationService
  → ContextBuilder (ContextEngine L3)
  → DocumentoPipeline (PipelineFramework L3)
  → ConfigurazioneDocumentoRepository
  → LogDocumentoRepository
  → DriveServiceFacade

EmailNotificationService
  → ContextBuilder (ContextEngine L3)
  → NotificaPipeline (PipelineFramework L3)
  → ConfigurazioneEmailRepository
  → LogEmailRepository
  → GmailServiceFacade
  → SupplenzaRepository (per ResolveRecipientsStep)

ImportService
  → ConfigurazioneImportRepository
  → GasDataImporter (L3)
  → Repository della tabella target
  → DriveServiceFacade (per localizzare i file sorgente)

ReportService
  → AlunnoRepository
  → CarenzaRepository
  → OreASLRepository
  → LogDocumentoRepository
```

NON DEVE esistere alcuna dipendenza circolare tra i servizi applicativi. Tutti DEVONO ricevere le dipendenze tramite constructor injection dal `ServiceContainer`.
