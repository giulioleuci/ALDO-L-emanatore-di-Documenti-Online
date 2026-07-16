# 02 — Struttura del Contesto Dati Unificato (CDU)

Il **CDU (Contesto Dati Unificato)** è l'oggetto centrale attorno al quale ruota ogni operazione di SGSA. Prima di generare un documento o inviare una email, il `ContextBuilder` DEVE assemblare un CDU che aggrega tutti i dati necessari in un'unica struttura gerarchica. Template, box renderer ed espressioni condizionali DEVONO leggere ESCLUSIVAMENTE dal CDU.

**Fonte di verità:** Tutti i percorsi di accesso ai dati del contesto (es. `focus.classe.anagrafica.nome`) DEVONO corrispondere esattamente alla struttura descritta in questo documento. Un percorso non presente in questo documento NON DEVE essere usato nei template, nei box o nelle espressioni.

---

## 1. Struttura generale

Il CDU è diviso in sei sezioni di primo livello:

| Sezione        | Scopo                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| `meta`         | Dati tecnici: timestamp, ID esecuzione, date formattate, parametri input |
| `istituto`     | Dati globali dell'istituzione scolastica                                 |
| `focus`        | Il cuore dei dati di business (classe e/o alunno)                        |
| `destinatario` | Dati specifici del destinatario dell'operazione corrente                 |
| `render`       | HTML pre-renderizzato dei box email (solo pipeline email)                |
| `tech`         | Oggetti vivi (istanze di entità e servizi, non serializzabili)           |

---

## 2. Sezione `meta`

Contiene i metadati dell'operazione corrente.

```
meta:
  timestamp           — ISO 8601 del momento di costruzione del CDU
  idConfigurazione    — ID del record CONF_DOC o CONF_MAIL attivo
  tipoOperazione      — es. "GENERAZIONE_DOCUMENTO", "INVIO_NOTIFICA"
  idEsecuzione        — ID univoco del job corrente

  date:
    oggi:
      breve           — "DD/MM/YYYY"
      estesa          — "DD mese YYYY"
      iso             — "YYYY-MM-DD"
      giorno          — "DD"
      mese            — "MM"
      anno            — "YYYY"
      ora             — "HH:MM"

  configurazioneBox:
    boxAttivi           — array di ID box da mostrare
    boxVuotiNascosti    — array di ID box da nascondere perché privi di dati
    ordineVisualizzazione — array ordinato di ID box

  parametriInput:
    target            — es. "5A"
    tipoTarget        — es. "classe", "alunno"
    materiaCorrente   — MateriaId | null — materia di contesto dell'operazione (es. quando l'operazione riguarda una specifica cattedra); letta da `DocenteMateriaStrategy` e `CapoDipartimentoStrategy` (vedi `14_SERVIZI_UTILITY.md`)
    opzioni:
      includiStorico          — boolean
      profonditaAnniStorico   — number
      profonditaAnniAsl       — number
      profonditaAnniDocumenti — number
      includiSupplenti        — boolean
      includiSpecificita       — boolean — abilita focus.classe.studenti.perSpecificita (vedi §4.1)
      notificaSoloCoordinatori — boolean
```

---

## 3. Sezione `istituto`

Dati globali dell'istituzione scolastica. Compilata dal `SchoolProvider`.

```
istituto:

  organizzazione:
    annoScolastico      — es. "2025-2026"
    dirigente

  staff:
    referenteBes        - es. ROSSI MARIO
    animatoreDigitale   - es. BIANCHI LUIGI

  statistiche:
    totaleClassi
    totaleDocenti
    totaleAlunni
```

---

## 4. Sezione `focus`

È il cuore del CDU. Contiene i dati di business oggetto dell'operazione corrente. Può essere popolato con dati di classe, di alunno, o di entrambi a seconda della recipe attiva.

### 4.1 `focus.classe`

