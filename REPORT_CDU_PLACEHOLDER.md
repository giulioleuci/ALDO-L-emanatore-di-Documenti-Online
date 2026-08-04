# CDU — guida pratica per placeholder di documenti ed email

## Scopo e perimetro

Il **CDU** (Contesto Dati Unificato) è unico input ammesso per template documentali, testo email, titoli box e condizioni. Un placeholder legge soltanto proprietà plain-object, serializzabili, presenti nel CDU costruito dalla recipe attiva. Non leggere tabelle, servizi o `tech.*` dal template.

Sintassi base: `{{percorso.dot}}`. Motore `WorkspaceTemplateEngine` usa Mustache standard; sezioni `{{#array}}...{{/array}}` ripetono contenuto per ogni elemento e sezioni booleane rendono contenuto solo se valore è truthy. Variabile dentro sezione è relativa a elemento corrente. Esempio: dentro `{{#focus.classe.coordinatori}}`, usare `{{appellativo}} {{nome}}`, non percorso completo.

> Regola: percorso assente nella specifica CDU non è placeholder valido. Proprietà opzionali richiedono recipe/provider che le popoli e sezione Mustache che gestisca assenza o lista vuota.

## Mappa del CDU

| Radice | Contenuto template |
|---|---|
| `meta` | data corrente formattata, configurazione, tipo e parametri operazione |
| `istituto` | anno scolastico, dirigente, staff, statistiche istituto |
| `focus` | dati business: classe, alunno, piano focalizzato, carenza focalizzata |
| `destinatario` | persona che riceve singola email e relativo contesto |
| `render` | HTML box e corpo già renderizzato; solo pipeline email |
| `tech` | **vietato**: entità/servizi vivi, non serializzabili |

Placeholder scalar frequenti:

```mustache
{{meta.date.oggi.estesa}}
{{istituto.organizzazione.annoScolastico}}
{{focus.classe.anagrafica.nome}}
{{focus.alunno.anagrafica.nomeCompleto}}
{{destinatario.comunicazione.salutoIniziale}}
```

`focus.classe` e `focus.alunno` possono coesistere soltanto se recipe li prevede. Non assumere che tutti i rami siano sempre presenti.

## Classe: anagrafica, ruoli, studenti

`focus.classe.anagrafica` contiene `nome`, `anno`, `sezione`, `indirizzo.nome`, `indirizzo.nomeSintetico`, `indirizzo.sigla`, `indirizzo.tipo`.

`focus.classe.flags` contiene `isClassePrima`, `isTriennio`, `isPrimoBiennio`, `isTerminale`, `isArticolata`. Usare sezioni booleane per testo condizionale:

```mustache
Classe {{focus.classe.anagrafica.nome}}
{{#focus.classe.flags.isTerminale}}Classe terminale.{{/focus.classe.flags.isTerminale}}
```

Ruoli disponibili:

* `focus.classe.coordinatori[]`: `nome`, `email`, `materia`, `appellativo`.
* `focus.classe.tutor.asl[]` e `.orientamento[]`: `nome`, `email`.
* `focus.classe.rappresentanti.studenti[]`: `nomeCompleto`, `email`.
* `focus.classe.rappresentanti.genitori[]`: `nomeCompleto`; **nessuna email**.

`focus.classe.studenti.listaCompleta[]` espone, per ogni alunno, `anagrafica.nomeCompleto`, `anagrafica.email`, `status` (`isBes`, `isRipetente`, `isRappresentante`, `religione`), `curriculum`, `didattica.carenze`, `didattica.piani`, `didattica.pcto.oreCumulate`.

Le statistiche classe sono in `focus.classe.studenti.statistiche`: `totale`, `conPianiDidattici`, `conBes`, `conDsa`, `ripetenti`, `rappresentanti`.

## Classi articolate: parent e partner

Una articolazione ha tre righe `CLASSI`: classe **parent** completa e due classi **partner**, una per indirizzo. Studente di articolazione deve avere `ALUNNI.CLASSE` uguale alla partner effettiva, mai alla parent. Vale anche per `CARENZE.CLASSE`. Classe parent aggrega; partner identifica reale indirizzo dello studente.

Quando `focus.classe.flags.isArticolata` è vero, è presente `focus.classe.articolazione`:

| Campo | Classe parent | Classe partner |
|---|---|---|
| `partner` | `null` | ID altra partner |
| `partners` | due ID, ordine primo/secondo | `null` |
| `parent` | normalmente `null` | ID parent |
| `materieCondivise` | sigle comuni | sigle comuni |
| `materieSeparatePrimoGruppo` | sigle primo partner | stessa configurazione |
| `materieSeparateSecondoGruppo` | sigle secondo partner | stessa configurazione |

