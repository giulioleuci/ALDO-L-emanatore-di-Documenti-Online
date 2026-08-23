# Estensione dell'arricchimento storico dello studente: uso di RIPETENTE, presenza anno per anno, TRASFERITO/RITIRATO

Analisi di fattibilità per l'estensione richiesta al sistema descritto in `ANALYSIS_HISTORIC_ENRICH.md` (§2 "Studente"). Riguarda esclusivamente il calcolo dell'esito annuale dello studente e due nuovi valori di contesto derivati dalla presenza anno per anno. Anche qui: solo risultati, dati coinvolti e logica di calcolo — nessun dettaglio implementativo.

**Sintesi**: sì, tutte le estensioni richieste sono realizzabili sullo schema attuale, con tre interventi puntuali: (1) uso della colonna già esistente `ALUNNI.RIPETENTE` come segnale primario per l'esito, oggi non consultata dalla logica storica; (2) un nuovo confronto di presenza tra l'anno corrente e l'anno precedente, oggi assente; (3) l'introduzione di un nuovo valore nell'enumerazione `TipoMovimento` (`RITIRATO`) e la ridefinizione del significato del valore esistente `OUT` (che oggi copre sia il ritiro sia il trasferimento esterno, e dovrà coprire solo il trasferimento). Nessuna di queste modifiche richiede nuove tabelle.

---

## 1. Cosa cambia rispetto alla logica attuale

La logica attuale (descritta in `ANALYSIS_HISTORIC_ENRICH.md` §2.1) deduce l'esito di un anno **esclusivamente da `MOV_ALUNNI`**:

- una qualunque uscita (`MOV_ALUNNI.TIPO=OUT`) nell'anno → esito `RITIRATO`;
- un cambio di classe interno (`TIPO=CAMBIO`) → confronto tra l'anno di corso della classe di provenienza e quello della classe di destinazione: numero maggiore → `PROMOSSO`, uguale o minore → `NON_PROMOSSO`;
- assenza di movimento, o movimento non interpretabile, o nessun record `ALUNNI` per quell'anno → `SCONOSCIUTO`.

**Correzione di dominio.** `MOV_ALUNNI.TIPO=CAMBIO` rappresenta esclusivamente un cambio di classe **interno allo stesso anno di corso** (tipicamente un cambio di indirizzo o di sezione, es. per riorientamento) — per definizione **non** comporta mai un passaggio a un anno di corso diverso: uno studente cambia indirizzo restando nel medesimo anno. Il confronto "anno di corso di provenienza vs anno di corso di destinazione" descritto sopra come logica attuale è quindi strutturalmente incapace di segnalare una promozione o una non-promozione: per un `CAMBIO`, i due anni di corso a confronto coincidono sempre. Ne consegue che **una promozione ordinaria da un anno al successivo non produce, e non può produrre, alcuna riga `MOV_ALUNNI`**: non è un evento registrato, è semplicemente il fatto che l'anno successivo lo studente compare nel nuovo database con una classe di anno di corso superiore. Con la sola logica attuale, il caso più comune in assoluto — la promozione ordinaria — ricade quindi già oggi, nella pratica, nel ramo `SCONOSCIUTO` per mancanza di qualunque movimento da osservare.

Va inoltre notato che `CAMBIO` è **indipendente** dagli altri segnali: uno studente può avere un `CAMBIO` nello stesso anno in cui è ripetente, o in cui è transitato da un'altra scuola (con o senza `IN`), o in un anno del tutto ordinario — il cambio di indirizzo/sezione non esclude né implica nessuna di queste condizioni, ed è quindi irrilevante ai fini del calcolo dell'esito.

Questa logica ha tre limiti che la richiesta indirizza direttamente:

1. **Non usa un dato già disponibile ed esplicito** (`ALUNNI.RIPETENTE`), e si affida invece a un confronto (`CAMBIO`) che — per come `CAMBIO` è definito nel dominio — non è in grado di rilevare una promozione o una non-promozione in nessun caso, ordinario o meno.
2. **Non distingue** — né nella sorgente (`MOV_ALUNNI.TIPO`) né nell'esito esposto — tra "lo studente ha lasciato la scuola per trasferirsi altrove" e "lo studente ha lasciato la scuola per ritiro dagli studi". Il valore attuale `OUT` copre entrambi i casi indistintamente, e l'esito storico oggi risultante (`RITIRATO`) eredita questa ambiguità.
3. **Lascia silenziosamente `SCONOSCIUTO` il caso più frequente** (la promozione ordinaria), proprio perché nessun evento la marca in `MOV_ALUNNI`.

