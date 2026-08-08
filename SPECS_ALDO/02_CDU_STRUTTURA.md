# 02 — Struttura del Contesto Dati Unificato (CDU)

Il **CDU (Contesto Dati Unificato)** è la struttura JSON centrale attorno alla quale ruota ogni operazione di SGSA. Prima di generare un documento tramite `WorkspaceTemplateEngine` o inviare una notifica email, il `ContextEngine` e i relativi provider/mapper assemblano il CDU che aggrega tutti i dati necessari in un'unica gerarchia fortemente tipizzata. Template, box renderer ed espressioni condizionali DEVONO leggere ESCLUSIVAMENTE dal CDU.

**Fonte di verità:** tutti i percorsi di accesso ai dati del contesto (es. `focus.classe.anagrafica.nome`) DEVONO corrispondere esattamente alla struttura descritta in questo documento — che a sua volta DEVE corrispondere esattamente alle interfacce in `src/application/context-engine/Cdu.ts`. Un percorso non presente in questo documento NON DEVE essere usato nei template, nei box o nelle espressioni.

Il consumatore primario del CDU è `WorkspaceTemplateEngine` (risoluzione placeholder, loop strutturali e filtri pipe). Pertanto:

- Ogni dato che un template può voler stampare o iterare è raggiungibile con un **percorso corto e stabile**.
- Le **mappe a chiavi dinamiche** (es. `curriculum["INTERPRETAZIONE"]`) sono **vietate** nei punti potenzialmente iterabili: le chiavi dinamiche non sono indirizzabili in un placeholder senza hardcodare l'id.
- Nei template **non compare MAI un valore di dominio hardcodato** (id materia, indirizzo, nome, email, sigla): tutto è risolto dal CDU.
- La **ridondanza è una feature**: parti ripetute (anche copie 1:1) dentro il CDU sono accettate e incoraggiate se semplificano i placeholder.

---

## 0. Principi di progettazione (regole vincolanti)

Il CDU è progettato intorno alle capacità di `WorkspaceTemplateEngine`:

| Capacità motore | Uso nel CDU |
| :--- | :--- |
| Sostituzione piatta `{{percorso.valore}}` | Dati scalari su path brevi e stabili |
| Sezioni `{{#array}}...{{/array}}`, `{{^array}}` | Iterazione/condizione su array o booleani `hasXxx` |
| Loop strutturali `{{#bullet_list:path}}`, `{{#number_list:path}}`, `{{#tablerow_loop:path}}`, `{{#tablecol_loop:path}}` | Qualunque lista da renderizzare come elenco/tabella |
| Loop Sheets `{{dynamic_rows[source=...,value=...]}}`, `{{dynamic_columns[...]}}` | Espansione righe/colonne dinamiche |
| Filtri pipe `{{value \| filter:args}}`, `{{#loop:path \| filter:args}}` | **Solo presentazione** (sortBy, uppercase, join, map, limit, ...) |
| Filtri `where`/`exclude` con argomenti | **Vincolati a proprietà booleane/shape** (`where:'isBes',true`); MAI con valori di dominio |

Regole vincolanti:

1. **Array-prima.** Ogni sorgente di loop è un array a un percorso stabile. Le mappe a chiavi dinamiche che possono essere iterate sono trasformate in array di record.
2. **Denormalizzazione 1:1 negli item.** Ogni elemento di un array porta con sé il contesto che il template può servire (nome classe, indirizzo, `appellativoCompleto`, ...) anche se è una copia 1:1 di dati già presenti altrove nel CDU. Dentro un loop i placeholder devono restare cortissimi e mai richiedere navigazione parent (`../`) né path assoluti lunghi.
3. **Partizioni semantiche precalcolate.** I raggruppamenti basati su *valori di dominio* (COMUNE/SEPARATO, PRIMA/SECONDA prova, ITP) sono già divisi in array dedicati dal CDU, così il template non scrive `| where:'tipoArticolazione','COMUNE'` con un valore hardcodato.
4. **Stringhe e label precalcolate.** Il CDU espone già le forme testuali pronte per la stampa (`appellativoCompleto`, `materieDescrizione`, `tipoLabel`, `religioneLabel`, `docentiDescrizione`, ...): un solo placeholder al posto di concatenazioni o catene di filtri.
5. **Booleani companion.** Ogni array su cui un template può voler fare un branch ha accanto un booleano `hasXxx` (es. `hasProgetti`, `hasCarenze`, `hasBocciature`) per `{{#hasXxx}}` / `{{^hasXxx}}`.
6. **Budget di lunghezza placeholder.** Dentro i loop: ≤ 2-3 segmenti (`{{nomeCompleto}}`, `{{anagrafica.nomeCompleto}}`, `{{didattica.piani.hasPiani}}`). Fuori dai loop: ≤ 4 segmenti (`{{focus.classe.anagrafica.nome}}`). Un path più lungo va ridotto denormalizzando.

---

## 1. Struttura generale

Il CDU è articolato in sei sezioni di primo livello:

| Sezione | Scopo |
| :--- | :--- |
| **`meta`** | Dati tecnici dell'operazione: timestamp, ID esecuzione, date formattate, configurazione box e parametri di input. |
| **`istituto`** | Dati globali dell'istituzione scolastica: dirigenti, ruoli di staff e statistiche d'istituto. |
| **`focus`** | Il cuore dei dati di business oggetto dell'operazione: classe focalizzata (`focus.classe`), eventuale alunno (`focus.alunno`), singolo piano personalizzato (`focus.piano`), singola carenza (`focus.carenza`), coppia docente/materia di una singola cattedra (`focus.docente`/`focus.materia`), dipartimento focalizzato (`focus.dipartimento`). |
| **`destinatario`** | Dati anagrafici, ruoli, permessi e saluti specifici per il destinatario. Popolata ESCLUSIVAMENTE dalla pipeline email (`BuildCDUStep`); assente in un CDU costruito per la sola generazione documenti. |
| **`render`** | HTML pre-renderizzato dei box di testo dinamici (utilizzato unicamente nella pipeline email). |
| **`tech`** | Riferimenti agli oggetti vivi di dominio e servizi (non serializzati, protetti tramite `enumerable: false`). |

Ogni sezione diversa da `meta` è opzionale: una recipe attiva solo i provider di cui ha bisogno (es. `focus.alunno` è assente nelle recipe solo-classe), quindi il CDU viene riempito progressivamente man mano che i provider vengono eseguiti.

---

## 2. Sezione `meta`

Contiene i metadati di contesto per l'esecuzione corrente.

```yaml
meta:
  timestamp: string               # ISO 8601 del momento di costruzione del CDU (es. "2026-03-30T10:15:30.000Z")
  idConfigurazione: string        # ID del record CONF_DOC o CONF_MAIL attivo (es. "VERBALE_CDC", "CDC_NOTIFICA")
  tipoOperazione: string          # "GENERAZIONE_DOCUMENTO" | "INVIO_NOTIFICA"
  idEsecuzione: string            # UUID univoco del job corrente
  progressivo: number | undefined # Conteggio dei file già presenti nella cartella di destinazione Drive + 1; alias di radice {{progressivo}} per uso fuori dai loop

  # ATTENZIONE — `meta.progressivo`/l'alias di radice `{{progressivo}}` sono
  # risolti SOLO in `PrepareInfrastructureStep`, cioè DOPO che `CheckDuplicatesStep`
  # ha già renderizzato `FILE_NAME` per il confronto di identità con `LOG_DOCS.NOME`
  # (l'ordine della pipeline è CheckDuplicatesStep -> PrepareInfrastructureStep ->
  # GenerateNameStep). Di conseguenza:
  # - è valido nel CORPO del template documento e nei campi valorizzati al
  #   momento di `REGISTRA_DOC`;
  # - NON è valido in `PATH_OUT` (chicken-and-egg: il conteggio si deriva dalla
  #   cartella di destinazione già risolta, che `PATH_OUT` sta ancora costruendo);
  # - se usato in `FILE_NAME`, VANIFICA il confronto di identità di
  #   `CheckDuplicatesStep`: con `DUPLICAZIONE=NEGATA` le riesecuzioni non
  #   verranno bloccate e creeranno ulteriori file numerati anziché essere
  #   rifiutate come duplicati.

  date:
    oggi:
      breve: string               # "DD/MM/YYYY" (es. "30/03/2026")
      estesa: string              # "DD mese YYYY" (es. "30 marzo 2026")
      iso: string                 # "YYYY-MM-DD"
      giorno: string              # "DD"
      mese: string                # "MM"
      anno: string                # "YYYY"
      ora: string                 # "HH:MM"

  configurazioneBox:              # opzionale — presente solo quando il ContextEngine calcola i box email
    boxAttivi: string[]           # Array di ID dei box di contenuto abilitati
    boxVuotiNascosti: string[]    # Array di ID dei box nascosti poiché privi di dati
    ordineVisualizzazione: string[] # Ordine sequenziale di rendering dei box

  parametriInput:
    target: string                # Identificativo target (es. "5AB-LC-LS", "mario.rossi@alunni.edu.it")
    tipoTarget: string            # "classe" | "alunno"
    materiaCorrente: string | null # MateriaId di contesto (se l'operazione è specifica per una cattedra)
    opzioni:                      # Snapshot di RecipeOptionsView copiato 1:1 nel CDU — tecnico, quasi mai letto dai template
      includiStorico: boolean
      profonditaAnniStorico: number
      profonditaAnniAsl: number
      profonditaAnniDocumenti: number
      includiSupplenti: boolean
      notificaSoloCoordinatori: boolean
      includiPartnerDettaglio: boolean  # abilita focus.classe.partner (vedi §4.1)
      gestioneSupplenti: string         # "SOLO_TITOLARI" | "SOLO_SUPPLENTI" | "ENTRAMBI" (GestioneSupplenti)
      # ... eventuali chiavi aggiuntive specifiche della recipe (RecipeOptionsView ha un indice estensibile)
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

  statistiche:                    # opzionale — assente se il provider statistiche non è nella recipe attiva
    totaleClassi: number
    totaleDocenti: number
    totaleAlunni: number
```

