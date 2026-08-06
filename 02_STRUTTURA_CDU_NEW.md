```markdown
# 02 — Struttura del Contesto Dati Unificato (CDU)

Il **CDU (Contesto Dati Unificato)** è la struttura JSON centrale attorno alla quale ruota ogni operazione di SGSA. Prima di generare un documento tramite Mustard.js o inviare una notifica email, il `ContextEngine` e i relativi mappers assemblano il CDU che aggrega tutti i dati necessari in un'unica gerarchia fortemente tipizzata. Template, box renderer ed espressioni condizionali DEVONO leggere ESCLUSIVAMENTE dal CDU.

> **DIRETTIVA CRITICA DI ARCHITETTURA (NO BACKWARD COMPATIBILITY):**
> Il sistema non è in produzione. Non esistono campi deprecati, percorsi di fallback o mappature legacy.

---

## 1. Struttura generale

Il CDU è articolato in sei sezioni di primo livello:

| Sezione | Scopo |
| :--- | :--- |
| **`meta`** | Dati tecnici dell'operazione: timestamp, ID esecuzione, date formattate, configurazione box e parametri di input. |
| **`istituto`** | Dati globali dell'istituzione scolastica: dirigenti, ruoli di staff e statistiche d'istituto. |
| **`focus`** | Il cuore dei dati di business oggetto dell'operazione: classe focalizzata (`focus.classe`), eventuale alunno (`focus.alunno`), singolo piano personalizzato (`focus.piano`), singola carenza (`focus.carenza`). |
| **`destinatario`** | Dati anagrafici, ruoli, permessi e saluti specifici per il destinatario della mail o del documento generato. |
| **`render`** | HTML pre-renderizzato dei box di testo dinamici (utilizzato unicamente nella pipeline email). |
| **`tech`** | Riferimenti agli oggetti vivi di dominio e servizi (non serializzati, protetti tramite `enumerable: false`). |

---

## 2. Sezione `meta`

Contiene i metadati di contesto per l'esecuzione corrente.

```yaml
meta:
  timestamp: string               # ISO 8601 del momento di costruzione del CDU (es. "2026-03-30T10:15:30.000Z")
  idConfigurazione: string        # ID del record CONF_DOC o CONF_MAIL attivo (es. "VERBALE_CDC", "CDC_NOTIFICA")
  tipoOperazione: string          # "GENERAZIONE_DOCUMENTO" | "INVIO_NOTIFICA"
  idEsecuzione: string            # UUID univoco del job corrente

  date:
    oggi:
      breve: string               # "DD/MM/YYYY" (es. "30/03/2026")
      estesa: string              # "DD mese YYYY" (es. "30 marzo 2026")
      iso: string                 # "YYYY-MM-DD"
      giorno: string              # "DD"
      mese: string                # "MM"
      anno: string                # "YYYY"
      ora: string                 # "HH:MM"

  configurazioneBox:
    boxAttivi: string[]           # Array di ID dei box di contenuto abilitati
    boxVuotiNascosti: string[]    # Array di ID dei box nascosti poiché privi di dati
    ordineVisualizzazione: string[] # Ordine sequenziale di rendering dei box

  parametriInput:
    target: string                # Identificativo target (es. "5AB-LC-LS", "mario.rossi@alunni.edu.it")
    tipoTarget: string            # "classe" | "alunno" | "docente"
    materiaCorrente: string | null # MateriaId di contesto (se l'operazione è specifica per una cattedra)
    opzioni:
      includiStorico: boolean          # Abilita il caricamento dei blocchi storico/continuità (default: false)
      profonditaAnniStorico: number    # Anni di storico da recuperare (default: 2, max: ANNO - 1)
      profonditaAnniAsl: number        # Anni di tracciamento ASL/PCTO
      profonditaAnniDocumenti: number  # Anni di tracciamento documenti pregressi
      includiSupplenti: boolean        # Risoluzione supplenze attive alla data
      includiSpecificita: boolean      # Abilita focus.classe.studenti.perSpecificita
      includiPartnerDettaglio: boolean # Abilita la proiezione disaggregata focus.classe.partner per classi articolate
      notificaSoloCoordinatori: boolean
```

---

## 3. Sezione `istituto`

Contiene i dati anagrafici ed organizzativi generali dell'istituto scolastico, forniti dal `SchoolProvider`.

```yaml
istituto:
  organizzazione:
    annoScolastico: string       # es. "2025-2026"
    dirigente:
      nomeCompleto: string       # Formato testuale per atti (es. "Prof.ssa Maria Bianchi")

  staff:
    referenteBes: PersonVM | null       # Oggetto Persona standardizzato (§8.1)
    animatoreDigitale: PersonVM | null  # Oggetto Persona standardizzato (§8.1)

  statistiche:
    totaleClassi: number
    totaleDocenti: number
    totaleAlunni: number
