# ALDO Cross-Component Technical Audit

**Audit date:** 2026-07-27

**Scope:** document generation and ACLs; email generation; persistence of generated-artifact data; chair changes and substitutions; articulated classes across the application chains.

**Method:** static architectural and linkage analysis through `codebase-memory-mcp`, using the `aldo-full-coverage`, `home-giulio-Desktop-ALDO-implementing`, and `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory` graphs. GasLibraryFactory behavior was checked first against `GasLibraryFactory/DOCS_LIBS` and ALDO's declared/harness-tested surface; the indexed implementations of `Pipeline.execute`, hook invocation, SheetDB transaction commit/rollback, and `InMemoryDelegationSource.getDelegationChain` were inspected where the public docs did not define the required failure/ambiguity semantics. No runtime test suite was executed and no application source was modified.

## 1. Executive verdict

The principal components are wired and the intended architecture is recognizable:

- document generation uses a `PipelineFramework` pipeline, a single CDU, configuration-driven strategies, SheetDB transactions, Drive rollback for critical failures, and repository-backed audit data;
- file and folder ACLs resolve abstract roles through `RisolutoreRuoliService`, with substitute policy delegated to `RoleResolutionLib`;
- granular Google Sheets column protection uses `WorkspaceTemplateEngine`'s returned dynamic-column layout and `SpreadsheetService.protectRanges`;
- email generation is configuration-driven, builds a CDU, renders content and boxes, resolves recipients, sends through `GoogleApiWrapper.MailService`, and records `LOG_MAIL`;
- permanent chair changes and substitutions converge on `CattedraResolver` and `SupplenzaRepository`;
- the class repository models parent/partner articulated groups and the CDU aggregates partner teachers and students.

The system nevertheless does **not** pass the requested end-to-end verification. There are blocking cross-chain gaps.

| Area | Verdict | Main reason |
| --- | --- | --- |
| Document generation | **Unsafe** | Articulation targeting is absent; deduplication collapses distinct per-student/per-subject documents; several pipeline/commit failures can be reported as success or leave orphan files. |
| File/folder ACLs | **Unsafe over time** | Application is additive and non-critical; reused folders never revoke obsolete teachers/substitutes, while a file can be logged as `GENERATO` after an ACL failure. |
| Sheet column ACLs | **Connected, with role-model limitations** | Layout-to-column mapping is sound; subject-specific chair columns are absent from the centralized chair model. |
| Email generation | **Unsafe / can skip or report false success** | Step failures are ignored; resumed deficiency batches can skip every remaining target; retry has no stable delivery identity; substitute routing loses required scope. |
| Generated-data persistence | **Incomplete** | `LOG_DOCS.MATERIA` is never written by the main pipeline, `DATA_CREAZ` is not a timestamp, and `LOG_FOLD` rows omit required contextual fields. |
| Chair hierarchy | **Correct only for a single simple change** | Partial multi-holder changes drop co-holders, and a second sequential permanent change is rejected because resolution remains anchored to the original `CLASSI` holder. |
| Articulated classes | **Partial** | Document targeting ignores the configured mode; email and `DOCENTE_MATERIA` substitute paths lose partner scope in important cases. |

### Priority findings

| ID | Severity | Finding |
| --- | --- | --- |
| F-01 | **Critical** | `GESTIONE_ARTICOLAZIONE` is schema-only: document generation processes every active `CLASSI` row without selecting parent versus partners. |
| F-02 | **High** | Applying one `VARIAZIONI_CATTEDRA` row to a multi-holder slot replaces the whole slot and silently drops unaffected co-holders. |
| F-03 | **High** | Dynamic subject-specific chair columns (`MATERIA.SPECIFICA`) never enter `CattedraResolver`; CDU rows always expose `specificita: null`. |
| F-04 | **High** | File/folder ACL failure is non-critical, so generation can commit `LOG_DOCS.STATO=GENERATO` with incomplete access control. |
| F-05 | **High** | Generated-file and folder persistence is incomplete (`MATERIA`, timestamp, `TIPO`/`NOME`/`MATERIA` for folders, and existing-folder reconciliation). |
| F-06 | **Medium** | `CONF_DOC.PARAMETRI.overwrite` is specified but ignored by `CheckDuplicatesStep`. |
| F-07 | **Medium** | Email `PER_CDC` and `PER_DOCENTE` use `resolveConsiglio()` without `includeReligioneAlt`, excluding IRC/ALT teachers. |
| F-08 | **Medium** | Email delivery, `LOG_MAIL`, and post-processing do not share an atomic boundary; a sent message can remain unlogged or un-post-processed. |
| F-09 | **Low** | An unknown ACL permission string silently degrades to Drive `reader` instead of failing configuration validation. |
| F-10 | **Critical** | Email pipeline step failures are swallowed; the target is checkpointed with `sent=0`, `errors=[]`, and the batch can finish successfully without sending. |
| F-11 | **High** | A second sequential chair change (A→B, then B→C) cannot be represented correctly: the resolver validates B against the original nominal holder A and throws. |
| F-12 | **High** | Email substitute routing is bypassed for `PER_CDC` and loses subject/partner scope for `PER_DOCENTE`, causing missed, over-broad, or order-dependent routing. |
| F-13 | **High** | `resolvePermanenti` collapses equal holders across articulated partners to one `ClasseId`, so a partner-scoped substitute can be missed by `DOCENTE_MATERIA` and Sheet ACLs. |
| F-14 | **High** | A document `AnalyzeContext` failure leaves `shouldGenerate` unset; all gated steps skip, the transaction commits, and the batch records success instead of a configuration error. |
| F-15 | **High** | Retry cannot select failed `SOLO_SUPPLENTI` deliveries by the substitute address; it retries zero targets and never advances the permanent-failure counter. |
| F-16 | **High** | A SheetDB commit failure occurs after Drive mutation, leaves the cloned file orphaned, and leaves the library transaction marked open, poisoning later items in the same batch. |
| F-17 | **Critical** | If orphan-file deletion throws inside the document error hook, `PipelineFramework` swallows the hook exception before ALDO sets `criticalError`; the failed document can then commit as if the critical failure were handled. |
| F-18 | **High** | Duplicate-check and document post-process failures are non-critical and ignored: generation may create a known duplicate or commit a document without its required state transition. |
| F-19 | **Critical** | Folder permissions are only added. Reused folders have no ACL reconciliation/revocation path, so former chair holders or ended substitutes can retain access indefinitely. |
| F-20 | **High** | Email retry identifies a delivery only by pattern plus recipient CSV and rebuilds current targets; distinct failed notifications are merged and a retry can resend different/multiple messages. |
| F-21 | **Critical** | Email resume uses an old numeric index over a freshly re-enumerated, self-shrinking deficiency target list; after the first checkpoint, remaining unsent notifications can all be skipped. |
| F-22 | **Resolved** | Document deduplication now uses the complete generated identity (`TIPO`, `SOTTOTIPO`, `ID_GEN`, `PATH`, `NOME`) and an explicit allow/deny policy. |

