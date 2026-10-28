# GLF Reuse Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the real, verified gaps found in `001_REPORT_USE_GLF_VERIFIED.md` and `000_estrazioni_to_glf.md` — quota-aware email batching, a wired-up email retry path, import job monitoring, a resumable/chunked `GasDataImporter` API, and two small ALDO→GLF code extractions — without reimplementing anything `GasLibraryFactory` already provides.

**Architecture:** Tasks 1–3 are ALDO-only wiring against GLF capabilities that already exist (`MailService.getQuotaUsage()`, `GasProcessMonitorLib` via `ImportEngine`'s existing `jobId`/`monitor` support). Tasks 4–5 add a new incremental extract/load API to `GasDataImporter` (GLF, its own repo/tests) and then consume it from ALDO. Tasks 6–7 extract two ALDO-local pieces of dependency-free logic into `CoreUtilsLib`/`RoleResolutionLib`. Task 8 is a cosmetic type-alignment cleanup.

**Tech Stack:** TypeScript (ALDO, Jest/ts-jest), JavaScript ESM (GasLibraryFactory, Jest), Google Apps Script V8 runtime.

## Global Constraints

- GAS V8 target: synchronous code only, no Node-specific APIs, in both repos.
- ALDO must never call native GAS globals directly — only through `GoogleApiWrapper`/facades. Task 1 adds one new facade method; no new native-global usage.
- `GasLibraryFactory` changes (Tasks 4, 6, 7) must not introduce circular dependencies across its L0→L4 layers, and must ship with their own docs (`DOCS_LIBS/*.md`) + unit tests, since ALDO's `CLAUDE.md` mandates `GasLibraryFactory` stays the reusable source of truth.
- After any `GasLibraryFactory` change, ALDO must run `npm run refresh:vendor` then `npm run verify:vendor` before ALDO-side tests can see it.
- Every ALDO task ends green on: `npm run typecheck`, `npm run lint`, `npm test` (plus `npm run test:integration` where noted).
- Every `GasLibraryFactory` task ends green on its own `npm test` (4,306 tests at the time this plan was written; 8,359 as of this plan's completion — must stay 100% passing).
- Do not edit `dist/*` or `vendor/gaslibs.Code.js` directly in either repo — those are generated.

## Verification notes (why each task is/ isn't in this plan)

Both source reports were checked against the current codebase (grep + reading vendor bundle + GLF source + `DOCS_LIBS`) before being turned into tasks below. Two corrections from that check:

- **000's "Specs pushdown" framing is wrong.** The report claims `isSatisfiedBy`/`toQueryObject` are never invoked polymorphically and pushdown is unwired. In fact GLF's own `DomainRepositoryLib.Repository.find(specification)` (`GasLibraryFactory` vendor bundle, class `Repository`) already calls `queryTranslator.translate(specification, query)` with an `isSatisfiedBy` in-memory fallback, and 20+ ALDO call sites (`ClasseRepository.ts`, `AlunnoRepository.ts`, `CarenzaRepository.ts`, etc.) already call `this.find(new XxxSpec())`. Pushdown is wired. Task 8 below is only the leftover cosmetic item (ALDO's local `Specification` interface duplicates GLF's contract) — no behavior task was created for "wiring pushdown" because it isn't broken.
- **001's "coarse import monitoring" undersells what's already in GLF.** `GasDataImporter`'s `ImportPipelineExecutor._executePipeline` already calls `monitor.registerJob/startJob/logStepStart/logStepComplete/updateProgress/completeJob/setError` whenever `ImportEngine` was constructed with a `monitor` and `runImport(recipe, { jobId })` is given a `jobId`. ALDO's `Bootstrap.ts` constructs `ImportEngine` without a monitor, and `ImportService.executeImport` never passes `jobId`. Task 3 below is pure wiring — no GLF change — and gets full extract/transform/load step-level progress for free, not just "coarse" start/complete.

Everything else in this plan was confirmed against real files (cited per task).

---

### Task 1: Quota-aware email batching

**Files:**

- Modify: `src/infrastructure/facades/GmailServiceFacade.ts`
- Modify: `src/application/services/EmailBatchService.ts`
- Modify: `src/config/Bootstrap.ts` (only if wiring needs it — see Step 6)
- Test: `test/unit/application/email-batch-service.test.ts`
- Test fake: `test/fakes/FakeGmailFacade.ts`

**Verified:** `GoogleApiWrapper/src/services/MailService.js:42` already has `getQuotaUsage()` → `MailApp.getRemainingDailyQuota()`. `GmailServiceFacade.ts` (read in full) has no quota method. `EmailBatchService.ts` chunks by a fixed `EMAIL_CHUNK_SIZE = 100` regardless of actual remaining quota — a large pattern's checkpoint can attempt to send more than the daily quota allows and fail mid-chunk.

**Interfaces:**

- Consumes: `MailService.getQuotaUsage(): number` (GLF, already exists, no GLF change).
- Produces: `IGmailFacade.getRemainingQuota(): number`; `EmailBatchService.batchSendHandler` now caps each chunk to `min(chunkSize, remainingQuota)` and stops cleanly (no resume-trigger churn) when quota is 0.

- [ ] **Step 1: Write the failing test — quota caps chunk size**

Add to `test/fakes/FakeGmailFacade.ts`:

```ts
export class FakeGmailFacade implements IGmailFacade {
  public readonly sent: EmailSendOptions[] = [];
  public readonly failFor = new Set<string>();
  public remainingQuota = 1000;

  sendEmail(opts: EmailSendOptions): EmailSendResult {
    const broken = opts.to.find((e) => this.failFor.has(e));
    if (broken !== undefined) {
      return { success: false, error: `simulated failure for ${broken}` };
    }
    this.sent.push(opts);
    return { success: true };
  }

  getRemainingQuota(): number {
    return this.remainingQuota;
  }
}
```

Add to `test/unit/application/email-batch-service.test.ts`:

```ts
test('caps a chunk to remaining Gmail quota, not just chunkSize (11 §14)', () => {
  const { gmail, service } = wire();
  gmail.remainingQuota = 1;
  // CDC_OTTOBRE enumerates 2 targets; chunkSize 2 but quota only allows 1.
  const { checkpoints, result } = drain(
    service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 2, resumeState: null })
  );
  expect(gmail.sent).toHaveLength(1);
  expect(checkpoints[0]!.nextIndex).toBe(1);
  expect(result.success).toBe(false); // stopped short of full quota
});

test('zero remaining quota suspends cleanly without sending (no resume-trigger churn)', () => {
  const { gmail, service } = wire();
  gmail.remainingQuota = 0;
  const { checkpoints, result } = drain(
    service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 2, resumeState: null })
  );
  expect(gmail.sent).toHaveLength(0);
  expect(checkpoints).toHaveLength(1);
  expect(checkpoints[0]!.errors).toContain(
    'quota Gmail esaurita — sospeso, richiede riavvio esplicito'
  );
  expect(result.errors).toContain('quota Gmail esaurita — sospeso, richiede riavvio esplicito');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/email-batch-service.test.ts -v`
Expected: FAIL — `gmail.getRemainingQuota is not a function` / quota not applied.

- [ ] **Step 3: Add `getRemainingQuota` to `IGmailFacade` + `GmailServiceFacade`**

In `src/infrastructure/facades/GmailServiceFacade.ts`, add to the interface and implementation:

```ts
export interface IGmailFacade {
  sendEmail(opts: EmailSendOptions): EmailSendResult;
  getRemainingQuota(): number;
}

export class GmailServiceFacade implements IGmailFacade {
  constructor(private readonly mail: MailService) {}

  getRemainingQuota(): number {
    return this.mail.getQuotaUsage();
  }

  sendEmail(opts: EmailSendOptions): EmailSendResult {
    // ...unchanged...
  }
}
```

- [ ] **Step 4: Thread the quota check into `EmailBatchService.batchSendHandler`**

`EmailBatchService` currently only has `EmailNotificationService`, which doesn't expose `IGmailFacade`. Add a constructor param for the gmail facade (`EmailNotificationService` already has one internally — check `src/application/services/EmailNotificationService.ts` for its existing `gmail` field name before wiring; if it already stores an `IGmailFacade`, add a `getGmailFacade(): IGmailFacade` accessor there instead of duplicating the dependency). Then in `src/application/services/EmailBatchService.ts`:

```ts
export class EmailBatchService {
  constructor(
    private readonly email: EmailNotificationService,
    private readonly monitor?: IProcessMonitor
  ) {}

  *batchSendHandler(
    params: JobHandlerParams & { patternId?: string; chunkSize?: number; jobId?: string }
  ): Generator<EmailBatchCheckpoint, EmailBatchResult, void> {
    const patternId = String(params.patternId ?? '');
    const jobId = String(params.jobId ?? patternId);
    const chunkSize = Number(params.chunkSize ?? EMAIL_CHUNK_SIZE);
    const resume = (params.resumeState ?? null) as EmailBatchResumeState | null;
    const targets = this.email.enumerateTargets(this.email.getConfigurazione(patternId));

    const processed = resume === null ? [] : resume.processed.slice();
    const errors = resume === null ? [] : resume.errors.slice();
    let sent = resume?.sent ?? 0;
    let i = resume?.nextIndex ?? 0;

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }

    while (i < targets.length) {
      const remainingQuota = this.email.getGmailFacade().getRemainingQuota();
      if (remainingQuota <= 0) {
        errors.push('quota Gmail esaurita — sospeso, richiede riavvio esplicito');
        this.monitor?.completeJob(jobId, `${sent} email inviate, sospeso per quota esaurita`);
        yield {
          percentage: (i / targets.length) * 100,
          nextIndex: i,
          processed: processed.slice(),
          sent,
          errors: errors.slice()
        };
        return { success: false, totale: targets.length, processed, sent, errors };
      }
      const effectiveChunk = Math.min(chunkSize, remainingQuota);
      const fine = Math.min(i + effectiveChunk, targets.length);
      for (; i < fine; i++) {
        const target = targets[i]!;
        const esito = this.email.sendToTarget(patternId, target, jobId);
        sent += esito.sent;
        errors.push(...esito.errors);
        processed.push(target.target);
      }
      const percentage = (i / targets.length) * 100;
      this.monitor?.updateProgress(
        jobId,
        percentage,
        `${processed.length}/${targets.length} destinatari elaborati`
      );
      yield {
        percentage,
        nextIndex: i,
        processed: processed.slice(),
        sent,
        errors: errors.slice()
      };
    }

    const success = errors.length === 0;
    this.monitor?.completeJob(jobId, `${sent} email inviate, ${errors.length} errori`);
    return { success, totale: targets.length, processed, sent, errors };
  }
  // registerJobHandlers / start unchanged
}
```

Note: do NOT call `this.monitor?.registerJob`/`startJob` again on a quota-suspend — that branch only runs mid-loop, after the initial `resume === null` block already ran once for this job.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/email-batch-service.test.ts -v`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green. If `EmailNotificationService` didn't already expose a gmail accessor, also update `test/unit/application/email-notification-service.test.ts` if it constructs the service directly with mocked collaborators (check whether adding `getGmailFacade()` breaks any existing mock-based test there).

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/facades/GmailServiceFacade.ts src/application/services/EmailBatchService.ts src/application/services/EmailNotificationService.ts test/fakes/FakeGmailFacade.ts test/unit/application/email-batch-service.test.ts
git commit -m "feat: cap email batch chunks to remaining Gmail quota"
```

---

### Task 2: Wire `EmailRetryService` into `JobRunnerLib`

**Files:**

- Modify: `src/application/services/EmailRetryService.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `src/index.ts`
- Modify: `src/entrypoints/EntryPoints.ts`
- Test: `test/unit/application/email-retry-service.test.ts`
- Test: `test/unit/config/bootstrap.test.ts`

**Verified:** `EmailRetryService.retryFailed()` (`src/application/services/EmailRetryService.ts:41`) is registered in `Bootstrap.ts:266-275` but has zero callers in `src/index.ts` or `src/entrypoints/EntryPoints.ts` — confirmed by grep, no hits. It runs synchronously today (no generator, no `JobRunnerService`), so a pattern with many failed/grouped emails has no execution-window protection.

**Interfaces:**

- Consumes: `EmailRetryService.retryFailed(): RetryResult` (existing, unchanged signature — becomes the per-chunk unit of work).
- Produces: `EmailRetryService.retryHandler(params): Generator<RetryCheckpoint, RetryResult, void>`; `JOB_TYPE_RETRY_EMAIL` constant; `menu_avvioRetryEmail()` global in `EntryPoints.ts`/`index.ts` following the exact pattern `menu_avvioComunicazioniEmail` already uses.

- [ ] **Step 1: Write the failing test — generator checkpoints one group at a time**

Read `test/unit/application/email-retry-service.test.ts` first to match its existing `wire()` helper style, then add:

```ts
test('retryHandler yields one checkpoint per failed-group batch and resumes from checkpoint', () => {
  const { service } = wire(/* however the existing tests construct EmailRetryService */);
  const gen = service.retryHandler({ resumeState: null, jobId: 'job_retry_1' });
  const first = gen.next();
  expect(first.done).toBe(false);
  expect(first.value).toMatchObject({ groupIndex: 1 });
  let step = first;
  while (!step.done) step = gen.next();
  expect(step.value.retried + step.value.permanent).toBeGreaterThan(0);
});

test('registerJobHandlers registers under JOB_TYPE_RETRY_EMAIL', () => {
  const { service } = wire();
  const registered: string[] = [];
  const queue = {
    registerJobHandler: (type: string) => registered.push(type)
  } as unknown as JobQueueLike;
  service.registerJobHandlers(queue);
  expect(registered).toEqual([JOB_TYPE_RETRY_EMAIL]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-retry-service.test.ts -v`
Expected: FAIL — `retryHandler` not defined.

- [ ] **Step 3: Convert `retryFailed()` into a generator, one group per yield**

In `src/application/services/EmailRetryService.ts`, keep `retryFailed()` for any direct callers (existing tests likely use it), and add a generator built on the same grouping logic factored into a private helper:

```ts
export const JOB_TYPE_RETRY_EMAIL = 'RETRY_EMAIL_BATCH';

export interface RetryCheckpoint extends RetryResult {
  groupIndex: number;
  totalGroups: number;
}

export class EmailRetryService {
  // ...existing fields/constructor unchanged...

  retryFailed(): RetryResult {
    // unchanged — delegates to the same grouping this generator uses
    const groups = this.groupFailed();
    let result: RetryResult = { retried: 0, permanent: 0 };
    for (const group of groups) result = this.mergeResult(result, this.processGroup(group));
    return result;
  }

  *retryHandler(
    params: JobHandlerParams & { jobId?: string }
  ): Generator<RetryCheckpoint, RetryResult, void> {
    const jobId = String(params.jobId ?? 'retry_email');
    const resume = (params.resumeState ?? null) as { groupIndex: number } | null;
    const groups = this.groupFailed();
    if (resume === null)
      this.logger.info(`EmailRetry: avviato job ${jobId}, ${groups.length} gruppi`);

    let result: RetryResult = { retried: 0, permanent: 0 };
    const startIndex = resume?.groupIndex ?? 0;
    for (let i = startIndex; i < groups.length; i++) {
      result = this.mergeResult(result, this.processGroup(groups[i]!));
      yield { ...result, groupIndex: i + 1, totalGroups: groups.length };
    }
    return result;
  }

  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_RETRY_EMAIL, (params) => this.retryHandler(params));
  }

  start(runner: JobRunnerService, jobName: string, forceRestart = false): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_RETRY_EMAIL,
      { jobId: jobName },
      (queue) => this.registerJobHandlers(queue),
      forceRestart
    );
  }

  private groupFailed(): LogEmail[][] {
    const groups = new Map<string, LogEmail[]>();
    for (const failed of this.logMail.findFailed()) {
      const logicalTargetId = this.logicalTargetId(failed);
      const key = `${failed.pattern}::${logicalTargetId ?? failed.destinatariRaw}`;
      const group = groups.get(key) ?? [];
      group.push(failed);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  private mergeResult(a: RetryResult, b: RetryResult): RetryResult {
    return { retried: a.retried + b.retried, permanent: a.permanent + b.permanent };
  }

  private processGroup(group: LogEmail[]): RetryResult {
    const first = group[0]!;
    if (group.length >= this.maxTentativi) {
      this.registraPermanente(first, group.length);
      return { retried: 0, permanent: 1 };
    }
    const logicalTargetId = this.logicalTargetId(first);
    const run = this.emailService.sendPattern(
      first.pattern,
      logicalTargetId === null
        ? { onlyRecipients: first.getDestinatari() }
        : { onlyTargetIds: [logicalTargetId] }
    );
    if (run.sent > 0 && run.errors.length === 0) {
      for (const record of group) this.logMail.marcaSuccesso(record);
      return { retried: 1, permanent: 0 };
    }
    this.logger.warn(
      PiiRedactor.redact(
        `EmailRetry: nuovo tentativo fallito per ${first.pattern} → ${first.destinatariRaw} (${run.errors.join('; ')})`
      )
    );
    return { retried: 0, permanent: 0 };
  }

  // logicalTargetId / registraPermanente unchanged
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-retry-service.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Register the retry job handler and add a launcher**

In `src/config/Bootstrap.ts`, alongside the existing `documenti.registerJobHandlers(queue)` / `email.registerJobHandlers(queue)` lines (`Bootstrap.ts:339-340`), add `retry.registerJobHandlers(queue)`, and add a data-driven launcher next to `avviaInvioNotificheDataDriven`:

```ts
/** Data-driven launcher (15 §4): scheduled retry of failed LOG_MAIL sends (11 §16). */
export function avviaRetryEmailDataDriven(c: ServiceContainer, runner: JobRunnerService): unknown {
  return c.get<EmailRetryService>('emailRetryService').start(runner, 'retry_email');
}
```

In `src/index.ts`, following the existing `menu_avvioComunicazioniEmail`/`resumeJob` pattern:

```ts
export function menu_avvioRetryEmail(): void {
  const c = initAldo();
  avviaRetryEmailDataDriven(c, creaJobRunner());
}
(globalThis as any).menu_avvioRetryEmail = menu_avvioRetryEmail;
```

In `src/entrypoints/EntryPoints.ts`, next to `menu_avvioComunicazioniEmail`:

```ts
function menu_avvioRetryEmail(): void {
  (globalThis as any).menu_avvioRetryEmail();
}
(globalThis as any).menu_avvioRetryEmail = menu_avvioRetryEmail;
```

(Match whichever exact delegation style `EntryPoints.ts` already uses for its other `menu_*` wrappers — read the file first; some wrap directly, some just re-export.)

- [ ] **Step 6: Update `bootstrap.test.ts` for the new registration**

Read `test/unit/config/bootstrap.test.ts` to find how it asserts job-handler registration for `documenti`/`email`, and add the equivalent assertion for `retry.registerJobHandlers`.

- [ ] **Step 7: Run full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/application/services/EmailRetryService.ts src/config/Bootstrap.ts src/index.ts src/entrypoints/EntryPoints.ts test/unit/application/email-retry-service.test.ts test/unit/config/bootstrap.test.ts
git commit -m "feat: run EmailRetryService through JobRunnerLib with a real launcher"
```

(Menu entry in `src/presentation/Menu.ts` is optional per the report — add it only if operators are expected to trigger retry manually; otherwise a time-driven trigger calling `menu_avvioRetryEmail` is enough. Default to NOT adding a menu entry unless asked, since retry is meant to run unattended.)

---

### Task 3: Wire `ImportService` to `GasProcessMonitorLib` (no GLF change)

**Files:**

- Modify: `src/application/services/ImportService.ts`
- Modify: `src/config/Bootstrap.ts`
- Test: `test/unit/application/import-service.test.ts`

**Verified:** `Bootstrap.ts:390-395` constructs `new ImportEngine(logger, driveService, spreadsheetService, db.getDatabaseService())` — 4 args, no `monitor` (5th arg is `expressionEngine`, 7th is `monitor`). `ImportService.executeImport` calls `this.engine.runImport(recipe, { postTransform })` — no `jobId`. But `GasDataImporter/src/pipeline/ImportPipelineExecutor.js:68-129` (`_executePipeline`) already drives `monitor.registerJob/startJob/logStepStart('Extract'|'Transform'|'Load')/logStepComplete/updateProgress(5|33|40|66|70|100)/completeJob/setError` whenever both are present. `Menu.ts:76` already expects `imp_<configId>` monitor jobs to exist for its sidebar. This is pure wiring on the ALDO side.

**Interfaces:**

- Consumes: `ImportEngine` constructor's existing 7th positional `monitor` param; `runImport(recipe, { postTransform, jobId })`'s existing `jobId` option — both already implemented in GLF, confirmed above.
- Produces: `ImportService` constructor gains an optional `monitor?: IProcessMonitor` param; `executeImport` now passes `jobId: 'imp_' + configId`.

- [ ] **Step 1: Write the failing test — monitor receives job lifecycle calls**

Add to `test/unit/application/import-service.test.ts`, using the existing `fakeEngine` helper (extend it to accept and forward a `jobId`/call the monitor the way the real engine does — since `fakeEngine` is a hand-rolled double standing in for `ImportEngine.runImport`, the test should assert `ImportService` _passes_ `jobId` to `runImport`, not that GLF's internal monitor calls happen — that's GLF's own test suite's job):

```ts
test('executeImport passes a stable imp_<configId> jobId to runImport (15 §9)', () => {
  const database = db([confImpRow()]);
  let capturedOptions: { jobId?: string } | undefined;
  const engine = {
    runImport: (recipe: ImportRecipe, options: { jobId?: string }) => {
      capturedOptions = options;
      return {
        success: true,
        importName: recipe.name,
        durationMs: 0,
        extract: { rowsExtracted: 0, rowCount: 0 },
        transform: { rowsTransformed: 0, recordsProcessed: 0 },
        load: {
          inserted: 0,
          updated: 0,
          skipped: 0,
          deleted: 0,
          total: 0,
          recordsProcessed: 0,
          failed: 0
        }
      };
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  service.executeImport('IMPORT_ALUNNI');

  expect(capturedOptions?.jobId).toBe('imp_IMPORT_ALUNNI');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/import-service.test.ts -v`
Expected: FAIL — `capturedOptions?.jobId` is `undefined`.

- [ ] **Step 3: Pass `jobId` from `ImportService.executeImport`**

In `src/application/services/ImportService.ts`, change the `runImport` call:

```ts
const result = this.engine.runImport(recipe, {
  jobId: `imp_${configId}`,
  postTransform: (mapped, configuration) => {
    // ...unchanged...
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/import-service.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Wire the real monitor into `ImportEngine`'s construction**

In `src/config/Bootstrap.ts`, the `importEngine` construction currently reads:

```ts
const importEngine = new ImportEngine(
  logger,
  driveService,
  spreadsheetService,
  db.getDatabaseService()
);
```

`ImportEngine`'s constructor signature (`GasDataImporter/src/ImportEngine.js:30-38`) is `(logger, driveService, spreadsheetService, databaseService, expressionEngine = null, exceptionService = null, monitor = null)`. Check what `deps.monitor` resolves to elsewhere in this file (it's already used for `emailBatchService`/`documentBatchService` — same `deps.monitor`), and pass it through positionally:

```ts
const importEngine = new ImportEngine(
  logger,
  driveService,
  spreadsheetService,
  db.getDatabaseService(),
  null, // expressionEngine — GasDataImporter's calculated-field feature, unused by ALDO's current CONF_IMP recipes
  null, // exceptionService — ALDO doesn't inject GasResilienceLib retry here today; out of scope for this task
  deps.monitor ?? null
);
```

- [ ] **Step 6: Update `bootstrap.test.ts` for the new constructor arg**

Read `test/unit/config/bootstrap.test.ts`'s existing assertions around `importEngine` construction (if any spy/mock checks the constructor call args) and extend them to include the monitor argument.

- [ ] **Step 7: Run full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: all green. If any integration test exercises `avviaImportazioneDataDriven` end-to-end with a `FakeProcessMonitor`, confirm it now sees `registerJob('imp_<id>')`/`completeJob('imp_<id>', ...)` calls.

- [ ] **Step 8: Commit**

```bash
git add src/application/services/ImportService.ts src/config/Bootstrap.ts test/unit/application/import-service.test.ts test/unit/config/bootstrap.test.ts
git commit -m "feat: surface import job progress on the GasProcessMonitorLib dashboard"
```

---

### Task 4: `GasDataImporter` — incremental checkpoint API (GLF change)

**Repo:** `GasLibraryFactory/` (separate git repo, own `npm test`/`npm run lint`).

**Files:**

- Create: `GasLibraryFactory/GasDataImporter/src/ImportCheckpoint.js`
- Modify: `GasLibraryFactory/GasDataImporter/src/internal/extract-strategies/SourceStrategy.js`
- Modify: `GasLibraryFactory/GasDataImporter/src/internal/extract-strategies/SheetByIdStrategy.js`
- Modify: `GasLibraryFactory/GasDataImporter/src/internal/load/Loader.js`
- Modify: `GasLibraryFactory/GasDataImporter/src/pipeline/ImportPipelineExecutor.js`
- Modify: `GasLibraryFactory/GasDataImporter/src/ImportEngine.js`
- Modify: `GasLibraryFactory/GasDataImporter/index.js` (export list)
- Modify: `GasLibraryFactory/DOCS_LIBS/GasDataImporter.md`
- Test: `GasLibraryFactory/GasDataImporter/src/__tests__/ImportCheckpoint.test.js`
- Test: `GasLibraryFactory/GasDataImporter/src/internal/extract-strategies/__tests__/SheetByIdStrategy.test.js`
- Test: `GasLibraryFactory/GasDataImporter/src/internal/load/__tests__/Loader.test.js`
- Test: `GasLibraryFactory/GasDataImporter/src/pipeline/__tests__/ImportPipelineExecutor.test.js`

**Verified:** `ImportPipelineExecutor.runImport` (read in full) does one synchronous `_executeExtract` → `_executeTransform` → `_executeLoad` per call — nothing checkpoints mid-recipe. `SourceStrategy` (`SourceStrategy.js`) has no cursor concept; `SheetByIdStrategy._resolveValues` always fetches the entire sheet range in one `getRanges` call. `Loader.load` (read in full) always re-reads `table.getAllRows()` and recomputes existing keys before insert/update/upsert — which means `INSERT_ONLY`/`UPDATE_ONLY`/`UPSERT` are _already naturally idempotent_ if the same chunk is re-applied (a previously-inserted row shows up as "existing" the second time and is skipped/updated, never duplicated). `OVERWRITE` is the only strategy that isn't idempotent across chunks — it purges the whole table every call, so it must only purge on the first chunk of a run.

**Scope (deliberately narrower than a fully general resumable importer, per the report's own recommendation to keep changes contained):** cursor-aware chunking for `SheetByIdStrategy` only (the source type ALDO's `FILE_SINGOLO` recipes use). Any other extract strategy (`FolderStrategy`, custom-registered strategies like ALDO's `CERCA_CARTELLE_CLASSE`/`CERCA_DOCUMENTI`) runs through a compatibility path: the first chunk extracts everything at once (`exhausted: true` immediately), so `startImport`/`runImportChunk` work for every recipe today, but only `SheetById` sources actually spread extraction across multiple chunks.

**Interfaces:**

- Produces (new public API other GLF consumers and ALDO Task 5 rely on):
  - `ImportCheckpoint` shape: `{ stage: 'EXTRACT'|'TRANSFORM'|'LOAD'|'DONE', recipeName: string, sourceCursor: unknown, rowOffset: number, loadOffset: number, counters: { extracted: number, transformed: number, inserted: number, updated: number, skipped: number, deleted: number }, buffer: object[] | null, done: boolean }`
  - `ImportEngine.startImport(recipe, options = {}): ImportCheckpoint`
  - `ImportEngine.runImportChunk(checkpoint, budget = { maxRows: 500 }): { checkpoint: ImportCheckpoint, done: boolean }`
  - `SourceStrategy.supportsCursor(): boolean` (default `false`)
  - `SourceStrategy.extractChunk(config, cursor, maxRows): { rows: object[], nextCursor: unknown, exhausted: boolean }` (default: throws `Error('extractChunk not supported by this strategy')`)
  - `Loader.loadChunk(data, loadConfig, { isFirstChunk }): { inserted, updated, skipped, deleted, total }` (always calls `this._db.save()` at the end of the chunk — that's the commit boundary a resumed run picks up from)

- [ ] **Step 1: Write the failing test for `ImportCheckpoint`**

`GasLibraryFactory/GasDataImporter/src/__tests__/ImportCheckpoint.test.js`:

```js
import { ImportCheckpoint } from '../ImportCheckpoint.js';

test('creates an initial checkpoint at EXTRACT stage with zeroed counters', () => {
  const cp = ImportCheckpoint.initial('IMPORT_ALUNNI');
  expect(cp.stage).toBe('EXTRACT');
  expect(cp.recipeName).toBe('IMPORT_ALUNNI');
  expect(cp.rowOffset).toBe(0);
  expect(cp.done).toBe(false);
  expect(cp.counters).toEqual({
    extracted: 0,
    transformed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    deleted: 0
  });
});

test('serializes and restores via plain JSON (JobRunnerLib ScriptProperties contract)', () => {
  const cp = ImportCheckpoint.initial('IMPORT_ALUNNI');
  const restored = ImportCheckpoint.fromJSON(JSON.parse(JSON.stringify(cp)));
  expect(restored).toEqual(cp);
});

test('rejects a checkpoint whose recipeName does not match the recipe being resumed', () => {
  const cp = ImportCheckpoint.initial('IMPORT_ALUNNI');
  expect(() => ImportCheckpoint.assertMatches(cp, 'IMPORT_DOCENTI')).toThrow(/recipeName/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `GasLibraryFactory/`): `npm test -- ImportCheckpoint`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ImportCheckpoint`**

`GasLibraryFactory/GasDataImporter/src/ImportCheckpoint.js`:

```js
/**
 * @fileoverview Serializable checkpoint contract for resumable imports.
 * @author GasLibraryFactory
 */

/** @typedef {'EXTRACT'|'TRANSFORM'|'LOAD'|'DONE'} ImportStage */

class ImportCheckpoint {
  /**
   * @param {string} recipeName
   * @param {ImportStage} stage
   * @param {*} sourceCursor
   * @param {number} rowOffset
   * @param {number} loadOffset
   * @param {Object} counters
   * @param {Array<Object>|null} buffer
   * @param {boolean} done
   */
  constructor(recipeName, stage, sourceCursor, rowOffset, loadOffset, counters, buffer, done) {
    this.recipeName = recipeName;
    this.stage = stage;
    this.sourceCursor = sourceCursor;
    this.rowOffset = rowOffset;
    this.loadOffset = loadOffset;
    this.counters = counters;
    this.buffer = buffer;
    this.done = done;
  }

  static initial(recipeName) {
    return new ImportCheckpoint(
      recipeName,
      'EXTRACT',
      null,
      0,
      0,
      { extracted: 0, transformed: 0, inserted: 0, updated: 0, skipped: 0, deleted: 0 },
      null,
      false
    );
  }

  static fromJSON(obj) {
    return new ImportCheckpoint(
      obj.recipeName,
      obj.stage,
      obj.sourceCursor,
      obj.rowOffset,
      obj.loadOffset,
      obj.counters,
      obj.buffer,
      obj.done
    );
  }

  static assertMatches(checkpoint, recipeName) {
    if (checkpoint.recipeName !== recipeName) {
      throw new Error(
        `Checkpoint recipeName mismatch: checkpoint is for "${checkpoint.recipeName}", resuming "${recipeName}"`
      );
    }
  }
}

export { ImportCheckpoint };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ImportCheckpoint`
Expected: PASS.

- [ ] **Step 5: Write the failing test for cursor-aware `SheetByIdStrategy.extractChunk`**

Read `GasLibraryFactory/GasDataImporter/src/internal/extract-strategies/__tests__/SheetByIdStrategy.test.js` (existing file) first to reuse its `spreadsheetService` mock shape, then add:

```js
test('extractChunk paginates by row offset and reports exhaustion', () => {
  const spreadsheetService = {
    getSheetInfo: () => [{ name: 'Sheet1', gridProperties: { rowCount: 3, columnCount: 2 } }],
    getRanges: (sheetId, range) => {
      if (range === 'Sheet1!A1:B1') return [['A', 'B']];
      if (range === 'Sheet1!A2:B2') return [['1', '2']];
      if (range === 'Sheet1!A3:B3') return [['3', '4']];
      throw new Error(`unexpected range ${range}`);
    }
  };
  const strategy = new SheetByIdStrategy(console, spreadsheetService);
  expect(strategy.supportsCursor()).toBe(true);

  const chunk1 = strategy.extractChunk({ sheetId: 's1' }, { rowOffset: 0, headers: null }, 1);
  expect(chunk1.rows).toEqual([{ A: 1, B: 2 }]);
  expect(chunk1.exhausted).toBe(false);
  expect(chunk1.nextCursor.rowOffset).toBe(1);

  const chunk2 = strategy.extractChunk({ sheetId: 's1' }, chunk1.nextCursor, 1);
  expect(chunk2.rows).toEqual([{ A: 3, B: 4 }]);
  expect(chunk2.exhausted).toBe(true);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- SheetByIdStrategy`
Expected: FAIL — `extractChunk is not a function`.

- [ ] **Step 7: Implement cursor support**

In `SourceStrategy.js`, add the default (non-cursor-aware) contract:

```js
supportsCursor() {
  return false;
}

extractChunk(_config, _cursor, _maxRows) {
  throw new Error(`extractChunk not supported by ${this.constructor.name}`);
}
```

In `SheetByIdStrategy.js`, add:

```js
supportsCursor() {
  return true;
}

extractChunk(config, cursor, maxRows) {
  this._validateConfig(config, ['sheetId']);
  const hasHeaders = config.hasHeaders !== false;
  const sheetId = config.sheetId;
  const sheets = this._spreadsheetService.getSheetInfo(sheetId);
  if (!sheets || sheets.length === 0) {
    throw new SourceError('Spreadsheet has no sheets', 'NO_SHEETS_FOUND', { sheetId });
  }
  const targetSheet = config.tabName
    ? sheets.find((s) => s.name === config.tabName)
    : sheets[0];
  if (!targetSheet) {
    throw new SourceError(`Sheet tab "${config.tabName}" not found in spreadsheet`, 'TAB_NOT_FOUND', {
      sheetId,
      tabName: config.tabName
    });
  }

  const lastRow = targetSheet.gridProperties?.rowCount ?? targetSheet.rowCount;
  const lastCol = targetSheet.gridProperties?.columnCount ?? targetSheet.columnCount;
  const headerOffset = hasHeaders ? 1 : 0;
  const startRow = headerOffset + cursor.rowOffset + 1;

  if (lastRow === 0 || startRow > lastRow) {
    return { rows: [], nextCursor: { ...cursor }, exhausted: true };
  }

  const endRow = Math.min(startRow + maxRows - 1, lastRow);
  const range = `${targetSheet.name}!A${startRow}:${this._columnToLetter(lastCol)}${endRow}`;
  const values = this._spreadsheetService.getRanges(sheetId, range) || [];

  let headers = cursor.headers;
  if (!headers) {
    if (hasHeaders) {
      const headerRange = `${targetSheet.name}!A1:${this._columnToLetter(lastCol)}1`;
      headers = (this._spreadsheetService.getRanges(sheetId, headerRange) || [[]])[0];
    } else {
      headers = Array.from({ length: lastCol }, (_, i) => `Col_${i}`);
    }
  }

  const rows = values.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = this._coerceValue(row[index] !== undefined ? row[index] : null);
    });
    return obj;
  });

  const consumedRows = endRow - startRow + 1;
  const newRowOffset = cursor.rowOffset + consumedRows;
  const exhausted = endRow >= lastRow;

  return { rows, nextCursor: { rowOffset: newRowOffset, headers }, exhausted };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- SheetByIdStrategy`
Expected: PASS.

- [ ] **Step 9: Write the failing test for `Loader.loadChunk` idempotency and OVERWRITE gating**

Read `GasLibraryFactory/GasDataImporter/src/internal/load/__tests__/Loader.test.js` for its existing `table`/`databaseService` fake shape, then add:

```js
test('loadChunk re-applies the same UPSERT chunk without duplicating rows (idempotent resume)', () => {
  const { loader, table } = wireLoader(); // reuse existing test helper
  const loadConfig = { targetTable: 'ALUNNI', conflictResolution: 'UPSERT', conflictKey: 'EMAIL' };
  const data = [{ EMAIL: 'a@x.it', NOME: 'A' }];

  const first = loader.loadChunk(data, loadConfig, { isFirstChunk: true });
  const second = loader.loadChunk(data, loadConfig, { isFirstChunk: false }); // simulated resume re-run

  expect(first.inserted).toBe(1);
  expect(second.inserted).toBe(0);
  expect(second.updated).toBe(1); // second pass sees it as existing, updates in place — never duplicates
});

test('loadChunk only purges the table on the first chunk of an OVERWRITE run', () => {
  const { loader, table } = wireLoader();
  table.insertRows([{ ID: 'r1', EMAIL: 'old@x.it' }]);
  const loadConfig = {
    targetTable: 'ALUNNI',
    conflictResolution: 'OVERWRITE',
    conflictKey: 'EMAIL'
  };

  loader.loadChunk([{ EMAIL: 'new1@x.it' }], loadConfig, { isFirstChunk: true });
  loader.loadChunk([{ EMAIL: 'new2@x.it' }], loadConfig, { isFirstChunk: false });

  const rows = table.getAllRows();
  expect(rows.map((r) => r.EMAIL).sort()).toEqual(['new1@x.it', 'new2@x.it']); // old@x.it purged once, both new rows kept
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- Loader`
Expected: FAIL — `loadChunk is not a function`.

- [ ] **Step 11: Implement `Loader.loadChunk`**

In `Loader.js`, add a thin wrapper around the existing private strategy methods (reusing them exactly as `load()` does, only gating `_overwrite`'s purge and always saving at the end of the chunk):

```js
loadChunk(data, loadConfig, { isFirstChunk }) {
  if (!Array.isArray(data)) {
    throw new LoadError('Data must be an array', 'INVALID_DATA', { dataType: typeof data });
  }
  this._validateLoadConfig(loadConfig);

  const targetTable = loadConfig.targetTable;
  const conflictResolution = loadConfig.conflictResolution;
  const conflictKey = loadConfig.conflictKey;
  const updateIfNewer = loadConfig.updateIfNewer || {};

  if (!this._db.tables[targetTable]) {
    throw new LoadError(`Target table "${targetTable}" not found in database`, 'TABLE_NOT_FOUND', {
      targetTable,
      availableTables: Object.keys(this._db.tables)
    });
  }
  const table = this._db.tables[targetTable];

  let result;
  if (data.length === 0) {
    result = { success: true, inserted: 0, updated: 0, skipped: 0, deleted: 0, total: 0 };
  } else {
    switch (conflictResolution) {
      case 'INSERT_ONLY':
        result = this._insertOnly(table, data, conflictKey);
        break;
      case 'UPDATE_ONLY':
        result = this._updateOnly(table, data, conflictKey, updateIfNewer);
        break;
      case 'UPSERT':
        result = this._upsert(table, data, conflictKey, updateIfNewer);
        break;
      case 'OVERWRITE':
        result = isFirstChunk
          ? this._overwrite(table, data, conflictKey)
          : this._insertOnly(table, data, conflictKey); // purge already happened on chunk 0; append after
        break;
      default:
        throw new LoadError(`Unknown conflict resolution strategy: ${conflictResolution}`, 'UNKNOWN_STRATEGY', {
          conflictResolution
        });
    }
  }

  // Commit boundary: flush after every chunk so a resumed run picks up from durable state.
  this._db.save();
  return result;
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- Loader`
Expected: PASS.

- [ ] **Step 13: Write the failing test for `ImportEngine.startImport`/`runImportChunk` orchestration**

Read `GasLibraryFactory/GasDataImporter/src/pipeline/__tests__/ImportPipelineExecutor.test.js` for its existing config/recipe fixtures, then add:

```js
test('startImport + runImportChunk drives a SheetById recipe to completion across multiple chunks', () => {
  const { facade } = wireFacadeWithThreeRowSheet(); // extend existing test helpers: 3-row sheet, maxRows 1 per chunk
  const recipe = threeRowSheetRecipe(); // existing/new fixture: FILE_SINGOLO -> SheetById, UPSERT on EMAIL

  let checkpoint = facade.startImport(recipe);
  expect(checkpoint.stage).toBe('EXTRACT');

  let done = false;
  let iterations = 0;
  while (!done && iterations < 10) {
    const step = facade.runImportChunk(checkpoint, { maxRows: 1 });
    checkpoint = step.checkpoint;
    done = step.done;
    iterations++;
  }

  expect(done).toBe(true);
  expect(checkpoint.counters.inserted).toBe(3);
  expect(iterations).toBeGreaterThan(1); // proves it actually chunked, not one shot
});

test('runImportChunk on a non-cursor-aware source strategy still completes (compatibility path)', () => {
  const { facade } = wireFacadeWithCustomSource(); // existing custom-source fixture from this test file
  const recipe = customSourceRecipe();

  let checkpoint = facade.startImport(recipe);
  const step = facade.runImportChunk(checkpoint, { maxRows: 1 });

  expect(step.done).toBe(true); // whole extract happened in this one chunk
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `npm test -- ImportPipelineExecutor`
Expected: FAIL — `startImport`/`runImportChunk` not defined.

- [ ] **Step 15: Implement `startImport`/`runImportChunk` in `ImportPipelineExecutor`**

```js
startImport(recipe, options = {}) {
  const config = new ImportConfiguration(recipe, this.facade.logger);
  this.facade.logger.info(`[ImportEngine] startImport: ${config.getName()}`);
  return ImportCheckpoint.initial(config.getName());
}

runImportChunk(checkpoint, budget = {}) {
  const maxRows = budget.maxRows || 500;
  // Recipe isn't part of the checkpoint by design (keeps it small/serializable);
  // callers must re-pass the same recipe object each call. Store it once via a
  // side-channel the caller owns (ALDO Task 5 keeps it in JobHandlerParams).
  throw new Error(
    'runImportChunk requires the recipe/config each call — see ImportEngine.runImportChunk(recipe, checkpoint, budget)'
  );
}
```

**Design correction caught during this step:** a checkpoint alone can't drive extraction without the recipe (source config, target table, conflict strategy). Change the public signature to `runImportChunk(recipe, checkpoint, budget)` — update the test calls above to `facade.runImportChunk(recipe, checkpoint, { maxRows: 1 })` and re-run Step 14 to confirm the adjusted test still fails for the right reason, then implement:

```js
runImportChunk(recipe, checkpoint, budget = {}) {
  const maxRows = budget.maxRows || 500;
  const config = new ImportConfiguration(recipe, this.facade.logger);
  ImportCheckpoint.assertMatches(checkpoint, config.getName());

  if (checkpoint.stage === 'EXTRACT') {
    const sourceConfig = config.getSource();
    const strategy = this.facade._sourceFactory.createStrategy(sourceConfig.type);
    let rows;
    let cursor = checkpoint.sourceCursor;
    let exhausted;
    if (strategy.supportsCursor()) {
      const result = strategy.extractChunk(sourceConfig.config, cursor ?? { rowOffset: 0, headers: null }, maxRows);
      rows = result.rows;
      cursor = result.nextCursor;
      exhausted = result.exhausted;
    } else {
      rows = strategy.extract(sourceConfig.config);
      exhausted = true;
    }
    const buffer = (checkpoint.buffer || []).concat(rows);
    const counters = { ...checkpoint.counters, extracted: checkpoint.counters.extracted + rows.length };
    const nextStage = exhausted ? 'TRANSFORM' : 'EXTRACT';
    return {
      checkpoint: new ImportCheckpoint(
        checkpoint.recipeName, nextStage, cursor, checkpoint.rowOffset, checkpoint.loadOffset, counters, buffer, false
      ),
      done: false
    };
  }

  if (checkpoint.stage === 'TRANSFORM') {
    const transformConfig = config.getTransform();
    const transformed = this.facade._transformer.transform(checkpoint.buffer || [], transformConfig);
    const counters = { ...checkpoint.counters, transformed: transformed.length };
    return {
      checkpoint: new ImportCheckpoint(
        checkpoint.recipeName, 'LOAD', checkpoint.sourceCursor, checkpoint.rowOffset, checkpoint.loadOffset, counters, transformed, false
      ),
      done: false
    };
  }

  if (checkpoint.stage === 'LOAD') {
    const loadConfig = config.getLoad();
    const isFirstChunk = checkpoint.loadOffset === 0;
    const result = this.facade._loader.loadChunk(checkpoint.buffer || [], loadConfig, { isFirstChunk });
    const counters = {
      ...checkpoint.counters,
      inserted: checkpoint.counters.inserted + result.inserted,
      updated: checkpoint.counters.updated + result.updated,
      skipped: checkpoint.counters.skipped + result.skipped,
      deleted: checkpoint.counters.deleted + result.deleted
    };
    const doneCheckpoint = new ImportCheckpoint(
      checkpoint.recipeName, 'DONE', checkpoint.sourceCursor, checkpoint.rowOffset, checkpoint.loadOffset + 1, counters, null, true
    );
    return { checkpoint: doneCheckpoint, done: true };
  }

  return { checkpoint, done: true };
}
```

Wire both new methods onto the facade in `ImportEngine.js`'s constructor `pipelineMethods` list: add `'startImport'`, `'runImportChunk'`. Import `ImportCheckpoint` in both `ImportEngine.js` and `ImportPipelineExecutor.js`. Add both to `GasDataImporter/index.js`'s export list alongside `ImportEngine`.

- [ ] **Step 16: Run test to verify it passes**

Run: `npm test -- ImportPipelineExecutor`
Expected: PASS (after adjusting the two test call sites to the corrected 3-arg `runImportChunk` signature).

- [ ] **Step 17: Update docs**

Add a "Resumable/chunked imports" section to `GasLibraryFactory/DOCS_LIBS/GasDataImporter.md` documenting `startImport`/`runImportChunk`'s signature, the `ImportCheckpoint` shape, which source strategies currently support real chunking (`SheetById` only), and the OVERWRITE first-chunk-purge caveat.

- [ ] **Step 18: Full verification (GasLibraryFactory repo)**

Run: `cd GasLibraryFactory && npm test && npm run lint`
Expected: all 4,306+ tests green, no lint errors.

- [ ] **Step 19: Commit (in the `GasLibraryFactory` repo)**

```bash
git add GasDataImporter/src/ImportCheckpoint.js GasDataImporter/src/internal/extract-strategies/SourceStrategy.js GasDataImporter/src/internal/extract-strategies/SheetByIdStrategy.js GasDataImporter/src/internal/load/Loader.js GasDataImporter/src/pipeline/ImportPipelineExecutor.js GasDataImporter/src/ImportEngine.js GasDataImporter/index.js DOCS_LIBS/GasDataImporter.md GasDataImporter/src/__tests__/ImportCheckpoint.test.js GasDataImporter/src/internal/extract-strategies/__tests__/SheetByIdStrategy.test.js GasDataImporter/src/internal/load/__tests__/Loader.test.js GasDataImporter/src/pipeline/__tests__/ImportPipelineExecutor.test.js
git commit -m "feat(GasDataImporter): add startImport/runImportChunk resumable API for SheetById sources"
```

---

### Task 5: ALDO — resumable import launcher on top of Task 4

**Files:**

- Modify: `src/application/services/ImportService.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `src/index.ts`
- Modify: `src/entrypoints/EntryPoints.ts`
- Test: `test/unit/application/import-service.test.ts`
- Run: `npm run refresh:vendor && npm run verify:vendor` (must be done first, after Task 4 lands in `GasLibraryFactory`)

**Interfaces:**

- Consumes: `ImportEngine.startImport(recipe)`, `ImportEngine.runImportChunk(recipe, checkpoint, budget)` (Task 4).
- Produces: `ImportService.executeImportChunked(configId): Generator<ImportCheckpoint, ImportResult, void>`; `JOB_TYPE_IMPORT_CHUNKED` constant; `menu_avvioImportazioneChunked()` launcher, mirroring `EmailBatchService`'s `start()`/`registerJobHandlers()` pattern from Task 1/2.

- [ ] **Step 1: Refresh vendor after Task 4 ships**

Run: `npm run refresh:vendor && npm run verify:vendor`
Expected: `vendor/gaslibs.Code.js` now exports `ImportCheckpoint`/the new `ImportEngine` methods; `verify:vendor` passes.

- [ ] **Step 2: Write the failing test — chunked handler drives one CONF_IMP job to completion via yields**

Add to `test/unit/application/import-service.test.ts`, building a fake `ImportEngine` that exposes `startImport`/`runImportChunk` returning a 2-chunk sequence (EXTRACT→TRANSFORM→LOAD→DONE):

```ts
test('executeImportChunked yields one checkpoint per stage transition and resolves ImportResult', () => {
  const database = db([confImpRow()]);
  let calls = 0;
  const engine = {
    startImport: (recipe: ImportRecipe) => ({
      recipeName: recipe.name,
      stage: 'EXTRACT',
      sourceCursor: null,
      rowOffset: 0,
      loadOffset: 0,
      counters: { extracted: 0, transformed: 0, inserted: 0, updated: 0, skipped: 0, deleted: 0 },
      buffer: null,
      done: false
    }),
    runImportChunk: (_recipe: ImportRecipe, checkpoint: ImportCheckpoint) => {
      calls++;
      if (checkpoint.stage === 'EXTRACT')
        return {
          checkpoint: { ...checkpoint, stage: 'TRANSFORM', buffer: [{ EMAIL: 'a@x.it' }] },
          done: false
        };
      if (checkpoint.stage === 'TRANSFORM')
        return { checkpoint: { ...checkpoint, stage: 'LOAD' }, done: false };
      return {
        checkpoint: {
          ...checkpoint,
          stage: 'DONE',
          done: true,
          counters: { ...checkpoint.counters, inserted: 1 }
        },
        done: true
      };
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  const gen = service.executeImportChunked('IMPORT_ALUNNI');
  const checkpoints: ImportCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }

  expect(checkpoints.map((c) => c.stage)).toEqual(['TRANSFORM', 'LOAD']);
  expect(step.value.inseriti).toBe(1);
  expect(calls).toBe(3);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/import-service.test.ts -v`
Expected: FAIL — `executeImportChunked` not defined.

- [ ] **Step 4: Implement `ImportService.executeImportChunked`**

```ts
export const JOB_TYPE_IMPORT_CHUNKED = 'IMPORT_CHUNKED';

export class ImportService {
  // ...existing constructor/executeImport/executeAllActiveImports unchanged...

  *executeImportChunked(
    configId: string,
    resumeState?: ImportCheckpoint
  ): Generator<ImportCheckpoint, ImportResult, void> {
    const conf = this.configs.findById(configId);
    if (conf === null) throw new PipelineError(`CONF_IMP ${configId} non trovato`);
    const recipe = toLibraryRecipe(conf);

    let checkpoint = resumeState ?? this.engine.startImport(recipe);
    while (!checkpoint.done) {
      const step = this.engine.runImportChunk(recipe, checkpoint);
      checkpoint = step.checkpoint;
      if (!step.done) yield checkpoint;
    }

    return {
      inseriti: checkpoint.counters.inserted,
      aggiornati: checkpoint.counters.updated,
      saltati: checkpoint.counters.skipped,
      ghost: 0, // ghost-record detection (12 §3) is not yet applied in the chunked path — see follow-up note below
      errori: []
    };
  }

  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_IMPORT_CHUNKED, (params) =>
      this.executeImportChunked(
        String((params as { configId?: string }).configId ?? ''),
        (params as { resumeState?: ImportCheckpoint }).resumeState
      )
    );
  }

  start(
    runner: JobRunnerService,
    jobName: string,
    configId: string,
    forceRestart = false
  ): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_IMPORT_CHUNKED,
      { configId },
      (queue) => this.registerJobHandlers(queue),
      forceRestart
    );
  }
}
```

**Follow-up flagged, not fixed in this task:** Ghost Record Detection currently runs as a `postTransform` hook inside `runImport`'s synchronous pipeline (see the docstring on `ImportService`). The chunked path's `TRANSFORM` stage in `GasDataImporter` doesn't call a `postTransform` hook — Task 4's `runImportChunk` has no hook parameter. Before this chunked launcher is used for any recipe that relies on ghost filtering, either extend `runImportChunk`'s `TRANSFORM` stage with the same `postTransform` hook `runImport` already supports, or filter ghost rows client-side in `executeImportChunked` between the `TRANSFORM`→`LOAD` yield. Raise this with the user before wiring `menu_avvioImportazioneChunked` to any live CONF_IMP recipe — do not silently ship reduced ghost-filtering coverage.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/import-service.test.ts -v`
Expected: PASS.

- [ ] **Step 6: Wire Bootstrap + launcher**

Add to `Bootstrap.ts`'s `importService` registration block a job-handler registration alongside `documenti`/`email` (Task 2's pattern), and a launcher:

```ts
export function avviaImportazioneChunkedDataDriven(
  c: ServiceContainer,
  configId: string,
  runner: JobRunnerService
): unknown {
  return c.get<ImportService>('importService').start(runner, `imp_chunked_${configId}`, configId);
}
```

Add `menu_avvioImportazioneChunked` to `src/index.ts`/`src/entrypoints/EntryPoints.ts` following the same pattern as Task 2's `menu_avvioRetryEmail`. Leave the existing synchronous `menu_avvioImportazioni` in place — chunked import is an alternative path for large recipes, not a replacement (per the report: "extend `GasDataImporter` only if one import recipe can exceed a GAS execution window").

- [ ] **Step 7: Full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build:online`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/application/services/ImportService.ts src/config/Bootstrap.ts src/index.ts src/entrypoints/EntryPoints.ts test/unit/application/import-service.test.ts vendor/
git commit -m "feat: add chunked/resumable import launcher on GasDataImporter's checkpoint API"
```

---

### Task 6: Extract `LazyRef<T>` into `CoreUtilsLib`

**Repo:** `GasLibraryFactory/` for the extraction; ALDO for the import swap.

**Files:**

- Create: `GasLibraryFactory/CoreUtilsLib/src/utils/LazyRef.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/index.js` (export)
- Modify: `GasLibraryFactory/DOCS_LIBS/CoreUtilsLib.md`
- Test: `GasLibraryFactory/CoreUtilsLib/src/utils/__tests__/LazyRef.test.js`
- Delete: `src/application/storico/LazyRef.ts` (ALDO)
- Modify: `src/application/context-engine/Cdu.ts`, `src/application/context-engine/providers/DocumentiStoricoProvider.ts`, `src/application/context-engine/providers/PianiPersClasseStoricoProvider.ts`, `src/application/context-engine/providers/StoricoProvider.ts`, `src/application/email/boxes.ts`, `src/application/context-engine/Recipe.ts`, `src/application/context-engine/providers/PianiPersAlunnoStoricoProvider.ts`, `src/application/storico/StoricoDocumentiService.ts` (import path swap — all 8 confirmed callers)

**Verified:** `src/application/storico/LazyRef.ts` (read in full) is a dependency-free generic class (`resolved`/`value`/`loader`, `get()`/`isResolved()`). `grep -rln LazyRef src/` found exactly these 9 files (the class itself + 8 callers). `CoreUtilsLib/index.js` and `DOCS_LIBS/CoreUtilsLib.md` were checked — `LazyServiceContainer` exists but is DI-container-shaped, not a generic lazy value; there is no equivalent.

**Interfaces:**

- Produces: `LazyRef` class exported from `@CoreUtilsLib`, identical public API (`constructor(loader: () => T)`, `get(): T`, `isResolved(): boolean`) to what ALDO already uses — this is a pure move, no signature change, so no caller's logic changes, only its import line.

- [ ] **Step 1: Write the failing test in `GasLibraryFactory`**

`GasLibraryFactory/CoreUtilsLib/src/utils/__tests__/LazyRef.test.js`:

```js
import { LazyRef } from '../LazyRef.js';

test('defers loader until first get()', () => {
  let calls = 0;
  const ref = new LazyRef(() => {
    calls++;
    return 'value';
  });
  expect(ref.isResolved()).toBe(false);
  expect(calls).toBe(0);
  expect(ref.get()).toBe('value');
  expect(calls).toBe(1);
  expect(ref.isResolved()).toBe(true);
});

test('caches the value across repeated get() calls', () => {
  let calls = 0;
  const ref = new LazyRef(() => ++calls);
  ref.get();
  ref.get();
  expect(ref.get()).toBe(1);
  expect(calls).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `GasLibraryFactory/`): `npm test -- LazyRef`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LazyRef` in `CoreUtilsLib`**

`GasLibraryFactory/CoreUtilsLib/src/utils/LazyRef.js`:

```js
/**
 * @fileoverview Generic single-value lazy loader — defers an expensive
 * computation until first access, then caches it for the lifetime of the instance.
 * @author GasLibraryFactory
 */

/**
 * @class LazyRef
 * @template T
 * @description Wraps a zero-argument loader function, invoking it at most once.
 */
class LazyRef {
  /**
   * @param {() => T} loader Zero-argument factory invoked at most once, on first get().
   */
  constructor(loader) {
    this._resolved = false;
    this._value = undefined;
    this._loader = loader;
  }

  /**
   * @returns {T} The loader's result, computed on first call and cached thereafter.
   */
  get() {
    if (!this._resolved) {
      this._value = this._loader();
      this._resolved = true;
    }
    return this._value;
  }

  /**
   * @returns {boolean} True once get() has been called at least once.
   */
  isResolved() {
    return this._resolved;
  }
}

export { LazyRef };
```

Add `export { LazyRef } from './src/utils/LazyRef.js';` to `CoreUtilsLib/index.js`'s export list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LazyRef`
Expected: PASS.

- [ ] **Step 5: Document it**

Add a short `LazyRef` section to `GasLibraryFactory/DOCS_LIBS/CoreUtilsLib.md` next to the existing utils entries, with the same signature shown above.

- [ ] **Step 6: Full verification + commit (`GasLibraryFactory` repo)**

Run: `npm test && npm run lint`
Expected: all green.

```bash
git add CoreUtilsLib/src/utils/LazyRef.js CoreUtilsLib/index.js DOCS_LIBS/CoreUtilsLib.md CoreUtilsLib/src/utils/__tests__/LazyRef.test.js
git commit -m "feat(CoreUtilsLib): add generic LazyRef lazy-value wrapper"
```

- [ ] **Step 7: Refresh vendor in ALDO**

Run: `npm run refresh:vendor && npm run verify:vendor`

- [ ] **Step 8: Swap ALDO's imports and delete the local class**

In each of the 8 caller files, replace `import { LazyRef } from '.../LazyRef'` (whatever relative path each file uses — check each import individually, they differ by directory depth) with `import { LazyRef } from '@CoreUtilsLib';` (confirm `@CoreUtilsLib` is already a valid module alias in ALDO's `tsconfig`/webpack config — it's used elsewhere per `GasLibraryFactory/CLAUDE.md`'s canonical-import-paths note; if ALDO doesn't already alias `@CoreUtilsLib`, import from wherever ALDO's vendor re-export already exposes other `CoreUtilsLib` symbols like `LoggerService`, matching that exact pattern instead). Delete `src/application/storico/LazyRef.ts`.

- [ ] **Step 9: Run full ALDO verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: all green — this is a pure import swap, so no test assertions should need to change, only the import lines.

- [ ] **Step 10: Commit (ALDO repo)**

```bash
git add -A src/application/storico src/application/context-engine src/application/email vendor/
git commit -m "refactor: use CoreUtilsLib's LazyRef instead of the ALDO-local copy"
```

---

### Task 7: Extract `RowScopeExpansion`'s pure functions into `RoleResolutionLib`

**Repo:** `GasLibraryFactory/` for the extraction; ALDO for the import swap.

**Files:**

- Create: `GasLibraryFactory/RoleResolutionLib/src/utils/MateriaSlotParsing.js`
- Modify: `GasLibraryFactory/RoleResolutionLib/index.js` (export)
- Modify: `GasLibraryFactory/DOCS_LIBS/RoleResolutionLib.md`
- Test: `GasLibraryFactory/RoleResolutionLib/src/utils/__tests__/MateriaSlotParsing.test.js`
- Modify: `src/infrastructure/role-resolution/RowScopeExpansion.ts` (remove the 4 extracted functions, keep `nominalPairsForAnchor`/`expandRowScope`/`expandRowToPairs` which depend on `IClasseRepository` — those stay ALDO-local per the report's own Level 2 assessment; import the 4 pure ones from GLF instead)

**Verified:** Read `RowScopeExpansion.ts` in full. `splitCsvList` and `groupMateriaEntriesBySlot` (lines 30-60) have zero ALDO dependencies beyond the local `ANY` constant and locally-declared types — pure string/array logic. `slotCompatible`/`pairsOverlap` (referenced at lines 190-201) close over no ALDO types either, per the report's own analysis. `nominalPairsForAnchor`/`expandRowScope`/`expandRowToPairs` depend on `IClasseRepository` (ALDO-specific interface with `findByDocenteAssegnato`/`getTeachingSlots`) — **do not extract these**; extracting them would need a new generic "class-with-teaching-slots" abstraction in GLF, which is out of scope here (report's own "Level 2 — requires new GLF interface, separate decision").

**Interfaces:**

- Produces: `RoleResolutionLib` exports `splitCsvList(raw: string): string[]`, `groupMateriaEntriesBySlot(materieRaw: string): MateriaSlotGroup[]`, `slotCompatible(a, b): boolean`, `pairsOverlap(a, b): boolean` — same signatures ALDO already uses, confirmed against the read source.

- [ ] **Step 1: Write the failing test in `GasLibraryFactory`**

Read `RowScopeExpansion.ts` lines 30-70 and the `slotCompatible`/`pairsOverlap` bodies (lines ~190-211, not shown above — read them before writing this test) to port their exact behavior, then write `GasLibraryFactory/RoleResolutionLib/src/utils/__tests__/MateriaSlotParsing.test.js`:

```js
import {
  splitCsvList,
  groupMateriaEntriesBySlot,
  slotCompatible,
  pairsOverlap
} from '../MateriaSlotParsing.js';

test('splitCsvList trims and drops empty entries', () => {
  expect(splitCsvList('A, B ,,C')).toEqual(['A', 'B', 'C']);
});

test('groupMateriaEntriesBySlot separates bare/ITP/SPECIFICA-qualified entries', () => {
  const groups = groupMateriaEntriesBySlot('MAT1,MAT2.itp,MAT3.spec1');
  expect(groups).toEqual([
    { kind: '*', specifica: '*', materie: ['MAT1'] },
    { kind: 'ITP', specifica: '*', materie: ['MAT2'] },
    { kind: 'SPECIFICA', specifica: 'spec1', materie: ['MAT3'] }
  ]);
});
```

(Port the exact `slotCompatible`/`pairsOverlap` test cases from ALDO's existing unit tests for `RowScopeExpansion` — find them via `grep -rln "slotCompatible\|pairsOverlap" test/` in the ALDO repo before writing this file, and mirror the same input/output pairs so behavior parity is provable, not assumed.)

- [ ] **Step 2: Run test to verify it fails**

Run (from `GasLibraryFactory/`): `npm test -- MateriaSlotParsing`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, copying the exact logic read from `RowScopeExpansion.ts`**

`GasLibraryFactory/RoleResolutionLib/src/utils/MateriaSlotParsing.js` — port `splitCsvList` and `groupMateriaEntriesBySlot` verbatim (shown in full above, lines 30-60 of the ALDO source), and port `slotCompatible`/`pairsOverlap` verbatim from what Step 1 required you to read. Use the sentinel `'*'` directly (GLF's version doesn't need ALDO's exported `ANY` constant — inline the literal, and note in a comment that ALDO's `ANY` constant must stay equal to `'*'`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- MateriaSlotParsing`
Expected: PASS.

- [ ] **Step 5: Export and document**

Add exports to `RoleResolutionLib/index.js`. Add a "Materia slot CSV parsing" section to `GasLibraryFactory/DOCS_LIBS/RoleResolutionLib.md` documenting these 4 functions as reusable helpers for any GAS app parsing `MATERIA.itp`/`MATERIA.specifica`-style CSV cattedra columns.

- [ ] **Step 6: Full verification + commit (`GasLibraryFactory` repo)**

Run: `npm test && npm run lint`

```bash
git add RoleResolutionLib/src/utils/MateriaSlotParsing.js RoleResolutionLib/index.js DOCS_LIBS/RoleResolutionLib.md RoleResolutionLib/src/utils/__tests__/MateriaSlotParsing.test.js
git commit -m "feat(RoleResolutionLib): extract materia-slot CSV parsing helpers"
```

- [ ] **Step 7: Refresh vendor and swap ALDO's imports**

Run: `npm run refresh:vendor && npm run verify:vendor`

In `src/infrastructure/role-resolution/RowScopeExpansion.ts`, remove the bodies of `splitCsvList`, `groupMateriaEntriesBySlot`, `slotCompatible`, `pairsOverlap`, replacing them with:

```ts
export {
  splitCsvList,
  groupMateriaEntriesBySlot,
  slotCompatible,
  pairsOverlap
} from '@RoleResolutionLib';
```

(again matching whatever ALDO's actual vendor-import alias convention is for `RoleResolutionLib` symbols — check an existing ALDO file that already imports something from `RoleResolutionLib`, e.g. `AldoTeachingResolutionConfig.ts`, and copy its import style exactly). Keep `nominalPairsForAnchor`, `expandRowScope`, `expandRowToPairs`, and the `ANY`/`MateriaSlotGroup`/`ScopeFragment`/`ConcretePair` type exports in this file unchanged — they still depend on `IClasseRepository` and stay ALDO-local.

- [ ] **Step 8: Run full ALDO verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: all green — existing `RowScopeExpansion` unit tests should pass unchanged since behavior is identical, only the implementation moved.

- [ ] **Step 9: Commit (ALDO repo)**

```bash
git add src/infrastructure/role-resolution/RowScopeExpansion.ts vendor/
git commit -m "refactor: delegate materia-slot CSV parsing to RoleResolutionLib"
```

---

### Task 8: Cosmetic — align ALDO's `Specification` interface to GLF's contract

**Files:**

- Modify: `src/domain/specifications/Specification.ts`
- Modify (imports only, no logic changes): all 14 files under `src/domain/specifications/` implementing it (`PianoSpecs.ts`, `RuoliPerDocenteSpec.ts`, `IndirizziPerTipoSpec.ts`, `ClasseSpecs.ts`, `DocenteSpecs.ts`, `MovimentoAlunnoSpecs.ts`, `OreASLSpecs.ts`, `AlunniAttiviSpec.ts`, `MaterieEsameSpec.ts`, `CarenzaSpecs.ts`, `AlunnoSpecs.ts`, `ProgettoSpecs.ts`, `MateriePerDipartimentoSpec.ts`, `VariazioneCattedraSpecs.ts`)

**Verified:** No behavior bug exists — `DomainRepositoryLib.Repository.find(specification)` already pushes down via `queryTranslator.translate` with an `isSatisfiedBy` fallback, and 20+ ALDO repository call sites already pass `Specification` instances through `this.find(spec)`/`this.findOne(spec)`. This task removes contract duplication only; **zero behavior change is the pass/fail bar** — if any test needs to change beyond import lines, stop and reassess, since that would mean this "cosmetic" task accidentally touched behavior.

**Interfaces:**

- Produces: the 14 concrete spec classes extend GLF's `Specification` base class (which provides `and()`/`or()`/`not()` composition for free) instead of implementing ALDO's local structural interface. `isSatisfiedBy`/`toQueryObject` signatures are unchanged.

- [ ] **Step 1: Confirm GLF's `Specification` base class shape before touching anything**

Read `GasLibraryFactory/DomainRepositoryLib`'s actual `Specification` class source (not just `DOCS_LIBS/DomainRepositoryLib.md`) to get its exact constructor/method requirements — the docs excerpt seen during verification only showed `and/or/not` plus a registry-hook constructor; confirm whether subclassing it requires calling `super()` with arguments or overriding anything beyond `isSatisfiedBy`/`toQueryObject`.

- [ ] **Step 2: Write the failing test — no behavior change, just type shape**

Add to an existing spec test file (e.g. wherever `ClasseSpecs.ts` is already tested) a type-level assertion rather than a new runtime test, since this is a structural change:

```ts
import { ClassiAttiveSpec } from '../../../src/domain/specifications/ClasseSpecs';
import { Specification as GlfSpecification } from '@DomainRepositoryLib';

test('ClassiAttiveSpec is a GLF Specification instance (type alignment, no behavior change)', () => {
  const spec = new ClassiAttiveSpec();
  expect(spec).toBeInstanceOf(GlfSpecification);
  // Existing isSatisfiedBy/toQueryObject assertions in this file must still pass unchanged.
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs <path to that spec's existing test file> -v`
Expected: FAIL — `spec` is not an instance of `GlfSpecification`.

- [ ] **Step 4: Change the local interface to re-export GLF's class**

In `src/domain/specifications/Specification.ts`, replace the local interface with a re-export (keeping the file as the single import point so the 14 concrete files don't need their import path changed, only what they extend):

```ts
export { Specification } from '@DomainRepositoryLib';
```

If any of the 14 files currently write `export class ClassiAttiveSpec implements Specification<Classe> { ... }`, change `implements` to `extends` and add whatever `super(...)` call Step 1 determined GLF's base constructor requires. If a concrete spec class has no constructor of its own today, add a minimal one that only calls `super(...)`.

- [ ] **Step 5: Run test to verify it passes, then run every existing spec test**

Run: `npx jest --config jest.config.cjs test/unit/domain/specifications -v` (adjust path to match the actual test tree location — confirm via `find test -path "*specifications*"` first)
Expected: PASS, and — critically — every pre-existing assertion in these files still passes unchanged. Any behavior-test failure here means stop and re-examine; this task must not need to touch `isSatisfiedBy`/`toQueryObject` bodies.

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/domain/specifications/
git commit -m "refactor: align ALDO specifications with DomainRepositoryLib's Specification base class"
```

---

## Self-Review

**Spec coverage:**

- 001 finding 1 (quota-aware batching) → Task 1.
- 001 finding 2 (EmailRetryService) → Task 2, "keep and wire" branch per user decision.
- 001 finding 3 (coarse import monitoring) → Task 3.
- 001 finding B (resumable/chunked GasDataImporter) → Tasks 4–5, per user decision to include now.
- 001's "typed mail failure classification" (optional/additional) → intentionally not a task; it's explicitly framed as a follow-on if quota preflight (Task 1) turns out insufficient in practice. Revisit after Task 1 ships.
- 001's "import expression transformations" (optional/additional) → intentionally not a task; report itself calls it "product scope, not current technical debt."
- 000 item 1 (LazyRef) → Task 6.
- 000 item 2 (Specs) → corrected: pushdown claim discarded as factually wrong (see Verification notes); only the type-alignment sub-option → Task 8, per user decision to include.
- 000 item 3 (RowScopeExpansion Level 1) → Task 7. Level 2 explicitly excluded, matching the report's own recommendation.
- 000 items 4–6 (AlberoCartelle, AldoTeachingResolutionConfig, formatOggi) → no task, matching the report's own "no action" verdicts, re-confirmed not stale during verification.

**Placeholder scan:** no TBD/"add error handling"/"similar to Task N" patterns found on re-read.

**Type consistency:** `ImportCheckpoint` shape is introduced once in Task 4 and reused with identical field names in Task 5. `EmailBatchCheckpoint`/`EmailBatchResumeState` in Task 1 are the pre-existing types, unchanged. `IGmailFacade.getRemainingQuota()` introduced in Task 1 is the only new facade method and isn't redefined elsewhere.
