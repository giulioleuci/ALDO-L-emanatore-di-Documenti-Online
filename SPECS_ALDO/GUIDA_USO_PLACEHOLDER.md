# Guida Completa all'Uso dei Placeholder e del Motore di Template (SGSA / ALDO)

La presente guida descrive in modo esaustivo il funzionamento, la sintassi, le caratteristiche avanzate e le convenzioni d'uso del motore di template integrato in **SGSA (Sistema di Gestione Scolastica Automatizzata / ALDO)**. Il motore si basa sulla libreria **`WorkspaceTemplateEngine`** (L2) di `GasLibraryFactory`, orchestrata in sinergia con **`GasExpressionEngineLib`** (L2), **`ContextEngine`** (L3) e le utility trasversali di **`CoreUtilsLib`** (L0).

---

## 1. Architettura del Motore di Template

L'elaborazione dei documenti e dei testi all'interno di ALDO segue un'architettura rigorosamente **data-driven** ed a strati clean:

```
                  +-----------------------------------+
                  |   Data Model / DB (Google Sheet)  |
                  |     (CONF_DOC, CONF_MAIL, ecc.)   |
                  +-----------------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  |         ContextEngine (L3)        |
                  |  Assembled Unified Context (CDU)  |
                  +-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                    WorkspaceTemplateEngine (L2)                       |
|                                                                       |
|  +---------------------+  +---------------------+  +-----------------+ |
|  |   Mustache Facade   |  |  DocumentProcessor  |  | SheetProcessor  | |
|  | (String / Mail Text)|  |    (Google Docs)    |  | (Google Sheets) | |
|  +---------------------+  +---------------------+  +-----------------+ |
|             |                       |                     |          |
|             +-----------------------+---------------------+          |
|                                     |                                |
|                                     v                                |
|                  +-------------------------------------+             |
|                  | FilterRegistry & FilterStrategy     |             |
|                  | (Liquid/Handlebars Pipe Filters)    |             |
|                  +-------------------------------------+             |
+-----------------------------------------------------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  |    GasExpressionEngineLib (L2)    |
                  |  JSEP Parser & Logic Evaluator    |
                  +-----------------------------------+
```

### Componenti Principali

1. **`PlaceholderService` / `MyMustache`**: Facade principale che effettua il parsing e la sostituzione di variabili, gestione del contesto e applicazione dei filtri pipe su stringhe (es. soggetti email, testi HTML di `CONF_MAIL`, percorsi e nomi file).
2. **`DocumentProcessor`**: Processore specializzato per Google Docs che gestisce espansioni strutturali come elenchi puntati (`bullet_list`), elenchi numerati (`number_list`) e righe di tabelle (`tablerow_loop`) in un unico passaggio in-place invertito (reverse-order) per preservare l'integrità degli indici del documento.
3. **`SheetProcessor`**: Engine per Google Sheets dedicato all'espansione matriciale, righe dinamiche (`dynamic_rows`) e colonne dinamiche multi-gruppo (`dynamic_columns`), supportando anche la restituzione dei layout per l'applicazione granulare delle ACL.
4. **`GasExpressionEngineLib`**: Motore per la valutazione di espressioni logiche e booleane dinamiche basato su AST (Abstract Syntax Tree) generato tramite JSEP.

---

## 2. Sintassi Base e Risoluzione dei Placeholder

La sintassi fondamentale adotta la convenzione **Mustache** a doppie graffe: `{{...}}`.

### 2.1 Sostituzione Scalare (Dot Notation)

I segnali scalari vengono estratti dall'oggetto di contesto (il CDU) navigando lungo il percorso con la notazione del punto:

```mustache
Nome classe: {{focus.classe.anagrafica.nome}}
Anno scolastico: {{focus.classe.anagrafica.annoScolastico}}
Dirigente Scolastico: {{istituto.organizzazione.dirigente.nomeCompleto}}
Data di oggi: {{meta.date.oggi.estesa}}
```

### 2.2 Escaping HTML vs Unescaped Output

