# Task 19 report — storico alunno, classe, documenti

## Stato

Implementazione completata in source. Sei check reali registrati nel runner aggregato e nei tre launcher dedicati; `storico.render` appartiene allo scope `documenti`.

## Discovery e contratti verificati

- Navigazione iniziale eseguita con `codebase-memory-mcp` (`search_graph`, `get_code_snippet`, `query_graph`) su `aldo-full-coverage` e `home-giulio-Desktop-ALDO-implementing`.
- Path CDU verificati contro `SPECS_ALDO/02_CDU_STRUTTURA.md` §8.3/§8.6 e provider/service correnti:
  - `focus.alunno.storico`
  - `focus.classe.storico`
  - `focus.classe.materie[].continuita`
  - `focus.alunno.didattica.pianiPersonalizzati.storico`
- Verificati `StoricoAlunniService`, `StoricoClasseProvider`, `StoricoClassiService`, `StoricoDocumentiService`, `DocumentiStoricoProvider`, `PianiPersAlunnoStoricoProvider`, `buildContinuita`.
- Consultati prima di scrivere codice: `GasLibraryFactory/DOCS_LIBS/GasOnlineTestFramework.md`, `WorkspaceTemplateEngine.md`, `GoogleApiWrapper.md`. Riutilizzati `TestRunner`, `LazyRef`, `TemplateEngineFacade`/`PlaceholderService` e `IDriveFacade`; nessuna logica GLF reimplementata e nessuna modifica GLF.
- Query bypass GAS globals: zero nodi ALDO trovati per `SpreadsheetApp`, `DriveApp`, `MailApp`; lint conferma.

## TDD

RED iniziale:

- `storico-checks.test.ts`: modulo `src/onlinetests/checks/storicoChecks` mancante.
- `recipe.test.ts`: `ALUNNO_COMPLETO` non conteneva provider `storico`.
- `seeders.test.ts`: movimento storico usava valore non enum `RITIRATO`, mancava `CAMBIO`, mancava `CONF_DOC_STORICO`.

GREEN finale:

- Focused: 7 suite, 59 test pass.
- Build online gate: 158 suite / 1378 unit test pass; 5 suite / 14 integration test pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run build:online`: pass; bundle online e launcher generati. Solo warning già noto `crypto.getRandomValues()` nel core, patch build applicata.
- `npm run test:build`/Jest build diretto non ha prodotto un normale report in questo ambiente (`report-online-coverage` ha stampato usage); `build:online` ha verificato wiring/bundle e tutto il gate offline.

## Implementazione

- Creato `src/onlinetests/checks/storicoChecks.ts`:
  - alunno depth 2: 2025-2026/2C/PROMOSSO e 2024-2025/1C/NON_PROMOSSO, piani su entrambi gli anni, bocciatura;
  - edge: depth 0, catena classe assente, studente storico mancante/SCONOSCIUTO, OUT/RITIRATO, flag ripetente;
  - classe: statistiche due anni, ASL/non-ASL, referente docente risolto e fallback `Esperto Esterno <anno>`;
  - continuità: INF con ITP cambiato poi assente, omissione totale chiavi ITP su MAT, riconciliazione GST verso STO su due anni;
  - documenti: stesso `ID_GEN=PIANI_PERSONALIZZATI`, famiglia `PIANO_PERS`, sottotipi PEI/PDP_BES e link distintivi per due anni;
  - render: legge davvero `CONF_DOC_STORICO`/`CONF_MAIL_STORICO`, copia e processa template documento tramite facade GLF, renderizza mail, verifica branch reali e assenza Mustache, poi cestina copia temporanea.
- `src/onlinetests/index.ts`: gruppo aggregato reale, orchestratore dataset persistito, tre launcher/report job dedicati.
- `ALUNNO_COMPLETO`: aggiunto provider `storico` dopo i provider studente/piani.

## Fixture reali aggiunte/corrette

- `CLASSI.STORICO` della 3C: `2C,1C`.
- Movimenti focali distintivi: `CAMBIO 2C→3C`, `CAMBIO 1C→1C`, e `OUT` per ritirato.
- Continuità: titolari MAT/GST/INF, `INF.itp` cambiato nel primo anno e assente nel secondo; record DOCENTI risolvibili.
- `MATERIE.STO.EVOLUZIONE`: JSON canonico `{GST:[1,2],STO:[3,4,5]}`.
- Fallback referente: `Esperto Esterno <anno>`.
- Coppia PEI/PDP_BES distintiva anche nel secondo storico, stesso ID_GEN/famiglia.
- `CONF_DOC_STORICO` collegata a `templateIds.storico`; `CONF_MAIL_STORICO.TESTO` usa path storici reali.

## File intenzionali

- `src/application/context-engine/Recipe.ts`
- `src/onlinetests/checks/storicoChecks.ts`
- `src/onlinetests/data/Seeders.ts`
- `src/onlinetests/data/SharedTestDatabaseBuilder.ts`
- `src/onlinetests/index.ts`
- `test/unit/application/context-engine/recipe.test.ts`
- `test/unit/onlinetests/{storico-checks,index,seeders,e2e-sample-database-builder,fullOnlineTests}.test.ts`

Le quattro eliminazioni preesistenti sotto `ESTENSIONI_ALDO/` e il worktree annidato `GasLibraryFactory` non sono stati toccati né inclusi.

## Fix round 1 — review

### Verifica tecnica

- Il finding carenze era confermato: `StoricoAlunniService.perAlunno()` calcolava già `CarenzaStorica[]` con `reconcileSigla`, ma `buildStudentStoricoVm()` eliminava quel dato dal CDU.
- Il finding depth 0 era confermato: `StoricoProvider` collegava un `LazyRef` anche con `profonditaAnniStorico=0`; materializzandolo si otteneva uno storico vuoto invece del path assente richiesto.
- I launcher persistiti avevano gli URL dei due spreadsheet storici vuoti nonostante `MasterSheetRepository.findAnniStorici(2)` rendesse disponibili gli ID.

### RED

Cinque suite focalizzate hanno fallito nei punti attesi:

- mapper senza `anni[].carenze`;
- provider con `focus.alunno.storico` presente a depth 0;
- assertion online che accettava ancora GST non riconciliata;
- fixture senza valore dinamico `CARENZE.GST`;
- helper URL storico persistito assente.

### GREEN e modifiche

- Contratto CDU canonico esteso in `SPECS_ALDO/02_CDU_STRUTTURA.md` §8.6 con `focus.alunno.storico.anni[].carenze[{materiaSigla,valore}]`.
- `buildStudentStoricoVm` conserva una copia delle carenze già riconciliate dal service.
- Fixture storica: colonna dinamica `GST`, valori distintivi 4/5 nei due anni, evoluzione canonica già presente su STO; check reale richiede solo `STO` e rifiuta residui `GST`.
- `StoricoProvider` non monta il path quando profondità ≤ 0; check online verifica assenza esatta, senza materializzare.
- Launcher persistiti ricavano ID/URL dei due storici dalle righe MASTER; i report ora puntano ai fogli storici reali.
- Focused RED→GREEN: 5 suite / 25 test pass.
- Verifica finale mirata + downstream: 10 suite / 86 test pass; typecheck e lint pass.
- Il comando full-unit `npm test -- --runInBand` ha terminato due volte senza summary Jest né exit code osservabile dal runner; nessun fallimento è stato stampato. La selezione completa dei test storico, builder, aggregate runner e launcher è passata esplicitamente come sopra.
