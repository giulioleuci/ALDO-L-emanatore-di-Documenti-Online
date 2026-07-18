# SGSA (Sistema di Gestione Scolastica Automatizzata) — Architettura dei File

Questo file fornisce una descrizione accurata e completa di tutte le cartelle e i file del progetto **SGSA** (nome in codice **ALDO**), un ERP scolastico modulare basato su Google Workspace e implementato in Google Apps Script (GAS) mediante TypeScript.

---

## Struttura Principale del Workspace

- **`src/`**: Contiene il codice sorgente dell'applicazione organizzato secondo i principi della Clean Architecture.
- **`test/`**: Contiene la suite di test unitari, di integrazione, fakes e configurazioni per la convalida offline e online.
- **`scripts/`**: Script di build, deployment e utility di sincronizzazione delle librerie esterne.
- **`types/`**: Contiene le definizioni di tipo TypeScript specifiche per le librerie importate da `GasLibraryFactory`.
- **`FAKEDB/`**: File CSV contenenti mock database per simulare le tabelle di Google Sheets localmente nei test.

---

## 1. Directory: `src/`

Contiene l'intero sorgente TypeScript dell'applicazione, suddiviso nei layer architetturali standard (Domain, Application, Infrastructure, Presentation).

### File nella Root di `src/`

- [src/index.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/index.ts): Il punto di ingresso principale dell'applicazione. Si occupa di esporre le funzioni e le macro globali a `globalThis` affinché Google Apps Script possa riconoscerle e invocarle direttamente (es. `onOpen`, `menu_avvioImportazioni`, `resumeJob`).

---

### Folder: `src/config/`

Contiene la configurazione del sistema di Dependency Injection (DI) e la definizione fisica degli schemi delle tabelle del database.

- [src/config/Bootstrap.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/config/Bootstrap.ts): Contiene la funzione `initAldo()` che registra tutte le implementazioni concrete delle facciate, dei repository e dei servizi applicativi nel DI Container.
- [src/config/ServiceContainer.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/config/ServiceContainer.ts): Fornisce un wrapper tipizzato basato su `CoreUtilsLib.LazyServiceContainer` per la risoluzione lazy dei servizi a runtime.
- [src/config/schema.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/config/schema.ts): Definisce gli schemi fisici e le regole di validazione dei dati per tutte le tabelle del foglio Google (relazioni, chiavi primarie, vincoli) utilizzate da `SheetDBLib`.

---

### Folder: `src/presentation/`

Gestisce l'interazione utente e l'interfaccia all'interno di Google Sheets.

- [src/presentation/Menu.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/presentation/Menu.ts): Configura e costruisce i menu personalizzati dell'interfaccia utente di Google Sheets per avviare importazioni, generazione documenti e comunicazioni email.

---

### Folder: `src/entrypoints/`

Definisce le funzioni globali non importate usate direttamente dai trigger GAS.

- [src/entrypoints/EntryPoints.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/entrypoints/EntryPoints.ts): Dichiara le funzioni ambientali globali che fungono da aggancio diretto per i trigger di foglio di calcolo, menu Sheets e trigger temporizzati del `JobRunnerLib`.

---

### Folder: `src/domain/`

Definisce il core del dominio applicativo scolastico (Entità, Value Object, Specifiche logiche) in modo del tutto agnostico rispetto all'infrastruttura e all'ambiente GAS.

#### Sotto-cartella: `src/domain/entities/`

Contiene le classi entità del dominio scolastico e di configurazione.

