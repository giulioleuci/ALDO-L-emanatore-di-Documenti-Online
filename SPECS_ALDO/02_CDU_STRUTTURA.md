# CDU ottimizzato — specifica autonoma

## 0. Scopo e regole normative

Il Contesto Dati Unificato (CDU) è il contratto JSON usato da generatori di documenti, notifiche email, box di contenuto e proiezioni Sheets. Questa specifica definisce integralmente il formato futuro del CDU.

Il CDU segue queste regole:

1. **Nomi italiani.** Nodi, campi, etichette e valori applicativi usano il lessico italiano. I prefissi tecnici `is` e `has` identificano rispettivamente uno stato booleano e la presenza di un valore o di una collezione.
2. **Entità piatte.** I dati principali di classe, alunno, docente e destinatario sono esposti direttamente sul relativo VM.
3. **Array iterabili.** Ogni collezione destinata ai template è un array raggiungibile tramite un percorso stabile. Le mappe dinamiche sono ammesse solo quando serve l'accesso diretto per ID e devono avere una proiezione iterabile equivalente.
4. **Item autosufficienti.** Un elemento iterato contiene i dati necessari alla propria stampa senza navigazione al nodo padre.
5. **Partizioni precalcolate.** I template non filtrano valori di dominio. Il CDU espone array dedicati per le partizioni richieste, come entrate/uscite, prima/seconda prova, comune/separato.
6. **Testi pronti.** Label, descrizioni e concatenazioni ricorrenti sono calcolate dal CDU. I template non ricostruiscono concordanze di genere o numero.
7. **Collezioni verificabili.** Ogni array che può governare una condizione ha un booleano `hasXxx`; i contenitori principali espongono anche `numero`.
8. **Assenza esplicita.** Un nodo dipendente dalla recipe è omesso quando il provider non viene eseguito. Dentro un nodo presente, un riferimento non disponibile vale `null` e una collezione senza elementi vale `[]`. I campi esclusi dal profilo dichiarato di un VM sono omessi.
9. **Ordine deterministico.** Ogni elenco dichiara un ordinamento stabile. In assenza di una regola specifica si usa l'ordine alfabetico della descrizione primaria.
10. **Percorso unico.** Ogni dato ha un solo percorso canonico.
11. **Date.** Le date tecniche usano `YYYY-MM-DD`; i timestamp usano ISO 8601. Le forme pronte per la stampa sono campi separati.
12. **Compatibilità GAS V8.** Il CDU contiene solo dati serializzabili, salvo la sezione tecnica non enumerabile.

### 0.1 Convenzione per le collezioni

Quando una collezione costituisce un nodo autonomo usa questa forma:

```yaml
ElencoVM<T>:
  elenco: T[] # Elementi ordinati e direttamente iterabili dai template
  hasElenco: boolean # true se elenco contiene almeno un elemento
  numero: number # Sempre uguale a elenco.length
```

Il nodo può aggiungere descrizioni e partizioni, ma non rinomina i tre campi di base.

### 0.2 Convenzioni grammaticali

I campi grammaticali atomici iniziano sempre con la maiuscola. Le descrizioni composte usano invece il formato frase: soltanto la prima parola grammaticale inizia con la maiuscola; articoli, ruoli, appellativi e verbi successivi iniziano con la minuscola. La grafia di nomi e cognomi viene conservata senza trasformazioni.

Per un gruppo di docenti, i valori di `collettivo` sono calcolati così:

| Composizione                     | `articolo` | `appellativo` | `coordinamento` | `coordina`   | `presiede`   |
| -------------------------------- | ---------- | ------------- | --------------- | ------------ | ------------ |
| Una docente                      | `La`       | `Prof.ssa`    | `Coordinatrice` | `Coordina`   | `Presiede`   |
| Un docente                       | `Il`       | `Prof.`       | `Coordinatore`  | `Coordina`   | `Presiede`   |
| Più docenti, tutte di genere `F` | `Le`       | `Prof.sse`    | `Coordinatrici` | `Coordinano` | `Presiedono` |
| Più docenti, almeno uno non `F`  | `I`        | `Prof.`       | `Coordinatori`  | `Coordinano` | `Presiedono` |

Un genere `null` non soddisfa la condizione "tutte di genere `F`" e usa quindi la forma maschile. Con `numero = 0`, tutti i campi grammaticali del collettivo valgono `""`.

Le descrizioni di docenti usano l'appellativo individuale davanti a ogni nome. Una descrizione `Estesa` aggiunge anche l'articolo individuale davanti a ciascun appellativo. Con due persone si usa `e`; con tre o più si usano virgole e `e` prima dell'ultimo elemento. Il primo termine grammaticale della frase inizia con la maiuscola; quelli successivi iniziano con la minuscola.

```text
elencoDescrizione:        Prof. ROSSI MARIO e prof.ssa BIANCHI ANNA
elencoDescrizioneEstesa: Il prof. ROSSI MARIO e la prof.ssa BIANCHI ANNA
elencoDescrizioneElenco: Prof. ROSSI MARIO, prof.ssa BIANCHI ANNA
descrizioneRuolo:        Coordinatori prof. ROSSI MARIO e prof.ssa BIANCHI ANNA
descrizioneRuoloEstesa:  I coordinatori prof. ROSSI MARIO e prof.ssa BIANCHI ANNA
```

I valori atomici `appellativoCompleto` e `appellativoCompletoEsteso` restano rispettivamente `Prof. ROSSI MARIO` e `Il prof. ROSSI MARIO`: iniziano con la maiuscola perché sono utilizzabili autonomamente. Eventuali trasformazioni richieste dal contesto del template sono applicate tramite filtri pipe. Nome e cognome mantengono sempre la forma presente nel database. Per una persona con `genere = null`, i campi grammaticali individuali valgono `null` se non esiste un titolo configurato.

### 0.3 Budget dei percorsi

- Dentro un loop: massimo tre segmenti.
- Fuori da un loop: massimo quattro segmenti.
- Un annidamento maggiore è ammesso solo per una partizione semantica che eviterebbe duplicazioni più ampie.

---

## 1. Struttura generale

```yaml
cdu:
  meta: MetadatiVM # Identità, data e opzioni dell'esecuzione corrente
  istituto: IstitutoVM # Dati globali; presente quando richiesto dalla recipe
  focus: ContestoFocusVM # Entità oggetto dell'operazione corrente
  destinatario: DestinatarioVM # Presente soltanto nella pipeline email
  render: RenderingVM # Contenuti HTML prodotti dalla pipeline email
  tech: ContestoTecnico # Riferimenti interni non enumerabili e non serializzati
```

`meta` è sempre presente. Le altre sezioni dipendono dalla recipe e dall'operazione.

---

## 2. Sezione `meta` — `MetadatiVM`

```yaml
MetadatiVM:
  timestamp: string              # Istante ISO 8601 di costruzione del CDU; es. "2026-08-31T09:30:00+02:00"
  configurazioneId: string       # ID della configurazione documento o email attiva
  esecuzioneId: string           # UUID del job; comune a tutte le operazioni dello stesso job
  tipoOperazione: "GENERAZIONE_DOCUMENTO" | "INVIO_NOTIFICA" # Valore tecnico per il routing
  tipoOperazioneLabel: "Generazione documento" | "Invio notifica" # Forma stampabile

  oggi:
    breve: string                # DD/MM/YYYY; es. "31/08/2026"
    estesa: string               # DD mese YYYY, con mese in italiano; es. "31 agosto 2026"
    giorno: string               # DD; es. "31"
    mese: string                 # MM; es. "08"
    meseNome: string             # Nome italiano del mese; es. "agosto"
    anno: string                 # YYYY; es. "2026"
    ora: string                  # HH:MM nel fuso dell'istituto; es. "09:30"

  target: string                 # Identificativo dell'entità richiesta alla recipe
  tipoTarget: "classe" | "alunno" | "docente" | "piano" | "carenza" | "materia" | "dipartimento" # Tipo del target
  materiaCorrente: string | null # Sigla materia quando l'asse è materia o cattedra; es. "MAT"

  opzioni:
    includiStorico: boolean       # Abilita i provider storici e i relativi LazyRef
    profonditaAnniStorico: number # Numero massimo di anni scolastici da consultare
    profonditaAnniAsl: number     # Profondità temporale del calcolo ASL/FSL
    profonditaAnniDocumenti: number # Profondità temporale dei log documentali
    includiSupplenti: boolean     # Include le assegnazioni temporanee dove previsto
    notificaSoloCoordinatori: boolean # Restringe i destinatari ai coordinatori
    includiPartnerDettaglio: boolean # Materializza le proiezioni delle classi partner
    gestioneSupplenti: "SOLO_TITOLARI" | "SOLO_SUPPLENTI" | "ENTRAMBI" # Politica di routing

  progressivo?: number           # Numero del prossimo file nella cartella; assente finché la cartella di destinazione non è risolta

  configurazioneBox:             # Presente quando l'operazione costruisce box email
    elenco:
      - boxId: string             # ID configurato del box
        ordine: number            # Posizione 1-based nell'email
        isAttivo: boolean         # true se il box è abilitato dalla configurazione
        isNascostoPercheVuoto: boolean # true se attivo ma privo di contenuto utile
    hasElenco: boolean            # true se esiste almeno un box conosciuto
    numero: number                # Numero totale dei box conosciuti
```

`progressivo` è opzionale: viene valorizzato solo dopo la risoluzione della cartella di destinazione. Prima di quel momento è assente; dopo è disponibile nel corpo del documento, nel nome file e nella registrazione del documento, ma non durante la risoluzione del percorso di destinazione.

---

## 3. Sezione `istituto` — `IstitutoVM`

