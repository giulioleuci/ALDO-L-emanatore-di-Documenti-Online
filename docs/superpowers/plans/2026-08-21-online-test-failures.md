# Online Test Failures (run 2026-08-21) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every failure and the execution-time blowout observed in the 2026-08-21 GAS run of `OnlineTests.gs` batches 1–4, so all four batches complete green inside the GAS execution limit.

**Architecture:** Nine independent fixes across three layers — ALDO production code (`src/application`, `src/infrastructure`), the online-test fixture/seeders (`src/onlinetests/data`), and the online checks themselves (`src/onlinetests/checks`). Each task is offline-testable via the existing Jest projects; the GAS re-run is the final acceptance gate.

**Tech Stack:** TypeScript → Babel/webpack → GAS V8; Jest (`jest.config.cjs`); vendored `GasLibraryFactory` bundle in `vendor/gaslibs.Code.js`.

**Spec:** `ONLINE_RESULTS/batch{1,2,3,4}.txt` (the raw GAS console logs this plan argues from), plus `SPECS_ALDO/01_SCHEMA_DATABASE.md` (LOG_FOLD contract) and `SPECS_ALDO/02_CDU_STRUTTURA.md`.

## Observed results

| Batch | Result                                         | Detail                                                |
| ----- | ---------------------------------------------- | ----------------------------------------------------- |
| 1     | 23 passed, **2 failed**                        | verbale LOG_FOLD metadata; tabelle importate content  |
| 2     | **killed** — `Exceeded maximum execution time` | 3 failures before the kill, then one 26-minute test   |
| 3     | 19 passed, **8 failed**                        | ASL header, 4× INTERPRET.FLAUTO, 2× Sheets read quota |
| 4     | 35 passed, 0 failed                            | —                                                     |

## Global Constraints

- Target is **GAS V8**: synchronous code only, no Node/browser-only APIs.
- Native GAS globals (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `CacheService`, …) may only be touched inside `GoogleApiWrapper`. ALDO code reaches them through a facade — enforced by `npm run lint` (`no-restricted-globals`). `DocumentService.openStandard(id)` is a **library** method and is allowed.
- Never edit `dist/*` or `vendor/*` by hand. `vendor/gaslibs.Code.js` changes only via `npm run refresh:vendor` after a `GasLibraryFactory` build.
- `GasLibraryFactory`-first: check `GasLibraryFactory/DOCS_LIBS` before writing logic; on a partial match, stop and ask the user before writing ALDO-local code.
- All DB table/column names are UPPERCASE and come from `src/config/schema.ts`.
- Gates for every task: `npm run typecheck && npm run lint && npm test`.
- Fixture changes only reach GAS after the user re-runs the **test database + template generation** entry point, or after the fixture-version migration bumps (Task 6). State this in the commit body when it applies.

## Root-cause summary

| #   | Failure (log evidence)                                                                   | Root cause                                                                                                                                                                                                                                                                                                                | Task |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `Cartella verbale per 1A non ha metadata MATERIE configurati`                            | Check added in `0a67c67` filters `LOG_FOLD.TIPO === 'VERBALE'` (that is `CONF_DOC.TIPO`; the column holds `CONF_DOC.ID` = `E2E_VERBALE`) and matches `parentPath(doc.PATH)` (the folder is registered at the doc's own PATH). Two test bugs, no production defect.                                                        | 1    |
| 2   | 2718× `[ProcessMonitorService] Step not found: <step> in job <job>`                      | Step state written by `logStepStart` is not visible to `logStepComplete`; also ALDO reports skipped steps through `logStepComplete` instead of `logStepSkipped`. ~0.5 s per warning ⇒ ~5 s of the ~13 s per document.                                                                                                     | 2    |
| 3   | `Tabelle importate: … heading atteso presente=false; placeholder letterale residuo=true` | `DocumentTableManager.insertTableAtMarker` mutates the **DocumentApp** model and never calls `saveAndClose`; the following `replaceText` and `processDocument` write through the **Docs API**. At execution end the dangling DocumentApp model auto-saves and clobbers every batchUpdate edit — placeholders come back.   | 3    |
| 4   | 4× `Specifica INTERPRET.FLAUTO non registrata in MATERIE (materia INTERPRET)`            | Storico year sheets get the full shared CLASSI header (`INTERPRET.FLAUTO` column, empty) but their MATERIE catalog seeds only `INTERPRET.CHITARRA`; `getTeachingSlots` validates the column before checking whether anyone is assigned.                                                                                   | 4    |
| 5   | 2× `Quota exceeded … 'Read requests per minute per user'`                                | `MasterStoricoDatabaseProvider.anniStorici` builds a fresh `DatabaseService` per historical year on **every** call (6 call sites, several per CDU build); each construction re-reads the year spreadsheet's schema.                                                                                                       | 5    |
| 6   | `TIMESTAMP fallback: ASL non deve avere una colonna DATA_MODIFICA nel fixture`           | The earlier ASL imports carry a `DATA_MODIFICA` source column (needed for the ghost row) and the library passes unmapped columns straight through, materialising the column in the target. The migration removes it only on a fixture-version change.                                                                     | 6    |
| 7   | `Exceeded maximum execution time` (batch 2)                                              | `Articolazione CDU: batch DOCUMENTO_DOCENTE_MATERIA …` generates **108** documents (~14 s each ⇒ 26 min) to assert one `INTERPRET.CHITARRA` LOG_DOCS row.                                                                                                                                                                 | 7    |
| 8   | `E2E_MAIL_VERBALE: nessuna riga LOG_MAIL testMode registrata` (+2 cascading)             | Operator ordering: `resetE2eHistoryTables` is a **pre-batch-1** launcher; it ran between batch 1 and batch 2 and purged the LOG_DOCS rows the `documenti` box of `E2E_MAIL_VERBALE` reads ⇒ `RenderBoxes → Boxes: 0` ⇒ `ComposeEmail` skipped ⇒ no LOG_MAIL row. No code defect, but the failure message hides the cause. | 8    |
| 9   | 58× `addProtectedRange … Utente non valido` + 116 retry lines                            | Protections are attempted for synthetic `@onlinetest.aldo.local` principals that Sheets always rejects; three attempts with backoff per column. ~90 s and 174 log lines wasted per suite.                                                                                                                                 | 9    |

---

### Task 1: Fix the verbale LOG_FOLD registration assertion

**Files:**

- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts:461-491`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Interfaces:**

- Consumes: `COL_LOG_FOLD` (`ID | TIPO | NOME | PATH | LINK | CLASSI | UTENTI | MATERIE`) from `src/config/schema.ts`; `CONF_DOC_VERBALE = 'E2E_VERBALE'` from `src/onlinetests/data/SharedTestDatabaseBuilder.ts`.
- Produces: nothing consumed by later tasks.

Per `SPECS_ALDO/01_SCHEMA_DATABASE.md` (§ LOG_FOLD) `TIPO` is a **FK to `CONF_DOC.ID`**, and `PrepareInfrastructureStep` writes `tipo: String(cfg(ctx)[COL_CONF_DOC.ID])` and registers the folder at exactly the path that later lands in `LOG_DOCS.PATH`. The current check therefore looks for a row that can never exist.

- [x] **Step 1: Write the failing test**

Append to `test/unit/onlinetests/e2e-scenario-checks.test.ts`:

```typescript
test('accetta la cartella verbale registrata con TIPO=CONF_DOC.ID sul path del documento', () => {
  const rows = {
    LOG_DOCS: [
      {
        ID: 'doc1',
        ID_GEN: 'E2E_VERBALE',
        TIPO: 'VERBALE',
        CLASSI: '1A',
        MATERIE: 'MATE',
        PATH: '_ALDO_E2E_OUTPUT/VERBALI/1A'
      }
    ],
    LOG_FOLD: [
      {
        ID: 'fold1',
        TIPO: 'E2E_VERBALE',
        PATH: '_ALDO_E2E_OUTPUT/VERBALI/1A',
        CLASSI: '1A',
        MATERIE: 'MATE'
      }
    ]
  };
  expect(() => assertVerbaleRegistrationMetadataFor(rows, ['1A'])).not.toThrow();
});

test('rifiuta la cartella verbale priva di MATERIE', () => {
  const rows = {
    LOG_DOCS: [
      {
        ID: 'doc1',
        ID_GEN: 'E2E_VERBALE',
        TIPO: 'VERBALE',
        CLASSI: '1A',
        MATERIE: 'MATE',
        PATH: '_ALDO_E2E_OUTPUT/VERBALI/1A'
      }
    ],
    LOG_FOLD: [
      {
        ID: 'fold1',
        TIPO: 'E2E_VERBALE',
        PATH: '_ALDO_E2E_OUTPUT/VERBALI/1A',
        CLASSI: '1A',
        MATERIE: ''
      }
    ]
  };
  expect(() => assertVerbaleRegistrationMetadataFor(rows, ['1A'])).toThrow(
    /Cartella verbale per 1A/
  );
});
```

Read the existing tests in that file first and reuse their in-memory `db` double instead of the `rows` literal above if one already exists — the two tests must exercise `assertVerbaleRegistrationMetadata` through whatever seam the file already uses (do not invent a new exported helper if the file already drives the checks through a fake container).

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts -t "cartella verbale"`
Expected: FAIL — `Cartella verbale per 1A non ha metadata MATERIE configurati` on the first test.

- [x] **Step 3: Fix the assertion**

In `src/onlinetests/checks/e2eScenarioChecks.ts`, replace the folder lookup:

```typescript
const verbaleDocs = rowsForConfig(TABLE.LOG_DOCS, CONF_DOC_VERBALE);
// LOG_FOLD.TIPO is a FK to CONF_DOC.ID (01 §LOG_FOLD) — PrepareInfrastructureStep
// writes CONF_DOC.ID there, not CONF_DOC.TIPO — and the folder is registered at
// exactly the PATH_OUT that RegisterDocumentStep copies into LOG_DOCS.PATH.
const verbaleFolders = db
  .table(TABLE.LOG_FOLD)
  .findAll()
  .filter((row) => row[COL_LOG_FOLD.TIPO] === CONF_DOC_VERBALE);
const hasMate = (value: unknown): boolean => csvContains(value, 'MATE');
for (const classe of ALL_CLASSI_E2E) {
  const doc = verbaleDocs.find((row) => csvContains(row[COL_LOG_DOCS.CLASSI], classe));
  if (doc === undefined || !hasMate(doc[COL_LOG_DOCS.MATERIE])) {
    throw new ValidationError(`Verbale per ${classe} non ha metadata MATERIE configurati`);
  }
  const folder = verbaleFolders.find(
    (row) =>
      csvContains(row[COL_LOG_FOLD.CLASSI], classe) &&
      row[COL_LOG_FOLD.PATH] === doc[COL_LOG_DOCS.PATH]
  );
  if (folder === undefined || !hasMate(folder[COL_LOG_FOLD.MATERIE])) {
    throw new ValidationError(`Cartella verbale per ${classe} non ha metadata MATERIE configurati`);
  }
}
```

Delete the now-unused `parentPath` helper.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`
Expected: PASS (all tests in the file).

- [x] **Step 5: Commit**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "fix: match verbale folder registration by CONF_DOC id and path"
```

---

### Task 2: Diagnose and fix the ProcessMonitor step telemetry

**Files:**

- Modify: `src/application/services/DocumentGenerationService.ts:358-366`
- Modify: `src/application/services/EmailNotificationService.ts:322-330`
- Modify: `src/infrastructure/facades/ProcessMonitorFacade.ts`
- Create: `src/onlinetests/checks/processMonitorChecks.ts`
- Modify: `src/onlinetests/index.ts` (register the new group in batch 4 — the fast batch)
- Test: `test/unit/application/document-generation-service.test.ts`, `test/unit/application/email-notification-service.test.ts`, `test/unit/onlinetests/process-monitor-checks.test.ts` (create)

**Interfaces:**

