# CONF_AZIONI — azioni standalone data-driven

## Obiettivo

Aggiungere una nuova tabella di configurazione `CONF_AZIONI` che gestisce azioni
che non generano documenti, non inviano email e non importano dati, ma eseguono
altre operazioni sul sistema: modifica dei permessi Drive (grant, riallineamento
a variazioni di cattedra/supplenza, downgrade writer→reader), validazione del
database, sanificazione e trasformazione di colonne.

Proprio come le altre tabelle `CONF_*`, tutto è data-driven: aggiungere una nuova
azione significa inserire un record in `CONF_AZIONI`, non scrivere codice.

V1: esecuzione **solo manuale** da menu (Sheets) e da entrypoint_user (piattaforma
GAS). La struttura prevede già la colonna `PERIODICITA` per lo scheduling futuro,
ignorata in v1.

## Terminologia

Il motore che oggi esegue `CONF_DOC.POST_PROCESSO` / `CONF_MAIL.POST_PROCESSO`
diventa la grammatica **condivisa delle "azioni"**: si usa sia inline (colonna
fisica `POST_PROCESSO`, che **non cambia nome** essendo spec), sia come azioni
standalone orchestrate da `CONF_AZIONI`.

Ridenominazioni nel codice ALDO (solo codice, la colonna fisica `POST_PROCESSO`
resta):

| Ora | Nuovo |
|---|---|
| `src/application/pipelines/postProcessActions.ts` | `src/application/pipelines/standaloneActions.ts` |
| `executePostProcess()` | `eseguiAzioni()` / `executeActions()` |
| `PostProcessAction` / `PostProcessActionHandler` | `Azione` / `AzioneHandler` |
| concetto "azione post-processo" | "azione" (standalone o inline) |

Niente terminologia generica tipo "step/passi": la grammatica si chiama sempre
**azioni**.

## Schema `CONF_AZIONI`

Riga = orchestrazione: un record definisce un'azione completa, con asse di
iterazione, condizione e array di azioni elementari.

| Colonna | Tipo | PK | Descrizione |
|---|---|---|---|
| `ID` | String | ✅ | Codice identificativo, es. `ALLINEA_PERMESSI_CATTEDRE`, `SANIFICA_TRIM` |
| `TIPO` | String | — | Etichetta libera di categoria, scritta in `LOG_JOB.NOME_CONFIG` |
| `ASSE` | String | — | Asse di iterazione del batch e driver della recipe CDU: stesso dizionario di `CONF_DOC.GENERATORE` (`CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO`) + valore riservato `SINGOLA` per esecuzione unica. Il costruttore valida il valore e solleva `ConfigurationError` altrimenti |
| `CONDIZIONE` | String | — | Espressione logica sull'esecuzione dell'azione nel suo insieme (stesso motore GasExpressionEngineLib di `CONF_DOC.CONDIZIONE`). Se falsa o vuota l'azione è saltata. Se falsa per tutte le azioni di una run, nessuna riga `LOG_JOB` viene prodotta per quelle azioni |
| `ATTIVO` | Boolean | — | Abilita/disabilita l'azione (default `true`); specchia `CONF_IMP.ATTIVO`. In v1 decide solo se l'azione compare nel menu |
| `AZIONI` | JSON | — | Array di azioni elementari (la grammatica condivisa: i 4 tipi esistenti di POST_PROCESSO + i nuovi tipi standalone, §Catalogo) |
| `PERIODICITA` | String | — | **Riservata per lo scheduling futuro** (es. `DAILY`, `WEEKLY`); presente nella struttura fin da subito, ignorata in v1 |

Dettagli di coercizione: i valori `AZIONI` sono risolti come JSON; cella vuota o
`''` (round-trip Sheets) equivale a "nessun array" e l'azione resta configurabile
ma senza effetti — stesso patto di `hasJsonValue`.

## Catalogo dei tipi di azione (elementi dell'array `AZIONI`)

### Riuso da POST_PROCESSO (semantica identica, compat retroattiva)

