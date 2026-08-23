# Notifica composizione cattedre (PER_DOCENTE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `destinatario.contesto.materieCompetenza` stub (always `[]`) with real per-docente subject data, add a per-class `cattedre` grouping, and a matching `cattedre` email box, so `PER_DOCENTE` batch emails can show every teacher their own class×subject composition.

**Architecture:** All new logic lives in `BuildCDUStep.buildDestinatario` (the sole owner of the `destinatario` CDU section per `02_CDU_STRUTTURA.md` §5) plus a new registered box in the existing Box Rendering System (`boxes.ts`). No new library extension: `GasLibraryFactory` has no inverse actor→cattedre lookup and none is needed elsewhere, so the composition stays ALDO-domain on top of `ITeachingAssignmentResolver`/`IClasseRepository`, both already available as `EmailNotificationService` dependencies.

**Tech Stack:** TypeScript (GAS V8 target), Jest (`ts-jest`), existing ALDO pipeline/CDU/box-composer infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-22-notifica-composizione-cattedre-design.md`

## Global Constraints

- GAS V8 target: synchronous code only, no Node-only APIs (`CLAUDE.md`).
- No `GasLibraryFactory` extension for this feature — confirmed in the spec's Decisioni table ("Library-first: ... Nessuna estensione libreria").
- `destinatario` section is populated exclusively by `BuildCDUStep` (`02_CDU_STRUTTURA.md` §5) — no interceptor/provider may touch it.
- Materie dedup precedence is MAIN > ITP on the flat list, matching the legacy rule already implemented in `ClasseRepository.getMaterieDelDocente` (`src/infrastructure/repositories/ClasseRepository.ts:399-420`).
- Only `tipo === 'docente'` targets get non-empty `materieCompetenza`/`cattedre`; all other target types keep `[]` (unchanged behavior).
- IRC/ALT stay excluded by default (`resolveConsiglio`'s default `includeReligioneAlt: false`).
- Never edit `dist/*`; never touch native GAS globals outside `GoogleApiWrapper`.

---

### Task 1: Compute `materieCompetenza`/`cattedre` in `BuildCDUStep`

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:397-413` (`CduDestinatario`, add `CattedraVM`)
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts:215-234` (export `materiaVmFromSlot`)
- Modify: `src/application/pipelines/emailSteps.ts:1-32,109-209` (`BuildCDUStep`)
- Modify: `src/application/services/EmailNotificationService.ts:311` (wiring)
- Modify: `test/unit/application/pipelines/email-steps.test.ts` (wiring + new tests)
- Test: `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.findById(id: ClasseId): Classe | null` (`src/domain/repositories/IClasseRepository.ts:24`); `ITeachingAssignmentResolver.resolveConsiglio(classe: Classe, data: Date, options?): TeachingAssignment[]` (`src/application/ports/ITeachingAssignmentResolver.ts:38-45`); `TeachingAssignment { slot: { materia: MateriaId; kind: TeachingSlotKind; specifica: string | null }, docenteEffettivo: Docente, ... }` (same file, `:15-28`); `buildSubjectVm`/`SubjectVM` (`src/application/context-engine/mappers/subjectVmMapper.ts`); `materiaVmFromSlot(materie: IMateriaRepository, classe: Classe, slot: { materia: string; kind: string; specifica: string | null }): SubjectVM | null` (after export, `src/application/context-engine/TeachingCouncilProjection.ts:215`).
- Produces: `CduDestinatario.contesto.materieCompetenza: SubjectVM[]` and `CduDestinatario.contesto.cattedre: CattedraVM[]`, consumed by Task 2's `cattedre` box and by any template/expression reading `destinatario.contesto.*`.

- [ ] **Step 1: Write the failing types + resolver-export change**

In `src/application/context-engine/Cdu.ts`, replace the `CduDestinatario` interface (currently at lines 397-413) with:

```typescript
export interface CattedraVM {
  classeId: string;
  classeNome: string;
  anno: number;
  sezione: string;
  materie: SubjectVM[];
}

export interface CduDestinatario {
  anagrafica: PersonVM;
  ruoliAttivi: string[];
  flags: {
    isCoordinatore: boolean;
    isTutor: boolean;
    isTutorAsl: boolean;
    isDocenteSostegno: boolean;
    isSupplente: boolean;
  };
  contesto: {
    sostituisce: PersonVM | null;
    classiCompetenza: string[];
    materieCompetenza: SubjectVM[];
    cattedre: CattedraVM[];
  };
  comunicazione: { salutoIniziale: string; oggettoCalcolato: string; testoContenutoPuro: string };
}
```

In `src/application/context-engine/TeachingCouncilProjection.ts`, change the `materiaVmFromSlot` declaration at line 215 from `function materiaVmFromSlot(` to `export function materiaVmFromSlot(` (no other change — the body at lines 215-234 stays as-is).

- [ ] **Step 2: Run typecheck to see it fail**

Run: `npm run typecheck`
Expected: FAIL — `emailSteps.ts` still assigns `materieCompetenza: []` (now typed `SubjectVM[]`, `[]` is still valid so this alone won't fail) but the missing `cattedre` field on the object literal returned by `buildDestinatario` WILL fail with "Property 'cattedre' is missing in type ... but required in type 'CduDestinatario['contesto']'".

- [ ] **Step 3: Write the failing unit tests**

Add to `test/unit/application/pipelines/email-steps.test.ts`, after the existing `test('BuildCDUStep copies EmailTarget.classiCompetenza into BuildParams', ...)` block (around line 520):

```typescript
test('BuildCDUStep computes cattedre + materieCompetenza across multiple classes for a docente target (design 2026-08-22)', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['5A', '1F']
    }
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const contesto = cdu.destinatario!.contesto;
  expect(contesto.cattedre.map((c) => c.classeId)).toEqual(['5A', '1F']);
  expect(contesto.cattedre[0]!.materie.map((m) => m.sigla)).toEqual(['MATE']);
  expect(contesto.cattedre[0]!.anno).toBe(5);
  expect(contesto.cattedre[0]!.sezione).toBe('A');
  // rossi teaches MATE in both 5A and 1F: flat list dedupes to one entry.
  expect(contesto.materieCompetenza.map((m) => m.sigla)).toEqual(['MATE']);
});

test('BuildCDUStep excludes a class from cattedre when the docente has no effective materia there, email still buildable (design 2026-08-22)', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'verdi@school.it',
      emails: ['verdi@school.it'],
      classiCompetenza: ['5A']
    }
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const contesto = cdu.destinatario!.contesto;
  expect(contesto.cattedre).toEqual([]);
  expect(contesto.materieCompetenza).toEqual([]);
  expect(cdu.destinatario!.anagrafica.email).toBe('verdi@school.it');
});

test('BuildCDUStep only computes cattedre for docente-type targets, not genitori/alunno (design 2026-08-22)', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.destinatario!.contesto.cattedre).toEqual([]);
  expect(cdu.destinatario!.contesto.materieCompetenza).toEqual([]);
});

test('BuildCDUStep dedupes MAIN over ITP on the flat materieCompetenza list (legacy precedence, design 2026-08-22)', () => {
  const tables = fixtureTables();
  (tables['CLASSI'] as Row[]).push({
    ID: '2C',
    ANNO: 2,
    INDIRIZZO: 'SCIENTIFICO',
    ARTICOLAZIONE: null,
    RUOLI: null,
    ATTIVA: true,
    COORD: '',
    MATE: 'rossi@school.it',
    'MATE.itp': 'rossi@school.it'
  });
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '2C',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['2C']
    },
    tables
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const materie = cdu.destinatario!.contesto.cattedre[0]!.materie;
  expect(materie).toHaveLength(1);
  expect(materie[0]!.sigla).toBe('MATE');
  expect(materie[0]!.isITP).toBe(false);
});

test('BuildCDUStep supplenza ENTRAMBI: the resolved supplente sees the covered materia, the titolare does not (design 2026-08-22)', () => {
  const supplenteTarget: EmailTarget = {
    ...docente4BTarget(),
    docenteEmail: 'bianchi@school.it',
    titolareEmail: 'rossi@school.it'
  };
  const wSupplente = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' },
    supplenteTarget,
    tablesWith4B()
  );
  buildStep(wSupplente).execute(wSupplente.ctx);
  const supplenteCdu = wSupplente.ctx.get<Cdu>('cdu')!;
  expect(supplenteCdu.destinatario!.contesto.materieCompetenza.map((m) => m.sigla)).toContain(
    'MATE'
  );

  const wTitolare = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' },
    docente4BTarget(),
    tablesWith4B()
  );
  buildStep(wTitolare).execute(wTitolare.ctx);
  const titolareCdu = wTitolare.ctx.get<Cdu>('cdu')!;
  expect(titolareCdu.destinatario!.contesto.cattedre).toEqual([]);
});
```

Also update every direct `new BuildCDUStep(...)` call in this file (the constructor gains three trailing parameters — see Step 5) and the shared `buildStep` helper:

```typescript
function buildStep(w: Wiring): BuildCDUStep {
  return new BuildCDUStep(
    logger,
    composeContextBuilder(w.db),
    w.docenti,
    w.alunni,
    new ClasseRepository(w.db),
    new MateriaRepository(w.db),
    new AldoTeachingAssignmentResolver(w.db)
  );
}
```

Line ~518 (`'BuildCDUStep copies EmailTarget.classiCompetenza into BuildParams'` test):

```typescript
new BuildCDUStep(
  logger,
  spyBuilder,
  w.docenti,
  w.alunni,
  new ClasseRepository(w.db),
  new MateriaRepository(w.db),
  new AldoTeachingAssignmentResolver(w.db)
).execute(w.ctx);
```

Line ~1540 (`'BuildCDUStep omits idConfigurazione...'` test):

```typescript
new BuildCDUStep(
  logger,
  builder,
  w.docenti,
  w.alunni,
  new ClasseRepository(w.db),
  new MateriaRepository(w.db),
  new AldoTeachingAssignmentResolver(w.db)
).execute(w.ctx);
```

Line ~1548 (`'BuildCDUStep falls back to "" for docente.id...'` test):

```typescript
new BuildCDUStep(
  logger,
  composeContextBuilder(w.db),
  docentiStub,
  w.alunni,
  new ClasseRepository(w.db),
  new MateriaRepository(w.db),
  new AldoTeachingAssignmentResolver(w.db)
).execute(w.ctx);
```

Line ~1567 (`'BuildCDUStep falls back to "" for alunno.id...'` test):

```typescript
new BuildCDUStep(
  logger,
  composeContextBuilder(w.db),
  w.docenti,
  alunniStub,
  new ClasseRepository(w.db),
  new MateriaRepository(w.db),
  new AldoTeachingAssignmentResolver(w.db)
).execute(w.ctx);
```

Line ~1915 (`ctxAfterCondizioni` inside `describe('CheckAlreadySentStep', ...)`):

```typescript
new BuildCDUStep(
  logger,
  composeContextBuilder(db, new MasterSheetRepository(db), new AldoTeachingAssignmentResolver(db)),
  docenti,
  alunni,
  new ClasseRepository(db),
  new MateriaRepository(db),
  new AldoTeachingAssignmentResolver(db)
).execute(ctx);
```

- [ ] **Step 4: Run tests to confirm they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "cattedre"`
Expected: FAIL — `BuildCDUStep` constructor doesn't accept the new arguments yet (TS compile error surfaces as a Jest failure), and `contesto.cattedre` doesn't exist.

- [ ] **Step 5: Implement `BuildCDUStep` cattedre computation**

In `src/application/pipelines/emailSteps.ts`:

Add imports (extend the existing import blocks, don't duplicate):

```typescript
import type { Cdu, CduDestinatario, CattedraVM } from '../context-engine/Cdu';
import type { SubjectVM } from '../context-engine/mappers/subjectVmMapper';
```

and extend the existing `TeachingCouncilProjection` import (currently `import { resolveEffectiveDocenti } from '../context-engine/TeachingCouncilProjection';` at line 32):

```typescript
import {
  resolveEffectiveDocenti,
  materiaVmFromSlot
} from '../context-engine/TeachingCouncilProjection';
```

`IClasseRepository`, `ITeachingAssignmentResolver`, `IMateriaRepository`, and `ClasseId` are already imported in this file (lines 14-16, 30) — no new import needed for those.

Add a module-level helper near the top of the file (after `salutoPerTarget`/`createBoxComposer` imports, before `BuildCDUStep`):

```typescript
/** MAIN precedes ITP for the same sigla, matching ClasseRepository.getMaterieDelDocente's legacy precedence rule. */
function dedupeSubjectsMainOverItp(vms: SubjectVM[]): SubjectVM[] {
  const bySigla = new Map<string, SubjectVM>();
  for (const vm of vms) {
    const existing = bySigla.get(vm.sigla);
    if (existing === undefined || (existing.isITP && !vm.isITP)) bySigla.set(vm.sigla, vm);
  }
  return [...bySigla.values()];
}
```

Change the `BuildCDUStep` constructor (lines 109-117) to:

```typescript
export class BuildCDUStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly contextBuilder: ContextBuilder,
    private readonly docenti: IDocenteRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly classi: IClasseRepository,
    private readonly materie: IMateriaRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {
    super('BuildCDU', logger, { requiredKeys: ['config', 'confMail', 'emailTarget', 'now'] });
  }
