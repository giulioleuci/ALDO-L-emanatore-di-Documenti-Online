# Task 16 — Import FILE_SINGOLO e policy

## Contratto applicato

- Tutte le nuove ricette `CONF_IMP` usano la sola chiave supportata `STUDENTE`; nessuna chiave composta è stata introdotta.
- `GasDataImporter.SheetById` già supportava `tabName`, `range` e `hasHeaders`; ALDO ora inoltra tali opzioni dal mapper, senza modifiche alla libreria né importatori locali.

## Implementazione

- Nuovi fixture `IGNORE`, due casi `TIMESTAMP` (conflitto e fallback), `ATTIVO=false`, `hasHeaders=false` e quattro misconfiguration (fileId, folderTipo, idGen, strategia).
- Sorgenti E2E dedicate per timestamp CARENZE e no-header; la sorgente standard include una ghost row leggibile con la sola `DATA_MODIFICA` valorizzata.
- `registerImportChecks` copre OVERWRITE/ghost, IGNORE, TIMESTAMP più nuovo/più vecchio, fallback TIMESTAMP su target senza timestamp, no-header con mapping esplicito, skip disabilitato e pre-mutation failure per misconfig.
- Aggiunto `executeImportFileSingolo`/`testImportFileSingolo`; le policy sono invocabili dal launcher già approvato `testImportCercaDocumenti`, senza introdurre `testImportPolicy`.

## TDD e verifica

- Red/green verificato per il forwarding FILE_SINGOLO, le ricette/check policy e la ghost row materializzata.
- Test mirati: 62 test, 6 suite passanti (verifica dopo il follow-up P1).
- `npm run typecheck` e `npm run lint` passati.
- La prima suite completa ha rivelato un'aspettativa legacy obsoleta; il test è stato aggiornato per il nuovo adapter. Verifica finale: `npm test` (157 suite/1358 test), `npm run typecheck` e `npm run lint` passati.
