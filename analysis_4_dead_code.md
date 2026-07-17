# Dead Code Analysis (analysis_4_dead_code.md)

Generated via `codebase-memory-mcp` knowledge graph query against project
`home-giulio-Desktop-ALDO-implementing` (9,744 nodes / 25,717 edges, indexed at
commit `a0803d5`).

## Methodology

The graph's built-in `NOT EXISTS { (c)-[:CALLS]->(f) }` Cypher form was found to be
**unreliable** for this query shape: it flagged `initAldo` (a function with real,
verified incoming `CALLS` edges) as having zero callers. To get trustworthy results,
the full `Function`/`Method` node sets and the full set of `CALLS`-target
`qualified_name`s were fetched separately and diffed outside the graph engine
(`jq`/`awk`), then cross-checked against source with `grep`.

**Important caveat on interpretation:** this codebase wires most classes through
`src/config/Bootstrap.ts` / `ServiceContainer` and consumes them exclusively via
TypeScript interface types (`IDriveFacade`, repository interfaces, etc.). The
call-graph indexer does not resolve interface-typed dispatch back to concrete
implementations, so **84 ALDO classes show up as "fully dark" (every method,
including the constructor, has 0 recorded callers) purely because of this DI blind
spot** — not because they are unused. These are excluded from the dead-code
candidate list below (see Section A, note on methodology). Only methods belonging
to classes that are _otherwise confirmed live_ (≥1 sibling method has a real
recorded caller) are listed as candidates, and even those are medium-confidence,
not verified deletions.

Similarly, GAS invokes several ALDO entrypoints by string name (menu items,
triggers) or via `globalThis` assignment in `src/index.ts` / `src/entrypoints/EntryPoints.ts`
— this pattern is documented in this repo's `CLAUDE.md`. Such symbols never get a
`CALLS` edge and were manually verified as false positives, not dead code.

## Summary

|            | Total nodes | Zero-caller | After excluding entry points/tests/vendor |
| ---------- | ----------- | ----------- | ----------------------------------------- |
| `Function` | 644         | 256         | —                                         |
| `Method`   | 3,774       | 2,834       | —                                         |

Zero-caller breakdown by location:

- `src/` (ALDO app code): 19 functions + 579 methods
- `GasLibraryFactory/` (16 reusable libraries): 179 functions + 2,172 methods
- `test/**` (test helpers, out of scope for "dead code"): 58 functions + 83 (methods not separately broken out)

**Confirmed true ALDO dead code: 0 functions found.** All 14 non-entry-point,
non-test zero-caller `Function` nodes in `src/` were manually verified as false
positives (object-literal keys, callback references, GAS ambient-global
entrypoints, or duck-typed structural consumers) — see Section A1.

For `Method` nodes, 84 classes are excluded entirely as DI-blind-spot false
positives (fully dark, not source-verified as dead). Of the remaining 82
"partially dark" classes (confirmed live via ≥1 reached sibling method), the
graph surfaced **266 methods** with no recorded caller. Every one of the 266
was re-verified with a TypeScript-compiler-based, type-checked cross-reference
pass (see Section A2 for full methodology and per-item breakdown). Result:
**122 (46%) are false positives** with a real, ordinary production caller the
graph missed entirely; **91 (34%) are exercised only by unit tests** with no
production caller found; and of the **53 (20%)** with zero references
anywhere, **29 are false positives from five polymorphic-dispatch patterns
invisible to static analysis** (entity `toData()` called by
`DomainRepositoryLib`'s `EntityMapper`, the `Classe.getKnownColumns()` hook
that same mapper's `captureDynamicColumns()` step calls via
`this.constructor.getKnownColumns`, CDU provider `provide()` called through
the `ContextProvider` interface, pipeline step `_executeLogic()` called
through `PipelineFramework`'s `Step` template method, and
`SheetDbAdapter`/`SheetTableAdapter` methods reached only through
`IDatabase`/`IReadableTable` or the library's ambient `RepositoryDatabase`
seam). **Only 24 methods are confirmed true dead code** (zero callers
anywhere, individually verified by hand, each traced to a specific cause) —
see Section A2.4.

---

## Section A — ALDO dead code candidates

### A1 — Functions (all verified as FALSE POSITIVES, not dead code)

The following 14 zero-caller `Function` nodes in `src/` were checked by hand
against source. None are actually dead:

| qualified_name                   | file                                                                        | why it's a false positive                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dataExtractor` (boxes.ts)       | src/application/email/boxes.ts                                              | object-literal property key, not a callable function                                                                           |
| `emptyChecker` (boxes.ts)        | src/application/email/boxes.ts                                              | object-literal property key, not a callable function                                                                           |
| `carenze` (boxes.ts)             | src/application/email/boxes.ts                                              | object-literal property key in a box-registry map                                                                              |
| `documenti` (boxes.ts)           | src/application/email/boxes.ts                                              | object-literal property key in a box-registry map                                                                              |
| `cartelle` (boxes.ts)            | src/application/email/boxes.ts                                              | object-literal property key in a box-registry map                                                                              |
| `note` (boxes.ts)                | src/application/email/boxes.ts                                              | object-literal property key in a box-registry map                                                                              |
| `assenze` (boxes.ts)             | src/application/email/boxes.ts                                              | object-literal property key in a box-registry map                                                                              |
| `testo_dinamico` (boxes.ts)      | src/application/email/boxes.ts                                              | object-literal property key in a box-registry map                                                                              |
| `cellToString`                   | src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts | passed by reference as a callback (`.map(cellToString)`); graph only tracks direct invocation                                  |
| `menu_avvioGenerazioneDocumenti` | src/entrypoints/EntryPoints.ts                                              | invoked by GAS via string reference from `Menu.ts` (`funzione: 'menu_avvioGenerazioneDocumenti'`), not a static call           |
| `menu_avvioComunicazioniEmail`   | src/entrypoints/EntryPoints.ts                                              | invoked by GAS via string reference from `Menu.ts`                                                                             |
| `generaPagelle`                  | src/entrypoints/EntryPoints.ts                                              | GAS entrypoint, assigned to `globalThis` in `EntryPoints.ts`, invoked by GAS trigger/menu by name                              |
| `inviaNotificaAssenze`           | src/entrypoints/EntryPoints.ts                                              | GAS entrypoint, assigned to `globalThis`, invoked by name                                                                      |
| `Database.from`                  | src/infrastructure/db/Database.ts                                           | duck-typed query-builder shape consumed by `DomainRepositoryLib`'s `Repository.find()` via structural typing, not a named call |

**Conclusion for A1: zero confirmed dead functions in ALDO application code.**

