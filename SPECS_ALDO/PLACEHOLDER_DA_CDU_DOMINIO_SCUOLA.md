# Placeholder dal CDU — dominio scolastico

Guida operativa per scrivere placeholder di ALDO per documenti Google Docs,
fogli Google Sheets, email e testi brevi. I percorsi e i comportamenti qui
descritti derivano da 02_CDU_STRUTTURA.md e la sintassi da
WorkspaceTemplateEngine di GasLibraryFactory.

Tutti i nomi, indirizzi, email, giudizi e dati di esempio sono fittizi.

## 1. Regole essenziali

Il CDU è il contratto del template: un template legge valori già preparati,
non ricostruisce regole di dominio. In particolare:

- usare il solo percorso canonico indicato;
- non filtrare studenti, docenti, materie o piani nel template: usare la
  partizione CDU già predisposta;
- non ordinare il dato di dominio nel template: le collezioni CDU sono già
  ordinate in modo deterministico;
- usare i campi Descrizione, Label e nomeCompleto quando esistono, invece di
  comporre testo con più campi;
- usare hasElenco prima di stampare una collezione opzionale;
- non stampare email, note, BES/DSA/PEI o piani in output non autorizzati.

La forma ordinaria è:

```
{{focus.classe.nome}}
```

Le sezioni iterano un array o mostrano testo condizionale:

```
{{#focus.classe.studenti.hasElenco}}
  ... contenuto se presente ...
{{/focus.classe.studenti.hasElenco}}
{{^focus.classe.studenti.hasElenco}}
  Nessuno studente attivo.
{{/focus.classe.studenti.hasElenco}}
```

Nel ciclo corrente sono disponibili @index (da 0), @number (da 1), @first,
@last, @odd, @even e @total. @key vale per l'iterazione di un oggetto.

### CDU fittizio comune agli esempi

Gli esempi successivi presuppongono una classe 3A INF dell'anno 2026-2027:

```
focus:
  classe:
    nome: 3A INF
    anno: 3
    indirizzo:
      nome: Informatica e telecomunicazioni
      nomeSintetico: Informatica
    coordinatori:
      elencoDescrizione: Prof.ssa BIANCHI ANNA e prof. ROSSI MARIO
      descrizioneRuolo: I coordinatori prof.ssa BIANCHI ANNA e prof. ROSSI MARIO
    consiglio:
      numero: 5
      elencoDescrizione: Prof.ssa BIANCHI ANNA, prof. FERRI LUCIA, prof. NERI PAOLO, prof. ROSSI MARIO e prof.ssa VERDI ELENA
      elenco:
        - nomeCompleto: BIANCHI ANNA
          appellativoCompleto: Prof.ssa BIANCHI ANNA
          cognome: BIANCHI
          materieDescrizione: Lingua inglese
          ruoliDescrizioneTesto: Coordinatrice
        - nomeCompleto: FERRI LUCIA
          appellativoCompleto: Prof.ssa FERRI LUCIA
          cognome: FERRI
          materieDescrizione: Lingua e letteratura italiana, Storia
          ruoliDescrizioneTesto: ''
        - nomeCompleto: NERI PAOLO
          appellativoCompleto: Prof. NERI PAOLO
          cognome: NERI
          materieDescrizione: Fisica
          ruoliDescrizioneTesto: ''
        - nomeCompleto: ROSSI MARIO
          appellativoCompleto: Prof. ROSSI MARIO
          cognome: ROSSI
          materieDescrizione: Matematica
          ruoliDescrizioneTesto: Tutor ASL/FSL
        - nomeCompleto: VERDI ELENA
          appellativoCompleto: Prof.ssa VERDI ELENA
          cognome: VERDI
          materieDescrizione: Informatica
          ruoliDescrizioneTesto: ''
```

Il CDU deve consegnare il consiglio già raggruppato per persona e in ordine
alfabetico per descrizione primaria. Poiché nomeCompleto è nella forma
COGNOME NOME, l'ordine risulta per cognome.

## 2. Consiglio di classe: docenti raggruppati per persona

Percorso: focus.classe.consiglio.elenco. Ogni DocenteCdcVM è una persona e
contiene tutte le materie assegnate nella proprietà materie. Non iterare prima
le materie per ricostruire questo prospetto: duplicheresti docenti
plurimateria.

### Stringa compatta già pronta

Template:

```
Docenti del consiglio di classe: {{focus.classe.consiglio.elencoDescrizione}}.
```

Rendering:

> Docenti del consiglio di classe: Prof.ssa BIANCHI ANNA, prof.ssa FERRI
> LUCIA, prof. NERI PAOLO, prof. ROSSI MARIO e prof.ssa VERDI ELENA.

Per la formula con articoli usare elencoDescrizioneEstesa.

### Elenco testuale persona → materie

Template:

```
{{#focus.classe.consiglio.hasElenco}}
Consiglio della {{focus.classe.nome}}:
{{#focus.classe.consiglio.elenco}}
{{@number}}. {{appellativoCompleto}} — {{materieDescrizione}}{{#ruoliDescrizioneTesto}} ({{ruoliDescrizioneTesto}}){{/ruoliDescrizioneTesto}}
{{/focus.classe.consiglio.elenco}}
{{/focus.classe.consiglio.hasElenco}}
{{^focus.classe.consiglio.hasElenco}}
Nessun docente effettivo risolto alla data di riferimento.
{{/focus.classe.consiglio.hasElenco}}
```

Rendering:

> Consiglio della 3A INF:
>
> 1. Prof.ssa BIANCHI ANNA — Lingua inglese (Coordinatrice)
> 2. Prof.ssa FERRI LUCIA — Lingua e letteratura italiana, Storia
> 3. Prof. NERI PAOLO — Fisica
> 4. Prof. ROSSI MARIO — Matematica (Tutor ASL/FSL)
> 5. Prof.ssa VERDI ELENA — Informatica

### Tabella dinamica in Google Docs

Creare una tabella con una sola riga modello. Nelle sue cinque celle inserire:

```
{{#tablerow_loop:focus.classe.consiglio.elenco}}{{@number}},{{appellativoCompleto}},{{materieDescrizione}},{{ruoliDescrizioneTesto | default:'—'}},{{#isSupplente}}Sì{{#hasSostituisce}} (sos. {{sostituisce.nomeCompleto}}){{/hasSostituisce}}{{/isSupplente}}{{^isSupplente}}No{{/isSupplente}}
```

