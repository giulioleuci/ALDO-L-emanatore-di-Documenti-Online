# DOCUMENTO_CLASSE_MATERIA Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new CONF_DOC batch axis `DOCUMENTO_CLASSE_MATERIA` that generates **one document per (classe, materia)** — not per (docente, materia) as today — with permissions applied to every teacher of that subject in that class, role-resolution (SUPPLENZE/VARIAZIONI_CATTEDRA/CLASSI) applied as always, and conditional template (`MODELLI`) selection on **materia + anno di corso + indirizzo**.

**Architecture:** This mirrors the existing `DOCUMENTO_DOCENTE_MATERIA` axis (`generateDocentiMateria`), but collapses the iteration target from (docente, materia) to (materia) per class and populates a new CDU `focus.materia`/`focus.classiMateria.docenti` carrying **all** role-resolved teachers of that subject (not the single `focus.docente`). Template selection is unchanged — `ConfigurazioneDocumentoRepository.resolveTemplateId` already evaluates conditional `MODELLI` against the CDU via `IExpressionEngine`, so the new CDU just needs `focus.materia.sigla`, `focus.classe.anagrafica.anno`, and `focus.classe.anagrafica.indirizzo` — all already present. A new `ClasseMateriaFocusProvider` populates the multi-teacher focus; a new recipe `CLASSE_MATERIA` activates it.

**Tech Stack:** TypeScript, GAS V8, GasLibraryFactory (DomainRepositoryLib, GasExpressionEngineLib, RoleResolutionLib), Jest (ts-jest).

## Global Constraints

- Target GAS V8: synchronous code only, no Node/browser APIs.
- Native GAS globals only reachable inside `GoogleApiWrapper` (L2); all ALDO code routes through facades. Enforced by ESLint `no-restricted-globals`; `npm run lint` must pass.
- Source uses modern TS but transpiled to Chrome 80.
- `src/domain/` must not import GAS/library modules; repositories stay behind domain interfaces.
- New services/facades wired in `src/config/Bootstrap.ts`, resolved via `ServiceContainer`.
- Library-selection-first: reuse `IExpressionEngine` for MODELLI evaluation; do not reimplement.
- Never edit `dist/*` (generated).
- This adds a new reserved `CONF_DOC.TIPO` value on the **batch axis** (like `DOCUMENTO_DOCENTE_MATERIA` and `DIPARTIMENTO` in `01_SCHEMA_DATABASE.md`); the spec doc must be updated.

---

## File Structure

- `src/application/services/DocumentBatchService.ts` — add `generateClassiMateria()`, dispatch branch in `batchGenerateHandler`, `ClasseMateriaBatchTarget` type, `BatchResumeState.classeMateriaTargets`.
- `src/application/services/DocumentGenerationService.ts` — add `generateForClasseMateria()`.
- `src/application/context-engine/providers/ClasseMateriaFocusProvider.ts` — **new** provider populating `focus.materia` + `focus.classiMateria.docenti`.
- `src/application/context-engine/Recipe.ts` — add `CLASSE_MATERIA` recipe.
- `src/application/context-engine/ContextEngineFactory.ts` — register the new provider.
- `src/application/context-engine/Cdu.ts` — extend CDU types (`focus.materia`, `focus.classiMateria`).
- `src/domain/repositories/IClasseRepository.ts` + `ClasseRepository.ts` — add `getDocentiEffettiviPerMateria()` (role-resolved multi-teacher lookup).
- `SPECS_ALDO/02_CDU_STRUTTURA.md`, `01_SCHEMA_DATABASE.md` — document new axis, `focus.*` paths.
- Tests: `test/unit/application/document-batch-service.test.ts`, `document-generation-service.test.ts`, `context-engine/providers/classe-materia-focus-provider.test.ts`, `classe-repository.test.ts`.

---

### Task 1: Domain/repository — role-resolved multi-teacher lookup

**Files:**

- Modify: `src/domain/repositories/IClasseRepository.ts` (interface)
- Modify: `src/infrastructure/repositories/ClasseRepository.ts` (implementation)
- Test: `test/unit/infrastructure/classe-repository.test.ts`

