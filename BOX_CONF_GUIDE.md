# Guida a `CONF_MAIL.BOX_CFG`

Guida di riferimento per chi scrive righe `CONF_MAIL` (email data-driven, 11 §5/§6).
Ogni affermazione qui è verificata contro il codice sorgente indicato (file:riga); non
si basa su `AGGIORNAMENTI_DA_FARE.md` né su `FAKEDB/CONF_MAIL.csv`, che descrivono uno
schema `DATI_SORGENTE.metodo/filtri` più ricco (routing generico verso `AggregatoreDati`,
`src/application/services/AggregatoreDati.ts:87-115`) che **non è quello che il percorso
di rendering dei box esegue oggi**. Vedi la nota a fondo pagina "Perché non `DATI_SORGENTE`"
per il dettaglio di questa discrepanza.

> Gli esempi HTML in `HTML_EXAMPLE/` sono l'output reale (`corpoHtml`) della pipeline
> `BuildCDUStep → ValutaCondizioniInvioStep → RenderBoxesStep → ComposeEmailStep`
> (`src/application/pipelines/emailSteps.ts`), eseguita su dati fittizi con lo stesso
> harness già usato da `test/unit/application/pipelines/email-steps.test.ts` (fake
> `FakeDatabase`/`FakeTemplateEngine`/`FakeDriveFacade`, repository reali). Non esiste
> uno script persistito nel repository per rigenerarli (uno script del genere,
> vivendo fuori da `tsconfig.eslint.json`'s scope `src/**`+`test/**`, rompe
> `npm run lint` che scansiona l'intero repository) — per rigenerarli, scrivere un
> file `*.test.ts` temporaneo che replica il pattern di `email-steps.test.ts`,
> eseguirlo con `npx jest --config jest.config.cjs --roots <dir-temporanea>
> --testMatch "**/*.test.ts"`, e cancellarlo a generazione completata.

---

## 1. La busta (`CONF_MAIL`, le colonne)

Entità: `src/domain/entities/ConfigurazioneEmail.ts:15-93`. Colonne: `COL_CONF_MAIL`
(`src/config/schema.ts:33-44`).

| Colonna | Tipo | Significato | Sorgente |
|---|---|---|---|
| `ID` | string \| null | PK del pattern; finisce in `LOG_MAIL.PATTERN` | `ConfigurazioneEmail.ts:27-28`, `emailSteps.ts:428-429` |
| `OGGETTO` | string (Mustache) | Oggetto email, processato sull'intera CDU del destinatario | `ConfigurazioneEmail.ts:29-32`; risolto in `RenderBoxesStep._executeLogic`, `emailSteps.ts:212` |
| `PROCESSO` | `ProcessoInvio` | Determina la recipe CDU (vedi §2) | `ConfigurazioneEmail.ts:33`; enum in `src/domain/value-objects/enums.ts:63-70` |
| `BOX_CFG` | string (JSON array) | Array di box — argomento principale di questa guida | `ConfigurazioneEmail.ts:36-39,54-58` |
| `TESTO` | string (Mustache) | Paragrafo introduttivo, inserito **prima** dei box | `ConfigurazioneEmail.ts:40-41,60-62`; usato in `ComposeEmailStep`, `emailSteps.ts:268,281` |
| `SUPPLENTI` | `GestioneSupplenti` | `SOLO_TITOLARI` / `SOLO_SUPPLENTI` / `ENTRAMBI`; conta solo per `PER_DOCENTE`/`PER_COORDINATORE` (routing in `ResolveRecipientsStep`) | `ConfigurazioneEmail.ts:34-35`; enum in `enums.ts:71-75`; uso in `emailSteps.ts:302-353` |
| `NOREPLY` | boolean | Se `true`, aggiunge un blocco di avviso "risposta non monitorata" | `ConfigurazioneEmail.ts:42,63-65`; blocco in `emailSteps.ts:270-272` |
| `COLORE_HEADER` | string hex | Colore di sfondo dell'header; default `#007bff` se vuoto | `ConfigurazioneEmail.ts:9,43-46,67-70`; applicato in `emailSteps.ts:286` |
| `CONDIZIONE` | string \| null | Espressione booleana (via `IExpressionEngine`) valutata sulla CDU del destinatario; se `null`/vuota l'invio procede sempre | `ConfigurazioneEmail.ts:47-50,72-74`; valutata in `ValutaCondizioniInvioStep`, `emailSteps.ts:171-186` |
| `POST_PROCESSO` | string (JSON) \| null | Azioni post-invio (es. timbratura `NOTIFICATO`), eseguite solo dopo almeno un invio riuscito | `emailSteps.ts:440-466` (fuori scope di questa guida, che copre solo `BOX_CFG`) |

`PROCESSO` (enum `ProcessoInvio`, `enums.ts:63-70`): `PER_COORDINATORE`, `PER_DOCENTE`,
`PER_CDC`, `PER_ALUNNO`, `PER_GENITORI_ALUNNO`, `PER_CARENZA`.

`SUPPLENTI` (enum `GestioneSupplenti`, `enums.ts:71-75`): `SOLO_TITOLARI`, `SOLO_SUPPLENTI`,
`ENTRAMBI`.

---

## 2. `PROCESSO` → recipe CDU: il vincolo pratico più importante

Ogni `PROCESSO` viene mappato a una recipe del Context Engine da `RECIPE_PER_PROCESSO`
(`src/application/pipelines/emailSteps.ts:49-56`):

```ts
export const RECIPE_PER_PROCESSO: Record<ProcessoInvio, string> = {
  [ProcessoInvio.PER_COORDINATORE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_DOCENTE]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_CDC]: 'DOCENTE_COMPLETO',
  [ProcessoInvio.PER_ALUNNO]: 'ALUNNO_COMPLETO',
  [ProcessoInvio.PER_GENITORI_ALUNNO]: 'FAMIGLIA_COMPLETO',
  [ProcessoInvio.PER_CARENZA]: 'CARENZA_COMPLETO'
};
```

Le recipe stesse (`src/application/context-engine/Recipe.ts:100-132`):

```ts
DOCENTE_COMPLETO: ['school', 'class', 'consiglio'],
ALUNNO_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani'],
FAMIGLIA_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani', 'documenti', 'documentiStorico'],
CARENZA_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani', 'carenzaFocus']
```

**Conseguenza pratica, da tenere sempre a mente**: solo `PER_GENITORI_ALUNNO`
(→ `FAMIGLIA_COMPLETO`, che include i provider `documenti`/`documentiStorico`) popola
`focus.alunno.didattica.documenti`. `PER_COORDINATORE`, `PER_DOCENTE` e `PER_CDC`
mappano tutti su `DOCENTE_COMPLETO = ['school','class','consiglio']` — **`focus.alunno`
non esiste affatto** in quella CDU (nessun provider `student` in `DOCENTE_COMPLETO`).

Perciò un box `documenti` o `cartelle` dentro un `BOX_CFG` per `PER_COORDINATORE`,
`PER_DOCENTE` o `PER_CDC` **renderà sempre vuoto** (o mostrerà il suo `TESTO_VUOTO`, se
configurato con `MOSTRA_SE_VUOTO: true`) — non c'è nessun percorso per cui quei dati
compaiano in quei tre processi. Vedi §6 per l'unico tipo di box realmente utilizzabile lì.

Anche `PER_ALUNNO` (→ `ALUNNO_COMPLETO`) **non include `documenti`**: solo
`FAMIGLIA_COMPLETO` lo fa.

---

## 3. `TIPO_BOX` disponibili

`DEFAULT_TITLES` elenca i sei tipi registrati (`src/application/email/boxes.ts:292-299`).
Per ciascuno: percorso CDU letto, quando è non-vuoto, esempio minimo.

### `carenze`

- Legge: `focus.alunno.didattica.carenze.dettaglio` (array di `{materia, voto}`), popolato
  da `CarenzeProvider` (`src/application/context-engine/providers/CarenzeProvider.ts:20-32`)
  a partire dalle colonne-materia di `CARENZE` (es. `MATE`, `FISI` nella fixture).
- Aggregazione: `aggregaDati` lo trasforma con `mapCarenzeFormatoB` (`boxes.ts:76-92,331`),
  che arricchisce ogni riga con colore/simbolo/sintesi da `MATERIE` e imposta
  `descrizione = "Voto ${voto}"` (`boxes.ts:89`).
- Vuoto quando: `dettaglio.length === 0` (`boxes.ts:229-230`) — quindi mai nel processo
  `PER_COORDINATORE`/`PER_DOCENTE`/`PER_CDC` (niente `focus.alunno` lì).
- Richiede: `PROCESSO` la cui recipe includa `carenze` (tutte tranne `DOCENTE_COMPLETO`).

```json
{ "TIPO_BOX": "carenze", "TITOLO": "Carenze rilevate", "ORDINE": 1 }
```

### `documenti`

- Legge: `focus.alunno.didattica.documenti.items` (esclusi quelli con `tipo === 'CARTELLA'`,
  `boxes.ts:332`) + opzionalmente `focus.alunno.didattica.documenti.storico` (un `LazyRef`).
- Vuoto quando: `items.length === 0` (`boxes.ts:235`).
- Richiede: solo `FAMIGLIA_COMPLETO` (`PER_GENITORI_ALUNNO`) lo popola davvero (§2).
- Vedi §5 per le chiavi specifiche (`arricchisciConStorico`, `displayMode`).

```json
{ "TIPO_BOX": "documenti", "TITOLO": "Documenti", "displayMode": "nome+link" }
```

### `cartelle`

- Legge: **lo stesso** `focus.alunno.didattica.documenti.items`, ma filtrato a
  `tipo === 'CARTELLA'` (`boxes.ts:333`). Non è un box di cartelle Drive di classe — è un
  filtro sulla lista documenti *personale* dell'alunno. Vedi §7 per il gap reale sulle
  cartelle di classe.
- Vuoto quando: nessun item con `tipo === 'CARTELLA'` nella lista documenti dell'alunno.
- Stesse chiavi di `documenti` (condividono `renderDocumentiBox`, `boxes.ts:278-279`).

```json
{ "TIPO_BOX": "cartelle", "TITOLO": "Cartelle personali" }
```

### `note`

- Legge: `focus.carenza.note` (stringa) — popolato **solo** da `CarenzaFocusProvider`,
  attivo solo in `CARENZA_COMPLETO` (`PER_CARENZA`) (`boxes.ts:246`,
  `src/application/context-engine/providers/CarenzaFocusProvider.ts:23-31`).
- Vuoto quando: la stringa è vuota dopo `trim()` (`boxes.ts:247`) — quindi sempre vuoto
  fuori da `PER_CARENZA` (compreso `PER_GENITORI_ALUNNO`, che non ha `carenzaFocus` nella
  sua recipe `FAMIGLIA_COMPLETO`).
- Testo grezzo, escapato con `escapeHtml` (`boxes.ts:187`).

```json
{ "TIPO_BOX": "note", "ORDINE": 3, "MOSTRA_SE_VUOTO": true, "TESTO_VUOTO": "Nessuna annotazione." }
```

### `assenze`

- Legge: `focus.carenza.hasAssenze === true` (booleano; solo `CARENZA_COMPLETO`,
  `boxes.ts:252`). Il contenuto è un avviso statico fisso, non dati (`renderAssenzeBox`,
  `boxes.ts:190-195`).
- Vuoto (nascosto) quando: `hasAssenze !== true` (`boxes.ts:253`).

```json
{ "TIPO_BOX": "assenze", "ORDINE": 2 }
```

### `testo_dinamico`

- Legge: **l'intera CDU serializzata** (`ctx.getAll()`, `boxes.ts:266`), non una porzione
  filtrata. `CONTENUTO` è processato via Mustache su tutto l'oggetto CDU
  (`boxes.ts:282-283`).
- Non è mai "vuoto" per costruzione: `emptyBehavior: 'SHOW_EMPTY'`,
  `emptyChecker: () => false` (`boxes.ts:257-267`) — è quindi l'**unico** tipo di box
  realmente utilizzabile in `PER_COORDINATORE`/`PER_DOCENTE`/`PER_CDC`, perché non dipende
  da `focus.alunno`.

```json
{ "TIPO_BOX": "testo_dinamico", "CONTENUTO": "<p>Classe {{focus.classe.anagrafica.nome}}</p>" }
```

---

## 4. Chiavi universali per-box (`renderBoxes`, `boxes.ts:343-402`)

Ogni elemento dell'array `BOX_CFG` è un oggetto JSON con queste chiavi:

| Chiave | Tipo | Obbligatoria | Effetto | Riga |
|---|---|---|---|---|
| `TIPO_BOX` | string | sì | uno dei sei tipi di §3; elementi con `TIPO_BOX` sconosciuto/vuoto vengono scartati silenziosamente | `boxes.ts:351-355` |
| `TITOLO` | string | no | titolo mostrato nel contenitore standard; se assente/vuoto usa `DEFAULT_TITLES[tipo]` (per `testo_dinamico` il default è `''`, quindi niente `<h3>`, vedi `wrapBox`) | `boxes.ts:395,397` |
| `ORDINE` | number | no | ordine di rendering; senza `ORDINE` si usa l'indice nell'array `BOX_CFG` | `boxes.ts:368,380-384` |
| `PREREQUISITI` | string | no | condizione di visibilità passata al `VisibilityEvaluator` di `ComposableContentLib`; stringa vuota ⇒ `'always'` (sempre visibile) | `boxes.ts:363,367` — **la sintassi concreta dell'espressione è definita dalla libreria e non è documentata con un esempio in `GasLibraryFactory/DOCS_LIBS/ComposableContentLib_docs.md` (solo descritta a parole: "regole di visibilità basate su espressioni")**. Non inventare qui una sintassi: se serve `PREREQUISITI`, verificarla contro il codice sorgente di `ComposableContentLib` (L4) prima di scriverla in produzione. |
| `MOSTRA_SE_VUOTO` | boolean | no | quando il box non produce contenuto, mostra `TESTO_VUOTO` invece di nasconderlo | `boxes.ts:392-394` |
| `TESTO_VUOTO` | string (Mustache) | no | testo di fallback, processato sull'**intera CDU** (non sui dati del box) | `boxes.ts:393` |
| `COLORE` | string hex | no | colore del bordo sinistro del contenitore (`wrapBox`); default `#ddd` | `boxes.ts:46,69,396` |

Nota su `testo_dinamico`: essendo `emptyBehavior: 'SHOW_EMPTY'`, `MOSTRA_SE_VUOTO`/
`TESTO_VUOTO` non hanno mai occasione di scattare per questo tipo (il box non è mai vuoto).

---

## 5. Chiavi specifiche di `documenti`/`cartelle`

Lette in `renderDocumentiBox` (`boxes.ts:149-183`), condivisa dai due tipi.

- **`arricchisciConStorico`** (boolean): abilita il rendering "arricchito" per riga invece
  della lista semplice (`boxes.ts:158`).
- **`configArricchimento.templateRiga`** (string, Mustache): template renderizzato **una
  volta per ogni documento corrente**, con contesto `{ corrente, storico }`
  (`boxes.ts:170-181`):
  - `corrente`: l'item corrente (`nome`, `link` escapati; `tipo`, `stato`, `dataCreazione`,
    `idGen` non escapati perché codici/date generati dal sistema, non testo libero —
    vedi il commento a `boxes.ts:133-147`).
  - `storico`: array di `DocumentoStoricoConTipo` filtrati per `s.tipo === corrente.idGen`
    (match per ID_GEN, non per TIPO visualizzato — `boxes.ts:169,173-175`), ciascuno con
    `nome`/`link` escapati.
