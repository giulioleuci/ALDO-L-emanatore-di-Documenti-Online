# ALDO — SGSA (Sistema di Gestione Scolastica Automatizzata)

**ALDO** è l'acronimo di **Aldo, L'emanatore di Documenti Online** — il nome interno dell'implementazione di **SGSA**, un ERP scolastico modulare costruito interamente sull'ecosistema Google Workspace tramite Google Apps Script (GAS). Automatizza i processi amministrativi e didattici di un istituto scolastico: gestione anagrafica, generazione massiva di documenti, invio di notifiche email personalizzate, importazione dati da fonti esterne e archiviazione strutturata su Google Drive.

SGSA non è uno script lineare ma un framework applicativo basato su pattern architetturali consolidati (Dependency Injection, Repository, Strategy, Facade, Pipeline, Specification), progettato per operare entro i limiti tecnici dell'ambiente GAS (esecuzione sincrona, timeout di 6/30 minuti, un unico namespace globale per script file).

---

## Legame con GasLibraryFactory

ALDO **non reimplementa** funzionalità infrastrutturali generiche: si appoggia a [**GasLibraryFactory**](https://github.com/giulioleuci/GasLibraryFactory), un monorepo indipendente di 16 librerie Google Apps Script riusabili, versionato e testato separatamente.

- `GasLibraryFactory` è un repository Git a sé stante, con propria build, propri test e proprio ciclo di rilascio. In questo workspace vive come sottocartella `GasLibraryFactory/` **esclusa da Git** (vedi `.gitignore`): non è un submodule né codice duplicato, ma una dipendenza a monte che viene compilata e "vendorizzata" localmente.
- Ogni scelta implementativa non banale in ALDO parte da una verifica in `GasLibraryFactory/DOCS_LIBS`: se la libreria copre già il caso, si usa direttamente; se lo copre solo in parte, si valuta se estendere la libreria invece di scrivere codice custom in ALDO. Il codice ALDO-locale è riservato alla logica di dominio SGSA specifica (es. struttura del CDU, interpretazione di `CONF_DOC`/`CONF_MAIL`) che non ha senso generalizzare in una libreria.

### Come il codice di GasLibraryFactory viene integrato in ALDO

L'integrazione avviene tramite un bundle **vendorizzato**, non tramite import diretti dei sorgenti TypeScript della libreria:

1. `GasLibraryFactory` viene compilato in modalità testing con il proprio build pipeline, producendo `GasLibraryFactory/dist/Code.js`.
2. `npm run refresh:vendor` (script `scripts/refresh-vendor.cjs`) copia quel bundle in `vendor/gaslibs.Code.js`, insieme a un file `CHECKSUM` (sha256) e `VERSION` (versione della libreria da `package.json`).
3. `npm run verify:vendor` (`scripts/verify-vendor.cjs`) verifica che il bundle vendorizzato sia coerente con il checksum registrato, così da evitare drift silenziosi tra il codice testato e quello effettivamente pacchettizzato.
4. La build applicativa di ALDO (`scripts/build-and-prepare.cjs`) unisce il webpack bundle di `src/` con `vendor/gaslibs.Code.js` in un unico `dist/Code.js`, oltre a generare `dist/EntryPoints.js` da `src/entrypoints/EntryPoints.ts`. Il risultato è un singolo script Apps Script che espone sia le API delle librerie sia il codice applicativo di ALDO nello stesso namespace globale GAS.

Tutte le chiamate ai servizi nativi GAS (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `MailApp`, `PropertiesService`, `UrlFetchApp`, ecc.) sono confinate dentro `GoogleApiWrapper` (L2 di GasLibraryFactory); il resto del codice applicativo vi accede solo tramite le facade infrastrutturali di ALDO. Questo vincolo è imposto anche a livello di lint (`no-restricted-globals`).

---

## Scopo

Automatizzare in modo data-driven i flussi ricorrenti di segreteria didattica di un istituto scolastico:

- **Generazione documentale massiva** — verbali di consiglio di classe, piani didattici personalizzati (PDP/PEI/PFP), piani di lavoro, comunicazioni di carenza, e altri tipi di documento, tutti configurabili senza toccare il codice.
- **Notifiche email personalizzate** — comunicazioni a coordinatori, docenti, consigli di classe, alunni e famiglie, con contenuto dinamico composto a "box" e destinatari risolti automaticamente in base al ruolo attivo.
- **Importazione dati** — ETL da fonti esterne (file, cartelle Drive per classe, documenti) verso le tabelle del database.
- **Archiviazione strutturata** — creazione automatica di cartelle Drive con ACL coerenti con i ruoli scolastici.
- **Risoluzione dei ruoli** — determinazione del docente effettivamente attivo per classe/materia/data, tenendo conto di supplenze e variazioni di cattedra.

Nulla è hard-coded: tipo di documento, template Drive, cartella di destinazione, permessi, pattern email e azioni post-processo sono tutti record nelle tabelle di configurazione del database (`CONF_DOC`, `CONF_MAIL`, `CONF_IMP`). Aggiungere un nuovo tipo di documento o un nuovo pattern di comunicazione significa inserire una riga nel database, non scrivere codice.

---

## Architettura

SGSA è organizzato in quattro layer sovrapposti (Clean Architecture), dove ogni layer dipende esclusivamente da quello immediatamente inferiore:

```
┌────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  Menu Google Sheets, dialoghi modali, sidebar di monitoraggio│
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│  APPLICATION SERVICES LAYER                                 │
│  DocumentGenerationService, EmailNotificationService,        │
│  ImportService, ReportService                                │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│  DOMAIN LAYER                                                │
│  Entità, Value Object, aggregati, repository, specification  │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                        │
│  SheetDBLib, DriveServiceFacade, GmailServiceFacade,          │
│  DocumentServiceFacade, DatabaseService                      │
└────────────────────────────────────────────────────────────┘
```

Il Domain Layer è completamente agnostico rispetto a Google Sheets, Drive o Gmail: non li conosce direttamente, ma opera solo su astrazioni (repository, facade) implementate nell'Infrastructure Layer.

### Struttura del repository (`src/`)

| Cartella | Contenuto |
| --- | --- |
| `src/domain/` | Entità, value object, specification, interfacce dei repository, `DomainError`. Nessun import di GAS o di GasLibraryFactory. |
| `src/application/` | Servizi applicativi (`services/`), strategie di generazione documentale (`strategies/`, una classe per tipo di generatore `CONF_DOC`), l'assemblatore del CDU (`context-engine/`, con `providers/`, `mappers/`, `interceptors/`), orchestrazione import dati (`import/`). |
| `src/infrastructure/` | `facades/` incapsulano le chiamate a GasLibraryFactory e ai servizi nativi GAS dietro interfacce proprie di ALDO (`IDriveFacade`, `IGmailFacade`, `ITemplateEngine`); `repositories/` implementano le interfacce di dominio sopra `SheetDbAdapter`; `steps/` e `services/` contengono helper infrastrutturali (es. `AlberoCartelle`). |
| `src/presentation/Menu.ts` | Costruisce il menu Google Sheets; riceve una UI facade, nessuna logica di business. |
| `src/config/` | Composition root: `ServiceContainer.ts` (wrapper tipizzato su `CoreUtilsLib.LazyServiceContainer`), `Bootstrap.ts` (`initAldo()` cablaggio di ogni facade/servizio/repository reale), `schema.ts`. |
| `src/entrypoints/EntryPoints.ts` | Script file GAS separato e leggibile; richiama funzioni come `initAldo`, `avviaGenerazioneDataDriven` come globali ambientali (non import), perché GAS condivide un unico namespace globale tra i file di uno stesso progetto. |
| `src/index.ts` | L'altra metà dell'entry point: dichiara le funzioni reali e le assegna a `globalThis` così che GAS possa richiamarle per nome (`onOpen`, `menu_avvioImportazioni`, `resumeJob`, e tutto ciò che serve a `EntryPoints.ts`). `onOpen` costruisce solo il menu, non innesca mai `initAldo()` in modo eager. |
| `src/onlinetests/` | Entry point webpack separato (`checks/`) di smoke test live-GAS, compilato solo in modalità `--mode=online`. |

L'albero dei test rispecchia `src/` sotto `test/unit/`; `test/integration/` e `test/build/` sono progetti Jest separati. `test/fakes/` e `test/fixtures/` contengono test double e dati condivisi.

### Concetti fondamentali di dominio

- **Google Sheets come database relazionale** — ogni foglio è una tabella, le colonne sono campi tipizzati, le email sono chiavi primarie/straniere. `SheetDBLib` (L2 di GasLibraryFactory) astrae la persistenza in oggetti di dominio.
- **CDU (Contesto Dati Unificato)** — prima di ogni operazione (generazione documento, invio email) il sistema assembla un unico oggetto di contesto aggregato; template ed email box operano esclusivamente su questo contesto serializzato. Costruito da `ContextEngine`.
- **Gerarchia di risoluzione ruoli** — il docente attivo per una classe/materia/data è risolto interrogando tre fonti in ordine di priorità decrescente: `SUPPLENZE` (1) → `VARIAZIONI_CATTEDRA` (2) → `CLASSI` (3, fallback nominale). Vedi `RoleResolutionLib`.
- **Data-driven** — tipi di documento, template Drive, cartelle di destinazione, ACL e pattern email vivono nelle tabelle `CONF_DOC`/`CONF_MAIL`, non nel codice.
- **Job lunghi tramite `JobRunnerLib`** — GAS limita l'esecuzione a 6/30 minuti. Il lavoro batch è scritto come funzioni generator il cui stato viene serializzato in `ScriptProperties` a ogni checkpoint e ripreso da un trigger temporizzato.

### Librerie di GasLibraryFactory usate (livelli L0→L4)

| Livello | Libreria | Responsabilità |
| --- | --- | --- |
| L0 | `CoreUtilsLib` | Utility generali, helper primitivi |
| L0 | `GasResilienceLib` | Retry, backoff esponenziale, rate limiting |
| L0 | `GasOnlineTestFramework` | Framework di test in-cloud |
| L1 | `GoogleApiWrapper` | Accesso batch-first alle Google API (Drive, Docs, Sheets) |
| L1 | `GasSchemaValidatorLib` | Validazione strutturale dati (Zod-based) |
| L2 | `SheetDBLib` | ORM-lite su Google Sheets, query builder |
| L2 | `GasExpressionEngineLib` | Parser/valutatore di espressioni logiche AST-based |
| L2 | `WorkspaceTemplateEngine` | Motore di template per documenti e testi con placeholder |
| L3 | `JobRunnerLib` | Processi lunghi con generator + trigger temporizzati |
| L3 | `PipelineFramework` | Pipeline ETL a step sequenziali |
| L3 | `ContextEngine` | Dependency injection dei dati (CDU builder) |
| L3 | `DomainRepositoryLib` | Base class per i repository DDD |
| L3 | `GasDataImporter` | ETL da file esterni |
| L4 | `RoleResolutionLib` | Risoluzione ruoli astratti → email reali, con supplenze |
| L4 | `ComposableContentLib` | Composizione di contenuto HTML modulare |
| L4 | `GasProcessMonitorLib` | Monitoraggio processi batch con sidebar HTML |

Il grafo di dipendenza delle librerie è rigorosamente a livelli (L0→L4), senza dipendenze circolari.

---

## Struttura dati e database

Il database è implementato su Google Sheets: ogni foglio è una tabella, ogni riga un record, ogni colonna un campo tipizzato. Nomi di tabelle e colonne sono sempre in UPPERCASE.

### Master Sheet

Un unico spreadsheet **Master Sheet** è il punto di ingresso per i database di ogni anno scolastico:

| Colonna | Descrizione |
| --- | --- |
| `ANNO_SCOLASTICO` | Chiave primaria, formato `YYYY-YYYY` |
| `ID_SPREADSHEET` | ID Drive dello spreadsheet del database dell'anno |
| `ID_CARTELLA_GOOGLE` | ID della cartella Drive radice per i documenti generati |
| `DIRIGENTE_SCOLASTICO` | Nome del dirigente scolastico |
| `SUPERVISORE_EMAIL` | Indirizzo in BCC su tutte le email del sistema (opzionale) |

Le righe sono mantenute in ordine cronologico decrescente: la prima riga è sempre l'anno scolastico corrente, senza alcun parametro di configurazione separato.

### Tabelle del database per anno scolastico

| Tabella | Ruolo nel sistema |
| --- | --- |
| **ALUNNI** | Registro anagrafico degli studenti (PK `EMAIL`) |
| **DOCENTI** | Anagrafica del corpo docente (PK `EMAIL`) |
| **CLASSI** | Configurazione classi e matrice di assegnazione cattedre (PK `ID`); rappresenta Priority 3 nella risoluzione ruoli |
| **MATERIE** | Catalogo delle discipline insegnate (PK `ID`) |
| **INDIRIZZI** | Percorsi di studio disponibili nell'istituto (PK `ID`) |
| **DIPART** | Dipartimenti disciplinari (PK `ID`) |
| **RUOLI** | Incarichi speciali d'istituto (PK `ID`) |
| **VARIAZIONI_CATTEDRA** | Cambi permanenti di titolarità post-inizio anno; Priority 2 nella risoluzione ruoli |
| **SUPPLENZE** | Sostituzioni temporanee dei docenti; Priority 1 nella risoluzione ruoli, con catene ricorsive |
| **CARENZE** | Insufficienze degli studenti, struttura a matrice (PK composita `STUDENTE, PROGRESSIVO`) |
| **PIANI** | Piani Didattici Personalizzati — PDP, PEI, PFP (PK composita `STUDENTE, TIPO`) |
| **PROGETTI** | Attività extracurricolari e percorsi PCTO/ASL (PK composita `CLASSE, TIPO, NOME`) |
| **MOV_ALUNNI** | Storico della mobilità studentesca, append-only (PK composita `STUDENTE, TIPO, DATA`) |
| **ASL** | Ore cumulative di Alternanza Scuola Lavoro per studente/anno (PK composita `STUDENTE, ANNO`) |
| **CONF_DOC** | Configurazione del motore di generazione documenti (PK `ID`) |
| **CONF_MAIL** | Configurazione del motore di notifiche email (PK `ID`) |
| **CONF_IMP** | Configurazione dei job ETL di importazione (PK `ID`) |
| **LOG_DOCS** | Audit trail append-only dei documenti generati (PK `ID` = ID Drive del file) |
| **LOG_FOLD** | Audit trail append-only delle cartelle create su Drive (PK `ID` = ID Drive della cartella) |
| **LOG_MAIL** | Audit trail delle email inviate (PK composita `PATTERN, DESTINATARI, DATA`) |

Dettagli di colonne, tipi, vincoli e chiavi esterne per ogni tabella sono documentati in modo esaustivo in `SPECS_ALDO/01_SCHEMA_DATABASE.md`, la fonte di verità fisica del database. La struttura logica del Contesto Dati Unificato che aggrega questi dati per template ed email è documentata in `SPECS_ALDO/02_CDU_STRUTTURA.md`.

### Gerarchia di risoluzione ruoli

Per determinare il docente attivo per classe/materia/data, il sistema valuta tre priorità in ordine decrescente, fermandosi alla prima che produce un match:

```
Priority 1 — SUPPLENZE           (sostituzione temporanea attiva sovrascrive tutto)
Priority 2 — VARIAZIONI_CATTEDRA (cambio permanente sovrascrive il titolare nominale)
Priority 3 — CLASSI              (titolare nominale di inizio anno, fallback)
```

---

## Comandi

```bash
# Verifiche statiche
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint .
npm run lint:fix
npm run format                # prettier --write .

# Test
npm test                      # unit test (test/unit/**, jest.config.cjs)
npm run test:integration      # test/integration/**, jest.integration.config.cjs
npm run test:build            # test/build/**, jest.build.config.cjs — valida la shape della build

# Sincronizzazione con GasLibraryFactory
npm run refresh:vendor        # compila GasLibraryFactory e aggiorna vendor/gaslibs.Code.js
npm run verify:vendor         # verifica il checksum del bundle vendorizzato

# Build per Google Apps Script
npm run build:testing         # build in chiaro, per debug nell'editor Apps Script
npm run build:testoffline     # come sopra, variante offline
npm run build:production      # build minificata (Terser), per il rilascio
npm run build:online          # build + OnlineTests.js + gas-source-map.json; esegue anche
                               # l'intera suite di test offline come gate pre-push

# Push su Google Apps Script (via clasp)
npm run push:testing          # build:testing + clasp push
npm run push:online           # build:online + clasp push (gate: test offline devono passare)
```

Eseguire un singolo file di test: `npx jest --config jest.config.cjs path/al/File.test.ts` (sostituire il config per le varianti integration/build). Eseguire un singolo test per nome: aggiungere `-t "nome del test"`.

### Modalità di build

`scripts/build-and-prepare.cjs --mode=<production|testing|testoffline|online>` compila `src/` (via webpack) insieme al bundle precompilato `vendor/gaslibs.Code.js` in `dist/Code.js`, più `dist/EntryPoints.js` da `src/entrypoints/EntryPoints.ts`.

- `testing`/`testoffline`/`production` compilano solo l'entry point webpack principale; `online` compila in aggiunta l'entry `onlinetests` in `OnlineTests.js`, applica le patch di compatibilità V8 e poi lo scarta per ogni altra modalità.
- `online` genera anche `gas-source-map.json` (mappa le righe minificate di `Code.js`/`OnlineTests.js` ai sorgenti TS originali) e fa girare l'intera suite di test offline come gate pre-push (`push:online` fallisce se i test offline falliscono).
- `production` minifica via Terser; `testing`/`testoffline` mantengono l'output leggibile per il debug nell'editor Apps Script.

`clasp push` esclude `gas-source-map.json` (è un artefatto di debug, non un file da rilasciare).

---

### Provisioning del master bound (primo avvio)

I lanciatori `scripts/provision-master.sh` (macOS/Linux) e
`scripts/provision-master.ps1` (Windows) aggiornano GasLibraryFactory, ne
rigenerano il bundle vendorizzato, compilano ALDO in produzione e creano un
nuovo Google Sheet con progetto Apps Script **bound**. Il codice pushato è
quindi associato direttamente al nuovo Sheet.

Prima dell'esecuzione servono Git, Node.js/npm nelle versioni indicate in
`package.json`, le dipendenze installate con `npm install` e un browser per
completare `clasp login` quando richiesto. Modificare all'inizio del launcher
usato le variabili `GLF_REPOSITORY_URL`, `GLF_BRANCH`, `MASTER_TITLE` e
`MASTER_FOLDER_PATH`.

Su macOS/Linux eseguire:

```bash
bash scripts/provision-master.sh
```

Su Windows PowerShell eseguire:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\provision-master.ps1
```

Al primo avvio, o quando il token è scaduto, il launcher apre il flusso
interattivo di autorizzazione di clasp: il consenso Google va confermato nel
browser. Al termine, `REPO_FOR_GLF.txt` riporta URL, ramo e commit effettivo di
GasLibraryFactory usato per la build.

Per mantenere i lanciatori privi di client Drive API, il nuovo Sheet viene
creato nella **Drive root**. Spostarlo manualmente nel percorso indicato da
`MASTER_FOLDER_PATH`; lo spostamento non rompe il legame tra il Sheet e il suo
progetto Apps Script bound.

---

## Vincoli critici

- **Target GAS V8**, non Node: solo codice sincrono, niente API specifiche di Node o del browser non supportate. I sorgenti usano TypeScript moderno ma vengono transpilati (Babel → Chrome 80) e patchati per GAS da `scripts/build-and-prepare.cjs`.
- I servizi nativi GAS (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`) sono toccabili **solo** dentro `GoogleApiWrapper` (L2 di GasLibraryFactory); tutto il resto passa da un wrapper service. Vincolo imposto da ESLint (`no-restricted-globals`).
- `dist/*` non va mai modificato a mano: è generato dalla build.
- Il grafo di dipendenza delle librerie è a livelli (L0→L4), senza dipendenze circolari.
- Nuovi servizi/repository/facade vengono cablati in `src/config/Bootstrap.ts` e risolti tramite `ServiceContainer`, mai istanziati ad hoc nel codice applicativo.
