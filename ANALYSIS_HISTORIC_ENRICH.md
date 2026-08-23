# Arricchimento dei dati storici in ALDO

Analisi di come il sistema arricchisce con dati storici le quattro entità principali — **studente**, **docente**, **classe**, **documento** — quando assembla il Contesto Dati Unificato (CDU) o genera un documento/email. Il documento descrive esclusivamente risultati, dati coinvolti e logiche di calcolo; non tratta l'implementazione.

## 1. Il meccanismo di fondo: più database, non più tabelle

Il tratto distintivo dell'arricchimento storico in ALDO è che lo storico **non è conservato come righe aggiuntive nel database corrente**. Ogni anno scolastico passato è un **foglio di calcolo (database) separato e indipendente**, il cui ID viene registrato in un "Master Sheet" che fa da anagrafica degli anni storici disponibili.

Conseguenze pratiche di questa scelta architetturale:

- Un parametro di **profondità** (`profondita`, espresso in anni) determina quanti database storici vengono aperti, partendo dal più recente. Esistono due manopole di profondità indipendenti nel sistema: una per gradi/esiti/carenze/piani (`profonditaAnniStorico`) e una per i documenti già generati in passato (`profonditaAnniDocumenti`) — tipicamente impostate a 2 anni nelle configurazioni osservate, ma regolabili.
- L'arricchimento storico è **sempre opzionale (opt-in)**: viene attivato solo se la richiesta di costruzione del CDU imposta esplicitamente `opzioni.includiStorico = true`. Se questa opzione è assente o falsa, nessun database storico viene aperto.
- L'accesso è **pigro (lazy)**: anche quando l'opzione è attiva, il dato storico viene effettivamente recuperato solo se un template o una regola email lo richiede realmente. Se nessuno lo consulta, il costo di apertura del database storico non viene sostenuto.
- Poiché il nome/sezione di una classe cambia nel tempo (rinumerazioni, accorpamenti, split), ogni ricerca cross-anno richiede prima di risalire alla denominazione storica della classe: la colonna `STORICO` sulla riga corrente della classe contiene l'elenco (più recente per primo) dei nomi che quella classe ha avuto negli anni precedenti. Questo elenco è la chiave di aggancio (join) verso ciascun database storico.
- Poiché anche i **codici delle materie** cambiano nel tempo (es. una materia rinominata da un codice all'altro), ogni confronto storico tra materie passa da una tabella di riconciliazione che mappa i vecchi codici a quelli attuali, ancorata all'anno di corso (non all'anno solare).
- L'assenza di un dato storico non genera mai un errore: degrada sempre in un valore esplicito di "non disponibile/sconosciuto" (esito `SCONOSCIUTO`, classe nulla, liste vuote, chiave del tutto assente). Questo pattern — valore assente o "sconosciuto" invece di eccezione — è costante in tutte e quattro le entità.

Le sezioni seguenti descrivono, entità per entità, ogni arricchimento storico individuato: quale fatto reale rappresenta, quali tabelle/database lo alimentano, con quale logica viene calcolato, quale insieme di esiti può assumere ed eventuali casi limite.

---

## 2. Studente

### 2.1 Percorso anno per anno (`storico.anni[]`)

Per ciascuno degli ultimi N anni (fino alla profondità configurata), viene ricostruita una scheda che rappresenta "dove si trovava e come è andata" lo studente in quell'anno.

- **Classe frequentata**: letta dal database di quell'anno; se non esiste alcun record dello studente per quell'anno, il campo resta assente.
- **Esito** (`PROMOSSO` | `NON_PROMOSSO` | `RITIRATO` | `SCONOSCIUTO`): non esiste una colonna "esito" esplicita — viene **dedotto** dai movimenti dello studente registrati per quell'anno:
  - se in quell'anno risulta un movimento in uscita (trasferimento) → `RITIRATO`;
  - altrimenti, se risulta un cambio di classe interno, si confronta l'anno di corso della classe di provenienza con quello della classe di destinazione: se quest'ultimo è strettamente maggiore → `PROMOSSO`, se uguale o minore → `NON_PROMOSSO` (ripetenza);
  - se il confronto numerico non è determinabile, o non risulta alcun movimento, o non esiste alcun record per quell'anno → `SCONOSCIUTO`.
- **Carenze** (debiti formativi): l'elenco delle carenze registrate per lo studente in quell'anno, con la materia riportata al codice attualmente in uso (riconciliata rispetto a eventuali rinominazioni della materia nel frattempo).

**Esiti possibili**: esattamente i quattro valori sopra elencati per l'esito; zero o più carenze per anno; classe nulla se il record manca.

### 2.2 Aggregazione delle ripetenze (`bocciature[]`, `hasBocciature`)

Valore derivato, non interrogato direttamente: l'elenco di tutti gli anni in cui l'esito calcolato è `NON_PROMOSSO`, ciascuno con l'anno scolastico e la classe in cui è avvenuto. `hasBocciature` è un booleano precalcolato che vale vero se e solo se questo elenco non è vuoto, così che chi consuma il dato non debba mai filtrare da sé sugli esiti annuali.

**Esiti possibili**: da zero fino al numero di anni coperti dalla profondità storica configurata.

### 2.3 Piani personalizzati recenti, separati per anzianità (`pianiPrimoAnnoPrecedente`, `pianiSecondoAnnoPrecedente`)

Rappresentano i tipi di piano didattico personalizzato attivi per lo studente esattamente uno e due anni prima (rispettivamente), cercati per email dello studente nel database di quell'anno.

**Tipi possibili**: `PDP_DSA`, `PDP_BES`, `PDP_STRANIERI`, `PEI`, `PFP`, ciascuno con etichetta descrittiva. Per ogni anno lo studente può avere zero, uno o più piani contemporaneamente. Ogni tipo tranne `PFP` implica automaticamente lo stato "con Bisogni Educativi Speciali (BES)"; `PFP` non lo implica mai.

### 2.4 Storico dei documenti "piani personalizzati" già generati

Ricerca separata (con propria profondità in anni, indipendente da quella di grado/esito) sui documenti già generati negli anni passati per lo studente, filtrata alla sola famiglia "piano personalizzato" e con il sottotipo preservato (es. `PDP_DSA` vs `PEI`). Serve tipicamente a verificare se un documento equivalente esiste già da un anno precedente prima di generarne uno nuovo.

**Esiti possibili**: elenco vuoto se non esistono documenti storici di quel tipo; altrimenti uno o più riferimenti a documento (anno, nome, link, tipo, sottotipo).

---

## 3. Docente

A differenza dello studente, per il docente ALDO **non conserva uno storico anagrafico/di carriera** (nessuna tabella di anzianità, nessun archivio "storico docenti"). Tutto l'arricchimento storico riguarda invece la **continuità e la catena di sostituzione degli incarichi di insegnamento**.

### 3.1 Risoluzione del docente effettivo (gerarchia di risoluzione del ruolo)

Rappresenta chi sta realmente insegnando una data materia in una data classe a una data data — che può differire dal docente nominale.

- **Fonti**, interrogate in ordine di priorità stretta (la prima che produce un risultato vince, senza scendere ai livelli successivi):
  1. una supplenza attiva per quella classe/materia in quella data → il supplente prevale su tutto;
  2. altrimenti, la variazione di cattedra più recente con decorrenza antecedente o pari alla data richiesta → il nuovo titolare prevale sul docente nominale;
  3. altrimenti, il docente nominale indicato nella colonna della materia sulla classe (valore di inizio anno).
- Le sostituzioni possono **incatenarsi**: un supplente può a sua volta essere sostituito da un altro supplente, senza limite di profondità dichiarato; la risoluzione segue la catena fino all'ultimo sostituto attivo per la data richiesta.
- **Esiti possibili**: il docente risolto è uno tra {docente nominale, nuovo titolare da variazione di cattedra, ultimo anello di una catena di supplenze}. Vengono inoltre esposti indicatori booleani su "è un supplente" e "chi sta sostituendo".
- **Caso limite/vincolo**: due supplenze sovrapposte per lo stesso docente sullo stesso ambito classe/materia sono considerate un'incoerenza e vengono intercettate dal sistema di controllo.

### 3.2 Continuità didattica pluriennale (`focus.classe.materie[].continuita`)

Rappresenta se lo **stesso** docente (identificato per email) ha insegnato la stessa materia alla stessa classe con continuità negli ultimi due-tre anni — un indicatore di stabilità/avvicendamento.

- Ricostruita risalendo la denominazione storica della classe e, per ciascuno degli anni precedenti richiesti, risolvendo chi era il titolare (ed eventualmente il titolare del laboratorio ITP, se la materia lo prevede) per quella materia riconciliata al codice storico corretto.
- **Uscite calcolate**: per ciascun anno di sguardo all'indietro (1 = anno scorso, 2 = due anni fa), il titolare risolto (persona o valore nullo se non determinabile) e, solo se la materia prevede l'ITP, il relativo docente ITP (la chiave stessa è del tutto assente, non falsa, se la materia non ha componente ITP).
- **Booleani derivati**: continuità sugli ultimi due anni / sugli ultimi tre anni, veri solo se la stessa email ha tenuto la materia in tutti gli anni richiesti; equivalenti specularmente per l'ITP.
- **Casi limite**: cambio di codice materia nel tempo gestito tramite riconciliazione al codice attuale, non tramite confronto letterale; se il docente di un anno passato non è determinabile, il valore per quell'anno è nullo (non genera errore, e la continuità risulta automaticamente falsa).

### 3.3 Supplenze attive aggregate a livello di classe (`focus.classe.supplenze[]`)

Rappresenta, per l'intera classe, chi sta attualmente coprendo chi, con le materie coperte unificate.

- Costruita a partire dalla stessa risoluzione del docente effettivo usata per il consiglio di classe: le coppie (sostituto effettivo, titolare sostituito) vengono raggruppate, le materie coperte deduplicate; in una catena di sostituzioni viene mostrato solo l'anello finale, non quelli intermedi.
- **Esito**: un elenco sempre presente (anche se vuoto), indipendente dalla policy di instradamento delle email configurata — riflette la sostituzione reale anche quando le regole di invio email sono impostate per notificare solo i titolari.

### 3.4 Carico didattico effettivo del singolo docente (`materieCompetenza`, `cattedre`)

Rappresenta quali materie/classi un docente sta effettivamente insegnando alla data di riferimento, per finalità di targeting e contenuto documentale/email.

- Le materie vengono unificate e deduplicate su tutte le classi del docente (l'incarico "titolare" prevale sull'ITP in caso di conflitto); le stesse materie vengono raggruppate per classe in "cattedre"; classi appartenenti allo stesso gruppo di "classe articolata" vengono collassate in un'unica riga cattedra sulla classe genitore.
- **Caso limite rilevante**: un docente che ha ceduto una materia a un supplente non la vede più tra le proprie materie di competenza, anche se le regole di instradamento email potrebbero comunque includerlo come destinatario per quella materia — è una divergenza voluta tra "cosa risulta insegnare" e "chi riceve comunque la comunicazione".

---

## 4. Classe

### 4.1 Scheda storica della classe per anno (`focus.classe.storico`)

Per ciascuno degli anni coperti dalla profondità storica, rappresenta la composizione della popolazione della classe e i progetti svolti in quell'anno.

- **Statistiche**, calcolate con la stessa formula di aggregazione usata per l'anno corrente (così i numeri storici e quelli attuali sono direttamente confrontabili): numero totale di studenti attivi in quell'anno; numero di studenti con almeno un piano didattico personalizzato; numero di studenti con stato BES; numero di studenti con piano specificamente di tipo DSA; numero di studenti ripetenti; numero di rappresentanti di classe.
- **Progetti**: elenco dei progetti svolti quell'anno (PCTO/alternanza, orientamento, altro) con relative ore (incluse le ore computate come ASL) e il referente, risolto come docente reale se rintracciabile nel database di quell'anno, altrimenti come semplice nominativo.
- **Esiti possibili**: qualunque conteggio da zero fino alla dimensione della classe in quell'anno; se il nome storico della classe per un dato anno non è disponibile o non trovato nel relativo database, quell'anno viene semplicemente omesso dall'elenco (non compare come voce a zero).

### 4.2 Continuità didattica delle materie della classe

Vedi §3.2: è la stessa proiezione di continuità docente, ma esposta dal punto di vista della classe, per ciascuna materia insegnata.

### 4.3 Storico dei singoli studenti proiettato sulla classe

Il roster completo della classe (`listaCompleta`) espone, per ciascuno studente, lo stesso storico individuale descritto in §2.1–§2.3 (percorso anno per anno, ripetenze, piani recenti). A livello di classe questo dato viene quindi letto in forma aggregata studente per studente, non ricalcolato con logica propria.

### 4.4 Storico documentale dei piani personalizzati, aggregato per classe

Rappresenta la storia documentale di tutti i piani personalizzati (BES/DSA/PEI/PFP) degli studenti attualmente titolari di un piano nella classe, unificata in un solo elenco.

- Calcolata a partire dall'insieme degli studenti che, nell'anno corrente, hanno già un piano personalizzato attivo; per ciascuno di essi viene interrogato lo storico documentale degli anni precedenti, filtrato alla sola famiglia "piano personalizzato", e ogni voce viene taggata con l'email dello studente proprietario.
- **Nota di progetto rilevata nelle fonti**: questa aggregazione è realizzata con una ricerca per singolo studente (non una query cumulativa su più studenti insieme), scelta deliberata dato che il numero di studenti con piano per classe è tipicamente piccolo.
- **Esiti possibili**: elenco piatto, potenzialmente vuoto per singolo studente o vuoto nel complesso se nessuno studente della classe ha storico di piani.

### 4.5 Ambiti esplicitamente esclusi dallo storico di classe

Dalla ricerca è emerso che:
- la gestione "classe completa" vs "classe articolata" è un flag di instradamento della generazione documentale, non un dato storico;
- non esiste una tabella o un provider dedicato allo storico della composizione dei gruppi/partner di articolazione: la sezione "partner" della classe riflette solo la composizione dell'anno corrente.

---

## 5. Documento

L'arricchimento storico legato alla generazione documentale si divide in due meccanismi distinti e complementari: uno **all'interno dello stesso anno** (che decide se un documento va generato) e uno **tra anni diversi** (che arricchisce il contenuto del documento con dati del passato).

### 5.1 Controllo di duplicazione (stesso anno)

Rappresenta la domanda: "questo documento specifico è già stato generato?" — per evitare di rigenerare due volte lo stesso report/piano/verbale.

- Verifica **solo il registro documenti dell'anno corrente** (non consulta i database storici).
- L'identità del documento è definita dalla combinazione di tipo, sottotipo, identificativo del generatore, percorso di destinazione e nome file normalizzato (un eventuale numero progressivo nel nome viene neutralizzato prima del confronto, così un numero di sequenza diverso non elude il controllo); per i documenti di tipo "piano personalizzato" viene incluso anche il destinatario, in modo che lo stesso tipo di piano per due studenti diversi non venga erroneamente segnalato come duplicato.
- **Esiti possibili**: se la duplicazione è configurata come permessa, il controllo viene saltato del tutto e la generazione procede sempre; se è configurata come negata (comportamento di default), un documento corrispondente già esistente blocca la generazione (con un motivo di scarto leggibile), altrimenti la generazione procede normalmente.

### 5.2 Stato del ciclo di vita del documento

Rappresenta in quale fase operativa si trova un documento già generato.

- Viene impostato a "generato" al momento della registrazione dalla pipeline di generazione.
- **Progressione tipica dichiarata**: generato → verbalizzato (inserito in un verbale di riunione) / notificato (inviato via email ai responsabili) → archiviato (ritirato dal flusso attivo). Non risultano, allo stato attuale, percorsi di codice che facciano avanzare automaticamente lo stato oltre "generato".
- **Scostamento rilevato tra specifica e comportamento osservato**: è prevista una colonna per collegare un documento alla sua versione originaria (per gestire versioni successive dello stesso documento), ma tale collegamento non risulta valorizzato in fase di generazione — la logica di versionamento per "lignaggio" è quindi specificata ma non ancora operativa.

### 5.3 Storico documentale cross-anno incorporato nel contenuto (studente e classe)

Rappresenta quali documenti (report, piani personalizzati, documenti generici) sono già stati prodotti per uno studente o per una classe negli anni precedenti, per essere richiamati dentro un nuovo documento o per decidere se generarne uno nuovo.

- Alimentato aprendo, per ciascuno studente richiesto, i registri documenti degli anni precedenti (fino alla profondità configurata), individuati tramite l'email dello studente.
- Tipo, sottotipo, identificativo del generatore, anno, nome ed eventuale collegamento vengono mantenuti separati per famiglia documentale (nessuna fusione tra famiglie diverse).
- **Esiti possibili**: elenco vuoto se non esiste alcun documento storico per quello studente; il nodo intero è del tutto assente (non un elenco vuoto) se l'opzione storico non è attiva — chi consuma il dato deve quindi verificare esplicitamente la presenza del nodo, non solo la sua lunghezza.
- **Caso particolare**: essendo un riferimento pigro, il costo di apertura del database storico viene sostenuto solo se il valore viene effettivamente letto da un template o da una regola email.

### 5.4 Riconciliazione dei codici materia nello storico esposto nei documenti

Quando un documento espone carenze storiche dello studente, il codice materia storico (potenzialmente obsoleto) viene silenziosamente rimappato al codice attualmente in uso tramite la tabella di evoluzione delle materie, prima di essere incluso nel documento.

- **Punto aperto rilevato**: la specifica non descrive esplicitamente un comportamento di fallback per un codice materia storico che non trovi alcuna corrispondenza nella tabella di evoluzione — è un'area da chiarire se rilevante.

### 5.5 Statistiche ed esiti storici come contenuto narrativo del documento

I dati descritti in §2.1 (esiti annuali dello studente), §2.2 (ripetenze) e §4.1 (statistiche di classe per anno) non sono utilizzati solo come dati di contesto generici, ma alimentano direttamente il contenuto testuale dei documenti generati (ad esempio, la presenza di ripetenze pregresse può condizionare la formulazione automatica di frasi del documento). Il pattern costante è che i booleani derivati (es. "ha ripetenze") vengono precalcolati a monte, in modo che la logica di composizione del testo del documento non debba mai ricalcolare condizioni a partire dai dati grezzi.

---

## 6. Sintesi trasversale

| Entità | Fonte storica principale | Ambito temporale | Presenza/assenza |
|---|---|---|---|
| Studente | database di anni passati (ALUNNI, movimenti, carenze, piani) | fino a profondità configurabile (tip. 2 anni) | valori "sconosciuto"/nulli espliciti, mai errore |
| Docente | dati di assegnazione incarico correnti e storici (nessun archivio di carriera) | fino a 2-3 anni per la continuità | titolare nullo se non risolvibile |
| Classe | database di anni passati (composizione, progetti) + proiezione dello storico dei singoli studenti | fino a profondità configurabile | anno omesso se nome storico non risolvibile |
| Documento | registro documenti dell'anno corrente (duplicazione/stato) + registri di anni passati (contenuto storico) | corrente per la duplicazione; fino a profondità configurabile per il contenuto | nodo intero assente se lo storico non è richiesto |

Il filo conduttore comune a tutte e quattro le entità è che l'arricchimento storico in ALDO è **opzionale, pigro, delimitato in profondità e degrada sempre a un valore esplicito di assenza/incertezza** piuttosto che fallire — con un'unica eccezione strutturale: il controllo di duplicazione documentale, che è deliberatamente limitato al solo anno corrente e non consulta mai i database storici.