- **`displayMode`**: `'nome' | 'link' | 'nome+link' | 'sololink'` — si applica **solo** al
  fallback a lista semplice (`renderRigaStandard`, `boxes.ts:114-131`), cioè quando
  `arricchisciConStorico` è spento o mal configurato.

**Regola esatta del fallback** (`boxes.ts:164-165`): si usa `renderRigaStandard` (lista
semplice, rispettando `displayMode`) quando **almeno una** di queste è vera:
- `templateRiga` è vuoto/assente (o `arricchisciConStorico !== true`, nel qual caso
  `templateRiga` è forzato a `''` da `boxes.ts:162`);
- `storicoRef` è `undefined` — cioè non è stato allegato nessun `LazyRef` di storico, il
  che accade quando la recipe è stata costruita con `options.includiStorico: false`
  (default: `DEFAULT_OPTIONS.includiStorico = false`, `Recipe.ts:42`) — in quel caso
  `DocumentiStoricoProvider` esce subito senza scrivere nulla
  (`src/application/context-engine/providers/DocumentiStoricoProvider.ts:20`).

```json
{
  "TIPO_BOX": "documenti",
  "TITOLO": "Documenti",
  "arricchisciConStorico": true,
  "configArricchimento": {
    "templateRiga": "<li>{{corrente.nome}}{{#storico}} (già inviato l'anno scorso: {{nome}}, {{anno}}){{/storico}}</li>"
  }
}
```

