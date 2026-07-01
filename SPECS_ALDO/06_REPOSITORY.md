# 06 — Repository

Questo documento descrive i contratti di tutti i repository del sistema SGSA. I repository disaccoppiano la logica di business dalla persistenza su Google Sheets, esponendo un'interfaccia orientata al dominio.

**Libreria di riferimento:** `DomainRepositoryLib` (L3) fornisce la base class `Repository` da cui derivano tutti i repository SGSA.

---

## Pattern generali

### Unit of Work

Tutti i repository DEVONO condividere la stessa istanza di `DatabaseService`. Le modifiche alle entità vengono accumulate in memoria: i metodi `save()` e `saveMany()` DEVONO marcare le entità come dirty e NON DEVONO MAI scrivere immediatamente su Sheet. La persistenza avviene SOLO con la chiamata esplicita a `database.save()`, che scrive tutte le righe dirty in un'unica operazione batch.

Questo pattern riduce drasticamente il numero di chiamate alle Google API e previene race condition.

---

### Colonne dinamiche

Le tabelle `CLASSI` e `CARENZE` contengono colonne generate a runtime per ogni materia (pattern: `[SIGLA_MATERIA]` e `[SIGLA_MATERIA.itp]`). I repository corrispondenti mantengono internamente una mappa `_materieColumns: Map<MateriaId, { main: string, itp?: string }>` inizializzata al bootstrap leggendo la tabella `MATERIE`.

Non tutte le materie hanno una colonna ITP; `getITPPerMateria()` DEVE restituire `[]` se la colonna non esiste.

---

### Caching

Le tabelle di lookup piccole e stabili (`MATERIE`, `INDIRIZZI`, `DIPART`, `RUOLI`) DEVONO essere caricate integralmente in memoria al primo accesso e mantenute per tutta la durata della sessione GAS corrente. Le tabelle operative DEVONO essere caricate on-demand e NON DEVONO MAI essere cachate a livello di tabella intera (SOLO a livello di singola entità dove esplicitamente indicato).

---

### Metodi standard (comuni a tutti i repository)

Ogni repository espone i seguenti metodi standard:

| Metodo | Comportamento |
|--------|---------------|
| `findById(id): Entità \| null` | Restituisce l'entità corrispondente, oppure `null` |
| `findByIdOrFail(id): Entità` | Come `findById`, ma solleva `EntityNotFoundException` se non trovata |
| `findAll(): Entità[]` | Tutti i record della tabella |
| `find(spec: Specification): Entità[]` | Filtra per specification; query a livello DB se `toQueryObject()` non null, altrimenti filtra in memoria |
| `findOne(spec): Entità \| null` | Primo record che soddisfa la specification, o `null` |
| `save(entità): void` | Marca l'entità dirty per il salvataggio batch |
| `saveMany(entità[]): void` | Marca tutti gli elementi dirty |

---

## Riepilogo repository

| # | Repository | Tabella | PK | Cache |
|---|-----------|---------|----|----|
| 0 | MasterSheetRepository | Master Sheet | ANNO_SCOLASTICO | ✅ Completa |
| 1 | AlunnoRepository | ALUNNI | EMAIL | No |
| 2 | DocenteRepository | DOCENTI | EMAIL | No |
| 3 | ClasseRepository | CLASSI | ID | No |
| 4 | MateriaRepository | MATERIE | ID | ✅ Completa |
| 5 | IndirizzoRepository | INDIRIZZI | ID | ✅ Completa |
| 6 | DipartimentoRepository | DIPART | ID | ✅ Completa |
| 7 | RuoloSpecialeRepository | RUOLI | ID | ✅ Completa |
| 8 | ConfigurazioneDocumentoRepository | CONF_DOC | ID | No |
| 9 | ConfigurazioneEmailRepository | CONF_MAIL | ID | No |
| 10 | ConfigurazioneImportRepository | CONF_IMP | ID | No |
| 11 | CarenzaRepository | CARENZE | (STUDENTE, PROGRESSIVO) — composita | No |
| 12 | PianoRepository | PIANI | (STUDENTE, TIPO) — composita | No |
| 13 | ProgettoRepository | PROGETTI | (CLASSE, TIPO, NOME) — composita | No |
| 14 | SupplenzaRepository | SUPPLENZE | (TITOLARE, SUPPLENTE, DAL, CLASSI, MATERIE) — composita | ✅ Attive oggi (1h TTL) |
| 15 | MovimentoAlunnoRepository | MOV_ALUNNI | (STUDENTE, TIPO, DATA) — composita | No |
| 16 | OreASLRepository | ASL | (STUDENTE, ANNO) | No |
| 17 | LogDocumentoRepository | LOG_DOCS | ID | No |
| 18 | LogCartellaRepository | LOG_FOLD | ID | No |
| 19 | LogEmailRepository | LOG_MAIL | (PATTERN, DESTINATARI, DATA) — composita | No |
| 20 | VariazioneCattedraRepository | VARIAZIONI_CATTEDRA | (CLASSE_ID, MATERIA_ID) | No |

