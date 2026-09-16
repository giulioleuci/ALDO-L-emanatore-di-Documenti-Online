# 01 — Schema Database

Questo documento descrive lo schema fisico del database di SGSA. Il database è implementato su Google Sheets: ogni foglio corrisponde a una tabella, ogni riga a un record, ogni colonna a un campo.

---

## 0. Master Sheet

Lo script orchestratore SGSA è associato a un unico foglio di calcolo **Master Sheet**, che funge da punto di ingresso per i database di ogni anno scolastico. Il Master Sheet DEVE contenere esattamente le colonne seguenti (`ANNO_SCOLASTICO` è la chiave primaria):

| Colonna                | Formato / Vincolo                                         | Descrizione                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANNO_SCOLASTICO`      | `YYYY-YYYY` (es. `2025-2026`); OBBLIGATORIO, univoco (PK) | Anno scolastico della riga                                                                                                                                                         |
| `ID_SPREADSHEET`       | Drive File ID; OBBLIGATORIO                               | ID dello spreadsheet del database dell'anno (strutturato come da schema seguente)                                                                                                  |
| `ID_CARTELLA_GOOGLE`   | Drive Folder ID; OBBLIGATORIO                             | ID della cartella Drive radice in cui SEMPRE salvare tutti i documenti generati per l'anno                                                                                         |
| `DIRIGENTE_SCOLASTICO` | Testo, formato `"prof.ssa MARIA BIANCHI"`; OBBLIGATORIO   | Nome del dirigente scolastico                                                                                                                                                      |
| `SUPERVISORE_EMAIL`    | Email valida oppure vuota                                 | Indirizzo a cui inviare in BCC tutte le email del sistema; PUÒ essere vuoto — in tal caso NESSUN BCC è aggiunto (vedi pipeline email, Step 7)                                      |
| `TEST_MODE`            | `VERO`/`FALSO` (booleano) oppure vuoto; default `FALSO`   | Se `VERO`, ogni email inviata dal sistema viene reindirizzata (solo campo A, CC/BCC soppressi) all'indirizzo del proprietario Drive del Master Sheet, invece dei destinatari reali |

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
| **CONF_AZIONI**         | Configurazione azioni standalone data-driven (permessi, validazione, sanificazione) |
| **LOG_DOCS**            | Audit trail dei documenti generati                       |
| **LOG_FOLD**            | Audit trail delle cartelle create su Drive               |
| **LOG_MAIL**            | Audit trail delle email inviate                          |
| **LOG_JOB**             | Storico delle run dei job batch (riepilogo per esecuzione) |

---

## 2. Schema dettagliato per tabella

### Colonne riservate all'utente

Le colonne il cui nome inizia con `_` sono riservate agli appunti e ai calcoli
dell'utente. ALDO le legge insieme al resto della riga, **le preserva a ogni
scrittura** (l'update è un merge sulla riga originale, non una sostituzione) e
non le interpreta mai: non compaiono in nessun tipo di entità, non sono mai
scambiate per colonne dinamiche, e la futura analisi di consistenza le ignora
invece di segnalarle come anomalie.

### ALUNNI

Registro anagrafico degli studenti. La colonna `EMAIL` è la chiave primaria e l'identificativo con cui ogni alunno è referenziato in tutto il sistema.

| Colonna         | Tipo    | PK  | FK        | Vincoli                                                                                                                                             | Descrizione                                                                           |
| --------------- | ------- | --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `EMAIL`         | String  | ✅  | —         | Email valida (RFC 5321)                                                                                                                             | Identificativo univoco                                                                |
| `COGNOMENOME`   | String  | —   | —         | —                                                                                                                                                   | Cognome e nome                                                                        |
| `CLASSE`        | String  | —   | CLASSI.ID | Deve esistere in CLASSI.ID                                                                                                                          | Classe attualmente frequentata                                                        |
| `RELIGIONE`     | String  | —   | —         | Enum: `IRC` \| `ALT` \| `NO`                                                                                                                        | Scelta IRC                                                                            |
| `CURRICULUM`    | Json    | —   | —         | JSON: chiave = MateriaId (non duplicabile), valore = array di zero o più specificità scelte. Es: `{"INTERPRETAZIONE": ["CHITARRA", "PIANOFORTE"]}`. | Scelta di alcune materie speciali con specificità                                     |
| `ATTIVO`        | Boolean | —   | —         | —                                                                                                                                                   | Indica se lo studente è frequentante                                                  |
| `RIPETENTE`     | Boolean | —   | —         | —                                                                                                                                                   | Indica se sta ripetendo l'anno                                                        |
| `RAPPR_STUD`    | Boolean | —   | —         | —                                                                                                                                                   | Eletto rappresentante di classe                                                       |
| `RAPPR_GEN`     | String  | —   | —         | Testo libero                                                                                                                                        | Nome del genitore eletto rappresentante di classe; se non disponibile, lasciare vuoto |
| `TUTOR_1`       | String  | —   | —         | Email valida                                                                                                                                        | Primo genitore/tutore                                                                 |
| `TUTOR_2`       | String  | —   | —         | Email valida                                                                                                                                        | Secondo genitore/tutore                                                               |
| `NOTE`          | String  | —   | —         | —                                                                                                                                                   | Annotazioni interne; campo libero                                                     |

**Regola attività:** Un record ALUNNI È attivo SE E SOLO SE `ATTIVO = true`. Un record correlato (CARENZE, PIANI, ASL, LOG_DOCS) È considerato attivo SOLO SE sono attivi SIA l'alunno associato SIA la sua classe.

**Nota classi articolate:** per uno studente iscritto a una classe articolata, `ALUNNI.CLASSE` DEVE contenere l'`ID` della **classe partner** specifica (es. `4A-LC`) e MAI quello della classe parent (`4A`): non esiste un metodo dedicato che deriva l'indirizzo effettivo dello studente — è la lookup ordinaria `IClasseRepository.getIndirizzo(classe)` sulla classe puntata da `ALUNNI.CLASSE` a restituirlo, quindi il vincolo sul valore di `CLASSE` (partner, non parent) è ciò che rende quella lookup corretta (`AlunnoProvider` ne è il consumatore in `02_CDU_STRUTTURA.md` §4.2). Di conseguenza anche `CARENZE.CLASSE` per quello studente DEVE riportare l'ID della classe partner. Per le classi non articolate, `ALUNNI.CLASSE` punta alla classe stessa.

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
| `ORE_POT` | Integer | —   | —         | Intero >= 0, default 0     | Ore settimanali di potenziamento/rinforzo |

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
| `ARTICOLAZIONE`           | JSON         | —   | —             | —                                | Configurazione classi articolate (struttura `ArticolazioneConfig`, `03_VALUE_OBJECTS_ED_ENUM.md`); una classe articolata ha tre righe nel DB: la classe completa e le due "sottoclassi" componenti.                                                                   |
| `STORICO`                 | String (CSV) | —   | —             | —                                | Nomi che la classe ha avuto negli anni precedenti (es. `4ALC` per l'attuale `5ALC`)                                                                                                                                                               |
| `*[MATERIA]*`             | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonne dinamiche: una per materia, contiene email docenti titolari. Rappresenta Priority 3.                                                                                                                                                      |
| `*[MATERIA.itp]*`         | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonne dinamiche: docenti ITP per la materia                                                                                                                                                                                                     |
| `*[MATERIA.[SPECIFICA]]*` | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonne dinamiche: docenti per la specifica della materia (es. `Esecuzione e interpretazione` nel liceo musicale può avere `Chitarra`, `Pianoforte`, eccetera, e ogni studente può seguirne solo un sottoinsieme differente dagli altri studenti) |
| `IRC`                     | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonna speciale: docente di Religione Cattolica                                                                                                                                                                                                  |
| `ALT`                     | String (CSV) | —   | DOCENTI.EMAIL | Email valide                     | Colonna speciale: docente attività alternativa all'IRC                                                                                                                                                                                            |

**Nota IRC/ALT:** Le colonne `IRC` e `ALT` in `CLASSI` corrispondono a righe `MATERIE` con `IS_RELIGIONE_ALT = true` (`ID = 'IRC'`, `ID = 'ALT'`) — questo permette a `VARIAZIONI_CATTEDRA`/`SUPPLENZE` di applicarsi anche a IRC/ALT come a qualsiasi altra materia. Il flag `IS_RELIGIONE_ALT` esiste per preservare la distinzione di ruolo esistente (es. `CDC` le include sempre, `DOCENTI_NO_RELIGIONE` le esclude sempre) — senza di esso, ogni consumatore del fan-out generico vedrebbe IRC/ALT mescolate a risultati che prima non le includevano mai. **Univocità non enforced a livello DB:** `IRC` e `ALT` sono elencate come colonne statiche di `COL_CLASSI` (non colonne dinamiche materia); la regola `DYN_CLASSI` che verifica che ogni colonna dinamica di `CLASSI` corrisponda a un `MATERIE.ID` esistente le esclude esplicitamente (sono già note al validatore), quindi `regoleValidazione()` NON verifica che le righe `MATERIE` con `ID='IRC'`/`ID='ALT'` esistano davvero. L'esistenza è enforced solo indirettamente: se una riga `SUPPLENZE`/`VARIAZIONI_CATTEDRA` referenzia `IRC`/`ALT` in `MATERIE` (CSV), `FK_SUPPLENZE_MATERIE`/`FK_VARIAZIONI_MATERIE` la richiede. Un DB privo di righe `MATERIE` per `IRC`/`ALT` ma con le colonne `CLASSI.IRC`/`CLASSI.ALT` valorizzate passa quindi la validazione, ma `ITeachingAssignmentResolver` — che richiede sempre la riga `MATERIE` per risolvere la cattedra (v. `MAT_NON_STANDARD.md` §2 nota di implementazione) — fallirà a runtime.

**Univocità nel CDU:** a livello di `focus.classe.consiglio.elenco` (proiezione di classe) IRC e ALT compaiono SEMPRE come due membri distinti del CdC quando entrambe le cattedre sono coperte — non c'è nulla da deduplicare, sono due materie diverse. L'unicità rilevante è invece per-alunno: `focus.alunno.consiglio.elenco` (02 §4.2) esclude a monte il ramo che non corrisponde a `ALUNNI.RELIGIONE` dell'alunno focalizzato, cosicché un alunno veda al più UNO tra il docente IRC e il docente ALT, mai entrambi.

**Invariante ITP:** Ogni docente presente in una colonna `*[MATERIA.itp]*` DEVE avere `DOCENTI.ITP = true`.

---

### MATERIE

Catalogo delle discipline. I codici univoci (`ID`) sono usati come nomi di colonne dinamiche nelle tabelle CLASSI e CARENZE. Lookup table stabile. Ogni colonna dinamica `[MATERIA]` delle tabelle CLASSI e CARENZE DEVE corrispondere a un `ID` presente in questa tabella.

`ID` può essere una sigla semplice (`MATE`) oppure un composito `[MATERIA].[SPECIFICA]` (es. `INTERPRET.CHITARRA`) che cataloga una specifica indirizzata da uno slot `CLASSI`/`CARENZE` con suffisso dinamico (`MAT_NON_STANDARD.md` §3). `IS_RELIGIONE_ALT` non ha senso per una riga specifica (IRC/ALT non hanno specifiche) ed è sempre `false`/assente, senza enforcement a livello DB.

| Colonna            | Tipo    | PK  | Vincoli                   | Descrizione                                                                                                                                                                                                                                          |
| ------------------ | ------- | --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID`               | String  | ✅  | Sigla semplice: uppercase, 2–10 caratteri; oppure composito `[MATERIA].[SPECIFICA]` | Sigla univoca (es. `ITA`, `MAT`) o composito (es. `INTERPRET.CHITARRA`)                                                                                                                                                                     |
| `NOME`             | String  | —   | —                         | Nome esteso per documenti ufficiali (es. `Lingua e letteratura italiana`)                                                                                                                                                                            |
| `SINTESI`          | String  | —   | —                         | Nome abbreviato per stampe compatte (es. `Italiano`)                                                                                                                                                                                                 |
| `COLORE_1`         | String  | —   | Hex code                  | Colore primario (bordi, intestazioni)                                                                                                                                                                                                                |
| `COLORE_2`         | String  | —   | Hex code                  | Colore secondario (sfondi)                                                                                                                                                                                                                           |
| `SIMBOLO`          | String  | —   | —                         | Icona/Emoji rappresentativa                                                                                                                                                                                                                          |
| `ESAME_CFG`        | JSON    | —   | —                         | Prima/seconda prova per indirizzo: `{"primaProva":["LC"],"secondaProva":["LS"]}`                                                                                                                                                                   |
| `EVOLUZIONE`       | JSON    | —   | —                         | Evoluzione delle relazioni tra materie negli anni, ad esempio per accorpamento o sdoppiamenti o cambi di nome negli anni di corso. Es. `GST - Storia e Geografia` (1°-2° anno) diventa `STO - Storia` (3°-4°-5° anno): `{"GST":[1,2],"STO":[3,4,5]}` |
| `IS_RELIGIONE_ALT` | Boolean | —   | —                         | `true` per le righe IRC/ALT: esclude questa materia dal fan-out generico di `ITeachingAssignmentResolver.resolveConsiglio` salvo richiesta esplicita (evita che appaia in ogni enumerazione di cattedra dove prima non compariva)                      |
| `PRINCIPALE`       | String  | —   | —                         | Nome della materia principale/famiglia (es. `Interpretazione ed esecuzione`); vuoto per righe non specifiche                                                                                                                                            |
| `SPECIFICITA`      | String  | —   | —                         | Nome descrittivo della specificità (es. `Chitarra`); vuoto per righe non specifiche                                                                                                                                                                  |