```yaml
IstitutoVM:
  annoScolastico: string # Formato YYYY-YYYY; es. "2026-2027"
  dirigente: PersonaVM # Dirigente in carica per l'anno scolastico

  staff:
    perId:
      '[RUOLO_ID]': RuoloStaffVM # Accesso diretto per ID noto del ruolo
    elenco: RuoloStaffVM[] # Tutti i ruoli nell'ordine di configurazione
    hasElenco: boolean # true se la configurazione contiene ruoli
    numero: number # Numero dei ruoli, anche senza titolare

  statistiche: StatisticheIstitutoVM # Totali d'istituto; presente se richiesto
```

`staff.perId` consente l'accesso diretto quando il ruolo è noto. `staff.elenco` è la forma ordinata e iterabile. Entrambe le proiezioni contengono gli stessi `RuoloStaffVM`.

```yaml
RuoloStaffVM:
  ruoloId: string # Identificativo configurato del ruolo
  ruoloNome: string # Denominazione leggibile del ruolo; es. "Coordinatore di classe"
  persona: PersonaVM | null # Primo titolare risolto; null se non assegnato
  hasPersona: boolean # true se persona è valorizzata
  persone: PersonaVM[] # Tutti i titolari del ruolo, nell'ordine configurato
  hasPersone: boolean # true se il ruolo ha almeno un titolare
```

L'ordine di `staff.elenco` coincide con l'ordine della configurazione dei ruoli.

---

## 4. Sezione `focus` — `ContestoFocusVM`

La sezione contiene uno o più nodi coerenti con l'asse della recipe:

```yaml
ContestoFocusVM:
  classe: ClasseFocusVM # opzionale
  alunno: AlunnoFocusVM # opzionale
  piano: PianoFocusVM # opzionale
  carenza: CarenzaFocusVM # opzionale
  docente: PersonaVM # opzionale
  materia: MateriaVM # opzionale
  cattedre: CattedraVM[] # opzionale
  hasCattedre: boolean # presente con cattedre
  cattedreDescrizione: string # Classi e materie in forma stampabile; es. "3A — Matematica, Fisica"
  dipartimento: DipartimentoFocusVM # opzionale
```

### 4.1 `focus.classe` — `ClasseFocusVM`

```yaml
ClasseFocusVM:
  nome: string # Identificativo completo della classe
  anno: number # Anno di corso, normalmente da 1 a 5
  sezione: string # Sezione pura, senza anno o sigle d'indirizzo; es. "A"
  indirizzo: IndirizzoVM # Percorso di studi della classe focalizzata

  isClassePrima: boolean # true se anno = 1
  isTriennio: boolean # anno di corso >= 3
  isPrimoBiennio: boolean # true se anno di corso = 1 oppure 2
  isSecondoBiennio: boolean # anno di corso = 3 oppure 4
  isTerminale: boolean # da colonna CLASSE.TERMINALE
  isArticolata: boolean # true se partecipa a un gruppo articolato
  isParent: boolean # true per la classe contenitore del gruppo
  isSottoClasse: boolean # true per una classe partner del gruppo
  hasAsl: boolean # da colonna CLASSI.ASL: true se la classe è abilitata all'ASL/PCTO

  articolazione: ArticolazioneClasseVM # presente se isArticolata
  partner: PartnerClasseVM # opzionale

  coordinatori: CoordinatoriVM # Coordinatori della classe
  tutor: TutorClasseVM # Tutor ASL/FSL e orientamento
  rappresentanti: RappresentantiClasseVM # Rappresentanti studenti e genitori
  consiglio: ConsiglioClasseVM # Docenti effettivi, titolari e supplenze

  materie: MaterieClasseVM # Catalogo delle materie realmente presenti
  materiePerPrincipale: MateriePerPrincipaleVM # Raggruppamento delle specificità
  esame: EsameClasseVM # opzionale
  progetti: ProgettiClasseVM # Progetti dell'anno scolastico corrente
  studenti: StudentiClasseVM # Roster attivo e partizioni degli alunni
  movimenti: MovimentiClasseVM # Entrate, uscite e movimenti interni

  storico: LazyRef<StoricoClasseVM> # opzionale

  pianiPersonalizzati: PianiPersonalizzatiClasseVM # opzionale
  documenti: ElencoDocumentiVM # opzionale

  sheet: FoglioClasseVM # opzionale
```

#### Articolazione

```yaml
ArticolazioneClasseVM:
  classeSorella: ClasseRiferimentoVM | null # Altra partner; null sulla parent
  parent: ClasseParentVM | null # Parent del gruppo; null se non risolvibile

  sottoClassi: ClasseRiferimentoVM[] # Partner appartenenti alla parent
  hasSottoClassi: boolean # true soltanto quando sottoClassi non è vuoto

  materieComuni: MateriaVM[] # Materie condivise dall'intero gruppo
  materieSeparatePrimo: MateriaVM[] # Materie proprie della prima partner
  materieSeparateSecondo: MateriaVM[] # Materie proprie della seconda partner

  hasMaterieComuni: boolean # true se materieComuni non è vuoto
  hasMaterieSeparatePrimo: boolean # true se materieSeparatePrimo non è vuoto
  hasMaterieSeparateSecondo: boolean # true se materieSeparateSecondo non è vuoto

  materieComuniDescrizione: string # Nomi delle materie comuni separati da virgola; es. "Italiano, Storia"
  materieComuniSigle: string # Sigle delle materie comuni separate da virgola; es. "ITA, STO"
  materieSeparatePrimoDescrizione: string # Nomi delle materie della prima partner; es. "Laboratorio di elettronica"
  materieSeparatePrimoSigle: string # Sigle delle materie della prima partner; es. "L-ELE"
  materieSeparateSecondoDescrizione: string # Nomi delle materie della seconda partner; es. "Laboratorio di informatica"
  materieSeparateSecondoSigle: string # Sigle delle materie della seconda partner; es. "L-INF"
```

```yaml
ClasseParentVM:
  nome: string # Identificativo della parent
  anno: number # Anno di corso comune al gruppo
  indirizzi: IndirizzoVM[] # Indirizzi rappresentati dalle partner
  hasIndirizzi: boolean # true se indirizzi non è vuoto
  indirizziDescrizione: string # Nomi degli indirizzi separati da virgola; es. "Informatica, Elettronica"
```

#### Partner

```yaml
PartnerClasseVM:
  primo: ProiezioneClasseVM # Proiezione della prima partner configurata
  secondo: ProiezioneClasseVM # Proiezione della seconda partner configurata
  elenco: ProiezioneClasseVM[] # Forma iterabile nello stesso ordine
  hasElenco: boolean # true se almeno una proiezione è disponibile
  numero: number # Numero delle partner materializzate
```

Il nodo è presente quando la classe è articolata e la recipe richiede il dettaglio dei partner. Il consiglio di ciascun partner contiene la parte comune e la sola parte separata pertinente.

#### Coordinatori

```yaml
CoordinatoriVM:
  elenco: PersonaVM[] # Coordinatori ordinati per nome completo
  hasElenco: boolean # true se è stato risolto almeno un coordinatore
  numero: number # Numero dei coordinatori
  elencoDescrizione: string # Appellativo individuale davanti a ogni nome; formato frase; es. "Prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"
  elencoDescrizioneEstesa: string # Articolo e appellativo individuali davanti a ogni nome; formato frase; es. "Il prof. ROSSI MARIO e la prof.ssa BIANCHI ANNA"
  elencoDescrizioneElenco: string # Appellativo individuale davanti a ogni nome; formato elenco; es. "Prof. ROSSI MARIO, prof.ssa BIANCHI ANNA"
  descrizioneRuolo: string # Ruolo e persone; es. "Coordinatori prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"
  descrizioneRuoloEstesa: string # Articolo, ruolo e persone; es. "I coordinatori prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"

  collettivo:
    appellativo: string # Prof.ssa/Prof./Prof.sse/Prof. secondo genere e numero
    articolo: string # La/Il/Le/I secondo genere e numero
    coordinamento: string # Coordinatrice/Coordinatore/Coordinatrici/Coordinatori
    coordina: string # Coordina se numero = 1; Coordinano se numero > 1; "" se numero = 0
    presiede: string # Presiede se numero = 1; Presiedono se numero > 1; "" se numero = 0
    numero: number # Cardinalità su cui sono calcolati i valori collettivi
```

#### Tutor

```yaml
TutorClasseVM:
  asl: PersonaVM[] # Tutor ASL/FSL della classe
  orientamento: PersonaVM[] # Tutor per l'orientamento
  elenco: PersonaVM[] # Unione deduplicata dei due gruppi

  hasAsl: boolean # true se asl non è vuoto
  hasOrientamento: boolean # true se orientamento non è vuoto
  hasElenco: boolean # true se elenco non è vuoto
  numero: number # Cardinalità dell'elenco deduplicato

  aslDescrizione: string # Appellativi individuali e nomi dei tutor ASL/FSL; formato frase; es. "Prof. ROSSI MARIO"
  orientamentoDescrizione: string # Appellativi individuali e nomi dei tutor orientamento; formato frase; es. "Prof.ssa BIANCHI ANNA"
  elencoDescrizione: string # Appellativi individuali e nomi di tutti i tutor deduplicati; formato frase; es. "Prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"

  collettivo:
    appellativo: string # Prof.ssa/Prof./Prof.sse/Prof. secondo genere e numero
    articolo: string # La/Il/Le/I secondo genere e numero
    sostantivo: string # "Tutor"; forma invariabile al singolare e al plurale
    numero: number # Numero delle persone in elenco
```

`elenco` è l'unione di `asl` e `orientamento`, deduplicata per email.

#### Rappresentanti

