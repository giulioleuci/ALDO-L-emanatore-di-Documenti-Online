# Design: Four new online e2e case studies

Date: 2026-07-26
Status: approved (pending user spec review)

## Purpose

Extend ALDO's online e2e test suite (`src/onlinetests/`) with four new scenarios that exercise real-GAS behavior not yet covered by the existing 8-scenario suite (`E2eSampleDatabaseBuilder`, `E2eTemplateProvisioner`, `checks/e2eScenarioChecks.ts`):

1. Importing a PCTO/ASL hours sheet into the `ASL` table via `GasDataImporter`.
2. A complex Google Doc template exercising `WorkspaceTemplateEngine`'s full placeholder surface (bullet/numbered lists, table row/column loops, pipe-filter sorting/filtering).
3. Real per-subject column protection on a Google Sheet (`SHEET_CON_MATERIE_E_PERMESSI`).
4. Sending coordinators an email with a real file attachment (work plan) and a real folder link (meeting-minutes folder), verified end to end including the `LOG_MAIL` audit trail.

All four are additions to the existing online suite, following its established conventions: fixed-name idempotent Drive artifact provisioning, `TEST_MODE` guard before any real send, and `runner.add(...)` checks that assert against real GAS/Sheets/Drive/Gmail state, not mocks.

Scoped as **one combined design + one combined implementation plan** (per user decision): the four scenarios share all their plumbing and were investigated together; splitting them into separate cycles would duplicate setup for no benefit.

## Two production gaps found during investigation (both approved to fix)

These are pre-existing ALDO-side gaps, not `GasLibraryFactory` gaps — no library extension is needed for either.

1. **`ComposeEmailStep` hardcodes `folders: []`** when building the `LOG_MAIL.ALLEGATI` audit record (`src/application/pipelines/emailSteps.ts:463`), even though the domain VO `AllegatiInfo.getCartelle()` already exists to read folder IDs back out. Fix: populate `folders` from the same resolution added for gap 2, mirroring how `allegatiIds`/`docs` already works.
2. **The `cartelle` email box's real-folder data path is dead code.** `AggregatoreDati.getCartellePerClasse` (backed by real `LOG_FOLD` folders) is registered in the DI container (`Bootstrap.ts`) but has zero call sites anywhere in the pipeline. `boxes.ts`'s own `aggregaDati` only ever sources `cartelle` items from CDU-embedded `LOG_DOCS` rows filtered by `tipo === 'CARTELLA'` — and `RegisterDocumentStep` always writes a cloned **file** ID to `LOG_DOCS.ID`, never a folder ID, so that path can structurally never carry a real Drive folder. Fix: thread `AggregatoreDati` into the box-rendering call chain so a `BOX_CFG` entry for `cartelle` can opt in with `DATI_SORGENTE.metodo: 'cartellePerClasse'` (mirroring the existing `documentiPerClasse` opt-in already used for file-attachment resolution), and use its real `LOG_FOLD` results instead of (for that box only) the CDU-embedded ones.

## Scenario A — ASL/PCTO import

**New `CONF_IMP` row** `E2E_IMPORT_ASL`:
- `CONFIG.searchStrategy = 'FILE_SINGOLO'`, `fileId` = the provisioned sheet's ID
- `CONFIG.map` = 3 plain column-to-column renames (email → `STUDENTE`, anno → `ANNO`, ore → `ORE`) — no constant/computed-field injection needed
- `CONFIG.key = 'STUDENTE'`, `CONFIG.conflictResolution = 'OVERWRITE'` (ASL has no timestamp column, and every row in one batch shares the same `ANNO`, so `STUDENTE` alone is a safe conflict key for this import)
- `TARGET = TABLE.ASL`

