# Permessi storici dei piani personalizzati Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Assegnare ai ruoli della classe corrente i permessi configurati sui piani dello stesso alunno registrati negli anni scolastici precedenti.

**Architecture:** MasterStoricoDatabaseProvider resta l'unico accesso al Master Sheet ed è condiviso fra CDU e storico. StoricoDocumentiService restituisce gli ID Drive; PostProcessStep documentale delega la nuova azione riconosciuta dall'executor condiviso alle facciate Drive e ruoli esistenti.

**Tech Stack:** TypeScript, GAS V8, Jest/ts-jest, SheetDBLib, WorkspaceTemplateEngine, RoleResolutionLib, PipelineFramework.

**Spec:** docs/superpowers/specs/2026-09-04-permessi-storici-piani-design.md

## Global Constraints

- Usare codebase-memory MCP prima di scoprire o cambiare codice.
- GAS V8 sincrono; nessuna API Node o Google nativa fuori dalle facciate/librerie autorizzate.
- Riutilizzare MasterStoricoDatabaseProvider, StoricoDocumentiService, RisolutoreRuoliService, IDriveFacade e WorkspaceTemplateEngine; nessuna estensione GasLibraryFactory.
- criteri è un oggetto opzionale con UTENTI, SOTTOTIPO, TIPO, CLASSI, MATERIE. Il sistema impone sempre ID_GEN=target.
- UTENTI, CLASSI e MATERIE usano matching CSV; TIPO e SOTTOTIPO uguaglianza esatta.
- L'errore dell'azione è non critico: il documento già registrato non viene eliminato.
- Non modificare dist/*; preservare i cambiamenti utente non correlati.

---

## File structure

- src/application/storico/StoricoDocumentiService.ts — filtra gli ID Drive storici.
- src/application/pipelines/postProcessActions.ts — grammatica e dispatch opzionale.
- src/application/pipelines/documentSteps.ts — handler e grant Drive.
- src/application/services/DocumentGenerationService.ts — dipendenza storico.
- src/config/Bootstrap.ts — provider storico condiviso.
- test/unit/application/storico-services.test.ts — criteri e profondità.
- test/unit/application/pipelines/post-process-actions.test.ts — dispatch e template.
- test/unit/application/pipelines/document-steps.test.ts — ruoli, grant ed errori.
- test/integration/permessi-storici-piani.test.ts — flusso 3D → 4D.
- SPECS_ALDO/01_SCHEMA_DATABASE.md e src/onlinetests/data/SharedTestDatabaseBuilder.ts — contratto e seed.

### Task 1: Selezionare gli ID di LOG_DOCS storici

**Files:**

- Modify: src/application/storico/StoricoDocumentiService.ts
- Test: test/unit/application/storico-services.test.ts

**Interfaces:**

- Consumes: StoricoDatabaseProvider.anniStorici(profondita), ILogDocumentoRepository.findAll(), LogDocumento.id/idGen/tipo/getSottotipo()/containsUtente()/containsClasse()/containsMateria().
- Produces: StoricoDocumentiService.idsMatching(criteri: Record<string, string>, profondita: number): string[].

- [ ] **Step 1: Write failing tests for every criterion and depth**

```
expect(service.idsMatching({ ID_GEN: 'PIANI_PERSONALIZZATI', UTENTI: 'a1@school.it' }, 1))
  .toEqual(['pdp-bes-3d']);
expect(service.idsMatching({ ID_GEN: 'PIANI_PERSONALIZZATI', SOTTOTIPO: 'PDP_BES' }, 1))
  .toEqual(['pdp-bes-3d']);
expect(service.idsMatching({ ID_GEN: 'PIANI_PERSONALIZZATI', TIPO: 'PIANO_PERS', CLASSI: '3D', MATERIE: '' }, 1))
  .toEqual(['pdp-bes-3d']);
expect(service.idsMatching({ ID_GEN: 'PIANI_PERSONALIZZATI' }, 1))
  .toEqual(['pdp-bes-3d', 'pei-3d']);
```

Create two historical years with records differing one field at a time. Assert supplied criteria are ANDed, an empty criteria object does not constrain the implicit generator filter, and depth 1 excludes year two.

- [ ] **Step 2: Run the test to verify it fails**

Run: npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "idsMatching"

Expected: FAIL because idsMatching does not exist.

- [ ] **Step 3: Implement the minimal selector**

```
idsMatching(criteri: Record<string, string>, profondita: number): string[] {
  return this.provider.anniStorici(profondita).flatMap(({ logDocs }) =>
    logDocs.findAll().flatMap((doc) =>
      doc.id !== null && Object.entries(criteri).every(([column, value]) =>
        matchesLogDocsCriterion(doc, column, value)
      ) ? [doc.id] : []
    )
  );
}
```

Add matchesLogDocsCriterion in this module. Map UTENTI, CLASSI and MATERIE to the entity CSV methods, ID_GEN/TIPO/SOTTOTIPO to exact accessors, and throw ValidationError for any unsupported column.

- [ ] **Step 4: Run the focused test file**

Run: npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/application/storico/StoricoDocumentiService.ts test/unit/application/storico-services.test.ts
git commit -m "feat: query historical document ids by criteria"
```

### Task 2: Recognize the document-only action and issue grants

**Files:**

- Modify: src/application/pipelines/postProcessActions.ts
- Modify: src/application/pipelines/documentSteps.ts
- Test: test/unit/application/pipelines/post-process-actions.test.ts
- Test: test/unit/application/pipelines/document-steps.test.ts

**Interfaces:**

- Consumes: StoricoDocumentiService.idsMatching(), IDriveFacade.setPermissions(), IRoleResolver.risolvi(), PipelineContext newFileId and current CDU.
- Produces: AGGIORNA_PERMESSI_STORICI with target, ruolo, permesso, profondita and optional criteri; returns granted historical-file count.

- [ ] **Step 1: Write failing executor and pipeline-step tests**

```
const actions = JSON.stringify([{
  tipo: 'AGGIORNA_PERMESSI_STORICI',
  target: 'PIANI_PERSONALIZZATI', ruolo: 'COORDINATORI',
  permesso: 'LETTURA', profondita: 1,
  criteri: { UTENTI: '{{focus.alunno.email}}', SOTTOTIPO: '{{focus.piano.tipo}}' }
}]);
expect(executePostProcess(actions, cdu, db, templates, now, logger, handler)).toBe(1);
expect(handler).toHaveBeenCalledWith(expect.objectContaining({ target: 'PIANI_PERSONALIZZATI' }), {
  UTENTI: 'a1@school.it', SOTTOTIPO: 'PDP_BES'
});
```

For PostProcessStep, fake idsMatching as returning old-pdp and new-pdp, set newFileId to new-pdp, resolve COORDINATORI from a 4D CDU, and assert only old-pdp gets a reader grant for coord4d@school.it. Add tests for no result, no criteria, every missing required property, and a throwing Drive facade while the current LOG_DOCS record persists.

- [ ] **Step 2: Run the tests to verify they fail**

Run: npx jest --config jest.config.cjs test/unit/application/pipelines/post-process-actions.test.ts test/unit/application/pipelines/document-steps.test.ts -t "AGGIORNA_PERMESSI_STORICI"

Expected: FAIL because executor dispatch and step handler do not exist.

- [ ] **Step 3: Implement dispatch and handler**

```
export type PostProcessActionHandler = (
  action: PostProcessAction,
  criteri: Record<string, string>
) => number;

// in executePostProcess
case 'AGGIORNA_PERMESSI_STORICI':
  if (handler === undefined) {
    logger.warn('POST_PROCESSO: AGGIORNA_PERMESSI_STORICI non disponibile — saltata');
    break;
  }
  updated += handler(action, criteri);
  break;
```

Extend PostProcessAction with optional target, ruolo, permesso and profondita. In PostProcessStep validate target/ruolo/permesso and positive profondita; append ID_GEN: target after resolved criteria; call idsMatching; exclude newFileId; resolve ruolo against the current CDU; make PermissionGrant[]; call setPermissions once. No new facade, factory, or generic history service.

- [ ] **Step 4: Run unit tests**

Run: npx jest --config jest.config.cjs test/unit/application/pipelines/post-process-actions.test.ts test/unit/application/pipelines/document-steps.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/application/pipelines/postProcessActions.ts src/application/pipelines/documentSteps.ts test/unit/application/pipelines/post-process-actions.test.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "feat: grant historical document permissions"
```

### Task 3: Share provider, inject service, test end-to-end flow

**Files:**

- Modify: src/application/services/DocumentGenerationService.ts
- Modify: src/config/Bootstrap.ts
- Create: test/integration/permessi-storici-piani.test.ts
- Test: test/unit/application/document-generation-service.test.ts
- Test: test/unit/config/bootstrap.test.ts

**Interfaces:**

- Consumes: MasterStoricoDatabaseProvider(master, logger), ContextEngineFactory.create({ storicoDb }), StoricoDocumentiService(provider).
- Produces: required DocumentGenerationDeps.storicoDocumenti and one container-owned storicoDb shared by CDU and PostProcessStep.

- [ ] **Step 1: Write failing wiring and integration tests**

```
expect(container.get<StoricoDatabaseProvider>('storicoDb'))
  .toBe(container.get<StoricoDatabaseProvider>('storicoDb'));

expect(drive.permissions).toContainEqual({
  fileId: 'pdp-bes-3d', email: 'coord4d@school.it', permesso: 'LETTURA'
});
expect(drive.permissions).not.toContainEqual(expect.objectContaining({ fileId: 'pei-3d' }));
expect(drive.permissions).not.toContainEqual(expect.objectContaining({ fileId: 'other-student-pdp' }));
```

Build current 4D and historical 3D databases. Generate PDP_BES for the current student, then prove normal registration and the historic grant. Repeat with PEI and a second student to prove subtype and student isolation.

- [ ] **Step 2: Run the tests to verify they fail**

Run: npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts test/unit/config/bootstrap.test.ts && npx jest --config jest.integration.config.cjs test/integration/permessi-storici-piani.test.ts

Expected: FAIL because document generation lacks the dependency and Bootstrap lacks a shared provider.

- [ ] **Step 3: Wire the existing provider once**

```
c.register('storicoDb', () => new MasterStoricoDatabaseProvider(deps.master, logger));
c.register('storicoDocumenti', (container) =>
  new StoricoDocumentiService(container.get<StoricoDatabaseProvider>('storicoDb'))
);
```

Pass container.get('storicoDb') to ContextEngineFactory as storicoDb, pass container.get('storicoDocumenti') through DocumentGenerationDeps, save it in DocumentGenerationService, and inject it into PostProcessStep with the existing drive and role resolver. Keep PostProcessStep after RegisterDocumentStep.

- [ ] **Step 4: Run unit and integration tests**

Run: npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts test/unit/config/bootstrap.test.ts && npx jest --config jest.integration.config.cjs test/integration/permessi-storici-piani.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/application/services/DocumentGenerationService.ts src/config/Bootstrap.ts test/unit/application/document-generation-service.test.ts test/unit/config/bootstrap.test.ts test/integration/permessi-storici-piani.test.ts
git commit -m "feat: wire historical plan permissions"
```

### Task 4: Seed and document the DB action

**Files:**

- Modify: SPECS_ALDO/01_SCHEMA_DATABASE.md
- Modify: src/onlinetests/data/SharedTestDatabaseBuilder.ts
- Test: test/unit/onlinetests/shared-test-database-builder-migration.test.ts

**Interfaces:**

- Consumes: COL_CONF_DOC.POST_PROCESSO, TABLE.LOG_DOCS, COL_LOG_DOCS and PIANI_PERSONALIZZATI.
- Produces: an object-form seeded action and an authoritative configuration contract.

- [ ] **Step 1: Write a failing seed assertion**

```
const action = JSON.parse(String(pianiPersonali.POST_PROCESSO))[0];
expect(action).toEqual(expect.objectContaining({
  tipo: 'AGGIORNA_PERMESSI_STORICI', target: 'PIANI_PERSONALIZZATI',
  ruolo: 'COORDINATORI', permesso: 'LETTURA', profondita: 1,
  criteri: { UTENTI: '{{focus.alunno.email}}', SOTTOTIPO: '{{focus.piano.tipo}}' }
}));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: npx jest --config jest.config.cjs test/unit/onlinetests/shared-test-database-builder-migration.test.ts

Expected: FAIL because POST_PROCESSO is null.

- [ ] **Step 3: Add approved configuration and spec**

Set only PIANI_PERSONALIZZATI POST_PROCESSO to the approved JSON. Add the action to the CONF_DOC action table in 01_SCHEMA_DATABASE.md: implicit ID_GEN=target, optional supported criteria, CSV/exact matching, positive depth, and non-critical error behavior. Do not add DB columns or subtype-specific CONF_DOC rows.

- [ ] **Step 4: Run the seed test and unit suite**

Run: npx jest --config jest.config.cjs test/unit/onlinetests/shared-test-database-builder-migration.test.ts && npm test

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add SPECS_ALDO/01_SCHEMA_DATABASE.md src/onlinetests/data/SharedTestDatabaseBuilder.ts test/unit/onlinetests/shared-test-database-builder-migration.test.ts
git commit -m "docs: configure historical plan permissions"
```

### Task 5: Full verification

**Files:**

- Modify: none unless a preceding verification identifies a defect.

**Interfaces:**

- Consumes: all earlier tasks.
- Produces: verified type, lint, unit, integration and build output.

- [ ] **Step 1: Verify format and static checks**

Run: npm run typecheck && npm run lint && git diff --check

Expected: all exit 0.

- [ ] **Step 2: Run regression suites**

Run: npm test && npm run test:integration

Expected: all pass, including permessi-storici-piani.test.ts.

- [ ] **Step 3: Verify build contract**

Run: npm run test:build

Expected: PASS; no generated dist file has been edited manually.

- [ ] **Step 4: Inspect final worktree**

Run: git diff --check HEAD~4..HEAD && git status --short

Expected: no whitespace errors; only plan commits are committed and unrelated user changes remain untouched.

## Self-review

- Spec coverage: Tasks 1–3 implement depth, all approved criteria, current-CDU role resolution, exclusion, Drive grants and non-critical failure. Task 4 makes it DB-driven. Task 5 verifies all requested tiers.
- Placeholder scan: no deferred markers, unspecified tests or implicit signatures.
- Type consistency: Task 1 produces idsMatching; Task 2 consumes it; Task 3 injects it through DocumentGenerationDeps and PostProcessStep.
