# ESTENDI_GEN_DOC_SEND_EMAIL — Estensione Generazione Documenti e Invio Email

Questo documento specifica le motivazioni e gli obiettivi per l'estensione del sistema SGSA (ALDO) con:
1. La generazione documenti per Dipartimento (`PER_DIPARTIMENTO`).
2. Il processo email per Capo Dipartimento (`PER_CAPO_DIPARTIMENTO`).
3. La gestione di default delle sezioni condizionali nei Google Docs.

---

## 1. Generatore Documenti `PER_DIPARTIMENTO`

### Perché è necessario

Attualmente il motore di generazione documenti (`CONF_DOC`) opera principalmente su due livelli di aggregazione:

1. **Livello Classe / CDC**: Verbali dei consigli di classe, fogli materie, griglie valutative.
2. **Livello Alunno**: Piani Didattici Personalizzati (PDP, PEI, PFP).

Tuttavia nella gestione scolastica quotidiana molte attività ufficiali e amministrative avvengono a livello di **Dipartimento Disciplinare** (es. Dipartimento di Lettere, Dipartimento di Matematica e Fisica). Attualmente non esiste un iteratore di batch che consenta di produrre automaticamente documenti dipartimentali.

Senza questa funzionalità:
- La redazione dei **Verbali delle Riunioni di Dipartimento** avviene manualmente.
- I dati relativi al Capo Dipartimento, alle materie afferenti e ai docenti vanno copiati in modo ridondante, aumentando il rischio di errore e rendendo il processo non scalabile.

### Obiettivo da ottenere

1. **CDU Dipartimentale**: Estendere il `ContextEngine` definendo una ricetta e un provider per assemblare il CDU di Dipartimento (`focus.dipartimento`), contenente:
   - Anagrafica del dipartimento (`id`, `nome`).
   - Dati del Capo Dipartimento (`capo.email`, `capo.nomeCompleto`, `capo.appellativo`).
   - Elenco delle materie afferenti al dipartimento (`materie: [{ id, nome, sintesi }]`).
   - Elenco di tutti i docenti afferenti con relative cattedre e classi assegnate, risolti tramite `RoleResolutionLib` con la gerarchia Supplenze → VariazioniCattedra → Classi.
2. **Supporto in `CONF_DOC`**: Il batch di generazione (`DocumentBatchService`) deve poter iterare sulle righe di `DIPART` analogamente a come oggi itera sulle classi attive, così da consentire la generazione massiva di documenti dipartimentali (es. `VERBALE_DIPARTIMENTO`, `PROGRAMMAZIONE_DIPARTIMENTALE`, `GRIGLIA_VALUTAZIONE_MATERIA`).
3. **Integrazione Cartelle e Permessi**: I documenti generati per dipartimento devono essere salvati nelle cartelle Drive di dipartimento configurabili via `CONF_DOC.PATH_OUT` con placeholder dipartimentali (es. `{{focus.dipartimento.nome}}`), registrandosi in `LOG_DOCS` e `LOG_FOLD` come qualsiasi altro documento data-driven.

---

## 2. Processo Invio Email `PER_CAPO_DIPARTIMENTO` e `PER_DIPARTIMENTO`

### Perché è necessario

Il motore di notifica email (`CONF_MAIL.PROCESSO`) supporta diversi iteratori di destinatari tra cui `PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO` e varianti sulle carenze.

Mancano tuttavia processi per la comunicazione dipartimentale:

- **Comunicazioni riservate ai Capi Dipartimento**: direttive della Dirigenza, solleciti per la trasmissione delle adozioni libri di testo, convocazione riunioni di coordinamento materia.
- **Comunicazioni a tutti i componenti del Dipartimento**: invio dei verbali di dipartimento approvati, circolari disciplinari, modelli di programmazione comuni.

Senza questi processi l'invio richiede la selezione manuale dei destinatari o l'uso di mailing list esterne non sincronizzate con il database di SGSA, violando il principio data-driven del sistema.

### Obiettivo da ottenere

1. **Estensione dell'Enum `ProcessoInvio`** in `src/domain/value-objects/enums.ts`:
   - `PER_CAPO_DIPARTIMENTO`: destinatario principale è l'email indicata in `DIPART.CAPO`.
   - `PER_DIPARTIMENTO`: destinatari sono tutti i docenti titolari/supplenti delle materie afferenti al dipartimento (risolti via `RoleResolutionLib`), di norma uno per email (deduplicati).