## 2. Architecture and composition

The `aldo-full-coverage` graph contains 3,282 nodes and 11,212 edges. The relevant dependency flow is:

```text
EntryPoints / batches
        |
        +--> DocumentGenerationService
        |       +--> ContextBuilder / CDU providers
        |       +--> PipelineFramework
        |       +--> GeneratorStrategy registry
        |       +--> RisolutoreRuoliService
        |       +--> SheetDB-backed IDatabase
        |       +--> Drive / Sheets / Template facades
        |
        +--> EmailNotificationService
                +--> ContextBuilder / CDU providers
                +--> PipelineFramework
                +--> CattedraResolver
                +--> Gmail / Drive / Template facades
                +--> LOG_MAIL / LOG_DOCS repositories

CattedraResolver
        +--> ClasseRepository (Priority 3)
        +--> VariazioneCattedraRepository (Priority 2)
        +--> SupplenzaRepository (Priority 1)
                +--> RoleResolutionLib delegation-chain traversal
```

Composition is present in [`src/config/Bootstrap.ts`](src/config/Bootstrap.ts):

- `SHEET_CON_MATERIE_E_PERMESSI` is registered with `SpreadsheetService`, `MateriaRepository`, `TemplateEngineFacade`, and `RisolutoreRuoliService` (lines 117-133);
- `DocumentGenerationService` receives the shared database, Drive facade, CDU builder, strategy registry, template and expression facades, configuration repository, role resolver, clock, and monitor (lines 145-163);
- `EmailNotificationService.create` is passed the year database, Gmail facade, template facade, clock, Drive facade, monitor, and the separately opened MASTER repository (lines 174-186);
- document and email batch services resolve those same registered services (lines 165-202).

The graph did not identify a direct two-module `IMPORTS` cycle under `src/`. The high-level boundaries are coherent, although the application layer deliberately imports infrastructure facade types and some concrete repositories through factory shortcuts. That is existing architecture, not a newly discovered call-cycle.

## 3. Document generation chain

### 3.1 Observed execution path

`DocumentGenerationService.generateForClasse` and `generateForAlunno` in [`src/application/services/DocumentGenerationService.ts`](src/application/services/DocumentGenerationService.ts) perform the following:

1. read `CONF_DOC`;
2. hydrate `ConfigurazioneDocumento`;
3. verify that the generator key exists;
4. build one CDU using `CLASSE_COMPLETA` or `ALUNNO_COMPLETO`;
5. begin a SheetDB transaction;
6. execute the ten-step document pipeline;
7. rollback on a thrown/critical failure, otherwise commit;
8. read the resulting state from `LOG_DOCS`.

The graph trace from `generateForClasse` reaches all ten configured steps:

1. `AnalyzeContextStep`
2. `CheckDuplicatesStep`
3. `PrepareInfrastructureStep`
4. `GenerateNameStep`
5. `SelectTemplateStep`
6. `CloneTemplateStep`
7. `RenderTemplateStep`
8. `ApplyPermissionsStep`
9. `RegisterDocumentStep`
10. `PostProcessStep`

The pipeline is backed by GasLibraryFactory `PipelineFramework`; DB integrity uses GasLibraryFactory `SheetDBLib.beginTransaction/commit/rollback`. `DOCS_LIBS/SheetDBLib_docs.md` explicitly documents transaction-backed multi-table integrity.

### 3.2 Template generation and strategy linkage

The strategy registry is data-driven by `CONF_DOC.GENERATORE`. It includes generic Docs/Sheets, verbal, personalized-document, imported-table, subject-column, and subject-column-with-permissions strategies.

The key library contracts line up:

- `TemplateEngineFacade.processDocument(fileId, context)` checks the library boolean and throws on failure.
- `TemplateEngineFacade.processSheet(sheetId, context, sheetName?)` checks `{ success, layouts }` and flattens the layout columns.
- `DOCS_LIBS/WorkspaceTemplateEngine_docs.md` documents the same `{ success, layouts }` contract, multi-group `dynamic_columns`, label columns, raw per-column items, and optional ACL generation.
- The ALDO library harness verifies the bound `DocumentService`, `SpreadsheetService`, `PermissionService`, and template surfaces in `test/unit/harness/gaslibs.test.ts`.

This linkage is technically consistent.

### 3.3 Transaction and rollback behavior

The DB boundary is correct for `LOG_FOLD`, `LOG_DOCS`, and configured post-process mutations. Critical failures request a pipeline stop, delete the cloned Drive file if present, and roll back the database.

Only these steps are critical (`CRITICAL_STEPS`, [`src/application/pipelines/documentSteps.ts`](src/application/pipelines/documentSteps.ts), lines 66-71):

- `SelectTemplate`
- `CloneTemplate`
- `RenderTemplate`
- `RegisterDocument`

This leaves `ApplyPermissions` non-critical (F-04). A sharing exception is recorded in pipeline history, but execution continues into `RegisterDocumentStep`; the transaction then commits a `GENERATO` row. The persisted status therefore does not prove that required ACLs were applied.

The same non-critical policy causes a separate false-skip defect (F-14). `AnalyzeContextStep` evaluates `CONF_DOC.CONDIZIONE` and is not in `CRITICAL_STEPS`. If expression evaluation throws:

1. GasLibraryFactory `Pipeline.execute` records the step as failed and continues because `stopOnError=false`;
2. `shouldGenerate` is never set;
3. `generateGate` (`ctx.get('shouldGenerate') === true`) skips every subsequent generation step;
4. no `criticalError` flag exists, so `DocumentGenerationService` commits;
5. the missing `newFileId` is returned as `{ fileId: null, status: 'SKIPPED' }`;
6. `DocumentBatchService` catches no exception, checkpoints the class as processed, and can return `success=true`.

An intentionally false condition and an invalid condition are therefore indistinguishable at the service/batch boundary. Pipeline execution history contains the distinction, but neither service consumes it.

Drive rollback is necessarily compensating rather than atomic. It deletes the clone on a critical error, but created folders remain. Folder creation is idempotent, so the orphan is usually reusable, but the Drive and DB states are not a true distributed transaction.

Two deeper failure-boundary defects make that compensation unreliable.