Rendering:

|  N. | Docente               | Materie                               | Incarichi     | Supplente |
| --: | --------------------- | ------------------------------------- | ------------- | --------- |
|   1 | Prof.ssa BIANCHI ANNA | Lingua inglese                        | Coordinatrice | No        |
|   2 | Prof.ssa FERRI LUCIA  | Lingua e letteratura italiana, Storia | —             | No        |
|   3 | Prof. NERI PAOLO      | Fisica                                | —             | No        |
|   4 | Prof. ROSSI MARIO     | Matematica                            | Tutor ASL/FSL | No        |
|   5 | Prof.ssa VERDI ELENA  | Informatica                           | —             | No        |

### Titolari, docenti effettivi e supplenze

Elenco e titolari non sono intercambiabili:

- focus.classe.consiglio.elenco: docenti effettivamente in servizio alla data;
- focus.classe.consiglio.titolari: titolari permanenti, senza la supplenza
  temporanea;
- focus.classe.consiglio.supplenze: sostituzioni aggregate e attive.

Template per dichiarare una supplenza:

```
{{#focus.classe.consiglio.hasSupplenze}}
Supplenze attive:
{{#focus.classe.consiglio.supplenze}}
- {{supplente.appellativoCompleto}} sostituisce {{titolare.appellativoCompleto}} per {{materieDescrizione}}.
{{/focus.classe.consiglio.supplenze}}
{{/focus.classe.consiglio.hasSupplenze}}
```

Rendering fittizio:

> Supplenze attive:
>
> - Prof. CONTI LUCA sostituisce prof. NERI PAOLO per Fisica.

## 3. Materie della classe e docenti associati

Percorso: focus.classe.materie.elenco. L'ordine canonico è per nome della
materia; ciascuna MateriaVM, quando richiesta con profilo CON_DOCENTI, espone
docenti, hasDocenti e docentiDescrizione.

### Stringa delle materie

Template:

```
La classe {{focus.classe.nome}} svolge {{focus.classe.materie.numero}} {{focus.classe.materie.numero | pluralize:'materia':'materie'}}: {{focus.classe.materie.elencoDescrizione}}.
```

Rendering:

> La classe 3A INF svolge 5 materie: Fisica, Informatica, Lingua e letteratura
> italiana, Lingua inglese, Matematica.

### Elenco materia → docenti

Template:

```
{{#focus.classe.materie.elenco}}
- {{nome}} ({{sigla}}): {{docentiDescrizione}}
{{/focus.classe.materie.elenco}}
```

Rendering:

> - Fisica (FIS): Prof. NERI PAOLO
> - Informatica (INF): Prof.ssa VERDI ELENA
> - Lingua e letteratura italiana (ITA): Prof.ssa FERRI LUCIA
> - Lingua inglese (ING): Prof.ssa BIANCHI ANNA
> - Matematica (MAT): Prof. ROSSI MARIO

### Tabella dinamica materia → docenti

Riga modello Google Docs:

```
{{#tablerow_loop:focus.classe.materie.elenco}}{{@number}},{{sigla}},{{nome}},{{docentiDescrizione | default:'Docente non assegnato'}},{{#hasCattedraItp}}Sì{{/hasCattedraItp}}{{^hasCattedraItp}}No{{/hasCattedraItp}}
```

Rendering:

|  N. | Sigla | Materia                       | Docente/i             | Cattedra ITP |
| --: | ----- | ----------------------------- | --------------------- | ------------ |
|   1 | FIS   | Fisica                        | Prof. NERI PAOLO      | No           |
|   2 | INF   | Informatica                   | Prof.ssa VERDI ELENA  | No           |
|   3 | ITA   | Lingua e letteratura italiana | Prof.ssa FERRI LUCIA  | No           |
|   4 | ING   | Lingua inglese                | Prof.ssa BIANCHI ANNA | No           |
|   5 | MAT   | Matematica                    | Prof. ROSSI MARIO     | No           |

Per una materia con più docenti usare docentiDescrizione, non una concatenazione
manuale: il CDU gestisce appellativi, articoli e genere.

## 4. Studenti: anagrafica, religione, piani, BES e presenza

Percorso: focus.classe.studenti.elenco. Ogni riga è un AlunnoVM
autosufficiente e, in una classe articolata, contiene la classe partner
effettivamente frequentata.

### Tabella completa del roster

Riga modello Google Docs:

```
{{#tablerow_loop:focus.classe.studenti.elenco}}{{@number}},{{nomeCompleto}},{{classe.nome}},{{religioneLabel}},{{piani.elencoDescrizione | default:'Nessun piano'}},{{#isBes}}Sì{{/isBes}}{{^isBes}}No{{/isBes}},{{#isDsa}}Sì{{/isDsa}}{{^isDsa}}No{{/isDsa}},{{#isRipetente}}Sì{{/isRipetente}}{{^isRipetente}}No{{/isRipetente}},{{#presenza.annoPrecedente.isCalcolato}}{{#presenza.annoPrecedente.isPresente}}Sì{{/presenza.annoPrecedente.isPresente}}{{^presenza.annoPrecedente.isPresente}}No{{/presenza.annoPrecedente.isPresente}}{{/presenza.annoPrecedente.isCalcolato}}{{^presenza.annoPrecedente.isCalcolato}}Non calcolato{{/presenza.annoPrecedente.isCalcolato}}
```

Rendering fittizio:

|  N. | Studente        | Classe | Religione                              | Piani                                  | BES | DSA | Ripetente | Iscritto l'anno precedente |
| --: | --------------- | ------ | -------------------------------------- | -------------------------------------- | --- | --- | --------- | -------------------------- |
|   1 | BIANCHI SOFIA   | 3A INF | Insegnamento della religione cattolica | Nessun piano                           | No  | No  | No        | Sì                         |
|   2 | CONTI MARCO     | 3A INF | Attività alternativa                   | Piano didattico personalizzato per DSA | Sì  | Sì  | No        | Sì                         |
|   3 | ESPOSITO GIULIA | 3A INF | Non si avvale                          | Piano educativo individualizzato       | Sì  | No  | No        | No                         |
|   4 | ROMANO ANDREA   | 3A INF | Insegnamento della religione cattolica | Piano formativo personalizzato         | No  | No  | Sì        | Sì                         |