```

Change `_executeLogic` (lines 119-141) to pass `now(ctx)` into `buildDestinatario`:

```typescript
  protected _executeLogic(ctx: PipelineContext): void {
    const conf = confMail(ctx);
    const t = target(ctx);
    const params: BuildParams = {
      target: t.target,
      tipoTarget: t.tipoTarget,
      now: now(ctx),
      tipoOperazione: 'INVIO_EMAIL'
    };
    if (conf.id !== null) params.idConfigurazione = conf.id;
    if (t.carenzaProgressivo !== undefined) params.carenzaProgressivo = t.carenzaProgressivo;
    if (t.classiCompetenza.length > 0) params.classiCompetenza = t.classiCompetenza;

    const built = this.contextBuilder.build(
      params,
      recipe(RECIPE_PER_PROCESSO[conf.processo], {
        gestioneSupplenti: conf.supplenti,
        ...storicoOptionsFor(conf)
      })
    );
    built.destinatario = this.buildDestinatario(conf, t, now(ctx));
    this.setResult(ctx, 'cdu', built);
  }
```

Replace `buildDestinatario` (lines 159-209) to compute the two real fields instead of the stub, and extract a `buildCattedre` helper:

```typescript
  private buildDestinatario(conf: ConfigurazioneEmail, t: EmailTarget, when: Date): CduDestinatario {
    const docente = t.docenteEmail !== undefined ? this.docenti.findById(t.docenteEmail) : null;
    const titolare = t.titolareEmail !== undefined ? this.docenti.findById(t.titolareEmail) : null;
    const alunno = t.tipoTarget === 'alunno' ? this.alunni.findById(t.target) : null;
    const anagrafica =
      docente !== null
        ? buildPersonVm({
            nome: docente.nome,
            cognome: docente.cognome,
            email: docente.id ?? '',
            genere: docente.genere
          })
        : t.tipo === 'alunno' && alunno !== null
          ? buildPersonVm({ nome: alunno.cognomeNome, cognome: null, email: alunno.id ?? '', genere: null })
          : buildPersonVm({ nome: '', cognome: null, email: t.emails[0] ?? '', genere: null });

    const classiCompetenza =
      t.classiCompetenza.length > 0
        ? t.classiCompetenza
        : t.tipoTarget === 'classe'
          ? [t.target]
          : [];
    const { cattedre, materieCompetenza } = this.buildCattedre(t, classiCompetenza, when);

    return {
      anagrafica,
      ruoliAttivi: [],
      flags: {
        isCoordinatore: conf.processo === ProcessoInvio.PER_COORDINATORE,
        isTutor: false,
        isTutorAsl: false,
        isDocenteSostegno: false,
        isSupplente: false
      },
      contesto: {
        sostituisce:
          titolare !== null
            ? buildPersonVm({
                nome: titolare.nome,
                cognome: titolare.cognome,
                email: titolare.id ?? '',
                genere: titolare.genere
              })
            : null,
        classiCompetenza,
        materieCompetenza,
        cattedre
      },
      comunicazione: {
        salutoIniziale: salutoPerTarget(t, docente, alunno),
        oggettoCalcolato: '',
        testoContenutoPuro: ''
      }
    };
  }

  /**
   * Per-classe cattedra composition for a docente target (design
   * 2026-08-22): materie effettive alla data di invio, stesso resolver dei
   * target (SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI), IRC/ALT esclusi di
   * default. Classi senza materie effettive del destinatario sono escluse.
   */
  private buildCattedre(
    t: EmailTarget,
    classiCompetenza: string[],
    when: Date
  ): { cattedre: CattedraVM[]; materieCompetenza: SubjectVM[] } {
    if (t.tipo !== 'docente' || t.docenteEmail === undefined) {
      return { cattedre: [], materieCompetenza: [] };
    }
    const docenteEmail = t.docenteEmail;
    const cattedre: CattedraVM[] = [];
    let flat: SubjectVM[] = [];
    for (const classeId of classiCompetenza) {
      const classe = this.classi.findById(ClasseId.of(classeId));
      if (classe === null) continue;
      const mie = this.teachingAssignments
        .resolveConsiglio(classe, when)
        .filter((a) => a.docenteEffettivo.id === docenteEmail);
      const materie = dedupeSubjectsMainOverItp(
        mie
          .map((a) =>
            materiaVmFromSlot(this.materie, classe, {
              materia: a.slot.materia.value,
              kind: a.slot.kind,
              specifica: a.slot.specifica
            })
          )
          .filter((vm): vm is SubjectVM => vm !== null)
      );
      if (materie.length === 0) continue;
      cattedre.push({
        classeId: classe.id ?? classeId,
        classeNome: classe.nome,
        anno: classe.anno.value,
        sezione: classe.nome.replace(/^\d+/, ''),
        materie
      });
      flat = flat.concat(materie);
    }
    return { cattedre, materieCompetenza: dedupeSubjectsMainOverItp(flat) };
  }
}
```

- [ ] **Step 6: Wire the two new constructor deps in `EmailNotificationService`**

In `src/application/services/EmailNotificationService.ts`, change line 311 from:

```typescript
      .addStep(new BuildCDUStep(this.logger, d.contextBuilder, d.docenti, d.alunni))
