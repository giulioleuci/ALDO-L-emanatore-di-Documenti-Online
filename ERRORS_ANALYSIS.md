# ERRORS_ANALYSIS.md

Analysis of the online GAS test execution (`ONLINE_RESULTS/batch1..4.txt`), run of
**2026-08-22** between 09:10:27 and 09:28:24 on the `online` build
(`dist/gas-source-map.json` generated 2026-08-22T06:21:11Z).

## 1. Executive summary

| Batch | Window | Tests | Passed | Failed | Verdict |
|-------|--------|-------|--------|--------|---------|
| batch1 | (log not retained) | — | — | 0 | ✅ "Zero errors!" |
| batch2 | 09:10:27 → 09:16:12 | 17 | 16 | **1** | ❌ Job `online_tests_batch2` failed (16 passed, 1 failed) |
| batch3 | 09:22:27 → 09:28:24 | 27 | 25 | **2** | ❌ Job `online_tests_batch3` failed (25 passed, 2 failed) |
| batch4 | (log not retained) | — | — | 0 | ✅ "All correct, no errors!" |

There are exactly **3 failed tests**, caused by **2 distinct error types**:

1. `ValidationError` — *"Invio verbale: gli artefatti LOG_MAIL non corrispondono ai VERBALE/LOG_FOLD persistiti"* (batch2, 1 test). Root cause: **CONFIRMED** — the seeded CONF_MAIL never enables folder resolution (`DATI_SORGENTE` missing on the cartelle box), so `LOG_MAIL.ALLEGATI.folders` is always `[]` while the test requires non-empty. See §2b. **Status: FIX APPLIED (offline-verified)** — commit `d9728b5`.
2. `ValidationError` — *"Storico E2E: titolare STO non materializzato"* (batch3, 2 tests, identical signature). Root cause: **CONFIRMED** — prior-year CLASSI fixture rows lose their `GST` value at write time because the column is absent from the declared header and the test framework's `appendRow` silently drops out-of-header keys. See §3. **Status: FIX APPLIED (offline-verified)** — commit `55ab0b0`.

All failures are **assertion failures thrown by the online tests themselves**
(`throw new ValidationError(...)`) — no unexpected runtime exceptions,
uncaught errors or infrastructure crashes occurred in either batch.

---

## 2. Error #1 — batch2: LOG_MAIL artifacts do not match persisted VERBALE/LOG_FOLD — ROOT CAUSE CONFIRMED

- **Test:** `email.invio::batch test mode + allegati LOG_MAIL`
- **Batch/job:** `online_tests_batch2` — final report `{ "passed": 16, "failed": 1 }`, duration 339190 ms
- **Test outcome:** `[TEST:END] FAIL | Duration: 51532ms` (log line 407)
- **Error type:** `ValidationError` (test assertion, thrown at `emailChecks.ts:188–190`)
- **Message:** `Invio verbale: gli artefatti LOG_MAIL non corrispondono ai VERBALE/LOG_FOLD persistiti`

### Raw stack trace (verbatim, log lines 396–406)

```
[ERROR:STACK] ValidationError: Invio verbale: gli artefatti LOG_MAIL non corrispondono ai VERBALE/LOG_FOLD persistiti
    at assertVerbaleArtifacts (OnlineTests:213361:19)
    at OnlineTests:213251:9
    at Object.fn (OnlineTests:172560:53)
    at EnhancedTestRunner._runTest (Code:50337:26)
    at EnhancedTestRunner.run (Code:50321:30)
    at TestRunner.add (OnlineTests:172570:82)
    at Object.registerEmailChecks [as email] (OnlineTests:213220:12)
    at executeOnlineTestsBatch (OnlineTests:261113:31)
    at executeOnlineTestsBatch2 (OnlineTests:261195:12)
    at runReportedSuite (OnlineTests:261144:52)
```

### Stack frames resolved to original TypeScript source (via `dist/gas-source-map.json`)

