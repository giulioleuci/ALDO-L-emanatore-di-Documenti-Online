# Historic Enrichment Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the student-year outcome (`esito`) algorithm to use `ALUNNI.RIPETENTE` instead of the (structurally incapable) `CAMBIO` comparison, split `MOV_ALUNNI.TIPO=OUT` into `OUT` (trasferimento) / `RITIRATO` (ritiro), and add two new booleans — `presenteAnnoPrecedente` and `presenteTuttoAnno` — to the current-year and historical student context.

**Architecture:** `StoricoAlunniService.perAlunno` already opens every historical year's database in one pass; the new algorithm reuses that same pass to look at _neighboring_ years' `ALUNNI.RIPETENTE` (no extra DB reads). The two new booleans are computed identically in three places — `AlunnoProvider` (current year, `focus.alunno.status`), `StudentiProvider` (current year, per roster student), and `StoricoAlunniService`/`storicoMapper` (each historical year) — via one shared pure helper (`presenteTuttoAnno`) plus a same-pattern "does a record exist in the neighboring year's DB" check. `AlunnoProvider`/`StudentiProvider` gain a `StoricoDatabaseProvider` dependency (already constructed once in `ContextEngineFactory` and cheaply cached there) to look one year back.

**Tech Stack:** TypeScript, Jest (`ts-jest`), GAS V8 target. No new libraries.

**Spec:** `ANALYSIS_HISTORIC_ENRICH_EXTENSION.md` (this repo root) — read it in full before starting; it is the design doc this plan implements. Also touches `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `SPECS_ALDO/02_CDU_STRUTTURA.md`, `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`.

## Global Constraints

- GAS V8 target: synchronous code only, no Node/browser-only APIs (`CLAUDE.md`).
- Native GAS globals only inside `GoogleApiWrapper` — not touched by this plan.
- No circular dependencies across the domain→application→infrastructure layers; historical lookups keep importing concrete infra repos from `application/storico`/`application/context-engine/providers` exactly as the existing code already does (this is an established pattern here, not a new violation).
- New/changed public methods and interfaces must stay wired through `ContextEngineFactory` — no ad-hoc construction inside providers.
- Per user decision (recorded in `ANALYSIS_HISTORIC_ENRICH_EXTENSION.md` §7): `SCONOSCIUTO` remains an acceptable terminal outcome (no fallback needed); pre-existing `MOV_ALUNNI.TIPO=OUT` rows are **not** touched by this plan (user reclassifies manually); `presenteAnnoPrecedente=false` for anno-1 classes is returned as-is (`false`), not omitted.
- **Out of scope for this plan:** `src/onlinetests/data/SharedTestDatabaseBuilder.ts`, `src/onlinetests/data/Seeders.ts` (`seedStorico`) and `src/onlinetests/checks/storicoChecks.ts`. These E2E fixtures currently encode the _old_ CAMBIO-based algorithm (see `seedStorico`'s `MOV_ALUNNI` rows and `storicoChecks.ts`'s `PROMOSSO`/`NON_PROMOSSO`/`RITIRATO` assertions) and need their own follow-up pass once the new algorithm's actual current-year `RIPETENTE` wiring for `e2eAlunnoEmail(138)`/`(139)` is designed — that requires re-deriving which current-year class those synthetic emails land in, which this plan's research did not chase down. Flag this to the user as follow-up work; do not silently skip touching esito semantics there without telling them.

---

## Task 1: Spec docs — TipoMovimento split, CDU fields (no code)

**Files:**

- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:151-159`
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (after the `MOV_ALUNNI` table, currently ending line 298)
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md` (three sites: `focus.alunno.status` ~line 370-376, `StudentStoricoVM.anni[]` ~line 753-761, `StudentVM.status` ~line 789-794; plus the JSON example ~line 1462-1468)

This task has no tests (it is documentation only) — just make the edits and move on.

- [ ] **Step 1: Update `TipoMovimento` table in `03_VALUE_OBJECTS_ED_ENUM.md`**

Replace:

```markdown
| Valore   | Descrizione                            |
| -------- | -------------------------------------- |
| `IN`     | Ingresso da altra scuola o classe      |
| `OUT`    | Uscita (ritiro, trasferimento esterno) |
| `CAMBIO` | Cambio di classe interno all'istituto  |
```

with:

```markdown
| Valore     | Descrizione                                            |
| ---------- | ------------------------------------------------------ |
| `IN`       | Ingresso da altra scuola o classe                      |
| `OUT`      | Uscita per trasferimento verso altro istituto          |
| `RITIRATO` | Uscita per ritiro dagli studi (non verso altra scuola) |
| `CAMBIO`   | Cambio di classe interno all'istituto                  |
```

- [ ] **Step 2: Add a note under `MOV_ALUNNI` in `01_SCHEMA_DATABASE.md`**

Immediately after the `MOV_ALUNNI` table (the row ending `| A | ... |`) and before the next `---`, insert:

```markdown
**Nota OUT/RITIRATO:** `TIPO=OUT` copre esclusivamente il trasferimento verso un altro istituto; `TIPO=RITIRATO` copre l'uscita per ritiro dagli studi. Vedi `03_VALUE_OBJECTS_ED_ENUM.md` per l'enumerazione completa.
```

- [ ] **Step 3: Update `focus.alunno.status` in `02_CDU_STRUTTURA.md`**

Replace:

```yaml
status:
  religione: string # "IRC" | "ALT" | "NO" (ReligioneScelta)
  religioneLabel: string # "Religione cattolica" | "Attività alternativa" | "Non si avvale"
  isBes: boolean
  isRipetente: boolean
  isRappresentante: boolean
```

with:

```yaml
status:
  religione: string # "IRC" | "ALT" | "NO" (ReligioneScelta)
  religioneLabel: string # "Religione cattolica" | "Attività alternativa" | "Non si avvale"
  isBes: boolean
  isRipetente: boolean
  isRappresentante: boolean
  presenteAnnoPrecedente: boolean # false anche per classi di anno 1 (iscrizione ordinaria, non trasferimento)
  presenteTuttoAnno: boolean # false se un IN/CAMBIO è datato entro l'anno corrente
```

- [ ] **Step 4: Update `StudentStoricoVM.anni[]` in `02_CDU_STRUTTURA.md`**

Replace:

```yaml
StudentStoricoVM:
  anni:
    - annoScolastico: string # es. "2024-2025"
      classe: string # Classe frequentata nell'anno
      esito: string # "PROMOSSO" | "NON_PROMOSSO" | "RITIRATO" | "SCONOSCIUTO"
      carenze: # Sigle già riconciliate alla materia canonica corrente (es. GST → STO)
        - materiaSigla: string
          valore: string
```

with:

```yaml
StudentStoricoVM:
  anni:
    - annoScolastico: string # es. "2024-2025"
      classe: string # Classe frequentata nell'anno
      esito: string # "PROMOSSO" | "NON_PROMOSSO" | "TRASFERITO" | "RITIRATO" | "SCONOSCIUTO"
      carenze: # Sigle già riconciliate alla materia canonica corrente (es. GST → STO)
        - materiaSigla: string
          valore: string
      presenteAnnoPrecedente: boolean # Era già iscritto in questa scuola nell'anno precedente a questo?
      presenteTuttoAnno: boolean # Nessun IN/CAMBIO datato entro questo anno?
```

- [ ] **Step 5: Update `StudentVM.status` (§8.7) in `02_CDU_STRUTTURA.md`**

Replace:

```yaml
status:
  isBes: boolean
  isRipetente: boolean
  isRappresentante: boolean
  religione: string # "IRC" | "ALT" | "NO"
  religioneLabel: string # "Religione cattolica" | "Attività alternativa" | "Non si avvale"
```

with:

```yaml
status:
  isBes: boolean
  isRipetente: boolean
  isRappresentante: boolean
  religione: string # "IRC" | "ALT" | "NO"
  religioneLabel: string # "Religione cattolica" | "Attività alternativa" | "Non si avvale"
  presenteAnnoPrecedente: boolean
  presenteTuttoAnno: boolean
```

- [ ] **Step 6: Update the JSON example (~line 1462) in `02_CDU_STRUTTURA.md`**

Replace:

```json
            "status": {
              "isBes": false,
              "isRipetente": false,
              "isRappresentante": true,
              "religione": "IRC",
              "religioneLabel": "Religione cattolica"
            },
