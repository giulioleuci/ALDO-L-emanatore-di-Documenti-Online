# CONF_DOC Log Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure the `CLASSI`, `UTENTI`, and `MATERIE` audit metadata of each generated file and folder through `CONF_DOC.REGISTRA_DOC` and `CONF_DOC.REGISTRA_FOLD` expressions.

**Architecture:** Add a small application-level parser/renderer for the two JSON cells, then inject its resolved metadata into the existing document pipeline. `RegisterDocumentStep` writes the resolved values to `LOG_DOCS`; `PrepareInfrastructureStep` passes them to `AlberoCartelle`, which merges them into the existing `LOG_FOLD` CSV fields. The existing `DocumentGenerationService` transaction remains the sole persistence boundary.

**Tech Stack:** TypeScript, Jest/ts-jest, SheetDBLib transaction API, Workspace template engine, Google Apps Script V8.

## Global Constraints

- Preserve the user’s current uncommitted changes; do not reset, checkout, or rewrite unrelated files.
- The workspace is already dirty in files that overlap this work. Before every task commit, inspect `git diff -- <task paths>` and stage only the new, reviewed hunks with `git add -p`; if ownership of a pre-existing hunk is unclear, leave the task uncommitted and report it rather than committing user work.
- Consult only `GasLibraryFactory/DOCS_LIBS` for library behavior; use the existing SheetDBLib transaction and never call `save()` from a pipeline step.
- Add `CONF_DOC.REGISTRA_DOC` and `CONF_DOC.REGISTRA_FOLD` as optional JSON columns; the log rows themselves remain mandatory.
- A configuration object accepts only optional string keys `classi`, `utenti`, and `materie`; missing/blank values resolve to `''` with no fallback.
- Render each configured string with the existing template engine against the CDU.
- Normalize all three resolved values as CSV: trim tokens, discard empty tokens, preserve first-seen order, remove duplicates.
- Rename physical/logical columns `LOG_DOCS.MATERIA` and `LOG_FOLD.MATERIA` to `MATERIE`; both are CSV fields.
- A reused folder merges each resolved CSV into its existing `LOG_FOLD` value; a blank new value never clears an old value.
- Target GAS V8 synchronous APIs only; do not edit generated `dist/` artifacts.

---

### Task 1: Define the schema contract and fixtures

**Files:**
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Modify: `src/config/schema.ts`
- Modify: `FAKEDB/CONF_DOC.csv`
- Modify: `test/fixtures/tables.ts`
- Modify: `src/onlinetests/SampleDatabaseBuilder.ts`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Test: `test/unit/onlinetests/sample-database-builder.test.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`

**Consumes:** The approved design in `docs/superpowers/specs/2026-07-27-conf-doc-log-registration-design.md`.

**Produces:** `COL_CONF_DOC.REGISTRA_DOC`, `COL_CONF_DOC.REGISTRA_FOLD`, `COL_LOG_DOCS.MATERIE`, and `COL_LOG_FOLD.MATERIE`, plus canonical sample data whose headers and complete rows match the physical schema.

- [ ] **Step 1: Write failing schema/fixture tests**

Add assertions that the configuration schema exposes the two new columns, does not expose the removed singular log columns, and the sample/e2e `CONF_DOC` rows are complete with valid JSON values. Assert an example shape rather than implementation details:

```ts
expect(COL_CONF_DOC.REGISTRA_DOC).toBe('REGISTRA_DOC');
expect(COL_CONF_DOC.REGISTRA_FOLD).toBe('REGISTRA_FOLD');
expect(COL_LOG_DOCS.MATERIE).toBe('MATERIE');
expect(COL_LOG_FOLD.MATERIE).toBe('MATERIE');

const registration = JSON.parse(String(verbale[COL_CONF_DOC.REGISTRA_DOC]));
expect(registration).toEqual({
  classi: '{{focus.classe.anagrafica.nome}}',
  utenti: '',
  materie: ''
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/sample-database-builder.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/e2e-template-provisioner.test.ts
```

Expected: FAIL because the new constants/headers/sample values do not yet exist.

- [ ] **Step 3: Implement the canonical schema and sample data**

Update the physical schema table descriptions to add `REGISTRA_DOC` and `REGISTRA_FOLD`; describe both JSONs as optional template expressions for CSV `CLASSI`, `UTENTI`, `MATERIE`. Rename both log-table columns to `MATERIE` and document their CSV semantics.

