# CDU `focus.piano.tipoLabel`

## Obiettivo

Esporre una descrizione leggibile del piano personalizzato in documenti ed email,
senza modificare l'identificatore tecnico usato dalle configurazioni e dai log.

## Contratto CDU

`focus.piano.tipo` conserva il valore di `PIANI.TIPO` (`PDP_DSA`, `PDP_BES`,
`PDP_STRANIERI`, `PFP`, `PEI`). Si aggiunge `focus.piano.tipoLabel`, con la
seguente mappatura:

| Tipo tecnico    | Etichetta         |
| --------------- | ----------------- |
| `PDP_DSA`       | `PDP (DSA)`       |
| `PDP_BES`       | `PDP (BES)`       |
| `PDP_STRANIERI` | `PDP (STRANIERI)` |
| `PFP`           | `PFP`             |
| `PEI`           | `PEI`             |

La mappatura resta nel mapper di etichette ALDO, poiché rappresenta il
vocabolario di dominio SGSA e non una funzionalità riusabile di
GasLibraryFactory.

## Email, compatibilità e dati di esempio

Le condizioni in `CONF_DOC.MODELLI`, il recupero del piano e
`LOG_DOCS.SOTTOTIPO` continuano a usare il valore tecnico. Template di documenti
ed email potranno usare `{{focus.piano.tipoLabel}}`.

Le email riepilogative dei piani usano invece gli elementi di
`pianiPersonalizzati`: ogni elemento riceve `tipoLabel`, derivata dal suo
`sottotipo`, mentre `sottotipo` resta invariato per correlare il piano allo
storico. I template di riga delle email possono quindi usare
`{{corrente.tipoLabel}}`.

I dati e i template mock del percorso online saranno aggiornati per usare il
nuovo placeholder, così la verifica end-to-end coprirà il contratto destinato
alla presentazione.

## Verifica

I test del provider CDU copriranno ogni valore `TipoPiano` e la sua etichetta;
i test dei provider della lista piani e dei mock online copriranno
`tipoLabel` in documenti (`{{focus.piano.tipoLabel}}`) ed email
(`{{corrente.tipoLabel}}`). I test mirati, typecheck e lint completeranno la
verifica.