```yaml
RappresentantiClasseVM:
  studenti:
    elenco: RappresentanteStudenteVM[] # Rappresentanti degli studenti
    hasElenco: boolean # true se l'elenco non è vuoto
    numero: number # Numero dei rappresentanti studenti
    elencoDescrizione: string # Nomi completi separati da virgola; es. "ROSSI MARIO, BIANCHI ANNA"

  genitori:
    elenco: RappresentanteGenitoreVM[] # Rappresentanti dei genitori
    hasElenco: boolean # true se l'elenco non è vuoto
    numero: number # Numero dei rappresentanti genitori
    elencoDescrizione: string # Nomi completi separati da virgola; es. "VERDI LUCA, NERI GIULIA"
```

#### Consiglio di classe

```yaml
ConsiglioClasseVM:
  elenco: DocenteCdcVM[] # Docenti effettivamente in servizio alla data di riferimento
  titolari: DocenteCdcVM[] # Titolari di ruolo, senza sostituzioni temporanee

  hasElenco: boolean # true se elenco non è vuoto
  hasTitolari: boolean # true se titolari non è vuoto
  numero: number # Cardinalità dei docenti effettivi in elenco
  elencoDescrizione: string # Appellativi individuali e nomi dei docenti effettivi; formato frase; es. "Prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"
  elencoDescrizioneEstesa: string # Articoli, appellativi individuali e nomi; formato frase; es. "Il prof. ROSSI MARIO e la prof.ssa BIANCHI ANNA"

  comune: DocenteCdcVM[] # Docenti delle materie comuni
  separato: DocenteCdcVM[] # Unione delle due quote separate
  separatoPrimo: DocenteCdcVM[] # Docenti della prima partner
  separatoSecondo: DocenteCdcVM[] # Docenti della seconda partner

  hasComune: boolean # true se comune non è vuoto
  hasSeparato: boolean # true se separato non è vuoto
  hasSeparatoPrimo: boolean # true se separatoPrimo non è vuoto
  hasSeparatoSecondo: boolean # true se separatoSecondo non è vuoto

  comuneDescrizione: string # Appellativi individuali e nomi dei docenti della quota comune; es. "Prof. ROSSI MARIO"
  separatoPrimoDescrizione: string # Appellativi individuali e nomi dei docenti della prima partner; es. "Prof.ssa BIANCHI ANNA"
  separatoSecondoDescrizione: string # Appellativi individuali e nomi dei docenti della seconda partner; es. "Prof. VERDI LUCA"

  supplenze: SupplenzaAggregataVM[] # Sostituzioni attive aggregate per coppia docente/titolare
  hasSupplenze: boolean # true se esiste almeno una sostituzione attiva
```

`elenco` contiene i docenti effettivi alla data di riferimento. `titolari` contiene i titolari di ruolo, applicando le variazioni permanenti e ignorando le supplenze temporanee.

#### Materie

```yaml
MaterieClasseVM:
  elenco: MateriaVM[] # Materie della classe ordinate per nome
  hasElenco: boolean # true se la classe possiede materie
  numero: number # Numero delle materie
  elencoDescrizione: string # Nomi estesi separati da virgola; es. "Matematica, Fisica"
  elencoDescrizioneSintesi: string # Nomi sintetici separati da virgola; es. "Mat., Fis."
  sigle: string # Sigle separate da virgola; es. "MAT, FIS"
```

Gli elementi usano il profilo `CON_DOCENTI` o `CON_CONTINUITA` di `MateriaVM`.

```yaml
MateriePerPrincipaleVM:
  elenco:
    - principaleId: string # ID canonico della materia principale
      nome: string # Nome della materia principale
      materie: MateriaVM[] # Specificità o materia base del gruppo
      hasMaterie: boolean # true se il gruppo contiene materie
      numero: number # Numero delle materie nel gruppo
      materieDescrizione: string # Nomi delle materie del gruppo; es. "Clarinetto, Flauto"
  hasElenco: boolean # true se esiste almeno un gruppo
  numero: number # Numero dei gruppi
```

#### Esame di Stato

```yaml
EsameClasseVM:
  hasEsame: boolean # true se la classe ha una configurazione d'esame valida

  materie: MateriaEsameVM[] # Materie coinvolte nelle prove scritte
  docenti: DocenteEsameVM[] # Docenti deduplicati per email e prova
  hasMaterie: boolean # true se materie non è vuoto
  hasDocenti: boolean # true se docenti non è vuoto

  materiePrimaProva: MateriaEsameVM[] # Materie associate alla prima prova
  materieSecondaProva: MateriaEsameVM[] # Materie associate alla seconda prova
  docentiPrimaProva: DocenteEsameVM[] # Docenti della prima prova
  docentiSecondaProva: DocenteEsameVM[] # Docenti della seconda prova

  hasMateriePrimaProva: boolean # true se materiePrimaProva non è vuoto
  hasMaterieSecondaProva: boolean # true se materieSecondaProva non è vuoto
  hasDocentiPrimaProva: boolean # true se docentiPrimaProva non è vuoto
  hasDocentiSecondaProva: boolean # true se docentiSecondaProva non è vuoto

  materiePrimaProvaDescrizione: string # Nomi delle materie della prima prova; es. "Italiano"
  materieSecondaProvaDescrizione: string # Nomi delle materie della seconda prova; es. "Matematica"
  docentiPrimaProvaDescrizione: string # Appellativi individuali e nomi dei docenti della prima prova; es. "Prof.ssa BIANCHI ANNA"
  docentiSecondaProvaDescrizione: string # Appellativi individuali e nomi dei docenti della seconda prova; es. "Prof. ROSSI MARIO"
```

Il nodo è presente soltanto per una classe terminale quando la recipe richiede i dati d'esame.

#### Progetti

```yaml
ProgettiClasseVM:
  elenco: ProgettoVM[] # Tutti i progetti della classe nell'anno corrente
  hasElenco: boolean # true se elenco non è vuoto
  numero: number # Numero totale dei progetti

  asl: ProgettoVM[] # Progetti con tipo ASL
  orientamento: ProgettoVM[] # Progetti con tipo ORIENTAMENTO
  altro: ProgettoVM[] # Progetti con tipo ALTRO

  hasAsl: boolean # true se asl non è vuoto
  hasOrientamento: boolean # true se orientamento non è vuoto
  hasAltro: boolean # true se altro non è vuoto
  oreAslTotali: number # Somma di oreAsl su tutti i progetti
```

#### Studenti

```yaml
StudentiClasseVM:
  elenco: AlunnoVM[]              # Studenti attivi nello scope della classe
  hasElenco: boolean              # true se il roster non è vuoto
  numero: number                  # Numero degli studenti attivi
  elencoDescrizione: string       # Nomi completi separati da virgola; es. "ROSSI MARIO, BIANCHI ANNA"

  statistiche: StatisticheAlunniVM # Conteggi calcolati sullo stesso elenco

  perStato:
    bes: AlunnoVM[]               # Studenti con almeno un piano che implica BES
    dsa: AlunnoVM[]               # Studenti con piano o stato DSA
    pfp: AlunnoVM[]               # Studenti con Piano Formativo Personalizzato
    pei: AlunnoVM[]               # Studenti con Piano Educativo Individualizzato
    ripetenti: AlunnoVM[]         # Studenti marcati ripetenti
    rappresentanti: AlunnoVM[]    # Rappresentanti degli studenti
    conPiani: AlunnoVM[]          # Studenti con almeno un piano

    hasBes: boolean              # true se bes non è vuoto
    hasDsa: boolean              # true se dsa non è vuoto
    hasPfp: boolean              # true se pfp non è vuoto
    hasPei: boolean              # true se pei non è vuoto
    hasRipetenti: boolean        # true se ripetenti non è vuoto
    hasRappresentanti: boolean   # true se rappresentanti non è vuoto
    hasConPiani: boolean         # true se conPiani non è vuoto

  perReligione:
    irc: AlunnoVM[]               # Studenti che si avvalgono dell'IRC
    alt: AlunnoVM[]               # Studenti assegnati ad attività alternativa
    no: AlunnoVM[]                # Studenti che non si avvalgono

    hasIrc: boolean              # true se irc non è vuoto
    hasAlt: boolean              # true se alt non è vuoto
    hasNo: boolean               # true se no non è vuoto

    ircDescrizione: string       # Nomi degli studenti IRC separati da virgola; es. "ROSSI MARIO, BIANCHI ANNA"
    altDescrizione: string       # Nomi degli studenti ALT separati da virgola; es. "VERDI LUCA"
    noDescrizione: string        # Nomi degli studenti NO separati da virgola; es. "NERI GIULIA"

    elenco:
      - codice: "IRC" | "ALT" | "NO" # Codice tecnico della scelta
        label: string                   # Etichetta italiana della scelta; es. "Insegnamento della religione cattolica"
        alunni: AlunnoVM[]              # Studenti appartenenti alla partizione
        hasAlunni: boolean              # true se alunni non è vuoto
        numero: number                  # Cardinalità della partizione

  perSpecificita: SpecificitaAlunniVM[] # Raggruppamenti materia/specificità/alunni
  hasPerSpecificita: boolean            # true se esiste almeno una specificità
```

#### Movimenti della classe

```yaml
MovimentiClasseVM:
  elenco: MovimentoClasseVM[] # Tutti i movimenti che toccano lo scope della classe
  entrate: MovimentoClasseVM[] # Movimenti con destinazione nello scope
  uscite: MovimentoClasseVM[] # Movimenti con provenienza nello scope
  interni: MovimentoClasseVM[] # Cambi interamente compresi nello scope

  hasElenco: boolean # true se elenco non è vuoto
  hasEntrate: boolean # true se entrate non è vuoto
  hasUscite: boolean # true se uscite non è vuoto
  hasInterni: boolean # true se interni non è vuoto

  numero: number # Cardinalità di elenco
  numeroEntrate: number # Cardinalità di entrate
  numeroUscite: number # Cardinalità di uscite
  numeroInterni: number # Cardinalità di interni
```

