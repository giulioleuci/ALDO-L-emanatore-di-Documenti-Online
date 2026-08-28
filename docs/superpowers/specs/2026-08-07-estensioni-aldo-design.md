# Estensioni ALDO (4 richieste in `ESTENSIONI_ALDO/`)

Spec unica per le 4 estensioni richieste, in ordine di implementazione
concordato (dal più piccolo al più grande). Ogni sezione è indipendente e
può essere implementata, testata e mergiata separatamente; l'ordine dei
task nel piano seguirà questo stesso ordine.

Verificato contro lo stato attuale del codice via `codebase-memory-mcp`
prima di progettare (vedi note "Stato attuale" in ciascuna sezione) — non
si riparte da zero dove esiste già copertura.

---

## 1. Placeholder `progressivo` nel CDU

Fonte: `ESTENSIONI_ALDO/AGGIUNGERE_PROGRESSIVO_CDU.md`.

### Stato attuale

Niente di questo esiste oggi. Il design della fonte combacia con
l'architettura corrente (`PrepareInfrastructureStep`, `IDriveFacade`) quasi
lettera per lettera.

### Obiettivo

Esporre nel CDU il numero progressivo del documento generato all'interno
della cartella di destinazione Drive: `(file già presenti) + 1`. Accessibile
sia come `meta.progressivo` sia come alias di radice `progressivo`, per uso
sia in `CONF_DOC.FILE_NAME` sia nel corpo del modello Google Doc/Sheet.

Calcolato sempre, ad ogni generazione, indipendentemente dal fatto che il
placeholder sia effettivamente usato (deciso esplicitamente: non esiste un
modo a costo zero di rilevare l'uso nel corpo del Doc — un controllo sul
corpo costerebbe quanto la chiamata stessa; un controllo sulle sole stringhe
`PATH_OUT`/`FILE_NAME`, per quanto gratuito, lascerebbe scoperto l'uso
esclusivamente nel corpo, che è il caso d'uso documentato nell'esempio
originale).

### Progetto

- `IDriveFacade` (`src/infrastructure/facades/DriveServiceFacade.ts`): nuovo
  metodo `countFilesInFolder(folderId: string): number`. Implementazione in
  `DriveServiceFacade` via `this.drive.searchFiles(query)` (stesso pattern di
  `findFolderByPath`/`findFileByName`, già nel file), query
  `'<folderId>' in parents and mimeType != '<FOLDER_MIME>' and trashed=false`.
- `Cdu.ts`: `progressivo?: number` aggiunto sia a `CduMeta` sia alla radice di
  `Cdu` (alias, Principio 6 — valore usato fuori dai loop, budget ≤4
  segmenti). Niente cast `as unknown as Record<string, unknown>`: l'interfaccia
  resta tipizzata come il resto del CDU.
- `PrepareInfrastructureStep._executeLogic` (`documentSteps.ts`): subito dopo
  aver risolto `destFolderId`, chiama `countFilesInFolder`, assegna
  `count + 1` sia a `cduObj.meta.progressivo` sia a `cduObj.progressivo`.
  Nessun riordino di step necessario: `PrepareInfrastructureStep` è già
  eseguito prima di `GenerateNameStep`/`RenderTemplateStep` nella pipeline
  esistente (`DocumentGenerationService.buildPipeline`).
- `SPECS_ALDO/02_CDU_STRUTTURA.md`: documentare `meta.progressivo` nella
  sezione `meta`, coerente con quanto già descritto per gli altri campi.

### Verifica

- Unit test `DriveServiceFacade.countFilesInFolder`: verifica la query
  (esclude cartelle e file cestinati) e il conteggio del risultato.
- Unit test `PrepareInfrastructureStep`: `IDriveFacade` stub restituisce 3 →
  `cdu.meta.progressivo === 4` e `cdu.progressivo === 4`.
- Estendere un test di integrazione pipeline esistente per verificare che sia
  `FILE_NAME` sia il corpo renderizzato contengano il progressivo corretto.

---

## 2. CDU rappresentanti genitori con nome figlio

Fonte: `ESTENSIONI_ALDO/ESTENDI_CDU_RAPPRESENTANTI_GENITORI_CON_NOME_FIGLIO.md`.

### Stato attuale

`RappresentantiProvider` esiste già e produce `focus.classe.rappresentanti.
{studenti,genitori}` per classi ordinarie/partner e per il parent
articolato. Manca solo `studente.nomeCompleto` su ciascun elemento di
`genitori` — il resto della fonte (struttura, entrambi i rami classe
parent/ordinaria) è già implementato identico a quanto richiesto.

