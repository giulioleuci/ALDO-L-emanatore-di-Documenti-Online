# E2E email boxes and class-summary table implementation plan

> **For Codex:** execute this plan with `superpowers:test-driven-development` and
> `superpowers:verification-before-completion`. Do not edit `dist/`.

**Goal:** make the online class-summary scenario use the generic document generator
with a real template table, and make report/conduct email scenarios send whenever at
least one rendered box contains semantic content.

**Architecture:** author the E2E-only Docs table through the already injected
`GoogleApiWrapper.DocumentService`. Keep production email gating in `RenderBoxesStep`;
repair the E2E service lifetime so the CDU sees newly inserted `LOG_DOCS` rows. Remove
the now-unneeded custom class-summary generator.

**Tech stack:** TypeScript, Jest, Google Apps Script V8, GasLibraryFactory
`GoogleApiWrapper.DocumentService`, `WorkspaceTemplateEngine`.

**Approved design:** `docs/superpowers/specs/2026-07-23-e2e-email-boxes-riepilogo-table-design.md`

---

## Task 1: Let the E2E artifact factory author Docs tables

**Files:**

- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/GasArtifactFactory.ts`
- Test: `test/unit/onlinetests/gas-artifact-factory.test.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`

### Step 1: Write failing factory tests

Extend the fake `DocumentBuilder` in
`test/unit/onlinetests/gas-artifact-factory.test.ts` with a recorded
`createTable(data, options)` call.

Add this behavior test:

```ts
test('createDocument batches paragraphs and template tables through DocumentService', () => {
  const id = factory.createDocument(
    'Riepilogo',
    'folder-1',
    ['Titolo {{focus.classe.anagrafica.nome}}'],
    [
      {
        data: [
          ['Alunno', 'Religione', 'Email'],
          [
            '{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}',
            '{{status.religione}}',
            '{{anagrafica.email}}'
          ]
        ],
        options: { headerRow: true }
      }
    ]
  );

  expect(id).toBe('doc-1');
  expect(calls).toEqual([
    ['appendParagraph', 'Titolo {{focus.classe.anagrafica.nome}}'],
    [
      'createTable',
      [
        ['Alunno', 'Religione', 'Email'],
        [
          '{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}',
          '{{status.religione}}',
          '{{anagrafica.email}}'
        ]
      ],
      { headerRow: true }
    ],
    ['execute']
  ]);
});
```

Also test table-only content. It must still call `execute()` once.

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/gas-artifact-factory.test.ts
```

Expected: FAIL because `IArtifactFactory.createDocument` and
`GasArtifactFactory.createDocument` do not accept tables.

### Step 2: Add the minimal table-capable port

In `src/onlinetests/E2eTemplateProvisioner.ts`, export:

```ts
export interface E2eDocumentTable {
  data: string[][];
  options?: GasLibs.DocumentCreateTableOptions;
}
```

Change only the existing port:

```ts
createDocument(
  name: string,
  folderId: string,
  paragraphs?: string[],
  tables?: E2eDocumentTable[]
): string;
```

In `src/onlinetests/GasArtifactFactory.ts`, keep one builder and one execution:

```ts
createDocument(
  name: string,
  folderId: string,
  paragraphs: string[] = [],
  tables: E2eDocumentTable[] = []
): string {
  const { documentId, builder } = this.documents.createDocument(name, {
    destinationFolder: folderId
  });

  for (const paragraph of paragraphs) builder.appendParagraph(paragraph);
  for (const table of tables) builder.createTable(table.data, table.options);

  if (paragraphs.length > 0 || tables.length > 0) {
    const result = builder.execute();
    if (!result.success) {
      throw new DomainError(`Creazione contenuto documento E2E fallita: ${result.errors.join('; ')}`);
    }
  }
  return documentId;
}
```

Do not use `DocumentApp` or `insertTableAtMarker`.