Una riga composita (`ID` nel formato `BASE.SPECIFICA`) DEVE avere `PRINCIPALE`
non vuoto: le famiglie che si diramano in specificità non sono mai
rappresentate da una riga bare della sola famiglia — ogni riga reale di tale
famiglia porta il proprio `PRINCIPALE`+`SPECIFICITA`. `NOME`, se vuoto, viene
ricostruito in lettura come `"${PRINCIPALE} (${SPECIFICITA})"` quando entrambi
sono presenti.

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

**Nota su `RAPPR_GEN`:** `ALUNNI.RAPPR_GEN` NON è — e NON DEVE MAI essere trattato come — un ruolo risolvibile in email. È un campo testuale (nome libero del genitore rappresentante) che DEVE essere usato ESCLUSIVAMENTE come dato per i placeholder dei template — vedi `focus.classe.rappresentanti.genitori` in `02_CDU_STRUTTURA.md`.

---

### VARIAZIONI_CATTEDRA

Cambi permanenti di titolarità avvenuti dopo l'inizio anno. Rappresenta il livello **Priority 2** nella gerarchia di risoluzione ruoli: sovrascrive CLASSI ma è sovrascrivibile da una supplenza attiva. Struttura speculare a `SUPPLENZE` (senza `AL`: una variazione è permanente finché non viene superata da una `DAL` successiva per lo stesso `TITOLARE`/scope).

