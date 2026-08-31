# 00 — Panoramica del Sistema SGSA

## 1. Identità del sistema

**SGSA (Sistema di Gestione Scolastica Automatizzata)** è una piattaforma ERP scolastica modulare costruita interamente sull'ecosistema Google Workspace tramite Google Apps Script (GAS). Il suo scopo è automatizzare i processi amministrativi e didattici complessi di un istituto scolastico: gestione anagrafica, generazione massiva di documenti, invio di notifiche personalizzate, importazione dati da fonti esterne e archiviazione strutturata su Google Drive.

SGSA non è uno script lineare ma un **framework applicativo** basato su pattern architetturali consolidati (Dependency Injection, Repository, Strategy, Facade, Pipeline, Specification) progettato per operare entro i limiti tecnici dell'ambiente GAS.

---

## 2. Architettura a livelli

Il sistema è organizzato in quattro layer sovrapposti, dove ogni layer dipende esclusivamente da quello immediatamente inferiore.

```
┌────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                        │
│  Menu Google Sheets, Dialoghi modali, Sidebar monitoraggio │
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
│  Entità, Value Object, Aggregati, Repository, Spec.        │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                      │
│  SheetDBLib, DriveServiceFacade, GmailServiceFacade,       │
│  DocumentServiceFacade, DatabaseService                    │
└────────────────────────────────────────────────────────────┘
```

Il Domain Layer è completamente agnostico rispetto all'infrastruttura: non conosce Google Sheets, Drive o Gmail direttamente.

---

## 3. Stack tecnologico e librerie

SGSA si basa su una gerarchia di librerie riusabili (`GasLibraryFactory`), organizzate in livelli da L0 (fondamenta) a L4 (dominio):

| Livello | Libreria                  | Responsabilità                                                |
| ------- | ------------------------- | ------------------------------------------------------------- |
| **L0**  | `CoreUtilsLib`            | Utility generali, helpers primitivi                           |
| **L0**  | `GasResilienceLib`        | Retry, exponential backoff, gestione rate limit               |
| **L0**  | `GasOnlineTestFramework`  | Framework di test in-cloud                                    |
| **L1**  | `GoogleApiWrapper`        | Accesso batch-first alle Google API (Drive, Docs, Sheets)     |
| **L1**  | `GasSchemaValidatorLib`   | Validazione strutturale dati (Zod-based)                      |
| **L2**  | `SheetDBLib`              | ORM-lite su Google Sheets, query builder                      |
| **L2**  | `GasExpressionEngineLib`  | Parser e valutatore di espressioni logiche AST-based          |
| **L2**  | `WorkspaceTemplateEngine` | Motore di template per documenti e testi con placeholder      |
| **L3**  | `JobRunnerLib`            | Gestione processi lunghi con generator + trigger temporizzati |
| **L3**  | `PipelineFramework`       | Pipeline ETL a step sequenziali                               |
| **L3**  | `ContextEngine`           | Dependency Injection dei dati (CDU builder)                   |
| **L3**  | `DomainRepositoryLib`     | Base class per i repository DDD                               |
| **L3**  | `GasDataImporter`         | ETL da file esterni                                           |
| **L4**  | `RoleResolutionLib`       | Risoluzione ruoli astratti → email reali con supplenze        |
| **L4**  | `ComposableContentLib`    | Composizione di contenuto HTML modulare                       |
| **L4**  | `GasProcessMonitorLib`    | Monitoraggio processi batch con sidebar HTML                  |

SGSA non reimplementa funzionalità già offerte da queste librerie. Le referenzia, le configura e le estende con la logica di business specifica del dominio scolastico.

---

## 4. Fonti di verità

Tutta la documentazione di SGSA si valida rispetto a due sorgenti autorevoli:

- **`01_SCHEMA_DATABASE.md`** — Schema fisico del database (tabelle, colonne, tipi, vincoli, relazioni FK). Nomi di colonne e tabelle sono sempre in UPPERCASE.
- **`02_CDU_STRUTTURA.md`** — Struttura canonica del Contesto Dati Unificato. Tutti i percorsi di accesso ai dati del contesto (es. `focus.classe.nome`) derivano da questo schema.

In caso di incoerenza tra qualsiasi documento di SGSA e queste due fonti, prevalgono `01_SCHEMA_DATABASE.md` e `02_CDU_STRUTTURA.md`.

---

## 5. Concetti fondamentali

### Database relazionale virtuale

Google Sheets viene trattato come un database relazionale. Ogni foglio è una tabella, le colonne sono campi tipizzati, le email sono chiavi primarie e straniere. Il layer `SheetDBLib` (L2) astrae completamente la persistenza esposta come oggetti di dominio.

### Contesto Dati Unificato (CDU)

Prima di qualsiasi operazione (generazione documento, invio email), il sistema assembla un oggetto CDU che aggrega tutti i dati necessari: istituto, classe, consiglio di classe, alunni, carenze, piani personalizzati, destinatario. I template e i box email operano esclusivamente su questo contesto serializzato.

### Gerarchia di Risoluzione Ruoli

Il sistema determina il docente attivo per una classe/materia/data interrogando tre sorgenti in ordine di priorità decrescente:

1. **SUPPLENZE** (Priority 1) — sostituzione temporanea attiva
2. **VARIAZIONI_CATTEDRA** (Priority 2) — cambio permanente post-inizio anno
3. **CLASSI** (Priority 3) — titolare nominale di inizio anno (fallback)

### Job Runner

GAS ha un limite di esecuzione di 6 o 30 minuti. Per operazioni batch (generare verbali per 50 classi, inviare 1500 email), SGSA usa `JobRunnerLib`: la logica è implementata come generator function, lo stato viene serializzato in `ScriptProperties` a ogni checkpoint, e un trigger temporizzato riavvia il processo dopo 1 minuto, riprendendo esattamente da dove si era interrotto.

### Data-Driven

Nessun comportamento del sistema è hard-coded. Tipo di documento, template Drive da usare, cartella di destinazione, permessi ACL, destinatari email, azioni post-processo: tutto è configurato nelle tabelle `CONF_DOC` e `CONF_MAIL` del database. Aggiungere un nuovo tipo di documento o un pattern email significa inserire un record nel database, non modificare il codice.

---

## 6. Indice della documentazione

| File                                  | Contenuto                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_SCHEMA_DATABASE.md`               | Schema fisico completo di tutte le tabelle                                                                                                              |
| `02_CDU_STRUTTURA.md`                 | Struttura canonica del Contesto Dati Unificato                                                                                                          |
| `03_VALUE_OBJECTS_ED_ENUM.md`         | Tutti i Value Object e gli Enum del dominio                                                                                                             |
| `GUIDA_USO_PLACEHOLDER.md`            | Sintassi placeholder/loop del `WorkspaceTemplateEngine` e regole d'uso nei template                                                                     |
| `MAT_NON_STANDARD.md`                 | Specifica del placeholder `{{focus.classe.elencoMaterieConPermessi}}` per l'espansione orizzontale delle materie con permessi granulari (Google Sheets) |

I documenti `04`–`15` (entità di dominio, aggregati, repository, specification, architettura a layer, context engine, pipeline documenti/email, servizi applicativi/storici/utility, UI/Job Runner) non esistono più come file separati: il loro contenuto rilevante è stato consolidato nei tre documenti sopra o vive direttamente nel codice sorgente (`src/domain/`, `src/application/`, `src/infrastructure/`) — usare la Knowledge Graph (`codebase-memory-mcp`) o una ricerca nel codice per quel livello di dettaglio.
