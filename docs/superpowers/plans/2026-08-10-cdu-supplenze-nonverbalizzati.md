# CDU Supplenze & Piani Non Verbalizzati Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `focus.classe.supplenze[]` (aggregated active supplenze) and `focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati` (partition of non-verbalized plans) to the CDU, their types, tests and spec documentation.

**Architecture:** `ConsiglioClasseProvider` already resolves the class `TeachingAssignment[]` once; it now also emits `focus.classe.supplenze`, aggregated per (supplente, titolare) pair from the raw assignments (so it is populated even under `SOLO_TITOLARI`, where the council VM hides the swap). `PianiPersClasseProvider` derives `nonVerbalizzati` from its own `items` (filter `stato !== VERBALIZZATO`). Both are CDU-shape mappings of ALDO-domain data — no `GasLibraryFactory` extension.

**Tech Stack:** TypeScript (GAS V8 target, sync-only), Jest/ts-jest, `GasLibraryFactory` already consumed via `ITeachingAssignmentResolver` and the `ContextEngine` builder.

## Global Constraints

- Follow the design doc `docs/superpowers/specs/2026-08-10-cdu-supplenze-nonverbalizzati-design.md`; the authoritative CDU spec is `SPECS_ALDO/02_CDU_STRUTTURA.md`.
- No native GAS globals introduced; production code stays synchronous.
- Templates must NEVER filter on `stato` (Principle 3) — the `nonVerbalizzati` partition is precomputed.
- Reuse existing VMs: `PersonVM`/`buildPersonVmFromDocente`, `SubjectVM` via the existing `materiaVm` catalog lookup, `PianoPersonalizzatoItem.studente` shape, `tipoPianoLabel`.
- Commit steps below are ONLY executed if the user explicitly authorizes commits (workspace `AGENTS.md` forbids unrequested commits).
- Never edit `dist/*`.

---

### Task 1: CDU contract types (`Cdu.ts`)

**Files:**
- Modify: `src/application/context-engine/Cdu.ts`

**Interfaces:**
- Produces: exported interface `SupplenzaAggregataVM`; `CduClasse.supplenze?: SupplenzaAggregataVM[]`; `CduClasse.didattica.pianiPersonalizzati.nonVerbalizzati?` — later tasks and tests import these.

- [ ] **Step 1: Add the `SupplenzaAggregataVM` interface**

Insert after the `PianoPersonalizzatoItem` interface (ends at `Cdu.ts:94`):

```ts
/**
 * One aggregated active supplenza row of `focus.classe.supplenze` (02 §4.1/§8.12):
 * one item per (supplente, titolare) pair, materie combined. Populated from the
 * raw teaching assignments, so it reflects actual delegations regardless of the
 * `gestioneSupplenti` routing policy.
 */
export interface SupplenzaAggregataVM {
  /** Docente effettivamente attivo (chain-resolved supplente, §8.1). */
  supplente: PersonVM;
  /** Titolare sostituito (`assignment.titolare`, §8.1). */
  titolare: PersonVM;
  /** Materie coperte — base SubjectVM (§8.2), no `docenti`/`continuita` fields. */
  dettaglioMaterie: SubjectVM[];
}
```

- [ ] **Step 2: Add `supplenze` to `CduClasse`**

In `CduClasse` (currently `Cdu.ts:145-265`), after the `consiglioDiClasseSeparato` field (`Cdu.ts:192`):

```ts
  consiglioDiClasseSeparato?: DocenteCdcVM[];
  /** Active supplenze aggregated per (supplente, titolare) pair (02 §4.1/§8.12) — always set when the `consiglio` provider runs (`[]` if none). */
  supplenze?: SupplenzaAggregataVM[];
```

- [ ] **Step 3: Add `nonVerbalizzati` to `pianiPersonalizzati`**

In `CduClasse.didattica.pianiPersonalizzati` (currently `Cdu.ts:246-251`), after the `storico?` field:

```ts
    pianiPersonalizzati: {
      items: PianoPersonalizzatoItem[];
      storico?: LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
      /** Precomputed partition of `items` with stato !== VERBALIZZATO (02 §4.1) — templates MUST NOT filter on `stato`. */
      nonVerbalizzati?: {
        isPresenteLista: boolean;
        elenco: Array<{
          studente: { nomeCompleto: string; email: string };
          tipoLabel: string;
        }>;
      };
    };
```

Keep the field optional (`?`): `DocumentiClasseProvider` may construct `{ pianiPersonalizzati: { items: [] } }` when `didattica` is absent.

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (no unused-import errors; no consumers yet).