| Minified frame | Original source |
|----------------|-----------------|
| `OnlineTests:213361:19` | `src/onlinetests/checks/emailChecks.ts:189` — **exact throw point**, inside `assertVerbaleArtifacts()` |
| `OnlineTests:213251:9` | `src/onlinetests/checks/emailChecks.ts:102` — invocation of `assertVerbaleArtifacts(verbaleRows, db.table(TABLE.LOG_DOCS).findAll(), db.table(TABLE.LOG_FOLD).findAll())` in the test body (lines 99–103) |
| `OnlineTests:172560:53` | `src/onlinetests/report/OnlineTestReport.ts:56` — generic test-function wrapper (`Object.fn`) |
| `Code:50337:26` / `Code:50321:30` | Vendor bundle (`EnhancedTestRunner._runTest` / `.run`, GasLibraryFactory prelude) — intentionally unmapped |
| `OnlineTests:172570:82` | `src/onlinetests/report/OnlineTestReport.ts:59` |
| `OnlineTests:213220:12` | `src/onlinetests/checks/emailChecks.ts:87` — registration block `registerEmailChecks` |
| `OnlineTests:261113:31` | `src/onlinetests/index.ts:623` — `executeOnlineTestsBatch` |
| `OnlineTests:261195:12` | `src/onlinetests/index.ts:711` — `executeOnlineTestsBatch2` |
| `OnlineTests:261144:52` | `src/onlinetests/index.ts:652` — `runReportedSuite` |

### Exact failure point

`assertVerbaleArtifacts()` in `src/onlinetests/checks/emailChecks.ts:174–193`.
For every testMode `VERBALE` row in `LOG_MAIL` it requires **all** of:

1. `attachments.docs` is a non-empty string list;
2. `attachments.folders` is a non-empty string list;
3. `attachments.attach` is an **empty** list;
4. every id in `docs` matches a row in `LOG_DOCS` with `ID === id && ID_GEN === CONF_DOC_VERBALE && TIPO === 'VERBALE' && LINK !== ''` (`isPersistedVerbale`, lines 226–234);
5. every id in `folders` matches a row in `LOG_FOLD` with `ID === id && LINK !== ''` (`isPersistedFolder`, lines 236–241).

The `ValidationError` fires when **at least one** of these conditions fails for some
testMode verbale `LOG_MAIL` row. Note that a malformed/missing JSON in the
`ALLEGATI` column makes `attachmentsFor()` silently return `{}` (lines 195–204),
which also trips condition 1/2 — so both "artifacts not persisted" and
"attachment metadata unreadable" produce this same message.

### Evidence from the run

- All three mail jobs completed successfully *before* the assertion ran:
  `mail_E2E_MAIL_VERBALE` (15.4 s), `mail_E2E_MAIL_PIANI` (14.4 s),
  `mail_E2E_MAIL_STORICO` (21.4 s) — each ended with `🏁 [COMPLETED]`,
  pipeline `8 executed, 1 skipped, 0 failed`, including `[LogEmail] EXECUTED`.
- Therefore the send/log pipeline itself worked; the mismatch is in what was
  recorded as `ALLEGATI` on the `LOG_MAIL` row versus what is actually present
  in the `LOG_DOCS` / `LOG_FOLD` tables for the verbale pattern.

## 2b. Error #1 root cause — CONFIRMED via DB dump (`ONLINE_RESULTS/_ALDO_E2E_SAMPLE.xlsx`)

Evaluating `assertVerbaleArtifacts` against the real persisted tables:

- All **3** `E2E_MAIL_VERBALE` testMode rows (STATO=SUCCESS, safe recipient) fail
  **exactly one condition**: `folders` is `[]`. The docs side is perfect — every
  doc id exists in `LOG_DOCS` with `ID_GEN='E2E_VERBALE'`, `TIPO='VERBALE'` and a
  valid LINK.
- Across **all 29** LOG_MAIL rows (every pattern), `folders=0` everywhere — no
  mail ever recorded a folder.
- The verbale folders **do exist** in `LOG_FOLD`: three rows `TIPO='E2E_VERBALE'`
  named 1A / 2B / 3C with valid links, created by the doc-generation job.

### Confirmed root cause: CONF_MAIL fixture never enables folder resolution

The mail pipeline behaves exactly as configured; the seeded configuration can
never populate `folders`:

1. `seedConfMail` (`SharedTestDatabaseBuilder.ts:1247–1254`) seeds VERBALE's
   cartelle box as `{ TIPO_BOX: 'cartelle' }` — no `DATI_SORGENTE`. The inline
   comment reveals the confusion: it justifies the omission with "attachment is
   opt-in … no PDFs from getBlob()" — but that concerns the **ALLEGATI column**
   (real file attachments), not the box's **folder resolution**.
2. In `renderBoxes` (`src/application/email/boxes.ts:535+`),
   `cartelleMetodo = str(cartelleCfg?.['DATI_SORGENTE']?.metodo)` → `''`, so the
   guard `cartelleMetodo === 'cartellePerClasse' && aggregatoreDati !== undefined
   && classeIds !== undefined` fails → `realCartelle = null`.
3. Fallback path: `renderedFolderIds = boxdata.cartelle.items.filter(tipo ===
   'CARTELLA')` — CDU *document* items only. The verbale flow generates
   documents of TIPO `VERBALE`; folders exist solely as LOG_FOLD rows, so this
   yields `[]`.
