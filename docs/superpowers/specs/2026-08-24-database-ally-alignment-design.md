# Allineamento "AS 2526 per ALDO.xlsx" alle specifiche SGSA — Design

**Data:** 2026-08-24
**Sorgente:** `DATABASES_TO_CONVERT/AS 2526 per ALDO.xlsx` (20 fogli = 20 tabelle ALDO)
**Destinazione:** `DATABASES_TO_CONVERT/ALLY/AS 2526 per ALDO.xlsx` + `DATABASES_TO_CONVERT/ALLY/REPORT_ALLINEAMENTO.md`
**Riferimenti:** `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`, `SPECS_ALDO/02_CDU_STRUTTURA.md`, `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md`

---

## 1. Obiettivo

Allineare l'intero contenuto del database AS 2526 a specifiche, enum, struttura dei campi, filtri e azioni previsti da ALDO, producendo una copia corretta in `DATABASES_TO_CONVERT/ALLY/` senza modificare il file sorgente. Ogni modifica è deterministica, documentata e tracciata in un report.

## 2. Approccio

Script Python one-off **`DATABASES_TO_CONVERT/convert_to_ally.py`** (dipendenza: `openpyxl`):

1. Legge l'xlsx sorgente (valori calcolati, celle native: date come `datetime`, booleani nativi).
2. Applica la tabella di regole della §4 (ogni regola registra una voce di log `{foglio, riga/chiave, colonna, vecchio, nuovo, regola}`).
3. Scrive l'xlsx allineato in `ALLY/` (stessi 20 fogli, stessi header, stessi ordini di riga tranne dove indicato).
4. Scrive `REPORT_ALLINEAMENTO.md` con: tutte le modifiche raggruppate per regola, i residui non risolti (§5) e le deviazioni accettate (§6).

Approccio scartato: editing manuale su Sheets (non riproducibile); pipeline TS via `CONF_IMP` (overkill per preparazione dati off-GAS; la logica non è riutilizzabile come libreria).

## 3. Verifiche preliminari eseguite (e loro esito)

- `POST_PROCESSO`: la chiave discriminante canonica è `"tipo"` (`src/application/pipelines/postProcessActions.ts`) → i valori esistenti sono già conformi, nessuna modifica.
- `CsvScope` gestisce spazi dopo virgola (`"FIL, STO"`) → nessuna normalizzazione CSV necessaria.
- `BOX_CFG`: tutti i `TIPO_BOX`, `DATI_SORGENTE.metodo` e le chiavi `filtri` presenti risultano ammessi → nessuna modifica.
- Integrità strutturale: header di tutti i 20 fogli già conformi allo schema; colonne matrice CARENZE ⊂ MATERIE; FK principali ok (eccetto casi in §4.5/§5).
- Il filtro pipe `| join` è supportato dal template engine (`GUIDA_USO_PLACEHOLDER.md` §6) → conforme.

## 4. Regole di trasformazione

### 4.1 Enum e casing

| Foglio | Campo | Trasformazione |
| --- | --- | --- |
| INDIRIZZI | `TIPO` | `CLASSICO`, `SCIENTIFICO` → `LICEO` (enum `TipoIstituto`) |
| CONF_DOC | `PERMESSI` | valori `scrittura`→`SCRITTURA`, `lettura`→`LETTURA` (enum `PermessoACL`); chiave `cartella`→`folder` sia top-level sia dentro `regolaSupplente` (~21 valori + ~4 chiavi) |

### 4.2 CONF_DOC — completamento campi obbligatori

| Riga | Campo | Nuovo valore | Motivazione |
| --- | --- | --- | --- |
| CONDOTTA | `GENERATORE` | `SHEET_CON_MATERIE_E_PERMESSI` | GSHEET con colonne materie + ACL per materia (`permessiAltSuRel`) |
| COMPETENZE | `GENERATORE` | `SHEET_CON_MATERIE_E_PERMESSI` | idem |
| CARENZE_SEGNALATORE_NOVEMBRE | `GENERATORE` | `SHEET_CON_MATERIE_E_PERMESSI` | GSHEET con colonne materie per classe |
| CARENZE_SEGNALATORE_FEBBRAIO | `GENERATORE` | `SHEET_CON_MATERIE_E_PERMESSI` | idem |
| DOC15MAGGIO | `GENERATORE` | `DOCUMENTO_CON_TABELLE_IMPORTATE` | GDOC con importazioni da altri documenti (superset sicuro di DOCUMENTO_GENERICO) |

`GENERATORE` vuoto causerebbe `PipelineError: GENERATORE non registrato` in `RenderTemplateStep`.

### 4.3 CONF_DOC — asse batch e placeholder CDU