Inoltre la logica attuale **non ha alcun concetto di "presenza"** indipendente dall'esito: non distingue uno studente che è stato in classe dall'inizio alla fine dell'anno da uno entrato a anno già iniziato, né segnala un ingresso a inizio anno che — non generando alcun movimento in `MOV_ALUNNI` — oggi passa del tutto inosservato.

---

## 2. Uso di `ALUNNI.RIPETENTE` per l'esito

### 2.1 Cosa rappresenta il dato

`ALUNNI.RIPETENTE` è già presente nello schema (`01_SCHEMA_DATABASE.md`, tabella ALUNNI) ed è già superficialmente esposto nel CDU corrente come `focus.classe.studenti.listaCompleta[].status.isRipetente` — ma **solo per l'anno corrente**, e **mai consultato** dalla ricostruzione storica (`focus.alunno.storico`). È un dato per-anno: ogni database di anno scolastico ha la propria riga `ALUNNI` per lo studente, con il proprio valore di `RIPETENTE` riferito a quell'anno specifico.

### 2.2 Il significato temporale del flag

Il punto centrale della richiesta è che `RIPETENTE`, letto sull'anno **Y**, non descrive l'esito dell'anno Y (che a Y ancora in corso non è determinabile) — descrive **l'esito dell'anno Y-1**: se lo studente sta ripetendo in Y, necessariamente non è stato promosso da Y-1. Questo vale, come esplicitamente richiesto, **anche se Y-1 non è stato frequentato in questa scuola**: un neo-trasferito che arriva ripetente da un altro istituto ha comunque, per definizione, un esito `NON_PROMOSSO` per l'anno precedente, anche se questa scuola non possiede alcun record per quell'anno. Inoltre, alunno con annoDiCorso=1 può essere ripetente, perché deve ripetere proprio il primo anno.

Questo è un miglioramento reale rispetto all'inferenza attuale basata su `CAMBIO`: oggi, per uno studente arrivato da un'altra scuola come ripetente, l'anno precedente risulterebbe `SCONOSCIUTO` (nessun `CAMBIO` interno da osservare). Con la nuova regola, quell'anno precedente diventa determinabile come `NON_PROMOSSO` a partire dal solo dato dell'anno corrente, senza bisogno che l'anno precedente esista in un database storico consultabile.

### 2.3 Algoritmo proposto per l'esito di un anno Y

Per ciascun anno storico Y ricostruito (`anni[]`), la determinazione dell'esito dovrebbe seguire una gerarchia di segnali a priorità decrescente — i segnali basati su un evento esplicito (`MOV_ALUNNI`) prevalgono sempre sui segnali inferiti (`RIPETENTE`, confronto anni di corso), perché un'uscita dalla scuola durante l'anno rende comunque nulla la domanda "è stato promosso o no":

1. **Se esiste un `MOV_ALUNNI.TIPO=OUT` datato entro l'anno Y** → esito = `TRASFERITO` (vedi §3).
2. **Altrimenti, se esiste un `MOV_ALUNNI.TIPO=RITIRATO` datato entro l'anno Y** → esito = `RITIRATO` (nuovo significato, vedi §3).
3. **Altrimenti, se esiste un record `ALUNNI` per l'anno Y+1 per lo stesso studente** (in questa scuola — quindi tipicamente l'anno corrente, oppure un anno storico più recente già aperto): il valore di `RIPETENTE` su **quel** record determina l'esito di Y — `RIPETENTE=true` → `NON_PROMOSSO`; `RIPETENTE=false` → `PROMOSSO`.
4. **Altrimenti** → `SCONOSCIUTO`, come oggi — non esiste un fallback affidabile: `CAMBIO`, come chiarito in §1, non porta per definizione alcuna informazione sull'anno di corso e quindi non può sostituire `RIPETENTE` come segnale di riserva. Questo caso residuo si presenta quando né un movimento di uscita né un record dell'anno successivo in questa scuola sono disponibili — tipicamente al limite di bordo della profondità storica configurata, oppure quando lo studente esce dalla scuola senza un movimento di uscita registrato (dato mancante a monte).

