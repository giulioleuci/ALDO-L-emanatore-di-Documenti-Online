# DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA + ARTICOLAZIONE.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA` online e2e scenario (4 bulleted lists over class 3C) and a companion `ARTICOLAZIONE.md` report, fixing two latent CDU-provider bugs (rappresentanti/coordinatori not expanding across an articulated group) along the way.

**Architecture:** Additive-only CDU/provider changes (new optional fields, new derived arrays), reusing the existing `DOCUMENTO_GENERICO` generator strategy and flat `bullet_list` templating — no new generator class, no template-side filtering/pipe-chaining risk. See `docs/superpowers/specs/2026-07-30-classe-articolata-report-design.md` for the full design rationale.

**Tech Stack:** TypeScript, Jest (`ts-jest`), GAS V8 target, `GasLibraryFactory` libraries (WorkspaceTemplateEngine, PipelineFramework), Google Apps Script online e2e harness.

## Global Constraints

- Target is GAS V8: synchronous code only, no Node-specific APIs.
- Never touch native GAS globals outside `GoogleApiWrapper` — not relevant to this plan (no new facade code).
- All CDU/provider changes must be additive: existing consumers (`VERBALE_PARAGRAPHS`, `RIEPILOGO_PARAGRAPHS`, non-articulated classes) must see byte-identical behavior. Every new field is either optional (`?`) and only populated for articulated-parent classes, or required-but-always-computed (no consumer currently reads it, so no compatibility risk).
- No new `GeneratorStrategy` class — reuse `DOCUMENTO_GENERICO` (`DocumentoGenericoGeneratorStrategy`), per `ConfigurazioneDocumento.ts:26-30` / `DocumentGenerationService.ts:96` precedent.
- Run `npm run typecheck && npm run lint && npm test` after every task; run `npm run test:integration` and `npm run build:online` before the final task.
- Follow TDD: write the failing test first, watch it fail for the right reason, then implement.

---