### A2 — Methods: type-checked cross-reference verification

The graph's `CALLS`-edge extraction is graph-derived and, for `Method` nodes,
unreliable on its own. Verification used the TypeScript compiler API
(`ts.createProgram` over `tsconfig.eslint.json` + `typeChecker.getSymbolAtLocation`)
to resolve every `object.method(...)` call site in `src/**` and `test/**` back to
the exact declaring class, instead of grepping/graphing by method name — this
avoids the false matches that plain-text tools get from common names shared
across classes (`toData`, `equals`, `classeId`, `studenteEmail`,
`annoScolastico`, etc. each appear on 3–21 different classes in this
codebase). The script is not retained in the repo (scratch tool, not project
tooling); its method was: build the program, index every class's
method/getter/setter declarations, then walk all `PropertyAccessExpression`
nodes and resolve each `.name` through the checker, matching resolved
declarations back to the indexed set.

Result for the 266 candidates:

| Bucket                                            | Count     | Meaning                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real production call site found                   | 122 (46%) | **False positive** — the graph missed a real, ordinary call. Removed from the candidate list entirely (see A2.1).                                                                                                                                                                    |
| Called only from unit tests, no production caller | 91 (34%)  | Weaker signal — exercised by tests but not reached from any production code path found by the checker (see A2.2). Needs a judgment call, not an automatic deletion.                                                                                                                  |
| No reference anywhere (incl. tests)               | 53 (20%)  | Strongest dead-code signal — but 29 of these are themselves false positives from **polymorphic dispatch patterns invisible to both the graph and a TS type checker** (see A2.3). Only the remaining **24 are confirmed true dead code**, each traced to a specific cause (see A2.4). |

#### A2.1 — 122 confirmed false positives (real production caller found, type-checked)

Not dead. The declaring class/method is called from application code via an ordinary,
statically-resolvable call — the original graph's `CALLS`-edge extraction simply missed
these (not a DI/interface issue, just incomplete graph coverage). One representative
caller per row shown; most have 2+ real call sites.