### Step 3: Run the focused tests

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/gas-artifact-factory.test.ts
```

Expected: PASS.

### Step 4: Commit

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/GasArtifactFactory.ts test/unit/onlinetests/gas-artifact-factory.test.ts
git commit -m "feat: support tables in e2e document templates"
```

---

## Task 2: Replace the custom class-summary generator with DOCUMENTO_GENERICO

**Files:**

- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Modify: `src/config/Bootstrap.ts`
- Delete: `src/application/strategies/RiepilogoClasseGeneratorStrategy.ts`
- Delete: `test/unit/application/riepilogo-classe-generator.test.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`
- Test: `test/unit/config/bootstrap.test.ts`

### Step 1: Write failing provisioning/configuration tests

In `e2e-template-provisioner.test.ts`, record both paragraph and table arguments.
Replace marker assertions with:

```ts
expect(riepilogo.paragraphs.join('\n')).not.toContain('{{TABELLA_ALUNNI}}');
expect(riepilogo.tables).toEqual([
  {
    data: [
      ['Alunno', 'Religione', 'Email', 'Piani'],
      [
        '{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}',
        '{{status.religione}}',
        '{{anagrafica.email}}',
        '{{didattica.piani.hasPiani}}'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  }
]);
```

Assert the provisioned name is versioned, for example
`E2E Riepilogo Template v2`, so a stale marker template cannot be reused.

In `e2e-sample-database-builder.test.ts`, assert:

```ts
expect(riepilogo.GENERATORE).toBe('DOCUMENTO_GENERICO');
expect(riepilogo.TIPO).toBe('RIEPILOGO_CLASSE');
```

In `bootstrap.test.ts`, replace the expected strategy keys so
`RIEPILOGO_CLASSE` is absent and `DOCUMENTO_GENERICO` remains registered.

Run:

```bash
npx jest --config jest.config.cjs \
  test/unit/onlinetests/e2e-template-provisioner.test.ts \
  test/unit/onlinetests/e2e-sample-database-builder.test.ts \
  test/unit/config/bootstrap.test.ts
```

Expected: FAIL on marker/template/config/registry expectations.

### Step 2: Provision a real loop table

In `E2eTemplateProvisioner.ts`:

- rename the template to `E2E Riepilogo Template v2`;
- keep useful title/metadata paragraphs;
- remove `{{TABELLA_ALUNNI}}`;
- pass one table to `findOrCreateDoc`;
- put `{{#tablerow_loop:focus.classe.studenti.listaCompleta}}` in the first
  cell of the template row;
- use item-relative placeholders in remaining cells;
- thread the optional `tables` argument through `findOrCreateDoc`.

Use canonical CDU fields only:

```ts
const RIEPILOGO_TABLES: E2eDocumentTable[] = [
  {
    data: [
      ['Alunno', 'Religione', 'Email', 'Piani'],
      [
        '{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}',
        '{{status.religione}}',
        '{{anagrafica.email}}',
        '{{didattica.piani.hasPiani}}'
      ]
    ],
    options: { headerRow: true, alternatingRows: true }
  }
];
```

### Step 3: Switch configuration and remove the special strategy

In `E2eSampleDatabaseBuilder.ts`, change only the summary `CONF_DOC` row:

```ts
GENERATORE: 'DOCUMENTO_GENERICO'
```

Keep `TIPO: 'RIEPILOGO_CLASSE'`.

In `Bootstrap.ts`, remove the import, construction, and registry entry for
`RiepilogoClasseGeneratorStrategy`. Delete the strategy source and its dedicated
test; behavior is now covered by the generic renderer and provisioning tests.

### Step 4: Run focused tests

