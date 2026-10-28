# Report comune: copertura offline ALDO + GLF

Data rilevazione: 16 settembre 2026. Comandi eseguiti: `npm test -- --coverage --runInBand` nella root ALDO e in `GasLibraryFactory/`.

| Repository | Suite |  Test | Statements | Branches | Functions |  Lines |
| ---------- | ----: | ----: | ---------: | -------: | --------: | -----: |
| ALDO       |   188 | 1.947 |     91,33% |   77,53% |    91,48% | 92,14% |
| GLF        |   209 | 6.787 |     88,03% |   83,33% |    85,04% | 88,52% |

## Criterio

Una riga non coperta non implica automaticamente un test da aggiungere. Questo report distingue:

- **Da testare**: logica ALDO/GLF con regole, trasformazioni, stati, risultati o errori propri.
- **Online**: codice che dipende da Drive/Sheets/Gmail reali; deve restare nei check GAS, non essere duplicato con mock Jest fragili.
- **Wrapper/escluso**: forwarding a GoogleApiWrapper o a una libreria GLF; il contratto è coperto nel componente proprietario a valle.

I dettagli esatti, incluse tutte le righe mancanti, sono nei due artefatti prodotti dalla rilevazione: `coverage/lcov.info` e `GasLibraryFactory/coverage/lcov.info`. La lista sotto è l'inventario per file della copertura di linee non completa; le righe specifiche sono nell'artefatto LCOV corrispondente.

## ALDO — lacune da testare offline

| Area                | File non completamente coperto                                                                                                                                                                                  | Copertura linee | Azione                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------: | --------------------------------------------------------------------------------------- |
| CDU                 | `ContextBuilder.ts`, `TeachingCouncilProjection.ts`, `movimentoVmMapper.ts`, `storicoMapper.ts`, `subjectVmMapper.ts`                                                                                           |          80–99% | Testare fallback, filtri e proiezioni; non i provider già al 100%.                      |
| Servizi batch       | `ActionBatchService.ts` (96/109), `DocumentBatchService.ts` (268/289), `DocumentGenerationService.ts` (92/96), `EmailBatchService.ts` (122/126), `EmailRetryService.ts` (103/112), `ImportService.ts` (102/107) |          88–97% | Testare solo rami di errore/retry/chunking e invarianti di dominio.                     |
| Servizi applicativi | `AggregatoreDati.ts`, `LockDocumentsService.ts`, `ReportService.ts`, `RisolutoreRuoliService.ts`, servizi `storico/*`                                                                                           |          94–99% | Aggiungere casi limite solo se diventano regressioni note.                              |
| Regole dominio      | `FiltriSorgente.ts` (123/131), `PeriodoSupplenza.ts`, `VariazioneCattedra.ts`, `LogJob.ts`                                                                                                                      |          79–94% | Priorità media: selezione inclusiva/esclusiva, confini data e validazione record.       |
| Composizione        | `Bootstrap.ts`, `ApplicationComposition.ts`, `validationRules.ts`                                                                                                                                               |          94–96% | Test di integrazione della composizione; nessun test per singole registrazioni passive. |

Copertura parziale ma deliberatamente non duplicata:

- `infrastructure/facades/{GmailServiceFacade,UiFacade}.ts`: forwarding a GLF/GAS.
- `infrastructure/repositories/{LogCartella,LogDocumento,LogEmail,LogJob}Repository.ts` e `SheetDbAdapter.ts`: mapping/persistenza, da verificare nell'integrazione SheetDB e non con test di mock sul wrapper.
- `entrypoints/EntryPoints_Base.ts`: glue GAS.
- `onlinetests/**` e `GasArtifactFactory.ts`: sono check live già separati; le molte linee mancanti indicano scenari non lanciati dalla suite Jest, non logica da ricreare offline.
- Linee solo-branch in provider/mappers già al 100% linee: nessun nuovo test solo per aumentare la percentuale.

## GLF — lacune da testare offline