| Tipo | Effetto |
|---|---|
| `INSERISCI_TIMESTAMP` | Scrive `now` in `tab.col` dove i criteri corrispondono, solo se la cella è vuota |
| `AGGIORNA_CAMPO` | Imposta `tab.col = val` dove i criteri corrispondono (`val` con placeholder risolti sul CDU) |
| `AGGIORNA_STATO_DOC` | Cambia `LOG_DOCS.STATO` dove i criteri corrispondono |
| `AGGIORNA_PERMESSI_STORICI` | Alias di compatibilità dell'azione storica: target implicito `ID_GEN=CONF_DOC.ID` su `LOG_DOCS` |

### Nuovi tipi (standalone)

| Tipo | Effetto |
|---|---|
| `AGGIORNA_PERMESSI` | Applica ACL a **file e cartelle** selezionati da `LOG_DOCS` o `LOG_FOLD`. Criteri: `UTENTI`/`CLASSI`/`MATERIE` per contenimento CSV, `TIPO`/`SOTTOTIPO` per uguaglianza esatta, prefisso `PATH` opzionale. Destinatari: `ruolo` (risolto via `RisolutoreRuoliService`, es. `COORDINATORI`) oppure email dirette. Livello `LETTURA`/`SCRITTURA`/`COMMENTO`. `profondita` per lo storico. Calcola il **delta** tra ACL attese e reali (`listPermissions`) e applica solo grant mancanti / role-change → copre il caso riallineamento a cattedre e supplenze |
| `RIDUCI_PERMESSI` | Downgrade: porta a una soglia massima (default `LETTURA`) ogni ACL sopra soglia sui target selezionati (stessi criteri log-driven). Idempotente: scritto solo il delta tramite `changePermissionRoles` → copre il caso writer→reader |
| `VALIDA_DB` | Esegue `DatabaseValidationService` (esteso: `esegui(tabelle?)` accetta un sottoinsieme di tabelle). Read-only; esito nel log |
| `TRASFORMA_CAMPO` | Un unico tipo con `operazione` ∈ `TRIM` \| `UPPER` \| `LOWER` \| `CAPITALIZE` \| `UNCAPITALIZE` su `tab.col`, con `criteri` opzionali → sanificazione e case-transform con un solo ramo di codice |

### Struttura comune degli oggetti azione

Stessa forma JSON di `POST_PROCESSO`:

```json
{
  "tipo": "AGGIORNA_PERMESSI",
  "su": "LOG_FOLD",
  "ruolo": "COORDINATORI",
  "permesso": "LETTURA",
  "profondita": 1,
  "criteri": {
    "CLASSI": "{{focus.classe.id}}",
    "PATH": "{{istituto.annoScolastico}}/..."
  }
}
```

```json
{
  "tipo": "TRASFORMA_CAMPO",
  "tab": "ANAGRAFICA_DOCENTI",
  "col": "NOME",
  "operazione": "CAPITALIZE"
}
```

I criteri sono `{{path}}` risolti da `WorkspaceTemplateEngine` sul CDU. I valori
CSV (`UTENTI`, `CLASSI`, `MATERIE`) fanno matching per contenimento; `TIPO`,
`SOTTOTIPO`, `PATH` per uguaglianza/prefisso.

## Architettura

### `src/application/pipelines/standaloneActions.ts` — motore condiviso

Ex `postProcessActions.ts`, ridenominato. Mantiene gli helper esistenti
(`hasJsonValue`, `resolveCriteri`, `csvValues`, `matchesCriterio`,
`findMatchingRows`, `updateMatching`). L'export principale evolve da
`executePostProcess(rawJson, cdu, db, templates, now, logger, handler)` a un
dispatcher con contesto:

```ts
eseguiAzioni(opts: {
  azioni: string;                // raw JSON dell'array AZIONI / POST_PROCESSO
  cdu: Record<string, unknown>;
  db: PostProcessDb;
  templates: ITemplateEngine;
  now: Date;
  logger: LoggerService;
  handlers: Partial<Record<TipoAzione, AzioneHandler>>;
})
```

- I tipi **solo-DB** (`INSERISCI_TIMESTAMP`, `AGGIORNA_CAMPO`,
  `AGGIORNA_STATO_DOC`, `TRASFORMA_CAMPO`) restano built-in.
