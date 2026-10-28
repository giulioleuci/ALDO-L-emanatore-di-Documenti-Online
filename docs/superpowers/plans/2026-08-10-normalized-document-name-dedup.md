# Normalized Document-Name Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document deduplication compare a stable filename with `{{progressivo}}` masked; correct `LogEmailStep`, which currently omits `logicalTargetId` in test mode, so every mail audit record stays identifiable without blocking real delivery.

**Architecture:** `CheckDuplicatesStep` will calculate a dedup-only rendered name by masking `{{progressivo}}` before template rendering, then compare it to `LOG_DOCS.NOME`. `GenerateNameStep` retains real rendering. `LogEmailStep` currently omits `logicalTargetId` when `testEmail` is set; it will instead persist that identity for every send plus a test-mode marker. History loading ignores marked records.

**Tech Stack:** TypeScript, Jest, PipelineFramework, SheetDBLib repositories, Google Apps Script V8.

## Global Constraints

- Target GAS V8: synchronous code only.
- Native GAS globals remain inside `GoogleApiWrapper`.
- `GasLibraryFactory` supplies PipelineFramework; application code only changes domain-specific pipeline payload and matching rules.
- `SPECS_ALDO/01_SCHEMA_DATABASE.md` and `SPECS_ALDO/02_CDU_STRUTTURA.md` become consistent with normalized filename identity.
- Do not edit generated `dist/*`.

---

### Task 1: Stable document-name duplicate identity

**Files:**

- Modify: `test/unit/application/pipelines/document-steps.test.ts`
- Modify: `test/unit/application/document-generation-service.test.ts`
- Modify: `src/application/pipelines/documentSteps.ts`

**Interfaces:**

- Consumes: `CheckDuplicatesStep._executeLogic(ctx: PipelineContext): void`, `ITemplateEngine.processString(template, data)`.
- Produces: duplicate matching that compares `LOG_DOCS.NOME` against filename rendered with every `{{progressivo}}` token replaced by `_PROGRESSIVO_PH_`; each sentinel is matched as the numeric value used by real filename generation.

- [ ] **Step 1: Write failing pipeline tests**

```ts
test('compares a filename with progressivo masked only for duplicate detection', () => {
  const ctx = baseCtx({
    FILE_NAME: 'E2E_{{focus.classe.anagrafica.nome}}_{{progressivo}}',
    PATH_OUT: 'Output'
  });
  // Existing log has E2E_2B_7; same identity must skip.
  new CheckDuplicatesStep(logger, db, templates).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(false);
});
```

- [ ] **Step 2: Run failing pipeline test**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "progressivo masked"`

Expected: FAIL because `CheckDuplicatesStep` does not compare `NOME`.

- [ ] **Step 3: Write failing service test**

```ts
test('generates one document per class in a shared folder and skips the same class retry', () => {
  // CONF_DOC has shared PATH_OUT, FILE_NAME includes class and {{progressivo}}.
  expect(service.generateForClasse(ClasseId.of('5A'), 'CD1').status).toBe('GENERATO');
  expect(service.generateForClasse(ClasseId.of('4B'), 'CD1').status).toBe('GENERATO');
  expect(service.generateForClasse(ClasseId.of('5A'), 'CD1').status).toBe('SKIPPED');
});
```

- [ ] **Step 4: Run failing service test**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts -t "shared folder"`

Expected: FAIL because `5A` and `4B` currently share duplicate identity.

- [ ] **Step 5: Implement minimal matching change**

```ts
const stableName = this.templates.processString(
  String(cfg(ctx)[COL_CONF_DOC.FILE_NAME] ?? '').replace(/\{\{progressivo\}\}/g, '_PROGRESSIVO_PH_'),
  cduRecord(ctx)
);
const namePattern = new RegExp(
  `^${stableName.split('_PROGRESSIVO_PH_').map(escapeRegExp).join('\\d+')}$`
);

const existing = this.db.table(TABLE.LOG_DOCS).find(
  (row) => /* existing identity */ && namePattern.test(String(row[COL_LOG_DOCS.NOME] ?? ''))
);
```

Keep the real generated filename unchanged in `LOG_DOCS`; duplicate matching alone uses the stable pattern. Escape static rendered text before inserting `\\d+` so names containing regex punctuation remain literal.