| method                       | class                             | one confirmed caller                                                    |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `findOrCreate`               | AlberoCartelle                    | src/infrastructure/steps/documentSteps.ts:155                           |
| `email`                      | Alunno                            | src/infrastructure/repositories/CarenzaRepository.ts:46                 |
| `getCurriculum`              | Alunno                            | src/infrastructure/repositories/AlunnoRepository.ts:67                  |
| `getRappresentanteGenitore`  | Alunno                            | src/application/context-engine/providers/RappresentantiProvider.ts:24   |
| `getTutors`                  | Alunno                            | src/infrastructure/repositories/AlunnoRepository.ts:63                  |
| `isAttivo`                   | Alunno                            | src/infrastructure/repositories/AlunnoRepository.ts:47                  |
| `isRappresentante`           | Alunno                            | src/domain/specifications/AlunnoSpecs.ts:31                             |
| `isRipetente`                | Alunno                            | src/domain/specifications/AlunnoSpecs.ts:21                             |
| `findAttivi`                 | AlunnoRepository                  | src/application/context-engine/providers/StatisticheProvider.ts:27      |
| `getCarenze`                 | AlunnoRepository                  | src/application/context-engine/providers/StudentiProvider.ts:55         |
| `getOreASLTotali`            | AlunnoRepository                  | src/application/context-engine/providers/StudentiProvider.ts:72         |
| `getPiani`                   | AlunnoRepository                  | src/application/context-engine/providers/StudentiProvider.ts:56         |
| `toData`                     | Alunno                            | src/infrastructure/repositories/ClasseRepository.ts:419                 |
| `isPrimoBiennio`             | AnnoCorso                         | src/application/context-engine/providers/ClasseProvider.ts:47           |
| `isParent`                   | ArticolazioneConfig               | src/infrastructure/repositories/ClasseRepository.ts:212                 |
| `isPartner`                  | ArticolazioneConfig               | src/infrastructure/repositories/ClasseRepository.ts:189                 |
| `getCella`                   | Carenza                           | src/infrastructure/repositories/CarenzaRepository.ts:78                 |
| `getNote`                    | Carenza                           | src/application/context-engine/providers/CarenzaFocusProvider.ts:29     |
| `hasAssenzeElevate`          | Carenza                           | src/application/context-engine/providers/CarenzaFocusProvider.ts:28     |
| `findByAlunno`               | CarenzaRepository                 | src/infrastructure/repositories/AlunnoRepository.ts:74                  |
| `findByClasse`               | CarenzaRepository                 | src/application/services/ReportService.ts:94                            |
| `findNonNotificate`          | CarenzaRepository                 | src/application/services/EmailNotificationService.ts:351                |
| `getCarenzePerMateria`       | CarenzaRepository                 | src/application/storico/StoricoAlunniService.ts:64                      |
| `toData`                     | Carenza                           | src/infrastructure/repositories/CarenzaRepository.ts:98                 |
| `resolveTitolare`            | CattedraResolver                  | src/onlinetests/checks/repositoryChecks.ts:102                          |
| `assembleFiltrato`           | CdcAssembler                      | src/application/context-engine/providers/AlunnoProvider.ts:67           |
| `assembleForClasse`          | CdcAssembler                      | src/application/context-engine/providers/ConsiglioClasseProvider.ts:25  |
| `anno`                       | Classe                            | src/domain/specifications/ClasseSpecs.ts:24                             |
| `classeId`                   | Classe                            | src/infrastructure/repositories/CarenzaRepository.ts:56                 |
| `findAttive`                 | ClasseRepository                  | src/application/context-engine/providers/StatisticheProvider.ts:25      |
| `getAllDocentiCDCArticolata` | ClasseRepository                  | src/application/context-engine/CdcAssembler.ts:28                       |
| `getCoordinatori`            | ClasseRepository                  | src/application/context-engine/providers/ClasseProvider.ts:51           |
| `getDocentiALT`              | ClasseRepository                  | src/application/context-engine/CdcAssembler.ts:47                       |
| `getDocentiIRC`              | ClasseRepository                  | src/application/context-engine/CdcAssembler.ts:46                       |
| `getIndirizzo`               | ClasseRepository                  | src/application/context-engine/providers/ClasseProvider.ts:28           |
| `getMateriaDocente`          | ClasseRepository                  | src/application/context-engine/providers/ClasseProvider.ts:54           |
| `getMaterieArticolazione`    | ClasseRepository                  | src/application/context-engine/providers/ClasseProvider.ts:84           |
| `getMaterieDelDocente`       | ClasseRepository                  | src/application/context-engine/CdcAssembler.ts:122                      |
| `getStudenti`                | ClasseRepository                  | src/application/context-engine/providers/StudentiProvider.ts:37         |
| `isArticolata`               | ClasseRepository                  | src/application/context-engine/providers/ClasseProvider.ts:30           |
| `getModelliJson`             | ConfigurazioneDocumento           | src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts:71 |
| `getTemplateIdSemplice`      | ConfigurazioneDocumento           | src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts:43 |
| `resolveTemplateId`          | ConfigurazioneDocumentoRepository | src/infrastructure/steps/documentSteps.ts:191                           |
| `shouldGenerate`             | ConfigurazioneDocumentoRepository | src/infrastructure/steps/documentSteps.ts:104                           |
| `getBoxes`                   | ConfigurazioneEmail               | src/application/email/boxes.ts:279                                      |
| `getColoreHeader`            | ConfigurazioneEmail               | src/infrastructure/steps/emailSteps.ts:288                              |
| `getCondizione`              | ConfigurazioneEmail               | src/infrastructure/steps/emailSteps.ts:181                              |
| `getTesto`                   | ConfigurazioneEmail               | src/infrastructure/steps/emailSteps.ts:270                              |
| `isNoreply`                  | ConfigurazioneEmail               | src/infrastructure/steps/emailSteps.ts:272                              |
| `getConfig`                  | ConfigurazioneImport              | src/application/import/ImportRecipeMapper.ts:98                         |
| `isAttivo`                   | ConfigurazioneImport              | src/infrastructure/repositories/ConfigurazioneImportRepository.ts:25    |
| `findAttivi`                 | ConfigurazioneImportRepository    | src/application/services/ImportService.ts:82                            |
| `build`                      | ContextBuilder                    | src/infrastructure/steps/emailSteps.ts:104                              |
| `registerInterceptor`        | ContextBuilder                    | src/application/context-engine/ContextEngineFactory.ts:47               |
| `registerProvider`           | ContextBuilder                    | src/application/context-engine/ContextEngineFactory.ts:47               |
| `applica`                    | CsvScope                          | src/domain/entities/Supplenza.ts:79                                     |
| `overlaps`                   | CsvScope                          | src/domain/entities/Supplenza.ts:105                                    |
| `getCapoEmail`               | Dipartimento                      | src/infrastructure/repositories/DipartimentoRepository.ts:37            |
| `getMaterieIds`              | Dipartimento                      | src/infrastructure/repositories/DipartimentoRepository.ts:41            |
| `findByMateria`              | DipartimentoRepository            | src/application/services/RisolutoreRuoliService.ts:159                  |
| `dipartimentoId`             | Docente                           | src/infrastructure/repositories/DocenteRepository.ts:64                 |
| `email`                      | Docente                           | src/domain/entities/ConsiglioDiClasse.ts:14                             |
| `isITP`                      | Docente                           | src/domain/specifications/DocenteSpecs.ts:20                            |
| `start`                      | DocumentBatchService              | src/config/Bootstrap.ts:208                                             |
| `generateForClasse`          | DocumentGenerationService         | src/application/services/DocumentBatchService.ts:66                     |
| `start`                      | EmailBatchService                 | src/config/Bootstrap.ts:219                                             |
| `enableTestMode`             | EmailNotificationService          | src/onlinetests/checks/pipelineChecks.ts:63                             |
| `getConfigurazione`          | EmailNotificationService          | src/application/services/EmailBatchService.ts:55                        |
| `sendPattern`                | EmailNotificationService          | src/application/services/EmailRetryService.ts:58                        |
| `sendToTarget`               | EmailNotificationService          | src/application/services/EmailBatchService.ts:71                        |
| `isPrimaProvaPerIndirizzo`   | EsameConfig                       | src/domain/specifications/MaterieEsameSpec.ts:9                         |
| `isSecondaProvaPerIndirizzo` | EsameConfig                       | src/domain/specifications/MaterieEsameSpec.ts:20                        |
| `findByIdCached`             | IndirizzoRepository               | src/infrastructure/repositories/ClasseRepository.ts:155                 |
| `containsClasse`             | LogCartella                       | src/infrastructure/repositories/LogCartellaRepository.ts:27             |
| `toData`                     | LogCartella                       | src/infrastructure/repositories/LogCartellaRepository.ts:55             |
| `cambiaStato`                | LogDocumento                      | src/infrastructure/repositories/LogDocumentoRepository.ts:84            |
| `containsClasse`             | LogDocumento                      | src/infrastructure/repositories/LogDocumentoRepository.ts:34            |
| `containsUtente`             | LogDocumento                      | src/infrastructure/repositories/LogDocumentoRepository.ts:38            |
| `getClassi`                  | LogDocumento                      | src/application/import/CustomSourceStrategies.ts:108                    |
| `getDataCreazione`           | LogDocumento                      | src/application/context-engine/providers/DocumentiProvider.ts:22        |
| `getLink`                    | LogDocumento                      | src/application/context-engine/providers/DocumentiProvider.ts:19        |
| `getSottotipo`               | LogDocumento                      | src/application/services/AggregatoreDati.ts:116                         |
| `getStato`                   | LogDocumento                      | src/infrastructure/repositories/LogDocumentoRepository.ts:44            |
| `isNotificato`               | LogDocumento                      | src/infrastructure/repositories/LogDocumentoRepository.ts:48            |
| `notifica`                   | LogDocumento                      | src/infrastructure/repositories/LogDocumentoRepository.ts:90            |
| `toData`                     | LogDocumento                      | src/infrastructure/repositories/LogDocumentoRepository.ts:73            |
| `getDestinatari`             | LogEmail                          | src/application/services/EmailRetryService.ts:59                        |
| `findFailed`                 | LogEmailRepository                | src/application/services/EmailRetryService.ts:43                        |
| `marcaSuccesso`              | LogEmailRepository                | src/application/services/EmailRetryService.ts:62                        |
| `registraInvio`              | LogEmailRepository                | src/infrastructure/steps/emailSteps.ts:430                              |
| `toData`                     | LogEmail                          | src/infrastructure/repositories/LogEmailRepository.ts:45                |
| `hasSupervisore`             | MasterConfig                      | src/infrastructure/steps/emailSteps.ts:407                              |
| `findAnniStorici`            | MasterSheetRepository             | src/application/storico/StoricoDatabaseProvider.ts:34                   |
| `findConfigAnnoCorrente`     | MasterSheetRepository             | src/infrastructure/steps/emailSteps.ts:406                              |
| `esameConfig`                | Materia                           | src/domain/specifications/MaterieEsameSpec.ts:9                         |
| `getEvoluzione`              | Materia                           | src/application/storico/reconcileSigla.ts:20                            |
| `equals`                     | MateriaId                         | src/domain/entities/Carenza.ts:89                                       |
| `materiaId`                  | Materia                           | src/application/services/RisolutoreRuoliService.ts:178                  |
| `findAllCached`              | MateriaRepository                 | src/application/storico/StoricoAlunniService.ts:67                      |
| `findByIdCached`             | MateriaRepository                 | src/application/context-engine/CdcAssembler.ts:100                      |
| `getOre`                     | OreASL                            | src/infrastructure/repositories/OreASLRepository.ts:40                  |
| `getOrCreate`                | OreASLRepository                  | src/application/context-engine/providers/AlunnoProvider.ts:76           |
| `getTotaleOre`               | OreASLRepository                  | src/infrastructure/repositories/AlunnoRepository.ts:84                  |
| `toData`                     | OreASL                            | src/infrastructure/repositories/OreASLRepository.ts:52                  |
| `al`                         | PeriodoSupplenza                  | src/domain/value-objects/PeriodoSupplenza.ts:48                         |
| `dal`                        | PeriodoSupplenza                  | src/infrastructure/repositories/SupplenzaRepository.ts:102              |
| `overlaps`                   | PeriodoSupplenza                  | src/domain/entities/Supplenza.ts:104                                    |
| `getParametri`               | Piano                             | src/application/context-engine/providers/PianiProvider.ts:22            |
| `isBES`                      | Piano                             | src/infrastructure/repositories/PianoRepository.ts:33                   |
| `hasDocente`                 | RuoloSpeciale                     | src/domain/specifications/RuoliPerDocenteSpec.ts:13                     |
| `findAllCached`              | RuoloSpecialeRepository           | src/application/context-engine/providers/SchoolProvider.ts:36           |
| `build`                      | SampleDatabaseBuilder             | src/onlinetests/index.ts:72                                             |
| `getDatabaseService`         | SheetDbAdapter                    | src/config/Bootstrap.ts:298                                             |
| `perAlunno`                  | StoricoAlunniService              | src/application/context-engine/providers/StoricoProvider.ts:26          |
| `contestoOverlaps`           | Supplenza                         | src/infrastructure/repositories/SupplenzaRepository.ts:138              |
| `findSupplenzaSpecifica`     | SupplenzaRepository               | src/infrastructure/steps/emailSteps.ts:332                              |
| `toData`                     | Supplenza                         | src/infrastructure/repositories/SupplenzaRepository.ts:144              |
| `report`                     | TestRunner                        | src/onlinetests/index.ts:87                                             |
| `isNota`                     | ValoreCarenza                     | src/application/services/ReportService.ts:160                           |
| `toString`                   | ValoreCarenza                     | src/infrastructure/repositories/CarenzaRepository.ts:98                 |
| `applicaAContesto`           | VariazioneCattedra                | src/infrastructure/repositories/VariazioneCattedraRepository.ts:37      |
| `isDecorsaA`                 | VariazioneCattedra                | src/application/services/CattedraResolver.ts:88                         |