```

with:

```json
            "status": {
              "isBes": false,
              "isRipetente": false,
              "isRappresentante": true,
              "religione": "IRC",
              "religioneLabel": "Religione cattolica",
              "presenteAnnoPrecedente": true,
              "presenteTuttoAnno": true
            },
```

- [ ] **Step 7: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/02_CDU_STRUTTURA.md SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md
git commit -m "docs(specs): split MOV_ALUNNI TIPO=OUT into OUT/RITIRATO, add presenteAnnoPrecedente/presenteTuttoAnno to CDU"
```

---

## Task 2: `TipoMovimento.RITIRATO` + `MovimentoAlunno.isRitirato()`

**Files:**

- Modify: `src/domain/value-objects/enums.ts:54-58`
- Modify: `src/domain/entities/MovimentoAlunno.ts:39-47`
- Test: `test/unit/domain/movimento-alunno-specs.test.ts` (or a new adjoining test file if that one is spec-only — check it first; if it doesn't already test `MovimentoAlunno` methods, add a new small test file `test/unit/domain/movimento-alunno.test.ts`)

**Interfaces:**

- Produces: `TipoMovimento.RITIRATO` enum member; `MovimentoAlunno.isRitirato(): boolean`.

- [ ] **Step 1: Check the existing test file's scope**

Run: `cat "test/unit/domain/movimento-alunno-specs.test.ts"`. If it only tests `MovimentiPerAlunnoSpec`/`MovimentiPerTipoSpec` (specifications), create a new file `test/unit/domain/movimento-alunno.test.ts` for the entity-method tests below instead of appending unrelated concerns to the specs file.

- [ ] **Step 2: Write the failing test**

In `test/unit/domain/movimento-alunno.test.ts`:

```typescript
import { MovimentoAlunno } from '../../../src/domain/entities/MovimentoAlunno';
import { COL_MOV_ALUNNI } from '../../../src/config/schema';

function movimento(tipo: string) {
  return new MovimentoAlunno({
    [COL_MOV_ALUNNI.STUDENTE]: 'a1@school.it',
    [COL_MOV_ALUNNI.TIPO]: tipo,
    [COL_MOV_ALUNNI.DATA]: '2026-03-01',
    [COL_MOV_ALUNNI.DA]: '4A',
    [COL_MOV_ALUNNI.A]: ''
  });
}

test('isRitirato is true only for TIPO=RITIRATO', () => {
  expect(movimento('RITIRATO').isRitirato()).toBe(true);
  expect(movimento('OUT').isRitirato()).toBe(false);
  expect(movimento('IN').isRitirato()).toBe(false);
  expect(movimento('CAMBIO').isRitirato()).toBe(false);
});

test('isUscita stays true only for TIPO=OUT (trasferimento), not RITIRATO', () => {
  expect(movimento('OUT').isUscita()).toBe(true);
  expect(movimento('RITIRATO').isUscita()).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/movimento-alunno.test.ts`
Expected: FAIL — `isRitirato is not a function` (TIPO=RITIRATO also fails TS enum assignability once Step 4 below is skipped, but since `MovimentoAlunnoData.TIPO` is `unknown`-typed at the constructor boundary, the enum member itself just needs to exist for the `TipoMovimento` cast at read time — the test will fail because `isRitirato` doesn't exist yet, not because of the enum).

- [ ] **Step 4: Add `RITIRATO` to `TipoMovimento`**

In `src/domain/value-objects/enums.ts`, replace:

```typescript
export enum TipoMovimento {
  IN = 'IN',
  OUT = 'OUT',
  CAMBIO = 'CAMBIO'
}
```

with:

```typescript
export enum TipoMovimento {
  IN = 'IN',
  OUT = 'OUT',
  RITIRATO = 'RITIRATO',
  CAMBIO = 'CAMBIO'
}
```

- [ ] **Step 5: Add `isRitirato()` to `MovimentoAlunno`**

In `src/domain/entities/MovimentoAlunno.ts`, replace:

```typescript
  isIngresso(): boolean {
    return this.tipo === TipoMovimento.IN;
  }
  isUscita(): boolean {
    return this.tipo === TipoMovimento.OUT;
  }
  isCambioClasse(): boolean {
    return this.tipo === TipoMovimento.CAMBIO;
  }
```

with:

```typescript
  isIngresso(): boolean {
    return this.tipo === TipoMovimento.IN;
  }
  /** TIPO=OUT: uscita per trasferimento verso altro istituto (03 §TipoMovimento). */
  isUscita(): boolean {
    return this.tipo === TipoMovimento.OUT;
  }
  /** TIPO=RITIRATO: uscita per ritiro dagli studi, non verso altra scuola (03 §TipoMovimento). */
  isRitirato(): boolean {
    return this.tipo === TipoMovimento.RITIRATO;
  }
  isCambioClasse(): boolean {
    return this.tipo === TipoMovimento.CAMBIO;
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/movimento-alunno.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/value-objects/enums.ts src/domain/entities/MovimentoAlunno.ts test/unit/domain/movimento-alunno.test.ts
git commit -m "feat(domain): split MOV_ALUNNI.TIPO=OUT into OUT/RITIRATO"
```

---

## Task 3: Shared `presenteTuttoAnno` helper

**Files:**

- Create: `src/application/storico/presenza.ts`
- Test: `test/unit/application/storico-presenza.test.ts`

**Interfaces:**

- Produces: `presenteTuttoAnno(movimenti: MovimentoAlunno[]): boolean` — used by Task 5 (`StoricoAlunniService`), Task 7 (`AlunnoProvider`), Task 8 (`StudentiProvider`).

- [ ] **Step 1: Write the failing test**

In `test/unit/application/storico-presenza.test.ts`:

```typescript
import { presenteTuttoAnno } from '../../../src/application/storico/presenza';
import { MovimentoAlunno } from '../../../src/domain/entities/MovimentoAlunno';
import { COL_MOV_ALUNNI } from '../../../src/config/schema';

function movimento(tipo: string): MovimentoAlunno {
  return new MovimentoAlunno({
    [COL_MOV_ALUNNI.STUDENTE]: 'a1@school.it',
    [COL_MOV_ALUNNI.TIPO]: tipo,
    [COL_MOV_ALUNNI.DATA]: '2026-01-10',
    [COL_MOV_ALUNNI.DA]: '4A',
    [COL_MOV_ALUNNI.A]: '4B'
  });
}

test('true when there is no movement at all (5.2)', () => {
  expect(presenteTuttoAnno([])).toBe(true);
});

test('true when the only movements are OUT/RITIRATO (exit does not affect mid-year presence)', () => {
  expect(presenteTuttoAnno([movimento('OUT'), movimento('RITIRATO')])).toBe(true);
});

test('false when an IN movement is present (5.2)', () => {
  expect(presenteTuttoAnno([movimento('IN')])).toBe(false);
});

test('false when a CAMBIO movement is present (5.2)', () => {
  expect(presenteTuttoAnno([movimento('CAMBIO')])).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-presenza.test.ts`
Expected: FAIL — cannot find module `src/application/storico/presenza`

- [ ] **Step 3: Write the implementation**

In `src/application/storico/presenza.ts`:

```typescript
import type { MovimentoAlunno } from '../../domain/entities/MovimentoAlunno';

/**
 * True when the student has no IN/CAMBIO movement recorded within the year —
 * i.e. no mid-year entry, whether from another school or another internal
 * class (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §5.2). An OUT/RITIRATO exit
 * does not affect this: it answers "was there a gap at the start", not
 * "did the year end early".
 */
export function presenteTuttoAnno(movimenti: MovimentoAlunno[]): boolean {
  return !movimenti.some((m) => m.isIngresso() || m.isCambioClasse());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-presenza.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/storico/presenza.ts test/unit/application/storico-presenza.test.ts
git commit -m "feat(application): add shared presenteTuttoAnno helper"
```

---

## Task 4: `IAlunnoRepository.getStoricoMovimenti`

**Files:**

- Modify: `src/domain/repositories/IAlunnoRepository.ts`

`AlunnoRepository` (the only implementer, `src/infrastructure/repositories/AlunnoRepository.ts:79-81`) already has this method; it is just missing from the interface, so `AlunnoProvider`/`StudentiProvider` (which only see the interface) cannot call it yet. This is a mechanical, compile-checked addition — no new test needed (the method is already covered by `test/unit/infrastructure/alunno-repository.test.ts:68`).

- [ ] **Step 1: Add the method to the interface**

In `src/domain/repositories/IAlunnoRepository.ts`, replace:

```typescript
import type { Alunno } from '../entities/Alunno';
import type { Carenza } from '../entities/Carenza';
import type { Piano } from '../entities/Piano';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';

export interface IAlunnoRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<Alunno>`. */
  findById(id: string): Alunno | null;
  findAttivi(): Alunno[];

  // --- Aggregate navigation (ref 06 §1) ---

  /** Shortfalls of the student, optionally filtered by school year. */
  getCarenze(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[];
  /** Personalized plans of the student. */
  getPiani(alunno: Alunno): Piano[];
  /** Total ASL/PCTO hours across all the student's years. */
  getOreASLTotali(alunno: Alunno): number;
}
```

with:

```typescript
import type { Alunno } from '../entities/Alunno';
import type { Carenza } from '../entities/Carenza';
import type { Piano } from '../entities/Piano';
import type { MovimentoAlunno } from '../entities/MovimentoAlunno';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';

export interface IAlunnoRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<Alunno>`. */
  findById(id: string): Alunno | null;
  findAttivi(): Alunno[];

  // --- Aggregate navigation (ref 06 §1) ---

  /** Shortfalls of the student, optionally filtered by school year. */
  getCarenze(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[];
  /** Personalized plans of the student. */
  getPiani(alunno: Alunno): Piano[];
  /** Total ASL/PCTO hours across all the student's years. */
  getOreASLTotali(alunno: Alunno): number;
  /** Full mobility history on this database, most recent first. */
  getStoricoMovimenti(alunno: Alunno): MovimentoAlunno[];
}
```

- [ ] **Step 2: Verify the existing implementer still satisfies the interface**

Run: `npx tsc --noEmit -p tsconfig.eslint.json`
Expected: no new errors (AlunnoRepository already implements this method with a matching signature).

- [ ] **Step 3: Commit**

```bash
git add src/domain/repositories/IAlunnoRepository.ts
git commit -m "feat(domain): expose getStoricoMovimenti on IAlunnoRepository"
```

---

## Task 5: Rewrite `StoricoAlunniService` esito algorithm + presence fields

**Files:**

- Modify: `src/application/storico/StoricoAlunniService.ts` (full rewrite of `Esito`, `AnnoAlunnoStorico`, `perAlunno`, `esito`)
- Modify: `test/unit/application/storico-services.test.ts` (rewrite the `StoricoAlunniService (13 §3)` describe block, lines 165-220, and the `annoPrecedente()` fixture it depends on, lines 97-161 — other describes in this file use the same fixture and must keep passing)

**Interfaces:**

- Consumes: `presenteTuttoAnno` from `../../application/storico/presenza` (Task 3); `TipoMovimento`/`MovimentoAlunno`/`Alunno` from domain.
- Produces: `Esito = 'PROMOSSO' | 'NON_PROMOSSO' | 'TRASFERITO' | 'RITIRATO' | 'SCONOSCIUTO'`; `AnnoAlunnoStorico` gains `presenteAnnoPrecedente: boolean` and `presenteTuttoAnno: boolean`; `perAlunno(alunnoEmail: string, profondita = 1, alunnoAnnoSuccessivo: Alunno | null = null): AnnoAlunnoStorico[]` — third param is the student's **current-year** `Alunno` entity (needed only to resolve the most recent historical year's esito; `null` when unknown, e.g. any caller other than `StoricoProvider`).

- [ ] **Step 1: Rewrite the fixture and failing tests in `test/unit/application/storico-services.test.ts`**

The `annoPrecedente()` fixture currently encodes a `CAMBIO 4A->5A` to signal promotion; that signal is retired. Replace the whole `annoPrecedente` function (lines 97-161) with a version that no longer relies on `CAMBIO` for esito (keep the `CAMBIO` row only as inert noise proving it's ignored), and update the `describe('StoricoAlunniService (13 §3)', ...)` block (lines 165-220) to match the new algorithm. Replace the entire block from `function annoPrecedente(): Record<string, Row[]> {` through the closing `});` of the `StoricoAlunniService` describe (i.e. lines 97-220) with:

```typescript
function annoPrecedente(overrides: { movAlunni?: Row[] } = {}): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.CLASSI = [
    {
      ID: '4A',
      ANNO: 4,
      INDIRIZZO: 'SCIENTIFICO',
      ARTICOLAZIONE: null,
      RUOLI: null,
      ATTIVA: true,
      COORD: 'rossi@school.it',
      MATE: 'rossi@school.it',
      FISI: 'bianchi@school.it'
    }
  ];
  tables.ALUNNI = [
    {
      EMAIL: 'a1@school.it',
      COGNOMENOME: 'VERDI ANNA',
      CLASSE: '4A',
      RELIGIONE: 'IRC',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: false,
      TUTOR_1: 'genitore1@x.it',
      TUTOR_2: '',
      CURRICULUM: null
    }
  ];
  tables.CARENZE = [
    {
      STUDENTE: 'a1@school.it',
      PROGRESSIVO: 1,
      CLASSE: '4A',
      DATA: '2025-05-10',
      NOTIFICATO: '2025-05-11',
      ASSENZE: false,
      MATE: '4'
    }
  ];
  // CAMBIO is deliberately present but must never drive esito any more (13 §... /
  // ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §1): it is an internal same-year
  // section change, structurally incapable of signalling promotion.
  tables.MOV_ALUNNI = overrides.movAlunni ?? [
    { STUDENTE: 'a1@school.it', TIPO: 'CAMBIO', DATA: '2025-06-15', DA: '4A', A: '4B' }
  ];
  tables.PIANI = [{ STUDENTE: 'a1@school.it', TIPO: 'PDP_DSA', PARAMETRI: null }];
  tables.LOG_DOCS = [
    {
      ID: 'old_pdp',
      ID_GEN: 'CD_PDP',
      TIPO: 'PDP',
      STATO: 'ARCHIVIATO',
      UTENTI: 'a1@school.it',
      CLASSI: '4A'
    },
    {
      ID: 'old_verbale',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'ARCHIVIATO',
      UTENTI: '',
      CLASSI: '4A'
    }
  ];
  return tables;
}

function alunnoAnnoCorrente(ripetente: boolean): Alunno {
  return Alunno.fromData({
    EMAIL: 'a1@school.it',
    COGNOMENOME: 'VERDI ANNA',
    CLASSE: '5A',
    RELIGIONE: 'IRC',
    ATTIVO: true,
    RIPETENTE: ripetente,
    RAPPR_STUD: false,
    CURRICULUM: null
  });
}

// --- StoricoAlunniService ---

describe('StoricoAlunniService (13 §3, ANALYSIS_HISTORIC_ENRICH_EXTENSION §2-5)', () => {
  test('esito PROMOSSO when the current-year record exists and is not RIPETENTE', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente())])
    );
    const [record] = service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(false));
    expect(record).toBeDefined();
    expect(record!.anno).toBe('2025-2026');
    expect(record!.classe).toBe('4A');
    expect(record!.esito).toBe('PROMOSSO');
    expect(record!.carenze).toEqual([{ materiaSigla: 'MATE', valore: '4' }]);
    expect(record!.piani).toEqual(['PDP_DSA']);
    expect(record!.presenteTuttoAnno).toBe(false); // the inert CAMBIO row still counts as a mid-year entry
  });

  test('esito NON_PROMOSSO when the current-year record exists and is RIPETENTE', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente({ movAlunni: [] }))])
    );
    const [record] = service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(true));
    expect(record!.esito).toBe('NON_PROMOSSO');
    expect(record!.presenteTuttoAnno).toBe(true); // no movement at all this time
  });

  test('esito SCONOSCIUTO when no next-year record is available (boundary of configured depth)', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente({ movAlunni: [] }))])
    );
    const [record] = service.perAlunno('a1@school.it', 1, null);
    expect(record!.esito).toBe('SCONOSCIUTO');
  });

  test('esito TRASFERITO when the year has an OUT movement, regardless of next-year RIPETENTE', () => {
    const tables = annoPrecedente({
      movAlunni: [
        { STUDENTE: 'a1@school.it', TIPO: 'OUT', DATA: '2025-03-01', DA: '4A', A: 'ALTRO ISTITUTO' }
      ]
    });
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    expect(service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(false))[0]!.esito).toBe(
      'TRASFERITO'
    );
  });

  test('esito RITIRATO when the year has a RITIRATO movement', () => {
    const tables = annoPrecedente({
      movAlunni: [
        { STUDENTE: 'a1@school.it', TIPO: 'RITIRATO', DATA: '2025-03-01', DA: '4A', A: '' }
      ]
    });
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    expect(service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(false))[0]!.esito).toBe(
      'RITIRATO'
    );
  });

  test('an OUT/RITIRATO movement takes priority over a RIPETENTE-derived esito', () => {
    const tables = annoPrecedente({
      movAlunni: [
        { STUDENTE: 'a1@school.it', TIPO: 'OUT', DATA: '2025-03-01', DA: '4A', A: 'ALTRO ISTITUTO' }
      ]
    });
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    // Even though the student is RIPETENTE next year (contradictory data), OUT wins.
    expect(service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(true))[0]!.esito).toBe(
      'TRASFERITO'
    );
  });

  test('unknown student in that historical year yields a null-classe SCONOSCIUTO record, not a crash', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente())])
    );
    const [record] = service.perAlunno('ghost@school.it', 1, alunnoAnnoCorrente(false));
    expect(record).toEqual({
      anno: '2025-2026',
      classe: null,
      esito: 'SCONOSCIUTO',
      carenze: [],
      piani: [],
      presenteAnnoPrecedente: false,
      presenteTuttoAnno: false
    });
  });

  test('profondita limits how many prior years are consulted', () => {
    const anni = [
      annoStorico('2025-2026', annoPrecedente()),
      annoStorico('2024-2025', annoPrecedente())
    ];
    const service = new StoricoAlunniService(fakeProvider(anni));
    expect(service.perAlunno('a1@school.it', 1)).toHaveLength(1);
    expect(service.perAlunno('a1@school.it', 2)).toHaveLength(2);
  });

  test('esito for a year uses the NEXT fetched historical year (not the current year) when profondita > 1', () => {
    // anni[0] = 2025-2026 (RIPETENTE=false -> the anni[1] year was PROMOSSO),
    // anni[1] = 2024-2025 (esito resolved from anni[0]'s RIPETENTE flag: false).
    const anni = [
      annoStorico('2025-2026', annoPrecedente({ movAlunni: [] })), // RIPETENTE=false by default fixture
      annoStorico('2024-2025', annoPrecedente({ movAlunni: [] }))
    ];
    const service = new StoricoAlunniService(fakeProvider(anni));
    const records = service.perAlunno('a1@school.it', 2, alunnoAnnoCorrente(false));
    expect(records[0]!.esito).toBe('PROMOSSO'); // resolved from the (current-year) param
    expect(records[1]!.esito).toBe('PROMOSSO'); // resolved from anni[0]'s own RIPETENTE=false
    expect(records[0]!.presenteAnnoPrecedente).toBe(true); // anni[1] has a matching ALUNNI row
    expect(records[1]!.presenteAnnoPrecedente).toBe(false); // no anni[2] fetched -> boundary default
  });
});
```

Note this rewrite also removes the old `'esito RITIRATO when the year has an OUT movement'` and `'esito NON_PROMOSSO when CAMBIO does not increase the class year'` tests (both asserted the retired algorithm) and replaces them with the cases above. Also add the missing import at the top of the file (it currently has no `Alunno` import):

Replace:

```typescript
import { reconcileSigla } from '../../../src/application/storico/reconcileSigla';
```

with:

```typescript
import { reconcileSigla } from '../../../src/application/storico/reconcileSigla';
import { Alunno } from '../../../src/domain/entities/Alunno';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "StoricoAlunniService"`
Expected: FAIL (old `esito` signature/behavior doesn't match yet — e.g. `TRASFERITO` is not a member of the current `Esito` type, `presenteAnnoPrecedente`/`presenteTuttoAnno` are `undefined`).

- [ ] **Step 3: Rewrite `StoricoAlunniService.ts`**

Replace the entire file contents with:

```typescript
import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
import { PianoRepository } from '../../infrastructure/repositories/PianoRepository';
import type { IPianoRepository } from '../../domain/repositories/IPianoRepository';
import { MovimentoAlunnoRepository } from '../../infrastructure/repositories/MovimentoAlunnoRepository';
import type { IMovimentoAlunnoRepository } from '../../domain/repositories/IMovimentoAlunnoRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../domain/entities/Alunno';
import type { MovimentoAlunno } from '../../domain/entities/MovimentoAlunno';
import { Email } from '../../domain/value-objects/Email';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { reconcileSigla } from './reconcileSigla';
import { presenteTuttoAnno } from './presenza';

export type Esito = 'PROMOSSO' | 'NON_PROMOSSO' | 'TRASFERITO' | 'RITIRATO' | 'SCONOSCIUTO';

export interface CarenzaStorica {
  materiaSigla: string;
  valore: string;
}

export interface AnnoAlunnoStorico {
  anno: string;
  classe: string | null;
  esito: Esito;
  carenze: CarenzaStorica[];
  piani: string[];
  /** Era già iscritto in questa scuola nell'anno immediatamente precedente a questo? */
  presenteAnnoPrecedente: boolean;
  /** Nessun IN/CAMBIO datato entro questo anno? (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §5) */
  presenteTuttoAnno: boolean;
}

interface AnnoRisolto {
  anno: string;
  alunno: Alunno | null;
  classi: IClasseRepository;
  carenze: ICarenzaRepository;
  piani: IPianoRepository;
  movimenti: MovimentoAlunno[];
  materie: IMateriaRepository;
}

/**
 * StoricoAlunniService (13 §3): per prior school year, the student's class,
 * end-of-year outcome, last-measurement shortfalls (sigle reconciled to the
 * current MATERIE catalogue) and active personalized plans.
 *
 * Esito derivation (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §2-3): an OUT
 * movement in the year is TRASFERITO, a RITIRATO movement is RITIRATO — both
 * take priority since an exit makes "promoted or not" moot. Otherwise, the
 * outcome comes from the STUDENT'S OWN `ALUNNI.RIPETENTE` flag on the
 * IMMEDIATELY FOLLOWING year (this same fetched batch's previous entry, or
 * the current-year `Alunno` passed as `alunnoAnnoSuccessivo` for the most
 * recent historical year): RIPETENTE=true there means this year was
 * NON_PROMOSSO, RIPETENTE=false means PROMOSSO. `CAMBIO` never drives esito —
 * by definition it cannot cross a course-year boundary. No next-year record
 * at all (boundary of the configured/available depth) yields SCONOSCIUTO —
 * an accepted terminal case, not a bug (§7).
 */
export class StoricoAlunniService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perAlunno(
    alunnoEmail: string,
    profondita = 1,
    alunnoAnnoSuccessivo: Alunno | null = null
  ): AnnoAlunnoStorico[] {
    const risolti: AnnoRisolto[] = this.provider.anniStorici(profondita).map(({ anno, db }) => {
      const alunni: IAlunnoRepository = new AlunnoRepository(db);
      const movimentiRepo: IMovimentoAlunnoRepository = new MovimentoAlunnoRepository(db);
      const alunno = alunni.findById(alunnoEmail);
      return {
        anno,
        alunno,
        classi: new ClasseRepository(db),
        carenze: new CarenzaRepository(db),
        piani: new PianoRepository(db),
        movimenti: alunno !== null ? movimentiRepo.findByAlunno(alunno) : [],
        materie: new MateriaRepository(db)
      };
    });

    return risolti.map((corrente, i) => {
      const { anno, alunno, classi, carenze, piani, movimenti, materie } = corrente;

      if (alunno === null) {
        return {
          anno,
          classe: null,
          esito: 'SCONOSCIUTO',
          carenze: [],
          piani: [],
          presenteAnnoPrecedente: false,
          presenteTuttoAnno: false
        };
      }

      const classe = alunno.classe !== '' ? classi.findById(ClasseId.of(alunno.classe)) : null;
      const annoCorso = classe?.anno.value ?? null;

      const carenzeStoriche: CarenzaStorica[] = [];
      for (const c of carenze.findByAlunno(alunno)) {
        for (const [materiaId, valore] of carenze.getCarenzePerMateria(c)) {
          const sigla =
            annoCorso !== null
              ? reconcileSigla(materiaId.value, annoCorso, materie.findAllCached())
              : materiaId.value;
          carenzeStoriche.push({ materiaSigla: sigla, valore: valore.toString() });
        }
      }

      const successivo = i === 0 ? alunnoAnnoSuccessivo : risolti[i - 1]!.alunno;
      const precedente = risolti[i + 1]?.alunno ?? null;

      return {
        anno,
        classe: alunno.classe,
        esito: this.esito(movimenti, successivo),
        carenze: carenzeStoriche,
        piani: piani.findByAlunno(Email.of(alunno.id ?? alunnoEmail)).map((p) => p.tipo),
        presenteAnnoPrecedente: precedente !== null,
        presenteTuttoAnno: presenteTuttoAnno(movimenti)
      };
    });
  }

  private esito(movimenti: MovimentoAlunno[], alunnoAnnoSuccessivo: Alunno | null): Esito {
    if (movimenti.some((m) => m.isUscita())) return 'TRASFERITO';
    if (movimenti.some((m) => m.isRitirato())) return 'RITIRATO';
    if (alunnoAnnoSuccessivo !== null) {
      return alunnoAnnoSuccessivo.isRipetente() ? 'NON_PROMOSSO' : 'PROMOSSO';
    }
    return 'SCONOSCIUTO';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts`
Expected: PASS (all describes in the file, including `StoricoDocumentiService`/`StoricoClassiService`/`StoricoDocentiService`/`MasterStoricoDatabaseProvider`, which reuse `annoPrecedente()` but don't touch `esito`/presence fields).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.eslint.json`
Expected: no errors from this file.

- [ ] **Step 6: Commit**

```bash
git add src/application/storico/StoricoAlunniService.ts test/unit/application/storico-services.test.ts
git commit -m "feat(storico): derive esito from ALUNNI.RIPETENTE on the following year, add presence fields"
```

---

## Task 6: Extend `StudentStoricoVM` in `storicoMapper.ts`

**Files:**

- Modify: `src/application/context-engine/mappers/storicoMapper.ts`
- Modify: `test/unit/application/context-engine/mappers/storico-mapper.test.ts`

**Interfaces:**

- Consumes: `AnnoAlunnoStorico` (Task 5, now carrying `presenteAnnoPrecedente`/`presenteTuttoAnno`).
- Produces: `StudentStoricoVM.anni[]` items gain `presenteAnnoPrecedente: boolean` and `presenteTuttoAnno: boolean`.

- [ ] **Step 1: Write the failing test**

In `test/unit/application/context-engine/mappers/storico-mapper.test.ts`, replace the whole file with:

```typescript
import { buildStudentStoricoVm } from '../../../../../src/application/context-engine/mappers/storicoMapper';
import type { AnnoAlunnoStorico } from '../../../../../src/application/storico/StoricoAlunniService';

describe('buildStudentStoricoVm', () => {
  it('maps anni (incl. presenteAnnoPrecedente/presenteTuttoAnno), splits piani into primo/secondo anno precedente with tipoLabel, and flags bocciature', () => {
    const anni: AnnoAlunnoStorico[] = [
      {
        anno: '2024-2025',
        classe: '4A-LC',
        esito: 'NON_PROMOSSO',
        carenze: [{ materiaSigla: 'STO', valore: '4' }],
        piani: ['PDP_DSA'],
        presenteAnnoPrecedente: true,
        presenteTuttoAnno: false
      },
      {
        anno: '2023-2024',
        classe: '4A-LC',
        esito: 'PROMOSSO',
        carenze: [],
        piani: [],
        presenteAnnoPrecedente: false,
        presenteTuttoAnno: true
      }
    ];
    const vm = buildStudentStoricoVm(anni);
    expect(vm.anni).toEqual([
      {
        annoScolastico: '2024-2025',
        classe: '4A-LC',
        esito: 'NON_PROMOSSO',
        carenze: [{ materiaSigla: 'STO', valore: '4' }],
        presenteAnnoPrecedente: true,
        presenteTuttoAnno: false
      },
      {
        annoScolastico: '2023-2024',
        classe: '4A-LC',
        esito: 'PROMOSSO',
        carenze: [],
        presenteAnnoPrecedente: false,
        presenteTuttoAnno: true
      }
    ]);
    expect(vm.pianiPrimoAnnoPrecedente).toEqual([{ tipo: 'PDP_DSA', tipoLabel: 'PDP (DSA)' }]);
    expect(vm.pianiSecondoAnnoPrecedente).toEqual([]);
    expect(vm.bocciature).toEqual([{ annoScolastico: '2024-2025', classe: '4A-LC' }]);
    expect(vm.hasBocciature).toBe(true);
  });

  it('returns hasBocciature false and empty piani arrays for an empty history', () => {
    const vm = buildStudentStoricoVm([]);
    expect(vm).toEqual({
      anni: [],
      pianiPrimoAnnoPrecedente: [],
      pianiSecondoAnnoPrecedente: [],
      bocciature: [],
      hasBocciature: false
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/storico-mapper.test.ts`
Expected: FAIL — `vm.anni` items are missing `presenteAnnoPrecedente`/`presenteTuttoAnno`.

- [ ] **Step 3: Update `storicoMapper.ts`**

Replace:

```typescript
export interface StudentStoricoVM {
  anni: Array<{
    annoScolastico: string;
    classe: string;
    esito: AnnoAlunnoStorico['esito'];
    carenze: AnnoAlunnoStorico['carenze'];
  }>;
  pianiPrimoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  pianiSecondoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  bocciature: Array<{ annoScolastico: string; classe: string }>;
  hasBocciature: boolean;
}
```

with:

```typescript
export interface StudentStoricoVM {
  anni: Array<{
    annoScolastico: string;
    classe: string;
    esito: AnnoAlunnoStorico['esito'];
    carenze: AnnoAlunnoStorico['carenze'];
    presenteAnnoPrecedente: boolean;
    presenteTuttoAnno: boolean;
  }>;
  pianiPrimoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  pianiSecondoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  bocciature: Array<{ annoScolastico: string; classe: string }>;
  hasBocciature: boolean;
}
```

Replace:

```typescript
const mapped = anni.map((a) => ({
  annoScolastico: a.anno,
  classe: a.classe ?? '',
  esito: a.esito,
  carenze: a.carenze.map((carenza) => ({ ...carenza }))
}));
```

with:

```typescript
const mapped = anni.map((a) => ({
  annoScolastico: a.anno,
  classe: a.classe ?? '',
  esito: a.esito,
  carenze: a.carenze.map((carenza) => ({ ...carenza })),
  presenteAnnoPrecedente: a.presenteAnnoPrecedente,
  presenteTuttoAnno: a.presenteTuttoAnno
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/storico-mapper.test.ts`
Expected: PASS

- [ ] **Step 5: Update `StoricoProvider.ts` to pass the current-year Alunno entity**

`StoricoProvider` runs after `AlunnoProvider` in every recipe that includes it (it reads `cdu.focus.alunno`, which only `AlunnoProvider` sets), so `getAlunnoEntity(cdu)` is always safe here.

Replace `src/application/context-engine/providers/StoricoProvider.ts` in full with:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoAlunniService } from '../../storico/StoricoAlunniService';
import { buildStudentStoricoVm } from '../mappers/storicoMapper';
import { getAlunnoEntity } from '../techEntities';

/**
 * Lazy loader for the focused student's previous-years data (02 §4.2, §8.6,
 * 13 §2). When `includiStorico` is false the provider is skipped entirely —
 * no historical database is even opened. When true, attaches
 * `focus.alunno.storico` as a `LazyRef<StudentStoricoVM>`: the actual
 * StoricoAlunniService query and VM mapping run only on first read. The
 * current-year `Alunno` entity (stashed by AlunnoProvider, which always runs
 * first) resolves the most recent historical year's esito via its
 * RIPETENTE flag (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §2).
 */
export class StoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico || options.profonditaAnniStorico <= 0) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniStorico;
    const service = new StoricoAlunniService(this.databases);
    const alunnoCorrente = getAlunnoEntity(cdu);
    alunno.storico = new LazyRef(() =>
      buildStudentStoricoVm(service.perAlunno(email, profondita, alunnoCorrente))
    );
  }
}
```

- [ ] **Step 6: Run the full context-engine unit suite**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine`
Expected: PASS. (No existing test asserts `focus.alunno.storico`'s content directly against the old CAMBIO-driven fixtures in this directory — the only such coverage is `storico-services.test.ts`, already fixed in Task 5, and the online-test-only `storicoChecks.ts`, explicitly out of scope per Global Constraints.)

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/mappers/storicoMapper.ts src/application/context-engine/providers/StoricoProvider.ts test/unit/application/context-engine/mappers/storico-mapper.test.ts
git commit -m "feat(context-engine): thread presence fields through StudentStoricoVM, pass current-year Alunno to StoricoAlunniService"
```

---

## Task 7: `Cdu.ts` type additions

**Files:**

- Modify: `src/application/context-engine/Cdu.ts` (two sites: `AlunnoContestoVM.status` ~line 57-63, `CduAlunno['status']` ~line 294-298 — re-check exact line numbers with `grep -n "status: {" src/application/context-engine/Cdu.ts` since Task 5/6 edits don't touch this file)
- Modify: `test/unit/application/generator-strategies.test.ts` (literal `Cdu` object at line ~38)
- Modify: `test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts` (literal `AlunnoContestoVM`-returning helper at line ~13-19)

This task is purely mechanical (type additions + fixing the two hand-written literals the compiler will now reject) — no new behavior, no new tests.

- [ ] **Step 1: Add the two fields to `AlunnoContestoVM.status`**

In `src/application/context-engine/Cdu.ts`, replace:

```typescript
status: {
  isBes: boolean;
  isRipetente: boolean;
  isRappresentante: boolean;
  religione: string;
  religioneLabel: string;
}
```

with:

```typescript
status: {
  isBes: boolean;
  isRipetente: boolean;
  isRappresentante: boolean;
  religione: string;
  religioneLabel: string;
  presenteAnnoPrecedente: boolean;
  presenteTuttoAnno: boolean;
}
```

(This is the `AlunnoContestoVM` interface — verify by context: it is the block directly under `export interface AlunnoContestoVM {`.)

- [ ] **Step 2: Add the two fields to `CduAlunno['status']`**

In the same file, find the `CduAlunno` interface's `status` block (the one with `isBes: false` mentioned in `AlunnoProvider.ts`'s docstring — i.e. the block that does NOT have `isBes` before `isRipetente`/`isRappresentante` in the same order as step 1, since `CduAlunno.status` lists `religione`/`religioneLabel` first per `02_CDU_STRUTTURA.md:370-376`). Replace:

```typescript
status: {
  religione: string;
  religioneLabel: string;
  isBes: boolean;
  isRipetente: boolean;
  isRappresentante: boolean;
}
```

with:

```typescript
status: {
  religione: string;
  religioneLabel: string;
  isBes: boolean;
  isRipetente: boolean;
  isRappresentante: boolean;
  presenteAnnoPrecedente: boolean;
  presenteTuttoAnno: boolean;
}
```

- [ ] **Step 3: Run typecheck to find every literal that now fails**

Run: `npx tsc --noEmit -p tsconfig.eslint.json`
Expected: errors in `test/unit/application/generator-strategies.test.ts` and `test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts` (object literals missing the two new required properties). Fix any other errors this surfaces the same way (add both fields with a value consistent with that test's scenario — `false` unless the test specifically exercises presence semantics, which none of these two do).

- [ ] **Step 4: Fix `generator-strategies.test.ts`**

Replace:

```typescript
        status: { religione: 'SI', isBes: true, isRipetente: false, isRappresentante: false },
```

with:

```typescript
        status: {
          religione: 'SI',
          isBes: true,
          isRipetente: false,
          isRappresentante: false,
          presenteAnnoPrecedente: false,
          presenteTuttoAnno: true
        },
```

- [ ] **Step 5: Fix `specificita-alunni-mapper.test.ts`**

Replace:

```typescript
    status: {
      isBes: false,
      isRipetente: false,
      isRappresentante: false,
      religione: 'IRC',
      religioneLabel: 'x'
    },
```

with:

```typescript
    status: {
      isBes: false,
      isRipetente: false,
      isRappresentante: false,
      religione: 'IRC',
      religioneLabel: 'x',
      presenteAnnoPrecedente: false,
      presenteTuttoAnno: true
    },
```

- [ ] **Step 6: Run typecheck and the two affected suites**

Run: `npx tsc --noEmit -p tsconfig.eslint.json && npx jest --config jest.config.cjs test/unit/application/generator-strategies.test.ts test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts`
Expected: no type errors; both suites PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts test/unit/application/generator-strategies.test.ts test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts
git commit -m "feat(context-engine): add presenteAnnoPrecedente/presenteTuttoAnno to student status VM types"
```

---

## Task 8: `AlunnoProvider` — current-year presence fields

**Files:**

- Modify: `src/application/context-engine/providers/AlunnoProvider.ts`
- Modify: `test/unit/application/context-engine/alunno-provider.test.ts`
- Modify: `test/unit/application/context-engine/documenti-storico-provider.test.ts:49`
- Modify: `test/unit/application/context-engine/piani-pers-alunno-provider.test.ts:60`
- Modify: `test/unit/application/context-engine/documenti-carenzafocus.test.ts:31`
- Modify: `test/unit/application/context-engine/piano-focus-provider.test.ts:25`
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (constructor call site, ~line 99)

**Interfaces:**

- Consumes: `presenteTuttoAnno` (Task 3), `IAlunnoRepository.getStoricoMovimenti` (Task 4), `StoricoDatabaseProvider` (existing).
- Produces: `AlunnoProvider` constructor gains a required `storicoDb: StoricoDatabaseProvider` 5th parameter, inserted **before** the existing optional `teachingAssignments` (TypeScript forbids a required parameter after an optional one): `constructor(alunni, classi, oreAsl, materie, storicoDb, teachingAssignments?)`.

- [ ] **Step 1: Write the failing test in `alunno-provider.test.ts`**

Add a fake `StoricoDatabaseProvider` and thread it through `build()`. Replace:

```typescript
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(target: string, tables = fixtureTables()): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const materie = new MateriaRepository(db);
  const oreAsl = new OreASLRepository(db);
  const b = new ContextBuilder();
  b.registerProvider(
    'school',
    new SchoolProvider(
      new MasterSheetRepository(db),
      new RuoloSpecialeRepository(db),
      new DocenteRepository(db)
    )
  );
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('student', new AlunnoProvider(alunni, classi, oreAsl, materie));
```

with:

```typescript
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import type { AnnoStorico, StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function noHistory(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

function build(
  target: string,
  tables = fixtureTables(),
  storicoDb: StoricoDatabaseProvider = noHistory()
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const materie = new MateriaRepository(db);
  const oreAsl = new OreASLRepository(db);
  const b = new ContextBuilder();
  b.registerProvider(
    'school',
    new SchoolProvider(
      new MasterSheetRepository(db),
      new RuoloSpecialeRepository(db),
      new DocenteRepository(db)
    )
  );
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('student', new AlunnoProvider(alunni, classi, oreAsl, materie, storicoDb));
```

Then update the first assertion (line ~55-61) — replace:

```typescript
expect(a.status).toEqual({
  religione: 'IRC',
  religioneLabel: 'Religione cattolica',
  isBes: true,
  isRipetente: false,
  isRappresentante: true
});
```

with:

```typescript
expect(a.status).toEqual({
  religione: 'IRC',
  religioneLabel: 'Religione cattolica',
  isBes: true,
  isRipetente: false,
  isRappresentante: true,
  presenteAnnoPrecedente: false, // no historical database wired in this fixture
  presenteTuttoAnno: true // a1@school.it has no MOV_ALUNNI row in fixtureTables()
});
```

Finally, append two new tests at the end of the file (after the last existing `test(...)`):

```typescript
test('AlunnoProvider: presenteAnnoPrecedente true when a previous-year ALUNNI record exists (ANALYSIS_HISTORIC_ENRICH_EXTENSION §4)', () => {
  const priorTables = fixtureTables();
  const priorDb = new FakeDatabase(priorTables);
  const storicoDb: StoricoDatabaseProvider = {
    anniStorici: (profondita: number): AnnoStorico[] =>
      profondita > 0 ? [{ anno: '2025-2026', db: priorDb, logDocs: {} as never }] : []
  };
  const a = build('a1@school.it', fixtureTables(), storicoDb).focus.alunno!;
  expect(a.status.presenteAnnoPrecedente).toBe(true); // a1@school.it exists in fixtureTables() ALUNNI both times
});

test('AlunnoProvider: presenteTuttoAnno false when the student has a current-year IN/CAMBIO movement', () => {
  const tables = fixtureTables();
  (tables['MOV_ALUNNI'] as Row[]).push({
    STUDENTE: 'a1@school.it',
    TIPO: 'CAMBIO',
    DATA: '2026-02-01',
    DA: '5A',
    A: '5B'
  });
  const a = build('a1@school.it', tables).focus.alunno!;
  expect(a.status.presenteTuttoAnno).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/alunno-provider.test.ts`
Expected: FAIL — constructor arity mismatch (TS) and/or missing `status` fields.

- [ ] **Step 3: Update `AlunnoProvider.ts`**

Replace the whole file with:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduAlunno } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IOreASLRepository } from '../../../domain/repositories/IOreASLRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import {
  createTeachingCouncilProjection,
  prepareStudentCouncilAssignments,
  resolveCouncilForProjection
} from '../TeachingCouncilProjection';
import { AnnoScolastico } from '../../../domain/value-objects/AnnoScolastico';
import { setAlunnoEntity } from '../techEntities';
import { curriculumArray } from '../mappers/carenzeMapper';
import { religioneLabel } from '../mappers/labels';
import { presenteTuttoAnno } from '../../storico/presenza';
import { EntityNotFoundError } from '../../../domain/errors/DomainError';

