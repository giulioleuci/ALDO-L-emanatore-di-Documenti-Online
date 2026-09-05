# NEW_TABLE_LOG_JOB — Storico delle run di ALDO

Proposta di design per l'aggiunta di una tabella **LOG_JOB** allo schema database (append-only), che registra il riepilogo di ogni esecuzione dei job batch.

## Motivazione

Oggi lo stato dei job vive in **ScriptProperties** (transiente, si resetta) e nel **CacheService** (ancora più volatile). Le tabelle `LOG_DOCS`, `LOG_FOLD`, `LOG_MAIL` registrano effetti per-elemento (ogni documento, ogni email) ma **non il riepilogo job-level**. Non esiste quindi una risposta a domande come:

- "Quante email ha fallito l'ultimo batch X?" (oggi: query su `LOG_MAIL` filtrando per pattern+data)
- "Quanto è durata l'ultima generazione documenti?"
- "L'ultima importazione è fallita per quale motivo?" (oggi: N righe sparse invece di una riga)
- "Quali run sono ancora sospese in attesa di resume?"

`LOG_JOB` colma questo vuoto: **una riga per esecuzione**, con tutto il necessario a comprendere il job.

## Stati possibili

Lo stato del job è uno dei seguenti:

| Stato                 | Significato                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `COMPLETATO`          | Tutti i task eseguiti, 0 errori                                              |
| `COMPLETATO_CON_ERRORI` | Tutti i task eseguiti, ma con errori parziali (batch continuato)             |
| `FALLITO`             | Errore fatale, job interrotto                                                |
| `SOSPESO_QUOTA`       | Sospeso per esaurimento quota Gmail (ripresa manuale/automatica al reinizio) |
| `SOSPESO_TEMPO`       | Sospeso per raggiungimento del tempo massimo di esecuzione (timeout → trigger di resume programmato da JobRunnerLib) |

La distinzione tra `SOSPESO_QUOTA` e `SOSPESO_TEMPO` è importante perché i due cammini di ripresa sono diversi: la quota si risolve da sola col tempo e il job riparte con una successiva emissione/chiamata di `start()` (che riusa il checkpoint del pattern), mentre il timeout richiede un trigger GAS che rientra automaticamente nella generator tramite `resumeJob()` e `riprendiJobSospeso()`.

## Campo `ESECUZIONE`

JobRunnerLib gestisce il resume tramite trigger: quando un job supera il tempo massimo, schedula un trigger GAS che chiama `resumeJob()`, il quale rientra nella generator con il `resumeState` persistito. Questo può ripetersi N volte (timeout → trigger → resume → timeout → …).

Il contatore **`ESECUZIONE`** distingue:

- **`ESECUZIONE = 0`** → prima esecuzione (job partito da `start()`, nessun resume precedente)
- **`ESECUZIONE = 1, 2, 3, …`** → ripresa N-esima da trigger (il numero corrisponde al conteggio dei resume tenuto da JobRunnerLib)

È cruciale perché, senza di esso, un job con 100 task e 3 resume produrrebbe 3-4 righe in `LOG_JOB` con `TOTALE_TASK=100` ma conteggi parziali non interpretabili. Con `ESECUZIONE` si ottiene la timeline completa di un singolo job:

- numero totale di riprese: `MAX(ESECUZIONE) WHERE ID_JOB = <id>`
- job ancora in corso: l'ultima riga ha stato `SOSPESO_TEMPO`/`SOSPESO_QUOTA` senza una riga successiva `COMPLETATO`/`FALLITO`

I conteggi `TOTALE_TASK`/`COMPLETATI_OK`/`FALLITI` si riferiscono **alla singola esecuzione** (i task processati in quel chunk), non al cumulato del job.

## Schema della tabella