---

## 0. MasterSheetRepository

**Tabella:** Master Sheet (esterno) | **PK:** `ANNO_SCOLASTICO` | **Cache:** completa
**Dipendenze:** Nessuna

Il `MasterSheetRepository` è l'unico componente del sistema che conosce l'ID del Master Sheet. Gestisce la mappatura tra gli anni scolastici e i relativi database fisici. È la sorgente di verità che sostituisce l'uso di `PropertiesService` per la configurazione del `SPREADSHEET_ID`.

### Query dominio-specifiche

#### `findConfigPerAnno(anno: string): MasterConfig | null`
Restituisce la configurazione (ID spreadsheet, cartella Drive, Dirigente) per l'anno specificato (formato `YYYY-YYYY`).

#### `findConfigAnnoCorrente(): MasterConfig`
Restituisce la configurazione della **prima riga** del Master Sheet. Il foglio è sempre mantenuto in ordine cronologico decrescente per `ANNO_SCOLASTICO`: la prima riga è quindi sempre l'anno corrente. Non è coinvolto alcun calcolo né alcun parametro globale impostato manualmente. È il punto di ingresso per l'inizializzazione del `DatabaseService`.

#### `findAnniStorici(limit: number): MasterConfig[]`
Restituisce le righe successive alla prima (già ordinate per anno decrescente), fino a `limit` elementi. Usato dallo `StoricoProvider`.

### Navigazione

#### `getSpreadsheetId(config: MasterConfig): string`
Restituisce il valore della colonna `ID_SPREADSHEET`.

#### `getCartellaRoot(config: MasterConfig): string`
Restituisce il valore della colonna `ID_CARTELLA_GOOGLE`.

#### `getDirigente(config: MasterConfig): string`
Restituisce il valore della colonna `DIRIGENTE_SCOLASTICO`.

---

## 1. AlunnoRepository

**Tabella:** `ALUNNI` | **PK:** `EMAIL`  
**Dipendenze:** `ClasseRepository`, `CarenzaRepository`, `PianoRepository`, `OreASLRepository`, `MovimentoAlunnoRepository`

### Query dominio-specifiche

#### `findByClasse(classeId: ClasseId): Alunno[]`
Restituisce gli alunni con `CLASSE = classeId`, ordinati per `COGNOMENOME`.

#### `findAttivi(): Alunno[]`
Restituisce gli alunni con `ATTIVO = true`.

#### `findAttiviInClasse(classeId: ClasseId): Alunno[]`
Restituisce gli alunni con `ATTIVO = true` e `CLASSE = classeId`, ordinati per `COGNOMENOME`.

#### `findConBES(): Alunno[]`
Restituisce gli alunni con almeno un `Piano` attivo per cui `Piano.isBES() = true`.
Delega a `PianoRepository` per ottenere la lista degli studenti con BES, poi carica le entità `Alunno` corrispondenti.

#### `findByClasseEIndirizzo(classeId: ClasseId, indirizzo: IndirizzoId): Alunno[]`
Restituisce gli studenti dell'indirizzo specificato all'interno della classe indicata.
Implementazione: poiché per le classi articolate `ALUNNI.CLASSE` valorizza l'ID della **classe partner** (vedi `01_SCHEMA_DATABASE.md`), un `findByClasse(classeId)` diretto non produce risultati quando `classeId` è una classe parent. Algoritmo: se `classeId` è una classe parent (`ClasseRepository.isArticolata` e `getClassiPartner(classeId).length > 0`), risolve i partner via `getClassiPartner(classeId)`, individua quello il cui `INDIRIZZO` corrisponde a `indirizzo` ed esegue `findByClasse()` su quella classe partner; altrimenti (classe standard o già classe partner) verifica che `Classe.INDIRIZZO` corrisponda a `indirizzo` ed esegue `findByClasse(classeId)`, restituendo `[]` in caso contrario. Essenziale per classi articolate per filtrare gli studenti per indirizzo.

#### `findByClasseParent(parentId: ClasseId): Alunno[]`
Restituisce tutti gli studenti delle classi partner della classe parent indicata.
Internamente: trova i partner via `ClasseRepository.getClassiPartner(parent)`,
poi esegue `findByClasse(p)` per ogni partner e unisce i risultati, ordinati per `COGNOMENOME`.

