# Guida pratica per compilare il database scolastico

Questa guida è per chi lavora nel file **Google Sheets** dell'istituto. Non occorre conoscere programmi o codice: ogni linguetta in basso è un foglio con uno scopo preciso. Compilare con cura permette a documenti, comunicazioni e riepiloghi di riportare dati corretti.

## Regole valide per tutti i fogli

- La prima riga contiene i titoli: **non modificarla**, non aggiungere, eliminare o rinominare colonne.
- Ogni riga dalla seconda in poi descrive una persona, una classe, un evento o un'impostazione. Non lasciare righe vuote in mezzo ai dati.
- Quando servono più valori nella stessa cella, scriverli separati da una virgola, senza spazi: `3A,3B` oppure `maria.rossi@istituto.it,luigi.verdi@istituto.it`.
- Le date si scrivono sempre `AAAA-MM-GG`: `2026-01-15` significa 15 gennaio 2026.
- Per una scelta sì/no usare solo `VERO` o `FALSO`, preferibilmente dal menu della cella.
- Copiare email e codici dai rispettivi fogli. Se in `DOCENTI` è scritto `maria.rossi@istituto.it`, va riportato esattamente così ovunque.
- Le colonne che iniziano con `_` sono per appunti o calcoli personali; non cambiano il funzionamento del foglio.

## Mappa dei fogli

| Foglio | A cosa serve | Cosa fare | Collegamenti principali |
| --- | --- | --- | --- |
| `DOCENTI` | Elenco del personale docente | Compilare e aggiornare | Fornisce email a classi, dipartimenti, incarichi, supplenze e cambi docente |
| `CLASSI` | Classi, indirizzi e docenti assegnati | Compilare e aggiornare | Usa `DOCENTI`, `MATERIE`, `INDIRIZZI`; è usato dagli altri fogli |
| `ALUNNI` | Elenco studenti e classe frequentata | Compilare e aggiornare | Usa `CLASSI`; alimenta piani, carenze, PCTO e movimenti |
| `PIANI` | PDP, PEI e altri piani individuali | Compilare solo se incaricati | Usa `ALUNNI` |
| `MOV_ALUNNI` | Storico di ingressi, uscite e cambi classe | Aggiungere righe, mai cancellarle | Usa `ALUNNI` e `CLASSI`; richiede aggiornamento di `ALUNNI` |
| `SUPPLENZE` | Sostituzioni temporanee | Compilare quando necessario | Usa docenti, classi e materie |
| `VARIAZIONI_CATTEDRA` | Cambio definitivo del docente | Compilare quando necessario | Usa docenti, classi e materie |
| `CARENZE` | Rilevazioni di insufficienze e assenze | Compilare secondo la procedura d'istituto | Usa studenti, classi e materie |
| `ASL` | Ore PCTO/alternanza | Compilare secondo la procedura d'istituto | Usa gli studenti |
| `PROGETTI` | Attività extracurriculari e PCTO | Compilare secondo la procedura d'istituto | Collega studenti, docenti e classi |
| `MATERIE`, `INDIRIZZI`, `DIPART`, `RUOLI` | Elenchi ufficiali di riferimento | Consultare; modificare solo se incaricati | Forniscono codici ed email agli altri fogli |
| `CONF_DOC`, `CONF_MAIL`, `CONF_IMP`, `CONF_AZIONI` | Impostazioni interne di documenti, email e operazioni | **Non modificare** senza autorizzazione | Leggono i dati degli altri fogli |
| `LOG_DOCS`, `LOG_FOLD`, `LOG_MAIL`, `LOG_JOB` | Storico di documenti, cartelle, email e operazioni | **Solo consultazione** | Permettono di controllare ciò che è già stato fatto |

## Ordine consigliato

1. `MATERIE`, `INDIRIZZI`, `DIPART` e `RUOLI`, solo se autorizzati.
2. `DOCENTI`.
3. `CLASSI`.
4. `ALUNNI`.
5. `PIANI`, `CARENZE`, `ASL` e `PROGETTI`, se necessari.
6. `MOV_ALUNNI`, `SUPPLENZE` e `VARIAZIONI_CATTEDRA` quando avviene l'evento.

## Fogli anagrafici principali

### DOCENTI — chi insegna nell'istituto

È la rubrica dei docenti. L'email identifica una persona: non possono esserci due righe con la stessa email.

| Colonna | Cosa inserire | Esempio |
| --- | --- | --- |
| `EMAIL` | Email istituzionale completa | `maria.rossi@istituto.it` |
| `COGNOME`, `NOME` | Dati anagrafici | `Rossi`, `Maria` |
| `GENERE` | `M` oppure `F`, per l'appellativo nei documenti | `F` |
| `DIPART` | Codice preso da `DIPART` | `LETTERE` |
| `ITP` | `VERO` solo per insegnante tecnico-pratico | `FALSO` |
| `ORE_POT` | Numero di ore settimanali di potenziamento | `2` |

