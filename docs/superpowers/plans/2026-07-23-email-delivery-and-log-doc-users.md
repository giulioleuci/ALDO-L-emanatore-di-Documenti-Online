# Email Delivery and LOG_DOCS Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent empty-box emails, verify generated-document links and `RIEPILOGO_CLASSE`, and add CDU-driven `LOG_DOCS.UTENTI` overrides through `CONF_DOC.REGISTRA_UTENTI`.

**Architecture:** Keep expression evaluation as first email gate, then make rendered non-empty boxes mandatory before side effects. Add an ALDO document-pipeline resolver that maps configured selectors to CDU emails at LOG_DOCS registration.

**Tech Stack:** TypeScript, Jest/ts-jest, GAS V8, PipelineFramework, SheetDBLib.

## Global Constraints

- GAS V8; synchronous code only. No native GAS globals outside existing facades.
- Never edit generated `dist/*` or `vendor/*`.
- Reuse existing pipeline/transaction mechanisms; no new persistence code.
- `REGISTRA_UTENTI` is SGSA CDU logic, not a GasLibraryFactory extension.

---

### Task 1: Gate email delivery after box rendering

**Files:**
- Modify: `src/application/pipelines/emailSteps.ts:216-245`
- Test: `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**
- Consumes: expression result `shouldSend: boolean`, rendered `boxHtmlOrdered: string[]`.
- Produces: final `shouldSend`, true only when both expression and box-content gates pass.

- [ ] **Step 1: Write failing tests**

```ts
test('empty rendered boxes suppress delivery despite an empty condition', () => {
  const w = wire(
    { PROCESSO: 'PER_COORDINATORE', BOX_CFG: JSON.stringify([{ TIPO_BOX: 'piani_pers_da_inviare' }]) },
    docenteTarget()
  );
  runThroughCompose(w);
  expect(w.ctx.get('shouldSend')).toBe(false);
});

test('one rendered box keeps delivery eligible', () => {
  const w = wire();
  runThroughCompose(w);
  expect(w.ctx.get('shouldSend')).toBe(true);
});
```

- [ ] **Step 2: Run RED**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "rendered box"`

Expected: first test fails because current `shouldSend` remains true.

- [ ] **Step 3: Implement minimal gate**

```ts
// RenderBoxesStep._executeLogic, immediately after setting boxHtmlOrdered
this.setResult(ctx, 'shouldSend', ctx.get('shouldSend') === true && result.ordered.length > 0);
```

Leave `ValutaCondizioniInvioStep` expression-only; existing `sendGate` skips compose/send/log/post-process.

- [ ] **Step 4: Run GREEN**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/pipelines/emailSteps.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "fix: suppress emails with no rendered content boxes"
```

### Task 2: Add REGISTRA_UTENTI schema and resolver

**Files:**
- Modify: `src/config/schema.ts:184-199`, `src/domain/entities/ConfigurazioneDocumento.ts:16-103`, `src/application/pipelines/documentSteps.ts:296-326`
- Test: `test/unit/application/pipelines/document-steps.test.ts`

**Interfaces:**
- Consumes: `ConfigurazioneDocumento.getRegistraUtenti(): string[]`, `Cdu`.
- Produces: `resolveLogDocUsers(confDoc: ConfigurazioneDocumento, cdu: Cdu): string`.

- [ ] **Step 1: Write failing tests**

```ts
test('RegisterDocumentStep overrides fallback with ordered unique CDU users', () => {
  const ctx = baseCtx(db);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData({
    ...fixtureTables().CONF_DOC[0]!,
    REGISTRA_UTENTI: 'coordinatori, CDC, alunni, genitori'
  }));
  ctx.set('newFileId', 'file_1');
  ctx.set('nomeFile', 'x');
  new RegisterDocumentStep(logger, db).execute(ctx);
  expect(db.table('LOG_DOCS').find((r) => r.ID === 'file_1')!.UTENTI)
    .toBe('rossi@school.it,verdi@school.it,a1@school.it,genitore1@x.it');
});