---

### Task 2: Extract the shared slot→SubjectVM mapper

**Files:**
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts:215-234`

**Interfaces:**
- Produces: module-scoped `materiaVmFromSlot(materie: IMateriaRepository, classe: Classe, slot: { materia: string; kind: string; specifica: string | null }): SubjectVM | null` — reused by `materiaVm` (unchanged behavior) and by Task 3.

- [ ] **Step 1: Refactor `materiaVm` to delegate to a slot-level helper**

Replace the current `materiaVm` body (lines 215-234) with:

```ts
function materiaVmFromSlot(
  materie: IMateriaRepository,
  classe: Classe,
  slot: { materia: string; kind: string; specifica: string | null }
): SubjectVM | null {
  const baseId = MateriaId.of(slot.materia);
  const specifica = slot.specifica;
  const materia =
    specifica === null
      ? materie.findByIdCached(baseId)
      : (materie.findSpecifiche(baseId).find((m) => m.id === `${baseId.value}.${specifica}`) ??
        null);
  if (materia === null) return null;
  return buildSubjectVm(materia, {
    indirizzo: IndirizzoId.of(classe.indirizzo),
    isITP: slot.kind === 'ITP',
    principale: materia.principale,
    specificita: materia.specificita
  });
}

function materiaVm(
  materie: IMateriaRepository,
  classe: Classe,
  assignment: FlattenedProjectionAssignment
): SubjectVM | null {
  return materiaVmFromSlot(materie, classe, assignment.slot);
}
```

`FlattenedProjectionAssignment.slot` is `{ materia: string; kind: string; specifica: string | null; hasSpecificity: boolean }` — structurally compatible with the helper's `slot` parameter.

- [ ] **Step 2: Run the existing council tests**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts test/unit/application/context-engine/swap-supplenti.test.ts --runInBand`
Expected: PASS (pure extraction, no behavior change).

---

### Task 3: `buildSupplenzeAggregate` + wiring + tests

**Files:**
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts`
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts`
- Test: `test/unit/application/context-engine/swap-supplenti.test.ts`

**Interfaces:**
- Consumes: Task 1 `SupplenzaAggregataVM`; Task 2 `materiaVmFromSlot`; existing `dedupeMaterie`, `buildPersonVmFromDocente` (`mappers/personVmMapper.ts`), `buildSubjectVm`.
- Produces: exported `buildSupplenzeAggregate(assignments: TeachingAssignment[], materie: IMateriaRepository, classe: Classe): SupplenzaAggregataVM[]`; `focus.classe.supplenze` populated by the `consiglio` provider token.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/application/context-engine/swap-supplenti.test.ts`:

```ts
test('focus.classe.supplenze aggregates active delegations even under the default SOLO_TITOLARI routing', () => {
  const cdu = composeContextBuilder(new FakeDatabase(tablesWith4B())).build(
    { target: '4B', tipoTarget: 'classe', now: duringSupplenza },
    recipe('CLASSE_COMPLETA')
  );
  const supplenze = cdu.focus.classe!.supplenze!;
  expect(supplenze).toHaveLength(1);
  expect(supplenze[0]!.supplente).toMatchObject({
    nome: 'LUCIA',
    cognome: 'BIANCHI',
    email: 'bianchi@school.it',
    genere: 'F',
    nomeCompleto: 'LUCIA BIANCHI',
    appellativoCompleto: 'Prof.ssa LUCIA BIANCHI'
  });
  expect(supplenze[0]!.titolare).toMatchObject({
    nome: 'MARIO',
    cognome: 'ROSSI',
    email: 'rossi@school.it',
    nomeCompleto: 'MARIO ROSSI'
  });
  expect(supplenze[0]!.dettaglioMaterie.map((m) => m.sigla)).toEqual(['MATE']);
  expect(supplenze[0]!.dettaglioMaterie[0]!.nomeSintetico).toBe('Matematica');
});

test('supplenze merges every covered slot into one (supplente, titolare) item with base SubjectVM entries', () => {
  const t = tablesWith4B();
  (t['CLASSI'] as Row[]).find((r) => r['ID'] === '4B')!['FISI'] = 'rossi@school.it';
  const cdu = composeContextBuilder(new FakeDatabase(t)).build(
    { target: '4B', tipoTarget: 'classe', now: duringSupplenza },
    recipe('CLASSE_COMPLETA')
  );
  const item = cdu.focus.classe!.supplenze![0]!;
  expect(cdu.focus.classe!.supplenze).toHaveLength(1);
  expect(item.dettaglioMaterie.map((m) => m.sigla).sort()).toEqual(['FISI', 'MATE']);
  expect(item.dettaglioMaterie).not.toContainEqual(expect.objectContaining({ docenti: expect.anything() }));
});