Nella tabella precedente i dati BES, DSA, piani e presenza sono sensibili:
usarla soltanto in documenti con destinatari autorizzati.

### Stringa sullo stato di un singolo alunno

Questo è adatto a una recipe con focus.alunno:

```
{{focus.alunno.nomeCompleto}} frequenta la {{focus.alunno.classe.nome}}, {{focus.alunno.religioneLabel | lowercase}}, e {{focus.alunno.isRipetente | yesNo:'è ripetente':'non è ripetente'}}.
```

Rendering:

> CONTI MARCO frequenta la 3A INF, attività alternativa, e non è ripetente.

### Elenco per scelta religiosa

Usare le partizioni, non where sul roster:

```
{{#focus.classe.studenti.perReligione.elenco}}
{{label}} ({{numero}}): {{alunni | map:'nomeCompleto' | join:', ' | default:'nessuno'}}.
{{/focus.classe.studenti.perReligione.elenco}}
```

Rendering:

> IRC (2): BIANCHI SOFIA, ROMANO ANDREA.
> Attività alternativa: CONTI MARCO.
> Non si avvalgono: ESPOSITO GIULIA.

La forma esplicita IRC, ALT e NO resta disponibile quando servono tre testi
fissi, ma non contiene un conteggio dedicato:

```
IRC: {{focus.classe.studenti.perReligione.ircDescrizione | default:'nessuno'}}.
Attività alternativa: {{focus.classe.studenti.perReligione.altDescrizione | default:'nessuno'}}.
Non si avvalgono: {{focus.classe.studenti.perReligione.noDescrizione | default:'nessuno'}}.
```

## 5. Ripetenti, piani e BES

### Stringa dei ripetenti

Percorso: focus.classe.studenti.perStato.ripetenti.

```
{{#focus.classe.studenti.perStato.hasRipetenti}}
Studenti ripetenti ({{focus.classe.studenti.perStato.ripetenti.length}}): {{focus.classe.studenti.perStato.ripetenti | map:'nomeCompleto' | join:', '}}.
{{/focus.classe.studenti.perStato.hasRipetenti}}
{{^focus.classe.studenti.perStato.hasRipetenti}}
Non risultano studenti ripetenti.
{{/focus.classe.studenti.perStato.hasRipetenti}}
```

Rendering:

> Studenti ripetenti (1): ROMANO ANDREA.

Il CDU non dichiara un campo numero per ciascuna partizione perStato; quando
serve il conteggio, usare length sull'array o statistiche.ripetenti.

### Tabelle per BES, DSA, PEI e PFP

Usare una riga modello distinta e un documento con accesso ristretto:

```
{{#tablerow_loop:focus.classe.studenti.perStato.bes}}{{@number}},{{nomeCompleto}},{{piani.elencoDescrizione}},{{#isDsa}}DSA{{/isDsa}}{{^isDsa}}—{{/isDsa}},{{#isRipetente}}Sì{{/isRipetente}}{{^isRipetente}}No{{/isRipetente}}
```

Rendering:

|  N. | Studente        | Piani                                  | DSA | Ripetente |
| --: | --------------- | -------------------------------------- | --- | --------- |
|   1 | CONTI MARCO     | Piano didattico personalizzato per DSA | DSA | No        |
|   2 | ESPOSITO GIULIA | Piano educativo individualizzato       | —   | No        |

Le partizioni disponibili sono bes, dsa, pfp, pei, ripetenti,
rappresentanti e conPiani. Per esempio:

```
{{#focus.classe.studenti.perStato.hasPei}}
Studenti con PEI: {{focus.classe.studenti.perStato.pei | map:'nomeCompleto' | join:', '}}.
{{/focus.classe.studenti.perStato.hasPei}}
```

### Piani non verbalizzati: STUDENTE — TIPO

Percorso: focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco. Nella vista
di classe ogni PianoPersonalizzatoVM contiene studente.

```
{{#focus.classe.pianiPersonalizzati.nonVerbalizzati.hasElenco}}
Piani da verbalizzare:
{{#focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco}}
{{studente.nomeCompleto}} — {{tipoLabel}}{{^@last}}; {{/@last}}
{{/focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco}}.
{{/focus.classe.pianiPersonalizzati.nonVerbalizzati.hasElenco}}
{{^focus.classe.pianiPersonalizzati.nonVerbalizzati.hasElenco}}
Tutti i piani generati risultano verbalizzati.
{{/focus.classe.pianiPersonalizzati.nonVerbalizzati.hasElenco}}
```

Rendering:

> Piani da verbalizzare:
> CONTI MARCO — Piano didattico personalizzato per DSA; ESPOSITO GIULIA —
> Piano educativo individualizzato.

Tabella:

```
{{#tablerow_loop:focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco}}{{@number}},{{studente.nomeCompleto}},{{tipoLabel}},{{statoLabel}},{{dataCreazioneBreve}}
```

Rendering:

|  N. | Studente        | Tipo di piano                          | Stato        | Creato il  |
| --: | --------------- | -------------------------------------- | ------------ | ---------- |
|   1 | CONTI MARCO     | Piano didattico personalizzato per DSA | Generato     | 03/09/2026 |
|   2 | ESPOSITO GIULIA | Piano educativo individualizzato       | In revisione | 05/09/2026 |

## 6. Rappresentanti di studenti e genitori

I rappresentanti studenti sono in
focus.classe.rappresentanti.studenti.elenco; i genitori rappresentanti sono
nomi liberi, non docenti o indirizzi email, e sono in
focus.classe.rappresentanti.genitori.elenco.

### Tabella unificata

Per Google Docs usare due sezioni e due righe modello, oppure una tabella con
righe fisse di intestazione separate.

Studenti:

```
{{#tablerow_loop:focus.classe.rappresentanti.studenti.elenco}}Studente,{{studente.nomeCompleto}},{{#hasIndirizzo}}{{indirizzo.nomeSintetico}}{{/hasIndirizzo}}{{^hasIndirizzo}}—{{/hasIndirizzo}}
```

Genitori:

```
{{#tablerow_loop:focus.classe.rappresentanti.genitori.elenco}}Genitore,{{nomeCompleto}},{{studente.nomeCompleto}} (figlio/a)
```

Rendering:

| Categoria | Rappresentante | Riferimento              |
| --------- | -------------- | ------------------------ |
| Studente  | BIANCHI SOFIA  | Informatica              |
| Studente  | ROMANO ANDREA  | Informatica              |
| Genitore  | Marta Bianchi  | BIANCHI SOFIA (figlio/a) |
| Genitore  | Paolo Romano   | ROMANO ANDREA (figlio/a) |

Stringhe già pronte:

```
Rappresentanti degli studenti: {{focus.classe.rappresentanti.studenti.elencoDescrizione | default:'non eletti'}}.
Rappresentanti dei genitori: {{focus.classe.rappresentanti.genitori.elenco | map:'descrizione' | join:'; ' | default:'non comunicati'}}.
```

Rendering:

> Rappresentanti degli studenti: BIANCHI SOFIA, ROMANO ANDREA.
> Rappresentanti dei genitori: Marta Bianchi (genitore di BIANCHI SOFIA);
> Paolo Romano (genitore di ROMANO ANDREA).

## 7. Statistiche e movimenti della classe

### Statistiche del roster

Percorso: focus.classe.studenti.statistiche.

```
La {{focus.classe.nome}} conta {{focus.classe.studenti.statistiche.totale}} {{focus.classe.studenti.statistiche.totale | pluralize:'studente':'studenti'}}, di cui {{focus.classe.studenti.statistiche.conPiani}} con piani personalizzati, {{focus.classe.studenti.statistiche.conBes}} con stato BES, {{focus.classe.studenti.statistiche.conDsa}} DSA, {{focus.classe.studenti.statistiche.ripetenti}} ripetenti e {{focus.classe.studenti.statistiche.rappresentanti}} rappresentanti degli studenti.
```

Rendering:

> La 3A INF conta 4 studenti, di cui 3 con piani personalizzati, 2 con stato
> BES, 1 DSA, 1 ripetenti e 2 rappresentanti degli studenti.

Tabella:

| Indicatore      | Placeholder                                          |
| --------------- | ---------------------------------------------------- |
| Studenti totali | {{focus.classe.studenti.statistiche.totale}}         |
| Con piani       | {{focus.classe.studenti.statistiche.conPiani}}       |
| BES             | {{focus.classe.studenti.statistiche.conBes}}         |
| DSA             | {{focus.classe.studenti.statistiche.conDsa}}         |
| Ripetenti       | {{focus.classe.studenti.statistiche.ripetenti}}      |
| Rappresentanti  | {{focus.classe.studenti.statistiche.rappresentanti}} |

Rendering:

| Indicatore      | Valore |
| --------------- | -----: |
| Studenti totali |      4 |
| Con piani       |      3 |
| BES             |      2 |
| DSA             |      1 |
| Ripetenti       |      1 |
| Rappresentanti  |      2 |

### Movimenti

Usare movimenti.entrate, movimenti.uscite e movimenti.interni, già
precalcolati rispetto allo scope della classe. Non dedurre il verso dalla
provenienza/destinazione nel template.

```
Nel periodo considerato: {{focus.classe.movimenti.numeroEntrate}} {{focus.classe.movimenti.numeroEntrate | pluralize:'ingresso':'ingressi'}}, {{focus.classe.movimenti.numeroUscite}} {{focus.classe.movimenti.numeroUscite | pluralize:'uscita':'uscite'}} e {{focus.classe.movimenti.numeroInterni}} {{focus.classe.movimenti.numeroInterni | pluralize:'movimento interno':'movimenti interni'}}.
```

Rendering:

> Nel periodo considerato: 1 ingresso, 0 uscite e 1 movimento interno.

### Ammissione e continuità di iscrizione

Il CDU non espone un singolo campo dataDiAmmissione. La continuità è descritta
da presenza e i dettagli dell'ammissione o trasferimento da movimenti. Per un
singolo studente:

```
{{focus.alunno.nomeCompleto}} era iscritto nell'anno precedente:
{{#focus.alunno.presenza.annoPrecedente.isCalcolato}}
{{focus.alunno.presenza.annoPrecedente.isPresente | yesNo:'sì':'no'}}.
{{/focus.alunno.presenza.annoPrecedente.isCalcolato}}
{{^focus.alunno.presenza.annoPrecedente.isCalcolato}}
informazione non calcolata.
{{/focus.alunno.presenza.annoPrecedente.isCalcolato}}
Ha frequentato l'intero anno: {{focus.alunno.presenza.isPresenteTuttoAnno | yesNo:'sì':'no'}}.
{{#focus.alunno.movimenti.hasElenco}}
Movimenti: {{#focus.alunno.movimenti.elenco}}{{dataBreve}} — {{descrizione}}{{^@last}}; {{/@last}}{{/focus.alunno.movimenti.elenco}}.
{{/focus.alunno.movimenti.hasElenco}}
```

Rendering:

> ESPOSITO GIULIA era iscritto nell'anno precedente: no.
> Ha frequentato l'intero anno: no.
> Movimenti: 12/09/2026 — Trasferita dal Liceo Galilei alla 3A INF.

Tabella dei movimenti:

```
{{#tablerow_loop:focus.classe.movimenti.elenco}}{{dataBreve}},{{studente.nomeCompleto}},{{direzioneLabel}},{{descrizione}}
```

Rendering:

| Data       | Studente        | Direzione         | Descrizione                              |
| ---------- | --------------- | ----------------- | ---------------------------------------- |
| 12/09/2026 | ESPOSITO GIULIA | In entrata        | Trasferita dal Liceo Galilei alla 3A INF |
| 25/09/2026 | ROMANO ANDREA   | Movimento interno | Trasferito dalla 3B INF alla 3A INF      |

## 8. Carenze: studente, classe e docente

Ogni AlunnoVM ha carenze.elenco, ordinato per materia. La carenza contiene
materiaNome, materiaSigla, voto e descrizione già pronta.

### Carenze nel documento di un singolo studente

```
{{#focus.alunno.carenze.hasElenco}}
Carenze rilevate per {{focus.alunno.nomeCompleto}}: {{focus.alunno.carenze.elencoDescrizione}}.
{{/focus.alunno.carenze.hasElenco}}
{{^focus.alunno.carenze.hasElenco}}
Per {{focus.alunno.nomeCompleto}} non risultano carenze nel periodo considerato.
{{/focus.alunno.carenze.hasElenco}}
```