- [src/domain/entities/AldoEntity.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/AldoEntity.ts): Classe base astratta per tutte le entità del dominio ALDO, con logica di uguaglianza basata sull'identificativo unico.
- [src/domain/entities/Alunno.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Alunno.ts): Entità studente con informazioni su stato (attivo/inattivo), BES, dati di contatto, tutor e storici.
- [src/domain/entities/Carenza.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Carenza.ts): Entità per la gestione delle carenze formative (insufficienze) degli studenti in singole materie.
- [src/domain/entities/Classe.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Classe.ts): Entità per la classe scolastica, con supporto per classi composte (articolate) e indirizzi scolastici.
- [src/domain/entities/ConfigurazioneDocumento.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/ConfigurazioneDocumento.ts): Entità per le regole di generazione dei documenti (mappata su `CONF_DOC`).
- [src/domain/entities/ConfigurazioneEmail.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/ConfigurazioneEmail.ts): Entità per le regole di composizione ed invio email (mappata su `CONF_MAIL`).
- [src/domain/entities/ConfigurazioneImport.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/ConfigurazioneImport.ts): Entità per le configurazioni ETL e mappature dei dati esterni (mappata su `CONF_IMP`).
- [src/domain/entities/ConsiglioDiClasse.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/ConsiglioDiClasse.ts): Entità aggregata del consiglio di classe (coordinatore, segretario, docenti per materia).
- [src/domain/entities/Dipartimento.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Dipartimento.ts): Entità dipartimento didattico con associazione materie e coordinatore di dipartimento.
- [src/domain/entities/Docente.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Docente.ts): Entità docente contenente dati di contatto ed eventuali ruoli speciali d'istituto.
- [src/domain/entities/Indirizzo.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Indirizzo.ts): Entità che rappresenta l'indirizzo di studio (curriculum scolastico).
- [src/domain/entities/LogCartella.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/LogCartella.ts): Rappresenta una cartella creata su Google Drive per scopi di tracciamento (mappato su `LOG_FOLD`).
- [src/domain/entities/LogDocumento.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/LogDocumento.ts): Rappresenta un record di documento generato e i relativi stati di approvazione (mappato su `LOG_DOCS`).
- [src/domain/entities/LogEmail.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/LogEmail.ts): Traccia l'invio e lo stato di consegna di ogni email (mappato su `LOG_MAIL`).
- [src/domain/entities/MasterConfig.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/MasterConfig.ts): Entità per i dati configurazione globali annuali (Dirigente, ID cartella root, ecc., mappata su `MASTER`).
- [src/domain/entities/Materia.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Materia.ts): Entità che rappresenta una singola materia di studio con relative opzioni di esame.
- [src/domain/entities/MovimentoAlunno.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/MovimentoAlunno.ts): Traccia i trasferimenti, ritiri o passaggi di classe degli alunni (mappato su `MOV_ALUNNI`).
- [src/domain/entities/OreASL.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/OreASL.ts): Gestisce le ore di Alternanza Scuola Lavoro svolte dall'alunno (mappato su `ASL`).
- [src/domain/entities/Piano.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Piano.ts): Entità del Piano Didattico Personalizzato / Piano Educativo Individualizzato (mappato su `PIANI`).
- [src/domain/entities/Progetto.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Progetto.ts): Entità dei progetti e delle attività PCTO/ASL associate a classi o alunni (mappato su `PROGETTI`).
- [src/domain/entities/RuoloSpeciale.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/RuoloSpeciale.ts): Delinea ruoli particolari come animatore digitale o tutor orientatore (mappato su `RUOLI`).
- [src/domain/entities/Supplenza.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/Supplenza.ts): Gestisce le supplenze temporanee dei docenti (mappato su `SUPPLENZE`).
- [src/domain/entities/VariazioneCattedra.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/entities/VariazioneCattedra.ts): Variazioni permanenti di cattedra attive da una specifica data (mappato su `VARIAZIONI_CATTEDRA`).

#### Sotto-cartella: `src/domain/errors/`

- [src/domain/errors/DomainError.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/errors/DomainError.ts): Eccezioni standardizzate per la gestione degli errori legati a violazioni delle regole di business del dominio.

#### Sotto-cartella: `src/domain/repositories/`

- [src/domain/repositories/IClasseRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/repositories/IClasseRepository.ts): Interfaccia custom del repository delle classi per esporre query specifiche ad hoc non supportate dall'astrazione generica.

#### Sotto-cartella: `src/domain/specifications/`

Contiene la logica di filtro e query strutturata secondo il Pattern Specification.

- [src/domain/specifications/Specification.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/Specification.ts): Classe base astratta per la composizione logica di specifiche (AND, OR, NOT).
- [src/domain/specifications/AlunniAttiviSpec.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/AlunniAttiviSpec.ts): Seleziona solo gli alunni attivi (non ritirati o trasferiti).
- [src/domain/specifications/AlunnoSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/AlunnoSpecs.ts): Specifiche riusabili per filtrare gli alunni (per classe, BES, ecc.).
- [src/domain/specifications/CarenzaSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/CarenzaSpecs.ts): Specifiche per selezionare carenze attive, non notificate o per anno scolastico.
- [src/domain/specifications/ClasseSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/ClasseSpecs.ts): Specifiche per individuare classi articolate, per indirizzo o per anno scolastico.
- [src/domain/specifications/DocenteSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/DocenteSpecs.ts): Specifiche per trovare ITP, coordinatori o docenti di un dipartimento.
- [src/domain/specifications/IndirizziPerTipoSpec.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/IndirizziPerTipoSpec.ts): Filtra gli indirizzi scolastici per tipologia.
- [src/domain/specifications/MaterieEsameSpec.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/MaterieEsameSpec.ts): Trova le materie coinvolte nelle commissioni d'esame.
- [src/domain/specifications/MateriePerDipartimentoSpec.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/MateriePerDipartimentoSpec.ts): Raggruppa le materie associate ad un dipartimento.
- [src/domain/specifications/MovimentoAlunnoSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/MovimentoAlunnoSpecs.ts): Filtra i record di trasferimento in base alla data o alla tipologia.
- [src/domain/specifications/OreASLSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/OreASLSpecs.ts): Seleziona ore ASL per singolo studente o anno di corso.
- [src/domain/specifications/PianoSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/PianoSpecs.ts): Filtra i piani didattici personalizzati per tipologia.
- [src/domain/specifications/ProgettoSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/ProgettoSpecs.ts): Trova i progetti attivi per una determinata classe o alunno.
- [src/domain/specifications/RuoliPerDocenteSpec.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/RuoliPerDocenteSpec.ts): Trova tutti i ruoli speciali ricoperti da un docente.
- [src/domain/specifications/VariazioneCattedraSpecs.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/specifications/VariazioneCattedraSpecs.ts): Specifica per identificare variazioni di cattedra valide in un dato istante.