test('supplenze is [] when no delegation is active', () => {
  const cdu = composeContextBuilder(new FakeDatabase(tablesWith4B())).build(
    { target: '4B', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    recipe('CLASSE_COMPLETA')
  );
  expect(cdu.focus.classe!.supplenze).toEqual([]);
});

test('supplenze is populated in the DOCENTE_COMPLETO recipe too', () => {
  const cdu = composeContextBuilder(new FakeDatabase(tablesWith4B())).build(
    { target: '4B', tipoTarget: 'classe', now: duringSupplenza },
    recipe('DOCENTE_COMPLETO')
  );
  expect(cdu.focus.classe!.supplenze).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/swap-supplenti.test.ts --runInBand`
Expected: FAIL — `cdu.focus.classe!.supplenze` is `undefined` (property not yet set).

- [ ] **Step 3: Add the `buildSupplenzeAggregate` helper**

In `TeachingCouncilProjection.ts`:
- Extend the import from `./mappers/personVmMapper` (line 15) to also import `buildPersonVmFromDocente`.
- Add `import type { SupplenzaAggregataVM } from './Cdu';`
- After the `materiaVm` function (end of Task 2 refactor), add:

```ts
/**
 * Aggregates the class's active supplenze per (supplente, titolare) pair from
 * the raw teaching assignments (02 §4.1/§8.12). Always reflects the actual
 * delegations (`docenteEffettivo !== titolare`), independent of the routing
 * policy — so it is populated even under SOLO_TITOLARI where the council VM
 * hides the swap. Materie are deduped by `sigla + specifica` and sorted by
 * supplente, then titolare, nomeCompleto.
 */
export function buildSupplenzeAggregate(
  assignments: TeachingAssignment[],
  materie: IMateriaRepository,
  classe: Classe
): SupplenzaAggregataVM[] {
  const byPair = new Map<
    string,
    {
      supplente: Docente;
      titolare: Docente;
      slots: Array<{ materia: string; kind: string; specifica: string | null }>;
    }
  >();
  for (const assignment of assignments) {
    if (assignment.docenteEffettivo.id === null || assignment.titolare.id === null) continue;
    if (assignment.docenteEffettivo.id === assignment.titolare.id) continue;
    const key = `${assignment.docenteEffettivo.id}|${assignment.titolare.id}`;
    const pair = byPair.get(key) ?? {
      supplente: assignment.docenteEffettivo,
      titolare: assignment.titolare,
      slots: []
    };
    pair.slots.push({
      materia: assignment.slot.materia.value,
      kind: assignment.slot.kind,
      specifica: assignment.slot.specifica
    });
    byPair.set(key, pair);
  }
  const items = [...byPair.values()].map(({ supplente, titolare, slots }) => ({
    supplente: buildPersonVmFromDocente(supplente),
    titolare: buildPersonVmFromDocente(titolare),
    dettaglioMaterie: dedupeMaterie(
      slots
        .map((slot) => materiaVmFromSlot(materie, classe, slot))
        .filter((vm): vm is SubjectVM => vm !== null)
    )
  }));
  items.sort((a, b) => {
    const bySupplente = (a.supplente.nomeCompleto ?? '').localeCompare(b.supplente.nomeCompleto ?? '');
    return bySupplente !== 0
      ? bySupplente
      : (a.titolare.nomeCompleto ?? '').localeCompare(b.titolare.nomeCompleto ?? '');
  });
  return items;
}
```

Note: `Docente` and `TeachingAssignment` types are already imported in this file.

- [ ] **Step 4: Wire the provider**

In `ConsiglioClasseProvider.ts`:
- Change the constructor param `materie: IMateriaRepository` to `private readonly materie: IMateriaRepository`.
- Add `import { attachCouncilProjectionMetadata, buildSupplenzeAggregate, createTeachingCouncilProjection, prepareCouncilAssignments, resolveCouncilForProjection } from '../TeachingCouncilProjection';` (add `buildSupplenzeAggregate` to the existing import list).
- In `provide()`, right after `focusClasse.consiglioDiClasse = prepareCouncilAssignments(assignments) as never;` (line 43), add:

```ts
    focusClasse.supplenze = buildSupplenzeAggregate(assignments, this.materie, classe);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/swap-supplenti.test.ts test/unit/application/context-engine/consiglio-provider.test.ts --runInBand`
Expected: PASS (4 new + all existing).

---

### Task 4: `nonVerbalizzati` partition + tests

**Files:**
- Modify: `src/application/context-engine/providers/PianiPersClasseProvider.ts`
- Test: `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`

**Interfaces:**
- Consumes: Task 1 `nonVerbalizzati` type; existing `StatoDocumento` enum, `PianoPersonalizzatoItem`.
- Produces: `focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati` populated whenever `pianiPersClasse` runs.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`:

```ts
function buildPianiPers(rows: Row[]): Cdu {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(...rows);
  const db = new FakeDatabase(t);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const logDocs = new LogDocumentoRepository(db, new LazyRef(() => classi));
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('pianiPersClasse', new PianiPersClasseProvider(classi, logDocs, alunni));
  return b.build(
    { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    { providers: ['class', 'pianiPersClasse'], options: makeOptions() }
  );
}

test('PianiPersClasseProvider: nonVerbalizzati excludes VERBALIZZATO and exposes the elenco subtree', () => {
  const cdu = buildPianiPers([
    {
      ID: 'doc_pdp_a1',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/a1',
      CLASSI: '5A',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_pdp_verb',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP verbalizzato',
      STATO: 'VERBALIZZATO',
      NOTIFICATO: '',
      LINK: 'http://d/vp',
      CLASSI: '5A',
      UTENTI: 'a2@school.it',
      DATA_CREAZ: '2026-03-02'
    }
  ]);
  const nv = cdu.focus.classe!.didattica!.pianiPersonalizzati.nonVerbalizzati!;
  expect(nv.isPresenteLista).toBe(true);
  expect(nv.elenco).toEqual([
    { studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, tipoLabel: 'PDP (DSA)' }
  ]);
});

test('PianiPersClasseProvider: nonVerbalizzati.isPresenteLista is false when every item is VERBALIZZATO', () => {
  const cdu = buildPianiPers([
    {
      ID: 'doc_verb',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PEI',
      NOME: 'PEI verb',
      STATO: 'VERBALIZZATO',
      NOTIFICATO: '',
      LINK: 'http://d/v',
      CLASSI: '5A',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    }
  ]);
  const nv = cdu.focus.classe!.didattica!.pianiPersonalizzati.nonVerbalizzati!;
  expect(nv.isPresenteLista).toBe(false);
  expect(nv.elenco).toEqual([]);
});
```

Add the missing imports to the test file header: `import type { Cdu } from '../../../../src/application/context-engine/Cdu';`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts --runInBand`
Expected: FAIL — `nonVerbalizzati` is `undefined`.

- [ ] **Step 3: Implement the partition**

In `PianiPersClasseProvider.ts`:
- Change the enum import (line 8) to `import { StatoDocumento, TipoPiano } from '../../../domain/value-objects/enums';`
- After the `items` const (line 55), before the write block, add:

```ts
    const nonVerbalizzati = {
      isPresenteLista: items.some((item) => item.stato !== StatoDocumento.VERBALIZZATO),
      elenco: items
        .filter((item) => item.stato !== StatoDocumento.VERBALIZZATO)
        .map((item) => ({
          studente: {
            nomeCompleto: item.studente?.nomeCompleto ?? '',
            email: item.studente?.email ?? ''
          },
          tipoLabel: item.tipoLabel
        }))
    };
```

(`item.studente` is always set here — this provider tags every item — so the `?.`/`??` are type-safety only.)

- Replace the write block (lines 56-60) with:

```ts
    if (cdu.focus.classe.didattica === undefined) {
      cdu.focus.classe.didattica = { pianiPersonalizzati: { items, nonVerbalizzati } };
    } else {
      cdu.focus.classe.didattica.pianiPersonalizzati = { items, nonVerbalizzati };
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts --runInBand`
Expected: PASS (2 new + all existing).

- [ ] **Step 5: Add a recipe-level activation check**

Append to the same test file:

```ts
test('DOCENTE_COMPLETO recipe populates nonVerbalizzati alongside items', () => {
  const t = tablesWithClassePiani();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_verb_pdp',
    ID_GEN: 'PDP_BES',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI verb',
    STATO: 'VERBALIZZATO',
    NOTIFICATO: '',
    LINK: 'http://d/vp',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-03'
  });
  const db = new FakeDatabase(t);
  const cdu = composeContextBuilder(db).build(
    { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    recipe('DOCENTE_COMPLETO')
  );
  const nv = cdu.focus.classe!.didattica!.pianiPersonalizzati.nonVerbalizzati!;
  expect(nv.isPresenteLista).toBe(true);
  expect(nv.elenco).toHaveLength(2); // both GENERATO rows; the VERBALIZZATO one excluded
});
```

Add imports: `import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';` and `import { recipe } from '../../../../src/application/context-engine/Recipe';`

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts --runInBand`
Expected: PASS.

---

### Task 5: SPECS_ALDO documentation

**Files:**
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md`
- Modify: `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md`

- [ ] **Step 1: Document `focus.classe.supplenze` in §4.1**

In `02_CDU_STRUTTURA.md`, after the `consiglioDiClasseComune`/`consiglioDiClasseSeparato` block (lines 236-241), insert:

```yaml
  # SUPPLENZE ATTIVE DI CLASSE (aggregate per coppia supplente/titolare — §8.12)
  # Sempre presente quando il provider `consiglio` gira; [] se nessuna supplenza attiva.
  # Riflette le delegazioni reali (docenteEffettivo != titolare) anche con
  # gestioneSupplenti = SOLO_TITOLARI, dove consiglioDiClasse[].stato.isSupplente resta false.
  supplenze: SupplenzaAggregataVM[]
```

- [ ] **Step 2: Document `nonVerbalizzati` in §4.1**

In the `didattica.pianiPersonalizzati` block (lines 331-334), extend to:

```yaml
  didattica:
    pianiPersonalizzati:
      items: PianoPersonalizzatoItem[]   # §8.11 — ogni item porta `studente: {nomeCompleto, email}`
      nonVerbalizzati:                   # Partizione precalcolata (Principio 3): stato != VERBALIZZATO.
                                         #   Vietato filtrare su `stato` nei template (where:'stato',...).
        isPresenteLista: boolean         # true sse elenco non vuoto (per {{#isPresenteLista}}/{{^}})
        elenco:
          - studente: { nomeCompleto: string, email: string }  # stesso shape di PianoPersonalizzatoItem.studente
            tipoLabel: string            # es. "PDP (DSA)" — da tipoPianoLabel()
      storico: LazyRef<DocumentoStoricoConTipo[]>  # opzionale, solo se opzioni.includiStorico = true
```

- [ ] **Step 3: Add §8.12 `SupplenzaAggregataVM`**

After §8.11 (line 868), insert:

```markdown
### 8.12 Supplenza aggregata di classe (`SupplenzaAggregataVM`)

Riga di `focus.classe.supplenze[]` (§4.1), costruita da `ConsiglioClasseProvider`
sugli stessi `TeachingAssignment[]` del consiglio di classe: un item per coppia
(supplente, titolare), con le materie coperte combinate e deduplicate per
`sigla + specifica`. Sempre popolata (anche con `gestioneSupplenti =
SOLO_TITOLARI`): riflette le delegazioni reali, non il routing email.

```yaml
SupplenzaAggregataVM:
  supplente: PersonVM            # §8.1 — docente effettivamente attivo (docenteEffettivo)
  titolare: PersonVM             # §8.1 — titolare sostituito (assignment.titolare)
  dettaglioMaterie: SubjectVM[]  # §8.2 — materie coperte; forma BASE (niente docenti/continuita)
```

> In una catena di supplenze A→B→C il supplente è C (ultimo effettivo); gli
> intermedi sono omessi. L'ordinamento è per `supplente.nomeCompleto`, poi
> `titolare.nomeCompleto`.
```

- [ ] **Step 4: Add catalog + conditions entries (§9)**

In §9.2 table (line 904), add rows:

```markdown
| Supplenze attive della classe | `{{#bullet_list:focus.classe.supplenze}}{{supplente.appellativoCompleto}} sostituisce {{titolare.appellativoCompleto}} ({{#dettaglioMaterie}}{{nomeSintetico}}{{^isNotLast}}, {{/isNotLast}}{{/dettaglioMaterie}}){{/bullet_list}}` |
| Piani non verbalizzati | `{{#bullet_list:focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati.elenco}}{{studente.nomeCompleto}} — {{tipoLabel}}{{/bullet_list}}` |
```

In §9.4 table (line 920), add rows:

```markdown
| La classe ha supplenze attive | `{{#focus.classe.supplenze}} ... {{/focus.classe.supplenze}}` (sezione Mustache su array; guardare anche `{{^}}`) |
| Ci sono piani non verbalizzati | `{{#focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati.isPresenteLista}} ... {{/focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati.isPresenteLista}}` |
```

- [ ] **Step 5: Update §10 example JSON**

In the example JSON, after the `"consiglioDiClasseSeparato": []` line (line 1131), insert:

```json
      "supplenze": [
        {
          "supplente": {
            "nome": "LUCIA",
            "cognome": "BIANCHI",
            "email": "bianchi@scuola.edu.it",
            "genere": "F",
            "appellativo": "Prof.ssa",
            "articolo": "la",
            "coordinatore": "coordinatrice",
            "nomeCompleto": "LUCIA BIANCHI",
            "materia": null,
            "appellativoCompleto": "Prof.ssa LUCIA BIANCHI",
            "appellativoCognome": "Prof.ssa BIANCHI"
          },
          "titolare": {
            "nome": "MARIO",
            "cognome": "ROSSI",
            "email": "rossi@scuola.edu.it",
            "genere": "M",
            "appellativo": "Prof.",
            "articolo": "il",
            "coordinatore": "coordinatore",
            "nomeCompleto": "MARIO ROSSI",
            "materia": null,
            "appellativoCompleto": "Prof. MARIO ROSSI",
            "appellativoCognome": "Prof. ROSSI"
          },
          "dettaglioMaterie": [
            { "sigla": "MATE", "nome": "Matematica", "nomeSintetico": "Matematica" }
          ]
        }
      ],
```

And in the `didattica.pianiPersonalizzati` node (line 1391), replace `{ "items": [] }` with:

```json
        "pianiPersonalizzati": {
          "items": [],
          "nonVerbalizzati": { "isPresenteLista": false, "elenco": [] }
        },
```

- [ ] **Step 6: Add §11 validation rule**

Append to §11 (after rule 9, line 1436):

```markdown
10. **Partizioni precalcolate di stato.** `focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati` è l'UNICA via per accedere ai piani non verbalizzati: i template NON usano `where`/`filter` su `stato` (violazione di Principio 3). `focus.classe.supplenze` espone le supplenze come `PersonVM` (§8.1) con `dettaglioMaterie` in forma `SubjectVM` base (§8.2) — nessuna stringa anagrafica grezza né proiezione materia ad hoc.
```

- [ ] **Step 7: Update `GUIDA_USO_PLACEHOLDER.md`**

In §4.4 (loop strutturali, after line 189's bullet_list example), add:

```markdown
**Elenco puntato delle supplenze attive:**
```mustache
{{#bullet_list:focus.classe.supplenze}}
{{supplente.appellativoCompleto}} sostituisce {{titolare.appellativoCompleto}} ({{#dettaglioMaterie}}{{nomeSintetico}}{{#flags.isNotLast}}, {{/flags.isNotLast}}{{/dettaglioMaterie}})
{{/bullet_list}}
```

**Elenco puntato dei piani non verbalizzati:**
```mustache
{{#bullet_list:focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati.elenco}}
{{studente.nomeCompleto}} — {{tipoLabel}}
{{/bullet_list}}
```
```

In §7.1 (regole di progettazione, after line 352's example), append a bullet:

```markdown
   - La partizione `pianiPersonalizzati.nonVerbalizzati` (stato ≠ verbalizzato) è precalcolata nel CDU: i template non devono filtrare su `stato`.
```

- [ ] **Step 8: Verify docs consistency**

Read the edited sections of both files and confirm the YAML/JSON/markdown blocks are well-formed and reference only existing paths.

---

### Task 6: Full verification

**Files:**
- None (verification + optional commit)

- [ ] **Step 1: Typecheck + lint**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS (no restricted globals, no unused imports).

- [ ] **Step 2: Unit + integration + build suites**

Run: `npm test`
Expected: PASS.

Run: `npm run test:integration`
Expected: PASS.

Run: `npm run test:build`
Expected: PASS.

- [ ] **Step 3: Optional commit (only if the user authorizes)**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/TeachingCouncilProjection.ts src/application/context-engine/providers/ConsiglioClasseProvider.ts src/application/context-engine/providers/PianiPersClasseProvider.ts test/unit/application/context-engine/swap-supplenti.test.ts test/unit/application/context-engine/piani-pers-classe-provider.test.ts SPECS_ALDO/02_CDU_STRUTTURA.md SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md
git commit -m "feat(cdu): add focus.classe.supplenze and pianiPersonalizzati.nonVerbalizzati"
```