- I tipi **infra** (`AGGIORNA_PERMESSI`, `RIDUCI_PERMESSI`, `VALIDA_DB`)
  viaggiano come `handler` forniti dal chiamante:
  - pipeline documento/email: registrano l'handler esistente di
    `AGGIORNA_PERMESSI_STORICI` (compat) — nessun nuovo handler, comportamento
    invariato;
  - `ActionBatchService`: registra l'insieme completo (drive + ruoli +
    validatore).
- Azione di tipo sconosciuto / JSON malformato: `logger.warn` e skip, come oggi.

### `src/application/services/ActionBatchService.ts` — orchestratore batch

Registrato in `JobRunnerLib` con `JOB_TYPE = 'ESECUZIONE_AZIONI'` (generator +
checkpoint, stesso pattern di `DocumentBatchService`):

1. legge le righe `CONF_AZIONI` con `ATTIVO=true` (o la singola `ID` richiesta);
2. per ogni azione valuta `CONDIZIONE` (gate dell'azione intera);
3. costruisce i target dall'`ASSE` con la stessa factory/recipe CDU di `CONF_DOC`
   (`SINGOLA` → un solo iter con CDU base);
4. per ogni target materializza il CDU via `ContextEngine` e invoca
   `eseguiAzioni()` con contesto completo;
5. checkpointezza lo stato in `ScriptProperties` a ogni target (jobId, indice
   target, azione corrente) e riprende al trigger di timeout.

### Pipeline documento/email

La chiamata a `executePostProcess` diventa `eseguiAzioni` con la firma a mappa
(`handlers`). La semantica dei tipi esistenti non cambia; la regressione è
guardata dai test unit delle pipeline.

### Wiring

`Bootstrap.ts` / `initAldo()`: nel `ServiceContainer` vengono registrati
`ActionBatchService`, il contesto drive (`IDriveFacade` esistente),
`RisolutoreRuoliService` e `DatabaseValidationService` (tutti già esistenti).
Nessun nuovo servizio infrastrutturale istanziato ad hoc.

## Flusso di esecuzione

```
Utente → Menu "Esegui azioni" | entrypoint avviaAzione(id)/avviaTutteAzioni()
  → ActionBatchService (launch JobRunnerLib, JOB_TYPE=ESECUZIONE_AZIONI)
  → per ogni CONF_AZIONI ATTIVO:
      CONDIZIONE falsa → azione saltata, nessuna riga LOG_JOB
      target da ASSE (la stessa factory di CONF_DOC; SINGOLA → 1 iter)
      per ogni target: CDU via ContextEngine → eseguiAzioni(AZIONI, cdu, ...)
```

Prestazioni: gli handler di permesso raggruppano i grant per `targetId`+`permesso`
(riuso del batching di `DriveServiceFacade.setPermissions`), evitando una chiamata
per email.

## Gestione errori (gerarchia)

- **Configurazione rotta** (ASSE sconosciuto, JSON `AZIONI` non valido):
  `ConfigurationError` al caricamento → job `FALLITO`, la run non parte.
- **Errore di una singola azione elementare su un singolo target** (es. Drive
  rifiuta un grant): **continue-on-error** — fallibilità registrata in
  `LISTA_FALLIMENTI` (`"target: motivo"`), si prosegue col target successivo;
  esito riga `COMPLETATO_CON_ERRORI`.
- **Errore di costruzione CDU/target**: stessa semantica dei batch esistenti
  (target fallito, la run prosegue).
- **Nessun rollback**: come per i batch attuali, le azioni elementari non
  critiche già eseguite restano applicate. La riconciliazione permessi è
  idempotente per costruzione (delta grant/downgrade), quindi rieseguibile.

## Logging — solo `LOG_JOB`

Nessuna tabella nuova. Riga per esecuzione, come gli altri batch:

- `TIPO='ESECUZIONE_AZIONI'`, `ID_CONFIG=CONF_AZIONI.ID`,
  `NOME_CONFIG=CONF_AZIONI.TIPO`
- `TOTALE_TASK` = target dell'asse; `COMPLETATI_OK`/`FALLITI`;
  `LISTA_FALLIMENTI` = `["target: motivo", ...]`; `DURATA_SEC`; `INIZIO`/`FINE`;
  `ESEGUITO_DA`
- `ID_JOB` stabile attraverso i resume (stessa semantica/SOSPESO_TEMPO degli
  altri job)

## Menu ed entrypoints_user

**Menu** (`src/presentation/Menu.ts`): voce "Esegui azioni" → dialogo che elenca
le azioni `ATTIVO=true` (una per riga, `ID`+`TIPO`) + opzione "Tutte (le attive)".
Scelta → lancio `ActionBatchService`. Se con "Tutte" nessuna azione supera la
`CONDIZIONE`, il dialogo riporta "nessuna azione eseguita".

**Entrypoints_user GAS** (`src/entrypoints/EntryPoints.ts` + `src/index.ts`,
stessi globali ambient del resto):

- `avviaAzione(id)` — lancia l'azione con quell'ID (valida che esista e sia
  `ATTIVO`).
- `avviaTutteAzioni()` — lancia tutte le attive.

Esposte su `globalThis`, richiamabili da widget/editor GAS. Diventeranno i
target dei trigger temporizzati dello scheduling futuro.

## Validazione database

Aggiornare la validazione perché la nuova tabella entri nel perimetro di
controllo:

- Aggiungere `CONF_AZIONI` a `VALIDATION_TABLES`
  (`src/config/validationRules.ts`) e regole: `ID`/`TIPO`/`ASSE`/`ATTIVO`
  richiesti; `ASSE` come enum (dizionario CONF_DOC + `SINGOLA`); `AZIONI` come
  JSON valido.
- Estendere `DatabaseValidationService.esegui(tabelle?: string[])` per accettare
  un sottoinsieme di tabelle (serve anche all'azione `VALIDA_DB`).

## Testing

- **Unit** `standaloneActions.test.ts`: un test per ogni tipo azione; i 4
  esistenti in regressione (stessa semantica dopo il rename); `AGGIORNA_PERMESSI`
  e `RIDUCI_PERMESSI` con fake drive
  (`listPermissions`/`changePermissionRoles`/`setPermissions`) e verifica del
  delta (niente scritture a stato reale già allineato); `VALIDA_DB` con fake
  validatore e sottoinsieme tabelle; `TRASFORMA_CAMPO` parametrizzato sulle 5
  operazioni.
- **Unit regressione**: le pipeline documento/email restano green dopo rename e
  firma a mappa.
- **Integration** `ActionBatchService.test.ts`: iterazione asse, gate
  `CONDIZIONE`, continue-on-error + accumulo `LISTA_FALLIMENTI`, righe `LOG_JOB`
  (prima esecuzione e resume), checkpoint/resume.
- **Build**: `TIPO=ESECUZIONE_AZIONI` registrato nel JobDefinitionRegistry,
  entrypoints `avviaAzione`/`avviaTutteAzioni` esportati su `globalThis`,
  `CONF_AZIONI` presente in `src/config/schema.ts` e in `validationRules.ts`.
- **Online** (stretch, non bloccante in v1): smoke check che esegue un'azione
  sicura (es. `TRASFORMA_CAMPO` `TRIM` su una colonna di scratch).

## Rinviato / struttura pronta

- `PERIODICITA`: scheduling futuro — colonna presente, ignorata in v1.
- `RIMUOVI_PERMESSI` (revoca ACL): richiede un primitive `removePermission` oggi
  assente in `IDriveFacade`; al momento del bisogno si decide estensione
  libreria vs ALDO secondo la regola GasLibraryFactory-first.
- Monitor sidebar (`GasProcessMonitorLib`) per le azioni: stesso asset degli
  altri batch.

## Governance docs da aggiornare

- `SPECS_ALDO/01_SCHEMA_DATABASE.md` — nuova sezione `CONF_AZIONI`.
- `SPECS_ALDO/00_PANORAMICA.md` — citare `CONF_AZIONI` nel motore data-driven.
- Commento principale in `standaloneActions.ts` (grammatica condivisa, non più
  solo post-processo).