**Interfaces:**

- Produces: `IClasseRepository.getDocentiEffettiviPerMateria(classe: Classe, materia: MateriaId, date: Date, resolver: ITeachingAssignmentResolver): Docente[]` — every ACTIVE teacher (role-resolved chain SUPPLENZE→VARIAZIONI_CATTEDRA→CLASSI, `includeReligioneAlt: true`) assigned to the subject in the class. Order: nominal-then-substitutes won't be guaranteed; dedup by email.

This task adds the repository method. Role resolution itself is delegated to `ITeachingAssignmentResolver.resolveConsiglio` (already a constructor dependency of `DocumentBatchService`), so the repository does NOT itself depend on the resolver — keep the resolver invocation in the batch/generation layer where it already lives. **Wait — the repository signature above pulls the resolver in, which would pollute the domain. Refine: the repository exposes a plain `getDocentiPerMateria` (already exists) and the new multi-teacher resolution happens in `DocumentBatchService`/`ClasseMateriaFocusProvider` from `resolveConsiglio`, reusing the exact pattern `generateDocentiMateria` already uses.** Therefore Task 1 is NOT needed — no repository change. `resolveConsiglio` already returns a `TeachingAssignment` list with `docenteEffettivo`, and `ClasseMateriaFocusProvider` can derive all teachers per materia by filtering that list. **Task 1 dropped (YAGNI): zero new repository surface.**

---

### Task 2: Batch axis — `generateClassiMateria`

**Files:**

- Modify: `src/application/services/DocumentBatchService.ts`
- Test: `test/unit/application/document-batch-service.test.ts`

**Interfaces:**

- Consumes: `DocumentGenerationService.generateForClasseMateria` (Task 3), `ITeachingAssignmentResolver.resolveConsiglio`, existing `filterPerGestioneArticolazione`, `findAttive`.
- Produces: new reserved `TIPO = 'DOCUMENTO_CLASSE_MATERIA'` dispatch branch; `export interface ClasseMateriaBatchTarget { classe: string; materiaId: string }`; `BatchResumeState.classeMateriaTargets?: ClasseMateriaBatchTarget[]`.

- [ ] **Step 1: Write failing test**

In `test/unit/application/document-batch-service.test.ts`, add a `wireClassiMateria()` factory (mirror `wireDocentiMateria`) and tests:

- dispatch on `TIPO=DOCUMENTO_CLASSE_MATERIA` routes to the new generator producing one target per (classe, materia), **not** per (classe, materia, docente);
- a class whose MATE slot has 2 teachers yields **one** `MATE` target, not two;
- resume from persisted `classeMateriaTargets` skips already `processed` work without re-querying `resolveConsiglio`;
- a single failure is isolated into `errori` and the batch continues;
- `GESTIONE_ARTICOLAZIONE=COMPLETA` excludes partners (reuse fixture 5A/1F).

Test (representative first test):

```ts
test('DOCUMENTO_CLASSE_MATERIA emits one target per (classe, materia), not per docente', () => {
  const { service, generated } = wireClassiMateria();
  drain(service.batchGenerateHandler({ confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' }));
  // 5A: MATE(bianchi), FISI(bianchi), IRC(verdi) -> 3 materie
  // 1F: MATE(rossi) -> 1 materia
  // => one generateForClasseMateria call per materia, each carrying the
  //    full teacher set, not per teacher.
  expect(generated).toEqual([
    { classe: '5A', materia: 'MATE', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' },
    { classe: '5A', materia: 'FISI', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' },
    { classe: '5A', materia: 'IRC', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' },
    { classe: '1F', materia: 'MATE', confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' }
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts -t "DOCUMENTO_CLASSE_MATERIA"`
Expected: FAIL — the new TIPO branch falls through to `generateClassi` producing per-class results, and/or `classeMateriaTargets` type is missing (compile error).

- [ ] **Step 3: Add `ClasseMateriaBatchTarget` and resume field**