Add constants exactly as follows:

```ts
export const COL_CONF_DOC = {
  // existing fields
  REGISTRA_DOC: 'REGISTRA_DOC',
  REGISTRA_FOLD: 'REGISTRA_FOLD'
} as const;

export const COL_LOG_DOCS = {
  // existing fields
  MATERIE: 'MATERIE'
} as const;

export const COL_LOG_FOLD = {
  // existing fields
  MATERIE: 'MATERIE'
} as const;
```

Update every project-controlled fixture/provisioner header and row to use `MATERIE`; give each `CONF_DOC` row both new JSON columns. Use `{}` when that configuration deliberately leaves all three metadata fields blank, and explicit expressions where an e2e scenario needs searchable class/user/matter metadata.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command again.

Expected: PASS.

- [ ] **Step 5: Commit the schema contract task**

```bash
git diff -- SPECS_ALDO/01_SCHEMA_DATABASE.md src/config/schema.ts FAKEDB/CONF_DOC.csv test/fixtures/tables.ts src/onlinetests/SampleDatabaseBuilder.ts src/onlinetests/E2eSampleDatabaseBuilder.ts src/onlinetests/E2eTemplateProvisioner.ts test/unit/onlinetests/sample-database-builder.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts test/unit/onlinetests/e2e-template-provisioner.test.ts
git add -p
git commit -m "feat(schema): configure document log metadata"
```

### Task 2: Parse, validate, render, and normalize registration metadata

**Files:**
- Create: `src/application/pipelines/logRegistration.ts`
- Test: `test/unit/application/pipelines/log-registration.test.ts`

**Consumes:** `COL_CONF_DOC.REGISTRA_DOC`, `COL_CONF_DOC.REGISTRA_FOLD`, `ITemplateEngine.processString(template, cdu)` and the pipeline `PipelineError` type.

**Produces:**

```ts
export interface LogRegistrationMetadata {
  classi: string;
  utenti: string;
  materie: string;
}

export function resolveLogRegistration(
  raw: unknown,
  templates: ITemplateEngine,
  cdu: Record<string, unknown>,
  column: 'REGISTRA_DOC' | 'REGISTRA_FOLD'
): LogRegistrationMetadata;
```

- [ ] **Step 1: Write failing unit tests for the pure registration contract**

Create tests for all external behaviors:

```ts
test('renders and normalizes all metadata fields as CSV', () => {
  const metadata = resolveLogRegistration(
    JSON.stringify({
      classi: ' {{focus.classe}} , {{focus.classe}} ',
      utenti: ' {{focus.alunno}} , docente@scuola.it ',
      materie: ' MATE , MATE , FISI '
    }),
    templates,
    cdu,
    'REGISTRA_DOC'
  );

  expect(metadata).toEqual({
    classi: '5A',
    utenti: 'alunno@scuola.it,docente@scuola.it',
    materie: 'MATE,FISI'
  });
});

test('returns blank fields for an absent or empty configuration without fallback', () => {
  expect(resolveLogRegistration('', templates, cdu, 'REGISTRA_FOLD')).toEqual({
    classi: '', utenti: '', materie: ''
  });
});

test.each([
  ['{', 'malformato'],
  [JSON.stringify({ classe: '{{focus.classe}}' }), 'chiave non ammessa'],
  [JSON.stringify({ classi: 42 }), 'deve essere una stringa']
])('rejects %s', (raw, message) => {
  expect(() => resolveLogRegistration(raw, templates, cdu, 'REGISTRA_DOC')).toThrow(message);
});
```

- [ ] **Step 2: Run the new test file and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/log-registration.test.ts
```

Expected: FAIL because `logRegistration.ts` and `resolveLogRegistration` do not exist.

- [ ] **Step 3: Implement the pure application helper**

Implement the exported interface/function in the new file. Treat `null`, `undefined`, and whitespace-only strings as an empty metadata object. For any non-empty value, parse one JSON object, reject arrays and non-objects, reject unknown keys, reject non-string values, render each present string through `templates.processString`, then normalize it through one local CSV helper.

Use an explicit allowed-key guard:

```ts
const KEYS = ['classi', 'utenti', 'materie'] as const;

