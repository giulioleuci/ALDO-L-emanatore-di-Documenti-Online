# Online Test Failures — Round 2 (run 2026-08-21 16:00) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the 14 failures left in the second GAS run of `OnlineTests.gs` batches 1–4, so all four batches finish green in a single ordered pass.

**Architecture:** Six independent fixes. Two are regressions introduced by the first round of fixes (container key never registered; a check that reads through a code path that now filters itself out), one is a stale assertion the first round finally exposed, one is a fixture-catalog gap in the historical spreadsheets, one is a check that reads a class the batch is no longer scoped to, and one is an operator-ordering hazard turned into an unforgeable invariant. No production defect is implicated except the missing `monitor` container registration.

**Tech Stack:** TypeScript → Babel/webpack → GAS V8; Jest (`jest.config.cjs`); vendored `GasLibraryFactory` bundle in `vendor/gaslibs.Code.js`.

**Spec:** `ONLINE_RESULTS/batch{1,2,3,4}.txt` (the raw GAS console logs this plan argues from), `docs/superpowers/plans/2026-08-21-online-test-failures.md` (round 1, whose fixes this plan repairs), `SPECS_ALDO/02_CDU_STRUTTURA.md` (§8.3 continuità).

## Observed results

| Batch | Result                  | Failures                                              |
| ----- | ----------------------- | ----------------------------------------------------- |
| 1     | 24 passed, **1 failed** | `documenti.tabelleImportate::generazione e contenuto` |
| 2     | 10 passed, **6 failed** | 4 × `email.*`, 2 × `Articolazione CDU: …`             |
| 3     | 23 passed, **4 failed** | 2 × `storico.classe::…`, 2 × `itpDotted::…`           |
| 4     | 33 passed, **3 failed** | 2 × `supplenze.ruoli::…`, 1 × `monitor.telemetria::…` |

Round-1 wins that must not regress: the `Step not found` flood (2718 → 0), the `addProtectedRange … Utente non valido` retries (58 + 116 → 0), the Sheets read-quota errors (2 hard failures → 1 warning that recovered), the ASL fixture header, and the batch-2 execution-limit kill (batch 2 now finishes in ~7 min).

## Global Constraints

- Target is **GAS V8**: synchronous code only, no Node/browser-only APIs.
- Native GAS globals (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `CacheService`, …) may only be touched inside `GoogleApiWrapper`. ALDO code reaches them through a facade — enforced by `npm run lint` (`no-restricted-globals`).
- Never edit `dist/*` or `vendor/*` by hand. `vendor/gaslibs.Code.js` changes only via `npm run refresh:vendor` after a `GasLibraryFactory` build.
- `GasLibraryFactory`-first: check `GasLibraryFactory/DOCS_LIBS` before writing logic; on a partial match, stop and ask the user before writing ALDO-local code.
- All DB table/column names are UPPERCASE and come from `src/config/schema.ts`.
- Gates for every task: `npm run typecheck && npm run lint && npm test`.
- **E2E templates are found-or-created by name** (`E2eTemplateProvisioner.findOrCreateDoc`): editing a template's paragraphs or tables in code does **not** change a template that already exists in Drive. Prefer fixing checks over fixing template content.
- Fixture changes under `src/onlinetests/data/` only reach GAS after the user re-runs **`creaDatiMockDrive`** (the test-database + template generation entry point). Say so in the commit body when it applies (Task 4).

## Root-cause summary