Add near `DocenteMateriaBatchTarget`:

```ts
export interface ClasseMateriaBatchTarget {
  classe: string;
  materiaId: string;
}
```

Extend `BatchResumeState`:

```ts
classeMateriaTargets?: ClasseMateriaBatchTarget[];
```

- [ ] **Step 4: Add dispatch branch**

In `batchGenerateHandler`, after the `DOCUMENTO_DOCENTE_MATERIA` branch:

```ts
if (config.tipo === 'DOCUMENTO_CLASSE_MATERIA') {
  return yield * this.generateClassiMateria(config, confDocId, jobId, resume, processed, errori);
}
```

- [ ] **Step 5: Implement `generateClassiMateria`**

Mirror `generateDocentiMateria` but build targets as `(classe.id, materiaId)` deduped per class. Derive the teacher set from `resolveConsiglio(classe, this.now, { includeReligioneAlt: true })` — but **do not** create one target per teacher; group assignments by `{materiaId}` per class and emit a single target. `materiaId` uses the same `slot.specifica` composite rule as `generateDocentiMateria` (`BASE.SPECIFICA`). Each target calls `this.documenti.generateForClasseMateria(ClasseId.of(target.classe), target.materiaId, confDocId, jobId)`. Persist `classeMateriaTargets` in the checkpoint.

```ts
private *generateClassiMateria(
  config: ConfigurazioneDocumento,
  confDocId: string,
  jobId: string,
  resume: BatchResumeState | null,
  processed: string[],
  errori: string[]
): Generator<BatchCheckpoint, BatchResult, void> {
  let targets: ClasseMateriaBatchTarget[];
  if (resume === null) {
    targets = [];
    const seen = new Set<string>();
    const attive = this.classi.filterPerGestioneArticolazione(
      this.classi.findAttive(),
      config.gestioneArticolazione
    );
    for (const classe of attive) {
      const assignments = this.teachingAssignments.resolveConsiglio(classe, this.now, {
        includeReligioneAlt: true
      });
      for (const assignment of assignments) {
        const classeId = classe.id ?? '';
        const materiaId =
          assignment.slot.specifica === null
            ? assignment.slot.materia.value
            : `${assignment.slot.materia.value}.${assignment.slot.specifica}`;
        const key = `${classeId}:${materiaId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ classe: classeId, materiaId });
      }
    }
  } else {
    if (resume.classeMateriaTargets === undefined) {
      throw new ConfigurationError(
        `Stato di ripresa ${confDocId} privo dei target classe/materia persistiti`
      );
    }
    targets = resume.classeMateriaTargets.map((t) => ({ ...t }));
  }

  if (resume === null) {
    this.monitor?.registerJob(jobId);
    this.monitor?.startJob(jobId);
  }
  this.logger?.logBatchStart(targets.length);

  for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
    const target = targets[i]!;
    const targetId = `${target.classe}:${target.materiaId}`;
    this.logger?.logItemStart(i + 1, targets.length, 'Target', targetId, 'DOCUMENT');
    let message: string;
    const itemStartedAt = Date.now();
    try {
      const result = this.documenti.generateForClasseMateria(
        ClasseId.of(target.classe),
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
      this.logger?.logSummary(
        'Document failed',
        Math.max(0, Date.now() - itemStartedAt),
        `${targetId}: ${reason}`,
        { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
      );
      message = `Errore ${i + 1}/${targets.length} ${targetId}: ${reason}`;
    }
    processed.push(targetId);
    const percentage = ((i + 1) / targets.length) * 100;
    this.monitor?.updateProgress(jobId, percentage, message);
    yield {
      confDocId,
      jobId,
      percentage,
      nextIndex: i + 1,
      processed: processed.slice(),
      errori: errori.slice(),
      classeMateriaTargets: targets
    };
  }

  const success = errori.length === 0;
  this.monitor?.completeJob(
    jobId,
    `${processed.length} documenti classe/materia elaborati, ${errori.length} errori`
  );
  return { success, totale: targets.length, processed, errori };
}
```

- [ ] **Step 6: Run full batch test file**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 7: Commit**

```bash
git add src/application/services/DocumentBatchService.ts test/unit/application/document-batch-service.test.ts
git commit -m "feat(batch): DOCUMENTO_CLASSE_MATERIA axis, one doc per classe+materia"
```

---

### Task 3: Service — `generateForClasseMateria`

**Files:**

- Modify: `src/application/services/DocumentGenerationService.ts`
- Test: `test/unit/application/document-generation-service.test.ts`

**Interfaces:**

- Consumes: `generateForClasseWithRecipe` (private), `BuildParams`, `ITeachingAssignmentResolver`, recipe `'CLASSE_MATERIA'` (Task 4).
- Produces: `generateForClasseMateria(target: ClasseId, materiaId: string, confDocId: string, jobId?: string): DocumentGenerationResult`.

- [ ] **Step 1: Write failing test**

In `document-generation-service.test.ts`, a test that `generateForClasseMateria` builds a CDU whose `focus.materia.sigla` equals `materiaId`, `focus.classiMateria.docenti` holds all role-resolved teachers of that subject, and `focus.classe.anagrafica.anno`/`indirizzo` are present. (Mirror existing `generateForClasseDocenteMateria` tests.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts -t "generateForClasseMateria"`
Expected: FAIL — method missing.

