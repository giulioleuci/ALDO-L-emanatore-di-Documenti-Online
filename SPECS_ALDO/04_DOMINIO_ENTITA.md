# 04 — Dominio: Entità

Questo documento descrive tutte le entità del dominio SGSA: ruolo nel sistema, responsabilità, relazioni con altre entità, invarianti e metodi di dominio. Per lo schema fisico delle tabelle corrispondenti, vedi `01_SCHEMA_DATABASE.md`. Per i Value Object usati come tipi, vedi `03_VALUE_OBJECTS_ED_ENUM.md`.

---

## Classificazione degli Aggregati

| Entità                  | Aggregate Root | Membro di | Note                                                                                            |
| ----------------------- | -------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Alunno                  | ✅             | —         | Comprende Carenza, Piano, MovimentoAlunno, OreASL                                               |
| Docente                 | ✅             | —         | Correlato (FK logica) a Supplenza (come titolare) e RuoloSpeciale; non li comprende come membri |
| Classe                  | ✅             | —         | Comprende Progetto; gestisce cattedre via colonne dinamiche                                     |
| Materia                 | ✅             | —         | Lookup table; usata come colonne in CLASSI e CARENZE                                            |
| Indirizzo               | ✅             | —         | Lookup table                                                                                    |
| Dipartimento            | ✅             | —         | Lookup table                                                                                    |
| RuoloSpeciale           | ✅             | —         | Lookup table                                                                                    |
| ConfigurazioneDocumento | ✅             | —         | Correlato (FK logica) a LogDocumento e LogCartella, non li comprende come membri                |
| ConfigurazioneEmail     | ✅             | —         | Correlato (FK logica) a LogEmail, non lo comprende come membro                                  |
| ConfigurazioneImport    | ✅             | —         |                                                                                                 |
| Supplenza               | ✅             | —         | Critica per routing email e permessi; correlata a Docente (titolare e supplente)                |
| VariazioneCattedra      | ✅             | —         | Correlata (FK logica) a Docente e Classe; rappresenta i cambi di titolarità permanenti          |
| LogDocumento            | ✅             | —         | Audit trail append-only                                                                         |
| LogCartella             | ✅             | —         | Audit trail append-only                                                                         |
| LogEmail                | ✅             | —         | Audit trail append-only                                                                         |
| Carenza                 | —              | Alunno    | Struttura a matrice con colonne dinamiche                                                       |
| Piano                   | —              | Alunno    |                                                                                                 |
| Progetto                | —              | Classe    |                                                                                                 |
| MovimentoAlunno         | —              | Alunno    | Audit trail                                                                                     |
| OreASL                  | —              | Alunno    |                                                                                                 |

---

## 1. Alunno

**Tabella:** `ALUNNI` | **Chiave primaria:** `EMAIL`

### Ruolo nel dominio

Rappresenta uno studente iscritto all'istituto. È l'Aggregate Root del gruppo che comprende le carenze, i piani personalizzati, le ore ASL e la mobilità studentesca. Tutte le operazioni che modificano questi oggetti correlati devono passare attraverso `Alunno` o il suo repository.

### Value Object associati

- `Email` (PK)
- `ClasseId`
- `ReligioneScelta`

### Relazioni

- Appartiene a una `Classe` (via `CLASSE → CLASSI.ID`)
- Ha zero o più `Carenza` (via `CARENZE.STUDENTE`)
- Ha zero o più `Piano` (via `PIANI.STUDENTE`)
- Ha zero o più `OreASL` (via `ASL.STUDENTE`)
- Ha zero o più `MovimentoAlunno` (via `MOV_ALUNNI.STUDENTE`)

### Invarianti

- Un alunno NON PUÒ MAI avere più di un piano attivo per ogni valore specifico di `TipoPiano` (`PDP_DSA`, `PDP_BES`, `PDP_STRANIERI`, `PEI`, `PFP`).
- Ogni carenza DEVE essere associata alla classe corrente dell'alunno al momento della rilevazione.
- Un movimento di tipo `OUT` DEVE impostare `attivo = false`.

**Nota RELIGIONE:** se il campo `ALUNNI.RELIGIONE` è NULL, il costruttore dell'entità Alunno DEVE applicare `ReligioneScelta.SI` come default.

### Metodi di dominio

#### `isAttivo(): boolean`