`cartelle` è **solo** un filtro `tipo === 'CARTELLA'` sugli item di `documenti`
(`aggregaDati`, `boxes.ts:333`) — non un box di link a cartelle Drive di classe. Non
esiste, allo stato attuale, un provider CDU che aggreghi cartelle a livello di classe
(vedi §7).

---

## 6. `testo_dinamico` — l'unico box "cross-processo"

`CONTENUTO` è processato via Mustache sull'intera CDU serializzata (`boxes.ts:282-283`),
non su un sottoinsieme filtrato. Per questo è l'unico `TIPO_BOX` utilizzabile in pattern
`PER_COORDINATORE`/`PER_DOCENTE`/`PER_CDC` (§2): non dipende da `focus.alunno`, che in
quei processi non esiste. Esempio già mostrato in §3.

---

## 7. Gap documentato: nessun provider CDU per le cartelle di classe

`src/domain/repositories/ILogCartellaRepository.ts:4-8` espone un metodo reale e
funzionante, `findByClasse(classe: Classe): LogCartella[]`, implementato da
`LogCartellaRepository.findByClasse` (`src/infrastructure/repositories/LogCartellaRepository.ts:30-32`,
query `CONTAINS` su `LOG_FOLD.CLASSI`). Esiste anche `AggregatoreDati.getCartellePerClasse`/
`perMetodo('cartellePerClasse', …)` a livello di service
(`src/application/services/AggregatoreDati.ts:69-71,105-106`), registrato nel container
(`src/config/Bootstrap.ts:197`).

