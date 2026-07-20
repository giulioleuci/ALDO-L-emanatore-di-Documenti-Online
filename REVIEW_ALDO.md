# ALDO / SGSA — Code-Health Review

Date: 2026-07-18
Method: `codebase-memory-mcp` graph queries against project `home-giulio-Desktop-ALDO-implementing` (9,550 nodes / 25,990 edges; `src/` scope: 1,746 nodes / 5,987 edges), with every reported finding confirmed by reading the real source. Scope: `src/` and `test/`; `GasLibraryFactory/` used only to validate linkage.

## Executive summary

The codebase is in very good health. No Critical findings. Bypass detection, layering, GAS-V8 sync-only compliance, and library linkage are all clean. The findings that matter, ranked:

| # | Severity | Finding | Where |
|---|----------|---------|-------|
| 1 | Important | Supervisor BCC is **not** suppressed in test-send mode (cc is, bcc isn't) — preview sends leak to the supervisor | `src/application/pipelines/emailSteps.ts:413` |
| 2 | Important | `{{...}}` interpolation of raw (unescaped) CDU values into email HTML via `CONF_MAIL.TESTO`, `testo_dinamico` `CONTENUTO`, and `TESTO_VUOTO` — the one remaining HTML-injection surface after the recent XSS fixes | `src/application/pipelines/emailSteps.ts:295`, `src/application/email/boxes.ts:370-371`, `boxes.ts:508` |
| 3 | Minor | `PianiPersClasseProvider` overwrites the whole `focus.classe.didattica` object instead of assigning one key — fragile against future providers | `src/application/context-engine/providers/PianiPersClasseProvider.ts:52` |
| 4 | Minor | Confirmed duplicated logic: `orderedPartners` (identical in two classes), `sigle()` cache helper (identical in two providers) | `CdcAssembler.ts:159` / `ClasseRepository.ts:294`; `CarenzeProvider.ts:34` / `StudentiProvider.ts:77` |
| 5 | Minor | Four production-dead public methods (used only by tests) | `DriveServiceFacade.countFilesInFolder`, `ConfigurazioneDocumentoRepository.getTemplateId`, `MasterSheetRepository.getCartellaRoot` / `getDirigente` |
| 6 | Minor | Application services depend on and construct concrete repository classes instead of the domain interfaces Bootstrap could inject | e.g. `RisolutoreRuoliService.ts:66-72`, `ReportService.ts:76-81`, `EmailNotificationService.ts:126-135` |
| 7 | Minor | `PeriodoSupplenza.of` catch conflates *any* `DateRange` construction error into the "DAL ≤ AL" message | `src/domain/value-objects/PeriodoSupplenza.ts:24-28` |
| 8 | Info | `studente.email` is spread unescaped into the piani_pers Mustache context | `src/application/email/boxes.ts:248-250` |

---

## 1. Bypass detection (native GAS globals, library internals)

**Clean — confirmed.**

- Graph search + raw grep for `SpreadsheetApp|DriveApp|DocumentApp|MailApp|GmailApp|PropertiesService|CacheService|UrlFetchApp|Utilities|Session|ScriptApp|LockService` across `src/**/*.ts`: **every hit is a comment/docstring** (e.g. `PropertiesFacade.ts:3-4`, `GmailServiceFacade.ts:3-4`, repository `this.cache` doc comments). Zero code-level uses.
- No `async` / `await` / `Promise` / `setTimeout` / `setInterval` anywhere in `src/` (raw grep: 0 matches). GAS V8 sync-only constraint fully respected.
- Library access goes through the ALDO facades in `src/infrastructure/facades/` and the `SheetDbAdapter` stack. The only library symbols touched outside `infrastructure/` are ambient globals used by the facades' own composition and the two documented domain-layer exceptions below.

**Info — documented sanctioned exceptions in the domain layer.** `src/domain/value-objects/Email.ts:4` instantiates `CoreUtilsLib.UtilsService` and `src/domain/value-objects/PeriodoSupplenza.ts:25` uses `CoreUtilsLib.DateRange`, both as ambient globals (no imports). Both carry explicit waiver comments referencing `ALDO_GLF_AUDIT_RESULTS.md` B-1/B-2. Strictly speaking the domain layer is no longer library-free, but this is a deliberate, documented decision (delegation-over-reimplementation wins per CLAUDE.md). No action needed; keep the waiver comments in sync if the audit doc moves.

## 2. Clean Architecture conformance

**Layering: clean.** Graph boundary analysis shows strictly unidirectional package flow: `application → {infrastructure, domain}`, `infrastructure → domain`, `config → all`, `domain → nothing` (fan-out 0). Cypher check for `src/domain/` files importing outside `src/domain/`: **0 rows**. Cypher check for mutual `IMPORTS` cycles between any two `src/` modules: **0 rows**. No circular dependencies.

**Minor — application layer depends on infrastructure concretions.** Confirmed at, e.g.:

- `src/application/services/RisolutoreRuoliService.ts:66-72` — constructor does `new ClasseRepository(database)`, `new DocenteRepository(database)`, … (7 repos)
- `src/application/services/ReportService.ts:76-81`, `AggregatoreDati.ts:41-44`, `CattedraResolver.ts:43-46` — same pattern
- `src/application/services/EmailNotificationService.ts:125-135` — static `create()` builds 10 repositories plus `new ExpressionEngineFacade()`

This is an *established, consistent* pattern (Bootstrap itself passes only the `db` handle and lets services build their cheap repository adapters; the same construction style appears in `Bootstrap.ts:105`, `152`, `183`), and tests substitute via `FakeDatabase`, so it works in practice. But it contradicts the letter of CLAUDE.md ("never constructed ad hoc inside application code") and means services type against concrete classes even where `I*Repository` interfaces exist in `src/domain/repositories/` (both are imported side by side, e.g. `RisolutoreRuoliService.ts:2-3`). Recommendation: when a service needs repository-specific methods beyond the domain interface, widen the domain interface rather than importing the concretion; otherwise accept constructor-injection of the interface with Bootstrap doing the `new`. Low urgency — behavior is correct today.

**Wiring: clean.** All services resolve through `buildAldoContainer` / `ServiceContainer` (`src/config/Bootstrap.ts:85-200`); `initAldo()` is the single composition root; `onOpen` does not eagerly init. Strategies are registered data-driven per `CONF_DOC.GENERATORE` (`Bootstrap.ts:92-131`).

## 3. Linkage correctness (ALDO → GasLibraryFactory)

**Clean — spot-checked via the combined graph.** Examples verified end-to-end:

- `DriveServiceFacade.copyFile` → `DriveFileManager.copyFiles` (`GasLibraryFactory/GoogleApiWrapper/src/services/drive/DriveFileManager.js:152`) — batch-form call `[{fileId, name, destinationFolder}], {}` matches; `successful/failed` result shape handled (`DriveServiceFacade.ts:61-74`).
- `DriveServiceFacade.setPermission` → `PermissionService.shareWithUsers` (`PermissionService.js:53`) — `[fileIds], [{type, role, email}], {}` matches.
- `Email.of` → `UtilsService.isValidEmail`; `PeriodoSupplenza` → `DateRange.contains/durationInDays/overlaps` — all exist in `CoreUtilsLib`.
- The facades additionally document that they are verified against the real vendored bundle in `test/build` harness tests (`DriveServiceFacade.ts` header comment), which is the right belt-and-braces for a stale-index risk.

No calls into non-existent library functions or mismatched signatures were found.

## 4. Dead code

Context: the 2026-07-16 audit already cleared the bulk; graph `max_degree`+grep sweep on `src/` (excluding `onlinetests/`, constructors, interface-dispatched methods, and entrypoint globals) leaves:

**Minor — confirmed production-dead (only referenced from tests):**

- `DriveServiceFacade.countFilesInFolder` — `src/infrastructure/facades/DriveServiceFacade.ts:85` (and `IDriveFacade` member at line 7). Zero `src/` call sites.
- `ConfigurazioneDocumentoRepository.getTemplateId` — `src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts:42`. Zero `src/` call sites (`getTemplateIdSemplice` is called directly elsewhere).
- `MasterSheetRepository.getCartellaRoot` / `getDirigente` — `src/infrastructure/repositories/MasterSheetRepository.ts:52` / `:55`. Zero `src/` call sites.

Recommendation: remove them (and the `IDriveFacade.countFilesInFolder` member) or leave a one-line comment if they are intentional forward-looking API surface.

**Info — test-only API (probably intentional):** `EmailNotificationService.disableTestMode` (production code calls only `enableTestMode`, from `src/onlinetests/checks/pipelineChecks.ts:63`); `LazyRef.isResolved` (assertion helper for tests). Fine to keep.

**Not dead (graph false positives, verified by grep):** `ContextBuilder.registerProvider/registerInterceptor` (chained-builder calls, `ContextEngineFactory.ts:84-101`), `VerbaleGeneratorStrategy.render` (strategy dispatch), all facade methods called through `I*` interfaces (`ProcessMonitorFacade.*`, `SheetDbAdapter.beginTransaction/commit/rollback`, `TemplateEngineFacade.processString`, etc.).

## 5. Bug hunting

**Important — supervisor BCC leaks in test-send mode.** `src/application/pipelines/emailSteps.ts:404-415` (`SendEmailStep._executeLogic`):

```ts
if (supervisore !== null) opts.bcc = [supervisore];
// Test-send mode redirects `to` to the tester; a real cc recipient must not leak alongside it (11 §15).
if (dest.cc !== undefined && testEmail === null) opts.cc = dest.cc;
```

Commit `2068905` suppressed **cc** during test-send preview with exactly the "must not leak" rationale, but **bcc is still attached unconditionally**: every preview email redirected to the tester is also BCC'd to `MASTER.SUPERVISORE_EMAIL`. The spec (`SPECS_ALDO/01_SCHEMA_DATABASE.md:17`) says the supervisor gets BCC on "tutte le email del sistema", so this may arguably be intended — but it is inconsistent with the cc fix and means test noise reaches a real mailbox. Recommended fix: `if (supervisore !== null && testEmail === null) opts.bcc = [supervisore];` (or make it an explicit product decision and document it next to the cc line). Confirmed in source; classified Important-candidate pending the product call.

**Important — unescaped CDU interpolation in admin-authored email templates.** The vendored `WorkspaceTemplateEngine`'s `{{var}}` deliberately does **not** HTML-escape (documented at `src/application/email/boxes.ts:148-159`). The box renderers compensate by pre-escaping `nome`/`link`/`sottotipo`/`nomeCompleto` before `processString` (`boxes.ts:160-162`, `243-251`) — good. But three paths interpolate the **raw CDU** into HTML with no escaping of the substituted values:

- `ComposeEmailStep`: `this.templates.processString(conf.getTesto(), cduRecord(ctx))` — `src/application/pipelines/emailSteps.ts:295` (`CONF_MAIL.TESTO`).
- `testo_dinamico` box: `templates.processString(str(options.config['CONTENUTO']), data)` where `data = ctx.getAll()` (whole CDU) — `src/application/email/boxes.ts:370-371` (extractor at `:352`).
- `TESTO_VUOTO` fallback: `templates.processString(str(cfg['TESTO_VUOTO']), cdu)` — `src/application/email/boxes.ts:508`.

A placeholder like `{{focus.alunno.anagrafica.nomeCompleto}}` in any of these emits imported-data values (student/parent names from the registry import) into email HTML verbatim. The templates themselves are admin-authored (trusted), but the *interpolated values* are the same fields the box renderers treat as untrusted. Recommended fix: pass an HTML-escaped view of the CDU to these three `processString` calls (a recursive escape of string leaves), or — per the GasLibraryFactory-first rule — ask whether `WorkspaceTemplateEngine`/`CoreUtilsLib.HtmlSanitizer` should gain an "escaping render" mode so all consumers benefit. Do not silently hand-roll a partial copy in ALDO.

**Info — `studente.email` unescaped in the piani_pers template context.** `boxes.ts:248-250` spreads `...corrente.studente` and re-escapes only `nomeCompleto`; `{{corrente.studente.email}}` would interpolate the raw email. Emails are validated PKs (`Email.of` gate on import), so the practical risk is negligible — flag only for consistency if you touch this code.

**Minor — `PianiPersClasseProvider` clobbers `didattica`.** `src/application/context-engine/providers/PianiPersClasseProvider.ts:52` does `cdu.focus.classe.didattica = { pianiPersonalizzati: { items } };` (whole-object assignment), while its alunno twin assigns only the key (`PianiPersAlunnoProvider.ts:36`). Today `CduClasse.didattica` holds only `pianiPersonalizzati` (`Cdu.ts:157-165`) and the storico provider runs after it in every recipe (`Recipe.ts:122`, `:129-130`, `:140-141`), so behavior is correct — but the first future provider that writes another `classe.didattica.*` key before this one runs will be silently erased. Fix: `(cdu.focus.classe.didattica ??= {...}).pianiPersonalizzati = { items }` -style keyed assignment.

**Minor — `PeriodoSupplenza.of` catch is overbroad.** `src/domain/value-objects/PeriodoSupplenza.ts:24-28`: any throw from `new DateRange(dal, al)` (not just the ordering violation) is rethrown as `ValidationError('… deve valere DAL ≤ AL')`, mislabeling unrelated failures. Narrow it by checking the library error type/message, or pre-validate the ordering explicitly. (`EsameConfig.ts:37-43` has a similar catch, but there returning `false` on any malformed entry is the documented, correct behavior.)

**Clean:** no empty catch blocks in `src/` (regex sweep: 0). Every catch either collects-and-continues by spec (`ImportService.ts:86`, `DocumentBatchService.ts:67`), narrows and rethrows (`DocumentoConTabelleImportateGeneratorStrategy.ts:62-64`), rolls back the transaction and rethrows (`DocumentGenerationService.ts:118-121`), or surfaces to the operator/trigger log (`Menu.ts:46`, `index.ts:50-54`). PII is redacted before logging send failures (`emailSteps.ts:422`). CDU providers null-handling is consistent: every provider guards `cdu.focus.X === undefined` and optional params (`CarenzaFocusProvider.ts:20-24`, both storico providers guard `didattica`/`pianiPersonalizzati` presence and `includiStorico`).

## 6. Testing

**Fakes: clean.** All seven doubles in `test/fakes/` (`FakeDatabase`, `FakeDriveFacade`, `FakeGmailFacade`, `FakeProcessMonitor`, `FakePropertiesFacade`, `FakeTemplateEngine`, `FakeUiFacade`) declare `implements <real interface>` against the production interfaces, so `tsc` catches structural drift automatically. Only residual risk is *behavioral* drift in `FakeTemplateEngine`'s mini-Mustache vs the vendored engine (notably: whether the fake escapes where the real engine does not) — worth one assertion in the harness suite if not already present.

**Structural coverage gaps (candidates — modules never imported by any test file, direct or fake):** `src/application/context-engine/dates.ts`, `mappers/carenzeMapper.ts`, `studenti.ts`, `techEntities.ts`, `providers/StoricoProvider.ts`, `interceptors/SupplentiSubstitutionLookup.ts`, `src/domain/value-objects/EsameConfig.ts`, `src/domain/specifications/{Carenza,Classe,MovimentoAlunno,Progetto,VariazioneCattedra}Specs.ts`, `src/domain/entities/{LogCartella,LogEmail,AldoEntity}.ts`. Several are certainly exercised *indirectly* (e.g. `SupplentiSubstitutionLookup` via `swap-supplenti.test.ts`, `techEntities`/`dates` via `recipes-e2e.test.ts`), so these are gaps in *direct* coverage, not necessarily in behavior coverage. Highest-value additions given fan-in: `techEntities` (get/set entity contract), `carenzeMapper`, and the five `*Specs` files (pure logic, cheap to test).

**Riskiest high-fan-in code is tested:** `ClasseId.of` (28 in), `SheetTableAdapter.findAll/find` (26/21), `ContextEngineFactory.create` (17), `Recipe.makeOptions` (14) all sit under existing suites (`identifiers.test.ts`, db adapter tests, `recipes-e2e.test.ts`).

## 7. Maintainability

**Size/complexity: excellent.** Only two functions in `src/` exceed 80 lines or cognitive 20, and both are declarative wiring, not logic: `buildAldoContainer` (`Bootstrap.ts:85`, 116 lines, cognitive 4) and `createBoxComposer` (`boxes.ts:276`, 102 lines, cognitive 0). No function has `transitive_loop_depth ≥ 3` except the intentional in-memory `EqualityQueryBuilder.execute` (`Database.ts:49`).

**Minor — confirmed duplication (SIMILAR_TO jaccard = 1.0, verified by reading both):**

- `orderedPartners(classe)` — byte-for-byte identical private helper in `src/application/context-engine/CdcAssembler.ts:159-165` and `src/infrastructure/repositories/ClasseRepository.ts:294-300`. Promote the repository one to the public repository surface (or `IClasseRepository`) and delete the assembler copy.
- `sigle()` + `sigleCache` — identical materie-sigla cache in `CarenzeProvider.ts:13,34` and `StudentiProvider.ts:18,77`. Candidate for `IMateriaRepository` (e.g. `findAllSigle()`), which is also where a cached list belongs.
- `DocumentiStoricoProvider.provide` ≡ `PianiPersAlunnoStoricoProvider.provide` — acknowledged in the latter's docstring ("Mirrors DocumentiStoricoProvider"); acceptable as-is given each is ~15 lines.
- Small `of()` value-object and log-repository `findBy*` duplicates are idiomatic per-type boilerplate; leave them.

**Info — O(n·m) scans:** `ClasseRepository.getMaterieDelDocente`/`getMateriaDocente` (`ClasseRepository.ts:303`, `:318`, `linear_scan_in_loop=2`) scan the materie columns per docente. At school scale (~10² classes × ~10¹ materie) this is irrelevant; noted only in case these ever run inside a per-student batch loop.

**Recent code (piani_pers providers, EmailNotificationService, storico wiring): well structured.** Providers are small, guarded, and registered in correct recipe order (`Recipe.ts:118-141` places every `*Storico` after its base provider); `LazyRef` keeps historical DB opens out of the hot path; `EmailNotificationService` (418 lines) delegates steps to `emailSteps.ts` pipeline classes and repositories cleanly — its only debts are the concretion-construction pattern (§2) and the bcc issue (§5), both already listed.

---

### Verification status legend

- **Confirmed**: read in current source at the cited `file:line` (findings 1-8, all §1-§5 items).
- **Candidates needing verification**: §5 bcc-in-test-mode *product intent* (code behavior is confirmed; whether spec wants supervisor BCC on test sends is a product decision); §6 coverage-gap list (indirect coverage may already exercise some modules); §4 test-only APIs (keep/remove is a maintainer call).