- [ ] **Step 3: Implement**

Add a public method delegating to the private recipe builder (same shape as `generateForClasseDocenteMateria`):

```ts
/** One document per (classe, materia) of an active class — e.g. "scheda materia per classe". */
generateForClasseMateria(
  target: ClasseId,
  materiaId: string,
  confDocId: string,
  jobId?: string
): DocumentGenerationResult {
  return this.generateForClasseWithRecipe(
    target,
    confDocId,
    'CLASSE_MATERIA',
    { materiaCorrente: materiaId },
    jobId
  );
}
```

Note: pass `materiaCorrente` (not `docenteCorrente`) so the new `ClasseMateriaFocusProvider` (Task 4) receives it.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/DocumentGenerationService.ts test/unit/application/document-generation-service.test.ts
git commit -m "feat(generation): generateForClasseMateria service method"
```

---

### Task 4: CDU provider — `ClasseMateriaFocusProvider`

**Files:**

- Create: `src/application/context-engine/providers/ClasseMateriaFocusProvider.ts`
- Modify: `src/application/context-engine/Recipe.ts` (new recipe `CLASSE_MATERIA`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register provider)
- Modify: `src/application/context-engine/Cdu.ts` (types)
- Test: `test/unit/application/context-engine/providers/classe-materia-focus-provider.test.ts`

**Interfaces:**

- Consumes: `BuildParams.materiaCorrente`, `cdu.focus.classe.consiglioDiClasse` (already role-resolved by `consiglio` provider), provider token ids.
- Produces: provider token `classeMateriaFocus`; CDU `focus.materia` (SubjectVM) and `focus.classiMateria.docenti` (PersonVM[] of all teachers of that subject).

- [ ] **Step 1: Write failing test**

Test that given a council where MATE has teachers `[rossi, bianchi]`, invoking the provider with `materiaCorrente='MATE'` sets `cdu.focus.materia.sigla='MATE'` and `cdu.focus.classiMateria.docenti` = both teachers (PersonVM form). Also asserts a missing materia throws `PipelineError`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/classe-materia-focus-provider.test.ts`
Expected: FAIL — provider/type missing (compile error).

- [ ] **Step 3: Implement provider**

