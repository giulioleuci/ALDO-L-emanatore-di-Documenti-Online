# 15 — UI, Menu e Job Runner

Questo documento descrive il Presentation Layer di SGSA (menu, dialoghi, funzioni wrapper), l'integrazione con `JobRunnerLib` per i processi batch, e il monitoraggio tramite `GasProcessMonitorLib`.

---

## 1. Architettura del Presentation Layer

Il Presentation Layer di SGSA è composto da tre elementi:

1. **Menu nativo di Google Sheets** — creato tramite il trigger `onOpen(e)` di Google Apps Script
2. **Dialoghi modali** — `Browser.inputBox` e `Browser.msgBox` per raccogliere input dall'utente quando un ID di configurazione non è pre-cablato nella voce di menu
3. **Sidebar HTML di monitoraggio** — fornita da `GasProcessMonitorLib` (L4), mostra lo stato di avanzamento dei processi batch in tempo reale

Il Presentation Layer **NON DEVE contenere logica di business**. La sua unica responsabilità DEVE essere raccogliere l'input dell'utente, validare che sia non vuoto, e delegare l'esecuzione ai servizi applicativi tramite le funzioni di avvio data-driven definite in `Bootstrap.js`.

---

## 2. Trigger `onOpen`

`onOpen(e)` è il trigger GAS eseguito automaticamente all'apertura del foglio di calcolo. La sua unica responsabilità è costruire la struttura del menu e aggiungerla all'interfaccia di Google Sheets.

`onOpen` **NON DEVE accedere al database, NON DEVE inizializzare il container DI e NON DEVE eseguire alcuna logica applicativa**. Questo garantisce che l'apertura del foglio sia SEMPRE rapida, indipendentemente dallo stato del sistema.

---

## 3. Struttura del Menu

Il menu principale si chiama **"AVVIA PROCESSI"** e contiene tre sezioni:

### Avvio Personalizzato…

Voce generica che mostra un dialogo `Browser.inputBox` per inserire manualmente l'ID di configurazione (`CONF_DOC.ID`, `CONF_MAIL.ID` o `CONF_IMP.ID`). Permette di avviare qualsiasi operazione configurata nel sistema senza necessità di una voce di menu dedicata.

Il menu presenta tre avviatori: `GENERAZIONE DOCUMENTI`, `COMUNICAZIONI EMAIL`, `IMPORTAZIONI`.

---

## 4. Funzioni Wrapper di Menu

Ogni voce del menu corrisponde a una funzione in `Menu.js` con il prefisso `menu_`. Queste funzioni seguono sempre lo stesso schema in quattro passi:

1. **(Opzionale) Raccolta input:** l'ID di configurazione viene richiesto tramite `Browser.inputBox`
2. **Validazione:** verifica che l'input non sia vuoto e non sia stato cancellato (`Browser.inputBox` restituisce stringa vuota se l'utente preme Annulla). Se fallisce → `Browser.msgBox` con messaggio di errore e terminazione
3. **Delega a funzione di avvio data-driven:**
   - `avviaGenerazioneDataDriven(configId)` — generazione documenti
   - `avviaInvioNotificheDataDriven(patternId)` — invio email
   - `avviaImportazioneDataDriven(configId)` — importazioni
4. **Apertura sidebar:** apre la sidebar di monitoraggio `GasProcessMonitorLib` prima di avviare il job

Le funzioni `avvia*DataDriven` sono definite in `Bootstrap.js`. Recuperano il container DI, risolvono il servizio applicativo appropriato e invocano il metodo corretto con i parametri ricevuti.

---

## 5. Integrazione con `JobRunnerLib`

**Libreria di riferimento:** `JobRunnerLib` (L3).

I processi batch (generazione documenti per tutte le classi, invio massivo di email) vengono avviati come job di `JobRunnerLib`. Il Job Runner gestisce autonomamente la sospensione dell'esecuzione alla soglia del timeout GAS, il salvataggio dello stato in `ScriptProperties`, e la ripresa automatica tramite trigger temporizzato.

SGSA non implementa alcun meccanismo proprio di gestione del timeout: si affida completamente a `JobRunnerLib` per questa responsabilità.

### Ciclo di vita di un job SGSA

1. Una funzione wrapper `menu_*` chiama `avviaGenerazioneDataDriven(configId)`
2. `Bootstrap.js` recupera il container DI e risolve il servizio applicativo corretto (es. `DocumentGenerationService`)
3. Il servizio chiama `JobRunnerLib.start(nomeJob, parametri)`:
   - `nomeJob` corrisponde a uno dei job registrati nel registry (es. `"generaDocumentiPerClasse"`)
   - `parametri` contiene i dati necessari all'iterazione (es. `{ configId, classiIds }`)
4. `JobRunnerLib` individua la generator function associata al nome, la istanzia con i parametri e inizia l'esecuzione
5. La generator function viene eseguita fino al primo `yield` (checkpoint) o alla soglia di timeout
6. Se non completata → `JobRunnerLib` serializza lo stato in `ScriptProperties` e crea un trigger temporizzato
7. Al trigger successivo → `JobRunnerLib` riprende dal `yield` precedente, ripristinando lo stato
8. A completamento → elimina il trigger, aggiorna `GasProcessMonitorLib` con lo stato finale

---

## 6. Registro dei Job SGSA

`JobRunnerLib` usa un Registry Pattern: i job sono identificati da un nome stringa e associati a una generator function. SGSA registra i propri job handler in `Bootstrap.js`.

