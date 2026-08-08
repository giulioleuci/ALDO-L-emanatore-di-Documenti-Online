# Estensioni ALDO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4 extensions in `ESTENSIONI_ALDO/` (CDU `progressivo`, CDU rappresentanti genitori con figlio, `DOCUMENTO_DOCENTE_MATERIA` generator, dipartimento doc/email + conditional section removal), as designed in `docs/superpowers/specs/2026-08-07-estensioni-aldo-design.md`.

**Architecture:** Each extension slots into the existing layered pipeline (Domain → Application/context-engine → Infrastructure/facades) without new abstractions beyond what the spec calls for. Task 3 and Tasks 5-6 reuse the `PIANO_PERS`/`generatePiani` batch-axis pattern already in `DocumentBatchService`. Task 4 is a `GasLibraryFactory` library change (separate repo/build/test cycle), consumed by ALDO only via `npm run refresh:vendor`.

**Tech Stack:** TypeScript, Jest (`ts-jest`), Google Apps Script V8 target, `GasLibraryFactory` (WorkspaceTemplateEngine).

## Global Constraints

- GasLibraryFactory-first: never reimplement in ALDO what the library already provides (see CLAUDE.md).
- Native GAS globals only inside `GoogleApiWrapper`/facades — never in application/domain code.
- No `dist/*` edits. Fix source only.
- `npm run typecheck`, `npm run lint`, `npm test` must pass after every task.
- New services/repositories/providers are wired in `src/config/Bootstrap.ts` / `ContextEngineFactory.ts`, never constructed ad hoc.
- Follow TDD: failing test first, minimal implementation, passing test, commit.

---

### Task 1: CDU `progressivo` placeholder