Restituisce `true` se il flag `ATTIVO` è `true`. Gli studenti non attivi sono ritirati o trasferiti.

#### `isRipetente(): boolean`

Restituisce `true` se il flag `RIPETENTE` è `true`.

#### `isRappresentante(): boolean`

Restituisce `true` se il flag `RAPPR_STUD` è `true`.

#### `getTutors(): Email[]`

Restituisce l'array delle email non nulle tra `TUTOR_1` e `TUTOR_2`. Array vuoto se nessun tutor è configurato.

#### `getNomeCompleto(): string`

Restituisce `"${COGNOMENOME}"`.

#### `getCurriculum(): Map<MateriaId, string[]>`

Parsa il JSON `ALUNNI.CURRICULUM`; restituisce mappa vuota se null. La chiave è il MateriaId; il valore è l'array delle specificità scelte per quella materia.

#### `getSpecificita(materiaId: MateriaId): string[]`

Specificità scelte per la materia indicata, lette da `getCurriculum()`. Restituisce array vuoto se la materia non è nel curriculum.

#### `getIndirizzoStudente(): IndirizzoId`

Restituisce l'indirizzo della classe partner dell'alunno (CLASSI.INDIRIZZO).
Implementato come metodo del repository (AlunnoRepository) tramite join
ALUNNI → CLASSI; non disponibile come metodo standalone dell'entità senza
che la Classe sia stata eager-loaded nell'aggregato.

---

## 2. Docente

**Tabella:** `DOCENTI` | **Chiave primaria:** `EMAIL`

### Ruolo nel dominio

Rappresenta un insegnante dell'istituto. È l'Aggregate Root per le supplenze di cui è titolare e per i ruoli speciali che ricopre. La sua email è l'identificativo con cui viene referenziato nella matrice delle cattedre (colonne dinamiche di `CLASSI`).

### Value Object associati

- `Email` (PK)
- `Genere`
- `DipartimentoId`

### Relazioni

- Appartiene a un `Dipartimento` (via `DIPART → DIPART.ID`)
- Appare in colonne dinamiche di `CLASSI` come titolare di cattedra
- Può avere `Supplenza[]` come titolare
- Può avere `Supplenza[]` come supplente
- Può avere `RuoloSpeciale[]` assegnati

### Metodi di dominio

#### `getAppellativo(): string`

Restituisce `"Prof."` se `GENERE = M`, `"Prof.ssa"` se `GENERE = F`.

#### `getNomeCompleto(): string`

Restituisce `"${COGNOME} ${NOME}"`.

#### `getNomeCompletoConAppellativo(): string`

Restituisce `"${getAppellativo()} ${getNomeCompleto()}"`.
Esempio: `Genere = F, Cognome = Bianchi, Nome = Giulia` → `"Prof.ssa Bianchi Giulia"`

#### `isITP(): boolean`

Restituisce `true` se il flag `ITP` è `true`. I docenti ITP affiancano il titolare di materia in laboratorio senza essere titolari della disciplina.

---

## 3. Classe

**Tabella:** `CLASSI` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Rappresenta una classe scolastica e funge da **matrice di assegnazione cattedre**: per ogni materia, contiene le email dei docenti assegnati tramite colonne dinamiche. È l'Aggregate Root per i progetti ad essa associati. La struttura può essere standard o articolata (classe parent con due classi partner).

### Value Object associati

- `ClasseId` (PK)
- `AnnoCorso`
- `IndirizzoId`
- `ArticolazioneConfig` (opzionale)
- `RuoliClasse`

### Relazioni

- Appartiene a un `Indirizzo` (via `INDIRIZZO → INDIRIZZI.ID`)
- Contiene `Alunno[]` (via `ALUNNI.CLASSE`)
- Ha docenti assegnati per materia (via colonne dinamiche)
- Ha zero o più `Progetto[]`
- Può avere una classe partner/parent in caso di articolazione

### Invarianti

- Una classe DEVE avere almeno un coordinatore.
- Ogni coordinatore DEVE essere presente nel CDC della classe.
- Una classe articolata DEVE avere un partner valido nel database.

### Metodi di dominio

#### `getId(): ClasseId`

Restituisce il `ClasseId` della classe.

#### `getAnnoCorso(): AnnoCorso`

Restituisce l'`AnnoCorso` dal campo `ANNO`.

#### `isAttiva(): boolean`