#### `findBySpecificita(classeId: ClasseId, materiaId: MateriaId, specifica: string): Alunno[]`
Alunni di una classe che hanno la specificità indicata nel loro `CURRICULUM`.
Implementazione: `findByClasse(classeId)`, poi filtra in memoria controllando `ALUNNI.CURRICULUM`.

#### `getCurriculum(alunno: Alunno): Map<MateriaId, string[]>`
Legge e parsa `ALUNNI.CURRICULUM`. Restituisce mappa vuota se il campo è null.

### Navigazione aggregato

#### `getClasse(alunno: Alunno, articolazione?: ArticolazioneRuolo): Classe`
Restituisce la `Classe` dell'alunno. Solleva `EntityNotFoundException` se non trovata.

- **`articolazione = 'partner'`**: restituisce la `Classe` a cui punta direttamente `alunno.CLASSE` — per studenti di classi articolate è la classe partner (es. `4A-LC`); per studenti di classi standard coincide con la classe stessa (es. `3B`).
- **Nessun parametro o `articolazione = 'parent'`**: per studenti di classi articolate, risale alla classe parent tramite `ClasseRepository.getClasseParent()` (es. `4A`); per studenti di classi standard, restituisce la classe stessa (non esiste parent).

#### `getIndirizzoStudente(alunno: Alunno): IndirizzoId`
Restituisce l'`IndirizzoId` effettivo dello studente tramite join `ALUNNI → CLASSI`: legge la classe a cui punta direttamente `ALUNNI.CLASSE` (per gli studenti di classi articolate è la classe **partner**, es. `4A-LC`; per le classi standard è la classe stessa) e ne restituisce il campo `CLASSI.INDIRIZZO`. Solleva `EntityNotFoundException` se la classe non esiste. È la fonte autorevole dell'indirizzo dello studente citata in `01_SCHEMA_DATABASE.md` e `04_DOMINIO_ENTITA.md`.

#### `getTutors(alunno: Alunno): Email[]`
Restituisce l'array di email non nulle tra `TUTOR_1` e `TUTOR_2`.

#### `getCarenze(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[]`
Delega a `CarenzaRepository.findByAlunno()`. Se `annoScolastico` è specificato, filtra per range di date `[1-set-anno, 31-ago-anno+1]`.

#### `getPiani(alunno: Alunno): Piano[]`
Delega a `PianoRepository.findByAlunno()`.

#### `getOreASLTotali(alunno: Alunno): number`
Delega a `OreASLRepository.findByAlunno()` e somma le ore di tutti gli anni.

#### `getStoricoMovimenti(alunno: Alunno): MovimentoAlunno[]`
Restituisce tutti i movimenti, ordinati per `DATA DESC`.

---

## 2. DocenteRepository

**Tabella:** `DOCENTI` | **PK:** `EMAIL`  
**Dipendenze:** `DipartimentoRepository`, `ClasseRepository`, `SupplenzaRepository`

### Query dominio-specifiche

#### `findByDipartimento(dipartId: DipartimentoId): Docente[]`
Restituisce i docenti con `DIPART = dipartId`.

#### `findITP(): Docente[]`
Restituisce i docenti con `ITP = true`.

#### `findCoordinatori(): Docente[]`
Legge il CSV in `CLASSI.COORD` per ogni riga, raccoglie tutte le email (deduplicandole) e carica i `Docente` corrispondenti.

### Navigazione

#### `getDipartimento(docente: Docente): Dipartimento`
Restituisce il `Dipartimento` di appartenenza.

#### `getClassiInsegnate(docente: Docente, articolazione?: ArticolazioneRuolo): Map<Classe, MateriaId[]>`
Scansiona tutte le righe di `CLASSI`. Per ogni classe, itera le colonne dinamiche: se l'email del docente appare in una colonna materia, aggiunge la voce alla mappa. Restituisce `Map { Classe → [MateriaId...] }`.

Il parametro `articolazione` governa quale oggetto `Classe` viene usato come chiave nella Map per le classi articolate:

- **`'partner'`**: per classi articolate, la chiave è la classe partner specifica in cui il docente insegna (es. `4A-LC`); per classi standard, la classe stessa.
- **Nessun parametro o `'parent'`**: per classi articolate, la chiave è la classe parent aggregata (es. `4A`); per classi standard, la classe stessa.

#### `getMaterieInsegnate(docente: Docente): Set<MateriaId>`
Deduplica tutte le materie restituite da `getClassiInsegnate()`.

#### `getSupplenzaAttiva(docente: Docente, data: Date, classe?: ClasseId, materia?: MateriaId): Supplenza | null`
Cerca in `SUPPLENZE` con `TITOLARE = docente.EMAIL`, `DAL ≤ data ≤ AL`, e (se specificati) classe e materia compatibili. Restituisce il primo match.