First, `generateForClasse` and `generateForAlunno` protect `pipeline.execute(...)` with `try/catch`, but call `db.commit()` after that block. If the SheetDB flush fails, the Drive clone and permissions already exist and ALDO performs no file cleanup. The indexed GasLibraryFactory `DatabaseConnectionManager.commit` catches the flush error and calls `_performRollback()`, but its error path never clears `facade._transaction` or `facade._inTransaction`; `_performRollback()` restores cached rows and clears pending batch updates only. The failed item therefore leaves:

- an orphan generated Drive file whose `LOG_DOCS` row was rolled back;
- an open/poisoned SheetDB transaction;
- every subsequent `DocumentBatchService` item failing at `beginTransaction()` with `Transaction already in progress` while the batch continues recording one error per class.

This is F-16. It is a cross-system transaction failure, not a normal document-pipeline rollback.

Second, the critical-step `onError` hook deletes the orphan **before** setting `criticalError` and requesting stop:

```text
deleteFile(orphan)
setFlag('criticalError', ...)
requestStop(...)
```

GasLibraryFactory `Pipeline._invokeHooks` deliberately catches and logs hook exceptions. If `deleteFile` throws, the remaining ALDO hook statements never run, the library swallows that exception, and `stopOnError=false` allows the pipeline to continue. The service sees no `criticalError` and can commit after the original critical step failed. This is F-17. Cleanup failure must not be able to erase the primary failure signal.

There is also a broader non-critical classification defect (F-18):

- if `CheckDuplicatesStep` throws while querying `LOG_DOCS`, `shouldGenerate` remains `true`, so the pipeline proceeds and can create the duplicate that the failed guard was meant to prevent;
- if `PostProcessStep` throws, the file and `LOG_DOCS` insert are already staged, no critical flag is set, and the service commits without the configured state mutations.

In both cases the failed execution exists only in pipeline history, which `DocumentGenerationService` does not inspect.

### 3.4 Duplicate policy

`CheckDuplicatesStep` reads `CONF_DOC.DUPLICAZIONE`: `NEGATA` checks the complete generated identity, while `PERMESSA` explicitly bypasses the check.

The duplicate key itself is also too coarse (F-22). For every other schema, the lookup uses only:

```text
LOG_DOCS.ID_GEN == CONF_DOC.ID
and LOG_DOCS.CLASSI contains current class
```

It never includes the student/plan (`UTENTI`/plan identity), teacher, current subject, or the schema-specific discriminator. `generateForAlunno` uses this same step. Consequently:

- under `UNO PER PIANO PERSONALIZZATO`, the first student document logged for a class causes every later student in that class to return `SKIPPED`;
- under `UNO PER DOCENTE`, the first teacher artifact suppresses other teachers for the same class;
The duplicate tests cover both an identical generated identity and an identity whose generated name differs, plus the explicit `PERMESSA` bypass.

## 4. Permissions: files, folders, and Sheet columns

### 4.1 File and folder ACLs

`ApplyPermissionsStep` reads `CONF_DOC.PERMESSI` and treats file and folder lists independently:

```text
PERMESSI.file[]   --role resolver--> emails --DriveServiceFacade--> file permission
PERMESSI.folder[] --role resolver--> emails --DriveServiceFacade--> folder permission
```

Each ACL entry has `{ ruolo, permesso }`. Substitute routing is separately configurable for file and folder through `regolaSupplente.file` and `.folder`. `RisolutoreRuoliService.risolvi`:

- resolves built-in or configured roles;
- keeps scope information for articulated partner classes;
- uses `SupplenzaRepository.findSupplenzaSpecifica`;
- maps `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, and `ENTRAMBI` to `RoleResolutionLib.RoutingPolicy`;
- deduplicates the resulting emails.

`DriveServiceFacade.setPermission` maps:

| ALDO permission | Drive role |
| --- | --- |
| `SCRITTURA` | `writer` |
| `LETTURA` | `reader` |
| `COMMENTO` | `commenter` |

It then calls `PermissionService.shareWithUsers([fileId], [{ type: 'user', role, email }], {})`. `DOCS_LIBS/GoogleApiWrapper_docs.md` confirms `PermissionService` as the library sharing seam.

Two weaknesses remain:

- F-04: ACL failure is non-critical.
- F-09: `ROLE_MAP[permesso] ?? 'reader'` silently turns malformed configuration into read access. This avoids over-privileging but hides configuration errors.

A more serious lifecycle defect is F-19. `AlberoCartelle.findOrCreate` intentionally returns a previously logged or existing Drive folder. Every later generation then reapplies the currently resolved ACLs to that same folder, but `IDriveFacade` exposes only `setPermission`; it has no permission-list, removal, or reconciliation operation. A graph-augmented search over all `src/` found no `removePermission`, `revokePermission`, `deletePermission`, `removeEditor`, `removeViewer`, or `unshare` path.

Folder access therefore accumulates monotonically:

```text
chair A receives folder access
chair changes A -> B
next generation grants B
A is never removed
```

The same applies when a substitution ends, a partner assignment changes, or `CONF_DOC.PERMESSI` removes a role. Because folder permissions can flow to all current and future child artifacts, this is a persistent confidentiality defect rather than merely stale metadata. Existing tests assert that permissions are added; none asserts revocation after a chair/substitute transition.

### 4.2 Google Sheets column ACLs

`SheetMaterieConPermessiGeneratorStrategy` is correctly wired:

1. `SheetMaterieGeneratorStrategy.renderColumns` builds shared and partner-specific subject groups.
2. `TemplateEngineFacade.processSheet` returns the actual generated layout.
3. Each non-label layout column carries its raw `MateriaColumn` item.
4. The strategy derives the A1 full-column range from the returned physical column.
5. Editors are the effective subject teachers plus coordinators.
6. One batch call to `SpreadsheetService.protectRanges` applies all requests.

For subject teachers, the strategy injects `meta.parametriInput.materiaCorrente` into a CDU variant and resolves `DOCENTE_MATERIA` with `GestioneSupplenti.ENTRAMBI`. For each split articulated subject, `CattedraResolver.resolvePermanenti` returns the partner class scope, so substitute lookup uses the partner rather than the parent.

This is a strong connection and is covered by `test/unit/application/sheet-materie-generator.test.ts`, `test/unit/application/pipelines/document-steps.test.ts`, `test/unit/application/risolutore-ruoli-service.test.ts`, and the GasLibraryFactory harness test.

Its correctness is limited by F-02 and F-03: the editors can be wrong when the source slot has multiple holders and a partial chair change, and columns for `MATERIA.SPECIFICA` are not represented by the resolver.

## 5. Generated-file and folder persistence

### 5.1 `LOG_DOCS`

`RegisterDocumentStep` inserts the row inside the document transaction. The main pipeline currently writes:

| `LOG_DOCS` column | Written | Source |
| --- | --- | --- |
| `ID` | Yes | cloned Drive file ID |
| `ID_GEN` | Yes | `CONF_DOC.ID` |
| `TIPO` | Yes | `CONF_DOC.TIPO` |
| `SOTTOTIPO` | Yes | `PARAMETRI.tipoPiano`, otherwise blank |
| `NOME` | Yes | resolved filename |
| `STATO` | Yes | `GENERATO` |
| `NOTIFICATO` | No | correctly blank at creation, but implicit |
| `PATH` | Yes | resolved logical destination path |
| `LINK` | Yes | generated edit link |
| `CLASSI` | Yes | focused class name |
| `UTENTI` | Yes | `REGISTRA_UTENTI` role expansion or focused student |
| `MATERIA` | **No** | missing even when `materiaCorrente` applies |
| `DATA_CREAZ` | **Partial** | `cdu.meta.date.oggi.breve`, not the required timestamp |
| `ID_ORIG` | No | no version/origin path is implemented here |

The authoritative schema describes `DATA_CREAZ` as a creation timestamp and `MATERIA` as the associated FK when applicable. The separate `LogDocumentoRepository.registraDocumento` writes an ISO timestamp and supports `MATERIA`, showing that the repository model has the required fields, while the primary generation pipeline does not.

This is F-05. It affects:

- subject-specific lookup and post-processing;
- traceability of generated files;
- chronology when multiple files are generated on the same date;
- any future version-chain use of `ID_ORIG`.

### 5.2 `LOG_FOLD`

`AlberoCartelle.findOrCreate` first checks `LOG_FOLD`, then Drive, then creates and logs a folder. A newly created row contains only:

- `ID`
- `PATH`
- `LINK`
- `CLASSI`
- `UTENTI`

The authoritative schema also defines `TIPO`, `NOME`, and `MATERIA`. `PrepareInfrastructureStep` supplies only the class option, so those fields cannot be populated.

If a matching Drive folder exists but has no `LOG_FOLD` row, the method returns it without backfilling the database. The application can therefore use and permission a folder that is absent from its audit table.

This is also part of F-05. `LOG_FOLD` is not a complete audit trail under the current reconciliation behavior.

### 5.3 Transaction coverage

On the normal path, the document transaction commits `LOG_FOLD`, `LOG_DOCS`, and post-process table updates together. A correctly signalled critical step rolls them all back.

The external Drive effects cannot be rolled back atomically:

- cloned files are compensating-deleted for critical failures;
- newly created folders are retained;
- successfully applied ACLs are not removed if a later critical DB step fails.

These are not all merely unavoidable distributed-system limitations. F-16 shows that a commit failure leaves an orphan clone and an open SheetDB transaction; F-17 shows that a cleanup exception can suppress the critical signal itself. F-04 separately allows a known ACL failure to produce a successful DB status.

## 6. Email generation and audit trail

### 6.1 Pipeline

`EmailNotificationService` builds an eight-step `NotificaPipeline`:

1. `BuildCDUStep`
2. `ValutaCondizioniInvioStep`
3. `RenderBoxesStep`
4. `ComposeEmailStep`
5. `ResolveRecipientsStep`
6. `SendEmailStep`
7. `LogEmailStep`
8. `PostProcessEmailStep`

The graph trace confirms `sendPattern` reaches all eight steps and every target enumerator.

`CONF_MAIL` supplies the process, subject, body, box configuration, substitute policy, no-reply behavior, condition, header color, and post-process actions. `BuildCDUStep` maps the process to a recipe and enriches `destinatario`. `ComposeEmailStep` escapes user-derived strings, validates the header color, renders configured boxes, and attaches documents only when a `documentiPerClasse` data source opts in.

`GmailServiceFacade` converts the ALDO request into GasLibraryFactory `MailService.send` options (`to`, `subject`, plain fallback body, HTML body, `cc`, `bcc`, `noReply`, attachments). Native Gmail globals are not called by ALDO.

### 6.2 Recipient resolution

Processes are enumerated as follows:

| Process | Target basis |
| --- | --- |
| `PER_COORDINATORE` | coordinators grouped across entry-point classes |
| `PER_DOCENTE` | effective council emails grouped across entry-point classes |
| `PER_CDC` | one target per entry-point class with multi-TO council recipients |
| `PER_ALUNNO` | all active students |
| `PER_GENITORI_ALUNNO` | deduplicated tutor households |
| `PER_CARENZA_*` | each unnotified deficiency plus configured student/tutor/coordinator recipients |

For articulated classes, `classiEntryPoint()` excludes partner rows and keeps the parent, avoiding three council emails for one articulated group. `cdcEmails()` then uses `CattedraResolver`, which internally routes the parent across both partners and deduplicates shared subjects.

For `tipo='docente'`, `ResolveRecipientsStep` applies the configured substitute policy per competence class. For CDC, student, and family messages, the enumerated multi-TO destination passes through unchanged.

F-07 remains: `cdcEmails()` calls `resolveConsiglio(classe, now)` without `{ includeReligioneAlt: true }`. The resolver's own documentation and `RisolutoreRuoliService.cdcCompleto` establish that a complete CDC includes IRC/ALT. Consequently:

- `PER_CDC` omits IRC/ALT teachers;
- `PER_DOCENTE` does not enumerate those teachers from that class;
- the full class CDU assembled by `CdcAssembler.assembleForClasse` has the same default exclusion.

Student-filtered CDU assembly separately re-adds IRC or ALT according to the student's choice, so the omission is specific to the unfiltered/full council chain.

F-12 is a more serious substitute-routing break:

- the authoritative `CONF_MAIL.SUPPLENTI` field is a routing policy with no process-specific exception;
- `PER_CDC` creates `tipo='cdc'`, and `ResolveRecipientsStep` explicitly passes every non-`docente` target through unchanged, so `SOLO_SUPPLENTI` and `ENTRAMBI` have no effect;
- `cdcEmails()` always extracts `assignment.titolare.id`; it ignores the already resolved `assignment.supplente`;
- `PER_DOCENTE` collapses council assignments to an email plus entry-point class IDs, losing both `materia` and the actual articulated partner `classeId`;
- `ResolveRecipientsStep` calls `findSupplenzaSpecifica(titolare, date, classe)` without a subject. The repository consequently accepts every active subject-specific substitution for that teacher/class.

If the same teacher has different substitutes for two subjects in one class, the repository passes both delegations to `InMemoryDelegationSource`; its `getDelegationChain` selects the first applicable delegation with `.find()`. The chosen substitute is therefore row-order-dependent. For an articulated parent, a substitution scoped to `1F-LSO` is instead looked up against parent `1F` and can be missed completely. In the opposite direction, one subject-specific substitution can reroute an aggregated `PER_DOCENTE` message containing data for all of that teacher's classes/subjects.

### 6.3 Sending, logging, and post-processing

`SendEmailStep`:

- adds the MASTER supervisor as BCC when configured;
- suppresses real CC/BCC in test mode;
- sends each resolved destination;
- continues after an individual failure;
- records attempted recipients, successful-send count, and error messages.

`LogEmailStep` writes:

- pattern ID;
- attempted recipient CSV;
- timestamp;
- `SUCCESS` or `ERROR`;
- plain-text body;
- attachment document IDs;
- referenced folder IDs;
- combined error message.

`LogEmailRepository.registraInvio` calls `database.save()`, so the row is persisted immediately. `PostProcessEmailStep` runs only when at least one send succeeded and explicitly saves its DB changes.

The data recorded in `LOG_MAIL` is materially complete for the defined schema and is tested in `test/unit/application/pipelines/email-steps.test.ts`.

F-08 is the unavoidable but currently unmitigated consistency window:

```text
external email sent
    -> LOG_MAIL insert/save
    -> configured post-process save