| Colonna          | Tipo   | PK (parte) | FK            | Vincoli           | Descrizione                          |
| ---------------- | ------ | ---------- | ------------- | ------------------ | ------------------------------------ |
| `TITOLARE`       | String | ✅         | DOCENTI.EMAIL | —                 | Docente che cessa la titolarità      |
| `NUOVO_TITOLARE` | String | ✅         | DOCENTI.EMAIL | —                 | Docente che acquisisce la titolarità |
| `DAL`            | Date   | ✅         | —             | Obbligatorio       | Data di efficacia della variazione   |
| `CLASSI`         | String | ✅         | CLASSI.ID     | CSV o `*` (tutte) | Classi interessate                   |
| `MATERIE`        | String | ✅         | MATERIE.ID    | CSV o `*` (tutte) | Materie interessate                  |

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

**Invariante:** Un docente NON PUÒ MAI avere due supplenze con periodi sovrapposti per lo stesso contesto classe+materia. Questo invariante DEVE essere verificato prima della creazione di ogni nuova supplenza (`SupplenzaRepository.creaSupplenza()`). Il confronto NON può fermarsi al testo grezzo di `CLASSI`/`MATERIE`: una riga a restrizione-per-omissione (`CLASSI` vuoto) e una riga con CSV esplicito per lo stesso titolare possono risolvere alla stessa cattedra pur senza che i loro testi grezzi si intersechino mai — il controllo confronta quindi anche le coppie concrete `(classe, materia, kind, specifica)` post-espansione (`RowScopeExpansion.expandRowToPairs`/`pairsOverlap`, condiviso con la risoluzione di `AldoTeachingResolutionConfig`), oltre al confronto testuale ordinario (`contestoOverlaps`).

**Catene di supplenza:** un `SUPPLENTE` PUÒ a sua volta essere `TITOLARE` in un altro record `SUPPLENZE` (supplenza del supplente). NON esiste alcun limite di profondità: la risoluzione del docente effettivamente attivo DEVE seguire la catena ricorsivamente fino all'ultimo supplente attivo per la data e il contesto richiesti (vedi `RisolutoreRuoliService` in `src/application/services/RisolutoreRuoliService.ts`).

**Nota su chiave primaria e colonne CSV:** le colonne `CLASSI` e `MATERIE` partecipano alla chiave primaria come testo grezzo. L'unicità è quindi puramente testuale: due CSV semanticamente equivalenti ma scritti in ordine diverso (es. `"5A,4B"` vs `"4B,5A"`) NON sono riconosciuti come duplicati dal confronto di chiave, mentre l'invariante di business sulla sovrapposizione richiede il confronto semantico (`applicaAClasse`/`applicaAMateria` per il testo grezzo, più le coppie concrete post-espansione per la restrizione-per-omissione — vedi sopra), eseguito SOLO a runtime. Lo stesso vale per `VARIAZIONI_CATTEDRA` (`CLASSI`, `MATERIE`) e per `LOG_MAIL` (`DESTINATARI`). L'utente DEVE mantenere un ordine coerente nei CSV per evitare duplicati logici non rilevati dal sistema.

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

La generazione documentale usa `PIANI.TIPO` come discriminatore del singolo
piano: il valore viene esposto in `focus.piano.tipo`, copiato in
`LOG_DOCS.SOTTOTIPO` e NON deve essere duplicato in
`CONF_DOC.PARAMETRI.tipoPiano`.

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

**Nota OUT/RITIRATO:** `TIPO=OUT` copre esclusivamente il trasferimento verso un altro istituto; `TIPO=RITIRATO` copre l'uscita per ritiro dagli studi. Vedi `03_VALUE_OBJECTS_ED_ENUM.md` per l'enumerazione completa.

---

### ASL

Ore cumulative di Alternanza Scuola Lavoro per studente per anno. Chiave primaria composta.

| Colonna    | Tipo    | PK (parte) | FK           | Descrizione                           |
| ---------- | ------- | ---------- | ------------ | ------------------------------------- |
| `STUDENTE` | String  | ✅         | ALUNNI.EMAIL | Email studente                        |
| `ANNO`     | String  | ✅         | —            | Anno scolastico (formato `YYYY-YYYY`) |
| `ORE`      | Integer | —          | —            | Ore accumulate nell'anno              |