Rendering:

> Carenze rilevate per CONTI MARCO: Fisica: 5, Matematica: 4.

Tabella dello studente:

```
{{#tablerow_loop:focus.alunno.carenze.elenco}}{{@number}},{{materiaSigla}},{{materiaNome}},{{voto}}
```

Rendering:

|  N. | Sigla | Materia    | Valutazione |
| --: | ----- | ---------- | ----------- |
|   1 | FIS   | Fisica     | 5           |
|   2 | MAT   | Matematica | 4           |

### Registro di una rilevazione focalizzata

Il focus.carenza rappresenta metadati di una rilevazione; l'elenco delle
materie è nel nodo carenze dello studente adatto alla recipe.

```
Rilevazione n. {{focus.carenza.progressivo}} del {{focus.carenza.dataEstesa}}, relativa a {{focus.carenza.studente.nomeCompleto}} della classe {{focus.carenza.classe.nome}}.
Assenze rilevanti: {{focus.carenza.hasAssenze | yesNo:'sì':'no'}}.
Note: {{focus.carenza.note | default:'nessuna'}}.
```

Rendering:

> Rilevazione n. 2 del 15 novembre 2026, relativa a CONTI MARCO della classe
> 3A INF. Assenze rilevanti: sì. Note: recupero consigliato.

### Quadro carenze della classe

Il CDU non dichiara una partizione di classe per carenze. Per una tabella di
classe usare il roster e, per ogni riga, l'elenco già risolto dell'alunno.

```
{{#tablerow_loop:focus.classe.studenti.elenco}}{{nomeCompleto}},{{carenze.numero}},{{carenze.elencoDescrizione | default:'Nessuna carenza'}}
```

Rendering:

| Studente        | N. carenze | Dettaglio                  |
| --------------- | ---------: | -------------------------- |
| BIANCHI SOFIA   |          0 | Nessuna carenza            |
| CONTI MARCO     |          2 | Fisica: 5, Matematica: 4   |
| ESPOSITO GIULIA |          1 | Informatica: Insufficiente |
| ROMANO ANDREA   |          0 | Nessuna carenza            |

### Carenze per docente

Non esiste un nodo CDU canonico che attribuisca le carenze a un docente:
una carenza è associata a studente, classe e materia, non a una persona.
Per un prospetto per docente, il generatore deve preparare esplicitamente una
proiezione di dominio che incroci MateriaVM.docenti e CarenzaVM. Un template
non deve effettuare il join.

Un documento può comunque indicare il docente responsabile per la materia:

```
{{#focus.alunno.carenze.elenco}}
{{materiaNome}}: {{voto}} — docente: {{../focus.alunno.consiglio.materie | where:'sigla':materiaSigla | map:'docentiDescrizione' | join:', ' | default:'non risolto'}}
{{/focus.alunno.carenze.elenco}}
```

Questo ultimo esempio dimostra i filtri ma non è il percorso raccomandato:
la specifica CDU vieta di ricostruire join e filtri di dominio nel template.

## 9. Continuità didattica

La continuità è disponibile solo per MateriaVM con profilo CON_CONTINUITA:
focus.classe.materie.elenco[].continuita. La recipe deve richiedere il
profilo e lo storico necessario.

### Tabella di continuità del titolare e dell'ITP

Riga modello Google Docs:

```
{{#tablerow_loop:focus.classe.materie.elenco}}{{sigla}},{{nome}},{{docentiDescrizione}},{{#continuita.isContinuitaUltimiDueAnni}}Sì{{/continuita.isContinuitaUltimiDueAnni}}{{^continuita.isContinuitaUltimiDueAnni}}No{{/continuita.isContinuitaUltimiDueAnni}},{{#continuita.isContinuitaUltimiTreAnni}}Sì{{/continuita.isContinuitaUltimiTreAnni}}{{^continuita.isContinuitaUltimiTreAnni}}No{{/continuita.isContinuitaUltimiTreAnni}},{{#continuita.isContinuitaItpUltimiDueAnni}}Sì{{/continuita.isContinuitaItpUltimiDueAnni}}{{^continuita.isContinuitaItpUltimiDueAnni}}No{{/continuita.isContinuitaItpUltimiDueAnni}}
```

Rendering:

| Sigla | Materia                       | Docente corrente      | Continuità 2 anni | Continuità 3 anni | Continuità ITP 2 anni |
| ----- | ----------------------------- | --------------------- | ----------------- | ----------------- | --------------------- |
| FIS   | Fisica                        | Prof. NERI PAOLO      | No                | No                | No                    |
| INF   | Informatica                   | Prof.ssa VERDI ELENA  | Sì                | Sì                | No                    |
| ITA   | Lingua e letteratura italiana | Prof.ssa FERRI LUCIA  | Sì                | Sì                | No                    |
| ING   | Lingua inglese                | Prof.ssa BIANCHI ANNA | Sì                | No                | No                    |
| MAT   | Matematica                    | Prof. ROSSI MARIO     | Sì                | Sì                | No                    |

### Dettaglio anni precedenti

```
{{#focus.classe.materie.elenco}}
{{#continuita.hasAnniPrecedenti}}
{{nome}}:
{{#continuita.anniPrecedenti}}
- {{annoScolastico}} — titolare: {{#hasTitolare}}{{titolare.appellativoCompleto}}{{/hasTitolare}}{{^hasTitolare}}non ricostruito{{/hasTitolare}}; ITP: {{#hasItp}}{{itp.appellativoCompleto}}{{/hasItp}}{{^hasItp}}non presente{{/hasItp}}.
{{/continuita.anniPrecedenti}}
{{/continuita.hasAnniPrecedenti}}
{{/focus.classe.materie.elenco}}
```

Rendering fittizio:

> Matematica:
>
> - 2025-2026 — titolare: Prof. ROSSI MARIO; ITP: non presente.
> - 2024-2025 — titolare: Prof. ROSSI MARIO; ITP: non presente.

## 10. Dipartimenti disciplinari

Il nodo è presente soltanto per una recipe con asse DIPARTIMENTO:
focus.dipartimento. Non deriva dal consiglio di classe e non dispone delle
colonne-materia dinamiche dei fogli classe.

### Intestazione e responsabile

Template:

```
Dipartimento {{focus.dipartimento.nome}} ({{focus.dipartimento.id}})
Responsabile: {{#focus.dipartimento.hasCapo}}{{focus.dipartimento.capo.appellativoCompleto}}{{/focus.dipartimento.hasCapo}}{{^focus.dipartimento.hasCapo}}non assegnato{{/focus.dipartimento.hasCapo}}.
Materie afferenti ({{focus.dipartimento.numeroMaterie}}): {{focus.dipartimento.materieDescrizione}}.
Docenti afferenti ({{focus.dipartimento.numeroDocenti}}): {{focus.dipartimento.docentiDescrizione}}.
```

Rendering fittizio:

> Dipartimento Matematica, fisica e informatica (STEM)
> Responsabile: Prof. ROSSI MARIO.
> Materie afferenti (3): Fisica, Informatica, Matematica.
> Docenti afferenti (4): Prof.ssa NERI PAOLA, prof. ROSSI MARIO, prof.ssa
> VERDI ELENA e prof. ZANETTI LUCA.

### Tabella delle materie del dipartimento

Riga modello Google Docs:

```
{{#tablerow_loop:focus.dipartimento.materie}}{{@number}},{{sigla}},{{nome}},{{nomeSintetico}},{{#hasSpecificita}}{{nomeConSpecificita}}{{/hasSpecificita}}{{^hasSpecificita}}—{{/hasSpecificita}}
```

Rendering:

|  N. | Sigla | Materia     | Sintesi | Specificità |
| --: | ----- | ----------- | ------- | ----------- |
|   1 | FIS   | Fisica      | Fis.    | —           |
|   2 | INF   | Informatica | Inf.    | —           |
|   3 | MAT   | Matematica  | Mat.    | —           |

Il nodo dipartimento.materie non dichiara che ogni MateriaVM sia popolata con
il profilo CON_DOCENTI. Per associare docenti e materie usare una proiezione
preparata dalla recipe; non ricostruire quel join nel template.

### Tabella dei docenti afferenti

Riga modello Google Docs:

```
{{#tablerow_loop:focus.dipartimento.docenti}}{{@number}},{{appellativoCompleto}},{{appellativoCognome}},{{#isEsterno}}Esterno{{/isEsterno}}{{^isEsterno}}Interno{{/isEsterno}}
```

Rendering:

|  N. | Docente              | Forma breve    | Provenienza |
| --: | -------------------- | -------------- | ----------- |
|   1 | Prof.ssa NERI PAOLA  | Prof.ssa NERI  | Interno     |
|   2 | Prof. ROSSI MARIO    | Prof. ROSSI    | Interno     |
|   3 | Prof.ssa VERDI ELENA | Prof.ssa VERDI | Interno     |
|   4 | Prof. ZANETTI LUCA   | Prof. ZANETTI  | Interno     |

### Documenti del dipartimento

I documenti sono associati per sovrapposizione delle materie del dipartimento.
Usare il nodo documenti solo se la recipe lo richiede.

```
{{#focus.dipartimento.documenti.hasElenco}}
Documenti disponibili per il dipartimento:
{{#focus.dipartimento.documenti.elenco}}
- {{tipoLabel}} — {{nome}} ({{dataCreazioneBreve}}){{^@last}};{{/@last}}
{{/focus.dipartimento.documenti.elenco}}
{{/focus.dipartimento.documenti.hasElenco}}
{{^focus.dipartimento.documenti.hasElenco}}
Non risultano documenti associati al dipartimento.
{{/focus.dipartimento.documenti.hasElenco}}
```

Rendering fittizio:

> Documenti disponibili per il dipartimento:
>
> - Programmazione disciplinare — Programmazione STEM 2026-2027
>   (02/09/2026);
> - Verbale — Dipartimento STEM - settembre 2026 (10/09/2026)

### Vincolo per Google Sheets

Con asse DIPARTIMENTO non sono ammesse le opzioni che aggiungono colonne
materia o colonne materia con permessi: non esiste un consiglio di classe da
cui derivarle. Per un foglio dipartimentale impiegare righe dinamiche, ad
esempio:

```
{{dynamic_rows[source=focus.dipartimento.docenti,value=appellativoCompleto]}}
```

Rendering:

| Docenti del dipartimento |
| ------------------------ |
| Prof.ssa NERI PAOLA      |
| Prof. ROSSI MARIO        |
| Prof.ssa VERDI ELENA     |
| Prof. ZANETTI LUCA       |

## 11. Coordinatori, tutor, dirigente e staff d'istituto

### Coordinatori e tutor della classe

```
{{focus.classe.coordinatori.descrizioneRuolo}}.
Tutor ASL/FSL: {{focus.classe.tutor.aslDescrizione | default:'non assegnati'}}.
Tutor dell'orientamento: {{focus.classe.tutor.orientamentoDescrizione | default:'non assegnati'}}.
```

Rendering:

> I coordinatori prof.ssa BIANCHI ANNA e prof. ROSSI MARIO.
> Tutor ASL/FSL: Prof. ROSSI MARIO.
> Tutor dell'orientamento: non assegnati.

### Dirigente scolastico

```
Il dirigente scolastico è {{istituto.dirigente.appellativoCompleto}}.
```

Rendering:

> Il dirigente scolastico è Prof.ssa DE SANTIS PAOLA.

### Animatore digitale e referente BES

Gli incarichi di istituto sono configurabili: non esistono percorsi fissi
come istituto.animatoreDigitale o istituto.coordinatoreBes. Usare l'ID reale
del ruolo nella mappa staff.perId, per esempio AN_DIG e REF_BES, e proteggere
l'assenza di un titolare.

```
{{#istituto.staff.perId.AN_DIG.hasPersona}}
Animatore digitale: {{istituto.staff.perId.AN_DIG.persona.appellativoCompleto}}.
{{/istituto.staff.perId.AN_DIG.hasPersona}}
{{^istituto.staff.perId.AN_DIG.hasPersona}}
Animatore digitale: incarico non assegnato.
{{/istituto.staff.perId.AN_DIG.hasPersona}}

{{#istituto.staff.perId.REF_BES.hasPersona}}
Referente BES: {{istituto.staff.perId.REF_BES.persona.appellativoCompleto}}.
{{/istituto.staff.perId.REF_BES.hasPersona}}
```

Rendering:

> Animatore digitale: Prof. RINALDI DAVIDE.
> Referente BES: Prof.ssa GRECO SARA.