#### Sotto-cartella: `src/domain/value-objects/`

Contiene gli oggetti immutabili e gli enumerativi del dominio scolastico.

- [src/domain/value-objects/enums.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/enums.ts): Definisce gli enum globali (es. `StatoDocumento`, `StatoEmail`, `TipoMovimento`, `TipoPiano`).
- [src/domain/value-objects/AnnoCorso.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/AnnoCorso.ts): Value Object per l'anno di corso (da 1 a 5) con utility di calcolo propedeuticità.
- [src/domain/value-objects/AnnoScolastico.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/AnnoScolastico.ts): Gestisce il formato dell'anno scolastico "YYYY-YY" con convalida formale.
- [src/domain/value-objects/ArticolazioneConfig.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/ArticolazioneConfig.ts): Dettaglio sulle suddivisioni degli studenti in gruppi per classi articolate.
- [src/domain/value-objects/ClasseId.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/ClasseId.ts): Identificativo univoco della classe (es. "5A").
- [src/domain/value-objects/CsvScope.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/CsvScope.ts): Indica la tipologia e il tracciato record del file di importazione CSV.
- [src/domain/value-objects/DipartimentoId.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/DipartimentoId.ts): Identificativo univoco del dipartimento didattico.
- [src/domain/value-objects/DriveFileId.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/DriveFileId.ts): Wrapper tipizzato per gli ID dei file e delle cartelle di Google Drive.
- [src/domain/value-objects/Email.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/Email.ts): Value Object per indirizzi email con validazione tramite espressioni regolari.
- [src/domain/value-objects/EsameConfig.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/EsameConfig.ts): Impostazioni per le commissioni e le materie d'esame.
- [src/domain/value-objects/IndirizzoId.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/IndirizzoId.ts): Identificativo dell'indirizzo curriculare (es. "INF" per Informatica).
- [src/domain/value-objects/MateriaId.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/MateriaId.ts): Identificativo normalizzato della materia (es. "MAT", "INF").
- [src/domain/value-objects/PeriodoSupplenza.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/PeriodoSupplenza.ts): Intervallo temporale (inizio/fine) che definisce la durata di una supplenza.
- [src/domain/value-objects/ValoreCarenza.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/domain/value-objects/ValoreCarenza.ts): Valore dell'insufficienza scolastica.

---

### Folder: `src/application/`

Contiene la logica dei casi d'uso (Use Cases), coordinando il flusso dei dati da e verso il dominio.

#### Sotto-cartella: `src/application/context-engine/`

Il nucleo deputato ad assemblare il **Contesto Dati Unificato (CDU)** prima che una notifica o un verbale venga generato.

- [src/application/context-engine/Cdu.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/Cdu.ts): Interfacce TypeScript che descrivono formalmente l'intero albero dati del CDU.
- [src/application/context-engine/dates.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/dates.ts): Semplici utility di formattazione delle date per il contesto.
- [src/application/context-engine/studenti.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/studenti.ts): Logica di estrazione e mappatura degli elenchi studenti della classe.
- [src/application/context-engine/techEntities.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/techEntities.ts): Mappatori interni per agganciare le entità reali del dominio all'albero dati tecnico.
- [src/application/context-engine/CdcAssembler.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/CdcAssembler.ts): Assemblatore specializzato dei dati relativi al Consiglio di Classe (CDC).
- [src/application/context-engine/ContextBuilder.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/ContextBuilder.ts): Orchestratore principale che invoca sequenzialmente i Provider e compila il CDU finale.
- [src/application/context-engine/ContextEngineFactory.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/ContextEngineFactory.ts): Factory per istanziare e configurare dinamicamente il ContextBuilder con i corretti moduli.
- [src/application/context-engine/ContextProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/ContextProvider.ts): Definizione dell'interfaccia base `IContextProvider` per l'inserimento dati nel CDU.
- [src/application/context-engine/ElencoMaterieConPermessi.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/ElencoMaterieConPermessi.ts): Risolve la visualizzazione orizzontale condizionale delle materie ed i permessi di lettura/scrittura dei docenti su Sheets.
- [src/application/context-engine/Recipe.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/Recipe.ts): Mappa le ricette dati (Recipe) per determinare quali provider eseguire in base all'operazione.

##### Sotto-cartella: `src/application/context-engine/providers/`

Implementazioni dei singoli provider di dati per il CDU.