#### A2.2 — 91 test-only (no production caller found) — needs manual judgment

These have a real caller, but only from `test/**`, never from `src/**` (verified with the
same type-checked method). This is a materially different signal than "confirmed dead":
the method has a working, asserted contract, just no production consumer the checker could
find. Before deleting any of these, check for: recipe/provider wiring the checker can't see
(same interface/duck-typing caveats as A2.3), intentional public API surface, or tests that
were written ahead of a caller that was never wired up.

| method                           | class                                         | file                                                                        |
| -------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| `perMetodo`                      | AggregatoreDati                               | src/application/services/AggregatoreDati.ts                                 |
| `isSatisfiedBy`                  | AlunniBESSpec                                 | src/domain/specifications/PianoSpecs.ts                                     |
| `toQueryObject`                  | AlunniBESSpec                                 | src/domain/specifications/PianoSpecs.ts                                     |
| `classeId`                       | Alunno                                        | src/domain/entities/Alunno.ts                                               |
| `findAttiviInClasse`             | AlunnoRepository                              | src/infrastructure/repositories/AlunnoRepository.ts                         |
| `findConBES`                     | AlunnoRepository                              | src/infrastructure/repositories/AlunnoRepository.ts                         |
| `getStoricoMovimenti`            | AlunnoRepository                              | src/infrastructure/repositories/AlunnoRepository.ts                         |
| `getAnnoPrecedente`              | AnnoCorso                                     | src/domain/value-objects/AnnoCorso.ts                                       |
| `getAnnoSuccessivo`              | AnnoCorso                                     | src/domain/value-objects/AnnoCorso.ts                                       |
| `isSeconda`                      | AnnoCorso                                     | src/domain/value-objects/AnnoCorso.ts                                       |
| `isSecondoBiennio`               | AnnoCorso                                     | src/domain/value-objects/AnnoCorso.ts                                       |
| `equals`                         | AnnoScolastico                                | src/domain/value-objects/AnnoScolastico.ts                                  |
| `getAnnoFine`                    | AnnoScolastico                                | src/domain/value-objects/AnnoScolastico.ts                                  |
| `getAnnoPrecedente`              | AnnoScolastico                                | src/domain/value-objects/AnnoScolastico.ts                                  |
| `getAnnoSuccessivo`              | AnnoScolastico                                | src/domain/value-objects/AnnoScolastico.ts                                  |
| `getNotificato`                  | Carenza                                       | src/domain/entities/Carenza.ts                                              |
| `getNumeroCarenze`               | Carenza                                       | src/domain/entities/Carenza.ts                                              |
| `hasCarenzaMateria`              | Carenza                                       | src/domain/entities/Carenza.ts                                              |
| `notifica`                       | Carenza                                       | src/domain/entities/Carenza.ts                                              |
| `equals`                         | ClasseId                                      | src/domain/value-objects/ClasseId.ts                                        |
| `findArticolate`                 | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `findByAnno`                     | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `findByIndirizzo`                | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `getAlunniAttivi`                | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `getDocentiPerMateriaArticolata` | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `getRuolo`                       | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `getStorico`                     | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `setCoordinatori`                | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `setRuolo`                       | ClasseRepository                              | src/infrastructure/repositories/ClasseRepository.ts                         |
| `hasNoCondizione`                | ConfigurazioneDocumento                       | src/domain/entities/ConfigurazioneDocumento.ts                              |
| `isOverwrite`                    | ConfigurazioneDocumento                       | src/domain/entities/ConfigurazioneDocumento.ts                              |
| `findByTipo`                     | ConfigurazioneDocumentoRepository             | src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts        |
| `getTemplateId`                  | ConfigurazioneDocumentoRepository             | src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts        |
| `findByProcesso`                 | ConfigurazioneEmailRepository                 | src/infrastructure/repositories/ConfigurazioneEmailRepository.ts            |
| `getBoxes`                       | ConfigurazioneEmailRepository                 | src/infrastructure/repositories/ConfigurazioneEmailRepository.ts            |
| `findByTarget`                   | ConfigurazioneImportRepository                | src/infrastructure/repositories/ConfigurazioneImportRepository.ts           |
| `isWildcard`                     | CsvScope                                      | src/domain/value-objects/CsvScope.ts                                        |
| `dipartimentoId`                 | Dipartimento                                  | src/domain/entities/Dipartimento.ts                                         |
| `findAllCached`                  | DipartimentoRepository                        | src/infrastructure/repositories/DipartimentoRepository.ts                   |
| `getCapoEmail`                   | DipartimentoRepository                        | src/infrastructure/repositories/DipartimentoRepository.ts                   |
| `getMaterieIds`                  | DipartimentoRepository                        | src/infrastructure/repositories/DipartimentoRepository.ts                   |
| `cognomeNome`                    | Docente                                       | src/domain/entities/Docente.ts                                              |
| `nomeConAppellativo`             | Docente                                       | src/domain/entities/Docente.ts                                              |
| `render`                         | DocumentoConTabelleImportateGeneratorStrategy | src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts |
| `getUrl`                         | DriveFileId                                   | src/domain/value-objects/DriveFileId.ts                                     |
| `disableTestMode`                | EmailNotificationService                      | src/application/services/EmailNotificationService.ts                        |
| `retryFailed`                    | EmailRetryService                             | src/application/services/EmailRetryService.ts                               |
| `executeAllActiveImports`        | ImportService                                 | src/application/services/ImportService.ts                                   |
| `indirizzoId`                    | Indirizzo                                     | src/domain/entities/Indirizzo.ts                                            |
| `findAllCached`                  | IndirizzoRepository                           | src/infrastructure/repositories/IndirizzoRepository.ts                      |
| `findByTipo`                     | IndirizzoRepository                           | src/infrastructure/repositories/IndirizzoRepository.ts                      |
| `getAllegati`                    | LogEmail                                      | src/domain/entities/LogEmail.ts                                             |
| `findByPattern`                  | LogEmailRepository                            | src/infrastructure/repositories/LogEmailRepository.ts                       |
| `annoScolastico`                 | MasterConfig                                  | src/domain/entities/MasterConfig.ts                                         |
| `findConfigPerAnno`              | MasterSheetRepository                         | src/infrastructure/repositories/MasterSheetRepository.ts                    |
| `getCartellaRoot`                | MasterSheetRepository                         | src/infrastructure/repositories/MasterSheetRepository.ts                    |
| `getDirigente`                   | MasterSheetRepository                         | src/infrastructure/repositories/MasterSheetRepository.ts                    |
| `getSpreadsheetId`               | MasterSheetRepository                         | src/infrastructure/repositories/MasterSheetRepository.ts                    |
| `findEsamePrima`                 | MateriaRepository                             | src/infrastructure/repositories/MateriaRepository.ts                        |
| `findEsameSeconda`               | MateriaRepository                             | src/infrastructure/repositories/MateriaRepository.ts                        |
| `isCambioClasse`                 | MovimentoAlunno                               | src/domain/entities/MovimentoAlunno.ts                                      |
| `isIngresso`                     | MovimentoAlunno                               | src/domain/entities/MovimentoAlunno.ts                                      |
| `isUscita`                       | MovimentoAlunno                               | src/domain/entities/MovimentoAlunno.ts                                      |
| `aggiungiOre`                    | OreASLRepository                              | src/infrastructure/repositories/OreASLRepository.ts                         |
| `findByAnno`                     | OreASLRepository                              | src/infrastructure/repositories/OreASLRepository.ts                         |
| `durata`                         | PeriodoSupplenza                              | src/domain/value-objects/PeriodoSupplenza.ts                                |
| `isAttiva`                       | PeriodoSupplenza                              | src/domain/value-objects/PeriodoSupplenza.ts                                |
| `isTerminata`                    | PeriodoSupplenza                              | src/domain/value-objects/PeriodoSupplenza.ts                                |
| `getOreASLEffettive`             | Progetto                                      | src/domain/entities/Progetto.ts                                             |
| `isASL`                          | Progetto                                      | src/domain/entities/Progetto.ts                                             |
| `getReportASL`                   | ReportService                                 | src/application/services/ReportService.ts                                   |
| `getReportCarenze`               | ReportService                                 | src/application/services/ReportService.ts                                   |
| `getStatisticheClasse`           | ReportService                                 | src/application/services/ReportService.ts                                   |
| `getStatisticheIstituto`         | ReportService                                 | src/application/services/ReportService.ts                                   |
| `findByDocente`                  | RuoloSpecialeRepository                       | src/infrastructure/repositories/RuoloSpecialeRepository.ts                  |
| `render`                         | SheetMaterieConPermessiGeneratorStrategy      | src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts      |
| `render`                         | SheetMaterieGeneratorStrategy                 | src/application/strategies/SheetMaterieGeneratorStrategy.ts                 |
| `applicaAContesto`               | Supplenza                                     | src/domain/entities/Supplenza.ts                                            |
| `creaSupplenza`                  | SupplenzaRepository                           | src/infrastructure/repositories/SupplenzaRepository.ts                      |
| `findAttive`                     | SupplenzaRepository                           | src/infrastructure/repositories/SupplenzaRepository.ts                      |
| `findBySupplente`                | SupplenzaRepository                           | src/infrastructure/repositories/SupplenzaRepository.ts                      |
| `getSupplente`                   | SupplenzaRepository                           | src/infrastructure/repositories/SupplenzaRepository.ts                      |
| `getTitolare`                    | SupplenzaRepository                           | src/infrastructure/repositories/SupplenzaRepository.ts                      |
| `isVoto`                         | ValoreCarenza                                 | src/domain/value-objects/ValoreCarenza.ts                                   |

