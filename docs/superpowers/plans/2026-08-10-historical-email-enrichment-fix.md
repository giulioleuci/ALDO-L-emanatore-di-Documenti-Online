# Historical Email Enrichment Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore prior-year personalized-plan enrichment when the historical database contains only its intentional minimal table set.

**Architecture:** Keep `LogDocumentoRepository`'s class-hierarchy dependency mandatory, but represent it as `CoreUtilsLib.LazyRef<IClasseRepository>`. Resolve it only in `findByClasse()`; `findByUtente()` and the historical email path therefore open only `LOG_DOCS`.

**Tech Stack:** TypeScript, GAS V8, CoreUtilsLib `LazyRef`, SheetDBLib through `SheetDbAdapter`, DomainRepositoryLib, Jest/ts-jest.

## Global Constraints

- Use `GasLibraryFactory` directly wherever it already provides the required mechanism; this change uses `CoreUtilsLib.LazyRef` and does not extend the library.
- Historical databases remain valid with only `CLASSI`, `ALUNNI`, and `LOG_DOCS`.
- Native GAS globals remain confined to `GoogleApiWrapper`; this change introduces none.
- Production code must stay synchronous and GAS V8 compatible.
- Preserve the renderer's current best-effort behavior for genuinely unavailable history.

---

### Task 1: Prove the minimal historical database regression

**Files:**
- Modify: `test/unit/application/storico-services.test.ts`

**Interfaces:**
- Consumes: `MasterStoricoDatabaseProvider.anniStorici(profondita: number): AnnoStorico[]` and `StoricoDocumentiService.perAlunnoConTipo(alunnoEmail: string, profondita?: number): DocumentoStoricoConTipo[]`.
- Produces: a regression test proving that historical document lookup works without `DOCENTI`, `INDIRIZZI`, or `MATERIE`.

- [ ] **Step 1: Add a failing test with exactly the historical schema contract**

Mock the ambient `DatabaseService` so its `tables` object contains concrete table doubles only for `CLASSI`, `ALUNNI`, and `LOG_DOCS`. Populate `LOG_DOCS` with one personalized-plan row for `a1@school.it`, and configure the fake master repository to return that spreadsheet as `2025-2026`.

```ts
it('reads historical documents from the minimal CLASSI/ALUNNI/LOG_DOCS database', () => {
  const tables = {
    [TABLE.CLASSI]: sheetTable([{ ID: '4A' }]),
    [TABLE.ALUNNI]: sheetTable([{ EMAIL: 'a1@school.it', CLASSE: '4A' }]),
    [TABLE.LOG_DOCS]: sheetTable([
      {
        ID: 'old-plan',
        ID_GEN: 'PIANI_PERSONALIZZATI',
        TIPO: 'PIANO_PERS',
        SOTTOTIPO: 'PDP_BES',
        NOME: 'PDP anno precedente',
        LINK: 'https://drive/old-plan',
        UTENTI: 'a1@school.it',
        STATO: 'GENERATO'
      }
    ])
  };
  mockDatabaseServiceWith(tables);

  const provider = new MasterStoricoDatabaseProvider(masterWithYear('2025-2026'), logger);
  const result = new StoricoDocumentiService(provider).perAlunnoConTipo('a1@school.it');

  expect(result).toEqual([
    expect.objectContaining({
      anno: '2025-2026',
      nome: 'PDP anno precedente',
      tipo: 'PIANO_PERS',
      sottotipo: 'PDP_BES'
    })
  ]);
});
```