`istituto.organizzazione.annoScolastico` viene **copiato 1:1** in `focus.classe.anagrafica.annoScolastico` (Principio 2): dentro i template e i loop non è necessario risalire a `istituto.*`.

---

## 4. Sezione `focus`

### 4.1 `focus.classe`

Vista completa della classe scolastica focalizzata (interfaccia `CduClasse`), ristrutturata per l'iterazione.

```yaml
focus.classe:
  anagrafica:
    nome: string                 # es. "5AB-LC-LS" o "4A"
    anno: number                 # 1–5 (anno di corso)
    sezione: string              # es. "A", "AB"
    annoScolastico: string       # copia 1:1 di istituto.organizzazione.annoScolastico (self-containment)
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

  # ARTICOLAZIONE STRUTTURALE (Classi Articolate) — presente solo se isArticolata = true
  articolazione:
    partner: string | null       # Per classe partner: ID dell'altro partner; per classe parent: null
    partners: string[] | null    # Per classe parent: ID delle sottoclassi [primo, secondo]; altrimenti null
    parent:                      # Oggetto parent descrittivo (null se il partner non ha classe parent risolvibile)
      id: string                 # ID classe parent (es. "5AB-LC-LS")
      anno: number                # es. 5
      indirizzi:                 # Array degli indirizzi partner componenti (loop `parent.indirizzi`)
        - sigla: string
          nome: string
          nomeSintetico: string
          tipo: string
    # Catalogo materia (SubjectVM, §8.2) SENZA arricchimento docenti: `docenti`/`docentiDescrizione`/
    # `continuita` NON sono popolati su questi array (ClasseProvider.buildMaterieVm risolve solo
    # `MATERIE` → SubjectVM, non incrocia il consiglio di classe). Per i docenti per-materia in
    # contesto articolato usare `consiglioDiClasseComune`/`consiglioDiClasseSeparato` (§4.1 sotto).
    materieCondivise: SubjectVM[]
    materieSeparatePrimoGruppo: SubjectVM[]
    materieSeparateSecondoGruppo: SubjectVM[]

  # PROIEZIONE DISAGGREGATA PARTNER — presente solo se isArticolata = true e opzioni.includiPartnerDettaglio = true
  partner:
    primo: SingleClassProjection  # Proiezione completa (anagrafica, CDC, studenti, coordinatori) del 1° partner (§8.10)
    secondo: SingleClassProjection# Proiezione completa del 2° partner (§8.10)
    # consiglioDiClasse di ciascuna proiezione è genuinamente disaggregato per partner: comune
    # (condiviso da entrambi) + la sola quota SEPARATO_PRIMO (per `primo`) o SEPARATO_SECONDO
    # (per `secondo`) — MAI l'intero roster comune+separato di entrambi i gruppi.

  # ANAGRAFICA DOCENTI E RUOLI SPECIALI (Formato PersonVM §8.1)
  # Proprietà aggregate calcolate sulle persone presenti (coordinatori.elenco; per i tutor: asl ∪ orientamento).
  # Se l'elenco è vuoto le proprietà aggregate non vengono esposte (regole §8.1).
  coordinatori:
    appellativo: string          # "prof.sse" se tutte F e ≥2; "prof.ssa" se tutte F e 1; altrimenti "prof."
    articolo: string             # "le" se tutte F e ≥2; "la" se tutte F e 1; altrimenti "i" se ≥2, "il" se 1
    coordina: string             # "coordinano" se ≥2 persone, "coordina" se 1
    presiede: string             # "presiedono" se ≥2 persone, "presiede" se 1
    elenco: PersonVM[]           # Singoli coordinatori (proprietà PersonVM complete, §8.1)

  tutor:
    appellativo: string          # Idem coordinatori (§8.1), calcolato su asl ∪ orientamento
    articolo: string             # Idem coordinatori (§8.1)
    tutor: string                # "tutor" (per ora sempre questo valore)
    asl: PersonVM[]              # Tutor PCTO/ASL di classe
    orientamento: PersonVM[]     # Tutor per l'orientamento

  rappresentanti:
    studenti:
      - nomeCompleto: string
        email: string
        indirizzo: { nome: string }   # SOLO per una classe PARENT articolata: indirizzo del partner di provenienza
    genitori:
      - nomeCompleto: string     # Nome libero da ALUNNI.RAPPR_GEN (senza email)
        studente: { nomeCompleto: string }   # OBBLIGATORIO: nome dell'alunno rappresentato — distingue quale
                                              #   figlio è rappresentato quando una famiglia ha più figli in classi diverse
        indirizzo: { nome: string }   # SOLO per una classe PARENT articolata: indirizzo del partner di provenienza
    # Per una classe parent, studenti/genitori sono aggregati sui due partner e ciascun item porta
    # il proprio indirizzo di provenienza; per classi non articolate o partner, `indirizzo` è assente.

  # CONSIGLIO DI CLASSE COMPLETO (item arricchiti, §8.4)
  consiglioDiClasse: DocenteCdcVM[]
  # PARTIZIONI PRECALCOLATE (Principio 3): evita `| where:'tipoArticolazione','...'` — presenti
  # SOLO se isArticolata = true
  consiglioDiClasseComune: DocenteCdcVM[]    # Docenti con tipoArticolazione COMUNE
  consiglioDiClasseSeparato: DocenteCdcVM[]  # Docenti con tipoArticolazione SEPARATO_PRIMO o SEPARATO_SECONDO

  # CATALOGO MATERIE DI CLASSE (Tutte le materie attive)
  materie: SubjectVM[]           # Array piatto di tutte le materie della classe (§8.2), ciascuna recante:
                                  #   - docenti: PersonVM[] assegnati
                                  #   - docentiDescrizione: string ("Mario Rossi, Laura Gialli")
                                  #   - hasItp: boolean (true se la cattedra ha colonna .itp popolata)
                                  #   - continuita: ContinuitaVM (§8.3), presente se opzioni.includiStorico = true

  materiePerPrincipale:          # Materie raggruppate per materia principale/fittizia (§8.2)
    - idFittizio: string         # ID materia base (es. "INTERPRETAZIONE" o "ITA")
      nome: string               # Nome principale (es. "Esecuzione ed interpretazione" o "Italiano")
      materie: SubjectVM[]       # Array delle specificità (es. Chitarra, Flauto) o singola materia base

  # SEZIONE ESAME DI STATO (partizioni precalcolate) — presente in qualunque recipe che esegue il
  # provider `esame` (dopo `materie`); NON è gated su isTerminale: `hasEsame`/gli array sono
  # semplicemente vuoti per una classe senza materie in MATERIE.ESAME_CFG per l'indirizzo corrente
  esame:
    hasEsame: boolean            # true se esame.materie non è vuoto (per {{#hasEsame}}/{{^hasEsame}})
    materie:
      - SubjectVM                # Oggetto Materia arricchito con:
        prova: string            # "PRIMA_PROVA" | "SECONDA_PROVA"
        docenti: PersonVM[]      # Docenti assegnati alla prova (ereditati da focus.classe.materie[])
        docentiDescrizione: string # "Mario Rossi, Laura Gialli"
    docenti:
      - PersonVM                 # Oggetto Docente arricchito con:
        prova: string            # "PRIMA_PROVA" | "SECONDA_PROVA"
        materie: SubjectVM[]     # Materie d'esame insegnate dal docente per quella prova
    # Partizioni per prova (Principio 3): nessun `where:'prova','PRIMA_PROVA'` nei template
    materiePrimaProva: SubjectVM[]   # Solo materie con prova = "PRIMA_PROVA" (stesso schema di esame.materie[])
    materieSecondaProva: SubjectVM[] # Solo materie con prova = "SECONDA_PROVA" (stesso schema)
    docentiPrimaProva: PersonVM[]    # Solo docenti con prova = "PRIMA_PROVA" (dedup per email)
    docentiSecondaProva: PersonVM[]  # Solo docenti con prova = "SECONDA_PROVA"

  # PROGETTI ED ATTIVITÀ EXTRACURRICOLARI (da Tabella PROGETTI)
  hasProgetti: boolean           # true se il blocco progetti contiene almeno un elemento
  progetti: ProgettoVM[]         # Progetti dell'anno scolastico corrente (§8.5)

  # STORICO CLASSE PREGRESSO (da CLASSI.STORICO)
  # LazyRef<ClasseStoricoVM> (CoreUtilsLib) — NON un valore diretto: il consumatore chiama
  # `.get()` per materializzare il dato (memoizzato al primo accesso). Assente (chiave omessa)
  # se opzioni.includiStorico = false o se il provider non gira per questa recipe.
  storico: LazyRef<ClasseStoricoVM>  # §8.6

  # ANAGRAFICA E PROFILO ALUNNI
  studenti:
    listaCompleta: StudentVM[]   # Array di oggetti alunno-nel-contesto (§8.7), ciascuno self-contained:
                                  #   anagrafica, status, curriculum[], didattica, classe, indirizzo

    statistiche:
      totale: number
      conPianiDidattici: number
      conBes: number
      conDsa: number
      ripetenti: number
      rappresentanti: number

    # Array (Principio 1) — le chiavi dinamiche non sono indirizzabili nei placeholder
    perSpecificita: SpecificitaAlunniVM[]   # sempre presente; [] se non esistono specificità
    # Forma: [ { materiaId, materiaSigla, materiaNome, specifiche: [ { nome, alunni: [PersonMinVM] } ] } ]
    # Loop annidati: focus.classe.studenti.perSpecificita → materiaNome | specifiche → nome | alunni → nomeCompleto
    # PersonMinVM.nome/cognome sono SEMPRE null qui (l'alunno-nel-contesto di provenienza porta solo
    # nomeCompleto/email) — usare sempre `nomeCompleto`, mai nome+cognome separati.

  elencoMaterieConPermessi: ElencoMateriaConPermessiVM[]   # Array di colonne per l'espansione orizzontale
    # (MAT_NON_STANDARD.md) — costruito on-demand da SheetMaterieConPermessiGeneratorStrategy, non da
    # un provider CDU standard; il primo elemento è l'accorpamento speciale REL/ALT. Specifica completa
    # in `MAT_NON_STANDARD.md`.

  # PROIEZIONE SHEETS per `dynamic_columns` (multi-gruppo) — costruita on-demand quando il generatore
  # SHEET_CON_MATERIE_E_PERMESSI (o SHEET_CON_MATERIE) è attivo (vedi §9.3, MAT_NON_STANDARD.md)
  sheet:
    materieColonne:
      # Proiezione stampabile del MateriaColumn interno della strategy — intenzionalmente più stretta:
      # NON espone i campi solo-ACL (classeId, specificita, kind)
      group1:
        - sigla: string
          header: string
          isSpecial: boolean       # opzionale, assente su colonne materia ordinarie
          roles: string[]          # opzionale
      group2: [ ... ]              # stesso schema di group1
      group3: [ ... ]              # stesso schema di group1
      group2Label: string          # opzionale — etichetta di colonna strutturale prima di group2
      group3Label: string          # opzionale — etichetta di colonna strutturale prima di group3

  # LOG_DOCS AGGREGATI A LIVELLO CLASSE (indipendenti dai campi omonimi in focus.alunno.didattica)
  # — presenti solo se i rispettivi provider girano per la recipe attiva (tipicamente
  # DOCENTE_COMPLETO / PER_COORDINATORE / PER_DOCENTE / PER_CDC). Aggregano su
  # params.classiCompetenza (o sul solo target se assente), così un coordinatore con più classi
  # vede un'unica lista combinata.
  didattica:
    pianiPersonalizzati:
      items: PianoPersonalizzatoItem[]   # §8.11 — ogni item porta `studente: {nomeCompleto, email}`
      storico: LazyRef<DocumentoStoricoConTipo[]>  # opzionale, solo se opzioni.includiStorico = true
    documenti:
      items:
        - nome: string
          link: string
          tipo: string
          idGen: string
          stato: string
          dataCreazione: string
      hasDocumenti: boolean
```

