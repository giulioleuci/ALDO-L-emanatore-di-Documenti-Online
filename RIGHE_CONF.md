# RIGHE_CONF — segnalatori carenze CdC: novembre, febbraio, marzo

Flusso: `CONF_DOC` genera un foglio per classe in una cartella della serie → `CONF_IMP` legge tutti i fogli di quella serie (`LOG_DOCS.ID_GEN`) e scrive `CARENZE` → `CONF_MAIL` invia ai genitori le righe con `NOTIFICATO` vuoto della serie e le timbra.

Il legame con la serie è per convenzione, in tre punti: `ID_RILEVAZIONE` nel template, `CONF_DOC.ID` = `CONF_IMP.CONFIG.idGen`, `CONDIZIONE` del `CONF_MAIL`. Tutti e tre devono dire la stessa cosa.

| Serie    | ID_RILEVAZIONE     | CONF_DOC                       | CONF_IMP                  | CONF_MAIL               | Data CdC (DATA)          |
| -------- | ------------------ | ------------------------------ | ------------------------- | ----------------------- | ------------------------ |
| Novembre | `2026_27_NOVEMBRE` | `CARENZE_SEGNALATORE_NOVEMBRE` | `IMPORT_CARENZE_NOVEMBRE` | `INVIO_CARENZE_NOVEMBRE` | `2026-11-16` (e `-19`)   |
| Febbraio | `2026_27_FEBBRAIO` | `CARENZE_SEGNALATORE_FEBBRAIO` | `IMPORT_CARENZE_FEBBRAIO` | `INVIO_CARENZE_FEBBRAIO` | `AAAA-MM-GG` da fissare  |
| Marzo    | `2026_27_MARZO`    | `CARENZE_SEGNALATORE_MARZO`    | `IMPORT_CARENZE_MARZO`    | `INVIO_CARENZE_MARZO`    | `AAAA-MM-GG` da fissare  |

Placeholder da sostituire: `<TEMPLATE_ID_NOVEMBRE|FEBBRAIO|MARZO>` = ID Drive del template della serie.

---

## 0. Template Google Sheet (uno per serie)

Riga 1 = intestazioni, riga 2 = placeholder/formule. Le colonne `_…` sono riservate all'utente: ALDO non le interpreta.

| Col   | Intestazione (riga 1) | Cella riga 2                                                                                                                                                       |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A     | `STUDENTE`            | `{{dynamic_rows[source=focus.classe.studenti.elenco,value=email]}}`                                                                                                |
| B     | `_ALUNNO`             | `{{dynamic_rows[source=focus.classe.studenti.elenco,value=nomeCompleto]}}`                                                                                         |
| C     | `_N`                  | `{{dynamic_rows[source=focus.classe.studenti.elenco,value=carenze.numero]}}`                                                                                       |
| D     | `ID_RILEVAZIONE`      | `=ARRAYFORMULA(IF(A2:A="";"";"2026_27_NOVEMBRE"))` (cambiare per serie)                                                                                           |
| E     | `PROGRESSIVO`         | `=ARRAYFORMULA(IF(A2:A="";"";C2:C+1))`                                                                                                                             |
| F     | `CLASSE`              | `{{dynamic_rows[source=focus.classe.studenti.elenco,value=classe.nome]}}` (classe partner per le articolate)                                                       |
| G     | `DATA`                | `=ARRAYFORMULA(IF(A2:A="";"";"2026-11-16"))` (data CdC della serie; testo ISO)                                                                                    |
| H     | `ASSENZE`             | checkbox ammessa: `FALSE` conta come "nessuna assenza"                                                                                                             |
| I     | `NOTE`                | vuota                                                                                                                                                              |
| J →   | materie               | `{{dynamic_columns[source=focus.classe.sheet.materieColonne.gruppi.0.colonne,value=sigla,source2=focus.classe.sheet.materieColonne.gruppi.1.colonne,value2=sigla]}}` — voto numerico o nota |

Righe fantasma (regola ALDO per i soli import verso `CARENZE`, `isGhostCarenza`): una riga è importata solo se almeno una colonna materia è valorizzata oppure `ASSENZE=TRUE`. Con nessuna materia e `ASSENZE` falso/vuoto è scartata, anche con `CLASSE`, `DATA`, `PROGRESSIVO` e `NOTE` compilati. Per questo `PROGRESSIVO`, `CLASSE` e `DATA` possono essere sempre compilati e `ASSENZE` può essere una checkbox.

Se il Foglio è in locale italiano usare `;` come separatore (come sopra); in en-US usare `,`.

Nota articolate: con `GESTIONE_ARTICOLAZIONE=COMPLETA` il foglio è della classe parent ma ogni riga porta la classe partner effettiva dello studente (`CARENZE.CLASSE` deve essere la partner, 01 §ALUNNI).

---

