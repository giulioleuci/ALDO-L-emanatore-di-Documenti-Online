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

## Review fix round 1

- ACL Drive confrontate come evidenze tipizzate `tipo:principale|ruolo`: user/group conservati distinti, domain e anyone non vengono piu scartati, ruoli inattesi falliscono il check.
- Callback reale verifica `writer` sul file e `reader` sulla cartella, coerenti con `CONF_DOC_ACL_REALI`.
- Aggregate supplenze compone coverage preesistente matrix + consumer e nuovi check Task 22; nessun caso legacy perso.
- Default Drive `CONF_DOC.PERMESSI.regolaSupplente` ripristinato a `SOLO_TITOLARI`; valori espliciti restano supportati. Default protected ranges resta `ENTRAMBI`.
- RED mirato confermato sui tre difetti; GREEN: 70 test mirati.
- Gate finali: typecheck e lint PASS; 161 suite / 1410 unit test PASS; build online offline-only PASS; 5 suite / 14 integration test PASS.
- Nessun `clasp`, push o test GAS live.

## Final review fix

- Routing protected ranges unificato sulla configurazione approvata `CONF_DOC.PERMESSI.regolaSupplente.file`: le protezioni sono ACL interne al file generato, quindi consumano la regola `file` gia prevista dal parser Drive.
- Rimosso il consumo dell'alias non documentato `CONF_DOC.PARAMETRI.gestioneSupplenti`; fixture reale usa `PERMESSI`, con `PARAMETRI` vuoto.
- Check consumer usa valori conflittuali (`PERMESSI=SOLO_SUPPLENTI`, `PARAMETRI=SOLO_TITOLARI`) e prova che `PERMESSI` prevale.
- Aggiunto accessor `ConfigurazioneDocumento.getPermessi()` con semantica Sheets blank-safe.
- Default protected ranges senza regola resta `ENTRAMBI`; default Drive ACL resta separatamente `SOLO_TITOLARI`.
- RED mirato confermato: strategia seguiva ancora `PARAMETRI` e accessor mancava. GREEN mirato: 32 test iniziali; typecheck/lint PASS; full unit PASS prima di modifiche concorrenti (163 suite / 1428 test).
- Primo `build:online` finale interrotto solo da tre nuovi test non verdi su `ClasseRepository`/ITP puntato, modifiche concorrenti fuori Task 22. Nessun file concorrente modificato o incluso nel commit Task 22.
- Nessun `clasp`, push o test GAS live.
