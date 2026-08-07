# Placeholder `progressivo` nel CDU

Fonte: `ESTENSIONI_ALDO/AGGIUNGERE_PROGRESSIVO_CDU.md`.

## Obiettivo

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

## Progetto

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

## Verifica

- Unit test `DriveServiceFacade.countFilesInFolder`: verifica la query
  (esclude cartelle e file cestinati) e il conteggio del risultato.
- Unit test `PrepareInfrastructureStep`: `IDriveFacade` stub restituisce 3 →
  `cdu.meta.progressivo === 4` e `cdu.progressivo === 4`.
- Estendere un test di integrazione pipeline esistente per verificare che sia
  `FILE_NAME` sia il corpo renderizzato contengano il progressivo corretto.