- [ ] **Step 6: Run focused tests**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts test/unit/application/document-generation-service.test.ts`

Expected: PASS.

### Task 2: Preserve logical mail identity in test-mode audit records

**Files:**

- Modify: `test/unit/application/pipelines/email-steps.test.ts`
- Modify: `test/unit/application/email-notification-service.test.ts`
- Modify: `src/application/pipelines/emailSteps.ts`
- Modify: `src/application/services/EmailNotificationService.ts`

**Interfaces:**

- Consumes: `LogEmailStep._executeLogic(ctx: PipelineContext): void`, `EmailNotificationService.loadSuccessfulLogicalTargetIds(patternId, row)`.
- Produces: `LOG_MAIL.ALLEGATI.logicalTargetId: string` for every delivery and `LOG_MAIL.ALLEGATI.testMode: boolean` only for preview delivery; history ignores `testMode === true`.

- [ ] **Step 1: Write failing audit payload test**

```ts
test('logs logicalTargetId for a test-mode delivery', () => {
  runLogEmailStep({ testEmail: 'tester@school.it', emailTarget: docenteTarget });
  expect(logMail.registraInvio).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Array),
    expect.anything(),
    expect.any(String),
    expect.objectContaining({ logicalTargetId: 'docente:docente@school.it', testMode: true }),
    undefined
  );
});
```

- [ ] **Step 2: Run failing audit payload test**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "logs logicalTargetId for a test-mode delivery"`

Expected: FAIL because test-mode payload omits `logicalTargetId`.

- [ ] **Step 3: Write failing history test**

```ts
test('does not block real delivery from a SUCCESS test-mode audit record', () => {
  // Seed LOG_MAIL.SUCCESS with logicalTargetId and testMode:true.
  service.disableTestMode();
  expect(service.sendPattern('MAIL_1').sent).toBe(1);
});
```

- [ ] **Step 4: Run failing history test**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "test-mode audit record"`

Expected: FAIL after `logicalTargetId` is added until history filtering ignores `testMode`.

- [ ] **Step 5: Implement minimal audit and history changes**

```ts
const allegatiInfo = {
  docs: ctx.get<string[]>('documentIds') ?? [],
  folders: ctx.get<string[]>('cartelleFolderIds') ?? [],
  attach: ctx.get<string[]>('allegatiLinks') ?? [],
  logicalTargetId: emailTargetId(target(ctx)),
  ...(isTestSend ? { testMode: true } : {})
};

if (log.getAllegati()['testMode'] === true) continue;
```

- [ ] **Step 6: Run focused tests**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts test/unit/application/email-notification-service.test.ts`

Expected: PASS.

### Task 3: Align authoritative contracts and execute verification

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md`
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`

**Interfaces:**

- Consumes: Task 1 and Task 2 observable contracts.
- Produces: documentation whose duplicate identity and test-mode audit behavior match code.

- [ ] **Step 1: Update duplicate identity documentation**

```markdown
L'identità è `TIPO`+`SOTTOTIPO`+`ID_GEN`+`PATH`+`NOME_NORMALIZZATO`
(+`UTENTI` per `PIANO_PERS`), dove `NOME_NORMALIZZATO` rende `FILE_NAME`
sostituendo solo `{{progressivo}}` con `_PROGRESSIVO_PH_`.
```

- [ ] **Step 2: Update mail audit documentation**

```markdown
`ALLEGATI.logicalTargetId` è sempre presente; le preview includono `testMode:true`
e sono escluse dal duplicate-history lookup.
```

- [ ] **Step 3: Run schema and relevant test suites**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts test/unit/application/document-generation-service.test.ts test/unit/application/pipelines/email-steps.test.ts test/unit/application/email-notification-service.test.ts && npm run typecheck && npm run lint && npm run test:build`

Expected: every command exits `0`.

- [ ] **Step 4: Run online build gate**

Run: `npm run build:online`

Expected: exit `0`; build output contains online test entry without type or lint failures.

- [ ] **Step 5: Commit implementation**

```bash
git add src/application/pipelines/documentSteps.ts src/application/pipelines/emailSteps.ts src/application/services/EmailNotificationService.ts test/unit/application/pipelines/document-steps.test.ts test/unit/application/document-generation-service.test.ts test/unit/application/pipelines/email-steps.test.ts test/unit/application/email-notification-service.test.ts SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/02_CDU_STRUTTURA.md SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md
git commit -m "fix: normalize document names for duplicate detection"
```