```

There is no transaction/outbox/idempotency key spanning those operations. If logging or post-processing fails after Gmail accepts the message, retrying can duplicate delivery. Conversely, a partial multi-recipient failure produces one `ERROR` log row even when some destinations succeeded, which is honest but requires the retry service to avoid resending successful destinations.

### 6.4 Pipeline failure propagation

GasLibraryFactory `Pipeline.execute` catches a thrown step error, records `status='failed'`, sets its internal `pipelineSuccess=false`, and continues when `stopOnError=false`. It returns the `PipelineContext`; it does not rethrow the step failure.

`EmailNotificationService` configures exactly that mode and has no `onError` hook. After execution, both `sendPattern` and `sendToTarget` inspect only:

- `shouldSend === false`;
- `sentCount`;
- `sendErrors`.

They never inspect the recorded step executions or the pipeline completion success. Thus a failure before `SendEmailStep`—for example CDU construction, condition parsing, box rendering, subject composition, attachment loading, or recipient resolution—normally produces:

```text
sent = 0
errors = []
skipped = false
```

`EmailBatchService` then increments `processed`, persists the next checkpoint, and derives final success solely from `errors.length === 0`. This is F-10: a whole batch can be reported as successful even though no message was sent for one or more processed targets.

This behavior is not only inferred. `test/unit/application/email-notification-service.test.ts` contains a regression test named `sendToTarget falls back to 0 sent / no errors on the success path when the build fails before shouldSend is set`; it injects a CDU builder that throws `"boom"` and asserts precisely the false-success tuple above. The test currently locks in the defect instead of rejecting it.

### 6.5 Retry selection defect

`EmailRetryService.retryFailed` reads a failed `LOG_MAIL` row and calls:

```text
sendPattern(pattern, { onlyRecipients: failedLog.getDestinatari() })
```

`sendPattern` applies that filter **before** `ResolveRecipientsStep`, comparing `onlyRecipients` with `EmailTarget.emails`. For a docente target:

```text
EmailTarget.emails       = permanent holder A
SOLO_SUPPLENTI resolves  = substitute B
LOG_MAIL.DESTINATARI     = B
retry onlyRecipients     = B
pre-routing filter B ∩ A = empty
```

The retry run therefore has zero targets, zero sends, and zero errors. The retry service emits a warning but creates no new `LOG_MAIL.ERROR` row. Its attempt count is `group.length`, so it remains unchanged forever and never reaches `maxTentativi` or notifies the supervisor of a permanent failure.

The same mismatch can occur for test-mode failures because `LOG_MAIL.DESTINATARI` contains the redirected test address while enumeration contains the real logical address. Existing retry tests cover a family address that is present before routing; they do not cover substitute-only or test-mode recipient transformation. This is F-15.

### 6.6 Retry delivery identity is not stable

Even when recipient selection succeeds, retry cannot identify the original logical delivery (F-20). `retryFailed()` groups all failed rows by:

```text
pattern + "::" + destinatariRaw
```

and treats `group.length` as the attempt count. `LOG_MAIL` carries no target ID, deficiency progressivo, CDU snapshot, message/delivery ID, or stable idempotency key. Distinct notifications with the same pattern and recipient CSV are therefore merged. For example, three separate first-attempt failures concerning three children in one family can be interpreted as three attempts of one delivery and immediately reach the permanent-failure threshold.

The resend is not a replay of the failed message. It calls `sendPattern(pattern, { onlyRecipients })`, which enumerates the **current** database and rebuilds the CDU/body/attachments. One old failed row can therefore:

- match multiple current targets sharing those addresses and send multiple messages;
- send content reflecting changed records rather than the failed delivery;
- fail to match a target that has since changed recipients;
- mark every row in the merged group successful after any resend run with `sent > 0` and no errors.

This identity defect compounds F-08 and F-15. A safe retry boundary needs one persisted logical-delivery key and per-destination outcome, not a recipient string as a proxy.

### 6.7 Resumable deficiency batches skip remaining targets

`EmailBatchService.batchSendHandler` reconstructs `targets` on every invocation, but persists only `nextIndex`, accumulated counters, and display-oriented `processed` strings. It resumes by applying the old numeric index to the new list; it neither stores the original target list nor filters by a stable processed-target key.

That is already unsafe when database ordering changes. It is deterministically wrong for `PER_CARENZA_GENITORI*` (F-21):

1. `targetsPerCarenza` enumerates only `CarenzaRepository.findNonNotificate()`;
2. after a successful send, configured `POST_PROCESSO` stamps the deficiency as notified;
3. the first chunk yields `nextIndex = N`;
4. JobRunner later re-enters the handler;
5. the first `N` targets are now absent, so the freshly enumerated list has shifted left or shrunk;
6. iteration nevertheless starts at index `N`, skipping the next `N` unsent deficiencies; if no more than `N` remain, the loop does not run at all and the batch returns success.

For a default 100-target checkpoint, an initial set of 150 can process 100, resume with a 50-element list, start at index 100, and silently skip all remaining 50. The source comment says self-marking target lists “shrink naturally,” but the numeric-index algorithm requires the exact opposite: a stable list.

The indexed batch tests resume a stable two-class `PER_CDC` list. No test suspends and resumes a self-marking deficiency process.

## 7. Chair changes and substitutions

### 7.1 Correct hierarchy

The centralized resolution order is correct:

```text
Priority 3: CLASSI main and .itp holder CSVs
        |
        v
Priority 2: latest applicable VARIAZIONI_CATTEDRA by DATA_DECORRENZA
        |
        v