- [src/application/context-engine/providers/AlunnoProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/AlunnoProvider.ts): Iniesta i dati anagrafici e di contatto dell'alunno nel CDU.
- [src/application/context-engine/providers/CarenzaFocusProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/CarenzaFocusProvider.ts): Popola i dati dell'insufficienza scolastica target oggetto del documento o della notifica.
- [src/application/context-engine/providers/CarenzeProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/CarenzeProvider.ts): Aggiunge la lista totale di carenze scolastiche dell'alunno o della classe.
- [src/application/context-engine/providers/ClasseProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/ClasseProvider.ts): Fornisce informazioni e metadati sulla classe scolastica di riferimento.
- [src/application/context-engine/providers/ConsiglioClasseProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/ConsiglioClasseProvider.ts): Carica la composizione nominale ed effettiva dei docenti del Consiglio di Classe.
- [src/application/context-engine/providers/DocumentiProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/DocumentiProvider.ts): Aggiunge metadati relativi ai documenti precedentemente generati per l'entità.
- [src/application/context-engine/providers/PianiProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/PianiProvider.ts): Estrae i piani didattici personalizzati (PDP, PEI, BES) attivi per l'alunno.
- [src/application/context-engine/providers/RappresentantiProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/RappresentantiProvider.ts): Carica i dati sui rappresentanti di classe (genitori e alunni).
- [src/application/context-engine/providers/SchoolProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/SchoolProvider.ts): Fornisce informazioni generali sull'istituto (nome, dirigente scolastico).
- [src/application/context-engine/providers/StatisticheProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/StatisticheProvider.ts): Calcola ed inserisce nel contesto statistiche aggregate (es. contatori di assenze o carenze).
- [src/application/context-engine/providers/StoricoProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/StoricoProvider.ts): Integra riferimenti storici ad anni scolastici precedenti.
- [src/application/context-engine/providers/StudentiProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/StudentiProvider.ts): Fornisce elenchi e filtri specifici di studenti associati alla classe.
- [src/application/context-engine/providers/TutorProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/providers/TutorProvider.ts): Popola il CDU con le informazioni del docente tutor/orientatore designato per lo studente.

##### Sotto-cartella: `src/application/context-engine/interceptors/`

- [src/application/context-engine/interceptors/SupplentiSubstitutionLookup.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/interceptors/SupplentiSubstitutionLookup.ts): Intercetta la composizione del CDC sostituendo dinamicamente i docenti titolari con i supplenti attivi in base al giorno dell'operazione.

##### Sotto-cartella: `src/application/context-engine/mappers/`

- [src/application/context-engine/mappers/carenzeMapper.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/context-engine/mappers/carenzeMapper.ts): Converte i dati fisici della tabella `CARENZE` in strutture dati formattate per la visualizzazione all'interno di tabelle di report o email.

#### Sotto-cartella: `src/application/email/`

Gestisce la logica di formattazione dei messaggi di posta elettronica.

- [src/application/email/boxes.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/email/boxes.ts): Compone blocchi di testo e layout HTML strutturati (boxes) da iniettare nei corpi delle email mediante `ComposableContentLib`.
- [src/application/email/saluto.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/email/saluto.ts): Genera le intestazioni e le formule di saluto dinamiche e appropriate in base al destinatario risolto (docente, coordinatore, genitore).

#### Sotto-cartella: `src/application/import/`

Contiene la logica per l'importazione dati e ETL da tracciati esterni.

- [src/application/import/CustomSourceStrategies.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/import/CustomSourceStrategies.ts): Definisce le strategie di formattazione ed estrazione dati per tracciati record specifici non standard.
- [src/application/import/ImportRecipeMapper.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/import/ImportRecipeMapper.ts): Mappa le ricette di importazione (`CONF_IMP`) legandole a regole di validazione e mapping dello schema.

#### Sotto-cartella: `src/application/strategies/`

Racchiude le strategie concrete di generazione dei documenti (Pattern Strategy).

- [src/application/strategies/GeneratorStrategy.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/strategies/GeneratorStrategy.ts): Interfaccia base `IGeneratorStrategy` che definisce il contratto per la generazione dei documenti.
- [src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts): Genera file Google Docs applicando sostituzioni avanzate e template complessi.
- [src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts): Compone documenti inserendo dinamicamente tabelle esterne all'interno dei segnaposto (placeholder).
- [src/application/strategies/DocumentoGenericoGeneratorStrategy.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/strategies/DocumentoGenericoGeneratorStrategy.ts): Strategia di fallback che esegue una sostituzione semplice di placeholder testuali su un documento copia del template.
- [src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts): Genera fogli di calcolo applicando blocchi e permessi di editing granulari per i singoli docenti sulle rispettive materie.
- [src/application/strategies/SheetMaterieGeneratorStrategy.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/strategies/SheetMaterieGeneratorStrategy.ts): Genera fogli di calcolo per il recupero delle carenze scolastiche.
- [src/application/strategies/VerbaleGeneratorStrategy.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/strategies/VerbaleGeneratorStrategy.ts): Strategia dedicata alla stesura automatica del verbale del consiglio di classe.

#### Sotto-cartella: `src/application/services/`

Servizi applicativi che orchestrano e avviano le operazioni di business.