```

---

## 4. Sezione `focus`

Rappresenta il nucleo principale del CDU. A seconda della *recipe* attivata dal motore di contesto, compila i dati di classe, alunno, piano personalizzato o carenza.

### 4.1 `focus.classe`

Contiene la vista completa della classe scolastica focalizzata.

```yaml
focus.classe:
  anagrafica:
    nome: string                 # es. "5AB-LC-LS" o "4A"
    anno: number                 # 1–5 (anno di corso)
    sezione: string              # es. "A", "AB"
    indirizzo:
      sigla: string              # es. "LC"
      nome: string               # es. "Liceo Classico"
      nomeSintetico: string      # es. "Classico"
      tipo: string               # es. "LICEO" | "TECNICO" | "PROFESSIONALE" | "ITP" | "IEFP"

  flags:
    isClassePrima: boolean
    isTriennio: boolean
    isPrimoBiennio: boolean
    isTerminale: boolean         # true se classe di esito finale (es. 5° anno o 3° IEFP)
    isArticolata: boolean        # true se classe composta da più indirizzi partner

  # ARTICOLAZIONE STRUTTURALE (Classi Articolate)
  articolazione:                 # Sempre presente; null se isArticolata = false
    partner: string | null       # Per classe partner: ID dell'altro partner; per classe parent: null
    partners: string[] | null    # Per classe parent: ID delle sottoclassi [primo, secondo]; altrimenti null
    parent:                      # Oggetto parent descrittivo (null se classe non articolata)
      id: string                 # ID classe parent (es. "5AB-LC-LS")
      anno: number               # es. 5
      indirizzi:                 # Array degli indirizzi partner componenti
        - sigla: string
          nome: string
          nomeSintetico: string
          tipo: string
    materieCondivise: SubjectVM[]            # Materie frequentate dall'intero gruppo classe
    materieSeparatePrimoGruppo: SubjectVM[]  # Materie esclusive del primo partner
    materieSeparateSecondoGruppo: SubjectVM[]# Materie esclusive del secondo partner

  # PROIEZIONE DISAGGREGATA PARTNER
  partner:                       # Presente solo se isArticolata = true e includiPartnerDettaglio = true
    primo: SingleClassProjection # Proiezione completa (anagrafica, CDC, studenti, coordinatori) del 1° partner
    secondo: SingleClassProjection# Proiezione completa del 2° partner

  # ANAGRAFICA DOCENTI E RUOLI SPECIALI (Formato PersonVM §8.1)
  coordinatori: PersonVM[]       # Elenco coordinatori con materia e proprieta gender-aware
  coordinatoriMetadata:
    appellativoPlurale: string   # "prof.sse" se tutte F, altrimenti "prof."
    articoloPlurale: string      # "le" se tutte F, altrimenti "i"
    coordinatorePlurale: string  # "coordinatrici" se tutte F, altrimenti "coordinatori"

  tutor:
    asl: PersonVM[]              # Tutor PCTO/ASL di classe
    orientamento: PersonVM[]     # Tutor per l'orientamento
  tutorMetadata:
    appellativoPlurale: string   # "prof.sse" | "prof."
    articoloPlurale: string      # "le" | "i"
    tutorPlurale: string         # "tutor"

  rappresentanti:
    studenti:
      - nomeCompleto: string
        email: string
    genitori:
      - nomeCompleto: string     # Nome libero da ALUNNI.RAPPR_GEN (senza email)

  # CONSIGLIO DI CLASSE COMPLETO
  consiglioDiClasse:
    - anagrafica: PersonVM       # Oggetto Persona standardizzato (§8.1)
      materie: SubjectVM[]       # Materie insegnate da QUESTO docente in questa classe (con per-subject isITP)
      ruoli:
        isCoordinatore: boolean
        isTutorAsl: boolean
        isTutorOrientamento: boolean
        descrizione: string[]    # Array di stringhe descrittive: ["Coordinatore", "Tutor ASL", "Docente"]
      stato:
        isSupplente: boolean
        sostituisce: PersonVM | null # Docente titolare sostituito (se supplenza attiva)
      tipoArticolazione: string | null # "COMUNE" | "SEPARATO_PRIMO" | "SEPARATO_SECONDO" | null
      isITP: boolean             # Aggregato booleano: true se docente ITP in ALMENO una materia assegnata
      flags:
        isNotLast: boolean       # Convenience flag per loop Mustache

  # CATALOGO MATERIE DI CLASSE (Tutte le materie attive)
  materie: SubjectVM[]           # Array piatto di tutte le materie della classe (§8.2), ciascuna recante:
                                 #   - docenti: PersonVM[] assegnati
                                 #   - hasItp: boolean (true se la cattedra ha colonna .itp popolata)
                                 #   - continuita: ContinuitaVM (§8.3) (se includiStorico = true)

  materiePerPrincipale:          # Materie raggruppate per materia principale/fittizia (§8.2)
    - idFittizio: string         # ID materia base (es. "INTERPRETAZIONE" o "ITA")
      nome: string               # Nome principale (es. "Esecuzione ed interpretazione" o "Italiano")
      materie: SubjectVM[]       # Array delle specificita (es. Chitarra, Flauto) o singola materia base

  # SEZIONE ESAME DI STATO
  esame:                         # Presente per classi terminali (oppure vuoto se non vi sono materie esame)
    materie:
      - SubjectVM                # Oggetto Materia arricchito con:
        prova: string            # "PRIMA_PROVA" | "SECONDA_PROVA"
        docenti: PersonVM[]      # Docenti assegnati alla prova
    docenti:
      - PersonVM                 # Oggetto Docente arricchito con:
        prova: string            # "PRIMA_PROVA" | "SECONDA_PROVA"
        materie: SubjectVM[]     # Materie d'esame insegnate dal docente

  # PROGETTI ED ATTIVITÀ EXTRACURRICOLARI (da Tabella PROGETTI)
  hasProgetti: boolean           # true se il blocco progetti contiene almeno un elemento
  progetti: ProgettoVM[]         # Progetti dell'anno scolastico corrente (§8.5)

  # STORICO CLASSE PREGRESSO (da CLASSI.STORICO)
  storico: ClasseStoricoVM | null # Dati aggregati dei 2 anni precedenti (§8.4) (se includiStorico = true)

  # ANAGRAFICA E PROFILO ALUNNI
  studenti:
    listaCompleta:
      - anagrafica:
          nomeCompleto: string
          email: string
        status:
          isBes: boolean
          isRipetente: boolean
          isRappresentante: boolean
          religione: string      # "IRC" | "ALT" | "NO"
        curriculum:
          "[MateriaId]":
            specifiche: string[] # specificita scelte dall'alunno (es. ["chitarra"])
        didattica:
          carenze:
            hasCarenze: boolean
            numero: number
            dettaglio:
              - materia: string  # Sigla materia
                voto: string     # Valutazione/nota
          piani:
            hasPiani: boolean
            hasBes: boolean
            items:
              - tipo: string     # Enum TipoPiano (PDP_DSA, PEI, ecc.)
                isBes: boolean
          pcto:
            oreCumulate: number
        storico: StudentStoricoVM | null # Storico e bocciature dell'alunno (§8.4) (se includiStorico = true)

    statistiche:
      totale: number
      conPianiDidattici: number
      conBes: number
      conDsa: number
      ripetenti: number
      rappresentanti: number

    perSpecificita:              # Presente solo se includiSpecificita = true
      "[MateriaId]":
        "[specifica]":
          - PersonVM             # Alunni iscritti a quella specificita

  elencoMaterieConPermessi: []   # Assente o array per espansione permessi granulari (vedi MAT_NON_STANDARD.md)
