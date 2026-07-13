# REPORT_GLF.md — ALDO ↔ GasLibraryFactory (GLF) Delegation Audit

**Purpose.** This report is a file-by-file audit of the ALDO source tree (`src/`, 146 files) against the 16 GasLibraryFactory (GLF) libraries it is built on. It is written for a coding agent whose next task is either (a) to change ALDO call sites to use existing GLF capabilities it currently bypasses, or (b) to extend GLF with new capabilities so ALDO can stop working around gaps.

**Method.** Three independent passes covered the whole `src/` tree with no overlap:
- **Infrastructure layer** — `src/infrastructure/**` (db, facades, repositories, services, steps)
- **Application layer** — `src/application/**` (context-engine, email, import, services, storico, strategies)
- **Domain / config / entrypoints / presentation** — `src/domain/**`, `src/config/**`, `src/entrypoints/**`, `src/index.ts`, `src/presentation/Menu.ts`

Each pass read every listed file in full, cross-referenced against `GasLibraryFactory/DOCS_LIBS/*.md` (per project convention, GLF was consulted via its docs, not its source, except where a doc was ambiguous), and checked for (1) native GAS global leaks outside `GoogleApiWrapper`, (2) hand-rolled logic duplicating a GLF capability, (3) GLF usage that is workaround-laden because GLF has a real gap, (4) domain-purity violations.

**Headline finding.** ALDO is a mature codebase that has already been through at least one dedicated GLF-delegation pass (see `docs/superpowers/plans/2026-07-10-extend-gaslib-and-mod-aldo.md`). No native GAS global leaks were found anywhere in `src/` outside `GoogleApiWrapper`. The remaining gaps are narrow and concentrated in: (1) specification-based query pushdown never being wired up end-to-end, (2) two services that need heterogeneous/dynamic role-resolution shapes `RoleResolutionLib` doesn't yet support, (3) wide dynamic-column tables that don't fit `DomainRepositoryLib`'s dirty-checking model, and (4) a Docs-side "insert data-driven table" directive that `WorkspaceTemplateEngine` only offers for Sheets.

---

## Category A: ALDO code that doesn't use GLF but could (GLF already has the capability)

### A1. Every repository's spec-filtered finder bypasses `Repository.find(specification)` and hand-rolls a linear scan instead

GLF's base `Repository` class (`GasLibraryFactory/DomainRepositoryLib/src/Repository.js:126-151`), which every ALDO repository extends, already implements `find(specification)`: it attempts to push the specification down into a `database.select().from(tableName)` query via `QueryTranslator`, falling back to `findAll()+filter` only when the spec can't be translated. ALDO never calls `this.find(spec)` anywhere in `src/`. Instead, every repository manually does `this.findAll().filter((x) => spec.isSatisfiedBy(x))`:

- `src/infrastructure/repositories/CarenzaRepository.ts:40,50,61`
- `src/infrastructure/repositories/DocenteRepository.ts:26,32`
- `src/infrastructure/repositories/AlunnoRepository.ts:43,47,57`
- `src/infrastructure/repositories/PianoRepository.ts:19,24,29`
- `src/infrastructure/repositories/OreASLRepository.ts:21,27`
- `src/infrastructure/repositories/ProgettoRepository.ts:20,26`
- `src/infrastructure/repositories/MovimentoAlunnoRepository.ts:20,26`
- `src/infrastructure/repositories/VariazioneCattedraRepository.ts:18,22,31`
- `src/infrastructure/repositories/SupplenzaRepository.ts:33,37,41,58`
- `src/infrastructure/repositories/LogDocumentoRepository.ts:29,33,37,41`
- `src/infrastructure/repositories/LogCartellaRepository.ts:24,28`
- `src/infrastructure/repositories/LogEmailRepository.ts:17,21`

**Root cause:** this is structurally blocked today, not an oversight — see **B1**. ALDO's domain `Specification<T>` contract is not duck-type-compatible with what `Repository.find()`/`QueryTranslator` expect, so the fast path is unreachable until B1 is resolved.

**Suggestion for a coding agent:** resolve B1 first (bridge the two Specification contracts in `DomainRepositoryLib`), then replace the `findAll().filter(...)` call sites above with `this.find(spec)`.

### A2. `SheetDBLib`'s `TableService.createIndex(columnName)` is never used anywhere in ALDO

