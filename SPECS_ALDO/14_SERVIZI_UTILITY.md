# 14 — Servizi Utility

Questo documento descrive i servizi trasversali di SGSA: la risoluzione dei ruoli per permessi e destinatari email, l'aggregazione ottimizzata dei dati per i box renderer, la gestione della struttura cartelle Drive, e i motori di espressioni e template.

**Principio fondamentale:** tutti i servizi descritti qui sono **configurazioni e adattatori SGSA-specifici di librerie già disponibili nello stack**. Per ogni servizio è indicata la libreria sottostante e il contributo specifico di SGSA rispetto a quanto già offerto dalla libreria.

---

## 1. RisolutoreRuoliService

**Libreria usata:** `RoleResolutionLib` (L4)

I campi `CONF_DOC.PERMESSI` e `CONF_MAIL.SUPPLENTI` fanno riferimento a ruoli astratti (es. `COORDINATORI`, `CDC`, `TUTOR_ASL`) invece di indirizzi email diretti. Il `RisolutoreRuoliService` traduce questi nomi di ruolo in indirizzi email concreti usando `RoleResolutionLib`, applicando le regole di gestione supplenze configurate.

```
RisolutoreRuoliService:
  risolvi(ruolo: string, cdu: CDU): Email[]
    — strategy = registroRisolutori.get(ruolo)
    — Se strategy null → throw "Ruolo non registrato: " + ruolo
    — Return strategy.risolvi(cdu)
```

---

### 1.1 Catalogo dei Ruoli SGSA

#### Ruoli di Classe

| Ruolo | Strategia | Sorgente dati |
|-------|-----------|---------------|
| `COORDINATORI` | `CoordinatoriStrategy` | `CLASSI.COORD` (CSV email), con risoluzione supplenze attive |
| `CDC` | `CDCStrategy` | `ClasseRepository.getAllDocentiCDC()` — tutti i docenti del Consiglio di Classe |
| `CDC_FILTER_ALUNNO` | `CDCFilterAlunnoStrategy` | Come `CDC` ma filtra il docente IRC (`CLASSI.IRC`) e il docente ALT (`CLASSI.ALT`) in base alla scelta IRC dell'alunno (legge `focus.alunno.status.religione`, popolato da `AlunnoProvider`), e filtra ulteriormente i docenti delle materie con specificità in base a `ALUNNI.CURRICULUM` (letto come `focus.alunno.curriculum`, popolato da `AlunnoProvider`); vedi logica completa in sezione 1.3 |
| `DOCENTI_NO_RELIGIONE` | `DocentiNoReligioneStrategy` | Come `CDC` ma rimuove il docente IRC e il docente di attività alternativa |

#### Ruoli di Docente Singolo

| Ruolo | Strategia | Sorgente dati |
|-------|-----------|---------------|
| `TUTOR_ASL` | `TutorASLStrategy` | `CLASSI.RUOLI` → campo JSON `TUTOR_ASL` |
| `SEGRETARIO_CDC` | `SegretarioCDCStrategy` | `CLASSI.RUOLI` → campo JSON `SEGRETARIO` |
| `TUTOR_ORIENT` | `TutorOrientStrategy` | `CLASSI.RUOLI` → campo JSON `TUTOR_ORIENT` |
| `DOCENTE_PRIMA_PROVA` | `DocentePrimaProvaStrategy` | `MATERIE.ESAME_CFG.prima_prova` per l'indirizzo della classe, poi colonna materia in `CLASSI` |
| `DOCENTE_SECONDA_PROVA` | `DocenteSecondaProvaStrategy` | Come sopra per `seconda_prova` |
| `CAPO_DIPARTIMENTO` | `CapoDipartimentoStrategy` | `DIPART.CAPO` filtrato per il dipartimento di `meta.parametriInput.materiaCorrente` (vedi `02_CDU_STRUTTURA.md`) |
| `DOCENTE_MATERIA` | `DocenteMateriaStrategy` | Colonna `[SIGLA_MATERIA]` di `CLASSI`, dove `SIGLA_MATERIA = meta.parametriInput.materiaCorrente` (vedi `02_CDU_STRUTTURA.md`) |

#### Ruoli Dinamici (tabella RUOLI)