## 1. CONF_DOC

Colonne: `ID | TIPO | GENERATORE | CONDIZIONE | MODELLI | FILE_NAME | PATH_OUT | DUPLICAZIONE | PERMESSI | POST_PROCESSO | PARAMETRI | GESTIONE_ARTICOLAZIONE | FORMATO | REGISTRA_DOC | REGISTRA_FOLD`

### CARENZE_SEGNALATORE_NOVEMBRE

```
ID:                     CARENZE_SEGNALATORE_NOVEMBRE
TIPO:                   CARENZE_SEGNALATORE
GENERATORE:             CLASSE
CONDIZIONE:             (vuoto)
MODELLI:                {"templateId":"<TEMPLATE_ID_NOVEMBRE>"}
FILE_NAME:              Segnalatore carenze {{focus.classe.nome}} - NOVEMBRE 2026_27
PATH_OUT:               Segnalatori carenze/2026_27_NOVEMBRE
DUPLICAZIONE:           NEGATA
PERMESSI:               {"file":[{"ruolo":"CDC","permesso":"SCRITTURA"}],"folder":[{"ruolo":"CDC","permesso":"LETTURA"}],"regolaSupplente":{"file":"ENTRAMBI","folder":"ENTRAMBI"}}
POST_PROCESSO:          (vuoto)
PARAMETRI:              {"aggiungiMaterie":true}
GESTIONE_ARTICOLAZIONE: COMPLETA
FORMATO:                GSHEET
REGISTRA_DOC:           {"classi":"{{focus.classe.nome}}"}
REGISTRA_FOLD:          {"classi":"{{focus.classe.nome}}"}
```

### CARENZE_SEGNALATORE_FEBBRAIO

```
ID:                     CARENZE_SEGNALATORE_FEBBRAIO
TIPO:                   CARENZE_SEGNALATORE
GENERATORE:             CLASSE
CONDIZIONE:             (vuoto)
MODELLI:                {"templateId":"<TEMPLATE_ID_FEBBRAIO>"}
FILE_NAME:              Segnalatore carenze {{focus.classe.nome}} - FEBBRAIO 2026_27
PATH_OUT:               Segnalatori carenze/2026_27_FEBBRAIO
DUPLICAZIONE:           NEGATA
PERMESSI:               {"file":[{"ruolo":"CDC","permesso":"SCRITTURA"}],"folder":[{"ruolo":"CDC","permesso":"LETTURA"}],"regolaSupplente":{"file":"ENTRAMBI","folder":"ENTRAMBI"}}
POST_PROCESSO:          (vuoto)
PARAMETRI:              {"aggiungiMaterie":true}
GESTIONE_ARTICOLAZIONE: COMPLETA
FORMATO:                GSHEET
REGISTRA_DOC:           {"classi":"{{focus.classe.nome}}"}
REGISTRA_FOLD:          {"classi":"{{focus.classe.nome}}"}
```

### CARENZE_SEGNALATORE_MARZO

```
ID:                     CARENZE_SEGNALATORE_MARZO
TIPO:                   CARENZE_SEGNALATORE
GENERATORE:             CLASSE
CONDIZIONE:             (vuoto)
MODELLI:                {"templateId":"<TEMPLATE_ID_MARZO>"}
FILE_NAME:              Segnalatore carenze {{focus.classe.nome}} - MARZO 2026_27
PATH_OUT:               Segnalatori carenze/2026_27_MARZO
DUPLICAZIONE:           NEGATA
PERMESSI:               {"file":[{"ruolo":"CDC","permesso":"SCRITTURA"}],"folder":[{"ruolo":"CDC","permesso":"LETTURA"}],"regolaSupplente":{"file":"ENTRAMBI","folder":"ENTRAMBI"}}
POST_PROCESSO:          (vuoto)
PARAMETRI:              {"aggiungiMaterie":true}
GESTIONE_ARTICOLAZIONE: COMPLETA
FORMATO:                GSHEET
REGISTRA_DOC:           {"classi":"{{focus.classe.nome}}"}
REGISTRA_FOLD:          {"classi":"{{focus.classe.nome}}"}
```

---

## 2. CONF_IMP

Colonne: `ID | TARGET | CONFIG | ATTIVO`

`CERCA_DOCUMENTI` legge tutti i fogli registrati in `LOG_DOCS` con `ID_GEN` = `idGen` (cioè tutti i segnalatori della serie, uno per classe). Con `ID_RILEVAZIONE` in `map`, ALDO richiede esattamente `key=[STUDENTE, ID_RILEVAZIONE]` e `IGNORE`, altrimenti `ConfigurationError`.