**Collegamenti.** Prima di assegnare un docente a una classe, dipartimento, incarico, supplenza o cambio di cattedra, inserirlo qui. Se compare in una colonna che termina con `itp` in `CLASSI`, deve avere `ITP = VERO`.

### CLASSI — classi, indirizzi e docenti assegnati

Ogni riga descrive una classe. `ID` è il codice da copiare negli altri fogli, per esempio `3B` o `5ALC`.

| Colonna | Cosa inserire | Esempio |
| --- | --- | --- |
| `ID` | Codice unico della classe, senza spazi | `5ALC` |
| `ANNO`, `SEZ` | Anno di corso e sezione | `5`, `A` |
| `TERMINALE` | `VERO` per la classe conclusiva del percorso | `VERO` |
| `INDIRIZZO` | Codice preso da `INDIRIZZI` | `LC` |
| `COORD` | Email del coordinatore; più persone separate da virgola | `luigi.verdi@istituto.it` |
| `ATTIVA` | `VERO` se la classe è attiva nell'anno | `VERO` |
| `STORICO` | Eventuali codici usati negli anni precedenti | `4ALC` |
| Colonne delle materie | Email del docente assegnato | `maria.rossi@istituto.it` |
| Colonne che terminano con `itp` | Email del docente di laboratorio | `carlo.bianchi@istituto.it` |
| `IRC`, `ALT` | Email del docente di religione o attività alternativa | `d.curia@istituto.it` |

Ogni colonna con un codice come `ITA`, `MAT` o `INTERPRET.CHITARRA` corrisponde a una materia già presente in `MATERIE`. Non creare nuove colonne. Per più docenti nella stessa materia, separare le email con virgola.

**Collegamenti.** Le classi sono usate da studenti, carenze, movimenti, supplenze e cambi docente. I docenti indicati qui sono l'assegnazione ordinaria: una supplenza temporanea o una variazione definitiva può modificarla per il periodo interessato.

I campi `RUOLI`, `ARTICOLAZIONE` e le classi articolate richiedono una struttura già preparata: non compilarli autonomamente; chiedere all'amministratore. Per una classe articolata, in `ALUNNI` indicare la sottoclasse assegnata, per esempio `4A-LC`, non la classe generale `4A`.

### ALUNNI — chi frequenta e in quale classe

È la rubrica degli studenti. L'email identifica lo studente e deve essere unica.

| Colonna | Cosa inserire | Esempio |
| --- | --- | --- |
| `EMAIL` | Email istituzionale dello studente | `giulia.rossi@istituto.it` |
| `COGNOMENOME` | Cognome e nome | `Rossi Giulia` |
| `CLASSE` | Codice esatto preso da `CLASSI` | `3B` |
| `RELIGIONE` | `IRC`, `ALT` oppure `NO` | `IRC` |
| `ATTIVO` | `VERO` se frequenta; `FALSO` se non frequenta più | `VERO` |
| `RIPETENTE` | `VERO` se ripete l'anno | `FALSO` |
| `RAPPR_STUD` | `VERO` se rappresentante degli studenti | `FALSO` |
| `RAPPR_GEN` | Nome del genitore rappresentante, se presente | `Bianchi Mario` |
| `TUTOR_1`, `TUTOR_2` | Email del primo e dell'eventuale secondo tutore | `mario.bianchi@email.it` |
| `NOTE` | Annotazioni interne autorizzate | `DSA certificato` |

`CURRICULUM` è solo per percorsi con scelte particolari, come lo strumento musicale: non compilarlo senza il modello fornito dall'amministratore.

**Collegamenti.** L'email dello studente viene usata in `PIANI`, `CARENZE`, `ASL` e `MOV_ALUNNI`. La classe deve esistere in `CLASSI`. Per uscita o cambio classe aggiornare qui la situazione attuale e registrare anche l'evento in `MOV_ALUNNI`.

## Situazioni dello studente

### PIANI — PDP, PEI e altri piani individuali

Una riga indica un piano assegnato a uno studente. Serve a conservare l'informazione e, quando previsto, a preparare documenti dedicati.

| Colonna | Cosa inserire | Esempio |
| --- | --- | --- |
| `STUDENTE` | Email già presente in `ALUNNI` | `giulia.rossi@istituto.it` |
| `TIPO` | `PDP_DSA`, `PDP_BES`, `PDP_STRANIERI`, `PEI` o `PFP` | `PDP_DSA` |
| `PARAMETRI` | Solo il modello predisposto dall'amministratore | lasciare vuoto se non richiesto |