| #   | Failure (log evidence)                                                                                                                                                                                                          | Root cause                                                                                                                                                                                                                                                                                                                                   | Task |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `monitor.telemetria::…: Servizio non registrato: monitor`                                                                                                                                                                       | `buildAldoContainer` threads `deps.monitor` into services but never calls `c.register('monitor', …)`. The round-1 probe check is the first caller to resolve it by key.                                                                                                                                                                      | 1    |
| 2   | `SOLO_TITOLARI/same-email: protectedRangeEditors atteso=e2edocente19@… reale=` (2×)                                                                                                                                             | `supplenzeRuoliChecks.visibilitySnapshot` reads the requests captured by a fake `protectRanges`. Round 1 made `protectColumns` drop requests whose principals are all `@onlinetest.aldo.local` — every E2E teacher — so nothing is captured. `contextEngineChecks` was migrated to the pure `resolveColumnRequests` seam; this file was not. | 2    |
| 3   | `Tabelle importate: contenuto … mancanti (heading presente=true; placeholder residuo=false; placeholder residui=0)`                                                                                                             | The check asserts `countOccurrences(text,'Valore') === 1`, but the E2E template carries two static tables of its own headed `Colonna \| Valore` (`TABELLE_IMPORTATE_TABLES`), so `Valore` legitimately occurs 3×. Round 1 fixed the placeholder revert and exposed this stale assertion. Diagnostics also omit which fragment is missing.    | 3    |
| 4   | `Storico E2E: ITP INF anno 1 non materializzato` (2×) + `Continuita principale/ITP … incoerente.` (1×)                                                                                                                          | `seedStorico` seeds only `GST`, `STO` and the 4 dotted subjects into each prior year's `MATERIE`. `ClasseRepository` builds its cattedra-column map from `MATERIE`, so the prior-year `INF`/`INF.itp`/`MAT` columns are never read and `continuita.docentiAnniPrecedenti[*].itp` stays absent.                                               | 4    |
| 5   | `SOTTOTIPO base/dotted non distinto: INTERPRET.CHITARRA::e2edocente5@…`                                                                                                                                                         | Round 1 scoped `CONF_DOC_DOCENTE_MATERIA.CONDIZIONE` to `CLASSE_A` (`1A`), but the check derives its expected `GRECO::<docente>` subtype from `FOCAL_CLASS` (`4A`), whose GRECO teacher differs — that document is never generated. The message also prints the subtypes found, not the ones missing.                                        | 5    |
| 6   | `email.prerequisiti…`, `E2E_MAIL_VERBALE: nessuna riga LOG_MAIL testMode`, `nessuna prova testMode`, `Retry testMode E2E_MAIL_PIANI (2 -> 2 -> 2)`, `LOG_DOCS CDC ARTICOLATA: … ricevuti `, `Piano duale LOG_DOCS: … ricevuti ` | Operator ordering: `resetE2eHistoryTables` ran **between** batch 1 and batch 2 and purged the `LOG_DOCS` rows batches 2's `documenti` boxes and articolazione assertions consume. No code defect — but the invariant is left to the operator.                                                                                                | 6    |

---

### Task 1: Register the `monitor` service in the container

**Files:**

- Modify: `src/config/Bootstrap.ts:111-170` (the `buildAldoContainer` registration block)
- Test: `test/unit/config/bootstrap.test.ts:296-352` (the `buildAldoContainer` describe block)

**Interfaces:**

- Consumes: `BootstrapDeps.monitor?: IProcessMonitor` (already declared, `src/config/Bootstrap.ts:93`).
- Produces: container key `'monitor'`, resolvable as `container.get<IProcessMonitor>('monitor')` — the key `src/onlinetests/checks/processMonitorChecks.ts:23` already assumes.

`deps.monitor` is optional, so mirror the `'spreadsheets'` pattern at `src/config/Bootstrap.ts:167-169`: register only when provided, leaving the off-GAS container unchanged (`ServiceContainer.get` then throws its typed `Servizio non registrato` error, which is the correct behaviour off-GAS).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('buildAldoContainer …')` block in `test/unit/config/bootstrap.test.ts`, next to the `'spreadsheets'` test at line 348:

```typescript
test("registers 'monitor' in the container when deps.monitor is provided", () => {
  const monitor = { registerJob: jest.fn() } as never;
  const c = buildAldoContainer({ ...baseDeps(), monitor });
  expect(c.get('monitor')).toBe(monitor);
});

test("does not register 'monitor' when deps.monitor is omitted", () => {
  const c = buildAldoContainer(baseDeps());
  expect(() => c.get('monitor')).toThrow(/monitor/);
});
```

- [ ] **Step 2: Run the tests and watch the first one fail**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts -t "monitor"`
Expected: the first test FAILS with `Servizio non registrato: monitor`; the second already passes.

- [ ] **Step 3: Register the key**

In `src/config/Bootstrap.ts`, immediately after the `spreadsheets` registration:

```typescript
if (deps.spreadsheets !== undefined) {
  c.register('spreadsheets', () => deps.spreadsheets!);
}
// Same optional-dependency shape as `spreadsheets`: GasProcessMonitorLib is a
// GAS-only port, so off-GAS containers deliberately leave the key unregistered
// and `ServiceContainer.get` fails typed. The online-test telemetry probe
// (`processMonitorChecks`) resolves it by key.
if (deps.monitor !== undefined) {
  c.register('monitor', () => deps.monitor!);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/config/Bootstrap.ts test/unit/config/bootstrap.test.ts
git commit -m "fix: register the monitor port under its container key"
```

---

### Task 2: Read column protections through the pure resolver in the supplenze checks

**Files:**

- Modify: `src/onlinetests/checks/supplenzeRuoliChecks.ts:140-225` (`visibilitySnapshot`)
- Test: `test/unit/onlinetests/supplenze-ruoli-checks.test.ts`

**Interfaces:**

- Consumes: `SheetMaterieConPermessiGeneratorStrategy.resolveColumnRequests(cdu, sheetName, layout, gestioneSupplenti): SpreadsheetProtectRequest[]` and `protectionGestioneSupplenti(config): GestioneSupplenti`, both exported from `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`.
- Produces: nothing consumed by later tasks.