---

## 3. ClasseRepository

**Tabella:** `CLASSI` | **PK:** `ID`  
**Dipendenze:** `MateriaRepository`, `DocenteRepository`, `AlunnoRepository`, `IndirizzoRepository`

> **Nota colonne dinamiche:** All'inizializzazione il repository costruisce:
> ```
> _materieColumns: Map<MateriaId, {
>   main: string,
>   itp?: string,
>   specifiche?: Map<string, SpecificitaId>   // chiave = nome specificità (es. "CHITARRA"), valore = SpecificitaId
> }>
> ```
> leggendo tutte le materie da `MateriaRepository`. Non tutte le materie hanno colonne ITP o specificità.

### Query dominio-specifiche

#### `findAttive(): Classe[]`
Classi con `ATTIVA = true`.

#### `findByAnno(anno: number): Classe[]`
Classi con `ANNO = anno`.

#### `findByIndirizzo(indirizzoId: IndirizzoId): Classe[]`
Classi con `INDIRIZZO = indirizzoId`.

#### `findArticolate(): Classe[]`
Classi con il campo `ARTICOLAZIONE` non null e non vuoto.

### Gestione cattedre (colonne dinamiche)

#### `getDocentiPerMateria(classe: Classe, materia: MateriaId): Docente[]`
1. Legge `_materieColumns.get(materia).main` per ottenere il nome della colonna.
2. Legge il CSV dalla riga della classe.
3. Per ogni email, carica il `Docente` da `DocenteRepository`.
Solleva `MateriaNotFoundException` se la materia non è nella mappa.

#### `getITPPerMateria(classe: Classe, materia: MateriaId): Docente[]`
Come `getDocentiPerMateria`, ma legge la colonna `.itp`.

#### `getDocentiPerSpecificita(classe: Classe, materiaId: MateriaId, specifica: string): Docente[]`
Come `getDocentiPerMateria`, ma legge la colonna `SpecificitaId` corrispondente (es. `INTERPRETAZIONE.CHITARRA`). Restituisce `[]` se la specificità non ha colonna nella classe.

#### `getAllSpecificitaAttive(classe: Classe, materiaId: MateriaId): string[]`
Lista le specificità della materia che hanno almeno un docente assegnato nella classe.

#### `getAllDocentiCDC(classe: Classe): Docente[]`
Itera tutte le colonne dinamiche (main e itp), raccoglie le email, deduplicale, carica i `Docente`. Ordinati per cognome.

#### `getAllDocentiCDCArticolata(classe: Classe): Docente[]`
1. Recupera `getAllDocentiCDC(classe)`.
2. Se `classe.isArticolata()`:
   - Se classe è **parent**: recupera `getAllDocentiCDC(p)` per ogni `p` in `getClassiPartner(classe)`.
   - Se classe è **partner**: recupera `getAllDocentiCDC(getClassePartner(classe))`.
3. Unisce e deduplica per email.

#### `getDocentiIRC(classe: Classe): Docente[]`
Legge la colonna speciale `CLASSI.IRC` (vedi `01_SCHEMA_DATABASE.md`), carica i `Docente` corrispondenti. Array vuoto se la colonna è vuota.

#### `getDocentiALT(classe: Classe): Docente[]`
Legge la colonna speciale `CLASSI.ALT` (vedi `01_SCHEMA_DATABASE.md`), carica i `Docente` corrispondenti. Array vuoto se la classe non prevede attività alternativa.

### Coordinatori e ruoli speciali

#### `getCoordinatori(classe: Classe): Docente[]`
Parsa il CSV in `CLASSI.COORD`, carica i `Docente`.

#### `setCoordinatori(classe: Classe, coordinatori: Docente[]): void`
Scrive il CSV nel campo `COORD`. Marca dirty.

#### `getDocentiRuolo(classe: Classe, nomeRuolo: string): Docente[]`
Legge il JSON `CLASSI.RUOLI`, parsa il valore corrispondente a `nomeRuolo` come CSV di email (anche se è una singola email), carica i `Docente` corrispondenti tramite `DocenteRepository` e li restituisce come array. Array vuoto se il ruolo non è configurato o il valore è null. **Metodo principale per tutti i ruoli.**

> **NOTA DI IMPLEMENTAZIONE:** Il caricamento dei `Docente` per email sfrutta la cache in sessione di `DocenteRepository`. Per ruoli con molti titolari (improbabile ma possibile), applicare comunque il pattern batch di `SheetDBLib` (L2) per evitare N chiamate sequenziali.