- [src/application/services/AggregatoreDati.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/AggregatoreDati.ts): Raggruppa e aggrega dati sparsi su diverse tabelle per supportare reportistiche avanzate.
- [src/application/services/CattedraResolver.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/CattedraResolver.ts): Implementa la logica di business per stabilire il docente effettivo risolvendo le supplenze e le variazioni temporali.
- [src/application/services/DocumentBatchService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/DocumentBatchService.ts): Gestisce l'avvio e la ripresa massiva dei processi di generazione documenti mediante la persistenza a blocchi di `JobRunnerLib`.
- [src/application/services/DocumentGenerationService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/DocumentGenerationService.ts): Avvia e coordina la pipeline di generazione per un singolo documento.
- [src/application/services/EmailBatchService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/EmailBatchService.ts): Coordina l'invio massivo asincrono delle email sfruttando `JobRunnerLib` per eludere il time limit di GAS.
- [src/application/services/EmailNotificationService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/EmailNotificationService.ts): Gestisce il flusso per la composizione e l'invio di una singola notifica email.
- [src/application/services/EmailRetryService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/EmailRetryService.ts): Cerca i tentativi di invio email falliti nei log e ne riesegue la spedizione.
- [src/application/services/ImportService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/ImportService.ts): Servizio che avvia e controlla l'importazione di file esterni nel database di fogli di calcolo.
- [src/application/services/ReportService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/ReportService.ts): Genera e aggiorna i fogli e i prospetti riepilogativi ad uso amministrativo.
- [src/application/services/RisolutoreRuoliService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/services/RisolutoreRuoliService.ts): Risolve indirizzi email per ruoli speciali o cariche d'istituto (es. coordinatori di classe o DS).

#### Sotto-cartella: `src/application/storico/`

Logica e astrazioni per interrogare ed elaborare archivi di anni scolastici passati.

- [src/application/storico/LazyRef.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/storico/LazyRef.ts): Wrapper lazy-loading per connessioni a database storici.
- [src/application/storico/reconcileSigla.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/storico/reconcileSigla.ts): Utility per uniformare sigle e codici di classi o materie cambiati nel corso degli anni.
- [src/application/storico/StoricoAlunniService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/storico/StoricoAlunniService.ts): Ricerca della carriera scolastica e dei passaggi degli alunni negli anni passati.
- [src/application/storico/StoricoClassiService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/storico/StoricoClassiService.ts): Fornisce configurazioni e compagini dei vecchi consigli di classe.
- [src/application/storico/StoricoDatabaseProvider.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/storico/StoricoDatabaseProvider.ts): Risolve la connessione fisica ai fogli di calcolo corrispondenti agli archivi storici.
- [src/application/storico/StoricoDocentiService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/storico/StoricoDocentiService.ts): Interroga lo storico dei contratti e dell'insegnamento per singoli docenti.
- [src/application/storico/StoricoDocumentiService.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/application/storico/StoricoDocumentiService.ts): Recupera log e metadati di verbali o pagelle emessi in sessioni scolastiche chiuse.

---

### Folder: `src/infrastructure/`

Contiene le implementazioni concrete delle interfacce definite nel dominio e i moduli di integrazione con i servizi Google (facciate) ed il database.

#### Sotto-cartella: `src/infrastructure/db/`

- [src/infrastructure/db/Database.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/db/Database.ts): Interfacce fisiche e query builder di basso livello per l'interazione con le tabelle virtuali.
- [src/infrastructure/db/SheetDbAdapter.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/db/SheetDbAdapter.ts): L'adattatore concreto che mappa l'ORM `SheetDBLib` sull'interfaccia di persistenza dell'applicazione.

#### Sotto-cartella: `src/infrastructure/facades/`

Implementa le facciate (Pattern Facade) per isolare l'applicazione dall'uso diretto delle API native di Google Apps Script (permettendo anche il mocking nei test).

- [src/infrastructure/facades/ActiveUserFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/ActiveUserFacade.ts): Recupera in sicurezza l'email dell'utente attivo connesso al foglio di calcolo.
- [src/infrastructure/facades/DocumentTableFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/DocumentTableFacade.ts): Fornisce metodi helper per inserire, formattare o eliminare tabelle complesse all'interno di Google Docs.
- [src/infrastructure/facades/DriveServiceFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/DriveServiceFacade.ts): Incapsula la gestione dei file, la creazione di cartelle nidificate e l'assegnazione granulare dei permessi Drive (ACL).
- [src/infrastructure/facades/ExpressionEngineFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/ExpressionEngineFacade.ts): Valuta stringhe di condizioni booleane mediante `GasExpressionEngineLib` per stabilire l'applicabilità di regole di business.
- [src/infrastructure/facades/GmailServiceFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/GmailServiceFacade.ts): Gestisce la formattazione dei messaggi MIME e l'invio protetto delle email tramite GmailApp.
- [src/infrastructure/facades/ProcessMonitorFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/ProcessMonitorFacade.ts): Comunica l'avanzamento dei processi batch e i log alla sidebar HTML monitorata dall'utente.
- [src/infrastructure/facades/PropertiesFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/PropertiesFacade.ts): Interfaccia per il salvataggio permanente dello stato del runner tramite `PropertiesService` di GAS.
- [src/infrastructure/facades/TemplateEngineFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/TemplateEngineFacade.ts): Elabora e compila stringhe, file Docs o fogli Sheets compilando i tag placeholder con i dati reali estratti dal CDU.
- [src/infrastructure/facades/UiFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/facades/UiFacade.ts): Gestisce interazioni UI native (alert, prompt di testo, messaggi di caricamento, sidebar).

#### Sotto-cartella: `src/infrastructure/repositories/`

