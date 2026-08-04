# E2E bound master design

## Goal

Deploy online build to a new Apps Script project bound to a Google Sheet named
`_ALDO_E2E_MASTER`, located in My Drive root. This sheet is the single E2E
master database: it contains the `MASTER` table with IDs of generated school
year databases and exposes existing ALDO menu when opened.

## Current issue

Current setup creates a bound sheet called `ALDO MASTER (testonline)`, while
`E2eSampleDatabaseBuilder` creates another `_ALDO_E2E_MASTER` inside E2E
artifacts. The latter receives the `MASTER` table and becomes
`MASTER_SPREADSHEET_ID`; bound sheet is not actual master database.

## Design

### Provisioning

- `scripts/setup-testonline-project.cjs` creates new Sheets-bound Apps Script
  project titled `_ALDO_E2E_MASTER` in My Drive root.
- It persists only its script ID and bound spreadsheet ID in local online-test
  tracking file, used by `.clasp.json` and online deployment.
- Existing generated files and folders are neither moved nor renamed.

### E2E database generation

- E2E runner reads registered bound master ID from script properties.
- E2E database builder accepts that existing master spreadsheet rather than
  creating a second `_ALDO_E2E_MASTER` spreadsheet.
- Before each run, builder resets the master `MASTER` sheet to its canonical
  header and rewrites its current and historical database registrations.
- Current and prior sample databases, template documents, attachments, and E2E
  folders keep their current creation locations and lifecycle.
- Runner sets `MASTER_SPREADSHEET_ID` to bound master ID before bootstrapping
  ALDO, so all repositories consume same master the user opens.

### Menu and deployment

- `npm run push:online` deploys online build to new bound project.
- Existing `onOpen` ALDO menu remains unchanged.
- No explicit "Esegui test E2E" menu item is added. Online test entry points
  remain available through Apps Script execution as today.

## Error handling

- Setup remains idempotent and refuses ambiguous partial local setup state.
- E2E run fails with clear error if no bound master ID has been registered,
  instead of silently creating an unbound replacement master.
- Reset only targets registered bound `_ALDO_E2E_MASTER` and only its `MASTER`
  sheet; generated artifacts are untouched by this change.

## Verification

- Unit tests cover builder reuse/reset of injected master and no creation of a
  second master.
- Unit tests cover E2E runner property sequence and registrations for current
  and previous school year databases.
- Run relevant unit tests, `npm run build:online`, and push to new project.