```
focus.classe:
  anagrafica:
    nome                — es. "5A"
    anno                — number (1–5)
    sezione
    indirizzo:
      nome / nomeSintetico / sigla / tipo

  flags:
    isClassePrima       — boolean
    isTriennio          — boolean
    isPrimoBiennio      — boolean
    isTerminale         — boolean
    isArticolata        — boolean

  articolazione:        — presente solo se isArticolata = true
    partner             — ClasseId | null   — per classe partner: l'altro partner; per classe parent: null
    partners            — ClasseId[] | null — per classe parent: i due partner, in ordine [primo, secondo]; per classe partner/standard: null
    parent              — ClasseId | null
    materieCondivise    — array di sigle materia
    materieSeparatePrimoGruppo  — array di sigle materia
    materieSeparateSecondoGruppo  — array di sigle materia

  coordinatori:       array di { nome, email, materia, appellativo }
  tutor:            — compilato dal TutorProvider
    asl:            array di { nome, email }   — da CLASSI.RUOLI chiave "TUTOR_ASL"
    orientamento:   array di { nome, email }   — da CLASSI.RUOLI chiave "TUTOR_ORIENT"
  rappresentanti:
    studenti:         array di { nomeCompleto, email }
    genitori:         array di { nomeCompleto }       — ALUNNI.RAPPR_GEN contiene il nome del genitore (testo libero); nessuna email è disponibile per questo ruolo, né è prevista

  consiglioDiClasse:    array di oggetti docente-nel-CDC:
    [i]:
      anagrafica:       { nome, cognome, email, genere, appellativo }
      materie:        array di { sigla, nome, colore, specificita }
                      — specificita: string | null  (es. "CHITARRA"; null per materie senza specificità)
      ruoli:
        isCoordinatore
        isTutorAsl
        isTutorOrientamento
        descrizione     — array di {"Coordinatore" | "Tutor ASL" | "Docente"}
      stato:
        isSupplente   boolean
        sostituisce:    { nome, email } | null
      tipoArticolazione: "COMUNE" | "SEPARATO_PRIMO" | "SEPARATO_SECONDO" | null
                         — null per classi standard; indica il ruolo del docente
                           nelle classi articolate
      isITP:            boolean   — true se il docente insegna in una colonna .itp (Insegnante Tecnico Pratico)
      flags:
        isNotLast       — boolean (per loop Mustache)

  studenti:
    listaCompleta:      array di oggetti alunno-nel-contesto:
      [i]:
        anagrafica:     { nomeCompleto, email }
        status:         { isBes, isRipetente, isRappresentante, religione }
        curriculum:
          "[MateriaId]":
            specifiche: string[]
        didattica:
          carenze:      { hasCarenze, numero, dettaglio[] }
          piani:        { hasPiani, hasBes, items[]: { tipo, isBes } }  — lista piani per lo studente (popolata da StudentiProvider, sorgente PIANI)
          pcto:         { oreCumulate }
    statistiche:
      totale
      conPianiDidattici
      conBes
      conDsa
      ripetenti
      rappresentanti

    perIndirizzo:       — presente solo per classi articolate
      "[SIGLA_IND]":    array di alunni
    indirizziPresenti:  — string[], presente solo per classi articolate
    perSpecificita:     — presente solo se la recipe specifica l'opzione includiSpecificita: true
      "[MateriaId]":
        "[specifica]":  array di alunni

  elencoMaterieConPermessi:  — array | assente
                     Presente solo quando la recipe attiva l'espansione orizzontale
                     delle materie con permessi granulari (Google Sheets). Prodotto
                     da un ViewModelMapper/Interceptor del Context Engine, non da un
                     provider standard. Ogni elemento descrive una colonna materia;
                     il primo elemento è l'accorpamento speciale IRC/ALT.
                     Specifica completa in `MAT_NON_STANDARD.md`.
```

### 4.2 `focus.alunno`

```
focus.alunno:
  anagrafica:
    nomeCompleto
    email

  status:
    religione         — ReligioneScelta (SI | NO | ALT)
    isBes             — boolean
    isRipetente       — boolean
    isRappresentante  — boolean

  curriculum:
    "[MateriaId]":          — es. "INTERPRETAZIONE"
      specifiche: string[]  — es. ["CHITARRA", "PIANOFORTE"]

  classe:
    nome
    indirizzoSigla
    indirizzoNome

  consiglioDiClasseFiltrato:    array di oggetti docente-nel-CDC filtrato in base a due criteri indipendenti:
                                 1. scelta di religione dell'alunno (IRC/ALT/NO), da `focus.alunno.status.religione`
                                 2. specificità scelte dall'alunno per le materie che le prevedono, da `ALUNNI.CURRICULUM`
                                    (JSON `{ "[MateriaId]": string[] }`, vedi `01_SCHEMA_DATABASE.md`), esposte nel CDU
                                    in `focus.alunno.curriculum["[MateriaId]"].specifiche`: i docenti che insegnano una
                                    specificità non presente nel curriculum dell'alunno per quella materia sono esclusi
                                 Logica completa in `14_SERVIZI_UTILITY.md`, sezione 1.3 (`CDCFilterAlunnoStrategy`).
    [i]:
      anagrafica:       { nome, cognome, email, genere, appellativo }
      materie:        array di { sigla, nome, colore, specificita }
                      — specificita: string | null  (es. "CHITARRA"; null per materie senza specificità)
      ruoli:
        isCoordinatore
        isTutorAsl
        isTutorOrientamento
        descrizione     — array di {"Coordinatore" | "Tutor ASL" | "Docente"}
      stato:
        isSupplente   boolean
        sostituisce:    { nome, email } | null
      tipoArticolazione: "COMUNE" | "SEPARATO_PRIMO" | "SEPARATO_SECONDO" | null
                         — null per classi standard; indica il ruolo del docente
                           nelle classi articolate
      isITP:            boolean   — true se il docente insegna in una colonna .itp (Insegnante Tecnico Pratico)
      flags:
        isNotLast       — boolean (per loop Mustache)

  didattica:
    carenze:
      dettaglio:        array di { materia (sigla), voto }
      numero
      hasCarenze

    asl:
      oreCumulate
      oreAnnoCorrente

    piani:
      items: array di {
        tipo
        isBes
        link
        parametriGenerazione — oggetto JSON da PIANI.PARAMETRI (struttura dipende dal tipo, vedi 01)
      }
      hasPiani: boolean
      hasBes:   boolean

    documenti:               — popolato da `DocumentiProvider`, attivo in `ALUNNO_DETTAGLIATO` e `FAMIGLIA_COMPLETO`
      items: array di { nome, link, tipo, stato, dataCreazione }
      hasDocumenti: boolean
```