Per lo stesso studente e lo stesso tipo di piano deve esserci una sola riga. Se cambia, aggiornare la riga esistente invece di duplicarla. Lo studente deve essere presente e attivo in `ALUNNI`.

### MOV_ALUNNI — storico di ingressi, uscite e cambi classe

È un archivio: aggiungere una riga per ogni evento, senza cancellare o riscrivere quelle già registrate.

| Colonna | Cosa inserire | Esempio |
| --- | --- | --- |
| `STUDENTE` | Email presente in `ALUNNI` | `giulia.rossi@istituto.it` |
| `TIPO` | `IN`, `OUT`, `RITIRATO` o `CAMBIO` | `CAMBIO` |
| `DATA` | Giorno effettivo dell'evento | `2026-02-10` |
| `DA` | Classe/scuola di provenienza | `3B` o `ALTRO ISTITUTO` |
| `A` | Nuova classe o destinazione | `3C` o `ALTRO ISTITUTO` |

`IN` è un ingresso; `OUT` è un trasferimento a un altro istituto; `RITIRATO` è il ritiro dagli studi; `CAMBIO` è il passaggio interno a un'altra classe.

**Collegamenti.** Per `OUT` o `RITIRATO`, impostare anche `ATTIVO = FALSO` in `ALUNNI`. Per `CAMBIO`, aggiornare anche `ALUNNI → CLASSE` con il nuovo codice.

### CARENZE — insufficienze e assenze

Ogni riga registra una rilevazione per uno studente, per esempio un pagellino. Le colonne con il codice di una materia contengono il voto o una breve nota relativa a quella materia.

| Colonna | Cosa contiene |
| --- | --- |
| `STUDENTE` | Email dello studente in `ALUNNI` |
| `PROGRESSIVO` | Numero della rilevazione per quello studente; usare la procedura indicata dalla scuola |
| `CLASSE`, `DATA` | Classe e data della rilevazione |
| `ASSENZE` | `VERO` se occorre segnalare assenze elevate |
| `NOTE` | Nota generale del consiglio di classe |
| Colonne delle materie | Voto o nota di carenza per la materia |

Studente, classe e materie devono esistere già nei rispettivi fogli. Il foglio può preparare comunicazioni alle famiglie: compilarlo solo con la procedura concordata e senza creare nuove colonne.

### ASL — ore PCTO/alternanza

Raccoglie le ore svolte dallo studente nei percorsi PCTO/alternanza. Inserire o aggiornare le righe con la procedura dell'istituto; lo studente deve esistere in `ALUNNI`. Serve a produrre il totale delle ore e la relativa documentazione.

### PROGETTI — attività e percorsi extracurriculari

Raccoglie progetti dell'istituto, compresi quelli PCTO/alternanza. Ogni riga descrive un'attività e persone o classi coinvolte. Usare il modello predisposto: studenti, docenti, classi e materie devono corrispondere ai rispettivi fogli.

## Docenti: assenze e cambi definitivi

### SUPPLENZE — sostituzioni temporanee

Una riga indica che un docente sostituisce temporaneamente un altro in determinate classi e materie.

| Colonna | Cosa inserire | Esempio |
| --- | --- | --- |
| `TITOLARE` | Email del docente assente | `maria.rossi@istituto.it` |
| `SUPPLENTE` | Email del docente che lo sostituisce | `luigi.verdi@istituto.it` |
| `DAL`, `AL` | Inizio e fine; `AL` vuoto significa ancora in corso | `2026-03-01`, `2026-03-15` |
| `CLASSI` | Codici classe separati da virgola, oppure `*` per tutte | `3B,3C` |
| `MATERIE` | Codici materia separati da virgola, oppure `*` per tutte | `ITA,STO` |

L'asterisco `*` va scritto da solo nella cella. Mantenere sempre lo stesso ordine per più classi o materie: sempre `3B,3C`, non a volte `3C,3B`.

**Collegamenti.** Entrambi i docenti devono essere in `DOCENTI`; classi e materie devono esistere nei rispettivi fogli. Nelle date indicate, la supplenza prevale sull'assegnazione ordinaria in `CLASSI` e su eventuali cambi definitivi. Verificare prima che non ci sia già una supplenza sovrapposta per lo stesso docente, classe e materia.

### VARIAZIONI_CATTEDRA — cambio definitivo del titolare

Usare questo foglio quando il cambio di docente è definitivo, non per una sostituzione di pochi giorni.