4. `LogEmailStep` (`emailSteps.ts:745`) writes
   `folders: ctx.get('cartelleFolderIds') ?? []` → `[]`.
5. Assertion condition 2 (`isNonEmptyStringList(attachments.folders)`) fails on
   all three rows → the observed ValidationError.

Corroboration that this is a fixture gap, not a production defect:

| Evidence | Source |
|----------|--------|
| `E2E_MAIL_LAVORO` carries the correct config `{TIPO_BOX:'cartelle', DATI_SORGENTE:{metodo:'cartellePerClasse'}}` | CONF_MAIL row in the dump |
| `AggregatoreDati` is always instantiated and passed to `RenderBoxesStep` | `ApplicationComposition.ts:125`, `EmailNotificationService.ts:316` |
| Folder data is present and well-formed | 3 × LOG_FOLD E2E_VERBALE rows |
| Docs audit path works end-to-end | all verbale doc ids verified |

Also latent: `E2E_MAIL_CONDOTTA` has the same missing config, but no assertion
checks its folders today.

### Fix directions (not applied)

1. **Fixture fix (recommended)**: add
   `"DATI_SORGENTE":{"metodo":"cartellePerClasse"}` to the cartelle box of
   `E2E_MAIL_VERBALE` (and `E2E_MAIL_CONDOTTA` for consistency) in
   `seedConfMail`. This makes the mails actually exercise the folder-sharing
   audit path the test asserts — matching the LAVORO precedent and test intent.
2. Alternative (not recommended): relax the test to accept empty folders —
   weakens exactly the check the assertion author wrote it for.

---

## 3. Error #2 and #3 — batch3: STO titolare not materialized (×2) — ROOT CAUSE CONFIRMED

- **Tests (both failing identically):**
  - `storico.classe::statistiche, progetti e referente` — `[TEST:END] FAIL | Duration: 105ms`
  - `storico.classe::continuità CdC, ITP ed evoluzione materie` — `[TEST:END] FAIL | Duration: 105ms`
- **Batch/job:** `online_tests_batch3` — final report `{ "passed": 25, "failed": 2 }`
- **Error type:** `ValidationError` (test assertion helper `fail()`)
- **Message:** `Storico E2E: titolare STO non materializzato`

### Raw stack trace #1 (verbatim, log lines 683–693)

```
[ERROR:STACK] ValidationError: Storico E2E: titolare STO non materializzato
    at fail (OnlineTests:245939:11)
    at asRecord (OnlineTests:245949:9)
    at OnlineTests:246231:16
    at Array.some (<anonymous>)
    at assertClasseStorico (OnlineTests:246228:13)
    at OnlineTests:246458:13
    at Object.fn (OnlineTests:172560:53)
    at EnhancedTestRunner._runTest (Code:50337:26)
    at EnhancedTestRunner.run (Code:50321:30)
    at TestRunner.add (OnlineTests:172570:82)
```

### Raw stack trace #2 (verbatim, log lines 707–717)

```
[ERROR:STACK] ValidationError: Storico E2E: titolare STO non materializzato
    at fail (OnlineTests:245939:11)
    at asRecord (OnlineTests:245949:9)
    at OnlineTests:246231:16
    at Array.some (<anonymous>)
    at assertClasseStorico (OnlineTests:246228:13)
    at OnlineTests:246466:13
    at Array.map (<anonymous>)
    at materializeClassHistory (OnlineTests:246452:22)
    at OnlineTests:246464:20
    at Object.fn (OnlineTests:172560:53)
    at EnhancedTestRunner._runTest (Code:50337:26)
    at EnhancedTestRunner.run (Code:50321:30)
    at TestRunner.add (OnlineTests:172570:82)
```

### Stack frames resolved to original TypeScript source

| Minified frame | Original source |
|----------------|-----------------|
| `OnlineTests:245939:11` | `src/onlinetests/checks/storicoChecks.ts:31` — `fail()`: `throw new ValidationError('Storico E2E: ' + message)` |
| `OnlineTests:245949:9` | `src/onlinetests/checks/storicoChecks.ts:35` — `asRecord(value, label)`: fires `${label} non materializzato` when value is `null` / not an object |
| `OnlineTests:246231:16` | `src/onlinetests/checks/storicoChecks.ts:173` — **exact throw point**: `asRecord(anno.titolare, 'titolare STO')` inside the `stoAnni.some(...)` predicate |
| `Array.some (<anonymous>)` | native — iterating `continuita.docentiAnniPrecedenti` of subject `STO` |
| `OnlineTests:246228:13` | `src/onlinetests/checks/storicoChecks.ts:172` — `assertClasseStorico()` |
| `OnlineTests:246458:13` | `src/onlinetests/checks/storicoChecks.ts:310` — test body #1: `assertClasseStorico(storico, cdu.focus.classe?.materie)` |
| `OnlineTests:246466:13` | `src/onlinetests/checks/storicoChecks.ts:318` — test body #2: same assertion on second sample spreadsheet |