2. **Integrazione nella Pipeline Email** (`emailSteps.ts` e `EmailNotificationService.ts`):
   - Mappare `PER_CAPO_DIPARTIMENTO` e `PER_DIPARTIMENTO` alla ricetta CDU dipartimentale nella costante `RECIPE_PER_PROCESSO`.
   - Aggiungere i rispettivi rami nello switch dei destinatari logici in `EmailNotificationService.resolveDestinatari`.
   - La `CONF_MAIL.GESTIONE_ARTICOLAZIONE` non si applica ai processi dipartimentali (non hanno la dimensione classe); il campo viene ignorato su questi valori di PROCESSO.

3. **Box HTML Dedicati** (`boxes.ts`):
   - `BOX_DOCUMENTI_DIPARTIMENTO`: lista link ai Google Docs/Sheets di dipartimento presenti in `LOG_DOCS` filtrati per `TIPO` dipartimentale.
   - Sfruttano la stessa infrastruttura `ComposableContentLib` (L4) dei box esistenti, registrando un `SimpleContentBlock` con il template HTML appropriato.

---

## 3. Gestione di Default delle Sezioni Condizionali nei Google Docs

### Perché è necessario

I modelli di Google Docs usati per Verbali, PDP/PEI/PFP e Documenti di Classe contengono clausole e paragrafi che devono comparire **solo al verificarsi di determinate condizioni di business ricavate dal CDU**. Esempi concreti e frequenti:

| Sezione del Documento | Condizione Richiesta |
| :--- | :--- |
| Paragrafo "Presenza ITP in laboratorio" | `focus.classe.docenti` contiene almeno un ITP |
| Sezione "Misure dispensative (DSA)" | `focus.piano.tipo == 'PDP_DSA'` |
| Sezione "Sostegno individuale (PEI)" | `focus.piano.tipo == 'PEI'` |
| Paragrafo "Classe Articolata — partner" | `focus.classe.isArticolata == true` |
| Sezione "Programmazione Terminale — Esame di Stato" | `focus.classe.isTerminale == true` |

Attualmente la rimozione delle sezioni non applicabili **non è implementata** (nota esplicita in `VerbaleGeneratorStrategy.ts` righe 9-11: `"Articulated-class section removal … not yet implemented"`). Questo produce modelli con paragrafi vuoti, seczioni non pertinenti o layout rotti, richiedendo un intervento manuale su ogni documento generato.

Il problema cresce con il numero di tipologie di documenti e la varietà delle classi gestite.

### Obiettivo da ottenere

Rendere la rimozione delle sezioni condizionali una funzionalità **abilitata di default** in ogni compilazione Google Doc del sistema, senza richiedere strategy dedicate né configurazioni aggiuntive in `CONF_DOC`.

#### 3.1 Sintassi nei Modelli Google Doc

Supportare nei modelli la sintassi Mustache sezionale nativa, già gestita da `WorkspaceTemplateEngine` (`PlaceholderService.processDocument`):

```
{{#focus.classe.isArticolata}}
Questo paragrafo viene incluso solo se la classe è articolata.
{{/focus.classe.isArticolata}}
```

oppure con la negazione:

```
{{^focus.classe.isTerminale}}
Questo paragrafo viene incluso solo per le classi NON terminali.
{{/focus.classe.isTerminale}}
```

I marcatori di sezione vengono passati nel CDU come booleani o array (Mustache tratta `false`/`null`/array vuoto come sezione falsa). Non è necessario inventare nuova sintassi: il CDU già espone `isArticolata`, `isTerminale`, `piani`, `alunniConPdp` come array/booleani nativi.

#### 3.2 Pre-condizione Architetturale

Verificare se `WorkspaceTemplateEngine.PlaceholderService.processDocument` già gestisce i blocchi `{{#cond}}...{{/cond}}` come rimozione strutturale di paragrafi (non solo sostituzione di testo). Se sì:

- La funzionalità è **già disponibile a livello libreria** e l'intervento in ALDO si riduce a passare i valori booleani corretti nel CDU.
- `TemplateEngineFacade.processDocument` non richiede modifiche, ma deve essere verificata l'assenza di trasformazioni del CDU che convertano i booleani in stringhe prima della chiamata alla libreria (perdendo la semantica di sezione).