/**
 * Populates `focus.alunno` anagrafica/status/curriculum/classe and the didattica
 * skeleton incl. ASL hours (09 §4). `status.isBes` is initialised to false as a
 * placeholder — PianiProvider (which reads PIANI, later in the recipe) flips it
 * to true when the student has a BES plan. Carenze and piani sub-sections are
 * filled by their own providers. Stashes the live Alunno entity in tech.entita.
 * `status.presenteAnnoPrecedente`/`presenteTuttoAnno` mirror the historical
 * per-year fields on `StudentStoricoVM.anni[]` (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md
 * §4/§5) but for the CURRENT year: presenteAnnoPrecedente looks one year back
 * through `storicoDb` (cheap — that provider caches opened databases by
 * spreadsheet id across the whole CDU build), presenteTuttoAnno reads this
 * year's own MOV_ALUNNI via `IAlunnoRepository.getStoricoMovimenti`.
 */
export class AlunnoProvider implements ContextProvider {
  private readonly projection: CollectionProjectionInterceptor;

  constructor(
    private readonly alunni: IAlunnoRepository,
    private readonly classi: IClasseRepository,
    private readonly oreAsl: IOreASLRepository,
    private readonly materie: IMateriaRepository,
    private readonly storicoDb: StoricoDatabaseProvider,
    private readonly teachingAssignments?: ITeachingAssignmentResolver
  ) {
    this.projection = createTeachingCouncilProjection(classi, materie).alunno;
  }

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const alunno = this.alunni.findById(params.target);
    if (alunno === null) throw new EntityNotFoundError(`Alunno ${params.target} non trovato`);
    setAlunnoEntity(cdu, alunno);

