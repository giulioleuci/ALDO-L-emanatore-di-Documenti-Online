# Effective-Teacher Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CattedraResolver` the single, always-consulted authority for "who
actually teaches this class+subject on this date", and make every consumer (CDU
class council, `RisolutoreRuoliService` roles, document ACLs, email recipients)
route through it, so `VARIAZIONI_CATTEDRA` permanent chair changes are honored
everywhere instead of only in the currently-dead `CattedraResolver`.

**Architecture:** `CattedraResolver` (self-constructs its repos from a
`RepositoryDatabase`, matching its own existing convention) gains a richer
`CattedraAssignment` return shape and a class-wide `resolveConsiglio` fan-out.
`CdcAssembler` stops reading nominal `CLASSI` and builds `consiglioDiClasse` by
grouping `CattedraAssignment`s — splitting into multiple rows when one titolare's
subjects have different supplente state (confirmed design). `RisolutoreRuoliService`
and `EmailNotificationService` switch their teacher enumeration to the resolver.
`SwapAndEnrichInterceptor`'s ALDO-side policy (`SupplentiSubstitutionLookup.ts`) is
retired — it cannot add/remove CDU rows, only annotate, so it can't do split-rows.

**Tech Stack:** TypeScript, Jest (`ts-jest`), GAS V8 target. `RoleResolutionLib`
(`PriorityChainResolver`, `InMemoryDelegationSource`, `Delegation`, `Scope`,
`RoutingResolver`, `RoutingPolicy`, `Actor`, `ActorType`) is consumed as **ambient
globals** (declared in `types/gaslibs/index.d.ts`, no import statement — matches
every existing call site in this codebase, e.g. `CattedraResolver.ts`,
`RisolutoreRuoliService.ts`).

## Global Constraints

- Native GAS globals (`DriveApp`, `SpreadsheetApp`, etc.) only inside
  `GoogleApiWrapper` — none of this work touches that layer.
- Never edit `dist/*`.
- No circular dependencies across the L0–L4 library layers or `src/domain` →
  `src/application` → `src/infrastructure` direction.
- Domain layer (`src/domain/**`) stays Google-service-agnostic.
- `npm run typecheck`, `npm run lint`, and the affected Jest projects must pass
  before any task is considered done.
- Do not weaken tests, lint rules, or architecture checks to make something pass.
- Design source of truth: `docs/superpowers/specs/2026-07-25-cattedra-resolution-design.md`.
- Confirmed product decisions (do not re-litigate): (1) any `VARIAZIONI_CATTEDRA`
  data inconsistency throws a typed domain error — never a silent wrong holder;
  (2) the CDU class council **splits rows** when one titolare has different
  supplente state across subjects.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/errors/DomainError.ts` | +3 new error classes |
| `src/infrastructure/repositories/VariazioneCattedraRepository.ts` | drop dead `findVariazioneAttiva` |
| `src/application/services/CattedraResolver.ts` | rewritten: latest-`DATA_DECORRENZA` + slot-aware `VECCHIO_TITOLARE` guard, ITP support, `CattedraAssignment`/`resolveConsiglio` |
| `src/application/context-engine/Recipe.ts` + `Cdu.ts` | typed `gestioneSupplenti` recipe option |
| `src/application/context-engine/CdcAssembler.ts` | rewritten: assignment-driven, split-row grouping |
| `src/application/context-engine/providers/ConsiglioClasseProvider.ts`, `providers/AlunnoProvider.ts` | thread `date`/`gestioneSupplenti` through |
| `src/application/context-engine/ContextEngineFactory.ts` | wire `CattedraResolver` into `CdcAssembler`/`ConsiglioClasseProvider`; drop the `SwapAndEnrichInterceptor` registration |
| `src/application/context-engine/interceptors/SupplentiSubstitutionLookup.ts` | **deleted** (superseded) |
| `src/application/services/RisolutoreRuoliService.ts` | teacher-enumeration roles switch to `CattedraResolver` |
| `src/application/services/EmailNotificationService.ts` | `cdcEmails` switches to `CattedraResolver` |
| `test/fixtures/tables.ts` | fix an inconsistent `VARIAZIONI_CATTEDRA` scope |
| various `test/unit/**` | new + updated coverage per task |

---

### Task 1: New domain errors for VARIAZIONI_CATTEDRA data integrity

**Files:**
- Modify: `src/domain/errors/DomainError.ts`
- Test: `test/unit/domain/domain-error.test.ts` (new file)

**Interfaces:**
- Produces: `AmbiguousVariazioneCattedraError`, `VariazioneCattedraInconsistenteError`,
  `VariazioneCattedraTitolareNonTrovatoError` — all `extends DomainError`, used by
  Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/domain/domain-error.test.ts
import {
  DomainError,
  AmbiguousVariazioneCattedraError,
  VariazioneCattedraInconsistenteError,
  VariazioneCattedraTitolareNonTrovatoError
} from '../../../src/domain/errors/DomainError';

test.each([
  ['AmbiguousVariazioneCattedraError', AmbiguousVariazioneCattedraError],
  ['VariazioneCattedraInconsistenteError', VariazioneCattedraInconsistenteError],
  ['VariazioneCattedraTitolareNonTrovatoError', VariazioneCattedraTitolareNonTrovatoError]
])('%s is a named DomainError', (name, Ctor) => {
  const err = new Ctor('boom');
  expect(err).toBeInstanceOf(DomainError);
  expect(err.name).toBe(name);
  expect(err.message).toBe('boom');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/domain-error.test.ts`
Expected: FAIL — `AmbiguousVariazioneCattedraError` is not exported.

- [ ] **Step 3: Add the three error classes**

```ts
// src/domain/errors/DomainError.ts — append after MateriaNotFoundError
export class AmbiguousVariazioneCattedraError extends DomainError {}
export class VariazioneCattedraInconsistenteError extends DomainError {}
export class VariazioneCattedraTitolareNonTrovatoError extends DomainError {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/domain-error.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/errors/DomainError.ts test/unit/domain/domain-error.test.ts
git commit -m "feat(domain): add VARIAZIONI_CATTEDRA data-integrity error types"
```

---

### Task 2: Remove dead `findVariazioneAttiva` and fix an inconsistent fixture row

`findVariazioneAttiva` has zero production callers (confirmed via
`codebase-memory-mcp`: `caller_names` was only its own test) and duplicates,
buggily (first-array-match, not latest-`DATA_DECORRENZA`), what `CattedraResolver`
will now do correctly. It is not in `IVariazioneCattedraRepository`, so removing
the concrete method is not a breaking interface change.

Separately: `test/fixtures/tables.ts`'s `VARIAZIONI_CATTEDRA` row scopes
`CLASSE_ID: '5A,3B'` for `MATERIA_ID: 'MATE'` with `VECCHIO_TITOLARE: 'rossi@school.it'`
— but `3B`'s nominal `MATE` holder in the same fixture is `bianchi@school.it`, not
`rossi@school.it`. Nothing ever caught this because nothing consulted
`VARIAZIONI_CATTEDRA` in production before. Once Task 3 lands, resolving `(3B, MATE)`
at any date ≥ `2025-10-01` will correctly throw
`VariazioneCattedraInconsistenteError` on this row — which breaks
`sheet-materie-generator.test.ts`'s `'a class with no CDC subjects protects
nothing'` test (it builds a CDU for `3B` before overwriting `consiglioDiClasse`).
Nothing in the suite actually exercises the `3B` half of that CSV scope, so
narrowing it to `5A` only is a pure fix, not a coverage loss.

**Files:**
- Modify: `src/infrastructure/repositories/VariazioneCattedraRepository.ts`
- Modify: `test/unit/infrastructure/variazione-cattedra-repository.test.ts`
- Modify: `test/fixtures/tables.ts`

- [ ] **Step 1: Remove the `findVariazioneAttiva` test**

Delete this test from `test/unit/infrastructure/variazione-cattedra-repository.test.ts`:

```ts
test('findVariazioneAttiva returns the covering variation, else null (Priority 2)', () => {
  const r = repo();
  expect(r.findVariazioneAttiva(ClasseId.of('5A'), MateriaId.of('MATE'))!.nuovoTitolare).toBe(
    'bianchi@school.it'
  );
  expect(r.findVariazioneAttiva(ClasseId.of('5A'), MateriaId.of('FISI'))).toBeNull();
});
```

- [ ] **Step 2: Run the file to verify the remaining tests still pass**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/variazione-cattedra-repository.test.ts`
Expected: PASS (3 tests remaining) — `findVariazioneAttiva` still exists on the class, so this is a no-op check before removal.

- [ ] **Step 3: Delete the method**

In `src/infrastructure/repositories/VariazioneCattedraRepository.ts`, remove:

```ts
  /** First variation covering the (class, subject) pair; null if none (ref 06 §20). */
  findVariazioneAttiva(classeId: ClasseId, materiaId: MateriaId): VariazioneCattedra | null {
    return this.findAll().find((v) => v.applicaAContesto(classeId, materiaId)) ?? null;
  }
```

- [ ] **Step 4: Run typecheck and the test file**

Run: `npm run typecheck`
Expected: PASS — no other file references `findVariazioneAttiva` (verify with
`grep -rn "findVariazioneAttiva" src test` if unsure; only the deleted test used it).

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/variazione-cattedra-repository.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Fix the fixture scope**

In `test/fixtures/tables.ts`, in the `VARIAZIONI_CATTEDRA` array, change:

```ts
      {
        CLASSE_ID: '5A,3B',
        MATERIA_ID: 'MATE',
        VECCHIO_TITOLARE: 'rossi@school.it',
        NUOVO_TITOLARE: 'bianchi@school.it',
        DATA_DECORRENZA: '2025-10-01'
      },
```

to:

```ts
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MATE',
        VECCHIO_TITOLARE: 'rossi@school.it',
        NUOVO_TITOLARE: 'bianchi@school.it',
        DATA_DECORRENZA: '2025-10-01'
      },
```

- [ ] **Step 6: Run the full fixture-dependent repository test to confirm no regression**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/variazione-cattedra-repository.test.ts`
Expected: PASS (3 tests) — `findByClasse('5A')`, `findByMateria('MATE')`, and
`findByNuovoTitolare` assertions are all unaffected by dropping `3B` from the scope.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/repositories/VariazioneCattedraRepository.ts \
  test/unit/infrastructure/variazione-cattedra-repository.test.ts \
  test/fixtures/tables.ts
