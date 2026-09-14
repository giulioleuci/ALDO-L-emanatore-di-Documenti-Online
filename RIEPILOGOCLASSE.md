# RIEPILOGO CLASSE INIZIO ANNO — Guida completa

 Documento di riepilogo generato all'inizio dell'anno scolastico e inviato a ogni coordinatore per la verifica dei dati anagrafici degli studenti e della composizione del consiglio di classe.

---

## 1. Template Google Doc

Creare un Google Doc vuoto nella Drive di sviluppo/produzione e impostarlo come template. Il documento usa la sintassi Mustache `{{...}}` per i placeholder CDU.

### Struttura del template

```
RIEPILOGO CLASSE {{focus.classe.nome}}
Anno scolastico {{meta.annoScolastico}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DOCENTI DEL CONSIGLIO DI CLASSE ({{focus.classe.consiglio.numero}})

| #  | Docente                 | Materie assegnate        |
|----|-------------------------|--------------------------|
{{#focus.classe.consiglio.elenco}}
| {{@number}} | {{appellativoCompleto}} | {{materieDescrizione}} |
{{/focus.classe.consiglio.elenco}}

Tutor: {{focus.classe.tutor.elencoDescrizione}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ELENCO STUDENTI ({{focus.classe.studenti.numero}})

| #  | Nome completo          | BES | DSA | PEI | PFP | Straniero | Ripetente | Nuovo ingresso | Religione      |
|----|------------------------|-----|-----|-----|-----|-----------|-----------|----------------|----------------|
{{#focus.classe.studenti.elenco}}
| {{@number}} | {{nomeCompleto}} | {{#isBes}}X{{/isBes}} | {{#isDsa}}X{{/isDsa}} | {{#isPei}}X{{/isPei}} | {{#isPfp}}X{{/isPfp}} | {{#isStranieri}}X{{/isStranieri}} | {{#isRipetente}}X{{/isRipetente}} | {{^presenza.annoPrecedente.isPresente}}X{{/presenza.annoPrecedente.isPresente}} | {{religioneLabel}} |
{{/focus.classe.studenti.elenco}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RIEPILOGO NUMERICO

- Totale studenti: {{focus.classe.studenti.statistiche.totale}}
- Ripetenti: {{focus.classe.studenti.statistiche.ripetenti}}
- Con BES: {{focus.classe.studenti.statistiche.conBes}}
- Con DSA: {{focus.classe.studenti.statistiche.conDsa}}
- Con piani (PEI/PFP): {{focus.classe.studenti.statistiche.conPiani}}
- Rappresentanti: {{focus.classe.studenti.statistiche.rappresentanti}}
- Stranieri: {{focus.classe.studenti.perStato.numeroStranieri}}
- Scelta religione: IRC {{focus.classe.studenti.perReligione.numeroIrc}} · ALT {{focus.classe.studenti.perReligione.numeroAlt}} · Senza religione {{focus.classe.studenti.perReligione.numeroNo}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verificare i dati sopra riportati. In caso di errori o omissioni, comunicarli all'animatore digitale.
```

### Note sulla struttura

- **GENERATORE = CLASSE**: il sistema itera su ogni classe attiva e genera un documento per ciascuna.
- **Colonne flag (BES, DSA, PEI, PFP, Straniero, Ripetente, Nuovo ingresso)**: la cella contiene `X` se il flag e' vero, altrimenti resta vuota. Il rendering usa i blocchi sezione di Mustache (`{{#isX}}X{{/isX}}`), che non producono output quando il flag e' falso.
- **"Nuovo ingresso"**: non e' un campo del CDU, viene derivato da `presenza.annoPrecedente.isPresente`: la cella contiene `X` se `false` (studente non iscritto l'anno precedente). Il rendering usa la sezione invertita (`{{^presenza.annoPrecedente.isPresente}}X{{/presenza.annoPrecedente.isPresente}}`).
- **Materie assegnate** usa `materieDescrizione` (nomi completi separati da virgola, es. `Matematica, Fisica`), gia' calcolato dal CDU.

---

## 2. CONF_DOC — Record di configurazione

Inserire nella tabella `CONF_DOC` il seguente record:

| Campo                  | Valore
|------------------------|-------
| `ID`                   | `RIEPILOGO_CLASSE_INIZIO_ANNO`
| `TIPO`                 | `RIEPILOGO_CLASSE`
| `GENERATORE`           | `CLASSE`
| `FORMATO`              | `GDOC`
| `DUPLICAZIONE`         | `NEGATA`
| `GESTIONE_ARTICOLAZIONE` | `COMPLETA`
| `PATH_OUT`             | `Riepilogo_inizio_anno/{{focus.classe.anno}}`
| `FILE_NAME`            | `Riepilogo_{{focus.classe.nome}}_{{meta.oggi.breve}}`
| `MODELLI`              | `{"templateId":"<ID_DEL_TEMPLATE_DRIVE>"}`
| `PERMESSI`             | `null`
| `PARAMETRI`            | `null`
| `CONDIZIONE`           | `null`
| `POST_PROCESSO`        | `null`
| `REGISTRA_DOC`         | `{"classi":"{{focus.classe.nome}}","utenti":"","materie":""}`
| `REGISTRA_FOLD`        | `{}`

### Spiegazione dei campi chiave

- **`GENERATORE: CLASSE`** — il batch itera una volta per ogni classe attiva. Il CDU sara' popolato con `focus.classe` contenente consiglio, studenti, materie, ecc.
- **`FORMATO: GDOC`** — genera un Google Doc. La strategia selezionata sara' `DocumentoGenericoGeneratorStrategy` (nessun flag PARAMETRI speciale).
- **`DUPLICAZIONE: NEGATA`** — impedisce la rigenerazione se esiste gia' un documento con lo stesso ID per la classe. Utile per evitare duplicati accidentali.
- **`PATH_OUT`** — cartella di destinazione. `{{focus.classe.anno}}` crea una sottocartella per anno di corso (1/, 2/, ...).
- **`FILE_NAME`** — nome file. `{{meta.oggi.breve}}` inserisce la data odierna in formato breve (es. `03-09-2026`) per rendere unico il nome.
- **`REGISTRA_DOC`** — registra il documento nel log con la classe associata, senza utenti specifici ne' materie (non e' un documento per singolo studente o docente).
- **`MODELLI`** — sostituire `<ID_DEL_TEMPLATE_DRIVE>` con l'ID del Google Doc template creato al punto 1. L'ID si trova nell'URL del documento: `https://docs.google.com/document/d/<TEMPLATE_ID>/edit`.

### JSON da inserire come riga

```json
{
  "ID": "RIEPILOGO_CLASSE_INIZIO_ANNO",
  "TIPO": "RIEPILOGO_CLASSE",
  "GENERATORE": "CLASSE",
  "FORMATO": "GDOC",
  "DUPLICAZIONE": "NEGATA",
  "GESTIONE_ARTICOLAZIONE": "COMPLETA",
  "PATH_OUT": "Riepilogo_inizio_anno/{{focus.classe.anno}}",
  "FILE_NAME": "Riepilogo_{{focus.classe.nome}}_{{meta.oggi.breve}}",
  "MODELLI": "{\"templateId\":\"<ID_DEL_TEMPLATE_DRIVE>\"}",
  "PERMESSI": "",
  "PARAMETRI": "",
  "CONDIZIONE": "",
  "POST_PROCESSO": null,
  "REGISTRA_DOC": "{\"classi\":\"{{focus.classe.nome}}\",\"utenti\":\"\",\"materie\":\"\"}",
  "REGISTRA_FOLD": "{}"
}
```

---

## 3. CONF_MAIL — Record di configurazione email

Inserire nella tabella `CONF_MAIL` il seguente record:

| Campo                  | Valore
|------------------------|-------
| `ID`                   | `MAIL_RIEPILOGO_INIZIO_ANNO`
| `OGGETTO`              | `[Verifica] Riepilogo classe {{focus.classe.nome}} — inizio anno`
| `PROCESSO`             | `PER_COORDINATORE`
| `BOX_CFG`              | *(vedi sotto)*
| `TESTO_START`          | *(vedi sotto)*
| `TESTO_END`            | *(vedi sotto)*
| `RISPONDI_A`           | ``
| `SUPPLENTI`            | `SOLO_TITOLARI`
| `NOREPLY`              | `false`
| `COLORE_HEADER`        | `#1565C0`
| `CONDIZIONE`           | ``
| `POST_PROCESSO`        | `null`
| `ALLEGATI_STATICI`     | `[]`
| `GESTIONE_ARTICOLAZIONE` | `COMPLETA`
| `DUPLICAZIONE`         | `NEGATA`

### BOX_CFG