    const classe = this.classi.findById(alunno.classeId);
    if (classe === null)
      throw new EntityNotFoundError(
        `Classe ${alunno.classe} dell'alunno ${params.target} non trovata`
      );
    const indirizzo = this.classi.getIndirizzo(classe);

    const focusAlunno: CduAlunno = {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      status: {
        religione: alunno.religione,
        religioneLabel: religioneLabel(alunno.religione),
        isBes: false,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante(),
        presenteAnnoPrecedente: this.presenteAnnoPrecedente(alunno),
        presenteTuttoAnno: presenteTuttoAnno(this.alunni.getStoricoMovimenti(alunno))
      },
      curriculum: curriculumArray(alunno, this.materie),
      classe: {
        nome: classe.nome,
        indirizzoSigla: classe.indirizzo,
        indirizzoNome: indirizzo.nome
      },
      didattica: {
        carenze: { dettaglio: [], numero: 0, hasCarenze: false },
        asl: {
          oreCumulate: this.oreAsl.getTotaleOre(alunno),
          oreAnnoCorrente: this.oreAnnoCorrente(cdu, alunno)
        },
        piani: { items: [], hasPiani: false, hasBes: false }
      }
    };
    // Per-alunno filtered council (14 §1.3): built here because alunno recipes
    // don't run the consiglio provider. Only when the shared port is wired in.
    if (this.teachingAssignments !== undefined) {
      const assignments = resolveCouncilForProjection(
        this.teachingAssignments,
        classe,
        params.now,
        options.gestioneSupplenti
      );
      focusAlunno.consiglioDiClasseFiltrato = prepareStudentCouncilAssignments(
        assignments,
        alunno.religione,
        focusAlunno.curriculum
      ) as never;
    }

