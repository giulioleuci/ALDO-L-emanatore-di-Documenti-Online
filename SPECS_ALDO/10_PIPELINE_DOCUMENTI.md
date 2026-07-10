# 10 — Pipeline di Generazione Documenti

La `DocumentoPipeline` governa l'intero ciclo di vita della creazione di un documento su Google Drive: dalla valutazione delle condizioni alla clonazione del template, dal rendering dei placeholder all'applicazione dei permessi ACL, fino alla registrazione nel log e all'esecuzione delle azioni post-generazione.

La pipeline DEVE essere **data-driven**: il suo comportamento DEVE essere interamente governato dalla configurazione nel record `CONF_DOC` attivo, senza alcuna logica hard-coded.

La pipeline DEVE essere **sempre** integrata con `JobRunnerLib` (L3). Ogni elemento processato DEVE essere un checkpoint `yield`. Dettagli in `15_UI_E_JOB_RUNNER.md`.

**Libreria di riferimento:** `PipelineFramework` (L3).

---

## 1. Principi generali

- Ogni step riceve il `PipelineContext` in input, esegue la propria logica, e scrive il proprio output nel contesto per gli step successivi.
- Ogni step DEVE implementare `shouldExecute(context): boolean` per decidere se eseguirsi. Il pattern tipico è `context.get('shouldGenerate') === true`.
- Ogni step DEVE essere isolato in un blocco try/catch. Un errore in uno step non-critico DEVE produrre un warning nel log senza interrompere la pipeline. Un errore in uno step critico DEVE attivare la logica di rollback.
- Il `PipelineContext` accumula un `logEsecuzione[]` accessibile in `cdu.tech.pipeline.logEsecuzione` per analisi post-mortem.

---

## 2. Flusso completo — Riepilogo

```
DocumentoPipeline (10 step):

  1.  AnalyzeContextStep          → valuta CONF_DOC.CONDIZIONE
  2.  CheckDuplicatesStep         → cerca duplicati in LOG_DOCS
  3.  PrepareInfrastructureStep   → crea/recupera cartelle Drive, scrive LOG_FOLD
  4.  GenerateNameStep            → calcola nome file da CONF_DOC.FILE_NAME
  5.  SelectTemplateStep          → sceglie template da CONF_DOC.MODELLI
  6.  CloneTemplateStep           → copia template su Drive [punto di rollback]
  7.  RenderTemplateStep          → sostituisce placeholder tramite Strategy
  8.  ApplyPermissionsStep        → applica ACL da CONF_DOC.PERMESSI
  9.  RegisterDocumentStep        → scrive record in LOG_DOCS
  10. PostProcessStep             → esegue CONF_DOC.POST_PROCESSO
```

---

## 3. Step 1 — AnalyzeContextStep

**Scopo:** Valutare se il documento deve essere generato per il contesto corrente (Conditional Generation).

**Colonne DB lette:** `CONF_DOC.CONDIZIONE`

**Logica:**
- Se `CONDIZIONE` è null o vuoto → `shouldGenerate = true`
- Altrimenti → valuta l'espressione tramite `GasExpressionEngineLib` (L2) con il CDU come contesto
- Scrive `shouldGenerate` nel contesto

**Note:** Gli step successivi verificano `shouldGenerate = true` nel proprio `shouldExecute()`. Se `false`, la pipeline si conclude silenziosamente.

**Esempi di condizione:**
```
{{focus.classe.anagrafica.anno}} == 5
{{focus.alunno.didattica.piani.hasBes}} == true && {{focus.alunno.didattica.carenze.hasCarenze}} == true
```

---

## 4. Step 2 — CheckDuplicatesStep

**Scopo:** Prevenire la generazione di documenti duplicati controllando `LOG_DOCS`.

**Colonne DB lette:** `CONF_DOC.TIPO`, `CONF_DOC.PARAMETRI`, `CONF_DOC.SCHEMA_SOTTOCARTELLE`  
**Tabella consultata:** `LOG_DOCS` (campi `ID_GEN`, `CLASSI`, `UTENTI`, `MATERIA`, `SOTTOTIPO`); `CLASSI` e `UTENTI` sono CSV, la ricerca per singola classe/utente avviene per contenimento (CONTAINS)

**Logica:**
- `CONF_DOC.SCHEMA_SOTTOCARTELLE` determina la granularità dei criteri di ricerca duplicati in `LOG_DOCS`:

| Valore | Criteri di ricerca |
|--------|---------------------|
| `UNO PER CLASSE` | `ID_GEN` + `CLASSI` (CONTAINS) |
| `UNO PER DOCENTE` | `ID_GEN` + `UTENTI` (contiene il docente) |
| `UNO PER CLASSE PER MATERIA` | `ID_GEN` + `CLASSI` (CONTAINS) + `MATERIA` |
| `UNO PER PIANO PERSONALIZZATO` | `ID_GEN` + `UTENTI` (contiene l'alunno) + `SOTTOTIPO` (tipo piano) |
| `UNICO PER SCUOLA` | `ID_GEN` soltanto |
| `MULTIPLO PER CLASSE` | nessun controllo: `shouldGenerate` resta sempre `true` (più documenti consentiti per lo stesso contesto) |

- Se esiste un record che soddisfa i criteri risultanti e `parametri.overwrite != true` → `shouldGenerate = false` + warning nel log
- Altrimenti → salva l'eventuale `existingDocId` nel contesto per possibile sovrascrittura

---

## 5. Step 3 — PrepareInfrastructureStep

**Scopo:** Costruire o recuperare la struttura di cartelle Drive di destinazione.

**Colonne DB lette:** `CONF_DOC.PATH_OUT`, `CONF_DOC.PATH_OUT_SOTTOCARTELLE`, `CONF_DOC.SCHEMA_SOTTOCARTELLE`  
**Tabella scritta:** `LOG_FOLD`

**Logica:**
1. Risolve il `PATH_OUT` (cartella principale) tramite `WorkspaceTemplateEngine` (L2): `"Verbali/{{focus.classe.anagrafica.anno}}"` → `"Verbali/5"`
2. Se `SCHEMA_SOTTOCARTELLE != UNICO PER SCUOLA`, risolve anche `PATH_OUT_SOTTOCARTELLE` (es. per `UNO PER DOCENTE`: `"{{destinatario.anagrafica.nomeCompleto}}"`) e lo appende come ulteriore livello sotto `PATH_OUT`, coerente con la granularità usata da `CheckDuplicatesStep`
3. Cerca la cartella risultante in `LOG_FOLD` con `PATH = pathResolto`
4. Se non trovata → crea tramite `DriveServiceFacade.createFolder()` e registra in `LOG_FOLD`
5. Scrive `destFolderId`, `destFolderLink`, `destFolderPath` nel contesto

La gestione fisica delle cartelle è delegata ad `AlberoCartelle` (descritto in `14_SERVIZI_UTILITY.md`), che implementa il pattern findOrCreate prevenendo cartelle duplicate.

---

## 6. Step 4 — GenerateNameStep

**Scopo:** Determinare il nome finale del file con gestione delle numerazioni progressive.

**Colonne DB lette:** `CONF_DOC.FILE_NAME`

**Logica:**
1. Risolve il pattern `FILE_NAME` tramite `WorkspaceTemplateEngine`: `"Verbale_{{focus.classe.anagrafica.nome}}_{{meta.date.oggi.breve}}"` → `"Verbale_5A_15/04/2026"`
2. Se il nome contiene `{{N}}` → conta i file nella cartella di destinazione e sostituisce `{{N}}` con il numero progressivo (`count + 1`)
3. Scrive `nomeFile` nel contesto

---

## 7. Step 5 — SelectTemplateStep

**Scopo:** Individuare il corretto ID del template Google Drive.

**Colonne DB lette:** `CONF_DOC.MODELLI`

**Logica:**
- Se `CONF_DOC.MODELLI` è null → eccezione esplicita (il campo è obbligatorio, nessun default)
- Forma semplice `{ "templateId": "..." }` → usa direttamente
- Forma condizionale (array) → valuta le condizioni nell'ordine tramite `GasExpressionEngineLib`; usa il `templateId` del primo match
- Se nessun template è applicabile → eccezione esplicita
- Non è supportato un ID Drive diretto come stringa: è sempre richiesto il wrapper JSON (forma semplice o condizionale)

**Esempio MODELLI condizionale:**
```json
[
  { "condizione": "{{focus.classe.anagrafica.anno}} == 5", "templateId": "1abc_esame" },
  { "condizione": "true", "templateId": "1abc_default" }
]
```

---

## 8. Step 6 — CloneTemplateStep

**Scopo:** Eseguire la copia fisica del template nella cartella di destinazione. È il **punto di non ritorno** della pipeline.

**Logica:**
1. Chiama `DriveServiceFacade.copyFile(templateId, nomeFile, destFolderId)`
2. Scrive `newFileId` e `newFileLink` nel contesto
3. In caso di errore → `shouldGenerate = false` + propagazione eccezione (attiva rollback)

**Rollback (Orphaned File Cleanup):** se qualsiasi step successivo fallisce con eccezione non gestita, la pipeline DEVE intercettare l'errore nel blocco `execute()`. Se `newFileId` è valorizzato, DEVE chiamare `DriveServiceFacade.deleteFile(newFileId)` prima di propagare l'eccezione, eliminando il file orfano e mantenendo Drive pulito.

**Limite del rollback:** questa pulizia riguarda ESCLUSIVAMENTE il file Drive appena clonato. NON esiste alcun rollback per scritture su Sheet già avvenute in step precedenti (es. `LOG_FOLD` in `PrepareInfrastructureStep`); un'eventuale incoerenza residua DEVE essere riconciliata manualmente (vedi `08_ARCHITETTURA_DI_PATTERN.md`, sezione 6).

---

## 9. Step 7 — RenderTemplateStep

**Scopo:** Sostituire i placeholder nel documento clonato con i valori del CDU, tramite la Strategy appropriata.

**Colonne DB lette:** `CONF_DOC.GENERATORE`, `CONF_DOC.PARAMETRI`

**Logica:**
1. Legge `config.GENERATORE` (es. `"VERBALE_CDC"`)
2. Recupera la Strategy da `strategyRegistry`
3. Chiama `strategy.render(fileId, cdu, config)`

**Tutte le Strategy usano `WorkspaceTemplateEngine` (L2)** per la sostituzione placeholder e le manipolazioni strutturali. `WorkspaceTemplateEngine` gestisce internamente la Reverse-Order Strategy per Google Docs (modifica dall'ultima alla prima occorrenza per evitare lo shift degli indici).

### Registro Strategy (GENERATOR_REGISTRY)

Il `DocumentGenerationService` mantiene un registro interno che mappa `CONF_DOC.GENERATORE` alla classe Strategy concreta. Il registro viene popolato in `Bootstrap.js`. Se il valore non è registrato, il servizio DEVE lanciare un'eccezione prima ancora di costruire il CDU.

| Valore `CONF_DOC.GENERATORE` | Strategy |
|------------------------------|----------|
| `VERBALE_CDC` | `VerbaleGeneratorStrategy` |
| `SHEET_CON_MATERIE` | `SheetMaterieGeneratorStrategy` |
| `SHEET_CON_MATERIE_E_PERMESSI` | `SheetMaterieConPermessiGeneratorStrategy` |
| `DOC_PERSONALIZZATO` | `DocPersonalizzatoGeneratorStrategy` |
| `DOCUMENTO_GENERICO` | `DocumentoGenericoGeneratorStrategy` |
| `DOCUMENTO_CON_TABELLE_IMPORTATE` | `DocumentoConTabelleImportateGeneratorStrategy` |

### Dettaglio Strategy

**`VerbaleGeneratorStrategy`**  
Opera su un Google Doc. Sostituisce i placeholder con dati del CDU tramite `WorkspaceTemplateEngine`. Per classi articolate, rimuove dal documento le sezioni relative agli indirizzi non presenti nella classe corrente: i placeholder di sezione sono marcati con tag speciali configurati in `CONF_DOC.PARAMETRI`.

**`SheetMaterieGeneratorStrategy`**  
Opera su un Google Sheet. Dopo la copia del template:
1. Legge le materie della classe dal CDU (`focus.classe.consiglioDiClasse`) e risolve l'intestazione di ciascuna (`MATERIE.SINTESI`, con fallback alla sigla)
2. Costruisce sul context i gruppi di colonne attesi dal placeholder `{{dynamic_columns[...]}}` incorporato nel template Drive: per classi articolate, materie condivise tra i partner prima, poi — separate da una colonna etichetta di gruppo — le materie specifiche per ciascun indirizzo
3. Invoca `WorkspaceTemplateEngine.processSheet`, che espande le colonne (posizionandole a partire dalla cella del placeholder) e sostituisce in un unico passaggio anche i placeholder non strutturali del foglio

`CONF_DOC.PARAMETRI` può specificare: nome del foglio target (facoltativo, per selezionare una scheda non predefinita). La posizione delle colonne materia è determinata dal placeholder `{{dynamic_columns[...]}}` incorporato nel template Drive, non più da `PARAMETRI`.

**`SheetMaterieConPermessiGeneratorStrategy`**  
Identica a `SheetMaterieGeneratorStrategy` con l'aggiunta di protezione range batch. Dopo l'inserimento delle colonne, applica la protezione tramite `GoogleApiWrapper` (L1): ogni docente del CDC riceve il permesso di scrittura esclusivamente sulle proprie colonne materia; il coordinatore riceve accesso completo. La risoluzione dei docenti per colonna usa `RoleResolutionLib` (L4) per gestire le supplenze attive.

**`DocPersonalizzatoGeneratorStrategy`**  
Opera su un Google Doc. Legge `PIANI.PARAMETRI` dell'alunno corrente. La struttura attesa varia per tipo di piano (`PDP`, `PEI`, `PFP`) — dettagli in `03_VALUE_OBJECTS_ED_ENUM.md`. Ogni campo corrisponde a un placeholder nel template. Se un campo è assente, il placeholder viene sostituito con stringa vuota senza errori.

**`DocumentoGenericoGeneratorStrategy`**  
Sostituzione semplice di tutti i placeholder `{{...}}` nel documento con i valori del CDU tramite `WorkspaceTemplateEngine`, senza logica strutturale aggiuntiva. Adatta per lettere, comunicazioni e qualsiasi documento senza manipolazioni strutturali.

**`DocumentoConTabelleImportateGeneratorStrategy`**  
Estende `DocumentoGenericoGeneratorStrategy`. Dopo la sostituzione dei placeholder, individua nel documento placeholder speciali di tipo tabella (es. `{{TABELLA:id_drive_file}}`). Per ognuno, legge il Google Sheet indicato tramite `GoogleApiWrapper` (L1) e importa i dati come tabella nel documento.

### Nota performance — documenti lunghi

Per documenti con centinaia di placeholder o oltre ~100 pagine, la sostituzione sequenziale dei placeholder (anche con la Reverse-Order Strategy) può approssimare i limiti di esecuzione GAS. In questi casi la Strategy deve suddividere il rendering in batch, inserendo `yield` di checkpoint gestiti da `JobRunnerLib` (L3) tra un batch e il successivo, analogamente al pattern usato per l'iterazione su classi/alunni in `15_UI_E_JOB_RUNNER.md`. Questa suddivisione va valutata caso per caso dalla Strategy concreta, non è gestita automaticamente da `WorkspaceTemplateEngine`.

---

## 10. Step 8 — ApplyPermissionsStep

**Scopo:** Applicare i permessi di condivisione Drive al file e alla cartella, risolvendo i ruoli astratti in email reali.

**Colonne DB lette:** `CONF_DOC.PERMESSI`, `SUPPLENZE` (via `SupplenzaRepository`)

**Logica:**
1. Legge `permessiConfig` da `CONF_DOC.PERMESSI` (`{ file: [...], folder: [...], regolaSupplente: {...} }`)
2. Per ogni `{ ruolo, permesso }` in `permessiConfig.file`:
   - `emails = risolutoreRuoliService.risolvi(ruolo, cdu)` (applica supplenze con `regolaSupplente.file`)
   - `DriveServiceFacade.setPermission(fileId, email, permesso)` per ogni email
3. Come sopra per `permessiConfig.folder` (con `regolaSupplente.folder`)

Il `RisolutoreRuoliService` interroga `SupplenzaRepository.findSupplenzaSpecifica()` per sostituire automaticamente i titolari assenti con i rispettivi supplenti attivi, in base alla regola configurata.

Catalogo completo dei ruoli in `14_SERVIZI_UTILITY.md`.

---

## 11. Step 9 — RegisterDocumentStep

**Scopo:** Persistere i metadati del documento appena creato in `LOG_DOCS`.

**Colonne DB scritte in LOG_DOCS:** `ID`, `ID_GEN`, `TIPO`, `SOTTOTIPO`, `NOME`, `STATO`, `PATH`, `LINK`, `CLASSI`, `UTENTI`, `MATERIA`, `DATA_CREAZ`, `ID_ORIG`

`TIPO` è derivato da `CONF_DOC.TIPO` del record identificato da `config.ID` (campo categoriale, vedi `01_SCHEMA_DATABASE.md`). `NOTIFICATO` non è scritto in questo step: viene valorizzato in seguito da `LogDocumento.notifica()` (vedi `04_DOMINIO_ENTITA.md`).

**Logica:**
1. Chiama `logDocRepository.registraDocumento(fileId, config.ID, nomeFile, path, fileLink, options)`
   - `options.classe` da `cdu.focus.classe?.anagrafica.nome` (scrive in `CLASSI`, CSV)
   - `options.utente` da `cdu.focus.alunno?.anagrafica.email` (scrive in `UTENTI`, CSV; `registraDocumento()` si occupa della formattazione CSV)
   - `options.materia` da `cdu.meta.parametriInput.materiaCorrente` (vedi `02_CDU_STRUTTURA.md`); assente se l'operazione non è legata a una specifica materia
   - `options.sottotipo` da `config.parametri?.sottotipo`
2. `database.save()`

---

## 12. Step 10 — PostProcessStep

**Scopo:** Eseguire le azioni automatiche post-generazione definite in `CONF_DOC.POST_PROCESSO`.

**Colonne DB lette:** `CONF_DOC.POST_PROCESSO`

**Azioni supportate:**

| Tipo | Effetto |
|------|---------|
| `INSERISCI_TIMESTAMP` | Scrive data/ora corrente in `tab.col` dove i criteri corrispondono |
| `AGGIORNA_CAMPO` | Imposta `tab.col = val` dove i criteri corrispondono |
| `AGGIORNA_STATO_DOC` | Cambia `LOG_DOCS.STATO` di un documento già registrato |

**Placeholder disponibili nei criteri:** tutti i percorsi CDU (`{{focus.classe.anagrafica.nome}}` ecc.) più le variabili di pipeline come `{{newFileId}}` (ID Drive del file appena creato), risolti tramite `WorkspaceTemplateEngine` prima dell'esecuzione.

Esempio:
```json
[
  {
    "tipo": "AGGIORNA_STATO_DOC",
    "tab": "LOG_DOCS",
    "criteri": { "ID": "{{newFileId}}" },
    "set": { "col": "STATO", "val": "VERBALIZZATO" }
  }
]
```

**Persistenza:** ogni azione DEVE marcare dirty il record corrispondente; lo step DEVE terminare con una chiamata esplicita a `database.save()` per persistere le modifiche, poiché queste avvengono dopo il `database.save()` già eseguito in `RegisterDocumentStep` (Step 9).

---

## 13. Integrazione con la Pipeline Email

Le due pipeline sono indipendenti ma frequentemente correlate. Un flusso tipico:

1. `DocumentoPipeline` genera verbali per ogni classe → li registra in `LOG_DOCS` con `STATO = GENERATO`
2. `NotificaPipeline` (PER_COORDINATORE) invia email ai coordinatori con il box `documenti` che mostra i verbali con `STATO = GENERATO`
3. Il coordinatore firma il verbale → `AGGIORNA_STATO_DOC` porta `STATO = VERBALIZZATO`
4. Alla successiva email, il verbale non appare più nel box (il filtro esclude `STATO != GENERATO`)

---

## 14. Gestione Articolazione (`CONF_DOC.GESTIONE_ARTICOLAZIONE`)

Il campo `CONF_DOC.GESTIONE_ARTICOLAZIONE` (Enum `GestioneArticolazione`) controlla come la pipeline gestisce la generazione per le classi articolate.

| Valore | Comportamento pipeline |
|--------|----------------------|
| `COMPLETA` | Entry point = classe parent. La pipeline genera un singolo documento aggregato che include tutti gli studenti e tutte le materie (comuni e specifiche) di entrambe le classi partner. |
| `ARTICOLATA` | Entry point = ogni classe partner separatamente. La pipeline itera sui partner e genera documenti distinti per ciascuno. |

**Impatto su `generateForAllClasses()`:** quando `GESTIONE_ARTICOLAZIONE = ARTICOLATA`, il servizio DEVE saltare le classi parent per evitare duplicazioni; le classi partner vengono processate individualmente. Quando `GESTIONE_ARTICOLAZIONE = COMPLETA`, il servizio DEVE saltare le classi partner e processare la classe parent come unico entry point aggregato. Vedi `12_SERVIZI_APPLICATIVI.md`.