```json
[
  {
    "TIPO_BOX": "documenti",
    "DATI_SORGENTE": {
      "metodo": "documentiPerClasse",
      "filtri": {
        "tipo": "RIEPILOGO_CLASSE"
      }
    }
  }
]
```

Il box `documenti` con metodo `documentiPerClasse` e filtro `tipo: RIEPILOGO_CLASSE` allega al corpo dell'email tutti i documenti di tipo `RIEPILOGO_CLASSE` generati per la classe del coordinatore. Il sistema risolve automaticamente il LOG_DOCS popolato dal `REGISTRA_DOC` della CONF_DOC.

### TESTO_START

```html
<p>Gentile {{destinatario.comunicazione.salutoIniziale}},</p>
<p>in allegato il riepilogo della classe {{focus.classe.nome}} generato all'inizio dell'anno scolastico.</p>
<p>Il documento contiene:</p>
<ul>
  <li>Composizione attuale del consiglio di classe con materie assegnate</li>
  <li>Elenco studenti con flag BES, DSA, PEI, PFP, Straniero, Ripetente e scelta religione</li>
  <li>Statistiche generali della classe</li>
</ul>
<p><strong>Si prega di verificare i dati riportati e, in caso di errori o omissioni, comunicarli all'animatore digitale.</strong></p>
```

### TESTO_END

```html
<p>Qualora i dati non fossero corretti, si prega di rispondere a questa email indicando le correzioni da effettuare.</p>
<p>Cordiali saluti,<br>Il sistema SGSA</p>
```

### JSON da inserire come riga

```json
{
  "ID": "MAIL_RIEPILOGO_INIZIO_ANNO",
  "OGGETTO": "[Verifica] Riepilogo classe {{focus.classe.nome}} — inizio anno",
  "PROCESSO": "PER_COORDINATORE",
  "BOX_CFG": "[{\"TIPO_BOX\":\"documenti\",\"DATI_SORGENTE\":{\"metodo\":\"documentiPerClasse\",\"filtri\":{\"tipo\":\"RIEPILOGO_CLASSE\"}}}]",
  "TESTO_START": "<p>Gentile {{destinatario.comunicazione.salutoIniziale}},</p><p>in allegato il riepilogo della classe {{focus.classe.nome}} generato all'inizio dell'anno scolastico.</p><p>Il documento contiene:</p><ul><li>Composizione attuale del consiglio di classe</li><li>Elenco studenti con stato (ripetente / nuovo ingresso) e scelta religione</li><li>Flag BES, DSA, PEI, PFP per ciascuno studente</li></ul><p><strong>Si prega di verificare i dati riportati e, in caso di errori o omissioni, comunicarli all'animatore digitale.</strong></p>",
  "TESTO_END": "<p>Qualora i dati non fossero corretti, si prega di rispondere a questa email indicando le correzioni da effettuare.</p><p>Cordiali saluti,<br>Il sistema SGSA</p>",
  "RISPONDI_A": "",
  "SUPPLENTI": "SOLO_TITOLARI",
  "NOREPLY": false,
  "COLORE_HEADER": "#1565C0",
  "CONDIZIONE": "",
  "POST_PROCESSO": null,
  "ALLEGATI_STATICI": "[]",
  "GESTIONE_ARTICOLAZIONE": "COMPLETA",
  "DUPLICAZIONE": "NEGATA"
}
```

### Spiegazione dei campi chiave

- **`PROCESSO: PER_COORDINATORE`** — itera sui coordinatori di ogni classe. Per ogni coordinatore risolve il CDU con `destinatario` popolato (incluso `destinatario.isCoordinatore = true` e `destinatario.classi.elenco` con le classi coordinate). Un coordinatore con 2 classi riceve 2 email, ciascuna con il riepilogo della classe pertinente.
- **`SUPPLENTI: SOLO_TITOLARI`** — l'email viene inviata solo ai titolari, non ai supplenti temporanei. Un coordinatore supplente non riceve la notifica.
- **`NOREPLY: false`** — il coordinatore puo' rispondere all'email per segnalare errori.
- **`DUPLICAZIONE: NEGATA`** — evita invii multipli della stessa email alla stessa classe.
- **`GESTIONE_ARTICOLAZIONE: COMPLETA`** — esclude le classi partner dal BATCH; il riepilogo e' per la classe parent.
- **`COLORE_HEADER: #1565C0`** — blu scuro nell'header HTML dell'email (consistente con le comunicazioni istituzionali).