Nessuno dei due, però, è collegato al sistema CDU/box delle email:

- `ls src/application/context-engine/providers/` non contiene nessun provider con nome
  `Cartelle`/`Folder`; nessuna recipe scrive un percorso CDU tipo
  `focus.classe.cartelle`.
- `boxes.ts`'s `aggregaDati` (§3) non chiama né `LogCartellaRepository` né
  `AggregatoreDati`.
- `AggregatoreDati` stesso non ha alcun consumer in `src/` al di fuori della propria
  registrazione in `Bootstrap.ts` (verificato via ricerca testuale nel repository).

Quindi "mandare a un docente/coordinatore i link alle cartelle Drive delle proprie classi"
è una capacità reale e interrogabile a livello di repository/service, ma **non ha oggi
un percorso wired fino alla CDU/box delle email**. Questo è un gap reale per un task
futuro (non affrontato qui — questa guida è solo documentazione). Gli esempi
`HTML_EXAMPLE/03-*` e `HTML_EXAMPLE/04-*` mostrano come un chiamante potrebbe aggirare
il gap chiamando `LogCartellaRepository` direttamente fuori dalla CDU standard, con
un campo demo esplicitamente etichettato come non-di-produzione.

---

## 8. Esempi end-to-end di `BOX_CFG`