Per un elenco generico del personale incaricato:

```
{{#istituto.staff.elenco}}
{{ruoloNome}}: {{#hasPersona}}{{persona.appellativoCompleto}}{{/hasPersona}}{{^hasPersona}}non assegnato{{/hasPersona}}
{{/istituto.staff.elenco}}
```

## 12. Google Docs, Google Sheets e email

### Liste native di Google Docs

Per un elenco puntato nativo:

```
{{#bullet_list:focus.classe.consiglio.elenco}}
{{appellativoCompleto}} — {{materieDescrizione}}
{{/bullet_list}}
```

Rendering:

> • Prof.ssa BIANCHI ANNA — Lingua inglese
> • Prof.ssa FERRI LUCIA — Lingua e letteratura italiana, Storia
> • Prof. NERI PAOLO — Fisica

Per un elenco numerato:

```
{{#number_list:focus.classe.studenti.elenco}}
{{nomeCompleto}} — {{religioneLabel}}
{{/number_list}}
```

### Righe dinamiche in Google Sheets

Una cella contenente:

```
{{dynamic_rows[source=focus.classe.studenti.elenco,value=nomeCompleto]}}
```

produce verticalmente:

| Studente        |
| --------------- |
| BIANCHI SOFIA   |
| CONTI MARCO     |
| ESPOSITO GIULIA |
| ROMANO ANDREA   |

Per un foglio di materia usare il campo preparato con le ACL:

```
{{focus.classe.elencoMaterieConPermessi}}
```

Non sostituirlo con un ciclo manuale: il placeholder restituisce anche il
layout necessario all'applicazione delle autorizzazioni.

### HTML e testo non escaped

Usare le doppie graffe per testo ordinario; fanno escaping HTML:

```
{{focus.alunno.nomeCompleto}}
```

Usare le triple graffe soltanto per un frammento HTML prodotto e autorizzato
dalla pipeline, ad esempio render.contenutoHtml:

```
{{{render.contenutoHtml}}}
```

Non applicare triple graffe a note, nomi, parametri o input dell'utente.

## 13. Filtri pipe di WorkspaceTemplateEngine

La sintassi è valore, barra verticale, filtro e argomenti posizionali separati
da due punti:

```
{{percorso | filtro:argomento1:argomento2}}
```

I filtri sono utili per presentazione leggera. Nel CDU di ALDO non sono il
posto per fare ordinamenti, filtri di dominio, join o concordanze: il CDU
offre già partizioni, ordinamenti e testi pronti.

La tabella seguente usa dati fittizi e include tutti i filtri pipe registrati
da WorkspaceTemplateEngine.

| Filtro     | Template                                                                                        | Rendering fittizio                             | Uso                                             |
| ---------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| uppercase  | {{focus.classe.nome \| uppercase}}                                                              | 3A INF                                         | Maiuscole                                       |
| lowercase  | {{focus.alunno.religioneLabel \| lowercase}}                                                    | attività alternativa                           | Minuscole                                       |
| capitalize | {{titolo \| capitalize}}                                                                        | Verbale del consiglio                          | Iniziale maiuscola                              |
| truncate   | {{oggetto \| truncate:24:'…'}}                                                                  | Comunicazione relativa…                        | Testi brevi                                     |
| split      | {{csvMaterie \| split:';'}}                                                                     | [MAT, FIS, INF]                                | Prepara un array; spesso non necessario nel CDU |
| replace    | {{focus.classe.nome \| replace:' ':'-'}}                                                        | 3A-INF                                         | Nome file tecnico                               |
| urlEncode  | {{focus.classe.nome \| urlEncode}}                                                              | 3A%20INF                                       | Parametro URL                                   |
| date       | {{dataIso \| date}}                                                                             | 15/11/2026                                     | Data breve                                      |
| number     | {{media \| number:2}}                                                                           | 6,75                                           | Numero con decimali                             |
| currency   | {{quota \| currency:'€'}}                                                                       | € 150,00                                       | Importo                                         |
| yesNo      | {{focus.alunno.isRipetente \| yesNo:'Sì':'No'}}                                                 | No                                             | Booleano                                        |
| map        | {{focus.classe.consiglio.elenco \| map:'nomeCompleto'}}                                         | [BIANCHI ANNA, FERRI LUCIA, …]                 | Estrae proprietà                                |
| join       | {{focus.classe.consiglio.elenco \| map:'appellativoCompleto' \| join:'; '}}                     | Prof.ssa BIANCHI ANNA; Prof.ssa FERRI LUCIA; … | Elenco testuale                                 |
| limit      | {{focus.classe.studenti.elenco \| limit:2 \| map:'nomeCompleto' \| join:', '}}                  | BIANCHI SOFIA, CONTI MARCO                     | Anteprima                                       |
| skip       | {{focus.classe.studenti.elenco \| skip:2 \| map:'nomeCompleto' \| join:', '}}                   | ESPOSITO GIULIA, ROMANO ANDREA                 | Paginazione                                     |
| sort       | {{valori \| sort \| join:', '}}                                                                 | Alfa, Beta, Gamma                              | Primitive; non riordinare il dominio CDU        |
| sortBy     | {{docenti \| sortBy:'cognome' \| map:'nomeCompleto' \| join:', '}}                              | BIANCHI ANNA, FERRI LUCIA, ROSSI MARIO         | Dimostrazione; CDU già ordinato                 |
| reverse    | {{anni \| reverse \| join:', '}}                                                                | 2026-2027, 2025-2026                           | Ordine inverso                                  |
| where      | {{focus.classe.studenti.elenco \| where:'isRipetente':true \| map:'nomeCompleto' \| join:', '}} | ROMANO ANDREA                                  | Dimostrazione; preferire perStato.ripetenti     |
| exclude    | {{focus.classe.studenti.elenco \| exclude:'isBes':true \| map:'nomeCompleto' \| join:', '}}     | BIANCHI SOFIA, ROMANO ANDREA                   | Dimostrazione; preferire partizioni CDU         |
| default    | {{nota \| default:'Nessuna nota'}}                                                              | Nessuna nota                                   | Null, undefined o stringa vuota                 |
| fallback   | {{sede \| fallback:'Sede non indicata'}}                                                        | Sede non indicata                              | Fallback per valore mancante                    |
| plus       | {{focus.classe.anno \| plus:1}}                                                                 | 4                                              | Aritmetica                                      |
| minus      | {{orePreviste \| minus:oreSvolte}}                                                              | 12                                             | Aritmetica                                      |
| pluralize  | {{numero \| pluralize:'studente':'studenti'}}                                                   | studenti                                       | Singolare/plurale                               |
| json       | {{focus.piano.parametriGenerazione \| json:2}}                                                  | { "firma": true }                              | Diagnostica controllata                         |