**Colonna opzionale `DATA_MODIFICA`:** non è una colonna fissa dello schema, né elencata in `COL_ASL` o validata da `regoleValidazione()`. Compare solo quando un job `CONF_IMP` verso `ASL` usa `CONFIG.conflictResolution = TIMESTAMP` (v. `CONF_IMP` sotto): il target DEVE allora esporre `DATA_MODIFICA` prima dell'import, altrimenti la strategia TIMESTAMP degrada a `OVERWRITE` (`ImportService.META_COLUMNS`, non soggetta a Ghost Record Detection).

---

### CONF_DOC

Motore di configurazione per la generazione documentale. Ogni record definisce completamente un tipo di documento generabile.

| Colonna                  | Tipo   | PK  | Descrizione                                                                                                  |
| ------------------------ | ------ | --- | ------------------------------------------------------------------------------------------------------------ |
| `ID`                     | String | ✅  | Codice identificativo (es. `VERBALE_CDC`)                                                                    |
| `TIPO`                   | String | —   | Etichetta libera di categoria, scritta in `LOG_DOCS.TIPO`; unico valore riservato: `PIANO_PERS` per `GENERATORE=PIANO_PERSONALIZZATO` |
| `GENERATORE`             | String | —   | Asse di iterazione del batch e driver della recipe CDU: `CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO` |
| `FORMATO`                | String | —   | Enum ristretto a `GDOC` o `GSHEET`; il costruttore valida il valore e solleva `ConfigurationError` altrimenti |
| `DUPLICAZIONE`           | Enum   | —   | Politica di generazione duplicata: `NEGATA` (default) blocca l'identità già generata; `PERMESSA` la consente. **L'identità è `TIPO`+`SOTTOTIPO`+`ID_GEN`+`PATH`+`NOME_NORMALIZZATO` (+`UTENTI` per `PIANO_PERS`). Per calcolare `NOME_NORMALIZZATO`, ogni controllo genera un marker alfanumerico temporaneo, verifica che non compaia nel `FILE_NAME` completo reso con lo stesso CDU e un valore-sonda non vuoto per `progressivo`, sostituisce con il marker solo i token esatti `{{progressivo}}`, rende il template completo e tratta solo quel marker come una sequenza numerica.** Il marker non è persistito. Valori `FILE_NAME` distinti distinguono le identità duplicate, salvo differenze limitate a `{{progressivo}}`, che normalizzano allo stesso slot numerico. Un tipo documento le cui istanze devono restare distinguibili tra loro (es. un verbale per riunione) DEVE usare un `CONF_DOC.ID` distinto per istanza solo quando tutti i componenti dell'identità, incluso il nome normalizzato, sarebbero altrimenti uguali. |
| `GESTIONE_ARTICOLAZIONE` | Enum   | —   | `COMPLETA` (default) esclude le classi partner dal batch di generazione (solo genitore/classe standard); `ARTICOLATA` esclude la classe genitore (solo partner/classe standard)                                                  |
| `PATH_OUT`               | String | —   | Pattern per il percorso cartella (supporta placeholder `{{...}}` e separazione cartelle tramite `/`)         |
| `FILE_NAME`              | String | —   | Pattern per il nome file (supporta placeholder `{{...}}`)                                                    |
| `MODELLI`                | JSON   | —   | ID dei template Drive; forma semplice o condizionale                                                         |
| `PERMESSI`               | JSON   | —   | ACL per file e cartelle (ruoli astratti → permessi). Ogni voce `{ruolo, permesso}` supporta un `condizione` opzionale (stessa sintassi/motore di `CONDIZIONE` e dei rami `MODELLI`, valutato da GasExpressionEngineLib sul CDU): se assente o `"true"` la voce è incondizionata; altrimenti la voce si applica solo quando l'espressione è vera. Permette a un unico record `CONF_DOC` di negare un ruolo per un sottoinsieme di stati del CDU (es. escludere un ruolo quando `focus.piano.tipo == "PFP"`) senza violare il vincolo del record unico dei piani personalizzati (v. sotto) |
| `PARAMETRI`              | JSON   | —   | Feature flag e parametri del generatore: `aggiungiMaterie`, `aggiungiMaterieConPermessi` (mutuamente esclusivi) e `tabelleImportate` |
| `CONDIZIONE`             | String | —   | Espressione logica per la generazione condizionale                                                           |
| `POST_PROCESSO`          | JSON   | —   | Azioni automatiche post-generazione (array)                                                                  |
| `REGISTRA_DOC`           | JSON   | —   | Opzionale; espressioni template per i CSV `classi`, `utenti`, `materie` di `LOG_DOCS`                        |
| `REGISTRA_FOLD`          | JSON   | —   | Opzionale; espressioni template per i CSV `classi`, `utenti`, `materie` di `LOG_FOLD`                        |

> **VINCOLO IMPORTANTE — eccezione obbligatoria per i piani personalizzati.**
> Benché `CONF_DOC.TIPO` sia in generale una stringa libera, tutti i valori di
> `PIANI.TIPO` DEVONO essere gestiti da **un solo** record `CONF_DOC`, con
> `ID=PIANI_PERSONALIZZATI` e `TIPO=PIANO_PERS`. Non sono ammessi record distinti
> per `PEI`, `PDP_BES`, `PDP_DSA`, `PDP_STRANIERI` o `PFP`.
>
> Il record unico DEVE avere cinque rami condizionali in `MODELLI`, valutati su
> `focus.piano.tipo`, uno per ciascun valore di `TipoPiano`. Il sottotipo non si
> ricava da `CONF_DOC.PARAMETRI`: è il `PIANI.TIPO` del piano focalizzato. Per
> rendere stabile l'identità del documento, `REGISTRA_DOC.utenti` DEVE risolvere
> a `{{focus.alunno.email}}`; il log risultante usa sempre
> `ID_GEN=PIANI_PERSONALIZZATI`, `TIPO=PIANO_PERS` e
> `SOTTOTIPO=focus.piano.tipo`.
>
> **Eccezione ammessa — famiglia `NO_PEI`.** È ammesso un secondo record
> `CONF_DOC`, con `ID=PIANI_PERSONALIZZATI_NO_PEI` e `TIPO=PIANO_PERS`, a
> fianco del record canonico, a condizione che riusi lo stesso
> `GENERATORE=PIANO_PERSONALIZZATO` e la stessa struttura `MODELLI`/`PATH_OUT`/
> `FILE_NAME`/`PERMESSI`, e che la sua `CONDIZIONE` escluda esplicitamente
> `focus.piano.tipo == "PEI"` (es. `{{focus.piano.tipo}} != "PEI"`). Non sono
> ammessi ulteriori record distinti per altri sottoinsiemi di `PIANI.TIPO`:
> questa è l'unica eccezione al vincolo del record unico sopra descritto.