```

to:

```typescript
      .addStep(
        new BuildCDUStep(this.logger, d.contextBuilder, d.docenti, d.alunni, d.classi, d.materie, d.teachingAssignments)
      )
```

(`d.classi`, `d.materie`, `d.teachingAssignments` are already declared on `EmailNotificationDeps` at lines 65, 71, 74 — no dependency-injection changes needed elsewhere, `Bootstrap.ts` already supplies them for this service.)

- [ ] **Step 7: Run tests to confirm they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (full file — this also validates the six updated `new BuildCDUStep(...)` call sites elsewhere in the file compile and still pass their original assertions).

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/TeachingCouncilProjection.ts src/application/pipelines/emailSteps.ts src/application/services/EmailNotificationService.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "feat: compute destinatario.contesto.materieCompetenza/cattedre for PER_DOCENTE targets"
```

---

### Task 2: `cattedre` email box

**Files:**

- Modify: `src/application/email/boxes.ts`
- Test: `test/unit/application/email-boxes.test.ts`

**Interfaces:**

- Consumes: `CattedraVM[]` at `destinatario.contesto.cattedre` (produced by Task 1); `escapeHtml`, `wrapUl`, `DEFAULT_TITLES`, `simple(...)` registration helper, all already defined in `boxes.ts`.
- Produces: box id `'cattedre'` in the `createBoxComposer` registry and `DEFAULT_TITLES`, renderable via `CONF_MAIL.BOX_CFG` rows with `TIPO_BOX: 'cattedre'`.

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/application/email-boxes.test.ts`, after the `'note + assenze boxes read focus.carenza (11 §11)'` test (around line 293):

```typescript
function cattedraVm(overrides: Partial<{ nome: string; sigla: string; isITP: boolean }> = {}) {
  return {
    sigla: overrides.sigla ?? 'MATE',
    nome: overrides.nome ?? 'Matematica',
    nomeSintetico: 'Matematica',
    colore1: '#c0392b',
    colore2: '#fdecea',
    isMateriaPrimaProva: false,
    isMateriaSecondaProva: false,
    principale: null,
    specificita: null,
    isITP: overrides.isITP ?? false,
    evoluzione: null
  };
}