Contiene le classi repository concrete che leggono e scrivono dati sulle rispettive tabelle di Google Sheets. Ciascun file implementa la logica di persistenza per una specifica entità.

- [src/infrastructure/repositories/AlunnoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/AlunnoRepository.ts)
- [src/infrastructure/repositories/CarenzaRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/CarenzaRepository.ts)
- [src/infrastructure/repositories/ClasseRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/ClasseRepository.ts)
- [src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts)
- [src/infrastructure/repositories/ConfigurazioneEmailRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/ConfigurazioneEmailRepository.ts)
- [src/infrastructure/repositories/ConfigurazioneImportRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/ConfigurazioneImportRepository.ts)
- [src/infrastructure/repositories/DipartimentoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/DipartimentoRepository.ts)
- [src/infrastructure/repositories/DocenteRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/DocenteRepository.ts)
- [src/infrastructure/repositories/IndirizzoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/IndirizzoRepository.ts)
- [src/infrastructure/repositories/LogCartellaRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/LogCartellaRepository.ts)
- [src/infrastructure/repositories/LogDocumentoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/LogDocumentoRepository.ts)
- [src/infrastructure/repositories/LogEmailRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/LogEmailRepository.ts)
- [src/infrastructure/repositories/MasterSheetRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/MasterSheetRepository.ts)
- [src/infrastructure/repositories/MateriaRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/MateriaRepository.ts)
- [src/infrastructure/repositories/MovimentoAlunnoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/MovimentoAlunnoRepository.ts)
- [src/infrastructure/repositories/OreASLRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/OreASLRepository.ts)
- [src/infrastructure/repositories/PianoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/PianoRepository.ts)
- [src/infrastructure/repositories/ProgettoRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/ProgettoRepository.ts)
- [src/infrastructure/repositories/RuoloSpecialeRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/RuoloSpecialeRepository.ts)
- [src/infrastructure/repositories/SupplenzaRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/SupplenzaRepository.ts)
- [src/infrastructure/repositories/VariazioneCattedraRepository.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/repositories/VariazioneCattedraRepository.ts)

#### Sotto-cartella: `src/infrastructure/services/`

- [src/infrastructure/services/AlberoCartelle.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/services/AlberoCartelle.ts): Algoritmo per risolvere la gerarchia ad albero delle cartelle Drive, creando o riciclando cartelle e tracciando i percorsi su `LOG_FOLD`.

#### Sotto-cartella: `src/infrastructure/steps/`

Definisce le classi per i singoli step di elaborazione sequenziale delle pipeline di documenti ed email.

- [src/infrastructure/steps/documentSteps.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/steps/documentSteps.ts): Step per la pipeline dei documenti (selezione e clonazione template, rendering, condivisione permessi, salvataggio e log).
- [src/infrastructure/steps/emailSteps.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/steps/emailSteps.ts): Step per la pipeline delle email (risoluzione destinatari, calcolo condizioni, composizione moduli, invio effettivo e tracciamento).
- [src/infrastructure/steps/postProcessActions.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/infrastructure/steps/postProcessActions.ts): Azioni post-processo eseguite al termine delle pipeline (es. marcare lo stato `NOTIFICATO` per determinati record).

---

### Folder: `src/onlinetests/`

Contiene il framework e i test dedicati alla validazione live dell'applicazione nell'ambiente reale di Google Apps Script (in-cloud smoke tests).

- [src/onlinetests/index.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/onlinetests/index.ts): Il modulo di avvio e orchestratore dei test online.
- [src/onlinetests/OnlineTestReport.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/onlinetests/OnlineTestReport.ts): Raccoglie i risultati dei test ed elabora report HTML di successo/errore da visualizzare nell'interfaccia.
- [src/onlinetests/GasSampleSpreadsheetFactory.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/onlinetests/GasSampleSpreadsheetFactory.ts): Genera dinamicamente fogli di calcolo fisici temporanei su Drive per eseguire i test in isolamento.
- [src/onlinetests/SampleDatabaseBuilder.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/onlinetests/SampleDatabaseBuilder.ts): Popola il foglio temporaneo creato con dati coerenti di test (classi, docenti, materie) mimando il DB reale.

#### Sotto-cartella: `src/onlinetests/checks/`

