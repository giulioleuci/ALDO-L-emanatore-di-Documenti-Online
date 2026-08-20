# Design Spec — Four Features for SGSA

**Date**: 2026-08-19
**Status**: Approved
**Scope**: Email teacher class subjects, database validation, document lock, MATERIE table extension

---

## Feature 1 — Email Each Teacher Their Class Subject Structure

### Goal

Send each teacher an email containing the name of their class and a bulleted list of the subjects they are assigned to teach in that class (full subject name only).

### Approach

New `CONF_MAIL` record + new `TIPO_BOX` `materie_classe` registered in the box composer.

The existing `PER_DOCENTE` process already iterates over each (teacher, class) pair. The CDU for this target (`DOCENTE_COMPLETO`) has access to `focus.classe` with the full teaching assignment matrix. A new box type extracts the subjects where the target teacher's email appears in the class's dynamic columns and renders them as a `<ul>` of full names.

### New TIPO_BOX: `materie_classe`

Registered in `createBoxComposer()` in `src/application/email/boxes.ts`.

**Data extraction** (`agregaDati` in `boxes.ts`):
- For each dynamic column in `focus.classe` whose name matches a `MATERIE.ID` (excluding `.itp`), check if the target teacher's email is present in the CSV value.
- If present, collect `MATERIE.NOME` (full name) for that materia.
- Expose as `boxdata.materieAssegnate: string[]` in the CDU context.

**Renderer** (`renderMaterieClasseBox`):
```html
<ul style="margin:0; padding-left:20px; font-size:14px; color:#555;">
  <li>Matematica</li>
  <li>Fisica</li>
  ...
</ul>
```

**Empty behavior**: HIDE (no box rendered if teacher has no subjects in the class — edge case).

### CONF_MAIL Record

| Field | Value |
|---|---|
| `ID` | `ELENCO_MATERIE` |
| `PROCESSO` | `PER_DOCENTE` |
| `OGGETTO` | `Ipotesi assegnazione cattedre per l'anno scolastico appena iniziato (prof/prof.ssa {{focus.destinatario.anagrafica.nome}} {{focus.destinatario.anagrafica.cognome}})` |
| `BOX_CFG` | `[{ "TIPO_BOX": "materie_classe" }]` |
| `TESTO` | *(empty)* |
| `SUPPLENTI` | `SOLO_TITOLARI` |
| `NOREPLY` | `true` |
| `GESTIONE_ARTICOLAZIONE` | `COMPLETA` |
| `DUPLICAZIONE` | `PERMESSA` |
| `ALLEGATI` | `[]` |

### Email Content

The email body contains only the box output:
- **Box title**: "Class Name" (e.g., "3C")
- **Box content**: Bulleted list of full subject names

### Files to Modify

| File | Change |
|---|---|
| `src/application/email/boxes.ts` | Register `materie_classe` TIPO_BOX in `createBoxComposer()`, add `renderMaterieClasseBox` renderer, add data extraction in `agregaDati()` |
| `src/application/email/boxes.ts` | Add `materie_classe` to `DEFAULT_TITLES` map |
| `src/config/schema.ts` | No change (CONF_MAIL schema already supports arbitrary ID values) |
| `src/onlinetests/data/SharedTestDatabaseBuilder.ts` | Add `seedConfMail` entry for `ELENCO_MATERIE` |
| `test/unit/application/email-boxes.test.ts` | Add tests for the new box type |

### CDU Placeholder for OGGETTO

The `OGGETTO` uses `{{focus.destinatario.anagrafica.nome}}` and `{{focus.destinatario.anagrafica.cognome}}`. These are already populated by `BuildCDUStep.buildDestinatario()` in `emailSteps.ts` for `PER_DOCENTE` targets. The `appellativo` (Prof./Prof.ssa) is derived from `DOCENTI.GENERE` via `buildPersonVm()`.

The static text "prof/prof.ssa" in the OGGETTO is literal — it does not dynamically choose the correct gendered form. If dynamic gender selection is desired, the OGGETTO would need `{{focus.destinatario.anagrafica.appellativo}}` instead of the literal "prof/prof.ssa".

---

## Feature 2 — Database Validation Menu Function

### Goal

A function launched from the master sheet's custom menu that validates the current year's database for correctness: FK integrity, JSON validity, required fields, ENUM values, dynamic column integrity.

### Checks to Perform

#### 1. Foreign Key Integrity