This is the migration `src/onlinetests/checks/contextEngineChecks.ts:564-585` already performed. The check verifies that effective-assignment resolution reaches the ACL layer, not that Sheets would accept the call, so it must read the unfiltered resolution.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/onlinetests/supplenze-ruoli-checks.test.ts`:

```typescript
test('protectedRangeEditors survives the synthetic-principal skip in protectColumns', () => {
  const cdu = cduWithMatTitolare(e2eDocenteEmail(19));
  const snapshot = visibilitySnapshotForTest(cdu, GestioneSupplenti.SOLO_TITOLARI);
  expect(snapshot.protectedRangeEditors).toContain(e2eDocenteEmail(19));
});
```

If `visibilitySnapshot` is not exported, export it (and the `ConsumerVisibilitySnapshot` type is already exported) rather than duplicating its body in the test; name the export `visibilitySnapshot` and call it with the same `(container, now, mode)` signature the checks use, building the container with the existing fakes in that test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/supplenze-ruoli-checks.test.ts`
Expected: FAIL — `protectedRangeEditors` is `[]` because every editor is `@onlinetest.aldo.local`.

- [ ] **Step 3: Capture the layout and resolve the requests**

In `visibilitySnapshot`, add a captured-layout array next to `protectionRequests`:

```typescript
const protectionRequests: SpreadsheetProtectRequest[] = [];
const capturedLayout: SheetColumnLayout[] = [];
```

In the fake `templates.processSheet`, build the layout, record it, and return it:

```typescript
const layout = [...groups.group1, ...(groups.group2 ?? []), ...(groups.group3 ?? [])].map(
  (item, index) => ({
    sheetName: 'Sheet1',
    column: index + 1,
    header:
      typeof item['header'] === 'string'
        ? item['header']
        : typeof item['sigla'] === 'string'
          ? item['sigla']
          : '',
    isLabel: false,
    item
  })
);
capturedLayout.push(...layout);
return layout;
```

Replace the render call and the `matProtection` lookup:

```typescript
const strategy = new SheetMaterieConPermessiGeneratorStrategy(
  sheets,
  new MateriaRepository(container.get('db')),
  templates,
  roles
);
strategy.render('visibility-sheet', cdu, sheetConfig);
// Pure resolution, independent of the synthetic-principal skip in `protectColumns`
// (2026-08-21 round 1): this check asserts that effective-assignment resolution reaches
// the column-ACL layer, not that Sheets would accept the call — and every E2E teacher is
// a synthetic principal, so the real call is always skipped.
const resolvedRequests = strategy.resolveColumnRequests(
  cdu,
  'Sheet1',
  capturedLayout,
  protectionGestioneSupplenti(sheetConfig)
);
const matProtection = resolvedRequests.find((request) => request.description?.includes(' MAT '));
```

Add the imports:

```typescript
import {
  SheetMaterieConPermessiGeneratorStrategy,
  protectionGestioneSupplenti
} from '../../application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import type { SheetColumnLayout } from '../../infrastructure/facades/TemplateEngineFacade';
```