Se invece `PlaceholderService.processDocument` non rimuove fisicamente i paragrafi (limitandosi a sostituire il testo del placeholder con una stringa vuota), occorre un pre-processing step in `TemplateEngineFacade.processDocument` o in una nuova `DocSectionRemover` facade che:

1. Trova tutti i marcatori `{{#expr}}...{{/expr}}` e `{{^expr}}...{{/expr}}`.
2. Valuta `expr` come percorso CDU tramite `GasExpressionEngineLib`.
3. Rimuove fisicamente i paragrafi del blocco (struttura Google Doc) se la condizione è falsa (o vera per `{{^...}}`).
4. Quindi cede il controllo alla chiamata `processDocument` esistente per le sostituzioni placeholder standard.

#### 3.3 Punto di iniezione in ALDO

Il punto corretto è **`TemplateEngineFacade.processDocument`** in `src/infrastructure/facades/TemplateEngineFacade.ts`: è il singolo ingresso che tutte le strategy (Verbale, DocumentoGenerico, DocPersonalizzato, DocumentoConTabelleImportate) usano per compilare un Google Doc. Centralizzando qui la logica di rimozione sezioni, ogni strategy beneficia automaticamente della funzionalità senza modifiche.

```
VerbaleGeneratorStrategy
DocPersonalizzatoGeneratorStrategy          ───▶  TemplateEngineFacade.processDocument
DocumentoConTabelleImportateGeneratorStrategy       (aggiunge pre-passo sezioni condizionali)
DocumentoGenericoGeneratorStrategy
```

---

## 4. Domande Architetturali Aperte (da Risolvere Prima dell'Implementazione)

Prima di scrivere codice, le seguenti domande devono essere verificate/decise:

| # | Questione | Impatto |
| :--- | :--- | :--- |
| **A** | `WorkspaceTemplateEngine.PlaceholderService.processDocument` già rimuove fisicamente i paragrafi Mustache `{{#cond}}` falsi, o solo sostituisce il testo? | Se già supportato, la feature sezioni condizionali è quasi gratuita. Se non supportato, serve una nuova facade o estensione della libreria. |
| **B** | La ricetta CDU Dipartimentale deve essere definita in `ContextEngine` (lato library) o solo come recipe dichiarativa in ALDO? | Determina se serve un'estensione di `GasLibraryFactory` o solo codice ALDO-local. |
| **C** | `DocumentBatchService` deve accettare iterazione su `DIPART` direttamente, o è necessario un `DipartimentoBatchService` separato? | Dipende da quanto la logica di batch dipartimentale differisce da quella sulle classi (es. non c'è `GESTIONE_ARTICOLAZIONE`, i criteri di filtro batch cambiano). |
| **D** | I due nuovi `ProcessoInvio` devono iterare per singolo dipartimento (un'email per dipartimento) o per singolo docente aggregando tutti i dipartimenti? | Determina il loop esterno del batch email. |

---

## 5. Riepilogo dei File di Progetto Coinvolti

| Ambito | File | Intervento |
| :--- | :--- | :--- |
| **Enum & Dominio** | `src/domain/value-objects/enums.ts` | Aggiunta `PER_CAPO_DIPARTIMENTO`, `PER_DIPARTIMENTO` in `ProcessoInvio`. |
| **Facade Template** | `src/infrastructure/facades/TemplateEngineFacade.ts` | Pre-passo rimozione sezioni condizionali in `processDocument`. |
| **Pipeline Email** | `src/application/pipelines/emailSteps.ts` | Mappatura ricette CDU e risoluzione destinatari dipartimentali. |
| **Servizio Email** | `src/application/services/EmailNotificationService.ts` | Rami `PER_CAPO_DIPARTIMENTO` / `PER_DIPARTIMENTO` nel dispatch. |
| **Context Engine** | `src/application/context-engine/` | Recipe + provider per il CDU Dipartimento. |
| **Box Email** | `src/application/email/boxes.ts` | `BOX_DOCUMENTI_DIPARTIMENTO`. |
| **Batch** | `src/application/services/DocumentBatchService.ts` o nuovo `DipartimentoBatchService.ts` | Iterazione su `DIPART` invece che su `CLASSI`. |
| **Spec Database** | `SPECS_ALDO/01_SCHEMA_DATABASE.md` | Nessuna modifica allo schema fisico (DIPART e CONF_DOC/CONF_MAIL già supportano l'estensione). |