I valori letterali sopra sono esemplificativi: in un template reale devono
esistere nel CDU o essere registrati come dati di rendering.

### Catene di filtri

Una catena valuta da sinistra a destra:

```
{{focus.classe.consiglio.elenco | map:'appellativoCompleto' | join:', ' | uppercase}}
```

Rendering:

> PROF.SSA BIANCHI ANNA, PROF.SSA FERRI LUCIA, PROF. NERI PAOLO, PROF. ROSSI
> MARIO, PROF.SSA VERDI ELENA

Questo esempio è legittimo per presentazione; per la forma grammaticale
italiana preferire sempre focus.classe.consiglio.elencoDescrizione.

## 14. Meta-variabili di ciclo: esempi completi

Con un array di quattro studenti:

```
{{#focus.classe.studenti.elenco}}
{{@index}} / {{@number}} / {{@total}} — {{nomeCompleto}} — primo={{@first}} — ultimo={{@last}} — dispari={{@odd}} — pari={{@even}}
{{/focus.classe.studenti.elenco}}
```

Rendering:

> 0 / 1 / 4 — BIANCHI SOFIA — primo=true — ultimo=false — dispari=true —
> pari=false
> 1 / 2 / 4 — CONTI MARCO — primo=false — ultimo=false — dispari=false —
> pari=true
> 2 / 3 / 4 — ESPOSITO GIULIA — primo=false — ultimo=false — dispari=true —
> pari=false
> 3 / 4 / 4 — ROMANO ANDREA — primo=false — ultimo=true — dispari=false —
> pari=true

### Separatore corretto con @last

```
{{#focus.classe.studenti.elenco}}
{{nomeCompleto}}{{^@last}}, {{/@last}}
{{/focus.classe.studenti.elenco}}
```

Rendering:

> BIANCHI SOFIA, CONTI MARCO, ESPOSITO GIULIA, ROMANO ANDREA

### Intestazione e chiusura del ciclo

```
{{#focus.classe.materie.elenco}}
{{#@first}}Materie della {{focus.classe.nome}}: {{/@first}}
{{nomeSintetico}}{{^@last}} · {{/@last}}
{{#@last}}.{{/@last}}
{{/focus.classe.materie.elenco}}
```

Rendering:

> Materie della 3A INF: Fis. · Inf. · Italiano · Inglese · Mat.

### Alternanza di riga con @odd e @even

In un template HTML autorizzato:

```
{{#focus.classe.studenti.elenco}}
<tr class="{{#@odd}}riga-dispari{{/@odd}}{{#@even}}riga-pari{{/@even}}">
  <td>{{@number}}</td><td>{{nomeCompleto}}</td>
</tr>
{{/focus.classe.studenti.elenco}}
```

### @key per un oggetto

Se una recipe fornisce un oggetto iterabile, non un array:

```
{{#parametri}}
{{@key}}: {{.}}
{{/parametri}}
```

Rendering fittizio:

> firma: true
> modello: sintetico

@key non deve essere usato per sostituire le collezioni CDU: queste sono
sempre array con ordine stabile.

## 15. Checklist prima di salvare un template

- Il nodo richiesto è presente nella recipe del CDU?
- Per un array ho verificato il relativo hasElenco?
- Il percorso rispetta il budget di profondità e l'item iterato è autosufficiente?
- Sto usando un campo Label o Descrizione già pronto?
- Ho scelto elenco per docenti effettivi e titolari solo quando servono?
- Per piani, BES, DSA, PEI, carenze e note il documento ha ACL e destinatari
  appropriati?
- Una classe articolata richiede la classe parent, una partner, o entrambe?
- Ho usato tablerow_loop solo in una riga modello di tabella Google Docs?
- Ho evitato sort, where, exclude e join per reimplementare regole del CDU?
- Ho provato sia il caso con dati sia quello vuoto?

## 16. Percorsi rapidi

| Esigenza                  | Percorso principale                                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| Nome e indirizzo classe   | focus.classe.nome; focus.classe.indirizzo.nome                                |
| Coordinatori              | focus.classe.coordinatori.elencoDescrizione                                   |
| Tutor                     | focus.classe.tutor.aslDescrizione; focus.classe.tutor.orientamentoDescrizione |
| Consiglio effettivo       | focus.classe.consiglio.elenco                                                 |
| Titolari                  | focus.classe.consiglio.titolari                                               |
| Supplenze attive          | focus.classe.consiglio.supplenze                                              |
| Materie                   | focus.classe.materie.elenco                                                   |
| Studenti                  | focus.classe.studenti.elenco                                                  |
| Ripetenti                 | focus.classe.studenti.perStato.ripetenti                                      |
| IRC / ALT / NO            | focus.classe.studenti.perReligione                                            |
| Piani non verbalizzati    | focus.classe.pianiPersonalizzati.nonVerbalizzati.elenco                       |
| Rappresentanti studenti   | focus.classe.rappresentanti.studenti.elenco                                   |
| Rappresentanti genitori   | focus.classe.rappresentanti.genitori.elenco                                   |
| Statistiche studenti      | focus.classe.studenti.statistiche                                             |
| Movimenti                 | focus.classe.movimenti                                                        |
| Carenze singolo studente  | focus.alunno.carenze oppure studente.carenze nel roster                       |
| Continuità materia        | materia.continuita con profilo CON_CONTINUITA                                 |
| Dipartimento              | focus.dipartimento                                                            |
| Responsabile dipartimento | focus.dipartimento.capo                                                       |
| Materie dipartimento      | focus.dipartimento.materie                                                    |
| Docenti dipartimento      | focus.dipartimento.docenti                                                    |
| Documenti dipartimento    | focus.dipartimento.documenti                                                  |
| Dirigente                 | istituto.dirigente                                                            |
| Ruolo staff configurato   | istituto.staff.perId.<ID_RUOLO>                                               |