Restituisce `true` se il flag `ATTIVA` è `true`.

#### `isArticolata(): boolean`

Restituisce `true` se il campo `ARTICOLAZIONE` è non null e non vuoto.

#### `getArticolazione(): ArticolazioneConfig | null`

Restituisce l'`ArticolazioneConfig` parsata dal JSON in `ARTICOLAZIONE`, oppure `null`.

#### `getStorico(): ClasseId[]`

Restituisce l'array di `ClasseId` parsati dal CSV nel campo `STORICO`. Array vuoto se il campo è null o vuoto.
Esempio: `STORICO = "4ALC,3ALC"` → `[ClasseId("4ALC"), ClasseId("3ALC")]`

#### `getClasseAnnoPrecedente(): ClasseId | null`

Restituisce il primo elemento di `getStorico()`, oppure `null` se lo storico è vuoto.

#### `getRuoliClasse(): RuoliClasse`

Restituisce l'oggetto `RuoliClasse` parsato dal JSON in `RUOLI`. Se `RUOLI` è null, restituisce un `RuoliClasse` vuoto.

#### `getCoordinatoriEmail(): Email[]`

Restituisce l'array di `Email` parsate dal CSV nel campo `COORD`. Array vuoto se il campo è null.

---

## 4. Materia

**Tabella:** `MATERIE` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Catalogo delle discipline insegnate. Definisce i codici univoci (sigle) usati come nomi di colonne dinamiche nelle tabelle `CLASSI` e `CARENZE`. Contiene metadati grafici (colori, simbolo) e di configurazione per gli esami. È una lookup table: i suoi record sono pochi, stabili e cachati completamente in memoria a runtime.

### Value Object associati

- `MateriaId` (PK)
- `EsameConfig`

### Metodi di dominio

#### `getId(): MateriaId`

Restituisce il `MateriaId` della materia.

#### `getColori(): { primario: string, secondario: string }`

Restituisce i due colori hex (`COLORE_1` e `COLORE_2`) della materia.

#### `isEsameIndirizzo(indirizzo: IndirizzoId, tipoProva: "prima" | "seconda"): boolean`

Restituisce `true` se la materia è oggetto della prova specificata per quell'indirizzo. Delega a `EsameConfig`.

---

## 5. Indirizzo

**Tabella:** `INDIRIZZI` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Definisce i percorsi di studio disponibili nell'istituto (es. Liceo Classico, Scientifico). Lookup table stabile e cachata.

### Value Object associati

- `IndirizzoId` (PK)
- `TipoIstituto`

### Campi

- `TIPO: TipoIstituto` — tipo di istituto (vedi `03_VALUE_OBJECTS_ED_ENUM.md`)

### Metodi di dominio

#### `getId(): IndirizzoId`

Restituisce l'`IndirizzoId`.

#### `getTipo(): TipoIstituto`

Restituisce il valore del campo `TIPO`.

---

## 6. Dipartimento

**Tabella:** `DIPART` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Raggruppa docenti e materie per area disciplinare. Ogni docente appartiene a un dipartimento; ogni dipartimento ha un capo designato. Lookup table cachata.

### Value Object associati

- `DipartimentoId` (PK)
- `Email` (capo)
- `MateriaId[]` (materie via CSV)

### Metodi di dominio

#### `getMaterie(): MateriaId[]`

Restituisce l'array di `MateriaId` parsati dal CSV nel campo `MATERIE`. Array vuoto se null.

#### `getCapoEmail(): Email`

Restituisce l'`Email` del capo dipartimento.

---

## 7. RuoloSpeciale

**Tabella:** `RUOLI` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Mappa gli incarichi istituzionali straordinari (es. Animatore Digitale, Referente BES) al docente correntemente incaricato. Lookup table stabile. Il `RisolutoreRuoliService` usa questa tabella per la `ReferenteStrategy`: qualsiasi ID presente in `RUOLI` può essere usato come ruolo in `CONF_DOC.PERMESSI` o `CONF_MAIL.SUPPLENTI` senza modifiche al codice.

### Value Object associati

- `Email[]` (docenti incaricati, parsati dal CSV in `DOCENTE`)

### Metodi di dominio

#### `getDocentiEmail(): Email[]`

Restituisce l'array di `Email` parsate dal CSV `DOCENTE`. Un ruolo può essere ricoperto da più docenti contemporaneamente.

---

