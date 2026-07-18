# piani_pers boxes + PER_CARENZA* recipient groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new `CONF_MAIL.BOX_CFG` box types (`piani_pers_da_inviare`/`piani_pers_inviati`, personalized-plan document lists with default historical enrichment) and split `ProcessoInvio.PER_CARENZA` into three recipient groups with real CC support, fixing two pre-existing gaps (`LOG_DOCS.UTENTI` never populated, `includiStorico` never wired through the email pipeline) that would otherwise leave the new boxes empty.

**Architecture:** Two CDU-level providers (alunno-scoped and classe-scoped) feed a shared box renderer, mirroring the existing `documenti`/`cartelle` pattern but on an independent `pianiPersonalizzati` CDU field so existing box behavior is untouched. Recipient-group changes are additive to `EmailNotificationService.enumerateTargets` plus new `cc` plumbing threaded from `EmailTarget` down to `GmailServiceFacade`.

**Tech Stack:** TypeScript (GAS V8 target), Jest (`ts-jest`), GasLibraryFactory L0-L4 libraries (`PipelineFramework`, `ComposableContentLib`, `ContextEngine`), `SheetDBLib`-backed `FakeDatabase` test doubles.

## Global Constraints

- Native GAS service globals only inside `GoogleApiWrapper` — none of this work touches them directly.
- Never edit `dist/*`.
- New services/providers are wired in `ContextEngineFactory`/`Bootstrap.ts`/`ServiceContainer`, never constructed ad hoc.
- Full spec: `docs/superpowers/specs/2026-07-18-piani-pers-boxes-carenza-groups-design.md`.
- Run `npx jest --config jest.config.cjs <file>` after every task; run `npm run typecheck` and `npm run lint` before the final commit of each task.

---

### Task 1: Rename `PER_CARENZA` → `PER_CARENZA_GENITORI`, add two new `ProcessoInvio` values

**Files:**
- Modify: `src/domain/value-objects/enums.ts:63-70`
- Modify: `src/application/pipelines/emailSteps.ts:49-56`
- Modify: `src/application/services/EmailNotificationService.ts:265,366` (line 366 is a log message, not the switch — update in this task since it's a one-line string, the switch case itself is done in Task 4)
- Modify: `src/application/email/saluto.ts:20` (comment only)
- Modify: `src/application/context-engine/providers/CarenzaFocusProvider.ts:9` (comment only)
- Modify: `src/application/context-engine/Recipe.ts:37` (comment only)
- Modify: `src/application/services/EmailBatchService.ts:35` (comment only)
- Modify: `test/fixtures/tables.ts:206`
- Modify: `test/unit/application/email-notification-service.test.ts:145,147,169,501,524`
- Modify: `test/unit/application/pipelines/email-steps.test.ts:140-141,435,457,811`
- Modify: `test/integration/notifica-email.test.ts:23`
- Modify: `FAKEDB/CONF_MAIL.csv:6`
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md:336`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md:261`

This is a pure mechanical rename plus two new additive enum members — no new runtime behavior yet (Task 4 wires the two new values into `enumerateTargets`). Every occurrence above was found via `search_code`/`search_graph` on `home-giulio-Desktop-ALDO-implementing` (not grep alone) — this is the exhaustive list.

**Interfaces:**
- Produces: `ProcessoInvio.PER_CARENZA_GENITORI`, `ProcessoInvio.PER_CARENZA_GENITORI_E_ALUNNO`, `ProcessoInvio.PER_CARENZA_GENITORI_E_COORD` (string enum values, consumed by Tasks 4, 12)

- [ ] **Step 1: Update the enum**

In `src/domain/value-objects/enums.ts`, replace:
```ts
export enum ProcessoInvio {
  PER_COORDINATORE = 'PER_COORDINATORE',
  PER_DOCENTE = 'PER_DOCENTE',
  PER_CDC = 'PER_CDC',
  PER_ALUNNO = 'PER_ALUNNO',
  PER_GENITORI_ALUNNO = 'PER_GENITORI_ALUNNO',
  PER_CARENZA = 'PER_CARENZA'
}
```
with:
```ts
export enum ProcessoInvio {
  PER_COORDINATORE = 'PER_COORDINATORE',
  PER_DOCENTE = 'PER_DOCENTE',
  PER_CDC = 'PER_CDC',
  PER_ALUNNO = 'PER_ALUNNO',
  PER_GENITORI_ALUNNO = 'PER_GENITORI_ALUNNO',
  PER_CARENZA_GENITORI = 'PER_CARENZA_GENITORI',
  PER_CARENZA_GENITORI_E_ALUNNO = 'PER_CARENZA_GENITORI_E_ALUNNO',
  PER_CARENZA_GENITORI_E_COORD = 'PER_CARENZA_GENITORI_E_COORD'
}
```

- [ ] **Step 2: Update `RECIPE_PER_PROCESSO`**

In `src/application/pipelines/emailSteps.ts:49-56`, replace:
```ts
export const RECIPE_PER_PROCESSO: Record<ProcessoInvio, string> = {
  [ProcessoInvio.PER_COORDINATORE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_DOCENTE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_CDC]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_ALUNNO]: 'ALUNNO_COMPLETO',
  [ProcessoInvio.PER_GENITORI_ALUNNO]: 'FAMIGLIA_COMPLETO',
  [ProcessoInvio.PER_CARENZA]: 'CARENZA_COMPLETO'
};
```
with:
```ts
export const RECIPE_PER_PROCESSO: Record<ProcessoInvio, string> = {
  [ProcessoInvio.PER_COORDINATORE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_DOCENTE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_CDC]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_ALUNNO]: 'ALUNNO_COMPLETO',
  [ProcessoInvio.PER_GENITORI_ALUNNO]: 'FAMIGLIA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_ALUNNO]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_COORD]: 'CARENZA_COMPLETO'
};
```

- [ ] **Step 3: Fix the remaining literal `'PER_CARENZA'` occurrences**

In `EmailNotificationService.ts:366`, change the warn message from
`` `PER_CARENZA: alunno ${carenza.studente} non trovato — carenza saltata` ``
to
`` `CARENZA: alunno ${carenza.studente} non trovato — carenza saltata` `` (generic prefix now that three processes share this loop, wired fully in Task 4).

Update the five comment-only occurrences (`saluto.ts:20`, `CarenzaFocusProvider.ts:9`, `Recipe.ts:37`, `EmailBatchService.ts:35`) to say `PER_CARENZA_GENITORI*` or `PER_CARENZA*` instead of `PER_CARENZA`.

In `test/fixtures/tables.ts:206`, change `PROCESSO: 'PER_CARENZA',` to `PROCESSO: 'PER_CARENZA_GENITORI',` on the `CARENZE_NOTIFICA` CONF_MAIL row.

In `FAKEDB/CONF_MAIL.csv:6`, change the `PER_CARENZA` field value to `PER_CARENZA_GENITORI`.

In `SPECS_ALDO/01_SCHEMA_DATABASE.md:336`, change:
```
| `PROCESSO`      | String  | —   | Iteratore destinatari: `PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA`                                                    |
```
to:
```
| `PROCESSO`      | String  | —   | Iteratore destinatari: `PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA_GENITORI`, `PER_CARENZA_GENITORI_E_ALUNNO`, `PER_CARENZA_GENITORI_E_COORD` |
```

In `SPECS_ALDO/02_CDU_STRUTTURA.md:261`, change `Presente solo nella pipeline \`PER_CARENZA\`.` to `Presente solo nella pipeline \`PER_CARENZA_GENITORI\`/\`PER_CARENZA_GENITORI_E_ALUNNO\`/\`PER_CARENZA_GENITORI_E_COORD\`.`

- [ ] **Step 4: Rename the test occurrences**

In `test/unit/application/email-notification-service.test.ts`, rename:
- line 145: test title `'PER_CARENZA: one target per non-notified...'` → `'PER_CARENZA_GENITORI: one target per non-notified...'`
- line 147: `conf('PER_CARENZA')` → `conf('PER_CARENZA_GENITORI')`
- line 169: test title stays semantically the same, just say `PER_CARENZA_GENITORI` instead of `PER_CARENZA`
- lines 501, 524: `conf('PER_CARENZA')` → `conf('PER_CARENZA_GENITORI')`

In `test/unit/application/pipelines/email-steps.test.ts`, rename all four `wire({ PROCESSO: 'PER_CARENZA', ... })` occurrences (lines 140-141, 435, 457, 811) to `wire({ PROCESSO: 'PER_CARENZA_GENITORI', ... })`, and the test title at line 140 to say `PER_CARENZA_GENITORI`.

In `test/integration/notifica-email.test.ts:23`, rename the test title to say `PER_CARENZA_GENITORI end-to-end...`.

- [ ] **Step 5: Run the full unit + integration suites**

Run: `npm test && npm run test:integration`
Expected: PASS (pure rename, no behavior change yet)

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename PER_CARENZA to PER_CARENZA_GENITORI, add two new carenza processes"
```

---

### Task 2: Thread `cc` from `EmailTarget` down to `GmailServiceFacade`

**Files:**
- Modify: `src/infrastructure/facades/GmailServiceFacade.ts`
- Modify: `src/application/email/saluto.ts` (`EmailTarget` interface)
- Modify: `src/application/pipelines/emailSteps.ts` (`Destinazione` interface, `ResolveRecipientsStep`, `SendEmailStep`)
- Test: `test/unit/infrastructure/gmail-service-facade.test.ts` (new file)
- Test: `test/unit/application/pipelines/email-steps.test.ts` (add cases)

GasLibraryFactory's `MailService.send()` already accepts `cc` (`types/gaslibs/index.d.ts:742`, `MailSendOptions.cc?: string | string[]`) — full match, no library change needed, just expose it through ALDO's own facade interface.

**Interfaces:**
- Consumes: `MailSendOptions.cc?: string | string[]` (ambient GasLibraryFactory type, already exists)
- Produces: `EmailSendOptions.cc?: string[]`, `EmailTarget.cc?: string[]`, `Destinazione.cc?: string[]` — all consumed by Task 4 (`targetsPerCarenzaGenitoriECoord`)

- [ ] **Step 1: Write the failing facade test**

Create `test/unit/infrastructure/gmail-service-facade.test.ts`:
```ts
import { GmailServiceFacade } from '../../../src/infrastructure/facades/GmailServiceFacade';

class FakeMailService {
  public lastOpts: unknown;
  send(opts: unknown) {
    this.lastOpts = opts;
    return { success: true };
  }
}

test('GmailServiceFacade.sendEmail forwards cc to the underlying MailService', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({
    to: ['a@x.it'],
    cc: ['coord@x.it'],
    subject: 'S',
    htmlBody: '<p>B</p>'
  });
  expect((mail.lastOpts as { cc?: string[] }).cc).toEqual(['coord@x.it']);
});