La `ReferenteStrategy` è una strategy **jolly**: se il ruolo richiesto corrisponde a un `ID` valido nella tabella `RUOLI`, risolve automaticamente il docente corrispondente tramite `RUOLI.DOCENTE`.

| Ruolo (esempio) | Sorgente dati |
|-----------------|---------------|
| `REF_BES` | `RUOLI` dove `ID = 'REF_BES'` → `DOCENTE` |
| `AN_DIG` | `RUOLI` dove `ID = 'AN_DIG'` → `DOCENTE` |
| Qualsiasi `ID` in `RUOLI` | Stesso meccanismo |

Questo permette di aggiungere nuovi ruoli di istituto (es. `REF_PCTO`, `VICEPRES`) semplicemente inserendo un record in `RUOLI` senza modificare il codice.

#### Ruoli su Alunno/Famiglia

| Ruolo | Strategia | Sorgente dati |
|-------|-----------|---------------|
| `ALUNNO` | `AlunnoStrategy` | `cdu.focus.alunno.anagrafica.email` |
| `FAMIGLIA` | `FamigliaStrategy` | `ALUNNI.TUTOR_1` e `ALUNNI.TUTOR_2` dell'alunno nel CDU |
| `GENITORI_CLASSE` | `GenitoriClasseStrategy` | `TUTOR_1` e `TUTOR_2` di tutti gli alunni attivi della classe |
| `RAPPRESENTANTI_STUDENTI` | `RappresentantiStudentiStrategy` | `ALUNNI` dove `RAPPR_STUD = true` per la classe corrente |

**Nota classi articolate:** se la classe interrogata è la classe parent, `GENITORI_CLASSE` (e `FAMIGLIA`, quando applicato a livello di classe) aggrega i tutori degli alunni di entrambe le classi partner — vedi `05_AGGREGATI_E_CLASSI_ARTICOLATE.md` §5.

**Nota su `RAPPR_GEN`:** `ALUNNI.RAPPR_GEN` contiene esclusivamente il **nome** (testo libero) del genitore rappresentante, non un'email. Non esiste quindi un ruolo `RAPPRESENTANTI_GENITORI` risolvibile dal `RisolutoreRuoliService` (che restituisce sempre `Email[]`). Il nome è disponibile nel CDU in `focus.classe.rappresentanti.genitori` (vedi `02_CDU_STRUTTURA.md`) per essere usato solo come placeholder testuale nei template, non come destinatario di comunicazioni.

---

### 1.2 Gestione Supplenze nei Permessi

`RoleResolutionLib` gestisce le supplenze come sostituzioni trasparenti. Quando viene risolto un ruolo docente, la libreria verifica se `SUPPLENZE` contiene un record attivo per quel titolare nella data corrente (e, per i ruoli di classe, per quella specifica classe e materia).

La regola applicata è quella configurata in `regolaSupplente` del JSON `CONF_DOC.PERMESSI`:

| Valore | Comportamento |
|--------|---------------|
| `SOLO_TITOLARI` | Il permesso va solo ai docenti titolari, supplenti ignorati |
| `SOLO_SUPPLENTI` | Se c'è un supplente attivo, il permesso va a lui; altrimenti al titolare |
| `ENTRAMBI` | Sia il titolare che il supplente ricevono il permesso |

