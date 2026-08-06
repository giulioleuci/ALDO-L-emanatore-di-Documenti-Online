# CDU WorkspaceTemplateEngine-Oriented Restructuring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure ALDO's CDU (Contesto Dati Unificato) so `WorkspaceTemplateEngine` is its primary consumer — replacing dynamic-key maps with arrays, standardizing person/subject shapes, precomputing labels and semantic partitions — per `PROMPT_MODIFY_CDU.md` and the target spec `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md`.

**Architecture:** Two new shared View-Model builders (`PersonVM`, `SubjectVM`) become the single source of truth for person/subject shapes across every provider. Existing `context-engine/providers/*` are updated in place to consume them; four genuinely new providers (`MaterieClasseProvider`, `EsameProvider`, `ProgettiProvider`, `PartnerProjectionProvider`) are added and registered in `ContextEngineFactory`/`Recipe.ts`. `Cdu.ts` types are edited incrementally, task by task, alongside the provider that owns each section — never as one big-bang rewrite. No backward compatibility: old shapes (`perIndirizzo`, `curriculum` as map, `ReligioneScelta.SI`) are deleted outright.

**Tech Stack:** TypeScript (GAS V8 target, Babel-transpiled), Jest (`ts-jest`), GasLibraryFactory `ContextEngine`/`CollectionProjector` (already in use, unaffected), no new external dependencies.

## Global Constraints