**New provisioned Drive artifact**: an idempotent find-or-create Google Sheet (extends `E2eTemplateProvisioner`'s pattern, or a small sibling method on it) with 3 columns — `STUDENTE`, `ANNO`, `ORE` — populated with only 3rd-year students. ALDO's e2e fixture already has a 3rd-year class (`CLASSE_C = '3C'`, plus its articulated partner `3C-LC`), so the sheet rows are drawn from `ALUNNI` rows belonging to those two classes — no new fixture-scoping logic needed, this is a pure fixture-authoring choice.

**New e2e scenario**: calls `ImportService.executeImport('E2E_IMPORT_ASL')`, asserts `inseriti + aggiornati` equals the seeded row count and zero errors, then asserts `db.table(TABLE.ASL).findAll()` contains one row per seeded student with the expected `ORE`.

## Scenario B — complex Doc template

**New `CONF_DOC` row** `E2E_DOC_COMPLESSO` (`GENERATORE: 'DOCUMENTO_GENERICO'`, same shape as the existing `E2E_RIEPILOGO` row), generated per class like the other class-scoped e2e doc types.

**New template** (added to `E2eTemplateProvisioner`), demonstrating, against real CDU paths (`02_CDU_STRUTTURA.md`):
- `{{#bullet_list:...}}` and `{{#number_list:...}}` — e.g. bulleted coordinatori, numbered rappresentanti
- `{{#tablerow_loop:...}}` and `{{#tablecol_loop:...}}` — e.g. a student roster table (row loop) and a subjects-as-columns table (col loop)
- Pipe filters `sortBy`, `where`, `uppercase`, `join` applied both within loop bodies (per-item, documented-safe usage) and, as an implementation-time experiment verified first in a unit test against `TemplateEngineFacade`, on the loop's own source expression (e.g. `{{#bullet_list:focus.classe.studenti.listaCompleta | sortBy:'anagrafica.cognome'}}`) — if that composition isn't actually supported by the engine, the plan falls back to pre-sorting/pre-filtering the data at the CDU/context level and demonstrates the pipe filters only in their documented per-item position.

**New e2e scenario**: generates for all e2e classes, asserts `LOG_DOCS` persisted (same idiom as scenarios 1/2/8), and additionally reads the generated Doc's body back via the Drive/Document facade to assert no unresolved `{{...}}` tokens remain — a real-GAS correctness check none of the existing scenarios currently do, made possible because this is the online suite.

## Scenario C — sheet protection

**New `CONF_DOC` row** `E2E_SHEET_PERMESSI` using the already-implemented, already-production-registered `GENERATORE: 'SHEET_CON_MATERIE_E_PERMESSI'` (`Bootstrap.ts`) — currently unexercised by any e2e scenario despite being live code. No new production code needed for the generator itself; only a CONF_DOC row and an assertion.

**New e2e scenario**: generates for all e2e classes, then calls the real Sheets Advanced API read-back (`SpreadsheetService.getProtectedRanges`, already exposed, already used symmetrically with `protectRanges`) and asserts, per subject column, that the protected range's editors match the expected `DOCENTE_MATERIA`-resolved teachers (via `RisolutoreRuoliService`, `GestioneSupplenti.ENTRAMBI`) plus the class coordinators — exercising real GAS ACL state, not just "generation didn't throw."

## Scenario D — coordinator email with file + folder

**Fixture adjustment**: `CONF_DOC_VERBALE`'s `PATH_OUT` currently resolves to the same literal `_ALDO_E2E_OUTPUT` path for every class. Because `AlberoCartelle.findOrCreate` only inserts a new `LOG_FOLD` row when neither the audit trail nor a live Drive lookup already resolves that exact path, and `PrepareInfrastructureStep` passes each class only as a `CLASSI`-CSV membership check (not appended to an existing row), a shared literal path means only the **first** class generated ever gets a `LOG_FOLD` row — every subsequent class's `PATH_OUT` resolves to the same folder without ever registering that class. This is a latent gap in the existing fixture (harmless today because nothing reads `LOG_FOLD` per-class yet) that scenario D's real per-class folder lookup would immediately expose. Fix, scoped to the fixture only: change `CONF_DOC_VERBALE.PATH_OUT` to include the class name (e.g. `_ALDO_E2E_OUTPUT/{{focus.classe.anagrafica.nome}}`), giving each class a distinct physical path and therefore its own `LOG_FOLD` row — the class's Verbale destination folder becomes "the meeting-minutes folder" for scenario D, with no new CONF_DOC needed for the folder itself.

**New `CONF_DOC` row** `E2E_PIANO_LAVORO` (`TIPO: 'PIANO_LAVORO'`, `GENERATORE: 'DOCUMENTO_GENERICO'`), same per-class generation shape as the other e2e doc types, giving coordinators a real file to receive as an attachment.

**New `CONF_MAIL` row** `E2E_MAIL_LAVORO` (`PROCESSO: 'PER_COORDINATORE'`, same target style as `CONF_MAIL_VERBALE`):
```json
[
  { "TIPO_BOX": "documenti", "FILTRO_TIPO": "E2E_PIANO_LAVORO",
    "DATI_SORGENTE": { "metodo": "documentiPerClasse", "filtri": { "tipo": "E2E_PIANO_LAVORO" } } },
  { "TIPO_BOX": "cartelle",
    "DATI_SORGENTE": { "metodo": "cartellePerClasse" } }
]
```
The `documenti` box's `DATI_SORGENTE` opts `ComposeEmailStep.resolveAllegati` into attaching the real work-plan file as a Gmail blob (existing mechanism, already used this way for other patterns). The `cartelle` box's `DATI_SORGENTE` is new — it's what the two production-gap fixes above make possible: a real `LOG_FOLD` folder rendered as a link in the body **and** recorded in `LOG_MAIL.ALLEGATI.folders`.

**New e2e scenario**: generates `E2E_VERBALE` and `E2E_PIANO_LAVORO` for all e2e classes (establishing both the folder and the file), then calls `sendPattern('E2E_MAIL_LAVORO')` and asserts `sent > 0`, zero skipped/errors (same idiom as scenarios 4/5), then reads back the `LOG_MAIL` row(s) and asserts `ALLEGATI.docs` contains the piano-lavoro file ID and `ALLEGATI.folders` contains the class's Verbale folder ID.

## Testing

Every new scenario follows the existing suite's pattern exactly: registered via `runner.add(label, url, fn)`, throws `ValidationError` with a descriptive message on any assertion failure, runs only after the existing `TEST_MODE` guard. The two production fixes (boxes.ts wiring, ComposeEmailStep folders) get unit tests in `test/unit/application/` alongside the existing box/email-step test files, following TDD, before being exercised online. `ImportRecipeMapper`/`ImportService` already have unit coverage; no changes needed there since Scenario A adds only data (a CONF_IMP row + fixture rows), not new import-engine code.

## Out of scope

- No changes to `GasLibraryFactory` — every capability used (dynamic_columns ACL, bullet/number_list, tablerow/tablecol_loop, pipe filters, protectRanges/getProtectedRanges, ImportEngine FILE_SINGOLO) already exists in the library and is already documented or already used in production ALDO code.
- No fix to `AlberoCartelle`'s `LOG_FOLD` schema gap (missing `TIPO`/`NOME`/`MATERIA` columns on insert, per `01_SCHEMA_DATABASE.md`) beyond what Scenario D's fixture adjustment needs — that's a separate, broader cleanup not required for these scenarios to pass.
- `LOG_MAIL.ALLEGATI.folders`/`cartelle`-box wiring is fixed only to the extent Scenario D needs (one opt-in `DATI_SORGENTE.metodo`); no redesign of the box-rendering data-injection architecture beyond threading `AggregatoreDati` through where needed.
