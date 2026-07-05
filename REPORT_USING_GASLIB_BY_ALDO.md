# Analysis Report: Integration and Usage of GasLibraryFactory in ALDO (SGSA)

This report provides a detailed, comprehensive, and exhaustive analysis of how the ALDO (Sistema di Gestione Scolastica Automatizzata - SGSA) codebase utilizes the `GasLibraryFactory` libraries. The goal of this analysis is to identify:
1. **GasLibraryFactory features reimplemented by ALDO** that should be refactored and integrated to avoid code duplication and leverage core enhancements.
2. **ALDO custom implementations driven by GasLibraryFactory deficiencies or limitations** (even partial ones), suggesting library enhancements to close these gaps.

---

## 🏗️ 1. Architecture and Library Mapping Overview

ALDO is designed as a Clean Architecture system built on top of the 16 core libraries from `GasLibraryFactory` (L0 to L4). Below is a mapping of the libraries and their usage status in ALDO:

| Layer | Library Name | Responsibility | ALDO Usage / Integration Status |
| :--- | :--- | :--- | :--- |
| **L0** | `CoreUtilsLib` | Stateless utilities (Date, Regex, PII, UUID) | Used for logging; custom date formatting duplicated in ALDO. |
| **L0** | `GasResilienceLib` | Stability: Retries, Backoff, Circuit Breaker | Bypassed; not integrated into ALDO's custom pipeline step executions. |
| **L0** | `GasOnlineTestFramework` | Natve GAS testing framework | Used for testing the core monorepo. |
| **L1** | `GoogleApiWrapper` | Batch-first Google APIs (Drive, Docs, Sheets) | Interfaced via Facades (`DriveServiceFacade`). |
| **L1** | `GasSchemaValidatorLib` | Structural data validation (Zod-based) | Bypassed; ALDO does not validate database/file inputs via this library. |
| **L2** | `SheetDBLib` | ORM-lite, advanced querying, transactions | Partially used; advanced querying and transaction controls bypassed. |
| **L2** | `GasExpressionEngineLib` | AST-based logic expression evaluator | Facaded (`ExpressionEngineFacade`), but bypassed inside pipeline steps. |
| **L2** | `WorkspaceTemplateEngine` | Document/Sheet template engine with filters | Used in Facades; custom string placeholders duplicated in ALDO steps. |
| **L3** | `JobRunnerLib` | Long-running tasks via recursive triggers | Missing; ALDO runs all processes synchronously, risking GAS timeouts. |
| **L3** | `PipelineFramework` | ETL Chain of Responsibility step engine | Reimplemented; ALDO uses custom pipeline orchestrators. |
| **L3** | `ContextEngine` | Dependency injection context assembler | Used for registries; hierarchical assembler reimplemented by ALDO. |
| **L3** | `DomainRepositoryLib` | Base classes for DDD (Entity, Repository, Spec) | Well integrated; repositories inherit from the library base. |
| **L3** | `GasDataImporter` | ETL configurator for importing data | Missing; ALDO has not yet implemented the application ImportService. |
| **L4** | `RoleResolutionLib` | Transitive role delegation and routing | Reimplemented; ALDO manually resolves supply chains in code. |
| **L4** | `ComposableContentLib` | Component-based HTML composition | Not yet used (reserved for the email box-rendering system). |
| **L4** | `GasProcessMonitorLib` | Live sidebar/dashboard tracking of GAS jobs | Not yet integrated. |

---

## ⛓️ A. GasLibraryFactory Features Reimplemented by ALDO (To Integrate)

The following core features of `GasLibraryFactory` are duplicated or manually implemented in ALDO's TypeScript code. These must be integrated to ensure ALDO remains lightweight and benefits from the resilience, testing, and optimization layers of the core libraries.

### 1. Custom Pipeline Orchestration Framework
*   **ALDO Files:** `src/infrastructure/pipelines/DocumentoPipeline.ts`, `Step.ts`, `PipelineContext.ts`
*   **Core Library Feature:** `PipelineFramework` (L3) exports `Pipeline`, `Step`, and `PipelineContext`.
*   **Redundancy Analysis:** ALDO has written custom logic to loop through steps, evaluate `shouldExecute()`, catch errors, and manage context state. 
*   **Risks & Disadvantages:**
    *   ALDO's custom pipeline is completely disconnected from `GasResilienceLib` (L0) and `GasProcessMonitorLib` (L4). It cannot perform automatic retries on Google API rate limits or update sidebar progress in real-time.
    *   It misses library features like `requestStop()`, execution history tracking, and `continueOnError` step-level configuration (which ALDO manually coded as a `critical` flag).
