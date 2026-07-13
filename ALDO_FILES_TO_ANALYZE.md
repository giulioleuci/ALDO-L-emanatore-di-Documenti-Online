# ALDO File-by-File GLF Delegation Analysis — Tracking

Goal: analyze every file in `src/` against GasLibraryFactory (GLF) capabilities (via `GasLibraryFactory/DOCS_LIBS`) to find residual ALDO reimplementations or missed GLF features. Findings go to `ALDO_GLF_AUDIT_RESULTS.md`.

Status legend: `[ ]` pending, `[x]` analyzed (see results file if findings), `[x] clean` analyzed, no findings.

## Group A — domain/entities + errors (21 files)
- [x] clean src/domain/entities/AldoEntity.ts
- [x] clean src/domain/entities/Alunno.ts
- [x] clean src/domain/entities/Carenza.ts
- [x] clean src/domain/entities/Classe.ts
- [x] clean src/domain/entities/ConfigurazioneDocumento.ts
- [x] clean src/domain/entities/ConfigurazioneEmail.ts
- [x] clean src/domain/entities/ConfigurazioneImport.ts
- [x] clean src/domain/entities/ConsiglioDiClasse.ts
- [x] clean src/domain/entities/Dipartimento.ts
- [x] clean src/domain/entities/Docente.ts
- [x] clean src/domain/entities/Indirizzo.ts
- [x] clean src/domain/entities/LogCartella.ts
- [x] clean src/domain/entities/LogDocumento.ts
- [x] clean src/domain/entities/LogEmail.ts
- [x] clean src/domain/entities/MasterConfig.ts
- [x] clean src/domain/entities/Materia.ts
- [x] clean src/domain/entities/MovimentoAlunno.ts
- [x] clean src/domain/entities/OreASL.ts
- [x] clean src/domain/entities/Piano.ts
- [x] clean src/domain/entities/Progetto.ts
- [x] clean src/domain/entities/RuoloSpeciale.ts
- [x] clean src/domain/entities/Supplenza.ts
- [x] clean src/domain/entities/VariazioneCattedra.ts
- [x] clean src/domain/errors/DomainError.ts

## Group B — domain/value-objects (14 files)
- [x] clean src/domain/value-objects/AnnoCorso.ts
- [x] clean src/domain/value-objects/AnnoScolastico.ts
- [x] clean src/domain/value-objects/ArticolazioneConfig.ts
- [x] clean src/domain/value-objects/ClasseId.ts
- [x] clean src/domain/value-objects/CsvScope.ts
- [x] clean src/domain/value-objects/DipartimentoId.ts
- [x] clean src/domain/value-objects/DriveFileId.ts
- [x] clean src/domain/value-objects/Email.ts
- [x] clean src/domain/value-objects/enums.ts
- [x] clean src/domain/value-objects/EsameConfig.ts
- [x] clean src/domain/value-objects/IndirizzoId.ts
- [x] clean src/domain/value-objects/MateriaId.ts
- [x] clean src/domain/value-objects/PeriodoSupplenza.ts
- [x] clean src/domain/value-objects/ValoreCarenza.ts

## Group C — domain/specifications + repositories interface (13 files)
- [x] clean src/domain/repositories/IClasseRepository.ts
- [x] clean src/domain/specifications/AlunniAttiviSpec.ts
- [x] clean src/domain/specifications/AlunnoSpecs.ts
- [x] clean src/domain/specifications/CarenzaSpecs.ts
- [x] clean src/domain/specifications/DocenteSpecs.ts
- [x] clean src/domain/specifications/IndirizziPerTipoSpec.ts
- [x] clean src/domain/specifications/MaterieEsameSpec.ts
- [x] clean src/domain/specifications/MateriePerDipartimentoSpec.ts
- [x] clean src/domain/specifications/MovimentoAlunnoSpecs.ts
- [x] clean src/domain/specifications/OreASLSpecs.ts
- [x] clean src/domain/specifications/PianoSpecs.ts
- [x] clean src/domain/specifications/ProgettoSpecs.ts
- [x] clean src/domain/specifications/RuoliPerDocenteSpec.ts
- [x] clean src/domain/specifications/Specification.ts

## Group D — infrastructure/repositories (17 files)
- [x] src/infrastructure/repositories/AlunnoRepository.ts
- [x] src/infrastructure/repositories/CarenzaRepository.ts
- [x] src/infrastructure/repositories/ClasseRepository.ts
- [x] src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts
- [x] src/infrastructure/repositories/ConfigurazioneEmailRepository.ts
- [x] src/infrastructure/repositories/ConfigurazioneImportRepository.ts
- [x] src/infrastructure/repositories/DipartimentoRepository.ts
- [x] src/infrastructure/repositories/DocenteRepository.ts
- [x] src/infrastructure/repositories/IndirizzoRepository.ts
- [x] src/infrastructure/repositories/LogCartellaRepository.ts
- [x] src/infrastructure/repositories/LogDocumentoRepository.ts
- [x] src/infrastructure/repositories/LogEmailRepository.ts
- [x] src/infrastructure/repositories/MasterSheetRepository.ts
- [x] src/infrastructure/repositories/MateriaRepository.ts
- [x] src/infrastructure/repositories/MovimentoAlunnoRepository.ts
- [x] src/infrastructure/repositories/OreASLRepository.ts
- [x] src/infrastructure/repositories/PianoRepository.ts
- [x] src/infrastructure/repositories/ProgettoRepository.ts
- [x] src/infrastructure/repositories/RuoloSpecialeRepository.ts
- [x] src/infrastructure/repositories/SupplenzaRepository.ts
- [x] src/infrastructure/repositories/VariazioneCattedraRepository.ts