git commit -m "fix(repo): drop dead findVariazioneAttiva, fix inconsistent fixture scope"
```

---

### Task 3: `CattedraResolver` — correct Priority-2 selection (latest wins, slot-aware guard)

This is the core fix. Current `daVariazione` picks the first array match
(row order) and never throws on bad data. New algorithm per
`(classe, materia, isItp)` slot:

1. Filter `VARIAZIONI_CATTEDRA` rows by CSV scope (`applicaAMateria`) and
   `isDecorsaA(date)`.
2. Partition by whether `VECCHIO_TITOLARE` is one of *this slot's* nominal
   holders (main or itp — Task 4 adds the itp half; this task's slot is always
   "main" since `.itp` support doesn't exist yet, so every candidate is compared
   against the main-column nominal holders only).
3. If any decorsa, scope-matching candidate matches **neither** slot →
   `VariazioneCattedraInconsistenteError` (a row that claims to cover this
   class+subject+date but names a titolare who never actually held it).
4. Among candidates relevant to *this* slot, the max `DATA_DECORRENZA` wins; a
   tie on that max → `AmbiguousVariazioneCattedraError`.
5. The winning row's `NUOVO_TITOLARE` must resolve in `DOCENTI` →
   `VariazioneCattedraTitolareNonTrovatoError` if not.

Task 4 (immediately following) adds the itp slot and turns "matches neither
slot" from "always the main slot" into "matches neither the main nor the itp
slot" — this task's implementation is written generically enough (taking
`nominali: Docente[]` for the slot being resolved) that Task 4 only adds a
second call with the itp nominal list, no rewrite needed here.

**Files:**
- Modify: `src/application/services/CattedraResolver.ts`
- Test: `test/unit/application/cattedra-resolver.test.ts`

**Interfaces:**
- Consumes: `VariazioneCattedra.applicaAMateria(materia: MateriaId): boolean`,
  `.isDecorsaA(date: Date): boolean`, `.dataDecorrenza: string`,
  `.vecchioTitolare: string`, `.nuovoTitolare: string`, `.id: string | null`
  (all confirmed in `src/domain/entities/VariazioneCattedra.ts`).
- Produces: same public method names as today (`resolveTitolari`,
  `resolveTitolare`) — signature unchanged in this task; behavior fixed.

- [ ] **Step 1: Update the existing "ghost titolare" test to expect a throw, not `[]`**

In `test/unit/application/cattedra-resolver.test.ts`, replace:

```ts
test('a variazione pointing at a non-existent docente yields no holder, not the CLASSI fallback', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [{ EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' }],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'ghost@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  expect(resolver.resolveTitolari(classe, MAT, new Date('2025-10-15'))).toEqual([]);
});
```

with:

```ts
test('a variazione pointing at a non-existent docente throws, never falls back to CLASSI', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [{ EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' }],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'ghost@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  expect(() => resolver.resolveTitolari(classe, MAT, new Date('2025-10-15'))).toThrow(
    VariazioneCattedraTitolareNonTrovatoError
  );
});
```

Add the import at the top of the file:

```ts
import { VariazioneCattedraTitolareNonTrovatoError } from '../../../src/domain/errors/DomainError';
```

- [ ] **Step 2: Add new tests for tie / inconsistent / itp-irrelevant-not-thrown cases**

Append to `test/unit/application/cattedra-resolver.test.ts`:

```ts
import {
  AmbiguousVariazioneCattedraError,
  VariazioneCattedraInconsistenteError
} from '../../../src/domain/errors/DomainError';

test('two variazioni tied on the same latest DATA_DECORRENZA throw ambiguous', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M' }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      },
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'verdi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  expect(() => resolver.resolveTitolare(classe, MAT, new Date('2025-11-01'))).toThrow(
    AmbiguousVariazioneCattedraError
  );
});

test('two variazioni with different DATA_DECORRENZA: the latest wins', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M' }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-09-01'
      },
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'verdi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  // Both rows are decorsa and scope-matching, but both claim VECCHIO_TITOLARE
  // rossi@s.it -- only one can be "the" transition FROM the nominal holder;
  // the later DATA_DECORRENZA (verdi) is the current state of the world.
  expect(resolver.resolveTitolare(classe, MAT, new Date('2025-11-01'))!.id).toBe('verdi@s.it');
});

test('a variazione whose VECCHIO_TITOLARE matches nobody in this class+subject throws inconsistente', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' }
    ],
    // Nominal MAT holder is bianchi, not rossi.
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'bianchi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  expect(() => resolver.resolveTitolare(classe, MAT, new Date('2025-11-01'))).toThrow(
    VariazioneCattedraInconsistenteError
  );
});
```

- [ ] **Step 3: Run to verify the new/updated tests fail against current code**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: FAIL — the "ghost" test now expects a throw but gets `[]`; the tie/latest-wins/inconsistente tests fail because current `daVariazione` uses `.find()` (first match) and never throws.

- [ ] **Step 4: Rewrite `CattedraResolver`'s Priority-2 logic**

Replace the whole file `src/application/services/CattedraResolver.ts` with:

```ts
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../../infrastructure/repositories/VariazioneCattedraRepository';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
import type { IVariazioneCattedraRepository } from '../../domain/repositories/IVariazioneCattedraRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import type { VariazioneCattedra } from '../../domain/entities/VariazioneCattedra';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import {
  AmbiguousVariazioneCattedraError,
  VariazioneCattedraInconsistenteError,
  VariazioneCattedraTitolareNonTrovatoError
} from '../../domain/errors/DomainError';

/** One resolved cattedra slot: the effective permanent holder plus any active substitute (Task 4 adds `materia`/`isItp` fan-out via resolveConsiglio). */
export interface CattedraAssignment {
  titolare: Docente;
  isItp: boolean;
  supplente: Docente | null;
}

/**
 * Resolves the teacher(s) actually in charge of a (class, subject) at a given
 * date, applying the three-tier role-resolution hierarchy (ref 01 §4, CLAUDE.md):
 *
 *   Priority 1 — SUPPLENZE:          an active supplenza's (chain-resolved)
 *                                    substitute overrides everything
 *   Priority 2 — VARIAZIONI_CATTEDRA: a variation with DATA_DECORRENZA ≤ date
 *                                    replaces the nominal CLASSI holder
 *   Priority 3 — CLASSI (fallback):  the teacher in the subject column
 *
 * The first priority that produces a match wins; lower priorities are not
 * consulted for that holder.
 */
export class CattedraResolver {
  private readonly classi: IClasseRepository;
  private readonly docenti: IDocenteRepository;
  private readonly supplenze: ISupplenzaRepository;
  private readonly variazioni: IVariazioneCattedraRepository;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.supplenze = new SupplenzaRepository(database);
    this.variazioni = new VariazioneCattedraRepository(database);
  }

  /** Effective teachers for the class/subject at `data` (main column only until Task 4). */
  resolveTitolari(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const nominali = this.classi.getDocentiPerMateria(classe, materia);
    const titolari = this.risolviSlot(classe, materia, data, nominali);
    const effettivi: Docente[] = [];
    const seen = new Set<string>();
    for (const titolare of titolari) {
      const risolto = this.applicaSupplenza(titolare, classe, materia, data);
      if (risolto.id != null && !seen.has(risolto.id)) {
        seen.add(risolto.id);
        effettivi.push(risolto);
      }
    }
    return effettivi;
  }

  /** First effective teacher, or null when the subject has no holder. */
  resolveTitolare(classe: Classe, materia: MateriaId, data: Date): Docente | null {
    return this.resolveTitolari(classe, materia, data)[0] ?? null;
  }

  /**
   * Priority 2-over-3 for one nominal slot: `nominali` is the Priority-3 holder
   * set for the slot being resolved (main column here; Task 4 adds the itp
   * column as a second slot). Throws rather than silently falling back on any
   * data inconsistency (confirmed product decision).
   */
  private risolviSlot(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    nominali: Docente[]
  ): Docente[] {
    const decorse = this.variazioni
      .findByClasse(classe.classeId)
      .filter((v) => v.applicaAMateria(materia) && v.isDecorsaA(data));
    if (decorse.length === 0) return nominali;

    const nominaliIds = new Set(nominali.map((d) => d.id));
    const perQuestoSlot = decorse.filter((v) => nominaliIds.has(v.vecchioTitolare));
    if (perQuestoSlot.length === 0) {
      if (this.matchesNoSlotAtAll(decorse, classe, materia)) {
        const v = decorse[0]!;
        throw new VariazioneCattedraInconsistenteError(
          `VARIAZIONI_CATTEDRA ${v.id ?? '?'} (VECCHIO_TITOLARE=${v.vecchioTitolare}) non corrisponde ` +
            `al titolare nominale attuale di ${classe.id ?? '?'}/${materia.value}`
        );
      }
      return nominali; // relevant to another slot only (e.g. itp) — this slot defers to CLASSI
    }

    const maxDecorrenza = Math.max(
      ...perQuestoSlot.map((v) => new Date(v.dataDecorrenza).getTime())
    );
    const vincitrici = perQuestoSlot.filter(
      (v) => new Date(v.dataDecorrenza).getTime() === maxDecorrenza
    );
    if (vincitrici.length > 1) {
      throw new AmbiguousVariazioneCattedraError(
        `Più VARIAZIONI_CATTEDRA con la stessa DATA_DECORRENZA più recente per ` +
          `${classe.id ?? '?'}/${materia.value}: ${vincitrici.map((v) => v.id ?? '?').join(', ')}`
      );
    }
    const vinta = vincitrici[0]!;
    const nuovo = this.docenti.findById(vinta.nuovoTitolare);
    if (nuovo === null) {
      throw new VariazioneCattedraTitolareNonTrovatoError(
        `VARIAZIONI_CATTEDRA ${vinta.id ?? '?'}: NUOVO_TITOLARE ${vinta.nuovoTitolare} non trovato in DOCENTI`
      );
    }
    return [nuovo];
  }

  /** True when every decorsa/scope-matching row also fails to match a hypothetical itp slot — i.e. it's a straight-up bad row, not just "for the other slot" (Task 4 gives this a real itp nominal list to check against; until then any non-main match is treated as inconsistent). */
  private matchesNoSlotAtAll(
    decorse: VariazioneCattedra[],
    classe: Classe,
    materia: MateriaId
  ): boolean {
    void classe;
    void materia;
    return decorse.length > 0;
  }

  // Priority 1: redirect a holder to the chain-resolved active substitute.
  private applicaSupplenza(
    titolare: Docente,
    classe: Classe,
    materia: MateriaId,
    data: Date
  ): Docente {
    const supplenza = this.supplenze.findSupplenzaSpecifica(
      titolare,
      data,
      classe.classeId,
      materia
    );
    if (supplenza === null) return titolare;
    return this.docenti.findById(supplenza.supplente) ?? titolare;
  }
}
```

Note: `matchesNoSlotAtAll` is deliberately a placeholder seam for Task 4 (it
takes `classe`/`materia` it doesn't use yet, marked with `void` to satisfy
`noUnusedParameters`) — Task 4 replaces its body with a real itp-nominal-list
check instead of always returning `true`. This task alone has no itp column to
check against, so "not for this slot" always means "inconsistent" here, which is
correct for every test in this task (none involve `.itp` columns).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: PASS (all tests, old + new)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/application/services/CattedraResolver.ts test/unit/application/cattedra-resolver.test.ts
git commit -m "fix(cattedra): latest-DATA_DECORRENZA wins, fail loud on bad VARIAZIONI_CATTEDRA data"
```

---

### Task 4: `CattedraResolver` — ITP support, `CattedraAssignment`, `resolveCattedra`/`resolvePermanenti`/`resolveConsiglio`

**Files:**
- Modify: `src/application/services/CattedraResolver.ts`
- Test: `test/unit/application/cattedra-resolver.test.ts`

**Interfaces:**
- Consumes: `IClasseRepository.getITPPerMateria(classe, materia): Docente[]`
  (confirmed in `ClasseRepository.ts`), `IMateriaRepository.findAllSigle(): string[]`
  (confirmed in `IMateriaRepository.ts`).
- Produces (used by Task 6 `CdcAssembler` and Task 10 `RisolutoreRuoliService`):
  - `resolveCattedra(classe, materia, date): CattedraAssignment[]`
  - `resolvePermanenti(classe, materia, date): Docente[]`
  - `resolveConsiglio(classe, date): CattedraAssignment[]` (now with `materia: MateriaId` added to `CattedraAssignment`)

- [ ] **Step 1: Write failing tests for ITP and the new API surface**

Append to `test/unit/application/cattedra-resolver.test.ts`:

```ts
test('resolveConsiglio includes both main and itp holders, tagged, main-slot variazione does not affect the itp slot', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M', ITP: true }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it', 'MAT.itp': 'verdi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  const result = resolver.resolveConsiglio(classe, new Date('2025-11-01'));
  expect(result).toHaveLength(2);
  const main = result.find((a) => !a.isItp)!;
  const itp = result.find((a) => a.isItp)!;
  expect(main.titolare.id).toBe('bianchi@s.it'); // main-slot variazione applied
  expect(itp.titolare.id).toBe('verdi@s.it'); // itp slot untouched, variazione was for the main slot
});

test('resolvePermanenti ignores an active supplenza (SOLO_TITOLARI semantics)', () => {
  const db = new FakeDatabase(seed());
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);
  // 2025-11-15: bianchi (variazione) has an active supplente verdi.
  expect(
    resolver.resolvePermanenti(classe, MAT, new Date('2025-11-15')).map((d) => d.id)
  ).toEqual(['bianchi@s.it']);
});

test('resolveCattedra pairs the permanent holder with the active supplente, or null', () => {
  const db = new FakeDatabase(seed());
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);
  const withSupplente = resolver.resolveCattedra(classe, MAT, new Date('2025-11-15'));
  expect(withSupplente).toHaveLength(1);
  expect(withSupplente[0]!.titolare.id).toBe('bianchi@s.it');
  expect(withSupplente[0]!.supplente!.id).toBe('verdi@s.it');

  const withoutSupplente = resolver.resolveCattedra(classe, MAT, new Date('2025-10-15'));
  expect(withoutSupplente[0]!.titolare.id).toBe('bianchi@s.it');
  expect(withoutSupplente[0]!.supplente).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: FAIL — `resolveConsiglio`/`resolvePermanenti`/`resolveCattedra` don't exist yet, `ITP` column not seeded via `MAT.itp` key (FakeDatabase treats it as a plain column name, consistent with `ClasseRepository`'s `${id}.itp` convention already used elsewhere).

- [ ] **Step 3: Extend `CattedraResolver`**

In `src/application/services/CattedraResolver.ts`:

Add `materie: IMateriaRepository` to the constructor's self-built dependencies
and change `CattedraAssignment` to carry `materia`:

```ts
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';

export interface CattedraAssignment {
  materia: MateriaId;
  titolare: Docente;
  isItp: boolean;
  supplente: Docente | null;
}
```

```ts
  private readonly materie: IMateriaRepository;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.supplenze = new SupplenzaRepository(database);
    this.variazioni = new VariazioneCattedraRepository(database);
    this.materie = new MateriaRepository(database);
  }
```

Replace `resolveTitolari` to go through the new `resolveCattedra`, and add the
three new methods:

```ts
  resolveTitolari(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const effettivi: Docente[] = [];
    const seen = new Set<string>();
    for (const a of this.resolveCattedra(classe, materia, data)) {
      const d = a.supplente ?? a.titolare;
      if (d.id != null && !seen.has(d.id)) {
        seen.add(d.id);
        effettivi.push(d);
      }
    }
    return effettivi;
  }

  resolveTitolare(classe: Classe, materia: MateriaId, data: Date): Docente | null {
    return this.resolveTitolari(classe, materia, data)[0] ?? null;
  }

  /** Permanent holder(s) only — SOLO_TITOLARI semantics, ignores any active supplenza. */
  resolvePermanenti(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const seen = new Set<string>();
    const out: Docente[] = [];
    for (const a of this.resolveCattedra(classe, materia, data)) {
      if (a.titolare.id != null && !seen.has(a.titolare.id)) {
        seen.add(a.titolare.id);
        out.push(a.titolare);
      }
    }
    return out;
  }

  /** One assignment per populated slot (main + itp) for (classe, materia, date). */
  resolveCattedra(classe: Classe, materia: MateriaId, data: Date): CattedraAssignment[] {
    const out: CattedraAssignment[] = [];
    const mainNominali = this.classi.getDocentiPerMateria(classe, materia);
    const itpNominali = this.classi.getITPPerMateria(classe, materia);
    for (const titolareNominale of this.risolviSlot(classe, materia, data, mainNominali, itpNominali)) {
      out.push({
        materia,
        isItp: false,
        titolare: titolareNominale,
        supplente: this.trovaSupplente(titolareNominale, classe, materia, data)
      });
    }
    for (const titolareNominale of this.risolviSlot(classe, materia, data, itpNominali, mainNominali)) {
      out.push({
        materia,
        isItp: true,
        titolare: titolareNominale,
        supplente: this.trovaSupplente(titolareNominale, classe, materia, data)
      });
    }
    return out;
  }

  /** Class-wide fan-out over every MATERIE column (used by CDU/email enumeration). */
  resolveConsiglio(classe: Classe, data: Date): CattedraAssignment[] {
    const out: CattedraAssignment[] = [];
    for (const materia of this.materie.findAllCached()) {
      out.push(...this.resolveCattedra(classe, materia.materiaId, data));
    }
    return out;
  }

  private trovaSupplente(
    titolare: Docente,
    classe: Classe,
    materia: MateriaId,
    data: Date
  ): Docente | null {
    return this.applicaSupplenza(titolare, classe, materia, data).id === titolare.id
      ? null
      : this.applicaSupplenza(titolare, classe, materia, data);
  }
```

Update `risolviSlot` to take the OTHER slot's nominal list too (for the
"matches neither slot" check) and replace `matchesNoSlotAtAll`:

```ts
  private risolviSlot(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    nominali: Docente[],
    nominaliAltroSlot: Docente[]
  ): Docente[] {
    const decorse = this.variazioni
      .findByClasse(classe.classeId)
      .filter((v) => v.applicaAMateria(materia) && v.isDecorsaA(data));
    if (decorse.length === 0) return nominali;

    const nominaliIds = new Set(nominali.map((d) => d.id));
    const altroSlotIds = new Set(nominaliAltroSlot.map((d) => d.id));
    const perQuestoSlot = decorse.filter((v) => nominaliIds.has(v.vecchioTitolare));
    if (perQuestoSlot.length === 0) {
      const perAltroSlot = decorse.some((v) => altroSlotIds.has(v.vecchioTitolare));
      if (!perAltroSlot) {
        const v = decorse[0]!;
        throw new VariazioneCattedraInconsistenteError(
          `VARIAZIONI_CATTEDRA ${v.id ?? '?'} (VECCHIO_TITOLARE=${v.vecchioTitolare}) non corrisponde ` +
            `al titolare nominale attuale di ${classe.id ?? '?'}/${materia.value}`
        );
      }
      return nominali;
    }

    const maxDecorrenza = Math.max(
      ...perQuestoSlot.map((v) => new Date(v.dataDecorrenza).getTime())
    );
    const vincitrici = perQuestoSlot.filter(
      (v) => new Date(v.dataDecorrenza).getTime() === maxDecorrenza
    );
    if (vincitrici.length > 1) {
      throw new AmbiguousVariazioneCattedraError(
        `Più VARIAZIONI_CATTEDRA con la stessa DATA_DECORRENZA più recente per ` +
          `${classe.id ?? '?'}/${materia.value}: ${vincitrici.map((v) => v.id ?? '?').join(', ')}`
      );
    }
    const vinta = vincitrici[0]!;
    const nuovo = this.docenti.findById(vinta.nuovoTitolare);
    if (nuovo === null) {
      throw new VariazioneCattedraTitolareNonTrovatoError(
        `VARIAZIONI_CATTEDRA ${vinta.id ?? '?'}: NUOVO_TITOLARE ${vinta.nuovoTitolare} non trovato in DOCENTI`
      );
    }
    return [nuovo];
  }
```

Delete `matchesNoSlotAtAll` (folded into `risolviSlot` above) and delete the now
inline-replaced two-argument `risolviSlot`/`resolveTitolari` bodies from Task 3.

`Materia.materiaId` — confirm the exact getter name on `Materia` by reading
`src/domain/entities/Materia.ts` before writing this call (`findAllCached()`
returns `Materia[]`; the field/getter that exposes its `MateriaId` value object
must be used here — if it's named differently than `materiaId`, use the actual
name and keep everything else identical).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/services/CattedraResolver.ts test/unit/application/cattedra-resolver.test.ts
git commit -m "feat(cattedra): itp slot support, CattedraAssignment, resolveConsiglio fan-out"
```

---

### Task 5: Typed `gestioneSupplenti` recipe option

Replaces the stringly-keyed `options['gestioneSupplenti']` read in the
soon-to-be-deleted interceptor with a real typed field, so `CdcAssembler` (Task
6) can consume it directly.

**Files:**
- Modify: `src/application/context-engine/Cdu.ts`
- Modify: `src/application/context-engine/Recipe.ts`
- Test: `test/unit/application/context-engine/recipe.test.ts` (new, small)

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/application/context-engine/recipe.test.ts
import { makeOptions, DEFAULT_OPTIONS } from '../../../../src/application/context-engine/Recipe';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';

test('DEFAULT_OPTIONS.gestioneSupplenti defaults to SOLO_TITOLARI', () => {
  expect(DEFAULT_OPTIONS.gestioneSupplenti).toBe(GestioneSupplenti.SOLO_TITOLARI);
});