Priority 1: active SUPPLENZE chain for class/subject/date
```

`CattedraResolver.resolveCattedraDiretta` resolves main and ITP independently. For each slot:

1. `risolviSlot` obtains applicable, elapsed chair changes;
2. it validates that `VECCHIO_TITOLARE` belongs to the current slot or the other slot;
3. it chooses the latest effective change;
4. it throws on equal-date ambiguity, inconsistent old holder, or missing new holder;
5. `trovaSupplente` applies the active substitution after the permanent holder is known.

This correctly prevents a main-slot variation from changing the ITP slot. IRC/ALT are ordinary flagged `MATERIE` rows, so the same hierarchy can apply to them when the caller includes them.

`SupplenzaRepository.findSupplenzaSpecifica`:

- filters by active date;
- filters class and subject when supplied;
- ignores invalid self-substitution;
- converts applicable rows into `RoleResolutionLib.Delegation` objects;
- resolves transitive substitution-of-substitution chains with the library;
- returns the final arc.

The RoleResolutionLib documentation confirms transitive delegation, cycle detection, routing policies, and scoped assignment as library responsibilities.

### 7.2 Multi-holder chair defect

`CLASSI.[MATERIA]` and `CLASSI.[MATERIA.itp]` are CSV fields. `ClasseRepository` correctly loads all holder emails into `Docente[]`.

`CattedraResolver.risolviSlot`, however, does this after selecting a winning change:

```ts
return [nuovo];
```

For a nominal slot `[A, B]` and a variation `A -> C`, the correct result is `[C, B]`; the current result is `[C]`. The unaffected co-holder disappears from:

- the CDU council;
- email `PER_CDC` / `PER_DOCENTE`;
- role-based file/folder ACLs;
- subject-column editors;
- exam/subject-teacher roles.

No indexed cattedra-resolver test covers a multi-holder CSV with a variation affecting only one holder. Existing tests cover main versus ITP isolation, latest-date selection, ambiguity, inconsistency, and articulated partner routing. This is F-02.

### 7.3 Sequential permanent changes

The authoritative schema defines `VARIAZIONI_CATTEDRA` as permanent changes and gives it the composite key `(CLASSE_ID, MATERIA_ID)`. A second change for the same exact context therefore replaces/updates the existing row rather than appending an independent history row.

For an initial `CLASSI.MAT=A`:

```text
first change:  VECCHIO=A, NUOVO=B
second change: VECCHIO=B, NUOVO=C
```

After the row is updated for the second change, `CattedraResolver.risolviSlot` still constructs `nominaliIds` exclusively from `CLASSI` (`{A}`) and selects applicable changes only when `VECCHIO_TITOLARE` belongs to that original set. `B→C` therefore has no match and raises `VariazioneCattedraInconsistenteError`; it never resolves C.

The existing “latest wins” test does not cover this lifecycle. It stores two non-schema-conformant rows that both say `VECCHIO=A`, then selects the later date. That models competing replacements from the original holder, not a real A→B→C sequence. F-11 means chair management works for the first permanent change only unless operators also rewrite `CLASSI`, which would erase Priority-3 baseline semantics and is not specified.

### 7.4 Subject-specific split defect

The physical schema permits dynamic columns:

- `[MATERIA]`
- `[MATERIA.itp]`
- `[MATERIA.SPECIFICA]`

`ClasseRepository.materieColumns` registers only:

```text
main = MATERIA
itp  = MATERIA.itp
```

`CattedraResolver` therefore never discovers holders in `MATERIA.SPECIFICA` columns. `CdcAssembler.toVMsFromAssignments` receives only `{ materia, isItp }`, and `buildVMFromGroup` hard-codes `specificita: null`.

This conflicts with the canonical CDU, which requires `materie[].specificita` and student-filtered council removal of teachers whose specificity is outside `focus.alunno.curriculum[MATERIA].specifiche`.

Affected chains:

- full and filtered CDU;
- personalized document generation;
- email boxes based on filtered CDC;
- subject-teacher role resolution;
- file/folder ACLs;
- generated Sheet column editors where a subject is split by specificity.

This is F-03. The existing model handles shared-versus-partner subject splits and main-versus-ITP splits, but not the third physical split dimension required by the schema.

### 7.5 Articulated shared-holder scope collapse

For a subject shared by both partners with the same permanent holder A:

```text
partner 1: A, no substitute
partner 2: A, active partner-scoped substitute B
```

`resolveCattedraArticolata` initially preserves both assignments because its dedupe key includes the substitute ID. `resolvePermanenti`, however, deduplicates only by `titolare.id` and retains the first assignment's single `classeId`. The second partner scope is discarded.

`RisolutoreRuoliService.docenteMateria` converts that result directly into one `{ docente: A, classeIds: [partner1] }` entry and then reapplies substitutions using only those retained scopes. It cannot find B on partner 2. This affects:

- `DOCENTE_MATERIA` file/folder ACL entries;
- subject-column editors in `SheetMaterieConPermessiGeneratorStrategy`;
- any other role consumer based on `resolvePermanenti`.

The full-CDC route avoids this exact loss because `docentiEffettivi` separately accumulates every assignment scope, but the subject-specific route does not. This is F-13.

## 8. Articulated classes across all chains

### 8.1 Repository model

`ClasseRepository` provides the core group operations:

- `getArticolazione`
- `getClasseParent`
- `getClassePartner`
- `getClassiPartner`
- `getGruppoArticolazione`
- `orderedPartners`
- `getAllDocentiCDCArticolata`
- `getDocentiPerMateriaArticolata`
- `getMaterieArticolazione`

`getMaterieArticolazione` compares partner holder sets:

- same non-empty holder sets in both partners -> shared;
- only/differently held in partner one -> separate first group;
- only/differently held in partner two -> separate second group.

This is deterministic because `orderedPartners` uses the parent's configured partner order.

### 8.2 CDU chain

For a parent class:

- `ClasseProvider` marks `isArticolata` and builds partner/shared/separate metadata;
- `StudentiProvider` reads students from both partner rows, builds `listaCompleta`, `perIndirizzo`, and `indirizziPresenti`;
- `CdcAssembler` calls the centralized resolver, which routes each subject across both partners;
- shared assignments are deduplicated;
- teacher VMs receive `COMUNE`, `SEPARATO_PRIMO`, or `SEPARATO_SECONDO`.

For a partner class, students remain scoped to that partner; the repository can still derive the parent and counterpart.

This covers the primary CDU aggregation requirement, apart from F-03 and the IRC/ALT full-council gap in F-07.

### 8.3 Role and ACL chain

For a parent and split subject with distinct holders, `CattedraResolver.resolvePermanenti` returns each holder together with the actual partner `ClasseId`. `RisolutoreRuoliService` preserves that scope when it checks substitutions. This fixes the common error of checking a partner-scoped `SUPPLENZE` row against the parent ID.

The same connection feeds:

- `DOCENTE_MATERIA`;
- full/filtered CDC roles;
- exam teacher roles;
- file and folder ACLs;
- Sheet column editors.

Indexed cross-cutting tests explicitly cover a parent class with a split subject and a substitution scoped to one partner.

That coverage does not include the shared-holder case in F-13, where the same permanent email occurs on both partners and `resolvePermanenti` drops one of the two scopes.

### 8.4 Email chain

Class-based email enumeration treats only the parent as an entry point and resolves the effective merged council through `CattedraResolver`. Student- and deficiency-based processes use the student's partner ID, consistent with the schema invariant that `ALUNNI.CLASSE` must be a partner, never the parent.

The phrase “effective merged council” does not remain true after enumeration: `cdcEmails` extracts permanent holders only, and the resulting email targets discard subject and partner scope. F-12 therefore breaks substitute routing for articulated `PER_CDC` and `PER_DOCENTE`, even though CDU/role resolution retained the necessary scope earlier.

Potential policy sensitivity remains for `PER_CARENZA_GENITORI_E_COORD`: the CC list is read directly from the student's partner row. If coordinators are configured only on the parent, they will not be copied into CC. The specifications should explicitly state whether parent coordinators or partner coordinators own this process; the current behavior is partner-local.

### 8.5 Blocking document-target defect

`CONF_DOC.GESTIONE_ARTICOLAZIONE` has two authoritative values:

| Value | Required meaning |
| --- | --- |
| `ARTICOLATA` | consider the component/partner classes |
| `COMPLETA` | consider the class as a whole/parent |

The field is defined in `schema.ts`, represented by `GestioneArticolazione`, and present in test seed data. It has no consuming application logic.

`DocumentBatchService.batchGenerateHandler` simply executes:

```text
attive = ClasseRepository.findAttive()
for each active row -> generateForClasse(row, confDocId)
```

It does not read `CONF_DOC`, does not filter parents/partners, and does not map the target according to `GESTIONE_ARTICOLAZIONE`. `DocumentGenerationService.generateForClasse` likewise accepts the target literally.

Consequences depend on which of the three rows are marked active:

- if parent and partners are active, `COMPLETA` can generate three documents instead of one;
- `ARTICOLATA` can incorrectly include the parent;
- duplicate checking is per target class and does not repair the target-selection error;
- filenames, paths, logs, ACL roles, and CDU content all inherit the wrong target;
- long-running JobRunner checkpoints persist the incorrect enumeration, so resume reproduces it.

This is F-01 and prevents a successful verdict for articulated classes across the document chain.

## 9. Mandatory structural audits

### 9.1 Native GAS bypass detection

A `query_graph` audit over `home-giulio-Desktop-ALDO-implementing` searched `src/` call edges for:

`SpreadsheetApp`, `DriveApp`, `MailApp`, `GmailApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, and `LockService`.