*   **Integration Plan:**
    1.  Delete ALDO's custom `Step.ts`, `PipelineContext.ts`, and `DocumentoPipeline.ts`.
    2.  Import `Pipeline`, `Step`, and `PipelineContext` from the `@PipelineFramework` global namespace.
    3.  Refactor ALDO's steps (`documentSteps.ts`) to extend the library's `Step` class, moving step-specific execution into the template method `_executeLogic(context)`.
    4.  Configure the `Pipeline` inside `DocumentGenerationService.ts` using the library orchestrator.

### 2. Custom String Placeholder Resolver
*   **ALDO Files:** `resolvePlaceholders` function in `src/infrastructure/steps/documentSteps.ts` (lines 12-23).
*   **Core Library Feature:** `WorkspaceTemplateEngine` (L2)'s `PlaceholderService.processString(template, context)`.
*   **Redundancy Analysis:** ALDO uses a simple regex replacement `/\{\{([^}]+)\}\}/g` to resolve dotted paths from the CDU to populate configuration properties like `FILE_NAME` and `PATH_OUT`.
*   **Risks & Disadvantages:**
    *   ALDO's custom regex lacks support for Unix-style filters (such as `date`, `uppercase`, `lowercase`) which are explicitly required by the specifications (`14_SERVIZI_UTILITY.md` §6).
    *   It is prone to errors on nested properties or null/undefined fields, whereas `WorkspaceTemplateEngine` has prototype pollution protection and robust AST parsing.
*   **Integration Plan:**
    1.  Remove the custom `resolvePlaceholders` function.
    2.  Instantiate `PlaceholderService` inside `DocumentGenerationService` (or retrieve it from the dependency injection container).
    3.  Replace all calls to `resolvePlaceholders(template, cdu)` in `documentSteps.ts` with `placeholderService.processString(template, cdu)`.

### 3. Manual Role Substitution and supply chains (Transitive Delegation)
*   **ALDO Files:** `src/application/services/CattedraResolver.ts` and `SupplenzaRepository.resolveChain()` in `src/infrastructure/repositories/SupplenzaRepository.ts` (lines 87-94).
*   **Core Library Feature:** `RoleResolutionLib` (L4).
*   **Redundancy Analysis:** `SupplenzaRepository.resolveChain()` uses a recursive call with a `visited` set to resolve substitute-of-substitute chains (Priority 1 resolution) to prevent infinite loops. `CattedraResolver` then manually maps Priority 1 (Supplenze), Priority 2 (Variazioni), and Priority 3 (Classi nominal) teachers.
*   **Risks & Disadvantages:**
    *   This is a direct reimplementation of transitive delegation and cycle-guarding, which `RoleResolutionLib` performs natively via the Chain of Responsibility pattern.
    *   It is brittle and hardcoded, making it difficult to scale role resolution for more complex assignments (e.g. `COORDINATORI`, `CDC_FILTER_ALUNNO`, `REF_BES` described in `14_SERVIZI_UTILITY.md`).
*   **Integration Plan:**
    1.  Refactor `RisolutoreRuoliService` (from `14_SERVIZI_UTILITY.md` §1) as the central orchestrator using `RoleResolutionLib`'s `RoleRegistry` and `RoutingPolicy` strategies.
    2.  Delegate the recursive supply chain lookup to the library instead of maintaining a custom `resolveChain` loop in the repository.

### 4. Legacy Simplified ContextBuilder
*   **ALDO Files:** `src/application/context/ContextBuilder.ts` and `src/application/context/Cdu.ts`.
*   **Core Library Feature:** `ContextEngine` (L3).
*   **Redundancy Analysis:** The codebase contains a legacy folder `src/application/context/` containing a simplified `ContextBuilder` that hardcodes a minimal CDU representation. However, `src/application/context-engine/` implements the production-ready modular `ContextBuilder` built on top of `ContextEngine`'s `ProviderRegistry` and `InterceptorRegistry`. `DocumentGenerationService.ts` still imports and uses the simplified legacy class.
*   **Risks & Disadvantages:**
    *   The service cannot generate documents requiring complex data relationships because the simplified builder doesn't trigger any providers or interceptors.
    *   Maintains dead/duplicate code that conflicts with the real `ContextEngine` implementation.
*   **Integration Plan:**
    1.  Delete the `src/application/context/` directory.
    2.  Update `DocumentGenerationService.ts` and its integration tests to import the modular `ContextBuilder` from `src/application/context-engine/ContextBuilder.ts` wired via `ContextEngineFactory.create(database)`.