La regola è applicata separatamente per `file` e per `folder`, permettendo configurazioni asimmetriche (es. il supplente può leggere il file ma non la cartella dell'archivio storico).

**Catene di supplenza:** se il supplente individuato è a sua volta titolare di un'altra supplenza attiva per lo stesso contesto e data (supplenza del supplente), `RoleResolutionLib` risolve la catena ricorsivamente, senza limite di profondità, fino al sostituto effettivo finale (vedi `findSupplenzaSpecifica()` in `06_REPOSITORY.md`).

---

### 1.3 Strategie di Esclusione (Risoluzione Negativa)

Alcune strategy implementano filtri post-risoluzione che rimuovono profili specifici dalla lista risolta:

| Strategy | Filtro applicato |
|----------|-----------------|
| `DocentiNoReligioneStrategy` | Rimuove il docente IRC e il docente di attività alternativa |
| `CDCFilterAlunnoStrategy` | Rimuove docenti non pertinenti all'indirizzo dell'alunno in contesto; applica la logica IRC/ALT; per materie con specificità, include solo i docenti delle specificità presenti in `focus.alunno.curriculum` (derivato da `ALUNNI.CURRICULUM`) |

**Logica filtro `CDCFilterAlunnoStrategy` per scelta IRC dell'alunno** (legge `focus.alunno.status.religione` (popolato da `AlunnoProvider`)):
- `ReligioneScelta.SI`  → includi docente IRC (colonna `CLASSI.IRC`); nessun docente ALT applicabile
- `ReligioneScelta.NO`  → escludi docente IRC; escludi docente ALT
- `ReligioneScelta.ALT` → escludi docente IRC; includi docente ALT (colonna `CLASSI.ALT`)

**Logica filtro specificità curriculum (`CDCFilterAlunnoStrategy`):**
La sorgente dati è `ALUNNI.CURRICULUM` — JSON `{ "[MateriaId]": string[] }`, chiave = MateriaId, valore = array delle specificità scelte (vedi `01_SCHEMA_DATABASE.md`) — reso disponibile nel CDU come `focus.alunno.curriculum["[MateriaId]"].specifiche` (vedi `02_CDU_STRUTTURA.md`).
Per ogni materia con specificità nel CDC:
1. Legge `focus.alunno.curriculum[materiaId].specifiche`
2. Se il docente insegna la specificità `X` (colonna dinamica `SpecificitaId`, formato `MateriaId.SPECIFICA`, es. `INTERPRETAZIONE.CHITARRA`, vedi `03_VALUE_OBJECTS_ED_ENUM.md`) e `X` non è nelle specificità dell'alunno → docente escluso dal CDC filtrato
3. Se l'alunno non ha voci per quella materia nel curriculum → tutti i docenti della materia inclusi (nessun filtro applicato)

**Nota CDC ridotto:** per gli studenti con `ReligioneScelta.NO` (né IRC né attività alternativa), il CDC filtrato risulta semplicemente più corto: non avviene alcuna riassegnazione a un docente alternativo (es. "studio assistito").

---

## 2. AggregatoreDati

**Libreria usata:** `SheetDBLib` (L2)

I box renderer email e gli step della pipeline ricevono i dati tramite il campo `DATI_SORGENTE.metodo` del `BOX_CFG`. I metodi indicati appartengono all'`AggregatoreDati`, che espone query ottimizzate per le operazioni di lettura più frequenti del sistema.

**Ottimizzazione principale:** prevenzione del problema N+1. Quando la pipeline elabora molti destinatari in sequenza, l'`AggregatoreDati` DEVE caricare in memoria i dati necessari in batch anziché eseguire una query separata per ogni destinatario. I risultati DEVONO essere cachati in memoria per la durata della pipeline corrente (stessa sessione GAS).

### Metodi esposti

| Metodo | Query effettuata | Usato da |
|--------|-----------------|----------|
| `getCarenzePerAlunno(alunnoEmail)` | `CARENZE` filtrate per `STUDENTE = alunnoEmail`, ordinate per `DATA` desc | Box `carenze` |
| `getDocumentiPerAlunno(alunnoEmail, filtri)` | `LOG_DOCS` filtrate per `UTENTI` (CONTAINS), con filtri opzionali su `TIPO`, `STATO`, `SOTTOTIPO` | Box `documenti` |
| `getDocumentiPerClasse(classeId, filtri)` | `LOG_DOCS` filtrate per `CLASSI` (CSV, ricerca per contenimento), con filtri opzionali | Box `documenti` nei verbali |
| `getCartellePerClasse(classeId)` | `LOG_FOLD` filtrate per `CLASSI` (CSV, ricerca per contenimento) | Box `cartelle` |
| `getEmailCoordinatori(classeId)` | `CLASSI.COORD` risolto tramite `RisolutoreRuoliService` | `ResolveRecipientsStep` |

### Mapping `DATI_SORGENTE.metodo` / `PREREQUISITI[].metodo` → `AggregatoreDati`

Il campo `DATI_SORGENTE.metodo` (e analogamente `PREREQUISITI[].metodo`) del `BoxConfig` (vedi `03_VALUE_OBJECTS_ED_ENUM.md`) accetta esclusivamente uno dei valori stringa seguenti, mappati 1:1 ai metodi sopra elencati:

| Valore `DATI_SORGENTE.metodo` | Metodo `AggregatoreDati` | Struttura attesa di `filtri` |
|--------------------------------|---------------------------|-------------------------------|
| `"carenzePerAlunno"` | `getCarenzePerAlunno(alunnoEmail)` | `{}` (nessun filtro; `alunnoEmail` letto da `focus.alunno.anagrafica.email`) |
| `"documentiPerAlunno"` | `getDocumentiPerAlunno(alunnoEmail, filtri)` | `{ tipo?: string, stato?: StatoDocumento, sottotipo?: string }` |
| `"documentiPerClasse"` | `getDocumentiPerClasse(classeId, filtri)` | `{ tipo?: string, stato?: StatoDocumento }` |
| `"cartellePerClasse"` | `getCartellePerClasse(classeId)` | `{}` |
| `"emailCoordinatori"` | `getEmailCoordinatori(classeId)` | `{}` |

Un valore di `metodo` non presente in questa tabella DEVE produrre un warning nel log e lo skip del box (stesso comportamento già descritto per un `TIPO_BOX` non registrato in `11_PIPELINE_EMAIL.md`, Step 3).

---

## 3. AggregatoreStorico

**Libreria usata:** `StoricoDocumentiService` (descritto in `13_SERVIZI_STORICI.md`)

L'`AggregatoreStorico` espone il metodo `arricchisciDocumentiConStorico(documentiCorrenti, config)`. È usato dal box renderer `documenti` quando `BOX_CFG` contiene `arricchisciConStorico: true`.

Per ogni documento nell'elenco corrente, il metodo recupera il documento equivalente dell'anno scolastico precedente (stesso tipo, stesso alunno) tramite `StoricoDocumentiService` e restituisce:

```
{ corrente: DocumentoEntity, storico: LazyRef<DocumentoStorico> }
```

Il campo `storico` è un `LazyRef` risolto solo se il template o il renderer vi accede. Questo mantiene il comportamento lazy descritto in `13_SERVIZI_STORICI.md`.

---

## 4. AlberoCartelle

**Libreria usata:** `DriveServiceFacade` (Infrastructure Layer, che usa internamente `GoogleApiWrapper` L1)

L'`AlberoCartelle` gestisce la struttura delle cartelle Google Drive in cui vengono salvati i documenti generati. DEVE implementare il pattern **findOrCreate**: DEVE prima verificare in `LOG_FOLD` se la cartella esiste già (cercando per `PATH` e contestualmente per `CLASSI` o `UTENTI`, con ricerca per contenimento essendo entrambe colonne CSV); se non esiste, DEVE crearla tramite `DriveServiceFacade.createFolder()` e registrare il risultato in `LOG_FOLD`. Questo previene la creazione di cartelle duplicate e riduce le chiamate all'API Drive.

**Nota architetturale:** come tutte le operazioni Drive di SGSA, la creazione fisica della cartella DEVE passare per `DriveServiceFacade` e MAI direttamente per `GoogleApiWrapper`, in linea con il principio stabilito in `08_ARCHITETTURA_DI_PATTERN.md` (centralizzazione di logging, error handling e mocking) e coerentemente con `10_PIPELINE_DOCUMENTI.md`, Step 3.

### Convenzione struttura cartelle

**Per documenti di classe** (verbali, registri presenze):
```
[Root Drive SGSA]
  └── [Anno Scolastico, es. "2025-2026"]
        └── [Tipo Documento, es. "Verbali CDC"]
              └── [Classe, es. "5ALC"]
                    └── [File generati]
```

**Per documenti personalizzati degli alunni** (PDP, PEI, PFP):
```
[Root Drive SGSA]
  └── [Anno Scolastico]
        └── [Tipo Documento, es. "Piani Personalizzati"]
              └── [Classe]
                    └── [Alunno, es. "Rossi_Mario"]
                          └── [File]
```

Il percorso della cartella di destinazione viene calcolato da `PrepareInfrastructureStep` risolvendo il template `CONF_DOC.PATH_OUT` tramite `WorkspaceTemplateEngine` (es. `"Verbali/{{focus.classe.anagrafica.anno}}"` → `"Verbali/5"`), e poi passato ad `AlberoCartelle` per la creazione o il recupero.

---

## 5. Motore di Espressioni

**Libreria usata:** `GasExpressionEngineLib` (L2)

Le espressioni booleane usate in `CONF_DOC.CONDIZIONE`, nei campi `prerequisiti` del `BOX_CFG` e nelle condizioni dei passi pipeline DEVONO essere valutate da `GasExpressionEngineLib`. SGSA NON DEVE implementare alcun parser di espressioni proprio.

### Sintassi usata da SGSA

**Accesso a valori CDU:**
```
{{focus.classe.anagrafica.anno}}
{{focus.alunno.didattica.piani.hasBes}}
```

**Operatori di confronto:** `==`, `!=`, `>`, `<`, `>=`, `<=`

**Operatori logici:** `&&`, `||`, `!`

**Operatore di appartenenza:**
```
{{focus.classe.anagrafica.indirizzo.sigla}} in ['LC','LS']
```

### Flusso di valutazione

1. I placeholder `{{...}}` vengono risolti da `WorkspaceTemplateEngine` usando il CDU come contesto
2. La stringa risultante (es. `"5 == 5"`) viene passata a `GasExpressionEngineLib` per la valutazione booleana
3. Il risultato (`true` o `false`) determina il comportamento del componente (generazione, visibilità box, ecc.)

---

## 6. Motore di Template

**Libreria usata:** `WorkspaceTemplateEngine` (L2)

Tutti i placeholder testuali in SGSA DEVONO essere risolti da `WorkspaceTemplateEngine`. SGSA NON DEVE usare Mustache.js né librerie custom di templating.

### Sorgenti con placeholder processate dal motore

| Sorgente | Tipo |
|----------|------|
| `CONF_MAIL.OGGETTO` | Oggetto dell'email |
| `CONF_DOC.FILE_NAME` | Nome del file generato |
| `CONF_DOC.PATH_OUT` | Percorso della cartella di destinazione |
| Criteri dei `POST_PROCESSO` in `CONF_DOC` e `CONF_MAIL` | Valori di ricerca per azioni automatiche |
| `BOX_CFG[].CONTENUTO` per il tipo `testo_dinamico` | Contenuto HTML del box |
| Espressioni condizionali (prima della valutazione da parte di `GasExpressionEngineLib`) | Valori da confrontare |
| Contenuti interni dei template Google Docs e Sheets | Placeholder sostituiti a livello documento |

### Sintassi

`{{percorso.nel.cdu}}` — accesso a proprietà tramite dot notation sull'oggetto CDU piatto prodotto dal `ViewModelMapper`.

### Filtri supportati usati da SGSA

| Filtro | Effetto | Esempio |
|--------|---------|---------|
| `date` | Formattazione date | `{{meta.date.oggi \| date:'dd/MM/yyyy'}}` |
| `uppercase` | Conversione in maiuscolo | `{{focus.classe.anagrafica.nome \| uppercase}}` |
| `lowercase` | Conversione in minuscolo | `{{destinatario.anagrafica.nome \| lowercase}}` |

Il motore accede al CDU tramite l'oggetto piatto prodotto dal `ViewModelMapper` (descritto in `09_CONTEXT_ENGINE.md`). SOLO le proprietà scalari serializzabili sono accessibili nei template. Il blocco `tech` NON DEVE MAI essere accessibile come variabile di template.

### Comportamento per i documenti Google Docs

`WorkspaceTemplateEngine` gestisce internamente la **Reverse-Order Strategy** per Google Docs: modifica i placeholder dall'ultima alla prima occorrenza nel documento, evitando lo shift degli indici che si verificherebbe con la sostituzione sequenziale da inizio documento. SGSA NON DEVE reimplementare questa logica.

**Nota performance documenti lunghi:** per documenti con centinaia di placeholder (>100 pagine), il tempo di sostituzione può approssimare i limiti di esecuzione GAS. In questi casi, la Strategy di rendering deve suddividere il lavoro in batch con `yield` di checkpoint gestiti da `JobRunnerLib` (vedi `10_PIPELINE_DOCUMENTI.md`, Step 7); `WorkspaceTemplateEngine` non gestisce questo chunking automaticamente.
