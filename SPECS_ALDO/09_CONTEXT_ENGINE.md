# 09 — Context Engine

Il **Context Engine** è il sistema che assembla il Contesto Dati Unificato (CDU) prima di ogni operazione. Dato un punto di ingresso (una classe, un alunno, un docente), raccoglie e organizza tutti i dati correlati in un unico oggetto strutturato, pronto per i template e i box renderer.

**Libreria di riferimento:** `ContextEngine` (L3).

---

## 1. CDU — Struttura

Il CDU è descritto in dettaglio in `02_CDU_STRUTTURA.md`. In sintesi:

```
CDU:
  meta          — Timestamp, ID esecuzione, date formattate, parametri input
  istituto      — Anagrafica e statistiche dell'istituto
  focus:
    classe      — Dati della classe (anagrafica, flags, CDC, studenti, documenti)
    alunno      — Dati dello studente (anagrafica, carenze, piani, PCTO)
  destinatario  — Dati del destinatario con ruoli e flags pre-calcolati
  render        — HTML pre-renderizzato dei box email (solo pipeline email)
  tech          — Oggetti vivi (non enumerabili, non serializzati in JSON)
```

Il blocco `tech` DEVE essere definito con `Object.defineProperty(..., { enumerable: false })`, così da NON apparire MAI in `JSON.stringify()`, prevenendo log circolari e giganteschi.

---

## 2. ContextBuilder

Il `ContextBuilder` è il componente che assembla il CDU a partire da un `entryPoint` e una `Recipe`.

```
ContextBuilder:
  registerProvider(name: string, provider: ContextProvider): void
  registerInterceptor(interceptor: ContextInterceptor): void

  build(entryPoint: any, recipe: Recipe): CDU
    1. Inizializza CDU vuoto
    2. Per ogni provider nella recipe.providers:
       a. dati = provider.getData(entryPoint, cdu, recipe.options)
       b. Applica ogni interceptor registrato al risultato
       c. Merge dei dati nel CDU
    3. Attacca il blocco tech (non-enumerable) con entità vive e servizi
    4. Return CDU
```

---

## 3. Recipe — Configurazione Dichiarativa

Una Recipe specifica quali provider attivare e le opzioni di caricamento:

```
Recipe:
  providers: string[]       — token dei provider da attivare, nell'ordine (vedi tabella mapping in §4)
  options:                  — copiate in cdu.meta.parametriInput.opzioni (vedi 02_CDU_STRUTTURA.md)
    includiStorico: boolean
    profonditaAnniStorico: number
    profonditaAnniAsl: number
    profonditaAnniDocumenti: number
    includiSupplenti: boolean
    includiSpecificita: boolean
    notificaSoloCoordinatori: boolean
    [key: string]: any       — opzioni aggiuntive per provider specifici
```

### Recipe predefinite

| Nome                 | Provider attivati                                                      | Uso tipico                                              |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `CLASSE_COMPLETA`    | school, class, students, tutor, consiglio, rappresentanti, statistiche | Verbali, notifiche CDC, email coordinatori              |
| `ALUNNO_DETTAGLIATO` | school, class, student, carenze, piani, documenti, storico             | PDP/PEI, pagellini, email famiglie                      |
| `DOCENTE_COMPLETO`   | school, class, consiglio                                               | Pipeline email PER_COORDINATORE / PER_DOCENTE / PER_CDC |
| `ALUNNO_COMPLETO`    | school, class, student, carenze, piani                                 | Pipeline email PER_ALUNNO                               |
| `FAMIGLIA_COMPLETO`  | school, class, student, carenze, piani, documenti                      | Pipeline email PER_GENITORI_ALUNNO                      |
| `CARENZA_COMPLETO`   | school, class, student, carenze, piani, carenzaFocus                   | Pipeline email PER_CARENZA                              |

`DOCENTE_COMPLETO` è la recipe base per le pipeline email PER_COORDINATORE, PER_DOCENTE e PER_CDC (vedi `11_PIPELINE_EMAIL.md`, Step 1).

**Nota CLASSE_COMPLETA:** `tutor` precede `consiglio` perché `ConsiglioClasseProvider` necessita di `isTutorAsl` e `isTutorOrientamento` — dati letti da `CLASSI.RUOLI` che `TutorProvider` rende disponibili nel CDU prima che il CDC venga costruito.

**Nota — piani e carenze in `CLASSE_COMPLETA`:** la lista dei piani e delle carenze richiesta dai placeholder di classe è esposta **per singolo studente** in `focus.classe.studenti.listaCompleta[].didattica.piani` e `.carenze` (prodotta da `StudentiProvider`, token `students`, che legge `CARENZE` e `PIANI`), e in forma aggregata in `focus.classe.studenti.statistiche` (`conPianiDidattici`, `conBes`, `conDsa`) tramite `StatisticheProvider`. I token `carenze`/`piani` (CarenzeProvider/PianiProvider) **non** compaiono in questa recipe perché popolano `focus.alunno.didattica.*`, presente solo nelle recipe con focus alunno (`student`).