The only graph match was `src/onlinetests/index.ts -> SessionActiveUserFacade`, which is a wrapper class name rather than a native `Session` call.

A graph-augmented source search over non-online `src/` found only comments, type descriptions, and wrapper documentation. No ALDO application call to a native GAS global was found.

The production seams are:

- Drive and permissions -> `DriveService` / `PermissionService`;
- Sheets and protection -> `SpreadsheetService`;
- Docs -> `DocumentService`;
- Gmail -> `MailService`;
- properties -> GoogleApiWrapper properties service;
- UI/session/monitoring -> their injected library facades.

**Verdict:** pass for the requested bypass check.

### 9.2 Dead-code analysis

The graph contains no ALDO function/method with literally zero incoming `CALLS` edges after excluding GAS triggers. The minimum observed incoming count is one.

This mechanical result must be interpreted carefully:

- strategy calls and interface dispatch are not always resolved as direct callers;
- constructors, registry references, and generated graph edges can count as incoming;
- configuration fields can still be semantically dead even when their constants are referenced.

`GESTIONE_ARTICOLAZIONE` is the important semantic dead path: its constant and enum exist, but no generation behavior consumes the value.

### 9.3 Library linkage and signatures

The following application-to-library connections match documented or harness-tested surfaces:

| ALDO call | Library seam | Verification |
| --- | --- | --- |
| `Pipeline.addStep/onError/execute` | `PipelineFramework.Pipeline` | graph linkage plus ALDO type declaration/tests |
| `beginTransaction/commit/rollback` | `SheetDBLib.DatabaseService` | `DOCS_LIBS/SheetDBLib_docs.md` |
| `processDocument` | `WorkspaceTemplateEngine.PlaceholderService` | facade checks boolean |
| `processSheet` | `WorkspaceTemplateEngine.PlaceholderService` | facade checks `{success, layouts}`; docs match |
| `protectRanges` | `GoogleApiWrapper.SpreadsheetService` | ALDO harness verifies bound method |
| `shareWithUsers` | `GoogleApiWrapper.PermissionService` | docs identify sharing seam; harness verifies method |
| `MailService.send` | `GoogleApiWrapper.MailService` | typed facade and unit tests |
| `getDelegationChain` / `RoutingResolver.resolve` | `RoleResolutionLib` | docs and cross-cutting tests |
| `JobRunnerService.run/registerJobHandler` | `JobRunnerLib` | batch services and harness tests |

No mismatched method name or parameter shape was found in the audited connections.

### 9.4 Circular dependencies and long chains

No direct two-module import cycle was found under `src/`. The architecture graph reports domain as a high-fan-in core with no outbound package calls, consistent with the intended domain boundary.

The important long execution chains are:

- document entry -> batch -> generation -> CDU -> 10 pipeline steps -> strategy -> library API -> DB commit;
- email entry -> batch -> enumeration -> CDU -> 8 pipeline steps -> Gmail -> log -> post-process;
- role resolution -> cattedra resolution -> chair variation -> substitution chain -> library routing policy.

These chains are cohesive but make failures at shared authorities cross-cutting. `CattedraResolver` and target enumeration deserve the strongest regression coverage because an error there simultaneously affects documents, email, ACLs, and CDU output.

## 10. Test-surface assessment

The full-coverage graph includes unit, integration, build, and online-test sources. Relevant indexed tests include:

- `test/unit/application/document-generation-service.test.ts`
- `test/unit/application/document-batch-service.test.ts`
- `test/unit/application/pipelines/document-steps.test.ts`
- `test/unit/application/sheet-materie-generator.test.ts`
- `test/unit/application/email-notification-service.test.ts`
- `test/unit/application/pipelines/email-steps.test.ts`
- `test/unit/application/email-batch-service.test.ts`
- `test/unit/application/email-retry-service.test.ts`
- `test/unit/application/cattedra-resolver.test.ts`
- `test/unit/application/cattedra-cross-cutting-agreement.test.ts`
- `test/unit/application/risolutore-ruoli-service.test.ts`
- `test/unit/application/context-engine/cdc-assembler.test.ts`
- `test/unit/infrastructure/classe-articolazione.test.ts`
- `test/unit/infrastructure/supplenza-repository.test.ts`
- `test/unit/infrastructure/variazione-cattedra-repository.test.ts`
- `test/unit/infrastructure/persistence-writes.test.ts`
- `test/unit/infrastructure/persistence-save.test.ts`
- `test/unit/harness/gaslibs.test.ts`
- online E2E scenario and repository checks under `src/onlinetests/checks/`.

