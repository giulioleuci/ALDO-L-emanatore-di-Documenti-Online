# CONF_MAIL TESTO_START/TESTO_END/RISPONDI_A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `CONF_MAIL` email pipeline with a start/end HTML slot around the boxes (`TESTO` renamed to `TESTO_START`, plus new `TESTO_END`) and a `RISPONDI_A` column that sets the outgoing email's Reply-To header from a CDU placeholder expression.

**Architecture:** Three additive/renaming changes to the existing `NotificaPipeline` (`src/application/pipelines/emailSteps.ts`): (1) rename the `TESTO` column/getter to `TESTO_START` everywhere it's referenced; (2) add `TESTO_END`, rendered after the boxes and before the footer, using the exact same placeholder-resolution/escaping path as `TESTO_START`; (3) add `RISPONDI_A`, a CDU placeholder expression resolved once per compose via the existing `ITemplateEngine`, validated with the existing `Email` value object (which also blocks header-injection payloads since it rejects anything containing whitespace/newlines), and passed through `GmailServiceFacade` to the already-`replyTo`-capable vendored `MailService.send()`.

**Tech Stack:** TypeScript (GAS V8 target), Jest (`ts-jest`), existing `GasLibraryFactory` `WorkspaceTemplateEngine`/`MailService` — no new library code.

**Spec:** No separate spec file — this is a **bounded** change (existing pipeline, per `superpowers:brainstorming`). The approved design is the two-message design discussion immediately preceding this plan in the conversation transcript: TESTO → TESTO_START rename, additive TESTO_END, and RISPONDI_A as a raw CDU placeholder path (not a role-keyword enum) that logs a WARN and omits the Reply-To header when it resolves empty or invalid.

## Global Constraints