## Group E — infrastructure/facades + db + services (12 files)
- [x] src/infrastructure/facades/ActiveUserFacade.ts
- [x] src/infrastructure/facades/DocumentTableFacade.ts
- [x] src/infrastructure/facades/DriveServiceFacade.ts
- [x] src/infrastructure/facades/ExpressionEngineFacade.ts
- [x] src/infrastructure/facades/GmailServiceFacade.ts
- [x] src/infrastructure/facades/ProcessMonitorFacade.ts
- [x] src/infrastructure/facades/PropertiesFacade.ts
- [x] src/infrastructure/facades/TemplateEngineFacade.ts
- [x] src/infrastructure/facades/UiFacade.ts
- [x] src/infrastructure/db/Database.ts
- [x] src/infrastructure/db/SheetDbAdapter.ts
- [x] src/infrastructure/services/AlberoCartelle.ts

## Group F — infrastructure/steps + config + entrypoints + presentation (9 files)
- [x] src/infrastructure/steps/documentSteps.ts
- [x] src/infrastructure/steps/emailSteps.ts
- [x] src/infrastructure/steps/postProcessActions.ts
- [x] src/config/Bootstrap.ts
- [x] src/config/schema.ts
- [x] src/config/ServiceContainer.ts
- [x] src/entrypoints/EntryPoints.ts
- [x] src/index.ts
- [x] src/presentation/Menu.ts

## Group G — application/context-engine top-level (10 files)
- [x] src/application/context-engine/CdcAssembler.ts
- [x] src/application/context-engine/Cdu.ts
- [x] src/application/context-engine/ContextBuilder.ts
- [x] src/application/context-engine/ContextEngineFactory.ts
- [x] src/application/context-engine/ContextProvider.ts
- [x] src/application/context-engine/dates.ts
- [x] src/application/context-engine/ElencoMaterieConPermessi.ts
- [x] src/application/context-engine/Recipe.ts
- [x] src/application/context-engine/studenti.ts
- [x] src/application/context-engine/techEntities.ts

## Group H — application/context-engine providers + interceptors + mappers (13 files)
- [x] src/application/context-engine/interceptors/SupplentiSubstitutionLookup.ts
- [x] src/application/context-engine/mappers/carenzeMapper.ts
- [x] src/application/context-engine/providers/AlunnoProvider.ts
- [x] src/application/context-engine/providers/CarenzaFocusProvider.ts
- [x] src/application/context-engine/providers/CarenzeProvider.ts
- [x] src/application/context-engine/providers/ClasseProvider.ts
- [x] src/application/context-engine/providers/ConsiglioClasseProvider.ts
- [x] src/application/context-engine/providers/DocumentiProvider.ts
- [x] src/application/context-engine/providers/PianiProvider.ts
- [x] src/application/context-engine/providers/RappresentantiProvider.ts
- [x] src/application/context-engine/providers/SchoolProvider.ts
- [x] src/application/context-engine/providers/StatisticheProvider.ts
- [x] src/application/context-engine/providers/StoricoProvider.ts
- [x] src/application/context-engine/providers/StudentiProvider.ts
- [x] src/application/context-engine/providers/TutorProvider.ts

## Group I — application/services + email + import (13 files)
- [x] src/application/services/AggregatoreDati.ts
- [x] src/application/services/CattedraResolver.ts
- [x] src/application/services/DocumentBatchService.ts
- [x] src/application/services/DocumentGenerationService.ts
- [x] src/application/services/EmailBatchService.ts
- [x] src/application/services/EmailNotificationService.ts
- [x] src/application/services/EmailRetryService.ts
- [x] src/application/services/ImportService.ts
- [x] src/application/services/ReportService.ts
- [x] src/application/services/RisolutoreRuoliService.ts
- [x] src/application/email/boxes.ts
- [x] src/application/email/saluto.ts
- [x] src/application/import/CustomSourceStrategies.ts
- [x] src/application/import/ImportRecipeMapper.ts

## Group J — application/storico + strategies (13 files)
- [x] src/application/storico/LazyRef.ts
- [x] src/application/storico/reconcileSigla.ts
- [x] src/application/storico/StoricoAlunniService.ts
- [x] src/application/storico/StoricoClassiService.ts
- [x] src/application/storico/StoricoDatabaseProvider.ts
- [x] src/application/storico/StoricoDocentiService.ts
- [x] src/application/storico/StoricoDocumentiService.ts
- [x] src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts
- [x] src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts
- [x] src/application/strategies/DocumentoGenericoGeneratorStrategy.ts
- [x] src/application/strategies/GeneratorStrategy.ts
- [x] src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts
- [x] src/application/strategies/SheetMaterieGeneratorStrategy.ts
- [x] src/application/strategies/VerbaleGeneratorStrategy.ts

## Group K — onlinetests (7 files)
- [x] src/onlinetests/checks/contextEngineChecks.ts
- [x] src/onlinetests/checks/pipelineChecks.ts
- [x] src/onlinetests/checks/repositoryChecks.ts
- [x] src/onlinetests/GasSampleSpreadsheetFactory.ts
- [x] src/onlinetests/index.ts
- [x] src/onlinetests/OnlineTestReport.ts
- [x] src/onlinetests/SampleDatabaseBuilder.ts

---
Total files: 146

**STATUS: ALL 146 FILES ANALYZED (2026-07-13).** Findings written to `ALDO_GLF_AUDIT_RESULTS.md`.