```bash
npx jest --config jest.config.cjs \
  test/unit/onlinetests/gas-artifact-factory.test.ts \
  test/unit/onlinetests/e2e-template-provisioner.test.ts \
  test/unit/onlinetests/e2e-sample-database-builder.test.ts \
  test/unit/config/bootstrap.test.ts \
  test/unit/application/generic-document-generator.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add -A src/onlinetests src/config/Bootstrap.ts src/application/strategies test/unit/onlinetests test/unit/config test/unit/application
git commit -m "fix: render class summaries with generic table templates"
```

---

## Task 3: Make E2E email services observe generated LOG_DOCS

**Files:**

- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts`

### Step 1: Write a failing lifetime/order regression

Build a recording fake container in `e2e-scenario-checks.test.ts`.
The fake document service records each generation. Resolving
`emailNotificationService` records `resolve-email`.

Register and execute the scenarios, then assert:

```ts
expect(events.indexOf('resolve-email')).toBeGreaterThan(events.lastIndexOf('generate-document'));
```

Also assert the email service is resolved once and reused by scenarios 4–7.

This test must fail against the current eager resolution at the top of
`registerE2eScenarioChecks`.

### Step 2: Resolve EmailNotificationService lazily

Remove:

```ts
const email = container.get<EmailNotificationService>('emailNotificationService');
```

Add a closure that is first called inside scenario 4:

```ts
let emailService: EmailNotificationService | null = null;
const getEmailService = (): EmailNotificationService => {
  if (emailService === null) {
    emailService = container.get<EmailNotificationService>('emailNotificationService');
  }
  return emailService;
};
```

Replace scenario calls with `getEmailService().sendPattern(...)`.

Reason: scenarios 1–3 first write `LOG_DOCS`; constructing repositories/context
afterward guarantees that `DocumentiClasseProvider` and any repository indexes see
those rows in the live GAS run.

Do not weaken or bypass `RenderBoxesStep`.

### Step 3: Add actionable email diagnostics

Add a local formatter:

```ts
function emailDiagnostics(result: EmailSendResult): string {
  return [
    `targets=${result.targets}`,
    `sent=${result.sent}`,
    `skipped=${result.skipped}`,
    `errors=${result.errors.length > 0 ? result.errors.join(' | ') : 'none'}`
  ].join(', ');
}
```

For verbale and condotta E2E scenarios, fail if:

```ts
result.sent === 0 || result.skipped > 0 || result.errors.length > 0
```

The strict `skipped > 0` check is scenario-specific: every seeded target should
have a matching generated document. It does not change production semantics.

The failure message must include `emailDiagnostics(result)`.

### Step 4: Run the focused test

```bash
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
git commit -m "fix: resolve e2e email pipeline after document generation"
```

---

## Task 4: Lock the semantic box-send invariant with pipeline tests

**Files:**

- Modify: `test/unit/application/email-steps.test.ts`
- Modify: `test/unit/application/email-notification-service.test.ts`
- Optionally modify only if a test exposes a defect:
  `src/application/pipelines/emailSteps.ts`

### Step 1: Add RenderBoxesStep truth-table tests

Add explicit tests for:

```text
one visible non-empty document box -> shouldSend true
one visible non-empty carenze text box, no links -> shouldSend true
all rendered boxes empty/invisible -> shouldSend false
```

For the carenze case, assert semantic HTML/text content, not URLs:

```ts
expect(result.ordered[0]?.html).toContain('Matematica');
expect(result.ordered[0]?.html).not.toContain('href=');
expect(ctx.get('shouldSend')).toBe(true);
```

This captures the user requirement: content is sufficient; a real link is never
globally required.

### Step 2: Add an end-to-end service test for document boxes

In `email-notification-service.test.ts`, use real `DocumentiClasseProvider`,
real box rendering, seeded `CONF_MAIL`, and seeded `LOG_DOCS` rows for:

- `TIPO: VERBALE`;
- `TIPO: CONDOTTA`.

For each pattern, assert:

```ts
expect(result.targets).toBeGreaterThan(0);
expect(result.sent).toBe(result.targets);
expect(result.skipped).toBe(0);
expect(result.errors).toEqual([]);
expect(sentBodies.every((html) => html.trim().length > 0)).toBe(true);
```

Also assert the matching generated document name is present in each rendered body.
This validates the complete path:

```text
LOG_DOCS -> LogDocumentoRepository -> DocumentiClasseProvider
         -> CDU -> FILTRO_TIPO -> documenti box -> send gate