```
ID:      IMPORT_CARENZE_NOVEMBRE
TARGET:  CARENZE
ATTIVO:  TRUE
CONFIG:  {"searchStrategy":"CERCA_DOCUMENTI","idGen":"CARENZE_SEGNALATORE_NOVEMBRE","map":{"STUDENTE":"STUDENTE","ID_RILEVAZIONE":"ID_RILEVAZIONE","PROGRESSIVO":"PROGRESSIVO","CLASSE":"CLASSE","DATA":"DATA","ASSENZE":"ASSENZE","NOTE":"NOTE"},"key":["STUDENTE","ID_RILEVAZIONE"],"conflictResolution":"IGNORE"}
```

```
ID:      IMPORT_CARENZE_FEBBRAIO
TARGET:  CARENZE
ATTIVO:  TRUE
CONFIG:  {"searchStrategy":"CERCA_DOCUMENTI","idGen":"CARENZE_SEGNALATORE_FEBBRAIO","map":{"STUDENTE":"STUDENTE","ID_RILEVAZIONE":"ID_RILEVAZIONE","PROGRESSIVO":"PROGRESSIVO","CLASSE":"CLASSE","DATA":"DATA","ASSENZE":"ASSENZE","NOTE":"NOTE"},"key":["STUDENTE","ID_RILEVAZIONE"],"conflictResolution":"IGNORE"}
```

```
ID:      IMPORT_CARENZE_MARZO
TARGET:  CARENZE
ATTIVO:  TRUE
CONFIG:  {"searchStrategy":"CERCA_DOCUMENTI","idGen":"CARENZE_SEGNALATORE_MARZO","map":{"STUDENTE":"STUDENTE","ID_RILEVAZIONE":"ID_RILEVAZIONE","PROGRESSIVO":"PROGRESSIVO","CLASSE":"CLASSE","DATA":"DATA","ASSENZE":"ASSENZE","NOTE":"NOTE"},"key":["STUDENTE","ID_RILEVAZIONE"],"conflictResolution":"IGNORE"}
```

---

## 3. CONF_MAIL

Colonne: `ID | OGGETTO | PROCESSO | BOX_CFG | TESTO_START | TESTO_END | SUPPLENTI | NOREPLY | COLORE_HEADER | CONDIZIONE | POST_PROCESSO | ALLEGATI_STATICI | GESTIONE_ARTICOLAZIONE | DUPLICAZIONE | RISPONDI_A`

`POST_PROCESSO` deve essere esattamente questo (STUDENTE + PROGRESSIVO, nessun altro criterio), altrimenti l'invio fallisce con `CARENZE: POST_PROCESSO richiede timestamp…`. `TESTO_START` è il messaggio iniziale personalizzabile per serie.

```
ID:                     INVIO_CARENZE_NOVEMBRE
OGGETTO:                Comunicazione insufficienze - {{focus.carenza.studente.nomeCompleto}} - Consigli di classe di novembre
PROCESSO:               PER_CARENZA_GENITORI
BOX_CFG:                [{"TIPO_BOX":"carenze","ORDINE":1},{"TIPO_BOX":"assenze","ORDINE":2},{"TIPO_BOX":"note","ORDINE":3}]
TESTO_START:            <p>Si comunicano gli esiti del consiglio di classe di novembre relativi a {{focus.carenza.studente.nomeCompleto}} ({{focus.carenza.classe.nome}}).</p>
TESTO_END:              (vuoto)
SUPPLENTI:              SOLO_TITOLARI
NOREPLY:                FALSE
COLORE_HEADER:          #007bff
CONDIZIONE:             {{focus.carenza.idRilevazione}} == "2026_27_NOVEMBRE"
POST_PROCESSO:          [{"tipo":"INSERISCI_TIMESTAMP","tab":"CARENZE","col":"NOTIFICATO","criteri":{"STUDENTE":"{{focus.carenza.studente.email}}","PROGRESSIVO":"{{focus.carenza.progressivo}}"}}]
ALLEGATI_STATICI:       []
GESTIONE_ARTICOLAZIONE: COMPLETA
DUPLICAZIONE:           NEGATA
RISPONDI_A:             (vuoto)
```

```
ID:                     INVIO_CARENZE_FEBBRAIO
OGGETTO:                Comunicazione insufficienze - {{focus.carenza.studente.nomeCompleto}} - Consigli di classe di febbraio
PROCESSO:               PER_CARENZA_GENITORI
BOX_CFG:                [{"TIPO_BOX":"carenze","ORDINE":1},{"TIPO_BOX":"assenze","ORDINE":2},{"TIPO_BOX":"note","ORDINE":3}]
TESTO_START:            <p>Si comunicano gli esiti del consiglio di classe di febbraio relativi a {{focus.carenza.studente.nomeCompleto}} ({{focus.carenza.classe.nome}}).</p>
TESTO_END:              (vuoto)
SUPPLENTI:              SOLO_TITOLARI
NOREPLY:                FALSE
COLORE_HEADER:          #007bff
CONDIZIONE:             {{focus.carenza.idRilevazione}} == "2026_27_FEBBRAIO"
POST_PROCESSO:          [{"tipo":"INSERISCI_TIMESTAMP","tab":"CARENZE","col":"NOTIFICATO","criteri":{"STUDENTE":"{{focus.carenza.studente.email}}","PROGRESSIVO":"{{focus.carenza.progressivo}}"}}]
ALLEGATI_STATICI:       []
GESTIONE_ARTICOLAZIONE: COMPLETA
DUPLICAZIONE:           NEGATA
RISPONDI_A:             (vuoto)
```

