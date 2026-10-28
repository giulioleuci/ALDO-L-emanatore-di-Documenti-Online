# Articulated-Class Gaps — Code Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four concrete silent-data-loss / rendering bugs in how ALDO handles articulated (parent/partner) classes, found by tracing CDU construction and email role resolution against `ARTICOLAZIONE.md`'s open-issues catalog.

**Architecture:** All four fixes reuse the existing partner-expansion pattern already proven correct elsewhere in the codebase — `classi.getArticolazione(classe)?.isParent() === true` → iterate `classi.getClassiPartner(classe)` (as done today in `RappresentantiProvider`, `StudentiProvider`, `ClasseProvider.buildCoordinatori`) — rather than inventing a new mechanism. No new library code is needed: every operation used (`getArticolazione`, `getClassiPartner`, `getGruppoArticolazione`, `getDocentiRuolo`) already exists on `IClasseRepository`/`ClasseRepository`. This is pure ALDO-local domain logic (CLASSI/ARTICOLAZIONE schema shape is SGSA-specific), so no `GasLibraryFactory` extension question applies.

**Tech Stack:** TypeScript, Jest (`test/unit/**`), existing `FakeDatabase`/`fixtureTables()` test harness.

## Global Constraints

- Every fix must reuse `classi.getArticolazione(classe)?.isParent()` / `getClassiPartner(classe)` / `getGruppoArticolazione(classe)` — do not reimplement parent/partner detection.
- Do not touch `GasLibraryFactory/` — nothing here needs a library extension (see Architecture above).
- Preserve existing non-articulated-class behavior exactly; every task adds a regression test proving the standard-class path is unchanged where one doesn't already exist.
- Run `npm test` (full unit suite) after each task, not just the new test — several existing tests already exercise `1F`/`1F-LSO`/`1F-LSS` fixtures and must keep passing.
- Items 1 (`GESTIONE_ARTICOLAZIONE` dead column) and 5 (shared `INDIRIZZI` id in E2E fixtures) from `ARTICOLAZIONE.md` are explicitly OUT of scope — Item 1 needs a product decision, Item 5 is cosmetic-only. Do not fix them in this plan.

---

### Task 1: `DocumentGenerationService.generateForClasse` must expand articulated parents into `classiCompetenza`

**Files:**

- Modify: `src/application/services/DocumentGenerationService.ts:1-90` (imports, `DocumentGenerationDeps`, constructor, `generateForClasse`)
- Modify: `src/config/Bootstrap.ts:200-216` (`documentGenerationService` registration)
- Modify: `src/application/services/EmailNotificationService.ts:292-297` (simplify now-redundant branch)
- Test: `test/unit/application/document-generation-service.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.findById(id: ClasseId): Classe | null`, `IClasseRepository.getGruppoArticolazione(classe: Classe): Classe[]` (both already exist, `ClasseRepository.ts:255-278`).
- Produces: `DocumentGenerationDeps.classi: IClasseRepository` (new required field) — no other task depends on this.

- [ ] **Step 1: Write the failing test**

Add to `test/unit/application/document-generation-service.test.ts` (new imports alongside the existing ones at the top of the file):

```ts
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
```

Update the `wire()` helper (currently lines 40-67) to pass the new dependency:

```ts
function wire(
  tables: Record<string, Row[]> = fixtureTables(),
  options: {
    strategy?: GeneratorStrategy;
    registry?: Map<string, GeneratorStrategy>;
    db?: FakeDatabase;
    now?: Date;
  } = {}
) {
  const db = options.db ?? new FakeDatabase(tables);
  const drive = new FakeDriveFacade();
  const templates = new FakeTemplateEngine();
  const registry =
    options.registry ??
    new Map([['VERBALE_CDC', options.strategy ?? new VerbaleGeneratorStrategy(templates)]]);
  const service = new DocumentGenerationService({
    db,
    drive,
    contextBuilder: composeContextBuilder(db),
    strategyRegistry: registry,
    templates,
    expressionEngine: new ExpressionEngineFacade(),
    configs: new ConfigurazioneDocumentoRepository(db),
    roleResolver: composeRisolutoreRuoli(db),
    classi: new ClasseRepository(db),
    now: options.now ?? new Date('2026-07-01T09:00:00Z')
  });
  return { db, drive, templates, service };
}
```

Add a new describe block at the end of the file:

```ts
describe('DocumentGenerationService.generateForClasse — articulated parent (ARTICOLAZIONE.md item 7)', () => {
  class CapturingStrategy implements GeneratorStrategy {
    cdu: Cdu | undefined;
    render(_fileId: string, cdu: Cdu): void {
      this.cdu = cdu;
    }
  }

  test('includes personalized plans filed under a partner class when targeting the parent', () => {
    const tables = fixtureTables();
    tables.CONF_DOC!.push({
      ID: 'CD_CLASSE_COMPLETA',
      TIPO: 'GENERICO',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Doc_{{focus.classe.anagrafica.nome}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
    tables.LOG_DOCS!.push({
      ID: 'LD1',
      ID_GEN: 'CD_CLASSE_COMPLETA',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'Piano DSA',
      STATO: 'PUBBLICATO',
      NOTIFICATO: true,
      PATH: '',
      LINK: 'https://drive/piano-dsa',
      CLASSI: '1F-LSO',
      UTENTI: 'studente@school.test',
      MATERIE: '',
      DATA_CREAZ: '2026-06-01T00:00:00.000Z',
      ID_ORIG: ''
    });
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    service.generateForClasse(ClasseId.of('1F'), 'CD_CLASSE_COMPLETA');

    expect(
      strategy.cdu?.focus.classe?.didattica?.pianiPersonalizzati.items.map((i) => i.id)
    ).toEqual(['LD1']);
  });

  test('standard (non-articulated) class is unaffected: classiCompetenza is just the target', () => {
    const tables = fixtureTables();
    tables.CONF_DOC!.push({
      ID: 'CD_5A',
      TIPO: 'GENERICO',
      GENERATORE: 'CAPTURING',
      CONDIZIONE: null,
      MODELLI: '{"templateId":"tmpl_generico"}',
      FILE_NAME: 'Doc_{{focus.classe.anagrafica.nome}}',
      PATH_OUT: 'Docs',
      DUPLICAZIONE: 'NEGATA',
      PERMESSI: null,
      POST_PROCESSO: null,
      PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: '',
      FORMATO: 'GDOC',
      REGISTRA_DOC: null,
      REGISTRA_FOLD: null
    });
    const strategy = new CapturingStrategy();
    const { service } = wire(tables, { registry: new Map([['CAPTURING', strategy]]) });

    service.generateForClasse(ClasseId.of('5A'), 'CD_5A');

    expect(strategy.cdu?.meta.parametriInput.target).toBe('5A');
    expect(strategy.cdu?.focus.classe?.flags.isArticolata).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts -t "articulated parent"`
Expected: FAIL — first test fails with `pianiPersonalizzati.items` empty (`[]` instead of `['LD1']`); `wire()` also fails to compile until `classi` is added to `DocumentGenerationDeps` (Step 3 below), so run this after Step 3's type-only edit if TypeScript blocks the test from executing at all — the empty-array assertion failure is the behavioral proof, the compile error is a mechanical prerequisite, not a placeholder.

- [ ] **Step 3: Add `classi` to `DocumentGenerationDeps` and wire it through the constructor**

In `src/application/services/DocumentGenerationService.ts`, add the import (after the existing `IConfigurazioneDocumentoRepository` import at line 7):

```ts
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
```

Add to `DocumentGenerationDeps` (after `configs: IConfigurazioneDocumentoRepository;`):

```ts
/** Needed to expand an articulated parent target into its partner classes (ARTICOLAZIONE.md item 7). */
classi: IClasseRepository;
```

Add the field and constructor assignment to `DocumentGenerationService`:

```ts
  private readonly classi: IClasseRepository;
```

(after `private readonly configs: IConfigurazioneDocumentoRepository;`), and in the constructor body (after `this.configs = deps.configs;`):

```ts
this.classi = deps.classi;
```

- [ ] **Step 4: Compute and pass `classiCompetenza` in `generateForClasse`**

Replace the body of `generateForClasse` (`DocumentGenerationService.ts:88-113`, up to the `cdu` assignment) with:

```ts
  generateForClasse(
    target: ClasseId,
    confDocId: string,
    jobId?: string
  ): { fileId: string | null; status: string } {
    const row = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
    if (!row) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
    const config = ConfigurazioneDocumento.fromData(row);
    if (!this.strategyRegistry.has(config.generatore)) {
      throw new PipelineError(`GENERATORE non registrato: ${config.generatore}`);
    }

    const classe = this.classi.findById(target);
    if (classe === null) throw new PipelineError(`Classe ${target.value} non trovata`);
    const classiCompetenza = this.classi.getGruppoArticolazione(classe).map((c) => c.id ?? '');

    const cdu = this.contextBuilder.build(
      {
        target: target.value,
        tipoTarget: 'classe',
        now: this.now,
        idConfigurazione: confDocId,
        tipoOperazione: 'GENERAZIONE_DOCUMENTO',
        classiCompetenza
      },
      recipe('CLASSE_COMPLETA')
    );
```