- **GAS V8 only** — synchronous code, no Node/browser-only APIs (`CLAUDE.md`).
- **No native GAS globals outside `GoogleApiWrapper`** — irrelevant here (context-engine is pure domain/application code, no native calls).
- **No backward compatibility** — delete old fields/paths outright; do not add fallback branches (PROMPT_MODIFY_CDU.md directive 2).
- **GasLibraryFactory-first checked and cleared**: `GasLibraryFactory/DOCS_LIBS` has no person-declension or MATERIE.EVOLUZIONE-resolution utilities (`RoleResolutionLib.md` covers only SUPPLENZE/VARIAZIONI_CATTEDRA role routing, not subject/person shaping) — `PersonVM`/`SubjectVM` builders are legitimately ALDO-domain-specific (CLAUDE.md's stated carve-out) and belong in `src/application/context-engine/mappers/`, not in the library.
- **Existing reuse points confirmed — do not rebuild these:**
  - `enums.ts:80-82` `appellativo(genere: Genere): string` — reuse inside `PersonVM`, do not reimplement.
  - `Docente.getAppellativo()` / `Docente.cognome`/`Docente.nome`/`Docente.genere` (`Docente.ts:47-49,20-22`) — the source fields for `PersonVM`.
  - `ConsiglioClasseProvider.ts:47-57` already builds `consiglioDiClasseComune`/`consiglioDiClasseSeparato` correctly — only `materieSigle` needs adding, do not rebuild the partition logic.
  - `EsameConfig.isPrimaProvaPerIndirizzo`/`isSecondaProvaPerIndirizzo` (`EsameConfig.ts:24-30`) — reuse for `EsameProvider`, do not re-parse `MATERIE.ESAME_CFG` JSON again.
  - `Materia.getEvoluzione()` (`Materia.ts:64-72`) — reuse for `SubjectVM.evoluzione`, do not re-parse `MATERIE.EVOLUZIONE` JSON again.
  - `SheetMaterieConPermessiGeneratorStrategy.buildGroups()` (`SheetMaterieConPermessiGeneratorStrategy.ts:50-76`) already produces the `group1/group2/group3` shape — only expose it onto the CDU node, do not rebuild grouping.
- **Confirmed non-existent (genuinely new work, not refactors):** `PersonVM`, `SubjectVM`, `esame`, `progetti`/`ProgettoVM`, `focus.classe.storico`/class-level history, `focus.classe.partner` disaggregated projection, `focus.classe.materie[]` flat catalog, any `tipoLabel`/`religioneLabel` mapper, `coordinatoriMetadata`/`tutorMetadata` (never existed — nothing to remove there despite the prompt's phrasing).
- **Person name order:** `PersonVM.nomeCompleto` MUST be `"${nome} ${cognome}"` (Nome Cognome — e.g. `"Mario Rossi"`, matching every example in the target spec). This is the OPPOSITE order from the existing `Docente.getNomeCompleto()` (`Docente.ts:52-54`, which returns `"${cognome} ${nome}"` = Cognome Nome). Do not reuse `getNomeCompleto()` for `PersonVM.nomeCompleto` — build it directly from `nome`/`cognome`.
- **`MATERIE` has no `SIGLA`/`PRINCIPALE`/`SPECIFICA` columns** (`schema.ts:153-163`, `MATERIE.csv` header) — `SubjectVM.sigla` is `Materia.id` itself; `principale`/`specificita` for composite specificità rows are derived via `IMateriaRepository.findSpecifiche` (id pattern `BASE.SPECIFICA`), not separate columns.
- **Provider order is recipe-declared and load-bearing** (`Recipe.ts:76-105` dependency table) — `school` always runs before `class` in every recipe; every new provider task below states its required position explicitly.

---

## PHASE 0 — Foundational shared builders

### Task 1: `PersonVM` builder

**Files:**
- Create: `src/application/context-engine/mappers/personVmMapper.ts`
- Test: `test/unit/application/context-engine/mappers/person-vm-mapper.test.ts`

**Interfaces:**
- Consumes: `Docente` (`nome: string`, `cognome: string`, `genere: Genere`, `id: string | null`, `getAppellativo(): string`), `Genere`/`appellativo()` from `../../../domain/value-objects/enums`.
- Produces:
  ```typescript
  export interface PersonVM {
    nome: string;
    cognome: string | null;
    email: string | null;
    genere: 'M' | 'F' | null;
    appellativo: string | null;
    articolo: string | null;
    coordinatore: string | null;
    nomeCompleto: string;
    materia: string | null;
    appellativoCompleto: string;
    appellativoCognome: string;
  }
  export interface PersonVmInput {
    nome: string;
    cognome: string | null;
    email: string | null;
    genere: 'M' | 'F' | null;
    materia?: string | null;
  }
  export function buildPersonVm(input: PersonVmInput): PersonVM;
  export function buildPersonVmFromDocente(docente: Docente, materia?: string | null): PersonVM;
  ```
  Later tasks (2 onward) import `buildPersonVm`/`buildPersonVmFromDocente` from this file.

- [ ] **Step 1: Write the failing test — internal (docente) person**

```typescript
// test/unit/application/context-engine/mappers/person-vm-mapper.test.ts
import { buildPersonVm, buildPersonVmFromDocente } from '../../../../../src/application/context-engine/mappers/personVmMapper';
import { Docente } from '../../../../../src/domain/entities/Docente';
import { Email } from '../../../../../src/domain/value-objects/Email';
import { Genere } from '../../../../../src/domain/value-objects/enums';

describe('personVmMapper', () => {
  it('builds a complete PersonVM for a male internal docente', () => {
    const docente = Docente.create(Email.of('mario.rossi@scuola.edu.it'), 'Rossi', 'Mario', Genere.M);
    const vm = buildPersonVmFromDocente(docente);
    expect(vm).toEqual({
      nome: 'Mario',
      cognome: 'Rossi',
      email: 'mario.rossi@scuola.edu.it',
      genere: 'M',
      appellativo: 'Prof.',
      articolo: 'il',
      coordinatore: 'coordinatore',
      nomeCompleto: 'Mario Rossi',
      materia: null,
      appellativoCompleto: 'Prof. Mario Rossi',
      appellativoCognome: 'Prof. Rossi'
    });
  });

  it('builds a complete PersonVM for a female internal docente with a materia tag', () => {
    const docente = Docente.create(Email.of('laura.gialli@scuola.edu.it'), 'Gialli', 'Laura', Genere.F);
    const vm = buildPersonVmFromDocente(docente, 'Greco');
    expect(vm.genere).toBe('F');
    expect(vm.appellativo).toBe('Prof.ssa');
    expect(vm.articolo).toBe('la');
    expect(vm.coordinatore).toBe('coordinatrice');
    expect(vm.nomeCompleto).toBe('Laura Gialli');
    expect(vm.materia).toBe('Greco');
    expect(vm.appellativoCompleto).toBe('Prof.ssa Laura Gialli');
    expect(vm.appellativoCognome).toBe('Prof.ssa Gialli');
  });

  it('degrades gracefully for an external expert (no cognome, no genere)', () => {
    const vm = buildPersonVm({ nome: 'Studio Legale Bianchi', cognome: null, email: null, genere: null });
    expect(vm).toEqual({
      nome: 'Studio Legale Bianchi',
      cognome: null,
      email: null,
      genere: null,
      appellativo: null,
      articolo: null,
      coordinatore: null,
      nomeCompleto: 'Studio Legale Bianchi',
      materia: null,
      appellativoCompleto: 'Studio Legale Bianchi',
      appellativoCognome: 'Studio Legale Bianchi'
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/person-vm-mapper.test.ts`
Expected: FAIL — `Cannot find module '.../mappers/personVmMapper'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/application/context-engine/mappers/personVmMapper.ts
import type { Docente } from '../../../domain/entities/Docente';
import { Genere, appellativo as appellativoDiGenere } from '../../../domain/value-objects/enums';

export interface PersonVM {
  nome: string;
  cognome: string | null;
  email: string | null;
  genere: 'M' | 'F' | null;
  appellativo: string | null;
  articolo: string | null;
  coordinatore: string | null;
  nomeCompleto: string;
  materia: string | null;
  appellativoCompleto: string;
  appellativoCognome: string;
}

export interface PersonVmInput {
  nome: string;
  cognome: string | null;
  email: string | null;
  genere: 'M' | 'F' | null;
  materia?: string | null;
}

/**
 * Builds the standardized PersonVM (02 §8.1). External experts (genere null)
 * collapse appellativo/articolo/coordinatore/appellativoCompleto/appellativoCognome
 * to null/nomeCompleto per the target spec.
 */
export function buildPersonVm(input: PersonVmInput): PersonVM {
  const { nome, cognome, email, genere } = input;
  const materia = input.materia ?? null;
  const nomeCompleto = cognome === null ? nome : `${nome} ${cognome}`.trim();

  if (genere === null) {
    return {
      nome,
      cognome,
      email,
      genere: null,
      appellativo: null,
      articolo: null,
      coordinatore: null,
      nomeCompleto,
      materia,
      appellativoCompleto: nomeCompleto,
      appellativoCognome: nomeCompleto
    };
  }

  const appellativo = appellativoDiGenere(genere as Genere);
  const articolo = genere === Genere.M ? 'il' : 'la';
  const coordinatore = genere === Genere.M ? 'coordinatore' : 'coordinatrice';
  const appellativoCompleto = `${appellativo} ${nomeCompleto}`;
  const appellativoCognome = cognome === null ? nomeCompleto : `${appellativo} ${cognome}`;

  return {
    nome,
    cognome,
    email,
    genere,
    appellativo,
    articolo,
    coordinatore,
    nomeCompleto,
    materia,
    appellativoCompleto,
    appellativoCognome
  };
}

export function buildPersonVmFromDocente(docente: Docente, materia: string | null = null): PersonVM {
  return buildPersonVm({
    nome: docente.nome,
    cognome: docente.cognome,
    email: docente.id,
    genere: docente.genere,
    materia
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/person-vm-mapper.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/application/context-engine/mappers/personVmMapper.ts test/unit/application/context-engine/mappers/person-vm-mapper.test.ts
git commit -m "feat: add shared PersonVM builder for CDU restructuring"
```

---

### Task 2: `SubjectVM` builder (materia resolver)

**Files:**
- Create: `src/application/context-engine/mappers/subjectVmMapper.ts`
- Test: `test/unit/application/context-engine/mappers/subject-vm-mapper.test.ts`

**Interfaces:**
- Consumes: `Materia` (`id`, `nome`, `sintesi`, `colore1`, `colore2`, `esameConfig: EsameConfig | null`, `getEvoluzione(): Record<string, number[]>`), `IndirizzoId`, `PersonVM`/`buildPersonVmFromDocente` (Task 1).
- Produces:
  ```typescript
  export interface SubjectVmEvoluzione {
    siglePrecedenti: Array<{ sigla: string; nome: string | null; anni: number[] }>;
  }
  export interface SubjectVM {
    sigla: string;
    nome: string;
    nomeSintetico: string;
    colore1: string;
    colore2: string;
    isMateriaPrimaProva: boolean;
    isMateriaSecondaProva: boolean;
    principale: string | null;
    specificita: string | null;
    isITP: boolean;
    hasItp?: boolean;
    evoluzione: SubjectVmEvoluzione | null;
    docenti?: PersonVM[];
    docentiDescrizione?: string;
  }
  export function buildSubjectVm(materia: Materia, opts?: { indirizzo?: IndirizzoId; isITP?: boolean; principale?: string | null; specificita?: string | null }): SubjectVM;
  export function docentiDescrizione(docenti: PersonVM[]): string;
  ```
  This is the single place `MATERIE.EVOLUZIONE`/`ESAME_CFG` get resolved into a printable shape; every provider building a materia object (Tasks 5, 8, 14, 15) imports from here.

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/application/context-engine/mappers/subject-vm-mapper.test.ts
import { buildSubjectVm, docentiDescrizione } from '../../../../../src/application/context-engine/mappers/subjectVmMapper';
import { buildPersonVm } from '../../../../../src/application/context-engine/mappers/personVmMapper';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { IndirizzoId } from '../../../../../src/domain/value-objects/IndirizzoId';
import { COL_MATERIE } from '../../../../../src/config/schema';

describe('subjectVmMapper', () => {
  it('resolves sigla/nome/colori/prova/evoluzione from a Materia entity', () => {
    const materia = Materia.fromData({
      [COL_MATERIE.ID]: 'ITA',
      [COL_MATERIE.NOME]: 'Lingua e letteratura italiana',
      [COL_MATERIE.SINTESI]: 'Italiano',
      [COL_MATERIE.COLORE_1]: '#005A9C',
      [COL_MATERIE.COLORE_2]: '#E6F0FA',
      [COL_MATERIE.ESAME_CFG]: JSON.stringify({ prima_prova: ['LC'], seconda_prova: [] }),
      [COL_MATERIE.EVOLUZIONE]: JSON.stringify({ GST: [1, 2] })
    });
    const vm = buildSubjectVm(materia, { indirizzo: IndirizzoId.of('LC') });
    expect(vm.sigla).toBe('ITA');
    expect(vm.nome).toBe('Lingua e letteratura italiana');
    expect(vm.nomeSintetico).toBe('Italiano');
    expect(vm.colore1).toBe('#005A9C');
    expect(vm.colore2).toBe('#E6F0FA');
    expect(vm.isMateriaPrimaProva).toBe(true);
    expect(vm.isMateriaSecondaProva).toBe(false);
    expect(vm.principale).toBeNull();
    expect(vm.specificita).toBeNull();
    expect(vm.evoluzione).toEqual({ siglePrecedenti: [{ sigla: 'GST', nome: null, anni: [1, 2] }] });
  });

  it('defaults isMateriaPrimaProva/SecondaProva to false when ESAME_CFG is absent, and evoluzione to null when empty', () => {
    const materia = Materia.fromData({ [COL_MATERIE.ID]: 'STO', [COL_MATERIE.NOME]: 'Storia', [COL_MATERIE.SINTESI]: 'Storia' });
    const vm = buildSubjectVm(materia, { indirizzo: IndirizzoId.of('LC') });
    expect(vm.isMateriaPrimaProva).toBe(false);
    expect(vm.isMateriaSecondaProva).toBe(false);
    expect(vm.evoluzione).toBeNull();
  });

  it('joins docenti nomeCompleto for docentiDescrizione', () => {
    const p1 = buildPersonVm({ nome: 'Mario', cognome: 'Rossi', email: 'm@x.it', genere: 'M' });
    const p2 = buildPersonVm({ nome: 'Laura', cognome: 'Gialli', email: 'l@x.it', genere: 'F' });
    expect(docentiDescrizione([p1, p2])).toBe('Mario Rossi, Laura Gialli');
    expect(docentiDescrizione([])).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/subject-vm-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/application/context-engine/mappers/subjectVmMapper.ts
import type { Materia } from '../../../domain/entities/Materia';
import type { IndirizzoId } from '../../../domain/value-objects/IndirizzoId';
import type { PersonVM } from './personVmMapper';

export interface SubjectVmEvoluzione {
  siglePrecedenti: Array<{ sigla: string; nome: string | null; anni: number[] }>;
}

export interface SubjectVM {
  sigla: string;
  nome: string;
  nomeSintetico: string;
  colore1: string;
  colore2: string;
  isMateriaPrimaProva: boolean;
  isMateriaSecondaProva: boolean;
  principale: string | null;
  specificita: string | null;
  isITP: boolean;
  hasItp?: boolean;
  evoluzione: SubjectVmEvoluzione | null;
  docenti?: PersonVM[];
  docentiDescrizione?: string;
}

export interface BuildSubjectVmOptions {
  indirizzo?: IndirizzoId;
  isITP?: boolean;
  principale?: string | null;
  specificita?: string | null;
}

/** Builds a standardized SubjectVM (02 §8.2) from a Materia entity. */
export function buildSubjectVm(materia: Materia, opts: BuildSubjectVmOptions = {}): SubjectVM {
  const config = materia.esameConfig;
  const indirizzo = opts.indirizzo;
  const isMateriaPrimaProva =
    config !== null && indirizzo !== undefined && config.isPrimaProvaPerIndirizzo(indirizzo);
  const isMateriaSecondaProva =
    config !== null && indirizzo !== undefined && config.isSecondaProvaPerIndirizzo(indirizzo);

  const evoluzioneRaw = materia.getEvoluzione();
  const siglePrecedenti = Object.entries(evoluzioneRaw).map(([sigla, anni]) => ({
    sigla,
    nome: null,
    anni
  }));

  return {
    sigla: materia.id ?? '',
    nome: materia.nome,
    nomeSintetico: materia.sintesi,
    colore1: materia.colore1,
    colore2: materia.colore2,
    isMateriaPrimaProva,
    isMateriaSecondaProva,
    principale: opts.principale ?? null,
    specificita: opts.specificita ?? null,
    isITP: opts.isITP ?? false,
    evoluzione: siglePrecedenti.length > 0 ? { siglePrecedenti } : null
  };
}

/** ✎ Precomputed "Mario Rossi, Laura Gialli" join (02 §8.2, principle P4). */
export function docentiDescrizione(docenti: PersonVM[]): string {
  return docenti.map((d) => d.nomeCompleto).join(', ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/subject-vm-mapper.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/application/context-engine/mappers/subjectVmMapper.ts test/unit/application/context-engine/mappers/subject-vm-mapper.test.ts
git commit -m "feat: add shared SubjectVM builder for CDU restructuring"
```

---

### Task 3: Label maps + `ReligioneScelta` enum migration (`SI`→`IRC`)

**Files:**
- Create: `src/application/context-engine/mappers/labels.ts`
- Modify: `src/domain/value-objects/enums.ts:37-41`
- Modify: `src/domain/entities/Alunno.ts:33`
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts:41`
- Modify: `test/fixtures/tables.ts` (any `RELIGIONE: 'SI'` seed rows)
- Modify: `FAKEDB/ALUNNI.csv` (`RELIGIONE` column values `SI`→`IRC`)
- Modify: `test/unit/application/context-engine/providers/alunno-provider.test.ts:56` (`religione: 'SI'` → `'IRC'`)
- Test: `test/unit/application/context-engine/mappers/labels.test.ts`
- Test: `test/unit/domain/value-objects/enums.test.ts` (extend if it exists; otherwise create)

**Interfaces:**
- Produces:
  ```typescript
  export const TIPO_PIANO_LABELS: Record<TipoPiano, string>; // { PDP_DSA: 'PDP DSA', PDP_BES: 'PDP BES', PDP_STRANIERI: 'PDP Stranieri', PEI: 'PEI', PFP: 'PFP' }
  export function tipoPianoLabel(tipo: TipoPiano): string;
  export const RELIGIONE_LABELS: Record<ReligioneScelta, string>; // { IRC: 'Religione cattolica', ALT: 'Attività alternativa', NO: 'Non si avvale' }
  export function religioneLabel(religione: ReligioneScelta): string;
  export const TIPO_PROGETTO_LABELS: Record<TipoProgetto, string>; // { ASL: 'PCTO/ASL', ORIENTAMENTO: 'Orientamento', ALTRO: 'Altro' }
  export function tipoProgettoLabel(tipo: TipoProgetto): string;
  ```
  Tasks 11 (`StudentVM`), 13 (`focus.alunno`/`StudentStoricoVM`), and 16 (`ProgettiProvider`) import these.

- [ ] **Step 1: Write the failing test for labels**

```typescript
// test/unit/application/context-engine/mappers/labels.test.ts
import { tipoPianoLabel, religioneLabel, tipoProgettoLabel } from '../../../../../src/application/context-engine/mappers/labels';
import { TipoPiano, ReligioneScelta, TipoProgetto } from '../../../../../src/domain/value-objects/enums';

describe('labels', () => {
  it('maps every TipoPiano to a readable label', () => {
    expect(tipoPianoLabel(TipoPiano.PDP_DSA)).toBe('PDP DSA');
    expect(tipoPianoLabel(TipoPiano.PEI)).toBe('PEI');
    expect(tipoPianoLabel(TipoPiano.PFP)).toBe('PFP');
  });

  it('maps every ReligioneScelta to a readable label', () => {
    expect(religioneLabel(ReligioneScelta.IRC)).toBe('Religione cattolica');
    expect(religioneLabel(ReligioneScelta.ALT)).toBe('Attività alternativa');
    expect(religioneLabel(ReligioneScelta.NO)).toBe('Non si avvale');
  });

  it('maps every TipoProgetto to a readable label', () => {
    expect(tipoProgettoLabel(TipoProgetto.ASL)).toBe('PCTO/ASL');
    expect(tipoProgettoLabel(TipoProgetto.ORIENTAMENTO)).toBe('Orientamento');
    expect(tipoProgettoLabel(TipoProgetto.ALTRO)).toBe('Altro');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/labels.test.ts`
Expected: FAIL — `ReligioneScelta.IRC` doesn't exist yet, module not found.

- [ ] **Step 3: Migrate the `ReligioneScelta` enum**

In `src/domain/value-objects/enums.ts:37-41`, replace:

```typescript
export enum ReligioneScelta {
  SI = 'SI',
  NO = 'NO',
  ALT = 'ALT'
}
```

with:

```typescript
export enum ReligioneScelta {
  IRC = 'IRC',
  ALT = 'ALT',
  NO = 'NO'
}
```

In `src/domain/entities/Alunno.ts:33`, change the default:

```typescript
this.religione = (data[COL_ALUNNI.RELIGIONE] as ReligioneScelta) ?? ReligioneScelta.IRC;
```

In `src/application/context-engine/TeachingCouncilProjection.ts:41`, the CDC student-filter expression string-matches raw `"SI"`/`"ALT"` literals (not the enum), so it must be updated in lockstep:

```typescript
export const studentCouncilFilterOperations: CollectionProjectionOperation[] = [
  {
    type: 'filter',
    expression:
      '(slot.materia != "IRC" && slot.materia != "ALT") || (slot.materia == "IRC" && studentReligion == "IRC") || (slot.materia == "ALT" && studentReligion == "ALT")'
  },
  ...
```

(Note: `slot.materia == "IRC"` was already `"IRC"` before this change — only `studentReligion == "SI"` becomes `studentReligion == "IRC"`.)

- [ ] **Step 4: Write the labels implementation**

```typescript
// src/application/context-engine/mappers/labels.ts
import { TipoPiano, ReligioneScelta, TipoProgetto } from '../../../domain/value-objects/enums';

export const TIPO_PIANO_LABELS: Record<TipoPiano, string> = {
  [TipoPiano.PDP_DSA]: 'PDP DSA',
  [TipoPiano.PDP_BES]: 'PDP BES',
  [TipoPiano.PDP_STRANIERI]: 'PDP Stranieri',
  [TipoPiano.PEI]: 'PEI',
  [TipoPiano.PFP]: 'PFP'
};

export function tipoPianoLabel(tipo: TipoPiano): string {
  return TIPO_PIANO_LABELS[tipo];
}

export const RELIGIONE_LABELS: Record<ReligioneScelta, string> = {
  [ReligioneScelta.IRC]: 'Religione cattolica',
  [ReligioneScelta.ALT]: 'Attività alternativa',
  [ReligioneScelta.NO]: 'Non si avvale'
};

export function religioneLabel(religione: ReligioneScelta): string {
  return RELIGIONE_LABELS[religione];
}

export const TIPO_PROGETTO_LABELS: Record<TipoProgetto, string> = {
  [TipoProgetto.ASL]: 'PCTO/ASL',
  [TipoProgetto.ORIENTAMENTO]: 'Orientamento',
  [TipoProgetto.ALTRO]: 'Altro'
};

export function tipoProgettoLabel(tipo: TipoProgetto): string {
  return TIPO_PROGETTO_LABELS[tipo];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/labels.test.ts`
Expected: PASS (3/3)

- [ ] **Step 6: Fix every broken `ReligioneScelta.SI` reference**

Run: `grep -rln "ReligioneScelta.SI\|'RELIGIONE': 'SI'\|RELIGIONE,SI\|religione: 'SI'" src test test/fixtures FAKEDB` and replace each with `ReligioneScelta.IRC` / `'IRC'` respectively. Confirmed sites to check explicitly: `E2eSampleDatabaseBuilder.ts` (multiple `ReligioneScelta.NO/ALT/SI` seed calls), `test/unit/application/context-engine/providers/alunno-provider.test.ts:56`, `FAKEDB/ALUNNI.csv` (`RELIGIONE` column, row with value `SI`), `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md` (documentation, update the enum listing).

- [ ] **Step 7: Run the full unit suite to catch any remaining break**

Run: `npm test`
Expected: Only pre-existing failures from providers not yet updated by later tasks (e.g. `studenti-provider.test.ts`'s `perIndirizzo` assertions, `consiglio-provider.test.ts` missing `appellativoCompleto`) — no failures caused by `ReligioneScelta.SI` being undefined. If any `TypeError: Cannot read property 'SI'` remains, grep again and fix.

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/mappers/labels.ts src/domain/value-objects/enums.ts src/domain/entities/Alunno.ts src/application/context-engine/TeachingCouncilProjection.ts test/fixtures/tables.ts FAKEDB/ALUNNI.csv test/unit/application/context-engine/providers/alunno-provider.test.ts test/unit/application/context-engine/mappers/labels.test.ts SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md
git commit -m "feat: migrate ReligioneScelta SI to IRC and add CDU label maps"
```

---

## PHASE 1 — `istituto` and class self-containment

### Task 4: `SchoolProvider` — `PersonVM` staff + object `dirigente`

**Files:**
- Modify: `src/application/context-engine/providers/SchoolProvider.ts` (full file, 44 lines)
- Modify: `src/application/context-engine/Cdu.ts:111-115` (`CduIstituto`)
- Test: `test/unit/application/context-engine/providers/school-provider.test.ts` (extend or create)

**Interfaces:**
- Consumes: `PersonVM`/`buildPersonVmFromDocente` (Task 1).
- Produces (new `CduIstituto` shape read by Task 5):
  ```typescript
  export interface CduIstituto {
    organizzazione: { annoScolastico: string; dirigente: { nomeCompleto: string } };
    staff: { referenteBes: PersonVM | null; animatoreDigitale: PersonVM | null };
    statistiche?: { totaleClassi: number; totaleDocenti: number; totaleAlunni: number };
  }
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/application/context-engine/providers/school-provider.test.ts
import { SchoolProvider } from '../../../../../src/application/context-engine/providers/SchoolProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';

function makeCdu(): Cdu {
  return { meta: {} as never, focus: {}, tech: {} as never };
}

describe('SchoolProvider', () => {
  it('builds istituto.organizzazione.dirigente as an object and staff as PersonVM', () => {
    const master = { findConfigAnnoCorrente: () => ({ annoScolasticoRaw: '2025-2026', dirigente: 'Prof.ssa Maria Bianchi' }) };
    const ruoli = {
      findAllCached: () => [
        { id: 'REF_BES', getEmails: () => [{ value: 'mario.rossi@scuola.edu.it' }] },
        { id: 'AN_DIG', getEmails: () => [] }
      ]
    };
    const docenti = {
      findById: (email: string) =>
        email === 'mario.rossi@scuola.edu.it'
          ? { nome: 'Mario', cognome: 'Rossi', genere: 'M', id: email }
          : null
    };
    const provider = new SchoolProvider(master as never, ruoli as never, docenti as never);
    const cdu = makeCdu();
    provider.provide(cdu);
    expect(cdu.istituto?.organizzazione).toEqual({
      annoScolastico: '2025-2026',
      dirigente: { nomeCompleto: 'Prof.ssa Maria Bianchi' }
    });
    expect(cdu.istituto?.staff.referenteBes?.appellativoCompleto).toBe('Prof. Mario Rossi');
    expect(cdu.istituto?.staff.animatoreDigitale).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/school-provider.test.ts`
Expected: FAIL — `dirigente` is currently a raw string, `staff.referenteBes` is currently `''` not an object/null.

- [ ] **Step 3: Update `CduIstituto` in `Cdu.ts:111-115`**

```typescript
export interface CduIstituto {
  organizzazione: { annoScolastico: string; dirigente: { nomeCompleto: string } };
  staff: { referenteBes: PersonVM | null; animatoreDigitale: PersonVM | null };
  statistiche?: { totaleClassi: number; totaleDocenti: number; totaleAlunni: number };
}
```

Add `import type { PersonVM } from './mappers/personVmMapper';` near the top of `Cdu.ts`.

- [ ] **Step 4: Rewrite `SchoolProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IMasterSheetRepository } from '../../../domain/repositories/IMasterSheetRepository';
import type { IRuoloSpecialeRepository } from '../../../domain/repositories/IRuoloSpecialeRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { PersonVM } from '../mappers/personVmMapper';
import { buildPersonVmFromDocente } from '../mappers/personVmMapper';

const RUOLO_REFERENTE_BES = 'REF_BES';
const RUOLO_ANIMATORE_DIGITALE = 'AN_DIG';

/**
 * Populates `cdu.istituto` (02 §3 → SchoolProvider). Organisation data comes from
 * the current-year Master Sheet row; the two staff roles resolve to a full
 * PersonVM (or null when unassigned) through the DOCENTI registry.
 */
export class SchoolProvider implements ContextProvider {
  constructor(
    private readonly master: IMasterSheetRepository,
    private readonly ruoli: IRuoloSpecialeRepository,
    private readonly docenti: IDocenteRepository
  ) {}

  provide(cdu: Cdu): void {
    const cfg = this.master.findConfigAnnoCorrente();
    cdu.istituto = {
      organizzazione: {
        annoScolastico: cfg.annoScolasticoRaw,
        dirigente: { nomeCompleto: cfg.dirigente }
      },
      staff: {
        referenteBes: this.personeRuolo(RUOLO_REFERENTE_BES),
        animatoreDigitale: this.personeRuolo(RUOLO_ANIMATORE_DIGITALE)
      }
    };
  }

  /** PersonVM of the first teacher holding `ruoloId`, or null if unassigned/unknown. */
  private personeRuolo(ruoloId: string): PersonVM | null {
    const ruolo = this.ruoli.findAllCached().find((r) => r.id === ruoloId);
    if (ruolo === undefined) return null;
    const emails = ruolo.getEmails();
    if (emails.length === 0) return null;
    const docente = this.docenti.findById(emails[0]!.value);
    return docente === null ? null : buildPersonVmFromDocente(docente);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/school-provider.test.ts`
Expected: PASS

- [ ] **Step 6: Run full unit suite, fix any other break**

Run: `npm test -- --testPathPattern school`
Expected: PASS. If other suites read `cdu.istituto.organizzazione.dirigente` as a string (e.g. `E2eTemplateProvisioner.ts`), note them for Task 26 (final e2e/online sweep) — do not fix them here.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/providers/SchoolProvider.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/providers/school-provider.test.ts
git commit -m "feat: SchoolProvider emits PersonVM staff and object dirigente"
```

---

### Task 5: `ClasseProvider` — `annoScolastico` self-containment, `SubjectVM` articolazione, descriptive `parent`

**Files:**
- Modify: `src/application/context-engine/providers/ClasseProvider.ts` (full file)
- Modify: `src/application/context-engine/Cdu.ts:117-138` (`CduClasse.anagrafica`, `CduClasse.articolazione`)
- Modify: `src/application/context-engine/CduInternalMetadata.ts` (`attachCduArticolazionePartners` — check its exact signature before editing, since `articolazione.materieCondivise` etc. change from `string[]` to `SubjectVM[]`)
- Test: `test/unit/application/context-engine/providers/classe-provider.test.ts` (extend or create)

**Interfaces:**
- Consumes: `CduIstituto.organizzazione.annoScolastico` (Task 4 — `school` MUST run before `class`, already guaranteed by every `RECIPES` entry per `Recipe.ts:76-105,107-167`), `SubjectVM`/`buildSubjectVm` (Task 2), `IClasseRepository.getMaterieArticolazione` (returns `{condivise, separatePrimoGruppo, separateSecondoGruppo}: string[]` — sigle, resolved to `SubjectVM[]` via `IMateriaRepository.findByIdCached`), `IClasseRepository.findById`/`getIndirizzo`/`orderedPartners`.
- Produces (new `CduClasse` slices consumed by Task 12/17/18):
  ```typescript
  articolazione?: {
    partner: string | null;
    partners: string[] | null;
    parent: { id: string; anno: number; indirizzi: Array<{ sigla: string; nome: string; nomeSintetico: string; tipo: string }> } | null;
    materieCondivise: SubjectVM[];
    materieSeparatePrimoGruppo: SubjectVM[];
    materieSeparateSecondoGruppo: SubjectVM[];
  };
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/application/context-engine/providers/classe-provider.test.ts (add to existing describe block, or create)
it('copies annoScolastico from istituto and builds SubjectVM articolazione with a descriptive parent', () => {
  const cdu = makeCdu(); // existing test helper
  cdu.istituto = {
    organizzazione: { annoScolastico: '2025-2026', dirigente: { nomeCompleto: 'x' } },
    staff: { referenteBes: null, animatoreDigitale: null }
  };
  // ... wire classi/alunni fakes for an articulated class 5AB-LC-LS with partners 5A-LC/5B-LS ...
  provider.provide(cdu, { target: '5AB-LC-LS', tipoTarget: 'classe', now: new Date() });
  expect(cdu.focus.classe?.anagrafica.annoScolastico).toBe('2025-2026');
  expect(cdu.focus.classe?.articolazione?.parent).toEqual({
    id: '5AB-LC-LS',
    anno: 5,
    indirizzi: [
      { sigla: 'LC', nome: 'Liceo Classico', nomeSintetico: 'Classico', tipo: 'LICEO' },
      { sigla: 'LS', nome: 'Liceo Scientifico', nomeSintetico: 'Scientifico', tipo: 'LICEO' }
    ]
  });
  expect(cdu.focus.classe?.articolazione?.materieCondivise[0]).toMatchObject({ sigla: 'ITA', nome: expect.any(String) });
});
```

Adapt the fixture wiring to whatever fake-repository pattern the existing `classe-provider.test.ts` already uses (read the file first — do not invent a new fake pattern).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/classe-provider.test.ts`
Expected: FAIL — `annoScolastico` absent, `parent` is a bare string, `materieCondivise` is `string[]`.

- [ ] **Step 3: Update `CduClasse` in `Cdu.ts:117-138`**

```typescript
export interface CduClasse {
  anagrafica: {
    nome: string;
    anno: number;
    sezione: string;
    annoScolastico: string;
    indirizzo: { nome: string; nomeSintetico: string; sigla: string; tipo: string };
  };
  flags: {
    isClassePrima: boolean;
    isTriennio: boolean;
    isPrimoBiennio: boolean;
    isTerminale: boolean;
    isArticolata: boolean;
  };
  articolazione?: {
    partner: string | null;
    partners: string[] | null;
    parent: {
      id: string;
      anno: number;
      indirizzi: Array<{ sigla: string; nome: string; nomeSintetico: string; tipo: string }>;
    } | null;
    materieCondivise: SubjectVM[];
    materieSeparatePrimoGruppo: SubjectVM[];
    materieSeparateSecondoGruppo: SubjectVM[];
  };
  // ... coordinatori/tutor/etc updated by Tasks 6/7, unchanged here ...
}
```
(Add `import type { SubjectVM } from './mappers/subjectVmMapper';` at the top.)

- [ ] **Step 4: Rewrite `ClasseProvider.provide`/`buildArticolazione`**

```typescript
provide(cdu: Cdu, params: BuildParams): void {
  const classe = this.resolveClasse(params);
  setClasseEntity(cdu, classe);

  const indirizzo = this.classi.getIndirizzo(classe);
  const anno = classe.anno;
  const isArticolata = this.classi.isArticolata(classe);
  const annoScolastico = cdu.istituto?.organizzazione.annoScolastico ?? '';

  const focusClasse: CduClasse = {
    anagrafica: {
      nome: classe.nome,
      anno: anno.value,
      sezione: classe.nome.replace(/^\d+/, ''),
      annoScolastico,
      indirizzo: {
        nome: indirizzo.nome,
        nomeSintetico: indirizzo.nomeSintetico,
        sigla: classe.indirizzo,
        tipo: indirizzo.tipo
      }
    },
    flags: {
      isClassePrima: anno.isPrima(),
      isTriennio: anno.value >= 3,
      isPrimoBiennio: anno.isPrimoBiennio(),
      isTerminale: anno.isTerminale(),
      isArticolata
    },
    coordinatori: this.buildCoordinatori(classe)
  };

  if (isArticolata) {
    const articolazione = this.buildArticolazione(classe);
    focusClasse.articolazione = attachCduArticolazionePartners(
      articolazione,
      this.classi.orderedPartners(classe).map((partner) => partner.id ?? '')
    );
  }

  cdu.focus.classe = focusClasse;
}

private buildArticolazione(classe: Classe): NonNullable<CduClasse['articolazione']> {
  const config = this.classi.getArticolazione(classe);
  const materie = this.classi.getMaterieArticolazione(classe);
  return {
    partner: config?.partner?.value ?? null,
    partners: config?.isParent() === true ? config.partners.map((partner) => partner.value) : null,
    parent: this.buildParent(config),
    materieCondivise: this.buildMaterieVm(materie?.condivise ?? [], classe),
    materieSeparatePrimoGruppo: this.buildMaterieVm(materie?.separatePrimoGruppo ?? [], classe),
    materieSeparateSecondoGruppo: this.buildMaterieVm(materie?.separateSecondoGruppo ?? [], classe)
  };
}

private buildParent(config: ArticolazioneConfig | null): NonNullable<CduClasse['articolazione']>['parent'] {
  const parentId = config?.parent?.value ?? null;
  if (parentId === null) return null;
  const parentClasse = this.classi.findById(ClasseId.of(parentId));
  if (parentClasse === null) return null;
  const indirizzi = this.classi.orderedPartners(parentClasse).map((partner) => {
    const ind = this.classi.getIndirizzo(partner);
    return { sigla: partner.indirizzo, nome: ind.nome, nomeSintetico: ind.nomeSintetico, tipo: ind.tipo };
  });
  return { id: parentId, anno: parentClasse.anno.value, indirizzi };
}

private buildMaterieVm(sigle: string[], classe: Classe): SubjectVM[] {
  const indirizzo = IndirizzoId.of(classe.indirizzo);
  return sigle
    .map((sigla) => this.materie?.findByIdCached(MateriaId.of(sigla)))
    .filter((materia): materia is Materia => materia !== null && materia !== undefined)
    .map((materia) => buildSubjectVm(materia, { indirizzo }));
}
```

Add `materie: IMateriaRepository` as a fourth constructor parameter (`private readonly materie?: IMateriaRepository`), matching the existing optional-`alunni` pattern at `ClasseProvider.ts:21-24`; import `buildSubjectVm`, `SubjectVM`, `MateriaId`, `Materia`, `ArticolazioneConfig`, `IMateriaRepository`, `IndirizzoId` at the top. Update the `ContextEngineFactory.ts:66` registration to `new ClasseProvider(classi, alunni, materie)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/classe-provider.test.ts`
Expected: PASS

- [ ] **Step 6: Update `ContextEngineFactory.ts:66`**

```typescript
.registerProvider('class', new ClasseProvider(classi, alunni, materie))
```

- [ ] **Step 7: Run full unit suite**

Run: `npm test`
Expected: `classe-provider.test.ts` and `school-provider.test.ts` pass; other suites reading old `articolazione.materieCondivise: string[]` shape will fail — note for Task 26, do not fix here unless they're unit tests directly under `test/unit/application/context-engine/`, in which case fix inline (update expected shape to `SubjectVM[]`).

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/providers/ClasseProvider.ts src/application/context-engine/Cdu.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/context-engine/providers/classe-provider.test.ts
git commit -m "feat: ClasseProvider emits self-contained anagrafica and SubjectVM articolazione"
```

---

## PHASE 2 — People and councils

### Task 6: Aggregate person-group declension helper + `TutorProvider`

**Files:**
- Modify: `src/application/context-engine/mappers/personVmMapper.ts` (add aggregate helper, extending Task 1's file)
- Modify: `src/application/context-engine/providers/TutorProvider.ts` (full file, 39 lines)
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.tutor`)
- Test: `test/unit/application/context-engine/mappers/person-vm-mapper.test.ts` (extend)
- Test: `test/unit/application/context-engine/providers/tutor-provider.test.ts` (extend or create)

**Interfaces:**
- Produces (appended to `personVmMapper.ts`, reused by Task 7's `coordinatori` container):
  ```typescript
  export interface PersonGroupDeclension { appellativo: string; articolo: string }
  export function declinePersonGroup(persone: PersonVM[]): PersonGroupDeclension | undefined; // undefined when persone is empty (02 §8.1: "Se l'elenco è vuoto le proprietà non vengono esposte")
  ```
- Produces (`CduClasse.tutor`, consumed by nothing further in this plan — leaf node):
  ```typescript
  tutor?: {
    appellativo?: string;
    articolo?: string;
    tutor?: string;
    asl: PersonVM[];
    orientamento: PersonVM[];
  };
  ```

- [ ] **Step 1: Write the failing test for `declinePersonGroup`**

```typescript
// appended to test/unit/application/context-engine/mappers/person-vm-mapper.test.ts
import { declinePersonGroup } from '../../../../../src/application/context-engine/mappers/personVmMapper';

describe('declinePersonGroup', () => {
  it('returns undefined for an empty group', () => {
    expect(declinePersonGroup([])).toBeUndefined();
  });

  it('returns prof.ssa/la for a single female', () => {
    const f = buildPersonVm({ nome: 'Laura', cognome: 'Gialli', email: null, genere: 'F' });
    expect(declinePersonGroup([f])).toEqual({ appellativo: 'prof.ssa', articolo: 'la' });
  });

  it('returns prof.sse/le for two or more females', () => {
    const f1 = buildPersonVm({ nome: 'Laura', cognome: 'Gialli', email: null, genere: 'F' });
    const f2 = buildPersonVm({ nome: 'Anna', cognome: 'Verdi', email: null, genere: 'F' });
    expect(declinePersonGroup([f1, f2])).toEqual({ appellativo: 'prof.sse', articolo: 'le' });
  });

  it('returns prof./il for a single male, prof./i for a mixed or all-male group of 2+', () => {
    const m = buildPersonVm({ nome: 'Mario', cognome: 'Rossi', email: null, genere: 'M' });
    const f = buildPersonVm({ nome: 'Laura', cognome: 'Gialli', email: null, genere: 'F' });
    expect(declinePersonGroup([m])).toEqual({ appellativo: 'prof.', articolo: 'il' });
    expect(declinePersonGroup([m, f])).toEqual({ appellativo: 'prof.', articolo: 'i' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/person-vm-mapper.test.ts`
Expected: FAIL — `declinePersonGroup` not exported.

- [ ] **Step 3: Append `declinePersonGroup` to `personVmMapper.ts`**

```typescript
export interface PersonGroupDeclension {
  appellativo: string;
  articolo: string;
}

/**
 * Aggregate salutation/article over a group of people (02 §8.1, §2.6):
 * tutte F e ≥2 → prof.sse/le; tutte F e 1 → prof.ssa/la; altrimenti prof./i (≥2) o il (1).
 * Returns undefined for an empty group — callers must omit the field rather than expose it.
 */
export function declinePersonGroup(persone: PersonVM[]): PersonGroupDeclension | undefined {
  if (persone.length === 0) return undefined;
  const tutteF = persone.every((p) => p.genere === 'F');
  if (tutteF) {
    return persone.length >= 2 ? { appellativo: 'prof.sse', articolo: 'le' } : { appellativo: 'prof.ssa', articolo: 'la' };
  }
  return { appellativo: 'prof.', articolo: persone.length >= 2 ? 'i' : 'il' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/person-vm-mapper.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Write the failing test for `TutorProvider`**

```typescript
// test/unit/application/context-engine/providers/tutor-provider.test.ts (extend existing or create)
it('builds PersonVM tutor lists with aggregate declension, omitted when both lists are empty', () => {
  const classi = {
    getDocentiRuoloArticolato: (_classe: unknown, ruolo: string) =>
      ruolo === 'TUTOR_ASL' ? [{ nome: 'Giulia', cognome: 'Russo', genere: 'F', id: 'g@x.it' }] : []
  };
  const provider = new TutorProvider(classi as never);
  const cdu = makeCdu();
  cdu.focus.classe = makeFocusClasse(); // existing helper
  provider.provide(cdu);
  expect(cdu.focus.classe?.tutor).toEqual({
    appellativo: 'prof.ssa',
    articolo: 'la',
    tutor: 'tutor',
    asl: [expect.objectContaining({ nomeCompleto: 'Giulia Russo', appellativoCompleto: 'Prof.ssa Giulia Russo' })],
    orientamento: []
  });
});

it('omits appellativo/articolo/tutor when both asl and orientamento are empty', () => {
  const classi = { getDocentiRuoloArticolato: () => [] };
  const provider = new TutorProvider(classi as never);
  const cdu = makeCdu();
  cdu.focus.classe = makeFocusClasse();
  provider.provide(cdu);
  expect(cdu.focus.classe?.tutor).toEqual({ asl: [], orientamento: [] });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/tutor-provider.test.ts`
Expected: FAIL — current output is `{nome, email}[]`, no aggregate fields.

- [ ] **Step 7: Update `CduClasse.tutor` in `Cdu.ts`**

```typescript
tutor?: {
  appellativo?: string;
  articolo?: string;
  tutor?: string;
  asl: PersonVM[];
  orientamento: PersonVM[];
};
```

- [ ] **Step 8: Rewrite `TutorProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { Docente } from '../../../domain/entities/Docente';
import type { PersonVM } from '../mappers/personVmMapper';
import { buildPersonVmFromDocente, declinePersonGroup } from '../mappers/personVmMapper';
import { getClasseEntity } from '../techEntities';

const RUOLO_TUTOR_ASL = 'TUTOR_ASL';
const RUOLO_TUTOR_ORIENT = 'TUTOR_ORIENT';

/**
 * Populates `focus.classe.tutor` from CLASSI.RUOLI (02 §4.1) as PersonVM lists,
 * plus the aggregate declension (appellativo/articolo/tutor) computed over
 * asl ∪ orientamento — omitted entirely when both lists are empty (02 §8.1).
 */
export class TutorProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const asl = this.tutorVm(classe, RUOLO_TUTOR_ASL);
    const orientamento = this.tutorVm(classe, RUOLO_TUTOR_ORIENT);
    const declension = declinePersonGroup([...asl, ...orientamento]);

    focusClasse.tutor = {
      ...(declension === undefined ? {} : { ...declension, tutor: 'tutor' }),
      asl,
      orientamento
    };
  }

  private tutorVm(classe: ReturnType<typeof getClasseEntity>, ruolo: string): PersonVM[] {
    return this.classi
      .getDocentiRuoloArticolato(classe, ruolo)
      .map((d: Docente) => buildPersonVmFromDocente(d));
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/tutor-provider.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/application/context-engine/mappers/personVmMapper.ts src/application/context-engine/providers/TutorProvider.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/mappers/person-vm-mapper.test.ts test/unit/application/context-engine/providers/tutor-provider.test.ts
git commit -m "feat: TutorProvider emits PersonVM tutor lists with aggregate declension"
```

---

### Task 7: `ClasseProvider.buildCoordinatori` — `coordinatori` container (PersonVM `elenco` + aggregate)

**Files:**
- Modify: `src/application/context-engine/providers/ClasseProvider.ts` (`buildCoordinatori`, `Cdu.ts` import already present from Task 5)
- Modify: `src/application/context-engine/mappers/personVmMapper.ts` (add `coordinatoriVerbs` helper)
- Modify: `src/application/context-engine/Cdu.ts:139-145` (`CduClasse.coordinatori`)
- Test: `test/unit/application/context-engine/providers/classe-provider.test.ts` (extend)

**Interfaces:**
- Consumes: `declinePersonGroup` (Task 6), `buildPersonVmFromDocente` (Task 1).
- Produces:
  ```typescript
  coordinatori?: {
    appellativo?: string;
    articolo?: string;
    coordina?: string;
    presiede?: string;
    elenco: PersonVM[];
  };
  ```

- [ ] **Step 1: Write the failing test**

```typescript
it('builds coordinatori as a PersonVM elenco with aggregate declension and verbs', () => {
  // wire a single female coordinator via the existing fake classi repository
  provider.provide(cdu, { target: '5A-LC', tipoTarget: 'classe', now: new Date() });
  expect(cdu.focus.classe?.coordinatori).toEqual({
    appellativo: 'prof.ssa',
    articolo: 'la',
    coordina: 'coordina',
    presiede: 'presiede',
    elenco: [expect.objectContaining({ nomeCompleto: 'Laura Gialli' })]
  });
});

it('omits coordinatori aggregate fields entirely when there is no coordinator', () => {
  provider.provide(cdu, { target: '5B-LS', tipoTarget: 'classe', now: new Date() }); // fixture class with zero coordinators
  expect(cdu.focus.classe?.coordinatori).toEqual({ elenco: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/classe-provider.test.ts`
Expected: FAIL — current `coordinatori` is `Array<{nome,email,materia,appellativo,indirizzo?}>`, not `{elenco, appellativo, ...}`.

- [ ] **Step 3: Update `CduClasse.coordinatori` in `Cdu.ts:139-145`**

```typescript
coordinatori?: {
  appellativo?: string;
  articolo?: string;
  coordina?: string;
  presiede?: string;
  elenco: PersonVM[];
};
```

- [ ] **Step 4: Append `coordinatoriVerbs` to `personVmMapper.ts`**

```typescript
/** "coordina"/"presiede" for 1 person, "coordinano"/"presiedono" for ≥2 (02 §8.1). */
export function coordinatoriVerbs(count: number): { coordina: string; presiede: string } {
  return count >= 2 ? { coordina: 'coordinano', presiede: 'presiedono' } : { coordina: 'coordina', presiede: 'presiede' };
}
```

- [ ] **Step 5: Rewrite `ClasseProvider.buildCoordinatori`**

```typescript
private buildCoordinatori(classe: Classe): NonNullable<CduClasse['coordinatori']> {
  const config = this.classi.getArticolazione(classe);
  const docenti: Docente[] =
    config?.isParent() === true
      ? [classe, ...this.classi.getClassiPartner(classe)].flatMap((source) => this.classi.getCoordinatori(source))
      : this.classi.getCoordinatori(classe);
  const elenco = docenti.map((d) =>
    buildPersonVmFromDocente(d, this.classi.getMateriaDocente(classe, d.id ?? '') ?? null)
  );
  const declension = declinePersonGroup(elenco);
  return {
    ...(declension === undefined ? {} : { ...declension, ...coordinatoriVerbs(elenco.length) }),
    elenco
  };
}
```

Import `declinePersonGroup`, `coordinatoriVerbs`, `buildPersonVmFromDocente`, `Docente` at the top of `ClasseProvider.ts`. This drops the per-partner `indirizzo: { nome }` tag the old shape had on each coordinator — the target spec's `PersonVM` carries no such field, and callers needing the partner's address now read `articolazione.parent.indirizzi` (Task 5) instead.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/classe-provider.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/providers/ClasseProvider.ts src/application/context-engine/mappers/personVmMapper.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/providers/classe-provider.test.ts
git commit -m "feat: ClasseProvider coordinatori container with PersonVM elenco and aggregate declension"
```

---

### Task 8: `TeachingCouncilProjection`/`DocenteCdcVM` — `PersonVM`, `SubjectVM`, `materieSigle`

**Files:**
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts` (full file, 359 lines — `teacher()`:94-104, `dedupeMaterie`:197-207, `councilVmStrategy`:209-281)
- Modify: `src/application/context-engine/Cdu.ts:17-34` (`DocenteCdcVM`)
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts` — no change needed to partition logic (`materieSigle` flows through automatically since it's on `DocenteCdcVM`), only re-verify after this task's changes.
- Test: `test/unit/application/context-engine/consiglio-provider.test.ts` (extend — fork found `appellativo: 'Prof.'` assertion at line 71, no `appellativoCompleto` yet)
- Test: `test/unit/application/context-engine/teaching-council-projection.test.ts` (check if it exists; extend or create)

**Interfaces:**
- Consumes: `buildPersonVm`, `PersonVM` (Task 1); `buildSubjectVm`, `docentiDescrizione`, `SubjectVM` (Task 2); `IMateriaRepository.findByIdCached` (already injected).
- Produces (new `DocenteCdcVM`, consumed by Tasks 12 (`consiglioDiClasseFiltrato`), 26 (e2e)):
  ```typescript
  export interface DocenteCdcVM {
    anagrafica: PersonVM;
    materie: SubjectVM[];
    materieDescrizione: string;
    materieSigle: string;
    ruoli: { isCoordinatore: boolean; isTutorAsl: boolean; isTutorOrientamento: boolean; descrizione: string[] };
    stato: { isSupplente: boolean; sostituisce: PersonVM | null };
    tipoArticolazione: 'COMUNE' | 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO' | null;
    gruppoNome: string | null;
    isITP: boolean;
    flags: { isNotLast: boolean };
  }
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// extend test/unit/application/context-engine/consiglio-provider.test.ts
it('builds anagrafica as a full PersonVM and materie as SubjectVM with materieSigle', () => {
  // reuse the existing test's fixture wiring for a single-subject teacher (Mario Rossi / ITA)
  provider.provide(cdu, params, options);
  const docente = cdu.focus.classe?.consiglioDiClasse?.[0];
  expect(docente?.anagrafica.appellativoCompleto).toBe('Prof. Mario Rossi');
  expect(docente?.anagrafica.appellativoCognome).toBe('Prof. Rossi');
  expect(docente?.materie[0]).toMatchObject({ sigla: 'ITA', nomeSintetico: expect.any(String) });
  expect(docente?.materieSigle).toBe('ITA');
});

it('exposes stato.sostituisce as a PersonVM when a supplente is displayed', () => {
  // reuse the existing substitution fixture (SUPPLENZE row) already present in this test file
  provider.provide(cdu, params, options);
  const docente = cdu.focus.classe!.consiglioDiClasse!.find((d) => d.stato.sostituisce !== null)!;
  expect(docente.stato.sostituisce?.nomeCompleto).toEqual(expect.any(String));
  expect(docente.stato.sostituisce?.appellativoCompleto).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: FAIL — `anagrafica` currently has no `appellativoCompleto`, `materieSigle` is `undefined`, `stato.sostituisce` is `{nome, email}`.

- [ ] **Step 3: Update `DocenteCdcVM` in `Cdu.ts:17-34`**

```typescript
export interface DocenteCdcVM {
  anagrafica: PersonVM;
  materie: SubjectVM[];
  materieDescrizione: string;
  materieSigle: string;
  ruoli: {
    isCoordinatore: boolean;
    isTutorAsl: boolean;
    isTutorOrientamento: boolean;
    descrizione: string[];
  };
  stato: { isSupplente: boolean; sostituisce: PersonVM | null };
  tipoArticolazione: 'COMUNE' | 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO' | null;
  gruppoNome: string | null;
  isITP: boolean;
  flags: { isNotLast: boolean };
}
```
(Add `import type { SubjectVM } from './mappers/subjectVmMapper';` alongside the existing `PersonVM` import from Task 4/5.)

- [ ] **Step 4: Update `TeachingCouncilProjection.ts`**

Keep `ProjectionTeacher`/`teacher()` (lines 55-63, 94-104) unchanged — they remain the internal GLF-projection-pipeline shape (needed for `metadata.cognome` sortBy and `routing` matching). Only the final VM construction changes. Replace `dedupeMaterie`'s caller and `councilVmStrategy`'s return block (lines 242-278):

```typescript
function materiaVm(
  materie: IMateriaRepository,
  classe: Classe,
  assignment: FlattenedProjectionAssignment
): SubjectVM | null {
  const materia = materie.findByIdCached(MateriaId.of(assignment.slot.materia));
  if (materia === null) return null;
  return buildSubjectVm(materia, {
    indirizzo: IndirizzoId.of(classe.indirizzo),
    isITP: assignment.slot.kind === 'ITP',
    specificita: assignment.slot.specifica
  });
}

function personVmOf(teacher: ProjectionTeacher): PersonVM {
  return buildPersonVm({ nome: teacher.nome, cognome: teacher.cognome, email: teacher.id, genere: teacher.genere as 'M' | 'F' });
}
```

Inside `councilVmStrategy`'s `groups.map(...)` callback (was lines 225-279), replace the `materieVm` line and the returned object:

```typescript
      const materieVm = dedupeMaterie(
        assignments
          .map((assignment) => materiaVm(materie, classe, assignment))
          .filter((vm): vm is SubjectVM => vm !== null)
      );
      const tipoArt = tipoArticolazione(classi, classe, assignments);
      return {
        anagrafica: personVmOf(rowDocente),
        materie: materieVm,
        materieDescrizione: docentiDescrizioneMaterie(materieVm),
        materieSigle: materieVm.map((m) => m.sigla).join(', '),
        ruoli: {
          isCoordinatore,
          isTutorAsl,
          isTutorOrientamento,
          descrizione: descrizione(isCoordinatore, isTutorAsl, isTutorOrientamento)
        },
        stato: {
          isSupplente,
          sostituisce: sostituisce === null ? null : personVmOf(sostituisce)
        },
        tipoArticolazione: tipoArt,
        gruppoNome: gruppoNome(classi, classe, tipoArt),
        isITP: assignments.some((assignment) => assignment.slot.kind === 'ITP'),
        flags: { isNotLast: index < groups.length - 1 }
      } satisfies DocenteCdcVM;
```

`dedupeMaterie<T extends {sigla, specificita}>` (lines 197-207) already works unchanged against `SubjectVM[]` — no edit needed there beyond the generic constraint already matching `SubjectVM`'s `sigla`/`specificita` fields. `materieDescrizione` (02 §8.4) joins `materie.nomeSintetico`, distinct from `SubjectVM.docentiDescrizione` (Task 2's `docentiDescrizione` joins people, not subjects) — add a small local helper to avoid the name clash:

```typescript
function docentiDescrizioneMaterie(materie: SubjectVM[]): string {
  return materie.map((m) => m.nomeSintetico).join(', ');
}
```

Add imports at the top of `TeachingCouncilProjection.ts`: `buildPersonVm`, `PersonVM` from `./mappers/personVmMapper`; `buildSubjectVm`, `SubjectVM` from `./mappers/subjectVmMapper`; `IndirizzoId` from `../../domain/value-objects/IndirizzoId` (already imports `Classe` at line 8, needed for `classe.indirizzo`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/consiglio-provider.test.ts`
Expected: PASS

- [ ] **Step 6: Run full unit suite for this area**

Run: `npx jest --config jest.config.cjs --testPathPattern "consiglio|teaching-council"`
Expected: PASS. `attachCouncilProjectionMetadata` (lines 331-358) reads `docente.materie[].sigla`/`specificita` — unaffected by the `SubjectVM` swap since those fields keep the same names/types.

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/TeachingCouncilProjection.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/consiglio-provider.test.ts
git commit -m "feat: DocenteCdcVM emits PersonVM anagrafica/sostituisce, SubjectVM materie, materieSigle"
```

---

### Task 9: `destinatario` — `PersonVM` anagrafica + `sostituisce`

**Files:**
- Modify: the file containing `BuildCDUStep.buildDestinatario()` (fork located this at `emailSteps.ts:156-186` — confirm exact path with `grep -rn "buildDestinatario" src/` before editing, since the fork's path may be abbreviated)
- Modify: `src/application/context-engine/Cdu.ts:261-284` (`CduDestinatario`)
- Test: locate and extend the existing test file for `BuildCDUStep` (search `test/unit` for `BuildCDUStep` or `buildDestinatario`)

**Interfaces:**
- Consumes: `buildPersonVm`/`PersonVM` (Task 1).
- Produces:
  ```typescript
  export interface CduDestinatario {
    anagrafica: PersonVM;
    ruoliAttivi: string[];
    flags: { isCoordinatore: boolean; isTutor: boolean; isTutorAsl: boolean; isDocenteSostegno: boolean; isSupplente: boolean };
    contesto: { sostituisce: PersonVM | null; classiCompetenza: string[]; materieCompetenza: string[] };
    comunicazione: { salutoIniziale: string; oggettoCalcolato: string; testoContenutoPuro: string };
  }
  ```

- [ ] **Step 1: Locate the exact current implementation**

Run: `grep -rn "buildDestinatario" src/` and open the matched file. Confirm the current object literal matches the shape described in the investigation (`{nome,cognome,nomeCompleto,email,appellativo,genere}` for `anagrafica`, `{nome,email}|null` for `contesto.sostituisce`) before editing — if the shape differs, adapt the steps below to the actual field names found.

- [ ] **Step 2: Write the failing test**

```typescript
it('builds destinatario.anagrafica as a PersonVM and contesto.sostituisce as PersonVM|null', () => {
  const cdu = step.buildDestinatario(/* existing fixture inputs */);
  expect(cdu.anagrafica.appellativoCompleto).toBe('Prof. Mario Rossi');
  expect(cdu.anagrafica.appellativoCognome).toBe('Prof. Rossi');
});
```
Adapt to the existing test file's fixture-construction pattern once Step 1 locates it.

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL — no `appellativoCompleto` on the current shape.

- [ ] **Step 4: Update `CduDestinatario` in `Cdu.ts:261-284`**

```typescript
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
    materieCompetenza: string[];
  };
  comunicazione: { salutoIniziale: string; oggettoCalcolato: string; testoContenutoPuro: string };
}
```

- [ ] **Step 5: Update `buildDestinatario`**

Replace the ad hoc `{nome,cognome,nomeCompleto,email,appellativo,genere}` construction with `buildPersonVm({ nome, cognome, email, genere })`, and the `sostituisce` construction with `buildPersonVm(...)` or `null`. Keep every other field (`ruoliAttivi`, `flags`, `contesto.classiCompetenza`/`materieCompetenza`, `comunicazione`) untouched.

- [ ] **Step 6: Run test to verify it passes**

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add <the located BuildCDUStep file> src/application/context-engine/Cdu.ts <the located test file>
git commit -m "feat: destinatario emits PersonVM anagrafica and sostituisce"
```

---

## PHASE 3 — Students

### Task 10: `CurriculumVM` — `curriculum` map → array

**Files:**
- Modify: `src/application/context-engine/mappers/carenzeMapper.ts:29-36` (`curriculumRecord` → `curriculumArray`)
- Modify: `src/application/context-engine/providers/StudentiProvider.ts:78` (call site)
- Modify: `src/application/context-engine/providers/AlunnoProvider.ts:9,61,88` (call site + constructor)
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts:137-153` (`prepareStudentCouncilAssignments`, `specificityPattern`)
- Modify: `src/application/context-engine/Cdu.ts:37-52,195-243` (`AlunnoContestoVM.curriculum`, `CduAlunno.curriculum`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts:70` (make `materie` non-optional for `AlunnoProvider`)
- Test: `test/unit/application/context-engine/mappers/carenze-mapper.test.ts` (extend or create)
- Test: `test/unit/application/context-engine/providers/studenti-provider.test.ts`, `alunno-provider.test.ts` (extend)

**Interfaces:**
- Consumes: `Alunno.getCurriculum(): Map<MateriaId, string[]>` (`Alunno.ts:79-88`), `IMateriaRepository.findByIdCached` (`IMateriaRepository.ts:6`).
- Produces (replaces `Record<string, {specifiche: string[]}>` everywhere it's used — Tasks 12/13 build on this):
  ```typescript
  export interface CurriculumVM {
    materiaId: string;
    materiaSigla: string;
    materiaNome: string;
    specifiche: Array<{ nome: string }>;
  }
  export function curriculumArray(alunno: Alunno, materie: IMateriaRepository): CurriculumVM[];
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/application/context-engine/mappers/carenze-mapper.test.ts
import { curriculumArray } from '../../../../../src/application/context-engine/mappers/carenzeMapper';
import { Alunno } from '../../../../../src/domain/entities/Alunno';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { COL_ALUNNI, COL_MATERIE } from '../../../../../src/config/schema';

describe('curriculumArray', () => {
  it('converts the CURRICULUM map into an array of CurriculumVM, resolving materiaSigla/materiaNome', () => {
    const alunno = Alunno.fromData({
      [COL_ALUNNI.CURRICULUM]: JSON.stringify({ INTERPRET: ['chitarra', 'flauto'] })
    });
    const materie = {
      findByIdCached: (id: { value: string }) =>
        id.value === 'INTERPRET' ? Materia.fromData({ [COL_MATERIE.ID]: 'INTERPRET', [COL_MATERIE.NOME]: 'Esecuzione ed interpretazione' }) : null
    };
    const result = curriculumArray(alunno, materie as never);
    expect(result).toEqual([
      { materiaId: 'INTERPRET', materiaSigla: 'INTERPRET', materiaNome: 'Esecuzione ed interpretazione', specifiche: [{ nome: 'chitarra' }, { nome: 'flauto' }] }
    ]);
  });

  it('returns an empty array when CURRICULUM is absent', () => {
    const alunno = Alunno.fromData({});
    expect(curriculumArray(alunno, { findByIdCached: () => null } as never)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/carenze-mapper.test.ts`
Expected: FAIL — `curriculumArray` not exported (only `curriculumRecord` exists).

- [ ] **Step 3: Replace `curriculumRecord` with `curriculumArray` in `carenzeMapper.ts`**

```typescript
export interface CurriculumVM {
  materiaId: string;
  materiaSigla: string;
  materiaNome: string;
  specifiche: Array<{ nome: string }>;
}

/** ✎ Student CURRICULUM as an array of CurriculumVM (02 §8.8) — replaces the dynamic-key map. */
export function curriculumArray(alunno: Alunno, materie: IMateriaRepository): CurriculumVM[] {
  const out: CurriculumVM[] = [];
  for (const [materiaId, specifiche] of alunno.getCurriculum()) {
    const materia = materie.findByIdCached(materiaId);
    out.push({
      materiaId: materiaId.value,
      materiaSigla: materia?.id ?? materiaId.value,
      materiaNome: materia?.nome ?? materiaId.value,
      specifiche: specifiche.map((nome) => ({ nome }))
    });
  }
  return out;
}
```

Add `import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';` at the top; delete the old `curriculumRecord` function entirely (no backward compatibility).

- [ ] **Step 4: Update `Cdu.ts` types**

In `AlunnoContestoVM` (`Cdu.ts:37-52`): `curriculum: CurriculumVM[];` (was `Record<string, {specifiche: string[]}>`).
In `CduAlunno` (`Cdu.ts:195-243`): `curriculum: CurriculumVM[];` (same change).
Add `import type { CurriculumVM } from './mappers/carenzeMapper';` at the top.

- [ ] **Step 5: Update `StudentiProvider.ts:78`**

```typescript
curriculum: curriculumArray(alunno, this.materie),
```
(`this.materie: IMateriaRepository` is already a constructor dependency at `StudentiProvider.ts:22` — no wiring change needed.) Update the import at the top from `curriculumRecord` to `curriculumArray`.

- [ ] **Step 6: Update `AlunnoProvider.ts`**

Change the constructor signature at line 30-36 to make `materie` non-optional and the fifth positional parameter required:

```typescript
constructor(
  private readonly alunni: IAlunnoRepository,
  private readonly classi: IClasseRepository,
  private readonly oreAsl: IOreASLRepository,
  private readonly materie: IMateriaRepository,
  private readonly teachingAssignments?: ITeachingAssignmentResolver
) {
  this.projection = createTeachingCouncilProjection(classi, materie).alunno;
}
```

(This reorders `materie` before `teachingAssignments` and drops its optionality — `this.projection` no longer needs an `undefined` branch since `materie` is now guaranteed. Update the `if (this.projection !== undefined ...)` check at line 93 accordingly, or simplify since `this.projection` is now always defined.)

Line 61: `curriculum: curriculumArray(alunno, this.materie),` — update import from `curriculumRecord`.

Line 85-89 (`prepareStudentCouncilAssignments` call): passes `focusAlunno.curriculum` — now `CurriculumVM[]`, matching the new signature from Step 8 below.

- [ ] **Step 7: Update `ContextEngineFactory.ts:70`**

```typescript
.registerProvider(
  'student',
  new AlunnoProvider(alunni, classi, oreAsl, materie, teachingAssignments)
)
```
(Argument order now matches the updated `AlunnoProvider` constructor from Step 6.)

- [ ] **Step 8: Update `TeachingCouncilProjection.ts` curriculum consumers**

```typescript
export function prepareStudentCouncilAssignments(
  assignments: TeachingAssignment[],
  religione: ReligioneScelta,
  curriculum: CurriculumVM[]
): ProjectionAssignment[] {
  return assignments.map((assignment) =>
    assignmentInput(
      assignment,
      String(religione),
      specificityPattern(curriculum, assignment.slot.materia.value)
    )
  );
}

function specificityPattern(curriculum: CurriculumVM[], materiaId: string): string {
  const entry = curriculum.find((c) => c.materiaId === materiaId);
  const specifiche = entry?.specifiche.map((s) => s.nome) ?? [];
  if (specifiche.length === 0) return '(?!)';
  return `^(?:${specifiche.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
}
```
Add `import type { CurriculumVM } from './mappers/carenzeMapper';` at the top; remove the old `Record<string, {specifiche: string[]}>` parameter type at line 140.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs --testPathPattern "carenze-mapper|studenti-provider|alunno-provider|consiglio|teaching-council"`
Expected: PASS. Fix any remaining fixture in `studenti-provider.test.ts`/`alunno-provider.test.ts` that still asserts `curriculum` as `Object.keys(...)` — convert to array assertions (`curriculum.find(c => c.materiaId === ...)`).

- [ ] **Step 10: Commit**

```bash
git add src/application/context-engine/mappers/carenzeMapper.ts src/application/context-engine/providers/StudentiProvider.ts src/application/context-engine/providers/AlunnoProvider.ts src/application/context-engine/TeachingCouncilProjection.ts src/application/context-engine/Cdu.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/context-engine/mappers/carenze-mapper.test.ts test/unit/application/context-engine/providers/studenti-provider.test.ts test/unit/application/context-engine/providers/alunno-provider.test.ts
git commit -m "feat: curriculum becomes an array of CurriculumVM, dynamic-key map removed"
```

---

### Task 11: `carenze.materiaNome` + `piani.items[].tipoLabel`

**Files:**
- Modify: `src/application/context-engine/mappers/carenzeMapper.ts:11-27` (`carenzeDettaglioSemplice`)
- Modify: `src/application/context-engine/providers/StudentiProvider.ts:61-64` (call site)
- Modify: `src/application/context-engine/providers/CarenzeProvider.ts:18-24` (call site)
- Modify: `src/application/context-engine/providers/PianiProvider.ts:18-23`
- Modify: `src/application/context-engine/Cdu.ts` (`AlunnoContestoVM.didattica.carenze.dettaglio`/`piani.items`, `CduAlunno.didattica.carenze.dettaglio`/`piani.items`)
- Test: `test/unit/application/context-engine/mappers/carenze-mapper.test.ts`, `carenze-provider.test.ts`, `piani-provider.test.ts` (extend)

**Interfaces:**
- Consumes: `IMateriaRepository.findByIdCached` (already injected in `CarenzeProvider`/`StudentiProvider`), `tipoPianoLabel` (Task 3).
- Produces:
  ```typescript
  dettaglio: Array<{ materia: string; materiaNome: string; voto: string }>;
  items: Array<{ tipo: TipoPiano; tipoLabel: string; isBes: boolean; /* CduAlunno only: */ link?: string; parametriGenerazione?: Record<string, unknown> }>;
  ```

- [ ] **Step 1: Write the failing test for `carenzeDettaglioSemplice`**

```typescript
// extend test/unit/application/context-engine/mappers/carenze-mapper.test.ts
it('resolves materiaNome alongside the sigla', () => {
  const carenza = { getCella: (sigla: string) => (sigla === 'ITA' ? '5' : '') } as never;
  const materie = { findByIdCached: (id: { value: string }) => (id.value === 'ITA' ? { nome: 'Italiano' } : null) };
  const result = carenzeDettaglioSemplice([carenza], ['ITA'], materie as never);
  expect(result).toEqual([{ materia: 'ITA', materiaNome: 'Italiano', voto: '5' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/carenze-mapper.test.ts`
Expected: FAIL — current signature takes no `materie` argument, output has no `materiaNome`.

- [ ] **Step 3: Update `carenzeDettaglioSemplice`**

```typescript
export function carenzeDettaglioSemplice(
  carenze: Carenza[],
  sigle: string[],
  materie: IMateriaRepository
): Array<{ materia: string; materiaNome: string; voto: string }> {
  const out: Array<{ materia: string; materiaNome: string; voto: string }> = [];
  for (const carenza of carenze) {
    for (const sigla of sigle) {
      const cella = carenza.getCella(sigla);
      if (typeof cella !== 'string' && typeof cella !== 'number' && typeof cella !== 'boolean') continue;
      const voto = String(cella).trim();
      if (voto === '') continue;
      const materiaNome = materie.findByIdCached(MateriaId.of(sigla))?.nome ?? sigla;
      out.push({ materia: sigla, materiaNome, voto });
    }
  }
  return out;
}
```
Add `import { MateriaId } from '../../../domain/value-objects/MateriaId';` and `import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';`.

- [ ] **Step 4: Update the two call sites**

`StudentiProvider.ts:61-64`: `carenzeDettaglioSemplice(this.alunni.getCarenze(alunno), this.materie.findAllSigle(), this.materie)`.
`CarenzeProvider.ts:18-24`: `carenzeDettaglioSemplice(this.alunni.getCarenze(getAlunnoEntity(cdu)), this.materie.findAllSigle(), this.materie)`.

- [ ] **Step 5: Update `Cdu.ts` `dettaglio` types**

`AlunnoContestoVM.didattica.carenze.dettaglio` (`Cdu.ts:47`) and `CduAlunno.didattica.carenze.dettaglio` (`Cdu.ts:203`): `Array<{ materia: string; materiaNome: string; voto: string }>`.

- [ ] **Step 6: Write the failing test for `PianiProvider` `tipoLabel`**

```typescript
it('adds tipoLabel to every piani item', () => {
  // reuse the existing PIANI fixture (a PDP_DSA row)
  provider.provide(cdu);
  expect(cdu.focus.alunno?.didattica.piani.items[0]).toMatchObject({ tipo: 'PDP_DSA', tipoLabel: 'PDP DSA' });
});
```

- [ ] **Step 7: Run test to verify it fails**

Expected: FAIL — no `tipoLabel` field currently.

- [ ] **Step 8: Update `PianiProvider.ts:18-23`**

```typescript
const items = this.alunni.getPiani(getAlunnoEntity(cdu)).map((p) => ({
  tipo: p.tipo,
  tipoLabel: tipoPianoLabel(p.tipo),
  isBes: p.isBES(),
  link: '',
  parametriGenerazione: p.getParametri()
}));
```
Add `import { tipoPianoLabel } from '../mappers/labels';`.

- [ ] **Step 9: Update `Cdu.ts` `piani.items` types**

`CduAlunno.didattica.piani.items` (`Cdu.ts:209-214`) and `AlunnoContestoVM.didattica.piani.items` (`Cdu.ts:49`): add `tipoLabel: string;` alongside `tipo`. The same `tipoLabel` field is also needed on `StudentiProvider`'s per-student `pianiItems` (`StudentiProvider.ts:65-67`, feeding `AlunnoContestoVM.didattica.piani.items`) — update that map call too: `.map((p) => ({ tipo: p.tipo, tipoLabel: tipoPianoLabel(p.tipo), isBes: p.isBES() }))`, importing `tipoPianoLabel` there as well.

- [ ] **Step 10: Run all affected tests**

Run: `npx jest --config jest.config.cjs --testPathPattern "carenze|piani|studenti-provider"`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/application/context-engine/mappers/carenzeMapper.ts src/application/context-engine/providers/StudentiProvider.ts src/application/context-engine/providers/CarenzeProvider.ts src/application/context-engine/providers/PianiProvider.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/mappers/carenze-mapper.test.ts test/unit/application/context-engine/providers/carenze-provider.test.ts test/unit/application/context-engine/providers/piani-provider.test.ts
git commit -m "feat: precompute carenze.materiaNome and piani tipoLabel"
```

---

### Task 12: `StudentVM` self-containment (`classe`, `indirizzo`, `religioneLabel`) + remove `perIndirizzo`/`indirizziPresenti`

**Files:**
- Modify: `src/application/context-engine/providers/StudentiProvider.ts` (full file)
- Modify: `src/application/context-engine/Cdu.ts:37-52,159-172` (`AlunnoContestoVM`, `CduClasse.studenti`)
- Test: `test/unit/application/context-engine/providers/studenti-provider.test.ts:45,131-134` (rewrite the `perIndirizzo`/`indirizziPresenti` assertions found by investigation)

**Interfaces:**
- Consumes: `religioneLabel` (Task 3), `curriculumArray`/`carenzeDettaglioSemplice`/`tipoPianoLabel` (Tasks 10-11, already wired).
- Produces:
  ```typescript
  export interface AlunnoContestoVM {
    anagrafica: { nomeCompleto: string; email: string };
    classe: { nome: string };
    indirizzo: { nome: string; nomeSintetico: string };
    status: { isBes: boolean; isRipetente: boolean; isRappresentante: boolean; religione: string; religioneLabel: string };
    curriculum: CurriculumVM[];
    didattica: { carenze: {...}; piani: {...}; pcto: { oreCumulate: number } };
  }
  ```
  `CduClasse.studenti` drops `perIndirizzo`/`indirizziPresenti` entirely.

- [ ] **Step 1: Write the failing test**

```typescript
// replaces the perIndirizzo/indirizziPresenti assertions at studenti-provider.test.ts:45,131-134
it('every student in listaCompleta carries self-contained classe/indirizzo/religioneLabel', () => {
  provider.provide(cdu);
  const alunno = cdu.focus.classe!.studenti!.listaCompleta[0]!;
  expect(alunno.classe).toEqual({ nome: cdu.focus.classe!.anagrafica.nome });
  expect(alunno.indirizzo).toEqual({ nome: cdu.focus.classe!.anagrafica.indirizzo.nome, nomeSintetico: cdu.focus.classe!.anagrafica.indirizzo.nomeSintetico });
  expect(alunno.status.religioneLabel).toBe('Religione cattolica');
});

it('has no perIndirizzo or indirizziPresenti on the studenti node, even for an articulated parent', () => {
  provider.provide(articulatedCdu); // existing articulated-class fixture
  expect(articulatedCdu.focus.classe!.studenti).not.toHaveProperty('perIndirizzo');
  expect(articulatedCdu.focus.classe!.studenti).not.toHaveProperty('indirizziPresenti');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/studenti-provider.test.ts`
Expected: FAIL — `classe`/`indirizzo` absent on the item, `perIndirizzo` still present.

- [ ] **Step 3: Update `Cdu.ts` types**

`AlunnoContestoVM` (`Cdu.ts:37-52`):
```typescript
export interface AlunnoContestoVM {
  anagrafica: { nomeCompleto: string; email: string };
  classe: { nome: string };
  indirizzo: { nome: string; nomeSintetico: string };
  status: {
    isBes: boolean;
    isRipetente: boolean;
    isRappresentante: boolean;
    religione: string;
    religioneLabel: string;
  };
  curriculum: CurriculumVM[];
  didattica: {
    carenze: { hasCarenze: boolean; numero: number; dettaglio: Array<{ materia: string; materiaNome: string; voto: string }> };
    piani: { hasPiani: boolean; hasBes: boolean; items: Array<{ tipo: string; tipoLabel: string; isBes: boolean }> };
    pcto: { oreCumulate: number };
  };
}
```
(This drops `genitori: Array<{email}>` — confirm with a repo-wide `grep -rn "\.genitori" src test` whether anything still reads `AlunnoContestoVM.genitori`; the target spec's `StudentVM` §8.7 has no `genitori` field. If a live caller is found, keep the field and only add the new ones rather than removing it — do not break an unrelated feature as a side effect of this task.)

`CduClasse.studenti` (`Cdu.ts:159-172`): delete `perIndirizzo?: Record<string, AlunnoContestoVM[]>;` and `indirizziPresenti?: string[];` entirely; delete `perSpecificita?: Record<string, Record<string, AlunnoContestoVM[]>>;` too (Task 14 replaces it with the array form — deleting the dead map-typed field now avoids two competing shapes existing simultaneously mid-plan).

- [ ] **Step 4: Rewrite `StudentiProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu, AlunnoContestoVM } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { Classe } from '../../../domain/entities/Classe';
import { getClasseEntity } from '../techEntities';
import { carenzeDettaglioSemplice, curriculumArray } from '../mappers/carenzeMapper';
import { tipoPianoLabel, religioneLabel } from '../mappers/labels';

/**
 * Populates `focus.classe.studenti.listaCompleta` (02 §4.1/§8.7). Each item is
 * self-contained: it carries its own classe/indirizzo (Principle 2) so
 * templates never navigate back to `focus.classe.anagrafica` inside a loop.
 * For the parent of an articulated class the roster is the union across both
 * partner classes — no per-indirizzo grouping (moved to `focus.classe.partner`, 02 §2.5).
 */
export class StudentiProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly materie: IMateriaRepository
  ) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    const sourceClassi = config?.isParent() === true ? this.classi.getClassiPartner(classe) : [classe];
    const listaCompleta = sourceClassi.flatMap((source) =>
      this.classi
        .getStudenti(source)
        .filter((alunno) => alunno.isAttivo())
        .map((alunno) => this.buildVM(alunno, focusClasse))
    );
    focusClasse.studenti = { listaCompleta };
  }

  private buildVM(alunno: Alunno, focusClasse: NonNullable<Cdu['focus']['classe']>): AlunnoContestoVM {
    const dettaglio = carenzeDettaglioSemplice(this.alunni.getCarenze(alunno), this.materie.findAllSigle(), this.materie);
    const pianiItems = this.alunni
      .getPiani(alunno)
      .map((p) => ({ tipo: p.tipo, tipoLabel: tipoPianoLabel(p.tipo), isBes: p.isBES() }));
    const hasBes = pianiItems.some((p) => p.isBes);
    return {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      classe: { nome: focusClasse.anagrafica.nome },
      indirizzo: { nome: focusClasse.anagrafica.indirizzo.nome, nomeSintetico: focusClasse.anagrafica.indirizzo.nomeSintetico },
      status: {
        isBes: hasBes,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante(),
        religione: alunno.religione,
        religioneLabel: religioneLabel(alunno.religione)
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

Note: this changes each student's `classe`/`indirizzo` to always reflect the *focused* class (`focusClasse.anagrafica`), not each partner's own class — matching the target spec's example (`3.2`, `classe.nome: "5AB-LC-LS"` — the parent's composite name — for a student physically enrolled in one of the two partner classes). This is a deliberate self-containment choice (Principle 2: the template loop context is the focused class), not a bug.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/studenti-provider.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/providers/StudentiProvider.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/providers/studenti-provider.test.ts
git commit -m "feat: StudentVM self-containment, remove perIndirizzo/indirizziPresenti"
```

---

### Task 13: `focus.alunno` — `religioneLabel`

**Files:**
- Modify: `src/application/context-engine/providers/AlunnoProvider.ts:55-56`
- Modify: `src/application/context-engine/Cdu.ts:197` (`CduAlunno.status`)
- Test: `test/unit/application/context-engine/providers/alunno-provider.test.ts`

**Interfaces:**
- Consumes: `religioneLabel` (Task 3).
- Produces: `CduAlunno.status.religioneLabel: string`.

- [ ] **Step 1: Write the failing test**

```typescript
it('adds religioneLabel to focus.alunno.status', () => {
  provider.provide(cdu, params, options); // existing fixture, alunno with religione IRC
  expect(cdu.focus.alunno?.status.religioneLabel).toBe('Religione cattolica');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — no `religioneLabel` field.

- [ ] **Step 3: Update `CduAlunno.status`** (`Cdu.ts:197`)

```typescript
status: { religione: string; religioneLabel: string; isBes: boolean; isRipetente: boolean; isRappresentante: boolean };
```

- [ ] **Step 4: Update `AlunnoProvider.ts:55-56`**

```typescript
status: {
  religione: alunno.religione,
  religioneLabel: religioneLabel(alunno.religione),
  isBes: false,
  isRipetente: alunno.isRipetente(),
  isRappresentante: alunno.isRappresentante()
},
```
Add `import { religioneLabel } from '../mappers/labels';`.

- [ ] **Step 5: Run test to verify it passes**

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/providers/AlunnoProvider.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/providers/alunno-provider.test.ts
git commit -m "feat: focus.alunno.status exposes religioneLabel"
```

---

### Task 14: `SpecificitaAlunniVM` — `perSpecificita` (new, array-shaped)

**Files:**
- Create: `src/application/context-engine/mappers/specificitaAlunniMapper.ts`
- Modify: `src/application/context-engine/providers/StudentiProvider.ts` (call the new builder when `options.includiSpecificita`)
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.studenti.perSpecificita`)
- Test: `test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts`
- Test: `test/unit/application/context-engine/providers/studenti-provider.test.ts` (extend)

**Interfaces:**
- Consumes: `AlunnoContestoVM[]` (each item's `anagrafica`/`curriculum`, produced by Task 12), `IMateriaRepository.findByIdCached`.
- Produces:
  ```typescript
  export interface PersonMinVM { nome: string | null; cognome: string | null; nomeCompleto: string; email: string }
  export interface SpecificitaAlunniVM {
    materiaId: string;
    materiaSigla: string;
    materiaNome: string;
    specifiche: Array<{ nome: string; alunni: PersonMinVM[] }>;
  }
  export function buildPerSpecificita(studenti: AlunnoContestoVM[]): SpecificitaAlunniVM[];
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts
import { buildPerSpecificita } from '../../../../../src/application/context-engine/mappers/specificitaAlunniMapper';
import type { AlunnoContestoVM } from '../../../../../src/application/context-engine/Cdu';

function studente(nomeCompleto: string, email: string, curriculum: AlunnoContestoVM['curriculum']): AlunnoContestoVM {
  return {
    anagrafica: { nomeCompleto, email },
    classe: { nome: 'x' },
    indirizzo: { nome: 'x', nomeSintetico: 'x' },
    status: { isBes: false, isRipetente: false, isRappresentante: false, religione: 'IRC', religioneLabel: 'x' },
    curriculum,
    didattica: { carenze: { hasCarenze: false, numero: 0, dettaglio: [] }, piani: { hasPiani: false, hasBes: false, items: [] }, pcto: { oreCumulate: 0 } }
  };
}

describe('buildPerSpecificita', () => {
  it('groups students by materia then specifica, in a 3-level array', () => {
    const marco = studente('Marco Neri', 'marco.neri@x.it', [
      { materiaId: 'INTERPRET', materiaSigla: 'INTERPRET', materiaNome: 'Esecuzione ed interpretazione', specifiche: [{ nome: 'chitarra' }] }
    ]);
    const anna = studente('Anna Leone', 'anna.leone@x.it', [
      { materiaId: 'INTERPRET', materiaSigla: 'INTERPRET', materiaNome: 'Esecuzione ed interpretazione', specifiche: [{ nome: 'chitarra' }] }
    ]);
    const result = buildPerSpecificita([marco, anna]);
    expect(result).toEqual([
      {
        materiaId: 'INTERPRET',
        materiaSigla: 'INTERPRET',
        materiaNome: 'Esecuzione ed interpretazione',
        specifiche: [
          {
            nome: 'chitarra',
            alunni: [
              { nome: null, cognome: null, nomeCompleto: 'Marco Neri', email: 'marco.neri@x.it' },
              { nome: null, cognome: null, nomeCompleto: 'Anna Leone', email: 'anna.leone@x.it' }
            ]
          }
        ]
      }
    ]);
  });

  it('returns an empty array when no student has a curriculum entry', () => {
    expect(buildPerSpecificita([studente('x', 'x@x.it', [])])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/application/context-engine/mappers/specificitaAlunniMapper.ts
import type { AlunnoContestoVM } from '../Cdu';

export interface PersonMinVM {
  nome: string | null;
  cognome: string | null;
  nomeCompleto: string;
  email: string;
}

export interface SpecificitaAlunniVM {
  materiaId: string;
  materiaSigla: string;
  materiaNome: string;
  specifiche: Array<{ nome: string; alunni: PersonMinVM[] }>;
}

/**
 * Groups every student's curriculum specifiche into a 3-level array
 * (materia → specifica → alunni), replacing the old double-map
 * `perSpecificita["[MateriaId]"]["[specifica]"]` (02 §2.14, §8.9).
 * `AlunnoContestoVM.anagrafica` only carries `nomeCompleto`/`email` (02 §8.7),
 * so `nome`/`cognome` on PersonMinVM are always null here.
 */
export function buildPerSpecificita(studenti: AlunnoContestoVM[]): SpecificitaAlunniVM[] {
  const byMateria = new Map<string, { materiaSigla: string; materiaNome: string; bySpecifica: Map<string, PersonMinVM[]> }>();

  for (const studente of studenti) {
    for (const curriculum of studente.curriculum) {
      let materiaEntry = byMateria.get(curriculum.materiaId);
      if (materiaEntry === undefined) {
        materiaEntry = { materiaSigla: curriculum.materiaSigla, materiaNome: curriculum.materiaNome, bySpecifica: new Map() };
        byMateria.set(curriculum.materiaId, materiaEntry);
      }
      for (const { nome } of curriculum.specifiche) {
        const alunni = materiaEntry.bySpecifica.get(nome) ?? [];
        alunni.push({ nome: null, cognome: null, nomeCompleto: studente.anagrafica.nomeCompleto, email: studente.anagrafica.email });
        materiaEntry.bySpecifica.set(nome, alunni);
      }
    }
  }

  return Array.from(byMateria.entries()).map(([materiaId, entry]) => ({
    materiaId,
    materiaSigla: entry.materiaSigla,
    materiaNome: entry.materiaNome,
    specifiche: Array.from(entry.bySpecifica.entries()).map(([nome, alunni]) => ({ nome, alunni }))
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into `StudentiProvider.provide`**

`StudentiProvider.provide` needs `options: RecipeOptions` to check `includiSpecificita` — add it as a third parameter (`ContextProvider.provide(cdu, params?, options?)`, matching the pattern already used by `ConsiglioClasseProvider.provide(cdu, params, options)`):

```typescript
provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
  // ...existing listaCompleta assembly...
  focusClasse.studenti = {
    listaCompleta,
    ...(options.includiSpecificita ? { perSpecificita: buildPerSpecificita(listaCompleta) } : {})
  };
}
```
Add `import type { BuildParams, RecipeOptions } from '../Recipe';` and `import { buildPerSpecificita } from '../mappers/specificitaAlunniMapper';`.

- [ ] **Step 6: Update `CduClasse.studenti` in `Cdu.ts`**

```typescript
studenti?: {
  listaCompleta: AlunnoContestoVM[];
  statistiche?: { totale: number; conPianiDidattici: number; conBes: number; conDsa: number; ripetenti: number; rappresentanti: number };
  perSpecificita?: SpecificitaAlunniVM[];
};
```
Add `import type { SpecificitaAlunniVM } from './mappers/specificitaAlunniMapper';`.

- [ ] **Step 7: Write the failing provider-level test**

```typescript
it('populates perSpecificita only when includiSpecificita is true', () => {
  provider.provide(cdu, params, makeOptions({ includiSpecificita: true }));
  expect(cdu.focus.classe!.studenti!.perSpecificita).toBeDefined();
  provider.provide(cdu2, params, makeOptions({ includiSpecificita: false }));
  expect(cdu2.focus.classe!.studenti!.perSpecificita).toBeUndefined();
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/studenti-provider.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/application/context-engine/mappers/specificitaAlunniMapper.ts src/application/context-engine/providers/StudentiProvider.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/mappers/specificita-alunni-mapper.test.ts test/unit/application/context-engine/providers/studenti-provider.test.ts
git commit -m "feat: add SpecificitaAlunniVM array replacing the perSpecificita double map"
```

---

## PHASE 4 — Class subject catalog (new)

### Task 15: `MaterieClasseProvider` — `focus.classe.materie[]` + `materiePerPrincipale`

**Files:**
- Create: `src/application/context-engine/providers/MaterieClasseProvider.ts`
- Create: `src/application/context-engine/mappers/materiePerPrincipaleMapper.ts`
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.materie`, `CduClasse.materiePerPrincipale`)
- Modify: `src/application/context-engine/Recipe.ts:108-117,128-135` (`CLASSE_COMPLETA`, `DOCENTE_COMPLETO` — insert `'materie'` after `'consiglio'`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register `'materie'` token)
- Modify: `src/config/Bootstrap.ts:144-156` (no change needed — `materie` repo already threaded to `ContextEngineFactory.create`)
- Test: `test/unit/application/context-engine/providers/materie-classe-provider.test.ts`
- Test: `test/unit/application/context-engine/mappers/materie-per-principale-mapper.test.ts`

**Interfaces:**
- Consumes: `focus.classe.consiglioDiClasse: DocenteCdcVM[]` (Task 8 — MUST run after `'consiglio'`), `SubjectVM`/`docentiDescrizione` (Task 2), `IMateriaRepository.findByIdCached`.
- Produces:
  ```typescript
  materie?: SubjectVM[]; // each with docenti/docentiDescrizione/hasItp
  materiePerPrincipale?: Array<{ idFittizio: string; nome: string; materie: SubjectVM[] }>;
  ```

- [ ] **Step 1: Write the failing test for the class-catalog aggregation**

```typescript
// test/unit/application/context-engine/providers/materie-classe-provider.test.ts
import { MaterieClasseProvider } from '../../../../../src/application/context-engine/providers/MaterieClasseProvider';
import type { Cdu, DocenteCdcVM } from '../../../../../src/application/context-engine/Cdu';

function docenteCdc(nomeCompleto: string, email: string, sigla: string, isITP = false): DocenteCdcVM {
  return {
    anagrafica: { nome: '', cognome: '', email, genere: 'M', appellativo: 'Prof.', articolo: 'il', coordinatore: 'coordinatore', nomeCompleto, materia: null, appellativoCompleto: `Prof. ${nomeCompleto}`, appellativoCognome: `Prof. ${nomeCompleto}` },
    materie: [{ sigla, nome: sigla, nomeSintetico: sigla, colore1: '', colore2: '', isMateriaPrimaProva: false, isMateriaSecondaProva: false, principale: null, specificita: null, isITP, evoluzione: null }],
    materieDescrizione: sigla,
    materieSigle: sigla,
    ruoli: { isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false, descrizione: [] },
    stato: { isSupplente: false, sostituisce: null },
    tipoArticolazione: null,
    gruppoNome: null,
    isITP,
    flags: { isNotLast: false }
  };
}

describe('MaterieClasseProvider', () => {
  it('groups the class council into a flat, deduped subject catalog with docentiDescrizione/hasItp', () => {
    const cdu = { focus: { classe: { consiglioDiClasse: [docenteCdc('Mario Rossi', 'm@x.it', 'ITA'), docenteCdc('Laura Gialli', 'l@x.it', 'ITA', true)] } } } as unknown as Cdu;
    new MaterieClasseProvider().provide(cdu);
    expect(cdu.focus.classe!.materie).toHaveLength(1);
    const ita = cdu.focus.classe!.materie![0]!;
    expect(ita.docenti?.map((d) => d.nomeCompleto)).toEqual(['Mario Rossi', 'Laura Gialli']);
    expect(ita.docentiDescrizione).toBe('Mario Rossi, Laura Gialli');
    expect(ita.hasItp).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/materie-classe-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `MaterieClasseProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu, DocenteCdcVM } from '../Cdu';
import type { SubjectVM } from '../mappers/subjectVmMapper';
import { docentiDescrizione as joinDocenti } from '../mappers/subjectVmMapper';
import { buildMateriePerPrincipale } from '../mappers/materiePerPrincipaleMapper';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';

/**
 * Builds `focus.classe.materie[]` (02 §2.8, §4.1) — the flat, deduped subject
 * catalog of the class council — plus `materiePerPrincipale`. Runs AFTER
 * `consiglio` (Recipe.ts token order): it derives everything from
 * `focus.classe.consiglioDiClasse`, never re-queries teaching assignments.
 */
export class MaterieClasseProvider implements ContextProvider {
  constructor(private readonly materie?: IMateriaRepository) {}

  provide(cdu: Cdu): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const consiglio = focusClasse.consiglioDiClasse ?? [];
    const materie = this.buildCatalog(consiglio);
    focusClasse.materie = materie;
    if (this.materie !== undefined) {
      focusClasse.materiePerPrincipale = buildMateriePerPrincipale(materie, this.materie);
    }
  }

  private buildCatalog(consiglio: DocenteCdcVM[]): SubjectVM[] {
    const bySubject = new Map<string, SubjectVM & { hasItp: boolean }>();
    for (const docente of consiglio) {
      for (const materia of docente.materie) {
        const key = `${materia.sigla}::${materia.specificita ?? ''}`;
        const existing = bySubject.get(key);
        const docenti = [...(existing?.docenti ?? []), docente.anagrafica];
        bySubject.set(key, {
          ...materia,
          docenti,
          docentiDescrizione: joinDocenti(docenti),
          hasItp: (existing?.hasItp ?? false) || materia.isITP
        });
      }
    }
    return Array.from(bySubject.values());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/materie-classe-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `materiePerPrincipale`**

```typescript
// test/unit/application/context-engine/mappers/materie-per-principale-mapper.test.ts
import { buildMateriePerPrincipale } from '../../../../../src/application/context-engine/mappers/materiePerPrincipaleMapper';
import type { SubjectVM } from '../../../../../src/application/context-engine/mappers/subjectVmMapper';

function subject(sigla: string, nome: string): SubjectVM {
  return { sigla, nome, nomeSintetico: nome, colore1: '', colore2: '', isMateriaPrimaProva: false, isMateriaSecondaProva: false, principale: null, specificita: null, isITP: false, evoluzione: null };
}

describe('buildMateriePerPrincipale', () => {
  it('keeps a non-composite subject as its own single-item group', () => {
    const materie = { findByIdCached: () => null };
    const result = buildMateriePerPrincipale([subject('ITA', 'Italiano')], materie as never);
    expect(result).toEqual([{ idFittizio: 'ITA', nome: 'Italiano', materie: [subject('ITA', 'Italiano')] }]);
  });

  it('groups composite specificità subjects under their base materia name', () => {
    const chitarra = subject('INTERPRETAZIONE.CHITARRA', 'Esecuzione ed interpretazione (chitarra)');
    const flauto = subject('INTERPRETAZIONE.FLAUTO', 'Esecuzione ed interpretazione (flauto)');
    const materie = { findByIdCached: (id: { value: string }) => (id.value === 'INTERPRETAZIONE' ? { nome: 'Esecuzione ed interpretazione' } : null) };
    const result = buildMateriePerPrincipale([chitarra, flauto], materie as never);
    expect(result).toEqual([{ idFittizio: 'INTERPRETAZIONE', nome: 'Esecuzione ed interpretazione', materie: [chitarra, flauto] }]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Expected: FAIL — module not found.

- [ ] **Step 7: Write `materiePerPrincipaleMapper.ts`**

```typescript
import type { SubjectVM } from './subjectVmMapper';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import { MateriaId } from '../../../domain/value-objects/MateriaId';

export interface MateriaPerPrincipaleVM {
  idFittizio: string;
  nome: string;
  materie: SubjectVM[];
}

function baseSigla(sigla: string): string {
  const dot = sigla.indexOf('.');
  return dot === -1 ? sigla : sigla.slice(0, dot);
}

/**
 * Groups `focus.classe.materie[]` by base subject id (02 §2.8): a specificità
 * row's composite id `BASE.SPECIFICA` (MATERIE catalog convention, see
 * `IMateriaRepository.findSpecifiche`) collapses to its base group; a plain
 * subject stays a single-item group under its own id.
 */
export function buildMateriePerPrincipale(materie: SubjectVM[], materiaRepo: IMateriaRepository): MateriaPerPrincipaleVM[] {
  const byBase = new Map<string, SubjectVM[]>();
  for (const materia of materie) {
    const idFittizio = baseSigla(materia.sigla);
    const group = byBase.get(idFittizio) ?? [];
    group.push(materia);
    byBase.set(idFittizio, group);
  }
  return Array.from(byBase.entries()).map(([idFittizio, group]) => {
    const isComposite = group.length > 1 || group[0]!.sigla !== idFittizio;
    const nome = isComposite ? (materiaRepo.findByIdCached(MateriaId.of(idFittizio))?.nome ?? idFittizio) : group[0]!.nome;
    return { idFittizio, nome, materie: group };
  });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/materie-per-principale-mapper.test.ts`
Expected: PASS

- [ ] **Step 9: Add composite-specificità fixture rows** (needed for Task 26's e2e coverage, not for this task's unit tests which use inline fixtures)

Add to `test/fixtures/tables.ts` and `FAKEDB/MATERIE.csv` two rows with `ID = INTERPRETAZIONE.CHITARRA` and `ID = INTERPRETAZIONE.FLAUTO` (both with a plausible `NOME`), plus a base row `ID = INTERPRETAZIONE`. This is the first fixture data ever provided for the composite id pattern (fork investigation confirmed none exists today) — needed by Task 26's online checks.

- [ ] **Step 10: Update `Cdu.ts`, `Recipe.ts`, `ContextEngineFactory.ts`**

`Cdu.ts` — add to `CduClasse`:
```typescript
materie?: SubjectVM[];
materiePerPrincipale?: MateriaPerPrincipaleVM[];
```
(`import type { MateriaPerPrincipaleVM } from './mappers/materiePerPrincipaleMapper';`)

`Recipe.ts:108-117` (`CLASSE_COMPLETA`) — insert `'materie'` right after `'consiglio'`:
```typescript
CLASSE_COMPLETA: ['school', 'class', 'students', 'tutor', 'consiglio', 'materie', 'rappresentanti', 'statistiche', 'pianiPersClasse'],
```
`Recipe.ts:128-135` (`DOCENTE_COMPLETO`) — same insertion after `'consiglio'`:
```typescript
DOCENTE_COMPLETO: ['school', 'class', 'consiglio', 'materie', 'pianiPersClasse', 'pianiPersClasseStorico', 'documentiClasse'],
```
(The provider dependency table comment block at `Recipe.ts:76-105` is refreshed once, covering `materie`/`esame`/`progetti`/`storicoClasse`/`partner` together, in Task 21 Step 6 — no edit to it here.)

`ContextEngineFactory.ts` — add `.registerProvider('materie', new MaterieClasseProvider(materie))` after the `'consiglio'` registration (line 76).

- [ ] **Step 11: Run full unit suite**

Run: `npm test`
Expected: PASS for this area; note any recipe-ordering assertion elsewhere that hardcodes `RECIPES.CLASSE_COMPLETA`'s exact array for Task 26.

- [ ] **Step 12: Commit**

```bash
git add src/application/context-engine/providers/MaterieClasseProvider.ts src/application/context-engine/mappers/materiePerPrincipaleMapper.ts src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts test/fixtures/tables.ts FAKEDB/MATERIE.csv test/unit/application/context-engine/providers/materie-classe-provider.test.ts test/unit/application/context-engine/mappers/materie-per-principale-mapper.test.ts
git commit -m "feat: add focus.classe.materie flat catalog and materiePerPrincipale grouping"
```

---

## PHASE 5 — Esame, Progetti, Storico, Partner (all genuinely new)

### Task 16: `EsameProvider` — `focus.classe.esame` partitions

**Files:**
- Create: `src/application/context-engine/providers/EsameProvider.ts`
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.esame`)
- Modify: `src/application/context-engine/Recipe.ts:108-117` (`CLASSE_COMPLETA` — insert `'esame'` after `'materie'`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register `'esame'`)
- Test: `test/unit/application/context-engine/providers/esame-provider.test.ts`

**Interfaces:**
- Consumes: `focus.classe.materie: SubjectVM[]` (Task 15 — MUST run after `'materie'`; each item already carries `isMateriaPrimaProva`/`isMateriaSecondaProva`/`docenti`/`docentiDescrizione` resolved with the class's indirizzo).
- Produces:
  ```typescript
  esame?: {
    hasEsame: boolean;
    materie: Array<SubjectVM & { prova: 'PRIMA_PROVA' | 'SECONDA_PROVA' }>;
    docenti: Array<PersonVM & { prova: 'PRIMA_PROVA' | 'SECONDA_PROVA'; materie: SubjectVM[] }>;
    materiePrimaProva: SubjectVM[];
    materieSecondaProva: SubjectVM[];
    docentiPrimaProva: PersonVM[];
    docentiSecondaProva: PersonVM[];
  };
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/application/context-engine/providers/esame-provider.test.ts
import { EsameProvider } from '../../../../../src/application/context-engine/providers/EsameProvider';
import type { Cdu, DocenteCdcVM } from '../../../../../src/application/context-engine/Cdu';
import { buildPersonVm } from '../../../../../src/application/context-engine/mappers/personVmMapper';

function subject(sigla: string, prima: boolean, seconda: boolean, docenti: ReturnType<typeof buildPersonVm>[]) {
  return { sigla, nome: sigla, nomeSintetico: sigla, colore1: '', colore2: '', isMateriaPrimaProva: prima, isMateriaSecondaProva: seconda, principale: null, specificita: null, isITP: false, evoluzione: null, docenti, docentiDescrizione: docenti.map((d) => d.nomeCompleto).join(', ') };
}

describe('EsameProvider', () => {
  it('partitions the class catalog into prima/seconda prova materie and docenti', () => {
    const mario = buildPersonVm({ nome: 'Mario', cognome: 'Rossi', email: 'm@x.it', genere: 'M' });
    const cdu = { focus: { classe: { materie: [subject('ITA', true, false, [mario]), subject('STO', false, false, [])] } } } as unknown as Cdu;
    new EsameProvider().provide(cdu);
    const esame = cdu.focus.classe!.esame!;
    expect(esame.hasEsame).toBe(true);
    expect(esame.materiePrimaProva.map((m) => m.sigla)).toEqual(['ITA']);
    expect(esame.materieSecondaProva).toEqual([]);
    expect(esame.docentiPrimaProva.map((d) => d.email)).toEqual(['m@x.it']);
    expect(esame.docenti[0]).toMatchObject({ email: 'm@x.it', prova: 'PRIMA_PROVA', materie: [expect.objectContaining({ sigla: 'ITA' })] });
  });

  it('hasEsame is false and every array is empty when no subject is a prova', () => {
    const cdu = { focus: { classe: { materie: [subject('STO', false, false, [])] } } } as unknown as Cdu;
    new EsameProvider().provide(cdu);
    expect(cdu.focus.classe!.esame).toEqual({ hasEsame: false, materie: [], docenti: [], materiePrimaProva: [], materieSecondaProva: [], docentiPrimaProva: [], docentiSecondaProva: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/esame-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `EsameProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { SubjectVM } from '../mappers/subjectVmMapper';
import type { PersonVM } from '../mappers/personVmMapper';

type Prova = 'PRIMA_PROVA' | 'SECONDA_PROVA';
type MateriaEsameVM = SubjectVM & { prova: Prova };
type DocenteEsameVM = PersonVM & { prova: Prova; materie: SubjectVM[] };

/**
 * Builds `focus.classe.esame` (02 §2.9, §4.1) — pre-split prima/seconda prova
 * partitions so templates never write `| where:'prova','PRIMA_PROVA'`. Runs
 * AFTER `materie` (Recipe.ts token order): reads `isMateriaPrimaProva`/
 * `isMateriaSecondaProva`, already resolved per the class's indirizzo by
 * MaterieClasseProvider/TeachingCouncilProjection.
 */
export class EsameProvider implements ContextProvider {
  provide(cdu: Cdu): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const catalogo = focusClasse.materie ?? [];

    const materiePrimaProva = catalogo.filter((m) => m.isMateriaPrimaProva);
    const materieSecondaProva = catalogo.filter((m) => m.isMateriaSecondaProva);
    const materie: MateriaEsameVM[] = [
      ...materiePrimaProva.map((m) => ({ ...m, prova: 'PRIMA_PROVA' as const })),
      ...materieSecondaProva.map((m) => ({ ...m, prova: 'SECONDA_PROVA' as const }))
    ];

    focusClasse.esame = {
      hasEsame: materie.length > 0,
      materie,
      docenti: this.buildDocenti(materiePrimaProva, 'PRIMA_PROVA').concat(this.buildDocenti(materieSecondaProva, 'SECONDA_PROVA')),
      materiePrimaProva,
      materieSecondaProva,
      docentiPrimaProva: this.dedupeDocenti(materiePrimaProva),
      docentiSecondaProva: this.dedupeDocenti(materieSecondaProva)
    };
  }

  private dedupeDocenti(materie: SubjectVM[]): PersonVM[] {
    const seen = new Map<string, PersonVM>();
    for (const materia of materie) {
      for (const docente of materia.docenti ?? []) {
        if (docente.email !== null) seen.set(docente.email, docente);
      }
    }
    return Array.from(seen.values());
  }

  private buildDocenti(materie: SubjectVM[], prova: Prova): DocenteEsameVM[] {
    const byEmail = new Map<string, DocenteEsameVM>();
    for (const materia of materie) {
      for (const docente of materia.docenti ?? []) {
        const key = docente.email ?? docente.nomeCompleto;
        const existing = byEmail.get(key);
        byEmail.set(key, { ...docente, prova, materie: [...(existing?.materie ?? []), materia] });
      }
    }
    return Array.from(byEmail.values());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/esame-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Update `Cdu.ts`, `Recipe.ts`, `ContextEngineFactory.ts`**

`Cdu.ts` — add to `CduClasse`:
```typescript
esame?: {
  hasEsame: boolean;
  materie: Array<SubjectVM & { prova: 'PRIMA_PROVA' | 'SECONDA_PROVA' }>;
  docenti: Array<PersonVM & { prova: 'PRIMA_PROVA' | 'SECONDA_PROVA'; materie: SubjectVM[] }>;
  materiePrimaProva: SubjectVM[];
  materieSecondaProva: SubjectVM[];
  docentiPrimaProva: PersonVM[];
  docentiSecondaProva: PersonVM[];
};
```

`Recipe.ts:108-117` (`CLASSE_COMPLETA`) — insert `'esame'` after `'materie'`:
```typescript
CLASSE_COMPLETA: ['school', 'class', 'students', 'tutor', 'consiglio', 'materie', 'esame', 'progetti', 'rappresentanti', 'statistiche', 'pianiPersClasse'],
```
(`'progetti'` inserted here too, ahead of Task 17 — both are independent of each other, order between them doesn't matter, only that both come after `'materie'`.)

`ContextEngineFactory.ts` — add `.registerProvider('esame', new EsameProvider())` after `'materie'`.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/providers/EsameProvider.ts src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/context-engine/providers/esame-provider.test.ts
git commit -m "feat: add EsameProvider with precomputed prima/seconda prova partitions"
```

---

### Task 17: `ProgettiProvider` — `focus.classe.progetti[]`

**Files:**
- Modify: `src/domain/entities/Progetto.ts:19` (add a public `getOre(): number` getter — `ore` is currently private with no accessor)
- Create: `src/application/context-engine/providers/ProgettiProvider.ts`
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.progetti`, `CduClasse.hasProgetti`)
- Modify: `src/application/context-engine/Recipe.ts:108-117` (`'progetti'` already inserted by Task 16, Step 5)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register `'progetti'`)
- Modify: `src/config/Bootstrap.ts:110-127` (register `progetti: () => new ProgettoRepository(deps.db)` in the container; thread it into the `contextBuilder` registration at line 144-156)
- Test: `test/unit/domain/entities/progetto.test.ts` (extend for `getOre`)
- Test: `test/unit/application/context-engine/providers/progetti-provider.test.ts`

**Interfaces:**
- Consumes: `ProgettoRepository.findByClasse(classe): Progetto[]` (`ProgettoRepository.ts:23-26`, unchanged), `Progetto.tipo`/`.nome`/`.referente`/`.getOre()`(new)/`.getOreASLEffettive()`/`.isASL()` (`Progetto.ts`), `IDocenteRepository.findById`, `buildPersonVm`/`buildPersonVmFromDocente` (Task 1), `tipoProgettoLabel` (Task 3).
- Produces:
  ```typescript
  export interface ProgettoVM {
    tipo: TipoProgetto;
    tipoLabel: string;
    nome: string;
    referente: PersonVM;
    ore: number;
    oreAsl: number;
    isAsl: boolean;
  }
  hasProgetti: boolean;
  progetti: ProgettoVM[];
  ```

- [ ] **Step 1: Write the failing test for `Progetto.getOre()`**

```typescript
// extend test/unit/domain/entities/progetto.test.ts
it('exposes ORE via getOre()', () => {
  const progetto = Progetto.fromData({ [COL_PROGETTI.CLASSE]: '5A', [COL_PROGETTI.TIPO]: 'ASL', [COL_PROGETTI.NOME]: 'x', [COL_PROGETTI.ORE]: 30, [COL_PROGETTI.ORE_ASL]: 30 });
  expect(progetto.getOre()).toBe(30);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/entities/progetto.test.ts`
Expected: FAIL — `getOre` does not exist.

- [ ] **Step 3: Add the getter to `Progetto.ts:19`**

```typescript
/** ORE — total planned hours (ref 04 §13). */
getOre(): number {
  return this.ore;
}
```
(Insert alongside `isASL()`/`getOreASLEffettive()`, after line 42.)

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Write the failing test for `ProgettiProvider`**

```typescript
// test/unit/application/context-engine/providers/progetti-provider.test.ts
import { ProgettiProvider } from '../../../../../src/application/context-engine/providers/ProgettiProvider';
import { Progetto } from '../../../../../src/domain/entities/Progetto';
import { COL_PROGETTI } from '../../../../../src/config/schema';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';

describe('ProgettiProvider', () => {
  it('builds progetti with resolved docente referente and tipoLabel', () => {
    const progetto = Progetto.fromData({ [COL_PROGETTI.CLASSE]: '5A', [COL_PROGETTI.TIPO]: 'ASL', [COL_PROGETTI.NOME]: 'PCTO Biblioteca', [COL_PROGETTI.REFERENTE]: 'anna.ferrari@scuola.edu.it', [COL_PROGETTI.ORE]: 30, [COL_PROGETTI.ORE_ASL]: 30 });
    const progetti = { findByClasse: () => [progetto] };
    const docenti = { findById: () => ({ nome: 'Anna', cognome: 'Ferrari', genere: 'F', id: 'anna.ferrari@scuola.edu.it' }) };
    const provider = new ProgettiProvider(progetti as never, docenti as never);
    const cdu = { focus: { classe: {} } } as unknown as Cdu;
    // getClasseEntity(cdu) reads tech.entita.classe — set via setClasseEntity in the real flow;
    // for this unit test, stub getClasseEntity or wire tech.entita.classe directly per the existing pattern in classe-provider.test.ts.
    provider.provide(cdu);
    expect(cdu.focus.classe!.hasProgetti).toBe(true);
    expect(cdu.focus.classe!.progetti![0]).toMatchObject({ tipo: 'ASL', tipoLabel: 'PCTO/ASL', nome: 'PCTO Biblioteca', ore: 30, oreAsl: 30, isAsl: true });
    expect(cdu.focus.classe!.progetti![0]!.referente.appellativoCompleto).toBe('Prof.ssa Anna Ferrari');
  });

  it('treats an unresolved referente as an external expert (raw name, no email/genere)', () => {
    const progetto = Progetto.fromData({ [COL_PROGETTI.CLASSE]: '5A', [COL_PROGETTI.TIPO]: 'ALTRO', [COL_PROGETTI.NOME]: 'Corso', [COL_PROGETTI.REFERENTE]: 'Studio Esterno XYZ', [COL_PROGETTI.ORE]: 10, [COL_PROGETTI.ORE_ASL]: 0 });
    const progetti = { findByClasse: () => [progetto] };
    const docenti = { findById: () => null };
    const provider = new ProgettiProvider(progetti as never, docenti as never);
    const cdu = { focus: { classe: {} } } as unknown as Cdu;
    provider.provide(cdu);
    expect(cdu.focus.classe!.progetti![0]!.referente).toEqual(expect.objectContaining({ nomeCompleto: 'Studio Esterno XYZ', genere: null, email: null }));
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/progetti-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write `ProgettiProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { Progetto } from '../../../domain/entities/Progetto';
import type { ProgettoRepository } from '../../../infrastructure/repositories/ProgettoRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { PersonVM } from '../mappers/personVmMapper';
import { buildPersonVm, buildPersonVmFromDocente } from '../mappers/personVmMapper';
import { tipoProgettoLabel } from '../mappers/labels';
import { getClasseEntity } from '../techEntities';

export interface ProgettoVM {
  tipo: Progetto['tipo'];
  tipoLabel: string;
  nome: string;
  referente: PersonVM;
  ore: number;
  oreAsl: number;
  isAsl: boolean;
}

/**
 * Builds `focus.classe.progetti[]`/`hasProgetti` from PROGETTI (02 §2.10,
 * §4.1). `REFERENTE` is a free-text cell that is usually a DOCENTI email but
 * may name an external expert — resolved to PersonVM either way, degrading
 * to an external-expert PersonVM (no email/genere) when the lookup misses.
 */
export class ProgettiProvider implements ContextProvider {
  constructor(
    private readonly progetti: ProgettoRepository,
    private readonly docenti: IDocenteRepository
  ) {}

  provide(cdu: Cdu): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classe = getClasseEntity(cdu);
    const rows = this.progetti.findByClasse(classe);
    const progetti: ProgettoVM[] = rows.map((p) => ({
      tipo: p.tipo,
      tipoLabel: tipoProgettoLabel(p.tipo),
      nome: p.nome,
      referente: this.resolveReferente(p.referente),
      ore: p.getOre(),
      oreAsl: p.getOreASLEffettive(),
      isAsl: p.isASL()
    }));
    focusClasse.hasProgetti = progetti.length > 0;
    focusClasse.progetti = progetti;
  }

  private resolveReferente(raw: string): PersonVM {
    const docente = this.docenti.findById(raw);
    if (docente !== null) return buildPersonVmFromDocente(docente);
    return buildPersonVm({ nome: raw, cognome: null, email: null, genere: null });
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/progetti-provider.test.ts`
Expected: PASS

- [ ] **Step 9: Wire the new repository into `Bootstrap.ts`**

At `Bootstrap.ts:110-127`, add: `c.register('progetti', () => new ProgettoRepository(deps.db));`
At `Bootstrap.ts:144-156` (`contextBuilder` registration), add: `progetti: container.get<ProgettoRepository>('progetti'),`
Import `ProgettoRepository` from `'../infrastructure/repositories/ProgettoRepository'` at the top.

- [ ] **Step 10: Update `Cdu.ts`, `ContextEngineDependencies`, `ContextEngineFactory.ts`**

`Cdu.ts` — add to `CduClasse`: `hasProgetti?: boolean; progetti?: ProgettoVM[];` (`import type { ProgettoVM } from './providers/ProgettiProvider';`).

`ContextEngineFactory.ts` — add `progetti: ProgettoRepository;` to `ContextEngineDependencies` and `.registerProvider('progetti', new ProgettiProvider(progetti, docenti))` (after `'materie'`/`'esame'`, per the recipe order already updated in Task 16 Step 5).

- [ ] **Step 11: Run full unit suite**

Run: `npm test`
Expected: PASS for this area.

- [ ] **Step 12: Commit**

```bash
git add src/domain/entities/Progetto.ts src/application/context-engine/providers/ProgettiProvider.ts src/application/context-engine/Cdu.ts src/application/context-engine/ContextEngineFactory.ts src/config/Bootstrap.ts test/unit/domain/entities/progetto.test.ts test/unit/application/context-engine/providers/progetti-provider.test.ts
git commit -m "feat: add ProgettiProvider building focus.classe.progetti with resolved referente"
```

---

### Task 18: `StudentStoricoVM` — `focus.alunno.storico` (moved out of `didattica`)

**Files:**
- Create: `src/application/context-engine/mappers/storicoMapper.ts`
- Modify: `src/application/context-engine/providers/StoricoProvider.ts` (full file, 28 lines)
- Modify: `src/application/context-engine/Cdu.ts:195-243` (`CduAlunno` — remove `didattica.storico`, add sibling `storico`)
- Test: `test/unit/application/context-engine/mappers/storico-mapper.test.ts`
- Test: `test/unit/application/context-engine/providers/storico-provider.test.ts` (extend or create)

**Interfaces:**
- Consumes: `StoricoAlunniService.perAlunno(email, profondita): AnnoAlunnoStorico[]` (`StoricoAlunniService.ts:50-92`, unchanged — `AnnoAlunnoStorico = { anno, classe, esito, carenze, piani: string[] }`, index 0 = most recent prior year), `tipoPianoLabel` (Task 3).
- Produces (breaking path move — `focus.alunno.didattica.storico` no longer exists, becomes `focus.alunno.storico`):
  ```typescript
  export interface StudentStoricoVM {
    anni: Array<{ annoScolastico: string; classe: string; esito: Esito }>;
    pianiPrimoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
    pianiSecondoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
    bocciature: Array<{ annoScolastico: string; classe: string }>;
    hasBocciature: boolean;
  }
  export function buildStudentStoricoVm(anni: AnnoAlunnoStorico[]): StudentStoricoVM;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/application/context-engine/mappers/storico-mapper.test.ts
import { buildStudentStoricoVm } from '../../../../../src/application/context-engine/mappers/storicoMapper';
import type { AnnoAlunnoStorico } from '../../../../../src/application/storico/StoricoAlunniService';

describe('buildStudentStoricoVm', () => {
  it('maps anni, splits piani into primo/secondo anno precedente with tipoLabel, and flags bocciature', () => {
    const anni: AnnoAlunnoStorico[] = [
      { anno: '2024-2025', classe: '4A-LC', esito: 'NON_PROMOSSO', carenze: [], piani: ['PDP_DSA'] },
      { anno: '2023-2024', classe: '4A-LC', esito: 'PROMOSSO', carenze: [], piani: [] }
    ];
    const vm = buildStudentStoricoVm(anni);
    expect(vm.anni).toEqual([
      { annoScolastico: '2024-2025', classe: '4A-LC', esito: 'NON_PROMOSSO' },
      { annoScolastico: '2023-2024', classe: '4A-LC', esito: 'PROMOSSO' }
    ]);
    expect(vm.pianiPrimoAnnoPrecedente).toEqual([{ tipo: 'PDP_DSA', tipoLabel: 'PDP DSA' }]);
    expect(vm.pianiSecondoAnnoPrecedente).toEqual([]);
    expect(vm.bocciature).toEqual([{ annoScolastico: '2024-2025', classe: '4A-LC' }]);
    expect(vm.hasBocciature).toBe(true);
  });

  it('returns hasBocciature false and empty piani arrays for an empty history', () => {
    const vm = buildStudentStoricoVm([]);
    expect(vm).toEqual({ anni: [], pianiPrimoAnnoPrecedente: [], pianiSecondoAnnoPrecedente: [], bocciature: [], hasBocciature: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/storico-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `storicoMapper.ts`**

```typescript
import type { AnnoAlunnoStorico } from '../../storico/StoricoAlunniService';
import { tipoPianoLabel } from './labels';
import type { TipoPiano } from '../../../domain/value-objects/enums';

export interface StudentStoricoVM {
  anni: Array<{ annoScolastico: string; classe: string; esito: AnnoAlunnoStorico['esito'] }>;
  pianiPrimoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  pianiSecondoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  bocciature: Array<{ annoScolastico: string; classe: string }>;
  hasBocciature: boolean;
}

/**
 * Builds StudentStoricoVM (02 §8.6) from StoricoAlunniService.perAlunno's raw
 * per-year rows — index 0 is the immediately-prior year, index 1 two years
 * back (matches `pianiPrimoAnnoPrecedente`/`pianiSecondoAnnoPrecedente`).
 */
export function buildStudentStoricoVm(anni: AnnoAlunnoStorico[]): StudentStoricoVM {
  const mapped = anni.map((a) => ({ annoScolastico: a.anno, classe: a.classe ?? '', esito: a.esito }));
  const bocciature = mapped
    .filter((a) => a.esito === 'NON_PROMOSSO')
    .map(({ annoScolastico, classe }) => ({ annoScolastico, classe }));
  const pianiFor = (index: number): Array<{ tipo: string; tipoLabel: string }> =>
    (anni[index]?.piani ?? []).map((tipo) => ({ tipo, tipoLabel: tipoPianoLabel(tipo as TipoPiano) }));
  return {
    anni: mapped,
    pianiPrimoAnnoPrecedente: pianiFor(0),
    pianiSecondoAnnoPrecedente: pianiFor(1),
    bocciature,
    hasBocciature: bocciature.length > 0
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/storico-mapper.test.ts`
Expected: PASS

- [ ] **Step 5: Update `CduAlunno` in `Cdu.ts:195-243`**

Remove `storico?: LazyRef<AnnoAlunnoStorico[]>;` from inside `didattica` (was at the end of the `didattica` block). Add a sibling field on `CduAlunno` itself:
```typescript
export interface CduAlunno {
  anagrafica: { nomeCompleto: string; email: string };
  status: { religione: string; religioneLabel: string; isBes: boolean; isRipetente: boolean; isRappresentante: boolean };
  curriculum: CurriculumVM[];
  classe: { nome: string; indirizzoSigla: string; indirizzoNome: string };
  consiglioDiClasseFiltrato?: DocenteCdcVM[];
  storico?: LazyRef<StudentStoricoVM>;
  didattica: {
    // ...carenze/asl/piani/documenti/pianiPersonalizzati unchanged, minus the removed `storico` field...
  };
}
```
Add `import type { StudentStoricoVM } from './mappers/storicoMapper';`. Keep `AnnoAlunnoStorico` imported only if still referenced elsewhere in the file (check before removing the import).

- [ ] **Step 6: Update `StoricoProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoAlunniService } from '../../storico/StoricoAlunniService';
import { buildStudentStoricoVm } from '../mappers/storicoMapper';

/**
 * Lazy loader for the focused student's previous-years data (02 §4.2, §8.6,
 * 13 §2). When `includiStorico` is false the provider is skipped entirely —
 * no historical database is even opened. When true, attaches
 * `focus.alunno.storico` as a `LazyRef<StudentStoricoVM>`: the actual
 * StoricoAlunniService query and VM mapping run only on first read.
 */
export class StoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniStorico;
    const service = new StoricoAlunniService(this.databases);
    alunno.storico = new LazyRef(() => buildStudentStoricoVm(service.perAlunno(email, profondita)));
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/storico-provider.test.ts`
Expected: PASS (update any existing assertion that reads `focus.alunno.didattica.storico` to `focus.alunno.storico`, and that expects the raw `AnnoAlunnoStorico[]` shape to instead expect `StudentStoricoVM`).

- [ ] **Step 8: Search for other readers of the old path**

Run: `grep -rn "didattica.storico\|didattica\.storico" src test | grep -v node_modules`
Expected matches: `StoricoProvider.ts` (just fixed), possibly `Cdu.ts` doc comments, and box-renderer/template code under `src/application/services` or `src/infrastructure` reading `focus.alunno.didattica.storico` for a "storico" content box — if found, update the read path to `focus.alunno.storico` and adjust for the new `StudentStoricoVM` shape (was raw `AnnoAlunnoStorico[]`) in the same commit. Note any such site for Task 27's final sweep if it's deep in box-rendering logic out of this task's direct scope.

- [ ] **Step 9: Commit**

```bash
git add src/application/context-engine/mappers/storicoMapper.ts src/application/context-engine/providers/StoricoProvider.ts src/application/context-engine/Cdu.ts test/unit/application/context-engine/mappers/storico-mapper.test.ts test/unit/application/context-engine/providers/storico-provider.test.ts
git commit -m "feat: focus.alunno.storico moves out of didattica and exposes StudentStoricoVM"
```

---

### Task 19: `ClasseStoricoVM` — `focus.classe.storico`

**Files:**
- Modify: `src/domain/repositories/IClasseRepository.ts:75` (promote `getStorico(classe: Classe): ClasseId[]` from the concrete `ClasseRepository.ts:216` onto the interface)
- Create: `src/application/context-engine/mappers/statisticheAlunniMapper.ts` (extracted from `StatisticheProvider.ts:33-58`)
- Modify: `src/application/context-engine/providers/StatisticheProvider.ts` (reuse the extracted function — pure refactor, no behavior change)
- Create: `src/application/context-engine/providers/StoricoClasseProvider.ts`
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.storico`)
- Modify: `src/application/context-engine/Recipe.ts:108-117` (`CLASSE_COMPLETA` — insert `'storicoClasse'` after `'statistiche'`, gated by `includiStorico` inside the provider like the existing `storico`/`documentiStorico` tokens)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register `'storicoClasse'`)
- Test: `test/unit/application/context-engine/mappers/statistiche-alunni-mapper.test.ts`
- Test: `test/unit/application/context-engine/providers/storico-classe-provider.test.ts`

**Interfaces:**
- Consumes: `StoricoDatabaseProvider.anniStorici(profondita): Array<{anno: string; db: RepositoryDatabase}>` (already used by `StoricoAlunniService.ts:52`/`StoricoClassiService.ts:30`), `IClasseRepository.getStorico` (promoted in Step 1), `ProgettoRepository` (Task 17), `computeStatisticheAlunni` (extracted in Step 3).
- Produces:
  ```typescript
  export interface ClasseStoricoVM {
    statistiche: Array<{ annoScolastico: string; classe: string; statistiche: StatisticheAlunniVM }>;
    progetti: Array<{ annoScolastico: string; classe: string; progetti: ProgettoVM[] }>;
  }
  ```

- [ ] **Step 1: Promote `getStorico` onto `IClasseRepository`**

In `IClasseRepository.ts`, add to the "Articolazione" section (after line 51 `getClasseParent`):
```typescript
/** Ordered CSV of the class's own historical names, index 0 = immediately-prior year (ref 01, `CLASSI.STORICO`). */
getStorico(classe: Classe): ClasseId[];
```
`ClasseRepository.ts:216` already implements this method with a matching signature — no infrastructure change needed, only the interface addition. Run `npm run typecheck` after this step to confirm no other `IClasseRepository` implementer (test fakes) is missing the method; if a fake repository under `test/fakes/` fails to satisfy the interface, add a matching `getStorico` implementation there too (mirroring `ClasseRepository.ts:216`'s logic against the fake's in-memory data, or returning `[]` if the fake never modeled `CLASSI.STORICO`).

- [ ] **Step 2: Write the failing test for the extracted statistics function**

```typescript
// test/unit/application/context-engine/mappers/statistiche-alunni-mapper.test.ts
import { computeStatisticheAlunni } from '../../../../../src/application/context-engine/mappers/statisticheAlunniMapper';
import { Alunno } from '../../../../../src/domain/entities/Alunno';
import { COL_ALUNNI } from '../../../../../src/config/schema';
import { TipoPiano } from '../../../../../src/domain/value-objects/enums';

describe('computeStatisticheAlunni', () => {
  it('counts totale/conPianiDidattici/conBes/conDsa/ripetenti/rappresentanti over the given students', () => {
    const marco = Alunno.fromData({ [COL_ALUNNI.EMAIL]: 'marco@x.it', [COL_ALUNNI.RIPETENTE]: true });
    const anna = Alunno.fromData({ [COL_ALUNNI.EMAIL]: 'anna@x.it', [COL_ALUNNI.RAPPR_STUD]: true });
    const alunni = {
      getPiani: (a: typeof marco) =>
        a.id === 'marco@x.it' ? [{ isBES: () => true, tipo: TipoPiano.PDP_DSA }] : []
    };
    const stats = computeStatisticheAlunni([marco, anna], alunni as never);
    expect(stats).toEqual({ totale: 2, conPianiDidattici: 1, conBes: 1, conDsa: 1, ripetenti: 1, rappresentanti: 1 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/statistiche-alunni-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Extract `computeStatisticheAlunni` and refactor `StatisticheProvider`**

```typescript
// src/application/context-engine/mappers/statisticheAlunniMapper.ts
import type { Alunno } from '../../../domain/entities/Alunno';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { TipoPiano } from '../../../domain/value-objects/enums';

export interface StatisticheAlunniVM {
  totale: number;
  conPianiDidattici: number;
  conBes: number;
  conDsa: number;
  ripetenti: number;
  rappresentanti: number;
}

/** Shared aggregate-count formula (02 §4.1/§8.6) — used for both the current year (StatisticheProvider) and each historical year (StoricoClasseProvider). */
export function computeStatisticheAlunni(attivi: Alunno[], alunni: IAlunnoRepository): StatisticheAlunniVM {
  let conPianiDidattici = 0,
    conBes = 0,
    conDsa = 0,
    ripetenti = 0,
    rappresentanti = 0;
  for (const a of attivi) {
    const piani = alunni.getPiani(a);
    if (piani.length > 0) conPianiDidattici++;
    if (piani.some((p) => p.isBES())) conBes++;
    if (piani.some((p) => p.tipo === TipoPiano.PDP_DSA)) conDsa++;
    if (a.isRipetente()) ripetenti++;
    if (a.isRappresentante()) rappresentanti++;
  }
  return { totale: attivi.length, conPianiDidattici, conBes, conDsa, ripetenti, rappresentanti };
}
```

In `StatisticheProvider.ts:33-58`, replace the manual loop body of `classStats` with:
```typescript
private classStats(cdu: Cdu): void {
  const studenti = cdu.focus.classe?.studenti;
  if (studenti === undefined) return;
  const attivi = studentiDellaClasse(this.classi, getClasseEntity(cdu), true);
  studenti.statistiche = computeStatisticheAlunni(attivi, this.alunni);
}
```
Add `import { computeStatisticheAlunni } from '../mappers/statisticheAlunniMapper';`; remove the now-unused `TipoPiano` import if nothing else in the file uses it.

- [ ] **Step 5: Run test to verify it passes; run `StatisticheProvider`'s existing tests to confirm the refactor is behavior-preserving**

Run: `npx jest --config jest.config.cjs --testPathPattern "statistiche"`
Expected: PASS, identical assertions to before the refactor (this step is pure extraction, not new behavior).

- [ ] **Step 6: Write the failing test for `StoricoClasseProvider`**

```typescript
// test/unit/application/context-engine/providers/storico-classe-provider.test.ts
it('builds ClasseStoricoVM.statistiche/progetti per historical year, using CLASSI.STORICO to resolve each year\'s class name', () => {
  // wire a StoricoDatabaseProvider fake exposing anniStorici(profondita) -> [{anno: '2024-2025', db: fakeHistoricalDb}]
  // where fakeHistoricalDb seeds a class named '4AB-LC-LS' with 2 active students, 1 project
  const classi = { getStorico: () => [ClasseId.of('4AB-LC-LS')] };
  const provider = new StoricoClasseProvider(fakeDatabases, classi as never);
  const cdu = makeCdu(); // wire tech.entita.classe + focus.classe
  provider.provide(cdu, params, makeOptions({ includiStorico: true, profonditaAnniStorico: 1 }));
  const storico = cdu.focus.classe!.storico as never; // LazyRef — force read per the existing LazyRef test helper pattern
  expect(storico().statistiche).toEqual([{ annoScolastico: '2024-2025', classe: '4AB-LC-LS', statistiche: expect.objectContaining({ totale: 2 }) }]);
  expect(storico().progetti).toEqual([{ annoScolastico: '2024-2025', classe: '4AB-LC-LS', progetti: expect.any(Array) }]);
});
```

Before finalizing this test's fixture wiring, read one existing `LazyRef`-based provider test (e.g. `storico-provider.test.ts` from Task 18, or `documenti-storico-provider.test.ts`) to copy the established pattern for faking `StoricoDatabaseProvider.anniStorici()` — do not invent a new fake shape.

- [ ] **Step 7: Run test to verify it fails**

Expected: FAIL — module not found.

- [ ] **Step 8: Write `StoricoClasseProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { DocenteRepository } from '../../../infrastructure/repositories/DocenteRepository';
import { ProgettoRepository } from '../../../infrastructure/repositories/ProgettoRepository';
import { computeStatisticheAlunni } from '../mappers/statisticheAlunniMapper';
import { buildPersonVm, buildPersonVmFromDocente } from '../mappers/personVmMapper';
import type { PersonVM } from '../mappers/personVmMapper';
import { tipoProgettoLabel } from '../mappers/labels';
import { getClasseEntity } from '../techEntities';
import type { ProgettoVM } from './ProgettiProvider';

export interface ClasseStoricoVM {
  statistiche: Array<{
    annoScolastico: string;
    classe: string;
    statistiche: ReturnType<typeof computeStatisticheAlunni>;
  }>;
  progetti: Array<{ annoScolastico: string; classe: string; progetti: ProgettoVM[] }>;
}

/**
 * Builds `focus.classe.storico` (02 §2.11, §8.6) — per-historical-year student
 * statistics and projects for the focused class. `CLASSI.STORICO` (index 0 =
 * immediately-prior year) gives the class's own name in each historical
 * database, opened lazily via `StoricoDatabaseProvider.anniStorici` (the same
 * mechanism `StoricoAlunniService`/`StoricoClassiService` already use).
 */
export class StoricoClasseProvider implements ContextProvider {
  constructor(
    private readonly databases: StoricoDatabaseProvider,
    private readonly classi: IClasseRepository
  ) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classe = getClasseEntity(cdu);
    const storicoNomi = this.classi.getStorico(classe);
    const profondita = options.profonditaAnniStorico;

    focusClasse.storico = new LazyRef(() => {
      const statistiche: ClasseStoricoVM['statistiche'] = [];
      const progetti: ClasseStoricoVM['progetti'] = [];
      const anni = this.databases.anniStorici(profondita);
      for (let i = 0; i < anni.length; i++) {
        const { anno, db } = anni[i]!;
        const nomeStorico = storicoNomi[i];
        if (nomeStorico === undefined) continue;
        const classiStoriche = new ClasseRepository(db);
        const classeStorica = classiStoriche.findById(nomeStorico);
        if (classeStorica === null) continue;
        const alunniStorici = new AlunnoRepository(db);
        const attivi = classiStoriche.getStudenti(classeStorica, true);
        statistiche.push({ annoScolastico: anno, classe: nomeStorico.value, statistiche: computeStatisticheAlunni(attivi, alunniStorici) });

        const docentiStorici = new DocenteRepository(db);
        const progettiStorici = new ProgettoRepository(db);
        const progettiVm = progettiStorici.findByClasse(classeStorica).map((p) => ({
          tipo: p.tipo,
          tipoLabel: tipoProgettoLabel(p.tipo),
          nome: p.nome,
          referente: this.resolveReferente(p.referente, docentiStorici),
          ore: p.getOre(),
          oreAsl: p.getOreASLEffettive(),
          isAsl: p.isASL()
        }));
        progetti.push({ annoScolastico: anno, classe: nomeStorico.value, progetti: progettiVm });
      }
      return { statistiche, progetti };
    });
  }

  private resolveReferente(raw: string, docenti: DocenteRepository): PersonVM {
    const docente = docenti.findById(raw);
    return docente === null ? buildPersonVm({ nome: raw, cognome: null, email: null, genere: null }) : buildPersonVmFromDocente(docente);
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/storico-classe-provider.test.ts`
Expected: PASS

- [ ] **Step 10: Update `Cdu.ts`, `Recipe.ts`, `ContextEngineFactory.ts`**

`Cdu.ts` — add to `CduClasse`: `storico?: LazyRef<ClasseStoricoVM>;` (`import type { ClasseStoricoVM } from './providers/StoricoClasseProvider';`).

`Recipe.ts:108-117` (`CLASSE_COMPLETA`) — insert `'storicoClasse'` after `'statistiche'`:
```typescript
CLASSE_COMPLETA: ['school', 'class', 'students', 'tutor', 'consiglio', 'materie', 'esame', 'progetti', 'rappresentanti', 'statistiche', 'storicoClasse', 'pianiPersClasse'],
```

`ContextEngineFactory.ts` — add `storicoDb`/`classi` dependencies (both already available in the factory) and `.registerProvider('storicoClasse', new StoricoClasseProvider(storicoDb, classi))` after `'statistiche'`.

- [ ] **Step 11: Run full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/domain/repositories/IClasseRepository.ts src/application/context-engine/mappers/statisticheAlunniMapper.ts src/application/context-engine/providers/StatisticheProvider.ts src/application/context-engine/providers/StoricoClasseProvider.ts src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/context-engine/mappers/statistiche-alunni-mapper.test.ts test/unit/application/context-engine/providers/storico-classe-provider.test.ts test/unit/application/context-engine/providers/statistiche-provider.test.ts
git commit -m "feat: add StoricoClasseProvider building focus.classe.storico with per-year statistics and progetti"
```

---

### Task 20: `ContinuitaVM` — teaching continuity on `focus.classe.materie[].continuita`

**Files:**
- Modify: `src/application/storico/StoricoClassiService.ts:6-9,40-46` (`DocenteMateriaStorico` — add `isItp: boolean`, currently discarded from `classi.getMaterieDelDocente`'s `{sigla, isItp}` result)
- Create: `src/application/context-engine/mappers/continuitaMapper.ts`
- Modify: `src/application/context-engine/mappers/subjectVmMapper.ts` (add the `continuita?: ContinuitaVM` field to `SubjectVM`, declared in Task 2 without it since `ContinuitaVM` didn't exist yet)
- Modify: `src/application/context-engine/providers/MaterieClasseProvider.ts` (attach `continuita` per subject when `includiStorico`)
- Test: `test/unit/application/storico/storico-classi-service.test.ts` (extend for `isItp`)
- Test: `test/unit/application/context-engine/mappers/continuita-mapper.test.ts`

**Interfaces:**
- Consumes: `StoricoClassiService.perClasse(storico: ClasseId[], profondita): AnnoClasseStorico[]` (`StoricoClassiService.ts:24-52`, extended in Step 1), `reconcileSigla(siglaStorica, annoCorso, materie): string` (`reconcileSigla.ts:14-26`, unchanged — reconciles a historical sigla to its current canonical id for a given course year), `IClasseRepository.getStorico` (Task 19), `IDocenteRepository.findById`.
- Produces:
  ```typescript
  export interface ContinuitaVM {
    docentiAnniPrecedenti: Array<{ annoIndietro: number; annoScolastico: string; titolare: PersonVM | null; itp: PersonVM | null }>;
    continuitaUltimiTreAnni: boolean;
    continuitaUltimiDueAnni: boolean;
    continuitaUltimiTreAnniItp?: boolean;
    continuitaUltimiDueAnniItp?: boolean;
  }
  export function buildContinuita(input: BuildContinuitaInput): ContinuitaVM;
  ```

- [ ] **Step 0: Add the `continuita` field to `SubjectVM`**

Task 2's `SubjectVM` interface (`subjectVmMapper.ts`) was declared before `ContinuitaVM` existed. Add it now:
```typescript
import type { ContinuitaVM } from './continuitaMapper';

export interface SubjectVM {
  // ...sigla, nome, nomeSintetico, colore1, colore2, isMateriaPrimaProva, isMateriaSecondaProva,
  // principale, specificita, isITP, hasItp?, evoluzione, docenti?, docentiDescrizione? (Task 2, unchanged)...
  continuita?: ContinuitaVM;
}
```
(`continuitaMapper.ts` imports only from `personVmMapper.ts` and `../../storico/*` — no import cycle with `subjectVmMapper.ts`.)

- [ ] **Step 1: Extend `DocenteMateriaStorico` with `isItp`**

In `StoricoClassiService.ts:6-9`:
```typescript
export interface DocenteMateriaStorico {
  docenteEmail: string;
  materia: string;
  isItp: boolean;
}
```
In the `perClasse` loop (`StoricoClassiService.ts:42-45`), keep the field that was being discarded:
```typescript
for (const m of classi.getMaterieDelDocente(classe, d.id ?? '')) {
  docenti.push({ docenteEmail: d.id ?? '', materia: m.sigla, isItp: m.isItp });
}
```
Run: `npx jest --config jest.config.cjs --testPathPattern storico-classi-service` — fix the existing test's expected object literals to include `isItp` (this is a pure additive field, existing assertions using `toMatchObject` are unaffected; ones using `toEqual` need the new field added).

- [ ] **Step 2: Write the failing test for `buildContinuita`**

```typescript
// test/unit/application/context-engine/mappers/continuita-mapper.test.ts
import { buildContinuita } from '../../../../../src/application/context-engine/mappers/continuitaMapper';
import type { AnnoClasseStorico } from '../../../../../src/application/storico/StoricoClassiService';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { COL_MATERIE } from '../../../../../src/config/schema';

describe('buildContinuita', () => {
  it('flags continuitaUltimiDueAnni true when the same titolare taught the (reconciled) subject the prior year', () => {
    const materiaCorrente = Materia.fromData({ [COL_MATERIE.ID]: 'STO', [COL_MATERIE.NOME]: 'Storia', [COL_MATERIE.EVOLUZIONE]: JSON.stringify({ GST: [1, 2] }) });
    const anniStorici: AnnoClasseStorico[] = [
      { anno: '2024-2025', nomeStorico: '4A-LC', docenti: [{ docenteEmail: 'mario.rossi@scuola.edu.it', materia: 'GST', isItp: false }] }
    ];
    const docenti = { findById: (email: string) => (email === 'mario.rossi@scuola.edu.it' ? { nome: 'Mario', cognome: 'Rossi', genere: 'M', id: email } : null) };
    const vm = buildContinuita({
      siglaCorrente: 'STO',
      hasItp: false,
      titolareCorrenteEmail: 'mario.rossi@scuola.edu.it',
      itpCorrenteEmail: null,
      annoCorsoCorrente: 3,
      anniStorici,
      materiaCorrente,
      docenti: docenti as never
    });
    expect(vm.docentiAnniPrecedenti).toEqual([{ annoIndietro: 1, annoScolastico: '2024-2025', titolare: expect.objectContaining({ nomeCompleto: 'Mario Rossi' }), itp: null }]);
    expect(vm.continuitaUltimiDueAnni).toBe(true);
    expect(vm.continuitaUltimiTreAnni).toBe(false);
    expect(vm).not.toHaveProperty('continuitaUltimiTreAnniItp');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/continuita-mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `continuitaMapper.ts`**

```typescript
import type { AnnoClasseStorico } from '../../storico/StoricoClassiService';
import type { Materia } from '../../../domain/entities/Materia';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { PersonVM } from './personVmMapper';
import { buildPersonVmFromDocente } from './personVmMapper';
import { reconcileSigla } from '../../storico/reconcileSigla';

export interface ContinuitaVM {
  docentiAnniPrecedenti: Array<{ annoIndietro: number; annoScolastico: string; titolare: PersonVM | null; itp: PersonVM | null }>;
  continuitaUltimiTreAnni: boolean;
  continuitaUltimiDueAnni: boolean;
  continuitaUltimiTreAnniItp?: boolean;
  continuitaUltimiDueAnniItp?: boolean;
}

export interface BuildContinuitaInput {
  siglaCorrente: string;
  hasItp: boolean;
  titolareCorrenteEmail: string | null;
  itpCorrenteEmail: string | null;
  annoCorsoCorrente: number;
  anniStorici: AnnoClasseStorico[];
  materiaCorrente: Materia;
  docenti: IDocenteRepository;
}

/**
 * Builds ContinuitaVM (02 §8.3) for one subject: for each historical year,
 * reconciles that year's teaching sigle to the current canonical id via
 * `reconcileSigla` (course year = current course year minus years back — a
 * student's cattedra sigla is keyed to the course year it was taught in, not
 * the calendar year) and picks the titolare/ITP docente(s) matching the
 * current subject. `itp` fields are entirely omitted from the object shape
 * when `hasItp` is false (02 §8.3 note).
 */
export function buildContinuita(input: BuildContinuitaInput): ContinuitaVM {
  const docentiAnniPrecedenti = input.anniStorici.map((anno, index) => {
    const annoIndietro = index + 1;
    const annoCorsoStorico = input.annoCorsoCorrente - annoIndietro;
    const matches = anno.docenti.filter(
      (d) => reconcileSigla(d.materia, annoCorsoStorico, [input.materiaCorrente]) === input.siglaCorrente
    );
    const titolareMatch = matches.find((m) => !m.isItp);
    const itpMatch = input.hasItp ? matches.find((m) => m.isItp) : undefined;
    return {
      annoIndietro,
      annoScolastico: anno.anno,
      titolare: resolveDocente(titolareMatch?.docenteEmail, input.docenti),
      ...(input.hasItp ? { itp: resolveDocente(itpMatch?.docenteEmail, input.docenti) } : {})
    };
  }) as ContinuitaVM['docentiAnniPrecedenti'];

  const sameTitolare = (annoIndietro: number): boolean => {
    const entry = docentiAnniPrecedenti.find((d) => d.annoIndietro === annoIndietro);
    return entry?.titolare !== null && entry?.titolare !== undefined && entry.titolare.email === input.titolareCorrenteEmail;
  };
  const sameItp = (annoIndietro: number): boolean => {
    const entry = docentiAnniPrecedenti.find((d) => d.annoIndietro === annoIndietro);
    return entry?.itp !== null && entry?.itp !== undefined && entry.itp.email === input.itpCorrenteEmail;
  };

  const result: ContinuitaVM = {
    docentiAnniPrecedenti,
    continuitaUltimiDueAnni: input.titolareCorrenteEmail !== null && sameTitolare(1),
    continuitaUltimiTreAnni: input.titolareCorrenteEmail !== null && sameTitolare(1) && sameTitolare(2)
  };
  if (input.hasItp) {
    result.continuitaUltimiDueAnniItp = input.itpCorrenteEmail !== null && sameItp(1);
    result.continuitaUltimiTreAnniItp = input.itpCorrenteEmail !== null && sameItp(1) && sameItp(2);
  }
  return result;
}

function resolveDocente(email: string | undefined, docenti: IDocenteRepository): PersonVM | null {
  if (email === undefined) return null;
  const docente = docenti.findById(email);
  return docente === null ? null : buildPersonVmFromDocente(docente);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/continuita-mapper.test.ts`
Expected: PASS

- [ ] **Step 6: Wire into `MaterieClasseProvider`**

Extend `MaterieClasseProvider`'s constructor with `private readonly docenti?: IDocenteRepository, private readonly storicoDb?: StoricoDatabaseProvider, private readonly classi?: IClasseRepository`, and its `provide(cdu, params, options)` signature (now needs `options.includiStorico`/`options.profonditaAnniStorico` and `params` for nothing extra). When `includiStorico` is true and all of `docenti`/`storicoDb`/`classi` are supplied, for each item in the built `materie[]` catalog, resolve `anniStorici = new StoricoClassiService(this.storicoDb).perClasse(this.classi.getStorico(classe), options.profonditaAnniStorico)` once per `provide()` call (not per subject — reuse across the loop), then call `buildContinuita(...)` per subject and assign `subjectVm.continuita = ...`. Wire `titolareCorrenteEmail`/`itpCorrenteEmail` from the subject's own `docenti[]` (first non-ITP entry / first ITP entry, matching the per-subject `docenti` array already on `SubjectVM`).

- [ ] **Step 7: Write the provider-level test**

```typescript
it('attaches continuita to each subject only when includiStorico is true', () => {
  provider.provide(cdu, params, makeOptions({ includiStorico: true, profonditaAnniStorico: 2 }));
  expect(cdu.focus.classe!.materie![0]!.continuita).toBeDefined();
  provider.provide(cdu2, params, makeOptions({ includiStorico: false }));
  expect(cdu2.focus.classe!.materie![0]!.continuita).toBeUndefined();
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/materie-classe-provider.test.ts`
Expected: PASS

- [ ] **Step 9: Update `ContextEngineFactory.ts` registration**

```typescript
.registerProvider('materie', new MaterieClasseProvider(materie, docenti, storicoDb, classi))
```

- [ ] **Step 10: Commit**

```bash
git add src/application/storico/StoricoClassiService.ts src/application/context-engine/mappers/continuitaMapper.ts src/application/context-engine/providers/MaterieClasseProvider.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/storico/storico-classi-service.test.ts test/unit/application/context-engine/mappers/continuita-mapper.test.ts test/unit/application/context-engine/providers/materie-classe-provider.test.ts
git commit -m "feat: add ContinuitaVM teaching-continuity computation to focus.classe.materie"
```

---

### Task 21: `PartnerProjectionProvider` — `focus.classe.partner.{primo,secondo}`

**Files:**
- Create: `src/application/context-engine/providers/PartnerProjectionProvider.ts`
- Modify: `src/application/context-engine/Recipe.ts` (`RecipeOptions`/`RecipeOptionsView`/`DEFAULT_OPTIONS` — add `includiPartnerDettaglio`; `CLASSE_COMPLETA` — insert `'partner'` after `'consiglio'`)
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.partner`)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register `'partner'`, reusing existing provider instances)
- Test: `test/unit/application/context-engine/providers/partner-projection-provider.test.ts`

**Interfaces:**
- Consumes: `ClasseProvider.provide`, `StudentiProvider.provide`, `TutorProvider.provide`, `ConsiglioClasseProvider.provide` (Tasks 5-8, 12 — reused AS-IS by constructing a throwaway scratch `Cdu` per partner class and running the same four providers against it; zero business-logic duplication, per this plan's Global Constraints reuse directive).
- Produces:
  ```typescript
  export interface SingleClassProjection {
    anagrafica: CduClasse['anagrafica'];
    consiglioDiClasse: DocenteCdcVM[];
    studenti: { listaCompleta: AlunnoContestoVM[] };
    coordinatori: NonNullable<CduClasse['coordinatori']>;
  }
  partner?: { primo: SingleClassProjection; secondo: SingleClassProjection };
  ```

- [ ] **Step 1: Add `includiPartnerDettaglio` to `RecipeOptions`**

In `Cdu.ts`'s `RecipeOptionsView` (`Cdu.ts:99-109`), add `includiPartnerDettaglio: boolean;`.
In `Recipe.ts`'s `RecipeOptions` (`Recipe.ts:9-19`), add the same field.
In `Recipe.ts`'s `DEFAULT_OPTIONS` (`Recipe.ts:47-56`), add `includiPartnerDettaglio: false`.

- [ ] **Step 2: Write the failing test**

```typescript
// test/unit/application/context-engine/providers/partner-projection-provider.test.ts
import { PartnerProjectionProvider } from '../../../../../src/application/context-engine/providers/PartnerProjectionProvider';
import { ClasseProvider } from '../../../../../src/application/context-engine/providers/ClasseProvider';
import { StudentiProvider } from '../../../../../src/application/context-engine/providers/StudentiProvider';
import { TutorProvider } from '../../../../../src/application/context-engine/providers/TutorProvider';
import { ConsiglioClasseProvider } from '../../../../../src/application/context-engine/providers/ConsiglioClasseProvider';
import { makeOptions } from '../../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';

describe('PartnerProjectionProvider', () => {
  it('builds primo/secondo SingleClassProjection only when isArticolata and includiPartnerDettaglio are both true', () => {
    // Reuse whatever fake IClasseRepository/IAlunnoRepository/IMateriaRepository/ITeachingAssignmentResolver
    // fixture already backs an articulated-class scenario elsewhere in this test suite
    // (search test/unit/application/context-engine for an existing "5AB-LC-LS" / "5A-LC"/"5B-LS" fixture
    // set up for classe-provider.test.ts or consiglio-provider.test.ts and reuse it here, do not re-derive).
    const classeProvider = new ClasseProvider(classi, alunni, materie);
    const studentiProvider = new StudentiProvider(classi, alunni, materie);
    const tutorProvider = new TutorProvider(classi);
    const consiglioProvider = new ConsiglioClasseProvider(classi, materie, teachingAssignments);
    const provider = new PartnerProjectionProvider(classeProvider, studentiProvider, tutorProvider, consiglioProvider);

    const cdu = makeCdu(); // existing helper — meta.date.oggi.iso populated
    classeProvider.provide(cdu, { target: '5AB-LC-LS', tipoTarget: 'classe', now: new Date('2026-03-30') });
    provider.provide(cdu, { target: '5AB-LC-LS', tipoTarget: 'classe', now: new Date('2026-03-30') }, makeOptions({ includiPartnerDettaglio: true }));

    expect(cdu.focus.classe!.partner!.primo.anagrafica.nome).toBe('5A-LC');
    expect(cdu.focus.classe!.partner!.secondo.anagrafica.nome).toBe('5B-LS');
    expect(cdu.focus.classe!.partner!.primo.studenti.listaCompleta.length).toBeGreaterThan(0);
  });

  it('is omitted when includiPartnerDettaglio is false, even for an articulated class', () => {
    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: false }));
    expect(cdu.focus.classe!.partner).toBeUndefined();
  });

  it('is omitted for a non-articulated class', () => {
    provider.provide(standardClassCdu, standardParams, makeOptions({ includiPartnerDettaglio: true }));
    expect(standardClassCdu.focus.classe!.partner).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/partner-projection-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `PartnerProjectionProvider.ts`**

```typescript
import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduClasse, DocenteCdcVM, AlunnoContestoVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { ClasseProvider } from './ClasseProvider';
import type { StudentiProvider } from './StudentiProvider';
import type { TutorProvider } from './TutorProvider';
import type { ConsiglioClasseProvider } from './ConsiglioClasseProvider';

export interface SingleClassProjection {
  anagrafica: CduClasse['anagrafica'];
  consiglioDiClasse: DocenteCdcVM[];
  studenti: { listaCompleta: AlunnoContestoVM[] };
  coordinatori: NonNullable<CduClasse['coordinatori']>;
}

/**
 * Builds `focus.classe.partner.{primo,secondo}` (02 §2.5) — a full
 * SingleClassProjection per articulation partner — by re-running
 * ClasseProvider/StudentiProvider/TutorProvider/ConsiglioClasseProvider
 * against a throwaway scratch CDU per partner class. Zero VM-building logic
 * is duplicated: every field comes from the exact same providers the main
 * `focus.classe` uses. Gated by `isArticolata` AND `includiPartnerDettaglio`
 * (02 §2.1) — a deliberately opt-in projection since it re-runs four
 * providers per partner (expensive for recipes that don't need it).
 */
export class PartnerProjectionProvider implements ContextProvider {
  constructor(
    private readonly classeProvider: ClasseProvider,
    private readonly studentiProvider: StudentiProvider,
    private readonly tutorProvider: TutorProvider,
    private readonly consiglioProvider: ConsiglioClasseProvider
  ) {}

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined || !focusClasse.flags.isArticolata) return;
    if (options.includiPartnerDettaglio !== true) return;
    const partners = focusClasse.articolazione?.partners;
    if (partners === null || partners === undefined || partners.length !== 2) return;

    focusClasse.partner = {
      primo: this.buildProjection(partners[0]!, cdu, params, options),
      secondo: this.buildProjection(partners[1]!, cdu, params, options)
    };
  }

  private buildProjection(
    classeId: string,
    outerCdu: Cdu,
    params: BuildParams,
    options: RecipeOptions
  ): SingleClassProjection {
    const scratch: Cdu = {
      meta: outerCdu.meta,
      focus: {},
      tech: { entita: {}, servizi: [], pipeline: { statoCorrente: 'IN_CORSO', stepEseguiti: [], errori: [], logEsecuzione: [] } }
    };
    const scratchParams: BuildParams = { ...params, target: classeId, tipoTarget: 'classe' };
    this.classeProvider.provide(scratch, scratchParams);
    this.studentiProvider.provide(scratch, scratchParams, options);
    this.tutorProvider.provide(scratch);
    this.consiglioProvider.provide(scratch, scratchParams, options);

    const classe = scratch.focus.classe!;
    return {
      anagrafica: classe.anagrafica,
      consiglioDiClasse: classe.consiglioDiClasse ?? [],
      studenti: { listaCompleta: classe.studenti?.listaCompleta ?? [] },
      coordinatori: classe.coordinatori ?? { elenco: [] }
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/partner-projection-provider.test.ts`
Expected: PASS

- [ ] **Step 6: Update `Cdu.ts`, `Recipe.ts`, `ContextEngineFactory.ts`**

`Cdu.ts` — add to `CduClasse`: `partner?: { primo: SingleClassProjection; secondo: SingleClassProjection };` (`import type { SingleClassProjection } from './providers/PartnerProjectionProvider';`).

`Recipe.ts:108-117` (`CLASSE_COMPLETA`) — insert `'partner'` after `'consiglio'`:
```typescript
CLASSE_COMPLETA: ['school', 'class', 'students', 'tutor', 'consiglio', 'materie', 'esame', 'progetti', 'partner', 'rappresentanti', 'statistiche', 'storicoClasse', 'pianiPersClasse'],
```

`ContextEngineFactory.ts` — reuse the SAME provider instances already constructed for `'class'`/`'students'`/`'tutor'`/`'consiglio'` rather than constructing new ones (keep them in local `const` bindings before the `.registerProvider` chain, then reference them twice):
```typescript
const classeProvider = new ClasseProvider(classi, alunni, materie);
const studentiProvider = new StudentiProvider(classi, alunni, materie);
const tutorProvider = new TutorProvider(classi);
const consiglioProvider = new ConsiglioClasseProvider(classi, materie, teachingAssignments);

return new ContextBuilder()
  .registerProvider('school', new SchoolProvider(master, ruoli, docenti))
  .registerProvider('class', classeProvider)
  .registerProvider('students', studentiProvider)
  // ...
  .registerProvider('tutor', tutorProvider)
  .registerProvider('consiglio', consiglioProvider)
  .registerProvider('materie', new MaterieClasseProvider(materie, docenti, storicoDb, classi))
  .registerProvider('esame', new EsameProvider())
  .registerProvider('progetti', new ProgettiProvider(progetti, docenti))
  .registerProvider('partner', new PartnerProjectionProvider(classeProvider, studentiProvider, tutorProvider, consiglioProvider))
  // ...
```

Also refresh `Recipe.ts:76-105`'s provider dependency table comment in this same commit: add rows for `materie` (Task 15), `esame`/`progetti` (Tasks 16-17), `storicoClasse` (Task 19), and `partner` (this task), each stating what it writes and what CDU-level state it reads — consolidating the piecemeal notes left in each earlier task's Step rather than editing the comment block five separate times.

- [ ] **Step 7: Run full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/providers/PartnerProjectionProvider.ts src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts test/unit/application/context-engine/providers/partner-projection-provider.test.ts
git commit -m "feat: add PartnerProjectionProvider building focus.classe.partner via provider reuse"
```

---

## PHASE 6 — Sheet column exposure

### Task 22: `focus.classe.sheet.materieColonne` — expose the already-built `group1/2/3`

**Files:**
- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts:50-76` (`buildGroups`)
- Modify: `src/application/context-engine/Cdu.ts` (`CduClasse.sheet`)
- Test: `test/unit/application/strategies/sheet-materie-con-permessi-generator-strategy.test.ts` (extend)

**Interfaces:**
- Consumes: `SheetMaterieGeneratorStrategy.buildGroups()`'s already-confirmed `MaterieGroups` shape (`SheetMaterieGeneratorStrategy.ts:53-58`: `{ group1: MateriaColumn[]; group2: MateriaColumn[]; group3: MateriaColumn[]; group2Label?: string; group3Label?: string }` — do not rebuild grouping, only attach the existing return value to the CDU).
- Produces:
  ```typescript
  sheet?: {
    materieColonne: {
      group1: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
      group2: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
      group3: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
      group2Label?: string;
      group3Label?: string;
    };
  };
  ```
  (This CDU-facing type is intentionally narrower than the strategy's internal `MaterieGroups`/`MateriaColumn` — the ACL-only technical fields `classeId`/`specificita`/`kind` on the internal `MateriaColumn` are not part of the printable contract but remain present at runtime since the assignment is structural, not a literal — harmless, not scrubbed by this task.)

- [ ] **Step 1: Write the failing test**

```typescript
// extend test/unit/application/strategies/sheet-materie-con-permessi-generator-strategy.test.ts
it('attaches the rendered column groups onto focus.classe.sheet.materieColonne', () => {
  // reuse this file's existing render() fixture/cdu
  strategy.render(fileId, cdu, config);
  expect(cdu.focus.classe!.sheet?.materieColonne.group1[0]).toMatchObject({ isSpecial: true });
  expect(cdu.focus.classe!.sheet?.materieColonne.group2Label).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/strategies/sheet-materie-con-permessi-generator-strategy.test.ts`
Expected: FAIL — `cdu.focus.classe.sheet` is `undefined`.

- [ ] **Step 3: Update `CduClasse` in `Cdu.ts`**

```typescript
sheet?: {
  materieColonne: {
    group1: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
    group2: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
    group3: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
    group2Label?: string;
    group3Label?: string;
  };
};
```

- [ ] **Step 4: Update `SheetMaterieConPermessiGeneratorStrategy.buildGroups`**

```typescript
protected override buildGroups(classe: CduClasse): MaterieGroups {
  const consiglio = classe.consiglioDiClasse ?? [];
  if (consiglio.length === 0) {
    classe.elencoMaterieConPermessi = [];
    const groups = super.buildGroups(classe);
    classe.sheet = { materieColonne: groups };
    return groups;
  }
  const hasAlt = consiglio.some((docente) =>
    docente.materie.some((materia) => materia.sigla === 'ALT')
  );
  const elenco = buildElencoMaterieConPermessi(consiglio, hasAlt);
  classe.elencoMaterieConPermessi = elenco;
  const special = elenco.find((item) => item.isSpecial);
  const groups = super.buildGroups(classe);
  const finalGroups: MaterieGroups =
    special === undefined
      ? groups
      : {
          ...groups,
          group1: [
            { sigla: special.sigla, header: special.sigla, isSpecial: true, roles: special.roles },
            ...groups.group1
          ]
        };
  classe.sheet = { materieColonne: finalGroups };
  return finalGroups;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/strategies/sheet-materie-con-permessi-generator-strategy.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts src/application/context-engine/Cdu.ts test/unit/application/strategies/sheet-materie-con-permessi-generator-strategy.test.ts
git commit -m "feat: expose sheet column groups at focus.classe.sheet.materieColonne"
```

---

## PHASE 7 — Specifications (documentation, no code)

### Task 23: Rewrite `SPECS_ALDO/02_CDU_STRUTTURA.md` as the canonical spec

**Files:**
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md` (full rewrite, currently 378 lines)
- Delete: `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md` (repo root, untracked — its content becomes the new `02_CDU_STRUTTURA.md`)

This task should run LAST among the code tasks (after Task 22), once every provider's actual output shape is implemented and unit-tested — the spec must describe what the code does, not the other way around.

- [ ] **Step 1: Diff the target doc against the implemented shapes**

Read `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md` (root) fully and cross-check every section against the `Cdu.ts` interfaces as they stand after Tasks 1-22. Flag any place where the implementation diverged from the target during planning (e.g., `AlunnoContestoVM` dropping `genitori` in Task 12 only if no live caller was found; `PersonVM`/`SubjectVM` field names; the `IndirizzoId` threading fix applied to Tasks 5/8). Note every divergence found — the spec must describe the real, shipped shape.

- [ ] **Step 2: Copy and adapt**

Copy `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md`'s content into `SPECS_ALDO/02_CDU_STRUTTURA.md`, with these adaptations:
- Strip every `✎ OPTIMIZED`/`✎ RISTRUTTURATO`/`✎ NUOVO` migration-diff annotation and "current → target" framing (`§0`'s "current" callouts, `§11`'s validation-rule migration language) — this is now the base spec, not a delta document; state each shape directly as the current truth.
- Strip the `> DIRETTIVA CRITICA DI ARCHITETTURA (NO BACKWARD COMPATIBILITY)` callout at the top — that was a migration-phase directive, not a permanent spec statement.
- Apply every divergence found in Step 1.
- Keep the document title as `# 02 — Struttura del Contesto Dati Unificato (CDU)` (drop the "— Versione Ottimizzata per WorkspaceTemplateEngine" subtitle — this is now simply THE spec).

- [ ] **Step 3: Verify every CDU path in the rewritten spec resolves in code**

Run: `grep -oE '\{\{[a-zA-Z0-9_.]+' SPECS_ALDO/02_CDU_STRUTTURA.md | sort -u` and spot-check a sample of the resulting paths (at least one per top-level section: `meta`, `istituto`, `focus.classe`, `focus.alunno`, `destinatario`) against `Cdu.ts`'s interfaces to confirm they exist. This is a manual cross-check, not an automated test — there is no CDU-path-linter in this codebase (confirmed absent by the investigation).

- [ ] **Step 4: Delete the staging document**

```bash
rm "02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md"
```
(This file is untracked in git — its content now lives in `SPECS_ALDO/02_CDU_STRUTTURA.md`, the tracked canonical spec.)

- [ ] **Step 5: Commit**

```bash
git add SPECS_ALDO/02_CDU_STRUTTURA.md
git commit -m "docs: rewrite 02_CDU_STRUTTURA.md as the canonical WorkspaceTemplateEngine-oriented CDU spec"
```

---

### Task 24: Remove the intermediate-form spec `02_STRUTTURA_CDU_NEW.md`

**Files:**
- Delete: `02_STRUTTURA_CDU_NEW.md` (repo root, untracked, 1097 lines)

- [ ] **Step 1: Confirm it is fully superseded**

Run: `grep -n "02_STRUTTURA_CDU_NEW" -r SPECS_ALDO src test docs 2>/dev/null` — confirm nothing else references this file by name before deleting (expected: no hits, since it was never a tracked/linked document).

- [ ] **Step 2: Delete**

```bash
rm "02_STRUTTURA_CDU_NEW.md"
```

(No commit needed — the file was never tracked by git, so there is nothing to stage; this simply cleans up the working directory per PROMPT_MODIFY_CDU.md action item 4.)

---

### Task 25: Update `SPECS_ALDO/MAT_NON_STANDARD.md` for `sheet.materieColonne`

**Files:**
- Modify: `SPECS_ALDO/MAT_NON_STANDARD.md` (88 lines)

- [ ] **Step 1: Read the current document**

Read `SPECS_ALDO/MAT_NON_STANDARD.md` in full (not yet read during this plan's investigation — do this before editing). Locate the section documenting `elencoMaterieConPermessi` and the `SHEET_CON_MATERIE_E_PERMESSI` generator.

- [ ] **Step 2: Add the derivation note**

Add a short paragraph (placed directly after the `elencoMaterieConPermessi` section) stating: `focus.classe.sheet.materieColonne` (`group1`/`group2`/`group3`/`group2Label`/`group3Label`, see `02_CDU_STRUTTURA.md` §2.17/§4.1) is derived from the same `elencoMaterieConPermessi` computation by `SheetMaterieConPermessiGeneratorStrategy.buildGroups()` (Task 22 of the CDU restructuring) — `elencoMaterieConPermessi` itself is unchanged and remains the raw source; `materieColonne` is the `dynamic_columns`-ready grouped projection of it.

- [ ] **Step 3: Commit**

```bash
git add SPECS_ALDO/MAT_NON_STANDARD.md
git commit -m "docs: document sheet.materieColonne derivation in MAT_NON_STANDARD.md"
```

---

### Task 26: Update `SPECS_ALDO/01_SCHEMA_DATABASE.md` for the `ALUNNI.RELIGIONE` enum

**Files:**
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` (470 lines)

- [ ] **Step 1: Locate the current enum documentation**

Run: `grep -n "RELIGIONE\|SI.*NO.*ALT\|ALUNNI" SPECS_ALDO/01_SCHEMA_DATABASE.md | head -20` to find where `ALUNNI.RELIGIONE`'s value set (`SI`/`NO`/`ALT`) is documented.

- [ ] **Step 2: Update the values**

Change the documented enum from `SI | NO | ALT` to `IRC | ALT | NO` (matching Task 3's `ReligioneScelta` migration), keeping the surrounding column description otherwise unchanged. No new columns are needed (PROMPT_MODIFY_CDU.md action item 4 already scoped this as "only if necessary for labels").

- [ ] **Step 3: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md
git commit -m "docs: update ALUNNI.RELIGIONE enum documentation to IRC/ALT/NO"
```

---

## PHASE 8 — E2E/online tests and final verification

### Task 27: Update `E2eTemplateProvisioner.ts` and `src/onlinetests/checks/*` for the new CDU paths

**Files:**
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts` (paths at lines 231, 236, 288-303 confirmed by investigation; add new template snippets for the new sections)
- Modify: `src/onlinetests/checks/contextEngineChecks.ts` (paths at lines 166, 172, 317, 510, 689, 763 confirmed by investigation)
- Modify: `src/onlinetests/checks/articolazioneChecks.ts` (paths at lines 100, 101, 140 confirmed by investigation)
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts` (seed the composite `INTERPRETAZIONE.CHITARRA`/`INTERPRETAZIONE.FLAUTO` MATERIE rows added in Task 15, plus a PROGETTI row, so the new sections have real data to check against; also fix any `ReligioneScelta.SI` seed call left from Task 3)
- Test: this task's "test" is the online suite itself (`npm run build:online`, which runs the offline suite as a gate, then the online checks execute against a live GAS deployment when triggered by the project's own online-test workflow — not runnable from this offline plan; see Step 6)

**Interfaces:**
- Consumes: every provider from Tasks 1-22 (this is the final integration point — no new production code, only test/check code).

- [ ] **Step 1: Fix the `sheet.materieColonne` path discrepancy**

In `E2eTemplateProvisioner.ts`'s `sheetPermessiUpdates()` (lines 288-303), change every `materieColonne.group1`/`group2`/`group3`/`group2Label`/`group3Label` reference in the emitted `dynamic_columns[...]` directive string to the fully-qualified `focus.classe.sheet.materieColonne.group1` etc. (Task 22 attaches the node at `focus.classe.sheet.materieColonne`, not a bare `materieColonne` root).
In `contextEngineChecks.ts` (lines 317, 510, 689), change `context['materieColonne']` bracket-access reads to `context.focus?.classe?.sheet?.materieColonne`.

- [ ] **Step 2: Verify `consiglioDiClasseComune`/`consiglioDiClasseSeparato` usage still matches**

Read `E2eTemplateProvisioner.ts:225-240` and `contextEngineChecks.ts:160-180` — these already reference `focus.classe.consiglioDiClasse`/`consiglioDiClasseComune`/`consiglioDiClasseSeparato`, which are unchanged paths (only the item shape changed, per Task 8/12). Update any inline field access on a `DocenteCdcVM` item (e.g. `.anagrafica.nome`/`.anagrafica.cognome` string concatenation) to the new `PersonVM` fields (`.anagrafica.appellativoCompleto`, `.anagrafica.nomeCompleto`) where the check was asserting a printable name.

- [ ] **Step 3: Add new template snippets exercising the genuinely new sections**

In `E2eTemplateProvisioner.ts`, add at least one template fragment per PROMPT_MODIFY_CDU.md action item 5's explicit list:
- Looped `curriculum`: `{{#focus.alunno.curriculum}}{{materiaNome}}: {{#specifiche}}{{nome}}{{/specifiche}}{{/focus.alunno.curriculum}}`
- 3-level `perSpecificita`: `{{#focus.classe.studenti.perSpecificita}}{{materiaNome}}: {{#specifiche}}{{nome}} ({{#alunni}}{{nomeCompleto}};{{/alunni}}){{/specifiche}}{{/focus.classe.studenti.perSpecificita}}`
- `esame.materiePrimaProva`: `{{#bullet_list:focus.classe.esame.materiePrimaProva}}{{nome}}: {{docentiDescrizione}}{{/bullet_list}}`
- `appellativoCompleto`: `{{focus.classe.coordinatori.elenco.0.appellativoCompleto}}` (or a `bullet_list` over `coordinatori.elenco`)
- `tipoLabel`/`religioneLabel`: `{{#focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}} — {{status.religioneLabel}}{{/focus.classe.studenti.listaCompleta}}`

For each, add a matching assertion in `contextEngineChecks.ts` or `e2eScenarioChecks.ts` (whichever file already asserts on the document/CDU produced by the recipe these templates run under — read the existing file structure to place the new assertion alongside its siblings, following the established pattern rather than inventing a new check-file structure).

- [ ] **Step 4: Verify no `where`/`exclude`/`filter` with a domain-value argument remains**

Run: `grep -rn "where:'" src/onlinetests/E2eTemplateProvisioner.ts` and confirm every match's argument is a boolean/shape property (`where:'isBes',true`), never a domain string (`where:'tipoArticolazione','COMUNE'`) — per target spec §9.5/§11 rule 4, and PROMPT_MODIFY_CDU.md acceptance criterion 6. Fix any violation by switching to the precalculated partition array instead (`consiglioDiClasseComune` instead of `consiglioDiClasse | where:'tipoArticolazione','COMUNE'`, etc.).

- [ ] **Step 5: Fix `E2eSampleDatabaseBuilder.ts` seed data**

Add the two composite MATERIE rows (`INTERPRETAZIONE.CHITARRA`, `INTERPRETAZIONE.FLAUTO`, plus the base `INTERPRETAZIONE` row) and at least one PROGETTI row for the sample class, mirroring the `test/fixtures/tables.ts`/`FAKEDB/*.csv` additions from Tasks 15/17. Grep for any remaining `ReligioneScelta.SI` call left over from Task 3's migration (`grep -n "ReligioneScelta.SI" src/onlinetests/E2eSampleDatabaseBuilder.ts`) and fix it to `ReligioneScelta.IRC`.

- [ ] **Step 6: Run the offline gate**

Run: `npm run build:online`
Expected: succeeds — this mode builds the `onlinetests` entry AND runs the full offline test suite as a pre-push gate (per `CLAUDE.md`'s Build modes section); a failure here means either a TypeScript error in the check files or a broken offline unit/integration test, not the live-GAS online run itself (that requires a deployed environment and is triggered separately by the project's own online-test workflow, outside this plan's scope).

- [ ] **Step 7: Commit**

```bash
git add src/onlinetests/E2eTemplateProvisioner.ts src/onlinetests/checks/contextEngineChecks.ts src/onlinetests/checks/articolazioneChecks.ts src/onlinetests/E2eSampleDatabaseBuilder.ts
git commit -m "test: update e2e templates and online checks for the restructured CDU"
```

---

### Task 28: Final full-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: zero errors. Every `Cdu.ts` interface change across Tasks 4-22 must compile cleanly against every provider, test fake, and online check.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero errors, including zero `no-restricted-globals` violations (no task in this plan touches native GAS globals — all new code is pure domain/application logic) and no unused-import warnings left over from the many `Cdu.ts`/provider edits.

- [ ] **Step 3: Unit tests**

Run: `npm test`
Expected: 100% pass. This is the authoritative check that every task's own unit tests still pass together, not just in isolation.

- [ ] **Step 4: Integration tests**

Run: `npm run test:integration`
Expected: 100% pass — catches any cross-provider recipe-ordering regression (e.g. a recipe running `'esame'` before `'materie'`) that a single provider's unit test wouldn't see.

- [ ] **Step 5: Build-shape tests**

Run: `npm run test:build`
Expected: 100% pass — validates `dist/Code.js`/`dist/EntryPoints.js` output shape after the `Recipe.ts`/`ContextEngineFactory.ts`/`Bootstrap.ts` wiring changes across this plan.

- [ ] **Step 6: Full offline-gated online build**

Run: `npm run build:online`
Expected: succeeds (already exercised in Task 27 Step 6 — re-run here as the final gate after all documentation/fixture tasks have also landed).

- [ ] **Step 7: Repo-wide search for any remaining legacy CDU path**

Run: `grep -rn "perIndirizzo\|indirizziPresenti\|ReligioneScelta.SI\|coordinatoriMetadata\|tutorMetadata" src test SPECS_ALDO 2>/dev/null`
Expected: zero matches (per PROMPT_MODIFY_CDU.md's no-backward-compatibility directive and target spec §11 rule 7 — any access to a removed legacy path must be gone from the codebase, not merely made to throw at runtime).

- [ ] **Step 8: Report**

Summarize pass/fail for each of Steps 1-7. If any step fails, do not proceed to declare the plan complete — return to the specific task whose change caused the failure and fix it there (with its own test), rather than patching symptoms in this final task.

---

## Plan self-review

**Spec coverage** — every PROMPT_MODIFY_CDU.md §4 action item maps to a task: (1) View Model Builders → Tasks 1, 2, 3, 6, 7, 8; (2) Restructuring Mappers → Tasks 10, 12, 14, 18; (3) Providers/Strategy → Tasks 4, 5, 8, 16, 17, 18, 19, 21, 22 (+ Task 12 for `perIndirizzo`/`indirizziPresenti` removal); (4) Specifications → Tasks 23-26; (5) Test Suite → fixture edits embedded in Tasks 3/10/15/17 plus the dedicated sweep in Task 27; (6) Acceptance Criteria → verified in Task 27 Step 4 and Task 28 Step 7. Every §2.x structural-change subsection of the target spec (`02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md`) has a corresponding task: §2.1→Task 21 (`includiPartnerDettaglio`), §2.2→Task 4, §2.3→Task 5, §2.4→Task 5, §2.5→Task 21, §2.6→Tasks 6-7, §2.7→Task 8, §2.8→Task 15, §2.9→Task 16, §2.10→Task 17, §2.11→Tasks 18-19, §2.12→Task 12, §2.13→Task 10, §2.14→Tasks 12+14, §2.15→Tasks 12-13, §2.16→Task 9, §2.17→Task 22, §2.18→covered incrementally as each VM gained its field (Tasks 1-2, 8).

**Placeholder scan** — no `TODO`/`implement later`/unshown-code steps remain; the one flagged internal naming placeholder in Task 20 Step 4 was fixed to `resolveDocente`. Task 9's "locate the exact file first" step is an investigative grep-then-edit instruction (concrete command, concrete acceptance criterion), not a vague placeholder — the fork investigation gave an approximate path (`emailSteps.ts:156-186`) that wasn't independently verified by direct file read during this planning session, so the task is honest about that gap rather than fabricating unverified line numbers.

**Type consistency fixes applied during self-review:**
- `SubjectVM.continuita?: ContinuitaVM` was missing from Task 2's original interface (written before `ContinuitaVM` existed in Task 20) — added via Task 20 Step 0.
- Task 19's `ClasseStoricoVM.progetti` originally declared a duplicate `HistoricalProgettoVM` interface instead of reusing Task 17's `ProgettoVM` — fixed to import and reuse `ProgettoVM`.
- `IndirizzoId` threading was missing from Task 5's `buildMaterieVm` and Task 8's `materiaVm` (both call `buildSubjectVm` without the `indirizzo` option needed to resolve `isMateriaPrimaProva`/`isMateriaSecondaProva`, which Task 16's `EsameProvider` depends on) — both fixed in place to resolve `IndirizzoId.of(classe.indirizzo)` and pass it through.
- Recipe.ts's provider dependency-table comment update was originally scattered across Tasks 15/16/19/21 — consolidated into a single refresh in Task 21 Step 6 to avoid five small, easily-forgotten edits to the same comment block.

---

## Execution options

Plan complete and saved to `docs/superpowers/plans/2026-08-06-cdu-template-engine-restructuring.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best fit here given the plan's length (28 tasks) and the fact most tasks are independently testable once their stated dependencies (Tasks 1-2 first, then the rest largely fan out).

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