test('RegisterDocumentStep keeps alunno fallback when REGISTRA_UTENTI is blank', () => {
  // existing student CDU fixture must persist a1@school.it
});
```

Add a third test requiring `PipelineError` and zero inserts for `REGISTRA_UTENTI: 'INVALIDO'`.

- [ ] **Step 2: Run RED**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "REGISTRA_UTENTI"`

Expected: FAIL because schema/accessor/resolver are absent.

- [ ] **Step 3: Implement minimal resolver**

```ts
export const COL_CONF_DOC = { /* existing keys */, REGISTRA_UTENTI: 'REGISTRA_UTENTI' } as const;

const SELECTORS = ['COORDINATORI', 'DOCENTI', 'CDC', 'ALUNNI', 'GENITORI'] as const;
function resolveLogDocUsers(confDoc: ConfigurazioneDocumento, cdu: Cdu): string {
  // Parse trim-insensitive tokens; validate against SELECTORS.
  // Collect CDU emails in first-seen order with Set de-duplication.
  // COORDINATORI=class coordinator; DOCENTI=active subject teachers;
  // CDC=consiglioDiClasse; ALUNNI=class/focus students; GENITORI=tutors.
}
```

Store raw column value in `ConfigurazioneDocumento`; `getRegistraUtenti()` returns non-empty comma tokens. In `RegisterDocumentStep`, use resolver only if tokens exist; otherwise keep current student-email fallback. Throw `PipelineError` before insert for unknown tokens.

- [ ] **Step 4: Run GREEN**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts src/domain/entities/ConfigurazioneDocumento.ts src/application/pipelines/documentSteps.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "feat: configure LOG_DOCS users from CDU selectors"
```

### Task 3: Complete mocks and online regressions

**Files:**
- Modify: `test/fixtures/tables.ts`, `src/onlinetests/SampleDatabaseBuilder.ts`, `src/onlinetests/E2eSampleDatabaseBuilder.ts`, `src/onlinetests/checks/e2eScenarioChecks.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`, `test/unit/onlinetests/pipeline-checks.test.ts`

**Interfaces:**
- Consumes: all values in `COL_CONF_DOC`/ `COL_CONF_MAIL`.
- Produces: complete mock rows and explicit persisted-link/RIEPILOGO checks.

- [ ] **Step 1: Write failing tests**

```ts
function expectCompleteRows(rows: Record<string, unknown>[], columns: Record<string, string>): void {
  for (const row of rows) expect(Object.keys(row).sort()).toEqual(Object.values(columns).sort());
}

expectCompleteRows(sample.rows[TABLE.CONF_DOC]!, COL_CONF_DOC);
expectCompleteRows(sample.rows[TABLE.CONF_MAIL]!, COL_CONF_MAIL);
```

Add assertions that each generated `VERBALE`/ `CONDOTTA` LOG_DOCS row has `LINK !== ''`, and four `RIEPILOGO_CLASSE` rows exist, one per E2E class.

- [ ] **Step 2: Run RED**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/pipeline-checks.test.ts`

Expected: FAIL until seeds declare new column and explicit keys.

- [ ] **Step 3: Complete fixtures/checks**

Add `REGISTRA_UTENTI` to every CONF_DOC seed, all missing CONF_MAIL keys with `''`/ `null`, and selector examples in E2E rows. Enhance E2E generation checks to inspect persisted LOG_DOCS links and RIEPILOGO class coverage.

- [ ] **Step 4: Run GREEN**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/pipeline-checks.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/tables.ts src/onlinetests/SampleDatabaseBuilder.ts src/onlinetests/E2eSampleDatabaseBuilder.ts src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/pipeline-checks.test.ts
git commit -m "test: complete config fixtures and assert document links"
```

### Task 4: Verify whole system

**Files:** No production changes.

- [ ] **Step 1: Focused tests**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts test/unit/application/pipelines/document-steps.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/pipeline-checks.test.ts`

Expected: PASS.

- [ ] **Step 2: Project gates**

Run: `npm test && npm run typecheck && npm run lint && npm run build:testing && npm run build:online`

Expected: all exit 0.

- [ ] **Step 3: Diff hygiene**

Run: `git diff HEAD~3..HEAD --check && git status --short`

Expected: no whitespace errors; retain unrelated user edits to `AGENTS.md` and `GEMINI.md`.