La collezione include ogni riga di mobilità la cui provenienza o destinazione appartiene allo scope della classe. Lo scope di una classe parent comprende la parent e tutte le sue classi partner. Gli studenti non più attivi restano inclusi.

#### Piani personalizzati e documenti

```yaml
PianiPersonalizzatiClasseVM:
  elenco: PianoPersonalizzatoVM[] # Piani generati per gli studenti dello scope
  hasElenco: boolean # true se elenco non è vuoto
  numero: number # Numero totale dei piani

  nonVerbalizzati:
    elenco: PianoPersonalizzatoVM[] # Sottoinsieme con stato diverso da VERBALIZZATO
    hasElenco: boolean # true se esiste almeno un piano non verbalizzato
    numero: number # Numero dei piani non verbalizzati

  storico: LazyRef<DocumentoStoricoVM[]> # Documenti degli anni precedenti, caricati su richiesta
```

```yaml
ElencoDocumentiVM:
  elenco: DocumentoLogVM[] # Documenti correnti nello scope del nodo proprietario
  hasElenco: boolean # true se elenco non è vuoto
  numero: number # Numero dei documenti correnti
  storico: LazyRef<DocumentoStoricoVM[]> # Documenti storici caricati su richiesta
```

#### Proiezioni Sheets

```yaml
FoglioClasseVM:
  materieConPermessi:
    elenco: ColonnaMateriaVM[] # Colonne materia con metadati ACL
    hasElenco: boolean # true se esiste almeno una colonna materia
    numero: number # Numero delle colonne con metadati ACL

  materieColonne:
    gruppi:
      - indice: number # Posizione 1-based del gruppo
        label: string # Intestazione strutturale del gruppo; es. "Materie comuni"
        colonne: ColonnaMateriaVM[] # Colonne da espandere orizzontalmente
        hasColonne: boolean # true se il gruppo contiene colonne
        numero: number # Numero delle colonne nel gruppo
```

```yaml
ColonnaMateriaVM:
  sigla: string # Sigla della materia rappresentata
  header: string # Testo dell'intestazione di colonna; es. "MAT — Matematica"
  isSpeciale: boolean # true per colonne sintetiche non ordinarie
  ruoli: string[] # Ruoli autorizzati sulla colonna; es. ["DOCENTE", "COORDINATORE"]
```

### 4.2 `focus.alunno` — `AlunnoFocusVM`

```yaml
AlunnoFocusVM:
  nomeCompleto: string           # Cognome e nome nella forma ufficiale dell'istituto; es. "ROSSI MARIO"
  email: string                  # Chiave primaria dello studente

  classe: ClasseContestoVM       # Classe frequentata alla data di riferimento

  religione: "IRC" | "ALT" | "NO" # Scelta tecnica relativa all'insegnamento religioso
  religioneLabel: string         # Etichetta italiana pronta per la stampa; es. "Attività alternativa"
  isIrc: boolean                 # true se religione = IRC
  isAlt: boolean                 # true se religione = ALT
  isSenzaReligione: boolean      # true se religione = NO

  isBes: boolean                 # true se almeno una condizione o piano implica BES
  isDsa: boolean                 # true se lo studente rientra nello scope DSA
  isPei: boolean                 # true se lo studente ha almeno un PEI associato
  isPfp: boolean                 # true se lo studente ha almeno un PFP associato
  isRipetente: boolean           # Stato di ripetenza nell'anno corrente
  isRappresentante: boolean      # true se rappresentante degli studenti

  presenza: PresenzaAlunnoVM     # Continuità di presenza nell'istituto e nella classe
  movimenti: ElencoMovimentiAlunnoVM # Mobilità dell'anno corrente fino alla data di riferimento

  curriculum: CurriculumVM[]     # Specificità disciplinari scelte dallo studente
  hasCurriculum: boolean         # true se curriculum non è vuoto
  curriculumDescrizione: string  # Materie e specificità in forma stampabile; es. "Musica — Clarinetto, Pianoforte"

  consiglio: ConsiglioAlunnoVM   # Consiglio filtrato sul curriculum; opzionale
  carenze: ElencoCarenzeVM       # Carenze dell'anno corrente
  asl: AslAlunnoVM               # Ore ASL/FSL cumulate e annuali
  piani: ElencoPianiVM           # Piani personalizzati dello studente
  documenti: ElencoDocumentiVM   # Documenti associati; opzionale
  storico: LazyRef<StoricoAlunnoVM> # Anni precedenti caricati su richiesta
```

```yaml
ClasseContestoVM:
  nome: string # Identificativo completo della classe
  indirizzo: IndirizzoVM # Indirizzo effettivo dello studente
```

```yaml
ConsiglioAlunnoVM:
  elenco: DocenteCdcVM[] # Docenti pertinenti allo specifico studente
  hasElenco: boolean # true se è stato risolto almeno un docente
  numero: number # Numero dei docenti filtrati
  elencoDescrizione: string # Appellativi individuali e nomi dei docenti; formato frase; es. "Prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"

  materie: MateriaVM[] # Materie risultanti dal consiglio filtrato
  hasMaterie: boolean # true se materie non è vuoto
  materieDescrizione: string # Nomi delle materie separati da virgola; es. "Matematica, Fisica"
```

Il consiglio dell'alunno contiene soltanto le materie compatibili con il suo curriculum e con la sua scelta relativa alla religione.

```yaml
AslAlunnoVM:
  oreCumulate: number # Totale delle ore registrate in tutti gli anni considerati
  oreAnnoCorrente: number # Ore registrate nell'anno scolastico corrente
```

### 4.3 `focus.piano` — `PianoFocusVM`

```yaml
PianoFocusVM:
  tipo: string # Codice tecnico del tipo di piano
  tipoLabel: string # Denominazione leggibile del piano; es. "Piano didattico personalizzato"
  isBes: boolean # Indica se il tipo di piano implica BES
  parametriGenerazione: object # Parametri JSON interpretati dal generatore del piano
```

### 4.4 `focus.carenza` — `CarenzaFocusVM`

```yaml
CarenzaFocusVM:
  studente: PersonaRiferimentoVM # Studente cui appartiene la rilevazione
  classe: ClasseRiferimentoVM # Classe al momento della rilevazione

  progressivo: number # Progressivo della rilevazione per lo studente
  data: string # Data tecnica YYYY-MM-DD; es. "2026-08-31"
  dataBreve: string # Data DD/MM/YYYY; es. "31/08/2026"
  dataEstesa: string # Data con mese in lettere; es. "31 agosto 2026"

  hasAssenze: boolean # true se sono segnalate assenze rilevanti
  note: string # Annotazioni del consiglio di classe
  hasNote: boolean # true se note contiene testo utile
```

### 4.5 `focus.docente`, `focus.materia` e `focus.cattedre`

`focus.docente` è sempre un `PersonaVM` piatto.

Per una singola cattedra docente-materia:

```yaml
focus:
  docente: PersonaVM # Docente effettivo della singola cattedra
  materia: MateriaVM # Materia specifica della cattedra
```

Per una materia di classe:

```yaml
focus.materia: MateriaVM # Profilo CON_DOCENTI con tutti i docenti della materia
```

Per un docente aggregato:

```yaml
focus:
  docente: PersonaVM # Docente comune a tutte le cattedre
  cattedre: CattedraVM[] # Raggruppamento delle materie per classe
  hasCattedre: boolean # true se il docente possiede almeno una cattedra
  cattedreDescrizione: string # Classi e materie in forma stampabile; es. "3A — Matematica, Fisica"
```

### 4.6 `focus.dipartimento` — `DipartimentoFocusVM`

```yaml
DipartimentoFocusVM:
  id: string # Identificativo configurato del dipartimento
  nome: string # Denominazione ufficiale
  capo: PersonaVM | null # Responsabile del dipartimento
  hasCapo: boolean # true se capo è valorizzato

  materie: MateriaVM[] # Materie afferenti al dipartimento
  hasMaterie: boolean # true se materie non è vuoto
  numeroMaterie: number # Cardinalità di materie
  materieDescrizione: string # Nomi estesi separati da virgola; es. "Matematica, Fisica"
  materieDescrizioneSintesi: string # Nomi sintetici separati da virgola; es. "Mat., Fis."
  materieSigle: string # Sigle separate da virgola; es. "MAT, FIS"

  docenti: PersonaVM[] # Docenti assegnati alle materie del dipartimento
  hasDocenti: boolean # true se docenti non è vuoto
  numeroDocenti: number # Cardinalità di docenti
  docentiDescrizione: string # Appellativi individuali e nomi dei docenti; formato frase; es. "Prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"

  documenti: ElencoDocumentiVM # Documenti associati per sovrapposizione di materia
```

---

## 5. Sezione `destinatario` — `DestinatarioVM`

Il destinatario è un `PersonaVM` piatto arricchito con dati di invio.