    cdu.focus.alunno = focusAlunno;
    if (focusAlunno.consiglioDiClasseFiltrato !== undefined) {
      this.projection.intercept('student', cdu, cdu, options);
    }
  }

  private oreAnnoCorrente(cdu: Cdu, alunno: Alunno): number {
    const anno = cdu.istituto?.organizzazione.annoScolastico;
    if (anno === undefined || anno === '') return 0;
    return this.oreAsl.getOrCreate(alunno, AnnoScolastico.of(anno)).getOre();
  }

  private presenteAnnoPrecedente(alunno: Alunno): boolean {
    const annoPrecedente = this.storicoDb.anniStorici(1)[0];
    if (annoPrecedente === undefined) return false;
    return new AlunnoRepository(annoPrecedente.db).findById(alunno.email.value) !== null;
  }
}
```

- [ ] **Step 4: Fix the four other test files' `AlunnoProvider` construction**

In each of `test/unit/application/context-engine/documenti-storico-provider.test.ts`, `piani-pers-alunno-provider.test.ts`, `documenti-carenzafocus.test.ts`, `piano-focus-provider.test.ts` — these all just need a `noHistory()`-style fake threaded through. `documenti-storico-provider.test.ts` already builds a `StoricoDatabaseProvider` named `databases` in scope for its own `DocumentiStoricoProvider` — reuse it. Replace:

```typescript
new AlunnoProvider(alunni, classi, new OreASLRepository(db), new MateriaRepository(db));
```

with (in `documenti-storico-provider.test.ts` only, since `databases` is already a parameter there):

```typescript
new AlunnoProvider(alunni, classi, new OreASLRepository(db), new MateriaRepository(db), databases);
```

For the other three files (`piani-pers-alunno-provider.test.ts`, `documenti-carenzafocus.test.ts`, `piano-focus-provider.test.ts`), first check whether each already imports `StoricoDatabaseProvider`/has one in scope (`grep -n "StoricoDatabaseProvider" <file>`). If not, add a local no-op right above the `AlunnoProvider` construction:

```typescript
const storicoDb: import('../../../../src/application/storico/StoricoDatabaseProvider').StoricoDatabaseProvider =
  {
    anniStorici: () => []
  };