```ts
import type { Cdu } from '../Cdu';
import type { BuildParams, Provider } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

export class ClasseMateriaFocusProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const cdc = cdu.focus.classe?.consiglioDiClasse ?? [];
    const materiaId = params.materiaCorrente;
    if (materiaId == null) {
      throw new PipelineError('DOCUMENTO_CLASSE_MATERIA: materiaCorrente mancante');
    }
    const items = cdc.flatMap((d) =>
      d.materie.filter((m) => m.sigla === materiaId).map((m) => ({ docente: d, materia: m }))
    );
    if (items.length === 0) {
      throw new PipelineError(
        `DOCUMENTO_CLASSE_MATERIA: materia ${materiaId} non trovata nel consiglio di classe`
      );
    }
    cdu.focus.materia = items[0]!.materia;
    cdu.focus.classiMateria = {
      docenti: items.map((i) => i.docente.anagrafica)
    };
  }
}
```

`consiglioDiClasse` items are `DocenteCdcVM` with `materie: SubjectVM[]` and `anagrafica: PersonVM` — reuse the exact shapes `docente-materia-focus-provider.test` already builds. The council is role-resolved upstream (the `consiglio` provider resolves SUPPLENZE/VARIAZIONI chains), so this provider gets the **active** teacher set for free — permissions apply to all of them.

- [ ] **Step 4: Add recipe + register provider**

In `Recipe.ts`, add:

```ts
CLASSE_MATERIA: [
  'school',         // istituto info
  'class',          // focus.classe.anagrafica → anno, indirizzo (MODELLI selection keys)
  'consiglio',      // focus.classe.consiglioDiClasse → feeds ClasseMateriaFocusProvider
  'classeMateriaFocus'  // focus.materia.sigla + focus.classiMateria.docenti
],
```

> **ponytail:** Only these 4 providers are needed for MODELLI template selection by `materia.sigla` + `classe.anagrafica.anno` + `classe.anagrafica.indirizzo` and for applying ACL to all role-resolved teachers. Add `'students'`, `'materie'`, etc. only when a template actually references them — they are not part of this axis's minimum contract.
> In `ContextEngineFactory.ts` (near `docenteMateriaFocus`, ~line 120):

```ts
.registerProvider('classeMateriaFocus', new ClasseMateriaFocusProvider())
```

- [ ] **Step 5: Extend CDU types**

`focus.materia?: SubjectVM` is already declared in `Cdu.ts` (shared with `DocenteMateriaFocusProvider`). Only add the new field:

In `src/application/context-engine/Cdu.ts`, add to the `focus` interface:

```ts
classiMateria?: { docenti: PersonVM[] };
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/classe-materia-focus-provider.test.ts test/unit/application/context-engine/providers/docente-materia-focus-provider.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/providers/ClasseMateriaFocusProvider.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/providers/classe-materia-focus-provider.test.ts
git commit -m "feat(cdu): ClasseMateriaFocusProvider + CLASSE_MATERIA recipe"
```

---

### Task 5: Wiring, spec docs, full verification

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (CONF_DOC reserved `TIPO` on batch axis)
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md` (new `focus.materia`, `focus.classiMateria` paths + §4.5)

**Interfaces:** none new — documentation + full-suite gate.

- [ ] **Step 1: Document CONF_DOC reserved TIPO**

In `01_SCHEMA_DATABASE.md`, extend the "Altri `CONF_DOC.TIPO` riservati (asse di batch)" block after `DOCUMENTO_DOCENTE_MATERIA`:

> - `DOCUMENTO_CLASSE_MATERIA`: un documento per ciascuna materia di ogni classe attiva — non per docente. Popola `focus.materia`/`focus.classiMateria` (02 §4.5); `LOG_DOCS.SOTTOTIPO` è `materia`.

- [ ] **Step 2: Document CDU paths**

In `02_CDU_STRUTTURA.md` §4.5, add the `focus.materia` + `focus.classiMateria` paths (materia `SubjectVM`; `docenti: PersonVM[]` = all role-resolved teachers of that subject in the class).

- [ ] **Step 3: Run full check + typecheck + lint**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/02_CDU_STRUTTURA.md
git commit -m "docs(specs): DOCUMENTO_CLASSE_MATERIA axis + focus.classiMateria"
```

---

### Task 6: Rename `DOCUMENTO_DOCENTE_MATERIA` → `DOCUMENTO_DOCENTE_CLASSE_MATERIA`