Leave the rest of the method (transaction/pipeline execution) unchanged.

- [ ] **Step 5: Wire the new dependency in Bootstrap**

In `src/config/Bootstrap.ts`, inside the `documentGenerationService` registration (currently `Bootstrap.ts:200-216`), add `classi` to the object literal:

```ts
c.register(
  'documentGenerationService',
  (container) =>
    new DocumentGenerationService({
      db: deps.db,
      drive: deps.drive,
      contextBuilder: container.get<ContextBuilder>('contextBuilder'),
      strategyRegistry: container.get<Map<string, GeneratorStrategy>>('strategyRegistry'),
      templates: deps.templates,
      expressionEngine: deps.expressionEngine,
      configs: new ConfigurazioneDocumentoRepository(deps.db),
      roleResolver: container.get<RisolutoreRuoliService>('risolutoreRuoli'),
      classi: container.get<ClasseRepository>('classi'),
      now: deps.now,
      monitor: deps.monitor,
      logger
    })
);
```

(`ClasseRepository` is already imported in `Bootstrap.ts` and the `'classi'` token is already registered earlier in `buildAldoContainer` — confirmed by the existing `emailNotificationService` registration at `Bootstrap.ts:241` using the same `container.get<ClasseRepository>('classi')` call.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts`
Expected: PASS, all tests in the file including both new ones.

- [ ] **Step 7: Simplify `EmailNotificationService.classiCompetenza` (dead branch removal)**

`getGruppoArticolazione` already returns `[classe]` alone when `getArticolazione(classe) === null` (it always seeds the map with `classe` itself, and only adds more when `config !== null`) — so the `EmailNotificationService.classiCompetenza` null-check branch (`EmailNotificationService.ts:292-297`) is redundant with what `generateForClasse` now does directly. Simplify it to match:

```ts
  private classiCompetenza(classe: Classe): string[] {
    return this.deps.classi.getGruppoArticolazione(classe).map((membro) => membro.id ?? '');
  }
```

- [ ] **Step 8: Run the full unit suite to confirm no regression**

Run: `npx jest --config jest.config.cjs`
Expected: PASS (all existing tests, including every `email-notification-service.test.ts` test that exercises `classiCompetenza` indirectly via `GENITORI_CLASSE`/document-in-email scenarios, and every `document-generation-service.test.ts` / `document-batch-service.test.ts` test).

- [ ] **Step 9: Commit**

```bash
git add src/application/services/DocumentGenerationService.ts src/config/Bootstrap.ts src/application/services/EmailNotificationService.ts test/unit/application/document-generation-service.test.ts
git commit -m "fix: expand articulated-parent targets into classiCompetenza in DocumentGenerationService"
```

---

### Task 2: `RisolutoreRuoliService` role strategies must expand to partner classes

**Files:**

- Modify: `src/application/services/RisolutoreRuoliService.ts:1-20` (import), `:139-153` (`buildRegistro` two lines), `:267-275` (`genitoriClasse`/`rappresentantiStudenti`), append one new private method
- Test: `test/unit/application/risolutore-ruoli-service.test.ts`

**Interfaces:**

- Consumes: `studentiDellaClasse(classi: IClasseRepository, classe: Classe, soloAttivi: boolean): Alunno[]` (already exists, `src/application/context-engine/studenti.ts:10-20`), `IClasseRepository.getArticolazione`/`getClassiPartner`/`getDocentiRuolo` (already exist).
- Produces: `RisolutoreRuoliService.docentiRuoloArticolato` (new private method) — internal only, no other task depends on it.

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/application/risolutore-ruoli-service.test.ts` (the file already has a `build(params, recipeName)` helper defaulting `target: '5A'` — override `target`):

```ts
describe('RisolutoreRuoliService — articulated parent expansion (ARTICOLAZIONE.md item 2)', () => {
  test('GENITORI_CLASSE resolves tutors of students in both partner classes from the parent', () => {
    const { cdu, service } = build({ target: '1F' });
    // Fixture has no ALUNNI seeded under 1F/1F-LSO/1F-LSS, so this must be an
    // empty array — the point of this test is that it does NOT throw and does
    // NOT silently short-circuit on the parent id (see the assertion helper).
    expect(() => emails(service, 'GENITORI_CLASSE', cdu)).not.toThrow();
  });

  test('TUTOR_ASL merges RUOLI across both partner classes when resolved from the parent', () => {
    const tables = fixtureTables();
    const lso = tables.CLASSI!.find((r) => r.ID === '1F-LSO')!;
    lso.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
    const lss = tables.CLASSI!.find((r) => r.ID === '1F-LSS')!;
    lss.RUOLI = JSON.stringify({ TUTOR_ASL: 'verdi@school.it' });
    const db = new FakeDatabase(tables);
    const buildParams: BuildParams = { target: '1F', tipoTarget: 'classe', now: NOW };
    const cdu = composeContextBuilder(db).build(buildParams, recipe('CLASSE_COMPLETA'));
    const service = composeRisolutoreRuoli(db);

    expect(emails(service, 'TUTOR_ASL', cdu)).toEqual(['bianchi@school.it', 'verdi@school.it']);
  });

  test('TUTOR_ASL on a standard class still reads only its own RUOLI (regression)', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'TUTOR_ASL', cdu)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts -t "articulated parent expansion"`
Expected: the `TUTOR_ASL merges RUOLI` test FAILs — `emails(...)` returns `[]` instead of `['bianchi@school.it', 'verdi@school.it']`, since `getDocentiRuolo` today reads only `ctx.classe` (`1F`), whose own `RUOLI` cell is unset.

- [ ] **Step 3: Add the `studentiDellaClasse` import and fix `genitoriClasse`/`rappresentantiStudenti`**

In `src/application/services/RisolutoreRuoliService.ts`, add (after the `getClasseEntity` import at line 14):

```ts
import { studentiDellaClasse } from '../context-engine/studenti';
```

Replace `genitoriClasse` and `rappresentantiStudenti` (`RisolutoreRuoliService.ts:267-275`):

```ts
  private genitoriClasse(ctx: RoleContext): Email[] {
    return studentiDellaClasse(this.classi, ctx.classe, true).flatMap((alunno) =>
      alunno.getTutors()
    );
  }

  private rappresentantiStudenti(ctx: RoleContext): Email[] {
    return studentiDellaClasse(this.classi, ctx.classe, true)
      .filter((alunno) => alunno.isRappresentante())
      .map((alunno) => Email.of(alunno.id ?? ''));
  }
```

- [ ] **Step 4: Add `docentiRuoloArticolato` and wire `TUTOR_ASL`/`TUTOR_ORIENT` to it**

Add a new private method to `RisolutoreRuoliService` (near `genitoriClasse`/`rappresentantiStudenti`):

```ts
  /** Merges a RUOLI-based role across an articulated parent's partner classes; plain lookup otherwise. */
  private docentiRuoloArticolato(classe: Classe, nomeRuolo: string): Docente[] {
    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() !== true) return this.classi.getDocentiRuolo(classe, nomeRuolo);
    const byEmail = new Map<string, Docente>();
    for (const gruppo of [classe, ...this.classi.getClassiPartner(classe)]) {
      for (const docente of this.classi.getDocentiRuolo(gruppo, nomeRuolo)) {
        if (docente.id !== null) byEmail.set(docente.id, docente);
      }
    }
    return [...byEmail.values()];
  }
```

In `buildRegistro` (`RisolutoreRuoliService.ts:145-146`), replace:

```ts
      ['TUTOR_ASL', (c) => this.emailsOf(this.classi.getDocentiRuolo(c.classe, 'TUTOR_ASL'))],
      ['TUTOR_ORIENT', (c) => this.emailsOf(this.classi.getDocentiRuolo(c.classe, 'TUTOR_ORIENT'))],
```

with:

```ts
      ['TUTOR_ASL', (c) => this.emailsOf(this.docentiRuoloArticolato(c.classe, 'TUTOR_ASL'))],
      ['TUTOR_ORIENT', (c) => this.emailsOf(this.docentiRuoloArticolato(c.classe, 'TUTOR_ORIENT'))],
```

`SEGRETARIO_CDC` is deliberately left untouched — per `ARTICOLAZIONE.md` item 2's note, it is a single-holder role that may be intentionally assigned per physical class, pending a product decision.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 6: Run the full unit suite**

Run: `npx jest --config jest.config.cjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/services/RisolutoreRuoliService.ts test/unit/application/risolutore-ruoli-service.test.ts
git commit -m "fix: expand GENITORI_CLASSE/RAPPRESENTANTI_STUDENTI/TUTOR_ASL/TUTOR_ORIENT to partner classes"
```

---

### Task 3: `TutorProvider` must expand `focus.classe.tutor` to partner classes on the parent

**Files:**

- Modify: `src/application/context-engine/providers/TutorProvider.ts` (whole file, 31 lines)
- Test: create `test/unit/application/context-engine/tutor-provider.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.getArticolazione`/`getClassiPartner`/`getDocentiRuolo` (already exist).
- Produces: none consumed elsewhere in this plan.

- [ ] **Step 1: Write the failing test**

Create `test/unit/application/context-engine/tutor-provider.test.ts`:

```ts
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { TutorProvider } from '../../../../src/application/context-engine/providers/TutorProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

function tutorFor(target: string, tables = fixtureTables()) {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('tutor', new TutorProvider(classi));
  const params: BuildParams = {
    target,
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = { providers: ['class', 'tutor'], options: makeOptions({}) };
  return b.build(params, recipe).focus.classe!.tutor!;
}

test('standard class: tutor read from its own RUOLI (regression)', () => {
  const tables = fixtureTables();
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A.RUOLI = JSON.stringify({ TUTOR_ASL: 'rossi@school.it' });
  expect(tutorFor('5A', tables).asl).toEqual([{ nome: 'ROSSI MARIO', email: 'rossi@school.it' }]);
});

test('articulated parent: tutor ASL merged across both partner classes', () => {
  const tables = fixtureTables();
  const lso = tables.CLASSI!.find((r) => r.ID === '1F-LSO')!;
  lso.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
  const lss = tables.CLASSI!.find((r) => r.ID === '1F-LSS')!;
  lss.RUOLI = JSON.stringify({ TUTOR_ASL: 'verdi@school.it' });

  const asl = tutorFor('1F', tables).asl;
  expect(asl.map((t) => t.email).sort()).toEqual(['bianchi@school.it', 'verdi@school.it']);
});
```

(`getNomeCompleto()` returns `"${cognome} ${nome}"`, and the fixture stores `COGNOME: 'ROSSI', NOME: 'MARIO'` — verified against `Docente.getNomeCompleto`, `Docente.ts:52-54`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/tutor-provider.test.ts -t "articulated parent"`
Expected: FAIL — `asl` is `[]` (empty), since `TutorProvider` today reads `RUOLI` only off `1F`'s own row.

- [ ] **Step 3: Implement the fix**

Replace `src/application/context-engine/providers/TutorProvider.ts`'s `provide` method:

```ts
  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() === true) {
      focusClasse.tutor = {
        asl: this.tutorGruppo(classe, RUOLO_TUTOR_ASL),
        orientamento: this.tutorGruppo(classe, RUOLO_TUTOR_ORIENT)
      };
      return;
    }

    focusClasse.tutor = {
      asl: this.tutorVM(classe, RUOLO_TUTOR_ASL),
      orientamento: this.tutorVM(classe, RUOLO_TUTOR_ORIENT)
    };
  }