function normalizeCsv(value: string): string {
  return [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))].join(',');
}
```

Throw `new PipelineError(...)` whose message identifies the offending column and reason.

- [ ] **Step 4: Run the new test file and verify GREEN**

Run the Step 2 command again.

Expected: PASS.

- [ ] **Step 5: Commit the resolver task**

```bash
git add src/application/pipelines/logRegistration.ts test/unit/application/pipelines/log-registration.test.ts
git commit -m "feat(pipeline): resolve configured log metadata"
```

### Task 3: Feed resolved metadata through the transactional pipeline

**Files:**
- Modify: `src/application/pipelines/documentSteps.ts`
- Modify: `src/infrastructure/services/AlberoCartelle.ts`
- Modify: `src/domain/entities/LogDocumento.ts`
- Modify: `src/domain/entities/LogCartella.ts`
- Modify: `src/infrastructure/repositories/LogDocumentoRepository.ts`
- Modify: `src/infrastructure/repositories/LogCartellaRepository.ts`
- Test: `test/unit/application/pipelines/document-steps.test.ts`
- Test: `test/unit/infrastructure/albero-cartelle.test.ts`
- Test: `test/unit/infrastructure/persistence-save.test.ts`

**Consumes:** `resolveLogRegistration`, `AlberoCartelle.findOrCreate(path, options)`, and the existing `DocumentGenerationService` transaction.

**Produces:** A pipeline that writes only configured `LOG_DOCS` metadata and incrementally merges configured `LOG_FOLD` metadata, including `MATERIE`.

- [ ] **Step 1: Write failing pipeline and folder tests**

Cover observable behavior:

```ts
test('RegisterDocumentStep stores only REGISTRA_DOC-rendered metadata', () => {
  // config has REGISTRA_DOC expressions and REGISTRA_UTENTI/alunno values that differ
  // from their results
  runRegisterDocumentStep(config, cdu);
  expect(logDocs.rows[0]).toMatchObject({
    CLASSI: '5A',
    UTENTI: 'destinatario@scuola.it',
    MATERIE: 'MATE,FISI'
  });
});

test('RegisterDocumentStep leaves unconfigured metadata blank without legacy fallback', () => {
  runRegisterDocumentStep({ REGISTRA_DOC: '{}' }, cduWithStudentAndClass);
  expect(logDocs.rows[0]).toMatchObject({ CLASSI: '', UTENTI: '', MATERIE: '' });
});

test('reusing a folder merges configured classi utenti and materie', () => {
  folders.findOrCreate('Output', { classi: '5A', utenti: 'a@school.it', materie: 'MATE' });
  folders.findOrCreate('Output', { classi: '5B', utenti: 'b@school.it,a@school.it', materie: 'FISI,MATE' });
  expect(logFold.rows).toHaveLength(1);
  expect(logFold.rows[0]).toMatchObject({
    CLASSI: '5A,5B', UTENTI: 'a@school.it,b@school.it', MATERIE: 'MATE,FISI'
  });
});
```

Include a test that a malformed `REGISTRA_DOC` or `REGISTRA_FOLD` makes document generation reject and leaves both log tables unchanged after rollback.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts test/unit/infrastructure/albero-cartelle.test.ts test/unit/infrastructure/persistence-save.test.ts
```

Expected: FAIL because steps still apply class/alunno/`REGISTRA_UTENTI` fallbacks and folders do not merge `MATERIE`.

- [ ] **Step 3: Implement the pipeline integration**

In `PrepareInfrastructureStep`, resolve `cfg(ctx)[COL_CONF_DOC.REGISTRA_FOLD]` before calling `findOrCreate`, then pass the three resolved strings as options alongside the existing `tipo` and `nome` metadata.

In `RegisterDocumentStep`, resolve `cfg(ctx)[COL_CONF_DOC.REGISTRA_DOC]` and assign exactly its three values:

```ts
const metadata = resolveLogRegistration(
  cfg(ctx)[COL_CONF_DOC.REGISTRA_DOC], templates, cduRecord(ctx), 'REGISTRA_DOC'
);

[COL_LOG_DOCS.CLASSI]: metadata.classi,
[COL_LOG_DOCS.UTENTI]: metadata.utenti,
[COL_LOG_DOCS.MATERIE]: metadata.materie,
```

Pass `ITemplateEngine` to `RegisterDocumentStep` through its constructor and update `DocumentGenerationService.buildPipeline` accordingly. Remove the now-unused legacy `mergeLogDocUsers`, role-selector resolution, and imports only if no non-registration behavior still calls them.