---

## 4. Provider Disponibili

Ogni provider è responsabile di popolare una specifica sezione del CDU.

| Nome Provider             | Sezione CDU popolata                                                                              | Sorgente dati principale                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SchoolProvider`          | `cdu.istituto`                                                                                    | **Master Sheet** (via `MasterSheetRepository`)                                                                                                                                                                                                                                                                                                               |
| `ClasseProvider`          | `cdu.focus.classe.anagrafica`, `flags`, `articolazione`, `risorse`                                | `CLASSI`, `INDIRIZZI`, `LOG_FOLD`                                                                                                                                                                                                                                                                                                                            |
| `StudentiProvider`        | `cdu.focus.classe.studenti`                                                                       | `ALUNNI`, `CARENZE`, `ASL`, `PIANI`                                                                                                                                                                                                                                                                                                                          |
| `ConsiglioClasseProvider` | `cdu.focus.classe.consiglioDiClasse`, `staff`                                                     | `CLASSI` (colonne dinamiche), `DOCENTI`, `SUPPLENZE`                                                                                                                                                                                                                                                                                                         |
| `AlunnoProvider`          | `cdu.focus.alunno` (anagrafica, classe, status, curriculum, consiglioDiClasseFiltrato, didattica) | `ALUNNI` (include `focus.alunno.status`: religione, isRipetente, isRappresentante; `isBes` inizializzato a `false` come placeholder — vedi nota sotto; include `ALUNNI.CURRICULUM`, esposto come `focus.alunno.curriculum` e usato da `CDCFilterAlunnoStrategy` per filtrare `consiglioDiClasseFiltrato` per specificità, vedi `14_SERVIZI_UTILITY.md` §1.3) |
| `CarenzeProvider`         | `cdu.focus.alunno.didattica.carenze`                                                              | `CARENZE`, `MATERIE` (via `CarenzeMapper`)                                                                                                                                                                                                                                                                                                                   |
| `PianiProvider`           | `cdu.focus.alunno.didattica.piani`                                                                | `PIANI`                                                                                                                                                                                                                                                                                                                                                      |
| `DocumentiProvider`       | `cdu.focus.alunno.didattica.documenti`                                                            | `LOG_DOCS` (via `LogDocumentoRepository.findByUtente()`); carica i documenti associati all'alunno, con filtri opzionali per `TIPO`/`STATO`; attivo nelle recipe `ALUNNO_DETTAGLIATO` e `FAMIGLIA_COMPLETO`                                                                                                                                                   |
| `CarenzaFocusProvider`    | `cdu.focus.carenza`                                                                               | `CARENZE` (il record specifico che ha avviato la pipeline `PER_CARENZA`); attivo solo nella recipe `CARENZA_COMPLETO`                                                                                                                                                                                                                                        |
| `RappresentantiProvider`  | `cdu.focus.classe.rappresentanti`                                                                 | `ALUNNI.RAPPR_STUD`, `ALUNNI.RAPPR_GEN`                                                                                                                                                                                                                                                                                                                      |
| `TutorProvider`           | `cdu.focus.classe.tutor`                                                                          | `CLASSI.RUOLI` (chiavi TUTOR_ASL, TUTOR_ORIENT)                                                                                                                                                                                                                                                                                                              |
| `StatisticheProvider`     | `cdu.istituto.statistiche`, `cdu.focus.classe.statistiche`                                        | `ALUNNI`, `PIANI`, `CARENZE`, `ASL` (aggregati calcolati)                                                                                                                                                                                                                                                                                                    |
| `StoricoProvider`         | Lazy loader per dati anni precedenti                                                              | Database storici via `SheetDBLib`; dettagli in `13_SERVIZI_STORICI.md`                                                                                                                                                                                                                                                                                       |

**Nota su `focus.alunno.status.isBes`:** il campo richiede di leggere `PIANI` (competenza di `PianiProvider`), non `ALUNNI`. `AlunnoProvider` imposta `isBes = false` come valore iniziale; `PianiProvider`, eseguito successivamente nell'ordine della recipe, aggiorna `isBes` a `true` se l'alunno ha almeno un piano con `isBES() = true`. Questo crea una dipendenza d'ordine implicita: in ogni recipe che include entrambi, `student` (AlunnoProvider) deve precedere `piani` (PianiProvider) — coerente con l'ordine già usato in `ALUNNO_DETTAGLIATO`, `ALUNNO_COMPLETO`, `FAMIGLIA_COMPLETO`, `CARENZA_COMPLETO`.

### Mapping token recipe → Provider

I nomi elencati in `Recipe.providers` (sezione 3) sono token brevi, mappati 1:1 alle classi Provider di questa sezione. Il `ContextBuilder` risolve ogni token tramite questa tabella; un token non presente produce un errore di configurazione della recipe.

| Token in `Recipe.providers` | Provider                  |
| --------------------------- | ------------------------- |
| `school`                    | `SchoolProvider`          |
| `class`                     | `ClasseProvider`          |
| `students`                  | `StudentiProvider`        |
| `student`                   | `AlunnoProvider`          |
| `tutor`                     | `TutorProvider`           |
| `consiglio`                 | `ConsiglioClasseProvider` |
| `carenze`                   | `CarenzeProvider`         |
| `piani`                     | `PianiProvider`           |
| `documenti`                 | `DocumentiProvider`       |
| `carenzaFocus`              | `CarenzaFocusProvider`    |
| `rappresentanti`            | `RappresentantiProvider`  |
| `statistiche`               | `StatisticheProvider`     |
| `storico`                   | `StoricoProvider`         |

---

## 5. SwapAndEnrichInterceptor

Il `SwapAndEnrichInterceptor` DEVE essere applicato dopo ogni provider che produce dati docente. Verifica se il docente ha una supplenza attiva nel contesto corrente; in tal caso, in base alla regola `GestioneSupplenti` configurata (`CONF_MAIL.SUPPLENTI` nella pipeline email; `CONF_DOC.PERMESSI.regolaSupplente` nella pipeline documenti):

- `SOLO_SUPPLENTI` → sostituisce i dati del titolare con quelli del supplente
- `SOLO_TITOLARI` → nessuna modifica, ignora la supplenza
- `ENTRAMBI` → aggiunge i dati del supplente affiancando il titolare

Questo interceptor garantisce che i template ricevano sempre i dati aggiornati del docente effettivamente attivo, senza che ogni provider debba gestire questa logica individualmente.

---

## 6. CarenzeMapper

Il `CarenzeMapper` è un componente interno al `CarenzeProvider` (non un provider autonomo). La sua responsabilità è trasformare la struttura a matrice della tabella `CARENZE` in un array di oggetti usabile dai template e dai box renderer.

**Il problema:** la tabella `CARENZE` ha una colonna per ogni materia (identificata dalla sigla di `MATERIE.ID`). Questa struttura non è direttamente usabile dai template o dai renderer, che si aspettano un array di oggetti.

**La trasformazione:** per ogni colonna materia con valore non nullo nella riga della carenza:

1. Legge la sigla dalla colonna
2. Risolve la materia nel registro `MATERIE` recuperando: `NOME`, `SINTESI`, `COLORE_1`, `COLORE_2`, `SIMBOLO`
3. Produce un oggetto strutturato:
   ```
   {
     sigla,
     nome,
     nomeSintesi,
     colore,         — MATERIE.COLORE_1
     colore2,        — MATERIE.COLORE_2
     simbolo,        — MATERIE.SIMBOLO
     descrizione     — valore grezzo della cella (voto numerico o testo libero)
   }
   ```
4. Per le classi articolate, DEVE filtrare le materie in base all'indirizzo dell'alunno corrente, escludendo le materie degli indirizzi a cui l'alunno non appartiene (logica descritta in `05_AGGREGATI_E_CLASSI_ARTICOLATE.md`).
5. Per le materie con specificità, DEVE filtrare le colonne `SpecificitaId` in base a `ALUNNI.CURRICULUM` dell'alunno corrente. Le colonne specificità non presenti nel curriculum dell'alunno DEVONO essere escluse dall'output. Questo garantisce che un alunno che segue `INTERPRETAZIONE.CHITARRA` non riceva MAI nel CDU le carenze di `INTERPRETAZIONE.PIANOFORTE`.

L'output del `CarenzeMapper` è la struttura attesa dal box renderer `carenze` descritto in `11_PIPELINE_EMAIL.md`.

---

## 7. ViewModelMapper

Le entità di dominio nel CDU (oggetti `Alunno`, `Docente`, `Classe`, ecc.) contengono metodi e riferimenti che non sono serializzabili in JSON. I motori di template (`WorkspaceTemplateEngine`, L2) e i renderer di contenuto (`ComposableContentLib`, L4) operano esclusivamente su strutture piatte con sole proprietà scalari.

**Il processo di appiattimento:** prima che i dati del CDU vengano passati a questi motori, un `ViewModelMapper` specifico per il contesto converte le entità di dominio in plain objects (oggetti JavaScript senza metodi, con sole proprietà scalari o array di scalari).

**Responsabilità del mapper:**

- Tutte le proprietà accessibili nei template `{{percorso.nel.cdu}}` DEVONO essere valori primitivi serializzabili
- Nessun riferimento circolare o metodo DEVE MAI essere esposto al motore di template
- La struttura gerarchica attesa DEVE essere preservata (coerente con `02_CDU_STRUTTURA.md`)

Ogni recipe PUÒ specificare quale `ViewModelMapper` utilizzare. Il blocco `tech` NON DEVE MAI essere incluso nell'oggetto piatto prodotto dal mapper.

---

## 8. Lazy Loading dei Dati Storici

Quando una recipe include `StoricoProvider` e `includiStorico: true`, il provider NON DEVE caricare i dati degli anni precedenti immediatamente. DEVE invece inserire nel CDU degli oggetti `LazyRef` che incapsulano la query da eseguire sul database storico.

Quando il template o il box renderer accede alla proprietà di un `LazyRef`, questo:

1. Esegue la query sul database storico appropriato (tramite `SheetDBLib` puntato allo spreadsheet dell'anno precedente)
2. Mette in cache il risultato in memoria
3. Restituisce il dato

Gli accessi successivi alla stessa proprietà restituiscono il valore cachato senza nuove query.

Se `includiStorico: false`, il `StoricoProvider` DEVE essere saltato interamente e nessun `LazyRef` DEVE essere inserito nel CDU.

Dettagli completi sui servizi storici in `13_SERVIZI_STORICI.md`.

---

## 9. ClasseProvider: dettaglio per classi articolate

Il `ClasseProvider` aggiunge al CDU due sezioni specifiche per le classi articolate:

**`focus.classe.flags`** (integrazione):

```
isArticolata: boolean
```

**`focus.classe.articolazione`** (presente solo se `isArticolata = true`):

```
partner:                      ClasseId | null
                              — per una classe partner: il ClasseId dell'altro partner
                              — per la classe parent: null (usare `partners` per accedere ai partner)