### Obiettivo

Permettere `{{studente.nomeCompleto}}` dentro un `tablerow_loop` su
`focus.classe.rappresentanti.genitori`, per costruire tabelle a due righe
(studenti rappresentanti / genitori) che distinguono i ruoli.

### Progetto

- `Cdu.ts`: il tipo dell'elemento di `rappresentanti.genitori` guadagna
  `studente?: { nomeCompleto: string }` (già presente per il ramo parent
  nella fonte; da allineare anche nel tipo TypeScript se non già coerente).
- `RappresentantiProvider.provide` (`src/application/context-engine/
  providers/RappresentantiProvider.ts`):
  - Ramo classi parent articolate (righe ~90-120): già imposta
    `studente: { nomeCompleto: alunno.cognomeNome }` — nessuna modifica.
  - Ramo classi ordinarie/partner (righe ~123-134): il `.map()` su
    `getRappresentanteGenitore()` produce solo `{ nomeCompleto }`; va esteso
    a `{ nomeCompleto, studente: { nomeCompleto: a.cognomeNome } }`,
    mantenendo il filtro esistente su stringa non vuota.

### Verifica

- Estendere `test/unit/application/context-engine/providers/
  rappresentanti-provider.test.ts` (o percorso equivalente) con
  un'asserzione su `studente.nomeCompleto` per il ramo classi ordinarie.
- `npm run typecheck` per l'estensione del tipo.

---

## 3. Generatore `DOCUMENTO_DOCENTE_CLASSE_MATERIA`

Fonte: `ESTENSIONI_ALDO/CREA_GENERATORE_DOCENTE_MATERIA.md`.

### Stato attuale — correzione architetturale rispetto alla fonte

La fonte propone una `Strategy` che itera materie/docenti e chiama
`templates.processDocument(fileId, ...)` più volte **sullo stesso file già
clonato**. Verificato contro il codice: la pipeline attuale
(`DocumentGenerationService.generateForClasse`) clona **un solo file per
esecuzione**; chiamare `processDocument` più volte sullo stesso `fileId`
sovrascriverebbe lo stesso Google Doc N volte, producendo un solo file con
i dati dell'ultima materia anziché N file distinti (uno per materia/docente,
come richiesto dall'obiettivo stesso della fonte).

Il pattern corretto esiste già nel codebase per `PIANO_PERS`: `Document
BatchService.generatePiani` enumera coppie (alunno, piano) e chiama
`DocumentGenerationService.generateForPiano`, che esegue una pipeline
**completa e separata** per ciascun target (proprio clone, proprio nome,
propria riga `LOG_DOCS`). `DOCUMENTO_DOCENTE_CLASSE_MATERIA` replica questo stesso
schema. Non serve nessuna nuova classe `Strategy`: la resa è delega diretta
a `templates.processDocument(fileId, cdu)`, identica a `VerbaleGenerator
Strategy`/`DocumentoGenericoGeneratorStrategy` — basta che il CDU porti il
focus giusto.

### Obiettivo

Generare un documento distinto per ogni coppia materia/docente del
consiglio di classe (Programmi Svolti, Relazioni Finali, Programmazioni),
100% data-driven via una riga `CONF_DOC` per tipo di documento, senza nuove
classi Strategy per ogni tipo.

### Progetto

- `CONF_DOC.TIPO = 'DOCUMENTO_DOCENTE_CLASSE_MATERIA'`: nuovo valore riservato,
  discriminatore dell'asse di batch (stesso meccanismo di `PIANO_PERS`, che
  `batchGenerateHandler` già riconosce oggi via `config.tipo`).
  `CONF_DOC.GENERATORE` resta `DOCUMENTO_GENERICO` — invariato, nessuna
  nuova Strategy.
- `Recipe.ts`:
  - `BuildParams.docenteCorrente?: string | null` — nuovo campo, sorella di
    `materiaCorrente` già esistente (già usato altrove per instradamento di
    ruolo, es. `RisolutoreRuoliService.capoDipartimento`).
  - Nuova recipe `CLASSE_DOCENTE_MATERIA` = provider di `CLASSE_COMPLETA`
    + `'docenteClasseMateriaFocus'` in coda (dopo `consiglio`, di cui dipende).