---

### 4.2 `focus.alunno`

Interfaccia `CduAlunno`.

```yaml
focus.alunno:
  anagrafica:
    nomeCompleto: string
    email: string

  status:
    religione: string            # "IRC" | "ALT" | "NO" (ReligioneScelta)
    religioneLabel: string       # "Religione cattolica" | "Attività alternativa" | "Non si avvale"
    isBes: boolean
    isRipetente: boolean
    isRappresentante: boolean

  # Array (Principio 1) — stesso schema di focus.classe.studenti.listaCompleta[].curriculum
  curriculum: CurriculumVM[]     # [ { materiaId, materiaSigla, materiaNome, specifiche: [ { nome } ] } ]

  classe:
    nome: string                 # Nome classe partner se articolata, altrimenti nome classe standard
    indirizzoSigla: string
    indirizzoNome: string

  # CDC FILTRATO SUL CURRICULUM E RELIGIONE DELL'ALUNNO (item arricchiti, §8.4) — presente solo se
  # il resolver di cattedre condiviso è disponibile (CDCFilterAlunnoStrategy, 14_SERVIZI_UTILITY.md §1.3)
  consiglioDiClasseFiltrato: DocenteCdcVM[]

  didattica:
    carenze:
      hasCarenze: boolean
      numero: number
      dettaglio:
        - materia: string        # Sigla materia
          materiaNome: string    # Nome esteso della materia (per stampa senza catalogo)
          voto: string           # Valutazione o giudizio sintetico
    asl:
      oreCumulate: number
      oreAnnoCorrente: number
    piani:
      hasPiani: boolean
      hasBes: boolean
      items:
        - tipo: string           # Enum TipoPiano (es. "PDP_DSA", "PEI")
          tipoLabel: string      # Etichetta leggibile (es. "PDP DSA", "PEI", "PFP")
          isBes: boolean
          link: string           # URL Drive del documento firmato/generato
          parametriGenerazione: object # JSON libero da PIANI.PARAMETRI
    documenti:                   # opzionale — presente solo se il provider gira (ALUNNO_DETTAGLIATO, FAMIGLIA_COMPLETO)
      hasDocumenti: boolean
      items:
        - nome: string
          link: string
          tipo: string
          idGen: string
          stato: string
          dataCreazione: string
      storico: LazyRef<DocumentoStoricoConTipo[]>   # opzionale — solo se opzioni.includiStorico = true
    pianiPersonalizzati:         # opzionale — LOG_DOCS con TIPO = 'PIANO_PERS' per il solo alunno focalizzato
                                  # (attivo in ALUNNO_COMPLETO/FAMIGLIA_COMPLETO), indipendente da `piani` sopra
      items: PianoPersonalizzatoItem[]   # §8.11 — qui SENZA il campo `studente` (già il focus)
      storico: LazyRef<DocumentoStoricoConTipo[]>   # opzionale — solo se opzioni.includiStorico = true

  # STORICO ANNI PRECEDENTI DELL'ALUNNO — LazyRef<StudentStoricoVM> (CoreUtilsLib), non un valore
  # diretto: chiamare `.get()` per materializzare. Chiave assente se opzioni.includiStorico = false.
  storico: LazyRef<StudentStoricoVM>   # §8.6
```

---

### 4.3 `focus.piano`

Presente unicamente nelle execution recipe relative a `PIANO_PERSONALIZZATO` (generazione PDP/PEI/PFP). Interfaccia `CduPianoFocus`.

```yaml
focus.piano:
  tipo: string                   # Enum TipoPiano della riga focalizzata (es. "PDP_DSA", "PEI")
  isBes: boolean                 # Copiato dal piano PIANI corrispondente (isBES())
  parametriGenerazione: object   # Oggetto JSON decodificato direttamente da PIANI.PARAMETRI
```