### Task 1: `AlunnoContestoVM` gains a per-student `indirizzo` (major)

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:34-48` (`AlunnoContestoVM`)
- Modify: `src/application/context-engine/providers/StudentiProvider.ts`
- Test: `test/unit/application/context-engine/studenti-provider.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.getIndirizzo(classe: Classe): Indirizzo` (already exists, returns `{ nome, nomeSintetico, tipo, ... }`); `Classe.indirizzo: string` (the sigla).
- Produces: `AlunnoContestoVM.indirizzo: { sigla: string; nome: string; nomeSintetico: string }` — every `AlunnoContestoVM` instance now carries this (both the plain-class branch and the articulated-parent branch, tagged with the _owning partner's_ indirizzo, not the parent's).

- [ ] **Step 1: Write the failing tests**

Edit `test/unit/application/context-engine/studenti-provider.test.ts`. First, update the existing full-VM equality test (it does exact `.toEqual`, so it must include the new field) — find the test `'StudentiProvider: full alunno-in-context VM (status/curriculum/didattica)'` (currently lines 56-80) and insert `indirizzo` into the expected object, right after `curriculum`:

```typescript
    curriculum: { INTERP: { specifiche: ['CHITARRA', 'PIANO'] } },
    indirizzo: { sigla: 'SCIENTIFICO', nome: 'Liceo scientifico', nomeSintetico: 'Scientifico' },
    didattica: {
```

Then add a new test after `'StudentiProvider: articulated parent aggregates + groups by indirizzo (09 §10)'` (currently ending at line 135):

```typescript
test('StudentiProvider: each articulated-parent student is tagged with their OWN partner indirizzo (09 §10)', () => {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]).push(
    {
      EMAIL: 's1@school.it',
      COGNOMENOME: 'ALFA UNO',
      CLASSE: '1F-LSO',
      RELIGIONE: 'SI',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: false,
      CURRICULUM: null
    },
    {
      EMAIL: 's2@school.it',
      COGNOMENOME: 'BETA DUE',
      CLASSE: '1F-LSS',
      RELIGIONE: 'SI',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: false,
      CURRICULUM: null
    }
  );
  const s = build('1F', tables).focus.classe!.studenti!;
  const s1 = s.listaCompleta.find((a) => a.anagrafica.email === 's1@school.it')!;
  const s2 = s.listaCompleta.find((a) => a.anagrafica.email === 's2@school.it')!;
  expect(s1.indirizzo).toEqual({
    sigla: 'SCIENTIFICO',
    nome: 'Liceo scientifico',
    nomeSintetico: 'Scientifico'
  });
  expect(s2.indirizzo).toEqual({
    sigla: 'LSSA',
    nome: 'Liceo scientifico scienze applicate',
    nomeSintetico: 'Scienze applicate'
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/studenti-provider.test.ts`
Expected: FAIL — `indirizzo` is `undefined` on the actual VM objects (property missing / equality mismatch).

- [ ] **Step 3: Add `indirizzo` to `AlunnoContestoVM`**

In `src/application/context-engine/Cdu.ts`, edit the interface at lines 34-48:

```typescript
export interface AlunnoContestoVM {
  anagrafica: { nomeCompleto: string; email: string };
  genitori: Array<{ email: string }>;
  status: { isBes: boolean; isRipetente: boolean; isRappresentante: boolean; religione: string };
  curriculum: Record<string, { specifiche: string[] }>;
  indirizzo: { sigla: string; nome: string; nomeSintetico: string };
  didattica: {
    carenze: {
      hasCarenze: boolean;
      numero: number;
      dettaglio: Array<{ materia: string; voto: string }>;
    };
    piani: { hasPiani: boolean; hasBes: boolean; items: Array<{ tipo: string; isBes: boolean }> };
    pcto: { oreCumulate: number };
  };
}
```

- [ ] **Step 4: Populate it in `StudentiProvider`**

In `src/application/context-engine/providers/StudentiProvider.ts`, add the `Classe` import:

```typescript
import type { Classe } from '../../../domain/entities/Classe';
```

Then replace the body of `provide` and `buildVM`:

```typescript
  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() === true) {
      const perIndirizzo: Record<string, AlunnoContestoVM[]> = {};
      const indirizziPresenti: string[] = [];
      const listaCompleta: AlunnoContestoVM[] = [];
      for (const partner of this.classi.getClassiPartner(classe)) {
        const vms = this.classi
          .getStudenti(partner)
          .filter((alunno) => alunno.isAttivo())
          .map((alunno) => this.buildVM(alunno, partner));
        const sigla = partner.indirizzo;
        if (!(sigla in perIndirizzo)) {
          perIndirizzo[sigla] = [];
          indirizziPresenti.push(sigla);
        }
        perIndirizzo[sigla]!.push(...vms);
        listaCompleta.push(...vms);
      }
      focusClasse.studenti = { listaCompleta, perIndirizzo, indirizziPresenti };
    } else {
      focusClasse.studenti = {
        listaCompleta: this.classi
          .getStudenti(classe)
          .filter((alunno) => alunno.isAttivo())
          .map((alunno) => this.buildVM(alunno, classe))
      };
    }
  }

  private buildVM(alunno: Alunno, classe: Classe): AlunnoContestoVM {
    const indirizzo = this.classi.getIndirizzo(classe);
    const dettaglio = carenzeDettaglioSemplice(
      this.alunni.getCarenze(alunno),
      this.materie.findAllSigle()
    );
    const pianiItems = this.alunni
      .getPiani(alunno)
      .map((p) => ({ tipo: p.tipo, isBes: p.isBES() }));
    const hasBes = pianiItems.some((p) => p.isBes);
    return {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      genitori: alunno.getTutors().map((email) => ({ email: email.value })),
      status: {
        isBes: hasBes,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante(),
        religione: alunno.religione
      },
      curriculum: curriculumRecord(alunno),
      indirizzo: { sigla: classe.indirizzo, nome: indirizzo.nome, nomeSintetico: indirizzo.nomeSintetico },
      didattica: {
        carenze: { hasCarenze: dettaglio.length > 0, numero: dettaglio.length, dettaglio },
        piani: { hasPiani: pianiItems.length > 0, hasBes, items: pianiItems },
        pcto: { oreCumulate: this.alunni.getOreASLTotali(alunno) }
      }
    };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/studenti-provider.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: PASS. (`AlunnoContestoVM.indirizzo` is required, so any other production/test code that constructs a literal `AlunnoContestoVM` without it will fail to typecheck — fix any such call sites by adding the field; based on the codebase search performed while writing this plan, `StudentiProvider.buildVM` is the only production constructor of this VM.)

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/StudentiProvider.ts test/unit/application/context-engine/studenti-provider.test.ts
git commit -m "feat(cdu): tag each articulated-class student with their own major (indirizzo)"
```

---

### Task 2: `RappresentantiProvider` expands across the articulated group

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:140-143` (`CduClasse.rappresentanti`)
- Modify: `src/application/context-engine/providers/RappresentantiProvider.ts`
- Test: `test/unit/application/context-engine/classe-provider.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.getArticolazione(classe).isParent()`, `getClassiPartner(classe): Classe[]`, `getIndirizzo(classe): Indirizzo`, `getStudenti(classe): Alunno[]`, `Alunno.isRappresentante()`, `Alunno.getRappresentanteGenitore(): string`, `Alunno.cognomeNome`, `Alunno.email.value`.
- Produces: `CduClasse.rappresentanti.studenti: Array<{ nomeCompleto, email, indirizzo?: { nome } }>`, `.genitori: Array<{ nomeCompleto, indirizzo?: { nome } }>`. `indirizzo` is present only when the focus class is an articulated parent (undefined otherwise — unchanged behavior for every non-articulated document already relying on this shape).

**Bug fixed:** today `RappresentantiProvider` reads `classi.getStudenti(classe)` directly; for an articulated parent (e.g. `3C`) no student's `CLASSE` column ever equals the parent's own id, so `rappresentanti` is silently empty for _any_ document targeting the parent class.

- [ ] **Step 1: Write the failing test**

Edit `test/unit/application/context-engine/classe-provider.test.ts`. First, change the `build` helper (currently lines 11-28) to accept an optional `tables` override, matching the pattern already used in `studenti-provider.test.ts`:

```typescript
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(target: string, tables = fixtureTables()) {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('tutor', new TutorProvider(classi));
  b.registerProvider('rappresentanti', new RappresentantiProvider(classi));
  const params: BuildParams = {
    target,
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = {
    providers: ['class', 'tutor', 'rappresentanti'],
    options: makeOptions()
  };
  return b.build(params, recipe);
}
```

Then add a new test after `'RappresentantiProvider: student reps with email, no parent reps in fixtures (02 §4.1)'`:

```typescript
test('RappresentantiProvider: articulated parent merges reps across partners, tagged by indirizzo (09 §10)', () => {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]).push(
    {
      EMAIL: 'r1@school.it',
      COGNOMENOME: 'UNO REP',
      CLASSE: '1F-LSO',
      RELIGIONE: 'SI',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: true,
      RAPPR_GEN: '',
      CURRICULUM: null
    },
    {
      EMAIL: 'r2@school.it',
      COGNOMENOME: 'DUE REP',
      CLASSE: '1F-LSS',
      RELIGIONE: 'SI',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: true,
      RAPPR_GEN: 'Tre Genitore',
      CURRICULUM: null
    }
  );
  const c = build('1F', tables).focus.classe!;
  expect(c.rappresentanti).toEqual({
    studenti: [
      { nomeCompleto: 'UNO REP', email: 'r1@school.it', indirizzo: { nome: 'Liceo scientifico' } },
      {
        nomeCompleto: 'DUE REP',
        email: 'r2@school.it',
        indirizzo: { nome: 'Liceo scientifico scienze applicate' }
      }
    ],
    genitori: [
      { nomeCompleto: 'Tre Genitore', indirizzo: { nome: 'Liceo scientifico scienze applicate' } }
    ]
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/classe-provider.test.ts -t "articulated parent merges reps"`
Expected: FAIL — `c.rappresentanti` is `{ studenti: [], genitori: [] }` (the parent's own `getStudenti` returns nothing today).

- [ ] **Step 3: Update `CduClasse.rappresentanti`**

In `src/application/context-engine/Cdu.ts`, edit lines 140-143:

```typescript
  rappresentanti?: {
    studenti: Array<{ nomeCompleto: string; email: string; indirizzo?: { nome: string } }>;
    genitori: Array<{ nomeCompleto: string; indirizzo?: { nome: string } }>;
  };
```

- [ ] **Step 4: Rewrite `RappresentantiProvider`**

Replace the full contents of `src/application/context-engine/providers/RappresentantiProvider.ts`:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { getClasseEntity } from '../techEntities';

/**
 * Populates `focus.classe.rappresentanti` (09 §4): student reps carry name+email
 * (ALUNNI.RAPPR_STUD), parent reps only a free-text name (ALUNNI.RAPPR_GEN — no
 * email is available for that role, nor is one foreseen; 02 §4.1). For an
 * articulated parent class, students live under the partner classes, so reps
 * are aggregated across both partners and tagged with the owning partner's
 * indirizzo (09 §10).
 */
export class RappresentantiProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() === true) {
      const studenti: Array<{ nomeCompleto: string; email: string; indirizzo: { nome: string } }> =
        [];
      const genitori: Array<{ nomeCompleto: string; indirizzo: { nome: string } }> = [];
      for (const partner of this.classi.getClassiPartner(classe)) {
        const indirizzo = { nome: this.classi.getIndirizzo(partner).nome };
        for (const alunno of this.classi.getStudenti(partner)) {
          if (alunno.isRappresentante()) {
            studenti.push({
              nomeCompleto: alunno.cognomeNome,
              email: alunno.email.value,
              indirizzo
            });
          }
          const nomeGenitore = alunno.getRappresentanteGenitore().trim();
          if (nomeGenitore.length > 0) {
            genitori.push({ nomeCompleto: nomeGenitore, indirizzo });
          }
        }
      }
      focusClasse.rappresentanti = { studenti, genitori };
      return;
    }

    const studenti = this.classi.getStudenti(classe);
    focusClasse.rappresentanti = {
      studenti: studenti
        .filter((a) => a.isRappresentante())
        .map((a) => ({ nomeCompleto: a.cognomeNome, email: a.email.value })),
      genitori: studenti
        .map((a) => a.getRappresentanteGenitore().trim())
        .filter((nome) => nome.length > 0)
        .map((nome) => ({ nomeCompleto: nome }))
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/classe-provider.test.ts`
Expected: PASS (all tests in the file — the pre-existing `'RappresentantiProvider: student reps with email, no parent reps in fixtures'` test targets non-articulated `'5A'`, so it takes the unchanged branch and still passes byte-for-byte).

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/RappresentantiProvider.ts test/unit/application/context-engine/classe-provider.test.ts
git commit -m "fix(cdu): expand rappresentanti across articulated partners for the parent class"
```

---

### Task 3: `ClasseProvider.coordinatori` expands across the articulated group

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:135` (`CduClasse.coordinatori`)
- Modify: `src/application/context-engine/providers/ClasseProvider.ts`
- Test: `test/unit/application/context-engine/classe-provider.test.ts`

**Interfaces:**

- Consumes: same `IClasseRepository` methods as Task 2, plus `getCoordinatori(classe): Docente[]`, `getMateriaDocente(classe, email): string | null`, `Docente.getNomeCompleto()`, `Docente.getAppellativo()`, `Docente.id`.
- Produces: `CduClasse.coordinatori: Array<{ nome, email, materia, appellativo, indirizzo?: { nome } }>` — `indirizzo` present only for an articulated-parent focus class.

**Bug fixed:** today `coordinatori` is built from `classi.getCoordinatori(classe)` on the focus class alone. For the articulated parent, that reads the parent row's own (normally empty) `COORD` column and misses each partner's distinct coordinator entirely — even though those coordinators are already tracked per-partner elsewhere (email routing, commits `f01e3e6`/`b771f6d`).

- [ ] **Step 1: Write the failing test**

Append to `test/unit/application/context-engine/classe-provider.test.ts` (after the test added in Task 2):

```typescript
test('ClasseProvider: articulated parent merges coordinatori across partners, tagged by indirizzo (09 §10)', () => {
  const tables = fixtureTables();
  const classi = tables['CLASSI'] as Row[];
  const parent = classi.find((r) => r['ID'] === '1F')!;
  const lss = classi.find((r) => r['ID'] === '1F-LSS')!;
  parent['COORD'] = '';
  lss['COORD'] = 'verdi@school.it';

  const c = build('1F', tables).focus.classe!;
  expect(c.coordinatori).toEqual([
    {
      nome: 'ROSSI MARIO',
      email: 'rossi@school.it',
      materia: 'MATE',
      appellativo: 'Prof.',
      indirizzo: { nome: 'Liceo scientifico' }
    },
    {
      nome: 'VERDI GIO',
      email: 'verdi@school.it',
      materia: 'FISI',
      appellativo: 'Prof.',
      indirizzo: { nome: 'Liceo scientifico scienze applicate' }
    }
  ]);
});
```

(1F-LSO's `COORD` is left at its fixture default, `'rossi@school.it'`, who holds `MATE` there; 1F-LSS's `COORD` is overridden to `'verdi@school.it'`, who holds `FISI` there per the base fixture.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/classe-provider.test.ts -t "articulated parent merges coordinatori"`
Expected: FAIL — `c.coordinatori` is `[]` (the parent's own empty `COORD` column).

- [ ] **Step 3: Update `CduClasse.coordinatori`**

In `src/application/context-engine/Cdu.ts`, edit line 135:

```typescript
  coordinatori?: Array<{
    nome: string;
    email: string;
    materia: string;
    appellativo: string;
    indirizzo?: { nome: string };
  }>;
```

- [ ] **Step 4: Update `ClasseProvider`**

In `src/application/context-engine/providers/ClasseProvider.ts`, replace the `coordinatori:` line inside `provide` (currently lines 53-58):

```typescript
coordinatori: this.buildCoordinatori(classe);
```

Then add a new private method after `resolveClasse` (after line 88, before `buildArticolazione`):

```typescript
  private buildCoordinatori(classe: Classe): NonNullable<CduClasse['coordinatori']> {
    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() === true) {
      const result: NonNullable<CduClasse['coordinatori']> = [];
      for (const source of [classe, ...this.classi.getClassiPartner(classe)]) {
        const indirizzoNome = this.classi.getIndirizzo(source).nome;
        for (const d of this.classi.getCoordinatori(source)) {
          result.push({
            nome: d.getNomeCompleto(),
            email: d.id ?? '',
            materia: this.classi.getMateriaDocente(source, d.id ?? '') ?? '',
            appellativo: d.getAppellativo(),
            indirizzo: { nome: indirizzoNome }
          });
        }
      }
      return result;
    }
    return this.classi.getCoordinatori(classe).map((d) => ({
      nome: d.getNomeCompleto(),
      email: d.id ?? '',
      materia: this.classi.getMateriaDocente(classe, d.id ?? '') ?? '',
      appellativo: d.getAppellativo()
    }));
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/classe-provider.test.ts`
Expected: PASS (including the pre-existing `'ClasseProvider: coordinatori with resolved subject + appellativo'` test on non-articulated `'5A'`, unaffected — it never reaches the `isParent()` branch).

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/ClasseProvider.ts test/unit/application/context-engine/classe-provider.test.ts
git commit -m "fix(cdu): expand coordinatori across articulated partners for the parent class"
```

---

### Task 4: `DocenteCdcVM` gains `materieDescrizione` + `gruppoNome`

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:18-31` (`DocenteCdcVM`)
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts`
- Test: `test/unit/application/context-engine/consiglio-provider.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.orderedPartners(classe): Classe[]`, `getIndirizzo(classe): Indirizzo`.
- Produces: `DocenteCdcVM.materieDescrizione: string` (every teacher's subjects, comma-joined, always computed); `DocenteCdcVM.gruppoNome: string | null` (the major name for `SEPARATO_PRIMO`/`SEPARATO_SECONDO`, `null` for `COMUNE`/non-articulated).

- [ ] **Step 1: Write the failing tests**

Edit `test/unit/application/context-engine/consiglio-provider.test.ts`. In the existing test `'CDC coordinatore VM: materie, roles and descrizione'` (currently lines 60-84), add two assertions after the `rossi.materie` check:

```typescript
expect(rossi.materieDescrizione).toBe('Matematica');
expect(rossi.gruppoNome).toBeNull();
```

In the existing test `'CDC of an articulated parent: tipoArticolazione by partner membership (09 §9)'` (currently lines 86-96), add after the `tipoArticolazione` assertions:

```typescript
expect(byEmail(list, 'rossi@school.it').gruppoNome).toBeNull();
expect(byEmail(list, 'bianchi@school.it').gruppoNome).toBe('Liceo scientifico');
expect(byEmail(list, 'verdi@school.it').gruppoNome).toBe('Liceo scientifico scienze applicate');
expect(byEmail(list, 'bianchi@school.it').materieDescrizione).toBe('Fisica');
expect(byEmail(list, 'verdi@school.it').materieDescrizione).toBe('Fisica');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: FAIL — `materieDescrizione`/`gruppoNome` are `undefined` on the actual VMs.

- [ ] **Step 3: Update `DocenteCdcVM`**

In `src/application/context-engine/Cdu.ts`, edit lines 18-31:

```typescript
export interface DocenteCdcVM {
  anagrafica: { nome: string; cognome: string; email: string; genere: string; appellativo: string };
  materie: Array<{ sigla: string; nome: string; colore: string; specificita: string | null }>;
  /** Every subject in `materie`, names comma-joined (09 §10 — for flat, template-simple display). */
  materieDescrizione: string;
  ruoli: {
    isCoordinatore: boolean;
    isTutorAsl: boolean;
    isTutorOrientamento: boolean;
    descrizione: string[];
  };
  stato: { isSupplente: boolean; sostituisce: { nome: string; email: string } | null };
  tipoArticolazione: 'COMUNE' | 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO' | null;
  /** Resolved major name for SEPARATO_PRIMO/SEPARATO_SECONDO; null for COMUNE and non-articulated classes (09 §10). */
  gruppoNome: string | null;
  isITP: boolean;
  flags: { isNotLast: boolean };
}
```

- [ ] **Step 4: Populate both fields in `councilVmStrategy`**

In `src/application/context-engine/TeachingCouncilProjection.ts`, add a new helper function right after `tipoArticolazione` (after line 184):

```typescript
function gruppoNome(
  classi: IClasseRepository,
  classe: Classe,
  tipo: DocenteCdcVM['tipoArticolazione']
): string | null {
  if (tipo !== 'SEPARATO_PRIMO' && tipo !== 'SEPARATO_SECONDO') return null;
  const partners = classi.orderedPartners(classe);
  const partner = tipo === 'SEPARATO_PRIMO' ? partners[0] : partners[1];
  return partner === undefined ? null : classi.getIndirizzo(partner).nome;
}
```

Then, inside `councilVmStrategy`'s `groups.map(...)` callback (lines 202-250), rename the inline `materie:` array to a local `const` and reuse it, and compute `tipoArt` once:

```typescript
const materieVm = assignments.map((assignment) => ({
  sigla: assignment.slot.materia,
  nome:
    materie.findByIdCached(MateriaId.of(assignment.slot.materia))?.nome ?? assignment.slot.materia,
  colore: '',
  specificita: assignment.slot.specifica
}));
const tipoArt = tipoArticolazione(classi, classe, assignments);
return {
  anagrafica: {
    nome: rowDocente.nome,
    cognome: rowDocente.cognome,
    email: rowDocente.id,
    genere: rowDocente.genere,
    appellativo: rowDocente.appellativo
  },
  materie: materieVm,
  materieDescrizione: materieVm.map((m) => m.nome).join(', '),
  ruoli: {
    isCoordinatore,
    isTutorAsl,
    isTutorOrientamento,
    descrizione: descrizione(isCoordinatore, isTutorAsl, isTutorOrientamento)
  },
  stato: {
    isSupplente,
    sostituisce:
      sostituisce === null ? null : { nome: sostituisce.nomeCompleto, email: sostituisce.id }
  },
  tipoArticolazione: tipoArt,
  gruppoNome: gruppoNome(classi, classe, tipoArt),
  isITP: assignments.some((assignment) => assignment.slot.kind === 'ITP'),
  flags: { isNotLast: index < groups.length - 1 }
} satisfies DocenteCdcVM;
```

Remove the now-redundant original `materie:` and `tipoArticolazione: tipoArticolazione(classi, classe, assignments),` lines (replaced above).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: PASS (all tests in the file, including `'tipoArticolazione follows resolved partner assignments for replacements and substitutes'`, which doesn't assert on the new fields and stays green).

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: PASS. (`DocenteCdcVM` fields are required, so any other production/test code building a literal `DocenteCdcVM` must be updated — based on the codebase search performed while writing this plan, `councilVmStrategy` is the only production constructor.)

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/TeachingCouncilProjection.ts test/unit/application/context-engine/consiglio-provider.test.ts
git commit -m "feat(cdu): add materieDescrizione + gruppoNome to the teaching-council VM"
```

---

### Task 5: `ConsiglioClasseProvider` emits `consiglioDiClasseComune`/`consiglioDiClasseSeparato`

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:144` (`CduClasse`)
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts`
- Test: `test/unit/application/context-engine/consiglio-provider.test.ts`

**Interfaces:**

- Consumes: `DocenteCdcVM.tipoArticolazione` (Task 4), `IClasseRepository.isArticolata(classe): boolean`.
- Produces: `CduClasse.consiglioDiClasseComune?: DocenteCdcVM[]` and `CduClasse.consiglioDiClasseSeparato?: DocenteCdcVM[]` — both present (possibly empty arrays) only when the focus class is articulated; `undefined` otherwise. Filtering happens server-side (`.filter()`), never via a template pipe.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/application/context-engine/consiglio-provider.test.ts`:

```typescript
test('ConsiglioClasseProvider: articulated parent splits consiglio into comune/separato (09 §10)', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider(
    'consiglio',
    new ConsiglioClasseProvider(classi, new MateriaRepository(db), teachingAssignments)
  );
  const params: BuildParams = {
    target: '1F',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = {
    providers: ['class', 'consiglio'],
    options: makeOptions({ gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI })
  };
  const focusClasse = b.build(params, recipe).focus.classe!;
  expect(focusClasse.consiglioDiClasseComune!.map((d) => d.anagrafica.email)).toEqual([
    'rossi@school.it'
  ]);
  expect(focusClasse.consiglioDiClasseSeparato!.map((d) => d.anagrafica.email).sort()).toEqual([
    'bianchi@school.it',
    'verdi@school.it'
  ]);
});

test('ConsiglioClasseProvider: non-articulated class has no comune/separato split', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider(
    'consiglio',
    new ConsiglioClasseProvider(classi, new MateriaRepository(db), teachingAssignments)
  );
  const params: BuildParams = {
    target: '5A',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = { providers: ['class', 'consiglio'], options: makeOptions() };
  const focusClasse = b.build(params, recipe).focus.classe!;
  expect(focusClasse.consiglioDiClasseComune).toBeUndefined();
  expect(focusClasse.consiglioDiClasseSeparato).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts -t "comune/separato"`
Expected: FAIL — both fields are `undefined` for `'1F'` too (property doesn't exist yet).

- [ ] **Step 3: Update `CduClasse`**

In `src/application/context-engine/Cdu.ts`, right after `consiglioDiClasse?: DocenteCdcVM[];` (line 144), add:

```typescript
  consiglioDiClasseComune?: DocenteCdcVM[];
  consiglioDiClasseSeparato?: DocenteCdcVM[];
```

- [ ] **Step 4: Update `ConsiglioClasseProvider`**

Replace the full contents of `src/application/context-engine/providers/ConsiglioClasseProvider.ts`:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import { getClasseEntity } from '../techEntities';
import {
  createTeachingCouncilProjection,
  prepareCouncilAssignments,
  resolveCouncilForProjection,
  attachCouncilProjectionMetadata
} from '../TeachingCouncilProjection';
import type { CollectionProjectionInterceptor } from 'GasLibraryFactory';

export class ConsiglioClasseProvider implements ContextProvider {
  private readonly projection: CollectionProjectionInterceptor;

  constructor(
    private readonly classi: IClasseRepository,
    materie: IMateriaRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {
    this.projection = createTeachingCouncilProjection(classi, materie).consiglio;
  }

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classe = getClasseEntity(cdu);
    const assignments = resolveCouncilForProjection(
      this.teachingAssignments,
      classe,
      new Date(cdu.meta.date.oggi.iso),
      options.gestioneSupplenti
    );
    focusClasse.consiglioDiClasse = prepareCouncilAssignments(assignments) as never;
    this.projection.intercept('consiglio', cdu, cdu, options);
    attachCouncilProjectionMetadata(cdu, assignments);

    if (this.classi.isArticolata(classe)) {
      const consiglio = focusClasse.consiglioDiClasse ?? [];
      focusClasse.consiglioDiClasseComune = consiglio.filter(
        (docente) => docente.tipoArticolazione === 'COMUNE'
      );
      focusClasse.consiglioDiClasseSeparato = consiglio.filter(
        (docente) =>
          docente.tipoArticolazione === 'SEPARATO_PRIMO' ||
          docente.tipoArticolazione === 'SEPARATO_SECONDO'
      );
    }
  }
}
```

Keep whatever the original file's exact import specifiers were for `CollectionProjectionInterceptor` and the other GAS-lib types — **do not guess the module path**; open the current file first and copy its existing import lines verbatim, only adding the `private readonly` modifier to the `classi` constructor parameter and the new `if (this.classi.isArticolata(classe))` block at the end of `provide`. The listing above shows the intended _logic_, not a byte-exact replacement for imports whose exact source this plan didn't need to resolve.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/ConsiglioClasseProvider.ts test/unit/application/context-engine/consiglio-provider.test.ts
git commit -m "feat(cdu): derive consiglioDiClasseComune/Separato for articulated classes"
```

---

### Task 6: New `CONF_DOC` row + `E2eTemplateIds.docArticolata`

**Files:**

- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`

**Interfaces:**

- Produces: `export const CONF_DOC_ARTICOLATA = 'E2E_DOC_ARTICOLATA';`, `E2eTemplateIds.docArticolata: string`, a new `TABLE.CONF_DOC` row consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Edit `test/unit/onlinetests/e2e-sample-database-builder.test.ts`:

1. Add `CONF_DOC_ARTICOLATA` to the import list from `E2eSampleDatabaseBuilder` (alongside `CONF_DOC_COMPLESSO`).
2. Add `docArticolata: 'tmpl_doc_articolata',` to the `TEMPLATE_IDS` object (after `docComplesso: 'tmpl_doc_complesso',`, currently line 88).
3. Change `expect(confDoc).toHaveLength(7);` (currently line 226) to `expect(confDoc).toHaveLength(8);`.
4. Add `CONF_DOC_ARTICOLATA` to the `for (const id of [...])` loop at line 245 so its `REGISTRA_DOC` shape is covered by the existing assertion:
   ```typescript
   for (const id of [CONF_DOC_CONDOTTA, CONF_DOC_RIEPILOGO, CONF_DOC_COMPLESSO, CONF_DOC_ARTICOLATA]) {
   ```
5. Add a new dedicated test after the existing `E2E_DOC_COMPLESSO` row test (around line 567):
   ```typescript
   test('seeds the CONF_DOC row for the articulated-class complex document', () => {
     const { spreadsheets, sheets } = factory();
     new E2eSampleDatabaseBuilder(new FakeDriveFacade(), spreadsheets).build(TEMPLATE_IDS);
     const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
     const row = sample.rows[TABLE.CONF_DOC]!.find(
       (r) => r[COL_CONF_DOC.ID] === CONF_DOC_ARTICOLATA
     )!;
     expect(row[COL_CONF_DOC.TIPO]).toBe('DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA');
     expect(row[COL_CONF_DOC.GENERATORE]).toBe('DOCUMENTO_GENERICO');
     expect(JSON.parse(row[COL_CONF_DOC.MODELLI] as string)).toEqual({
       templateId: 'tmpl_doc_articolata'
     });
   });
   ```

(Match the exact `factory()`/`FakeDriveFacade`/builder-construction pattern already used by the neighboring tests in this file — copy it from the existing `'seeds the CONF_DOC row for ...'`-style test rather than re-deriving it, since the precise constructor arguments for `E2eSampleDatabaseBuilder` live earlier in this same file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts -t "articulated-class complex document"`
Expected: FAIL — `row` is `undefined` (`Cannot read properties of undefined`), since `CONF_DOC_ARTICOLATA` doesn't exist yet.

- [ ] **Step 3: Add the constant + interface field**

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, add after `export const CONF_DOC_COMPLESSO = 'E2E_DOC_COMPLESSO';` (line 130):

```typescript
export const CONF_DOC_ARTICOLATA = 'E2E_DOC_ARTICOLATA';
```

In the `E2eTemplateIds` interface (lines 180-190), add after `docComplesso: string;`:

```typescript
docArticolata: string;
```

- [ ] **Step 4: Seed the CONF_DOC row**

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, inside `seedConfDoc` (starting at line 810), add a new `sample.appendRow(TABLE.CONF_DOC, ...)` block right after the `CONF_DOC_COMPLESSO` block (after line 908, before the `CONF_DOC_SHEET_PERMESSI` block):

```typescript
sample.appendRow(TABLE.CONF_DOC, {
  [COL_CONF_DOC.ID]: CONF_DOC_ARTICOLATA,
  [COL_CONF_DOC.TIPO]: 'DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA',
  [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
  [COL_CONF_DOC.CONDIZIONE]: '',
  [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.docArticolata }),
  [COL_CONF_DOC.FILE_NAME]: 'E2E_Articolata_{{focus.classe.anagrafica.nome}}',
  [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/ARTICOLATA',
  [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
  [COL_CONF_DOC.PERMESSI]: '',
  [COL_CONF_DOC.POST_PROCESSO]: null,
  [COL_CONF_DOC.PARAMETRI]: '',
  [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
  [COL_CONF_DOC.FORMATO]: 'GDOC',
  [COL_CONF_DOC.REGISTRA_DOC]: classRegistration,
  [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: PASS (all tests in the file — this will surface a TypeScript error at Step 2's edit if `templateIds.docArticolata` doesn't exist yet, which Step 3 already fixed by this point).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Every other caller that builds a literal `E2eTemplateIds` object — e.g. any fixture in `test/unit/onlinetests/`, and `E2eTemplateProvisioner.provision`'s return statement, addressed in Task 7 — must also gain `docArticolata`; fix any typecheck failures surfaced here by adding the field.)

- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "feat(e2e): seed CONF_DOC row for DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA"
```

---

### Task 7: New Drive template with 4 bullet lists

**Files:**

- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`

**Interfaces:**

- Consumes: `E2eTemplateIds.docArticolata` (Task 6).
- Produces: a new Drive document template (found-or-created by fixed name), authored with the CDU paths from Tasks 1-5.

- [ ] **Step 1: Write the failing tests**

Edit `test/unit/onlinetests/e2e-template-provisioner.test.ts`:

1. Update the artifact-count test (currently lines 57-75): `toHaveLength(13)` → `toHaveLength(14)`, `docs` count `toHaveLength(10)` → `toHaveLength(11)` (sheets stay at 3), and add:
   ```typescript
   expect(ids.docArticolata).toMatch(/^doc_/);
   expect(created).toContain('doc:E2E Doc Articolata Template');
   ```
2. Add a new test after `'authors the complex-placeholder template with bullet/number lists, tablerow/tablecol loops, and pipe filters'`:
   ```typescript
   test('authors the articulated-class template with 4 flat bullet lists, no nested loops or filter pipes', () => {
     const { artifacts, docContent } = fakeArtifacts();
     const drive = new FakeDriveFacade();
     const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

     const text = documentText(docContent[ids.docArticolata] ?? []);
     expect(text).toContain('{{#bullet_list:focus.classe.studenti.listaCompleta');
     expect(text).toContain('{{anagrafica.nomeCompleto}} ({{indirizzo.nome}})');
     expect(text).toContain('{{#bullet_list:focus.classe.consiglioDiClasseComune}}');
     expect(text).toContain('({{materieDescrizione}})');
     expect(text).toContain('{{#bullet_list:focus.classe.consiglioDiClasseSeparato}}');
     expect(text).toContain('({{gruppoNome}})');
     expect(text).toContain('{{#bullet_list:focus.classe.rappresentanti.studenti}}');
     expect(text).toContain('{{#bullet_list:focus.classe.rappresentanti.genitori}}');
     expect(text).toContain('{{#bullet_list:focus.classe.coordinatori}}');
     expect(text).not.toMatch(/\|\s*where/);
     expect(text).not.toMatch(/\|\s*map/);
   });
   ```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`
Expected: FAIL — `ids.docArticolata` is `undefined` (property doesn't exist on the returned object yet), and the artifact counts are still 13/10.

- [ ] **Step 3: Author the template content and wire it into `provision()`**

In `src/onlinetests/E2eTemplateProvisioner.ts`, add a new name constant after `const NAME_DOC_COMPLESSO = 'E2E Doc Complesso Template v2';` (line 42):

```typescript
const NAME_DOC_ARTICOLATA = 'E2E Doc Articolata Template';
```

Add the paragraph content after `DOC_COMPLESSO_TABLES` (after line 211, before the `sheetPermessiUpdates` comment block):

```typescript
/**
 * DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA (design spec
 * `2026-07-30-classe-articolata-report-design.md`): 4 flat `bullet_list`
 * blocks over already-shaped CDU arrays (Tasks 1-5) — no nested loops, no
 * `where`/`map`/`join` pipes, so nothing here depends on unproven
 * WorkspaceTemplateEngine pipe-chaining behavior.
 */
const DOC_ARTICOLATA_PARAGRAPHS: E2eDocumentParagraphInput[] = [
  'Documento Complesso Classe Articolata — {{focus.classe.anagrafica.nome}}',
  'Elenco studenti (indirizzo tra parentesi):',
  {
    text: "{{#bullet_list:focus.classe.studenti.listaCompleta | sortBy:'anagrafica.nomeCompleto'}}{{anagrafica.nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}",
    listType: 'bullet'
  },
  'Docenti comuni a tutta la classe (materie tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.consiglioDiClasseComune}}{{anagrafica.nome}} {{anagrafica.cognome}} ({{materieDescrizione}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Docenti per indirizzo (materie e indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.consiglioDiClasseSeparato}}{{materieDescrizione}} ({{gruppoNome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti degli studenti (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Rappresentanti dei genitori (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.rappresentanti.genitori}}{{nomeCompleto}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  },
  'Coordinatori (indirizzo tra parentesi):',
  {
    text: '{{#bullet_list:focus.classe.coordinatori}}{{nome}} ({{indirizzo.nome}}){{/bullet_list}}',
    listType: 'bullet'
  }
];
```

In `provision()` (lines 263-305), add after the `docComplesso` block:

```typescript
const docArticolata = this.findOrCreateDoc(
  folderId,
  NAME_DOC_ARTICOLATA,
  DOC_ARTICOLATA_PARAGRAPHS
);
```

And add `docArticolata` to the returned object:

```typescript
return {
  verbale,
  condotta,
  riepilogo,
  aslImportSheet,
  docComplesso,
  docArticolata,
  sheetPermessi,
  pianoLavoro,
  staticAttachment,
  piani
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-template-provisioner.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts test/unit/onlinetests/e2e-template-provisioner.test.ts
git commit -m "feat(e2e): author the classe-articolata Drive template (4 flat bullet lists)"
```

---

### Task 8: Register the new online e2e scenario

**Files:**

- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`

**Interfaces:**

- Consumes: `CONF_DOC_ARTICOLATA` (Task 6), `CLASSE_C_PARENT` (`'3C'`, already exported by `E2eSampleDatabaseBuilder.ts:31`), `DocumentGenerationService.generateForClasse`, `IDriveFacade.getFileText`.
- Produces: a new `runner.add(...)` entry executed by the online test harness (`npm run build:online` builds it; actually running it against live Google Docs is a separate, manual `push:online` step outside this plan's automated verification — see Task 9).

**No new unit test for this task** — `registerE2eScenarioChecks` is exercised as a whole by the existing `test/unit/onlinetests/e2e-scenario-checks.test.ts` only for its guard/wiring behavior, not per-scenario Drive content (matching how scenario 10 — `CONF_DOC_COMPLESSO` — is handled today: no dedicated unit test, verified only by the online run itself). Correctness here is proven by `npm run typecheck` (compiles against the real `DocumentGenerationService`/`IDriveFacade` types) and, ultimately, by a live online run.

- [ ] **Step 1: Add the imports**

In `src/onlinetests/checks/e2eScenarioChecks.ts`, add `CONF_DOC_ARTICOLATA` and `CLASSE_C_PARENT` to the existing import block from `'../E2eSampleDatabaseBuilder'` (lines 15-37):

```typescript
import {
  ALL_CLASSI_E2E,
  CLASSE_C_PARENT,
  TIPI_PIANO,
  CONF_DOC_VERBALE,
  CONF_DOC_CONDOTTA,
  CONF_DOC_RIEPILOGO,
  CONF_DOC_COMPLESSO,
  CONF_DOC_ARTICOLATA,
  CONF_DOC_SHEET_PERMESSI,
  CONF_DOC_PIANO_LAVORO,
  CONF_DOC_PIANI,
  CONF_IMP_ASL,
  CONF_MAIL_VERBALE,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_CARENZA,
  CONF_MAIL_PIANI,
  CONF_MAIL_LAVORO,
  CONF_MAIL_STATIC_ALLEGATO,
  PIANO_STUDENTE,
  PIANO_DOPPIO_STUDENTE,
  PDP_BES_3C,
  e2eDocenteEmail,
  type E2eSampleDatabase
} from '../E2eSampleDatabaseBuilder';
```

- [ ] **Step 2: Register the scenario**

In `registerE2eScenarioChecks`, add a new `runner.add(...)` block right after the existing `'E2E scenario 10: genera documento complesso ...'` block (after line 488):

```typescript
runner.add(
  'E2E scenario 10b: genera documento complesso classe articolata (3C)',
  sample.sampleSpreadsheetUrl,
  () => {
    const drive = container.get<IDriveFacade>('drive');
    const { fileId, status } = documents.generateForClasse(
      ClasseId.of(CLASSE_C_PARENT),
      CONF_DOC_ARTICOLATA
    );
    if (fileId === null) {
      throw new ValidationError(
        `Generazione documento complesso classe articolata per ${CLASSE_C_PARENT} non ha prodotto un fileId (status=${status})`
      );
    }
    const text = drive.getFileText(fileId);
    if (/\{\{[^}]*\}\}/.test(text)) {
      throw new ValidationError(
        `Documento complesso classe articolata: placeholder non risolto trovato nel testo generato`
      );
    }
    // e2eDocenteEmail(3)/(4) coordinate 3C-S/3C-C respectively (E2eSampleDatabaseBuilder
    // classLayouts) with DOCENTE_COGNOMI surnames VERDI/FERRARI — their presence proves
    // ClasseProvider.coordinatori now merges both partners' distinct coordinators
    // (the bug fixed in Task 3), not just the (empty) parent row.
    if (!text.includes('VERDI')) {
      throw new ValidationError(
        'Documento complesso classe articolata: coordinatore di 3C-S (VERDI) assente dal testo'
      );
    }
    if (!text.includes('FERRARI')) {
      throw new ValidationError(
        'Documento complesso classe articolata: coordinatore di 3C-C (FERRARI) assente dal testo'
      );
    }
    assertPersistedLinks(CONF_DOC_ARTICOLATA, 'Documento complesso classe articolata');
  }
);
```

`assertPersistedLinks` (defined at line 140) loops `ALL_CLASSI_E2E` and expects a `LOG_DOCS` row for every one of them — but this scenario only generates for `CLASSE_C_PARENT`. **Do not reuse `assertPersistedLinks` as-is.** Replace that last line with a direct, single-class check instead:

```typescript
const logRow = db
  .table(TABLE.LOG_DOCS)
  .findAll()
  .find(
    (row) =>
      row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_ARTICOLATA &&
      row[COL_LOG_DOCS.CLASSI] === CLASSE_C_PARENT
  );
if (logRow === undefined || String(logRow[COL_LOG_DOCS.LINK] ?? '').trim() === '') {
  throw new ValidationError(
    `Documento complesso classe articolata per ${CLASSE_C_PARENT} non ha un LOG_DOCS.LINK persistito`
  );
}
```

(So the final block does NOT call `assertPersistedLinks` at all — use the direct `logRow` check shown above in its place.)

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Run the offline unit/build suites**

Run: `npm test && npm run test:build`
Expected: PASS — `registerE2eScenarioChecks`'s existing guard tests (`test/unit/onlinetests/e2e-scenario-checks.test.ts`) don't enumerate every scenario by name, so adding one more `runner.add` call should not require changes there; if any test iterates `runner`'s registered checks by exact count, update that count by +1.

- [ ] **Step 5: Commit**

```bash
git add src/onlinetests/checks/e2eScenarioChecks.ts
git commit -m "feat(e2e): register the classe-articolata document scenario against 3C"
```

---

### Task 9: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS, zero errors.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: PASS, zero errors/warnings. If ESLint flags anything (e.g. unused import left over from a refactor in Task 5), fix it with `npm run lint:fix` and re-run.

- [ ] **Step 3: Full unit suite**

Run: `npm test`
Expected: PASS, all suites green, no `.only`/`.skip` left behind.

- [ ] **Step 4: Integration suite**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Build (online mode, runs the offline suite as a gate)**

Run: `npm run build:online`
Expected: PASS. This also confirms `OnlineTests.js` compiles the new scenario cleanly through the V8-compat patch pipeline.

- [ ] **Step 6: Note the manual follow-up**

This plan cannot execute a live Google Apps Script run from this environment. After `build:online` passes, the actual proof that `bullet_list`/the new CDU fields render correctly in a real Google Doc requires `npm run push:online` followed by manually running the online test suite in the Apps Script project (or via whatever trigger the user normally uses) and inspecting scenario "10b" in the report. **Tell the user this step is outstanding and needs to be run manually** — do not claim the online scenario is proven correct without it.

- [ ] **Step 7: Commit (only if Steps 1-5 required fixes not already committed in earlier tasks)**

```bash
git add -A
git commit -m "chore: verification pass for classe-articolata document + CDU fixes"
```

(Skip this step entirely if there is nothing to commit — every prior task already committed its own changes.)

---

### Task 10: Write `ARTICOLAZIONE.md`

**Files:**

- Create: `ARTICOLAZIONE.md` (repo root)

This task runs **last**, after Tasks 1-9 are committed, so the report describes the actual (fixed) behavior rather than open bugs. Write the file with this content, adjusting any line numbers that shifted during implementation (re-grep each citation before finalizing — line numbers below are accurate as of this plan's writing, against commit `2b057a2`):

- [ ] **Step 1: Write `ARTICOLAZIONE.md`**

```markdown
# Gestione delle classi articolate in ALDO

Questo documento descrive come SGSA/ALDO gestisce le **classi articolate**
(una classe "parent" — es. `3C` — unione di due classi "partner" con
indirizzi di studio diversi, es. `3C-S`/`3C-C`) lungo tre assi: generazione
documenti, invio email, costruzione del CDU. Include le lacune trovate
durante lo sviluppo di `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`
(`docs/superpowers/specs/2026-07-30-classe-articolata-report-design.md`).

## 1. Generatori di documenti

Un `CONF_DOC` separa due concetti (`ConfigurazioneDocumento.ts:17-32`):

- `TIPO` — etichetta descrittiva libera (es. `REPORT_COMPLESSO`,
  `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`).
- `GENERATORE` — chiave nel registro delle `GeneratorStrategy`
  (`DocumentGenerationService.ts:96`, `strategyRegistry.has(config.generatore)`).

Non esiste una `GeneratorStrategy` dedicata alle classi articolate: sia
`REPORT_COMPLESSO` che `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA` usano
`DOCUMENTO_GENERICO` (`DocumentoGenericoGeneratorStrategy.ts`) — pura
sostituzione di placeholder via `WorkspaceTemplateEngine`, nessuna logica
di generazione specifica per l'articolazione.

`DocumentGenerationService.generateForClasse` (`DocumentGenerationService.ts:88-141`)
accetta un singolo `ClasseId`. Non esiste un concetto di "genera un
documento per l'intero gruppo articolato": quando il target è la classe
parent, il documento viene generato UNA volta, e tutto il contenuto
multi-gruppo (studenti, docenti, rappresentanti, coordinatori di entrambe
le partner) deve arrivare attraverso il CDU — vedi sezione 2. Puntare un
`CONF_DOC` a una classe partner invece che al parent produce un documento
che vede solo quella metà del gruppo.

**`COL_CONF_DOC.GESTIONE_ARTICOLAZIONE` è una colonna morta.** È presente
nello schema, viene seminata in ogni riga `CONF_DOC` di test (sempre `''`,
salvo un `'COMPLETA'` isolato in alcuni fixture di `contextEngineChecks.ts`),
ma non viene letta da nessun punto di `src/application` — grep su
`gestioneArticolazione`/`GESTIONE_ARTICOLAZIONE` in quella directory non
produce risultati. Non ha alcun effetto sul comportamento attuale.

`ApplyPermissionsStep`/`RegisterDocumentStep` (`documentSteps.ts`) non
contengono alcuna logica di articolazione — operano genericamente sul CDU
via `CONF_DOC.PERMESSI`/`REGISTRA_DOC` (placeholder come
`{{focus.classe.anagrafica.nome}}`), quindi per un target parent
registrano/applicano permessi sul nome della classe parent, correttamente
e senza bisogno di codice dedicato. Non è una lacuna: è un'area
confermata "non ne ha bisogno" durante questo lavoro.

## 2. Costruzione del CDU

Il pattern generale per una classe parent è: **il provider deve espandersi
esplicitamente sulle classi partner**, perché nessuno studente ha mai
`ALUNNI.CLASSE` uguale all'id della classe parent — solo le due classi
partner hanno studenti reali.

- `studentiDellaClasse` (`src/application/context-engine/studenti.ts:10-20`)
  fa già questa espansione: se `getArticolazione(classe).isParent()`,
  concatena `getStudenti` su ciascun `getClassiPartner(classe)`.
  `StudentiProvider` (`providers/StudentiProvider.ts`) segue lo stesso
  pattern per costruire `studenti.listaCompleta`/`.perIndirizzo`, e — da
  questo lavoro — ogni `AlunnoContestoVM` porta anche il proprio
  `indirizzo` (major), quello della classe partner di appartenenza, non
  quello (inesistente/ambiguo) della parent.

- **`RappresentantiProvider` e `ClasseProvider.coordinatori` NON facevano
  questa espansione fino a questo lavoro** — leggevano rispettivamente
  `classi.getStudenti(classe)` e `classi.getCoordinatori(classe)`
  direttamente sulla classe focus. Per una classe parent, questo
  significava:
  - `rappresentanti.studenti`/`.genitori` sempre vuoti (nessuno studente
    appartiene mai alla parent).
  - `coordinatori` vuoto o errato (la riga `COORD` della parent è
    tipicamente vuota — vedi `E2eSampleDatabaseBuilder.ts:468` — mentre i
    coordinatori reali vivono sulle righe partner, distinti per gruppo fin
    dai commit `f01e3e6`/`b771f6d`, ma mai letti dal CDU).

  Questo era un bug generale: **qualunque documento** puntato alla classe
  parent (non solo `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`) riceveva
  rappresentanti/coordinatori vuoti o sbagliati. Fixato in questo lavoro:
  entrambi i provider ora seguono lo stesso pattern di
  `studentiDellaClasse` (iterano `getClassiPartner`), taggando ogni
  voce con `indirizzo: { nome }` del gruppo di provenienza.

- `consiglioDiClasse` (`DocenteCdcVM[]`, costruito da
  `TeachingCouncilProjection.councilVmStrategy`) era invece **già
  corretto** per il gruppo articolato: il resolver GLF sottostante
  (`AldoTeachingAssignmentResolver`/`CattedraResolver`, delegato via GLF —
  commit `5051dfc "refactor: delegate teaching resolution to GLF"`) risolve
  già gli assignment su entrambe le classi partner quando il focus è la
  parent, e ogni docente viene taggato `tipoArticolazione`:
  `'COMUNE'` (stesso docente/materia in entrambe le partner),
  `'SEPARATO_PRIMO'`/`'SEPARATO_SECONDO'` (solo in una), calcolato
  confrontando gli id-classe degli assignment con
  `orderedPartners(classe)` (`TeachingCouncilProjection.ts:169-184`).
  Mancava solo la _**risoluzione del nome**_ del gruppo (il tag era
  puramente simbolico) e una stringa già pronta delle materie per
  docente — aggiunte in questo lavoro come `gruppoNome`/
  `materieDescrizione`, oltre a due array già filtrati
  (`consiglioDiClasseComune`/`consiglioDiClasseSeparato`) così che i
  template non debbano fare filtering lato placeholder.

- La divisione materie condivise/separate a livello di classe (non di
  singolo docente) vive in
  `ClasseRepository.getMaterieArticolazione` (`ClasseRepository.ts`,
  confronta gli insiemi di docenti per materia tra le due partner
  ordinate via `orderedPartners`) ed è esposta in CDU come
  `focus.classe.articolazione.{materieCondivise,materieSeparatePrimoGruppo,materieSeparateSecondoGruppo}`
  (solo sigle di materia, non nomi di docenti).

## 3. Invio email

L'instradamento email era già "articulation-aware" prima di questo
lavoro, indipendentemente dal CDU documentale:

- `RisolutoreRuoliService.genitoriClasse` (`RisolutoreRuoliService.ts:267-269`)
  usa `classi.getStudenti(ctx.classe, true).flatMap(getTutors)` — nota che
  usa i tutor (`TUTOR_1`/`TUTOR_2`), non `RAPPR_GEN`, e comunque opera
  sulla classe passata nel contesto di invio (che per gli scenari
  coordinatore-aggregato è già la classe corretta, non la parent vuota).
- `EmailNotificationService.classiCompetenza`/`targetsPerCoordinatore`
  (`EmailNotificationService.ts:292-297,331-365`) instradano
  esplicitamente per partner — è il fix "route articulated coordinators
  by partner" (commit `f01e3e6`), con relativo modello di dati
  "distinct articulated coordinators" (commit `b771f6d`, che ha esteso
  anche `E2eSampleDatabaseBuilder`/`e2eScenarioChecks` per i due
  coordinatori realmente distinti di `3C-S`/`3C-C`, usati anche dallo
  scenario e2e di questo lavoro come prova che il merge CDU funziona).

Il contrasto prima di questo lavoro era quindi: **l'invio email sapeva
già gestire coordinatori distinti per partner; la costruzione del CDU
documentale no.** Le due cose vivevano in codice completamente separato
(`EmailNotificationService` vs. `ClasseProvider`) e non condividevano
alcuna logica di espansione — motivo per cui il bug in sezione 2 è potuto
restare latente: nessuno scenario e2e esistente generava mai un
documento puntato alla classe parent e ne ispezionava
rappresentanti/coordinatori.

## 4. Lacune (aggiornato dopo il fix)

| Lacuna                                                                                                          | Stato                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `COL_CONF_DOC.GESTIONE_ARTICOLAZIONE` mai letta in `src/application`                                            | Aperta — non affrontata in questo lavoro (fuori scope, richiede una vera decisione di design su cosa dovrebbe fare)                                                                                                                                                                                                                                          |
| `RappresentantiProvider` non espandeva sulle partner per una classe parent                                      | **Fixata** in questo lavoro (Task 2)                                                                                                                                                                                                                                                                                                                         |
| `ClasseProvider.coordinatori` non espandeva sulle partner per una classe parent                                 | **Fixata** in questo lavoro (Task 3)                                                                                                                                                                                                                                                                                                                         |
| `consiglioDiClasse` mancava nome del gruppo/major e stringa materie pronta                                      | **Fixata** in questo lavoro (Task 4)                                                                                                                                                                                                                                                                                                                         |
| Nessun modo di generare "un solo documento per il gruppo" diverso da puntare alla parent + CDU espanso          | Aperta — architetturalmente non esiste un target "gruppo articolato" di prima classe in `DocumentGenerationService`; funziona solo perché i provider ora si espandono internamente quando il focus è la parent                                                                                                                                               |
| Fixture e2e: tutte le classi (comprese le due partner di `3C`) condividono lo stesso `INDIRIZZI` id (`IND_E2E`) | Aperta — non blocca la correttezza (ogni entità viene comunque taggata con l'indirizzo della propria classe di provenienza), ma rende la demo del nuovo documento meno leggibile: entrambi i gruppi mostrano lo stesso nome di indirizzo tra parentesi. Non affrontata in questo lavoro per non toccare il seeding condiviso da tutti gli altri scenari e2e. |
```

- [ ] **Step 2: Commit**

```bash
git add ARTICOLAZIONE.md
git commit -m "docs: add ARTICOLAZIONE.md report on articulated-class handling"
```

---

## Self-Review Notes

- **Spec coverage:** all four required bullet lists (Task 7's template), the CDU/provider extensions the design called for (Tasks 1-5), the new `CONF_DOC`/e2e scenario (Tasks 6-8), and the `ARTICOLAZIONE.md` report (Task 10) are each covered by a task. The two confirmed provider bugs from the design doc are fixed in Tasks 2-3.
- **Placeholder scan:** no `TBD`/`TODO` remain; Task 5's import block is the one place this plan explicitly tells the implementer to copy-verbatim from the existing file rather than guess, because this plan's author did not re-open that file's full import list — that is a deliberate, explicit instruction, not a placeholder.
- **Type consistency:** `AlunnoContestoVM.indirizzo`, `DocenteCdcVM.materieDescrizione`/`gruppoNome`, `CduClasse.consiglioDiClasseComune`/`Separato`, `CduClasse.rappresentanti.*.indirizzo`, `CduClasse.coordinatori[].indirizzo` are named identically everywhere they're produced (Tasks 1-5) and consumed (Task 7's template paths). `CONF_DOC_ARTICOLATA`/`docArticolata` are named identically across Tasks 6-8.