### 4.3 `focus.carenza`

Presente solo nella pipeline `PER_CARENZA`. Popolata dal `CarenzaFocusProvider` (vedi `09_CONTEXT_ENGINE.md`), attivo solo nella recipe `CARENZA_COMPLETO`.

```
focus.carenza:
  studente        — email dello studente
  progressivo     — progressivo della riga CARENZE
  data            — data della rilevazione
  classe          — ClasseId al momento della rilevazione
  hasAssenze      — boolean (flag ASSENZE)
  note            — testo libero NOTE
```

---

## 5. Sezione `destinatario`

Arricchita dal `BuildCDUStep` con i dati specifici di chi riceve l'operazione (email o permesso).

```
destinatario:
  anagrafica:
    nome / cognome / nomeCompleto / email / appellativo / genere

  ruoliAttivi           — array di ruoli attivi nel contesto corrente

  flags:
    isCoordinatore
    isTutor
    isTutorAsl
    isDocenteSostegno
    isSupplente

  contesto:
    sostituisce:        { nome, email } | null
    classiCompetenza:   array di ClasseId
    materieCompetenza:  array di MateriaId

  comunicazione:
    salutoIniziale      — es. "Gentile Prof. Verdi,"
    oggettoCalcolato    — oggetto email risolto
    testoContenutoPuro  — versione plain-text del contenuto (per log)
```

---

## 6. Sezione `render`

Presente solo nella pipeline email. Contiene l'HTML pre-renderizzato di ogni box. Popolata dal `RenderBoxesStep`.

```
render:
  boxes:
    "[TIPO_BOX]":
      id              — chiave del box (uguale a TIPO_BOX)
      titolo          — titolo del box (da BOX_CFG, risolto con placeholder)
      html            — stringa HTML interna al box (prodotta dal renderer)
      isEmpty         — boolean: true se html è vuoto
      visibile        — boolean: true se html non è vuoto

  body:
    htmlCompleto      — email HTML completa (msgstart + contenuto + msgend)
    htmlSoloContenuto — solo il div del contenuto, senza wrapper
```

---

## 7. Sezione `tech`

Contiene oggetti vivi (istanze di classi con metodi) non serializzabili in JSON. La sezione `tech` DEVE essere definita con `Object.defineProperty(..., { enumerable: false })`, così da NON apparire MAI in `JSON.stringify()` e prevenire log giganteschi e riferimenti circolari.

```
tech:
  entita:
    classe         — istanza Classe con metodi
    alunno         — istanza Alunno con metodi
    docente        — istanza Docente con metodi
    patternEmail   — istanza ConfigurazioneEmail
    documentoMetadato — istanza ConfigurazioneDocumento

  servizi: array di servizi

  pipeline:
    statoCorrente   — es. "IN_CORSO"
    stepEseguiti    — array di nomi step completati
    errori          — array di errori non critici
    logEsecuzione   — array di stringhe log con timestamp
```

---

## 8. Nota sul ViewModelMapper

Le entità in `tech.entita` contengono metodi e riferimenti che NON sono — e NON DEVONO MAI essere — accessibili nei template. Prima che il CDU venga passato a `WorkspaceTemplateEngine` o ai box renderer, un `ViewModelMapper` specifico per la recipe DEVE convertire le entità di dominio in plain objects con sole proprietà scalari serializzabili. SOLO queste proprietà sono accessibili nei placeholder `{{percorso.nel.cdu}}`.

Il blocco `tech` NON DEVE MAI essere serializzato né essere accessibile come variabile di template.
