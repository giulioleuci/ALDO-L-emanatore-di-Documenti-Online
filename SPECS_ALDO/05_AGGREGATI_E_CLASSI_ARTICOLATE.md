# 05 — Aggregati e Classi Articolate

Questo documento descrive gli invarianti degli aggregati del dominio SGSA e la gestione delle classi articolate, che costituiscono un caso speciale con impatto diffuso su repository, provider, pipeline e notifiche.

---

## Parte I — Invarianti degli Aggregati

### Aggregato Alunno

**Root:** `Alunno`  
**Membri:** `Carenza[]`, `Piano[]`, `MovimentoAlunno[]`, `OreASL[]`

**Invarianti:**
- Un alunno NON PUÒ MAI avere più di un piano attivo per ogni valore specifico di `TipoPiano` (`PDP_DSA`, `PDP_BES`, `PDP_STRANIERI`, `PEI`, `PFP`): NON può cioè avere due record attivi con lo stesso `TIPO`. Ciò significa che DEVE esistere AL PIÙ un record attivo in `PIANI` per ogni combinazione `(STUDENTE, TIPO)`. È invece consentito avere contemporaneamente, ad esempio, `PDP_DSA` e `PDP_BES` per lo stesso alunno: sono valori distinti dell'enum.
- Le carenze DEVONO essere associate alla classe corrente dell'alunno al momento della rilevazione: il campo `CARENZE.CLASSE` DEVE corrispondere ad `ALUNNI.CLASSE` nel momento in cui la riga è creata.

**Accesso ai membri:** I repository figli (Carenza, Piano, OreASL, MovimentoAlunno) DEVONO essere usati direttamente SOLO per query di sistema (batch, report). Ogni operazione di business che modifica questi oggetti DEVE passare attraverso `AlunnoRepository`, che mantiene la coerenza dell'aggregato.

---

### Aggregato Classe

**Root:** `Classe`  
**Membri:** `Progetto[]`, docenti CDC (via colonne dinamiche), studenti (via FK in `ALUNNI`)

**Invarianti:**
- Una classe DEVE avere almeno un coordinatore definito in `CLASSI.COORD`.
- Ogni coordinatore DEVE essere presente nel CDC della classe: la sua email DEVE apparire in almeno una colonna materia della riga corrispondente in `CLASSI`.
- Una classe articolata DEVE avere parent/partner valido nel database: i campi `parent` e `partner` DEVONO corrispondere a `CLASSI.ID` esistenti.

---

### Aggregato Docente

**Root:** `Docente`  
**Correlati (non membri):** `Supplenza[]` (come titolare), `RuoloSpeciale[]`

`Supplenza` e `RuoloSpeciale` sono essi stessi Aggregate Root (vedi `04_DOMINIO_ENTITA.md`), non membri dell'aggregato `Docente`. La relazione è una correlazione tramite chiave esterna logica: `SUPPLENZE.TITOLARE → DOCENTI.EMAIL` e `RUOLI.DOCENTE` (CSV) `→ DOCENTI.EMAIL`.

**Invarianti:**
- Un docente NON PUÒ MAI avere due supplenze con periodi sovrapposti per lo stesso contesto (stessa classe e stessa materia). Questo invariante DEVE essere verificato prima della creazione di ogni nuova supplenza tramite `SupplenzaRepository.findSupplenzaSpecifica()`.

---

### Aggregato ConfigurazioneDocumento

**Root:** `ConfigurazioneDocumento`  
**Correlati (non membri):** `LogDocumento[]`, `LogCartella[]`

`LogDocumento` e `LogCartella` sono essi stessi Aggregate Root (audit trail append-only con repository proprio, vedi `04_DOMINIO_ENTITA.md`), non membri dell'aggregato `ConfigurazioneDocumento`. La relazione è una correlazione tramite chiave esterna logica: `LOG_DOCS.ID_GEN → CONF_DOC.ID` e `LOG_FOLD.TIPO → CONF_DOC.ID`.

---

### Aggregato ConfigurazioneEmail

**Root:** `ConfigurazioneEmail`  
**Correlati (non membri):** `LogEmail[]`

`LogEmail` è anch'esso un Aggregate Root (audit trail append-only), correlato tramite `LOG_MAIL.PATTERN → CONF_MAIL.ID`.

---

## Parte II — Classi Articolate

Una **classe articolata** è una classe composta da studenti di due indirizzi diversi che condividono alcune materie e si separano per discipline specifiche dell'indirizzo.
Una classe articolata DEVE avere esattamente tre righe nel DB: la classe completa (parent) e le due "sottoclassi" componenti (partner).

---

### 1. Struttura

Due classi anagrafiche distinte che condividono alcuni docenti per materie comuni. Ogni classe ha il proprio `INDIRIZZO` corretto e i propri alunni separati.

**Nomenclatura convenzionale:** `4C-LC` e `4C-LS` (due record separati in `CLASSI`)

---

### 2. Struttura JSON `CLASSI.ARTICOLAZIONE`

```json
{
  "parent":   "ClasseId | null",
  "partner":  "ClasseId | null",
  "partners": "csv | null"
}
```