## 8. ConfigurazioneDocumento

**Tabella:** `CONF_DOC` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Contiene tutti i metadati necessari alla generazione di un tipo di documento. È il punto di configurazione dichiarativa del motore documentale: il comportamento dell'intera pipeline è determinato da questo record senza modifiche al codice.

### Value Object associati

- `TipoDocumento`
- `FormatoOutput`
- `ModelliConfig`
- `PermessiConfig`
- `PostProcessActions[]`

### Metodi di dominio

#### `shouldGenerate(cdu: CDU, expressionEngine: ExpressionEngine): boolean`

Valuta l'espressione in `CONDIZIONE` usando il CDU come contesto. Se `CONDIZIONE` è null o vuoto, restituisce sempre `true`.

#### `getTemplateId(cdu: CDU): string`

Restituisce l'ID del template Drive da usare. Delega a `ModelliConfig.getTemplateId(cdu)`. Eccezione se nessun template è applicabile.

---

## 9. ConfigurazioneEmail

**Tabella:** `CONF_MAIL` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Definisce il pattern completo di una notifica email: oggetto, iterazione destinatari, box dinamici, testo statico, regole supplenze, azioni post-invio. È il punto di configurazione dichiarativa del motore email.

### Value Object associati

- `ProcessoInvio`
- `GestioneSupplenti`
- `BoxConfig[]`
- `PostProcessActions[]`

### Metodi di dominio

#### `getBoxes(): BoxConfig[]`

Restituisce l'array di `BoxConfig` parsato dal JSON in `BOX_CFG`. Array vuoto se null.

#### `isNoReply(): boolean`

Restituisce il valore del campo `NOREPLY`.

#### `shouldSend(cdu: CDU, expressionEngine: ExpressionEngine): boolean`

Valuta l'espressione in `CONDIZIONE` usando il CDU come contesto. Se `CONDIZIONE` è null o vuoto, restituisce sempre `true`.

---

## 10. ConfigurazioneImport

**Tabella:** `CONF_IMP` | **Chiave primaria:** `ID`

### Ruolo nel dominio

Configura un job ETL per importare dati da file esterni (Excel/CSV su Drive) nella tabella target del database. Ogni record è una ricetta di importazione completa.

### Value Object associati

- `ImportConfig`

### Metodi di dominio

#### `isAttivo(): boolean`

Restituisce il valore del campo `ATTIVO`.

#### `getColumnMapping(): Map<string, string>`

Restituisce la mappa da nome colonna esterna a nome colonna DB, parsata da `CONFIG.map`.

---

## 11. Carenza

**Tabella:** `CARENZE` | **Chiave primaria composita:** `(STUDENTE, PROGRESSIVO)` — non esiste una colonna `ID`

### Ruolo nel dominio

Registra le insufficienze di uno studente in una data specifica. La struttura è a **matrice**: ogni istanza corrisponde a una riga (studente × data), con colonne dinamiche per ogni materia. Una carenza può riguardare più materie contemporaneamente. È parte dell'aggregato `Alunno`.

### Value Object associati

- `CarenzaId` (PK)
- `Email` (studente)
- `ClasseId`
- `ValoreCarenza` (per ogni materia presente)
- `DataRilevazione`

### Metodi di dominio

#### `isNotificato(): boolean`

Restituisce `true` se il campo `NOTIFICATO` è non null e non vuoto.

#### `getNotificato(): Date | null`

Restituisce la data parsata dal campo `NOTIFICATO`, oppure `null`.

#### `hasAssenzeElevate(): boolean`

Restituisce il valore del flag `ASSENZE`.

#### `getNumeroCarenze(carenzePerMateria: Map<MateriaId, ValoreCarenza>): number`

Restituisce il numero di materie con carenza nella mappa fornita dal repository.

#### `hasCarenzaMateria(materia: MateriaId, carenzePerMateria: Map<MateriaId, ValoreCarenza>): boolean`

Restituisce `true` se la materia è presente nella mappa delle carenze.

#### `notifica(): void`

Imposta il campo `NOTIFICATO` con il timestamp corrente. Marca l'entità come dirty per il salvataggio successivo.

---

## 12. Piano

**Tabella:** `PIANI` | **Chiave primaria composita:** `(STUDENTE, TIPO)` — non esiste una colonna `ID` UUID

### Ruolo nel dominio

