# Email Duplicate-Send Guard and Pipeline Instance Reuse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Add a `LOG_MAIL`-backed already-sent guard to the `NotificaPipeline` so a manually re-triggered `CONF_MAIL` pattern cannot silently re-send to a recipient who already received a `SUCCESS` send, mirroring `CheckDuplicatesStep`'s role in the document pipeline. (2) Stop rebuilding the 8–10 step `Pipeline`/`Step` graph on every single target/document inside a batch run, by caching one `Pipeline` instance per service for the duration of a batch (same `jobId`).

**Architecture:** Both changes are additive and local to two existing application services (`EmailNotificationService`, `DocumentGenerationService`) and their step files (`emailSteps.ts`, `documentSteps.ts`). No new layers, no `GasLibraryFactory` extension — `PipelineFramework`'s `Pipeline`/`Step`/`PipelineContext` classes already support both: `Pipeline.execute(initialData)` (`GasLibraryFactory/PipelineFramework/src/Pipeline.js:314-319`) allocates a fresh `PipelineContext` per call and every `Step` subclass in ALDO stores only constructor-injected `private readonly` dependencies (verified for every step in `documentSteps.ts`/`emailSteps.ts`) — so one `Pipeline`/`Step` graph is safe to `.execute()` repeatedly with different seed data.

**Tech Stack:** TypeScript (GAS V8 target), Jest (`ts-jest`), `PipelineFramework` (L3, `GasLibraryFactory`), `SheetDBLib`-backed repositories (`FakeDatabase` in tests).

## Global Constraints

- Target is GAS V8: synchronous code only, no Node-specific APIs.
- Native GAS globals (`DriveApp`, `MailApp`, etc.) may only be touched inside `GoogleApiWrapper` — not touched by this plan at all.
- New/changed services and repositories must stay wired through `src/config/Bootstrap.ts` / `ServiceContainer`, never constructed ad hoc. This plan does not add new services, so no `Bootstrap.ts` changes are needed — only existing constructor call sites inside already-wired services change.
- `SheetDBLib` forbids `save()` inside a transaction — not touched by this plan (`LogEmailRepository.registraInvio` already calls `save()` outside the email pipeline's transaction-free flow, unchanged here).
- Run `npm run typecheck`, `npm run lint`, and `npx jest --config jest.config.cjs <file>` after every task; run the full `npm test` before the final commit of each feature.
- Never edit `dist/*`.
- Follow existing code idioms exactly (see per-task file references below) — do not introduce new patterns where an existing one already covers the case.

---

## Feature 1: `CheckAlreadySentStep` — LOG_MAIL-backed duplicate-send guard

### Context an implementer needs

The `NotificaPipeline` (`src/application/pipelines/emailSteps.ts`) runs 8 steps per enumerated `EmailTarget`. `ValutaCondizioniInvioStep` (step 2) is the **first** step to set the `shouldSend` context key — it does so unconditionally (`this.setResult(ctx, 'shouldSend', ...)`, no gate). Every step after it **narrows** `shouldSend` by ANDing onto the existing value (see `RenderBoxesStep._executeLogic`, `emailSteps.ts:284-289`: `ctx.get('shouldSend') === true && (...)`) and gates its own execution on `sendGate = (ctx) => ctx.get('shouldSend') === true` (`emailSteps.ts:87`).

This matters for placement: a new step that sets `shouldSend` **before** `ValutaCondizioniInvioStep` would have its value silently overwritten (step 2 sets it unconditionally, it doesn't AND). So `CheckAlreadySentStep` must run **after** `ValutaCondizioniInvioStep`, following the same AND-onto-`shouldSend` idiom as every other gated step. This is the one placement that is both correct (doesn't get clobbered) and consistent with the rest of the file — it lands as the new step 3, immediately before `RenderBoxesStep`. The identity check itself only needs `config` (for `CONF_MAIL.ID`) and `emailTarget` (for `emailTargetId()`) — both available from pipeline seed data — so it does not need to wait on `cdu`, but structurally it still can't run before step 2 without breaking the `shouldSend` chain, and step 2 itself already requires `cdu`. Net effect: this still skips the expensive steps (`RenderBoxesStep` template rendering, `ComposeEmailStep`, `ResolveRecipientsStep`, `SendEmailStep`'s Gmail calls, `LogEmailStep`, `PostProcessEmailStep`) for an already-sent target — the CDU build and CONDIZIONE eval still run, which is an acceptable, correctness-first trade-off.