> **Semantica di `GENERATORE` (asse di batch).** `GENERATORE` pilota l'asse di iterazione del batch (`DocumentBatchService.batchGenerateHandler`). I valori ammessi sono `CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO` (vedi §4 dello spec di redesign). `TIPO` resta un'etichetta libera scritta in `LOG_DOCS.TIPO`, salvo il vincolo residuo: se `GENERATORE=PIANO_PERSONALIZZATO`, `TIPO` DEVE essere `PIANO_PERS`.
>
> Le chiavi di registro precedenti `SHEET_CON_MATERIE`, `SHEET_CON_MATERIE_E_PERMESSI`, `DOCUMENTO_CON_TABELLE_IMPORTATE`, `VERBALE_CDC`, `DOC_PERSONALIZZATO`, `DOCUMENTO_GENERICO` e `FOGLIO_GENERICO` sono ritirate come valori di `GENERATORE`: non erano assi, ma nomi di strategie/registrazioni legacy. La colonna ora identifica esclusivamente l'asse di batch.

> **`FORMATO` e `PARAMETRI`: compatibilità e validazione.** `FORMATO` ammette esclusivamente `GDOC` e `GSHEET`. Le tre flag `PARAMETRI.aggiungiMaterie`, `PARAMETRI.aggiungiMaterieConPermessi` e `PARAMETRI.tabelleImportate` hanno default `false`. Le flag `aggiungiMaterie` e `aggiungiMaterieConPermessi` sono mutuamente esclusive; entrambe aggiungono colonne materie su `GSHEET`, con o senza protezioni di intervallo. `PARAMETRI.tabelleImportate` abilita i placeholder `{{TABELLA:<sheetFileId>}}` su `GDOC`. Le combinazioni incompatibili sono rifiutate dal costruttore con questi messaggi esatti:
>
> - `ConfigurationError("L'importazione tabelle è supportata unicamente su formato GDOC")` se `FORMATO=GSHEET` e `tabelleImportate=true`;
> - `ConfigurationError("Le colonne materie sono supportate unicamente su formato GSHEET")` se `FORMATO=GDOC` e una delle flag materie è attiva;
> - `ConfigurationError("Le colonne materie non sono applicabili all'asse DIPARTIMENTO (nessun consiglio di classe)")` se `GENERATORE=DIPARTIMENTO` e una delle flag materie è attiva;
> - `ConfigurationError("aggiungiMaterie e aggiungiMaterieConPermessi sono mutuamente esclusivi")` se entrambe le flag sono attive.

**Azioni POST_PROCESSO supportate:**

| Tipo                  | Effetto                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `INSERISCI_TIMESTAMP` | Scrive data/ora corrente in `tab.col` dove i criteri corrispondono |
| `AGGIORNA_CAMPO`      | Imposta `tab.col = val` dove i criteri corrispondono               |
| `AGGIORNA_STATO_DOC`  | Cambia `LOG_DOCS.STATO` di un documento già registrato             |
| `AGGIORNA_PERMESSI_STORICI` | Aggiorna i permessi Drive dei documenti storici individuati tramite `LOG_DOCS` per il target indicato |

`AGGIORNA_PERMESSI_STORICI` usa implicitamente `ID_GEN=target`; `target` è un
`ID` di `CONF_DOC`. `criteri` è un oggetto opzionale che supporta cinque
campi: `UTENTI`, `CLASSI`, `MATERIE` (corrispondenza CSV — vero se il valore
compare come elemento esatto nella colonna `LOG_DOCS` corrispondente, mai come
substring; un valore risolto vuoto non corrisponde mai a nessun documento) e
`TIPO`, `SOTTOTIPO` (uguaglianza esatta contro `LOG_DOCS.TIPO` /
`LOG_DOCS.SOTTOTIPO`). A differenza degli altri criteri POST_PROCESSO, qui
`UTENTI`/`CLASSI`/`MATERIE` sono confrontati come valore singolo, non come
intersezione CSV. Oltre a `criteri`, l'azione richiede anche `ruolo` (nome di
ruolo risolto tramite `RisolutoreRuoliService`, es. `COORDINATORI`, contro
l'email dei cui titolari vengono applicati i permessi) e `permesso` (livello
ACL: `LETTURA`, `SCRITTURA` o `COMMENTO`). `profondita` è obbligatoria e deve
essere un intero positivo. L'errore dell'azione è non critico: viene
registrato e non interrompe la generazione del documento, e il documento/record
`LOG_DOCS` già registrato non viene eliminato né annullato (rollback).

---

### CONF_MAIL

Motore di configurazione per le notifiche email. Ogni record è un pattern di comunicazione completo.

| Colonna         | Tipo    | PK  | Descrizione                                                                                                                                                                                       |
| --------------- | ------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID`            | String  | ✅  | Codice pattern (es. `CDC_OTTOBRE`)                                                                                                                                                                |
| `OGGETTO`       | String  | —   | Oggetto email (supporta placeholder `{{...}}`)                                                                                                                                                    |
| `PROCESSO`      | String  | —   | Iteratore destinatari: `PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA_GENITORI`, `PER_CARENZA_GENITORI_E_ALUNNO`, `PER_CARENZA_GENITORI_E_COORD`, `PER_CAPO_DIPARTIMENTO`, `PER_DIPARTIMENTO` |
| `BOX_CFG`       | JSON    | —   | Array di BoxConfig per i contenuti dinamici dell'email                                                                                                                                            |
| `TESTO_START`   | String  | —   | HTML opzionale inserito prima dei box; supporta placeholder `{{...}}` risolti tramite `WorkspaceTemplateEngine`                                                                                   |
| `TESTO_END`     | String  | —   | HTML opzionale inserito dopo i box, prima del footer; stessa risoluzione placeholder di `TESTO_START`                                                                                            |
| `SUPPLENTI`     | String  | —   | Routing supplenze: `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, `ENTRAMBI`                                                                                                                                  |
| `NOREPLY`       | Boolean | —   | Aggiunge disclaimer no-reply nel footer                                                                                                                                                           |
| `COLORE_HEADER` | String  | —   | Hex code dell'header HTML dell'email; default `#007bff` se non specificato (vedi pipeline email, Step 5)                                                                                          |
| `CONDIZIONE`    | String  | —   | Espressione logica per l'invio condizionale (stesso meccanismo di `CONF_DOC.CONDIZIONE`); valutata da `ValutaCondizioniInvioStep`. Se null o vuoto, l'invio procede sempre                        |
| `POST_PROCESSO` | JSON    | —   | Azioni post-invio (stesso meccanismo di CONF_DOC)                                                                                                                                                 |
| `ALLEGATI_STATICI`      | JSON    | —   | Array di ID Drive da allegare staticamente; usare `[]` quando non sono configurati allegati                                                                                                      |
| `GESTIONE_ARTICOLAZIONE` | Enum | —   | Stesso significato di `CONF_DOC.GESTIONE_ARTICOLAZIONE`: `COMPLETA` (default) esclude le classi partner dai punti di ingresso della notifica; `ARTICOLATA` esclude la classe genitore |
| `DUPLICAZIONE`  | Enum    | —   | Politica di reinvio: `NEGATA` (default) blocca un target logico già registrato `SUCCESS` per lo stesso `ID`; `PERMESSA` consente il reinvio. L'identità è il `logicalTargetId` stabile salvato in `LOG_MAIL.ALLEGATI`; righe `ERROR` e invii in modalità test non bloccano il target reale |
| `RISPONDI_A`    | String  | —   | Espressione placeholder `{{...}}` risolta sul CDU destinatario tramite lo stesso `WorkspaceTemplateEngine` di `TESTO_START`/`TESTO_END`/`OGGETTO` (non HTML-escaped, come `OGGETTO` — a differenza di `TESTO_START`/`TESTO_END` che sono HTML-escaped) che deve risolvere a un singolo indirizzo email valido; se non vuota e il risultato non è un indirizzo valido, l'invio prosegue senza intestazione Reply-To e viene emesso un WARN nei log |

