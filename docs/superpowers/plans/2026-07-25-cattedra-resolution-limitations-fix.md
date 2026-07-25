# Fixing the two cattedra-resolution limitations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two known, deliberately-deferred limitations from the `2026-07-25-cattedra-resolution.md` plan — (A) let IRC/ALT carry `VARIAZIONI_CATTEDRA`/`SUPPLENZE` by making them flagged `MATERIE` rows, and (B) centralize articulated-class partner-routing inside `CattedraResolver` so `RisolutoreRuoliService.docenteMateria`/`docentiProva` (and everything downstream of them) stop silently under-resolving split subjects on an articulated parent class.

**Architecture:** Phase A revises `SPECS_ALDO/01_SCHEMA_DATABASE.md`'s prior "IRC/ALT must never correspond to MATERIE.ID" constraint, adds a `MATERIE.IS_RELIGIONE_ALT` flag so the generic per-class fan-out (`CattedraResolver.resolveConsiglio`) can include or exclude them on request, and rewires `RisolutoreRuoliService`/`CdcAssembler` to read IRC/ALT through the resolver instead of raw `CLASSI` columns. Phase B relocates the partner-routing logic `CdcAssembler.assignmentsArticolata` already has into `CattedraResolver.resolveCattedra` itself, so every consumer — present and future — gets correct articulated-class resolution for free; this lets `CdcAssembler.assignmentsArticolata` and `EmailNotificationService.gruppoResolutivo` be deleted as redundant.

**Tech Stack:** TypeScript, Jest (`ts-jest`), GAS V8 target. Same conventions as the source plan: `CattedraResolver` self-constructs its repos from a `RepositoryDatabase`; `GestioneSupplenti`/`ReligioneScelta` from `src/domain/value-objects/enums`.

## Global Constraints

- Native GAS globals (`DriveApp`, `SpreadsheetApp`, etc.) only inside `GoogleApiWrapper` — none of this work touches that layer.
- Never edit `dist/*`.
- No circular dependencies across the L0–L4 library layers or `src/domain` → `src/application` → `src/infrastructure` direction.
- Domain layer (`src/domain/**`) stays Google-service-agnostic.
- `npm run typecheck`, `npm run lint`, and the affected Jest projects must pass before any task is considered done.
- Do not weaken tests, lint rules, or architecture checks to make something pass.
- Not yet in production — no data-migration step is needed for either phase.
- Design source of truth: `docs/superpowers/specs/2026-07-25-cattedra-resolution-limitations-fix-design.md`.
- Confirmed decisions (do not re-litigate): (1) IRC/ALT become flagged `MATERIE` rows (`IS_RELIGIONE_ALT`), not a schema-external mechanism; (2) `CattedraResolver.resolveConsiglio` defaults to excluding `IS_RELIGIONE_ALT` materie, opt-in via an options flag, preserving `CDC`/`DOCENTI_NO_RELIGIONE`'s existing distinction; (3) articulated partner-routing is centralized inside `CattedraResolver`, not duplicated locally in `RisolutoreRuoliService`.

---

## File Structure

| File | Responsibility |
|---|---|
| `SPECS_ALDO/01_SCHEMA_DATABASE.md` | MATERIE gains `IS_RELIGIONE_ALT`; IRC/ALT note reversed |
| `src/config/schema.ts` | `COL_MATERIE.IS_RELIGIONE_ALT` |
| `src/domain/entities/Materia.ts` | `isReligioneAlt: boolean` field |
| `src/application/services/CattedraResolver.ts` | `resolveConsiglio` gains `includeReligioneAlt` option (Phase A); `resolveCattedra` becomes articulation-aware internally (Phase B) |
| `src/application/services/RisolutoreRuoliService.ts` | `cdcCompleto`/`docentiPermanenti`/`docentiIrcAlt` route through the resolver; `DOCENTI_IRC_ALT` forcing removed (Phase A); stale doc comments removed (Phase B) |
| `src/application/context-engine/CdcAssembler.ts` | `assembleFiltrato` unified via filtered `resolveConsiglio` (Phase A); `assignmentsArticolata` deleted, `assembleForClasse`/`assembleFiltrato` simplified (Phase B) |
| `src/application/services/EmailNotificationService.ts` | `gruppoResolutivo` deleted, `cdcEmails` simplified (Phase B) |
| `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts` | stale doc comment removed (Phase B) |
| `test/fixtures/tables.ts` | `MATERIE` gains `IRC`/`ALT` rows |
| various `test/unit/**` | new + updated coverage per task |

---

## PHASE A — IRC/ALT as flagged MATERIE rows

### Task 1: Schema — `MATERIE.IS_RELIGIONE_ALT`, `Materia` entity, fixture seed

**Files:**
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Modify: `src/config/schema.ts`
- Modify: `src/domain/entities/Materia.ts`
- Modify: `test/fixtures/tables.ts`
- Modify: `test/unit/infrastructure/materia-repository.test.ts`

**Interfaces:**
- Produces: `Materia.isReligioneAlt: boolean` (public readonly field), used by Task 2's `CattedraResolver.resolveConsiglio`.

- [ ] **Step 1: Write the failing test**

Add to `test/unit/infrastructure/materia-repository.test.ts` (after the existing `'Materia with null ESAME_CFG has no esameConfig'` test):

```ts
test('Materia parses IS_RELIGIONE_ALT, defaulting to false when absent', () => {
  expect(Materia.fromData({ ID: 'MATE' }).isReligioneAlt).toBe(false);
  expect(Materia.fromData({ ID: 'IRC', IS_RELIGIONE_ALT: true }).isReligioneAlt).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/materia-repository.test.ts`
Expected: FAIL — `Materia.fromData({...}).isReligioneAlt` is `undefined`.

- [ ] **Step 3: Add `IS_RELIGIONE_ALT` to the schema**

In `src/config/schema.ts`, in the `COL_MATERIE` object:

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

- [ ] **Step 4: Add the field to `Materia`**

In `src/domain/entities/Materia.ts`, add to `MateriaData`:

```ts
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
  [key: string]: unknown;
}
```

