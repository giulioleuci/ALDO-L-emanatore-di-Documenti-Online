# Continuità didattica con timeline di cattedra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [x]) syntax for tracking.

**Goal:** Esportare nel CDU, per ciascuna materia e per ciascuno dei tre anni, la timeline datata del titolare principale e dell’ITP, incluse variazioni di cattedra e supplenze.

**Architecture:** StoricoClassiService legge CLASSI, DOCENTI, VARIAZIONI_CATTEDRA e SUPPLENZE dal DB di ogni anno. continuitaMapper trasforma quei dati nel CDU; non ricostruisce una seconda catena di ruoli. Il template gestisce soltanto gli invii a capo.

**Tech Stack:** TypeScript, Jest, GasLibraryFactory già vendorizzata.

**Spec:** SPECS_ALDO/AUDIT_SUPPLENZE_CONTINUITA.md + approvazione utente del 2026-09-06 (includere timeline ITP).

## Global Constraints

- Logica SGSA nel CDU: non estendere GasLibraryFactory.
- Riutilizzare VariazioneCattedra, Supplenza e i repository esistenti; non duplicare parsing CSV/date.
- Titolare effettivo: SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI; una supplenza non modifica la timeline del titolare.
- Timeline vuota per eventi assenti; AL resta null per supplenze aperte.
- Ogni materia espone timeline titolare e, se presente, itp.

---

### Task 1: Caricare le cattedre storiche con eventi

**Files:**

- Modify: src/application/storico/StoricoDatabaseProvider.ts
- Modify: src/application/storico/StoricoClassiService.ts
- Modify: src/domain/entities/VariazioneCattedra.ts
- Test: test/unit/application/storico-services.test.ts

**Interfaces:**

- Consumes: VariazioneCattedraRepository.findByClasse, SupplenzaRepository.findAll, applicaAContesto, getPeriodo.
- Produces: AnnoClasseStorico.cattedre[]: { materia, isItp, titolareOriginario, variazioni, supplenze }.

- [x] **Step 1: Write the failing historical-loader test**

```ts
expect(storico.perClasse([classePrecedente], 1)[0]!.cattedre).toMatchObject([
  {
    materia: 'MAT',
    isItp: false,
    titolareOriginario: 'titolare@scuola.it',
    variazioni: [{ nuovoTitolare: 'nuovo@scuola.it', dal: new Date('2025-10-01') }],
    supplenze: [
      { supplente: 'supplente@scuola.it', dal: new Date('2025-11-01'), al: new Date('2025-11-15') }
    ]
  }
]);
```

- [x] **Step 2: Run the test and verify it fails**

Run: npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts

Expected: FAIL because cattedre does not exist and the historical adapter does not verify required tables.

- [x] **Step 3: Implement the smallest shared loader**

```ts
{
  verifyTables: [
    TABLE.CLASSI,
    TABLE.DOCENTI,
    TABLE.VARIAZIONI_CATTEDRA,
    TABLE.SUPPLENZE,
    TABLE.LOG_DOCS
  ];
}

const variazioni = variazioniRepo
  .findByClasse(classe.id!)
  .filter((x) => x.applicaAMateria(materia.id));
const supplenze = supplenzeRepo.findAll().filter((x) => x.applicaAContesto(classe.id!, materia.id));
```

Add VariazioneCattedra.getDecorrenza(): Date beside isDecorsaA; use PeriodoSupplenza.dal() and al(). Sort by DAL; create records for both CLASSI slots and retain isItp. Do not add a resolver or replay algorithm.

- [x] **Step 4: Verify and commit**

Run: npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts

Expected: PASS.

```bash
git add src/application/storico/StoricoDatabaseProvider.ts src/application/storico/StoricoClassiService.ts src/domain/entities/VariazioneCattedra.ts test/unit/application/storico-services.test.ts
git commit -m "feat(storico): load cattedra timelines"
```

### Task 2: Expose main-holder and ITP timelines in CDU

**Files:**

- Modify: src/application/context-engine/Cdu.ts
- Modify: src/application/context-engine/mappers/continuitaMapper.ts
- Modify: src/application/context-engine/providers/MaterieClasseProvider.ts
- Test: test/unit/application/context-engine/mappers/continuita-mapper.test.ts