Extend `FindOrCreateOptions` with `materie?: string`. In `AlberoCartelle.upsertLog`, merge the three values through one CSV helper and write `[COL_LOG_FOLD.MATERIE]`. Folder identity remains the physical `PATH`; do not make metadata part of its identity. Update domain entities and repository compatibility methods to use the plural constant and CSV semantics.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command again.

Expected: PASS, including the rollback assertion.

- [ ] **Step 5: Commit the pipeline task**

```bash
git diff -- src/application/pipelines/documentSteps.ts src/infrastructure/services/AlberoCartelle.ts src/domain/entities/LogDocumento.ts src/domain/entities/LogCartella.ts src/infrastructure/repositories/LogDocumentoRepository.ts src/infrastructure/repositories/LogCartellaRepository.ts test/unit/application/pipelines/document-steps.test.ts test/unit/infrastructure/albero-cartelle.test.ts test/unit/infrastructure/persistence-save.test.ts
git add -p
git commit -m "feat(documents): configure file and folder log metadata"
```

### Task 4: Update all consumers and run regression verification

**Files:**
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Modify: `test/unit/application/document-generation-service.test.ts`
- Modify: `test/unit/application/email-boxes.test.ts`
- Modify: `test/unit/application/custom-source-strategies.test.ts`
- Modify: `test/unit/application/pipelines/email-steps.test.ts`
- Modify: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

**Consumes:** The plural log-column constants and configured pipeline behavior from Tasks 1–3.

**Produces:** All log readers, CDU providers, email boxes, online checks, fakes, and fixtures consistently use `MATERIE` and retain their existing document/folder discovery behavior.

- [ ] **Step 1: Write focused failing consumer regressions**

Update every remaining fixture that represents a `LOG_DOCS`/`LOG_FOLD` row (`email-boxes`, `custom-source-strategies`, `email-steps`, online samples) to use `MATERIE: 'MATE,FISI'`. Preserve the existing behavior for document links and historical documents; the goal is to prove that readers do not silently lose the renamed field.

Add an end-to-end scenario assertion that a generated class document and its folder carry the configured metadata in persisted `LOG_DOCS`/`LOG_FOLD` rows.

- [ ] **Step 2: Run affected consumer tests and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts test/unit/application/email-boxes.test.ts test/unit/application/custom-source-strategies.test.ts test/unit/application/pipelines/email-steps.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
```

Expected: FAIL at every remaining consumer that still names `MATERIA` for one of the log tables.

- [ ] **Step 3: Update readers, fakes, and online checks**

Replace only log-table uses of `MATERIA` with `MATERIE`; do not rename unrelated domain fields such as `focus.materia`, `MATERIE.ID`, class dynamic subject columns, a generator’s single subject context, or prose that refers to the `MATERIA` entity.

Ensure online sample data has at least one document and folder configuration whose resolved `materie` value is non-empty, so the live check exercises the new path rather than only blank defaults.

- [ ] **Step 4: Run focused tests, then full static and test verification**

Run the Step 2 command, then:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
```

Expected: every command exits 0. If a test fails because it expects legacy default metadata, update the fixture/configuration to make the intended metadata explicit through `REGISTRA_DOC` or `REGISTRA_FOLD`, not by restoring a fallback.

- [ ] **Step 5: Commit the consumer/regression task**

```bash
git diff -- src/onlinetests/checks/e2eScenarioChecks.ts test/unit/application/document-generation-service.test.ts test/unit/application/email-boxes.test.ts test/unit/application/custom-source-strategies.test.ts test/unit/application/pipelines/email-steps.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git add -p
git commit -m "test: cover configurable document log metadata"
```

## Plan self-review

- Spec coverage: Task 1 implements both new `CONF_DOC` columns and the `MATERIA`→`MATERIE` physical rename; Task 2 validates/renders expressions and blank/no-fallback behavior; Task 3 preserves atomic pipeline persistence and folder CSV merging; Task 4 updates readers and verifies all test tiers.
- Placeholder scan: no deferred implementation markers; each task has concrete files, API, tests, commands, and expected outcomes.
- Type consistency: `LogRegistrationMetadata` and `resolveLogRegistration` are defined in Task 2 and consumed by Task 3; all physical log usage names the plural `MATERIE` constant.