```

Do not add a static/fake `testo_dinamico` box.

### Step 3: Run focused email tests

```bash
npx jest --config jest.config.cjs \
  test/unit/application/email-steps.test.ts \
  test/unit/application/email-notification-service.test.ts \
  test/unit/application/context-engine/documenti-classe-provider.test.ts
```

Expected: PASS without production changes. If a test fails, use the failing
pipeline stage to correct only that defect, then rerun.

### Step 4: Commit

```bash
git add test/unit/application/email-steps.test.ts test/unit/application/email-notification-service.test.ts
git commit -m "test: enforce semantic email box send behavior"
```

---

## Task 5: Mandatory graph review and full verification

**Files:**

- No intended source edits

### Step 1: Refresh the code graph

Index the workspace graph in fast mode after edits:

```text
index_repository(
  repo_path="/home/giulio/Desktop/ALDO implementing",
  name="home-giulio-Desktop-ALDO-implementing",
  mode="fast"
)
```

### Step 2: Run required graph audits

Use `query_graph` to inspect ALDO `src/` calls to these native GAS globals:

```text
SpreadsheetApp, DriveApp, MailApp, GmailApp, DocumentApp,
PropertiesService, CacheService, UrlFetchApp, Utilities,
Session, ScriptApp, LockService
```

Expected: no new direct call; the new table call resolves to
`GasLibs.DocumentBuilder.createTable`.

Use `search_graph` for `RiepilogoClasseGeneratorStrategy`.
Expected: no source definition or Bootstrap linkage.

Use `trace_path`:

- outbound from `registerE2eScenarioChecks`;
- outbound from `DocumentiClasseProvider.provide`;
- inbound to `RenderBoxesStep._executeLogic`.

Expected linkage:

```text
online scenario -> EmailNotificationService.sendPattern
-> BuildCDUStep -> DocumentiClasseProvider
-> RenderBoxesStep -> SendEmailsStep
```

Run dead-code query for ALDO functions/methods with zero incoming `CALLS`,
excluding GAS entrypoints and tests. Review new/changed results; do not delete
unrelated code.

Run `get_architecture` on `src/` with `boundaries`, `layers`, and `dependencies`.
Expected: no new cycle; online tests depend on the injected GLF port only.

### Step 3: Run static verification

```bash
npm run typecheck
npm run lint
git diff --check
```

Expected: all exit 0.

### Step 4: Run all automated tests

```bash
npm test
npm run test:integration
npm run test:build
npm run build:online
```

Expected: all exit 0. `build:online` must produce the online test bundle and pass
its offline push gate.

### Step 5: Inspect the final diff

```bash
git status --short
git diff --stat
git diff -- src test
```

Confirm:

- no `dist/` edits;
- no native GAS globals introduced;
- no fake email box;
- no link-only send condition;
- no custom summary generator remains;
- changes are limited to approved behavior.

### Step 6: Final commit if verification required follow-up edits

```bash
git add -A src test
git commit -m "test: verify online document and email scenarios"
```

### Step 7: Live GAS acceptance

After pushing the verified online build, run `runE2eScenarios` in Apps Script.
Acceptance:

```text
scenario 8: pass; summary document contains one rendered row per student
scenario 4: sent > 0, skipped = 0, errors = []
scenario 5: sent > 0, skipped = 0, errors = []
scenario 6: still sends carenze content even without links
all other scenarios: pass
```

If live failure remains, use the new `targets/sent/skipped/errors` diagnostics
before changing production semantics.