| Nome job | Logica di iterazione | Operazione per elemento |
|----------|---------------------|-------------------------|
| `generaDocumentiPerClasse` | Itera su tutte le classi attive | `DocumentGenerationService.generateDocument(configId, classeId)` |
| `generaDocumentiPerAlunno` | Itera su tutti gli alunni attivi di una classe o dell'istituto | `DocumentGenerationService.generateDocument(configId, alunnoId)` |
| `inviaEmailPerProcesso` | Itera sui destinatari risolti da `CONF_MAIL.PROCESSO` | `EmailNotificationService.sendEmail(patternId, entryPoint, destinatario)` |
| `eseguiImportazione` | Esecuzione singola (non iterativa) | `ImportService.executeImport(configId)` |

Il job `eseguiImportazione` è avvolto nel Job Runner non per l'iterazione (gestita internamente da `ImportService`) ma per uniformità di monitoraggio tramite `GasProcessMonitorLib`.

La struttura a livelli per i documenti personalizzati degli alunni (iterazione classe → alunno → piano) è implementata come iteratori annidati all'interno della generator function del job `generaDocumentiPerAlunno`, non come funzionalità del Job Runner stesso.

---

## 7. Serializzazione dello Stato

Tra un'esecuzione e la successiva, lo stato del job viene salvato in `ScriptProperties`. Questo impone vincoli precisi.

**Può essere serializzato:**
- L'indice corrente dell'iterazione (intero)
- Il `configId` o `patternId` della configurazione attiva
- Array di ID già processati (es. `classiProcessate`, `emailInviate`)
- Contatori di successo ed errore
- Parametri scalari passati all'avvio

**Non può essere serializzato:**
- Istanze di oggetti con metodi (entità, repository, servizi)
- Riferimenti a servizi del container DI
- Oggetti con proprietà circolari
- Istanze di classi GAS native (es. `SpreadsheetApp.Range`)

La generator function di ogni job DEVE essere progettata come **stateless** rispetto ai valori non serializzabili: ad ogni ripresa DEVE recuperare le dipendenze necessarie dal container DI tramite bootstrap, senza aspettarsi che oggetti vivi siano sopravvissuti alla serializzazione.

**Limite `PropertiesService`:** `ScriptProperties` ha un limite totale di 500KB. NON avviare MAI più di 10–20 job concorrenti. Il ritardo minimo tra riprese è 1 minuto.

**Rischio di superamento del limite:** nei job molto grandi (es. invio di 1.500+ email), un array di ID già processati (`emailInviate`, `classiProcessate`) può crescere fino ad approssimare o superare le 500KB, causando un fallimento irreversibile della serializzazione dello stato. Per mitigare il rischio, lo stato DEVE restare minimale (contatori e indici, MAI intere liste di payload) e DEVE eventualmente troncare o esternalizzare le liste di ID oltre una soglia dimensionale.

---

## 8. Gestione degli Errori nei Job

Ogni elemento processato all'interno del job (ogni classe, alunno, email) è avvolto in un blocco di gestione errori individuale. Un errore su un singolo elemento non interrompe l'elaborazione degli elementi successivi.

**Errore non critico (singolo elemento):**
- Loggato tramite `LoggerService` con il contesto dell'elemento (es. `classeId`, `alunnoEmail`)
- Registrato nei metadati del job, contribuendo al contatore errori visibile in `GasProcessMonitorLib`
- Il job prosegue con l'elemento successivo

**Errori critici** che interrompono il job con stato `FAILED`:
- Impossibilità di accedere al database (`SPREADSHEET_ID` non più valido)
- Errori di inizializzazione del container DI
- `CONF_DOC.GENERATORE` non registrato nel `strategyRegistry`
- Qualsiasi condizione che rende impossibile proseguire per qualsiasi elemento

Il report finale del job distingue elementi processati con successo da quelli con errori non critici.

**Assunzione di non concorrenza:** il sistema presuppone che NON vengano MAI avviati job paralleli o sovrapposti sulle stesse tabelle (in particolare `LOG_DOCS` e `LOG_MAIL`): un nuovo job DEVE essere lanciato SOLO dopo il completamento (con successo o `FAILED`) del precedente. Questa disciplina operativa esclude le race condition sul pattern "carica tabella → filtra in memoria → salva" senza richiedere un meccanismo di locking applicativo dedicato.

---

## 9. Monitoraggio con `GasProcessMonitorLib`

**Libreria di riferimento:** `GasProcessMonitorLib` (L4).

La sidebar di monitoraggio viene aperta automaticamente dalla funzione wrapper `menu_*` prima dell'avvio del job.

**Durante l'esecuzione**, la generator function aggiorna `GasProcessMonitorLib` ad ogni `yield` con:
- **Percentuale di completamento:** `completati / totale * 100`
- **Messaggio stato elemento corrente:** es. `"Generazione verbale classe 5ALC"` o `"Errore: template non trovato per 3BLS"`
- **Stima tempo rimanente:** calcolata in base alla velocità media degli elementi già processati

**Al termine del job**, la sidebar mostra il riepilogo finale:
- Numero totale di elementi processati
- Numero di successi
- Numero di errori non critici (con lista degli elementi falliti e descrizione dell'errore)
- Durata totale dell'esecuzione (somma di tutte le sessioni GAS per job multi-trigger)

---

## 10. Gestione Quote Google

| Risorsa | Limite account Google gratuito | Limite Google Workspace |
|---------|-------------------------------|------------------------|
| Email/giorno | 100 | 1.500 |
| Esecuzione GAS (singola invocazione) | 6 minuti | 30 minuti |
| `ScriptProperties` | 500KB totale | 500KB totale |
| Trigger temporizzati | 20 attivi contemporaneamente | 20 attivi contemporaneamente |

Per operazioni massive che superano questi limiti, SGSA usa `JobRunnerLib` con chunking configurabile per email (100 per sessione) e checkpoint per classe o alunno per i documenti.
