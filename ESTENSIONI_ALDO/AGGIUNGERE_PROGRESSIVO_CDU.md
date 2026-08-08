# Guida all'Implementazione del Placeholder `progressivo` nel CDU

## 1. Obiettivo e Scenario d'Uso

### Obiettivo
Introdurre nel **Contesto Dati Unificato (CDU)** il placeholder `progressivo` (accessibile sia come `meta.progressivo` sia direttamente come `progressivo` a livello radice del CDU per brevità nei template). 
Il valore di `progressivo` rappresenta il numero sequenziale del documento che si sta generando all'interno della cartella di destinazione in Google Drive.

### Formula di Calcolo
$$\text{progressivo} = (\text{numero di file già presenti nella cartella di destinazione Drive}) + 1$$

### Esempio Pratico
Immaginiamo di generare un verbale di Consiglio di Classe destinato alla cartella Drive:
`DIDATTICA/CLASSI/5AB-LC-LS/VERBALI`

1. Se la cartella contiene già 3 file (es. tre verbali di sedute precedenti), il conteggio dei file presenti è **3**.
2. Il valore calcolato per `progressivo` sarà **4**.
3. Il placeholder potrà essere impiegato sia per la composizione del nome del file (`CONF_DOC.FILE_NAME`) sia all'interno del modello Google Doc/Sheet:
   - **`FILE_NAME` in `CONF_DOC`**: `Verbale_{{focus.classe.anagrafica.nome}}_n{{progressivo}}_{{meta.date.oggi.breve}}` $\rightarrow$ `Verbale_5AB-LC-LS_n4_30/03/2026`
   - **Nel Modello Doc/Sheet**: `VERBALE N. {{progressivo}} DEL {{meta.date.oggi.estesa}}` $\rightarrow$ `VERBALE N. 4 DEL 30 marzo 2026`

---

## 2. Analisi dell'Architettura Attuale e Punti di Impatto

L'analisi dell'architettura di SGSA/ALDO evidenzia i seguenti aspetti chiave nella pipeline di generazione documenti (`DocumentGenerationService` e `documentSteps.ts`):

1. **Risoluzione della Cartella di Destinazione**:
   - La cartella di destinazione viene determinata dinamicamente dallo step `PrepareInfrastructureStep` tramite il servizio `AlberoCartelle.findOrCreate(path, options)`.
   - Il percorso fisico in Drive (es. `DIDATTICA/CLASSI/5AB-LC-LS/VERBALI`) viene calcolato sostituendo i placeholder di `CONF_DOC.PATH_OUT` sul CDU.
   - `PrepareInfrastructureStep` ottiene l'ID univoco Google Drive della cartella (`destFolderId`).

2. **Momento in cui Calcolare il Progressivo**:
   - **Prima di `PrepareInfrastructureStep`**: la cartella di destinazione non è ancora determinata o creata in Drive, quindi non è possibile contare i file presenti.
   - **All'interno di `PrepareInfrastructureStep`**: non appena l'ID della cartella (`destFolderId`) viene risolto da `AlberoCartelle`, è possibile contare i file esistenti nella cartella Drive e iniettare immediatamente `progressivo` nel CDU.
   - Questo consente a tutti gli step successivi (`GenerateNameStep` che compone `FILE_NAME`, `CheckDuplicatesStep` che verifica i duplicati, e `RenderTemplateStep` che compila i modelli) di disporre del valore corretto di `progressivo`.

3. **Interfaccia Drive Facade (`IDriveFacade` / `DriveServiceFacade`)**:
   - In conformità alla regola **GasLibraryFactory-first**, l'accesso alle risorse Drive avviene tramite `DriveServiceFacade`, che estende `DriveService` fornito da `GasLibraryFactory`.
   - `IDriveFacade` deve essere estesa con un nuovo metodo `countFilesInFolder(folderId: string): number`.
   - L'implementazione in `DriveServiceFacade` farà uso di `this.drive.searchFiles(...)` per contare i file non cestinati (`trashed=false` e `mimeType != folder`) presenti nella cartella target.

---

## 3. Dettaglio delle Modifiche da Apportare

### 3.1. Aggiornamento delle Specifiche (`SPECS_ALDO/02_CDU_STRUTTURA.md`)
Aggiungere la proprietà `progressivo` nella Sezione 2 (`meta`):

```yaml
meta:
  timestamp: string
  idConfigurazione: string
  tipoOperazione: string
  idEsecuzione: string
  progressivo?: number           # Conteggio dei file già presenti nella cartella di destinazione + 1
```

Inoltre, per conformità al **Principio 2 (Denormalizzazione)** e al **Principio 6 (Budget di lunghezza placeholder)** descritti nella specifica, il campo deve essere accessibile sia come `{{meta.progressivo}}` sia come `{{progressivo}}` (alias di primo livello sul CDU).

### 3.2. Aggiornamento dell'Interfaccia TypeScript CDU (`src/application/context-engine/Cdu.ts`)
Estendere l'interfaccia `CduMeta` per includere il campo opzionale `progressivo`:

```typescript
export interface CduMeta {
  timestamp: string;
  idConfigurazione: string;
  tipoOperazione: string;
  idEsecuzione: string;
  progressivo?: number; // Conteggio dei file già presenti nella cartella + 1
  date: {
    oggi: {
      // ...
    };
  };
  // ...
}
```

### 3.3. Estensione di `IDriveFacade` e `DriveServiceFacade` (`src/infrastructure/facades/DriveServiceFacade.ts`)

1. **Aggiunta del metodo all'interfaccia `IDriveFacade`**:
```typescript
export interface IDriveFacade {
  // ... metodi esistenti ...
  /** Conteggia i file non cestinati (escluse le sottocartelle) presenti nella cartella Drive fornita. */
  countFilesInFolder(folderId: string): number;
}
```

2. **Implementazione in `DriveServiceFacade`**:
```typescript
countFilesInFolder(folderId: string): number {
  const query = `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed=false`;
  return this.drive.searchFiles(query).length;
}
```
*(L'utilizzo di `this.drive.searchFiles` rispetta la direttiva di utilizzare le librerie vendorate in `GasLibraryFactory` ed evita chiamate dirette ai globali di Apps Script).*

### 3.4. Iniezione del Progressivo nella Pipeline dei Documenti (`src/application/pipelines/documentSteps.ts`)

Aggiornare lo step `PrepareInfrastructureStep` per calcolare il progressivo subito dopo aver ottenuto `destFolderId` e per iniettarlo nel CDU:

```typescript
export class PrepareInfrastructureStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly drive: IDriveFacade,
    private readonly db: IDatabase,
    private readonly templates: ITemplateEngine
  ) {
    super('PrepareInfrastructure', logger, { shouldExecuteCondition: generateGate });
  }

  protected _executeLogic(ctx: PipelineContext): void {
    const path = this.templates.processString(
      String(cfg(ctx)[COL_CONF_DOC.PATH_OUT]),
      cduRecord(ctx)
    );

    const metadata = resolveLogRegistration(
      cfg(ctx)[COL_CONF_DOC.REGISTRA_FOLD],
      this.templates,
      cduRecord(ctx),
      'REGISTRA_FOLD'
    );
    const options = {
      classi: metadata.classi,
      utenti: metadata.utenti,
      materie: metadata.materie,
      tipo: String(cfg(ctx)[COL_CONF_DOC.ID] ?? ''),
      nome: nomeCartella(path)
    };
    const { folderId } = new AlberoCartelle(this.drive, this.db).findOrCreate(path, options);
    this.setResult(ctx, 'destFolderId', folderId);
    this.setResult(ctx, 'destFolderPath', path);

    // --- CALCOLO E INIEZIONE PROGRESSIVO NEL CDU ---
    const count = this.drive.countFilesInFolder(folderId);
    const progressivo = count + 1;

    const cduObj = cdu(ctx);
    cduObj.meta.progressivo = progressivo;
    (cduObj as unknown as Record<string, unknown>).progressivo = progressivo;
  }
}
```

### 3.5. Ottimizzazione della Sequenza degli Step nella Pipeline
In `DocumentGenerationService.ts`, assicurarsi che gli step vengano eseguiti nel seguente ordine logico:

1. `AnalyzeContextStep`
2. `PrepareInfrastructureStep` *(Crea/trova la cartella Drive e calcola `progressivo` nel CDU)*
3. `GenerateNameStep` *(Compone `FILE_NAME` risolvendo `{{progressivo}}`)*
4. `CheckDuplicatesStep` *(Verifica eventuali duplicati in `LOG_DOCS` basandosi sul nome e sul percorso finale)*
5. `SelectTemplateStep`
6. `CloneTemplateStep`
7. `RenderTemplateStep` *(Sostituisce i placeholder tra cui `{{progressivo}}` nel corpo del documento)*
8. `ApplyPermissionsStep`
9. `RegisterDocumentStep`
10. `PostProcessStep`

---

## 4. Verifica e Collaudo

1. **Test Unitari per `DriveServiceFacade`**:
   - Verificare che `countFilesInFolder` invochi correttamente `DriveService.searchFiles` filtrando le sottocartelle e i file cestinati.

2. **Test Unitari per `PrepareInfrastructureStep`**:
   - Con uno stub/mock di `IDriveFacade` che restituisce `3` file per la cartella di destinazione, verificare che `cdu.meta.progressivo` e `cdu.progressivo` vengano valorizzati a `4`.

3. **Test di Integrazione Pipeline**:
   - Eseguire una generazione di prova su una classe e verificare che sia il nome del file generato (`nomeFile`) sia il testo renderizzato all'interno del file contengano il numero progressivo corretto.

---

## 5. Rispetto delle Regole di Progetto

- **GasLibraryFactory-first**: Estende `DriveServiceFacade` basandosi sul metodo `searchFiles` fornito dalla libreria `DriveService` del monorepo `GasLibraryFactory`, senza re-implementare logiche personalizzate o bypassare le Facade.
- **Assenza di Modifiche a Codice Esistente**: La presente analisi illustra la soluzione tecnica senza effettuare modifiche al codice sorgente dell'applicazione, come espressamente richiesto.
