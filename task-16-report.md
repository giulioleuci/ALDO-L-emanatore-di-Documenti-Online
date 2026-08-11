# Task 16 — Import FILE_SINGOLO e policy

## Contratto applicato

- Tutte le nuove ricette `CONF_IMP` usano la sola chiave supportata `STUDENTE`; nessuna chiave composta è stata introdotta.
- `GasDataImporter.SheetById` già supportava `tabName`, `range` e `hasHeaders`; ALDO ora inoltra tali opzioni dal mapper, senza modifiche alla libreria né importatori locali.

## Implementazione

- Nuovi fixture `IGNORE`, `TIMESTAMP`, `ATTIVO=false`, `hasHeaders=false` e quattro misconfiguration (fileId, folderTipo, idGen, strategia).
- Sorgenti E2E dedicate per timestamp e no-header; la sorgente standard include una ghost row.
- `registerImportChecks` copre OVERWRITE/ghost, IGNORE, fallback TIMESTAMP su target senza timestamp, no-header con mapping esplicito, skip disabilitato e pre-mutation failure per misconfig.
- Aggiunti `executeImportFileSingolo`, `executeImportPolicy`, `testImportFileSingolo` e `testImportPolicy`; l'aggregato usa i check import reali.

## TDD e verifica

- Red/green verificato per il forwarding FILE_SINGOLO e per le ricette/check policy.
- Test mirati: 80 test, 6 suite passanti.
- `npm run typecheck` e `npm run lint` passati.
- La prima suite completa ha rivelato un'aspettativa legacy obsoleta; il test è stato aggiornato per il nuovo adapter. Verifica finale: `npm test` (157 suite/1358 test), `npm run typecheck` e `npm run lint` passati.