**Nota semantica:**
- Per la **classe parent** (es. `1F`): `parent = null`, `partner = null`, `partners = "1F-LSO,1F-LSS"` (CSV dei due partner)
- Per una **classe partner** (es. `1F-LSO`): `parent = "1F"`, `partner = "1F-LSS"` (l'altro partner), `partners = null`
- Per le **classi standard**: tutti i campi sono `null`

**Ordine PRIMO/SECONDO gruppo:** L'ordine dei ClasseId nel CSV `partners` della classe parent determina il gruppo: il primo elemento È il PRIMO gruppo (`materieSeparatePrimoGruppo`, `SEPARATO_PRIMO`), il secondo È il SECONDO gruppo (`materieSeparateSecondoGruppo`, `SEPARATO_SECONDO`). L'ordine è stabilito al momento dell'inserimento del dato e NON DEVE MAI essere riordinato automaticamente dal sistema.

**Invarianti di configurazione:**
- Il CSV `partners` della classe parent DEVE contenere ESATTAMENTE due `ClasseId`; un'articolazione con un numero diverso di classi partner NON è supportata.
- Le materie e i docenti comuni o separati DEVONO essere calcolati dal codice. Un docente È in comune SE E SOLO SE le due classi partner hanno lo stesso docente per la stessa materia; altrimenti È separato.
- Le classi articolate possono avere anche materie differenti (esempio `greco` al classico, ma non allo scientifico)

---

### 3. Impatto sui Repository

**`ClasseRepository`:**

- Il metodo `getDocentiPerMateriaArticolata(classe, materia, indirizzoStudente?)` risolve il docente corretto in base alla configurazione in `CLASSI`.
- Il metodo `getAllDocentiCDCArticolata(classe)` unisce e deduplica i docenti della classe corrente e di quella partner.

**`AlunnoRepository`:**

- Il metodo `findByClasseEIndirizzo(classeId, indirizzo)` filtra gli alunni della classe confrontando `CLASSI.INDIRIZZO` della loro classe con l'indirizzo richiesto.

---

### 4. Impatto sui Context Provider

**`ClasseProvider`** aggiunge al CDU il flag `focus.classe.flags.isArticolata` (boolean) e, se true, il blocco `focus.classe.articolazione` con `partner`, `parent`, `materieCondivise`, `materieSeparatePrimoGruppo`, `materieSeparateSecondoGruppo`.

**`ConsiglioClasseProvider`** per classi articolate produce un array piatto di oggetti docente-nel-CDC (stessa struttura delle classi standard). Per le classi articolate, ogni oggetto ha il campo aggiuntivo:
```
tipoArticolazione: "COMUNE" | "SEPARATO_PRIMO" | "SEPARATO_SECONDO" | null
```

**`StudentiProvider`** per la classe parent aggrega gli studenti di entrambe le classi partner e li raggruppa per indirizzo (`perIndirizzo`). Per le classi partner singole e le classi standard, `perIndirizzo` non è presente. Vedi `09_CONTEXT_ENGINE.md` sezione 10.

**`CarenzeMapper`** (componente interno a `CarenzeProvider`) filtra le materie in base all'indirizzo dell'alunno corrente prima di costruire l'array delle carenze per il CDU. Le materie degli indirizzi a cui l'alunno non appartiene vengono escluse.

---

### 5. Email e Notifiche per Classi Articolate

**Destinatari docenti:** usare SEMPRE `ClasseRepository.getAllDocentiCDCArticolata(classe)` per includere docenti comuni, parent e partner.

**Email carenze a famiglie:** ogni email mostra solo le carenze pertinenti all'indirizzo effettivo dello studente:

```
carenzeFiltrate = carenze per cui:
  config.isMateriaCondivisa(carenza.materia)   → inclusa
  materia appartiene all'indirizzo dell'alunno → inclusa
  materia appartiene all'altro indirizzo       → ESCLUSA
```

Esempio: classe articolata `5A` (con partner `5A-LC` e `5A-LS`), studente in `5A-LC`, carenze MAT (condivisa), LAT (LC), FIS (LS) → email con MAT e LAT; FIS esclusa.

**Ruoli `FAMIGLIA` e `GENITORI_CLASSE`:** se la classe interrogata è la classe parent, questi ruoli aggregano i tutori (`TUTOR_1`/`TUTOR_2`) degli alunni di entrambe le classi partner. Se la classe interrogata è una singola classe partner, restituiscono solo i tutori di quella classe.

**Pattern email su classi articolate (`PER_CDC`, `PER_COORDINATORE`):** `CONF_MAIL` NON ha un campo equivalente a `CONF_DOC.GESTIONE_ARTICOLAZIONE`. L'entry point DEVE essere SEMPRE la classe parent: DEVE essere generata SEMPRE una sola email aggregata per l'intero gruppo articolato, MAI due email separate per partner.

---

### 6. Validazione della configurazione

Prima di usare una classe articolata, il sistema verifica:

| Controllo | Errore se… |
|-----------|-----------|
| Numero partner | `articolazione.partners` non contiene esattamente due `ClasseId` |
| Partner esiste | `articolazione.partner` non trovato in `CLASSI` |
| Configurazione reciproca | La classe partner non punta correttamente alla classe corrente |
| **Materie duplicate (in condivise e separate simultaneamente)** | `materieCondivise ∩ (materieSeparatePrimoGruppo ∪ materieSeparateSecondoGruppo) ≠ ∅` |