```

---

### 4.2 `focus.alunno`

Contiene i dati di dettaglio del singolo studente su cui è focalizzata l'operazione (es. notifica alla famiglia, PDP, carenza).

```yaml
focus.alunno:
  anagrafica:
    nomeCompleto: string
    email: string

  status:
    religione: string            # "IRC" | "ALT" | "NO"
    isBes: boolean
    isRipetente: boolean
    isRappresentante: boolean

  curriculum:
    "[MateriaId]":
      specifiche: string[]       # specificita frequentate (es. ["chitarra", "flauto"])

  classe:
    nome: string                 # Nome classe partner se articolata, altrimenti nome classe standard
    indirizzoSigla: string
    indirizzoNome: string

  # CDC FILTRATO SUL CURRICULUM E RELIGIONE DELL'ALUNNO
  consiglioDiClasseFiltrato:
    - anagrafica: PersonVM
      materie: SubjectVM[]       # Solo le materie ed iscrizioni specificita FREQUENTATE dall'alunno
      ruoli:
        isCoordinatore: boolean
        isTutorAsl: boolean
        isTutorOrientamento: boolean
        descrizione: string[]
      stato:
        isSupplente: boolean
        sostituisce: PersonVM | null
      tipoArticolazione: string | null
      isITP: boolean
      flags:
        isNotLast: boolean

  didattica:
    carenze:
      hasCarenze: boolean
      numero: number
      dettaglio:
        - materia: string        # Sigla materia
          voto: string           # Valutazione o giudizio sintetico
    asl:
      oreCumulate: number
      oreAnnoCorrente: number
    piani:
      hasPiani: boolean
      hasBes: boolean
      items:
        - tipo: string           # Enum TipoPiano (es. "PDP_DSA", "PEI")
          isBes: boolean
          link: string           # URL Drive del documento firmato/generato
          parametriGenerazione: object # JSON libero da PIANI.PARAMETRI
    documenti:
      hasDocumenti: boolean
      items:
        - nome: string
          link: string
          tipo: string
          idGen: string
          stato: string
          dataCreazione: string
      storico:                   # LazyRef caricato se includiStorico = true
        - anno: string
          nome: string
          link: string
          tipo: string

  # STORICO ANNI PRECEDENTI DELL'ALUNNO (Sostituisce il vecchio didattica.storico)
  storico: StudentStoricoVM | null # Dettaglio esiti, bocciature e piani dei 2 anni precedenti (§8.4)
```

---

### 4.3 `focus.piano`

Presente unicamente nelle execution recipe relative a `PIANO_PERSONALIZZATO` (generazione PDP/PEI/PFP).

```yaml
focus.piano:
  tipo: string                   # Enum TipoPiano della riga focalizzata (es. "PDP_DSA", "PEI")
  parametriGenerazione: object   # Oggetto JSON decodificato direttamente da PIANI.PARAMETRI
```

> **REGOLE DI GENERAZIONE DOCUMENTI PIANI PERSONALIZZATI:**
> Il record `CONF_DOC.ID = PIANI_PERSONALIZZATI` (con `TIPO = PIANO_PERS`) è il generatore unico per tutti i piani. Seleziona il template Drive valutando `focus.piano.tipo` nei 5 rami di `MODELLI`. Il valore `focus.piano.tipo` viene trascritto direttamente in `LOG_DOCS.SOTTOTIPO`.

---

### 4.4 `focus.carenza`

Presente unicamente nelle notifiche di carenza/pagellino (`CARENZA_COMPLETO`).

```yaml
focus.carenza:
  studente: string               # Email dello studente
  progressivo: number            # PROGRESSIVO della riga CARENZE
  data: string                   # Data della rilevazione ("YYYY-MM-DD")
  classe: string                 # ClasseId al momento della rilevazione
  hasAssenze: boolean            # Flag assenze elevate
  note: string                   # Note del consiglio di classe