```yaml
DestinatarioVM:
  nome: string                   # Nome proprio o denominazione del destinatario
  cognome: string | null         # Null per soggetti esterni non scomponibili
  nomeCompleto: string           # Forma ufficiale usata nei documenti; es. "ROSSI MARIO"
  email: string | null           # Indirizzo di consegna; null se non disponibile
  genere: "M" | "F" | null      # Genere grammaticale usato per le formule
  appellativo: string | null     # Prof.ssa per F, Prof. per M; iniziale maiuscola
  articolo: string | null        # La per F, Il per M; iniziale maiuscola
  coordinatore: string | null    # Coordinatrice per F, Coordinatore per M
  appellativoCompleto: string    # Titolo e nome, es. "Prof. ROSSI MARIO"
  appellativoCognome: string     # Titolo e cognome, adatto ai saluti; es. "Prof. ROSSI"
  appellativoCompletoEsteso: string # Articolo, titolo e nome; es. "Il prof. ROSSI MARIO"
  appellativoCognomeEsteso: string # Articolo, titolo e cognome; es. "Il prof. ROSSI"
  isEsterno: boolean             # true per esperti o soggetti esterni all'archivio docenti

  ruoliAttivi: string[]          # Ruoli effettivi alla data di invio; es. ["COORDINATORE", "TUTOR_ASL"]
  hasRuoliAttivi: boolean        # true se ruoliAttivi non è vuoto

  isCoordinatore: boolean        # Coordinatore di almeno una classe nello scope
  isTutor: boolean               # Tutor ASL/FSL o orientamento
  isTutorAsl: boolean            # Tutor ASL/FSL
  isDocenteSostegno: boolean     # Docente di sostegno nello scope
  isSupplente: boolean           # Docente effettivo per una supplenza attiva

  sostituisce: PersonaVM | null  # Titolare sostituito nel contesto dell'invio
  hasSostituisce: boolean        # true se sostituisce è valorizzato

  classi:
    elenco: ClasseSintesiVM[]    # Classi di competenza del destinatario
    hasElenco: boolean           # true se esiste almeno una classe
    numero: number               # Numero delle classi
    elencoDescrizione: string    # Nomi classe separati da virgola; es. "3A, 4B"

  materie:
    elenco: MateriaVM[]          # Materie effettive deduplicate su tutte le classi
    hasElenco: boolean           # true se esiste almeno una materia
    numero: number               # Numero delle materie
    elencoDescrizione: string    # Nomi delle materie separati da virgola; es. "Matematica, Fisica"
    sigle: string                # Sigle separate da virgola; es. "MAT, FIS"

  cattedre:
    elenco: CattedraVM[]         # Materie del destinatario raggruppate per classe
    hasElenco: boolean           # true se esiste almeno una cattedra
    numero: number               # Numero delle cattedre
    elencoDescrizione: string    # Classi e materie in forma stampabile; es. "3A — Matematica, Fisica"

  comunicazione:
    salutoIniziale: string       # Formula completa di apertura dell'email; es. "Gentile prof.ssa BIANCHI,"
    oggetto: string              # Oggetto finale dopo il rendering dei placeholder; es. "Convocazione consiglio di classe 3A"
    testoContenutoPuro: string   # Contenuto testuale senza involucro HTML, per audit; es. "La classe 3A è convocata il 31 agosto 2026."
```

Tutti i campi di ruolo devono essere calcolati. Il CDU non espone valori fittizi indistinguibili da risultati reali.

---

## 6. Sezione `render` — `RenderingVM`

```yaml
RenderingVM:
  boxes:
    perId:
      '[BOX_ID]': BoxRenderizzatoVM # Accesso diretto a un box configurato
    elenco: BoxRenderizzatoVM[] # Tutti i box nell'ordine di visualizzazione
    visibili: BoxRenderizzatoVM[] # Sottoinsieme effettivamente inserito nell'email
    hasElenco: boolean # true se esiste almeno un box
    hasVisibili: boolean # true se almeno un box è visibile
    numero: number # Numero totale dei box

  body:
    htmlCompleto: string # Documento HTML finale con intestazione e piè di pagina; es. "<html><body>…</body></html>"
    htmlSoloContenuto: string # Solo la parte centrale composta dai box; es. "<section>…</section>"
```

```yaml
BoxRenderizzatoVM:
  id: string # ID configurato del box
  titolo: string # Titolo già renderizzato; es. "Riepilogo della classe"
  html: string # Contenuto HTML interno già renderizzato; es. "<p>La classe conta 24 studenti.</p>"
  isVuoto: boolean # true se il box non contiene dati utili
  isVisibile: boolean # Risultato finale delle regole di visibilità
```

`boxes.elenco` segue l'ordine definito in `meta.configurazioneBox.elenco`.

---

## 7. Sezione `tech` — `ContestoTecnico`

`tech` è definita come proprietà non enumerabile e non viene serializzata.

```yaml
ContestoTecnico:
  entita:
    classe: object | null # Entità di dominio della classe focalizzata
    alunno: object | null # Entità di dominio dell'alunno focalizzato
    docente: object | null # Entità di dominio del docente focalizzato
    patternEmail: object | null # Configurazione email attiva
    documentoMetadato: object | null # Configurazione documento attiva

  servizi: object[] # Servizi condivisi dagli step della pipeline

  pipeline:
    statoCorrente: string # Nome dello step o stato attualmente in esecuzione
    stepEseguiti: string[] # Step completati nell'ordine di esecuzione
    errori: string[] # Errori raccolti durante l'elaborazione
    logEsecuzione: string[] # Traccia diagnostica interna del job
```

---

## 8. View Model condivisi

### 8.1 `PersonaRiferimentoVM`

```yaml
PersonaRiferimentoVM:
  nomeCompleto: string # Nome sufficiente per la stampa in elenchi compatti; es. "ROSSI MARIO"
  email: string # Identificativo stabile della persona nel dominio scolastico
```

È usato quando il CDU garantisce soltanto nome completo ed email.

### 8.2 `PersonaVM`

```yaml
PersonaVM:
  nome: string                   # Nome proprio o denominazione non scomponibile
  cognome: string | null         # Null per esperti esterni o denominazioni libere
  nomeCompleto: string           # Forma ufficiale pronta per la stampa; es. "ROSSI MARIO"
  email: string | null           # Null quando il soggetto non ha un account noto
  genere: "M" | "F" | null      # Genere grammaticale per titoli e concordanze

  appellativo: string | null     # Prof.ssa per F, Prof. per M; iniziale maiuscola
  articolo: string | null        # La per F, Il per M; iniziale maiuscola
  coordinatore: string | null    # Coordinatrice per F, Coordinatore per M

  appellativoCompleto: string    # Appellativo e nome, es. "Prof. ROSSI MARIO"
  appellativoCognome: string     # Appellativo e cognome, adatto ai saluti; es. "Prof. ROSSI"
  appellativoCompletoEsteso: string # Articolo, appellativo e nome, es. "Il prof. ROSSI MARIO"
  appellativoCognomeEsteso: string # Articolo, appellativo e cognome, es. "Il prof. ROSSI"
  isEsterno: boolean             # true quando non esiste una persona interna completa
```

`nomeCompleto` usa l'ordine ufficiale scelto dall'applicazione e deve essere identico in ogni proiezione della stessa persona.

### 8.3 `ClasseRiferimentoVM`, `ClasseSintesiVM` e `IndirizzoVM`

```yaml
ClasseRiferimentoVM:
  nome: string # Identificativo completo della classe
```

```yaml
ClasseSintesiVM:
  nome: string # Identificativo completo della classe
  anno: number # Anno di corso
  sezione: string # Sezione pura, senza anno e indirizzo; es. "A"
```

```yaml
IndirizzoVM:
  sigla: string # Codice breve dell'indirizzo; es. "INF"
  nome: string # Denominazione estesa ufficiale; es. "Informatica e telecomunicazioni"
  nomeSintetico: string # Denominazione breve per tabelle e testi compatti; es. "Informatica"
  tipo: string # Categoria tecnica dell'indirizzo
  tipoLabel: string # Categoria in forma leggibile; es. "Tecnico tecnologico"
```

### 8.4 `MateriaVM`

`MateriaVM` ha tre profili. I campi del profilo base sono sempre presenti; gli altri profili aggiungono soltanto i campi dichiarati.

| Profilo          | Campi aggiuntivi                         |
| :--------------- | :--------------------------------------- |
| `BASE`           | nessuno                                  |
| `CON_DOCENTI`    | docenti e informazioni della cattedra    |
| `CON_CONTINUITA` | campi `CON_DOCENTI` e continuità storica |

```yaml
MateriaVM:
  sigla: string # Identificativo canonico della materia
  nome: string # Denominazione estesa; es. "Matematica"
  nomeSintetico: string # Denominazione breve; es. "Mat."
  colore1: string # Colore primario esadecimale per le proiezioni grafiche; es. "#1A73E8"
  colore2: string # Colore secondario esadecimale; es. "#D2E3FC"

  principale: string | null # Materia principale della specificità; null per materie base
  specificita: string | null # Disciplina o strumento specifico
  hasSpecificita: boolean # true se specificita è valorizzata
  nomeConSpecificita: string # Nome completo con specificità già composta; es. "Musica — Clarinetto"

  isItp: boolean # Ruolo ITP nel contesto specifico della proiezione
  isMateriaPrimaProva: boolean # Materia configurata per la prima prova
  isMateriaSecondaProva: boolean # Materia configurata per la seconda prova

  evoluzione:
    siglePrecedenti:
      - sigla: string # Sigla storica riconducibile alla materia corrente
        anni: number[] # Anni di corso nei quali la sigla era valida
        anniDescrizione: string # Anni separati da virgola; es. "3, 4, 5"
    hasSiglePrecedenti: boolean # true se esiste almeno una sigla storica

  docenti: PersonaVM[] # Docenti assegnati; profili CON_DOCENTI e CON_CONTINUITA
  hasDocenti: boolean # true se docenti non è vuoto; stessi profili
  docentiDescrizione: string # Appellativi individuali e nomi dei docenti; stessi profili; es. "Prof. ROSSI MARIO e prof.ssa BIANCHI ANNA"
  docentiDescrizioneEstesa: string # Articoli, appellativi individuali e nomi; stessi profili; es. "Il prof. ROSSI MARIO e la prof.ssa BIANCHI ANNA"
  hasCattedraItp: boolean # Esistenza di una componente ITP; stessi profili

  continuita: ContinuitaVM # Storico di titolare e ITP; profilo CON_CONTINUITA
```

### 8.5 `ContinuitaVM`