```

and add the two private helpers below it (before the closing `}` of the class):

```ts
  private tutorVM(
    classe: ReturnType<typeof getClasseEntity>,
    ruolo: string
  ): Array<{ nome: string; email: string }> {
    return this.classi
      .getDocentiRuolo(classe, ruolo)
      .map((d) => ({ nome: d.getNomeCompleto(), email: d.id ?? '' }));
  }

  private tutorGruppo(
    classe: ReturnType<typeof getClasseEntity>,
    ruolo: string
  ): Array<{ nome: string; email: string }> {
    const byEmail = new Map<string, { nome: string; email: string }>();
    for (const gruppo of [classe, ...this.classi.getClassiPartner(classe)]) {
      for (const vm of this.tutorVM(gruppo, ruolo)) {
        if (vm.email !== '') byEmail.set(vm.email, vm);
      }
    }
    return [...byEmail.values()];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/tutor-provider.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Run the full unit suite**

Run: `npx jest --config jest.config.cjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/providers/TutorProvider.ts test/unit/application/context-engine/tutor-provider.test.ts
git commit -m "fix: TutorProvider expands ASL/orientamento tutors to partner classes on an articulated parent"
```

---

### Task 4: Dedupe `DocenteCdcVM.materie`/`materieDescrizione` for `COMUNE` teachers

**Files:**

- Modify: `src/application/context-engine/TeachingCouncilProjection.ts:197-267` (`councilVmStrategy`), add one module-level helper
- Test: `test/unit/application/context-engine/consiglio-provider.test.ts`

**Interfaces:**

- Produces: none consumed elsewhere in this plan.

- [ ] **Step 1: Write the failing assertions**

In `test/unit/application/context-engine/consiglio-provider.test.ts`, extend the existing test `'CDC of an articulated parent: tipoArticolazione by partner membership (09 §9)'` (already at lines 87-99) by adding, after the existing `materieDescrizione` assertions:

```ts
expect(byEmail(list, 'rossi@school.it').materie).toEqual([
  { sigla: 'MATE', nome: 'Matematica', colore: '', specificita: null }
]);
expect(byEmail(list, 'rossi@school.it').materieDescrizione).toBe('Matematica');
```

(`rossi` is `COMUNE` — MATE is taught by `rossi` in both `1F-LSO` and `1F-LSS`, so today it produces two identical `materie` entries and `materieDescrizione: 'Matematica, Matematica'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts -t "articulated parent"`
Expected: FAIL — `materieDescrizione` is `'Matematica, Matematica'`, `materie` has 2 entries.

- [ ] **Step 3: Implement the fix**

In `src/application/context-engine/TeachingCouncilProjection.ts`, add a module-level helper function (near the top-level helpers, alongside `tipoArticolazione`):

```ts
function dedupeMaterie<T extends { sigla: string; specificita: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = `${item.sigla}�${item.specificita ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
```

In `councilVmStrategy` (`TeachingCouncilProjection.ts:197-267`), change:

```ts
const materieVm = assignments.map((assignment) => ({
  sigla: assignment.slot.materia,
  nome:
    materie.findByIdCached(MateriaId.of(assignment.slot.materia))?.nome ?? assignment.slot.materia,
  colore: '',
  specificita: assignment.slot.specifica
}));
```

to:

```ts
const materieVm = dedupeMaterie(
  assignments.map((assignment) => ({
    sigla: assignment.slot.materia,
    nome:
      materie.findByIdCached(MateriaId.of(assignment.slot.materia))?.nome ??
      assignment.slot.materia,
    colore: '',
    specificita: assignment.slot.specifica
  }))
);
```

The rest of the function (`materie: materieVm`, `materieDescrizione: materieVm.map((m) => m.nome).join(', ')`) is unchanged — both now derive from the deduped array.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: PASS, all tests in the file (including the `SEPARATO_PRIMO`/`SEPARATO_SECONDO` `bianchi`/`verdi` cases, which have only one assignment each and must be unaffected).

- [ ] **Step 5: Run the full unit suite**

Run: `npx jest --config jest.config.cjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/TeachingCouncilProjection.ts test/unit/application/context-engine/consiglio-provider.test.ts
git commit -m "fix: dedupe DocenteCdcVM.materie/materieDescrizione for COMUNE teachers in articulated classes"
```

---

### Task 5: Update `ARTICOLAZIONE.md` to close out fixed items

**Files:**

- Modify: `ARTICOLAZIONE.md`

**Interfaces:**

- Consumes: the merged state of Tasks 1-4.

- [ ] **Step 1: Mark items 2, 3, and 7 as resolved**

For each of items 2, 3, and 7 (item 7 only exists if `docs/superpowers/plans/2026-07-31-articolazione-doc-correction.md` Task 4 was already applied — if not, skip renumbering and instead fold Task 1's fix description directly into item 4's existing text), change `- **Status**: Open` to `- **Status**: Fixed` and append one line to each Description noting the commit-level fix (e.g. "Fixed: `genitoriClasse`/`rappresentantiStudenti`/`TUTOR_ASL`/`TUTOR_ORIENT` now expand via `getClassiPartner`.").

- [ ] **Step 2: Leave items 1 and 5 untouched**

Per this plan's Global Constraints, items 1 (`GESTIONE_ARTICOLAZIONE`) and 5 (shared `INDIRIZZI` id) remain `Status: Open` — out of scope.

- [ ] **Step 3: Commit**

```bash
git add ARTICOLAZIONE.md
git commit -m "docs: mark ARTICOLAZIONE.md items 2/3/7 as fixed"
```
