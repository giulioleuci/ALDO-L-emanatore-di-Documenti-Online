# Parent Document Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a document owned by an articulated parent discoverable to its direct partner classes without expanding `LOG_DOCS.CLASSI`.

**Architecture:** `LogDocumentoRepository.findByClasse()` is the single visibility boundary. It receives the class repository, adds the parent class only when the requested class is a partner, and returns unique matching log rows. `AggregatoreDati` delegates its class-document lookup to that boundary so CDU and `DATI_SORGENTE.documentiPerClasse` inherit exactly the same rule.

**Tech Stack:** TypeScript, Jest, Google Apps Script V8-compatible source, SheetDBLib-backed repositories.

## Global Constraints

- Preserve the canonical persisted owner in `LOG_DOCS.CLASSI`; do not add partner IDs at registration time.
- Visibility is one-way: parent -> direct partner only; never partner -> parent or partner -> sibling.
- Preserve exact matching for non-articulated classes and return each document at most once.
- Use `IClasseRepository`; do not call GAS globals or construct repositories in application services.
- Keep the application synchronous and GAS V8 compatible.

---

### Task 1: Centralize parent-document visibility in `LogDocumentoRepository`

**Files:**

- Modify: `src/infrastructure/repositories/LogDocumentoRepository.ts:24-39`
- Modify: `src/config/Bootstrap.ts:111-299`
- Modify: `src/config/ApplicationComposition.ts:38-129`
- Test: `test/unit/infrastructure/log-repositories.test.ts:1-80`

**Interfaces:**

- Consumes: `IClasseRepository.getClasseParent(classe: Classe): Classe | null`.
- Produces: unchanged public signature `ILogDocumentoRepository.findByClasse(classe: Classe): LogDocumento[]`, now with inherited parent visibility.

- [ ] **Step 1: Write failing repository tests**

  Add parent and two partner `CLASSI` rows to the test fixture, construct `LogDocumentoRepository` with the real `ClasseRepository` over that fixture, then add this test:

  ```ts
  test('LOG_DOCS exposes a parent-owned document to its direct partner only', () => {
    const db = new FakeDatabase({
      CLASSI: [
        {
          ID: '3C',
          ANNO: 3,
          INDIRIZZO: 'SCI',
          ARTICOLAZIONE: JSON.stringify({ partners: '3C-S,3C-C' })
        },
        {
          ID: '3C-S',
          ANNO: 3,
          INDIRIZZO: 'SCI',
          ARTICOLAZIONE: JSON.stringify({ parent: '3C', partner: '3C-C' })
        },
        {
          ID: '3C-C',
          ANNO: 3,
          INDIRIZZO: 'CLA',
          ARTICOLAZIONE: JSON.stringify({ parent: '3C', partner: '3C-S' })
        }
      ],
      LOG_DOCS: [
        { ID: 'parent-doc', ID_GEN: 'VERBALE', CLASSI: '3C', STATO: 'GENERATO', UTENTI: '' },
        { ID: 'sibling-doc', ID_GEN: 'PROGRAMMA', CLASSI: '3C-S', STATO: 'GENERATO', UTENTI: '' }
      ]
    });
    const classi = new ClasseRepository(db);
    const docs = new LogDocumentoRepository(db, classi);
    const parent = classi.findById(ClasseId.of('3C'))!;
    const scientifico = classi.findById(ClasseId.of('3C-S'))!;
    const classico = classi.findById(ClasseId.of('3C-C'))!;

    expect(docs.findByClasse(scientifico).map((doc) => doc.id)).toEqual([
      'parent-doc',
      'sibling-doc'
    ]);
    expect(docs.findByClasse(classico).map((doc) => doc.id)).toEqual(['parent-doc']);
    expect(docs.findByClasse(parent).map((doc) => doc.id)).toEqual(['parent-doc']);
  });
  ```

- [ ] **Step 2: Run the repository test to verify RED**

  Run: `npx jest --config jest.config.cjs test/unit/infrastructure/log-repositories.test.ts -t "parent-owned document"`

  Expected: FAIL because a partner lookup currently matches only its own raw `CLASSI` CSV value.