| Colonna | Cosa inserire | Esempio |
| --- | --- | --- |
| `TITOLARE` | Email del docente che lascia la cattedra | `maria.rossi@istituto.it` |
| `NUOVO_TITOLARE` | Email del docente che la assume | `luigi.verdi@istituto.it` |
| `DAL` | Data da cui il cambio vale | `2026-01-07` |
| `CLASSI`, `MATERIE` | Codici separati da virgola, oppure `*` per tutte | `5A`, `MAT` |

Il cambio resta valido fino a una riga successiva che lo modifica. Anche qui l'asterisco deve essere da solo e l'ordine dei codici deve rimanere coerente.

**Collegamenti.** La riga sostituisce l'assegnazione iniziale in `CLASSI`. Se il nuovo docente è assente, una riga in `SUPPLENZE` prevale temporaneamente.

## Fogli di riferimento dell'istituto

### MATERIE

È il catalogo ufficiale delle discipline. `ID` è il codice breve da copiare nelle colonne delle materie di `CLASSI` e `CARENZE` e nella colonna `MATERIE` di supplenze e variazioni. `NOME` è il nome esteso, `SINTESI` quello breve. Colori, simboli, esami, evoluzioni e specificità sono impostazioni dell'istituto: non modificarle senza incarico.

### INDIRIZZI

Elenca i percorsi di studio. Copiare `ID` nella colonna `INDIRIZZO` di `CLASSI`; `NOME`, `NOME_SINTETICO` e `TIPO` descrivono il percorso. Modificare solo se incaricati.

### DIPART

Elenca i dipartimenti. `ID` è il codice da usare in `DOCENTI → DIPART`; `CAPO` contiene l'email del responsabile e `MATERIE` i codici delle discipline separati da virgola. Prima inserire docenti e materie nei rispettivi fogli.

### RUOLI

Elenca incarichi speciali di istituto. `ID` è il codice dell'incarico, `NOME` la descrizione, `DOCENTE` le email degli incaricati separate da virgola. Le persone indicate devono già essere in `DOCENTI`. Coordinatori e rappresentanti degli studenti sono invece ricavati da `CLASSI → COORD` e `ALUNNI → RAPPR_STUD`.

## Fogli da non modificare senza autorizzazione

| Foglio | Contenuto e scopo | Interazioni |
| --- | --- | --- |
| `CONF_DOC` | Tipi di documenti, modelli, cartelle e regole di creazione | Legge dati di studenti, classi, docenti, piani, carenze e progetti; registra il risultato in `LOG_DOCS` e `LOG_FOLD` |
| `CONF_MAIL` | Oggetto, destinatari, testo e allegati delle comunicazioni | Legge dati scolastici e documenti; registra l'invio in `LOG_MAIL` |
| `CONF_IMP` | Istruzioni per importare dati da altre fonti | Aggiorna il foglio indicato dalla riga |
| `CONF_AZIONI` | Istruzioni per verifiche e operazioni di manutenzione | Può controllare o aggiornare dati e registrare l'esito in `LOG_JOB` |

Se serve un nuovo documento, una nuova email o una nuova importazione, chiedere all'amministratore invece di aggiungere righe o colonne autonomamente.

## Fogli di storico: solo consultazione

| Foglio | Che cosa conserva | Quando consultarlo |
| --- | --- | --- |
| `LOG_DOCS` | Un record per documento creato: nome, collegamento, classe, persone e data | Per vedere se un documento è già stato generato |
| `LOG_FOLD` | Cartelle create su Google Drive | Per ritrovare una cartella generata |
| `LOG_MAIL` | Email inviate, destinatari, esito ed eventuali errori | Per controllare se una comunicazione è partita |
| `LOG_JOB` | Riepilogo delle operazioni svolte e problemi | Per fornire all'amministratore dettagli su un'anomalia |

Non correggere a mano questi fogli: sono una cronologia. In caso di errore, comunicare all'amministratore il link o la riga interessata.

## Controllo finale

1. Ogni email di docente indicata altrove esiste in `DOCENTI`; ogni email di studente esiste in `ALUNNI`.
2. Ogni codice classe esiste in `CLASSI`; ogni codice materia esiste in `MATERIE`; ogni indirizzo esiste in `INDIRIZZI`.
3. Date nel formato `AAAA-MM-GG`; valori sì/no come `VERO` o `FALSO`.
4. Email, codici e valori multipli senza spazi superflui e sempre nello stesso ordine.
5. Nessuna riga vuota in mezzo ai dati e nessuna modifica ai titoli delle colonne.
6. Per uscita, ritiro o cambio classe: aggiornati sia `MOV_ALUNNI` sia `ALUNNI`.
7. Per supplenze e cambi definitivi: controllati date, classi e materie.

In caso di dubbio, non inventare codici, colonne o formati: chiedere all'amministratore.
