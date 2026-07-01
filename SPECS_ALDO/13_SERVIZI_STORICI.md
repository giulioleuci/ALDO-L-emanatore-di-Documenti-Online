# 13 — Servizi Storici

I servizi storici permettono a SGSA di accedere ai dati degli anni scolastici precedenti senza impattare le prestazioni delle operazioni ordinarie. Sono consumati dallo `StoricoProvider` (descritto in `09_CONTEXT_ENGINE.md`) tramite il pattern di lazy loading.

**Libreria di riferimento:** `SheetDBLib` (L2) per le query sui database storici.

---

## 1. Scopo e Contesto

SGSA gestisce più anni scolastici. Il database attivo (`SPREADSHEET_ID` principale) contiene i dati dell'anno corrente. I dati degli anni scolastici precedenti risiedono in spreadsheet separati, i cui ID sono registrati nel **Master Sheet** (esterno). Il sistema recupera questi riferimenti tramite il `MasterSheetRepository`.

I servizi storici rendono disponibili questi dati al CDU in modo selettivo: i dati vengono caricati **solo se e quando** sono effettivamente accessibili nel template o nel box renderer, non a priori durante la costruzione del CDU.

---

## 2. Lazy Loading Pattern

Lo `StoricoProvider` NON DEVE caricare i dati storici al momento della costruzione del CDU. DEVE invece inserire nel CDU degli oggetti `LazyRef` che incapsulano la query da eseguire.

**Comportamento del `LazyRef`:**
1. Alla prima lettura della proprietà: esegue la query sul database storico tramite `SheetDBLib` puntato allo spreadsheet dell'anno precedente
2. Mette in cache il risultato in memoria
3. Restituisce il dato

Accessi successivi alla stessa proprietà restituiscono il valore cachato senza nuove query. Questo evita che qualsiasi operazione che non usa dati storici paghi il costo delle query — anche quando `StoricoProvider` è presente nella recipe.

Se la recipe specifica `includiStorico: false`, il `StoricoProvider` DEVE essere saltato interamente e nessun `LazyRef` DEVE essere inserito nel CDU.

---

## 3. StoricoAlunniService

**Responsabilità:** dato un alunno identificato da `ALUNNI.EMAIL`, recupera i suoi dati negli anni scolastici precedenti.

Per ogni anno disponibile nei database storici configurati in `CONF_IMP`, il servizio recupera:
- La classe frequentata dall'alunno in quell'anno
- L'esito dell'anno scolastico (promosso, rimandato, non ammesso — da `MOV_ALUNNI` storico)
- Le carenze rilevate nell'ultima rilevazione dell'anno (da `CARENZE` storico)
- I piani personalizzati attivi (PDP, PEI, PFP) con il relativo tipo (da `PIANI` storico)

**Riconciliazione sigle materia:** le sigle materia delle carenze storiche DEVONO essere tradotte nelle sigle attuali tramite il campo JSON `MATERIE.EVOLUZIONE` (vedi `01_SCHEMA_DATABASE.md`) prima di essere restituite al CDU, in modo che i template possano confrontare carenze di anni diversi senza dover gestire le discontinuità di nomenclatura.

---

## 4. StoricoDocumentiService

**Responsabilità:** dato un alunno e un tipo di documento (`CONF_DOC.TIPO`), recupera i file già generati negli anni scolastici precedenti per quell'alunno e quel tipo.

La ricerca avviene su `LOG_DOCS` dei database storici, filtrando per `UTENTE = ALUNNI.EMAIL` e `ID_GEN` corrispondente al tipo configurato.

Per ogni documento trovato, il servizio restituisce un riferimento con:
- Nome del file
- Link Google Drive
- Anno scolastico di riferimento

**Integrazione con il box `documenti`:** questo servizio è usato dal box renderer `documenti` (descritto in `11_PIPELINE_EMAIL.md`) quando il `BOX_CFG` contiene il campo `arricchisciConStorico`. La struttura restituita è:

```
{ corrente: DocumentoEntity, storico: LazyRef<DocumentoStorico> }
```

Il campo `storico` è un `LazyRef` risolto solo se il template o il renderer vi accede effettivamente.

---

## 5. StoricoClassiService

**Responsabilità:** data una classe identificata per nome (es. `"5ALC"`), ricostruisce la composizione del Consiglio di Classe negli anni scolastici precedenti.

Il servizio usa `CLASSI.STORICO` — il campo che traccia i nomi passati della classe — per riconciliare le denominazioni cambiate tra anni (es. rinumerazioni, fusioni, sdoppiamenti di indirizzi). Ad esempio, se la classe attuale è `"5ALC"`, il suo `STORICO = "4ALC,3ALC,..."` permette di cercare quei nomi nei database storici.

Per ogni anno disponibile, il servizio restituisce l'elenco dei docenti assegnati alla classe con le relative materie, ricostruito dalle colonne docenti della tabella `CLASSI` del database storico corrispondente.

---

## 6. StoricoDocentiService

**Responsabilità:** dato un docente identificato da `DOCENTI.EMAIL`, recupera le classi e le materie insegnate negli anni scolastici precedenti.

La ricerca avviene sulle colonne docenti della tabella `CLASSI` dei database storici: per ogni anno, il servizio itera le colonne materia e identifica le classi in cui l'email del docente è presente.

**Utilizzo tipico:** documenti che richiedono informazioni sulla continuità didattica del docente, come relazioni finali, documenti di passaggio tra anni o comunicazioni che citano l'esperienza pregressa del docente con la classe.

---

## 7. Configurazione della Profondità Storica

La recipe associata a una configurazione documento o email può specificare la profondità storica (numero intero di anni, default `1`). La profondità è definita in modo granulare per dominio di dato, tramite le tre opzioni canoniche in `cdu.meta.parametriInput.opzioni` (vedi `02_CDU_STRUTTURA.md`):

| Opzione | Lazy loader governato |
|---------|-----------------------|
| `profonditaAnniStorico` | `StoricoAlunniService`, `StoricoClassiService`, `StoricoDocentiService` |
| `profonditaAnniAsl` | conteggio ore ASL storiche (`focus.alunno.didattica.asl`) |
| `profonditaAnniDocumenti` | `StoricoDocumentiService` (box `documenti` arricchito) |

Ognuna ha default `1` se non specificata. Nel seguito, il termine generico "profondità storica" si riferisce a quella pertinente al dominio del lazy loader in questione. Esempi di comportamento (validi per ciascuna opzione):

- valore `1` → carica solo l'anno immediatamente precedente
- valore `3` → carica i tre anni precedenti
- valore `7` → carica fino a sette anni precedenti (massimo consigliato)

Il parametro agisce come filtro sull'elenco degli `SPREADSHEET_ID` storici recuperati dal **MasterSheetRepository**: solo i database corrispondenti agli anni nell'intervallo vengono considerati come sorgenti.

Se `includiStorico: false`, le opzioni di profondità storica (`profonditaAnniStorico`, `profonditaAnniAsl`, `profonditaAnniDocumenti`) vengono ignorate e il `StoricoProvider` viene saltato interamente.

---

## 8. Riconciliazione Sigle Materia

L'evoluzione delle relazioni tra materie è tracciata tramite il campo JSON `MATERIE.EVOLUZIONE` nella tabella `MATERIE` (vedi `01_SCHEMA_DATABASE.md`).