#### `getRuolo(classe: Classe, nomeRuolo: string): Docente | null`
Scorciatoia per `getDocentiRuolo(classe, nomeRuolo)[0] ?? null`. Usare esclusivamente per ruoli noti a titolare singolo (es. `SEGRETARIO`). Per ruoli a titolarità multipla (es. `TUTOR_ASL`) usare sempre `getDocentiRuolo()`.

#### `setDocentiRuolo(classe: Classe, nomeRuolo: string, docenti: Docente[]): void`
Aggiorna il JSON `RUOLI` impostando `ruoli[nomeRuolo]` al CSV delle email dei docenti forniti. Se `docenti` è un array vuoto, rimuove la chiave dal JSON. Marca dirty.

#### `setRuolo(classe: Classe, nomeRuolo: string, docente: Docente): void`
Scorciatoia per `setDocentiRuolo(classe, nomeRuolo, [docente])`. Usare solo per ruoli a titolare singolo.

### Gestione articolazione

#### `getArticolazione(classe: Classe): ArticolazioneConfig | null`
Parsa il JSON `CLASSI.ARTICOLAZIONE`, oppure `null`.

#### `isArticolata(classe: Classe): boolean`
`true` se `getArticolazione()` non è `null`.

#### `getClassePartner(classe: Classe): Classe | null`
Per una classe **partner** (es. `1F-LSO`): restituisce l'altro partner (es. `1F-LSS`).
Legge `getArticolazione()` e parsa il campo `partner` come singolo ClasseId.
Per la **classe parent**: restituisce `null` — usare `getClassiPartner()` invece.

#### `getClassiPartner(classe: Classe): Classe[]`
Per la **classe parent** (es. `1F`): restituisce entrambe le classi partner `[1F-LSO, 1F-LSS]`.
Parsa il campo `CLASSI.ARTICOLAZIONE.partners` come CSV di ClasseId.
Per classi **non articolate**: restituisce `[]`.

**Nota asimmetria:** `getClassiPartner()` DEVE essere chiamato ESCLUSIVAMENTE sulla classe parent. Chiamarlo su una classe partner non è un caso d'uso supportato e DEVE lanciare un'eccezione. Per ottenere il partner di una classe partner, usare SEMPRE `getClassePartner()`.

#### `getClasseParent(classe: Classe): Classe | null`
Come sopra per il parent.

#### `getGruppoArticolazione(classe: Classe): Classe[]`
Array contenente la classe stessa e tutte le correlate (parent + partner).

#### `getDocentiPerMateriaArticolata(classe: Classe, materia: MateriaId, indirizzoStudente?: IndirizzoId): Docente[]`
Risolve il docente corretto:
- Sigla indirizzo (es. `"LC"`) → usa la classe corrispondente a quell'indirizzo
- Se `config` è `null` → `getDocentiPerMateria(classe, materia)` (classe standard)

### Storico e studenti

#### `getStorico(classe: Classe): ClasseId[]`
Array di `ClasseId` dal CSV nel campo `STORICO`.

#### `getStudenti(classe: Classe, soloAttivi: boolean = false): Alunno[]`
Delega ad `AlunnoRepository.findByClasse()`, con filtro `ATTIVO` opzionale.

#### `getIndirizzo(classe: Classe): Indirizzo`
Restituisce l'`Indirizzo` della classe.

---

## 4. MateriaRepository

**Tabella:** `MATERIE` | **PK:** `ID` | **Cache:** completa, TTL infinito per sessione

#### `findEsamePrima(indirizzoId: IndirizzoId): Materia[]`
Filtra le materie con `isEsameIndirizzo(indirizzo, "prima") = true`.

#### `findEsameSeconda(indirizzoId: IndirizzoId): Materia[]`
Filtra le materie con `isEsameIndirizzo(indirizzo, "seconda") = true`.

---

## 5. IndirizzoRepository

**Tabella:** `INDIRIZZI` | **PK:** `ID` | **Cache:** completa

#### `findByTipo(tipo: TipoIstituto): Indirizzo[]`
Filtra per `TIPO = tipo`.

---

## 6. DipartimentoRepository

**Tabella:** `DIPART` | **PK:** `ID` | **Cache:** completa  
**Dipendenze:** `DocenteRepository`, `MateriaRepository`

#### `getCapo(dipartimento: Dipartimento): Docente`
Carica il `Docente` dal campo `CAPO`. Solleva `EntityNotFoundException` se non trovato.

#### `getDocenti(dipartimento: Dipartimento): Docente[]`
Delega a `DocenteRepository.findByDipartimento()`.

#### `getMaterie(dipartimento: Dipartimento): Materia[]`
Parsa il CSV in `MATERIE`, carica da `MateriaRepository`.

#### `setCapo(dipartimento: Dipartimento, docente: Docente): void`
Imposta `CAPO = docente.EMAIL`. Marca dirty.

