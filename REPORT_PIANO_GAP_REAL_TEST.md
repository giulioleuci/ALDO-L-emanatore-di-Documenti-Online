# Piano per colmare i gap reali di test

Questo documento deriva da [REPORT_COPERTURA_TEST.md](REPORT_COPERTURA_TEST.md). Include soltanto comportamento proprietario con rischio di regressione. Esclude esplicitamente wrapper GAS, forwarding tra ALDO e GLF, `index.js`, mock e check che richiedono account Google reale.

## Obiettivo

Portare ad alta confidenza i rami che possono alterare un documento, un'email, un'assegnazione didattica, una query o una ripresa batch. Il traguardo non è il 100% meccanico: è che ogni regola abbia almeno un test che fallisca se quella regola cambia in modo errato.

## Priorità 1 — ComposableContentLib

| File | Gap reale | Test offline da aggiungere |
| --- | --- | --- |
| `ContentComposer.js` | Ordine di valutazione, blocco vuoto/nascosto, errore isolato e contenuto finale. | Ricetta con blocco visibile, nascosto e in errore; verificare contenuto, `CompositionResult` e continuazione controllata. |
| `BlockDefinition.js` | Validazione definizione e compatibilità formato. | Rifiutare ID/formati non validi e accettare una definizione completa. |
| `BlockDataContext.js` | Separazione dati locali/globali, merge e JSON. | Merge non mutante, precedenza dichiarata e round-trip `toJSON`/`fromJSON`. |
| `BlockRenderer.js` | Interpolazione annidata, valore assente, template mancante e rendering function. | Renderizzare `{{persona.nome}}`, svuotare un valore assente, segnalare template mancante e incapsulare un errore renderer. |
| `RendererRegistry.js` | Registrazione, lookup mancante e rimozione. | Registrare un renderer reale minimale, recuperarlo, rimuoverlo e verificare l'errore sul lookup assente. |

Esito atteso: una suite per componente sotto `ComposableContentLib/src/**/__tests__/`, senza mock di Google Apps Script.

## Priorità 2 — RoleResolutionLib

| File | Gap reale | Test offline da aggiungere |
| --- | --- | --- |
| `internal/resolution/RoleResolver.js` | Precedenza delle fonti e motivazione della scelta. | Stesso slot presente in supplenza, variazione e nominale: selezionare solo la fonte con priorità maggiore e registrare la trace. |
| `internal/routing/RoutingResolver.js` | Routing per tipo/ambito e fallback. | Coprire route valida, route assente e fallback ammesso/non ammesso. |
| `EffectiveAssignmentResolver.js` | Risultato vuoto, candidato scaduto e confini temporali. | Date inizio/fine inclusive e nessun candidato idoneo. |
| `ResolutionPolicy.js` e `ResolutionTrace.js` | Policy e diagnostica come risultato osservabile. | Assert sul candidato finale e sugli eventi della trace, non su metodi mockati. |

Esito atteso: preservare la gerarchia SGSA `SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI`; è il rischio funzionale più alto per ALDO.

## Priorità 3 — SheetDBLib e DomainRepositoryLib

| File | Gap reale | Test offline da aggiungere |
| --- | --- | --- |
| `SheetDBLib/DatabaseService.js` | Schema/tabella assente, header non valido e fallimento query. | Database minimo in memoria con errore esplicito per tabella/header non compatibili. |
| `SheetDBLib/TableService.js` | Mapping riga, filtri e bordi paginazione. | Riga incompleta, filtro composto e ultima pagina. |
| `DomainRepositoryLib/internal/mapping/EntityMapper.js` | Hydration e errore di mapping. | DTO completo, campo obbligatorio assente e mapping annidato. |
| `DomainRepositoryLib/internal/query/QueryTranslator.js` | Traduzione di specifiche composte. | `AND`/`OR`/negazione con output query letterale. |
| `DomainRepositoryLib/specifications/CompositeSpecification.js` | Semantica combinazione specifiche. | Oggetti che soddisfano una, entrambe o nessuna specifica. |

Esito atteso: test puri con dati in memoria e nessuna chiamata `SpreadsheetApp`.

## Priorità 4 — batch ALDO

| File | Gap reale | Test offline da aggiungere |
| --- | --- | --- |
| `ActionBatchService.ts` | Un target fallisce, gli altri proseguono; stato e log coerenti. | Batch con un'azione che lancia errore e una successiva riuscita. |
| `DocumentBatchService.ts` | Chunk, ripresa e cleanup dopo errore. | Stato serializzato al checkpoint e nessuna duplicazione al resume. |
| `EmailRetryService.ts` | Retry esaurito, successo dopo retry e backoff/policy. | Errore transitorio poi successo; errore permanente che non viene ritentato. |
| `ImportService.ts` | Configurazione invalida e sorgente parzialmente valida. | Rifiuto prima delle scritture e report delle righe scartate. |
| `FiltriSorgente.ts` | Inclusione/esclusione e normalizzazione filtri. | Combinazioni di filtri con valore vuoto, duplicato e contraddittorio. |

Esito atteso: usare fake ALDO esistenti; verificare output, stato e record generati, non il numero di invocazioni ai fake.

## Sequenza consigliata

1. `ComposableContentLib`: cinque piccoli test file indipendenti, perché sblocca composizione documenti/email.
2. `RoleResolutionLib`: precedenza e date, prima di ogni ulteriore lavoro sui CDU docenti.
3. `SheetDBLib` + `DomainRepositoryLib`: mapping/query, prima di ampliare repository ALDO.
4. Batch ALDO: failure path e resume, un servizio per volta quando il relativo flusso viene modificato.

## Regole di accettazione

- Ogni test descrive un comportamento osservabile e una regressione concreta che intercetta.
- Nessun test di forwarding, costante, getter banale o mock chiamato.
- Ogni nuovo ramo non banale deve avere almeno un percorso successo e uno errore/fallback.
- Eseguire la suite mirata e poi la suite completa del repository interessato.
- Aggiornare `REPORT_COPERTURA_TEST.md` solo dopo una nuova rilevazione `--coverage`.