Questo cambia la fonte primaria del segnale da "movimento osservato nell'anno Y stesso" a "flag osservato sull'anno successivo": `RIPETENTE(Y+1)` è ora l'**unico** segnale in grado di determinare positivamente `PROMOSSO`/`NON_PROMOSSO` per il caso ordinario, dato che nessun evento in `MOV_ALUNNI` marca mai una transizione di anno di corso (§1). In assenza di quel segnale, l'esito resta `SCONOSCIUTO`: non c'è più, a differenza della versione precedente di questa analisi, un secondo segnale (`CAMBIO`) con cui riconciliarlo — l'ambiguità di precedenza segnalata nella prima stesura di questo documento non si pone più.

---

## 3. Distinzione TRASFERITO / RITIRATO

### 3.1 Stato attuale dell'enumerazione

`MOV_ALUNNI.TIPO` (`TipoMovimento`, `03_VALUE_OBJECTS_ED_ENUM.md`) ha oggi tre valori: `IN` (ingresso), `OUT` (**"Uscita (ritiro, trasferimento esterno)"** — i due concetti sono già oggi fusi in un solo valore), `CAMBIO` (cambio classe interno). L'esito storico attuale (`StudentStoricoVM.anni[].esito`) ha quattro valori: `PROMOSSO | NON_PROMOSSO | RITIRATO | SCONOSCIUTO`, dove `RITIRATO` è oggi prodotto da **qualunque** `OUT`, senza distinzione.

### 3.2 Modifica proposta

Due modifiche di specifica, coordinate tra loro:

- **`MOV_ALUNNI.TIPO`**: si aggiunge un nuovo valore `RITIRATO` (uscita dagli studi, non verso altra scuola), e si restringe il significato di `OUT` alla sola uscita per trasferimento verso un altro istituto. I due valori diventano quindi reciprocamente esclusivi per rappresentare la stessa distinzione che oggi `OUT` da solo non fa.
- **`StudentStoricoVM.anni[].esito`**: si aggiunge il valore `TRASFERITO`, alimentato da `MOV_ALUNNI.TIPO=OUT` (nuovo significato ristretto); il valore esistente `RITIRATO` resta nell'enumerazione ma cambia sorgente, alimentato ora dal nuovo `MOV_ALUNNI.TIPO=RITIRATO`. L'enumerazione finale diventa `PROMOSSO | NON_PROMOSSO | TRASFERITO | RITIRATO | SCONOSCIUTO`.

### 3.3 Impatto sui dati storici già registrati

Questo è l'unico punto della richiesta con un impatto retroattivo reale: ogni riga `MOV_ALUNNI.TIPO=OUT` già registrata in un database di un anno passato è, con la semantica attuale, **indistintamente** un ritiro o un trasferimento — non esiste nel dato stesso l'informazione per riclassificarla automaticamente in `TRASFERITO` vs `RITIRATO` una volta introdotta la distinzione. Due strade possibili, da decidere:

- **Riclassificazione manuale una tantum**: chi gestisce l'anagrafica rivede le righe `OUT` storiche esistenti e le smista tra `OUT` (trasferimento) e il nuovo `RITIRATO`, dove il ricordo del caso concreto lo consente.
- **Convenzione di default per il pregresso**: tutte le righe `OUT` storiche restano `OUT` (quindi diventano `TRASFERITO` con la nuova lettura) per convenzione, e solo le nuove registrazioni da qui in avanti useranno correttamente il nuovo valore `RITIRATO` quando pertinente. Più semplice, ma consapevolmente impreciso sul pregresso.

Va inoltre aggiornato — a livello di procedura operativa, non di questo sistema — il punto di inserimento di un nuovo movimento di uscita, perché chi lo registra ora deve scegliere esplicitamente tra due valori invece di uno.

---

## 4. Nuovo valore CDU: `presenteAnnoPrecedente`

### 4.1 Cosa rappresenta

Un booleano, per lo studente nell'anno corrente (e per coerenza generalizzabile a ciascun anno storico ricostruito, si veda §4.4): indica se lo studente risultava già iscritto in questa scuola nell'anno immediatamente precedente, **a prescindere dalla classe** (un ripetente è comunque "presente l'anno precedente", pur essendo rimasto nello stesso anno di corso; un promosso è "presente l'anno precedente" pur essendo cambiato di classe).

### 4.2 Logica di calcolo