The existing axis generates one document per **(classe, docente, materia)** triple, so its name should say so. This is a pure rename of the reserved `CONF_DOC.TIPO` value and the matching code identifiers — no behaviour change, and independent of Tasks 2–5 (it targets the _old_ axis, not the new `DOCUMENTO_CLASSE_MATERIA`), so it can run last.

**Files (from repo-wide grep):**

- `src/application/services/DocumentBatchService.ts` — `'DOCUMENTO_DOCENTE_MATERIA'` dispatch check, `DocenteMateriaBatchTarget`, `generateDocentiMateria`, `docenteMateriaTargets` resume field, `generateForClasseDocenteMateria` call site.
- `src/application/services/DocumentGenerationService.ts` — `generateForClasseDocenteMateria` method.
- `src/application/context-engine/providers/DocenteMateriaFocusProvider.ts` — class token `docenteMateriaFocus`, its class name, error strings.
- `src/application/context-engine/Recipe.ts` + `ContextEngineFactory.ts` — provider token `docenteMateriaFocus`.
- `src/application/pipelines/documentSteps.ts` — `'DOCUMENTO_DOCENTE_MATERIA'` branch (SOTTOTIPO = `materiaId::docenteEmail`).
- `src/onlinetests/checks/itpDottedChecks.ts`, `articolazioneChecks.ts`, `data/SharedTestDatabaseBuilder.ts` — reserved TIPO values in live test fixtures.
- `test/unit/...` (`document-batch-service`, `document-generation-service`, `document-steps`, `docente-materia-focus-provider`, `onlinetests/articolazione-checks`, `onlinetests/e2e-sample-database-builder`) — mirror renames.
- `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `SPECS_ALDO/02_CDU_STRUTTURA.md`.

> **ponytail / caveat:** The string `'DOCUMENTO_DOCENTE_MATERIA'` is also a **persisted `CONF_DOC.TIPO` value in production data**. Renaming the code constant does not rewrite existing `CONF_DOC` rows — the user migrates that data manually, so no migration step is included here.

- [ ] **Step 1: Rename the reserved TIPO value + code identifiers**
      Find-replace `DOCUMENTO_DOCENTE_MATERIA` → `DOCUMENTO_DOCENTE_CLASSE_MATERIA` in the source + onlinetests + spec files listed above, and `generateDocentiMateria` → `generateDocentiClasseMateria`, `DocenteMateriaBatchTarget` → `DocenteClasseMateriaBatchTarget`, `generateForClasseDocenteMateria` → `generateForClasseDocente...`-consistent name (pick one and use it everywhere), `docenteMateriaTargets` → `docenteClasseMateriaTargets`, `DocenteMateriaFocusProvider` → `DocenteClasseMateriaFocusProvider`, `docenteMateriaFocus` → `docenteClasseMateriaFocus`, and matching test-file renames.
- [ ] **Step 2: Run full verification**
      Run: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:build`.
      Expected: all green — the rename must be behaviour-neutral.
- [ ] **Step 3: Commit**
  ```bash
  git add src test SPECS_ALDO
  git commit -m "refactor(batch): rename DOCUMENTO_DOCENTE_MATERIA → DOCUMENTO_DOCENTE_CLASSE_MATERIA"
  ```

---

## Self-Review

- **Spec coverage:** The new batch axis (Task 2), single service entry (Task 3), multi-teacher CDU + template selection keys (Task 4), spec docs (Task 5), axis rename (Task 6) cover every requirement. No repository change (Task 1 dropped — `resolveConsiglio` already supplies role-resolved teachers).
- **Placeholder scan:** No TODO/TBD; all steps carry code.
- **Type consistency:** `generateForClasseMateria(target, materiaId, confDocId, jobId)` signature is used identically in Task 2 (batch) and Task 3 (service). `BuildParams.materiaCorrente` reused from the existing DocenteMateria path. Provider token `classeMateriaFocus` matches registration and recipe. `focus.classiMateria.docenti` is exactly the type `PersonVM[]` used across the CDU.