#### A2.3 — 29 false positives from dispatch patterns invisible to static analysis

These showed **zero references anywhere**, including tests, under both the original graph
and the TS type checker — yet all 29 are demonstrably alive, because they're invoked
through one of five polymorphic/duck-typed seams that cross the `GasLibraryFactory`
repo boundary (plain JS, outside the TS program) or go through an ALDO-internal interface
type (so the checker resolves the call to the _interface's_ method declaration, not the
concrete class's):

1. **`toData()` — 14 entities** (`Classe`, `ConfigurazioneDocumento`, `ConfigurazioneEmail`,
   `ConfigurazioneImport`, `Dipartimento`, `Docente`, `Indirizzo`, `MasterConfig`, `Materia`,
   `MovimentoAlunno`, `Piano`, `Progetto`, `RuoloSpeciale`, `VariazioneCattedra`). `AldoEntity`
   extends `DomainRepositoryLib`'s `Entity`, whose `EntityMapper.toData(entity)` duck-types
   `typeof entity.toData === 'function'` and calls it whenever `Repository.save()` persists
   an entity (`GasLibraryFactory/DomainRepositoryLib/src/internal/mapping/EntityMapper.js:71`).
   The other 7 entities with a `toData()` in the original list (`Alunno`, `Carenza`,
   `LogCartella`, `LogDocumento`, `LogEmail`, `OreASL`, `Supplenza`) are the _same_ pattern,
   they just also happen to have an explicit `entity.toData()` call inline in their own
   repository (e.g. `LogDocumentoRepository.ts:73`), which is why they weren't zero-reference
   to begin with. **None of the 21 `toData` rows in the original A2 list are dead code.**
2. **`getKnownColumns()` — 1 entity static method** (`Classe.getKnownColumns`,
   `src/domain/entities/Classe.ts:65`). Same family of hook as `toData()`, opposite
   direction: `EntityMapper.hydrate()` calls `entity.captureDynamicColumns(transformedData)`
   whenever it is present (`EntityMapper.js:203-204`), and `Entity.captureDynamicColumns`
   duck-types `typeof this.constructor.getKnownColumns === 'function'` before calling it
   (`GasLibraryFactory/DomainRepositoryLib/src/Entity.js:169-172`) to know which hydrated
   columns are the entity's fixed schema vs. dynamic passthrough columns (CLASSI's
   per-subject cattedra matrix, ref `ClasseRepository.ts:352`). It runs on every
   `Classe.fromData()` hydration; the graph/type-checker miss it for the same reason they
   miss `toData()` — the call lives inside the library, on a duck-typed `this.constructor`
   reference, never as a statically-visible `Classe.getKnownColumns()` call in ALDO's own TS.