---

## 7. RuoloSpecialeRepository

**Tabella:** `RUOLI` | **PK:** `ID` | **Cache:** completa  
**Dipendenze:** `DocenteRepository`

#### `findByDocente(docenteEmail: Email): RuoloSpeciale[]`
Filtra per `DOCENTE` contenente `docenteEmail` (ricerca per contenimento sul CSV, non uguaglianza esatta).

#### `getDocenti(ruolo: RuoloSpeciale): Docente[]`
Parsa il CSV nel campo `DOCENTE` e carica i `Docente` corrispondenti. Un ruolo può essere ricoperto da più docenti contemporaneamente.

#### `assegnaRuolo(ruoloId: string, docenti: Docente[]): void`
Carica il ruolo, imposta `DOCENTE` come CSV delle email dei docenti forniti, salva.

---

## 8. ConfigurazioneDocumentoRepository

**Tabella:** `CONF_DOC` | **PK:** `ID`

#### `findByTipo(tipo: TipoDocumento): ConfigurazioneDocumento[]`
Filtra per `TIPO = tipo`.

#### `shouldGenerate(config: ConfigurazioneDocumento, cdu: CDU, engine: ExpressionEngine): boolean`
Valuta la condizione in `CONDIZIONE`. Se null → `true`.

#### `getTemplateId(config: ConfigurazioneDocumento, cdu: CDU): string`
Restituisce l'ID template Drive. Eccezione se nessun template applicabile.

---

## 9. ConfigurazioneEmailRepository

**Tabella:** `CONF_MAIL` | **PK:** `ID`

#### `findByProcesso(processo: ProcessoInvio): ConfigurazioneEmail[]`
Filtra per `PROCESSO = processo`.

#### `getBoxes(config: ConfigurazioneEmail): BoxConfig[]`
Parsa il JSON `BOX_CFG`. Array vuoto se null.

---

## 10. ConfigurazioneImportRepository

**Tabella:** `CONF_IMP` | **PK:** `ID`

#### `findAttivi(): ConfigurazioneImport[]`
Filtra per `ATTIVO = true`.

#### `findByTarget(target: string): ConfigurazioneImport[]`
Filtra per `TARGET = target`.

---

## 11. CarenzaRepository

**Tabella:** `CARENZE` | **PK:** `(STUDENTE, PROGRESSIVO)` — composita  
**Dipendenze:** `MateriaRepository`, `AlunnoRepository`, `ClasseRepository`

> **Nota colonne dinamiche:** Come `ClasseRepository`, mantiene `_materieColumns: Map<MateriaId, string>` con i nomi delle colonne per ogni materia.

### Query dominio-specifiche

#### `findByAlunno(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[]`
Carenze dello studente, ordinate per `DATA DESC`. Con filtro opzionale per anno.

#### `findByClasse(classe: Classe, data?: Date): Carenza[]`
Carenze della classe. Se `data` è specificata, filtra per quella data esatta.

#### `findNonNotificate(): Carenza[]`
Carenze con `NOTIFICATO` null o vuoto.

### Accesso colonne dinamiche

#### `getCarenzePerMateria(carenza: Carenza): Map<MateriaId, ValoreCarenza>`
Itera `_materieColumns`. Per ogni materia con valore non vuoto nella riga, costruisce un `ValoreCarenza` (numerico → `VOTO`, testuale → `NOTA`).

Esempio:
```
CARENZE["5A"]["MAT"] = "4.5"    → ValoreCarenza { tipo: VOTO, valore: 4.5 }
CARENZE["5A"]["FIS"] = "Studio scarso" → ValoreCarenza { tipo: NOTA, valore: "Studio scarso" }
```

#### `setCarenzaMateria(carenza: Carenza, materia: MateriaId, valore: ValoreCarenza | null): void`
Scrive il valore nella colonna dinamica. Se `valore = null`, scrive stringa vuota. Marca dirty.

**Nota:** l'impostazione di `NOTIFICATO` è responsabilità del metodo di dominio `Carenza.notifica()` (vedi `04_DOMINIO_ENTITA.md`), che modifica lo stato in memoria; il repository non duplica questa logica e si limita a persistere via `save()`.

### Navigazione

#### `getAlunno(carenza: Carenza): Alunno`
Carica l'alunno dal campo `STUDENTE`.

#### `getClasse(carenza: Carenza): Classe`
Carica la classe dal campo `CLASSE`.

---

## 12. PianoRepository

**Tabella:** `PIANI` | **PK:** `(STUDENTE, TIPO)` — composita  
**Dipendenze:** `AlunnoRepository`

#### `findByAlunno(alunno: Alunno): Piano[]`
Tutti i piani dello studente.