| Riga | Campo | Vecchio | Nuovo |
| --- | --- | --- | --- |
| RELAZIONE_FINALE | `TIPO` | `RELAZIONE_FINALE` | `DOCUMENTO_DOCENTE_CLASSE_MATERIA` |
| RELAZIONE_FINALE | `FILE_NAME` | `{{materia.sigla}}` / `{{docente.nomeCompleto}}` | `{{focus.materia.sigla}}` / `{{focus.docente.nomeCompleto}}` |
| PROGRAMMA | `TIPO` | `PROGRAMMA_SVOLTO` | `DOCUMENTO_DOCENTE_CLASSE_MATERIA` |
| PROGRAMMA | `FILE_NAME` | `{{materia.sigla}}` | `{{focus.materia.sigla}}` |
| PROGRAMMA_RELAZIONI_QUINTE | `TIPO` | `RELAZIONE_DOCENTE_DOC_15_MAGGIO` | `DOCUMENTO_DOCENTE_CLASSE_MATERIA` |
| PROGRAMMA_RELAZIONI_QUINTE | `FILE_NAME` | `{{materia.sigla}}` | `{{focus.materia.sigla}}` |
| DOC15MAGGIO | `MODELLI[0].condizione` | `{{classe.indirizzoSigla}} == 'LC'` | `{{focus.classe.anagrafica.indirizzo.sigla}} == 'LC'` |

Motivazione: `focus.docente`/`focus.materia` sono popolati SOLO dall'asse batch `DOCUMENTO_DOCENTE_CLASSE_MATERIA` (01 §CONF_DOC "Altri TIPO riservati", 02 §4.5); il percorso `classe.indirizzoSigla` non esiste nel CDU e la condizione sarebbe sempre falsa (template sbagliato scelto in silenzio).

### 4.4 PIANI_PERSONALIZZATI — ramo PEI

**Scelta utente: NON aggiungere il ramo PEI.** `MODELLI` resta a 4 rami. Una generazione con `focus.piano.tipo == "PEI"` produrrà errore esplicito ("nessun template applicabile"), comportamento coerente con `ModelliConfig.getTemplateId`. Deviazione documentata dalla regola "esattamente cinque rami" di `01_SCHEMA_DATABASE.md` — vedere §6.

### 4.5 Rimappatura audit trail (LOG_*)

Politica confermata: best-effort deterministico sui casi con successore univoco o inferibile; i residui restano intatti e finiscono nel report. La rimappatura riscrive la storia su richiesta esplicita dell'utente (consapevoli della natura append-only dei log).

**LOG_DOCS.ID_GEN / LOG_FOLD.TIPO:**

| Vecchio ID | Criterio | Nuovo ID |
| --- | --- | --- |
| `DOCUMENTO_PERSONALIZZATO` | rinomina univoca | `PIANI_PERSONALIZZATI` |
| *(vuoto)* + TIPO=`PIANO_PERS` | TIPO | `PIANI_PERSONALIZZATI` |
| *(vuoto)* + TIPO=`PCTO` | TIPO | `PCTO` |
| *(vuoto)* + TIPO=`PIANO_LAVORO` | TIPO | `PIANO_LAVORO` |
| *(vuoto)* + TIPO=`VERBALE_CDC` | TIPO + mese di `DATA_CREAZ` (verificato: tutto mese 10) | `VERBALE_CDC_OTTOBRE` |
| `RIEPILOGO_QUINTA` (ID_GEN) e *(vuoto)*+TIPO=`RIEPILOGO_QUINTA` | nessun successore | **intatto**, report |
| fold `VERBALE_CDC` | cartelle dei verbali (stesso batch ottobre) | `VERBALE_CDC_OTTOBRE` |
| fold `PROGRAMMI_SVOLTI` | corrispondenza semantica | `PROGRAMMA` |
| fold `RELAZIONI_FINALI` | corrispondenza semantica | `RELAZIONE_FINALE` |
| fold `DOCUMENTO_15_MAGGIO` | corrispondenza semantica | `DOC15MAGGIO` |
| fold `VERBALE_ASSEMBLEA_CLASSE` | nessun successore | **intatto**, report |

**Normalizzazione SOTTOTIPO** solo sulle righe LOG_DOCS toccate dalla rimappatura: `PDP BES`→`PDP_BES`, `PDP DSA`→`PDP_DSA`, `PDP STRANIERI`→`PDP_STRANIERI` (valori enum `TipoPiano`; `LOG_DOCS.SOTTOTIPO` DEVE essere il valore di `PIANI.TIPO`).

**LOG_MAIL.PATTERN:** `NOTIFICA_CARENZE_FAMIGLIE` (35) e `NOTIFICA_CARENZE_FAMIGLIE_AUTO` (3) non hanno successore univoco (gli attuali sono `_FEBBRAIO`/`_MARZO`, ma gli invii storici sono di gennaio) → **intatti**, report.