test('GmailServiceFacade.sendEmail omits cc when not provided', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({ to: ['a@x.it'], subject: 'S', htmlBody: '<p>B</p>' });
  expect((mail.lastOpts as { cc?: string[] }).cc).toBeUndefined();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/gmail-service-facade.test.ts`
Expected: FAIL — `EmailSendOptions` has no `cc` property (TS error) or the assertion fails since `cc` is never forwarded.

- [ ] **Step 3: Add `cc` to `EmailSendOptions` and forward it**

In `src/infrastructure/facades/GmailServiceFacade.ts`, change:
```ts
export interface EmailSendOptions {
  to: string[];
  subject: string;
  htmlBody: string;
  bcc?: string[];
  noReply?: boolean;
  attachments?: unknown[];
}
```
to:
```ts
export interface EmailSendOptions {
  to: string[];
  subject: string;
  htmlBody: string;
  cc?: string[];
  bcc?: string[];
  noReply?: boolean;
  attachments?: unknown[];
}
```
and in `sendEmail`, after the existing `if (opts.bcc !== undefined) mailOpts.bcc = opts.bcc;` line add:
```ts
if (opts.cc !== undefined) mailOpts.cc = opts.cc;
```

- [ ] **Step 4: Run the facade test again**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/gmail-service-facade.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing pipeline test**

In `test/unit/application/pipelines/email-steps.test.ts`, near the existing SendEmailStep tests (around line 291) and ResolveRecipientsStep tests (around line 278), using the file's own `wire()`/`send()` helpers (`wire()` returns `{ db, ctx, templates, docenti, alunni }`; `send(w, gmail)` calls `new SendEmailStep(logger, gmail, new MasterSheetRepository(w.db)).execute(w.ctx)`), add:
```ts
test('SendEmailStep forwards Destinazione.cc to the Gmail facade', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'], cc: ['coord@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.cc).toEqual(['coord@x.it']);
});

test('ResolveRecipientsStep passes EmailTarget.cc through for non-docente targets', () => {
  const w = wire({}, {
    tipo: 'genitori',
    tipoTarget: 'alunno',
    target: 'a1@school.it',
    emails: ['genitore1@x.it'],
    cc: ['coord@x.it'],
    classiCompetenza: []
  });
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['genitore1@x.it'], cc: ['coord@x.it'] }]);
});
```

- [ ] **Step 6: Run to confirm both fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "cc"`
Expected: FAIL — `Destinazione`/`EmailTarget` have no `cc` field yet, and the file's local `resolve()` helper is typed `Array<{ emails: string[] }>` so the `.cc` assertion won't even compile until Step 7's `Destinazione` change lands and `resolve`'s return type is widened to `Array<{ emails: string[]; cc?: string[] }>` (update that local type alongside the `Destinazione` interface).

- [ ] **Step 7: Add `cc` to `Destinazione`/`EmailTarget` and wire it through**

In `src/application/email/saluto.ts`, add to `EmailTarget`:
```ts
  /** Cc-only addresses for the PER_CARENZA_GENITORI_E_COORD pattern (coordinatore, not part of the greeting). */
  cc?: string[];
```
(after the existing `classiCompetenza: string[];` line).

In `src/application/pipelines/emailSteps.ts`, change:
```ts
export interface Destinazione {
  emails: string[];
}
```
to:
```ts
export interface Destinazione {
  emails: string[];
  cc?: string[];
}
```

In `ResolveRecipientsStep._executeLogic`, change the non-docente branch:
```ts
    if (t.tipo !== 'docente') {
      // PER_CDC / genitori / alunno: one multi-TO message, not subject to SUPPLENTI (11 §7/§12).
      this.setResult(ctx, 'destinatariFinali', [{ emails: t.emails }] satisfies Destinazione[]);
      return;
    }
```
to:
```ts
    if (t.tipo !== 'docente') {
      // PER_CDC / genitori / alunno: one multi-TO message, not subject to SUPPLENTI (11 §7/§12).
      const dest: Destinazione = t.cc !== undefined ? { emails: t.emails, cc: t.cc } : { emails: t.emails };
      this.setResult(ctx, 'destinatariFinali', [dest] satisfies Destinazione[]);
      return;
    }
```

In `SendEmailStep._executeLogic`, after the existing `if (supervisore !== null) opts.bcc = [supervisore];` line, add:
```ts
      if (dest.cc !== undefined) opts.cc = dest.cc;
```
(inside the `for (const dest of destinazioni)` loop, before `const result = this.gmail.sendEmail(opts);`).

- [ ] **Step 8: Run the tests again**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: thread cc from EmailTarget through to GmailServiceFacade"
```

---

### Task 3: `salutoPerTarget` — `genitori_alunno` greeting case

**Files:**
- Modify: `src/application/email/saluto.ts`
- Test: `test/unit/application/email-saluto.test.ts` (existing file — has a `target(tipo, emails)` helper producing `{ tipo, tipoTarget: 'classe', target: '5A', emails, classiCompetenza: [] }`)

**Interfaces:**
- Consumes: `EmailTarget.tipo` (extended union)
- Produces: `salutoPerTarget` returns a personalized greeting for `tipo: 'genitori_alunno'`, consumed by Task 4's `targetsPerCarenzaGenitoriEAlunno`

- [ ] **Step 1: Write the failing test**

In `test/unit/application/email-saluto.test.ts`, using the file's existing `target(tipo, emails)` helper, add:
```ts
test('salutoPerTarget: genitori_alunno greets both parents and the student by name', () => {
  const a = Alunno.fromData({
    EMAIL: 'a1@school.it',
    COGNOMENOME: 'VERDI ANNA',
    CLASSE: '5A',
    ATTIVO: true
  });
  const saluto = salutoPerTarget(
    target('genitori_alunno', ['g@x.it', 'a1@school.it']),
    null,
    a
  );
  expect(saluto).toBe('Gentili Genitori e VERDI ANNA');
});