#### `findByTipo(tipo: TipoPiano): Piano[]`
Piani del tipo specificato (su tutti gli alunni).

#### `getAlunno(piano: Piano): Alunno`
Carica lo studente titolare.

---

## 13. ProgettoRepository

**Tabella:** `PROGETTI` | **PK:** `(CLASSE, TIPO, NOME)` — composita  
**Dipendenze:** `ClasseRepository`

#### `findByClasse(classe: Classe): Progetto[]`
Progetti assegnati alla classe.

#### `findByTipo(tipo: TipoProgetto): Progetto[]`
Progetti del tipo specificato.

#### `getClasse(progetto: Progetto): Classe`
Classe assegnataria del progetto.

---

## 14. SupplenzaRepository

**Tabella:** `SUPPLENZE` | **PK:** `(TITOLARE, SUPPLENTE, DAL, CLASSI, MATERIE)` — composita  
`findById()` generico non è applicabile; usare `findSupplenzaSpecifica()` per la ricerca.  
**Dipendenze:** `DocenteRepository`  
**Cache:** supplenze attive oggi, TTL 1 ora

#### `findByTitolare(docente: Docente): Supplenza[]`
Tutte le supplenze in cui il docente è titolare.

#### `findBySupplente(docente: Docente): Supplenza[]`
Tutte le supplenze in cui il docente è supplente.

#### `findAttive(data: Date): Supplenza[]`
Supplenze con `DAL ≤ data ≤ AL`.

#### `findSupplenzaSpecifica(titolare: Docente, data: Date, classe?: ClasseId, materia?: MateriaId): Supplenza | null`
1. Carica supplenze attive per il titolare a quella data.
2. Per ognuna, verifica `applicaAClasse()` (se specificata) e `applicaAMateria()` (se specificata).
3. Restituisce la prima che supera tutti i filtri.

**Risoluzione a catena:** se la `Supplenza` trovata ha un `SUPPLENTE` che è a sua volta `TITOLARE` di un'altra supplenza attiva per lo stesso contesto e data, `findSupplenzaSpecifica` DEVE continuare la ricerca ricorsivamente (senza limite di profondità) finché non trova un supplente che non è sostituito da nessun altro. DEVE restituire SEMPRE la supplenza relativa al sostituto effettivo finale.

Esempio:
```
Input:  titolare = "dante@s.it", data = 15/11/2025
        classe = "5A", materia = "ITA"
        Supplenza: TITOLARE="dante@s.it", DAL=01/11, AL=30/11, CLASSI="5A,4B", MATERIE="*"
Output: Supplenza(...)   ← classe è nel CSV; materia è *
```

#### `creaSupplenza(titolare, supplente, dal, al, classi, materie): Supplenza`
Crea e salva una nuova supplenza. DEVE rispettare l'invariante: nessun periodo sovrapposto per lo stesso contesto classe+materia (in caso di violazione, NON DEVE creare la supplenza).

#### `getTitolare(supplenza: Supplenza): Docente`

#### `getSupplente(supplenza: Supplenza): Docente`

---

## 15. MovimentoAlunnoRepository

**Tabella:** `MOV_ALUNNI` | **PK:** `(STUDENTE, TIPO, DATA)` — composita  
**Dipendenze:** `AlunnoRepository`

#### `findByAlunno(alunno: Alunno): MovimentoAlunno[]`
Movimenti ordinati per `DATA DESC`.

#### `findByTipo(tipo: TipoMovimento): MovimentoAlunno[]`

#### `getAlunno(movimento: MovimentoAlunno): Alunno`

---

## 16. OreASLRepository

**Tabella:** `ASL` | **PK:** composta `(STUDENTE, ANNO)`  
**Dipendenze:** `AlunnoRepository`

#### `findByAlunno(alunno: Alunno): OreASL[]`
Ordinati per `ANNO DESC`.

#### `findByAnno(anno: AnnoScolastico): OreASL[]`
Tutti gli studenti per quell'anno.

#### `getOrCreate(alunno: Alunno, anno: AnnoScolastico): OreASL`
Restituisce il record esistente oppure crea un nuovo record con `ORE = 0`.

#### `getTotaleOre(alunno: Alunno): number`
Somma di tutte le ore di tutti gli anni dell'alunno.

#### `aggiungiOre(alunno: Alunno, anno: AnnoScolastico, ore: number): void`
Chiama `getOrCreate()`, incrementa `ORE`, salva.

---

## 17. LogDocumentoRepository

**Tabella:** `LOG_DOCS` | **PK:** `ID` (Drive File ID)  
**Dipendenze:** `ConfigurazioneDocumentoRepository`, `ClasseRepository`, `AlunnoRepository`, `DocenteRepository`