> **REGOLE DI GENERAZIONE DOCUMENTI PIANI PERSONALIZZATI:** il record `CONF_DOC.ID = PIANI_PERSONALIZZATI` (con `TIPO = PIANO_PERS`) è il generatore unico per tutti i piani. Seleziona il template Drive valutando `focus.piano.tipo` nei 5 rami di `MODELLI`. Il valore `focus.piano.tipo` viene trascritto direttamente in `LOG_DOCS.SOTTOTIPO`.

---

### 4.4 `focus.carenza`

Presente unicamente nelle notifiche di carenza/pagellino (`CARENZA_COMPLETO`). Interfaccia `CduCarenzaFocus`.

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

### 4.5 `focus.docente` / `focus.materia`

Presenti unicamente nelle recipe `DOCUMENTO_DOCENTE_MATERIA` (generazione batch per singola cattedra docente/materia, `DocenteMateriaFocusProvider`). Scopano l'intera generazione a un solo (docente, materia) della classe focalizzata: il provider legge `focus.classe.consiglioDiClasse` (già popolato dal provider `'consiglio'`, che DEVE quindi girare prima nella recipe) e vi cerca la voce il cui `anagrafica.email` corrisponde a `params.docenteCorrente`, poi la materia il cui `sigla` corrisponde a `params.materiaCorrente` (primo match — `Array.find`).

```yaml
focus.docente: PersonVM          # §8.1 — anagrafica completa del docente della cattedra (docenteCdc.anagrafica)
focus.materia: SubjectVM         # §8.2 — materia della cattedra (docenteCdc.materie[], primo match su sigla)
```

> **Limite di scope noto.** `TeachingSlot` (risoluzione ruoli) è a tre dimensioni (`materia`, `kind`, `specifica`), ma sia l'enumerazione batch (`DocumentBatchService.generateDocentiMateria`) sia questo provider trattano solo la coppia (classe, materia, docente): due cattedre che differiscono solo per `kind`/`specifica` (es. STANDARD+ITP sulla stessa materia di laboratorio) collassano in un solo documento, per scelta di scope — non è un bug.

---

### 4.6 `focus.dipartimento`

Presente unicamente nelle recipe `DIPARTIMENTO` (generazione batch per dipartimento, es. "verbale di dipartimento" — un dipartimento non ha una dimensione classe). Interfaccia `CduDipartimentoFocus`.

```yaml
focus.dipartimento:
  anagrafica:
    id: string                   # DIPART.ID
    nome: string                 # DIPART.NOME
  capo: PersonVM | null          # §8.1 — anagrafica del capo dipartimento (DIPART.CAPO), null se non assegnato
  materie:
    - sigla: string               # Proiezione leggera (solo sigla) delle materie afferenti al dipartimento (DIPART.MATERIE)
  docenti: PersonVM[]             # §8.1 — docenti afferenti al dipartimento
  didattica:
    documenti:
      items:                      # Stessa forma di DocumentiClasseProvider, filtrata per overlap di materia
                                   #   anziché per classe (un dipartimento non ha classi)
        - id: string | undefined
          nome: string
          link: string
          tipo: string
          idGen: string
          stato: string
          dataCreazione: string
```

---

## 5. Sezione `destinatario`

Popolata ESCLUSIVAMENTE dal `BuildCDUStep` della pipeline email (`src/application/pipelines/emailSteps.ts`): un CDU costruito per la sola generazione documenti non ha mai `cdu.destinatario`. `destinatario.anagrafica` è un `PersonVM` (§8.1) completo, quindi reca anche `appellativoCompleto`/`appellativoCognome`.

> **STUB NON IMPLEMENTATO:** `BuildCDUStep.buildDestinatario` (`emailSteps.ts:157-196`) valorizza `ruoliAttivi`, `flags.isTutor`, `flags.isTutorAsl`, `flags.isDocenteSostegno`, `flags.isSupplente`, `contesto.sostituisce` e `contesto.materieCompetenza` con il loro valore-zero incondizionato (`[]`/`false`/`null`), indipendentemente dal destinatario reale — non sono ancora calcolati. La FORMA (il tipo, in `CduDestinatario`) è quella reale e già stabile; il VALORE è oggi sempre lo stub, in attesa di un'implementazione futura. Solo `flags.isCoordinatore` (derivato da `conf.processo === ProcessoInvio.PER_COORDINATORE`) e `contesto.classiCompetenza` sono genuinamente calcolati per destinatario.

```yaml
destinatario:
  anagrafica: PersonVM           # Dati anagrafici standardizzati (§8.1) del destinatario

  ruoliAttivi: string[]          # STUB: sempre [] — non ancora calcolato (vedi nota sopra)

  flags:
    isCoordinatore: boolean      # Genuinamente calcolato: true se conf.processo === PER_COORDINATORE
    isTutor: boolean             # STUB: sempre false — non ancora calcolato
    isTutorAsl: boolean          # STUB: sempre false — non ancora calcolato
    isDocenteSostegno: boolean   # STUB: sempre false — non ancora calcolato
    isSupplente: boolean         # STUB: sempre false — non ancora calcolato

  contesto:
    sostituisce: PersonVM | null # STUB: sempre null — non ancora calcolato (non collegato a isSupplente)
    classiCompetenza: string[]   # Genuinamente calcolato: ClasseId su cui il destinatario ha titolarità
    materieCompetenza: string[]  # STUB: sempre [] — non ancora calcolato

  comunicazione:
    salutoIniziale: string       # es. "Gentile Prof.ssa Bianchi," o "Spettabile Genitore,"
    oggettoCalcolato: string     # Oggetto email finale processato tramite template engine
    testoContenutoPuro: string   # Testo plain-text senza wrapper HTML (per audit log)
```

---

## 6. Sezione `render`

Presente esclusivamente nella pipeline notifiche email.

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
**Proprietà non enumerabile:** la sezione `tech` viene dichiarata tramite `Object.defineProperty(cdu, 'tech', { enumerable: false, writable: true })`. Non viene MAI inclusa in `JSON.stringify(cdu)`, prevenendo cicli di serializzazione e log ridondanti.

```yaml
tech:
  entita:
    classe: object               # Istanza della classe di dominio Classe
    alunno: object                # Istanza della classe di dominio Alunno
    docente: object               # Istanza della classe di dominio Docente
    patternEmail: object          # Istanza ConfigurazioneEmail
    documentoMetadato: object     # Istanza ConfigurazioneDocumento
  servizi: object[]               # Riferimenti ai servizi di contesto
  pipeline:
    statoCorrente: string
    stepEseguiti: string[]
    errori: string[]
    logEsecuzione: string[]
```

---

## 8. Specifiche dettagliate dei View Model condivisi

### 8.1 Person View Model (`PersonVM`)

Ogni docente, tutor, coordinatore, referente o membro dello staff esposto nel CDU DEVE conformarsi alla struttura seguente (`src/application/context-engine/mappers/personVmMapper.ts`). Il builder gestisce la declinazione grammaticale del genere e dei titoli.

```yaml
PersonVM:
  nome: string                   # es. "Mario"
  cognome: string | null         # es. "Rossi" (null per esperti esterni senza cognome separato)
  email: string | null           # Email RFC 5321 (null per esperti esterni)
  genere: string | null          # "M" | "F" | null
  appellativo: string | null     # "Prof." (se M) | "Prof.ssa" (se F) | null
  articolo: string | null        # "il" (se M) | "la" (se F) | null
  coordinatore: string | null    # "coordinatore" (se M) | "coordinatrice" (se F) | null
  nomeCompleto: string           # "${nome} ${cognome}" (in quest'ordine) oppure rag. sociale esperto esterno
  materia: string | null         # Inserito opzionalmente quando la persona è legata ad una cattedra

  # STRINGHE PRECOMPOSTE (Principio 4) — mai concatenare nei template
  appellativoCompleto: string    # "Prof. Mario Rossi" | "Prof.ssa Laura Gialli" | nomeCompleto (per esterni)
  appellativoCognome: string     # "Prof. Rossi" | "Prof.ssa Gialli" | nomeCompleto (per esterni) — per saluti/formule
```