### 4.6 Dati anagrafici e operativi

| Foglio | Modifica |
| --- | --- |
| DIPART | `CAPO` svuotato su tutte le 12 righe (email fittizie `docenteN@scuola.edu` assenti da DOCENTI). CAPO vuoto è lecito: `PER_CAPO_DIPARTIMENTO` salta i dipartimenti senza capo. Elenco nel report per assegnazione futura |
| RUOLI | `NOME` completato: REF_ORIENTAMENTO→`Referente Orientamento`, DOCENTE_PRIMA_PROVA→`Docente della prima prova d'esame`, DOCENTE_SECONDA_PROVA→`Docente della seconda prova d'esame`, ALUNNO→`Alunno`; typo RAPPRESENTANTE_GENITORI: `classedei`→`classe dei` |
| CLASSI | `TERMINALE=TRUE` sulle righe con ANNO=5 (10 classi: 5ALC…5H; istituto con soli licei quinquennali) |
| MOV_ALUNNI | riga `vittorio.dantonio@…`: TIPO `OUT`→`RITIRATO`, A `RITIRO FREQUENZA`→`RITIRO` (semantica enum TipoMovimento); riga `aurora.petrini@…`: A vuoto→`ALTRO ISTITUTO`. Coppia `michelle.dellamora@…` (OUT+IN 2E→2E): **solo segnalata** nel report, valori intatti |
| CARENZE | riga orfana `matias.veliaj@pietroaldi.com` (non in ALUNNI): **lasciata**, report |

## 5. Elementi lasciati volutamente intatti (scelte utente)

- Studente di test `harry.potter@pietroaldi.com` + classe `HOGWARTS`.
- Pseudo-classe `ALTRO ISTITUTO` in CLASSI (nota semantica nel report: rende "interna" la sentinella nei MOV_ALUNNI ai fini di `ProvenienzaDestinazione.isEsterna()`).
- Righe di test `TEST_DOC_TABELLE_*` in CONF_DOC.
- Righe fantasma completamente vuote in CONF_DOC/CONF_MAIL (ignorate dal lettore DB).
- Timestamp `dd/MM/yyyy HH:mm:ss` in NOTIFICATO/DATA (CARENZE, LOG_DOCS, LOG_MAIL): il codice attuale scrive ISO ma i controlli sono presence-based.
- Chiavi PARAMETRI inerti (`colonneMaterie`, `schede`, `anniCorso`, `configurazionePipeline`): non lette da alcuno strategy, elencate nel report come possibili future estensioni.
- `ALUNNI.DATA_MODIFICA` tutto vuoto.

## 6. Deviazioni accettate rispetto alle specifiche

1. `PIANI_PERSONALIZZATI.MODELLI` ha 4 rami anziché i 5 richiesti (manca PEI) — scelta esplicita dell'utente; errore esplicito a runtime per PEI.
2. Log audit storici rimappati agli ID attuali (violazione locale dell'immutabilità append-only) — richiesta esplicita dell'utente; residui non mappabili elencati nel report.
3. FK residue accettate: CARENZE→matias.veliaj; LOG_FOLD.TIPO=`VERBALE_ASSEMBLEA_CLASSE` (49); LOG_DOCS legati a RIEPILOGO_QUINTA (11); LOG_MAIL.PATTERN=`NOTIFICA_CARENZE_FAMIGLIE(_AUTO)` (38).

## 7. Output

```
DATABASES_TO_CONVERT/ALLY/
├── AS 2526 per ALDO.xlsx      # stesso nome/sheet/header del sorgente, contenuto allineato
└── REPORT_ALLINEAMENTO.md     # modifiche per regola + residui + deviazioni
```

Lo script `convert_to_ally.py` NON deve sovrascrivere il sorgente; se `ALLY/` esiste già chiede conferma o sovrascrive i due file generati (idempotente: rieseguibile sullo stesso sorgente).

## 8. Verifica (acceptance criteria)

1. Rieseguendo lo scanner di validazione (enum, FK, JSON, placeholder) sull'output `ALLY/`, le uniche violazioni residue sono quelle elencate in §5/§6.
2. Nessun header modificato; numero righe per foglia identico al sorgente (nessuna riga aggiunta/rimossa).
3. JSON coinvolti (PERMESSI, MODELLI) riserializzati validi e verificati con parse.
4. Report presente e completo: ogni regola con conteggio occorrenze applicate uguale a quello atteso dalle analisi preliminari (PERMESSI ~21 valori + chiavi `cartella`, INDIRIZZI 4, GENERATORE 5, TIPO per-cattedra 3×(TIPO+placeholder), log 241 righe LOG_DOCS + 158 righe LOG_FOLD, TERMINALE 10, MOV 2, RUOLI 5, DIPART 12).