- [src/onlinetests/checks/contextEngineChecks.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/onlinetests/checks/contextEngineChecks.ts): Verifica il corretto assemblaggio del CDU su fogli live.
- [src/onlinetests/checks/pipelineChecks.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/onlinetests/checks/pipelineChecks.ts): Valida l'esecuzione reale delle pipeline dei documenti e delle email.
- [src/onlinetests/checks/repositoryChecks.ts](file:///home/giulio/Desktop/ALDO%20implementing/src/onlinetests/checks/repositoryChecks.ts): Esegue e verifica le query complesse di tutti i repository scolastici.

---

## 2. Directory: `test/`

Contiene l'intera infrastruttura di test automatici offline eseguiti via Jest.

### Sotto-cartella: `test/setup/`

- [test/setup/load-gaslibs.cjs](file:///home/giulio/Desktop/ALDO%20implementing/test/setup/load-gaslibs.cjs): Carica i globali e simula l'ambiente Google Apps Script caricando la libreria precompilata `vendor/gaslibs.Code.js`.

### Sotto-cartella: `test/fixtures/`

- [test/fixtures/tables.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fixtures/tables.ts): Dati statici preconfigurati e tabelle mock in formato JS per popolare il database nei test unitari.

### Sotto-cartella: `test/fakes/`

Contiene le implementazioni mock/finto delle facciate infrastrutturali per velocizzare e isolare i test offline.

- [test/fakes/FakeDatabase.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fakes/FakeDatabase.ts): Simula un foglio di calcolo Google Sheets interamente in memoria a partire da tabelle in formato CSV/JS.
- [test/fakes/FakeDriveFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fakes/FakeDriveFacade.ts): Simula le interazioni con i file ed i permessi di Google Drive in memoria.
- [test/fakes/FakeGmailFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fakes/FakeGmailFacade.ts): Simula l'invio delle email registrando gli invii in una lista interna ispezionabile nei test.
- [test/fakes/FakeProcessMonitor.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fakes/FakeProcessMonitor.ts): Simula la barra di progresso e memorizza gli step eseguiti per asseverarli.
- [test/fakes/FakePropertiesFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fakes/FakePropertiesFacade.ts): Mantiene le proprietà di script in una mappa JS interna.
- [test/fakes/FakeTemplateEngine.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fakes/FakeTemplateEngine.ts): Mappa sostituzioni semplici di testi ed espansione tabelle per validare il rendering in locale.
- [test/fakes/FakeUiFacade.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/fakes/FakeUiFacade.ts): Intercetta alert e prompt utente, consentendo risposte mockate programmabili.

### Sotto-cartella: `test/build/`

- [test/build/online-mode.smoke.test.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/build/online-mode.smoke.test.ts): Valida la configurazione di build e verifica che l'output generato per la modalità online includa i moduli corretti.

### Sotto-cartella: `test/integration/`

Test di integrazione offline che verificano l'esecuzione coordinata di più componenti (servizi, passi di pipeline, repository) usando il database finto `FakeDatabase`.

- [test/integration/smoke.test.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/integration/smoke.test.ts): Test generico di caricamento e inizializzazione del sistema.
- [test/integration/notifica-email.test.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/integration/notifica-email.test.ts): Valida il flusso completo di elaborazione e spedizione delle notifiche email (es. notifiche carenze).
- [test/integration/verbale-cdc.test.ts](file:///home/giulio/Desktop/ALDO%20implementing/test/integration/verbale-cdc.test.ts): Verifica l'assemblaggio del CDU e la generazione del verbale del CDC.

### Sotto-cartella: `test/unit/`

Test unitari atomici e isolati per verificare le singole classi o funzioni logiche dell'applicazione.

#### Sotto-cartella: `test/unit/domain/`

Test per verificare la validità dei Value Object, delle entità e delle specifiche logiche.

- `alunni-attivi-spec.test.ts`, `anno-corso.test.ts`, `anno-scolastico.test.ts`, `consiglio-di-classe.test.ts`, `drive-ids.test.ts`, `entities.test.ts`, `enums.test.ts`, `identifiers.test.ts`, `supplenza-vos.test.ts`, `valore-carenza.test.ts`.

#### Sotto-cartella: `test/unit/application/`

Test per validare i casi d'uso, i provider dati del CDU e i servizi applicativi.

- `aggregatore-dati.test.ts`, `cattedra-resolver.test.ts`, `custom-source-strategies.test.ts`, `document-batch-service.test.ts`, `document-generation-service.test.ts`, `documento-con-tabelle-generator.test.ts`, `elenco-materie-con-permessi.test.ts`, `email-batch-service.test.ts`, `email-boxes.test.ts`, `email-notification-service.test.ts`, `email-retry-service.test.ts`, `email-saluto.test.ts`, `generator-strategies.test.ts`, `import-recipe-mapper.test.ts`, `import-service.test.ts`, `report-service.test.ts`, `risolutore-ruoli-service.test.ts`, `sheet-materie-generator.test.ts`, `storico-services.test.ts`.
- **Sotto-cartella `context-engine/`**: `alunno-provider.test.ts`, `builder-istituto.test.ts`, `cdc-filtrato.test.ts`, `classe-provider.test.ts`, `consiglio-provider.test.ts`, `documenti-carenzafocus.test.ts`, `recipes-e2e.test.ts`, `studenti-provider.test.ts`, `swap-supplenti.test.ts`.

#### Sotto-cartella: `test/unit/infrastructure/`

Test per verificare repository, facciate esterne, adattatori del database e step di pipeline.

- `albero-cartelle.test.ts`, `alunno-repository.test.ts`, `carenza-repository.test.ts`, `classe-articolazione.test.ts`, `classe-cattedre.test.ts`, `classe-repository.test.ts`, `config-repositories.test.ts`, `dipartimento-repository.test.ts`, `docente-repository.test.ts`, `document-steps.test.ts`, `document-table-facade.test.ts`, `drive-facade.test.ts`, `email-steps.test.ts`, `expression-engine.test.ts`, `fake-database.test.ts`, `fake-facades.test.ts`, `gmail-facade.test.ts`, `indirizzo-repository.test.ts`, `log-repositories.test.ts`, `master-sheet-repository.test.ts`, `materia-repository.test.ts`, `movimento-alunno-repository.test.ts`, `oreasl-repository.test.ts`, `persistence-composite.test.ts`, `persistence-save.test.ts`, `persistence-writes.test.ts`, `piano-repository.test.ts`, `pipeline-framework.test.ts`, `post-process-actions.test.ts`, `progetto-repository.test.ts`, `properties-facade.test.ts`, `repository-query-pushdown.test.ts`, `ruolo-speciale-repository.test.ts`, `sheetdb-adapter.test.ts`, `supplenza-repository.test.ts`, `template-engine-facade.test.ts`, `ui-facade.test.ts`, `variazione-cattedra-repository.test.ts`.

#### Sotto-cartella: `test/unit/onlinetests/`

Test per convalidare i moduli che compongono l'ambiente di test live.

- `context-engine-checks.test.ts`, `index.test.ts`, `online-test-report.test.ts`, `pipeline-checks.test.ts`, `repository-checks.test.ts`, `sample-database-builder.test.ts`.

#### Sotto-cartella: `test/unit/presentation/`

- `menu.test.ts`: Test unitari sulla costruzione del menu del foglio di calcolo.

#### Sotto-cartella: `test/unit/harness/`

- `gaslibs.test.ts`: Test di integrità dell'harness di esecuzione offline delle librerie esterne.

---

## 3. Directory: `scripts/`

Contiene script Node.js per build, vendor sync e convalida.

- [scripts/build-and-prepare.cjs](file:///home/giulio/Desktop/ALDO%20implementing/scripts/build-and-prepare.cjs): Gestisce il processo di compilazione Webpack e l'applicazione di patch di compatibilità V8 specifiche per GAS. Supporta diverse modalità: `testing`, `production`, `online` e `testoffline`.
- [scripts/refresh-vendor.cjs](file:///home/giulio/Desktop/ALDO%20implementing/scripts/refresh-vendor.cjs): Copia e prepara la build precompilata aggiornata delle librerie da `GasLibraryFactory` nella cartella `vendor/` locale.
- [scripts/verify-vendor.cjs](file:///home/giulio/Desktop/ALDO%20implementing/scripts/verify-vendor.cjs): Effettua un controllo dell'integrità dei moduli presenti nella directory `vendor/`.

---

## 4. Directory: `types/`

- [types/gaslibs/index.d.ts](file:///home/giulio/Desktop/ALDO%20implementing/types/gaslibs/index.d.ts): Contiene i tipi globali definiti per le librerie di Apps Script presenti in `vendor/` affinché il compilatore TS possa validarne le chiamate a runtime.

---

## 5. File di Configurazione della Root

- [appsscript.json](file:///home/giulio/Desktop/ALDO%20implementing/appsscript.json): Manifest ufficiale di configurazione per il progetto Google Apps Script (impostazioni V8 runtime, librerie dipendenti, permessi di autorizzazione OAuth scope).
- [babel.config.cjs](file:///home/giulio/Desktop/ALDO%20implementing/babel.config.cjs): Configurazione di Babel per la transpilazione del bundle JavaScript di output (Code.js) in codice ES compatible con il motore GAS V8 (Chrome 80).
- [eslint.config.js](file:///home/giulio/Desktop/ALDO%20implementing/eslint.config.js): Regole di linting del progetto. Include restrizioni per evitare la chiamata diretta dei globali di Apps Script al di fuori delle facciate abilitate.
- [tsconfig.eslint.json](file:///home/giulio/Desktop/ALDO%20implementing/tsconfig.eslint.json): Estensione di configurazione del compilatore TypeScript utilizzata specificamente dall'ambiente ESLint/IDE.
- [webpack.config.cjs](file:///home/giulio/Desktop/ALDO%20implementing/webpack.config.cjs): Configurazione di Webpack per l'impacchettamento del codice TypeScript e dei relativi file correlati in singoli bundle pronti all'esecuzione in Google Workspace.
- [jest.config.cjs](file:///home/giulio/Desktop/ALDO%20implementing/jest.config.cjs): Configurazione principale per l'esecuzione dei test unitari tramite Jest.
- [jest.integration.config.cjs](file:///home/giulio/Desktop/ALDO%20implementing/jest.integration.config.cjs): Configurazione Jest specifica per i test di integrazione offline.
- [jest.build.config.cjs](file:///home/giulio/Desktop/ALDO%20implementing/jest.build.config.cjs): Configurazione Jest per validare la correttezza del build bundle finale.
- [CLAUDE.md](file:///home/giulio/Desktop/ALDO%20implementing/CLAUDE.md): File di istruzioni specifiche del progetto, comandi di build/test e linee guida di programmazione.
- [GEMINI.md](file:///home/giulio/Desktop/ALDO%20implementing/GEMINI.md): File delle preferenze e vincoli dello sviluppatore AI relativi a questa sessione (es. l'obbligo di preferire `GasLibraryFactory` ed il divieto di reinventare codice di libreria).