```

---

## 5. Sezione `destinatario`

Popolata dal `BuildCDUStep` per personalizzare l'invio della notifica o la copia riservata.

```yaml
destinatario:
  anagrafica: PersonVM           # Dati anagrafici standardizzati (§8.1) del destinatario

  ruoliAttivi: string[]          # Ruoli esercitati nel contesto (es. ["COORDINATORE", "DOCENTE"])

  flags:
    isCoordinatore: boolean
    isTutor: boolean
    isTutorAsl: boolean
    isDocenteSostegno: boolean
    isSupplente: boolean

  contesto:
    sostituisce: PersonVM | null # Se il destinatario è un supplente, indica il titolare
    classiCompetenza: string[]   # Array di ClasseId su cui il destinatario ha titolarità
    materieCompetenza: string[]  # Array di MateriaId insegnate dal destinatario

  comunicazione:
    salutoIniziale: string       # es. "Gentile Prof.ssa Bianchi," o "Spettabile Genitore,"
    oggettoCalcolato: string     # Oggetto email finale processato tramite template engine
    testoContenutoPuro: string   # Testo plain-text senza wrapper HTML (per audit log)
```

---

## 6. Sezione `render`

Presente esclusivamente nella pipeline notifiche email. Contiene l'HTML pre-renderizzato dai singoli renderer di box.

```yaml
render:
  boxes:
    "[TIPO_BOX]":
      id: string                 # ID del box (es. "BOX_CARENZE", "BOX_PCTO")
      titolo: string             # Titolo dinamico del box
      html: string               # HTML interno renderizzato dal BoxRenderer
      isEmpty: boolean           # true se il box non contiene dati da visualizzare
      visibile: boolean          # true se il box deve essere mostrato nell'email

  body:
    htmlCompleto: string         # Documento HTML finale (Header + Box Attivi + Footer)
    htmlSoloContenuto: string    # Solo il blocco div centrale del contenuto
```

---

## 7. Sezione `tech`

Contiene riferimenti ad oggetti complessi di dominio e servizi Google Apps Script.
**Proprietà non enumerabile:** La sezione `tech` viene dichiarata tramite `Object.defineProperty(cdu, 'tech', { enumerable: false, writable: true })`. Non viene MAI inclusa in `JSON.stringify(cdu)`, prevenendo cicli di serializzazione e log ridondanti.

```yaml
tech:
  entita:
    classe: object               # Istanza della classe di dominio Classe
    alunno: object               # Istanza della classe di dominio Alunno
    docente: object              # Istanza della classe di dominio Docente
    patternEmail: object         # Istanza ConfigurazioneEmail
    documentoMetadato: object    # Istanza ConfigurazioneDocumento
  servizi: object[]              # Riferimenti ai servizi di contesto
  pipeline:
    statoCorrente: string
    stepEseguiti: string[]
    errori: string[]
    logEsecuzione: string[]
```

---

## 8. Specifiche dettagliate dei View Model condivisi

### 8.1 Person View Model (`PersonVM`)

Ogni docente, tutor, coordinatore, referente o membro dello staff esposto nel CDU DEVE conformarsi alla struttura seguente. Il builder gestisce la declinazione grammaticale del genere e dei titoli.

```yaml
PersonVM:
  nome: string                   # es. "Mario"
  cognome: string | null         # es. "Rossi" (null per esperti esterni senza cognome separato)
  email: string | null           # Email RFC 5321 (null per esperti esterni)
  genere: string | null          # "M" | "F" | null
  appellativo: string | null     # "Prof." (se M) | "Prof.ssa" (se F) | null
  articolo: string | null        # "il" (se M) | "la" (se F) | null
  coordinatore: string | null    # "coordinatore" (se M) | "coordinatrice" (se F) | null
  nomeCompleto: string           # "Mario Rossi" oppure rag. sociale esperto esterno
  materia: string | null         # Inserito opzionalmente quando la persona è legata ad una cattedra