```yaml
ContinuitaVM:
  anniPrecedenti:
    - annoIndietro: number # 1 per l'anno precedente, 2 per due anni prima
      annoScolastico: string # Anno scolastico YYYY-YYYY; es. "2025-2026"
      titolare: PersonaVM | null # Titolare principale ricostruito per quell'anno
      hasTitolare: boolean # true se titolare è valorizzato
      itp: PersonaVM | null # Docente ITP ricostruito per quell'anno
      hasItp: boolean # true se itp è valorizzato

  hasAnniPrecedenti: boolean # true se anniPrecedenti non è vuoto

  isContinuitaUltimiDueAnni: boolean # Stesso titolare nell'anno corrente e nel precedente
  isContinuitaUltimiTreAnni: boolean # Stesso titolare nell'anno corrente e nei due precedenti
  isContinuitaItpUltimiDueAnni: boolean # Stessa verifica per il docente ITP
  isContinuitaItpUltimiTreAnni: boolean # Stessa verifica ITP su tre anni
```

I flag ITP valgono `false` quando la materia non possiede una cattedra ITP.

### 8.6 `CurriculumVM`

```yaml
CurriculumVM:
  materiaId: string # ID della materia principale cui appartengono le specificità
  materiaSigla: string # Sigla canonica usata nei documenti
  materiaNome: string # Nome esteso della materia
  materiaNomeSintetico: string # Nome breve della materia; es. "Mus."

  specifiche:
    - nome: string # Valore normalizzato della specificità
      nomeCapitalizzato: string # Forma pronta per l'inizio di frase; es. "Clarinetto"

  hasSpecifiche: boolean # true se specifiche non è vuoto
  specificheDescrizione: string # Specificità separate da virgola; es. "Clarinetto, Pianoforte"
```

### 8.7 `SpecificitaAlunniVM`

```yaml
SpecificitaAlunniVM:
  materiaId: string # ID della materia principale
  materiaSigla: string # Sigla canonica
  materiaNome: string # Nome esteso
  materiaNomeSintetico: string # Nome breve; es. "Mus."

  specifiche:
    - nome: string # Specificità condivisa dagli alunni del gruppo
      nomeCapitalizzato: string # Forma pronta per la stampa; es. "Clarinetto"
      alunni: PersonaRiferimentoVM[] # Alunni iscritti alla specificità
      hasAlunni: boolean # true se alunni non è vuoto
      numero: number # Cardinalità di alunni
      alunniDescrizione: string # Nomi completi separati da virgola; es. "ROSSI MARIO, BIANCHI ANNA"

  hasSpecifiche: boolean # true se esiste almeno un gruppo di specificità
```

### 8.8 `PresenzaAlunnoVM`

```yaml
PresenzaAlunnoVM:
  annoPrecedente:
    isCalcolato: boolean # true se l'anno precedente è stato realmente consultato
    isPresente: boolean # true se lo studente risulta iscritto in quell'anno

  isPresenteTuttoAnno: boolean # true se nessun ingresso/cambio ha interrotto l'intero anno
  hasCambiatoClasse: boolean # true se esiste almeno un CAMBIO effettivo nell'anno

  classePrecedente: ClasseRiferimentoVM | null # Provenienza dell'ultimo cambio verso la classe corrente
  hasClassePrecedente: boolean # true se classePrecedente è valorizzata
```

`classePrecedente` è la provenienza dell'ultimo cambio effettivo verso la classe corrente. `annoPrecedente.isCalcolato` distingue un risultato negativo dall'assenza del confronto storico.

### 8.9 `ProvenienzaDestinazioneVM`

```yaml
ProvenienzaDestinazioneVM:
  valore: string # Valore originario registrato nel movimento; es. "3A" oppure "Liceo Artistico Verdi"
  descrizione: string # Forma normalizzata pronta per la stampa; es. "3A" oppure "Liceo Artistico Verdi"
  classe: ClasseRiferimentoVM | null # Classe interna quando il valore è un ID classe
  scuolaEsterna: string | null # Denominazione esterna quando non è una classe interna
  isClasse: boolean # true se classe è valorizzata
  isScuolaEsterna: boolean # true se scuolaEsterna è valorizzata
```

`classe` e `scuolaEsterna` sono mutuamente esclusivi.

### 8.10 `MovimentoAlunnoVM`

```yaml
MovimentoAlunnoVM:
  tipo: "IN" | "OUT" | "RITIRATO" | "CAMBIO" # Tipo tecnico registrato in MOV_ALUNNI
  tipoLabel: "Ingresso" | "Trasferimento in uscita" | "Ritiro" | "Cambio di classe" # Forma stampabile

  data: string                   # Data effettiva YYYY-MM-DD; es. "2026-08-31"
  dataBreve: string              # Data DD/MM/YYYY; es. "31/08/2026"
  dataEstesa: string             # Data con mese in lettere; es. "31 agosto 2026"

  provenienza: ProvenienzaDestinazioneVM | null # Origine del movimento
  destinazione: ProvenienzaDestinazioneVM | null # Destinazione; null per RITIRATO

  isIngresso: boolean            # true se tipo = IN
  isUscita: boolean              # true se tipo = OUT
  isRitirato: boolean            # true se tipo = RITIRATO
  isCambioClasse: boolean        # true se tipo = CAMBIO

  descrizione: string            # Frase completa che descrive origine, destinazione e tipo; es. "Trasferito da 3A al Liceo Artistico Verdi"
```

I movimenti sono ordinati dal più recente al meno recente.

```yaml
ElencoMovimentiAlunnoVM:
  elenco: MovimentoAlunnoVM[] # Movimenti ordinati dal più recente
  hasElenco: boolean # true se elenco non è vuoto
  numero: number # Cardinalità di elenco
```

### 8.11 `MovimentoClasseVM`

`MovimentoClasseVM` contiene tutti i campi di `MovimentoAlunnoVM` e aggiunge:

```yaml
MovimentoClasseVM:
  studente: PersonaRiferimentoVM # Studente coinvolto, necessario nella vista di classe

  direzione: "ENTRATA" | "USCITA" | "INTERNA" # Relazione con lo scope della classe focalizzata
  direzioneLabel: "In entrata" | "In uscita" | "Movimento interno" # Forma stampabile
  isEntrata: boolean             # true se direzione = ENTRATA
  isUscita: boolean              # true se direzione = USCITA
  isMovimentoInterno: boolean    # true se direzione = INTERNA
```

La direzione è relativa allo scope della classe focalizzata:

- destinazione interna allo scope e provenienza esterna: `ENTRATA`;
- provenienza interna allo scope e destinazione esterna: `USCITA`;
- provenienza e destinazione entrambe interne allo scope: `INTERNA`.

### 8.12 `AlunnoVM`

```yaml
AlunnoVM:
  nomeCompleto: string           # Nome ufficiale dello studente; es. "ROSSI MARIO"
  email: string                  # Chiave primaria dello studente

  classe: ClasseContestoVM       # Classe effettiva nella proiezione corrente

  religione: "IRC" | "ALT" | "NO" # Scelta tecnica relativa alla religione
  religioneLabel: string         # Etichetta italiana pronta; es. "Non si avvale"
  isIrc: boolean                 # true se religione = IRC
  isAlt: boolean                 # true se religione = ALT
  isSenzaReligione: boolean      # true se religione = NO

  isBes: boolean                 # Stato BES calcolato dai piani e dal profilo
  isDsa: boolean                 # Stato DSA
  isPei: boolean                 # true se l'alunno ha almeno un PEI associato
  isPfp: boolean                 # true se l'alunno ha almeno un PFP associato
  isRipetente: boolean           # Stato di ripetenza nell'anno
  isRappresentante: boolean      # Rappresentante degli studenti

  presenza: PresenzaAlunnoVM     # Continuità nell'istituto e nella classe
  movimenti: ElencoMovimentiAlunnoVM # Mobilità dell'anno della proiezione

  curriculum: CurriculumVM[]     # Specificità disciplinari dello studente
  hasCurriculum: boolean         # true se curriculum non è vuoto
  curriculumDescrizione: string  # Materie e specificità in forma stampabile; es. "Musica — Clarinetto, Pianoforte"

  carenze: ElencoCarenzeVM       # Carenze nello scope temporale della proiezione
  piani: ElencoPianiVM           # Piani personalizzati nello stesso scope
  asl: AslAlunnoVM               # Ore ASL/FSL cumulate e annuali
```

La classe di `AlunnoVM` è la classe usata dalla proiezione corrente. Nei roster di una parent articolata coincide con la classe partner effettiva dello studente, così ogni riga resta autosufficiente.

### 8.13 `DocenteCdcVM`

`DocenteCdcVM` contiene tutti i campi di `PersonaVM` e aggiunge:

```yaml
DocenteCdcVM:
  materie: MateriaVM[]           # Materie insegnate dal docente nella classe
  hasMaterie: boolean            # true se materie non è vuoto
  numeroMaterie: number          # Cardinalità di materie
  materieDescrizione: string     # Nomi estesi separati da virgola; es. "Matematica, Fisica"
  materieDescrizioneSintesi: string # Nomi sintetici separati da virgola; es. "Mat., Fis."
  materieSigle: string           # Sigle separate da virgola; es. "MAT, FIS"

  isCoordinatore: boolean        # Coordinatore della classe
  isTutorAsl: boolean            # Tutor ASL/FSL della classe
  isTutorOrientamento: boolean   # Tutor orientamento della classe
  isTutor: boolean               # Unione dei due ruoli tutor
  isSupplente: boolean           # Docente effettivo per una supplenza attiva
  isItp: boolean                 # ITP in almeno una materia assegnata
  isComune: boolean              # Assegnazione comune nel gruppo articolato
  isSeparatoPrimo: boolean       # Assegnazione della prima partner
  isSeparatoSecondo: boolean     # Assegnazione della seconda partner

  ruoliDescrizione: string[]     # Etichette dei ruoli posseduti nella classe; es. ["Coordinatore", "Tutor ASL/FSL"]
  ruoliDescrizioneTesto: string  # Etichette concatenate in forma stampabile; es. "Coordinatore, Tutor ASL/FSL"

  sostituisce: PersonaVM | null  # Titolare sostituito dal supplente
  hasSostituisce: boolean        # true se sostituisce è valorizzato

  tipoArticolazione: "COMUNE" | "SEPARATO_PRIMO" | "SEPARATO_SECONDO" | null # Quota del gruppo
  tipoArticolazioneLabel: string # Etichetta italiana della quota; es. "Parte comune"
  gruppoNome: string | null      # Nome dell'indirizzo partner per le quote separate; es. "Informatica"
```