- **`{{proprieta}}`** (Doppie graffe): Effettua l'escape dei caratteri HTML speciali (`<`, `>`, `&`, `"`, `'`). Da utilizzare per la maggior parte dei valori di testo standard per prevenire injection HTML.
- **`{{{proprieta}}}`** oppure **`{{&proprieta}}`** (Triple graffe o ampersand): Restituisce il valore **grezzo unescaped**, preservando la formattazione HTML. Da utilizzare esclusivamente quando si inseriscono frammenti HTML pre-renderizzati.

### 2.3 Sicurezza e Protezione da Prototype Pollution

Il lookup dei placeholder include una protezione automatica (`_isDangerousKey`). Qualsiasi tentativo di accedere alle seguenti proprietà riservate viene bloccato e risolto a `undefined`:

- `__proto__`
- `constructor`
- `prototype`

---

## 3. Navigazione nell'Albero del Contesto (Context Stack)

Il motore mantiene una **pila dei contesti** (`_MustacheContext`). Quando si entra in una sezione o in un loop, viene creato un nuovo livello di contesto (Child Context) agganciato al genitore (Parent Context).

```
[ Root CDU Context ] (istituto, meta, focus, destinatario)
         |
         v
[ Sezione / Loop Context ] (item corrente di focus.classe.studenti.listaCompleta)
```

### 3.1 Risoluzione Automatica dal Basso verso l'Alto (Fallback)

Se un identificatore viene cercato all'interno di un blocco e non viene trovato nel contesto locale dell'item corrente, il motore risale automaticamente la catena dei contesti fino alla radice.

_Esempio:_

```mustache
{{#focus.classe.studenti.listaCompleta}}
  Alunno: {{anagrafica.nomeCompleto}} - Classe: {{focus.classe.anagrafica.nome}}
{{/focus.classe.studenti.listaCompleta}}
```

_Spiegazione:_ `anagrafica.nomeCompleto` appartiene all'alunno corrente. `focus.classe.anagrafica.nome` non esiste nell'alunno, quindi il motore risale al CDU principale e lo risolve correttamente.

### 3.2 Navigazione Esplicita al Genitore (`../`)

Per risalire esplicitamente di uno o più livelli nella gerarchia senza fare affidamento sul fallback automatico, è possibile utilizzare la sintassi Handlebars **`../`**:

```mustache
{{#focus.classe.studenti.listaCompleta}}
  {{#curriculum}}
    Materia: {{materiaNome}} - Alunno: {{../anagrafica.nomeCompleto}} - Anno: {{../../focus.classe.anagrafica.anno}}
  {{/curriculum}}
{{/focus.classe.studenti.listaCompleta}}
```

- `../anagrafica.nomeCompleto`: Sale di 1 livello (dall'item del curriculum all'alunno).
- `../../focus.classe.anagrafica.anno`: Sale di 2 livelli (dall'item del curriculum, all'alunno, fino al contesto CDU root).

---

## 4. Strutture di Controllo e Loop

### 4.1 Sezioni Mustache Standard (`{{#array}} ... {{/array}}`)

Iterano su collezioni o agiscono come blocchi condizionali se il valore è un booleano `true`.

```mustache
{{#focus.classe.coordinatori.elenco}}
  - {{appellativoCompleto}} (Materia: {{materia}})
{{/focus.classe.coordinatori.elenco}}
```

### 4.2 Sezioni Invertite (`{{^array}} ... {{/array}}`)

Vengono eseguite quando l'array è vuoto, il valore è `null`, `undefined` oppure `false`.

```mustache
{{#focus.classe.didattica.carenze.hasCarenze}}
  Attenzione: Sono presenti carenze formative per la classe.
{{/focus.classe.didattica.carenze.hasCarenze}}
{{^focus.classe.didattica.carenze.hasCarenze}}
  Nessuna carenza segnalata.
{{/focus.classe.didattica.carenze.hasCarenze}}
```

### 4.3 Meta-Variabili di Loop

Durante l'iterazione su array, il motore rende disponibili le seguenti meta-variabili speciali:

| Meta-Variabile | Tipo    | Descrizione                                                |
| :------------- | :------ | :--------------------------------------------------------- |
| `@index`       | Number  | Indice 0-based dell'elemento corrente nell'array.          |
| `@first`       | Boolean | `true` se l'elemento corrente è il primo della collezione. |
| `@last`        | Boolean | `true` se l'elemento corrente è l'ultimo della collezione. |
| `@key`         | String  | Nome della chiave corrente se si itera su un oggetto.      |

#### Gestione del "Separatore di Fine" (Virgole e Delimitatori)

In ALDO, per facilitare i template nei documenti Google, ogni item di un array principale (es. `consiglioDiClasse`) include anche il flag precalcolato `flags.isNotLast` (`true` se l'elemento non è l'ultimo).

_Esempio con `@last` e `flags.isNotLast`:_

```mustache
Docenti presenti:
{{#focus.classe.consiglioDiClasse}}
  {{anagrafica.nomeCompleto}}{{#flags.isNotLast}}, {{/flags.isNotLast}}
{{/focus.classe.consiglioDiClasse}}
```

---

### 4.4 Loop Strutturali per Google Docs (`DocumentProcessor`)

I documenti Google Docs richiedono marcatori strutturali specifici per generare elenchi nativi o tabelle con righe dinamiche.

#### A. Elenco Puntato (`{{#bullet_list:...}}`)

Genera un elenco puntato nativo in Google Docs per ogni elemento dell'array indicato.

```mustache
{{#bullet_list:focus.classe.consiglioDiClasse}}
{{anagrafica.appellativoCompleto}} — {{materieDescrizione}}
{{/bullet_list}}
```

**Elenco puntato delle supplenze attive:**
```mustache
{{#bullet_list:focus.classe.supplenze}}
{{supplente.appellativoCompleto}} sostituisce {{titolare.appellativoCompleto}} ({{dettaglioMaterie | map:'nomeSintetico' | join:', '}})
{{/bullet_list}}
```

**Elenco puntato dei piani non verbalizzati:**
```mustache
{{#bullet_list:focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati.elenco}}
{{studente.nomeCompleto}} — {{tipoLabel}}
{{/bullet_list}}
```

#### B. Elenco Numerato (`{{#number_list:...}}`)

Genera un elenco numerato progressivo nativo in Google Docs.

```mustache
{{#number_list:focus.classe.studenti.listaCompleta}}
{{anagrafica.nomeCompleto}} (Indirizzo: {{indirizzo.nomeSintetico}})
{{/number_list}}
```

#### C. Righe di Tabelle Dinamiche (`{{#tablerow_loop:...}}`)

Posizionato all'interno delle celle di una riga di tabella in Google Docs, clona e popola la riga per ogni elemento dell'array. Le colonne sono separate da virgola.

```mustache
{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}},{{status.religioneLabel}},{{anagrafica.email}}
```

---

### 4.5 Espansioni Matrenziali per Google Sheets (`SheetProcessor`)

In Google Sheets le direttive vengono scritte all'interno di celle singole racchiuse tra graffe doppie e sintassi a parentesi quadre.

#### A. Righe Dinamiche (`dynamic_rows`)

Espande verticalmente un array di dati a partire dalla riga corrente.

```text
{{dynamic_rows[source=focus.classe.studenti.listaCompleta,value=anagrafica.nomeCompleto]}}
```

#### B. Colonne Dinamiche Multi-Gruppo (`dynamic_columns`)

Effettua l'espansione orizzontale delle colonne (es. per materie articolate o valutazioni per gruppo).

```text
{{dynamic_columns[source=focus.classe.sheet.materieColonne.group1,value=header,source2=focus.classe.sheet.materieColonne.group2,value2=header,label2=focus.classe.sheet.materieColonne.group2Label]}}
```

#### C. Placeholder speciale Materie con Permessi (`{{focus.classe.elencoMaterieConPermessi}}`)

Placeholder ad espansione orizzontale in Google Sheets. Inserisce $N$ colonne a destra corrispondenti al numero di materie della classe e restituisce il layout (`layouts`) per applicare le relative ACL sui range di celle generati.

---

## 5. Motore di Espressione e Condizioni Avanzate (`GasExpressionEngineLib`)

Oltre alle normali sezioni booleane di Mustache, ALDO consente di valutare espressioni dinamiche complesse memorizzate nel database (es. `PARAMETRI` di `CONF_DOC` o condizioni di attivazione dei box email) tramite `GasExpressionEngineLib`.

### 5.1 Operatori Supportati

- **Confronto ed Uguaglianza**: `==`, `!=`, `===`, `!==`, `>`, `>=`, `<`, `<=`
- **Logici**: `&&`, `||`, `!`
- **Aritmetici**: `+`, `-`, `*`, `/`, `%`

### 5.2 Valutazione di Espressioni con Placeholder

Le espressioni possono contenere direttamente placeholder che vengono risolti rispetto al CDU prima dell'analisi AST.

_Esempi di Espressioni Valide:_

```javascript
// Verifica se la classe è del triennio e ha progetti ASL/PCTO attivi
'{{focus.classe.flags.isTriennio}} && {{focus.classe.hasProgetti}}';

// Verifica presenza di bocciature nello storico dell'alunno
'{{focus.alunno.storico.hasBocciature}} == true';

// Valutazione condizionale numerica sul numero di carenze
'{{focus.alunno.didattica.carenze.numero}} > 2';
```

---

## 6. Catalogo Completo dei Filtri Pipe (`{{value | filterName:args}}`)

Il motore supporta i filtri in stile Liquid/Handlebars mediante la sintassi con tubo (`|`). I filtri possono essere concatenati ed accettano argomenti posizionali separati da due punti (`:`).

### 6.1 Filtri sulle Stringhe

| Filtro       | Firma Syntax                            | Descrizione                                                                               | Esempio                          | Output          |
| :----------- | :-------------------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------- | :-------------- |
| `uppercase`  | `{{val \| uppercase}}`                  | Converte la stringa interamente in maiuscolo.                                             | `{{'rossi' \| uppercase}}`       | `ROSSI`         |
| `lowercase`  | `{{val \| lowercase}}`                  | Converte la stringa interamente in minuscolo.                                             | `{{'MARIO' \| lowercase}}`       | `mario`         |
| `capitalize` | `{{val \| capitalize}}`                 | Primo carattere maiuscolo, il resto minuscolo. Unicode-safe.                              | `{{'mARIO' \| capitalize}}`      | `Mario`         |
| `truncate`   | `{{val \| truncate:length:suffix}}`     | Tronca la stringa alla lunghezza specificata aggiungendo un suffisso (default 50, "..."). | `{{testo \| truncate:10:'...'}}` | `Questo e'...`  |
| `split`      | `{{val \| split:separator}}`            | Divide una stringa in un array di elementi in base al separatore (default `,`).           | `{{'a,b,c' \| split:','}}`       | `['a','b','c']` |
| `replace`    | `{{val \| replace:search:replacement}}` | Sostituisce tutte le occorrenze di `search` con `replacement`.                            | `{{nome \| replace:'a':'o'}}`    | `Mario`         |
| `urlEncode`  | `{{val \| urlEncode}}`                  | Codifica la stringa per l'inserimento sicuro in un URL.                                   | `{{query \| urlEncode}}`         | `5AB%2FLC`      |

---

### 6.2 Filtri di Formattazione e Valuta

| Filtro     | Firma Syntax                    | Descrizione                                                                       | Esempio                        | Output       |
| :--------- | :------------------------------ | :-------------------------------------------------------------------------------- | :----------------------------- | :----------- |
| `date`     | `{{val \| date}}`               | Formatta un oggetto Date o stringa ISO nel formato `dd/MM/yyyy`.                  | `{{meta.timestamp \| date}}`   | `30/03/2026` |
| `number`   | `{{val \| number:decimals}}`    | Formatta un numero con cifre decimali fisse.                                      | `{{media \| number:2}}`        | `7.50`       |
| `currency` | `{{val \| currency:symbol}}`    | Formatta un valore numerico come valuta con il simbolo specificato (default `€`). | `{{costo \| currency:'€'}}`    | `€ 150,00`   |
| `yesNo`    | `{{val \| yesNo:yesStr:noStr}}` | Mappa un booleano in una stringa personalizzata (default `"Sì,No"`).              | `{{isBes \| yesNo:'SÌ':'NO'}}` | `SÌ`         |

---

### 6.3 Filtri su Array e Collezione

| Filtro    | Firma Syntax                      | Descrizione                                                                                                       | Esempio                                          |
| :-------- | :-------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| `map`     | `{{array \| map:'propName'}}`     | Estrae un array contenente solo il valore della proprietà specificata da ciascun oggetto.                         | `{{studenti \| map:'nomeCompleto'}}`             |
| `join`    | `{{array \| join:'key':'sep'}}`   | Unisce gli elementi di un array in una stringa usando un separatore (default `, `). Supporta la chiave opzionale. | `{{docenti \| map:'nomeCompleto' \| join:', '}}` |
| `limit`   | `{{array \| limit:count}}`        | Slices l'array restituendo solo i primi `count` elementi (default 10).                                            | `{{studenti \| limit:5}}`                        |
| `skip`    | `{{array \| skip:count}}`         | Salta i primi `count` elementi dell'array.                                                                        | `{{studenti \| skip:5}}`                         |
| `sort`    | `{{array \| sort:'prop':'desc'}}` | Ordina un array di primitive o di oggetti in base a una proprietà (opzionale `desc`).                             | `{{studenti \| sort:'cognome'}}`                 |
| `sortBy`  | `{{array \| sortBy:'prop'}}`      | Ordina un array di oggetti in base alla proprietà indicata.                                                       | `{{coordinatori \| sortBy:'nome'}}`              |
| `reverse` | `{{array \| reverse}}`            | Inverte l'ordine degli elementi di un array (copia shallow).                                                      | `{{storico \| reverse}}`                         |
| `where`   | `{{array \| where:'key':val}}`    | Filtra gli oggetti dell'array dove `key == val`. _(Nota: in ALDO usato solo su flag di shape booleane)_.          | `{{piani \| where:'isBes':true}}`                |
| `exclude` | `{{array \| exclude:'key':val}}`  | Filtra gli oggetti dell'array dove `key != val`.                                                                  | `{{studenti \| exclude:'isBes':true}}`           |

---

### 6.4 Filtri Aritmetici, Logici e di Fallback

| Filtro                 | Firma Syntax                     | Descrizione                                                              | Esempio                                              | Output                  |
| :--------------------- | :------------------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------- | :---------------------- |
| `default` / `fallback` | `{{val \| default:defVal}}`      | Restituisce `defVal` se il valore è `null`, `undefined` o stringa vuota. | `{{note \| default:'Nessuna nota'}}`                 | `Nessuna nota`          |
| `plus`                 | `{{val \| plus:addend}}`         | Somma algebrica: aggiunge `addend` al valore numerico.                   | `{{anno \| plus:1}}`                                 | `6`                     |
| `minus`                | `{{val \| minus:subtrahend}}`    | Sottrarre `subtrahend` dal valore numerico.                              | `{{ore \| minus:5}}`                                 | `25`                    |
| `pluralize`            | `{{val \| pluralize:sing:plur}}` | Restituisce la forma singolare o plurale in base al conteggio numerico.  | `{{numeroCarenze \| pluralize:'carenza':'carenze'}}` | `carenze`               |
| `json`                 | `{{val \| json:indent}}`         | Serializza l'oggetto o valore in formato JSON string.                    | `{{parametri \| json:2}}`                            | `{\n  "target": ...\n}` |

---

### 6.5 Composizione di Filtri in Catena (Chaining)

I filtri possono essere combinati in catena sequenziale da sinistra a destra:

```mustache
Elenco docenti ordinato e formattato:
{{focus.classe.consiglioDiClasse | map:'anagrafica' | map:'nomeCompleto' | sort | join:', ' | uppercase}}
```

---

## 7. Convenzioni e Regole di Progettazione in ALDO

Nello sviluppo di SGSA / ALDO si applicano vincoli stringenti derivati dalle specifiche ufficiali (`SPECS_ALDO/02_CDU_STRUTTURA.md` e `AGENTS.md`):

### 7.1 Regole di Progettazione del CDU

1. **Principio Array-First (Divieto Mappe a Chiavi Dinamiche)**:
   - _Errato_: `curriculum["INTERPRETAZIONE"]` (le chiavi dinamiche non sono indirizzabili nei placeholder).
   - _Corretto_: `curriculum: [ { materiaId: "INTERPRETAZIONE", materiaNome: "Esecuzione", specifiche: [...] } ]`.
2. **Denormalizzazione 1:1 negli Item (Self-Containment)**:
   - Ogni elemento di un array (studenti, docenti, materie) porta con sé il proprio contesto genitore (nome classe, indirizzo, appellativo completo).
   - _Obiettivo_: Mantenere i placeholder dentro i loop cortissimi, senza navigazioni complesse `../`.
3. **Stringhe Pronte per la Stampa**:
   - Il CDU espone già le forme testuali pronte (`appellativoCompleto`, `materieDescrizione`, `religioneLabel`, `tipoLabel`). I template non devono concatenare stringhe.
4. **Partizioni Precalcolate**:
   - I raggruppamenti per il dominio (es. `consiglioDiClasseComune`, `consiglioDiClasseSeparato`, `esame.materiePrimaProva`) sono precalcolati dal `ContextEngine` nel CDU.
   - La partizione `pianiPersonalizzati.nonVerbalizzati` (stato ≠ verbalizzato) è precalcolata nel CDU: i template non devono filtrare su `stato`.

### 7.2 Budget di Lunghezza dei Placeholder (Principio 6)

- **Dentro i loop**: Massimo 2–3 segmenti (es. `{{anagrafica.nomeCompleto}}`, `{{status.religioneLabel}}`).
- **Fuori dai loop**: Massimo 4 segmenti (es. `{{focus.classe.anagrafica.nome}}`).
- _Nota_: Qualsiasi violazione del budget va risolta denormalizzando i dati nel CDU a monte, mai allungando la catena del placeholder.

### 7.3 Separazione tra Filtri Ammessi e Vietati nei Template

- **Filtri Ammessi (Presentazione)**: `uppercase`, `lowercase`, `capitalize`, `date`, `number`, `join`, `map`, `limit`, `skip`, `sort`, `sortBy`, `reverse`, `default`, `fallback`, `truncate`, `split`, `replace`, `urlEncode`, `plus`, `minus`, `pluralize`, `yesNo`.
- **Filtri Vietati nei Template (Valori di Dominio)**: È **rigorosamente vietato** usare `where` o `exclude` nei template con valori di dominio hardcodati (es. `where:'tipoArticolazione','COMUNE'` oppure `exclude:'sigla','IRC'`). Tali partizioni devono risiedere in array dedicati del CDU.
- _Eccezione consentita_: `where` / `exclude` su proprietà booleane di shape/struttura (es. `where:'isBes':true`).

### 7.4 Risoluzione di `LazyRef<T>`

I nodi dello storico (`focus.classe.storico`, `focus.alunno.storico`, `*.didattica.documenti.storico`) sono gestiti tramite `LazyRef<T>` (`CoreUtilsLib`). Il servizio chiamante o lo step del pipeline deve invocare `.get()` per materializzare il nodo **prima** che il CDU venga passato al `WorkspaceTemplateEngine`.

---

## 8. Esempi Pratici e Scenari Complessi

### Esempio 1: Verbale Consiglio di Classe (Google Docs)

Estratto da un modello di verbale in `CONF_DOC` per classe articolata:

```mustache
ISTITUTO D'ISTRUZIONE SUPERIORE
Anno Scolastico {{focus.classe.anagrafica.annoScolastico}}

VERBALE DEL CONSIGLIO DELLA CLASSE {{focus.classe.anagrafica.nome}}
Indirizzo: {{focus.classe.anagrafica.indirizzo.nome}}

In data {{meta.date.oggi.estesa}}, si è riunito il Consiglio di Classe presieduto da {{focus.classe.coordinatori.appellativo}} {{focus.classe.coordinatori.elenco.0.nomeCompleto}}.

DOCENTI COMPONENTI IL CONSIGLIO DI CLASSE:
{{#bullet_list:focus.classe.consiglioDiClasse}}
{{anagrafica.appellativoCompleto}} — {{materieDescrizione}} ({{tipoArticolazione}})
{{/bullet_list}}

ELENCO STUDENTI E RELIGIONE:
[Tabella Google Docs con header: Alunno | Opzione Religione | Email]
{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}},{{status.religioneLabel}},{{anagrafica.email}}

{{#focus.classe.flags.isTerminale}}
MATERIE OGGETTO DI PRIMA PROVA D'ESAME:
{{#bullet_list:focus.classe.esame.materiePrimaProva}}
{{nome}} (Docente: {{docentiDescrizione}})
{{/bullet_list}}
{{/focus.classe.flags.isTerminale}}
```

---

### Esempio 2: Griglia Valutazione / Roster Alunni (Google Sheets)

Configurazione cella $A1$ e $B1$ per un foglio di calcolo generato con `SheetProcessor`:

- **Cella A2 (Generazione Righe Roster Alunni)**:

```text
{{dynamic_rows[source=focus.classe.studenti.listaCompleta,value=anagrafica.nomeCompleto]}}
```

- **Cella B1 (Espansione Colonne Materie Multi-Gruppo)**:

```text
{{dynamic_columns[source=focus.classe.sheet.materieColonne.group1,value=header,source2=focus.classe.sheet.materieColonne.group2,value2=header,label2=focus.classe.sheet.materieColonne.group2Label]}}
```

---

### Esempio 3: Convocazione Personalizzata via Email (HTML / Gmail)

Template HTML memorizzato nel campo `TESTO_START` della tabella `CONF_MAIL`:

```html
<p>{{destinatario.comunicazione.salutoIniziale}}</p>

<p>
  Si comunica che è stata convocata la riunione del Consiglio per la classe
  <strong>{{focus.classe.anagrafica.nome}}</strong> per il giorno {{meta.date.oggi.estesa}}.
</p>

{{#destinatario.flags.isCoordinatore}}
<p style="color: #005A9C;">
  <strong>Nota per il Coordinatore:</strong> Le ricordiamo di verificare la presenza dei verbali
  precedenti.
</p>
{{/destinatario.flags.isCoordinatore}}

<p>Le tue cattedre:</p>
<ul>
  {{#destinatario.contesto.cattedre}}
  <li><strong>{{classeNome}}</strong> —
    {{#materie}}{{nome}}{{^@last}}, {{/@last}}{{/materie}}
  </li>
  {{/destinatario.contesto.cattedre}}
</ul>

<p>Oppure, per la lista piatta deduplicata su tutte le classi, usa il box standard
<code>cattedre</code> (BOX_CFG <code>{"TIPO_BOX":"cattedre"}</code>, titolo default "Le tue cattedre")
oppure itera direttamente <code>destinatario.contesto.materieCompetenza</code>:</p>
<ul>
  {{#destinatario.contesto.materieCompetenza}}
  <li>{{nome}}</li>
  {{/destinatario.contesto.materieCompetenza}}
</ul>

<p>
  Cordiali saluti,<br />
  {{istituto.organizzazione.dirigente.nomeCompleto}}<br />
  <em>{{meta.date.oggi.breve}}</em>
</p>
```

`TESTO_END` (stessa tabella) accetta lo stesso tipo di template HTML e viene
inserito dopo i box, prima del footer "comunicazione automatica" — utile per
un saluto di chiusura o un rimando successivo ai contenuti dinamici.

`RISPONDI_A` (stessa tabella) è un'espressione placeholder che deve risolvere
a un singolo indirizzo email — imposta l'intestazione Reply-To del messaggio.
Esempio per una comunicazione ai genitori che deve tornare al coordinatore
della classe frequentata dal figlio:

```text
{{focus.classe.coordinatori.elenco.0.email}}
```

Se la colonna è vuota, l'invio si comporta come oggi (nessun Reply-To
impostato). Se non è vuota ma il risultato non è un indirizzo email valido
(ad esempio la classe non ha coordinatori), l'invio prosegue comunque, senza
intestazione Reply-To, e viene registrato un WARN nei log operativi.

---

### Esempio 4: Formattazione Avanzata con Filtri Pipe e Separatori

Generazione di una lista separata da virgole con nomi in maiuscolo e fallback:

```mustache
Studenti Rappresentanti di Classe:
{{focus.classe.rappresentanti.studenti | map:'nomeCompleto' | sort | join:', ' | uppercase | default:'Nessun rappresentante eletto'}}
```

Se la lista dei rappresentanti è popolata: `MARCO NERI, GIUSEPPE ROSSI`.
Se la lista è vuota: `Nessun rappresentante eletto`.
