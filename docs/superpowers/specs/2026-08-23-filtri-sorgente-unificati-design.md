# Filtri Sorgente Unificati (DATI_SORGENTE.filtri) — Design

Data: 2026-08-23
Stato: approvato in brainstorming, in attesa di implementazione
Area: pipeline email / box CONF_MAIL / AggregatoreDati

## 1. Contesto e problema

Il filtraggio dei dati sorgente nei box `CONF_MAIL` è oggi frammentato su tre percorsi divergenti:

| Percorso | File | Dialetto | Campi |
| --- | --- | --- | --- |
| Link visibili nei box `documenti` | `src/application/email/boxes.ts` (`aggregaDati`) | `FILTRO_TIPO` / `FILTRO_STATO` a livello box | solo tipo, stato |
| Allegati (`ALLEGA=true`) | `src/application/pipelines/emailSteps.ts` (`ComposeEmailStep.resolveAllegati`) | `DATI_SORGENTE.filtri` | solo tipo, stato |
| Accessori `AggregatoreDati.perMetodo` | `src/application/services/AggregatoreDati.ts` (`matchesDoc`) | `DATI_SORGENTE.filtri` | tipo, stato, sottotipo |

Problemi:

1. **Due dialetti** per lo stesso concetto (`FILTRO_*` vs `filtri`), con chiavi in posizioni diverse.
2. **Asimmetrie semantiche**: gli allegati ignorano `sottotipo`; i link ignorano tutto il resto.
3. **Le cartelle non sono filtrabili**: `cartellePerClasse` non applica alcun criterio oltre alla classe.
4. **Accessori asimmetrici**: esiste `documentiPerAlunno` ma nessun equivalente per docente/dipartimento; le cartelle hanno solo `perClasse`.

## 2. Obiettivi e non-obiettivi

### Obiettivi

1. **Un solo dialetto**: `DATI_SORGENTE.filtri` è l'unico sistema di filtraggio per box documenti e cartelle, sia per i link visibili che per gli allegati.
2. **Nessuna retrocompatibilità**: `FILTRO_TIPO`/`FILTRO_STATO` vengono rimossi dal codice; i BOX_CFG esistenti saranno riscritti manualmente dall'utente (fuori scope implementativo).
3. **Set completo di campi** filtrabili su documenti e cartelle (§4).
4. **Modalità CSV configurabile** per contenimento parziale (`any`, default) o totale (`all`).
5. **Esclusioni**: blocco `not` con la stessa forma dei criteri positivi.
6. **Matrice accessori simmetrica**: `{documenti, cartelle} × {perClasse, perUtente, perDipartimento}`.

### Non-obiettivi

- Filtri su `PREREQUISITI[]`.
- Date/data-range, wildcard, gruppi OR, operatori numerici.
- Ottimizzazioni query lato SheetDB: le specific restano valutate in-memory sui result set già scoping-ridotti da classe/utente/dipartimento (volumi piccoli).
- Modifiche a `carenzePerAlunno` e `emailCoordinatori`.

## 3. Decisioni architetturali

Scelto **approccio A — Specification di dominio ALDO**: un modulo puro che parsa i filtri dalla config e costruisce `Specification` riusando `DomainRepositoryLib` (già base di `LogDocumentoRepository` e delle 15 spec in `src/domain/specifications/`). Zero impatti su GasLibraryFactory; eventuale promozione del mapper in libreria rimandata a stabilizzazione del formato.