**Interfaces:**

- Consumes: AnnoClasseStorico.cattedre[] from Task 1.
- Produces: each ContinuitaVM.anniPrecedenti[] item has titolareTimeline and itpTimeline: { titolareOriginario, variazioni, supplenze, hasVariazioni, hasSupplenze } | null.

- [x] **Step 1: Write the failing mapper test**

```ts
expect(continuita.anniPrecedenti[0]).toMatchObject({
  titolareTimeline: {
    variazioni: [{ dal: new Date('2025-10-01') }],
    supplenze: [{ al: new Date('2025-11-15') }]
  },
  itpTimeline: { titolareOriginario: expect.objectContaining({ email: 'itp@scuola.it' }) }
});
```

- [x] **Step 2: Run the test and verify it fails**

Run: npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/continuita-mapper.test.ts

Expected: FAIL because ContinuitaVM has no timeline fields.

- [x] **Step 3: Implement direct mapping**

```ts
const timelineFor = (isItp: boolean) => {
  const cattedra = anno.cattedre.find(
    (x) => x.materia === input.siglaCorrente && x.isItp === isItp
  );
  return cattedra === undefined ? null : toTimelineVm(cattedra, docentiStorici);
};
```

Resolve timeline people through that same annual DB so departed staff render. Preserve titolare, itp and all existing flags. Populate the current-year timeline from current repositories using the same mapping helper; itpTimeline is null with no ITP slot.

- [x] **Step 4: Verify and commit**

Run: npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/continuita-mapper.test.ts && npm run typecheck

Expected: PASS.

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/mappers/continuitaMapper.ts src/application/context-engine/providers/MaterieClasseProvider.ts test/unit/application/context-engine/mappers/continuita-mapper.test.ts
git commit -m "feat(cdu): expose cattedra timelines"
```

### Task 3: Cover required scenarios and ITP parity

**Files:**

- Modify: test/unit/application/storico-services.test.ts
- Modify: test/unit/application/context-engine/mappers/continuita-mapper.test.ts

**Interfaces:**

- Consumes: ContinuitaVM from Task 2.
- Produces: regression coverage of requested main-holder cases and both ITP states.

- [x] **Step 1: Add the four required cases**

```ts
test.each([
  ['nessuna variazione e nessuna supplenza', [], [], 'originario@scuola.it'],
  ['nessuna variazione e due supplenze', [], [supplenza1, supplenza2], 'originario@scuola.it'],
  ['una variazione e due supplenze', [variazione1], [supplenza1, supplenza2], 'nuovo@scuola.it'],
  ['due variazioni e nessuna supplenza', [variazione1, variazione2], [], 'secondo@scuola.it']
])('%s', (_nome, variazioni, supplenze, titolareFinale) => {
  const timeline = buildTimeline({ variazioni, supplenze });
  expect(timeline.variazioni).toHaveLength(variazioni.length);
  expect(timeline.supplenze).toHaveLength(supplenze.length);
  expect(resolveTitolare(timeline)).toBe(titolareFinale);
});
```

- [x] **Step 2: Add ITP parity tests**

```ts
expect(anno.itpTimeline).toMatchObject({
  titolareOriginario: expect.objectContaining({ email: 'itp-originario@scuola.it' }),
  variazioni: [{ nuovoTitolare: expect.objectContaining({ email: 'itp-nuovo@scuola.it' }) }],
  supplenze: [{ supplente: expect.objectContaining({ email: 'itp-supplente@scuola.it' })]
});
```

Use exactly two ITP fixtures: no events and variation-plus-supplenza. The four requested combinations remain exhaustive for the main holder; duplicating all four for ITP adds no behavior.

- [x] **Step 3: Run guards and commit**

Run: npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts test/unit/application/context-engine/mappers/continuita-mapper.test.ts && npm run typecheck && npm run lint && npm test

Expected: all commands exit 0.

```bash
git add test/unit/application/storico-services.test.ts test/unit/application/context-engine/mappers/continuita-mapper.test.ts
git commit -m "test(cdu): cover continuity timelines"
```