> **Regole per le proprietà aggregate dei contenitori di persone.** Sui nodi `coordinatori` e `tutor` le proprietà collettive sono esposte **direttamente** sul nodo (niente `coordinatoriMetadata`/`tutorMetadata`), calcolate sugli elementi presenti (per `coordinatori`: `elenco`; per `tutor`: l'unione `asl ∪ orientamento`) in base a genere e numero. **Se l'elenco è vuoto le proprietà non vengono esposte.**
> - **Tutte `F` e ≥ 2 persone:** `appellativo` = `"prof.sse"`, `articolo` = `"le"`.
> - **Tutte `F` e 1 persona:** `appellativo` = `"prof.ssa"`, `articolo` = `"la"`.
> - **Almeno un `M` o lista mista:** `appellativo` = `"prof."`, `articolo` = `"i"` (≥ 2 persone) o `"il"` (1 persona).
> - **Verbi (nodo `coordinatori`):** `coordina` = `"coordina"` (1 persona) o `"coordinano"` (≥ 2); `presiede` = `"presiede"` (1 persona) o `"presiedono"` (≥ 2).
> - **Nodo `tutor`:** oltre ad `appellativo`/`articolo`, `tutor` = `"tutor"` (per ora sempre questo valore).

---

### 8.2 Subject View Model (`SubjectVM`)

Ogni materia esposta nel CDU (in `focus.classe.materie[]`, `consiglioDiClasse[].materie[]`, `articolazione`, `esame`) adotta lo schema unificato seguente (`mappers/subjectVmMapper.ts`). Il resolver di materia applica le regole di **`MATERIE.EVOLUZIONE`** rispetto all'anno di corso della classe (`ANNO`).

```yaml
SubjectVM:
  sigla: string                  # Materia.id stesso — MATERIE non ha una colonna SIGLA separata; l'ID
                                  #   della riga (es. "ITA") funge da sigla canonica
  nome: string                   # Nome esteso (da MATERIE.NOME)
  nomeSintetico: string          # Nome abbreviato (da MATERIE.SINTESI)
  colore1: string                # Hex colore primario (da MATERIE.COLORE_1)
  colore2: string                # Hex colore secondario (da MATERIE.COLORE_2)
  isMateriaPrimaProva: boolean   # true se la materia è in prima_prova per l'indirizzo in MATERIE.ESAME_CFG
  isMateriaSecondaProva: boolean # true se la materia è in seconda_prova per l'indirizzo in MATERIE.ESAME_CFG
  principale: string | null      # Descrizione materia principale, solo per specificità X.Y (assente altrove: null); da MATERIE.PRINCIPALE direttamente, non da lookup della materia base
  specificita: string | null     # Nome disciplina/strumento, solo per specificità X.Y (assente altrove: null); da MATERIE.SPECIFICITA direttamente, non da lookup della materia base
  isITP: boolean                 # true se la materia è insegnata in un contesto di laboratorio ITP (.itp)
  hasItp: boolean                # opzionale — presente in focus.classe.materie[]: true se esiste colonna .itp popolata
  evoluzione:                    # Tracciamento storicizzazione sigle (da MATERIE.EVOLUZIONE), null se nessuna
    siglePrecedenti:
      - sigla: string            # Sigla usata negli anni precedenti (es. "GST")
        nome: null                # SEMPRE null: MATERIE.EVOLUZIONE mappa solo sigla → anni, non un nome storico
        anni: number[]           # Anni di corso in cui si usava la sigla (es. [1, 2])

  # CAMPI OPZIONALI DI CONTESTO (assenti/undefined dove non applicabile):
  docenti: PersonVM[]            # Docenti assegnati alla materia — presente in focus.classe.materie[],
                                  #   consiglioDiClasse[].materie[], esame.materie[]; ASSENTE su
                                  #   articolazione.materieCondivise/materieSeparate* (§4.1)
  docentiDescrizione: string     # "Mario Rossi, Laura Gialli" (join precalcolato di docenti.nomeCompleto)
                                  #   — presente ovunque docenti è presente
  continuita: ContinuitaVM       # Storico docenza — presente in focus.classe.materie[] se
                                  #   opzioni.includiStorico = true
```

> **ITP per-cattedra.** Nei contesti per-docente (`consiglioDiClasse[].materie[]`, `esame.docenti[].materie[]`) `isITP` è `true` SOLO se il docente insegna quella materia in una colonna `.itp`. Il flag aggregato a livello docente (`DocenteCdcVM.isITP`) resta il valore complessivo.

---

### 8.3 Teaching Continuity View Model (`ContinuitaVM`)

Presente su ciascuna materia in `focus.classe.materie[].continuita` quando la recipe attiva `opzioni.includiStorico = true` (`mappers/continuitaMapper.ts`).

```yaml
ContinuitaVM:
  docentiAnniPrecedenti:
    - annoIndietro: number       # 1 = anno immediatamente precedente, 2 = due anni fa
      annoScolastico: string     # es. "2024-2025"
      titolare: PersonVM | null  # Docente titolare principale in quell'anno (o il reconciled EVOLUZIONE)
      itp?: PersonVM | null      # SOLO PRESENTE se hasItp = true per la materia — chiave del tutto
                                  #   omessa (non null) quando hasItp = false

  continuitaUltimiTreAnni: boolean # true sse lo STESSO titolare (email) ha insegnato nell'anno corrente, -1 e -2
  continuitaUltimiDueAnni: boolean # true sse lo STESSO titolare (email) ha insegnato nell'anno corrente e -1

  # CAMPI ESCLUSIVI PER MATERIE CON ITP (hasItp = true) — chiavi omesse, non false, quando hasItp = false:
  continuitaUltimiTreAnniItp?: boolean # true sse lo STESSO ITP (email) ha insegnato nell'anno corrente, -1 e -2
  continuitaUltimiDueAnniItp?: boolean # true sse lo STESSO ITP (email) ha insegnato nell'anno corrente e -1
```

> **Note di calcolo della continuità:** 1) la ricerca risale la catena dei nomi classe storici definiti in `CLASSI.STORICO`; 2) se una materia ha cambiato sigla (es. `GST` → `STO`), il match tra cattedre degli anni precedenti avviene tramite riconciliazione su `MATERIE.EVOLUZIONE`; 3) se `hasItp = false`, i campi `itp` dentro `docentiAnniPrecedenti` e i booleani `*Itp` NON vengono generati (chiave assente nell'oggetto, non un valore falsy).

---

### 8.4 Docente nel Consiglio di Classe (`DocenteCdcVM`)

Ogni elemento di `focus.classe.consiglioDiClasse[]`, `focus.classe.consiglioDiClasseComune[]`, `focus.classe.consiglioDiClasseSeparato[]`, `focus.alunno.consiglioDiClasseFiltrato[]`, e delle proiezioni `partner.primo|secondo.consiglioDiClasse[]`, è un **item self-contained** (Principio 2).

```yaml
DocenteCdcVM:
  anagrafica: PersonVM           # Persona standardizzata (§8.1)
  materie: SubjectVM[]           # Materie insegnate da QUESTO docente in questa classe (con per-subject isITP)
  materieDescrizione: string     # Testo pronto: "Italiano, Storia" (join di materie.nomeSintetico) — MAI concatenare
  materieSigle: string           # Testo pronto: "ITA, STO" (join di materie.sigla) — per tabelle compatte
  ruoli:
    isCoordinatore: boolean
    isTutorAsl: boolean
    isTutorOrientamento: boolean
    descrizione: string[]        # Array di stringhe descrittive: ["Coordinatore", "Tutor ASL", "Docente"]
  stato:
    isSupplente: boolean
    sostituisce: PersonVM | null # Docente titolare sostituito (se supplenza attiva)
  tipoArticolazione: "COMUNE" | "SEPARATO_PRIMO" | "SEPARATO_SECONDO" | null
  gruppoNome: string | null      # Nome indirizzo del partner ("Gruppo comune"/etc. NON è il valore letterale:
                                  #   è il nome dell'indirizzo del partner per SEPARATO_PRIMO/SECONDO, null per COMUNE)
  isITP: boolean                 # Aggregato: true se docente ITP in ALMENO una materia assegnata
  flags:
    isNotLast: boolean           # Convenience flag per loop Mustache
```

---

### 8.5 Project View Model (`ProgettoVM`)

Popolato da `ProgettiProvider` leggendo la tabella `PROGETTI` per la classe focalizzata.

```yaml
ProgettoVM:
  tipo: string                   # "ASL" | "ORIENTAMENTO" | "ALTRO" (TipoProgetto)
  tipoLabel: string              # "PCTO/ASL" | "Orientamento" | "Altro" (label precalcolata)
  nome: string                   # Titolo del progetto/percorso
  referente: PersonVM            # Oggetto Persona standardizzato (§8.1) per il docente o esperto esterno
  ore: number                    # Monte ore totale del progetto
  oreAsl: number                 # Ore valide ai fini PCTO/ASL
  isAsl: boolean                 # Convenience flag: true sse tipo == "ASL"
```

---

### 8.6 View Model Storici (`ClasseStoricoVM` & `StudentStoricoVM`)

#### Storico Classe (`focus.classe.storico`)

Montato come `LazyRef<ClasseStoricoVM>` (§4.1) — chiamare `.get()` per materializzare. Caricato solo quando `opzioni.includiStorico = true`, per i 2 anni precedenti (`StoricoClasseProvider`).

```yaml
ClasseStoricoVM:
  statistiche:
    - annoScolastico: string     # es. "2024-2025"
      classe: string             # Nome della classe in quell'anno (da CLASSI.STORICO)
      statistiche:                # StatisticheAlunniVM
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

#### Storico Alunno (`focus.alunno.storico` e, se richiesto, dietro `focus.classe.studenti.listaCompleta[]`)

Montato come `LazyRef<StudentStoricoVM>` in `focus.alunno.storico` — chiamare `.get()` per materializzare (`StoricoProvider`, `mappers/storicoMapper.ts`).

```yaml
StudentStoricoVM:
  anni:
    - annoScolastico: string     # es. "2024-2025"
      classe: string             # Classe frequentata nell'anno
      esito: string              # "PROMOSSO" | "NON_PROMOSSO" | "RITIRATO" | "SCONOSCIUTO"
  pianiPrimoAnnoPrecedente:
    - tipo: string               # Enum TipoPiano (es. "PDP_DSA")
      tipoLabel: string          # Etichetta leggibile (es. "PDP DSA")
  pianiSecondoAnnoPrecedente:
    - tipo: string
      tipoLabel: string
  bocciature:
    - annoScolastico: string     # Anno in cui l'alunno non è stato promosso
      classe: string             # Classe in cui è avvenuta la bocciatura
  hasBocciature: boolean         # true se l'array bocciature contiene almeno un elemento
```

---

### 8.7 Studente nel contesto di classe (`StudentVM`, implementata come `AlunnoContestoVM` in `Cdu.ts`)

Ogni elemento di `focus.classe.studenti.listaCompleta[]` è un item **self-contained** (Principio 2): porta con sé classe e indirizzo — sempre quelli della classe FOCALIZZATA (parent, per una classe articolata), mai la classe partner propria dello studente — così dentro un `tablerow_loop`/`bullet_list` i placeholder sono cortissimi.

```yaml
StudentVM:
  anagrafica:
    nomeCompleto: string
    email: string
  classe:
    nome: string                 # Nome della classe FOCALIZZATA (copia 1:1 di focus.classe.anagrafica.nome)
  indirizzo:
    nome: string                 # Copia 1:1 di focus.classe.anagrafica.indirizzo.nome (per loop self-contained)
    nomeSintetico: string        # Copia 1:1 di focus.classe.anagrafica.indirizzo.nomeSintetico
  status:
    isBes: boolean
    isRipetente: boolean
    isRappresentante: boolean
    religione: string            # "IRC" | "ALT" | "NO"
    religioneLabel: string       # "Religione cattolica" | "Attività alternativa" | "Non si avvale"
  # Array (Principio 1)
  curriculum: CurriculumVM[]     # [ { materiaId, materiaSigla, materiaNome, specifiche: [ { nome } ] } ]
  didattica:
    carenze:
      hasCarenze: boolean
      numero: number
      dettaglio:
        - materia: string        # Sigla materia
          materiaNome: string    # Nome esteso della materia
          voto: string           # Valutazione/nota
    piani:
      hasPiani: boolean
      hasBes: boolean
      items:
        - tipo: string
          tipoLabel: string      # Etichetta leggibile
          isBes: boolean
    pcto:
      oreCumulate: number
```

---

### 8.8 Curriculum View Model (`CurriculumVM`)

Sostituisce la mappa `curriculum["[MateriaId]"]` (chiavi dinamiche non indirizzabili nei placeholder). Stessa forma in `focus.classe.studenti.listaCompleta[].curriculum` e `focus.alunno.curriculum` (`mappers/carenzeMapper.ts`).

```yaml
CurriculumVM:
  materiaId: string              # MateriaId (es. "INTERPRETAZIONE") — per uso tecnico/log, non per discriminare nei template
  materiaSigla: string           # Sigla canonica (es. "INT" — coincide con Materia.id, vedi §8.2)
  materiaNome: string            # Nome esteso della materia (es. "Esecuzione ed interpretazione")
  specifiche:                    # Array di record (loop annidato `{{#specifiche}}{{nome}}{{/specifiche}}`)
    - nome: string               # Valore della specifica (es. "chitarra"); la forma stampabile è `{{nome | capitalize}}`
```

---

### 8.9 Specificità per indirizzo alunni (`SpecificitaAlunniVM`)

Sostituisce la mappa doppia `studenti.perSpecificita["[MateriaId]"]["[specifica]"]` con un array iterabile a tre livelli (`mappers/specificitaAlunniMapper.ts`).

```yaml
SpecificitaAlunniVM:
  materiaId: string              # MateriaId (es. "INTERPRETAZIONE")
  materiaSigla: string           # Sigla canonica
  materiaNome: string            # Nome esteso (es. "Esecuzione ed interpretazione")
  specifiche:
    - nome: string               # Specifica (es. "chitarra")
      alunni: PersonMinVM[]      # Alunni iscritti a quella specificità
```

**`PersonMinVM`** (persona minima per elenchi compatti): `{ nome: string | null, cognome: string | null, nomeCompleto: string, email: string }`. Costruita a partire da `AlunnoContestoVM.anagrafica` (che porta solo `nomeCompleto`/`email`): `nome`/`cognome` sono **SEMPRE `null`** in questo punto del CDU — usare sempre `nomeCompleto`.

---

### 8.10 Proiezione singola classe partner (`SingleClassProjection`)

Forma della proiezione completa disaggregata in `focus.classe.partner.{primo,secondo}` (§4.1), costruita da `PartnerProjectionProvider` ri-eseguendo `ClasseProvider`/`StudentiProvider`/`TutorProvider` su una classe partner (`providers/PartnerProjectionProvider.ts`).

```yaml
SingleClassProjection:
  anagrafica: CduClasse["anagrafica"]     # stessa forma di focus.classe.anagrafica (§4.1)
  consiglioDiClasse: DocenteCdcVM[]       # comune + SOLA quota separata di QUESTO partner (§8.4)
  studenti:
    listaCompleta: StudentVM[]            # roster della sola classe partner (§8.7)
  coordinatori: CduClasse["coordinatori"] # stessa forma di focus.classe.coordinatori (§4.1), { elenco: [] } se assenti
```

---

### 8.11 Item di piano personalizzato (`PianoPersonalizzatoItem`)

Riga di `focus.classe.didattica.pianiPersonalizzati.items[]` / `focus.alunno.didattica.pianiPersonalizzati.items[]` (§4.1/§4.2), da `LOG_DOCS` filtrato a `TIPO = 'PIANO_PERS'`.

```yaml
PianoPersonalizzatoItem:
  id: string | undefined
  nome: string
  link: string
  tipo: string                   # sempre "PIANO_PERS" qui
  sottotipo: string              # es. "PDP_DSA", "PEI" — il sottotipo effettivo del piano
  idGen: string
  stato: string
  dataCreazione: string
  notificato: boolean
  studente: { nomeCompleto: string; email: string }  # SOLO sulla lista classe-scoped
                                                       # (focus.classe...): identifica lo studente
                                                       # proprietario. Assente sulla lista alunno-scoped
                                                       # (focus.alunno...), dove lo studente è già il focus.
```

---

## 9. Linee guida d'uso dei placeholder (catalogo)

Questa sezione è la tavola di traduzione tra "cosa voglio stampare" e placeholder/loop/filtri, esclusivamente su path del CDU. **Nessun valore di dominio è hardcodato.**

### 9.1 Dati scalari (sostituzione piatta)

| Esigenza | Placeholder |
| :--- | :--- |
| Nome della classe | `{{focus.classe.anagrafica.nome}}` |
| Anno di corso | `{{focus.classe.anagrafica.anno}}` |
| Anno scolastico | `{{focus.classe.anagrafica.annoScolastico}}` |
| Indirizzo (nome) | `{{focus.classe.anagrafica.indirizzo.nome}}` |
| Indirizzo (nome sintetico) | `{{focus.classe.anagrafica.indirizzo.nomeSintetico}}` |
| Data odierna breve / estesa | `{{meta.date.oggi.breve}}` / `{{meta.date.oggi.estesa}}` |
| Dirigente | `{{istituto.organizzazione.dirigente.nomeCompleto}}` |
| Nome alunno focalizzato | `{{focus.alunno.anagrafica.nomeCompleto}}` |
| Tipo piano focalizzato | `{{focus.piano.tipo}}` |

### 9.2 Loop strutturali documenti (DocumentProcessor)

| Esigenza | Loop |
| :--- | :--- |
| Elenco puntato docenti del CDC | `{{#bullet_list:focus.classe.consiglioDiClasse}}{{anagrafica.appellativoCompleto}} — {{materieDescrizione}}{{/bullet_list}}` |
| Elenco numerato studenti | `{{#number_list:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}{{/number_list}}` |
| Tabella alunni | `{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}`,`{{status.religioneLabel}}`,`{{anagrafica.email}}` |
| Tabella materie e docenti | `{{#tablerow_loop:focus.classe.materie}}{{sigla}}`,`{{nome}}`,`{{docentiDescrizione}}` |
| Materie per principale (gruppi) | `{{#bullet_list:focus.classe.materiePerPrincipale}}{{nome}}: {{#materie}}{{nomeSintetico}}{{/materie}}{{/bullet_list}}` |
| Progetti | `{{#bullet_list:focus.classe.progetti}}{{tipoLabel}}: {{nome}} ({{referente.appellativoCompleto}}, {{ore}}h){{/bullet_list}}` |
| Prova prima / seconda | `{{#bullet_list:focus.classe.esame.materiePrimaProva}}{{nome}}: {{docentiDescrizione}}{{/bullet_list}}` |
| CDC comune / separato (articolate) | `{{#bullet_list:focus.classe.consiglioDiClasseComune}}...{{/bullet_list}}` |
| Specificità per materia (3 livelli) | `{{#focus.classe.studenti.perSpecificita}}{{materiaNome}}: {{#specifiche}}{{nome}} ({{#alunni}}{{nomeCompleto}};{{/alunni}}){{/specifiche}}{{/focus.classe.studenti.perSpecificita}}` |
| Curriculum alunno (loop) | `{{#focus.alunno.curriculum}}{{materiaNome}}: {{#specifiche}}{{nome \| capitalize}}{{/specifiche}}{{/focus.alunno.curriculum}}` |
| Piani personalizzati di classe | `{{#bullet_list:focus.classe.didattica.pianiPersonalizzati.items}}{{studente.nomeCompleto}} — {{sottotipo}}{{/bullet_list}}` |

### 9.3 Loop Sheets

| Esigenza | Direttiva |
| :--- | :--- |
| Righe dinamiche (roster) | `{{dynamic_rows[source=focus.classe.studenti.listaCompleta,value=anagrafica.nomeCompleto]}}` |
| Colonne materie multi-gruppo | `{{dynamic_columns[source=focus.classe.sheet.materieColonne.group1,value=header,source2=focus.classe.sheet.materieColonne.group2,value2=header,label2=focus.classe.sheet.materieColonne.group2Label,source3=...,label3=...]}}` |

### 9.4 Condizioni (sezioni Mustache)

| Esigenza | Sezione |
| :--- | :--- |
| La classe ha progetti | `{{#hasProgetti}} ... {{/hasProgetti}}` |
| L'alunno ha bocciature | `{{#focus.alunno.storico.hasBocciature}} ... {{/focus.alunno.storico.hasBocciature}}` (guardare anche `{{^}}`) — richiede che il provider storico abbia già `.get()`-ato il `LazyRef` a monte (§8.6) |
| Materia con ITP | `{{#hasItp}} ... {{/hasItp}}` su un item di `focus.classe.materie` |
| Carenze presenti | `{{#focus.alunno.didattica.carenze.hasCarenze}} ... {{/focus.alunno.didattica.carenze.hasCarenze}}` |

### 9.5 Filtri pipe: ammessi e vietati

**Ammessi (presentazione/forma):** `uppercase`, `lowercase`, `capitalize`, `date`, `number`, `join`, `map`, `limit`, `skip`, `sort`, `sortBy`, `reverse`, `default`, `fallback`, `truncate`, `split`, `replace`, `urlEncode`, `plus`, `minus`, `pluralize`.

- Esempi leciti: `{{nome | uppercase}}`, `{{focus.classe.coordinatori.elenco | sortBy:'nome'}}`, `{{docenti | map:'nomeCompleto' | join:', '}}`.

**Vietati (valori di dominio):** `where`/`exclude`/`filter` con **valori di dominio** hardcodati come argomento (`where:'tipoArticolazione','COMUNE'`, `where:'prova','PRIMA_PROVA'`, `exclude:'sigla','IRC'`). Questi raggruppamenti sono già precalcolati in array dedicati (Principio 3).

- Eccezione tollerata: `where`/`filter` su **proprietà booleane di shape** (`filter:'isBes',true`, `filter:'isAsl',true`) — il valore `true` è struttura, non dato di dominio.

---

## 10. Esempio Completo JSON di un CDU assemblato

Il seguente esempio illustra il CDU reale prodotto per una classe articolata, con particolare enfasi sui nodi ristrutturati (`curriculum`, `perSpecificita`, partizioni `esame`/`consiglioDiClasse`, stringhe precomposte).

```json
{
  "meta": {
    "timestamp": "2026-03-30T10:00:00.000Z",
    "idConfigurazione": "VERBALE_CDC",
    "tipoOperazione": "GENERAZIONE_DOCUMENTO",
    "idEsecuzione": "EXEC-2026-99812",
    "date": { "oggi": { "breve": "30/03/2026", "estesa": "30 marzo 2026", "iso": "2026-03-30", "giorno": "30", "mese": "03", "anno": "2026", "ora": "10:00" } },
    "configurazioneBox": { "boxAttivi": [], "boxVuotiNascosti": [], "ordineVisualizzazione": [] },
    "parametriInput": {
      "target": "5AB-LC-LS",
      "tipoTarget": "classe",
      "materiaCorrente": null,
      "opzioni": {
        "includiStorico": true,
        "profonditaAnniStorico": 2,
        "profonditaAnniAsl": 2,
        "profonditaAnniDocumenti": 2,
        "includiSupplenti": true,
        "notificaSoloCoordinatori": false,
        "includiPartnerDettaglio": true,
        "gestioneSupplenti": "ENTRAMBI"
      }
    }
  },
  "istituto": {
    "organizzazione": { "annoScolastico": "2025-2026", "dirigente": { "nomeCompleto": "Prof.ssa Maria Bianchi" } },
    "staff": {
      "referenteBes": { "nome": "Mario", "cognome": "Rossi", "email": "mario.rossi@scuola.edu.it", "genere": "M", "appellativo": "Prof.", "articolo": "il", "coordinatore": "coordinatore", "nomeCompleto": "Mario Rossi", "materia": null, "appellativoCompleto": "Prof. Mario Rossi", "appellativoCognome": "Prof. Rossi" },
      "animatoreDigitale": null
    },
    "statistiche": { "totaleClassi": 32, "totaleDocenti": 84, "totaleAlunni": 650 }
  },
  "focus": {
    "classe": {
      "anagrafica": {
        "nome": "5AB-LC-LS",
        "anno": 5,
        "sezione": "AB",
        "annoScolastico": "2025-2026",
        "indirizzo": { "sigla": "LC", "nome": "Liceo Classico", "nomeSintetico": "Classico", "tipo": "LICEO" }
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
            "evoluzione": null
          }
        ]
      },
      "coordinatori": {
        "appellativo": "prof.ssa",
        "articolo": "la",
        "coordina": "coordina",
        "presiede": "presiede",
        "elenco": [
          {
            "nome": "Laura",
            "cognome": "Gialli",
            "email": "laura.gialli@scuola.edu.it",
            "genere": "F",
            "appellativo": "Prof.ssa",
            "articolo": "la",
            "coordinatore": "coordinatrice",
            "nomeCompleto": "Laura Gialli",
            "materia": "Greco",
            "appellativoCompleto": "Prof.ssa Laura Gialli",
            "appellativoCognome": "Prof.ssa Gialli"
          }
        ]
      },
      "tutor": {
        "appellativo": "prof.ssa",
        "articolo": "la",
        "tutor": "tutor",
        "asl": [
          {
            "nome": "Giulia",
            "cognome": "Russo",
            "email": "giulia.russo@scuola.edu.it",
            "genere": "F",
            "appellativo": "Prof.ssa",
            "articolo": "la",
            "coordinatore": "coordinatrice",
            "nomeCompleto": "Giulia Russo",
            "materia": null,
            "appellativoCompleto": "Prof.ssa Giulia Russo",
            "appellativoCognome": "Prof.ssa Russo"
          }
        ],
        "orientamento": []
      },
      "rappresentanti": {
        "studenti": [{ "nomeCompleto": "Marco Neri", "email": "marco.neri@alunni.edu.it", "indirizzo": { "nome": "Liceo Classico" } }],
        "genitori": [{ "nomeCompleto": "Giuseppe Neri", "studente": { "nomeCompleto": "Marco Neri" }, "indirizzo": { "nome": "Liceo Classico" } }]
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
            "materia": null,
            "appellativoCompleto": "Prof. Mario Rossi",
            "appellativoCognome": "Prof. Rossi"
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
              "evoluzione": null
            }
          ],
          "materieDescrizione": "Italiano",
          "materieSigle": "ITA",
          "ruoli": { "isCoordinatore": false, "isTutorAsl": false, "isTutorOrientamento": false, "descrizione": ["Docente"] },
          "stato": { "isSupplente": false, "sostituisce": null },
          "tipoArticolazione": "COMUNE",
          "gruppoNome": null,
          "isITP": false,
          "flags": { "isNotLast": true }
        }
      ],
      "consiglioDiClasseComune": [],
      "consiglioDiClasseSeparato": [],
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
          "evoluzione": { "siglePrecedenti": [{ "sigla": "GST", "nome": null, "anni": [1, 2] }] },
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
              "appellativoCompleto": "Prof. Mario Rossi",
              "appellativoCognome": "Prof. Rossi"
            }
          ],
          "docentiDescrizione": "Prof. Mario Rossi",
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
                  "materia": null,
                  "appellativoCompleto": "Prof. Mario Rossi",
                  "appellativoCognome": "Prof. Rossi"
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
        "hasEsame": true,
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
                "materia": null,
                "appellativoCompleto": "Prof. Mario Rossi",
                "appellativoCognome": "Prof. Rossi"
              }
            ],
            "docentiDescrizione": "Prof. Mario Rossi"
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
            "appellativoCompleto": "Prof. Mario Rossi",
            "appellativoCognome": "Prof. Rossi",
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
        ],
        "materiePrimaProva": [
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
                "materia": null,
                "appellativoCompleto": "Prof. Mario Rossi",
                "appellativoCognome": "Prof. Rossi"
              }
            ],
            "docentiDescrizione": "Prof. Mario Rossi"
          }
        ],
        "materieSecondaProva": [],
        "docentiPrimaProva": [],
        "docentiSecondaProva": []
      },
      "hasProgetti": true,
      "progetti": [
        {
          "tipo": "ASL",
          "tipoLabel": "PCTO/ASL",
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
            "materia": null,
            "appellativoCompleto": "Prof.ssa Anna Ferrari",
            "appellativoCognome": "Prof.ssa Ferrari"
          },
          "ore": 30,
          "oreAsl": 30,
          "isAsl": true
        }
      ],
      "studenti": {
        "listaCompleta": [
          {
            "anagrafica": { "nomeCompleto": "Marco Neri", "email": "marco.neri@alunni.edu.it" },
            "classe": { "nome": "5AB-LC-LS" },
            "indirizzo": { "nome": "Liceo Classico", "nomeSintetico": "Classico" },
            "status": {
              "isBes": false,
              "isRipetente": false,
              "isRappresentante": true,
              "religione": "IRC",
              "religioneLabel": "Religione cattolica"
            },
            "curriculum": [
              {
                "materiaId": "INTERPRETAZIONE",
                "materiaSigla": "INT",
                "materiaNome": "Esecuzione ed interpretazione",
                "specifiche": [{ "nome": "chitarra" }]
              }
            ],
            "didattica": {
              "carenze": { "hasCarenze": false, "numero": 0, "dettaglio": [] },
              "piani": { "hasPiani": false, "hasBes": false, "items": [] },
              "pcto": { "oreCumulate": 60 }
            }
          }
        ],
        "statistiche": { "totale": 24, "conPianiDidattici": 2, "conBes": 2, "conDsa": 1, "ripetenti": 0, "rappresentanti": 2 },
        "perSpecificita": [
          {
            "materiaId": "INTERPRETAZIONE",
            "materiaSigla": "INT",
            "materiaNome": "Esecuzione ed interpretazione",
            "specifiche": [
              {
                "nome": "chitarra",
                "alunni": [{ "nome": null, "cognome": null, "nomeCompleto": "Marco Neri", "email": "marco.neri@alunni.edu.it" }]
              }
            ]
          }
        ]
      },
      "elencoMaterieConPermessi": [],
      "sheet": {
        "materieColonne": {
          "group1": [{ "sigla": "REL/ALT", "header": "REL/ALT", "isSpecial": true, "roles": ["IRC", "ALT"] }],
          "group2": [],
          "group3": [],
          "group2Label": "Materie",
          "group3Label": ""
        }
      },
      "didattica": {
        "pianiPersonalizzati": { "items": [] },
        "documenti": { "items": [], "hasDocumenti": false }
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
      "materia": null,
      "appellativoCompleto": "Prof. Mario Rossi",
      "appellativoCognome": "Prof. Rossi"
    },
    "ruoliAttivi": [],
    "flags": {
      "isCoordinatore": false,
      "isTutor": false,
      "isTutorAsl": false,
      "isDocenteSostegno": false,
      "isSupplente": false
    },
    "contesto": { "sostituisce": null, "classiCompetenza": ["5AB-LC-LS"], "materieCompetenza": [] },
    "comunicazione": { "salutoIniziale": "Gentile Prof. Rossi,", "oggettoCalcolato": "Convocazione CDC 5AB-LC-LS", "testoContenutoPuro": "" }
  },
  "render": { "boxes": {}, "body": { "htmlCompleto": "", "htmlSoloContenuto": "" } }
}
```

---

## 11. Regole di validazione (Mapping, Mappers & Divieti)

1. **Array-prima (vincolo strutturale).** Nessuna mappa a chiavi dinamiche nei punti iterabili: `curriculum` e `perSpecificita` sono array (§8.8, §8.9). Qualsiasi tentativo di esporre mappe `{"[MateriaId]": ...}` in questi nodi è un errore di mappatura.
2. **Self-containment (vincolo placeholder).** Gli item degli array principali (`consiglioDiClasse`, `studenti.listaCompleta`, `materie`, `articolazione.*`) NON devono richiedere navigazione parent né path assoluti lunghi per i dati di contesto più comuni (classe, indirizzo, appellativo).
3. **Stringhe pronte (vincolo placeholder).** `PersonVM.appellativoCompleto`/`appellativoCognome`, `DocenteCdcVM.materieDescrizione`/`materieSigle`/`gruppoNome`, `SubjectVM.docentiDescrizione`, `ProgettoVM.tipoLabel`, `StudentVM.status.religioneLabel`, `piani.items[].tipoLabel` sono OBBLIGATORI dove previsti: i template non devono concatenare.
4. **Partizioni precalcolate.** `consiglioDiClasseComune`/`consiglioDiClasseSeparato`, `esame.materiePrimaProva`/`materieSecondaProva`/`docentiPrimaProva`/`docentiSecondaProva` devono essere popolati per ogni recipe che assembla il relativo contesto; i template NON usano `where` con valori di dominio.
5. **Standardizzazione PersonVM.** Nessun array nel CDU può esporre docenti o soggetti sotto forma di sole stringhe o con forme anagrafiche incomplete: l'uso del builder `PersonVM` (§8.1) è OBBLIGATORIO.
6. **Standardizzazione SubjectVM.** Ogni materia (sia in forma singola che in array) DEVE essere processata tramite il mapper `SubjectVM` (§8.2) garantendo la risoluzione delle sigle evolutive per l'anno di corso della classe (`ANNO`).
7. **Assenza di mapping legacy.** Qualsiasi tentativo di accedere a proprietà non presenti in questo documento (es. `studenti.perIndirizzo`, `studenti.indirizziPresenti`, `curriculum["INTERPRETAZIONE"]`, `perSpecificita["INTERPRETAZIONE"]["chitarra"]`) DEVE sollevare un errore a tempo di compilazione/mappatura.
8. **Budget placeholder.** Violazioni del budget di lunghezza (Principio 6) vanno risolte denormalizzando nel CDU, non allungando i placeholder.
9. **LazyRef non serializzato direttamente.** `focus.classe.storico`, `focus.alunno.storico`, `*.didattica.documenti.storico`, `*.didattica.pianiPersonalizzati.storico` sono `LazyRef<T>` (CoreUtilsLib): il consumatore (box renderer o step) DEVE chiamare `.get()` prima di leggerne le proprietà; nessun placeholder può assumere che il nodo sia già un valore piatto senza che qualcosa a monte lo abbia materializzato.