(keep the existing import of the strategy if it is already imported — merge, don't duplicate; import `SheetColumnLayout` from wherever `contextEngineChecks.ts` imports it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/supplenze-ruoli-checks.test.ts`
Expected: PASS, including the pre-existing dedupe and per-mode tests.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/onlinetests/checks/supplenzeRuoliChecks.ts test/unit/onlinetests/supplenze-ruoli-checks.test.ts
git commit -m "fix: read supplenze column ACLs through the pure protection resolver"
```

---

### Task 3: Fix the imported-tables uniqueness sentinel and its diagnostics

**Files:**

- Modify: `src/onlinetests/checks/documentiChecks.ts:173-205`
- Test: `test/unit/onlinetests/documentiChecks.test.ts:222-253`

**Interfaces:**

- Consumes: `countOccurrences(value, fragment)` already defined in `documentiChecks.ts`.
- Produces: nothing consumed by later tasks.

The generated document legitimately contains three `Valore` occurrences: two from the template's own static tables (`E2eTemplateProvisioner.TABELLE_IMPORTATE_TABLES`, headed `Colonna | Valore`) and one from the imported source sheet's header (`Nome | Valore`). `Nome` occurs only in the imported header, so it is the one sentinel that proves the header-only source sheet was **not** inserted as a second table — which is what the uniqueness assertion exists for. The template cannot be fixed instead: `findOrCreateDoc` reuses the existing Drive file by name.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/onlinetests/documentiChecks.test.ts` (reuse the fakes of the neighbouring `imported-table check reports only bounded heading diagnostics` test):

```typescript
test('imported-table check accepts the template static tables that also head a Valore column', () => {
  const runner = new RecordingRunner();
  jest.mocked(creaJobRunner).mockReturnValue({ resetJob: jest.fn() } as never);
  jest.mocked(avviaGenerazioneDataDriven).mockImplementation(() => undefined);
  const rows = [
    {
      ID_GEN: 'E2E_DOC_TABELLE',
      CLASSI: '1A',
      ID: 'generated-table-doc',
      LINK: 'https://drive.google.com/open?id=generated-table-doc',
      TIPO: 'E2E_TABELLE'
    }
  ];
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      if (key === 'drive') {
        return {
          getFileText: () =>
            'Tabelle importate per la classe 1A Nome Valore Prima riga 1 Seconda riga 2 ' +
            'Testo dopo la tabella con dati Testo dopo la tabella vuota ' +
            'Colonna Valore A Uno B Due Colonna Valore'
        } as T;
      }
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'tabelle-importate');

  expect(runner.callbacks.get('documenti.tabelleImportate::generazione e contenuto')).not.toThrow();
});

test('imported-table check rejects a second insertion of the header-only source sheet', () => {
  const runner = new RecordingRunner();
  jest.mocked(creaJobRunner).mockReturnValue({ resetJob: jest.fn() } as never);
  jest.mocked(avviaGenerazioneDataDriven).mockImplementation(() => undefined);
  const rows = [
    {
      ID_GEN: 'E2E_DOC_TABELLE',
      CLASSI: '1A',
      ID: 'generated-table-doc',
      LINK: 'https://drive.google.com/open?id=generated-table-doc',
      TIPO: 'E2E_TABELLE'
    }
  ];
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      if (key === 'drive') {
        return {
          getFileText: () =>
            'Tabelle importate per la classe 1A Nome Valore Prima riga 1 Seconda riga 2 ' +
            'Testo dopo la tabella con dati Nome Valore Testo dopo la tabella vuota'
        } as T;
      }
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'tabelle-importate');

  expect(runner.callbacks.get('documenti.tabelleImportate::generazione e contenuto')).toThrow(
    /occorrenze Nome=2/
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/documentiChecks.test.ts -t "imported-table"`
Expected: the first FAILS (three `Valore`), the second FAILS on the message (`occorrenze Nome=2` not yet emitted).

- [ ] **Step 3: Swap the sentinel and widen the diagnostics**

Replace lines 185-205 of `src/onlinetests/checks/documentiChecks.ts`:

```typescript
      const missingFragments = expectedFragments.filter((fragment) => !text.includes(fragment));
      const unresolvedTableMarker = /\{\{TABELLA:[^}]+\}\}/.test(text);
      const residualPlaceholderCount = (text.match(/\{\{[^}]*\}\}/g) ?? []).length;
      const expectedHeadingPresent = text.includes(expectedHeading);
      const headingPlaceholderRemains = text.includes(headingPlaceholder);
      // `Nome` is the only header cell unique to the imported source sheet. The template
      // carries two static tables of its own headed `Colonna | Valore`
      // (E2eTemplateProvisioner.TABELLE_IMPORTATE_TABLES), so `Valore` legitimately occurs
      // three times and cannot be a uniqueness sentinel. More than one `Nome` means the
      // header-only source sheet was wrongly materialised as a second table.
      const importedHeaderCount = countOccurrences(text, 'Nome');
      const diagnostics =
        `file ID=${fileId}; heading atteso presente=${expectedHeadingPresent}; ` +
        `placeholder letterale residuo=${headingPlaceholderRemains}; ` +
        `placeholder residui=${residualPlaceholderCount}; ` +
        `frammenti mancanti=[${missingFragments.join(' | ')}]; ` +
        `occorrenze Nome=${importedHeaderCount}`;
      if (
        missingFragments.length > 0 ||
        unresolvedTableMarker ||
        residualPlaceholderCount > 0 ||
        importedHeaderCount !== 1
      ) {
        new LoggerService().warn(`Tabelle importate: verifica contenuto fallita (${diagnostics})`);
```

Leave the `throw new ValidationError(...)` that follows unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/documentiChecks.test.ts`
Expected: PASS, including the pre-existing `placeholder residui=2` diagnostics test (the new fields are appended after it).

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/onlinetests/checks/documentiChecks.ts test/unit/onlinetests/documentiChecks.test.ts
git commit -m "fix: use the imported header as the sole table uniqueness sentinel"
```

---

### Task 4: Seed the full MATERIE catalog into every historical year

**Files:**

- Modify: `src/onlinetests/data/Seeders.ts:207-241` (`seedStorico`'s MATERIE block)
- Test: `test/unit/onlinetests/seeders.test.ts`

**Interfaces:**

- Consumes: `buildMaterieRows(): Row[]` from `src/onlinetests/data/SharedTestDatabaseBuilder.ts:104` — every base subject (`MAT`, `ITA`, `ING`, `STO`, `INF`, `IRC`, `ALT`, `GRECO`, `LATINO`, `FILOSOFIA`, `PSICOLOGIA`, `SCIUMANE`, `DIRECON`, `SCIENZE`, `FISICA`) plus the four dotted ids. Its `STO` row already carries `EVOLUZIONE = {"GST":[1,2],"STO":[3,4,5]}`, identical to the row `seedStorico` appends by hand today.
- Produces: prior-year `MATERIE` catalogs containing `INF` and `MAT`, which `ClasseRepository` needs to read the prior-year `INF`/`INF.itp`/`MAT` cattedra columns. Consumed by `storicoChecks.assertClasseStorico` and `itpDottedChecks` (`continuita titolare/ITP e campi assenti`).

`ClasseRepository`'s constructor builds `materieColumns` from `MATERIE` only (`src/infrastructure/repositories/ClasseRepository.ts:63-72`); a cattedra column whose subject is absent from that year's catalog is invisible, so `StoricoClassiService.perClasse` returns no `INF` teacher and `buildContinuita` produces no `itp` entry. `GST` stays hand-seeded — it is a storico-only subject absent from the current-year catalog.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/onlinetests/seeders.test.ts`:

```typescript
test('seedStorico seeds every current-year subject so prior cattedra columns resolve', () => {
  const prior = new FakeSampleSpreadsheet();
  for (const table of [TABLE.CLASSI, TABLE.MATERIE]) prior.addSheet(table, HEADERS[table]!);

  seedStorico(prior, ANNI_PRECEDENTI[0]!);

  const ids = prior.rows(TABLE.MATERIE).map((row) => String(row[COL_MATERIE.ID]));
  for (const expected of ['INF', 'MAT', 'STO', 'GST', 'INTERPRET.CHITARRA']) {
    expect(ids).toContain(expected);
  }
  expect(ids.filter((id) => id === 'STO')).toHaveLength(1);
});
```

Use whatever fake spreadsheet + row-reading helper the file already defines for `seedStorico` (see the existing storico tests in this file) rather than inventing `FakeSampleSpreadsheet`/`rows` if a different helper is present — keep the assertions.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/seeders.test.ts -t "prior cattedra columns"`
Expected: FAIL — `INF` and `MAT` are missing from the seeded catalog.

- [ ] **Step 3: Seed the whole catalog**

In `src/onlinetests/data/Seeders.ts`, replace the dotted-only loop and the hand-written `STO` append with a single full-catalog loop (keep the `GST` append above it untouched):

```typescript
// The prior-year CLASSI rows below carry the same header as the current-year sheet
// (MAT, GST, INF, INF.itp, INTERPRET.CHITARRA[.itp]), and ClasseRepository builds its
// cattedra-column map from MATERIE: a subject missing here makes its column invisible,
// so the storico continuity providers silently lose the INF titolare/ITP
// (2026-08-21 batch 3). Seed the full current-year catalog — buildMaterieRows already
// carries STO's EVOLUZIONE mapping — and keep GST, which is storico-only.
for (const row of buildMaterieRows()) {
  prior.appendRow(TABLE.MATERIE, row);
}
```

Then delete the now-duplicate `STO` append (`src/onlinetests/data/Seeders.ts:228-241`) and drop the `MATERIE_PUNTATE` import from that file if nothing else uses it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/seeders.test.ts`
Expected: PASS, including the round-1 test that asserted the dotted subjects are present.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/onlinetests/data/Seeders.ts test/unit/onlinetests/seeders.test.ts
git commit -m "fix: seed the full MATERIE catalog into each historical year

Fixture change: takes effect on GAS only after re-running creaDatiMockDrive."
```

---

### Task 5: Assert the docente-materia subtypes on the class the batch is scoped to

**Files:**

- Modify: `src/onlinetests/checks/itpDottedChecks.ts:96-149` (`itpDotted::identita assegnazioni, ruoli e ownership`)
- Test: `test/unit/onlinetests/itp-dotted-checks.test.ts`

**Interfaces:**

- Consumes: `CLASSE_A` from `src/onlinetests/data/SharedTestDatabaseBuilder.ts:57` (value `'1A'`) — the class named in `CONF_DOC_DOCENTE_MATERIA.CONDIZIONE` (`{{focus.classe.anagrafica.nome}} == '1A'`), and `ClasseRepository.getTeachingSlots(classe): TeachingSlotDescriptor[]`.
- Produces: nothing consumed by later tasks.

`1A` carries both `GRECO: e2edocente3` and `INTERPRET.CHITARRA: e2edocente5`, so the scoped batch does produce one base and one dotted document — the check just has to expect _that_ class's teachers. The ownership assertions above (kind/specifica/actor per column) stay on `FOCAL_CLASS` (`4A`), which is where the dotted ITP fixture lives. Widening the CONF_DOC condition instead would regenerate `4A`'s whole cattedra matrix and re-inflate the batch that killed batch 2 in round 1.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/onlinetests/itp-dotted-checks.test.ts`:

```typescript
test('subtype assertion expects the GRECO teacher of the batch-scoped class', () => {
  const runner = new RecordingRunner();
  const container = containerWithScopedBatch(
    {
      // 1A is the class CONF_DOC_DOCENTE_MATERIA.CONDIZIONE scopes the batch to.
      '1A': { GRECO: e2eDocenteEmail(3), 'INTERPRET.CHITARRA': e2eDocenteEmail(5) },
      '4A': { GRECO: e2eDocenteEmail(7), 'INTERPRET.CHITARRA': e2eDocenteEmail(5) }
    },
    [
      { ID_GEN: CONF_DOC_DOCENTE_MATERIA, SOTTOTIPO: `GRECO::${e2eDocenteEmail(3)}` },
      { ID_GEN: CONF_DOC_DOCENTE_MATERIA, SOTTOTIPO: `INTERPRET.CHITARRA::${e2eDocenteEmail(5)}` }
    ]
  );

  registerItpDottedChecks(runner as never, container, sample);

  expect(runner.callbacks.get('itpDotted::identita assegnazioni, ruoli e ownership')).not.toThrow();
});

test('subtype failure names the missing subtypes, not the found ones', () => {
  const runner = new RecordingRunner();
  const container = containerWithScopedBatch(
    {
      '1A': { GRECO: e2eDocenteEmail(3), 'INTERPRET.CHITARRA': e2eDocenteEmail(5) },
      '4A': { GRECO: e2eDocenteEmail(7), 'INTERPRET.CHITARRA': e2eDocenteEmail(5) }
    },
    [{ ID_GEN: CONF_DOC_DOCENTE_MATERIA, SOTTOTIPO: `INTERPRET.CHITARRA::${e2eDocenteEmail(5)}` }]
  );

  registerItpDottedChecks(runner as never, container, sample);

  expect(runner.callbacks.get('itpDotted::identita assegnazioni, ruoli e ownership')).toThrow(
    /mancanti GRECO::e2edocente3@onlinetest\.aldo\.local/
  );
});
```

Build `containerWithScopedBatch(classSlots, logDocsRows)` as a local helper in the test file, following the fake-container shape the file already uses: `classi.findById`/`getTeachingSlots` served from `classSlots` (including the `4A` ITP column `INTERPRET.CHITARRA.itp: e2edocente11`, which the ownership assertion reads), `documentBatchService.batchGenerateHandler` returning a generator that finishes immediately, and `db.table(TABLE.LOG_DOCS).findAll()` returning `logDocsRows`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/itp-dotted-checks.test.ts -t "subtype"`
Expected: both FAIL — the check expects `GRECO::e2edocente7@…` (the `4A` teacher) and reports the found subtypes.

- [ ] **Step 3: Read the scoped class and name what is missing**

In `src/onlinetests/checks/itpDottedChecks.ts`, replace the `expectedSubtypes` construction and the final throw:

```typescript
// The DOCUMENTO_DOCENTE_MATERIA batch is scoped by CONF_DOC.CONDIZIONE to CLASSE_A
// (SharedTestDatabaseBuilder — unscoped it generated 108 documents and killed batch 2
// on the execution limit). The ownership assertions above stay on FOCAL_CLASS, where
// the dotted-ITP fixture lives, but the generated-subtype assertion must read the
// scoped class or it expects a document the batch never produces.
const scopedSlots = classi.getTeachingSlots(requireClass(classi, CLASSE_A));
const scopedBase = scopedSlots.find((slot) => slot.column === 'GRECO');
const scopedDotted = scopedSlots.find((slot) => slot.column === DOTTED_ID);
if (scopedBase === undefined || scopedDotted === undefined) {
  throw new ValidationError(
    `${CLASSE_A}: la classe su cui è scopato il batch non espone sia GRECO sia ${DOTTED_ID}`
  );
}
const expectedSubtypes = new Set([
  `GRECO::${scopedBase.actorEmails[0]!}`,
  `${DOTTED_ID}::${scopedDotted.actorEmails[0]!}`
]);
```

and

```typescript
const subtypes = new Set(rows.map((row) => stringCell(row[COL_LOG_DOCS.SOTTOTIPO])));
const missingSubtypes = [...expectedSubtypes].filter((subtype) => !subtypes.has(subtype));
if (missingSubtypes.length > 0) {
  throw new ValidationError(
    `SOTTOTIPO base/dotted non distinto: mancanti ${missingSubtypes.join(', ')}; ` +
      `presenti ${[...subtypes].sort().join(', ') || '(nessuno)'}`
  );
}
```

Add `CLASSE_A` to the existing import from `../data/SharedTestDatabaseBuilder`, and keep the `base` lookup on `FOCAL_CLASS` that the ownership assertion above still uses.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/itp-dotted-checks.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/onlinetests/checks/itpDottedChecks.ts test/unit/onlinetests/itp-dotted-checks.test.ts
git commit -m "fix: assert docente-materia subtypes on the batch-scoped class"
```

---

### Task 6: Make batch 1 own the history reset

**Files:**

- Modify: `src/onlinetests/index.ts:187-192` (`FullOnlineTestDeps`), `:680-699` (`executeOnlineTestsBatch1` and its doc comment), `:753-761` (the `resetE2eHistoryTables` doc comment)
- Modify: `src/onlinetests/checks/articolazioneChecks.ts` (new prerequisite check)
- Test: `test/unit/onlinetests/fullOnlineTests.test.ts`, `test/unit/onlinetests/articolazione-checks.test.ts`

**Interfaces:**

- Consumes: `resetE2eHistoryTables(overrides?: Partial<FullOnlineTestDeps>): ResetE2eHistoryTablesResult` (`src/onlinetests/index.ts:762`).
- Produces: `FullOnlineTestDeps.resetHistory: (overrides: Partial<FullOnlineTestDeps>) => ResetE2eHistoryTablesResult` — an injection seam so the launcher can be tested without touching ScriptProperties.

The reset purges `LOG_MAIL`/`LOG_DOCS` and runs the fixture migration. Batches 2–4 consume the `LOG_DOCS`/`LOG_FOLD` rows batch 1 writes, so the only correct moment to purge is immediately before batch 1. Folding it into batch 1 removes the operator's chance to get it wrong; the standalone launcher stays for manual use.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/onlinetests/fullOnlineTests.test.ts`:

```typescript
test('batch 1 purges the history tables before running its groups', () => {
  const calls: string[] = [];
  const resetHistory = jest.fn(() => {
    calls.push('reset');
    return {
      purgedLogMail: 0,
      purgedLogDocs: 0,
      insertedMaterie: [],
      deletedAslColumn: false,
      warnings: []
    };
  });
  const registrations = {
    documenti: () => calls.push('documenti'),
    jobRunner: () => calls.push('jobRunner')
  };

  executeOnlineTestsBatch1({ ...batchOverrides(), resetHistory, registrations } as never);

  expect(calls[0]).toBe('reset');
  expect(calls).toContain('documenti');
});

test('batches 2-4 never purge the history tables', () => {
  const resetHistory = jest.fn();

  executeOnlineTestsBatch2({ ...batchOverrides(), resetHistory } as never);
  executeOnlineTestsBatch3({ ...batchOverrides(), resetHistory } as never);
  executeOnlineTestsBatch4({ ...batchOverrides(), resetHistory } as never);

  expect(resetHistory).not.toHaveBeenCalled();
});
```

`batchOverrides()` is whatever override bundle this file already uses to run a batch without GAS (`readSample`, `resetAldo`, `initAldo`, `clock`, `activeUser`, `registrations`); reuse it rather than writing a new one.

Append to `test/unit/onlinetests/articolazione-checks.test.ts`:

```typescript
test('articolazione prerequisite fails with an ordering hint when batch 1 left no LOG_DOCS', () => {
  const runner = new RecordingRunner();
  const container = containerWithLogDocs([]);

  registerArticolazioneChecks(runner as never, container, sample);

  expect(runner.callbacks.get('articolazione.prerequisiti::documenti di batch 1 presenti')).toThrow(
    /Batch 1 non eseguito su questa fixture/
  );
});
```

Reuse the file's existing fake-container helper for `containerWithLogDocs`; if none exists, build it in the same shape the other tests in that file use.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/fullOnlineTests.test.ts test/unit/onlinetests/articolazione-checks.test.ts`
Expected: FAIL — `resetHistory` is never called and the prerequisite check does not exist.

- [ ] **Step 3: Add the seam and call it from batch 1**

In `src/onlinetests/index.ts`, extend the deps interface:

```typescript
export interface FullOnlineTestDeps extends E2eTestDeps {
  readSample: (properties: IPropertiesFacade) => SharedTestDatabase;
  registrations: Partial<FullOnlineTestRegistrations>;
  spreadsheetService: FixtureSpreadsheetService;
  staticAttachmentDriveService: Pick<DriveService, 'getFiles'>;
  /** Injection seam for the pre-batch-1 purge (see `executeOnlineTestsBatch1`). */
  resetHistory: (overrides: Partial<FullOnlineTestDeps>) => ResetE2eHistoryTablesResult;
}
```

and replace `executeOnlineTestsBatch1`:

```typescript
/**
 * Batch launchers: same coverage as `runFullOnlineTests`, split to stay inside the 30-minute GAS
 * execution limit. Run them in order 1 → 2 → 3 → 4 against the same `creaDatiMockDrive` fixture:
 * batches 2–4 assert on LOG_DOCS/LOG_FOLD/LOG_MAIL rows that batch 1 produces. Batch 1 owns the
 * history purge, so there is no separate reset step to sequence by hand.
 */
export function executeOnlineTestsBatch1(
  overrides: Partial<FullOnlineTestDeps> = {}
): OnlineTestReport {
  // ORDER MATTERS. Running `resetE2eHistoryTables` between batch 1 and batch 2 purges the
  // LOG_DOCS rows every CONF_MAIL `documenti` box and the articolazione assertions read —
  // six batch-2 failures in the 2026-08-21 run. Owning the purge here makes that unforgeable.
  (overrides.resetHistory ?? resetE2eHistoryTables)(overrides);
  return executeOnlineTestsBatch(['documenti', 'jobRunner'], overrides);
}
```

Update the `resetE2eHistoryTables` doc comment: it is now the _manual_ form of what batch 1 does, and must never be run between batches.

- [ ] **Step 4: Add the articolazione prerequisite check**

At the top of `registerArticolazioneChecks` in `src/onlinetests/checks/articolazioneChecks.ts`, register the guard before any other check (mirroring `emailChecks.ts:65-82`):

```typescript
runner.add(
  groupName('articolazione.prerequisiti', 'documenti di batch 1 presenti'),
  sample.sampleSpreadsheetUrl,
  () => {
    const cdcRows = container
      .get<TableDatabase>('db')
      .table(TABLE.LOG_DOCS)
      .findAll()
      .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_RIEPILOGO_FIRME_CDC);
    if (cdcRows.length === 0) {
      throw new ValidationError(
        'Batch 1 non eseguito su questa fixture: LOG_DOCS non contiene documenti ' +
          `${CONF_DOC_RIEPILOGO_FIRME_CDC}, quindi ogni asserzione LOG_DOCS di questo gruppo ` +
          'legge zero righe. Esegui batch 1 (che purga e rigenera) e poi batch 2.'
      );
    }
  }
);
```

Add `groupName` to the imports from `../report/OnlineTestReport` if it is not already imported there.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/fullOnlineTests.test.ts test/unit/onlinetests/articolazione-checks.test.ts test/unit/onlinetests/reset-e2e-history-tables.test.ts`
Expected: PASS.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/onlinetests/index.ts src/onlinetests/checks/articolazioneChecks.ts test/unit/onlinetests
git commit -m "fix: fold the E2E history purge into batch 1"
```

---

### Task 7: Rebuild, push and re-run the four batches

**Files:**

- No source changes.

**Interfaces:**

- Consumes: every fix above.
- Produces: a fresh set of GAS console logs to replace `ONLINE_RESULTS/batch{1,2,3,4}.txt`.

- [ ] **Step 1: Run every offline gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
Expected: all green.

- [ ] **Step 2: Build and push the online bundle**

Run: `npm run push:online`
Expected: the offline suite re-runs as the push gate, then `clasp push` succeeds.

- [ ] **Step 3: Ask the user to re-run the suite in GAS, in this order**

1. `creaDatiMockDrive` — **required**: Task 4 only reaches GAS through a fresh fixture.
2. `runOnlineTestsBatch1` — now purges `LOG_MAIL`/`LOG_DOCS` itself; do **not** run `resetE2eHistoryTables` separately.
3. `runOnlineTestsBatch2`
4. `runOnlineTestsBatch3`
5. `runOnlineTestsBatch4`

- [ ] **Step 4: Compare the new logs against the round-2 baseline**

Expected: 0 failures across the four batches, and none of the round-1 regressions back — no `Step not found`, no `Utente non valido` retries, no read-quota failures, batch 2 finishing well inside the execution limit.

---

## Self-review

**Spec coverage:** all 14 observed failures map to a task — batch 1 ×1 → Task 3; batch 2 ×6 → Task 6; batch 3 ×4 → Tasks 4 (3 of them) and 5 (1); batch 4 ×3 → Tasks 1 (1) and 2 (2).

**Open risk, stated rather than hidden:** Task 4's root cause is proven by reading (`ClasseRepository` builds `materieColumns` from `MATERIE`; `seedStorico` never seeds `INF`), but it is the only fix whose confirmation requires the GAS re-run — an offline unit test can prove the catalog is seeded, not that the continuity providers then materialise the ITP. Task 3's root cause is likewise derived from the template fixture (`Valore` occurs three times) rather than from a residual log line, because the failing check does not print the per-fragment counts; Task 3 adds those counts so a repeat failure is self-diagnosing.
