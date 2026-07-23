# 01 — Schema Database

Questo documento descrive lo schema fisico del database di SGSA. Il database è implementato su Google Sheets: ogni foglio corrisponde a una tabella, ogni riga a un record, ogni colonna a un campo.

---

## 0. Master Sheet

Lo script orchestratore SGSA è associato a un unico foglio di calcolo **Master Sheet**, che funge da punto di ingresso per i database di ogni anno scolastico. Il Master Sheet DEVE contenere esattamente le colonne seguenti (`ANNO_SCOLASTICO` è la chiave primaria):

| Colonna                | Formato / Vincolo                                         | Descrizione                                                                                                                                           |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANNO_SCOLASTICO`      | `YYYY-YYYY` (es. `2025-2026`); OBBLIGATORIO, univoco (PK) | Anno scolastico della riga                                                                                                                            |
| `ID_SPREADSHEET`       | Drive File ID; OBBLIGATORIO                               | ID dello spreadsheet del database dell'anno (strutturato come da schema seguente)                                                                     |
| `ID_CARTELLA_GOOGLE`   | Drive Folder ID; OBBLIGATORIO                             | ID della cartella Drive radice in cui SEMPRE salvare tutti i documenti generati per l'anno                                                            |
| `DIRIGENTE_SCOLASTICO` | Testo, formato `"prof.ssa MARIA BIANCHI"`; OBBLIGATORIO   | Nome del dirigente scolastico                                                                                                                         |
| `SUPERVISORE_EMAIL`    | Email valida oppure vuota                                 | Indirizzo a cui inviare in BCC tutte le email del sistema; PUÒ essere vuoto — in tal caso NESSUN BCC è aggiunto (vedi `11_PIPELINE_EMAIL.md`, Step 4) |
| `TEST_MODE`             | `VERO`/`FALSO` (booleano) oppure vuoto; default `FALSO`    | Se `VERO`, ogni email inviata dal sistema viene reindirizzata (solo campo A, CC/BCC soppressi) all'indirizzo del proprietario Drive del Master Sheet, invece dei destinatari reali                                                    |

**Ordinamento e anno corrente:** le righe del Master Sheet DEVONO SEMPRE essere mantenute in ordine cronologico decrescente per `ANNO_SCOLASTICO`. La prima riga È quindi SEMPRE l'anno scolastico corrente; la profondità storica si ottiene scorrendo le righe successive, senza alcun calcolo. NON esiste — e NON DEVE esistere — un parametro di configurazione separato per indicare l'anno corrente.

---

## 1. Elenco tabelle

| Tabella                 | Ruolo nel sistema                                        |
| ----------------------- | -------------------------------------------------------- |
| **ALUNNI**              | Registro anagrafico degli studenti                       |
| **DOCENTI**             | Anagrafica del corpo docente                             |
| **CLASSI**              | Configurazione classi e matrice di assegnazione cattedre |
| **MATERIE**             | Catalogo delle discipline insegnate                      |
| **INDIRIZZI**           | Percorsi di studio disponibili nell'istituto             |
| **DIPART**              | Dipartimenti disciplinari                                |
| **RUOLI**               | Incarichi speciali d'istituto                            |
| **VARIAZIONI_CATTEDRA** | Cambi permanenti di titolarità post-inizio anno          |
| **SUPPLENZE**           | Sostituzioni temporanee dei docenti                      |
| **CARENZE**             | Insufficienze degli studenti (struttura a matrice)       |
| **PIANI**               | Piani Didattici Personalizzati (PDP, PEI, PFP)           |
| **PROGETTI**            | Attività extracurricolari e percorsi PCTO/ASL            |
| **MOV_ALUNNI**          | Storico della mobilità studentesca                       |
| **ASL**                 | Ore cumulative di Alternanza Scuola Lavoro               |
| **CONF_DOC**            | Configurazione motore di generazione documenti           |
| **CONF_MAIL**           | Configurazione motore di notifiche email                 |
| **CONF_IMP**            | Configurazione importazioni ETL                          |
| **LOG_DOCS**            | Audit trail dei documenti generati                       |
| **LOG_FOLD**            | Audit trail delle cartelle create su Drive               |
| **LOG_MAIL**            | Audit trail delle email inviate                          |

---

## 2. Schema dettagliato per tabella

### ALUNNI

Registro anagrafico degli studenti. La colonna `EMAIL` è la chiave primaria e l'identificativo con cui ogni alunno è referenziato in tutto il sistema.

| Colonna         | Tipo    | PK  | FK        | Vincoli                                                                                                                                             | Descrizione                                                                           |
| --------------- | ------- | --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `EMAIL`         | String  | ✅  | —         | Email valida (RFC 5321)                                                                                                                             | Identificativo univoco                                                                |
| `COGNOMENOME`   | String  | —   | —         | —                                                                                                                                                   | Cognome e nome                                                                        |
| `CLASSE`        | String  | —   | CLASSI.ID | Deve esistere in CLASSI.ID                                                                                                                          | Classe attualmente frequentata                                                        |
| `RELIGIONE`     | String  | —   | —         | Enum                                                                                                                                                | Scelta IRC                                                                            |
| `CURRICULUM`    | Json    | —   | —         | JSON: chiave = MateriaId (non duplicabile), valore = array di zero o più specificità scelte. Es: `{"INTERPRETAZIONE": ["CHITARRA", "PIANOFORTE"]}`. | Scelta di alcune materie speciali con specificità                                     |
| `ATTIVO`        | Boolean | —   | —         | —                                                                                                                                                   | Indica se lo studente è frequentante                                                  |
| `RIPETENTE`     | Boolean | —   | —         | —                                                                                                                                                   | Indica se sta ripetendo l'anno                                                        |
| `RAPPR_STUD`    | Boolean | —   | —         | —                                                                                                                                                   | Eletto rappresentante di classe                                                       |
| `RAPPR_GEN`     | String  | —   | —         | Testo libero                                                                                                                                        | Nome del genitore eletto rappresentante di classe; se non disponibile, lasciare vuoto |
| `TUTOR_1`       | String  | —   | —         | Email valida                                                                                                                                        | Primo genitore/tutore                                                                 |
| `TUTOR_2`       | String  | —   | —         | Email valida                                                                                                                                        | Secondo genitore/tutore                                                               |
| `NOTE`          | String  | —   | —         | —                                                                                                                                                   | Annotazioni interne; campo libero                                                     |
| `DATA_MODIFICA` | Date    | —   | —         | —                                                                                                                                                   | Data ultima modifica del record                                                       |

**Regola attività:** Un record ALUNNI È attivo SE E SOLO SE `ATTIVO = true`. Un record correlato (CARENZE, PIANI, ASL, LOG_DOCS) È considerato attivo SOLO SE sono attivi SIA l'alunno associato SIA la sua classe.

**Nota classi articolate:** per uno studente iscritto a una classe articolata, `ALUNNI.CLASSE` DEVE contenere l'`ID` della **classe partner** specifica (es. `4A-LC`) e MAI quello della classe parent (`4A`): è questo valore a determinare l'indirizzo effettivo dello studente (vedi `AlunnoRepository.getIndirizzoStudente()` in `06_REPOSITORY.md`). Di conseguenza anche `CARENZE.CLASSE` per quello studente DEVE riportare l'ID della classe partner, coerentemente con l'invariante dell'aggregato Alunno (vedi `05_AGGREGATI_E_CLASSI_ARTICOLATE.md`). Per le classi non articolate, `ALUNNI.CLASSE` punta alla classe stessa.

---

### DOCENTI

Anagrafica del corpo docente. La colonna `EMAIL` è la chiave primaria.

| Colonna   | Tipo    | PK  | FK        | Vincoli                    | Descrizione                              |
| --------- | ------- | --- | --------- | -------------------------- | ---------------------------------------- |
| `EMAIL`   | String  | ✅  | —         | Email valida               | Identificativo univoco                   |
| `COGNOME` | String  | —   | —         | —                          | Cognome                                  |
| `NOME`    | String  | —   | —         | —                          | Nome                                     |
| `GENERE`  | String  | —   | —         | Enum                       | Determina l'appellativo (Prof./Prof.ssa) |
| `DIPART`  | String  | —   | DIPART.ID | Deve esistere in DIPART.ID | Dipartimento disciplinare                |
| `ITP`     | Boolean | —   | —         | —                          | Insegnante Tecnico Pratico (laboratorio) |

---

### CLASSI

Configurazione strutturale delle classi. Funge da **matrice di assegnazione cattedre**: oltre ai dati fissi, contiene colonne dinamiche (una per materia) con le email dei docenti assegnati. Rappresenta il livello Priority 3 (fallback) nella gerarchia di risoluzione ruoli.

| Colonna                   | Tipo         | PK  | FK            | Vincoli                          | Descrizione                                                                                                                                                                                                                                       |
| ------------------------- | ------------ | --- | ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID`                      | String       | ✅  | —             | —                                | Codice univoco (es. `5ALC`, `3B`)                                                                                                                                                                                                                 |
| `ANNO`                    | Integer      | —   | —             | 1–5                              | Anno di corso                                                                                                                                                                                                                                     |
| `TERMINALE`               | Boolean      | —   | —             | —                                | Indica se è una classe terminale (generalmente una quinta, ma nei corsi quadriennali sono le quarte, negli IeFP le terze, e così via)                                                                                                             |
| `SEZ`                     | String       | —   | —             | —                                | Sezione alfabetica                                                                                                                                                                                                                                |
| `INDIRIZZO`               | String       | —   | INDIRIZZI.ID  | Deve esistere                    | Percorso di studio                                                                                                                                                                                                                                |
| `COORD`                   | String (CSV) | —   | DOCENTI.EMAIL | Email valide separate da virgola | Coordinatore/i di classe                                                                                                                                                                                                                          |
| `RUOLI`                   | JSON         | —   | —             | —                                | Ruoli speciali nella classe (es. `{"TUTOR_ASL":"…","SEGRETARIO":"…"}`). Ogni valore può essere una singola email o un CSV di più email, per ruoli che ammettono più titolari contemporaneamente (es. più tutor ASL)                               |
| `ATTIVA`                  | Boolean      | —   | —             | —                                | Classe attiva nell'anno corrente                                                                                                                                                                                                                  |
| `ARTICOLAZIONE`           | JSON         | —   | —             | —                                | Configurazione classi articolate (vedi `05_AGGREGATI_E_CLASSI_ARTICOLATE.md`); una classe articolata ha tre righe nel DB: la classe completa e le due "sottoclassi" componenti.                                                                   |
| `STORICO`                 | String (CSV) | —   | —             | —                                | Nomi che la classe ha avuto negli anni precedenti (es. `4ALC` per l'attuale `5ALC`)                                                                                                                                                               |
| `*[MATERIA]*`             | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonne dinamiche: una per materia, contiene email docenti titolari. Rappresenta Priority 3.                                                                                                                                                      |
| `*[MATERIA.itp]*`         | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonne dinamiche: docenti ITP per la materia                                                                                                                                                                                                     |
| `*[MATERIA.[SPECIFICA]]*` | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonne dinamiche: docenti per la specifica della materia (es. `Esecuzione e interpretazione` nel liceo musicale può avere `Chitarra`, `Pianoforte`, eccetera, e ogni studente può seguirne solo un sottoinsieme differente dagli altri studenti) |
| `IRC`                     | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonna speciale: docente di Religione Cattolica                                                                                                                                                                                                  |
| `ALT`                     | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonna speciale: docente attività alternativa all'IRC                                                                                                                                                                                            |

**Nota IRC/ALT:** Le colonne `IRC` e `ALT` DEVONO essere trattate dal `ClasseRepository` come colonne dinamiche speciali, distinte dalle materie standard. NON corrispondono — e NON DEVONO corrispondere — ad alcun `ID` della tabella `MATERIE`.

**Invariante ITP:** Ogni docente presente in una colonna `*[MATERIA.itp]*` DEVE avere `DOCENTI.ITP = true`.

---

### MATERIE

Catalogo delle discipline. I codici univoci (`ID`) sono usati come nomi di colonne dinamiche nelle tabelle CLASSI e CARENZE. Lookup table stabile. Ogni colonna dinamica `[MATERIA]` delle tabelle CLASSI e CARENZE DEVE corrispondere a un `ID` presente in questa tabella.

| Colonna      | Tipo   | PK  | Vincoli                   | Descrizione                                                                                                                                                                                                                                          |
| ------------ | ------ | --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID`         | String | ✅  | Uppercase, 2–10 caratteri | Sigla univoca (es. `ITA`, `MAT`)                                                                                                                                                                                                                     |
| `NOME`       | String | —   | —                         | Nome esteso per documenti ufficiali (es. `Lingua e letteratura italiana`)                                                                                                                                                                            |
| `SINTESI`    | String | —   | —                         | Nome abbreviato per stampe compatte (es. `Italiano`)                                                                                                                                                                                                 |
| `COLORE_1`   | String | —   | Hex code                  | Colore primario (bordi, intestazioni)                                                                                                                                                                                                                |
| `COLORE_2`   | String | —   | Hex code                  | Colore secondario (sfondi)                                                                                                                                                                                                                           |
| `SIMBOLO`    | String | —   | —                         | Icona/Emoji rappresentativa                                                                                                                                                                                                                          |
| `ESAME_CFG`  | JSON   | —   | —                         | Prima/seconda prova per indirizzo: `{"prima_prova":["LC"],"seconda_prova":["LS"]}`                                                                                                                                                                   |
| `EVOLUZIONE` | JSON   | —   | —                         | Evoluzione delle relazioni tra materie negli anni, ad esempio per accorpamento o sdoppiamenti o cambi di nome negli anni di corso. Es. `GST - Storia e Geografia` (1°-2° anno) diventa `STO - Storia` (3°-4°-5° anno): `{"GST":[1,2],"STO":[3,4,5]}` |

---

### INDIRIZZI

Lookup table dei percorsi di studio. Stabile, cachata completamente in memoria.

| Colonna          | Tipo   | PK  | Vincoli             | Descrizione                                                            |
| ---------------- | ------ | --- | ------------------- | ---------------------------------------------------------------------- |
| `ID`             | String | ✅  | —                   | Codice (es. `LC`, `LS`, `LSSA`)                                        |
| `NOME`           | String | —   | —                   | Descrizione estesa (es. `Liceo scientifico opzione scienze applicate`) |
| `NOME_SINTETICO` | String | —   | —                   | Descrizione estesa (es. `Scientifico scienze applicate`)               |
| `TIPO`           | String | —   | Enum (TipoIstituto) | Tipo di istituto (es. LICEO, ITS, IEFP, PROFESSIONALE, TECNICO)        |

---

### DIPART

Organizzazione dei dipartimenti disciplinari.

| Colonna   | Tipo         | PK  | FK            | Descrizione                         |
| --------- | ------------ | --- | ------------- | ----------------------------------- |
| `ID`      | String       | ✅  | —             | Sigla (es. `LETTERE`, `MATEMATICA`) |
| `NOME`    | String       | —   | —             | Nome esteso                         |
| `CAPO`    | String       | —   | DOCENTI.EMAIL | Email del capo dipartimento         |
| `MATERIE` | String (CSV) | —   | MATERIE.ID    | Materie afferenti al dipartimento   |

---

### RUOLI

Incarichi speciali d'istituto. Lookup table stabile.

| Colonna   | Tipo   | PK  | FK            | Descrizione                                       |
| --------- | ------ | --- | ------------- | ------------------------------------------------- |
| `ID`      | String | ✅  | —             | Codice ruolo (es. `AN_DIG`, `REF_BES`)            |
| `NOME`    | String | —   | —             | Descrizione estesa                                |
| `DOCENTE` | String | —   | DOCENTI.EMAIL | Email dei docenti incaricati, separate da virgola |

**Ruoli predefiniti nel sistema** (non nella tabella RUOLI ma usati ovunque):

- `COORDINATORI` → risolto da `CLASSI.COORD` (nome al plurale: una classe può avere più coordinatori)
- `RAPPRESENTANTI_STUDENTI` → risolto da `ALUNNI.RAPPR_STUD` (nome al plurale: una classe può avere più rappresentanti)

**Nota su `RAPPR_GEN`:** `ALUNNI.RAPPR_GEN` NON è — e NON DEVE MAI essere trattato come — un ruolo risolvibile in email. È un campo testuale (nome libero del genitore rappresentante) che DEVE essere usato ESCLUSIVAMENTE come dato per i placeholder dei template — vedi `focus.classe.rappresentanti.genitori` in `02_CDU_STRUTTURA.md` e la nota dedicata in `14_SERVIZI_UTILITY.md`.

---

### VARIAZIONI_CATTEDRA

Cambi permanenti di titolarità avvenuti dopo l'inizio anno. Rappresenta il livello **Priority 2** nella gerarchia di risoluzione ruoli: sovrascrive CLASSI ma è sovrascrivibile da una supplenza attiva.

| Colonna            | Tipo   | PK (parte) | FK            | Descrizione                              |
| ------------------ | ------ | ---------- | ------------- | ---------------------------------------- |
| `CLASSE_ID`        | String | ✅         | CLASSI.ID     | Classi interessate, separate da virgola  |
| `MATERIA_ID`       | String | ✅         | MATERIE.ID    | Materie interessate, separate da virgola |
| `VECCHIO_TITOLARE` | String | —          | DOCENTI.EMAIL | Docente che cessa la titolarità          |
| `NUOVO_TITOLARE`   | String | —          | DOCENTI.EMAIL | Docente che acquisisce la titolarità     |
| `DATA_DECORRENZA`  | Date   | —          | —             | Data di efficacia della variazione       |

---

### SUPPLENZE

Sostituzioni temporanee dei docenti. Rappresenta il livello **Priority 1** nella gerarchia di risoluzione ruoli: sovrascrive sia CLASSI che VARIAZIONI_CATTEDRA per il periodo indicato.

| Colonna     | Tipo   | PK (parte) | FK            | Vincoli           | Descrizione                                                                             |
| ----------- | ------ | ---------- | ------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `TITOLARE`  | String | ✅         | DOCENTI.EMAIL | —                 | Docente assente (può essere il titolare nominale o il nuovo titolare da una variazione) |
| `SUPPLENTE` | String | ✅         | DOCENTI.EMAIL | —                 | Docente sostituto                                                                       |
| `DAL`       | Date   | ✅         | —             | Obbligatorio      | Inizio supplenza                                                                        |
| `AL`        | Date   | —          | —             | —                 | Fine supplenza                                                                          |
| `CLASSI`    | String | ✅         | CLASSI.ID     | CSV o `*` (tutte) | Classi coperte dalla supplenza                                                          |
| `MATERIE`   | String | ✅         | MATERIE.ID    | CSV o `*` (tutte) | Materie coperte dalla supplenza                                                         |

**Invariante:** Un docente NON PUÒ MAI avere due supplenze con periodi sovrapposti per lo stesso contesto classe+materia. Questo invariante DEVE essere verificato prima della creazione di ogni nuova supplenza (vedi `SupplenzaRepository.findSupplenzaSpecifica()` in `06_REPOSITORY.md`).

**Catene di supplenza:** un `SUPPLENTE` PUÒ a sua volta essere `TITOLARE` in un altro record `SUPPLENZE` (supplenza del supplente). NON esiste alcun limite di profondità: la risoluzione del docente effettivamente attivo DEVE seguire la catena ricorsivamente fino all'ultimo supplente attivo per la data e il contesto richiesti (vedi `RisolutoreRuoliService` in `14_SERVIZI_UTILITY.md`).

**Nota su chiave primaria e colonne CSV:** le colonne `CLASSI` e `MATERIE` partecipano alla chiave primaria come testo grezzo. L'unicità è quindi puramente testuale: due CSV semanticamente equivalenti ma scritti in ordine diverso (es. `"5A,4B"` vs `"4B,5A"`) NON sono riconosciuti come duplicati dal confronto di chiave, mentre l'invariante di business sulla sovrapposizione richiede il confronto semantico (`applicaAClasse`/`applicaAMateria`), eseguito SOLO a runtime. Lo stesso vale per `VARIAZIONI_CATTEDRA` (`CLASSE_ID`, `MATERIA_ID`) e per `LOG_MAIL` (`DESTINATARI`). L'utente DEVE mantenere un ordine coerente nei CSV per evitare duplicati logici non rilevati dal sistema.

---

### CARENZE

Insufficienze degli studenti. **Struttura a matrice**: ogni riga è una rilevazione (studente × data); le colonne dinamiche per materia contengono il voto o la nota di carenza.

| Colonna             | Tipo    | PK (parte) | FK           | Vincoli                                                                 | Descrizione                                                                                                                               |
| ------------------- | ------- | ---------- | ------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `STUDENTE`          | String  | ✅         | ALUNNI.EMAIL | —                                                                       | Email dello studente                                                                                                                      |
| `PROGRESSIVO`       | Integer | ✅         | —            | Assegnato direttamente dall'applicazione (non auto-incrementato dal DB) | Numero progressivo del record per singolo alunno                                                                                          |
| `CLASSE`            | String  | —          | CLASSI.ID    | —                                                                       | Classe al momento della rilevazione                                                                                                       |
| `DATA`              | Date    | —          | —            | —                                                                       | Data della rilevazione (es. pagellino)                                                                                                    |
| `NOTIFICATO`        | String  | —          | —            | —                                                                       | Timestamp della notifica inviata alla famiglia                                                                                            |
| `ASSENZE`           | Boolean | —          | —            | —                                                                       | Flag per segnalare assenze elevate                                                                                                        |
| `NOTE`              | String  | —          | —            | —                                                                       | Annotazioni generiche del consiglio                                                                                                       |
| `DATA_MODIFICA`     | Date    | —          | —            | —                                                                       | Data ultima modifica del record                                                                                                           |
| `*[MATERIA]*`       | String  | —          | MATERIE.ID   | —                                                                       | Colonne dinamiche: voto numerico o nota testuale per ogni materia                                                                         |
| `*[SpecificitaId]*` | String  | —          | —            | —                                                                       | Colonne dinamiche: voto/nota per la specificità (es. `INTERPRETAZIONE.CHITARRA`). Presenti solo per le materie che prevedono specificità. |

**Chiave primaria composita:** `(STUDENTE, PROGRESSIVO)` — non esiste una colonna `ID`.

**Algoritmo PROGRESSIVO:** alla creazione di una nuova carenza, l'applicazione DEVE assegnare `PROGRESSIVO = MAX(PROGRESSIVO esistente per quello STUDENTE) + 1`. Il sistema NON gestisce conflitti tra scritture concorrenti sullo stesso studente: l'utente DEVE evitare operazioni parallele che potrebbero generare progressivi duplicati.

---

### PIANI

Piani Didattici Personalizzati. Parte dell'aggregato Alunno.

| Colonna     | Tipo   | PK (parte) | FK           | Descrizione                                                                                                            |
| ----------- | ------ | ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `STUDENTE`  | String | ✅         | ALUNNI.EMAIL | Studente titolare                                                                                                      |
| `TIPO`      | String | ✅         | —            | Enum; parte della chiave primaria composita                                                                            |
| `PARAMETRI` | JSON   | —          | —            | Dati specifici del piano, utilizzabili per placeholder e per le condizioni di generazione dei documenti personalizzati |

**Chiave primaria composita:** `(STUDENTE, TIPO)` — DEVE esistere AL PIÙ un piano attivo per ogni valore di `TIPO` per ciascuno studente. NON esiste una colonna `ID` UUID.

---

### PROGETTI

Attività extracurricolari e percorsi ASL. Parte dell'aggregato Classe.

| Colonna     | Tipo    | PK (parte) | FK        | Descrizione                                                               |
| ----------- | ------- | ---------- | --------- | ------------------------------------------------------------------------- |
| `CLASSE`    | String  | ✅         | CLASSI.ID | Classe assegnataria                                                       |
| `TIPO`      | String  | ✅         | —         | Enum                                                                      |
| `NOME`      | String  | ✅         | —         | Titolo del progetto                                                       |
| `REFERENTE` | String  | —          | —         | Email del docente, o nome dell'esperto esterno, responsabile del progetto |
| `ORE`       | Integer | —          | —         | Monte ore totale                                                          |
| `ORE_ASL`   | Integer | —          | —         | Ore valide ai fini del conteggio ASL                                      |

---

### MOV_ALUNNI

Storico della mobilità studentesca. Audit trail append-only.

| Colonna    | Tipo   | PK (parte) | FK           | Descrizione                                                             |
| ---------- | ------ | ---------- | ------------ | ----------------------------------------------------------------------- |
| `STUDENTE` | String | ✅         | ALUNNI.EMAIL | Studente coinvolto                                                      |
| `TIPO`     | String | ✅         | —            | Enum                                                                    |
| `DATA`     | Date   | ✅         | —            | Data effettiva del movimento                                            |
| `DA`       | String | —          | —            | Classe di provenienza, oppure `ALTRO ISTITUTO`                          |
| `A`        | String | —          | —            | Classe o scuola di destinazione (es. `RITIRO`, oppure `ALTRO ISTITUTO`) |

---

### ASL

Ore cumulative di Alternanza Scuola Lavoro per studente per anno. Chiave primaria composta.

| Colonna    | Tipo    | PK (parte) | FK           | Descrizione                           |
| ---------- | ------- | ---------- | ------------ | ------------------------------------- |
| `STUDENTE` | String  | ✅         | ALUNNI.EMAIL | Email studente                        |
| `ANNO`     | String  | ✅         | —            | Anno scolastico (formato `YYYY-YYYY`) |
| `ORE`      | Integer | —          | —            | Ore accumulate nell'anno              |

---

### CONF_DOC

Motore di configurazione per la generazione documentale. Ogni record definisce completamente un tipo di documento generabile.

| Colonna                  | Tipo   | PK  | Descrizione                                                                                                                                                                                                                   |
| ------------------------ | ------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID`                     | String | ✅  | Codice identificativo (es. `VERBALE_CDC`)                                                                                                                                                                                     |
| `TIPO`                   | String | —   | Macro-categoria: (es. `VERBALE`, `PIANO_PERS`, `PIANO_LAVORO`...)                                                                                                                                                             |
| `NOME`                   | String | —   | Nome descrittivo per l'interfaccia utente                                                                                                                                                                                     |
| `GENERATORE`             | String | —   | Nome della Strategy di generazione (vedi `10_PIPELINE_DOCUMENTI.md`)                                                                                                                                                          |
| `FORMATO`                | String | —   | Enum                                                                                                                                                                                                                          |
| `SCHEMA_SOTTOCARTELLE`   | Enum   | —   | Indica quante sottocartelle creare                                                                                                                                                                                            |
| `PATH_OUT_SOTTOCARTELLE` | String | —   | Pattern per il percorso sottocartella (supporta placeholder `{{...}}`)                                                                                                                                                        |
| `GESTIONE_ARTICOLAZIONE` | Enum   | —   | Specifica come gestire la generazione per classi articolate                                                                                                                                                                   |
| `PATH_OUT`               | String | —   | Pattern per il percorso cartella (supporta placeholder `{{...}}` e separazione cartelle tramite `/`)                                                                                                                          |
| `FILE_NAME`              | String | —   | Pattern per il nome file (supporta placeholder `{{...}}`)                                                                                                                                                                     |
| `MODELLI`                | JSON   | —   | ID dei template Drive; forma semplice o condizionale                                                                                                                                                                          |
| `PERMESSI`               | JSON   | —   | ACL per file e cartelle (ruoli astratti → permessi)                                                                                                                                                                           |
| `PARAMETRI`              | JSON   | —   | Parametri extra passati al generatore. Campo riservato `overwrite: boolean` (default `false`): se `true`, `CheckDuplicatesStep` salta il controllo duplicati e forza la generazione (vedi `10_PIPELINE_DOCUMENTI.md`, Step 2) |
| `CONDIZIONE`             | String | —   | Espressione logica per la generazione condizionale                                                                                                                                                                            |
| `POST_PROCESSO`          | JSON   | —   | Azioni automatiche post-generazione (array)                                                                                                                                                                                   |

**Azioni POST_PROCESSO supportate:**

| Tipo                  | Effetto                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `INSERISCI_TIMESTAMP` | Scrive data/ora corrente in `tab.col` dove i criteri corrispondono |
| `AGGIORNA_CAMPO`      | Imposta `tab.col = val` dove i criteri corrispondono               |
| `AGGIORNA_STATO_DOC`  | Cambia `LOG_DOCS.STATO` di un documento già registrato             |

---

### CONF_MAIL

Motore di configurazione per le notifiche email. Ogni record è un pattern di comunicazione completo.

| Colonna         | Tipo    | PK  | Descrizione                                                                                                                                                                |
| --------------- | ------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID`            | String  | ✅  | Codice pattern (es. `CDC_OTTOBRE`)                                                                                                                                         |
| `OGGETTO`       | String  | —   | Oggetto email (supporta placeholder `{{...}}`)                                                                                                                             |
| `PROCESSO`      | String  | —   | Iteratore destinatari: `PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA_GENITORI`, `PER_CARENZA_GENITORI_E_ALUNNO`, `PER_CARENZA_GENITORI_E_COORD` |
| `BOX_CFG`       | JSON    | —   | Array di BoxConfig per i contenuti dinamici dell'email                                                                                                                     |
| `TESTO`         | String  | —   | HTML opzionale inserito prima dei box; supporta placeholder `{{...}}` risolti tramite `WorkspaceTemplateEngine`                                                            |
| `SUPPLENTI`     | String  | —   | Routing supplenze: `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, `ENTRAMBI`                                                                                                           |
| `NOREPLY`       | Boolean | —   | Aggiunge disclaimer no-reply nel footer                                                                                                                                    |
| `COLORE_HEADER` | String  | —   | Hex code dell'header HTML dell'email; default `#007bff` se non specificato (vedi `11_PIPELINE_EMAIL.md`, Step 3)                                                           |
| `CONDIZIONE`    | String  | —   | Espressione logica per l'invio condizionale (stesso meccanismo di `CONF_DOC.CONDIZIONE`); valutata da `ValutaCondizioniInvioStep`. Se null o vuoto, l'invio procede sempre |
| `POST_PROCESSO` | JSON    | —   | Azioni post-invio (stesso meccanismo di CONF_DOC)                                                                                                                          |

---

### CONF_IMP

Configurazione job ETL per importazioni dati da fonti esterne.

| Colonna  | Tipo    | PK  | Descrizione                                                                                |
| -------- | ------- | --- | ------------------------------------------------------------------------------------------ |
| `ID`     | String  | ✅  | Codice job (es. `IMPORT_ALUNNI`)                                                           |
| `TARGET` | String  | —   | Tabella di destinazione nel database                                                       |
| `CONFIG` | JSON    | —   | Parametri tecnici: strategia sorgente, mapping colonne, chiave univoca, gestione conflitti |
| `ATTIVO` | Boolean | —   | Abilita/disabilita l'importazione automatica                                               |

**Strategie sorgente supportate (`CONFIG.searchStrategy`):** `FILE_SINGOLO`, `CERCA_CARTELLE_CLASSE`, `CERCA_DOCUMENTI`.

**Strategie gestione conflitti (`CONFIG.conflictResolution`):** `IGNORE`, `OVERWRITE`, `TIMESTAMP`.

---

### LOG_DOCS

Audit trail immutabile (append-only) di ogni documento generato. Lega l'ID fisico Drive alla configurazione che lo ha generato.

| Colonna      | Tipo         | PK  | FK          | Descrizione                                                                                      |
| ------------ | ------------ | --- | ----------- | ------------------------------------------------------------------------------------------------ |
| `ID`         | String       | ✅  | —           | ID Drive del file generato                                                                       |
| `ID_GEN`     | String       | —   | CONF_DOC.ID | Tipo di configurazione usata                                                                     |
| `TIPO`       | String       | —   | —           | Tipo del documento; valore derivato da `CONF_DOC.TIPO` (campo categoriale, non PK di `CONF_DOC`) |
| `SOTTOTIPO`  | String       | —   | —           | Specializzazione del tipo documento (es. `PDP_BES`, `PEI`); non ha FK diretto in CONF_DOC        |
| `NOME`       | String       | —   | —           | Nome del file                                                                                    |
| `STATO`      | String       | —   | —           | Enum                                                                                             |
| `NOTIFICATO` | String       | —   | —           | Timestamp della notifica agli interessati                                                        |
| `PATH`       | String       | —   | —           | Percorso logico della cartella                                                                   |
| `LINK`       | String       | —   | —           | URL web del file                                                                                 |
| `CLASSI`     | String (csv) | —   | CLASSI.ID   | Classi associate (se applicabile)                                                                |
| `UTENTI`     | String (csv) | —   | —           | Email degli utenti associati (alunno o docente)                                                  |
| `MATERIA`    | String       | —   | MATERIE.ID  | Materia associata (se applicabile)                                                               |
| `DATA_CREAZ` | String       | —   | —           | Timestamp di creazione                                                                           |
| `ID_ORIG`    | String       | —   | LOG_DOCS.ID | ID del documento di origine (per versioni successive dello stesso documento)                     |

**Nota query CSV:** Le colonne `UTENTI` e `CLASSI` contengono valori separati da virgola. Le query di ricerca per email/classe singola DEVONO usare una ricerca per contenimento (CONTAINS) e MAI l'uguaglianza esatta.

---

### LOG_FOLD

Audit trail delle cartelle create su Google Drive.

| Colonna   | Tipo         | PK  | FK          | Descrizione                                                                                                        |
| --------- | ------------ | --- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `ID`      | String       | ✅  | —           | ID Drive della cartella                                                                                            |
| `TIPO`    | String       | —   | CONF_DOC.ID | Tipo configurazione che ha generato la cartella                                                                    |
| `NOME`    | String       | —   | —           | Nome cartella                                                                                                      |
| `PATH`    | String       | —   | —           | Percorso logico completo                                                                                           |
| `LINK`    | String       | —   | —           | URL web                                                                                                            |
| `CLASSI`  | String (csv) | —   | CLASSI.ID   | Classi associate (se applicabile); valori multipli separati da virgola — stessa semantica CSV di `LOG_DOCS.CLASSI` |
| `UTENTI`  | String (csv) | —   | —           | Email degli utenti associati (alunno o docente)                                                                    |
| `MATERIA` | String       | —   | MATERIE.ID  | Materia associata (se applicabile)                                                                                 |

---

### LOG_MAIL

Audit trail di ogni email inviata dal sistema.

| Colonna       | Tipo         | PK (parte) | FK           | Descrizione                                      |
| ------------- | ------------ | ---------- | ------------ | ------------------------------------------------ |
| `PATTERN`     | String       | ✅         | CONF_MAIL.ID | Pattern di notifica utilizzato                   |
| `DESTINATARI` | String (CSV) | ✅         | —            | Email dei destinatari effettivi                  |
| `DATA`        | String       | ✅         | —            | Timestamp dell'invio                             |
| `STATO`       | String       | —          | —            | Enum                                             |
| `ALLEGATI`    | JSON         | —          | —            | Riferimenti allegati: `{"docs":[],"folders":[]}` |
| `ERRORE`      | String       | —          | —            | Dettaglio dell'errore (se STATO = ERROR)         |
| `TESTO`       | String       | —          | —            | Corpo email in chiaro (HTML→testo, troncato)     |

---

## 3. Regole di attività

- Lo stato attivo di un record È determinato dalla colonna `ATTIVO` (`ALUNNI`) o `ATTIVA` (`CLASSI`).
- Un record in `CARENZE`, `PIANI`, `ASL`, `LOG_DOCS` È considerato attivo SE E SOLO SE sono attivi SIA l'alunno associato SIA la sua classe.

---

## 4. Gerarchia di risoluzione ruoli

Per determinare il docente attivo per una data classe, materia e data T, la risoluzione DEVE valutare le priorità in ordine decrescente (1 → 3) e applicare la **prima** che produce un match; le priorità successive NON DEVONO essere valutate.

```
Priority 1 — SUPPLENZE
  Se esiste una supplenza attiva a data T per quella classe e materia
  → il supplente sovrascrive tutto

Priority 2 — VARIAZIONI_CATTEDRA
  Se esiste una variazione con DATA_DECORRENZA ≤ T
  → il NUOVO_TITOLARE sovrascrive il titolare nominale in CLASSI

Priority 3 — CLASSI (fallback)
  Il docente nella colonna materia della classe
  → valore di default di inizio anno
```