- Nuovo `src/application/context-engine/providers/
  DocenteClasseMateriaFocusProvider.ts` (mirror di `PianoFocusProvider`): legge
  `cdu.focus.classe.consiglioDiClasse` (già popolato dal provider
  `consiglio` — nessuna nuova query), trova il `DocenteCdcVM` con email =
  `params.docenteCorrente`, poi il `SubjectVM` al suo interno con id =
  `params.materiaCorrente`; imposta `cdu.focus.docente` (il `PersonVM`
  dell'`anagrafica` del docente) e `cdu.focus.materia` (il `SubjectVM`
  trovato). Errore esplicito (`PipelineError`) se non trovati, come
  `PianoFocusProvider`.
- `Cdu.ts`: `focus.docente?: PersonVM` e `focus.materia?: SubjectVM` accanto
  a `classe`/`alunno`/`carenza`/`piano`.
- `DocumentGenerationService.ts`:
  - Estrarre da `generateForClasse` il blocco condiviso
    (risoluzione classe/articolazione/`classiCompetenza` + build CDU +
    `beginTransaction`/`buildPipeline().execute`/commit-rollback) in un
    metodo privato parametrizzato su nome recipe + `BuildParams` extra, così
    da non duplicarlo.
  - Nuovo metodo pubblico `generateForClasseDocenteClasseMateria(classeId,
    docenteEmail, materiaId, confDocId, jobId?)` che usa l'helper con la
    recipe `CLASSE_DOCENTE_MATERIA` e
    `{ docenteCorrente: docenteEmail, materiaCorrente: materiaId }`.
- `DocumentBatchService.ts`:
  - Nuovo generatore privato `generateDocentiClasseMateria` (mirror di
    `generatePiani`): target = per ogni classe attiva (filtrata per
    `gestioneArticolazione` come `generateClassi`), per ogni cattedra di
    `this.classi.getConsiglioDiClasse(classe.classeId).cattedre`
    (repository-level, nessun CDU necessario per enumerare) → `{classe,
    docenteEmail, materiaId}`.
  - `batchGenerateHandler`: nuovo ramo `config.tipo ===
    'DOCUMENTO_DOCENTE_CLASSE_MATERIA'` → `generateDocentiClasseMateria`.
  - `BatchResumeState`: nuovo campo `docenteClasseMateriaTargets` (mirror di
    `planTargets`) per la ripresa da checkpoint.
- `documentSteps.ts`: generalizzare `sottotipoPiano(ctx)` in `sottotipo(ctx)`
  (stessi due punti di chiamata, `CheckDuplicatesStep` e
  `RegisterDocumentStep`): ramo `PIANO_PERS` invariato, nuovo ramo
  `DOCUMENTO_DOCENTE_CLASSE_MATERIA` → `` `${materiaId}::${docenteEmail}` `` da
  `cdu.focus.materia?.id`/`cdu.focus.docente?.email`, default `''`
  altrimenti.
- Nessun codice nuovo per `LOG_DOCS.MATERIE`/`.UTENTI`: già completamente
  data-driven via placeholder `{{focus.materia.id}}`/`{{focus.docente.
  email}}` dentro `CONF_DOC.REGISTRA_DOC` (verificato in
  `RegisterDocumentStep`/`resolveLogRegistration`) — è una responsabilità di
  configurazione, non di codice.
- Nota di comportamento (non un gap da chiudere): gli esempi `CONF_DOC`
  della fonte usano `DUPLICAZIONE: PERMESSA`, che fa uscire
  `CheckDuplicatesStep` subito (nessun controllo duplicati) — comportamento
  coerente con "un documento fresco per ogni run", già usato altrove nel
  sistema.

### Verifica

- Unit test `DocenteClasseMateriaFocusProvider`: dato un CDU con
  `consiglioDiClasse` popolato, verifica risoluzione corretta di
  `focus.docente`/`focus.materia` e l'errore quando non trovati.
- Unit test `DocumentGenerationService.generateForClasseDocenteClasseMateria`:
  verifica che la pipeline sia eseguita con la recipe corretta e i
  `BuildParams` giusti.
- Unit test `DocumentBatchService.generateDocentiClasseMateria`: verifica
  enumerazione target (una entry per cattedra), progressione/ripresa da
  checkpoint.
- Unit test `sottotipo(ctx)`: entrambi i rami (`PIANO_PERS` invariato,
  nuovo `DOCUMENTO_DOCENTE_CLASSE_MATERIA`).
- `npm run typecheck` e `npm run lint`.

---

## 4. Documenti/email di Dipartimento + rimozione sezioni condizionali

Fonte: `ESTENSIONI_ALDO/ESTENDI_GEN_DOC_SEND_EMAIL.md`. La fonte stessa pone
4 domande architetturali aperte (§4, A-D) da risolvere prima di scrivere
codice: risolte di seguito.