Identity match: `LogEmail.getAllegati()` (`src/domain/entities/LogEmail.ts:54-58`) parses the `ALLEGATI` JSON column, which `LogEmailStep` already populates with `logicalTargetId: emailTargetId(target(ctx))` (`emailSteps.ts:588`). `emailTargetId()` (`src/application/email/saluto.ts:42-47`) is the "stable pre-routing identity" already used for retry seams — reusing it here for the already-sent check keeps one identity concept for both features instead of inventing a second one. A send only counts as "already sent" when `LogEmail.stato === StatoEmail.SUCCESS`; an `ERROR` row must **not** block a retry.

`ILogEmailRepository` (`src/domain/repositories/ILogEmailRepository.ts`) currently declares only `findFailed`, `marcaSuccesso`, `registraInvio`. The concrete `LogEmailRepository` (`src/infrastructure/repositories/LogEmailRepository.ts:21-28`) already implements `findByPattern(patternId): LogEmail[]` (with an indexed lookup on `COL_LOG_MAIL.PATTERN`) — it's just missing from the interface. `LogEmailRepository` is the only class implementing `ILogEmailRepository` in the whole repo (verified via grep), so adding this method to the interface is a zero-risk signature-only change.

Duplicate-send policy is opt-in-to-bypass, mirroring `CONF_DOC.DUPLICAZIONE` (`src/domain/value-objects/enums.ts:7-10`, `DuplicazioneDocumento.PERMESSA | NEGATA`, consumed directly off the raw config row by `CheckDuplicatesStep` at `src/application/pipelines/documentSteps.ts:163-166` — note `ConfigurazioneDocumento` the entity does **not** have a `duplicazione` getter, the step reads the raw `Row` directly). `CheckAlreadySentStep` follows the exact same pattern: read `CONF_MAIL.DUPLICAZIONE` off the raw `Row` via a new `COL_CONF_MAIL.DUPLICAZIONE` column, reusing the existing `DuplicazioneDocumento` enum (its values, `PERMESSA`/`NEGATA`, are generic — not document-specific — so reuse avoids a duplicate enum for an identical concept). Default (column absent) is `NEGATA`, i.e. duplicates blocked by default, matching the proposal's "default=FALSE" and `CONF_DOC`'s existing default.

### Task 1.1: Add `CONF_MAIL.DUPLICAZIONE` schema column

**Files:**

- Modify: `src/config/schema.ts:34-47` (`COL_CONF_MAIL`)
- Test: none (pure constant addition, exercised indirectly by Task 1.3/1.4 tests)

**Interfaces:**

- Produces: `COL_CONF_MAIL.DUPLICAZIONE === 'DUPLICAZIONE'`, consumed by Task 1.3.

- [ ] **Step 1: Add the column constant**

In `src/config/schema.ts`, add `DUPLICAZIONE: 'DUPLICAZIONE'` to `COL_CONF_MAIL`:

```typescript
export const COL_CONF_MAIL = {
  ID: 'ID',
  OGGETTO: 'OGGETTO',
  PROCESSO: 'PROCESSO',
  BOX_CFG: 'BOX_CFG',
  TESTO: 'TESTO',
  SUPPLENTI: 'SUPPLENTI',
  NOREPLY: 'NOREPLY',
  COLORE_HEADER: 'COLORE_HEADER',
  CONDIZIONE: 'CONDIZIONE',
  POST_PROCESSO: 'POST_PROCESSO',
  ALLEGATI: 'ALLEGATI',
  GESTIONE_ARTICOLAZIONE: 'GESTIONE_ARTICOLAZIONE',
  DUPLICAZIONE: 'DUPLICAZIONE'
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (pure additive constant, nothing consumes it yet).

- [ ] **Step 3: Commit**

```bash
git add src/config/schema.ts
git commit -m "feat: add CONF_MAIL.DUPLICAZIONE schema column"
```

### Task 1.2: Add `findByPattern` to `ILogEmailRepository`

**Files:**

- Modify: `src/domain/repositories/ILogEmailRepository.ts`
- Test: none (interface-only change; `LogEmailRepository` already implements the method, exercised by Task 1.3/1.4 tests)

**Interfaces:**

- Produces: `ILogEmailRepository.findByPattern(patternId: string): LogEmail[]`, consumed by Task 1.3's `CheckAlreadySentStep`.

- [ ] **Step 1: Add the method to the interface**

```typescript
import type { LogEmail } from '../entities/LogEmail';
import type { Email } from '../value-objects/Email';
import type { StatoEmail } from '../value-objects/enums';