**Files:**
- Modify: `src/infrastructure/facades/DriveServiceFacade.ts` (add `countFilesInFolder` to `IDriveFacade` + `DriveServiceFacade`)
- Modify: `src/application/context-engine/Cdu.ts` (add `progressivo?: number` to `CduMeta` and to root `Cdu`)
- Modify: `src/application/pipelines/documentSteps.ts:213-236` (`PrepareInfrastructureStep._executeLogic`)
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md` (document `meta.progressivo`)
- Test: `test/unit/infrastructure/drive-facade.test.ts`
- Test: `test/unit/application/pipelines/document-steps.test.ts`

**Interfaces:**
- Produces: `IDriveFacade.countFilesInFolder(folderId: string): number`; `Cdu.meta.progressivo?: number`; `Cdu.progressivo?: number`.

- [ ] **Step 1: Write the failing test for `countFilesInFolder`**

In `test/unit/infrastructure/drive-facade.test.ts`, add:

```typescript
describe('countFilesInFolder', () => {
  it('counts non-trashed, non-folder files via searchFiles', () => {
    const drive = { searchFiles: jest.fn().mockReturnValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) };
    const facade = new DriveServiceFacade(drive as any, {} as any, 'root');

    const count = facade.countFilesInFolder('folder123');

    expect(count).toBe(3);
    expect(drive.searchFiles).toHaveBeenCalledWith(
      expect.stringContaining("'folder123' in parents")
    );
    expect(drive.searchFiles).toHaveBeenCalledWith(expect.stringContaining('trashed=false'));
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts -t countFilesInFolder`
Expected: FAIL — `countFilesInFolder is not a function`.

- [ ] **Step 3: Implement `countFilesInFolder`**

In `src/infrastructure/facades/DriveServiceFacade.ts`, add to `IDriveFacade`:

```typescript
export interface IDriveFacade {
  // ... existing methods ...
  /** Counts non-trashed files (excluding subfolders) directly inside `folderId`. */
  countFilesInFolder(folderId: string): number;
}
```

Add to the `DriveServiceFacade` class (near `findFileByName`):

```typescript
countFilesInFolder(folderId: string): number {
  const query = `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed=false`;
  return this.drive.searchFiles(query).length;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts -t countFilesInFolder`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `PrepareInfrastructureStep`**

In `test/unit/application/pipelines/document-steps.test.ts`, find the existing `PrepareInfrastructureStep` describe block and add:

```typescript
it('sets cdu.meta.progressivo and the root alias from countFilesInFolder + 1', () => {
  const drive = { ...fakeDriveFacade(), countFilesInFolder: jest.fn().mockReturnValue(3) };
  const step = new PrepareInfrastructureStep(logger, drive, db, templates);
  const ctx = buildCduAt(/* existing helper args used elsewhere in this file */);

  step.execute(ctx);

  const cduResult = cdu(ctx);
  expect(cduResult.meta.progressivo).toBe(4);
  expect((cduResult as unknown as { progressivo: number }).progressivo).toBe(4);
});
```

Adapt `fakeDriveFacade()`/`buildCduAt(...)` to whatever helper names this test file already uses for other `PrepareInfrastructureStep` tests in the same file — reuse them, don't invent new ones.

- [ ] **Step 6: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t progressivo`
Expected: FAIL — `cduResult.meta.progressivo` is `undefined`.

- [ ] **Step 7: Implement in `PrepareInfrastructureStep`**

In `Cdu.ts`, add `progressivo?: number` to `CduMeta` (after `idEsecuzione`) and to the root `Cdu` interface (after `meta`).

In `documentSteps.ts`, at the end of `PrepareInfrastructureStep._executeLogic` (after `this.setResult(ctx, 'destFolderPath', path);`):

```typescript
    const progressivo = this.drive.countFilesInFolder(folderId) + 1;
    const cduObj = cdu(ctx);
    cduObj.meta.progressivo = progressivo;
    cduObj.progressivo = progressivo;
```

- [ ] **Step 8: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t progressivo`
Expected: PASS.

- [ ] **Step 9: Document in the CDU spec**

In `SPECS_ALDO/02_CDU_STRUTTURA.md`, section 2 (`meta`), add a line for `progressivo?: number` — "conteggio dei file già presenti nella cartella di destinazione Drive + 1; alias di radice `{{progressivo}}` per uso fuori dai loop".

- [ ] **Step 10: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: 0 errors, all green.

- [ ] **Step 11: Commit**

```bash
git add src/infrastructure/facades/DriveServiceFacade.ts src/application/context-engine/Cdu.ts src/application/pipelines/documentSteps.ts SPECS_ALDO/02_CDU_STRUTTURA.md test/unit/infrastructure/drive-facade.test.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "feat: add CDU progressivo placeholder (Drive folder file count + 1)"
```

---

### Task 2: CDU rappresentanti genitori con nome figlio

**Files:**
- Modify: `src/application/context-engine/Cdu.ts` (type of `rappresentanti.genitori` items)
- Modify: `src/application/context-engine/providers/RappresentantiProvider.ts:123-134`
- Test: `test/unit/application/context-engine/providers/rappresentanti-provider.test.ts` (or the existing test file for this provider — search for `RappresentantiProvider` under `test/unit/` and use whatever file already covers it)

**Interfaces:**
- Produces: each `focus.classe.rappresentanti.genitori[]` item gains `studente: { nomeCompleto: string }`.

- [ ] **Step 1: Write the failing test**

In the existing `RappresentantiProvider` test file, add a case for the non-articulated (ordinary/partner) branch:

```typescript
it('attaches studente.nomeCompleto to each genitore for ordinary classes', () => {
  const alunno = makeAlunno({ cognomeNome: 'Marco Neri', rappresentanteGenitore: 'Giuseppe Neri' });
  const classi = fakeClasseRepository({ getStudenti: () => [alunno], getArticolazione: () => null });
  const provider = new RappresentantiProvider(classi);
  const cdu = emptyCduWithClasse();

  provider.provide(cdu);

  expect(cdu.focus.classe!.rappresentanti!.genitori).toEqual([
    { nomeCompleto: 'Giuseppe Neri', studente: { nomeCompleto: 'Marco Neri' } }
  ]);
});
```

Use whatever `makeAlunno`/`fakeClasseRepository`/`emptyCduWithClasse` helpers the existing test file for this provider already defines — match their exact names and shapes rather than inventing new ones.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs -t "attaches studente.nomeCompleto"`
Expected: FAIL — actual genitori entry has no `studente` key.

- [ ] **Step 3: Update the type and the provider**

In `Cdu.ts`, the `genitori` array element type gains `studente: { nomeCompleto: string }` (drop the `?` — the parent-articolata branch already always sets it; this makes both branches consistent).

In `RappresentantiProvider.ts`, replace the ordinary/partner branch's genitori mapping:

```typescript
    const studenti = this.classi.getStudenti(classe);
    focusClasse.rappresentanti = {
      studenti: studenti
        .filter((a) => a.isRappresentante())
        .map((a) => ({ nomeCompleto: a.cognomeNome, email: a.email.value })),
      genitori: studenti
        .filter((a) => a.getRappresentanteGenitore().trim().length > 0)
        .map((a) => ({
          nomeCompleto: a.getRappresentanteGenitore().trim(),
          studente: { nomeCompleto: a.cognomeNome }
        }))
    };
```

(This restructures the existing two-step `.map().filter()` into `.filter().map()` so `a.cognomeNome` stays available inside the map — same behavior, no name collision.)

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs -t "attaches studente.nomeCompleto"`
Expected: PASS.

- [ ] **Step 5: Run the full provider test file to check no regression on the parent-articolata branch**

Run: `npx jest --config jest.config.cjs <path-to-rappresentanti-provider-test-file>`
Expected: all PASS (parent-articolata branch already produced this shape, unchanged).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/RappresentantiProvider.ts test/unit/application/context-engine/providers/rappresentanti-provider.test.ts
git commit -m "feat: expose studente.nomeCompleto on CDU rappresentanti.genitori"
```

---

### Task 3: `DOCUMENTO_DOCENTE_MATERIA` generator

**Files:**
- Create: `src/application/context-engine/providers/DocenteMateriaFocusProvider.ts`
- Create: `test/unit/application/context-engine/providers/docente-materia-focus-provider.test.ts`
- Modify: `src/application/context-engine/Cdu.ts` (`focus.docente`, `focus.materia`)
- Modify: `src/application/context-engine/Recipe.ts` (`BuildParams.docenteCorrente`, `RECIPES.CLASSE_DOCENTE_MATERIA`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register `'docenteMateriaFocus'`)
- Modify: `src/application/services/DocumentGenerationService.ts` (extract shared classe-build helper, add `generateForClasseDocenteMateria`)
- Modify: `src/application/services/DocumentBatchService.ts` (`generateDocentiMateria`, `batchGenerateHandler` branch, `BatchResumeState`)
- Modify: `src/application/pipelines/documentSteps.ts` (generalize `sottotipoPiano` → `sottotipo`)
- Test: `test/unit/application/services/document-generation-service.test.ts`
- Test: `test/unit/application/document-batch-service.test.ts`
- Test: `test/unit/application/pipelines/document-steps.test.ts`

**Interfaces:**
- Consumes: `Cdu.focus.classe.consiglioDiClasse: DocenteCdcVM[]` (each `{ anagrafica: PersonVM, materie: SubjectVM[], ... }`, already populated by the `'consiglio'` provider); `IClasseRepository.getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse` (`{ cattedre: Array<{ materia: MateriaId, docente: Docente }> }`); `buildPersonVmFromDocente(docente, materia?): PersonVM`.
- Produces: `Cdu.focus.docente?: PersonVM`; `Cdu.focus.materia?: SubjectVM`; `BuildParams.docenteCorrente?: string | null`; `DocumentGenerationService.generateForClasseDocenteMateria(classeId: ClasseId, docenteEmail: string, materiaId: string, confDocId: string, jobId?: string): DocumentGenerationResult`; `DocumentBatchService`'s new `'DOCUMENTO_DOCENTE_MATERIA'` `CONF_DOC.TIPO` branch; `sottotipo(ctx: PipelineContext): string` (replaces `sottotipoPiano`, same two call sites).

- [ ] **Step 1: Write the failing test for `DocenteMateriaFocusProvider`**

Create `test/unit/application/context-engine/providers/docente-materia-focus-provider.test.ts`:

```typescript
import { DocenteMateriaFocusProvider } from '../../../../../src/application/context-engine/providers/DocenteMateriaFocusProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';

function cduWithConsiglio(): Cdu {
  return {
    meta: { parametriInput: {} } as any,
    focus: {
      classe: {
        consiglioDiClasse: [
          {
            anagrafica: { email: 'rossi@scuola.it', nomeCompleto: 'Mario Rossi' } as any,
            materie: [{ sigla: 'MAT', nome: 'Matematica' } as any]
          }
        ]
      } as any
    },
    tech: {} as any
  };
}

describe('DocenteMateriaFocusProvider', () => {
  it('sets focus.docente and focus.materia from the matching cattedra', () => {
    const cdu = cduWithConsiglio();
    const provider = new DocenteMateriaFocusProvider();

    provider.provide(cdu, { docenteCorrente: 'rossi@scuola.it', materiaCorrente: 'MAT' } as any);

    expect(cdu.focus.docente).toEqual({ email: 'rossi@scuola.it', nomeCompleto: 'Mario Rossi' });
    expect(cdu.focus.materia).toEqual({ sigla: 'MAT', nome: 'Matematica' });
  });

  it('throws PipelineError when the docente/materia pair is not found', () => {
    const cdu = cduWithConsiglio();
    const provider = new DocenteMateriaFocusProvider();

    expect(() =>
      provider.provide(cdu, { docenteCorrente: 'ignoto@scuola.it', materiaCorrente: 'MAT' } as any)
    ).toThrow(PipelineError);
  });
});
```

(Match the `SubjectVM`/`PersonVM` field usage above to whatever minimal subset the real interfaces require in your local `Cdu.ts` — the test only needs the fields it asserts on.)

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/docente-materia-focus-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DocenteMateriaFocusProvider`**

Create `src/application/context-engine/providers/DocenteMateriaFocusProvider.ts`:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

export class DocenteMateriaFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const cdc = cdu.focus.classe?.consiglioDiClasse ?? [];
    const docenteCdc = cdc.find((d) => d.anagrafica.email === params.docenteCorrente);
    if (docenteCdc === undefined) {
      throw new PipelineError(
        `DOCUMENTO_DOCENTE_MATERIA: docente ${params.docenteCorrente ?? ''} non trovato nel consiglio di classe`
      );
    }
    const materia = docenteCdc.materie.find((m) => m.sigla === params.materiaCorrente);
    if (materia === undefined) {
      throw new PipelineError(
        `DOCUMENTO_DOCENTE_MATERIA: materia ${params.materiaCorrente ?? ''} non trovata per il docente ${params.docenteCorrente ?? ''}`
      );
    }
    cdu.focus.docente = docenteCdc.anagrafica;
    cdu.focus.materia = materia;
  }
}
```

In `Cdu.ts`, add to the root `focus` object type:

```typescript
  focus: {
    classe?: CduClasse;
    alunno?: CduAlunno;
    carenza?: CduCarenzaFocus;
    piano?: CduPianoFocus;
    docente?: PersonVM;
    materia?: SubjectVM;
  };
```

(Import `PersonVM`/`SubjectVM` at the top of `Cdu.ts` if not already imported there — check the existing import list first, since `DocenteCdcVM` in the same file already references both types.)

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/docente-materia-focus-provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the recipe and register the provider**

In `Recipe.ts`, add to `BuildParams` (after `materiaCorrente`):

```typescript
  /** Docente email scoping a single DOCUMENTO_DOCENTE_MATERIA generation target. */
  docenteCorrente?: string | null;
```

Add to `RECIPES` (after `CLASSE_COMPLETA`):

```typescript
  CLASSE_DOCENTE_MATERIA: [
    'school',
    'class',
    'students',
    'tutor',
    'consiglio',
    'materie',
    'esame',
    'progetti',
    'partner',
    'rappresentanti',
    'statistiche',
    'storicoClasse',
    'pianiPersClasse',
    'docenteMateriaFocus'
  ],
```

In `ContextEngineFactory.ts`, import `DocenteMateriaFocusProvider` and add after `.registerProvider('materie', ...)`:

```typescript
      .registerProvider('docenteMateriaFocus', new DocenteMateriaFocusProvider())
```

- [ ] **Step 6: Run typecheck to confirm the recipe/provider wiring compiles**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Write the failing test for `DocumentGenerationService.generateForClasseDocenteMateria`**

In `test/unit/application/services/document-generation-service.test.ts` (or wherever `generateForClasse`/`generateForPiano` are already tested — match that file), add:

```typescript
it('generateForClasseDocenteMateria builds the CDU with the docente/materia recipe and runs the pipeline', () => {
  const { service, contextBuilder, pipeline } = buildService(); // reuse this file's existing test harness factory
  contextBuilder.build.mockReturnValue(fakeCduWithClasseFocus());

  const result = service.generateForClasseDocenteMateria(
    ClasseId.of('5AB'),
    'rossi@scuola.it',
    'MAT',
    'PROGRAMMA_SVOLTO'
  );

  expect(contextBuilder.build).toHaveBeenCalledWith(
    expect.objectContaining({ docenteCorrente: 'rossi@scuola.it', materiaCorrente: 'MAT' }),
    expect.objectContaining({ providers: expect.arrayContaining(['docenteMateriaFocus']) })
  );
  expect(pipeline.execute).toHaveBeenCalled();
  expect(result.status).toBeDefined();
});
```

Adapt mock/harness names (`buildService`, `fakeCduWithClasseFocus`) to whatever this test file's existing `generateForClasse` tests already use.

- [ ] **Step 8: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/services/document-generation-service.test.ts -t generateForClasseDocenteMateria`
Expected: FAIL — method does not exist.

- [ ] **Step 9: Extract the shared helper and implement `generateForClasseDocenteMateria`**

In `DocumentGenerationService.ts`, replace the body of `generateForClasse` (lines 101-154) with a shared private helper plus a thin public wrapper:

```typescript
  generateForClasse(target: ClasseId, confDocId: string, jobId?: string): DocumentGenerationResult {
    return this.generateForClasseWithRecipe(target, confDocId, 'CLASSE_COMPLETA', {}, jobId);
  }

  generateForClasseDocenteMateria(
    target: ClasseId,
    docenteEmail: string,
    materiaId: string,
    confDocId: string,
    jobId?: string
  ): DocumentGenerationResult {
    return this.generateForClasseWithRecipe(
      target,
      confDocId,
      'CLASSE_DOCENTE_MATERIA',
      { docenteCorrente: docenteEmail, materiaCorrente: materiaId },
      jobId
    );
  }

  private generateForClasseWithRecipe(
    target: ClasseId,
    confDocId: string,
    cduRecipe: string,
    extraParams: Partial<BuildParams>,
    jobId?: string
  ): DocumentGenerationResult {
    const startedAt = Date.now();
    const row = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
    if (!row) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
    const config = ConfigurazioneDocumento.fromData(row);
    if (!this.strategyRegistry.has(config.generatore)) {
      throw new PipelineError(`GENERATORE non registrato: ${config.generatore}`);
    }

    const classe = this.classi.findById(target);
    if (classe === null) throw new PipelineError(`Classe ${target.value} non trovata`);
    const articolazione = this.classi.getArticolazione(classe);
    const classiCompetenza = (
      articolazione?.isParent() === true ? [classe, ...this.classi.getClassiPartner(classe)] : [classe]
    ).map((c) => c.id ?? '');

    const cdu = this.contextBuilder.build(
      {
        target: target.value,
        tipoTarget: 'classe',
        now: this.now,
        idConfigurazione: confDocId,
        tipoOperazione: 'GENERAZIONE_DOCUMENTO',
        classiCompetenza,
        ...extraParams
      },
      recipe(cduRecipe)
    );

    this.db.beginTransaction();
    let ctx: PipelineContext;
    try {
      ctx = this.buildPipeline(jobId).execute({ config: row, confDoc: config, cdu });
    } catch (e) {
      this.db.rollback();
      throw e;
    }

    const critical = ctx.getFlag<string>('criticalError');
    if (critical !== null) {
      this.db.rollback();
      throw new PipelineError(critical);
    }
    this.db.commit();

    return this.resultFromContext(ctx, startedAt);
  }
```

Import `BuildParams` from `../context-engine/Recipe` at the top of the file if not already imported.

- [ ] **Step 10: Run test, verify it passes, and rerun the pre-existing `generateForClasse` tests**

Run: `npx jest --config jest.config.cjs test/unit/application/services/document-generation-service.test.ts`
Expected: all PASS, including the pre-existing `generateForClasse` cases (behavior unchanged — same helper, same recipe/params for the plain classe path).

- [ ] **Step 11: Write the failing test for `sottotipo(ctx)` generalization**

In `test/unit/application/pipelines/document-steps.test.ts`, find the existing `sottotipoPiano`-related test(s) and add:

```typescript
it('sottotipo returns materiaId::docenteEmail for DOCUMENTO_DOCENTE_MATERIA', () => {
  const ctx = buildCduAt({ /* reuse this file's existing context-building helper */ });
  // arrange ctx's CONF_DOC row TIPO = 'DOCUMENTO_DOCENTE_MATERIA' and
  // cdu.focus.materia = { id/sigla: 'MAT', ... }, cdu.focus.docente = { email: 'rossi@scuola.it', ... }
  // via whatever this file's existing helpers already use to build such a context.

  expect(sottotipo(ctx)).toBe('MAT::rossi@scuola.it');
});
```

- [ ] **Step 12: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "sottotipo returns"`
Expected: FAIL — `sottotipo` is not exported / `sottotipoPiano` still in place.

- [ ] **Step 13: Generalize `sottotipoPiano` into `sottotipo`**

In `documentSteps.ts`, replace:

```typescript
function sottotipoPiano(ctx: PipelineContext): string {
  return isPianoPersonalizzato(ctx) ? (cdu(ctx).focus.piano?.tipo ?? '') : '';
}
```

with:

```typescript
function sottotipo(ctx: PipelineContext): string {
  if (isPianoPersonalizzato(ctx)) return cdu(ctx).focus.piano?.tipo ?? '';
  if (String(cfg(ctx)[COL_CONF_DOC.TIPO] ?? '') === 'DOCUMENTO_DOCENTE_MATERIA') {
    const materiaId = cdu(ctx).focus.materia?.sigla ?? '';
    const docenteEmail = cdu(ctx).focus.docente?.email ?? '';
    return `${materiaId}::${docenteEmail}`;
  }
  return '';
}
```

Update both call sites (`CheckDuplicatesStep._executeLogic` and `RegisterDocumentStep._executeLogic`) from `sottotipoPiano(ctx)` to `sottotipo(ctx)`.

- [ ] **Step 14: Run test, verify it passes, and rerun the full file**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts`
Expected: all PASS, including pre-existing `PIANO_PERS` sottotipo cases (unchanged branch).

- [ ] **Step 15: Write the failing test for `DocumentBatchService.generateDocentiMateria`**

In `test/unit/application/document-batch-service.test.ts`, add (mirroring the existing `generatePiani`/`generateForPiano` test in the same file):

```typescript
it('generateDocentiMateria enumerates one target per cattedra across active classes', () => {
  const classe = fakeClasse('5AB');
  const classi = fakeClasseRepository({
    findAttive: () => [classe],
    filterPerGestioneArticolazione: (cs: unknown[]) => cs,
    getConsiglioDiClasse: () => ({
      cattedre: [
        { materia: MateriaId.of('MAT'), docente: fakeDocente('rossi@scuola.it') },
        { materia: MateriaId.of('ITA'), docente: fakeDocente('bianchi@scuola.it') }
      ]
    })
  });
  const documenti = { generateForClasseDocenteMateria: jest.fn().mockReturnValue({ status: 'GENERATO', durationMs: 1 }) };
  const service = new DocumentBatchService(classi as any, {} as any, fakeConfigs('DOCUMENTO_DOCENTE_MATERIA'), documenti as any);

  const result = drain(service.batchGenerateHandler({ confDocId: 'PROGRAMMA_SVOLTO', jobId: 'job1' }));

  expect(documenti.generateForClasseDocenteMateria).toHaveBeenCalledTimes(2);
  expect(documenti.generateForClasseDocenteMateria).toHaveBeenCalledWith(
    classe.classeId, 'rossi@scuola.it', 'MAT', 'PROGRAMMA_SVOLTO', 'job1'
  );
  expect(result.totale).toBe(2);
});
```

Reuse this test file's existing `drain`, `fakeClasse`, `fakeClasseRepository`, `fakeDocente`, `fakeConfigs` helpers (already used by the `generatePiani`/`generateClassi` tests in the same file) rather than redefining them.

- [ ] **Step 16: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts -t generateDocentiMateria`
Expected: FAIL — `config.tipo` `'DOCUMENTO_DOCENTE_MATERIA'` falls through to `generateClassi`, which calls `generateForClasse` (not defined on the mock), or the method doesn't exist yet.

- [ ] **Step 17: Implement `generateDocentiMateria`**

In `DocumentBatchService.ts`, add to `BatchResumeState`:

```typescript
export interface DocenteMateriaBatchTarget {
  classe: string;
  docenteEmail: string;
  materiaId: string;
}

export interface BatchResumeState {
  nextIndex: number;
  processed: string[];
  errori: string[];
  planTargets?: PianoBatchTarget[];
  docenteMateriaTargets?: DocenteMateriaBatchTarget[];
}
```

Add the new generator (mirrors `generateClassi`/`generatePiani`):

```typescript
  private *generateDocentiMateria(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    let targets: DocenteMateriaBatchTarget[];
    if (resume === null) {
      targets = [];
      const attive = this.classi.filterPerGestioneArticolazione(
        this.classi.findAttive(),
        config.gestioneArticolazione
      );
      for (const classe of attive) {
        const { cattedre } = this.classi.getConsiglioDiClasse(classe.classeId);
        for (const cattedra of cattedre) {
          targets.push({
            classe: classe.id ?? '',
            docenteEmail: cattedra.docente.email.value,
            materiaId: cattedra.materia.value
          });
        }
      }
    } else {
      if (resume.docenteMateriaTargets === undefined) {
        throw new ConfigurationError(`Stato di ripresa ${confDocId} privo dei target docente/materia persistiti`);
      }
      targets = resume.docenteMateriaTargets.map((t) => ({ ...t }));
    }

    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(targets.length);

    for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
      const target = targets[i]!;
      const targetId = `${target.classe}:${target.materiaId}:${target.docenteEmail}`;
      this.logger?.logItemStart(i + 1, targets.length, 'Target', targetId, 'DOCUMENT');
      let message: string;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForClasseDocenteMateria(
          ClasseId.of(target.classe),
          target.docenteEmail,
          target.materiaId,
          confDocId,
          jobId
        );
        const name = result.fileName ?? targetId;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${targetId}: ${reason}`);
        this.logger?.logSummary('Document failed', Math.max(0, Date.now() - itemStartedAt), `${targetId}: ${reason}`, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < targets.length]
        });
        message = `Errore ${i + 1}/${targets.length} ${targetId}: ${reason}`;
      }
      processed.push(targetId);
      const percentage = ((i + 1) / targets.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield {
        percentage,
        nextIndex: i + 1,
        processed: processed.slice(),
        errori: errori.slice(),
        docenteMateriaTargets: targets
      };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(jobId, `${processed.length} documenti docente/materia elaborati, ${errori.length} errori`);
    return { success, totale: targets.length, processed, errori };
  }