**Nota colonne CSV:** Le colonne `UTENTI` e `CLASSI` contengono valori separati da virgola. Le query di ricerca per email o classe singola usano ricerca per contenimento (CONTAINS), non per uguaglianza esatta.

#### `findByClasse(classe: Classe): LogDocumento[]`

#### `findByUtente(email: Email): LogDocumento[]`

#### `findByStato(stato: StatoDocumento): LogDocumento[]`

#### `findNonNotificati(): LogDocumento[]`
Documenti con `NOTIFICATO` null o vuoto.

#### `registraDocumento(driveFileId, configId, nome, path, link, options?): LogDocumento`
Crea il record con `STATO = GENERATO` e `DATA_CREAZ = now()`. `options` può contenere: `classe` (scrive in colonna `CLASSI`), `utente` (scrive in colonna `UTENTI`), `materia`, `sottotipo`.

#### `cambiaStato(logDoc: LogDocumento, nuovoStato: StatoDocumento): void`

**Nota:** l'impostazione di `NOTIFICATO` è responsabilità del metodo di dominio `LogDocumento.notifica()` (vedi `04_DOMINIO_ENTITA.md`); il repository non espone un metodo `notifica()` proprio.

#### `getClasse(logDoc: LogDocumento): Classe | null`

#### `getUtente(logDoc: LogDocumento): Alunno | Docente | null`
Tenta prima come Alunno, poi come Docente.

---

## 18. LogCartellaRepository

**Tabella:** `LOG_FOLD` | **PK:** `ID` (Drive Folder ID)

**Nota colonna CSV:** la colonna `CLASSI` contiene valori separati da virgola; la ricerca per singola classe avviene per contenimento (CONTAINS), non per uguaglianza esatta (stessa semantica di `LOG_DOCS.CLASSI`, vedi `01_SCHEMA_DATABASE.md`).

#### `findByClasse(classe: Classe): LogCartella[]`

#### `findByTipo(tipo: string): LogCartella[]`

#### `registraCartella(driveFolderId, tipo, nome, path, link, options?): LogCartella`

---

## 19. LogEmailRepository

**Tabella:** `LOG_MAIL` | **PK:** `(PATTERN, DESTINATARI, DATA)` — composita  
La ricerca per PK non è un'operazione standard; usare `findByPattern()` o `findByStato()`.  
**Dipendenze:** `ConfigurazioneEmailRepository`

#### `findByPattern(patternId: string): LogEmail[]`

#### `findByStato(stato: StatoEmail): LogEmail[]`

#### `findFailed(): LogEmail[]`
Email con `STATO = ERROR`.

#### `registraInvio(patternId, destinatari, stato, allegati?, errore?): LogEmail`
Scrive `DESTINATARI` come CSV delle email, `DATA = now()`.

---

## 20. VariazioneCattedraRepository

**Tabella:** `VARIAZIONI_CATTEDRA` | **PK:** `(CLASSE_ID, MATERIA_ID)` (composita)
**Dipendenze:** `ClasseRepository`, `MateriaRepository`, `DocenteRepository`

### Query dominio-specifiche

#### `findByClasse(classeId: ClasseId): VariazioneCattedra[]`
Cambi di titolarità che coinvolgono la classe indicata. `CLASSE_ID` è un CSV: la ricerca avviene per contenimento (CONTAINS), non per uguaglianza esatta — non è un lookup diretto su PK.

#### `findByMateria(materiaId: MateriaId): VariazioneCattedra[]`
Cambi di titolarità che coinvolgono la materia indicata. `MATERIA_ID` è un CSV: stessa logica di ricerca per contenimento.

#### `findVariazioneAttiva(classeId: ClasseId, materiaId: MateriaId): VariazioneCattedra | null`
Restituisce il cambio di titolarità per la coppia `(classe, materia)`, se esiste. Poiché `CLASSE_ID` e `MATERIA_ID` sono CSV che partecipano alla chiave primaria come testo grezzo (vedi `01_SCHEMA_DATABASE.md`), la ricerca è sempre per contenimento in memoria, mai un lookup diretto su PK. **Nota:** in teoria più righe `VARIAZIONI_CATTEDRA` potrebbero soddisfare contemporaneamente la stessa coppia `(classe, materia)` se i rispettivi CSV si sovrappongono; in tal caso il metodo DEVE restituire il primo match trovato. L'amministrazione dati DEVE evitare configurazioni con CSV sovrapposti per la stessa coppia classe/materia, poiché il sistema NON impone questo vincolo.
Usato dalla gerarchia di risoluzione ruoli al livello **Priority 2**.

#### `findByNuovoTitolare(email: Email): VariazioneCattedra[]`
Tutti i record in cui il docente ha acquisito la titolarità.