test('salutoPerTarget: genitori_alunno falls back to "Gentili Destinatari" when alunno is null', () => {
  const saluto = salutoPerTarget(target('genitori_alunno', ['g@x.it']), null, null);
  expect(saluto).toBe('Gentili Destinatari');
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-saluto.test.ts`
Expected: FAIL — `tipo: 'genitori_alunno'` is not assignable to `EmailTarget['tipo']`.

- [ ] **Step 3: Extend the type and switch**

In `src/application/email/saluto.ts`, change:
```ts
export interface EmailTarget {
  tipo: 'docente' | 'cdc' | 'alunno' | 'genitori';
```
to:
```ts
export interface EmailTarget {
  tipo: 'docente' | 'cdc' | 'alunno' | 'genitori' | 'genitori_alunno';
```

Change the `switch (target.tipo)` body from:
```ts
  switch (target.tipo) {
    case 'genitori':
      return 'Gentili Genitori';
    case 'cdc':
      return 'Gentili Docenti';
    case 'docente':
      return docente === null
        ? 'Gentili Destinatari'
        : `Gentile ${docente.getNomeCompletoConAppellativo()}`;
    case 'alunno':
      return alunno === null ? 'Gentili Destinatari' : `Gentile ${alunno.cognomeNome}`;
  }
```
to:
```ts
  switch (target.tipo) {
    case 'genitori':
      return 'Gentili Genitori';
    case 'genitori_alunno':
      return alunno === null ? 'Gentili Destinatari' : `Gentili Genitori e ${alunno.cognomeNome}`;
    case 'cdc':
      return 'Gentili Docenti';
    case 'docente':
      return docente === null
        ? 'Gentili Destinatari'
        : `Gentile ${docente.getNomeCompletoConAppellativo()}`;
    case 'alunno':
      return alunno === null ? 'Gentili Destinatari' : `Gentile ${alunno.cognomeNome}`;
  }
```

- [ ] **Step 4: Run the test again**

Run: `npx jest --config jest.config.cjs test/unit/application/email/saluto.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors, all PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add genitori_alunno greeting to salutoPerTarget"
```

---

### Task 4: `EmailNotificationService` — split `targetsPerCarenza` into three target-builders

**Files:**
- Modify: `src/application/services/EmailNotificationService.ts:246-268,358-382`
- Test: `test/unit/application/email-notification-service.test.ts`

**Interfaces:**
- Consumes: `ProcessoInvio.PER_CARENZA_GENITORI`/`_E_ALUNNO`/`_E_COORD` (Task 1), `EmailTarget.cc`/`tipo: 'genitori_alunno'` (Tasks 2-3), `IClasseRepository.getCoordinatori(classe): Docente[]` (existing)
- Produces: `EmailNotificationService.enumerateTargets` handles all three carenza processes

- [ ] **Step 1: Write the failing tests**

In `test/unit/application/email-notification-service.test.ts`, near the existing (now-renamed) `PER_CARENZA_GENITORI` test block (around line 145), add:
```ts
test('PER_CARENZA_GENITORI_E_ALUNNO: one shared target per non-notified CARENZE row, tutors + alunno', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI_E_ALUNNO'));
  expect(targets).toHaveLength(2);
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.tipo).toBe('genitori_alunno');
  expect(a1.emails.sort()).toEqual(['a1@school.it', 'genitore1@x.it']);
  expect(a1.carenzaProgressivo).toBe(1);
});

test('PER_CARENZA_GENITORI_E_COORD: parents in To, class coordinatore in Cc', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI_E_COORD'));
  expect(targets).toHaveLength(2);
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.tipo).toBe('genitori');
  expect(a1.emails).toEqual(['genitore1@x.it']);
  expect(a1.cc).toEqual(['rossi@school.it']); // 5A coordinatore (fixture)
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "PER_CARENZA_GENITORI_E"`
Expected: FAIL — `enumerateTargets` throws or returns `undefined` for the two new switch values (TS exhaustiveness error at compile time, since `enumerateTargets`'s switch is not exhaustive over the widened `ProcessoInvio`).

- [ ] **Step 3: Implement the three target-builders**

In `src/application/services/EmailNotificationService.ts`, replace the `enumerateTargets` method body:
```ts
  enumerateTargets(conf: ConfigurazioneEmail): EmailTarget[] {
    switch (conf.processo) {
      case ProcessoInvio.PER_COORDINATORE:
        return this.targetsPerCoordinatore();
      case ProcessoInvio.PER_DOCENTE:
        return this.targetsPerDocente();
      case ProcessoInvio.PER_CDC:
        return this.targetsPerCdc();
      case ProcessoInvio.PER_ALUNNO:
        return this.deps.alunni.findAttivi().map((a) => ({
          tipo: 'alunno' as const,
          tipoTarget: 'alunno' as const,
          target: a.id ?? '',
          emails: [a.id ?? ''],
          classiCompetenza: []
        }));
      case ProcessoInvio.PER_GENITORI_ALUNNO:
        return this.targetsPerGenitori();
      case ProcessoInvio.PER_CARENZA:
        return this.targetsPerCarenza();
    }
  }
```
with:
```ts
  enumerateTargets(conf: ConfigurazioneEmail): EmailTarget[] {
    switch (conf.processo) {
      case ProcessoInvio.PER_COORDINATORE:
        return this.targetsPerCoordinatore();
      case ProcessoInvio.PER_DOCENTE:
        return this.targetsPerDocente();
      case ProcessoInvio.PER_CDC:
        return this.targetsPerCdc();
      case ProcessoInvio.PER_ALUNNO:
        return this.deps.alunni.findAttivi().map((a) => ({
          tipo: 'alunno' as const,
          tipoTarget: 'alunno' as const,
          target: a.id ?? '',
          emails: [a.id ?? ''],
          classiCompetenza: []
        }));
      case ProcessoInvio.PER_GENITORI_ALUNNO:
        return this.targetsPerGenitori();
      case ProcessoInvio.PER_CARENZA_GENITORI:
        return this.targetsPerCarenza((alunno) => ({
          tipo: 'genitori' as const,
          emails: this.tutorEmailsOrFallback(alunno)
        }));
      case ProcessoInvio.PER_CARENZA_GENITORI_E_ALUNNO:
        return this.targetsPerCarenza((alunno) => ({
          tipo: 'genitori_alunno' as const,
          emails: [...alunno.getTutors().map((t) => t.value), alunno.id ?? '']
        }));
      case ProcessoInvio.PER_CARENZA_GENITORI_E_COORD:
        return this.targetsPerCarenza((alunno) => {
          const classe = this.deps.classi.findById(alunno.classeId);
          const cc =
            classe !== null
              ? this.deps.classi
                  .getCoordinatori(classe)
                  .map((d) => d.id ?? '')
                  .filter((e) => e !== '')
              : [];
          return {
            tipo: 'genitori' as const,
            emails: this.tutorEmailsOrFallback(alunno),
            ...(cc.length > 0 ? { cc } : {})
          };
        });
    }
  }

  private tutorEmailsOrFallback(alunno: Alunno): string[] {
    const tutors = alunno.getTutors().map((t) => t.value);
    return tutors.length > 0 ? tutors : [alunno.id ?? ''];
  }
```

Replace the private `targetsPerCarenza` method:
```ts
  /** One email per non-notified CARENZE row; genitore priority, alunno fallback (11 §3). */
  private targetsPerCarenza(): EmailTarget[] {
    const targets: EmailTarget[] = [];
    for (const carenza of this.deps.carenze.findNonNotificate()) {
      const alunno = this.deps.alunni.findById(carenza.studente);
      if (alunno === null) {
        this.logger.warn(
          PiiRedactor.redact(
            `CARENZA: alunno ${carenza.studente} non trovato — carenza saltata`
          )
        );
        continue;
      }
      const tutors = alunno.getTutors().map((t) => t.value);
      targets.push({
        tipo: 'genitori',
        tipoTarget: 'alunno',
        target: carenza.studente,
        emails: tutors.length > 0 ? tutors : [alunno.id ?? ''],
        classiCompetenza: [],
        carenzaProgressivo: carenza.progressivo
      });
    }
    return targets;
  }
```
with:
```ts
  /**
   * One shared-shape email per non-notified CARENZE row (11 §3): shared across
   * all three PER_CARENZA_GENITORI* processes, which differ only in recipient
   * composition (`buildRecipients`, e.g. tipo/emails/cc).
   */
  private targetsPerCarenza(
    buildRecipients: (alunno: Alunno) => { tipo: EmailTarget['tipo']; emails: string[]; cc?: string[] }
  ): EmailTarget[] {
    const targets: EmailTarget[] = [];
    for (const carenza of this.deps.carenze.findNonNotificate()) {
      const alunno = this.deps.alunni.findById(carenza.studente);
      if (alunno === null) {
        this.logger.warn(
          PiiRedactor.redact(`CARENZA: alunno ${carenza.studente} non trovato — carenza saltata`)
        );
        continue;
      }
      const { tipo, emails, cc } = buildRecipients(alunno);
      targets.push({
        tipo,
        tipoTarget: 'alunno',
        target: carenza.studente,
        emails,
        classiCompetenza: [],
        carenzaProgressivo: carenza.progressivo,
        ...(cc !== undefined ? { cc } : {})
      });
    }
    return targets;
  }
```

Add `import type { Alunno } from '../../domain/entities/Alunno';` near the top of the file (alongside the existing `import type { Classe } from '../../domain/entities/Classe';`).

- [ ] **Step 4: Run the tests again**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: PASS (all tests, including the renamed `PER_CARENZA_GENITORI` ones from Task 1 and the two new ones)

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: no errors, all PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement PER_CARENZA_GENITORI_E_ALUNNO and PER_CARENZA_GENITORI_E_COORD"
```

---

### Task 5: Fix `LOG_DOCS.UTENTI` gap in `RegisterDocumentStep`

**Files:**
- Modify: `src/application/pipelines/documentSteps.ts:277-302`
- Test: `test/unit/application/pipelines/document-steps.test.ts`

**Interfaces:**
- Consumes: `cdu(ctx).focus.alunno?.anagrafica.email` (existing `CduAlunno` field)
- Produces: `LOG_DOCS.UTENTI` populated for alunno-scoped generation — consumed by Task 8 (`PianiPersAlunnoProvider.findByUtente`)

- [ ] **Step 1: Write the failing test**

In `test/unit/application/pipelines/document-steps.test.ts`, add a helper mirroring `buildCdu` but for an alunno target, and a new test:
```ts
function buildAlunnoCdu(db: FakeDatabase): Cdu {
  return ContextEngineFactory.create(db).build(
    { target: 'a1@school.it', tipoTarget: 'alunno', now: new Date('2026-07-01T09:00:00Z') },
    recipe('ALUNNO_DETTAGLIATO')
  );
}

test('RegisterDocumentStep writes LOG_DOCS.UTENTI with the alunno email when generation is alunno-scoped', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set('cdu', buildAlunnoCdu(db));
  ctx.set('newFileId', 'file_pdp_1');
  ctx.set('newFileLink', 'https://drive/file_pdp_1');
  ctx.set('nomeFile', 'PDP_a1');
  ctx.set('destFolderPath', 'Alunni BES/5A');
  new RegisterDocumentStep(logger, db).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_pdp_1');
  expect(row?.UTENTI).toBe('a1@school.it');
});

test('RegisterDocumentStep leaves LOG_DOCS.UTENTI empty for classe-scoped generation', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db); // classe-scoped CDU (5A), per the existing baseCtx/buildCdu helper
  ctx.set('newFileId', 'file_1');
  ctx.set('newFileLink', 'https://drive/file_1');
  ctx.set('nomeFile', 'Verbale_5A');
  ctx.set('destFolderPath', 'Verbali/5');
  new RegisterDocumentStep(logger, db).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_1');
  expect(row?.UTENTI).toBe('');
});
```

- [ ] **Step 2: Run to confirm the first test fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "UTENTI"`
Expected: FAIL — `row?.UTENTI` is `undefined`, not `'a1@school.it'`.

- [ ] **Step 3: Add the field**

In `src/application/pipelines/documentSteps.ts`, change the `row` object inside `RegisterDocumentStep._executeLogic`:
```ts
    const row: Row = {
      [COL_LOG_DOCS.ID]: ctx.get<string>('newFileId')!,
      [COL_LOG_DOCS.ID_GEN]: String(cfg(ctx)[COL_CONF_DOC.ID]),
      [COL_LOG_DOCS.TIPO]: String(cfg(ctx)[COL_CONF_DOC.TIPO]),
      [COL_LOG_DOCS.NOME]: ctx.get<string>('nomeFile')!,
      [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
      [COL_LOG_DOCS.PATH]: ctx.get<string>('destFolderPath') ?? '',
      [COL_LOG_DOCS.LINK]: ctx.get<string>('newFileLink') ?? '',
      [COL_LOG_DOCS.CLASSI]: classeNome(ctx),
      [COL_LOG_DOCS.DATA_CREAZ]: cdu(ctx).meta.date.oggi.breve
    };
```
to:
```ts
    const row: Row = {
      [COL_LOG_DOCS.ID]: ctx.get<string>('newFileId')!,
      [COL_LOG_DOCS.ID_GEN]: String(cfg(ctx)[COL_CONF_DOC.ID]),
      [COL_LOG_DOCS.TIPO]: String(cfg(ctx)[COL_CONF_DOC.TIPO]),
      [COL_LOG_DOCS.NOME]: ctx.get<string>('nomeFile')!,
      [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
      [COL_LOG_DOCS.PATH]: ctx.get<string>('destFolderPath') ?? '',
      [COL_LOG_DOCS.LINK]: ctx.get<string>('newFileLink') ?? '',
      [COL_LOG_DOCS.CLASSI]: classeNome(ctx),
      [COL_LOG_DOCS.UTENTI]: cdu(ctx).focus.alunno?.anagrafica.email ?? '',
      [COL_LOG_DOCS.DATA_CREAZ]: cdu(ctx).meta.date.oggi.breve
    };
```

- [ ] **Step 4: Run both tests again**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts`
Expected: PASS (all tests, both new and pre-existing)

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors, all PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: populate LOG_DOCS.UTENTI for alunno-scoped document generation"
```

---

### Task 6: `LogDocumento.getUtenti()` + `BuildParams.classiCompetenza`

**Files:**
- Modify: `src/domain/entities/LogDocumento.ts`
- Modify: `src/application/context-engine/Recipe.ts` (`BuildParams`)
- Modify: `src/application/pipelines/emailSteps.ts` (`BuildCDUStep`)
- Test: `test/unit/domain/log-documento.test.ts` (new file — no existing LogDocumento-specific test file today)
- Test: `test/unit/application/pipelines/email-steps.test.ts`

Small, low-risk plumbing task that unblocks Task 9 (`PianiPersClasseProvider` needs both).

**Interfaces:**
- Produces: `LogDocumento.getUtenti(): string[]`, `BuildParams.classiCompetenza?: string[]`

- [ ] **Step 1: Write the failing entity test**

Create `test/unit/domain/log-documento.test.ts`:
```ts
import { LogDocumento } from '../../../../src/domain/entities/LogDocumento';

test('LogDocumento.getUtenti parses the UTENTI CSV column', () => {
  const doc = LogDocumento.fromData({ ID: 'd1', UTENTI: 'a1@school.it, a2@school.it' });
  expect(doc.getUtenti()).toEqual(['a1@school.it', 'a2@school.it']);
});

test('LogDocumento.getUtenti returns an empty array when UTENTI is unset', () => {
  const doc = LogDocumento.fromData({ ID: 'd1' });
  expect(doc.getUtenti()).toEqual([]);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/log-documento.test.ts`
Expected: FAIL — `getUtenti` does not exist on `LogDocumento`.

- [ ] **Step 3: Add `getUtenti()`**

In `src/domain/entities/LogDocumento.ts`, after the existing `getClassi()` method:
```ts
  getClassi(): string[] {
    return csv(this.raw[COL_LOG_DOCS.CLASSI]);
  }
```
add:
```ts
  getUtenti(): string[] {
    return csv(this.raw[COL_LOG_DOCS.UTENTI]);
  }
```

- [ ] **Step 4: Run the entity test again**

Run: `npx jest --config jest.config.cjs test/unit/domain/log-documento.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing `BuildCDUStep` test**

In `test/unit/application/pipelines/email-steps.test.ts`, near the existing `BuildCDUStep` tests, add (using a spy that wraps the real `ContextEngineFactory.create(w.db)` builder the file's own `buildStep()` helper constructs inline — since `wire()` doesn't expose a `contextBuilder` field, build the spy directly rather than going through `buildStep()`):
```ts
test('BuildCDUStep copies EmailTarget.classiCompetenza into BuildParams', () => {
  const w = wire(
    { PROCESSO: 'PER_COORDINATORE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['5A', '1F']
    }
  );
  const real = ContextEngineFactory.create(w.db);
  let capturedParams: BuildParams | undefined;
  const spyBuilder = {
    build: (params: BuildParams, r: Recipe) => {
      capturedParams = params;
      return real.build(params, r);
    }
  } as ContextBuilder;
  new BuildCDUStep(logger, spyBuilder, w.docenti, w.alunni).execute(w.ctx);
  expect(capturedParams?.classiCompetenza).toEqual(['5A', '1F']);
});
```
Add `import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';` and `import type { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';` to the file's existing import block.

- [ ] **Step 6: Run to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "classiCompetenza"`
Expected: FAIL — `capturedParams?.classiCompetenza` is `undefined`.

- [ ] **Step 7: Add the field and populate it**

In `src/application/context-engine/Recipe.ts`, add to `BuildParams`:
```ts
  /** Every class the email target is responsible for (11 §12) — feeds classe-wide providers like PianiPersClasseProvider. */
  classiCompetenza?: string[];
```
(after the existing `carenzaProgressivo?: number;` line).

In `src/application/pipelines/emailSteps.ts`, in `BuildCDUStep._executeLogic`, change:
```ts
    const params: BuildParams = {
      target: t.target,
      tipoTarget: t.tipoTarget,
      now: now(ctx),
      tipoOperazione: 'INVIO_EMAIL'
    };
    if (conf.id !== null) params.idConfigurazione = conf.id;
    if (t.carenzaProgressivo !== undefined) params.carenzaProgressivo = t.carenzaProgressivo;
```
to:
```ts
    const params: BuildParams = {
      target: t.target,
      tipoTarget: t.tipoTarget,
      now: now(ctx),
      tipoOperazione: 'INVIO_EMAIL'
    };
    if (conf.id !== null) params.idConfigurazione = conf.id;
    if (t.carenzaProgressivo !== undefined) params.carenzaProgressivo = t.carenzaProgressivo;
    if (t.classiCompetenza.length > 0) params.classiCompetenza = t.classiCompetenza;
```

- [ ] **Step 8: Run the test again**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors, all PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add LogDocumento.getUtenti and BuildParams.classiCompetenza"
```

---

### Task 7: CDU types — `pianiPersonalizzati` on `CduAlunno` and `CduClasse`

**Files:**
- Modify: `src/application/context-engine/Cdu.ts`

Pure type-level task, no runtime code — unblocks Tasks 8-9. No test (interfaces aren't independently testable); verified by `npm run typecheck` and by the provider tests in Tasks 8-9 compiling against these types.

**Interfaces:**
- Produces: `PianoPersonalizzatoItem`, `CduAlunno.didattica.pianiPersonalizzati`, `CduClasse.didattica.pianiPersonalizzati` — consumed by Tasks 8, 9, 10

- [ ] **Step 1: Add the shared item interface and both CDU fields**

In `src/application/context-engine/Cdu.ts`, after the `AlunnoContestoVM` interface (before `CduMeta`), add:
```ts
/** One row of `focus.alunno.didattica.pianiPersonalizzati.items` / `focus.classe.didattica.pianiPersonalizzati.items` (11 §11 new). */
export interface PianoPersonalizzatoItem {
  nome: string;
  link: string;
  tipo: string;
  sottotipo: string;
  idGen: string;
  stato: string;
  dataCreazione: string;
  notificato: boolean;
  /** Only set by the classe-scoped provider — multiple students appear in one class-wide list. */
  studente?: { nomeCompleto: string; email: string };
}
```

In the `CduClasse` interface, add a new optional `didattica` field (after the existing `studenti?:` block, before the closing `}`):
```ts
  didattica?: {
    pianiPersonalizzati: {
      items: PianoPersonalizzatoItem[];
      storico?: import('../storico/LazyRef').LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
  };
```

In the `CduAlunno` interface's `didattica` block, after the existing `documenti?:` field, add:
```ts
    pianiPersonalizzati?: {
      items: PianoPersonalizzatoItem[];
      storico?: import('../storico/LazyRef').LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this is a purely additive type change; nothing consumes these fields yet)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add pianiPersonalizzati CDU type to CduAlunno and CduClasse"
```

---

### Task 8: `PianiPersAlunnoProvider` + `PianiPersAlunnoStoricoProvider`

**Files:**
- Create: `src/application/context-engine/providers/PianiPersAlunnoProvider.ts`
- Create: `src/application/context-engine/providers/PianiPersAlunnoStoricoProvider.ts`
- Modify: `src/application/context-engine/Recipe.ts` (`RECIPES.ALUNNO_COMPLETO`, `RECIPES.FAMIGLIA_COMPLETO`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Test: `test/unit/application/context-engine/piani-pers-alunno-provider.test.ts` (new file, modeled on `documenti-storico-provider.test.ts`)

**Interfaces:**
- Consumes: `ILogDocumentoRepository.findByUtente(email): LogDocumento[]` (existing), `LogDocumento.getSottotipo()`/`isNotificato()`/`getStato()`/`getDataCreazione()`/`getLink()` (existing), `StoricoDocumentiService.perAlunnoConTipo(email, profondita)` (existing)
- Produces: `focus.alunno.didattica.pianiPersonalizzati.items`/`.storico`, recipe tokens `'pianiPersAlunno'`/`'pianiPersAlunnoStorico'`

- [ ] **Step 1: Write the failing provider test**

Create `test/unit/application/context-engine/piani-pers-alunno-provider.test.ts`:
```ts
import { PianiPersAlunnoProvider } from '../../../../src/application/context-engine/providers/PianiPersAlunnoProvider';
import { PianiPersAlunnoStoricoProvider } from '../../../../src/application/context-engine/providers/PianiPersAlunnoStoricoProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type {
  AnnoStorico,
  StoricoDatabaseProvider
} from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function tablesWithPiani(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(
    {
      ID: 'doc_pdp_1', ID_GEN: 'PDP_BES', TIPO: 'PIANO_PERS', SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/1',
      UTENTI: 'a1@school.it', DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_verbale_1', ID_GEN: 'VERBALE_CDC', TIPO: 'VERBALE', SOTTOTIPO: '',
      NOME: 'Verbale', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/v',
      UTENTI: 'a1@school.it', DATA_CREAZ: '2026-03-01'
    }
  );
  return t;
}

function build(providers: string[], databases: StoricoDatabaseProvider, options = makeOptions()) {
  const db = new FakeDatabase(tablesWithPiani());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('student', new AlunnoProvider(alunni, classi, new OreASLRepository(db)));
  b.registerProvider('pianiPersAlunno', new PianiPersAlunnoProvider(new LogDocumentoRepository(db)));
  b.registerProvider('pianiPersAlunnoStorico', new PianiPersAlunnoStoricoProvider(databases));
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = { providers, options };
  return b.build(params, recipe);
}

test('PianiPersAlunnoProvider: filters LOG_DOCS to TIPO=PIANO_PERS only, tags notificato', () => {
  const cdu = build(['class', 'student', 'pianiPersAlunno'], { anniStorici: () => [] });
  expect(cdu.focus.alunno!.didattica.pianiPersonalizzati!.items).toEqual([
    {
      nome: 'PDP a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PDP_DSA',
      idGen: 'PDP_BES', stato: 'GENERATO', dataCreazione: '2026-03-01', notificato: false
    }
  ]);
});

test('PianiPersAlunnoStoricoProvider: includiStorico false ⇒ no storico key', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = { anniStorici: () => { opened = true; return []; } };
  const cdu = build(['class', 'student', 'pianiPersAlunno', 'pianiPersAlunnoStorico'], databases);
  expect(cdu.focus.alunno!.didattica.pianiPersonalizzati!.storico).toBeUndefined();
  expect(opened).toBe(false);
});

test('PianiPersAlunnoStoricoProvider: includiStorico true attaches an unresolved LazyRef tagged by idGen', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'old_pdp', ID_GEN: 'PDP_BES', TIPO: 'PIANO_PERS', SOTTOTIPO: 'PDP_DSA',
    NOME: 'PDP a1 anno scorso', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/old',
    UTENTI: 'a1@school.it', DATA_CREAZ: '2025-03-01'
  });
  const anno: AnnoStorico = { anno: '2025-2026', db: new FakeDatabase(t) };
  const databases: StoricoDatabaseProvider = { anniStorici: () => [anno] };
  const cdu = build(
    ['class', 'student', 'pianiPersAlunno', 'pianiPersAlunnoStorico'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.pianiPersonalizzati!.storico!.get();
  expect(storico).toEqual([
    { anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old', tipo: 'PDP_BES' }
  ]);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-alunno-provider.test.ts`
Expected: FAIL — the two provider modules don't exist yet.

- [ ] **Step 3: Implement `PianiPersAlunnoProvider`**

Create `src/application/context-engine/providers/PianiPersAlunnoProvider.ts`:
```ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import { getAlunnoEntity } from '../techEntities';

const TIPO_PIANO_PERS = 'PIANO_PERS';

/**
 * Fills `focus.alunno.didattica.pianiPersonalizzati` from LOG_DOCS via
 * LogDocumentoRepository.findByUtente(), filtered to TIPO === 'PIANO_PERS'
 * (11 §11 new, deliberately independent of DocumentiProvider so the existing
 * `documenti`/`cartelle` boxes keep their documented empty-outside-
 * FAMIGLIA_COMPLETO behaviour, ref BOX_CONF_GUIDE.md §2). Active in
 * ALUNNO_COMPLETO and FAMIGLIA_COMPLETO.
 */
export class PianiPersAlunnoProvider implements ContextProvider {
  constructor(private readonly logDocs: ILogDocumentoRepository) {}

  provide(cdu: Cdu): void {
    const focusAlunno = cdu.focus.alunno;
    if (focusAlunno === undefined) return;
    const items = this.logDocs
      .findByUtente(getAlunnoEntity(cdu).email)
      .filter((l) => l.tipo === TIPO_PIANO_PERS)
      .map((l) => ({
        nome: l.nome,
        link: l.getLink(),
        tipo: l.tipo,
        sottotipo: l.getSottotipo(),
        idGen: l.idGen,
        stato: l.getStato(),
        dataCreazione: l.getDataCreazione(),
        notificato: l.isNotificato()
      }));
    focusAlunno.didattica.pianiPersonalizzati = { items };
  }
}
```

- [ ] **Step 4: Implement `PianiPersAlunnoStoricoProvider`**

Create `src/application/context-engine/providers/PianiPersAlunnoStoricoProvider.ts`:
```ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { LazyRef } from '../../storico/LazyRef';

/**
 * Fills `focus.alunno.didattica.pianiPersonalizzati.storico` (11 §11 new) with
 * a LazyRef over every prior-year document tagged with its ID_GEN, feeding the
 * `piani_pers_da_inviare` box's default historical row. Mirrors
 * DocumentiStoricoProvider: skipped entirely when `includiStorico` is false.
 * Runs after `pianiPersAlunno` in the recipe.
 */
export class PianiPersAlunnoStoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined || alunno.didattica.pianiPersonalizzati === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.databases);
    alunno.didattica.pianiPersonalizzati.storico = new LazyRef(() =>
      service.perAlunnoConTipo(email, profondita)
    );
  }
}
```

- [ ] **Step 5: Wire both providers into the recipes and the factory**

In `src/application/context-engine/Recipe.ts`, change:
```ts
  ALUNNO_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani'],
  FAMIGLIA_COMPLETO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'documenti',
    'documentiStorico'
  ],
```
to:
```ts
  ALUNNO_COMPLETO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'pianiPersAlunno',
    'pianiPersAlunnoStorico'
  ],
  FAMIGLIA_COMPLETO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'documenti',
    'documentiStorico',
    'pianiPersAlunno',
    'pianiPersAlunnoStorico'
  ],
```

In `src/application/context-engine/ContextEngineFactory.ts`, add the two imports:
```ts
import { PianiPersAlunnoProvider } from './providers/PianiPersAlunnoProvider';
import { PianiPersAlunnoStoricoProvider } from './providers/PianiPersAlunnoStoricoProvider';
```
and register both after the existing `.registerProvider('documentiStorico', new DocumentiStoricoProvider(storicoDb));` line:
```ts
      .registerProvider('documentiStorico', new DocumentiStoricoProvider(storicoDb))
      .registerProvider('pianiPersAlunno', new PianiPersAlunnoProvider(logDocs))
      .registerProvider('pianiPersAlunnoStorico', new PianiPersAlunnoStoricoProvider(storicoDb));
```
(remove the trailing `;` from the previous line since it's now mid-chain — match the existing chained-call style in the file).

- [ ] **Step 6: Run the tests again**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-alunno-provider.test.ts`
Expected: PASS (all three tests)

- [ ] **Step 7: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors, all PASS — pay attention to any other test asserting the exact provider list length/order for `ALUNNO_COMPLETO`/`FAMIGLIA_COMPLETO` (search `RECIPES.ALUNNO_COMPLETO`/`RECIPES.FAMIGLIA_COMPLETO` in `test/` first) and update it if found.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add PianiPersAlunnoProvider and its storico provider"
```

---

### Task 9: `PianiPersClasseProvider` + `PianiPersClasseStoricoProvider`

**Files:**
- Create: `src/application/context-engine/providers/PianiPersClasseProvider.ts`
- Create: `src/application/context-engine/providers/PianiPersClasseStoricoProvider.ts`
- Modify: `src/application/context-engine/Recipe.ts` (`RECIPES.DOCENTE_COMPLETO`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Test: `test/unit/application/context-engine/piani-pers-classe-provider.test.ts` (new file)

**Interfaces:**
- Consumes: `BuildParams.classiCompetenza` (Task 6), `LogDocumento.getUtenti()` (Task 6), `IClasseRepository.findById(ClasseId): Classe | null`, `ILogDocumentoRepository.findByClasse(Classe): LogDocumento[]`, `IAlunnoRepository.findById(email): Alunno | null`
- Produces: `focus.classe.didattica.pianiPersonalizzati.items`/`.storico`, recipe tokens `'pianiPersClasse'`/`'pianiPersClasseStorico'`

- [ ] **Step 1: Write the failing provider test**

Create `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`:
```ts
import { PianiPersClasseProvider } from '../../../../src/application/context-engine/providers/PianiPersClasseProvider';
import { PianiPersClasseStoricoProvider } from '../../../../src/application/context-engine/providers/PianiPersClasseStoricoProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { StoricoDatabaseProvider, AnnoStorico } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function tablesWithClassePiani(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(
    {
      ID: 'doc_pdp_a1', ID_GEN: 'PDP_BES', TIPO: 'PIANO_PERS', SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/a1',
      CLASSI: '5A', UTENTI: 'a1@school.it', DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_pei_a2', ID_GEN: 'PEI_DOC', TIPO: 'PIANO_PERS', SOTTOTIPO: 'PEI',
      NOME: 'PEI a2', STATO: 'GENERATO', NOTIFICATO: '2026-04-01T00:00:00.000Z', LINK: 'http://d/a2',
      CLASSI: '5A', UTENTI: 'a2@school.it', DATA_CREAZ: '2026-03-02'
    },
    {
      ID: 'doc_verbale', ID_GEN: 'VERBALE_CDC', TIPO: 'VERBALE', SOTTOTIPO: '',
      NOME: 'Verbale', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/v',
      CLASSI: '5A', UTENTI: '', DATA_CREAZ: '2026-03-01'
    }
  );
  return t;
}

function build(providers: string[], databases: StoricoDatabaseProvider, classiCompetenza?: string[], options = makeOptions()) {
  const db = new FakeDatabase(tablesWithClassePiani());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const logDocs = new LogDocumentoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('pianiPersClasse', new PianiPersClasseProvider(classi, logDocs, alunni));
  b.registerProvider('pianiPersClasseStorico', new PianiPersClasseStoricoProvider(databases));
  const params: BuildParams = {
    target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z'),
    ...(classiCompetenza !== undefined ? { classiCompetenza } : {})
  };
  const recipe: Recipe = { providers, options };
  return b.build(params, recipe);
}

test('PianiPersClasseProvider: aggregates PIANO_PERS docs across the class, tags each with its student', () => {
  const cdu = build(['class', 'pianiPersClasse'], { anniStorici: () => [] });
  const items = cdu.focus.classe!.didattica!.pianiPersonalizzati.items;
  expect(items).toHaveLength(2);
  const a1Item = items.find((i) => i.idGen === 'PDP_BES')!;
  expect(a1Item.studente).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
  expect(a1Item.notificato).toBe(false);
  const a2Item = items.find((i) => i.idGen === 'PEI_DOC')!;
  expect(a2Item.studente).toEqual({ nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' });
  expect(a2Item.notificato).toBe(true);
});

test('PianiPersClasseProvider: falls back to params.target when classiCompetenza is absent', () => {
  const cdu = build(['class', 'pianiPersClasse'], { anniStorici: () => [] }, undefined);
  expect(cdu.focus.classe!.didattica!.pianiPersonalizzati.items).toHaveLength(2);
});

test('PianiPersClasseStoricoProvider: includiStorico false ⇒ no storico key', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = { anniStorici: () => { opened = true; return []; } };
  const cdu = build(['class', 'pianiPersClasse', 'pianiPersClasseStorico'], databases);
  expect(cdu.focus.classe!.didattica!.pianiPersonalizzati.storico).toBeUndefined();
  expect(opened).toBe(false);
});

test('PianiPersClasseStoricoProvider: resolves prior-year docs per distinct student in the current-year list', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'old_pdp_a1', ID_GEN: 'PDP_BES', TIPO: 'PIANO_PERS', SOTTOTIPO: 'PDP_DSA',
    NOME: 'PDP a1 anno scorso', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/old',
    UTENTI: 'a1@school.it', DATA_CREAZ: '2025-03-01'
  });
  const anno: AnnoStorico = { anno: '2025-2026', db: new FakeDatabase(t) };
  const databases: StoricoDatabaseProvider = { anniStorici: () => [anno] };
  const cdu = build(
    ['class', 'pianiPersClasse', 'pianiPersClasseStorico'],
    databases,
    undefined,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.classe!.didattica!.pianiPersonalizzati.storico!.get();
  expect(storico).toEqual([
    { anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old', tipo: 'PDP_BES' }
  ]);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts`
Expected: FAIL — the two provider modules don't exist yet.

- [ ] **Step 3: Implement `PianiPersClasseProvider`**

Create `src/application/context-engine/providers/PianiPersClasseProvider.ts`:
```ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { ClasseId } from '../../../domain/value-objects/ClasseId';

const TIPO_PIANO_PERS = 'PIANO_PERS';

/**
 * Fills `focus.classe.didattica.pianiPersonalizzati` (11 §11 new) by
 * aggregating LOG_DOCS across every class in `params.classiCompetenza`
 * (falling back to the single `params.target` class when absent — e.g. a
 * direct CDU build outside the email pipeline), filtered to
 * TIPO === 'PIANO_PERS'. Each item is tagged with its owning student,
 * resolved from LOG_DOCS.UTENTI via AlunnoRepository. Active in
 * DOCENTE_COMPLETO (PER_COORDINATORE/PER_DOCENTE/PER_CDC).
 */
export class PianiPersClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly logDocs: ILogDocumentoRepository,
    private readonly alunni: IAlunnoRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    if (cdu.focus.classe === undefined) return;
    const classIds = params.classiCompetenza ?? [params.target];
    const items = classIds.flatMap((id) => {
      const classe = this.classi.findById(ClasseId.of(id));
      if (classe === null) return [];
      return this.logDocs
        .findByClasse(classe)
        .filter((l) => l.tipo === TIPO_PIANO_PERS)
        .map((l) => {
          const email = l.getUtenti()[0] ?? '';
          const alunno = email !== '' ? this.alunni.findById(email) : null;
          return {
            nome: l.nome,
            link: l.getLink(),
            tipo: l.tipo,
            sottotipo: l.getSottotipo(),
            idGen: l.idGen,
            stato: l.getStato(),
            dataCreazione: l.getDataCreazione(),
            notificato: l.isNotificato(),
            studente: { nomeCompleto: alunno?.cognomeNome ?? '', email }
          };
        });
    });
    cdu.focus.classe.didattica = { pianiPersonalizzati: { items } };
  }
}
```

- [ ] **Step 4: Implement `PianiPersClasseStoricoProvider`**

Create `src/application/context-engine/providers/PianiPersClasseStoricoProvider.ts`:
```ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import type { DocumentoStoricoConTipo } from '../../storico/StoricoDocumentiService';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { LazyRef } from '../../storico/LazyRef';

/**
 * Fills `focus.classe.didattica.pianiPersonalizzati.storico` (11 §11 new): one
 * LazyRef merging every distinct current-year student's prior-year documents,
 * each tagged with its ID_GEN. Deliberately a simple per-student loop (not a
 * batched cross-year query) — the number of BES/PDP students per class is
 * small, so this trades a small amount of historical-DB-open overhead for
 * reusing StoricoDocumentiService as-is. Mirrors PianiPersAlunnoStoricoProvider.
 */
export class PianiPersClasseStoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const classe = cdu.focus.classe;
    if (classe === undefined || classe.didattica === undefined) return;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.databases);
    const emails = [
      ...new Set(
        classe.didattica.pianiPersonalizzati.items
          .map((i) => i.studente?.email ?? '')
          .filter((e) => e !== '')
      )
    ];
    classe.didattica.pianiPersonalizzati.storico = new LazyRef(() =>
      emails.flatMap((email): DocumentoStoricoConTipo[] => service.perAlunnoConTipo(email, profondita))
    );
  }
}
```

- [ ] **Step 5: Wire both providers into `DOCENTE_COMPLETO` and the factory**

In `src/application/context-engine/Recipe.ts`, change:
```ts
  DOCENTE_COMPLETO: ['school', 'class', 'consiglio'],
```
to:
```ts
  DOCENTE_COMPLETO: ['school', 'class', 'consiglio', 'pianiPersClasse', 'pianiPersClasseStorico'],
```

In `src/application/context-engine/ContextEngineFactory.ts`, add the two imports:
```ts
import { PianiPersClasseProvider } from './providers/PianiPersClasseProvider';
import { PianiPersClasseStoricoProvider } from './providers/PianiPersClasseStoricoProvider';
```
and register both after the `pianiPersAlunnoStorico` registration added in Task 8:
```ts
      .registerProvider('pianiPersAlunnoStorico', new PianiPersAlunnoStoricoProvider(storicoDb))
      .registerProvider('pianiPersClasse', new PianiPersClasseProvider(classi, logDocs, alunni))
      .registerProvider('pianiPersClasseStorico', new PianiPersClasseStoricoProvider(storicoDb));
```

- [ ] **Step 6: Run the tests again**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts`
Expected: PASS (all four tests)

- [ ] **Step 7: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors, all PASS — check for any test asserting `RECIPES.DOCENTE_COMPLETO`'s exact provider list and update it if found (same caveat as Task 8 Step 7).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add PianiPersClasseProvider and its storico provider"
```

---

### Task 10: Fix the `includiStorico` wiring gap in `BuildCDUStep`

**Files:**
- Modify: `src/application/pipelines/emailSteps.ts` (`BuildCDUStep`)
- Test: `test/unit/application/pipelines/email-steps.test.ts`

This is the fix described in spec §3.6: `BuildCDUStep` currently passes `{ gestioneSupplenti: conf.supplenti }` to `recipe()`, which is not a real `RecipeOptions` key, so `includiStorico` silently stays `false` for every real email today.

**Interfaces:**
- Consumes: `ConfigurazioneEmail.getBoxes(): Record<string, unknown>[]` (existing)
- Produces: `BuildCDUStep` now builds the recipe with `includiStorico: true`/`profonditaAnniDocumenti` derived from `BOX_CFG` — consumed transitively by Tasks 8-9's storico providers and by Task 11's box rendering

- [ ] **Step 1: Write the failing tests**

In `test/unit/application/pipelines/email-steps.test.ts`, near the existing `BuildCDUStep` tests, using the file's own `wire(patternOverrides, target)`/`buildStep(w)` helpers, add:
```ts
test('BuildCDUStep enables includiStorico when BOX_CFG has an explicit arricchisciConStorico:true documenti box', () => {
  const w = wire({
    BOX_CFG: JSON.stringify([{ TIPO_BOX: 'documenti', arricchisciConStorico: true }])
  }); // default PROCESSO PER_GENITORI_ALUNNO, default target genitoriTarget()
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(true);
});

test('BuildCDUStep enables includiStorico by default for piani_pers_da_inviare even with no explicit key', () => {
  const w = wire(
    { PROCESSO: 'PER_COORDINATORE', BOX_CFG: JSON.stringify([{ TIPO_BOX: 'piani_pers_da_inviare' }]) },
    docenteTarget()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(true);
});

test('BuildCDUStep leaves includiStorico false when no box wants historical data', () => {
  const w = wire(
    { PROCESSO: 'PER_COORDINATORE', BOX_CFG: JSON.stringify([{ TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>hi</p>' }]) },
    docenteTarget()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(false);
});

test('BuildCDUStep respects an explicit arricchisciConStorico:false override on piani_pers_da_inviare', () => {
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: JSON.stringify([{ TIPO_BOX: 'piani_pers_da_inviare', arricchisciConStorico: false }])
    },
    docenteTarget()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(false);
});
```
(`docenteTarget()` is the file's existing helper producing a `PER_DOCENTE`-shaped `EmailTarget` for class `5A` with `docenteEmail: 'rossi@school.it'` — reused here since `PER_COORDINATORE` also expects a `tipoTarget: 'classe'` target.)

- [ ] **Step 2: Run to confirm they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "includiStorico"`
Expected: FAIL — `includiStorico` is `false` in all four cases (or the first three; the fourth already expects `false`).

- [ ] **Step 3: Implement the derivation**

In `src/application/pipelines/emailSteps.ts`, add this helper function near the top of the file (after `RECIPE_PER_PROCESSO`):
```ts
const HISTORICAL_BOX_TYPES: ReadonlySet<string> = new Set([
  'documenti',
  'cartelle',
  'piani_pers_da_inviare'
]);
/** piani_pers_da_inviare wants historical enrichment by default (11 §11 new); the others only when explicitly configured. */
const DEFAULT_ON_BOX_TYPES: ReadonlySet<string> = new Set(['piani_pers_da_inviare']);

/** Derives includiStorico/profonditaAnniDocumenti from BOX_CFG (fixes the gap where these recipe options were never wired through the email pipeline). */
function storicoOptionsFor(conf: ConfigurazioneEmail): Partial<RecipeOptions> {
  const wants = conf.getBoxes().some((b) => {
    const tipo = typeof b['TIPO_BOX'] === 'string' ? b['TIPO_BOX'] : '';
    if (!HISTORICAL_BOX_TYPES.has(tipo)) return false;
    const explicit = b['arricchisciConStorico'];
    if (typeof explicit === 'boolean') return explicit;
    return DEFAULT_ON_BOX_TYPES.has(tipo);
  });
  return wants ? { includiStorico: true, profonditaAnniDocumenti: 1 } : {};
}
```
Add `import type { RecipeOptions } from '../context-engine/Recipe';` to the existing import block (it already imports `recipe`/`BuildParams` from `../context-engine/Recipe`, so extend that same import line rather than adding a new one).

In `BuildCDUStep._executeLogic`, change:
```ts
    const built = this.contextBuilder.build(
      params,
      recipe(RECIPE_PER_PROCESSO[conf.processo], { gestioneSupplenti: conf.supplenti })
    );
```
to:
```ts
    const built = this.contextBuilder.build(
      params,
      recipe(RECIPE_PER_PROCESSO[conf.processo], storicoOptionsFor(conf))
    );
```
(this also drops the dead `gestioneSupplenti` key entirely — it was never read by anything, confirmed in the design spec's investigation).

- [ ] **Step 4: Run the tests again**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (all tests, including the four new ones)

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: no errors, all PASS — pay special attention to `test/integration/notifica-email.test.ts` and any other test that asserts on `documenti`/`cartelle` box output for `PER_GENITORI_ALUNNO`: since `includiStorico` now actually turns on for patterns using `arricchisciConStorico: true`, previously-dormant historical-lookup code paths become live and could change rendered HTML in ways not previously exercised end-to-end. Fix any assertion that assumed the historical block never fired only if it turns out to be based on the same latent bug this task fixes — do not paper over a genuinely broken assertion by reverting this fix.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: wire includiStorico through BuildCDUStep from BOX_CFG"
```

---

### Task 11: `piani_pers_da_inviare` / `piani_pers_inviati` box rendering

**Files:**
- Modify: `src/application/email/boxes.ts`
- Test: `test/unit/application/email-boxes.test.ts` (existing file — has `materie()`, `cduRecord()`, `confMail(boxCfg)` helpers and a `renderBoxes(composer, confMail(boxCfg), cduRecordOrCustomObject, materie(), templates)` call pattern already used throughout)

**Interfaces:**
- Consumes: `focus.classe.didattica.pianiPersonalizzati`/`focus.alunno.didattica.pianiPersonalizzati` (Tasks 8-9), `PianoPersonalizzatoItem` (Task 7)
- Produces: two new `TIPO_BOX` values usable in any `CONF_MAIL.BOX_CFG`

- [ ] **Step 1: Write the failing rendering tests**

In `test/unit/application/email-boxes.test.ts`, using the file's own `materie()`/`confMail(boxCfg)` helpers and the `templates`/`composer` inline-per-test pattern already used throughout (see line 73-75), add:
```ts
function pianiPersCduRecord(items: unknown[], storico?: unknown): Record<string, unknown> {
  return {
    meta: { date: { oggi: { breve: '05/07/2026' } } },
    focus: {
      classe: {
        anagrafica: { nome: '5A' },
        didattica: {
          pianiPersonalizzati: storico !== undefined ? { items, storico } : { items }
        }
      }
    }
  };
}

test('piani_pers_da_inviare: lists only non-notificato items, default historical link included', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PDP a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PDP_DSA',
        idGen: 'PDP_BES', stato: 'GENERATO', dataCreazione: '2026-03-01', notificato: false,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
      },
      {
        nome: 'PEI a2', link: 'http://d/2', tipo: 'PIANO_PERS', sottotipo: 'PEI',
        idGen: 'PEI_DOC', stato: 'GENERATO', dataCreazione: '2026-03-02', notificato: true,
        studente: { nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' }
      }
    ],
    new LazyRef(() => [
      { anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old', tipo: 'PDP_BES' }
    ])
  );
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_da_inviare' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['piani_pers_da_inviare']!.html).toContain('PDP a1');
  expect(out.boxes['piani_pers_da_inviare']!.html).not.toContain('PEI a2'); // notificato, excluded
  expect(out.boxes['piani_pers_da_inviare']!.html).toContain('Si invia anche il link al piano dell\'anno precedente');
  expect(out.boxes['piani_pers_da_inviare']!.html).toContain('http://d/old');
});

test('piani_pers_inviati: lists only notificato items, no historical block by default', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord([
    {
      nome: 'PEI a2', link: 'http://d/2', tipo: 'PIANO_PERS', sottotipo: 'PEI',
      idGen: 'PEI_DOC', stato: 'GENERATO', dataCreazione: '2026-03-02', notificato: true,
      studente: { nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' }
    }
  ]);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_inviati' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['piani_pers_inviati']!.html).toContain('PEI a2');
  expect(out.boxes['piani_pers_inviati']!.html).not.toContain('Si invia anche');
});

test('piani_pers_da_inviare: empty when items list is empty', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord([]);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_da_inviare' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['piani_pers_da_inviare']).toBeUndefined();
});
```
Add `import { LazyRef } from '../../../src/application/storico/LazyRef';` to the file's existing import block.

- [ ] **Step 2: Run to confirm they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "piani_pers"`
Expected: FAIL — `piani_pers_da_inviare`/`piani_pers_inviati` are unknown `TIPO_BOX` values, silently discarded by `renderBoxes`' `known` filter, so `result.boxes['piani_pers_da_inviare']` is `undefined` in all cases.

- [ ] **Step 3: Add the `DocumentoItem`-like row type and renderer**

In `src/application/email/boxes.ts`, add near the top (after the existing `DocumentoItem` interface):
```ts
interface PianoPersonalizzatoRow {
  nome: string;
  link: string;
  sottotipo: string;
  idGen: string;
  notificato: boolean;
  studente?: { nomeCompleto: string; email: string };
}

const DEFAULT_PIANI_PERS_TEMPLATE =
  '<li>{{corrente.sottotipo}}{{#corrente.studente.nomeCompleto}} — {{corrente.studente.nomeCompleto}}{{/corrente.studente.nomeCompleto}}: ' +
  '<a href="{{corrente.link}}" target="_blank">{{corrente.nome}}</a>' +
  '{{#storico}} — Si invia anche il link al piano dell\'anno precedente: ' +
  '<a href="{{link}}" target="_blank">{{nome}}</a> ({{anno}}){{/storico}}</li>';
```

Add the shared renderer after `renderDocumentiBox`:
```ts
/**
 * Shared renderer for `piani_pers_da_inviare`/`piani_pers_inviati` (11 §11
 * new): filters the shared pianiPersonalizzati item list by `notificato`,
 * then renders each row via a Mustache template — a built-in default for
 * `piani_pers_da_inviare` (so the historical "sent last year too" line works
 * with zero BOX_CFG configuration), falling back to plain rows otherwise,
 * both overridable via the existing configArricchimento.templateRiga key.
 */
function renderPianiPersBox(
  data: unknown,
  options: { config: Record<string, unknown> },
  templates: ITemplateEngine
): string {
  const { items, storicoRef, defaultTemplate } = data as {
    items: PianoPersonalizzatoRow[];
    storicoRef?: LazyRef<DocumentoStoricoConTipo[]>;
    defaultTemplate: string;
  };
  const arricchisci = options.config['arricchisciConStorico'];
  const configArricchimento = options.config['configArricchimento'] as
    | Record<string, unknown>
    | undefined;
  const explicitTemplate = str(configArricchimento?.['templateRiga']);
  const wantsHistorical = typeof arricchisci === 'boolean' ? arricchisci : defaultTemplate !== '';
  const templateRiga = wantsHistorical ? (explicitTemplate !== '' ? explicitTemplate : defaultTemplate) : '';

  if (templateRiga === '') {
    const righe = items
      .map((d) => {
        const nome = escapeHtml(d.nome);
        const href = escapeHtml(safeUrl(d.link));
        const chi = d.studente !== undefined ? ` — ${escapeHtml(d.studente.nomeCompleto)}` : '';
        return `<li>${escapeHtml(d.sottotipo)}${chi}: <a href="${href}" target="_blank">${nome}</a></li>`;
      })
      .join('');
    return wrapUl(righe);
  }

  const storico = storicoRef?.get() ?? [];
  const righe = items
    .map((corrente) => {
      const storicoCorrente = storico.filter((s) => s.tipo === corrente.idGen).map(escapeNomeLink);
      return templates.processString(templateRiga, {
        corrente: { ...corrente, nome: escapeHtml(corrente.nome), link: escapeHtml(safeUrl(corrente.link)) },
        storico: storicoCorrente
      });
    })
    .join('');
  return wrapUl(righe);
}
```

- [ ] **Step 4: Register the two blocks, DEFAULT_TITLES, and aggregaDati wiring**

In `createBoxComposer`, after the existing `cartelle` block registration, add:
```ts
  simple(
    'piani_pers_da_inviare',
    'Piani personalizzati da notificare',
    (ctx) => ctx.get('boxdata.pianiPersDaInviare', { items: [], storicoRef: undefined, defaultTemplate: '' }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
  simple(
    'piani_pers_inviati',
    'Piani personalizzati notificati',
    (ctx) => ctx.get('boxdata.pianiPersInviati', { items: [], storicoRef: undefined, defaultTemplate: '' }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
```

In the `renderers.register(new HtmlRenderer({ ... templates: { ... } }))` block, add two entries after `cartelle: (data, options) => renderDocumentiBox(data, options, templates),`:
```ts
        piani_pers_da_inviare: (data, options) => renderPianiPersBox(data, options, templates),
        piani_pers_inviati: (data, options) => renderPianiPersBox(data, options, templates),
```

Change `DEFAULT_TITLES`:
```ts
const DEFAULT_TITLES: Record<string, string> = {
  carenze: 'Carenze rilevate',
  documenti: 'Documenti',
  cartelle: 'Cartelle',
  note: 'Note',
  assenze: 'Assenze',
  testo_dinamico: ''
};
```
to:
```ts
const DEFAULT_TITLES: Record<string, string> = {
  carenze: 'Carenze rilevate',
  documenti: 'Documenti',
  cartelle: 'Cartelle',
  note: 'Note',
  assenze: 'Assenze',
  testo_dinamico: '',
  piani_pers_da_inviare: 'Piani personalizzati da notificare',
  piani_pers_inviati: 'Piani personalizzati notificati'
};
```

In `aggregaDati`, change the `focus` type annotation and body to also read `focus.classe.didattica.pianiPersonalizzati`/`focus.alunno.didattica.pianiPersonalizzati`:
```ts
function aggregaDati(
  cdu: Record<string, unknown>,
  materie: IMateriaRepository
): Record<string, unknown> {
  const focus = cdu['focus'] as
    | {
        alunno?: {
          didattica?: {
            carenze?: { dettaglio?: Array<{ materia: string; voto: string }> };
            documenti?: {
              items?: DocumentoItem[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
            pianiPersonalizzati?: {
              items?: PianoPersonalizzatoRow[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
          };
        };
        classe?: {
          didattica?: {
            pianiPersonalizzati?: {
              items?: PianoPersonalizzatoRow[];
              storico?: LazyRef<DocumentoStoricoConTipo[]>;
            };
          };
        };
      }
    | undefined;
  const dettaglio = focus?.alunno?.didattica?.carenze?.dettaglio ?? [];
  const items = focus?.alunno?.didattica?.documenti?.items ?? [];
  const storicoRef = focus?.alunno?.didattica?.documenti?.storico;
  const pianiPers = focus?.classe?.didattica?.pianiPersonalizzati ?? focus?.alunno?.didattica?.pianiPersonalizzati;
  const pianiItems = pianiPers?.items ?? [];
  const pianiStoricoRef = pianiPers?.storico;
  return {
    carenze: mapCarenzeFormatoB(dettaglio, materie),
    documenti: { items: items.filter((i) => i.tipo !== 'CARTELLA'), storicoRef },
    cartelle: { items: items.filter((i) => i.tipo === 'CARTELLA'), storicoRef: undefined },
    pianiPersDaInviare: {
      items: pianiItems.filter((i) => !i.notificato),
      storicoRef: pianiStoricoRef,
      defaultTemplate: DEFAULT_PIANI_PERS_TEMPLATE
    },
    pianiPersInviati: {
      items: pianiItems.filter((i) => i.notificato),
      storicoRef: pianiStoricoRef,
      defaultTemplate: ''
    }
  };
}
```

- [ ] **Step 5: Run the tests again**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: PASS (all tests, including the three new ones)

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: no errors, all PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: render piani_pers_da_inviare and piani_pers_inviati boxes"
```

---

### Task 12: Documentation updates

**Files:**
- Modify: `BOX_CONF_GUIDE.md`
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (already partially done in Task 1 Step 3 — this task covers the remaining `ProcessoInvio` value-table completeness check)

No automated tests (documentation) — verified by manual read-through against the actually-implemented code from Tasks 1-11, and by `npm run lint`/`npm run typecheck` still passing (some of these docs are referenced by code comments, not parsed).

- [ ] **Step 1: Update `BOX_CONF_GUIDE.md` §1/§2 (PROCESSO list, recipe table)**

Change line 44 (`` `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA`. ``) to:
```
`PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA_GENITORI`, `PER_CARENZA_GENITORI_E_ALUNNO`,
`PER_CARENZA_GENITORI_E_COORD`.
```

Change the `RECIPE_PER_PROCESSO` code block (§2, around line 57-64) to match the real `emailSteps.ts` object after Task 1:
```ts
export const RECIPE_PER_PROCESSO: Record<ProcessoInvio, string> = {
  [ProcessoInvio.PER_COORDINATORE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_DOCENTE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_CDC]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_ALUNNO]: 'ALUNNO_COMPLETO',
  [ProcessoInvio.PER_GENITORI_ALUNNO]: 'FAMIGLIA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_ALUNNO]: 'CARENZA_COMPLETO',
  [ProcessoInvio.PER_CARENZA_GENITORI_E_COORD]: 'CARENZA_COMPLETO'
};
```
Add a one-line note directly under it: "The three `PER_CARENZA_GENITORI*` processes differ only in recipient composition (`EmailNotificationService.targetsPerCarenza`, 12 §3) — `_GENITORI` is parents only, `_E_ALUNNO` adds the student To, `_E_COORD` adds the class coordinatore Cc. All three only ever use `carenze`/`note`/`assenze` boxes."

Update every other prose occurrence of bare `PER_CARENZA` in the file (lines 141, 144) to `PER_CARENZA_GENITORI*`.

- [ ] **Step 2: Update `BOX_CONF_GUIDE.md` §3 (new TIPO_BOX entries) and §5 note**

After the existing `testo_dinamico` subsection (§3), add:
```markdown
### `piani_pers_da_inviare` / `piani_pers_inviati`

- Legge: `focus.classe.didattica.pianiPersonalizzati.items` when the recipe is `DOCENTE_COMPLETO`
  (class-wide, each row tagged with its student), else `focus.alunno.didattica.pianiPersonalizzati.items`
  (single student) — populated by `PianiPersClasseProvider`/`PianiPersAlunnoProvider`
  (`src/application/context-engine/providers/`), filtered to `LOG_DOCS.TIPO === 'PIANO_PERS'`.
- `piani_pers_da_inviare` shows items where `LOG_DOCS.NOTIFICATO` is empty; `piani_pers_inviati` shows
  the rest.
- Usable in `PER_COORDINATORE`/`PER_DOCENTE`/`PER_CDC` (primary; class-wide across every class in
  `EmailTarget.classiCompetenza`) and `PER_ALUNNO`/`PER_GENITORI_ALUNNO` (optional; single student).
  Not usable in `PER_CARENZA_GENITORI*` (those only use `carenze`/`note`/`assenze`).
- Vuoto quando: the underlying `items` list is empty after the notificato/not-notificato filter.
- `piani_pers_da_inviare` includes a **default** historical row ("Si invia anche il link al piano
  dell'anno precedente...") with no BOX_CFG configuration needed — override via
  `configArricchimento.templateRiga` (same mechanism as `documenti`) or disable with
  `"arricchisciConStorico": false`. `piani_pers_inviati` has no historical block by default; enable
  with `"arricchisciConStorico": true`.

```json
{ "TIPO_BOX": "piani_pers_da_inviare", "ORDINE": 1 }
```
```

In §5's fallback-rule note (around the existing `storicoRef è undefined` bullet), add a sentence: "As of `BuildCDUStep`'s `storicoOptionsFor` fix (12 §3.6), `includiStorico` is now derived from `BOX_CFG` itself — a pattern with a `documenti`/`cartelle`/`piani_pers_da_inviare` box wanting historical enrichment gets `includiStorico: true` automatically; this was previously always `false` for every email sent through the real pipeline, a latent bug fixed alongside this feature."

- [ ] **Step 3: Update `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`**

Replace the `ProcessoInvio` stub section (lines 91-95):
```markdown
### `ProcessoInvio`

**Utilizzo:** `CONF_MAIL.PROCESSO`, vedi file `11_PIPELINE_EMAIL.md`

---
```
with:
```markdown
### `ProcessoInvio`

**Utilizzo:** `CONF_MAIL.PROCESSO`

| Valore                          | Destinatari                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `PER_COORDINATORE`               | Un'email per coordinatore, aggregando tutte le sue classi                    |
| `PER_DOCENTE`                    | Un'email per docente del CdC, aggregando tutte le sue classi                 |
| `PER_CDC`                        | Un'email multi-TO per classe, a tutti i docenti del CdC                      |
| `PER_ALUNNO`                     | Un'email per alunno attivo                                                   |
| `PER_GENITORI_ALUNNO`            | Un'email per famiglia (deduplicata per set di tutori)                        |
| `PER_CARENZA_GENITORI`           | Un'email per riga CARENZE non notificata, ai soli genitori/tutori            |
| `PER_CARENZA_GENITORI_E_ALUNNO`  | Come sopra, TO genitori + alunno (un'unica email condivisa)                  |
| `PER_CARENZA_GENITORI_E_COORD`   | Come `PER_CARENZA_GENITORI`, con il coordinatore di classe in CC             |

Le tre varianti `PER_CARENZA_GENITORI*` condividono la stessa iterazione su `CARENZE` non notificate
e possono usare solo i box `carenze`/`note`/`assenze`.

---
```

Replace the `BoxConfig` JSON block (lines 534-550) with the actual implemented shape:
```markdown
### `BoxConfig` (elemento dell'array `CONF_MAIL.BOX_CFG`)

```json
{
  "TIPO_BOX": "carenze | documenti | cartelle | note | assenze | testo_dinamico | piani_pers_da_inviare | piani_pers_inviati",
  "TITOLO": "string (opzionale; se assente usa il titolo di default del tipo)",
  "ORDINE": 1,
  "PREREQUISITI": "string (espressione di visibilità per ComposableContentLib; '' = sempre visibile)",
  "MOSTRA_SE_VUOTO": false,
  "TESTO_VUOTO": "string (Mustache, valutato sull'intera CDU)",
  "COLORE": "string hex (bordo sinistro del contenitore; default #ddd)",
  "displayMode": "nome | link | nome+link | sololink (solo per documenti/cartelle, fallback a lista semplice)",
  "arricchisciConStorico": true,
  "configArricchimento": { "templateRiga": "string Mustache, contesto { corrente, storico }" },
  "CONTENUTO": "string HTML Mustache (solo per testo_dinamico, valutato sull'intera CDU)"
}
```

Nota: questo schema riflette il codice effettivo (`src/application/email/boxes.ts`), non lo schema
`DATI_SORGENTE`/`PREREQUISITI`-array più ricco descritto in `AGGIORNAMENTI_DA_FARE.md`/
`FAKEDB/CONF_MAIL.csv` — vedi `BOX_CONF_GUIDE.md`, nota finale "Perché non `DATI_SORGENTE`", per il
dettaglio di questa discrepanza intenzionale.
```

- [ ] **Step 4: Verify `SPECS_ALDO/01_SCHEMA_DATABASE.md:336`**

Confirm the edit made in Task 1 Step 3 is present and lists all eight `PROCESSO` values (`PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA_GENITORI`, `PER_CARENZA_GENITORI_E_ALUNNO`, `PER_CARENZA_GENITORI_E_COORD`) — if it was missed, apply it now.

- [ ] **Step 5: Full verification pass**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: no errors, all PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: document piani_pers boxes and PER_CARENZA_GENITORI* in BOX_CONF_GUIDE and 03_VALUE_OBJECTS_ED_ENUM"
```

---

## Post-plan verification

After Task 12, run the full gate once more end-to-end:
```bash
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build:testing
```
All must pass before considering this plan complete. `npm run build:testing` catches any GAS-transpilation issue the individual test runs wouldn't (e.g. accidental native-global leaks introduced by the new providers — none are expected here since no new code touches `DriveApp`/`SpreadsheetApp`/etc., but the build is the authoritative check per `CLAUDE.md`).
