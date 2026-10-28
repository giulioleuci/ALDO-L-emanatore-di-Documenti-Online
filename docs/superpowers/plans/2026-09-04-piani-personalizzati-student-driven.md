# Piani Personalizzati Student-Driven Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `focus.classe.pianiPersonalizzati` to compute from the current active-student roster (PIANI + ALUNNI.ATTIVO) joined to LOG_DOCS by student, instead of scanning LOG_DOCS by class tag — so a student who left the class stops appearing and a student who joined it starts appearing, without waiting for a new document.

**Architecture:** `PianiPersClasseProvider` iterates `classi.getStudenti(classe, true)` (active-only roster) → per student, `alunni.getPiani(alunno)` (PIANI table) → per piano, `logDocs.findByUtente(email)` filtered to the matching `PIANO_PERS`/sottotipo. A match reuses the existing `buildDocumentoLogVm` mapping; no match emits a placeholder `PianoPersonalizzatoVM` (`hasId:false`) using the same "no document" shape `buildDocumentoStoricoVm` already establishes. Two downstream consumers that bucket by `isNotificato` alone must additionally require `hasId`, since a placeholder can never be "notified."

**Tech Stack:** TypeScript, Jest (`ts-jest`), existing `FakeDatabase`/`fixtureTables()` test harness. No new libraries, no new repository methods — `IClasseRepository.getStudenti(classe, soloAttivi)`, `IAlunnoRepository.getPiani(alunno)`, `ILogDocumentoRepository.findByUtente(email)` already exist and already implement `ALUNNI.ATTIVO` filtering / PIANI lookup / LOG_DOCS-by-user lookup respectively.

**Spec:** `docs/superpowers/specs/2026-09-04-piani-personalizzati-student-driven-design.md`

## Global Constraints

- No new repository or interface methods — every lookup this plan needs already exists (confirmed by reading `IClasseRepository`, `IAlunnoRepository`, `ILogDocumentoRepository` and their implementations).
- `PianoPersonalizzatoVM` (Cdu.ts:401) keeps its current shape. A placeholder is represented the same way `buildDocumentoStoricoVm` already represents a doc-less record: `id: null, hasId: false`.
- `hasId` is the sole discriminator between "document exists" and "placeholder." Any code that buckets `pianiPersonalizzati` items by notification status must AND with `hasId` on the "not yet notified" branch — a placeholder is never "notified."
- `DocumentiClasseProvider` (`focus.classe.documenti`) is explicitly out of scope — it stays class-tag-driven (general audit trail, not a per-student computation).
- Multi-class aggregation (`params.classiCompetenza`) and the per-class-id loop shape are unchanged.

---

### Task 1: Rewrite `PianiPersClasseProvider` to join from the roster

**Files:**