- [ ] **Step 3: Implement the minimal repository rule and wire it**

  Change the constructor to receive `IClasseRepository`, and replace the exact filter with a parent-inclusive scope:

  ```ts
  constructor(database: RepositoryDatabase, private readonly classi: IClasseRepository) {
    super(database, TABLE.LOG_DOCS, LogDocumento);
    database.tables[TABLE.LOG_DOCS]!.createIndex(COL_LOG_DOCS.STATO);
  }

  findByClasse(classe: Classe): LogDocumento[] {
    const classIds = new Set([classe.id ?? '']);
    const parentId = this.classi.getClasseParent(classe)?.id;
    if (parentId !== null && parentId !== undefined) classIds.add(parentId);
    return this.findAll().filter((documento) =>
      [...classIds].some((classId) => documento.containsClasse(classId))
    );
  }
  ```

  Pass the existing `classi` repository wherever the composition root creates `LogDocumentoRepository`; update test construction sites to pass a `ClasseRepository` backed by the same database.

- [ ] **Step 4: Run repository tests to verify GREEN**

  Run: `npx jest --config jest.config.cjs test/unit/infrastructure/log-repositories.test.ts`

  Expected: PASS, including existing exact CSV, state, notification, and registration tests.

- [ ] **Step 5: Commit Task 1**

  ```bash
  git add src/infrastructure/repositories/LogDocumentoRepository.ts src/config/Bootstrap.ts src/config/ApplicationComposition.ts test/unit/infrastructure/log-repositories.test.ts
  git commit -m "feat: inherit parent documents for partner classes"
  ```

### Task 2: Route `AggregatoreDati` through the common document boundary

**Files:**

- Modify: `src/application/services/AggregatoreDati.ts:30-136`
- Test: `test/unit/application/aggregatore-dati.test.ts:1-125`

**Interfaces:**

- Consumes: `ILogDocumentoRepository.findByClasse(classe: Classe): LogDocumento[]` from Task 1 and `IClasseRepository.findById(id: ClasseId): Classe | null`.
- Produces: `getDocumentiPerClasse(classeId: string, filtri?: DocumentoFiltri): LogDocumento[]` with the same parent -> partner visibility contract.

- [ ] **Step 1: Write a failing `AggregatoreDati` test**

  Add an articulated parent/partner class fixture and a `LOG_DOCS` row whose `CLASSI` is only the parent. Assert both direct accessor and dynamic source behavior:

  ```ts
  test('documentiPerClasse exposes parent-owned documents to a partner without rewriting CLASSI', () => {
    const tables = fixtureTables();
    tables.CLASSI = [
      {
        ID: '3C',
        ANNO: 3,
        INDIRIZZO: 'SCI',
        ARTICOLAZIONE: JSON.stringify({ partners: '3C-S,3C-C' })
      },
      {
        ID: '3C-S',
        ANNO: 3,
        INDIRIZZO: 'SCI',
        ARTICOLAZIONE: JSON.stringify({ parent: '3C', partner: '3C-C' })
      }
    ];
    tables.LOG_DOCS = [
      {
        ID: 'verbale-parent',
        ID_GEN: 'VERBALE',
        TIPO: 'VERBALE',
        STATO: 'GENERATO',
        CLASSI: '3C',
        UTENTI: ''
      }
    ];
    const agg = aggregatore(tables);

    expect(agg.getDocumentiPerClasse('3C-S').map((doc) => doc.id)).toEqual(['verbale-parent']);
    expect(
      (agg.perMetodo('documentiPerClasse', { classeId: '3C-S' }, logger) as LogDocumento[]).map(
        (doc) => doc.id
      )
    ).toEqual(['verbale-parent']);
    expect(tables.LOG_DOCS[0]!.CLASSI).toBe('3C');
  });
  ```

- [ ] **Step 2: Run the aggregator test to verify RED**

  Run: `npx jest --config jest.config.cjs test/unit/application/aggregatore-dati.test.ts -t "parent-owned documents"`

  Expected: FAIL because `getDocumentiPerClasse()` currently filters cached rows with `LogDocumento.containsClasse(classeId)`.

- [ ] **Step 3: Implement delegation to the repository**

  Replace the raw cached filtering path with class resolution plus repository lookup, retaining existing `matchesDoc` filtering:

  ```ts
  getDocumentiPerClasse(classeId: string, filtri: DocumentoFiltri = {}): LogDocumento[] {
    const classe = this.classi.findById(ClasseId.of(classeId));
    if (classe === null) return [];
    return this.logDocs.findByClasse(classe).filter((documento) => this.matchesDoc(documento, filtri));
  }
  ```

  Construct `this.logDocs` with `this.classi` in `AggregatoreDati` so it shares the same resolver as Task 1. Remove `documentiCache` and `allDocumenti()` only if no remaining accessor uses them.