- Target is GAS V8: synchronous code only, no Node-specific APIs (`CLAUDE.md`).
- Native GAS service globals may only be touched inside `GoogleApiWrapper` (L2) — this plan never touches them directly; it goes through the existing `IGmailFacade`/`GmailServiceFacade` and `ITemplateEngine` ports (`CLAUDE.md`).
- Never edit `dist/*` — generated (`CLAUDE.md`).
- `GasLibraryFactory` must be used wherever it already covers the need — confirmed during brainstorming that `MailService.send()` already accepts `replyTo` (`types/gaslibs/index.d.ts:1142`), so this plan only adds a passthrough field, never new library code.
- All CONF_MAIL/SPECS_ALDO column names are UPPERCASE, matching `01_SCHEMA_DATABASE.md` (source of truth #1).

---

### Task 1: Rename `CONF_MAIL.TESTO` → `TESTO_START`

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md:375` (CONF_MAIL table row), migration note below the table (~line 385)
- Modify: `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md:441`
- Modify: `src/config/schema.ts:39` (`COL_CONF_MAIL.TESTO`)
- Modify: `src/domain/entities/ConfigurazioneEmail.ts` (rename `testoRaw`/`getTesto()`)
- Modify: `src/application/pipelines/emailSteps.ts:469,541` (doc comment + `conf.getTesto()` call)
- Modify (mechanical, listed in Step 6): every other `COL_CONF_MAIL.TESTO` / literal `TESTO:` reference in `src/onlinetests/**` and `test/**`
- Test: `test/unit/domain/configurazione-email.test.ts`

**Interfaces:**

- Produces: `ConfigurazioneEmail.getTestoStart(): string` (replaces `getTesto()`), `COL_CONF_MAIL.TESTO_START: 'TESTO_START'` (replaces `COL_CONF_MAIL.TESTO`).

- [ ] **Step 1: Write the failing test for the renamed getter**

Add to `test/unit/domain/configurazione-email.test.ts` (after the existing `describe('ConfigurazioneEmail.gestioneArticolazione', ...)` block, before the closing of the file):

```typescript
describe('ConfigurazioneEmail.getTestoStart', () => {
  test('defaults to empty string when the column is missing', () => {
    expect(config().getTestoStart()).toBe('');
  });

  test('reads TESTO_START and round-trips through toData()', () => {
    const html = '<p>Ciao {{focus.alunno.anagrafica.nomeCompleto}}</p>';
    const email = config({ [COL_CONF_MAIL.TESTO_START]: html });
    expect(email.getTestoStart()).toBe(html);
    expect(email.toData()[COL_CONF_MAIL.TESTO_START]).toBe(html);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: FAIL — `Property 'TESTO_START' does not exist on type ...` (TS compile error) or `getTestoStart is not a function`, since neither the schema key nor the entity method exist yet.

- [ ] **Step 3: Rename the schema constant**

In `src/config/schema.ts`, change line 39:

```typescript
// before
  TESTO: 'TESTO',
// after
  TESTO_START: 'TESTO_START',
```

(Leave `COL_LOG_MAIL.TESTO` at line 243 untouched — different table, different column, must not be renamed.)

- [ ] **Step 4: Rename the entity field/getter**

In `src/domain/entities/ConfigurazioneEmail.ts`, apply these three edits:

```typescript
// line 22, before:
  private readonly testoRaw: string;
// after:
  private readonly testoStartRaw: string;
```

```typescript
// lines 47-48, before:
this.testoRaw =
  typeof data[COL_CONF_MAIL.TESTO] === 'string' ? (data[COL_CONF_MAIL.TESTO] as string) : '';
// after:
this.testoStartRaw =
  typeof data[COL_CONF_MAIL.TESTO_START] === 'string'
    ? (data[COL_CONF_MAIL.TESTO_START] as string)
    : '';
```

```typescript
// lines 68-70, before:
  getTesto(): string {
    return this.testoRaw;
  }
// after:
  getTestoStart(): string {
    return this.testoStartRaw;
  }
```

```typescript
// line 122, before:
      [COL_CONF_MAIL.TESTO]: this.testoRaw,
// after:
      [COL_CONF_MAIL.TESTO_START]: this.testoStartRaw,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: PASS

- [ ] **Step 6: Fix every remaining call site (mechanical rename)**

The repo won't typecheck until every consumer of the old names is updated. Two call sites need a manual identifier edit (not a blind rename, since surrounding text changes):

In `src/application/pipelines/emailSteps.ts`, line 469 doc comment:

```typescript
// before
/** Step 5 (11 §6): msgstart + header + saluto + TESTO + boxes + footer + msgend. */
// after
/** Step 5 (11 §6): msgstart + header + saluto + TESTO_START + boxes + footer + msgend. */
```

And line 541:

```typescript
// before
const testo = this.templates.processStringEscaped(conf.getTesto(), cduRecord(ctx));
// after
const testo = this.templates.processStringEscaped(conf.getTestoStart(), cduRecord(ctx));
```

Every remaining reference is a plain `COL_CONF_MAIL.TESTO` property-access or a literal `TESTO:` object key in a `CONF_MAIL` row fixture — every occurrence below was verified by hand to belong to `CONF_MAIL`, never `LOG_MAIL` (which also has an unrelated `TESTO` column that must NOT be touched). Run this from the repo root:

```bash
# Group A: `COL_CONF_MAIL.TESTO` -> `COL_CONF_MAIL.TESTO_START`
sed -i '376s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' src/onlinetests/SampleDatabaseBuilder.ts
sed -i '413s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' src/onlinetests/checks/storicoChecks.ts
sed -i '656s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' src/onlinetests/data/Seeders.ts
sed -i \
  -e '1257s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' \
  -e '1277s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' \
  -e '1298s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' \
  -e '1324s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' \
  -e '1368s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' \
  -e '1384s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' \
  src/onlinetests/data/SharedTestDatabaseBuilder.ts
sed -i '891s/COL_CONF_MAIL\.TESTO\]/COL_CONF_MAIL.TESTO_START]/' test/unit/onlinetests/e2e-sample-database-builder.test.ts

# Group B: literal `TESTO:` object key -> `TESTO_START:` (CONF_MAIL row fixtures only)
sed -i \
  -e '279s/TESTO:/TESTO_START:/' \
  -e '294s/TESTO:/TESTO_START:/' \
  -e '310s/TESTO:/TESTO_START:/' \
  test/fixtures/tables.ts
sed -i '111s/TESTO:/TESTO_START:/' test/integration/cattedra-chain-verification.test.ts
sed -i '185s/TESTO:/TESTO_START:/' test/unit/application/email-retry-service.test.ts
sed -i '82s/TESTO:/TESTO_START:/' test/unit/application/email-boxes.test.ts
sed -i \
  -e '70s/TESTO:/TESTO_START:/' \
  -e '86s/TESTO:/TESTO_START:/' \
  -e '836s/TESTO:/TESTO_START:/' \
  -e '880s/TESTO:/TESTO_START:/' \
  -e '1189s/TESTO:/TESTO_START:/' \
  -e '1259s/TESTO:/TESTO_START:/' \
  -e '1292s/TESTO:/TESTO_START:/' \
  test/unit/application/email-notification-service.test.ts
sed -i \
  -e '55s/TESTO:/TESTO_START:/' \
  -e '1076s/TESTO:/TESTO_START:/' \
  test/unit/application/pipelines/email-steps.test.ts
sed -i '121s/TESTO:/TESTO_START:/' test/unit/onlinetests/pipeline-checks.test.ts

# Cosmetic: comments only (no functional effect)
sed -i \
  -e "38s/TESTO resolved/TESTO_START resolved/" \
  -e "76s|// TESTO$|// TESTO_START|" \
  test/integration/notifica-email.test.ts
```

Do **not** touch: `src/config/schema.ts:243` (`COL_LOG_MAIL.TESTO`), `src/infrastructure/repositories/LogEmailRepository.ts:51`, `test/unit/application/pipelines/email-steps.test.ts:1652` (`row['TESTO']`, a `LOG_MAIL` row), `test/unit/application/email-notification-service.test.ts:663,681` (`LOG_MAIL` rows — `'prior send'`/`'prior attempt'`), `test/unit/onlinetests/reset-e2e-history-tables.test.ts:106`, `test/build/fakedb-log-schema.test.ts:97` (both `LOG_MAIL` header arrays).

After the script, verify no stray old references remain:

```bash
grep -rn "COL_CONF_MAIL\.TESTO\b" src test 2>/dev/null
```

Expected: no output (every match is now `.TESTO_START`).

- [ ] **Step 7: Update the schema docs**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, change the `TESTO` row (line 375) to:

```markdown
| `TESTO_START` | String | — | HTML opzionale inserito prima dei box; supporta placeholder `{{...}}` risolti tramite `WorkspaceTemplateEngine` |
```

Append to the existing migration-note paragraph below the table (the one starting "**Migrazione database esistenti:**"):

```markdown
Rinominare la colonna fisica `TESTO` in `TESTO_START` su ogni foglio `CONF_MAIL`
esistente (stesso significato, nessun cambiamento di contenuto).
```

In `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md`, change line 441:

```markdown
Template HTML memorizzato nel campo `TESTO_START` della tabella `CONF_MAIL`:
```

- [ ] **Step 8: Run the full test suite and typecheck**

Run: `npm run typecheck && npm test && npm run test:integration`
Expected: all PASS, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md \
  src/config/schema.ts src/domain/entities/ConfigurazioneEmail.ts \
  src/application/pipelines/emailSteps.ts src/onlinetests \
  test/fixtures/tables.ts test/integration/cattedra-chain-verification.test.ts \
  test/integration/notifica-email.test.ts test/unit/application/email-retry-service.test.ts \
  test/unit/application/email-boxes.test.ts test/unit/application/email-notification-service.test.ts \
  test/unit/application/pipelines/email-steps.test.ts test/unit/onlinetests/pipeline-checks.test.ts \
  test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/domain/configurazione-email.test.ts
git commit -m "refactor(onlinetests): rename CONF_MAIL.TESTO to TESTO_START"
```

---

### Task 2: Add `CONF_MAIL.TESTO_END`

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (CONF_MAIL table, migration note)
- Modify: `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md` (short note near Example 3)
- Modify: `src/config/schema.ts` (add `TESTO_END`)
- Modify: `src/domain/entities/ConfigurazioneEmail.ts` (add `testoEndRaw`/`getTestoEnd()`)
- Modify: `src/application/pipelines/emailSteps.ts` (`ComposeEmailStep._executeLogic`, doc comment)
- Test: `test/unit/domain/configurazione-email.test.ts`, `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**

- Consumes: `COL_CONF_MAIL.TESTO_START` (Task 1).
- Produces: `ConfigurazioneEmail.getTestoEnd(): string`, `COL_CONF_MAIL.TESTO_END: 'TESTO_END'`. `ComposeEmailStep` now builds `htmlSoloContenuto` as `saluto + testoStart + boxes + testoEnd`.

- [ ] **Step 1: Write the failing entity test**

Add to `test/unit/domain/configurazione-email.test.ts`, after the `getTestoStart` describe block added in Task 1:

```typescript
describe('ConfigurazioneEmail.getTestoEnd', () => {
  test('defaults to empty string when the column is missing', () => {
    expect(config().getTestoEnd()).toBe('');
  });

  test('reads TESTO_END and round-trips through toData()', () => {
    const html = '<p>Cordiali saluti, {{focus.classe.coordinatori.appellativo}}</p>';
    const email = config({ [COL_CONF_MAIL.TESTO_END]: html });
    expect(email.getTestoEnd()).toBe(html);
    expect(email.toData()[COL_CONF_MAIL.TESTO_END]).toBe(html);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: FAIL — `Property 'TESTO_END' does not exist` / `getTestoEnd is not a function`.

- [ ] **Step 3: Add the schema constant**

In `src/config/schema.ts`, in `COL_CONF_MAIL`, add `TESTO_END` right after `TESTO_START`:

```typescript
export const COL_CONF_MAIL = {
  ID: 'ID',
  OGGETTO: 'OGGETTO',
  PROCESSO: 'PROCESSO',
  BOX_CFG: 'BOX_CFG',
  TESTO_START: 'TESTO_START',
  TESTO_END: 'TESTO_END',
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

- [ ] **Step 4: Add the entity field/getter**

In `src/domain/entities/ConfigurazioneEmail.ts`, add a field declaration right after `testoStartRaw` (line 22):

```typescript
  private readonly testoStartRaw: string;
  private readonly testoEndRaw: string;
```

Add parsing right after the `testoStartRaw` assignment in the constructor (after the block ending at what was line 48):

```typescript
this.testoEndRaw =
  typeof data[COL_CONF_MAIL.TESTO_END] === 'string'
    ? (data[COL_CONF_MAIL.TESTO_END] as string)
    : '';
```

Add a getter right after `getTestoStart()`:

```typescript
  getTestoEnd(): string {
    return this.testoEndRaw;
  }
```

Add to `toData()` right after the `TESTO_START` entry:

```typescript
      [COL_CONF_MAIL.TESTO_END]: this.testoEndRaw,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing ComposeEmailStep ordering test**

Add to `test/unit/application/pipelines/email-steps.test.ts`, right after the existing test `'ComposeEmailStep assembles header/saluto/testo/boxes/footer (11 §6)'` (around line 1073):

```typescript
test('ComposeEmailStep appends TESTO_END after the boxes and before the footer', () => {
  const w = wire({ TESTO_END: '<p>Cordiali saluti, la segreteria.</p>' });
  runThroughCompose(w);
  const html = w.ctx.get<string>('corpoHtml')!;
  const boxesIdx = html.indexOf('Carenze');
  const endIdx = html.indexOf('Cordiali saluti, la segreteria.');
  const footerIdx = html.indexOf('comunicazione automatica');
  expect(boxesIdx).toBeGreaterThan(-1);
  expect(endIdx).toBeGreaterThan(boxesIdx);
  expect(footerIdx).toBeGreaterThan(endIdx);
});

test('ComposeEmailStep HTML-escapes raw CDU values interpolated via CONF_MAIL.TESTO_END', () => {
  const w = wire({ TESTO_END: '<p>Alunno: {{focus.alunno.anagrafica.nomeCompleto}}</p>' });
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  cdu.focus.alunno!.anagrafica.nomeCompleto = '<script>alert(1)</script>';
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
  new ComposeEmailStep(
    logger,
    w.templates,
    new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
    new FakeDriveFacade()
  ).execute(w.ctx);
  const html = w.ctx.get<string>('corpoHtml')!;
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "TESTO_END"`
Expected: FAIL — the first test fails because `TESTO_END` never appears in `corpoHtml` (nothing renders it yet); the second fails because the raw `<script>` string is missing from output entirely (same reason).

- [ ] **Step 8: Wire TESTO_END into ComposeEmailStep**

In `src/application/pipelines/emailSteps.ts`, update the doc comment at line 469:

```typescript
// before
/** Step 5 (11 §6): msgstart + header + saluto + TESTO_START + boxes + footer + msgend. */
// after
/** Step 5 (11 §6): msgstart + header + saluto + TESTO_START + boxes + TESTO_END + footer + msgend. */
```

In `_executeLogic`, right after the `testo` assignment (the line changed in Task 1 Step 6), add:

```typescript
const testoEnd = this.templates.processStringEscaped(conf.getTestoEnd(), cduRecord(ctx));
```

Then change the `htmlSoloContenuto` line from:

```typescript
const htmlSoloContenuto = `<p>${escapeHtml(saluto)},</p>${testo}${boxes.join('')}`;
```

to:

```typescript
const htmlSoloContenuto = `<p>${escapeHtml(saluto)},</p>${testo}${boxes.join('')}${testoEnd}`;
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — `testoEnd` defaults to `''` for every fixture row that doesn't set `TESTO_END`, so existing assertions are unaffected).

- [ ] **Step 10: Update the schema docs**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, add a new row right after the `TESTO_START` row:

```markdown
| `TESTO_END` | String | — | HTML opzionale inserito dopo i box, prima del footer; stessa risoluzione placeholder di `TESTO_START` |
```

Append to the migration-note paragraph (same one extended in Task 1):

```markdown
Aggiungere la colonna fisica `TESTO_END` a ogni foglio `CONF_MAIL` esistente,
valorizzandola vuota per le righe esistenti (nessun testo di chiusura aggiuntivo).
```

In `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md`, right after the closing of the Example 3 code block (after the `</ul>` around what is now line ~474), add:

```markdown
`TESTO_END` (stessa tabella) accetta lo stesso tipo di template HTML e viene
inserito dopo i box, prima del footer "comunicazione automatica" — utile per
un saluto di chiusura o un rimando successivo ai contenuti dinamici.
```

- [ ] **Step 11: Run the full test suite and typecheck**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md \
  src/config/schema.ts src/domain/entities/ConfigurazioneEmail.ts \
  src/application/pipelines/emailSteps.ts \
  test/unit/domain/configurazione-email.test.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "feat(onlinetests): add CONF_MAIL.TESTO_END rendered after boxes, before footer"
```

---

### Task 3: Add `CONF_MAIL.RISPONDI_A` (Reply-To from a CDU placeholder)

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (CONF_MAIL table, migration note)
- Modify: `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md` (short example)
- Modify: `src/config/schema.ts` (add `RISPONDI_A`)
- Modify: `src/domain/entities/ConfigurazioneEmail.ts` (add `rispondiARaw`/`getRispondiA()`)
- Modify: `src/infrastructure/facades/GmailServiceFacade.ts` (`EmailSendOptions.replyTo`, passthrough)
- Modify: `src/application/pipelines/emailSteps.ts` (`ComposeEmailStep` resolves+validates, `SendEmailStep` passes through)
- Test: `test/unit/domain/configurazione-email.test.ts`, `test/unit/infrastructure/gmail-service-facade.test.ts`, `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**

- Consumes: `Email.of(raw: string): Email` (`src/domain/value-objects/Email.ts`, throws `ValidationError` on anything not a valid single address — including embedded whitespace/newlines, which also blocks header-injection payloads), `ITemplateEngine.processString(template, context): string` (already imported in `emailSteps.ts`).
- Produces: `ConfigurazioneEmail.getRispondiA(): string`, `COL_CONF_MAIL.RISPONDI_A: 'RISPONDI_A'`, `EmailSendOptions.replyTo?: string`. `ComposeEmailStep` sets pipeline-context key `'replyTo'` (`string`, present only when `RISPONDI_A` resolved to a valid address) for `SendEmailStep` to read.

- [ ] **Step 1: Write the failing entity test**

Add to `test/unit/domain/configurazione-email.test.ts`, after the `getTestoEnd` describe block added in Task 2:

```typescript
describe('ConfigurazioneEmail.getRispondiA', () => {
  test('defaults to empty string when the column is missing', () => {
    expect(config().getRispondiA()).toBe('');
  });

  test('reads RISPONDI_A and round-trips through toData()', () => {
    const expr = '{{focus.classe.coordinatori.elenco.0.email}}';
    const email = config({ [COL_CONF_MAIL.RISPONDI_A]: expr });
    expect(email.getRispondiA()).toBe(expr);
    expect(email.toData()[COL_CONF_MAIL.RISPONDI_A]).toBe(expr);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: FAIL — `Property 'RISPONDI_A' does not exist` / `getRispondiA is not a function`.

- [ ] **Step 3: Add the schema constant and entity plumbing**

In `src/config/schema.ts`, add `RISPONDI_A` at the end of `COL_CONF_MAIL`:

```typescript
export const COL_CONF_MAIL = {
  ID: 'ID',
  OGGETTO: 'OGGETTO',
  PROCESSO: 'PROCESSO',
  BOX_CFG: 'BOX_CFG',
  TESTO_START: 'TESTO_START',
  TESTO_END: 'TESTO_END',
  SUPPLENTI: 'SUPPLENTI',
  NOREPLY: 'NOREPLY',
  COLORE_HEADER: 'COLORE_HEADER',
  CONDIZIONE: 'CONDIZIONE',
  POST_PROCESSO: 'POST_PROCESSO',
  ALLEGATI: 'ALLEGATI',
  GESTIONE_ARTICOLAZIONE: 'GESTIONE_ARTICOLAZIONE',
  DUPLICAZIONE: 'DUPLICAZIONE',
  RISPONDI_A: 'RISPONDI_A'
} as const;
```

In `src/domain/entities/ConfigurazioneEmail.ts`, add a field declaration right after `testoEndRaw`:

```typescript
  private readonly testoEndRaw: string;
  private readonly rispondiARaw: string;
```

Add parsing right after the `testoEndRaw` assignment in the constructor:

```typescript
this.rispondiARaw =
  typeof data[COL_CONF_MAIL.RISPONDI_A] === 'string'
    ? (data[COL_CONF_MAIL.RISPONDI_A] as string)
    : '';
```

Add a getter right after `getTestoEnd()`:

```typescript
  getRispondiA(): string {
    return this.rispondiARaw;
  }
```

Add to `toData()` right after the `TESTO_END` entry:

```typescript
      [COL_CONF_MAIL.RISPONDI_A]: this.rispondiARaw,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing GmailServiceFacade passthrough test**

Add to `test/unit/infrastructure/gmail-service-facade.test.ts`:

```typescript
test('GmailServiceFacade.sendEmail forwards replyTo to the underlying MailService', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({
    to: ['a@x.it'],
    replyTo: 'coord@x.it',
    subject: 'S',
    htmlBody: '<p>B</p>'
  });
  expect((mail.lastOpts as { replyTo?: string }).replyTo).toBe('coord@x.it');
});

test('GmailServiceFacade.sendEmail omits replyTo when not provided', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({ to: ['a@x.it'], subject: 'S', htmlBody: '<p>B</p>' });
  expect((mail.lastOpts as { replyTo?: string }).replyTo).toBeUndefined();
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/gmail-service-facade.test.ts`
Expected: FAIL — TS compile error, `replyTo` does not exist on the `EmailSendOptions` object literal.

- [ ] **Step 7: Add the passthrough**

In `src/infrastructure/facades/GmailServiceFacade.ts`, add to `EmailSendOptions`:

```typescript
export interface EmailSendOptions {
  to: string[];
  subject: string;
  htmlBody: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  noReply?: boolean;
  attachments?: unknown[];
}
```

In `sendEmail()`, add right after the `bcc` passthrough line:

```typescript
if (opts.replyTo !== undefined) mailOpts.replyTo = opts.replyTo;
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/gmail-service-facade.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing ComposeEmailStep/SendEmailStep resolution tests**

Add to `test/unit/application/pipelines/email-steps.test.ts`, right after the `TESTO_END` tests added in Task 2:

```typescript
test('ComposeEmailStep resolves RISPONDI_A to a valid address and SendEmailStep sets it as replyTo', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE', RISPONDI_A: '{{focus.classe.coordinatori.elenco.0.email}}' },
    docenteTarget()
  );
  runThroughCompose(w);
  expect(w.ctx.get<string>('replyTo')).toBe('rossi@school.it'); // 5A's COORD fixture value

  w.ctx.set('destinatariFinali', [{ emails: ['bianchi@school.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.replyTo).toBe('rossi@school.it');
});

test('ComposeEmailStep leaves replyTo unset when RISPONDI_A is blank', () => {
  const w = wire();
  runThroughCompose(w);
  expect(w.ctx.get('replyTo')).toBeUndefined();

  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.replyTo).toBeUndefined();
});

test('ComposeEmailStep warns and omits replyTo when RISPONDI_A resolves to an invalid address, send still proceeds', () => {
  const w = wire({ RISPONDI_A: '{{focus.alunno.anagrafica.nomeCompleto}}' }); // resolves to a name, not an email
  runThroughRender(w);
  const warnMock = jest.fn();
  const mockLogger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: warnMock,
    error: jest.fn()
  } as unknown as LoggerService;
  new ComposeEmailStep(
    mockLogger,
    w.templates,
    new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
    new FakeDriveFacade()
  ).execute(w.ctx);

  expect(w.ctx.get('replyTo')).toBeUndefined();
  expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('RISPONDI_A'));

  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.replyTo).toBeUndefined();
  expect(gmail.sent).toHaveLength(1);
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "RISPONDI_A"`
Expected: FAIL — `ctx.get('replyTo')` is always `undefined` and `gmail.sent[0]!.replyTo` is always `undefined` for every case, since nothing resolves or wires it yet; the warn assertion fails because nothing calls `logger.warn` for this.

- [ ] **Step 11: Resolve RISPONDI_A in ComposeEmailStep and pass it through SendEmailStep**

In `src/application/pipelines/emailSteps.ts`, in `ComposeEmailStep._executeLogic`, right after the `allegati`/`corpoHtml` result-setting block (after `this.setResult(ctx, 'allegatiLinks', allegati.links);`), add:

```typescript
const rispondiARaw = conf.getRispondiA();
if (rispondiARaw.trim() !== '') {
  const resolved = this.templates.processString(rispondiARaw, cduRecord(ctx)).trim();
  try {
    this.setResult(ctx, 'replyTo', Email.of(resolved).value);
  } catch {
    this.logger.warn(
      `ComposeEmail: RISPONDI_A "${rispondiARaw}" risolto a un indirizzo non valido ("${resolved}") — invio senza intestazione Reply-To`
    );
  }
}
```

In `SendEmailStep._executeLogic`, add right after the `const testEmail = ctx.get<string>('testEmail');` line:

```typescript
const replyTo = ctx.get<string>('replyTo');
```

Inside the `for (const dest of destinazioni)` loop, right after the `opts.cc`/`opts.bcc` block (after the two `for (const email of ...)` loops that populate `resolvedCc`/`resolvedBcc`), add:

```typescript
if (replyTo !== undefined) opts.replyTo = replyTo;
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (full file, including every pre-existing test — `replyTo` stays `undefined` whenever `RISPONDI_A` is blank, which is every fixture row untouched by this task).

- [ ] **Step 13: Update the schema docs**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, add a new row at the end of the `CONF_MAIL` table, right before the closing `---`:

```markdown
| `RISPONDI_A` | String | — | Espressione placeholder `{{...}}` risolta sul CDU destinatario (stesso motore di `TESTO_START`/`TESTO_END`/`OGGETTO`) che deve risolvere a un singolo indirizzo email valido; se non vuota e il risultato non è un indirizzo valido, l'invio prosegue senza intestazione Reply-To e viene emesso un WARN nei log |
```

Append to the migration-note paragraph:

```markdown
Aggiungere la colonna fisica `RISPONDI_A` a ogni foglio `CONF_MAIL` esistente,
valorizzandola vuota per le righe esistenti (nessuna intestazione Reply-To
aggiuntiva, comportamento di invio invariato).
```

In `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md`, right after the `TESTO_END` note added in Task 2, add:

````markdown
`RISPONDI_A` (stessa tabella) è un'espressione placeholder che deve risolvere
a un singolo indirizzo email — imposta l'intestazione Reply-To del messaggio.
Esempio per una comunicazione ai genitori che deve tornare al coordinatore
della classe frequentata dal figlio:

```text
{{focus.classe.coordinatori.elenco.0.email}}
```
````

Se la colonna è vuota, l'invio si comporta come oggi (nessun Reply-To
impostato). Se non è vuota ma il risultato non è un indirizzo email valido
(ad esempio la classe non ha coordinatori), l'invio prosegue comunque, senza
intestazione Reply-To, e viene registrato un WARN nei log operativi.

````

- [ ] **Step 14: Run the full test suite and typecheck**

Run: `npm run typecheck && npm test && npm run test:integration`
Expected: all PASS.

- [ ] **Step 15: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md \
  src/config/schema.ts src/domain/entities/ConfigurazioneEmail.ts \
  src/infrastructure/facades/GmailServiceFacade.ts src/application/pipelines/emailSteps.ts \
  test/unit/domain/configurazione-email.test.ts test/unit/infrastructure/gmail-service-facade.test.ts \
  test/unit/application/pipelines/email-steps.test.ts
git commit -m "feat(onlinetests): add CONF_MAIL.RISPONDI_A to set Reply-To from a CDU placeholder"
````