| Source Table | Source Column | Target Table | Target Column |
|---|---|---|---|
| ALUNNI | CLASSE | CLASSI | ID |
| CLASSI | INDIRIZZO | INDIRIZZI | ID |
| CLASSI | COORD (CSV) | DOCENTI | EMAIL |
| CLASSI | IRC | DOCENTI | EMAIL |
| CLASSI | ALT | DOCENTI | EMAIL |
| CLASSI | *[MATERIA]* (CSV) | DOCENTI | EMAIL |
| CLASSI | *[MATERIA.itp]* (CSV) | DOCENTI | EMAIL |
| DOCENTI | DIPART | DIPART | ID |
| DIPART | CAPO | DOCENTI | EMAIL |
| DIPART | MATERIE (CSV) | MATERIE | ID |
| RUOLI | DOCENTE (CSV) | DOCENTI | EMAIL |
| SUPPLENZE | TITOLARE | DOCENTI | EMAIL |
| SUPPLENZE | SUPPLENTE | DOCENTI | EMAIL |
| SUPPLENZE | CLASSI (CSV/*) | CLASSI | ID |
| SUPPLENZE | MATERIE (CSV/*) | MATERIE | ID |
| VARIAZIONI_CATTEDRA | TITOLARE | DOCENTI | EMAIL |
| VARIAZIONI_CATTEDRA | NUOVO_TITOLARE | DOCENTI | EMAIL |
| VARIAZIONI_CATTEDRA | CLASSI (CSV/*) | CLASSI | ID |
| VARIAZIONI_CATTEDRA | MATERIE (CSV/*) | MATERIE | ID |
| CARENZE | STUDENTE | ALUNNI | EMAIL |
| CARENZE | CLASSE | CLASSI | ID |
| PIANI | STUDENTE | ALUNNI | EMAIL |
| PROGETTI | CLASSE | CLASSI | ID |
| MOV_ALUNNI | STUDENTE | ALUNNI | EMAIL |
| ASL | STUDENTE | ALUNNI | EMAIL |
| LOG_DOCS | ID_GEN | CONF_DOC | ID |
| LOG_DOCS | CLASSI (CSV) | CLASSI | ID |
| LOG_DOCS | MATERIE (CSV) | MATERIE | ID |
| LOG_FOLD | TIPO | CONF_DOC | ID |
| LOG_MAIL | PATTERN | CONF_MAIL | ID |
| CONF_DOC | GENERATORE | *(strategy registry)* | — |

#### 2. JSON Field Validity

Parse each of these fields as JSON; report parse failures:

| Table | Column |
|---|---|
| ALUNNI | CURRICULUM |
| CLASSI | RUOLI |
| CLASSI | ARTICOLAZIONE |
| MATERIE | ESAME_CFG |
| MATERIE | EVOLUZIONE |
| CONF_DOC | MODELLI |
| CONF_DOC | PERMESSI |
| CONF_DOC | PARAMETRI |
| CONF_DOC | POST_PROCESSO |
| CONF_DOC | REGISTRA_DOC |
| CONF_DOC | REGISTRA_FOLD |
| CONF_MAIL | BOX_CFG |
| CONF_MAIL | POST_PROCESSO |
| CONF_MAIL | ALLEGATI |
| CONF_IMP | CONFIG |
| LOG_MAIL | ALLEGATI |

#### 3. Required Fields Non-Empty

| Table | Columns |
|---|---|
| ALUNNI | EMAIL |
| DOCENTI | EMAIL, COGNOME, NOME |
| CLASSI | ID |
| MATERIE | ID, NOME |
| INDIRIZZI | ID, NOME |
| DIPART | ID, NOME |
| RUOLI | ID, NOME |
| CONF_DOC | ID, GENERATORE |
| CONF_MAIL | ID, PROCESSO |
| CONF_IMP | ID, TARGET |
| LOG_DOCS | ID |

#### 4. ENUM Values

| Table | Column | Valid Values |
|---|---|---|
| ALUNNI | RELIGIONE | `IRC`, `ALT`, `NO` |
| DOCENTI | GENERE | `M`, `F` |
| LOG_DOCS | STATO | `GENERATO`, `VERBALIZZATO`, `NOTIFICATO`, `ARCHIVIATO` |
| CONF_DOC | DUPLICAZIONE | `NEGATA`, `PERMESSA` |
| CONF_DOC | FORMATO | *(valid document format enum)* |
| CONF_DOC | GESTIONE_ARTICOLAZIONE | `COMPLETA`, `ARTICOLATA` |
| CONF_MAIL | GESTIONE_ARTICOLAZIONE | `COMPLETA`, `ARTICOLATA` |
| CONF_MAIL | DUPLICAZIONE | `NEGATA`, `PERMESSA` |
| CONF_MAIL | SUPPLENTI | `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, `ENTRAMBI` |
| CONF_MAIL | PROCESSO | `PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA_GENITORI`, `PER_CARENZA_GENITORI_E_ALUNNO`, `PER_CARENZA_GENITORI_E_COORD`, `PER_CAPO_DIPARTIMENTO`, `PER_DIPARTIMENTO` |
| LOG_MAIL | STATO | `SUCCESS`, `ERROR`, `PENDING` |
| INDIRIZZI | TIPO | `LICEO`, `ITS`, `IEFP`, `PROFESSIONALE`, `TECNICO` |
| PIANI | TIPO | `PEI`, `PDP_BES`, `PDP_DSA`, `PDP_STRANIERI`, `PFP` |
| PROGETTI | TIPO | `ASL`, `ORIENTAMENTO`, `ALTRO` |
| MOV_ALUNNI | TIPO | `IN`, `OUT`, `CAMBIO` |

#### 5. Dynamic Column Integrity

Every column in CLASSI and CARENZE whose name matches `*[MATERIA]*` (excluding `IRC`, `ALT`) must correspond to an `ID` in the MATERIE table. Columns with `.itp` or `.specifica` suffixes are checked against the base materia ID (the part before the dot).

#### 6. ITP Invariant

Every docente email found in a `*[MATERIA.itp]*` column in CLASSI must have `DOCENTI.ITP = true`.

#### 7. MATERIE Composite Rows

Every MATERIE row with an `ID` in the format `BASE.SPECIFICA` must have a non-empty `PRINCIPALE` value.

### Output Format

A Google Sheet created in the current school year's root folder (from `MASTER.ID_CARTELLA_GOOGLE`).

**Sheet name**: `Validazione DB - {ANNO_SCOLASTICO}`

**Sheet structure**:

| TABELLA | RIGA | CAMPO | VALORE | ERRORE |
|---|---|---|---|---|
| ALUNNI | 5 | CLASSE | `99X` | FK violata: CLASSE non esiste in CLASSI |
| CLASSI | 12 | INDIRIZZO | `XX` | FK violata: INDIRIZZO non esiste in INDIRIZZI |
| ... | ... | ... | ... | ... |

If no errors are found, the sheet contains a single row: `TUTTO OK - Nessun errore rilevato`.

### Menu Integration

Add a new entry to `vociMenu()` in `src/presentation/Menu.ts`:

```typescript
{ etichetta: 'VALIDAZIONE DATABASE', funzione: 'menu_validazioneDatabase' }
```

The menu wrapper `menu_validazioneDatabase` (in `src/presentation/Menu.ts`) follows the existing pattern: prompt for confirmation, open sidebar, delegate to the validation service.

### Files to Modify

| File | Change |
|---|---|
| `src/presentation/Menu.ts` | Add `menu_validazioneDatabase` wrapper + entry in `vociMenu()` |
| `src/application/services/DatabaseValidationService.ts` | **New file**: validation logic |
| `src/infrastructure/facades/DriveServiceFacade.ts` | Ensure `createSpreadsheet()` method exists (or use existing) |
| `src/config/Bootstrap.ts` | Wire `DatabaseValidationService` |
| `src/index.ts` | Expose `menu_validazioneDatabase` on `globalThis` |
| `src/entrypoints/EntryPoints.ts` | No change (data-driven menu handles it) |

---

## Feature 3 — Lock Documents (Downgrade Write → Read)

### Goal

A function launched from the custom menu that iterates all documents in LOG_DOCS for the current school year and downgrades every write permission to read permission.

### Logic

1. Read all rows from LOG_DOCS in the current year's spreadsheet.
2. For each row, extract the Drive file ID from `LOG_DOCS.ID`.
3. Call `DriveServiceFacade.listPermissions(fileId)` to get all existing permissions.
4. For each permission with `role` ∈ {`writer`, `owner`}:
   - If `role === 'writer'`: update to `reader` via `DriveServiceFacade.updatePermission()`.
   - If `role === 'owner'`: skip (owners cannot be downgraded — they always have full access).
5. Report results: success count, failure count, list of failures with file ID and error message.

### Drive API Calls

Per file:
- `Drive.Permissions.list(fileId)` — list all permissions
- `Drive.Permissions.update(fileId, permissionId, { role: 'reader' })` — downgrade writer → reader

### Menu Integration

Add a new entry to `vociMenu()` in `src/presentation/Menu.ts`:

```typescript
{ etichetta: 'BLOCCA DOCUMENTI', funzione: 'menu_bloccaDocumenti' }
```

The wrapper prompts for confirmation ("Are you sure you want to lock all documents for the current year?"), then opens the monitoring sidebar and delegates to the lock service.

### Safety Considerations

- The operation is irreversible via the system (permissions can only be restored manually by the Drive owner).
- A confirmation prompt before execution is mandatory.
- The function should log each permission change to provide an audit trail.
- Files that fail (not found, permission error) should be logged but not block the rest.

### Files to Modify

| File | Change |
|---|---|
| `src/presentation/Menu.ts` | Add `menu_bloccaDocumenti` wrapper + entry in `vociMenu()` |
| `src/application/services/LockDocumentsService.ts` | **New file**: lock logic |
| `src/infrastructure/facades/DriveServiceFacade.ts` | Ensure `listPermissions()` and `updatePermission()` methods exist |
| `src/config/Bootstrap.ts` | Wire `LockDocumentsService` |
| `src/index.ts` | Expose `menu_bloccaDocumenti` on `globalThis` |

---

## Feature 4 — Extend MATERIE Table with Per-Address Columns

### Goal

Add one column to MATERIE for each address in INDIRIZZI. Each column contains a CSV of integers (year-of-course numbers, 1–5) indicating which years that subject is mandatory for that address.

### Schema Change

For each row in INDIRIZZI, add a column named after `INDIRIZZI.ID` to MATERIE.

**Example**:

| ID | NOME | ... | LC | LS | LSSA |
|---|---|---|---|---|---|
| MAT | Matematica | ... | 1,2,3,4,5 | 1,2,3,4,5 | 1,2,3,4,5 |
| ITA | Lingua e letteratura italiana | ... | 1,2,3,4,5 | 1,2,3,4,5 | 1,2,3,4,5 |
| GRECO | Greco | ... | 3,4,5 | | |
| SCIENZE | Scienze | ... | | 1,2,3,4,5 | |
| PSICOLOGIA | Psicologia | ... | | | 1,2,3,4,5 |

### Column Naming Convention

Columns are named exactly as `INDIRIZZI.ID` (e.g., `LC`, `LS`, `LSSA`). This matches the existing pattern for dynamic columns in CLASSI and CARENZE.

### Impact on Existing Code

| Area | Impact |
|---|---|
| `COL_MATERIE` in `schema.ts` | No change — dynamic columns are resolved at runtime by `SheetDbAdapter` |
| `buildMaterieRows()` in test builders | Update to populate new columns with test data |
| `SheetMaterieGeneratorStrategy` | May need to render new columns in the Materie sheet |
| Domain entity `Materia` | No change — the new columns are lookup data, not domain properties |
| `IMateriaRepository` | No change — the repository already returns full rows |

### Migration

For existing databases:
1. For each INDIRIZZI row, add a column to the MATERIE sheet with the INDIRIZZI.ID as header.
2. Leave all values empty (user fills manually or via import).
3. The system does not enforce that every MATERIE row has a value for every address column — empty means "not applicable for that address."

### Files to Modify

| File | Change |
|---|---|
| `src/config/schema.ts` | No change (dynamic columns are resolved at runtime) |
| `src/onlinetests/data/SharedTestDatabaseBuilder.ts` | Update `buildMaterieRows()` to populate per-address columns |
| `src/onlinetests/data/fixtures.ts` | Add `MATERIE_ANNO_PER_INDIRIZZO` fixture mapping |
| `src/application/strategies/SheetMaterieGeneratorStrategy.ts` | Optionally render new columns |
| `test/` | Update test fixtures and assertions |

---

## Cross-Cutting Concerns

### Menu Structure

The updated `vociMenu()` will have 5 entries:

1. `GENERAZIONE DOCUMENTI` — existing
2. `COMUNICAZIONI EMAIL` — existing (Feature 1 adds a new CONF_MAIL row)
3. `IMPORTAZIONI` — existing
4. `VALIDAZIONE DATABASE` — new (Feature 2)
5. `BLOCCA DOCUMENTI` — new (Feature 3)

### Service Wiring

New services (`DatabaseValidationService`, `LockDocumentsService`) follow the existing pattern:
- Defined in `src/application/services/`
- Wired in `src/config/Bootstrap.ts`
- Resolved through `ServiceContainer`
- Never constructed ad hoc in application code

### Testing Strategy

- **Feature 1**: Unit tests for `renderMaterieClasseBox`, integration test for the full email pipeline with `ELENCO_MATERIE` CONF_MAIL
- **Feature 2**: Unit tests for each check category (FK, JSON, required, ENUM, dynamic columns, ITP)
- **Feature 3**: Unit test with mock Drive facade; integration test verifying permission changes
- **Feature 4**: Unit tests for seed data; no domain logic changes
