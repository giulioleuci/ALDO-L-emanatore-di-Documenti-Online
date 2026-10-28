# GESTIONE_ARTICOLAZIONE Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `CONF_DOC.GESTIONE_ARTICOLAZIONE` (currently a dead column) and a new `CONF_MAIL.GESTIONE_ARTICOLAZIONE` column into a single shared filter that decides which classes a document-generation batch or an email-notification pattern targets: `COMPLETA` (default) excludes articulated partner classes, `ARTICOLATA` excludes the parent class.

**Architecture:** One new method, `ClasseRepository.filterPerGestioneArticolazione`, is the sole place in the app that branches on `GestioneArticolazione`. `DocumentBatchService.generateClassi` and `EmailNotificationService.classiEntryPoint` both call it instead of independently deciding inclusion. Two entities (`ConfigurazioneDocumento`, `ConfigurazioneEmail`) gain a `gestioneArticolazione` field parsed from their respective config tables, defaulting to `COMPLETA` for any unset/unrecognized value.

**Tech Stack:** TypeScript (GAS V8 target, synchronous only), Jest (`ts-jest`) for unit tests.

## Global Constraints

- Target is GAS V8: only synchronous code, no Node-specific APIs.
- Never edit `dist/*` — it is generated.
- Native GAS service globals stay inside `GoogleApiWrapper`; not touched by this feature.
- No circular dependencies across the L0→L4 library layers; not touched by this feature (no `GasLibraryFactory` changes — this is SGSA-domain-specific class-filtering logic, out of that monorepo's scope).
- New services/repositories are wired through `ServiceContainer`/`Bootstrap`; not applicable here — no new service is added, only a method on an already-wired repository.
- Run `npm run typecheck`, `npm run lint`, and `npm test` (or targeted `npx jest --config jest.config.cjs <file>`) before every commit in this plan.

Design doc: `docs/superpowers/specs/2026-08-02-gestione-articolazione-filtering-design.md`.

---

### Task 1: `ConfigurazioneDocumento.gestioneArticolazione`

**Files:**

- Modify: `src/domain/entities/ConfigurazioneDocumento.ts`
- Test: `test/unit/domain/configurazione-documento.test.ts` (new file)

**Interfaces:**

- Consumes: `GestioneArticolazione` enum (`src/domain/value-objects/enums.ts:20-23`, values `ARTICOLATA`/`COMPLETA`, already exists — no change needed there). `COL_CONF_DOC.GESTIONE_ARTICOLAZIONE` (`src/config/schema.ts:198`, already exists).
- Produces: `ConfigurazioneDocumento.gestioneArticolazione: GestioneArticolazione` (readonly field, defaults to `COMPLETA`), included in `toData()`. Used by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/domain/configurazione-documento.test.ts`:

```ts
import { COL_CONF_DOC } from '../../../src/config/schema';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';

function config(overrides: Record<string, unknown> = {}): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    [COL_CONF_DOC.ID]: 'CD_X',
    ...overrides
  });
}

