# Drop NOME From Duplicate Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `CONF_DOC.FILE_NAME` use `{{progressivo}}` for sequential numbering (e.g. "Verbale n.3") without breaking `DUPLICAZIONE=NEGATA` — by removing `NOME` from `CheckDuplicatesStep`'s duplicate-identity match, since it was never able to work once the rendered name contains a value (`progressivo`) that mechanically advances between runs.

**Architecture:** One-file code change (`src/application/pipelines/documentSteps.ts`, `CheckDuplicatesStep._executeLogic`): drop the `FILE_NAME` render and the `NOME` predicate from the `LOG_DOCS` lookup; identity becomes `TIPO`+`SOTTOTIPO`+`ID_GEN`+`PATH`(+`UTENTI` for `PIANO_PERS`). No pipeline reorder, no schema change — `SPECS_ALDO/01_SCHEMA_DATABASE.md` and `SPECS_ALDO/02_CDU_STRUTTURA.md` are already updated (commit `f91bd42`) documenting this identity rule.

**Tech Stack:** TypeScript, Jest (`ts-jest`), existing `PipelineFramework` `Step` base class, `FakeDatabase`/`FakeTemplateEngine` test doubles.

## Global Constraints

- Target is GAS V8 — synchronous code only, no Node-specific APIs.
- Never edit `dist/*`.
- Route all persistence/Drive/etc. through existing facades — this task touches no facades, pure logic change inside an existing `Step`.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration` before calling this done.

---

### Task 1: Update `CheckDuplicatesStep` identity match + regression test

**Files:**
- Modify: `src/application/pipelines/documentSteps.ts:162-213` (`CheckDuplicatesStep._executeLogic` and `_getLogDetails`)
- Modify: `test/unit/application/pipelines/document-steps.test.ts` (three existing tests + one new regression test — exact locations below)

**Interfaces:**
- Consumes: existing `CheckDuplicatesStep` constructor `(logger: LoggerService, db: IDatabase, templates: ITemplateEngine)` — unchanged signature.
- Produces: `ctx.get('shouldGenerate')` (boolean) and `ctx.get('skipReason')` (string | null) — same keys, same types, as today. No other task depends on this one; this is the whole change.

- [ ] **Step 1: Write the failing regression test — `{{progressivo}}` in FILE_NAME is still caught as a duplicate**

Add this test to `test/unit/application/pipelines/document-steps.test.ts`, inside the existing `describe('CheckDuplicatesStep — DUPLICAZIONE policy', ...)` block (found near the end of the file, alongside the `'PERMESSA bypasses...'` and `'NEGATA allows a document when only its generated name differs'` tests):

```ts
  test('NEGATA recognizes a duplicate even when {{progressivo}} makes the rendered name differ from the stored NOME', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Verbale_1', // stored with a progressivo baked in from a prior run
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      FILE_NAME: 'Verbale_{{progressivo}}', // today's render would produce e.g. "Verbale_2" (unresolved/different number)
      DUPLICAZIONE: DuplicazioneDocumento.NEGATA
    });

    new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);

    expect(ctx.get('shouldGenerate')).toBe(false);
  });
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "recognizes a duplicate even when"`
Expected: FAIL — `shouldGenerate` is `true` (today's code still compares the rendered `NOME`, which won't match `'Verbale_1'` since `progressivo` is unresolved at this point in the pipeline, rendering something like `'Verbale_'`).

- [ ] **Step 3: Update the two existing tests whose expectations depend on the old NOME-inclusive behavior**

In the same file, find this test (in the top-level `describe('CheckDuplicatesStep — DUPLICAZIONE policy', ...)` block):

```ts
  test('NEGATA allows a document when only its generated name differs', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Altro_verbale',
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      DUPLICAZIONE: DuplicazioneDocumento.NEGATA
    });
    new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
    expect(ctx.get('shouldGenerate')).toBe(true);
  });
```

Replace it with (rename + invert expectation — this is the documented behavior change):

```ts
  test('NEGATA blocks a document whose NOME differs but TIPO/SOTTOTIPO/ID_GEN/PATH match (identity excludes NOME)', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Altro_verbale',
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      DUPLICAZIONE: DuplicazioneDocumento.NEGATA
    });
    new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
    expect(ctx.get('shouldGenerate')).toBe(false);
  });
```

Then find this test (in the `describe('document pipeline operational log details', ...)` block near the top of the file):

```ts
  test('publishes the duplicate identity when generation is stopped', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Verbale_5A_01/07/2026',
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);

    const result = new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);

    expect(logDetails(result)).toBe(
      'Duplicato: TIPO=VERBALE, SOTTOTIPO=, ID_GEN=CD1, PATH=Verbali/5, NOME=Verbale_5A_01/07/2026'
    );
  });
```

Leave this test's assertion text as-is for now (Step 5 below explains why it keeps passing unmodified once the implementation uses the *matched row's* `NOME` for the message — this fixture's stored `NOME` happens to equal what a fresh render would have produced, so the message text is unaffected by the change).

- [ ] **Step 4: Run all three tests again to confirm the expected failures**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "NEGATA"`
Expected: the renamed "blocks a document whose NOME differs" test FAILS (`shouldGenerate` is `true`, old code still allows it); the new "recognizes a duplicate even when {{progressivo}}" test still FAILS from Step 2.

- [ ] **Step 5: Implement — drop NOME from `CheckDuplicatesStep`'s identity predicate**

In `src/application/pipelines/documentSteps.ts`, replace the body of `CheckDuplicatesStep._executeLogic` (currently lines 162-205):

