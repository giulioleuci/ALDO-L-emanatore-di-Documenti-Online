# Email di riepilogo cattedre per docente

Questa configurazione invia una sola email a ciascun docente con le sue classi e, sotto ogni classe, le materie che insegna. La tabella reale si chiama **`CONF_MAIL`** (non `CONF_EMAIL`).

Prima di inserire la riga, deve essere stata implementata l'estensione che popola il CDU con:

```text
destinatario.contesto.cattedre
```

La proprietà deve contenere una lista di classi; ogni classe deve avere `nome` e l'array `materie`, i cui elementi hanno `nome` e, se presente, `specificita`. Il riepilogo considera le cattedre nominali aggiornate dalle `VARIAZIONI_CATTEDRA` efficaci alla data di invio e ignora sempre le `SUPPLENZE`.

## Righe e valori di `CONF_MAIL`

Inserire un record con questi valori:

| Colonna | Valore consigliato | Significato |
| --- | --- | --- |
| `ID` | `RIEPILOGO_CATTEDRE_DOCENTE` | Identificatore univoco del pattern. |
| `OGGETTO` | `Le tue classi e materie` | Oggetto dell'email. |
| `PROCESSO` | `PER_DOCENTE` | Una email per docente, aggregando le sue classi. |
| `BOX_CFG` | JSON riportato sotto | Configura il box dinamico. |
| `TESTO` | `<p>Gentile {{destinatario.anagrafica.appellativo}} {{destinatario.anagrafica.cognome}},</p><p>di seguito trova il riepilogo della sua cattedra.</p>` | Testo introduttivo prima del box. Si possono usare placeholder Mustache. |
| `SUPPLENTI` | `SOLO_TITOLARI` | Coerente con l'esclusione delle supplenze da questa comunicazione. |
| `NOREPLY` | `TRUE` | Aggiunge il disclaimer no-reply; impostare `FALSE` solo se si desiderano risposte. |
| `COLORE_HEADER` | `#2c3e50` | Colore dell'header; può essere sostituito con il colore istituzionale. |
| `CONDIZIONE` | `{{destinatario.contesto.cattedre.length}} > 0` | Non invia l'email quando il docente non ha alcuna cattedra risultante. |
| `POST_PROCESSO` | `[]` | Nessuna azione dopo l'invio. |

## Configurazione dettagliata del box

Mettere questo JSON nella colonna `BOX_CFG`:

```json
[
  {
    "TIPO_BOX": "testo_dinamico",
    "TITOLO": "Le tue cattedre",
    "ORDINE": 1,
    "COLORE": "#3498db",
    "CONTENUTO": "<p>Le classi e le materie della sua cattedra sono:</p><ul>{{#destinatario.contesto.cattedre}}<li>{{nome}}<ul>{{#materie}}<li>{{nome}}{{#specificita}} — {{specificita}}{{/specificita}}</li>{{/materie}}</ul></li>{{/destinatario.contesto.cattedre}}</ul>"
  }
]
```

`testo_dinamico` è il tipo corretto: il suo `CONTENUTO` è HTML Mustache valutato sull'intero CDU. I tag `{{#...}} ... {{/...}}` sono cicli:

- il primo ciclo crea una voce per ogni classe in `destinatario.contesto.cattedre`;
- il secondo ciclo crea le sotto-voci con le materie della classe corrente;
- `{{#specificita}} ... {{/specificita}}` mostra il trattino e la specificità solo quando quest'ultima esiste.

Non usare `{{{nome}}}` o altri placeholder non escapati: `{{nome}}` protegge il testo proveniente dai dati della scuola, mentre l'HTML strutturale resta quello definito dall'amministratore nella configurazione.

## Versione pronta per un CSV

In un file CSV ogni doppio apice interno al JSON deve essere raddoppiato. La riga, nell'ordine di colonne attuale (`ID,OGGETTO,PROCESSO,BOX_CFG,TESTO,SUPPLENTI,NOREPLY,COLORE_HEADER,CONDIZIONE,POST_PROCESSO`), è:

```csv
RIEPILOGO_CATTEDRE_DOCENTE,Le tue classi e materie,PER_DOCENTE,"[{""TIPO_BOX"":""testo_dinamico"",""TITOLO"":""Le tue cattedre"",""ORDINE"":1,""COLORE"":""#3498db"",""CONTENUTO"":""<p>Le classi e le materie della sua cattedra sono:</p><ul>{{#destinatario.contesto.cattedre}}<li>{{nome}}<ul>{{#materie}}<li>{{nome}}{{#specificita}} — {{specificita}}{{/specificita}}</li>{{/materie}}</ul></li>{{/destinatario.contesto.cattedre}}</ul>""}]","<p>Gentile {{destinatario.anagrafica.appellativo}} {{destinatario.anagrafica.cognome}},</p><p>di seguito trova il riepilogo della sua cattedra.</p>",SOLO_TITOLARI,TRUE,#2c3e50,{{destinatario.contesto.cattedre.length}} > 0,[]
```

Se la scuola non usa un appellativo per tutti i docenti, sostituire nel `TESTO` il saluto con una forma neutra, ad esempio `<p>Gentile {{destinatario.anagrafica.nomeCompleto}},</p>`.

## Risultato atteso

Per un docente assegnato a 5A (Italiano, Storia) e 4B (Latino), il box mostrerà:

```text
Le tue cattedre

• 4B
  • Latino
• 5A
  • Italiano
  • Storia
```

L'ordine finale dipende dall'ordinamento implementato nella proiezione CDU; la configurazione non deve provare a ordinare, filtrare o calcolare le cattedre nel testo Mustache.
