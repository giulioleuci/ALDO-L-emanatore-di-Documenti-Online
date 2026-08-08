# Articulated CdC partner-scoping + MATERIE.PRINCIPALE/SPECIFICITA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two independent CDU-correctness bugs found in the online E2E suite: (1) `RIEPILOGHI_FIRME_CDC`/`CONF_DOC_ARTICOLATA` documents built for one partner of an articulated class currently leak the *other* partner's teachers into the roster; (2) `TeachingCouncilProjection.materiaVm()` resolves a specifica cattedra (e.g. `INTERPRET.CHITARRA`) down to its generic base subject instead of the composite catalog row, because `MATERIE` still requires a base row to exist for every family — this plan adds `MATERIE.PRINCIPALE`/`SPECIFICITA` columns and drops that requirement.

**Architecture:** Both fixes are surgical, localized changes in the existing Clean Architecture layering (domain entity → infrastructure repository → application context-engine provider/projection → E2E mock fixtures/checks). No new files, no new abstractions, no `GasLibraryFactory` involvement — both are confirmed SGSA-domain-specific (CDU shape, MATERIE catalog semantics) per the design docs' own "out of scope" sections.

**Tech Stack:** TypeScript (GAS V8 target), Jest (`ts-jest`) for unit tests, the project's online E2E harness (`src/onlinetests/`) for fixture-level checks.

## Global Constraints

- Target is GAS V8 — synchronous code only, no Node-only APIs.
- Never touch native GAS globals outside `GoogleApiWrapper`; these two fixes touch none.
- `SPECS_ALDO/01_SCHEMA_DATABASE.md` and `SPECS_ALDO/02_CDU_STRUTTURA.md` are sources of truth #1/#2 — schema and doc-comment updates in Task 4 must land in the same commit as the code that depends on them, not after.
- Run `npm run typecheck && npm run lint && npm test` before each commit; each task's own step list says exactly which subset to run first.
- Read a file with the Read tool before editing it (already done for every file below during planning — the implementer should still re-Read immediately before an Edit in case of drift).

---

## File Structure

**Spec 1 — partner scoping** (`docs/superpowers/specs/2026-08-08-articolata-cdc-partner-scoping-design.md`):
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts` — scope `consiglioDiClasse`/`consiglioDiClasseSeparato` to the target partner's own branch on partner-target builds.
- Modify: `test/unit/application/context-engine/consiglio-provider.test.ts` — new cases for direct partner-target builds.
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts` — second INDIRIZZI row for `3C-C`, coordinator fix.
- Modify: `src/onlinetests/checks/articolazioneChecks.ts` — new E2E check for parent-level comune/separato roster + partner cross-check.

**Spec 2 — MATERIE.PRINCIPALE/SPECIFICITA** (`docs/superpowers/specs/2026-08-08-materie-principale-specificita-schema-design.md`):
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (§MATERIE) — new columns + invariant rewrite.
- Modify: `SPECS_ALDO/MAT_NON_STANDARD.md` (§3) — mirror invariant rewrite.
- Modify: `src/config/schema.ts` (`COL_MATERIE`) — new `PRINCIPALE`/`SPECIFICITA` column constants.
- Modify: `src/domain/entities/Materia.ts` — new fields, computed `nome` fallback.
- Modify: `src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts` (`getMaterie()`) — distinct-base-id derivation.
- Modify: `src/infrastructure/repositories/ClasseRepository.ts` (constructor) — distinct-base-id derivation for `materieColumns`.
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts` (`materiaVm()`) — resolve composite row directly.
- Modify: `src/application/context-engine/mappers/materiePerPrincipaleMapper.ts` — read `nome` from `.principale`, not a dead base-row lookup.
- Modify: `src/application/services/DocumentBatchService.ts` (`generateDocentiMateria`) — composite `materiaId` target key.
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts` (`seedMaterie`) — drop bare `INTERPRET`/`LAB` rows, give specifica rows real `PRINCIPALE`/`SPECIFICITA`.
- Modify: various unit test files (see Task 6-8) + one new/extended E2E check.

---

### Task 1: `ConsiglioClasseProvider` partner-scoping fix

**Files:**
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts:47-57`
- Test: `test/unit/application/context-engine/consiglio-provider.test.ts`

**Interfaces:**
- Consumes: `IClasseRepository.isArticolata(classe)`, `.getArticolazione(classe): ArticolazioneConfig | null`, `.orderedPartners(classe): Classe[]` (all already injected as `this.classi` in the constructor); `ArticolazioneConfig.isParent(): boolean`.
- Produces: no change to public shape — `focusClasse.consiglioDiClasse`/`consiglioDiClasseComune`/`consiglioDiClasseSeparato` keep their existing `DocenteCdcVM[]` type; only *which* docenti end up in them changes for partner-target builds.

- [ ] **Step 1: Write the failing unit tests**

Add to `test/unit/application/context-engine/consiglio-provider.test.ts`, after the existing `'ConsiglioClasseProvider: non-articulated class has no comune/separato split'` test (uses the `1F`/`1F-LSO`/`1F-LSS` articulated fixture already exercised by the file's other tests — `rossi@school.it` teaches `MATE` in both partners (`COMUNE`), `bianchi@school.it` teaches `FISI` only in `1F-LSO` (`SEPARATO_PRIMO`), `verdi@school.it` teaches `FISI` only in `1F-LSS` (`SEPARATO_SECONDO`)):

```ts
test('ConsiglioClasseProvider: partner-target build scopes consiglio to comune + own branch only', () => {
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
    target: '1F-LSO',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = {
    providers: ['class', 'consiglio'],
    options: makeOptions({ gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI })
  };
  const focusClasse = b.build(params, recipe).focus.classe!;

  expect(focusClasse.consiglioDiClasse!.map((d) => d.anagrafica.email).sort()).toEqual([
    'bianchi@school.it',
    'rossi@school.it'
  ]);
  expect(focusClasse.consiglioDiClasseComune!.map((d) => d.anagrafica.email)).toEqual([
    'rossi@school.it'
  ]);
  expect(focusClasse.consiglioDiClasseSeparato!.map((d) => d.anagrafica.email)).toEqual([
    'bianchi@school.it'
  ]);
});

test('ConsiglioClasseProvider: the other partner target scopes to its own branch, not the sibling', () => {
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
    target: '1F-LSS',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = {
    providers: ['class', 'consiglio'],
    options: makeOptions({ gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI })
  };
  const focusClasse = b.build(params, recipe).focus.classe!;

  expect(focusClasse.consiglioDiClasse!.map((d) => d.anagrafica.email).sort()).toEqual([
    'rossi@school.it',
    'verdi@school.it'
  ]);
  expect(focusClasse.consiglioDiClasseComune!.map((d) => d.anagrafica.email)).toEqual([
    'rossi@school.it'
  ]);
  expect(focusClasse.consiglioDiClasseSeparato!.map((d) => d.anagrafica.email)).toEqual([
    'verdi@school.it'
  ]);
});