The local `sheetTable` double must implement the real methods exercised by `SheetDbAdapter` and `LogDocumentoRepository`: `getAllRows`, `getByPK`, `createIndex`, `defineVirtualColumn`, and `setPrimaryKey`. The database mock must not proxy unknown table names; accessing an omitted name must return `undefined`, which reproduces the online failure.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "minimal CLASSI/ALUNNI/LOG_DOCS database" --runInBand
```

Expected: FAIL with `Cannot read properties of undefined (reading 'setPrimaryKey')`, caused by eager `ClasseRepository` construction reaching an omitted table.

### Task 2: Make the class hierarchy dependency lazy

**Files:**
- Modify: `src/infrastructure/repositories/LogDocumentoRepository.ts`
- Modify: `src/application/storico/StoricoDatabaseProvider.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `src/config/ApplicationComposition.ts`
- Modify: `src/application/services/AggregatoreDati.ts`
- Modify: `src/application/services/ReportService.ts`
- Modify constructor call sites in the 13 affected files under `test/unit/` reported by graph search for `new LogDocumentoRepository`.

**Interfaces:**
- Consumes: ambient `LazyRef<T>` with `constructor(factory: () => T)` and `get(): T`.
- Produces: `new LogDocumentoRepository(database: RepositoryDatabase, classi: LazyRef<IClasseRepository>)`; `findByClasse()` retains its existing return contract.

- [ ] **Step 1: Change the repository dependency and its only consumer**

In `LogDocumentoRepository`, change the constructor field and resolve it only in `findByClasse()`:

```ts
constructor(
  database: RepositoryDatabase,
  private readonly classi: LazyRef<IClasseRepository>
) {
  super(database, TABLE.LOG_DOCS, LogDocumento);
  database.tables[TABLE.LOG_DOCS]!.createIndex(COL_LOG_DOCS.STATO);
}

findByClasse(classe: Classe): LogDocumento[] {
  const classIds = new Set([classe.id ?? '']);
  const parentId = this.classi.get().getClasseParent(classe)?.id;
  // existing filtering remains unchanged
}
```

- [ ] **Step 2: Update production composition points**

Wrap every concrete class repository without creating a second instance. Representative forms:

```ts
new LogDocumentoRepository(deps.db, new LazyRef(() => container.get<ClasseRepository>('classi')))
new LogDocumentoRepository(db, new LazyRef(() => classi))
new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
new LogDocumentoRepository(database, new LazyRef(() => this.classi))
```

In `MasterStoricoDatabaseProvider`, the required construction is:

```ts
logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
```

This factory must remain unresolved during `findByUtente()`.

- [ ] **Step 3: Update test construction points mechanically**

For every graph-discovered `new LogDocumentoRepository(db, classi)` use `new LogDocumentoRepository(db, new LazyRef(() => classi))`. For inline instances use `new LazyRef(() => new ClasseRepository(db))`. Do not change fixtures or add the omitted historical tables.

- [ ] **Step 4: Run the regression test and verify GREEN**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts -t "minimal CLASSI/ALUNNI/LOG_DOCS database" --runInBand
```

Expected: PASS and the historical row includes `SOTTOTIPO: PDP_BES`.

- [ ] **Step 5: Verify class-based document lookup still resolves the dependency**

Run:

```bash
npx jest --config jest.config.cjs test/unit/infrastructure/log-repositories.test.ts --runInBand
```

Expected: PASS, including the parent/partner visibility test exercising `findByClasse()`.

- [ ] **Step 6: Run focused historical and email suites**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/storico-services.test.ts test/unit/application/email-boxes.test.ts test/unit/application/context-engine/piani-pers-classe-provider.test.ts test/unit/application/context-engine/piani-pers-alunno-provider.test.ts --runInBand
```

Expected: all suites PASS with no warnings or unexpected errors.

- [ ] **Step 7: Run static and full verification**

Run:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:integration -- --runInBand
npm run test:build -- --runInBand
npm run build:online
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 8: Re-index and inspect architecture constraints**

Refresh the `home-giulio-Desktop-ALDO-implementing` graph, then verify:

- all `LogDocumentoRepository` construction sites provide `LazyRef<IClasseRepository>`;
- no ALDO source directly calls native GAS globals;
- no new zero-incoming-edge production functions were introduced;
- the repository call path remains acyclic.

- [ ] **Step 9: Commit the implementation**

```bash
git add src test docs/superpowers/plans/2026-08-10-historical-email-enrichment-fix.md
git commit -m "fix: restore historical plan email enrichment"
```