3. **`provide()` — 6 CDU providers** (`AlunnoProvider`, `CarenzeProvider`, `ClasseProvider`,
   `SchoolProvider`, `StatisticheProvider`, `StudentiProvider`). `ContextBuilder.registerProvider`
   stores each provider under its `ContextProvider` interface type; the library's
   `ContextAssembler.assembleInto()` calls `provider.provide(cdu, params, options)` on that
   interface type at recipe-execution time — never a direct, staticaly-visible call on the
   concrete class.
4. **`_executeLogic()` — 4 pipeline steps** (`ApplyPermissionsStep`, `BuildCDUStep`,
   `ComposeEmailStep`, `SendEmailStep`). `PipelineFramework`'s `Step.execute()` is a template
   method that calls `this._executeLogic(context)` (`GasLibraryFactory/PipelineFramework/src/Step.js:228`);
   every `Step` subclass overrides it, but the call only exists inside the library, not ALDO's
   own TS.
5. **4 `SheetDbAdapter`/`SheetTableAdapter` methods** hit by a _double_ type-substitution: real
   ALDO code always calls these through either the local `IDatabase`/`IReadableTable` interfaces
   (`this.db.commit()`, `this.db.table(...).insert(...)`) or `DomainRepositoryLib`'s own ambient
   `RepositoryDatabase`-shaped seam (`database.tables[TABLE.X]!.insertRow(...)`,
   `.createIndex(...)`, `.updateRowById(...)`, `.updateRowWhere(...)`, `.getByPK(...)`,
   `.select(...)`) — never directly on the concrete class type, so neither interface
   substitution resolves back to `SheetDbAdapter`/`SheetTableAdapter`'s own declarations.
   **This affects all 12 `SheetDbAdapter`/`SheetTableAdapter` rows in the original A2 list**
   (`beginTransaction`, `commit`, `rollback`, `select`, `table` on `SheetDbAdapter`;
   `createIndex`, `getByPK`, `insertRow`, `insert`, `updateRowById`, `updateRowWhere` on
   `SheetTableAdapter`) — confirmed by grepping real call sites in
   `DocumentGenerationService.ts`, `EmailNotificationService.ts`, `documentSteps.ts`, and
   most repository classes (`CarenzaRepository.ts`, `SupplenzaRepository.ts`,
   `LogEmailRepository.ts`, `ClasseRepository.ts`, etc.). `getDatabaseService` (also on
   `SheetDbAdapter`) was already correctly resolved as used (`Bootstrap.ts`), so it's excluded
   from this false-positive count.

**Practical takeaway:** any method that is the sole concrete implementation of a
library-consumed interface (`ContextProvider.provide`, `Step._executeLogic`,
`IDatabase`/`IReadableTable`) or that overrides a `DomainRepositoryLib`-dispatched hook
(`toData`, `getKnownColumns`) can _never_ show up as "used" in either the graph or a plain
type-checker analysis — this class of false positive should be excluded from future
dead-code passes by construction, not re-verified by hand each time.

#### A2.4 — 24 confirmed true dead code (no callers anywhere, verified by hand)

These have zero references anywhere in `src/**` or `test/**` — verified individually by
reading each candidate's file and its surrounding usage, ruling out the A2.3 dispatch
patterns and any local-variable name collisions (several of the getters below share a name
with a same-named local variable elsewhere, which is why plain-text search alone
over-counts "usage" for them).

Each row was additionally traced to _why_ it's dead — one of: a similar/overlapping
method already covers the case (**redundant**), ALDO reaches the same data or
behavior through a different path instead of calling this method (**bypass**),
the exact same check or value is reimplemented inline at the call site instead
of calling this method (**reimplementation**), the method just duplicates a
plain property that callers read directly (**property duplication**), or none
of the above (**other**).

The **How to proceed** column gives one concrete example of where the method could be wired
in (when a plausible one exists) or the reasoning for a straight deletion — these are
starting points, not an exhaustive fix list. Before acting on any of them, re-check current
call sites (they may have changed since this analysis) and confirm with the codebase-memory
graph that no new caller has appeared.