partners:                     ClasseId[] | null
                              — per la classe parent: array di esattamente 2 elementi [primo_partner, secondo_partner]
                              — per le classi partner e classi standard: null
parent:                       ClasseId | null
                              — per una classe partner: il ClasseId della classe parent
                              — per la classe parent: null
materieCondivise:             string[]
materieSeparatePrimoGruppo:   string[]
materieSeparateSecondoGruppo: string[]
```

Esiste un solo tipo di articolazione nel modello.
Le materie condivise e separate sono calcolate dal codice confrontando le colonne docente delle due classi partner: se entrambe hanno lo stesso docente per la stessa materia, la materia è condivisa; altrimenti è separata.
`materieSeparatePrimoGruppo` contiene le materie separate della prima classe partner (es. `1F-LSO`);
`materieSeparateSecondoGruppo` quelle della seconda (es. `1F-LSS`).

---

## 10. StudentiProvider: dettaglio per classi articolate

Per la classe parent di una classe articolata (es. `1F`), il `StudentiProvider` aggrega
gli studenti di entrambe le classi partner e li raggruppa per indirizzo nel CDU:

```
focus.classe.studenti:
  listaCompleta:     Alunno[]
  perIndirizzo:
    "[SIGLA_IND]":   Alunno[]    — es. "LSO": [...], "LSS": [...]
  indirizziPresenti: string[]