> **Migrazione database esistenti:** prima di distribuire questa versione, applicare a ogni foglio `CONF_MAIL` esistente:
>
> - Aggiungere la colonna fisica `DUPLICAZIONE` e valorizzare le righe esistenti con `NEGATA`; usare `PERMESSA` solo per pattern che devono intenzionalmente consentire reinvii.
> - Verificare che i fogli espongano già `ALLEGATI_STATICI` e `GESTIONE_ARTICOLAZIONE`, nell'ordine previsto dal provisioning/seed aggiornato.
> - Rinominare la colonna fisica `TESTO` in `TESTO_START` (stesso significato, nessun cambiamento di contenuto).
> - Aggiungere la colonna fisica `TESTO_END`, valorizzandola vuota per le righe esistenti (nessun testo di chiusura aggiuntivo).
> - Aggiungere la colonna fisica `RISPONDI_A`, valorizzandola vuota per le righe esistenti (nessuna intestazione Reply-To aggiuntiva, comportamento di invio invariato).

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

### CONF_AZIONI

Configurazione di azioni standalone data-driven: operazioni di sistema che non generano documenti, non inviano email e non importano dati (riallineamento permessi Drive, validazione del database, sanificazione/trasformazione di colonne). Come le altre tabelle `CONF_*`, aggiungere una nuova azione significa inserire un record, non scrivere codice. Ogni riga è un'orchestrazione completa: un asse di iterazione, una condizione di gate e un array di azioni elementari. V1: esecuzione solo manuale, da menu (Sheets) o da entrypoint_user (piattaforma GAS); non esiste ancora uno scheduler automatico.

| Colonna       | Tipo    | PK  | Descrizione                                                                                                                                                                                                                                                                                     |
| ------------- | ------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ID`          | String  | ✅  | Codice identificativo (es. `ALLINEA_PERMESSI_CATTEDRE`, `SANIFICA_TRIM`)                                                                                                                                                                                                                        |
| `TIPO`        | String  | —   | Etichetta libera di categoria, scritta in `LOG_JOB.NOME_CONFIG`                                                                                                                                                                                                                                 |
| `ASSE`        | String  | —   | Asse di iterazione del batch e driver della recipe CDU: stesso dizionario di `CONF_DOC.GENERATORE` (`CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO`) più il valore riservato `SINGOLA` per esecuzione unica (un solo iter con CDU base). Il costruttore valida il valore e solleva `ConfigurationError` altrimenti |
| `CONDIZIONE`  | String  | —   | Espressione logica che decide l'esecuzione dell'azione **nel suo insieme** (stesso motore GasExpressionEngineLib di `CONF_DOC.CONDIZIONE`). Se null o vuota, non è un gate: l'azione viene sempre eseguita. Solo una `CONDIZIONE` valorizzata che valuta a falso salta l'azione, senza produrre alcuna riga `LOG_JOB`                                                                          |
| `ATTIVO`      | Boolean | —   | Abilita/disabilita l'azione; default `true`. In v1 decide solo se l'azione compare nel menu/elenco lanciabile                                                                                                                                                                                   |
| `AZIONI`      | JSON    | —   | Array di azioni elementari nella grammatica condivisa (§ Catalogo dei tipi di azione sotto)                                                                                                                                                                                                     |
| `PERIODICITA` | String  | —   | Riservata per lo scheduling futuro (es. `DAILY`, `WEEKLY`); colonna presente fin da subito, **ignorata in v1**                                                                                                                                                                                  |

**Catalogo dei tipi di azione (elementi dell'array `AZIONI`).** La grammatica è condivisa con `CONF_DOC.POST_PROCESSO` / `CONF_MAIL.POST_PROCESSO`: la colonna fisica `POST_PROCESSO` non cambia nome, ma è la stessa "azione" invocata sia inline (post-generazione/post-invio) sia standalone da `CONF_AZIONI`.

| Tipo                        | Effetto                                                                                                                                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INSERISCI_TIMESTAMP`       | Scrive `now` in `tab.col` dove i criteri corrispondono, solo se la cella è vuota                                                                                                                                                                                                              |
| `AGGIORNA_CAMPO`             | Imposta `tab.col = val` dove i criteri corrispondono (`val` con placeholder `{{...}}` risolti sul CDU)                                                                                                                                                                                        |
| `AGGIORNA_STATO_DOC`         | Cambia `LOG_DOCS.STATO` dove i criteri corrispondono                                                                                                                                                                                                                                          |
| `AGGIORNA_PERMESSI_STORICI`  | Alias di compatibilità dell'azione storica (v. `CONF_DOC` sopra): target implicito `ID_GEN=CONF_DOC.ID` su `LOG_DOCS`. **Solo-pipeline**: l'handler vive esclusivamente nello step post-processo di generazione documento/email (legato al contesto `newFileId`/`StoricoDocumentiService` di quella pipeline) — utilizzabile in `CONF_DOC.POST_PROCESSO`/`CONF_MAIL.POST_PROCESSO`, **non** eseguibile da una riga `CONF_AZIONI` standalone                                                                                          |
| `TRASFORMA_CAMPO`            | Sanificazione/case-transform su `tab.col`: `operazione` ∈ `TRIM` \| `UPPER` \| `LOWER` \| `CAPITALIZE` \| `UNCAPITALIZE`, con `criteri` opzionali                                                                                                                                              |
| `AGGIORNA_PERMESSI`          | Applica ACL a file e cartelle selezionati da `LOG_DOCS`/`LOG_FOLD` (criteri: `UTENTI`/`CLASSI`/`MATERIE` per contenimento CSV, `TIPO`/`SOTTOTIPO` per uguaglianza esatta, prefisso `PATH` opzionale). Destinatari: `ruolo` (risolto via `RisolutoreRuoliService`, es. `COORDINATORI`) o email dirette; livello `LETTURA`/`SCRITTURA`/`COMMENTO`; `profondita` per lo storico. Calcola il delta tra ACL attese e reali e applica solo i grant mancanti/il role-change (idempotente); non rimuove mai un grant — solo `REVOCA_PERMESSI` lo fa |
| `REVOCA_PERMESSI`            | Inverso di `AGGIORNA_PERMESSI`: sugli stessi target selezionati (stessi criteri), revoca ogni ACL non-owner/organizer il cui titolare NON è nel set risolto da `ruolo`/`emails` (es. supplente uscito dal cdc). Combinata con `AGGIORNA_PERMESSI` nello stesso array `AZIONI` di una riga `CONF_AZIONI`, realizza il riallineamento completo (aggiunta + upgrade + rimozione) alla reale composizione del cdc alla data di esecuzione. **Guardia di sicurezza**: un `ruolo`/`emails` risolto a insieme vuoto è un no-op, mai una revoca totale. Il blast radius è per-target come `RIDUCI_PERMESSI`: chi configura la riga deve scopare `criteri`/`PATH` abbastanza stretti da non toccare grant legittimi non legati a quel ruolo (es. referente BES sulla stessa cartella) |
| `RIDUCI_PERMESSI`            | Downgrade: porta a una soglia massima (default `LETTURA`) ogni ACL sopra soglia sui target selezionati (stessi criteri log-driven di `AGGIORNA_PERMESSI`); scrive solo il delta, idempotente                                                                                                 |
| `VALIDA_DB`                  | Esegue `DatabaseValidationService` (accetta un sottoinsieme opzionale di `tabelle`); read-only, esito registrato nel log                                                                                                                                                                       |