```
ID:                     INVIO_CARENZE_MARZO
OGGETTO:                Comunicazione insufficienze - {{focus.carenza.studente.nomeCompleto}} - Consigli di classe di marzo
PROCESSO:               PER_CARENZA_GENITORI
BOX_CFG:                [{"TIPO_BOX":"carenze","ORDINE":1},{"TIPO_BOX":"assenze","ORDINE":2},{"TIPO_BOX":"note","ORDINE":3}]
TESTO_START:            <p>Si comunicano gli esiti del consiglio di classe di marzo relativi a {{focus.carenza.studente.nomeCompleto}} ({{focus.carenza.classe.nome}}).</p>
TESTO_END:              (vuoto)
SUPPLENTI:              SOLO_TITOLARI
NOREPLY:                FALSE
COLORE_HEADER:          #007bff
CONDIZIONE:             {{focus.carenza.idRilevazione}} == "2026_27_MARZO"
POST_PROCESSO:          [{"tipo":"INSERISCI_TIMESTAMP","tab":"CARENZE","col":"NOTIFICATO","criteri":{"STUDENTE":"{{focus.carenza.studente.email}}","PROGRESSIVO":"{{focus.carenza.progressivo}}"}}]
ALLEGATI_STATICI:       []
GESTIONE_ARTICOLAZIONE: COMPLETA
DUPLICAZIONE:           NEGATA
RISPONDI_A:             (vuoto)
```

---

## 4. Entrypoint

Esistenti in `src/entrypoints/`: `generaCarenzeSegnalatoreNovembre/Febbraio` (`EntryPoints_User_1_Doc.ts`), `importaCarenzeFebbraioChunked/MarzoChunked` (`_4_Import.ts`), `inviaCarenzeNovembre/Febbraio` (`_2_Email.ts`).
Da aggiungere: `generaCarenzeSegnalatoreMarzo`, `importaCarenzeNovembreChunked`, `inviaCarenzeMarzo` (stesso schema: una funzione che chiama `menu_avvio…Chunked('<ID>')` + riga su `globalThis`).
Nota: `CARENZE_SEGNALATORE_APRILE` / `INVIO_CARENZE_SEGNALATORE_*` / `NOTIFICA_CARENZE_FAMIGLIE_FEBBRAIO` esistenti puntano a ID diversi da questi: non vengono toccati.

---

## 5. Da verificare prima dell'uso (non provato su GAS)

1. **Colonne materia nell'import.** Con `map` presente le colonne materia non mappate potrebbero non essere importate. Con la nuova regola fantasma questo diventa un fallimento silenzioso: senza colonne materia ogni riga (se `ASSENZE` non è `TRUE`) viene scartata e non entra nulla. Prova su un foglio con una materia: se `MAT` non arriva in `CARENZE`, vanno elencate in `map` (`"MAT":"MAT"`, …) tutte le sigle `MATERIE.ID`, oppure va esteso `GasDataImporter` per il passthrough.
2. **Placeholder del template.** Non verificato che `dynamic_rows` espanda più colonne sulla stessa riga, né che accetti il percorso annidato `carenze.numero` / `classe.nome`, né che `dynamic_columns` accetti `value=sigla` e due gruppi senza `label`.
3. **PROGRESSIVO = `carenze.numero` + 1** coincide con "MAX + 1" solo se i progressivi dello studente sono contigui e `carenze.numero` conta tutte le righe dell'anno. Righe cancellate o progressivi con buchi possono produrre un valore già esistente (chiave `(STUDENTE, PROGRESSIVO)` duplicata).
4. **Colonne `_…` nell'import**: verificare che `_ALUNNO` e `_N` non creino colonne nuove in `CARENZE` (il riferimento in 01 dice che sono riservate all'utente).
5. **`DATA`** deve essere una data valida (`AAAA-MM-GG`): il CDU la legge con `new Date(data + 'T00:00:00Z')`. Se le classi hanno CdC in giorni diversi della stessa serie, correggere `DATA` nel foglio della classe prima dell'import.
6. **Provare su DB eliminabile**: generazione → compilazione → import → import ripetuto (zero nuove righe) → invio con modalità test → controllo `NOTIFICATO` solo sulle righe inviate. Non lanciare import e invii in parallelo.