- [ ] **Step 4: Run aggregator tests to verify GREEN**

  Run: `npx jest --config jest.config.cjs test/unit/application/aggregatore-dati.test.ts`

  Expected: PASS, including filters and unknown-method behavior.

- [ ] **Step 5: Commit Task 2**

  ```bash
  git add src/application/services/AggregatoreDati.ts test/unit/application/aggregatore-dati.test.ts
  git commit -m "fix: share inherited document visibility with data sources"
  ```

### Task 3: Correct E2E coordinator expectation and verify the affected delivery path

**Files:**

- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts:430-470`
- Modify: `test/unit/onlinetests/e2e-scenario-checks.test.ts:110-150,730-780`
- Test: `test/unit/onlinetests/e2e-scenario-checks.test.ts:730-780`

**Interfaces:**

- Consumes: the E2E fixture contract `3C-S -> Alessandro Verdi`, `3C-C -> Paolo Fontana`, and `SendPatternResult`.
- Produces: an E2E assertion aligned with the actual fixture and a regression check that a zero-skip verbale result is required for all articulated targets.

- [ ] **Step 1: Write the failing scenario-10b expectation**

  Change the expected `3C-C` coordinator in the scenario check to `Paolo Fontana`. In the recording harness, keep the inaccurate `Prof.ssa Elena Ferrari` text for `CONF_DOC_ARTICOLATA`; then assert scenario 10b fails:

  ```ts
  const scenario10b = runner
    .report()
    .results.find((result) => result.name.includes('scenario 10b'));
  expect(scenario10b).toMatchObject({ status: 'fail' });
  expect(scenario10b?.message).toMatch(/Paolo Fontana/);
  ```

- [ ] **Step 2: Run the scenario test to verify RED**

  Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts -t "scenario 10b generates"`

  Expected: FAIL because the fixture currently fabricates Elena Ferrari as the partner coordinator.

- [ ] **Step 3: Make the fixture represent each partner’s real rendered coordinator and add the skip regression**

  Set the mock text conditionally by target: `3C-S` includes `Prof. Alessandro Verdi`; `3C-C` includes `Prof. Paolo Fontana`. Add a scenario-4 assertion whose supplied result is `{ targets: 3, sent: 1, skipped: 2, errors: [] }` and expects failure, preserving the online symptom as a strict contract.

- [ ] **Step 4: Run the E2E-check unit tests to verify GREEN**

  Run: `npx jest --config jest.config.cjs test/unit/onlinetests/e2e-scenario-checks.test.ts`

  Expected: PASS; scenario 10b validates the actual coordinators and scenario 4 rejects partial delivery.

- [ ] **Step 5: Run focused cross-layer verification**

  Run:

  ```bash
  npx jest --config jest.config.cjs test/unit/infrastructure/log-repositories.test.ts test/unit/application/aggregatore-dati.test.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
  npm run typecheck
  npm run lint
  ```

  Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 3**

  ```bash
  git add src/onlinetests/checks/e2eScenarioChecks.ts test/unit/onlinetests/e2e-scenario-checks.test.ts
  git commit -m "test: align articulated E2E coordinator checks"
  ```

### Task 4: Rebuild and run the online E2E proof

**Files:**

- No source changes expected.

**Interfaces:**

- Consumes: the bundled online test entrypoint and the parent-document read contract from Tasks 1–3.
- Produces: online evidence that scenario 4 has `targets=3`, `sent=3`, `skipped=0`, `errors=none` and scenario 10b passes.

- [ ] **Step 1: Build the online bundle**

  Run: `npm run build:online`

  Expected: build and offline push-gate tests exit 0.

- [ ] **Step 2: Deploy within the explicitly authorized online-test workflow**

  Run: `npm run push:online`

  Expected: clasp accepts the rebuilt `OnlineTests.js` and `Code.js`.

- [ ] **Step 3: Execute `runE2eScenarios` in GAS and inspect the report**

  Expected: scenario 4 reports no skipped target; scenario 10b reports both actual partner coordinators with no validation error.

- [ ] **Step 4: Record the online result without adding a verification-only commit**

  Report the GAS suite outcome together with the observed scenario-4 counters
  and scenario-10b status. If verification exposes a new source defect, stop
  here and open a new TDD cycle rather than changing this verified plan ad hoc.