`INSERISCI_TIMESTAMP`, `AGGIORNA_CAMPO`, `AGGIORNA_STATO_DOC` e `TRASFORMA_CAMPO` sono i tipi "solo-DB": sempre disponibili, sia inline (`POST_PROCESSO`) sia standalone. Gli altri tipi viaggiano come handler forniti dal chiamante, e i due contesti ne registrano insiemi disgiunti: la pipeline documento/email registra solo `AGGIORNA_PERMESSI_STORICI` (compatibilità storica, legata al contesto `newFileId`/`StoricoDocumentiService` di quella pipeline); `CONF_AZIONI`/`ActionBatchService` registra invece solo i quattro tipi "infra" standalone `AGGIORNA_PERMESSI`, `REVOCA_PERMESSI`, `RIDUCI_PERMESSI` e `VALIDA_DB`. Una riga `CONF_AZIONI` con `tipo=AGGIORNA_PERMESSI_STORICI` non troverebbe un handler registrato: verrebbe loggata come "tipo non disponibile" e saltata, come qualunque altra azione elementare di tipo sconosciuto. Un JSON malformato nella cella `AZIONI` è un caso diverso, non un item scartato: è un errore di configurazione (come un `ASSE` non valido o un id mancante) rilevato prima di toccare qualunque target, che fa fallire l'intera azione con un'unica riga `LOG_JOB` in stato `FALLITO`.

**Logging.** Nessuna tabella dedicata: una riga `LOG_JOB` per esecuzione, come gli altri batch — `TIPO='ESECUZIONE_AZIONI'`, `ID_CONFIG=CONF_AZIONI.ID`, `NOME_CONFIG=CONF_AZIONI.TIPO`.

---

### LOG_DOCS

Audit trail immutabile (append-only) di ogni documento generato. Lega l'ID fisico Drive alla configurazione che lo ha generato.