### `PER_GENITORI_ALUNNO` — avviso carenze alla famiglia

```json
[
  { "TIPO_BOX": "carenze", "TITOLO": "Carenze rilevate", "ORDINE": 1 },
  { "TIPO_BOX": "assenze", "ORDINE": 2 },
  {
    "TIPO_BOX": "note",
    "TITOLO": "Osservazioni del Consiglio di Classe",
    "ORDINE": 3,
    "MOSTRA_SE_VUOTO": true,
    "TESTO_VUOTO": "Nessuna annotazione particolare per questo periodo."
  }
]
```

### `PER_CDC` — convocazione consiglio di classe

```json
[
  {
    "TIPO_BOX": "testo_dinamico",
    "ORDINE": 1,
    "CONTENUTO": "<p><strong>Ordine del giorno</strong></p><ol><li>Andamento didattico-disciplinare della classe {{focus.classe.anagrafica.nome}}</li><li>Esame situazioni di carenza formativa</li><li>Varie ed eventuali</li></ol>"
  }
]
```

---

## Perché non `DATI_SORGENTE`

`AGGIORNAMENTI_DA_FARE.md` e `FAKEDB/CONF_MAIL.csv` descrivono un `BOX_CFG` con una
chiave `DATI_SORGENTE: { metodo, filtri }` per box generico, instradato tramite
`AggregatoreDati.perMetodo` (§7). Verificato contro il codice: `boxes.ts`'s `aggregaDati`
(la funzione che effettivamente alimenta i box, `boxes.ts:310-335`) **non legge mai**
`DATI_SORGENTE` — pesca sempre da percorsi CDU fissi (`focus.alunno.didattica.*`,
`focus.carenza.*`). L'unico punto del codice che legge davvero `DATI_SORGENTE` oggi è
`ComposeEmailStep.resolveAllegati` (`emailSteps.ts:241-263`), e **solo** per filtrare gli
allegati fisici della mail (via `DATI_SORGENTE.metodo === 'documentiPerClasse'`), non per
generare il contenuto di un box. Quindi `DATI_SORGENTE` è un campo reale e funzionante,
ma con un unico scopo — filtro allegati — completamente separato dal rendering dei box
descritto in questa guida (§3-§6).