```

Per le singole classi partner (es. `1F-LSO`) e per le classi standard (non articolate),
`perIndirizzo` non è presente.

Per classi con materie che prevedono specificità, `StudentiProvider` può produrre (se richiesto dalla recipe tramite opzione `includiSpecificita: true`) la struttura:

```
focus.classe.studenti:
  perSpecificita:
    "[MateriaId]":
      "[specifica]": Alunno[]    — es. "INTERPRETAZIONE": { "CHITARRA": [...], "PIANOFORTE": [...] }
```

---

## 11. StatisticheProvider: dati aggregati

Il `StatisticheProvider` calcola aggregati non provenienti da una singola tabella:

**`cdu.istituto.statistiche`:**

- `totaleClassi` — count CLASSI con ATTIVA = true
- `totaleDocenti` — count DOCENTI
- `totaleAlunni` — count ALUNNI con ATTIVO = true

**`cdu.focus.classe.statistiche`:**

- `totale` — numero alunni attivi nella classe
- `conPianiDidattici` — alunni con almeno un piano attivo
- `conBes` — alunni con almeno un Piano attivo con isBES() = true (vedi 04_DOMINIO_ENTITA.md, entità Piano)
- `conDsa` — alunni con DSA (sottoinsieme dei BES)
- `ripetenti` — alunni con `RIPETENTE = true`
- `rappresentanti` — alunni con `RAPPR_STUD = true`