---

## 4. Sequenza di generazione

```
1. Inserire il record CONF_DOC
2. Creare il Google Doc template con i placeholder Mustache
3. Copiare l'ID del template nel campo MODELLI della CONF_DOC
4. Inserire il record CONF_MAIL
5. Eseguire la generazione documentale (batch CLASSE)
   → per ogni classe attiva viene generato un Google Doc "Riepilogo_<classe>_<data>"
6. Eseguire l'invio email (batch PER_COORDINATORE)
   → per ogni coordinatore viene inviata un'email con in allegato il riepilogo della classe
```

---

## 5. Placeholder CDU disponibili di riferimento

### Classe

| Placeholder | Tipo | Descrizione |
|-------------|------|-------------|
| `{{focus.classe.nome}}` | string | Nome completo classe (es. `5ALC`) |
| `{{focus.classe.anno}}` | number | Anno di corso (1-5) |
| `{{focus.classe.sezione}}` | string | Lettera sezione |

### Consiglio di classe

| Placeholder | Tipo | Descrizione |
|-------------|------|-------------|
| `{{focus.classe.consiglio.elenco}}` | array | Itera sui docenti effettivi |
| `{{appellativoCompleto}}` | string | Es. `Prof. ROSSI MARIO` |
| `{{materieDescrizione}}` | string | Materie insegnate, es. `Matematica, Fisica` |
| `{{ruoliDescrizioneTesto}}` | string | Ruoli, es. `Coordinatore, Tutor ASL/FSL` |
| `{{isCoordinatore}}` | boolean | true se coordinatore |
| `{{isTutor}}` | boolean | true se tutor (ASL o orientamento) |
| `{{isSupplente}}` | boolean | true se supplente |
| `{{focus.classe.tutor.elencoDescrizione}}` | string | Tutor elencati |

### Studenti

| Placeholder | Tipo | Descrizione |
|-------------|------|-------------|
| `{{focus.classe.studenti.elenco}}` | array | Itera sugli studenti attivi |
| `{{focus.classe.studenti.numero}}` | number | Numero totale studenti |
| `{{nomeCompleto}}` | string | Nome e cognome |
| `{{isRipetente}}` | boolean | true se ripetente |
| `{{isStranieri}}` | boolean | true se studente straniero |
| `{{religioneLabel}}` | string | IRC / ALT / Senza religione |
| `{{isBes}}` | boolean | Bisogno Educativo Speciale |
| `{{isDsa}}` | boolean | Disturbo Specifico Apprendimento |
| `{{isPei}}` | boolean | Piano Educativo Individualizzato |
| `{{isPfp}}` | boolean | Piano Formativo Personalizzato |
| `{{presenza.annoPrecedente.isPresente}}` | boolean | false = nuovo ingresso |
| `{{presenza.hasCambiatoClasse}}` | boolean | true = provenienza da altra classe |

### Statistiche

| Placeholder | Tipo | Descrizione |
|-------------|------|-------------|
| `{{focus.classe.studenti.statistiche.totale}}` | number | Totale |
| `{{focus.classe.studenti.statistiche.ripetenti}}` | number | Ripetenti |
| `{{focus.classe.studenti.statistiche.conBes}}` | number | Con BES |
| `{{focus.classe.studenti.statistiche.conDsa}}` | number | Con DSA |
| `{{focus.classe.studenti.statistiche.conPiani}}` | number | Con piani personalizzati |
| `{{focus.classe.studenti.statistiche.rappresentanti}}` | number | Rappresentanti |
| `{{focus.classe.studenti.perStato.numeroStranieri}}` | number | Studenti stranieri |

### Religione (partizioni)

| Placeholder | Tipo | Descrizione |
|-------------|------|-------------|
| `{{focus.classe.studenti.perReligione.ircDescrizione}}` | string | Nomi studenti IRC |
| `{{focus.classe.studenti.perReligione.altDescrizione}}` | string | Nomi studenti ALT |
| `{{focus.classe.studenti.perReligione.noDescrizione}}` | string | Nomi studenti senza religione |
| `{{focus.classe.studenti.perReligione.numeroIrc}}` | number | Numero studenti IRC |
| `{{focus.classe.studenti.perReligione.numeroAlt}}` | number | Numero studenti ALT |
| `{{focus.classe.studenti.perReligione.numeroNo}}` | number | Numero studenti senza religione |