| Colonna            | Tipo            | PK (parte) | FK          | Descrizione                                                                                                                        |
| ------------------ | --------------- | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ID_JOB`           | String          | ✅         | —           | UUID del job (stabile attraverso tutti i resume)                                                                                   |
| `ESECUZIONE`       | Number          | ✅         | —           | 0 = prima esecuzione; N = N-esimo resume da trigger                                                                                |
| `TIPO`             | String          | —          | —           | Tipo del job registrato nel JobDefinitionRegistry: `GENERAZIONE_DOCUMENTI` / `INVIO_EMAIL_BATCH` / `RETRY_EMAIL_BATCH` / `IMPORT_CHUNKED` |
| `ID_CONFIG`        | String          | —          | —           | ID della configurazione (CONF_DOC.ID o CONF_MAIL.ID) su cui opera il job                                                           |
| `NOME_CONFIG`      | String          | —          | —           | Nome leggibile della configurazione                                                                                                |
| `STATO`            | String          | —          | —           | Enum di cui sopra                                                                                                                  |
| `TOTALE_TASK`      | Number          | —          | —           | Numero totale di target da processare (enumerati all'avvio)                                                                        |
| `COMPLETATI_OK`    | Number          | —          | —           | Task processati con successo                                                                                                       |
| `FALLITI`          | Number          | —          | —           | Task che hanno generato errore                                                                                                     |
| `LISTA_FALLIMENTI` | JSON            | —          | —           | Serializzazione di `errori[]`: `[{"target":"3A","errore":"..."}, ...]`; troncata al cap di cella Sheets se troppo grande            |
| `DURATA_SEC`       | Number          | —          | —           | Secondi di esecuzione effettiva di questa esecuzione                                                                               |
| `INIZIO`           | String          | —          | —           | Timestamp di inizio di questa esecuzione                                                                                           |
| `FINE`             | String          | —          | —           | Timestamp di fine di questa esecuzione                                                                                             |
| `ESEGUITO_DA`      | String          | —          | —           | Email dell'utente che ha lanciato il job originale                                                                                  |

PK composta `ID_JOB` + `ESECUZIONE`: ammette più righe per job (una per run), permettendo di riscostruire l'intera timeline di un job attraverso tutti i resume.

## Dove si scrive

Il batch service ha già in memoria tutti i dati (jobId, confDocId/patternId, `processed[]`, `errori[]`, totale) e il job tipo. La scrittura avviene tramite un `LogJobRepository` (interfaccia domain) implementato su `SheetDbAdapter`, con un `append(entry)`.

Punti di aggiunta (dopo le chiamate già esistenti a `monitor.completeJob(...)`):

1. **Fine normale** (generator `return`): stato `COMPLETATO` o `COMPLETATO_CON_ERRORI` (in base a `errori.length > 0`).
2. **Sospensione quota** (`EmailBatchService.suspendForQuota`): stato `SOSPESO_QUOTA`.
3. **Timeout / sospensione tempo**: per la copertura massima (inclusi i resume mai partiti), intercettare l'eccezione di timeout dentro la generator e fare `append()` con stato `SOSPESO_TEMPO` **prima** che JobRunnerLib scheduli il trigger. In alternativa (più semplice ma senza traccia dei resume mai partiti), scrivere al primo `append()` lato resume con `ESECUZIONE = N > 0`. **Scelta di progetto da fare in fase di implementazione.**
4. **Errore fatale**: stato `FALLITO`.

`DURATA_SEC` = `FINE - INIZIO` della singola esecuzione; `ESEGUITO_DA` si ricava dall'utente attivo nel primo `start()` e va propagato nei resume (o riletto dalla prima riga del job in `LOG_JOB`).

## Dove si legge

- La **sidebar live** (GasProcessMonitorLib DashboardUi) resta invariata e continua a leggere da ScriptProperties/Cache: mostra il job corrente. `LOG_JOB` è lo storico post-execution.
- Un menu "Cronologia Job" (o una vista CDU) interroga `LOG_JOB` con filtri: tipo, stato, intervallo date. Il repository espone `listByType(tipo)`, `getById(idJob)`, `getFailuresSince(data)`.

## Vincoli e non-obiettivi

- **Cap cella Sheets per `LISTA_FALLIMENTI`**: ~50 KB di cap; per batch con molti errori troncare il JSON o archiviarlo su file Drive separato (stessa logica già usata da JobRunnerLib per gli state grandi sopra soglia). Non è un problema nuovo.
- **Non sostituisce** ProcessMonitorLib / ScriptProperties: quelli restano il sistema real-time per il sidebar.
- **Non memorizza** la telemetria per-step (quella resta nel monitor): solo il riepilogo aggregato per esecuzione.
- **Append-only**, come le altre `LOG_*`; valutare un cap righe con eventuale archiviazione storica su Drive quando si riempie.
- I conteggi sono **per esecuzione**, non cumulati: la somma su `COMPLETATI_OK`/`FALLITI` per lo stesso `ID_JOB` dà il totale dell'intero job.