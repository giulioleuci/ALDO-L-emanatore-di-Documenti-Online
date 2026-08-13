# Task 22 report — supplenze/ruoli e ACL reali

## Esito

- Creati `supplenzeRuoliChecks.ts` e `aclRealiChecks.ts`.
- Aggregate registration e launcher persistiti `testSupplenzeERuoli` / `testACLReali` attivi.
- Fixture copre confini sostituzione, isolamento classe, variazione, tre modalita di visibilita e identita titolare/supplente duplicata.
- Visibilita verificata sugli stessi consumer di produzione: CDU, risoluzione destinatari, `ApplyPermissionsStep`, `SheetMaterieConPermessiGeneratorStrategy`.
- Aggiunta `CONF_DOC_ACL_REALI` dedicata con ACL file/cartella e protected ranges.
- Callback ACL reali genera GSHEET e rilegge stato persistito usando direttamente `ServiceFactory.getDriveService()` e `ServiceFactory.getSpreadsheetService()`.
- `CONF_DOC.PERMESSI.regolaSupplente` supporta `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, `ENTRAMBI`; assenza mantiene default compatibile `ENTRAMBI`.
- Protezioni colonne consumano `CONF_DOC.PARAMETRI.gestioneSupplenti`, default `ENTRAMBI`.

## Estensione GasLibraryFactory

Commit nested repo: `ad8da3b feat(google-api): add Drive permission read-back`.

`DriveService.getPermissions`:

- usa Advanced Drive API tramite `GoogleApiWrapper`;
- preserva record permission completi richiesti;
- segue paginazione;
- non usa cache/fail-soft;
- propaga errori auth, quota e rete dopo retry wrapper.

Tipi ALDO aggiornati per il nuovo contratto. Vendor costruito da clone temporaneo pulito fermo a `ad8da3b`, quindi modifiche concorrenti del nested worktree escluse; checksum verificato con `npm run verify:vendor`.

## TDD e verifica offline

- RED: moduli check mancanti; launcher ancora `non implementato`; strategia sheet ignorava modalita; GLF non esponeva `getPermissions`.
- GREEN mirato: 25 test check/launcher; test strategia/pipeline; GLF DriveService 52 test.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test -- --runInBand`: 161 suite, 1406 test PASS.
- `npm run build:online`: PASS; include 161 suite unit e 5 suite/14 test integration offline.
- `git diff --check`: PASS.

Per istruzione utente non eseguiti `clasp`, push o callback GAS live. Esecuzione reale e debugging console restano differiti all'output GAS fornito dall'utente.