```

(or a proper top-of-file `import type` if the file's style prefers that — match the file's existing import style) and then replace:

```typescript
new AlunnoProvider(alunni, classi, new OreASLRepository(db), new MateriaRepository(db));
```

with:

```typescript
new AlunnoProvider(alunni, classi, new OreASLRepository(db), new MateriaRepository(db), storicoDb);
```

- [ ] **Step 5: Update `ContextEngineFactory.ts`**

Replace:

```typescript
      .registerProvider(
        'student',
        new AlunnoProvider(alunni, classi, oreAsl, materie, teachingAssignments)
      )
```

with:

```typescript
      .registerProvider(
        'student',
        new AlunnoProvider(alunni, classi, oreAsl, materie, storicoDb, teachingAssignments)
      )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.eslint.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/providers/AlunnoProvider.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/context-engine/alunno-provider.test.ts test/unit/application/context-engine/documenti-storico-provider.test.ts test/unit/application/context-engine/piani-pers-alunno-provider.test.ts test/unit/application/context-engine/documenti-carenzafocus.test.ts test/unit/application/context-engine/piano-focus-provider.test.ts
git commit -m "feat(context-engine): compute presenteAnnoPrecedente/presenteTuttoAnno on focus.alunno.status"
```

---

## Task 9: `StudentiProvider` — current-year presence fields for the roster

**Files:**

- Modify: `src/application/context-engine/providers/StudentiProvider.ts`
- Modify: `test/unit/application/context-engine/studenti-provider.test.ts`
- Modify: `test/unit/application/context-engine/providers/partner-projection-provider.test.ts:58`
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (constructor call site, ~line 89)

**Interfaces:**

- Consumes: `presenteTuttoAnno` (Task 3), `IAlunnoRepository.getStoricoMovimenti` (Task 4).
- Produces: `StudentiProvider` constructor gains a required 4th parameter `storicoDb: StoricoDatabaseProvider`.

- [ ] **Step 1: Write the failing test in `studenti-provider.test.ts`**

Replace:

```typescript
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(
  target: string,
  tables = fixtureTables(),
  optionOverrides: Parameters<typeof makeOptions>[0] = {}
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('students', new StudentiProvider(classi, alunni, materie));
```

with:

```typescript
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import type { StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function noHistory(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

function build(
  target: string,
  tables = fixtureTables(),
  optionOverrides: Parameters<typeof makeOptions>[0] = {},
  storicoDb: StoricoDatabaseProvider = noHistory()
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('students', new StudentiProvider(classi, alunni, materie, storicoDb));
```

Then update the `'StudentiProvider: full alunno-in-context VM (status/curriculum/didattica)'` test's `status` block — replace:

```typescript
    status: {
      isBes: true,
      isRipetente: false,
      isRappresentante: true,
      religione: 'IRC',
      religioneLabel: 'Religione cattolica'
    },
```

with:

```typescript
    status: {
      isBes: true,
      isRipetente: false,
      isRappresentante: true,
      religione: 'IRC',
      religioneLabel: 'Religione cattolica',
      presenteAnnoPrecedente: false,
      presenteTuttoAnno: true
    },
```

Then append a new test at the end of the file:

```typescript
test('StudentiProvider: presenteAnnoPrecedente/presenteTuttoAnno computed per roster student (ANALYSIS_HISTORIC_ENRICH_EXTENSION §4/§5)', () => {
  const priorDb = new FakeDatabase(fixtureTables());
  const storicoDb: StoricoDatabaseProvider = {
    anniStorici: (profondita: number) =>
      profondita > 0 ? [{ anno: '2025-2026', db: priorDb, logDocs: {} as never }] : []
  };
  const tables = fixtureTables();
  // a2@school.it already has an IN movement in fixtureTables() (2025-09-15) -> presenteTuttoAnno false.
  const cdu = build('5A', tables, {}, storicoDb);
  const a1 = cdu.focus.classe!.studenti!.listaCompleta.find(
    (a) => a.anagrafica.email === 'a1@school.it'
  )!;
  expect(a1.status.presenteAnnoPrecedente).toBe(true); // exists in priorDb's fixtureTables() too
  expect(a1.status.presenteTuttoAnno).toBe(true); // no MOV_ALUNNI row for a1
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/studenti-provider.test.ts`
Expected: FAIL — constructor arity mismatch and missing status fields.

- [ ] **Step 3: Update `StudentiProvider.ts`**

Replace the whole file with:

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu, AlunnoContestoVM } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { getClasseEntity } from '../techEntities';
import { carenzeDettaglioSemplice, curriculumArray } from '../mappers/carenzeMapper';
import { tipoPianoLabel, religioneLabel } from '../mappers/labels';
import { buildPerSpecificita } from '../mappers/specificitaAlunniMapper';
import { presenteTuttoAnno } from '../../storico/presenza';

/**
 * Populates `focus.classe.studenti.listaCompleta` (02 §4.1/§8.7). Each item is
 * self-contained: it carries its own classe/indirizzo (Principle 2) so
 * templates never navigate back to `focus.classe.anagrafica` inside a loop.
 * For the parent of an articulated class the roster is the union across both
 * partner classes — no per-indirizzo grouping (moved to `focus.classe.partner`, 02 §2.5).
 * `status.presenteAnnoPrecedente` looks up each student in the previous year's
 * database once per `provide()` call (that database is cached across the
 * whole CDU build by `storicoDb`); `status.presenteTuttoAnno` reads this
 * year's own MOV_ALUNNI (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §4/§5).
 */
export class StudentiProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly materie: IMateriaRepository,
    private readonly storicoDb: StoricoDatabaseProvider
  ) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const annoPrecedente = this.storicoDb.anniStorici(1)[0];
    const alunniAnnoPrecedente =
      annoPrecedente !== undefined ? new AlunnoRepository(annoPrecedente.db) : null;

    const config = this.classi.getArticolazione(classe);
    const sourceClassi =
      config?.isParent() === true ? this.classi.getClassiPartner(classe) : [classe];
    const listaCompleta = sourceClassi.flatMap((source) =>
      this.classi
        .getStudenti(source)
        .filter((alunno) => alunno.isAttivo())
        .map((alunno) => this.buildVM(alunno, focusClasse, alunniAnnoPrecedente))
    );
    focusClasse.studenti = {
      listaCompleta,
      perSpecificita: buildPerSpecificita(listaCompleta)
    };
  }

  private buildVM(
    alunno: Alunno,
    focusClasse: NonNullable<Cdu['focus']['classe']>,
    alunniAnnoPrecedente: IAlunnoRepository | null
  ): AlunnoContestoVM {
    const dettaglio = carenzeDettaglioSemplice(
      this.alunni.getCarenze(alunno),
      this.materie.findAllSigle(),
      this.materie
    );
    const pianiItems = this.alunni
      .getPiani(alunno)
      .map((p) => ({ tipo: p.tipo, tipoLabel: tipoPianoLabel(p.tipo), isBes: p.isBES() }));
    const hasBes = pianiItems.some((p) => p.isBes);
    return {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      classe: { nome: focusClasse.anagrafica.nome },
      indirizzo: {
        nome: focusClasse.anagrafica.indirizzo.nome,
        nomeSintetico: focusClasse.anagrafica.indirizzo.nomeSintetico
      },
      status: {
        isBes: hasBes,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante(),
        religione: alunno.religione,
        religioneLabel: religioneLabel(alunno.religione),
        presenteAnnoPrecedente: alunniAnnoPrecedente?.findById(alunno.email.value) !== null,
        presenteTuttoAnno: presenteTuttoAnno(this.alunni.getStoricoMovimenti(alunno))
      },
      curriculum: curriculumArray(alunno, this.materie),
      didattica: {
        carenze: { hasCarenze: dettaglio.length > 0, numero: dettaglio.length, dettaglio },
        piani: { hasPiani: pianiItems.length > 0, hasBes, items: pianiItems },
        pcto: { oreCumulate: this.alunni.getOreASLTotali(alunno) }
      }
    };
  }
}
```

Note the `alunniAnnoPrecedente?.findById(alunno.email.value) !== null` line: when `alunniAnnoPrecedente` is `null` (no previous year at all), `alunniAnnoPrecedente?.findById(...)` evaluates to `undefined`, and `undefined !== null` is `true` — which would incorrectly report presence. Guard explicitly instead:

```typescript
        presenteAnnoPrecedente:
          alunniAnnoPrecedente !== null && alunniAnnoPrecedente.findById(alunno.email.value) !== null,
```

Use this corrected line in the file, not the shorthand above.

- [ ] **Step 4: Fix `partner-projection-provider.test.ts`**

Add `noHistory()` and thread it through. Replace:

```typescript
const studentiProvider = new StudentiProvider(classi, alunni, materie);
```

with (adding a local fake right above it, matching the file's existing style of inline setup):

```typescript
const storicoDb = { anniStorici: () => [] };
const studentiProvider = new StudentiProvider(classi, alunni, materie, storicoDb);
```

- [ ] **Step 5: Update `ContextEngineFactory.ts`**

Replace:

```typescript
const studentiProvider = new StudentiProvider(classi, alunni, materie);
```

with:

```typescript
const studentiProvider = new StudentiProvider(classi, alunni, materie, storicoDb);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.eslint.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/providers/StudentiProvider.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/context-engine/studenti-provider.test.ts test/unit/application/context-engine/providers/partner-projection-provider.test.ts
git commit -m "feat(context-engine): compute presenteAnnoPrecedente/presenteTuttoAnno per roster student"
```

---

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all suites pass (no regressions outside what Tasks 5-9 already fixed).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no `no-restricted-globals` violations — this plan never touches native GAS globals directly; all historical-DB access goes through the same `RepositoryDatabase`/`Repository` abstractions already used elsewhere).

- [ ] **Step 4: Build (testing mode, catches webpack/TS issues offline tests don't)**

Run: `npm run build:testing`
Expected: succeeds.

- [ ] **Step 5: Report follow-up scope to the user**

Tell the user explicitly (do not silently drop this): the online E2E fixtures (`SharedTestDatabaseBuilder.ts`/`Seeders.ts`'s `seedStorico`/`storicoChecks.ts`) still encode the old CAMBIO-based algorithm and a `TIPO=OUT`-as-RITIRATO fixture, and need a dedicated follow-up pass — designing the current-year `RIPETENTE` wiring for `e2eAlunnoEmail(138)`/`(139)` requires re-tracing which current-year class those synthetic emails land in, which was out of scope here.

- [ ] **Step 6: No commit for this task** (verification only — nothing to stage).