Coverage strengths:

- simple priority 3 -> 2 -> 1 resolution;
- latest chair change and ambiguity/inconsistency errors;
- main versus ITP isolation;
- transitive substitutions;
- articulated parent partner-routing;
- partner-scoped substitution;
- file versus folder substitute ACL policy;
- dynamic Sheet layout and protection;
- email send/test mode/error logging;
- attachment IDs and folder IDs in `LOG_MAIL`;
- DB commit/rollback paths.

Missing regression scenarios corresponding to the findings:

1. `COMPLETA` batch emits only the articulated parent.
2. `ARTICOLATA` batch emits only the two partners.
3. partial variation of a two-holder CSV preserves the unaffected holder.
4. `MATERIA.SPECIFICA` enters CDU/filtered council/role ACL chains.
5. permission exception prevents `GENERATO` commit or persists an explicit ACL-failure state.
6. `LOG_DOCS.MATERIA` and ISO creation timestamp are written.
7. pre-existing Drive folder is reconciled into a complete `LOG_FOLD` row.
8. `overwrite=true` bypasses duplicate detection.
9. `PER_CDC` includes IRC/ALT.
10. post-send logging failure has an idempotent recovery behavior.
11. a thrown email CDU/condition/render step fails the target and the batch instead of returning zero errors.
12. a thrown document condition fails the class and the batch instead of returning `SKIPPED`.
13. a real sequential A→B→C chair update resolves C under the schema's composite key.
14. `PER_CDC` honors all three `CONF_MAIL.SUPPLENTI` policies.
15. `PER_DOCENTE` preserves subject and articulated-partner scope and rejects ambiguous simultaneous substitutions.
16. a shared articulated holder with a substitute on partner two resolves that substitute for `DOCENTE_MATERIA` and Sheet column ACLs.
17. a failed `SOLO_SUPPLENTI` send is selected for retry, increments attempts on repeated failure, and reaches permanent-failure notification.
18. SheetDB commit failure removes the Drive clone, clears transaction state, and does not poison the next batch item.
19. orphan deletion failure still propagates the original critical step and prevents commit.
20. duplicate-query and document post-process exceptions fail the operation rather than continuing/committing.
21. a chair change or ended substitution removes obsolete users from a reused folder ACL.
22. two distinct failed deliveries with the same pattern/recipients retain separate retry identities and original content/target.
23. a `PER_CARENZA_GENITORI*` job suspended after one self-marking chunk sends every remaining deficiency exactly once after resume.
24. two students in one class each receive their `UNO PER PIANO PERSONALIZZATO` document.
25. two subjects/teachers in one class are not collapsed by `UNO PER CLASSE PER MATERIA` or `UNO PER DOCENTE`.

Because this audit was requested as a graph-only, no-source-modification analysis, test files were inspected through the graph but the Jest/build/online suites were not executed. This report verifies structural connectivity and exposes static correctness gaps; it does not claim current runtime suites pass.

## 11. Recommended remediation order

1. **Fix resumable target identity (F-21, F-01).** Persist a stable, schema-aware target list or resume by immutable target keys; never apply an old index to a newly enumerated list. Resolve articulated parent/partner targets before the first checkpoint.
2. **Propagate every required-step failure (F-10, F-14, F-17, F-18).** Consume pipeline execution failure, set the primary failure signal before cleanup, isolate compensating-cleanup errors, and distinguish configured skips from failed targets.
3. **Correct document uniqueness (F-22, F-06).** Define a schema-specific logical artifact key containing the applicable student/plan, teacher, subject, and class dimensions; honor `overwrite`.
4. **Close transaction failure boundaries (F-16).** Ensure commit failure clears SheetDB transaction state and invokes idempotent Drive compensation; stop or reset the batch before processing another target.
5. **Reconcile ACLs, not only additions (F-19, F-04, F-09).** Compute desired versus managed current permissions for reused folders, remove obsolete grants, make required ACL failure part of success semantics, and reject invalid permission enums.
6. **Correct chair transitions and scope (F-02, F-11, F-13).** Preserve unaffected holders, define a schema-compatible A→B→C lifecycle, and accumulate every partner `ClasseId` for equal permanent holders before substitute routing.
7. **Repair email substitute routing and delivery retry (F-12, F-15, F-20, F-08).** Carry structured assignment scope—holder, partner class, subject, main/ITP—into targets; apply policy to CDC; persist one immutable logical-delivery/idempotency key with per-destination outcomes and enough original context to replay safely.
8. **Extend the chair model for specificities (F-03).** This is a reusable repository/resolution concern and may require a GasLibraryFactory extension decision before ALDO-local implementation, per project policy.
9. **Complete audit rows (F-05).** Populate applicable `LOG_DOCS` and `LOG_FOLD` fields, use an ISO timestamp, and reconcile Drive-existing/DB-missing folders.
10. **Correct complete-council IRC/ALT inclusion (F-07).**

## 12. Final conclusion

ALDO has a solid shared architecture: the document, email, role, CDU, persistence, and GasLibraryFactory layers are genuinely connected rather than isolated implementations. The centralized chair resolver and partner-scoped substitution work are especially valuable because they feed multiple downstream chains consistently.

The requested behaviors are not yet correct in all cases. In addition to the articulated-document targeting omission, a resumed deficiency batch can skip all remaining notifications, and class-only deduplication can suppress most personalized or per-subject documents. Folder ACLs retain obsolete teachers/substitutes indefinitely. Critical cleanup/commit failures can leave orphan files, poison later batch items, or allow a failed pipeline to commit. Chair history fails at the second permanent change, while substitute routing loses subject or articulated-partner scope in multiple email and ACL paths.

These defects can create wrong document counts, permanently unsent notifications, stale unauthorized access, missing or duplicated recipients, incomplete audit records, or files marked generated without their required state/access. They are functional and security correctness issues, not merely maintainability concerns.

The system should therefore be considered **partially integrated but not release-verified for the audited scope**. At minimum F-21, F-22, F-19, F-17, F-10, F-01, F-16, F-11, F-12, F-20, F-15, F-02, F-13, F-03, F-04, F-18, and F-05 are release-blocking in their affected workflows and require cross-chain regression tests.