Le materie usano il profilo `CON_DOCENTI`; `MateriaVM.isItp` indica il ruolo del docente sulla singola materia.

### 8.14 `ProgettoVM`

```yaml
ProgettoVM:
  tipo: "ASL" | "ORIENTAMENTO" | "ALTRO" # Categoria tecnica del progetto
  tipoLabel: "FSL" | "Orientamento" | "Altro" # Etichetta stampabile
  nome: string                   # Titolo del progetto o percorso
  referente: PersonaVM           # Docente o esperto responsabile
  ore: number                    # Monte ore complessivo
  oreAsl: number                 # Quota valida ai fini ASL/FSL
  isAsl: boolean                 # true se tipo = ASL
  isOrientamento: boolean        # true se tipo = ORIENTAMENTO
  isAltro: boolean               # true se tipo = ALTRO
```

### 8.15 VM storici

```yaml
StoricoClasseVM:
  anni:
    - annoScolastico: string # Anno cui appartiene la fotografia; es. "2025-2026"
      classe: ClasseRiferimentoVM # Nome della classe in quell'anno
      statistiche: StatisticheAlunniVM # Conteggi del roster storico
      progetti: ProgettoVM[] # Progetti svolti in quell'anno
      hasProgetti: boolean # true se progetti non è vuoto

  hasAnni: boolean # true se è stata materializzata almeno una fotografia
  numeroAnni: number # Cardinalità di anni
```

```yaml
StoricoAlunnoVM:
  anni:
    - annoScolastico: string      # Anno della fotografia storica; es. "2025-2026"
      classe: ClasseRiferimentoVM | null # Classe frequentata; null se non ricostruibile
      esito: "PROMOSSO" | "NON_PROMOSSO" | "TRASFERITO" | "RITIRATO" | "SCONOSCIUTO" # Esito tecnico
      esitoLabel: string          # Esito in forma leggibile; es. "Promosso"
      isPromosso: boolean         # true se esito = PROMOSSO
      isNonPromosso: boolean      # true se esito = NON_PROMOSSO

      carenze: CarenzaStoricaVM[] # Carenze registrate in quell'anno
      hasCarenze: boolean         # true se carenze non è vuoto
      carenzeDescrizione: string  # Sigle e valori in forma stampabile; es. "MAT: 5, FIS: 4"

      piani: PianoStoricoVM[]     # Tipi di piano posseduti in quell'anno
      hasPiani: boolean           # true se piani non è vuoto

      presenza: PresenzaAlunnoVM  # Continuità relativa a quell'anno
      movimenti: ElencoMovimentiAlunnoVM # Movimenti effettivi di quell'anno

  hasAnni: boolean               # true se anni non è vuoto
  numeroAnni: number             # Cardinalità di anni

  bocciature:
    elenco:
      - annoScolastico: string    # Anno con esito NON_PROMOSSO; es. "2025-2026"
        classe: ClasseRiferimentoVM # Classe frequentata in quell'anno
    hasElenco: boolean            # true se esiste almeno una bocciatura
    numero: number                # Numero delle bocciature
    elencoDescrizione: string     # Anni e classi in forma stampabile; es. "2024-2025 — 2A, 2025-2026 — 3A"
```

```yaml
CarenzaStoricaVM:
  materiaSigla: string # Sigla riconciliata alla materia canonica
  valore: string # Voto o giudizio registrato; es. "5" oppure "Insufficiente"
```

```yaml
PianoStoricoVM:
  tipo: string # Codice tecnico del piano
  tipoLabel: string # Denominazione leggibile; es. "Piano educativo individualizzato"
```

### 8.16 `ProiezioneClasseVM`

```yaml
ProiezioneClasseVM:
  nome: string # Identificativo della classe proiettata
  anno: number # Anno di corso
  sezione: string # Sezione pura; es. "A"
  indirizzo: IndirizzoVM # Indirizzo della partner

  consiglio: ConsiglioClasseVM # Consiglio scopato sulla partner
  studenti: StudentiClasseVM # Roster della partner
  coordinatori: CoordinatoriVM # Coordinatori risolti per la partner
  movimenti: MovimentiClasseVM # Mobilità relativa alla partner
```

### 8.17 `DocumentoLogVM` e `DocumentoStoricoVM`

```yaml
DocumentoLogVM:
  id: string | null # ID del file Drive; null se non disponibile
  hasId: boolean # true se id è valorizzato
  nome: string # Nome assegnato al documento; es. "PDP ROSSI MARIO - 2026-2027"
  link: string # URL del file o della risorsa generata; es. "https://drive.google.com/open?id=..."
  tipo: string # Tipo tecnico del documento
  tipoLabel: string # Denominazione leggibile del tipo; es. "Piano didattico personalizzato"
  sottotipo: string # Sottotipo tecnico; stringa vuota se assente; es. "ANNUALE"
  sottotipoLabel: string # Denominazione leggibile del sottotipo; es. "Aggiornamento annuale"
  hasSottotipo: boolean # true se sottotipo non è vuoto
  generatoreId: string # Configurazione che ha generato il documento
  stato: string # Stato tecnico del ciclo documentale
  statoLabel: string # Stato in forma leggibile; es. "Generato"
  isNotificato: boolean # true se il documento è già stato notificato
  dataCreazione: string # Data tecnica YYYY-MM-DD; es. "2026-08-31"
  dataCreazioneBreve: string # Data DD/MM/YYYY; es. "31/08/2026"
```

```yaml
DocumentoStoricoVM:
  annoScolastico: string # Anno scolastico di provenienza del log; es. "2025-2026"
  documento: DocumentoLogVM # Documento ricostruito con forma canonica
```

### 8.18 `PianoPersonalizzatoVM`

`PianoPersonalizzatoVM` contiene tutti i campi di `DocumentoLogVM` e aggiunge:

```yaml
PianoPersonalizzatoVM:
  isVerbalizzato: boolean # true se stato = VERBALIZZATO
  studente: PersonaRiferimentoVM | null # Proprietario nella vista aggregata di classe
  hasStudente: boolean # true se studente è valorizzato
```

`studente` è valorizzato nelle collezioni di classe e vale `null` nelle collezioni già focalizzate su un singolo alunno.

### 8.19 `SupplenzaAggregataVM`

```yaml
SupplenzaAggregataVM:
  supplente: PersonaVM # Docente effettivo finale della sostituzione
  titolare: PersonaVM # Titolare originario sostituito
  materie: MateriaVM[] # Materie coperte dalla coppia supplente/titolare
  hasMaterie: boolean # true se materie non è vuoto
  materieDescrizione: string # Nomi delle materie separati da virgola; es. "Matematica, Fisica"
  materieSigle: string # Sigle separate da virgola; es. "MAT, FIS"
```

Una catena di supplenze espone il docente effettivo finale e il titolare originario.

### 8.20 `CattedraVM`

```yaml
CattedraVM:
  classe: ClasseSintesiVM # Classe o parent cui appartiene la cattedra
  sezioneEstesa: string # Nome classe privo delle cifre iniziali dell'anno; es. "A INF"

  materie: MateriaVM[] # Materie effettive raggruppate per classe
  hasMaterie: boolean # true se materie non è vuoto
  numeroMaterie: number # Cardinalità di materie
  materieDescrizione: string # Nomi delle materie separati da virgola; es. "Matematica, Fisica"
  materieSigle: string # Sigle separate da virgola; es. "MAT, FIS"
```

`classe.sezione` è sempre la sezione pura. `sezioneEstesa` è il nome classe senza le cifre iniziali dell'anno.

Le classi appartenenti alla stessa articolazione producono una sola cattedra riferita alla parent, con materie deduplicate.

### 8.21 `CarenzaVM`

```yaml
CarenzaVM:
  materiaSigla: string # Sigla canonica della materia
  materiaNome: string # Nome esteso della materia
  materiaNomeSintetico: string # Nome breve della materia; es. "Mat."
  voto: string # Valutazione o giudizio registrato; es. "5" oppure "Insufficiente"
  descrizione: string # Materia e valore già composti per la stampa; es. "Matematica: 5"
```

```yaml
ElencoCarenzeVM:
  elenco: CarenzaVM[] # Carenze ordinate per materia
  hasElenco: boolean # true se elenco non è vuoto
  numero: number # Cardinalità di elenco
  elencoDescrizione: string # Descrizioni separate da virgola; es. "Matematica: 5, Fisica: 4"
```

### 8.22 `PianoVM`

```yaml
PianoVM:
  tipo: string # Codice tecnico del piano
  tipoLabel: string # Denominazione leggibile; es. "Piano didattico personalizzato"
  isBes: boolean # true se il tipo di piano implica BES
  link: string | null # URL del documento associato; es. "https://drive.google.com/open?id=..."
  hasLink: boolean # true se link è valorizzato
  parametriGenerazione: object | null # Parametri JSON interpretati dal generatore
  hasParametriGenerazione: boolean # true se i parametri sono disponibili
```

```yaml
ElencoPianiVM:
  elenco: PianoVM[] # Piani ordinati per tipo
  hasElenco: boolean # true se elenco non è vuoto
  numero: number # Cardinalità di elenco
  elencoDescrizione: string # Etichette dei piani separate da virgola; es. "PDP, PEI"
  hasBes: boolean # true se almeno un piano implica BES
```