### Exact failure point and meaning

`src/onlinetests/checks/storicoChecks.ts:167–177`, inside `assertClasseStorico()`:

```ts
const sto = asRecord(bySigla('STO').continuita, 'continuità STO');
const stoAnni = asArray(sto.docentiAnniPrecedenti, 'continuità STO anni');
if (
  stoAnni.length !== 2 ||
  stoAnni.some((anno) =>
    asRecord(anno.titolare, 'titolare STO').email !== 'e2edocente4@onlinetest.aldo.local'
  )
) {
  fail('evoluzione GST verso STO non riconciliata su due anni');
}
```

The assertion expects class **STO** to expose exactly two historical years whose
`docentiAnniPrecedenti[*].titolare` are all materialized as
`e2edocente4@onlinetest.aldo.local`. One of the two entries has `titolare === null`.

Both tests build the CDU for the same fixture class (`CLASSE_C_PARENT`, depth 2)
and call the same assertion, hence the identical failure; everything checked
*before* this point (statistiche, progetti/referenti, INF continuity, MAT
"no ITP" shape) passed.

### Production path that produced the `null`

`focus.classe.materie[].continuita` is built by
`MaterieClasseProvider.attachContinuita()` →
`buildContinuita()` (`src/application/context-engine/mappers/continuitaMapper.ts:43–58`):

```ts
titolare: resolveDocente(titolareMatch?.docenteEmail, input.docenti)
```

No docente row of either historical year reconciles to the current sigla `STO`
(`reconcileSigla(d.materia, annoCorsoStorico, [materiaCorrente]) !== 'STO'` for
all rows), so `titolareMatch` stays `undefined` and `resolveDocente(undefined)`
returns `null`. This mechanism itself was verified correct — the defect sits
upstream, in the fixture write path.

### Confirmed root cause: prior-year CLASSI rows lose their GST value at write time

The historical `GST` teaching slot never reaches the physical sheets, because of
an interaction between two fixture facts:

1. **The CLASSI header used for the prior-year spreadsheets has no `GST`
   column.** Prior sheets are created with `prior.addSheet(table, HEADERS[table])`
   (`Seeders.ts:94`), and `HEADERS[TABLE.CLASSI] = [...COL_CLASSI,
   ...ASSIGNMENT_COLUMNS_E2E]`. The assignment columns derive from
   `ASSIGNMENT_MATERIE_E2E` (union of all `MATERIE_PER_INDIRIZZO` values plus
   `'INF'`, all built from `MATERIE_BASE = ['MAT','ITA','ING','STO','IRC','ALT']`)
   plus `INF.itp`, `MATERIE_PUNTATE` and `INTERPRET.CHITARRA.itp`.
   **`GST` appears in none of these sets** (`fixtures.ts:117–132`) — it is a
   storico-only subject.
2. **The library's `appendRow` silently drops keys outside the declared header.**
   `SampleSpreadsheetBuilder.appendRow` (vendor bundle) maps values strictly by
   the header declared via `addSheet`:

   ```js
   const values = headerRow.map(header => row[String(header)] !== undefined ? row[String(header)] : '');
   ```

   So when `seedStorico` writes `GST: e2eDocenteEmail(4)` into the prior CLASSI
   rows (`Seeders.ts:134`), **the key is discarded and the physical cell stays
   empty**.

Downstream effect chain (fully verified):

- `ClasseRepository(priorDb)` builds its cattedra column map from the PRIOR
  MATERIE catalog — which *does* contain GST since commit `715072e` — but
  `getTeachingSlots('2C')` / `('1C')` read an empty `row['GST']` and emit no GST
  slot;
- `perClasse()` therefore returns docenti lists without any GST entry for both
  years; `buildContinuita()` finds no match reconciling to `STO`;
- `titolare === null` on **both** historical years → the `.some()` predicate
  fires on the first entry → identical failure on both sample spreadsheets.

### Why every other assertion still passes