test('makeOptions overrides gestioneSupplenti', () => {
  const opts = makeOptions({ gestioneSupplenti: GestioneSupplenti.ENTRAMBI });
  expect(opts.gestioneSupplenti).toBe(GestioneSupplenti.ENTRAMBI);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/recipe.test.ts`
Expected: FAIL — `gestioneSupplenti` is `undefined` (currently only reachable via the `[key: string]: unknown` index signature, not a real default).

- [ ] **Step 3: Add the typed field**

In `src/application/context-engine/Cdu.ts`, in `RecipeOptionsView`:

```ts
export interface RecipeOptionsView {
  includiStorico: boolean;
  profonditaAnniStorico: number;
  profonditaAnniAsl: number;
  profonditaAnniDocumenti: number;
  includiSupplenti: boolean;
  includiSpecificita: boolean;
  notificaSoloCoordinatori: boolean;
  gestioneSupplenti: string;
  [key: string]: unknown;
}
```

(`gestioneSupplenti` is typed `string` here, matching the rest of
`RecipeOptionsView` — it's the JSON-serialized snapshot copied into
`meta.parametriInput.opzioni`. `RecipeOptions` below narrows it to the real enum
for actual code to consume.)

In `src/application/context-engine/Recipe.ts`:

```ts
export interface RecipeOptions extends Omit<RecipeOptionsView, 'gestioneSupplenti'> {
  includiStorico: boolean;
  profonditaAnniStorico: number;
  profonditaAnniAsl: number;
  profonditaAnniDocumenti: number;
  includiSupplenti: boolean;
  includiSpecificita: boolean;
  notificaSoloCoordinatori: boolean;
  gestioneSupplenti: GestioneSupplenti;
  [key: string]: unknown;
}
```

Add the import and the default:

```ts
import { GestioneSupplenti } from '../../domain/value-objects/enums';

export const DEFAULT_OPTIONS: RecipeOptions = {
  includiStorico: false,
  profonditaAnniStorico: 0,
  profonditaAnniAsl: 0,
  profonditaAnniDocumenti: 0,
  includiSupplenti: false,
  includiSpecificita: false,
  notificaSoloCoordinatori: false,
  gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI
};
```

- [ ] **Step 4: Run tests, typecheck**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/recipe.test.ts`
Expected: PASS (2 tests)

Run: `npm run typecheck`
Expected: PASS — check `src/application/pipelines/emailSteps.ts:129`
(`gestioneSupplenti: conf.supplenti`) still typechecks; `conf.supplenti` is
already typed `GestioneSupplenti` (from `ConfigurazioneEmail`), so it now
satisfies the real field instead of the index signature — no change needed
there.

- [ ] **Step 5: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts \
  test/unit/application/context-engine/recipe.test.ts
git commit -m "feat(cdu): type gestioneSupplenti as a real RecipeOptions field"
```

---

### Task 6: `CdcAssembler` — assignment-driven rewrite with split-row grouping (non-articulated)

Replaces `getAllDocentiCDC`-based enumeration with
`CattedraResolver.resolveConsiglio`, grouping into rows by
`(rowDocente.email, sostituisce?.email ?? null)` — the confirmed split-row
design. Articulated classes (Task 7) and `assembleFiltrato` (Task 8) build on
top of this task's grouping helper.

**Files:**
- Modify: `src/application/context-engine/CdcAssembler.ts`
- Test: `test/unit/application/context-engine/cdc-assembler.test.ts` (new — no
  existing dedicated unit test for this class; it's currently only exercised
  indirectly through `sheet-materie-generator.test.ts` and integration-level CDU
  tests)

**Interfaces:**
- Consumes: `CattedraResolver.resolveConsiglio(classe, date): CattedraAssignment[]`
  (Task 4).
- Produces: `CdcAssembler.assembleForClasse(classe: Classe, date: Date, gestioneSupplenti?: GestioneSupplenti): DocenteCdcVM[]` —
  **signature change**: two new parameters. Every call site (Task 9's
  `ConsiglioClasseProvider`, Task 12's `sheet-materie-generator.test.ts`) is
  updated in its own task.

- [ ] **Step 1: Write failing tests**

```ts
// test/unit/application/context-engine/cdc-assembler.test.ts
import { CdcAssembler } from '../../../../src/application/context-engine/CdcAssembler';
import { CattedraResolver } from '../../../../src/application/services/CattedraResolver';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { ClasseId } from '../../../../src/domain/value-objects/ClasseId';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';

function seed() {
  return {
    MATERIE: [{ ID: 'MAT', NOME: 'Matematica' }, { ID: 'FIS', NOME: 'Fisica' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M' }
    ],
    CLASSI: [
      { ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', COORD: 'rossi@s.it', MAT: 'rossi@s.it', FIS: 'rossi@s.it' }
    ],
    VARIAZIONI_CATTEDRA: [],
    SUPPLENZE: [
      {
        TITOLARE: 'rossi@s.it',
        SUPPLENTE: 'verdi@s.it',
        DAL: '2025-11-01',
        AL: '2025-11-30',
        CLASSI: '5A',
        MATERIE: 'MAT'
      }
    ]
  };
}

function assembler(db: FakeDatabase) {
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  return { assembler: new CdcAssembler(classi, materie, new CattedraResolver(db)), classi };
}

test('SOLO_TITOLARI (default) ignores the active supplenza, one row per titolare', () => {
  const db = new FakeDatabase(seed());
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2025-11-15'));
  expect(vms).toHaveLength(1);
  expect(vms[0]!.anagrafica.email).toBe('rossi@s.it');
  expect(vms[0]!.materie.map((m) => m.sigla).sort()).toEqual(['FIS', 'MAT']);
  expect(vms[0]!.stato).toEqual({ isSupplente: false, sostituisce: null });
});

test('SOLO_SUPPLENTI splits rows: MAT (active supplenza) separate from FIS (none)', () => {
  const db = new FakeDatabase(seed());
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2025-11-15'), GestioneSupplenti.SOLO_SUPPLENTI);
  expect(vms).toHaveLength(2);
  const matRow = vms.find((v) => v.materie.some((m) => m.sigla === 'MAT'))!;
  const fisRow = vms.find((v) => v.materie.some((m) => m.sigla === 'FIS'))!;
  expect(matRow.anagrafica.email).toBe('verdi@s.it');
  expect(matRow.stato).toEqual({
    isSupplente: true,
    sostituisce: { nome: 'ROSSI M', email: 'rossi@s.it' }
  });
  expect(matRow.materie.map((m) => m.sigla)).toEqual(['MAT']);
  expect(fisRow.anagrafica.email).toBe('rossi@s.it');
  expect(fisRow.stato).toEqual({ isSupplente: false, sostituisce: null });
  expect(fisRow.materie.map((m) => m.sigla)).toEqual(['FIS']);
});

test('ENTRAMBI splits rows too: rossi (FIS, no substitute) vs rossi+sostituisce verdi (MAT)', () => {
  const db = new FakeDatabase(seed());
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2025-11-15'), GestioneSupplenti.ENTRAMBI);
  expect(vms).toHaveLength(2);
  const matRow = vms.find((v) => v.materie.some((m) => m.sigla === 'MAT'))!;
  const fisRow = vms.find((v) => v.materie.some((m) => m.sigla === 'FIS'))!;
  expect(matRow.anagrafica.email).toBe('rossi@s.it'); // ENTRAMBI keeps titolare identity
  expect(matRow.stato).toEqual({
    isSupplente: false,
    sostituisce: { nome: 'VERDI G', email: 'verdi@s.it' }
  });
  expect(fisRow.anagrafica.email).toBe('rossi@s.it');
  expect(fisRow.stato).toEqual({ isSupplente: false, sostituisce: null });
});

test('a permanent chair change (VARIAZIONI_CATTEDRA) is reflected under SOLO_TITOLARI', () => {
  const tables = seed();
  tables.VARIAZIONI_CATTEDRA = [
    {
      CLASSE_ID: '5A',
      MATERIA_ID: 'MAT',
      VECCHIO_TITOLARE: 'rossi@s.it',
      NUOVO_TITOLARE: 'bianchi@s.it',
      DATA_DECORRENZA: '2025-10-01'
    }
  ];
  const db = new FakeDatabase(tables);
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2026-01-15'));
  const matRow = vms.find((v) => v.materie.some((m) => m.sigla === 'MAT'))!;
  expect(matRow.anagrafica.email).toBe('bianchi@s.it');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: FAIL — `CdcAssembler` constructor doesn't accept a third argument,
`assembleForClasse` doesn't accept `date`/`gestioneSupplenti`.

- [ ] **Step 3: Rewrite `assembleForClasse`, `toVMs`/`buildVM`, drop `materieRawOf`**

In `src/application/context-engine/CdcAssembler.ts`, change the constructor and
`assembleForClasse`, and replace the grouping/VM-building internals. Keep
`assembleFiltrato` as-is for this task (Task 8 rewrites it) and keep
`tipoArticolazione` unchanged for this task (Task 7 rewrites articulated
support) — for now, `assembleForClasse` only needs to work correctly for
**non-articulated** classes; guard articulated classes with the OLD nominal path
temporarily so Task 7 can replace it cleanly:

```ts
import type { CattedraResolver, CattedraAssignment } from '../services/CattedraResolver';
import { GestioneSupplenti } from '../../../domain/value-objects/enums';

export class CdcAssembler {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly materie: IMateriaRepository,
    private readonly cattedraResolver: CattedraResolver
  ) {}

  /** Full council of the class (09 §4) at `date`, per the confirmed split-row design. */
  assembleForClasse(
    classe: Classe,
    date: Date,
    gestioneSupplenti: GestioneSupplenti = GestioneSupplenti.SOLO_TITOLARI
  ): DocenteCdcVM[] {
    const isArticolata = this.classi.isArticolata(classe);
    if (isArticolata) {
      // Task 7 replaces this branch with an articulated-aware assignment merge.
      const docenti = this.classi.getAllDocentiCDCArticolata(classe);
      return this.toVMsNominal(docenti, classe, isArticolata);
    }
    const assignments = this.cattedraResolver.resolveConsiglio(classe, date);
    return this.toVMsFromAssignments(assignments, classe, isArticolata, gestioneSupplenti);
  }

  // ... assembleFiltrato UNCHANGED for this task (Task 8 rewrites it) ...

  /** Groups CattedraAssignments into VM rows, splitting by (row identity, sostituisce) — confirmed split-row design. */
  private toVMsFromAssignments(
    assignments: CattedraAssignment[],
    classe: Classe,
    isArticolata: boolean,
    gestioneSupplenti: GestioneSupplenti
  ): DocenteCdcVM[] {
    interface RowGroup {
      rowDocente: Docente;
      isSupplenteRow: boolean;
      sostituisce: Docente | null;
      materieRaw: Array<{ sigla: string; isItp: boolean }>;
    }
    const byKey = new Map<string, RowGroup>();
    for (const a of assignments) {
      const hasSupplente = a.supplente !== null;
      const applySupplente = gestioneSupplenti !== GestioneSupplenti.SOLO_TITOLARI && hasSupplente;
      const isSupplenteRow = applySupplente && gestioneSupplenti === GestioneSupplenti.SOLO_SUPPLENTI;
      const rowDocente = isSupplenteRow ? a.supplente! : a.titolare;
      const sostituisce = applySupplente ? (isSupplenteRow ? a.titolare : a.supplente) : null;
      const key = `${rowDocente.id ?? ''}::${sostituisce?.id ?? ''}`;
      let group = byKey.get(key);
      if (group === undefined) {
        group = { rowDocente, isSupplenteRow, sostituisce, materieRaw: [] };
        byKey.set(key, group);
      }
      group.materieRaw.push({ sigla: a.materia.value, isItp: a.isItp });
    }

    const coord = new Set(this.classi.getCoordinatori(classe).map((d) => d.id ?? ''));
    const tutorAsl = new Set(
      this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ASL).map((d) => d.id ?? '')
    );
    const tutorOrient = new Set(
      this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ORIENT).map((d) => d.id ?? '')
    );
    const groups = [...byKey.values()].sort((a, b) =>
      a.rowDocente.cognome.localeCompare(b.rowDocente.cognome)
    );
    return groups.map((g, i) =>
      this.buildVMFromGroup(g, classe, isArticolata, coord, tutorAsl, tutorOrient, i < groups.length - 1)
    );
  }

  private buildVMFromGroup(
    g: {
      rowDocente: Docente;
      isSupplenteRow: boolean;
      sostituisce: Docente | null;
      materieRaw: Array<{ sigla: string; isItp: boolean }>;
    },
    classe: Classe,
    isArticolata: boolean,
    coord: Set<string>,
    tutorAsl: Set<string>,
    tutorOrient: Set<string>,
    isNotLast: boolean
  ): DocenteCdcVM {
    const email = g.rowDocente.id ?? '';
    const isCoordinatore = coord.has(email);
    const isTutorAsl = tutorAsl.has(email);
    const isTutorOrientamento = tutorOrient.has(email);
    return {
      anagrafica: {
        nome: g.rowDocente.nome,
        cognome: g.rowDocente.cognome,
        email,
        genere: g.rowDocente.genere,
        appellativo: g.rowDocente.getAppellativo()
      },
      materie: g.materieRaw.map((m) => ({
        sigla: m.sigla,
        nome: this.materie.findByIdCached(MateriaId.of(m.sigla))?.nome ?? m.sigla,
        colore: '',
        specificita: null
      })),
      ruoli: {
        isCoordinatore,
        isTutorAsl,
        isTutorOrientamento,
        descrizione: this.descrizione(isCoordinatore, isTutorAsl, isTutorOrientamento)
      },
      stato: {
        isSupplente: g.isSupplenteRow,
        sostituisce:
          g.sostituisce !== null
            ? { nome: g.sostituisce.getNomeCompleto(), email: g.sostituisce.id ?? '' }
            : null
      },
      tipoArticolazione: null, // Task 7 fills this in for articulated classes
      isITP: g.materieRaw.some((m) => m.isItp),
      flags: { isNotLast }
    };
  }

  /** Nominal-only fallback used temporarily for articulated classes until Task 7. */
  private toVMsNominal(docenti: Docente[], classe: Classe, isArticolata: boolean): DocenteCdcVM[] {
    // ... body is the OLD toVMs/buildVM pair, verbatim, temporarily kept so
    // articulated-class behavior doesn't regress before Task 7 rewrites it.
    // Copy the current toVMs + buildVM + materieRawOf + tipoArticolazione
    // methods here unchanged, renamed toVMsNominal/buildVMNominal.
  }
}
```

The `toVMsNominal` step is intentionally a straight copy-paste of today's
`toVMs`/`buildVM`/`materieRawOf`/`tipoArticolazione` (renamed to avoid
colliding with the new methods) — Task 7 deletes it entirely once articulated
classes go through `toVMsFromAssignments` too. Copy the exact current bodies of
those four methods from the version of the file before this task's edit (they
are unchanged in logic, only renamed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: FAIL at this point — every call site of `new CdcAssembler(...)` and
`assembleForClasse(...)` needs updating. That's fine: Task 9 and Task 12 fix
every remaining call site. Confirm the *only* typecheck errors are at those
known call sites (`ContextEngineFactory.ts`, `sheet-materie-generator.test.ts`)
and not inside `CdcAssembler.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/CdcAssembler.ts test/unit/application/context-engine/cdc-assembler.test.ts
git commit -m "feat(cdc): assignment-driven assembleForClasse with split-row grouping"
```

(Typecheck errors at other call sites are expected and resolved in Tasks 7–9,
12 — this task's own test suite is green, which is what step 4/6 require.)

---

### Task 7: `CdcAssembler` — articulated classes on the new model

Replaces the `toVMsNominal` fallback from Task 6 with a real articulated-aware
assignment merge: run `resolveConsiglio` over every class in
`getGruppoArticolazione`, tag `tipoArticolazione` from which partner(s) produced
each subject, then group exactly as Task 6 does.

**Files:**
- Modify: `src/application/context-engine/CdcAssembler.ts`
- Test: `test/unit/application/context-engine/cdc-assembler.test.ts`

**Interfaces:**
- Consumes: `IClasseRepository.getGruppoArticolazione(classe): Classe[]`,
  `.orderedPartners(classe): Classe[]` (both confirmed in `ClasseRepository.ts`).

- [ ] **Step 1: Write failing test**

Using the project's existing articulated fixture shape (`1F`/`1F-LSO`/`1F-LSS`
from `test/fixtures/tables.ts`, MATE shared via both partners teaching `rossi`,
FISI separate: `1F-LSO.FISI=bianchi`, `1F-LSS.FISI=verdi`):

```ts
test('articulated class: shared subject appears once (COMUNE), separate subjects tagged per group', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const a = new CdcAssembler(classi, materie, new CattedraResolver(db));
  const classe = classi.findById(ClasseId.of('1F'))!;

  const vms = a.assembleForClasse(classe, new Date('2026-01-15'));

  const rossiRow = vms.find((v) => v.anagrafica.email === 'rossi@school.it')!;
  expect(rossiRow.tipoArticolazione).toBe('COMUNE');
  const bianchiRow = vms.find((v) => v.anagrafica.email === 'bianchi@school.it')!;
  expect(bianchiRow.tipoArticolazione).toBe('SEPARATO_PRIMO');
  const verdiRow = vms.find((v) => v.anagrafica.email === 'verdi@school.it')!;
  expect(verdiRow.tipoArticolazione).toBe('SEPARATO_SECONDO');
});
```

(Add the `fixtureTables`/`FakeDatabase`/`ClasseRepository`/`MateriaRepository`/
`CattedraResolver`/`ClasseId` imports at the top of the test file if not already
present from Task 6.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: FAIL — `tipoArticolazione` is hardcoded `null` via the `toVMsNominal`
fallback path for `1F`.

- [ ] **Step 3: Replace the articulated branch**

In `CdcAssembler.assembleForClasse`, replace the `isArticolata` branch:

```ts
    if (isArticolata) {
      const assignments = this.assignmentsArticolata(classe, date);
      return this.toVMsFromAssignments(assignments, classe, isArticolata, gestioneSupplenti);
    }
```

Add the merge helper and delete `toVMsNominal` (and the old `materieRawOf`/
`tipoArticolazione`/`toVMs`/`buildVM` it carried from Task 6's temporary copy):

```ts
  /**
   * Merges resolveConsiglio across the articulated group (this class + parent's
   * partners, or partner's counterpart — matches getAllDocentiCDCArticolata's
   * scope), deduping a subject shared identically by both partners into one
   * assignment (tipoArticolazione COMUNE) and keeping it separate otherwise
   * (SEPARATO_PRIMO/SEPARATO_SECONDO by canonical partner order).
   */
  private assignmentsArticolata(classe: Classe, date: Date): CattedraAssignment[] {
    const partners = this.classi.orderedPartners(classe);
    if (partners.length < 2) {
      return this.cattedraResolver.resolveConsiglio(classe, date);
    }
    const [primo, secondo] = partners as [Classe, Classe];
    const inPrimo = this.cattedraResolver.resolveConsiglio(primo, date);
    const inSecondo = primo.id === secondo.id ? [] : this.cattedraResolver.resolveConsiglio(secondo, date);

    const byKey = new Map<string, { assignment: CattedraAssignment; inPrimo: boolean; inSecondo: boolean }>();
    const keyOf = (a: CattedraAssignment): string =>
      `${a.materia.value}::${a.titolare.id ?? ''}::${a.supplente?.id ?? ''}::${a.isItp}`;
    for (const a of inPrimo) byKey.set(keyOf(a), { assignment: a, inPrimo: true, inSecondo: false });
    for (const a of inSecondo) {
      const k = keyOf(a);
      const existing = byKey.get(k);
      if (existing !== undefined) existing.inSecondo = true;
      else byKey.set(k, { assignment: a, inPrimo: false, inSecondo: true });
    }
    return [...byKey.values()].map((v) => v.assignment);
  }
```

`tipoArticolazione` itself is computed per-row in `buildVMFromGroup` — extend it
to take the articulation info instead of a hardcoded `null`. Change
`toVMsFromAssignments`/`buildVMFromGroup` to thread through `partners:
Classe[]` (reusing `this.classi.orderedPartners(classe)`, computed once per
`assembleForClasse` call) and compute `tipoArticolazione` the same way the
original `tipoArticolazione` method did — by re-checking, for the row's email,
whether `getMaterieDelDocente(partners[0], email)`/`partners[1]` are non-empty:

```ts
  private tipoArticolazioneDi(
    isArticolata: boolean,
    partners: Classe[],
    email: string
  ): DocenteCdcVM['tipoArticolazione'] {
    if (!isArticolata || partners.length < 2) return null;
    const inPrimo = this.classi.getMaterieDelDocente(partners[0]!, email).length > 0;
    const inSecondo = this.classi.getMaterieDelDocente(partners[1]!, email).length > 0;
    if (inPrimo && inSecondo) return 'COMUNE';
    if (inPrimo) return 'SEPARATO_PRIMO';
    if (inSecondo) return 'SEPARATO_SECONDO';
    return null;
  }
```

(This is the original `tipoArticolazione` method, unchanged, just kept — it
already worked off nominal `CLASSI` columns, which is fine: articulation
grouping (COMUNE/SEPARATO) is a structural property of who's *assigned* to
which physical partner class, unrelated to whether a permanent variation later
changed who that assignee is — the row's `email` used to look it up is now the
*effective* email, so the lookup still needs the effective docente to appear in
`partners[i]`'s nominal columns; verify this holds for the fixture-based test
above and adjust only if it doesn't — the shared fixture's `1F`/`1F-LSO`/`1F-LSS`
carry no `VARIAZIONI_CATTEDRA` rows, so nominal and effective coincide there and
this concern doesn't bite in this task's test.)

Wire `partners`/`isArticolata` into `toVMsFromAssignments`'s call to
`buildVMFromGroup`, replacing the `tipoArticolazione: null` line with
`this.tipoArticolazioneDi(isArticolata, partners, email)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: same known-remaining errors as Task 6 (other call sites, fixed in
Tasks 9/12) — no new errors inside `CdcAssembler.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/CdcAssembler.ts test/unit/application/context-engine/cdc-assembler.test.ts
git commit -m "feat(cdc): articulated classes on the assignment-driven model"
```

---

### Task 8: `CdcAssembler.assembleFiltrato` on the new model

**Files:**
- Modify: `src/application/context-engine/CdcAssembler.ts`
- Test: `test/unit/application/context-engine/cdc-assembler.test.ts`

**Interfaces:**
- Produces: `assembleFiltrato(classe: Classe, religione: ReligioneScelta, date: Date, gestioneSupplenti?: GestioneSupplenti): DocenteCdcVM[]` — same two new trailing params as `assembleForClasse`.

- [ ] **Step 1: Write failing test**

```ts
test('assembleFiltrato adds the IRC teacher for religione SI, on top of effective subject teachers', () => {
  const tables = seed();
  tables.CLASSI[0]!.IRC = 'verdi@s.it';
  const db = new FakeDatabase(tables);
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleFiltrato(classe, ReligioneScelta.SI, new Date('2025-09-15'));
  expect(vms.map((v) => v.anagrafica.email).sort()).toEqual(['rossi@s.it', 'verdi@s.it']);
});
```

(Import `ReligioneScelta` from `../../../../src/domain/value-objects/enums`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: FAIL — current `assembleFiltrato` signature has no `date` parameter.

- [ ] **Step 3: Rewrite `assembleFiltrato`**

```ts
  assembleFiltrato(
    classe: Classe,
    religione: ReligioneScelta,
    date: Date,
    gestioneSupplenti: GestioneSupplenti = GestioneSupplenti.SOLO_TITOLARI
  ): DocenteCdcVM[] {
    const isArticolata = this.classi.isArticolata(classe);
    const assignments = isArticolata
      ? this.assignmentsArticolata(classe, date)
      : this.cattedraResolver.resolveConsiglio(classe, date);
    const vms = this.toVMsFromAssignments(assignments, classe, isArticolata, gestioneSupplenti);

    // IRC/ALT stay nominal-only (schema limitation, ref design doc): they are
    // CLASSI.IRC/CLASSI.ALT columns, not MATERIE rows, so VARIAZIONI_CATTEDRA/
    // SUPPLENZE (both MATERIA_ID-scoped, FK to MATERIE.ID) cannot apply to them.
    const extra: Docente[] =
      religione === ReligioneScelta.SI
        ? this.classi.getDocentiIRC(classe)
        : religione === ReligioneScelta.ALT
          ? this.classi.getDocentiALT(classe)
          : [];
    const existingEmails = new Set(vms.map((v) => v.anagrafica.email));
    const extraVms = extra
      .filter((d) => !existingEmails.has(d.id ?? ''))
      .map((d) =>
        this.buildVMFromGroup(
          { rowDocente: d, isSupplenteRow: false, sostituisce: null, materieRaw: [] },
          classe,
          isArticolata,
          new Set(this.classi.getCoordinatori(classe).map((c) => c.id ?? '')),
          new Set(this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ASL).map((c) => c.id ?? '')),
          new Set(this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ORIENT).map((c) => c.id ?? '')),
          true
        )
      );
    const all = [...vms, ...extraVms].sort((a, b) => a.anagrafica.cognome.localeCompare(b.anagrafica.cognome));
    return all.map((v, i) => ({ ...v, flags: { isNotLast: i < all.length - 1 } }));
  }
```

`buildVMFromGroup` needs `partners`/`isArticolata` for `tipoArticolazione`
(Task 7) — pass `this.classi.orderedPartners(classe)` through here the same way
`assembleForClasse` does, updating the signature consistently across both
methods (add a `partners: Classe[]` parameter to `buildVMFromGroup`, computed
once at the top of both `assembleForClasse` and `assembleFiltrato` via
`const partners = this.classi.orderedPartners(classe);`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: remaining errors confined to `AlunnoProvider.ts` (calls
`assembleFiltrato` with the old 2-arg signature) and `ContextEngineFactory.ts` —
both fixed in Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/CdcAssembler.ts test/unit/application/context-engine/cdc-assembler.test.ts
git commit -m "feat(cdc): assembleFiltrato on the assignment-driven model"
```

---

### Task 9: Wire `CattedraResolver` through `ContextEngineFactory`; retire the interceptor

**Files:**
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts`
- Modify: `src/application/context-engine/providers/AlunnoProvider.ts`
- Delete: `src/application/context-engine/interceptors/SupplentiSubstitutionLookup.ts`
- Delete: `test/unit/application/context-engine/interceptors/supplenti-substitution-lookup.test.ts`
- Test: extend existing CDU-level tests (see Step 4)

**Interfaces:**
- Consumes: `CdcAssembler(classi, materie, cattedraResolver)` (Task 6),
  `assembleForClasse(classe, date, gestioneSupplenti)` (Task 6/7),
  `assembleFiltrato(classe, religione, date, gestioneSupplenti)` (Task 8).
- Produces: `ConsiglioClasseProvider(classi, materie, cattedraResolver)`,
  `AlunnoProvider(alunni, classi, oreAsl, cdc?)` (unchanged signature — `cdc` is
  still an already-constructed `CdcAssembler`).

- [ ] **Step 1: Update `ConsiglioClasseProvider`**

```ts
// src/application/context-engine/providers/ConsiglioClasseProvider.ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { CattedraResolver } from '../../services/CattedraResolver';
import { CdcAssembler } from '../CdcAssembler';
import { getClasseEntity } from '../techEntities';

export class ConsiglioClasseProvider implements ContextProvider {
  private readonly cdc: CdcAssembler;

  constructor(
    classi: IClasseRepository,
    materie: IMateriaRepository,
    cattedraResolver: CattedraResolver
  ) {
    this.cdc = new CdcAssembler(classi, materie, cattedraResolver);
  }

  provide(cdu: Cdu, _params: unknown, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    focusClasse.consiglioDiClasse = this.cdc.assembleForClasse(
      getClasseEntity(cdu),
      new Date(cdu.meta.date.oggi.iso),
      options.gestioneSupplenti
    );
  }
}
```

(`ContextProvider.provide`'s real second parameter is `BuildParams`, not
`unknown` — import and use `BuildParams` from `../Recipe` for the actual
signature; `_params` is written here only to show the parameter is
intentionally unused, keep the real type for interface compliance.)

- [ ] **Step 2: Update `AlunnoProvider`**

In `src/application/context-engine/providers/AlunnoProvider.ts`, change
`provide`'s signature to accept `options` and pass `date`/`gestioneSupplenti`
through:

```ts
  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    // ...unchanged body until the consiglioDiClasseFiltrato line...
    if (this.cdc !== undefined) {
      focusAlunno.consiglioDiClasseFiltrato = this.cdc.assembleFiltrato(
        classe,
        alunno.religione,
        params.now,
        options.gestioneSupplenti
      );
    }
    // ...
  }
```

Add `import type { RecipeOptions } from '../Recipe';` (alongside the existing
`BuildParams` import).

- [ ] **Step 3: Update `ContextEngineFactory.create` — wire resolver, drop interceptor**

```ts
// src/application/context-engine/ContextEngineFactory.ts
import { CattedraResolver } from '../services/CattedraResolver';
// remove: import { createSupplentiSubstitutionLookup } from './interceptors/SupplentiSubstitutionLookup';

  static create(
    database: RepositoryDatabase,
    master: IMasterSheetRepository = new MasterSheetRepository(database)
  ): ContextBuilder {
    const ruoli: IRuoloSpecialeRepository = new RuoloSpecialeRepository(database);
    const docenti: IDocenteRepository = new DocenteRepository(database);
    const classi: IClasseRepository = new ClasseRepository(database);
    const alunni: IAlunnoRepository = new AlunnoRepository(database);
    const materie: IMateriaRepository = new MateriaRepository(database);
    const oreAsl: IOreASLRepository = new OreASLRepository(database);
    const logDocs: ILogDocumentoRepository = new LogDocumentoRepository(database);
    const cattedraResolver = new CattedraResolver(database);
    const cdc = new CdcAssembler(classi, materie, cattedraResolver);
    const storicoDb = new MasterStoricoDatabaseProvider(master, new LoggerService());

    return new ContextBuilder()
      .registerProvider('school', new SchoolProvider(master, ruoli, docenti))
      .registerProvider('class', new ClasseProvider(classi, alunni))
      .registerProvider('students', new StudentiProvider(classi, alunni, materie))
      .registerProvider('student', new AlunnoProvider(alunni, classi, oreAsl, cdc))
      .registerProvider('tutor', new TutorProvider(classi))
      .registerProvider('consiglio', new ConsiglioClasseProvider(classi, materie, cattedraResolver))
      // ... every other .registerProvider(...) call is UNCHANGED ...
      .registerProvider('documentiClasse', new DocumentiClasseProvider(classi, logDocs));
  }
```

Remove the `SupplenzaRepository`/`ISupplenzaRepository` import and the `supplenze`
local variable entirely if nothing else in this file uses them (check — `cdc`
was the only consumer of `supplenze` before; `SwapAndEnrichInterceptor`'s
`.registerInterceptor(...)` call is deleted in full, including its
`targetProviders`/`targetPaths` config block).

- [ ] **Step 4: Delete the interceptor and its test**

```bash
rm src/application/context-engine/interceptors/SupplentiSubstitutionLookup.ts
rm test/unit/application/context-engine/interceptors/supplenti-substitution-lookup.test.ts
```

- [ ] **Step 5: Run the full context-engine test directory**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine`
Expected: PASS. This directory includes `cdc-assembler.test.ts` (Tasks 6–8),
`recipe.test.ts` (Task 5), and every other provider test — none of the other
providers (`ClasseProvider`, `StudentiProvider`, `TutorProvider`, etc.) are
touched by this task, so they must be unaffected. If any *other* provider test
constructs `ConsiglioClasseProvider`/`AlunnoProvider` directly with the old
constructor arity, update that call site the same way Step 1/2 did (grep for
`new ConsiglioClasseProvider(` / `new AlunnoProvider(` across `test/` first).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: remaining typecheck errors, if any, confined to
`RisolutoreRuoliService.ts`/`EmailNotificationService.ts` consumers not yet
updated (Tasks 10–11) and `sheet-materie-generator.test.ts` (Task 12) — nothing
inside `context-engine/`.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/ test/unit/application/context-engine
git commit -m "feat(cdu): wire CattedraResolver through ContextEngineFactory, retire SwapAndEnrichInterceptor"
```

---

### Task 10: `RisolutoreRuoliService` — switch teacher-enumeration roles to `CattedraResolver`

**Files:**
- Modify: `src/application/services/RisolutoreRuoliService.ts`
- Modify: `test/unit/application/risolutore-ruoli-service.test.ts`

**Interfaces:**
- Consumes: `CattedraResolver.resolvePermanenti(classe, materia, date): Docente[]`,
  `.resolveConsiglio(classe, date): CattedraAssignment[]` (Task 4).

- [ ] **Step 1: Update the 4 tests whose expectations flip under the fix**

The shared fixture's `5A` has `VARIAZIONI_CATTEDRA` (post-Task-2 fix): `MATE`
`rossi → bianchi` effective `2025-10-01`. `NOW = 2026-07-01` in this test file
(well after). These 4 tests currently assert the pre-fix (nominal, wrong)
holder — update them to the effective one:

```ts
// 'CDC returns the whole consiglio di classe' — was ['bianchi@school.it', 'rossi@school.it']
test('CDC returns the whole consiglio di classe', () => {
  const { cdu, service } = build({});
  // 5A: MATE effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since 2025-10-01);
  // FISI nominal holder is also bianchi -> one distinct effective teacher.
  expect(emails(service, 'CDC', cdu)).toEqual(['bianchi@school.it']);
});
```

```ts
// 'DOCENTI_NO_RELIGIONE removes the IRC teacher' — was ['bianchi@school.it', 'rossi@school.it']
test('DOCENTI_NO_RELIGIONE removes the IRC teacher', () => {
  const { cdu, service } = build({});
  // Both MATE (effective, post-variazione) and FISI resolve to bianchi at NOW.
  expect(emails(service, 'DOCENTI_NO_RELIGIONE', cdu)).toEqual(['bianchi@school.it']);
});
```

```ts
// 'DOCENTE_MATERIA resolves the class column for meta.parametriInput.materiaCorrente' — was ['rossi@school.it']
test('DOCENTE_MATERIA resolves the effective holder for meta.parametriInput.materiaCorrente', () => {
  const { cdu, service } = build({ materiaCorrente: 'MATE' });
  expect(emails(service, 'DOCENTE_MATERIA', cdu)).toEqual(['bianchi@school.it']);
});
```

```ts
// 'DOCENTE_PRIMA_PROVA resolves the matching prova teacher when the indirizzo matches' — was ['rossi@school.it']
test('exam-commission resolver (DOCENTE_PRIMA_PROVA) resolves the matching prova teacher when the indirizzo matches', () => {
  const { cdu, service } = build({});
  expect(emails(service, 'DOCENTE_PRIMA_PROVA', cdu)).toEqual(['bianchi@school.it']);
});
```

- [ ] **Step 2: Add a regression test proving the fix (nominal vs effective disagree)**

```ts
describe('RisolutoreRuoliService — VARIAZIONI_CATTEDRA is now honored (regression)', () => {
  test('DOCENTE_MATERIA follows the permanent chair change, not the CLASSI nominal holder', () => {
    const beforeDecorrenza = build({ materiaCorrente: 'MATE' }, 'CLASSE_COMPLETA');
    // Rebuild at a date before the 2025-10-01 decorrenza: nominal holder (rossi) still applies.
    const db = new FakeDatabase(fixtureTables());
    const cduBefore = ContextEngineFactory.create(db).build(
      { target: '5A', tipoTarget: 'classe', now: new Date('2025-09-01'), materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    const service = new RisolutoreRuoliService(db);
    expect(emails(service, 'DOCENTE_MATERIA', cduBefore)).toEqual(['rossi@school.it']);
    expect(emails(service, 'DOCENTE_MATERIA', beforeDecorrenza.cdu)).toEqual(['bianchi@school.it']);
  });

  test('DOCENTI_IRC_ALT is never subject to supplenza routing, regardless of the caller option', () => {
    const { cdu, service } = build({});
    expect(
      emails(service, 'DOCENTI_IRC_ALT', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toEqual(['bianchi@school.it']); // unchanged: IRC teacher, no supply routing applied
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts`
Expected: FAIL on the updated/new tests (current code still reads nominal
`CLASSI` and applies `materiaCorrente`-scoped supplenza routing to
`DOCENTI_IRC_ALT`).

- [ ] **Step 4: Update `RisolutoreRuoliService`**

```ts
// src/application/services/RisolutoreRuoliService.ts
import { CattedraResolver } from './CattedraResolver';

export class RisolutoreRuoliService {
  // ... existing fields ...
  private readonly cattedraResolver: CattedraResolver;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.alunni = new AlunnoRepository(database);
    this.dipartimenti = new DipartimentoRepository(database);
    this.materie = new MateriaRepository(database);
    this.ruoli = new RuoloSpecialeRepository(database);
    this.supplenze = new SupplenzaRepository(database);
    this.cattedraResolver = new CattedraResolver(database);
    this.registro = this.buildRegistro();
  }
```

Replace `cdcCompleto`, `docenteMateria`, `docentiProva`, and the
`DOCENTI_NO_RELIGIONE` registry entry:

```ts
      ['DOCENTI_NO_RELIGIONE', (c) => docenti(this.docentiPermanenti(c.classe, c.data))],
      // --- DOCENTI_IRC_ALT: forced SOLO_TITOLARI below in risolvi(), never supply-routed ---
```

```ts
  /** Full council: effective permanent subject teachers + IRC + ALT (14 §1.1 CDC). */
  private cdcCompleto(classe: Classe, data: Date): Docente[] {
    return [
      ...this.docentiPermanenti(classe, data),
      ...this.classi.getDocentiIRC(classe),
      ...this.classi.getDocentiALT(classe)
    ];
  }

  /** Effective permanent holders across every subject in the cattedra matrix, deduped. */
  private docentiPermanenti(classe: Classe, data: Date): Docente[] {
    const byEmail = new Map<string, Docente>();
    for (const a of this.cattedraResolver.resolveConsiglio(classe, data)) {
      if (a.titolare.id !== null) byEmail.set(a.titolare.id, a.titolare);
    }
    return [...byEmail.values()];
  }
```

```ts
  private docenteMateria(ctx: RoleContext): Docente[] {
    if (ctx.materiaCorrente === null) return [];
    return this.cattedraResolver.resolvePermanenti(ctx.classe, ctx.materiaCorrente, ctx.data);
  }
```

```ts
  /** Teachers of the exam subject(s) for the class's indirizzo (14 §1.1 DOCENTE_*_PROVA). */
  private docentiProva(ctx: RoleContext, prova: 'prima' | 'seconda'): Docente[] {
    const indirizzo = IndirizzoId.of(ctx.classe.indirizzo);
    const out: Docente[] = [];
    for (const materia of this.materie.findAllCached()) {
      const cfg = materia.esameConfig;
      if (cfg === null) continue;
      const matches =
        prova === 'prima'
          ? cfg.isPrimaProvaPerIndirizzo(indirizzo)
          : cfg.isSecondaProvaPerIndirizzo(indirizzo);
      if (matches)
        out.push(...this.cattedraResolver.resolvePermanenti(ctx.classe, materia.materiaId, ctx.data));
    }
    return out;
  }
```

Update every call site of `cdcCompleto`/`docentiPermanenti` that previously
passed only `classe` to now pass `classe, data` — `buildRegistro`'s `CDC` entry:

```ts
      ['CDC', (c) => docenti(this.cdcCompleto(c.classe, c.data))],
```

Force `SOLO_TITOLARI` for `DOCENTI_IRC_ALT` in `risolvi()` regardless of the
caller's option:

```ts
  risolvi(ruolo: string, cdu: Cdu, options: RisolviOptions = {}): Email[] {
    const ctx = this.contextFrom(cdu);
    const strategy = this.registro.get(ruolo);
    const result = strategy !== undefined ? strategy(ctx) : this.referente(ruolo);
    if (result === null) {
      throw new ValidationError(`Ruolo non registrato: ${ruolo}`);
    }
    if (result.kind === 'emails') return dedupe(result.emails);
    // DOCENTI_IRC_ALT: schema limitation (VARIAZIONI_CATTEDRA/SUPPLENZE are
    // MATERIA_ID-scoped, FK to MATERIE.ID; IRC/ALT are CLASSI columns, not
    // MATERIE rows) -- never supply-routed, regardless of the caller's option.
    const regola =
      ruolo === 'DOCENTI_IRC_ALT'
        ? GestioneSupplenti.SOLO_TITOLARI
        : (options.regolaSupplente ?? GestioneSupplenti.SOLO_TITOLARI);
    return dedupe(this.applicaSupplenze(result.docenti, ctx, regola));
  }
```

Note: `RoleContext` already exposes `.data: Date` (confirmed in the existing
`RoleContext` interface / `contextFrom`) — no interface change needed there.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts`
Expected: PASS (all tests)

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: remaining errors confined to `EmailNotificationService.ts`/
`sheet-materie-generator.test.ts` (Tasks 11–12).

- [ ] **Step 7: Commit**

```bash
git add src/application/services/RisolutoreRuoliService.ts test/unit/application/risolutore-ruoli-service.test.ts
git commit -m "fix(roles): route CDC/DOCENTE_MATERIA/DOCENTI_NO_RELIGIONE/exam roles through CattedraResolver"
```

---

### Task 11: `EmailNotificationService.cdcEmails` — switch to `CattedraResolver`

**Files:**
- Modify: `src/application/services/EmailNotificationService.ts`
- Modify: `test/unit/application/email-notification-service.test.ts`

**Interfaces:**
- Consumes: `CattedraResolver.resolveConsiglio(classe, date): CattedraAssignment[]`.

- [ ] **Step 1: Read the two stubbing tests and the PER_DOCENTE/PER_CDC baseline tests first**

Before editing, read `test/unit/application/email-notification-service.test.ts`
around lines 76–120 (baseline `NOW`/`PER_DOCENTE`/`PER_CDC` expectations) and
480–520 (the two tests that `jest.spyOn`/stub `getAllDocentiCDC` directly —
`'targetsPerDocente filters a blank-id CDC docente...'` and `'targetsPerCdc
falls back to "" for target...'`). These stub `ClasseRepository.prototype
.getAllDocentiCDC` (or construct a fake repository with that method) to control
`cdcEmails`'s output directly for edge-case coverage (blank docente id, classe
with no id) — once `cdcEmails` reads `CattedraResolver` instead, stubbing
`getAllDocentiCDC` no longer has any effect on it.

- [ ] **Step 2: Rewrite the two stubbing tests to control `CattedraResolver` instead**

Replace the `getAllDocentiCDC`-stubbing approach with either (a) seeding a
`FakeDatabase` where a `DOCENTI` row has a blank `EMAIL`, or (b) stubbing
`CattedraResolver.prototype.resolveConsiglio` directly with `jest.spyOn`,
returning a `CattedraAssignment[]` with a blank-id titolare / no-id classe as
needed. Prefer (b) — it mirrors the existing spy-based style already used
elsewhere in this suite (e.g. `jest.spyOn(ClasseRepository.prototype,
'getCoordinatori')` in `risolutore-ruoli-service.test.ts`) and keeps the fixture
untouched:

```ts
test('targetsPerDocente filters a blank-id CDC docente and falls back to "" for a classe with no id', () => {
  const spy = jest.spyOn(CattedraResolver.prototype, 'resolveConsiglio').mockReturnValue([
    {
      materia: MateriaId.of('MATE'),
      isItp: false,
      titolare: new Docente({ COGNOME: 'GHOST', NOME: 'X', GENERE: 'M' }), // no EMAIL -> id null
      supplente: null
    },
    {
      materia: MateriaId.of('MATE'),
      isItp: false,
      titolare: Docente.fromData({ EMAIL: 'rossi@school.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' }),
      supplente: null
    }
  ]);
  try {
    // ... existing service/target setup, unchanged ...
    const targets = service.enumerateTargets(conf('PER_DOCENTE'));
    // ... existing assertions, unchanged (still asserting the blank id is dropped and rossi's target is kept) ...
  } finally {
    spy.mockRestore();
  }
});
```

Apply the same pattern to `'targetsPerCdc falls back to "" for target and
classiCompetenza when the classe has no id'` — stub `resolveConsiglio` to
return one assignment for `rossi@school.it` instead of stubbing
`getAllDocentiCDC`. Import `CattedraResolver`, `Docente`, and `MateriaId` at the
top of the test file if not already present.

- [ ] **Step 3: Check the baseline `NOW`/`PER_DOCENTE`/`PER_CDC` tests for fallout**

Read the `NOW` constant and `conf`/`service` setup near the top of the test
file. If `NOW` is at or after `2025-10-01` (the fixture's `VARIAZIONI_CATTEDRA`
decorrenza) and either baseline test's expected email list includes
`rossi@school.it` for a `5A` `MATE`-driven target, update it to
`bianchi@school.it` the same way Task 10 did — using the exact same fixture
mechanism, not a new one. If `NOW` is before `2025-10-01`, no change is needed
for these two tests.

- [ ] **Step 4: Run to verify the updated tests fail against current code**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: FAIL on the two rewritten stubbing tests (they now stub a method
`cdcEmails` doesn't call yet) and possibly the baseline tests per Step 3.

- [ ] **Step 5: Update `EmailNotificationService`**

```ts
// src/application/services/EmailNotificationService.ts
import { CattedraResolver } from './CattedraResolver';

// In the EmailNotificationDeps interface, add:
  cattedraResolver: CattedraResolver;

// In the static create() factory, add to the `base` object:
      cattedraResolver: new CattedraResolver(db),
```

Replace `cdcEmails`:

```ts
  private cdcEmails(classe: Classe): string[] {
    const isArticolata = this.deps.classi.isArticolata(classe);
    const classi = isArticolata ? this.deps.classi.getGruppoArticolazione(classe) : [classe];
    const byEmail = new Map<string, true>();
    const emails: string[] = [];
    for (const c of classi) {
      for (const a of this.deps.cattedraResolver.resolveConsiglio(c, this.deps.now)) {
        const email = a.titolare.id ?? '';
        if (email !== '' && !byEmail.has(email)) {
          byEmail.set(email, true);
          emails.push(email);
        }
      }
    }
    return emails;
  }
```

`getGruppoArticolazione` (confirmed on `IClasseRepository`) already returns
"the class itself plus all related classes (parent + partners)" — the same
scope `getAllDocentiCDCArticolata` covered, so this preserves the existing
articulated-target behavior while switching the per-class source to
`resolveConsiglio`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: PASS (all tests)

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, except `sheet-materie-generator.test.ts` (Task 12).

- [ ] **Step 8: Commit**

```bash
git add src/application/services/EmailNotificationService.ts test/unit/application/email-notification-service.test.ts
git commit -m "fix(email): route cdcEmails through CattedraResolver instead of nominal CLASSI"
```

---

### Task 12: Fix `sheet-materie-generator.test.ts` fallout

**Files:**
- Modify: `test/unit/application/sheet-materie-generator.test.ts`

- [ ] **Step 1: Update `buildCdu` to the new `CdcAssembler` signature**

```ts
function buildCdu(db: FakeDatabase, classeId: string): Cdu {
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const classe = classi.findById(classeId);
  if (classe === null) throw new Error(`fixture classe ${classeId} not found`);
  const date = new Date('2026-07-09'); // matches the hardcoded meta.date.oggi.iso below
  const consiglioDiClasse = new CdcAssembler(classi, materie, new CattedraResolver(db)).assembleForClasse(
    classe,
    date
  );
  const isArticolata = classi.isArticolata(classe);
  // ... rest of the function body UNCHANGED ...
```

Add `import { CattedraResolver } from '../../../src/application/services/CattedraResolver';`.

- [ ] **Step 2: Update the 5A "protects each subject column" expectation**

```ts
    // Columns are alphabetical: A=Fisica (bianchi), B=Matematica (bianchi, post-variazione); COORD=rossi on both.
    const colA = sheets.protectCalls.find((r) => r.range === 'Sheet1!A:A');
    const colB = sheets.protectCalls.find((r) => r.range === 'Sheet1!B:B');
    expect(colA?.editors?.users?.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(colB?.editors?.users?.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
```

(`colB`'s coordinator `rossi` is still protected alongside the now-effective
`bianchi` subject teacher — the ACL entry protects both the subject teacher
role and the coordinator role per its `PERMESSI` config; only the *subject
teacher* half of that set changes from `rossi` to `bianchi`.)

- [ ] **Step 3: Run to verify current failures, then run again after Step 1/2**

Run: `npx jest --config jest.config.cjs test/unit/application/sheet-materie-generator.test.ts`
Expected before this task's edits: FAIL (signature mismatch + stale
expectation + the `3B` test throwing `VariazioneCattedraInconsistenteError` if
Task 2's fixture fix weren't already in place — it is, from Task 2).
Expected after Steps 1–2: PASS (all tests, including the `3B` "protects
nothing" test and the `1F` articulated test, both of which go through the same
`buildCdu` helper and should be unaffected in outcome, only in call signature).

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS clean, project-wide.

- [ ] **Step 5: Commit**

```bash
git add test/unit/application/sheet-materie-generator.test.ts
git commit -m "test(sheet-materie): adapt to CdcAssembler's new signature and effective-holder output"
```

---

### Task 13: Cross-cutting agreement test (CDU, roles, email, ACL agree)

Proves the primary objective directly: for the same `(classe, materia, date)`
and `GestioneSupplenti` policy, CDU rendering, `RisolutoreRuoliService`, and
email/ACL resolution never disagree. Uses the shared fixture's real
`VARIAZIONI_CATTEDRA` + `SUPPLENZE` layering (5A/MATE: `rossi → bianchi` from
`2025-10-01`, chain `rossi→bianchi→verdi` supply Nov 1–30 — same fixture data
Task 10's regression test already exercises, now cross-checked against CDU and
email output too).

**Files:**
- Test: `test/unit/application/cattedra-cross-cutting-agreement.test.ts` (new)

- [ ] **Step 1: Write the test**

```ts
import { ContextEngineFactory } from '../../../src/application/context-engine/ContextEngineFactory';
import { recipe } from '../../../src/application/context-engine/Recipe';
import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { GestioneSupplenti } from '../../../src/domain/value-objects/enums';

describe('CDU / RisolutoreRuoliService agreement across the resolution layers (17)', () => {
  test('after the permanent variazione, before any supplenza: CDU and DOCENTE_MATERIA agree on bianchi', () => {
    const db = new FakeDatabase(fixtureTables());
    const now = new Date('2025-10-15T09:00:00Z');
    const cdu = ContextEngineFactory.create(db).build(
      { target: '5A', tipoTarget: 'classe', now, materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    const cdcEmails = cdu.focus.classe!.consiglioDiClasse
      .filter((d) => d.materie.some((m) => m.sigla === 'MATE'))
      .map((d) => d.anagrafica.email);
    const service = new RisolutoreRuoliService(db);
    const roleEmails = service
      .risolvi('DOCENTE_MATERIA', cdu)
      .map((e) => e.value);

    expect(cdcEmails).toEqual(['bianchi@school.it']);
    expect(roleEmails).toEqual(['bianchi@school.it']);
  });

  test('during the active supplenza (chain rossi->bianchi->verdi for ITA), CDC (ENTRAMBI) and role routing (ENTRAMBI) agree', () => {
    const db = new FakeDatabase(fixtureTables());
    const now = new Date('2025-11-15T09:00:00Z');
    const cdu = ContextEngineFactory.create(db).build(
      { target: '5A', tipoTarget: 'classe', now },
      recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
    );
    // rossi holds no subject at this date (MATE went to bianchi 2025-10-01); the
    // rossi->bianchi SUPPLENZE row ('*' materie, 5A/4B, Nov 1-30) targets rossi as
    // TITOLARE, who is no longer anyone's effective holder for 5A -> it must not
    // reroute bianchi's MATE chair. Confirm via COORDINATORI (COORD=rossi, a
    // non-cattedra role) that the rossi->bianchi->verdi supplenza chain still
    // applies correctly to its OWN unrelated context.
    const coordRow = cdu.focus.classe!.consiglioDiClasse.find((d) => d.ruoli.isCoordinatore);
    const service = new RisolutoreRuoliService(db);
    const coordEmails = service
      .risolvi('COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
      .map((e) => e.value)
      .sort();

    expect(coordRow?.anagrafica.email).toBe('rossi@school.it'); // COORD is not cattedra-resolved
    expect(coordEmails).toEqual(['rossi@school.it', 'verdi@school.it']); // rossi's own chain-resolved supply
  });
});
```

- [ ] **Step 2: Run to verify current behavior**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-cross-cutting-agreement.test.ts`
Expected: PASS if Tasks 1–11 are complete and correct — this task is a
verification net, not new production code. If it fails, the failure points at
exactly which layer (CDU vs role resolution) still disagrees; fix the
underlying task's code, not this test, unless the test's own expectation is
demonstrably wrong (re-derive it from the fixture by hand before changing it).

- [ ] **Step 3: Commit**

```bash
git add test/unit/application/cattedra-cross-cutting-agreement.test.ts
git commit -m "test: cross-cutting CDU/role-resolution agreement for VARIAZIONI_CATTEDRA"
```

---

### Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS. Any remaining failure outside the files touched in Tasks 1–13
follows the exact same mechanical pattern established in Task 10/12: a test
built the shared fixture's `5A`/`MATE` cattedra at a date ≥ `2025-10-01` and
asserted the stale nominal holder `rossi@school.it` where the effective holder
is now `bianchi@school.it` (or asserted a stale `CdcAssembler`/
`ConsiglioClasseProvider`/`AlunnoProvider` constructor arity). Fix by updating
the expectation to the effective holder, or the call site to the new
signature — do not change fixture data to avoid updating a test unless the
fixture itself is demonstrably wrong (as Task 2 established for the `3B` row).

- [ ] **Step 2: Integration and build suites**

Run: `npm run test:integration`
Run: `npm run test:build`
Expected: PASS.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: PASS, zero errors/warnings introduced.

- [ ] **Step 4: `codebase-memory-mcp` verification**

Re-index if needed (`mcp__codebase-memory-mcp__detect_changes` /
`index_repository` on `home-giulio-Desktop-ALDO-implementing`), then:

- Confirm no production consumer still bypasses `CattedraResolver`:
  `search_code(pattern: "getAllDocentiCDC|getDocentiPerMateria", regex: true,
  path_filter: "^src/", mode: "compact")` — every remaining hit should be
  either inside `CattedraResolver.ts`/`CdcAssembler.ts` itself (the resolver's
  own Priority-3 baseline reads) or `StoricoClassiService.ts` (deliberately
  out of scope, historical snapshot — confirm the design doc's rationale still
  holds and note it in the report).
- Confirm no dead resolver path: `search_graph(name_pattern:
  "resolveTitolari|resolveTitolare|resolvePermanenti|resolveCattedra|resolveConsiglio",
  project: "home-giulio-Desktop-ALDO-implementing")`, check each has
  `callers > 0` outside its own test file.
- Confirm no native GAS global leak was introduced: `search_code(pattern:
  "DriveApp|SpreadsheetApp|DocumentApp|PropertiesService|CacheService|
  UrlFetchApp|Utilities|Session|ScriptApp|LockService|MailApp", regex: true,
  path_filter: "^src/(application|domain)/", mode: "files")` — expect no
  results (none of this work should have touched `GoogleApiWrapper`).
- Confirm dependency direction: `get_architecture(project:
  "home-giulio-Desktop-ALDO-implementing", aspects: ["layers"])` — no new
  edge from `src/domain` into `src/application`/`src/infrastructure`.

- [ ] **Step 5: Report**

Summarize in the final message to the user (not a new file unless asked):
changed modules, the final effective-teacher data flow (one sentence per
consumer), the test matrix mapped to the tasks that cover each of the 18 items
from `PROMPT_CATTEDRA.md`, commands run with pass/fail counts, and the one
documented schema-level limitation (IRC/ALT cannot carry `VARIAZIONI_CATTEDRA`/
`SUPPLENZE` under the current schema — `MATERIA_ID`/`MATERIE` are FK-constrained
to `MATERIE.ID`).

---

## Self-Review

**Spec coverage** (against `PROMPT_CATTEDRA.md`'s "Required implementation
work" sections):
- §1 (single boundary, explicit variation-vs-unresolvable distinction, no ad-hoc
  repo instantiation): Tasks 3–4 (`resolveCattedra`/`resolvePermanenti`/
  `resolveConsiglio`, throw-based distinction), wiring via existing
  self-construction convention confirmed consumer-by-consumer in Tasks 6, 9–11.
- §2 (CSV containment, `DATA_DECORRENZA ≤ date`, deterministic tie-break, latest
  wins, `VECCHIO_TITOLARE` guard, reject ambiguity, no silent missing-titolare
  fallback): Task 3 (+ Task 4 for the itp slot).
- §3 (`RoleResolutionLib` supply chain preserved, not reimplemented): untouched
  by this plan — `SupplenzaRepository.findSupplenzaSpecifica` and
  `RisolutoreRuoliService.applicaSupplenze` already do this correctly (verified
  in the design doc's investigation); Tasks 3–4/10 only change what's fed into
  them.
- §4 (CDU council from effective assignments, split-row `ENTRAMBI`/
  `SOLO_SUPPLENTI`, `SOLO_TITOLARI` = effective permanent holder, ITP
  preserved, articulated preserved, IRC/ALT special-cased,
  `SwapAndEnrichInterceptor` retired): Tasks 5–9.
- §5 (`RisolutoreRuoliService` roles, ACL, email, routing-policy semantics):
  Task 10 (roles — `ApplyPermissionsStep`/ACL inherits the fix for free, per
  the design doc's confirmed investigation that it only calls
  `IRoleResolver.risolvi`), Task 11 (email `cdcEmails`).
- §6 (dead-path removal, `getDocentiPerMateria` vs ITP deliberate, no
  sheet-order variation selection, no hidden fallback, clean architecture, no
  native-global leak): Task 2 (dead code), Task 3–4 (deterministic selection),
  Task 14 Step 4 (verification).

**Test matrix coverage** (18 items from `PROMPT_CATTEDRA.md`): 1–2 → Task 3
existing/updated tests; 3 → Task 4 `resolveCattedra` test; 4 → Task 3
"before decorrenza" cases (existing `cattedra-resolver.test.ts` tests, still
valid); 5 → existing "end of supply returns to variazione holder" coverage
already in `cattedra-resolver.test.ts` (Priority 1 test), unaffected by this
plan's changes to Priority 2, re-verified in Task 3 Step 5; 6–7 → existing
`*`/CSV scope tests in `cattedra-resolver.test.ts` and
`variazione-cattedra-repository.test.ts`, untouched; 8–9 → existing supply-chain
tests in `risolutore-ruoli-service.test.ts`/`SupplenzaRepository` tests,
untouched (Priority 1 unchanged); 10–12 → Task 3 new tests; 13 → Task 4
`resolveConsiglio` test; 14 → Task 6 split-row tests; 15 → Task 7; 16 → Task 8 +
Task 10's `DOCENTI_IRC_ALT` regression test; 17 → Task 13; 18 → Task 6
(SOLO_TITOLARI/SOLO_SUPPLENTI/ENTRAMBI VM tests) + Task 10 (routing-policy
tests, pre-existing coverage on `COORDINATORI` still valid since that role is
unaffected).

**Placeholder scan:** no "TBD"/"handle it"/unshown code. Task 6's
`toVMsNominal` step and Task 12's Step 1 both explicitly say "copy the exact
current body" of a named, already-read method — that is a mechanical
copy-paste instruction with the source fully identified (read in this
session), not an unspecified placeholder. Task 14's fallout-fixing step gives
the exact, single mechanical rule to apply, not a vague "fix issues."

**Type consistency:** `CattedraAssignment` (Task 4: `{ materia, titolare, isItp,
supplente }`) is the same shape used in Task 6/7's `CdcAssembler` grouping and
Task 10/11's `resolveConsiglio` consumers throughout. `assembleForClasse`/
`assembleFiltrato`'s `(classe, date, gestioneSupplenti?)` signature is
introduced once in Task 6/8 and consumed identically in Task 9
(`ConsiglioClasseProvider`/`AlunnoProvider`) and Task 12 (test helper).