Rifiutati: estensione diretta di DomainRepositoryLib (troppo lavoro upfront) e predicato semplice senza Specifications (bypasserebbe l'infrastruttura esistente).

## 4. Formato della config

`DATI_SORGENTE.filtri` è un oggetto JSON opzionale dentro la config del box (`BOX_CFG`):

```jsonc
"DATI_SORGENTE": {
  "metodo": "documentiPerClasse",
  "filtri": {
    "csv": "any",                    // opzionale: "any" (default) | "all"
    // --- campi documenti ---
    "tipo": "VERBALE",               // uguaglianza esatta
    "stato": "NOTIFICATO",           // validato su enum StatoDocumento
    "sottotipo": "PDP_BES",
    "idGen": "VERBALE_CDC",
    "idOrig": "...",
    "notificato": true,              // boolean: true = timestamp NOTIFICATO presente
    "classi": ["1A", "2B"],          // CSV: stringa singola o array
    "utenti": "docente@school.it",
    "materie": ["MATE"],
    // --- campi cartelle ---
    "nome": "Verbalini",             // sottostringa case-sensitive
    "path": "Archivio/2026",
    // --- esclusioni: stessa forma, annidate in "not" ---
    "not": { "tipo": "CONDOTTA", "stato": "ARCHIVIATO" }
  }
}
```

Regole:

- Chiavi **camelCase**, coerenti con gli accessor esistenti (`tipo`/`stato`/`sottotipo` invariati).
- Campi CSV accettano una stringa singola (un valore) o un array di stringhe.
- Il blocco `not` ha la stessa forma dei criteri positivi, **senza** `not` annidato né flag `csv` dedicato (eredita la modalità globale).
- `filtri` assente → nessun filtraggio; `filtri` presente ma vuoto → idem.
- `FILTRO_TIPO`/`FILTRO_STATO` a livello box non sono più letti da alcun codice e la validazione li segnala come chiavi non ammesse (rete di sicurezza per BOX_CFG non migrati).

### 4.1 Campi validi per entità

| Entità | Chiavi ammesse |
| --- | --- |
| documenti (`LOG_DOCS`) | `tipo`, `stato`, `sottotipo`, `idGen`, `idOrig`, `notificato`, `classi`, `utenti`, `materie` |
| cartelle (`LOG_FOLD`) | `idGen` (→ colonna `TIPO`), `nome`, `path`, `classi`, `utenti`, `materie` |

Una chiave valida per un'entità usata sull'altra (es. `sottotipo` su un box cartelle) è **errore di validazione**, non viene ignorata.

## 5. Semantica di matching

- **AND** tra tutti i criteri positivi; l'entità è scartata se **almeno una** esclusione `not.*` matcha.
- Campi scalari (`tipo`, `stato`, `sottotipo`, `idGen`, `idOrig`): uguaglianza esatta case-sensitive.
- `notificato`: boolean sulla presenza (`true`) / assenza (`false`) del timestamp `NOTIFICATO`.
- Campi CSV (`classi`, `utenti`, `materie`):
  - `"csv": "any"` *(default)* → basta **un valore** in comune tra filtro ed entità;
  - `"csv": "all"` → **tutti** i valori del filtro devono essere presenti nell'entità.
  - La modalità si applica anche ai campi CSV dentro `not`.
- `nome`, `path` (solo cartelle): sottostringa case-sensitive.
- Confronti mai implicitamente normalizzati: nessun trim/case-folding oltre a quanto sopra.

## 6. Matrice accessori

`AggregatoreDati.perMetodo` espone sei metodi dati + due invariati:

| Metodo | Scope di base (prima dei filtri) | Stato |
| --- | --- | --- |
| `documentiPerClasse` | `findByClasse` con regola classe-partner esistente | esiste |
| `documentiPerUtente` | `LOG_DOCS.UTENTI` ∋ email utente (param `utenteEmail` o focus) | **rinomina** di `documentiPerAlunno` |
| `documentiPerDipartimento` | `LOG_DOCS.MATERIE` interseca il set materie del dipartimento (`MateriePerDipartimentoSpec`) | nuovo |
| `cartellePerClasse` | `LOG_FOLD.CLASSI` ∋ classe | esiste |
| `cartellePerUtente` | `LOG_FOLD.UTENTI` ∋ email utente | nuovo |
| `cartellePerDipartimento` | `LOG_FOLD.MATERIE` interseca materie dipartimento | nuovo |

Invariati: `carenzePerAlunno`, `emailCoordinatori`.

Regole trasversali:

- I filtri si applicano **sempre dopo** lo scope di base.
- Risoluzione dello scope: il parametro esplicito vince se presente; altrimenti l'email/classe/dipartimento derivati dal focus CDU; se nessuno dei due è risolvibile → warning + box saltato (contratto già standard per metodo sconosciuto).
- Per `perDipartimento` il set di materie del dipartimento è risolto tramite `MateriePerDipartimentoSpec`; la sorgente dell'ID dipartimento è la stessa che popola `focus.dipartimento` nel CDU.
- Parametri di `perMetodo`: `{ utenteEmail?, classeId?, dipartimentoId?, filtri? }`.

## 7. Architettura

### 7.1 Nuovo modulo di dominio

`src/domain/specifications/FiltriSorgente.ts` — puro, zero import GAS, domain-agnostic rispetto a Google Sheets/Drive:

```
parseFiltriSorgente(raw: unknown, entita: 'documenti' | 'cartelle')
  → { filtri?: FiltriSorgente, errori: string[] }

specDocumenti(filtri: FiltriSorgente): Specification<LogDocumento>
specCartelle(filtri: FiltriSorgente): Specification<LogCartella>
```

- Il validatore conosce l'insieme di chiavi ammesse per tipo entità (§4.1).
- Le specific si compongono con `Specification.and()` di DomainRepositoryLib, stesso idioma delle spec esistenti.
- Nessuna nuova dipendenza da wire in `Bootstrap.ts`: funzioni pure.

### 7.2 Consumer convergenti

| Consumer | Oggi | Dopo |
| --- | --- | --- |
| `AggregatoreDati.perMetodo` | `matchesDoc` inline su 3 campi; cartelle senza filtri | parser+spec per documenti e cartelle; `matchesDoc` eliminato |
| `ComposeEmailStep.resolveAllegati` | filtri inline solo `tipo`/`stato` | stesso parser+spec → parità totale col rendering (`sottotipo`, esclusioni, CSV inclusi) |
| `aggregaDati` / `renderBoxes` | legge `FILTRO_TIPO`/`FILTRO_STATO`; cartelle opt-in solo via `metodo` | legge `DATI_SORGENTE.filtri` del box per entrambi i `TIPO_BOX`; le cartelle applicano i filtri via `AggregatoreDati` |

Un solo percorso di verità: la stessa config produce gli stessi insiemi sia che il box mostri link sia che allegi file.

## 8. Gestione errori

Errore di parse/validazione (chiave sconosciuta, chiave di altra entità, `stato` fuori enum, `csv` ≠ any/all, tipi errati, residui `FILTRO_*`):

1. `logger.error` con ID pattern `CONF_MAIL` + elenco chiavi offending;
2. **box saltato** — stesso contratto già usato per `metodo` sconosciuto e `TIPO_BOX` ignoto.

Niente eccezioni che interrompono la pipeline: un box mal configurato non blocca gli altri pattern.

## 9. Testing

Nuovi — `test/unit/domain/specifications/filtri-sorgente.test.ts`:

- Parser: config minimale valida; tutti i campi per entrambe le entità; `csv` any/all; blocco `not`; errori (chiave sconosciuta, chiave di altra entità, `stato` fuori enum, tipi errati, chiavi legacy `FILTRO_*`, `not` annidato).
- Matching: uguaglianza, contenimento any/all su CSV, sottostringa nome/path, `notificato` true/false, precedenza esclusioni, AND composto.

Aggiornati (riscritti al nuovo dialetto):

- `test/unit/application/aggregatore-dati.test.ts` — casi oggi su `matchesDoc`; rinomina `documentiPerAlunno`→`documentiPerUtente`; nuovi accessori.
- `test/unit/application/email-boxes.test.ts` (~861-935) — box che oggi usano `FILTRO_TIPO`/`FILTRO_STATO`.
- `test/unit/application/pipelines/email-steps.test.ts` (~2120) — test filtri allegati riscritto + nuovo caso di parità: stesso pattern produce stessi link e stessi allegati con `sottotipo`.

Verifica finale: `npm test && npm run typecheck && npm run lint`.

## 10. Migrazione dati

- `FAKEDB/CONF_MAIL.csv`: nessuna riga usa `FILTRO_*` → nessuna modifica necessaria.
- BOX_CFG reali: riscritti manualmente dall'utente dopo l'implementazione; la validazione fail-fast segnala eventuali dimenticanze al primo giro.