Per lo studente (identificato per email), si verifica l'esistenza di un record `ALUNNI` nel database dell'anno precedente, a prescindere dal suo stato attivo/non attivo (non c'è alcun filtro su `ATTIVO`: uno studente uscito nel corso dell'anno precedente comunque "c'era" quell'anno):

- **Se esiste** → `presenteAnnoPrecedente = true`.
- **Se non esiste** → `presenteAnnoPrecedente = false`. Questo è il caso descritto nella richiesta: uno studente presente quest'anno ma assente l'anno prima, per una classe con anno di corso maggiore di 1, è un ingresso per trasferimento avvenuto **a inizio anno scolastico** — un evento che, a differenza di un trasferimento a anno già iniziato, **non produce alcuna riga in `MOV_ALUNNI`** (non esiste oggi alcun record di questo tipo di ingresso). `presenteAnnoPrecedente = false` è quindi, per queste classi, l'unico segnale disponibile che rileva l'evento.

### 4.3 Eccezione per le classi di anno di corso 1

Per una classe con `CLASSI.ANNO = 1`, l'assenza dell'anno precedente è la norma (è il primo anno del percorso: lo studente semplicemente non era ancora iscritto da nessuna parte in questo ordine di scuola, oppure proviene dalla scuola media). In questo caso `presenteAnnoPrecedente = false` **non rappresenta un ingresso "anomalo" da segnalare** come lo sarebbe per un anno 2+: è un'iscrizione ordinaria di primo anno.

**Assunzione presa** (da confermare): il valore booleano resta comunque `false` anche per le classi di anno 1 — il dato riporta fedelmente "non era qui l'anno scorso" in entrambi i casi — ma il **significato** che se ne trae cambia con il contesto (anno 1 → normale; anno 2+ → trasferimento in ingresso a inizio anno). Chi consuma il valore (template, logica di notifica) deve quindi incrociarlo con `focus.classe.anagrafica.anno` (o campo equivalente) per interpretarlo correttamente, esattamente come oggi si fa per altri campi contestuali. Un'alternativa sarebbe non calcolare affatto il campo per le classi di anno 1 (valore assente anziché `false`), scelta che segnalerebbe più esplicitamente "non applicabile" invece di "falso" — da valutare in base a come il campo verrà consumato nei template.

### 4.4 Estensione naturale allo storico

Poiché il calcolo del passo 3 di §2.3 già comporta, per ogni anno Y, la verifica dell'esistenza del record dell'anno Y+1 (e viceversa, camminando all'indietro, quello di Y-1), lo stesso identico controllo di presenza usato per `presenteAnnoPrecedente` sull'anno corrente **può essere naturalmente esteso a ciascuna voce di `anni[]`** nello storico, senza costo aggiuntivo di lettura: per ogni anno storico Y ricostruito, un `presenteAnnoPrecedente` riferito a Y (cioè: era già qui in Y-1?). Non è stato esplicitamente richiesto per lo storico, ma è un sottoprodotto diretto della stessa logica e si segnala come opportunità.

---

## 5. Nuovo valore CDU: `presenteTuttoAnno`

### 5.1 Cosa rappresenta

Un booleano che indica se lo studente ha frequentato l'intero anno scolastico di riferimento senza ingressi durante l'anno — cioè se **non** esiste, per quell'anno, alcuna riga `MOV_ALUNNI.TIPO=IN` oppure `MOV_ALUNNI.TIPO=CAMBIO` a suo carico. A differenza di `presenteAnnoPrecedente` (che guarda al confine tra due anni), questo valore guarda **dentro** un singolo anno.

### 5.2 Logica di calcolo

Per lo studente, nell'anno di riferimento Y:

- **Se non esiste alcun `MOV_ALUNNI.TIPO=IN`  oppure `MOV_ALUNNI.TIPO=CAMBIO` datato entro l'anno Y** → `presenteTuttoAnno = true` (nessun ingresso registrato durante l'anno: o era già presente dall'inizio, o è entrato a inizio anno senza lasciare traccia in `MOV_ALUNNI`, come descritto in §4.2 — in entrambi i casi, dal punto di vista della frequenza *durante* l'anno, non manca nulla).
- **Se esiste almeno un `MOV_ALUNNI.TIPO=IN` oppure `MOV_ALUNNI.TIPO=CAMBIO` datato entro l'anno Y** → `presenteTuttoAnno = false` (ingresso avvenuto a anno già iniziato: una porzione dell'anno è stata frequentata altrove o non frequentata affatto qui).

### 5.3 Ambito di applicazione: anno corrente e ciascun anno storico

Come richiesto esplicitamente, il campo si applica sia al contesto dello studente nell'anno corrente (accanto a `presenteAnnoPrecedente`, tra i dati di stato dello studente), sia — con esattamente la stessa logica, riferita di volta in volta all'anno specifico — a ciascuna voce `anni[]` dello storico: `anni[i].presenteTuttoAnno` risponderebbe "in quell'anno specifico Y, lo studente è entrato a anno già iniziato?".