### 5. Manual Expression and Template Evaluation in Steps
*   **ALDO Files:** `AnalyzeContextStep` and `SelectTemplateStep` in `src/infrastructure/steps/documentSteps.ts`.
*   **Core Library Feature:** `GasExpressionEngineLib` (L2) and `ConfigurazioneDocumentoRepository` helper methods.
*   **Redundancy Analysis:** The steps parse raw strings and check conditions manually (e.g., checking if the condition is null/empty or if a template's condition is exactly `"true"`) instead of using the repository methods (`shouldGenerate` and `resolveTemplateId`), which are designed to delegate condition evaluation to `GasExpressionEngineLib` (via `ExpressionEngineFacade`).
*   **Risks & Disadvantages:**
    *   The pipeline cannot evaluate actual boolean expressions (e.g. `{{focus.classe.anagrafica.anno}} == 5`) in conditions or template selectors because the steps lack access to the expression engine.
*   **Integration Plan:**
    1.  Inject `ExpressionEngineFacade` (or pass the repository that wraps it) into `AnalyzeContextStep` and `SelectTemplateStep`.
    2.  Refactor `AnalyzeContextStep` to call `ConfigurazioneDocumentoRepository.shouldGenerate(config, cdu, expressionEngine)`.
    3.  Refactor `SelectTemplateStep` to call `ConfigurazioneDocumentoRepository.resolveTemplateId(config, cdu, expressionEngine)`.

### 6. Missing JobRunnerLib Integration (Generator-Based Batch Processing)
*   **ALDO Files:** `DocumentGenerationService.ts` (specifically `generateForClasse` / batch execution).
*   **Core Library Feature:** `JobRunnerLib` (L3).
*   **Redundancy / Gap:** To prevent Google Apps Script execution timeouts (6/30 minutes), the specs require batch processes (e.g. generating documents for all active classes) to be implemented as generator functions (`yield` checkpoints) scheduled by `JobRunnerLib`. Currently, ALDO has no generator functions and does not reference `JobRunnerLib`.
*   **Risks & Disadvantages:**
    *   Running batch generations synchronously will trigger execution timeout failures in production when processing large sets of classes or students.
*   **Integration Plan:**
    1.  Rewrite the batch entry points (`generateBatch`) as generator functions using `yield` at each class or student checkpoint.
    2.  Integrate the generators with `JobRunnerLib` to automatically serialize the progress state in `ScriptProperties` and register timed triggers for execution resumption.

### 7. Unused SheetDBLib Transaction / ACID Controls
*   **ALDO Files:** `src/infrastructure/repositories/*` (e.g., `ClasseRepository.ts` writing columns).
*   **Core Library Feature:** `SheetDBLib` (L2)'s `beginTransaction()` and `commit()` APIs.
*   **Redundancy / Gap:** Currently, ALDO performs mutations (like inserting log folders or document rows) and immediately calls `database.save()` without transaction boundaries.
*   **Risks & Disadvantages:**
    *   If a pipeline step fails midway (e.g., a folder is created and registered in `LOG_FOLD`, but copying the file in `CloneTemplateStep` throws an error), the system has no transaction rollback for database sheets, leaving the database in an inconsistent state.
*   **Integration Plan:**
    1.  Wrap multi-step pipeline executions in a transaction block using the ORM's transactional APIs.
    2.  Only call `commit()` when the pipeline successfully runs to completion.

---

## 🛠️ B. Custom Implementations in ALDO due to GasLibraryFactory Deficiencies

The following custom systems were implemented in ALDO because the core libraries either lacked domain-specific features, had design limitations, or were completely domain-agnostic.

### 1. Hierarchical CDU Assembly vs. Flat ContextEngine Map
*   **ALDO Context:** The *Contesto Dati Unificato* (CDU) requires a highly structured, nested object layout (e.g. `cdu.focus.classe.anagrafica.nome`, `cdu.focus.alunno.didattica.carenze`) to allow templates and box renderers to easily access data using dot-notation.
*   **Library Limitation:** The `ContextEngine` L3 library's `ContextAssembler` is designed to produce a flat, provider-keyed key-value map. It does not natively support nesting or structuring data into hierarchical JSON trees.
*   **ALDO Solution:** ALDO had to implement its own custom merge loop in `ContextBuilder` (in `src/application/context-engine/ContextBuilder.ts`) using the registries as dependencies. Each provider directly receives the mutable, nested `Cdu` object and mutates its respective paths.
*   **Recommended Library Enhancement:** Introduce a `HierarchicalContextAssembler` or a schema-driven mapper in `ContextEngine` that allows developers to define a target JSON schema tree and map provider keys to specific paths in the nested structure.

### 2. Lack of Native Generator Yielding / Chunking in WorkspaceTemplateEngine
*   **ALDO Context:** Parsing long documents (e.g., school reports or verbali with hundreds of pages and placeholders) can trigger GAS execution timeouts during the replacement phase.
*   **Library Limitation:** `WorkspaceTemplateEngine`'s document rendering facade (`processDocument` / `renderDoc`) runs synchronously and cannot yield execution natively. It does not support generator functions or chunked processing.
*   **ALDO Solution:** ALDO is forced to handle this complexity at the strategy layer (e.g., inside `VerbaleGeneratorStrategy`), where the developer must manually chunk the work and coordinate checkpoints with `JobRunnerLib`.
*   **Recommended Library Enhancement:** Add generator-based API endpoints to `PlaceholderService` (e.g. `processDocumentGenerator`) that `yield` after processing a configurable number of paragraphs, tables, or sections, allowing easy integration with `JobRunnerLib` out of the box.

### 3. Domain-Agnostic Nature of RoleResolutionLib
*   **ALDO Context:** ALDO must resolve school-specific priorities (`SUPPLENZE` > `VARIAZIONI_CATTEDRA` > `CLASSI`) and roles (`COORDINATORI`, `CDC`, `TUTOR_ASL`) into concrete email lists.
*   **Library Limitation:** `RoleResolutionLib` (L4) is an abstract, domain-agnostic organizational routing library. It knows nothing about the relational tables and domain terms of ALDO.
*   **ALDO Solution:** ALDO had to hand-roll `RisolutoreRuoliService` and a set of custom strategies mapping the database schema to the library's concepts.
*   **Recommended Library Enhancement:** Create a data-source adapter registry inside `RoleResolutionLib` so developers can register custom data query adapters (like `SheetDB` queries) directly inside the library instead of writing custom strategy wrappers around the library.

### 4. Lack of Streaming / Chunking in GasDataImporter
*   **ALDO Context:** Importing massive external Excel or CSV files from Drive into database sheets.
*   **Library Limitation:** `GasDataImporter` reads and parses the entire file synchronously, risking immediate timeout before any `yield` checkpoint can run.
*   **ALDO Solution:** ALDO must accept timeout risks during the initial parsing phase or write custom pre-processing scripts to chunk the files before triggering the import.
*   **Recommended Library Enhancement:** Support stream-based parsing or chunked parsing (e.g. reading only the first N rows, yielding, and resuming) inside `GasDataImporter`.

### 5. Mismatched or Missing Ambient TypeScript Types (`types/gaslibs/index.d.ts`)
*   **ALDO Context:** Strong TypeScript safety is required in the ALDO application layer.
*   **Library Limitation:** `GasLibraryFactory` is written in JavaScript and does not ship with TypeScript definitions.
*   **ALDO Solution:** The type definitions in `types/gaslibs/index.d.ts` had to be written manually from scratch based on the documentation markdown files. This resulted in type drift, such as declaring `class WorkspaceTemplateEngine` with `renderDoc` when the actual class in the library is `PlaceholderService`.
*   **Recommended Library Enhancement:** Migrate `GasLibraryFactory` to TypeScript, or integrate JSDoc-based type generation during the Webpack build process to output matching `.d.ts` files automatically.

---

## 📅 3. Summary of Refactoring Actions

```mermaid
graph TD
    subgraph ALDO Custom Code (Current)
        A1[Custom DocumentoPipeline / Step]
        A2[resolvePlaceholders regex function]
        A3[resolveChain supply chain recursion]
        A4[Legacy ContextBuilder]
    end

    subgraph GasLibraryFactory (L0-L4)
        B1[PipelineFramework L3]
        B2[WorkspaceTemplateEngine L2]
        B3[RoleResolutionLib L4]
        B4[ContextEngine L3]
    end

    A1 -->|Refactor to use| B1
    A2 -->|Refactor to use| B2
    A3 -->|Refactor to use| B3
    A4 -->|Delete / Migrate to| B4
```

1.  **Phase 1: Pipeline & Placeholder Refactoring**
    *   Delete ALDO custom pipeline files.
    *   Import `@PipelineFramework` global classes.
    *   Replace `resolvePlaceholders` with `PlaceholderService.processString()`.
2.  **Phase 2: Context Engine & Role Resolution Refactoring**
    *   Clean up `src/application/context/` directory.
    *   Refactor `SupplenzaRepository` and `CattedraResolver` to use `RoleResolutionLib`.
    *   Update pipeline steps to use `IExpressionEngine` for conditional logic.
3.  **Phase 3: JobRunner & Transaction Integration**
    *   Rewrite batch methods as generator functions (`yield`).
    *   Register batch generators with `JobRunnerLib` to schedule execution triggers.
    *   Implement transactional boundaries in application services using `beginTransaction()` and `commit()`.