export interface ILogEmailRepository {
  findFailed(): LogEmail[];
  /** Every LOG_MAIL row for a pattern, across all destinatari/dates (composite-PK table, ref 06 §19). */
  findByPattern(patternId: string): LogEmail[];
  /** Flips an existing record to SUCCESS via the composite-key write seam (ref 11 §16). */
  marcaSuccesso(log: LogEmail): void;
  /** Appends a send record with DESTINATARI as CSV and DATA = now (ref 06 §19). */
  registraInvio(
    patternId: string,
    destinatari: Email[],
    stato: StatoEmail,
    corpoHtml: string,
    allegati?: Record<string, unknown>,
    errore?: string
  ): LogEmail;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `LogEmailRepository` already has a compatible `findByPattern(patternId: string): LogEmail[]` method (`src/infrastructure/repositories/LogEmailRepository.ts:21-28`), so it now satisfies the widened interface with no changes.

- [ ] **Step 3: Commit**

```bash
git add src/domain/repositories/ILogEmailRepository.ts
git commit -m "feat: expose findByPattern on ILogEmailRepository"
```

### Task 1.3: `CheckAlreadySentStep` — pipeline step + wiring

**Files:**

- Modify: `src/application/pipelines/emailSteps.ts` (new step class, after `ValutaCondizioniInvioStep`, before `RenderBoxesStep`)
- Modify: `src/application/services/EmailNotificationService.ts:224-251` (`buildPipeline`)
- Test: `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**

- Consumes: `ctx.get('config')` (`Row`), `ctx.get('emailTarget')` (`EmailTarget`), `ctx.get('shouldSend')` (set by `ValutaCondizioniInvioStep`); `ILogEmailRepository.findByPattern` (Task 1.2); `emailTargetId(target: EmailTarget): string` (`src/application/email/saluto.ts:42`, already imported in `emailSteps.ts`); `COL_CONF_MAIL.DUPLICAZIONE` (Task 1.1); `DuplicazioneDocumento` enum (`src/domain/value-objects/enums.ts:7-10`).
- Produces: on match, `ctx.set('shouldSend', false)` and `ctx.set('skipReason', <string>)`, consumed by every later step's `sendGate` and by `EmailNotificationService.sendPattern`'s `result.skipped` counter (`EmailNotificationService.ts:164-166`).

- [ ] **Step 1: Write the failing pipeline-level tests**

Add to `test/unit/application/pipelines/email-steps.test.ts`. First add the import (alongside the existing step imports near the top of the file):

```typescript
import {
  BuildCDUStep,
  ValutaCondizioniInvioStep,
  CheckAlreadySentStep,
  RenderBoxesStep,
  ComposeEmailStep,
  ResolveRecipientsStep,
  SendEmailStep,
  LogEmailStep,
  PostProcessEmailStep
} from '../../../../src/application/pipelines/emailSteps';
import { Email } from '../../../../src/domain/value-objects/Email';
import { StatoEmail } from '../../../../src/domain/value-objects/enums';
import { emailTargetId } from '../../../../src/application/email/saluto';
```

`LogEmailRepository`, `composeContextBuilder`, `MasterSheetRepository`, `AldoTeachingAssignmentResolver`, and `ExpressionEngineFacade` are already imported in this file (verified: `LogEmailRepository` at line 27, the rest at lines 14/19/25/26) — only `CheckAlreadySentStep` (add to the existing step-import block), `Email`, `StatoEmail`, and `emailTargetId` are new.

Then add a new `describe` block at the end of the file:

```typescript
describe('CheckAlreadySentStep', () => {
  // docenteTarget() (declared earlier in this file) needs PROCESSO: 'PER_DOCENTE' —
  // see the existing usages at email-steps.test.ts:357/372/381 for the same pairing.
  function ctxAfterCondizioni(
    overrides: Partial<Record<string, unknown>> = {},
    target: EmailTarget = docenteTarget()
  ) {
    const { db, ctx, docenti, alunni } = wire({ PROCESSO: 'PER_DOCENTE', ...overrides }, target);
    new BuildCDUStep(
      logger,
      composeContextBuilder(
        db,
        new MasterSheetRepository(db),
        new AldoTeachingAssignmentResolver(db)
      ),
      docenti,
      alunni
    ).execute(ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(ctx);
    return { db, ctx };
  }

  test('no matching LOG_MAIL row leaves shouldSend true', () => {
    const { db, ctx } = ctxAfterCondizioni();
    const result = new CheckAlreadySentStep(logger, new LogEmailRepository(db)).execute(ctx);
    expect(ctx.get('shouldSend')).toBe(true);
    expect(logDetails(result)).toBe('Not already sent');
  });

  test('a prior SUCCESS row with matching pattern + logical target id blocks the resend', () => {
    const target = docenteTarget();
    const { db, ctx } = ctxAfterCondizioni({}, target);
    const logMail = new LogEmailRepository(db);
    logMail.registraInvio(
      'TEST_PATTERN',
      [Email.of('rossi@school.it')],
      StatoEmail.SUCCESS,
      '<p>x</p>',
      { logicalTargetId: emailTargetId(target) }
    );

    const result = new CheckAlreadySentStep(logger, logMail).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(false);
    expect(ctx.get('skipReason')).toContain('TEST_PATTERN');
    expect(logDetails(result)).toBe(ctx.get('skipReason'));
  });

  test('a prior ERROR row for the same identity does not block the resend', () => {
    const target = docenteTarget();
    const { db, ctx } = ctxAfterCondizioni({}, target);
    const logMail = new LogEmailRepository(db);
    logMail.registraInvio(
      'TEST_PATTERN',
      [Email.of('rossi@school.it')],
      StatoEmail.ERROR,
      '<p>x</p>',
      { logicalTargetId: emailTargetId(target) },
      'errore di invio'
    );

    new CheckAlreadySentStep(logger, logMail).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(true);
  });

  test('a matching pattern but different logical target id does not block the resend', () => {
    const target = docenteTarget();
    const { db, ctx } = ctxAfterCondizioni({}, target);
    const logMail = new LogEmailRepository(db);
    logMail.registraInvio(
      'TEST_PATTERN',
      [Email.of('someone.else@school.it')],
      StatoEmail.SUCCESS,
      '<p>x</p>',
      { logicalTargetId: 'docente:someone.else@school.it' }
    );

    new CheckAlreadySentStep(logger, logMail).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(true);
  });

  test('DUPLICAZIONE PERMESSA bypasses the check even with a matching SUCCESS row', () => {
    const target = docenteTarget();
    const { db, ctx } = ctxAfterCondizioni({ DUPLICAZIONE: 'PERMESSA' }, target);
    const logMail = new LogEmailRepository(db);
    logMail.registraInvio(
      'TEST_PATTERN',
      [Email.of('rossi@school.it')],
      StatoEmail.SUCCESS,
      '<p>x</p>',
      { logicalTargetId: emailTargetId(target) }
    );

    const result = new CheckAlreadySentStep(logger, logMail).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(true);
    expect(logDetails(result)).toBe('Duplicates allowed');
  });
});
```

Check whether `logDetails(...)` and `MasterSheetRepository`/`AldoTeachingAssignmentResolver`/`ExpressionEngineFacade`/`composeContextBuilder` are already imported/defined in this test file (they are used by the existing `BuildCDUStep`/`ValutaCondizioniInvioStep` tests) — reuse those, don't re-declare.

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "CheckAlreadySentStep"`
Expected: FAIL — `CheckAlreadySentStep` is not exported yet.

- [ ] **Step 3: Implement `CheckAlreadySentStep`**

In `src/application/pipelines/emailSteps.ts`, add this class after `ValutaCondizioniInvioStep` (after the closing brace at the current line ~241) and before the `RenderBoxesStep` doc comment:

```typescript
/** Step 3 (new): CONF_MAIL.DUPLICAZIONE-gated guard against re-sending to a target already SUCCESS-logged for this pattern. */
export class CheckAlreadySentStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly logMail: ILogEmailRepository
  ) {
    super('CheckAlreadySent', logger, {
      shouldExecuteCondition: sendGate,
      requiredKeys: ['config', 'emailTarget']
    });
  }

  protected _executeLogic(ctx: PipelineContext): void {
    const duplicazione = String(
      cfg(ctx)[COL_CONF_MAIL.DUPLICAZIONE] ?? DuplicazioneDocumento.NEGATA
    );
    if (duplicazione === 'PERMESSA') return;

    const patternId = String(cfg(ctx)[COL_CONF_MAIL.ID]);
    const logicalTargetId = emailTargetId(target(ctx));
    const alreadySent = this.logMail
      .findByPattern(patternId)
      .some(
        (log) =>
          log.stato === StatoEmail.SUCCESS &&
          log.getAllegati()['logicalTargetId'] === logicalTargetId
      );
    if (alreadySent) {
      this.setResult(ctx, 'shouldSend', false);
      this.setResult(
        ctx,
        'skipReason',
        `Già inviato: PATTERN=${patternId}, TARGET=${logicalTargetId}`
      );
    }
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return ctx.get('shouldSend') === false
      ? String(ctx.get('skipReason') ?? '')
      : String(cfg(ctx)[COL_CONF_MAIL.DUPLICAZIONE] ?? DuplicazioneDocumento.NEGATA) === 'PERMESSA'
        ? 'Duplicates allowed'
        : 'Not already sent';
  }
}
```

Add the two new imports at the top of `emailSteps.ts` (next to the existing `enums`/`schema` imports):

```typescript
import { COL_CONF_MAIL } from '../../config/schema';
import { ProcessoInvio, StatoEmail, DuplicazioneDocumento } from '../../domain/value-objects/enums';
```

(`COL_CONF_MAIL`, `ProcessoInvio`, `StatoEmail` are already imported — only add `DuplicazioneDocumento` to that existing line.)

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "CheckAlreadySentStep"`
Expected: PASS (all 5 new tests).

- [ ] **Step 5: Wire the step into `EmailNotificationService.buildPipeline`**

In `src/application/services/EmailNotificationService.ts`, add the import (next to the existing step import block, lines 18-27):

```typescript
import {
  BuildCDUStep,
  ValutaCondizioniInvioStep,
  CheckAlreadySentStep,
  RenderBoxesStep,
  ComposeEmailStep,
  ResolveRecipientsStep,
  SendEmailStep,
  LogEmailStep,
  PostProcessEmailStep
} from '../pipelines/emailSteps';
```

Insert the step into `buildPipeline` (lines 224-251), between `ValutaCondizioniInvioStep` and `RenderBoxesStep`:

```typescript
  private buildPipeline(jobId?: string): Pipeline {
    const d = this.deps;
    const pipeline = new Pipeline(this.logger, null, {
      name: 'NotificaPipeline',
      stopOnError: false,
      logPosition: { depth: 1, isLast: false, ancestorHasNext: [] }
    })
      .addStep(new BuildCDUStep(this.logger, d.contextBuilder, d.docenti, d.alunni))
      .addStep(new ValutaCondizioniInvioStep(this.logger, d.expressionEngine))
      .addStep(new CheckAlreadySentStep(this.logger, d.logMail))
      .addStep(new RenderBoxesStep(this.logger, d.materie, d.templates, d.aggregatoreDati))
      .addStep(new ComposeEmailStep(this.logger, d.templates, d.logDocs, d.drive))
      .addStep(new ResolveRecipientsStep(this.logger, d.docenti, d.classi, d.teachingAssignments))
      .addStep(new SendEmailStep(this.logger, d.gmail, d.master))
      .addStep(new LogEmailStep(this.logger, d.logMail))
      .addStep(new PostProcessEmailStep(this.logger, d.db, d.templates));
```

(The rest of `buildPipeline` — the `monitor`/`jobId` telemetry hooks and `return pipeline;` — is unchanged.)

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Run the full pipeline test file**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS — including every pre-existing test in the file (the new step is a no-op for every scenario that doesn't seed a matching `SUCCESS` `LOG_MAIL` row, since `findByPattern` returns `[]` for a pattern with no log history).

- [ ] **Step 8: Commit**

```bash
git add src/application/pipelines/emailSteps.ts src/application/services/EmailNotificationService.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "feat: guard NotificaPipeline against re-sending to an already-SUCCESS target"
```

### Task 1.4: Service-level regression test — `sendPattern` skips an already-sent target

**Files:**

- Modify: `test/unit/application/email-notification-service.test.ts`

**Interfaces:**

- Consumes: `EmailNotificationService.sendPattern(patternId, options?): SendPatternResult` (unchanged signature, `EmailNotificationService.ts:137-172`); `LogEmailRepository.registraInvio` (existing); `emailTargetId` (existing).

- [ ] **Step 1: Write the failing test**

Add to `test/unit/application/email-notification-service.test.ts` (near the other `sendPattern` tests):

```typescript
test('sendPattern skips a target already SUCCESS-logged for this pattern, and still sends the rest', () => {
  const { db, gmail, service } = wire([mailRow('DEDUPE_TEST', { PROCESSO: 'PER_CDC' })]);
  const targets = service.enumerateTargets(conf('PER_CDC'));
  expect(targets.length).toBeGreaterThan(0);
  const alreadySentTarget = targets[0]!;
  new LogEmailRepository(db).registraInvio(
    'DEDUPE_TEST',
    alreadySentTarget.emails.map((e) => Email.of(e)),
    StatoEmail.SUCCESS,
    '<p>x</p>',
    { logicalTargetId: emailTargetId(alreadySentTarget) }
  );

  const result = service.sendPattern('DEDUPE_TEST');

  expect(result.skipped).toBeGreaterThanOrEqual(1);
  expect(result.targets).toBe(targets.length);
  expect(gmail.sent).toHaveLength(targets.length - 1);
});
```

Add the missing imports at the top of the file if not already present:

```typescript
import { Email } from '../../../src/domain/value-objects/Email';
import { StatoEmail } from '../../../src/domain/value-objects/enums';
import { emailTargetId } from '../../../src/application/email/saluto';
```

`FakeGmailFacade.sent` (`test/fakes/FakeGmailFacade.ts:9`) is a public `EmailSendOptions[]` — one entry per successful `sendEmail` call, which is what this assertion counts.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "sendPattern skips a target already SUCCESS-logged"`
Expected: FAIL (this test targets behavior Task 1.3 already implements at the pipeline level — if Task 1.3 was completed first, this may already PASS; if so, skip straight to Step 3 and just confirm green, no implementation step needed here).

- [ ] **Step 3: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "sendPattern skips a target already SUCCESS-logged"`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add test/unit/application/email-notification-service.test.ts
git commit -m "test: cover sendPattern already-sent skip at the service level"
```

---

## Feature 2: Reuse one `Pipeline` instance per batch run

### Context an implementer needs

`EmailNotificationService.sendPattern` (loop at `EmailNotificationService.ts:156-170`) and `sendToTarget` (`EmailNotificationService.ts:178-214`, called once per target from `EmailBatchService`'s batch loop at `src/application/services/EmailBatchService.ts:183`) both call `this.buildPipeline(jobId).execute(...)` — a **new** `Pipeline` with 9 freshly-`new`'d `Step` instances — on every single target. Likewise `DocumentGenerationService.generateForClasseWithRecipe` / `generateForDipartimento` / `generateForAlunnoWithRecipe` (`DocumentGenerationService.ts:164,213,289`) each call `this.buildPipeline(jobId).execute(...)`, and `DocumentBatchService` calls these once per document from its batch loops (e.g. `generateForPiano` at `DocumentBatchService.ts:161`, `generateForClasseDocenteMateria` at line 294, `generateForDipartimento` at line 366) — all passing the **same `jobId` string for the whole batch**.

Verified safe to cache and reuse across `.execute()` calls:

- `Pipeline.execute(initialData)` (`GasLibraryFactory/PipelineFramework/src/Pipeline.js:314-319`) does `const context = new PipelineContext(initialData);` — a fresh context every call. The `Pipeline` instance itself only holds `_steps` (fixed after `addStep` calls) and `_hooks` (fixed after `beforeStep`/`afterStep`/`onError` calls) — both set once in `buildPipeline()` and never mutated by `execute()`.
- Every `Step` subclass constructor in `documentSteps.ts` and `emailSteps.ts` only assigns `private readonly` fields from constructor parameters (dependencies) — no field is written by `_executeLogic`. `_executeLogic(ctx)` reads/writes exclusively through the passed-in `PipelineContext`.
- Conclusion: one `Pipeline` (with its `Step`s) built for a given `jobId` produces identical, independent results across repeated `.execute()` calls with different seed data — reuse changes only allocation cost, not behavior.

The only per-call variability inside `buildPipeline()` is the `monitor`/`jobId` telemetry hooks (`EmailNotificationService.ts:242-248`, `DocumentGenerationService.ts:348-356`) and `DocumentGenerationService`'s `pipeline.onError(...)` (`DocumentGenerationService.ts:340-346`) — both are registered from `this.monitor`/`this.drive`/`this.logger` (service-level fields, not call-parameters) and both reference `step`/`ctx`/`error`/`result` only via their callback arguments at invocation time, never captured by value at construction time. So they behave identically regardless of which call to `buildPipeline()` created them, which is exactly why keying the cache on `jobId` (the one parameter that actually changes what gets wired) is correct: a different `jobId` needs a different set of telemetry hooks; the same `jobId` never does.

### Task 2.1: Cache the pipeline in `EmailNotificationService`

**Files:**

- Modify: `src/application/services/EmailNotificationService.ts`
- Test: `test/unit/application/email-notification-service.test.ts`

**Interfaces:**

- Consumes: existing `buildPipeline(jobId?: string): Pipeline` (unchanged body).
- Produces: new private `getPipeline(jobId?: string): Pipeline`, used internally by `sendPattern`/`sendToTarget` in place of `this.buildPipeline(jobId)`. No public signature changes.

- [ ] **Step 1: Write the failing test**

Add to `test/unit/application/email-notification-service.test.ts`:

```typescript
test('sendPattern reuses the same Pipeline instance across all targets in one call', () => {
  const { service } = wire([mailRow('REUSE_TEST', { PROCESSO: 'PER_CDC' })]);
  const targets = service.enumerateTargets(conf('PER_CDC'));
  expect(targets.length).toBeGreaterThan(1); // needs 2+ targets to prove reuse, not just "built once"

  const seen: Pipeline[] = [];
  const originalBuildPipeline = (
    service as unknown as { buildPipeline: (jobId?: string) => Pipeline }
  ).buildPipeline.bind(service);
  (service as unknown as { buildPipeline: (jobId?: string) => Pipeline }).buildPipeline = (
    jobId?: string
  ) => {
    const p = originalBuildPipeline(jobId);
    seen.push(p);
    return p;
  };

  service.sendPattern('REUSE_TEST');

  expect(seen).toHaveLength(1);
});
```

If the codebase's lint rules reject monkey-patching a private method via cast (check `npm run lint` output after writing this), replace the spy approach with a simpler assertion instead: call `sendPattern` twice via a small subclass that exposes a call counter. Use whichever approach passes lint — the important behavior being tested is "buildPipeline is invoked at most once per `sendPattern` call regardless of target count."

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "reuses the same Pipeline instance"`
Expected: FAIL — `seen` has one entry per target (`buildPipeline` currently called once per loop iteration).

- [ ] **Step 3: Implement the cache**

In `src/application/services/EmailNotificationService.ts`, add two private fields near the existing `testEmail`/`projector` fields (around line 112-113):

```typescript
  private testEmail: string | null = null;
  private readonly projector = new CollectionProjector({ logger: new LoggerService() });
  private cachedPipeline: Pipeline | undefined;
  private cachedPipelineJobId: string | undefined;
```

Add a new private method right before `buildPipeline` (around line 223):

```typescript
  /** Reuses one Pipeline (and its Steps) across every target of a batch run — see plan doc for the safety argument. */
  private getPipeline(jobId?: string): Pipeline {
    if (this.cachedPipeline === undefined || this.cachedPipelineJobId !== jobId) {
      this.cachedPipeline = this.buildPipeline(jobId);
      this.cachedPipelineJobId = jobId;
    }
    return this.cachedPipeline;
  }
```

Replace the two `this.buildPipeline(...)` call sites with `this.getPipeline(...)`:

In `sendPattern` (line 157):

```typescript
      const ctx = this.getPipeline().execute({
```

In `sendToTarget` (line 189):

```typescript
    const ctx = this.getPipeline(jobId).execute({
```

`buildPipeline` itself is unchanged — it stays the single place that constructs a `Pipeline`, `getPipeline` is purely a cache in front of it.

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "reuses the same Pipeline instance"`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Run the full email-notification-service test file**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: PASS — including the `sendToTarget`-driven scenarios and the Feature 1 test from Task 1.4 (which calls `sendPattern` once, so the cache is exercised transparently).

- [ ] **Step 7: Commit**

```bash
git add src/application/services/EmailNotificationService.ts test/unit/application/email-notification-service.test.ts
git commit -m "perf: reuse one NotificaPipeline instance per batch instead of rebuilding per target"
```

### Task 2.2: Cache the pipeline in `DocumentGenerationService`

**Files:**

- Modify: `src/application/services/DocumentGenerationService.ts`
- Test: `test/unit/application/pipelines/document-steps.test.ts` or a new focused test — check which file already covers `DocumentGenerationService` directly (search for `new DocumentGenerationService(` under `test/unit/`) and add to that file instead if one exists.

**Interfaces:**

- Consumes: existing `buildPipeline(jobId?: string): Pipeline` (unchanged body).
- Produces: new private `getPipeline(jobId?: string): Pipeline`, used internally by `generateForClasseWithRecipe`/`generateForDipartimento`/`generateForAlunnoWithRecipe` in place of `this.buildPipeline(jobId)`. No public signature changes.

- [ ] **Step 1: Locate the existing `DocumentGenerationService` test file**

Run: `grep -rl "new DocumentGenerationService(" test/unit/`

Use the file(s) found for the test in the next step. If none is found, create `test/unit/application/document-generation-service.test.ts` following the same `fullDeps`/`wire`-style helper pattern used in `test/unit/application/email-notification-service.test.ts` (Task 1.4's context has the full pattern) — wire a real `FakeDatabase` + `fixtureTables()` + the constructor's `DocumentGenerationDeps`.

- [ ] **Step 2: Write the failing test**

Add a test asserting `buildPipeline` is invoked at most once across two sequential single-document generation calls that share a `jobId` — same reuse assertion shape as Task 2.1 Step 1, adapted to whichever call this service exposes repeatedly (e.g. two calls to `generateForClasseDocenteMateria` with the same `jobId`, since that's the one already called in a loop by `DocumentBatchService.generateDocentiMateria`). Write the concrete test against the actual constructor/fixture shape found in Step 1 — mirror the structure of Task 2.1's test exactly (spy or subclass counter on `buildPipeline`, call the batch-relevant method twice with the same `jobId`, assert the pipeline was built once).

- [ ] **Step 3: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs <file found/created in Step 1> -t "reuses the same Pipeline instance"`
Expected: FAIL.

- [ ] **Step 4: Implement the cache**

In `src/application/services/DocumentGenerationService.ts`, add two private fields near the existing dependency fields (after `private readonly logger: LoggerService;`, around line 83):

```typescript
  private readonly logger: LoggerService;
  private cachedPipeline: Pipeline | undefined;
  private cachedPipelineJobId: string | undefined;
```

Add a new private method right before `buildPipeline` (around line 316-321):

```typescript
  /** Reuses one Pipeline (and its Steps) across every document of a batch run — see plan doc for the safety argument. */
  private getPipeline(jobId?: string): Pipeline {
    if (this.cachedPipeline === undefined || this.cachedPipelineJobId !== jobId) {
      this.cachedPipeline = this.buildPipeline(jobId);
      this.cachedPipelineJobId = jobId;
    }
    return this.cachedPipeline;
  }
```

Replace all three `this.buildPipeline(jobId)` call sites (lines 164, 213, 289) with `this.getPipeline(jobId)`:

```typescript
ctx = this.getPipeline(jobId).execute({ config: row, confDoc: config, cdu });
```

(Same replacement text at all three call sites — `generateForClasseWithRecipe`, `generateForDipartimento`, `generateForAlunnoWithRecipe`.) `buildPipeline` itself, including its `onError` rollback hook and monitor telemetry hooks, is unchanged.

- [ ] **Step 5: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs <file found/created in Step 1> -t "reuses the same Pipeline instance"`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions — in particular re-run any test exercising the `CRITICAL_STEPS` rollback path (`DocumentGenerationService.ts:340-346`, the orphan-file-delete `onError` hook) to confirm rollback behavior is unaffected by pipeline reuse across a batch (the hook only reads `ctx`/`step`/`error` passed at invocation time, so this should already be covered by existing tests without changes — just confirm they still pass).

- [ ] **Step 8: Commit**

```bash
git add src/application/services/DocumentGenerationService.ts test/unit/application/*.test.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "perf: reuse one DocumentoPipeline instance per batch instead of rebuilding per document"
```

---

## Final Verification

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 2: Build sanity**

Run: `npm run build:testing`
Expected: PASS (confirms nothing in the new step/cache code breaks the webpack bundle for GAS).