Rappresenta un Piano Didattico Personalizzato (PDP, nelle varianti `PDP_DSA`, `PDP_BES`, `PDP_STRANIERI`), un Piano Educativo Individualizzato (`PEI`) o un Piano Formativo Personalizzato (`PFP`). È parte dell'aggregato `Alunno` e non viene mai modificato indipendentemente.

### Value Object associati

- `TipoPiano`
- `PARAMETRI` (JSON, struttura variabile per tipo — vedi `01_SCHEMA_DATABASE.md`, tabella PIANI). La struttura è libera e dipende dal TipoPiano.

### Metodi di dominio

#### `isPDP(): boolean`

Restituisce `true` se `TIPO ∈ {PDP_DSA, PDP_BES, PDP_STRANIERI}`.

#### `isPEI(): boolean`

Restituisce `true` se `TIPO = PEI`.

#### `isPFP(): boolean`

Restituisce `true` se `TIPO = PFP`.

#### `isBES(): boolean`

true se isPDP() or isPEI() = true; false altrimenti (coerente con la nota di `03_VALUE_OBJECTS_ED_ENUM.md`: tutti i tipi tranne `PFP` implicano BES)

---

## 13. Progetto

**Tabella:** `PROGETTI` | **Chiave primaria composita:** `(CLASSE, TIPO, NOME)` — non esiste una colonna `ID` separata

### Ruolo nel dominio

Registra attività extracurricolari e percorsi PCTO (ex ASL) associati a una classe. È parte dell'aggregato `Classe`.

### Value Object associati

- `TipoProgetto`
- `ClasseId`

### Metodi di dominio

#### `isASL(): boolean`

Restituisce `true` se `TIPO = ASL`.

#### `getOreASLEffettive(): number`

Restituisce il valore del campo `ORE_ASL`. Le ore ASL sono un sottoinsieme delle ore totali del progetto.

---

## 14. Supplenza

**Tabella:** `SUPPLENZE` | **Chiave primaria composita:** `(TITOLARE, SUPPLENTE, DAL, CLASSI, MATERIE)` — non esiste una colonna `ID` UUID

### Ruolo nel dominio

Registra la sostituzione temporanea di un docente titolare. È l'entità con cui il sistema reindirizza permessi Drive e routing email dal titolare al supplente nel periodo indicato, con granularità per classe e materia. Costituisce il **Priority 1** nella gerarchia di risoluzione ruoli.

### Value Object associati

- `Email` (titolare e supplente)
- `PeriodoSupplenza`
- `ClassiScope`
- `MaterieScope`

### Metodi di dominio

#### `isAttivaOggi(): boolean`

Restituisce `true` se la data odierna è compresa nel periodo `[DAL, AL]`.

#### `isAttivaData(data: Date): boolean`

Restituisce `true` se `DAL ≤ data ≤ AL`.

#### `applicaAClasse(classe: ClasseId): boolean`

Restituisce `true` se `CLASSI = "*"` oppure se il CSV di `CLASSI` contiene l'ID della classe.

#### `applicaAMateria(materia: MateriaId): boolean`

Restituisce `true` se `MATERIE = "*"` oppure se il CSV di `MATERIE` contiene la sigla.

#### `applicaAContesto(classe: ClasseId, materia: MateriaId): boolean`

Restituisce `true` solo se `applicaAClasse(classe) && applicaAMateria(materia)`.

**Catena di supplenze:** una `Supplenza` PUÒ avere come `TITOLARE` l'email di un docente che è a sua volta `SUPPLENTE` in un altro record (supplenza del supplente, con profondità illimitata). La risoluzione del sostituto effettivo DEVE seguire la catena ricorsivamente fino all'ultimo supplente attivo per la data e il contesto richiesti.

---

## 15. VariazioneCattedra

**Tabella:** `VARIAZIONI_CATTEDRA` | **Chiave primaria composita:** `(CLASSE_ID, MATERIA_ID)`

### Ruolo nel dominio

Registra un cambio permanente di titolarità di cattedra avvenuto dopo l'inizio dell'anno scolastico. È un Aggregate Root indipendente, correlato a `Docente` (tramite `VECCHIO_TITOLARE`/`NUOVO_TITOLARE`) e a `Classe` (tramite `CLASSE_ID`) mediante chiave esterna logica; non è membro di alcun aggregato. Rappresenta il livello **Priority 2** nella gerarchia di risoluzione ruoli: sovrascrive la matrice `CLASSI` ma è sovrascrivibile da una `SUPPLENZE` attiva.