describe('ConfigurazioneDocumento.gestioneArticolazione', () => {
  test.each([
    ['missing column', undefined],
    ['empty Sheets cell', ''],
    ['an unrecognized value', 'BOH']
  ])('defaults to COMPLETA for %s', (_description, raw) => {
    expect(config({ [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: raw }).gestioneArticolazione).toBe(
      GestioneArticolazione.COMPLETA
    );
  });

  test('reads ARTICOLATA explicitly', () => {
    expect(
      config({ [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA' }).gestioneArticolazione
    ).toBe(GestioneArticolazione.ARTICOLATA);
  });

  test('round-trips through toData()', () => {
    expect(
      config({ [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA' }).toData()[
        COL_CONF_DOC.GESTIONE_ARTICOLAZIONE
      ]
    ).toBe('ARTICOLATA');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-documento.test.ts`
Expected: FAIL — `gestioneArticolazione` does not exist on `ConfigurazioneDocumento` (TS compile error surfaced by ts-jest).

- [ ] **Step 3: Implement**

In `src/domain/entities/ConfigurazioneDocumento.ts`:

Change the import on line 1:

```ts
import { FormatoOutput, GestioneArticolazione } from '../value-objects/enums';
```

Add a field next to `formato` (after line 19, `public readonly formato: FormatoOutput;`):

```ts
  public readonly gestioneArticolazione: GestioneArticolazione;
```

In the constructor, after the `this.formato = ...` assignment (after line 33):

```ts
this.gestioneArticolazione =
  data[COL_CONF_DOC.GESTIONE_ARTICOLAZIONE] === GestioneArticolazione.ARTICOLATA
    ? GestioneArticolazione.ARTICOLATA
    : GestioneArticolazione.COMPLETA;
```

In `toData()`, after the `[COL_CONF_DOC.FORMATO]: this.formato,` line (line 93):

```ts
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: this.gestioneArticolazione,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-documento.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/domain/entities/ConfigurazioneDocumento.ts test/unit/domain/configurazione-documento.test.ts
git commit -m "feat: parse CONF_DOC.GESTIONE_ARTICOLAZIONE into ConfigurazioneDocumento"
```

---

### Task 2: `CONF_MAIL.GESTIONE_ARTICOLAZIONE` schema + `ConfigurazioneEmail.gestioneArticolazione`

**Files:**

- Modify: `src/config/schema.ts:34-46` (`COL_CONF_MAIL`)
- Modify: `src/domain/entities/ConfigurazioneEmail.ts`
- Test: `test/unit/domain/configurazione-email.test.ts:1-42` (extend existing file)

**Interfaces:**

- Consumes: `GestioneArticolazione` enum (same as Task 1).
- Produces: `COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE: 'GESTIONE_ARTICOLAZIONE'`. `ConfigurazioneEmail.gestioneArticolazione: GestioneArticolazione` (readonly field, defaults to `COMPLETA`), included in `toData()`. Used by Task 5.

- [ ] **Step 1: Write the failing tests**

In `test/unit/domain/configurazione-email.test.ts`, add this import at the top (after the existing `ConfigurationError` import on line 3):

```ts
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';
```

Append this `describe` block at the end of the file (after the closing `});` on line 42):

```ts
describe('ConfigurazioneEmail.gestioneArticolazione', () => {
  test.each([
    ['missing column', undefined],
    ['empty Sheets cell', ''],
    ['an unrecognized value', 'BOH']
  ])('defaults to COMPLETA for %s', (_description, raw) => {
    expect(config({ [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: raw }).gestioneArticolazione).toBe(
      GestioneArticolazione.COMPLETA
    );
  });

  test('reads ARTICOLATA explicitly and round-trips through toData()', () => {
    const email = config({ [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA' });
    expect(email.gestioneArticolazione).toBe(GestioneArticolazione.ARTICOLATA);
    expect(email.toData()[COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]).toBe('ARTICOLATA');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: FAIL — `COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE` is `undefined` / `gestioneArticolazione` does not exist on `ConfigurazioneEmail`.

- [ ] **Step 3: Implement**

In `src/config/schema.ts`, add to `COL_CONF_MAIL` (after `ALLEGATI: 'ALLEGATI'` on line 45, before the closing `} as const;`):

```ts
  ALLEGATI: 'ALLEGATI',
  GESTIONE_ARTICOLAZIONE: 'GESTIONE_ARTICOLAZIONE'
} as const;
```

(i.e. add a trailing comma to the existing `ALLEGATI` line and add the new key.)

In `src/domain/entities/ConfigurazioneEmail.ts`, change the import on line 1:

```ts
import { ProcessoInvio, GestioneSupplenti, GestioneArticolazione } from '../value-objects/enums';
```

Add a field next to `supplenti` (after line 19, `public readonly supplenti: GestioneSupplenti;`):

```ts
  public readonly gestioneArticolazione: GestioneArticolazione;
```

In the constructor, after the `this.supplenti = ...` assignment (after line 37):

```ts
this.gestioneArticolazione =
  data[COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE] === GestioneArticolazione.ARTICOLATA
    ? GestioneArticolazione.ARTICOLATA
    : GestioneArticolazione.COMPLETA;
```

In `toData()`, after the `[COL_CONF_MAIL.SUPPLENTI]: this.supplenti,` line (line 114):

```ts
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: this.gestioneArticolazione,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-email.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts src/domain/entities/ConfigurazioneEmail.ts test/unit/domain/configurazione-email.test.ts
git commit -m "feat: add CONF_MAIL.GESTIONE_ARTICOLAZIONE and parse it into ConfigurazioneEmail"
```

---

### Task 3: `ClasseRepository.filterPerGestioneArticolazione`

**Files:**

- Modify: `src/domain/repositories/IClasseRepository.ts`
- Modify: `src/infrastructure/repositories/ClasseRepository.ts`
- Test: `test/unit/infrastructure/classe-articolazione.test.ts`

**Interfaces:**

- Consumes: `Classe` entities, `ArticolazioneConfig.isParent()`/`isPartner()` (`src/domain/value-objects/ArticolazioneConfig.ts:53-60`, already exist), `GestioneArticolazione` enum.
- Produces: `filterPerGestioneArticolazione(classi: Classe[], gestione: GestioneArticolazione): Classe[]` on `IClasseRepository`/`ClasseRepository`. Used by Task 4 and Task 5.

- [ ] **Step 1: Write the failing tests**

In `test/unit/infrastructure/classe-articolazione.test.ts`, add this import after the existing `ValidationError` import (line 8):

```ts
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';
```

Append these two tests at the end of the file (after the last test, which ends at line 91):

```ts
test('filterPerGestioneArticolazione: COMPLETA excludes partners, keeps parent + standalone (default)', () => {
  const r = repo();
  const result = r.filterPerGestioneArticolazione(
    [classe('1F'), classe('1F-LSO'), classe('1F-LSS'), classe('5A')],
    GestioneArticolazione.COMPLETA
  );
  expect(result.map((c) => c.id).sort()).toEqual(['1F', '5A']);
});

test('filterPerGestioneArticolazione: ARTICOLATA excludes the parent, keeps partners + standalone', () => {
  const r = repo();
  const result = r.filterPerGestioneArticolazione(
    [classe('1F'), classe('1F-LSO'), classe('1F-LSS'), classe('5A')],
    GestioneArticolazione.ARTICOLATA
  );
  expect(result.map((c) => c.id).sort()).toEqual(['1F-LSO', '1F-LSS', '5A']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/classe-articolazione.test.ts`
Expected: FAIL — `filterPerGestioneArticolazione` is not a function on `ClasseRepository`.

- [ ] **Step 3: Implement**

In `src/domain/repositories/IClasseRepository.ts`, add an import (after the existing `ArticolazioneConfig` import on line 8):

```ts
import type { GestioneArticolazione } from '../value-objects/enums';
```

Add the method to the interface, after `orderedPartners` (after line 59):

```ts
  /** The parent's two partners in canonical [primo, secondo] order, from any class in the group. */
  orderedPartners(classe: Classe): Classe[];
  /**
   * Filters `classi` by CONF_DOC/CONF_MAIL.GESTIONE_ARTICOLAZIONE: `COMPLETA`
   * excludes articolazione partners, `ARTICOLATA` excludes the parent.
   * Standard (non-articulated) classes always pass. The single place in the
   * app that decides class inclusion by articulation type.
   */
  filterPerGestioneArticolazione(classi: Classe[], gestione: GestioneArticolazione): Classe[];
```

In `src/infrastructure/repositories/ClasseRepository.ts`, add an import (after the existing `ArticolazioneConfig` import on line 17):

```ts
import { GestioneArticolazione } from '../../domain/value-objects/enums';
```

Add the method implementation, after `orderedPartners` (after line 371, before the `// --- Per-docente subject lookups` comment on line 373):

```ts

  /**
   * Filters `classi` by CONF_DOC/CONF_MAIL.GESTIONE_ARTICOLAZIONE: `COMPLETA`
   * excludes articolazione partners, `ARTICOLATA` excludes the parent.
   * Standard (non-articulated) classes always pass. The single place in the
   * app that decides class inclusion by articulation type.
   */
  filterPerGestioneArticolazione(classi: Classe[], gestione: GestioneArticolazione): Classe[] {
    return classi.filter((c) => {
      const config = this.getArticolazione(c);
      if (config === null) return true;
      return gestione === GestioneArticolazione.ARTICOLATA ? !config.isParent() : !config.isPartner();
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/classe-articolazione.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/domain/repositories/IClasseRepository.ts src/infrastructure/repositories/ClasseRepository.ts test/unit/infrastructure/classe-articolazione.test.ts
git commit -m "feat: add ClasseRepository.filterPerGestioneArticolazione"
```

---

### Task 4: Wire `DocumentBatchService.generateClassi` to the filter

**Files:**

- Modify: `src/application/services/DocumentBatchService.ts`
- Test: `test/unit/application/document-batch-service.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.filterPerGestioneArticolazione` (Task 3), `ConfigurazioneDocumento.gestioneArticolazione` (Task 1).
- Produces: `DocumentBatchService.generateClassi` now only targets classes that survive the filter for the batch's `CONF_DOC` config. No change to the class's public method signatures (`batchGenerateHandler`, `start`, `registerJobHandlers`).

- [ ] **Step 1: Update the tests to the new expected behavior (this makes them fail against the current code)**

In `test/unit/application/document-batch-service.test.ts`, replace the test at lines 280-301 (`'handler yields one resumable checkpoint per active class and returns the total'`):

```ts
test('handler yields one resumable checkpoint per targeted class and returns the total', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({ confDocId: 'CD1' });
  const checkpoints: BatchCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }
  const result = step.value;
  // Fixture has 4 active classes (5A, 1F, 1F-LSO, 1F-LSS; 3B is inactive).
  // CD1.GESTIONE_ARTICOLAZIONE = COMPLETA (fixture default), so the
  // articulated partners 1F-LSO/1F-LSS are excluded; only the parent (1F)
  // and the standalone class (5A) are targeted.
  expect(generated).toEqual(['5A:CD1', '1F:CD1']);
  expect(checkpoints).toHaveLength(2);
  expect(checkpoints[0]!.nextIndex).toBe(1);
  expect(checkpoints[1]!.percentage).toBe(100);
  expect(result).toEqual({
    success: true,
    totale: 2,
    processed: ['5A', '1F'],
    errori: []
  });
});
```

Replace the test at lines 303-314 (`'handler resumes from params.resumeState...'`):

```ts
test('handler resumes from params.resumeState without reprocessing completed classes (JobRunnerLib resume cycle)', () => {
  const { service, generated } = wire();
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    resumeState: { nextIndex: 1, processed: ['5A'], errori: [] }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['1F:CD1']); // 5A skipped, already processed
  expect(result.processed).toEqual(['5A', '1F']);
});
```

Replace the test at lines 316-326 (`'a single class failure is isolated...'`):

```ts
test('a single class failure is isolated: logged in errori, the batch continues (15 §8)', () => {
  const { service, generated } = wire({ failFor: '5A' });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  const result = step.value;
  expect(generated).toEqual(['1F:CD1']); // 5A failed, 1F still ran
  expect(result.processed).toEqual(['5A', '1F']); // still marked processed (attempted)
  expect(result.errori).toEqual(['5A: template non trovato']);
  expect(result.success).toBe(false);
});
```

Replace the test at lines 328-341 (`'GasProcessMonitorLib progress calls...'`):

```ts
test('GasProcessMonitorLib progress calls (15 §9): register/start once, progress per class, complete at the end', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ monitor });
  const gen = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual(['job_1']);
  expect(monitor.started).toEqual(['job_1']);
  expect(monitor.progress).toHaveLength(2);
  expect(monitor.progress[0]!.message).toContain('5A');
  expect(monitor.progress[1]!.percentage).toBe(100);
  expect(monitor.completed).toHaveLength(1);
  expect(monitor.errors).toHaveLength(0); // non-critical per-element errors never call setError
});
```

Replace the test at lines 354-367 (`'resume does not re-register/re-start the job...'`):

```ts
test('resume does not re-register/re-start the job (only the initial invocation does)', () => {
  const monitor = new FakeProcessMonitor();
  const { service } = wire({ monitor });
  const gen = service.batchGenerateHandler({
    confDocId: 'CD1',
    jobId: 'job_1',
    resumeState: { nextIndex: 1, processed: ['5A'], errori: [] }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();
  expect(monitor.registered).toEqual([]);
  expect(monitor.started).toEqual([]);
  expect(monitor.completed).toHaveLength(1);
});
```

Leave the test at lines 343-352 (`'a failing class surfaces an "Errore: ..." progress message...'`) unchanged — it does not assert on class count and remains valid.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: FAIL — the updated assertions expect 2 targeted classes; the current unfiltered code still produces 4.

- [ ] **Step 3: Implement**

In `src/application/services/DocumentBatchService.ts`, change the call site in `batchGenerateHandler` (line 83):

```ts
return yield * this.generateClassi(config, confDocId, jobId, resume, processed, errori);
```

Change the `generateClassi` signature and its first line (lines 157-164):

```ts
  private *generateClassi(
    config: ConfigurazioneDocumento,
    confDocId: string,
    jobId: string,
    resume: BatchResumeState | null,
    processed: string[],
    errori: string[]
  ): Generator<BatchCheckpoint, BatchResult, void> {
    const attive = this.classi.filterPerGestioneArticolazione(
      this.classi.findAttive(),
      config.gestioneArticolazione
    );
```

(The rest of `generateClassi`'s body is unchanged — it already uses the `attive` local variable.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: PASS (all tests, including the PIANI-path tests which are untouched by this change)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/application/services/DocumentBatchService.ts test/unit/application/document-batch-service.test.ts
git commit -m "fix: DocumentBatchService.generateClassi honors CONF_DOC.GESTIONE_ARTICOLAZIONE"
```

---

### Task 5: Wire `EmailNotificationService.classiEntryPoint` to the filter

**Files:**

- Modify: `src/application/services/EmailNotificationService.ts`
- Test: `test/unit/application/email-notification-service.test.ts`

**Interfaces:**

- Consumes: `IClasseRepository.filterPerGestioneArticolazione` (Task 3), `ConfigurazioneEmail.gestioneArticolazione` (Task 2).
- Produces: `PER_COORDINATORE`/`PER_DOCENTE`/`PER_CDC` targeting now honors each `CONF_MAIL` row's `GESTIONE_ARTICOLAZIONE` instead of always excluding partners. No change to `EmailNotificationService`'s public methods (`sendPattern`, `sendToTarget`, `enumerateTargets`, `getConfigurazione`).

- [ ] **Step 1: Write the failing tests and update existing stubs**

In `test/unit/application/email-notification-service.test.ts`, add this import after the existing `ITeachingAssignmentResolver`/`TeachingAssignment` import block (after line 40):

```ts
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';
```

Update the 4 existing hand-rolled `classiStub` objects so they satisfy the (about to change) `IClasseRepository` contract — add a passthrough `filterPerGestioneArticolazione` to each. These stubs are only exercised with the default `COMPLETA` config in their tests, so a passthrough (no filtering) preserves their existing behavior exactly, since none of their fixture classes are articulation partners.

At lines 170-184 (the `'PER_COORDINATORE routes a parent without coordinatore to its partners'` test), add a line after `getClassiPartner`:

```ts
  const classiStub = {
    findAttive: () => [parent],
    getArticolazione: () => ({ parent: null }),
    getGruppoArticolazione: () => [parent, scientifico, classico],
    getClassiPartner: () => [scientifico, classico],
    filterPerGestioneArticolazione: (classi: Classe[]) => classi,
    getCoordinatori: (classe: Classe) => {
```

(only the new `filterPerGestioneArticolazione` line is added; the rest of the object is unchanged)

At lines 918-926 (`'targetsPerCoordinatore skips a coordinatore with no id...'`), add a line after `isArticolata`:

```ts
    const classiStub = {
      findAttive: () => [classeNoId],
      getArticolazione: () => null,
      isArticolata: () => false,
      filterPerGestioneArticolazione: (classi: Classe[]) => classi,
      getCoordinatori: () => [
```

At lines 937-942 (`'targetsPerDocente filters a blank-id CDC docente...'`), add a line after `getGruppoArticolazione`:

```ts
const classiStub = {
  findAttive: () => [classeNoId],
  getArticolazione: () => null,
  isArticolata: () => false,
  getGruppoArticolazione: () => [classeNoId],
  filterPerGestioneArticolazione: (classi: Classe[]) => classi
} as unknown as ClasseRepository;
```

At lines 959-964 (`'targetsPerCdc falls back to ""...'`), same change:

```ts
const classiStub = {
  findAttive: () => [classeNoId],
  getArticolazione: () => null,
  isArticolata: () => false,
  getGruppoArticolazione: () => [classeNoId],
  filterPerGestioneArticolazione: (classi: Classe[]) => classi
} as unknown as ClasseRepository;
```

Now add three new tests, one per process, proving `conf.gestioneArticolazione` reaches `classiEntryPoint`. Insert them after the test `'PER_CDC: cdcEmails is deterministically sorted by cognome...'` (which ends at line 339, right before the `'PER_ALUNNO: one target per active student'` test at line 341):

```ts
test('targetsPerCoordinatore honors CONF_MAIL.GESTIONE_ARTICOLAZIONE=ARTICOLATA: partners are entry points, parent is excluded', () => {
  const { db, gmail } = wire();
  const parent = Classe.fromData({ ID: '3C', ANNO: 3, INDIRIZZO: 'LICEO' });
  const scientifico = Classe.fromData({ ID: '3C-S', ANNO: 3, INDIRIZZO: 'SCIENTIFICO' });
  const classico = Classe.fromData({ ID: '3C-C', ANNO: 3, INDIRIZZO: 'CLASSICO' });
  const classiStub = {
    findAttive: () => [parent, scientifico, classico],
    filterPerGestioneArticolazione: (classi: Classe[], gestione: GestioneArticolazione) =>
      classi.filter((c) =>
        gestione === GestioneArticolazione.ARTICOLATA ? c.id !== '3C' : c.id === '3C'
      ),
    getCoordinatori: (classe: Classe) => {
      if (classe.id === '3C-S') {
        return [Docente.fromData({ EMAIL: 'scientifico@school.it', DIPART: 'X' })];
      }
      if (classe.id === '3C-C') {
        return [Docente.fromData({ EMAIL: 'classico@school.it', DIPART: 'X' })];
      }
      return [];
    },
    getClassiPartner: () => []
  } as unknown as ClasseRepository;
  const service = new EmailNotificationService(fullDeps(db, gmail, { classi: classiStub }));

  const targets = service.enumerateTargets(
    conf('PER_COORDINATORE', { GESTIONE_ARTICOLAZIONE: 'ARTICOLATA' })
  );

  expect(targets.map((t) => t.docenteEmail).sort()).toEqual([
    'classico@school.it',
    'scientifico@school.it'
  ]);
});

test('targetsPerDocente honors CONF_MAIL.GESTIONE_ARTICOLAZIONE=ARTICOLATA: partners are entry points, parent is excluded', () => {
  const { db, gmail } = wire();
  const parent = Classe.fromData({ ID: '3C', ANNO: 3, INDIRIZZO: 'LICEO' });
  const scientifico = Classe.fromData({ ID: '3C-S', ANNO: 3, INDIRIZZO: 'SCIENTIFICO' });
  const classiStub = {
    findAttive: () => [parent, scientifico],
    filterPerGestioneArticolazione: (classi: Classe[], gestione: GestioneArticolazione) =>
      classi.filter((c) =>
        gestione === GestioneArticolazione.ARTICOLATA ? c.id !== '3C' : c.id === '3C'
      ),
    getArticolazione: () => null
  } as unknown as ClasseRepository;
  const teachingAssignments = teachingResolverFor([
    assignmentFor(Docente.fromData({ EMAIL: 'scientifico-doc@school.it', DIPART: 'X' }))
  ]);
  const service = new EmailNotificationService(
    fullDeps(db, gmail, { classi: classiStub, teachingAssignments })
  );

  const targets = service.enumerateTargets(
    conf('PER_DOCENTE', { GESTIONE_ARTICOLAZIONE: 'ARTICOLATA' })
  );

  expect(targets.map((t) => t.docenteEmail)).toEqual(['scientifico-doc@school.it']);
  expect(targets[0]!.classiCompetenza).toEqual(['3C-S']);
});

test('targetsPerCdc honors CONF_MAIL.GESTIONE_ARTICOLAZIONE=ARTICOLATA: partners are entry points, parent is excluded', () => {
  const { db, gmail } = wire();
  const parent = Classe.fromData({ ID: '3C', ANNO: 3, INDIRIZZO: 'LICEO' });
  const scientifico = Classe.fromData({ ID: '3C-S', ANNO: 3, INDIRIZZO: 'SCIENTIFICO' });
  const classiStub = {
    findAttive: () => [parent, scientifico],
    filterPerGestioneArticolazione: (classi: Classe[], gestione: GestioneArticolazione) =>
      classi.filter((c) =>
        gestione === GestioneArticolazione.ARTICOLATA ? c.id !== '3C' : c.id === '3C'
      ),
    getArticolazione: () => null
  } as unknown as ClasseRepository;
  const teachingAssignments = teachingResolverFor([
    assignmentFor(Docente.fromData({ EMAIL: 'scientifico-doc@school.it', DIPART: 'X' }))
  ]);
  const service = new EmailNotificationService(
    fullDeps(db, gmail, { classi: classiStub, teachingAssignments })
  );

  const targets = service.enumerateTargets(
    conf('PER_CDC', { GESTIONE_ARTICOLAZIONE: 'ARTICOLATA' })
  );

  expect(targets).toEqual([
    {
      tipo: 'cdc',
      tipoTarget: 'classe',
      target: '3C-S',
      emails: ['scientifico-doc@school.it'],
      classiCompetenza: ['3C-S']
    }
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: FAIL — the three new tests fail because `classiEntryPoint`/`targetsPerCoordinatore`/`targetsPerDocente`/`targetsPerCdc` don't yet accept or use a `gestione` parameter (production code still hardcodes partner-exclusion). The 4 updated stubs cause no failures by themselves (an unused extra field is harmless) — they exist to prevent failures once Step 3 lands.

- [ ] **Step 3: Implement**

In `src/application/services/EmailNotificationService.ts`, change the import on line 33:

```ts
import {
  GestioneArticolazione,
  GestioneSupplenti,
  ProcessoInvio
} from '../../domain/value-objects/enums';
```

Replace `classiEntryPoint` (lines 282-291):

```ts
  /**
   * Entry-point classes: `COMPLETA` (default) excludes articolazione
   * partners, `ARTICOLATA` excludes the parent — the excluded side's
   * classes are represented through the included side's `classiCompetenza`
   * expansion (11 §12, 05 §5). Delegates to the single shared filter
   * (`ClasseRepository.filterPerGestioneArticolazione`, same mechanism as
   * `DocumentBatchService.generateClassi`).
   */
  private classiEntryPoint(gestione: GestioneArticolazione): Classe[] {
    return this.deps.classi.filterPerGestioneArticolazione(this.deps.classi.findAttive(), gestione);
  }
```

Update `enumerateTargets`'s switch (lines 231-237), passing `conf.gestioneArticolazione` through:

```ts
    switch (conf.processo) {
      case ProcessoInvio.PER_COORDINATORE:
        return this.targetsPerCoordinatore(conf.gestioneArticolazione);
      case ProcessoInvio.PER_DOCENTE:
        return this.targetsPerDocente(conf.gestioneArticolazione);
      case ProcessoInvio.PER_CDC:
        return this.targetsPerCdc(conf.supplenti, conf.gestioneArticolazione);
```

Update `targetsPerCoordinatore`'s signature and its `classiEntryPoint()` call (lines 342-344):

```ts
  private targetsPerCoordinatore(gestione: GestioneArticolazione): EmailTarget[] {
    const perCoordinatore = new Map<string, string[]>();
    for (const classe of this.classiEntryPoint(gestione)) {
```

Update `targetsPerDocente`'s signature and its `classiEntryPoint()` call (lines 377-379):

```ts
  private targetsPerDocente(gestione: GestioneArticolazione): EmailTarget[] {
    const perDocente = new Map<string, string[]>();
    for (const classe of this.classiEntryPoint(gestione)) {
```

Update `targetsPerCdc`'s signature and its `classiEntryPoint()` call (lines 397-398):

```ts
  private targetsPerCdc(
    gestioneSupplenti: GestioneSupplenti,
    gestioneArticolazione: GestioneArticolazione
  ): EmailTarget[] {
    return this.classiEntryPoint(gestioneArticolazione).map((classe) => ({
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: PASS (all tests, including every pre-existing test — the default-`COMPLETA` behavior is unchanged from before)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/application/services/EmailNotificationService.ts test/unit/application/email-notification-service.test.ts
git commit -m "fix: EmailNotificationService honors CONF_MAIL.GESTIONE_ARTICOLAZIONE for entry-point resolution"
```

---

### Task 6: Documentation

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Modify: `ARTICOLAZIONE.md`

**Interfaces:**

- Consumes: nothing (documentation only, reflects Tasks 1-5).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Tighten the CONF_DOC row and add the CONF_MAIL row**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, replace line 317:

```
| `GESTIONE_ARTICOLAZIONE` | Enum   | —   | Specifica come gestire la generazione per classi articolate                                                  |
```

with:

```
| `GESTIONE_ARTICOLAZIONE` | Enum   | —   | `COMPLETA` (default) esclude le classi partner dal batch di generazione (solo genitore/classe standard); `ARTICOLATA` esclude la classe genitore (solo partner/classe standard)                                                  |
```

In the CONF_MAIL table, after the `POST_PROCESSO` row (line 367), add a new row before the closing `---` (line 369):

```
| `POST_PROCESSO` | JSON    | —   | Azioni post-invio (stesso meccanismo di CONF_DOC)                                                                                                                                                 |
| `GESTIONE_ARTICOLAZIONE` | Enum | —   | Stesso significato di `CONF_DOC.GESTIONE_ARTICOLAZIONE`: `COMPLETA` (default) esclude le classi partner dai punti di ingresso della notifica; `ARTICOLATA` esclude la classe genitore |
```

(only the `GESTIONE_ARTICOLAZIONE` line is new; `POST_PROCESSO` is shown for anchoring the insertion point.)

- [ ] **Step 2: Flip ARTICOLAZIONE.md item 1 to Fixed**

In `ARTICOLAZIONE.md`, replace lines 7-12:

```
## 1. Unused Database Column: `COL_CONF_DOC.GESTIONE_ARTICOLAZIONE`

- **Status**: Open
- **Description**: The column `GESTIONE_ARTICOLAZIONE` exists in the `CONF_DOC` schema and is seeded in test fixtures (typically set to `''` or occasionally `'COMPLETA'`), but it is never read anywhere within `src/application`.
- **Impact**: It is currently a dead schema column with no effect on document generation logic. Resolving it requires a product design decision on whether to implement specific behaviors or deprecate the field.
```

with:

```
## 1. `GESTIONE_ARTICOLAZIONE` Now Filters Which Classes Are Targeted

- **Status**: Fixed
- **Description**: `CONF_DOC.GESTIONE_ARTICOLAZIONE` was a dead schema column (never read by application code). Fixed: `ClasseRepository.filterPerGestioneArticolazione` is now the single place in the app that decides class inclusion by articulation type — `COMPLETA` (default) excludes partner classes, `ARTICOLATA` excludes the parent class, standard classes always pass. `DocumentBatchService.generateClassi` applies it against the relevant `CONF_DOC` row before generating documents. The same column and mechanism were added to `CONF_MAIL` and wired into `EmailNotificationService.classiEntryPoint` for `PER_COORDINATORE`/`PER_DOCENTE`/`PER_CDC`, which previously hardcoded the `COMPLETA`-equivalent behavior unconditionally.
- **Impact**: Batch document generation and CONF_MAIL notification targeting now both honor an explicit ARTICOLATA/COMPLETA choice per config row, instead of generating a document per physical class unconditionally (previous document-generation behavior) or always assuming COMPLETA (previous email-notification behavior).
```

- [ ] **Step 3: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md ARTICOLAZIONE.md
git commit -m "docs: describe COMPLETA/ARTICOLATA semantics for GESTIONE_ARTICOLAZIONE"
```

---

### Task 7: Full verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: PASS, no errors (no native-global leaks, no unused vars from the new imports).

- [ ] **Step 3: Full unit suite**

Run: `npm test`
Expected: PASS, all suites green (this exercises every test touched or added in Tasks 1-5, plus confirms no unrelated suite regressed — e.g. `test/unit/application/generator-strategies.test.ts` and `test/unit/application/sheet-materie-generator.test.ts`, which construct `ConfigurazioneDocumento` fixtures directly and must still pass with the new field defaulting harmlessly).

- [ ] **Step 4: Confirm working tree is clean**

Run: `git status`
Expected: nothing to commit (Tasks 1-6 already committed their own changes).
