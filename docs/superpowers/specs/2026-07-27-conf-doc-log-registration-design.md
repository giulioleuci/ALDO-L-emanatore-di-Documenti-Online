# CONF_DOC: configurazione della registrazione di file e cartelle

## Obiettivo

Rendere dichiarativa, per ciascuna configurazione `CONF_DOC`, la compilazione dei
metadati in `LOG_DOCS` e `LOG_FOLD`, senza modificare il carattere obbligatorio
della registrazione né il confine transazionale della pipeline documentale.

## Modifiche di schema

`CONF_DOC` acquisisce due colonne JSON:

- `REGISTRA_DOC`, per i metadati della riga `LOG_DOCS`;
- `REGISTRA_FOLD`, per i metadati della riga `LOG_FOLD`.

Entrambe adottano il medesimo schema, con chiavi opzionali:

```json
{
  "classi": "{{...}}",
  "utenti": "{{...}}",
  "materie": "{{...}}"
}
```

`LOG_DOCS.MATERIA` e `LOG_FOLD.MATERIA` vengono rinominate in `MATERIE` e
diventano campi CSV, con la stessa semantica di `CLASSI` e `UTENTI`.

## Semantica

Le espressioni sono renderizzate dall'attuale template engine sul CDU. I risultati
di `classi`, `utenti` e `materie` sono CSV: spazi esterni rimossi, elementi vuoti
scartati, duplicati eliminati e ordine del primo incontro mantenuto.

Le chiavi assenti, le stringhe vuote e le espressioni che rendono una stringa vuota
producono una colonna di log vuota. Non esistono fallback impliciti verso la classe
focus, l'alunno focus, `REGISTRA_UTENTI` o la materia focus.

`REGISTRA_DOC` alimenta la singola riga creata per il file in `LOG_DOCS`.
`REGISTRA_FOLD` alimenta la riga della cartella in `LOG_FOLD`.

Per una cartella già registrata, i tre CSV in `LOG_FOLD` vengono uniti
incrementalmente ai valori esistenti. Un campo reso vuoto non rimuove metadati
preesistenti.

## Validazione ed errori

Ogni colonna deve contenere un oggetto JSON oppure essere assente/vuota. Sono
ammesse esclusivamente le chiavi `classi`, `utenti` e `materie`; ogni valore
presente deve essere una stringa. JSON malformato, chiavi sconosciute o valori di
tipo diverso causano un `PipelineError` prima della persistenza dei log.

La registrazione di file e cartelle resta obbligatoria. Le colonne configurano solo
i metadati, non possono disabilitare `LOG_DOCS` o `LOG_FOLD`.

## Integrazione e atomicità

La pipeline esistente resta l'unico percorso della generazione: prepara/riusa la
cartella, genera il file, applica i permessi, registra il file ed esegue il
post-processo. Tutte le mutazioni di `LOG_FOLD` e `LOG_DOCS` restano nella stessa
transazione; un errore causa rollback del database e il rollback Drive già previsto.

I repository legacy con `save()` autonomo non vengono introdotti nel flusso.

## Verifica

I test copriranno il rendering dei tre metadati nei due log, l'assenza di fallback,
l'unione CSV di una cartella riutilizzata, la rinomina `MATERIA`/`MATERIE`, JSON
malformato o non conforme e il rollback della transazione in caso di errore.
