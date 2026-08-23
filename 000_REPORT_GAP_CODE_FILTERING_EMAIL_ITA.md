# Report GAP — Filtraggio del Motore Email per la Distribuzione di LOG_DOCS / LOG_FOLD

---

## 1. Scopo e Comportamento Atteso (target)

La segreteria deve poter comporre **un unico pattern email** (record `CONF_MAIL`) contenente
**più box dinamici contemporaneamente**, dove **più box possono essere dello stesso tipo**
(più box `documenti`, più box `cartelle`) e **ciascuna istanza di box seleziona il proprio
sottoinsieme indipendente di elementi Drive** filtrando sulle tabelle di audit:

| Tabella | Campi di filtro richiesti |
| --- | --- |
| `LOG_DOCS` | `ID_GEN` (config che l'ha generato), `TIPO`, `SOTTOTIPO`, `STATO`, più campi di scope `CLASSI` / `UTENTI` / `MATERIE` |
| `LOG_FOLD` | `TIPO` (famiglia cartella, cf. §5-DP5), più campi di scope `CLASSI` / `UTENTI` / `MATERIE`; (`LOG_FOLD` **non ha** colonne `SOTTOTIPO`/`STATO`/`ID_GEN`) |

Esempio concreto (oggi impossibile): `INVIO_DOCS_FINE_ANNO` dichiara quattro box —
"Cartelle programmi svolti", "Cartelle relazioni finali", "Griglie condotta", "Griglie competenze".
Ciascuno deve mostrare un sottoinsieme *diverso*:

* box 1 → `LOG_FOLD` con `TIPO='PROGRAMMI_SVOLTI'`;
* box 2 → `LOG_FOLD` con `TIPO='RELAZIONI_FINALI'`;
* box 3 → `LOG_DOCS` con `TIPO='CONDOTTA'`;
* box 4 → `LOG_DOCS` con `TIPO='COMPETENZE'`.

Inoltre ogni box deve poter autorizzare l'invio Gmail in allegato dei documenti che mostra
(`ALLEGA=true`), con le stesse semantiche di filtro per box; i box cartelle contribuiscono solo
link.

Semantiche attese dei filtri all'interno di un box: **AND** delle chiavi specificate; chiave
assente = nessun vincolo su quel campo. I box sono mutuamente indipendenti: un filtro dichiarato
su un box non deve mai influenzare gli altri.

---

## 2. Architettura Attuale (quadro fattuale)

Pipeline di rendering per destinatario:

```
RenderBoxesStep (emailSteps.ts:400)
  └─ renderBoxes()                       boxes.ts:560
       ├─ cfgs = confMail.getBoxes()     (array JSON da CONF_MAIL.BOX_CFG)
       ├─ known = cfgs con TIPO_BOX valido          boxes.ts:575-579
       ├─ documentiFiltro = FILTRO_TIPO/FILTRO_STATo dal PRIMO box 'documenti'   boxes.ts:581-586
       ├─ realCartelle (solo se un box 'cartelle' ha DATI_SORGENTE.metodo='cartellePerClasse')  boxes.ts:588-607
       ├─ context.boxdata = aggregaDati(cdu, materie, documentiFiltro, realCartelle)  boxes.ts:434-552
       ├─ blocchi costruiti per config, ordinati per ORDINE                        boxes.ts:612-689
       └─ ritorna { html ordinati, mappa boxes, documentIds, folderIds }
ComposeEmailStep (emailSteps.ts:470)
  ├─ assemblaggio corpo (saluto + TESTO_START + box + TESTO_END + footer)
  └─ resolveAllegati()                  emailSteps.ts:488-536
       ├─ allegati statici CONF_MAIL.ALLEGATI (sempre)
       └─ + documenti di classe SOLO SE un box ha ALLEGA=true E DATI_SORGENTE.metodo='documentiPerClasse'
          (filtri: solo {tipo, stato})
Lato CDU: DocumentiClasseProvider riempie focus.classe.didattica.documenti
          = TUTTI i LOG_DOCS delle classi di competenza, senza filtri    DocumentiClasseProvider.ts:23-45
```

`TIPO_BOX` supportati (10): `carenze, documenti, documenti_dipartimento, cartelle, note, assenze,
cattedre, testo_dinamico, piani_pers_da_inviare, piani_pers_inviati`
(`createBoxComposer`, boxes.ts:301-410; titoli default a boxes.ts:436-447).

---

## 3. Catalogo dei Gap del Motore

### GAP-01 — CRITICO: i box `documenti` non possono avere filtri per singolo box
**Dove:** `src/application/email/boxes.ts:581-586` e `:509-519`.
`FILTRO_TIPO` / `FILTRO_STATO` vengono letti **solo dal primo box `documenti` trovato** e applicati
**globalmente** alla singola proiezione condivisa `boxdata.documenti`. Conseguenze:

* due box `documenti` nello stesso pattern mostrano necessariamente lo **stesso elenco**;
* un filtro su un box modifica silenziosamente tutti gli altri box `documenti`;
* il target della §1 ("Griglie condotta" accanto a "Griglie competenze") è irraggiungibile.

### GAP-02 — CRITICO: i box `cartelle` non hanno alcun meccanismo di filtro
**Dove:** `src/application/email/boxes.ts:588-607` (solo toggle di sorgente), `:527-540` (proiezione).
Nessuna chiave BOX_CFG per le cartelle viene letta da nessuna parte. Tutti i box `cartelle`
mostrano sempre l'intero set di cartelle delle classi di competenza. "Cartelle Verbali CdC" vs
"Cartelle 15 Maggio" vs "programmi svolti" vs "relazioni finali": quattro box dal contenuto identico.

### GAP-03 — ALTO: `LOG_FOLD.TIPO` viene scartato durante la proiezione
**Dove:** `src/application/email/boxes.ts:530-537`.
Quando le cartelle reali vengono caricate, ogni `LogCartella` è proiettata hard-codando
`{tipo:'CARTELLA', idGen:'', stato:'', dataCreazione:''}` — il valore reale di `LogCartella.tipo`
(`LOG_FOLD.TIPO`; il campo esiste sull'entità: `src/domain/entities/LogCartella.ts:22`) viene
buttato via *prima* che qualunque renderer possa vederlo. Anche risolvendo GAP-02 domani, i dati
serventi al filtro mancherebbero comunque a questo livello.

### GAP-04 — ALTO: `FILTRO_SOTTOTIPO` non supportato nel percorso di rendering
**Dove:** `AggregatoreDati.matchesDoc` supporta `{tipo, stato, sottotipo}`
(`src/application/services/AggregatoreDati.ts:119-125`) ma `renderBoxes`/`aggregaDati` non leggono
mai una chiave `FILTRO_SOTTOTIPO`. La selezione per sottotipo (es. piani `PDP_BES` vs `PEI`) è
impossibile in BOX_CFG oggi. Necessario per `LOG_DOCS.SOTTOTIPO`.

### GAP-05 — ALTO: nessun filtro su `ID_GEN` da nessuna parte
**Dove:** intera codebase. `DocumentoItem.idGen` è presente negli item del CDU
(zona boxes.ts:493 / DocumentiClasseProvider.ts:35) ma né il rendering né gli allegati espongono
un filtro su di esso. `ID_GEN` è il selettore più preciso disponibile ("i documenti prodotti da
QUESTA config di generazione"): es. le cinque config distinte `VERBALE_CDC_OTTOBRE..MAGGIO`
condividono lo stesso `TIPO='VERBALE_CDC'` e si distinguono solo tramite `ID_GEN`.

### GAP-06 — MEDIO: ramo di fallback morto per i box `cartelle`
**Dove:** `src/application/email/boxes.ts:538`.
Senza `DATI_SORGENTE.metodo='cartellePerClasse'`, il fallback filtra gli item `LOG_DOCS` per
`tipo === 'CARTELLA'`. Nel DB reale nessuna riga porta mai quel valore (13 valori distinti di
`LOG_DOCS.TIPO`, nessuno è `CARTELLA`): questo ramo produce sempre un box vuoto sui dati reali.

### GAP-07 — MEDIO: il provider CDU carica un superset non filtrato
**Dove:** `src/application/context-engine/providers/DocumentiClasseProvider.ts:27-39`.
Tutte le righe di `LOG_DOCS.findByClasse()` entrano nel CDU a prescindere dalle esigenze del
pattern; il filtraggio avviene a valle e solo parzialmente (vedi GAP-01/04/05). Oltre
all'efficienza, questo lega la forma del CDU alle scelte dei provider, rendendo implicito e
fragile lo scoping per pattern.

### GAP-08 — MEDIO: il contratto filtri degli allegati è divergente e più debole
**Dove:** `src/application/pipelines/emailSteps.ts:488-536`.
`resolveAllegati` re-implementa una selezione propria: cerca un singolo box con
`ALLEGA===true && DATI_SORGENTE.metodo==='documentiPerClasse'` e onora solo
`DATI_SORGENTE.filtri.{tipo,stato}`. Divergenze rispetto al percorso di rendering:

* nomi/forma chiave diversi per lo stesso concetto (`FILTRO_TIPO` vs `DATI_SORGENTE.filtri.tipo`);
* niente `sottotipo`, niente `ID_GEN`;
* un solo box può attivare l'opt-in per pattern;
* i box cartelle non possono attivarlo affatto (solo link — accettabile, ma non documentato);
* il commento in boxes.ts:512-513 stabilisce che lo scoping visivo resta indipendente dalla
  risoluzione degli allegati; tuttavia entrambe le metà avranno bisogno degli *stessi* filtri
  per box quando lo scoping per-box sarà implementato.

### GAP-09 — MEDIO: fallimenti silenziosi di configurazione
**Dove:** `src/application/email/boxes.ts:575-579` (`TIPO_BOX` sconoscioto/vuoto scartato senza
avviso), `:581-586` (chiavi filtro con typo semplicemente ignorate), `AggregatoreDati.perMetodo`
emette warn ma i chiamanti possono saltare in silenzio. Un BOX_CFG malformato produce email vuote
o troppo ampie senza alcun WARN nei log dei job — esattamente come i difetti di AS 2526 sono
passati inosservati. Serve validazione/diagnostica al parse (entità di dominio
`ConfigurazioneEmail.getBoxes`) o al rendering.

### GAP-10 — MEDIO: interazione della send-gate con i box vuoti
**Dove:** `src/application/pipelines/emailSteps.ts:440-445`.
`shouldSend` richiede almeno un box renderizzato **oppure** un allegato statico. Un pattern i cui
box sono legittimamente vuoti per un dato target (es. `RIEPILOGO_PCTO_ALUNNO` con `BOX_CFG=[]` e
`ALLEGATI='[]'`) viene saltato completamente e in silenzio. Con l'arrivo dei filtri per box,
"tutti i box filtrati a vuoto" diventa uno stato normale che richiede una policy esplicita
(inviare con note TESTO_VUOTO? saltare con log?). Oggi la policy è implicita.

### GAP-11 — MEDIO: deriva della specifica per BOX_CFG
**Dove:** `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:567-589` documenta `BoxConfig` senza le chiavi
effettivamente implementate (`FILTRO_TIPO`, `FILTRO_STATO`, toggle `DATI_SORGENTE.metodo`,
`ALLEGA`), mentre lo schema legacy ricco `DATI_SORGENTE` sopravvive in `FAKEDB/CONF_MAIL.csv` /
`AGGIORNAMENTI_DA_FARE.md` (discrepanza riconosciuta a 03:586-589). Qualunque lavoro sui filtri
per box deve prima fissare UN contratto BOX_CFG autorevole nella specifica, altrimenti
implementazione e documentazione divergeranno ulteriormente. Si noti anche che
`01_SCHEMA_DATABASE.md:374-394` descrive `BOX_CFG` in modo generico.

### GAP-12 — BASSO: gestione ambigua di `ORDINE`
**Dove:** `src/application/email/boxes.ts:623,669-673`. Valori `ORDINE` duplicati cadono
implicitamente sul tie-break per indice d'array (sort stabile). Con molti box dello stesso tipo
per pattern (il target della §1) l'ordinamento diventa visibile all'utente: va imposta l'unicità
oppure documentato il tie-break.

---

## 4. Mappa delle Componenti Coinvolte (per il futuro intervento)

| # | Componente | File | Tipo di cambiamento |
| --- | --- | --- | --- |
| 1 | Estrazione filtri per-config | `src/application/email/boxes.ts` (`renderBoxes`) | riscrivere blocco GAP-01: leggere i filtri per ogni config box |
| 2 | Proiezione dati per-istanza | `src/application/email/boxes.ts` (`aggregaDati`) | produrre viste filtrate per istanza box (o passare il filtro al block) |
| 3 | Supporto filtri cartelle + preservazione metadata | `src/application/email/boxes.ts` (ramo realCartelle di `aggregaDati`) | GAP-02/03: proiettare il vero `tipo` (ed eventualmente chiave tipo-`idGen` da `LOG_FOLD.TIPO`) |
| 4 | Nuove chiavi di filtro | contratto BOX_CFG + `ConfigurazioneEmail.getBoxes` | `FILTRO_SOTTOTIPO`, `FILTRO_ID_GEN`, `FILTRO_TIPO` per cartelle; validazione (GAP-09) |
| 5 | Firme repository/aggregatore | `src/application/services/AggregatoreDati.ts` | parametro filtri opzionale per `getCartellePerClasse` |
| 6 | Provider CDU | `src/application/context-engine/providers/DocumentiClasseProvider.ts` | push-down opzionale dei filtri (GAP-07) |
| 7 | Risoluzione allegati | `src/application/pipelines/emailSteps.ts` (`resolveAllegati`) | allineare al contratto per-box, estendere le chiavi (GAP-08) |
| 8 | Policy send-gate | `src/application/pipelines/emailSteps.ts` (`RenderBoxesStep`) | stato-vuoto esplicito e loggato (GAP-10) |
| 9 | Specifica | `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`, `01_SCHEMA_DATABASE.md` | schema BOX_CFG autorevole (GAP-11) |

Nota di layering: tutto quanto sopra è logica di dominio SGSA (interpretazione di
`BOX_CFG`/`CONF_MAIL`), quindi secondo le regole del workspace appartiene a
`src/application/email` — nessuna estensione di `GasLibraryFactory` richiesta.

---

## 5. Precondizioni sui Dati (evidenze da `AS 2526 per ALDO.xlsx`)

Anche un motore corretto funzionerebbe male finché i dati convertiti non soddisfano questi punti.

* **DP-01 — Vocabolario diviso tra le due tabelle (ALTO).**
  Stessa famiglia reale, token diversi:
  `DOC_15_MAGGIO` (docs) ↔ `DOCUMENTO_15_MAGGIO` (folds); `PROGRAMMA_SVOLTO` ↔
  `PROGRAMMI_SVOLTI`; `RELAZIONE_FINALE` ↔ `RELAZIONI_FINALI`; `VERBALE_ASSEMBLEA_CLASSE` esiste
  solo nei folds. Un singolo valore `FILTRO_TIPO` non può indirizzare entrambe le tabelle senza
  normalizzazione o mapping esplicito.

* **DP-02 — Piani registrati con `TIPO` errato (ALTO).**
  In `LOG_DOCS` i piani personalizzati sono registrati come `TIPO='DOCUMENTO_PERSONALIZZATO'`
  (130 righe), mentre la regola di schema "TIPO deriva da CONF_DOC.TIPO"
  (`SPECS_ALDO/01_SCHEMA_DATABASE.md:433`) richiede `PIANO_PERS` (il record `CONF_DOC`
  `PIANI_PERSONALIZZATI` ha `TIPO=PIANO_PERS`). Qualunque `FILTRO_TIPO='PIANO_PERS'` oggi trova
  zero righe. I tipi dedicati `piani_pers_*` aggirano il problema perché leggono
  `focus.*.didattica.pianiPersonalizzati` (provider separato) — i box documenti generici no.

* **DP-03 — `SOTTOTIPO` con etichette legacy (ALTO).**
  Valori presenti: `PDP BES`, `PDP DSA`, `PDP STRANIERI`, `PFP` (**con spazi**) su 130 righe;
  tutto il resto NULL. L'enum atteso dallo schema è `PDP_BES`, `PEI`, … (01:434). Filtrare per
  sottotipo richiede pulizia dei dati o matching consapevole degli alias.

* **DP-04 — `STATO` sparso / buchi in `ID_GEN` (MEDIO).**
  `STATO`: solo `VERBALIZZATO` ×130, resto NULL → `FILTRO_STATO` quasi inutile finché gli stati
  non vengono retrocompilati. `ID_GEN`: vuoto su 144/1952 righe → `FILTRO_ID_GEN` perde quelle righe.

* **DP-05 — convenzione `LOG_FOLD.TIPO` non onorata (MEDIO).**
  La specifica (`01_SCHEMA_DATABASE.md:457`) dice che `LOG_FOLD.TIPO` referenzia `CONF_DOC.ID`
  (es. `VERBALE_CDC_OTTOBRE`). I dati usano token di famiglia (`VERBALE_CDC`, `PCTO`,
  `PROGRAMMI_SVOLTI`, …). Il livello famiglia è forse *migliore* per il filtraggio (un valore per
  box), ma specifica e dati devono concordare la convenzione canonica.

* **DP-06 — righe rumorose (BASSO).**
  `CONF_DOC` contiene record di test `TEST_DOC_TABELLE_*` con `TIPO=NULL`; i loro output finiscono
  in `LOG_DOCS` e inquinerebbero i box non filtrati. Inoltre `LOG_FOLD.UTENTI`/`MATERIE` sono
  vuoti su tutte le 257 righe (filtri di scope su quelle colonne oggi irrilevanti per le cartelle).

---

## 6. Snapshot delle Evidenze (AS 2526)

* `CONF_MAIL`: 14 pattern; `BOX_CFG` JSON sintatticamente valido ovunque, ma **zero** occorrenze
  di `FILTRO_TIPO`, `FILTRO_STATO`, `DATI_SORGENTE`, `ALLEGA`; `ALLEGATI='[]'` su tutte le righe;
  `ORDINE=20` duplicato in tre pattern coordinatori; `RIEPILOGO_PCTO_ALUNNO` ha `BOX_CFG='[]'`
  → mail mai inviata (GAP-10).
* `DOC_PERSONALIZZATI_COORDINATORI` usa due box `documenti` generici per ciò che semanticamente
  sono i tipi dedicati `piani_pers_da_inviare` / `piani_pers_inviati` — per GAP-01 entrambi i box
  mostrerebbero contenuto identico anche corretta la scelta del tipo, senza scoping per box.
* Il DB dell'anno precedente (`AS 24 25 per ALDO.xlsx`) ha il foglio `CONF_MAIL` vuoto → non
  esiste riferimento storico.

---

## 7. Direzione Consigliata (non normativa)

1. **Prima fissare il contratto** (GAP-11): estendere `BoxConfig` nella specifica con filtri
   per box `FILTRO_TIPO` / `FILTRO_STATO` / `FILTRO_SOTTOTIPO` / `FILTRO_ID_GEN` (semantica AND,
   eventuale multi-valore CSV), stesso set di chiavi per box `documenti` e `cartelle`
   (le cartelle onorano solo `TIPO`/scope, per la tabella della §1).
2. **Rendere il rendering per-istanza**: estrarre i filtri da ogni config box; proiettare una
   vista filtrata per istanza invece di mutare i `boxdata.*` condivisi.
3. **Preservare i metadata delle cartelle**: smettere di hard-codare `tipo:'CARTELLA'`; far
   arrivare il vero `LOG_FOLD.TIPO` (ed eventualmente `nome/path`) attraverso la proiezione.
4. **Unificare gli allegati**: far consumare a `resolveAllegati` gli stessi filtri per box del/dei
   box con `ALLEGA=true`, invece del dialetto parallelo `DATI_SORGENTE.filtri`.
5. **Fallire ad alta voce**: validare BOX_CFG al caricamento dell'entità; WARN+skip su tipi/chiavi
   sconosciute; rendere esplicita e loggata la decisione sullo stato "tutti i box vuoti" (GAP-10).
6. **Pulire i dati** (DP-01…06) o introdurre un livello esplicito di normalizzazione/mapping nei
   metadata derivati da `CONF_DOC`, prima di consegnare i filtri agli utenti finali.