I campi non disponibili in una proiezione compatta valgono `null` e sono accompagnati dal relativo booleano di disponibilità.

### 8.23 Statistiche

```yaml
StatisticheAlunniVM:
  totale: number # Numero complessivo degli studenti nello scope
  conPiani: number # Studenti con almeno un piano
  conBes: number # Studenti con stato BES
  conDsa: number # Studenti con stato DSA
  ripetenti: number # Studenti ripetenti
  rappresentanti: number # Rappresentanti degli studenti
```

```yaml
StatisticheIstitutoVM:
  totaleClassi: number # Classi attive dell'istituto
  totaleDocenti: number # Docenti attivi dell'istituto
  totaleAlunni: number # Studenti attivi dell'istituto
```

### 8.24 Rappresentanti

```yaml
RappresentanteStudenteVM:
  studente: PersonaRiferimentoVM # Studente eletto rappresentante
  indirizzo: IndirizzoVM | null # Indirizzo di provenienza in una parent articolata
  hasIndirizzo: boolean # true se indirizzo è valorizzato
```

```yaml
RappresentanteGenitoreVM:
  nomeCompleto: string # Nome libero del rappresentante genitore
  studente: PersonaRiferimentoVM # Figlio cui si riferisce la rappresentanza
  indirizzo: IndirizzoVM | null # Indirizzo del figlio nella parent articolata
  hasIndirizzo: boolean # true se indirizzo è valorizzato
  descrizione: string # Genitore e studente in forma stampabile; es. "Maria Rossi (genitore di ROSSI MARIO)"
```

L'indirizzo è valorizzato quando serve distinguere la provenienza all'interno di una parent articolata.

### 8.25 VM esame

`MateriaEsameVM` contiene tutti i campi del profilo `CON_DOCENTI` di `MateriaVM` e aggiunge:

```yaml
MateriaEsameVM:
  prova: "PRIMA_PROVA" | "SECONDA_PROVA" # Prova cui è associata la materia
  provaLabel: "Prima prova" | "Seconda prova" # Forma stampabile
  isPrimaProva: boolean          # true se prova = PRIMA_PROVA
  isSecondaProva: boolean        # true se prova = SECONDA_PROVA
```

`DocenteEsameVM` contiene tutti i campi di `PersonaVM` e aggiunge:

```yaml
DocenteEsameVM:
  prova: "PRIMA_PROVA" | "SECONDA_PROVA" # Prova cui partecipa il docente
  provaLabel: "Prima prova" | "Seconda prova" # Forma stampabile
  isPrimaProva: boolean          # true se prova = PRIMA_PROVA
  isSecondaProva: boolean        # true se prova = SECONDA_PROVA

  materie: MateriaVM[]           # Materie insegnate dal docente per la prova
  hasMaterie: boolean            # true se materie non è vuoto
  numeroMaterie: number          # Cardinalità di materie
  materieDescrizione: string     # Nomi separati da virgola; es. "Italiano, Storia"
  materieSigle: string           # Sigle separate da virgola; es. "ITA, STO"
```

I docenti d'esame sono deduplicati per email all'interno di ogni prova.

---

## 9. Regole dei movimenti degli alunni

### 9.1 Invarianti della sorgente

| Tipo       | Provenienza    | Destinazione           |
| :--------- | :------------- | :--------------------- |
| `IN`       | scuola esterna | classe interna         |
| `CAMBIO`   | classe interna | classe interna diversa |
| `OUT`      | classe interna | scuola esterna         |
| `RITIRATO` | classe interna | assente                |

Un movimento che non rispetta queste combinazioni è invalido.

### 9.2 Scope temporale

- `focus.alunno.movimenti` contiene i movimenti dell'anno scolastico corrente fino alla data di riferimento della recipe.
- `AlunnoVM.movimenti` usa lo stesso scope temporale.
- `StoricoAlunnoVM.anni[].movimenti` contiene i movimenti del relativo anno scolastico.
- I movimenti con data successiva alla data di riferimento non influenzano presenza, classe precedente o partizioni della classe.

### 9.3 Scope della classe

Una riga appartiene a `focus.classe.movimenti` quando la sua provenienza o destinazione è una classe compresa nello scope focalizzato.

- Classe ordinaria: lo scope contiene soltanto la classe.
- Classe partner: lo scope contiene soltanto la partner.
- Classe parent: lo scope contiene parent e partner.

Un cambio tra partner è `INTERNA` per la parent, `USCITA` per la partner di provenienza ed `ENTRATA` per la partner di destinazione.

### 9.4 Presenza annuale

- `isPresenteTuttoAnno` è `false` quando esiste un ingresso o cambio effettivo verso la classe corrente durante l'anno.
- `hasCambiatoClasse` è `true` quando esiste almeno un movimento `CAMBIO` effettivo durante l'anno.
- `classePrecedente` deriva dal più recente `CAMBIO` effettivo verso la classe corrente.
- `annoPrecedente.isPresente` viene valutato soltanto se `annoPrecedente.isCalcolato` è `true`.

---

## 10. Presenza dei nodi per contesto

| Nodo                   | Condizione                                                  |
| :--------------------- | :---------------------------------------------------------- |
| `meta`                 | sempre                                                      |
| `istituto`             | recipe con dati d'istituto                                  |
| `focus.classe`         | asse che include una classe                                 |
| `focus.alunno`         | asse che include un singolo alunno                          |
| `focus.piano`          | generazione di un piano personalizzato                      |
| `focus.carenza`        | notifica o documento relativo a una carenza                 |
| `focus.docente`        | asse docente o cattedra                                     |
| `focus.materia`        | asse materia o cattedra                                     |
| `focus.cattedre`       | asse docente aggregato                                      |
| `focus.dipartimento`   | asse dipartimento                                           |
| `focus.classe.partner` | classe articolata con dettaglio partner richiesto           |
| `focus.classe.esame`   | classe terminale con dati d'esame richiesti                 |
| `focus.classe.storico` | storico richiesto                                           |
| `focus.alunno.storico` | storico richiesto                                           |
| `destinatario`         | pipeline email                                              |
| `render`               | pipeline email                                              |
| `tech`                 | quando esistono riferimenti tecnici; sempre non enumerabile |

Quando un provider costruisce un contenitore, tutte le sue collezioni e tutti i relativi booleani companion sono presenti anche se vuoti.

---

## 11. Regole per mapper e provider

1. Ogni persona completa passa attraverso un solo mapper `PersonaVM`.
2. Ogni materia passa attraverso un solo mapper `MateriaVM`, con profilo dichiarato dal nodo destinatario.
3. Ogni movimento passa attraverso un solo mapper `MovimentoAlunnoVM`; la proiezione di classe aggiunge soltanto studente e direzione.
4. Presenza e movimenti usano la stessa collezione sorgente già filtrata per data.
5. Le partizioni sono costruite da proprietà booleane del VM, non da confronti ripetuti sulle stringhe nei template.
6. I mapper non inseriscono oggetti di dominio nel CDU serializzabile.
7. Un provider assegna un solo nome canonico a ogni dato. Sono ammesse proiezioni distinte soltanto per accessi differenti, come `perId` ed `elenco`.
8. Ogni descrizione pronta deriva dagli stessi elementi presenti nell'array associato.
9. `numero` coincide sempre con `elenco.length`.
10. `hasElenco` coincide sempre con `numero > 0`.
11. Gli array deduplicati di persone usano l'email; le persone senza email usano `nomeCompleto` normalizzato.
12. Le materie sono deduplicate per sigla, specificità e ruolo ITP quando il ruolo è semanticamente rilevante.

---

## 12. Regole per i template

I template possono:

- sostituire scalari;
- iterare array;
- verificare booleani `isXxx` e `hasXxx`;
- applicare filtri puramente presentazionali;
- usare descrizioni già calcolate.

I template non possono:

- confrontare ID, enum o sigle di dominio;
- ricostruire nomi, titoli, date o descrizioni complesse;
- filtrare una collezione per un valore di dominio;
- leggere oggetti tecnici;
- dipendere dall'ordine di un array per determinarne il significato.

Esempi canonici:

```mustache
{{focus.classe.nome}}
{{focus.classe.indirizzo.nome}}
{{focus.alunno.nomeCompleto}}

{{#focus.classe.studenti.elenco}}
  {{nomeCompleto}} — {{classe.nome}} — {{religioneLabel}}
{{/focus.classe.studenti.elenco}}

{{#focus.classe.movimenti.entrate}}
  {{dataBreve}} — {{studente.nomeCompleto}} — {{descrizione}}
{{/focus.classe.movimenti.entrate}}

{{#focus.alunno.movimenti.elenco}}
  {{dataBreve}} — {{tipoLabel}} — {{descrizione}}
{{/focus.alunno.movimenti.elenco}}

{{#focus.classe.consiglio.elenco}}
  {{appellativoCompleto}} — {{materieDescrizione}}
{{/focus.classe.consiglio.elenco}}
```

---

## 13. Criteri di accettazione del refactoring

Il refactoring è conforme quando:

1. le interfacce TypeScript rappresentano esattamente i VM di questa specifica;
2. i dati principali delle entità sono esposti direttamente sul relativo VM;
3. ogni campo dichiarato è calcolato;
4. ogni recipe produce soltanto i nodi previsti dalla matrice di presenza;
5. ogni collezione ha cardinalità, booleani e descrizioni coerenti;
6. i movimenti dello studente e della classe derivano dalla stessa proiezione canonica;
7. gli studenti usciti o ritirati compaiono nei movimenti di classe anche se non appartengono al roster attivo;
8. le classi articolate applicano correttamente le direzioni `ENTRATA`, `USCITA` e `INTERNA`;
9. nessun template necessita di confronti su enum o ID di dominio;
10. il CDU serializzato non contiene servizi, entità vive, riferimenti circolari o valori non deterministici.