```

#### Regole per la gestione dei plurali nei contenitori di persone
Quando si assemblano liste di persone (es. `coordinatoriMetadata`, `tutorMetadata`), le proprieta collettive si calcolano nel seguente modo:
- **Tutti i componenti di genere femminile (`"F"`):**
  - `appellativoPlurale`: `"prof.sse"`
  - `articoloPlurale`: `"le"`
  - `coordinatorePlurale`: `"coordinatrici"`
- **Almeno un componente di genere maschile (`"M"`) o lista mista:**
  - `appellativoPlurale`: `"prof."`
  - `articoloPlurale`: `"i"`
  - `coordinatorePlurale`: `"coordinatori"`

---

### 8.2 Subject View Model (`SubjectVM`)

Ogni materia esposta nel CDU (in `focus.classe.materie[]`, `consiglioDiClasse[].materie[]`, `articolazione`, `esame`) adotta lo schema unificato seguente. Il resolver di materia applica le regole di **`MATERIE.EVOLUZIONE`** rispetto all'anno di corso della classe (`ANNO`).

```yaml
SubjectVM:
  sigla: string                  # Sigla canonica per l'anno corrente (da MATERIE.SIGLA o id)
  nome: string                   # Nome esteso (da MATERIE.NOME o "PRINCIPALE (SPECIFICA)")
  nomeSintetico: string          # Nome abbreviato (da MATERIE.SINTESI)
  colore1: string                # Hex colore primario (da MATERIE.COLORE_1)
  colore2: string                # Hex colore secondario (da MATERIE.COLORE_2)
  isMateriaPrimaProva: boolean   # true se la materia è in prima_prova per l'indirizzo in MATERIE.ESAME_CFG
  isMateriaSecondaProva: boolean # true se la materia è in seconda_prova per l'indirizzo in MATERIE.ESAME_CFG
  principale: string | null      # Descrizione materia principale (da MATERIE.PRINCIPALE, solo per specificita X.Y)
  specificita: string | null     # Nome disciplina/strumento (da MATERIE.SPECIFICA, solo per specificita X.Y)
  isITP: boolean                 # true se la materia è insegnata in un contesto di laboratorio ITP (.itp)
  hasItp: boolean                # Presente in focus.classe.materie[]: true se esiste colonna .itp popolata
  evoluzione:                    # Tracciamento storicizzazione sigle (da MATERIE.EVOLUZIONE)
    siglePrecedenti:
      - sigla: string            # Sigla usata negli anni precedenti (es. "GST")
        nome: string | null      # Nome associato alla sigla precedente (es. "Storia e Geografia")
        anni: number[]           # Anni di corso in cui si usava la sigla (es. [1, 2])
  # CAMPI OPZIONALI DI CONTESTO:
  docenti: PersonVM[]            # Docenti assegnati alla materia (popolato in focus.classe.materie[])
  continuita: ContinuitaVM       # Storico docenza (popolato in focus.classe.materie[] se includiStorico = true)
```

---

### 8.3 Teaching Continuity View Model (`ContinuitaVM`)

Presente su ciascuna materia in `focus.classe.materie[].continuita` quando la recipe attiva `includiStorico = true`.

```yaml
ContinuitaVM:
  docentiAnniPrecedenti:
    - annoIndietro: number       # 1 = anno immediatamente precedente, 2 = due anni fa
      annoScolastico: string     # es. "2024-2025"
      titolare: PersonVM | null  # Docente titolare principale in quell'anno (od il reconciled EVOLUZIONE)
      itp: PersonVM | null       # Docente ITP in quell'anno (PRESENTE SOLO SE hasItp = true per la materia)

  continuitaUltimiTreAnni: boolean # true sse lo STESSO titolare (email) ha insegnato nell'anno corrente, -1 e -2
  continuitaUltimiDueAnni: boolean # true sse lo STESSO titolare (email) ha insegnato nell'anno corrente e -1

  # CAMPI ESCLUSIVI PER MATERIE CON ITP (hasItp = true):
  continuitaUltimiTreAnniItp: boolean # true sse lo STESSO ITP (email) ha insegnato nell'anno corrente, -1 e -2
  continuitaUltimiDueAnniItp: boolean # true sse lo STESSO ITP (email) ha insegnato nell'anno corrente e -1
```

> **Note di calcolo della continuità:**
> 1. La ricerca risale la catena dei nomi classe storici definiti in `CLASSI.STORICO`.
> 2. Se una materia ha cambiato sigla (es. da `GST` a `STO`), il match tra cattedre degli anni precedenti avviene tramite riconciliazione su `MATERIE.EVOLUZIONE`.
> 3. Se `hasItp = false`, i campi `itp` all'interno di `docentiAnniPrecedenti` e i booleans `*Itp` NON vengono generati.

---

### 8.4 View Model Storici (`ClasseStoricoVM` & `StudentStoricoVM`)

#### Storico Classe (`focus.classe.storico`)
Caricato pigramente via `LazyRef` per i 2 anni precedenti quando `includiStorico = true`.

```yaml
ClasseStoricoVM:
  statistiche:
    - annoScolastico: string     # es. "2024-2025"
      classe: string             # Nome della classe in quell'anno (da CLASSI.STORICO)
      statistiche:
        totale: number
        conPianiDidattici: number
        conBes: number
        conDsa: number
        ripetenti: number
        rappresentanti: number

  progetti:
    - annoScolastico: string
      classe: string
      progetti: ProgettoVM[]     # Progetti svolti dalla classe in quell'anno scolastico
```

#### Storico Alunno (`focus.alunno.storico` e `focus.classe.studenti.listaCompleta[].storico`)

```yaml
StudentStoricoVM:
  anni:
    - annoScolastico: string     # es. "2024-2025"
      classe: string             # Classe frequentata nell'anno
      esito: string              # "PROMOSSO" | "NON_PROMOSSO" | "RITIRATO" | "SCONOSCIUTO"
  pianiPrimoAnnoPrecedente: string[]  # Array di TipoPiano attivi nell'anno n-1 (es. ["PDP_DSA"])
  pianiSecondoAnnoPrecedente: string[]# Array di TipoPiano attivi nell'anno n-2
  bocciature:
    - annoScolastico: string     # Anno in cui l'alunno non e stato promosso
      classe: string             # Classe in cui e avvenuta la bocciatura
  hasBocciature: boolean         # true se l'array bocciature contiene almeno un elemento