```

In `batchGenerateHandler`, add the new branch before the `PIANO_PERS` check falls through to `generateClassi`:

```typescript
    if (config.tipo === 'PIANO_PERS') {
      return yield* this.generatePiani(config, confDocId, jobId, resume, processed, errori);
    }
    if (config.tipo === 'DOCUMENTO_DOCENTE_MATERIA') {
      return yield* this.generateDocentiMateria(config, confDocId, jobId, resume, processed, errori);
    }

    return yield* this.generateClassi(config, confDocId, jobId, resume, processed, errori);
```

Import `ClasseId` in `DocumentBatchService.ts` if not already imported (check the top of the file first).

- [ ] **Step 18: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: all PASS, including pre-existing `generatePiani`/`generateClassi` cases.

- [ ] **Step 19: Full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 0 errors, all green.

- [ ] **Step 20: Commit**

```bash
git add src/application/context-engine/providers/DocenteMateriaFocusProvider.ts src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts src/application/services/DocumentGenerationService.ts src/application/services/DocumentBatchService.ts src/application/pipelines/documentSteps.ts test/unit/application/context-engine/providers/docente-materia-focus-provider.test.ts test/unit/application/services/document-generation-service.test.ts test/unit/application/document-batch-service.test.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "feat: add DOCUMENTO_DOCENTE_MATERIA generator (batch axis per cattedra, reuses DOCUMENTO_GENERICO strategy)"
```

---

### Task 4: GasLibraryFactory — conditional Doc-section removal

This task is in the **`GasLibraryFactory` repository** (its own git repo, build, and test suite — see `GasLibraryFactory/CLAUDE.md`), not in ALDO's `src/`.

**Files (in `GasLibraryFactory/`):**
- Modify: `WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorTagScanner.js`
- Modify: `WorkspaceTemplateEngine/src/processors/DocumentProcessor.js`
- Test: `WorkspaceTemplateEngine/test/` (new test file for the conditional-section directive — follow this library's existing test layout for the other 4 structural directives, e.g. its `bullet_list`/`tablerow_loop` tests)

**Interfaces:**
- Produces: `MyPlaceholderService.processDocument(documentId, context)` now also structurally deletes/keeps paragraphs for `{{#expr}}...{{/expr}}` / `{{^expr}}...{{/expr}}` blocks where `expr` is not one of `tablerow_loop`/`tablecol_loop`/`bullet_list`/`number_list`, evaluating `expr` against `context` with standard Mustache truthiness (falsy/`null`/empty array → section false).

- [ ] **Step 1: Read the existing structural-directive test pattern**

Read `GasLibraryFactory/WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorTagScanner.js` in full (400 lines) and find its existing test file (search `GasLibraryFactory/WorkspaceTemplateEngine` for a test covering `bullet_list`/`number_list` scanning). Note the exact regex/match structure used for the 4 existing directives (`tablerow_loop`, `tablecol_loop`, `bullet_list`, `number_list` — see lines 24, 89, 136-137 of `DocumentProcessorTagScanner.js`) and how `DocumentProcessor.js` consumes the scanner's output to delete paragraphs. This step has no code change — its output is the exact insertion point and paragraph-deletion API to reuse in Step 3.

- [ ] **Step 2: Write the failing test for the new directive**

In a new or existing WorkspaceTemplateEngine test file for `DocumentProcessorTagScanner`/`DocumentProcessor`, add cases (adapt to that suite's existing mocking style for a Google Doc body — it already mocks paragraphs/text elements for the other 4 directives, reuse that harness):

```javascript
it('removes paragraphs inside a falsy {{#expr}}...{{/expr}} conditional block', () => {
  const doc = buildMockDocBody([
    'Prima del blocco',
    '{{#focus.classe.isArticolata}}',
    'Solo se articolata',
    '{{/focus.classe.isArticolata}}',
    'Dopo il blocco'
  ]);
  processDocument(doc, { focus: { classe: { isArticolata: false } } });
  expect(paragraphTexts(doc)).toEqual(['Prima del blocco', 'Dopo il blocco']);
});

it('keeps paragraphs (markers stripped) inside a truthy {{#expr}} block', () => {
  const doc = buildMockDocBody([
    '{{#focus.classe.isArticolata}}',
    'Solo se articolata',
    '{{/focus.classe.isArticolata}}'
  ]);
  processDocument(doc, { focus: { classe: { isArticolata: true } } });
  expect(paragraphTexts(doc)).toEqual(['Solo se articolata']);
});

it('handles negated {{^expr}}...{{/expr}} blocks', () => {
  const doc = buildMockDocBody([
    '{{^focus.classe.isTerminale}}',
    'Solo se NON terminale',
    '{{/focus.classe.isTerminale}}'
  ]);
  processDocument(doc, { focus: { classe: { isTerminale: true } } });
  expect(paragraphTexts(doc)).toEqual([]);
});
```

Use whatever `buildMockDocBody`/`paragraphTexts`/`processDocument` entry points that suite's existing tests already expose — these are illustrative of the *behavior*, not literal API names; match the real harness found in Step 1.

- [ ] **Step 3: Run the test, verify it fails**

Run (from `GasLibraryFactory/`): `npm test -- WorkspaceTemplateEngine`
Expected: FAIL — conditional blocks are left as literal text or only text-substituted, paragraphs not removed.

- [ ] **Step 4: Implement the generic conditional-section directive**

In `DocumentProcessorTagScanner.js`, add a 5th scan pattern (alongside the existing `tablerow_loop`/`tablecol_loop`/`bullet_list`/`number_list` regexes found in Step 1) that matches `{{#([^}]+)}}...{{/\1}}` and `{{\^([^}]+)}}...{{/\1}}` where the captured name is **not** one of the 4 reserved keywords. Emit a scan result shaped consistently with how the other 4 directives report their block (start/end paragraph indices, negated flag, expression string) so `DocumentProcessor.js` can consume it the same way it consumes the existing 4.

In `DocumentProcessor.js`, add handling for this new scan-result kind: resolve the expression against the render `context` (same value-resolution the existing placeholder substitution already uses for plain `{{expr}}`, via `DocumentProcessorValueResolver`), apply Mustache truthiness (falsy / `null` / empty array = false), and:
- if the block is false (or negated-true), delete every paragraph between (and including) the opening/closing marker paragraphs;
- if the block is true (or negated-false), delete only the two marker paragraphs, keeping the content paragraphs in place — reuse the same paragraph-splice primitive the existing 4 directives already use for structural removal (found in Step 1), don't write a second one.

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test -- WorkspaceTemplateEngine`
Expected: PASS, and the full `WorkspaceTemplateEngine` suite still green (no regression on `tablerow_loop`/`bullet_list`/etc.).

- [ ] **Step 6: Run the full GasLibraryFactory test suite**

Run: `npm test` (from `GasLibraryFactory/` root)
Expected: all green (this repo's full suite, not just WorkspaceTemplateEngine).

- [ ] **Step 7: Commit in GasLibraryFactory**

```bash
cd GasLibraryFactory
git add WorkspaceTemplateEngine/src/internal/processors-managers/DocumentProcessorTagScanner.js WorkspaceTemplateEngine/src/processors/DocumentProcessor.js WorkspaceTemplateEngine/test/
git commit -m "feat(WorkspaceTemplateEngine): structural removal for generic {{#expr}}/{{^expr}} conditional sections"
```

- [ ] **Step 8: Pull the updated library bundle into ALDO**

Back in the ALDO repo root:

```bash
npm run refresh:vendor
npm run verify:vendor
```

Expected: `verify:vendor` passes, `vendor/gaslibs.Code.js` now contains the new directive.

- [ ] **Step 9: Confirm booleans survive into `processDocument` unescaped in ALDO**

Read `src/infrastructure/facades/TemplateEngineFacade.ts:56-62` (`processDocument`) and confirm it calls `this.service.processDocument(fileId, context)` directly with the raw context — **not** through `HtmlSanitizer.escapeContextDeep` (that's only in `processStringEscaped`, line 52-54). No code change needed; add a one-line regression test in `test/unit/infrastructure/template-engine-facade.test.ts` asserting `processDocument` is called with the exact same context object reference (not a transformed copy), to lock this in.

- [ ] **Step 10: Run ALDO's full suite after the vendor refresh**

Run: `npm run typecheck && npm test`
Expected: all green — the vendor bump must not break any existing ALDO test (this is the offline-suite gate `push:online` already runs).

- [ ] **Step 11: Commit the vendor bump in ALDO**

```bash
git add vendor/ test/unit/infrastructure/template-engine-facade.test.ts
git commit -m "chore: refresh vendored GasLibraryFactory bundle (conditional Doc-section removal)"
```

---

### Task 5: Dipartimento CDU + document batch generation

**Files:**
- Modify: `src/domain/repositories/IDipartimentoRepository.ts` (`findAll`)
- Modify: `src/infrastructure/repositories/DipartimentoRepository.ts` (`findAll`)
- Create: `src/application/context-engine/providers/DipartimentoProvider.ts`
- Modify: `src/application/context-engine/Cdu.ts` (`CduDipartimentoFocus`, `focus.dipartimento`, `BuildParams.tipoTarget` widened)
- Modify: `src/application/context-engine/Recipe.ts` (`RECIPES.DIPARTIMENTO_COMPLETO`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (`dipartimenti` dependency, register `'dipartimentoFocus'`)
- Modify: `src/config/Bootstrap.ts` (pass `dipartimenti` into `ContextEngineFactory.create`)
- Modify: `src/application/services/DocumentGenerationService.ts` (`generateForDipartimento`)
- Modify: `src/application/services/DocumentBatchService.ts` (`generateDipartimenti`, `batchGenerateHandler` branch)
- Modify: `src/domain/entities/LogDocumento.ts` (`containsMateria`)
- Test: `test/unit/infrastructure/dipartimento-repository.test.ts`
- Test: `test/unit/application/context-engine/providers/dipartimento-provider.test.ts`
- Test: `test/unit/application/services/document-generation-service.test.ts`
- Test: `test/unit/application/document-batch-service.test.ts`

**Interfaces:**
- Consumes: `Dipartimento.getCapoEmail(): Email | null`; `Dipartimento.getMaterieIds(): MateriaId[]`; `DocenteRepository.findByDipartimento(dipartId: DipartimentoId): Docente[]`; `buildPersonVmFromDocente`; `ILogDocumentoRepository.findAll(): LogDocumento[]`.
- Produces (additional): `LogDocumento.containsMateria(materiaId: string): boolean` (mirrors `containsClasse`) — this is the one interface Task 6 consumes back from this task.
- Produces: `IDipartimentoRepository.findAll(): Dipartimento[]`; `Cdu.focus.dipartimento?: CduDipartimentoFocus` (including `documenti: { items: DocumentoItem[] }`, mirroring `DocumentiClasseProvider`'s shape); `DocumentGenerationService.generateForDipartimento(dipartimentoId: string, confDocId: string, jobId?: string): DocumentGenerationResult`; `DocumentBatchService`'s `'DIPARTIMENTO'` `CONF_DOC.TIPO` branch.

- [ ] **Step 1: Write the failing test for `IDipartimentoRepository.findAll`**

In `test/unit/infrastructure/dipartimento-repository.test.ts`, add:

```typescript
it('findAll returns every DIPART row as a Dipartimento', () => {
  const database = fakeDatabaseWith(TABLE.DIPART, [
    { ID: 'LETTERE', NOME: 'Lettere', CAPO: 'rossi@scuola.it', MATERIE: 'ITA,STO' },
    { ID: 'SCIENZE', NOME: 'Scienze', CAPO: 'verdi@scuola.it', MATERIE: 'MAT,SCI' }
  ]);
  const repo = new DipartimentoRepository(database);

  const all = repo.findAll();

  expect(all.map((d) => d.id)).toEqual(['LETTERE', 'SCIENZE']);
});
```

Reuse this test file's existing `fakeDatabaseWith`/`repo(...)` helper (already used for the `findByMateria` test in the same file) rather than redefining it.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/dipartimento-repository.test.ts -t findAll`
Expected: FAIL — `findAll is not a function`.

- [ ] **Step 3: Implement `findAll`**

In `IDipartimentoRepository.ts`:

```typescript
export interface IDipartimentoRepository {
  findByMateria(materiaId: MateriaId): Dipartimento | null;
  findAll(): Dipartimento[];
}
```

In `DipartimentoRepository.ts`, add (mirroring how this class's `findByMateria` reads the table — check that method's exact table/row access pattern first and match it):

```typescript
  findAll(): Dipartimento[] {
    return this.database.tables[TABLE.DIPART]!.getAllRows().map((row) => Dipartimento.fromData(row));
  }
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/dipartimento-repository.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the failing test for `DipartimentoProvider`**

Create `test/unit/application/context-engine/providers/dipartimento-provider.test.ts`:

```typescript
import { DipartimentoProvider } from '../../../../../src/application/context-engine/providers/DipartimentoProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';

function emptyCdu(target: string): Cdu {
  return { meta: {} as any, focus: {}, tech: {} as any };
}

describe('DipartimentoProvider', () => {
  it('populates focus.dipartimento with anagrafica, capo, materie and docenti', () => {
    const dipartimento = fakeDipartimento({ id: 'LETTERE', nome: 'Lettere', capoEmail: 'rossi@scuola.it', materieIds: ['ITA', 'STO'] });
    const dipartimenti = { findAll: () => [dipartimento], findByMateria: () => dipartimento };
    const docenti = {
      findByDipartimento: jest.fn().mockReturnValue([fakeDocente('rossi@scuola.it'), fakeDocente('bianchi@scuola.it')]),
      findById: (email: string) => fakeDocente(email)
    };
    const logDocs = { findAll: () => [fakeLogDocumento({ MATERIE: 'ITA,STO' }), fakeLogDocumento({ MATERIE: 'MAT' })] };
    const provider = new DipartimentoProvider(dipartimenti as any, docenti as any, logDocs as any);
    const cdu = emptyCdu('LETTERE');

    provider.provide(cdu, { target: 'LETTERE' } as any);

    expect(cdu.focus.dipartimento!.anagrafica).toEqual({ id: 'LETTERE', nome: 'Lettere' });
    expect(cdu.focus.dipartimento!.capo).toEqual(expect.objectContaining({ email: 'rossi@scuola.it' }));
    expect(cdu.focus.dipartimento!.materie).toEqual([{ sigla: 'ITA' }, { sigla: 'STO' }]);
    expect(cdu.focus.dipartimento!.docenti).toHaveLength(2);
    expect(cdu.focus.dipartimento!.didattica.documenti.items).toHaveLength(1);
  });
});
```

Reuse or add `fakeDipartimento`/`fakeDocente`/`fakeLogDocumento` helpers consistent with how other provider tests in this directory build fake domain entities.

- [ ] **Step 6: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/dipartimento-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `DipartimentoProvider` and the CDU shape**

In `Cdu.ts`, add:

```typescript
export interface CduDipartimentoFocus {
  anagrafica: { id: string; nome: string };
  capo: PersonVM | null;
  materie: Array<{ sigla: string }>;
  docenti: PersonVM[];
  didattica: { documenti: { items: DocumentoItem[] } };
}
```

(`materie` is a light `{ sigla: string }[]`, not the full `SubjectVM` — a `MateriaId` alone doesn't carry a `SubjectVM`'s other fields (`nome`, `colore1`, etc.) without a lookup against `IMateriaRepository`, and nothing in this extension's templates needs more than the sigla. `DocumentoItem` is already defined and exported in `src/application/email/boxes.ts` — import it from there, the same type `DocumentiClasseProvider`'s output conforms to.)

Add `dipartimento?: CduDipartimentoFocus` to root `focus`, and widen `BuildParams.tipoTarget` (in `Recipe.ts`) and the root `Cdu.focus`'s sibling type union from `'classe' | 'alunno'` to `'classe' | 'alunno' | 'dipartimento'` wherever it's declared (`BuildParams.tipoTarget`, `CduMeta.parametriInput.tipoTarget`).

Create `src/application/context-engine/providers/DipartimentoProvider.ts`. Its `documenti` population mirrors `DocumentiClasseProvider.ts` (`src/application/context-engine/providers/DocumentiClasseProvider.ts:17-47`) exactly — same output shape (`{ id, nome, link, tipo, idGen, stato, dataCreazione }` per item) — but filtered by materia overlap instead of `findByClasse`, since a department has no class dimension:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IDipartimentoRepository } from '../../../domain/repositories/IDipartimentoRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import { buildPersonVmFromDocente } from '../mappers/personVmMapper';
import { PipelineError } from '../../../domain/errors/DomainError';

export class DipartimentoProvider implements ContextProvider {
  constructor(
    private readonly dipartimenti: IDipartimentoRepository,
    private readonly docenti: IDocenteRepository,
    private readonly logDocs: ILogDocumentoRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const dipartimento = this.dipartimenti
      .findAll()
      .find((d) => d.id === params.target);
    if (dipartimento === undefined) {
      throw new PipelineError(`Dipartimento ${params.target} non trovato`);
    }

    const capoEmail = dipartimento.getCapoEmail();
    const capoDocente = capoEmail !== null ? this.docenti.findById(capoEmail.value) : null;
    const docentiAfferenti = this.docenti.findByDipartimento(dipartimento.dipartimentoId);
    const materieIds = dipartimento.getMaterieIds().map((m) => m.value);

    const items = this.logDocs
      .findAll()
      .filter((doc) => materieIds.some((m) => doc.containsMateria(m)))
      .map((l) => ({
        id: l.id ?? undefined,
        nome: l.nome,
        link: l.getLink(),
        tipo: l.tipo,
        idGen: l.idGen,
        stato: l.getStato(),
        dataCreazione: l.getDataCreazione()
      }));

    cdu.focus.dipartimento = {
      anagrafica: { id: dipartimento.id ?? '', nome: dipartimento.nome },
      capo: capoDocente !== null ? buildPersonVmFromDocente(capoDocente) : null,
      materie: materieIds.map((sigla) => ({ sigla })),
      docenti: docentiAfferenti.map((d) => buildPersonVmFromDocente(d)),
      didattica: { documenti: { items } }
    };
  }
}
```

`LogDocumento.containsMateria` doesn't exist yet at this point in the plan (it's introduced in Task 6, Step 9) — add it here instead, in this task, since `DipartimentoProvider` needs it now: in `LogDocumento.ts`, mirroring `containsClasse` (lines 71-73):

```typescript
  containsMateria(materiaId: string): boolean {
    return csv(this.raw[COL_LOG_DOCS.MATERIE]).includes(materiaId);
  }
```

Task 6 Step 9 then becomes a no-op (already done here) — skip re-adding it, just verify it's present.

- [ ] **Step 8: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/dipartimento-provider.test.ts`
Expected: PASS (adjust the `materie` assertion in Step 5's test to match whichever shape you settled on in Step 7).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors — resolve the `SubjectVM` shape question from Step 7 here if it surfaces.

- [ ] **Step 10: Wire the recipe, provider registration, and DI**

In `Recipe.ts`, add to `RECIPES`:

```typescript
  DIPARTIMENTO_COMPLETO: ['school', 'dipartimentoFocus'],
```

In `ContextEngineFactory.ts`:
- Add `dipartimenti: IDipartimentoRepository` to `ContextEngineDependencies` (import the interface).
- Destructure `dipartimenti` in `create({...})`'s parameter list.
- Add `.registerProvider('dipartimentoFocus', new DipartimentoProvider(dipartimenti, docenti, logDocs))` to the chain (`docenti` and `logDocs` are already destructured — `logDocs` is used by the existing `'documenti'`/`'documentiClasse'` registrations in the same chain).

In `Bootstrap.ts`, add `dipartimenti: container.get<DipartimentoRepository>('dipartimenti')` to the `ContextEngineFactory.create({...})` call at line 147-158 (the `dipartimenti` registration already exists at line 123).

- [ ] **Step 11: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 12: Write the failing test for `DocumentGenerationService.generateForDipartimento`**

In the `document-generation-service.test.ts` file, mirroring the `generateForClasseDocenteMateria` test from Task 3:

```typescript
it('generateForDipartimento builds the CDU with the DIPARTIMENTO_COMPLETO recipe and tipoTarget dipartimento', () => {
  const { service, contextBuilder, pipeline } = buildService();
  contextBuilder.build.mockReturnValue(fakeCduWithDipartimentoFocus());

  const result = service.generateForDipartimento('LETTERE', 'VERBALE_DIPARTIMENTO');

  expect(contextBuilder.build).toHaveBeenCalledWith(
    expect.objectContaining({ target: 'LETTERE', tipoTarget: 'dipartimento' }),
    expect.objectContaining({ providers: expect.arrayContaining(['dipartimentoFocus']) })
  );
  expect(pipeline.execute).toHaveBeenCalled();
  expect(result.status).toBeDefined();
});
```

- [ ] **Step 13: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/services/document-generation-service.test.ts -t generateForDipartimento`
Expected: FAIL — method does not exist.

- [ ] **Step 14: Implement `generateForDipartimento`**

In `DocumentGenerationService.ts`, add (this one doesn't need `classiCompetenza`/articolazione resolution, so it doesn't reuse `generateForClasseWithRecipe` from Task 3 — a department has no class dimension):

```typescript
  generateForDipartimento(dipartimentoId: string, confDocId: string, jobId?: string): DocumentGenerationResult {
    const startedAt = Date.now();
    const row = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
    if (!row) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
    const config = ConfigurazioneDocumento.fromData(row);
    if (!this.strategyRegistry.has(config.generatore)) {
      throw new PipelineError(`GENERATORE non registrato: ${config.generatore}`);
    }

    const cdu = this.contextBuilder.build(
      {
        target: dipartimentoId,
        tipoTarget: 'dipartimento',
        now: this.now,
        idConfigurazione: confDocId,
        tipoOperazione: 'GENERAZIONE_DOCUMENTO'
      },
      recipe('DIPARTIMENTO_COMPLETO')
    );

    this.db.beginTransaction();
    let ctx: PipelineContext;
    try {
      ctx = this.buildPipeline(jobId).execute({ config: row, confDoc: config, cdu });
    } catch (e) {
      this.db.rollback();
      throw e;
    }

    const critical = ctx.getFlag<string>('criticalError');
    if (critical !== null) {
      this.db.rollback();
      throw new PipelineError(critical);
    }
    this.db.commit();

    return this.resultFromContext(ctx, startedAt);
  }
```

- [ ] **Step 15: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/services/document-generation-service.test.ts`
Expected: all PASS.

- [ ] **Step 16: Write the failing test for `DocumentBatchService.generateDipartimenti`**

In `document-batch-service.test.ts`:

```typescript
it('generateDipartimenti enumerates one target per DIPART row (no gestioneArticolazione)', () => {
  const dipartimenti = { findAll: () => [fakeDipartimento('LETTERE'), fakeDipartimento('SCIENZE')] };
  const documenti = { generateForDipartimento: jest.fn().mockReturnValue({ status: 'GENERATO', durationMs: 1 }) };
  const service = new DocumentBatchService({} as any, {} as any, fakeConfigs('DIPARTIMENTO'), documenti as any, undefined, undefined, dipartimenti as any);

  const result = drain(service.batchGenerateHandler({ confDocId: 'VERBALE_DIPARTIMENTO', jobId: 'job1' }));

  expect(documenti.generateForDipartimento).toHaveBeenCalledTimes(2);
  expect(result.totale).toBe(2);
});
```

(The constructor gains a 7th, optional-last-if-possible-but-here-required `dipartimenti: IDipartimentoRepository` parameter — see Step 17; adjust this call to match wherever you place it in the constructor's parameter list.)

- [ ] **Step 17: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts -t generateDipartimenti`
Expected: FAIL — constructor signature mismatch / method missing.

- [ ] **Step 18: Implement `generateDipartimenti`**

In `DocumentBatchService.ts`, add `dipartimenti: IDipartimentoRepository` to the constructor (after `documenti`, before the optional `monitor`/`logger`):

```typescript
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly configs: DocumentConfigLookup,
    private readonly documenti: DocumentGenerationService,
    private readonly dipartimenti: IDipartimentoRepository,
    private readonly monitor?: IProcessMonitor,
    private readonly logger?: LoggerService
  ) {}
```

Add the generator (no `gestioneArticolazione` — mirrors `generateClassi`'s shape minus that filter, per the spec's 4.C note):

```typescript
  private *generateDipartimenti(
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    const tutti = this.dipartimenti.findAll();
    if (resume === null) {
      this.monitor?.registerJob(jobId);
      this.monitor?.startJob(jobId);
    }
    this.logger?.logBatchStart(tutti.length);

    for (let i = resume?.nextIndex ?? 0; i < tutti.length; i++) {
      const dipartimento = tutti[i]!;
      const id = dipartimento.id ?? '?';
      this.logger?.logItemStart(i + 1, tutti.length, 'Target', id, 'DOCUMENT');
      let message = `Generazione documento dipartimento ${id}`;
      const itemStartedAt = Date.now();
      try {
        const result = this.documenti.generateForDipartimento(id, confDocId, jobId);
        const name = result.fileName ?? id;
        const outcome = DocumentBatchService.documentOutcome(result.status);
        this.logger?.logSummary(outcome, result.durationMs, name, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < tutti.length]
        });
        message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errori.push(`${id}: ${reason}`);
        this.logger?.logSummary('Document failed', Math.max(0, Date.now() - itemStartedAt), `${id}: ${reason}`, {
          depth: 1,
          isLast: true,
          ancestorHasNext: [i + 1 < tutti.length]
        });
        message = `Errore: ${reason} (dipartimento ${id})`;
      }
      processed.push(id);
      const percentage = ((i + 1) / tutti.length) * 100;
      this.monitor?.updateProgress(jobId, percentage, message);
      yield { percentage, nextIndex: i + 1, processed: processed.slice(), errori: errori.slice() };
    }

    const success = errori.length === 0;
    this.monitor?.completeJob(jobId, `${processed.length} dipartimenti elaborati, ${errori.length} errori`);
    return { success, totale: tutti.length, processed, errori };
  }
```

Add the branch in `batchGenerateHandler`, alongside `DOCUMENTO_DOCENTE_MATERIA`:

```typescript
    if (config.tipo === 'DIPARTIMENTO') {
      return yield* this.generateDipartimenti(confDocId, jobId, resume, processed, errori);
    }
```

- [ ] **Step 19: Run test, verify it passes; fix every other `new DocumentBatchService(...)` call site**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: initial FAIL on every pre-existing test in this file (constructor arity changed) — update every `new DocumentBatchService(...)` call in this test file and in `Bootstrap.ts` to pass the new `dipartimenti` argument (`container.get<DipartimentoRepository>('dipartimenti')` in `Bootstrap.ts`). Then rerun.
Expected after fix: all PASS.

- [ ] **Step 20: Full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 0 errors, all green.

- [ ] **Step 21: Commit**

```bash
git add src/domain/repositories/IDipartimentoRepository.ts src/infrastructure/repositories/DipartimentoRepository.ts src/application/context-engine/providers/DipartimentoProvider.ts src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts src/config/Bootstrap.ts src/application/services/DocumentGenerationService.ts src/application/services/DocumentBatchService.ts test/unit/infrastructure/dipartimento-repository.test.ts test/unit/application/context-engine/providers/dipartimento-provider.test.ts test/unit/application/services/document-generation-service.test.ts test/unit/application/document-batch-service.test.ts
git commit -m "feat: add dipartimento CDU focus and document batch generation axis"
```

---

### Task 6: Dipartimento email processes + box

**Files:**
- Modify: `src/domain/value-objects/enums.ts` (`ProcessoInvio`)
- Modify: `src/application/email/saluto.ts` (`EmailTarget` union widening)
- Modify: `src/application/services/EmailNotificationService.ts` (`targetsPerCapoDipartimento`, `targetsPerDipartimento`, `enumerateTargets` switch)
- Modify: `src/application/pipelines/emailSteps.ts` (`RECIPE_PER_PROCESSO`)
- Modify: `src/application/email/boxes.ts` (`aggregaDati` reads `focus.dipartimento.didattica.documenti`; register `BOX_DOCUMENTI_DIPARTIMENTO`)
- Test: `test/unit/application/email-notification-service.test.ts`
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**
- Consumes: `Dipartimento.getCapoEmail()`, `DocenteRepository.findByDipartimento`, `IDipartimentoRepository.findAll` (Task 5); `Cdu.focus.dipartimento.didattica.documenti.items: DocumentoItem[]` (Task 5's `DipartimentoProvider`, already populated — this task only wires it into the box-rendering `aggregaDati` read path, mirroring how `focus.classe.didattica.documenti` already feeds the `documenti` box).
- Produces: `ProcessoInvio.PER_CAPO_DIPARTIMENTO`, `ProcessoInvio.PER_DIPARTIMENTO`; a `documenti_dipartimento` `TIPO_BOX`.

**Note:** `LogDocumento.containsMateria` is introduced in Task 5 (it's a dependency of `DipartimentoProvider`, which lands first) — nothing to add here, just confirm it's present before starting Step 7 below.

- [ ] **Step 1: Write the failing test for the two new `ProcessoInvio` values wired into `enumerateTargets`**

In `test/unit/application/email-notification-service.test.ts`, add (mirroring the existing `PER_CDC`/`PER_COORDINATORE` tests in the same file):

```typescript
it('PER_CAPO_DIPARTIMENTO targets one email per dipartimento with a capo', () => {
  const dipartimenti = { findAll: () => [fakeDipartimento({ id: 'LETTERE', capoEmail: 'rossi@scuola.it' }), fakeDipartimento({ id: 'SCIENZE', capoEmail: null })] };
  const service = buildService({ dipartimenti }); // extend this file's existing service-building helper

  const targets = service.enumerateTargets(fakeConfMail({ processo: ProcessoInvio.PER_CAPO_DIPARTIMENTO }));

  expect(targets).toEqual([
    expect.objectContaining({ tipoTarget: 'dipartimento', target: 'LETTERE', emails: ['rossi@scuola.it'] })
  ]);
});

it('PER_DIPARTIMENTO targets one email per dipartimento with all its docenti', () => {
  const dipartimenti = { findAll: () => [fakeDipartimento({ id: 'LETTERE' })] };
  const docenti = { findByDipartimento: () => [fakeDocenteEntity('rossi@scuola.it'), fakeDocenteEntity('bianchi@scuola.it')] };
  const service = buildService({ dipartimenti, docenti });

  const targets = service.enumerateTargets(fakeConfMail({ processo: ProcessoInvio.PER_DIPARTIMENTO }));

  expect(targets).toEqual([
    expect.objectContaining({ tipoTarget: 'dipartimento', target: 'LETTERE', emails: ['rossi@scuola.it', 'bianchi@scuola.it'] })
  ]);
});
```

Reuse this test file's existing `buildService`/`fakeConfMail`/fake-entity helpers, extending `buildService`'s dependency object with `dipartimenti`/`docenti` the same way other deps are already injected there.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t DIPARTIMENTO`
Expected: FAIL — `ProcessoInvio.PER_CAPO_DIPARTIMENTO` undefined / switch has no matching case.

- [ ] **Step 3: Add the enum values and the target methods**

In `enums.ts`:

```typescript
export enum ProcessoInvio {
  PER_COORDINATORE = 'PER_COORDINATORE',
  PER_DOCENTE = 'PER_DOCENTE',
  PER_CDC = 'PER_CDC',
  PER_ALUNNO = 'PER_ALUNNO',
  PER_GENITORI_ALUNNO = 'PER_GENITORI_ALUNNO',
  PER_CARENZA_GENITORI = 'PER_CARENZA_GENITORI',
  PER_CARENZA_GENITORI_E_ALUNNO = 'PER_CARENZA_GENITORI_E_ALUNNO',
  PER_CARENZA_GENITORI_E_COORD = 'PER_CARENZA_GENITORI_E_COORD',
  PER_CAPO_DIPARTIMENTO = 'PER_CAPO_DIPARTIMENTO',
  PER_DIPARTIMENTO = 'PER_DIPARTIMENTO'
}
```

In `saluto.ts`, widen `EmailTarget`:

```typescript
export interface EmailTarget {
  tipo: 'docente' | 'cdc' | 'alunno' | 'genitori' | 'genitori_alunno' | 'capo_dipartimento' | 'dipartimento';
  tipoTarget: 'classe' | 'alunno' | 'dipartimento';
  // ... rest unchanged ...
}
```

In `EmailNotificationService.ts`, add (near `targetsPerCdc`):

```typescript
  private targetsPerCapoDipartimento(): EmailTarget[] {
    return this.deps.dipartimenti
      .findAll()
      .map((d) => ({ dipartimento: d, capo: d.getCapoEmail() }))
      .filter((x): x is { dipartimento: Dipartimento; capo: Email } => x.capo !== null)
      .map(({ dipartimento, capo }) => ({
        tipo: 'capo_dipartimento' as const,
        tipoTarget: 'dipartimento' as const,
        target: dipartimento.id ?? '',
        emails: [capo.value],
        classiCompetenza: []
      }));
  }

  private targetsPerDipartimento(): EmailTarget[] {
    return this.deps.dipartimenti.findAll().map((dipartimento) => ({
      tipo: 'dipartimento' as const,
      tipoTarget: 'dipartimento' as const,
      target: dipartimento.id ?? '',
      emails: this.deps.docenti
        .findByDipartimento(dipartimento.dipartimentoId)
        .map((d) => d.id ?? '')
        .filter((e) => e !== ''),
      classiCompetenza: []
    }));
  }
```

Add `dipartimenti: IDipartimentoRepository` to `EmailNotificationDeps` (`this.deps.dipartimenti`/`this.deps.docenti` above assume it's accessed the same way other deps already are in this class — check whether this class stores deps as `this.deps.X` or as individual `private readonly` fields first, and match that pattern instead if different).

Add the two cases to `enumerateTargets`'s switch:

```typescript
      case ProcessoInvio.PER_CAPO_DIPARTIMENTO:
        return this.targetsPerCapoDipartimento();
      case ProcessoInvio.PER_DIPARTIMENTO:
        return this.targetsPerDipartimento();
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: all PASS, including every pre-existing `enumerateTargets` case.

- [ ] **Step 5: Wire `RECIPE_PER_PROCESSO` and confirm `GESTIONE_ARTICOLAZIONE` is a no-op for these two**

In `emailSteps.ts`, find `RECIPE_PER_PROCESSO` (the constant `BuildCDUStep._executeLogic` indexes with `conf.processo`) and add:

```typescript
  [ProcessoInvio.PER_CAPO_DIPARTIMENTO]: 'DIPARTIMENTO_COMPLETO',
  [ProcessoInvio.PER_DIPARTIMENTO]: 'DIPARTIMENTO_COMPLETO',
```

No code change needed for ignoring `GESTIONE_ARTICOLAZIONE`: `targetsPerCapoDipartimento`/`targetsPerDipartimento` above don't call `filterPerGestioneArticolazione` at all (same as the existing `PER_ALUNNO` case), so the field is inert for these two processes by construction. Add a one-line comment above both new switch cases in `EmailNotificationService.ts` noting this explicitly, since it's a documented CONF_MAIL semantic (spec §2) and not obvious from the code alone.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Write the failing test for the `documenti_dipartimento` box reading `focus.dipartimento`**

In `test/unit/application/email-boxes.test.ts`, find the test(s) covering `aggregaDati`'s `documenti` output (built from `focus.classe.didattica.documenti`/`focus.alunno.didattica.documenti`) and add an equivalent for the department focus:

```typescript
it('documenti_dipartimento box is hidden when focus.dipartimento has no documents', () => {
  const composer = createBoxComposer(logger, templates);
  const cdu = { focus: { dipartimento: { didattica: { documenti: { items: [] } } } } };
  const rendered = composer.render(['documenti_dipartimento'], contextWith(cdu));
  expect(rendered.find((b) => b.id === 'documenti_dipartimento')!.isEmpty).toBe(true);
});

it('documenti_dipartimento box shows items from focus.dipartimento.didattica.documenti', () => {
  const composer = createBoxComposer(logger, templates);
  const cdu = {
    focus: {
      dipartimento: {
        didattica: { documenti: { items: [{ id: 'd1', nome: 'Verbale', link: 'https://...', tipo: 'VERBALE_DIPARTIMENTO', idGen: 'VD', stato: 'GENERATO', dataCreazione: '01/01/2026' }] } }
      }
    }
  };
  const rendered = composer.render(['documenti_dipartimento'], contextWith(cdu));
  expect(rendered.find((b) => b.id === 'documenti_dipartimento')!.isEmpty).toBe(false);
});
```

Match this file's real `createBoxComposer`/`contextWith`/render-result shape (used by the existing `documenti` box tests right above where you're adding these) — `contextWith` is whatever helper this file already uses to turn a partial CDU into the `Record<string, unknown>` `aggregaDati`/`renderBoxes` expect.

- [ ] **Step 8: Run test, verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t documenti_dipartimento`
Expected: FAIL — no such box id registered, `boxdata.documentiDipartimento` undefined.

- [ ] **Step 9: Confirm `LogDocumento.containsMateria` and `DipartimentoProvider`'s `didattica.documenti` are already in place**

This step is a checkpoint, not new code: Task 5 already added `LogDocumento.containsMateria` and `DipartimentoProvider`'s population of `cdu.focus.dipartimento.didattica.documenti.items`. Confirm both exist (`git log`/read the files) before continuing — if Task 5 hasn't landed yet, this task is blocked on it.

- [ ] **Step 10: Extend `aggregaDati` to read `focus.dipartimento`**

In `boxes.ts`, in `aggregaDati` (lines 414-495), extend the `focus` type annotation and the `documenti`/`items` resolution to also consider the department focus:

```typescript
  const focus = cdu['focus'] as
    | {
        alunno?: { didattica?: { /* ...unchanged... */ } };
        classe?: { didattica?: { /* ...unchanged... */ } };
        dipartimento?: {
          didattica?: {
            documenti?: { items?: DocumentoItem[]; storico?: LazyRef<DocumentoStoricoConTipo[]> };
          };
        };
      }
    | undefined;
  // ...
  const documenti =
    focus?.classe?.didattica?.documenti ??
    focus?.alunno?.didattica?.documenti ??
    focus?.dipartimento?.didattica?.documenti;
```

Add a `documentiDipartimento` key to the object `aggregaDati` returns, sourced independently from the general `documenti`/`documentiFiltrati` variable above (that one is already scoped/filtered for the classe/alunno `documenti` `TIPO_BOX`'s own `FILTRO_TIPO`/`FILTRO_STATO` — the department box is a separate `TIPO_BOX` with its own visibility, not a re-filter of the same list):

```typescript
    documentiDipartimento: { items: focus?.dipartimento?.didattica?.documenti?.items ?? [] },
```

- [ ] **Step 11: Register the `documenti_dipartimento` box**

In `createBoxComposer` (same file), add right after the existing `documenti`/`cartelle` `simple(...)` calls:

```typescript
  simple(
    'documenti_dipartimento',
    'Documenti di Dipartimento',
    (ctx) => ctx.get('boxdata.documentiDipartimento', { items: [] }),
    (d) => (d as { items: unknown[] }).items.length === 0
  );
```

And register its HTML template in the same `renderers.register(new HtmlRenderer({ templates: { ... } }))` block (near `documenti`/`cartelle`):

```typescript
        documenti_dipartimento: (data, options) => renderDocumentiBox(data, options, templates),
```

- [ ] **Step 12: Run test, verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: all PASS, including every pre-existing `documenti`/`cartelle` box test (unchanged behavior — the new `dipartimento` branch is additive, `??`-chained after the existing two).

- [ ] **Step 13: Full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 0 errors, all green.

- [ ] **Step 14: Commit**

```bash
git add src/domain/value-objects/enums.ts src/application/email/saluto.ts src/application/services/EmailNotificationService.ts src/application/pipelines/emailSteps.ts src/application/email/boxes.ts test/unit/application/email-notification-service.test.ts test/unit/application/email-boxes.test.ts
git commit -m "feat: add PER_CAPO_DIPARTIMENTO/PER_DIPARTIMENTO email processes and documenti_dipartimento box"
```