`GasLibraryFactory/SheetDBLib/src/TableService.js:160-163` exposes `createIndex(...)` (backed by `TableSearchEngine.createIndex`/`indexedLookup`, `GasLibraryFactory/SheetDBLib/src/internal/query/TableSearchEngine.js:72,103`), confirmed unused anywhere in `src/` by grep. Every hot lookup column is instead scanned with `Array.filter`/`Array.find` after a full `getAllRows()`/`findAll()` load:
- `STUDENTE` in CARENZE, ASL, PIANI, MOV_ALUNNI
- `DESTINATARI`/`PATTERN` in LOG_MAIL
- `TITOLARE`/`SUPPLENTE` in SUPPLENZE
- `CLASSE` in PROGETTI

**Suggestion:** in the constructors of repositories that repeatedly filter by the same column (`CarenzaRepository`, `OreASLRepository`, `SupplenzaRepository`, `LogEmailRepository`), call `database.tables[TABLE.X].createIndex(COL_X.STUDENTE)` (etc.) once, and use the indexed path for hot lookups instead of `getAllRows().filter(...)`.

### A3. Manual row-scan instead of `getByPK` on tables that already have a synthetic composite PK

`SheetDbAdapter.SheetTableAdapter.updateRowWhere` (`src/infrastructure/db/SheetDbAdapter.ts:93-102`) and `postProcessActions.updateMatching` (`src/infrastructure/steps/postProcessActions.ts:38-52`) both do `table.getAllRows().find/filter(...)` to resolve a row by business-column match before calling `updateRowById`/`updateRowWhere`. This is the same O(n) scan pattern as A2, on the same composite-key tables (CARENZE, LOG_MAIL) that already get a synthetic `__PK` virtual column elsewhere in the same file (`SheetDbAdapter.ts:50-58`, via `defineVirtualColumn` + `setPrimaryKey`). Since the PK machinery already exists for these tables, `getByPK` (documented O(1) in SheetDBLib) could resolve the row directly instead of a linear scan.

**Suggestion:** expose a helper on `SheetTableAdapter` that computes the virtual PK from a match object and calls `this.table.getByPK(pk)` instead of `getAllRows().find(...)`.

### A4. `DocumentoConTabelleImportateGeneratorStrategy` re-derives the sheet-range resolution logic that `SheetByIdStrategy` already centralizes

`src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts:47-54` (`readSheetAsStrings`) manually computes the read range via `this.sheets.getSheetInfo(sheetFileId)[0]` → `gridProperties.rowCount`/`columnCount` → builds an A1 range string → `this.sheets.getRanges(...)`. This is the exact "resolve full sheet extent from `gridProperties`, build an A1 range, read it" logic that `GasDataImporter`'s `SheetByIdStrategy` already centralizes and that `src/application/import/CustomSourceStrategies.ts:readSheetRows` deliberately reuses (per that file's own comment about avoiding re-derivation). Here the derivation was reintroduced independently instead of shared.

**Gap detail / underlying GLF limitation:** see **B3-adjacent note under B-list item 5** — `SheetByIdStrategy.extract()` only returns header-mapped `Record<string, unknown>[]` rows, with no sibling API for raw `string[][]`, which is why this file couldn't just call the existing strategy directly. This entry is listed under Category A because the *range-resolution* part is a pure duplication; the *raw-array return shape* part is the genuine GLF gap (tracked as Category B item 5).

**Suggestion:** extract a shared helper (or a thin `SheetByIdStrategy`-backed reader returning `string[][]`) so `CustomSourceStrategies.ts` and this file share one column/row-count-to-range resolution path instead of two independently-maintained copies that can drift.

---

## Category B: ALDO code that doesn't use GLF or only partially uses it due to a GLF deficiency (extend GLF)

### B1. ALDO's domain `Specification<T>` contract is incompatible with `DomainRepositoryLib`'s `Repository.find()`/`QueryTranslator` contract — `toQueryObject()` is dead code