| Passing check | Why unaffected |
|---------------|----------------|
| statistiche / progetti / referente | Do not read CLASSI cattedre |
| INF continuity + ITP subtype | `INF` / `INF.itp` **are** in the declared header |
| MAT "no ITP" shape | `MAT` column present |
| Alunno carenze GST→STO (PASSES) | Reads CARENZE, whose canonical header **includes** `'GST'` (added by `5ce6283`); reconciles against the prior db's own MATERIE catalog — never touches CLASSI cattedre |
| Offline unit tests (push gate green) | Unit tests feed `buildContinuita` hand-built `docenti` arrays containing `{ materia: 'GST' }`; they bypass the physical write path entirely |

### Timeline (git)

| Commit | Date | Role in this bug |
|--------|------|------------------|
| `b15e95d` | 08-13 12:33 | Introduced storico E2E tests and the `GST→d4` write into prior CLASSI rows — broken from day one |
| `5ce6283` | 08-13 12:47 | The same facade had already eaten the CARENZE GST value; fixed **only CARENZE** by appending `'GST'` to its header — CLASSI left unfixed |
| `715072e` | 08-21 | Repaired the *repository visibility* layer (full MATERIE catalog seeded into priors), unblocking INF/MAT continuity; but GST visibility was already there via its explicit MATERIE row — the *physical write* layer remained broken |

### Fix directions (not applied)

1. **Fixture fix (ALDO-side, minimal)**: make `GST` appear in the CLASSI header
   of the prior-year spreadsheets only (e.g. extend the header when creating
   prior sheets in `seedAnniPrecedenti`), mirroring the `5ce6283` precedent.
2. **Library hardening (GasLibraryFactory)**: `appendRow` dropping unknown keys
   silently has now produced two distinct bugs (CARENZE on 2026-08-13, CLASSI
   today). Consider warning or throwing on out-of-header keys so this class of
   bug fails loudly at write time instead of surfacing as a distant assertion
   failure days later.

---

## 4. Non-failures deliberately excluded from the count

These appear alarming in the logs but are **not defects**:

| Log evidence | Location | Explanation |
|--------------|----------|-------------|
| `❌ [FAILED] Job 'import_E2E_IMP_MISSING_FILE' … MISSING_FOLDER … MISSING_IDGEN … BAD_STRATEGY` (4 lines) | batch3 lines 234–252 | Intentional negative-path assertions of test `import.policy::misconfig fallisce prima di mutare il target` — the test itself **PASSED** (line 254). Config-validation errors are the expected outcome. |
| `[WARN] [Operation] Retry attempt 1 after error: … Quota exceeded … 'Read requests per minute per user'` ×2 | batch3 lines 372, 607 | Sheets API quota backpressure during heavy import tests; both recovered: `[RECOVERED] Operation after 2 attempts`. |
| `[WARN] LockService not available - using mock lock for testing` | batch2/batch3, several | Expected in online test mode. |
| `[WARN] CERCA_DOCUMENTI: documento 1wsAkhkvjliwh3WHOhqCT3ZFGofq3N-6ArIO8_xdtQDg non e un foglio, saltato` | batch3 line 495 | Expected skip logic (non-Sheet document ignored). |
| `[WARN] [Transformer] Source data is empty, returning empty array` (~25×) | batch3 lines 555–629 | Chunked-import resume test reading drained ranges; test PASSED. |
| `SHEET_CON_MATERIE_E_PERMESSI: protezione Sheet1!X:X saltata — solo principal sintetici` (24×) | batch3 lines 2586–2633 | ACL guard correctly refuses real-domain principals with synthetic-only fixtures; ACL tests PASSED. |

---

## 5. Recommended next steps

1. **Verbale artifacts (batch2) — diagnosed, fix pending.** Root cause confirmed
   in §2b (missing `DATI_SORGENTE.metodo='cartellePerClasse'` on the cartelle
   box). Apply fixture fix §2b item 1.
2. **STO continuity (batch3) — diagnosed, fix pending.** Root cause confirmed in
   §3 (GST column missing from prior CLASSI header + silent `appendRow` drop).
   Apply the fixture fix from §3 "Fix directions" item 1; decide separately on
   the `GasLibraryFactory` hardening proposal (item 2), which requires a
   library-side change.
3. Consider logging the offending row's key fields inside the assertions
   before throwing, so future runs identify the exact artifact without DB spelunking.
4. Both fixes above have landed and are offline-verified (`npm run typecheck`,
   `npm run lint`, `npm test` all clean): commit `d9728b5` (verbale/condotta
   folder resolution) and commit `55ab0b0` (GST cattedra column on prior-year
   CLASSI sheets). Online re-verification via `build:online`/`push:online` and
   GAS console batch2/batch3 reruns is still pending — not yet claimed green.

**Status: all 3 failures fully diagnosed — both root causes are fixture
configuration gaps, no production code defect found.**