| Colonna      | Tipo         | PK  | FK          | Descrizione                                                                                                                                                                    |
| ------------ | ------------ | --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ID`         | String       | ✅  | —           | ID Drive del file generato                                                                                                                                                     |
| `ID_GEN`     | String       | —   | CONF_DOC.ID | Tipo di configurazione usata                                                                                                                                                   |
| `TIPO`       | String       | —   | —           | Tipo del documento; valore derivato da `CONF_DOC.TIPO` (campo categoriale, non PK di `CONF_DOC`)                                                                               |
| `SOTTOTIPO`  | String       | —   | —           | Specializzazione del documento. Per `TIPO=PIANO_PERS` è obbligatoriamente il `PIANI.TIPO` focalizzato (es. `PDP_BES`, `PEI`) e discrimina piani generati dallo stesso `ID_GEN`. Per `GENERATORE=CLASSE_DOCENTE_MATERIA` è `materia::docenteEmail` (es. `MATE::rossi@school.it`), la coppia sigla materia + email docente della cattedra. Per `GENERATORE=CLASSE_MATERIA` è la sigla materia (es. `MATE`); entrambi discriminano i documenti generati per lo stesso `ID_GEN` sulla stessa classe (vedi `sottotipo()` in `documentSteps.ts`) |
| `NOME`       | String       | —   | —           | Nome del file                                                                                                                                                                  |
| `STATO`      | String       | —   | —           | Enum                                                                                                                                                                           |
| `NOTIFICATO` | String       | —   | —           | Timestamp della notifica agli interessati                                                                                                                                      |
| `PATH`       | String       | —   | —           | Percorso logico della cartella                                                                                                                                                 |
| `LINK`       | String       | —   | —           | URL web del file                                                                                                                                                               |
| `CLASSI`     | String (csv) | —   | CLASSI.ID   | Classi associate (se applicabile)                                                                                                                                              |
| `UTENTI`     | String (csv) | —   | —           | Email degli utenti associati (alunno o docente)                                                                                                                                |
| `MATERIE`    | String (csv) | —   | MATERIE.ID  | Materie associate (se applicabile), separate da virgola                                                                                                                        |
| `DATA_CREAZ` | String       | —   | —           | Timestamp di creazione                                                                                                                                                         |
| `ID_ORIG`    | String       | —   | LOG_DOCS.ID | ID del documento di origine (per versioni successive dello stesso documento)                                                                                                   |

**Nota query CSV:** Le colonne `UTENTI`, `CLASSI` e `MATERIE` contengono valori separati da virgola. Le query di ricerca per email/classe/materia singola DEVONO usare una ricerca per contenimento (CONTAINS) e MAI l'uguaglianza esatta.

---

### LOG_FOLD

Audit trail delle cartelle create su Google Drive.

| Colonna   | Tipo         | PK  | FK          | Descrizione                                                                                                        |
| --------- | ------------ | --- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `ID`      | String       | ✅  | —           | ID Drive della cartella                                                                                            |
| `ID_GEN`  | String       | —   | CONF_DOC.ID | Configurazione che ha generato la cartella                                                                         |
| `TIPO`    | String       | —   | —           | Tipo della cartella; valore derivato da `CONF_DOC.TIPO` (campo categoriale, non PK di `CONF_DOC`)                  |
| `NOME`    | String       | —   | —           | Nome cartella                                                                                                      |
| `PATH`    | String       | —   | —           | Percorso logico completo                                                                                           |
| `LINK`    | String       | —   | —           | URL web                                                                                                            |
| `CLASSI`  | String (csv) | —   | CLASSI.ID   | Classi associate (se applicabile); valori multipli separati da virgola — stessa semantica CSV di `LOG_DOCS.CLASSI` |
| `UTENTI`  | String (csv) | —   | —           | Email degli utenti associati (alunno o docente)                                                                    |
| `MATERIE` | String (csv) | —   | MATERIE.ID  | Materie associate (se applicabile), separate da virgola                                                            |

---

### LOG_MAIL

Audit trail di ogni email inviata dal sistema.

| Colonna       | Tipo         | PK (parte) | FK           | Descrizione                                      |
| ------------- | ------------ | ---------- | ------------ | ------------------------------------------------ |
| `PATTERN`     | String       | ✅         | CONF_MAIL.ID | Pattern di notifica utilizzato                   |
| `DESTINATARI` | String (CSV) | ✅         | —            | Email dei destinatari effettivi                  |
| `DATA`        | String       | ✅         | —            | Timestamp dell'invio                             |
| `STATO`       | String       | —          | —            | Enum                                             |
| `ALLEGATI`    | JSON         | —          | —            | Riferimenti della mail reale: `{"docs":["DriveFileId"],"folders":["DriveFolderId"],"attach":["DriveFileUrl"],"logicalTargetId":"..."}`; `docs`/`folders` sono gli asset collegati nel corpo HTML, `attach` conserva i link ai file inviati come allegati reali. `logicalTargetId` è sempre presente; `testMode` è un marker opzionale, assente per gli invii reali. Le preview registrano la stessa forma con `"testMode":true` e sono escluse dal duplicate-history lookup |
| `ERRORE`      | String       | —          | —            | Dettaglio dell'errore (se STATO = ERROR)         |
| `TESTO`       | String       | —          | —            | Corpo email in chiaro (HTML→testo, troncato)     |

---

### LOG_JOB

Storico append-only delle run dei job batch (`DocumentBatchService`, `EmailBatchService`, `EmailRetryService`, `ImportService`, `ActionBatchService`): una riga per esecuzione (dettagli e motivazione in `SPECS_ALDO/NEW_TABLE_LOG_JOB.md`).

| Colonna            | Tipo   | PK (parte) | FK          | Descrizione                                                                                                                        |
| ------------------ | ------ | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ID_JOB`           | String | ✅         | —           | UUID del job (stabile attraverso tutti i resume)                                                                                    |
| `ESECUZIONE`       | Number | ✅         | —           | 0 = prima esecuzione; N = N-esimo resume (trigger di timeout o, per EmailBatchService, un riavvio dopo sospensione quota)           |
| `TIPO`             | String | —          | —           | Tipo del job registrato nel JobDefinitionRegistry: `GENERAZIONE_DOCUMENTI_CLASSI` / `INVIO_EMAIL_BATCH` / `RETRY_EMAIL_BATCH` / `IMPORT_CHUNKED` / `ESECUZIONE_AZIONI` |
| `ID_CONFIG`        | String | —          | —           | ID della configurazione (CONF_DOC.ID, CONF_MAIL.ID o CONF_AZIONI.ID) su cui opera il job; vuoto per RETRY_EMAIL_BATCH (nessuno scope di config) |
| `NOME_CONFIG`      | String | —          | —           | Nome leggibile della configurazione (CONF_DOC.TIPO / CONF_MAIL.OGGETTO / CONF_AZIONI.TIPO)                                          |
| `STATO`            | String | —          | —           | Enum: `COMPLETATO` / `COMPLETATO_CON_ERRORI` / `FALLITO` / `SOSPESO_QUOTA` / `SOSPESO_TEMPO`                                        |
| `TOTALE_TASK`      | Number | —          | —           | Numero totale di target da processare in questa esecuzione                                                                          |
| `COMPLETATI_OK`    | Number | —          | —           | Task processati con successo in questa esecuzione                                                                                   |
| `FALLITI`          | Number | —          | —           | Task che hanno generato errore in questa esecuzione                                                                                 |
| `LISTA_FALLIMENTI` | JSON   | —          | —           | Array di stringhe `"target: motivo"`; troncato se supera il cap di cella Sheets                                                     |
| `DURATA_SEC`       | Number | —          | —           | Secondi di esecuzione effettiva di questa esecuzione (`FINE` − `INIZIO`)                                                            |
| `INIZIO`           | String | —          | —           | Timestamp di inizio di questa esecuzione                                                                                            |
| `FINE`             | String | —          | —           | Timestamp di fine di questa esecuzione                                                                                              |
| `ESEGUITO_DA`      | String | —          | —           | Email dell'utente che ha lanciato il job originale, propagata attraverso ogni resume                                                |

**Nota `SOSPESO_TEMPO`:** JobRunnerLib interrompe il generator al timeout senza dargli la possibilità di scrivere; la riga viene quindi ricostruita a posteriori dal resume successivo (se avviene). Un job sospeso per timeout il cui trigger non riparte mai non produce questa riga (limite noto, accettato).

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
  Se esiste una variazione con DAL ≤ T (la più recente per TITOLARE/scope vince)
  → il NUOVO_TITOLARE sovrascrive il titolare nominale in CLASSI

Priority 3 — CLASSI (fallback)
  Il docente nella colonna materia della classe
  → valore di default di inizio anno
```