### Value Object associati

- `ClasseId`, `MateriaId`, `Email`

### Invarianti

- `DATA_DECORRENZA` DEVE essere successiva all'inizio dell'anno scolastico corrente (anno corrente = prima riga del Master Sheet, SEMPRE ordinato per anno decrescente — vedi `06_REPOSITORY.md`).

---

## 16. MovimentoAlunno

**Tabella:** `MOV_ALUNNI` | **Chiave primaria composita:** `(STUDENTE, TIPO, DATA)` — non esiste una colonna `ID` UUID

### Ruolo nel dominio

Traccia gli eventi di mobilità di uno studente: ingressi, uscite, trasferimenti interni. È parte dell'aggregato `Alunno` e costituisce il suo storico di mobilità. Registro append-only.

### Value Object associati

- `TipoMovimento`
- `Email` (studente)
- `ProvenienzaDestinazione` (campi `DA` e `A`)

### Metodi di dominio

#### `isIngresso(): boolean`

Restituisce `true` se `TIPO = IN`.

#### `isUscita(): boolean`

Restituisce `true` se `TIPO = OUT`.

#### `isCambioClasse(): boolean`

Restituisce `true` se `TIPO = CAMBIO`.

---

## 17. OreASL

**Tabella:** `ASL` | **Chiave primaria:** composta `(STUDENTE, ANNO)`

### Ruolo nel dominio

Mantiene il cumulativo di ore PCTO (ex ASL) accumulate da uno studente per anno scolastico. È parte dell'aggregato `Alunno`.

### Value Object associati

- `Email` (studente, PK parte 1)
- `AnnoScolastico` (PK parte 2)

### Metodi di dominio

#### `getOre(): number`

Restituisce le ore accumulate nell'anno.

---

## 18. LogDocumento

**Tabella:** `LOG_DOCS` | **Chiave primaria:** `ID` (Drive File ID)

### Ruolo nel dominio

Registro immutabile (append-only) di ogni documento generato dal sistema. Lega l'ID fisico su Google Drive alla configurazione che lo ha generato, alla classe e all'utente associati. Mantiene lo stato nel ciclo di vita del documento.

### Value Object associati

- `DriveFileId` (PK)
- `StatoDocumento`
- `ClasseId` (opzionale)
- `Email` (utente, opzionale)
- `MateriaId` (opzionale)

### Metodi di dominio

#### `isNotificato(): boolean`

Restituisce `true` se il campo `NOTIFICATO` è non null e non vuoto.

#### `getLink(): string`

Restituisce l'URL di accesso al file su Drive.

#### `cambiaStato(nuovoStato: StatoDocumento): void`

Aggiorna il campo `STATO`. Marca dirty. La validazione delle transizioni di stato DEVE essere effettuata dal servizio applicativo e NON dall'entità.

#### `notifica(): void`

Imposta il campo `NOTIFICATO` con il timestamp corrente. Marca dirty.

---

## 19. LogCartella

**Tabella:** `LOG_FOLD` | **Chiave primaria:** `ID` (Drive Folder ID)

### Ruolo nel dominio

Registro immutabile delle cartelle create su Google Drive. Mappa l'ID fisico alla configurazione che l'ha originata. Append-only.

### Value Object associati

- `DriveFolderId` (PK)
- `ClasseId` (opzionale)
- `Email` (utente, opzionale)
- `MateriaId` (opzionale)

### Metodi di dominio

#### `getUrl(): string`

Restituisce l'URL di accesso alla cartella su Drive.

---

## 20. LogEmail

**Tabella:** `LOG_MAIL` | **Chiave primaria composita:** `(PATTERN, DESTINATARI, DATA)` — non esiste una colonna `ID` UUID

### Ruolo nel dominio

Registro immutabile di ogni email inviata dal sistema. Traccia destinatari, pattern utilizzato, esito, allegati. Append-only.

### Value Object associati

- `StatoEmail`
- `AllegatiInfo`

### Metodi di dominio

#### `isSuccesso(): boolean`

Restituisce `true` se `STATO = SUCCESS`.

#### `getDestinatari(): Email[]`

Restituisce l'array di `Email` parsate dal CSV nel campo `DESTINATARI`.