```ts
  protected _executeLogic(ctx: PipelineContext): void {
    const duplicazione = String(
      cfg(ctx)[COL_CONF_DOC.DUPLICAZIONE] ?? DuplicazioneDocumento.NEGATA
    );
    if (duplicazione === 'PERMESSA') return;

    const idGen = String(cfg(ctx)[COL_CONF_DOC.ID]);
    const tipo = String(cfg(ctx)[COL_CONF_DOC.TIPO] ?? '');
    const pianoPersonalizzato = isPianoPersonalizzato(ctx);
    const sottotipoValue = sottotipo(ctx);
    const utenti = pianoPersonalizzato
      ? resolveLogRegistration(
          cfg(ctx)[COL_CONF_DOC.REGISTRA_DOC],
          this.templates,
          cduRecord(ctx),
          'REGISTRA_DOC'
        ).utenti
      : '';
    const path = this.templates.processString(
      String(cfg(ctx)[COL_CONF_DOC.PATH_OUT] ?? ''),
      cduRecord(ctx)
    );
    // NOME is intentionally excluded from the identity match: it can embed
    // {{progressivo}}, a folder-file-count that mechanically advances between
    // runs, so a rendered-name comparison can never recognize a rerun of the
    // same document as a duplicate (SPECS_ALDO/01_SCHEMA_DATABASE.md,
    // CONF_DOC.DUPLICAZIONE). Distinguishable instances of a document type
    // (e.g. one verbale per meeting) get their own CONF_DOC.ID instead.
    const existing = this.db.table(TABLE.LOG_DOCS).find(
      (r) =>
        String(r[COL_LOG_DOCS.TIPO] ?? '') === tipo &&
        String(r[COL_LOG_DOCS.SOTTOTIPO] ?? '') === sottotipoValue &&
        String(r[COL_LOG_DOCS.ID_GEN] ?? '') === idGen &&
        (!pianoPersonalizzato || String(r[COL_LOG_DOCS.UTENTI] ?? '') === utenti) &&
        String(r[COL_LOG_DOCS.PATH] ?? '') === path
    );
    if (existing) {
      this.setResult(ctx, 'shouldGenerate', false);
      this.setResult(
        ctx,
        'skipReason',
        `Duplicato: TIPO=${tipo}, SOTTOTIPO=${sottotipoValue}, ID_GEN=${idGen}, PATH=${path}, NOME=${String(existing[COL_LOG_DOCS.NOME] ?? '')}`
      );
    }
  }
```

Note what changed from the current implementation: the `nome`/`FILE_NAME` render is gone entirely (no more `this.templates.processString(String(cfg(ctx)[COL_CONF_DOC.FILE_NAME] ?? ''), cduRecord(ctx))` call in this method); the `existing` query predicate drops its `NOME` clause; the `skipReason` message now reads `NOME` from the *matched row* (`existing[COL_LOG_DOCS.NOME]`) purely for informative logging, not for matching.

`_getLogDetails` (lines 207-213) is unchanged — it only reads `ctx.get('shouldGenerate')`/`ctx.get('skipReason')`, both still set the same way.

- [ ] **Step 6: Run the full test file to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -v`
Expected: PASS — all tests green, including the renamed/inverted test and the new regression test. Confirm the `'publishes the duplicate identity when generation is stopped'` test still passes unmodified (fixture's stored `NOME='Verbale_5A_01/07/2026'` flows through `existing[COL_LOG_DOCS.NOME]` into the same message string as before).

- [ ] **Step 7: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors (no new unused imports — `COL_CONF_DOC.FILE_NAME` is still used elsewhere in the file by `GenerateNameStep`, so the import stays valid; confirm `this.templates` is still used in `CheckDuplicatesStep` via the `PATH_OUT` render and `resolveLogRegistration`, so the constructor parameter isn't now unused).

- [ ] **Step 8: Run the full unit + integration suites**

Run: `npm test && npm run test:integration`
Expected: PASS. Pay attention to any other test (e.g. `document-generation-service.test.ts`, or e2e fixtures) that asserts duplicate-skip behavior relying on `NOME` — if any such test exists and fails, apply the same fix pattern (identity match no longer includes `NOME`) rather than reintroducing the old predicate.

- [ ] **Step 9: Commit**

```bash
git add src/application/pipelines/documentSteps.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "fix: drop NOME from CheckDuplicatesStep duplicate identity

{{progressivo}} in FILE_NAME (folder-file-count, mechanically advances
between runs) made NOME-based identity matching unable to recognize
reruns as duplicates. Identity is now TIPO+SOTTOTIPO+ID_GEN+PATH
(+UTENTI for PIANO_PERS), matching SPECS_ALDO/01_SCHEMA_DATABASE.md's
documented CONF_DOC.DUPLICAZIONE semantics (already updated in a prior
commit). Distinguishable document instances (e.g. one verbale per
meeting) need their own CONF_DOC.ID row."
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** the design doc (`docs/superpowers/specs/2026-08-08-progressivo-in-filename-design.md`) lists exactly one code change (`CheckDuplicatesStep`) plus the already-committed `SPECS_ALDO` doc updates (commit `f91bd42`) — this plan's single task covers the remaining code+test work in full.
- **No schema change, no pipeline reorder** — confirm nothing in `DocumentGenerationService.buildPipeline` needs touching; the step order stays `AnalyzeContext -> CheckDuplicates -> PrepareInfrastructure -> GenerateName -> ...`.
- If a future document type genuinely needs per-occasion identity beyond what `SOTTOTIPO`/`UTENTI`/`PATH` capture without minting a new `CONF_DOC.ID` per occasion, that's new scope — out of this plan, would need its own design.
