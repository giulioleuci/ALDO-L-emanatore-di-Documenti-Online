# Template Playground — webapp statica per costruire template ALDO

## Obiettivo

Costruire una webapp statica (client-only, zero backend) pensata per gli **autori di
template** (segretaria, referenti, personale che configura `CONF_DOC`/`CONF_MAIL`)
che devono scrivere documenti, tabelle ed email di ALDO senza toccare codice GAS.

La webapp:

- parte da **dati CDU fittizi** organizzati in **più scenari tematici**;
- permette di **costruire frasi e tabelle in modo visuale**: si esplora l'albero
  del CDU, si clicca un nodo, e dal menù si scelgono filtri, loop, condizionali e
  sezioni invertite senza conoscere la sintassi a memoria;
- mostra un'**anteprima live renderizzata** del template risultante (con le
  direttive Google Docs e Google Sheets simulate);
- **applica in modo bloccante le regole di dominio** della guida placeholder
  (sez. 7), garantendo che il template prodotto sia sempre produttivo;
- **esporta il template** come testo `.txt` e permette la **copia negli appunti**
  (nessun salvataggio di bozze, nessun account).

Il risultato è il testo del template pronto da incollare nelle colonne
`TESTO`/`TESTO_START` di `CONF_DOC`/`CONF_MAIL` o nei documenti modello Google di
ALDO.

## Pubblico e tono delle regole

Gli autori scrivono template veri. Le regole della guida (indirizzi duplicati,
budget dei percorsi, divieto `where`/`exclude` su valori di dominio, obbligo
`hasElenco`, divieto di riordinamento dei dati di dominio) sono **bloccanti**:
una violazione è un errore rosso con il token responsabile evidenziato e il
template è marcato come non produttivo.

Unica eccezione concordata: **le concatenazioni manuali di stringhe** (regola 5)
sono bloccate **solo nei casi inequivocabili** (unione di campi atomici affiancata
dallo spazio dove esiste la descrizione composita preready, es.
`{{appellativoCompleto}} {{cognomeNome}}`); negli altri casi sono un **warning**
senza blocco.

## Stack e collocazione

Cartella **`template-playground/`** dentro questo repo, package separato con un
proprio `package.json`:

- **Vite** (dev server + build statica) — unica dev-dependency;
- **TypeScript vanilla**, nessun framework UI (la UI è un pannello a due/tre aree);
- **Vitest** per i test (stessa API di Jest, zero config extra);
- build → `dist/` statica deployabile su hosting statico / GitHub Pages.

Comandi (dentro `template-playground/`): `npm run dev`, `npm run build`,
`npx vitest run`.

## Scenari fittizi (dati)

`data/scenarios/` espone quattro scenari CDU tematici selezionabili dalla barra
alta, tutti con nomi fittizi coerenti con gli esempi della guida (BIANCHI, FERRI,
NERI, ROSSI, VERDI, 3A INF):

1. **3A INF — classe non terminale articolata**: consiglio, materie, studenti con
   religione/email, coordinatori, supplenze, piani personalizzati, carenze.
   Base per verbali, convocazioni, roster.
2. **5A — classe terminale**: `isTerminale`, `esame.materiePrimaProva`, bilancio
   prima/seconda prova, rappresentanti, partizioni calcolate.
3. **Alunno singolo** (`focus.alunno`): BES/DSA/PEI, storico curriculum
   (LazyRef materializzato), carenze, piani personalizzati. Documenti
   individualizzati.
4. **Docente destinatario** (pipeline email): `destinatario.cattedre.elenco`,
   `materie.elenco`, `isCoordinatore`, saluto; sull'esempio convocazione email
   della guida. Include `render` (box HTML).

### Annotazioni semantiche dei nodi

Ogni nodo dell'albero CDU porta annotazioni che alimentano il menù filtri e le
regole bloccanti:

- **tipo** (stringa, numero, booleano, array, oggetto);
- **forma pronta per la stampa** (flag "già testo");
- **budget di percorso** dichiarato (dentro/fuori loop);
- **blacklist privacy** (email, note, dati BES/DSA/PEI) — nodi sensibili;
  il solo scenario può autorizzarli in un contesto di output specifico (es.
  l'email dello studente nel contesto `ELENCO_INTERNO`), elencandoli in
  `privacyAutorizzati`. Nessun contesto di output = default non autorizzato.

## Moduli

| Modulo | Responsabilità |
|---|---|
| `engine/tokenizer.ts` | Tokenizza il template: testo, `{{var}}`, `{{{var}}}`, `{{&var}}`, `{{#sez}}`, `{{^sez}}`, `{{/sez}}`, direttive Docs (`{{#bullet_list:...}}`, `number_list`, `tablerow_loop`), direttive Sheets (`dynamic_rows[...]`, `dynamic_columns[...]`), espressioni nelle sezioni; errori di delimitatori |
| `engine/renderer.ts` | Context stack con fallback bottom-up e `../`, meta-var (`@index`, `@number`, `@first`, `@last`, `@odd`, `@even`, `@total`, `@key`), sezioni/invertite, triple graffe raw, indicizzazione `[0]`, sezioni condizionate da espressioni booleane |
| `engine/filters.ts` | I ~25 filtri pipe della guida; argomenti posizionali con stringhe quotate; chaining da sinistra a destra |
| `engine/structural.ts` | `bullet_list`, `number_list`, `tablerow_loop`, `dynamic_rows`, `dynamic_columns` → HTML per l'anteprima |
| `engine/expression.ts` | Valutatore booleano leggero (sintassi stile `GasExpressionEngineLib`) per espressioni con placeholder |
| `rules/rules.ts` | Regole bloccanti + warning (vedi §Regole) |
| `data/scenarios/*.ts` | I 4 scenari CDU fittizi con annotazioni |
| `ui/tree.ts`, `ui/editor.ts`, `ui/insert.ts`, `ui/preview.ts` | Arte, editing, menù inserimento, anteprima |
| `main.ts` | Bootstrap e wiring |

Architettura a flusso unidirezionale: editor (token) → `rules` (validazione in
background) → `renderer` → anteprima. Tutto client-side.

## UI

- **Barra alta**: selettore scenario + contesto di output (es. `VERBALE`,
  `CONVOCAZIONE`, `ELENCO_INTERNO`) + modalità anteprima `DOCS | SHEETS`.
- **Albero CDU** (sinistra): clic su nodo → inserimento; mostra tipo, esempio e
  budget di percorso.
- **Editor** (centro): testo libero misto a **placeholder come token colorati**
  (chip), non testo crudo. Clic su chip → menù a comparsa: aggiungi filtri (con
  firma completa e esempio di output, filtro applicabile solo al tipo del nodo),
  avvolgi in loop, condizionale, sezione invertita, sezione con espressione.
- **Anteprima live** (basso): render HTML del template. Modalità Docs: testo +
  `bullet_list`/`number_list`/`tablerow_loop` come elenchi/tabelle reali. Modalità
  Sheets: `dynamic_rows`/`dynamic_columns` resi come tabella simulata.
- **Pannello "Problemi"**: errori rossi bloccanti (con token evidenziato) e
  warning; semaforo di validità del template.
- **Azioni**: copia negli appunti + export `.txt`.

## Regole bloccanti

1. **Budget percorsi** — max 4 segmenti fuori loop, 3 dentro loop; violazione →
   errore con suggerimento di denormalizzare a monte nel CDU.
2. **`where`/`exclude` vietati su valori di dominio** (es.
   `where:'tipoArticolazione','COMUNE'`); consentiti solo su booleani di shape
   (`where:'isBes':true`).
3. **`hasElenco` obbligatorio** prima di iterare/stampare una collezione opzionale
   (eccezione: percorsi dichiarati sempre presenti nello scenario).
4. **Niente `sort`/`sortBy`/`reverse` su array di dominio** (il CDU è già
   ordinato); consentiti solo su array di origine locale (`split`, `map`).
5. **Concatenazioni manuali**: blocco solo nei casi inequivocabili (vedi §Pubblico),
   warning nel resto.
6. **Privacy**: riferimento a un nodo sensibile in blacklist → errore, a meno
   che lo scenario lo autorizzi nel contesto di output attivo (`privacyAutorizzati`).
7. **Sintassi**: token malformati, sezioni non chiuse, argomenti filtro errati,
   iterazioni su non-array → errore.

## Error handling

Il renderer non lancia mai eccezioni fuori dal controllo: ogni problema produce un
**marker HTML rosso** nell'anteprima e una riga nel pannello "Problemi" con la
posizione. L'editing non si blocca mai.

## Test

Vitest, 100% della logica pura, con i 4 scenari come fixture (input template →
output atteso):

- `tokenizer`: ogni token type, errori di delimitatori;
- `renderer`: context stack, `../`, meta-var, `[0]`, raw vs escaped, sezioni,
  invertite, sezioni con espressioni;
- `filters`: ogni filtro, quotature, chaining, tipi errati;
- `structural`: tutte le direttive Docs/Sheets, incluso multi-gruppo;
- `rules`: ogni regola con caso positivo e negativo.

## Fuori scope (v1)

- Engine di espressioni per i `PARAMETRI` di `CONF_DOC` (config-time, non template
  authoring).
- Export JSON strutturato della definizione.
- Login, backend, persistenza account, salvataggio bozze (deciso: solo copia e
  export `.txt`).
- Modalità "playground libera" senza regole.