| Priorità | Libreria e file                                                                                                                                         |                Copertura linee | Lacuna reale                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------------: | --------------------------------------------------------------------- |
| Alta     | `ComposableContentLib/src/composition/ContentComposer.js`                                                                                               |                          36/59 | Orchestrazione blocchi, errori e contenuto vuoto.                     |
| Alta     | `ComposableContentLib/src/core/{BlockDefinition,CompositionResult}.js`                                                                                  |                   18/30, 26/36 | Contratti di validazione, query del risultato e serializzazione.      |
| Alta     | `ComposableContentLib/src/data/BlockDataContext.js`                                                                                                     |                           4/21 | Merge, contesto globale e round-trip JSON.                            |
| Alta     | `ComposableContentLib/src/internal/{BlockRenderer,VisibilityEvaluator}.js`, `registry/RendererRegistry.js`                                              |             5/46, 44/45, 15/27 | Rendering, template assente, interpolazione e registrazione renderer. |
| Alta     | `RoleResolutionLib/src/internal/{resolution/RoleResolver,routing/RoutingResolver}.js`                                                                   |                  79/132, 49/66 | Precedenza/fallback e traccia della risoluzione: logica critica SGSA. |
| Alta     | `SheetDBLib/src/{DatabaseService,TableService}.js`                                                                                                      |               120/143, 369/408 | Validazione schema, query e errori di persistenza.                    |
| Alta     | `DomainRepositoryLib/src/{Repository,ValueObject}.js`, `internal/mapping/{EntityMapper,QueryTranslator}.js`, `specifications/CompositeSpecification.js` | 20–140 righe mancanti per file | Mapping, composizione specifiche e traduzione query.                  |
| Media    | `ContextEngine/src/{projection/CollectionProjector,projection/ProjectionRegistry,internal/DependencyResolver}.js`                                       |  7–148 righe mancanti per file | Proiezioni collezione, dipendenze mancanti e registrazione.           |
| Media    | `GasDataImporter/src/internal/load/Loader.js`, `GasExpressionEngineLib/src/ExpressionEvaluatorService.js`, `GasResilienceLib/src/ExceptionService.js`   |  13–22 righe mancanti per file | Flussi errore e trasformazioni rimanenti.                             |
| Media    | `WorkspaceTemplateEngine/src/{facades/Mustache,processors/SheetProcessor}.js`                                                                           |          33, 26 righe mancanti | Tag/righe dinamiche e sezioni condizionali.                           |
| Bassa    | `CoreUtilsLib/{LoggerService,Result}.js`, `utils/{DateUtils,CellValueCoercion}.js`                                                                      |            2–12 righe mancanti | Solo rami di formattazione/errore residui.                            |
| Bassa    | `JobRunnerLib/src/internal/{QueueProgressTracker,JobRunnerExecutionController}.js`, `PipelineFramework/src/Pipeline.js`                                 |             7–9 righe mancanti | Checkpoint e failure-path residui.                                    |

Le restanti lacune GLF sono classificate **wrapper/escluso**: `GoogleApiWrapper/**` (inclusi `Drive*`, `Spreadsheet*`, `Document*`, `PropertiesService`, `MailService`, `PermissionService`, `TriggerService`, `UtilitiesService`), i mock sotto `*/src/testing/**`, e i file `index.js`. Vanno coperte da test online del wrapper o dai test della logica che li usa; testare qui le chiamate native Google duplicerebbe un contratto esterno.

## Test aggiunti

- `test/unit/application/context-engine/cdu-internal-metadata.test.ts`: protegge l'isolamento per identità d'oggetto della metadata CDU e assicura che non venga serializzata nel CDU.
- `GasLibraryFactory/ComposableContentLib/src/core/__tests__/CompositionResult.test.js`: protegge classificazione visibile/nascosto/errore, stato di successo, media di elaborazione e serializzazione del risultato vuoto.

Non sono stati aggiunti test ai facade ALDO, a GoogleApiWrapper o ai check online. Aumenterebbero la percentuale senza proteggere logica proprietaria.

## Piano minimo successivo

1. Completare la suite `ComposableContentLib` (i quattro file ad alta priorità): è la lacuna più concentrata e tutta logica pura.
2. Coprire i fallback di `RoleResolver` e `RoutingResolver` prima di estendere ALDO sul ruolo docente.
3. Aggiungere test ai soli failure-path di `ActionBatchService`, `DocumentBatchService` e `EmailRetryService` quando viene toccato il rispettivo flusso.