- **ALDO side:** `src/domain/specifications/Specification.ts:1-4` defines `isSatisfiedBy(candidate: T): boolean` + `toQueryObject(): Record<string, unknown> | null`. Every concrete spec (`CarenzePerAlunnoSpec`, `AlunniInClasseSpec`, `DocentiPerDipartimentoSpec`, and ~10 others under `src/domain/specifications/`) implements `toQueryObject()`, but grepping `toQueryObject` outside `domain/specifications/` returns **nothing** — it is never called by any repository or infrastructure code.
- **GLF side:** `GasLibraryFactory/DomainRepositoryLib/src/Repository.js:126-151` (`find`) and `GasLibraryFactory/DomainRepositoryLib/src/internal/query/QueryTranslator.js:24-75` (`translate`/`validate`) expect a *different* duck-typed contract: `specification.canBeTranslatedToQuery()` and `specification.toQuery(queryBuilder)`, where `queryBuilder` is a `SheetDBLib` `AdvancedQueryBuilder` obtained from `database.select(['*']).from(tableName)`.
- **The gap:** ALDO deliberately built `toQueryObject()` returning a plain criteria object instead of `toQuery(queryBuilder)`, almost certainly to keep `src/domain/specifications/*` free of any GLF/infra import (per this repo's CLAUDE.md: "The Domain layer is agnostic of Google Sheets/Drive/Gmail"). Implementing `toQuery(queryBuilder: AdvancedQueryBuilder)` directly in domain code would require importing `AdvancedQueryBuilder` types into the domain layer, violating Clean Architecture. `DomainRepositoryLib` offers no lighter, framework-agnostic translation seam (e.g. a plain `{column: value}` criteria object that the library itself turns into a query) — only the `canBeTranslatedToQuery`/`toQuery(queryBuilder)` pair. As a result, `toQueryObject()` was built for exactly this purpose and then stranded with no consumer, and every repository fell back to A1's manual `findAll().filter()`.
- **Suggested GLF extension:** add an alternate translation path to `QueryTranslator`/`Repository.find()` that recognizes a specification exposing `toQueryObject(): Record<string,unknown> | null` (equality-only criteria) and internally builds the `AdvancedQueryBuilder` `.where()` calls from it:
  ```js
  if (typeof specification.toQueryObject === 'function') {
    const criteria = specification.toQueryObject();
    if (criteria) {
      const query = this.database.select(['*']).from(this.tableName);
      for (const [col, val] of Object.entries(criteria)) query.where(col, '=', val);
      const rows = query.execute();
      return this.hydrationService.hydrateMany(rows, this.EntityClass);
    }
  }
  // ...existing canBeTranslatedToQuery/toQuery path, then in-memory fallback
  ```
  This lets domain-pure specs (zero GLF import) still get the indexed/query-pushdown fast path. Once this lands, resolve **A1** in ALDO by switching the twelve repositories to `this.find(spec)`.

### B2. `DomainRepositoryLib`'s dirty-checking `save(entity)` cannot round-trip wide dynamic-column tables, forcing manual `updateRowById`/`updateRowWhere` column patches

- `src/infrastructure/repositories/ClasseRepository.ts:299-329` (`setCoordinatori`, `setDocentiRuolo`, `writeColumn`) — the in-code comment explains: CLASSI is a wide dynamic-column table (a per-subject cattedra matrix generated from MATERIE rows at construction time) and the `Classe` entity only carries its fixed columns, so `Repository.save(entity)` would dehydrate only the fixed columns and silently drop the cattedra matrix. These column-level edits therefore go through the raw table seam (`updateRowById`) instead.
- `src/infrastructure/repositories/CarenzaRepository.ts:82-91` (`setCarenzaMateria`) has the identical shape: it manually spreads `carenza.toData()`, patches one dynamic subject column, and calls `updateRowWhere` directly rather than `Repository.save(carenza)`.
- **GLF side:** `DomainRepositoryLib_docs.md` advertises "Dirty Checking" as a core feature ("Il repository sa quali campi sono cambiati e aggiorna solo quelli"), but this presumes the Entity class enumerates every physical column. There is no documented mechanism for an entity to declare "pass through any column not in my fixed schema unchanged" for tables whose column set is data-driven.
- **Suggested GLF extension:** add an opt-in "dynamic column passthrough" mode to the base `Entity`/`Repository.save()` dehydration path — e.g. a `getDynamicColumns()` hook on the Entity base class that returns extra raw column values captured at hydration time and merges them back unmodified during `save()`'s dehydrate step. This would let callers with matrix tables (CLASSI, CARENZE) use `save(entity)` for single-column edits instead of hand-building the merged row and calling `updateRowById`/`updateRowWhere` directly.

### B3. `CattedraResolver`'s 3-tier priority resolution has no matching primitive in `RoleResolutionLib`

- `src/application/services/CattedraResolver.ts:9-34` (whole class) implements the spec-mandated priority resolution SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI ("who actually teaches this class/subject today," per `SPECS_ALDO`'s role-resolution hierarchy).
- **GLF side:** `RoleResolutionLib` (per `RoleResolutionLib_docs.md`) offers Chain-of-Responsibility transitive delegation crawling over one homogeneous `RoleRegistry`/`DelegationSource` model (Alice→Bob→Charlie), plus `RoutingPolicy` for Primary/CC distribution. It has no concept of a *priority-ordered list of heterogeneous data sources* (three differently-shaped Sheet tables) where only the highest-priority source that produces a hit wins.
- The one sub-piece that *does* fit the library's existing model — chain-resolving an active supplenza's substitute-of-substitute — is already correctly delegated via `SupplenzaRepository.findSupplenzaSpecifica` → `RoleResolutionLib.getDelegationChain` (confirmed by the in-code comment there). So this is a genuine partial-gap case, not pure non-use.
- **Suggested GLF extension:** add a `PriorityChainResolver` (or a `RoleRegistry` construction option) that accepts an ordered array of adapter functions/`DelegationSource`-like objects, each queried in order until one returns non-null, with the winning source's result then optionally run back through the existing transitive-delegation crawl. This would let `CattedraResolver.baseTitolari`/`applicaSupplenza` collapse into one library call instead of two hand-written priority methods.

### B4. `RisolutoreRuoliService.applicaSupplenze` hand-rolls a routing-policy switch that `RoutingPolicy` almost covers, but can't because delegates are dynamically resolved

- `src/application/services/RisolutoreRuoliService.ts:216-251` (`applicaSupplenze`) implements a hand-rolled `SOLO_SUPPLENTI`/`ENTRAMBI`/`SOLO_TITOLARI` switch for role→email resolution. This is the same underlying gap as B3, applied to routing instead of cattedra lookup.
- **GLF side:** this shape is almost exactly `RoutingPolicy` (`RoleResolutionLib_docs.md`: "Routing Policies: Decide chi deve ricevere comunicazioni in presenza di una delega — solo il delegato, entrambi come primary, o il delegante in CC") — *if* the library's delegation model could represent a per-(titolare, materia, classe, date)-scoped delegate resolved dynamically at call time, rather than a statically pre-registered `RoleRegistry` entry. The library's `Scoped Assignments` concept (Manager at Department level, Viewer at Document level) is the closest existing primitive but isn't wired for "delegate resolved by querying SUPPLENZE at call time."
- Same underlying gap surfaces a third time in `src/application/context-engine/interceptors/SupplentiSubstitutionLookup.ts:39-84` (`createSupplentiSubstitutionLookup`) — its own doc comment explains that the library's generic `SwapAndEnrichInterceptor`/`_forEachAt` plumbing (already extended for this purpose in a prior task) still can't express the 3-way `GestioneSupplenti` outcome through its own gating, because `optionFlag` is boolean-only. ALDO carries the entire rule as a hand-written policy function instead of configuration. This split (policy vs. plumbing) is intentional and documented, not an oversight — but it's the same missing primitive.
- **Suggested GLF extension:** let `RoutingPolicy` accept a delegate-resolver *function* (not just a pre-registered `RoleRegistry` entry) so `GestioneSupplenti.SOLO_SUPPLENTI`/`ENTRAMBI`/`SOLO_TITOLARI` could be expressed as one of the library's built-in `RoutingPolicy` strategies (`DELEGATE_ONLY`/`BOTH_PRIMARY`/`PRINCIPAL_ONLY`) parametrized with `SupplenzaRepository.findSupplenzaSpecifica` as the resolver callback. As a second, complementary change, extend `SwapAndEnrichInterceptor`'s `optionFlag` to accept either a boolean or an enum-keyed policy table (`{ [ruleValue]: 'annotate' | 'replace' | 'skip' }`), or give it the same delegate-resolver-driven `RoutingPolicy` hook. Together these would let `RisolutoreRuoliService.applicaSupplenze` and `SupplentiSubstitutionLookup.ts` collapse from three independent hand-written policy implementations into one library-level construct, consistent with how every other interceptor use in this codebase is already purely configuration.

### B5. `SheetMaterieConPermessiGeneratorStrategy`'s post-pass ACL protection can't be expressed inside `dynamic_columns`'s own `acl=` expression

- `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts:22-40` (class doc comment + `protectColumns`) needs to protect each `dynamic_columns`-resolved Sheet column with an editor list computed via role-resolution + supplenza-chain logic (`RisolutoreRuoliService`).
- **GLF side:** `WorkspaceTemplateEngine`'s `dynamic_columns` directive already supports a static per-item `acl=` expression (`WorkspaceTemplateEngine_docs.md` §"Placeholder `{{dynamic_columns[...]}}`"), but that expression is evaluated once per item against the item's own data — it cannot invoke a stateful role-resolution service or read the live CDU's supplenza state.
- As a result, ALDO reimplements protection as a separate `protectColumns` pass over the `layout` the directive returns, matching columns back to subjects via a parallel `siglaOrder` array that `SheetMaterieGeneratorStrategy.ts` builds by hand — necessary because `SheetColumnLayout` carries no business identifier to correlate a column back to its subject.
- This is documented in the class comment as a deliberate, well-reasoned workaround, not a plain oversight.
- **Suggested GLF extension:** either (a) let `dynamic_columns`'s `acl=` expression optionally resolve through an injected resolver callback (not just `mustache.getValue` against the per-item data), or (b) extend the `layout.columns[]` return contract to carry an opaque per-item business key (e.g. `id`), so ALDO wouldn't need to reconstruct `siglaOrder` positionally. Either change would let the ACL step move from a bolted-on post-pass into the directive's own single call.

### B6. `SheetByIdStrategy.extract()` has no raw-array sibling, forcing a duplicate range-resolution implementation for table-insertion use cases

- Related to Category **A4**. `GasDataImporter`'s `SheetByIdStrategy.extract()` (the reusable "resolve full sheet extent from `gridProperties`, read as A1 range" logic) only returns header-mapped `Record<string, unknown>[]` rows, since it targets import recipes. `DocumentTableManager.insertTableAtMarker`'s table-insertion contract needs raw `data: string[][]` instead, which is why `src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts:47-54` couldn't just call `SheetByIdStrategy` and had to re-derive the range logic locally.
- **Suggested GLF extension:** add `SheetByIdStrategy.extractRaw(config)` (or expose the internal `_resolveFullRange(sheetInfo)` helper as a small standalone utility on `GoogleApiWrapper`/`GasDataImporter`) that returns the raw grid without header-object mapping, so both `CustomSourceStrategies.ts` and `DocumentoConTabelleImportateGeneratorStrategy.ts` share one column/row-count-to-A1-range derivation instead of maintaining two copies that can drift independently.

### B7. `WorkspaceTemplateEngine` has no Docs-side equivalent of `dynamic_columns` for inserting a data-driven table at an arbitrary marker

- `src/infrastructure/facades/DocumentTableFacade.ts:1-56` defines its own regex (`TABELLA_PATTERN`, line 22), its own marker-scan/removal logic (`findTablePlaceholders`, `removeText`), and its own table-insertion orchestration (`appendTable`, `insertTableAtMarker`) as a bespoke facade layered on top of raw `DocumentService` primitives. Those low-level primitives (`scanDocumentStructure`, `document(fileId).replaceText/createTable`, `insertTableAtMarker`) *are* GLF's own (`GoogleApiWrapper/src/internal/services-managers/DocumentContentExtractor.js:189` and `DocumentTableManager.js:1295`) — this is not a case of reimplementing native GAS calls, but of reimplementing *orchestration* GLF doesn't offer at a higher level.
- **GLF side:** `WorkspaceTemplateEngine_docs.md:22-90` documents `{{dynamic_columns[...]}}` explicitly and only for Google Sheets ("Placeholder `{{dynamic_columns[...]}}` (Google Sheets)"). There is no analogous "insert an array-driven table into a Google Doc at a placeholder" directive in the Mustache/pipe-filter engine.
- **The gap:** because `PlaceholderService`'s Mustache engine has no first-class "table" placeholder for Docs, ALDO invented its own marker syntax (`{{TABELLA:<sheetFileId>}}`), scans for it manually before generic `{{...}}` substitution runs, and orchestrates clear-then-insert itself from the application layer.
- **Suggested GLF extension:** add a Docs-side structural directive to `WorkspaceTemplateEngine` (e.g. `{{table[source=<cduPath>, target=<docFileId-or-embedded>]}}`) mirroring the existing Sheets `dynamic_columns` design (the Interpreter/Strategy pattern is already in place for Sheets), so `PlaceholderService.processDocument()` can expand data-driven tables in-place the same way `processSheet()` does for columns. This would let ALDO retire `IDocumentTableFacade`'s bespoke marker-scanning layer entirely.

### B8. `ServiceContainer.ts` hand-rolls a generic DI container because `GoogleApiWrapper`'s `ServiceFactory` pattern isn't exposed generically

- `src/config/ServiceContainer.ts:5-18` hand-rolls a generic lazy-singleton DI container (`register`/`get`, `Map<string, Factory>`, `Map<string, unknown>` cache) to wire ALDO's own application services (`DocumentGenerationService`, `EmailNotificationService`, etc. — see `src/config/Bootstrap.ts:83-165`).
- **GLF side:** `GoogleApiWrapper`'s internal `ServiceFactory` (`GasLibraryFactory/GoogleApiWrapper/src/internal/core/ServiceFactory.js`) implements exactly this pattern — lazy singletons with `configure()`/`reset()` — and `LIBRERIE_GESTIONE.md:41-46` states "Ogni progetto deve inizializzare i servizi base tramite la `ServiceFactory`... Fondamentale: nuova service wiring dovrebbe passare da `ServiceFactory`." But it is scoped specifically to native-Google-service singletons (Drive/Sheets/Docs/Gmail/Logger/Utilities/Cache/Exception), not a generic-purpose container a consumer app can register arbitrary factories into.
- **Gap:** GLF has no generic, importable `Container`/`ServiceFactory`-like L0 utility a consumer app can instantiate for its own domain/application-service wiring.
- **Suggested GLF extension:** extract `ServiceFactory`'s generic register/lazy-resolve/reset machinery into a small reusable class in `CoreUtilsLib` (e.g. `GenericServiceContainer`, or a `ServiceFactory.createChildContainer()` API) so consumer apps like ALDO can compose it instead of re-implementing the same lazy-singleton bookkeeping. `ServiceContainer.ts` and `Bootstrap.ts`'s `resetAldo()`/module-level `runtime` cache (`Bootstrap.ts:206-211`) would then delegate to that shared base rather than duplicating the "cached singleton + reset for tests" idiom GLF's own `ServiceFactory.reset()` already establishes.

### B9. `Bootstrap.ts` must open a second `DatabaseService` instance solely because `GasDataImporter`'s `Loader` can't accept an already-adapted database handle

- `src/config/Bootstrap.ts:236-240` — the comment explicitly documents the workaround: "GasDataImporter's Loader writes through the raw SheetDBLib table API (insertRows/updateRowById), not the ALDO IDatabase port — a second `DatabaseService` instance over the same spreadsheet, scoped to this one execution."
- **GLF side:** `GasDataImporter` (per `LIBRERIE_GESTIONE.md:30`, L2) is the "configurable data-import engine (JSON recipes) for bulk-loading into SheetDB," but its `Loader` apparently only accepts a raw `DatabaseService`, not an already-adapted `IDatabase`/`SheetDbAdapter` wrapper — forcing ALDO to instantiate a duplicate `DatabaseService` against the same spreadsheet just to hand one to the importer.
- **Suggested GLF extension:** add a constructor/factory overload to `GasDataImporter`'s `ImportEngine` (or its `Loader`) that accepts an existing `DatabaseService` instance (or exposes a `.getDatabaseService()` accessor), so callers can share one instance per spreadsheet per execution instead of opening two `DatabaseService`s against the same `annoCorrente.idSpreadsheet`.

---

## Files audited with no findings (confirmed clean)

Listed for completeness so a coding agent doesn't re-audit them without new information.

**Infrastructure layer:** `src/infrastructure/facades/DriveServiceFacade.ts`, `ExpressionEngineFacade.ts`, `TemplateEngineFacade.ts`, `GmailServiceFacade.ts`, `ProcessMonitorFacade.ts`, `PropertiesFacade.ts`, `UiFacade.ts`; `src/infrastructure/db/Database.ts`, `SheetDbAdapter.ts` (aside from A3); repositories not named in A1/B1/B2 (`ConfigurazioneDocumentoRepository`, `ConfigurazioneEmailRepository`, `ConfigurazioneImportRepository`, `DipartimentoRepository`, `IndirizzoRepository`, `MasterSheetRepository`, `MateriaRepository`, `RuoloSpecialeRepository`); `src/infrastructure/services/AlberoCartelle.ts`; `src/infrastructure/steps/documentSteps.ts`, `emailSteps.ts`, `postProcessActions.ts` (aside from A3).

**Application layer:** `context-engine/CdcAssembler.ts`, `Cdu.ts`, `ContextBuilder.ts` (uses `ContextAssembler.assembleInto`), `ContextEngineFactory.ts` (uses library `SwapAndEnrichInterceptor` + `targetPaths`), `ContextProvider.ts`, `dates.ts` (delegates to `CoreUtilsLib.UtilsService.formatDate`), `ElencoMaterieConPermessi.ts`, `Recipe.ts`, `studenti.ts`, `techEntities.ts`, `mappers/carenzeMapper.ts`, all 13 `providers/*.ts`; `email/boxes.ts` (escaping via `HtmlSanitizer`, composition via `ComposableContentLib`), `email/saluto.ts`; `import/CustomSourceStrategies.ts` (delegates to `SheetByIdStrategy`), `import/ImportRecipeMapper.ts`; `services/AggregatoreDati.ts`, `DocumentBatchService.ts` (`JobRunnerLib`), `DocumentGenerationService.ts` (`PipelineFramework`), `EmailBatchService.ts` (`JobRunnerLib`), `EmailNotificationService.ts` (`PipelineFramework`), `EmailRetryService.ts`, `ImportService.ts` (`GasDataImporter.ImportEngine.runImport`), `ReportService.ts`; `storico/*.ts` (all 6 files); `strategies/DocPersonalizzatoGeneratorStrategy.ts`, `DocumentoGenericoGeneratorStrategy.ts`, `GeneratorStrategy.ts`, `SheetMaterieGeneratorStrategy.ts`, `VerbaleGeneratorStrategy.ts`.

**Domain / config / entrypoints / presentation:** all 21 `domain/entities/*.ts`, `domain/errors/DomainError.ts`, `domain/repositories/IClasseRepository.ts`, all 12 `domain/specifications/*.ts`, all 14 `domain/value-objects/*.ts`; `config/schema.ts`, `config/Bootstrap.ts` (aside from B8/B9); `entrypoints/EntryPoints.ts`, `src/index.ts`, `presentation/Menu.ts`. No native GAS global leaks found anywhere in `src/` outside `GoogleApiWrapper` (verified by grep across the whole tree; the only hit was a doc-comment mention of "PropertiesService" in `src/domain/entities/MasterConfig.ts:12`, not a code reference).

---

## Suggested prioritization for a coding agent

1. **B1** (bridge `Specification.toQueryObject()` into `QueryTranslator`) — unlocks **A1** (12 call sites) and **A2**/**A3** adjacent indexing wins in one coordinated change; highest leverage, touches both GLF and ALDO.
2. **B9** (shared `DatabaseService` handle for `GasDataImporter`) — small, low-risk GLF API addition, removes a documented workaround in the composition root.
3. **B6** (`SheetByIdStrategy.extractRaw`) + **A4** — small GLF addition that also lets ALDO delete a duplicated range-resolution implementation.
4. **B2** (dynamic-column passthrough in `DomainRepositoryLib.save()`) — affects two repositories (`ClasseRepository`, `CarenzaRepository`); moderate GLF design work.
5. **B3/B4** (priority-chain + dynamic delegate resolver in `RoleResolutionLib`) — the largest single GLF extension, but consolidates three independent hand-written policy implementations (`CattedraResolver`, `RisolutoreRuoliService`, `SupplentiSubstitutionLookup`) into one library construct.
6. **B5** (ACL resolver hook or business-key in `dynamic_columns` layout) and **B7** (Docs-side table directive) — larger `WorkspaceTemplateEngine` feature work; lower urgency since current workarounds are documented and functionally correct.
7. **B8** (generic `ServiceContainer`/`ServiceFactory` extraction) — pure refactor/DRY opportunity, no functional gap, lowest priority.