- Consumes: `IProcessMonitor` (`registerJob`, `startJob`, `updateProgress`, `logStepStart`, `logStepComplete`, `logStepSkipped`, `completeJob`, `setError`) from `src/infrastructure/facades/ProcessMonitorFacade.ts`.
- Produces: `IProcessMonitor.getJobState(jobId): unknown` (new method on port and facade, delegating to the library's public `ProcessMonitorService.getJobState`); `registerProcessMonitorChecks(runner, container, sample)` exported from the new checks module.

**Why not the library's native seam:** `Pipeline` accepts `{ monitor, jobId }` in its options and calls `logStepStart`/`logStepComplete` itself (`vendor/gaslibs.Code.js:56821`, `:57084`), but it never calls `logStepSkipped`. ALDO's hooks are strictly richer, so they stay; the fix is to route the skipped case correctly and then diagnose the state loss.

- [x] **Step 1: Write the failing test for skipped-step routing**

In `test/unit/application/document-generation-service.test.ts` (reuse the file's existing monitor spy/fake; add one if none exists):

```typescript
test('registra gli step saltati come SKIPPED, non come completati', () => {
  const monitor = {
    registerJob: jest.fn(),
    startJob: jest.fn(),
    updateProgress: jest.fn(),
    logStepStart: jest.fn(),
    logStepComplete: jest.fn(),
    logStepSkipped: jest.fn(),
    completeJob: jest.fn(),
    setError: jest.fn(),
    getJobState: jest.fn()
  };
  // build the service with { ...deps, monitor } and run a generation whose
  // CONF_DOC.CONDIZIONE is false, so AnalyzeContext gates the rest of the pipeline
  runGenerationWithSkippedSteps(monitor, 'job1');

  expect(monitor.logStepSkipped).toHaveBeenCalledWith('job1', 'PrepareInfrastructure');
  expect(monitor.logStepComplete).not.toHaveBeenCalledWith('job1', 'PrepareInfrastructure', true);
});
```

Mirror the same test in `test/unit/application/email-notification-service.test.ts` for `ComposeEmail`.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts test/unit/application/email-notification-service.test.ts -t "SKIPPED"`
Expected: FAIL — `logStepSkipped` never called.

- [x] **Step 3: Route skipped steps and expose the state getter**

In both services, replace the `afterStep` hook body:

```typescript
pipeline.afterStep((step, _ctx, result) => {
  if (result.skipped === true) monitor.logStepSkipped(jobId, step.getName());
  else monitor.logStepComplete(jobId, step.getName(), result.success);
});
```

In `src/infrastructure/facades/ProcessMonitorFacade.ts` add to the interface and the class:

```typescript
  /** Reads the job state the library persists (cache first, ScriptProperties fallback) — used by the online telemetry probe. */
  getJobState(jobId: string): unknown;
```

```typescript
  getJobState(jobId: string): unknown {
    return this.monitor.getJobState(jobId);
  }
```

Update every `IProcessMonitor` test double in `test/` to add `getJobState` (grep for `logStepSkipped:` to find them).

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts test/unit/application/email-notification-service.test.ts`
Expected: PASS

- [x] **Step 5: Write the online telemetry probe**

Create `src/onlinetests/checks/processMonitorChecks.ts`:

```typescript
/**
 * Isolates the `[ProcessMonitorService] Step not found` flood seen in the
 * 2026-08-21 run: 2718 warnings, every one of them emitted by
 * `logStepComplete` after `logStepStart` had just pushed that same step into
 * the state. Either the ScriptCache write is not visible to the following
 * read, or the state read falls back to the ScriptProperties snapshot taken by
 * `startJob` (which has no steps). The probe separates the two.
 */
export function registerProcessMonitorChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: { sampleSpreadsheetUrl: string }
): void {
  runner.add(
    groupName('monitor.telemetria', 'lo step registrato sopravvive alla rilettura'),
    sample.sampleSpreadsheetUrl,
    () => {
      const monitor = container.get<IProcessMonitor>('monitor');
      const jobId = `probe_${Date.now()}`;
      monitor.registerJob(jobId);
      monitor.startJob(jobId);
      monitor.logStepStart(jobId, 'ProbeStep');
      const state = monitor.getJobState(jobId) as { steps?: Array<{ name: string }> } | null;
      const names = (state?.steps ?? []).map((step) => step.name);
      if (!names.includes('ProbeStep')) {
        throw new ValidationError(
          `Telemetria step persa: dopo logStepStart lo stato contiene [${names.join(', ')}]`
        );
      }
    }
  );
}
```

Register it in `src/onlinetests/index.ts` inside `futureScenarioRegistrations` and add `'processMonitor'` to `executeOnlineTestsBatch4`'s group list (batch 4 runs in 8 s, so the probe costs nothing). Write `test/unit/onlinetests/process-monitor-checks.test.ts` covering both branches with a fake monitor whose `getJobState` returns a state with and without `ProbeStep`.

- [x] **Step 6: Run the unit tests and commit**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/process-monitor-checks.test.ts`
Expected: PASS

```bash
git add src/application/services/DocumentGenerationService.ts src/application/services/EmailNotificationService.ts src/infrastructure/facades/ProcessMonitorFacade.ts src/onlinetests/checks/processMonitorChecks.ts src/onlinetests/index.ts test/
git commit -m "fix: report skipped pipeline steps as skipped and probe monitor state"
```

- [x] **Step 7: Run batch 4 on GAS and read the probe**

Ask the user to run `runOnlineTestsBatch4` and paste the log. **Decision point — do not guess:**

- Probe **fails** ⇒ the library's step state does not survive a cache round-trip. The fix belongs in `GasProcessMonitorLib` (`_writeState(jobId, state, false)` for step logs, `_readState` preferring cache): stop and ask the user whether to extend `GasLibraryFactory` before touching anything, per CLAUDE.md.
- Probe **passes** ⇒ the loss happens only under a real batch (cache pressure from Drive/Sheets metadata caching during document generation). Then re-run batch 1 and check whether the warnings survive the Task 7 scoping; if they do, propose to the user persisting step state to ScriptProperties in the library.

---

### Task 3: Flush the DocumentApp model before the Docs-API render pass

**Files:**

- Modify: `src/infrastructure/facades/DocumentTableFacade.ts`
- Modify: `src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts`
- Test: `test/unit/infrastructure/document-table-facade.test.ts`, `test/unit/application/documento-con-tabelle-generator.test.ts`

**Interfaces:**

- Consumes: `DocumentService.openStandard(documentId)` — public library method returning the DocumentApp `Document` (`vendor/gaslibs.Code.js:19167`).
- Produces: `IDocumentTableFacade.flush(fileId): void`.

**Evidence:** `DocumentTableManager.insertTableAtMarker` (`vendor/gaslibs.Code.js:18405-18442`) opens the document with `openStandard`, mutates the body and returns **without `saveAndClose`**. `DocumentBuilder.execute()` only flushes when the batch contained standard-API ops (`:16983-16992`), and `replaceText` is converted to Docs-API requests, so it does not flush. `PlaceholderService.processDocument` then writes exclusively through `batchUpdate`. When the execution ends, GAS auto-saves the still-open DocumentApp model and reverts every batchUpdate edit — exactly the `heading atteso presente=false; placeholder letterale residuo=true; placeholder residui=3` observed on file `1w3RAKMF86_X1Cj5wX2bpkAYfMfV-FOofqvhK3wYzLwk`.

- [x] **Step 1: Write the failing facade test**

In `test/unit/infrastructure/document-table-facade.test.ts`:

```typescript
test('flush chiude e salva il modello DocumentApp aperto dall inserimento tabella', () => {
  const saveAndClose = jest.fn();
  const documents = new FakeDocumentService();
  documents.standardDocs = { doc1: { saveAndClose } };
  const facade = new DocumentTableFacade(documents as never);

  facade.flush('doc1');

  expect(saveAndClose).toHaveBeenCalledTimes(1);
});

test('flush non esplode quando il documento non espone saveAndClose', () => {
  const documents = new FakeDocumentService();
  documents.standardDocs = { doc1: {} };
  const facade = new DocumentTableFacade(documents as never);

  expect(() => facade.flush('doc1')).not.toThrow();
});
```

Add to `FakeDocumentService`:

```typescript
  standardDocs: Record<string, { saveAndClose?: () => void }> = {};
  openStandard(documentId: string): { saveAndClose?: () => void } {
    return this.standardDocs[documentId] ?? {};
  }
```

- [x] **Step 2: Write the failing strategy test**

In `test/unit/application/documento-con-tabelle-generator.test.ts`:

```typescript
test('svuota il modello DocumentApp dopo le tabelle e prima della sostituzione placeholder', () => {
  const calls: string[] = [];
  const tables = {
    findTablePlaceholders: () => [{ marker: '{{TABELLA:s1}}', sheetFileId: 's1' }],
    insertTableAtMarker: () => calls.push('insert'),
    removeText: () => calls.push('remove'),
    appendTable: () => calls.push('append'),
    flush: () => calls.push('flush')
  };
  const templates = { processDocument: () => calls.push('render') } as never;
  const strategy = buildStrategyWithSheetRows(templates, tables, [
    ['Nome', 'Valore'],
    ['Prima riga', '1']
  ]);

  strategy.render('doc1', {} as never);

  expect(calls).toEqual(['insert', 'flush', 'remove', 'render']);
});
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/document-table-facade.test.ts test/unit/application/documento-con-tabelle-generator.test.ts`
Expected: FAIL — `facade.flush is not a function`.

- [x] **Step 4: Implement the flush**

`src/infrastructure/facades/DocumentTableFacade.ts` — add to the interface:

```typescript
  /**
   * Saves and closes the DocumentApp model left open by `insertTableAtMarker`
   * (the library never flushes it). Mandatory before any Docs-API write on the
   * same file: otherwise GAS auto-saves the stale model at the end of the
   * execution and silently reverts every batchUpdate edit.
   */
  flush(fileId: string): void;
```

and to the class:

```typescript
  flush(fileId: string): void {
    const doc = this.documents.openStandard(fileId) as { saveAndClose?: () => void };
    if (typeof doc?.saveAndClose === 'function') doc.saveAndClose();
  }
```

`src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts` — restructure `render`:

```typescript
  override render(fileId: string, cdu: Cdu): void {
    const placeholders = this.tables.findTablePlaceholders(fileId);
    const inserted: string[] = [];
    for (const placeholder of placeholders) {
      const data = this.readSheetAsStrings(placeholder.sheetFileId);
      if (data.length > 1) {
        this.tables.insertTableAtMarker(fileId, placeholder.marker, data, { headerRow: true });
        inserted.push(placeholder.marker);
      }
    }
    // insertTableAtMarker writes through DocumentApp and never saves; removeText and
    // the generic pass below write through the Docs API. Flush here or the DocumentApp
    // model auto-saves last and reverts both of them (2026-08-21 batch 1 failure).
    if (inserted.length > 0) this.tables.flush(fileId);
    for (const placeholder of placeholders) this.tables.removeText(fileId, placeholder.marker);
    super.render(fileId, cdu);
  }
```

Update the class doc comment to state the flush contract.

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/document-table-facade.test.ts test/unit/application/documento-con-tabelle-generator.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/infrastructure/facades/DocumentTableFacade.ts src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts test/unit/infrastructure/document-table-facade.test.ts test/unit/application/documento-con-tabelle-generator.test.ts
git commit -m "fix: flush DocumentApp model before Docs API render pass"
```

- [x] **Step 7: Note the library-side defect for the user**

Report (do not implement without approval): `DocumentTableManager.insertTableAtMarker` should flush like `DocumentBuilder.execute()` already does for standard-API ops. Also note that `WorkspaceTemplateEngine` has a native `{{table[source=…]}}` directive (`vendor/gaslibs.Code.js:25990`) that would remove ALDO's mixed-API path entirely if the imported grid were exposed on the CDU — a possible GLF-first follow-up.

---

### Task 4: Stop failing on empty dotted-specifica columns, and seed the storico catalog

**Files:**

- Modify: `src/infrastructure/repositories/ClasseRepository.ts:139-153`
- Modify: `src/onlinetests/data/Seeders.ts` (`seedStorico`, MATERIE block at `:206-235`)
- Test: `test/unit/infrastructure/classe-cattedre.test.ts`, `test/unit/onlinetests/seeders.test.ts`

**Interfaces:**

- Consumes: `TeachingSlotDescriptor { column, materia, kind, specifica, actorEmails }` from `src/domain/repositories/IClasseRepository.ts`.
- Produces: unchanged public API — `getTeachingSlots(classe)` keeps throwing `MateriaNotFoundError` for a **populated** unregistered specifica column.

- [x] **Step 1: Write the failing repository test**

In `test/unit/infrastructure/classe-cattedre.test.ts`:

```typescript
test('ignora una colonna specifica non registrata quando è vuota', () => {
  const repo = buildClasseRepository({
    MATERIE: [{ ID: 'INTERPRET.CHITARRA' }],
    CLASSI: [
      {
        ID: '4A',
        'INTERPRET.CHITARRA': 'doc5@x.it',
        'INTERPRET.FLAUTO': ''
      }
    ]
  });

  const slots = repo.getTeachingSlots(repo.findById('4A')!);

  expect(slots.map((slot) => slot.column)).toEqual(['INTERPRET.CHITARRA']);
});

test('continua a rifiutare una colonna specifica non registrata ma popolata', () => {
  const repo = buildClasseRepository({
    MATERIE: [{ ID: 'INTERPRET.CHITARRA' }],
    CLASSI: [
      {
        ID: '4A',
        'INTERPRET.CHITARRA': 'doc5@x.it',
        'INTERPRET.FLAUTO': 'doc6@x.it'
      }
    ]
  });

  expect(() => repo.getTeachingSlots(repo.findById('4A')!)).toThrow(
    /Specifica INTERPRET\.FLAUTO non registrata in MATERIE/
  );
});
```

Use the file's existing repository builder helper; do not add a new one.

- [x] **Step 2: Run the tests to verify the first fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/classe-cattedre.test.ts -t "colonna specifica"`
Expected: FAIL on the empty-column test with `Specifica INTERPRET.FLAUTO non registrata in MATERIE (materia INTERPRET)`.

- [x] **Step 3: Validate only columns that carry data**

In `src/infrastructure/repositories/ClasseRepository.ts`, inside the `for (const column of Object.keys(row))` loop:

```typescript
if (column.startsWith(prefix) && column !== itp) {
  const actorEmails = this.csvEmails(row[column]);
  // An empty dotted column is just a header the sheet carries (every E2E and
  // storico sheet gets the full CLASSI header): nobody is assigned, so there is
  // nothing to resolve and nothing to validate. Only a populated column must
  // exist in the MATERIE catalog (2026-07-30 specifica-catalog design).
  if (actorEmails.length === 0) continue;
  const isSpecificaItp = column.endsWith('.itp');
  const catalogColumn = isSpecificaItp ? column.slice(0, -'.itp'.length) : column;
  const specifica = catalogColumn.slice(prefix.length);
  if (!this.materieIds.has(catalogColumn)) {
    throw new MateriaNotFoundError(
      `Specifica ${catalogColumn} non registrata in MATERIE (materia ${materia})`
    );
  }
  add(column, isSpecificaItp ? 'ITP' : 'SPECIFICA', specifica);
}
```

`add()` recomputes `csvEmails` — that is a pure read of the same row, so leave `add` untouched rather than threading the value through.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/classe-cattedre.test.ts test/unit/infrastructure/classe-repository.test.ts`
Expected: PASS

- [x] **Step 5: Write the failing seeder test**

In `test/unit/onlinetests/seeders.test.ts`:

```typescript
test('seedStorico registra ogni materia puntata usata dalle intestazioni CLASSI', () => {
  const prior = new FakeSampleSpreadsheet();
  seedStorico(prior, '2025-2026');
  const ids = prior.rows(TABLE.MATERIE).map((row) => row[COL_MATERIE.ID]);
  expect(ids).toEqual(expect.arrayContaining(MATERIE_PUNTATE));
});
```

(`MATERIE_PUNTATE` comes from `src/onlinetests/data/fixtures.ts`; reuse the file's existing fake spreadsheet double.)

- [x] **Step 6: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/seeders.test.ts -t "materia puntata"`
Expected: FAIL — `INTERPRET.FLAUTO`, `LAB.GRUPPO_A`, `LAB.SEMINARIO_POMERIDIANO` missing.

- [x] **Step 7: Seed the full dotted catalog into the storico years**

In `src/onlinetests/data/Seeders.ts`, replace the hand-written `INTERPRET.CHITARRA` MATERIE row inside `seedStorico` with a loop over the shared catalog, so the storico years can never drift from `HEADERS[TABLE.CLASSI]`:

```typescript
// Every dotted column in the shared CLASSI header must exist in this year's
// MATERIE catalog, populated or not — ClasseRepository.getTeachingSlots resolves
// the catalog id for the ones that are populated, and the E2E storico sheets get
// the same full header as the current-year sheet.
for (const row of buildMaterieRows().filter((materia) =>
  MATERIE_PUNTATE.includes(String(materia[COL_MATERIE.ID]))
)) {
  prior.appendRow(TABLE.MATERIE, row);
}
```

Import `buildMaterieRows` from `./SharedTestDatabaseBuilder` and `MATERIE_PUNTATE` from `./fixtures`. Keep the `GST` and `STO` rows as they are — they carry storico-only `EVOLUZIONE` data.

- [x] **Step 8: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/seeders.test.ts && npm test`
Expected: PASS

- [x] **Step 9: Commit**

```bash
git add src/infrastructure/repositories/ClasseRepository.ts src/onlinetests/data/Seeders.ts test/unit/infrastructure/classe-cattedre.test.ts test/unit/onlinetests/seeders.test.ts
git commit -m "fix: validate dotted cattedra columns only when populated"
```

---

### Task 5: Memoize the historical databases

**Files:**

- Modify: `src/application/storico/StoricoDatabaseProvider.ts:31-57`
- Test: `test/unit/application/storico-services.test.ts`

**Interfaces:**

- Consumes: `IMasterSheetRepository.findAnniStorici(profondita): Array<{ idSpreadsheet, annoScolasticoRaw }>`.
- Produces: unchanged `StoricoDatabaseProvider.anniStorici(profondita): AnnoStorico[]`; repeated calls return the **same** `AnnoStorico` objects for a year already opened.

Six call sites (`StoricoAlunniService`, `StoricoDocentiService`, `StoricoClassiService`, `StoricoDocumentiService`, `StoricoClasseProvider`, plus the CDU providers) each call `anniStorici`, and every call built a fresh `DatabaseService` per year — two schema reads per year per call. That is what exhausted `Read requests per minute per user` in batch 3.

- [x] **Step 1: Write the failing test**

In `test/unit/application/storico-services.test.ts`:

```typescript
test('riusa il database di un anno già aperto tra chiamate successive', () => {
  const master = {
    findAnniStorici: jest.fn(() => [{ idSpreadsheet: 'ss1', annoScolasticoRaw: '2025-2026' }])
  };
  const provider = new MasterStoricoDatabaseProvider(master as never, new LoggerService());

  const first = provider.anniStorici(1);
  const second = provider.anniStorici(1);

  expect(second[0]!.db).toBe(first[0]!.db);
  expect(second[0]!.logDocs).toBe(first[0]!.logDocs);
});

test('apre un anno non ancora visto quando la profondità cresce', () => {
  const master = {
    findAnniStorici: jest
      .fn()
      .mockReturnValueOnce([{ idSpreadsheet: 'ss1', annoScolasticoRaw: '2025-2026' }])
      .mockReturnValueOnce([
        { idSpreadsheet: 'ss1', annoScolasticoRaw: '2025-2026' },
        { idSpreadsheet: 'ss2', annoScolasticoRaw: '2024-2025' }
      ])
  };
  const provider = new MasterStoricoDatabaseProvider(master as never, new LoggerService());

  const shallow = provider.anniStorici(1);
  const deep = provider.anniStorici(2);

  expect(deep).toHaveLength(2);
  expect(deep[0]!.db).toBe(shallow[0]!.db);
});
```

This needs `DatabaseService` and `ServiceFactory` mocked — follow whatever the file already does for GAS-backed constructors; if it mocks nothing today, add `jest.mock` for the `DatabaseService` import at the top of the test file.

- [x] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "anno"`
Expected: FAIL — the two `db` instances differ.

- [x] **Step 3: Add the per-spreadsheet cache**

```typescript
export class MasterStoricoDatabaseProvider implements StoricoDatabaseProvider {
  /**
   * One `DatabaseService` per historical spreadsheet, for the lifetime of the
   * provider. Each construction costs a `spreadsheets.get` plus a
   * `values.batchGet` schema probe, and the six storico call sites re-enter
   * `anniStorici` several times per CDU build — that is what tripped the Sheets
   * "Read requests per minute per user" quota in the 2026-08-21 batch 3 run.
   */
  private readonly opened = new Map<string, AnnoStorico>();

  constructor(
    private readonly master: IMasterSheetRepository,
    private readonly logger: LoggerService
  ) {}

  anniStorici(profondita: number): AnnoStorico[] {
    if (profondita <= 0) return [];
    return this.master.findAnniStorici(profondita).map((config) => {
      const cached = this.opened.get(config.idSpreadsheet);
      if (cached !== undefined) return cached;
      const db = new SheetDbAdapter(
        new DatabaseService(
          config.idSpreadsheet,
          this.logger,
          ServiceFactory.getUtils(),
          ServiceFactory.getCacheService().getScriptCache(),
          null,
          { verifyTables: [TABLE.CLASSI, TABLE.LOG_DOCS] }
        )
      );
      const anno: AnnoStorico = {
        anno: config.annoScolasticoRaw,
        db,
        logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
      };
      this.opened.set(config.idSpreadsheet, anno);
      return anno;
    });
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts && npm test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/application/storico/StoricoDatabaseProvider.ts test/unit/application/storico-services.test.ts
git commit -m "fix: reuse historical databases across storico lookups"
```

---

### Task 6: Make the ASL fixture repair idempotent and order-proof

**Files:**

- Modify: `src/onlinetests/index.ts:463-570` (`migrateResolvedPersistedE2eFixture`) and `:75` (`REQUIRED_ONLINETEST_FIXTURE_VERSION`)
- Modify: `src/onlinetests/checks/importChecks.ts:60-176` (check registration order)
- Test: `test/unit/onlinetests/reset-e2e-history-tables.test.ts`, `test/unit/onlinetests/import-checks.test.ts`

**Interfaces:**

- Consumes: `FixtureSpreadsheetService.getRanges(spreadsheetId, range)` and `.deleteColumn(spreadsheetId, table, columnIndex)`.
- Produces: `PersistedE2eFixtureMigrationResult { previousVersion, version, insertedMaterie, deletedAslColumn }` — unchanged shape; `deletedAslColumn`/`insertedMaterie` now also report repairs done at the current version.

The ASL import sources legitimately carry a `DATA_MODIFICA` column (the ghost row is `['','','','2026-08-10T09:00:00Z']`), and `TransformerMappingEngine._applyMapping` (`vendor/gaslibs.Code.js:65644`) **passes unmapped source columns through**, so a mapping cannot drop it. The column must therefore be removed before each run, and the fallback check must run before the imports that recreate it.

- [x] **Step 1: Write the failing migration test**

In `test/unit/onlinetests/reset-e2e-history-tables.test.ts`:

```typescript
test('ripara ASL.DATA_MODIFICA anche quando la versione fixture è già quella richiesta', () => {
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA']);
  const properties = fakeProperties({ ALDO_ONLINETEST_FIXTURE_VERSION: '3' });

  const result = migratePersistedE2eFixture({ properties, spreadsheetService, ...deps });

  expect(result.deletedAslColumn).toBe(true);
  expect(spreadsheetService.deleteColumn).toHaveBeenCalledWith(expect.any(String), 'ASL', 4);
});

test('reinserisce le MATERIE canoniche mancanti alla versione corrente', () => {
  const properties = fakeProperties({ ALDO_ONLINETEST_FIXTURE_VERSION: '3' });

  const result = migratePersistedE2eFixture({
    properties,
    ...depsWithMaterieMissing('INTERPRET.FLAUTO')
  });

  expect(result.insertedMaterie).toEqual(['INTERPRET.FLAUTO']);
});
```

Adapt to the fakes already in that file (`physicalSpreadsheet`, the existing deps builder). Update the two existing tests that assert the current-version branch **throws** — they now assert a repair.

- [x] **Step 2: Run to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/reset-e2e-history-tables.test.ts`
Expected: FAIL — `ConfigurationError: Fixture E2E v3 non valida: ASL.DATA_MODIFICA è ancora presente.`

- [x] **Step 3: Turn the version gate into a repair**

In `migrateResolvedPersistedE2eFixture`, delete the whole `if (previousVersion === REQUIRED_ONLINETEST_FIXTURE_VERSION) { … }` early-return block, so the repair path (delete the stray column, insert the missing MATERIE rows, write the version) always runs. Keep the ambiguity guard (`initialMatches.length > 1` ⇒ throw) and the re-validation before `deleteColumn` untouched — they protect against deleting the wrong column. Update the function's doc comment:

```typescript
/**
 * Reconciles the versioned persisted E2E fixture through a temporary ALDO container.
 * The reconciliation is an idempotent repair, not a one-shot upgrade: the ASL imports
 * recreate `ASL.DATA_MODIFICA` on every run (the library passes unmapped source columns
 * through), so gating the repair on a version change left the fixture dirty for the next
 * run. It never purges append-only history; callers must reset ALDO and build their final
 * consumer container after this function returns.
 */
```

Bump `REQUIRED_ONLINETEST_FIXTURE_VERSION` to `3` (Task 4 changed the storico seed, so already-provisioned fixtures are stale).

- [x] **Step 4: Run to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/reset-e2e-history-tables.test.ts`
Expected: PASS

- [x] **Step 5: Write the failing ordering test**

In `test/unit/onlinetests/import-checks.test.ts`:

```typescript
test('registra il fallback TIMESTAMP prima degli import che scrivono DATA_MODIFICA su ASL', () => {
  const runner = new RecordingTestRunner();
  registerImportChecks(runner, container, sample, 'all');
  const names = runner.names;

  expect(
    names.indexOf('import.policy::TIMESTAMP degrada a OVERWRITE senza colonna target')
  ).toBeLessThan(names.indexOf('import.fileSingolo::OVERWRITE, intestazioni e riga ghost'));
});
```

- [x] **Step 6: Run to verify it fails, then reorder**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/import-checks.test.ts -t "prima degli import"`
Expected: FAIL

Move the `import.policy::TIMESTAMP degrada a OVERWRITE senza colonna target` block to the top of `registerImportChecks`, above the `OVERWRITE, intestazioni e riga ghost` block, and add above it:

```typescript
// Runs first on purpose: this check asserts the TARGET has no timestamp column, and
// every other ASL recipe imports a source that carries DATA_MODIFICA — unmapped source
// columns are passed straight through by the library, so any of them would materialise
// the column and break the precondition (2026-08-21 batch 3 failure).
```

Verify the sequencing still holds for the value assertions: the fallback import writes `ORE=999` for `e2ealunno43`, the OVERWRITE import that now follows resets it to 40, and the IGNORE check reads 40 before and after. Adjust the fallback's own `assertOre` only if the seeded starting value makes `inseriti + aggiornati !== 1`.

- [x] **Step 7: Run the full unit suite and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/onlinetests/index.ts src/onlinetests/checks/importChecks.ts test/unit/onlinetests/reset-e2e-history-tables.test.ts test/unit/onlinetests/import-checks.test.ts
git commit -m "fix: repair the ASL fixture header on every online run"
```

---

### Task 7: Scope the DOCUMENTO_DOCENTE_MATERIA batch to the dotted class

**Files:**

- Modify: `src/onlinetests/data/SharedTestDatabaseBuilder.ts:1112-1133` (`CONF_DOC_DOCENTE_MATERIA`)
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`, `test/unit/onlinetests/articolazione-checks.test.ts`

**Interfaces:**

- Consumes: `CONF_DOC.CONDIZIONE` — evaluated by `AnalyzeContextStep` through `GasExpressionEngineLib`; syntax `"{{path}} == 'literal'"` (see `test/fixtures/tables.ts:220`).
- Produces: unchanged `CONF_DOC_DOCENTE_MATERIA = 'E2E_DOC_DOCENTE_MATERIA'` config, now generating documents only for `CLASSE_A`.

The batch axis (`DocumentBatchService.generateDocentiMateria`) enumerates every (classe, docente, materia) triple of every active class — 108 targets, ~14 s each. The assertion only needs the `INTERPRET.CHITARRA` row for `e2edocente5` on `CLASSE_A`. `CONDIZIONE` still assembles a CDU per target (~50 ms) but skips clone/render, taking the test from ~26 min to well under one.

- [x] **Step 1: Write the failing fixture test**

In `test/unit/onlinetests/e2e-sample-database-builder.test.ts`:

```typescript
test('il CONF_DOC docente/materia genera solo per la classe con la cattedra puntata', () => {
  const conf = seededConfDoc(CONF_DOC_DOCENTE_MATERIA);
  expect(conf[COL_CONF_DOC.CONDIZIONE]).toBe(`{{focus.classe.anagrafica.nome}} == '${CLASSE_A}'`);
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "cattedra puntata"`
Expected: FAIL — received `''`.

- [x] **Step 3: Set the condition**

```typescript
      // The batch axis is (docente, materia) over EVERY active class: unscoped this
      // produced 108 documents (~26 min) and killed batch 2 on the GAS execution limit
      // (2026-08-21). The assertion only needs the INTERPRET.CHITARRA composite row on
      // CLASSE_A, so the other classes are gated out at AnalyzeContext.
      [COL_CONF_DOC.CONDIZIONE]: `{{focus.classe.anagrafica.nome}} == '${CLASSE_A}'`,
```

- [x] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/articolazione-checks.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/onlinetests/data/SharedTestDatabaseBuilder.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "fix: scope the docente-materia E2E batch to the dotted class"
```

---

### Task 8: Fail fast when batch 2 runs without batch 1's artifacts

**Files:**

- Modify: `src/onlinetests/checks/emailChecks.ts` (top of `registerEmailChecks`)
- Modify: `src/onlinetests/index.ts` (doc comment on `resetE2eHistoryTables`)
- Test: `test/unit/onlinetests/emailChecks.test.ts`

**Interfaces:**

- Consumes: `TABLE.LOG_DOCS`, `COL_LOG_DOCS.ID_GEN`, `CONF_DOC_VERBALE`.
- Produces: a new first check `email.prerequisiti::documenti di batch 1 presenti` registered by `registerEmailChecks`.

`E2E_MAIL_VERBALE`'s `BOX_CFG` is `[{TIPO_BOX:'documenti', FILTRO_TIPO:'VERBALE'}, {TIPO_BOX:'cartelle'}]`. With LOG_DOCS purged, `RenderBoxes` logged `Boxes: 0`, `RenderBoxesStep` set `shouldSend=false`, and all five remaining steps skipped — surfacing as `nessuna riga LOG_MAIL testMode registrata`, which points at the mail layer instead of at the missing prerequisite.

- [x] **Step 1: Write the failing test**

In `test/unit/onlinetests/emailChecks.test.ts`:

```typescript
test('fallisce subito con un messaggio esplicito se mancano i documenti di batch 1', () => {
  const runner = new RecordingTestRunner();
  registerEmailChecks(runner, containerWithEmptyLogDocs, sample, 'tester@x.it');

  expect(runner.names[0]).toBe('email.prerequisiti::documenti di batch 1 presenti');
  expect(() => runner.run(0)).toThrow(
    /Batch 1 non eseguito su questa fixture.*resetE2eHistoryTables/
  );
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/emailChecks.test.ts -t "batch 1"`
Expected: FAIL

- [x] **Step 3: Add the prerequisite check**

As the first `runner.add` of `registerEmailChecks`:

```typescript
runner.add(
  groupName('email.prerequisiti', 'documenti di batch 1 presenti'),
  sample.sampleSpreadsheetUrl,
  () => {
    const verbali = db
      .table(TABLE.LOG_DOCS)
      .findAll()
      .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_VERBALE);
    if (verbali.length === 0) {
      throw new ValidationError(
        'Batch 1 non eseguito su questa fixture: LOG_DOCS non contiene documenti ' +
          `${CONF_DOC_VERBALE}, quindi il box "documenti" di ogni CONF_MAIL resta vuoto e ` +
          'ogni invio viene saltato. Esegui resetE2eHistoryTables PRIMA di batch 1, poi ' +
          'batch 1, poi batch 2.'
      );
    }
  }
);
```

In `src/onlinetests/index.ts`, strengthen the `resetE2eHistoryTables` doc comment:

```typescript
/**
 * Explicit pre-Batch-1 launcher: migrates the persisted fixture, rebuilds the final container,
 * then deletes every append-only row from `LOG_MAIL`/`LOG_DOCS`. No other table is purged.
 *
 * ORDER MATTERS. Run it BEFORE batch 1 and never between batches: batches 2–4 consume the
 * LOG_DOCS/LOG_FOLD artifacts batch 1 produces (the `documenti`/`cartelle` boxes of every
 * CONF_MAIL read them). Running it after batch 1 makes every email skip with zero boxes.
 */
```

- [x] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/emailChecks.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/onlinetests/checks/emailChecks.ts src/onlinetests/index.ts test/unit/onlinetests/emailChecks.test.ts
git commit -m "fix: fail fast when email batch runs without batch 1 documents"
```

---

### Task 9: Skip protected ranges for synthetic principals

**Files:**

- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Test: `test/unit/application/generator-strategies.test.ts`, `test/unit/onlinetests/protected-range-outcome.test.ts`

**Interfaces:**

- Consumes: `classifySyntheticProtectedRangeOutcome(testMode, ranges, expectedEditors)` from `src/onlinetests/checks/protectedRangeOutcome.ts` — its `SYNTHETIC_DOMAIN = '@onlinetest.aldo.local'` constant defines what "synthetic" means; export it and reuse it, do not duplicate the literal.
- Produces: unchanged strategy API; a protection whose entire editor list is synthetic is logged once as skipped instead of attempted.

58 rejected `addProtectedRange` calls × 3 attempts with backoff cost ~90 s per suite and 174 log lines. `classifySyntheticProtectedRangeOutcome` already tells the checks this is an accepted limitation; the strategy should stop paying for it.

- [x] **Step 1: Write the failing test**

```typescript
test('non tenta la protezione quando ogni editor è un principal sintetico', () => {
  const sheets = new FakeSheetService();
  const strategy = buildSheetMateriePermessiStrategy(sheets);

  strategy.render('sheet1', cduWithEditors(['e2edocente1@onlinetest.aldo.local']));

  expect(sheets.addProtectedRangeCalls).toHaveLength(0);
  expect(sheets.warnings).toContainEqual(expect.stringMatching(/principal sintetici/));
});

test('protegge normalmente quando almeno un editor è reale', () => {
  const sheets = new FakeSheetService();
  const strategy = buildSheetMateriePermessiStrategy(sheets);

  strategy.render('sheet1', cduWithEditors(['vero@pietroaldi.com']));

  expect(sheets.addProtectedRangeCalls).toHaveLength(1);
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/generator-strategies.test.ts -t "sintetic"`
Expected: FAIL — one `addProtectedRange` call recorded.

- [x] **Step 3: Short-circuit the synthetic case**

At the point where the strategy applies one column's protection, before the API call:

```typescript
// Sheets rejects every @onlinetest.aldo.local principal with "Utente non valido",
// and GasResilienceLib retries three times with backoff before giving up: 58 doomed
// calls and ~90 s per suite in the 2026-08-21 run. Skip them, log once, keep every
// real principal strict.
if (editors.length > 0 && editors.every(isSyntheticPrincipal)) {
  this.logger.warn(
    `${label}: protezione ${range} saltata — solo principal sintetici (${SYNTHETIC_DOMAIN})`
  );
  continue;
}
```

Read the strategy first: if the protection call lives behind a helper, put the guard in the helper so both the column and sheet-level paths get it. Export `SYNTHETIC_DOMAIN` and an `isSyntheticPrincipal(email)` predicate from `src/onlinetests/checks/protectedRangeOutcome.ts` — **stop and ask the user** if that import direction (production code importing from `src/onlinetests`) is unacceptable; the alternative is a small shared module under `src/config/`.

- [x] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/generator-strategies.test.ts test/unit/onlinetests/protected-range-outcome.test.ts && npm test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts src/onlinetests/checks/protectedRangeOutcome.ts test/
git commit -m "fix: skip protected ranges whose principals are all synthetic"
```

---

### Task 10: Rebuild, re-push and re-run the four batches

**Files:**

- No source changes. Produces `dist/Code.js`, `dist/OnlineTests.js`, `dist/EntryPoints.js`, `gas-source-map.json`.

- [x] **Step 1: Full offline gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
Expected: all green. Do not proceed on any failure.

- [ ] **Step 2: Build and push the online bundle**

Run: `npm run push:online`
Expected: the offline suite runs as the push gate, then `clasp push` succeeds.

- [ ] **Step 3: Hand the run protocol to the user**

Tasks 4, 6 and 7 change seeded fixture data, and Task 6 bumps the fixture version to 3. Ask the user to run, in this exact order:

1. the **test database + template generation** entry point (full re-provisioning — the storico MATERIE rows and the docente/materia CONDIZIONE only exist in a freshly seeded fixture);
2. `resetE2eHistoryTables` — **before** batch 1, never between batches;
3. `runOnlineTestsBatch1`;
4. `runOnlineTestsBatch2`;
5. `runOnlineTestsBatch3`;
6. `runOnlineTestsBatch4`.

- [ ] **Step 4: Verify against the expected deltas**

For each pasted log, confirm:

- batch 1: 25/25, no `Cartella verbale` and no `Tabelle importate` failure;
- batch 2: completes inside the limit, 0 failures, the `DOCUMENTO_DOCENTE_MATERIA` batch processes only `CLASSE_A` targets;
- batch 3: 27/27, no `INTERPRET.FLAUTO`, no `DATA_MODIFICA`, no `Quota exceeded`;
- batch 4: 36/36 including the new `monitor.telemetria` probe;
- `Step not found` count: report the number and follow Task 2 Step 7's decision fork if it is still non-zero.

---

## Self-review

**Failure coverage:** batch 1 F1 → Task 1; batch 1 F2 → Task 3; batch 2 timeout → Task 7; batch 2 F1–F3 → Task 8 (procedural, message fixed); batch 3 F1 → Task 6; batch 3 F2/F3/F6/F7/F8 → Task 4; batch 3 F4/F5 → Task 5; log noise/runtime → Tasks 2 and 9. No observed failure is unaddressed.

**Open decision points (do not resolve unilaterally):** Task 2 Step 7 (possible `GasProcessMonitorLib` change), Task 3 Step 7 (`insertTableAtMarker` flush + native `{{table[...]}}` directive in `WorkspaceTemplateEngine`), Task 9 Step 3 (import direction for `SYNTHETIC_DOMAIN`). All three are `GasLibraryFactory`/architecture calls that CLAUDE.md reserves for the user.

**Type consistency:** `IProcessMonitor.getJobState` (Task 2) is the only new port method and is added to the interface, the facade and every test double in the same task. `IDocumentTableFacade.flush` (Task 3) is added to the interface, the real facade and the strategy's structural type in the same task. `AnnoStorico` (Task 5) keeps its `{ anno, db, logDocs }` shape.