### Stato attuale

Il layer di dominio Dipartimento **esiste già in gran parte**:
`Dipartimento` (entity, `getCapoEmail`/`getMaterieIds`), `DipartimentoId`,
`DipartimentoRepository`/`IDipartimentoRepository` (solo `findByMateria` —
manca `findAll`), `DocentiPerDipartimentoSpec`, `MateriePerDipartimentoSpec`,
`DocenteRepository.findByDipartimento` (già pronto, 0 chiamanti oggi),
`RisolutoreRuoliService.capoDipartimento` (usa già `materiaCorrente` come
scope — stesso meccanismo riusato nella sezione 3). Mancano: enumerazione
completa dei dipartimenti, il CDU di dipartimento, i due `ProcessoInvio`,
l'asse di batch documenti, il box email, e la rimozione sezioni
condizionali.

### 4.A — Rimozione sezioni condizionali: verificato via sorgente libreria

Letto `WorkspaceTemplateEngine/src/internal/processors-managers/
DocumentProcessorTagScanner.js` (eccezione motivata di CLAUDE.md — i
`DOCS_LIBS` non rispondevano): la rimozione strutturale (cancellazione di
paragrafi) riconosce solo 4 direttive nominate — `tablerow_loop`,
`tablecol_loop`, `bullet_list`, `number_list`. Non esiste rimozione
strutturale generica per `{{#boolCondition}}...{{/boolCondition}}` — il
Mustache a livello di stringa (`processString`) gestisce le sezioni booleane
solo dentro una stringa già unita, non attraverso i confini di paragrafo di
un Google Doc. Il commento in `VerbaleGeneratorStrategy` ("not yet
implemented") è quindi corretto: non è una funzionalità già gratuita.

**Decisione:** estendere `GasLibraryFactory` (non farlo ALDO-local),
seguendo il vincolo GasLibraryFactory-first: `DocumentProcessorTagScanner`/
`DocumentProcessor` guadagnano una quinta direttiva strutturale generica —
blocco `{{#expr}}...{{/expr}}` (e negato `{{^expr}}...{{/expr}}`) dove
`expr` non è una delle 4 parole chiave riservate: viene valutato come
verità del valore risolto nel contesto (stesse regole di truthiness Mustache
già usate per le sezioni testuali — falsy/array vuoto = sezione falsa) e, se
falso, i paragrafi del blocco vengono cancellati strutturalmente; se vero,
vengono rimossi solo i marcatori e il contenuto sopravvive. Lavoro di
libreria: proprio ciclo di test in `GasLibraryFactory` (`npm test`), poi
`npm run refresh:vendor`/`verify:vendor` in ALDO per assorbire il bundle
aggiornato.

Lato ALDO: nessuna modifica a `TemplateEngineFacade.processDocument` oltre
a verificare (test di non regressione) che nessuna trasformazione a monte
converta i booleani del CDU in stringhe prima della chiamata — il percorso
attuale (`HtmlSanitizer.escapeContextDeep`, usato solo da
`processStringEscaped`, non da `processDocument`) già preserva i booleani.

### 4.B — CDU di dipartimento: ALDO-local (già la convenzione)

Nessun provider esistente nel repository vive dentro la libreria
`ContextEngine` (che fornisce solo il motore generico di assemblaggio/
`DependencyResolver`); ogni provider di dominio (`ClasseProvider`,
`PianoFocusProvider`, ecc.) è ALDO-local in `src/application/context-engine/
providers/`. Il CDU di dipartimento segue lo stesso schema, nessuna
eccezione.

### 4.C — Batch documenti: `DocumentBatchService.generateDipartimenti`

Come deciso: nuovo generatore privato nello stesso `DocumentBatchService`
(mirror di `generatePiani`/la nuova `generateDocentiClasseMateria` §3), non un
servizio separato. `CONF_DOC.TIPO = 'DIPARTIMENTO'`, nuovo ramo in
`batchGenerateHandler`.

### 4.D — Granularità email: un invio per dipartimento

Come deciso: loop esterno su `DIPART`, non su docente aggregato — stesso
schema di `targetsPerCdc` (un invio per unità aggregata), CDU con
`focus.dipartimento` singolare.

### Progetto

**Dominio / repository**
- `IDipartimentoRepository`: nuovo `findAll(): Dipartimento[]` (manca
  oggi — unico metodo attuale è `findByMateria`).

**CDU dipartimento**
- `Cdu.ts`: nuovo `focus.dipartimento?: CduDipartimentoFocus` con
  `anagrafica: {id, nome}`, `capo: {email, nomeCompleto, appellativo} |
  null`, `materie: SubjectVM[]`, `docenti: DocenteCdcVM[]`-style (riuso
  delle stesse VM già usate da `consiglio`, non nuovi tipi). `BuildParams.
  tipoTarget` si allarga a `'classe' | 'alunno' | 'dipartimento'`.
- Nuovo `DipartimentoProvider` (context-engine/providers/): dato
  `params.target` (id dipartimento), usa `Dipartimento.getCapoEmail()`/
  `getMaterieIds()` + `RisolutoreRuoliService`/`RoleResolutionLib` per i
  docenti (riuso di `DocenteRepository.findByDipartimento`, già pronto e
  già corretto per "docenti afferenti al dipartimento" — non si costruisce
  una seconda via role-resolution-per-materia parallela, che sarebbe
  duplicazione: la fonte usa "afferenti", che questo metodo già esprime).
- Nuova recipe `DIPARTIMENTO_COMPLETO` = `['school', 'dipartimentoFocus']`
  (nessun bisogno di `class`/`student` — un dipartimento non ha classe).

**Generazione documenti**
- `DocumentGenerationService.generateForDipartimento(dipartimentoId,
  confDocId, jobId?)`: build CDU con `DIPARTIMENTO_COMPLETO`,
  `tipoTarget: 'dipartimento'`, stessa esecuzione pipeline
  transazionale delle altre `generateForX`.
- `DocumentBatchService.generateDipartimenti`: target = `this.dipartimenti.
  findAll()`, mirror strutturale di `generateClassi` (niente
  `gestioneArticolazione`, non applicabile ai dipartimenti — nota esplicita
  già nella fonte).
- `batchGenerateHandler`: ramo `config.tipo === 'DIPARTIMENTO'`.

**Email di dipartimento**
- `ProcessoInvio` (`src/domain/value-objects/enums.ts`): due nuovi valori,
  `PER_CAPO_DIPARTIMENTO`, `PER_DIPARTIMENTO`.
- `EmailNotificationService.ts`:
  - `targetsPerCapoDipartimento()`: per ogni `Dipartimento` con
    `getCapoEmail() !== null`, un `EmailTarget` (`tipoTarget:
    'dipartimento'`, `emails: [capo]`).
  - `targetsPerDipartimento()`: per ogni `Dipartimento`, un `EmailTarget`
    con `emails` = `findByDipartimento(dipartId)` mappato a email,
    deduplicato.
  - `enumerateTargets`: due nuovi case nello switch.
  - `CONF_MAIL.GESTIONE_ARTICOLAZIONE` ignorato per questi due processi
    (nessuna dimensione classe) — stesso schema di `PER_ALUNNO`, che già
    non la usa.
- `emailSteps.ts`: `RECIPE_PER_PROCESSO` guadagna le due nuove chiavi →
  `'DIPARTIMENTO_COMPLETO'`.
- `boxes.ts`: `BOX_DOCUMENTI_DIPARTIMENTO`, stesso schema del box
  `documenti` esistente (`SimpleContentBlock`, `renderDocumentiBox`), dati
  da un nuovo `AggregatoreDati.getDocumentiPerDipartimento(dipartimentoId)`
  che filtra `LOG_DOCS` per sovrapposizione tra `MATERIE` e le materie del
  dipartimento (mirror di `getDocumentiPerClasse`/`containsClasse`, con un
  nuovo `LogDocumento.containsMateria`-stile invece di `containsClasse`).

### Verifica

- Test libreria (`GasLibraryFactory/npm test`) per la nuova direttiva
  strutturale di sezione condizionale, inclusi casi multi-paragrafo e
  negazione `{{^expr}}`.
- `npm run refresh:vendor` + `npm run verify:vendor` in ALDO dopo l'update
  libreria.
- Unit test `DipartimentoProvider`/CDU dipartimento.
- Unit test `DocumentGenerationService.generateForDipartimento`,
  `DocumentBatchService.generateDipartimenti`.
- Unit test `targetsPerCapoDipartimento`/`targetsPerDipartimento` +
  `enumerateTargets` switch.
- Unit test `BOX_DOCUMENTI_DIPARTIMENTO` (empty/non-empty).
- Test di integrazione: un invio email `PER_DIPARTIMENTO` end-to-end con
  CDU dipartimento popolato correttamente.
- `npm run typecheck`, `npm run lint`, `npm test`.