### 5.4 Relazione con `presenteAnnoPrecedente`

I due valori sono complementari, non ridondanti, e la loro combinazione permette di distinguere con precisione quattro situazioni per un dato anno Y:

| `presenteAnnoPrecedente` | `presenteTuttoAnno` | Interpretazione |
|---|---|---|
| `true` | `true` | Studente continuativo: già presente l'anno prima, nessun ingresso durante l'anno. Caso ordinario. |
| `true` | `false` | Caso limite: presente l'anno prima ma con un ingresso registrato durante l'anno corrente — es. un rientro dopo un ritiro temporaneo, o un cambio di istituto in corso d'anno seguito da un rientro nello stesso anno. Da trattare come segnale di attenzione, non come dato incoerente. |
| `false` | `true` (anno 2+) | Trasferimento in ingresso **a inizio anno**: nessun `MOV_ALUNNI.TIPO=IN` (perché non ne viene generato uno per gli ingressi di inizio anno, §4.2), ma non era qui l'anno prima. |
| `false` | `false` | Trasferimento in ingresso **durante l'anno**: coerente presenza di un `MOV_ALUNNI.TIPO=IN` datato e assenza l'anno precedente. |

La riga "`false`/`true` per anno 1" è normale iscrizione di primo anno, non un trasferimento (§4.3), e va letta diversamente dalle altre tre pur avendo la stessa combinazione booleana di un ingresso a inizio anno per anni 2+.

---

## 6. Impatti riassuntivi sullo schema e sul CDU

| Elemento | Stato attuale | Modifica proposta |
|---|---|---|
| `MOV_ALUNNI.TIPO` (enum `TipoMovimento`) | `IN`, `OUT` (ritiro **o** trasferimento), `CAMBIO` | Aggiunta di `RITIRATO`; `OUT` ristretto al solo trasferimento esterno |
| `StudentStoricoVM.anni[].esito` | `PROMOSSO \| NON_PROMOSSO \| RITIRATO \| SCONOSCIUTO`, dedotto da `MOV_ALUNNI` incluso un confronto via `CAMBIO` che, per definizione di `CAMBIO`, non può mai rilevare una promozione | Aggiunta di `TRASFERITO`; priorità ai segnali `MOV_ALUNNI` (OUT/RITIRATO), poi `ALUNNI.RIPETENTE` dell'anno successivo come unico segnale per `PROMOSSO`/`NON_PROMOSSO`; `CAMBIO` non entra più nel calcolo dell'esito |
| `focus.classe.studenti.listaCompleta[].status` / `focus.alunno` | ha già `isRipetente` (solo anno corrente) | Aggiunta di `presenteAnnoPrecedente` e `presenteTuttoAnno` accanto a `isRipetente` |
| `StudentStoricoVM.anni[]` | nessun dato di presenza | Estensione naturale (non esplicitamente richiesta, proposta in §4.4/§5.3): `presenteAnnoPrecedente` e `presenteTuttoAnno` per ciascun anno storico |

Nessuna nuova tabella è necessaria: tutti i dati sorgente (`ALUNNI.RIPETENTE`, `ALUNNI` per anno, `MOV_ALUNNI.TIPO`) esistono già o richiedono solo l'aggiunta di un valore a un'enumerazione esistente.

---

## 7. Domande aperte / assunzioni da confermare

1. **Assenza di fallback per `SCONOSCIUTO`** (§2.3, passo 4): confermato che `CAMBIO` non può in alcun modo fungere da segnale sostitutivo per l'esito (per definizione non varia mai l'anno di corso); resta quindi da valutare se lasciare `SCONOSCIUTO` come esito finale in questi casi residui sia accettabile, o se serva un'altra fonte dati non ancora individuata per coprirli. [UTENTE: va bene "sconosciuto"]
2. **Riclassificazione del pregresso `OUT`** (§3.3): da decidere se effettuare una revisione manuale una tantum delle righe storiche o accettare che il pregresso resti convenzionalmente `TRASFERITO`. [UTENTE: farò le modifiche manualmente, non devi occupartene]
3. **Significato di `presenteAnnoPrecedente = false` per le classi di anno 1** (§4.3): si è assunto che il campo venga comunque calcolato e restituito come `false` (non omesso), lasciando al consumatore l'onere di incrociarlo con l'anno di corso per l'interpretazione corretta. Da confermare se questa sia la resa preferita rispetto a lasciare il campo assente per l'anno 1. [UTENTE: false è ok]