```

---

### 8.5 Project View Model (`ProgettoVM`)

Popolato da `ProgettiProvider` leggendo la tabella `PROGETTI` per la classe focalizzata.

```yaml
ProgettoVM:
  tipo: string                   # "ASL" | "ORIENTAMENTO" | "ALTRO"
  nome: string                   # Titolo del progetto/percorso
  referente: PersonVM            # Oggetto Persona standardizzato (§8.1) per il docente o esperto esterno
  ore: number                    # Monte ore totale del progetto
  oreAsl: number                 # Ore valide ai fini PCTO/ASL
  isAsl: boolean                 # Convenience flag: true sse tipo == "ASL"
```

---

## 9. Esempio Completo JSON di un CDU assemblato

```json
{
  "meta": {
    "timestamp": "2026-03-30T10:00:00.000Z",
    "idConfigurazione": "VERBALE_CDC",
    "tipoOperazione": "GENERAZIONE_DOCUMENTO",
    "idEsecuzione": "EXEC-2026-99812",
    "date": {
      "oggi": {
        "breve": "30/03/2026",
        "estesa": "30 marzo 2026",
        "iso": "2026-03-30",
        "giorno": "30",
        "mese": "03",
        "anno": "2026",
        "ora": "10:00"
      }
    },
    "configurazioneBox": {
      "boxAttivi": [],
      "boxVuotiNascosti": [],
      "ordineVisualizzazione": []
    },
    "parametriInput": {
      "target": "5AB-LC-LS",
      "tipoTarget": "classe",
      "materiaCorrente": null,
      "opzioni": {
        "includiStorico": true,
        "profonditaAnniStorico": 2,
        "profonditaAnniAsl": 3,
        "profonditaAnniDocumenti": 1,
        "includiSupplenti": true,
        "includiSpecificita": false,
        "includiPartnerDettaglio": true,
        "notificaSoloCoordinatori": false
      }
    }
  },
  "istituto": {
    "organizzazione": {
      "annoScolastico": "2025-2026",
      "dirigente": {
        "nomeCompleto": "Prof.ssa Maria Bianchi"
      }
    },
    "staff": {
      "referenteBes": {
        "nome": "Mario",
        "cognome": "Rossi",
        "email": "mario.rossi@scuola.edu.it",
        "genere": "M",
        "appellativo": "Prof.",
        "articolo": "il",
        "coordinatore": "coordinatore",
        "nomeCompleto": "Mario Rossi",
        "materia": null
      },
      "animatoreDigitale": null
    },
    "statistiche": {
      "totaleClassi": 32,
      "totaleDocenti": 84,
      "totaleAlunni": 650
    }
  },
  "focus": {
    "classe": {
      "anagrafica": {
        "nome": "5AB-LC-LS",
        "anno": 5,
        "sezione": "AB",
        "indirizzo": {
          "sigla": "LC",
          "nome": "Liceo Classico",
          "nomeSintetico": "Classico",
          "tipo": "LICEO"
        }
      },
      "flags": {
        "isClassePrima": false,
        "isTriennio": true,
        "isPrimoBiennio": false,
        "isTerminale": true,
        "isArticolata": true
      },
      "articolazione": {
        "partner": null,
        "partners": ["5A-LC", "5B-LS"],
        "parent": {
          "id": "5AB-LC-LS",
          "anno": 5,
          "indirizzi": [
            { "sigla": "LC", "nome": "Liceo Classico", "nomeSintetico": "Classico", "tipo": "LICEO" },
            { "sigla": "LS", "nome": "Liceo Scientifico", "nomeSintetico": "Scientifico", "tipo": "LICEO" }
          ]
        },
        "materieCondivise": [
          {
            "sigla": "ITA",
            "nome": "Lingua e letteratura italiana",
            "nomeSintetico": "Italiano",
            "colore1": "#005A9C",
            "colore2": "#E6F0FA",
            "isMateriaPrimaProva": true,
            "isMateriaSecondaProva": false,
            "principale": null,
            "specificita": null,
            "isITP": false,
            "hasItp": false,
            "evoluzione": null
          }
        ],
        "materieSeparatePrimoGruppo": [
          {
            "sigla": "GRE",
            "nome": "Lingua e cultura greca",
            "nomeSintetico": "Greco",
            "colore1": "#4B0082",
            "colore2": "#E6E6FA",
            "isMateriaPrimaProva": false,
            "isMateriaSecondaProva": true,
            "principale": null,
            "specificita": null,
            "isITP": false,
            "hasItp": false,
            "evoluzione": null
          }
        ],
        "materieSeparateSecondoGruppo": [
          {
            "sigla": "MAT",
            "nome": "Matematica e Fisica",
            "nomeSintetico": "Matematica",
            "colore1": "#008000",
            "colore2": "#E8F8E8",
            "isMateriaPrimaProva": false,
            "isMateriaSecondaProva": true,
            "principale": null,
            "specificita": null,
            "isITP": false,
            "hasItp": false,
            "evoluzione": null
          }
        ]
      },
      "coordinatori": [
        {
          "nome": "Laura",
          "cognome": "Gialli",
          "email": "laura.gialli@scuola.edu.it",
          "genere": "F",
          "appellativo": "Prof.ssa",
          "articolo": "la",
          "coordinatore": "coordinatrice",
          "nomeCompleto": "Laura Gialli",
          "materia": "Greco"
        }
      ],
      "coordinatoriMetadata": {
        "appellativoPlurale": "prof.sse",
        "articoloPlurale": "le",
        "coordinatorePlurale": "coordinatrici"
      },
      "tutor": {
        "asl": [],
        "orientamento": []
      },
      "tutorMetadata": {
        "appellativoPlurale": "prof.",
        "articoloPlurale": "i",
        "tutorPlurale": "tutor"
      },
      "rappresentanti": {
        "studenti": [
          { "nomeCompleto": "Marco Neri", "email": "marco.neri@alunni.edu.it" }
        ],
        "genitori": [
          { "nomeCompleto": "Giuseppe Neri" }
        ]
      },
      "consiglioDiClasse": [
        {
          "anagrafica": {
            "nome": "Mario",
            "cognome": "Rossi",
            "email": "mario.rossi@scuola.edu.it",
            "genere": "M",
            "appellativo": "Prof.",
            "articolo": "il",
            "coordinatore": "coordinatore",
            "nomeCompleto": "Mario Rossi",
            "materia": null
          },
          "materie": [
            {
              "sigla": "ITA",
              "nome": "Lingua e letteratura italiana",
              "nomeSintetico": "Italiano",
              "colore1": "#005A9C",
              "colore2": "#E6F0FA",
              "isMateriaPrimaProva": true,
              "isMateriaSecondaProva": false,
              "principale": null,
              "specificita": null,
              "isITP": false,
              "hasItp": false,
              "evoluzione": null
            }
          ],
          "ruoli": {
            "isCoordinatore": false,
            "isTutorAsl": false,
            "isTutorOrientamento": false,
            "descrizione": ["Docente"]
          },
          "stato": {
            "isSupplente": false,
            "sostituisce": null
          },
          "tipoArticolazione": "COMUNE",
          "isITP": false,
          "flags": {
            "isNotLast": true
          }
        }
      ],
      "materie": [
        {
          "sigla": "STO",
          "nome": "Storia",
          "nomeSintetico": "Storia",
          "colore1": "#A52A2A",
          "colore2": "#F5DEB3",
          "isMateriaPrimaProva": false,
          "isMateriaSecondaProva": false,
          "principale": null,
          "specificita": null,
          "isITP": false,
          "hasItp": false,
          "evoluzione": {
            "siglePrecedenti": [
              { "sigla": "GST", "nome": "Storia e Geografia", "anni": [1, 2] }
            ]
          },
          "docenti": [
            {
              "nome": "Mario",
              "cognome": "Rossi",
              "email": "mario.rossi@scuola.edu.it",
              "genere": "M",
              "appellativo": "Prof.",
              "articolo": "il",
              "coordinatore": "coordinatore",
              "nomeCompleto": "Mario Rossi",
              "materia": null
            }
          ],
          "continuita": {
            "docentiAnniPrecedenti": [
              {
                "annoIndietro": 1,
                "annoScolastico": "2024-2025",
                "titolare": {
                  "nome": "Mario",
                  "cognome": "Rossi",
                  "email": "mario.rossi@scuola.edu.it",
                  "genere": "M",
                  "appellativo": "Prof.",
                  "articolo": "il",
                  "coordinatore": "coordinatore",
                  "nomeCompleto": "Mario Rossi",
                  "materia": null
                }
              },
              {
                "annoIndietro": 2,
                "annoScolastico": "2023-2024",
                "titolare": {
                  "nome": "Mario",
                  "cognome": "Rossi",
                  "email": "mario.rossi@scuola.edu.it",
                  "genere": "M",
                  "appellativo": "Prof.",
                  "articolo": "il",
                  "coordinatore": "coordinatore",
                  "nomeCompleto": "Mario Rossi",
                  "materia": null
                }
              }
            ],
            "continuitaUltimiTreAnni": true,
            "continuitaUltimiDueAnni": true
          }
        }
      ],
      "materiePerPrincipale": [
        {
          "idFittizio": "STO",
          "nome": "Storia",
          "materie": [
            {
              "sigla": "STO",
              "nome": "Storia",
              "nomeSintetico": "Storia",
              "colore1": "#A52A2A",
              "colore2": "#F5DEB3",
              "isMateriaPrimaProva": false,
              "isMateriaSecondaProva": false,
              "principale": null,
              "specificita": null,
              "isITP": false,
              "hasItp": false,
              "evoluzione": null
            }
          ]
        }
      ],
      "esame": {
        "materie": [
          {
            "sigla": "ITA",
            "nome": "Lingua e letteratura italiana",
            "nomeSintetico": "Italiano",
            "colore1": "#005A9C",
            "colore2": "#E6F0FA",
            "isMateriaPrimaProva": true,
            "isMateriaSecondaProva": false,
            "principale": null,
            "specificita": null,
            "isITP": false,
            "hasItp": false,
            "evoluzione": null,
            "prova": "PRIMA_PROVA",
            "docenti": [
              {
                "nome": "Mario",
                "cognome": "Rossi",
                "email": "mario.rossi@scuola.edu.it",
                "genere": "M",
                "appellativo": "Prof.",
                "articolo": "il",
                "coordinatore": "coordinatore",
                "nomeCompleto": "Mario Rossi",
                "materia": null
              }
            ]
          }
        ],
        "docenti": [
          {
            "nome": "Mario",
            "cognome": "Rossi",
            "email": "mario.rossi@scuola.edu.it",
            "genere": "M",
            "appellativo": "Prof.",
            "articolo": "il",
            "coordinatore": "coordinatore",
            "nomeCompleto": "Mario Rossi",
            "materia": null,
            "prova": "PRIMA_PROVA",
            "materie": [
              {
                "sigla": "ITA",
                "nome": "Lingua e letteratura italiana",
                "nomeSintetico": "Italiano",
                "colore1": "#005A9C",
                "colore2": "#E6F0FA",
                "isMateriaPrimaProva": true,
                "isMateriaSecondaProva": false,
                "principale": null,
                "specificita": null,
                "isITP": false,
                "hasItp": false,
                "evoluzione": null
              }
            ]
          }
        ]
      },
      "hasProgetti": true,
      "progetti": [
        {
          "tipo": "ASL",
          "nome": "PCTO - Tirocinio Biblioteca",
          "referente": {
            "nome": "Anna",
            "cognome": "Ferrari",
            "email": "anna.ferrari@scuola.edu.it",
            "genere": "F",
            "appellativo": "Prof.ssa",
            "articolo": "la",
            "coordinatore": "coordinatrice",
            "nomeCompleto": "Anna Ferrari",
            "materia": null
          },
          "ore": 30,
          "oreAsl": 30,
          "isAsl": true
        }
      ],
      "storico": {
        "statistiche": [
          {
            "annoScolastico": "2024-2025",
            "classe": "4AB-LC-LS",
            "statistiche": { "totale": 24, "conPianiDidattici": 2, "conBes": 2, "conDsa": 1, "ripetenti": 0, "rappresentanti": 2 }
          }
        ],
        "progetti": [
          {
            "annoScolastico": "2024-2025",
            "classe": "4AB-LC-LS",
            "progetti": []
          }
        ]
      },
      "studenti": {
        "listaCompleta": [
          {
            "anagrafica": {
              "nomeCompleto": "Marco Neri",
              "email": "marco.neri@alunni.edu.it"
            },
            "status": {
              "isBes": false,
              "isRipetente": false,
              "isRappresentante": true,
              "religione": "IRC"
            },
            "curriculum": {},
            "didattica": {
              "carenze": { "hasCarenze": false, "numero": 0, "dettaglio": [] },
              "piani": { "hasPiani": false, "hasBes": false, "items": [] },
              "pcto": { "oreCumulate": 60 }
            },
            "storico": {
              "anni": [
                { "annoScolastico": "2024-2025", "classe": "4A-LC", "esito": "PROMOSSO" }
              ],
              "pianiPrimoAnnoPrecedente": [],
              "pianiSecondoAnnoPrecedente": [],
              "bocciature": [],
              "hasBocciature": false
            }
          }
        ],
        "statistiche": {
          "totale": 24,
          "conPianiDidattici": 2,
          "conBes": 2,
          "conDsa": 1,
          "ripetenti": 0,
          "rappresentanti": 2
        }
      }
    }
  },
  "destinatario": {
    "anagrafica": {
      "nome": "Mario",
      "cognome": "Rossi",
      "email": "mario.rossi@scuola.edu.it",
      "genere": "M",
      "appellativo": "Prof.",
      "articolo": "il",
      "coordinatore": "coordinatore",
      "nomeCompleto": "Mario Rossi",
      "materia": null
    },
    "ruoliAttivi": ["DOCENTE"],
    "flags": {
      "isCoordinatore": false,
      "isTutor": false,
      "isTutorAsl": false,
      "isDocenteSostegno": false,
      "isSupplente": false
    },
    "contesto": {
      "sostituisce": null,
      "classiCompetenza": ["5AB-LC-LS"],
      "materieCompetenza": ["ITA", "STO"]
    },
    "comunicazione": {
      "salutoIniziale": "Gentile Prof. Rossi,",
      "oggettoCalcolato": "Convocazione CDC 5AB-LC-LS",
      "testoContenutoPuro": ""
    }
  },
  "render": {
    "boxes": {},
    "body": {
      "htmlCompleto": "",
      "htmlSoloContenuto": ""
    }
  }
}
```

---

## 10. Mappatura Mappers & Regole di Validazione

1. **Assenza di Legacy Mapping:** Qualsiasi tentativo di accedere a vecchie proprietà (es. `studenti.perIndirizzo`, `studenti.indirizziPresenti`, `didattica.storico`) DEVE sollevare un errore a tempo di compilazione/mappatura.
2. **Standardizzazione PersonVM:** Nessun array nel CDU può esporre docenti o soggetti sotto forma di sole stringhe o con forme anagrafiche incomplete: l'uso del builder `PersonVM` (§8.1) è OBBLIGATORIO.
3. **Standardizzazione SubjectVM:** Ogni materia (sia in forma singola che in array) DEVE essere processata tramite il mapper `SubjectVM` (§8.2) garantendo la risoluzione delle sigle evolutive per l'anno di corso della classe (`ANNO`).
```