Studenti di una classe articolata hanno inoltre:

* `studenti.perIndirizzo["SIGLA"][]`: studenti raggruppati per indirizzo;
* `studenti.indirizziPresenti[]`: sigle indirizzi presenti;
* `studenti.perSpecificita["MateriaId"]["specifica"][]`: gruppi opzionali, solo se recipe imposta `includiSpecificita: true`.

Il Consiglio di classe ha proiezioni supplementari: `consiglioDiClasseComune[]` per cattedre attive in entrambi partner e `consiglioDiClasseSeparato[]` per cattedre di uno solo. Nel singolo record docente, `tipoArticolazione` vale `COMUNE`, `SEPARATO_PRIMO`, `SEPARATO_SECONDO`, oppure `null` fuori articolazione. Non dedurre appartenenza da `indirizzo` o nome classe: usare questi campi.

Batch documenti/email deve rispettare configurazione `GESTIONE_ARTICOLAZIONE`: `COMPLETA` elabora parent e classi standard, esclude partner; `ARTICOLATA` elabora partner e classi standard, esclude parent. Scelta determina punto d'ingresso, non modifica percorsi CDU disponibili.

## Materie, specificità, ITP e supplenze

`focus.classe.consiglioDiClasse[]` è lista docenti già risolta alla data CDU. Ogni record può raccogliere più materie dello stesso docente. Contiene:

```text
anagrafica.nome, cognome, email, genere, appellativo
materie[]: sigla, nome, colore, specificita
ruoli.isCoordinatore, isTutorAsl, isTutorOrientamento, descrizione[]
stato.isSupplente, stato.sostituisce { nome, email } | null
tipoArticolazione
isITP
flags.isNotLast
```

`materie[].specificita` è stringa, per esempio `CHITARRA`, oppure `null`. Specificità nasce da colonna `CLASSI` `MATERIA.SPECIFICA`; non inventare catalogo chiuso di strumenti. `ALUNNI.CURRICULUM` diventa `curriculum["MateriaId"].specifiche[]`.

Un ITP è docente assegnato a colonna `MATERIA.itp`; `isITP` segnala quella cattedra. Invariante DB: docente in colonna `.itp` ha `DOCENTI.ITP = true`. `isITP` non sostituisce `materie[]`: per sapere materia laboratorio usare entrambe proprietà.

Assegnazioni sono già risolte con priorità: supplenza attiva, variazione cattedra, titolare `CLASSI`. Template non deve cercare titolare originario. `stato.isSupplente` e `stato.sostituisce` descrivono risultato alla data di `meta.date.oggi.iso`; una supplenza non attiva non compare come sostituzione attiva.

Per documento centrato su alunno usare `focus.alunno.consiglioDiClasseFiltrato[]`, non CDC classe. Esso esclude IRC/ALT incompatibile con `status.religione` e docenti di specificità non scelte nel curriculum dell'alunno. Rispetta quindi destinatario individuale.

## Ricettario richiesto

### 1. Elenco puntato studenti, religione, email

Template documento/email:

```mustache
{{#focus.classe.studenti.listaCompleta}}
• {{anagrafica.nomeCompleto}} — religione: {{status.religione}} — {{anagrafica.email}}
{{/focus.classe.studenti.listaCompleta}}
```

Valori religione sono `SI`, `NO`, `ALT`; renderizzare testo descrittivo richiede filtro/mapping dichiarato, non logica nascosta nel template.

### 2. Tabella docenti e materie, una riga per docente

Usare `consiglioDiClasse[]`: è lista adatta a una riga per docente. In una riga tabella Google Docs usare sezione sul record; cella “Docente”:

```mustache
{{anagrafica.appellativo}} {{anagrafica.nome}} {{anagrafica.cognome}}
```

Cella “Materie”:

```mustache
{{#materie}}{{nome}}{{#flags.isNotLast}}, {{/flags.isNotLast}}{{/materie}}
```

La virgola richiede flag di ultimo elemento nel livello materia. CDU canonico garantisce `flags.isNotLast` sul docente, non sul singolo elemento materia; quindi per lista materie separata da virgole usare righe/lista annidata oppure mapper che aggiunga flag materia. Variante senza separatore:

```mustache
{{#materie}}• {{nome}}{{#specificita}} — {{specificita}}{{/specificita}}
{{/materie}}
```

### 3. Elenco numerato supplenti attivi in classe

`consiglioDiClasse[]` è risolto per oggi. Mustache può filtrare visivamente per booleano:

```mustache
{{#focus.classe.consiglioDiClasse}}
{{#stato.isSupplente}}
{{anagrafica.appellativo}} {{anagrafica.nome}} {{anagrafica.cognome}}
(sostituisce {{stato.sostituisce.nome}}; {{#materie}}{{sigla}} {{/materie}})
{{/stato.isSupplente}}
{{/focus.classe.consiglioDiClasse}}
```

Applicare stile elenco numerato al paragrafo ripetuto. Se documento richiede numerazione senza righe vuote o conteggio, recipe deve fornire array dedicato di soli supplenti: CDU canonico non lo dichiara.

### 4. Ultime carenze non notificate di alunno

**Non disponibile nel CDU canonico.** `focus.alunno.didattica.carenze.dettaglio[]` contiene solo `{ materia, voto }`, aggrega carenze e non espone data, `NOTIFICATO`, progressivo o ordinamento. `focus.carenza` espone riga focalizzata (`data`, `progressivo`, `hasAssenze`, `note`) solo in pipeline carenza, ma non elenco dettagli né flag notificazione.

Per questo caso serve nuova proiezione CDU, per esempio `focus.alunno.didattica.carenze.ultimeNonNotificate[]`, ordinata per `DATA` discendente e con almeno `materia`, `voto`, `data`, `progressivo`, `note`. Placeholder non può calcolare “ultima” o filtrare `NOTIFICATO` da dati assenti.

### 5. Coordinatori in formato `Prof. Mario Rossi`

```mustache
{{#focus.classe.coordinatori}}
{{appellativo}} {{nome}}
{{/focus.classe.coordinatori}}
```

`nome` è formato destinato a questa resa dal provider. Non usare `materia` per ricostruire persona. Classe può avere più coordinatori.

### 6. Rappresentanti studenti

```mustache
{{#focus.classe.rappresentanti.studenti}}
• {{nomeCompleto}} — {{email}}
{{/focus.classe.rappresentanti.studenti}}
```

Per CDU parent corrente, implementazione aggiunge `indirizzo.nome` a ogni rappresentante aggregato; questa proprietà è estensione implementativa, non percorso definito da specifica CDU. Per template portabili, non dipenderne finché specifica non la promuove.

### 7. Rappresentanti genitori

```mustache
{{#focus.classe.rappresentanti.genitori}}
• {{nomeCompleto}}
{{/focus.classe.rappresentanti.genitori}}
```

`RAPPR_GEN` è testo libero. Non è ruolo email e non ha email disponibile: mai usare questa lista per destinatari o cercare `email`.

## Altri placeholder utili

```mustache
Studente: {{focus.alunno.anagrafica.nomeCompleto}} ({{focus.alunno.anagrafica.email}})
Classe: {{focus.alunno.classe.nome}} — {{focus.alunno.classe.indirizzoNome}}
Ore PCTO totali: {{focus.alunno.didattica.asl.oreCumulate}}
Ore PCTO anno: {{focus.alunno.didattica.asl.oreAnnoCorrente}}
Piano focalizzato: {{focus.piano.tipo}}
Data carenza focalizzata: {{focus.carenza.data}}
Oggetto email: {{destinatario.comunicazione.oggettoCalcolato}}
```

Per piani, `focus.piano` è **singolo piano focalizzato**; `focus.alunno.didattica.piani.items[]` è elenco piani. Non mescolare sottotipi. Parametri propri del piano stanno in `focus.piano.parametriGenerazione.*`; forma interna dipende da `PIANI.PARAMETRI` e va documentata per ogni `tipo`.

## Checklist autore template

1. Scegliere recipe/pipeline e target: classe, alunno, piano, carenza, email destinatario.
2. Usare solo percorso CDU canonico e verificare provider/opzione che lo popola.
3. Mettere array e booleani in sezione Mustache; preparare testo vuoto alternativo se necessario.
4. Per classe articolata, dichiarare `GESTIONE_ARTICOLAZIONE` e distinguere parent/partner con `articolazione` e `tipoArticolazione`.
5. Per docenti, usare risultato CDU già risolto; non riprodurre gerarchia supplenze/variazioni nel template.
6. Per specificità, usare `materie[].specificita` e curriculum alunno; non applicare docente specifico a tutti studenti.
7. Per destinatari email, usare solo indirizzi dichiarati. Rappresentante genitore non è contatto email.
8. Se requisito richiede filtro, ordinamento, raggruppamento o dato non presente, aggiungere ViewModelMapper/Interceptor recipe-specifico: non forzare logica nel placeholder.

## Fonti

Fonte canonica: `SPECS_ALDO/02_CDU_STRUTTURA.md`; schema: `SPECS_ALDO/01_SCHEMA_DATABASE.md`; materie non standard: `SPECS_ALDO/MAT_NON_STANDARD.md`. Stato implementativo verificato su provider CDU e proiezione Consiglio di Classe correnti.