test('ConsiglioClasseProvider: parent-target build keeps the full comune/separato split unscoped', () => {
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

  expect(focusClasse.consiglioDiClasse!.map((d) => d.anagrafica.email).sort()).toEqual([
    'bianchi@school.it',
    'rossi@school.it',
    'verdi@school.it'
  ]);
  expect(
    focusClasse.consiglioDiClasseSeparato!.map((d) => d.anagrafica.email).sort()
  ).toEqual(['bianchi@school.it', 'verdi@school.it']);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts -t "partner-target"`
Expected: FAIL — both `1F-LSO`/`1F-LSS` cases currently return all 3 docenti in `consiglioDiClasse` (the unfiltered union), not 2.

- [ ] **Step 3: Implement the scoping fix**

Replace `src/application/context-engine/providers/ConsiglioClasseProvider.ts:47-57` (the `if (this.classi.isArticolata(classe))` block) with:

```ts
    if (this.classi.isArticolata(classe)) {
      const consiglio: DocenteCdcVM[] = focusClasse.consiglioDiClasse ?? [];
      const comune = consiglio.filter((docente) => docente.tipoArticolazione === 'COMUNE');
      const separato = consiglio.filter(
        (docente) =>
          docente.tipoArticolazione === 'SEPARATO_PRIMO' ||
          docente.tipoArticolazione === 'SEPARATO_SECONDO'
      );

      const config = this.classi.getArticolazione(classe);
      if (config !== null && !config.isParent()) {
        const partners = this.classi.orderedPartners(classe);
        const ownBranch = partners[0]?.id === classe.id ? 'SEPARATO_PRIMO' : 'SEPARATO_SECONDO';
        const ownSeparato = separato.filter((docente) => docente.tipoArticolazione === ownBranch);
        focusClasse.consiglioDiClasseSeparato = ownSeparato;
        focusClasse.consiglioDiClasse = [...comune, ...ownSeparato] as never;
      } else {
        focusClasse.consiglioDiClasseSeparato = separato;
      }
      focusClasse.consiglioDiClasseComune = comune;
    }
```

- [ ] **Step 4: Run all consiglio-provider tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: PASS — all tests, including the 3 new ones and the pre-existing parent-split/non-articulated tests (which must be unaffected, since `1F` is a parent target and `5A` isn't articulated).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/providers/ConsiglioClasseProvider.ts test/unit/application/context-engine/consiglio-provider.test.ts
git commit -m "fix: scope articulated CdC council to target partner's own branch"
```

---

### Task 2: E2E mock DB — second address + valid coordinators for the two `3C` partners

**Files:**
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts:340-393` (`classLayouts()`), `:395-402` (`seedIndirizzi()`)

**Interfaces:**
- Consumes: `COL_INDIRIZZI`, `COL_CLASSI` (already imported), `e2eDocenteEmail` (already defined in the same file).
- Produces: a new exported constant `INDIRIZZO_E2E_CLASSICO` (partner `3C-C`'s new indirizzo id), consumed by Task 3's E2E check.

- [ ] **Step 1: Add the second INDIRIZZI row**

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, add a new exported constant next to `INDIRIZZO_E2E` (line 73):

```ts
export const INDIRIZZO_E2E = 'IND_E2E';
export const INDIRIZZO_E2E_CLASSICO = 'IND_E2E_CLASSICO';
```

Then extend `seedIndirizzi()` (lines 395-402):

```ts
  private seedIndirizzi(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.INDIRIZZI, {
      [COL_INDIRIZZI.ID]: INDIRIZZO_E2E,
      [COL_INDIRIZZI.NOME]: 'Liceo Scientifico (E2E)',
      [COL_INDIRIZZI.NOME_SINTETICO]: 'SCI',
      [COL_INDIRIZZI.TIPO]: 'Liceo'
    });
    sample.appendRow(TABLE.INDIRIZZI, {
      [COL_INDIRIZZI.ID]: INDIRIZZO_E2E_CLASSICO,
      [COL_INDIRIZZI.NOME]: 'Liceo Classico (E2E)',
      [COL_INDIRIZZI.NOME_SINTETICO]: 'CLA',
      [COL_INDIRIZZI.TIPO]: 'Liceo'
    });
  }
```

- [ ] **Step 2: Point `3C-C`'s CLASSI row at the new indirizzo**

In `seedClassi()`, the per-layout `row` object currently sets `[COL_CLASSI.INDIRIZZO]: INDIRIZZO_E2E` unconditionally (line 500) for every layout, including `CLASSE_C_PARTNER`. Change it to branch on the layout id — replace line 500 with:

```ts
        [COL_CLASSI.INDIRIZZO]:
          layout.id === CLASSE_C_PARTNER ? INDIRIZZO_E2E_CLASSICO : INDIRIZZO_E2E,
```

Leave the `CLASSE_C_PARENT` row's own `appendRow` block (lines 478-495) untouched — it keeps `[COL_CLASSI.INDIRIZZO]: INDIRIZZO_E2E`, per the design doc's explicit call-out that no spec ties the parent row's own indirizzo to its partners'.

- [ ] **Step 3: Fix `3C-C`'s coordinator to an address-specific teacher**

In `classLayouts()` (lines 376-391), change the `CLASSE_C_PARTNER` entry's `coordIndex` from `4` to `7`:

```ts
      {
        id: CLASSE_C_PARTNER,
        count: 12,
        coordIndex: 7,
        articolazione: JSON.stringify({
          parent: CLASSE_C_PARENT,
          partner: CLASSE_C,
          partners: null
        }),
        studentRepCount: 1,
        parentRepCount: 2,
        religionExceptions: [
          { index: 0, scelta: ReligioneScelta.NO },
          { index: 1, scelta: ReligioneScelta.ALT }
        ]
      }
```

(`CLASSE_C`'s own `coordIndex: 3` at line 366 is unchanged — docente3 already teaches `ING` only in `3C-S`, per the design doc.)

- [ ] **Step 4: Run the existing unit test for this file to catch obvious breakage**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: PASS. If any assertion pins `3C-C`'s old coordinator (docente4) or its old indirizzo, update that assertion to match this task's new values — do not revert the fix to make the test pass.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/onlinetests/E2eSampleDatabaseBuilder.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "test: give 3C's articulated partners distinct addresses and valid coordinators"
```

---

### Task 3: New E2E check — parent-level shared vs. address-specific roster

**Files:**
- Modify: `src/onlinetests/checks/articolazioneChecks.ts` (append to `registerArticolazioneChecks`)

**Interfaces:**
- Consumes: `CLASSE_C_PARENT`, `CLASSE_C`, `CLASSE_C_PARTNER`, `INDIRIZZO_E2E`, `INDIRIZZO_E2E_CLASSICO` (new, from Task 2), `e2eDocenteEmail` — all from `E2eSampleDatabaseBuilder`; `classCdu()`, `ContextBuilder` — already local to this file.
- Produces: nothing consumed elsewhere — this is a leaf E2E check.

- [ ] **Step 1: Add the import for the new indirizzo constant**

In `src/onlinetests/checks/articolazioneChecks.ts`, extend the existing import block from `E2eSampleDatabaseBuilder` (lines 13-29) to include `INDIRIZZO_E2E_CLASSICO`:

```ts
import {
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARENT,
  CLASSE_C_PARTNER,
  CONF_DOC_ARTICOLATA,
  CONF_DOC_PIANI,
  CONF_DOC_RIEPILOGO,
  CONF_DOC_RIEPILOGO_FIRME_CDC,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_VERBALE,
  INDIRIZZO_E2E,
  INDIRIZZO_E2E_CLASSICO,
  PIANO_DOPPIO_STUDENTE,
  e2eDocenteEmail,
  type E2eSampleDatabase
} from '../E2eSampleDatabaseBuilder';
```

- [ ] **Step 2: Append the new check**

Add this `runner.add(...)` block right before the closing `}` of `registerArticolazioneChecks` (after the `'Articolazione CDU: piano duale renderizzato'` check, i.e. after line 339):

```ts
  runner.add(
    'Articolazione CDU: roster comune/separato per indirizzo, scoping parent vs partner',
    sample.sampleSpreadsheetUrl,
    () => {
      const contextBuilder = container.get<ContextBuilder>('contextBuilder');
      const parentCdu = classCdu(contextBuilder, CLASSE_C_PARENT);
      const parentClasse = parentCdu.focus.classe;
      const comune = parentClasse?.consiglioDiClasseComune ?? [];
      const separato = parentClasse?.consiglioDiClasseSeparato ?? [];
      const primo = separato.filter((docente) => docente.tipoArticolazione === 'SEPARATO_PRIMO');
      const secondo = separato.filter(
        (docente) => docente.tipoArticolazione === 'SEPARATO_SECONDO'
      );

      const comuneEmails = comune.map((docente) => docente.anagrafica.email).sort();
      const primoEmails = primo.map((docente) => docente.anagrafica.email).sort();
      const secondoEmails = secondo.map((docente) => docente.anagrafica.email).sort();

      if (
        JSON.stringify(comuneEmails) !== JSON.stringify([e2eDocenteEmail(1)]) ||
        JSON.stringify(primoEmails) !==
          JSON.stringify([e2eDocenteEmail(2), e2eDocenteEmail(3), e2eDocenteEmail(4)].sort()) ||
        JSON.stringify(secondoEmails) !==
          JSON.stringify([e2eDocenteEmail(6), e2eDocenteEmail(7), e2eDocenteEmail(8)].sort())
      ) {
        throw new ValidationError(
          `Roster comune/separato del parent ${CLASSE_C_PARENT} non coerente: comune=${comuneEmails.join(',')} primo=${primoEmails.join(',')} secondo=${secondoEmails.join(',')}`
        );
      }

      if (primo.some((docente) => docente.gruppoNome !== 'Liceo Scientifico (E2E)')) {
        throw new ValidationError(
          `Gruppo SEPARATO_PRIMO del parent ${CLASSE_C_PARENT} non risolve a ${INDIRIZZO_E2E} (Liceo Scientifico E2E).`
        );
      }
      if (secondo.some((docente) => docente.gruppoNome !== 'Liceo Classico (E2E)')) {
        throw new ValidationError(
          `Gruppo SEPARATO_SECONDO del parent ${CLASSE_C_PARENT} non risolve a ${INDIRIZZO_E2E_CLASSICO} (Liceo Classico E2E).`
        );
      }

      const primaryCdu = classCdu(contextBuilder, CLASSE_C);
      const primaryEmails = (primaryCdu.focus.classe?.consiglioDiClasse ?? [])
        .map((docente) => docente.anagrafica.email)
        .sort();
      const expectedPrimary = [
        e2eDocenteEmail(1),
        e2eDocenteEmail(2),
        e2eDocenteEmail(3),
        e2eDocenteEmail(4)
      ].sort();
      if (JSON.stringify(primaryEmails) !== JSON.stringify(expectedPrimary)) {
        throw new ValidationError(
          `${CLASSE_C} (partner target diretto) espone ${primaryEmails.length} docenti invece dei 4 attesi (comune + gruppo proprio): ${primaryEmails.join(',')}`
        );
      }

      const partnerCdu = classCdu(contextBuilder, CLASSE_C_PARTNER);
      const partnerEmails = (partnerCdu.focus.classe?.consiglioDiClasse ?? [])
        .map((docente) => docente.anagrafica.email)
        .sort();
      const expectedPartner = [
        e2eDocenteEmail(1),
        e2eDocenteEmail(6),
        e2eDocenteEmail(7),
        e2eDocenteEmail(8)
      ].sort();
      if (JSON.stringify(partnerEmails) !== JSON.stringify(expectedPartner)) {
        throw new ValidationError(
          `${CLASSE_C_PARTNER} (partner target diretto) espone ${partnerEmails.length} docenti invece dei 4 attesi (comune + gruppo proprio): ${partnerEmails.join(',')}`
        );
      }
    }
  );
```

- [ ] **Step 3: Typecheck and lint (this suite only runs live against GAS, so no local execution here)**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (This check itself is validated by running `npm run build:online` and its online push gate in Task 9's final verification step — it cannot run under plain `npm test`.)

- [ ] **Step 4: Commit**

```bash
git add src/onlinetests/checks/articolazioneChecks.ts
git commit -m "test: E2E check for parent-level comune/separato roster scoping by indirizzo"
```

---

### Task 4: `MATERIE.PRINCIPALE`/`SPECIFICITA` schema + `Materia` entity

**Files:**
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (§MATERIE column table + invariant)
- Modify: `SPECS_ALDO/MAT_NON_STANDARD.md` (§3)
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md` (lines 603-604, doc comment only)
- Modify: `src/config/schema.ts` (`COL_MATERIE`, currently lines 153-163)
- Modify: `src/domain/entities/Materia.ts`
- Test: `test/unit/domain/entities/materia.test.ts` (create if it doesn't exist; check first)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Materia.principale: string | null`, `Materia.specificita: string | null`, `Materia.nome: string` (now a fallback-aware getter instead of a plain field) — consumed directly by Task 6 (`TeachingCouncilProjection.materiaVm`) and Task 7 (`materiePerPrincipaleMapper`).

- [ ] **Step 1: Update the schema doc**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, find the MATERIE column table and add two rows (matching the existing table's column style — check the exact header names used by the existing table before inserting, e.g. `Colonna | Tipo | PK | Vincoli | Descrizione`):

```markdown
| `PRINCIPALE`  | String | — | — | Nome della materia principale/famiglia (es. `Interpretazione ed esecuzione`); vuoto per righe non specifiche |
| `SPECIFICITA` | String | — | — | Nome descrittivo della specificità (es. `Chitarra`); vuoto per righe non specifiche |
```

Immediately after the table (or wherever the existing "composite ID row must also exist as its own MATERIE row" invariant is currently documented), replace that invariant with:

```markdown
Una riga composita (`ID` nel formato `BASE.SPECIFICA`) DEVE avere `PRINCIPALE`
non vuoto: le famiglie che si diramano in specificità non sono mai
rappresentate da una riga bare della sola famiglia — ogni riga reale di tale
famiglia porta il proprio `PRINCIPALE`+`SPECIFICITA`. `NOME`, se vuoto, viene
ricostruito in lettura come `"${PRINCIPALE} (${SPECIFICITA})"` quando entrambi
sono presenti.
```

Search the file for the literal phrase describing the old invariant (something like "deve esistere anche come propria riga MATERIE") to find and remove/replace it precisely — do not leave both the old and new invariant text present.

- [ ] **Step 2: Update `SPECS_ALDO/MAT_NON_STANDARD.md` §3**

Find the restatement of the same invariant in §3 and apply the identical rewrite from Step 1.

- [ ] **Step 3: Update the CDU structure doc comment**

In `SPECS_ALDO/02_CDU_STRUTTURA.md` around lines 603-604 (`SubjectVM.principale`/`specificita`), keep the existing "solo per specificità X.Y" semantics wording but add a clause noting the source is now `MATERIE.PRINCIPALE`/`SPECIFICITA` directly, not a computed base-materia lookup.

- [ ] **Step 4: Add the new schema column constants**

In `src/config/schema.ts`, extend `COL_MATERIE` (currently):

```ts
export const COL_MATERIE = {
  ID: 'ID',
  NOME: 'NOME',
  SINTESI: 'SINTESI',
  COLORE_1: 'COLORE_1',
  COLORE_2: 'COLORE_2',
  SIMBOLO: 'SIMBOLO',
  ESAME_CFG: 'ESAME_CFG',
  EVOLUZIONE: 'EVOLUZIONE',
  IS_RELIGIONE_ALT: 'IS_RELIGIONE_ALT'
} as const;
```

to:

```ts
export const COL_MATERIE = {
  ID: 'ID',
  NOME: 'NOME',
  SINTESI: 'SINTESI',
  COLORE_1: 'COLORE_1',
  COLORE_2: 'COLORE_2',
  SIMBOLO: 'SIMBOLO',
  ESAME_CFG: 'ESAME_CFG',
  EVOLUZIONE: 'EVOLUZIONE',
  IS_RELIGIONE_ALT: 'IS_RELIGIONE_ALT',
  PRINCIPALE: 'PRINCIPALE',
  SPECIFICITA: 'SPECIFICITA'
} as const;
```

- [ ] **Step 5: Write the failing unit test for `Materia`**

Check whether `test/unit/domain/entities/materia.test.ts` already exists (`ls test/unit/domain/entities/ | grep -i materia`). If it exists, add these cases to it; otherwise create it following the sibling entity test files' import style (check e.g. `test/unit/domain/entities/` for an existing simple entity test to mirror setup). Add:

```ts
import { Materia } from '../../../../src/domain/entities/Materia';
import { COL_MATERIE } from '../../../../src/config/schema';

test('Materia.nome reconstructs "PRINCIPALE (SPECIFICITA)" when NOME is blank and both are present', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'INTERPRET.CHITARRA',
    [COL_MATERIE.NOME]: '',
    [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
    [COL_MATERIE.SPECIFICITA]: 'Chitarra'
  });
  expect(materia.nome).toBe('Interpretazione ed esecuzione (Chitarra)');
  expect(materia.principale).toBe('Interpretazione ed esecuzione');
  expect(materia.specificita).toBe('Chitarra');
});

test('Materia.nome keeps the explicit NOME cell when non-blank, even with PRINCIPALE/SPECIFICITA set', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'INTERPRET.FLAUTO',
    [COL_MATERIE.NOME]: 'Interpretazione (flauto dolce)',
    [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
    [COL_MATERIE.SPECIFICITA]: 'Flauto'
  });
  expect(materia.nome).toBe('Interpretazione (flauto dolce)');
});

test('Materia.nome behaves as a plain field for non-specific rows (no PRINCIPALE/SPECIFICITA)', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'MAT',
    [COL_MATERIE.NOME]: 'Matematica'
  });
  expect(materia.nome).toBe('Matematica');
  expect(materia.principale).toBeNull();
  expect(materia.specificita).toBeNull();
});

test('Materia.toData() round-trips the raw NOME cell, not the computed fallback', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'INTERPRET.CHITARRA',
    [COL_MATERIE.NOME]: '',
    [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
    [COL_MATERIE.SPECIFICITA]: 'Chitarra'
  });
  const data = materia.toData();
  expect(data[COL_MATERIE.NOME]).toBe('');
  expect(data[COL_MATERIE.PRINCIPALE]).toBe('Interpretazione ed esecuzione');
  expect(data[COL_MATERIE.SPECIFICITA]).toBe('Chitarra');
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities/materia.test.ts`
Expected: FAIL — `Materia` has no `principale`/`specificita` fields yet, `MateriaData` doesn't type `PRINCIPALE`/`SPECIFICITA`, and `nome` doesn't do fallback reconstruction.

- [ ] **Step 7: Implement the `Materia` entity change**

Replace `src/domain/entities/Materia.ts` in full with:

```ts
import { MateriaId } from '../value-objects/MateriaId';
import { EsameConfig } from '../value-objects/EsameConfig';
import { COL_MATERIE } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface MateriaData {
  [COL_MATERIE.ID]?: string;
  [COL_MATERIE.NOME]?: string;
  [COL_MATERIE.SINTESI]?: string;
  [COL_MATERIE.COLORE_1]?: string;
  [COL_MATERIE.COLORE_2]?: string;
  [COL_MATERIE.SIMBOLO]?: string;
  [COL_MATERIE.ESAME_CFG]?: string | null;
  [COL_MATERIE.EVOLUZIONE]?: string | null;
  [COL_MATERIE.IS_RELIGIONE_ALT]?: boolean;
  [COL_MATERIE.PRINCIPALE]?: string;
  [COL_MATERIE.SPECIFICITA]?: string;
  [key: string]: unknown;
}

/** Default border colour when a MATERIA has no COLORE_1 (ref 11 §11). */
const DEFAULT_COLORE_1 = '#ddd';

/** MATERIE entity (PK = ID). Subject-catalogue lookup (ref 01, 04). */
export class Materia extends AldoEntity {
  public readonly sintesi: string;
  public readonly colore1: string;
  public readonly colore2: string;
  public readonly simbolo: string;
  public readonly isReligioneAlt: boolean;
  public readonly principale: string | null;
  public readonly specificita: string | null;
  private readonly rawNome: string;
  private readonly esameCfgRaw: string | null;
  private readonly evoluzioneRaw: string | null;

  constructor(data: MateriaData = {}) {
    super(data);
    this.id = data[COL_MATERIE.ID] ?? null;
    this.rawNome = data[COL_MATERIE.NOME] ?? '';
    this.sintesi = data[COL_MATERIE.SINTESI] ?? '';
    const c1 = data[COL_MATERIE.COLORE_1];
    this.colore1 = typeof c1 === 'string' && c1.trim() !== '' ? c1 : DEFAULT_COLORE_1;
    const c2 = data[COL_MATERIE.COLORE_2];
    this.colore2 = typeof c2 === 'string' ? c2 : '';
    const sym = data[COL_MATERIE.SIMBOLO];
    this.simbolo = typeof sym === 'string' ? sym : '';
    this.isReligioneAlt = data[COL_MATERIE.IS_RELIGIONE_ALT] === true;
    const principale = data[COL_MATERIE.PRINCIPALE];
    this.principale = typeof principale === 'string' && principale !== '' ? principale : null;
    const specificita = data[COL_MATERIE.SPECIFICITA];
    this.specificita = typeof specificita === 'string' && specificita !== '' ? specificita : null;
    const raw = data[COL_MATERIE.ESAME_CFG];
    this.esameCfgRaw = typeof raw === 'string' ? raw : null;
    const evo = data[COL_MATERIE.EVOLUZIONE];
    this.evoluzioneRaw = typeof evo === 'string' ? evo : null;
  }

  /** Raw `NOME` cell if set; else `"PRINCIPALE (SPECIFICITA)"` when both are present; else empty. */
  get nome(): string {
    if (this.rawNome !== '') return this.rawNome;
    if (this.principale !== null && this.specificita !== null) {
      return `${this.principale} (${this.specificita})`;
    }
    return '';
  }

  get materiaId(): MateriaId {
    return MateriaId.of(this.id ?? '');
  }

  get esameConfig(): EsameConfig | null {
    return EsameConfig.fromJson(this.esameCfgRaw);
  }

  /**
   * MATERIE.EVOLUZIONE (13 §8): `{ "<SIGLA>": number[] }` mapping each historical
   * sigla to the course years it applied to (e.g. `{"GST":[1,2],"STO":[3,4,5]}`).
   * Empty when absent. Used to reconcile shortfall sigle across school years.
   */
  getEvoluzione(): Record<string, number[]> {
    if (this.evoluzioneRaw === null || this.evoluzioneRaw.trim() === '') return {};
    const parsed = JSON.parse(this.evoluzioneRaw) as Record<string, unknown>;
    const out: Record<string, number[]> = {};
    for (const [sigla, anni] of Object.entries(parsed)) {
      if (Array.isArray(anni)) out[sigla] = anni.filter((n): n is number => typeof n === 'number');
    }
    return out;
  }

  override toData(): EntityData {
    return {
      [COL_MATERIE.ID]: this.id,
      [COL_MATERIE.NOME]: this.rawNome,
      [COL_MATERIE.SINTESI]: this.sintesi,
      [COL_MATERIE.COLORE_1]: this.colore1,
      [COL_MATERIE.COLORE_2]: this.colore2,
      [COL_MATERIE.SIMBOLO]: this.simbolo,
      [COL_MATERIE.ESAME_CFG]: this.esameCfgRaw,
      [COL_MATERIE.EVOLUZIONE]: this.evoluzioneRaw,
      [COL_MATERIE.IS_RELIGIONE_ALT]: this.isReligioneAlt,
      [COL_MATERIE.PRINCIPALE]: this.principale ?? '',
      [COL_MATERIE.SPECIFICITA]: this.specificita ?? ''
    };
  }

  static fromData(data: MateriaData): Materia {
    return new Materia(data);
  }
}
```

Note: `nome` moves from a `public readonly` field to a getter — grep the codebase for any code that assigns to `materia.nome` (should be none, entities are read-only view objects here) before proceeding; if any exists, stop and flag it rather than silently breaking it.

Run: `grep -rn "\.nome\s*=" src/ --include="*.ts" | grep -i materia` to confirm no assignment sites exist.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities/materia.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. If `nome` becoming a getter breaks any other file that relied on it being a plain assignable field, fix that call site as part of this task (not a separate one — it's a direct consequence of this entity change).

- [ ] **Step 10: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/MAT_NON_STANDARD.md SPECS_ALDO/02_CDU_STRUTTURA.md src/config/schema.ts src/domain/entities/Materia.ts test/unit/domain/entities/materia.test.ts
git commit -m "feat: add MATERIE.PRINCIPALE/SPECIFICITA columns, drop base-row invariant"
```

---

### Task 5: distinct-base-id derivation in `AldoTeachingResolutionConfig.getMaterie()` and `ClasseRepository`

**Files:**
- Modify: `src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts:261-276` (`getMaterie()`)
- Modify: `src/infrastructure/repositories/ClasseRepository.ts:55-73` (constructor)
- Test: `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts`
- Test: find and extend the existing `ClasseRepository` unit test file (`test/unit/infrastructure/*classe-repository*` or similar — locate with `find test/unit -iname "*classe-repository*"`).

**Interfaces:**
- Consumes: `Materia`/`MateriaId` shape unchanged; reads `COL_MATERIE.ID` and (for `getMaterie()`) `COL_MATERIE.IS_RELIGIONE_ALT` directly off raw rows (both files iterate raw sheet rows, not `Materia` entities, so Task 4's entity change doesn't directly affect them).
- Produces: `getMaterie(): Array<{ materia: MateriaId; isReligioneAlt: boolean }>` — same return shape, now includes base ids that have zero bare rows (e.g. `INTERPRET` once its bare row is removed in Task 8). `ClasseRepository`'s private `materieColumns: Map<string, MateriaColumns>` — same shape, same guarantee (an anchor entry per distinct base id).

- [ ] **Step 1: Write the failing test for `getMaterie()`**

Read `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts` first to find its fixture-table setup pattern (which `fixtureTables()`/`FakeDatabase` combination it uses and whether `getMaterie()` is already tested). Add a test asserting a family with zero bare rows still yields one entry:

```ts
test('getMaterie() derives distinct base ids even when a family has no bare MATERIE row', () => {
  const tables = fixtureTables();
  // Remove any existing bare row for a base id, leaving only dotted specifica rows,
  // to prove getMaterie() doesn't require one.
  tables.MATERIE = (tables.MATERIE ?? []).filter((row) => row.ID !== 'MATE');
  tables.MATERIE!.push(
    { ID: 'MATE.AVANZATO', NOME: 'Matematica (Avanzato)', IS_RELIGIONE_ALT: false },
    { ID: 'MATE.BASE', NOME: 'Matematica (Base)', IS_RELIGIONE_ALT: false }
  );
  const db = new FakeDatabase(tables);
  const config = new AldoTeachingResolutionConfig(db);
  const materie = config.getMaterie();
  expect(materie.some((entry) => entry.materia.value === 'MATE')).toBe(true);
  expect(materie.some((entry) => entry.materia.value === 'MATE.AVANZATO')).toBe(false);
});
```

Adjust the fixture table field names/imports to match whatever `fixtureTables()`/`FakeDatabase` already use elsewhere in that test file (copy the existing import block verbatim rather than guessing).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts -t "distinct base ids"`
Expected: FAIL — today's `getMaterie()` skips every dotted row and never derives `MATE` from `MATE.AVANZATO`/`MATE.BASE`, so with no bare `MATE` row left, `MATE` disappears entirely.

- [ ] **Step 3: Implement `getMaterie()`'s distinct-base-id derivation**

Replace `getMaterie()` in `src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts:261-276`:

```ts
  getMaterie(): Array<{ materia: MateriaId; isReligioneAlt: boolean }> {
    const baseIds = new Map<string, boolean>();
    for (const row of this.database.tables[TABLE.MATERIE]!.getAllRows()) {
      const id = row[COL_MATERIE.ID];
      if (typeof id !== 'string' || id === '') continue;
      const dot = id.indexOf('.');
      const baseId = dot === -1 ? id : id.slice(0, dot);
      if (!baseIds.has(baseId)) baseIds.set(baseId, false);
      // isReligioneAlt comes from the bare row's own flag when one exists for
      // this base id; specifica rows never carry it (IRC/ALT have no specifics).
      if (dot === -1 && row[COL_MATERIE.IS_RELIGIONE_ALT] === true) {
        baseIds.set(baseId, true);
      }
    }
    return Array.from(baseIds.entries()).map(([id, isReligioneAlt]) => ({
      materia: MateriaId.of(id),
      isReligioneAlt
    }));
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts`
Expected: PASS, including all pre-existing tests in that file (they must still pass — `getMaterie()`'s output for families that DO have a bare row is unchanged).

- [ ] **Step 5: Write the failing test for `ClasseRepository`'s `materieColumns`**

First run `find "/home/giulio/Desktop/ALDO implementing/test/unit" -iname "*classe-repository*"` to locate the existing test file, then read it to find how `materieColumns`/`getTeachingSlots()` is exercised today (it's private, so it's likely tested indirectly through `getTeachingSlots()`). Add a test in that file:

```ts
test('getTeachingSlots() still resolves a specifica column when the family has no bare MATERIE row', () => {
  const tables = fixtureTables();
  tables.MATERIE = (tables.MATERIE ?? []).filter((row) => row.ID !== 'MATE');
  tables.MATERIE!.push({ ID: 'MATE.AVANZATO', NOME: 'Matematica (Avanzato)' });
  // Adjust to whichever CLASSI row/column this suite already uses for a specifica slot,
  // mirroring the existing INTERPRET.CHITARRA-style test if one is present in this file.
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const classe = classi.findById('<existing fixture classe id with a MATE.AVANZATO-style column>')!;
  const slots = classi.getTeachingSlots(classe);
  expect(slots.some((slot) => slot.materia.value === 'MATE' && slot.specifica === 'AVANZATO')).toBe(
    true
  );
});
```

Fill in the placeholder classe id/column with whatever the existing test file's fixtures actually provide — do not invent a new CLASSI row unless the file's existing fixtures have no specifica column to reuse, in which case add one CLASSI column consistent with the file's existing fixture-mutation style (as done above for MATERIE).

- [ ] **Step 6: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs <path to the ClasseRepository test file> -t "no bare MATERIE row"`
Expected: FAIL — today's constructor only registers `materieColumns` for non-dotted ids, so with `MATE`'s bare row gone, there's no anchor entry and `getTeachingSlots()` can't prefix-scan for `MATE.AVANZATO`.

- [ ] **Step 7: Implement the constructor's distinct-base-id derivation**

Replace the `materieColumns`/`materieIds` construction loop in `src/infrastructure/repositories/ClasseRepository.ts:62-72`:

```ts
    for (const row of database.tables[TABLE.MATERIE]!.getAllRows()) {
      const id = row[COL_MATERIE.ID];
      if (typeof id !== 'string' || id.length === 0) continue;
      this.materieIds.add(id);
      const dot = id.indexOf('.');
      const baseId = dot === -1 ? id : id.slice(0, dot);
      if (!this.materieColumns.has(baseId)) {
        this.materieColumns.set(baseId, { main: baseId, itp: `${baseId}.itp` });
      }
    }
```

This still adds every raw `id` (dotted or not) to `materieIds` unconditionally, so `getTeachingSlots()`'s existing `materieIds.has(column)` composite-row check needs no change (per the design doc).

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs <path to the ClasseRepository test file>`
Expected: PASS, all tests in the file.

- [ ] **Step 9: Full unit suite, typecheck, lint**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green. This is the widest blast-radius change in the plan (touches base-subject enumeration used across role resolution) — do not proceed to Task 6 until this is fully green.

- [ ] **Step 10: Commit**

```bash
git add src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts src/infrastructure/repositories/ClasseRepository.ts test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts
git commit -m "fix: derive distinct base subject ids even when a family has no bare MATERIE row"
```

(Adjust the `git add` to also include whichever `ClasseRepository` test file path Step 5 actually edited.)

---

### Task 6: `TeachingCouncilProjection.materiaVm()` resolves the composite row

**Files:**
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts:215-227`
- Test: `test/unit/application/context-engine/consiglio-provider.test.ts` (or a dedicated `TeachingCouncilProjection` unit test file if one already exists — check `find test/unit -iname "*teaching-council*"` first)

**Interfaces:**
- Consumes: `IMateriaRepository.findByIdCached(id)`, `.findSpecifiche(baseId): Materia[]` (both already on the interface, per `src/domain/repositories/IMateriaRepository.ts`); `Materia.principale`/`specificita` (new, from Task 4).
- Produces: `SubjectVM` with `sigla`/`nome`/`nomeSintetico` from the **composite** row for specifica assignments — consumed downstream by `focus.classe.consiglioDiClasse`, `materieDescrizione`, `materieSigle`, `focus.classe.materie` (`MaterieClasseProvider.buildCatalog`, unchanged).

- [ ] **Step 1: Write the failing test**

Read `test/fixtures/tables.ts` first to find (or add) a docente whose only cattedra in some class is a specifica assignment with no bare-materia counterpart — the design doc references `1A`'s `INTERPRET.CHITARRA`/docente5 case from the E2E fixture, but for a fast unit test, extend the Jest fixture instead. Check whether `fixtureTables()` already has a `LAB.GRUPPO_A`-style specifica CLASSI column with a matching `MATERIE` row (used by the existing `'Articolazione CDU: supplenza...'`-style tests) and reuse that shape. Add to `test/unit/application/context-engine/consiglio-provider.test.ts`:

```ts
test('materiaVm resolves the composite specifica row directly, not the base subject', () => {
  const tables = fixtureTables();
  tables.MATERIE!.push({
    ID: 'MATE.AVANZATO',
    NOME: '',
    PRINCIPALE: 'Matematica',
    SPECIFICITA: 'Avanzato',
    SINTESI: 'Mat. Avanzata'
  });
  // Reuse '5A''s existing MATE cattedra column, retargeted to the specifica id —
  // adjust to whichever CLASSI column-naming convention getTeachingSlots() expects
  // for a specifica slot (mirror the file's existing INF.itp/LAB.GRUPPO_A pattern).
  const classe5A = tables.CLASSI!.find((r) => r.ID === '5A')!;
  classe5A['MATE.AVANZATO'] = 'bianchi@school.it';

  const list = cdc('5A', new Date('2026-07-01T09:00:00Z'), tables, GestioneSupplenti.SOLO_TITOLARI);
  const bianchi = byEmail(list, 'bianchi@school.it');
  const specifica = bianchi.materie.find((m) => m.specificita === 'Avanzato');
  expect(specifica).toMatchObject({
    sigla: 'MATE.AVANZATO',
    nome: 'Matematica (Avanzato)',
    principale: 'Matematica',
    specificita: 'Avanzato'
  });
});
```

Before writing this, actually inspect `test/fixtures/tables.ts`'s CLASSI/MATERIE rows to confirm `5A`/`bianchi@school.it` don't already collide with this setup, and adjust ids/emails to fixture-accurate ones.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts -t "resolves the composite specifica row"`
Expected: FAIL — today's `materiaVm()` calls `materie.findByIdCached(MateriaId.of(assignment.slot.materia))`, i.e. looks up `MATE`, not `MATE.AVANZATO`.

- [ ] **Step 3: Implement the fix**

Replace `materiaVm()` in `src/application/context-engine/TeachingCouncilProjection.ts:215-227`:

```ts
function materiaVm(
  materie: IMateriaRepository,
  classe: Classe,
  assignment: FlattenedProjectionAssignment
): SubjectVM | null {
  const baseId = MateriaId.of(assignment.slot.materia);
  const specifica = assignment.slot.specifica;
  const materia =
    specifica === null
      ? materie.findByIdCached(baseId)
      : (materie.findSpecifiche(baseId).find((m) => m.id === `${baseId.value}.${specifica}`) ??
        null);
  if (materia === null) return null;
  return buildSubjectVm(materia, {
    indirizzo: IndirizzoId.of(classe.indirizzo),
    isITP: assignment.slot.kind === 'ITP',
    principale: materia.principale,
    specificita: materia.specificita
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: PASS, all tests in the file (including the pre-existing `LAB.SEMINARIO_POMERIDIANO` supplente test, which exercises a different specifica path and must be unaffected).

- [ ] **Step 5: Typecheck, lint, full unit suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/TeachingCouncilProjection.ts test/unit/application/context-engine/consiglio-provider.test.ts
git commit -m "fix: resolve specifica cattedre to their composite MATERIE row, not the base subject"
```

---

### Task 7: `materiePerPrincipaleMapper` reads `nome` from `.principale`

**Files:**
- Modify: `src/application/context-engine/mappers/materiePerPrincipaleMapper.ts:33-38`
- Test: locate with `find test/unit -iname "*materie-per-principale*"` (or wherever this mapper's existing tests live — check `test/unit/application/context-engine/mappers/`)

**Interfaces:**
- Consumes: `SubjectVM.principale` (already produced by Task 6's `buildSubjectVm` call), `SubjectVM.sigla`/`nome`.
- Produces: `MateriaPerPrincipaleVM.nome` — same shape, now sourced correctly once base rows are optional.

- [ ] **Step 1: Write the failing test**

Read the existing test file for this mapper first to match its `SubjectVM` fixture-building helper. Add:

```ts
test('buildMateriePerPrincipale reads the composite group name from .principale, not a base-row lookup', () => {
  const materie: SubjectVM[] = [
    {
      sigla: 'INTERPRET.CHITARRA',
      nome: 'Interpretazione ed esecuzione (Chitarra)',
      nomeSintetico: 'Interpretazione ed esecuzione (Chitarra)',
      colore1: '#1565C0',
      colore2: '#90CAF9',
      isMateriaPrimaProva: false,
      isMateriaSecondaProva: false,
      principale: 'Interpretazione ed esecuzione',
      specificita: 'Chitarra',
      isITP: false,
      evoluzione: null
    }
  ];
  // materiaRepo.findByIdCached('INTERPRET') now correctly returns null since the
  // bare row no longer exists — the mapper must not depend on it.
  const materiaRepo = { findByIdCached: () => null } as unknown as IMateriaRepository;
  const groups = buildMateriePerPrincipale(materie, materiaRepo);
  expect(groups).toEqual([
    {
      idFittizio: 'INTERPRET',
      nome: 'Interpretazione ed esecuzione',
      materie
    }
  ]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs <this mapper's test file path> -t "reads the composite group name"`
Expected: FAIL — today's code does `materiaRepo.findByIdCached(MateriaId.of(idFittizio))?.nome ?? idFittizio`, which with a stubbed-`null` repo returns the raw id `'INTERPRET'`, not `'Interpretazione ed esecuzione'`.

- [ ] **Step 3: Implement the fix**

Replace `src/application/context-engine/mappers/materiePerPrincipaleMapper.ts:33-38`:

```ts
  return Array.from(byBase.entries()).map(([idFittizio, group]) => {
    const isComposite = group.length > 1 || group[0]!.sigla !== idFittizio;
    const nome = isComposite ? (group[0]!.principale ?? idFittizio) : group[0]!.nome;
    return { idFittizio, nome, materie: group };
  });
```

The `materiaRepo: IMateriaRepository` parameter of `buildMateriePerPrincipale` becomes unused by this function body — check its call site(s) with `grep -rn "buildMateriePerPrincipale(" src/` before deciding whether to drop the parameter entirely or keep it for signature stability; if no other logic in the function needs it, remove the parameter and update the one call site plus the function's own signature/JSDoc together in this same step (don't leave a dead parameter).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs <this mapper's test file path>`
Expected: PASS, including any pre-existing tests for the plain (non-composite) group case.

- [ ] **Step 5: Typecheck, lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors (this step will catch any leftover call site if the parameter was dropped).

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/mappers/materiePerPrincipaleMapper.ts
git commit -m "fix: materiePerPrincipaleMapper reads group name from SubjectVM.principale"
```

(Add the test file path and any updated call-site file to the `git add` list.)

---

### Task 8: `DocumentBatchService.generateDocentiMateria` composite `materiaId`

**Files:**
- Modify: `src/application/services/DocumentBatchService.ts:255-265`
- Test: locate with `find test/unit -iname "*document-batch-service*"`

**Interfaces:**
- Consumes: `assignment.slot.materia.value`, `assignment.slot.specifica` (both already available on `TeachingAssignment` per the existing loop).
- Produces: `DocenteMateriaBatchTarget.materiaId` — for a specifica assignment, now `"<BASE>.<SPECIFICA>"` instead of `"<BASE>"`; matched downstream by `DocenteMateriaFocusProvider`'s `materie.find(sigla === ...)` (out of scope for this task per the design doc — no change needed there since `materie[].sigla` already reflects the composite id after Task 6).

- [ ] **Step 1: Write the failing tests**

Read the existing `DocumentBatchService` test file first to find its fixture/mock setup for `generateDocentiMateria` (how `resolveConsiglio` is stubbed). Add two cases:

```ts
test('generateDocentiMateria targets the composite materiaId for a specifica cattedra', () => {
  // Stub resolveConsiglio to return one assignment with slot.specifica set, mirroring
  // this file's existing stubbing pattern for the plain (non-specifica) case.
  // ... (fill in using the file's existing helper, e.g. makeAssignment({ materia: 'INTERPRET', specifica: 'CHITARRA', ... }))
  const targets = /* drive generateDocentiMateria via its existing public entry point in this file */;
  expect(targets).toContainEqual(
    expect.objectContaining({ materiaId: 'INTERPRET.CHITARRA' })
  );
});

test('generateDocentiMateria produces two separate targets for a docente holding two specifics of the same family', () => {
  // Two assignments for the same (classe, docente), same base materia, different specifica.
  const targets = /* same harness, two assignments: INTERPRET.CHITARRA and INTERPRET.FLAUTO */;
  const materiaIds = targets
    .filter((t) => t.docenteEmail === '<the stubbed docente email>')
    .map((t) => t.materiaId)
    .sort();
  expect(materiaIds).toEqual(['INTERPRET.CHITARRA', 'INTERPRET.FLAUTO']);
});
```

Fill in the assignment-construction and target-extraction calls using this test file's own existing helpers/mocks (e.g. however it currently invokes `generateDocentiMateria` and inspects `resume.docenteMateriaTargets` or the yielded checkpoint) — do not invent a new test harness; mirror the file's established pattern for the pre-existing "one document per (docente, materia)" test if one exists.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs <DocumentBatchService test file path> -t "composite materiaId"`
Expected: FAIL — today's target has `materiaId: assignment.slot.materia.value` = `'INTERPRET'` for both cases, and the two-specifics case currently dedupes to one target (`seen` key is `classeId:materiaId:docenteEmail` = same key for both).

- [ ] **Step 3: Implement the fix**

In `src/application/services/DocumentBatchService.ts`, inside the `for (const assignment of assignments)` loop (around line 255-265), change:

```ts
        for (const assignment of assignments) {
          const classeId = classe.id ?? '';
          const docenteEmail = assignment.docenteEffettivo.email.value;
          const materiaId = assignment.slot.materia.value;
          const key = `${classeId}:${materiaId}:${docenteEmail}`;
```

to:

```ts
        for (const assignment of assignments) {
          const classeId = classe.id ?? '';
          const docenteEmail = assignment.docenteEffettivo.email.value;
          const materiaId =
            assignment.slot.specifica === null
              ? assignment.slot.materia.value
              : `${assignment.slot.materia.value}.${assignment.slot.specifica}`;
          const key = `${classeId}:${materiaId}:${docenteEmail}`;
```

The rest of the loop body (`seen`/`targets.push`) is unchanged — the `key` now naturally differs per specifica, so the two-specifics case stops deduping without touching the dedup logic itself.

Also update the existing inline comment above this loop (lines ~222-228, the one explaining "Slots differing only by kind/specifica collapse to a single target here by design") — this design intentionally changes for specifica (not kind); replace that comment to reflect the new behavior per the design doc's explicit callout, e.g.:

```ts
      // DocenteMateriaBatchTarget is (classe, docenteEmail, materiaId), where
      // materiaId is specifica-qualified (BASE.SPECIFICA) when the slot has a
      // specifica — mirroring SheetMaterieGeneratorStrategy.catalogId(). A
      // docente teaching two specifics of the same family (e.g. INTERPRET.CHITARRA
      // and INTERPRET.FLAUTO) now gets two separate targets, one per composite id.
      // Slots differing only by *kind* (STANDARD vs ITP on the same materiaId)
      // still collapse to one target here by design — extending the batch axis
      // to carry kind is out of scope; dedup keeps the first match, mirroring
      // DocenteMateriaFocusProvider's own first-match `materie.find` semantics.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs <DocumentBatchService test file path>`
Expected: PASS, all tests in the file, including any pre-existing ITP-kind-collapse test (must still dedupe on kind alone).

- [ ] **Step 5: Typecheck, lint, full unit suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/application/services/DocumentBatchService.ts <DocumentBatchService test file path>
git commit -m "feat: qualify DOCUMENTO_DOCENTE_MATERIA batch targets by composite materiaId"
```

---

### Task 9: E2E mock DB — `seedMaterie` real PRINCIPALE/SPECIFICITA + new E2E check + full verification

**Files:**
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts:413-451` (`seedMaterie()`)
- Modify: `src/onlinetests/checks/articolazioneChecks.ts` (extend, or add alongside, Task 3's check)

**Interfaces:**
- Consumes: `COL_MATERIE.PRINCIPALE`/`SPECIFICITA` (Task 4), `MateriaId`.
- Produces: nothing consumed elsewhere — leaf mock-data + E2E check.

- [ ] **Step 1: Remove the bare `INTERPRET`/`LAB` rows and give specifica rows real values**

In `src/onlinetests/E2eSampleDatabaseBuilder.ts`, `ASSIGNMENT_MATERIE_E2E` (line 42-49) currently includes `'INTERPRET'` and `'LAB'` as plain-row entries seeded by the first `forEach` in `seedMaterie()`. Per the design, these two no longer get bare rows. Change `ASSIGNMENT_MATERIE_E2E`:

```ts
export const ASSIGNMENT_MATERIE_E2E = [...MATERIE_E2E, 'INF', 'IRC', 'ALT'] as const;
```

(dropping `'INTERPRET'` and `'LAB'` from the plain-row list; `'INF'` stays since it has no specifica-only family — only its `.itp` column exists, which isn't a `SPECIFICA_MATERIE_E2E` entry).

Then replace the `SPECIFICA_MATERIE_E2E.forEach(...)` block (lines 438-450) with real per-row `PRINCIPALE`/`SPECIFICITA` values, leaving one row with a blank `NOME` (fallback path) and one with an explicit `NOME` override (non-fallback path):

```ts
  private seedMaterie(sample: ISampleSpreadsheet): void {
    const nomi: Record<string, string> = {
      MAT: 'Matematica',
      ITA: 'Italiano',
      ING: 'Inglese',
      STO: 'Storia',
      INF: 'Informatica',
      IRC: 'Religione cattolica',
      ALT: 'Attività alternativa'
    };
    ASSIGNMENT_MATERIE_E2E.forEach((sigla) => {
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: sigla,
        [COL_MATERIE.NOME]: nomi[sigla],
        [COL_MATERIE.SINTESI]: nomi[sigla],
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: sigla.charAt(0),
        [COL_MATERIE.ESAME_CFG]: ESAME_CFG_E2E[sigla] ?? '',
        [COL_MATERIE.EVOLUZIONE]: '',
        [COL_MATERIE.IS_RELIGIONE_ALT]: sigla === 'IRC' || sigla === 'ALT'
      });
    });
    const specifiche: Record<
      string,
      { principale: string; specificita: string; nome: string; sintesi: string }
    > = {
      'LAB.GRUPPO_A': {
        principale: 'Laboratorio',
        specificita: 'Gruppo A',
        nome: '',
        sintesi: 'Lab. Gruppo A'
      },
      'LAB.SEMINARIO_POMERIDIANO': {
        principale: 'Laboratorio',
        specificita: 'Seminario pomeridiano',
        nome: '',
        sintesi: 'Lab. Seminario'
      },
      'INTERPRET.CHITARRA': {
        principale: 'Interpretazione ed esecuzione',
        specificita: 'Chitarra',
        nome: '',
        sintesi: 'Interpretazione (Chitarra)'
      },
      'INTERPRET.FLAUTO': {
        principale: 'Interpretazione ed esecuzione',
        specificita: 'Flauto',
        nome: 'Interpretazione ed esecuzione — indirizzo flauto',
        sintesi: 'Interpretazione (Flauto)'
      }
    };
    SPECIFICA_MATERIE_E2E.forEach((id) => {
      const spec = specifiche[id]!;
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: id,
        [COL_MATERIE.NOME]: spec.nome,
        [COL_MATERIE.SINTESI]: spec.sintesi,
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: id.charAt(0),
        [COL_MATERIE.ESAME_CFG]: '',
        [COL_MATERIE.EVOLUZIONE]: '',
        [COL_MATERIE.IS_RELIGIONE_ALT]: false,
        [COL_MATERIE.PRINCIPALE]: spec.principale,
        [COL_MATERIE.SPECIFICITA]: spec.specificita
      });
    });
  }
```

- [ ] **Step 2: Run the existing E2eSampleDatabaseBuilder unit test**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts`
Expected: PASS. If it asserts a bare `INTERPRET`/`LAB` MATERIE row exists, update that assertion to match the new shape (this is the intended, documented behavior change — not a regression).

- [ ] **Step 3: Extend the E2E check for 1A's INTERPRET.CHITARRA docente**

In `src/onlinetests/checks/articolazioneChecks.ts`, add (alongside Task 3's check, either as a new `runner.add(...)` or appended into the existing `'Articolazione CDU: supplenza, titolare finale e confini data'` check for `CLASSE_A` — prefer a new dedicated check for isolation):

```ts
  runner.add(
    'Articolazione CDU: cattedra INTERPRET.CHITARRA risolve alla riga composita, non alla materia base',
    sample.sampleSpreadsheetUrl,
    () => {
      const contextBuilder = container.get<ContextBuilder>('contextBuilder');
      const cdu = classCdu(contextBuilder, CLASSE_A);
      const consiglio = cdu.focus.classe?.consiglioDiClasse ?? [];
      const docente5 = consiglio.find(
        (docente) => docente.anagrafica.email === e2eDocenteEmail(5)
      );
      const chitarra = docente5?.materie.find((materia) => materia.sigla === 'INTERPRET.CHITARRA');
      if (
        docente5 === undefined ||
        chitarra === undefined ||
        chitarra.principale !== 'Interpretazione ed esecuzione' ||
        chitarra.specificita !== 'Chitarra' ||
        chitarra.nome !== 'Interpretazione ed esecuzione (Chitarra)'
      ) {
        throw new ValidationError(
          `Cattedra INTERPRET.CHITARRA di ${e2eDocenteEmail(5)} non risolta alla riga composita: ${JSON.stringify(chitarra)}`
        );
      }
    }
  );
```

- [ ] **Step 4: Verify the `DOCUMENTO_DOCENTE_MATERIA` batch keys off the composite id in E2E**

Check whether an existing E2E check already exercises `DOCUMENTO_DOCENTE_MATERIA` batch generation (search `grep -n "DOCUMENTO_DOCENTE_MATERIA\|generateDocentiMateria" src/onlinetests/checks/*.ts`). If one exists, extend it with an assertion that the generated `LOG_DOCS` row (or equivalent target-tracking table) for docente5/CLASSE_A is keyed to `INTERPRET.CHITARRA`, not `INTERPRET`, following that check's existing `LOG_DOCS` row-lookup pattern (mirror `articolazioneChecks.ts`'s own `documentConfig`/`LOG_DOCS` filtering style used in the `'documento CDC'` check above). If no such check exists yet, add one modeled directly on that pattern rather than inventing a new one.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Full offline verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
Expected: all green. This is the last point before the online push gate — every prior task's unit tests plus this task's fixture changes must all agree.

- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/E2eSampleDatabaseBuilder.ts src/onlinetests/checks/articolazioneChecks.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "test: E2E specifica-catalog mock data and INTERPRET.CHITARRA composite-resolution check"
```

- [ ] **Step 8: Online build gate (manual/CI step, not run by the implementer inline unless explicitly asked)**

Run: `npm run build:online`
Expected: builds `OnlineTests.js`, runs the full offline suite as a pre-push gate (already covered by Step 6), and produces `gas-source-map.json`. This step requires push access to the live GAS sample spreadsheet to actually execute the online checks (Task 3's and this task's new `runner.add` blocks) — flag to the user that live-GAS execution of these two new checks should be confirmed via `npm run push:online` (or the project's usual online-test invocation) before considering Tasks 1-9 fully verified end-to-end, since neither can run under plain `npm test`.

---

## Self-Review Notes

- **Spec coverage:** Spec 1 Fix 1→Task 1, Fix 2/3→Task 2, Fix 4→Task 3. Spec 2 schema/domain→Task 4, repo/resolution layer→Task 5, `materiaVm()`→Task 6, `materiePerPrincipaleMapper`→Task 7, `DocumentBatchService`→Task 8, mock DB/E2E→Task 9. All "Testing" bullets from both design docs map onto a task step above.
- **Out-of-scope items respected:** `AldoTeachingResolutionConfig.resolutionClasses()`, `PartnerProjectionProvider`, `ESAME_CFG_E2E` (spec 1); `MateriaColumn.sigla`/`RisolutoreRuoliService`/`SheetMaterieGeneratorStrategy.columnForId`, `ElencoMaterieConPermessi` (spec 2) — no task touches any of these.
- **Sequencing:** Task 5 (distinct-base-id derivation) must land before Task 9's `seedMaterie` change removes the bare `INTERPRET`/`LAB` rows, otherwise the E2E fixture would break role resolution before the fix that makes it safe exists. Tasks are ordered accordingly.
- Placeholders remaining by design (not "TBD" laziness, but genuine "match this codebase's existing pattern" instructions where I don't have the exact test-file contents in front of me): Task 5 Steps 1/5, Task 6 Step 1, Task 8 Steps 1/3, Task 9 Step 4 — each names the exact file to inspect and the exact existing pattern to mirror before filling in the concrete code, per this plan's own file-structure section.