| method                 | class                             | file                                                                 | cause                | note                                                                                                                                                                                                                                                                                                                                               | how to proceed                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isAttivaOggi`         | Supplenza                         | src/domain/entities/Supplenza.ts                                     | redundant            | no callers anywhere; the sibling `isAttivaData(data: Date)` is what every real caller uses, always with an explicit date (`SupplenzaRepository.ts:59,83`)                                                                                                                                                                                          | Delete. `isAttivaData(new Date())` is a one-line call; no caller in the codebase needs an implicit "today" shortcut, so the wrapper adds no value over calling `isAttivaData` directly.                                                                                                                                                                                                                           |
| `supplenteEmail`       | Supplenza                         | src/domain/entities/Supplenza.ts                                     | property duplication | no property-access callers; every real caller (`SupplenzaRepository.ts`, `CattedraResolver.ts:108`) reads the raw public `supplente: string` field directly, not this `Email`-wrapping getter                                                                                                                                                      | Delete. If a caller ever needs a validated `Email`, it can call `Email.of(supplenza.supplente)` at that call site — no current caller does.                                                                                                                                                                                                                                                                       |
| `titolareEmail`        | Supplenza                         | src/domain/entities/Supplenza.ts                                     | property duplication | same as `supplenteEmail` — real callers use the raw `titolare: string` field directly                                                                                                                                                                                                                                                              | Delete, same reasoning as `supplenteEmail`.                                                                                                                                                                                                                                                                                                                                                                       |
| `isFailed`             | LogEmail                          | src/domain/entities/LogEmail.ts                                      | reimplementation     | `LogEmailRepository.findFailed()` (`LogEmailRepository.ts:34`) reimplements the identical check as `findByStato(StatoEmail.ERROR)` at the collection level instead of `findAll().filter(l => l.isFailed())`                                                                                                                                        | Delete the entity method — the repository-level filter is the one real query path and is arguably the right layer for this filter (avoids hydrating+filtering per entity). If a future caller needs the predicate on an already-hydrated `LogEmail`, reintroduce it then.                                                                                                                                         |
| `getLink`              | LogCartella                       | src/domain/entities/LogCartella.ts                                   | other                | no callers; `AggregatoreDati.getCartellePerClasse()` (`AggregatoreDati.ts:65`) already returns hydrated `LogCartella[]` to its one caller, but nothing downstream reads `.getLink()` on them yet — the sibling `LogDocumento.getLink()` _is_ used the same way, by `DocumentiProvider`/`StoricoDocumentiService`                                   | Example use: if a future CDU/UI surface needs to show folder links the way `DocumentiProvider.ts:19` shows document links, wire it in there. Otherwise delete — this is one illustrative option, not the only one; check for other consumers of `getCartellePerClasse` before deciding.                                                                                                                           |
| `nuovoTitolareEmail`   | VariazioneCattedra                | src/domain/entities/VariazioneCattedra.ts                            | property duplication | no callers; every real caller (`CattedraResolver.ts:90`, `VariazioneCattedraSpecs.ts:40`) reads the raw public `nuovoTitolare: string` field directly                                                                                                                                                                                              | Delete, same reasoning as `Supplenza.supplenteEmail`.                                                                                                                                                                                                                                                                                                                                                             |
| `vecchioTitolareEmail` | VariazioneCattedra                | src/domain/entities/VariazioneCattedra.ts                            | property duplication | same as `nuovoTitolareEmail` — real callers use the raw `vecchioTitolare: string` field                                                                                                                                                                                                                                                            | Delete, same reasoning.                                                                                                                                                                                                                                                                                                                                                                                           |
| `classeId`             | Carenza                           | src/domain/entities/Carenza.ts                                       | property duplication | no `.classeId` access on any `Carenza` instance; `CarenzaSpecs.ts:22,25` and `CarenzaRepository.ts:56` compare/read the raw `.classe: string` field directly                                                                                                                                                                                       | Delete. A validated `ClasseId` can be built at the call site with `ClasseId.of(carenza.classe)` if ever needed.                                                                                                                                                                                                                                                                                                   |
| `studenteEmail`        | Carenza                           | src/domain/entities/Carenza.ts                                       | property duplication | no callers; every real caller (`CarenzaSpecs.ts:11`, `EmailNotificationService.ts:352-361`, `ReportService.ts:139`) reads the raw `.studente: string` field directly                                                                                                                                                                               | Delete, same reasoning as `classeId`.                                                                                                                                                                                                                                                                                                                                                                             |
| `classeId`             | Progetto                          | src/domain/entities/Progetto.ts                                      | property duplication | no `.classeId` access on any `Progetto` instance; `ProgettoSpecs.ts:11,14` and `ProgettoRepository.ts:24` read the raw `.classe: string` field directly                                                                                                                                                                                            | Delete, same reasoning as `Carenza.classeId`.                                                                                                                                                                                                                                                                                                                                                                     |
| `studenteEmail`        | MovimentoAlunno                   | src/domain/entities/MovimentoAlunno.ts                               | property duplication | no callers; `MovimentoAlunnoSpecs.ts:11` reads the raw `.studente: string` field directly                                                                                                                                                                                                                                                          | Delete, same reasoning.                                                                                                                                                                                                                                                                                                                                                                                           |
| `studenteEmail`        | OreASL                            | src/domain/entities/OreASL.ts                                        | property duplication | no callers; `OreASLSpecs.ts:11` and `OreASLRepository.ts` read the raw `.studente: string` field directly                                                                                                                                                                                                                                          | Delete, same reasoning.                                                                                                                                                                                                                                                                                                                                                                                           |
| `annoScolastico`       | OreASL                            | src/domain/entities/OreASL.ts                                        | property duplication | no callers (all other `annoScolastico` matches in the codebase are unrelated locals/params or the `AnnoScolastico` VO on `MasterConfig`); `OreASLSpecs.ts:22,25` and `OreASLRepository.ts:23,34,50` read the raw `.anno: string` field directly                                                                                                    | Delete. A validated `AnnoScolastico` can be built at the call site with `AnnoScolastico.of(oreAsl.anno)` if ever needed.                                                                                                                                                                                                                                                                                          |
| `studenteEmail`        | Piano                             | src/domain/entities/Piano.ts                                         | property duplication | no callers; `PianoSpecs.ts:12` reads the raw `.studente: string` field directly                                                                                                                                                                                                                                                                    | Delete, same reasoning.                                                                                                                                                                                                                                                                                                                                                                                           |
| `equals`               | DipartimentoId                    | src/domain/value-objects/DipartimentoId.ts                           | reimplementation     | no callers anywhere, not even in tests (unlike `ClasseId.equals`/`AnnoScolastico.equals`/`MateriaId.equals`, which are used — see A2.1/A2.3); `DocentiPerDipartimentoSpec.isSatisfiedBy` (`DocenteSpecs.ts:10`) reimplements the same equality inline as `d.dipart === this.dipartId.value` instead of wrapping `d.dipart` and calling `.equals()` | Example fix: refactor `DocenteSpecs.ts:10` to `DipartimentoId.of(d.dipart).equals(this.dipartId)` and delete this method if that turns out to be the only plausible caller — but this is one example among the codebase's several raw `.value` comparisons; a proper cleanup should decide whether to standardize on `.equals()` everywhere or delete `.equals()` everywhere, not fix one call site in isolation. |
| `equals`               | Email                             | src/domain/value-objects/Email.ts                                    | reimplementation     | no callers anywhere; `RuoloSpeciale.hasDocente` (`RuoloSpeciale.ts:38`) reimplements the same equality inline as `e.value === email.value` instead of calling `e.equals(email)`                                                                                                                                                                    | Same pattern as `DipartimentoId.equals` — example fix at `RuoloSpeciale.ts:38`, same caveat about deciding on a codebase-wide convention first.                                                                                                                                                                                                                                                                   |
| `equals`               | IndirizzoId                       | src/domain/value-objects/IndirizzoId.ts                              | reimplementation     | no callers anywhere; `EsameConfig.isPrimaProvaPerIndirizzo`/`isSecondaProvaPerIndirizzo` (`EsameConfig.ts:25,29`) reimplement the same equality inline via `array.includes(ind.value)` instead of calling `.equals()` per candidate                                                                                                                | Same pattern and same caveat as the other two `equals` rows above.                                                                                                                                                                                                                                                                                                                                                |
| `findAllCached`        | ConfigurazioneDocumentoRepository | src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts | other                | no callers; its only consumers (`documentSteps.ts`) always look up a single config via `findById`/`shouldGenerate`/`resolveTemplateId`, never the full list — unlike sibling repos where `findAllCached` _is_ used (`MateriaRepository` from `CdcAssembler.ts:100`, `RuoloSpecialeRepository` from `SchoolProvider.ts:36`)                         | Delete, unless a future admin/reporting view needs to list every configured `CONF_DOC` row at once (this is an example scenario, not a confirmed need — check for such a screen before deleting).                                                                                                                                                                                                                 |
| `findAllCached`        | ConfigurazioneEmailRepository     | src/infrastructure/repositories/ConfigurazioneEmailRepository.ts     | other                | no callers; its only consumer (`EmailNotificationService.ts`) always looks up a single config via `findById`, never the full list                                                                                                                                                                                                                  | Delete, same reasoning and same caveat as `ConfigurazioneDocumentoRepository.findAllCached`.                                                                                                                                                                                                                                                                                                                      |
| `getCurriculum`        | AlunnoRepository                  | src/infrastructure/repositories/AlunnoRepository.ts                  | bypass               | all real call sites (`carenzeMapper.ts:32`) call `alunno.getCurriculum()` directly on the `Alunno` entity, bypassing this repository pass-through method entirely                                                                                                                                                                                  | Delete. The repository wrapper adds nothing over the entity method it forwards to; if a repository-level seam is wanted for testing, that's a design decision to make explicitly, not to leave as accidental unused surface.                                                                                                                                                                                      |
| `getTutors`            | AlunnoRepository                  | src/infrastructure/repositories/AlunnoRepository.ts                  | bypass               | same dead pass-through pattern — callers use `alunno.getTutors()` on the entity directly (`EmailNotificationService.ts:332,357`)                                                                                                                                                                                                                   | Delete, same reasoning as `getCurriculum`.                                                                                                                                                                                                                                                                                                                                                                        |
| `getEmails`            | RuoloSpecialeRepository           | src/infrastructure/repositories/RuoloSpecialeRepository.ts           | bypass               | same dead pass-through pattern — callers use `ruolo.getEmails()` on the entity directly (`SchoolProvider.ts:38`)                                                                                                                                                                                                                                   | Delete, same reasoning as `AlunnoRepository.getCurriculum`/`getTutors`.                                                                                                                                                                                                                                                                                                                                           |
| `resume`               | DocumentBatchService              | src/application/services/DocumentBatchService.ts                     | bypass               | `Bootstrap.riprendiJobSospeso` (`Bootstrap.ts:244-255`) calls `runner.resume(jobName, handler)` directly with a combined handler that registers _both_ `DocumentBatchService` and `EmailBatchService` in one call, instead of calling this method                                                                                                  | Delete. The bypass is structural, not accidental: a single shared JobRunnerLib resume trigger needs to register both job types' handlers together, which a per-service `resume()` cannot do alone — so this method was never a viable path once both batch services share one resume trigger.                                                                                                                     |
| `resume`               | EmailBatchService                 | src/application/services/EmailBatchService.ts                        | bypass               | same as `DocumentBatchService.resume` — bypassed by the same combined-handler call in `Bootstrap.riprendiJobSospeso`                                                                                                                                                                                                                               | Delete, same reasoning as `DocumentBatchService.resume`.                                                                                                                                                                                                                                                                                                                                                          |

---

## Section B — Excluded from analysis

- **Standard GAS entry points / triggers**: `onOpen`, `onEdit`, `onInstall`,
  `doGet`, `doPost`, `doPut`, `doDelete`, `resumeJob`, and any node with
  `is_entry_point = true` in the graph.
- **Test code**: any node with `is_test = true`, or under `test/**` / `__tests__/`
  paths — these are test helpers/fixtures, not application dead code, even when
  unreferenced outside their own test file.
- **`vendor/`, `dist/`, `node_modules`**: none found in the zero-caller result set
  (these are generated/vendored build output and correctly outside the indexed
  source graph's scope for this kind of check).
- **Dynamic-usage caveat**: symbols with 0 `CALLS` in-edges but at least one
  incoming `USAGE` edge were treated as "possibly referenced dynamically" rather
  than confidently dead; none surfaced as relevant in the `src/` false-positive
  review (the actual causes found were object-literal keys, callback references,
  GAS ambient-global entrypoints, and duck-typed structural consumption — see A1).

## Bottom line

- **ALDO application code has no confirmed dead code at the function level.**
- **266 ALDO methods were unreferenced candidates** at the graph level; after
  type-checked verification, 122 are real false positives with an ordinary
  production caller, 91 are exercised only by tests, 29 are false positives from
  duck-typed dispatch patterns the graph and type checker both miss by
  construction, and **24 are confirmed true dead code**, each traced to a
  specific cause (redundant wrapper, property duplication, inline
  reimplementation, or a bypassed pass-through) — see Section A2.4 for the
  per-method breakdown and suggested next step.