test('cattedre box renders one row per classe with its materie (design 2026-08-22)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord() as Record<string, unknown>;
  cdu['destinatario'] = {
    contesto: {
      cattedre: [
        {
          classeId: '5A',
          classeNome: '5A',
          anno: 5,
          sezione: 'A',
          materie: [
            cattedraVm({ nome: 'Matematica' }),
            cattedraVm({ nome: 'Fisica', sigla: 'FISI', isITP: true })
          ]
        }
      ]
    }
  };
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'cattedre' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['cattedre']!.visibile).toBe(true);
  expect(out.boxes['cattedre']!.html).toContain('5A');
  expect(out.boxes['cattedre']!.html).toContain('Matematica');
  expect(out.boxes['cattedre']!.html).toContain('Fisica');
});

test('cattedre box is hidden when destinatario.contesto.cattedre is absent/empty (design 2026-08-22)', () => {
  const out = render([{ TIPO_BOX: 'cattedre' }]);
  expect(out.boxes['cattedre']!.visibile).toBe(false);
  expect(out.boxes['cattedre']!.html).toBe('');
});

test('cattedre box HTML-escapes a hostile materia nome (design 2026-08-22)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord() as Record<string, unknown>;
  cdu['destinatario'] = {
    contesto: {
      cattedre: [
        {
          classeId: '5A',
          classeNome: '5A',
          anno: 5,
          sezione: 'A',
          materie: [cattedraVm({ nome: '<script>alert(1)</script>' })]
        }
      ]
    }
  };
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'cattedre' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['cattedre']!.html).not.toContain('<script>');
  expect(out.boxes['cattedre']!.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts -t "cattedre"`
Expected: FAIL — `TIPO_BOX: 'cattedre'` is unknown (`known` filter in `renderBoxes` drops it since `'cattedre'` isn't in `DEFAULT_TITLES`), so `out.boxes['cattedre']` is `undefined` and every assertion throws.

- [ ] **Step 3: Register the `cattedre` box**

In `src/application/email/boxes.ts`, add a renderer function after `renderAssenzeBox` (currently ending at line 294):

```typescript
interface CattedraBoxRow {
  classeId: string;
  classeNome: string;
  materie: Array<{ nome: string; isITP: boolean }>;
}

function renderCattedreBox(data: unknown): string {
  const cattedre = data as CattedraBoxRow[];
  const righe = cattedre
    .map((c) => {
      const materie = c.materie
        .map(
          (m) =>
            `${escapeHtml(m.nome)}${m.isITP ? ' <span style="font-size:11px;color:#888;">(ITP)</span>' : ''}`
        )
        .join(', ');
      return `<li><strong>${escapeHtml(c.classeNome)}</strong> — ${materie}</li>`;
    })
    .join('');
  return wrapUl(righe);
}
```

In `createBoxComposer` (lines 301-410), add a new `simple(...)` registration right after the `assenze` block (currently lines 366-371):

```typescript
simple(
  'cattedre',
  'Cattedre',
  (ctx) => ctx.get('destinatario.contesto.cattedre', []),
  (d) => (d as unknown[]).length === 0
);
```

In the `HtmlRenderer` templates map inside `createBoxComposer` (lines 390-406), add:

```typescript
        cattedre: (data) => renderCattedreBox(data),
```

(alongside the existing `note: (data) => renderNoteBox(data),` line).

In `DEFAULT_TITLES` (lines 413-423), add:

```typescript
  cattedre: 'Le tue cattedre',
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: PASS (full file).

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "feat: add the cattedre email box (Le tue cattedre)"
```

---

### Task 3: Update `SPECS_ALDO` docs

**Files:**

- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md:506-532,1484-1510`
- Modify: `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md:458-463`

**Interfaces:**

- Consumes: nothing (documentation-only, no code dependency).
- Produces: nothing consumed by other tasks; this task only keeps the spec truthful per `CLAUDE.md`'s sources-of-truth rule.

- [ ] **Step 1: Update `02_CDU_STRUTTURA.md` §5 narrative and stub note**

Replace the paragraph at line 508 (the `> **STUB NON IMPLEMENTATO:** ...` blockquote) with:

```markdown
`destinatario.contesto.materieCompetenza` e `destinatario.contesto.cattedre` sono calcolati esclusivamente per i target `tipo === 'docente'` (per gli altri target restano `[]`), a partire dalle materie effettive alla data di invio via `ITeachingAssignmentResolver.resolveConsiglio` (stesso resolver usato per il targeting) — IRC/ALT esclusi di default. `materieCompetenza` è la lista piatta deduplicata su tutte le classi (precedenza MAIN > ITP, stessa regola legacy di `ClasseRepository.getMaterieDelDocente`); `cattedre` raggruppa le stesse materie per classe. `ruoliAttivi`, `flags.isTutor`, `flags.isTutorAsl`, `flags.isDocenteSostegno`, `flags.isSupplente` restano STUB (`[]`/`false`), non ancora calcolati. Solo `flags.isCoordinatore` (derivato da `conf.processo === ProcessoInvio.PER_COORDINATORE`) e `contesto.classiCompetenza` erano già genuinamente calcolati.
```

- [ ] **Step 2: Update the `destinatario` YAML block**

Replace lines 510-532 with:

```yaml
destinatario:
  anagrafica: PersonVM # Dati anagrafici standardizzati (§8.1) del destinatario

  ruoliAttivi: string[] # STUB: sempre [] — non ancora calcolato

  flags:
    isCoordinatore: boolean # Genuinamente calcolato: true se conf.processo === PER_COORDINATORE
    isTutor: boolean # STUB: sempre false — non ancora calcolato
    isTutorAsl: boolean # STUB: sempre false — non ancora calcolato
    isDocenteSostegno: boolean # STUB: sempre false — non ancora calcolato
    isSupplente: boolean # STUB: sempre false — non ancora calcolato

  contesto:
    sostituisce: PersonVM | null # STUB: sempre null — non ancora calcolato (non collegato a isSupplente)
    classiCompetenza: string[] # Genuinamente calcolato: ClasseId su cui il destinatario ha titolarità
    materieCompetenza: SubjectVM[] # Solo target docente: materie effettive deduplicate su tutte le classi (§8.2)
    cattedre: CattedraVM[] # Solo target docente: le stesse materie raggruppate per classe

  comunicazione:
    salutoIniziale: string # es. "Gentile Prof.ssa Bianchi," o "Spettabile Genitore,"
    oggettoCalcolato: string # Oggetto email finale processato tramite template engine
    testoContenutoPuro: string # Testo plain-text senza wrapper HTML (per audit log)

CattedraVM:
  classeId: string # "5AB-LC-LS"
  classeNome: string # nome completo della classe
  anno: number
  sezione: string
  materie: SubjectVM[] # SubjectVM completi (§8.2): sigla, nome, nomeSintetico, colore1/colore2, specificita, isITP, flag esami
```

- [ ] **Step 3: Update the worked JSON example**

Replace line 1506:

```
    "contesto": { "sostituisce": null, "classiCompetenza": ["5AB-LC-LS"], "materieCompetenza": [] },
```

with:

```
    "contesto": {
      "sostituisce": null,
      "classiCompetenza": ["5AB-LC-LS"],
      "materieCompetenza": [
        { "sigla": "MATE", "nome": "Matematica", "nomeSintetico": "Matematica", "colore1": "#c0392b", "colore2": "#fdecea", "isMateriaPrimaProva": false, "isMateriaSecondaProva": false, "principale": null, "specificita": null, "isITP": false, "evoluzione": null }
      ],
      "cattedre": [
        {
          "classeId": "5AB-LC-LS",
          "classeNome": "5AB-LC-LS",
          "anno": 5,
          "sezione": "AB-LC-LS",
          "materie": [
            { "sigla": "MATE", "nome": "Matematica", "nomeSintetico": "Matematica", "colore1": "#c0392b", "colore2": "#fdecea", "isMateriaPrimaProva": false, "isMateriaSecondaProva": false, "principale": null, "specificita": null, "isITP": false, "evoluzione": null }
          ]
        }
      ]
    },
```

- [ ] **Step 4: Update `GUIDA_USO_PLACEHOLDER.md`'s loop example**

Replace lines 458-463:

```html
<p>Materie di Tua competenza per questa classe:</p>
<ul>
  {{#destinatario.contesto.materieCompetenza}}
  <li>{{.}}</li>
  {{/destinatario.contesto.materieCompetenza}}
</ul>
```

with:

```html
<p>Le tue cattedre:</p>
<ul>
  {{#destinatario.contesto.cattedre}}
  <li><strong>{{classeNome}}</strong> — {{#materie}}{{nome}}{{^last}}, {{/last}}{{/materie}}</li>
  {{/destinatario.contesto.cattedre}}
</ul>

<p>
  Oppure, per la lista piatta deduplicata su tutte le classi, usa il box standard
  <code>cattedre</code> (BOX_CFG <code>{"TIPO_BOX":"cattedre"}</code>, titolo default "Le tue
  cattedre") oppure itera direttamente <code>destinatario.contesto.materieCompetenza</code>:
</p>
<ul>
  {{#destinatario.contesto.materieCompetenza}}
  <li>{{nome}}</li>
  {{/destinatario.contesto.materieCompetenza}}
</ul>
```

- [ ] **Step 5: Commit**

```bash
git add SPECS_ALDO/02_CDU_STRUTTURA.md SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md
git commit -m "docs: document destinatario.contesto.materieCompetenza/cattedre (no longer a stub)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 CDU enrichment → Task 1 Steps 1/5. §2 calcolo rules (solo docente, effettivo alla data, dedup MAIN>ITP, IRC/ALT esclusi, classe senza materie esclusa, ordine) → Task 1 Step 5 + tests in Step 3. §3 box `cattedre` → Task 2. §4 uso operativo → no code needed (CONF_MAIL row is pure data, already supported by the existing box/testo_dinamico machinery); documented in Task 3 Step 4. §5 errori (EntityNotFoundError invariato, docente non trovato fallback invariato) → no new code path, `buildCattedre` skips unresolvable classes without throwing, consistent with existing `anagrafica` fallback. §6 testing → covered by Task 1 Step 3 and Task 2 Step 1 (all six bullets from the spec's Testing section have a corresponding test). §7 aggiornamenti spec → Task 3.
- **Placeholder scan:** no TBD/TODO, every step has literal code.
- **Type consistency:** `CattedraVM`/`SubjectVM` field names match across `Cdu.ts`, `emailSteps.ts`, `boxes.ts`, and both test files (`sigla`, `nome`, `isITP`, `classeId`, `classeNome`, `anno`, `sezione`, `materie`).