Add the field and its parsing (mirrors `Docente.itp`'s `=== true` pattern) and include it in `toData()`:

```ts
export class Materia extends AldoEntity {
  public readonly nome: string;
  public readonly sintesi: string;
  public readonly colore1: string;
  public readonly colore2: string;
  public readonly simbolo: string;
  public readonly isReligioneAlt: boolean;
  private readonly esameCfgRaw: string | null;
  private readonly evoluzioneRaw: string | null;

  constructor(data: MateriaData = {}) {
    super(data);
    this.id = data[COL_MATERIE.ID] ?? null;
    this.nome = data[COL_MATERIE.NOME] ?? '';
    this.sintesi = data[COL_MATERIE.SINTESI] ?? '';
    const c1 = data[COL_MATERIE.COLORE_1];
    this.colore1 = typeof c1 === 'string' && c1.trim() !== '' ? c1 : DEFAULT_COLORE_1;
    const c2 = data[COL_MATERIE.COLORE_2];
    this.colore2 = typeof c2 === 'string' ? c2 : '';
    const sym = data[COL_MATERIE.SIMBOLO];
    this.simbolo = typeof sym === 'string' ? sym : '';
    this.isReligioneAlt = data[COL_MATERIE.IS_RELIGIONE_ALT] === true;
    const raw = data[COL_MATERIE.ESAME_CFG];
    this.esameCfgRaw = typeof raw === 'string' ? raw : null;
    const evo = data[COL_MATERIE.EVOLUZIONE];
    this.evoluzioneRaw = typeof evo === 'string' ? evo : null;
  }
```

```ts
  override toData(): EntityData {
    return {
      [COL_MATERIE.ID]: this.id,
      [COL_MATERIE.NOME]: this.nome,
      [COL_MATERIE.SINTESI]: this.sintesi,
      [COL_MATERIE.COLORE_1]: this.colore1,
      [COL_MATERIE.COLORE_2]: this.colore2,
      [COL_MATERIE.SIMBOLO]: this.simbolo,
      [COL_MATERIE.ESAME_CFG]: this.esameCfgRaw,
      [COL_MATERIE.EVOLUZIONE]: this.evoluzioneRaw,
      [COL_MATERIE.IS_RELIGIONE_ALT]: this.isReligioneAlt
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/materia-repository.test.ts`
Expected: FAIL still — `materia-repository.test.ts` has two `toHaveLength(2)` assertions (`findByIdCached + caching`, around lines 74/76) that will break once Step 6 adds two more rows to the shared fixture's `MATERIE` array. Fix those now, in the same commit as the fixture change (Step 6), not after:

```ts
test('findByIdCached + caching (06 §Caching)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new MateriaRepository(db);
  expect(r.findByIdCached(MateriaId.of('MATE'))?.sintesi).toBe('Matematica');
  expect(r.findAllCached()).toHaveLength(4); // MATE, FISI, IRC, ALT
  db.table('MATERIE').insert({ ID: 'STOR', NOME: 'Storia', SINTESI: 'Storia', ESAME_CFG: null });
  expect(r.findAllCached()).toHaveLength(4); // cache held
});
```

- [ ] **Step 5: Update the schema doc**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, in the `### MATERIE` table (around line 127), add a row:

```markdown
| `IS_RELIGIONE_ALT` | Boolean | —   | —                         | `true` per le righe IRC/ALT: esclude questa materia dal fan-out generico di `CattedraResolver.resolveConsiglio` salvo richiesta esplicita (evita che appaia in ogni enumerazione di cattedra dove prima non compariva) |
```

Replace the **Nota IRC/ALT** paragraph (around line 116):

```markdown
**Nota IRC/ALT:** Le colonne `IRC` e `ALT` in `CLASSI` corrispondono a righe `MATERIE` con `IS_RELIGIONE_ALT = true` (`ID = 'IRC'`, `ID = 'ALT'`) — questo permette a `VARIAZIONI_CATTEDRA`/`SUPPLENZE` di applicarsi anche a IRC/ALT come a qualsiasi altra materia. Il flag `IS_RELIGIONE_ALT` esiste per preservare la distinzione di ruolo esistente (es. `CDC` le include sempre, `DOCENTI_NO_RELIGIONE` le esclude sempre) — senza di esso, ogni consumatore del fan-out generico vedrebbe IRC/ALT mescolate a risultati che prima non le includevano mai.
```

- [ ] **Step 6: Seed the fixture**

In `test/fixtures/tables.ts`, in the `MATERIE` array, add two rows after `FISI`:

```ts
      {
        ID: 'FISI',
        NOME: 'Fisica',
        SINTESI: 'Fisica',
        COLORE_1: '#2980b9',
        COLORE_2: '#eaf2fd',
        SIMBOLO: '🔭',
        ESAME_CFG: null
      },
      {
        ID: 'IRC',
        NOME: 'Religione Cattolica',
        SINTESI: 'Religione',
        ESAME_CFG: null,
        IS_RELIGIONE_ALT: true
      },
      {
        ID: 'ALT',
        NOME: 'Attività alternativa',
        SINTESI: 'Alternativa',
        ESAME_CFG: null,
        IS_RELIGIONE_ALT: true
      }
    ],
```

(Only replace the closing `]` of the `MATERIE` array — the rest of the file is unchanged.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/materia-repository.test.ts`
Expected: PASS (all tests, including the new one and the two updated `toHaveLength(4)`)

- [ ] **Step 8: Run the full unit suite and confirm the ONLY new failures are ones this task's later steps will fix**

Run: `npm test`
Expected: some collateral failures are possible — any test asserting an exact `MATERIE`-derived count/list against the shared fixture (e.g. via `getAllDocentiCDC`, `findAllSigle`, `findAllCached`) may need updating. Investigate each failure by reading the actual assertion and tracing why it changed (a real new `IRC`/`ALT` `MATERIE` row is now visible) — do NOT weaken any assertion; if a test's premise needs updating to reflect the new fixture state, update it precisely, matching the reasoning style already used in this repo's fixture-fallout fixes (e.g. `git log --oneline -- test/fixtures/tables.ts` for precedent). Record what you found and fixed in your task report — Tasks 3–4 below already anticipate and fix the `RisolutoreRuoliService`/`CdcAssembler` fallout specifically; if you find fallout in a file NEITHER of those tasks touches, fix it here and note it explicitly.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md src/config/schema.ts src/domain/entities/Materia.ts \
  test/fixtures/tables.ts test/unit/infrastructure/materia-repository.test.ts
git commit -m "feat(schema): add MATERIE.IS_RELIGIONE_ALT, seed IRC/ALT as flagged materie"
```

---

### Task 2: `CattedraResolver.resolveConsiglio` gains `includeReligioneAlt`

**Files:**
- Modify: `src/application/services/CattedraResolver.ts`
- Test: `test/unit/application/cattedra-resolver.test.ts`

**Interfaces:**
- Produces: `resolveConsiglio(classe, data, options?: { includeReligioneAlt?: boolean }): CattedraAssignment[]` — signature change, but the new parameter is optional with a backward-compatible default (`{}` → `includeReligioneAlt: false`), so every existing call site (Task 3, 4; `EmailNotificationService.cdcEmails`) keeps compiling unchanged.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/application/cattedra-resolver.test.ts`:

```ts
test('resolveConsiglio excludes IS_RELIGIONE_ALT materie by default, includes them when asked', () => {
  const db = new FakeDatabase({
    MATERIE: [
      { ID: 'MAT' },
      { ID: 'IRC', IS_RELIGIONE_ALT: true }
    ],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it', IRC: 'bianchi@s.it' }]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  const defaultResult = resolver.resolveConsiglio(classe, new Date('2025-09-15'));
  expect(defaultResult.map((a) => a.materia.value)).toEqual(['MAT']);

  const withReligione = resolver.resolveConsiglio(classe, new Date('2025-09-15'), {
    includeReligioneAlt: true
  });
  expect(withReligione.map((a) => a.materia.value).sort()).toEqual(['IRC', 'MAT']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: FAIL — `resolveConsiglio` doesn't accept a third argument yet (TypeScript would actually reject the call at compile time; run `npx tsc --noEmit` first to see the type error, then the runtime failure once you stub the parameter).

- [ ] **Step 3: Update `resolveConsiglio`**

In `src/application/services/CattedraResolver.ts`, replace:

```ts
  /** Class-wide fan-out over every MATERIE column (used by CDU/email enumeration). */
  resolveConsiglio(classe: Classe, data: Date): CattedraAssignment[] {
    const out: CattedraAssignment[] = [];
    for (const materia of this.materie.findAllCached()) {
      out.push(...this.resolveCattedra(classe, materia.materiaId, data));
    }
    return out;
  }
```

with:

```ts
  /**
   * Class-wide fan-out over every MATERIE column (used by CDU/email enumeration).
   * `IS_RELIGIONE_ALT` materie (IRC/ALT) are excluded unless `includeReligioneAlt`
   * is set — preserves the existing distinction between roles that enumerate the
   * whole council including IRC/ALT (e.g. CDC) and roles that don't (e.g.
   * DOCENTI_NO_RELIGIONE), now that IRC/ALT are ordinary (flagged) MATERIE rows.
   */
  resolveConsiglio(
    classe: Classe,
    data: Date,
    options: { includeReligioneAlt?: boolean } = {}
  ): CattedraAssignment[] {
    const includeReligioneAlt = options.includeReligioneAlt ?? false;
    const out: CattedraAssignment[] = [];
    for (const materia of this.materie.findAllCached()) {
      if (materia.isReligioneAlt && !includeReligioneAlt) continue;
      out.push(...this.resolveCattedra(classe, materia.materiaId, data));
    }
    return out;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: PASS (all tests, old + new)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no other call site passes a 3rd argument yet, so nothing else is affected)

- [ ] **Step 6: Commit**

```bash
git add src/application/services/CattedraResolver.ts test/unit/application/cattedra-resolver.test.ts
git commit -m "feat(cattedra): resolveConsiglio gains includeReligioneAlt option"
```

---

### Task 3: `RisolutoreRuoliService` — IRC/ALT via the resolver, drop the forced `SOLO_TITOLARI`

**Files:**
- Modify: `src/application/services/RisolutoreRuoliService.ts`
- Modify: `test/unit/application/risolutore-ruoli-service.test.ts`

**Interfaces:**
- Consumes: `CattedraResolver.resolveConsiglio(classe, data, { includeReligioneAlt: true })` (Task 2).
- Produces: same public method names (`risolvi`) — behavior change only for `DOCENTI_IRC_ALT`'s supplenza routing.

**Read the CURRENT `test/unit/application/risolutore-ruoli-service.test.ts` yourself first** (383 lines) — this task rewrites three specific tests by name; the rest of the file is untouched, and other tasks in this plan don't touch it.

- [ ] **Step 1: Update the three DOCENTI_IRC_ALT-related tests**

Replace `'DOCENTI_IRC_ALT merges CLASSI.IRC + CLASSI.ALT, deduped (MAT_NON_STANDARD §2.C)'` (currently lines 57–61) with:

```ts
  test('DOCENTI_IRC_ALT resolves the effective IRC/ALT holder via CattedraResolver, deduped', () => {
    const { cdu, service } = build({});
    // 5A: IRC's effective holder is bianchi (no variazione on IRC in this fixture,
    // nominal CLASSI.IRC holds); no ALT column set for 5A — merge degrades to just IRC.
    expect(emails(service, 'DOCENTI_IRC_ALT', cdu)).toEqual(['bianchi@school.it']);
  });
```

Replace `'DOCENTI_IRC_ALT is never subject to supplenza routing, regardless of the caller option'` (currently lines 358–363) — this test's premise no longer holds (IRC/ALT ARE now subject to supplenza routing, same as every other role; this specific assertion only happened to pass because `NOW` falls outside every SUPPLENZE window in the fixture, which the OTHER test below already demonstrates isn't true in general). Delete this test entirely — it's superseded by the two tests replacing it below.

Replace `'DOCENTI_IRC_ALT stays on the titolare even inside an active SUPPLENZE window that would otherwise reroute it'` (currently lines 365–382) with:

```ts
  test('DOCENTI_IRC_ALT now honors supplenza routing like any other role (fix — was forced SOLO_TITOLARI before)', () => {
    // SUPPLENZE has TITOLARE bianchi -> SUPPLENTE verdi, 5A/ITA, 2025-11-10..20.
    // docentiIrcAlt (like docentiPermanenti/cdcCompleto) never sets ctx.materiaCorrente,
    // so applicaSupplenze passes materia=undefined to findSupplenzaSpecifica, which
    // bypasses the MATERIE filter on undefined -- the bianchi/ITA row matches on
    // CLASSI alone. This is the SAME coarse, materia-agnostic routing CDC/
    // DOCENTI_NO_RELIGIONE already have (documented, accepted limitation of the
    // role-level routing layer, unrelated to this fix) -- IRC/ALT now share it too,
    // instead of being artificially exempted. Anchored at 2025-11-15, inside the window.
    const INSIDE_WINDOW = new Date('2025-11-15T09:00:00Z');
    const db = new FakeDatabase(fixtureTables());
    const cdu = ContextEngineFactory.create(db).build(
      { target: '5A', tipoTarget: 'classe', now: INSIDE_WINDOW },
      recipe('CLASSE_COMPLETA')
    );
    const service = new RisolutoreRuoliService(db);
    expect(
      emails(service, 'DOCENTI_IRC_ALT', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toEqual(['verdi@school.it']); // was ['bianchi@school.it'] before this fix
  });
```

- [ ] **Step 2: Run to verify the updated tests fail against current code**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts`
Expected: FAIL — the new `verdi@school.it` expectation fails (current code still forces `SOLO_TITOLARI`, returning `bianchi`); the first replaced test still passes coincidentally (same output, different mechanism) but will exercise the new code path once Step 3 lands.

- [ ] **Step 3: Rewrite the production code**

In `src/application/services/RisolutoreRuoliService.ts`:

Replace `cdcCompleto`, `docentiPermanenti`, and `docentiIrcAlt`:

```ts
  /** Full council: effective permanent subject teachers + IRC + ALT (14 §1.1 CDC). */
  private cdcCompleto(classe: Classe, data: Date): Docente[] {
    return this.docentiEffettivi(classe, data, { includeReligioneAlt: true });
  }

  /** Effective permanent holders across every subject in the cattedra matrix, deduped. */
  private docentiPermanenti(classe: Classe, data: Date): Docente[] {
    return this.docentiEffettivi(classe, data, {});
  }

  private docentiEffettivi(
    classe: Classe,
    data: Date,
    options: { includeReligioneAlt?: boolean }
  ): Docente[] {
    const byEmail = new Map<string, Docente>();
    for (const a of this.cattedraResolver.resolveConsiglio(classe, data, options)) {
      if (a.titolare.id !== null) byEmail.set(a.titolare.id, a.titolare);
    }
    return [...byEmail.values()];
  }

  /** IRC + ALT effective holders, deduped by email — now resolved via CattedraResolver like any subject. */
  private docentiIrcAlt(classe: Classe, data: Date): Docente[] {
    const byEmail = new Map<string, Docente>();
    for (const a of this.cattedraResolver.resolveConsiglio(classe, data, {
      includeReligioneAlt: true
    })) {
      if ((a.materia.value === 'IRC' || a.materia.value === 'ALT') && a.titolare.id !== null) {
        byEmail.set(a.titolare.id, a.titolare);
      }
    }
    return [...byEmail.values()];
  }
```

Update the registry entry (find `['DOCENTI_IRC_ALT', (c) => docenti(this.docentiIrcAlt(c.classe))]`):

```ts
      ['DOCENTI_IRC_ALT', (c) => docenti(this.docentiIrcAlt(c.classe, c.data))],
```

Remove the now-stale comment line right above it (`// --- DOCENTI_IRC_ALT: forced SOLO_TITOLARI below in risolvi(), never supply-routed ---`).

In `risolvi()`, replace:

```ts
    if (result.kind === 'emails') return dedupe(result.emails);
    // DOCENTI_IRC_ALT: schema limitation (VARIAZIONI_CATTEDRA/SUPPLENZE are
    // MATERIA_ID-scoped, FK to MATERIE.ID; IRC/ALT are CLASSI columns, not
    // MATERIE rows) -- never supply-routed, regardless of the caller's option.
    const regola =
      ruolo === 'DOCENTI_IRC_ALT'
        ? GestioneSupplenti.SOLO_TITOLARI
        : (options.regolaSupplente ?? GestioneSupplenti.SOLO_TITOLARI);
    return dedupe(this.applicaSupplenze(result.docenti, ctx, regola));
```

with:

```ts
    if (result.kind === 'emails') return dedupe(result.emails);
    const regola = options.regolaSupplente ?? GestioneSupplenti.SOLO_TITOLARI;
    return dedupe(this.applicaSupplenze(result.docenti, ctx, regola));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS, or only failures Task 4 explicitly addresses (`cdc-assembler.test.ts`, `cdc-filtrato.test.ts`) — if anything else fails, investigate and fix per Task 1 Step 8's guidance before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/application/services/RisolutoreRuoliService.ts test/unit/application/risolutore-ruoli-service.test.ts
git commit -m "fix(roles): IRC/ALT resolve via CattedraResolver, drop forced SOLO_TITOLARI"
```

---

### Task 4: `CdcAssembler.assembleFiltrato` — unify IRC/ALT through the resolver

**Files:**
- Modify: `src/application/context-engine/CdcAssembler.ts`
- Modify: `test/unit/application/context-engine/cdc-assembler.test.ts`
- Test (unchanged expectations, re-verify): `test/unit/application/context-engine/cdc-filtrato.test.ts`

**Interfaces:**
- Consumes: `CattedraResolver.resolveConsiglio(classe, date, { includeReligioneAlt: true })` (Task 2); `assignmentsArticolata`'s existing signature gains a 3rd optional parameter (this task only — Phase B deletes the whole method).

**Read the CURRENT `src/application/context-engine/CdcAssembler.ts` yourself first** (261 lines) before editing.

- [ ] **Step 1: Update the local `seed()` fixture in `cdc-assembler.test.ts` to include IRC**

The existing IRC test (`'assembleFiltrato adds the IRC teacher for religione SI...'`, lines 124–132) uses a LOCAL `seed()` function (lines 10–33) whose `MATERIE` array only has `MAT`/`FIS` — it does NOT use the shared `fixtureTables()`. Once `assembleFiltrato` is rewritten to resolve IRC through `resolveConsiglio`, IRC must exist as a `MATERIE` row in THIS local seed too, or it will never be found. Update `seed()`:

```ts
function seed() {
  return {
    MATERIE: [
      { ID: 'MAT', NOME: 'Matematica' },
      { ID: 'FIS', NOME: 'Fisica' },
      { ID: 'IRC', NOME: 'Religione', IS_RELIGIONE_ALT: true },
      { ID: 'ALT', NOME: 'Alternativa', IS_RELIGIONE_ALT: true }
    ],
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
```

(Only the `MATERIE` array changed — everything else in `seed()` is unchanged.)

- [ ] **Step 2: Run to verify current behavior (this specific test should still pass — confirms Step 1 alone is a no-op change)**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: PASS (all 5 tests, including the IRC one) — adding unused `MATERIE` rows doesn't change current (pre-rewrite) behavior, since `assembleFiltrato` doesn't consult `MATERIE` for IRC yet.

- [ ] **Step 3: Rewrite `assembleFiltrato`**

In `src/application/context-engine/CdcAssembler.ts`, replace the whole `assembleFiltrato` method:

```ts
  /**
   * Council filtered for a specific student (14 §1.3): the effective subject
   * teachers (same resolution as `assembleForClasse`), plus the IRC teacher
   * when the student chose religion (SI) or the ALT teacher when ALT (neither
   * for NO) — now resolved through CattedraResolver like any other materia
   * (IRC/ALT are flagged MATERIE rows, ref design doc Phase A), so they honor
   * VARIAZIONI_CATTEDRA/SUPPLENZE too, and split-row group the same way
   * ordinary subjects do. Specificity filtering by `focus.alunno.curriculum`
   * applies only where specificity columns exist in the cattedra matrix — that
   * matrix has none yet, so specificity filtering is deferred (14 §1.3).
   */
  assembleFiltrato(
    classe: Classe,
    religione: ReligioneScelta,
    date: Date,
    gestioneSupplenti: GestioneSupplenti = GestioneSupplenti.SOLO_TITOLARI
  ): DocenteCdcVM[] {
    const isArticolata = this.classi.isArticolata(classe);
    const partners = this.classi.orderedPartners(classe);
    const full = isArticolata
      ? this.assignmentsArticolata(classe, date, true)
      : this.cattedraResolver.resolveConsiglio(classe, date, { includeReligioneAlt: true });
    const filtered = full.filter((a) => {
      if (a.materia.value === 'IRC') return religione === ReligioneScelta.SI;
      if (a.materia.value === 'ALT') return religione === ReligioneScelta.ALT;
      return true;
    });
    return this.toVMsFromAssignments(filtered, classe, isArticolata, partners, gestioneSupplenti);
  }
```

Update `assignmentsArticolata`'s signature to take the new optional flag, threading it through both partner calls:

```ts
  private assignmentsArticolata(
    classe: Classe,
    date: Date,
    includeReligioneAlt = false
  ): CattedraAssignment[] {
    const partners = this.classi.orderedPartners(classe);
    if (partners.length < 2) {
      return this.cattedraResolver.resolveConsiglio(classe, date, { includeReligioneAlt });
    }
    const [primo, secondo] = partners as [Classe, Classe];
    const inPrimo = this.cattedraResolver.resolveConsiglio(primo, date, { includeReligioneAlt });
    const inSecondo =
      primo.id === secondo.id
        ? []
        : this.cattedraResolver.resolveConsiglio(secondo, date, { includeReligioneAlt });

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

`assembleForClasse` is UNCHANGED — it still calls `this.assignmentsArticolata(classe, date)` (2 args, `includeReligioneAlt` defaults `false`), preserving the full council's existing exclusion of IRC/ALT.

- [ ] **Step 4: Update the IRC test's expectation** (grouping now merges IRC into an existing subject-teacher row when the same person holds both, and shows the subject on the VM — this is a real, approved behavior improvement, not a workaround)

Replace `'assembleFiltrato adds the IRC teacher for religione SI, on top of effective subject teachers'`:

```ts
test('assembleFiltrato adds the IRC teacher for religione SI, on top of effective subject teachers', () => {
  const tables = seed();
  tables.CLASSI[0]!.IRC = 'verdi@s.it';
  const db = new FakeDatabase(tables);
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleFiltrato(classe, ReligioneScelta.SI, new Date('2025-09-15'));
  expect(vms.map((v) => v.anagrafica.email).sort()).toEqual(['rossi@s.it', 'verdi@s.it']);
  const verdiRow = vms.find((v) => v.anagrafica.email === 'verdi@s.it')!;
  expect(verdiRow.materie.map((m) => m.sigla)).toEqual(['IRC']);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts test/unit/application/context-engine/cdc-filtrato.test.ts`
Expected: PASS (all tests in both files — `cdc-filtrato.test.ts`'s three tests need NO edits: hand-derive why before running, then confirm — `tablesWithIrc()` sets `5A.IRC = 'verdi@school.it'`; at `now=2026-07-01` (past the `5A`/`MATE` decorrenza), `filtered` for religione SI = MATE(bianchi)+FISI(bianchi)+IRC(verdi) → two rows, `['bianchi@school.it','verdi@school.it']`, matching the existing assertion; NO/ALT religione drop the IRC row, leaving `['bianchi@school.it']`, also matching).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS — this is Phase A's last production-code task; if anything unexpected still fails, investigate before proceeding to Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/CdcAssembler.ts \
  test/unit/application/context-engine/cdc-assembler.test.ts
git commit -m "feat(cdu): assembleFiltrato resolves IRC/ALT via CattedraResolver, split-row capable"
```

---

### Task 5: Phase A full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS, zero failures.

- [ ] **Step 2: Integration and build suites**

Run: `npm run test:integration`
Run: `npm run test:build`
Expected: PASS.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: PASS, zero errors/warnings.

- [ ] **Step 4: Report**

Summarize in your final message: any fallout you found and fixed beyond what Tasks 1–4 explicitly anticipated (there may be none), confirming Phase A is fully green before Phase B begins.

---

## PHASE B — centralize articulated partner-routing in `CattedraResolver`

### Task 6: `CattedraResolver.resolveCattedra` becomes articulation-aware

**Files:**
- Modify: `src/application/services/CattedraResolver.ts`
- Test: `test/unit/application/cattedra-resolver.test.ts`

**Interfaces:**
- Produces: same public method names/signatures (`resolveCattedra`, `resolvePermanenti`, `resolveConsiglio`) — behavior change only: articulated classes now partner-route internally instead of only resolving against whatever class object is passed in.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/application/cattedra-resolver.test.ts`:

```ts
test('resolveCattedra partner-routes an articulated PARENT class for a split subject, never resolving against the parent itself', () => {
  const db = new FakeDatabase(fixtureTables());
  const classe = new ClasseRepository(db).findById(ClasseId.of('1F'))!; // the articulated parent
  const resolver = new CattedraResolver(db);

  // FISI is split: 1F-LSO=bianchi, 1F-LSS=verdi. The parent '1F' itself has no
  // FISI column at all. Before this fix, resolving directly against the parent
  // returned []; now it merges both partners' holders.
  const fisi = resolver.resolveCattedra(classe, MateriaId.of('FISI'), new Date('2026-01-15'));
  expect(fisi.map((a) => a.titolare.id).sort()).toEqual(['bianchi@school.it', 'verdi@school.it']);

  // MATE is shared (COMUNE): both partners nominally hold rossi -> one merged entry, not two.
  const mate = resolver.resolveCattedra(classe, MateriaId.of('MATE'), new Date('2026-01-15'));
  expect(mate.map((a) => a.titolare.id)).toEqual(['rossi@school.it']);
});

test('resolveCattedra falls back to direct resolution for a non-articulated class', () => {
  const db = new FakeDatabase(fixtureTables());
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);
  // 5A is not articulated -- unchanged behavior, same as before this task.
  expect(
    resolver.resolveCattedra(classe, MateriaId.of('MATE'), new Date('2026-01-15')).map((a) => a.titolare.id)
  ).toEqual(['bianchi@school.it']);
});
```

Add the import at the top of the file (alongside the existing local `import { ClasseId } from ...` etc.):

```ts
import { fixtureTables } from '../../fixtures/tables';
```

- [ ] **Step 2: Run to verify the new test fails against current code**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: FAIL — the `1F` parent has no `FISI` column, so `resolveCattedra`'s current direct implementation returns `[]` for the FISI assertion.

- [ ] **Step 3: Rewrite `resolveCattedra`**

In `src/application/services/CattedraResolver.ts`, replace:

```ts
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
```

with:

```ts
  /**
   * One assignment per populated slot (main + itp) for (classe, materia, date).
   * For an articulated class, partner-routes internally (never resolves
   * against the parent — the parent legitimately has no nominal value for a
   * subject split per-partner) and merges the two partners' assignments,
   * deduping an identically-held subject (COMUNE) into one entry. This is the
   * single source of truth for articulated-class resolution — CdcAssembler
   * and RisolutoreRuoliService both consume it without reimplementing routing.
   */
  resolveCattedra(classe: Classe, materia: MateriaId, data: Date): CattedraAssignment[] {
    if (this.classi.isArticolata(classe)) {
      const partners = this.classi.orderedPartners(classe);
      if (partners.length >= 2) {
        return this.resolveCattedraArticolata(partners[0]!, partners[1]!, materia, data);
      }
    }
    return this.resolveCattedraDiretta(classe, materia, data);
  }

  private resolveCattedraDiretta(classe: Classe, materia: MateriaId, data: Date): CattedraAssignment[] {
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

  private resolveCattedraArticolata(
    primo: Classe,
    secondo: Classe,
    materia: MateriaId,
    data: Date
  ): CattedraAssignment[] {
    const inPrimo = this.resolveCattedraDiretta(primo, materia, data);
    const inSecondo = primo.id === secondo.id ? [] : this.resolveCattedraDiretta(secondo, materia, data);
    const byKey = new Map<string, CattedraAssignment>();
    const keyOf = (a: CattedraAssignment): string =>
      `${a.titolare.id ?? ''}::${a.supplente?.id ?? ''}::${a.isItp}`;
    for (const a of inPrimo) byKey.set(keyOf(a), a);
    for (const a of inSecondo) {
      const k = keyOf(a);
      if (!byKey.has(k)) byKey.set(k, a);
    }
    return [...byKey.values()];
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/cattedra-resolver.test.ts`
Expected: PASS (all tests, old + new)

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Run the full unit suite — expect known, temporary fallout**

Run: `npm test`
Expected: `test/unit/application/context-engine/cdc-assembler.test.ts`'s articulated test and `test/unit/application/email-notification-service.test.ts`'s `1F`-group tests may now exercise TWO partner-routing implementations at once (this task's new one inside `CattedraResolver`, plus the still-present, now-redundant `CdcAssembler.assignmentsArticolata`/`EmailNotificationService.gruppoResolutivo`) — they should still PASS (both implementations should agree, since Task 6 relocated rather than changed the merge logic), but confirm this explicitly rather than assuming. If either genuinely fails, stop and investigate before Task 7 (which deletes the now-redundant local implementations) — a failure here means the two implementations disagree, which must be understood, not papered over.

- [ ] **Step 7: Commit**

```bash
git add src/application/services/CattedraResolver.ts test/unit/application/cattedra-resolver.test.ts
git commit -m "feat(cattedra): resolveCattedra partner-routes articulated classes internally"
```

---

### Task 7: `CdcAssembler` — delete `assignmentsArticolata`, simplify both public methods

**Files:**
- Modify: `src/application/context-engine/CdcAssembler.ts`
- Test: `test/unit/application/context-engine/cdc-assembler.test.ts` (re-verify only, no new tests required — Task 6 already added the resolver-level coverage)

**Interfaces:**
- Produces: `assembleForClasse`/`assembleFiltrato` — same public signatures, simplified bodies.

- [ ] **Step 1: Run the articulated tests to record the CURRENT (Task 6-era) passing baseline**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: PASS (5 tests) — this is your baseline; Step 3's rewrite must keep it green.

- [ ] **Step 2: Simplify `assembleForClasse` and `assembleFiltrato`**

In `src/application/context-engine/CdcAssembler.ts`, replace `assembleForClasse`:

```ts
  /** Full council of the class (09 §4) at `date`, per the confirmed split-row design. */
  assembleForClasse(
    classe: Classe,
    date: Date,
    gestioneSupplenti: GestioneSupplenti = GestioneSupplenti.SOLO_TITOLARI
  ): DocenteCdcVM[] {
    const isArticolata = this.classi.isArticolata(classe);
    const partners = this.classi.orderedPartners(classe);
    const assignments = this.cattedraResolver.resolveConsiglio(classe, date);
    return this.toVMsFromAssignments(assignments, classe, isArticolata, partners, gestioneSupplenti);
  }
```

Replace `assembleFiltrato`:

```ts
  /**
   * Council filtered for a specific student (14 §1.3): the effective subject
   * teachers, plus the IRC teacher when the student chose religion (SI) or the
   * ALT teacher when ALT (neither for NO) — IRC/ALT are flagged MATERIE rows
   * (ref design doc Phase A), resolved through CattedraResolver like any other
   * materia, split-row capable. Specificity filtering by
   * `focus.alunno.curriculum` applies only where specificity columns exist in
   * the cattedra matrix — that matrix has none yet, so specificity filtering
   * is deferred (14 §1.3).
   */
  assembleFiltrato(
    classe: Classe,
    religione: ReligioneScelta,
    date: Date,
    gestioneSupplenti: GestioneSupplenti = GestioneSupplenti.SOLO_TITOLARI
  ): DocenteCdcVM[] {
    const isArticolata = this.classi.isArticolata(classe);
    const partners = this.classi.orderedPartners(classe);
    const full = this.cattedraResolver.resolveConsiglio(classe, date, { includeReligioneAlt: true });
    const filtered = full.filter((a) => {
      if (a.materia.value === 'IRC') return religione === ReligioneScelta.SI;
      if (a.materia.value === 'ALT') return religione === ReligioneScelta.ALT;
      return true;
    });
    return this.toVMsFromAssignments(filtered, classe, isArticolata, partners, gestioneSupplenti);
  }
```

Delete the `assignmentsArticolata` private method entirely (it's now redundant — `CattedraResolver.resolveConsiglio`/`resolveCattedra` partner-route internally per Task 6).

`toVMsFromAssignments`, `buildVMFromGroup`, and `tipoArticolazioneDi` are all UNCHANGED — they operate on the already-resolved `CattedraAssignment[]` and nominal-column tagging respectively, neither of which cares how the assignments were computed.

- [ ] **Step 3: Run tests to verify the baseline still passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/cdc-assembler.test.ts`
Expected: PASS (5 tests, identical to Step 1's baseline — same test names, same assertions, now exercising the simplified code path)

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS — confirm no other file references `assignmentsArticolata` (it was private, so this should be a non-issue, but verify with `grep -rn "assignmentsArticolata" src test`)

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/CdcAssembler.ts
git commit -m "refactor(cdc): delete redundant assignmentsArticolata, CattedraResolver now partner-routes"
```

---

### Task 8: `EmailNotificationService` — delete `gruppoResolutivo`, simplify `cdcEmails`

**Files:**
- Modify: `src/application/services/EmailNotificationService.ts`
- Test: `test/unit/application/email-notification-service.test.ts` (re-verify only)

- [ ] **Step 1: Run the `1F`-group tests to record the CURRENT passing baseline**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "1F"`
Expected: PASS — this includes the `'PER_CDC: cdcEmails is deterministically sorted by cognome...'` test that specifically proves `emails[0]` stability; it must stay green after this task's simplification.

- [ ] **Step 2: Simplify `cdcEmails`, delete `gruppoResolutivo`**

In `src/application/services/EmailNotificationService.ts`, replace:

```ts
  private cdcEmails(classe: Classe): string[] {
    const classi = this.gruppoResolutivo(classe);
    const byEmail = new Map<string, string>(); // email -> cognome
    for (const c of classi) {
      for (const a of this.deps.cattedraResolver.resolveConsiglio(c, this.deps.now)) {
        const email = a.titolare.id ?? '';
        if (email !== '' && !byEmail.has(email)) {
          byEmail.set(email, a.titolare.cognome);
        }
      }
    }
    return [...byEmail.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([email]) => email);
  }

  /**
   * Classes to fan `resolveConsiglio` out over for an entry-point classe
   * (11 §12, 05 §5). A non-articulated classe resolves on itself. An
   * articulated parent has no per-subject cattedra columns of its own (only
   * its partners do — 06 §3), so resolving directly on it can hit a
   * VARIAZIONI_CATTEDRA row scoped to the parent's CLASSE_ID with no nominal
   * holder to match; `orderedPartners` (the two partner classes) is the
   * correct fan-out, matching CdcAssembler.assignmentsArticolata's same-scope
   * merge over primo/secondo instead of the parent + partners.
   */
  private gruppoResolutivo(classe: Classe): Classe[] {
    if (!this.deps.classi.isArticolata(classe)) return [classe];
    const partners = this.deps.classi.orderedPartners(classe);
    return partners.length >= 2 ? partners : [classe];
  }
```

with:

```ts
  /**
   * Effective council emails for an entry-point classe, deduped and sorted by
   * cognome (deterministic emails[0], ref 11 §14). CattedraResolver
   * partner-routes articulated classes internally (ref cattedra-resolution
   * design doc Phase B) — a single resolveConsiglio call is correct whether
   * `classe` is articulated or not.
   */
  private cdcEmails(classe: Classe): string[] {
    const byEmail = new Map<string, string>(); // email -> cognome
    for (const a of this.deps.cattedraResolver.resolveConsiglio(classe, this.deps.now)) {
      const email = a.titolare.id ?? '';
      if (email !== '' && !byEmail.has(email)) {
        byEmail.set(email, a.titolare.cognome);
      }
    }
    return [...byEmail.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([email]) => email);
  }
```

- [ ] **Step 3: Run tests to verify the baseline still passes**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: PASS (full file — not just the `-t "1F"` subset from Step 1, since `cdcEmails` is used by `targetsPerDocente`/`targetsPerCdc` broadly)

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS — confirm no other file references `gruppoResolutivo` (`grep -rn "gruppoResolutivo" src test`)

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/services/EmailNotificationService.ts
git commit -m "refactor(email): delete redundant gruppoResolutivo, CattedraResolver now partner-routes"
```

---

### Task 9: Remove stale doc comments, add the articulated-class regression proof

**Files:**
- Modify: `src/application/services/RisolutoreRuoliService.ts`
- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Modify: `test/unit/application/risolutore-ruoli-service.test.ts`

**Interfaces:** none — no signature changes, comment removal plus one new test.

- [ ] **Step 1: Write the failing regression test**

Append to `test/unit/application/risolutore-ruoli-service.test.ts`, inside (or alongside) the existing `'RisolutoreRuoliService — VARIAZIONI_CATTEDRA is now honored (regression)'` describe block:

```ts
  test('DOCENTE_MATERIA and DOCENTE_PRIMA_PROVA now partner-route an articulated PARENT class (fix — used to silently return [])', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = ContextEngineFactory.create(db).build(
      { target: '1F', tipoTarget: 'classe', now: NOW, materiaCorrente: 'FISI' },
      recipe('CLASSE_COMPLETA')
    );
    const service = new RisolutoreRuoliService(db);
    // FISI is split per-partner (1F-LSO=bianchi, 1F-LSS=verdi); '1F' itself (the
    // parent) has no FISI column. Before this fix, resolvePermanenti('1F', FISI, ...)
    // resolved directly against the parent and returned [].
    expect(emails(service, 'DOCENTE_MATERIA', cdu)).toEqual(['bianchi@school.it', 'verdi@school.it']);

    // MATE is shared (COMUNE, rossi on both partners) -- prima_prova matches SCIENTIFICO
    // (1F's own indirizzo), and the merge must not duplicate rossi.
    const cduMate = ContextEngineFactory.create(db).build(
      { target: '1F', tipoTarget: 'classe', now: NOW, materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    expect(emails(service, 'DOCENTE_PRIMA_PROVA', cduMate)).toEqual(['rossi@school.it']);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts`
Expected: FAIL — `DOCENTE_MATERIA` currently returns `[]` for the FISI/`1F` case (this test is written against the ALREADY-FIXED `CattedraResolver` from Task 6/7/8, so it should actually PASS if Tasks 6–8 landed correctly; if it fails, that's a signal Task 6's fix isn't reaching `docenteMateria`/`docentiProva` as expected — investigate `resolvePermanenti`'s call chain before assuming this step's "Expected: FAIL" framing is literal. In practice, since this task lands AFTER Tasks 6–8, this test should go GREEN immediately — treat that as confirmation the fix already works end-to-end, not a process failure.)

- [ ] **Step 3: Remove the stale doc comments**

In `src/application/services/RisolutoreRuoliService.ts`, replace the `docenteMateria` method's doc comment:

```ts
  private docenteMateria(ctx: RoleContext): Docente[] {
    if (ctx.materiaCorrente === null) return [];
    return this.cattedraResolver.resolvePermanenti(ctx.classe, ctx.materiaCorrente, ctx.data);
  }
```

(delete the `KNOWN LIMITATION` block above it — `CattedraResolver` now partner-routes internally, per Task 6).

In `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`, replace `resolveDocentiMateria`'s doc comment:

```ts
  /** DOCENTE_MATERIA resolution needs `meta.parametriInput.materiaCorrente` set per column — RisolutoreRuoliService reads it off the CDU it's given. */
  private resolveDocentiMateria(cdu: Cdu, sigla: string): string[] {
```

(delete the `KNOWN LIMITATION` block that follows it — same reason).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/services/RisolutoreRuoliService.ts \
  src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts \
  test/unit/application/risolutore-ruoli-service.test.ts
git commit -m "docs: remove stale KNOWN LIMITATION comments, add articulated-class regression proof"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS, zero failures.

- [ ] **Step 2: Integration and build suites**

Run: `npm run test:integration`
Run: `npm run test:build`
Expected: PASS.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: PASS, zero errors/warnings.

- [ ] **Step 4: `codebase-memory-mcp` verification**

Re-index if needed (`mcp__codebase-memory-mcp__detect_changes` / `index_repository` on the relevant project), then:

- Confirm `assignmentsArticolata`/`gruppoResolutivo` are genuinely gone with zero references: `search_code(pattern: "assignmentsArticolata|gruppoResolutivo", regex: true, path_filter: "^(src|test)/")` — expect zero hits.
- Confirm no production consumer bypasses `CattedraResolver` for materia/CDC enumeration: `search_code(pattern: "getAllDocentiCDC|getDocentiPerMateria", regex: true, path_filter: "^src/", mode: "compact")` — every hit should be inside `CattedraResolver.ts` itself, or `StoricoClassiService.ts` (deliberately out of scope, historical snapshot — confirm this note still holds; note that `getAllDocentiCDC`'s output MAY now silently include IRC/ALT for classes where they're set, since `IS_RELIGIONE_ALT`-flagged materie are now real `MATERIE.ID` rows feeding `ClasseRepository`'s dynamic `materieColumns` map — this is an accepted, out-of-scope side effect of Phase A; confirm it doesn't break any `StoricoClassiService` test).
- Confirm no native GAS global leak was introduced: `search_code(pattern: "DriveApp|SpreadsheetApp|DocumentApp|PropertiesService|CacheService|UrlFetchApp|Utilities|Session|ScriptApp|LockService|MailApp", regex: true, path_filter: "^src/(application|domain)/", mode: "files")` — expect no results.
- Confirm dependency direction: `get_architecture(aspects: ["layers"])` — no new edge from `src/domain` into `src/application`/`src/infrastructure`.

- [ ] **Step 5: Report**

Summarize in the final message to the user (not a new file unless asked): both limitations' final state (IRC/ALT now schema-native, articulated partner-routing centralized), the two documented limitations from the SOURCE plan are now fully resolved (confirm neither `RisolutoreRuoliService.ts` nor `SheetMaterieConPermessiGeneratorStrategy.ts` still carries a `KNOWN LIMITATION` comment — `grep -rn "KNOWN LIMITATION" src/`), commands run with pass/fail counts, and any fallout found/fixed beyond what individual tasks anticipated.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-25-cattedra-resolution-limitations-fix-design.md`):
- Phase A schema change, flag design, `resolveConsiglio` option, `RisolutoreRuoliService`/`CdcAssembler` rewiring, forced-`SOLO_TITOLARI` removal: Tasks 1–4.
- Phase B centralization inside `CattedraResolver`, cascading simplification of `CdcAssembler`/`EmailNotificationService`, stale-comment removal, regression proof: Tasks 6–9.
- Full verification (both phases): Tasks 5, 10.
- Open risk noted in the design doc (`tipoArticolazioneDi`'s effective-vs-nominal edge case) is explicitly NOT in scope for either phase — confirmed not touched by any task above.

**Placeholder scan:** no "TBD"/"handle it"/unshown code. Every step gives exact file content or an exact command with a stated expected result. Task 1 Step 8 and Task 3 Step 6 explicitly instruct "investigate and fix, don't weaken" for any fallout beyond what's anticipated — this is a mechanical rule, not a vague placeholder, matching the source plan's own precedent (its Task 14 Step 1).

**Type consistency:** `CattedraAssignment` (unchanged shape: `{ materia, titolare, isItp, supplente }`) is used identically across Tasks 2, 3, 4, 6, 7, 8. `resolveConsiglio(classe, data, options?: { includeReligioneAlt?: boolean })`'s signature is introduced once in Task 2 and consumed identically everywhere else (Task 3's `docentiEffettivi`/`docentiIrcAlt`, Task 4/7's `assembleFiltrato`). `Materia.isReligioneAlt: boolean` introduced once in Task 1, consumed identically in Task 2.