- Modify: `src/application/context-engine/providers/PianiPersClasseProvider.ts`
- Test: `test/unit/application/context-engine/piani-pers-classe-provider.test.ts` (full rewrite — the existing fixtures are internally inconsistent: e.g. student `a1@school.it`'s `PIANI.TIPO` is `PEI` in `test/fixtures/tables.ts`, but the existing test pushes a `LOG_DOCS` row with `SOTTOTIPO:'PDP_DSA'` for that same student — a mismatch the class-tag-driven code never noticed because it never looked at PIANI)

**Interfaces:**

- Consumes: `IClasseRepository.getStudenti(classe: Classe, soloAttivi?: boolean): Alunno[]` (ALUNNI.ATTIVO gate built in), `IAlunnoRepository.getPiani(alunno: Alunno): Piano[]` (PIANI table), `ILogDocumentoRepository.findByUtente(email: Email): LogDocumento[]`, `LogDocumento.getSottotipo(): string`, `LogDocumento.tipo: string`, `mappers/labels.ts`'s `tipoPianoLabel(tipo: TipoPiano): string`.
- Produces: `focus.classe.pianiPersonalizzati: PianiPersonalizzatiClasseVM` unchanged in shape (`elenco`, `nonVerbalizzati`, `storico`); `PianoPersonalizzatoVM.hasId` now meaningfully distinguishes a real document from a placeholder for `boxes.ts`/`emailSteps.ts` (Task 2/3).

- [ ] **Step 1: Confirm the fixture facts this rewrite relies on**

Run: `grep -n "EMAIL: 'a1@school.it'" -A 10 "test/fixtures/tables.ts"` and `grep -n "PIANI:" -A 5 "test/fixtures/tables.ts"`
Expected: `a1@school.it` has `ATTIVO: true`, `CLASSE: '5A'`; `a2@school.it`/`a3@school.it` have `ATTIVO: false`; `PIANI` has `{STUDENTE:'a1@school.it', TIPO:'PEI'}`, `{STUDENTE:'a2@school.it', TIPO:'PDP_DSA'}`, `{STUDENTE:'a3@school.it', TIPO:'PFP'}`. (These are the load-bearing facts every test below depends on — if they've drifted, adjust the test bodies accordingly before proceeding.)

- [ ] **Step 2: Replace the test file with the student-driven test suite**

Write `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`:

```ts
import { PianiPersClasseProvider } from '../../../../src/application/context-engine/providers/PianiPersClasseProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions, recipe } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';
import type {
  StoricoDatabaseProvider,
  AnnoStorico
} from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(
  tables: Record<string, Row[]> = fixtureTables(),
  databases: StoricoDatabaseProvider = { anniStorici: () => [] },
  classiCompetenza?: string[],
  options = makeOptions()
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const logDocs = new LogDocumentoRepository(db, new LazyRef(() => classi));
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider(
    'pianiPersClasse',
    new PianiPersClasseProvider(classi, logDocs, alunni, databases)
  );
  const params: BuildParams = {
    target: '5A',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z'),
    ...(classiCompetenza !== undefined ? { classiCompetenza } : {})
  };
  const rec: Recipe = { providers: ['class', 'pianiPersClasse'], options };
  return b.build(params, rec);
}

test('PianiPersClasseProvider: active student with a PIANI row but no matching LOG_DOCS surfaces as a placeholder', () => {
  const cdu = build();
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(1);
  const item = elenco[0]!;
  expect(item.hasId).toBe(false);
  expect(item.id).toBeNull();
  expect(item.link).toBe('');
  expect(item.sottotipo).toBe('PEI');
  expect(item.sottotipoLabel).toBe('PEI');
  expect(item.hasSottotipo).toBe(true);
  expect(item.studente).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
  expect(item.hasStudente).toBe(true);
  expect(item.isNotificato).toBe(false);
  expect(item.isVerbalizzato).toBe(false);
});

test('PianiPersClasseProvider: matches a piano to its LOG_DOCS document by student + sottotipo', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pei_a1',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/a1',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-01'
  });
  const cdu = build(t);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(1);
  const item = elenco[0]!;
  expect(item.hasId).toBe(true);
  expect(item.id).toBe('doc_pei_a1');
  expect(item.generatoreId).toBe('PEI_DOC');
  expect(item.studente).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
});

test('PianiPersClasseProvider: excludes an inactive (left-the-school) student even when a LOG_DOCS row still tags them to the class', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pdp_a2_stale',
    ID_GEN: 'PDP_BES',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PDP_DSA',
    NOME: 'PDP a2 (stale)',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/a2',
    CLASSI: '5A',
    UTENTI: 'a2@school.it',
    DATA_CREAZ: '2026-02-01'
  });
  const cdu = build(t);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(1);
  expect(elenco[0]!.studente?.email).toBe('a1@school.it');
});

test('PianiPersClasseProvider: a currently-active student surfaces by roster membership, independent of the class tag stored on their LOG_DOCS row', () => {
  const t = fixtureTables();
  (t['ALUNNI'] as Row[]).push({
    EMAIL: 'a4@school.it',
    COGNOMENOME: 'GIALLI DINO',
    CLASSE: '5A',
    RELIGIONE: 'NO',
    ATTIVO: true,
    RIPETENTE: false,
    RAPPR_STUD: false,
    TUTOR_1: '',
    TUTOR_2: '',
    CURRICULUM: null
  });
  (t['PIANI'] as Row[]).push({ STUDENTE: 'a4@school.it', TIPO: 'PDP_BES', PARAMETRI: null });
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pdp_a4',
    ID_GEN: 'PDP_BES',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PDP_BES',
    NOME: 'PDP a4',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/a4',
    CLASSI: '3B',
    UTENTI: 'a4@school.it',
    DATA_CREAZ: '2026-01-15'
  });
  const cdu = build(t);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(2);
  const a4Item = elenco.find((i) => i.studente?.email === 'a4@school.it');
  expect(a4Item).toBeDefined();
  expect(a4Item!.id).toBe('doc_pdp_a4');
});

test('PianiPersClasseProvider: nonVerbalizzati excludes a VERBALIZZATO document', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pei_a1_verb',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1 verbalizzato',
    STATO: 'VERBALIZZATO',
    NOTIFICATO: '',
    LINK: 'http://d/a1',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-01'
  });
  const cdu = build(t);
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(false);
  expect(nv.elenco).toEqual([]);
});

test('PianiPersClasseProvider: an ungenerated placeholder counts as non-verbalized', () => {
  const cdu = build();
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(true);
  expect(nv.elenco).toHaveLength(1);
  expect(nv.elenco[0]!.hasId).toBe(false);
});

test('PianiPersClasseProvider: aggregates active students across every class in classiCompetenza', () => {
  const t = fixtureTables();
  (t['ALUNNI'] as Row[]).push({
    EMAIL: 'b1@school.it',
    COGNOMENOME: 'ROSA TINA',
    CLASSE: '3B',
    RELIGIONE: 'NO',
    ATTIVO: true,
    RIPETENTE: false,
    RAPPR_STUD: false,
    TUTOR_1: '',
    TUTOR_2: '',
    CURRICULUM: null
  });
  (t['PIANI'] as Row[]).push({ STUDENTE: 'b1@school.it', TIPO: 'PFP', PARAMETRI: null });
  const cdu = build(t, { anniStorici: () => [] }, ['5A', '3B']);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco.map((i) => i.studente?.email).sort()).toEqual(['a1@school.it', 'b1@school.it']);
});

test('PianiPersClasseProvider: storico LazyRef resolves empty (no DB opened) when includiStorico is false', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = {
    anniStorici: () => {
      opened = true;
      return [];
    }
  };
  const cdu = build(fixtureTables(), databases);
  expect(cdu.focus.classe!.pianiPersonalizzati!.storico.get()).toEqual([]);
  expect(opened).toBe(false);
});

test('PianiPersClasseProvider: storico resolves prior-year docs for a student even when their current-year piano is a placeholder', () => {
  const oldTables = fixtureTables();
  (oldTables['LOG_DOCS'] as Row[]).push({
    ID: 'old_pei_a1',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1 anno scorso',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/old',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2025-03-01'
  });
  const oldDb = new FakeDatabase(oldTables);
  const anno: AnnoStorico = {
    anno: '2025-2026',
    db: oldDb,
    logDocs: new LogDocumentoRepository(oldDb, new LazyRef(() => new ClasseRepository(oldDb)))
  };
  const databases: StoricoDatabaseProvider = { anniStorici: () => [anno] };
  const cdu = build(
    fixtureTables(),
    databases,
    undefined,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.classe!.pianiPersonalizzati!.storico.get();
  expect(storico).toEqual([
    {
      annoScolastico: '2025-2026',
      documento: expect.objectContaining({
        nome: 'PEI a1 anno scorso',
        link: 'http://d/old',
        tipo: 'PIANO_PERS'
      })
    }
  ]);
});

test('DOCENTE_COMPLETO recipe populates nonVerbalizzati alongside elenco', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pei_a1_verb',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1 verbalizzato',
    STATO: 'VERBALIZZATO',
    NOTIFICATO: '',
    LINK: 'http://d/a1',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-03'
  });
  const db = new FakeDatabase(t);
  const cdu = composeContextBuilder(db).build(
    { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    recipe('DOCENTE_COMPLETO')
  );
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(false);
  expect(nv.elenco).toEqual([]);
  expect(cdu.focus.classe!.pianiPersonalizzati!.elenco).toHaveLength(1);
});
```

- [ ] **Step 3: Run the new tests to see them fail against the old implementation**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts`
Expected: Multiple failures — the old implementation never looks at PIANI/ATTIVO, so placeholders never appear and the stale/inactive-student test still shows the excluded student.

- [ ] **Step 4: Rewrite `PianiPersClasseProvider.ts`**

Write `src/application/context-engine/providers/PianiPersClasseProvider.ts`:

```ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu, PianoPersonalizzatoVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { Piano } from '../../../domain/entities/Piano';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { StatoDocumento } from '../../../domain/value-objects/enums';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { buildDocumentoLogVm, buildDocumentoStoricoVm } from '../mappers/documentoVmMapper';
import { tipoPianoLabel } from '../mappers/labels';
import { elencoVm } from '../mappers/elencoVm';

const TIPO_PIANO_PERS = 'PIANO_PERS';

type StudenteRef = { nomeCompleto: string; email: string };

/**
 * Fills `focus.classe.pianiPersonalizzati` (11 §11 new) from the active
 * student roster (`ALUNNI.ATTIVO`, ref 01 §"Regola attività"), not from
 * LOG_DOCS class tags: for every active student in every class in
 * `params.classiCompetenza` (falling back to `params.target`), every PIANI
 * row they hold is matched to its LOG_DOCS document by student email +
 * sottotipo; an unmatched piano still surfaces as a placeholder
 * (`hasId:false`), so a student who transferred out (ATTIVO:false) is
 * excluded even if their old document still tags this class, and a student
 * who transferred in is included even before any document exists. `storico`
 * merges every distinct current-year student's prior-year PIANO_PERS
 * documents, attached lazily. Active in DOCENTE_COMPLETO
 * (PER_COORDINATORE/PER_DOCENTE/PER_CDC).
 */
export class PianiPersClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly logDocs: ILogDocumentoRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly storicoDb: StoricoDatabaseProvider
  ) {}

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classIds = params.classiCompetenza ?? [params.target];
    const emails = new Set<string>();
    const elenco: PianoPersonalizzatoVM[] = classIds.flatMap((id) => {
      const classe = this.classi.findById(ClasseId.of(id));
      if (classe === null) return [];
      return this.classi.getStudenti(classe, true).flatMap((alunno) => {
        const piani = this.alunni.getPiani(alunno);
        if (piani.length === 0) return [];
        emails.add(alunno.email.value);
        const studente: StudenteRef = {
          nomeCompleto: alunno.cognomeNome,
          email: alunno.email.value
        };
        return piani.flatMap((piano) => this.itemsPerPiano(alunno, piano, studente));
      });
    });
    const nonVerbalizzati = elenco.filter((item) => !item.isVerbalizzato);
    const includiStorico = options.includiStorico;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.storicoDb);
    focusClasse.pianiPersonalizzati = {
      ...elencoVm(elenco),
      nonVerbalizzati: elencoVm(nonVerbalizzati),
      storico: new LazyRef(() =>
        includiStorico
          ? [...emails].flatMap((email) =>
              service
                .perAlunnoConTipo(email, profondita)
                .filter((documento) => documento.tipo === TIPO_PIANO_PERS)
                .map(buildDocumentoStoricoVm)
            )
          : []
      )
    };
  }

  private itemsPerPiano(
    alunno: Alunno,
    piano: Piano,
    studente: StudenteRef
  ): PianoPersonalizzatoVM[] {
    const matches = this.logDocs
      .findByUtente(alunno.email)
      .filter((l) => l.tipo === TIPO_PIANO_PERS && l.getSottotipo() === piano.tipo);
    if (matches.length === 0) return [this.placeholder(piano, studente)];
    return matches.map((l) => ({
      ...buildDocumentoLogVm(l),
      isVerbalizzato: l.getStato() === StatoDocumento.VERBALIZZATO,
      studente,
      hasStudente: true
    }));
  }

  private placeholder(piano: Piano, studente: StudenteRef): PianoPersonalizzatoVM {
    return {
      id: null,
      hasId: false,
      nome: '',
      link: '',
      tipo: TIPO_PIANO_PERS,
      tipoLabel: TIPO_PIANO_PERS,
      sottotipo: piano.tipo,
      sottotipoLabel: tipoPianoLabel(piano.tipo),
      hasSottotipo: true,
      generatoreId: '',
      stato: '',
      statoLabel: '',
      isNotificato: false,
      dataCreazione: '',
      dataCreazioneBreve: '',
      isVerbalizzato: false,
      studente,
      hasStudente: true
    };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/application/context-engine/providers/PianiPersClasseProvider.ts test/unit/application/context-engine/piani-pers-classe-provider.test.ts
git commit -m "feat(cdu): drive pianiPersonalizzati from the active roster, not LOG_DOCS class tags"
```

---

### Task 2: Gate `boxes.ts`'s "da notificare" bucket on `hasId`

**Files:**

- Modify: `src/application/email/boxes.ts:506-510` (the `pianiPersDaInviare` filter inside `aggregaDati`)
- Test: `test/unit/application/email-boxes.test.ts` (raw literal at lines 184-195, and the `pianiPersCduRecord` helper at lines 631-646)

**Interfaces:**

- Consumes: `PianoPersonalizzatoVM.hasId` (Task 1 — `false` for placeholders).
- Produces: `pianiPersDaInviare.items` now excludes placeholders (nothing to notify for a document that was never generated).

- [ ] **Step 1: Confirm the current filter and the failure this causes without the fix**

Read `src/application/email/boxes.ts:506-515`:

```ts
    pianiPersDaInviare: {
      items: pianiItems.filter((i) => !i.isNotificato),
      storicoRef: pianiStoricoRef,
      defaultTemplate: DEFAULT_PIANI_PERS_TEMPLATE
    },
    pianiPersInviati: {
      items: pianiItems.filter((i) => i.isNotificato),
      storicoRef: pianiStoricoRef,
      defaultTemplate: ''
    }
```

A placeholder has `isNotificato: false` (Task 1), so without a `hasId` guard it lands in `pianiPersDaInviare` — "notify this plan" for a plan with no document and no link to send.

- [ ] **Step 2: Update `test/unit/application/email-boxes.test.ts` fixtures to declare `hasId` explicitly**

Two edits, both because `renderBoxes` (`src/application/email/boxes.ts:692`) calls `aggregaDati` internally, so every test that feeds a `pianiPersonalizzati.elenco` through it is affected by the new `hasId` gate:

Edit 2a — the raw literal at `test/unit/application/email-boxes.test.ts:184-195` (the `documentIds` test) currently has no `hasId` field:

```ts
(focus['classe'] as Record<string, unknown>)['pianiPersonalizzati'] = {
  elenco: [
    {
      id: 'personal-plan-1',
      nome: 'PDP Anna',
      link: 'https://drive/personal-plan-1',
      sottotipo: 'PDP_BES',
      idGen: 'PIANI_PERSONALIZZATI',
      isNotificato: false
    }
  ]
};
```

Add `hasId: true` (this item represents an already-generated document, so it must still flow through `pianiPersDaInviare`):

```ts
(focus['classe'] as Record<string, unknown>)['pianiPersonalizzati'] = {
  elenco: [
    {
      id: 'personal-plan-1',
      hasId: true,
      nome: 'PDP Anna',
      link: 'https://drive/personal-plan-1',
      sottotipo: 'PDP_BES',
      idGen: 'PIANI_PERSONALIZZATI',
      isNotificato: false
    }
  ]
};
```

Edit 2b — the `pianiPersCduRecord` helper at `test/unit/application/email-boxes.test.ts:631-646` is the single choke point every other `piani_pers_da_inviare`/`piani_pers_inviati` test in this file routes through (5 call sites: lines 651, 702, 746, 777, 804). None of their item literals set `hasId`. Default it in the helper instead of touching all five call sites:

```ts
function pianiPersCduRecord(elenco: unknown[], storico?: unknown): Record<string, unknown> {
  return {
    meta: { oggi: { breve: '05/07/2026' } },
    focus: {
      classe: {
        nome: '5A',
        pianiPersonalizzati: {
          elenco: elenco.map((item) => ({ hasId: true, ...(item as object) })),
          hasElenco: elenco.length > 0,
          numero: elenco.length,
          ...(storico !== undefined ? { storico } : {})
        }
      }
    }
  };
}
```

(`{ hasId: true, ...item }` defaults `hasId` to `true` — every existing fixture item represents a real generated document — while still letting a future test override it by setting `hasId` explicitly in its own literal.)

- [ ] **Step 2 (verify): Run the email-boxes tests against the OLD boxes.ts to confirm they still pass unmodified**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: PASS (this step only adds `hasId` data, doesn't change `boxes.ts` yet, so nothing should break — confirms Step 2's edits are correct in isolation before Step 3 changes behavior).

- [ ] **Step 3: Apply the `hasId` gate in `boxes.ts`**

In `src/application/email/boxes.ts`, change the `pianiPersDaInviare` line inside `aggregaDati` (around line 507):

```ts
    pianiPersDaInviare: {
      items: pianiItems.filter((i) => i.hasId && !i.isNotificato),
      storicoRef: pianiStoricoRef,
      defaultTemplate: DEFAULT_PIANI_PERS_TEMPLATE
    },
```

(`pianiPersInviati`'s `i.isNotificato` filter is untouched — a placeholder's `isNotificato` is always `false`, so it can never reach that bucket regardless.)

- [ ] **Step 4: Run the full email-boxes suite**

Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "fix(email): exclude ungenerated piani-personalizzati placeholders from the notify bucket"
```

---

### Task 3: Gate `emailSteps.ts`'s `PianiDaNotificare` log count on `hasId`, and fix the one test fixture it breaks

**Files:**

- Modify: `src/application/pipelines/emailSteps.ts:446-460` (`RenderBoxesStep._getLogDetails`)
- Modify: `test/unit/application/pipelines/email-steps.test.ts` (one fixture, ~line 295-319)

**Interfaces:**

- Consumes: `PianoPersonalizzatoVM.hasId` (Task 1).
- Produces: `_getLogDetails`'s `PianiDaNotificare` count no longer counts placeholders.

- [ ] **Step 1: Apply the gate**

In `src/application/pipelines/emailSteps.ts`, change line ~457:

```ts
  protected override _getLogDetails(ctx: PipelineContext): {
    Boxes: number;
    PianiCdu: number;
    PianiDaNotificare: number;
    PianiNotificati: number;
  } {
    const built = cdu(ctx);
    const piani = built.focus.classe?.pianiPersonalizzati?.elenco ?? [];
    return {
      Boxes: (ctx.get<string[]>('boxHtmlOrdered') ?? []).length,
      PianiCdu: piani.length,
      PianiDaNotificare: piani.filter((piano) => piano.hasId && !piano.isNotificato).length,
      PianiNotificati: piani.filter((piano) => piano.isNotificato).length
    };
  }
```

(Only the `PianiDaNotificare` line changes — `!piano.isNotificato` → `piano.hasId && !piano.isNotificato`.)

- [ ] **Step 2: Run the affected test to find the break**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "PianiDaNotificare"`

The test at `test/unit/application/pipelines/email-steps.test.ts:~292-341` pushes two `LOG_DOCS` rows for `a1@school.it`: one `SOTTOTIPO:'PDP_DSA'` ("piano-nuovo") and one `SOTTOTIPO:'PEI'` ("piano-notificato"), and expects `PianiCdu:2, PianiDaNotificare:1, PianiNotificati:1`. But `a1@school.it`'s only `PIANI` row (`test/fixtures/tables.ts`) is `TIPO:'PEI'` — there is no `PDP_DSA` PIANI row for `a1`, so under Task 1's join, "piano-nuovo" (`SOTTOTIPO:'PDP_DSA'`) never matches any piano and is silently dropped, leaving `PianiCdu:1`.

Expected failure: `PianiCdu` received `1`, expected `2` (and `PianiDaNotificare` received `0`, expected `1`).

- [ ] **Step 3: Fix the fixture, not the assertion — add the missing PIANI row**

In `test/unit/application/pipelines/email-steps.test.ts`, immediately after the `const tables = fixtureTables();` line that precedes the two `LOG_DOCS.push(...)` calls (around line 295), add:

```ts
    const tables = fixtureTables();
    (tables['PIANI'] as Row[]).push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_DSA', PARAMETRI: null });
    (tables['LOG_DOCS'] as Row[]).push(
```

(This makes the fixture internally consistent — `a1` genuinely holds both a PEI and a PDP_DSA plan — restoring the original test's intent, "2 plans for this student, 1 already notified, 1 not," without touching its assertions.)

- [ ] **Step 4: Run the full email-steps suite**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: All tests PASS (this file also exercises `piani_pers_da_inviare` with base `fixtureTables()` and no pushed rows, at `~line 1052-1065`, expecting an empty/invisible box — that one already passes unmodified: `a1`'s PEI placeholder has `hasId:false`, so Task 2's gate keeps it out of `pianiPersDaInviare.items`).

- [ ] **Step 5: Commit**

```bash
git add src/application/pipelines/emailSteps.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "fix(email): exclude ungenerated piani-personalizzati placeholders from the PianiDaNotificare log count"
```

---

### Task 4: Fix the two remaining consumers surfaced by the new placeholder

**Files:**

- Modify: `test/unit/application/context-engine/recipes-e2e.test.ts` (two assertions)
- Modify: `test/unit/application/document-generation-service.test.ts` (one fixture addition)

**Interfaces:**

- Consumes: nothing new — these are pure test-fixture/assertion fixes for behavior Task 1 already implements correctly. `a1@school.it` (base fixture, `ATTIVO:true`, `PIANI.TIPO:'PEI'`) now always produces exactly one placeholder item when no matching `LOG_DOCS` row exists for it in the test's tables.

- [ ] **Step 1: Run recipes-e2e to see the breaks**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/recipes-e2e.test.ts`
Expected failures:

- `'CLASSE_COMPLETA on an ordinary class (5A) assembles every class-axis node (09 §3)'`: `c.pianiPersonalizzati?.elenco` is `[{...}]` (length 1, `a1`'s placeholder), not `[]`; `hasElenco` is `true`, not `false`.
- `'DOCENTE_COMPLETO (document) populates classe-scoped document nodes without a student focus'`: `c.pianiPersonalizzati!.hasElenco` is `true`, not `false`.

- [ ] **Step 2: Fix `recipes-e2e.test.ts:57-58`**

Change:

```ts
expect(c.pianiPersonalizzati?.elenco).toEqual([]);
expect(c.pianiPersonalizzati?.hasElenco).toBe(false);
```

to:

```ts
// a1 (ATTIVO, PIANI.TIPO=PEI) surfaces as a placeholder — no LOG_DOCS row backs it in this fixture.
expect(c.pianiPersonalizzati?.elenco).toHaveLength(1);
expect(c.pianiPersonalizzati?.elenco[0]?.hasId).toBe(false);
expect(c.pianiPersonalizzati?.hasElenco).toBe(true);
```

- [ ] **Step 3: Fix `recipes-e2e.test.ts:220-221`**

Change:

```ts
expect(c.pianiPersonalizzati).toBeDefined();
expect(c.pianiPersonalizzati!.hasElenco).toBe(false);
```

to:

```ts
expect(c.pianiPersonalizzati).toBeDefined();
expect(c.pianiPersonalizzati!.hasElenco).toBe(true);
```

- [ ] **Step 4: Run recipes-e2e again**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/recipes-e2e.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run document-generation-service to see the break**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts -t "articulated parent"`

The test `'includes personalized plans filed under a partner class when targeting the parent'` (`test/unit/application/document-generation-service.test.ts:478-521`) pushes a `LOG_DOCS` row for `studente@school.test` (`CLASSI:'1F-LSO'`, `SOTTOTIPO:'PDP_DSA'`) but never adds an `ALUNNI`/`PIANI` row for that student — under Task 1's roster-driven join, a student absent from `ALUNNI` is never iterated, so the document never surfaces.

Expected failure: `strategy.cdu?.focus.classe?.pianiPersonalizzati?.elenco.map((i) => i.id)` is `[]`, expected `['LD1']`.

- [ ] **Step 6: Add the missing roster fixture**

In `test/unit/application/document-generation-service.test.ts`, in the `'includes personalized plans filed under a partner class when targeting the parent'` test, insert before the existing `tables.LOG_DOCS!.push({...})` call (before line 497):

```ts
tables.ALUNNI!.push({
  EMAIL: 'studente@school.test',
  COGNOMENOME: 'STUDENTE TEST',
  CLASSE: '1F-LSO',
  RELIGIONE: 'NO',
  ATTIVO: true,
  RIPETENTE: false,
  RAPPR_STUD: false,
  TUTOR_1: '',
  TUTOR_2: '',
  CURRICULUM: null
});
tables.PIANI!.push({ STUDENTE: 'studente@school.test', TIPO: 'PDP_DSA', PARAMETRI: null });
```

- [ ] **Step 7: Run the full document-generation-service suite**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts`
Expected: All tests PASS, including `'targeting a partner class directly sees only its own data...'` (`~line 523-564`) — that one needs no fixture change: it asserts `elenco` is `[]` when generating for `1F-LSO` with no `ALUNNI` row in that class at all, which the roster-driven join already satisfies (empty roster → empty elenco).

- [ ] **Step 8: Commit**

```bash
git add test/unit/application/context-engine/recipes-e2e.test.ts test/unit/application/document-generation-service.test.ts
git commit -m "test: update pianiPersonalizzati fixtures/assertions for the roster-driven join"
```

---

### Task 5: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: All suites PASS (no regressions outside the files touched in Tasks 1-4 — a full-suite run confirms no other test constructs a `pianiPersonalizzati` fixture this plan didn't already account for).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No errors (in particular: no native GAS global leaks — this plan touches no `GoogleApiWrapper`-only globals).

- [ ] **Step 4: Integration/build suites**

Run: `npm run test:integration && npm run test:build`
Expected: All PASS.

- [ ] **Step 5: Commit if any of the above required fixes**

If Steps 1-4 were all clean, there is nothing to commit for this task. Otherwise:

```bash
git add -A
git commit -m "fix: address full-suite fallout from the pianiPersonalizzati roster-driven join"
```
