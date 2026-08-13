# Task 11 — Documenti con tabelle importate

## Implementazione

- `E2E_DOC_TABELLE` usa il template provisionato `tabelleImportate`, che contiene i marker reali `{{TABELLA:<sheetId>}}`.
- Lo strategy importa la tabella soltanto quando la sorgente contiene intestazione e almeno una riga dati; una sorgente con sola intestazione perde il marker senza produrre una tabella vuota.
- Il launcher `testDocumentiTabelleImportate` esegue un check dedicato tramite JobRunner e `avviaGenerazioneDataDriven`.
- Il check verifica documento e `LOG_DOCS` per 1A, righe della sorgente dati, CDU circostante, assenza di marker/Mustache residui, assenza della seconda tabella header-only e deduplicazione su una seconda esecuzione.

## Verifiche eseguite

- RED: 3 test hanno riprodotto i difetti su header-only, template errato e scope dedicato.
- GREEN: `npx jest --config jest.config.cjs test/unit/application/documento-con-tabelle-generator.test.ts test/unit/onlinetests/seeders.test.ts test/unit/onlinetests/documentiChecks.test.ts` — 13/13 test passati.
- `npm run typecheck` — completato con exit code 0.
- `npm run lint` — completato con exit code 0.
- `npm run build:online` e il gate di `npm run push:online` — 154 suite unit / 1331 test e 5 suite integrazione / 14 test passati.

## Verifica GAS reale

Non eseguibile dall'ambiente corrente: `npx clasp run creaDatiMockDrive` fallisce prima della chiamata GAS con `Error retrieving access token: TypeError: Cannot read properties of undefined (reading 'access_token')`. Servono credenziali clasp valide per completare `creaDatiMockDrive()` e `testDocumentiTabelleImportate()` online.
